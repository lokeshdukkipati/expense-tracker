using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Application.Accounts;
using ExpenseTracker.Application.Common;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.NetWorth;

public sealed class NetWorthService(IAppDbContext db, ICurrentUser currentUser, TimeProvider clock) : INetWorthService
{
    private const int DefaultMonths = 12;
    private const int MaxMonths = 36;

    public async Task<NetWorthDto> GetAsync(int? months, string? timeZone, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var monthCount = Math.Clamp(months ?? DefaultMonths, 2, MaxMonths);
        var zone = TimeZones.Resolve(timeZone);
        var today = TimeZones.LocalDate(clock.GetUtcNow(), zone);

        var currency = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.DefaultCurrency)
            .FirstAsync(cancellationToken);

        var accounts = await db.Accounts.AsNoTracking()
            .Where(a => a.UserId == userId)
            .Select(a => new { a.Id, a.Name, a.Type, a.Currency, a.OpeningBalance, a.IsArchived })
            .ToListAsync(cancellationToken);

        var movements = await AccountBalances.LoadMovementsAsync(db, userId, null, cancellationToken);
        var balances = accounts.ToDictionary(a => a.Id, a => a.OpeningBalance + movements.GetValueOrDefault(a.Id));

        var sameCurrency = accounts
            .Where(a => string.Equals(a.Currency, currency, StringComparison.OrdinalIgnoreCase))
            .ToList();

        var assets = sameCurrency.Where(a => balances[a.Id] > 0m).Sum(a => balances[a.Id]);
        var liabilities = sameCurrency.Where(a => balances[a.Id] < 0m).Sum(a => -balances[a.Id]);
        var netWorth = assets - liabilities;

        // Archived accounts only matter while they still hold (or owe) money.
        var accountDtos = accounts
            .Where(a => !a.IsArchived || balances[a.Id] != 0m)
            .Select(a => new NetWorthAccountDto(
                a.Id, a.Name, a.Type, a.Currency, balances[a.Id], a.IsArchived,
                string.Equals(a.Currency, currency, StringComparison.OrdinalIgnoreCase)))
            .OrderByDescending(a => a.Balance)
            .ToList();

        var byType = sameCurrency
            .Where(a => !a.IsArchived || balances[a.Id] != 0m)
            .GroupBy(a => a.Type)
            .Select(g => new NetWorthTypeDto(g.Key, g.Sum(a => balances[a.Id]), g.Count()))
            .OrderByDescending(t => t.Total)
            .ToList();

        var excluded = accounts.Count(a =>
            !string.Equals(a.Currency, currency, StringComparison.OrdinalIgnoreCase) && balances[a.Id] != 0m);

        var history = await LoadHistoryAsync(userId, sameCurrency.Select(a => (a.Id, a.OpeningBalance)).ToList(),
            monthCount, today, zone, cancellationToken);

        var monthlyChange = 0m;
        decimal? monthlyChangePercent = null;
        if (history.Count >= 2)
        {
            var previous = history[^2].NetWorth;
            monthlyChange = netWorth - previous;
            monthlyChangePercent = previous != 0m
                ? decimal.Round(monthlyChange / Math.Abs(previous) * 100m, 1, MidpointRounding.AwayFromZero)
                : null;
        }

        return new NetWorthDto(
            currency, netWorth, assets, liabilities, monthlyChange, monthlyChangePercent,
            excluded, accountDtos, byType, history);
    }

    /// <summary>
    /// Month-end net worth for the last <paramref name="monthCount"/> months: each account starts from its opening balance
    /// plus everything before the window, then moves month by month.
    /// </summary>
    private async Task<List<NetWorthPointDto>> LoadHistoryAsync(
        Guid userId,
        IReadOnlyList<(Guid Id, decimal OpeningBalance)> accounts,
        int monthCount,
        DateOnly today,
        TimeZoneInfo zone,
        CancellationToken cancellationToken)
    {
        var firstMonth = new DateOnly(today.Year, today.Month, 1).AddMonths(-(monthCount - 1));
        var windowStartUtc = TimeZones.StartOfDayUtc(firstMonth, zone);
        var ids = accounts.Select(a => a.Id).ToList();

        var before = await db.Transactions.AsNoTracking()
            .Where(t => t.UserId == userId && t.OccurredAt < windowStartUtc && ids.Contains(t.AccountId))
            .GroupBy(t => new { t.AccountId, t.Type })
            .Select(g => new { g.Key.AccountId, g.Key.Type, Total = g.Sum(x => x.Amount) })
            .ToListAsync(cancellationToken);

        var inWindow = await db.Transactions.AsNoTracking()
            .Where(t => t.UserId == userId && t.OccurredAt >= windowStartUtc && ids.Contains(t.AccountId))
            .Select(t => new { t.AccountId, t.Type, t.Amount, t.OccurredAt })
            .ToListAsync(cancellationToken);

        var running = accounts.ToDictionary(a => a.Id, a => a.OpeningBalance);
        foreach (var row in before)
        {
            running[row.AccountId] += AccountBalances.IsInflow(row.Type) ? row.Total : -row.Total;
        }

        var monthly = new Dictionary<(Guid Account, int Month), decimal>();
        var firstKey = firstMonth.Year * 12 + firstMonth.Month;
        foreach (var t in inWindow)
        {
            var local = TimeZones.LocalDate(t.OccurredAt, zone);
            var index = local.Year * 12 + local.Month - firstKey;
            if (index < 0 || index >= monthCount)
            {
                continue; // dated after the current month: not part of the history
            }

            var key = (t.AccountId, index);
            monthly[key] = monthly.GetValueOrDefault(key) + (AccountBalances.IsInflow(t.Type) ? t.Amount : -t.Amount);
        }

        var history = new List<NetWorthPointDto>(monthCount);
        for (var i = 0; i < monthCount; i++)
        {
            decimal pointAssets = 0m, pointLiabilities = 0m;

            foreach (var account in accounts)
            {
                var balance = running[account.Id] + monthly.GetValueOrDefault((account.Id, i));
                running[account.Id] = balance;

                if (balance > 0m)
                {
                    pointAssets += balance;
                }
                else
                {
                    pointLiabilities -= balance;
                }
            }

            history.Add(new NetWorthPointDto(
                firstMonth.AddMonths(i + 1).AddDays(-1), pointAssets, pointLiabilities, pointAssets - pointLiabilities));
        }

        return history;
    }
}