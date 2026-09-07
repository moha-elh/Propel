using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using CV_Generator.Data;
using CV_Generator.Dto;
using CV_Generator.Models;
using CV_Generator.Services.AgentClients;

namespace CV_Generator.Services;

public class TemplateRenderService
{
    private static readonly StepDefinition[] PipelineSteps =
    {
        new(0, "Profile Matching"),
        new(1, "Template Rendering"),
        new(2, "PDF & Save"),
    };

    private readonly AppDbContext _db;
    private readonly ISearchAgentClient _searchAgent;
    private readonly ITemplateAgentClient _templateAgent;
    private readonly IMinioStorageService _storage;
    private readonly IAgentLlmSettingsService _agentLlm;
    private readonly ILogger<TemplateRenderService> _logger;

    public TemplateRenderService(
        AppDbContext db,
        ISearchAgentClient searchAgent,
        ITemplateAgentClient templateAgent,
        IMinioStorageService storage,
        IAgentLlmSettingsService agentLlm,
        ILogger<TemplateRenderService> logger)
    {
        _db = db;
        _searchAgent = searchAgent;
        _templateAgent = templateAgent;
        _storage = storage;
        _agentLlm = agentLlm;
        _logger = logger;
    }

    public async Task ExecutePipelineAsync(Guid runId, CancellationToken ct)
    {
        var run = await _db.TemplateRenderRuns.FindAsync(new object[] { runId }, ct);
        if (run == null)
        {
            _logger.LogWarning("Template render run {RunId} not found", runId);
            return;
        }

        var templateLlm = await _agentLlm.GetProviderModelAsync(run.UserId, "template-agent", ct);

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

            // Snapshot the extraction output so status/results are self-contained.
            var extraction = await LoadExtractionAsync(run, ct);

            ct.ThrowIfCancellationRequested();

            // Step 0: Profile Matching — feed the extraction output into the search agent
            await ExecuteStepAsync(run, 0, ct, async () =>
            {
                var result = await _searchAgent.MatchAsync(new SearchInput
                {
                    UserId = run.UserId,
                    JobRequirements = MapToJobRequirements(extraction)
                }, ct);
                run.SearchResult = JsonSerializer.Serialize(result);
                _logger.LogInformation("Run {RunId}: match_score={Score}, gap_skills={Gaps}",
                    run.Id, result?.MatchScore, result?.GapSkills.Count);
            });

            ct.ThrowIfCancellationRequested();

            // Step 1: Template Rendering — generate the LaTeX from template content + conditions
            string tex;
            await ExecuteStepAsync(run, 1, ct, async () =>
            {
                var searchData = JsonSerializer.Deserialize<SearchOutput>(run.SearchResult ?? "{}");
                var targetRole = extraction.JobRole ?? "Professional";

                var user = await _db.Users.FindAsync(new object[] { run.UserId }, ct);
                var locationParts = new List<string>();
                if (!string.IsNullOrWhiteSpace(user?.City)) locationParts.Add(user.City);
                if (!string.IsNullOrWhiteSpace(user?.Country)) locationParts.Add(user.Country);

                var templateContent = await ResolveTemplateContentAsync(run.TemplateId, run.UserId, ct);

                var result = await _templateAgent.RenderAsync(new TemplateInput
                {
                    CvDraft = new Dictionary<string, object>
                    {
                        ["user_id"] = run.UserId,
                        ["target_role"] = targetRole,
                        ["summary"] = $"Professional summary for {user?.FirstName ?? "Candidate"}",
                        ["job_data"] = JsonSerializer.Serialize(extraction),
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
                    TemplateId = run.TemplateId ?? "default",
                    TemplateContent = templateContent,
                    TemplateType = "latex",
                    TargetRole = targetRole,
                    Provider = templateLlm.Provider,
                    Model = templateLlm.Model,
                }, ct);
                run.RenderResult = JsonSerializer.Serialize(result);
                tex = result?.CvCode ?? "";
            });

            ct.ThrowIfCancellationRequested();

            // Step 2: Compile PDF + optionally save to Documents
            await ExecuteStepAsync(run, 2, ct, async () =>
            {
                var photoUser = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == run.UserId, ct);
                var pdf = await _templateAgent.CompilePdfAsync(new PdfInput
                {
                    UserId = run.UserId.ToString(),
                    WorkflowId = run.Id.ToString(),
                    CvData = run.RenderResult is null ? "" : ExtractTex(run.RenderResult),
                    CvDataFormat = "tex",
                    TemplateId = run.TemplateId ?? "default",
                    TemplateName = run.TemplateId,
                    TemplateContent = await ResolveTemplateContentAsync(run.TemplateId, run.UserId, ct),
                    FileName = $"cv-{Guid.NewGuid():N}.pdf",
                    Language = run.Language ?? "en",
                    Tone = run.Tone ?? "professional",
                    Provider = templateLlm.Provider,
                    Model = templateLlm.Model,
                    PhotoKey = photoUser?.ProfilePhotoKey,
                }, ct);

                if (pdf == null || string.IsNullOrWhiteSpace(pdf.FilePath))
                {
                    throw new InvalidOperationException("Template agent returned no PDF file path");
                }

                run.PdfUrl = pdf.FilePath;

                if (run.SaveToDocuments)
                {
                    await SaveToDocumentsAsync(run, extraction, pdf.FilePath, ct);
                }

                _logger.LogInformation("Run {RunId}: PDF ready ({Size} bytes) saved={Saved}",
                    run.Id, pdf.FileSize, run.SaveToDocuments);
            });

            run.Status = "completed";
            run.CompletedAt = DateTime.UtcNow;
            _logger.LogInformation("Template render run {RunId} completed successfully", runId);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested)
        {
            run.Status = "cancelled";
            run.CancelledAt = DateTime.UtcNow;
            run.ErrorMessage = "Cancelled by user";
            _logger.LogInformation("Template render run {RunId} was cancelled via token", runId);
        }
        catch (Exception ex)
        {
            run.Status = "failed";
            run.ErrorMessage = ex.ToString();
            _logger.LogError(ex, "Template render run {RunId} failed", runId);
        }

