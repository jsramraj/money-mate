import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ActivatedRoute, NavigationEnd, Router, UrlTree } from '@angular/router';
import { AlertController, ModalController, ToastController } from '@ionic/angular/standalone';
import { TransactionsPage } from './transactions.page';
import { AccountRepository, CategoryRepository, TransactionRepository } from '../core/database/repositories';
import { AnalyticsService, GoogleSheetService, SessionService } from '../core/services';
import { Transaction } from '../core/database/models';

describe('TransactionsPage', () => {
  let component: TransactionsPage;
  let fixture: ComponentFixture<TransactionsPage>;

  beforeEach(async () => {
    const transactionRepositoryMock = jasmine.createSpyObj<TransactionRepository>(
      'TransactionRepository',
      ['getAllTransactions', 'getTransactions$', 'getRecentTransactions$']
    );
    transactionRepositoryMock.getAllTransactions.and.resolveTo([]);
    transactionRepositoryMock.getTransactions$.and.returnValue(of([]));
    transactionRepositoryMock.getRecentTransactions$.and.returnValue(of([]));

    const accountRepositoryMock = jasmine.createSpyObj<AccountRepository>(
      'AccountRepository',
      ['getAccountsForSettings']
    );
    accountRepositoryMock.getAccountsForSettings.and.resolveTo([]);

    const categoryRepositoryMock = jasmine.createSpyObj<CategoryRepository>(
      'CategoryRepository',
      ['getCategoriesForSettings']
    );
    categoryRepositoryMock.getCategoriesForSettings.and.resolveTo([]);

    const sessionServiceMock = {
      currentSession: null,
      linkedSpreadsheet: null,
    } as SessionService;

    const analyticsServiceMock = jasmine.createSpyObj<AnalyticsService>('AnalyticsService', ['trackEvent']);
    const googleSheetServiceMock = jasmine.createSpyObj<GoogleSheetService>('GoogleSheetService', ['syncTransactions']);
    const toastControllerMock = jasmine.createSpyObj<ToastController>('ToastController', ['create']);
    const alertControllerMock = jasmine.createSpyObj<AlertController>('AlertController', ['create']);
    const modalControllerMock = jasmine.createSpyObj<ModalController>('ModalController', ['create']);
    const routerMock = jasmine.createSpyObj<Router>(
      'Router',
      ['navigate', 'createUrlTree', 'serializeUrl'],
      { events: of(new NavigationEnd(1, '/', '/')) }
    );
    routerMock.navigate.and.resolveTo(true);
    routerMock.createUrlTree.and.returnValue({} as UrlTree);
    routerMock.serializeUrl.and.returnValue('');

    await TestBed.configureTestingModule({
      imports: [TransactionsPage],
      providers: [
        { provide: TransactionRepository, useValue: transactionRepositoryMock },
        { provide: AccountRepository, useValue: accountRepositoryMock },
        { provide: CategoryRepository, useValue: categoryRepositoryMock },
        { provide: SessionService, useValue: sessionServiceMock },
        { provide: AnalyticsService, useValue: analyticsServiceMock },
        { provide: GoogleSheetService, useValue: googleSheetServiceMock },
        { provide: ToastController, useValue: toastControllerMock },
        { provide: AlertController, useValue: alertControllerMock },
        { provide: ModalController, useValue: modalControllerMock },
        { provide: Router, useValue: routerMock },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: of({}),
            snapshot: { queryParams: {} },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TransactionsPage);
    component = fixture.componentInstance;
    spyOn<any>(component, 'initializeTransactionsStream').and.resolveTo();
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('keeps transfer amounts in the normal color while income remains green', () => {
    const makeItem = (type: Transaction['type']) => ({
      id: type,
      transaction: {
        id: type,
        accountId: 'account-1',
        amount: 10,
        type,
        categoryId: '',
        description: '',
        date: new Date(),
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test',
      },
      accountName: 'Account',
      categoryName: 'Category',
      iconName: 'pricetag-outline',
      iconColor: '',
      date: new Date(),
      dateKey: '2026-11-02',
    });
    const items = [makeItem('expense'), makeItem('income'), makeItem('transfer')];
    component.loading = false;
    component.isDesktopView = false;
    component.groupedItems = [{ dateKey: '2026-11-02', dateLabel: 'Today', items }];
    fixture.detectChanges();

    const amounts = fixture.nativeElement.querySelectorAll('ion-note.amount-note');
    expect(amounts[0].classList.contains('income-transfer-amount')).toBeFalse();
    expect(amounts[1].classList.contains('income-transfer-amount')).toBeTrue();
    expect(amounts[2].classList.contains('income-transfer-amount')).toBeFalse();
  });
});
