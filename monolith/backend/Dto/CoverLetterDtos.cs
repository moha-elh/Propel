namespace CV_Generator.Dto;

public record CoverLetterVersionDto(
    Guid Id,
    Guid CoverLetterId,
    int VersionNumber,
    string Label,
    string? FileUrl,
    string? PdfUrl,
    string? ThumbnailUrl,
    DateTime CreatedAt);

public record CoverLetterDto(
    Guid Id,
    Guid UserId,
    string Title,
    Guid? CompanyId,
    string? CompanyName,
    bool IsActive,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    List<CoverLetterVersionDto> Versions);

public record CoverLetterInput(
    string Title,
    Guid? CompanyId = null,
    bool IsActive = true,
    string? Text = null,
    bool IncludeTitleInPdf = true);