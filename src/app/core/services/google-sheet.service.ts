import { Injectable } from '@angular/core';
import { GoogleSheetsDbService } from './google-sheets-db.service';
import { Account, Budget, Category, GUEST_USER_NAME, RecurringPayment, Transaction } from '../database/models';
import { AccountRepository, BudgetRepository, CategoryRepository, TransactionRepository } from '../database/repositories';
import { DatabaseService, CURRENT_SCHEMA_VERSION } from '../database/database.service';

export interface SpreadsheetSummary {
  id: string;
  name: string;
}

@Injectable({
  providedIn: 'root',
})
export class GoogleSheetService {
  constructor(
    private readonly googleSheetsDbService: GoogleSheetsDbService,
    private readonly accountRepository: AccountRepository,
    private readonly budgetRepository: BudgetRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly db: DatabaseService,
  ) {}

  async importAllFromSheetToLocal(): Promise<void> {
    const [accountsRows, categoriesRows, transactionsRows, budgetsRows, recurringPaymentsRows] = await Promise.all([
      this.getValuesOrEmpty('accounts!A:M'),
      this.getValuesOrEmpty('categories!A:K'),
      this.getValuesOrEmpty('transactions!A:P'),
      this.getValuesOrEmpty('budgets!A:P'),
      this.getValuesOrEmpty('recurringPayments!A:Q'),
    ]);

    const accounts = accountsRows
      .slice(1)
      .map((row) => this.parseSheetAccount(row))
      .filter((account): account is Account => !!account)
      .map((account) => ({ ...account, isDirty: false }));

    const categories = categoriesRows
      .slice(1)
      .map((row) => this.parseSheetCategory(row))
      .filter((category): category is Category => !!category)
      .map((category) => ({ ...category, isDirty: false }));

    const transactions = transactionsRows
      .slice(1)
      .map((row) => this.parseSheetTransaction(row))
      .filter((transaction): transaction is Transaction => !!transaction)
      .map((transaction) => ({ ...transaction, isDirty: false }));

    const budgets = budgetsRows
      .slice(1)
      .map((row) => this.parseSheetBudget(row))
      .filter((budget): budget is Budget => !!budget)
      .map((budget) => ({ ...budget, isDirty: false }));

    const recurringPayments = recurringPaymentsRows
      .slice(1)
      .map((row) => this.parseSheetRecurringPayment(row))
      .filter((rp): rp is RecurringPayment => !!rp)
      .map((rp) => ({ ...rp, isDirty: false }));

    await this.db.transaction('rw', [this.db.accounts, this.db.categories, this.db.transactions, this.db.budgets, this.db.recurringPayments], async () => {
      await this.db.runWithoutDirtyTracking(async () => {
        await this.db.transactions.clear();
        await this.db.accounts.clear();
        await this.db.categories.clear();
        await this.db.budgets.clear();
        await this.db.recurringPayments.clear();

        if (accounts.length > 0) {
          await this.db.accounts.bulkPut(accounts);
        }

        if (categories.length > 0) {
          await this.db.categories.bulkPut(categories);
        }

        if (transactions.length > 0) {
          await this.db.transactions.bulkPut(transactions);
        }

        if (budgets.length > 0) {
          await this.db.budgets.bulkPut(budgets);
        }

        if (recurringPayments.length > 0) {
          await this.db.recurringPayments.bulkPut(recurringPayments);
        }
      });
    });

    await Promise.all([
      this.accountRepository.getAccounts(),
      this.budgetRepository.getBudgets(),
      this.categoryRepository.getCategories(),
      this.transactionRepository.getAllTransactions(),
    ]);
  }

  async listUserSpreadsheets(): Promise<SpreadsheetSummary[]> {
    return this.googleSheetsDbService.listSpreadsheets();
  }

  async createMoneyMateSpreadsheet(title: string): Promise<SpreadsheetSummary> {
    const result = await this.googleSheetsDbService.createSpreadsheet(title, [
      'dashboard',
      'accounts',
      'budgets',
      'categories',
      'transactions',
      '_meta',
      'recurringPayments',
    ]);

    return {
      id: result.spreadsheetId,
      name: result.title,
    };
  }

