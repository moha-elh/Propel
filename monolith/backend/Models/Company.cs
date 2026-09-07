using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CV_Generator.Models;

[Table("companies")]
public class Company
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid UserId { get; set; }

    [Required]
    [MaxLength(200)]
    public required string Name { get; set; }

    [MaxLength(500)]
    public string? WebsiteUrl { get; set; }

    [MaxLength(100)]
    public string? Location { get; set; }

    [MaxLength(100)]
    public string Country { get; set; } = "Morocco";

    [MaxLength(500)]
    public string? LocationUrl { get; set; }

    [MaxLength(200)]
    public string? Region { get; set; }

    [MaxLength(200)]
    public string? Sector { get; set; }

    public int? FoundedYear { get; set; }

    [MaxLength(500)]
    public string? LinkedInUrl { get; set; }

    [MaxLength(100)]
    public string? Size { get; set; }

    public Guid? LogoImageId { get; set; }

    [MaxLength(2000)]
    public string? LogoUrl { get; set; }

    public string? Note { get; set; }

    public string? Description { get; set; }

    [MaxLength(500)]
    public string? Address { get; set; }

    /// <summary>Raw JSON array of contact email addresses (jsonb).</summary>
    [MaxLength(3000)]
    public string? EmailsJson { get; set; }

    /// <summary>Raw JSON array of contact phone numbers (jsonb).</summary>
    [MaxLength(3000)]
    public string? PhonesJson { get; set; }

    /// <summary>Raw JSON array of {"key","url"} social links (jsonb).</summary>
    [MaxLength(6000)]
    public string? SocialLinksJson { get; set; }

    /// <summary>Raw JSON array of short factual strings (jsonb).</summary>
    [MaxLength(6000)]
    public string? CompanyFactsJson { get; set; }

    /// <summary>Provenance of the research data, e.g. "web-research".</summary>
    [MaxLength(50)]
    public string? ResearchSource { get; set; }

    /// <summary>The exact page the research result was extracted from.</summary>
    [MaxLength(500)]
    public string? ResearchLink { get; set; }

    public DateTime? ResearchUpdatedAt { get; set; }

    [Required]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Required]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
