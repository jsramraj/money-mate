

import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonDatetime,
  IonDatetimeButton,
  IonModal,
  IonSegment,
  IonSegmentButton,
  IonChip,
  IonIcon,
  IonNote,
  IonBackButton,
  IonCheckbox,
  ModalController,
} from '@ionic/angular/standalone';
import { AlertController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDownOutline, chevronUpOutline, closeCircle, trashOutline, saveOutline } from 'ionicons/icons';
import { TransactionPrefillService } from '../core/services/transaction-prefill.service';
import { Account, Category, GUEST_USER_NAME, RecurrenceSelection, RecurringPayment, Transaction, TransactionType } from '../core/database/models';
import { AccountRepository, CategoryRepository, TransactionRepository, CreateTransactionInput, UpdateTransactionInput } from '../core/database/repositories';
import { AnalyticsService } from '../core/services';
import { AutoCategorizationService } from '../core/services/auto-categorization.service';
import { NavController } from '@ionic/angular';
import { CategoryGridModalComponent } from '../shared/category-grid-selector/category-grid-modal.component';
import { RecurringPaymentSummaryComponent } from '../shared/recurring-payment-summary/recurring-payment-summary.component';
import { TagInputComponent } from '../shared/tag-input/tag-input.component';
import { DatabaseService } from '../core/database/database.service';

@Component({
  selector: 'app-transaction-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonList,
    IonItem,
    IonLabel,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonDatetime,
    IonDatetimeButton,
    IonModal,
    IonSegment,
    IonSegmentButton,
    IonChip,
    IonIcon,
    IonNote,
    IonBackButton,
    IonCheckbox,
    TagInputComponent,
    RecurringPaymentSummaryComponent,
  ],
  templateUrl: './transaction-form.page.html',
  styleUrls: ['./transaction-form.page.scss']
})
export class TransactionFormPage implements OnInit, OnDestroy {

  addMore = false;
  private readonly lastUsedAccountStorageKey = 'money-mate-last-used-account-id';
  transactionToEdit?: Transaction;
  accounts: Account[] = [];
  categories: Category[] = [];
  saving = false;
  showMoreOptions = false;
  @ViewChild('amountInput') private amountInput?: IonInput;

  private categoryManuallySelected = false;
  private categoriesSubscription?: Subscription;
  descriptionSuggestions: string[] = [];
  filteredSuggestions: string[] = [];
  tagSuggestions: string[] = [];
  recurringPaymentDetails: RecurringPayment | null = null;
  private prefillRecurringPaymentId?: string;

  get isEditMode(): boolean {
    return !!this.transactionToEdit;
  }

  form: {
    type: TransactionType;
    recurrenceSelection: RecurrenceSelection;
    amount: number | null;
    accountId: string;
    transferToAccountId: string;
    categoryId: string;
    date: string;
    description: string;
    notes: string;
    tags: string[];
    recurringPaymentId?: string;
  } = {
    type: 'expense',
    recurrenceSelection: 'never',
    amount: null,
    accountId: '',
    transferToAccountId: '',
    categoryId: '',
    date: this.todayString(),
    description: '',
    notes: '',
    tags: [],
    recurringPaymentId: undefined,
  };

  constructor(
    private accountRepository: AccountRepository,
    private categoryRepository: CategoryRepository,
    private transactionRepository: TransactionRepository,
    private router: Router,
    private route: ActivatedRoute,
    private alertController: AlertController,
    private navController: NavController,
    private autoCategorizationService: AutoCategorizationService,
    private analyticsService: AnalyticsService,
    private toastController: ToastController,
    private modalController: ModalController,
    private db: DatabaseService,
    private prefillService: TransactionPrefillService,
  ) {
    addIcons({ closeCircle, chevronDownOutline, chevronUpOutline, trashOutline, saveOutline });
  }


  async ngOnInit(): Promise<void> {
    const [accounts] = await Promise.all([
      this.accountRepository.getAccounts(),
      this.categoryRepository.getCategories()
    ]);
    this.accounts = accounts;

    this.categoriesSubscription = this.categoryRepository.categories$.subscribe((categories) => {
      this.categories = categories;

      if (this.form.categoryId && !categories.some((category) => category.id === this.form.categoryId)) {
        this.form.categoryId = '';
      }
    });

    // Build description->category mapping from past year transactions
    await this.autoCategorizationService.initialize();

    // Check for transaction id in route params (edit mode)
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const tx = await this.transactionRepository.getTransactionById(id);
      if (tx) {
        this.transactionToEdit = tx;
        await this.populateFormFromTransaction(tx);
        return;
      }
    }

