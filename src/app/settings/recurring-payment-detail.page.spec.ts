import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular/standalone';
import { NavController } from '@ionic/angular';
import { AccountRepository, CategoryRepository, TransactionRepository } from '../core/database/repositories';
import { DatabaseService } from '../core/database/database.service';
import { TransactionPrefillService } from '../core/services/transaction-prefill.service';
import { RecurringPaymentDetailPage } from './recurring-payment-detail.page';

describe('RecurringPaymentDetailPage', () => {
  const currencyKey = 'money-mate-currency';
  let originalCurrency: string | null;

  beforeEach(async () => {
    originalCurrency = localStorage.getItem(currencyKey);
    await TestBed.configureTestingModule({
      imports: [RecurringPaymentDetailPage],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: Router, useValue: {} },
        { provide: DatabaseService, useValue: {} },
        { provide: AccountRepository, useValue: {} },
        { provide: CategoryRepository, useValue: {} },
        { provide: TransactionRepository, useValue: {} },
        { provide: NavController, useValue: {} },
        { provide: ModalController, useValue: {} },
        { provide: ToastController, useValue: {} },
        { provide: TransactionPrefillService, useValue: {} },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    if (originalCurrency === null) {
      localStorage.removeItem(currencyKey);
    } else {
      localStorage.setItem(currencyKey, originalCurrency);
    }
  });

  it('uses the saved currency preference', () => {
    localStorage.setItem(currencyKey, 'INR');
    const fixture = TestBed.createComponent(RecurringPaymentDetailPage);

    fixture.componentInstance.ngOnInit();

    expect(fixture.componentInstance.selectedCurrency).toBe('INR');
  });
});
