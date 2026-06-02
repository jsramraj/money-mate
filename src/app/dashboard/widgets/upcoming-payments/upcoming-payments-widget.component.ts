import { Component, ChangeDetectionStrategy, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
  IonButton,
  IonSpinner,
  IonText,
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { DatabaseService } from '../../../core/database/database.service';
import { RecurringStartupService } from '../../../core/services/recurring-startup.service';
import { TransactionRepository } from '../../../core/database/repositories';
import { DashboardDateRangeService } from '../../services/dashboard-date-range.service';

interface UpcomingItem {
  id: string;
  description: string;
  amount: number;
  scheduledDate: Date;
}

@Component({
  selector: 'app-upcoming-payments-widget',
  standalone: true,
  imports: [CommonModule, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonList, IonItem, IonLabel, IonButton, IonSpinner, IonText],
  templateUrl: './upcoming-payments-widget.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpcomingPaymentsWidgetComponent implements OnDestroy {
  private readonly db = inject(DatabaseService);
  private readonly recurringStartup = inject(RecurringStartupService);
  private readonly transactionRepository = inject(TransactionRepository);
  private readonly dateRangeService = inject(DashboardDateRangeService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly router = inject(Router);

  loading = true;
  items: UpcomingItem[] = [];
  totalCount = 0;
  totalAmount = 0;

  private sub?: Subscription;

  constructor() {
    this.sub = this.dateRangeService.getDateRange$().subscribe((range) => {
      void this.loadForRange(range.startDate, range.endDate);
    });
    // Ensure initial load (BehaviorSubject should emit, but call explicitly to be safe)
    const current = this.dateRangeService.getCurrentDateRange();
    void this.loadForRange(current.startDate, current.endDate);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private async loadForRange(start: Date, end: Date): Promise<void> {
    this.loading = true;
    try {
      const recurringPayments = await this.db.recurringPayments.toArray();

      const candidates: UpcomingItem[] = [];

      for (const rp of recurringPayments) {
        if (rp.isDeleted || rp.status !== 'active') continue;

        let scheduled: Date | null = null;

        if (rp.frequency === 'month') {
          scheduled = this.recurringStartup['getScheduledDateForMonth'](rp.date, start);
        } else if (rp.frequency === 'week') {
          const sourceDow = new Date(rp.date).getDay();
          const s = new Date(start);
          const offset = (sourceDow - s.getDay() + 7) % 7;
          scheduled = new Date(s);
          scheduled.setDate(s.getDate() + offset);
        } else if (rp.frequency === 'year') {
          const src = new Date(rp.date);
          const cand = new Date(start.getFullYear(), src.getMonth(), src.getDate(), src.getHours(), src.getMinutes(), src.getSeconds(), src.getMilliseconds());
          if (cand < start) {
            cand.setFullYear(cand.getFullYear() + 1);
          }
          scheduled = cand;
        }

        if (!scheduled) continue;
        if (scheduled.getTime() < start.getTime() || scheduled.getTime() > end.getTime()) continue;

        candidates.push({
          id: rp.id,
          description: rp.description?.trim() || 'Untitled recurring payment',
          amount: Math.abs(rp.amount),
          scheduledDate: scheduled,
        });
      }

      // Exclude recurring payments that already have transactions in range
      const ids = candidates.map((c) => c.id);
      const existing = ids.length > 0
        ? await this.transactionRepository.getTransactionsByRecurringPaymentIdsInDateRange(ids, start, end)
        : [];

      const existingIds = new Set(existing.map((tx) => tx.recurringPaymentId).filter((id): id is string => !!id));

      const filtered = candidates
        .filter((c) => !existingIds.has(c.id))
        .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());

      this.totalCount = filtered.length;
      this.totalAmount = filtered.reduce((sum, it) => sum + it.amount, 0);

      this.items = filtered.slice(0, 5);
    } catch (error) {
      console.error('Failed loading upcoming payments widget:', error);
      this.items = [];
    } finally {
      this.loading = false;
      // Notify OnPush CD to update view
      try { this.cdr.markForCheck(); } catch {}
    }
  }

  viewAll(): void {
    void this.router.navigate(['/settings/recurring-payments']);
  }
}
