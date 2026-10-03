using ExpenseTracker.Application.Abstractions;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace ExpenseTracker.Infrastructure.Security;

/// <summary>
/// PBKDF2 (HMAC-SHA512) via ASP.NET Core Identity's hasher, with a raised iteration count.
/// Hashes created with a lower count are transparently upgraded on next successful login.
/// </summary>
public sealed class PasswordService : IPasswordService
{
    private readonly PasswordHasher<string> _hasher =
        new(Options.Create(new PasswordHasherOptions { IterationCount = 210_000 }));

    public string Hash(string password) => _hasher.HashPassword(string.Empty, password);

    public PasswordVerifyResult Verify(string passwordHash, string password) =>
        _hasher.VerifyHashedPassword(string.Empty, passwordHash, password) switch
        {
            PasswordVerificationResult.Success => PasswordVerifyResult.Success,
            PasswordVerificationResult.SuccessRehashNeeded => PasswordVerifyResult.SuccessRehashNeeded,
            _ => PasswordVerifyResult.Failed
        };
}
