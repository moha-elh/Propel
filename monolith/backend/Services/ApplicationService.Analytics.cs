using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using CV_Generator.Data;
using CV_Generator.Dto;
using CV_Generator.Models;

namespace CV_Generator.Services;

/// <summary>Read-side of applications: statistics, analytics, activity feed and calendar.</summary>
public partial class ApplicationService
{
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

        var contactCoverage = await GetContactCoverageAsync(userId);
        var companyDistribution = await GetCompanyDistributionAsync(userId);
        var responseHistogram = await GetResponseTimeHistogramAsync(userId);

        return new AnalyticsSummaryDto(stats, avg, distinctCompanies, monthly, weekly, daily, priorityCounts, originCounts, channelCounts, topCompanies, cvPerformance, contactCoverage, companyDistribution, responseHistogram);
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
        // SCREENING ("Seen") and WITHDRAWN are not a reply from the company.
        var initialStatuses = new[] { ApplicationStatus.APPLIED, ApplicationStatus.SAVED, ApplicationStatus.SCREENING, ApplicationStatus.WITHDRAWN };

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

    private async Task<List<ResponseTimeBucketDto>> GetResponseTimeHistogramAsync(Guid userId)
    {
        // SCREENING ("Seen") and WITHDRAWN are not a reply from the company.
        var initialStatuses = new[] { ApplicationStatus.APPLIED, ApplicationStatus.SAVED, ApplicationStatus.SCREENING, ApplicationStatus.WITHDRAWN };

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
}
