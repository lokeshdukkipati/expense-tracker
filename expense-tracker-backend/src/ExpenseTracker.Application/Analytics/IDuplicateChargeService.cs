namespace ExpenseTracker.Application.Analytics;

public interface IDuplicateChargeService
{
    /// <param name="days">How far back to look (7-365, default 90).</param>
    Task<IReadOnlyList<DuplicateChargeDto>> FindAsync(int? days, CancellationToken cancellationToken);
}