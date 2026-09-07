using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator;
using CV_Generator.Data;
using CV_Generator.Models;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/cv")]
public class CvsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ICurrentUserService _currentUser;
    private readonly IMinioStorageService _storage;
    private readonly IPdfThumbnailService _pdfThumbnails;

    public CvsController(AppDbContext db, ICurrentUserService currentUser, IMinioStorageService storage, IPdfThumbnailService pdfThumbnails)
    {
        _db = db;
        _currentUser = currentUser;
        _storage = storage;
        _pdfThumbnails = pdfThumbnails;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        var cvs = await _db.Cvs
            .Where(c => c.UserId == userId.Value)
            .Include(c => c.Versions.OrderByDescending(v => v.VersionNumber).Take(3))
            .OrderByDescending(c => c.UpdatedAt)
            .ToListAsync();
        return Ok(ApiResponse<List<Cv>>.Ok(cvs));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        var cv = await _db.Cvs.Include(c => c.Versions).FirstOrDefaultAsync(c => c.Id == id);
        if (cv == null || cv.UserId != userId.Value) return NotFound(ApiResponse<Cv>.Error("CV not found"));
        return Ok(ApiResponse<Cv>.Ok(cv));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CvInput input)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(input.Title))
            return BadRequest(ApiResponse<Cv>.Error("Title is required"));

        var cv = new Cv
        {
            UserId = userId.Value,
            Title = input.Title.Trim(),
            TemplateId = input.TemplateId ?? string.Empty,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            IsActive = true,
        };
        _db.Cvs.Add(cv);
        await _db.SaveChangesAsync();
        return Created($"/api/cv/{cv.Id}", ApiResponse<Cv>.Created(cv));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CvUpdateInput input)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        var cv = await _db.Cvs.FindAsync(id);
        if (cv == null || cv.UserId != userId.Value) return NotFound(ApiResponse<Cv>.Error("CV not found"));

        if (string.IsNullOrWhiteSpace(input.Title))
            return BadRequest(ApiResponse<Cv>.Error("Title is required"));

        cv.Title = input.Title.Trim();
        cv.TemplateId = input.TemplateId ?? cv.TemplateId;
        cv.IsActive = input.IsActive;
        cv.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        return Ok(ApiResponse<Cv>.Ok(cv));
    }

    [HttpPost("upload")]
    [RequestSizeLimit(50 * 1024 * 1024)]
    public async Task<IActionResult> UploadReady([FromForm] string? title, [FromForm] IFormFile? file)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        if (file == null || file.Length == 0)
            return BadRequest(ApiResponse<Cv>.Error("A file is required"));

        var cv = new Cv
        {
            UserId = userId.Value,
            Title = string.IsNullOrWhiteSpace(title) ? Path.GetFileNameWithoutExtension(file.FileName) : title.Trim(),
            TemplateId = "uploaded",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            IsActive = true,
        };
        _db.Cvs.Add(cv);
        await _db.SaveChangesAsync();

        var contentType = GetContentType(file.FileName);
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var objectKey = $"{userId.Value}/{cv.Id}/{Guid.NewGuid():N}{extension}";
        string url;
        byte[] pdfBytes;
        using (var ms = new MemoryStream())
        {
            await file.CopyToAsync(ms);
            pdfBytes = ms.ToArray();
            ms.Position = 0;
            url = await _storage.UploadAsync("cv-artifacts", objectKey, ms, contentType, file.Length);
        }

        // Best-effort first-page thumbnail for PDFs (Drive-style list preview).
        var thumbnailUrl = contentType == "application/pdf"
            ? await TryGenerateThumbnailAsync(pdfBytes, userId.Value, cv.Id)
            : null;

        var version = new CvVersion
        {
            CvId = cv.Id,
            VersionNumber = 1,
            Label = "Uploaded",
            FileUrl = url,
            PdfUrl = contentType == "application/pdf" ? url : null,
            ThumbnailUrl = thumbnailUrl,
            ContentJson = "{}",
            CreatedAt = DateTime.UtcNow,
        };
        _db.CvVersions.Add(version);
        await _db.SaveChangesAsync();

        cv.Versions = [version];
        return Created($"/api/cv/{cv.Id}", ApiResponse<Cv>.Created(cv));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        var cv = await _db.Cvs.FindAsync(id);
        if (cv == null || cv.UserId != userId.Value) return NotFound(ApiResponse<Cv>.Error("CV not found"));
        _db.Cvs.Remove(cv);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private async Task<string?> TryGenerateThumbnailAsync(byte[] pdf, Guid userId, Guid cvId)
    {
        try
        {
            var png = await _pdfThumbnails.RenderFirstPageAsync(pdf);
            if (png is null || png.Length == 0) return null;
            var thumbKey = $"{userId}/{cvId}/{Guid.NewGuid():N}.png";
            await using var stream = new MemoryStream(png);
            return await _storage.UploadAsync("cv-artifacts", thumbKey, stream, "image/png", png.Length);
        }
        catch (Exception)
        {
            // Thumbnails never fail an upload — the UI falls back to an icon.
            return null;
        }
    }

    private static string GetContentType(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() switch
    {
        ".pdf"  => "application/pdf",
        ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc"  => "application/msword",
        ".tex" or ".latex" => "application/x-tex",
        ".txt"  => "text/plain",
        ".html" or ".htm" => "text/html",
        _       => "application/octet-stream",
    };
}

public class CvInput
{
    public string Title { get; set; } = string.Empty;
    public string? TemplateId { get; set; }
}

public class CvUpdateInput
{
    public string Title { get; set; } = string.Empty;
    public string? TemplateId { get; set; }
    public bool IsActive { get; set; } = true;
}