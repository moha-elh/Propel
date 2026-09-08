using System.Text.Json.Serialization;

namespace CV_Generator.Models;

public class Contact
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Mobile { get; set; }
    public string? Fax { get; set; }
    public string? Address { get; set; }
    public string? Company { get; set; }
    public string? Position { get; set; }
    public string? LinkedInUrl { get; set; }
    public string? Notes { get; set; }
    public string? AvatarBase64 { get; set; }
    public string Source { get; set; } = "manual";
    public bool IsFavorite { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
