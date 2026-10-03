using System.Globalization;
using System.Text;

namespace ExpenseTracker.Application.Exports;

public static class CsvBuilder
{
    /// <summary>Builds a UTF-8 (with BOM, so Excel shows symbols such as the rupee sign correctly) CSV document.</summary>
    public static byte[] Build(IReadOnlyList<string> headers, IEnumerable<object?[]> rows)
    {
        var sb = new StringBuilder();
        sb.AppendJoin(',', headers.Select(h => Escape(h))).Append("\r\n");

        foreach (var row in rows)
        {
            sb.AppendJoin(',', row.Select(cell => Escape(Format(cell)))).Append("\r\n");
        }

        var preamble = new UTF8Encoding(encoderShouldEmitUTF8Identifier: true).GetPreamble();
        var body = Encoding.UTF8.GetBytes(sb.ToString());
        return [.. preamble, .. body];
    }

    /// <summary>
    /// Neutralises spreadsheet formula injection: a text cell that starts with = + - @ (or a control character)
    /// would otherwise be executed as a formula when the file is opened in Excel.
    /// </summary>
    public static string SanitizeText(string value) =>
        value.Length > 0 && value[0] is '=' or '+' or '-' or '@' or '\t' or '\r'
            ? "'" + value
            : value;

    private static string Format(object? cell) => cell switch
    {
        null => string.Empty,
        DateTime dt => dt.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
        DateTimeOffset dto => dto.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
        decimal d => d.ToString("F2", CultureInfo.InvariantCulture),
        IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
        string s => SanitizeText(s),
        _ => SanitizeText(cell.ToString() ?? string.Empty)
    };

    private static string Escape(string value)
    {
        if (value.IndexOfAny([',', '"', '\r', '\n']) < 0)
        {
            return value;
        }

        return "\"" + value.Replace("\"", "\"\"") + "\"";
    }
}
