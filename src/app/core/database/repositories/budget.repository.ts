import { Injectable } from '@angular/core';
import { liveQuery } from 'dexie';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DatabaseService } from '../database.service';
import { Budget, BudgetPeriod, BudgetType, GUEST_USER_NAME } from '../models';

export interface CreateBudgetInput {
  name: string;
  type: BudgetType;
  amount: number;
  period: BudgetPeriod;
  startDate: Date;
  endDate?: Date;
  categoryIds?: string[];
  groupId?: string;
  rolloverEnabled: boolean;
  alertThresholds: number[];
}

export type UpdateBudgetInput = Partial<CreateBudgetInput>;

@Injectable({
  providedIn: 'root'
})
export class BudgetRepository {
  private budgetsSubject = new BehaviorSubject<Budget[]>([]);
  public budgets$ = this.budgetsSubject.asObservable();

  constructor(private db: DatabaseService) {
    this.watchBudgets();
  }

  async getBudgets(): Promise<Budget[]> {
    try {
      const budgets = await this.db.budgets
        .orderBy('startDate')
        .filter((budget) => !budget.isDeleted)
        .toArray();

      this.budgetsSubject.next(budgets);
      return budgets;
    } catch (error) {
      console.error('Error fetching budgets:', error);
      throw new Error('Failed to fetch budgets');
    }
  }

  async getBudgetsForSettings(): Promise<Budget[]> {
    try {
      return await this.db.budgets
        .orderBy('startDate')
        .toArray();
    } catch (error) {
      console.error('Error fetching budgets for settings:', error);
      throw new Error('Failed to fetch budgets for settings');
    }
  }

  getBudgets$(): Observable<Budget[]> {
    return this.budgets$.pipe(catchError(this.handleError));
  }

  async getBudgetById(id: string, includeInactive = false): Promise<Budget | undefined> {
    try {
      return await this.db.budgets
        .where('id')
        .equals(id)
        .filter((budget) => includeInactive || !budget.isDeleted)
        .first();
    } catch (error) {
      console.error('Error fetching budget by ID:', error);
      throw new Error('Failed to fetch budget');
    }
  }

  async createBudget(input: CreateBudgetInput): Promise<Budget> {
    this.assertBudgetInputForV1(input);

    const budget: Budget = {
      ...input,
      id: crypto.randomUUID(),
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: GUEST_USER_NAME,
      updatedBy: GUEST_USER_NAME,
      rolloverEnabled: false,
      alertThresholds: this.normalizeAlertThresholds(input.alertThresholds),
      categoryIds: this.normalizeCategoryIds(input.categoryIds),
    };

    await this.ensureNoDuplicateMonthlyCategoryBudget(budget);
    await this.db.budgets.add(budget);
    await this.getBudgets();

    return budget;
  }

  async updateBudget(id: string, updates: UpdateBudgetInput): Promise<Budget> {
    const existing = await this.getBudgetById(id, true);
    if (!existing) {
      throw new Error(`Budget ${id} not found`);
    }

    const merged: CreateBudgetInput = {
      name: updates.name ?? existing.name,
      type: updates.type ?? existing.type,
      amount: updates.amount ?? existing.amount,
      period: updates.period ?? existing.period,
      startDate: updates.startDate ?? existing.startDate,
      endDate: updates.endDate ?? existing.endDate,
      categoryIds: updates.categoryIds ?? existing.categoryIds,
      groupId: updates.groupId ?? existing.groupId,
      rolloverEnabled: updates.rolloverEnabled ?? existing.rolloverEnabled,
      alertThresholds: updates.alertThresholds ?? existing.alertThresholds,
    };

    this.assertBudgetInputForV1(merged);

    const updatedBudget: Budget = {
      ...existing,
      ...merged,
      rolloverEnabled: false,
      alertThresholds: this.normalizeAlertThresholds(merged.alertThresholds),
      categoryIds: this.normalizeCategoryIds(merged.categoryIds),
      updatedAt: new Date(),
      updatedBy: GUEST_USER_NAME,
    };

    await this.ensureNoDuplicateMonthlyCategoryBudget(updatedBudget, id);
    await this.db.budgets.put(updatedBudget);
    await this.getBudgets();

    return updatedBudget;
  }

  async setBudgetIsActive(id: string, isActive: boolean): Promise<void> {
    const existing = await this.getBudgetById(id, true);
    if (!existing) {
      throw new Error(`Budget ${id} not found`);
    }

    await this.updateBudget(id, { ...existing, rolloverEnabled: false });
    await this.db.budgets.where('id').equals(id).modify({ isDeleted: !isActive });
    await this.getBudgets();
  }

