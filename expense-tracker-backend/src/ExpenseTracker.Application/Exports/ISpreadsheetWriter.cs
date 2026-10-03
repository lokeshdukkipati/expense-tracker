namespace ExpenseTracker.Application.Exports;

public interface ISpreadsheetWriter
{
    /// <summary>Cell values may be string, decimal, DateTime, int or null.</summary>
    byte[] WriteXlsx(string sheetName, IReadOnlyList<string> headers, IReadOnlyList<object?[]> rows);
}
