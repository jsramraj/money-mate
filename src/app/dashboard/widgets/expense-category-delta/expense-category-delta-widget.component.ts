import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription, combineLatest } from 'rxjs';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonIcon,
  IonProgressBar,
  IonText,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { settings, settingsOutline, pricetagOutline } from 'ionicons/icons';
import * as ionicons from 'ionicons/icons';
import { Category, Transaction } from '../../../core/database/models';
import { CategoryRepository, TransactionRepository } from '../../../core/database/repositories';
import { DashboardDateRange, DashboardDateRangeService } from '../../services/dashboard-date-range.service';
import { WidgetSettingsModalComponent, WidgetSettingsOption, WidgetSettingsResult } from '../../../shared/widget-settings';

interface DateWindow {
  startDate: Date;
  endDate: Date;
}

interface CategoryExpenseDeltaRow {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  selectedPeriodAmount: number;
  lastMonthAmount: number;
  last12MonthsAvgAmount: number;
  remainingFromAverage: number;
  progressPercent: number;
  progressBarValue: number;
  statusLabel: 'Safe' | 'Warning' | 'Near limit' | 'Exceeded';
  progressClass: 'progress-safe' | 'progress-warning' | 'progress-near-limit' | 'progress-exceeded';
  fromLastMonthDeltaPercent: number | null;
  fromAverageDeltaPercent: number | null;
  fromLastMonthLabel: string;
  fromAverageLabel: string;
}

interface ProgressState {
  label: 'Safe' | 'Warning' | 'Near limit' | 'Exceeded';
  className: 'progress-safe' | 'progress-warning' | 'progress-near-limit' | 'progress-exceeded';
}

