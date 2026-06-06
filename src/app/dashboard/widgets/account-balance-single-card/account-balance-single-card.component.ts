import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonCard, IonCardContent, IonButton, IonIcon, IonList, IonItem, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chevronForward } from 'ionicons/icons';
import { AccountRepository } from '../../../core/database/repositories';
import { Account } from '../../../core/database/models';
import { Observable, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-account-balance-single-card',
  standalone: true,
  imports: [CommonModule, IonCard, IonCardContent, IonButton, IonIcon, IonList, IonItem, IonLabel],
  templateUrl: './account-balance-single-card.component.html',
  styleUrls: ['./account-balance-single-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AccountBalanceSingleCardComponent implements OnInit {
  private readonly CURRENCY_KEY = 'money-mate-currency';

  accounts$: Observable<Account[]>;
  totalBalance$: Observable<number>;
  totalNonCredit$: Observable<number>;
  totalCredit$: Observable<number>;
  totalSavings$: Observable<number>;
  effective$: Observable<number>;

  expanded = false;

  constructor(private accountRepository: AccountRepository) {
    addIcons({ chevronForward });
    this.accounts$ = this.accountRepository.accounts$;

    this.totalBalance$ = this.accounts$.pipe(
      map((accounts) => accounts.reduce((sum, a) => sum + (a.balance || 0), 0))
    );

    this.totalNonCredit$ = this.accounts$.pipe(
      map((accounts) => accounts
        .filter((a) => a.type !== 'credit')
        .reduce((sum, a) => sum + (a.balance || 0), 0)
      )
    );

    this.totalSavings$ = this.accounts$.pipe(
      map((accounts) => accounts
        .filter((a) => a.type === 'savings')
        .reduce((sum, a) => sum + (a.balance || 0), 0)
      )
    );

    this.totalCredit$ = this.accounts$.pipe(
      map((accounts) => Math.abs(accounts
        .filter((a) => a.type === 'credit')
        .reduce((sum, a) => sum + (a.balance || 0), 0)))
    );

    this.effective$ = combineLatest([this.totalNonCredit$, this.totalCredit$]).pipe(
      map(([nonCredit, credit]) => nonCredit - credit)
    );
  }

  ngOnInit(): void {
    void this.accountRepository.getAccounts();
  }

  toggleExpanded(): void {
    this.expanded = !this.expanded;
  }

  formatBalance(balance: number): string {
    const currencyCode = localStorage.getItem(this.CURRENCY_KEY) || 'USD';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 2
    }).format(balance);
  }

  capitalizeType(type: Account['type'] | null): string {
    if (!type) return '';
    return type.charAt(0).toUpperCase() + type.slice(1);
  }
}
