import { AuditableEntity } from './common.types';
import { TransactionType } from './transaction.model';

export type RecurringPaymentFrequency = 'week' | 'month' | 'year';
export type RecurringPaymentStatus = 'active' | 'inactive';

export interface RecurringPayment extends AuditableEntity {
  accountId: string;
  amount: number;
  type: TransactionType;
  categoryId: string;
  description: string;
  date: Date;
  notes?: string;
  tags?: string[];
  transferToAccountId?: string;
  frequency: RecurringPaymentFrequency;
  status: RecurringPaymentStatus;
}
