using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Domain.Entities;
using ExpenseTracker.Domain.Enums;
using ExpenseTracker.Domain.Exceptions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Accounts;

public sealed class AccountService(
    IAppDbContext db,
    ICurrentUser currentUser,
    IValidator<CreateAccountRequest> createValidator,
    IValidator<UpdateAccountRequest> updateValidator) : IAccountService
{
    public async Task<IReadOnlyList<AccountDto>> ListAsync(bool includeArchived, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        var query = db.Accounts.AsNoTracking().Where(a => a.UserId == userId);
        if (!includeArchived)
        {
            query = query.Where(a => !a.IsArchived);
        }

        var accounts = await query.OrderBy(a => a.Name).ToListAsync(cancellationToken);
        var movements = await LoadMovementsAsync(userId, null, cancellationToken);

        return accounts.Select(a => ToDto(a, movements.GetValueOrDefault(a.Id))).ToList();
    }

    public async Task<AccountDto> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var account = await db.Accounts.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, cancellationToken)
                      ?? throw new NotFoundException(nameof(Account), id);

        var movements = await LoadMovementsAsync(userId, id, cancellationToken);
        return ToDto(account, movements.GetValueOrDefault(id));
    }

    public async Task<AccountDto> CreateAsync(CreateAccountRequest request, CancellationToken cancellationToken)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var name = request.Name.Trim();
        await EnsureNameAvailableAsync(userId, name, null, cancellationToken);

        var currency = request.Currency?.Trim();
        if (string.IsNullOrWhiteSpace(currency))
        {
            currency = await db.Users.Where(u => u.Id == userId).Select(u => u.DefaultCurrency).FirstAsync(cancellationToken);
        }

        var account = new Account
        {
            UserId = userId,
            Name = name,
            Type = request.Type,
            Currency = currency,
            OpeningBalance = request.OpeningBalance
        };

        db.Accounts.Add(account);
        await db.SaveChangesAsync(cancellationToken);

        return ToDto(account, 0m);
    }

    public async Task<AccountDto> UpdateAsync(Guid id, UpdateAccountRequest request, CancellationToken cancellationToken)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, cancellationToken)
                      ?? throw new NotFoundException(nameof(Account), id);

        var name = request.Name.Trim();
        await EnsureNameAvailableAsync(userId, name, id, cancellationToken);

        // Optimistic concurrency: fails with 409 when someone else changed the row since the client read it.
        db.Entry(account).Property(a => a.RowVersion).OriginalValue = request.Version;

        account.Name = name;
        account.Type = request.Type;
        account.OpeningBalance = request.OpeningBalance;
        account.IsArchived = request.IsArchived;

        await db.SaveChangesAsync(cancellationToken);

        var movements = await LoadMovementsAsync(userId, id, cancellationToken);
        return ToDto(account, movements.GetValueOrDefault(id));
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var account = await db.Accounts.FirstOrDefaultAsync(a => a.Id == id && a.UserId == userId, cancellationToken)
                      ?? throw new NotFoundException(nameof(Account), id);

        // Soft-deleted transactions still reference the account, so they count too.
        var inUse = await db.Transactions.IgnoreQueryFilters()
            .AnyAsync(t => t.AccountId == id && t.UserId == userId, cancellationToken);

        if (inUse)
        {
            throw new BusinessRuleException(
                "This account has transactions and cannot be deleted. Archive it instead.", "account_in_use");
        }

        db.Accounts.Remove(account);
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task EnsureNameAvailableAsync(Guid userId, string name, Guid? excludeId, CancellationToken cancellationToken)
    {
        var lower = name.ToLowerInvariant();
        var exists = await db.Accounts.AnyAsync(
            a => a.UserId == userId && a.Name.ToLower() == lower && (excludeId == null || a.Id != excludeId),
            cancellationToken);

        if (exists)
        {
            throw new ConflictException($"An account named '{name}' already exists.", "account_name_taken");
        }
    }

    /// <summary>Net movement per account: income minus expenses of non-deleted transactions.</summary>
    private async Task<Dictionary<Guid, decimal>> LoadMovementsAsync(Guid userId, Guid? accountId, CancellationToken cancellationToken)
    {
        var rows = await db.Transactions.AsNoTracking()
            .Where(t => t.UserId == userId && (accountId == null || t.AccountId == accountId))
            .GroupBy(t => new { t.AccountId, t.Type })
            .Select(g => new { g.Key.AccountId, g.Key.Type, Total = g.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);

        var result = new Dictionary<Guid, decimal>();
        foreach (var row in rows)
        {
            var signed = row.Type == TransactionType.Income ? row.Total : -row.Total;
            result[row.AccountId] = result.GetValueOrDefault(row.AccountId) + signed;
        }

        return result;
    }

    private static AccountDto ToDto(Account a, decimal movement) => new(
        a.Id, a.Name, a.Type, a.Currency, a.OpeningBalance, a.OpeningBalance + movement, a.IsArchived, a.RowVersion);
}
