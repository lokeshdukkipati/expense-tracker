using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.NetWorth;

/// <summary>
/// Everything you own minus everything you owe, built only from this app's accounts.
/// Accounts in a currency other than the user's default currency are listed but left out of the totals.
/// </summary>
public sealed record NetWorthDto(
    string Currency,
    decimal NetWorth,
    decimal Assets,
    decimal Liabilities,
    decimal MonthlyChange,
    decimal? MonthlyChangePercent,
    int ExcludedAccounts,
    IReadOnlyList<NetWorthAccountDto> Accounts,
    IReadOnlyList<NetWorthTypeDto> ByType,
    IReadOnlyList<NetWorthPointDto> History);

public sealed record NetWorthAccountDto(
    Guid Id,
    string Name,
    AccountType Type,
    string Currency,
    decimal Balance,
    bool IsArchived,
    bool IncludedInTotal);

public sealed record NetWorthTypeDto(AccountType Type, decimal Total, int Accounts);

/// <summary>Month-end position. Assets are positive balances, liabilities are negative balances (as a positive number).</summary>
public sealed record NetWorthPointDto(DateOnly MonthEnd, decimal Assets, decimal Liabilities, decimal NetWorth);