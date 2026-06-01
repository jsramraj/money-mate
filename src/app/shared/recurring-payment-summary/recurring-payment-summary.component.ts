import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, closeCircleOutline, pauseCircleOutline, repeatOutline } from 'ionicons/icons';
import { RecurrenceSelection, RecurringPayment } from '../../core/database/models';

@Component({
  selector: 'app-recurring-payment-summary',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './recurring-payment-summary.component.html',
  styleUrls: ['./recurring-payment-summary.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringPaymentSummaryComponent {
  @Input() recurrenceSelection: RecurrenceSelection = 'never';
  @Input() recurringPayment: RecurringPayment | null = null;

  constructor() {
    addIcons({ repeatOutline, pauseCircleOutline, checkmarkCircleOutline, closeCircleOutline });
  }

  get isRecurring(): boolean {
    return this.recurrenceSelection !== 'never';
  }

  get isPaused(): boolean {
    return this.recurringPayment?.status === 'paused';
  }

  get isCancelled(): boolean {
    return this.recurringPayment?.status === 'cancelled';
  }

  get statusIconName(): string {
    if (this.isCancelled) {
      return 'close-circle-outline';
    }

    if (this.isPaused) {
      return 'pause-circle-outline';
    }

    return 'checkmark-circle-outline';
  }

  get statusIconColor(): string {
    if (this.isCancelled) {
      return 'danger';
    }

    if (this.isPaused) {
      return 'warning';
    }

    return 'success';
  }

  get statusIconLabel(): string {
    if (this.isCancelled) {
      return 'Recurring payment cancelled';
    }

    if (this.isPaused) {
      return 'Recurring payment paused';
    }

    return 'Recurring payment active';
  }

  get statusTitle(): string {
    if (this.isCancelled) {
      return 'Cancelled';
    }

    if (this.isPaused) {
      return 'Paused';
    }

    return 'Active';
  }

  get summaryText(): string {
    if (!this.isRecurring) {
      return 'Never';
    }

    const frequency = this.recurringPayment?.frequency;
    const anchorDate = this.recurringPayment?.date;

    if ((frequency === 'month' || !frequency) && anchorDate) {
      const dayOfMonth = new Date(anchorDate).getDate();
      if (!Number.isNaN(dayOfMonth)) {
        return `Monthly | Renews every ${this.toOrdinal(dayOfMonth)}`;
      }
    }

    if (frequency === 'week') {
      return 'Weekly | Renews every week';
    }

    if (frequency === 'year') {
      return 'Yearly | Renews every year';
    }

    return 'Monthly';
  }

  private toOrdinal(value: number): string {
    const remainderTen = value % 10;
    const remainderHundred = value % 100;

    if (remainderTen === 1 && remainderHundred !== 11) {
      return `${value}st`;
    }

    if (remainderTen === 2 && remainderHundred !== 12) {
      return `${value}nd`;
    }

    if (remainderTen === 3 && remainderHundred !== 13) {
      return `${value}rd`;
    }

    return `${value}th`;
  }
}
