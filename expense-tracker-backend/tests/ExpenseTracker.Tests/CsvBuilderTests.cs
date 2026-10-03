using System.Text;
using ExpenseTracker.Application.Exports;

namespace ExpenseTracker.Tests;

public class CsvBuilderTests
{
    [Fact]
    public void Output_starts_with_a_utf8_bom_so_excel_reads_symbols_correctly()
    {
        var bytes = CsvBuilder.Build(["A"], []);

        Assert.Equal(new byte[] { 0xEF, 0xBB, 0xBF }, bytes.Take(3).ToArray());
    }

    [Fact]
    public void Commas_quotes_and_newlines_are_escaped()
    {
        var bytes = CsvBuilder.Build(["A", "B"], [new object?[] { "hello, world", "say \"hi\"" }]);
        var text = Encoding.UTF8.GetString(bytes).TrimStart('\uFEFF');

        Assert.Equal("A,B\r\n\"hello, world\",\"say \"\"hi\"\"\"\r\n", text);
    }

    [Theory]
    [InlineData("=1+1", "'=1+1")]
    [InlineData("+cmd", "'+cmd")]
    [InlineData("-5 coffee", "'-5 coffee")]
    [InlineData("@SUM(A1)", "'@SUM(A1)")]
    [InlineData("plain text", "plain text")]
    [InlineData("", "")]
    public void Formula_injection_is_neutralised(string input, string expected)
    {
        Assert.Equal(expected, CsvBuilder.SanitizeText(input));
    }

    [Fact]
    public void Numbers_dates_and_nulls_are_formatted_invariantly()
    {
        var bytes = CsvBuilder.Build(["Amount", "When", "Empty"],
            [new object?[] { 12.5m, new DateTime(2026, 9, 30, 8, 5, 3), null }]);
        var text = Encoding.UTF8.GetString(bytes).TrimStart('\uFEFF');

        Assert.Equal("Amount,When,Empty\r\n12.50,2026-09-30 08:05:03,\r\n", text);
    }
}
