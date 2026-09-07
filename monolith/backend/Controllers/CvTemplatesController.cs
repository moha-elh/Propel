using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator;
using CV_Generator.Data;
using CV_Generator.Models;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/cv/templates")]
public class CvTemplatesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ICurrentUserService _currentUser;

    public CvTemplatesController(AppDbContext db, ICurrentUserService currentUser)
    {
        _db = db;
        _currentUser = currentUser;
    }

    // GET /api/cv/templates
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var userId = _currentUser.UserId;
        var templates = await _db.CvTemplates
            .Where(t => t.IsSystem || (userId != null && t.UserId == userId.Value))
            .OrderByDescending(t => t.IsSystem)
            .ThenBy(t => t.Name)
            .ToListAsync();
        return Ok(ApiResponse<List<CvTemplate>>.Ok(templates));
    }

    // GET /api/cv/templates/{id}
    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var template = await _db.CvTemplates.FindAsync(id);
        if (template == null) return NotFound(ApiResponse<CvTemplate>.Error("Template not found"));
        if (!CanAccess(template)) return Forbid();
        return Ok(ApiResponse<CvTemplate>.Ok(template));
    }

    // POST /api/cv/templates
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CvTemplateInput input)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();

        if (string.IsNullOrWhiteSpace(input.Name))
            return BadRequest(ApiResponse<CvTemplate>.Error("Template name is required"));
        if (string.IsNullOrWhiteSpace(input.Content))
            return BadRequest(ApiResponse<CvTemplate>.Error("Template content is required"));
        if (input.TemplateType is not ("latex" or "html" or "pdf"))
            return BadRequest(ApiResponse<CvTemplate>.Error("TemplateType must be latex, html or pdf"));

        var template = new CvTemplate
        {
            Name = input.Name.Trim(),
            Description = input.Description?.Trim() ?? string.Empty,
            TemplateType = input.TemplateType,
            Content = input.Content,
            IsSystem = false,
            UserId = userId.Value,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        _db.CvTemplates.Add(template);
        await _db.SaveChangesAsync();
        return Created($"/api/cv/templates/{template.Id}", ApiResponse<CvTemplate>.Created(template));
    }

    // PUT /api/cv/templates/{id}
    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CvTemplateInput input)
    {
        var template = await _db.CvTemplates.FindAsync(id);
        if (template == null) return NotFound(ApiResponse<CvTemplate>.Error("Template not found"));
        if (!CanAccess(template)) return Forbid();

        if (string.IsNullOrWhiteSpace(input.Name))
            return BadRequest(ApiResponse<CvTemplate>.Error("Template name is required"));
        if (string.IsNullOrWhiteSpace(input.Content))
            return BadRequest(ApiResponse<CvTemplate>.Error("Template content is required"));
        if (input.TemplateType is not ("latex" or "html" or "pdf"))
            return BadRequest(ApiResponse<CvTemplate>.Error("TemplateType must be latex, html or pdf"));

        template.Name = input.Name.Trim();
        template.Description = input.Description?.Trim() ?? string.Empty;
        template.TemplateType = input.TemplateType;
        template.Content = input.Content;
        template.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ApiResponse<CvTemplate>.Ok(template));
    }

    // DELETE /api/cv/templates/{id}
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var template = await _db.CvTemplates.FindAsync(id);
        if (template == null) return NotFound(ApiResponse<CvTemplate>.Error("Template not found"));
        if (template.IsSystem)
            return BadRequest(ApiResponse<CvTemplate>.Error("System templates cannot be deleted"));
        if (!CanAccess(template)) return Forbid();

        _db.CvTemplates.Remove(template);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private bool CanAccess(CvTemplate template) =>
        template.IsSystem || (template.UserId != null && template.UserId == _currentUser.UserId);
}

public class CvTemplateInput
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string TemplateType { get; set; } = "latex";
    public string Content { get; set; } = string.Empty;
}