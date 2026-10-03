namespace ExpenseTracker.Application.Auth;

public sealed record RegisterRequest(string Email, string Password, string FullName, string? DefaultCurrency);

public sealed record LoginRequest(string Email, string Password);

public sealed record RefreshTokenRequest(string RefreshToken);

public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public sealed record UserDto(Guid Id, string Email, string FullName, string DefaultCurrency);

public sealed record AuthResponse(
    string AccessToken,
    DateTimeOffset AccessTokenExpiresAt,
    string RefreshToken,
    DateTimeOffset RefreshTokenExpiresAt,
    UserDto User);
