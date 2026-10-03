using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Categories;

public sealed record CategoryDto(
    Guid Id,
    string Name,
    TransactionType Type,
    Guid? ParentId,
    string? Color,
    string? Icon,
    bool IsArchived,
    uint Version);

public sealed record CreateCategoryRequest(string Name, TransactionType Type, Guid? ParentId, string? Color, string? Icon);

public sealed record UpdateCategoryRequest(string Name, string? Color, string? Icon, bool IsArchived, uint Version);
