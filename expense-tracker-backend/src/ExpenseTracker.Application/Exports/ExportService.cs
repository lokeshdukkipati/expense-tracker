using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Application.Common;
using ExpenseTracker.Application.Transactions;
using ExpenseTracker.Domain.Enums;
using ExpenseTracker.Domain.Exceptions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Exports;

public sealed class ExportService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TimeProvider clock,
    ISpreadsheetWriter spreadsheetWriter,
    IValidator<TransactionFilter> filterValidator) : IExportService
{
    private const int MaxRows = 200_000;

    // Same layout as the importable file: an export can be opened in the tools the data came from.
    private static readonly string[] Headers =
    [
        "Period", "Accounts", "Category", "Subcategory", "Note", "Income/Expense",
        "Description", "Amount", "Currency", "Tags", "Source"
    ];

    public async Task<ExportResult> ExportTransactionsAsync(TransactionFilter filter, ExportFormat format, CancellationToken cancellationToken)
    {
        await filterValidator.ValidateAndThrowAsync(filter, cancellationToken);

        var userId = currentUser.UserId;
        var zone = TimeZones.Resolve(filter.TimeZone);
        var query = db.Transactions.AsNoTracking().ApplyFilter(filter, userId, zone);

        if (await query.CountAsync(cancellationToken) > MaxRows)
        {
            throw new BusinessRuleException(
                $"Too many transactions to export at once (limit {MaxRows:N0}). Narrow the date range.", "export_too_large");
        }

        var records = await query
            .OrderByDescending(t => t.OccurredAt).ThenByDescending(t => t.Id)
            .Select(t => new
            {
                t.OccurredAt,
                Account = t.Account.Name,
                Category = t.Category.Parent == null ? t.Category.Name : t.Category.Parent.Name,
                Subcategory = t.Category.Parent == null ? null : t.Category.Name,
                t.Note,
                t.Type,
                t.Description,
                t.Amount,
                t.Currency,
                t.Tags,
                t.Source
            })
            .ToListAsync(cancellationToken);

        var rows = records.Select(r => new object?[]
        {
            TimeZones.ToLocal(r.OccurredAt, zone),
            r.Account,
            r.Category,
            r.Subcategory,
            r.Note,
            r.Type == TransactionType.Income ? "Income" : "Exp.",
            r.Description,
            r.Amount,
            r.Currency,
            string.Join(", ", r.Tags),
            r.Source.ToString()
        }).ToList();

        var stamp = clock.GetUtcNow().ToString("yyyyMMdd-HHmmss");

        return format switch
        {
            ExportFormat.Xlsx => new ExportResult(
                $"transactions-{stamp}.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                spreadsheetWriter.WriteXlsx("Transactions", Headers, rows)),
            _ => new ExportResult(
                $"transactions-{stamp}.csv",
                "text/csv; charset=utf-8",
                CsvBuilder.Build(Headers, rows))
        };
    }
}
