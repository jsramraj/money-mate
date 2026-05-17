import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonFooter,
  IonList,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonChip,
  IonIcon,
  ModalController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { close, checkmark, trash } from 'ionicons/icons';
import { Account, Category, TransactionType } from '../../core/database/models';
import { CategoryRepository } from '../../core/database/repositories';
import { CategoryGridModalComponent } from '../../shared/category-grid-selector/category-grid-modal.component';

export interface TransactionFilterState {
  types: TransactionType[];
  categoryIds: string[];
  accountIds: string[];
  tags: string[];
}

@Component({
  selector: 'app-transaction-filter-modal',
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
    IonFooter,
    IonList,
    IonItem,
    IonLabel,
    IonSelect,
    IonSelectOption,
    IonChip,
    IonIcon,
  ],
  templateUrl: './transaction-filter-modal.component.html',
  styleUrls: ['./transaction-filter-modal.component.scss'],
})
export class TransactionFilterModalComponent {
  @Input() initialFilters: TransactionFilterState = {
    types: ['expense', 'income', 'transfer'],
    categoryIds: [],
    accountIds: [],
    tags: [],
  };

  @Input() accounts: Account[] = [];
  @Input() categories?: Category[];
  @Input() availableTags: string[] = [];

  resolvedCategories: Category[] = [];

  form: TransactionFilterState = {
    types: ['expense', 'income', 'transfer'],
    categoryIds: [],
    accountIds: [],
    tags: [],
  };

  readonly allTypes: TransactionType[] = ['expense', 'income', 'transfer'];

  constructor(
    private readonly modalController: ModalController,
    private readonly categoryRepository: CategoryRepository,
  ) {
    addIcons({ close, checkmark, trash });
  }

  async ngOnInit(): Promise<void> {
    // Map null to '__uncategorized__' for UI binding
    const initialCategoryIds = (this.initialFilters.categoryIds ?? []).map(id => id === null ? '__uncategorized__' : id);
    this.form = {
      types: [...(this.initialFilters.types ?? this.allTypes)],
      categoryIds: [...initialCategoryIds],
      accountIds: [...(this.initialFilters.accountIds ?? [])],
      tags: [...(this.initialFilters.tags ?? [])],
    };

    if (this.form.types.length === 0) {
      this.form.types = [...this.allTypes];
    }

    await this.loadCategoriesIfNeeded();
  }

  isTypeSelected(type: TransactionType): boolean {
    return this.form.types.includes(type);
  }

  toggleType(type: TransactionType): void {
    if (this.isTypeSelected(type)) {
      this.form.types = this.form.types.filter((selectedType) => selectedType !== type);
      return;
    }

    this.form.types = [...this.form.types, type];
  }

  clearAll(): void {
    this.form = {
      types: [...this.allTypes],
      categoryIds: [],
      accountIds: [],
      tags: [],
    };
  }

  get categorySelectionLabel(): string {
    const selectedCount = this.form.categoryIds.length;
    if (selectedCount === 0) {
      return 'All categories';
    }

    return `Categories (${selectedCount} selected)`;
  }

  async openCategoryPicker(): Promise<void> {
    await this.loadCategoriesIfNeeded();

    const modal = await this.modalController.create({
      component: CategoryGridModalComponent,
      componentProps: {
        title: 'Categories',
        categories: this.resolvedCategories,
        selectedCategoryIds: [...this.form.categoryIds],
        includeUncategorized: true,
      },
    });

    await modal.present();
    const { data, role } = await modal.onWillDismiss<string[]>();

    if (role !== 'apply' || !data) {
      return;
    }

    this.form.categoryIds = [...data];
  }

  private async loadCategoriesIfNeeded(): Promise<void> {
    const providedCategories = this.categories ?? [];
    if (providedCategories.length > 0) {
      this.resolvedCategories = [...providedCategories];
      return;
    }

    this.resolvedCategories = await this.categoryRepository.getCategoriesForSettings();
  }

  async cancel(): Promise<void> {
    await this.modalController.dismiss(undefined, 'cancel');
  }

  async apply(): Promise<void> {
    const normalizedTypes = this.form.types.length > 0 ? this.form.types : [...this.allTypes];

    await this.modalController.dismiss(
      {
        types: [...normalizedTypes],
        categoryIds: [...this.form.categoryIds],
        accountIds: [...this.form.accountIds],
        tags: [...this.form.tags],
      } satisfies TransactionFilterState,
      'apply',
    );
  }
}
