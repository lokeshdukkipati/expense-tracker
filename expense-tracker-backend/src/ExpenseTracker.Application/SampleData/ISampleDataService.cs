namespace ExpenseTracker.Application.SampleData;

public interface ISampleDataService
{
    Task<SampleDataStatusDto> GetStatusAsync(CancellationToken cancellationToken);

    /// <summary>Adds the demo accounts, about 90 days of transactions and two goals.</summary>
    Task<SampleDataStatusDto> LoadAsync(CancellationToken cancellationToken);

    /// <summary>Removes the demo accounts and everything recorded on them.</summary>
    Task RemoveAsync(CancellationToken cancellationToken);
}