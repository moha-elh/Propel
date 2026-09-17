using System.ComponentModel.DataAnnotations.Schema;

namespace CV_Generator.Models;

/// <summary>
/// A reusable cover letter document. Optionally bound to one company
/// (<see cref="CompanyId"/> == null for general purpose) so you can tell
/// which applications were sent alongside a cover letter.
/// </summary>
[Table("cover_letters")]
public class CoverLetter
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Title { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Soft reference to a company (no FK nav, mirrors Application.CompanyName).
    /// Null = general-purpose letter usable for any application.
    /// </summary>
    public Guid? CompanyId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public List<CoverLetterVersion> Versions { get; set; } = new();
}