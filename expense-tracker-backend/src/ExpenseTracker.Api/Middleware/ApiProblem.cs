using System.Text.Json;
using Microsoft.AspNetCore.Mvc;

namespace ExpenseTracker.Api.Middleware;

/// <summary>
/// Single place that shapes every error response (RFC 9457 ProblemDetails plus a stable
/// <c>code</c> and an optional field-level <c>errors</c> map the Angular client can consume).
/// </summary>
public static class ApiProblem
{
    public static ProblemDetails Create(
        int status,
        string title,
        string code,
        string? detail = null,
        IReadOnlyDictionary<string, string[]>? errors = null)
    {
        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Detail = detail,
            Type = $"https://httpstatuses.io/{status}"
        };

        problem.Extensions["code"] = code;
        if (errors is { Count: > 0 })
        {
            problem.Extensions["errors"] = errors;
        }

        return problem;
    }

    /// <summary>"$.email", "Email" or "Address.Street" -> "email", "email", "address.street".</summary>
    public static string FieldName(string key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return "request";
        }

        var trimmed = key.StartsWith("$.", StringComparison.Ordinal) ? key[2..] : key;
        return string.Join('.', trimmed.Split('.').Select(part => JsonNamingPolicy.CamelCase.ConvertName(part)));
    }
}
