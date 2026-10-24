using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Rules;

public sealed record RuleDto(
    Guid Id,
    string Pattern,
    RuleMatchType MatchType,
    TransactionType Type,
    Guid CategoryId,
    string CategoryName,
    string? ParentCategoryName,
    int Priority,
    bool IsActive,
    int TimesApplied,
    uint Version);

/// <summary>The pattern is stored trimmed, lower-cased and single-spaced; matching ignores case.</summary>
public sealed record CreateRuleRequest(
    string Pattern,
    RuleMatchType MatchType,
    TransactionType Type,
    Guid CategoryId,
    int Priority = 0);

public sealed record UpdateRuleRequest(
    string Pattern,
    RuleMatchType MatchType,
    Guid CategoryId,
    int Priority,
    bool IsActive,
    uint Version);

public sealed record RuleMatchDto(
    Guid RuleId,
    string Pattern,
    Guid CategoryId,
    string CategoryName,
    string? ParentCategoryName);

/// <summary><see cref="Match"/> is null when no rule matches the text.</summary>
public sealed record RuleMatchResultDto(RuleMatchDto? Match);

/// <summary>With <see cref="DryRun"/> nothing is changed; only the number of affected transactions is returned.</summary>
public sealed record ApplyRuleRequest(bool DryRun);

public sealed record ApplyRuleResultDto(int MatchedCount, int UpdatedCount);