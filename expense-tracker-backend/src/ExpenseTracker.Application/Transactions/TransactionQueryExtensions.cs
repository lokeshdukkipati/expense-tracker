using ExpenseTracker.Application.Common;
using ExpenseTracker.Domain.Entities;

namespace ExpenseTracker.Application.Transactions;

public static class TransactionQueryExtensions
{
    /// <summary>Applies the owner scope plus every optional filter. Soft-deleted rows are hidden by the global query filter.</summary>
    public static IQueryable<Transaction> ApplyFilter(
        this IQueryable<Transaction> query, TransactionFilter filter, Guid userId, TimeZoneInfo zone)
    {
        query = query.Where(t => t.UserId == userId);

        if (filter.From is { } from)
        {
            var start = TimeZones.StartOfDayUtc(from, zone);
            query = query.Where(t => t.OccurredAt >= start);
        }

        if (filter.To is { } to)
        {
            var endExclusive = TimeZones.StartOfDayUtc(to.AddDays(1), zone);
            query = query.Where(t => t.OccurredAt < endExclusive);
        }

        if (filter.Type is { } type)
        {
            query = query.Where(t => t.Type == type);
        }

        if (filter.AccountId is { } accountId)
        {
            query = query.Where(t => t.AccountId == accountId);
        }

        if (filter.CategoryId is { } categoryId)
        {
            query = query.Where(t => t.CategoryId == categoryId || t.Category.ParentId == categoryId);
        }

        if (filter.Source is { } source)
        {
            query = query.Where(t => t.Source == source);
        }

        if (filter.MinAmount is { } min)
        {
            query = query.Where(t => t.Amount >= min);
        }

        if (filter.MaxAmount is { } max)
        {
            query = query.Where(t => t.Amount <= max);
        }

        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var term = filter.Search.Trim().ToLowerInvariant();
            query = query.Where(t =>
                (t.Description != null && t.Description.ToLower().Contains(term)) ||
                (t.Note != null && t.Note.ToLower().Contains(term)));
        }

        if (!string.IsNullOrWhiteSpace(filter.Tag))
        {
            var tag = filter.Tag.Trim().ToLowerInvariant();
            query = query.Where(t => t.Tags.Contains(tag));
        }

        return query;
    }
}
