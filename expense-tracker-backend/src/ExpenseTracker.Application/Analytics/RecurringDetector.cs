namespace ExpenseTracker.Application.Analytics;

public sealed record RecurringSample(string Description, decimal Amount, DateOnly Date, string? CategoryName);

public sealed record RecurringExpenseDto(
    string Description,
    string? CategoryName,
    decimal TypicalAmount,
    int Occurrences,
    int AverageIntervalDays,
    string Frequency,
    DateOnly LastDate,
    DateOnly NextExpectedDate,
    decimal MonthlyCost);

/// <summary>
/// Finds subscriptions and other regular payments: the same description, at a steady interval, for a steady amount.
/// Pure function so it can be unit-tested without a database.
/// </summary>
public static class RecurringDetector
{
    private const double AmountVariationLimit = 0.25;

    public static IReadOnlyList<RecurringExpenseDto> Detect(IEnumerable<RecurringSample> samples, DateOnly asOf)
    {
        var results = new List<RecurringExpenseDto>();

        foreach (var group in samples
                     .Where(s => !string.IsNullOrWhiteSpace(s.Description) && s.Amount > 0)
                     .GroupBy(s => Normalize(s.Description)))
        {
            var items = group.OrderBy(s => s.Date).ToList();
            if (items.Count < 3)
            {
                continue;
            }

            var gaps = new List<int>();
            for (var i = 1; i < items.Count; i++)
            {
                var gap = items[i].Date.DayNumber - items[i - 1].Date.DayNumber;
                if (gap > 0)
                {
                    gaps.Add(gap);
                }
            }

            if (gaps.Count < 2)
            {
                continue;
            }

            var median = StatisticsHelper.MedianInt(gaps);
            var frequency = Classify(median);
            if (frequency is null)
            {
                continue;
            }

            // At least 70% of the gaps must sit close to the typical interval.
            var tolerance = Math.Max(3, median * 0.25);
            var consistent = gaps.Count(g => Math.Abs(g - median) <= tolerance);
            if (consistent < Math.Ceiling(gaps.Count * 0.7))
            {
                continue;
            }

            var amounts = items.Select(i => i.Amount).ToList();
            var mean = amounts.Average();
            if (mean <= 0 || (double)(StatisticsHelper.StdDev(amounts) / mean) > AmountVariationLimit)
            {
                continue;
            }

            var last = items[^1].Date;
            if (asOf.DayNumber - last.DayNumber > median * 2.5)
            {
                continue; // stopped paying: no longer recurring
            }

            var typical = StatisticsHelper.Median(amounts);
            results.Add(new RecurringExpenseDto(
                Description: items[^1].Description.Trim(),
                CategoryName: items[^1].CategoryName,
                TypicalAmount: typical,
                Occurrences: items.Count,
                AverageIntervalDays: median,
                Frequency: frequency.Value.Label,
                LastDate: last,
                NextExpectedDate: last.AddDays(median),
                MonthlyCost: Math.Round(typical * frequency.Value.PerMonth, 2)));
        }

        return results.OrderByDescending(r => r.MonthlyCost).ToList();
    }

    private static (string Label, decimal PerMonth)? Classify(int medianDays) => medianDays switch
    {
        >= 6 and <= 8 => ("Weekly", 52m / 12m),
        >= 12 and <= 16 => ("Biweekly", 26m / 12m),
        >= 26 and <= 35 => ("Monthly", 1m),
        >= 84 and <= 100 => ("Quarterly", 1m / 3m),
        >= 350 and <= 380 => ("Yearly", 1m / 12m),
        _ => null
    };

    private static string Normalize(string value) =>
        string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).ToLowerInvariant();
}
