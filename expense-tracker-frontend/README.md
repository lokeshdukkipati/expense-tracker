# Expense Tracker - Frontend (Angular 19)

Standalone components, signals, lazy-loaded routes, custom SVG charts, no UI framework.
Works from small phones to wide desktops (sidebar on desktop, bottom navigation on phones).

## Requirements
- Node.js 20.11+ or 22 (check with `node --version`)
- npm 10+ (comes with Node)
- The backend running (see below)

## Setup (once)

    cd D:\ExpenseTracker\expense-tracker-frontend
    npm install

## Run

| | Development | Production build |
|---|---|---|
| Command | `npm start` | `npm run start:prod` |
| Open | http://localhost:4200 | http://localhost:4300 |
| Talks to API | http://localhost:5100/api/v1 | http://localhost:5200/api/v1 |
| Backend profile | `--launch-profile Development` | `--launch-profile Production` |

Both can run at the same time.

## Configuration
API addresses live in two small files; nothing else needs configuring:
- `src/environments/environment.ts` (development)
- `src/environments/environment.prod.ts` (production, used by `npm run build` and `npm run start:prod`)

When you deploy, set `apiUrl` in `environment.prod.ts` to your public API address (for example
`https://api.yourdomain.com/api/v1`), run `npm run build`, and upload the contents of `dist/expense-tracker/browser`.
The backend must list your site's address under `Cors:AllowedOrigins`.

## Scripts
- `npm start` - dev server on :4200
- `npm run start:prod` - optimised build served on :4300
- `npm run build` - production build into `dist/expense-tracker/browser`
- `npm run build:dev` - development build
- `npm test` - unit tests (needs Chrome installed)

## Keyboard shortcuts
`n` new transaction, `/` focus search, `Esc` closes dialogs, `Ctrl+Enter` saves the transaction form.

## Structure
- `src/app/core` - models, API clients, interceptors (auth, loading, errors), global error handler, services, analytics logic
- `src/app/shared` - UI building blocks (select, paginator, timeline filter, overlay, toasts) and SVG charts
- `src/app/layout` - responsive shell
- `src/app/features` - dashboard, transactions, analytics (7 tabs), budgets, accounts, categories, import, settings, auth
