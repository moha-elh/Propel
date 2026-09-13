using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using CV_Generator.Dto;
using CV_Generator.Models;
using CV_Generator.Services.AgentClients;
using CV_Generator.Data;

namespace CV_Generator.Services;

public class WorkflowExecutionService
{
    private readonly AppDbContext _db;
    private readonly IJobExtractorClient _jobExtractor;
    private readonly ISearchAgentClient _searchAgent;
    private readonly ITemplateAgentClient _templateAgent;
    private readonly IContactAgentClient _contactAgent;
    private readonly IGmailSendService _gmailSend;
    private readonly IAgentLlmSettingsService _agentLlm;
    private readonly ILogger<WorkflowExecutionService> _logger;

    private static readonly StepDefinition[] PipelineSteps =
    {
        new(0, "Job Extraction"),
        new(1, "Profile Matching"),
        new(2, "Template Rendering"),
        new(3, "Email Delivery"),
    };

    public WorkflowExecutionService(
        AppDbContext db,
        IJobExtractorClient jobExtractor,
        ISearchAgentClient searchAgent,
        ITemplateAgentClient templateAgent,
        IContactAgentClient contactAgent,
        IGmailSendService gmailSend,
        IAgentLlmSettingsService agentLlm,
        ILogger<WorkflowExecutionService> logger)
    {
        _db = db;
        _jobExtractor = jobExtractor;
        _searchAgent = searchAgent;
        _templateAgent = templateAgent;
        _contactAgent = contactAgent;
        _gmailSend = gmailSend;
        _agentLlm = agentLlm;
        _logger = logger;
    }

