using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator;
using CV_Generator.Data;
using CV_Generator.Dto;
using CV_Generator.Models;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/cover-letters/versions")]
public class CoverLetterVersionsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ICurrentUserService _currentUser;
    private readonly IMinioStorageService _storage;
    private readonly IPdfThumbnailService _pdfThumbnails;

    public CoverLetterVersionsController(
        AppDbContext db,
        ICurrentUserService currentUser,
        IMinioStorageService storage,
        IPdfThumbnailService pdfThumbnails)
    {
        _db = db;
        _currentUser = currentUser;
        _storage = storage;
        _pdfThumbnails = pdfThumbnails;
    }

    [HttpGet("{coverLetterId}")]
    public async Task<IActionResult> GetByCoverLetterId(Guid coverLetterId)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        var owned = await _db.CoverLetters.AsNoTracking()
            .AnyAsync(c => c.Id == coverLetterId && c.UserId == userId.Value);
        if (!owned) return NotFound(ApiResponse<List<CoverLetterVersionDto>>.Error("Cover letter not found"));

        var versions = await _db.CoverLetterVersions.AsNoTracking()
            .Where(v => v.CoverLetterId == coverLetterId)
            .OrderByDescending(v => v.VersionNumber)
            .ToListAsync();
        var dtos = versions.Select(Map).ToList();
        return Ok(ApiResponse<List<CoverLetterVersionDto>>.Ok(dtos));
    }

    [HttpGet("{id}/file")]
    public async Task<IActionResult> GetFile(Guid id, [FromQuery] bool download = false)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();

        var version = await _db.CoverLetterVersions.Include(v => v.CoverLetter)
            .FirstOrDefaultAsync(v => v.Id == id);
        if (version == null || version.CoverLetter.UserId != userId.Value)
            return NotFound(ApiResponse<CoverLetterVersionDto>.Error("Version not found"));

        var url = download ? version.FileUrl ?? version.PdfUrl : version.PdfUrl ?? version.FileUrl;
        if (string.IsNullOrWhiteSpace(url))
            return NotFound(ApiResponse<CoverLetterVersionDto>.Error("File is not available"));

        if (!TryResolveObject(url, out var bucket, out var key))
            return BadRequest(ApiResponse<CoverLetterVersionDto>.Error("Stored file URL is invalid"));

        byte[] bytes;
        try
        {
            bytes = await _storage.GetObjectAsync(bucket, key, HttpContext.RequestAborted);
        }
        catch (Exception)
        {
            return NotFound(ApiResponse<CoverLetterVersionDto>.Error("File could not be read from storage"));
        }

        if (bytes.Length == 0) return NotFound(ApiResponse<CoverLetterVersionDto>.Error("File is empty"));

        var contentType = Path.GetExtension(url).ToLowerInvariant() switch
        {
            ".pdf"  => "application/pdf",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".doc"  => "application/msword",
            ".tex" or ".latex" => "application/x-tex",
            ".txt"  => "text/plain",
            _       => "application/octet-stream",
        };

        var fileName = Path.GetFileName(url);
        Response.Headers.ContentDisposition = download
            ? $"attachment; filename=\"{fileName}\""
            : "inline";
        return File(bytes, contentType);
    }

    [HttpGet("{id}/thumbnail")]
    public async Task<IActionResult> GetThumbnail(Guid id)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();

        var version = await _db.CoverLetterVersions.Include(v => v.CoverLetter)
            .FirstOrDefaultAsync(v => v.Id == id);
        if (version == null || version.CoverLetter.UserId != userId.Value)
            return NotFound(ApiResponse<CoverLetterVersionDto>.Error("Version not found"));

        if (string.IsNullOrWhiteSpace(version.ThumbnailUrl))
        {
            if (string.IsNullOrWhiteSpace(version.PdfUrl))
                return NotFound(ApiResponse<CoverLetterVersionDto>.Error("No thumbnail available"));

            if (TryResolveObject(version.PdfUrl, out var pdfBucket, out var pdfKey))
            {
                byte[] pdfBytes;
                try
                {
                    pdfBytes = await _storage.GetObjectAsync(pdfBucket, pdfKey, HttpContext.RequestAborted);
                }
                catch (Exception)
                {
                    return NotFound(ApiResponse<CoverLetterVersionDto>.Error("PDF could not be read from storage"));
                }

                var png = pdfBytes.Length > 0
                    ? await _pdfThumbnails.RenderFirstPageAsync(pdfBytes, HttpContext.RequestAborted)
                    : null;

                if (png is { Length: > 0 })
                {
                    try
                    {
                        var thumbKey = $"{userId.Value}/{version.CoverLetterId}/{Guid.NewGuid():N}.png";
                        await using var stream = new MemoryStream(png);
                        var url = await _storage.UploadAsync("cover-letter-artifacts", thumbKey, stream, "image/png", png.Length);
                        version.ThumbnailUrl = url;
                        await _db.SaveChangesAsync();
                    }
                    catch (Exception)
                    {
                        // Persisting is optional — the generated PNG is streamed below either way.
                    }
                    Response.Headers.CacheControl = "public, max-age=86400";
                    return File(png, "image/png");
                }
            }
            return NotFound(ApiResponse<CoverLetterVersionDto>.Error("No thumbnail available"));
        }

        if (!TryResolveObject(version.ThumbnailUrl, out var bucket, out var key))
            return BadRequest(ApiResponse<CoverLetterVersionDto>.Error("Stored thumbnail URL is invalid"));

        byte[] bytes;
        try
        {
            bytes = await _storage.GetObjectAsync(bucket, key, HttpContext.RequestAborted);
        }
        catch (Exception)
        {
            return NotFound(ApiResponse<CoverLetterVersionDto>.Error("Thumbnail could not be read from storage"));
        }

        if (bytes.Length == 0) return NotFound(ApiResponse<CoverLetterVersionDto>.Error("Thumbnail is empty"));

        Response.Headers.CacheControl = "public, max-age=86400";
        return File(bytes, "image/png");
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        var version = await _db.CoverLetterVersions.Include(v => v.CoverLetter)
            .FirstOrDefaultAsync(v => v.Id == id);
        if (version == null) return NotFound();
        if (version.CoverLetter.UserId != userId.Value) return NotFound();
        _db.CoverLetterVersions.Remove(version);
        await _db.SaveChangesAsync();
        return NoContent();
    }

    private static CoverLetterVersionDto Map(CoverLetterVersion v) => new(
        v.Id, v.CoverLetterId, v.VersionNumber, v.Label,
        v.FileUrl, v.PdfUrl, v.ThumbnailUrl, v.CreatedAt);

    private static bool TryResolveObject(string url, out string bucket, out string key)
    {
        bucket = string.Empty;
        key = string.Empty;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;
        var path = uri.AbsolutePath.TrimStart('/');
        var sep = path.IndexOf('/');
        if (sep <= 0 || sep == path.Length - 1) return false;
        bucket = path[..sep];
        key = path[(sep + 1)..];
        return true;
    }
}