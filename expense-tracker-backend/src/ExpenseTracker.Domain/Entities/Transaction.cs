using ExpenseTracker.Domain.Common;
using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Domain.Entities;

public class Transaction : BaseEntity
{
    public Guid UserId { get; set; }

    public User User { get; set; } = null!;

    public Guid AccountId { get; set; }

    public Account Account { get; set; } = null!;

    /// <summary>The most specific category (a subcategory when one applies).</summary>
    public Guid CategoryId { get; set; }

    public Category Category { get; set; } = null!;

    public TransactionType Type { get; set; }

    /// <summary>Always non-negative; <see cref="Type"/> decides the direction.</summary>
    public decimal Amount { get; set; }

    public string Currency { get; set; } = "INR";

    public DateTimeOffset OccurredAt { get; set; }

    public string? Description { get; set; }

    public string? Note { get; set; }

    public List<string> Tags { get; set; } = new();

    public TransactionSource Source { get; set; } = TransactionSource.Manual;

    public Guid? ImportBatchId { get; set; }

    public ImportBatch? ImportBatch { get; set; }

    /// <summary>
    /// SHA-256 (hex) identity of an imported row. Set once at import and never changed by edits,
    /// so re-importing an edited or soft-deleted row is still detected as a duplicate.
    /// Null for manual entries.
    /// </summary>
    public string? Fingerprint { get; set; }

    /// <summary>
    /// Shared by the two legs of a transfer between the user's own accounts (one <see cref="TransactionType.TransferOut"/>
    /// and one <see cref="TransactionType.TransferIn"/>). Null for ordinary income and expenses.
    /// </summary>
    public Guid? TransferGroupId { get; set; }

    public bool IsDeleted { get; set; }

    public DateTimeOffset? DeletedAt { get; set; }
}
