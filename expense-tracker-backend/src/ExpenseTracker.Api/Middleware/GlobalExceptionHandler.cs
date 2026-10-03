using FluentValidation;
using ExpenseTracker.Domain.Exceptions;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace ExpenseTracker.Api.Middleware;

/// <summary>
/// Last line of defence for every unhandled exception. Expected failures (validation, not found, conflict...)
/// become precise 4xx responses; anything else becomes a generic 500 whose details are only logged,
/// never leaked to the client outside Development.
/// </summary>
public sealed class GlobalExceptionHandler(
    ILogger<GlobalExceptionHandler> logger,
    IProblemDetailsService problemDetailsService,
    IHostEnvironment environment) : IExceptionHandler
{
    private const int ClientClosedRequest = 499;

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        // The client went away (navigated, cancelled the request): not an error, nobody is listening.
        if (exception is OperationCanceledException && httpContext.RequestAborted.IsCancellationRequested)
        {
            logger.LogInformation("Request {Method} {Path} was cancelled by the client.",
                httpContext.Request.Method, httpContext.Request.Path);
            httpContext.Response.StatusCode = ClientClosedRequest;
            return true;
        }

        var problem = Map(exception);
        var status = problem.Status ?? StatusCodes.Status500InternalServerError;

        if (status >= StatusCodes.Status500InternalServerError)
        {
            logger.LogError(exception, "Unhandled exception for {Method} {Path}",
                httpContext.Request.Method, httpContext.Request.Path);
        }
        else
        {
            logger.LogWarning("Handled {ExceptionType} for {Method} {Path}: {Message}",
                exception.GetType().Name, httpContext.Request.Method, httpContext.Request.Path, exception.Message);
        }

        httpContext.Response.StatusCode = status;
        if (status == StatusCodes.Status401Unauthorized)
        {
            httpContext.Response.Headers.WWWAuthenticate = "Bearer";
        }

        return await problemDetailsService.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = problem,
            Exception = exception
        });
    }

    private ProblemDetails Map(Exception exception) => exception switch
    {
        ValidationException e => ApiProblem.Create(
            StatusCodes.Status400BadRequest, "Validation failed", "validation_failed",
            "One or more validation errors occurred.",
            e.Errors
                .GroupBy(x => ApiProblem.FieldName(x.PropertyName))
                .ToDictionary(g => g.Key, g => g.Select(x => x.ErrorMessage).Distinct().ToArray())),

        NotFoundException e => ApiProblem.Create(StatusCodes.Status404NotFound, "Resource not found", e.Code, e.Message),
        ConflictException e => ApiProblem.Create(StatusCodes.Status409Conflict, "Conflict", e.Code, e.Message),
        UnauthorizedException e => ApiProblem.Create(StatusCodes.Status401Unauthorized, "Unauthorized", e.Code, e.Message),
        ForbiddenException e => ApiProblem.Create(StatusCodes.Status403Forbidden, "Forbidden", e.Code, e.Message),
        BusinessRuleException e => ApiProblem.Create(StatusCodes.Status422UnprocessableEntity, "Business rule violated", e.Code, e.Message),

        // Must precede DbUpdateException: it is the more specific subtype.
        DbUpdateConcurrencyException => ApiProblem.Create(
            StatusCodes.Status409Conflict, "Concurrency conflict", "concurrency_conflict",
            "The record was modified by someone else. Reload and try again."),

        DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.UniqueViolation } } =>
            ApiProblem.Create(StatusCodes.Status409Conflict, "Duplicate value", "duplicate_value",
                "A record with the same unique value already exists."),

        DbUpdateException { InnerException: PostgresException { SqlState: PostgresErrorCodes.ForeignKeyViolation } } =>
            ApiProblem.Create(StatusCodes.Status409Conflict, "Reference conflict", "reference_conflict",
                "The operation conflicts with related records."),

        BadHttpRequestException e => ApiProblem.Create(
            e.StatusCode, "Bad request", "bad_request",
            environment.IsDevelopment() ? e.Message : "The request was malformed."),

        _ => ApiProblem.Create(
            StatusCodes.Status500InternalServerError, "Server error", "server_error",
            environment.IsDevelopment()
                ? exception.Message
                : "An unexpected error occurred. Please contact support and quote the trace id.")
    };
}
