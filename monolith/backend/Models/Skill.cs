using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace CV_Generator.Models;

[Table("skills")]
public class Skill
{
    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    [MaxLength(100)]
    public required string Name { get; set; }

    [MaxLength(20)]
    public string? Level { get; set; }

    public int? YearsOfExperience { get; set; }

    [Required]
    public Guid UserId { get; set; }

    [MaxLength(50)]
    public string? Category { get; set; }

    [MaxLength(50)]
    public string? Subcategory { get; set; }

    public int? LastUsedYear { get; set; }

    public bool IsCore { get; set; } = false;

    public int SortOrder { get; set; } = 0;
}