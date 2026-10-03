using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Budgets;

public enum BudgetState
{
    OnTrack = 1,
    Warning = 2,
    Exceeded = 3
}

public sealed record BudgetDto(
    Guid Id,
    Guid? CategoryId,
    string? CategoryName,
    decimal Amount,
    string Currency,
    BudgetPeriod Period,
    int AlertThresholdPercent,
    bool IsActive,
    uint Version);

/// <summary>A null <see cref="CategoryId"/> creates the overall budget across all expense categories.</summary>
public sealed record CreateBudgetRequest(Guid? CategoryId, decimal Amount, BudgetPeriod Period, int AlertThresholdPercent = 80);

public sealed record UpdateBudgetRequest(decimal Amount, int AlertThresholdPercent, bool IsActive, uint Version);

public sealed record BudgetStatusDto(
    BudgetDto Budget,
    DateOnly PeriodStart,
    DateOnly PeriodEnd,
    decimal Spent,
    decimal Remaining,
    decimal PercentUsed,
    BudgetState State,
    decimal ProjectedSpend,
    int DaysLeft,
    bool ProjectedToExceed);
