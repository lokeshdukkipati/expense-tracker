using System.Globalization;
using System.IO.Compression;
using ClosedXML.Excel;
using ExpenseTracker.Application.Imports;
using ExpenseTracker.Domain.Enums;
using ExpenseTracker.Domain.Exceptions;

namespace ExpenseTracker.Infrastructure.Imports;

/// <summary>
/// Reads the "Money Manager" style export: one header row, then one transaction per row.
/// Columns are located by header name (first occurrence wins, so the duplicated trailing "Accounts" column is ignored):
/// Period, Accounts, Category, Subcategory, Note, Income/Expense, Description, Amount, Currency.
/// Only Period, Income/Expense and Amount are mandatory.
/// </summary>
public sealed class MoneyManagerXlsxParser : IImportParser
{
    private const int AbsoluteMaxRows = 200_000;
    private const int MaxArchiveEntries = 5_000;
    private const long MaxUnpackedBytes = 300L * 1024 * 1024;
    private const string DefaultAccount = "Cash";
    private const string DefaultCategory = "Other";

    private static readonly string[] DateFormats =
    [
        "yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd HH:mm", "yyyy-MM-dd",
        "dd/MM/yyyy HH:mm:ss", "dd/MM/yyyy HH:mm", "dd/MM/yyyy"
    ];

    public string FormatName => "MoneyManagerXlsx";