  async initializeWithHeaders() {
    await this.googleSheetsDbService.batchUpdateValues([
      {
        range: 'accounts!A1',
        values: [[
          'id',
          'name',
          'type',
          'balance',
          'ownerName',
          'color',
          'icon',
          'notes',
          'isDeleted',
          'createdAt',
          'updatedAt',
          'createdBy',
          'updatedBy',
        ]],
      },
      {
        range: 'budgets!A1',
        values: [[
          'id',
          'name',
          'type',
          'amount',
          'period',
          'startDate',
          'endDate',
          'categoryIds',
          'groupId',
          'rolloverEnabled',
          'alertThresholds',
          'isDeleted',
          'createdAt',
          'updatedAt',
          'createdBy',
          'updatedBy',
        ]],
      },
      {
        range: 'categories!A1',
        values: [[
          'id',
          'name',
          'type',
          'color',
          'icon',
          'sortOrder',
          'isDeleted',
          'createdAt',
          'updatedAt',
          'createdBy',
          'updatedBy',
        ]],
      },
      {
        range: 'transactions!A1',
        values: [[
          'id',
          'accountId',
          'amount',
          'type',
          'categoryId',
          'description',
          'date',
          'notes',
          'tags',
          'transferToAccountId',
          'isDeleted',
          'createdAt',
          'updatedAt',
          'createdBy',
          'updatedBy',
          'recurringPaymentId',
        ]],
      },
      {
        range: 'dashboard!A1',
        values: [[
          'Date',
          'Description',
          'Amount',
          'From Account',
          'To Account',
          'Category',
        ]],
      },
      {
        range: '_meta!A1',
        values: [[
          'key',
          'value',
        ]],
      },
      {
        range: '_meta!A2',
        values: [[
          'schemaVersion',
          '3',
        ]],
      },
      {
        range: 'recurringPayments!A1',
        values: [[
          'id',
          'accountId',
          'amount',
          'type',
          'categoryId',
          'description',
          'date',
          'notes',
          'tags',
          'transferToAccountId',
          'frequency',
          'status',
          'isDeleted',
          'createdAt',
          'updatedAt',
          'createdBy',
          'updatedBy',
        ]],
      },
    
    ]);
    console.log('Initialized spreadsheet with headers');
  }

  /**
   * Sets formulas for the dashboard sheet (A2:F2) using ARRAYFORMULA for all columns.
   */
  async setDashboardFormulas(): Promise<void> {
    await this.googleSheetsDbService.batchUpdateValues([
      {
        range: 'dashboard!A2',
        values: [[
          '=ARRAYFORMULA(IF(transactions!G2:G="", "", DATEVALUE(LEFT(transactions!G2:G, 10))))',
        ]],
      },
      {
        range: 'dashboard!B2',
        values: [[
          '=ARRAYFORMULA(IF(transactions!F2:F="", "", transactions!F2:F))',
        ]],
      },
      {
        range: 'dashboard!C2',
        values: [[
          '=ARRAYFORMULA(IF(transactions!C2:C="", "", transactions!C2:C))',
        ]],
      },
      {
        range: 'dashboard!D2',
        values: [[
          '=ARRAYFORMULA(IF(transactions!B2:B="","",IFNA(VLOOKUP(transactions!B2:B, accounts!A:B, 2, FALSE))))',
        ]],
      },
      {
        range: 'dashboard!E2',
        values: [[
          '=ARRAYFORMULA(IF(transactions!J2:J="","",VLOOKUP(transactions!J2:J, accounts!A:B, 2, FALSE)))',
        ]],
      },
      {
        range: 'dashboard!F2',
        values: [[
          '=ARRAYFORMULA(IF(transactions!E2:E="","",IFNA(VLOOKUP(transactions!E2:E, categories!A:B, 2, FALSE), "")))',
        ]],
      },
    ], 'USER_ENTERED');
  }

