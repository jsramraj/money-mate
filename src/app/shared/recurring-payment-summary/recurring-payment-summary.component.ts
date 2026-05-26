import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircleOutline, pauseCircleOutline, repeatOutline } from 'ionicons/icons';
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
    addIcons({ repeatOutline, pauseCircleOutline, checkmarkCircleOutline });
  }

  get isRecurring(): boolean {
    return this.recurrenceSelection !== 'never';
  }

  get isInactive(): boolean {
    return this.recurringPayment?.status === 'inactive';
  }

  get statusIconName(): string {
    return this.isInactive ? 'pause-circle-outline' : 'checkmark-circle-outline';
  }

  get statusIconColor(): string {
    return this.isInactive ? 'warning' : 'success';
  }

  get statusIconLabel(): string {
    return this.isInactive ? 'Recurring payment inactive' : 'Recurring payment active';
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
