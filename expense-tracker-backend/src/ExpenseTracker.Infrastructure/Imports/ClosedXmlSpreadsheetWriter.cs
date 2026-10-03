using ClosedXML.Excel;
using ExpenseTracker.Application.Exports;

namespace ExpenseTracker.Infrastructure.Imports;

public sealed class ClosedXmlSpreadsheetWriter : ISpreadsheetWriter
{
    public byte[] WriteXlsx(string sheetName, IReadOnlyList<string> headers, IReadOnlyList<object?[]> rows)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add(sheetName);

        for (var column = 0; column < headers.Count; column++)
        {
            var header = sheet.Cell(1, column + 1);
            header.Value = headers[column];
            header.Style.Font.Bold = true;
        }

        for (var r = 0; r < rows.Count; r++)
        {
            var values = rows[r];
            for (var c = 0; c < values.Length; c++)
            {
                var cell = sheet.Cell(r + 2, c + 1);
                switch (values[c])
                {
                    case null:
                        break;
                    case DateTime dateTime:
                        cell.Value = dateTime;
                        cell.Style.DateFormat.Format = "yyyy-mm-dd hh:mm:ss";
                        break;
                    case decimal amount:
                        cell.Value = (double)amount;
                        cell.Style.NumberFormat.Format = "#,##0.00";
                        break;
                    case int number:
                        cell.Value = number;
                        break;
                    case string text:
                        // Text starting with = + - @ would be run as a formula by Excel (formula injection).
                        cell.Value = CsvBuilder.SanitizeText(text);
                        break;
                    default:
                        cell.Value = CsvBuilder.SanitizeText(values[c]?.ToString() ?? string.Empty);
                        break;
                }
            }
        }

        sheet.SheetView.FreezeRows(1);
        sheet.Columns().AdjustToContents(1, Math.Min(rows.Count + 1, 1000));

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }
}
