namespace ExpenseTracker.Application.Budgets;

public interface IBudgetService
{
    Task<IReadOnlyList<BudgetDto>> ListAsync(CancellationToken cancellationToken);

    Task<BudgetDto> CreateAsync(CreateBudgetRequest request, CancellationToken cancellationToken);

    Task<BudgetDto> UpdateAsync(Guid id, UpdateBudgetRequest request, CancellationToken cancellationToken);

    Task DeleteAsync(Guid id, CancellationToken cancellationToken);

    /// <summary>Spending versus limit for every active budget in its current period.</summary>
    Task<IReadOnlyList<BudgetStatusDto>> GetStatusAsync(string? timeZone, DateOnly? asOf, CancellationToken cancellationToken);
}
