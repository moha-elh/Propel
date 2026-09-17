using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CV_Generator.Models;

[Table("applications")]
public class Application
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid CandidateId { get; set; }

    public Guid? CvVersionId { get; set; }

    public Guid? JobOfferId { get; set; }

    [Required]
    [MaxLength(200)]
    public required string CompanyName { get; set; }

    [Required]
    [MaxLength(150)]
    public required string PositionTitle { get; set; }

    [MaxLength(100)]
    public string? OfferSource { get; set; }

    /// <summary>Type of internship/target (e.g. PFA, PFE, Full-time). Free text.</summary>
    [MaxLength(50)]
    public string? InternshipType { get; set; }

    /// <summary>Candidate's own priority for follow-up energy allocation.</summary>
    [Required]
    public ApplicationPriority Priority { get; set; } = ApplicationPriority.MEDIUM;

    /// <summary>
    /// How this application record came to exist (manual entry, job offer conversion, agent auto-apply...).
    /// Distinct from OfferSource which describes where the offer was discovered.
    /// </summary>
    [Required]
    [MaxLength(20)]
    public ApplicationOrigin Origin { get; set; } = ApplicationOrigin.MANUAL;

    [Required]
    public ApplicationStatus Status { get; set; } = ApplicationStatus.APPLIED;

    /// <summary>
    /// Normalized company+position key used for duplicate detection.
    /// </summary>
    [Required]
    [MaxLength(280)]
    public string Fingerprint { get; set; } = string.Empty;

    public DateTime? AppliedAt { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public string? Notes { get; set; }

    /// <summary>
    /// Soft-delete flag: true keeps the row (and its history) for the activity feed
    /// while hiding it from every list/show query.
    /// </summary>
    public bool IsDeleted { get; set; } = false;

    // Navigation
    public ICollection<ApplicationStatusHistory> StatusHistory { get; set; } = new List<ApplicationStatusHistory>();

    public ICollection<ApplicationAttempt> Attempts { get; set; } = new List<ApplicationAttempt>();
}
