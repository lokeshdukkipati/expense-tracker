using ExpenseTracker.Domain.Enums;

namespace ExpenseTracker.Application.Imports;

/// <summary>
/// Turns the transfer rows of a file into one row per transfer: type TransferOut, <c>Account</c> = the source account
/// and <c>Category</c> = the destination account. Pure logic (no database).
/// Exports differ: some list a transfer as two rows (Transfer-Out and Transfer-In), others as one row naming the
/// other account in the Category column. Both are handled here.
/// </summary>
public static class TransferRowPairer
{
    private const string NoPartnerReason =
        "Transfer row has no matching row for the other account, and no other account is named. Import it as an expense or income, then convert it to a transfer.";

    private readonly record struct Key(DateTime Timestamp, long Cents, string Currency);

    /// <summary>Returns the rows with transfers merged; rows that cannot be placed are added to <paramref name="invalid"/>.</summary>
    public static IReadOnlyList<ParsedRow> Pair(IReadOnlyList<ParsedRow> rows, List<InvalidRow> invalid)
    {
        if (!rows.Any(r => r.Type is TransactionType.TransferOut or TransactionType.TransferIn))
        {
            return rows;
        }

        var result = new List<ParsedRow>(rows.Count);
        var outRows = new List<ParsedRow>();
        var inRowsByKey = new Dictionary<Key, List<ParsedRow>>();

        foreach (var row in rows)
        {
            if (row.Type == TransactionType.TransferOut)
            {
                outRows.Add(row);
            }
            else if (row.Type == TransactionType.TransferIn)
            {
                var key = KeyOf(row);
                if (!inRowsByKey.TryGetValue(key, out var list))
                {
                    list = new List<ParsedRow>();
                    inRowsByKey[key] = list;
                }

                list.Add(row);
            }
            else
            {
                result.Add(row);
            }
        }

        foreach (var outRow in outRows)
        {
            var partner = TakePartner(inRowsByKey, outRow);
            if (partner is not null)
            {
                // The partner row's own account is the authoritative destination.
                result.Add(outRow with
                {
                    Category = partner.Account,
                    Description = outRow.Description ?? partner.Description,
                    Note = outRow.Note ?? partner.Note
                });
            }
            else if (HasCounterpart(outRow))
            {
                result.Add(outRow);
            }
            else
            {
                invalid.Add(new InvalidRow(outRow.RowNumber, NoPartnerReason));
            }
        }

        // Incoming rows nobody claimed: the source account is named in the Category column.
        foreach (var unclaimed in inRowsByKey.Values.SelectMany(list => list))
        {
            if (HasCounterpart(unclaimed))
            {
                result.Add(unclaimed with
                {
                    Type = TransactionType.TransferOut,
                    Account = unclaimed.Category,
                    Category = unclaimed.Account
                });
            }
            else
            {
                invalid.Add(new InvalidRow(unclaimed.RowNumber, NoPartnerReason));
            }
        }

        return result.OrderBy(r => r.RowNumber).ToList();
    }

    private static ParsedRow? TakePartner(Dictionary<Key, List<ParsedRow>> inRowsByKey, ParsedRow outRow)
    {
        if (!inRowsByKey.TryGetValue(KeyOf(outRow), out var candidates))
        {
            return null;
        }

        var partner =
            candidates.FirstOrDefault(c => !SameName(c.Account, outRow.Account)
                                           && (SameName(outRow.Category, c.Account) || SameName(c.Category, outRow.Account)))
            ?? candidates.FirstOrDefault(c => !SameName(c.Account, outRow.Account));

        if (partner is not null)
        {
            candidates.Remove(partner);
        }

        return partner;
    }

    private static Key KeyOf(ParsedRow row) => new(
        row.LocalTimestamp,
        (long)decimal.Round(row.Amount * 100m, 0, MidpointRounding.AwayFromZero),
        row.Currency.Trim().ToUpperInvariant());

    private static bool HasCounterpart(ParsedRow row) =>
        !string.IsNullOrWhiteSpace(row.Category) && !SameName(row.Category, row.Account);

    private static bool SameName(string? a, string? b) =>
        string.Equals(a?.Trim(), b?.Trim(), StringComparison.OrdinalIgnoreCase);
}