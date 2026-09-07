using System.ComponentModel.DataAnnotations;

namespace CV_Generator.Dto;

public class CreateInterestDto
{
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    public int SortOrder { get; set; } = 0;
}

public class UpdateInterestDto
{
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    public int SortOrder { get; set; } = 0;
}

public class InterestResponseDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public int SortOrder { get; set; } = 0;
}