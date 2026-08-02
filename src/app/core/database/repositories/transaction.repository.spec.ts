import { DatabaseService } from '../database.service';
import { Account, Transaction } from '../models';
import { CreateTransactionInput, TransactionRepository, UpdateTransactionInput } from './transaction.repository';

type TestAccount = Pick<Account, 'id' | 'balance'> & Partial<Account>;

describe('TransactionRepository', () => {
  let repository: TransactionRepository;
  let db: DatabaseService;

  let accountsStore: Map<string, TestAccount>;
  let transactionsStore: Map<string, Transaction>;

  beforeEach(() => {
    accountsStore = new Map<string, TestAccount>();
    transactionsStore = new Map<string, Transaction>();

    const cloneTransaction = (transaction: Transaction): Transaction => ({
      ...transaction,
      date: new Date(transaction.date),
      createdAt: new Date(transaction.createdAt),
      updatedAt: new Date(transaction.updatedAt),
      tags: transaction.tags ? [...transaction.tags] : undefined,
    });

    const accountsTable = {
      get: jasmine.createSpy('accounts.get').and.callFake(async (id: string) => accountsStore.get(id)),
      update: jasmine.createSpy('accounts.update').and.callFake(async (id: string, changes: Partial<Account>) => {
        const existing = accountsStore.get(id);
        if (!existing) {
          return 0;
        }

        accountsStore.set(id, {
          ...existing,
          ...changes,
        });

        return 1;
      }),
    };

    const transactionsTable = {
      add: jasmine.createSpy('transactions.add').and.callFake(async (transaction: Transaction) => {
        transactionsStore.set(transaction.id, cloneTransaction(transaction));
      }),
      get: jasmine.createSpy('transactions.get').and.callFake(async (id: string) => {
        const tx = transactionsStore.get(id);
        return tx ? cloneTransaction(tx) : undefined;
      }),
      put: jasmine.createSpy('transactions.put').and.callFake(async (transaction: Transaction) => {
        transactionsStore.set(transaction.id, cloneTransaction(transaction));
      }),
      where: jasmine.createSpy('transactions.where'),
      toCollection: jasmine.createSpy('transactions.toCollection'),
      filter: jasmine.createSpy('transactions.filter'),
    };

    db = {
      accounts: accountsTable,
      transactions: transactionsTable,
      transaction: jasmine.createSpy('db.transaction').and.callFake(async (_mode: string, _tables: unknown[], operation: () => Promise<void>) => operation()),
      runWithoutDirtyTracking: jasmine.createSpy('db.runWithoutDirtyTracking').and.callFake(async <T>(operation: () => Promise<T>) => operation()),
    } as unknown as DatabaseService;

    repository = new TransactionRepository(db);
    spyOn<any>(repository, 'refreshTransactionStreams').and.resolveTo();
  });

  it('stores expense amount as absolute and decreases account balance on create', async () => {
    accountsStore.set('acc-1', { id: 'acc-1', balance: 100 });

    const input: CreateTransactionInput = {
      accountId: 'acc-1',
      amount: 25,
      type: 'expense',
      categoryId: 'cat-1',
      description: 'Groceries',
      date: new Date('2026-08-01T00:00:00.000Z'),
    };

    const created = await repository.createTransaction(input);

    expect(created.amount).toBe(25);
    expect(transactionsStore.get(created.id)?.amount).toBe(25);
    expect(accountsStore.get('acc-1')?.balance).toBe(75);
  });

  it('stores transfer amount as absolute and moves balance between source and destination', async () => {
    accountsStore.set('source-1', { id: 'source-1', balance: 120 });
    accountsStore.set('dest-1', { id: 'dest-1', balance: -80 });

    const input: CreateTransactionInput = {
      accountId: 'source-1',
      amount: 40,
      type: 'transfer',
      categoryId: '',
      description: 'Transfer to card',
      date: new Date('2026-08-01T00:00:00.000Z'),
      transferToAccountId: 'dest-1',
    };

    const created = await repository.createTransaction(input);

    expect(created.amount).toBe(40);
    expect(accountsStore.get('source-1')?.balance).toBe(80);
    expect(accountsStore.get('dest-1')?.balance).toBe(-40);
  });

  it('updates transaction with absolute amount and correctly reverses old effect before applying new effect', async () => {
    const oldTransaction: Transaction = {
      id: 'tx-1',
      accountId: 'acc-1',
      amount: 30,
      type: 'expense',
      categoryId: 'cat-old',
      description: 'Old expense',
      date: new Date('2026-07-31T00:00:00.000Z'),
      tags: [],
      isDeleted: false,
      createdAt: new Date('2026-07-31T00:00:00.000Z'),
      updatedAt: new Date('2026-07-31T00:00:00.000Z'),
      createdBy: 'Guest',
      updatedBy: 'Guest',
    };

    transactionsStore.set(oldTransaction.id, oldTransaction);
    // Balance already includes old expense effect: 100 - 30 = 70
    accountsStore.set('acc-1', { id: 'acc-1', balance: 70 });

    const input: UpdateTransactionInput = {
      id: 'tx-1',
      accountId: 'acc-1',
      amount: 50,
      type: 'income',
      categoryId: 'cat-new',
      description: 'Salary correction',
      date: new Date('2026-08-02T00:00:00.000Z'),
    };

    const updated = await repository.updateTransaction(input);

    expect(updated.amount).toBe(50);
    expect(transactionsStore.get('tx-1')?.amount).toBe(50);
    // Reverse old expense (+30): 70 -> 100, apply new income (+50): 100 -> 150
    expect(accountsStore.get('acc-1')?.balance).toBe(150);
  });

  it('upsertFromSheet normalizes negative amount to absolute and applies expense effect by type', async () => {
    const existing: Transaction = {
      id: 'sheet-tx-1',
      accountId: 'acc-1',
      amount: 10,
      type: 'income',
      categoryId: 'cat-1',
      description: 'Old sync row',
      date: new Date('2026-08-01T00:00:00.000Z'),
      tags: [],
      isDeleted: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      createdBy: 'Guest',
      updatedBy: 'Guest',
    };

    transactionsStore.set(existing.id, existing);
    // Balance already includes old income effect: 100 + 10 = 110
    accountsStore.set('acc-1', { id: 'acc-1', balance: 110 });

    const incoming: Transaction = {
      ...existing,
      amount: -25,
      type: 'expense',
      description: 'Synced expense',
      updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    };

    await repository.upsertFromSheet(incoming);

    const stored = transactionsStore.get('sheet-tx-1');
    expect(stored?.amount).toBe(25);
    // Reverse old income (-10): 110 -> 100, apply new expense (-25): 100 -> 75
    expect(accountsStore.get('acc-1')?.balance).toBe(75);
  });

  it('archives an expense transaction and restores the account balance', async () => {
    const existing: Transaction = {
      id: 'tx-archive-expense',
      accountId: 'acc-1',
      amount: 30,
      type: 'expense',
      categoryId: 'cat-1',
      description: 'Dinner',
      date: new Date('2026-08-01T00:00:00.000Z'),
      tags: [],
      isDeleted: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      createdBy: 'Guest',
      updatedBy: 'Guest',
    };

    transactionsStore.set(existing.id, existing);
    // Balance already includes expense effect: 100 - 30 = 70
    accountsStore.set('acc-1', { id: 'acc-1', balance: 70 });

    const archived = await repository.archiveTransaction(existing.id);

    expect(archived.isDeleted).toBeTrue();
    expect(archived.amount).toBe(0);
    // Archive reverses the old expense and applies nothing new.
    expect(accountsStore.get('acc-1')?.balance).toBe(100);
  });

  it('archives a transfer transaction and restores both source and destination balances', async () => {
    const existing: Transaction = {
      id: 'tx-archive-transfer',
      accountId: 'src-1',
      amount: 40,
      type: 'transfer',
      categoryId: '',
      description: 'Move funds',
      date: new Date('2026-08-01T00:00:00.000Z'),
      transferToAccountId: 'dst-1',
      tags: [],
      isDeleted: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      createdBy: 'Guest',
      updatedBy: 'Guest',
    };

    transactionsStore.set(existing.id, existing);
    // Starting from 100/100 after transfer(40): source=60, destination=140
    accountsStore.set('src-1', { id: 'src-1', balance: 60 });
    accountsStore.set('dst-1', { id: 'dst-1', balance: 140 });

    await repository.archiveTransaction(existing.id);

    expect(accountsStore.get('src-1')?.balance).toBe(100);
    expect(accountsStore.get('dst-1')?.balance).toBe(100);
  });

  it('updates a transfer destination and amount by reversing old transfer and applying new transfer', async () => {
    const existing: Transaction = {
      id: 'tx-update-transfer',
      accountId: 'src-1',
      amount: 40,
      type: 'transfer',
      categoryId: '',
      description: 'Old transfer',
      date: new Date('2026-08-01T00:00:00.000Z'),
      transferToAccountId: 'dst-1',
      tags: [],
      isDeleted: false,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      createdBy: 'Guest',
      updatedBy: 'Guest',
    };

    transactionsStore.set(existing.id, existing);
    // Starting from 100/100/100 after old transfer(40): src=60, dst-1=140, dst-2=100
    accountsStore.set('src-1', { id: 'src-1', balance: 60 });
    accountsStore.set('dst-1', { id: 'dst-1', balance: 140 });
    accountsStore.set('dst-2', { id: 'dst-2', balance: 100 });

    const input: UpdateTransactionInput = {
      id: 'tx-update-transfer',
      accountId: 'src-1',
      amount: 25,
      type: 'transfer',
      categoryId: '',
      description: 'New transfer',
      date: new Date('2026-08-02T00:00:00.000Z'),
      transferToAccountId: 'dst-2',
    };

    const updated = await repository.updateTransaction(input);

    expect(updated.amount).toBe(25);
    expect(accountsStore.get('src-1')?.balance).toBe(75);
    expect(accountsStore.get('dst-1')?.balance).toBe(100);
    expect(accountsStore.get('dst-2')?.balance).toBe(125);
  });
});
