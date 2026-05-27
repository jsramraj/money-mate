import { Routes } from '@angular/router';
import { appEntryGuard } from './core/guards/entry.guard';
import { LinkedSheetPage } from './settings/linked-sheet.page';

export const routes: Routes = [
  {
    path: 'auth/callback',
    loadComponent: () => import('./auth').then((m) => m.LoginPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./auth').then((m) => m.LoginPage),
  },
  {
    path: 'onboarding',
    loadComponent: () => import('./auth').then((m) => m.SheetOnboardingPage),
  },
  {
    path: 'onboarding-categories',
    loadComponent: () => import('./onboarding/onboarding-categories.page').then(m => m.OnboardingCategoriesPage),
  },
  {
    path: '',
    canMatch: [appEntryGuard],
    loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
  {
    path: 'settings/categories/new',
    loadComponent: () => import('./categories/category-form.page').then((m) => m.CategoryFormPage),
  },
  {
    path: 'settings/categories/:id',
    loadComponent: () => import('./categories/category-form.page').then((m) => m.CategoryFormPage),
  },
  {
    path: 'settings/categories',
    loadComponent: () => import('./categories').then((m) => m.CategoriesPage),
  },
  {
    path: 'settings/accounts/new',
    loadComponent: () => import('./accounts/account-form.page').then((m) => m.AccountFormPage),
  },
  {
    path: 'settings/accounts/:id',
    loadComponent: () => import('./accounts/account-form.page').then((m) => m.AccountFormPage),
  },
  {
    path: 'settings/accounts',
    loadComponent: () => import('./accounts').then((m) => m.AccountsPage),
  },
  {
    path: 'settings/budgets/new',
    loadComponent: () => import('./budgets/budget-form.page').then((m) => m.BudgetFormPage),
  },
  {
    path: 'settings/budgets/:id',
    loadComponent: () => import('./budgets/budget-form.page').then((m) => m.BudgetFormPage),
  },
  {
    path: 'settings/budgets',
    loadComponent: () => import('./budgets/budgets.page').then((m) => m.BudgetsPage),
  },
  {
    path: 'settings/linked-sheet',
    component: LinkedSheetPage,
  },
  {
    path: 'settings/recurring-payments/:id',
    loadComponent: () => import('./settings/recurring-payment-detail.page').then((m) => m.RecurringPaymentDetailPage),
  },
  {
    path: 'settings/recurring-payments',
    loadComponent: () => import('./settings/recurring-payments.page').then((m) => m.RecurringPaymentsPage),
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'settings/about',
    loadComponent: () => import('./about/about.page').then((m) => m.AboutPage),
  },
  {
    path: 'imports/transactions/csv',
    loadComponent: () => import('./imports').then((m) => m.TransactionCsvImportPage),
  },
  {
    path: 'imports/transactions/quick-add',
    loadComponent: () => import('./imports').then((m) => m.TransactionQuickAddPage),
  },
  {
    path: 'dashboard/customize',
    loadComponent: () => import('./dashboard/dashboard-customize.page').then((m) => m.DashboardCustomizePage),
  },
];
