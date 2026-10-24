using ExpenseTracker.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace ExpenseTracker.Infrastructure.Persistence.Configurations;

// Table and column names are snake_case via UseSnakeCaseNamingConvention (friendly in pgAdmin).
// Enums are stored as strings so rows stay readable.

public sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Email).IsRequired().HasMaxLength(254);
        builder.Property(x => x.PasswordHash).IsRequired().HasMaxLength(512);
        builder.Property(x => x.FullName).IsRequired().HasMaxLength(100);
        builder.Property(x => x.DefaultCurrency).IsRequired().HasMaxLength(3);
        builder.Property(x => x.PreferencesJson).HasColumnType("jsonb");
        builder.HasIndex(x => x.Email).IsUnique();
    }
}

public sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.HasKey(x => x.Id);
        builder.Property(x => x.TokenHash).IsRequired().HasMaxLength(64);
        builder.Property(x => x.ReplacedByTokenHash).HasMaxLength(64);
        builder.Property(x => x.CreatedByIp).HasMaxLength(45);
        builder.HasIndex(x => x.TokenHash).IsUnique();
        builder.HasIndex(x => x.UserId);
        builder.HasOne(x => x.User).WithMany(x => x.RefreshTokens).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class AccountConfiguration : IEntityTypeConfiguration<Account>
{
    public void Configure(EntityTypeBuilder<Account> builder)
    {
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).IsRequired().HasMaxLength(100);
        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
        builder.Property(x => x.Currency).IsRequired().HasMaxLength(3);
        builder.Property(x => x.OpeningBalance).HasPrecision(18, 2);
        builder.HasIndex(x => new { x.UserId, x.Name }).IsUnique();
        builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class CategoryConfiguration : IEntityTypeConfiguration<Category>
{
    public void Configure(EntityTypeBuilder<Category> builder)
    {
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).IsRequired().HasMaxLength(100);
        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
        builder.Property(x => x.Color).HasMaxLength(7);
        builder.Property(x => x.Icon).HasMaxLength(50);

        // NULLS NOT DISTINCT (PostgreSQL 15+): two root categories with the same name/type cannot coexist.
        builder.HasIndex(x => new { x.UserId, x.ParentId, x.Type, x.Name }).IsUnique().AreNullsDistinct(false);

        builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(x => x.Parent).WithMany(x => x.Children).HasForeignKey(x => x.ParentId).OnDelete(DeleteBehavior.Restrict);
    }
}

public sealed class TransactionConfiguration : IEntityTypeConfiguration<Transaction>
{
    public void Configure(EntityTypeBuilder<Transaction> builder)
    {
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);
        builder.Property(x => x.Source).HasConversion<string>().HasMaxLength(20);
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.Currency).IsRequired().HasMaxLength(3);
        builder.Property(x => x.Description).HasMaxLength(500);
        builder.Property(x => x.Note).HasMaxLength(2000);
        builder.Property(x => x.Tags).HasColumnType("text[]");
        builder.Property(x => x.Fingerprint).HasMaxLength(64);

        // Soft delete: every query hides deleted rows unless IgnoreQueryFilters() is used.
        builder.HasQueryFilter(x => !x.IsDeleted);

        // The duplicate-import guard. Includes soft-deleted rows so re-imports never resurrect them.
        builder.HasIndex(x => new { x.UserId, x.Fingerprint }).IsUnique();

        builder.HasIndex(x => new { x.UserId, x.OccurredAt }).IsDescending(false, true);
        builder.HasIndex(x => new { x.UserId, x.CategoryId, x.OccurredAt });
        builder.HasIndex(x => new { x.UserId, x.AccountId, x.OccurredAt });
        builder.HasIndex(x => x.ImportBatchId);

        // Finds the other leg of a transfer quickly; ordinary transactions (NULL group) stay out of this index.
        builder.HasIndex(x => new { x.UserId, x.TransferGroupId }).HasFilter("transfer_group_id IS NOT NULL");

        builder.ToTable(t =>
        {
            t.HasCheckConstraint("ck_transactions_amount_non_negative", "amount >= 0");

            // A row carries a transfer group if and only if it is a transfer leg.
            t.HasCheckConstraint(
                "ck_transactions_transfer_group",
                "(\"type\" IN ('TransferOut', 'TransferIn')) = (transfer_group_id IS NOT NULL)");
        });

        builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
        builder.HasOne(x => x.ImportBatch).WithMany(x => x.Transactions).HasForeignKey(x => x.ImportBatchId).OnDelete(DeleteBehavior.SetNull);
    }
}

