using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Pgvector;
using CV_Generator.Data;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/search")]
public class SearchController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ISearchSyncService _syncService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ICurrentUserService _currentUser;

    public SearchController(
        AppDbContext db,
        ISearchSyncService syncService,
        IHttpClientFactory httpClientFactory,
        ICurrentUserService currentUser)
    {
        _db = db;
        _syncService = syncService;
        _httpClientFactory = httpClientFactory;
        _currentUser = currentUser;
    }

    private static readonly HashSet<string> ValidSourceTypes = [
        "User", "CVProfile", "Experience", "Project", "Skill",
        "Education", "Certification", "Language", "Interest",
        "Hackathon", "AcademicActivity", "SocialLink",
        "Company", "Contact", "Application"
    ];

    [HttpPost]
    public async Task<IActionResult> Search([FromBody] SearchRequest req)
    {
        var userId = _currentUser.UserId;
        if (userId == null)
            return Unauthorized(ApiResponse<object>.Error("User not authenticated"));

        if (req.SourceTypes == null || req.SourceTypes.Length == 0)
            return BadRequest(ApiResponse<object>.Error("sourceTypes is required and must not be empty"));

        var invalid = req.SourceTypes.Where(t => !ValidSourceTypes.Contains(t)).ToList();
        if (invalid.Count > 0)
            return BadRequest(ApiResponse<object>.Error($"Invalid sourceTypes: {string.Join(", ", invalid)}"));

        var client = _httpClientFactory.CreateClient("embeddings");
        var embedReq = new { text = req.Query };
        var embedResp = await client.PostAsJsonAsync("/api/embeddings/embed-query", embedReq);
        if (!embedResp.IsSuccessStatusCode)
            return StatusCode(502, ApiResponse<object>.Error("Embedding service unavailable"));

        var embedResult = await embedResp.Content.ReadFromJsonAsync<EmbedQueryResult>();
        if (embedResult?.Embedding == null || embedResult.Embedding.Length == 0)
            return StatusCode(502, ApiResponse<object>.Error("Empty embedding returned"));

        var queryVector = new Vector(embedResult.Embedding);
        var sourceTypesList = string.Join(",", req.SourceTypes.Select(t => $"'{t}'"));

        var sqlQuery = $@"
            SELECT ""SourceId"", ""SourceType"", ""Content"",
                   (COALESCE((1 - (""Embedding"" <=> @p1)), 0) * 0.7 +
                    COALESCE(ts_rank_cd(""SearchVector"", plainto_tsquery('english', @p2)), 0) * 0.3) AS ""Score""
            FROM ""AgentDocumentChunks""
            WHERE ""UserId"" = @p0
              AND ""SourceType"" IN ({sourceTypesList})
            ORDER BY ""Score"" DESC
            LIMIT @p3
        ";

        var rows = await _db.Database
            .SqlQueryRaw<SearchRowDto>(sqlQuery, userId.Value, queryVector, req.Query, req.Limit)
            .ToListAsync();

        var results = rows.Select(r => new SearchResultDto(r.SourceId, r.SourceType, r.Content, r.Score)).ToList();

        return Ok(ApiResponse<List<SearchResultDto>>.Ok(results));
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var userId = _currentUser.UserId;
        if (userId == null)
            return Unauthorized(ApiResponse<object>.Error("User not authenticated"));

        var status = await _syncService.GetStatusAsync(userId.Value);
        return Ok(ApiResponse<SearchSyncStatusDto>.Ok(new SearchSyncStatusDto(
            status.Synced,
            status.ChunkCount,
            status.SourceTypeCounts
        )));
    }

    [HttpPost("sync")]
    public async Task<IActionResult> Sync([FromBody] SyncRequest? req = null)
    {
        var userId = _currentUser.UserId;
        if (userId == null)
            return Unauthorized(ApiResponse<object>.Error("User not authenticated"));

        var sourceTypes = req?.SourceTypes ?? [];
        var count = await _syncService.SyncUserEntitiesAsync(userId.Value, sourceTypes);
        return Ok(ApiResponse<SyncResultDto>.Ok(new SyncResultDto(count)));
    }
}

public record SearchRequest(string Query, string[] SourceTypes, int Limit = 15);
public record SearchResultDto(Guid SourceId, string SourceType, string Content, double Score);
public record SearchRowDto(Guid SourceId, string SourceType, string Content, double Score);
public record SyncRequest(string[]? SourceTypes = null);
public record SyncResultDto(int ChunksSynced);
public record SearchSyncStatusDto(bool Synced, int ChunkCount, Dictionary<string, int> SourceTypeCounts);

internal class EmbedQueryResult
{
    public float[] Embedding { get; set; } = [];
    public string Model { get; set; } = "";
    public int Dimensions { get; set; }
}
