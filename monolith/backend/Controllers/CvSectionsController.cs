using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator;
using CV_Generator.Data;
using CV_Generator.Models;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/cv/sections")]
public class CvSectionsController : ControllerBase
{
    private readonly AppDbContext _db;

    public CvSectionsController(AppDbContext db) => _db = db;

    [HttpGet("{versionId}")]
    public async Task<IActionResult> GetByVersionId(Guid versionId)
    {
        var sections = await _db.CvSections.Where(s => s.VersionId == versionId).OrderBy(s => s.DisplayOrder).ToListAsync();
        return Ok(ApiResponse<List<CvSection>>.Ok(sections));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CvSection section)
    {
        section.UpdatedAt = DateTime.UtcNow;
        _db.CvSections.Add(section);
        await _db.SaveChangesAsync();
        return Created($"/api/cv/sections/{section.Id}", ApiResponse<CvSection>.Created(section));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var section = await _db.CvSections.FindAsync(id);
        if (section == null) return NotFound();
        _db.CvSections.Remove(section);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}
