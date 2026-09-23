using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CV_Generator.Models;

[Table("saved_tool_content")]
public class SavedToolContent
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid UserId { get; set; }

    /// <summary>Which tool produced this: post | comment | message | emojify.</summary>
    [Required]
    [MaxLength(30)]
    public string Tool { get; set; } = "post";

    [MaxLength(300)]
    public string Title { get; set; } = "";

    [Required]
    public string Text { get; set; } = "";

    [MaxLength(2000)]
    public string Hashtags { get; set; } = "";

    /// <summary>As first saved. Kept forever so a bad rework can always be reverted.</summary>
    [Required]
    public string OriginalText { get; set; } = "";

    [Required]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Required]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}