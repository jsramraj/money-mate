import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Transaction } from '../database/models';

@Injectable({
  providedIn: 'root'
})
export class TransactionPrefillService {
  private prefillDataSubject = new BehaviorSubject<Partial<Transaction> | null>(null);

  setTransactionPrefillData(data: Partial<Transaction>): void {
    this.prefillDataSubject.next(data);
  }

  getAndClearPrefillData(): Partial<Transaction> | null {
    const data = this.prefillDataSubject.value;
    this.prefillDataSubject.next(null); // Auto-clear after retrieval
    return data;
  }
}