    // Not editing an existing tx: check for prefill data (from recurring payment)
    const prefillData = this.prefillService.getAndClearPrefillData();
    if (prefillData) {
      if (prefillData.type) this.form.type = prefillData.type;
      if (prefillData.amount !== undefined)
        this.form.amount = prefillData.amount;
      if (prefillData.accountId) this.form.accountId = prefillData.accountId;
      if (prefillData.transferToAccountId)
        this.form.transferToAccountId = prefillData.transferToAccountId;
      if (prefillData.categoryId) this.form.categoryId = prefillData.categoryId;
      if (prefillData.description)
        this.form.description = prefillData.description;
      if (prefillData.notes) this.form.notes = prefillData.notes;
      if (prefillData.tags) this.form.tags = [...prefillData.tags];
      if (prefillData.date)
        this.form.date = this.formatDateString(prefillData.date);

      if (prefillData.recurringPaymentId) {
        this.form.recurringPaymentId = prefillData.recurringPaymentId;
        this.prefillRecurringPaymentId = prefillData.recurringPaymentId;
        try {
          this.recurringPaymentDetails =
            (await this.db.recurringPayments.get(
              prefillData.recurringPaymentId
            )) ?? null;
          this.form.recurrenceSelection =
            this.recurringPaymentDetails?.frequency === 'month'
              ? 'monthly'
              : this.recurringPaymentDetails?.frequency === 'once'
              ? 'returnable'
              : 'never';
        } catch (e) {
          this.recurringPaymentDetails = null;
        }
      }
    }

    // Set up auto-categorization listener for new transactions
    this.setupDescriptionAutoCategorization();

    // Fetch suggestions
    this.descriptionSuggestions = await this.transactionRepository.getUniqueDescriptions(6);
    this.tagSuggestions = await this.transactionRepository.getUniqueTags(12);

    // Choose default account: prefer prefilled account, then last-used, then first account
    const lastUsedAccountId = this.getLastUsedAccountId();
    const hasLastUsedAccount = !!lastUsedAccountId && this.accounts.some((account) => account.id === lastUsedAccountId);

