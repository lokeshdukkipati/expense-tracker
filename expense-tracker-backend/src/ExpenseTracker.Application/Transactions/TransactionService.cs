using System.Linq.Expressions;
using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Application.Common;
using ExpenseTracker.Domain.Entities;
using ExpenseTracker.Domain.Exceptions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Transactions;

public sealed class TransactionService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TimeProvider clock,
    IValidator<TransactionQuery> queryValidator,
    IValidator<CreateTransactionRequest> createValidator,
    IValidator<UpdateTransactionRequest> updateValidator,
    IValidator<BulkDeleteRequest> bulkDeleteValidator) : ITransactionService
{
    private static readonly Expression<Func<Transaction, TransactionDto>> Projection = t => new TransactionDto(
        t.Id,
        t.AccountId,
        t.Account.Name,
        t.CategoryId,
        t.Category.Name,
        t.Category.ParentId,
        t.Category.Parent == null ? null : t.Category.Parent.Name,
        t.Type,
        t.Amount,
        t.Currency,
        t.OccurredAt,
        t.Description,
        t.Note,
        t.Tags,
        t.Source,
        t.CreatedAt,
        t.RowVersion,
        t.TransferGroupId,
        null,
        null);

    public async Task<PagedResult<TransactionDto>> QueryAsync(TransactionQuery query, CancellationToken cancellationToken)
    {
        await queryValidator.ValidateAndThrowAsync(query, cancellationToken);

        var userId = currentUser.UserId;
        var zone = TimeZones.Resolve(query.TimeZone);

        var filtered = db.Transactions.AsNoTracking().ApplyFilter(query, userId, zone);

        // A transfer is stored as two rows (one per account) but should read as one line. Without an account filter the
        // incoming side is hidden; viewing a single account still shows that account's own side.
        if (query.AccountId is null)
        {
            filtered = filtered.Where(t => t.Type != ExpenseTracker.Domain.Enums.TransactionType.TransferIn);
        }

        var total = await filtered.CountAsync(cancellationToken);

        var descending = !string.Equals(query.SortDir, "asc", StringComparison.OrdinalIgnoreCase);
        var items = await Sort(filtered, query.SortBy, descending)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(Projection)
            .ToListAsync(cancellationToken);

        await AttachTransferCounterpartsAsync(items, userId, cancellationToken);

        return new PagedResult<TransactionDto>(items, query.Page, query.PageSize, total);
    }

    public async Task<TransactionDto> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var dto = await db.Transactions.AsNoTracking()
                      .Where(t => t.Id == id && t.UserId == userId)
                      .Select(Projection)
                      .FirstOrDefaultAsync(cancellationToken)
                  ?? throw new NotFoundException(nameof(Transaction), id);

        var single = new List<TransactionDto> { dto };
        await AttachTransferCounterpartsAsync(single, userId, cancellationToken);
        return single[0];
    }

    public async Task<TransactionDto> CreateAsync(CreateTransactionRequest request, CancellationToken cancellationToken)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var (account, _) = await LoadReferencesAsync(userId, request.AccountId, request.CategoryId, request.Type, cancellationToken);

        var transaction = new Transaction
        {
            UserId = userId,
            AccountId = account.Id,
            CategoryId = request.CategoryId,
            Type = request.Type,
            Amount = request.Amount,
            Currency = account.Currency,
            OccurredAt = request.OccurredAt.ToUniversalTime(),
            Description = Clean(request.Description),
            Note = Clean(request.Note),
            Tags = NormalizeTags(request.Tags),
            Source = ExpenseTracker.Domain.Enums.TransactionSource.Manual
        };

        db.Transactions.Add(transaction);
        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(transaction.Id, cancellationToken);
    }

    public async Task<TransactionDto> UpdateAsync(Guid id, UpdateTransactionRequest request, CancellationToken cancellationToken)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var transaction = await db.Transactions.FirstOrDefaultAsync(t => t.Id == id && t.UserId == userId, cancellationToken)
                          ?? throw new NotFoundException(nameof(Transaction), id);

        if (transaction.TransferGroupId is not null)
        {
            throw new BusinessRuleException(
                "This entry is part of a transfer. Edit it from the transfer screen instead.", "transaction_is_transfer");
        }

        // Editing a historical transaction must still work after its account or category was archived.
        var (account, _) = await LoadReferencesAsync(
            userId, request.AccountId, request.CategoryId, request.Type, cancellationToken,
            transaction.AccountId, transaction.CategoryId);

        db.Entry(transaction).Property(t => t.RowVersion).OriginalValue = request.Version;

        transaction.AccountId = account.Id;
        transaction.CategoryId = request.CategoryId;
        transaction.Type = request.Type;
        transaction.Amount = request.Amount;
        transaction.Currency = account.Currency;
        transaction.OccurredAt = request.OccurredAt.ToUniversalTime();
        transaction.Description = Clean(request.Description);
        transaction.Note = Clean(request.Note);
        transaction.Tags = NormalizeTags(request.Tags);
        // Source and Fingerprint are deliberately untouched: they keep re-imports of this row detectable.

        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var now = clock.GetUtcNow();

        // Both legs of a transfer go together so balances never end up one-sided.
        var groupId = await db.Transactions.AsNoTracking()
            .Where(t => t.Id == id && t.UserId == userId)
            .Select(t => t.TransferGroupId)
            .FirstOrDefaultAsync(cancellationToken);

        var affected = await db.Transactions
            .Where(t => t.UserId == userId && (t.Id == id || (groupId != null && t.TransferGroupId == groupId)))
            .ExecuteUpdateAsync(s => s
                .SetProperty(t => t.IsDeleted, true)
                .SetProperty(t => t.DeletedAt, now)
                .SetProperty(t => t.UpdatedAt, now), cancellationToken);

        if (affected == 0)
        {
            throw new NotFoundException(nameof(Transaction), id);
        }
    }

    public async Task<BulkDeleteResult> BulkDeleteAsync(BulkDeleteRequest request, CancellationToken cancellationToken)
    {
        await bulkDeleteValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var now = clock.GetUtcNow();
        var ids = request.Ids.Distinct().ToList();

        // A selected transfer leg takes its partner leg with it (so the deleted count can exceed the selection).
        var groupIds = await db.Transactions.AsNoTracking()
            .Where(t => t.UserId == userId && ids.Contains(t.Id) && t.TransferGroupId != null)
            .Select(t => t.TransferGroupId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);

        var affected = await db.Transactions
            .Where(t => t.UserId == userId
                        && (ids.Contains(t.Id) || (t.TransferGroupId != null && groupIds.Contains(t.TransferGroupId.Value))))
            .ExecuteUpdateAsync(s => s
                .SetProperty(t => t.IsDeleted, true)
                .SetProperty(t => t.DeletedAt, now)
                .SetProperty(t => t.UpdatedAt, now), cancellationToken);

        return new BulkDeleteResult(affected);
    }

    /// <summary>
    /// Fills in the other side of each transfer leg (so a row can read "Bank → Cash"),
    /// using one extra query for the whole page.
    /// </summary>
    private async Task AttachTransferCounterpartsAsync(
        List<TransactionDto> items, Guid userId, CancellationToken cancellationToken)
    {
        var groupIds = items
            .Where(i => i.TransferGroupId is not null)
            .Select(i => i.TransferGroupId!.Value)
            .Distinct()
            .ToList();

        if (groupIds.Count == 0)
        {
            return;
        }

        var legs = await db.Transactions.AsNoTracking()
            .Where(t => t.UserId == userId && t.TransferGroupId != null && groupIds.Contains(t.TransferGroupId.Value))
            .Select(t => new { t.Id, GroupId = t.TransferGroupId!.Value, t.AccountId, AccountName = t.Account.Name })
            .ToListAsync(cancellationToken);

        for (var i = 0; i < items.Count; i++)
        {
            var item = items[i];
            if (item.TransferGroupId is not { } transferGroupId)
            {
                continue;
            }

            var other = legs.FirstOrDefault(l => l.GroupId == transferGroupId && l.Id != item.Id);
            if (other is not null)
            {
                items[i] = item with { TransferAccountId = other.AccountId, TransferAccountName = other.AccountName };
            }
        }
    }

    private async Task<(Account Account, Category Category)> LoadReferencesAsync(
        Guid userId, Guid accountId, Guid categoryId, ExpenseTracker.Domain.Enums.TransactionType type,
        CancellationToken cancellationToken, Guid? currentAccountId = null, Guid? currentCategoryId = null)
    {
        var account = await db.Accounts.AsNoTracking()
                          .FirstOrDefaultAsync(a => a.Id == accountId && a.UserId == userId, cancellationToken)
                      ?? throw new NotFoundException(nameof(Account), accountId);

        var category = await db.Categories.AsNoTracking()
                           .FirstOrDefaultAsync(c => c.Id == categoryId && c.UserId == userId, cancellationToken)
                       ?? throw new NotFoundException(nameof(Category), categoryId);

        if (account.IsArchived && account.Id != currentAccountId)
        {
            throw new BusinessRuleException("This account is archived. Choose another account.", "account_archived");
        }

        if (category.IsArchived && category.Id != currentCategoryId)
        {
            throw new BusinessRuleException("This category is archived. Choose another category.", "category_archived");
        }

        if (category.Type != type)
        {
            throw new BusinessRuleException(
                $"The selected category is an {category.Type} category and cannot be used for an {type} transaction.",
                "category_type_mismatch");
        }

        return (account, category);
    }

    private static IOrderedQueryable<Transaction> Sort(IQueryable<Transaction> query, string? sortBy, bool descending) =>
        sortBy?.ToLowerInvariant() switch
        {
            "amount" => descending
                ? query.OrderByDescending(t => t.Amount).ThenByDescending(t => t.Id)
                : query.OrderBy(t => t.Amount).ThenBy(t => t.Id),
            _ => descending
                ? query.OrderByDescending(t => t.OccurredAt).ThenByDescending(t => t.Id)
                : query.OrderBy(t => t.OccurredAt).ThenBy(t => t.Id)
        };

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static List<string> NormalizeTags(List<string>? tags) =>
        tags is null
            ? []
            : tags.Select(t => t.Trim().ToLowerInvariant()).Where(t => t.Length > 0).Distinct().ToList();
}
