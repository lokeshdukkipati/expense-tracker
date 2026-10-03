using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Analytics;

public interface IAnalyticsService
{
    /// <summary>Totals, savings rate, extremes and a comparison with the previous period of equal length.</summary>
    Task<SummaryDto> GetSummaryAsync(AnalyticsFilter filter, CancellationToken cancellationToken);

    /// <summary>Category shares. Without <paramref name="parentId"/> subcategories roll up; with it, that parent is drilled into.</summary>
    Task<CategoryBreakdownDto> GetCategoryBreakdownAsync(AnalyticsFilter filter, TransactionType type, Guid? parentId, CancellationToken cancellationToken);

    /// <summary>Gap-free income/expense series. Use Day for a calendar heatmap.</summary>
    Task<IReadOnlyList<TrendPointDto>> GetTrendAsync(AnalyticsFilter filter, TrendGranularity granularity, CancellationToken cancellationToken);

    /// <summary>Spending by weekday and hour of day.</summary>
    Task<PatternsDto> GetPatternsAsync(AnalyticsFilter filter, CancellationToken cancellationToken);

    Task<IReadOnlyList<TopDescriptionDto>> GetTopDescriptionsAsync(AnalyticsFilter filter, TransactionType type, int limit, CancellationToken cancellationToken);

    /// <summary>Subscriptions and regular payments detected over the last 24 months.</summary>
    Task<IReadOnlyList<RecurringExpenseDto>> GetRecurringAsync(string? timeZone, CancellationToken cancellationToken);

    /// <summary>Unusually large expenses compared with the category's own history.</summary>
    Task<IReadOnlyList<AnomalyDto>> GetAnomaliesAsync(AnalyticsFilter filter, CancellationToken cancellationToken);

    /// <summary>Month-end projection plus the next three months.</summary>
    Task<ForecastDto> GetForecastAsync(string? timeZone, CancellationToken cancellationToken);

    /// <summary>Expense by category: this period versus the previous period of equal length.</summary>
    Task<IReadOnlyList<CategoryComparisonDto>> GetCategoryComparisonAsync(AnalyticsFilter filter, CancellationToken cancellationToken);

    Task<IReadOnlyList<TagStatDto>> GetTagStatsAsync(AnalyticsFilter filter, CancellationToken cancellationToken);
}
