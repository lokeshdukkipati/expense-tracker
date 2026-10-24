using ExpenseTracker.Application.Accounts;
using ExpenseTracker.Application.Achievements;
using ExpenseTracker.Application.Analytics;
using ExpenseTracker.Application.Auth;
using ExpenseTracker.Application.Budgets;
using ExpenseTracker.Application.Categories;
using ExpenseTracker.Application.Exports;
using ExpenseTracker.Application.Goals;
using ExpenseTracker.Application.Imports;
using ExpenseTracker.Application.NetWorth;
using ExpenseTracker.Application.Preferences;
using ExpenseTracker.Application.Profile;
using ExpenseTracker.Application.Rules;
using ExpenseTracker.Application.SampleData;
using ExpenseTracker.Application.Transactions;
using ExpenseTracker.Application.Transfers;
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
        services.AddScoped<ITransferService, TransferService>();
        services.AddScoped<IGoalService, GoalService>();
        services.AddScoped<IRuleService, RuleService>();
        services.AddScoped<IPreferencesService, PreferencesService>();
        services.AddScoped<INetWorthService, NetWorthService>();
        services.AddScoped<IAchievementService, AchievementService>();
        services.AddScoped<IDuplicateChargeService, DuplicateChargeService>();
        services.AddScoped<ISampleDataService, SampleDataService>();

        return services;
    }
}
