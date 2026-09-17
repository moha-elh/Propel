namespace CV_Generator.Dto;

public record CreateCvDto(
    string Title,
    string TemplateId
);

public record UpdateCvDto(
    string? Title,
    string? TemplateId,
    bool? IsActive
);

public record CreateCvVersionDto(
    string Label,
    string? ContentJson
);

public record UpdateSectionDto(
    string SectionType,
    int DisplayOrder,
    string ContentJson
);

public record CvDto(
    Guid Id,
    Guid UserId,
    string Title,
    string TemplateId,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    bool IsActive,
    string[] Tags,
    List<CvVersionDto>? Versions = null
);

public record CvVersionDto(
    Guid Id,
    Guid CvId,
    int VersionNumber,
    string Label,
    string? FileUrl,
    string? PdfUrl,
    string ContentJson,
    DateTime CreatedAt,
    int SentCount = 0,
    DateTime? LastSentAt = null
);

public record CvSectionDto(
    Guid Id,
    Guid VersionId,
    string SectionType,
    int DisplayOrder,
    string ContentJson,
    DateTime UpdatedAt
);
