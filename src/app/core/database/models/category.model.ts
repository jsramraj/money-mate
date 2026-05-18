import { AuditableEntity } from './common.types';

export interface Category extends AuditableEntity {
  name: string; // "Food", "Transportation", "Entertainment"
  type?: 'income' | 'expense'; // Optional - transaction amount sign determines income/expense
  color: string; // Hex color for UI (e.g., '#4CAF50')
  icon: string; // Ionic icon name (e.g., 'restaurant-outline')
  sortOrder: number; // Display order
}

// Predefined categories that will be created on first setup
export const DEFAULT_CATEGORIES: Omit<Category, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy' | 'isDirty'>[] = [
  // General Categories (type determined by transaction amount sign)
  { name: 'Food & Dining', color: '#FF9800', icon: 'restaurant-outline', isDeleted: false, sortOrder: 1 },
  { name: 'Transportation', color: '#2196F3', icon: 'car-outline', isDeleted: false, sortOrder: 2 },
  { name: 'Shopping', color: '#9C27B0', icon: 'bag-outline', isDeleted: false, sortOrder: 3 },
  { name: 'Entertainment', color: '#E91E63', icon: 'game-controller-outline', isDeleted: false, sortOrder: 4 },
  { name: 'Bills & Utilities', color: '#607D8B', icon: 'receipt-outline', isDeleted: false, sortOrder: 5 },
  { name: 'Healthcare', color: '#4CAF50', icon: 'medical-outline', isDeleted: false, sortOrder: 6 },
  { name: 'Salary', color: '#4CAF50', icon: 'card-outline', isDeleted: false, sortOrder: 7 },
  { name: 'Freelance', color: '#8BC34A', icon: 'briefcase-outline', isDeleted: false, sortOrder: 8 },
  { name: 'Investment', color: '#CDDC39', icon: 'trending-up-outline', isDeleted: false, sortOrder: 9 },
  // Additional Categories
  { name: 'Groceries', color: '#FF5722', icon: 'cart-outline', isDeleted: false, sortOrder: 10 },
  { name: 'Travel', color: '#3F51B5', icon: 'airplane-outline', isDeleted: false, sortOrder: 11 },
  { name: 'Education', color: '#673AB7', icon: 'school-outline', isDeleted: false, sortOrder: 12 },
  { name: 'Gifts & Donations', color: '#FFC107', icon: 'gift-outline', isDeleted: false, sortOrder: 13 },
  { name: 'Savings', color: '#009688', icon: 'wallet-outline', isDeleted: false, sortOrder: 14 },
  { name: 'Insurance', color: '#795548', icon: 'shield-checkmark-outline', isDeleted: false, sortOrder: 15 },
  { name: 'Childcare', color: '#FFEB3B', icon: 'happy-outline', isDeleted: false, sortOrder: 16 },
  { name: 'Pets', color: '#8D6E63', icon: 'paw-outline', isDeleted: false, sortOrder: 17 },
  { name: 'Subscriptions', color: '#607D8B', icon: 'play-outline', isDeleted: false, sortOrder: 18 },
  { name: 'Miscellaneous', color: '#9E9E9E', icon: 'ellipsis-horizontal-outline', isDeleted: false, sortOrder: 19 },
];

export type CategoryType = Category['type'];