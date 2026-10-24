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

public sealed record DuplicateRowDto(
    int RowNumber,
    DateTime LocalTimestamp,
    TransactionType Type,
    decimal Amount,
    string Currency,
    string? Description,
    string Reason);

public sealed record InvalidRowDto(int RowNumber, string Reason);

public sealed record ImportWarningDto(int RowNumber, string Message);

/// <summary>An account name found in the file, with how many new rows use it and the existing account it matches by name.</summary>
public sealed record FileAccountDto(string Name, int Rows, Guid? MatchedAccountId);

/// <summary>A top-level category found in the file (per type) and the existing category it matches by name.</summary>
public sealed record FileCategoryDto(TransactionType Type, string Name, int Rows, Guid? MatchedCategoryId);

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
    IReadOnlyList<InvalidRowDto> InvalidSamples,
    ImportMatchMode MatchMode,
    int WarningRows,
    IReadOnlyList<DuplicateRowDto> DuplicateSamples,
    IReadOnlyList<ImportWarningDto> Warnings,
    IReadOnlyList<FileAccountDto> FileAccounts,
    IReadOnlyList<FileCategoryDto> FileCategories,
    int NewTransfers,
    decimal NewTransferTotal);

public sealed record ImportResultDto(ImportBatchDto Batch, int AccountsCreated, int CategoriesCreated, int TransfersCreated);