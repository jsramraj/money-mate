import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonBackButton,
  IonBadge,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  chevronForwardOutline,
  repeatOutline,
} from 'ionicons/icons';
import { RecurringPayment } from '../core/database/models';
import { DatabaseService } from '../core/database/database.service';
import { AccountRepository, CategoryRepository, TransactionRepository } from '../core/database/repositories';

interface RecurringPaymentMonthGroup {
  key: string;
  label: string;
  sortTime: number;
  payments: RecurringPayment[];
}

@Component({
  selector: 'app-recurring-payments',
  standalone: true,
  templateUrl: './recurring-payments.page.html',
  styleUrls: ['./recurring-payments.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonList,
    IonItem,
    IonBadge,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonIcon,
    IonSpinner,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringPaymentsPage implements OnInit {
  private readonly CURRENCY_KEY = 'money-mate-currency';
  recurringPayments: RecurringPayment[] = [];
  activeRecurringPayments: RecurringPayment[] = [];
  activeRecurringPaymentGroups: RecurringPaymentMonthGroup[] = [];
  pausedRecurringPayments: RecurringPayment[] = [];
  loading = true;
  error: string | null = null;
  selectedCurrency = 'USD';
  selectedTab: 'active' | 'paused' = 'active';
  private accountNames = new Map<string, string>();
  private categoryNames = new Map<string, string>();
  private completedRecurringPaymentIdsInCurrentMonth = new Set<string>();

  constructor(
    private readonly db: DatabaseService,
    private readonly accountRepository: AccountRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly transactionRepository: TransactionRepository,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {
    addIcons({
      repeatOutline,
      chevronForwardOutline,
    });
  }

  ngOnInit(): void {
    this.loadSelectedCurrency();
    void this.loadRecurringPayments();
  }

  ionViewWillEnter(): void {
    void this.loadRecurringPayments();
  }

  get visibleRecurringPayments(): RecurringPayment[] {
    return this.recurringPayments.filter((item) => !item.isDeleted && item.status !== 'cancelled');
  }

  get totalExpenses(): number {
    return this.activeRecurringPayments
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + Math.abs(item.amount), 0);
  }

  get currentMonthExpenses(): number {
    return this.getCurrentMonthRecurringPayments()
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + Math.abs(item.amount), 0);
  }

  get totalIncome(): number {
    return this.activeRecurringPayments
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + Math.abs(item.amount), 0);
  }

  get currentMonthIncome(): number {
    return this.getCurrentMonthRecurringPayments()
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + Math.abs(item.amount), 0);
  }

  get hasIncome(): boolean {
    return this.activeRecurringPayments.some((item) => item.type === 'income');
  }

  get hasExpenses(): boolean {
    return this.activeRecurringPayments.some((item) => item.type === 'expense');
  }

  get hasCurrentMonthIncome(): boolean {
    return this.getCurrentMonthRecurringPayments().some((item) => item.type === 'income');
  }

  get hasCurrentMonthExpenses(): boolean {
    return this.getCurrentMonthRecurringPayments().some((item) => item.type === 'expense');
  }

  onTabChange(event: CustomEvent): void {
    const value = event.detail?.value;

    if (value === 'active' || value === 'paused') {
      this.selectedTab = value;
    }
  }

  trackByRecurringPaymentId(_: number, recurringPayment: RecurringPayment): string {
    return recurringPayment.id;
  }

  trackByRecurringPaymentGroup(_: number, group: RecurringPaymentMonthGroup): string {
    return group.key;
  }

  getDisplayAmount(amount: number): number {
    return Math.abs(amount);
  }

  getFrequencyLabel(frequency: RecurringPayment['frequency']): string {
    switch (frequency) {
      case 'week':
        return 'week';
      case 'year':
        return 'year';
      case 'once':
        return 'once';
      default:
        return 'month';
    }
  }

  getNextPaymentDate(recurringPayment: RecurringPayment): Date {
    const referenceDate = new Date();
    const anchorDate = new Date(recurringPayment.date);

    switch (recurringPayment.frequency) {
      case 'week':
        return this.getNextWeeklyDate(anchorDate, referenceDate);
      case 'year':
        return this.getNextYearlyDate(anchorDate, referenceDate);
      case 'once':
        return this.getOnceDate(anchorDate);
      default:
        return this.getNextMonthlyDate(
          anchorDate,
          referenceDate,
          this.completedRecurringPaymentIdsInCurrentMonth.has(recurringPayment.id),
        );
    }
  }

  private getOnceDate(anchorDate: Date): Date {
    return new Date(anchorDate);
  }

  private getNextMonthlyDate(anchorDate: Date, referenceDate: Date, forceNextMonth = false): Date {
    const thisMonthScheduled = this.getMonthlyScheduledDate(anchorDate, referenceDate);

    if (forceNextMonth) {
      return this.getMonthlyScheduledDate(anchorDate, new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1));
    }

    return thisMonthScheduled.getTime() >= referenceDate.getTime()
      ? thisMonthScheduled
      : this.getMonthlyScheduledDate(anchorDate, new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1));
  }

  private getNextWeeklyDate(anchorDate: Date, referenceDate: Date): Date {
    const currentDay = referenceDate.getDay();
    const targetDay = anchorDate.getDay();
    const dayDifference = targetDay - currentDay;
    const scheduled = new Date(referenceDate);
    scheduled.setDate(referenceDate.getDate() + dayDifference);
    scheduled.setHours(anchorDate.getHours(), anchorDate.getMinutes(), anchorDate.getSeconds(), anchorDate.getMilliseconds());

    if (scheduled.getTime() < referenceDate.getTime()) {
      scheduled.setDate(scheduled.getDate() + 7);
    }

    return scheduled;
  }

  private getNextYearlyDate(anchorDate: Date, referenceDate: Date): Date {
    const scheduled = this.getYearlyScheduledDate(anchorDate, referenceDate.getFullYear());
    if (scheduled.getTime() >= referenceDate.getTime()) {
      return scheduled;
    }

    return this.getYearlyScheduledDate(anchorDate, referenceDate.getFullYear() + 1);
  }

  private getMonthlyScheduledDate(anchorDate: Date, referenceDate: Date): Date {
    const maxDayInMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate();
    const day = Math.min(anchorDate.getDate(), maxDayInMonth);

    return new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      day,
      anchorDate.getHours(),
      anchorDate.getMinutes(),
      anchorDate.getSeconds(),
      anchorDate.getMilliseconds(),
    );
  }

  private getYearlyScheduledDate(anchorDate: Date, year: number): Date {
    const month = anchorDate.getMonth();
    const maxDayInMonth = new Date(year, month + 1, 0).getDate();
    const day = Math.min(anchorDate.getDate(), maxDayInMonth);

    return new Date(
      year,
      month,
      day,
      anchorDate.getHours(),
      anchorDate.getMinutes(),
      anchorDate.getSeconds(),
      anchorDate.getMilliseconds(),
    );
  }

  getCategoryName(recurringPayment: RecurringPayment): string {
    if (recurringPayment.type === 'transfer') {
      return 'Transfer';
    }

    return this.categoryNames.get(recurringPayment.categoryId) ?? '';
  }

  getAccountName(accountId: string): string {
    return this.accountNames.get(accountId) ?? 'Unknown account';
  }

  async openEditPage(recurringPayment: RecurringPayment): Promise<void> {
    await this.router.navigate(['/settings/recurring-payments', recurringPayment.id]);
  }

  private async loadRecurringPayments(): Promise<void> {
    try {
      this.loading = true;
      this.error = null;

      const [recurringPayments, accounts, categories] = await Promise.all([
        this.db.recurringPayments.orderBy('date').reverse().toArray(),
        this.accountRepository.getAccountsForSettings(),
        this.categoryRepository.getCategoriesForSettings(),
      ]);

      this.accountNames = new Map(accounts.map((account) => [account.id, account.name]));
      this.categoryNames = new Map(categories.map((category) => [category.id, category.name]));
      this.recurringPayments = recurringPayments;

      const visibleRecurringPayments = this.visibleRecurringPayments;
      const recurringPaymentIds = visibleRecurringPayments.map((item) => item.id);
      const currentMonthRange = this.getMonthDateRange();
      const currentMonthTransactions = await this.transactionRepository.getTransactionsByRecurringPaymentIdsInDateRange(
        recurringPaymentIds,
        currentMonthRange.start,
        currentMonthRange.end,
      );

      this.completedRecurringPaymentIdsInCurrentMonth = new Set(
        currentMonthTransactions
          .map((item) => item.recurringPaymentId)
          .filter((id): id is string => !!id),
      );

      this.activeRecurringPayments = visibleRecurringPayments
        .filter((item) => item.status !== 'paused')
        .sort((a, b) => this.getNextPaymentDate(a).getTime() - this.getNextPaymentDate(b).getTime());
      this.pausedRecurringPayments = visibleRecurringPayments
        .filter((item) => item.status === 'paused')
        .sort((a, b) => this.getNextPaymentDate(a).getTime() - this.getNextPaymentDate(b).getTime());
      this.activeRecurringPaymentGroups = this.buildRecurringPaymentGroups(this.activeRecurringPayments);
    } catch (error) {
      console.error('Failed to load recurring payments:', error);
      this.error = 'Failed to load recurring payments';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private loadSelectedCurrency(): void {
    this.selectedCurrency = localStorage.getItem(this.CURRENCY_KEY) || 'USD';
  }

  private buildRecurringPaymentGroups(recurringPayments: RecurringPayment[]): RecurringPaymentMonthGroup[] {
    const groups = new Map<string, RecurringPaymentMonthGroup>();
    const currentMonthKey = this.getMonthKey(new Date());

    recurringPayments.forEach((recurringPayment) => {
      const nextPaymentDate = this.getNextPaymentDate(recurringPayment);
      const monthKey = this.getMonthKey(nextPaymentDate);
      const existingGroup = groups.get(monthKey);

      if (existingGroup) {
        existingGroup.payments.push(recurringPayment);
        return;
      }

      groups.set(monthKey, {
        key: monthKey,
        label: monthKey === currentMonthKey ? 'This month' : this.getMonthLabel(nextPaymentDate),
        sortTime: new Date(nextPaymentDate.getFullYear(), nextPaymentDate.getMonth(), 1).getTime(),
        payments: [recurringPayment],
      });
    });

    return Array.from(groups.values()).sort((left, right) => left.sortTime - right.sortTime);
  }

  private getMonthKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private getMonthLabel(date: Date): string {
    return new Intl.DateTimeFormat(undefined, {
      month: 'long',
      year: 'numeric',
    }).format(date);
  }

  private getMonthDateRange(referenceDate = new Date()): { start: Date; end: Date } {
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
    const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  private getCurrentMonthRecurringPayments(referenceDate = new Date()): RecurringPayment[] {
    const month = referenceDate.getMonth();
    const year = referenceDate.getFullYear();

    return this.activeRecurringPayments.filter((item) => {
      const nextPaymentDate = this.getNextPaymentDate(item);
      return nextPaymentDate.getMonth() === month && nextPaymentDate.getFullYear() === year;
    });
  }
}
