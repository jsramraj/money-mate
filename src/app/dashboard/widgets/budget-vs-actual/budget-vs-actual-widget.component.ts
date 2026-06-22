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
import { settings, settingsOutline, walletOutline, pricetagOutline } from 'ionicons/icons';
import * as ionicons from 'ionicons/icons';
import { Budget, Category, Transaction } from '../../../core/database/models';
import { BudgetRepository, CategoryRepository, TransactionRepository } from '../../../core/database/repositories';
import { DashboardDateRange, DashboardDateRangeService } from '../../services/dashboard-date-range.service';
import { WidgetSettingsModalComponent, WidgetSettingsOption, WidgetSettingsResult } from '../../../shared/widget-settings';

interface BudgetVsActualItem {
  budget: Budget;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  actualSpent: number;
  remaining: number;
  progressPercent: number;
  progressBarValue: number;
  statusLabel: string;
  progressClass: 'progress-safe' | 'progress-warning' | 'progress-near-limit' | 'progress-exceeded';
}

interface BudgetProgressState {
  label: 'Safe' | 'Warning' | 'Near limit' | 'Exceeded';
  className: 'progress-safe' | 'progress-warning' | 'progress-near-limit' | 'progress-exceeded';
}

@Component({
  selector: 'app-budget-vs-actual-widget',
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
  templateUrl: './budget-vs-actual-widget.component.html',
  styleUrls: ['./budget-vs-actual-widget.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetVsActualWidgetComponent implements OnInit, OnDestroy {
  private static readonly STORAGE_KEY = 'dashboard.budgetVsActual.visibleCategoryIds';
  private static readonly CURRENCY_KEY = 'money-mate-currency';

  loading = true;
  error: string | null = null;
  hasChartData = false;
  hasSavedCategorySelection = false;
  selectedCurrency = 'USD';

  items: BudgetVsActualItem[] = [];

  private readonly defaultIcon = 'pricetag-outline';
  private readonly registeredIconNames = new Set<string>(['settings-outline', this.defaultIcon]);
  private subscription?: Subscription;
  private categoriesById = new Map<string, Category>();
  private selectedCategoryIds: Set<string> | null = null;
  private latestTransactions: Transaction[] = [];
  private latestBudgets: Budget[] = [];
  private selectedDateRange: DashboardDateRange | null = null;

  constructor(
    private readonly budgetRepository: BudgetRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly dateRangeService: DashboardDateRangeService,
    private readonly modalController: ModalController,
    private readonly cdr: ChangeDetectorRef,
  ) {
    addIcons({ settings, settingsOutline, walletOutline, pricetagOutline });
  }

  ngOnInit(): void {
    this.selectedCurrency = localStorage.getItem(BudgetVsActualWidgetComponent.CURRENCY_KEY) || 'USD';

    this.subscription = combineLatest([
      this.dateRangeService.getDateRange$(),
      this.budgetRepository.getBudgets$(),
      this.transactionRepository.getTransactions$(),
    ]).subscribe({
      next: ([range, budgets, transactions]) => {
        this.selectedDateRange = range;
        this.latestBudgets = budgets;
        this.latestTransactions = transactions;
        void this.refresh();
      },
      error: (error) => {
        console.error('Error loading budget vs actual widget sources:', error);
        this.error = 'Failed to load budgets';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });

    void this.loadCategories();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  get hasItems(): boolean {
    return this.items.length > 0;
  }

  get settingsIconName(): string {
    return this.hasSavedCategorySelection ? 'settings' : 'settings-outline';
  }

  get hasSavedSettings(): boolean {
    return this.hasSavedCategorySelection;
  }

  trackByBudgetId(_: number, item: BudgetVsActualItem): string {
    return item.budget.id;
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
        title: 'Budget vs Actual settings',
        selectionTitle: 'Visible categories',
        selectionDescription: 'Choose which budget categories should appear in this widget.',
        options,
        selectedIds,
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
    this.rebuildItems();
  }

  getBudgetIcon(item: BudgetVsActualItem): string {
    const normalized = item.categoryIcon?.trim();
    if (!normalized) {
      return this.defaultIcon;
    }

    return this.registeredIconNames.has(normalized) ? normalized : this.defaultIcon;
  }

  getBudgetIconColor(item: BudgetVsActualItem): string {
    return item.categoryColor || 'var(--ion-color-medium)';
  }

  private async loadCategories(): Promise<void> {
    const categories = await this.categoryRepository.getCategoriesForSettings();
    this.categoriesById = new Map(categories.map((category) => [category.id, category]));
    this.registerIconsFromCategories(categories);
    this.loadSavedCategorySelection();
    this.cdr.markForCheck();
  }

  private async refresh(): Promise<void> {
    try {
      this.loading = true;
      this.error = null;

      if (this.categoriesById.size === 0) {
        await this.loadCategories();
      }

      this.rebuildItems();
    } catch (error) {
      console.error('Error building budget vs actual widget:', error);
      this.error = 'Failed to load budget comparison';
      this.items = [];
      this.hasChartData = false;
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private rebuildItems(): void {
    const range = this.selectedDateRange ?? this.getFallbackDateRange();
    const selectedCategorySet = this.selectedCategoryIds;
    const activeBudgets = this.latestBudgets.filter((budget) => {
      if (budget.isDeleted || budget.amount <= 0) {
        return false;
      }

      const categoryId = budget.categoryIds?.[0];
      if (!categoryId) {
        return false;
      }

      return !selectedCategorySet || selectedCategorySet.has(categoryId);
    });

    this.items = activeBudgets
      .map((budget) => this.buildBudgetItem(budget, range))
      .filter((item): item is BudgetVsActualItem => !!item);

    this.hasChartData = this.items.length > 0;
    this.cdr.markForCheck();
  }

  private buildBudgetItem(budget: Budget, range: DashboardDateRange): BudgetVsActualItem | null {
    const categoryIds = (budget.categoryIds ?? []).filter(Boolean);
    if (categoryIds.length === 0) {
      return null;
    }

    const categoryId = categoryIds[0];
    const category = this.categoriesById.get(categoryId);
    const actualSpent = this.calculateActualSpent(categoryIds, range);
    const remaining = budget.amount - actualSpent;
    const progressPercent = budget.amount > 0 ? Math.max(0, (actualSpent / budget.amount) * 100) : 0;
    const progressBarValue = Math.min(1, progressPercent / 100);
    const progressState = this.getProgressState(progressPercent, budget.alertThresholds);

    return {
      budget,
      categoryName: category?.name || budget.name || 'Budget',
      categoryIcon: category?.icon || this.defaultIcon,
      categoryColor: category?.color || 'var(--ion-color-medium)',
      actualSpent,
      remaining,
      progressPercent,
      progressBarValue,
      statusLabel: progressState.label,
      progressClass: progressState.className,
    };
  }

  private getProgressState(progressPercent: number, thresholds?: number[]): BudgetProgressState {
    const [safeThreshold, warningThreshold, limitThreshold] = this.getThresholdTriplet(thresholds);

    if (progressPercent <= safeThreshold) {
      return { label: 'Safe', className: 'progress-safe' };
    }

    if (progressPercent <= warningThreshold) {
      return { label: 'Warning', className: 'progress-warning' };
    }

    if (progressPercent <= limitThreshold) {
      return { label: 'Near limit', className: 'progress-near-limit' };
    }

    return { label: 'Exceeded', className: 'progress-exceeded' };
  }

  private getThresholdTriplet(thresholds?: number[]): [number, number, number] {
    const defaults: [number, number, number] = [50, 80, 100];
    if (!thresholds || thresholds.length === 0) {
      return defaults;
    }

    const normalized = thresholds
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.round(value))
      .sort((a, b) => a - b);

    if (normalized.length < 3) {
      return defaults;
    }

    return [normalized[0], normalized[1], normalized[2]];
  }

  private calculateActualSpent(categoryIds: string[], range: DashboardDateRange): number {
    const categorySet = new Set(categoryIds);

    return this.latestTransactions
      .filter((transaction) => {
        if (transaction.isDeleted || transaction.type !== 'expense') {
          return false;
        }

        if (!categorySet.has(transaction.categoryId)) {
          return false;
        }

        const transactionDate = new Date(transaction.date).getTime();
        const start = new Date(range.startDate).getTime();
        const end = new Date(range.endDate).getTime();

        return transactionDate >= start && transactionDate <= end;
      })
      .reduce((total, transaction) => total + Math.abs(transaction.amount), 0);
  }

  private getCategorySelectionOptions(): WidgetSettingsOption[] {
    const budgetCategoryIds = new Set(
      this.latestBudgets
        .filter((budget) => !budget.isDeleted)
        .flatMap((budget) => budget.categoryIds ?? [])
        .filter(Boolean)
    );

    return Array.from(this.categoriesById.values())
      .filter((category) => !category.isDeleted && budgetCategoryIds.has(category.id))
      .map((category) => ({
        id: category.id,
        label: category.name,
        icon: category.icon,
        color: category.color,
      }));
  }

  private loadSavedCategorySelection(): void {
    try {
      const rawValue = localStorage.getItem(BudgetVsActualWidgetComponent.STORAGE_KEY);
      if (!rawValue) {
        this.selectedCategoryIds = null;
        this.hasSavedCategorySelection = false;
        return;
      }

      const parsed = JSON.parse(rawValue) as string[];
      const availableCategoryIds = new Set(this.getCategorySelectionOptions().map((option) => option.id));
      const filteredParsed = Array.isArray(parsed)
        ? parsed.filter((id) => availableCategoryIds.has(id))
        : [];

      this.selectedCategoryIds = filteredParsed.length > 0 ? new Set(filteredParsed) : null;
      this.hasSavedCategorySelection = !!this.selectedCategoryIds;
    } catch {
      this.selectedCategoryIds = null;
      this.hasSavedCategorySelection = false;
    }
  }

  private persistCategorySelection(categoryIds: Set<string> | null): void {
    if (!categoryIds || categoryIds.size === 0) {
      localStorage.removeItem(BudgetVsActualWidgetComponent.STORAGE_KEY);
      this.hasSavedCategorySelection = false;
      return;
    }

    localStorage.setItem(BudgetVsActualWidgetComponent.STORAGE_KEY, JSON.stringify(Array.from(categoryIds)));
    this.hasSavedCategorySelection = true;
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
