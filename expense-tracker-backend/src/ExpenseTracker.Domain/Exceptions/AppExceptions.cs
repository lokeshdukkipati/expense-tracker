namespace ExpenseTracker.Domain.Exceptions;

/// <summary>
/// Base for expected, business-level failures. The API layer maps each subtype to an HTTP status
/// in one place (the global exception handler); the domain stays HTTP-agnostic.
/// </summary>
public abstract class AppException : Exception
{
    protected AppException(string message, string code, Exception? innerException = null)
        : base(message, innerException)
    {
        Code = code;
    }

    /// <summary>Stable machine-readable code the frontend can switch on.</summary>
    public string Code { get; }
}

public sealed class NotFoundException(string entity, object key)
    : AppException($"{entity} '{key}' was not found.", "not_found");

public sealed class ConflictException(string message, string code = "conflict")
    : AppException(message, code);

public sealed class UnauthorizedException(string message = "Authentication is required.")
    : AppException(message, "unauthorized");

public sealed class ForbiddenException(string message = "You do not have access to this resource.")
    : AppException(message, "forbidden");

public sealed class BusinessRuleException(string message, string code = "business_rule_violation")
    : AppException(message, code);
