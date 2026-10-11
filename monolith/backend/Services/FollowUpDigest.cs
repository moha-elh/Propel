using System.Net;
using System.Text;
using Microsoft.EntityFrameworkCore;
using CV_Generator.Data;
using CV_Generator.Models;

namespace CV_Generator.Services;

/// <summary>
/// Emails a user the applications that have been quiet for 7+ days, through their own
/// connected Gmail (the SMTP channel isn't configured in this stack).
/// </summary>
public class FollowUpDigestService(AppDbContext db, IGmailSendService gmail, ILogger<FollowUpDigestService> logger)
{
    public const int QuietDays = 7;
    private static readonly ApplicationStatus[] Awaiting =
        [ApplicationStatus.APPLIED, ApplicationStatus.SCREENING, ApplicationStatus.ASSESSMENT, ApplicationStatus.INTERVIEW];
    private static readonly string AppUrl = (Environment.GetEnvironmentVariable("FRONTEND_URL") ?? "http://localhost:4200").TrimEnd('/');

    /// <summary>Sends the digest; returns how many applications it listed (0 = nothing sent).</summary>
    public async Task<int> SendAsync(Guid userId, CancellationToken ct = default)
    {
        var connection = await db.Set<GmailConnection>().AsNoTracking()
            .FirstOrDefaultAsync(c => c.UserId == userId && !c.IsRevoked, ct)
            ?? throw new InvalidOperationException("Connect Gmail in Mailbox → Settings to get follow-up emails.");

        var cutoff = DateTime.UtcNow.AddDays(-QuietDays);
        var due = await db.Applications.AsNoTracking()
            .Where(a => a.CandidateId == userId && !a.IsDeleted && Awaiting.Contains(a.Status) && a.UpdatedAt <= cutoff)
            .OrderBy(a => a.UpdatedAt)
            .Select(a => new { a.Id, a.CompanyName, a.PositionTitle, a.UpdatedAt })
            .ToListAsync(ct);
        if (due.Count == 0) return 0;

        var rows = new StringBuilder();
        foreach (var a in due)
        {
            var days = (int)(DateTime.UtcNow - a.UpdatedAt).TotalDays;
            rows.Append($"""
                <tr>
                  <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eee"><a href="{AppUrl}/applications/{a.Id}" style="color:#1a1a1a;font-weight:600;text-decoration:none">{WebUtility.HtmlEncode(a.CompanyName)}</a><br><span style="color:#777;font-size:13px">{WebUtility.HtmlEncode(a.PositionTitle)}</span></td>
                  <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;color:{(days >= 21 ? "#c0392b" : "#555")}">{days}d quiet</td>
                </tr>
                """);
        }
        var subject = $"{due.Count} application{(due.Count == 1 ? "" : "s")} waiting on a follow-up";
        var body = $"""
            <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#1a1a1a;max-width:560px">
              <p>These have been quiet for {QuietDays}+ days, oldest first:</p>
              <table style="width:100%;border-collapse:collapse">{rows}</table>
              <p style="margin-top:20px"><a href="{AppUrl}/applications/follow-ups" style="color:#1a1a1a">Open follow-ups in Propel →</a></p>
            </div>
            """;

        var note = new Notification
        {
            UserId = userId, UserEmail = connection.GmailAddress, Type = NotificationType.WeeklyDigest,
            Channel = NotificationChannel.Email, Subject = subject, Body = body,
        };
        db.Notifications.Add(note);
        try
        {
            await gmail.SendWithAttachmentAsync(userId, connection.GmailAddress, subject, body);
            note.IsSent = true;
            note.SentAt = DateTime.UtcNow;
        }
        catch (Exception ex)
        {
            note.ErrorMessage = ex.Message;
            logger.LogError(ex, "Follow-up digest failed for user {UserId}", userId);
            throw;
        }
        finally
        {
            await db.SaveChangesAsync(CancellationToken.None);
        }
        return due.Count;
    }

    /// <summary>Monday-morning run: every Gmail-connected user with the weekly digest on, at most once per week.</summary>
    public async Task SendWeeklyAsync(CancellationToken ct)
    {
        var weekAgo = DateTime.UtcNow.AddDays(-6);
        var userIds = await db.Set<GmailConnection>().AsNoTracking()
            .Where(c => !c.IsRevoked)
            .Where(c => !db.NotificationPreferences.Any(p => p.UserId == c.UserId && (!p.WeeklyDigest || !p.EnableEmail)))
            .Where(c => !db.Notifications.Any(n => n.UserId == c.UserId && n.Type == NotificationType.WeeklyDigest && n.IsSent && n.CreatedAt > weekAgo))
            .Select(c => c.UserId).Distinct().ToListAsync(ct);

        foreach (var userId in userIds)
        {
            try { await SendAsync(userId, ct); }
            catch (Exception ex) when (ex is not OperationCanceledException) { /* logged in SendAsync; try the next user */ }
        }
    }
}

/// <summary>Checks hourly; fires the weekly digest on Mondays from 08:00 UTC.</summary>
public class FollowUpDigestWorker(IServiceScopeFactory scopeFactory, ILogger<FollowUpDigestWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        do
        {
            var now = DateTime.UtcNow;
            if (now.DayOfWeek != DayOfWeek.Monday || now.Hour < 8) continue;
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<FollowUpDigestService>().SendWeeklyAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Weekly follow-up digest run failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken).ConfigureAwait(false));
    }
}
