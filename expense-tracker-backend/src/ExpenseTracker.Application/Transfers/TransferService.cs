using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Application.Accounts;
using ExpenseTracker.Domain.Entities;
using ExpenseTracker.Domain.Enums;
using ExpenseTracker.Domain.Exceptions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Transfers;

public sealed class TransferService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TimeProvider clock,
    IValidator<CreateTransferRequest> createValidator,
    IValidator<UpdateTransferRequest> updateValidator,
    IValidator<ConvertToTransferRequest> convertValidator,
    IValidator<ReconcileAccountRequest> reconcileValidator) : ITransferService
{
    public async Task<TransferResultDto> CreateAsync(CreateTransferRequest request, CancellationToken cancellationToken)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var (from, to) = await LoadAccountsAsync(userId, request.FromAccountId, request.ToAccountId, null, null, cancellationToken);
        var transferCategoryId = await GetTransferCategoryIdAsync(userId, cancellationToken);

        Guid? feeCategoryId = null;
        if (request.Fee is > 0m)
        {
            feeCategoryId = await ResolveFeeCategoryAsync(userId, request.FeeCategoryId, cancellationToken);
        }

        var groupId = Guid.CreateVersion7();
        var occurredAt = request.OccurredAt.ToUniversalTime();
        var description = Clean(request.Description);
        var note = Clean(request.Note);
        var tags = NormalizeTags(request.Tags);

        var outLeg = NewLeg(userId, groupId, from, TransactionType.TransferOut, transferCategoryId, request.Amount, occurredAt, description, note, tags);
        var inLeg = NewLeg(userId, groupId, to, TransactionType.TransferIn, transferCategoryId, request.Amount, occurredAt, description, note, tags);
        db.Transactions.AddRange(outLeg, inLeg);

        Transaction? fee = null;
        if (feeCategoryId is { } feeCategory && request.Fee is { } feeAmount)
        {
            fee = new Transaction
            {
                UserId = userId,
                AccountId = from.Id,
                CategoryId = feeCategory,
                Type = TransactionType.Expense,
                Amount = feeAmount,
                Currency = from.Currency,
                OccurredAt = occurredAt,
                Description = "Transfer fee",
                Source = TransactionSource.Manual
            };
            db.Transactions.Add(fee);
        }

        // One SaveChanges is one database transaction: both legs (and the fee) are saved together or not at all.
        await db.SaveChangesAsync(cancellationToken);

        return new TransferResultDto(await GetAsync(groupId, cancellationToken), fee?.Id);
    }

    public async Task<TransferDto> GetAsync(Guid groupId, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        var legs = await db.Transactions.AsNoTracking()
            .Where(t => t.UserId == userId && t.TransferGroupId == groupId)
            .Select(t => new
            {
                t.Id,
                t.Type,
                t.AccountId,
                AccountName = t.Account.Name,
                t.Amount,
                t.Currency,
                t.OccurredAt,
                t.Description,
                t.Note,
                t.Tags,
                t.RowVersion
            })
            .ToListAsync(cancellationToken);

        var outLeg = legs.FirstOrDefault(l => l.Type == TransactionType.TransferOut);
        var inLeg = legs.FirstOrDefault(l => l.Type == TransactionType.TransferIn);
        if (outLeg is null || inLeg is null)
        {
            throw new NotFoundException("Transfer", groupId);
        }

        return new TransferDto(
            groupId,
            outLeg.AccountId, outLeg.AccountName,
            inLeg.AccountId, inLeg.AccountName,
            outLeg.Amount, outLeg.Currency, outLeg.OccurredAt,
            outLeg.Description, outLeg.Note, outLeg.Tags,
            outLeg.Id, inLeg.Id, outLeg.RowVersion);
    }

    public async Task<TransferDto> UpdateAsync(Guid groupId, UpdateTransferRequest request, CancellationToken cancellationToken)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var legs = await db.Transactions
            .Where(t => t.UserId == userId && t.TransferGroupId == groupId)
            .ToListAsync(cancellationToken);

        var outLeg = legs.FirstOrDefault(l => l.Type == TransactionType.TransferOut);
        var inLeg = legs.FirstOrDefault(l => l.Type == TransactionType.TransferIn);
        if (outLeg is null || inLeg is null)
        {
            throw new NotFoundException("Transfer", groupId);
        }

        // Editing an old transfer must still work after one of its accounts was archived.
        var (from, to) = await LoadAccountsAsync(
            userId, request.FromAccountId, request.ToAccountId, outLeg.AccountId, inLeg.AccountId, cancellationToken);

        db.Entry(outLeg).Property(t => t.RowVersion).OriginalValue = request.Version;

        var occurredAt = request.OccurredAt.ToUniversalTime();
        var description = Clean(request.Description);
        var note = Clean(request.Note);
        var tags = NormalizeTags(request.Tags);

        Apply(outLeg, from, request.Amount, occurredAt, description, note, tags);
        Apply(inLeg, to, request.Amount, occurredAt, description, note, tags);

        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(groupId, cancellationToken);
    }

    public async Task DeleteAsync(Guid groupId, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var now = clock.GetUtcNow();

        var affected = await db.Transactions
            .Where(t => t.UserId == userId && t.TransferGroupId == groupId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(t => t.IsDeleted, true)
                .SetProperty(t => t.DeletedAt, now)
                .SetProperty(t => t.UpdatedAt, now), cancellationToken);

        if (affected == 0)
        {
            throw new NotFoundException("Transfer", groupId);
        }
    }

    public async Task<TransferDto> ConvertAsync(Guid transactionId, ConvertToTransferRequest request, CancellationToken cancellationToken)
    {
        await convertValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var original = await db.Transactions.FirstOrDefaultAsync(t => t.Id == transactionId && t.UserId == userId, cancellationToken)
                       ?? throw new NotFoundException(nameof(Transaction), transactionId);

        if (original.TransferGroupId is not null)
        {
            throw new BusinessRuleException("This entry is already part of a transfer.", "transaction_is_transfer");
        }

        var other = await db.Accounts.AsNoTracking()
                        .FirstOrDefaultAsync(a => a.Id == request.OtherAccountId && a.UserId == userId, cancellationToken)
                    ?? throw new NotFoundException(nameof(Account), request.OtherAccountId);

        if (other.Id == original.AccountId)
        {
            throw new BusinessRuleException("Choose a different account for the other side of the transfer.", "transfer_same_account");
        }

        if (other.IsArchived)
        {
            throw new BusinessRuleException("That account is archived. Choose another account.", "account_archived");
        }

        if (!string.Equals(other.Currency, original.Currency, StringComparison.OrdinalIgnoreCase))
        {
            throw new BusinessRuleException(
                "Transfers between accounts with different currencies are not supported.", "transfer_currency_mismatch");
        }

        var transferCategoryId = await GetTransferCategoryIdAsync(userId, cancellationToken);
        var groupId = Guid.CreateVersion7();

        // An expense meant money left this account (it becomes the out leg); an income meant money arrived (the in leg).
        var wasExpense = original.Type == TransactionType.Expense;

        db.Entry(original).Property(t => t.RowVersion).OriginalValue = request.Version;

        original.Type = wasExpense ? TransactionType.TransferOut : TransactionType.TransferIn;
        original.CategoryId = transferCategoryId;
        original.TransferGroupId = groupId;

        // The partner leg shares the import batch so undoing an import removes both sides.
        db.Transactions.Add(new Transaction
        {
            UserId = userId,
            AccountId = other.Id,
            CategoryId = transferCategoryId,
            Type = wasExpense ? TransactionType.TransferIn : TransactionType.TransferOut,
            Amount = original.Amount,
            Currency = original.Currency,
            OccurredAt = original.OccurredAt,
            Description = original.Description,
            Note = original.Note,
            Tags = new List<string>(original.Tags),
            Source = original.Source,
            ImportBatchId = original.ImportBatchId,
            TransferGroupId = groupId
        });

        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(groupId, cancellationToken);
    }

    public async Task<ReconcileResultDto> ReconcileAsync(Guid accountId, ReconcileAccountRequest request, CancellationToken cancellationToken)
    {
        await reconcileValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == accountId && a.UserId == userId, cancellationToken)
                      ?? throw new NotFoundException(nameof(Account), accountId);

        var movements = await AccountBalances.LoadMovementsAsync(db, userId, accountId, cancellationToken);
        var previous = account.OpeningBalance + movements.GetValueOrDefault(accountId);
        var adjustment = request.ActualBalance - previous;

        // Reports stay clean: the correction goes into the opening balance instead of a fake income/expense.
        account.OpeningBalance += adjustment;
        await db.SaveChangesAsync(cancellationToken);

        return new ReconcileResultDto(account.Id, previous, previous + adjustment, adjustment, account.OpeningBalance);
    }

    private async Task<(Account From, Account To)> LoadAccountsAsync(
        Guid userId, Guid fromId, Guid toId, Guid? currentFromId, Guid? currentToId, CancellationToken cancellationToken)
    {
        var ids = new[] { fromId, toId };
        var accounts = await db.Accounts.AsNoTracking()
            .Where(a => a.UserId == userId && ids.Contains(a.Id))
            .ToListAsync(cancellationToken);

        var from = accounts.FirstOrDefault(a => a.Id == fromId) ?? throw new NotFoundException(nameof(Account), fromId);
        var to = accounts.FirstOrDefault(a => a.Id == toId) ?? throw new NotFoundException(nameof(Account), toId);

        if (from.Id == to.Id)
        {
            throw new BusinessRuleException("Choose two different accounts.", "transfer_same_account");
        }

        if (from.IsArchived && from.Id != currentFromId)
        {
            throw new BusinessRuleException("The source account is archived. Choose another account.", "account_archived");
        }

        if (to.IsArchived && to.Id != currentToId)
        {
            throw new BusinessRuleException("The destination account is archived. Choose another account.", "account_archived");
        }

        if (!string.Equals(from.Currency, to.Currency, StringComparison.OrdinalIgnoreCase))
        {
            throw new BusinessRuleException(
                "Transfers between accounts with different currencies are not supported.", "transfer_currency_mismatch");
        }

        return (from, to);
    }

    /// <summary>The hidden system category every transfer leg uses; created the first time it is needed.</summary>
    private async Task<Guid> GetTransferCategoryIdAsync(Guid userId, CancellationToken cancellationToken)
    {
        if (await FindTransferCategoryIdAsync(userId, cancellationToken) is { } existing)
        {
            return existing;
        }

        var category = new Category
        {
            UserId = userId,
            Name = "Transfer",
            Type = TransactionType.TransferOut,
            Color = "#64748B",
            IsSystem = true
        };

        db.Categories.Add(category);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
            return category.Id;
        }
        catch (DbUpdateException)
        {
            // A concurrent request created it first (unique index); use that one.
            db.ChangeTracker.Clear();
            if (await FindTransferCategoryIdAsync(userId, cancellationToken) is { } winner)
            {
                return winner;
            }

            throw;
        }
    }

    private Task<Guid?> FindTransferCategoryIdAsync(Guid userId, CancellationToken cancellationToken) =>
        db.Categories.AsNoTracking()
            .Where(c => c.UserId == userId && c.IsSystem && c.Type == TransactionType.TransferOut)
            .Select(c => (Guid?)c.Id)
            .FirstOrDefaultAsync(cancellationToken);

    private async Task<Guid> ResolveFeeCategoryAsync(Guid userId, Guid? requestedId, CancellationToken cancellationToken)
    {
        if (requestedId is { } id)
        {
            var category = await db.Categories.AsNoTracking()
                               .FirstOrDefaultAsync(c => c.Id == id && c.UserId == userId, cancellationToken)
                           ?? throw new NotFoundException(nameof(Category), id);

            if (category.Type != TransactionType.Expense || category.IsSystem)
            {
                throw new BusinessRuleException("The fee category must be an expense category.", "fee_category_invalid");
            }

            if (category.IsArchived)
            {
                throw new BusinessRuleException("This category is archived. Choose another category.", "category_archived");
            }

            return category.Id;
        }

        var fallback = await db.Categories.AsNoTracking()
            .Where(c => c.UserId == userId
                        && c.Type == TransactionType.Expense
                        && !c.IsArchived
                        && !c.IsSystem
                        && (c.Name.ToLower().Contains("fee") || c.Name.ToLower().Contains("charge")))
            .OrderBy(c => c.Name)
            .Select(c => (Guid?)c.Id)
            .FirstOrDefaultAsync(cancellationToken);

        return fallback ?? throw new BusinessRuleException("Choose a category for the fee.", "fee_category_required");
    }

    private static Transaction NewLeg(
        Guid userId, Guid groupId, Account account, TransactionType type, Guid categoryId, decimal amount,
        DateTimeOffset occurredAt, string? description, string? note, List<string> tags) => new()
    {
        UserId = userId,
        AccountId = account.Id,
        CategoryId = categoryId,
        Type = type,
        Amount = amount,
        Currency = account.Currency,
        OccurredAt = occurredAt,
        Description = description,
        Note = note,
        Tags = new List<string>(tags),
        Source = TransactionSource.Manual,
        TransferGroupId = groupId
    };

    private static void Apply(
        Transaction leg, Account account, decimal amount, DateTimeOffset occurredAt,
        string? description, string? note, List<string> tags)
    {
        leg.AccountId = account.Id;
        leg.Currency = account.Currency;
        leg.Amount = amount;
        leg.OccurredAt = occurredAt;
        leg.Description = description;
        leg.Note = note;
        leg.Tags = new List<string>(tags);
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static List<string> NormalizeTags(List<string>? tags) =>
        tags is null
            ? []
            : tags.Select(t => t.Trim().ToLowerInvariant()).Where(t => t.Length > 0).Distinct().ToList();
}