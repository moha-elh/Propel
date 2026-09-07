namespace CV_Generator.Dto;

public class CompanySocialLinkDto
{
    public string Key { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
}

public class CompanyDto
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? WebsiteUrl { get; set; }
    public string? Location { get; set; }
    public string Country { get; set; } = "Morocco";
    public string? LocationUrl { get; set; }
    public string? Region { get; set; }
    public string? Sector { get; set; }
    public int? FoundedYear { get; set; }
    public string? LinkedInUrl { get; set; }
    public string? Size { get; set; }
    public Guid? LogoImageId { get; set; }
    public string? LogoUrl { get; set; }
    public string? Note { get; set; }
    public string? Description { get; set; }
    public string? Address { get; set; }
    public List<string> Emails { get; set; } = [];
    public List<string> Phones { get; set; } = [];
    public List<CompanySocialLinkDto> SocialLinks { get; set; } = [];
    public List<string> CompanyFacts { get; set; } = [];
    public string? ResearchSource { get; set; }
    public string? ResearchLink { get; set; }
    public DateTime? ResearchUpdatedAt { get; set; }
    public int ApplicationsCount { get; set; }
    public int ContactsCount { get; set; }
    public DateTime? LastAppliedAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class CreateCompanyDto
{
    public string Name { get; set; } = string.Empty;
    public string? WebsiteUrl { get; set; }
    public string? Location { get; set; }
    public string? Country { get; set; }
    public string? LocationUrl { get; set; }
    public string? Region { get; set; }
    public string? Sector { get; set; }
    public int? FoundedYear { get; set; }
    public string? LinkedInUrl { get; set; }
    public string? Size { get; set; }
    public Guid? LogoImageId { get; set; }
    public string? LogoUrl { get; set; }
    public string? Note { get; set; }
    public string? Description { get; set; }
}

public class UpdateCompanyDto
{
    public string? Name { get; set; }
    public string? WebsiteUrl { get; set; }
    public string? Location { get; set; }
    public string? Country { get; set; }
    public string? LocationUrl { get; set; }
    public string? Region { get; set; }
    public string? Sector { get; set; }
    public int? FoundedYear { get; set; }
    public string? LinkedInUrl { get; set; }
    public string? Size { get; set; }
    public Guid? LogoImageId { get; set; }
    public string? LogoUrl { get; set; }
    public string? Note { get; set; }
    public string? Description { get; set; }
}

public class CompanyListResponse
{
    public List<CompanyDto> Items { get; set; } = [];
    public int Total { get; set; }
}

/// <summary>Serialization helpers for the company web-research fields (stored as jsonb).</summary>
public static class CompanyResearchJson
{
    private static readonly System.Text.Json.JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public static List<CompanySocialLinkDto> ParseSocialLinks(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return [];
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<List<CompanySocialLinkDto>>(raw, Options) ?? [];
        }
        catch
        {
            return [];
        }
    }

    public static List<string> ParseList(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return [];
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<List<string>>(raw, Options) ?? [];
        }
        catch
        {
            return [];
        }
    }

    public static string? SerializeList(IEnumerable<string>? values)
    {
        var list = values?.Where(v => !string.IsNullOrWhiteSpace(v)).Select(v => v.Trim()).ToList();
        return list is { Count: > 0 } ? System.Text.Json.JsonSerializer.Serialize(list) : null;
    }

    public static string? SerializeSocialLinks(IEnumerable<CompanySocialLinkDto>? links)
    {
        var list = links?
            .Where(l => !string.IsNullOrWhiteSpace(l.Key) && !string.IsNullOrWhiteSpace(l.Url))
            .Select(l => new CompanySocialLinkDto { Key = l.Key.Trim().ToLower(), Url = l.Url.Trim() })
            .ToList();
        return list is { Count: > 0 } ? System.Text.Json.JsonSerializer.Serialize(list) : null;
    }
}
