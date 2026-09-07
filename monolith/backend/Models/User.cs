using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace CV_Generator.Models;

[Table("users")]
[Index(nameof(Email), IsUnique = true)]
public class User
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(50)]
    public string KeycloakId { get; set; } = default!;

    [Required]
    [MaxLength(50)]
    public required string FirstName { get; set; }

    [Required]
    [MaxLength(50)]
    public required string LastName { get; set; }

    [Required]
    [EmailAddress]
    [MaxLength(100)]
    public required string Email { get; set; }

    [MaxLength(20)]
    public string? PhoneNumber { get; set; }

    public DateTime? BirthDate { get; set; }

    [Required]
    [MaxLength(20)]
    public Role Role { get; set; } = Role.USER;

    [MaxLength(255)]
    public string? AvatarUrl { get; set; }

    /// <summary>MinIO object key of the chosen CV header photo (inside the profile-images bucket).</summary>
    [MaxLength(500)]
    public string? ProfilePhotoKey { get; set; }

    [Required]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? LastLogin { get; set; }

    [Required]
    public bool IsActive { get; set; } = true;

    public string? AiProfileDataJson { get; set; }
    public string? PreferencesJson { get; set; }

    [MaxLength(200)]
    public string? Headline { get; set; }

    public string? Bio { get; set; }

    [MaxLength(100)]
    public string? City { get; set; }

    [MaxLength(100)]
    public string? Country { get; set; }

    [MaxLength(100)]
    public string? AuthorizedCountry { get; set; }

    public bool? RequiresVisaSponsorship { get; set; }

    [MaxLength(50)]
    public string? NoticePeriod { get; set; }

    public string? EmploymentTypes { get; set; }

    [MaxLength(20)]
    public string? RemotePreference { get; set; }

    [MaxLength(20)]
    public string? WillingToRelocate { get; set; }

    [MaxLength(200)]
    public string? DesiredJobTitle { get; set; }

    public decimal? DesiredSalaryMin { get; set; }

    public decimal? DesiredSalaryMax { get; set; }

    public string? ProfessionalTitles { get; set; }
}

public enum Role
{
    USER,
    ADMIN,
}
