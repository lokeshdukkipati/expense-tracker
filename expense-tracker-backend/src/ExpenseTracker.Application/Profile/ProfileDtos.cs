namespace ExpenseTracker.Application.Profile;

public sealed record UpdateProfileRequest(string FullName, string DefaultCurrency);

public sealed record DeleteAccountRequest(string Password);
