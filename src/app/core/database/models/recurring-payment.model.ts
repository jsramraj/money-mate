import { AuditableEntity } from './common.types';
import { TransactionType } from './transaction.model';

export type RecurringPaymentFrequency = 'week' | 'month' | 'year' | 'once';
export type RecurringPaymentStatus = 'active' | 'paused' | 'cancelled';

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
