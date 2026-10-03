using FluentValidation;
using FluentValidation.Results;

namespace ExpenseTracker.Application.Common;

/// <summary>
/// All date-range and bucketing logic is done in the caller's time zone, then converted to UTC instants
/// for storage and querying (timestamptz columns only accept UTC offsets).
/// </summary>
public static class TimeZones
{
    public static TimeZoneInfo Resolve(string? id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return TimeZoneInfo.Utc;
        }

        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(id.Trim());
        }
        catch (Exception ex) when (ex is TimeZoneNotFoundException or InvalidTimeZoneException)
        {
            throw new ValidationException([new ValidationFailure("timeZone", $"Unknown time zone '{id}'.")]);
        }
    }

    /// <summary>Converts a wall-clock time in <paramref name="zone"/> to a UTC instant (offset zero).</summary>
    public static DateTimeOffset ToUtc(DateTime local, TimeZoneInfo zone)
    {
        var unspecified = DateTime.SpecifyKind(local, DateTimeKind.Unspecified);

        // Wall-clock times that do not exist (spring-forward gap) are moved forward by the gap.
        if (zone.IsInvalidTime(unspecified))
        {
            unspecified = unspecified.AddHours(1);
        }

        var offset = zone.GetUtcOffset(unspecified);
        return new DateTimeOffset(unspecified, offset).ToUniversalTime();
    }

    public static DateTimeOffset StartOfDayUtc(DateOnly date, TimeZoneInfo zone) =>
        ToUtc(date.ToDateTime(TimeOnly.MinValue), zone);

    public static DateTime ToLocal(DateTimeOffset instant, TimeZoneInfo zone) =>
        TimeZoneInfo.ConvertTime(instant, zone).DateTime;

    public static DateOnly LocalDate(DateTimeOffset instant, TimeZoneInfo zone) =>
        DateOnly.FromDateTime(ToLocal(instant, zone));
}
