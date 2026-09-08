using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Google.Apis.Auth.OAuth2;
using Google.Apis.Auth.OAuth2.Flows;
using Google.Apis.Auth.OAuth2.Responses;
using Google.Apis.Gmail.v1;
using Google.Apis.Gmail.v1.Data;
using Google.Apis.Services;
using Microsoft.EntityFrameworkCore;
using MimeKit;
using CV_Generator.Data;
using CV_Generator.Models;
using CV_Generator.Services;

namespace CV_Generator.Services;

public class GmailSendService : IGmailSendService
{
    private readonly AppDbContext _db;
    private readonly IAesEncryptionService _aes;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<GmailSendService> _logger;
    private readonly string? _clientId;
    private readonly string? _clientSecret;

    public GmailSendService(
        AppDbContext db,
        IAesEncryptionService aes,
        IHttpClientFactory httpClientFactory,
        ILogger<GmailSendService> logger)
    {
        _db = db;
        _aes = aes;
        _httpClientFactory = httpClientFactory;
        _logger = logger;

        // Gmail is optional. Read creds lazily so DI doesn't 500 endpoints that
        // merely inject this service; the send path requires them.
        _clientId = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID");
        _clientSecret = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_SECRET");
    }

    public async Task<(string? MessageId, string? ThreadId)> SendWithAttachmentAsync(
        Guid userId, string to, string subject, string body,
        string? cvPdfUrl = null, IReadOnlyList<CV_Generator.Dto.EmailAttachmentDto>? attachments = null)
    {
        var connection = await _db.Set<GmailConnection>()
            .FirstOrDefaultAsync(c => c.UserId == userId && !c.IsRevoked);

        if (connection is null)
        {
            throw new InvalidOperationException("Gmail not connected for user");
        }

        var credential = await BuildCredentialAsync(connection);

        var gmailService = new GmailService(new BaseClientService.Initializer
        {
            HttpClientInitializer = credential,
            ApplicationName = "CV_Generator"
        });

        var message = new MimeMessage();
        message.From.Add(new MailboxAddress("", connection.GmailAddress));
        message.To.Add(new MailboxAddress("", to));
        message.Subject = subject;

        var bodyBuilder = new BodyBuilder { HtmlBody = body };

        if (!string.IsNullOrWhiteSpace(cvPdfUrl))
        {
            try
            {
                using var httpClient = _httpClientFactory.CreateClient();
                var pdfBytes = await httpClient.GetByteArrayAsync(cvPdfUrl);
                var fileName = Path.GetFileName(new Uri(cvPdfUrl).AbsolutePath);
                if (string.IsNullOrWhiteSpace(fileName)) fileName = "cv.pdf";

                bodyBuilder.Attachments.Add(fileName, pdfBytes, ContentType.Parse("application/pdf"));
                _logger.LogInformation("Attached PDF from {Url} ({Size} bytes)", cvPdfUrl, pdfBytes.Length);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to download PDF from {Url}, sending without attachment", cvPdfUrl);
            }
        }

        if (attachments is not null)
        {
            foreach (var att in attachments)
            {
                if (string.IsNullOrWhiteSpace(att.FileName) || string.IsNullOrWhiteSpace(att.ContentBase64))
                    continue;
                try
                {
                    var bytes = Convert.FromBase64String(att.ContentBase64);
                    var contentType = ContentType.Parse(
                        string.IsNullOrWhiteSpace(att.ContentType) ? "application/octet-stream" : att.ContentType);
                    bodyBuilder.Attachments.Add(att.FileName, bytes, contentType);
                }
                catch (FormatException ex)
                {
                    _logger.LogWarning(ex, "Skipping attachment {FileName}: invalid base64", att.FileName);
                }
            }
        }

        message.Body = bodyBuilder.ToMessageBody();

        var raw = Convert.ToBase64String(
            System.Text.Encoding.UTF8.GetBytes(message.ToString()));

        var gmailMessage = new Message { Raw = raw };

        var sent = await gmailService.Users.Messages.Send(gmailMessage, "me").ExecuteAsync();

        _logger.LogInformation(
            "Gmail sent via {From} to {To} | Subject: {Subject} | Attached: {HasPdf} | MessageId: {MessageId}",
            connection.GmailAddress, to, subject, !string.IsNullOrWhiteSpace(cvPdfUrl), sent.Id);

        return (sent.Id, sent.ThreadId);
    }

    private async Task<UserCredential> BuildCredentialAsync(
        GmailConnection connection)
    {
        if (string.IsNullOrEmpty(_clientId) || string.IsNullOrEmpty(_clientSecret))
            throw new InvalidOperationException(
                "Gmail is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");

        var flow = new GoogleAuthorizationCodeFlow(new GoogleAuthorizationCodeFlow.Initializer
        {
            ClientSecrets = new ClientSecrets
            {
                ClientId = _clientId,
                ClientSecret = _clientSecret
            },
            Scopes = new[] { "https://www.googleapis.com/auth/gmail.send" }
        });

        var tokenResponse = new TokenResponse
        {
            AccessToken = _aes.Decrypt(connection.EncryptedAccessToken),
            RefreshToken = _aes.Decrypt(connection.EncryptedRefreshToken),
            ExpiresInSeconds = (long)(connection.TokenExpiresAt - DateTime.UtcNow).TotalSeconds,
            IssuedUtc = DateTime.UtcNow
        };

        var userIdStr = connection.UserId.ToString();
        var credential = new UserCredential(flow, userIdStr, tokenResponse);

        if (DateTime.UtcNow >= connection.TokenExpiresAt.AddMinutes(-5))
        {
            _logger.LogInformation("Refreshing expired Gmail token for user {UserId}", connection.UserId);
            if (!await credential.RefreshTokenAsync(CancellationToken.None))
            {
                throw new InvalidOperationException("Failed to refresh Gmail token");
            }

            connection.EncryptedAccessToken = _aes.Encrypt(credential.Token.AccessToken);
            connection.EncryptedRefreshToken = _aes.Encrypt(credential.Token.RefreshToken);
            connection.TokenExpiresAt = DateTime.UtcNow.AddSeconds(
                credential.Token.ExpiresInSeconds ?? 3600);
            await _db.SaveChangesAsync();

            _logger.LogInformation("Gmail token refreshed and stored for user {UserId}", connection.UserId);
        }

        return credential;
    }
}