  async syncAccounts(): Promise<void> {
    const sheetRows = await this.googleSheetsDbService.getValues('accounts!A:M');
    const rowsWithoutHeader = sheetRows.slice(1);
    const localAccounts = await this.accountRepository.getAccountsForSettings();

    const sheetById = new Map<string, { account: Account; rowNumber: number }>();
    rowsWithoutHeader.forEach((row, index) => {
      const parsed = this.parseSheetAccount(row);
      if (!parsed) {
        return;
      }

      sheetById.set(parsed.id, {
        account: parsed,
        rowNumber: index + 2,
      });
    });

    const localById = new Map(localAccounts.map((account) => [account.id, account]));

    for (const [id, sheetRecord] of sheetById.entries()) {
      const localRecord = localById.get(id);
      if (!localRecord) {
        await this.accountRepository.upsertFromSheet(sheetRecord.account);
        continue;
      }

      const localUpdatedAt = new Date(localRecord.updatedAt).getTime();
      const sheetUpdatedAt = new Date(sheetRecord.account.updatedAt).getTime();

      if (sheetUpdatedAt > localUpdatedAt && !localRecord.isDirty) {
        await this.accountRepository.upsertFromSheet(sheetRecord.account);
      }
    }

    const dirtyAccounts = await this.accountRepository.getDirtyAccounts();
    const pushedIds: string[] = [];
    const updateRequests: Array<{ range: string; values: string[][] }> = [];
    const rowsToAppend: string[][] = [];

    for (const account of dirtyAccounts) {
      const rowValues = this.toSheetAccountRow(account);
      const existing = sheetById.get(account.id);

      if (existing) {
        updateRequests.push({
          range: `accounts!A${existing.rowNumber}:M${existing.rowNumber}`,
          values: [rowValues],
        });
      } else {
        rowsToAppend.push(rowValues);
      }

      pushedIds.push(account.id);
    }

    if (updateRequests.length > 0) {
      await this.googleSheetsDbService.batchUpdateValues(updateRequests);
    }

    if (rowsToAppend.length > 0) {
      await this.googleSheetsDbService.appendValues(
        'accounts!A:M',
        rowsToAppend,
      );
    }

    await this.accountRepository.clearDirtyFlags(pushedIds);
  }

  async syncCategories(): Promise<void> {
    const sheetRows = await this.googleSheetsDbService.getValues('categories!A:K');
    const rowsWithoutHeader = sheetRows.slice(1);
    const localCategories = await this.categoryRepository.getCategoriesForSettings();

    const sheetById = new Map<string, { category: Category; rowNumber: number }>();
    rowsWithoutHeader.forEach((row, index) => {
      const parsed = this.parseSheetCategory(row);
      if (!parsed) {
        return;
      }

      sheetById.set(parsed.id, {
        category: parsed,
        rowNumber: index + 2,
      });
    });

    const localById = new Map(localCategories.map((category) => [category.id, category]));

    for (const [id, sheetRecord] of sheetById.entries()) {
      const localRecord = localById.get(id);
      if (!localRecord) {
        await this.categoryRepository.upsertFromSheet(sheetRecord.category);
        continue;
      }

      const localUpdatedAt = new Date(localRecord.updatedAt).getTime();
      const sheetUpdatedAt = new Date(sheetRecord.category.updatedAt).getTime();
      const isSheetNewer = sheetUpdatedAt > localUpdatedAt;

      if (isSheetNewer && !localRecord.isDirty) {
        await this.categoryRepository.upsertFromSheet(sheetRecord.category);
      }
    }

    const dirtyCategories = await this.categoryRepository.getDirtyCategories();
    const pushedIds: string[] = [];
    const updateRequests: Array<{ range: string; values: string[][] }> = [];
    const rowsToAppend: string[][] = [];

    for (const category of dirtyCategories) {
      const rowValues = this.toSheetCategoryRow(category);
      const existing = sheetById.get(category.id);

      if (existing) {
        updateRequests.push({
          range: `categories!A${existing.rowNumber}:K${existing.rowNumber}`,
          values: [rowValues],
        });
      } else {
        rowsToAppend.push(rowValues);
      }

      pushedIds.push(category.id);
    }

    if (updateRequests.length > 0) {
      await this.googleSheetsDbService.batchUpdateValues(updateRequests);
    }

    if (rowsToAppend.length > 0) {
      await this.googleSheetsDbService.appendValues(
        'categories!A:K',
        rowsToAppend,
      );
    }

    await this.categoryRepository.clearDirtyFlags(pushedIds);
  }