    public async Task ExecutePipelineAsync(Guid runId, CancellationToken ct)
    {
        var run = await _db.CvGenerationRuns.FindAsync(new object[] { runId }, ct);
        if (run == null)
        {
            _logger.LogWarning("Run {RunId} not found", runId);
            return;
        }

        var extractorLlm = await _agentLlm.GetProviderModelAsync(run.UserId, "job-extractor", ct);
        var templateLlm = await _agentLlm.GetProviderModelAsync(run.UserId, "template-agent", ct);
        var contactLlm = await _agentLlm.GetProviderModelAsync(run.UserId, "contact-agent", ct);

        run.Status = "running";
        run.CurrentStep = 0;
        run.StepStatuses = JsonSerializer.Serialize(PipelineSteps.Select(s => new StepStatusDto
        {
            Step = s.Index,
            Name = s.Name,
            Status = "pending"
        }).ToList());
        await _db.SaveChangesAsync(ct);

        try
        {
            ct.ThrowIfCancellationRequested();

            // Step 0: Job Extraction
            await ExecuteStepAsync(run, 0, ct, async () =>
            {
                var result = await _jobExtractor.ExtractAsync(
                    new ExtractorInput
                    {
                        JobDescription = run.JobDescription,
                        Language = run.Language ?? "en",
                        Provider = extractorLlm.Provider,
                        Model = extractorLlm.Model,
                    }, ct);
                run.ExtractionResult = JsonSerializer.Serialize(result);
            });

            ct.ThrowIfCancellationRequested();

            // Step 1: Profile Matching
            await ExecuteStepAsync(run, 1, ct, async () =>
            {
                var jobData = JsonSerializer.Deserialize<ExtractorOutput>(run.ExtractionResult ?? "{}");
                if (jobData != null)
                {
                    if (jobData.ExtractedSkills.Count == 0 && jobData.RequiredSkills.Count > 0)
                        jobData.ExtractedSkills = jobData.RequiredSkills;
                }
                var result = await _searchAgent.MatchAsync(
                    new SearchInput { UserId = run.UserId, JobRequirements = jobData ?? new() }, ct);
                run.SearchResult = JsonSerializer.Serialize(result);
            });

            ct.ThrowIfCancellationRequested();

            // Step 2: Template Rendering — generate first CV from matched profile
            await ExecuteStepAsync(run, 2, ct, async () =>
            {
                var searchData = JsonSerializer.Deserialize<SearchOutput>(run.SearchResult ?? "{}");
                var jobData = JsonSerializer.Deserialize<ExtractorOutput>(run.ExtractionResult ?? "{}");
                if (jobData != null && jobData.ExtractedSkills.Count == 0 && jobData.RequiredSkills.Count > 0)
                    jobData.ExtractedSkills = jobData.RequiredSkills;
                var targetRole = jobData?.JobRole ?? "Professional";

                var user = await _db.Users.FindAsync(new object[] { run.UserId }, ct);
                var locationParts = new List<string>();
                if (!string.IsNullOrWhiteSpace(user?.City)) locationParts.Add(user.City);
                if (!string.IsNullOrWhiteSpace(user?.Country)) locationParts.Add(user.Country);

                var templateId = run.TemplateId ?? "default";
                var templateContent = await ResolveTemplateContentAsync(templateId, run.UserId, ct);

                var result = await _templateAgent.RenderAsync(new TemplateInput
                {
                    CvDraft = new Dictionary<string, object>
                    {
                        ["user_id"] = run.UserId,
                        ["target_role"] = targetRole,
                        ["summary"] = $"Professional summary for {run.CandidateName ?? user?.FirstName ?? "Candidate"}",
                        ["job_data"] = jobData != null ? JsonSerializer.Serialize(jobData) : "",
                        ["language"] = run.Language ?? "en",
                        ["tone"] = run.Tone ?? "professional",
                        ["profile"] = new Dictionary<string, object?>
                        {
                            ["name"] = $"{user?.FirstName} {user?.LastName}".Trim(),
                            ["headline"] = user?.Headline,
                            ["bio"] = user?.Bio,
                            ["location"] = string.Join(", ", locationParts),
                            ["email"] = user?.Email,
                            ["phone"] = user?.PhoneNumber
                        },
                        ["matched_skills"] = searchData?.MatchedSkills ?? new List<object>(),
                        ["matched_experiences"] = searchData?.MatchedExperiences ?? new List<object>(),
                        ["matched_projects"] = searchData?.MatchedProjects ?? new List<object>(),
                        ["gap_skills"] = searchData?.GapSkills ?? new List<string>()
                    },
                    TemplateId = templateId,
                    TemplateContent = templateContent,
                    TemplateType = "latex",
                    TargetRole = targetRole,
                    Provider = templateLlm.Provider,
                    Model = templateLlm.Model,
                }, ct);
                run.RenderResult = JsonSerializer.Serialize(result);

                // Best-effort PDF: LaTeX compilation shells out to a dockerized
                // texlive and only works in native dev — it's absent in the
                // containerized agents image (see agents/Dockerfile). Don't fail
                // the whole run when it's unavailable; leave file_path empty.
                var filePath = "";
                try
                {
                    var pdf = await _templateAgent.CompilePdfAsync(new PdfInput
                    {
                        UserId = run.UserId.ToString(),
                        WorkflowId = run.Id.ToString(),
                        CvData = result?.CvCode ?? "",
                        CvDataFormat = "tex",
                        TemplateId = templateId,
                        TemplateName = templateId,
                        TemplateContent = templateContent,
                        FileName = $"{(run.CandidateName ?? "cv").Replace(' ', '_')}.pdf",
                        Language = run.Language ?? "English",
                        Tone = run.Tone ?? "professional",
                        Provider = templateLlm.Provider,
                        Model = templateLlm.Model,
                    }, ct);
                    filePath = pdf?.FilePath ?? "";
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Run {RunId}: PDF compilation unavailable; continuing with .tex only", run.Id);
                }

                // ATS score = the profile/job match computed in step 1 (0..1 → %).
                // ponytail: match-score proxy, swap for a dedicated ATS pass if the product needs one.
                var atsScore = (int)Math.Round(Math.Clamp(searchData?.MatchScore ?? 0, 0, 1) * 100);
                run.OptimizationResult = JsonSerializer.Serialize(new OptimizerOutput
                {
                    AtsScoreBefore = atsScore,
                    AtsScoreAfter = atsScore,
                    Improvement = 0,
                    FilePath = filePath,
                });
            });

            ct.ThrowIfCancellationRequested();

            // Step 3: Email Delivery — generate the email copy, then actually send it.
            await ExecuteStepAsync(run, 3, ct, async () =>
            {
                var optimizedCv = JsonSerializer.Deserialize<OptimizerOutput>(run.OptimizationResult ?? "{}");
                var jobData = JsonSerializer.Deserialize<ExtractorOutput>(run.ExtractionResult ?? "{}");

                if (string.IsNullOrWhiteSpace(run.RecipientEmail))
                    throw new InvalidOperationException("No recipient email set for this run; cannot send.");

                // 1. Contact agent generates the subject + body.
                var email = await _contactAgent.GenerateAsync(new ContactInput
                {
                    UserId = run.UserId.ToString(),
                    CompanyName = jobData?.EnterpriseName ?? "the company",
                    JobTitle = jobData?.JobRole ?? "Job Opportunity",
                    JobDescription = run.JobDescription,
                    Language = run.Language ?? "English",
                    Provider = contactLlm.Provider,
                    Model = contactLlm.Model,
                }, ct);

                var subject = run.EmailSubject ?? email?.Subject ?? "Job Application";
                var body = email?.Body ?? "";

                // 2. Send via the user's Gmail, attaching the CV PDF when one was produced.
                var pdfUrl = string.IsNullOrWhiteSpace(optimizedCv?.FilePath) ? null : optimizedCv!.FilePath;
                var (messageId, _) = await _gmailSend.SendWithAttachmentAsync(
                    run.UserId, run.RecipientEmail!, subject, body, pdfUrl);

                run.DeliveryResult = JsonSerializer.Serialize(new ContactOutput
                {
                    Success = true,
                    DeliveryId = messageId ?? "",
                    SentAt = DateTime.UtcNow,
                    SubjectUsed = subject,
                });
            });

            run.Status = "completed";
            run.CompletedAt = DateTime.UtcNow;
            _logger.LogInformation("Run {RunId} completed successfully", runId);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            run.Status = "cancelled";
            run.CancelledAt = DateTime.UtcNow;
            run.ErrorMessage = "Cancelled by user";
            _logger.LogInformation("Run {RunId} was cancelled via token", runId);
        }
        catch (Exception ex)
        {
            run.Status = "failed";
            run.ErrorMessage = ex.ToString();
            _logger.LogError(ex, "Run {RunId} failed", runId);
        }

        await _db.SaveChangesAsync(ct);
    }

