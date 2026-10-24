using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Application.Rules;
using ExpenseTracker.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Analytics;

public sealed class DuplicateChargeService(IAppDbContext db, ICurrentUser currentUser, TimeProvider clock) : IDuplicateChargeService
{
    private const int DefaultDays = 90;
    private const int MaxRows = 20_000;
    private const int MaxResults = 200;

    /// <summary>With a description: a repeat within this many minutes is suspicious (same-day coffees are not).</summary>
    private const int DescribedWindowMinutes = 60;

    /// <summary>Without a description there is less to go on, so only near-instant repeats in the same category count.</summary>
    private const int UndescribedWindowMinutes = 5;

    private const int HighConfidenceMinutes = 5;

    private sealed record Row(
        Guid Id,
        Guid AccountId,
        string AccountName,
        Guid CategoryId,
        string CategoryName,
        decimal Amount,
        string Currency,
        DateTimeOffset OccurredAt,
        string? Description);

    public async Task<IReadOnlyList<DuplicateChargeDto>> FindAsync(int? days, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var since = clock.GetUtcNow().AddDays(-Math.Clamp(days ?? DefaultDays, 7, 365));

        var rows = await db.Transactions.AsNoTracking()
            .Where(t => t.UserId == userId && t.Type == TransactionType.Expense && t.OccurredAt >= since)
            .OrderByDescending(t => t.OccurredAt)
            .Take(MaxRows)
            .Select(t => new Row(
                t.Id, t.AccountId, t.Account.Name, t.CategoryId, t.Category.Name,
                t.Amount, t.Currency, t.OccurredAt, t.Description))
            .ToListAsync(cancellationToken);

        var found = new List<DuplicateChargeDto>();

        var groups = rows.GroupBy(r =>
        {
            var text = CategoryRuleMatcher.Normalize(r.Description);
            return (r.AccountId, r.Amount, Text: text, Category: text.Length == 0 ? r.CategoryId : Guid.Empty);
        });

        foreach (var group in groups)
        {
            var ordered = group.OrderBy(r => r.OccurredAt).ToList();
            if (ordered.Count < 2)
            {
                continue;
            }

            var described = group.Key.Text.Length > 0;
            var window = described ? DescribedWindowMinutes : UndescribedWindowMinutes;

            for (var i = 1; i < ordered.Count; i++)
            {
                var previous = ordered[i - 1];
                var current = ordered[i];
                var minutes = (int)Math.Round((current.OccurredAt - previous.OccurredAt).TotalMinutes);
                if (minutes > window)
                {
                    continue;
                }

                var confidence = !described ? "low" : minutes <= HighConfidenceMinutes ? "high" : "medium";

                found.Add(new DuplicateChargeDto(
                    $"{previous.Id:N}:{current.Id:N}",
                    previous.Id, current.Id,
                    previous.OccurredAt, current.OccurredAt,
                    current.Amount, current.Currency,
                    current.Description ?? previous.Description,
                    current.AccountName, current.CategoryName,
                    minutes, confidence));
            }
        }

        return found
            .OrderByDescending(d => d.SecondAt)
            .Take(MaxResults)
            .ToList();
    }
}