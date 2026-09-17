using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace CV_Generator.Models;

/// <summary>
/// One saved revision of a cover letter (a PDF/DOCX upload).
/// An application attempt can reference a version via <see cref="ApplicationAttempt.CoverLetterVersionId"/>.
/// </summary>
[Table("cover_letter_versions")]
public class CoverLetterVersion
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CoverLetterId { get; set; }
    public int VersionNumber { get; set; } = 1;
    public string Label { get; set; } = string.Empty;
    public string? FileUrl { get; set; }
    public string? PdfUrl { get; set; }
    public string? ThumbnailUrl { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonIgnore]
    public CoverLetter CoverLetter { get; set; } = null!;
}