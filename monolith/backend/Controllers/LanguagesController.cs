using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator;
using CV_Generator.Models;
using CV_Generator.Data;
using CV_Generator.Dto;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/[controller]")]
public class LanguagesController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<LanguagesController> _logger;

    public LanguagesController(AppDbContext db, IServiceScopeFactory scopeFactory, ILogger<LanguagesController> logger)
    {
        _db = db;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? userId)
    {
        userId ??= CurrentUserId;

        var languages = userId.HasValue
            ? await _db.Languages.Where(l => l.UserId == userId.Value).ToListAsync()
            : await _db.Languages.ToListAsync();

        var response = languages.Select(l => new LanguageResponseDto
        {
            Id = l.Id,
            Name = l.Name,
            Level = l.Level,
            UserId = l.UserId,
            SortOrder = l.SortOrder
        }).ToList();

        return Ok(ApiResponse<List<LanguageResponseDto>>.Ok(response));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var l = await _db.Languages.FindAsync(id);
        if (l == null) return NotFound(ApiResponse<LanguageResponseDto>.Error("Language not found"));

        var response = new LanguageResponseDto
        {
            Id = l.Id,
            Name = l.Name,
            Level = l.Level,
            UserId = l.UserId,
            SortOrder = l.SortOrder
        };
        return Ok(ApiResponse<LanguageResponseDto>.Ok(response));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateLanguageDto dto)
    {
        var language = new Language { Name = dto.Name, Level = dto.Level, UserId = RequiredUserId, SortOrder = dto.SortOrder };
        _db.Languages.Add(language);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, language.UserId, _logger, "Language.Create", language.Id);

        var response = new LanguageResponseDto { Id = language.Id, Name = language.Name, Level = language.Level, UserId = language.UserId, SortOrder = language.SortOrder };
        return CreatedAtAction(nameof(GetById), new { id = language.Id }, ApiResponse<LanguageResponseDto>.Created(response));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateLanguageDto dto)
    {
        var language = await _db.Languages.FindAsync(id);
        if (language == null) return NotFound(ApiResponse<LanguageResponseDto>.Error("Language not found"));

        language.Name = dto.Name;
        language.Level = dto.Level;
        language.SortOrder = dto.SortOrder;
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, language.UserId, _logger, "Language.Update", language.Id);

        var response = new LanguageResponseDto { Id = language.Id, Name = language.Name, Level = language.Level, UserId = language.UserId, SortOrder = language.SortOrder };
        return Ok(ApiResponse<LanguageResponseDto>.Ok(response));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var language = await _db.Languages.FindAsync(id);
        if (language == null) return NotFound(ApiResponse<object>.Error("Language not found"));

        _db.Languages.Remove(language);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, language.UserId, _logger, "Language.Delete", language.Id);

        return NoContent();
    }
}
