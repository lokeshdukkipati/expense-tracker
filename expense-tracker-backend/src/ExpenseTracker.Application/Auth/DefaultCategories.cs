using ExpenseTracker.Domain.Entities;
using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Auth;

/// <summary>Starter categories seeded for every new user.</summary>
internal static class DefaultCategories
{
    private static readonly (string Name, string Color)[] Expense =
    [
        ("Food", "#F97316"), ("Transportation", "#3B82F6"), ("Household", "#8B5CF6"),
        ("Health", "#EF4444"), ("Education", "#14B8A6"), ("Bills", "#EAB308"),
        ("Shopping", "#EC4899"), ("Culture", "#A855F7"), ("Beauty", "#F472B6"),
        ("Social Life", "#22C55E"), ("Gift", "#FB7185"), ("Self-development", "#06B6D4"),
        ("Apparel", "#6366F1"), ("Other", "#64748B")
    ];

    private static readonly (string Name, string Color)[] Income =
    [
        ("Salary", "#16A34A"), ("Bonus", "#65A30D"), ("Other", "#64748B")
    ];

    public static IEnumerable<Category> Create(Guid userId) =>
        Expense.Select(c => Build(userId, c, TransactionType.Expense))
            .Concat(Income.Select(c => Build(userId, c, TransactionType.Income)));

    private static Category Build(Guid userId, (string Name, string Color) c, TransactionType type) =>
        new() { UserId = userId, Name = c.Name, Color = c.Color, Type = type };
}
