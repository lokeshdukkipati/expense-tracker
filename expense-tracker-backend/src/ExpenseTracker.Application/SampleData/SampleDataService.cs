using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Domain.Entities;
using ExpenseTracker.Domain.Enums;
using ExpenseTracker.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.SampleData;

public sealed class SampleDataService(IAppDbContext db, ICurrentUser currentUser, TimeProvider clock) : ISampleDataService
{
    private const string BatchFormat = "Sample";
    private const string BatchHash = "sample-data";
    private const int InsertChunkSize = 1_000;
    private const int DemoDays = 90;

    private static readonly string[] AccountNames = ["Demo Bank", "Demo Cash", "Demo Card"];

    private sealed record CategoryRef(Guid Id, string Name, TransactionType Type);

    private sealed record Ids(
        Guid User, Guid Batch, Guid Bank, Guid Cash, Guid Card, Guid Transfer,
        Guid Salary, Guid Food, Guid Transport, Guid Household, Guid Bills,
        Guid Culture, Guid Shopping, Guid Health, Guid Social);

    public async Task<SampleDataStatusDto> GetStatusAsync(CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var accountIds = await db.Accounts.AsNoTracking()
            .Where(a => a.UserId == userId && a.IsSample)
            .Select(a => a.Id)
            .ToListAsync(cancellationToken);

        if (accountIds.Count == 0)
        {
            return new SampleDataStatusDto(false, 0, 0);
        }

        var transactions = await db.Transactions.CountAsync(
            t => t.UserId == userId && accountIds.Contains(t.AccountId), cancellationToken);

        return new SampleDataStatusDto(true, accountIds.Count, transactions);
    }

    public async Task<SampleDataStatusDto> LoadAsync(CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        if (await db.Accounts.AnyAsync(a => a.UserId == userId && a.IsSample, cancellationToken))
        {
            throw new ConflictException("Sample data is already loaded.", "sample_data_loaded");
        }

        if (await db.Accounts.AnyAsync(a => a.UserId == userId && AccountNames.Contains(a.Name), cancellationToken))
        {
            throw new BusinessRuleException(
                "You already have an account named Demo Bank, Demo Cash or Demo Card. Rename it first.", "sample_name_taken");
        }

        var currency = await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.DefaultCurrency)
            .FirstAsync(cancellationToken);

        var now = clock.GetUtcNow();
        var today = DateOnly.FromDateTime(now.UtcDateTime);

