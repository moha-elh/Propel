using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator;
using CV_Generator.Data;
using CV_Generator.Models;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/calendar-config")]
public class CalendarConfigurationController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ICurrentUserService _currentUser;

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
        return Ok(ApiResponse<ApplicationConfiguration?>.Ok(config));
    }

    [HttpPost]
    public async Task<IActionResult> Update([FromBody] ApplicationConfiguration config)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        config.UserId = userId.Value;
        config.UpdatedAt = DateTime.UtcNow;
        var existing = await _db.ApplicationConfigurations.FirstOrDefaultAsync(c => c.UserId == userId.Value);
        if (existing != null)
        {
            existing.ShowReminders = config.ShowReminders;
            existing.SelectedStatuses = config.SelectedStatuses;
            existing.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            _db.ApplicationConfigurations.Add(config);
        }
        await _db.SaveChangesAsync();
        return Ok(ApiResponse<ApplicationConfiguration>.Ok(config));
    }
}
