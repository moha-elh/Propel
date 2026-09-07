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
public class EducationsController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<EducationsController> _logger;
    private readonly IServiceScopeFactory _scopeFactory;

    public EducationsController(AppDbContext db, ILogger<EducationsController> logger, IServiceScopeFactory scopeFactory)
    {
        _db = db;
        _logger = logger;
        _scopeFactory = scopeFactory;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? userId)
    {
        userId ??= CurrentUserId;

        var educations = userId.HasValue
            ? await _db.Educations.Where(e => e.UserId == userId.Value).ToListAsync()
            : await _db.Educations.ToListAsync();

        var response = educations.Select(e => new EducationResponseDto
        {
            Id = e.Id,
            InstitutionName = e.InstitutionName,
            DegreeType = e.DegreeType,
            FieldOfStudy = e.FieldOfStudy,
            Specialization = e.Specialization,
            StartDate = e.StartDate,
            EndDate = e.EndDate,
            Status = e.Status,
            City = e.City,
            DiplomaFileUrl = e.DiplomaFileUrl,
            UserId = e.UserId
        }).ToList();

        return Ok(ApiResponse<List<EducationResponseDto>>.Ok(response));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var e = await _db.Educations.FindAsync(id);
        if (e == null) return NotFound(ApiResponse<EducationResponseDto>.Error("Education not found"));

        var response = new EducationResponseDto
        {
            Id = e.Id,
            InstitutionName = e.InstitutionName,
            DegreeType = e.DegreeType,
            FieldOfStudy = e.FieldOfStudy,
            Specialization = e.Specialization,
            StartDate = e.StartDate,
            EndDate = e.EndDate,
            Status = e.Status,
            City = e.City,
            DiplomaFileUrl = e.DiplomaFileUrl,
            Grade = e.Grade,
            Description = e.Description,
            Country = e.Country,
            UserId = e.UserId,
            SortOrder = e.SortOrder
        };

        return Ok(ApiResponse<EducationResponseDto>.Ok(response));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateEducationDto dto)
    {
        var edu = new Education
        {
            InstitutionName = dto.InstitutionName,
            DegreeType = dto.DegreeType,
            FieldOfStudy = dto.FieldOfStudy,
            Specialization = dto.Specialization,
            StartDate = dto.StartDate,
            EndDate = dto.EndDate,
            Status = dto.Status,
            City = dto.City,
            DiplomaFileUrl = dto.DiplomaFileUrl,
            Grade = dto.Grade,
            Description = dto.Description,
            Country = dto.Country,
            UserId = RequiredUserId,
            SortOrder = dto.SortOrder
        };

        _db.Educations.Add(edu);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, edu.UserId, _logger, "Education.Create", edu.Id);

        _logger.LogInformation("Created education {Id}", edu.Id);

        var response = new EducationResponseDto
        {
            Id = edu.Id,
            InstitutionName = edu.InstitutionName,
            DegreeType = edu.DegreeType,
            FieldOfStudy = edu.FieldOfStudy,
            Specialization = edu.Specialization,
            StartDate = edu.StartDate,
            EndDate = edu.EndDate,
            Status = edu.Status,
            City = edu.City,
            DiplomaFileUrl = edu.DiplomaFileUrl,
            Grade = edu.Grade,
            Description = edu.Description,
            Country = edu.Country,
            UserId = edu.UserId,
            SortOrder = edu.SortOrder
        };

        return Created($"/api/educations/{edu.Id}", ApiResponse<EducationResponseDto>.Created(response));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateEducationDto dto)
    {
        var edu = await _db.Educations.FindAsync(id);
        if (edu == null) return NotFound(ApiResponse<EducationResponseDto>.Error("Education not found"));

        edu.InstitutionName = dto.InstitutionName;
        edu.DegreeType = dto.DegreeType;
        edu.FieldOfStudy = dto.FieldOfStudy;
        edu.Specialization = dto.Specialization;
        edu.StartDate = dto.StartDate;
        edu.EndDate = dto.EndDate;
        edu.Status = dto.Status;
        edu.City = dto.City;
        edu.DiplomaFileUrl = dto.DiplomaFileUrl;
        edu.Grade = dto.Grade;
        edu.Description = dto.Description;
        edu.Country = dto.Country;
        edu.SortOrder = dto.SortOrder;

        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, edu.UserId, _logger, "Education.Update", edu.Id);

        var response = new EducationResponseDto
        {
            Id = edu.Id,
            InstitutionName = edu.InstitutionName,
            DegreeType = edu.DegreeType,
            FieldOfStudy = edu.FieldOfStudy,
            Specialization = edu.Specialization,
            StartDate = edu.StartDate,
            EndDate = edu.EndDate,
            Status = edu.Status,
            City = edu.City,
            DiplomaFileUrl = edu.DiplomaFileUrl,
            Grade = edu.Grade,
            Description = edu.Description,
            Country = edu.Country,
            UserId = edu.UserId,
            SortOrder = edu.SortOrder
        };

        return Ok(ApiResponse<EducationResponseDto>.Ok(response));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var edu = await _db.Educations.FindAsync(id);
        if (edu == null) return NotFound(ApiResponse<object>.Error("Education not found"));

        _db.Educations.Remove(edu);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, edu.UserId, _logger, "Education.Delete", edu.Id);

        _logger.LogInformation("Deleted education {Id}", id);
        return NoContent();
    }
}