    public bool CanParse(string fileName) => fileName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase);

    public Task<ParseResult> ParseAsync(Stream content, CancellationToken cancellationToken)
    {
        try
        {
            return Task.FromResult(Parse(content, cancellationToken));
        }
        catch (Exception ex) when (ex is not OperationCanceledException and not AppException)
        {
            // Corrupt or non-Excel content: report it as a user error, never as a server fault.
            throw new BusinessRuleException("The file could not be read as an Excel workbook (.xlsx).", "invalid_workbook");
        }
    }

    private ParseResult Parse(Stream content, CancellationToken cancellationToken)
    {
        GuardArchive(content);
        using var workbook = new XLWorkbook(content);

        var sheet = workbook.Worksheets.FirstOrDefault()
                    ?? throw new BusinessRuleException("The workbook has no sheets.", "empty_file");
        var headerRow = sheet.FirstRowUsed()
                        ?? throw new BusinessRuleException("The sheet is empty.", "empty_file");
        var lastRow = sheet.LastRowUsed()?.RowNumber() ?? headerRow.RowNumber();

        var columns = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var cell in headerRow.CellsUsed())
        {
            columns.TryAdd(cell.GetString().Trim(), cell.Address.ColumnNumber);
        }

        var periodColumn = Find(columns, "Period", "Date");
        var typeColumn = Find(columns, "Income/Expense", "Type");
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
        var subcategoryColumn = Find(columns, "Subcategory");
        var noteColumn = Find(columns, "Note");
        var descriptionColumn = Find(columns, "Description");
        var currencyColumn = Find(columns, "Currency");

        if (lastRow - headerRow.RowNumber() > AbsoluteMaxRows)
        {
            throw new BusinessRuleException(
                $"The sheet has more than {AbsoluteMaxRows:N0} rows. Split it into smaller files.", "too_many_rows");
        }

        var rows = new List<ParsedRow>();
        var invalid = new List<InvalidRow>();

        for (var rowNumber = headerRow.RowNumber() + 1; rowNumber <= lastRow; rowNumber++)
        {
            if (rowNumber % 1000 == 0)
            {
                cancellationToken.ThrowIfCancellationRequested();
            }

            var row = sheet.Row(rowNumber);
            if (row.IsEmpty())
            {
                continue;
            }

            var timestamp = ReadDate(sheet.Cell(rowNumber, periodColumn!.Value));
            if (timestamp is null)
            {
                invalid.Add(new InvalidRow(rowNumber, "Date is missing or not recognised."));
                continue;
            }

            var rawType = sheet.Cell(rowNumber, typeColumn!.Value).GetString();
            var type = MapType(rawType);
            if (type is null)
            {
                var reason = rawType.Trim().StartsWith("transfer", StringComparison.OrdinalIgnoreCase)
                    ? $"Unknown transfer type '{rawType.Trim()}'. Expected Transfer-Out or Transfer-In."
                    : $"Unknown type '{rawType.Trim()}'. Expected Income, Exp., Transfer-Out or Transfer-In.";
                invalid.Add(new InvalidRow(rowNumber, reason));
                continue;
            }

            var amount = ReadDecimal(sheet.Cell(rowNumber, amountColumn!.Value));
            if (amount is null)
            {
                invalid.Add(new InvalidRow(rowNumber, "Amount is missing or not a number."));
                continue;
            }

            if (amount < 0)
            {
                invalid.Add(new InvalidRow(rowNumber, "Amount cannot be negative."));
                continue;
            }

            rows.Add(new ParsedRow(
                RowNumber: rowNumber,
                LocalTimestamp: timestamp.Value,
                Type: type.Value,
                Amount: amount.Value,
                Currency: Text(sheet, rowNumber, currencyColumn) ?? string.Empty,
                Account: Text(sheet, rowNumber, accountColumn) ?? DefaultAccount,
                Category: Text(sheet, rowNumber, categoryColumn)
                          ?? (type is TransactionType.TransferOut or TransactionType.TransferIn ? string.Empty : DefaultCategory),
                Subcategory: Text(sheet, rowNumber, subcategoryColumn),
                Description: Text(sheet, rowNumber, descriptionColumn),
                Note: Text(sheet, rowNumber, noteColumn)));
        }

        return new ParseResult(FormatName, rows, invalid);
    }

    /// <summary>An .xlsx is a zip. Reject anything else, and zip bombs that would unpack into something huge.</summary>
    private static void GuardArchive(Stream content)
    {
        try
        {
            content.Position = 0;
            using var archive = new ZipArchive(content, ZipArchiveMode.Read, leaveOpen: true);

            if (archive.Entries.Count > MaxArchiveEntries)
            {
                throw new BusinessRuleException("The workbook contains too many parts.", "file_too_large");
            }

            long total = 0;
            foreach (var entry in archive.Entries)
            {
                total += entry.Length;
                if (total > MaxUnpackedBytes)
                {
                    throw new BusinessRuleException("The workbook is too large once unpacked.", "file_too_large");
                }
            }
        }
        catch (InvalidDataException)
        {
            throw new BusinessRuleException("The file is not a valid .xlsx workbook.", "invalid_workbook");
        }
        finally
        {
            content.Position = 0;
        }
    }

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

    private static string? Text(IXLWorksheet sheet, int row, int? column)
    {
        if (column is null)
        {
            return null;
        }

        var value = sheet.Cell(row, column.Value).GetString().Trim();
        return value.Length == 0 ? null : value;
    }

    private static TransactionType? MapType(string raw) =>
        raw.Trim().TrimEnd('.').ToLowerInvariant() switch
        {
            "exp" or "expense" or "expenses" => TransactionType.Expense,
            "income" or "inc" => TransactionType.Income,
            "transfer-out" or "transfer out" or "transfer_out" or "transferout" => TransactionType.TransferOut,
            "transfer-in" or "transfer in" or "transfer_in" or "transferin" => TransactionType.TransferIn,
            _ => null
        };

    private static DateTime? ReadDate(IXLCell cell)
    {
        if (cell.IsEmpty())
        {
            return null;
        }

        DateTime? value = null;

        if (cell.DataType == XLDataType.DateTime)
        {
            value = cell.GetDateTime();
        }
        else if (cell.DataType == XLDataType.Number)
        {
            var serial = cell.GetDouble();
            if (serial is > 0 and < 2_958_466)
            {
                value = DateTime.FromOADate(serial);
            }
        }
        else
        {
            var text = cell.GetString().Trim();
            if (DateTime.TryParseExact(text, DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var exact))
            {
                value = exact;
            }
            else if (DateTime.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.None, out var loose))
            {
                value = loose;
            }
        }

        if (value is null)
        {
            return null;
        }

        // Round to the nearest whole second: spreadsheet floating-point noise must not change the duplicate fingerprint.
        var ticks = value.Value.Ticks + TimeSpan.TicksPerSecond / 2;
        return new DateTime(ticks - ticks % TimeSpan.TicksPerSecond, DateTimeKind.Unspecified);
    }

    private static decimal? ReadDecimal(IXLCell cell)
    {
        if (cell.IsEmpty())
        {
            return null;
        }

        if (cell.DataType == XLDataType.Number)
        {
            var number = cell.GetDouble();
            return double.IsFinite(number) && Math.Abs(number) < 1e15
                ? Math.Round((decimal)number, 2, MidpointRounding.AwayFromZero)
                : null;
        }

        var text = cell.GetString().Replace(",", string.Empty).Trim();
        return decimal.TryParse(text, NumberStyles.Number | NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var parsed)
               && Math.Abs(parsed) < 1e15m
            ? Math.Round(parsed, 2, MidpointRounding.AwayFromZero)
            : null;
    }
}
