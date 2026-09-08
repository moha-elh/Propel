using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CV_Generator;
using CV_Generator.Dto;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ApplicationsController : ControllerBase
{
    private readonly IApplicationService _service;
    private readonly ICurrentUserService _currentUser;
    private readonly ILogger<ApplicationsController> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    public ApplicationsController(
        IApplicationService service,
        ICurrentUserService currentUser,
        ILogger<ApplicationsController> logger,
        IServiceScopeFactory scopeFactory)
    {
        _service = service;
        _currentUser = currentUser;
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    private Guid? UserId => _currentUser.UserId;

    /// GET /applications
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        [FromQuery] string? statuses = null,
        [FromQuery] string? search = null,
        [FromQuery] DateTime? appliedFrom = null,
        [FromQuery] DateTime? appliedTo = null,
        [FromQuery] DateTime? updatedFrom = null,
        [FromQuery] DateTime? updatedTo = null)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));
        if (page < 1) page = 1;
        if (pageSize < 1 || pageSize > 500) pageSize = 20;

        var statusArr = !string.IsNullOrWhiteSpace(statuses)
            ? statuses.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            : null;

        var result = await _service.GetAllAsync(UserId.Value, page, pageSize, statusArr, search,
            appliedFrom, appliedTo, updatedFrom, updatedTo);
        return Ok(ApiResponse<ApplicationListDto>.Ok(result));
    }

    /// GET /applications/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));

        var app = await _service.GetByIdAsync(id, UserId.Value);
        if (app == null) return NotFound(ApiResponse<ApplicationResponseDto>.Error("Application not found"));
        return Ok(ApiResponse<ApplicationResponseDto>.Ok(app));
    }

    /// POST /applications/check-duplicate
    [HttpPost("check-duplicate")]
    public async Task<IActionResult> CheckDuplicate([FromBody] DuplicateCheckRequestDto dto)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));

        if (string.IsNullOrWhiteSpace(dto.CompanyName) || string.IsNullOrWhiteSpace(dto.PositionTitle))
            return BadRequest(ApiResponse<DuplicateCheckResponseDto>.Error("CompanyName and PositionTitle are required"));

        var result = await _service.CheckDuplicatesAsync(UserId.Value, dto);
        return Ok(ApiResponse<DuplicateCheckResponseDto>.Ok(result));
    }

    /// POST /applications
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateApplicationDto dto)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));

        try
        {
            var created = await _service.CreateAsync(dto, UserId.Value);
            return Created($"/api/applications/{created.Id}", ApiResponse<ApplicationResponseDto>.Created(created));
        }
        catch (DuplicateApplicationException ex)
        {
            return Conflict(ApiResponse<ApplicationResponseDto>.Error(ex.Message, ex.Payload));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<ApplicationResponseDto>.Error(ex.Message));
        }
    }

    /// PATCH /applications/{id}/status
    [HttpPatch("{id}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateStatusDto dto)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));

        try
        {
            var updated = await _service.UpdateStatusAsync(id, dto, UserId.Value);
            if (updated == null) return NotFound(ApiResponse<ApplicationResponseDto>.Error("Application not found"));
            return Ok(ApiResponse<ApplicationResponseDto>.Ok(updated));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<ApplicationResponseDto>.Error(ex.Message));
        }
    }

    /// PUT /applications/{id}
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateApplicationDto dto)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));

        try
        {
            var updated = await _service.UpdateDetailsAsync(id, dto, UserId.Value);
            if (updated == null) return NotFound(ApiResponse<ApplicationResponseDto>.Error("Application not found"));
            return Ok(ApiResponse<ApplicationResponseDto>.Ok(updated));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<ApplicationResponseDto>.Error(ex.Message));
        }
    }

    /// DELETE /applications/{id}
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));

        var deleted = await _service.DeleteAsync(id, UserId.Value);
        if (!deleted) return NotFound(ApiResponse<object>.Error("Application not found"));
        return NoContent();
    }

    /// GET /applications/statistics
    [HttpGet("statistics")]
    public async Task<IActionResult> GetStatistics()
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));
        var stats = await _service.GetStatisticsAsync(UserId.Value);
        return Ok(ApiResponse<ApplicationStatisticsDto>.Ok(stats));
    }

    /// GET /applications/statistics/trends
    [HttpGet("statistics/trends")]
    public async Task<IActionResult> GetTrends()
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));
        var trends = await _service.GetTrendsAsync(UserId.Value);
        return Ok(ApiResponse<StatisticsTrendsDto>.Ok(trends));
    }

    /// GET /applications/analytics/summary
    [HttpGet("analytics/summary")]
    public async Task<IActionResult> GetAnalyticsSummary()
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));
        var summary = await _service.GetAnalyticsSummaryAsync(UserId.Value);
        return Ok(ApiResponse<AnalyticsSummaryDto>.Ok(summary));
    }

    /// PATCH /applications/{id}/toggle-save
    [HttpPatch("{id}/toggle-save")]
    public async Task<IActionResult> ToggleSave(Guid id)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));

        var isSaved = await _service.ToggleSaveAsync(id, UserId.Value);
        if (isSaved == null) return NotFound(ApiResponse<bool>.Error("Application not found"));
        return Ok(ApiResponse<bool>.Ok(isSaved.Value));
    }

    /// GET /applications/calendar-events
    [HttpGet("calendar-events")]
    public async Task<IActionResult> GetCalendarEvents(
        [FromQuery] DateTime from,
        [FromQuery] DateTime to,
        [FromQuery] string? statuses = null)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));

        var statusArr = !string.IsNullOrWhiteSpace(statuses)
            ? statuses.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            : null;

        var events = await _service.GetCalendarEventsAsync(UserId.Value, from, to, statusArr);
        return Ok(ApiResponse<List<CalendarEventDto>>.Ok(events));
    }

    /// GET /applications/activity
    [HttpGet("activity")]
    public async Task<IActionResult> GetActivity([FromQuery] int limit = 50)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));
        var feed = await _service.GetActivityFeedAsync(UserId.Value, limit);
        return Ok(ApiResponse<ActivityFeedDto>.Ok(feed));
    }

    /// GET /applications/{id}/attempts
    [HttpGet("{id}/attempts")]
    public async Task<IActionResult> GetAttempts(Guid id)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));

        try
        {
            var attempts = await _service.GetAttemptsAsync(id, UserId.Value);
            return Ok(ApiResponse<List<AttemptResponseDto>>.Ok(attempts));
        }
        catch (KeyNotFoundException)
        {
            return NotFound(ApiResponse<List<AttemptResponseDto>>.Error("Application not found"));
        }
    }

    /// GET /applications/{id}/suggested-contacts — contacts matching the application's company
    [HttpGet("{id}/suggested-contacts")]
    public async Task<IActionResult> SuggestedContacts(Guid id)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));
        var suggestions = await _service.GetSuggestedContactsAsync(id, UserId.Value);
        return Ok(ApiResponse<List<ContactSummaryDto>>.Ok(suggestions));
    }

    /// POST /applications/{id}/attempts
    [HttpPost("{id}/attempts")]
    public async Task<IActionResult> CreateAttempt(Guid id, [FromBody] CreateAttemptDto dto)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));

        try
        {
            var created = await _service.CreateAttemptAsync(id, dto, UserId.Value);
            return Created($"/api/applications/{id}/attempts/{created.Id}", ApiResponse<AttemptResponseDto>.Created(created));
        }
        catch (KeyNotFoundException)
        {
            return NotFound(ApiResponse<AttemptResponseDto>.Error("Application not found"));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<AttemptResponseDto>.Error(ex.Message));
        }
    }

    /// PATCH /applications/{id}/attempts/{attemptId}
    [HttpPatch("{id}/attempts/{attemptId}")]
    public async Task<IActionResult> UpdateAttempt(Guid id, Guid attemptId, [FromBody] UpdateAttemptDto dto)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));

        try
        {
            var updated = await _service.UpdateAttemptAsync(id, attemptId, dto, UserId.Value);
            if (updated == null) return NotFound(ApiResponse<AttemptResponseDto>.Error("Attempt not found"));
            return Ok(ApiResponse<AttemptResponseDto>.Ok(updated));
        }
        catch (KeyNotFoundException)
        {
            return NotFound(ApiResponse<AttemptResponseDto>.Error("Application not found"));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<AttemptResponseDto>.Error(ex.Message));
        }
    }
}
