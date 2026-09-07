using System.ComponentModel.DataAnnotations;

namespace CV_Generator.Dto;

public class CreateAcademicActivityDto
{
    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;
    public string? Organization { get; set; }
    [MaxLength(150)]
    public string? Role { get; set; }
    public string? Description { get; set; }
    [Required]
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public int SortOrder { get; set; } = 0;
}

public class UpdateAcademicActivityDto
{
    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;
    public string? Organization { get; set; }
    [MaxLength(150)]
    public string? Role { get; set; }
    public string? Description { get; set; }
    [Required]
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public int SortOrder { get; set; } = 0;
}

public class AcademicActivityResponseDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Organization { get; set; }
    public string? Role { get; set; }
    public string? Description { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public Guid UserId { get; set; }
    public int SortOrder { get; set; } = 0;
}