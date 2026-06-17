import { AuditableEntity } from './common.types';

export interface Transaction extends AuditableEntity {
  accountId: string; // Which account this affects
  amount: number; // Positive for income, negative for expenses
  type: 'income' | 'expense' | 'transfer';
  categoryId: string; // Links to category
  description: string; // "Grocery shopping", "Salary deposit"
  date: Date; // When transaction occurred
  notes?: string; // Optional additional details
  tags?: string[]; // Optional tags for flexible filtering
  transferToAccountId?: string; // For transfer transactions
  recurringPaymentId?: string;
}

export type TransactionType = Transaction['type'];
export type RecurrenceSelection = 'never' | 'monthly' | 'returnable';