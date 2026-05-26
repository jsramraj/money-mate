import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Account, Budget, Category, GUEST_USER_NAME, RecurringPayment, Transaction } from './models';

@Injectable({
  providedIn: 'root'
})
export class DatabaseService extends Dexie {
  // Tables
  accounts!: Table<Account>;
  categories!: Table<Category>;
  transactions!: Table<Transaction>;
  recurringPayments!: Table<RecurringPayment>;
  budgets!: Table<Budget>;
  private dirtyTrackingBypassCount = 0;

  constructor() {
    super('MoneyMateDB');
    console.log('Initializing database schema... ');
    
    this.version(1).stores({
      accounts: '++id, name, type, ownerName, createdAt, isDirty',
      categories: '++id, name, sortOrder, createdAt, isDirty',
      transactions: '++id, accountId, categoryId, date, type, amount, createdAt, createdBy, isDirty'
    });

    this.version(2).stores({
      accounts: '++id, name, type, ownerName, createdAt, isDirty',
      categories: '++id, name, sortOrder, createdAt, isDirty',
      transactions: '++id, accountId, categoryId, date, type, amount, createdAt, createdBy, isDirty',
      budgets: '++id, name, type, period, startDate, createdAt, isDirty'
    });

    this.version(3).stores({
      accounts: '++id, name, type, ownerName, createdAt, isDirty',
      categories: '++id, name, sortOrder, createdAt, isDirty',
      transactions: '++id, accountId, categoryId, date, type, amount, recurringPaymentId, createdAt, createdBy, isDirty',
      budgets: '++id, name, type, period, startDate, createdAt, isDirty',
      recurringPayments: 'id, accountId, categoryId, date, type, amount, frequency, status, createdAt, createdBy, isDirty'
    });

    this.registerAccountHooks();
    this.registerCategoryHooks();
    this.registerTransactionHooks();
    this.registerRecurringPaymentHooks();
    this.registerBudgetHooks();

    // Initialize default categories on first run - using transaction approach like React example
    this.on('ready', async () => {
      console.log('Database ready event fired');
      await this.initializeDefaultData();
      return true; // Important: return true or a promise for Dexie
    });

    // Force database open to ensure initialization (similar to React example)
    this.open().catch(err => {
      console.error('Failed to open database:', err);
    });
  }

  async runWithoutDirtyTracking<T>(operation: () => Promise<T>): Promise<T> {
    this.dirtyTrackingBypassCount += 1;
    try {
      return await operation();
    } finally {
      this.dirtyTrackingBypassCount = Math.max(0, this.dirtyTrackingBypassCount - 1);
    }
  }

  private registerAccountHooks(): void {
    this.accounts.hook('creating', (_primKey, obj: Account) => {
      if (this.dirtyTrackingBypassCount > 0) {
        return;
      }

      const now = new Date();
      const actor = this.getCurrentActorName();
      obj.createdAt = obj.createdAt ?? now;
      obj.updatedAt = now;
      obj.createdBy = obj.createdBy ?? actor;
      obj.updatedBy = actor;
      obj.isDirty = true;
    });

    this.accounts.hook('updating', (mods: Partial<Account>) => {
      if (this.dirtyTrackingBypassCount > 0) {
        return mods;
      }

      const actor = this.getCurrentActorName();
      return {
        ...mods,
        updatedAt: new Date(),
        updatedBy: actor,
        isDirty: true,
      };
    });
  }

  private registerCategoryHooks(): void {
    this.categories.hook('creating', (_primKey, obj: Category) => {
      if (this.dirtyTrackingBypassCount > 0) {
        return;
      }

      const now = new Date();
      const actor = this.getCurrentActorName();
      obj.createdAt = obj.createdAt ?? now;
      obj.updatedAt = now;
      obj.createdBy = obj.createdBy ?? actor;
      obj.updatedBy = actor;
      obj.isDirty = true;
    });

    this.categories.hook('updating', (mods: Partial<Category>) => {
      if (this.dirtyTrackingBypassCount > 0) {
        return mods;
      }

      const actor = this.getCurrentActorName();
      return {
        ...mods,
        updatedAt: new Date(),
        updatedBy: actor,
        isDirty: true,
      };
    });
  }

  private registerTransactionHooks(): void {
    this.transactions.hook('creating', (_primKey, obj: Transaction) => {
      if (this.dirtyTrackingBypassCount > 0) {
        return;
      }

      const now = new Date();
      const actor = this.getCurrentActorName();
      obj.createdAt = obj.createdAt ?? now;
      obj.updatedAt = now;
      obj.createdBy = obj.createdBy ?? actor;
      obj.updatedBy = actor;
      obj.isDirty = true;
    });

    this.transactions.hook('updating', (mods: Partial<Transaction>) => {
      if (this.dirtyTrackingBypassCount > 0) {
        return mods;
      }

      const actor = this.getCurrentActorName();
      return {
        ...mods,
        updatedAt: new Date(),
        updatedBy: actor,
        isDirty: true,
      };
    });
  }

