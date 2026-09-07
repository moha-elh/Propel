using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CV_Generator.Models;

[Table("user_images")]
public class UserImage
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid UserId { get; set; }

    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    /// <summary>MinIO object key inside the shared profile-images bucket (null for URL-only images).</summary>
    [MaxLength(500)]
    public string? ObjectKey { get; set; }

    /// <summary>Public URL: either the MinIO public URL (ObjectKey set) or an external URL.</summary>
    [Required]
    [MaxLength(2000)]
    public string Url { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? ContentType { get; set; }

    public long? SizeBytes { get; set; }

    /// <summary>upload | web | url</summary>
    [MaxLength(20)]
    public string Source { get; set; } = "upload";

    [Required]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}