using System.ComponentModel.DataAnnotations;

namespace CV_Generator.Dto;

public class CreateProjectDto
{
    [Required]
    [MaxLength(150)]
    public required string Title { get; set; }

    [MaxLength(3000)]
    public string? Description { get; set; }

    [MaxLength(50)]
    public string? Role { get; set; }

    [MaxLength(1000)]
    public string? Achievements { get; set; }

    [Required]
    public DateTime StartDate { get; set; }

    public DateTime? EndDate { get; set; }

    [MaxLength(300)]
    public string? RepositoryUrl { get; set; }

    [MaxLength(300)]
    public string? DemoUrl { get; set; }

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "Ongoing";

    public string? SkillsJson { get; set; }

    [MaxLength(100)]
    public string? Category { get; set; }

    public int? TeamSize { get; set; }

    public int SortOrder { get; set; } = 0;
}

public class UpdateProjectDto
{
    [Required]
    [MaxLength(150)]
    public required string Title { get; set; }

    [MaxLength(3000)]
    public string? Description { get; set; }

    [MaxLength(50)]
    public string? Role { get; set; }

    [MaxLength(1000)]
    public string? Achievements { get; set; }

    [Required]
    public DateTime StartDate { get; set; }

    public DateTime? EndDate { get; set; }

    [MaxLength(300)]
    public string? RepositoryUrl { get; set; }

    [MaxLength(300)]
    public string? DemoUrl { get; set; }

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "Ongoing";

    public string? SkillsJson { get; set; }

    [MaxLength(100)]
    public string? Category { get; set; }

    public int? TeamSize { get; set; }

    public int SortOrder { get; set; } = 0;
}

public class ProjectResponseDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Role { get; set; }
    public string? Achievements { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string? RepositoryUrl { get; set; }
    public string? DemoUrl { get; set; }
    public string Status { get; set; } = "Completed";
    public Guid UserId { get; set; }
    public string? SkillsJson { get; set; }
    public string? Category { get; set; }
    public int? TeamSize { get; set; }
    public int SortOrder { get; set; } = 0;
}