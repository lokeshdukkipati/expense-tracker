using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Application.Accounts;
using ExpenseTracker.Application.Common;
using ExpenseTracker.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Achievements;

public sealed class AchievementService(IAppDbContext db, ICurrentUser currentUser, TimeProvider clock) : IAchievementService
{
    /// <summary>Streaks look back this far, which keeps the query small for very old accounts.</summary>
    private const int WindowDays = 1095;

    public async Task<AchievementsDto> GetAsync(string? timeZone, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var zone = TimeZones.Resolve(timeZone);
        var today = TimeZones.LocalDate(clock.GetUtcNow(), zone);
        var windowStart = today.AddDays(-WindowDays);
        var windowStartUtc = TimeZones.StartOfDayUtc(windowStart, zone);

        // Moving money between your own accounts is not spending or income, so it never counts here.
        var rows = await db.Transactions.AsNoTracking()
            .Where(t => t.UserId == userId
                        && t.OccurredAt >= windowStartUtc
                        && t.Type != TransactionType.TransferOut
                        && t.Type != TransactionType.TransferIn)
            .Select(t => new { t.OccurredAt, t.Type, t.Source, t.Amount })
            .ToListAsync(cancellationToken);

        var totalEntries = await db.Transactions.CountAsync(
            t => t.UserId == userId && t.Type != TransactionType.TransferOut && t.Type != TransactionType.TransferIn,
            cancellationToken);

        var firstAt = await db.Transactions
            .Where(t => t.UserId == userId && t.Type != TransactionType.TransferOut && t.Type != TransactionType.TransferIn)
            .MinAsync(t => (DateTimeOffset?)t.OccurredAt, cancellationToken);

        var spendDays = new HashSet<DateOnly>();
        var manualDays = new HashSet<DateOnly>();
        var expenseByMonth = new Dictionary<int, decimal>();
        var incomeByMonth = new Dictionary<int, decimal>();

        foreach (var row in rows)
        {
            var date = TimeZones.LocalDate(row.OccurredAt, zone);
            var monthKey = MonthKey(date);

            if (row.Source == TransactionSource.Manual)
            {
                manualDays.Add(date);
            }

            if (row.Type == TransactionType.Expense)
            {
                spendDays.Add(date);
                expenseByMonth[monthKey] = expenseByMonth.GetValueOrDefault(monthKey) + row.Amount;
            }
            else
            {
                incomeByMonth[monthKey] = incomeByMonth.GetValueOrDefault(monthKey) + row.Amount;
            }
        }

        var firstDate = firstAt is { } first
            ? Max(TimeZones.LocalDate(first, zone), windowStart)
            : today;

        // Logging streak: days on which you added something yourself.
        var (loggingCurrent, loggingBest) = DayStreaks(manualDays, today);

        // No-spend streak: days without any expense, counted from your first transaction until today.
        var noSpendCurrent = 0;
        var noSpendBest = 0;
        var noSpendLast30 = 0;
        if (firstAt is not null)
        {
            var run = 0;
            var last30Start = today.AddDays(-29);
            for (var day = firstDate; day <= today; day = day.AddDays(1))
            {
                if (spendDays.Contains(day))
                {
                    run = 0;
                }
                else
                {
                    run++;
                    noSpendBest = Math.Max(noSpendBest, run);
                    if (day >= last30Start)
                    {
                        noSpendLast30++;
                    }
                }
            }

            noSpendCurrent = run;
        }

        // Budget streak: completed months in a row at or under the overall monthly budget.
        var overallBudget = await db.Budgets.AsNoTracking()
            .Where(b => b.UserId == userId && b.IsActive && b.CategoryId == null && b.Period == BudgetPeriod.Monthly)
            .Select(b => (decimal?)b.Amount)
            .FirstOrDefaultAsync(cancellationToken);

        var currentMonthKey = MonthKey(today);
        var firstMonthKey = MonthKey(firstDate);
        var budgetCurrent = 0;
        var budgetBest = 0;
        var budgetAvailable = false;
        var positiveMonths = 0;

        if (firstAt is not null)
        {
            for (var key = firstMonthKey; key < currentMonthKey; key++)
            {
                var income = incomeByMonth.GetValueOrDefault(key);
                var expense = expenseByMonth.GetValueOrDefault(key);
                if (income > 0m && income > expense)
                {
                    positiveMonths++;
                }
            }

            if (overallBudget is { } limit && currentMonthKey - 1 >= firstMonthKey)
            {
                budgetAvailable = true;
                var run = 0;
                for (var key = firstMonthKey; key < currentMonthKey; key++)
                {
                    if (expenseByMonth.GetValueOrDefault(key) <= limit)
                    {
                        run++;
                        budgetBest = Math.Max(budgetBest, run);
                    }
                    else
                    {
                        run = 0;
                    }
                }

                budgetCurrent = run;
            }
        }

        var completedGoals = await CountCompletedGoalsAsync(userId, cancellationToken);
        var hasImport = await db.ImportBatches.AnyAsync(b => b.UserId == userId && b.Format != "Sample", cancellationToken);
        var hasTransfer = await db.Transactions.AnyAsync(
            t => t.UserId == userId && t.Type == TransactionType.TransferOut, cancellationToken);
        var ruleCount = await db.CategoryRules.CountAsync(r => r.UserId == userId, cancellationToken);

        var badges = new List<BadgeDto>
        {
            Badge("first_entry", "First step", "Log your first transaction.", "flag", "bronze", "habits", totalEntries, 1),
            Badge("entries_50", "Getting serious", "Record 50 transactions.", "list", "bronze", "habits", totalEntries, 50),
            Badge("entries_500", "Ledger legend", "Record 500 transactions.", "book", "gold", "habits", totalEntries, 500),
            Badge("log_7", "Week warrior", "Log something 7 days in a row.", "flame", "bronze", "habits", loggingBest, 7),
            Badge("log_30", "Habit built", "Log something 30 days in a row.", "flame", "gold", "habits", loggingBest, 30),
            Badge("no_spend_3", "Frugal streak", "Go 3 days in a row without spending.", "leaf", "bronze", "saving", noSpendBest, 3),
            Badge("no_spend_7", "Seven-day saver", "Go 7 days in a row without spending.", "leaf", "silver", "saving", noSpendBest, 7),
            Badge("in_green_3", "In the green", "Earn more than you spend in 3 months.", "trend-up", "silver", "saving", positiveMonths, 3),
            Badge("budget_1", "On budget", "Stay under your monthly budget for a month.", "shield", "bronze", "budget", budgetBest, 1),
            Badge("budget_3", "Budget keeper", "Stay under your monthly budget 3 months in a row.", "shield", "silver", "budget", budgetBest, 3),
            Badge("budget_6", "Budget master", "Stay under your monthly budget 6 months in a row.", "shield", "gold", "budget", budgetBest, 6),
            Badge("goal_1", "Goal getter", "Reach your first savings goal.", "target", "silver", "goals", completedGoals, 1),
            Badge("goal_3", "Dreams delivered", "Reach 3 savings goals.", "target", "gold", "goals", completedGoals, 3),
            Badge("importer", "Data wrangler", "Import a statement or an export file.", "upload", "bronze", "setup", hasImport ? 1 : 0, 1),
            Badge("mover", "Money mover", "Record a transfer between your accounts.", "swap", "bronze", "setup", hasTransfer ? 1 : 0, 1),
            Badge("rule_maker", "Rule maker", "Create an auto-categorisation rule.", "wand", "bronze", "setup", ruleCount, 1)
        };

        return new AchievementsDto(
            new StreakDto(loggingCurrent, loggingBest, "days", manualDays.Count > 0),
            new StreakDto(noSpendCurrent, noSpendBest, "days", firstAt is not null),
            new StreakDto(budgetCurrent, budgetBest, "months", budgetAvailable),
            noSpendLast30,
            badges.Count(b => b.IsEarned),
            badges.Count,
            badges);

        static BadgeDto Badge(
            string id, string title, string description, string icon, string tier, string group, int progress, int target) =>
            new(id, title, description, icon, tier, group, progress >= target, Math.Min(progress, target), target);
    }

