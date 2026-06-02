import { Type } from '@angular/core';
import { AccountBalanceCarouselComponent } from './widgets/account-balance-carousel/account-balance-carousel.component';
import { BudgetVsActualWidgetComponent } from './widgets/budget-vs-actual/budget-vs-actual-widget.component';
import { DailyExpensesWidgetComponent } from './widgets/daily-expenses/daily-expenses-widget.component';
import { ExpenseBreakdownWidgetComponent } from './widgets/expense-breakdown/expense-breakdown-widget.component';
import { ExpenseComparisonWidgetComponent } from './widgets/expense-comparison/expense-comparison-widget.component';
import { RecentTransactionsWidgetComponent } from './widgets/recent-transactions/recent-transactions-widget.component';
import { UpcomingPaymentsWidgetComponent } from './widgets/upcoming-payments/upcoming-payments-widget.component';

export type DashboardWidgetId =
  | 'top-summary'
  | 'budget-vs-actual'
  | 'daily-expenses'
  | 'expense-breakdown'
  | 'expense-comparison'
  | 'recent-transactions'
  | 'upcoming-payments';

export interface DashboardWidgetDefinition {
  id: DashboardWidgetId;
  title: string;
  subtitle: string;
  component: Type<unknown>;
  /** Whether the widget is visible by default. Defaults to true when omitted. */
  defaultVisible?: boolean;
}

export const DASHBOARD_WIDGET_DEFINITIONS: DashboardWidgetDefinition[] = [
  {
    id: 'top-summary',
    title: 'Account Balance',
    subtitle: 'All your account balances',
    component: AccountBalanceCarouselComponent
  },
  {
    id: 'budget-vs-actual',
    title: 'Budget vs Actual',
    subtitle: 'Compare budget targets against actual spend',
    component: BudgetVsActualWidgetComponent,
    defaultVisible: false,
  },
  {
    id: 'expense-breakdown',
    title: 'Expense Breakdown',
    subtitle: 'Category-wise expense overview',
    component: ExpenseBreakdownWidgetComponent,
    defaultVisible: false
  },
  {
    id: 'daily-expenses',
    title: 'Daily Expenses Trends',
    subtitle: 'Day-wise expenses: this month vs last month',
    component: DailyExpensesWidgetComponent,
    defaultVisible: false
  },
  {
    id: 'expense-comparison',
    title: 'Expense Comparison',
    subtitle: 'This month vs monthly average by category',
    component: ExpenseComparisonWidgetComponent,
    defaultVisible: false
  },
  {
    id: 'recent-transactions',
    title: 'Recent Transactions',
    subtitle: 'Latest 5 to 10 transactions',
    component: RecentTransactionsWidgetComponent
  }
  ,
  {
    id: 'upcoming-payments',
    title: 'Upcoming Payments',
    subtitle: 'Next scheduled recurring payments',
    component: UpcomingPaymentsWidgetComponent,
    defaultVisible: false,
  }
];

export const DASHBOARD_WIDGET_BY_ID = new Map<DashboardWidgetId, DashboardWidgetDefinition>(
  DASHBOARD_WIDGET_DEFINITIONS.map((widget) => [widget.id, widget])
);