        // The delegate may be re-run by the retry strategy, so it rebuilds all of its state each time.
        await db.ExecuteInTransactionAsync(async () =>
        {
            db.ChangeTracker.Clear();

            var categories = await db.Categories.AsNoTracking()
                .Where(c => c.UserId == userId && !c.IsSystem && !c.IsArchived && c.ParentId == null)
                .Select(c => new CategoryRef(c.Id, c.Name, c.Type))
                .ToListAsync(cancellationToken);

            // Uses your own category of that name, else "Other", else any; only creates one when you have none at all.
            Guid Pick(TransactionType type, string preferred)
            {
                var ofType = categories.Where(c => c.Type == type).ToList();
                var match = ofType.FirstOrDefault(c => string.Equals(c.Name, preferred, StringComparison.OrdinalIgnoreCase))
                            ?? ofType.FirstOrDefault(c => string.Equals(c.Name, "Other", StringComparison.OrdinalIgnoreCase))
                            ?? ofType.FirstOrDefault();
                if (match is not null)
                {
                    return match.Id;
                }

                var created = new Category { UserId = userId, Name = preferred, Type = type };
                db.Categories.Add(created);
                categories.Add(new CategoryRef(created.Id, created.Name, created.Type));
                return created.Id;
            }

            var transferCategoryId = await db.Categories
                .Where(c => c.UserId == userId && c.IsSystem && c.Type == TransactionType.TransferOut)
                .Select(c => (Guid?)c.Id)
                .FirstOrDefaultAsync(cancellationToken);

            if (transferCategoryId is null)
            {
                var systemCategory = new Category
                {
                    UserId = userId,
                    Name = "Transfer",
                    Type = TransactionType.TransferOut,
                    Color = "#64748B",
                    IsSystem = true
                };
                db.Categories.Add(systemCategory);
                transferCategoryId = systemCategory.Id;
            }

            var bank = new Account
            {
                UserId = userId, Name = AccountNames[0], Type = AccountType.Bank, Currency = currency,
                OpeningBalance = 40_000m, IsSample = true
            };
            var cash = new Account
            {
                UserId = userId, Name = AccountNames[1], Type = AccountType.Cash, Currency = currency,
                OpeningBalance = 1_000m, IsSample = true
            };
            var card = new Account
            {
                UserId = userId, Name = AccountNames[2], Type = AccountType.Card, Currency = currency,
                OpeningBalance = 0m, IsSample = true
            };

            var batch = new ImportBatch
            {
                UserId = userId,
                FileName = "Sample data",
                FileHash = BatchHash,
                Format = BatchFormat,
                Status = ImportStatus.Completed
            };

            var ids = new Ids(
                userId, batch.Id, bank.Id, cash.Id, card.Id, transferCategoryId.Value,
                Pick(TransactionType.Income, "Salary"),
                Pick(TransactionType.Expense, "Food"),
                Pick(TransactionType.Expense, "Transportation"),
                Pick(TransactionType.Expense, "Household"),
                Pick(TransactionType.Expense, "Bills"),
                Pick(TransactionType.Expense, "Culture"),
                Pick(TransactionType.Expense, "Shopping"),
                Pick(TransactionType.Expense, "Health"),
                Pick(TransactionType.Expense, "Social Life"));

            var transactions = Generate(ids, currency, today, now);
            batch.TotalRows = transactions.Count;
            batch.ImportedRows = transactions.Count;

            db.Accounts.AddRange(bank, cash, card);
            db.ImportBatches.Add(batch);
            db.SavingsGoals.AddRange(
                new SavingsGoal
                {
                    UserId = userId, Name = "Goa trip", TargetAmount = 30_000m, SavedAmount = 12_500m, Currency = currency,
                    TargetDate = today.AddDays(110), Color = "#06B6D4", Icon = "plane", IsSample = true
                },
                new SavingsGoal
                {
                    UserId = userId, Name = "Emergency fund", TargetAmount = 200_000m, Currency = currency,
                    TargetDate = today.AddDays(300), AccountId = bank.Id, Color = "#22C55E", Icon = "shield", IsSample = true
                });

            // Accounts, categories, goals and the batch must exist before the transactions that reference them.
            await db.SaveChangesAsync(cancellationToken);
            db.ChangeTracker.Clear();

            foreach (var chunk in transactions.Chunk(InsertChunkSize))
            {
                db.Transactions.AddRange(chunk);
                await db.SaveChangesAsync(cancellationToken);
                db.ChangeTracker.Clear();
            }
        }, cancellationToken);

