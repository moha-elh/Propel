using System.ComponentModel.DataAnnotations;

namespace CV_Generator.Dto;

public class CreateEducationDto
{
    [Required]
    [MaxLength(150)]
    public string InstitutionName { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string DegreeType { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string FieldOfStudy { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Specialization { get; set; }

    [Required]
    public DateTime StartDate { get; set; }

    public DateTime? EndDate { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "Ongoing";

    [MaxLength(100)]
    public string? City { get; set; }

    [MaxLength(300)]
    public string? DiplomaFileUrl { get; set; }

    [MaxLength(50)]
    public string? Grade { get; set; }

    [MaxLength(1000)]
    public string? Description { get; set; }

    [MaxLength(100)]
    public string? Country { get; set; }

    public int SortOrder { get; set; } = 0;
}

public class UpdateEducationDto
{
    [Required]
    [MaxLength(150)]
    public string InstitutionName { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string DegreeType { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string FieldOfStudy { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Specialization { get; set; }

    [Required]
    public DateTime StartDate { get; set; }

    public DateTime? EndDate { get; set; }

    [MaxLength(20)]
    public string Status { get; set; } = "Ongoing";

    [MaxLength(100)]
    public string? City { get; set; }

    [MaxLength(300)]
    public string? DiplomaFileUrl { get; set; }

    [MaxLength(50)]
    public string? Grade { get; set; }

    [MaxLength(1000)]
    public string? Description { get; set; }

    [MaxLength(100)]
    public string? Country { get; set; }

    public int SortOrder { get; set; } = 0;
}

public class EducationResponseDto
{
    public Guid Id { get; set; }
    public string InstitutionName { get; set; } = string.Empty;
    public string DegreeType { get; set; } = string.Empty;
    public string FieldOfStudy { get; set; } = string.Empty;
    public string? Specialization { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string Status { get; set; } = "Ongoing";
    public string? City { get; set; }
    public string? DiplomaFileUrl { get; set; }
    public Guid UserId { get; set; }
    public string? Grade { get; set; }
    public string? Description { get; set; }
    public string? Country { get; set; }
    public int SortOrder { get; set; } = 0;
}