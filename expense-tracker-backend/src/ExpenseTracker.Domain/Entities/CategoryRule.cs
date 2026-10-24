using ExpenseTracker.Domain.Common;
using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Domain.Entities;

/// <summary>
/// "When the description matches this text, use that category." Applied to imported rows and quick-add entries.
/// </summary>
public class CategoryRule : BaseEntity
{
    public Guid UserId { get; set; }

    public User User { get; set; } = null!;

    /// <summary>Always stored trimmed and lower-cased; matching is case-insensitive.</summary>
    public string Pattern { get; set; } = string.Empty;

    public RuleMatchType MatchType { get; set; } = RuleMatchType.Contains;

    /// <summary>Expense or Income. The rule only applies to this type and must point at a category of the same type.</summary>
    public TransactionType Type { get; set; } = TransactionType.Expense;

    public Guid CategoryId { get; set; }

    public Category Category { get; set; } = null!;

    /// <summary>Lower numbers are checked first; ties go to the longer pattern.</summary>
    public int Priority { get; set; }

    public bool IsActive { get; set; } = true;

    /// <summary>How many transactions this rule has categorised (shown as "used N times").</summary>
    public int TimesApplied { get; set; }
}