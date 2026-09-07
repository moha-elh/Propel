using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator.Data;
using CV_Generator.Dto;
using CV_Generator.Models;
using CV_Generator.Services;
using CV_Generator.Services.AgentClients;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/direct-ai")]
public class DirectAiController : ControllerBase
{
    private readonly IDirectAiClient _client;
    private readonly ICurrentUserService _currentUser;
    private readonly IAgentLlmSettingsService _agentLlm;
    private readonly AppDbContext _db;
    private readonly ICategoryService _categoryService;

    public DirectAiController(
        IDirectAiClient client,
        ICurrentUserService currentUser,
        IAgentLlmSettingsService agentLlm,
        AppDbContext db,
        ICategoryService categoryService)
    {
        _client = client;
        _currentUser = currentUser;
        _agentLlm = agentLlm;
        _db = db;
        _categoryService = categoryService;
    }

    /// <summary>Generate a short outreach / application message (direct LLM call, OpenRouter-first).</summary>
    [HttpPost("message")]
    public async Task<IActionResult> Message([FromBody] DirectMessageRequestDto request)
    {
        await ResolveProviderAsync(request);
        if (string.IsNullOrWhiteSpace(request.CompanyName) && string.IsNullOrWhiteSpace(request.JobRole))
            return BadRequest(ApiResponse<object>.Error("Provide at least a company name or job role to compose a message around"));

        // Ground the draft in the candidate's real profile so the model can't invent a background
        // and can sign the message with the correct name/email/phone.
        var userId = _currentUser.UserId;
        if (string.IsNullOrWhiteSpace(request.CandidateContext) && userId != null)
            request.CandidateContext = await BuildCandidateContextAsync(userId.Value, request);

        var result = await _client.GenerateMessageAsync(request);
        if (result == null)
            return StatusCode(502, ApiResponse<object>.Error("AI assistant could not be reached"));

        return Ok(ApiResponse<DirectMessageResultDto>.Ok(result));
    }

    private async Task<string> BuildCandidateContextAsync(Guid userId, DirectMessageRequestDto request)
    {
        var sb = new StringBuilder();

        // Rank the user's catalog against the job via the taxonomy (deterministic keyword-only,
        // no LLM): skills/experiences/projects that match the job's category nodes come first,
        // ordered by matched-node count; anything left fills the cap from recency/alphabetical.
        var ranked = await _categoryService.SearchByTextAsync(
            userId,
            new List<string> { "skills", "experiences", "projects" },
            string.Join(" ", new[]
            {
                request.JobRole,
                request.CompanyName,
                request.JobDescription,
                string.Join(" ", request.RequiredSkills),
                string.Join(" ", request.Responsibilities),
            }));

        var score = ranked
            .GroupBy(r => r.SourceType.ToLowerInvariant())
            .ToDictionary(
                g => g.Key,
                g => (IReadOnlyDictionary<Guid, int>)g.ToDictionary(r => r.SourceId, r => r.Score));

        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId);
        if (user != null)
        {
            var name = $"{user.FirstName} {user.LastName}".Trim();
            if (!string.IsNullOrEmpty(name)) sb.AppendLine($"Name: {name}");
            if (!string.IsNullOrEmpty(user.Email)) sb.AppendLine($"Email: {user.Email}");
            if (!string.IsNullOrEmpty(user.PhoneNumber)) sb.AppendLine($"Phone: {user.PhoneNumber}");
        }

        var profile = await _db.CVProfiles.AsNoTracking()
            .Where(p => p.UserId == userId)
            .OrderByDescending(p => p.Id)
            .FirstOrDefaultAsync();
        if (profile != null)
        {
            if (!string.IsNullOrWhiteSpace(profile.Title)) sb.AppendLine($"Title/role: {profile.Title}");
            if (!string.IsNullOrWhiteSpace(profile.Summary)) sb.AppendLine($"Professional summary: {Truncate(profile.Summary, 600)}");
        }

        var skillScores = score.GetValueOrDefault("skills") ?? new Dictionary<Guid, int>();
        var skills = await _db.Skills.AsNoTracking()
            .Where(s => s.UserId == userId)
            .Select(s => new { s.Id, s.Name })
            .ToListAsync();
        var rankedSkills = skills
            .OrderByDescending(s => skillScores.GetValueOrDefault(s.Id))
            .ThenBy(s => s.Name)
            .Take(40)
            .Select(s => s.Name)
            .ToList();
        if (rankedSkills.Count > 0) sb.AppendLine("Skills: " + string.Join(", ", rankedSkills));

