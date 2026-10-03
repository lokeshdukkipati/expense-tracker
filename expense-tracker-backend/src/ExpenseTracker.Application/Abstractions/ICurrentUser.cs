namespace ExpenseTracker.Application.Abstractions;

public interface ICurrentUser
{
    bool IsAuthenticated { get; }

    /// <summary>The authenticated user's id. Throws <c>UnauthorizedException</c> when anonymous.</summary>
    Guid UserId { get; }
}
