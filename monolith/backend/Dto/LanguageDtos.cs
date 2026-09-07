using System.ComponentModel.DataAnnotations;

namespace CV_Generator.Dto;

public class CreateLanguageDto
{
    [Required]
    [MaxLength(50)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string Level { get; set; } = string.Empty;

    public int SortOrder { get; set; } = 0;
}

public class UpdateLanguageDto
{
    [Required]
    [MaxLength(50)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string Level { get; set; } = string.Empty;

    public int SortOrder { get; set; } = 0;
}

public class LanguageResponseDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Level { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public int SortOrder { get; set; } = 0;
}