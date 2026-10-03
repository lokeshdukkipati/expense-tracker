using ExpenseTracker.Application.Analytics;
using ExpenseTracker.Domain.Enums;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseTracker.Api.Controllers;

/// <summary>
/// Every endpoint accepts the same scope: from, to (inclusive dates), accountId, categoryId and timeZone (IANA id).
/// With no dates the current month is used.
/// </summary>
[ApiController]
[Route("api/v1/analytics")]
[Produces("application/json")]
public sealed class AnalyticsController(IAnalyticsService analytics) : ControllerBase
{
    [HttpGet("summary")]
    public async Task<ActionResult<SummaryDto>> Summary([FromQuery] AnalyticsFilter filter, CancellationToken cancellationToken) =>
        Ok(await analytics.GetSummaryAsync(filter, cancellationToken));

    [HttpGet("categories")]
    public async Task<ActionResult<CategoryBreakdownDto>> Categories(
        [FromQuery] AnalyticsFilter filter,
        [FromQuery] TransactionType type = TransactionType.Expense,
        [FromQuery] Guid? parentId = null,
        CancellationToken cancellationToken = default) =>
        Ok(await analytics.GetCategoryBreakdownAsync(filter, type, parentId, cancellationToken));

    [HttpGet("category-comparison")]
    public async Task<ActionResult<IReadOnlyList<CategoryComparisonDto>>> CategoryComparison(
        [FromQuery] AnalyticsFilter filter, CancellationToken cancellationToken) =>
        Ok(await analytics.GetCategoryComparisonAsync(filter, cancellationToken));

    /// <summary>Income/expense series. granularity: Day, Week, Month (default), Quarter, Year. Day powers a calendar heatmap.</summary>
    [HttpGet("trend")]
    public async Task<ActionResult<IReadOnlyList<TrendPointDto>>> Trend(
        [FromQuery] AnalyticsFilter filter,
        [FromQuery] TrendGranularity granularity = TrendGranularity.Month,
        CancellationToken cancellationToken = default) =>
        Ok(await analytics.GetTrendAsync(filter, granularity, cancellationToken));

    [HttpGet("patterns")]
    public async Task<ActionResult<PatternsDto>> Patterns([FromQuery] AnalyticsFilter filter, CancellationToken cancellationToken) =>
        Ok(await analytics.GetPatternsAsync(filter, cancellationToken));

    [HttpGet("top-descriptions")]
    public async Task<ActionResult<IReadOnlyList<TopDescriptionDto>>> TopDescriptions(
        [FromQuery] AnalyticsFilter filter,
        [FromQuery] TransactionType type = TransactionType.Expense,
        [FromQuery] int limit = 10,
        CancellationToken cancellationToken = default) =>
        Ok(await analytics.GetTopDescriptionsAsync(filter, type, limit, cancellationToken));

    [HttpGet("recurring")]
    public async Task<ActionResult<IReadOnlyList<RecurringExpenseDto>>> Recurring(
        [FromQuery] string? timeZone, CancellationToken cancellationToken) =>
        Ok(await analytics.GetRecurringAsync(timeZone, cancellationToken));

    [HttpGet("anomalies")]
    public async Task<ActionResult<IReadOnlyList<AnomalyDto>>> Anomalies([FromQuery] AnalyticsFilter filter, CancellationToken cancellationToken) =>
        Ok(await analytics.GetAnomaliesAsync(filter, cancellationToken));

    [HttpGet("forecast")]
    public async Task<ActionResult<ForecastDto>> Forecast([FromQuery] string? timeZone, CancellationToken cancellationToken) =>
        Ok(await analytics.GetForecastAsync(timeZone, cancellationToken));

    [HttpGet("tags")]
    public async Task<ActionResult<IReadOnlyList<TagStatDto>>> Tags([FromQuery] AnalyticsFilter filter, CancellationToken cancellationToken) =>
        Ok(await analytics.GetTagStatsAsync(filter, cancellationToken));
}