    private async Task ExecuteStepAsync(CvGenerationRun run, int stepIndex, CancellationToken ct, Func<Task> action)
    {
        var stepName = PipelineSteps[stepIndex].Name;
        _logger.LogInformation("Step {Index}: {Name} — starting", stepIndex, stepName);

        var steps = JsonSerializer.Deserialize<List<StepStatusDto>>(run.StepStatuses ?? "[]")!;
        steps[stepIndex].Status = "running";
        steps[stepIndex].StartedAt = DateTime.UtcNow;
        run.StepStatuses = JsonSerializer.Serialize(steps);
        run.CurrentStep = stepIndex;
        await _db.SaveChangesAsync(ct);

        var startedAt = DateTime.UtcNow;

        try
        {
            await action();

            var duration = DateTime.UtcNow - startedAt;
            steps[stepIndex].Status = "completed";
            steps[stepIndex].CompletedAt = DateTime.UtcNow;
            steps[stepIndex].DurationMs = (long)duration.TotalMilliseconds;
            run.StepStatuses = JsonSerializer.Serialize(steps);
            await _db.SaveChangesAsync(ct);

            _logger.LogInformation("Step {Index}: {Name} — completed in {DurationMs}ms",
                stepIndex, stepName, steps[stepIndex].DurationMs);
        }
        catch (OperationCanceledException)
        {
            steps[stepIndex].Status = "cancelled";
            steps[stepIndex].Error = "Cancelled";
            run.StepStatuses = JsonSerializer.Serialize(steps);
            await _db.SaveChangesAsync(ct);
            throw;
        }
        catch (Exception ex)
        {
            var duration = DateTime.UtcNow - startedAt;
            steps[stepIndex].Status = "failed";
            steps[stepIndex].CompletedAt = DateTime.UtcNow;
            steps[stepIndex].DurationMs = (long)duration.TotalMilliseconds;
            steps[stepIndex].Error = ex.Message;
            run.StepStatuses = JsonSerializer.Serialize(steps);
            await _db.SaveChangesAsync(ct);
            throw;
        }
    }

    private record StepDefinition(int Index, string Name);

    private async Task<string?> ResolveTemplateContentAsync(string templateId, Guid userId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(templateId) || string.Equals(templateId, "default", StringComparison.OrdinalIgnoreCase))
            return null;

        // Custom/user templates are selected by Guid id; system templates carry the fixed seeded id.
        var template = Guid.TryParse(templateId, out var id)
            ? await _db.CvTemplates.FirstOrDefaultAsync(t => t.Id == id && (t.IsSystem || t.UserId == userId), ct)
            : await _db.CvTemplates.FirstOrDefaultAsync(t => t.Name == templateId && (t.IsSystem || t.UserId == userId), ct);

        return template?.Content;
    }
}
