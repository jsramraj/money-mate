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
import { addIcons } from 'ionicons';
import { checkmark, close, trash } from 'ionicons/icons';
import { Category } from '../../core/database/models';
import { CategoryRepository } from '../../core/database/repositories';
import { CategoryFormPage } from '../../categories/category-form.page';
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
  @Input() showAddCategoryTile = false;

  resolvedCategories: Category[] = [];
  localSelectedCategoryIds: string[] = [];

  get effectiveIncludeUncategorized(): boolean {
    return this.singleSelect ? false : this.includeUncategorized;
  }

  constructor(
    private readonly modalController: ModalController,
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

  async openCreateCategory(): Promise<void> {
    const modal = await this.modalController.create({
      component: CategoryFormPage,
      componentProps: {
        asModal: true,
      },
      backdropDismiss: false,
      showBackdrop: true,
      cssClass: 'full-screen-modal',
    });

    await modal.present();
    const { data, role } = await modal.onWillDismiss<Category | undefined>();

    if (role !== 'saved' || !data?.id) {
      return;
    }

    await this.refreshCategories();
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
