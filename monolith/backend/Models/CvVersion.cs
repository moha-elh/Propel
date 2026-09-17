namespace CV_Generator.Models;

using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

// CV version entity
// Each CV can have multiple versions (drafts, revisions)
public class CvVersion
{
    public Guid Id { get; set; }
    public Guid CvId { get; set; }
    public int VersionNumber { get; set; }
    public string Label { get; set; } = string.Empty;
    public string? FileUrl { get; set; }
    public string? PdfUrl { get; set; }
    public string? ThumbnailUrl { get; set; }
    public string ContentJson { get; set; } = "{}";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>CvVersionSends count for this version (computed per user; not persisted).</summary>
    [NotMapped]
    public int SentCount { get; set; }

    /// <summary>Most recent CvVersionSend time for this version (computed per user; not persisted).</summary>
    [NotMapped]
    public DateTime? LastSentAt { get; set; }

    [JsonIgnore]
    public Cv Cv { get; set; } = null!;
    public List<CvSection> Sections {get; set;} = [];
    
}
