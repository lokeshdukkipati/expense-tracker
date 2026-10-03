using ExpenseTracker.Application.Accounts;
using ExpenseTracker.Application.Analytics;
using ExpenseTracker.Application.Auth;
using ExpenseTracker.Application.Budgets;
using ExpenseTracker.Application.Categories;
using ExpenseTracker.Application.Exports;
using ExpenseTracker.Application.Imports;
using ExpenseTracker.Application.Profile;
using ExpenseTracker.Application.Transactions;
using FluentValidation;
using Microsoft.Extensions.DependencyInjection;

namespace ExpenseTracker.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssemblyContaining<RegisterRequestValidator>();

        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IProfileService, ProfileService>();
        services.AddScoped<IAccountService, AccountService>();
        services.AddScoped<ICategoryService, CategoryService>();
        services.AddScoped<ITransactionService, TransactionService>();
        services.AddScoped<IImportService, ImportService>();
        services.AddScoped<IBudgetService, BudgetService>();
        services.AddScoped<IAnalyticsService, AnalyticsService>();
        services.AddScoped<IExportService, ExportService>();

        return services;
    }
}
