using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Imports;

public sealed record ImportBatchDto(
    Guid Id,
    string FileName,
    string Format,
    int TotalRows,
    int ImportedRows,
    int DuplicateRows,
    int InvalidRows,
    ImportStatus Status,
    DateTimeOffset CreatedAt);

public sealed record ImportRowSampleDto(
    int RowNumber,
    DateTime LocalTimestamp,
    TransactionType Type,
    decimal Amount,
    string Currency,
    string Account,
    string Category,
    string? Subcategory,
    string? Description);

public sealed record InvalidRowDto(int RowNumber, string Reason);

public sealed record ImportPreviewDto(
    string FileName,
    string FileHash,
    string Format,
    int TotalRows,
    int NewRows,
    int DuplicateRows,
    int InvalidRows,
    bool FileAlreadyImported,
    ImportBatchDto? PreviousImport,
    DateOnly? FirstDate,
    DateOnly? LastDate,
    decimal NewIncomeTotal,
    decimal NewExpenseTotal,
    IReadOnlyList<string> NewAccounts,
    IReadOnlyList<string> NewCategories,
    IReadOnlyList<ImportRowSampleDto> SampleNewRows,
    IReadOnlyList<InvalidRowDto> InvalidSamples);

public sealed record ImportResultDto(ImportBatchDto Batch, int AccountsCreated, int CategoriesCreated);
