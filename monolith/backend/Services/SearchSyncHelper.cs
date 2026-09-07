namespace CV_Generator.Services;

public static class SearchSyncHelper
{
    private static readonly Dictionary<string, string> ScopeMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Project"] = "projects",
        ["Experience"] = "experiences",
        ["Education"] = "educations",
        ["Certification"] = "certifications",
        ["Skill"] = "skills",
        ["Language"] = "languages",
        ["Hackathon"] = "hackathons",
        ["Interest"] = "interests",
        ["AcademicActivity"] = "academicactivities",
    };

    public static void TriggerSync(IServiceScopeFactory scopeFactory, Guid userId, ILogger logger, string source, Guid entityId = default)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var syncService = scope.ServiceProvider.GetRequiredService<ISearchSyncService>();
                await syncService.SyncUserAsync(userId);
                logger.LogDebug("Search sync completed for user {UserId} after {Source}", userId, source);

                // Hybrid category tagging (LLM + keyword), preserving any manual tags.
                // Skipped on CREATE: the auto-categorizer was over-tagging unrelated facets
                // (new extraction-derived project). Categories are set via the form instead.
                if (entityId != default &&
                    !source.EndsWith(".Create", StringComparison.Ordinal) &&
                    ScopeMap.TryGetValue(source.Split('.')[0], out var scopeName))
                {
                    try
                    {
                        var categoryService = scope.ServiceProvider.GetRequiredService<ICategoryService>();
                        await categoryService.CategorizeEntityAsync(userId, scopeName, entityId);
                    }
                    catch (Exception ex)
                    {
                        logger.LogWarning(ex, "Category tagging skipped for user {UserId} entity {Scope}/{EntityId}", userId, scopeName, entityId);
                    }
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Search sync failed for user {UserId} after {Source}", userId, source);
            }
        });
    }
}
