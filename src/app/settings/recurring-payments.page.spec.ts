import { ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { DatabaseService } from '../core/database/database.service';
import { RecurringPayment, Transaction } from '../core/database/models';
import { AccountRepository, CategoryRepository, TransactionRepository } from '../core/database/repositories';
import { RecurringPaymentsPage } from './recurring-payments.page';

describe('RecurringPaymentsPage', () => {
  it('shows the latest transaction date for each recurring payment', async () => {
    const recurringPayment: RecurringPayment = {
      id: 'recurring-payment-1',
      accountId: 'account-1',
      amount: 25,
      type: 'expense',
      categoryId: 'category-1',
      description: 'Subscription',
      date: new Date('2025-01-01'),
      frequency: 'month',
      status: 'active',
      isDeleted: false,
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      createdBy: 'test',
    };
    const transactions: Transaction[] = [
      {
        id: 'transaction-2',
        accountId: 'account-1',
        amount: 25,
        type: 'expense',
        categoryId: 'category-1',
        description: 'Subscription',
        date: new Date('2025-03-01'),
        recurringPaymentId: recurringPayment.id,
        isDeleted: false,
        createdAt: new Date('2025-03-01'),
        updatedAt: new Date('2025-03-01'),
        createdBy: 'test',
      },
      {
        id: 'transaction-1',
        accountId: 'account-1',
        amount: 25,
        type: 'expense',
        categoryId: 'category-1',
        description: 'Subscription',
        date: new Date('2025-02-01'),
        recurringPaymentId: recurringPayment.id,
        isDeleted: false,
        createdAt: new Date('2025-02-01'),
        updatedAt: new Date('2025-02-01'),
        createdBy: 'test',
      },
    ];
    const db = {
      recurringPayments: {
        orderBy: () => ({
          reverse: () => ({
            toArray: async () => [recurringPayment],
          }),
        }),
      },
    } as unknown as DatabaseService;
    const transactionRepository = {
      getTransactionsByRecurringPaymentIdsInDateRange: async () => [],
      queryTransactions: async () => transactions,
    } as unknown as TransactionRepository;
    const page = new RecurringPaymentsPage(
      db,
      { getAccountsForSettings: async () => [] } as unknown as AccountRepository,
      { getCategoriesForSettings: async () => [] } as unknown as CategoryRepository,
      transactionRepository,
      { navigate: async () => true } as unknown as Router,
      { markForCheck: () => {} } as ChangeDetectorRef,
    );

    await page['loadRecurringPayments']();

    expect(page.getLatestTransactionDate(recurringPayment)).toEqual(new Date('2025-03-01'));
  });
});
