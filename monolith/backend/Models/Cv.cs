using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CV_Generator.Models;

// CV entity
// Represents a user's CV document
public class Cv
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string TemplateId { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public bool IsActive { get; set; }

    /// <summary>Serialized JSON array of user tags; exposed as <see cref="Tags"/>.</summary>
    [JsonIgnore]
    public string? TagsJson { get; set; }

    /// <summary>User-defined tags parsed leniently from <see cref="TagsJson"/> (never null).</summary>
    [NotMapped]
    public string[] Tags => ParseTags(TagsJson);

    public List<CvVersion> Versions { get; set; } = new();

    internal static string[] ParseTags(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            return JsonSerializer.Deserialize<string[]>(json) ?? [];
        }
        catch
        {
            return [];
        }
    }
}