  async getDirtyBudgets(): Promise<Budget[]> {
    try {
      return await this.db.budgets
        .filter((budget) => !!budget.isDirty)
        .toArray();
    } catch (error) {
      console.error('Error fetching dirty budgets:', error);
      throw new Error('Failed to fetch dirty budgets');
    }
  }

  async clearDirtyFlags(budgetIds: string[]): Promise<void> {
    if (budgetIds.length === 0) {
      return;
    }

    try {
      await this.db.runWithoutDirtyTracking(async () => {
        await this.db.budgets.where('id').anyOf(budgetIds).modify({ isDirty: false });
      });
      await this.getBudgets();
    } catch (error) {
      console.error('Error clearing budget dirty flags:', error);
      throw new Error('Failed to clear budget dirty flags');
    }
  }

  async upsertFromSheet(budget: Budget, notify = true): Promise<void> {
    this.assertBudgetInputForV1(budget);

    await this.db.runWithoutDirtyTracking(async () => {
      await this.db.budgets.put({
        ...budget,
        rolloverEnabled: false,
        alertThresholds: this.normalizeAlertThresholds(budget.alertThresholds),
        categoryIds: this.normalizeCategoryIds(budget.categoryIds),
        isDirty: false,
        createdBy: budget.createdBy || GUEST_USER_NAME,
        updatedBy: budget.updatedBy || budget.createdBy || GUEST_USER_NAME,
      });
    });

    // Bulk sync callers refresh once after the whole batch instead of per row.
    if (notify) {
      await this.getBudgets();
    }
  }

  private assertBudgetInputForV1(input: CreateBudgetInput): void {
    if (input.type !== 'category') {
      throw new Error('Budget v1 supports only category type');
    }

    if (input.period !== 'monthly') {
      throw new Error('Budget v1 supports only monthly period');
    }

    if (!input.categoryIds || input.categoryIds.length === 0) {
      throw new Error('Category budget requires at least one category');
    }

    if (input.amount <= 0) {
      throw new Error('Budget amount must be greater than zero');
    }

    if (!(input.startDate instanceof Date) || Number.isNaN(input.startDate.getTime())) {
      throw new Error('Budget startDate must be a valid Date');
    }
  }

  private async ensureNoDuplicateMonthlyCategoryBudget(candidate: Budget, currentBudgetId?: string): Promise<void> {
    const targetMonth = this.getMonthKey(candidate.startDate);
    const candidateCategoryIds = new Set(candidate.categoryIds ?? []);
    if (candidateCategoryIds.size === 0) {
      return;
    }

    const existingBudgets = await this.getBudgetsForSettings();
    const duplicate = existingBudgets.find((existing) => {
      if (existing.isDeleted) {
        return false;
      }

      if (currentBudgetId && existing.id === currentBudgetId) {
        return false;
      }

      if (existing.type !== 'category' || existing.period !== 'monthly') {
        return false;
      }

      const sameMonth = this.getMonthKey(existing.startDate) === targetMonth;
      if (!sameMonth) {
        return false;
      }

      const existingCategories = existing.categoryIds ?? [];
      return existingCategories.some((categoryId) => candidateCategoryIds.has(categoryId));
    });

    if (duplicate) {
      throw new Error('A monthly budget already exists for one or more selected categories');
    }
  }

  private getMonthKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  private normalizeCategoryIds(categoryIds?: string[]): string[] {
    if (!categoryIds || categoryIds.length === 0) {
      return [];
    }

    return Array.from(new Set(categoryIds.map((categoryId) => categoryId.trim()).filter(Boolean)));
  }

  private normalizeAlertThresholds(alertThresholds: number[]): number[] {
    const defaults = [50, 80, 100];
    if (!alertThresholds || alertThresholds.length === 0) {
      return defaults;
    }

    const normalized = Array.from(
      new Set(alertThresholds.filter((threshold) => Number.isFinite(threshold) && threshold > 0))
    )
      .map((threshold) => Math.min(100, Math.round(threshold)))
      .sort((a, b) => a - b);

    return normalized.length > 0 ? normalized : defaults;
  }

  private watchBudgets(): void {
    liveQuery(() => this.db.budgets.orderBy('startDate').filter((budget) => !budget.isDeleted).toArray())
      .subscribe({
        next: (budgets) => {
          this.budgetsSubject.next(budgets);
        },
        error: (error) => {
          console.error('Error watching budgets:', error);
        }
      });
  }

  private handleError(error: unknown): Observable<never> {
    console.error('Budget repository error:', error);
    return throwError(() => new Error('Budget operation failed'));
  }
}