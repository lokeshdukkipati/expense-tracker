using System.Globalization;
using System.Text;
using ExpenseTracker.Application.Imports;
using ExpenseTracker.Domain.Enums;
using ExpenseTracker.Domain.Exceptions;

namespace ExpenseTracker.Infrastructure.Imports;

/// <summary>
/// Reads CSV files with the same columns as the Excel import (and as this app's own export), so a downloaded export
/// can be re-imported. Handles a UTF-8/UTF-16 byte order mark, comma / semicolon / tab / pipe delimiters, quoted fields
/// with embedded commas, quotes and line breaks, blank lines and short rows.
/// Columns are found by header name: Period (or Date), Income/Expense (or Type) and Amount are required;
/// Accounts, Category, Subcategory, Description, Note and Currency are optional.
/// </summary>
public sealed class CsvImportParser : IImportParser
{
    private const int AbsoluteMaxRows = 200_000;
    private const string DefaultAccount = "Cash";
    private const string DefaultCategory = "Other";

    private static readonly char[] Delimiters = [',', ';', '\t', '|'];

    private static readonly string[] DateFormats =
    [
        "yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd HH:mm", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd",
        "dd/MM/yyyy HH:mm:ss", "dd/MM/yyyy HH:mm", "dd/MM/yyyy",
        "dd-MM-yyyy HH:mm:ss", "dd-MM-yyyy HH:mm", "dd-MM-yyyy"
    ];

    public string FormatName => "Csv";

