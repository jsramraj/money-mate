import { Injectable } from '@angular/core';
import { DatabaseService } from '../database.service';
import { RecurringPayment } from '../models';

@Injectable({
  providedIn: 'root',
})
export class RecurringPaymentRepository {
  constructor(private readonly db: DatabaseService) {}

  async getDirtyRecurringPayments(): Promise<RecurringPayment[]> {
    try {
      return await this.db.recurringPayments
        .filter((rp) => !!rp.isDirty)
        .toArray();
    } catch (error) {
      console.error('Error fetching dirty recurring payments:', error);
      throw new Error('Failed to fetch dirty recurring payments');
    }
  }

  async clearDirtyFlags(recurringPaymentIds: string[]): Promise<void> {
    if (recurringPaymentIds.length === 0) {
      return;
    }

    try {
      await this.db.runWithoutDirtyTracking(async () => {
        await this.db.recurringPayments
          .where('id')
          .anyOf(recurringPaymentIds)
          .modify({ isDirty: false });
      });
    } catch (error) {
      console.error('Error clearing recurring payment dirty flags:', error);
      throw new Error('Failed to clear recurring payment dirty flags');
    }
  }
}
