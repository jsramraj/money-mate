import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { IonCard, IonCardContent, IonIcon, IonText } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowDownOutline, arrowUpOutline, statsChartOutline } from 'ionicons/icons';
import { TransactionRepository } from '../../../core/database/repositories';
import {
  DashboardDateRange,
  DashboardDateRangeService,
} from '../../services/dashboard-date-range.service';

@Component({
  selector: 'app-income-expenses-dual-card-widget',
  standalone: true,
  imports: [CommonModule, IonCard, IonCardContent, IonIcon, IonText],
  templateUrl: './income-expenses-dual-card-widget.component.html',
  styleUrls: ['./income-expenses-dual-card-widget.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomeExpensesDualCardWidgetComponent implements OnInit, OnDestroy {
  private readonly CURRENCY_KEY = 'money-mate-currency';

  loading = true;
  error: string | null = null;
  incomeTotal = 0;
  expenseTotal = 0;
  netTotal = 0;

  private dateRangeSub?: Subscription;

  constructor(
    private readonly transactionRepository: TransactionRepository,
    private readonly dateRangeService: DashboardDateRangeService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    addIcons({ arrowUpOutline, arrowDownOutline, statsChartOutline });
  }

  ngOnInit(): void {
    this.dateRangeSub = this.dateRangeService.getDateRange$().subscribe((range) => {
      void this.loadTotals(range);
    });
  }

  ngOnDestroy(): void {
    this.dateRangeSub?.unsubscribe();
  }

  get netToneClass(): string {
    if (this.netTotal > 0) {
      return 'net-positive';
    }

    if (this.netTotal < 0) {
      return 'net-negative';
    }

    return 'net-neutral';
  }

  formatAmount(value: number): string {
    const currencyCode = localStorage.getItem(this.CURRENCY_KEY) || 'USD';

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.abs(value));
  }

  private async loadTotals(range: DashboardDateRange): Promise<void> {
    try {
      this.loading = true;
      this.error = null;
      this.cdr.markForCheck();

      const [incomeTransactions, expenseTransactions] = await Promise.all([
        this.transactionRepository.queryTransactions(
          { types: ['income'] },
          { dateRange: { startDate: range.startDate, endDate: range.endDate } },
        ),
        this.transactionRepository.queryTransactions(
          { types: ['expense'] },
          { dateRange: { startDate: range.startDate, endDate: range.endDate } },
        ),
      ]);

      this.incomeTotal = incomeTransactions.reduce(
        (sum, transaction) => sum + Math.abs(transaction.amount),
        0,
      );
      this.expenseTotal = expenseTransactions.reduce(
        (sum, transaction) => sum + Math.abs(transaction.amount),
        0,
      );
      this.netTotal = this.incomeTotal - this.expenseTotal;
      this.loading = false;
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error loading income and expense totals:', error);
      this.incomeTotal = 0;
      this.expenseTotal = 0;
      this.netTotal = 0;
      this.loading = false;
      this.error = 'Failed to load income and expense totals';
      this.cdr.markForCheck();
    }
  }
}
