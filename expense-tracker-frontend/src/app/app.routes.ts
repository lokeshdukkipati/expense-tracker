import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in · Expense Tracker',
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    title: 'Create account · Expense Tracker',
    loadComponent: () => import('./features/auth/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Dashboard · Expense Tracker',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'transactions',
        title: 'Transactions · Expense Tracker',
        loadComponent: () => import('./features/transactions/transactions.component').then((m) => m.TransactionsComponent),
      },
      {
        path: 'analytics',
        loadComponent: () => import('./features/analytics/analytics-shell.component').then((m) => m.AnalyticsShellComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'overview' },
          {
            path: 'overview',
            title: 'Analytics · Overview',
            loadComponent: () => import('./features/analytics/overview.component').then((m) => m.OverviewComponent),
          },
          {
            path: 'categories',
            title: 'Analytics · Categories',
            loadComponent: () => import('./features/analytics/categories-tab.component').then((m) => m.CategoriesTabComponent),
          },
          {
            path: 'trends',
            title: 'Analytics · Trends',
            loadComponent: () => import('./features/analytics/trends.component').then((m) => m.TrendsComponent),
          },
          {
            path: 'patterns',
            title: 'Analytics · Patterns',
            loadComponent: () => import('./features/analytics/patterns.component').then((m) => m.PatternsComponent),
          },
          {
            path: 'merchants',
            title: 'Analytics · Merchants',
            loadComponent: () => import('./features/analytics/merchants.component').then((m) => m.MerchantsComponent),
          },
          {
            path: 'recurring',
            title: 'Analytics · Recurring',
            loadComponent: () => import('./features/analytics/recurring.component').then((m) => m.RecurringComponent),
          },
          {
            path: 'insights',
            title: 'Analytics · Insights Lab',
            loadComponent: () => import('./features/analytics/insights-lab.component').then((m) => m.InsightsLabComponent),
          },
        ],
      },
      {
        path: 'budgets',
        title: 'Budgets · Expense Tracker',
        loadComponent: () => import('./features/budgets/budgets.component').then((m) => m.BudgetsComponent),
      },
      {
        path: 'accounts',
        title: 'Accounts · Expense Tracker',
        loadComponent: () => import('./features/accounts/accounts.component').then((m) => m.AccountsComponent),
      },
      {
        path: 'categories',
        title: 'Categories · Expense Tracker',
        loadComponent: () => import('./features/categories/categories.component').then((m) => m.CategoriesComponent),
      },
      {
        path: 'import',
        title: 'Import · Expense Tracker',
        loadComponent: () => import('./features/imports/imports.component').then((m) => m.ImportsComponent),
      },
      {
        path: 'settings',
        title: 'Settings · Expense Tracker',
        loadComponent: () => import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },
  {
    path: '**',
    title: 'Not found · Expense Tracker',
    loadComponent: () => import('./features/settings/not-found.component').then((m) => m.NotFoundComponent),
  },
];
