using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Accounts;

public sealed record AccountDto(
    Guid Id,
    string Name,
    AccountType Type,
    string Currency,
    decimal OpeningBalance,
    decimal CurrentBalance,
    bool IsArchived,
    uint Version);

public sealed record CreateAccountRequest(string Name, AccountType Type, string? Currency, decimal OpeningBalance);

public sealed record UpdateAccountRequest(string Name, AccountType Type, decimal OpeningBalance, bool IsArchived, uint Version);
