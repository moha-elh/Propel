using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CV_Generator.Dto;
using CV_Generator.Services;
using CV_Generator.Services.AgentClients;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/autofill")]
public class AutofillController : ControllerBase
{
    private readonly IAutofillClient _client;
    private readonly ICurrentUserService _currentUser;
    private readonly IAgentLlmSettingsService _agentLlm;

    public AutofillController(
        IAutofillClient client,
        ICurrentUserService currentUser,
        IAgentLlmSettingsService agentLlm)
    {
        _client = client;
        _currentUser = currentUser;
        _agentLlm = agentLlm;
    }

    /// <summary>Extract structured field values from a pasted description blob.</summary>
    [HttpPost("extract")]
    public async Task<IActionResult> Extract([FromBody] AutofillRequestDto request)
    {
        if (string.IsNullOrWhiteSpace(request.Text))
            return BadRequest(ApiResponse<object>.Error("Provide a description to auto-fill from"));

        var provider = "";
        var model = "";
        var userId = _currentUser.UserId;
        if (userId != null)
        {
            var llm = await _agentLlm.GetProviderModelAsync(userId, "autofill");
            provider = llm.Provider ?? "";
            model = llm.Model ?? "";
        }

        request.Provider ??= string.IsNullOrWhiteSpace(provider) ? null : provider;
        request.Model ??= string.IsNullOrWhiteSpace(model) ? null : model;

        var result = await _client.ExtractAsync(request);
        if (result == null)
            return StatusCode(502, ApiResponse<object>.Error("Auto-fill agent could not be reached"));

        return Ok(ApiResponse<AutofillResultDto>.Ok(result));
    }
}