@Component({
  selector: 'app-expense-category-delta-widget',
  standalone: true,
  imports: [
    CommonModule,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardSubtitle,
    IonCardTitle,
    IonIcon,
    IonProgressBar,
    IonText,
  ],
  templateUrl: './expense-category-delta-widget.component.html',
  styleUrls: ['./expense-category-delta-widget.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseCategoryDeltaWidgetComponent implements OnInit, OnDestroy {
  private static readonly STORAGE_KEY = 'dashboard.expenseCategoryDelta.visibleCategoryIds';
  private static readonly TOP_N_STORAGE_KEY = 'dashboard.expenseCategoryDelta.topN';
  private static readonly GROUP_OTHERS_STORAGE_KEY = 'dashboard.expenseCategoryDelta.groupOthers';
  private static readonly CURRENCY_KEY = 'money-mate-currency';
  private static readonly UNCATEGORIZED_ID = '__uncategorized__';

  loading = true;
  error: string | null = null;
  hasSavedCategorySelection = false;
  hasSavedTopCategoryLimit = false;
  topCategoryCount: number | null = null;
  groupOthers = true;
  selectedCurrency = 'USD';

  rows: CategoryExpenseDeltaRow[] = [];

  private readonly defaultIcon = 'pricetag-outline';
  private readonly registeredIconNames = new Set<string>([
    'settings-outline',
    'settings',
    this.defaultIcon,
  ]);
  private categoriesById = new Map<string, Category>();
  private selectedCategoryIds: Set<string> | null = null;
  private latestTransactions: Transaction[] = [];
  private selectedDateRange: DashboardDateRange | null = null;
  private subscription?: Subscription;
  private settingsLoaded = false;

  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly dateRangeService: DashboardDateRangeService,
    private readonly modalController: ModalController,
    private readonly cdr: ChangeDetectorRef,
  ) {
    addIcons({ settings, settingsOutline, pricetagOutline });
  }

  ngOnInit(): void {
    this.selectedCurrency = localStorage.getItem(ExpenseCategoryDeltaWidgetComponent.CURRENCY_KEY) || 'USD';

    this.subscription = combineLatest([
      this.dateRangeService.getDateRange$(),
      this.transactionRepository.getTransactions$(),
    ]).subscribe({
      next: ([range, transactions]) => {
        this.selectedDateRange = range;
        this.latestTransactions = transactions;
        void this.refresh();
      },
      error: (error: unknown) => {
        console.error('Error loading expense category delta widget sources:', error);
        this.error = 'Failed to load category deltas';
        this.loading = false;
        this.rows = [];
        this.cdr.markForCheck();
      },
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  get hasItems(): boolean {
    return this.rows.length > 0;
  }

  get hasSavedSettings(): boolean {
    return this.hasSavedCategorySelection || this.hasSavedTopCategoryLimit;
  }

  get settingsIconName(): string {
    return this.hasSavedSettings ? 'settings' : 'settings-outline';
  }

  trackByCategoryId(_: number, row: CategoryExpenseDeltaRow): string {
    return row.categoryId;
  }

  async openCategorySettings(): Promise<void> {
    const options = this.getCategorySelectionOptions();
    const availableCategoryIds = new Set(options.map((option) => option.id));
    const selectedIds = this.selectedCategoryIds
      ? Array.from(this.selectedCategoryIds).filter((id) => availableCategoryIds.has(id))
      : null;

    const modal = await this.modalController.create({
      component: WidgetSettingsModalComponent,
      componentProps: {
        title: 'Expense category delta settings',
        selectionTitle: 'Visible categories',
        selectionDescription: 'Choose which categories appear in this widget.',
        options,
        selectedIds,
        topN: {
          value: this.topCategoryCount,
          label: 'Show top categories',
          helperText: 'Leave empty to show all categories. When limited, remaining categories are grouped into Other.',
          placeholder: 'All categories',
          min: 1,
          max: Math.max(this.categoriesById.size + 1, 1),
          groupOthers: this.groupOthers,
        },
      },
      breakpoints: [0, 0.72, 0.95],
      initialBreakpoint: 0.72,
    });

    await modal.present();

    const { data, role } = await modal.onDidDismiss<WidgetSettingsResult>();
    if (role !== 'apply' || !data) {
      return;
    }

    this.selectedCategoryIds = data.selectedIds ? new Set<string>(data.selectedIds) : null;
    this.persistCategorySelection(this.selectedCategoryIds);
    this.persistTopCategoryCount(data.topN ?? null);
    this.persistGroupOthers(data.groupOthers ?? true);
    this.rebuildRows();
  }

  getRowIcon(row: CategoryExpenseDeltaRow): string {
    const normalized = row.categoryIcon?.trim();
    if (!normalized) {
      return this.defaultIcon;
    }

    return this.registeredIconNames.has(normalized) ? normalized : this.defaultIcon;
  }

  private async refresh(): Promise<void> {
    try {
      this.loading = true;
      this.error = null;

      if (!this.settingsLoaded) {
        this.loadSavedCategorySelection();
        this.loadSavedTopCategoryCount();
        this.loadSavedGroupOthers();
        this.settingsLoaded = true;
      }

      await this.refreshCategories();
      this.sanitizeSavedSelection();
      this.rebuildRows();
    } catch (error) {
      console.error('Error building expense category delta widget:', error);
      this.error = 'Failed to load category deltas';
      this.rows = [];
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private async refreshCategories(): Promise<void> {
    const categories = await this.categoryRepository.getCategoriesForSettings();
    this.categoriesById = new Map(categories.map((category) => [category.id, category]));
    this.registerIconsFromCategories(categories);
  }

  private rebuildRows(): void {
    const activeRange = this.selectedDateRange ?? this.getFallbackDateRange();
    const selectedWindow = this.buildDateWindow(activeRange.startDate, activeRange.endDate);
    const lastMonthWindow = this.buildLastMonthWindow();
    const fixedLast12MonthsWindow = this.buildFixedLast12MonthsWindow();

    const selectedTotals = new Map<string, number>();
    const lastMonthTotals = new Map<string, number>();
    const fixedLast12MonthsTotals = new Map<string, number>();

    this.latestTransactions.forEach((transaction) => {
      if (transaction.isDeleted || transaction.type !== 'expense') {
        return;
      }

      if (!this.isCategoryVisible(transaction.categoryId)) {
        return;
      }

      const key = this.normalizeCategoryId(transaction.categoryId);
      const transactionTime = new Date(transaction.date).getTime();
      const amount = Math.abs(transaction.amount);

      if (this.isWithinWindow(transactionTime, selectedWindow)) {
        selectedTotals.set(key, (selectedTotals.get(key) ?? 0) + amount);
      }

      if (this.isWithinWindow(transactionTime, lastMonthWindow)) {
        lastMonthTotals.set(key, (lastMonthTotals.get(key) ?? 0) + amount);
      }

      if (this.isWithinWindow(transactionTime, fixedLast12MonthsWindow)) {
        fixedLast12MonthsTotals.set(key, (fixedLast12MonthsTotals.get(key) ?? 0) + amount);
      }
    });

    const keys = new Set<string>([
      ...selectedTotals.keys(),
      ...lastMonthTotals.keys(),
      ...fixedLast12MonthsTotals.keys(),
    ]);

    const rows = Array.from(keys).map((key) => {
      const category = this.categoriesById.get(key);
      const selectedAmount = selectedTotals.get(key) ?? 0;
      const lastMonthAmount = lastMonthTotals.get(key) ?? 0;
      const fixedLast12MonthsTotal = fixedLast12MonthsTotals.get(key) ?? 0;
      return this.buildRow(key, category, selectedAmount, lastMonthAmount, fixedLast12MonthsTotal);
    });

    rows.sort((first, second) => second.selectedPeriodAmount - first.selectedPeriodAmount);

    this.rows = this.applyTopCategoryLimit(rows);
    this.cdr.markForCheck();
  }

  private buildDateWindow(startDate: Date, endDate: Date): DateWindow {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start.getTime() <= end.getTime()) {
      return { startDate: start, endDate: end };
    }

    return { startDate: end, endDate: start };
  }

  private buildLastMonthWindow(): DateWindow {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    return { startDate, endDate };
  }

  private buildFixedLast12MonthsWindow(): DateWindow {
    const end = new Date();
    const start = new Date(end);
    start.setMonth(start.getMonth() - 12);

    return {
      startDate: start,
      endDate: end,
    };
  }

  private isWithinWindow(timestamp: number, window: DateWindow): boolean {
    return timestamp >= window.startDate.getTime() && timestamp <= window.endDate.getTime();
  }

  private calculateDeltaPercent(current: number, baseline: number): number | null {
    if (baseline <= 0) {
      return null;
    }

    return ((current - baseline) / baseline) * 100;
  }

  private buildRow(
    categoryId: string,
    category: Category | undefined,
    selectedPeriodAmount: number,
    lastMonthAmount: number,
    fixedLast12MonthsTotal: number,
  ): CategoryExpenseDeltaRow {
    const last12MonthsAvgAmount = fixedLast12MonthsTotal / 12;
    const remainingFromAverage = last12MonthsAvgAmount - selectedPeriodAmount;
    const progressPercent = this.calculateProgressPercent(selectedPeriodAmount, last12MonthsAvgAmount);
    const progressState = this.getProgressState(progressPercent, last12MonthsAvgAmount, selectedPeriodAmount);
    const fromLastMonthDeltaPercent = this.calculateDeltaPercent(selectedPeriodAmount, lastMonthAmount);
    const fromAverageDeltaPercent = this.calculateDeltaPercent(selectedPeriodAmount, last12MonthsAvgAmount);

    return {
      categoryId,
      categoryName: this.resolveCategoryName(categoryId, category),
      categoryIcon: category?.icon || this.defaultIcon,
      categoryColor: category?.color || 'var(--ion-color-medium)',
      selectedPeriodAmount,
      lastMonthAmount,
      last12MonthsAvgAmount,
      remainingFromAverage,
      progressPercent,
      progressBarValue: Math.min(1, progressPercent / 100),
      statusLabel: progressState.label,
      progressClass: progressState.className,
      fromLastMonthDeltaPercent,
      fromAverageDeltaPercent,
      fromLastMonthLabel: this.formatLastMonthDeltaLabel(fromLastMonthDeltaPercent),
      fromAverageLabel: this.formatAverageDeltaLabel(fromAverageDeltaPercent),
    };
  }

  private calculateProgressPercent(selectedAmount: number, averageAmount: number): number {
    if (averageAmount <= 0) {
      return selectedAmount > 0 ? 100 : 0;
    }

    return Math.max(0, (selectedAmount / averageAmount) * 100);
  }

  private getProgressState(
    progressPercent: number,
    averageAmount: number,
    selectedAmount: number,
  ): ProgressState {
    if (averageAmount <= 0) {
      return selectedAmount > 0
        ? { label: 'Exceeded', className: 'progress-exceeded' }
        : { label: 'Safe', className: 'progress-safe' };
    }

    if (progressPercent <= 50) {
      return { label: 'Safe', className: 'progress-safe' };
    }

    if (progressPercent <= 80) {
      return { label: 'Warning', className: 'progress-warning' };
    }

    if (progressPercent <= 100) {
      return { label: 'Near limit', className: 'progress-near-limit' };
    }

    return { label: 'Exceeded', className: 'progress-exceeded' };
  }

  private formatSignedPercent(value: number): string {
    const rounded = Math.abs(value).toFixed(1);
    const sign = value >= 0 ? '+' : '-';
    return `${sign}${rounded}%`;
  }

  private formatLastMonthDeltaLabel(value: number | null): string {
    if (value === null) {
      return 'N/A from last month';
    }

    return `${this.formatSignedPercent(value)} from last month`;
  }

  private formatAverageDeltaLabel(value: number | null): string {
    if (value === null) {
      return 'N/A from average';
    }

    if (value < 0) {
      return `${this.formatSignedPercent(value)} less from average`;
    }

    if (value > 0) {
      return `${this.formatSignedPercent(value)} more than average`;
    }

    return '0.0% from average';
  }

  private resolveCategoryName(categoryId: string, category: Category | undefined): string {
    if (categoryId === ExpenseCategoryDeltaWidgetComponent.UNCATEGORIZED_ID) {
      return 'Uncategorized';
    }

    return category?.name || 'Unknown category';
  }

  private normalizeCategoryId(categoryId: string): string {
    return categoryId || ExpenseCategoryDeltaWidgetComponent.UNCATEGORIZED_ID;
  }

  private isCategoryVisible(categoryId: string): boolean {
    if (!this.selectedCategoryIds) {
      return true;
    }

    return this.selectedCategoryIds.has(this.normalizeCategoryId(categoryId));
  }

  private getCategorySelectionOptions(): WidgetSettingsOption[] {
    const categoryOptions = Array.from(this.categoriesById.values())
      .sort((first, second) => first.name.localeCompare(second.name))
      .map((category) => ({
        id: category.id,
        label: category.name,
        icon: category.icon || undefined,
        color: category.color || undefined,
      }));

    return [
      ...categoryOptions,
      {
        id: ExpenseCategoryDeltaWidgetComponent.UNCATEGORIZED_ID,
        label: 'Uncategorized',
        icon: this.defaultIcon,
        color: 'var(--ion-color-medium)',
      },
    ];
  }

  private loadSavedCategorySelection(): void {
    const savedValue = localStorage.getItem(ExpenseCategoryDeltaWidgetComponent.STORAGE_KEY);
    if (!savedValue) {
      this.selectedCategoryIds = null;
      this.hasSavedCategorySelection = false;
      return;
    }

    try {
      const parsed = JSON.parse(savedValue);
      if (!Array.isArray(parsed)) {
        throw new Error('Invalid category selection format');
      }

      const selectedIds = parsed.filter((value): value is string => typeof value === 'string');
      this.selectedCategoryIds = new Set<string>(selectedIds);
      this.hasSavedCategorySelection = true;
    } catch {
      localStorage.removeItem(ExpenseCategoryDeltaWidgetComponent.STORAGE_KEY);
      this.selectedCategoryIds = null;
      this.hasSavedCategorySelection = false;
    }
  }

  private persistCategorySelection(selectedCategoryIds: Set<string> | null): void {
    if (!selectedCategoryIds || selectedCategoryIds.size === 0) {
      localStorage.removeItem(ExpenseCategoryDeltaWidgetComponent.STORAGE_KEY);
      this.hasSavedCategorySelection = false;
      return;
    }

    localStorage.setItem(
      ExpenseCategoryDeltaWidgetComponent.STORAGE_KEY,
      JSON.stringify(Array.from(selectedCategoryIds)),
    );
    this.hasSavedCategorySelection = true;
  }

  private sanitizeSavedSelection(): void {
    if (!this.selectedCategoryIds) {
      return;
    }

    const validCategoryIds = new Set<string>([
      ...Array.from(this.categoriesById.keys()),
      ExpenseCategoryDeltaWidgetComponent.UNCATEGORIZED_ID,
    ]);

    const sanitizedSelection = new Set<string>(
      Array.from(this.selectedCategoryIds).filter((id) => validCategoryIds.has(id))
    );

    if (sanitizedSelection.size === this.selectedCategoryIds.size) {
      return;
    }

    this.selectedCategoryIds = sanitizedSelection;
    this.persistCategorySelection(this.selectedCategoryIds);
  }

  private loadSavedTopCategoryCount(): void {
    const savedValue = localStorage.getItem(ExpenseCategoryDeltaWidgetComponent.TOP_N_STORAGE_KEY);

    if (savedValue === null) {
      this.topCategoryCount = null;
      this.hasSavedTopCategoryLimit = false;
      return;
    }

    try {
      const parsed = JSON.parse(savedValue) as number | null;

      if (parsed === null) {
        this.topCategoryCount = null;
        this.hasSavedTopCategoryLimit = false;
        return;
      }

      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error('Invalid top category limit');
      }

      this.topCategoryCount = parsed;
      this.hasSavedTopCategoryLimit = true;
    } catch {
      localStorage.removeItem(ExpenseCategoryDeltaWidgetComponent.TOP_N_STORAGE_KEY);
      this.topCategoryCount = null;
      this.hasSavedTopCategoryLimit = false;
    }
  }

  private persistTopCategoryCount(value: number | null): void {
    if (value === null) {
      localStorage.removeItem(ExpenseCategoryDeltaWidgetComponent.TOP_N_STORAGE_KEY);
      this.topCategoryCount = null;
      this.hasSavedTopCategoryLimit = false;
      return;
    }

    localStorage.setItem(
      ExpenseCategoryDeltaWidgetComponent.TOP_N_STORAGE_KEY,
      JSON.stringify(value),
    );
    this.topCategoryCount = value;
    this.hasSavedTopCategoryLimit = true;
  }

  private loadSavedGroupOthers(): void {
    const savedValue = localStorage.getItem(
      ExpenseCategoryDeltaWidgetComponent.GROUP_OTHERS_STORAGE_KEY,
    );

    if (savedValue === null) {
      this.groupOthers = true;
      return;
    }

    try {
      this.groupOthers = JSON.parse(savedValue) !== false;
    } catch {
      localStorage.removeItem(ExpenseCategoryDeltaWidgetComponent.GROUP_OTHERS_STORAGE_KEY);
      this.groupOthers = true;
    }
  }

  private persistGroupOthers(value: boolean): void {
    if (value) {
      localStorage.removeItem(ExpenseCategoryDeltaWidgetComponent.GROUP_OTHERS_STORAGE_KEY);
    } else {
      localStorage.setItem(
        ExpenseCategoryDeltaWidgetComponent.GROUP_OTHERS_STORAGE_KEY,
        JSON.stringify(false),
      );
    }

    this.groupOthers = value;
  }

  private applyTopCategoryLimit(rows: CategoryExpenseDeltaRow[]): CategoryExpenseDeltaRow[] {
    if (this.topCategoryCount === null || rows.length <= this.topCategoryCount) {
      return rows;
    }

    const topRows = rows.slice(0, this.topCategoryCount);
    const remainingRows = rows.slice(this.topCategoryCount);

    if (!this.groupOthers) {
      return topRows;
    }

    const otherRow = remainingRows.reduce<CategoryExpenseDeltaRow>(
      (accumulator, row) => {
        return this.buildRow(
          '__other__',
          undefined,
          accumulator.selectedPeriodAmount + row.selectedPeriodAmount,
          accumulator.lastMonthAmount + row.lastMonthAmount,
          (accumulator.last12MonthsAvgAmount + row.last12MonthsAvgAmount) * 12,
        );
      },
      {
        categoryId: '__other__',
        categoryName: 'Other',
        categoryIcon: this.defaultIcon,
        categoryColor: 'var(--ion-color-medium)',
        selectedPeriodAmount: 0,
        lastMonthAmount: 0,
        last12MonthsAvgAmount: 0,
        remainingFromAverage: 0,
        progressPercent: 0,
        progressBarValue: 0,
        statusLabel: 'Safe',
        progressClass: 'progress-safe',
        fromLastMonthDeltaPercent: null,
        fromAverageDeltaPercent: null,
        fromLastMonthLabel: 'N/A from last month',
        fromAverageLabel: 'N/A from average',
      },
    );

    const hasAnyAmount =
      otherRow.selectedPeriodAmount > 0 ||
      otherRow.lastMonthAmount > 0 ||
      otherRow.last12MonthsAvgAmount > 0;

    return hasAnyAmount ? [...topRows, otherRow] : topRows;
  }

  private registerIconsFromCategories(categories: Category[]): void {
    const iconsToRegister: Record<string, string> = {};

    categories.forEach((category) => {
      const iconName = category.icon?.trim();
      if (!iconName || this.registeredIconNames.has(iconName)) {
        return;
      }

      const exportName = iconName.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
      const iconData = (ionicons as Record<string, string>)[exportName];

      if (!iconData) {
        return;
      }

      iconsToRegister[iconName] = iconData;
      this.registeredIconNames.add(iconName);
    });

    if (Object.keys(iconsToRegister).length > 0) {
      addIcons(iconsToRegister);
    }
  }

  private getFallbackDateRange(): DashboardDateRange {
    const now = new Date();
    return {
      startDate: new Date(now.getFullYear(), now.getMonth(), 1),
      endDate: now,
      period: 'monthly',
    };
  }
}
