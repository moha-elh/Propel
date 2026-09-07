using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator.Data;
using CV_Generator.Dto;
using CV_Generator.Models;
using CV_Generator.Services;
using CV_Generator.Services.AgentClients;

namespace CV_Generator.Controllers;

[Route("api/company-research")]
public class CompanyResearchController : BaseApiController
{
    private static readonly string[] AllDataTypes = ["emails", "phones", "social", "address", "about", "facts"];

    private readonly AppDbContext _db;
    private readonly ILogger<CompanyResearchController> _logger;
    private readonly ICompanyResearchClient _client;
    private readonly IAgentLlmSettingsService _agentLlm;

    public CompanyResearchController(
        ICurrentUserService currentUser,
        AppDbContext db,
        ILogger<CompanyResearchController> logger,
        ICompanyResearchClient client,
        IAgentLlmSettingsService agentLlm)
        : base(currentUser)
    {
        _db = db;
        _logger = logger;
        _client = client;
        _agentLlm = agentLlm;
    }

    /// <summary>
    /// Enrich a company from its homepage: crawl + LLM-extract emails, phones, social
    /// links, address, about, facts. Only companies with a WebsiteUrl can be researched
    /// (no search-engine fallback by design). Provenance is recorded as "web-research".
    /// </summary>
    [HttpPost("research")]
    public async Task<IActionResult> Research([FromBody] CompanyResearchRequestDto dto)
    {
        if (dto.CompanyId == Guid.Empty)
            return BadRequest(ApiResponse<CompanyDto>.Error("Company id is required"));

        var userId = GetUserId();
        var company = await _db.Companies.FirstOrDefaultAsync(c => c.Id == dto.CompanyId && c.UserId == userId);
        if (company is null)
            return NotFound(ApiResponse<CompanyDto>.Error("Company not found"));

        var dataTypes = SanitizeDataTypes(dto.DataTypes);
        if (dataTypes.Count == 0)
            return BadRequest(ApiResponse<CompanyDto>.Error("Select at least one data type to research"));

        if (string.IsNullOrWhiteSpace(company.WebsiteUrl))
            return BadRequest(ApiResponse<CompanyDto>.Error(
                $"{company.Name} has no website saved — add a Website URL first (edit the company) before researching it."));

        // Per-user agent LLM override (falls back to the sidecar's OpenRouter-first default).
        string provider = "", model = "";
        var llm = await _agentLlm.GetProviderModelAsync(userId, "company_research");
        provider = llm.Provider ?? "";
        model = llm.Model ?? "";

        CompanyResearchResultDto? result;
        try
        {
            result = await _client.ResearchAsync(
                company,
                dataTypes,
                string.IsNullOrWhiteSpace(provider) ? null : provider,
                string.IsNullOrWhiteSpace(model) ? null : model);
        }
        catch (Exception e)
        {
            _logger.LogWarning(e, "Company research failed for company {Company}", company.Name);
            return StatusCode(502, ApiResponse<CompanyDto>.Error($"Research failed: {e.Message}"));
        }

        if (result is null)
            return StatusCode(502, ApiResponse<CompanyDto>.Error("Research service could not be reached"));

        ApplyResult(company, result, dataTypes);
        company.ResearchSource = "web-research";
        company.ResearchLink = result.SourceUrl;
        company.ResearchUpdatedAt = DateTime.UtcNow;
        company.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();

        var dtoOut = Map(company);
        (dtoOut.ApplicationsCount, dtoOut.LastAppliedAt) = await GetCompanyStatsAsync(userId, company.Name);
        dtoOut.ContactsCount = await _db.Contacts.CountAsync(co =>
            co.UserId == userId && co.Company != null &&
            co.Company.Trim().ToLower() == company.Name.Trim().ToLower());

        var message = result.Error != null
            ? $"Web research finished, but {result.Error.ToLowerInvariant()}"
            : $"{company.Name} enriched from its website";
        return Ok(ApiResponse<CompanyDto>.Ok(dtoOut, message));
    }

    private static List<string> SanitizeDataTypes(List<string>? requested)
    {
        if (requested == null || requested.Count == 0)
            return AllDataTypes.ToList();
        var set = requested
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Trim().ToLowerInvariant())
            .Where(t => AllDataTypes.Contains(t))
            .ToHashSet();
        return set.Count == 0 ? AllDataTypes.ToList() : AllDataTypes.Where(set.Contains).ToList();
    }

    private static void ApplyResult(Company company, CompanyResearchResultDto result, List<string> dataTypes)
    {
        if (dataTypes.Contains("emails"))
            company.EmailsJson = CompanyResearchJson.SerializeList(result.Emails);
        if (dataTypes.Contains("phones"))
            company.PhonesJson = CompanyResearchJson.SerializeList(result.Phones);
        if (dataTypes.Contains("social"))
            company.SocialLinksJson = CompanyResearchJson.SerializeSocialLinks(result.SocialLinks);
        if (dataTypes.Contains("address"))
            company.Address = string.IsNullOrWhiteSpace(result.Address) ? null : result.Address.Trim();
        if (dataTypes.Contains("about"))
            company.Description = string.IsNullOrWhiteSpace(result.About) ? null : result.About.Trim();
        if (dataTypes.Contains("facts"))
            company.CompanyFactsJson = CompanyResearchJson.SerializeList(result.CompanyFacts);
    }

    private static CompanyDto Map(Company c) => new()
    {
        Id = c.Id,
        UserId = c.UserId,
        Name = c.Name,
        WebsiteUrl = c.WebsiteUrl,
        Location = c.Location,
        Country = c.Country,
        LocationUrl = c.LocationUrl,
        Region = c.Region,
        Sector = c.Sector,
        FoundedYear = c.FoundedYear,
        LinkedInUrl = c.LinkedInUrl,
        Size = c.Size,
        LogoImageId = c.LogoImageId,
        LogoUrl = c.LogoUrl,
        Note = c.Note,
        Description = c.Description,
        Address = c.Address,
        Emails = CompanyResearchJson.ParseList(c.EmailsJson),
        Phones = CompanyResearchJson.ParseList(c.PhonesJson),
        SocialLinks = CompanyResearchJson.ParseSocialLinks(c.SocialLinksJson),
        CompanyFacts = CompanyResearchJson.ParseList(c.CompanyFactsJson),
        ResearchSource = c.ResearchSource,
        ResearchLink = c.ResearchLink,
        ResearchUpdatedAt = c.ResearchUpdatedAt,
        CreatedAt = c.CreatedAt,
        UpdatedAt = c.UpdatedAt
    };

    /// <summary>Application count + last applied date for one company (normalized name match).</summary>
    private async Task<(int Count, DateTime? Last)> GetCompanyStatsAsync(Guid userId, string companyName)
    {
        var key = companyName.Trim().ToLower();
        var query = _db.Applications.AsNoTracking()
            .Where(a => a.CandidateId == userId && a.CompanyName.Trim().ToLower() == key);

        var count = await query.CountAsync();
        var last = await query.MaxAsync(a => (DateTime?)a.AppliedAt);

        return (count, last);
    }
}