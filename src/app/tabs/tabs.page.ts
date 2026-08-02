import { Component, EnvironmentInjector, inject } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonFab, IonFabButton, ModalController } from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import { statsChart, list, add } from 'ionicons/icons';
import { TransactionFormPage } from '../transactions/transaction-form.page';


@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonFab, IonFabButton],
})
export class TabsPage {
  public environmentInjector = inject(EnvironmentInjector);

  constructor(
    private router: Router,
    private modalController: ModalController,
  ) {
    addIcons({ statsChart, list, add });
  }

  async navigateToTransactionForm(): Promise<void> {
    if (!this.isDesktopViewport()) {
      await this.router.navigate(['/tabs/transactions/form']);
      return;
    }

    const modal = await this.modalController.create({
      component: TransactionFormPage,
      componentProps: {
        presentedAsModal: true,
      },
    });

    await modal.present();
    await modal.onWillDismiss();
  }

  private isDesktopViewport(): boolean {
    return window.matchMedia('(min-width: 768px)').matches;
  }
}
