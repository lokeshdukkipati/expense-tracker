# Expense Tracker - Backend (.NET 9, PostgreSQL)

Clean Architecture: `Domain` -> `Application` -> `Infrastructure` -> `Api`, plus `tests`.
Open this folder in VS Code and run `dotnet build` (the solution file is at the root).

## Prerequisites
- .NET 9 SDK, PostgreSQL 15+ (pgAdmin), `dotnet tool install --global dotnet-ef --version "9.*"`

## First-time setup
1. In pgAdmin create two databases: `expensetracker_dev` and `expensetracker_prod`.
2. Store the dev connection string outside source control:

       cd src/ExpenseTracker.Api
       dotnet user-secrets set "ConnectionStrings:Default" "Host=localhost;Port=5432;Database=expensetracker_dev;Username=postgres;Password=YOUR_PASSWORD"
       cd ../..

3. Build and create the initial migration (once):

       dotnet build
       dotnet ef migrations add InitialCreate -p src/ExpenseTracker.Infrastructure -s src/ExpenseTracker.Api

## Run (both environments can run at the same time)
| | Development | Production |
|---|---|---|
| Command | `dotnet run --project src/ExpenseTracker.Api --launch-profile Development` | `dotnet run --project src/ExpenseTracker.Api --launch-profile Production` |
| VS Code | Run and Debug -> "API - Development" | Run and Debug -> "API - Production" |
| API | http://localhost:5100 (Swagger at /swagger) | http://localhost:5200 |
| Angular (next phase) | :4200 | :4300 |
| Database | expensetracker_dev (auto-migrated on start) | expensetracker_prod (never auto-migrated) |
| Secrets | user-secrets | environment variables / `.env.production` |
| JWT issuer | expensetracker-dev | expensetracker |
| Logs | logs/dev | logs/prod |

Production setup: copy `.env.production.example` to `.env.production` (git-ignored) and fill in the password and a random
`Jwt__SigningKey` of 64+ characters, then apply migrations deliberately:

    # PowerShell
    $env:ASPNETCORE_ENVIRONMENT="Production"; $env:ConnectionStrings__Default="Host=localhost;Port=5432;Database=expensetracker_prod;Username=postgres;Password=YOUR_PASSWORD"
    dotnet ef database update -p src/ExpenseTracker.Infrastructure -s src/ExpenseTracker.Api

The app refuses to start if the connection string or signing key is missing. Tokens from one environment are rejected by the other.

## Tests
`dotnet test` - fingerprinting, CSV safety, time zones, recurring detection, statistics, budget periods, Excel parsing.

## API (all under /api/v1, JWT bearer unless noted)
| Area | Endpoints |
|---|---|
| Auth (anonymous, rate limited) | POST auth/register, auth/login, auth/refresh, auth/logout; GET auth/me; POST auth/change-password |
| Profile | PUT profile; DELETE profile (password required, deletes all data) |
| Accounts | GET/POST accounts; GET/PUT/DELETE accounts/{id} (balances included) |
| Categories | GET/POST categories; PUT/DELETE categories/{id} (two levels: category and subcategory) |
| Transactions | GET (paged, filters, search, sort) / POST transactions; GET/PUT/DELETE transactions/{id}; POST transactions/bulk-delete; GET transactions/export?format=Csv\|Xlsx |
| Import | POST imports/preview (dry run); POST imports (commit); GET imports (history); DELETE imports/{id} (undo) |
| Budgets | GET/POST budgets; PUT/DELETE budgets/{id}; GET budgets/status |
| Analytics | summary, categories, category-comparison, trend, patterns, top-descriptions, recurring, anomalies, forecast, tags |

Analytics accept `from`, `to`, `accountId`, `categoryId`, `timeZone` (IANA id such as Asia/Kolkata); no dates = current month.

## How duplicate imports are prevented
1. **Same file:** a SHA-256 of the file bytes is stored per user (unique index). The identical file is rejected.
2. **Overlapping files:** every row gets a fingerprint (user, timestamp to the second, type, amount, currency, account,
   category, text - case and whitespace insensitive) stored on the transaction with a unique index. A newer export that
   contains old rows imports only the new ones. Identical rows inside one file get an occurrence counter so none is lost.
3. Fingerprints survive edits and soft-deletes, so edited or deleted rows are never resurrected by a re-import.
4. Undo (DELETE imports/{id}) removes the batch and its rows so the file can be imported again.
5. The unique indexes also protect against two simultaneous uploads.

## Error contract (global exception handler)
Every failure is RFC 9457 ProblemDetails: `status`, `title`, `detail`, `code` (stable, machine readable),
`traceId`, and for validation `errors` (field -> messages). 499 is returned silently when the client cancels.
