using ExpenseTracker.Domain.Common;
using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Domain.Entities;

/// <summary>
/// Self-referencing tree: a root category has no parent; a subcategory points to its parent.
/// </summary>
public class Category : BaseEntity
{
    public Guid UserId { get; set; }

    public User User { get; set; } = null!;

    public string Name { get; set; } = string.Empty;

    public TransactionType Type { get; set; } = TransactionType.Expense;

    public Guid? ParentId { get; set; }

    public Category? Parent { get; set; }

    public ICollection<Category> Children { get; set; } = new List<Category>();

    /// <summary>Hex colour such as #F97316.</summary>
    public string? Color { get; set; }

    public string? Icon { get; set; }

    public bool IsArchived { get; set; }
}