  async syncBudgets(): Promise<void> {
    const sheetRows = await this.googleSheetsDbService.getValues('budgets!A:P');
    const rowsWithoutHeader = sheetRows.slice(1);
    const localBudgets = await this.budgetRepository.getBudgetsForSettings();

    const sheetById = new Map<string, { budget: Budget; rowNumber: number }>();
    rowsWithoutHeader.forEach((row, index) => {
      const parsed = this.parseSheetBudget(row);
      if (!parsed) {
        return;
      }

      sheetById.set(parsed.id, {
        budget: parsed,
        rowNumber: index + 2,
      });
    });

    const localById = new Map(localBudgets.map((budget) => [budget.id, budget]));

    for (const [id, sheetRecord] of sheetById.entries()) {
      const localRecord = localById.get(id);
      if (!localRecord) {
        await this.budgetRepository.upsertFromSheet(sheetRecord.budget);
        continue;
      }

      const localUpdatedAt = new Date(localRecord.updatedAt).getTime();
      const sheetUpdatedAt = new Date(sheetRecord.budget.updatedAt).getTime();

      if (sheetUpdatedAt > localUpdatedAt && !localRecord.isDirty) {
        await this.budgetRepository.upsertFromSheet(sheetRecord.budget);
      }
    }

    const dirtyBudgets = await this.budgetRepository.getDirtyBudgets();
    const pushedIds: string[] = [];
    const updateRequests: Array<{ range: string; values: string[][] }> = [];
    const rowsToAppend: string[][] = [];

    for (const budget of dirtyBudgets) {
      const rowValues = this.toSheetBudgetRow(budget);
      const existing = sheetById.get(budget.id);

      if (existing) {
        updateRequests.push({
          range: `budgets!A${existing.rowNumber}:P${existing.rowNumber}`,
          values: [rowValues],
        });
      } else {
        rowsToAppend.push(rowValues);
      }

      pushedIds.push(budget.id);
    }

    if (updateRequests.length > 0) {
      await this.googleSheetsDbService.batchUpdateValues(updateRequests);
    }

    if (rowsToAppend.length > 0) {
      await this.googleSheetsDbService.appendValues(
        'budgets!A:P',
        rowsToAppend,
      );
    }

    await this.budgetRepository.clearDirtyFlags(pushedIds);
  }

  async syncTransactions(): Promise<void> {
    const sheetRows = await this.googleSheetsDbService.getValues('transactions!A:P');
    const rowsWithoutHeader = sheetRows.slice(1);
    const localTransactions = await this.transactionRepository.getAllTransactions();

    const sheetById = new Map<string, { transaction: Transaction; rowNumber: number }>();
    rowsWithoutHeader.forEach((row, index) => {
      const parsed = this.parseSheetTransaction(row);
      if (!parsed) {
        return;
      }

      sheetById.set(parsed.id, {
        transaction: parsed,
        rowNumber: index + 2,
      });
    });

    const localById = new Map(localTransactions.map((transaction) => [transaction.id, transaction]));

    for (const [id, sheetRecord] of sheetById.entries()) {
      const localRecord = localById.get(id);
      if (!localRecord) {
        await this.transactionRepository.upsertFromSheet(sheetRecord.transaction);
        continue;
      }

      const localUpdatedAt = new Date(localRecord.updatedAt).getTime();
      const sheetUpdatedAt = new Date(sheetRecord.transaction.updatedAt).getTime();
      if (sheetUpdatedAt > localUpdatedAt && !localRecord.isDirty) {
        await this.transactionRepository.upsertFromSheet(sheetRecord.transaction);
      }
    }

    const dirtyTransactions = await this.transactionRepository.getDirtyTransactions();
    const pushedIds: string[] = [];
    const updateRequests: Array<{ range: string; values: string[][] }> = [];
    const rowsToAppend: string[][] = [];

    for (const transaction of dirtyTransactions) {
      const rowValues = this.toSheetTransactionRow(transaction);
      const existing = sheetById.get(transaction.id);

      if (existing) {
        updateRequests.push({
          range: `transactions!A${existing.rowNumber}:P${existing.rowNumber}`,
          values: [rowValues],
        });
      } else {
        rowsToAppend.push(rowValues);
      }

      pushedIds.push(transaction.id);
    }

    if (updateRequests.length > 0) {
      await this.googleSheetsDbService.batchUpdateValues(updateRequests);
    }

    if (rowsToAppend.length > 0) {
      await this.googleSheetsDbService.appendValues(
        'transactions!A:P',
        rowsToAppend,
      );
    }

    await this.transactionRepository.clearDirtyFlags(pushedIds);
  }

