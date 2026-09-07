namespace CV_Generator.Dto;

public class CompanyResearchRequestDto
{
    /// <summary>The company id (must belong to the current user).</summary>
    public Guid CompanyId { get; set; }

    /// <summary>
    /// Which data types to extract/enrich: emails, phones, social, address, about, facts.
    /// Empty = all.
    /// </summary>
    public List<string> DataTypes { get; set; } = [];
}

public class CompanyResearchResultDto
{
    public string? WebsiteUrl { get; set; }
    public List<string> Emails { get; set; } = [];
    public List<string> Phones { get; set; } = [];
    public List<CompanySocialLinkDto> SocialLinks { get; set; } = [];
    public string? Address { get; set; }
    public string? About { get; set; }
    public List<string> CompanyFacts { get; set; } = [];
    public string? SourceUrl { get; set; }
    public string? Error { get; set; }
}