  private registerRecurringPaymentHooks(): void {
    this.recurringPayments.hook('creating', (_primKey, obj: RecurringPayment) => {
      if (this.dirtyTrackingBypassCount > 0) {
        return;
      }

      const now = new Date();
      const actor = this.getCurrentActorName();
      obj.createdAt = obj.createdAt ?? now;
      obj.updatedAt = now;
      obj.createdBy = obj.createdBy ?? actor;
      obj.updatedBy = actor;
      obj.isDirty = true;
    });

    this.recurringPayments.hook('updating', (mods: Partial<RecurringPayment>) => {
      if (this.dirtyTrackingBypassCount > 0) {
        return mods;
      }

      const actor = this.getCurrentActorName();
      return {
        ...mods,
        updatedAt: new Date(),
        updatedBy: actor,
        isDirty: true,
      };
    });
  }

  private registerBudgetHooks(): void {
    this.budgets.hook('creating', (_primKey, obj: Budget) => {
      if (this.dirtyTrackingBypassCount > 0) {
        return;
      }

      const now = new Date();
      const actor = this.getCurrentActorName();
      obj.createdAt = obj.createdAt ?? now;
      obj.updatedAt = now;
      obj.createdBy = obj.createdBy ?? actor;
      obj.updatedBy = actor;
      obj.isDirty = true;
    });

    this.budgets.hook('updating', (mods: Partial<Budget>) => {
      if (this.dirtyTrackingBypassCount > 0) {
        return mods;
      }

      const actor = this.getCurrentActorName();
      return {
        ...mods,
        updatedAt: new Date(),
        updatedBy: actor,
        isDirty: true,
      };
    });
  }

  private getCurrentActorName(): string {
    try {
      const rawSession = localStorage.getItem('money-mate-user-session');
      if (!rawSession) {
        return GUEST_USER_NAME;
      }

      const parsed = JSON.parse(rawSession) as { name?: string };
      return parsed.name?.trim() || GUEST_USER_NAME;
    } catch {
      return GUEST_USER_NAME;
    }
  }

  private async initializeDefaultData(): Promise<void> {
    try {
      console.log('Checking for existing data...');
      
      // Check and initialize accounts
      const accountCount = await this.accounts.count();
      if (accountCount === 0) {
        const { DEFAULT_ACCOUNTS } = await import('./models/account.model');
        
        const accountsWithMetadata = DEFAULT_ACCOUNTS.map(account => ({
          ...account,
          id: crypto.randomUUID(),
          isDirty: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'system',
          updatedBy: 'system'
        }));

        await this.runWithoutDirtyTracking(async () => {
          await this.accounts.bulkAdd(accountsWithMetadata);
        });
        console.log('Default accounts initialized successfully');
      }
      
      // Check and initialize categories
      const categoryCount = await this.categories.count();
      if (categoryCount === 0) {
        console.log('Default categories initialization skipped.');
      }
    } catch (error) {
      console.error('Error initializing default data:', error);
    }
  }

  /**
   * Clear all data (useful for development/testing)
   */
  async clearAllData(): Promise<void> {
    await this.transaction('rw', [this.accounts, this.categories, this.transactions, this.recurringPayments, this.budgets], async () => {
      await this.accounts.clear();
      await this.categories.clear(); 
      await this.transactions.clear();
      await this.recurringPayments.clear();
      await this.budgets.clear();
    });
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{ accounts: number; categories: number; transactions: number; budgets: number }> {
    const [accounts, categories, transactions, budgets] = await Promise.all([
      this.accounts.filter(account => !account.isDeleted).count(),
      this.categories.filter(category => !category.isDeleted).count(),
      this.transactions.filter(transaction => !transaction.isDeleted).count(),
      this.budgets.filter(budget => !budget.isDeleted).count()
    ]);

    return { accounts, categories, transactions, budgets };
  }

  async saveCategoriesWithMetadata(categories: Omit<Category, 'id'>[]): Promise<void> {
    const categoriesWithMetadata = categories.map(category => ({
      ...category,
      id: crypto.randomUUID(),
      isDirty: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'user',
      updatedBy: 'user',
    }));

    await this.runWithoutDirtyTracking(async () => {
      await this.categories.bulkAdd(categoriesWithMetadata);
    });
  }
}