        return await GetStatusAsync(cancellationToken);
    }

    public async Task RemoveAsync(CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;

        var accountIds = await db.Accounts.AsNoTracking()
            .Where(a => a.UserId == userId && a.IsSample)
            .Select(a => a.Id)
            .ToListAsync(cancellationToken);

        if (accountIds.Count == 0)
        {
            throw new NotFoundException("Sample data", "loaded");
        }

        // A transfer the user later made between a demo account and a real one must not leave a one-sided leg behind.
        var groupIds = await db.Transactions.IgnoreQueryFilters().AsNoTracking()
            .Where(t => t.UserId == userId && accountIds.Contains(t.AccountId) && t.TransferGroupId != null)
            .Select(t => t.TransferGroupId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);

        await db.ExecuteInTransactionAsync(async () =>
        {
            await db.Transactions.IgnoreQueryFilters()
                .Where(t => t.UserId == userId
                            && (accountIds.Contains(t.AccountId)
                                || (t.TransferGroupId != null && groupIds.Contains(t.TransferGroupId.Value))))
                .ExecuteDeleteAsync(cancellationToken);

            await db.SavingsGoals.Where(g => g.UserId == userId && g.IsSample).ExecuteDeleteAsync(cancellationToken);
            await db.Accounts.Where(a => a.UserId == userId && a.IsSample).ExecuteDeleteAsync(cancellationToken);
            await db.ImportBatches.Where(b => b.UserId == userId && b.Format == BatchFormat).ExecuteDeleteAsync(cancellationToken);
        }, cancellationToken);
    }

    /// <summary>
    /// About 90 days of believable activity, always the same for the same date (fixed random seed).
    /// Cash is tracked as it is generated so the demo cash account never goes negative.
    /// </summary>
    private static List<Transaction> Generate(Ids ids, string currency, DateOnly today, DateTimeOffset now)
    {
        var random = new Random(20261016);
        var list = new List<Transaction>(400);
        var cashBalance = 1_000m;

        DateTimeOffset At(DateOnly day, int hour, int minute) =>
            new(day.ToDateTime(new TimeOnly(hour, minute)), TimeSpan.Zero);

        string Pick(params string[] options) => options[random.Next(options.Length)];

        void Add(TransactionType type, Guid account, Guid category, decimal amount, string description, DateTimeOffset at, Guid? group = null) =>
            list.Add(new Transaction
            {
                UserId = ids.User,
                AccountId = account,
                CategoryId = category,
                Type = type,
                Amount = amount,
                Currency = currency,
                OccurredAt = at,
                Description = description,
                Source = TransactionSource.Import,
                ImportBatchId = ids.Batch,
                TransferGroupId = group
            });

        void Income(decimal amount, string description, DateTimeOffset at)
        {
            if (at <= now)
            {
                Add(TransactionType.Income, ids.Bank, ids.Salary, amount, description, at);
            }
        }

        void Spend(Guid category, decimal amount, string description, DateTimeOffset at, Guid account)
        {
            if (at > now)
            {
                return;
            }

            if (account == ids.Cash && cashBalance < amount)
            {
                account = ids.Card; // not enough cash left: pay by card instead
            }
            else if (account == ids.Cash)
            {
                cashBalance -= amount;
            }

            Add(TransactionType.Expense, account, category, amount, description, at);
        }

        void Transfer(Guid from, Guid to, decimal amount, string description, DateTimeOffset at)
        {
            if (at > now)
            {
                return;
            }

            var group = Guid.CreateVersion7();
            Add(TransactionType.TransferOut, from, ids.Transfer, amount, description, at, group);
            Add(TransactionType.TransferIn, to, ids.Transfer, amount, description, at, group);

            if (to == ids.Cash)
            {
                cashBalance += amount;
            }

            if (from == ids.Cash)
            {
                cashBalance -= amount;
            }
        }

        for (var day = today.AddDays(-(DemoDays - 1)); day <= today; day = day.AddDays(1))
        {
            if (day.Day == 1)
            {
                Income(65_000m, "Monthly salary", At(day, 4, 30));
            }

            if (day.Day == 2)
            {
                Transfer(ids.Bank, ids.Cash, 12_000m, "ATM withdrawal", At(day, 5, 10));
                Spend(ids.Household, 12_000m, "PG rent", At(day, 6, 0), ids.Cash);
            }

            if (day.Day == 5)
            {
                Spend(ids.Culture, 199m, "Netflix", At(day, 6, 30), ids.Card);
                Spend(ids.Culture, 119m, "Spotify", At(day, 6, 31), ids.Card);
            }

            if (day.Day == 10)
            {
                Spend(ids.Bills, random.Next(1_150, 1_901), "Electricity bill", At(day, 7, 15), ids.Bank);
            }

            if (day.Day == 15)
            {
                Spend(ids.Bills, 399m, "Mobile recharge", At(day, 7, 45), ids.Bank);
            }

            if (day.Day == 20)
            {
                Transfer(ids.Bank, ids.Card, 15_000m, "Credit card payment", At(day, 8, 0));
            }

            if (day.DayNumber % 10 == 0)
            {
                Transfer(ids.Bank, ids.Cash, 2_000m, "ATM withdrawal", At(day, 5, 40));
            }

            if (day.DayOfWeek == DayOfWeek.Sunday)
            {
                Spend(ids.Food, random.Next(600, 1_801), "BigBasket groceries", At(day, 9, 0), ids.Card);
            }

            if (random.NextDouble() < 0.45)
            {
                Spend(ids.Food, random.Next(180, 521), Pick("Swiggy order", "Zomato order", "Dinner out"), At(day, 13, random.Next(0, 60)), ids.Card);
            }

            if (random.NextDouble() < 0.55)
            {
                Spend(ids.Transport, random.Next(40, 221), Pick("Auto ride", "Metro recharge", "Uber ride"), At(day, 4, random.Next(0, 60)), ids.Cash);
            }

            if (random.NextDouble() < 0.15)
            {
                Spend(ids.Social, random.Next(300, 901), Pick("Movie night", "Coffee with friends"), At(day, 12, random.Next(0, 60)), ids.Cash);
            }

            if (random.NextDouble() < 0.06)
            {
                Spend(ids.Shopping, random.Next(800, 3_201), Pick("Amazon order", "Myntra order"), At(day, 10, random.Next(0, 60)), ids.Card);
            }

            if (random.NextDouble() < 0.02)
            {
                Spend(ids.Health, random.Next(400, 1_201), "Pharmacy", At(day, 11, random.Next(0, 60)), ids.Cash);
            }
        }

        // One unusually large expense and one double charge, so those insights have something to show.
        Spend(ids.Shopping, 18_500m, "Phone screen repair", At(today.AddDays(-12), 6, 20), ids.Card);
        Spend(ids.Food, 349m, "Pizza Palace", At(today.AddDays(-6), 7, 5), ids.Card);
        Spend(ids.Food, 349m, "Pizza Palace", At(today.AddDays(-6), 7, 7), ids.Card);

        return list;
    }
}