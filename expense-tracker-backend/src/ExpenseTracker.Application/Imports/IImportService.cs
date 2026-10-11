namespace ExpenseTracker.Application.Imports;

public interface IImportService
{
    /// <summary>Dry run: parses the file and reports what would be imported. Writes nothing.</summary>
    Task<ImportPreviewDto> PreviewAsync(ImportFileInput file, ImportRunOptions run, CancellationToken cancellationToken);

    /// <summary>Imports only rows that are not already stored. Runs in one database transaction.</summary>
    Task<ImportResultDto> ImportAsync(ImportFileInput file, ImportRunOptions run, CancellationToken cancellationToken);

    Task<IReadOnlyList<ImportBatchDto>> ListBatchesAsync(CancellationToken cancellationToken);

    /// <summary>Permanently removes a batch and every transaction it created, so the file can be imported again.</summary>
    Task DeleteBatchAsync(Guid id, CancellationToken cancellationToken);
}