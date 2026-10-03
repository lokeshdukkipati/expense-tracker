namespace ExpenseTracker.Domain.Common;

public abstract class BaseEntity
{
    public Guid Id { get; set; } = Guid.CreateVersion7();

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    /// <summary>Optimistic concurrency token, mapped to PostgreSQL's xmin system column.</summary>
    public uint RowVersion { get; set; }
}
