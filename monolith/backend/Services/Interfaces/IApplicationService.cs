using CV_Generator.Dto;
using CV_Generator.Models;

namespace CV_Generator.Services;

public interface IApplicationService
{
    Task<ApplicationListDto> GetAllAsync(Guid userId, int page, int pageSize, string[]? statuses = null, string? search = null, DateTime? appliedFrom = null, DateTime? appliedTo = null, DateTime? updatedFrom = null, DateTime? updatedTo = null, string? sortBy = null, string? sortDir = null);
    Task<ApplicationResponseDto?> GetByIdAsync(Guid id, Guid userId);
    Task<DuplicateCheckResponseDto> CheckDuplicatesAsync(Guid userId, DuplicateCheckRequestDto dto);
    Task<ApplicationResponseDto> CreateAsync(CreateApplicationDto dto, Guid userId);
    Task<ApplicationResponseDto?> UpdateStatusAsync(Guid id, UpdateStatusDto dto, Guid userId);
    Task<ApplicationResponseDto?> UpdateDetailsAsync(Guid id, UpdateApplicationDto dto, Guid userId);
    Task<ApplicationResponseDto?> UpdateLinkedEmailAsync(Guid id, Guid? emailMessageId, Guid userId);
    Task<bool> DeleteAsync(Guid id, Guid userId);
    Task<ApplicationStatisticsDto> GetStatisticsAsync(Guid userId);
    Task<StatisticsTrendsDto> GetTrendsAsync(Guid userId);
    Task<AnalyticsSummaryDto> GetAnalyticsSummaryAsync(Guid userId);
    Task<bool?> ToggleSaveAsync(Guid id, Guid userId);
    Task<ActivityFeedDto> GetActivityFeedAsync(Guid userId, int limit = 50);
    Task<List<CalendarEventDto>> GetCalendarEventsAsync(Guid userId, DateTime from, DateTime to, string[]? statuses);
    Task<List<AttemptResponseDto>> GetAttemptsAsync(Guid applicationId, Guid userId);
    Task<AttemptResponseDto> CreateAttemptAsync(Guid applicationId, CreateAttemptDto dto, Guid userId);
    Task<AttemptResponseDto?> UpdateAttemptAsync(Guid applicationId, Guid attemptId, UpdateAttemptDto dto, Guid userId);
    Task<List<ContactSummaryDto>> GetSuggestedContactsAsync(Guid applicationId, Guid userId);
    Task<List<ApplicationResponseDto>?> GetApplicationsForContactAsync(Guid contactId, Guid userId);
    Task<List<ApplicationResponseDto>> GetApplicationsByCompanyAsync(Guid userId, string companyName);
}
