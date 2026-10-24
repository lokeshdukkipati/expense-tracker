namespace ExpenseTracker.Application.Goals;

/// <summary>Values of <see cref="GoalDto.Status"/>.</summary>
public static class GoalStatus
{
    public const string Completed = "completed";
    public const string OnTrack = "on_track";
    public const string Behind = "behind";
    public const string Overdue = "overdue";
    public const string NoDeadline = "no_deadline";
}

/// <summary>
/// A goal with its progress worked out. <see cref="CurrentAmount"/> comes from the linked account's balance
/// when <see cref="AccountId"/> is set, otherwise from the amount the user has put aside by hand.
/// </summary>
public sealed record GoalDto(
    Guid Id,
    string Name,
    decimal TargetAmount,
    decimal CurrentAmount,
    decimal RemainingAmount,
    decimal ProgressPercent,
    string Currency,
    DateOnly? TargetDate,
    int? DaysLeft,
    decimal? RequiredPerMonth,
    DateOnly? ProjectedDate,
    string Status,
    bool IsCompleted,
    DateTimeOffset? CompletedAt,
    Guid? AccountId,
    string? AccountName,
    string? Color,
    string? Icon,
    bool IsArchived,
    uint Version);

public interface IGoalInput
{
    string Name { get; }
    decimal TargetAmount { get; }
    string? Color { get; }
    string? Icon { get; }
}

/// <summary>
/// <see cref="InitialAmount"/> is what is already saved (manual goals only). When <see cref="AccountId"/> is set,
/// progress follows that account's balance instead.
/// </summary>
public sealed record CreateGoalRequest(
    string Name,
    decimal TargetAmount,
    decimal? InitialAmount,
    DateOnly? TargetDate,
    Guid? AccountId,
    string? Color,
    string? Icon) : IGoalInput;

public sealed record UpdateGoalRequest(
    string Name,
    decimal TargetAmount,
    DateOnly? TargetDate,
    Guid? AccountId,
    string? Color,
    string? Icon,
    bool IsArchived,
    uint Version) : IGoalInput;

/// <summary>Positive amounts add to a manual goal; negative amounts take money out of it.</summary>
public sealed record ContributeGoalRequest(decimal Amount);