namespace ExpenseTracker.Application.Accounts;

public interface IAccountService
{
    Task<IReadOnlyList<AccountDto>> ListAsync(bool includeArchived, CancellationToken cancellationToken);

    Task<AccountDto> GetAsync(Guid id, CancellationToken cancellationToken);

    Task<AccountDto> CreateAsync(CreateAccountRequest request, CancellationToken cancellationToken);

    Task<AccountDto> UpdateAsync(Guid id, UpdateAccountRequest request, CancellationToken cancellationToken);

    Task DeleteAsync(Guid id, CancellationToken cancellationToken);
}
