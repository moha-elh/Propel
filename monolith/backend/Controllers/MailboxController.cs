using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using CV_Generator;
using CV_Generator.Dto;
using CV_Generator.Services;
using CV_Generator.Models;
using CV_Generator.Data;

namespace CV_Generator.Controllers;

[Route("api/mailbox")]
public class MailboxController : BaseApiController
{
    private readonly AppDbContext _db;
    private readonly IGmailSendService _gmailSendSvc;
    private readonly IContactService _contactSvc;
    private readonly IApplicationService _applicationSvc;
    private readonly IMinioStorageService _minio;
    private readonly ILogger<MailboxController> _logger;

    public MailboxController(
        ICurrentUserService currentUser,
        AppDbContext db,
        IGmailSendService gmailSendSvc,
        IContactService contactSvc,
        IApplicationService applicationSvc,
        IMinioStorageService minio,
        ILogger<MailboxController> logger)
        : base(currentUser)
    {
        _db = db;
        _gmailSendSvc = gmailSendSvc;
        _contactSvc = contactSvc;
        _applicationSvc = applicationSvc;
        _minio = minio;
        _logger = logger;
    }

    /// <summary>Parses stored attachment metadata JSON into DTOs (empty list on null/corrupt data).</summary>
    private static List<EmailAttachmentInfoDto> ParseAttachments(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            return JsonSerializer.Deserialize<List<EmailAttachmentInfoDto>>(json) ?? [];
        }
        catch
        {
            return [];
        }
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory(
        [FromQuery] string? status,
        [FromQuery] string? search,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var userId = GetUserId();
        var query = _db.Set<EmailMessage>()
            .Include(m => m.Contact)
            .Where(m => m.UserId == userId);

        if (!string.IsNullOrWhiteSpace(status))
            query = query.Where(m => m.Status == status);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.ToLower();
            query = query.Where(m =>
                m.Subject.ToLower().Contains(term) ||
                m.ToEmail.ToLower().Contains(term) ||
                (m.ToName != null && m.ToName.ToLower().Contains(term)));
        }

        var total = await query.CountAsync();
        var sentCount = await query.CountAsync(m => m.Status == "sent");
        var failedCount = await query.CountAsync(m => m.Status == "failed");
        var draftCount = await query.CountAsync(m => m.Status == "draft");

        var rows = await query
            .OrderByDescending(m => m.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(m => new
            {
                m.Id, m.UserId, m.ContactId, RecipientEmail = m.ToEmail, RecipientName = m.ToName,
                m.Subject, m.Body, m.Status, Error = m.Error, m.Provider, m.SentAt,
                m.CreatedAt, m.AttachmentMetadataJson
            })
            .ToListAsync();

        var items = rows.Select(m => new EmailMessageDto
        {
            Id = m.Id,
            UserId = m.UserId,
            ContactId = m.ContactId,
            RecipientEmail = m.RecipientEmail,
            RecipientName = m.RecipientName,
            Subject = m.Subject,
            Body = m.Body,
            Status = m.Status,
            ErrorMessage = m.Error,
            Provider = m.Provider,
            SentAt = m.SentAt,
            CreatedAt = m.CreatedAt,
            Attachments = ParseAttachments(m.AttachmentMetadataJson)
        }).ToList();

        return Ok(ApiResponse<EmailHistoryResponse>.Ok(new EmailHistoryResponse
        {
            Items = items,
            Total = total,
            SentCount = sentCount,
            FailedCount = failedCount,
            DraftCount = draftCount
        }));
    }

