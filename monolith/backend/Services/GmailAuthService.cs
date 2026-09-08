using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using CV_Generator.Data;
using CV_Generator.Models;
using CV_Generator.Services;

namespace CV_Generator.Services;

public class GmailAuthService : IGmailAuthService
{
    private static readonly string[] Scopes =
    [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.send"
    ];

    private readonly AppDbContext _db;
    private readonly IAesEncryptionService _aes;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<GmailAuthService> _logger;
    private readonly string? _clientId;
    private readonly string? _clientSecret;
    private readonly string _callbackBaseUrl;

    public GmailAuthService(
        AppDbContext db,
        IAesEncryptionService aes,
        IHttpClientFactory httpClientFactory,
        IConfiguration config,
        ILogger<GmailAuthService> logger)
    {
        _db = db;
        _aes = aes;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        // Gmail is optional. Read creds lazily — a missing key must not 500 the
        // status/disconnect endpoints; only the connect/send paths require them.
        _clientId = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID");
        _clientSecret = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_SECRET");
        _callbackBaseUrl = config.GetValue<string>("Gmail:CallbackBaseUrl")
            ?? "http://localhost:8080";
    }

    private (string clientId, string clientSecret) RequireCredentials()
    {
        if (string.IsNullOrEmpty(_clientId) || string.IsNullOrEmpty(_clientSecret))
            throw new InvalidOperationException(
                "Gmail is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
        return (_clientId, _clientSecret);
    }

    public string GetOAuthUrl(Guid userId)
    {
        var (clientId, _) = RequireCredentials();
        var redirectUri = $"{_callbackBaseUrl}/api/gmail/callback";
        var scope = Uri.EscapeDataString(string.Join(" ", Scopes));
        return $"https://accounts.google.com/o/oauth2/v2/auth" +
               $"?client_id={Uri.EscapeDataString(clientId)}" +
               $"&redirect_uri={Uri.EscapeDataString(redirectUri)}" +
               $"&response_type=code" +
               $"&scope={scope}" +
               $"&access_type=offline" +
               $"&prompt=consent" +
               $"&state={userId}";
    }

    public async Task HandleCallbackAsync(string code, string state)
    {
        if (!Guid.TryParse(state, out var userId))
        {
            _logger.LogWarning("Invalid state in OAuth callback: {State}", state);
            return;
        }

        var redirectUri = $"{_callbackBaseUrl}/api/gmail/callback";

        var tokenResponse = await ExchangeCodeAsync(code, redirectUri);

        var gmailAddress = await GetGmailAddressAsync(tokenResponse);

        var existing = await _db.Set<GmailConnection>()
            .FirstOrDefaultAsync(c => c.UserId == userId);

        var refreshToken = tokenResponse.RefreshToken;
        if (string.IsNullOrEmpty(refreshToken) && existing is not null)
        {
            refreshToken = _aes.Decrypt(existing.EncryptedRefreshToken);
            _logger.LogInformation("Preserved existing refresh token for user {UserId}", userId);
        }

        if (existing is not null)
        {
            _db.Set<GmailConnection>().Remove(existing);
        }

        var connection = new GmailConnection
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            GmailAddress = gmailAddress,
            EncryptedAccessToken = _aes.Encrypt(tokenResponse.AccessToken),
            EncryptedRefreshToken = _aes.Encrypt(refreshToken),
            TokenExpiresAt = DateTime.UtcNow.AddSeconds(tokenResponse.ExpiresInSeconds),
            ConnectedAt = DateTime.UtcNow
        };

        _db.Set<GmailConnection>().Add(connection);
        await _db.SaveChangesAsync();
    }

    public async Task<GmailConnectionStatus?> GetStatusAsync(Guid userId)
    {
        var connection = await _db.Set<GmailConnection>()
            .FirstOrDefaultAsync(c => c.UserId == userId && !c.IsRevoked);

        if (connection is null) return null;

        return new GmailConnectionStatus
        {
            Email = connection.GmailAddress,
            ConnectedAt = connection.ConnectedAt
        };
    }

