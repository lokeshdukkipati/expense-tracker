using ExpenseTracker.Application.Analytics;

namespace ExpenseTracker.Tests;

public class RecurringDetectorTests
{
    private static readonly DateOnly AsOf = new(2026, 9, 30);

    private static IEnumerable<RecurringSample> Monthly(string description, decimal amount, DateOnly first, int count) =>
        Enumerable.Range(0, count).Select(i => new RecurringSample(description, amount, first.AddMonths(i), "Bills"));

    [Fact]
    public void Steady_monthly_payment_is_detected()
    {
        var result = RecurringDetector.Detect(Monthly("Netflix", 649m, new DateOnly(2026, 5, 1), 5), AsOf);

        var item = Assert.Single(result);
        Assert.Equal("Monthly", item.Frequency);
        Assert.Equal(5, item.Occurrences);
        Assert.Equal(649m, item.TypicalAmount);
        Assert.Equal(649m, item.MonthlyCost);
    }

    [Fact]
    public void Description_matching_ignores_case_and_spacing()
    {
        var samples = Monthly("netflix", 649m, new DateOnly(2026, 5, 1), 2)
            .Concat(Monthly("  NETFLIX ", 649m, new DateOnly(2026, 7, 1), 3));

        Assert.Single(RecurringDetector.Detect(samples, AsOf));
    }

    [Fact]
    public void Payment_that_stopped_long_ago_is_not_reported()
    {
        var result = RecurringDetector.Detect(Monthly("Old gym", 1500m, new DateOnly(2025, 1, 1), 5), AsOf);

        Assert.Empty(result);
    }

    [Fact]
    public void Wildly_varying_amounts_are_not_a_subscription()
    {
        var samples = new[] { 100m, 900m, 50m, 700m, 20m }
            .Select((amount, i) => new RecurringSample("Groceries", amount, new DateOnly(2026, 5, 1).AddMonths(i), null));

        Assert.Empty(RecurringDetector.Detect(samples, AsOf));
    }

    [Fact]
    public void Fewer_than_three_occurrences_is_not_enough()
    {
        Assert.Empty(RecurringDetector.Detect(Monthly("Rent", 12000m, new DateOnly(2026, 8, 1), 2), AsOf));
    }

    [Fact]
    public void Yearly_payment_is_converted_to_a_monthly_cost()
    {
        var samples = new[] { new DateOnly(2023, 10, 5), new DateOnly(2024, 10, 5), new DateOnly(2025, 10, 5) }
            .Select(d => new RecurringSample("Domain renewal", 1200m, d, null));

        var item = Assert.Single(RecurringDetector.Detect(samples, new DateOnly(2026, 6, 1)));

        Assert.Equal("Yearly", item.Frequency);
        Assert.Equal(100m, item.MonthlyCost);
    }
}
