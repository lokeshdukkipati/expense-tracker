using ExpenseTracker.Application.Common;
using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Imports;

/// <summary>A stored transaction that file rows may be compared with.</summary>
public sealed record ExistingTransaction(DateTimeOffset OccurredAt, TransactionType Type, decimal Amount, string Currency, string? Description);

/// <summary>
/// Decides which file rows are duplicates. Pure logic (no database) so it is easy to test.
/// Phase 1 is the exact fingerprint. Phases 2 and 3 compare against <paramref name="candidates"/>, which must not
/// contain transactions that were already matched by fingerprint. Matching is count-aware: one existing transaction
/// can excuse only one file row, so genuine repeat purchases are never swallowed.
/// </summary>
public static class DuplicateMatcher
{
    private readonly record struct MatchKey(long Stamp, TransactionType Type, long Cents, string Currency);

    private sealed class Slot(string? description)
    {
        public int Count { get; set; } = 1;

        public string? Description { get; } = description;
    }

    public static DuplicateMatch?[] Match(
        IReadOnlyList<ParsedRow> rows,
        IReadOnlyList<string> fingerprints,
        IReadOnlySet<string> existingFingerprints,
        IReadOnlyList<ExistingTransaction> candidates,
        ImportMatchMode mode,
        TimeZoneInfo zone)
    {
        var result = new DuplicateMatch?[rows.Count];

        for (var i = 0; i < rows.Count; i++)
        {
            if (existingFingerprints.Contains(fingerprints[i]))
            {
                result[i] = new DuplicateMatch("Exact", "Identical to a transaction you already have.");
            }
        }

        if (mode == ImportMatchMode.Exact || candidates.Count == 0)
        {
            return result;
        }

        var smart = mode == ImportMatchMode.Smart;
        var pool = new Dictionary<MatchKey, Slot>();

        foreach (var c in candidates)
        {
            var stamp = smart ? c.OccurredAt.ToUnixTimeSeconds() : TimeZones.LocalDate(c.OccurredAt, zone).DayNumber;
            var key = new MatchKey(stamp, c.Type, Cents(c.Amount), c.Currency.ToUpperInvariant());

            if (pool.TryGetValue(key, out var slot))
            {
                slot.Count++;
            }
            else
            {
                pool[key] = new Slot(c.Description);
            }
        }

        for (var i = 0; i < rows.Count; i++)
        {
            if (result[i] is not null)
            {
                continue;
            }

            var row = rows[i];
            var stamp = smart
                ? TimeZones.ToUtc(row.LocalTimestamp, zone).ToUnixTimeSeconds()
                : DateOnly.FromDateTime(row.LocalTimestamp).DayNumber;
            var key = new MatchKey(stamp, row.Type, Cents(row.Amount), row.Currency.ToUpperInvariant());

            if (pool.TryGetValue(key, out var slot) && slot.Count > 0)
            {
                slot.Count--;
                var when = smart ? "time" : "day";
                var existing = string.IsNullOrWhiteSpace(slot.Description) ? string.Empty : $" (\u201C{Shorten(slot.Description)}\u201D)";
                result[i] = new DuplicateMatch(smart ? "Smart" : "Loose", $"Same {when}, type and amount as an existing transaction{existing}.");
            }
        }

        return result;
    }

    private static long Cents(decimal amount) => (long)decimal.Round(amount * 100m, 0, MidpointRounding.AwayFromZero);

    private static string Shorten(string text) => text.Length <= 40 ? text : text[..39] + "…";
}