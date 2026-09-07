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
public class InterestsController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<InterestsController> _logger;

    public InterestsController(AppDbContext db, IServiceScopeFactory scopeFactory, ILogger<InterestsController> logger)
    {
        _db = db;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? userId)
    {
        userId ??= CurrentUserId;

        var interests = userId.HasValue
            ? await _db.Interests.Where(i => i.UserId == userId.Value).ToListAsync()
            : await _db.Interests.ToListAsync();

        var response = interests.Select(i => new InterestResponseDto
        {
            Id = i.Id,
            Name = i.Name,
            UserId = i.UserId,
            SortOrder = i.SortOrder
        }).ToList();

        return Ok(ApiResponse<List<InterestResponseDto>>.Ok(response));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var interest = await _db.Interests.FindAsync(id);
        if (interest == null) return NotFound(ApiResponse<InterestResponseDto>.Error("Interest not found"));

        var response = new InterestResponseDto { Id = interest.Id, Name = interest.Name, UserId = interest.UserId, SortOrder = interest.SortOrder };
        return Ok(ApiResponse<InterestResponseDto>.Ok(response));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateInterestDto dto)
    {
        var interest = new Interest { Name = dto.Name, UserId = RequiredUserId, SortOrder = dto.SortOrder };
        _db.Interests.Add(interest);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, interest.UserId, _logger, "Interest.Create", interest.Id);

        var response = new InterestResponseDto { Id = interest.Id, Name = interest.Name, UserId = interest.UserId, SortOrder = interest.SortOrder };
        return CreatedAtAction(nameof(GetById), new { id = interest.Id }, ApiResponse<InterestResponseDto>.Created(response));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateInterestDto dto)
    {
        var interest = await _db.Interests.FindAsync(id);
        if (interest == null) return NotFound(ApiResponse<InterestResponseDto>.Error("Interest not found"));

        interest.Name = dto.Name;
        interest.SortOrder = dto.SortOrder;
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, interest.UserId, _logger, "Interest.Update", interest.Id);

        var response = new InterestResponseDto { Id = interest.Id, Name = interest.Name, UserId = interest.UserId, SortOrder = interest.SortOrder };
        return Ok(ApiResponse<InterestResponseDto>.Ok(response));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var interest = await _db.Interests.FindAsync(id);
        if (interest == null) return NotFound(ApiResponse<object>.Error("Interest not found"));

        _db.Interests.Remove(interest);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, interest.UserId, _logger, "Interest.Delete", interest.Id);

        return NoContent();
    }
}
