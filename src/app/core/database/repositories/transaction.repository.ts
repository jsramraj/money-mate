import { Injectable } from '@angular/core';
import { BehaviorSubject, map, Observable } from 'rxjs';
import { DatabaseService } from '../database.service';
import { GUEST_USER_NAME, Transaction, TransactionType } from '../models';

export interface CreateTransactionInput {
  accountId: string;
  amount: number; // always positive from UI
  type: TransactionType;
  categoryId: string;
  description: string;
  date: Date;
  notes?: string;
  tags?: string[];
  transferToAccountId?: string;
  recurringPaymentId?: string;
}

export interface UpdateTransactionInput extends CreateTransactionInput {
  id: string;
  isDeleted?: boolean;
}

export interface TransactionQueryFilters {
  accountIds?: string[];
  types?: TransactionType[];
  categoryIds?: string[];
  recurringPaymentIds?: string[];
}

export interface TransactionDateRange {
  startDate: Date;
  endDate: Date;
}

export interface TransactionQueryOptions {
  limit?: number;
  dateRange?: TransactionDateRange;
  includeDeleted?: boolean;
  sortDirection?: 'asc' | 'desc';
}

@Injectable({
  providedIn: 'root'
})
export class TransactionRepository {
  private transactionsSubject = new BehaviorSubject<Transaction[]>([]);
  public transactions$ = this.transactionsSubject.asObservable();
  private recentTransactionsSubject = new BehaviorSubject<Transaction[]>([]);
  public recentTransactions$ = this.recentTransactionsSubject.asObservable();
  private readonly recentTransactionsCacheSize = 10;

  constructor(private db: DatabaseService) {}

  async createTransaction(input: CreateTransactionInput): Promise<Transaction> {
    const now = new Date();
    const id = crypto.randomUUID();

    const storedAmount = Math.abs(input.amount);
    const balanceAmount = input.type === 'expense' ? -storedAmount : storedAmount;

    const transaction: Transaction = {
      id,
      accountId: input.accountId,
      amount: storedAmount,
      type: input.type,
      categoryId: input.categoryId,
      description: input.description,
      date: input.date,
      notes: input.notes,
      tags: input.tags ?? [],
      transferToAccountId: input.transferToAccountId,
      recurringPaymentId: input.recurringPaymentId,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      createdBy: GUEST_USER_NAME,
      updatedBy: GUEST_USER_NAME,
    };

    await this.db.transaction('rw', [this.db.transactions, this.db.accounts], async () => {
      await this.db.transactions.add(transaction);

      if (input.type === 'transfer' && input.transferToAccountId) {
        // Debit source account
        const source = await this.db.accounts.get(input.accountId);
        if (source) {
          await this.db.accounts.update(input.accountId, {
            balance: source.balance - Math.abs(input.amount),
            updatedAt: now
          });
        }
        // Credit destination account
        const dest = await this.db.accounts.get(input.transferToAccountId);
        if (dest) {
          await this.db.accounts.update(input.transferToAccountId, {
            balance: dest.balance + Math.abs(input.amount),
            updatedAt: now
          });
        }
      } else {
        const account = await this.db.accounts.get(input.accountId);
        if (account) {
          await this.db.accounts.update(input.accountId, {
            balance: account.balance + balanceAmount,
            updatedAt: now
          });
        }
      }
    });

    await this.refreshTransactionStreams();

    return transaction;
  }

