using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CV_Generator;
using CV_Generator.Dto;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/applications")]
public class ApplicationsApplyController : ControllerBase
{
    private readonly ApplyService _apply;
    private readonly ICurrentUserService _currentUser;

    public ApplicationsApplyController(ApplyService apply, ICurrentUserService currentUser)
    {
        _apply = apply;
        _currentUser = currentUser;
    }

    /// <summary>
    /// Paste-and-apply a job post: prepares the email (subject/body provided by the client),
    /// tracks an Application, and either sends now or schedules it.
    /// </summary>
    [HttpPost("apply")]
    public async Task<IActionResult> Apply([FromBody] ApplyEmailRequest dto)
    {
        var userId = _currentUser.UserId;
        if (userId is null) return Unauthorized();

        try
        {
            var result = await _apply.ApplyAsync(userId.Value, dto);
            return Ok(ApiResponse<ApplyEmailResult>.Ok(result));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(ApiResponse<ApplyEmailResult>.Error(ex.Message));
        }
        catch (DuplicateApplicationException ex)
        {
            return Conflict(ApiResponse<ApplyEmailResult>.Error("Duplicate application", ex.Payload));
        }
        catch (InvalidOperationException ex) when (ex.Message.Contains("Gmail"))
        {
            return StatusCode(502, ApiResponse<ApplyEmailResult>.Error("Gmail is not connected: " + ex.Message));
        }
    }
}