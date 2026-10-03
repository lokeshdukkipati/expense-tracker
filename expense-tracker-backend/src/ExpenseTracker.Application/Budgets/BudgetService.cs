using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Application.Common;
using ExpenseTracker.Domain.Entities;
using ExpenseTracker.Domain.Enums;
using ExpenseTracker.Domain.Exceptions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Budgets;

public sealed class BudgetService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TimeProvider clock,
    IValidator<CreateBudgetRequest> createValidator,
    IValidator<UpdateBudgetRequest> updateValidator) : IBudgetService
{
    public async Task<IReadOnlyList<BudgetDto>> ListAsync(CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        return await db.Budgets.AsNoTracking()
            .Where(b => b.UserId == userId)
            .OrderBy(b => b.Period).ThenBy(b => b.Category == null ? "" : b.Category.Name)
            .Select(b => new BudgetDto(
                b.Id, b.CategoryId, b.Category == null ? null : b.Category.Name, b.Amount, b.Currency,
                b.Period, b.AlertThresholdPercent, b.IsActive, b.RowVersion))
            .ToListAsync(cancellationToken);
    }

    public async Task<BudgetDto> CreateAsync(CreateBudgetRequest request, CancellationToken cancellationToken)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;

        if (request.CategoryId is { } categoryId)
        {
            var category = await db.Categories.AsNoTracking()
                               .FirstOrDefaultAsync(c => c.Id == categoryId && c.UserId == userId, cancellationToken)
                           ?? throw new NotFoundException(nameof(Category), categoryId);

            if (category.Type != TransactionType.Expense)
            {
                throw new BusinessRuleException("Budgets can only be set on expense categories.", "budget_category_type");
            }
        }

        var exists = await db.Budgets.AnyAsync(
            b => b.UserId == userId && b.CategoryId == request.CategoryId && b.Period == request.Period, cancellationToken);
        if (exists)
        {
            throw new ConflictException("A budget for this category and period already exists.", "budget_exists");
        }

        var currency = await db.Users.Where(u => u.Id == userId).Select(u => u.DefaultCurrency).FirstAsync(cancellationToken);

        var budget = new Budget
        {
            UserId = userId,
            CategoryId = request.CategoryId,
            Amount = request.Amount,
            Currency = currency,
            Period = request.Period,
            AlertThresholdPercent = request.AlertThresholdPercent
        };

        db.Budgets.Add(budget);
        await db.SaveChangesAsync(cancellationToken);

        return await GetDtoAsync(budget.Id, userId, cancellationToken);
    }

    public async Task<BudgetDto> UpdateAsync(Guid id, UpdateBudgetRequest request, CancellationToken cancellationToken)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var budget = await db.Budgets.FirstOrDefaultAsync(b => b.Id == id && b.UserId == userId, cancellationToken)
                     ?? throw new NotFoundException(nameof(Budget), id);

        db.Entry(budget).Property(b => b.RowVersion).OriginalValue = request.Version;

        budget.Amount = request.Amount;
        budget.AlertThresholdPercent = request.AlertThresholdPercent;
        budget.IsActive = request.IsActive;

        await db.SaveChangesAsync(cancellationToken);
        return await GetDtoAsync(id, userId, cancellationToken);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var deleted = await db.Budgets.Where(b => b.Id == id && b.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        if (deleted == 0)
        {
            throw new NotFoundException(nameof(Budget), id);
        }
    }

    public async Task<IReadOnlyList<BudgetStatusDto>> GetStatusAsync(string? timeZone, DateOnly? asOf, CancellationToken cancellationToken)
    {
        if (asOf is { Year: < 1970 or > 2200 })
        {
            throw new ValidationException([new FluentValidation.Results.ValidationFailure("asOf", "Date is out of range.")]);
        }

        var userId = currentUser.UserId;
        var zone = TimeZones.Resolve(timeZone);
        var today = asOf ?? TimeZones.LocalDate(clock.GetUtcNow(), zone);

        var budgets = (await ListAsync(cancellationToken)).Where(b => b.IsActive).ToList();
        var result = new List<BudgetStatusDto>(budgets.Count);

        foreach (var budget in budgets)
        {
            var (start, end) = PeriodBounds(budget.Period, today);
            var startUtc = TimeZones.StartOfDayUtc(start, zone);
            var endUtc = TimeZones.StartOfDayUtc(end.AddDays(1), zone);

            var query = db.Transactions.AsNoTracking().Where(t =>
                t.UserId == userId && t.Type == TransactionType.Expense && t.OccurredAt >= startUtc && t.OccurredAt < endUtc);

            if (budget.CategoryId is { } categoryId)
            {
                query = query.Where(t => t.CategoryId == categoryId || t.Category.ParentId == categoryId);
            }

            var spent = await query.SumAsync(t => t.Amount, cancellationToken);
            var percent = Math.Round(spent / budget.Amount * 100m, 2);

            var state = percent >= 100m
                ? BudgetState.Exceeded
                : percent >= budget.AlertThresholdPercent ? BudgetState.Warning : BudgetState.OnTrack;

            var totalDays = end.DayNumber - start.DayNumber + 1;
            var elapsedDays = Math.Clamp(today.DayNumber - start.DayNumber + 1, 1, totalDays);
            var projected = elapsedDays >= totalDays ? spent : Math.Round(spent / elapsedDays * totalDays, 2);

            result.Add(new BudgetStatusDto(
                Budget: budget,
                PeriodStart: start,
                PeriodEnd: end,
                Spent: spent,
                Remaining: budget.Amount - spent,
                PercentUsed: percent,
                State: state,
                ProjectedSpend: projected,
                DaysLeft: Math.Max(0, end.DayNumber - today.DayNumber),
                ProjectedToExceed: state != BudgetState.Exceeded && projected > budget.Amount));
        }

        return result
            .OrderByDescending(s => s.State)
            .ThenByDescending(s => s.PercentUsed)
            .ToList();
    }

    /// <summary>Inclusive local-date bounds of the period containing <paramref name="date"/>. Weeks start on Monday.</summary>
    public static (DateOnly Start, DateOnly End) PeriodBounds(BudgetPeriod period, DateOnly date)
    {
        switch (period)
        {
            case BudgetPeriod.Weekly:
                var start = date.AddDays(-(((int)date.DayOfWeek + 6) % 7));
                return (start, start.AddDays(6));
            case BudgetPeriod.Yearly:
                return (new DateOnly(date.Year, 1, 1), new DateOnly(date.Year, 12, 31));
            default:
                var monthStart = new DateOnly(date.Year, date.Month, 1);
                return (monthStart, monthStart.AddMonths(1).AddDays(-1));
        }
    }

    private async Task<BudgetDto> GetDtoAsync(Guid id, Guid userId, CancellationToken cancellationToken) =>
        await db.Budgets.AsNoTracking()
            .Where(b => b.Id == id && b.UserId == userId)
            .Select(b => new BudgetDto(
                b.Id, b.CategoryId, b.Category == null ? null : b.Category.Name, b.Amount, b.Currency,
                b.Period, b.AlertThresholdPercent, b.IsActive, b.RowVersion))
            .FirstAsync(cancellationToken);
}
