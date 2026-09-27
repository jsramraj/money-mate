import { Injectable } from '@angular/core';
import { liveQuery } from 'dexie';
import { BehaviorSubject, Observable, from, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DatabaseService } from '../database.service';
import { Account, AccountType, GUEST_USER_NAME } from '../models';

@Injectable({
  providedIn: 'root'
})
export class AccountRepository {
  private accountsSubject = new BehaviorSubject<Account[]>([]);
  public accounts$ = this.accountsSubject.asObservable();

  constructor(private db: DatabaseService) {
    this.watchAccounts();
  }

  /**
   * Get all active accounts
   */
  async getAccounts(): Promise<Account[]> {
    try {
      const accounts = await this.db.accounts
        .orderBy('createdAt')
        .filter(account => !account.isDeleted)
        .toArray();
      
      this.accountsSubject.next(accounts);
      return accounts;
    } catch (error) {
      console.error('Error fetching accounts:', error);
      throw new Error('Failed to fetch accounts');
    }
  }

  /**
   * Get all accounts including inactive (for settings management)
   */
  async getAccountsForSettings(): Promise<Account[]> {
    try {
      return await this.db.accounts
        .orderBy('createdAt')
        .toArray();
    } catch (error) {
      console.error('Error fetching accounts for settings:', error);
      throw new Error('Failed to fetch accounts for settings');
    }
  }

  /**
   * Get accounts as Observable
   */
  getAccounts$(): Observable<Account[]> {
    return this.accounts$.pipe(catchError(this.handleError));
  }

  /**
   * Get account by ID
   */
  async getAccountById(id: string): Promise<Account | undefined> {
    try {
      const account = await this.db.accounts
        .where('id')
        .equals(id)
        .filter(account => !account.isDeleted)
        .first();
      
      return account;
    } catch (error) {
      console.error('Error fetching account by ID:', error);
      throw new Error('Failed to fetch account');
    }
  }

  /**
   * Get account by ID including inactive (for settings management)
   */
  async getAccountByIdForSettings(id: string): Promise<Account | undefined> {
    try {
      const account = await this.db.accounts
        .where('id')
        .equals(id)
        .first();
      
      return account;
    } catch (error) {
      console.error('Error fetching account by ID:', error);
      throw new Error('Failed to fetch account');
    }
  }

  /**
   * Get accounts by type
   */
  async getAccountsByType(type: AccountType): Promise<Account[]> {
    try {
      const accounts = await this.db.accounts
        .where('type')
        .equals(type)
        .filter(account => !account.isDeleted)
        .toArray();
      
      // Sort manually since filter() returns array
      accounts.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      return accounts;
    } catch (error) {
      console.error('Error fetching accounts by type:', error);
      throw new Error('Failed to fetch accounts by type');
    }
  }

  /**
   * Create new account
   */
  async createAccount(accountData: Omit<Account, 'id' | 'isDeleted' | 'isDirty' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>): Promise<Account> {
    try {
      const account: Account = {
        ...accountData,
        id: crypto.randomUUID(),
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: GUEST_USER_NAME,
        updatedBy: GUEST_USER_NAME,
      };

      await this.db.accounts.add(account);
      
      // Refresh accounts list
      await this.getAccounts();
      
      return account;
    } catch (error) {
      console.error('Error creating account:', error);
      throw new Error('Failed to create account');
    }
  }

  /**
   * Update account
   */
  async updateAccount(id: string, updates: Partial<Omit<Account, 'id' | 'isDirty' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>>): Promise<Account> {
    try {
      await this.db.accounts
        .where('id')
        .equals(id)
        .modify(updates);
      
      const updatedAccount = await this.getAccountByIdForSettings(id);
      if (!updatedAccount) {
        throw new Error('Account not found after update');
      }

      // Refresh accounts list
      await this.getAccounts();
      
      return updatedAccount;
    } catch (error) {
      console.error('Error updating account:', error);
      throw new Error('Failed to update account');
    }
  }

  async setAccountIsActive(id: string, isActive: boolean): Promise<void> {
    try {
      await this.updateAccount(id, { isDeleted: !isActive });
    } catch (error) {
      console.error('Error updating account active state:', error);
      throw new Error('Failed to update account active state');
    }
  }

  /**
   * Soft delete account
   */
  async deleteAccount(id: string): Promise<void> {
    try {
      await this.setAccountIsActive(id, false);
    } catch (error) {
      console.error('Error deleting account:', error);
      throw new Error('Failed to delete account');
    }
  }

  /**
   * Update account balance
   */
  async updateBalance(id: string, newBalance: number): Promise<Account> {
    try {
      await this.db.accounts.update(id, {
        balance: newBalance,
      });

      const updatedAccount = await this.getAccountById(id);
      if (!updatedAccount) {
        throw new Error('Account not found after balance update');
      }

      // Refresh accounts list
      await this.getAccounts();
      
      return updatedAccount;
    } catch (error) {
      console.error('Error updating account balance:', error);
      throw new Error('Failed to update account balance');
    }
  }

  /**
   * Get total balance across all accounts
   */
  async getTotalBalance(): Promise<number> {
    try {
      const accounts = await this.getAccounts();
      return accounts.reduce((total, account) => total + account.balance, 0);
    } catch (error) {
      console.error('Error calculating total balance:', error);
      throw new Error('Failed to calculate total balance');
    }
  }

  async getDirtyAccounts(): Promise<Account[]> {
    try {
      return await this.db.accounts
        .filter((account) => !!account.isDirty)
        .toArray();
    } catch (error) {
      console.error('Error fetching dirty accounts:', error);
      throw new Error('Failed to fetch dirty accounts');
    }
  }

  async clearDirtyFlags(accountIds: string[]): Promise<void> {
    if (accountIds.length === 0) {
      return;
    }

    try {
      await this.db.runWithoutDirtyTracking(async () => {
        await this.db.accounts.where('id').anyOf(accountIds).modify({ isDirty: false });
      });
      await this.getAccounts();
    } catch (error) {
      console.error('Error clearing account dirty flags:', error);
      throw new Error('Failed to clear account dirty flags');
    }
  }

  async upsertFromSheet(account: Account, notify = true): Promise<void> {
    try {
      await this.db.runWithoutDirtyTracking(async () => {
        await this.db.accounts.put({
          ...account,
          isDirty: false,
          createdBy: account.createdBy || GUEST_USER_NAME,
          updatedBy: account.updatedBy || account.createdBy || GUEST_USER_NAME,
        });
      });

      // Bulk sync callers refresh once after the whole batch instead of per row.
      if (notify) {
        await this.getAccounts();
      }
    } catch (error) {
      console.error('Error upserting account from sheet:', error);
      throw new Error('Failed to upsert account from sheet');
    }
  }

  private watchAccounts(): void {
    liveQuery(() => this.db.accounts.orderBy('createdAt').filter((account) => !account.isDeleted).toArray())
      .subscribe({
        next: (accounts) => {
          this.accountsSubject.next(accounts);
        },
        error: (error) => {
          console.error('Error watching accounts:', error);
        }
      });
  }

  private handleError(error: any): Observable<never> {
    console.error('Account repository error:', error);
    return throwError(() => new Error('Account operation failed'));
  }
}