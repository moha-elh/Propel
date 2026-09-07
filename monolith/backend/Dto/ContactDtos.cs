namespace CV_Generator.Dto;

public class ContactDto
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Mobile { get; set; }
    public string? Fax { get; set; }
    public string? Address { get; set; }
    public string? Company { get; set; }
    public string? Position { get; set; }
    public string? LinkedInUrl { get; set; }
    public string? Notes { get; set; }
    public string? AvatarBase64 { get; set; }
    public string Source { get; set; } = "manual";
    public bool IsFavorite { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class CreateContactDto
{
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Phone { get; set; }
    public string? Mobile { get; set; }
    public string? Fax { get; set; }
    public string? Address { get; set; }
    public string? Company { get; set; }
    public string? Position { get; set; }
    public string? LinkedInUrl { get; set; }
    public string? Notes { get; set; }
    public string? Source { get; set; }
    public bool IsFavorite { get; set; }
    public string? AvatarBase64 { get; set; }
}

public class UpdateContactDto
{
    public string? Name { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Mobile { get; set; }
    public string? Fax { get; set; }
    public string? Address { get; set; }
    public string? Company { get; set; }
    public string? Position { get; set; }
    public string? LinkedInUrl { get; set; }
    public string? Notes { get; set; }
    public bool? IsFavorite { get; set; }
    public string? AvatarBase64 { get; set; }
}

public class ContactExtractResultDto
{
    public int Imported { get; set; }
    public int Skipped { get; set; }
    public List<string> Errors { get; set; } = [];
}

public class ImportCsvDto
{
    public Guid UserId { get; set; }
    public string CsvContent { get; set; } = string.Empty;
}

public class ContactListResponse
{
    public List<ContactDto> Items { get; set; } = [];
    public int Total { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
}
