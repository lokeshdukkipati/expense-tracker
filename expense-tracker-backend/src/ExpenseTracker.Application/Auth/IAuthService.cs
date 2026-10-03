namespace ExpenseTracker.Application.Auth;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request, string? ipAddress, CancellationToken cancellationToken);

    Task<AuthResponse> LoginAsync(LoginRequest request, string? ipAddress, CancellationToken cancellationToken);

    Task<AuthResponse> RefreshAsync(RefreshTokenRequest request, string? ipAddress, CancellationToken cancellationToken);

    Task LogoutAsync(RefreshTokenRequest request, CancellationToken cancellationToken);

    Task<UserDto> GetCurrentUserAsync(CancellationToken cancellationToken);

    Task ChangePasswordAsync(ChangePasswordRequest request, CancellationToken cancellationToken);
}
