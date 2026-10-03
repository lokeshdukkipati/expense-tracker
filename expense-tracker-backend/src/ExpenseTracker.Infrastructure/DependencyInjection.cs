using ExpenseTracker.Application.Abstractions;
using ExpenseTracker.Application.Exports;
using ExpenseTracker.Application.Imports;
using ExpenseTracker.Infrastructure.Imports;
using ExpenseTracker.Infrastructure.Persistence;
using ExpenseTracker.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ExpenseTracker.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        // Fail fast at startup if the JWT configuration is missing or weak.
        services.AddOptions<JwtOptions>()
            .Bind(configuration.GetSection(JwtOptions.SectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();

        var connectionString = configuration.GetConnectionString("Default");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "ConnectionStrings:Default is not configured. Set it via user-secrets (Development) or the ConnectionStrings__Default environment variable (Production).");
        }

        var sensitiveLogging = configuration.GetValue<bool>("Database:EnableSensitiveDataLogging");
        var commandTimeout = configuration.GetValue("Database:CommandTimeoutSeconds", 30);

        services.AddSingleton(TimeProvider.System);

        services.AddDbContext<AppDbContext>(options =>
        {
            options.UseNpgsql(connectionString, npgsql =>
            {
                npgsql.EnableRetryOnFailure(maxRetryCount: 3, maxRetryDelay: TimeSpan.FromSeconds(5), errorCodesToAdd: null);
                npgsql.CommandTimeout(commandTimeout);
            });
            options.UseSnakeCaseNamingConvention();

            if (sensitiveLogging)
            {
                options.EnableSensitiveDataLogging();
                options.EnableDetailedErrors();
            }
        });

        services.AddScoped<IAppDbContext>(sp => sp.GetRequiredService<AppDbContext>());
        services.AddSingleton<IPasswordService, PasswordService>();
        services.AddSingleton<ITokenService, JwtTokenService>();

        services.AddSingleton(configuration.GetSection("Import").Get<ImportOptions>() ?? new ImportOptions());
        services.AddSingleton<IImportParser, MoneyManagerXlsxParser>();
        services.AddSingleton<ISpreadsheetWriter, ClosedXmlSpreadsheetWriter>();

        return services;
    }
}