  async updateTransaction(input: UpdateTransactionInput): Promise<Transaction> {
    const now = new Date();

    const storedAmount = Math.abs(input.amount);
    const balanceAmount = input.type === 'expense' ? -storedAmount : storedAmount;

    const oldTx = await this.db.transactions.get(input.id);
    if (!oldTx) {
      throw new Error(`Transaction ${input.id} not found`);
    }

    const updated: Transaction = {
        ...oldTx,
        accountId: input.accountId,
        amount: storedAmount,
        type: input.type,
        categoryId: input.categoryId,
        description: input.description,
        date: input.date,
        notes: input.notes,
        tags: input.tags ?? [],
        transferToAccountId: input.type === 'transfer' ? input.transferToAccountId : undefined,
        recurringPaymentId: input.recurringPaymentId,
        isDeleted: input.isDeleted ?? false,
        updatedAt: now,
        updatedBy: GUEST_USER_NAME,
      };

    await this.db.transaction('rw', [this.db.transactions, this.db.accounts], async () => {
      // Reverse old transaction's balance effect
      if (oldTx.type === 'transfer' && oldTx.transferToAccountId) {
        const oldSource = await this.db.accounts.get(oldTx.accountId);
        if (oldSource) {
          await this.db.accounts.update(oldTx.accountId, { balance: oldSource.balance + Math.abs(oldTx.amount), updatedAt: now });
        }
        const oldDest = await this.db.accounts.get(oldTx.transferToAccountId);
        if (oldDest) {
          await this.db.accounts.update(oldTx.transferToAccountId, { balance: oldDest.balance - Math.abs(oldTx.amount), updatedAt: now });
        }
      } else {
        const oldAccount = await this.db.accounts.get(oldTx.accountId);
        if (oldAccount) {
          const oldAppliedAmount = oldTx.type === 'expense' ? -Math.abs(oldTx.amount) : Math.abs(oldTx.amount);
          await this.db.accounts.update(oldTx.accountId, { balance: oldAccount.balance - oldAppliedAmount, updatedAt: now });
        }
      }

      // Apply new transaction's balance effect
      if (!updated.isDeleted) {
        if (input.type === 'transfer' && input.transferToAccountId) {
          const newSource = await this.db.accounts.get(input.accountId);
          if (newSource) {
            await this.db.accounts.update(input.accountId, { balance: newSource.balance - Math.abs(input.amount), updatedAt: now });
          }
          const newDest = await this.db.accounts.get(input.transferToAccountId);
          if (newDest) {
            await this.db.accounts.update(input.transferToAccountId, { balance: newDest.balance + Math.abs(input.amount), updatedAt: now });
          }
        } else {
          const newAccount = await this.db.accounts.get(input.accountId);
          if (newAccount) {
            await this.db.accounts.update(input.accountId, { balance: newAccount.balance + balanceAmount, updatedAt: now });
          }
        }
      }

      await this.db.transactions.put(updated);
    });

    await this.refreshTransactionStreams();
    return updated;
  }

  /**
   * Archive (soft-delete) a transaction by setting isDeleted to true.
   * Does not affect account balances.
   */
  async archiveTransaction(id: string): Promise<Transaction> {
    const transaction = await this.db.transactions.get(id);
    if (!transaction) {
      throw new Error(`Transaction ${id} not found`);
    }
    transaction.isDeleted = true;
    transaction.amount = 0;
    return this.updateTransaction(transaction as UpdateTransactionInput);
  }

  async getTransactionById(id: string): Promise<Transaction | undefined> {
    try {
      return await this.db.transactions.get(id);
    } catch (error) {
      console.error(`Error fetching transaction ${id}:`, error);
      throw new Error('Failed to fetch transaction');
    }
  }

  async getTransactionsByAccount(accountId: string): Promise<Transaction[]> {
    try {
      return await this.queryTransactions(
        { accountIds: [accountId] },
        { sortDirection: 'asc' }
      );
    } catch (error) {
      console.error('Error fetching transactions by account:', error);
      throw new Error('Failed to fetch transactions');
    }
  }

  async getAllTransactions(): Promise<Transaction[]> {
    try {
      const transactions = await this.queryTransactions();
      this.transactionsSubject.next(transactions);
      return transactions;
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw new Error('Failed to fetch transactions');
    }
  }

  async getRecentTransactions(limit = this.recentTransactionsCacheSize): Promise<Transaction[]> {
    try {
      const normalizedLimit = Math.max(1, limit);
      const transactions = await this.queryTransactions({}, { limit: normalizedLimit });

      this.recentTransactionsSubject.next(transactions);
      return transactions;
    } catch (error) {
      console.error('Error fetching recent transactions:', error);
      throw new Error('Failed to fetch recent transactions');
    }
  }

