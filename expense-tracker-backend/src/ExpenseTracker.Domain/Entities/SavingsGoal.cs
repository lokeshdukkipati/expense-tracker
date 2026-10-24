using ExpenseTracker.Domain.Common;

namespace ExpenseTracker.Domain.Entities;

/// <summary>
/// A savings target with an optional deadline. Progress is tracked manually through
/// <see cref="SavedAmount"/>, or live from the balance of a linked account when <see cref="AccountId"/> is set.
/// </summary>
public class SavingsGoal : BaseEntity
{
    public Guid UserId { get; set; }

    public User User { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    public decimal TargetAmount { get; set; }

    /// <summary>Manually tracked progress. Ignored while <see cref="AccountId"/> is set.</summary>
    public decimal SavedAmount { get; set; }

    public string Currency { get; set; } = "INR";

    public DateOnly? TargetDate { get; set; }

    /// <summary>When set, the goal's progress is the balance of this account.</summary>
    public Guid? AccountId { get; set; }

    public Account? Account { get; set; }

    /// <summary>Hex colour such as #F97316.</summary>
    public string? Color { get; set; }

    public string? Icon { get; set; }

    public bool IsArchived { get; set; }

    /// <summary>Set the first time the goal reaches its target.</summary>
    public DateTimeOffset? CompletedAt { get; set; }

    /// <summary>True for demo goals created by the "load sample data" action.</summary>
    public bool IsSample { get; set; }
}