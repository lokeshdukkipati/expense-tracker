namespace ExpenseTracker.Application.NetWorth;

public interface INetWorthService
{
    /// <param name="months">How many months of history to return (2-36, default 12).</param>
    /// <param name="timeZone">IANA time zone used to decide which month a transaction belongs to.</param>
    Task<NetWorthDto> GetAsync(int? months, string? timeZone, CancellationToken cancellationToken);
}