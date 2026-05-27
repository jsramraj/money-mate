import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';
import { NavController } from '@ionic/angular';
import { RecurringStartupReviewItem, RecurringStartupService } from '../core/services';

interface SelectableRecurringStartupReviewItem extends RecurringStartupReviewItem {
  selected: boolean;
}

@Component({
  selector: 'app-recurring-startup-review',
  standalone: true,
  templateUrl: './recurring-startup-review.page.html',
  styleUrls: ['./recurring-startup-review.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonCheckbox,
    IonNote,
    IonSpinner,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringStartupReviewPage implements OnInit {
  loading = false;
  saving = false;
  error: string | null = null;
  selectedCurrency = 'USD';
  items: SelectableRecurringStartupReviewItem[] = [];
  private actionRecorded = false;

  constructor(
    private readonly recurringStartupService: RecurringStartupService,
    private readonly navController: NavController,
    private readonly toastController: ToastController,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadCurrency();
    void this.loadItems();
  }

  ionViewWillLeave(): void {
    if (this.actionRecorded) {
      return;
    }

    this.recordUserAction();
  }

  get hasSelection(): boolean {
    return this.items.some((item) => item.selected);
  }

  trackByRecurringId(_: number, item: SelectableRecurringStartupReviewItem): string {
    return item.recurringPaymentId;
  }

  onSelectionChange(item: SelectableRecurringStartupReviewItem, checked: boolean): void {
    item.selected = checked;
  }

  selectAll(): void {
    this.items = this.items.map((item) => ({ ...item, selected: true }));
  }

  clearSelection(): void {
    this.items = this.items.map((item) => ({ ...item, selected: false }));
  }

  async confirmSelected(): Promise<void> {
    if (!this.hasSelection || this.saving) {
      return;
    }

    try {
      this.saving = true;
      this.error = null;
      this.cdr.markForCheck();

      const selectedIds = this.items
        .filter((item) => item.selected)
        .map((item) => item.recurringPaymentId);

      const result = await this.recurringStartupService.createTransactionsForSelection(selectedIds);
      this.recordUserAction();
      await this.presentToast(`Created ${result.created} recurring transaction(s).`, 'success');
      await this.navController.navigateBack('/tabs/dashboard');
    } catch (error) {
      console.error('Failed to create startup recurring transactions:', error);
      this.error = 'Failed to create recurring transactions.';
      await this.presentToast('Failed to create recurring transactions.', 'danger');
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  async skipForMonth(): Promise<void> {
    this.recordUserAction();
    await this.navController.navigateBack('/tabs/dashboard');
  }

  private async loadItems(): Promise<void> {
    try {
      this.loading = true;
      this.error = null;
      this.cdr.markForCheck();

      const pendingItems = await this.recurringStartupService.getMissingMonthlyRecurringPayments();
      this.items = pendingItems.map((item) => ({ ...item, selected: true }));
    } catch (error) {
      console.error('Failed to load recurring startup review items:', error);
      this.error = 'Failed to load recurring payments.';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private loadCurrency(): void {
    this.selectedCurrency = localStorage.getItem('money-mate-currency') || 'USD';
  }

  private async presentToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      position: 'bottom',
      color,
    });

    await toast.present();
  }

  private recordUserAction(): void {
    this.actionRecorded = true;
    this.recurringStartupService.markUserActionTimestamp();
  }
}