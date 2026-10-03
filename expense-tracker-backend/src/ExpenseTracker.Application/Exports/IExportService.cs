using ExpenseTracker.Application.Transactions;

namespace ExpenseTracker.Application.Exports;

public enum ExportFormat
{
    Csv = 1,
    Xlsx = 2
}

public sealed record ExportResult(string FileName, string ContentType, byte[] Content);

public interface IExportService
{
    Task<ExportResult> ExportTransactionsAsync(TransactionFilter filter, ExportFormat format, CancellationToken cancellationToken);
}
