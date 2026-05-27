import { Injectable } from '@angular/core';
import { DatabaseService } from '../database/database.service';
import { RecurringPayment } from '../database/models';
import { TransactionRepository } from '../database/repositories';

export interface RecurringStartupReviewItem {
  recurringPaymentId: string;
  description: string;
  amount: number;
  type: RecurringPayment['type'];
  frequency: RecurringPayment['frequency'];
  scheduledDate: Date;
  accountName: string;
  categoryName: string;
}

export interface RecurringStartupCreationResult {
  created: number;
  skipped: number;
}

@Injectable({
  providedIn: 'root',
})
export class RecurringStartupService {
  private static readonly LAST_ACTION_AT_KEY = 'money-mate-recurring-review-last-action-at';

  constructor(
    private readonly db: DatabaseService,
    private readonly transactionRepository: TransactionRepository,
  ) {}

  getLastUserActionAt(): Date | null {
    const rawValue = localStorage.getItem(RecurringStartupService.LAST_ACTION_AT_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = new Date(rawValue);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }

    return parsed;
  }

  hasUserActionOnDate(referenceDate = new Date()): boolean {
    const lastActionAt = this.getLastUserActionAt();
    if (!lastActionAt) {
      return false;
    }

    return (
      lastActionAt.getFullYear() === referenceDate.getFullYear()
      && lastActionAt.getMonth() === referenceDate.getMonth()
      && lastActionAt.getDate() === referenceDate.getDate()
    );
  }

  markUserActionTimestamp(actionAt = new Date()): void {
    localStorage.setItem(RecurringStartupService.LAST_ACTION_AT_KEY, actionAt.toISOString());
  }

