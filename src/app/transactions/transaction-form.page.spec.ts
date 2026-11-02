import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, ToastController } from '@ionic/angular';
import { ModalController, NavController } from '@ionic/angular/standalone';
import { of } from 'rxjs';
import { DatabaseService } from '../core/database/database.service';
import { AccountRepository, CategoryRepository, TransactionRepository } from '../core/database/repositories';
import { AnalyticsService } from '../core/services';
import { AutoCategorizationService } from '../core/services/auto-categorization.service';
import { TransactionPrefillService } from '../core/services/transaction-prefill.service';
import { TransactionFormPage } from './transaction-form.page';

describe('TransactionFormPage', () => {
  let component: TransactionFormPage;
  let fixture: ComponentFixture<TransactionFormPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransactionFormPage],
      providers: [
        { provide: AccountRepository, useValue: { getAccounts: async () => [] } },
        { provide: CategoryRepository, useValue: { getCategories: async () => [], categories$: of([]) } },
        { provide: TransactionRepository, useValue: {} },
        { provide: Router, useValue: {} },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => null } } } },
        { provide: AlertController, useValue: {} },
        { provide: NavController, useValue: {} },
        { provide: AutoCategorizationService, useValue: { initialize: async () => undefined } },
        { provide: AnalyticsService, useValue: {} },
        { provide: ToastController, useValue: {} },
        { provide: ModalController, useValue: {} },
        { provide: DatabaseService, useValue: {} },
        { provide: TransactionPrefillService, useValue: { getAndClearPrefillData: () => null } },
      ]
    }).compileComponents();
    fixture = TestBed.createComponent(TransactionFormPage);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('uses a native date input when presented in the desktop modal', async () => {
    component.presentedAsModal = true;
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('ion-input[type="date"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('ion-datetime-button')).toBeNull();
    expect(fixture.nativeElement.querySelector('ion-modal')).toBeNull();
  });

  it('keeps the Ionic date picker on the mobile route', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('ion-input[type="date"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('ion-datetime-button')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('ion-modal')).toBeTruthy();
  });
});
