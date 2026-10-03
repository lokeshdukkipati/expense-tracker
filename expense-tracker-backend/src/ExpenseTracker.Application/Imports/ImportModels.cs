using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Imports;

/// <summary>
/// One row as read from a file, before it is matched to accounts/categories.
/// <see cref="LocalTimestamp"/> is the naive wall-clock time from the file; it is converted to UTC using the
/// caller's time zone only at commit time, so the duplicate fingerprint never depends on the time zone.
/// </summary>
public sealed record ParsedRow(
    int RowNumber,
    DateTime LocalTimestamp,
    TransactionType Type,
    decimal Amount,
    string Currency,
    string Account,
    string Category,
    string? Subcategory,
    string? Description,
    string? Note);

public sealed record InvalidRow(int RowNumber, string Reason);

public sealed record ParseResult(string Format, IReadOnlyList<ParsedRow> Rows, IReadOnlyList<InvalidRow> Invalid);

public sealed record ImportFileInput(string FileName, Stream Content, long Length);

/// <summary>Bound from the "Import" configuration section.</summary>
public sealed class ImportOptions
{
    public long MaxFileSizeBytes { get; set; } = 10 * 1024 * 1024;

    public int MaxRows { get; set; } = 50_000;
}
