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
public class CertificationsController : ApiControllerBase
{
    private readonly AppDbContext _db;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<CertificationsController> _logger;

    public CertificationsController(AppDbContext db, IServiceScopeFactory scopeFactory, ILogger<CertificationsController> logger)
    {
        _db = db;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? userId)
    {
        userId ??= CurrentUserId;

        var certs = userId.HasValue
            ? await _db.Certifications.Where(c => c.UserId == userId.Value).ToListAsync()
            : await _db.Certifications.ToListAsync();

        var response = certs.Select(c => new CertificationResponseDto
        {
            Id = c.Id,
            Name = c.Name,
            IssuingOrganization = c.IssuingOrganization,
            IssueDate = c.IssueDate,
            CredentialUrl = c.CredentialUrl,
            CredentialId = c.CredentialId,
            ExpiryDate = c.ExpiryDate,
            UserId = c.UserId,
            SortOrder = c.SortOrder
        }).ToList();

        return Ok(ApiResponse<List<CertificationResponseDto>>.Ok(response));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var c = await _db.Certifications.FindAsync(id);
        if (c == null) return NotFound(ApiResponse<CertificationResponseDto>.Error("Certification not found"));

        var response = new CertificationResponseDto
        {
            Id = c.Id,
            Name = c.Name,
            IssuingOrganization = c.IssuingOrganization,
            IssueDate = c.IssueDate,
            CredentialUrl = c.CredentialUrl,
            CredentialId = c.CredentialId,
            ExpiryDate = c.ExpiryDate,
            UserId = c.UserId,
            SortOrder = c.SortOrder
        };
        return Ok(ApiResponse<CertificationResponseDto>.Ok(response));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateCertificationDto dto)
    {
        var cert = new Certification
        {
            Name = dto.Name,
            IssuingOrganization = dto.IssuingOrganization,
            IssueDate = dto.IssueDate,
            CredentialUrl = dto.CredentialUrl,
            CredentialId = dto.CredentialId,
            ExpiryDate = dto.ExpiryDate,
            UserId = RequiredUserId,
            SortOrder = dto.SortOrder
        };

        _db.Certifications.Add(cert);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, cert.UserId, _logger, "Certification.Create", cert.Id);

        var response = new CertificationResponseDto
        {
            Id = cert.Id,
            Name = cert.Name,
            IssuingOrganization = cert.IssuingOrganization,
            IssueDate = cert.IssueDate,
            CredentialUrl = cert.CredentialUrl,
            CredentialId = cert.CredentialId,
            ExpiryDate = cert.ExpiryDate,
            UserId = cert.UserId,
            SortOrder = cert.SortOrder
        };
        return CreatedAtAction(nameof(GetById), new { id = cert.Id }, ApiResponse<CertificationResponseDto>.Created(response));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCertificationDto dto)
    {
        var cert = await _db.Certifications.FindAsync(id);
        if (cert == null) return NotFound(ApiResponse<CertificationResponseDto>.Error("Certification not found"));

        cert.Name = dto.Name;
        cert.IssuingOrganization = dto.IssuingOrganization;
        cert.IssueDate = dto.IssueDate;
        cert.CredentialUrl = dto.CredentialUrl;
        cert.CredentialId = dto.CredentialId;
        cert.ExpiryDate = dto.ExpiryDate;
        cert.SortOrder = dto.SortOrder;

        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, cert.UserId, _logger, "Certification.Update", cert.Id);

        var response = new CertificationResponseDto
        {
            Id = cert.Id,
            Name = cert.Name,
            IssuingOrganization = cert.IssuingOrganization,
            IssueDate = cert.IssueDate,
            CredentialUrl = cert.CredentialUrl,
            CredentialId = cert.CredentialId,
            ExpiryDate = cert.ExpiryDate,
            UserId = cert.UserId,
            SortOrder = cert.SortOrder
        };
        return Ok(ApiResponse<CertificationResponseDto>.Ok(response));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var cert = await _db.Certifications.FindAsync(id);
        if (cert == null) return NotFound(ApiResponse<object>.Error("Certification not found"));

        _db.Certifications.Remove(cert);
        await _db.SaveChangesAsync();
        SearchSyncHelper.TriggerSync(_scopeFactory, cert.UserId, _logger, "Certification.Delete", cert.Id);

        return NoContent();
    }
}
