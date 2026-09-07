var builder = WebApplication.CreateBuilder(args);

// ── Environment variables with fallbacks ─────────────────────────────────────
string Env(string key, string fallback) =>
    Environment.GetEnvironmentVariable(key) ?? fallback;

var gatewayPort = Env("GATEWAY_PORT", "8080");
builder.WebHost.UseUrls($"http://0.0.0.0:{gatewayPort}");

var frontendHost = Env("FRONTEND_HOST", "localhost");
var frontendPort = Env("FRONTEND_PORT", "4200");
var frontendUrl = $"http://{frontendHost}:{frontendPort}";

// ── Override YARP cluster addresses from env vars ────────────────────────────
// (config file has fallback addresses; env vars take precedence at runtime)
void SetClusterAddress(string clusterId)
{
    var host = Environment.GetEnvironmentVariable("MONOLITH_HOST") ?? "localhost";
    var port = Environment.GetEnvironmentVariable("MONOLITH_PORT") ?? "5000";
    builder.Configuration[$"Proxy:Clusters:{clusterId}:Destinations:destination-1:Address"] = $"http://{host}:{port}";
}

foreach (var cluster in new[]
{
    "user-cluster", "content-cluster", "workflow-cluster", "application-cluster",
    "job-offer-cluster", "notification-cluster", "cv-cluster",
})
{
    SetClusterAddress(cluster);
}

// ── CORS ─────────────────────────────────────────────────────────────────────
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins(frontendUrl).AllowAnyHeader().AllowAnyMethod());
});

// ── Reverse Proxy (routes from JSON, clusters from env vars) ─────────────────
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("Proxy"));

var app = builder.Build();

app.UseCors();

app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "api-gateway" }));

// ── Auth removed — single-user tool. Report a static owner identity so the SPA
//    treats the session as signed in. Must match CurrentUserService.DefaultUserId
//    on the monolith. ──────────────────────────────────────────────────────────
const string ownerId = "00000000-0000-0000-0000-000000000001";

app.MapGet("/api/auth/me", () => Results.Json(new
{
    success = true,
    data = new
    {
        userId = ownerId,
        keycloakId = "owner",
        firstName = Env("OWNER_FIRST_NAME", "Me"),
        lastName = Env("OWNER_LAST_NAME", ""),
        email = Env("OWNER_EMAIL", "me@localhost"),
        role = "user",
        isActive = true,
        tokens = new { accessToken = "" },
    },
})).RequireCors("Default");

// Logout is a no-op now; bounce back to the app.
app.MapGet("/api/auth/logout", () => Results.Redirect(frontendUrl)).RequireCors("Default");

app.MapReverseProxy();

app.Run();