        var expScores = score.GetValueOrDefault("experiences") ?? new Dictionary<Guid, int>();
        var experiences = await _db.Experiences.AsNoTracking()
            .Where(e => e.UserId == userId)
            .OrderByDescending(e => e.StartDate)
            .Take(8)
            .Select(e => new { e.Id, e.Title, e.Company, e.Description, e.StartDate })
            .ToListAsync();
        foreach (var e in experiences
            .OrderByDescending(e => expScores.GetValueOrDefault(e.Id))
            .ThenByDescending(e => e.StartDate)
            .Take(4))
        {
            var line = e.Title + (string.IsNullOrEmpty(e.Company) ? "" : $" at {e.Company}");
            if (!string.IsNullOrWhiteSpace(e.Description)) line += $" — {Truncate(e.Description, 220)}";
            sb.AppendLine($"Experience: {line}");
        }

        var projectScores = score.GetValueOrDefault("projects") ?? new Dictionary<Guid, int>();
        var projects = await _db.Projects.AsNoTracking()
            .Where(p => p.UserId == userId)
            .OrderByDescending(p => p.StartDate)
            .Take(8)
            .Select(p => new { p.Id, p.Title, p.Role, p.Description, p.Achievements, p.StartDate })
            .ToListAsync();
        foreach (var p in projects
            .OrderByDescending(p => projectScores.GetValueOrDefault(p.Id))
            .ThenByDescending(p => p.StartDate)
            .Take(4))
        {
            var line = p.Title + (string.IsNullOrEmpty(p.Role) ? "" : $" ({p.Role})");
            var body = !string.IsNullOrWhiteSpace(p.Achievements) ? p.Achievements : p.Description;
            if (!string.IsNullOrWhiteSpace(body)) line += $" — {Truncate(body, 220)}";
            sb.AppendLine($"Project: {line}");
        }

        var educations = await _db.Educations.AsNoTracking()
            .Where(ed => ed.UserId == userId)
            .OrderByDescending(ed => ed.StartDate)
            .Take(3)
            .ToListAsync();
        foreach (var ed in educations)
        {
            var line = $"{ed.DegreeType} {ed.FieldOfStudy}".Trim();
            if (!string.IsNullOrWhiteSpace(ed.InstitutionName))
                line = (string.IsNullOrEmpty(line) ? "" : line + " — ") + ed.InstitutionName;
            if (!string.IsNullOrWhiteSpace(line)) sb.AppendLine($"Education: {line}");
        }

        var languages = await _db.Languages.AsNoTracking()
            .Where(l => l.UserId == userId)
            .Take(8)
            .Select(l => $"{l.Name} ({l.Level})")
            .ToListAsync();
        if (languages.Count > 0) sb.AppendLine("Languages: " + string.Join(", ", languages));

        return sb.ToString().Trim();
    }

    private static string Truncate(string text, int max)
    {
        text = text.ReplaceLineEndings(" ").Trim();
        if (text.Length <= max) return text;
        return text[..max].TrimEnd() + "…";
    }

    /// <summary>Generic direct chat call (OpenRouter-first). Used for other direct AI functionality.</summary>
    [HttpPost("chat")]
    public async Task<IActionResult> Chat([FromBody] DirectChatRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.User))
            return BadRequest(ApiResponse<object>.Error("Provide a prompt"));

        await ResolveProviderAsync(request);
        var result = await _client.ChatAsync(request);
        if (result == null)
            return StatusCode(502, ApiResponse<object>.Error("AI assistant could not be reached"));

        return Ok(ApiResponse<DirectChatResultDto>.Ok(result));
    }

    private async Task ResolveProviderAsync(object request)
    {
        var userId = _currentUser.UserId;
        string provider = "", model = "";
        if (userId != null)
        {
            var llm = await _agentLlm.GetProviderModelAsync(userId, "direct");
            provider = llm.Provider ?? "";
            model = llm.Model ?? "";
        }

        // Only override when the caller didn't already pin provider/model, and a
        // saved per-user override exists. Otherwise let the sidecar default to
        // OpenRouter-first via its own provider priority.
        switch (request)
        {
            case DirectMessageRequestDto m:
                m.Provider ??= string.IsNullOrWhiteSpace(provider) ? null : provider;
                m.Model ??= string.IsNullOrWhiteSpace(model) ? null : model;
                break;
            case DirectChatRequestDto c:
                c.Provider ??= string.IsNullOrWhiteSpace(provider) ? null : provider;
                c.Model ??= string.IsNullOrWhiteSpace(model) ? null : model;
                break;
        }
    }
}
