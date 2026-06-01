import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonHeader, 
  IonToolbar, 
  IonTitle, 
  IonContent, 
  IonMenuButton,
  IonList,
  IonItem,
  IonItemGroup,
  IonItemDivider,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonIcon,
  IonAvatar,
  IonButton
} from '@ionic/angular/standalone';
import { Subject, takeUntil } from 'rxjs';
import { ThemeService, Theme, SessionService, AuthMode } from '../core/services';
import { addIcons } from 'ionicons';
import { chevronForwardOutline, logOutOutline, personCircleOutline, repeatOutline } from 'ionicons/icons';
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

  constructor(
    private themeService: ThemeService,
    private sessionService: SessionService,
    private router: Router,
    private http: HttpClient,
  ) {
    addIcons({ chevronForwardOutline, logOutOutline, personCircleOutline, repeatOutline });
  }

  ngOnInit() {
    this.selectedCurrency = localStorage.getItem(this.CURRENCY_KEY) || 'USD';
    this.loadCurrencies();

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

  async openLogin(): Promise<void> {
    await this.router.navigate(['/login']);
  }

  async disconnectGoogle(): Promise<void> {
    await this.sessionService.signOutGoogle();
  }

  async logout(): Promise<void> {
    await this.disconnectGoogle();
  }
}