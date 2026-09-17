using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using CV_Generator;
using CV_Generator.Data;
using CV_Generator.Dto;
using CV_Generator.Models;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/applications/calendar-configuration")]
public class CalendarConfigurationController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ICurrentUserService _currentUser;
    private static readonly string[] AllStatuses =
        ["SAVED", "APPLIED", "SCREENING", "INTERVIEW", "OFFER", "ACCEPTED", "REJECTED", "WITHDRAWN"];

    public CalendarConfigurationController(AppDbContext db, ICurrentUserService currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        var config = await _db.ApplicationConfigurations.FirstOrDefaultAsync(c => c.UserId == userId.Value);
        return Ok(ApiResponse<CalendarConfigurationDto?>.Ok(config == null ? null : ToDto(config)));
    }

    [HttpPut]
    public async Task<IActionResult> Update([FromBody] UpdateCalendarConfigurationDto dto)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();

        var statuses = dto.SelectedStatuses
            ?.Where(s => AllStatuses.Contains(s.ToUpperInvariant()))
            .Select(s => s.ToUpperInvariant())
            .ToArray() ?? [];

        var existing = await _db.ApplicationConfigurations.FirstOrDefaultAsync(c => c.UserId == userId.Value);
        if (existing != null)
        {
            existing.ShowReminders = dto.ShowReminders;
            existing.SelectedStatuses = statuses.Length > 0 ? JsonSerializer.Serialize(statuses) : "[]";
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            existing = new ApplicationConfiguration
            {
                UserId = userId.Value,
                ShowReminders = dto.ShowReminders,
                SelectedStatuses = statuses.Length > 0 ? JsonSerializer.Serialize(statuses) : "[]",
            };
            _db.ApplicationConfigurations.Add(existing);
        }
        await _db.SaveChangesAsync();
        return Ok(ApiResponse<CalendarConfigurationDto>.Ok(ToDto(existing)));
    }

    private static CalendarConfigurationDto ToDto(ApplicationConfiguration c)
    {
        string[]? statuses = null;
        if (!string.IsNullOrWhiteSpace(c.SelectedStatuses))
        {
            try
            {
                var parsed = JsonSerializer.Deserialize<string[]>(c.SelectedStatuses);
                statuses = parsed;
            }
            catch
            {
                // Legacy comma-delimited value stored before the JSON format.
                statuses = c.SelectedStatuses
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            }
        }
        // Null storage = never configured = show everything. An explicit [] = user cleared the filter.
        return new CalendarConfigurationDto(c.Id, c.UserId, c.ShowReminders, statuses ?? AllStatuses);
    }
}