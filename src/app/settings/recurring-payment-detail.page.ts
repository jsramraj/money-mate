import { ChangeDetectionStrategy, ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonDatetime,
  IonDatetimeButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';
import { NavController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { calendarOutline, saveOutline } from 'ionicons/icons';
import { RecurringPayment } from '../core/database/models';
import { DatabaseService } from '../core/database/database.service';
import { AccountRepository, CategoryRepository } from '../core/database/repositories';

@Component({
  selector: 'app-recurring-payment-detail',
  standalone: true,
  templateUrl: './recurring-payment-detail.page.html',
  styleUrls: ['./recurring-payment-detail.page.scss'],
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
    IonInput,
    IonNote,
    IonSelect,
    IonSelectOption,
    IonDatetime,
    IonDatetimeButton,
    IonModal,
    IonIcon,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecurringPaymentDetailPage {
  recurringPayment: RecurringPayment | null = null;
  loading = true;
  saving = false;
  error: string | null = null;
  descriptionValue = '';
  amountValue: number | null = null;
  dateValue = '';
  statusValue: RecurringPayment['status'] = 'active';
  private accountNames = new Map<string, string>();
  private categoryNames = new Map<string, string>();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly db: DatabaseService,
    private readonly accountRepository: AccountRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly navController: NavController,
    private readonly toastController: ToastController,
    private readonly cdr: ChangeDetectorRef,
  ) {
    addIcons({ calendarOutline, saveOutline });
  }

  ngOnInit(): void {
    void this.loadRecurringPayment();
  }

  ionViewWillEnter(): void {
    void this.loadRecurringPayment();
  }

  get accountName(): string {
    if (!this.recurringPayment) {
      return '-';
    }

    return this.accountNames.get(this.recurringPayment.accountId) ?? 'Unknown account';
  }

  get categoryName(): string {
    if (!this.recurringPayment) {
      return '-';
    }

    if (this.recurringPayment.type === 'transfer') {
      return 'Transfer';
    }

    return this.categoryNames.get(this.recurringPayment.categoryId) ?? 'Uncategorized';
  }

  get transferToAccountName(): string {
    if (!this.recurringPayment?.transferToAccountId) {
      return '-';
    }

    return this.accountNames.get(this.recurringPayment.transferToAccountId) ?? 'Unknown account';
  }

  get displayStatus(): string {
    switch (this.statusValue) {
      case 'paused':
        return 'Paused';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Active';
    }
  }

  get statusColor(): 'success' | 'warning' | 'danger' {
    switch (this.statusValue) {
      case 'paused':
        return 'warning';
      case 'cancelled':
        return 'danger';
      default:
        return 'success';
    }
  }

  get canSave(): boolean {
    return !!this.recurringPayment
      && !this.saving
      && !!this.dateValue
      && !!this.descriptionValue.trim()
      && this.amountValue !== null
      && Number(this.amountValue) > 0
      && !!this.statusValue;
  }

  onDateChange(event: CustomEvent<{ value?: string | string[] | null }>): void {
    const value = event.detail.value;
    if (typeof value === 'string' && value) {
      this.dateValue = value.slice(0, 10);
    }
  }

  async save(): Promise<void> {
    if (!this.recurringPayment || !this.canSave) {
      return;
    }

    try {
      this.saving = true;
      const nextStatus = this.statusValue;
      const normalizedAmount = this.toStoredAmount(Number(this.amountValue), this.recurringPayment.type);

      await this.db.recurringPayments.update(this.recurringPayment.id, {
        description: this.descriptionValue.trim(),
        amount: normalizedAmount,
        date: new Date(this.dateValue),
        status: nextStatus,
      });

      await this.presentToast('Recurring payment updated', 'success');

      await this.navController.navigateBack('/settings/recurring-payments');
    } catch (error) {
      console.error('Failed to update recurring payment:', error);
      await this.presentToast('Failed to update recurring payment', 'danger');
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  private async loadRecurringPayment(): Promise<void> {
    const recurringPaymentId = this.route.snapshot.paramMap.get('id');
    if (!recurringPaymentId) {
      this.error = 'Recurring payment not found';
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    try {
      this.loading = true;
      this.error = null;

      const [recurringPayment, accounts, categories] = await Promise.all([
        this.db.recurringPayments.get(recurringPaymentId),
        this.accountRepository.getAccountsForSettings(),
        this.categoryRepository.getCategoriesForSettings(),
      ]);

      if (!recurringPayment || recurringPayment.isDeleted) {
        this.error = 'Recurring payment not found';
        this.recurringPayment = null;
        return;
      }

      this.accountNames = new Map(accounts.map((account) => [account.id, account.name]));
      this.categoryNames = new Map(categories.map((category) => [category.id, category.name]));
      this.recurringPayment = recurringPayment;
      this.descriptionValue = recurringPayment.description || '';
      this.amountValue = Math.abs(recurringPayment.amount);
      this.dateValue = this.toDateValue(recurringPayment.date);
      this.statusValue = recurringPayment.status;
    } catch (error) {
      console.error('Failed to load recurring payment:', error);
      this.error = 'Failed to load recurring payment';
      this.recurringPayment = null;
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private toDateValue(dateInput: Date | string): string {
    const date = new Date(dateInput);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toStoredAmount(amount: number, type: RecurringPayment['type']): number {
    if (type === 'expense') {
      return -Math.abs(amount);
    }

    return Math.abs(amount);
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
