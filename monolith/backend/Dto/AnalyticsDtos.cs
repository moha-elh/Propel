namespace CV_Generator.Dto;

/// <summary>Rich, single-call analytics payload powering the rewritten Analytics page.</summary>
public record AnalyticsSummaryDto(
    ApplicationStatisticsDto Statistics,
    double? AverageResponseTimeDays,
    int DistinctCompanies,
    List<MonthlyTrendDto> MonthlyTrends,
    List<WeeklyTrendDto> WeeklyTrends,
    List<DailyTrendDto> DailyTrends,
    Dictionary<string, int> PriorityCounts,
    Dictionary<string, int> OriginCounts,
    Dictionary<string, int> ChannelCounts,
    List<TopCompanyDto> TopCompanies,
    List<CvPerformanceDto> CvPerformance,
    ContactCoverageDto ContactCoverage,
    CompanyDistributionDto CompanyDistribution,
    List<ResponseTimeBucketDto> ResponseTimeHistogram
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
    int Assessment,
    int Interview,
    int Offer,
    int Accepted,
    int Rejected,
    int Withdrawn
);

public record TopCompanyDto(string Name, int Count, DateTime? LastAppliedAt);

public record ContactCoverageDto(
    int Total,
    int WithEmail,
    int WithPhone,
    int WithLinkedin,
    int WithMobile,
    int WithFax,
    double EmailPct,
    double PhonePct,
    double LinkedinPct,
    double MobilePct,
    double FaxPct
);

public record CompanyDistributionDto(
    int Total,
    int WithWebsite,
    int WithCountry,
    Dictionary<string, int> CityCounts,
    Dictionary<string, int> CountryCounts,
    Dictionary<string, int> SectorCounts,
    List<CountryLocationDto> Locations
);

/// <summary>Companies in one country, with their city breakdown.</summary>
public record CountryLocationDto(string Country, int Count, Dictionary<string, int> Cities, int WithoutCity);

public record ResponseTimeBucketDto(string Bucket, int Count);
