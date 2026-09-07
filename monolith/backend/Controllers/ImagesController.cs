using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CV_Generator.Data;
using CV_Generator.Dto;
using CV_Generator.Models;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Authorize]
[Route("api/images")]
public class ImagesController : ControllerBase
{
    private const string Bucket = "profile-images";
    private const long MaxUploadBytes = 10 * 1024 * 1024;
    private static readonly string[] AllowedExtensions = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

    private readonly AppDbContext _db;
    private readonly ICurrentUserService _currentUser;
    private readonly IMinioStorageService _storage;
    private readonly IHttpClientFactory _httpClientFactory;

    public ImagesController(
        AppDbContext db,
        ICurrentUserService currentUser,
        IMinioStorageService storage,
        IHttpClientFactory httpClientFactory)
    {
        _db = db;
        _currentUser = currentUser;
        _storage = storage;
        _httpClientFactory = httpClientFactory;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] int page = 1, [FromQuery] int pageSize = 40, [FromQuery] string? search = null)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var query = _db.UserImages.AsNoTracking().Where(i => i.UserId == userId.Value);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim().ToLower();
            query = query.Where(i => i.Name.ToLower().Contains(term));
        }

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(i => i.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(ApiResponse<ImageListResponse>.Ok(new ImageListResponse
        {
            Items = items.Select(ToDto).ToList(),
            Total = total
        }));
    }

    [HttpPost]
    [RequestSizeLimit(MaxUploadBytes)]
    public async Task<IActionResult> Upload([FromForm] string? name, [FromForm] IFormFile? file)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();
        if (file == null || file.Length == 0)
            return BadRequest(ApiResponse<ImageDto>.Error("An image file is required"));
        if (file.Length > MaxUploadBytes)
            return BadRequest(ApiResponse<ImageDto>.Error("Image must be 10MB or smaller"));

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedExtensions.Contains(extension))
            return BadRequest(ApiResponse<ImageDto>.Error("Only JPG, PNG, WebP and GIF images are allowed"));

        var contentType = GetContentType(file.FileName);
        var image = new UserImage
        {
            Id = Guid.NewGuid(),
            UserId = userId.Value,
            Name = string.IsNullOrWhiteSpace(name) ? Path.GetFileNameWithoutExtension(file.FileName) : name.Trim(),
            ContentType = contentType,
            SizeBytes = file.Length,
            Source = "upload",
            CreatedAt = DateTime.UtcNow
        };

        var objectKey = $"{userId.Value}/{image.Id}/{Guid.NewGuid():N}{extension}";
        string url;
        using (var ms = new MemoryStream())
        {
            await file.CopyToAsync(ms);
            ms.Position = 0;
            url = await _storage.UploadAsync(Bucket, objectKey, ms, contentType, ms.Length);
        }

        image.ObjectKey = objectKey;
        image.Url = url;
        _db.UserImages.Add(image);
        await _db.SaveChangesAsync();

        return Created($"/api/images/{image.Id}", ApiResponse<ImageDto>.Created(ToDto(image)));
    }

    [HttpPost("from-url")]
    public async Task<IActionResult> FromUrl([FromBody] FromUrlImageDto dto)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();

        var url = dto.Url?.Trim() ?? "";
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) ||
            (uri.Scheme != "http" && uri.Scheme != "https"))
            return BadRequest(ApiResponse<ImageDto>.Error("A valid http(s) URL is required"));

        var imageId = Guid.NewGuid();
        var image = new UserImage
        {
            Id = imageId,
            UserId = userId.Value,
            Name = string.IsNullOrWhiteSpace(dto.Name) ? Path.GetFileName(uri.AbsolutePath)?.Trim() ?? "Image" : dto.Name.Trim(),
            Url = url,
            Source = "url",
            CreatedAt = DateTime.UtcNow
        };

        // Best-effort: download into MinIO so the image is usable everywhere (CV photo, thumbnails).
        try
        {
            using var client = _httpClientFactory.CreateClient("image-fetch");
            client.DefaultRequestHeaders.UserAgent.ParseAdd("CV-Generator/1.0");
            using var response = await client.GetAsync(uri);
            if (response.IsSuccessStatusCode)
            {
                var contentType = response.Content.Headers.ContentType?.MediaType ?? "";
                if (contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
                {
                    var bytes = await response.Content.ReadAsByteArrayAsync();
                    if (bytes.Length > 0 && bytes.Length <= MaxUploadBytes)
                    {
                        var ext = GetExtensionFor(contentType);
                        var objectKey = $"{userId.Value}/{imageId}/{Guid.NewGuid():N}{ext}";
                        using var ms = new MemoryStream(bytes);
                        var storedUrl = await _storage.UploadAsync(Bucket, objectKey, ms, contentType, ms.Length);
                        image.ObjectKey = objectKey;
                        image.Url = storedUrl;
                        image.ContentType = contentType;
                        image.SizeBytes = bytes.Length;
                        image.Source = "web";
                    }
                }
            }
        }
        catch
        {
            // keep external URL reference
        }

        _db.UserImages.Add(image);
        await _db.SaveChangesAsync();

        return Created($"/api/images/{image.Id}", ApiResponse<ImageDto>.Created(ToDto(image)));
    }

    [HttpGet("{id}/file")]
    public async Task<IActionResult> GetFile(Guid id, [FromQuery] bool download = false)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();

        var image = await _db.UserImages.AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == id && i.UserId == userId.Value);
        if (image == null) return NotFound(ApiResponse<object>.Error("Image not found"));

        // URL-only images are served by redirecting to the external source.
        if (string.IsNullOrEmpty(image.ObjectKey))
            return Redirect(image.Url);

        var bytes = await _storage.GetObjectAsync(Bucket, image.ObjectKey);
        var contentType = image.ContentType ?? "application/octet-stream";
        var safeName = Path.GetFileNameWithoutExtension(image.Name).Replace("\"", "").Replace("\\", "");
        if (download)
            return File(bytes, contentType, $"{safeName}{GetExtensionFor(contentType)}");
        return File(bytes, contentType);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var userId = _currentUser.UserId;
        if (userId == null) return Unauthorized();

        var image = await _db.UserImages.FirstOrDefaultAsync(i => i.Id == id && i.UserId == userId.Value);
        if (image == null) return NotFound(ApiResponse<object>.Error("Image not found"));

        if (!string.IsNullOrEmpty(image.ObjectKey))
        {
            try { await _storage.DeleteAsync(Bucket, image.ObjectKey); }
            catch { /* orphaned object; still remove the reference */ }
        }

        _db.UserImages.Remove(image);
        await _db.SaveChangesAsync();
        return Ok(ApiResponse<object>.Ok(null, "Image deleted"));
    }

    private static ImageDto ToDto(UserImage i) => new()
    {
        Id = i.Id,
        Name = i.Name,
        Url = i.Url,
        ObjectKey = i.ObjectKey,
        ContentType = i.ContentType,
        SizeBytes = i.SizeBytes,
        Source = i.Source,
        CreatedAt = i.CreatedAt
    };

    private static string GetContentType(string fileName)
        => Path.GetExtension(fileName).ToLowerInvariant() switch
        {
            ".png" => "image/png",
            ".webp" => "image/webp",
            ".gif" => "image/gif",
            _ => "image/jpeg"
        };

    private static string GetExtensionFor(string contentType) => contentType.ToLowerInvariant() switch
    {
        "image/png" => ".png",
        "image/webp" => ".webp",
        "image/gif" => ".gif",
        _ => ".jpg"
    };
}