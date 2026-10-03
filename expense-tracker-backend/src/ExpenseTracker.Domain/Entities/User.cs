using ExpenseTracker.Domain.Common;

namespace ExpenseTracker.Domain.Entities;

public class User : BaseEntity
{
    /// <summary>Always stored trimmed and lower-cased.</summary>
    public string Email { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public string FullName { get; set; } = string.Empty;

    /// <summary>ISO 4217 code, e.g. INR.</summary>
    public string DefaultCurrency { get; set; } = "INR";

    public bool IsActive { get; set; } = true;

    public int FailedLoginCount { get; set; }

    public DateTimeOffset? LockoutEnd { get; set; }

    public DateTimeOffset? LastLoginAt { get; set; }

    public ICollection<RefreshToken> RefreshTokens { get; set; } = new List<RefreshToken>();
}
