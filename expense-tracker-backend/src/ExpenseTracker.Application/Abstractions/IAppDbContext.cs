using ExpenseTracker.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace ExpenseTracker.Application.Abstractions;

public interface IAppDbContext
{
    DbSet<User> Users { get; }
    DbSet<RefreshToken> RefreshTokens { get; }
    DbSet<Account> Accounts { get; }
    DbSet<Category> Categories { get; }
    DbSet<Transaction> Transactions { get; }
    DbSet<ImportBatch> ImportBatches { get; }
    DbSet<Budget> Budgets { get; }
    DbSet<SavingsGoal> SavingsGoals { get; }
    DbSet<CategoryRule> CategoryRules { get; }

    /// <summary>Exposed for explicit transactions and execution strategies (bulk import).</summary>
    DatabaseFacade Database { get; }

    ChangeTracker ChangeTracker { get; }

    /// <summary>Used to set the original concurrency token for optimistic-concurrency checks.</summary>
    EntityEntry<TEntity> Entry<TEntity>(TEntity entity) where TEntity : class;

    /// <summary>
    /// Runs <paramref name="operation"/> in one database transaction under the retry strategy.
    /// The operation may be executed more than once on transient failures, so it must rebuild its own state.
    /// </summary>
    Task ExecuteInTransactionAsync(Func<Task> operation, CancellationToken cancellationToken);

    Task<int> SaveChangesAsync(CancellationToken cancellationToken);
}