  async getMissingMonthlyRecurringPayments(
    referenceDate = new Date(),
    lastActionAt: Date | null = this.getLastUserActionAt(),
  ): Promise<RecurringStartupReviewItem[]> {
    const lowerBound = this.getLowerBoundDate(referenceDate, lastActionAt);
    const dueRecurringPayments = await this.getDueMonthlyRecurringPayments(referenceDate, lowerBound);
    if (dueRecurringPayments.length === 0) {
      return [];
    }

    const monthRange = this.getMonthDateRange(referenceDate);
    const recurringPaymentIds = dueRecurringPayments.map((item) => item.id);
    const monthlyTransactions = await this.transactionRepository.getTransactionsByRecurringPaymentIdsInDateRange(
      recurringPaymentIds,
      monthRange.start,
      monthRange.end,
    );

    const processedRecurringPaymentIds = new Set(
      monthlyTransactions
        .map((item) => item.recurringPaymentId)
        .filter((id): id is string => !!id),
    );

    const [accounts, categories] = await Promise.all([
      this.db.accounts.toArray(),
      this.db.categories.toArray(),
    ]);

    const accountNameById = new Map(accounts.map((account) => [account.id, account.name]));
    const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));

    return dueRecurringPayments
      .filter((item) => !processedRecurringPaymentIds.has(item.id))
      .map((item) => ({
        recurringPaymentId: item.id,
        description: item.description?.trim() || 'Untitled recurring payment',
        amount: Math.abs(item.amount),
        type: item.type,
        frequency: item.frequency,
        scheduledDate: this.getScheduledDateForMonth(item.date, referenceDate),
        accountName: accountNameById.get(item.accountId) || 'Unknown account',
        categoryName: item.type === 'transfer'
          ? 'Transfer'
          : (categoryNameById.get(item.categoryId) || 'Uncategorized'),
      }))
      .sort((left, right) => left.scheduledDate.getTime() - right.scheduledDate.getTime());
  }

  async createTransactionsForSelection(
    recurringPaymentIds: string[],
    referenceDate = new Date(),
  ): Promise<RecurringStartupCreationResult> {
    if (recurringPaymentIds.length === 0) {
      return { created: 0, skipped: 0 };
    }

    const lowerBound = this.getLowerBoundDate(referenceDate, this.getLastUserActionAt());
    const dueRecurringPayments = await this.getDueMonthlyRecurringPayments(referenceDate, lowerBound);
    const selectedRecurringPayments = dueRecurringPayments.filter((item) => recurringPaymentIds.includes(item.id));
    if (selectedRecurringPayments.length === 0) {
      return { created: 0, skipped: recurringPaymentIds.length };
    }

    const monthRange = this.getMonthDateRange(referenceDate);
    const existingTransactions = await this.transactionRepository.getTransactionsByRecurringPaymentIdsInDateRange(
      selectedRecurringPayments.map((item) => item.id),
      monthRange.start,
      monthRange.end,
    );

    const existingRecurringIds = new Set(
      existingTransactions
        .map((item) => item.recurringPaymentId)
        .filter((id): id is string => !!id),
    );

    const accounts = await this.db.accounts.toArray();
    const accountIdSet = new Set(accounts.filter((account) => !account.isDeleted).map((account) => account.id));

    let created = 0;
    let skipped = 0;

    for (const recurringPayment of selectedRecurringPayments) {
      if (existingRecurringIds.has(recurringPayment.id)) {
        skipped += 1;
        continue;
      }

      if (!accountIdSet.has(recurringPayment.accountId)) {
        skipped += 1;
        continue;
      }

      if (recurringPayment.type === 'transfer') {
        if (!recurringPayment.transferToAccountId || !accountIdSet.has(recurringPayment.transferToAccountId)) {
          skipped += 1;
          continue;
        }
      }

      try {
        await this.transactionRepository.createTransaction({
          accountId: recurringPayment.accountId,
          amount: Math.abs(recurringPayment.amount),
          type: recurringPayment.type,
          categoryId: recurringPayment.type === 'transfer' ? '' : (recurringPayment.categoryId || ''),
          description: recurringPayment.description?.trim() || 'Untitled recurring payment',
          date: this.getScheduledDateForMonth(recurringPayment.date, referenceDate),
          notes: recurringPayment.notes,
          tags: recurringPayment.tags,
          transferToAccountId: recurringPayment.type === 'transfer' ? recurringPayment.transferToAccountId : undefined,
          recurringPaymentId: recurringPayment.id,
        });
        created += 1;
      } catch (error) {
        console.error(`Failed to create startup recurring transaction for ${recurringPayment.id}:`, error);
        skipped += 1;
      }
    }

    return { created, skipped };
  }

  private async getDueMonthlyRecurringPayments(referenceDate: Date, lowerBound: Date): Promise<RecurringPayment[]> {
    const recurringPayments = await this.db.recurringPayments.toArray();
    return recurringPayments.filter((item) => {
      if (item.isDeleted || item.status !== 'active' || item.frequency !== 'month') {
        return false;
      }

      const scheduledDate = this.getScheduledDateForMonth(item.date, referenceDate);
      return scheduledDate.getTime() <= referenceDate.getTime() && scheduledDate.getTime() >= lowerBound.getTime();
    });
  }

  private getLowerBoundDate(referenceDate: Date, lastActionAt: Date | null): Date {
    const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    if (!lastActionAt) {
      return monthStart;
    }

    const actionDayStart = new Date(lastActionAt.getFullYear(), lastActionAt.getMonth(), lastActionAt.getDate());
    return actionDayStart > monthStart ? actionDayStart : monthStart;
  }

  private getMonthDateRange(referenceDate: Date): { start: Date; end: Date } {
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  private getScheduledDateForMonth(sourceDate: Date, referenceDate: Date): Date {
    const source = new Date(sourceDate);
    const maxDayInCurrentMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate();
    const day = Math.min(source.getDate(), maxDayInCurrentMonth);

    return new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      day,
      source.getHours(),
      source.getMinutes(),
      source.getSeconds(),
      source.getMilliseconds(),
    );
  }

}