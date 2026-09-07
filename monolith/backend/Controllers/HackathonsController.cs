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
public class HackathonsController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<HackathonsController> _logger;

    public HackathonsController(AppDbContext db, IServiceScopeFactory scopeFactory, ILogger<HackathonsController> logger)
    {
        _db = db;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? userId)
    {
        userId ??= CurrentUserId;

        var hackathons = userId.HasValue
            ? await _db.Hackathons.Where(h => h.UserId == userId.Value).ToListAsync()
            : await _db.Hackathons.ToListAsync();

        var response = hackathons.Select(h => new HackathonResponseDto
        {
            Id = h.Id,
            Name = h.Name,
            Organization = h.Organization,
            Date = h.Date,
            StartDate = h.StartDate,
            EndDate = h.EndDate,
            Description = h.Description,
            Role = h.Role,
            Result = h.Result,
            ProjectUrl = h.ProjectUrl,
            UserId = h.UserId,
            SortOrder = h.SortOrder
        }).ToList();

        return Ok(ApiResponse<List<HackathonResponseDto>>.Ok(response));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var h = await _db.Hackathons.FindAsync(id);
        if (h == null) return NotFound(ApiResponse<HackathonResponseDto>.Error("Hackathon not found"));

        var response = new HackathonResponseDto
        {
            Id = h.Id,
            Name = h.Name,
            Organization = h.Organization,
            Date = h.Date,
            StartDate = h.StartDate,
            EndDate = h.EndDate,
            Description = h.Description,
            Role = h.Role,
            Result = h.Result,
            ProjectUrl = h.ProjectUrl,
            UserId = h.UserId,
            SortOrder = h.SortOrder
        };
        return Ok(ApiResponse<HackathonResponseDto>.Ok(response));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateHackathonDto dto)
    {
        var h = new Hackathon
        {
            Name = dto.Name,
            Organization = dto.Organization,
            Date = dto.Date,
            StartDate = dto.StartDate,
            EndDate = dto.EndDate,
            Description = dto.Description,
            Role = dto.Role,
            Result = dto.Result,
            ProjectUrl = dto.ProjectUrl,
            UserId = RequiredUserId,
            SortOrder = dto.SortOrder
        };

        _db.Hackathons.Add(h);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, h.UserId, _logger, "Hackathon.Create", h.Id);

        var response = new HackathonResponseDto
        {
            Id = h.Id,
            Name = h.Name,
            Organization = h.Organization,
            Date = h.Date,
            StartDate = h.StartDate,
            EndDate = h.EndDate,
            Description = h.Description,
            Role = h.Role,
            Result = h.Result,
            ProjectUrl = h.ProjectUrl,
            UserId = h.UserId,
            SortOrder = h.SortOrder
        };
        return CreatedAtAction(nameof(GetById), new { id = h.Id }, ApiResponse<HackathonResponseDto>.Created(response));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateHackathonDto dto)
    {
        var h = await _db.Hackathons.FindAsync(id);
        if (h == null) return NotFound(ApiResponse<HackathonResponseDto>.Error("Hackathon not found"));

        h.Name = dto.Name;
        h.Organization = dto.Organization;
        h.Date = dto.Date;
        h.StartDate = dto.StartDate;
        h.EndDate = dto.EndDate;
        h.Description = dto.Description;
        h.Role = dto.Role;
        h.Result = dto.Result;
        h.ProjectUrl = dto.ProjectUrl;
        h.SortOrder = dto.SortOrder;

        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, h.UserId, _logger, "Hackathon.Update", h.Id);

        var response = new HackathonResponseDto
        {
            Id = h.Id,
            Name = h.Name,
            Organization = h.Organization,
            Date = h.Date,
            StartDate = h.StartDate,
            EndDate = h.EndDate,
            Description = h.Description,
            Role = h.Role,
            Result = h.Result,
            ProjectUrl = h.ProjectUrl,
            UserId = h.UserId,
            SortOrder = h.SortOrder
        };
        return Ok(ApiResponse<HackathonResponseDto>.Ok(response));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var h = await _db.Hackathons.FindAsync(id);
        if (h == null) return NotFound(ApiResponse<object>.Error("Hackathon not found"));

        _db.Hackathons.Remove(h);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, h.UserId, _logger, "Hackathon.Delete", h.Id);

        return NoContent();
    }
}
