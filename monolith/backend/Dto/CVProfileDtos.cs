using System.ComponentModel.DataAnnotations;

namespace CV_Generator.Dto;

public class CreateCVProfileDto
{
    [Required]
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [Required]
    public string Summary { get; set; } = string.Empty;

    [MaxLength(150)]
    public string? Email { get; set; }

    [MaxLength(50)]
    public string? Phone { get; set; }

    [MaxLength(200)]
    public string? Location { get; set; }

    [MaxLength(300)]
    public string? Website { get; set; }

    [MaxLength(300)]
    public string? LinkedInUrl { get; set; }

    [MaxLength(300)]
    public string? GithubUrl { get; set; }

    public bool OpenToRelocate { get; set; } = false;
}

public class UpdateCVProfileDto
{
    [Required]
    [MaxLength(150)]
    public string Title { get; set; } = string.Empty;

    [Required]
    public string Summary { get; set; } = string.Empty;

    [MaxLength(150)]
    public string? Email { get; set; }

    [MaxLength(50)]
    public string? Phone { get; set; }

    [MaxLength(200)]
    public string? Location { get; set; }

    [MaxLength(300)]
    public string? Website { get; set; }

    [MaxLength(300)]
    public string? LinkedInUrl { get; set; }

    [MaxLength(300)]
    public string? GithubUrl { get; set; }

    public bool OpenToRelocate { get; set; } = false;
}

public class CVProfileResponseDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Location { get; set; }
    public string? Website { get; set; }
    public string? LinkedInUrl { get; set; }
    public string? GithubUrl { get; set; }
    public bool OpenToRelocate { get; set; } = false;
}