namespace CV_Generator.Models;

/// <summary>
/// Records one successful dispatch of a CV version (via a mailbox email or an
/// apply attempt). Powers per-CV/per-tag sent analytics on the applications page.
/// </summary>
public class CvVersionSend
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid CvVersionId { get; set; }

    /// <summary>Convenience FK to the owning CV (avoids a version join in analytics).</summary>
    public Guid CvId { get; set; }

    public DateTime SentAt { get; set; } = DateTime.UtcNow;

    /// <summary>Application this send was linked to (null for standalone email sends).</summary>
    public Guid? ApplicationId { get; set; }

    public Application? Application { get; set; }
}