  async syncRecurringPayments(): Promise<void> {
    const sheetRows = await this.googleSheetsDbService.getValues('recurringPayments!A:Q');
    const rowsWithoutHeader = sheetRows.slice(1);
    const localRecurringPayments = await this.db.recurringPayments.toArray();

    const sheetById = new Map<string, { recurringPayment: RecurringPayment; rowNumber: number }>();
    rowsWithoutHeader.forEach((row, index) => {
      const parsed = this.parseSheetRecurringPayment(row);
      if (!parsed) {
        return;
      }

      sheetById.set(parsed.id, {
        recurringPayment: parsed,
        rowNumber: index + 2,
      });
    });

    const localById = new Map(localRecurringPayments.map((rp) => [rp.id, rp]));

    for (const [id, sheetRecord] of sheetById.entries()) {
      const localRecord = localById.get(id);
      if (!localRecord) {
        await this.db.recurringPayments.put({ ...sheetRecord.recurringPayment, isDirty: false });
        continue;
      }

      const localUpdatedAt = new Date(localRecord.updatedAt).getTime();
      const sheetUpdatedAt = new Date(sheetRecord.recurringPayment.updatedAt).getTime();
      if (sheetUpdatedAt > localUpdatedAt && !localRecord.isDirty) {
        await this.db.recurringPayments.put({ ...sheetRecord.recurringPayment, isDirty: false });
      }
    }

    const dirtyRecurringPayments = await this.db.recurringPayments.filter((rp) => !!rp.isDirty).toArray();
    const pushedIds: string[] = [];
    const updateRequests: Array<{ range: string; values: string[][] }> = [];
    const rowsToAppend: string[][] = [];

    for (const recurringPayment of dirtyRecurringPayments) {
      const rowValues = this.toSheetRecurringPaymentRow(recurringPayment);
      const existing = sheetById.get(recurringPayment.id);

      if (existing) {
        updateRequests.push({
          range: `recurringPayments!A${existing.rowNumber}:Q${existing.rowNumber}`,
          values: [rowValues],
        });
      } else {
        rowsToAppend.push(rowValues);
      }

      pushedIds.push(recurringPayment.id);
    }

    if (updateRequests.length > 0) {
      await this.googleSheetsDbService.batchUpdateValues(updateRequests);
    }

    if (rowsToAppend.length > 0) {
      await this.googleSheetsDbService.appendValues(
        'recurringPayments!A:Q',
        rowsToAppend,
      );
    }

    // Clear dirty flags
    if (pushedIds.length > 0) {
      await this.db.transaction('rw', this.db.recurringPayments, async () => {
        for (const id of pushedIds) {
          const rp = await this.db.recurringPayments.get(id);
          if (rp) {
            await this.db.recurringPayments.update(id, { isDirty: false });
          }
        }
      });
    }
  }

  private parseSheetCategory(row: string[]): Category | null {
    if (!row[0]) {
      return null;
    }

    const createdAt = this.parseDate(row[7]);
    const updatedAt = this.parseDate(row[8]);

    return {
      id: row[0],
      name: row[1] || '',
      type: row[2] === 'income' || row[2] === 'expense' ? row[2] : undefined,
      color: row[3] || '#9E9E9E',
      icon: row[4] || 'pricetag-outline',
      sortOrder: Number(row[5] || 0),
      isDeleted: row[6] === 'true',
      createdAt,
      updatedAt,
      createdBy: row[9] || GUEST_USER_NAME,
      updatedBy: row[10] || row[9] || GUEST_USER_NAME,
      isDirty: false,
    };
  }

  private parseSheetTransaction(row: string[]): Transaction | null {
    if (!row[0]) {
      return null;
    }

    const amount = Number(row[2] || 0);
    const type = this.parseTransactionType(row[3], amount);

    return {
      id: row[0],
      accountId: row[1] || '',
      amount,
      type,
      categoryId: row[4] || '',
      description: row[5] || '',
      date: this.parseDate(row[6]),
      notes: row[7] || '',
      tags: this.parseTags(row[8]),
      transferToAccountId: row[9] || undefined,
      isDeleted: row[10] === 'true',
      createdAt: this.parseDate(row[11]),
      updatedAt: this.parseDate(row[12]),
      createdBy: row[13] || GUEST_USER_NAME,
      updatedBy: row[14] || row[13] || GUEST_USER_NAME,
      recurringPaymentId: row[15] || undefined,
      isDirty: false,
    };
  }

