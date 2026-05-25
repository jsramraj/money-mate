import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonMenuButton,
  IonList,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonItemDivider,
  IonLabel,
  IonNote,
  IonIcon,
  IonSpinner,
  IonBadge,
  IonChip,
  IonFab,
  IonFabButton,
  IonSearchbar,
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { syncOutline, pricetagOutline, swapHorizontalOutline, filterOutline, funnelOutline, flashOutline, trashOutline, searchOutline, closeOutline } from 'ionicons/icons';
import { Account, Category, Transaction, TransactionType } from '../core/database/models';
import { AccountRepository, CategoryRepository, TransactionRepository } from '../core/database/repositories';
import {
  AnalyticsService,
  buildTransactionDisplayItem,
  GoogleSheetService,
  registerCategoryIcons,
  SessionService,
  TransactionDisplayItem,
} from '../core/services';
import { Router, ActivatedRoute } from '@angular/router';
import { TransactionFilterModalComponent, TransactionFilterState } from './components/transaction-filter-modal.component';
import { DateRangeFilterComponent, DateRange } from '../shared/date-range-filter/date-range-filter.component';

interface TransactionListItem extends TransactionDisplayItem {
  dateKey: string;
}

interface TransactionDateGroup {
  dateKey: string;
  dateLabel: string;
  items: TransactionListItem[];
}

@Component({
  selector: 'app-transactions',
  templateUrl: 'transactions.page.html',
  styleUrls: ['transactions.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonMenuButton,
    IonList,
    IonItem,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonItemDivider,
    IonLabel,
    IonNote,
    IonIcon,
    IonSpinner,
    IonBadge,
    IonChip,
    IonFab,
    IonFabButton,
    IonSearchbar,
    RouterLink,
    DateRangeFilterComponent,
  ]
})
export class TransactionsPage implements OnInit, OnDestroy {
  private readonly CURRENCY_KEY = 'money-mate-currency';
  private readonly allTransactionTypes: TransactionType[] = ['expense', 'income', 'transfer'];
  selectedCurrency = 'USD';
  loading = true;
  syncing = false;
  error: string | null = null;
  groupedItems: TransactionDateGroup[] = [];
  totalTransactions = 0;
  availableTags: string[] = [];
  private allTransactions: Transaction[] = [];
  private accountsMap = new Map<string, Account>();
  private categoriesMap = new Map<string, Category>();
  private accounts: Account[] = [];
  private categories: Category[] = [];
  private transactionsSub?: Subscription;
  private registeredIconNames = new Set<string>([
    'pricetag-outline',
    'swap-horizontal-outline'
  ]);
  filters: TransactionFilterState = this.getDefaultFilters();
  selectedDateRange: DateRange = this.getDefaultDateRange();
  searchVisible = false;
  searchText = '';
  @ViewChild('transactionSearchbar') private searchbar?: IonSearchbar;
  private _writingSearchParam = false;
  private _searchDebounce?: ReturnType<typeof setTimeout>;

  constructor(
    private transactionRepository: TransactionRepository,
    private accountRepository: AccountRepository,
    private categoryRepository: CategoryRepository,
    private readonly sessionService: SessionService,
    private readonly analyticsService: AnalyticsService,
    private readonly googleSheetService: GoogleSheetService,
    private readonly toastController: ToastController,
    private readonly alertController: AlertController,
    private readonly modalController: ModalController,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    addIcons({
      pricetagOutline,
      swapHorizontalOutline,
      syncOutline,
      filterOutline,
      funnelOutline,
      flashOutline,
      trashOutline,
      searchOutline,
      closeOutline,
    });
  }

  ngOnInit(): void {
    this.loadSelectedCurrency();

    // Restore search state from the initial URL snapshot (no re-init triggered).
    const initialQ = this.route.snapshot.queryParams['q'] as string | undefined;
    if (initialQ) {
      this.searchText = initialQ;
      this.searchVisible = true;
    }

    this.route.queryParams.subscribe(params => {
      // Skip the cycle caused by our own search-param writes to avoid re-init.
      if (this._writingSearchParam) {
        this._writingSearchParam = false;
        return;
      }

      let accountNames: string[] = [];
      const param = params['accountName'];
      if (Array.isArray(param)) {
        accountNames = param;
      } else if (typeof param === 'string') {
        accountNames = [param];
      }
      if (accountNames.length > 0) {
        this.accountRepository.getAccountsForSettings().then(accounts => {
          const matching = accounts.filter(acc => accountNames.includes(acc.name));
          if (matching.length > 0) {
            this.filters.accountIds = matching.map(acc => acc.id);
          } else {
            this.filters.accountIds = [];
          }
          void this.initializeTransactionsStream();
        });
      } else {
        this.filters.accountIds = [];
        void this.initializeTransactionsStream();
      }
    });
  }

