using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator;
using CV_Generator.Data;
using CV_Generator.Dto;
using CV_Generator.Models;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/cover-letters")]
public class CoverLettersController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ICurrentUserService _currentUser;
    private readonly IMinioStorageService _storage;
    private readonly IPdfThumbnailService _pdfThumbnails;
    private readonly ITextPdfService _textPdf;

    public CoverLettersController(
        AppDbContext db,
        ICurrentUserService currentUser,
        IMinioStorageService storage,
        IPdfThumbnailService pdfThumbnails,
        ITextPdfService textPdf)
    {
        _db = db;
        _currentUser = currentUser;
        _storage = storage;
        _pdfThumbnails = pdfThumbnails;
        _textPdf = textPdf;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();

        var letters = await _db.CoverLetters
            .Where(c => c.UserId == userId.Value)
            .Include(c => c.Versions.OrderByDescending(v => v.VersionNumber).Take(3))
            .OrderByDescending(c => c.UpdatedAt)
            .ToListAsync();

        var dtos = await MapAllAsync(letters);
        return Ok(ApiResponse<List<CoverLetterDto>>.Ok(dtos));
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        var letter = await _db.CoverLetters.Include(c => c.Versions)
            .FirstOrDefaultAsync(c => c.Id == id);
        if (letter == null || letter.UserId != userId.Value)
            return NotFound(ApiResponse<CoverLetterDto>.Error("Cover letter not found"));
        var dtos = await MapAllAsync([letter]);
        return Ok(ApiResponse<CoverLetterDto>.Ok(dtos[0]));
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CoverLetterInput input)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        if (string.IsNullOrWhiteSpace(input.Title))
            return BadRequest(ApiResponse<CoverLetterDto>.Error("Title is required"));
        if (!await CompanyOwnedAsync(input.CompanyId, userId.Value))
            return BadRequest(ApiResponse<CoverLetterDto>.Error("Company not found"));

        byte[]? pdfBytes = null;
        if (!string.IsNullOrWhiteSpace(input.Text))
        {
            var pdfTitle = input.IncludeTitleInPdf ? input.Title.Trim() : null;
            pdfBytes = await _textPdf.RenderTextAsync(input.Text.Trim(), pdfTitle);
            if (pdfBytes is null || pdfBytes.Length == 0)
                return StatusCode(502, ApiResponse<CoverLetterDto>.Error("Could not generate the letter PDF — the PDF service is unavailable. Try again or upload a file."));
        }

        var letter = new CoverLetter
        {
            UserId = userId.Value,
            Title = input.Title.Trim(),
            CompanyId = input.CompanyId,
            IsActive = input.IsActive,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        _db.CoverLetters.Add(letter);
        await _db.SaveChangesAsync();

        if (pdfBytes is not null)
        {
            var objectKey = $"{userId.Value}/{letter.Id}/{Guid.NewGuid():N}.pdf";
            string url;
            await using (var ms = new MemoryStream(pdfBytes))
            {
                url = await _storage.UploadAsync("cover-letter-artifacts", objectKey, ms, "application/pdf", pdfBytes.Length);
            }

            var thumbnailUrl = await TryGenerateThumbnailAsync(pdfBytes, userId.Value, letter.Id);

            _db.CoverLetterVersions.Add(new CoverLetterVersion
            {
                CoverLetterId = letter.Id,
                VersionNumber = 1,
                Label = "Generated",
                FileUrl = url,
                PdfUrl = url,
                ThumbnailUrl = thumbnailUrl,
                CreatedAt = DateTime.UtcNow,
            });
            await _db.SaveChangesAsync();
        }

        var dtos = await MapAllAsync([letter]);
        return Created($"/api/cover-letters/{letter.Id}", ApiResponse<CoverLetterDto>.Created(dtos[0]));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] CoverLetterInput input)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        var letter = await _db.CoverLetters.FindAsync(id);
        if (letter == null || letter.UserId != userId.Value)
            return NotFound(ApiResponse<CoverLetterDto>.Error("Cover letter not found"));
        if (string.IsNullOrWhiteSpace(input.Title))
            return BadRequest(ApiResponse<CoverLetterDto>.Error("Title is required"));
        if (!await CompanyOwnedAsync(input.CompanyId, userId.Value))
            return BadRequest(ApiResponse<CoverLetterDto>.Error("Company not found"));

        letter.Title = input.Title.Trim();
        letter.CompanyId = input.CompanyId;
        letter.IsActive = input.IsActive;
        letter.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        var dtos = await MapAllAsync([letter]);
        return Ok(ApiResponse<CoverLetterDto>.Ok(dtos[0]));
    }

    [HttpPost("upload")]
    [RequestSizeLimit(50 * 1024 * 1024)]
    public async Task<IActionResult> Upload([FromForm] string? title, [FromForm] Guid? companyId, [FromForm] IFormFile? file)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        if (file == null || file.Length == 0)
            return BadRequest(ApiResponse<CoverLetterDto>.Error("A file is required"));
        if (!await CompanyOwnedAsync(companyId, userId.Value))
            return BadRequest(ApiResponse<CoverLetterDto>.Error("Company not found"));

        var letter = new CoverLetter
        {
            UserId = userId.Value,
            Title = string.IsNullOrWhiteSpace(title) ? Path.GetFileNameWithoutExtension(file.FileName) : title.Trim(),
            CompanyId = companyId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            IsActive = true,
        };
        _db.CoverLetters.Add(letter);
        await _db.SaveChangesAsync();

        var contentType = GetContentType(file.FileName);
        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        var objectKey = $"{userId.Value}/{letter.Id}/{Guid.NewGuid():N}{extension}";
        string url;
        byte[] pdfBytes;
        using (var ms = new MemoryStream())
        {
            await file.CopyToAsync(ms);
            pdfBytes = ms.ToArray();
            ms.Position = 0;
            url = await _storage.UploadAsync("cover-letter-artifacts", objectKey, ms, contentType, file.Length);
        }

        var thumbnailUrl = contentType == "application/pdf"
            ? await TryGenerateThumbnailAsync(pdfBytes, userId.Value, letter.Id)
            : null;

        _db.CoverLetterVersions.Add(new CoverLetterVersion
        {
            CoverLetterId = letter.Id,
            VersionNumber = 1,
            Label = "Uploaded",
            FileUrl = url,
            PdfUrl = contentType == "application/pdf" ? url : null,
            ThumbnailUrl = thumbnailUrl,
            CreatedAt = DateTime.UtcNow,
        });
        await _db.SaveChangesAsync();

        var dtos = await MapAllAsync([letter]);
        return Created($"/api/cover-letters/{letter.Id}", ApiResponse<CoverLetterDto>.Created(dtos[0]));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        var letter = await _db.CoverLetters.FindAsync(id);
        if (letter == null || letter.UserId != userId.Value) return NotFound();
        _db.CoverLetters.Remove(letter);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ---------- Helpers ----------

    private async Task<List<CoverLetterDto>> MapAllAsync(List<CoverLetter> letters)
    {
        var companyIds = letters.Where(l => l.CompanyId.HasValue).Select(l => l.CompanyId!.Value).Distinct().ToList();
        var companyNames = companyIds.Count == 0
            ? new Dictionary<Guid, string>()
            : await _db.Companies.AsNoTracking()
                .Where(c => c.UserId == _currentUser.UserId!.Value && companyIds.Contains(c.Id))
                .ToDictionaryAsync(c => c.Id, c => c.Name);

        return letters.Select(l => new CoverLetterDto(
            l.Id, l.UserId, l.Title, l.CompanyId,
            l.CompanyId is { } cid ? companyNames.GetValueOrDefault(cid) : null,
            l.IsActive, l.CreatedAt, l.UpdatedAt,
            l.Versions.OrderByDescending(v => v.VersionNumber)
                .Select(v => new CoverLetterVersionDto(
                    v.Id, v.CoverLetterId, v.VersionNumber, v.Label,
                    v.FileUrl, v.PdfUrl, v.ThumbnailUrl, v.CreatedAt))
                .ToList()))
            .ToList();
    }

    private async Task<bool> CompanyOwnedAsync(Guid? companyId, Guid userId)
    {
        if (companyId is not { } id) return true;
        return await _db.Companies.AsNoTracking().AnyAsync(c => c.Id == id && c.UserId == userId);
    }

    private async Task<string?> TryGenerateThumbnailAsync(byte[] pdf, Guid userId, Guid letterId)
    {
        try
        {
            var png = await _pdfThumbnails.RenderFirstPageAsync(pdf);
            if (png is null || png.Length == 0) return null;
            var thumbKey = $"{userId}/{letterId}/{Guid.NewGuid():N}.png";
            await using var stream = new MemoryStream(png);
            return await _storage.UploadAsync("cover-letter-artifacts", thumbKey, stream, "image/png", png.Length);
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