using ExpenseTracker.Application.Analytics;
using ExpenseTracker.Application.Budgets;
using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Tests;

public class StatisticsHelperTests
{
    [Fact]
    public void Median_handles_odd_even_and_empty()
    {
        Assert.Equal(3m, StatisticsHelper.Median([5m, 1m, 3m]));
        Assert.Equal(2.5m, StatisticsHelper.Median([1m, 2m, 3m, 4m]));
        Assert.Equal(0m, StatisticsHelper.Median([]));
    }

    [Fact]
    public void Population_standard_deviation_matches_the_textbook_value()
    {
        Assert.Equal(2m, StatisticsHelper.StdDev([2m, 4m, 4m, 4m, 5m, 5m, 7m, 9m]));
        Assert.Equal(0m, StatisticsHelper.StdDev([5m]));
    }

    [Fact]
    public void Percent_change_is_null_when_there_is_no_baseline()
    {
        Assert.Equal(20m, StatisticsHelper.PercentChange(120m, 100m));
        Assert.Equal(-50m, StatisticsHelper.PercentChange(50m, 100m));
        Assert.Null(StatisticsHelper.PercentChange(10m, 0m));
    }

    [Fact]
    public void Linear_forecast_extends_a_rising_trend()
    {
        Assert.Equal([400m, 500m], StatisticsHelper.LinearForecast([100m, 200m, 300m], 2));
    }

    [Fact]
    public void Linear_forecast_never_goes_below_zero()
    {
        Assert.Equal([0m, 0m], StatisticsHelper.LinearForecast([30m, 20m, 10m], 2));
    }

    [Fact]
    public void Linear_forecast_uses_the_average_when_history_is_too_short()
    {
        Assert.Equal([150m], StatisticsHelper.LinearForecast([100m, 200m], 1));
        Assert.Equal([0m, 0m, 0m], StatisticsHelper.LinearForecast([], 3));
    }
}

public class PeriodBoundsTests
{
    [Fact]
    public void Weekly_period_runs_monday_to_sunday()
    {
        var (start, end) = BudgetService.PeriodBounds(BudgetPeriod.Weekly, new DateOnly(2026, 9, 30)); // a Wednesday

        Assert.Equal(new DateOnly(2026, 9, 28), start);
        Assert.Equal(new DateOnly(2026, 10, 4), end);
    }

    [Fact]
    public void Weekly_period_on_a_sunday_belongs_to_the_week_that_started_on_monday()
    {
        var (start, end) = BudgetService.PeriodBounds(BudgetPeriod.Weekly, new DateOnly(2026, 10, 4));

        Assert.Equal(new DateOnly(2026, 9, 28), start);
        Assert.Equal(new DateOnly(2026, 10, 4), end);
    }

    [Fact]
    public void Monthly_and_yearly_periods_cover_the_calendar_period()
    {
        Assert.Equal((new DateOnly(2026, 2, 1), new DateOnly(2026, 2, 28)),
            BudgetService.PeriodBounds(BudgetPeriod.Monthly, new DateOnly(2026, 2, 14)));
        Assert.Equal((new DateOnly(2026, 1, 1), new DateOnly(2026, 12, 31)),
            BudgetService.PeriodBounds(BudgetPeriod.Yearly, new DateOnly(2026, 6, 1)));
    }
}

public class TrendBucketTests
{
    [Theory]
    [InlineData(TrendGranularity.Day, "2026-09-30", "2026-09-30")]
    [InlineData(TrendGranularity.Week, "2026-09-30", "2026-09-28")]
    [InlineData(TrendGranularity.Month, "2026-09-30", "2026-09-01")]
    [InlineData(TrendGranularity.Quarter, "2026-09-30", "2026-07-01")]
    [InlineData(TrendGranularity.Year, "2026-09-30", "2026-01-01")]
    public void Bucket_start_snaps_to_the_beginning_of_the_period(TrendGranularity granularity, string date, string expected)
    {
        var start = AnalyticsService.BucketStart(DateOnly.Parse(date), granularity);

        Assert.Equal(DateOnly.Parse(expected), start);
    }

    [Fact]
    public void Next_bucket_advances_by_one_period()
    {
        Assert.Equal(new DateOnly(2026, 10, 1), AnalyticsService.NextBucket(new DateOnly(2026, 9, 1), TrendGranularity.Month));
        Assert.Equal(new DateOnly(2026, 10, 1), AnalyticsService.NextBucket(new DateOnly(2026, 7, 1), TrendGranularity.Quarter));
        Assert.Equal(new DateOnly(2026, 10, 5), AnalyticsService.NextBucket(new DateOnly(2026, 9, 28), TrendGranularity.Week));
    }
}