    public bool CanParse(string fileName) => fileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase);

    public Task<ParseResult> ParseAsync(Stream content, CancellationToken cancellationToken)
    {
        string text;
        using (var reader = new StreamReader(content, new UTF8Encoding(false), detectEncodingFromByteOrderMarks: true, leaveOpen: true))
        {
            text = reader.ReadToEnd();
        }

        // A NUL character means this is a binary file renamed to .csv.
        if (text.Contains('\0'))
        {
            throw new BusinessRuleException("The file does not look like a CSV text file.", "invalid_csv");
        }

        return Task.FromResult(Parse(text, cancellationToken));
    }

    private ParseResult Parse(string text, CancellationToken cancellationToken)
    {
        var records = ReadRecords(text, DetectDelimiter(text), cancellationToken);
        if (records.Count == 0)
        {
            throw new BusinessRuleException("The file is empty.", "empty_file");
        }

        var columns = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < records[0].Fields.Length; i++)
        {
            columns.TryAdd(records[0].Fields[i].Trim().Trim('\uFEFF'), i);
        }

        var periodColumn = Find(columns, "Period", "Date", "Date & Time", "Datetime", "Timestamp");
        var typeColumn = Find(columns, "Income/Expense", "Type", "Transaction Type");
        var amountColumn = Find(columns, "Amount");

        var missing = new List<string>();
        if (periodColumn is null) missing.Add("Period");
        if (typeColumn is null) missing.Add("Income/Expense");
        if (amountColumn is null) missing.Add("Amount");
        if (missing.Count > 0)
        {
            throw new BusinessRuleException(
                $"Unrecognised file layout. Missing column(s): {string.Join(", ", missing)}.", "unrecognized_format");
        }

        var accountColumn = Find(columns, "Accounts", "Account");
        var categoryColumn = Find(columns, "Category");
        var subcategoryColumn = Find(columns, "Subcategory", "Sub category", "Sub-category");
        var noteColumn = Find(columns, "Note", "Notes");
        var descriptionColumn = Find(columns, "Description", "Memo");
        var currencyColumn = Find(columns, "Currency");

        var rows = new List<ParsedRow>();
        var invalid = new List<InvalidRow>();

        for (var r = 1; r < records.Count; r++)
        {
            var (line, fields) = records[r];

            var timestamp = ParseDate(Get(fields, periodColumn));
            if (timestamp is null)
            {
                invalid.Add(new InvalidRow(line, "Date is missing or not recognised."));
                continue;
            }

            var rawType = Get(fields, typeColumn);
            var type = MapType(rawType);
            if (type is null)
            {
                var reason = rawType.Trim().StartsWith("transfer", StringComparison.OrdinalIgnoreCase)
                    ? "Transfers between accounts are not supported yet."
                    : $"Unknown type '{rawType.Trim()}'. Expected Income or Exp.";
                invalid.Add(new InvalidRow(line, reason));
                continue;
            }

            var amount = ParseAmount(Get(fields, amountColumn));
            if (amount is null)
            {
                invalid.Add(new InvalidRow(line, "Amount is missing or not a number."));
                continue;
            }

            if (amount < 0)
            {
                invalid.Add(new InvalidRow(line, "Amount cannot be negative."));
                continue;
            }

            rows.Add(new ParsedRow(
                RowNumber: line,
                LocalTimestamp: timestamp.Value,
                Type: type.Value,
                Amount: amount.Value,
                Currency: Optional(fields, currencyColumn) ?? string.Empty,
                Account: Optional(fields, accountColumn) ?? DefaultAccount,
                Category: Optional(fields, categoryColumn) ?? DefaultCategory,
                Subcategory: Optional(fields, subcategoryColumn),
                Description: Optional(fields, descriptionColumn),
                Note: Optional(fields, noteColumn)));
        }

        return new ParseResult(FormatName, rows, invalid);
    }

    // ---------------------------------------------------------------- tokenizer

    /// <summary>Splits CSV text into records. Each record remembers the line it started on.</summary>
    internal static List<(int Line, string[] Fields)> ReadRecords(string text, char delimiter, CancellationToken cancellationToken)
    {
        var records = new List<(int Line, string[] Fields)>();
        var fields = new List<string>();
        var field = new StringBuilder();
        var inQuotes = false;
        var line = 1;
        var recordStart = 1;

        void EndRecord()
        {
            fields.Add(field.ToString());
            field.Clear();

            // Blank lines are skipped.
            if (!(fields.Count == 1 && fields[0].Trim().Length == 0))
            {
                if (records.Count > AbsoluteMaxRows)
                {
                    throw new BusinessRuleException(
                        $"The file has more than {AbsoluteMaxRows:N0} rows. Split it into smaller files.", "too_many_rows");
                }

                records.Add((recordStart, fields.ToArray()));
            }

            fields.Clear();
        }

        for (var i = 0; i < text.Length; i++)
        {
            if ((i & 0x3FFF) == 0)
            {
                cancellationToken.ThrowIfCancellationRequested();
            }

            var c = text[i];

            if (inQuotes)
            {
                if (c == '"')
                {
                    if (i + 1 < text.Length && text[i + 1] == '"')
                    {
                        field.Append('"');
                        i++;
                    }
                    else
                    {
                        inQuotes = false;
                    }
                }
                else
                {
                    if (c == '\n' || (c == '\r' && !(i + 1 < text.Length && text[i + 1] == '\n')))
                    {
                        line++;
                    }

                    field.Append(c);
                }

                continue;
            }

            if (c == '"' && field.Length == 0)
            {
                inQuotes = true;
            }
            else if (c == delimiter)
            {
                fields.Add(field.ToString());
                field.Clear();
            }
            else if (c == '\r' || c == '\n')
            {
                if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n')
                {
                    i++;
                }

                EndRecord();
                line++;
                recordStart = line;
            }
            else
            {
                field.Append(c);
            }
        }

        if (inQuotes)
        {
            throw new BusinessRuleException("The CSV file has a quoted value that is never closed.", "invalid_csv");
        }

        if (field.Length > 0 || fields.Count > 0)
        {
            EndRecord();
        }

        return records;
    }

    /// <summary>Picks the delimiter that appears most often in the header line (outside quotes).</summary>
    internal static char DetectDelimiter(string text)
    {
        var counts = new int[Delimiters.Length];
        var inQuotes = false;

        foreach (var c in text)
        {
            if (c == '"')
            {
                inQuotes = !inQuotes;
            }
            else if (!inQuotes && (c == '\n' || c == '\r'))
            {
                if (counts.Any(n => n > 0))
                {
                    break;
                }
            }
            else if (!inQuotes)
            {
                var index = Array.IndexOf(Delimiters, c);
                if (index >= 0)
                {
                    counts[index]++;
                }
            }
        }

        var best = 0;
        for (var i = 1; i < counts.Length; i++)
        {
            if (counts[i] > counts[best])
            {
                best = i;
            }
        }

        return counts[best] == 0 ? ',' : Delimiters[best];
    }

    // ---------------------------------------------------------------- values

    private static int? Find(Dictionary<string, int> columns, params string[] names)
    {
        foreach (var name in names)
        {
            if (columns.TryGetValue(name, out var column))
            {
                return column;
            }
        }

        return null;
    }

    private static string Get(string[] fields, int? column) =>
        column is { } c && c < fields.Length ? fields[c] : string.Empty;

    private static string? Optional(string[] fields, int? column)
    {
        var value = Get(fields, column).Trim();
        return value.Length == 0 ? null : value;
    }

    private static TransactionType? MapType(string raw) =>
        raw.Trim().TrimEnd('.').ToLowerInvariant() switch
        {
            "exp" or "expense" or "expenses" or "debit" or "dr" or "withdrawal" => TransactionType.Expense,
            "income" or "inc" or "credit" or "cr" or "deposit" => TransactionType.Income,
            _ => null
        };

    internal static DateTime? ParseDate(string raw)
    {
        var text = raw.Trim();
        if (text.Length == 0)
        {
            return null;
        }

        DateTime value;
        if (DateTime.TryParseExact(text, DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var exact))
        {
            value = exact;
        }
        else if (DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var loose))
        {
            // The wall-clock time as written (any offset in the text is ignored: the time zone is chosen at import).
            value = loose.DateTime;
        }
        else
        {
            return null;
        }

        // Round to the nearest whole second so the duplicate fingerprint is stable.
        var ticks = value.Ticks + TimeSpan.TicksPerSecond / 2;
        return new DateTime(ticks - ticks % TimeSpan.TicksPerSecond, DateTimeKind.Unspecified);
    }

    /// <summary>Understands 1234.56, 1,234.56, 1.234,56, 1 234,56, ₹1,23,456, (500) and -500.</summary>
    internal static decimal? ParseAmount(string raw)
    {
        var text = raw.Trim();
        if (text.Length == 0)
        {
            return null;
        }

        var negative = text.Contains('-') || (text.StartsWith('(') && text.EndsWith(')'));
        var digits = new string(text.Where(ch => char.IsAsciiDigit(ch) || ch == '.' || ch == ',').ToArray());
        if (!digits.Any(char.IsAsciiDigit))
        {
            return null;
        }

        var lastDot = digits.LastIndexOf('.');
        var lastComma = digits.LastIndexOf(',');
        string normalized;

        if (lastDot >= 0 && lastComma >= 0)
        {
            normalized = lastDot > lastComma
                ? digits.Replace(",", string.Empty)
                : digits.Replace(".", string.Empty).Replace(',', '.');
        }
        else if (lastComma >= 0)
        {
            // "1,234" and "1,23,456" are thousands separators; "12,5" and "1234,56" are decimal commas.
            var afterLast = digits.Length - lastComma - 1;
            var thousands = digits.Count(ch => ch == ',') > 1 || afterLast == 3;
            normalized = thousands ? digits.Replace(",", string.Empty) : digits.Replace(',', '.');
        }
        else if (digits.Count(ch => ch == '.') > 1)
        {
            normalized = digits.Replace(".", string.Empty);
        }
        else
        {
            normalized = digits;
        }

        if (!decimal.TryParse(normalized, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var value) || value >= 1e15m)
        {
            return null;
        }

        value = Math.Round(value, 2, MidpointRounding.AwayFromZero);
        return negative ? -value : value;
    }
}