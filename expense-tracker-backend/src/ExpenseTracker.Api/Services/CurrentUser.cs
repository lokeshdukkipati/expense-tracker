using System.Security.Claims;
using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Domain.Exceptions;

namespace ExpenseTracker.Api.Services;

public sealed class CurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    public bool IsAuthenticated => accessor.HttpContext?.User.Identity?.IsAuthenticated == true;

    public Guid UserId =>
        Guid.TryParse(accessor.HttpContext?.User.FindFirstValue("sub"), out var id)
            ? id
            : throw new UnauthorizedException();
}
