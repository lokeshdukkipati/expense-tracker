using ExpenseTracker.Domain.Common;
using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Domain.Entities;

public class ImportBatch : BaseEntity
{
    public Guid UserId { get; set; }

    public User User { get; set; } = null!;

    public string FileName { get; set; } = string.Empty;

    /// <summary>SHA-256 (hex) of the uploaded file bytes; (UserId, FileHash) is unique.</summary>
    public string FileHash { get; set; } = string.Empty;

    /// <summary>Parser that handled the file, e.g. "MoneyManagerXlsx".</summary>
    public string Format { get; set; } = string.Empty;

    public int TotalRows { get; set; }

    public int ImportedRows { get; set; }

    public int DuplicateRows { get; set; }

    public int InvalidRows { get; set; }

    public ImportStatus Status { get; set; } = ImportStatus.Completed;

    public ICollection<Transaction> Transactions { get; set; } = new List<Transaction>();
}
