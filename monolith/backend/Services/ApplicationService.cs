using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using CV_Generator.Data;
using CV_Generator.Dto;
using CV_Generator.Models;

namespace CV_Generator.Services;

public class ApplicationService : IApplicationService
{
    private readonly AppDbContext _db;
    private readonly ILogger<ApplicationService> _logger;

    public ApplicationService(AppDbContext db, ILogger<ApplicationService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<ApplicationListDto> GetAllAsync(Guid userId, int page, int pageSize, string[]? statuses = null, string? search = null, DateTime? appliedFrom = null, DateTime? appliedTo = null, DateTime? updatedFrom = null, DateTime? updatedTo = null, string? sortBy = null, string? sortDir = null)
    {
        var query = BuildFilteredQuery(userId, statuses, search, appliedFrom, appliedTo, updatedFrom, updatedTo);
        var total = await query.CountAsync();
        IOrderedQueryable<Application> ordered = query.OrderBy(a => a.AppliedAt == null).ThenByDescending(a => a.AppliedAt);
        var dir = string.Equals(sortDir, "asc", StringComparison.OrdinalIgnoreCase);
        switch ((sortBy ?? "appliedAt").ToLowerInvariant())
        {
            case "updatedat": ordered = dir ? query.OrderBy(a => a.UpdatedAt) : query.OrderByDescending(a => a.UpdatedAt); break;
            case "companyname": ordered = dir ? query.OrderBy(a => a.CompanyName) : query.OrderByDescending(a => a.CompanyName); break;
            case "positiontitle": ordered = dir ? query.OrderBy(a => a.PositionTitle) : query.OrderByDescending(a => a.PositionTitle); break;
            default: ordered = dir
                ? query.OrderBy(a => a.AppliedAt == null).ThenBy(a => a.AppliedAt)
                : query.OrderBy(a => a.AppliedAt == null).ThenByDescending(a => a.AppliedAt); break;
        }
        var apps = await ordered
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return new ApplicationListDto(apps.Select(MapToDto).ToList(), total, page, pageSize);
    }

    public async Task<ApplicationResponseDto?> GetByIdAsync(Guid id, Guid userId)
    {
        var app = await _db.Applications
            .Include(a => a.StatusHistory.OrderByDescending(h => h.ChangedAt))
            .Include(a => a.Attempts.OrderBy(t => t.AttemptNumber))
            .FirstOrDefaultAsync(a => a.Id == id && a.CandidateId == userId && !a.IsDeleted);
        return app == null ? null : MapToDtoWithHistory(app);
    }

    public async Task<DuplicateCheckResponseDto> CheckDuplicatesAsync(Guid userId, DuplicateCheckRequestDto dto)
    {
        var fingerprint = FingerprintHelper.Compute(dto.CompanyName, dto.PositionTitle);
        var matches = await FindDuplicatesAsync(userId, fingerprint, dto.JobOfferId, dto.ExcludeApplicationId);
        return MapDuplicateMatches(matches, dto.JobOfferId);
    }

    public async Task<ApplicationResponseDto> CreateAsync(CreateApplicationDto dto, Guid userId)
    {
        ValidateCreate(dto);

        if (!Enum.TryParse<ApplicationOrigin>(dto.Origin, true, out var origin))
            origin = ApplicationOrigin.MANUAL;

        var initialStatus = Enum.TryParse<ApplicationStatus>(dto.Status, true, out var parsedStatus)
            ? parsedStatus
            : ApplicationStatus.APPLIED;

        if (!Enum.TryParse<ApplicationPriority>(dto.Priority, true, out var priority))
            throw new ArgumentException($"Invalid priority value '{dto.Priority}'");
        var internshipType = dto.InternshipType?.Trim();
        if (internshipType is { Length: > 50 })
            throw new ArgumentException("Internship type cannot exceed 50 characters");

        // Soft dedup: warn when an equivalent application already exists
        var fingerprint = FingerprintHelper.Compute(dto.CompanyName, dto.PositionTitle);
        var duplicates = await FindDuplicatesAsync(userId, fingerprint, dto.JobOfferId, excludeId: null);
        if (!dto.AllowDuplicate && duplicates.Count > 0)
        {
            _logger.LogInformation("Duplicate check hit for {Company}/{Position}: {Count} match(es)",
                dto.CompanyName, dto.PositionTitle, duplicates.Count);
            throw new DuplicateApplicationException(MapDuplicateMatches(duplicates, dto.JobOfferId));
        }

        var app = new Application
        {
            CandidateId = userId,
            CvVersionId = dto.CvVersionId,
            JobOfferId = dto.JobOfferId,
            CompanyName = dto.CompanyName.Trim(),
            PositionTitle = dto.PositionTitle.Trim(),
            OfferSource = dto.OfferSource,
            Origin = origin,
            InternshipType = string.IsNullOrEmpty(internshipType) ? null : internshipType,
            Priority = priority,
            Status = initialStatus,
            AppliedAt = initialStatus == ApplicationStatus.SAVED ? null : (dto.AppliedAt ?? DateTime.UtcNow),
            UpdatedAt = DateTime.UtcNow,
            Notes = dto.Notes
        };
        app.Fingerprint = FingerprintHelper.ComputeFor(app);

        _db.Applications.Add(app);
        await _db.SaveChangesAsync();

        await RecordHistoryAsync(app.Id, null, initialStatus, userId.ToString(), "Application created");

        _logger.LogInformation("Application created {Id} ({Origin}, {Status}) for user {User}",
            app.Id, origin, initialStatus, userId);

        return MapToDtoWithHistory(await ReloadAsync(app.Id));
    }

    public async Task<ApplicationResponseDto?> UpdateStatusAsync(Guid id, UpdateStatusDto dto, Guid userId)
    {
        var app = await _db.Applications.FirstOrDefaultAsync(a => a.Id == id && a.CandidateId == userId && !a.IsDeleted);
        if (app == null) return null;

        if (!Enum.TryParse<ApplicationStatus>(dto.Status?.ToUpperInvariant(), out var newStatus))
            throw new ArgumentException($"Invalid status value '{dto.Status}'");

        var oldStatus = app.Status;

        if (newStatus == ApplicationStatus.SAVED)
            app.AppliedAt = null;
        else if (newStatus == ApplicationStatus.APPLIED && oldStatus == ApplicationStatus.SAVED)
            app.AppliedAt = DateTime.UtcNow;

        app.Status = newStatus;
        app.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await RecordHistoryAsync(id, oldStatus, newStatus, userId.ToString(), dto.Comment);

        _logger.LogInformation("Application {Id} status updated from {Old} to {New}", id, oldStatus, newStatus);

        return MapToDtoWithHistory(await ReloadAsync(id));
    }

    public async Task<ApplicationResponseDto?> UpdateDetailsAsync(Guid id, UpdateApplicationDto dto, Guid userId)
    {
        var app = await _db.Applications.FirstOrDefaultAsync(a => a.Id == id && a.CandidateId == userId && !a.IsDeleted);
        if (app == null) return null;

        if (!string.IsNullOrWhiteSpace(dto.CompanyName))
        {
            if (dto.CompanyName.Length > 200) throw new ArgumentException("Company name cannot exceed 200 characters");
            app.CompanyName = dto.CompanyName.Trim();
        }
        if (!string.IsNullOrWhiteSpace(dto.PositionTitle))
        {
            if (dto.PositionTitle.Length > 150) throw new ArgumentException("Position title cannot exceed 150 characters");
            app.PositionTitle = dto.PositionTitle.Trim();
        }
        if (dto.OfferSource != null) app.OfferSource = dto.OfferSource;
        if (dto.Notes != null) app.Notes = dto.Notes;
        if (dto.InternshipType != null)
        {
            if (dto.InternshipType.Length > 50) throw new ArgumentException("Internship type cannot exceed 50 characters");
            app.InternshipType = string.IsNullOrWhiteSpace(dto.InternshipType) ? null : dto.InternshipType.Trim();
        }
        if (dto.Priority != null)
        {
            if (!Enum.TryParse<ApplicationPriority>(dto.Priority, true, out var parsedPriority))
                throw new ArgumentException($"Invalid priority value '{dto.Priority}'");
            app.Priority = parsedPriority;
        }
        if (dto.CvVersionId.HasValue)
        {
            var cvOwned = await _db.CvVersions.AnyAsync(v => v.Id == dto.CvVersionId.Value && v.Cv.UserId == userId);
            if (!cvOwned) throw new ArgumentException("Invalid cvVersionId");
            app.CvVersionId = dto.CvVersionId.Value;
        }

        app.Fingerprint = FingerprintHelper.ComputeFor(app);
        app.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return MapToDtoWithHistory(await ReloadAsync(id));
    }

    public async Task<ApplicationResponseDto?> UpdateLinkedEmailAsync(Guid id, Guid? emailMessageId, Guid userId)
    {
        var app = await _db.Applications.FirstOrDefaultAsync(a => a.Id == id && a.CandidateId == userId && !a.IsDeleted);
        if (app == null) return null;

        if (emailMessageId.HasValue)
        {
            var email = await _db.EmailMessages.AsNoTracking().FirstOrDefaultAsync(m => m.Id == emailMessageId.Value && m.UserId == userId);
            if (email == null) throw new ArgumentException($"Email message {emailMessageId} not found");
        }

        app.LinkedEmailMessageId = emailMessageId;
        app.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return MapToDtoWithHistory(await ReloadAsync(id));
    }

    public async Task<bool> DeleteAsync(Guid id, Guid userId)
    {
        var app = await _db.Applications.FirstOrDefaultAsync(a => a.Id == id && a.CandidateId == userId);
        if (app == null) return false;

        app.IsDeleted = true;
        app.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();
        _logger.LogInformation("Application {Id} soft-deleted", id);
        return true;
    }

    public async Task<bool?> ToggleSaveAsync(Guid id, Guid userId)
    {
        var app = await _db.Applications.FirstOrDefaultAsync(a => a.Id == id && a.CandidateId == userId && !a.IsDeleted);
        if (app == null) return null;

        var oldStatus = app.Status;
        var isSaved = app.Status == ApplicationStatus.SAVED;
        var comment = isSaved ? "Removed from saved" : "Saved for later";

        var newStatus = isSaved ? ApplicationStatus.APPLIED : ApplicationStatus.SAVED;

        if (newStatus == ApplicationStatus.SAVED)
            app.AppliedAt = null;
        else if (oldStatus == ApplicationStatus.SAVED && app.AppliedAt == null)
        {
            var hasSentAttempt = await _db.ApplicationAttempts
                .AnyAsync(t => t.ApplicationId == id && t.Status == AttemptStatus.SENT);
            if (!hasSentAttempt)
                app.AppliedAt = DateTime.UtcNow;
        }

        app.Status = newStatus;
        app.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        await RecordHistoryAsync(id, oldStatus, newStatus, userId.ToString(), comment);
        return !isSaved;
    }

    // ── Statistics ──────────────────────────────────────────────────────────────

    public async Task<ApplicationStatisticsDto> GetStatisticsAsync(Guid userId)
    {
        var stats = await _db.Applications
            .Where(a => a.CandidateId == userId && !a.IsDeleted)
            .GroupBy(a => a.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count);

        return new ApplicationStatisticsDto(
            stats.Values.Sum(),
            stats.GetValueOrDefault(ApplicationStatus.SAVED, 0),
            stats.GetValueOrDefault(ApplicationStatus.APPLIED, 0),
            stats.GetValueOrDefault(ApplicationStatus.SCREENING, 0),
            stats.GetValueOrDefault(ApplicationStatus.INTERVIEW, 0),
            stats.GetValueOrDefault(ApplicationStatus.OFFER, 0),
            stats.GetValueOrDefault(ApplicationStatus.ACCEPTED, 0),
            stats.GetValueOrDefault(ApplicationStatus.REJECTED, 0),
            stats.GetValueOrDefault(ApplicationStatus.WITHDRAWN, 0)
        );
    }

    public async Task<StatisticsTrendsDto> GetTrendsAsync(Guid userId)
    {
        var current = await GetStatisticsAsync(userId);
        var monthlyTrends = await GetMonthlyTrendsAsync(userId);
        var avgResponseTime = await GetAverageResponseTimeAsync(userId);

        return new StatisticsTrendsDto(current, monthlyTrends, avgResponseTime);
    }

    public async Task<AnalyticsSummaryDto> GetAnalyticsSummaryAsync(Guid userId)
    {
        var stats = await GetStatisticsAsync(userId);
        var monthly = await GetMonthlyTrendsAsync(userId);
        var weekly = await GetWeeklyTrendsAsync(userId);
        var avg = await GetAverageResponseTimeAsync(userId);

        var apps = _db.Applications.Where(a => a.CandidateId == userId && !a.IsDeleted);

        var priorityCounts = await apps.GroupBy(a => a.Priority)
            .Select(g => new { Key = g.Key.ToString(), Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count);

        var originCounts = await apps.GroupBy(a => a.Origin)
            .Select(g => new { Key = g.Key.ToString(), Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count);

        var channelCounts = await _db.ApplicationAttempts
            .Where(x => x.Status == AttemptStatus.SENT)
            .GroupBy(x => x.Channel)
            .Select(g => new { Key = g.Key.ToString(), Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count);

        var funnel = new List<FunnelStageDto>
        {
            new("SAVED", stats.Saved),
            new("APPLIED", stats.Applied),
            new("SCREENING", stats.Screening),
            new("INTERVIEW", stats.Interview),
            new("OFFER", stats.Offer),
            new("ACCEPTED", stats.Accepted),
        };

        var topCompaniesRaw = await apps
            .GroupBy(a => a.CompanyName)
            .Select(g => new { Name = g.Key, Count = g.Count(), LastAppliedAt = g.Max(a => a.AppliedAt) })
            .OrderByDescending(c => c.Count)
            .Take(8)
            .ToListAsync();

        var topCompanies = topCompaniesRaw
            .Select(c => new TopCompanyDto(c.Name, c.Count, c.LastAppliedAt))
            .ToList();

        var distinctCompanies = await apps.Select(a => a.CompanyName).Distinct().CountAsync();

        var cvPerformance = await GetCvPerformanceAsync(userId);

        var email = await GetEmailStatsAsync(userId);

        return new AnalyticsSummaryDto(stats, avg, distinctCompanies, monthly, weekly, priorityCounts, originCounts, channelCounts, funnel, topCompanies, email, cvPerformance);
    }

    private async Task<List<CvPerformanceDto>> GetCvPerformanceAsync(Guid userId)
    {
        var sends = await _db.CvVersionSends
            .Where(s => s.UserId == userId)
            .Select(s => new
            {
                s.CvVersionId,
                s.ApplicationId,
                Status = s.Application != null && !s.Application.IsDeleted
                    ? (ApplicationStatus?)s.Application.Status
                    : null
            })
            .ToListAsync();

        var sentVersionIds = sends.Select(s => s.CvVersionId).Distinct().ToList();
        var versions = await _db.CvVersions.AsNoTracking()
            .Where(v => sentVersionIds.Contains(v.Id) && v.Cv.UserId == userId)
            .Select(v => new { v.Id, v.VersionNumber, v.Label, CvTitle = v.Cv.Title, v.Cv.TagsJson })
            .ToListAsync();
        var versionMeta = versions.ToDictionary(v => v.Id);

        var results = new List<CvPerformanceDto>();
        foreach (var group in sends.GroupBy(s => s.CvVersionId))
        {
            if (!versionMeta.TryGetValue(group.Key, out var meta)) continue;

            var distinctApps = group
                .Where(s => s.ApplicationId.HasValue && s.Status.HasValue)
                .Select(s => (Id: s.ApplicationId!.Value, Status: s.Status!.Value))
                .Distinct()
                .ToList();

            results.Add(new CvPerformanceDto(
                meta.CvTitle,
                meta.VersionNumber,
                string.IsNullOrWhiteSpace(meta.Label) ? null : meta.Label,
                meta.Id,
                Cv.ParseTags(meta.TagsJson),
                group.Count(),
                distinctApps.Count,
                distinctApps.Count(a => a.Status == ApplicationStatus.INTERVIEW),
                distinctApps.Count(a => a.Status is ApplicationStatus.OFFER or ApplicationStatus.ACCEPTED)
            ));
        }

        return results
            .OrderByDescending(p => p.SentCount)
            .ThenBy(p => p.CvTitle)
            .ToList();
    }

    private async Task<List<WeeklyTrendDto>> GetWeeklyTrendsAsync(Guid userId, int weeks = 16)
    {
        var cutoff = DateTime.UtcNow.AddDays(-(weeks * 7));

        var raw = await _db.Applications
            .Where(a => a.CandidateId == userId && !a.IsDeleted && a.AppliedAt != null && a.AppliedAt >= cutoff)
            .ToListAsync();

        var calendar = CultureInfo.InvariantCulture.Calendar;
        var byWeek = raw
            .GroupBy(a =>
            {
                var d = a.AppliedAt!.Value;
                var week = calendar.GetWeekOfYear(d, CalendarWeekRule.FirstFourDayWeek, DayOfWeek.Monday);
                return new { d.Year, Week = week };
            })
            .OrderBy(g => g.Key.Year).ThenBy(g => g.Key.Week)
            .ToList();

        return byWeek.Select(r =>
        {
            var s = r.GroupBy(a => a.Status).ToDictionary(x => x.Key, x => x.Count());
            return new WeeklyTrendDto(
                r.Key.Year, r.Key.Week,
                s.GetValueOrDefault(ApplicationStatus.SAVED, 0),
                s.GetValueOrDefault(ApplicationStatus.APPLIED, 0),
                s.GetValueOrDefault(ApplicationStatus.SCREENING, 0),
                s.GetValueOrDefault(ApplicationStatus.INTERVIEW, 0),
                s.GetValueOrDefault(ApplicationStatus.OFFER, 0),
                s.GetValueOrDefault(ApplicationStatus.ACCEPTED, 0),
                s.GetValueOrDefault(ApplicationStatus.REJECTED, 0),
                s.GetValueOrDefault(ApplicationStatus.WITHDRAWN, 0)
            );
        }).ToList();
    }

    private async Task<EmailStatsDto> GetEmailStatsAsync(Guid userId)
    {
        var byStatus = await _db.EmailMessages
            .Where(m => m.UserId == userId)
            .GroupBy(m => m.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync();

        var sent = byStatus.Where(m => m.Status == "sent").Sum(m => m.Count);
        var failed = byStatus.Where(m => m.Status == "failed").Sum(m => m.Count);
        var total = sent + failed;
        var successRate = total == 0 ? 0 : Math.Round((double)sent / total * 100, 1);

        var activeSchedules = await _db.EmailSchedules
            .Where(s => s.UserId == userId && s.IsActive)
            .CountAsync();

        return new EmailStatsDto(sent, failed, successRate, activeSchedules);
    }

    private async Task<List<MonthlyTrendDto>> GetMonthlyTrendsAsync(Guid userId, int months = 12)
    {
        var cutoff = DateTime.UtcNow.AddMonths(-months);

        var raw = await _db.Applications
            .Where(a => a.CandidateId == userId && !a.IsDeleted && a.AppliedAt != null && a.AppliedAt >= cutoff)
            .GroupBy(a => new { a.AppliedAt!.Value.Year, a.AppliedAt.Value.Month })
            .Select(g => new
            {
                g.Key.Year,
                g.Key.Month,
                Status = g.GroupBy(a => a.Status)
                    .Select(sg => new { Status = sg.Key, Count = sg.Count() })
                    .ToList()
            })
            .OrderBy(x => x.Year).ThenBy(x => x.Month)
            .ToListAsync();

        return raw.Select(r =>
        {
            var s = r.Status.ToDictionary(x => x.Status, x => x.Count);
            return new MonthlyTrendDto(
                r.Year, r.Month,
                s.GetValueOrDefault(ApplicationStatus.SAVED, 0),
                s.GetValueOrDefault(ApplicationStatus.APPLIED, 0),
                s.GetValueOrDefault(ApplicationStatus.SCREENING, 0),
                s.GetValueOrDefault(ApplicationStatus.INTERVIEW, 0),
                s.GetValueOrDefault(ApplicationStatus.OFFER, 0),
                s.GetValueOrDefault(ApplicationStatus.ACCEPTED, 0),
                s.GetValueOrDefault(ApplicationStatus.REJECTED, 0),
                s.GetValueOrDefault(ApplicationStatus.WITHDRAWN, 0)
            );
        }).ToList();
    }

    private async Task<double?> GetAverageResponseTimeAsync(Guid userId)
    {
        var initialStatuses = new[] { ApplicationStatus.APPLIED, ApplicationStatus.SAVED };

        var appsWithResponse = await _db.Applications
            .Include(a => a.StatusHistory)
            .Where(a => a.CandidateId == userId
                && !a.IsDeleted
                && a.AppliedAt != null
                && a.StatusHistory.Any(h => !initialStatuses.Contains(h.NewStatus)))
            .Select(a => new
            {
                a.AppliedAt,
                FirstResponse = a.StatusHistory
                    .Where(h => !initialStatuses.Contains(h.NewStatus))
                    .Min(h => h.ChangedAt)
            })
            .ToListAsync();

        if (appsWithResponse.Count == 0) return null;

        return appsWithResponse
            .Select(x => (x.FirstResponse - x.AppliedAt!.Value).TotalDays)
            .Average();
    }

    // ── Feed & calendar ────────────────────────────────────────────────────────

    public async Task<ActivityFeedDto> GetActivityFeedAsync(Guid userId, int limit = 50)
    {
        var query = _db.ApplicationStatusHistories
            .Include(h => h.Application)
            .Where(h => h.Application != null && h.Application.CandidateId == userId);

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(h => h.ChangedAt)
            .Take(limit)
            .Select(h => new ActivityItemDto(
                h.ApplicationId,
                h.Application!.CompanyName,
                h.Application.PositionTitle,
                h.OldStatus != null ? h.OldStatus.ToString() : null,
                h.NewStatus.ToString(),
                h.ChangedAt,
                h.Comment,
                h.Application.IsDeleted
            ))
            .ToListAsync();

        return new ActivityFeedDto(items, total);
    }

    public async Task<List<CalendarEventDto>> GetCalendarEventsAsync(Guid userId, DateTime from, DateTime to, string[]? statuses)
    {
        var events = new List<CalendarEventDto>();

        var parsedStatuses = statuses?
            .Select(s => Enum.TryParse<ApplicationStatus>(s, true, out var st) ? st : (ApplicationStatus?)null)
            .Where(s => s.HasValue)
            .Select(s => s!.Value)
            .ToList() ?? [];

        if (parsedStatuses.Contains(ApplicationStatus.APPLIED))
        {
            var appliedEvents = await _db.Applications
                .Where(a => a.CandidateId == userId
                    && !a.IsDeleted
                    && a.AppliedAt != null
                    && a.AppliedAt >= from
                    && a.AppliedAt <= to)
                .Select(a => new CalendarEventDto(
                    a.AppliedAt!.Value.ToUniversalTime().ToString("O"),
                    "applied",
                    "Applied at " + a.CompanyName,
                    a.Id,
                    a.CompanyName,
                    a.PositionTitle
                ))
                .ToListAsync();

            events.AddRange(appliedEvents);
        }

        var statusEvents = await _db.ApplicationStatusHistories
            .Include(h => h.Application)
            .Where(h => h.Application != null
                && h.Application.CandidateId == userId
                && !h.Application.IsDeleted
                && h.ChangedAt >= from
                && h.ChangedAt <= to
                && parsedStatuses.Contains(h.NewStatus)
                && h.NewStatus != ApplicationStatus.APPLIED)
            .Select(h => new CalendarEventDto(
                h.ChangedAt.ToUniversalTime().ToString("O"),
                h.NewStatus.ToString().ToLower(),
                h.Application!.CompanyName + " - " + h.NewStatus.ToString(),
                h.ApplicationId,
                h.Application!.CompanyName,
                h.Application.PositionTitle
            ))
            .ToListAsync();

        events.AddRange(statusEvents);

        return events.OrderBy(e => e.Date).ToList();
    }

    // ── Attempts ────────────────────────────────────────────────────────────────

    public async Task<List<AttemptResponseDto>> GetAttemptsAsync(Guid applicationId, Guid userId)
    {
        await EnsureOwnedAsync(applicationId, userId);

        var attempts = await _db.ApplicationAttempts
                .AsNoTracking()
                .Where(t => t.ApplicationId == applicationId)
                .OrderBy(t => t.AttemptNumber)
                .ToListAsync();
        await HydrateAttemptContactsAsync(attempts);

        return attempts.Select(MapAttemptToDto).ToList();
    }

    public async Task<AttemptResponseDto> CreateAttemptAsync(Guid applicationId, CreateAttemptDto dto, Guid userId)
    {
        var app = await EnsureOwnedAsync(applicationId, userId);

        if (!Enum.TryParse<AttemptChannel>(dto.Channel, true, out var channel))
            throw new ArgumentException($"Invalid channel value '{dto.Channel}'");
        if (!string.IsNullOrWhiteSpace(dto.InitiatedBy) && !Enum.TryParse<AttemptInitiatedBy>(dto.InitiatedBy, true, out _))
            throw new ArgumentException($"Invalid initiatedBy value '{dto.InitiatedBy}'");
        if (!string.IsNullOrWhiteSpace(dto.Status) && !Enum.TryParse<AttemptStatus>(dto.Status, true, out _))
            throw new ArgumentException($"Invalid status value '{dto.Status}'");

        Enum.TryParse<AttemptInitiatedBy>(dto.InitiatedBy, true, out var initiatedBy);
        Enum.TryParse<AttemptStatus>(dto.Status, true, out var status);

        var nextNumber = await _db.ApplicationAttempts
            .Where(t => t.ApplicationId == applicationId)
            .MaxAsync(t => (int?)t.AttemptNumber) ?? 0;
        nextNumber += 1;

        // Linked contact must belong to the user; fills recipient gaps from the card.
        var contact = await ResolveContactAsync(dto.ContactId, userId);
        if (contact != null && dto.RecipientName == null)
            dto = dto with { RecipientName = contact.Name };
        if (contact != null && dto.RecipientContact == null)
            dto = dto with { RecipientContact = contact.Email };

        var attempt = new ApplicationAttempt
        {
            ApplicationId = applicationId,
            AttemptNumber = nextNumber,
            Channel = channel,
            InitiatedBy = initiatedBy,
            Status = status,
            Subject = dto.Subject,
            Body = dto.Body,
            RecipientName = dto.RecipientName,
            RecipientContact = dto.RecipientContact,
            ContactId = contact?.Id,
            ChannelMetadataJson = dto.ChannelMetadataJson,
            CvVersionId = dto.CvVersionId,
            SentAt = status == AttemptStatus.SENT ? dto.SentAt ?? DateTime.UtcNow : dto.SentAt,
            FailureReason = dto.FailureReason
        };

        _db.ApplicationAttempts.Add(attempt);
        await _db.SaveChangesAsync();

        attempt.Contact = contact;

        if (attempt.Status == AttemptStatus.SENT)
            await ApplySentSideEffectsAsync(app, attempt, userId.ToString());

        if (attempt.Status == AttemptStatus.SENT)
            await RecordCvSendAsync(app, attempt);

        _logger.LogInformation("Attempt #{Number} ({Channel}) created on application {AppId}",
            attempt.AttemptNumber, channel, applicationId);

        return MapAttemptToDto(attempt);
    }

    public async Task<AttemptResponseDto?> UpdateAttemptAsync(Guid applicationId, Guid attemptId, UpdateAttemptDto dto, Guid userId)
    {
        await EnsureOwnedAsync(applicationId, userId);

        var attempt = await _db.ApplicationAttempts
            .FirstOrDefaultAsync(t => t.Id == attemptId && t.ApplicationId == applicationId);
        if (attempt == null) return null;

        var oldStatus = attempt.Status;

        if (dto.Status != null)
        {
            if (!Enum.TryParse<AttemptStatus>(dto.Status.ToUpperInvariant(), out var parsedStatus))
                throw new ArgumentException($"Invalid status value '{dto.Status}'");
            attempt.Status = parsedStatus;
        }
        if (dto.Subject != null) attempt.Subject = dto.Subject;
        if (dto.Body != null) attempt.Body = dto.Body;
        if (dto.RecipientName != null) attempt.RecipientName = dto.RecipientName;
        if (dto.RecipientContact != null) attempt.RecipientContact = dto.RecipientContact;
        if (dto.ContactId.HasValue)
        {
            var contact = await ResolveContactAsync(dto.ContactId.Value, userId);
            attempt.ContactId = contact!.Id;
            if (string.IsNullOrEmpty(attempt.RecipientName)) attempt.RecipientName = contact!.Name;
            if (string.IsNullOrEmpty(attempt.RecipientContact)) attempt.RecipientContact = contact!.Email;
        }
        if (dto.ChannelMetadataJson != null) attempt.ChannelMetadataJson = dto.ChannelMetadataJson;
        if (dto.CvVersionId.HasValue) attempt.CvVersionId = dto.CvVersionId.Value;
        if (dto.FailureReason != null) attempt.FailureReason = dto.FailureReason;
        if (dto.SentAt.HasValue) attempt.SentAt = dto.SentAt.Value;

        if (oldStatus != AttemptStatus.SENT && attempt.Status == AttemptStatus.SENT && attempt.SentAt == null)
            attempt.SentAt = DateTime.UtcNow;

        attempt.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        if (oldStatus != AttemptStatus.SENT && attempt.Status == AttemptStatus.SENT)
        {
            var app = await _db.Applications.FirstAsync(a => a.Id == applicationId);
            await ApplySentSideEffectsAsync(app, attempt, userId.ToString());
            await RecordCvSendAsync(app, attempt);
        }

        await HydrateAttemptContactsAsync(new List<ApplicationAttempt> { attempt });

        _logger.LogInformation("Attempt {AttemptId} updated: {Old} → {New}",
            attemptId, oldStatus, attempt.Status);

        return MapAttemptToDto(attempt);
    }

    /// <summary>
    /// Contacts likely relevant to this application: same company, or email handle mentioning it.
    /// </summary>
    public async Task<List<ContactSummaryDto>> GetSuggestedContactsAsync(Guid applicationId, Guid userId)
    {
        var app = await EnsureOwnedAsync(applicationId, userId);

        var token = app.CompanyName.Trim().Replace(" ", "").ToLower();
        var query = _db.Contacts.AsNoTracking().Where(c => c.UserId == userId);

        query = token.Length >= 3
            ? query.Where(c =>
                (c.Company != null && EF.Functions.ILike(c.Company, app.CompanyName)) ||
                EF.Functions.ILike(c.Email, $"%{token}%"))
            : query.Where(c => c.Company != null && EF.Functions.ILike(c.Company, app.CompanyName));

        return await query
            .OrderByDescending(c => c.IsFavorite)
            .ThenBy(c => c.Name)
            .Take(8)
            .Select(c => new ContactSummaryDto(c.Id, c.Name, c.Email, c.Company, c.Position, c.IsFavorite))
            .ToListAsync();
    }

    /// <summary>
    /// Applications reached through a specific contact (via linked attempts). Null → contact not found.
    /// </summary>
    public async Task<List<ApplicationResponseDto>?> GetApplicationsForContactAsync(Guid contactId, Guid userId)
    {
        var contact = await _db.Contacts.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == contactId && c.UserId == userId);
        if (contact is null) return null;

        var appIds = await _db.ApplicationAttempts.AsNoTracking()
            .Where(t => t.ContactId == contactId)
            .Select(t => t.ApplicationId)
            .Distinct()
            .ToListAsync();
        if (appIds.Count == 0) return [];

        var apps = await _db.Applications
            .Where(a => a.CandidateId == userId && !a.IsDeleted && appIds.Contains(a.Id))
            .Include(a => a.StatusHistory.OrderByDescending(h => h.ChangedAt))
            .Include(a => a.Attempts.OrderBy(t => t.AttemptNumber)).ThenInclude(t => t.Contact)
            .OrderByDescending(a => a.UpdatedAt)
            .ToListAsync();

        return apps.Select(MapToDtoWithHistory).ToList();
    }

    /// <summary>
    /// All of the user's applications whose company name matches (normalized) the given name.
    /// </summary>
    public async Task<List<ApplicationResponseDto>> GetApplicationsByCompanyAsync(Guid userId, string companyName)
    {
        var key = companyName.Trim().ToLower();

        var apps = await _db.Applications
            .Where(a => a.CandidateId == userId && !a.IsDeleted && a.CompanyName.Trim().ToLower() == key)
            .Include(a => a.StatusHistory.OrderByDescending(h => h.ChangedAt))
            .Include(a => a.Attempts.OrderBy(t => t.AttemptNumber)).ThenInclude(t => t.Contact)
            .OrderByDescending(a => a.AppliedAt ?? a.UpdatedAt)
            .ToListAsync();

        return apps.Select(MapToDtoWithHistory).ToList();
    }

    /// <summary>
    /// Side effects of a sent attempt: first real send moves SAVED → APPLIED,
    /// sets AppliedAt if unknown, and logs a feed entry so re-applies show up in the timeline.
    /// </summary>
    private async Task ApplySentSideEffectsAsync(Application app, ApplicationAttempt attempt, string changedBy)
    {
        var comment = $"Attempt #{attempt.AttemptNumber} sent via {attempt.Channel}";

        if (app.AppliedAt == null || app.AppliedAt > attempt.SentAt)
            app.AppliedAt = attempt.SentAt;

        if (app.Status == ApplicationStatus.SAVED)
        {
            var oldStatus = app.Status;
            app.Status = ApplicationStatus.APPLIED;
            app.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            await RecordHistoryAsync(app.Id, oldStatus, ApplicationStatus.APPLIED, changedBy, comment);
        }
        else
        {
            app.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            // Self-transition entry keeps the activity feed aware of every send/re-apply.
            await RecordHistoryAsync(app.Id, app.Status, app.Status, changedBy, comment);
        }
    }

    /// <summary>
    /// When a SENT attempt carries a linked CV version, records a CvVersionSend so the
    /// per-CV sent analytics can attribute the application.
    /// </summary>
    private async Task RecordCvSendAsync(Application app, ApplicationAttempt attempt)
    {
        if (!attempt.CvVersionId.HasValue) return;
        var version = await _db.CvVersions.AsNoTracking()
            .FirstOrDefaultAsync(v => v.Id == attempt.CvVersionId.Value);
        if (version is null) return;

        _db.CvVersionSends.Add(new CvVersionSend
        {
            Id = Guid.NewGuid(),
            UserId = app.CandidateId,
            CvVersionId = version.Id,
            CvId = version.CvId,
            ApplicationId = app.Id,
            SentAt = attempt.SentAt ?? DateTime.UtcNow
        });
        await _db.SaveChangesAsync();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private IQueryable<Application> BuildFilteredQuery(Guid userId, string[]? statuses, string? search, DateTime? appliedFrom, DateTime? appliedTo, DateTime? updatedFrom, DateTime? updatedTo)
    {
        var query = _db.Applications.Where(a => a.CandidateId == userId && !a.IsDeleted);

        if (statuses is { Length: > 0 })
        {
            var parsed = statuses
                .Select(s => Enum.TryParse<ApplicationStatus>(s, true, out var st) ? st : (ApplicationStatus?)null)
                .Where(s => s.HasValue)
                .Select(s => s!.Value)
                .ToList();
            if (parsed.Count > 0)
                query = query.Where(a => parsed.Contains(a.Status));
        }

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(a =>
                EF.Functions.ILike(a.CompanyName, $"%{search}%") ||
                EF.Functions.ILike(a.PositionTitle, $"%{search}%"));

        if (appliedFrom.HasValue)
            query = query.Where(a => a.AppliedAt != null && a.AppliedAt >= appliedFrom.Value);
        if (appliedTo.HasValue)
            query = query.Where(a => a.AppliedAt != null && a.AppliedAt <= appliedTo.Value);

        if (updatedFrom.HasValue)
            query = query.Where(a => a.UpdatedAt >= updatedFrom.Value);
        if (updatedTo.HasValue)
            query = query.Where(a => a.UpdatedAt <= updatedTo.Value);

        return query;
    }

    private async Task<List<Application>> FindDuplicatesAsync(Guid userId, string fingerprint, Guid? jobOfferId, Guid? excludeId)
    {
        var query = _db.Applications.Where(a => a.CandidateId == userId && !a.IsDeleted);

        if (!string.IsNullOrEmpty(fingerprint))
            query = query.Where(a => a.Fingerprint == fingerprint);

        if (jobOfferId.HasValue)
            query = query.Where(a => a.JobOfferId == jobOfferId.Value);

        if (excludeId.HasValue)
            query = query.Where(a => a.Id != excludeId.Value);

        return await query
            .OrderByDescending(a => a.UpdatedAt)
            .ToListAsync();
    }

    private DuplicateCheckResponseDto MapDuplicateMatches(List<Application> matches, Guid? jobOfferId)
        => new(
            matches.Count > 0,
            matches.Select(a => new DuplicateMatchDto(
                a.Id,
                a.CompanyName,
                a.PositionTitle,
                a.Status.ToString(),
                a.AppliedAt,
                a.UpdatedAt,
                jobOfferId.HasValue && a.JobOfferId == jobOfferId.Value
            )).ToList()
        );

    private static void ValidateCreate(CreateApplicationDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.CompanyName))
            throw new ArgumentException("Company name is required");
        if (dto.CompanyName.Length > 200)
            throw new ArgumentException("Company name cannot exceed 200 characters");
        if (string.IsNullOrWhiteSpace(dto.PositionTitle))
            throw new ArgumentException("Position title is required");
        if (dto.PositionTitle.Length > 150)
            throw new ArgumentException("Position title cannot exceed 150 characters");
    }

    private async Task<Application> EnsureOwnedAsync(Guid applicationId, Guid userId)
    {
        var app = await _db.Applications
            .FirstOrDefaultAsync(a => a.Id == applicationId && a.CandidateId == userId && !a.IsDeleted)
            ?? throw new KeyNotFoundException($"Application {applicationId} not found");
        return app;
    }

    private async Task<Contact?> ResolveContactAsync(Guid? contactId, Guid userId)
    {
        if (contactId is null) return null;
        return await _db.Contacts.FirstOrDefaultAsync(c => c.Id == contactId.Value && c.UserId == userId)
            ?? throw new ArgumentException($"Contact {contactId} not found");
    }

    /// <summary>Loads the Contact navigation for attempts that reference one (avoids N+1).</summary>
    private async Task HydrateAttemptContactsAsync(List<ApplicationAttempt> attempts)
    {
        var ids = attempts.Where(t => t.ContactId.HasValue).Select(t => t.ContactId!.Value).Distinct().ToList();
        if (ids.Count == 0) return;

        var contacts = await _db.Contacts.AsNoTracking()
            .Where(c => ids.Contains(c.Id))
            .ToListAsync();
        var map = contacts.ToDictionary(c => c.Id);

        foreach (var t in attempts)
            if (t.ContactId.HasValue && map.TryGetValue(t.ContactId.Value, out var c))
                t.Contact = c;
    }

    private async Task<Application> ReloadAsync(Guid id)
        => await _db.Applications
            .Include(a => a.StatusHistory.OrderByDescending(h => h.ChangedAt))
            .Include(a => a.Attempts.OrderBy(t => t.AttemptNumber)).ThenInclude(t => t.Contact)
            .FirstAsync(a => a.Id == id);

    private async Task RecordHistoryAsync(Guid applicationId, ApplicationStatus? oldStatus, ApplicationStatus newStatus, string changedBy, string? comment)
    {
        _db.ApplicationStatusHistories.Add(new ApplicationStatusHistory
        {
            ApplicationId = applicationId,
            OldStatus = oldStatus,
            NewStatus = newStatus,
            ChangedAt = DateTime.UtcNow,
            ChangedBy = changedBy,
            Comment = comment
        });
        await _db.SaveChangesAsync();
    }

    // ── Mapping ─────────────────────────────────────────────────────────────────

    private static ApplicationResponseDto MapToDto(Application a) => new(
        a.Id, a.CandidateId, a.CvVersionId, a.JobOfferId,
        a.CompanyName, a.PositionTitle, a.OfferSource,
        a.Status.ToString(), a.AppliedAt, a.UpdatedAt, a.Notes, a.Origin.ToString(),
        a.InternshipType, a.Priority.ToString(), null, null, a.LinkedEmailMessageId
    );

    private static ApplicationResponseDto MapToDtoWithHistory(Application a) => new(
        a.Id, a.CandidateId, a.CvVersionId, a.JobOfferId,
        a.CompanyName, a.PositionTitle, a.OfferSource,
        a.Status.ToString(), a.AppliedAt, a.UpdatedAt, a.Notes, a.Origin.ToString(),
        a.InternshipType, a.Priority.ToString(),
        a.StatusHistory?.Select(h => new StatusHistoryDto(
            h.Id, h.OldStatus?.ToString(), h.NewStatus.ToString(),
            h.ChangedAt, h.ChangedBy, h.Comment
        )).ToList(),
        a.Attempts?.Select(MapAttemptToDto).ToList(),
        a.LinkedEmailMessageId
    );

    private static AttemptResponseDto MapAttemptToDto(ApplicationAttempt t) => new(
        t.Id, t.ApplicationId, t.AttemptNumber,
        t.Channel.ToString(), t.InitiatedBy.ToString(), t.Status.ToString(),
        t.Subject, t.Body, t.RecipientName, t.RecipientContact,
        t.ContactId,
        t.Contact is null ? null : new ContactSummaryDto(
            t.Contact.Id, t.Contact.Name, t.Contact.Email,
            t.Contact.Company, t.Contact.Position, t.Contact.IsFavorite),
        t.ChannelMetadataJson, t.CvVersionId,
        t.SentAt, t.FailureReason, t.CreatedAt, t.UpdatedAt
    );
}