  ngOnDestroy(): void {
    this.transactionsSub?.unsubscribe();
    clearTimeout(this._searchDebounce);
  }

  async ionViewWillEnter(): Promise<void> {
    this.loadSelectedCurrency();
    await this.refreshLookups();
    await this.transactionRepository.getAllTransactions();
  }

  get hasTransactions(): boolean {
    return this.groupedItems.length > 0;
  }

  get filteredTransactionsCount(): number {
    return this.groupedItems.reduce((total, group) => total + group.items.length, 0);
  }

  get activeFilterCount(): number {
    let count = 0;

    if (this.filters.types.length !== this.allTransactionTypes.length) {
      count += 1;
    }

    if (this.filters.categoryIds.length > 0) {
      count += 1;
    }

    if (this.filters.accountIds.length > 0) {
      count += 1;
    }

    if (this.filters.tags.length > 0) {
      count += 1;
    }

    if (this.searchText.trim()) {
      count += 1;
    }

    return count;
  }

  get hasActiveFilters(): boolean {
    return this.activeFilterCount > 0;
  }

  get emptyStateMessage(): string {
    if (this.hasActiveFilters && this.totalTransactions > 0) {
      return 'No transactions match your filters or search';
    }

    return 'No transactions yet';
  }

  get hasDirtyTransactions(): boolean {
    return this.allTransactions.some((transaction) => !!transaction.isDirty);
  }

  get canSync(): boolean {
    return !!this.sessionService.currentSession?.accessToken && !!this.sessionService.linkedSpreadsheet?.id;
  }

  trackByDateGroup(_: number, group: TransactionDateGroup): string {
    return group.dateKey;
  }

  trackByTransactionId(_: number, item: TransactionListItem): string {
    return item.id;
  }

  getDisplayAmount(amount: number): number {
    return Math.abs(amount);
  }

  private loadSelectedCurrency(): void {
    this.selectedCurrency = localStorage.getItem(this.CURRENCY_KEY) || 'USD';
  }

  getTransferSubtitle(item: TransactionListItem): string {
    return `${item.accountName} → ${item.transferToAccountName ?? 'Unknown account'}`;
  }

  onDateRangeChange(dateRange: DateRange): void {
    this.selectedDateRange = dateRange;
    this.buildGroupedItems(this.applyFilters(this.allTransactions));
  }

