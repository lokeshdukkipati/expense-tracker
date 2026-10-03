using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace ExpenseTracker.Application.Imports;

/// <summary>
/// Stable identity for an imported row. Two rows produce the same fingerprint when they describe the same
/// transaction: same user, timestamp (to the second), type, amount, currency, account, category and text.
/// Text is compared case-insensitively with whitespace collapsed, so cosmetic differences do not create duplicates.
/// Rows that are genuinely identical within one file get an occurrence counter so none of them is lost.
/// </summary>
public static partial class ImportFingerprint
{
    private const char Separator = '\u001F';

    public static IReadOnlyList<string> ComputeAll(Guid userId, IReadOnlyList<ParsedRow> rows)
    {
        var occurrences = new Dictionary<string, int>(StringComparer.Ordinal);
        var result = new List<string>(rows.Count);

        foreach (var row in rows)
        {
            var key = BuildKey(userId, row);
            occurrences.TryGetValue(key, out var seen);
            occurrences[key] = seen + 1;

            result.Add(Hash($"{key}{Separator}{seen}"));
        }

        return result;
    }

    public static string BuildKey(Guid userId, ParsedRow row) =>
        string.Join(Separator,
            userId.ToString("N"),
            row.LocalTimestamp.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture),
            row.Type.ToString(),
            row.Amount.ToString("F2", CultureInfo.InvariantCulture),
            row.Currency.Trim().ToUpperInvariant(),
            Normalize(row.Account),
            Normalize(row.Category),
            Normalize(row.Subcategory),
            Normalize(row.Description),
            Normalize(row.Note));

    public static string Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        return WhitespaceRegex().Replace(value.Trim(), " ").ToLowerInvariant();
    }

    private static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhitespaceRegex();
}
