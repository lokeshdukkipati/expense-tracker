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
    private const int PreviewNewRows = 200;
    private const int PreviewDuplicateRows = 200;
    private const int PreviewInvalidRows = 500;
    private const int PreviewWarnings = 200;
    private const int MaxMappings = 5_000;

    private int _categoriesCreated;

    private readonly record struct CategoryKey(TransactionType Type, Guid? ParentId, string Name);

    private sealed record Prepared(
        string FileName,
        string FileHash,
        string Format,
        IReadOnlyList<ParsedRow> Rows,
        IReadOnlyList<string> Fingerprints,
        DuplicateMatch?[] Matches,
        IReadOnlyList<InvalidRow> Invalid,
        IReadOnlyList<ImportWarningDto> Warnings,
        ImportMatchMode MatchMode,
        TimeZoneInfo Zone)
    {
        public int DuplicateCount => Matches.Count(m => m is not null);

        public List<int> NewIndexes() =>
            Enumerable.Range(0, Rows.Count).Where(i => Matches[i] is null).ToList();
    }

    public async Task<ImportPreviewDto> PreviewAsync(ImportFileInput file, ImportRunOptions run, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var prepared = await PrepareAsync(file, run, cancellationToken);

        var previous = await db.ImportBatches.AsNoTracking()
            .FirstOrDefaultAsync(b => b.UserId == userId && b.FileHash == prepared.FileHash, cancellationToken);

        var newRows = prepared.NewIndexes().Select(i => prepared.Rows[i]).ToList();

        var accounts = await db.Accounts.AsNoTracking()
            .Where(a => a.UserId == userId)
            .Select(a => new { a.Id, a.Name })
            .ToListAsync(cancellationToken);
        var accountIdByName = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        foreach (var account in accounts)
        {
            accountIdByName.TryAdd(account.Name, account.Id);
        }

        var categories = await db.Categories.AsNoTracking()
            .Where(c => c.UserId == userId)
            .Select(c => new { c.Id, c.Type, c.Name, c.ParentId, ParentName = c.Parent == null ? null : c.Parent.Name })
            .ToListAsync(cancellationToken);

        var rootIdByKey = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
        var knownCategoryKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var category in categories)
        {
            knownCategoryKeys.Add(CategoryLabelKey(category.Type, category.ParentName, category.Name));
            if (category.ParentId is null)
            {
                rootIdByKey.TryAdd($"{category.Type}|{category.Name}", category.Id);
            }
        }

        var fileAccounts = newRows
            .GroupBy(r => r.Account, StringComparer.OrdinalIgnoreCase)
            .Select(g => new FileAccountDto(g.First().Account, g.Count(), Lookup(accountIdByName, g.Key)))
            .OrderByDescending(a => a.Rows)
            .ThenBy(a => a.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var fileCategories = newRows
            .GroupBy(r => $"{r.Type}|{r.Category}", StringComparer.OrdinalIgnoreCase)
            .Select(g =>
            {
                var head = g.First();
                return new FileCategoryDto(head.Type, head.Category, g.Count(), Lookup(rootIdByKey, g.Key));
            })
            .OrderByDescending(c => c.Rows)
            .ThenBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

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

        var duplicates = new List<DuplicateRowDto>();
        for (var i = 0; i < prepared.Rows.Count && duplicates.Count < PreviewDuplicateRows; i++)
        {
            if (prepared.Matches[i] is { } match)
            {
                var r = prepared.Rows[i];
                duplicates.Add(new DuplicateRowDto(r.RowNumber, r.LocalTimestamp, r.Type, r.Amount, r.Currency, r.Description, match.Reason));
            }
        }

        return new ImportPreviewDto(
            FileName: prepared.FileName,
            FileHash: prepared.FileHash,
            Format: prepared.Format,
            TotalRows: prepared.Rows.Count + prepared.Invalid.Count,
            NewRows: newRows.Count,
            DuplicateRows: prepared.DuplicateCount,
            InvalidRows: prepared.Invalid.Count,
            FileAlreadyImported: previous is not null,
            PreviousImport: previous is null ? null : ToDto(previous),
            FirstDate: first,
            LastDate: last,
            NewIncomeTotal: newRows.Where(r => r.Type == TransactionType.Income).Sum(r => r.Amount),
            NewExpenseTotal: newRows.Where(r => r.Type == TransactionType.Expense).Sum(r => r.Amount),
            NewAccounts: fileAccounts.Where(a => a.MatchedAccountId is null).Select(a => a.Name).ToList(),
            NewCategories: newCategories.ToList(),
            SampleNewRows: newRows.Take(PreviewNewRows)
                .Select(r => new ImportRowSampleDto(r.RowNumber, r.LocalTimestamp, r.Type, r.Amount, r.Currency,
                    r.Account, r.Category, r.Subcategory, r.Description))
                .ToList(),
            InvalidSamples: prepared.Invalid.Take(PreviewInvalidRows).Select(i => new InvalidRowDto(i.RowNumber, i.Reason)).ToList(),
            MatchMode: prepared.MatchMode,
            WarningRows: prepared.Warnings.Count,
            DuplicateSamples: duplicates,
            Warnings: prepared.Warnings.Take(PreviewWarnings).ToList(),
            FileAccounts: fileAccounts,
            FileCategories: fileCategories);
    }

    public async Task<ImportResultDto> ImportAsync(ImportFileInput file, ImportRunOptions run, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var mappings = run.Mappings;
        if ((mappings?.Accounts?.Count ?? 0) + (mappings?.Categories?.Count ?? 0) > MaxMappings)
        {
            throw new BusinessRuleException("Too many column mappings were supplied.", "invalid_mapping");
        }

        var prepared = await PrepareAsync(file, run, cancellationToken);

        var previous = await db.ImportBatches.AsNoTracking()
            .FirstOrDefaultAsync(b => b.UserId == userId && b.FileHash == prepared.FileHash, cancellationToken);
        if (previous is not null)
        {
            throw new ConflictException(
                $"This exact file was already imported on {previous.CreatedAt:yyyy-MM-dd HH:mm} UTC. Nothing was changed.",
                "file_already_imported");
        }

        var newIndexes = prepared.NewIndexes();
        var duplicateCount = prepared.DuplicateCount;
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
            var accountArchived = new Dictionary<Guid, bool>();
            var existingAccounts = await db.Accounts.Where(x => x.UserId == userId)
                .Select(x => new { x.Id, x.Name, x.IsArchived }).ToListAsync(cancellationToken);
            foreach (var existing in existingAccounts)
            {
                accountIds.TryAdd(existing.Name, existing.Id);
                accountArchived[existing.Id] = existing.IsArchived;
            }

            var categoryIds = new Dictionary<CategoryKey, Guid>();
            var categoryInfo = new Dictionary<Guid, (TransactionType Type, Guid? ParentId, bool Archived)>();
            var existingCategories = await db.Categories.Where(x => x.UserId == userId)
                .Select(x => new { x.Id, x.Type, x.ParentId, x.Name, x.IsArchived }).ToListAsync(cancellationToken);
            foreach (var existing in existingCategories)
            {
                categoryIds.TryAdd(new CategoryKey(existing.Type, existing.ParentId, existing.Name.ToLowerInvariant()), existing.Id);
                categoryInfo[existing.Id] = (existing.Type, existing.ParentId, existing.IsArchived);
            }

            // Validate the user's explicit mappings against what they really own.
            var accountMap = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
            if (mappings?.Accounts is { Count: > 0 } accountMappings)
            {
                foreach (var (name, id) in accountMappings)
                {
                    if (!accountArchived.TryGetValue(id, out var archived))
                    {
                        throw new BusinessRuleException("One of the mapped accounts does not exist.", "invalid_mapping");
                    }

                    if (archived)
                    {
                        throw new BusinessRuleException("A mapped account is archived. Choose another account.", "invalid_mapping");
                    }

                    accountMap[name.Trim()] = id;
                }
            }

            var categoryMap = new Dictionary<string, Guid>(StringComparer.OrdinalIgnoreCase);
            if (mappings?.Categories is { Count: > 0 } categoryMappings)
            {
                foreach (var (key, id) in categoryMappings)
                {
                    var separator = key.IndexOf('|');
                    if (separator <= 0 || !Enum.TryParse<TransactionType>(key[..separator], true, out var mappedType) || !Enum.IsDefined(mappedType))
                    {
                        throw new BusinessRuleException("A category mapping is not valid.", "invalid_mapping");
                    }

                    if (!categoryInfo.TryGetValue(id, out var info))
                    {
                        throw new BusinessRuleException("One of the mapped categories does not exist.", "invalid_mapping");
                    }

                    if (info.Archived)
                    {
                        throw new BusinessRuleException("A mapped category is archived. Choose another category.", "invalid_mapping");
                    }

                    if (info.Type != mappedType)
                    {
                        throw new BusinessRuleException("A category can only be mapped to a category of the same type.", "invalid_mapping");
                    }

                    categoryMap[ImportMappings.CategoryKey(mappedType, key[(separator + 1)..])] = id;
                }
            }

            var pending = new List<Transaction>(newIndexes.Count);

            foreach (var index in newIndexes)
            {
                var row = prepared.Rows[index];

                if (!accountMap.TryGetValue(row.Account, out var accountId) && !accountIds.TryGetValue(row.Account, out accountId))
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

                Guid categoryId;
                if (categoryMap.TryGetValue(ImportMappings.CategoryKey(row.Type, row.Category), out var mappedId))
                {
                    // Mapped onto a subcategory: use it as is. Mapped onto a top-level category: keep the file's subcategory under it.
                    categoryId = categoryInfo[mappedId].ParentId is not null || string.IsNullOrEmpty(row.Subcategory)
                        ? mappedId
                        : ResolveCategory(userId, categoryIds, row.Type, mappedId, row.Subcategory);
                }
                else
                {
                    var rootId = ResolveCategory(userId, categoryIds, row.Type, null, row.Category);
                    categoryId = string.IsNullOrEmpty(row.Subcategory)
                        ? rootId
                        : ResolveCategory(userId, categoryIds, row.Type, rootId, row.Subcategory);
                }

                pending.Add(new Transaction
                {
                    UserId = userId,
                    AccountId = accountId,
                    CategoryId = categoryId,
                    Type = row.Type,
                    Amount = row.Amount,
                    Currency = row.Currency,
                    OccurredAt = TimeZones.ToUtc(row.LocalTimestamp, prepared.Zone),
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
                DuplicateRows = duplicateCount,
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
            duplicateCount, prepared.Invalid.Count,
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

    private async Task<Prepared> PrepareAsync(ImportFileInput file, ImportRunOptions run, CancellationToken cancellationToken)
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

        if (!Enum.IsDefined(run.MatchMode))
        {
            throw new BusinessRuleException("Unknown duplicate matching mode.", "invalid_match_mode");
        }

        var zone = TimeZones.Resolve(run.TimeZone);

        var parser = parsers.FirstOrDefault(p => p.CanParse(file.FileName))
                     ?? throw new BusinessRuleException("Unsupported file type. Upload an .xlsx or .csv file.", "unsupported_file_type");

        using var buffer = new MemoryStream();
        await file.Content.CopyToAsync(buffer, cancellationToken);
        if (buffer.Length == 0)
        {
            throw new BusinessRuleException("The uploaded file is empty.", "empty_file");
        }

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
        var warnings = new List<ImportWarningDto>();
        var futureLimit = clock.GetUtcNow().UtcDateTime.AddDays(2);

        foreach (var row in parsed.Rows)
        {
            var normalized = row with
            {
                Currency = string.IsNullOrWhiteSpace(row.Currency) ? defaultCurrency : row.Currency.Trim().ToUpperInvariant(),
                Account = (ImportTextFitter.Clean(row.Account) ?? string.Empty).Trim(),
                Category = (ImportTextFitter.Clean(row.Category) ?? string.Empty).Trim(),
                Subcategory = Tidy(ImportTextFitter.Clean(row.Subcategory)),
                Description = Tidy(ImportTextFitter.Clean(row.Description)),
                Note = Tidy(ImportTextFitter.Clean(row.Note))
            };

            // Long text is kept (description cut, remainder moved to the note) instead of rejecting the row.
            var fitted = ImportTextFitter.Fit(normalized);
            var shortened = !ReferenceEquals(fitted, normalized);
            normalized = fitted;

            var problem = Validate(normalized);
            if (problem is not null)
            {
                invalid.Add(new InvalidRow(row.RowNumber, problem));
                continue;
            }

            valid.Add(normalized);

            if (shortened)
            {
                warnings.Add(new ImportWarningDto(row.RowNumber, "Long text was shortened; the rest was moved to the note."));
            }

            if (normalized.Amount == 0m)
            {
                warnings.Add(new ImportWarningDto(row.RowNumber, "The amount is zero."));
            }

            if (normalized.LocalTimestamp > futureLimit)
            {
                warnings.Add(new ImportWarningDto(row.RowNumber, "The date is in the future."));
            }

            if (normalized.LocalTimestamp.Year < 2000)
            {
                warnings.Add(new ImportWarningDto(row.RowNumber, "The date is before the year 2000."));
            }
        }

        var fingerprints = ImportFingerprint.ComputeAll(userId, valid);
        var existing = await LoadExistingFingerprintsAsync(userId, fingerprints, cancellationToken);

        IReadOnlyList<ExistingTransaction> candidates = [];
        if (run.MatchMode != ImportMatchMode.Exact && valid.Count > 0 && existing.Count < valid.Count)
        {
            var startUtc = TimeZones.ToUtc(valid.Min(r => r.LocalTimestamp).Date.AddDays(-1), zone);
            var endUtc = TimeZones.ToUtc(valid.Max(r => r.LocalTimestamp).Date.AddDays(2), zone);

            var inRange = await db.Transactions.IgnoreQueryFilters().AsNoTracking()
                .Where(t => t.UserId == userId && t.OccurredAt >= startUtc && t.OccurredAt < endUtc)
                .Select(t => new { t.OccurredAt, t.Type, t.Amount, t.Currency, t.Fingerprint, t.Description })
                .ToListAsync(cancellationToken);

            // Rows already matched by fingerprint must not also be used to excuse another file row.
            candidates = inRange
                .Where(t => t.Fingerprint is null || !existing.Contains(t.Fingerprint))
                .Select(t => new ExistingTransaction(t.OccurredAt, t.Type, t.Amount, t.Currency, t.Description))
                .ToList();
        }

        var matches = DuplicateMatcher.Match(valid, fingerprints, existing, candidates, run.MatchMode, zone);

        return new Prepared(file.FileName, fileHash, parsed.Format, valid, fingerprints, matches,
            invalid.OrderBy(i => i.RowNumber).ToList(), warnings, run.MatchMode, zone);
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

    private static string? Tidy(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static Guid? Lookup(Dictionary<string, Guid> map, string key) => map.TryGetValue(key, out var id) ? id : null;

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

        return null;
    }

    private static string CategoryLabelKey(TransactionType type, string? parent, string name) =>
        $"{type}|{parent}|{name}";

    private static ImportBatchDto ToDto(ImportBatch b) => new(
        b.Id, b.FileName, b.Format, b.TotalRows, b.ImportedRows, b.DuplicateRows, b.InvalidRows, b.Status, b.CreatedAt);
}