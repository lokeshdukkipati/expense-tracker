using ClosedXML.Excel;
using ExpenseTracker.Application.Imports;
using ExpenseTracker.Domain.Enums;
using ExpenseTracker.Domain.Exceptions;
using ExpenseTracker.Infrastructure.Imports;

namespace ExpenseTracker.Tests;

public class MoneyManagerXlsxParserTests
{
    private static readonly string[] Headers =
        ["Period", "Accounts", "Category", "Subcategory", "Note", "INR", "Income/Expense", "Description", "Amount", "Currency", "Accounts"];

    private static MemoryStream Workbook(Action<IXLWorksheet> fill, string[]? headers = null)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.AddWorksheet("Sheet1");
        var cols = headers ?? Headers;
        for (var i = 0; i < cols.Length; i++)
        {
            sheet.Cell(1, i + 1).Value = cols[i];
        }

        fill(sheet);

        var stream = new MemoryStream();
        workbook.SaveAs(stream);
        stream.Position = 0;
        return stream;
    }

    [Fact]
    public async Task Parses_valid_rows_and_reports_unsupported_ones()
    {
        await using var file = Workbook(sheet =>
        {
            sheet.Cell(2, 1).Value = new DateTime(2026, 9, 29, 16, 36, 35);
            sheet.Cell(2, 2).Value = "Accounts";
            sheet.Cell(2, 3).Value = "Transportation";
            sheet.Cell(2, 4).Value = "Office-Travel";
            sheet.Cell(2, 6).Value = 55.65;
            sheet.Cell(2, 7).Value = "Exp.";
            sheet.Cell(2, 8).Value = "Skyview to pg uber bike";
            sheet.Cell(2, 9).Value = 55.65;
            sheet.Cell(2, 10).Value = "INR";
            sheet.Cell(2, 11).Value = 0.7;

            sheet.Cell(3, 1).Value = new DateTime(2026, 9, 28, 15, 12, 13);
            sheet.Cell(3, 2).Value = "Accounts";
            sheet.Cell(3, 3).Value = "Salary";
            sheet.Cell(3, 7).Value = "Income";
            sheet.Cell(3, 8).Value = "October month salary";
            sheet.Cell(3, 9).Value = 27849;
            sheet.Cell(3, 10).Value = "INR";

            sheet.Cell(4, 1).Value = new DateTime(2026, 9, 27, 10, 0, 0);
            sheet.Cell(4, 7).Value = "Transfer-Out";
            sheet.Cell(4, 9).Value = 100;
        });

        var result = await new MoneyManagerXlsxParser().ParseAsync(file, CancellationToken.None);

        Assert.Equal(2, result.Rows.Count);

        var expense = result.Rows[0];
        Assert.Equal(TransactionType.Expense, expense.Type);
        Assert.Equal(55.65m, expense.Amount);
        Assert.Equal("Transportation", expense.Category);
        Assert.Equal("Office-Travel", expense.Subcategory);
        Assert.Equal("INR", expense.Currency);
        Assert.Equal(new DateTime(2026, 9, 29, 16, 36, 35), expense.LocalTimestamp);

        var income = result.Rows[1];
        Assert.Equal(TransactionType.Income, income.Type);
        Assert.Null(income.Subcategory);

        var invalid = Assert.Single(result.Invalid);
        Assert.Equal(4, invalid.RowNumber);
        Assert.Contains("Transfers", invalid.Reason);
    }

    [Fact]
    public async Task Missing_required_columns_is_a_clear_user_error()
    {
        await using var file = Workbook(_ => { }, ["Foo", "Bar"]);

        var ex = await Assert.ThrowsAsync<BusinessRuleException>(
            () => new MoneyManagerXlsxParser().ParseAsync(file, CancellationToken.None));

        Assert.Equal("unrecognized_format", ex.Code);
    }

    [Fact]
    public async Task Non_excel_content_is_reported_as_an_invalid_workbook()
    {
        await using var junk = new MemoryStream([1, 2, 3, 4, 5]);

        var ex = await Assert.ThrowsAsync<BusinessRuleException>(
            () => new MoneyManagerXlsxParser().ParseAsync(junk, CancellationToken.None));

        Assert.Equal("invalid_workbook", ex.Code);
    }

    [Fact]
    public void Only_xlsx_files_are_accepted()
    {
        var parser = new MoneyManagerXlsxParser();

        Assert.True(parser.CanParse("2026-09-29.XLSX"));
        Assert.False(parser.CanParse("export.csv"));
    }
}
