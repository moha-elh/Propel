using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator.Data;
using CV_Generator.Models;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SkillsController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<SkillsController> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    public SkillsController(AppDbContext db, ILogger<SkillsController> logger, IServiceScopeFactory scopeFactory)
    {
        _db = db;
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? userId)
    {
        userId ??= CurrentUserId;

        var skills = userId.HasValue
            ? await _db.Skills.Where(s => s.UserId == userId.Value).ToListAsync()
            : await _db.Skills.ToListAsync();
        return Ok(ApiResponse<List<Skill>>.Ok(skills));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var skill = await _db.Skills.FindAsync(id);
        if (skill == null) return NotFound(ApiResponse<Skill>.Error("Skill not found"));
        return Ok(ApiResponse<Skill>.Ok(skill));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateSkillDto dto)
    {
        var skill = new Skill
        {
            Name = dto.Name,
            Level = dto.Level,
            YearsOfExperience = dto.YearsOfExperience,
            UserId = RequiredUserId,
            Category = dto.Category,
            Subcategory = dto.Subcategory,
            LastUsedYear = dto.LastUsedYear,
            IsCore = dto.IsCore,
            SortOrder = dto.SortOrder
        };

        _db.Skills.Add(skill);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, skill.UserId, _logger, "Skill.Create", skill.Id);

        _logger.LogInformation("Created skill {Id}", skill.Id);
        return Created($"/api/skills/{skill.Id}", ApiResponse<Skill>.Created(skill));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateSkillDto dto)
    {
        var skill = await _db.Skills.FindAsync(id);
        if (skill == null) return NotFound(ApiResponse<Skill>.Error("Skill not found"));

        skill.Name = dto.Name;
        skill.Level = dto.Level;
        skill.YearsOfExperience = dto.YearsOfExperience;
        skill.Category = dto.Category;
        skill.Subcategory = dto.Subcategory;
        skill.LastUsedYear = dto.LastUsedYear;
        skill.IsCore = dto.IsCore;
        skill.SortOrder = dto.SortOrder;

        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, skill.UserId, _logger, "Skill.Update", skill.Id);
        return Ok(ApiResponse<Skill>.Ok(skill));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var skill = await _db.Skills.FindAsync(id);
        if (skill == null) return NotFound(ApiResponse<object>.Error("Skill not found"));

        _db.Skills.Remove(skill);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, skill.UserId, _logger, "Skill.Delete", skill.Id);
        return NoContent();
    }

    public record CreateSkillDto(string Name, string? Level, int? YearsOfExperience, Guid UserId, string? Category, string? Subcategory = null, int? LastUsedYear = null, bool IsCore = false, int SortOrder = 0);
    public record UpdateSkillDto(string Name, string? Level, int? YearsOfExperience, string? Category, string? Subcategory = null, int? LastUsedYear = null, bool IsCore = false, int SortOrder = 0);
}
