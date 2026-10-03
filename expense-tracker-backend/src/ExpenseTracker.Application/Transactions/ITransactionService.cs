using ExpenseTracker.Application.Common;

namespace ExpenseTracker.Application.Transactions;

public interface ITransactionService
{
    Task<PagedResult<TransactionDto>> QueryAsync(TransactionQuery query, CancellationToken cancellationToken);

    Task<TransactionDto> GetAsync(Guid id, CancellationToken cancellationToken);

    Task<TransactionDto> CreateAsync(CreateTransactionRequest request, CancellationToken cancellationToken);

    Task<TransactionDto> UpdateAsync(Guid id, UpdateTransactionRequest request, CancellationToken cancellationToken);

    Task DeleteAsync(Guid id, CancellationToken cancellationToken);

    Task<BulkDeleteResult> BulkDeleteAsync(BulkDeleteRequest request, CancellationToken cancellationToken);
}
