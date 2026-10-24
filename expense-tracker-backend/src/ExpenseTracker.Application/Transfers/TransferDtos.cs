namespace ExpenseTracker.Application.Transfers;

/// <summary>One transfer between two of the user's own accounts (stored as two linked transactions).</summary>
public sealed record TransferDto(
    Guid GroupId,
    Guid FromAccountId,
    string FromAccountName,
    Guid ToAccountId,
    string ToAccountName,
    decimal Amount,
    string Currency,
    DateTimeOffset OccurredAt,
    string? Description,
    string? Note,
    List<string> Tags,
    Guid OutTransactionId,
    Guid InTransactionId,
    uint Version);

public sealed record TransferResultDto(TransferDto Transfer, Guid? FeeTransactionId);

/// <summary>Fields shared by create and update so both are validated by the same rules.</summary>
public interface ITransferInput
{
    Guid FromAccountId { get; }
    Guid ToAccountId { get; }
    decimal Amount { get; }
    DateTimeOffset OccurredAt { get; }
    string? Description { get; }
    string? Note { get; }
    List<string>? Tags { get; }
}

/// <summary>
/// An optional <see cref="Fee"/> (for example an ATM charge) is recorded as a separate expense on the source
/// account, in <see cref="FeeCategoryId"/> or, when omitted, in the user's existing fee/charge category.
/// </summary>
public sealed record CreateTransferRequest(
    Guid FromAccountId,
    Guid ToAccountId,
    decimal Amount,
    DateTimeOffset OccurredAt,
    string? Description,
    string? Note,
    List<string>? Tags,
    decimal? Fee = null,
    Guid? FeeCategoryId = null) : ITransferInput;

/// <summary>Fees are separate expenses and are edited like any other expense, not here.</summary>
public sealed record UpdateTransferRequest(
    Guid FromAccountId,
    Guid ToAccountId,
    decimal Amount,
    DateTimeOffset OccurredAt,
    string? Description,
    string? Note,
    List<string>? Tags,
    uint Version) : ITransferInput;

/// <summary>
/// Turns an existing expense (money left this account) or income (money arrived) into a transfer.
/// <see cref="OtherAccountId"/> is the account on the other side. <see cref="Version"/> is the entry's current version.
/// </summary>
public sealed record ConvertToTransferRequest(Guid OtherAccountId, uint Version);

/// <summary>Sets an account's balance to what the user actually has, by correcting its opening balance.</summary>
public sealed record ReconcileAccountRequest(decimal ActualBalance);

public sealed record ReconcileResultDto(
    Guid AccountId,
    decimal PreviousBalance,
    decimal NewBalance,
    decimal Adjustment,
    decimal OpeningBalance);