  private parseSheetRecurringPayment(row: string[]): RecurringPayment | null {
    if (!row[0]) {
      return null;
    }

    const amount = Number(row[2] || 0);
    const type = this.parseTransactionType(row[3], amount);
    const frequency = this.parseRecurringPaymentFrequency(row[10]);
    const status = this.parseRecurringPaymentStatus(row[11]);

    return {
      id: row[0],
      accountId: row[1] || '',
      amount,
      type,
      categoryId: row[4] || '',
      description: row[5] || '',
      date: this.parseDate(row[6]),
      notes: row[7] || '',
      tags: this.parseTags(row[8]),
      transferToAccountId: row[9] || undefined,
      frequency,
      status,
      isDeleted: row[12] === 'true',
      createdAt: this.parseDate(row[13]),
      updatedAt: this.parseDate(row[14]),
      createdBy: row[15] || GUEST_USER_NAME,
      updatedBy: row[16] || row[15] || GUEST_USER_NAME,
      isDirty: false,
    };
  }

  private parseSheetBudget(row: string[]): Budget | null {
    if (!row[0]) {
      return null;
    }

    const type = this.parseBudgetType(row[2]);
    const period = this.parseBudgetPeriod(row[4]);
    const categoryIds = this.parseStringArray(row[7]);
    const alertThresholds = this.parseNumberArray(row[10]);

    return {
      id: row[0],
      name: row[1] || '',
      type,
      amount: Number(row[3] || 0),
      period,
      startDate: this.parseDate(row[5]),
      endDate: row[6] ? this.parseDate(row[6]) : undefined,
      categoryIds,
      groupId: row[8] || undefined,
      rolloverEnabled: row[9] === 'true',
      alertThresholds: alertThresholds.length > 0 ? alertThresholds : [50, 80, 100],
      isDeleted: row[11] === 'true',
      createdAt: this.parseDate(row[12]),
      updatedAt: this.parseDate(row[13]),
      createdBy: row[14] || GUEST_USER_NAME,
      updatedBy: row[15] || row[14] || GUEST_USER_NAME,
      isDirty: false,
    };
  }

  private parseSheetAccount(row: string[]): Account | null {
    if (!row[0]) {
      return null;
    }

    const createdAt = this.parseDate(row[9]);
    const updatedAt = this.parseDate(row[10]);

    return {
      id: row[0],
      name: row[1] || '',
      type: this.parseAccountType(row[2]),
      balance: Number(row[3] || 0),
      ownerName: row[4] || '',
      color: row[5] || '#9E9E9E',
      icon: row[6] || 'cash-outline',
      notes: row[7] || '',
      isDeleted: row[8] === 'true',
      createdAt,
      updatedAt,
      createdBy: row[11] || GUEST_USER_NAME,
      updatedBy: row[12] || row[11] || GUEST_USER_NAME,
      isDirty: false,
    };
  }

  private toSheetCategoryRow(category: Category): string[] {
    return [
      category.id,
      category.name,
      category.type || '',
      category.color,
      category.icon,
      String(category.sortOrder),
      String(!!category.isDeleted),
      this.toIso(category.createdAt),
      this.toIso(category.updatedAt),
      category.createdBy || GUEST_USER_NAME,
      category.updatedBy || category.createdBy || GUEST_USER_NAME,
    ];
  }

  private toSheetAccountRow(account: Account): string[] {
    return [
      account.id,
      account.name,
      account.type,
      String(account.balance),
      account.ownerName,
      account.color,
      account.icon,
      account.notes || '',
      String(!!account.isDeleted),
      this.toIso(account.createdAt),
      this.toIso(account.updatedAt),
      account.createdBy || GUEST_USER_NAME,
      account.updatedBy || account.createdBy || GUEST_USER_NAME,
    ];
  }

  private toSheetTransactionRow(transaction: Transaction): string[] {
    return [
      transaction.id,
      transaction.accountId,
      String(transaction.amount),
      transaction.type,
      transaction.categoryId,
      transaction.description,
      this.toIso(transaction.date),
      transaction.notes || '',
      JSON.stringify(transaction.tags || []),
      transaction.transferToAccountId || '',
      String(!!transaction.isDeleted),
      this.toIso(transaction.createdAt),
      this.toIso(transaction.updatedAt),
      transaction.createdBy || GUEST_USER_NAME,
      transaction.updatedBy || transaction.createdBy || GUEST_USER_NAME,
      transaction.recurringPaymentId || '',
    ];
  }

