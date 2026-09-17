namespace CV_Generator.Dto;

/// <summary>Rich, single-call analytics payload powering the rewritten Analytics page.</summary>
public record AnalyticsSummaryDto(
    ApplicationStatisticsDto Statistics,
    double? AverageResponseTimeDays,
    int DistinctCompanies,
    List<MonthlyTrendDto> MonthlyTrends,
    List<WeeklyTrendDto> WeeklyTrends,
    Dictionary<string, int> PriorityCounts,
    Dictionary<string, int> OriginCounts,
    Dictionary<string, int> ChannelCounts,
    List<FunnelStageDto> Funnel,
    List<TopCompanyDto> TopCompanies,
    EmailStatsDto Email,
    List<CvPerformanceDto> CvPerformance
);

/// <summary>Per-CV-version send + conversion rollup for the CV performance card.</summary>
public record CvPerformanceDto(
    string CvTitle,
    int VersionNumber,
    string? VersionLabel,
    Guid VersionId,
    string[] Tags,
    int SentCount,
    int LinkedApplications,
    int InterviewCount,
    int OfferCount
);

/// <summary>Applications applied in a given ISO week, bucketed by current status.</summary>
public record WeeklyTrendDto(
    int Year,
    int Week,
    int Saved,
    int Applied,
    int Screening,
    int Interview,
    int Offer,
    int Accepted,
    int Rejected,
    int Withdrawn
);

public record FunnelStageDto(string Stage, int Count);

public record TopCompanyDto(string Name, int Count, DateTime? LastAppliedAt);

public record EmailStatsDto(int EmailsSent, int EmailsFailed, double SuccessRate, int ActiveSchedules);
