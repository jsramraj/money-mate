import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { 
  IonApp, 
  IonRouterOutlet
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { 
  cloudUploadOutline,
  statsChart, 
  list, 
  settings, 
  card, 
  menu 
} from 'ionicons/icons';
import { filter } from 'rxjs';
import { MenuComponent } from './core/components';
import { AnalyticsService, SessionService } from './core/services';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [
    IonApp, 
    IonRouterOutlet,
    MenuComponent
  ],
})
export class AppComponent {
  private readonly analyticsService = inject(AnalyticsService);
  private readonly router = inject(Router);
  private readonly sessionService = inject(SessionService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    addIcons({ statsChart, list, settings, card, menu, cloudUploadOutline });
    this.registerAnalyticsSubscriptions();
    void this.initializeAnalytics();
  }

  private registerAnalyticsSubscriptions(): void {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        const pagePath = this.normalizeAnalyticsPath(event.urlAfterRedirects);
        if (!pagePath) {
          return;
        }

        this.analyticsService.trackPageView(this.getPageTitle(pagePath), pagePath);
        this.syncAnalyticsUserProperties();
      });

    this.sessionService.session$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.syncAnalyticsUserProperties();
      });
  }

  private async initializeAnalytics(): Promise<void> {
    try {
      await this.analyticsService.initialize();
      this.syncAnalyticsUserProperties();

      const pagePath = this.normalizeAnalyticsPath(this.router.url);
      if (pagePath) {
        this.analyticsService.trackPageView(this.getPageTitle(pagePath), pagePath);
      }
    } catch {
      // Analytics should not block app startup.
    }
  }

  private syncAnalyticsUserProperties(): void {
    const session = this.sessionService.currentSession;
    this.analyticsService.setUserProperties({
      auth_mode: session?.mode ?? 'none',
      has_linked_sheet: this.sessionService.hasLinkedSpreadsheet(),
      selected_currency: localStorage.getItem('money-mate-currency') || 'USD',
    });
  }

  private normalizeAnalyticsPath(url: string): string | null {
    const [pathWithoutQuery] = url.split('?');

    if (!pathWithoutQuery || pathWithoutQuery.startsWith('/auth/callback')) {
      return null;
    }

    if (pathWithoutQuery.startsWith('/tabs/transactions/form/')) {
      return '/tabs/transactions/form/:id';
    }

    if (pathWithoutQuery.startsWith('/settings/recurring-payments/')) {
      return '/settings/recurring-payments/:id';
    }

    return pathWithoutQuery;
  }

  private getPageTitle(pagePath: string): string {
    const pageTitles: Record<string, string> = {
      '/login': 'Login',
      '/onboarding': 'Google Sheet Onboarding',
      '/tabs/dashboard': 'Dashboard',
      '/tabs/transactions': 'Transactions',
      '/tabs/transactions/form': 'New Transaction',
      '/tabs/transactions/form/:id': 'Edit Transaction',
      '/settings': 'Settings',
      '/settings/linked-sheet': 'Linked Spreadsheet',
      '/settings/recurring-payments': 'Recurring Payments',
      '/settings/recurring-payments/:id': 'Edit Recurring Payment',
      '/settings/about': 'About',
      '/settings/categories': 'Categories',
      '/settings/accounts': 'Accounts',
      '/imports/transactions/csv': 'Import CSV',
      '/imports/transactions/quick-add': 'Quick Add',
      '/dashboard/customize': 'Customize Dashboard',
    };

    return pageTitles[pagePath] ?? 'Money Mate';
  }
}