  private toSheetRecurringPaymentRow(recurringPayment: RecurringPayment): string[] {
    return [
      recurringPayment.id,
      recurringPayment.accountId,
      String(recurringPayment.amount),
      recurringPayment.type,
      recurringPayment.categoryId,
      recurringPayment.description,
      this.toIso(recurringPayment.date),
      recurringPayment.notes || '',
      JSON.stringify(recurringPayment.tags || []),
      recurringPayment.transferToAccountId || '',
      recurringPayment.frequency,
      recurringPayment.status,
      String(!!recurringPayment.isDeleted),
      this.toIso(recurringPayment.createdAt),
      this.toIso(recurringPayment.updatedAt),
      recurringPayment.createdBy || GUEST_USER_NAME,
      recurringPayment.updatedBy || recurringPayment.createdBy || GUEST_USER_NAME,
    ];
  }

  private toSheetBudgetRow(budget: Budget): string[] {
    return [
      budget.id,
      budget.name,
      budget.type,
      String(budget.amount),
      budget.period,
      this.toIso(budget.startDate),
      budget.endDate ? this.toIso(budget.endDate) : '',
      JSON.stringify(budget.categoryIds || []),
      budget.groupId || '',
      String(!!budget.rolloverEnabled),
      JSON.stringify(budget.alertThresholds || []),
      String(!!budget.isDeleted),
      this.toIso(budget.createdAt),
      this.toIso(budget.updatedAt),
      budget.createdBy || GUEST_USER_NAME,
      budget.updatedBy || budget.createdBy || GUEST_USER_NAME,
    ];
  }

  private parseAccountType(value: string | undefined): Account['type'] {
    switch (value) {
      case 'checking':
      case 'savings':
      case 'credit':
      case 'cash':
        return value;
      default:
        return 'cash';
    }
  }

  private parseTransactionType(value: string | undefined, amount: number): Transaction['type'] {
    switch (value) {
      case 'income':
      case 'expense':
      case 'transfer':
        return value;
      default:
        return amount < 0 ? 'expense' : 'income';
    }
  }

  private parseBudgetType(value: string | undefined): Budget['type'] {
    switch (value) {
      case 'category':
      case 'overall':
      case 'group':
      case 'goal':
        return value;
      default:
        return 'category';
    }
  }

  private parseBudgetPeriod(value: string | undefined): Budget['period'] {
    switch (value) {
      case 'weekly':
      case 'monthly':
      case 'yearly':
      case 'custom':
        return value;
      default:
        return 'monthly';
    }
  }

  private parseRecurringPaymentFrequency(value: string | undefined): RecurringPayment['frequency'] {
    switch (value) {
      case 'week':
      case 'month':
      case 'year':
        return value;
      default:
        return 'month';
    }
  }

  private parseRecurringPaymentStatus(value: string | undefined): RecurringPayment['status'] {
    switch (value) {
      case 'active':
      case 'paused':
      case 'cancelled':
        return value;
      default:
        return 'active';
    }
  }

