import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import * as ionicons from 'ionicons/icons';
import { addOutline, pricetagOutline } from 'ionicons/icons';
import { Category } from '../../core/database/models';

@Component({
  selector: 'app-category-grid-selector',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './category-grid-selector.component.html',
  styleUrls: ['./category-grid-selector.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CategoryGridSelectorComponent implements OnChanges {
  @Input() categories: Category[] = [];
  @Input() selectedCategoryIds: string[] = [];
  @Input() includeUncategorized = true;
  @Input() uncategorizedLabel = 'Uncategorized';
  @Input() singleSelect = false;
  @Input() showAddCategoryTile = false;
  @Input() addCategoryLabel = 'New Category';

  @Output() selectedCategoryIdsChange = new EventEmitter<string[]>();
  @Output() addCategoryClick = new EventEmitter<void>();

  readonly uncategorizedId = '__uncategorized__';
  private readonly defaultIcon = 'pricetag-outline';
  private readonly registeredIconNames = new Set<string>([this.defaultIcon]);
  private selectedCategoryIdSet = new Set<string>();
  orderedCategories: Category[] = [];

  constructor() {
    addIcons({ pricetagOutline, addOutline });
  }

  ngOnChanges(): void {
    this.orderedCategories = [...this.categories].sort((firstCategory, secondCategory) =>
      firstCategory.name.localeCompare(secondCategory.name, undefined, {
        sensitivity: 'base'
      })
    );
    this.selectedCategoryIdSet = new Set(this.selectedCategoryIds);
    this.registerCategoryIcons(this.categories);
  }

  trackByCategoryId(_: number, category: Category): string {
    return category.id;
  }

  isSelected(categoryId: string): boolean {
    return this.selectedCategoryIdSet.has(categoryId);
  }

  toggleCategory(categoryId: string): void {
    if (this.singleSelect) {
      if (this.isSelected(categoryId)) {
        this.selectedCategoryIdSet.clear();
        this.selectedCategoryIdsChange.emit([]);
      } else {
        this.selectedCategoryIdSet.clear();
        this.selectedCategoryIdSet.add(categoryId);
        this.selectedCategoryIdsChange.emit([categoryId]);
      }
      return;
    }
    if (this.isSelected(categoryId)) {
      this.selectedCategoryIdSet.delete(categoryId);
      this.selectedCategoryIdsChange.emit([...this.selectedCategoryIdSet]);
      return;
    }
    this.selectedCategoryIdSet.add(categoryId);
    this.selectedCategoryIdsChange.emit([...this.selectedCategoryIdSet]);
  }

  getCategoryIcon(iconName?: string): string {
    const normalizedName = iconName?.trim();
    if (!normalizedName) {
      return this.defaultIcon;
    }

    return this.registeredIconNames.has(normalizedName) ? normalizedName : this.defaultIcon;
  }

  getCategoryColor(color?: string): string {
    const normalizedColor = color?.trim();
    return normalizedColor || 'var(--ion-color-medium)';
  }

  onAddCategoryClick(): void {
    this.addCategoryClick.emit();
  }

  private registerCategoryIcons(categories: Category[]): void {
    const iconsToRegister: Record<string, string> = {};

    categories.forEach((category) => {
      const iconName = category.icon?.trim();
      if (!iconName || this.registeredIconNames.has(iconName)) {
        return;
      }

      const exportName = iconName.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
      const iconData = (ionicons as Record<string, string>)[exportName];
      if (!iconData) {
        return;
      }

      iconsToRegister[iconName] = iconData;
      this.registeredIconNames.add(iconName);
    });

    if (Object.keys(iconsToRegister).length > 0) {
      addIcons(iconsToRegister);
    }
  }
}
