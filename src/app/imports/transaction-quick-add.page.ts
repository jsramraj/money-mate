import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  AlertController,
  IonBadge,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronDownOutline, helpCircleOutline } from 'ionicons/icons';
import { Account, Category } from '../core/database/models';
import { AccountRepository, CategoryRepository } from '../core/database/repositories';
import { AnalyticsService } from '../core/services';
import { AutoCategorizationService } from '../core/services/auto-categorization.service';
import {
  CsvImportCommitResult,
  CsvImportInvalidRow,
  CsvImportPreviewResult,
  CsvImportService,
  CsvImportTransactionPreview,
} from '../core/services/csv-import.service';
import { CategoryGridModalComponent } from '../shared/category-grid-selector/category-grid-modal.component';

@Component({
  selector: 'app-transaction-quick-add',
  standalone: true,
  templateUrl: './transaction-quick-add.page.html',
  styleUrls: ['./transaction-quick-add.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonBadge,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonContent,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransactionQuickAddPage implements OnInit, OnDestroy {
  private readonly currencyKey = 'money-mate-currency';
  private readonly previewDisplayLimit = 500;
  private readonly uncategorizedOptionValue = '__uncategorized__';
  accounts: Account[] = [];
  categories: Category[] = [];
  selectedCurrency = 'USD';
  selectedAccountId = '';
  quickEntryText = '';
  loadingAccounts = false;
  processing = false;
  importing = false;
  error: string | null = null;
  preview: CsvImportPreviewResult | null = null;
  importResult: CsvImportCommitResult | null = null;
  private categoriesSubscription?: Subscription;
  
  constructor(
    private readonly accountRepository: AccountRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly analyticsService: AnalyticsService,
    private readonly csvImportService: CsvImportService,
    private readonly alertController: AlertController,
    private readonly modalController: ModalController,
    private readonly toastController: ToastController,
    private readonly cdr: ChangeDetectorRef,
    private readonly autoCategorizationService: AutoCategorizationService,
  ) {
    addIcons({
      chevronDownOutline,
      helpCircleOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    this.selectedCurrency = localStorage.getItem(this.currencyKey) || 'USD';

    this.categoriesSubscription = this.categoryRepository.categories$.subscribe((categories) => {
      this.categories = categories;
      this.cdr.markForCheck();
    });

    await Promise.all([this.loadAccounts(), this.loadCategories()]);
    await this.autoCategorizationService.initialize();
  }

  ngOnDestroy(): void {
    this.categoriesSubscription?.unsubscribe();
  }


  get canPreview(): boolean {
    return !!this.selectedAccountId && !!this.quickEntryText.trim();
  }

  get canImport(): boolean {
    return !!this.preview && this.preview.transactionsToImport.length > 0 && !this.importResult;
  }

  get displayedTransactions(): CsvImportTransactionPreview[] {
    if (!this.preview) {
      return [];
    }

    return this.preview.transactionsToImport.slice(0, this.previewDisplayLimit);
  }

  get displayedPreviewRows(): CsvImportTransactionPreview[] {
    if (!this.preview) {
      return [];
    }


    // Add a 2-second delay between each transaction (by incrementing the date by 2 seconds per row)
    const baseDate = new Date();
    const invalidRowsAsPreview: CsvImportTransactionPreview[] = this.preview.invalidRows.map((invalidRow, idx) => {
      const rawInput = this.formatInvalidRow(invalidRow);
      const dateWithDelay = new Date(baseDate.getTime() + idx * 2000);
      return {
        rowNumber: invalidRow.rowNumber,
        date: dateWithDelay,
        description: `Input ${rawInput}`,
        amount: 0,
        type: 'expense',
        fromAccountName: undefined,
        toAccountName: undefined,
        categoryName: undefined,
        createsAccounts: [],
        createsCategories: [],
        warnings: [...invalidRow.reasons],
        duplicate: false,
      };
    });

    return [...this.preview.transactionsToImport, ...invalidRowsAsPreview]
      .sort((left, right) => left.rowNumber - right.rowNumber)
      .slice(0, this.previewDisplayLimit);
  }

  get hasTruncatedTransactionPreview(): boolean {
    if (!this.preview) {
      return false;
    }

    return (this.preview.transactionsToImport.length + this.preview.invalidRows.length) > this.previewDisplayLimit;
  }

  async loadAccounts(): Promise<void> {
    this.loadingAccounts = true;
    this.error = null;
    this.cdr.markForCheck();

    try {
      this.accounts = await this.accountRepository.getAccountsForSettings();

      const hasSelectedAccount = !!this.selectedAccountId && this.accounts.some((account) => account.id === this.selectedAccountId);
      if (!hasSelectedAccount) {
        this.selectedAccountId = this.accounts[0]?.id || '';
      }
    } catch (error) {
      console.error('Error loading accounts for quick add:', error);
      this.error = error instanceof Error ? error.message : 'Failed to load accounts.';
    } finally {
      this.loadingAccounts = false;
      this.cdr.markForCheck();
    }
  }

  async loadCategories(): Promise<void> {
    try {
      this.categories = await this.categoryRepository.getCategories();
    } catch (error) {
      console.error('Error loading categories for quick add:', error);
      this.error = error instanceof Error ? error.message : 'Failed to load categories.';
    } finally {
      this.cdr.markForCheck();
    }
  }

  onFormChanged(): void {
    this.preview = null;
    this.importResult = null;
    this.error = null;
    this.cdr.markForCheck();
  }

  async previewQuickAdd(): Promise<void> {
    if (!this.canPreview) {
      return;
    }

    this.processing = true;
    this.error = null;
    this.preview = null;
    this.importResult = null;
    this.cdr.markForCheck();

    try {
      this.preview = await this.csvImportService.buildQuickAddPreview(this.quickEntryText, this.selectedAccountId);
      // Auto-categorize: assign categoryName if description matches
      if (this.preview && this.preview.transactionsToImport.length > 0) {
        for (const tx of this.preview.transactionsToImport) {
          const cat = this.autoCategorizationService.getCategoryForDescription(tx.description);
          if (cat) {
            tx.categoryName = cat.name;
          }
        }
      }
      this.analyticsService.trackEvent('quick_add_preview_built', {
        preview_count: this.preview.transactionsToImport.length,
        invalid_row_count: this.preview.invalidRows.length,
      });
      this.processing = false;
      this.cdr.detectChanges();
    //   await this.presentToast('Entries processed successfully', 'success');
    } catch (error) {
      console.error('Error processing quick add entries:', error);
      this.error = error instanceof Error ? error.message : 'Failed to process quick add entries.';
      this.processing = false;
      this.cdr.detectChanges();
      await this.presentToast(this.error, 'danger');
    } finally {
      this.processing = false;
      this.cdr.detectChanges();
    }
  }

  async importTransactions(): Promise<void> {
    if (!this.preview || this.importing || this.importResult) {
      return;
    }

    this.importing = true;
    this.error = null;
    this.cdr.markForCheck();

    try {
      this.importResult = await this.csvImportService.importPreview(this.preview);
      this.analyticsService.trackEvent('quick_add_import_completed', {
        imported_count: this.importResult.importedCount,
      });
      this.importing = false;
      this.cdr.detectChanges();
      await this.presentToast(`Imported ${this.importResult.importedCount} transactions`, 'success');
    } catch (error) {
      console.error('Error importing quick add transactions:', error);
      this.error = error instanceof Error ? error.message : 'Failed to import quick add transactions.';
      this.importing = false;
      this.cdr.detectChanges();
      await this.presentToast(this.error, 'danger');
    } finally {
      this.importing = false;
      this.cdr.detectChanges();
    }
  }

  clearAndStartOver(): void {
    if (this.processing || this.importing) {
      return;
    }

    this.quickEntryText = '';
    this.preview = null;
    this.importResult = null;
    this.error = null;
    this.cdr.markForCheck();
  }

  async showHelp(): Promise<void> {
    this.analyticsService.trackEvent('quick_add_help_opened');
    const alert = await this.alertController.create({
      header: 'Quick Add Help',
      message: 'Enter one transaction per line. Example:\n\n14 Milk 32\n15 Tea 12\n1 Petrol 200\n\nIf a line starts with a number, it will be treated as the day in the current month. If no day is given, today will be used. The selected account applies to every line.',
      buttons: ['OK'],
    });

    await alert.present();
  }

  trackByAccount(_: number, account: Account): string {
    return account.id;
  }

  trackByTransactionRow(_: number, transaction: CsvImportTransactionPreview): number {
    return transaction.rowNumber;
  }

  isSkippedRow(rowNumber: number): boolean {
    if (!this.preview) {
      return false;
    }

    return this.preview.invalidRows.some((row) => row.rowNumber === rowNumber);
  }

  trackByPreviewRow(_: number, row: CsvImportTransactionPreview): number {
    return row.rowNumber;
  }

  getCategoryValueForRow(row: CsvImportTransactionPreview): string {
    if (!row.categoryName) {
      return this.uncategorizedOptionValue;
    }

    const matchedCategory = this.categories.find((category) => category.name === row.categoryName);
    return matchedCategory?.id ?? this.uncategorizedOptionValue;
  }

  async openCategoryPicker(row: CsvImportTransactionPreview): Promise<void> {
    await this.categoryRepository.getCategories();

    const selectedCategoryId = this.getCategoryValueForRow(row);
    const modal = await this.modalController.create({
      component: CategoryGridModalComponent,
      componentProps: {
        title: 'Select Category',
        categories: this.categories,
        selectedCategoryIds:
          selectedCategoryId === this.uncategorizedOptionValue ? [] : [selectedCategoryId],
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

    this.onPreviewRowCategoryChanged(row, data || this.uncategorizedOptionValue);
  }

  onPreviewRowCategoryChanged(row: CsvImportTransactionPreview, selectedValue: string): void {
    if (selectedValue === this.uncategorizedOptionValue) {
      row.categoryName = undefined;
      this.cdr.markForCheck();
      return;
    }

    const selectedCategory = this.categories.find((category) => category.id === selectedValue);
    row.categoryName = selectedCategory?.name;
    this.cdr.markForCheck();
  }

  formatInvalidRow(row: CsvImportInvalidRow): string {
    return row.rawValues.filter((value) => !!value).join(' • ');
  }

  private async presentToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });

    await toast.present();
  }
}