    private async Task<int> CountCompletedGoalsAsync(Guid userId, CancellationToken cancellationToken)
    {
        var goals = await db.SavingsGoals.AsNoTracking()
            .Where(g => g.UserId == userId)
            .Select(g => new { g.TargetAmount, g.SavedAmount, g.AccountId })
            .ToListAsync(cancellationToken);

        if (goals.Count == 0)
        {
            return 0;
        }

        var linkedIds = goals.Where(g => g.AccountId != null).Select(g => g.AccountId!.Value).Distinct().ToList();
        var balances = new Dictionary<Guid, decimal>();
        if (linkedIds.Count > 0)
        {
            var openings = await db.Accounts.AsNoTracking()
                .Where(a => a.UserId == userId && linkedIds.Contains(a.Id))
                .Select(a => new { a.Id, a.OpeningBalance })
                .ToListAsync(cancellationToken);

            var movements = await AccountBalances.LoadMovementsAsync(db, userId, null, cancellationToken);
            foreach (var account in openings)
            {
                balances[account.Id] = account.OpeningBalance + movements.GetValueOrDefault(account.Id);
            }
        }

        var completed = 0;
        foreach (var goal in goals)
        {
            var current = goal.AccountId is { } linked && balances.TryGetValue(linked, out var balance)
                ? balance
                : goal.SavedAmount;

            if (current >= goal.TargetAmount)
            {
                completed++;
            }
        }

        return completed;
    }

    /// <summary>Longest run of consecutive days, and the run that is still alive today.</summary>
    private static (int Current, int Best) DayStreaks(HashSet<DateOnly> days, DateOnly today)
    {
        if (days.Count == 0)
        {
            return (0, 0);
        }

        var best = 0;
        var run = 0;
        DateOnly? previous = null;
        foreach (var day in days.OrderBy(d => d))
        {
            run = previous is { } p && day.DayNumber - p.DayNumber == 1 ? run + 1 : 1;
            best = Math.Max(best, run);
            previous = day;
        }

        // A streak stays alive if you logged today, or yesterday (you still have today to continue it).
        var cursor = days.Contains(today) ? today : today.AddDays(-1);
        var current = 0;
        while (days.Contains(cursor))
        {
            current++;
            cursor = cursor.AddDays(-1);
        }

        return (current, best);
    }

    private static int MonthKey(DateOnly date) => date.Year * 12 + date.Month - 1;

    private static DateOnly Max(DateOnly a, DateOnly b) => a >= b ? a : b;
}