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
    private readonly IHttpContextAccessor? _http;

    public ApplicationService(AppDbContext db, ILogger<ApplicationService> logger, IHttpContextAccessor? http = null)
    {
        _db = db;
        _logger = logger;
        _http = http;
    }

    /// <summary>
    /// Applications narrowed to the request's <c>?country=</c> (list, stats, analytics, calendar, activity read it).
    /// Country lives on the company; an application belongs to a company by exact name or as
    /// "Company Suffix" (e.g. "Capgemini Engineering" → Capgemini).
    /// </summary>
    private IQueryable<Application> Apps
    {
        get
        {
            var country = _http?.HttpContext?.Request.Query["country"].ToString();
            if (string.IsNullOrWhiteSpace(country)) return _db.Applications;
            return _db.Applications.Where(a => _db.Companies.Any(c => c.UserId == a.CandidateId && c.Country == country
                && (c.Name.Trim().ToLower() == a.CompanyName.Trim().ToLower()
                    || a.CompanyName.Trim().ToLower().StartsWith(c.Name.Trim().ToLower() + " "))));
        }
    }

    public async Task<ApplicationListDto> GetAllAsync(Guid userId, int page, int pageSize, string[]? statuses = null, string[]? priorities = null, string? search = null, DateTime? appliedFrom = null, DateTime? appliedTo = null, DateTime? updatedFrom = null, DateTime? updatedTo = null, string? sortBy = null, string? sortDir = null)
    {
        var query = BuildFilteredQuery(userId, statuses, priorities, search, appliedFrom, appliedTo, updatedFrom, updatedTo);
        var total = await query.CountAsync();

        var apps = await ApplySorting(query, sortBy, sortDir, search)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var companies = await BuildCompanyLookupAsync(userId);
        // How each application was sent: channel of its first sent attempt (one extra query for the page).
        var ids = apps.Select(a => a.Id).ToList();
        var firstChannel = (await _db.ApplicationAttempts.AsNoTracking()
                .Where(t => ids.Contains(t.ApplicationId) && t.Status == AttemptStatus.SENT)
                .Select(t => new { t.ApplicationId, t.AttemptNumber, t.Channel })
                .ToListAsync())
            .GroupBy(t => t.ApplicationId)
            .ToDictionary(g => g.Key, g => g.MinBy(t => t.AttemptNumber)!.Channel.ToString());

        return new ApplicationListDto(
            apps.Select(a => MapToDto(a, companies) with { ApplyChannel = firstChannel.GetValueOrDefault(a.Id) }).ToList(),
            total, page, pageSize);
    }

    private static IQueryable<Application> ApplySorting(IQueryable<Application> query, string? sortBy, string? sortDir, string? search = null)
    {
        var desc = string.Equals(sortDir, "desc", StringComparison.OrdinalIgnoreCase);
        // While searching, companies whose name starts with the query come first.
        IOrderedQueryable<Application>? ordered = null;
        if (!string.IsNullOrWhiteSpace(search))
        {
            var prefix = search.Trim() + "%";
            ordered = query.OrderByDescending(a => EF.Functions.ILike(a.CompanyName, prefix));
        }

        IOrderedQueryable<Application> By<TKey>(System.Linq.Expressions.Expression<Func<Application, TKey>> key, bool d) =>
            ordered == null
                ? (d ? query.OrderByDescending(key) : query.OrderBy(key))
                : (d ? ordered.ThenByDescending(key) : ordered.ThenBy(key));

        return sortBy?.ToLowerInvariant() switch
        {
            "updated" => By(a => a.UpdatedAt, desc),
            "company" => By(a => a.CompanyName, desc),
            "priority" => By(a => a.Priority, desc),
            _ => desc
                ? By(a => a.AppliedAt == null, false).ThenByDescending(a => a.AppliedAt)
                : By(a => a.AppliedAt == null, false).ThenBy(a => a.AppliedAt),
        };
    }

    public async Task<ApplicationResponseDto?> GetByIdAsync(Guid id, Guid userId)
    {
        var app = await _db.Applications
            .Include(a => a.StatusHistory.OrderByDescending(h => h.ChangedAt))
            .Include(a => a.Attempts.OrderBy(t => t.AttemptNumber))
            .FirstOrDefaultAsync(a => a.Id == id && a.CandidateId == userId && !a.IsDeleted);
        if (app == null) return null;
        var companies = await BuildCompanyLookupAsync(userId);
        return MapToDtoWithHistory(app, companies);
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
            Notes = dto.Notes,
            ContactId = dto.ContactId,
            RecipientName = string.IsNullOrWhiteSpace(dto.RecipientName) ? null : dto.RecipientName.Trim(),
            RecipientContact = string.IsNullOrWhiteSpace(dto.RecipientContact) ? null : dto.RecipientContact.Trim(),
            AttachmentsJson = dto.Attachments is { Count: > 0 } ? JsonSerializer.Serialize(dto.Attachments) : null
        };
        app.Fingerprint = FingerprintHelper.ComputeFor(app);

        _db.Applications.Add(app);
        await _db.SaveChangesAsync();

        await RecordHistoryAsync(app.Id, null, initialStatus, userId.ToString(), "Application created");

        _logger.LogInformation("Application created {Id} ({Origin}, {Status}) for user {User}",
            app.Id, origin, initialStatus, userId);

        return MapToDtoWithHistory(await ReloadAsync(app.Id), await BuildCompanyLookupAsync(userId));
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

        // A decided/reply state satisfies the follow-up reminder.
        if (app.FollowUpStatus == FollowUpStatus.PENDING && FollowUpStatusResolvedBy(newStatus))
            app.FollowUpStatus = FollowUpStatus.ACTIONED;

        await _db.SaveChangesAsync();

        await RecordHistoryAsync(id, oldStatus, newStatus, userId.ToString(), dto.Comment);

        _logger.LogInformation("Application {Id} status updated from {Old} to {New}", id, oldStatus, newStatus);

        return MapToDtoWithHistory(await ReloadAsync(id), await BuildCompanyLookupAsync(userId));
    }

    public async Task<ApplicationResponseDto?> ApplyFollowUpActionAsync(Guid id, FollowUpActionDto dto, Guid userId)
    {
        var app = await _db.Applications.FirstOrDefaultAsync(a => a.Id == id && a.CandidateId == userId);
        if (app == null) return null;

        ApplicationStatus? newStatus = null;
        switch (dto.Action.ToUpperInvariant())
        {
            case "REJECTED": newStatus = ApplicationStatus.REJECTED; break;
            case "ACCEPTED": newStatus = ApplicationStatus.ACCEPTED; break;
            case "INTERVIEW": newStatus = ApplicationStatus.INTERVIEW; break;
            case "KEEP": break;
            default: throw new ArgumentException($"Invalid follow-up action '{dto.Action}'");
        }

        var oldStatus = app.Status;
        if (newStatus.HasValue && newStatus.Value != oldStatus)
        {
            app.Status = newStatus.Value;
            app.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
            await RecordHistoryAsync(id, oldStatus, newStatus.Value, userId.ToString(), "Resolved from follow-up reminder");
        }

        app.FollowUpStatus = FollowUpStatus.ACTIONED;
        app.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return MapToDtoWithHistory(await ReloadAsync(id), await BuildCompanyLookupAsync(userId));
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
        if (dto.Attachments != null)
            app.AttachmentsJson = dto.Attachments.Count > 0 ? JsonSerializer.Serialize(dto.Attachments) : null;
        // CV sent with this apply: optional. Guid.Empty clears it; otherwise the
        // version must be one of the user's CV versions (absent field = unchanged).
        if (dto.CvVersionId.HasValue)
        {
            if (dto.CvVersionId == Guid.Empty)
            {
                app.CvVersionId = null;
            }
            else
            {
                var owned = await _db.CvVersions.AnyAsync(v => v.Id == dto.CvVersionId.Value && v.Cv.UserId == userId);
                if (!owned) throw new ArgumentException("CV version not found");
                app.CvVersionId = dto.CvVersionId.Value;
            }
        }
        // Follow-up reminder: explicit clear flag wins; otherwise a provided date
        // schedules a pending reminder (absent fields = unchanged).
        if (dto.ClearFollowUp)
        {
            app.FollowUpDate = null;
            app.FollowUpStatus = FollowUpStatus.NONE;
        }
        else if (dto.FollowUpDate.HasValue)
        {
            app.FollowUpDate = dto.FollowUpDate.Value.Date;
            app.FollowUpStatus = FollowUpStatus.PENDING;
        }
        if (dto.ContactId.HasValue)
        {
            var contactOwned = await _db.Contacts.AnyAsync(c => c.Id == dto.ContactId.Value && c.UserId == userId);
            if (!contactOwned) throw new ArgumentException("Invalid contactId");
            app.ContactId = dto.ContactId.Value;
        }
        if (dto.RecipientName != null)
            app.RecipientName = string.IsNullOrWhiteSpace(dto.RecipientName) ? null : dto.RecipientName.Trim();
        if (dto.RecipientContact != null)
            app.RecipientContact = string.IsNullOrWhiteSpace(dto.RecipientContact) ? null : dto.RecipientContact.Trim();

        app.Fingerprint = FingerprintHelper.ComputeFor(app);
        app.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return MapToDtoWithHistory(await ReloadAsync(id), await BuildCompanyLookupAsync(userId));
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

        return MapToDtoWithHistory(await ReloadAsync(id), await BuildCompanyLookupAsync(userId));
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

    public async Task<List<CountryCountDto>> GetCountriesAsync(Guid userId)
    {
        var companies = await _db.Companies.AsNoTracking().Where(c => c.UserId == userId)
            .Select(c => new { Name = c.Name.Trim().ToLower(), c.Country }).ToListAsync();
        var names = await _db.Applications.AsNoTracking().Where(a => a.CandidateId == userId && !a.IsDeleted)
            .Select(a => a.CompanyName.Trim().ToLower()).ToListAsync();
        // Same match rule as Apps: exact name, else the longest company name that prefixes it.
        string? CountryOf(string n) =>
            companies.FirstOrDefault(c => c.Name == n)?.Country
            ?? companies.Where(c => n.StartsWith(c.Name + " ")).MaxBy(c => c.Name.Length)?.Country;
        return names.Select(CountryOf).Where(c => !string.IsNullOrWhiteSpace(c))
            .GroupBy(c => c!).Select(g => new CountryCountDto(g.Key, g.Count()))
            .OrderByDescending(c => c.Count).ToList();
    }

    public async Task<ApplicationStatisticsDto> GetStatisticsAsync(Guid userId)
    {
        var stats = await Apps
            .Where(a => a.CandidateId == userId && !a.IsDeleted)
            .GroupBy(a => a.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.Status, x => x.Count);

        return new ApplicationStatisticsDto(
            stats.Values.Sum(),
            stats.GetValueOrDefault(ApplicationStatus.SAVED, 0),
            stats.GetValueOrDefault(ApplicationStatus.APPLIED, 0),
            stats.GetValueOrDefault(ApplicationStatus.SCREENING, 0),
            stats.GetValueOrDefault(ApplicationStatus.ASSESSMENT, 0),
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
        var daily = await GetDailyTrendsAsync(userId);
        var avg = await GetAverageResponseTimeAsync(userId);

        var apps = Apps.Where(a => a.CandidateId == userId && !a.IsDeleted);

        var priorityCounts = await apps.GroupBy(a => a.Priority)
            .Select(g => new { Key = g.Key.ToString(), Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count);

        var originCounts = await apps.GroupBy(a => a.Origin)
            .Select(g => new { Key = g.Key.ToString(), Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count);

        var userApps = Apps.Where(a => a.CandidateId == userId && !a.IsDeleted);
        var channelCounts = await _db.ApplicationAttempts
            .Where(x => x.Status == AttemptStatus.SENT && userApps.Any(a => a.Id == x.ApplicationId))
            .GroupBy(x => x.Channel)
            .Select(g => new { Key = g.Key.ToString(), Count = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Count);

        var funnel = new List<FunnelStageDto>
        {
            new("SAVED", stats.Saved),
            new("APPLIED", stats.Applied),
            new("SCREENING", stats.Screening),
            new("ASSESSMENT", stats.Assessment),
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

var contactCoverage = await GetContactCoverageAsync(userId);
        var companyDistribution = await GetCompanyDistributionAsync(userId);
        var careerInventory = await GetCareerInventoryAsync(userId);
        var toolingUsage = await GetToolingUsageAsync(userId);
        var responseHistogram = await GetResponseTimeHistogramAsync(userId);

        return new AnalyticsSummaryDto(stats, avg, distinctCompanies, monthly, weekly, daily, priorityCounts, originCounts, channelCounts, funnel, topCompanies, email, cvPerformance, contactCoverage, companyDistribution, careerInventory, toolingUsage, responseHistogram);
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

        var raw = await Apps
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
                s.GetValueOrDefault(ApplicationStatus.ASSESSMENT, 0),
                s.GetValueOrDefault(ApplicationStatus.INTERVIEW, 0),
                s.GetValueOrDefault(ApplicationStatus.OFFER, 0),
                s.GetValueOrDefault(ApplicationStatus.ACCEPTED, 0),
                s.GetValueOrDefault(ApplicationStatus.REJECTED, 0),
                s.GetValueOrDefault(ApplicationStatus.WITHDRAWN, 0)
            );
        }).ToList();
    }

    private async Task<List<DailyTrendDto>> GetDailyTrendsAsync(Guid userId, int days = 30)
    {
        var cutoff = DateTime.UtcNow.AddDays(-days);

        var raw = await Apps
            .Where(a => a.CandidateId == userId && !a.IsDeleted && a.AppliedAt != null && a.AppliedAt >= cutoff)
            .GroupBy(a => new { a.AppliedAt!.Value.Date })
            .Select(g => new
            {
                Date = g.Key.Date,
                Status = g.GroupBy(a => a.Status)
                    .Select(sg => new { Status = sg.Key, Count = sg.Count() })
                    .ToList()
            })
            .OrderBy(x => x.Date)
            .ToListAsync();

        return raw.Select(r =>
        {
            var s = r.Status.ToDictionary(x => x.Status, x => x.Count);
            return new DailyTrendDto(
                r.Date,
                s.GetValueOrDefault(ApplicationStatus.SAVED, 0),
                s.GetValueOrDefault(ApplicationStatus.APPLIED, 0),
                s.GetValueOrDefault(ApplicationStatus.SCREENING, 0),
                s.GetValueOrDefault(ApplicationStatus.ASSESSMENT, 0),
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

        var raw = await Apps
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
                s.GetValueOrDefault(ApplicationStatus.ASSESSMENT, 0),
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

        var appsWithResponse = await Apps
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

    private async Task<ContactCoverageDto> GetContactCoverageAsync(Guid userId)
    {
        var contacts = await _db.Contacts
            .Where(c => c.UserId == userId)
            .ToListAsync();

        double Pct(int n) => contacts.Count == 0 ? 0 : Math.Round(n * 100.0 / contacts.Count, 1);
        var total = contacts.Count;
        var withEmail = contacts.Count(c => !string.IsNullOrWhiteSpace(c.Email));
        var withPhone = contacts.Count(c => !string.IsNullOrWhiteSpace(c.Phone));
        var withLinkedin = contacts.Count(c => !string.IsNullOrWhiteSpace(c.LinkedInUrl));
        var withMobile = contacts.Count(c => !string.IsNullOrWhiteSpace(c.Mobile));
        var withFax = contacts.Count(c => !string.IsNullOrWhiteSpace(c.Fax));

        return new ContactCoverageDto(
            total, withEmail, withPhone, withLinkedin, withMobile, withFax,
            Pct(withEmail), Pct(withPhone), Pct(withLinkedin), Pct(withMobile), Pct(withFax));
    }

    private async Task<CompanyDistributionDto> GetCompanyDistributionAsync(Guid userId)
    {
        var companies = await _db.Companies
            .Where(c => c.UserId == userId)
            .ToListAsync();

        Dictionary<string, int> Counts(IEnumerable<string?> values) => values
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .GroupBy(v => v!.Trim())
            .ToDictionary(g => g.Key, g => g.Count());

        return new CompanyDistributionDto(
            companies.Count,
            companies.Count(c => !string.IsNullOrWhiteSpace(c.WebsiteUrl)),
            companies.Count(c => !string.IsNullOrWhiteSpace(c.Country)),
            Counts(companies.Select(c => c.Location)),
            Counts(companies.Select(c => c.Country)),
            Counts(companies.Select(c => c.Sector)),
            companies
                .Where(c => !string.IsNullOrWhiteSpace(c.Country))
                .GroupBy(c => c.Country.Trim())
                .Select(g => new CountryLocationDto(
                    g.Key,
                    g.Count(),
                    Counts(g.Select(c => c.Location)),
                    g.Count(c => string.IsNullOrWhiteSpace(c.Location))))
                .OrderByDescending(l => l.Count)
                .ToList());
    }

    private async Task<CareerInventoryDto> GetCareerInventoryAsync(Guid userId)
    {
        var career = new
        {
            Experiences = await _db.Experiences.CountAsync(e => e.UserId == userId),
            Projects = await _db.Projects.CountAsync(p => p.UserId == userId),
            Skills = await _db.Skills.CountAsync(s => s.UserId == userId),
            Educations = await _db.Educations.CountAsync(e => e.UserId == userId),
            Certifications = await _db.Certifications.CountAsync(c => c.UserId == userId),
            Hackathons = await _db.Hackathons.CountAsync(h => h.UserId == userId),
            Languages = await _db.Languages.CountAsync(l => l.UserId == userId),
            Interests = await _db.Interests.CountAsync(i => i.UserId == userId),
            AcademicActivities = await _db.AcademicActivities.CountAsync(a => a.UserId == userId),
            DistinctTags = await _db.EntityCategoryTags
                .Where(t => t.UserId == userId)
                .Select(t => t.CategoryNodeId)
                .Distinct()
                .CountAsync(),
        };

        return new CareerInventoryDto(
            career.Experiences, career.Projects, career.Skills, career.Educations,
            career.Certifications, career.Hackathons, career.Languages, career.Interests,
            career.AcademicActivities, career.DistinctTags);
    }

    private async Task<ToolingUsageDto> GetToolingUsageAsync(Guid userId)
    {
        var cvIds = await _db.Cvs.Where(c => c.UserId == userId).Select(c => c.Id).ToListAsync();
        var coverLetterIds = await _db.CoverLetters.Where(c => c.UserId == userId).Select(c => c.Id).ToListAsync();

        return new ToolingUsageDto(
            await _db.JobExtractions.CountAsync(j => j.UserId == userId),
            await _db.TemplateRenderRuns.CountAsync(r => r.UserId == userId),
            await _db.CvGenerationRuns.CountAsync(r => r.UserId == userId),
            await _db.SavedToolContent.CountAsync(s => s.UserId == userId),
            cvIds.Count,
            await _db.CvVersions.CountAsync(v => cvIds.Contains(v.CvId)),
            await _db.CvTemplates.CountAsync(),
            coverLetterIds.Count,
            await _db.CoverLetterVersions.CountAsync(v => coverLetterIds.Contains(v.CoverLetterId)),
            await _db.UserImages.CountAsync(i => i.UserId == userId),
            await _db.EmailSchedules.CountAsync(s => s.UserId == userId && s.IsActive),
            await _db.EmailSchedules.CountAsync(s => s.UserId == userId));
    }

    private async Task<List<ResponseTimeBucketDto>> GetResponseTimeHistogramAsync(Guid userId)
    {
        var initialStatuses = new[] { ApplicationStatus.APPLIED, ApplicationStatus.SAVED };

        var apps = await Apps
            .Include(a => a.StatusHistory)
            .Where(a => a.CandidateId == userId
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

        var buckets = new[] { "<1d", "1-3d", "3-7d", "7-14d", "14-30d", "30d+" };

        return buckets
            .Select((b, i) =>
            {
                var (lo, hi) = i switch
                {
                    0 => (0d, 1d),
                    1 => (1d, 3d),
                    2 => (3d, 7d),
                    3 => (7d, 14d),
                    4 => (14d, 30d),
                    _ => (30d, double.MaxValue),
                };

                var count = apps.Count(a =>
                {
                    var days = (a.FirstResponse - a.AppliedAt!.Value).TotalDays;
                    return days >= lo && days < hi;
                });

                return new ResponseTimeBucketDto(b, count);
            })
            .ToList();
    }

    // ── Feed & calendar ────────────────────────────────────────────────────────

    public async Task<ActivityFeedDto> GetActivityFeedAsync(Guid userId, int limit = 50)
    {
        var scoped = Apps;
        var query = _db.ApplicationStatusHistories
            .Include(h => h.Application)
            .Where(h => h.Application != null && h.Application.CandidateId == userId && scoped.Any(a => a.Id == h.ApplicationId));

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
            var appliedEvents = await Apps
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

        // Pending follow-up reminders: surface on their deadline date, and clamp
        // overdue ones (deadline passed before the viewed range) to the range start.
        var followUpRaw = await Apps
            .Where(a => a.CandidateId == userId
                && a.FollowUpStatus == FollowUpStatus.PENDING
                && a.FollowUpDate != null)
            .Select(a => new CalendarEventDto(
                a.FollowUpDate!.Value.ToLocalTime().ToString("yyyy-MM-dd"),
                "follow-up",
                "No reply from " + a.CompanyName,
                a.Id,
                a.CompanyName,
                a.PositionTitle
            ))
            .ToListAsync();

        var fromDateLocal = from.ToLocalTime().Date;
        var toDateLocal = to.ToLocalTime().Date;
        var followUpEvents = followUpRaw
            .Select(e => DateTime.TryParse(e.Date, out var d) && d.Date < fromDateLocal
                ? e with { Date = fromDateLocal.ToString("yyyy-MM-dd") }
                : e)
            .Where(e => DateTime.TryParse(e.Date, out var d) && d.Date >= fromDateLocal && d.Date <= toDateLocal)
            .ToList();

        events.AddRange(followUpEvents);

        var scopedApps = Apps;
        var statusEvents = await _db.ApplicationStatusHistories
            .Include(h => h.Application)
            .Where(h => scopedApps.Any(a => a.Id == h.ApplicationId) && h.Application != null
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
        await HydrateAttemptCoverLettersAsync(attempts);

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

        var coverLetterVersion = await ResolveCoverLetterVersionAsync(dto.CoverLetterVersionId, userId);

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
            CoverLetterVersionId = coverLetterVersion?.Id,
            SentAt = status == AttemptStatus.SENT ? dto.SentAt ?? DateTime.UtcNow : dto.SentAt,
            FailureReason = dto.FailureReason
        };

        _db.ApplicationAttempts.Add(attempt);
        await _db.SaveChangesAsync();

        attempt.Contact = contact;
        attempt.CoverLetterTitle = coverLetterVersion?.CoverLetter.Title;

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
        if (dto.CoverLetterVersionId.HasValue)
            attempt.CoverLetterVersionId = (await ResolveCoverLetterVersionAsync(dto.CoverLetterVersionId.Value, userId))!.Id;
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
        await HydrateAttemptCoverLettersAsync(new List<ApplicationAttempt> { attempt });

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

        var companies = await BuildCompanyLookupAsync(userId);
        return apps.Select(a => MapToDtoWithHistory(a, companies)).ToList();
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

        var companies = await BuildCompanyLookupAsync(userId);
        return apps.Select(a => MapToDtoWithHistory(a, companies)).ToList();
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

    private IQueryable<Application> BuildFilteredQuery(Guid userId, string[]? statuses, string[]? priorities, string? search, DateTime? appliedFrom, DateTime? appliedTo, DateTime? updatedFrom, DateTime? updatedTo)
    {
        var query = Apps.Where(a => a.CandidateId == userId && !a.IsDeleted);

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

        if (priorities is { Length: > 0 })
        {
            var parsed = priorities
                .Select(p => Enum.TryParse<ApplicationPriority>(p, true, out var pr) ? pr : (ApplicationPriority?)null)
                .Where(p => p.HasValue)
                .Select(p => p!.Value)
                .ToList();
            if (parsed.Count > 0)
                query = query.Where(a => parsed.Contains(a.Priority));
        }

        if (!string.IsNullOrWhiteSpace(search))
            query = query.Where(a =>
                EF.Functions.ILike(a.CompanyName, $"%{search}%") ||
                EF.Functions.ILike(a.PositionTitle, $"%{search}%"));

        // Query-string dates bind as Kind=Unspecified; Npgsql only accepts UTC for timestamptz.
        static DateTime Day(DateTime d) => DateTime.SpecifyKind(d.Date, DateTimeKind.Utc);
        if (appliedFrom.HasValue)
        {
            var from = Day(appliedFrom.Value);
            query = query.Where(a => a.AppliedAt != null && a.AppliedAt >= from);
        }
        if (appliedTo.HasValue)
        {
            var to = Day(appliedTo.Value).AddDays(1);
            query = query.Where(a => a.AppliedAt != null && a.AppliedAt < to);
        }

        if (updatedFrom.HasValue)
        {
            var from = Day(updatedFrom.Value);
            query = query.Where(a => a.UpdatedAt >= from);
        }
        if (updatedTo.HasValue)
        {
            var to = Day(updatedTo.Value).AddDays(1);
            query = query.Where(a => a.UpdatedAt < to);
        }

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

    private async Task HydrateAttemptCoverLettersAsync(List<ApplicationAttempt> attempts)
    {
        var ids = attempts.Where(t => t.CoverLetterVersionId.HasValue).Select(t => t.CoverLetterVersionId!.Value).Distinct().ToList();
        if (ids.Count == 0) return;

        var versions = await _db.CoverLetterVersions.AsNoTracking()
            .Where(v => ids.Contains(v.Id))
            .Include(v => v.CoverLetter)
            .ToListAsync();
        var map = versions.ToDictionary(v => v.Id);

        foreach (var t in attempts)
            if (t.CoverLetterVersionId.HasValue && map.TryGetValue(t.CoverLetterVersionId.Value, out var v))
                t.CoverLetterTitle = v.CoverLetter.Title;
    }

    /// <summary>Validates a cover letter version belongs to the user; null when none supplied.</summary>
    private async Task<CoverLetterVersion?> ResolveCoverLetterVersionAsync(Guid? versionId, Guid userId)
    {
        if (versionId is not { } id) return null;
        var version = await _db.CoverLetterVersions.AsNoTracking()
            .Include(v => v.CoverLetter)
            .FirstOrDefaultAsync(v => v.Id == id && v.CoverLetter.UserId == userId);
        if (version == null)
            throw new ArgumentException("Invalid cover letter version");
        return version;
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

    /// <summary>
    /// The user's companies keyed by normalized name, so application DTOs can carry
    /// the matched CompanyId + LogoUrl (same name-join rule the UI/controllers use).
    /// </summary>
    private async Task<Dictionary<string, (Guid? Id, string? LogoUrl)>> BuildCompanyLookupAsync(Guid userId)
    {
        var companies = await _db.Companies.AsNoTracking()
            .Where(c => c.UserId == userId)
            .Select(c => new { c.Name, c.Id, c.LogoUrl })
            .ToListAsync();

        var map = new Dictionary<string, (Guid?, string?)>(StringComparer.Ordinal);
        foreach (var c in companies)
        {
            if (string.IsNullOrWhiteSpace(c.Name)) continue;
            map[c.Name.Trim().ToLower()] = (c.Id, c.LogoUrl);
        }
        return map;
    }

    private ApplicationResponseDto MapToDto(Application a, IReadOnlyDictionary<string, (Guid? Id, string? LogoUrl)> companies)
    {
        var company = a.CompanyName is { Length: > 0 } n ? companies.GetValueOrDefault(n.Trim().ToLower(), (null, null)) : (null, null);
        return new(
            a.Id, a.CandidateId, a.CvVersionId, a.JobOfferId,
            a.CompanyName, company.Id, company.LogoUrl, a.PositionTitle, a.OfferSource,
            a.Status.ToString(), a.AppliedAt, a.UpdatedAt, a.Notes, a.Origin.ToString(),
            a.InternshipType, a.Priority.ToString(),
            LinkedEmailMessageId: a.LinkedEmailMessageId,
            ContactId: a.ContactId,
            RecipientName: a.RecipientName,
            RecipientContact: a.RecipientContact,
            Attachments: DeserializeAttachments(a),
            FollowUpDate: a.FollowUpDate,
            FollowUpStatus: a.FollowUpStatus.ToString()
        );
    }

    private ApplicationResponseDto MapToDtoWithHistory(Application a, IReadOnlyDictionary<string, (Guid? Id, string? LogoUrl)> companies)
    {
        var company = a.CompanyName is { Length: > 0 } n ? companies.GetValueOrDefault(n.Trim().ToLower(), (null, null)) : (null, null);
        return new(
            a.Id, a.CandidateId, a.CvVersionId, a.JobOfferId,
            a.CompanyName, company.Id, company.LogoUrl, a.PositionTitle, a.OfferSource,
            a.Status.ToString(), a.AppliedAt, a.UpdatedAt, a.Notes, a.Origin.ToString(),
            a.InternshipType, a.Priority.ToString(),
            a.StatusHistory?.Select(h => new StatusHistoryDto(
                h.Id, h.OldStatus?.ToString(), h.NewStatus.ToString(),
                h.ChangedAt, h.ChangedBy, h.Comment
            )).ToList(),
            a.Attempts?.Select(MapAttemptToDto).ToList(),
            LinkedEmailMessageId: a.LinkedEmailMessageId,
            ContactId: a.ContactId,
            RecipientName: a.RecipientName,
            RecipientContact: a.RecipientContact,
            Attachments: DeserializeAttachments(a),
            FollowUpDate: a.FollowUpDate,
            FollowUpStatus: a.FollowUpStatus.ToString()
        );
    }

    private static List<ScheduleAttachmentRef>? DeserializeAttachments(Application a)
    {
        if (string.IsNullOrWhiteSpace(a.AttachmentsJson)) return null;
        try { return JsonSerializer.Deserialize<List<ScheduleAttachmentRef>>(a.AttachmentsJson); }
        catch { return null; }
    }

    /// <summary>Statuses that satisfy a pending follow-up reminder (a reply was received or the case is closed).</summary>
    private static bool FollowUpStatusResolvedBy(ApplicationStatus status) =>
        status is ApplicationStatus.INTERVIEW or ApplicationStatus.OFFER or ApplicationStatus.ACCEPTED
            or ApplicationStatus.REJECTED or ApplicationStatus.WITHDRAWN;

    /// <summary>Fetches a single attachment ref (ownership-checked by application).
    /// The MinIO object itself must still be guarded by the caller.</summary>
    public async Task<ScheduleAttachmentRef?> GetAttachmentAsync(Guid applicationId, int index, Guid userId)
    {
        var app = await EnsureOwnedAsync(applicationId, userId);
        var attachments = DeserializeAttachments(app);
        if (attachments is null || index < 0 || index >= attachments.Count) return null;
        return attachments[index];
    }

    /// <summary>Removes an attachment by index and persists the trimmed list.</summary>
    public async Task<ApplicationResponseDto?> RemoveAttachmentAsync(Guid applicationId, int index, Guid userId)
    {
        var app = await _db.Applications.FirstOrDefaultAsync(a => a.Id == applicationId && a.CandidateId == userId);
        if (app == null) return null;

        var attachments = DeserializeAttachments(app) ?? new List<ScheduleAttachmentRef>();
        if (index < 0 || index >= attachments.Count) return null;

        attachments.RemoveAt(index);
        app.AttachmentsJson = attachments.Count > 0 ? JsonSerializer.Serialize(attachments) : null;
        app.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        return MapToDtoWithHistory(await ReloadAsync(applicationId), await BuildCompanyLookupAsync(userId));
    }

    private static AttemptResponseDto MapAttemptToDto(ApplicationAttempt t) => new(
        t.Id, t.ApplicationId, t.AttemptNumber,
        t.Channel.ToString(), t.InitiatedBy.ToString(), t.Status.ToString(),
        t.Subject, t.Body, t.RecipientName, t.RecipientContact,
        t.ContactId,
        t.Contact is null ? null : new ContactSummaryDto(
            t.Contact.Id, t.Contact.Name, t.Contact.Email,
            t.Contact.Company, t.Contact.Position, t.Contact.IsFavorite),
        t.ChannelMetadataJson, t.CvVersionId, t.CoverLetterVersionId, t.CoverLetterTitle,
        t.SentAt, t.FailureReason, t.CreatedAt, t.UpdatedAt
    );
}
