import { Component, inject } from '@angular/core';
import { ThemeService, Theme } from '../core/services/theme.service';
import { AnalyticsService } from '../core/services';
import { CommonModule } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonButton,
  IonIcon,
  IonList,
  IonItem,
  IonLabel,
  IonToggle,
  IonReorder,
  IonReorderGroup,
  IonCard,
  IonCardContent,
  ItemReorderEventDetail
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { saveOutline } from 'ionicons/icons';
import { Router } from '@angular/router';
import {
  DashboardWidgetLayout
} from './dashboard-layout';
import {
  DASHBOARD_WIDGET_DEFINITIONS,
  DashboardWidgetId
} from './dashboard-widget-registry';
import { DashboardLayoutService } from './dashboard-layout.service';

interface DashboardWidgetDraft {
  id: DashboardWidgetId;
  title: string;
  subtitle: string;
  visible: boolean;
  order: number;
}

@Component({
  selector: 'app-dashboard-customize',
  templateUrl: './dashboard-customize.page.html',
  styleUrls: ['./dashboard-customize.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonBackButton,
    IonButton,
    IonIcon,
    IonList,
    IonItem,
    IonLabel,
    IonToggle,
    IonReorder,
    IonReorderGroup,
    // ...existing code...
  ]
})
export class DashboardCustomizePage {
  widgets: DashboardWidgetDraft[] = [];
  private readonly layoutService = inject(DashboardLayoutService);
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  private readonly analyticsService = inject(AnalyticsService);

  theme: Theme = 'light';


  constructor() {
    addIcons({ saveOutline });
    this.themeService.theme$.subscribe((theme: Theme) => {
      this.theme = theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
    });
  }
  getWidgetIconPath(widgetId: string): string {
    const themeFolder = this.theme === 'dark' ? 'dark-theme' : 'light-theme';
    const supportedWidgetIds = new Set([
      'top-summary',
      'daily-expenses',
      'expense-breakdown',
      'expense-comparison',
      'recent-transactions',
      'budget-vs-actual',
      'upcoming-payments',
    ]);

    const resolvedWidgetId = supportedWidgetIds.has(widgetId) ? widgetId : 'top-summary';
    return `assets/widget-icons/${themeFolder}/${resolvedWidgetId}.png`;
  }

  ionViewWillEnter(): void {
    this.loadDraft();
  }

  trackByWidgetId(_: number, widget: DashboardWidgetDraft): DashboardWidgetId {
    return widget.id;
  }

  onToggleVisibility(widgetId: DashboardWidgetId, checked: boolean): void {
    this.widgets = this.widgets.map((widget) => {
      if (widget.id !== widgetId) {
        return widget;
      }

      return {
        ...widget,
        visible: checked
      };
    });
  }

  handleReorder(event: CustomEvent<ItemReorderEventDetail>): void {
    const from = event.detail.from;
    const to = event.detail.to;
    const reordered = [...this.widgets];
    const [movedWidget] = reordered.splice(from, 1);

    reordered.splice(to, 0, movedWidget);
    event.detail.complete();

    this.widgets = reordered.map((widget, index) => ({
      ...widget,
      order: index + 1
    }));
  }

  resetToDefault(): void {
    this.loadDraft(this.layoutService.getDefaultLayout());
  }

  async save(): Promise<void> {
    const layoutToSave: DashboardWidgetLayout[] = this.widgets.map((widget, index) => ({
      id: widget.id,
      visible: widget.visible,
      order: index + 1
    }));

    const savedLayout = this.layoutService.saveLayout(layoutToSave);
    const enabledWidgetIds = savedLayout
      .filter((widget) => widget.visible)
      .sort((a, b) => a.order - b.order)
      .map((widget) => widget.id);

    this.analyticsService.trackEvent('dashboard_widgets_updated', {
      enabled_widget_count: enabledWidgetIds.length,
      enabled_widget_ids: enabledWidgetIds.join('|'),
    });

    await this.router.navigate(['/tabs/dashboard'], { replaceUrl: true });
  }

  private loadDraft(layout?: DashboardWidgetLayout[]): void {
    const activeLayout = layout ?? this.layoutService.getLayout();

    this.widgets = activeLayout
      .sort((a, b) => a.order - b.order)
      .map((item, index) => {
        const definition = DASHBOARD_WIDGET_DEFINITIONS.find((widget) => widget.id === item.id);
        return {
          id: item.id,
          title: definition?.title ?? item.id,
          subtitle: definition?.subtitle ?? '',
          visible: item.visible,
          order: index + 1
        };
      });
  }
}
