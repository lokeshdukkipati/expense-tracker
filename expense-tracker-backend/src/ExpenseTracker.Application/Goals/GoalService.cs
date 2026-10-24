using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Application.Accounts;
using ExpenseTracker.Domain.Entities;
using ExpenseTracker.Domain.Exceptions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Goals;

public sealed class GoalService(
    IAppDbContext db,
    ICurrentUser currentUser,
    TimeProvider clock,
    IValidator<CreateGoalRequest> createValidator,
    IValidator<UpdateGoalRequest> updateValidator,
    IValidator<ContributeGoalRequest> contributeValidator) : IGoalService
{
    private const int MaxActiveGoals = 100;
    private const decimal MaxAmount = 1_000_000_000_000m;

    public async Task<IReadOnlyList<GoalDto>> ListAsync(bool includeArchived, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var goals = await BuildAsync(
            db.SavingsGoals.Where(g => g.UserId == userId && (includeArchived || !g.IsArchived)), userId, cancellationToken);

        return goals
            .OrderBy(g => g.IsArchived)
            .ThenBy(g => g.IsCompleted)
            .ThenBy(g => g.DaysLeft ?? int.MaxValue)
            .ThenBy(g => g.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<GoalDto> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var result = await BuildAsync(db.SavingsGoals.Where(g => g.Id == id && g.UserId == userId), userId, cancellationToken);
        return result.FirstOrDefault() ?? throw new NotFoundException(nameof(SavingsGoal), id);
    }

    public async Task<GoalDto> CreateAsync(CreateGoalRequest request, CancellationToken cancellationToken)
    {
        await createValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;

        if (await db.SavingsGoals.CountAsync(g => g.UserId == userId && !g.IsArchived, cancellationToken) >= MaxActiveGoals)
        {
            throw new BusinessRuleException($"You can have at most {MaxActiveGoals} active goals.", "goal_limit");
        }

        var name = request.Name.Trim();
        await EnsureNameIsFreeAsync(userId, name, null, cancellationToken);

        Account? account = null;
        string currency;
        if (request.AccountId is { } accountId)
        {
            account = await LoadLinkableAccountAsync(userId, accountId, null, cancellationToken);
            currency = account.Currency;
        }
        else
        {
            currency = await db.Users.Where(u => u.Id == userId).Select(u => u.DefaultCurrency).FirstAsync(cancellationToken);
        }

        var goal = new SavingsGoal
        {
            UserId = userId,
            Name = name,
            TargetAmount = request.TargetAmount,
            SavedAmount = account is null ? request.InitialAmount ?? 0m : 0m,
            Currency = currency,
            TargetDate = request.TargetDate,
            AccountId = account?.Id,
            Color = Clean(request.Color),
            Icon = Clean(request.Icon)
        };

        if (account is null && goal.SavedAmount >= goal.TargetAmount)
        {
            goal.CompletedAt = clock.GetUtcNow();
        }

        db.SavingsGoals.Add(goal);
        await db.SaveChangesAsync(cancellationToken);

        return await GetAsync(goal.Id, cancellationToken);
    }

    public async Task<GoalDto> UpdateAsync(Guid id, UpdateGoalRequest request, CancellationToken cancellationToken)
    {
        await updateValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var goal = await db.SavingsGoals.FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId, cancellationToken)
                   ?? throw new NotFoundException(nameof(SavingsGoal), id);

        db.Entry(goal).Property(g => g.RowVersion).OriginalValue = request.Version;

        var name = request.Name.Trim();
        if (!request.IsArchived)
        {
            await EnsureNameIsFreeAsync(userId, name, id, cancellationToken);
        }

        if (request.AccountId is { } accountId)
        {
            var account = await LoadLinkableAccountAsync(userId, accountId, goal.AccountId, cancellationToken);
            goal.AccountId = account.Id;
            goal.Currency = account.Currency;
        }
        else
        {
            goal.AccountId = null;
        }

        goal.Name = name;
        goal.TargetAmount = request.TargetAmount;
        goal.TargetDate = request.TargetDate;
        goal.Color = Clean(request.Color);
        goal.Icon = Clean(request.Icon);
        goal.IsArchived = request.IsArchived;

        if (goal.AccountId is null)
        {
            goal.CompletedAt = goal.SavedAmount >= goal.TargetAmount ? goal.CompletedAt ?? clock.GetUtcNow() : null;
        }

        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task<GoalDto> ContributeAsync(Guid id, ContributeGoalRequest request, CancellationToken cancellationToken)
    {
        await contributeValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var goal = await db.SavingsGoals.FirstOrDefaultAsync(g => g.Id == id && g.UserId == userId, cancellationToken)
                   ?? throw new NotFoundException(nameof(SavingsGoal), id);

        if (goal.AccountId is not null)
        {
            throw new BusinessRuleException(
                "This goal follows an account balance. Add or move money in that account instead.", "goal_is_linked");
        }

        if (goal.IsArchived)
        {
            throw new BusinessRuleException("Restore this goal before adding money to it.", "goal_archived");
        }

        var saved = goal.SavedAmount + request.Amount;
        if (saved < 0m)
        {
            throw new BusinessRuleException("You cannot take out more than you have saved in this goal.", "goal_insufficient");
        }

        if (saved > MaxAmount)
        {
            throw new BusinessRuleException("The saved amount is too large.", "goal_amount_too_large");
        }

        goal.SavedAmount = saved;
        goal.CompletedAt = saved >= goal.TargetAmount ? goal.CompletedAt ?? clock.GetUtcNow() : null;

        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(id, cancellationToken);
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var deleted = await db.SavingsGoals.Where(g => g.Id == id && g.UserId == userId).ExecuteDeleteAsync(cancellationToken);
        if (deleted == 0)
        {
            throw new NotFoundException(nameof(SavingsGoal), id);
        }
    }

    private async Task<List<GoalDto>> BuildAsync(IQueryable<SavingsGoal> query, Guid userId, CancellationToken cancellationToken)
    {
        var goals = await query.AsNoTracking().Include(g => g.Account).ToListAsync(cancellationToken);

        var linkedIds = goals.Where(g => g.AccountId != null).Select(g => g.AccountId!.Value).Distinct().ToList();
        var balances = await LoadBalancesAsync(userId, linkedIds, cancellationToken);
        var today = DateOnly.FromDateTime(clock.GetUtcNow().UtcDateTime);

        return goals
            .Select(g => ToDto(g, g.AccountId is { } linked && balances.TryGetValue(linked, out var balance) ? balance : null, today))
            .ToList();
    }

    /// <summary>Current balance of each linked account, computed with the same rules as the account list.</summary>
    private async Task<Dictionary<Guid, decimal>> LoadBalancesAsync(
        Guid userId, IReadOnlyCollection<Guid> accountIds, CancellationToken cancellationToken)
    {
        if (accountIds.Count == 0)
        {
            return new Dictionary<Guid, decimal>();
        }

        var openings = await db.Accounts.AsNoTracking()
            .Where(a => a.UserId == userId && accountIds.Contains(a.Id))
            .Select(a => new { a.Id, a.OpeningBalance })
            .ToListAsync(cancellationToken);

        var movements = await AccountBalances.LoadMovementsAsync(db, userId, null, cancellationToken);

        return openings.ToDictionary(a => a.Id, a => a.OpeningBalance + movements.GetValueOrDefault(a.Id));
    }

    private static GoalDto ToDto(SavingsGoal goal, decimal? linkedBalance, DateOnly today)
    {
        // A negative account balance simply counts as no progress.
        var current = Math.Max(0m, linkedBalance ?? goal.SavedAmount);
        var target = goal.TargetAmount;
        var remaining = Math.Max(0m, target - current);
        var percent = Math.Min(100m, decimal.Round(current / target * 100m, 1, MidpointRounding.AwayFromZero));
        var isCompleted = current >= target;

        int? daysLeft = goal.TargetDate is { } deadline ? deadline.DayNumber - today.DayNumber : null;
        var startDay = DateOnly.FromDateTime(goal.CreatedAt.UtcDateTime);

        decimal? requiredPerMonth = null;
        if (!isCompleted && daysLeft is > 0)
        {
            var months = Math.Max(1m, daysLeft.Value / 30.4375m);
            requiredPerMonth = decimal.Round(remaining / months, 2, MidpointRounding.AwayFromZero);
        }

        // If the saving pace so far simply continues, when would the target be reached?
        DateOnly? projectedDate = null;
        if (!isCompleted && current > 0m)
        {
            var elapsedDays = Math.Max(1, today.DayNumber - startDay.DayNumber);
            var perDay = current / elapsedDays;
            var daysNeeded = remaining / perDay;
            if (daysNeeded <= 36_500m)
            {
                projectedDate = today.AddDays((int)Math.Ceiling(daysNeeded));
            }
        }

        string status;
        if (isCompleted)
        {
            status = GoalStatus.Completed;
        }
        else if (goal.TargetDate is not { } due)
        {
            status = GoalStatus.NoDeadline;
        }
        else if (today > due)
        {
            status = GoalStatus.Overdue;
        }
        else
        {
            // On track means progress is at least as far along as the share of time that has passed.
            var totalDays = Math.Max(1, due.DayNumber - startDay.DayNumber);
            var elapsed = Math.Clamp(today.DayNumber - startDay.DayNumber, 0, totalDays);
            var expectedPercent = (decimal)elapsed / totalDays * 100m;
            status = percent >= expectedPercent ? GoalStatus.OnTrack : GoalStatus.Behind;
        }

        return new GoalDto(
            goal.Id, goal.Name, target, current, remaining, percent, goal.Currency, goal.TargetDate,
            daysLeft, requiredPerMonth, projectedDate, status, isCompleted, goal.CompletedAt,
            goal.AccountId, goal.Account?.Name, goal.Color, goal.Icon, goal.IsArchived, goal.RowVersion);
    }

    private async Task EnsureNameIsFreeAsync(Guid userId, string name, Guid? exceptId, CancellationToken cancellationToken)
    {
        var lower = name.ToLowerInvariant();
        var exists = await db.SavingsGoals.AnyAsync(
            g => g.UserId == userId && !g.IsArchived && g.Id != exceptId && g.Name.ToLower() == lower, cancellationToken);

        if (exists)
        {
            throw new ConflictException("You already have an active goal with this name.", "goal_exists");
        }
    }

    private async Task<Account> LoadLinkableAccountAsync(
        Guid userId, Guid accountId, Guid? currentAccountId, CancellationToken cancellationToken)
    {
        var account = await db.Accounts.AsNoTracking()
                          .FirstOrDefaultAsync(a => a.Id == accountId && a.UserId == userId, cancellationToken)
                      ?? throw new NotFoundException(nameof(Account), accountId);

        // A goal that already follows an account keeps working after that account is archived.
        if (account.IsArchived && account.Id != currentAccountId)
        {
            throw new BusinessRuleException("This account is archived. Choose another account.", "account_archived");
        }

        return account;
    }

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}