using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Accounts;

/// <summary>
/// The single definition of how transactions move an account's balance, so the account list,
/// reconcile, goals and net worth can never disagree with each other.
/// </summary>
public static class AccountBalances
{
    /// <summary>True when the transaction type adds money to the account it belongs to.</summary>
    public static bool IsInflow(TransactionType type) => type is TransactionType.Income or TransactionType.TransferIn;

    /// <summary>Net movement per account (inflows minus outflows) over all non-deleted transactions.</summary>
    public static async Task<Dictionary<Guid, decimal>> LoadMovementsAsync(
        IAppDbContext db, Guid userId, Guid? accountId, CancellationToken cancellationToken)
    {
        var rows = await db.Transactions.AsNoTracking()
            .Where(t => t.UserId == userId && (accountId == null || t.AccountId == accountId))
            .GroupBy(t => new { t.AccountId, t.Type })
            .Select(g => new { g.Key.AccountId, g.Key.Type, Total = g.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);

        var result = new Dictionary<Guid, decimal>();
        foreach (var row in rows)
        {
            var signed = IsInflow(row.Type) ? row.Total : -row.Total;
            result[row.AccountId] = result.GetValueOrDefault(row.AccountId) + signed;
        }

        return result;
    }
}