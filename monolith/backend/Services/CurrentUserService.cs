using CV_Generator.Data;
using CV_Generator.Models;

namespace CV_Generator.Services;

public interface ICurrentUserService
{
    Guid? UserId { get; }
}

// Single-user tool: auth was removed, so every request maps to one fixed owner
// account. An X-User-Id header still wins if present (kept for flexibility).
public class CurrentUserService : ICurrentUserService
{
    public static readonly Guid DefaultUserId = new("00000000-0000-0000-0000-000000000001");

    private readonly IHttpContextAccessor _http;

    public CurrentUserService(IHttpContextAccessor httpContextAccessor)
    {
        _http = httpContextAccessor;
    }

    public Guid? UserId
    {
        get
        {
            var headerId = _http.HttpContext?.Request.Headers["X-User-Id"].FirstOrDefault();
            if (!string.IsNullOrEmpty(headerId) && Guid.TryParse(headerId, out var hid))
                return hid;
            return DefaultUserId;
        }
    }

    // Seed the owner row so GetUserId() always resolves to a real user.
    public static async Task EnsureDefaultUserAsync(AppDbContext db)
    {
        if (await db.Users.FindAsync(DefaultUserId) != null) return;

        db.Users.Add(new User
        {
            Id = DefaultUserId,
            KeycloakId = "owner",
            FirstName = Environment.GetEnvironmentVariable("OWNER_FIRST_NAME") ?? "Me",
            LastName = Environment.GetEnvironmentVariable("OWNER_LAST_NAME") ?? "",
            Email = Environment.GetEnvironmentVariable("OWNER_EMAIL") ?? "me@localhost",
            Role = Role.USER,
            CreatedAt = DateTime.UtcNow,
            IsActive = true,
        });
        await db.SaveChangesAsync();
    }
}
