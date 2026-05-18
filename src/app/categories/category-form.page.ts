import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
  ModalController,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { createOutline, pricetagOutline } from 'ionicons/icons';
import { Category } from '../core/database/models';
import { CategoryRepository } from '../core/database/repositories';
import { IconPickerModalComponent } from '../shared/icon-picker/icon-picker-modal.component';
import { IconPickerConfig, IconPickerResult } from '../shared/icon-picker/icon-picker.types';

interface CategoryFormValue {
  name: string;
  icon: string;
  color: string;
  isActive: boolean;
}

@Component({
  selector: 'app-category-form',
  standalone: true,
  templateUrl: './category-form.page.html',
  styleUrls: ['./category-form.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonBackButton,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonLabel,
    IonList,
    IonSpinner,
    IonTitle,
    IonToggle,
    IonToolbar
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CategoryFormPage implements OnInit {
  @Input() asModal = false;

  readonly iconPickerConfig: Partial<IconPickerConfig> = {
    sourceUrl: 'assets/assets/ionic-icons.json',
    initialVisibleCount: 100,
    loadMoreStep: 100,
    title: 'Pick Icon',
    searchPlaceholder: 'Search icon by name or tag'
  };

  loading = true;
  saving = false;
  error: string | null = null;
  category?: Category;
  form: CategoryFormValue = {
    name: '',
    icon: 'pricetag-outline',
    color: '',
    isActive: true
  };

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router,
    private readonly modalController: ModalController,
    private readonly toastController: ToastController,
    private readonly categoryRepository: CategoryRepository,
    private readonly cdr: ChangeDetectorRef
  ) {
    addIcons({ createOutline, pricetagOutline });
  }

  get isEditMode(): boolean {
    return !!this.category;
  }

  get pageTitle(): string {
    return this.isEditMode ? 'Edit Category' : 'Create Category';
  }

  get canSave(): boolean {
    return !this.loading && !this.saving && this.form.name.trim().length > 0;
  }

  async ngOnInit(): Promise<void> {
    await this.loadCategory();
  }

  private async loadCategory(): Promise<void> {
    try {
      this.loading = true;
      this.error = null;

      const categoryId = this.activatedRoute.snapshot.paramMap.get('id');
      if (!categoryId) {
        this.initializeCreateForm();
        return;
      }

      const currentNavigation = this.router.getCurrentNavigation();
      const categoryFromNavigation = currentNavigation?.extras.state?.['category'] as Category | undefined;
      const categoryFromHistory = history.state?.category as Category | undefined;
      const stateCategory = categoryFromNavigation?.id === categoryId
        ? categoryFromNavigation
        : categoryFromHistory?.id === categoryId
          ? categoryFromHistory
          : undefined;

      if (stateCategory) {
        this.category = stateCategory;
        this.form = {
          name: stateCategory.name ?? '',
          icon: stateCategory.icon ?? 'pricetag-outline',
          color: this.normalizeColor(stateCategory.color ?? ''),
          isActive: !stateCategory.isDeleted
        };
        return;
      }

      const category = await this.categoryRepository.getCategoryById(categoryId, true);
      if (!category) {
        this.error = 'Category not found';
        return;
      }

      this.category = category;
      this.form = {
        name: category.name ?? '',
        icon: category.icon ?? 'pricetag-outline',
        color: this.normalizeColor(category.color ?? ''),
        isActive: !category.isDeleted
      };
    } catch (error) {
      console.error('Error loading category form:', error);
      this.error = 'Failed to load category';
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  private initializeCreateForm(): void {
    this.category = undefined;
    this.form = {
      name: '',
      icon: 'pricetag-outline',
      color: this.generateRandomColor(),
      isActive: true
    };
  }

  private generateRandomColor(): string {
    return ('#' + ((Math.random() * 0xFFFFFF) << 0).toString(16).padStart(6, '0')).toUpperCase();
  }

  private normalizeColor(value: string): string {
    return value.trim().toUpperCase();
  }

  async openIconPicker(): Promise<void> {
    const modal = await this.modalController.create({
      component: IconPickerModalComponent,
      componentProps: {
        selectedIcon: this.form.icon,
        selectedColor: this.form.color,
        config: this.iconPickerConfig
      },
      breakpoints: [1],
      initialBreakpoint: 1
    });

    await modal.present();
    const { data, role } = await modal.onDidDismiss<IconPickerResult>();

    if (role !== 'select' || !data?.icon) {
      return;
    }

    this.form.icon = data.icon;
    if (data.color) {
      this.form.color = this.normalizeColor(data.color);
    }
    this.cdr.markForCheck();
  }

  async cancel(): Promise<void> {
    if (this.asModal) {
      await this.modalController.dismiss(undefined, 'cancel');
      return;
    }

    await this.router.navigate(['/settings/categories']);
  }

  async save(): Promise<void> {
    if (!this.canSave) {
      return;
    }

    const payload = {
      name: this.form.name.trim(),
      icon: (this.form.icon || 'pricetag-outline').trim(),
      color: this.normalizeColor(this.form.color)
    };

    try {
      this.saving = true;
      this.error = null;
      this.cdr.markForCheck();

      if (this.category) {
        await this.categoryRepository.updateCategory(this.category.id, payload);

        const wasActive = !this.category.isDeleted;
        if (wasActive !== this.form.isActive) {
          await this.categoryRepository.setCategoryIsActive(this.category.id, this.form.isActive);
        }

        await this.presentToast('Category updated', 'success');

        if (this.asModal) {
          await this.modalController.dismiss(
            await this.categoryRepository.getCategoryById(this.category.id, true),
            'saved'
          );
          return;
        }
      } else {
        const createdCategory = await this.categoryRepository.createCategory(payload);
        await this.presentToast('Category created', 'success');

        if (this.asModal) {
          await this.modalController.dismiss(createdCategory, 'saved');
          return;
        }
      }

      await this.router.navigate(['/settings/categories']);
    } catch (error) {
      console.error('Error saving category:', error);
      this.error = this.category ? 'Failed to save category changes' : 'Failed to create category';
      await this.presentToast(this.error, 'danger');
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  private async presentToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2000,
      color,
      position: 'bottom'
    });
    await toast.present();
  }
}