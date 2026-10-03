using ExpenseTracker.Domain.Common;
using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Domain.Entities;

/// <summary>A wallet / bank account / card the money moves through.</summary>
public class Account : BaseEntity
{
    public Guid UserId { get; set; }

    public User User { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    public AccountType Type { get; set; } = AccountType.Cash;

    public string Currency { get; set; } = "INR";

    public decimal OpeningBalance { get; set; }

    public bool IsArchived { get; set; }
}
