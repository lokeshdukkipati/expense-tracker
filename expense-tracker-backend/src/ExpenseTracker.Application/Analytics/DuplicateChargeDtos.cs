namespace ExpenseTracker.Application.Analytics;

/// <param name="Key">Stable id of the pair (first:second), so the UI can remember a dismissed pair.</param>
/// <param name="Confidence">high, medium or low.</param>
public sealed record DuplicateChargeDto(
    string Key,
    Guid FirstId,
    Guid SecondId,
    DateTimeOffset FirstAt,
    DateTimeOffset SecondAt,
    decimal Amount,
    string Currency,
    string? Description,
    string AccountName,
    string CategoryName,
    int MinutesApart,
    string Confidence);