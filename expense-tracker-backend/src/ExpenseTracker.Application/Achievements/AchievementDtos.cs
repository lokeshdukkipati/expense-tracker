namespace ExpenseTracker.Application.Achievements;

/// <param name="Unit">"days" or "months".</param>
/// <param name="Available">False when the streak cannot exist yet (for example no monthly budget is set).</param>
public sealed record StreakDto(int Current, int Best, string Unit, bool Available);

/// <param name="Icon">A name the UI maps to an icon.</param>
/// <param name="Tier">bronze, silver or gold.</param>
/// <param name="Group">habits, saving, budget, goals or setup.</param>
/// <param name="Progress">Capped at <paramref name="Target"/>.</param>
public sealed record BadgeDto(
    string Id,
    string Title,
    string Description,
    string Icon,
    string Tier,
    string Group,
    bool IsEarned,
    int Progress,
    int Target);

public sealed record AchievementsDto(
    StreakDto Logging,
    StreakDto NoSpend,
    StreakDto Budget,
    int NoSpendDaysLast30,
    int EarnedCount,
    int TotalCount,
    IReadOnlyList<BadgeDto> Badges);