public sealed class ImportBatchConfiguration : IEntityTypeConfiguration<ImportBatch>
{
    public void Configure(EntityTypeBuilder<ImportBatch> builder)
    {
        builder.HasKey(x => x.Id);
        builder.Property(x => x.FileName).IsRequired().HasMaxLength(260);
        builder.Property(x => x.FileHash).IsRequired().HasMaxLength(64);
        builder.Property(x => x.Format).IsRequired().HasMaxLength(50);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);

        // Same file bytes cannot be imported twice by the same user.
        builder.HasIndex(x => new { x.UserId, x.FileHash }).IsUnique();

        builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class BudgetConfiguration : IEntityTypeConfiguration<Budget>
{
    public void Configure(EntityTypeBuilder<Budget> builder)
    {
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Amount).HasPrecision(18, 2);
        builder.Property(x => x.Currency).IsRequired().HasMaxLength(3);
        builder.Property(x => x.Period).HasConversion<string>().HasMaxLength(20);

        // One budget per (category, period); NULL category = the overall budget.
        builder.HasIndex(x => new { x.UserId, x.CategoryId, x.Period }).IsUnique().AreNullsDistinct(false);

        builder.ToTable(t =>
        {
            t.HasCheckConstraint("ck_budgets_amount_positive", "amount > 0");
            t.HasCheckConstraint("ck_budgets_threshold_range", "alert_threshold_percent BETWEEN 1 AND 100");
        });

        builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Cascade);
    }
}


public sealed class SavingsGoalConfiguration : IEntityTypeConfiguration<SavingsGoal>
{
    public void Configure(EntityTypeBuilder<SavingsGoal> builder)
    {
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Name).IsRequired().HasMaxLength(100);
        builder.Property(x => x.TargetAmount).HasPrecision(18, 2);
        builder.Property(x => x.SavedAmount).HasPrecision(18, 2);
        builder.Property(x => x.Currency).IsRequired().HasMaxLength(3);
        builder.Property(x => x.Color).HasMaxLength(7);
        builder.Property(x => x.Icon).HasMaxLength(50);

        builder.HasIndex(x => new { x.UserId, x.IsArchived });

        builder.ToTable(t =>
        {
            t.HasCheckConstraint("ck_savings_goals_target_positive", "target_amount > 0");
            t.HasCheckConstraint("ck_savings_goals_saved_non_negative", "saved_amount >= 0");
        });

        builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);

        // Deleting the linked account keeps the goal; it simply becomes a manually tracked goal.
        builder.HasOne(x => x.Account).WithMany().HasForeignKey(x => x.AccountId).OnDelete(DeleteBehavior.SetNull);
    }
}

public sealed class CategoryRuleConfiguration : IEntityTypeConfiguration<CategoryRule>
{
    public void Configure(EntityTypeBuilder<CategoryRule> builder)
    {
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Pattern).IsRequired().HasMaxLength(100);
        builder.Property(x => x.MatchType).HasConversion<string>().HasMaxLength(20);
        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(20);

        // The same text cannot be mapped twice for the same kind of transaction.
        builder.HasIndex(x => new { x.UserId, x.Type, x.MatchType, x.Pattern }).IsUnique();
        builder.HasIndex(x => x.CategoryId);

        builder.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);

        // Deleting a category removes the rules that point at it (same behaviour as budgets).
        builder.HasOne(x => x.Category).WithMany().HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Cascade);
    }
}