using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CV_Generator.Models;

/// <summary>
/// One concrete apply action on an application. Re-applying creates a new attempt
/// on the same application rather than a new application row.
/// </summary>
[Table("application_attempts")]
public class ApplicationAttempt
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid ApplicationId { get; set; }

    [ForeignKey(nameof(ApplicationId))]
    public Application? Application { get; set; }

    public int AttemptNumber { get; set; } = 1;

    [Required]
    [MaxLength(30)]
    public AttemptChannel Channel { get; set; } = AttemptChannel.EMAIL_GMAIL;

    [Required]
    [MaxLength(20)]
    public AttemptInitiatedBy InitiatedBy { get; set; } = AttemptInitiatedBy.USER;

    [Required]
    [MaxLength(20)]
    public AttemptStatus Status { get; set; } = AttemptStatus.DRAFT;

    [MaxLength(300)]
    public string? Subject { get; set; }

    public string? Body { get; set; }

    [MaxLength(200)]
    public string? RecipientName { get; set; }

    [MaxLength(300)]
    public string? RecipientContact { get; set; }

    /// <summary>
    /// Linked contact from the address book. Null for one-off recipients.
    /// </summary>
    public Guid? ContactId { get; set; }

    [ForeignKey(nameof(ContactId))]
    public Contact? Contact { get; set; }

    /// <summary>
    /// Provider-specific proof of send: gmail messageId/threadId, whatsapp phone,
    /// linkedin profile url / conversation id, web form url...
    /// </summary>
    [Column(TypeName = "jsonb")]
    public string? ChannelMetadataJson { get; set; }

    /// <summary>
    /// CV version attached for this specific attempt (can be re-tailored per re-apply).
    /// </summary>
    public Guid? CvVersionId { get; set; }

    /// <summary>
    /// Cover letter version attached to this attempt (tells you which applications
    /// were sent alongside a cover letter).
    /// </summary>
    public Guid? CoverLetterVersionId { get; set; }

    [NotMapped]
    public string? CoverLetterTitle { get; set; }

    public DateTime? SentAt { get; set; }

    [MaxLength(500)]
    public string? FailureReason { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public enum AttemptChannel
{
    EMAIL_GMAIL,
    EMAIL_SMTP,
    WHATSAPP,
    LINKEDIN_MESSAGE,
    LINKEDIN_CONNECTION,
    WEB_FORM,
    IN_PERSON,
    OTHER,
    LINKEDIN_APPLY
}

public enum AttemptInitiatedBy
{
    USER,
    AI_AGENT,
    SCHEDULE
}

public enum AttemptStatus
{
    DRAFT,
    SCHEDULED,
    SENT,
    FAILED
}
