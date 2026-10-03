using ExpenseTracker.Domain.Common;
using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Domain.Entities;

public class Budget : BaseEntity
{
    public Guid UserId { get; set; }

    public User User { get; set; } = null!;

    /// <summary>Null means an overall budget across all expense categories.</summary>
    public Guid? CategoryId { get; set; }

    public Category? Category { get; set; }

    public decimal Amount { get; set; }

    public string Currency { get; set; } = "INR";

    public BudgetPeriod Period { get; set; } = BudgetPeriod.Monthly;

    /// <summary>Alert when spending reaches this percentage of <see cref="Amount"/> (1-100).</summary>
    public int AlertThresholdPercent { get; set; } = 80;

    public bool IsActive { get; set; } = true;
}
