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

    /// <summary>Linked directory contact the candidate plans to reach out to (esp. saved-for-later offers).</summary>
    public Guid? ContactId { get; set; }

    /// <summary>Contact person name recorded while saving an offer for later.</summary>
    [MaxLength(100)]
    public string? RecipientName { get; set; }

    /// <summary>Contact email / phone / profile link recorded while saving an offer for later.</summary>
    [MaxLength(300)]
    public string? RecipientContact { get; set; }

    /// <summary>Id of the mailbox email (EmailMessages) used to send this application (with attachments). Null = none linked.</summary>
    public Guid? LinkedEmailMessageId { get; set; }

    /// <summary>
    /// Soft-delete flag: true keeps the row (and its history) for the activity feed
    /// while hiding it from every list/show query.
    /// </summary>
    public bool IsDeleted { get; set; } = false;

    /// <summary>
    /// Files attached to this application (offer PDF, screenshot, contract...).
    /// JSON array of <c>ScheduleAttachmentRef</c> persisted in MinIO <c>mail-attachments</c>.
    /// </summary>
    [Column(TypeName = "jsonb")]
    public string? AttachmentsJson { get; set; }

    /// <summary>
    /// Date after which the candidate expects a reply (follow-up/reminder trigger).
    /// Usually set relative to AppliedAt (e.g. applied date + 2 weeks). Null = no follow-up scheduled.
    /// </summary>
    public DateTime? FollowUpDate { get; set; }

    /// <summary>Follow-up reminder lifecycle: none scheduled, awaiting a decision, or actioned.</summary>
    [Required]
    public FollowUpStatus FollowUpStatus { get; set; } = FollowUpStatus.NONE;

    // Navigation
    public ICollection<ApplicationStatusHistory> StatusHistory { get; set; } = new List<ApplicationStatusHistory>();

    public ICollection<ApplicationAttempt> Attempts { get; set; } = new List<ApplicationAttempt>();
}
