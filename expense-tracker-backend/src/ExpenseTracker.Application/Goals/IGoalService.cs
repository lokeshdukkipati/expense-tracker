namespace ExpenseTracker.Application.Goals;

public interface IGoalService
{
    Task<IReadOnlyList<GoalDto>> ListAsync(bool includeArchived, CancellationToken cancellationToken);

    Task<GoalDto> GetAsync(Guid id, CancellationToken cancellationToken);

    Task<GoalDto> CreateAsync(CreateGoalRequest request, CancellationToken cancellationToken);

    Task<GoalDto> UpdateAsync(Guid id, UpdateGoalRequest request, CancellationToken cancellationToken);

    /// <summary>Adds money to (or takes money out of) a manually tracked goal.</summary>
    Task<GoalDto> ContributeAsync(Guid id, ContributeGoalRequest request, CancellationToken cancellationToken);

    Task DeleteAsync(Guid id, CancellationToken cancellationToken);
}