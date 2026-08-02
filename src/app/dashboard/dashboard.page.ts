import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonMenuButton,
  IonButtons,
  IonButton,
  IonIcon,
  IonText
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { appsOutline } from 'ionicons/icons';
import { DashboardLayoutService } from './dashboard-layout.service';
import { DashboardDateRangeService, DashboardDateRange } from './services/dashboard-date-range.service';
import { AnalyticsService, RecurringStartupService } from '../core/services';
import {
  DASHBOARD_WIDGET_BY_ID,
  DashboardWidgetDefinition,
  DashboardWidgetId
} from './dashboard-widget-registry';
import { DateRangeFilterComponent } from '../shared/date-range-filter/date-range-filter.component';
import { AlertController } from '@ionic/angular';
import { AccountRepository } from '../core/database/repositories/account.repository';
import { SessionService } from '../core/services/session.service';
import { ToastController } from '@ionic/angular';

@Component({
  selector: 'app-dashboard',
  templateUrl: 'dashboard.page.html',
  styleUrls: ['dashboard.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonMenuButton,
    IonButtons,
    IonButton,
    IonIcon,
    IonText,
    DateRangeFilterComponent
  ],
})
export class DashboardPage implements OnInit, OnDestroy {
  visibleWidgets: DashboardWidgetDefinition[] = [];
  selectedDateRange: DashboardDateRange = {
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    endDate: new Date(),
    period: 'monthly',
  };
  private readonly layoutService = inject(DashboardLayoutService);
  private readonly router = inject(Router);
  private readonly dateRangeService = inject(DashboardDateRangeService);
  private readonly analyticsService = inject(AnalyticsService);
  private routerSubscription?: Subscription;
  private readonly accountRepository = inject(AccountRepository);
  private readonly alertController = inject(AlertController);
  private readonly sessionService = inject(SessionService);
  private readonly toastController = inject(ToastController);
  private readonly recurringStartupService = inject(RecurringStartupService);
  private checkingRecurringStartup = false;

  constructor() {
    addIcons({ appsOutline });
  }

  ngOnInit(): void {
    this.refreshVisibleWidgets();
    // Set initial date range in the service
    this.dateRangeService.setDateRange(this.selectedDateRange);

    this.routerSubscription = this.router.events.subscribe((event) => {
      if (event instanceof NavigationEnd && this.router.url.startsWith('/tabs/dashboard')) {
        this.refreshVisibleWidgets();
      }
    });
  }

  ngOnDestroy(): void {
    this.routerSubscription?.unsubscribe();
  }

  async ionViewWillEnter(): Promise<void> {
    this.refreshVisibleWidgets();
    await this.checkOnboardingAccounts();
    await this.checkRecurringStartupPayments();
  }

  private async checkRecurringStartupPayments(): Promise<void> {
    if (this.checkingRecurringStartup) {
      return;
    }

    if (this.recurringStartupService.hasUserActionOnDate()) {
      return;
    }

    try {
      this.checkingRecurringStartup = true;
      const lastActionAt = this.recurringStartupService.getLastUserActionAt();
      const missingPayments = await this.recurringStartupService.getMissingMonthlyRecurringPayments(new Date(), lastActionAt);
      if (missingPayments.length === 0) {
        return;
      }

      await this.router.navigate(['/startup/recurring-review']);
    } catch (error) {
      console.error('Error checking startup recurring payments:', error);
    } finally {
      this.checkingRecurringStartup = false;
    }
  }

  private async checkOnboardingAccounts(): Promise<void> {
    try {
      if (this.sessionService.isOnboardingAccountsCompleted()) {
        return;
      }

      const accounts = await this.accountRepository.getAccounts();
      if (accounts.length === 1) {
        const alert = await this.alertController.create({
          header: 'Do you want to add your accounts now?',
          message: 'You can add multiple accounts and manage them separately. You can add bank accounts, credit cards, cash wallets...',
          buttons: [
            {
              text: 'Later',
              role: 'cancel',
              handler: async () => {
                this.sessionService.markOnboardingAccountsCompleted();
                this.analyticsService.trackEvent('onboarding_accounts_later');
                const toast = await this.toastController.create({
                  message: 'No worries — you can always add accounts later in Settings 🙂.',
                  duration: 3000,
                  position: 'bottom',
                });
                await toast.present();
              },
            },
            {
              text: 'Add Now',
              handler: () => {
                this.sessionService.markOnboardingAccountsCompleted();
                this.router.navigate(['/settings/accounts']);
                this.analyticsService.trackEvent('onboarding_accounts_add_now');
              },
            },
          ],
        });
        await alert.present();
      }
    } catch (error) {
      console.error('Error checking accounts for onboarding:', error);
    }
  }

  onDateRangeChange(range: DashboardDateRange) {
    this.selectedDateRange = range;
    this.dateRangeService.setDateRange(range);
    this.analyticsService.trackEvent('dashboard_date_range_changed', {
      period: range.period,
    });
  }

  trackByWidgetId(_: number, widget: DashboardWidgetDefinition): DashboardWidgetId {
    return widget.id;
  }

  getWidgetGridClass(widgetId: DashboardWidgetId): string {
    switch (widgetId) {
      case 'recent-transactions':
      case 'expense-category-delta':
      case 'daily-expenses':
      case 'expense-comparison':
        return 'span-2';
      case 'account-balance-single':
      case 'top-summary':
        return 'span-1';
      default:
        return '';
    }
  }

  async openCustomizeDashboard(): Promise<void> {
    this.analyticsService.trackEvent('dashboard_customize_opened', {
      visible_widget_count: this.visibleWidgets.length,
    });
    await this.router.navigate(['/dashboard/customize']);
  }

  private refreshVisibleWidgets(): void {
    const widgetOrder = this.layoutService
      .getLayout()
      .filter((item) => item.visible)
      .sort((a, b) => a.order - b.order)
      .map((item) => item.id);

    this.visibleWidgets = widgetOrder
      .map((id) => this.findDefinition(id))
      .filter((widget): widget is DashboardWidgetDefinition => !!widget);
  }

  private findDefinition(widgetId: DashboardWidgetId): DashboardWidgetDefinition | undefined {
    return DASHBOARD_WIDGET_BY_ID.get(widgetId);
  }
}
