namespace ExpenseTracker.Application.Transfers;

public interface ITransferService
{
    Task<TransferResultDto> CreateAsync(CreateTransferRequest request, CancellationToken cancellationToken);

    Task<TransferDto> GetAsync(Guid groupId, CancellationToken cancellationToken);

    Task<TransferDto> UpdateAsync(Guid groupId, UpdateTransferRequest request, CancellationToken cancellationToken);

    /// <summary>Removes both legs of the transfer.</summary>
    Task DeleteAsync(Guid groupId, CancellationToken cancellationToken);

    /// <summary>Turns an existing expense or income into a transfer to or from another account.</summary>
    Task<TransferDto> ConvertAsync(Guid transactionId, ConvertToTransferRequest request, CancellationToken cancellationToken);

    /// <summary>Corrects the account's opening balance so its current balance equals the actual balance.</summary>
    Task<ReconcileResultDto> ReconcileAsync(Guid accountId, ReconcileAccountRequest request, CancellationToken cancellationToken);
}