using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator;
using CV_Generator.Models;
using CV_Generator.Data;
using CV_Generator.Dto;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/cvprofiles")]
public class CVProfilesController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CVProfilesController> _logger;

    public CVProfilesController(AppDbContext db, IServiceScopeFactory scopeFactory, ILogger<CVProfilesController> logger)
    {
        _db = db;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? userId)
    {
        userId ??= CurrentUserId;

        var profiles = userId.HasValue
            ? await _db.CVProfiles.Where(p => p.UserId == userId.Value).ToListAsync()
            : await _db.CVProfiles.ToListAsync();

        var response = profiles.Select(p => new CVProfileResponseDto
        {
            Id = p.Id,
            Title = p.Title,
            Summary = p.Summary,
            Email = p.Email,
            Phone = p.Phone,
            Location = p.Location,
            Website = p.Website,
            LinkedInUrl = p.LinkedInUrl,
            GithubUrl = p.GithubUrl,
            OpenToRelocate = p.OpenToRelocate,
            UserId = p.UserId
        }).ToList();

        return Ok(ApiResponse<List<CVProfileResponseDto>>.Ok(response));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var p = await _db.CVProfiles.FindAsync(id);
        if (p == null) return NotFound(ApiResponse<CVProfileResponseDto>.Error("CV Profile not found"));

        var response = new CVProfileResponseDto
        {
            Id = p.Id,
            Title = p.Title,
            Summary = p.Summary,
            Email = p.Email,
            Phone = p.Phone,
            Location = p.Location,
            Website = p.Website,
            LinkedInUrl = p.LinkedInUrl,
            GithubUrl = p.GithubUrl,
            OpenToRelocate = p.OpenToRelocate,
            UserId = p.UserId
        };
        return Ok(ApiResponse<CVProfileResponseDto>.Ok(response));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCVProfileDto dto)
    {
        var profile = new CVProfile { Title = dto.Title, Summary = dto.Summary, Email = dto.Email, Phone = dto.Phone, Location = dto.Location, Website = dto.Website, LinkedInUrl = dto.LinkedInUrl, GithubUrl = dto.GithubUrl, OpenToRelocate = dto.OpenToRelocate, UserId = RequiredUserId };

        _db.CVProfiles.Add(profile);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, profile.UserId, _logger, "CVProfile.Create");

        var response = new CVProfileResponseDto { Id = profile.Id, Title = profile.Title, Summary = profile.Summary, Email = profile.Email, Phone = profile.Phone, Location = profile.Location, Website = profile.Website, LinkedInUrl = profile.LinkedInUrl, GithubUrl = profile.GithubUrl, OpenToRelocate = profile.OpenToRelocate, UserId = profile.UserId };
        return CreatedAtAction(nameof(GetById), new { id = profile.Id }, ApiResponse<CVProfileResponseDto>.Created(response));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCVProfileDto dto)
    {
        var profile = await _db.CVProfiles.FindAsync(id);
        if (profile == null) return NotFound(ApiResponse<CVProfileResponseDto>.Error("CV Profile not found"));

        profile.Title = dto.Title;
        profile.Summary = dto.Summary;
        profile.Email = dto.Email;
        profile.Phone = dto.Phone;
        profile.Location = dto.Location;
        profile.Website = dto.Website;
        profile.LinkedInUrl = dto.LinkedInUrl;
        profile.GithubUrl = dto.GithubUrl;
        profile.OpenToRelocate = dto.OpenToRelocate;

        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, profile.UserId, _logger, "CVProfile.Update");

        var response = new CVProfileResponseDto { Id = profile.Id, Title = profile.Title, Summary = profile.Summary, Email = profile.Email, Phone = profile.Phone, Location = profile.Location, Website = profile.Website, LinkedInUrl = profile.LinkedInUrl, GithubUrl = profile.GithubUrl, OpenToRelocate = profile.OpenToRelocate, UserId = profile.UserId };
        return Ok(ApiResponse<CVProfileResponseDto>.Ok(response));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var profile = await _db.CVProfiles.FindAsync(id);
        if (profile == null) return NotFound(ApiResponse<object>.Error("CV Profile not found"));

        _db.CVProfiles.Remove(profile);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, profile.UserId, _logger, "CVProfile.Delete");

        return NoContent();
    }
}
