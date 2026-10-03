namespace ExpenseTracker.Application.Analytics;

public static class StatisticsHelper
{
    public static decimal Median(IReadOnlyCollection<decimal> values)
    {
        if (values.Count == 0)
        {
            return 0m;
        }

        var sorted = values.OrderBy(v => v).ToArray();
        var mid = sorted.Length / 2;
        return sorted.Length % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2m;
    }

    public static int MedianInt(IReadOnlyCollection<int> values)
    {
        if (values.Count == 0)
        {
            return 0;
        }

        var sorted = values.OrderBy(v => v).ToArray();
        var mid = sorted.Length / 2;
        return sorted.Length % 2 == 1 ? sorted[mid] : (int)Math.Round((sorted[mid - 1] + sorted[mid]) / 2.0);
    }

    /// <summary>Population standard deviation.</summary>
    public static decimal StdDev(IReadOnlyCollection<decimal> values)
    {
        if (values.Count < 2)
        {
            return 0m;
        }

        var mean = values.Average();
        var variance = values.Sum(v => (v - mean) * (v - mean)) / values.Count;
        return (decimal)Math.Sqrt((double)variance);
    }

    public static decimal? PercentChange(decimal current, decimal previous) =>
        previous == 0m ? null : Math.Round((current - previous) / previous * 100m, 2);

    /// <summary>
    /// Least-squares trend line over <paramref name="history"/> projected <paramref name="steps"/> periods ahead,
    /// never below zero. With fewer than three points the average is used, because a line through two points is noise.
    /// </summary>
    public static IReadOnlyList<decimal> LinearForecast(IReadOnlyList<decimal> history, int steps)
    {
        if (steps <= 0)
        {
            return [];
        }

        if (history.Count == 0)
        {
            return Enumerable.Repeat(0m, steps).ToList();
        }

        if (history.Count < 3)
        {
            var average = Math.Round(history.Average(), 2);
            return Enumerable.Repeat(average, steps).ToList();
        }

        var n = history.Count;
        var meanX = (n - 1) / 2.0;
        var meanY = history.Average(v => (double)v);

        var numerator = 0.0;
        var denominator = 0.0;
        for (var i = 0; i < n; i++)
        {
            numerator += (i - meanX) * ((double)history[i] - meanY);
            denominator += (i - meanX) * (i - meanX);
        }

        var slope = denominator == 0 ? 0 : numerator / denominator;
        var intercept = meanY - slope * meanX;

        return Enumerable.Range(0, steps)
            .Select(k => (decimal)Math.Max(0, intercept + slope * (n + k)))
            .Select(v => Math.Round(v, 2))
            .ToList();
    }
}
