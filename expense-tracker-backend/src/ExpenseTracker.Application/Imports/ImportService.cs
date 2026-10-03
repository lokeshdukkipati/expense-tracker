using System.Security.Cryptography;
using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Application.Common;
using ExpenseTracker.Domain.Entities;
using ExpenseTracker.Domain.Enums;
using ExpenseTracker.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Imports;

public sealed class ImportService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TimeProvider clock,
    IEnumerable<IImportParser> parsers,
    ImportOptions options) : IImportService
{
    private const int LookupChunkSize = 5_000;
    private const int InsertChunkSize = 1_000;
    private const int SampleSize = 10;
    private const int InvalidSampleSize = 25;

    private int _categoriesCreated;

    private readonly record struct CategoryKey(TransactionType Type, Guid? ParentId, string Name);

    private sealed record Prepared(
        string FileName,
        string FileHash,
        string Format,
        IReadOnlyList<ParsedRow> Rows,
        IReadOnlyList<string> Fingerprints,
        bool[] IsDuplicate,
        IReadOnlyList<InvalidRow> Invalid);

    public async Task<ImportPreviewDto> PreviewAsync(ImportFileInput file, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var prepared = await PrepareAsync(file, cancellationToken);

        var previous = await db.ImportBatches.AsNoTracking()
            .FirstOrDefaultAsync(b => b.UserId == userId && b.FileHash == prepared.FileHash, cancellationToken);

        var newRows = new List<ParsedRow>();
        for (var i = 0; i < prepared.Rows.Count; i++)
        {
            if (!prepared.IsDuplicate[i])
            {
                newRows.Add(prepared.Rows[i]);
            }
        }

        var existingAccounts = (await db.Accounts.AsNoTracking().Where(a => a.UserId == userId).Select(a => a.Name).ToListAsync(cancellationToken))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var existingCategories = await db.Categories.AsNoTracking()
            .Where(c => c.UserId == userId)
            .Select(c => new { c.Type, c.Name, ParentName = c.Parent == null ? null : c.Parent.Name })
            .ToListAsync(cancellationToken);

        var knownCategoryKeys = existingCategories
            .Select(c => CategoryLabelKey(c.Type, c.ParentName, c.Name))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var newAccounts = newRows.Select(r => r.Account).Where(a => !existingAccounts.Contains(a))
            .Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(a => a).ToList();

        var newCategories = new SortedSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in newRows)
        {
            if (!knownCategoryKeys.Contains(CategoryLabelKey(row.Type, null, row.Category)))
            {
                newCategories.Add(row.Category);
            }

            if (!string.IsNullOrEmpty(row.Subcategory)
                && !knownCategoryKeys.Contains(CategoryLabelKey(row.Type, row.Category, row.Subcategory)))
            {
                newCategories.Add($"{row.Category} › {row.Subcategory}");
            }
        }

        DateOnly? first = null, last = null;
        if (prepared.Rows.Count > 0)
        {
            first = DateOnly.FromDateTime(prepared.Rows.Min(r => r.LocalTimestamp));
            last = DateOnly.FromDateTime(prepared.Rows.Max(r => r.LocalTimestamp));
        }

        var duplicateCount = prepared.IsDuplicate.Count(d => d);

        return new ImportPreviewDto(
            FileName: prepared.FileName,
            FileHash: prepared.FileHash,
            Format: prepared.Format,
            TotalRows: prepared.Rows.Count + prepared.Invalid.Count,
            NewRows: newRows.Count,
            DuplicateRows: duplicateCount,
            InvalidRows: prepared.Invalid.Count,
            FileAlreadyImported: previous is not null,
            PreviousImport: previous is null ? null : ToDto(previous),
            FirstDate: first,
            LastDate: last,
            NewIncomeTotal: newRows.Where(r => r.Type == TransactionType.Income).Sum(r => r.Amount),
            NewExpenseTotal: newRows.Where(r => r.Type == TransactionType.Expense).Sum(r => r.Amount),
            NewAccounts: newAccounts,
            NewCategories: newCategories.ToList(),
            SampleNewRows: newRows.Take(SampleSize)
                .Select(r => new ImportRowSampleDto(r.RowNumber, r.LocalTimestamp, r.Type, r.Amount, r.Currency,
                    r.Account, r.Category, r.Subcategory, r.Description))
                .ToList(),
            InvalidSamples: prepared.Invalid.Take(InvalidSampleSize).Select(i => new InvalidRowDto(i.RowNumber, i.Reason)).ToList());
    }

    public async Task<ImportResultDto> ImportAsync(ImportFileInput file, string? timeZone, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var zone = TimeZones.Resolve(timeZone);
        var prepared = await PrepareAsync(file, cancellationToken);

        var previous = await db.ImportBatches.AsNoTracking()
            .FirstOrDefaultAsync(b => b.UserId == userId && b.FileHash == prepared.FileHash, cancellationToken);
        if (previous is not null)
        {
            throw new ConflictException(
                $"This exact file was already imported on {previous.CreatedAt:yyyy-MM-dd HH:mm} UTC. Nothing was changed.",
                "file_already_imported");
        }

        var newIndexes = Enumerable.Range(0, prepared.Rows.Count).Where(i => !prepared.IsDuplicate[i]).ToList();
        var batchId = Guid.CreateVersion7();
        var accountsCreated = 0;
        var categoriesCreated = 0;

        var fileName = Path.GetFileName(prepared.FileName);
        if (fileName.Length > 260)
        {
            fileName = fileName[..260];
        }

        // Everything below runs in one transaction: a failure leaves no partial import behind.
        // The delegate may be re-run by the retry strategy, so it rebuilds all of its state each time.
        await db.ExecuteInTransactionAsync(async () =>
        {
            accountsCreated = 0;
            _categoriesCreated = 0;

            var accountIds = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
            var existingAccounts = await db.Accounts.Where(x => x.UserId == userId).Select(x => new { x.Id, x.Name }).ToListAsync(cancellationToken);
            foreach (var existing in existingAccounts)
            {
                accountIds.TryAdd(existing.Name, existing.Id);
            }

            var categoryIds = new Dictionary<CategoryKey, Guid>();
            var existingCategories = await db.Categories.Where(x => x.UserId == userId)
                .Select(x => new { x.Id, x.Type, x.ParentId, x.Name }).ToListAsync(cancellationToken);
            foreach (var existing in existingCategories)
            {
                categoryIds.TryAdd(new CategoryKey(existing.Type, existing.ParentId, existing.Name.ToLowerInvariant()), existing.Id);
            }

            var pending = new List<Transaction>(newIndexes.Count);

            foreach (var index in newIndexes)
            {
                var row = prepared.Rows[index];

                if (!accountIds.TryGetValue(row.Account, out var accountId))
                {
                    var account = new Account
                    {
                        UserId = userId,
                        Name = row.Account,
                        Type = row.Account.Contains("cash", StringComparison.OrdinalIgnoreCase) ? AccountType.Cash : AccountType.Bank,
                        Currency = row.Currency
                    };
                    db.Accounts.Add(account);
                    accountIds[row.Account] = account.Id;
                    accountId = account.Id;
                    accountsCreated++;
                }

                var rootId = ResolveCategory(userId, categoryIds, row.Type, null, row.Category);
                var categoryId = string.IsNullOrEmpty(row.Subcategory)
                    ? rootId
                    : ResolveCategory(userId, categoryIds, row.Type, rootId, row.Subcategory);

                pending.Add(new Transaction
                {
                    UserId = userId,
                    AccountId = accountId,
                    CategoryId = categoryId,
                    Type = row.Type,
                    Amount = row.Amount,
                    Currency = row.Currency,
                    OccurredAt = TimeZones.ToUtc(row.LocalTimestamp, zone),
                    Description = row.Description,
                    Note = row.Note,
                    Source = TransactionSource.Import,
                    ImportBatchId = batchId,
                    Fingerprint = prepared.Fingerprints[index]
                });
            }

            db.ImportBatches.Add(new ImportBatch
            {
                Id = batchId,
                UserId = userId,
                FileName = fileName,
                FileHash = prepared.FileHash,
                Format = prepared.Format,
                TotalRows = prepared.Rows.Count + prepared.Invalid.Count,
                ImportedRows = newIndexes.Count,
                DuplicateRows = prepared.IsDuplicate.Count(d => d),
                InvalidRows = prepared.Invalid.Count,
                Status = ImportStatus.Completed
            });

            // Accounts, categories and the batch must exist before the transactions that reference them.
            await db.SaveChangesAsync(cancellationToken);
            db.ChangeTracker.Clear();

            foreach (var chunk in pending.Chunk(InsertChunkSize))
            {
                db.Transactions.AddRange(chunk);
                await db.SaveChangesAsync(cancellationToken);
                db.ChangeTracker.Clear(); // keeps memory flat for large files
            }
        }, cancellationToken);

        categoriesCreated = _categoriesCreated;

        var batch = new ImportBatchDto(
            batchId, fileName, prepared.Format,
            prepared.Rows.Count + prepared.Invalid.Count, newIndexes.Count,
            prepared.IsDuplicate.Count(d => d), prepared.Invalid.Count,
            ImportStatus.Completed, clock.GetUtcNow());

        return new ImportResultDto(batch, accountsCreated, categoriesCreated);
    }

    public async Task<IReadOnlyList<ImportBatchDto>> ListBatchesAsync(CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var batches = await db.ImportBatches.AsNoTracking()
            .Where(b => b.UserId == userId)
            .OrderByDescending(b => b.CreatedAt)
            .ToListAsync(cancellationToken);

        return batches.Select(ToDto).ToList();
    }

    public async Task DeleteBatchAsync(Guid id, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        if (!await db.ImportBatches.AnyAsync(b => b.Id == id && b.UserId == userId, cancellationToken))
        {
            throw new NotFoundException(nameof(ImportBatch), id);
        }

        await db.ExecuteInTransactionAsync(async () =>
        {
            // IgnoreQueryFilters: also remove rows the user soft-deleted, otherwise their fingerprints
            // would keep blocking a legitimate re-import after the undo.
            await db.Transactions.IgnoreQueryFilters()
                .Where(t => t.ImportBatchId == id && t.UserId == userId)
                .ExecuteDeleteAsync(cancellationToken);

            await db.ImportBatches
                .Where(b => b.Id == id && b.UserId == userId)
                .ExecuteDeleteAsync(cancellationToken);
        }, cancellationToken);
    }

    private async Task<Prepared> PrepareAsync(ImportFileInput file, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        if (string.IsNullOrWhiteSpace(file.FileName))
        {
            throw new BusinessRuleException("The uploaded file has no name.", "invalid_file");
        }

        if (file.Length <= 0)
        {
            throw new BusinessRuleException("The uploaded file is empty.", "empty_file");
        }

        if (file.Length > options.MaxFileSizeBytes)
        {
            throw new BusinessRuleException(
                $"The file is too large. The maximum size is {options.MaxFileSizeBytes / (1024 * 1024)} MB.", "file_too_large");
        }

        var parser = parsers.FirstOrDefault(p => p.CanParse(file.FileName))
                     ?? throw new BusinessRuleException("Unsupported file type. Upload an .xlsx export.", "unsupported_file_type");

        using var buffer = new MemoryStream();
        await file.Content.CopyToAsync(buffer, cancellationToken);
        if (buffer.Length > options.MaxFileSizeBytes)
        {
            throw new BusinessRuleException("The file is too large.", "file_too_large");
        }

        buffer.Position = 0;
        var fileHash = Convert.ToHexString(await SHA256.HashDataAsync(buffer, cancellationToken)).ToLowerInvariant();

        buffer.Position = 0;
        var parsed = await parser.ParseAsync(buffer, cancellationToken);

        if (parsed.Rows.Count + parsed.Invalid.Count > options.MaxRows)
        {
            throw new BusinessRuleException(
                $"The file has more than {options.MaxRows:N0} rows. Split it into smaller files.", "too_many_rows");
        }

        var defaultCurrency = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId).Select(u => u.DefaultCurrency).FirstAsync(cancellationToken);

        var valid = new List<ParsedRow>(parsed.Rows.Count);
        var invalid = new List<InvalidRow>(parsed.Invalid);

        foreach (var row in parsed.Rows)
        {
            var normalized = row with
            {
                Currency = string.IsNullOrWhiteSpace(row.Currency) ? defaultCurrency : row.Currency.Trim().ToUpperInvariant(),
                Account = row.Account.Trim(),
                Category = row.Category.Trim(),
                Subcategory = string.IsNullOrWhiteSpace(row.Subcategory) ? null : row.Subcategory.Trim(),
                Description = string.IsNullOrWhiteSpace(row.Description) ? null : row.Description.Trim(),
                Note = string.IsNullOrWhiteSpace(row.Note) ? null : row.Note.Trim()
            };

            var problem = Validate(normalized);
            if (problem is null)
            {
                valid.Add(normalized);
            }
            else
            {
                invalid.Add(new InvalidRow(row.RowNumber, problem));
            }
        }

        var fingerprints = ImportFingerprint.ComputeAll(userId, valid);
        var existing = await LoadExistingFingerprintsAsync(userId, fingerprints, cancellationToken);

        var isDuplicate = new bool[valid.Count];
        for (var i = 0; i < fingerprints.Count; i++)
        {
            isDuplicate[i] = existing.Contains(fingerprints[i]);
        }

        return new Prepared(file.FileName, fileHash, parsed.Format, valid, fingerprints, isDuplicate,
            invalid.OrderBy(i => i.RowNumber).ToList());
    }

    /// <summary>Includes soft-deleted rows, so a row the user deleted is never silently re-imported.</summary>
    private async Task<HashSet<string>> LoadExistingFingerprintsAsync(
        Guid userId, IReadOnlyList<string> fingerprints, CancellationToken cancellationToken)
    {
        var existing = new HashSet<string>(StringComparer.Ordinal);

        foreach (var chunk in fingerprints.Chunk(LookupChunkSize))
        {
            var found = await db.Transactions.IgnoreQueryFilters().AsNoTracking()
                .Where(t => t.UserId == userId && chunk.Contains(t.Fingerprint!))
                .Select(t => t.Fingerprint!)
                .ToListAsync(cancellationToken);

            foreach (var fingerprint in found)
            {
                existing.Add(fingerprint);
            }
        }

        return existing;
    }

    private Guid ResolveCategory(
        Guid userId, Dictionary<CategoryKey, Guid> map, TransactionType type, Guid? parentId, string name)
    {
        var key = new CategoryKey(type, parentId, name.ToLowerInvariant());
        if (map.TryGetValue(key, out var id))
        {
            return id;
        }

        var category = new Category { UserId = userId, Name = name, Type = type, ParentId = parentId };
        db.Categories.Add(category);
        map[key] = category.Id;
        _categoriesCreated++;
        return category.Id;
    }

    private static string? Validate(ParsedRow row)
    {
        if (row.Amount < 0 || row.Amount > 1_000_000_000_000m)
        {
            return "Amount is out of range.";
        }

        if (row.LocalTimestamp.Year < 1970 || row.LocalTimestamp.Year > 2200)
        {
            return "Date is out of range.";
        }

        if (row.Currency.Length != 3 || !row.Currency.All(char.IsAsciiLetter))
        {
            return $"Invalid currency '{row.Currency}'.";
        }

        if (row.Account.Length is 0 or > 100)
        {
            return "Account name must be 1-100 characters.";
        }

        if (row.Category.Length is 0 or > 100)
        {
            return "Category name must be 1-100 characters.";
        }

        if (row.Subcategory is { Length: > 100 })
        {
            return "Subcategory name must be at most 100 characters.";
        }

        if (row.Description is { Length: > 500 })
        {
            return "Description must be at most 500 characters.";
        }

        if (row.Note is { Length: > 2000 })
        {
            return "Note must be at most 2000 characters.";
        }

        return null;
    }

    private static string CategoryLabelKey(TransactionType type, string? parent, string name) =>
        $"{type}|{parent}|{name}";

    private static ImportBatchDto ToDto(ImportBatch b) => new(
        b.Id, b.FileName, b.Format, b.TotalRows, b.ImportedRows, b.DuplicateRows, b.InvalidRows, b.Status, b.CreatedAt);
}