    [HttpGet("history/{id}")]
    public async Task<IActionResult> GetDetail(Guid id)
    {
        var userId = GetUserId();
        var msg = await _db.Set<EmailMessage>()
            .FirstOrDefaultAsync(m => m.Id == id && m.UserId == userId);
        if (msg is null) return NotFound(ApiResponse<EmailMessageDto>.Error("Email not found"));

        return Ok(ApiResponse<EmailMessageDto>.Ok(new EmailMessageDto
        {
            Id = msg.Id,
            UserId = msg.UserId,
            ContactId = msg.ContactId,
            RecipientEmail = msg.ToEmail,
            RecipientName = msg.ToName,
            Subject = msg.Subject,
            Body = msg.Body,
            Status = msg.Status,
            ErrorMessage = msg.Error,
            Provider = msg.Provider,
            SentAt = msg.SentAt,
            CreatedAt = msg.CreatedAt,
            Attachments = ParseAttachments(msg.AttachmentMetadataJson)
        }));
    }

    [HttpGet("contact-history/{contactId}")]
    public async Task<IActionResult> GetContactHistory(Guid contactId)
    {
        var userId = GetUserId();
        var contact = await _db.Set<Contact>()
            .FirstOrDefaultAsync(c => c.Id == contactId && c.UserId == userId);
        if (contact is null)
            return NotFound(ApiResponse<object>.Error("Contact not found"));

        var rows = await _db.Set<EmailMessage>()
            .Where(m => m.ContactId == contactId && m.UserId == userId)
            .OrderByDescending(m => m.CreatedAt)
            .Select(m => new
            {
                m.Id, m.UserId, m.ContactId, RecipientEmail = m.ToEmail, RecipientName = m.ToName,
                m.Subject, m.Body, m.Status, Error = m.Error, m.Provider, m.SentAt,
                m.CreatedAt, m.AttachmentMetadataJson
            })
            .ToListAsync();

        var emails = rows.Select(m => new EmailMessageDto
        {
            Id = m.Id,
            UserId = m.UserId,
            ContactId = m.ContactId,
            RecipientEmail = m.RecipientEmail,
            RecipientName = m.RecipientName,
            Subject = m.Subject,
            Body = m.Body,
            Status = m.Status,
            ErrorMessage = m.Error,
            Provider = m.Provider,
            SentAt = m.SentAt,
            CreatedAt = m.CreatedAt,
            Attachments = ParseAttachments(m.AttachmentMetadataJson)
        }).ToList();

        return Ok(ApiResponse<ContactHistoryResponse>.Ok(new ContactHistoryResponse
        {
            Contact = new ContactDto
            {
                Id = contact.Id,
                UserId = contact.UserId,
                Name = contact.Name,
                Email = contact.Email,
                Phone = contact.Phone,
                Company = contact.Company,
                Position = contact.Position,
                Notes = contact.Notes,
                Source = contact.Source,
                IsFavorite = contact.IsFavorite,
                AvatarBase64 = contact.AvatarBase64,
                CreatedAt = contact.CreatedAt,
                UpdatedAt = contact.UpdatedAt
            },
            Emails = emails,
            TotalEmails = emails.Count
        }));
    }

    /// <summary>Uploads a file to MinIO for use as a schedule/template attachment; returns a ref.</summary>
    [HttpPost("attachments")]
    public async Task<IActionResult> UploadAttachment(IFormFile file)
    {
        var userId = GetUserId();
        if (file is null || file.Length == 0)
            return BadRequest(ApiResponse<object>.Error("No file provided"));

        const long MaxFileBytes = 20 * 1024 * 1024;
        if (file.Length > MaxFileBytes)
            return BadRequest(ApiResponse<object>.Error("File exceeds the 20 MB limit"));

        var objectKey = $"{userId}/{Guid.NewGuid()}_{file.FileName}";
        await using var stream = file.OpenReadStream();
        await _minio.UploadAsync("mail-attachments", objectKey, stream, file.ContentType, file.Length);

        var dto = new CV_Generator.Dto.ScheduleAttachmentRef
        {
            FileName = file.FileName,
            ContentType = file.ContentType,
            ObjectKey = objectKey,
            SizeBytes = file.Length
        };
        return Ok(ApiResponse<CV_Generator.Dto.ScheduleAttachmentRef>.Ok(dto));
    }

