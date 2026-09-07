using System.ComponentModel.DataAnnotations;

namespace CV_Generator.Dto;

public class CreateSkillDto
{
    [Required]
    [MaxLength(100)]
    public required string Name { get; set; }

    [MaxLength(20)]
    public string? Level { get; set; }

    public int? YearsOfExperience { get; set; }

    [MaxLength(50)]
    public string? Category { get; set; }

    [MaxLength(50)]
    public string? Subcategory { get; set; }

    public int? LastUsedYear { get; set; }

    public bool IsCore { get; set; } = false;

    public int SortOrder { get; set; } = 0;
}

public class UpdateSkillDto
{
    [Required]
    [MaxLength(100)]
    public required string Name { get; set; }

    [MaxLength(20)]
    public string? Level { get; set; }

    public int? YearsOfExperience { get; set; }

    [MaxLength(50)]
    public string? Category { get; set; }

    [MaxLength(50)]
    public string? Subcategory { get; set; }

    public int? LastUsedYear { get; set; }

    public bool IsCore { get; set; } = false;

    public int SortOrder { get; set; } = 0;
}

public class SkillResponseDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Level { get; set; }
    public int? YearsOfExperience { get; set; }
    public Guid? UserId { get; set; }
    public string? Category { get; set; }
    public string? Subcategory { get; set; }
    public int? LastUsedYear { get; set; }
    public bool IsCore { get; set; } = false;
    public int SortOrder { get; set; } = 0;
}