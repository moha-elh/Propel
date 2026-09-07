namespace CV_Generator.Dto;

public record CreateUserDto(
    string KeycloakId,
    string FirstName,
    string LastName,
    string Email,
    string Role
);

public record UpdateUserDto(
    string FirstName,
    string LastName,
    string? PhoneNumber,
    string? BirthDate,
    string? AvatarUrl,
    string? PreferencesJson,
    string? Headline,
    string? Bio,
    string? City,
    string? Country,
    string? AuthorizedCountry,
    bool? RequiresVisaSponsorship,
    string? NoticePeriod,
    string? EmploymentTypes,
    string? RemotePreference,
    string? WillingToRelocate,
    string? DesiredJobTitle,
    decimal? DesiredSalaryMin,
    decimal? DesiredSalaryMax,
    string? ProfessionalTitles,
    string? ProfilePhotoKey
);

public record UserResponseDto(
    Guid Id,
    string KeycloakId,
    string FirstName,
    string LastName,
    string Email,
    string? PhoneNumber,
    string? BirthDate,
    string Role,
    string? AvatarUrl,
    DateTime CreatedAt,
    DateTime? LastLogin,
    bool IsActive,
    string? AiProfileDataJson,
    string? PreferencesJson,
    string? Headline,
    string? Bio,
    string? City,
    string? Country,
    string? AuthorizedCountry,
    bool? RequiresVisaSponsorship,
    string? NoticePeriod,
    string? EmploymentTypes,
    string? RemotePreference,
    string? WillingToRelocate,
    string? DesiredJobTitle,
    decimal? DesiredSalaryMin,
    decimal? DesiredSalaryMax,
    string? ProfessionalTitles,
    string? ProfilePhotoKey
);
