using Microsoft.AspNetCore.Mvc;
using CV_Generator.Dto;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/bime")]
public class BimeController : ControllerBase
{
    private readonly IBimeService _bimeService;
    private readonly ICurrentUserService _currentUser;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILlmSettingsService _llmSettingsService;
    private readonly IAgentLlmSettingsService _agentLlmSettingsService;

    public BimeController(
        IBimeService bimeService,
        ICurrentUserService currentUser,
        IHttpClientFactory httpClientFactory,
        ILlmSettingsService llmSettingsService,
        IAgentLlmSettingsService agentLlmSettingsService)
    {
        _bimeService = bimeService;
        _currentUser = currentUser;
        _httpClientFactory = httpClientFactory;
        _llmSettingsService = llmSettingsService;
        _agentLlmSettingsService = agentLlmSettingsService;
    }

    [HttpPost("chat")]
    public async Task<IActionResult> Chat([FromBody] BimeChatRequest request)
    {
        var userId = _currentUser.UserId;
        if (userId == null)
            return Unauthorized(new { success = false, message = "User not authenticated" });

        var settings = await _llmSettingsService.GetAsync(userId);
        var bimeLlm = await _agentLlmSettingsService.GetProviderModelAsync(
            userId, AgentLlmSettingsService.BimeAgentId);

        var client = _httpClientFactory.CreateClient("agents");
        var payload = new
        {
            message = request.Message,
            conversation_id = request.ConversationId?.ToString(),
            provider = request.Provider ?? bimeLlm.Provider ?? settings?.Provider,
            model = request.Model ?? bimeLlm.Model ?? settings?.Model,
        };
        // Relative URI so the configured "agents" BaseAddress (AGENTS_URL) is used —
        // an absolute localhost URL here breaks inside Docker, where agents is a separate service.
        var httpReq = new HttpRequestMessage(HttpMethod.Post, "api/bime/chat")
        {
            Content = new StringContent(
                System.Text.Json.JsonSerializer.Serialize(payload, new System.Text.Json.JsonSerializerOptions
                {
                    PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase,
                }),
                System.Text.Encoding.UTF8,
                "application/json"),
        };
        httpReq.Headers.Add("X-User-Id", userId.Value.ToString());
        var resp = await client.SendAsync(httpReq);
        if (!resp.IsSuccessStatusCode)
            return StatusCode(502, new { success = false, message = "BIME agent unavailable" });
        var body = await resp.Content.ReadFromJsonAsync<BimeChatResponse>();
        return Ok(new { success = true, data = body });
    }

    [HttpGet("conversations")]
    public async Task<IActionResult> ListConversations()
    {
        var userId = _currentUser.UserId;
        var convs = await _bimeService.ListConversationsAsync(userId);
        return Ok(new { success = true, data = convs });
    }

    [HttpPost("conversations")]
    public async Task<IActionResult> CreateConversation([FromBody] BimeCreateConversationRequest request)
    {
        var userId = _currentUser.UserId;
        var conv = await _bimeService.CreateConversationAsync(userId, request.Title);
        return Ok(new { success = true, data = conv });
    }

    [HttpGet("conversations/{id}")]
    public async Task<IActionResult> GetConversation(string id)
    {
        var userId = _currentUser.UserId;
        var conv = await _bimeService.GetConversationBySharedIdAsync(id, userId);
        if (conv == null) return NotFound(new { success = false, message = "Conversation not found" });
        return Ok(new { success = true, data = conv });
    }

    [HttpGet("conversations/{id}/messages")]
    public async Task<IActionResult> GetMessages(string id)
    {
        if (!Guid.TryParse(id, out var guid))
            return BadRequest(new { success = false, message = "Invalid conversation ID" });
        var messages = await _bimeService.GetMessagesAsync(guid);
        return Ok(new { success = true, data = messages });
    }

    [HttpPost("conversations/{id}/messages")]
    public async Task<IActionResult> AddMessages(string id, [FromBody] BimeAddMessagesRequest request)
    {
        if (!Guid.TryParse(id, out var guid))
            return BadRequest(new { success = false, message = "Invalid conversation ID" });
        await _bimeService.AddMessagesAsync(guid, request.Messages);
        return Ok(new { success = true });
    }

    [HttpDelete("conversations/{id}")]
    public async Task<IActionResult> DeleteConversation(string id)
    {
        if (!Guid.TryParse(id, out var guid))
            return BadRequest(new { success = false, message = "Invalid conversation ID" });
        await _bimeService.DeleteConversationAsync(guid, _currentUser.UserId);
        return Ok(new { success = true });
    }
}
