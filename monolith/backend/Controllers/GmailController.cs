using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[Route("api/gmail")]
public class GmailController : BaseApiController
{
    private readonly IGmailAuthService _gmailAuthSvc;
    private readonly string _frontendUrl;

    public GmailController(ICurrentUserService currentUser, IGmailAuthService gmailAuthSvc, IConfiguration config)
        : base(currentUser)
    {
        _gmailAuthSvc = gmailAuthSvc;
        _frontendUrl = config.GetValue<string>("Gmail:FrontendRedirectUrl") ?? "http://localhost:4200";
    }

    [HttpGet("connect")]
    public IActionResult Connect()
    {
        var userId = GetUserId();
        var url = _gmailAuthSvc.GetOAuthUrl(userId);
        return Redirect(url);
    }

    [HttpGet("callback")]
    public async Task<IActionResult> Callback([FromQuery] string code, [FromQuery] string state)
    {
        await _gmailAuthSvc.HandleCallbackAsync(code, state);
        return Redirect($"{_frontendUrl}/mailbox");
    }

    [HttpGet("status")]
    public async Task<IActionResult> Status()
    {
        var userId = GetUserId();
        var status = await _gmailAuthSvc.GetStatusAsync(userId);
        if (status is null) return Ok(new { connected = false });
        return Ok(new { connected = true, email = status.Email, connectedAt = status.ConnectedAt });
    }

    [HttpDelete("disconnect")]
    public async Task<IActionResult> Disconnect()
    {
        var userId = GetUserId();
        await _gmailAuthSvc.DisconnectAsync(userId);
        return NoContent();
    }
}