  toggleSearch(): void {
    this.searchVisible = !this.searchVisible;
    if (this.searchVisible) {
      this.focusSearchbar();
      return;
    }

    if (!this.searchVisible && this.searchText) {
      this.searchText = '';
      this.buildGroupedItems(this.applyFilters(this.allTransactions));
      this._writingSearchParam = true;
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { q: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }

  private focusSearchbar(): void {
    setTimeout(() => {
      void this.searchbar?.setFocus();
    }, 50);
  }

  onSearchChange(event: CustomEvent): void {
    this.searchText = (event.detail.value as string | undefined) ?? '';
    this.buildGroupedItems(this.applyFilters(this.allTransactions));

    clearTimeout(this._searchDebounce);
    this._searchDebounce = setTimeout(() => {
      this._writingSearchParam = true;
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { q: this.searchText.trim() || null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }, 400);
  }

  async openEditModal(item: TransactionListItem): Promise<void> {
    await this.router.navigate(['/tabs/transactions/form', item.id]);
  }

  async confirmDelete(item: TransactionListItem, slidingItem: IonItemSliding): Promise<void> {
    await slidingItem.close();
    const alert = await this.alertController.create({
      header: 'Delete Transaction',
      message: 'Are you sure you want to delete this transaction?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => { void this.deleteTransaction(item); },
        },
      ],
    });
    await alert.present();
  }

  async deleteTransaction(item: TransactionListItem): Promise<void> {
    try {
      await this.transactionRepository.archiveTransaction(item.id);
      this.analyticsService.trackEvent('transaction_deleted', {
        source: 'transactions_list',
        transaction_type: item.transaction.type,
      });
      await this.presentToast('Transaction deleted', 'success');
    } catch (error) {
      console.error('Error deleting transaction:', error);
      await this.presentToast('Failed to delete transaction', 'danger');
    }
  }

  async openFilterModal(): Promise<void> {
    await this.refreshLookups();

    this.analyticsService.trackEvent('transactions_filter_opened', {
      active_filter_count: this.activeFilterCount,
    });

    const modal = await this.modalController.create({
      component: TransactionFilterModalComponent,
      componentProps: {
        initialFilters: this.filters,
        accounts: this.accounts,
        availableTags: this.availableTags,
      },
    });

    await modal.present();
    const { data, role } = await modal.onWillDismiss<TransactionFilterState>();

    if (role !== 'apply' || !data) {
      return;
    }

    this.filters = {
      types: [...data.types],
      categoryIds: [...data.categoryIds],
      accountIds: [...data.accountIds],
      tags: [...data.tags],
    };

    // Update query params based on account filter (array style)
    if (this.filters.accountIds.length > 0) {
      // Find the account names for the selected ids
      const selectedAccounts = this.accounts.filter(acc => this.filters.accountIds.includes(acc.id));
      const accountNames = selectedAccounts.map(acc => acc.name);
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { accountName: accountNames },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    } else {
      // Remove accountName param if no accounts selected
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { accountName: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }

    this.buildGroupedItems(this.applyFilters(this.allTransactions));
    this.analyticsService.trackEvent('transactions_filters_applied', {
      active_filter_count: this.activeFilterCount,
    });
    }

  async syncTransactions(): Promise<void> {
    if (this.syncing) {
      return;
    }

    if (!this.sessionService.currentSession?.accessToken || !this.sessionService.linkedSpreadsheet?.id) {
      return;
    }

    try {
      this.syncing = true;
      this.error = null;
      this.analyticsService.trackEvent('sync_transactions', {
        status: 'started',
        dirty_count: this.allTransactions.filter((transaction) => !!transaction.isDirty).length,
      });

      // Sync transactions first so balance deltas are applied locally,
      // then sync accounts so corrected balances are pushed to the sheet.
      await this.googleSheetService.syncTransactions();
      await this.googleSheetService.syncAccounts();
      await this.googleSheetService.syncCategories();
      await this.googleSheetService.syncBudgets();
      await this.refreshLookups();
      await this.transactionRepository.getAllTransactions();
      this.analyticsService.trackEvent('sync_transactions', { status: 'success' });
      await this.presentToast('All data synced successfully', 'success');
    } catch (error) {
      console.error('Error syncing data:', error);
      this.error = 'Failed to sync data';
      this.analyticsService.trackEvent('sync_transactions', { status: 'failed' });
      await this.presentToast('Failed to sync data', 'danger');
    } finally {
      this.syncing = false;
    }
  }

  private getDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getDateLabel(date: Date): string {
    const today = new Date();
    const todayKey = this.getDateKey(today);

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayKey = this.getDateKey(yesterday);

    const dateKey = this.getDateKey(date);
    if (dateKey === todayKey) {
      return 'Today';
    }

    if (dateKey === yesterdayKey) {
      return 'Yesterday';
    }

    return date.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  private async initializeTransactionsStream(): Promise<void> {
    try {
      this.loading = true;
      this.error = null;

      await this.refreshLookups();
      this.transactionsSub = this.transactionRepository.getTransactions$().subscribe({
        next: (transactions) => {
          this.error = null;
          this.allTransactions = transactions;
          this.totalTransactions = transactions.length;
          this.updateAvailableTags(transactions);
          this.buildGroupedItems(this.applyFilters(transactions));
          this.loading = false;
        },
        error: (error) => {
          console.error('Error in transactions stream:', error);
          this.error = 'Failed to load transactions';
          this.groupedItems = [];
          this.loading = false;
        }
      });
    } catch (error) {
      console.error('Error initializing transactions stream:', error);
      this.error = 'Failed to load transactions';
      this.groupedItems = [];
      this.loading = false;
    }
  }

  private async refreshLookups(): Promise<void> {
    const [accounts, categories] = await Promise.all([
      this.accountRepository.getAccountsForSettings(),
      this.categoryRepository.getCategoriesForSettings()
    ]);

    this.accounts = accounts;
    this.categories = categories;

    this.accountsMap = new Map<string, Account>(accounts.map(account => [account.id, account]));
    this.categoriesMap = new Map<string, Category>(categories.map(category => [category.id, category]));
    registerCategoryIcons(categories, this.registeredIconNames);
  }

  private updateAvailableTags(transactions: Transaction[]): void {
    const tagsMap = new Map<string, string>();

    transactions.forEach((transaction) => {
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

    this.availableTags = Array.from(tagsMap.values()).sort((first, second) =>
      first.localeCompare(second, undefined, { sensitivity: 'base' })
    );
  }

  private applyFilters(transactions: Transaction[]): Transaction[] {
    const selectedTypes = new Set(this.filters.types);
    const selectedCategoryIds = new Set(this.filters.categoryIds);
    const selectedAccountIds = new Set(this.filters.accountIds);
    const selectedTags = new Set(this.filters.tags.map((tag) => tag.toLowerCase()));

    const hasTypeFilter = selectedTypes.size !== this.allTransactionTypes.length;
    const hasCategoryFilter = selectedCategoryIds.size > 0;
    const hasAccountFilter = selectedAccountIds.size > 0;
    const hasTagFilter = selectedTags.size > 0;
    const hasDateFilter = true; // Always apply date range filtering

    const q = this.searchText.trim().toLowerCase();
    const hasSearchFilter = q.length > 0;

    if (!hasTypeFilter && !hasCategoryFilter && !hasAccountFilter && !hasTagFilter && !hasSearchFilter) {
      // Even if no other filters, still apply date range
      return transactions.filter((transaction) =>
        this.isTransactionInDateRange(transaction)
      );
    }

    return transactions.filter((transaction) => {
      if (hasTypeFilter && !selectedTypes.has(transaction.type)) {
        return false;
      }

      // CATEGORY FILTER: support '__uncategorized__' sentinel
      if (hasCategoryFilter) {
        const isUncategorizedSelected = selectedCategoryIds.has('__uncategorized__');
        const isUncategorized = transaction.categoryId === null || transaction.categoryId === undefined || transaction.categoryId === '';
        if (
          (isUncategorized && !isUncategorizedSelected) ||
          (!isUncategorized && !selectedCategoryIds.has(transaction.categoryId))
        ) {
          return false;
        }
      }

      if (hasAccountFilter) {
        const matchesAccount = transaction.type === 'transfer'
          ? selectedAccountIds.has(transaction.accountId) || !!transaction.transferToAccountId && selectedAccountIds.has(transaction.transferToAccountId)
          : selectedAccountIds.has(transaction.accountId);

        if (!matchesAccount) {
          return false;
        }
      }

      if (hasTagFilter) {
        const transactionTags = (transaction.tags ?? []).map((tag) => tag.toLowerCase());
        const matchesAnyTag = transactionTags.some((tag) => selectedTags.has(tag));

        if (!matchesAnyTag) {
          return false;
        }
      }

      // SEARCH FILTER: match description, notes, tags
      if (q) {
        const descMatch = (transaction.description ?? '').toLowerCase().includes(q);
        const notesMatch = (transaction.notes ?? '').toLowerCase().includes(q);
        const tagsMatch = (transaction.tags ?? []).some(t => t.toLowerCase().includes(q));
        if (!descMatch && !notesMatch && !tagsMatch) {
          return false;
        }
      }

      // Apply date range filter
      if (hasDateFilter && !this.isTransactionInDateRange(transaction)) {
        return false;
      }

      return true;
    });
  }

  private isTransactionInDateRange(transaction: Transaction): boolean {
    const transactionDate = new Date(transaction.date);
    transactionDate.setHours(0, 0, 0, 0);

    const startDate = new Date(this.selectedDateRange.startDate);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(this.selectedDateRange.endDate);
    endDate.setHours(23, 59, 59, 999);

    return transactionDate.getTime() >= startDate.getTime() && transactionDate.getTime() <= endDate.getTime();
  }

  private getDefaultFilters(): TransactionFilterState {
    return {
      types: [...this.allTransactionTypes],
      categoryIds: [],
      accountIds: [],
      tags: [],
    };
  }

  private getDefaultDateRange(): DateRange {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      startDate: startOfMonth,
      endDate: today,
      period: 'monthly',
    };
  }  private resetFilters(): void {
    this.filters = this.getDefaultFilters();
  }

  private buildGroupedItems(transactions: Transaction[]): void {
    const groupedMap = new Map<string, TransactionDateGroup>();

    transactions.forEach((transaction) => {
      const date = new Date(transaction.date);
      const dateKey = this.getDateKey(date);

      if (!groupedMap.has(dateKey)) {
        groupedMap.set(dateKey, {
          dateKey,
          dateLabel: this.getDateLabel(date),
          items: []
        });
      }

      const item: TransactionListItem = {
        ...buildTransactionDisplayItem(
          transaction,
          this.accountsMap,
          this.categoriesMap,
          this.registeredIconNames,
        ),
        dateKey
      };

      groupedMap.get(dateKey)?.items.push(item);
    });

    this.groupedItems = Array.from(groupedMap.values()).sort(
      (a, b) => new Date(b.dateKey).getTime() - new Date(a.dateKey).getTime()
    );
  }

  private async presentToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }

  capitalize(text?: string): string {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
}