    public async Task DisconnectAsync(Guid userId)
    {
        var connection = await _db.Set<GmailConnection>()
            .FirstOrDefaultAsync(c => c.UserId == userId && !c.IsRevoked);

        if (connection is null) return;

        try
        {
            var accessToken = _aes.Decrypt(connection.EncryptedAccessToken);
            using var client = _httpClientFactory.CreateClient();
            var content = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("token", accessToken)
            });
            await client.PostAsync("https://oauth2.googleapis.com/revoke", content);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to revoke Google token for user {UserId}", userId);
        }

        connection.IsRevoked = true;
        await _db.SaveChangesAsync();
    }

    private async Task<GoogleTokenResponse> ExchangeCodeAsync(string code, string redirectUri)
    {
        var (clientId, clientSecret) = RequireCredentials();
        using var client = _httpClientFactory.CreateClient();
        var content = new FormUrlEncodedContent(new[]
        {
            new KeyValuePair<string, string>("code", code),
            new KeyValuePair<string, string>("client_id", clientId),
            new KeyValuePair<string, string>("client_secret", clientSecret),
            new KeyValuePair<string, string>("redirect_uri", redirectUri),
            new KeyValuePair<string, string>("grant_type", "authorization_code")
        });

        var response = await client.PostAsync("https://oauth2.googleapis.com/token", content);
        response.EnsureSuccessStatusCode();

        return await response.Content.ReadFromJsonAsync<GoogleTokenResponse>()
            ?? throw new InvalidOperationException("Failed to deserialize token response");
    }

    private async Task<string> GetGmailAddressAsync(GoogleTokenResponse token)
    {
        if (!string.IsNullOrEmpty(token.IdToken))
            return ExtractEmailFromIdToken(token.IdToken);

        _logger.LogInformation("id_token not present, falling back to userinfo endpoint");

        using var client = _httpClientFactory.CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token.AccessToken);

        var response = await client.GetAsync("https://www.googleapis.com/oauth2/v3/userinfo");
        response.EnsureSuccessStatusCode();

        var info = await response.Content.ReadFromJsonAsync<GoogleUserInfo>()
            ?? throw new InvalidOperationException("Failed to deserialize userinfo response");

        return info.Email;
    }

    private static string ExtractEmailFromIdToken(string idToken)
    {
        var parts = idToken.Split('.');
        if (parts.Length != 3)
            throw new InvalidOperationException($"Invalid id_token format: expected 3 parts, got {parts.Length} (first 50 chars: {idToken[..Math.Min(50, idToken.Length)]})");

        var payload = parts[1]
            .Replace('-', '+')
            .Replace('_', '/');

        switch (payload.Length % 4)
        {
            case 2: payload += "=="; break;
            case 3: payload += "="; break;
        }

        var bytes = Convert.FromBase64String(payload);
        var json = System.Text.Encoding.UTF8.GetString(bytes);
        var doc = JsonDocument.Parse(json);
        return doc.RootElement.GetProperty("email").GetString()
            ?? throw new InvalidOperationException("email claim not found in id_token");
    }

    private class GoogleTokenResponse
    {
        [JsonPropertyName("access_token")]
        public string AccessToken { get; set; } = string.Empty;

        [JsonPropertyName("refresh_token")]
        public string RefreshToken { get; set; } = string.Empty;

        [JsonPropertyName("expires_in")]
        public int ExpiresInSeconds { get; set; }

        [JsonPropertyName("token_type")]
        public string TokenType { get; set; } = string.Empty;

        [JsonPropertyName("id_token")]
        public string IdToken { get; set; } = string.Empty;
    }

    private class GoogleUserInfo
    {
        [JsonPropertyName("email")]
        public string Email { get; set; } = string.Empty;
    }
}
