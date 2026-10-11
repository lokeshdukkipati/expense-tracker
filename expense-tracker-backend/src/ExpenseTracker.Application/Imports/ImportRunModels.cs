using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Imports;

/// <summary>
/// How aggressively rows are treated as duplicates of transactions you already have.
/// Exact: every field identical. Smart: also the same time (to the second), type, amount and currency, even if
/// text, category or account were edited. Loose: also the same day, type, amount and currency.
/// </summary>
public enum ImportMatchMode
{
    Exact = 1,
    Smart = 2,
    Loose = 3
}

/// <summary>Maps names found in the file to existing accounts/categories. Category keys are "Type|Name".</summary>
public sealed record ImportMappings(Dictionary<string, Guid>? Accounts, Dictionary<string, Guid>? Categories)
{
    public static string CategoryKey(TransactionType type, string name) => $"{type}|{name.Trim()}";
}

public sealed record ImportRunOptions(
    string? TimeZone = null,
    ImportMatchMode MatchMode = ImportMatchMode.Smart,
    ImportMappings? Mappings = null);

/// <summary>Why a row was classed as a duplicate.</summary>
public sealed record DuplicateMatch(string Kind, string Reason);