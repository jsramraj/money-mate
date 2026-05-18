import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonLabel,
  IonList,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular/standalone';
import { DatabaseService } from '../core/database/database.service';
import { DEFAULT_CATEGORIES } from '../core/database/models/category.model';
import { FormsModule } from '@angular/forms';
import { CategoryGridSelectorComponent } from '../shared/category-grid-selector/category-grid-selector.component';

@Component({
  selector: 'app-onboarding-categories',
  standalone: true,
  templateUrl: './onboarding-categories.page.html',
  styleUrls: ['./onboarding-categories.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    CategoryGridSelectorComponent,
  ],
})
export class OnboardingCategoriesPage {
  categories = DEFAULT_CATEGORIES.map(category => ({
    ...category,
    id: crypto.randomUUID().toString(),
    createdBy: 'system',
    createdAt: new Date(),
    updatedAt: new Date(),
    selected: true,
  }));
  selectedCategoryIds = this.categories.map(category => category.id);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly router: Router,
    private readonly toastController: ToastController
  ) {}

  async saveCategories(): Promise<void> {
    const selectedCategories = this.categories
      .filter(category => this.selectedCategoryIds.includes(category.id))
      .map(category => ({
        ...category,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user',
        updatedBy: 'user',
      })); // Add required metadata fields

    try {
      await this.databaseService.saveCategoriesWithMetadata(selectedCategories);
      localStorage.setItem('money-mate-categories-onboarded', 'true');

      const toast = await this.toastController.create({
        message: 'Categories saved successfully!',
        duration: 2000,
        color: 'success',
        position: 'bottom',
      });
      await toast.present();

      await this.router.navigate(['/tabs/dashboard'], { replaceUrl: true });
    } catch (error) {
      console.error('Error saving categories:', error);
      const toast = await this.toastController.create({
        message: 'Failed to save categories. Please try again.',
        duration: 2000,
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    }
  }

  onSelectedCategoryIdsChange(ids: string[]): void {
    this.selectedCategoryIds = ids;
  }
}