    [HttpPost("send")]
    public async Task<IActionResult> Send([FromBody] SendEmailDto dto)
    {
        var userId = GetUserId();
        if (dto.RecipientIds.Count == 0)
            return BadRequest(ApiResponse<object>.Error("No recipients specified"));

        // Reject oversized attachment payloads early (Gmail hard limit is 25MB per message).
        const long MaxAttachmentsBytes = 20 * 1024 * 1024;
        if (dto.Attachments is { Count: > 0 })
        {
            long total = 0;
            foreach (var att in dto.Attachments)
            {
                if (string.IsNullOrWhiteSpace(att.ContentBase64))
                    return BadRequest(ApiResponse<object>.Error($"Attachment '{att.FileName}' has no content"));
                total += (long)(att.ContentBase64.Length * 3L / 4); // approx decoded size
            }
            if (total > MaxAttachmentsBytes)
                return BadRequest(ApiResponse<object>.Error(
                    $"Attachments exceed the 20 MB limit ({total / 1024 / 1024} MB)"));
        }

        var contacts = await _db.Set<Contact>()
            .Where(c => dto.RecipientIds.Contains(c.Id) && c.UserId == userId)
            .ToListAsync();

        if (contacts.Count == 0)
            return BadRequest(ApiResponse<object>.Error("No valid contacts found"));

        var connection = await _db.Set<GmailConnection>()
            .FirstOrDefaultAsync(c => c.UserId == userId && !c.IsRevoked);

        var fromEmail = connection?.GmailAddress ?? "noreply@propel.com";
        var provider = connection is not null ? "gmail" : "smtp";

        var userCvs = await _db.Cvs.AsNoTracking()
            .Where(c => c.UserId == userId)
            .Include(c => c.Versions)
            .ToListAsync();

        var sent = 0;
        var failed = 0;
        string? firstMessageId = null;
        string? firstThreadId = null;
        Contact? firstSentContact = null;

        foreach (var contact in contacts)
        {
            var sentAt = DateTime.UtcNow;
            try
            {
                var (messageId, threadId) = await _gmailSendSvc.SendWithAttachmentAsync(
                    userId, contact.Email, dto.Subject, dto.Body, null, dto.Attachments);

                firstMessageId ??= messageId;
                firstThreadId ??= threadId;
                firstSentContact ??= contact;

                _db.Set<EmailMessage>().Add(new EmailMessage
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    ContactId = contact.Id,
                    FromEmail = fromEmail,
                    ToEmail = contact.Email,
                    ToName = contact.Name,
                    Subject = dto.Subject,
                    Body = dto.Body,
                    Status = "sent",
                    Provider = provider,
                    SentAt = sentAt,
                    AttachmentMetadataJson = dto.Attachments is { Count: > 0 }
                        ? JsonSerializer.Serialize(dto.Attachments.Select(a => new EmailAttachmentInfoDto
                          {
                              FileName = a.FileName,
                              ContentType = a.ContentType,
                              SizeBytes = (long)(a.ContentBase64.Length * 3L / 4)
                          }).ToList())
                        : null
                });

                await RecordCvSendsAsync(userId, dto.ApplicationId, dto.Attachments, userCvs, sentAt);
                sent++;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send email to {Email} for user {UserId}", contact.Email, userId);

                _db.Set<EmailMessage>().Add(new EmailMessage
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    ContactId = contact.Id,
                    FromEmail = fromEmail,
                    ToEmail = contact.Email,
                    ToName = contact.Name,
                    Subject = dto.Subject,
                    Body = dto.Body,
                    Status = "failed",
                    Error = ex.Message,
                    Provider = provider
                });
                failed++;
            }
        }

        await _db.SaveChangesAsync();

        // Optionally log one SENT attempt on the given application (re-uses all
        // existing side effects: SAVED → APPLIED, AppliedAt backfill, timeline entry).
        object? loggedAttempt = null;
        if (dto.ApplicationId.HasValue && firstSentContact is not null)
        {
            try
            {
                var attempt = await _applicationSvc.CreateAttemptAsync(
                    dto.ApplicationId.Value,
                    new CreateAttemptDto(
                        Channel: "EMAIL_GMAIL",
                        InitiatedBy: "USER",
                        Status: "SENT",
                        Subject: dto.Subject,
                        ContactId: firstSentContact.Id,
                        ChannelMetadataJson: (firstMessageId ?? firstThreadId) is not null
                            ? JsonSerializer.Serialize(new { messageId = firstMessageId, threadId = firstThreadId })
                            : null,
                        SentAt: DateTime.UtcNow),
                    userId);

                var app = await _db.Applications.AsNoTracking()
                    .FirstOrDefaultAsync(a => a.Id == dto.ApplicationId.Value && a.CandidateId == userId);
                loggedAttempt = new
                {
                    applicationId = dto.ApplicationId.Value,
                    attemptId = attempt?.Id,
                    companyName = app?.CompanyName,
                    positionTitle = app?.PositionTitle,
                };
            }
            catch (Exception ex)
            {
                // Email went out; never fail the request because bookkeeping didn't stick.
                _logger.LogError(ex, "Email sent but failed to log attempt on application {AppId} for user {UserId}",
                    dto.ApplicationId.Value, userId);
                loggedAttempt = new { applicationId = dto.ApplicationId.Value, error = "attempt-log-failed" };
            }
        }

        return Ok(ApiResponse<object>.Ok(new { sent, failed, total = contacts.Count, loggedAttempt }));
    }

    [HttpGet("stats")]
    public async Task<IActionResult> GetStats()
    {
        var userId = GetUserId();
        var totalSent = await _db.Set<EmailMessage>().CountAsync(m => m.UserId == userId && m.Status == "sent");
        var totalFailed = await _db.Set<EmailMessage>().CountAsync(m => m.UserId == userId && m.Status == "failed");
        var totalSchedules = await _db.Set<EmailSchedule>().CountAsync(s => s.UserId == userId && s.IsActive);
        var totalContacts = await _contactSvc.GetContactCountAsync(userId);
        var successRate = (totalSent + totalFailed) > 0
            ? Math.Round((double)totalSent / (totalSent + totalFailed) * 100, 1)
            : 100;

        return Ok(ApiResponse<MailboxStatsDto>.Ok(new MailboxStatsDto
        {
            EmailsSent = totalSent,
            ScheduledEmails = totalSchedules,
            Contacts = (int)totalContacts,
            SuccessRate = successRate
        }));
    }

    /// <summary>
    /// Matches the sent email's attachment filenames against the user's CV versions and records
    /// one CvVersionSend per matched version. Dedupes by (CvVersionId, SentAt within a few
    /// seconds) so a successful send is never double-counted across retries.
    /// </summary>
    private async Task RecordCvSendsAsync(
        Guid userId, Guid? applicationId, List<CV_Generator.Dto.EmailAttachmentDto>? attachments,
        List<Models.Cv> cvs, DateTime sentAt)
    {
        if (attachments is not { Count: > 0 } || cvs.Count == 0) return;

        try
        {
            var seen = new HashSet<Guid>();
            foreach (var att in attachments)
            {
                var version = CV_Generator.Services.CvSendMatcher.Match(att.FileName, cvs);
                if (version is null || !seen.Add(version.Id)) continue;

                var dupCutoff = sentAt.AddSeconds(-5);
                var alreadySent = await _db.CvVersionSends.AnyAsync(s =>
                    s.UserId == userId && s.CvVersionId == version.Id && s.SentAt >= dupCutoff && s.SentAt < sentAt.AddSeconds(1));
                if (alreadySent) continue;

                _db.CvVersionSends.Add(new CV_Generator.Models.CvVersionSend
                {
                    Id = Guid.NewGuid(),
                    UserId = userId,
                    CvVersionId = version.Id,
                    CvId = version.CvId,
                    ApplicationId = applicationId,
                    SentAt = sentAt
                });
            }
        }
        catch (Exception ex)
        {
            // The email already went out; analytics tracking must never fail the send.
            _logger.LogWarning(ex, "Failed to record CV sends for user {UserId}", userId);
        }
    }
}
