import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DatabaseService } from '../database.service';
import { Category, CategoryType, GUEST_USER_NAME } from '../models';

@Injectable({
  providedIn: 'root'
})
export class CategoryRepository {
  private categoriesSubject = new BehaviorSubject<Category[]>([]);
  public categories$ = this.categoriesSubject.asObservable();

  constructor(private db: DatabaseService) {
    this.loadCategories();
  }

  /**
   * Get all active categories
   */
  async getCategories(): Promise<Category[]> {
    try {
      const categories = await this.db.categories
        .orderBy('sortOrder')
        .filter(category => !category.isDeleted)
        .toArray();
      
      this.categoriesSubject.next(categories);
      return categories;
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw new Error('Failed to fetch categories');
    }
  }

  /**
   * Get all categories including inactive (for settings management)
   */
  async getCategoriesForSettings(): Promise<Category[]> {
    try {
      return await this.db.categories
        .orderBy('sortOrder')
        .toArray();
    } catch (error) {
      console.error('Error fetching categories for settings:', error);
      throw new Error('Failed to fetch categories for settings');
    }
  }

  /**
   * Get categories as Observable
   */
  getCategories$(): Observable<Category[]> {
    return from(this.getCategories()).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Get category by ID
   */
  async getCategoryById(id: string, includeInactive = false): Promise<Category | undefined> {
    try {
      const category = await this.db.categories
        .where('id')
        .equals(id)
        .filter(category => includeInactive || !category.isDeleted)
        .first();
      
      return category;
    } catch (error) {
      console.error('Error fetching category by ID:', error);
      throw new Error('Failed to fetch category');
    }
  }

  /**
   * Get categories by type (income/expense)
   */
  async getCategoriesByType(type: CategoryType): Promise<Category[]> {
    try {
      if (!type) {
        return this.getCategories();
      }

      const categories = await this.db.categories
        .where('type')
        .equals(type)
        .filter(category => !category.isDeleted)
        .toArray();
      
      // Sort manually since filter() returns array
      categories.sort((a, b) => a.sortOrder - b.sortOrder);
      
      return categories;
    } catch (error) {
      console.error('Error fetching categories by type:', error);
      throw new Error('Failed to fetch categories by type');
    }
  }

  /**
   * Get income categories
   */
  getIncomeCategories(): Promise<Category[]> {
    return this.getCategoriesByType('income');
  }

  /**
   * Get expense categories
   */
  getExpenseCategories(): Promise<Category[]> {
    return this.getCategoriesByType('expense');
  }

  /**
   * Create new category
   */
  async createCategory(categoryData: Omit<Category, 'id' | 'isDeleted' | 'isDirty' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'sortOrder'>): Promise<Category> {
    try {
      const existingCategories = await this.getCategoriesForSettings();
      const maxSortOrder = existingCategories.reduce((max, cat) => Math.max(max, cat.sortOrder), 0);

      const category: Category = {
        ...categoryData,
        id: crypto.randomUUID(),
        isDeleted: false,
        sortOrder: maxSortOrder + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: GUEST_USER_NAME,
        updatedBy: GUEST_USER_NAME
      };

      await this.db.categories.add(category);
      
      // Refresh categories list
      await this.getCategories();
      
      return category;
    } catch (error) {
      console.error('Error creating category:', error);
      throw new Error('Failed to create category');
    }
  }

  /**
   * Update category
   */
  async updateCategory(id: string, updates: Partial<Omit<Category, 'id' | 'isDirty' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>>): Promise<Category> {
    try {
      await this.db.categories
        .where('id')
        .equals(id)
        .modify(updates);
      
      const updatedCategory = await this.getCategoryById(id, true);
      if (!updatedCategory) {
        throw new Error('Category not found after update');
      }

      // Refresh categories list
      await this.getCategories();
      
      return updatedCategory;
    } catch (error) {
      console.error('Error updating category:', error);
      throw new Error('Failed to update category');
    }
  }

  async setCategoryIsActive(id: string, isActive: boolean): Promise<void> {
    try {
      await this.updateCategory(id, { isDeleted: !isActive });
    } catch (error) {
      console.error('Error updating category active state:', error);
      throw new Error('Failed to update category active state');
    }
  }

  /**
   * Legacy compatibility alias
   */
  async deleteCategory(id: string): Promise<void> {
    try {
      await this.setCategoryIsActive(id, false);

      // Refresh categories list
      await this.getCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      throw new Error('Failed to delete category');
    }
  }

  /**
   * Reorder categories within the same type
   */
  async reorderCategories(categoryIds: string[]): Promise<void> {
    try {
      await this.db.transaction('rw', this.db.categories, async () => {
        for (let i = 0; i < categoryIds.length; i++) {
          await this.db.categories.update(categoryIds[i], {
            sortOrder: i + 1
          });
        }
      });

      // Refresh categories list
      await this.getCategories();
    } catch (error) {
      console.error('Error reordering categories:', error);
      throw new Error('Failed to reorder categories');
    }
  }

  /**
   * Check if category name exists (for validation)
   */
  async categoryNameExists(name: string, type?: CategoryType, excludeId?: string): Promise<boolean> {
    try {
      const existing = await this.db.categories
        .where('name')
        .equalsIgnoreCase(name)
        .filter(category => 
          (!type || category.type === type) &&
          !category.isDeleted && 
          (!excludeId || category.id !== excludeId)
        )
        .count();

      return existing > 0;
    } catch (error) {
      console.error('Error checking category name:', error);
      return false;
    }
  }

  async getDirtyCategories(): Promise<Category[]> {
    try {
      return await this.db.categories
        .filter((category) => !!category.isDirty)
        .toArray();
    } catch (error) {
      console.error('Error fetching dirty categories:', error);
      throw new Error('Failed to fetch dirty categories');
    }
  }

  async clearDirtyFlags(categoryIds: string[]): Promise<void> {
    if (categoryIds.length === 0) {
      return;
    }

    try {
      await this.db.runWithoutDirtyTracking(async () => {
        await this.db.categories.where('id').anyOf(categoryIds).modify({ isDirty: false });
      });
      await this.getCategories();
    } catch (error) {
      console.error('Error clearing category dirty flags:', error);
      throw new Error('Failed to clear category dirty flags');
    }
  }

  async upsertFromSheet(category: Category, notify = true): Promise<void> {
    try {
      await this.db.runWithoutDirtyTracking(async () => {
        await this.db.categories.put({
          ...category,
          isDirty: false,
          createdBy: category.createdBy || GUEST_USER_NAME,
          updatedBy: category.updatedBy || category.createdBy || GUEST_USER_NAME,
        });
      });

      // Bulk sync callers refresh once after the whole batch instead of per row.
      if (notify) {
        await this.getCategories();
      }
    } catch (error) {
      console.error('Error upserting category from sheet:', error);
      throw new Error('Failed to upsert category from sheet');
    }
  }

  private loadCategories(): void {
    this.getCategories().catch(error => {
      console.error('Error loading initial categories:', error);
    });
  }

  private handleError(error: any): Observable<never> {
    console.error('Category repository error:', error);
    return throwError(() => new Error('Category operation failed'));
  }
}