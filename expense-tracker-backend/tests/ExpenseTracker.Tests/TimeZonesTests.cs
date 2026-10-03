using ExpenseTracker.Application.Common;
using FluentValidation;

namespace ExpenseTracker.Tests;

public class TimeZonesTests
{
    [Fact]
    public void Start_of_day_in_india_is_evening_utc_of_the_previous_day()
    {
        var zone = TimeZones.Resolve("Asia/Kolkata");

        var start = TimeZones.StartOfDayUtc(new DateOnly(2026, 9, 30), zone);

        Assert.Equal(new DateTimeOffset(2026, 9, 29, 18, 30, 0, TimeSpan.Zero), start);
        Assert.Equal(TimeSpan.Zero, start.Offset); // Npgsql only accepts UTC offsets for timestamptz
    }

    [Fact]
    public void Wall_clock_time_converts_to_the_correct_utc_instant()
    {
        var zone = TimeZones.Resolve("Asia/Kolkata");

        var utc = TimeZones.ToUtc(new DateTime(2026, 9, 29, 16, 36, 35), zone);

        Assert.Equal(new DateTimeOffset(2026, 9, 29, 11, 6, 35, TimeSpan.Zero), utc);
    }

    [Fact]
    public void Local_date_round_trips_across_midnight()
    {
        var zone = TimeZones.Resolve("Asia/Kolkata");
        var instant = new DateTimeOffset(2026, 9, 29, 20, 0, 0, TimeSpan.Zero); // 01:30 next day in India

        Assert.Equal(new DateOnly(2026, 9, 30), TimeZones.LocalDate(instant, zone));
    }

    [Fact]
    public void Nonexistent_spring_forward_time_is_moved_forward()
    {
        var zone = TimeZones.Resolve("America/New_York");

        var utc = TimeZones.ToUtc(new DateTime(2026, 3, 8, 2, 30, 0), zone); // 02:30 does not exist that day

        Assert.Equal(new DateTimeOffset(2026, 3, 8, 7, 30, 0, TimeSpan.Zero), utc);
    }

    [Fact]
    public void Missing_zone_defaults_to_utc_and_unknown_zone_is_a_validation_error()
    {
        Assert.Equal(TimeZoneInfo.Utc, TimeZones.Resolve(null));
        Assert.Equal(TimeZoneInfo.Utc, TimeZones.Resolve("  "));
        Assert.Throws<ValidationException>(() => TimeZones.Resolve("Mars/Olympus_Mons"));
    }
}
