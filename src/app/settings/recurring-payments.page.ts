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
import { AccountRepository, CategoryRepository } from '../core/database/repositories';

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
    IonIcon,
    IonSpinner,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringPaymentsPage implements OnInit {
  private readonly CURRENCY_KEY = 'money-mate-currency';
  recurringPayments: RecurringPayment[] = [];
  loading = true;
  error: string | null = null;
  selectedCurrency = 'USD';
  private accountNames = new Map<string, string>();
  private categoryNames = new Map<string, string>();

  constructor(
    private readonly db: DatabaseService,
    private readonly accountRepository: AccountRepository,
    private readonly categoryRepository: CategoryRepository,
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

  get activeRecurringPayments(): RecurringPayment[] {
    return this.visibleRecurringPayments
      .filter((item) => item.status !== 'paused')
      .sort((a, b) => this.getNextPaymentDate(a).getTime() - this.getNextPaymentDate(b).getTime());
  }

  get pausedRecurringPayments(): RecurringPayment[] {
    return this.visibleRecurringPayments
      .filter((item) => item.status === 'paused')
      .sort((a, b) => this.getNextPaymentDate(a).getTime() - this.getNextPaymentDate(b).getTime());
  }

  get totalExpenses(): number {
    return this.activeRecurringPayments
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + item.amount, 0);
  }

  get totalIncome(): number {
    return this.activeRecurringPayments
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + Math.abs(item.amount), 0);
  }

  get hasIncome(): boolean {
    return this.activeRecurringPayments.some((item) => item.type === 'income');
  }

  trackByRecurringPaymentId(_: number, recurringPayment: RecurringPayment): string {
    return recurringPayment.id;
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
        return this.getNextMonthlyDate(anchorDate, referenceDate);
    }
  }

  private getOnceDate(anchorDate: Date): Date {
    return new Date(anchorDate);
  }

  private getNextMonthlyDate(anchorDate: Date, referenceDate: Date): Date {
    const thisMonthScheduled = this.getMonthlyScheduledDate(anchorDate, referenceDate);
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

    return this.categoryNames.get(recurringPayment.categoryId) ?? 'Uncategorized';
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
}
