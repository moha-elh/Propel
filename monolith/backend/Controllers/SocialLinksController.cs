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
public class SocialLinksController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SocialLinksController> _logger;

    public SocialLinksController(AppDbContext db, IServiceScopeFactory scopeFactory, ILogger<SocialLinksController> logger)
    {
        _db = db;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? userId)
    {
        userId ??= CurrentUserId;

        var links = userId.HasValue
            ? await _db.SocialLinks.Where(s => s.UserId == userId.Value).ToListAsync()
            : await _db.SocialLinks.ToListAsync();

        var response = links.Select(s => new SocialLinkResponseDto
        {
            Id = s.Id,
            Platform = s.Platform,
            Url = s.Url,
            UserId = s.UserId,
            SortOrder = s.SortOrder
        }).ToList();

        return Ok(ApiResponse<List<SocialLinkResponseDto>>.Ok(response));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var link = await _db.SocialLinks.FindAsync(id);
        if (link == null) return NotFound(ApiResponse<SocialLinkResponseDto>.Error("Social link not found"));

        var response = new SocialLinkResponseDto
        {
            Id = link.Id,
            Platform = link.Platform,
            Url = link.Url,
            UserId = link.UserId,
            SortOrder = link.SortOrder
        };
        return Ok(ApiResponse<SocialLinkResponseDto>.Ok(response));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateSocialLinkDto dto)
    {
        var link = new SocialLink { Platform = dto.Platform, Url = dto.Url, UserId = RequiredUserId, SortOrder = dto.SortOrder };
        _db.SocialLinks.Add(link);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, link.UserId, _logger, "SocialLink.Create");

        var response = new SocialLinkResponseDto { Id = link.Id, Platform = link.Platform, Url = link.Url, UserId = link.UserId, SortOrder = link.SortOrder };
        return CreatedAtAction(nameof(GetById), new { id = link.Id }, ApiResponse<SocialLinkResponseDto>.Created(response));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateSocialLinkDto dto)
    {
        var link = await _db.SocialLinks.FindAsync(id);
        if (link == null) return NotFound(ApiResponse<SocialLinkResponseDto>.Error("Social link not found"));

        link.Platform = dto.Platform;
        link.Url = dto.Url;
        link.SortOrder = dto.SortOrder;
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, link.UserId, _logger, "SocialLink.Update");

        var response = new SocialLinkResponseDto { Id = link.Id, Platform = link.Platform, Url = link.Url, UserId = link.UserId, SortOrder = link.SortOrder };
        return Ok(ApiResponse<SocialLinkResponseDto>.Ok(response));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var link = await _db.SocialLinks.FindAsync(id);
        if (link == null) return NotFound(ApiResponse<object>.Error("Social link not found"));

        _db.SocialLinks.Remove(link);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, link.UserId, _logger, "SocialLink.Delete");

        return NoContent();
    }
}
