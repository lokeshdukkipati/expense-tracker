namespace ExpenseTracker.Application.Achievements;

public interface IAchievementService
{
    /// <param name="timeZone">IANA time zone that decides which calendar day a transaction belongs to.</param>
    Task<AchievementsDto> GetAsync(string? timeZone, CancellationToken cancellationToken);
}