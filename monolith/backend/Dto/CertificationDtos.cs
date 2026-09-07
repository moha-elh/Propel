using System.ComponentModel.DataAnnotations;

namespace CV_Generator.Dto;

public class CreateCertificationDto
{
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? IssuingOrganization { get; set; }

    public DateTime? IssueDate { get; set; }

    [MaxLength(300)]
    public string? CredentialUrl { get; set; }

    [MaxLength(200)]
    public string? CredentialId { get; set; }

    public DateTime? ExpiryDate { get; set; }

    public int SortOrder { get; set; } = 0;
}

public class UpdateCertificationDto
{
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(200)]
    public string? IssuingOrganization { get; set; }

    public DateTime? IssueDate { get; set; }

    [MaxLength(300)]
    public string? CredentialUrl { get; set; }

    [MaxLength(200)]
    public string? CredentialId { get; set; }

    public DateTime? ExpiryDate { get; set; }

    public int SortOrder { get; set; } = 0;
}

public class CertificationResponseDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? IssuingOrganization { get; set; }
    public DateTime? IssueDate { get; set; }
    public string? CredentialUrl { get; set; }
    public string? CredentialId { get; set; }
    public DateTime? ExpiryDate { get; set; }
    public Guid UserId { get; set; }
    public int SortOrder { get; set; } = 0;
}