using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Domain.Entities;
using ExpenseTracker.Domain.Enums;
using ExpenseTracker.Domain.Exceptions;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

namespace ExpenseTracker.Application.Auth;

public sealed class AuthService(
    IAppDbContext db,
    IPasswordService passwords,
    ITokenService tokens,
    ICurrentUser currentUser,
    TimeProvider clock,
    IValidator<RegisterRequest> registerValidator,
    IValidator<LoginRequest> loginValidator,
    IValidator<RefreshTokenRequest> refreshValidator,
    IValidator<ChangePasswordRequest> changePasswordValidator) : IAuthService
{
    private const int MaxFailedAttempts = 5;
    private const string InvalidCredentials = "Invalid email or password.";
    private static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request, string? ipAddress, CancellationToken cancellationToken)
    {
        await registerValidator.ValidateAndThrowAsync(request, cancellationToken);

        var email = NormalizeEmail(request.Email);
        if (await db.Users.AnyAsync(u => u.Email == email, cancellationToken))
        {
            throw new ConflictException("An account with this email already exists.", "email_taken");
        }

        var now = clock.GetUtcNow();
        var currency = string.IsNullOrWhiteSpace(request.DefaultCurrency) ? "INR" : request.DefaultCurrency.Trim();

        var user = new User
        {
            Email = email,
            FullName = request.FullName.Trim(),
            PasswordHash = passwords.Hash(request.Password),
            DefaultCurrency = currency,
            LastLoginAt = now
        };

        db.Users.Add(user);
        db.Accounts.Add(new Account { UserId = user.Id, Name = "Cash", Type = AccountType.Cash, Currency = currency });
        db.Categories.AddRange(DefaultCategories.Create(user.Id));

        var (response, _) = IssueTokens(user, ipAddress);

        // Single SaveChanges => user, defaults and first session are created atomically.
        // A concurrent duplicate registration surfaces as a unique violation -> 409 in the global handler.
        await db.SaveChangesAsync(cancellationToken);
        return response;
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request, string? ipAddress, CancellationToken cancellationToken)
    {
        await loginValidator.ValidateAndThrowAsync(request, cancellationToken);

        var email = NormalizeEmail(request.Email);
        var now = clock.GetUtcNow();

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, cancellationToken);
        if (user is null)
        {
            // Burn comparable CPU time so response timing does not reveal which emails exist.
            passwords.Hash(request.Password);
            throw new UnauthorizedException(InvalidCredentials);
        }

        if (user.LockoutEnd is { } lockoutEnd && lockoutEnd > now)
        {
            throw new UnauthorizedException("Account is temporarily locked after repeated failed sign-in attempts. Try again later.");
        }

        var verification = passwords.Verify(user.PasswordHash, request.Password);
        if (verification == PasswordVerifyResult.Failed)
        {
            user.FailedLoginCount++;
            if (user.FailedLoginCount >= MaxFailedAttempts)
            {
                user.LockoutEnd = now.Add(LockoutDuration);
                user.FailedLoginCount = 0;
            }

            await db.SaveChangesAsync(cancellationToken);
            throw new UnauthorizedException(InvalidCredentials);
        }

        if (!user.IsActive)
        {
            throw new UnauthorizedException("This account has been disabled.");
        }

        user.FailedLoginCount = 0;
        user.LockoutEnd = null;
        user.LastLoginAt = now;
        if (verification == PasswordVerifyResult.SuccessRehashNeeded)
        {
            user.PasswordHash = passwords.Hash(request.Password);
        }

        // Housekeeping: drop this user's long-expired refresh tokens.
        var cutoff = now.AddDays(-30);
        await db.RefreshTokens
            .Where(t => t.UserId == user.Id && t.ExpiresAt < cutoff)
            .ExecuteDeleteAsync(cancellationToken);

        var (response, _) = IssueTokens(user, ipAddress);
        await db.SaveChangesAsync(cancellationToken);
        return response;
    }

    public async Task<AuthResponse> RefreshAsync(RefreshTokenRequest request, string? ipAddress, CancellationToken cancellationToken)
    {
        await refreshValidator.ValidateAndThrowAsync(request, cancellationToken);

        var now = clock.GetUtcNow();
        var hash = tokens.HashToken(request.RefreshToken);

        var stored = await db.RefreshTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);

        if (stored is null)
        {
            throw new UnauthorizedException("Invalid refresh token.");
        }

        if (stored.RevokedAt is not null)
        {
            // A rotated/revoked token was presented again: assume theft and end every session.
            await RevokeAllActiveAsync(stored.UserId, now, cancellationToken);
            await db.SaveChangesAsync(cancellationToken);
            throw new UnauthorizedException("Refresh token is no longer valid. Please sign in again.");
        }

        if (stored.ExpiresAt <= now || !stored.User.IsActive)
        {
            throw new UnauthorizedException("Refresh token is no longer valid. Please sign in again.");
        }

        var (response, newHash) = IssueTokens(stored.User, ipAddress);
        stored.RevokedAt = now;
        stored.ReplacedByTokenHash = newHash;

        await db.SaveChangesAsync(cancellationToken);
        return response;
    }

    public async Task LogoutAsync(RefreshTokenRequest request, CancellationToken cancellationToken)
    {
        await refreshValidator.ValidateAndThrowAsync(request, cancellationToken);

        var hash = tokens.HashToken(request.RefreshToken);
        var stored = await db.RefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);

        // Idempotent: unknown or already-revoked tokens are simply ignored.
        if (stored is not null && stored.RevokedAt is null)
        {
            stored.RevokedAt = clock.GetUtcNow();
            await db.SaveChangesAsync(cancellationToken);
        }
    }

    public async Task<UserDto> GetCurrentUserAsync(CancellationToken cancellationToken)
    {
        var userId = currentUser.UserId;
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, cancellationToken)
                   ?? throw new NotFoundException(nameof(User), userId);
        return ToDto(user);
    }

    public async Task ChangePasswordAsync(ChangePasswordRequest request, CancellationToken cancellationToken)
    {
        await changePasswordValidator.ValidateAndThrowAsync(request, cancellationToken);

        var userId = currentUser.UserId;
        var user = await db.Users.FirstOrDefaultAsync(u => u.Id == userId, cancellationToken)
                   ?? throw new NotFoundException(nameof(User), userId);

        if (passwords.Verify(user.PasswordHash, request.CurrentPassword) == PasswordVerifyResult.Failed)
        {
            throw new BusinessRuleException("Current password is incorrect.", "invalid_current_password");
        }

        user.PasswordHash = passwords.Hash(request.NewPassword);

        // Sign the user out everywhere; changed in the same SaveChanges for atomicity.
        await RevokeAllActiveAsync(userId, clock.GetUtcNow(), cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
    }

    private (AuthResponse Response, string RefreshHash) IssueTokens(User user, string? ipAddress)
    {
        var access = tokens.CreateAccessToken(user);
        var refresh = tokens.GenerateRefreshToken();

        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = refresh.Hash,
            ExpiresAt = refresh.ExpiresAt,
            CreatedByIp = ipAddress
        });

        var response = new AuthResponse(
            access.Token,
            access.ExpiresAt,
            refresh.RawToken,
            refresh.ExpiresAt,
            ToDto(user));

        return (response, refresh.Hash);
    }

    private async Task RevokeAllActiveAsync(Guid userId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var active = await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedAt == null)
            .ToListAsync(cancellationToken);

        foreach (var token in active)
        {
            token.RevokedAt = now;
        }
    }

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

    private static UserDto ToDto(User user) => new(user.Id, user.Email, user.FullName, user.DefaultCurrency);
}
