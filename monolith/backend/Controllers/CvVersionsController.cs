using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator;
using CV_Generator.Data;
using CV_Generator.Models;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/cv/versions")]
public class CvVersionsController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ICurrentUserService _currentUser;
    private readonly IMinioStorageService _storage;
    private readonly IPdfThumbnailService _pdfThumbnails;

    public CvVersionsController(
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

    [HttpGet("{cvId}")]
    public async Task<IActionResult> GetByCvId(Guid cvId)
    {
        var versions = await _db.CvVersions.Where(v => v.CvId == cvId).Include(v => v.Sections).ToListAsync();
        return Ok(ApiResponse<List<CvVersion>>.Ok(versions));
    }

    // GET /api/cv/versions/{id}/file — same-origin stream (browsers can't iframe the
    // cross-origin MinIO PDF because their built-in viewer needs CORS).
    [HttpGet("{id}/file")]
    public async Task<IActionResult> GetFile(Guid id, [FromQuery] bool download = false)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();

        var version = await _db.CvVersions.Include(v => v.Cv).FirstOrDefaultAsync(v => v.Id == id);
        if (version == null || version.Cv.UserId != userId.Value)
            return NotFound(ApiResponse<CvVersion>.Error("Version not found"));

        var url = download ? version.FileUrl ?? version.PdfUrl : version.PdfUrl ?? version.FileUrl;
        if (string.IsNullOrWhiteSpace(url))
            return NotFound(ApiResponse<CvVersion>.Error("File is not available"));

        if (!TryResolveObject(url, out var bucket, out var key))
            return BadRequest(ApiResponse<CvVersion>.Error("Stored file URL is invalid"));

        byte[] bytes;
        try
        {
            bytes = await _storage.GetObjectAsync(bucket, key, HttpContext.RequestAborted);
        }
        catch (Exception)
        {
            return NotFound(ApiResponse<CvVersion>.Error("File could not be read from storage"));
        }

        if (bytes.Length == 0) return NotFound(ApiResponse<CvVersion>.Error("File is empty"));

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

    // GET /api/cv/versions/{id}/thumbnail — first-page PNG for list previews.
    // Self-healing: when no thumbnail has been generated yet but the version
    // has a PDF, this renders the first page on first view and persists it.
    [HttpGet("{id}/thumbnail")]
    public async Task<IActionResult> GetThumbnail(Guid id)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();

        var version = await _db.CvVersions.Include(v => v.Cv).FirstOrDefaultAsync(v => v.Id == id);
        if (version == null || version.Cv.UserId != userId.Value)
            return NotFound(ApiResponse<CvVersion>.Error("Version not found"));

        if (string.IsNullOrWhiteSpace(version.ThumbnailUrl))
        {
            if (string.IsNullOrWhiteSpace(version.PdfUrl))
                return NotFound(ApiResponse<CvVersion>.Error("No thumbnail available"));

            if (TryResolveObject(version.PdfUrl, out var pdfBucket, out var pdfKey))
            {
                byte[] pdfBytes;
                try
                {
                    pdfBytes = await _storage.GetObjectAsync(pdfBucket, pdfKey, HttpContext.RequestAborted);
                }
                catch (Exception)
                {
                    return NotFound(ApiResponse<CvVersion>.Error("PDF could not be read from storage"));
                }

                var png = pdfBytes.Length > 0
                    ? await _pdfThumbnails.RenderFirstPageAsync(pdfBytes, HttpContext.RequestAborted)
                    : null;

                if (png is { Length: > 0 })
                {
                    try
                    {
                        var thumbKey = $"{userId.Value}/{version.CvId}/{Guid.NewGuid():N}.png";
                        await using var stream = new MemoryStream(png);
                        var url = await _storage.UploadAsync("cv-artifacts", thumbKey, stream, "image/png", png.Length);
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
            return NotFound(ApiResponse<CvVersion>.Error("No thumbnail available"));
        }

        if (!TryResolveObject(version.ThumbnailUrl, out var bucket, out var key))
            return BadRequest(ApiResponse<CvVersion>.Error("Stored thumbnail URL is invalid"));

        byte[] bytes;
        try
        {
            bytes = await _storage.GetObjectAsync(bucket, key, HttpContext.RequestAborted);
        }
        catch (Exception)
        {
            return NotFound(ApiResponse<CvVersion>.Error("Thumbnail could not be read from storage"));
        }

        if (bytes.Length == 0) return NotFound(ApiResponse<CvVersion>.Error("Thumbnail is empty"));

        Response.Headers.CacheControl = "public, max-age=86400";
        return File(bytes, "image/png");
    }

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

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CvVersion version)
    {
        version.CreatedAt = DateTime.UtcNow;
        _db.CvVersions.Add(version);
        await _db.SaveChangesAsync();
        return Created($"/api/cv/versions/{version.Id}", ApiResponse<CvVersion>.Created(version));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var version = await _db.CvVersions.FindAsync(id);
        if (version == null) return NotFound();
        _db.CvVersions.Remove(version);
        await _db.SaveChangesAsync();
        return NoContent();
    }
}