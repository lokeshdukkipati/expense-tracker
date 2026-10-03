using ExpenseTracker.Api.Extensions;
using ExpenseTracker.Application;
using ExpenseTracker.Infrastructure;
using ExpenseTracker.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Serilog;

// Bootstrap logger captures failures that happen before configuration is loaded.
Log.Logger = new LoggerConfiguration().WriteTo.Console().CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Host.UseSerilog((context, services, configuration) => configuration
        .ReadFrom.Configuration(context.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext()
        .Enrich.WithProperty("Environment", context.HostingEnvironment.EnvironmentName));

    builder.Services
        .AddApplication()
        .AddInfrastructure(builder.Configuration)
        .AddApi(builder.Configuration);

    var app = builder.Build();

    // Convenience for Development only (Database:AutoMigrate=true there). In Production, migrations are
    // applied deliberately with `dotnet ef database update`, never implicitly on startup.
    if (app.Configuration.GetValue<bool>("Database:AutoMigrate"))
    {
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (db.Database.GetMigrations().Any())
        {
            await db.Database.MigrateAsync();
        }
        else
        {
            Log.Warning(
                "No EF Core migrations exist yet, so no tables were created. Run: " +
                "dotnet ef migrations add InitialCreate -p src/ExpenseTracker.Infrastructure -s src/ExpenseTracker.Api");
        }
    }

    app.UseApiPipeline();
    await app.RunAsync();
    return 0;
}
catch (Exception ex) when (ex is not HostAbortedException) // EF tooling aborts the host on purpose
{
    Log.Fatal(ex, "Host terminated unexpectedly");
    return 1;
}
finally
{
    await Log.CloseAndFlushAsync();
}

// Exposes the entry point to WebApplicationFactory in integration tests.
public partial class Program;
