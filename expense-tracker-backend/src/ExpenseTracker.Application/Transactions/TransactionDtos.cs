using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Transactions;

public sealed record TransactionDto(
    Guid Id,
    Guid AccountId,
    string AccountName,
    Guid CategoryId,
    string CategoryName,
    Guid? ParentCategoryId,
    string? ParentCategoryName,
    TransactionType Type,
    decimal Amount,
    string Currency,
    DateTimeOffset OccurredAt,
    string? Description,
    string? Note,
    List<string> Tags,
    TransactionSource Source,
    DateTimeOffset CreatedAt,
    uint Version,
    Guid? TransferGroupId,
    Guid? TransferAccountId,
    string? TransferAccountName);

/// <summary>Fields shared by create and update so both are validated by the same rules.</summary>
public interface ITransactionInput
{
    Guid AccountId { get; }
    Guid CategoryId { get; }
    TransactionType Type { get; }
    decimal Amount { get; }
    DateTimeOffset OccurredAt { get; }
    string? Description { get; }
    string? Note { get; }
    List<string>? Tags { get; }
}

public sealed record CreateTransactionRequest(
    Guid AccountId,
    Guid CategoryId,
    TransactionType Type,
    decimal Amount,
    DateTimeOffset OccurredAt,
    string? Description,
    string? Note,
    List<string>? Tags) : ITransactionInput;

public sealed record UpdateTransactionRequest(
    Guid AccountId,
    Guid CategoryId,
    TransactionType Type,
    decimal Amount,
    DateTimeOffset OccurredAt,
    string? Description,
    string? Note,
    List<string>? Tags,
    uint Version) : ITransactionInput;

public sealed record BulkDeleteRequest(List<Guid> Ids);

public sealed record BulkDeleteResult(int Deleted);

/// <summary>Shared by listing, export and (indirectly) analytics. Dates are inclusive and interpreted in <see cref="TimeZone"/>.</summary>
public class TransactionFilter
{
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
    public TransactionType? Type { get; set; }
    public Guid? AccountId { get; set; }

    /// <summary>A parent category also matches transactions in its subcategories.</summary>
    public Guid? CategoryId { get; set; }

    public string? Search { get; set; }
    public decimal? MinAmount { get; set; }
    public decimal? MaxAmount { get; set; }
    public string? Tag { get; set; }
    public TransactionSource? Source { get; set; }

    /// <summary>IANA id such as Asia/Kolkata. Defaults to UTC.</summary>
    public string? TimeZone { get; set; }
}

public sealed class TransactionQuery : TransactionFilter
{
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 50;

    /// <summary>"date" (default) or "amount".</summary>
    public string SortBy { get; set; } = "date";

    /// <summary>"desc" (default) or "asc".</summary>
    public string SortDir { get; set; } = "desc";
}