        await _db.SaveChangesAsync(ct);
    }

    private async Task<ExtractionFullResult> LoadExtractionAsync(TemplateRenderRun run, CancellationToken ct)
    {
        var entity = await _db.JobExtractions.FindAsync(new object[] { run.ExtractionId }, ct);
        if (entity == null || string.IsNullOrWhiteSpace(entity.OutputJson))
        {
            throw new InvalidOperationException($"Job extraction {run.ExtractionId} not found");
        }

        var extraction = JsonSerializer.Deserialize<ExtractionFullResult>(entity.OutputJson)
            ?? new ExtractionFullResult();

        // Keep a self-contained snapshot (also exposed to the client).
        if (string.IsNullOrWhiteSpace(run.ExtractionJson))
        {
            run.ExtractionJson = JsonSerializer.Serialize(extraction);
            await _db.SaveChangesAsync(ct);
        }

        _logger.LogInformation("Run {RunId}: extraction '{Role}' at '{Company}' (confidence {Confidence:P0})",
            run.Id, extraction.JobRole, extraction.EnterpriseName, extraction.OverallConfidence);
        return extraction;
    }

    private static JobRequirements MapToJobRequirements(ExtractionFullResult ex) => new()
    {
        JobRole = ex.JobRole,
        ExtractedSkills = (ex.RequiredSkills ?? new()).Distinct().ToList(),
        RequiredExperienceYears = ex.RequiredExperienceYears.HasValue
            ? (int)Math.Round(ex.RequiredExperienceYears.GetValueOrDefault())
            : null,
        Keywords = (ex.Responsibilities ?? new())
            .Concat(ex.RequiredSkills ?? new())
            .Concat(ex.Certifications ?? new())
            .Distinct()
            .ToList(),
        SeniorityLevel = ex.SeniorityLevel,
        EmploymentType = ex.EmploymentType,
        LocationType = ex.LocationType,
        Responsibilities = ex.Responsibilities ?? new(),
        Certifications = ex.Certifications ?? new()
    };

    private async Task<string?> ResolveTemplateContentAsync(string? templateId, Guid userId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(templateId) || string.Equals(templateId, "default", StringComparison.OrdinalIgnoreCase))
            return null;

        var template = Guid.TryParse(templateId, out var id)
            ? await _db.CvTemplates.FirstOrDefaultAsync(t => t.Id == id && (t.IsSystem || t.UserId == userId), ct)
            : await _db.CvTemplates.FirstOrDefaultAsync(t => t.Name == templateId && (t.IsSystem || t.UserId == userId), ct);

        return template?.Content;
    }

    private async Task SaveToDocumentsAsync(TemplateRenderRun run, ExtractionFullResult extraction, string pdfUrl, CancellationToken ct)
    {
        var defaultTitle = $"{extraction.JobRole ?? "Generated"} @ {extraction.EnterpriseName ?? "Company"}";
        var title = string.IsNullOrWhiteSpace(run.Title) ? defaultTitle : run.Title.Trim();
        if (title.Length > 200) title = title[..200];

        var cv = new Cv
        {
            Id = Guid.NewGuid(),
            UserId = run.UserId,
            Title = title,
            TemplateId = run.TemplateId ?? "default",
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        _db.Cvs.Add(cv);
        await _db.SaveChangesAsync(ct);

        // Store the LaTeX source alongside the compiled PDF.
        string? texUrl = null;
        var tex = ExtractTex(run.RenderResult ?? "{}");
        if (!string.IsNullOrEmpty(tex))
        {
            var texKey = $"{run.UserId}/{cv.Id}/{Guid.NewGuid():N}.tex";
            var texBytes = Encoding.UTF8.GetBytes(tex);
            await using var texStream = new MemoryStream(texBytes);
            texUrl = await _storage.UploadAsync("cv-artifacts", texKey, texStream, "application/x-tex", texBytes.Length, ct);
        }

        var version = new CvVersion
        {
            Id = Guid.NewGuid(),
            CvId = cv.Id,
            VersionNumber = 1,
            Label = "AI Generated",
            FileUrl = texUrl,
            PdfUrl = pdfUrl,
            ThumbnailUrl = null,
            ContentJson = "{}",
            CreatedAt = DateTime.UtcNow
        };
        _db.CvVersions.Add(version);
        await _db.SaveChangesAsync(ct);

        run.CvId = cv.Id;
        run.CvVersionId = version.Id;
        await _db.SaveChangesAsync(ct);

        _logger.LogInformation("Run {RunId}: saved CV {CvId} version {VersionId}", run.Id, cv.Id, version.Id);
    }

    private static string ExtractTex(string renderJson)
    {
        try
        {
            using var doc = JsonDocument.Parse(renderJson);
            if (doc.RootElement.TryGetProperty("cv_code", out var code))
                return code.GetString() ?? "";
        }
        catch
        {
            // fall through
        }
        return "";
    }

    private async Task ExecuteStepAsync(TemplateRenderRun run, int stepIndex, CancellationToken ct, Func<Task> action)
    {
        var stepName = PipelineSteps[stepIndex].Name;
        _logger.LogInformation("Run {RunId}: step {Index} '{Name}' — starting", run.Id, stepIndex, stepName);

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

            _logger.LogInformation("Run {RunId}: step {Index} '{Name}' — completed in {DurationMs}ms",
                run.Id, stepIndex, stepName, steps[stepIndex].DurationMs);
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
}