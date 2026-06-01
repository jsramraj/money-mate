import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonHeader, 
  IonToolbar, 
  IonTitle, 
  IonContent, 
  IonMenuButton,
  IonButtons,
  IonList,
  IonItem,
  IonItemGroup,
  IonItemDivider,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonIcon,
  IonAvatar,
  IonButton,
  IonBadge,
  IonSpinner,
  ToastController
} from '@ionic/angular/standalone';
import { Subject, takeUntil } from 'rxjs';
import { ThemeService, Theme, SessionService, AuthMode, GoogleSheetService } from '../core/services';
import { AccountRepository, BudgetRepository, CategoryRepository } from '../core/database/repositories';
import { DatabaseService } from '../core/database/database.service';
import { addIcons } from 'ionicons';
import { chevronForwardOutline, logOutOutline, personCircleOutline, repeatOutline, syncOutline } from 'ionicons/icons';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

interface CurrencyItem {
  code: string;
  name: string;
  symbol?: string;
}

@Component({
  selector: 'app-settings',
  templateUrl: 'settings.page.html',
  styleUrls: ['settings.page.scss'],
  imports: [
    CommonModule,
    IonHeader, 
    IonToolbar, 
    IonTitle, 
    IonContent, 
    IonMenuButton,
    IonButtons,
    IonList,
    IonItem,
    IonItemGroup,
    IonItemDivider,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonIcon,
    IonAvatar,
    IonButton,
    IonBadge,
    IonSpinner,
    RouterModule
  ]
})
export class SettingsPage implements OnInit, OnDestroy {
  private readonly CURRENCY_KEY = 'money-mate-currency';
  currentTheme: Theme = 'auto';
  selectedCurrency = 'USD';
  currencies: CurrencyItem[] = [];
  authMode: AuthMode | 'none' = 'none';
  userName = 'Guest User';
  userEmail = 'Offline Mode';
  userPicture = '';
  accountSubtitle = 'Connect Google to enable sync and backup';
  private destroy$ = new Subject<void>();
  dirtyLookupCount = 0;
  syncingSettings = false;
  settingsSyncError: string | null = null;

  constructor(
    private themeService: ThemeService,
    private sessionService: SessionService,
    private readonly googleSheetService: GoogleSheetService,
    private readonly accountRepository: AccountRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly budgetRepository: BudgetRepository,
    private readonly db: DatabaseService,
    private readonly toastController: ToastController,
    private router: Router,
    private http: HttpClient,
  ) {
    addIcons({ chevronForwardOutline, logOutOutline, personCircleOutline, repeatOutline, syncOutline });
  }

  ngOnInit() {
    this.selectedCurrency = localStorage.getItem(this.CURRENCY_KEY) || 'USD';
    this.loadCurrencies();
    void this.refreshDirtyLookupCount();

    // this.themeService.theme$
    //   .pipe(takeUntil(this.destroy$))
    //   .subscribe(theme => {
    //     this.currentTheme = theme;
    //   });

    this.sessionService.session$
      .pipe(takeUntil(this.destroy$))
      .subscribe((session) => {
        this.authMode = session?.mode ?? 'none';
        this.userName = session?.name || 'Guest User';
        this.userEmail = session?.email || 'Offline Mode';
        this.userPicture = session?.picture || '';
        this.accountSubtitle = this.authMode === 'google'
          ? 'Google Account'
          : 'Connect Google to enable sync and backup';
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onThemeChange(event: any) {
    const theme = event.detail.value as Theme;
    this.themeService.setTheme(theme);
  }

  onCurrencyChange(event: any): void {
    console.log('Currency changed:', event.detail.value);
    this.selectedCurrency = event.detail.value || 'USD';
    localStorage.setItem(this.CURRENCY_KEY, this.selectedCurrency);
  }

  loadCurrencies(): void {
    this.http.get<CurrencyItem[]>('assets/assets/countries.json')
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.currencies = data ?? [];

        if (!this.currencies.some((currency) => currency.code === this.selectedCurrency)) {
          this.selectedCurrency = 'USD';
          localStorage.setItem(this.CURRENCY_KEY, this.selectedCurrency);
        }
      });
  }

  async openCategoryManagement(): Promise<void> {
    await this.router.navigate(['/settings/categories']);
  }

  async openAccountManagement(): Promise<void> {
    await this.router.navigate(['/settings/accounts']);
  }

  async openBudgetManagement(): Promise<void> {
    await this.router.navigate(['/settings/budgets']);
  }

  async openRecurringPaymentsManagement(): Promise<void> {
    await this.router.navigate(['/settings/recurring-payments']);
  }

  async openLinkedSheetSettings(): Promise<void> {
    await this.router.navigate(['/settings/linked-sheet']);
  }

  get canSync(): boolean {
    return !!this.sessionService.currentSession?.accessToken && !!this.sessionService.linkedSpreadsheet?.id;
  }

  get hasDirtyLookupData(): boolean {
    return this.dirtyLookupCount > 0;
  }

  async ionViewWillEnter(): Promise<void> {
    await this.refreshDirtyLookupCount();
  }

  async syncLookupData(): Promise<void> {
    if (this.syncingSettings || !this.canSync) {
      return;
    }

    try {
      this.syncingSettings = true;
      this.settingsSyncError = null;

      await this.googleSheetService.migrateSheetSchemaIfNeeded();
      await this.googleSheetService.syncAccounts();
      await this.googleSheetService.syncCategories();
      await this.googleSheetService.syncBudgets();
      await this.googleSheetService.syncRecurringPayments();
      await this.refreshDirtyLookupCount();

      await this.presentToast('Settings data synced successfully', 'success');
    } catch (error) {
      console.error('Error syncing settings data:', error);
      this.settingsSyncError = 'Failed to sync settings data';
      await this.presentToast('Failed to sync settings data', 'danger');
    } finally {
      this.syncingSettings = false;
    }
  }

  async openLogin(): Promise<void> {
    await this.router.navigate(['/login']);
  }

  private async refreshDirtyLookupCount(): Promise<void> {
    try {
      const [dirtyAccounts, dirtyCategories, dirtyBudgets, dirtyRecurringCount] = await Promise.all([
        this.accountRepository.getDirtyAccounts(),
        this.categoryRepository.getDirtyCategories(),
        this.budgetRepository.getDirtyBudgets(),
        this.db.recurringPayments.filter((rp) => !!rp.isDirty).count(),
      ]);

      console.log('Dirty lookup counts:', {
        accounts: dirtyAccounts.length,
        categories: dirtyCategories.length,
        budgets: dirtyBudgets.length,
        recurringPayments: dirtyRecurringCount,
      });

      this.dirtyLookupCount = dirtyAccounts.length + dirtyCategories.length + dirtyBudgets.length + dirtyRecurringCount;
    } catch (error) {
      console.error('Error refreshing dirty lookup count:', error);
      this.dirtyLookupCount = 0;
    }
  }

  async disconnectGoogle(): Promise<void> {
    await this.sessionService.signOutGoogle();
  }

  async logout(): Promise<void> {
    await this.disconnectGoogle();
  }

  private async presentToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'bottom',
    });
    await toast.present();
  }
}