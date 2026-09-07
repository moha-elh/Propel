using System.ComponentModel.DataAnnotations;

namespace CV_Generator.Dto;

public class CreateHackathonDto
{
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    public string? Organization { get; set; }
    public DateTime? Date { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string? Description { get; set; }
    public string? Role { get; set; }
    public string? Result { get; set; }
    [MaxLength(300)]
    public string? ProjectUrl { get; set; }
    public int SortOrder { get; set; } = 0;
}

public class UpdateHackathonDto
{
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;
    public string? Organization { get; set; }
    public DateTime? Date { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string? Description { get; set; }
    public string? Role { get; set; }
    public string? Result { get; set; }
    [MaxLength(300)]
    public string? ProjectUrl { get; set; }
    public int SortOrder { get; set; } = 0;
}

public class HackathonResponseDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Organization { get; set; }
    public DateTime? Date { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string? Description { get; set; }
    public string? Role { get; set; }
    public string? Result { get; set; }
    [MaxLength(300)]
    public string? ProjectUrl { get; set; }
    public Guid UserId { get; set; }
    public int SortOrder { get; set; } = 0;
}