  async getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
    try {
      return await this.queryTransactions({}, { dateRange: { startDate, endDate } });
    } catch (error) {
      console.error('Error fetching transactions by date range:', error);
      throw new Error('Failed to fetch transactions for date range');
    }
  }

  async getTransactionsByRecurringPaymentIdsInDateRange(
    recurringPaymentIds: string[],
    startDate: Date,
    endDate: Date,
  ): Promise<Transaction[]> {
    if (recurringPaymentIds.length === 0) {
      return [];
    }

    try {
      return await this.queryTransactions(
        { recurringPaymentIds },
        { dateRange: { startDate, endDate } },
      );
    } catch (error) {
      console.error('Error fetching transactions by recurring payment ids and date range:', error);
      throw new Error('Failed to fetch recurring payment transactions for date range');
    }
  }

  async queryTransactions(
    filters: TransactionQueryFilters = {},
    options: TransactionQueryOptions = {}
  ): Promise<Transaction[]> {
    try {
      const {
        accountIds,
        types,
        categoryIds,
        recurringPaymentIds,
      } = filters;
      const {
        limit,
        dateRange,
        includeDeleted = false,
        sortDirection = 'desc',
      } = options;

      const accountIdSet = accountIds?.length ? new Set(accountIds) : null;
      const typeSet = types?.length ? new Set(types) : null;
      const categoryIdSet = categoryIds?.length ? new Set(categoryIds) : null;
      const recurringPaymentIdSet = recurringPaymentIds?.length ? new Set(recurringPaymentIds) : null;

      const collection = dateRange
        ? this.db.transactions.where('date').between(dateRange.startDate, dateRange.endDate, true, true)
        : this.db.transactions.toCollection();

      const transactions = await collection
        .and((transaction) => {
          if (!includeDeleted && transaction.isDeleted) {
            return false;
          }

          if (accountIdSet && !accountIdSet.has(transaction.accountId)) {
            return false;
          }

          if (typeSet && !typeSet.has(transaction.type)) {
            return false;
          }

          if (categoryIdSet && !categoryIdSet.has(transaction.categoryId)) {
            return false;
          }

          if (recurringPaymentIdSet && (!transaction.recurringPaymentId || !recurringPaymentIdSet.has(transaction.recurringPaymentId))) {
            return false;
          }

          return true;
        })
        .toArray();

      transactions.sort((first, second) => {
        const firstDate = new Date(first.date).getTime();
        const secondDate = new Date(second.date).getTime();
        return sortDirection === 'asc' ? firstDate - secondDate : secondDate - firstDate;
      });

      if (typeof limit === 'number') {
        if (limit <= 0) {
          return [];
        }

        return transactions.slice(0, limit);
      }

      return transactions;
    } catch (error) {
      console.error('Error querying transactions:', error);
      throw new Error('Failed to query transactions');
    }
  }

  getTransactions$(): Observable<Transaction[]> {
    void this.getAllTransactions();
    return this.transactions$;
  }

  getRecentTransactions$(limit = this.recentTransactionsCacheSize): Observable<Transaction[]> {
    void this.getRecentTransactions(Math.max(limit, this.recentTransactionsCacheSize));
    return this.recentTransactions$.pipe(
      map((transactions) => transactions.slice(0, limit))
    );
  }

  async getDirtyTransactions(): Promise<Transaction[]> {
    try {
      return await this.db.transactions
        .filter((transaction) => !!transaction.isDirty)
        .toArray();
    } catch (error) {
      console.error('Error fetching dirty transactions:', error);
      throw new Error('Failed to fetch dirty transactions');
    }
  }

  async clearDirtyFlags(transactionIds: string[]): Promise<void> {
    if (transactionIds.length === 0) {
      return;
    }

    try {
      await this.db.runWithoutDirtyTracking(async () => {
        await this.db.transactions.where('id').anyOf(transactionIds).modify({ isDirty: false });
      });

      await this.refreshTransactionStreams();
    } catch (error) {
      console.error('Error clearing transaction dirty flags:', error);
      throw new Error('Failed to clear transaction dirty flags');
    }
  }

  async upsertFromSheet(transaction: Transaction): Promise<void> {
    try {
      await this.db.transaction('rw', [this.db.transactions, this.db.accounts], async () => {
        const normalizedTransaction: Transaction = {
          ...transaction,
          amount: Math.abs(transaction.amount),
          transferToAccountId: transaction.type === 'transfer' ? transaction.transferToAccountId : undefined,
        };
        const existingTx = await this.db.transactions.get(transaction.id);
        const now = new Date();

        // Put the transaction without marking it dirty (it came from the sheet)
        await this.db.runWithoutDirtyTracking(async () => {
          await this.db.transactions.put({
            ...normalizedTransaction,
            isDirty: false,
            createdBy: transaction.createdBy || GUEST_USER_NAME,
            updatedBy: transaction.updatedBy || transaction.createdBy || GUEST_USER_NAME,
          });
        });

        // --- Balance adjustment (accounts stay dirty so the corrected balance syncs back) ---

        if (existingTx) {
          // Reverse the old local transaction's balance effect first
          if (existingTx.type === 'transfer' && existingTx.transferToAccountId) {
            const oldSource = await this.db.accounts.get(existingTx.accountId);
            if (oldSource) {
              await this.db.accounts.update(existingTx.accountId, { balance: oldSource.balance + Math.abs(existingTx.amount), updatedAt: now });
            }
            const oldDest = await this.db.accounts.get(existingTx.transferToAccountId);
            if (oldDest) {
              await this.db.accounts.update(existingTx.transferToAccountId, { balance: oldDest.balance - Math.abs(existingTx.amount), updatedAt: now });
            }
          } else {
            const oldAccount = await this.db.accounts.get(existingTx.accountId);
            if (oldAccount) {
              const oldAppliedAmount = existingTx.type === 'expense' ? -Math.abs(existingTx.amount) : Math.abs(existingTx.amount);
              await this.db.accounts.update(existingTx.accountId, { balance: oldAccount.balance - oldAppliedAmount, updatedAt: now });
            }
          }
        }

        // Apply the incoming transaction's balance effect (skip if deleted)
        if (!normalizedTransaction.isDeleted) {
          if (normalizedTransaction.type === 'transfer' && normalizedTransaction.transferToAccountId) {
            const source = await this.db.accounts.get(normalizedTransaction.accountId);
            if (source) {
              await this.db.accounts.update(normalizedTransaction.accountId, { balance: source.balance - Math.abs(normalizedTransaction.amount), updatedAt: now });
            }
            const dest = await this.db.accounts.get(normalizedTransaction.transferToAccountId);
            if (dest) {
              await this.db.accounts.update(normalizedTransaction.transferToAccountId, { balance: dest.balance + Math.abs(normalizedTransaction.amount), updatedAt: now });
            }
          } else {
            const account = await this.db.accounts.get(normalizedTransaction.accountId);
            if (account) {
              const newAppliedAmount = normalizedTransaction.type === 'expense'
                ? -Math.abs(normalizedTransaction.amount)
                : Math.abs(normalizedTransaction.amount);
              await this.db.accounts.update(normalizedTransaction.accountId, { balance: account.balance + newAppliedAmount, updatedAt: now });
            }
          }
        }
      });

      await this.refreshTransactionStreams();
    } catch (error) {
      console.error('Error upserting transaction from sheet:', error);
      throw new Error('Failed to upsert transaction from sheet');
    }
  }

  private handleError(error: unknown): never {
    console.error('TransactionRepository error:', error);
    throw new Error('Transaction operation failed');
  }

  private async refreshTransactionStreams(): Promise<void> {
    await Promise.all([
      this.getAllTransactions(),
      this.getRecentTransactions(this.recentTransactionsCacheSize)
    ]);
  }

  async getUniqueDescriptions(lastMonths: number): Promise<string[]> {
    const sinceDate = new Date();
    sinceDate.setMonth(sinceDate.getMonth() - lastMonths);

    // Handle mixed persisted key types (`Date` and ISO `string`) while still using the date index.
    const sinceIso = sinceDate.toISOString();
    const [dateKeyMatches, stringKeyMatches] = await Promise.all([
      this.db.transactions.where('date').aboveOrEqual(sinceDate).toArray(),
      this.db.transactions.where('date').aboveOrEqual(sinceIso).toArray(),
    ]);

    const transactionsById = new Map<string, Transaction>();
    [...dateKeyMatches, ...stringKeyMatches].forEach((transaction) => {
      transactionsById.set(transaction.id, transaction);
    });

    const transactions = Array.from(transactionsById.values());

    const descriptions = transactions.map(tx => tx.description).filter(desc => !!desc);
    return Array.from(new Set(descriptions)); // Ensure uniqueness
  }

  async getUniqueTags(lastMonths: number): Promise<string[]> {
    const sinceDate = new Date();
    sinceDate.setMonth(sinceDate.getMonth() - lastMonths);

    const sinceIso = sinceDate.toISOString();
    const [dateKeyMatches, stringKeyMatches] = await Promise.all([
      this.db.transactions.where('date').aboveOrEqual(sinceDate).toArray(),
      this.db.transactions.where('date').aboveOrEqual(sinceIso).toArray(),
    ]);

    const transactionsById = new Map<string, Transaction>();
    [...dateKeyMatches, ...stringKeyMatches].forEach((transaction) => {
      transactionsById.set(transaction.id, transaction);
    });

    const tagsMap = new Map<string, string>();
    Array.from(transactionsById.values()).forEach((transaction) => {
      (transaction.tags ?? []).forEach((tag) => {
        const trimmedTag = tag.trim();
        if (!trimmedTag) {
          return;
        }

        const key = trimmedTag.toLowerCase();
        if (!tagsMap.has(key)) {
          tagsMap.set(key, trimmedTag);
        }
      });
    });

    return Array.from(tagsMap.values());
  }
}
