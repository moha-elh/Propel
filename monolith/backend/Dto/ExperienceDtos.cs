using System.ComponentModel.DataAnnotations;

namespace CV_Generator.Dto;

public class CreateExperienceDto
{
    [Required]
    [MaxLength(150)]
    public required string Title { get; set; }

    [MaxLength(150)]
    public string? Company { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    [Required]
    public DateTime StartDate { get; set; }

    public DateTime? EndDate { get; set; }

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "Ongoing";

    [Required]
    public Guid UserId { get; set; }

    [MaxLength(150)]
    public string? Location { get; set; }

    [MaxLength(2000)]
    public string? AchievementsJson { get; set; }

    [MaxLength(50)]
    public string? EmploymentType { get; set; }

    public int SortOrder { get; set; } = 0;

}

public class UpdateExperienceDto
{
    [Required]
    [MaxLength(150)]
    public required string Title { get; set; }

    [MaxLength(150)]
    public string? Company { get; set; }

    [MaxLength(500)]
    public string? Description { get; set; }

    [Required]
    public DateTime StartDate { get; set; }

    public DateTime? EndDate { get; set; }

    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "Ongoing";

    [MaxLength(150)]
    public string? Location { get; set; }

    [MaxLength(2000)]
    public string? AchievementsJson { get; set; }

    [MaxLength(50)]
    public string? EmploymentType { get; set; }

    public int SortOrder { get; set; } = 0;
}

public class ExperienceResponseDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Company { get; set; }
    public string? Description { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string Status { get; set; } = "Ongoing";
    public Guid UserId { get; set; }
    public string? Location { get; set; }
    public string? AchievementsJson { get; set; }
    public string? EmploymentType { get; set; }
    public int SortOrder { get; set; } = 0;
}