using Microsoft.AspNetCore.Mvc;
using CV_Generator.Services;

namespace CV_Generator.Controllers;

[ApiController]
[Route("api/[controller]")]
public abstract class BaseApiController : ControllerBase
{
    protected ICurrentUserService CurrentUser { get; }

    protected BaseApiController(ICurrentUserService currentUser)
    {
        CurrentUser = currentUser;
    }

    protected Guid GetUserId()
    {
        return CurrentUser.UserId ?? throw new UnauthorizedAccessException("Unable to determine user identity");
    }
}