    if (!this.form.accountId) {
      if (hasLastUsedAccount) {
        this.form.accountId = lastUsedAccountId as string;
      } else if (this.accounts.length > 0) {
        this.form.accountId = this.accounts[0].id;
      }
    }
  }

  ionViewDidEnter(): void {
    this.focusAmountInput();
  }

  ngOnDestroy(): void {
    this.categoriesSubscription?.unsubscribe();
  }

  private focusAmountInput(): void {
    setTimeout(() => {
      void this.amountInput?.setFocus();
    }, 50);
  }

  async openCategoryModal(): Promise<void> {
    if (this.saving) return;

    await this.categoryRepository.getCategories();

    const modal = await this.modalController.create({
      component: CategoryGridModalComponent,
      componentProps: {
        title: 'Select Category',
        categories: this.categories,
        selectedCategoryIds: this.form.categoryId ? [this.form.categoryId] : [],
        includeUncategorized: true,
        singleSelect: true,
        showAddCategoryTile: true,
      },
    });

    await modal.present();
    const { data, role } = await modal.onWillDismiss<string>();

    if (role !== 'apply') {
      return;
    }

    this.form.categoryId = data || '';
    this.categoryManuallySelected = true;
  }

  categoryById(id: string): Category | undefined {
    return this.categories.find(c => c.id === id);
  }

  /**
   * Set up auto-categorization: listen for description changes and auto-select category if exact match found.
   */
  private setupDescriptionAutoCategorization(): void {
    let lastDescription = this.form.description;
    setInterval(() => {
      if (this.form.type === 'transfer') return;
      if (this.form.description !== lastDescription) {
        lastDescription = this.form.description;
        if (!this.categoryManuallySelected) {
          const cat = this.autoCategorizationService.getCategoryForDescription(this.form.description);
          if (cat && cat.id !== this.form.categoryId) {
            this.form.categoryId = cat.id;
          }
        }
        this.categoryManuallySelected = false;
      }
    }, 500);
  }

  private async populateFormFromTransaction(tx: Transaction): Promise<void> {
    this.recurringPaymentDetails = tx.recurringPaymentId
      ? await this.db.recurringPayments.get(tx.recurringPaymentId) ?? null
      : null;

    const recurrenceSelection: RecurrenceSelection =
      this.recurringPaymentDetails?.frequency === 'month'
        ? 'monthly'
        : this.recurringPaymentDetails?.frequency === 'once'
          ? 'returnable'
          : 'never';

    const date = new Date(tx.date);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    this.form = {
      type: tx.type,
      recurrenceSelection,
      amount: Math.abs(tx.amount),
      accountId: tx.accountId,
      transferToAccountId: tx.transferToAccountId ?? '',
      categoryId: tx.categoryId ?? '',
      date: `${yyyy}-${mm}-${dd}`,
      description: tx.description ?? '',
      notes: tx.notes ?? '',
      tags: [...(tx.tags ?? [])],
    };

    if (tx.notes || tx.tags?.length || tx.recurringPaymentId) {
      this.showMoreOptions = true;
    }
  }

  private todayString(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  private formatDateString(date: Date | string): string {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  onTypeChange(): void {
    // Clear transfer-specific field when switching away
    if (this.form.type !== 'transfer') {
      this.form.transferToAccountId = '';
      return;
    }

    this.showMoreOptions = false;
    this.form.recurrenceSelection = 'never';
    this.form.categoryId = '';
    this.form.description = '';
    this.form.notes = '';
    this.form.tags = [];
    this.categoryManuallySelected = false;
  }

  onDateChange(event: CustomEvent<{ value?: string | string[] | null }>): void {
    const value = event.detail.value;
    if (typeof value === 'string' && value) {
      this.form.date = value.slice(0, 10);
    }
  }

  removeTag(tag: string): void {
    this.form.tags = this.form.tags.filter(t => t !== tag);
  }

  get canSave(): boolean {
    const hasAmount = this.form.amount !== null && Number(this.form.amount) > 0;
    const hasAccount = !!this.form.accountId;
    const hasToAccount = this.form.type !== 'transfer' || !!this.form.transferToAccountId;
    return hasAmount && hasAccount && hasToAccount;
  }

  async save(): Promise<void> {
    if (!this.canSave || this.saving) return;

    this.saving = true;
    this.categoryManuallySelected = false;
    try {
      const mode = this.isEditMode ? 'update' : 'create';
      let recurringPaymentId = this.transactionToEdit?.recurringPaymentId || this.prefillRecurringPaymentId;

      if (!this.isEditMode && this.form.recurrenceSelection !== 'never' && !recurringPaymentId) {
        recurringPaymentId = await this.createRecurringPayment();
      }

      const baseInput = {
        accountId: this.form.accountId,
        amount: Number(this.form.amount),
        type: this.form.type,
        recurringPaymentId,
        categoryId: this.form.type === 'transfer' ? '' : (this.form.categoryId || ''),
        description: this.capitalizeDescription(this.form.description.trim()),
        date: new Date(this.form.date),
        notes: this.form.notes.trim() || undefined,
        tags: this.form.tags.length > 0 ? this.form.tags : undefined,
        transferToAccountId: this.form.type === 'transfer' ? this.form.transferToAccountId : undefined
      };

      let transaction: Transaction;
      if (this.isEditMode && this.transactionToEdit) {
        const input: UpdateTransactionInput = { ...baseInput, id: this.transactionToEdit.id };
        transaction = await this.transactionRepository.updateTransaction(input);
      } else {
        const input: CreateTransactionInput = baseInput;
        transaction = await this.transactionRepository.createTransaction(input);
        this.persistLastUsedAccountId(this.form.accountId);
      }

      this.analyticsService.trackEvent('transaction_saved', {
        mode,
        transaction_type: this.form.type,
        has_notes: !!baseInput.notes,
        tag_count: this.form.tags.length,
      });

      // If addMore is checked, reset form for new entry but keep account and date
      if (!this.isEditMode && this.addMore) {
        const prevAccountId = this.form.accountId;
        const prevDate = this.form.date;
        const prevType = this.form.type;
        this.form = {
          type: prevType,
          recurrenceSelection: 'never',
          amount: null,
          accountId: prevAccountId,
          transferToAccountId: '',
          categoryId: '',
          date: prevDate,
          description: '',
          notes: '',
          tags: []
        };
        this.recurringPaymentDetails = null;
        this.showMoreOptions = false;
        // Show a toast to confirm
        await this.presentToast('Saved!');
        this.saving = false;
        return;
  }

      // Navigate back to transactions list after save
      await this.navController.back();
    } catch (error) {
      console.error('Error saving transaction:', error);
      this.saving = false;
    }
  }

  private async presentToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 1000,
      position: 'bottom',
      color: 'success',
    });
    await toast.present();
  }

  /**
   * Capitalize each word in the description (title case).
   */
  private capitalizeDescription(value: string): string {
    return value
      .split(/\s+/)
      .filter((part) => !!part)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private async createRecurringPayment(): Promise<string> {
    const now = new Date();
    const recurringPaymentId = crypto.randomUUID();
    const amountValue = Number(this.form.amount ?? 0);
    const storedAmount = Math.abs(amountValue);
    const recurringAnchorDate = this.getRecurringAnchorDate();

    const recurringPayment: RecurringPayment = {
      id: recurringPaymentId,
      accountId: this.form.accountId,
      amount: storedAmount,
      type: this.getRecurringPaymentType(),
      categoryId: this.form.type === 'transfer' ? '' : (this.form.categoryId || ''),
      description: this.capitalizeDescription(this.form.description.trim()),
      date: recurringAnchorDate,
      notes: this.form.notes.trim() || undefined,
      tags: this.form.tags.length > 0 ? this.form.tags : undefined,
      transferToAccountId: this.form.type === 'transfer' ? this.form.transferToAccountId : undefined,
      frequency: this.getRecurringPaymentFrequency(),
      status: 'active',
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
      createdBy: GUEST_USER_NAME,
      updatedBy: GUEST_USER_NAME,
    };

    await this.db.recurringPayments.add(recurringPayment);
    return recurringPaymentId;
  }

  private getRecurringAnchorDate(): Date {
    const sourceDate = new Date(this.form.date);
    const targetYear = sourceDate.getFullYear();
    const targetMonth = sourceDate.getMonth() + 1;
    const maxDayInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const day = Math.min(sourceDate.getDate(), maxDayInTargetMonth);

    return new Date(
      targetYear,
      targetMonth,
      day,
      sourceDate.getHours(),
      sourceDate.getMinutes(),
      sourceDate.getSeconds(),
      sourceDate.getMilliseconds(),
    );
  }

  private getRecurringPaymentFrequency(): RecurringPayment['frequency'] {
    if (this.form.recurrenceSelection === 'returnable') {
      return 'once';
    }

    return 'month';
  }

  private getRecurringPaymentType(): TransactionType {
    if (this.form.recurrenceSelection === 'returnable') {
      return this.form.type === 'income' ? 'expense' : 'income';
    }

    return this.form.type;
  }

  onDescriptionBlur(event: any) {
    const value = event.target.value;
    this.form.description = this.capitalizeDescription(value);

    setTimeout(() => {
      this.filteredSuggestions = [];
    }, 150);
  }

  /**
   * Called from template when user manually selects a category.
   */
  onCategorySelected(): void {
    this.categoryManuallySelected = true;
  }

  private getLastUsedAccountId(): string | null {
    return localStorage.getItem(this.lastUsedAccountStorageKey);
  }

  private persistLastUsedAccountId(accountId: string): void {
    if (!accountId) {
      return;
    }

    localStorage.setItem(this.lastUsedAccountStorageKey, accountId);
  }

  
  async confirmDelete(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Delete Transaction',
      message: 'Are you sure you want to delete this transaction?',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Delete',
          role: 'destructive',
          handler: () => this.deleteTransaction(),
        },
      ],
    });
    await alert.present();
  }

  async deleteTransaction(): Promise<void> {
    if (!this.isEditMode || !this.transactionToEdit) return;
    try {
      this.saving = true;
      await this.transactionRepository.archiveTransaction(this.transactionToEdit.id);
      this.analyticsService.trackEvent('transaction_deleted', {
        source: 'transaction_form',
        transaction_type: this.transactionToEdit.type,
      });
      await this.router.navigate(['/tabs/transactions']);
    } catch (error) {
      console.error('Error deleting transaction:', error);
      this.saving = false;
    }
  }

  filterDescriptionSuggestions(event: any): void {
    const input = event.target.value.toLowerCase();
    this.filteredSuggestions = this.descriptionSuggestions.filter(desc =>
      desc.toLowerCase().includes(input)
    );
  }

  selectDescription(suggestion: string): void {
    this.form.description = suggestion;
    this.filteredSuggestions = []; // Clear suggestions after selection
  }
}