  private parseStringArray(value: string | undefined): string[] {
    if (!value?.trim()) {
      return [];
    }

    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item)).filter(Boolean);
        }
      } catch {
      }
    }

    return trimmed
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private parseNumberArray(value: string | undefined): number[] {
    if (!value?.trim()) {
      return [];
    }

    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => Number(item))
            .filter((num) => Number.isFinite(num));
        }
      } catch {
      }
    }

    return trimmed
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((num) => Number.isFinite(num));
  }

  private parseTags(value: string | undefined): string[] {
    if (!value?.trim()) {
      return [];
    }

    const trimmed = value.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item)).filter(Boolean);
        }
      } catch {
      }
    }

    return trimmed
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  private async getValuesOrEmpty(range: string): Promise<string[][]> {
    try {
      return await this.googleSheetsDbService.getValues(range);
    } catch {
      return [];
    }
  }

  private toIso(value: Date | string): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  }

  private parseDate(value: string | undefined): Date {
    if (!value) {
      return new Date();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  /**
   * Get the schema version from the _meta sheet.
   * Returns 0 if the _meta sheet doesn't exist (legacy spreadsheets).
   */
  async getSheetSchemaVersion(): Promise<number> {
    try {
      const metaRows = await this.googleSheetsDbService.getValues('_meta!A:B');
      
      // Find the row where column A = 'schemaVersion'
      const versionRow = metaRows.find(row => row[0] === 'schemaVersion');
      
      if (versionRow && versionRow[1]) {
        const version = Number(versionRow[1]);
        return Number.isFinite(version) ? version : 0;
      }
      
      return 0;
    } catch (error) {
      // _meta sheet doesn't exist (legacy spreadsheet)
      return 0;
    }
  }

  /**
   * Check if the sheet schema version is compatible with the local database version.
   * Returns compatibility info including whether migration is needed.
   */
  async checkSchemaCompatibility(): Promise<{
    compatible: boolean;
    sheetVersion: number;
    localVersion: number;
    needsMigration: boolean;
  }> {
    const sheetVersion = await this.getSheetSchemaVersion();
    const localVersion = this.db.verno;
    
    return {
      compatible: sheetVersion === localVersion,
      sheetVersion,
      localVersion,
      needsMigration: sheetVersion < localVersion && sheetVersion > 0,
    };
  }

  /**
   * Migrates the spreadsheet schema if needed during sync operations.
   * Runs automatically before sync to ensure sheet structure matches app version.
   */
  async migrateSheetSchemaIfNeeded(): Promise<void> {
    const compatibility = await this.checkSchemaCompatibility();
    
    // Already at current version
    if (compatibility.compatible) {
      return;
    }
    
    // Legacy spreadsheet (no _meta sheet) - migrate from v0 to v3
    if (compatibility.sheetVersion === 0) {
      console.log('Migrating legacy spreadsheet to schema v3...');
      await this.migrateFromV0ToV3();
      return;
    }
    
    // Future: Handle incremental migrations (v1->v2, v2->v3, etc.)
    if (compatibility.needsMigration) {
      console.log(`Migrating sheet from v${compatibility.sheetVersion} to v${compatibility.localVersion}...`);
      
      // For now, only v0->v3 is implemented
      // Add more migration paths here as needed
      if (compatibility.sheetVersion < 3 && compatibility.localVersion >= 3) {
        await this.migrateToV3(compatibility.sheetVersion);
      }
    }
  }

  /**
   * Migrate legacy spreadsheet (no _meta) from v0 to v3.
   * Adds _meta sheet, recurringPayments sheet, and recurringPaymentId column to transactions.
   */
  private async migrateFromV0ToV3(): Promise<void> {
    const updates: Array<{ range: string; values: string[][] }> = [];
    
    // Step 1: Add _meta and recurringPayments sheets
    try {
      await this.googleSheetsDbService.addSheets(['_meta', 'recurringPayments']);
    } catch (error) {
      console.warn('Failed to add sheets (may already exist):', error);
      // Continue with migration even if sheets exist
    }
    
    // Step 2: Initialize _meta sheet with schema version
    updates.push(
      {
        range: '_meta!A1',
        values: [['key', 'value']],
      },
      {
        range: '_meta!A2',
        values: [['schemaVersion', '3']],
      }
    );
    
    // Step 3: Initialize recurringPayments sheet with headers
    updates.push({
      range: 'recurringPayments!A1',
      values: [[
        'id',
        'accountId',
        'amount',
        'type',
        'categoryId',
        'description',
        'date',
        'notes',
        'tags',
        'transferToAccountId',
        'frequency',
        'status',
        'isDeleted',
        'createdAt',
        'updatedAt',
        'createdBy',
        'updatedBy',
      ]],
    });
    
    // Step 4: Update transactions header to add recurringPaymentId column
    const existingTransactionsHeader = await this.googleSheetsDbService.getValues('transactions!A1:O1');
    if (existingTransactionsHeader.length > 0) {
      const updatedHeader = [...existingTransactionsHeader[0], 'recurringPaymentId'];
      updates.push({
        range: 'transactions!A1',
        values: [updatedHeader],
      });
    }
    
    // Apply all updates
    await this.googleSheetsDbService.batchUpdateValues(updates);
    
    console.log('Successfully migrated spreadsheet to schema v3');
  }

  /**
   * Migrate from any version < 3 to v3.
   * For incremental migrations: v1->v2->v3.
   */
  private async migrateToV3(fromVersion: number): Promise<void> {
    // For now, treat any version < 3 the same as v0
    // In the future, add specific migration paths per version
    await this.migrateFromV0ToV3();
    
    // Update version in _meta
    await this.googleSheetsDbService.batchUpdateValues([{
      range: '_meta!A2',
      values: [['schemaVersion', '3']],
    }]);
  }
}
