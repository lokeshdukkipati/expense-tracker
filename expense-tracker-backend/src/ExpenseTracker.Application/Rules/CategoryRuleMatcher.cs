using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Rules;

/// <summary>A rule reduced to what matching needs, shared by import, quick-add and the rules screen.</summary>
public sealed record RuleCandidate(
    Guid Id,
    string Pattern,
    RuleMatchType MatchType,
    TransactionType Type,
    int Priority,
    Guid CategoryId);

/// <summary>
/// Pure matching logic (no database). Patterns are stored trimmed, lower-cased and single-spaced,
/// and the text being matched is normalised the same way, so matching is case-insensitive.
/// </summary>
public static class CategoryRuleMatcher
{
    /// <summary>Trims, collapses whitespace and lower-cases.</summary>
    public static string Normalize(string? value) =>
        string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : string.Join(' ', value.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).ToLowerInvariant();

    /// <summary>Lower priority numbers first; for equal priority the more specific (longer) pattern wins.</summary>
    public static IReadOnlyList<RuleCandidate> Order(IEnumerable<RuleCandidate> rules) =>
        rules.OrderBy(r => r.Priority)
            .ThenByDescending(r => r.Pattern.Length)
            .ThenBy(r => r.Pattern, StringComparer.Ordinal)
            .ToList();

    public static bool IsMatch(RuleMatchType matchType, string pattern, string normalizedText)
    {
        if (pattern.Length == 0)
        {
            return false;
        }

        return matchType switch
        {
            RuleMatchType.StartsWith => normalizedText.StartsWith(pattern, StringComparison.Ordinal),
            RuleMatchType.Equals => string.Equals(normalizedText, pattern, StringComparison.Ordinal),
            _ => normalizedText.Contains(pattern, StringComparison.Ordinal)
        };
    }

    /// <summary>The first rule (in <paramref name="orderedRules"/> order) of this type that matches the text, or null.</summary>
    public static RuleCandidate? FindFirst(IReadOnlyList<RuleCandidate> orderedRules, TransactionType type, string? text)
    {
        var normalized = Normalize(text);
        if (normalized.Length == 0)
        {
            return null;
        }

        foreach (var rule in orderedRules)
        {
            if (rule.Type == type && IsMatch(rule.MatchType, rule.Pattern, normalized))
            {
                return rule;
            }
        }

        return null;
    }
}