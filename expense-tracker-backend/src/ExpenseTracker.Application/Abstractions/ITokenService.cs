using ExpenseTracker.Domain.Entities;

namespace ExpenseTracker.Application.Abstractions;

public sealed record AccessTokenResult(string Token, DateTimeOffset ExpiresAt);

public sealed record GeneratedRefreshToken(string RawToken, string Hash, DateTimeOffset ExpiresAt);

public interface ITokenService
{
    AccessTokenResult CreateAccessToken(User user);

    GeneratedRefreshToken GenerateRefreshToken();

    string HashToken(string rawToken);
}
