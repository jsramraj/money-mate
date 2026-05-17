import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonFooter,
  ModalController,
  IonIcon,
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import { checkmark, close, trash } from 'ionicons/icons';
import { Category } from '../../core/database/models';
import { CategoryRepository } from '../../core/database/repositories';
import { CategoryGridSelectorComponent } from './category-grid-selector.component';

@Component({
  selector: 'app-category-grid-modal',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonFooter,
    IonIcon,
    CategoryGridSelectorComponent,
  ],
  templateUrl: './category-grid-modal.component.html',
  styleUrls: ['./category-grid-modal.component.scss'],
})
export class CategoryGridModalComponent {
  @Input() title = 'Categories';
  @Input() categories?: Category[];
  @Input() selectedCategoryIds: string[] = [];
  @Input() includeUncategorized = true;
  @Input() singleSelect = false;

  resolvedCategories: Category[] = [];
  localSelectedCategoryIds: string[] = [];

  get effectiveIncludeUncategorized(): boolean {
    return this.singleSelect ? false : this.includeUncategorized;
  }

  constructor(
    private readonly modalController: ModalController,
    private readonly router: Router,
    private readonly categoryRepository: CategoryRepository
  ) {
    addIcons({ close, checkmark, trash });
  }

  async ngOnInit(): Promise<void> {
    this.localSelectedCategoryIds = [...this.selectedCategoryIds];
    await this.refreshCategories();
  }

  async onSelectedCategoryIdsChange(categoryIds: string[]): Promise<void> {
    this.localSelectedCategoryIds = [...categoryIds];

    if (!this.singleSelect) {
      return;
    }

    await this.apply();
  }

  clearAll(): void {
    this.localSelectedCategoryIds = [];
  }

  async openManageCategories(): Promise<void> {
    await this.modalController.dismiss(undefined, 'manage-categories');
    await this.router.navigate(['/settings/categories']);
  }

  private async refreshCategories(): Promise<void> {
    const fallbackCategories = this.categories ?? [];

    try {
      this.resolvedCategories = await this.categoryRepository.getCategoriesForSettings();
    } catch (error) {
      console.error('Failed to load latest categories for category grid modal:', error);
      this.resolvedCategories = [...fallbackCategories];
    }
  }

  async cancel(): Promise<void> {
    await this.modalController.dismiss(undefined, 'cancel');
  }

  async apply(): Promise<void> {
    if (this.singleSelect) {
      await this.modalController.dismiss(this.localSelectedCategoryIds[0] || '', 'apply');
    } else {
      await this.modalController.dismiss([...this.localSelectedCategoryIds], 'apply');
    }
  }
}
