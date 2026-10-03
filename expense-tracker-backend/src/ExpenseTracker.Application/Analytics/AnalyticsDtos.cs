using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Analytics;

/// <summary>
/// Common scope for every analytics call. Dates are inclusive and interpreted in <see cref="TimeZone"/>.
/// With no dates the current month is used. A parent category also covers its subcategories.
/// </summary>
public class AnalyticsFilter
{
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
    public Guid? AccountId { get; set; }
    public Guid? CategoryId { get; set; }
    public string? TimeZone { get; set; }
}

public enum TrendGranularity
{
    Day = 1,
    Week = 2,
    Month = 3,
    Quarter = 4,
    Year = 5
}

public sealed record TransactionBriefDto(Guid Id, DateTimeOffset OccurredAt, string? Description, string CategoryName, decimal Amount);

public sealed record PeriodTotalsDto(DateOnly From, DateOnly To, decimal Income, decimal Expense, decimal Net);

public sealed record SummaryDto(
    DateOnly From,
    DateOnly To,
    decimal Income,
    decimal Expense,
    decimal Net,
    decimal? SavingsRatePercent,
    int TransactionCount,
    decimal AverageDailyExpense,
    TransactionBriefDto? LargestExpense,
    TransactionBriefDto? LargestIncome,
    PeriodTotalsDto Previous,
    decimal? ExpenseChangePercent,
    decimal? IncomeChangePercent);

public sealed record CategoryAmountDto(Guid CategoryId, string Name, string? Color, decimal Amount, decimal Percent, int Count);

public sealed record CategoryBreakdownDto(TransactionType Type, decimal Total, IReadOnlyList<CategoryAmountDto> Items);

public sealed record TrendPointDto(DateOnly PeriodStart, decimal Income, decimal Expense, decimal Net, int Count);

public sealed record WeekdayStatDto(DayOfWeek Day, decimal Total, int Count, decimal AveragePerDay);

public sealed record HourStatDto(int Hour, decimal Total, int Count);

public sealed record PatternsDto(IReadOnlyList<WeekdayStatDto> ByWeekday, IReadOnlyList<HourStatDto> ByHour);

public sealed record TopDescriptionDto(string Description, decimal Total, int Count, decimal Average, DateTimeOffset LastOccurredAt);

public sealed record AnomalyDto(
    Guid TransactionId,
    DateTimeOffset OccurredAt,
    string? Description,
    string CategoryName,
    decimal Amount,
    decimal CategoryAverage,
    decimal ZScore);

public sealed record ForecastMonthDto(DateOnly MonthStart, decimal ProjectedExpense);

public sealed record ForecastDto(
    DateOnly AsOf,
    DateOnly MonthStart,
    DateOnly MonthEnd,
    decimal SpentSoFar,
    decimal DailyRunRate,
    decimal ProjectedMonthEnd,
    int DaysRemaining,
    decimal TrailingMonthlyAverage,
    IReadOnlyList<ForecastMonthDto> NextMonths);

public sealed record CategoryComparisonDto(
    Guid CategoryId,
    string Name,
    string? Color,
    decimal Current,
    decimal Previous,
    decimal Change,
    decimal? ChangePercent);

public sealed record TagStatDto(string Tag, decimal Expense, decimal Income, int Count);
