using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator.Data;
using CV_Generator.Models;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExperiencesController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<ExperiencesController> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    public ExperiencesController(AppDbContext db, ILogger<ExperiencesController> logger, IServiceScopeFactory scopeFactory)
    {
        _db = db;
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? userId)
    {
        userId ??= CurrentUserId;

        var experiences = userId.HasValue
            ? await _db.Experiences.Where(e => e.UserId == userId.Value).ToListAsync()
            : await _db.Experiences.ToListAsync();
        return Ok(ApiResponse<List<Experience>>.Ok(experiences));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var exp = await _db.Experiences.FindAsync(id);
        if (exp == null) return NotFound(ApiResponse<Experience>.Error("Experience not found"));
        return Ok(ApiResponse<Experience>.Ok(exp));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateExperienceDto dto)
    {
        var exp = new Experience
        {
            Title = dto.Title,
            Company = dto.Company,
            Description = dto.Description,
            StartDate = dto.StartDate,
            EndDate = dto.EndDate,
            ReferenceUrl = dto.ReferenceUrl,
            Status = dto.Status,
            UserId = RequiredUserId,
            Location = dto.Location,
            AchievementsJson = dto.AchievementsJson,
            EmploymentType = dto.EmploymentType,
            SortOrder = dto.SortOrder
        };

        _db.Experiences.Add(exp);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, exp.UserId, _logger, "Experience.Create", exp.Id);

        _logger.LogInformation("Created experience {Id}", exp.Id);
        return Created($"/api/experiences/{exp.Id}", ApiResponse<Experience>.Created(exp));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateExperienceDto dto)
    {
        var exp = await _db.Experiences.FindAsync(id);
        if (exp == null) return NotFound(ApiResponse<Experience>.Error("Experience not found"));

        exp.Title = dto.Title;
        exp.Company = dto.Company;
        exp.Description = dto.Description;
        exp.StartDate = dto.StartDate;
        exp.EndDate = dto.EndDate;
        exp.ReferenceUrl = dto.ReferenceUrl;
        exp.Status = dto.Status;
        exp.Location = dto.Location;
        exp.AchievementsJson = dto.AchievementsJson;
        exp.EmploymentType = dto.EmploymentType;
        exp.SortOrder = dto.SortOrder;

        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, exp.UserId, _logger, "Experience.Update", exp.Id);
        return Ok(ApiResponse<Experience>.Ok(exp));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var exp = await _db.Experiences.FindAsync(id);
        if (exp == null) return NotFound(ApiResponse<object>.Error("Experience not found"));

        _db.Experiences.Remove(exp);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, exp.UserId, _logger, "Experience.Delete", exp.Id);
        return NoContent();
    }

    public record CreateExperienceDto(
        string Title,
        string? Company,
        string? Description,
        DateTime StartDate,
        DateTime? EndDate,
        string? ReferenceUrl,
        string Status,
        Guid UserId,
        string? Location = null,
        string? AchievementsJson = null,
        string? EmploymentType = null,
        int SortOrder = 0
    );

    public record UpdateExperienceDto(
        string Title,
        string? Company,
        string? Description,
        DateTime StartDate,
        DateTime? EndDate,
        string? ReferenceUrl,
        string Status,
        string? Location = null,
        string? AchievementsJson = null,
        string? EmploymentType = null,
        int SortOrder = 0
    );
}
