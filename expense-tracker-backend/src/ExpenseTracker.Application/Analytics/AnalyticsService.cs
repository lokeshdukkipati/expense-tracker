using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Application.Common;
using ExpenseTracker.Domain.Entities;
using ExpenseTracker.Domain.Enums;
using ExpenseTracker.Domain.Exceptions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Analytics;

/// <summary>
/// Aggregates that are time-zone independent (totals, category shares, top descriptions) run in PostgreSQL.
/// Anything bucketed by local calendar time (trends, weekday/hour patterns, forecasts) loads a slim projection
/// and buckets it in memory in the caller's time zone, which is the only way to get day boundaries right.
/// </summary>
public sealed class AnalyticsService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TimeProvider clock,
    IValidator<AnalyticsFilter> validator) : IAnalyticsService
{
    private const int MaxTrendPoints = 3_700;
    private const int RecurringLookbackMonths = 24;
    private const int AnomalyBaselineMonths = 12;
    private const int AnomalyMinSamples = 10;
    private const int MaxAnomalies = 20;

    private sealed record Scope(
        Guid UserId, TimeZoneInfo Zone, DateOnly From, DateOnly To, DateOnly Today,
        DateTimeOffset StartUtc, DateTimeOffset EndUtc);

    private sealed class Bucket
    {
        public decimal Income { get; set; }
        public decimal Expense { get; set; }
        public int Count { get; set; }
    }

    // ------------------------------------------------------------------ summary

    public async Task<SummaryDto> GetSummaryAsync(AnalyticsFilter filter, CancellationToken cancellationToken)
    {
        var scope = await BuildScopeAsync(filter, cancellationToken);

        var current = await TotalsAsync(Query(scope, filter, scope.StartUtc, scope.EndUtc), cancellationToken);

        var days = scope.To.DayNumber - scope.From.DayNumber + 1;
        var previousTo = scope.From.AddDays(-1);
        var previousFrom = previousTo.AddDays(-(days - 1));
        var previousQuery = Query(scope, filter,
            TimeZones.StartOfDayUtc(previousFrom, scope.Zone),
            TimeZones.StartOfDayUtc(previousTo.AddDays(1), scope.Zone));
        var previous = await TotalsAsync(previousQuery, cancellationToken);

        var largestExpense = await Brief(Query(scope, filter, scope.StartUtc, scope.EndUtc)
                .Where(t => t.Type == TransactionType.Expense).OrderByDescending(t => t.Amount))
            .FirstOrDefaultAsync(cancellationToken);

        var largestIncome = await Brief(Query(scope, filter, scope.StartUtc, scope.EndUtc)
                .Where(t => t.Type == TransactionType.Income).OrderByDescending(t => t.Amount))
            .FirstOrDefaultAsync(cancellationToken);

        // A range that ends in the future should not dilute the daily average with days that have not happened.
        var effectiveTo = scope.To > scope.Today ? scope.Today : scope.To;
        var elapsedDays = Math.Max(1, effectiveTo.DayNumber - scope.From.DayNumber + 1);

        var net = current.Income - current.Expense;
        decimal? savingsRate = current.Income > 0 ? Math.Round(net / current.Income * 100m, 2) : null;

        return new SummaryDto(
            From: scope.From,
            To: scope.To,
            Income: current.Income,
            Expense: current.Expense,
            Net: net,
            SavingsRatePercent: savingsRate,
            TransactionCount: current.Count,
            AverageDailyExpense: Math.Round(current.Expense / elapsedDays, 2),
            LargestExpense: largestExpense,
            LargestIncome: largestIncome,
            Previous: new PeriodTotalsDto(previousFrom, previousTo, previous.Income, previous.Expense, previous.Income - previous.Expense),
            ExpenseChangePercent: StatisticsHelper.PercentChange(current.Expense, previous.Expense),
            IncomeChangePercent: StatisticsHelper.PercentChange(current.Income, previous.Income));
    }

    // ------------------------------------------------------------------ categories

    public async Task<CategoryBreakdownDto> GetCategoryBreakdownAsync(
        AnalyticsFilter filter, TransactionType type, Guid? parentId, CancellationToken cancellationToken)
    {
        var scope = await BuildScopeAsync(filter, cancellationToken);
        var query = Query(scope, filter, scope.StartUtc, scope.EndUtc).Where(t => t.Type == type);

        List<(Guid Id, decimal Amount, int Count)> groups;
        if (parentId is { } pid)
        {
            var rows = await query
                .Where(t => t.CategoryId == pid || t.Category.ParentId == pid)
                .GroupBy(t => t.CategoryId)
                .Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount), Count = g.Count() })
                .ToListAsync(cancellationToken);
            groups = rows.Select(r => (r.Id, r.Amount, r.Count)).ToList();
        }
        else
        {
            var rows = await query
                .GroupBy(t => t.Category.ParentId ?? t.Category.Id)
                .Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount), Count = g.Count() })
                .ToListAsync(cancellationToken);
            groups = rows.Select(r => (r.Id, r.Amount, r.Count)).ToList();
        }

        var items = await ToCategoryAmountsAsync(groups, parentId, cancellationToken);
        return new CategoryBreakdownDto(type, groups.Sum(g => g.Amount), items);
    }

    public async Task<IReadOnlyList<CategoryComparisonDto>> GetCategoryComparisonAsync(
        AnalyticsFilter filter, CancellationToken cancellationToken)
    {
        var scope = await BuildScopeAsync(filter, cancellationToken);

        var days = scope.To.DayNumber - scope.From.DayNumber + 1;
        var previousTo = scope.From.AddDays(-1);
        var previousFrom = previousTo.AddDays(-(days - 1));

        var current = await RootTotalsAsync(Query(scope, filter, scope.StartUtc, scope.EndUtc), cancellationToken);
        var previous = await RootTotalsAsync(
            Query(scope, filter,
                TimeZones.StartOfDayUtc(previousFrom, scope.Zone),
                TimeZones.StartOfDayUtc(previousTo.AddDays(1), scope.Zone)),
            cancellationToken);

        var ids = current.Keys.Union(previous.Keys).ToList();
        var categories = await db.Categories.AsNoTracking()
            .Where(c => ids.Contains(c.Id))
            .Select(c => new { c.Id, c.Name, c.Color })
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        return ids
            .Where(categories.ContainsKey)
            .Select(id =>
            {
                var now = current.GetValueOrDefault(id);
                var before = previous.GetValueOrDefault(id);
                var info = categories[id];
                return new CategoryComparisonDto(id, info.Name, info.Color, now, before, now - before,
                    StatisticsHelper.PercentChange(now, before));
            })
            .OrderByDescending(c => Math.Abs(c.Change))
            .Take(15)
            .ToList();
    }

    // ------------------------------------------------------------------ trend & patterns

    public async Task<IReadOnlyList<TrendPointDto>> GetTrendAsync(
        AnalyticsFilter filter, TrendGranularity granularity, CancellationToken cancellationToken)
    {
        var scope = await BuildScopeAsync(filter, cancellationToken);

        var points = new List<DateOnly>();
        for (var cursor = BucketStart(scope.From, granularity); cursor <= scope.To; cursor = NextBucket(cursor, granularity))
        {
            points.Add(cursor);
            if (points.Count > MaxTrendPoints)
            {
                throw new BusinessRuleException(
                    "That range has too many data points. Choose a coarser granularity or a shorter range.", "too_many_points");
            }
        }

        var rows = await Query(scope, filter, scope.StartUtc, scope.EndUtc)
            .Select(t => new { t.OccurredAt, t.Type, t.Amount })
            .ToListAsync(cancellationToken);

        var buckets = points.ToDictionary(p => p, _ => new Bucket());
        foreach (var row in rows)
        {
            var key = BucketStart(TimeZones.LocalDate(row.OccurredAt, scope.Zone), granularity);
            if (!buckets.TryGetValue(key, out var bucket))
            {
                continue;
            }

            bucket.Count++;
            if (row.Type == TransactionType.Income)
            {
                bucket.Income += row.Amount;
            }
            else
            {
                bucket.Expense += row.Amount;
            }
        }

        return points
            .Select(p => new TrendPointDto(p, buckets[p].Income, buckets[p].Expense, buckets[p].Income - buckets[p].Expense, buckets[p].Count))
            .ToList();
    }

    public async Task<PatternsDto> GetPatternsAsync(AnalyticsFilter filter, CancellationToken cancellationToken)
    {
        var scope = await BuildScopeAsync(filter, cancellationToken);

        var rows = await Query(scope, filter, scope.StartUtc, scope.EndUtc)
            .Where(t => t.Type == TransactionType.Expense)
            .Select(t => new { t.OccurredAt, t.Amount })
            .ToListAsync(cancellationToken);

        var weekdayTotals = new decimal[7];
        var weekdayCounts = new int[7];
        var hourTotals = new decimal[24];
        var hourCounts = new int[24];

        foreach (var row in rows)
        {
            var local = TimeZones.ToLocal(row.OccurredAt, scope.Zone);
            var day = (int)local.DayOfWeek;
            weekdayTotals[day] += row.Amount;
            weekdayCounts[day]++;
            hourTotals[local.Hour] += row.Amount;
            hourCounts[local.Hour]++;
        }

        // Average per weekday = total / how many of that weekday actually occurred in the (elapsed) range.
        var effectiveTo = scope.To > scope.Today ? scope.Today : scope.To;
        var weekdayOccurrences = new int[7];
        for (var d = scope.From; d <= effectiveTo; d = d.AddDays(1))
        {
            weekdayOccurrences[(int)d.DayOfWeek]++;
        }

        var byWeekday = Enumerable.Range(1, 7)
            .Select(i => i % 7) // Monday first, Sunday last
            .Select(day => new WeekdayStatDto(
                (DayOfWeek)day,
                weekdayTotals[day],
                weekdayCounts[day],
                weekdayOccurrences[day] == 0 ? 0m : Math.Round(weekdayTotals[day] / weekdayOccurrences[day], 2)))
            .ToList();

        var byHour = Enumerable.Range(0, 24).Select(h => new HourStatDto(h, hourTotals[h], hourCounts[h])).ToList();
        return new PatternsDto(byWeekday, byHour);
    }

    // ------------------------------------------------------------------ descriptions, recurring, anomalies

    public async Task<IReadOnlyList<TopDescriptionDto>> GetTopDescriptionsAsync(
        AnalyticsFilter filter, TransactionType type, int limit, CancellationToken cancellationToken)
    {
        var scope = await BuildScopeAsync(filter, cancellationToken);
        limit = Math.Clamp(limit, 1, 50);

        var rows = await Query(scope, filter, scope.StartUtc, scope.EndUtc)
            .Where(t => t.Type == type && t.Description != null && t.Description != "")
            .GroupBy(t => t.Description!.Trim().ToLower())
            .Select(g => new
            {
                Sample = g.Max(x => x.Description),
                Total = g.Sum(x => x.Amount),
                Count = g.Count(),
                Last = g.Max(x => x.OccurredAt)
            })
            .OrderByDescending(x => x.Total)
            .Take(limit)
            .ToListAsync(cancellationToken);

        return rows
            .Select(r => new TopDescriptionDto(r.Sample ?? string.Empty, r.Total, r.Count, Math.Round(r.Total / r.Count, 2), r.Last))
            .ToList();
    }

    public async Task<IReadOnlyList<RecurringExpenseDto>> GetRecurringAsync(string? timeZone, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var zone = TimeZones.Resolve(timeZone);
        var today = TimeZones.LocalDate(clock.GetUtcNow(), zone);
        var since = TimeZones.StartOfDayUtc(today.AddMonths(-RecurringLookbackMonths), zone);

        var rows = await db.Transactions.AsNoTracking()
            .Where(t => t.UserId == userId && t.Type == TransactionType.Expense && t.Description != null && t.OccurredAt >= since)
            .Select(t => new { t.Description, t.Amount, t.OccurredAt, CategoryName = t.Category.Name })
            .ToListAsync(cancellationToken);

        var samples = rows.Select(r => new RecurringSample(
            r.Description!, r.Amount, TimeZones.LocalDate(r.OccurredAt, zone), r.CategoryName));

        return RecurringDetector.Detect(samples, today);
    }

    public async Task<IReadOnlyList<AnomalyDto>> GetAnomaliesAsync(AnalyticsFilter filter, CancellationToken cancellationToken)
    {
        var scope = await BuildScopeAsync(filter, cancellationToken);

        var baselineStart = TimeZones.StartOfDayUtc(scope.To.AddMonths(-AnomalyBaselineMonths), scope.Zone);
        var stats = await db.Transactions.AsNoTracking()
            .Where(t => t.UserId == scope.UserId && t.Type == TransactionType.Expense
                        && t.OccurredAt >= baselineStart && t.OccurredAt < scope.EndUtc)
            .GroupBy(t => t.CategoryId)
            .Select(g => new
            {
                CategoryId = g.Key,
                Count = g.Count(),
                Sum = g.Sum(x => x.Amount),
                SumSquares = g.Sum(x => x.Amount * x.Amount)
            })
            .ToListAsync(cancellationToken);

        var baseline = stats
            .Where(s => s.Count >= AnomalyMinSamples)
            .ToDictionary(
                s => s.CategoryId,
                s =>
                {
                    var mean = s.Sum / s.Count;
                    var variance = Math.Max(0m, s.SumSquares / s.Count - mean * mean);
                    return (Mean: mean, StdDev: (decimal)Math.Sqrt((double)variance));
                });

        var candidates = await Query(scope, filter, scope.StartUtc, scope.EndUtc)
            .Where(t => t.Type == TransactionType.Expense)
            .Select(t => new { t.Id, t.OccurredAt, t.Description, t.CategoryId, CategoryName = t.Category.Name, t.Amount })
            .ToListAsync(cancellationToken);

        var anomalies = new List<AnomalyDto>();
        foreach (var c in candidates)
        {
            if (!baseline.TryGetValue(c.CategoryId, out var b) || b.StdDev <= 0m)
            {
                continue;
            }

            var z = (c.Amount - b.Mean) / b.StdDev;
            if (z >= 3m && c.Amount >= b.Mean * 2m)
            {
                anomalies.Add(new AnomalyDto(c.Id, c.OccurredAt, c.Description, c.CategoryName, c.Amount,
                    Math.Round(b.Mean, 2), Math.Round(z, 2)));
            }
        }

        return anomalies.OrderByDescending(a => a.ZScore).Take(MaxAnomalies).ToList();
    }

    // ------------------------------------------------------------------ forecast

    public async Task<ForecastDto> GetForecastAsync(string? timeZone, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var zone = TimeZones.Resolve(timeZone);
        var now = clock.GetUtcNow();
        var today = TimeZones.LocalDate(now, zone);

        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var monthEnd = monthStart.AddMonths(1).AddDays(-1);
        var historyStart = monthStart.AddMonths(-6);
        var trailingStart = today.AddDays(-90);
        var loadFrom = historyStart < trailingStart ? historyStart : trailingStart;
        var loadFromUtc = TimeZones.StartOfDayUtc(loadFrom, zone);

        var rows = (await db.Transactions.AsNoTracking()
                .Where(t => t.UserId == userId && t.Type == TransactionType.Expense && t.OccurredAt >= loadFromUtc)
                .Select(t => new { t.OccurredAt, t.Amount })
                .ToListAsync(cancellationToken))
            .Select(r => new { Date = TimeZones.LocalDate(r.OccurredAt, zone), r.Amount })
            .ToList();

        var spentSoFar = rows.Where(r => r.Date >= monthStart).Sum(r => r.Amount);

        // Six complete months before this one; leading empty months (before the user started) are dropped.
        var history = Enumerable.Range(0, 6)
            .Select(i => historyStart.AddMonths(i))
            .Select(start => rows.Where(r => r.Date >= start && r.Date < start.AddMonths(1)).Sum(r => r.Amount))
            .SkipWhile(total => total == 0m)
            .ToList();

        var trailingMonthlyAverage = history.Count == 0 ? 0m : Math.Round(history.TakeLast(3).Average(), 2);

        // Daily run rate: early in the month the month-to-date figure is a tiny sample, so lean on the 90-day rate.
        var trailingRows = rows.Where(r => r.Date >= trailingStart && r.Date < today).ToList();
        var trailingRate = 0m;
        if (trailingRows.Count > 0)
        {
            var firstDate = trailingRows.Min(r => r.Date);
            var span = Math.Max(1, today.DayNumber - (firstDate > trailingStart ? firstDate : trailingStart).DayNumber);
            trailingRate = trailingRows.Sum(r => r.Amount) / span;
        }

        var monthToDateRate = spentSoFar / Math.Max(1, today.Day);
        var runRate = trailingRate == 0m
            ? monthToDateRate
            : today.Day >= 7
                ? monthToDateRate * 0.6m + trailingRate * 0.4m
                : monthToDateRate * 0.3m + trailingRate * 0.7m;

        var daysRemaining = monthEnd.DayNumber - today.DayNumber;
        var projectedMonthEnd = Math.Round(spentSoFar + runRate * daysRemaining, 2);

        var series = new List<decimal>(history) { projectedMonthEnd };
        var next = StatisticsHelper.LinearForecast(series, 3)
            .Select((value, i) => new ForecastMonthDto(monthStart.AddMonths(i + 1), value))
            .ToList();

        return new ForecastDto(
            AsOf: today,
            MonthStart: monthStart,
            MonthEnd: monthEnd,
            SpentSoFar: spentSoFar,
            DailyRunRate: Math.Round(runRate, 2),
            ProjectedMonthEnd: projectedMonthEnd,
            DaysRemaining: daysRemaining,
            TrailingMonthlyAverage: trailingMonthlyAverage,
            NextMonths: next);
    }

    // ------------------------------------------------------------------ tags

    public async Task<IReadOnlyList<TagStatDto>> GetTagStatsAsync(AnalyticsFilter filter, CancellationToken cancellationToken)
    {
        var scope = await BuildScopeAsync(filter, cancellationToken);

        var rows = await Query(scope, filter, scope.StartUtc, scope.EndUtc)
            .Where(t => t.Tags.Count > 0)
            .Select(t => new { t.Type, t.Amount, t.Tags })
            .ToListAsync(cancellationToken);

        var stats = new Dictionary<string, (decimal Expense, decimal Income, int Count)>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            foreach (var tag in row.Tags.Distinct())
            {
                stats.TryGetValue(tag, out var s);
                stats[tag] = row.Type == TransactionType.Expense
                    ? (s.Expense + row.Amount, s.Income, s.Count + 1)
                    : (s.Expense, s.Income + row.Amount, s.Count + 1);
            }
        }

        return stats
            .Select(kv => new TagStatDto(kv.Key, kv.Value.Expense, kv.Value.Income, kv.Value.Count))
            .OrderByDescending(t => t.Expense + t.Income)
            .Take(50)
            .ToList();
    }

    // ------------------------------------------------------------------ helpers

    private async Task<Scope> BuildScopeAsync(AnalyticsFilter filter, CancellationToken cancellationToken)
    {
        await validator.ValidateAndThrowAsync(filter, cancellationToken);

        var zone = TimeZones.Resolve(filter.TimeZone);
        var today = TimeZones.LocalDate(clock.GetUtcNow(), zone);

        // Defaults: nothing given => current month; only From given => From..today (or From itself if in the future).
        var to = filter.To ?? (filter.From is null
            ? new DateOnly(today.Year, today.Month, 1).AddMonths(1).AddDays(-1)
            : (today > filter.From.Value ? today : filter.From.Value));
        var from = filter.From ?? new DateOnly(to.Year, to.Month, 1);

        return new Scope(
            currentUser.UserId, zone, from, to, today,
            TimeZones.StartOfDayUtc(from, zone),
            TimeZones.StartOfDayUtc(to.AddDays(1), zone));
    }

    private IQueryable<Transaction> Query(Scope scope, AnalyticsFilter filter, DateTimeOffset startUtc, DateTimeOffset endUtc)
    {
        // Moving money between your own accounts is neither income nor spending, so analytics never see it.
        var query = db.Transactions.AsNoTracking()
            .Where(t => t.UserId == scope.UserId && t.OccurredAt >= startUtc && t.OccurredAt < endUtc
                        && t.Type != TransactionType.TransferOut && t.Type != TransactionType.TransferIn);

        if (filter.AccountId is { } accountId)
        {
            query = query.Where(t => t.AccountId == accountId);
        }

        if (filter.CategoryId is { } categoryId)
        {
            query = query.Where(t => t.CategoryId == categoryId || t.Category.ParentId == categoryId);
        }

        return query;
    }

    private static async Task<(decimal Income, decimal Expense, int Count)> TotalsAsync(
        IQueryable<Transaction> query, CancellationToken cancellationToken)
    {
        var rows = await query
            .GroupBy(t => t.Type)
            .Select(g => new { Type = g.Key, Total = g.Sum(x => x.Amount), Count = g.Count() })
            .ToListAsync(cancellationToken);

        return (
            rows.Where(r => r.Type == TransactionType.Income).Sum(r => r.Total),
            rows.Where(r => r.Type == TransactionType.Expense).Sum(r => r.Total),
            rows.Sum(r => r.Count));
    }

    private static IQueryable<TransactionBriefDto> Brief(IQueryable<Transaction> query) =>
        query.Select(t => new TransactionBriefDto(t.Id, t.OccurredAt, t.Description, t.Category.Name, t.Amount));

    private static async Task<Dictionary<Guid, decimal>> RootTotalsAsync(
        IQueryable<Transaction> query, CancellationToken cancellationToken)
    {
        var rows = await query
            .Where(t => t.Type == TransactionType.Expense)
            .GroupBy(t => t.Category.ParentId ?? t.Category.Id)
            .Select(g => new { Id = g.Key, Total = g.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);

        return rows.ToDictionary(r => r.Id, r => r.Total);
    }

    private async Task<IReadOnlyList<CategoryAmountDto>> ToCategoryAmountsAsync(
        List<(Guid Id, decimal Amount, int Count)> groups, Guid? drilledParentId, CancellationToken cancellationToken)
    {
        var ids = groups.Select(g => g.Id).ToList();
        var categories = await db.Categories.AsNoTracking()
            .Where(c => ids.Contains(c.Id))
            .Select(c => new { c.Id, c.Name, c.Color })
            .ToDictionaryAsync(c => c.Id, cancellationToken);

        var total = groups.Sum(g => g.Amount);

        return groups
            .Where(g => categories.ContainsKey(g.Id))
            .Select(g =>
            {
                var info = categories[g.Id];
                // Spending booked directly on the parent (no subcategory) is labelled so it is not confused with the parent total.
                var name = drilledParentId == g.Id ? $"{info.Name} (no subcategory)" : info.Name;
                var percent = total == 0m ? 0m : Math.Round(g.Amount / total * 100m, 2);
                return new CategoryAmountDto(g.Id, name, info.Color, g.Amount, percent, g.Count);
            })
            .OrderByDescending(c => c.Amount)
            .ToList();
    }

    public static DateOnly BucketStart(DateOnly date, TrendGranularity granularity) => granularity switch
    {
        TrendGranularity.Day => date,
        TrendGranularity.Week => date.AddDays(-(((int)date.DayOfWeek + 6) % 7)), // Monday
        TrendGranularity.Month => new DateOnly(date.Year, date.Month, 1),
        TrendGranularity.Quarter => new DateOnly(date.Year, (date.Month - 1) / 3 * 3 + 1, 1),
        TrendGranularity.Year => new DateOnly(date.Year, 1, 1),
        _ => date
    };

    public static DateOnly NextBucket(DateOnly bucketStart, TrendGranularity granularity) => granularity switch
    {
        TrendGranularity.Day => bucketStart.AddDays(1),
        TrendGranularity.Week => bucketStart.AddDays(7),
        TrendGranularity.Month => bucketStart.AddMonths(1),
        TrendGranularity.Quarter => bucketStart.AddMonths(3),
        TrendGranularity.Year => bucketStart.AddYears(1),
        _ => bucketStart.AddDays(1)
    };
}
