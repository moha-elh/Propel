using CV_Generator.Dto;
using CV_Generator.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/categories")]
public class CategoriesController : ControllerBase
{
    private readonly ICategoryService _service;
    private readonly ICurrentUserService _currentUser;

    public CategoriesController(ICategoryService service, ICurrentUserService currentUser)
    {
        _service = service;
        _currentUser = currentUser;
    }

    private Guid? UserId => _currentUser.UserId;

    /// GET /api/categories/tree?scope=projects
    [HttpGet("tree")]
    public async Task<IActionResult> GetTree([FromQuery] string scope)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));
        if (string.IsNullOrWhiteSpace(scope)) return BadRequest(ApiResponse<object>.Error("scope is required"));
        var tree = await _service.GetTreeAsync(UserId.Value, scope);
        return Ok(ApiResponse<List<CategoryNodeDto>>.Ok(tree));
    }

    /// POST /api/categories/search
    [HttpPost("search")]
    public async Task<IActionResult> Search([FromBody] CategorySearchRequest request)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));
        var results = await _service.SearchAsync(UserId.Value, request.NodeIds, request.SourceTypes);
        return Ok(ApiResponse<List<CategorySearchResult>>.Ok(results));
    }

    /// GET /api/categories/tags?sourceType=projects&sourceId=<guid>
    [HttpGet("tags")]
    public async Task<IActionResult> GetTags([FromQuery] string sourceType, [FromQuery] string sourceId)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));
        if (string.IsNullOrWhiteSpace(sourceType) || string.IsNullOrWhiteSpace(sourceId))
            return BadRequest(ApiResponse<object>.Error("sourceType and sourceId are required"));
        if (!Guid.TryParse(sourceId, out var id))
            return BadRequest(ApiResponse<object>.Error("sourceId must be a valid GUID"));
        var tagIds = await _service.GetTagsAsync(UserId.Value, sourceType, id);
        return Ok(ApiResponse<List<Guid>>.Ok(tagIds));
    }

    /// PUT /api/categories/tags
    [HttpPut("tags")]
    public async Task<IActionResult> SetTags([FromBody] CategoryTagRequest request)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));
        if (string.IsNullOrWhiteSpace(request.SourceType)) return BadRequest(ApiResponse<object>.Error("sourceType is required"));
        await _service.SetTagsAsync(UserId.Value, request.SourceType, request.SourceId, request.NodeIds);
        return Ok(ApiResponse<object>.Ok(null));
    }

    /// GET /api/categories/tags/all?sourceType=skills
    /// Returns every tag grouping for the whole scope: [{ sourceId, nodeIds }].
    [HttpGet("tags/all")]
    public async Task<IActionResult> GetTagsForScope([FromQuery] string sourceType)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));
        if (string.IsNullOrWhiteSpace(sourceType)) return BadRequest(ApiResponse<object>.Error("sourceType is required"));
        var tags = await _service.GetTagsForScopeAsync(UserId.Value, sourceType);
        return Ok(ApiResponse<List<ScopeTagsDto>>.Ok(tags));
    }

    /// POST /api/categories/categorize
    /// Recategorize an entity (or, if SourceId is omitted, the whole scope) using the user's taxonomy.
    [HttpPost("categorize")]
    public async Task<IActionResult> Categorize([FromBody] CategoryCategorizeRequest request)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));
        if (string.IsNullOrWhiteSpace(request.SourceType)) return BadRequest(ApiResponse<object>.Error("sourceType is required"));

        int count;
        if (!string.IsNullOrWhiteSpace(request.SourceId) && Guid.TryParse(request.SourceId, out var id))
        {
            await _service.CategorizeEntityAsync(UserId.Value, request.SourceType, id);
            count = 1;
        }
        else
        {
            count = await _service.CategorizeScopeAsync(UserId.Value, request.SourceType);
        }
        return Ok(ApiResponse<object>.Ok(new { categorized = count }));
    }

    /// POST /api/categories/categorize/suggest
    /// Returns suggested category node IDs for a single entity WITHOUT saving them,
    /// so the UI can preview and let the user approve/edit before persisting.
    [HttpPost("categorize/suggest")]
    public async Task<IActionResult> Suggest([FromBody] CategoryCategorizeRequest request)
    {
        if (UserId == null) return Unauthorized(ApiResponse<object>.Error("Unable to determine user identity"));
        if (string.IsNullOrWhiteSpace(request.SourceType)) return BadRequest(ApiResponse<object>.Error("sourceType is required"));
        if (string.IsNullOrWhiteSpace(request.SourceId) || !Guid.TryParse(request.SourceId, out var id))
            return BadRequest(ApiResponse<object>.Error("sourceId is required and must be a valid GUID"));
        var suggestions = await _service.SuggestEntityAsync(UserId.Value, request.SourceType, id);
        return Ok(ApiResponse<List<Guid>>.Ok(suggestions));
    }
}
