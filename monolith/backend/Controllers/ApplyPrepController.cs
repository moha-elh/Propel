using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CV_Generator.Dto;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/applications")]
public class ApplyPrepController : ControllerBase
{
    private readonly IApplyPrepService _svc;
    private readonly ICurrentUserService _currentUser;

    public ApplyPrepController(IApplyPrepService svc, ICurrentUserService currentUser)
    {
        _svc = svc;
        _currentUser = currentUser;
    }

    /// <summary>Generate tailored answers for an external application form's fields.</summary>
    [HttpPost("apply-prep/form-responses")]
    public async Task<IActionResult> FormResponses([FromBody] ApplyPrepFormRequest dto)
    {
        var userId = _currentUser.UserId;
        if (userId is null) return Unauthorized();
        try
        {
            var result = await _svc.GenerateFormResponsesAsync(userId.Value, dto);
            return Ok(ApiResponse<ApplyPrepFormResult>.Ok(result));
        }
        catch (HttpRequestException ex)
        {
            return StatusCode(502, ApiResponse<ApplyPrepFormResult>.Error("Generation failed: " + ex.Message));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<ApplyPrepFormResult>.Error(ex.Message));
        }
    }

    /// <summary>Generate a direct outreach message (LinkedIn / WhatsApp / other).</summary>
    [HttpPost("apply-prep/message")]
    public async Task<IActionResult> Message([FromBody] ApplyPrepMessageRequest dto)
    {
        var userId = _currentUser.UserId;
        if (userId is null) return Unauthorized();
        try
        {
            var result = await _svc.GenerateMessageAsync(userId.Value, dto);
            return Ok(ApiResponse<ApplyPrepMessageResult>.Ok(result));
        }
        catch (HttpRequestException ex)
        {
            return StatusCode(502, ApiResponse<ApplyPrepMessageResult>.Error("Generation failed: " + ex.Message));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<ApplyPrepMessageResult>.Error(ex.Message));
        }
    }
}
