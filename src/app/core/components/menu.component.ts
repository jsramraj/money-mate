import { Component } from '@angular/core';
import { addIcons } from 'ionicons';
import { CommonModule } from '@angular/common';
import {
  cloudUploadOutline,
  downloadOutline,
  list,
  pieChartOutline,
  pricetagsOutline,
  repeatOutline,
  settings,
  statsChart,
  walletOutline,
} from 'ionicons/icons';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '../services';
import { 
  IonMenu, 
  IonHeader, 
  IonToolbar, 
  IonTitle, 
  IonContent, 
  IonList, 
  IonItem, 
  IonIcon, 
  IonLabel, 
  IonFooter
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-menu',
  templateUrl: './menu.component.html',
  styleUrls: ['./menu.component.scss'],
  imports: [
    CommonModule,
    IonMenu, 
    IonHeader, 
    IonToolbar, 
    IonTitle, 
    IonContent, 
    IonList, 
    IonItem, 
    IonIcon, 
    IonLabel,
    IonFooter,
    RouterLink
  ],
  standalone: true
})
export class MenuComponent {
  showInstall = false;
  deferredPrompt: any = null;

  constructor(private readonly analyticsService: AnalyticsService) {
    // Register menu icons explicitly for standalone usage.
    addIcons({
      'stats-chart': statsChart,
      list,
      settings,
      'pricetags-outline': pricetagsOutline,
      'wallet-outline': walletOutline,
      'pie-chart-outline': pieChartOutline,
      'repeat-outline': repeatOutline,
      'cloud-upload-outline': cloudUploadOutline,
      'download-outline': downloadOutline,
    });

    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstall = true;
      this.analyticsService.trackEvent('install_prompt_available');
    });
  }

  closeMenu(menu: any) {
    menu.close();
  }

  async promptInstall() {
    if (!this.deferredPrompt) return;

    this.deferredPrompt.prompt();
    const choiceResult = await this.deferredPrompt.userChoice;
    console.log('User choice:', choiceResult.outcome);
    this.analyticsService.trackEvent('install_prompt_result', {
      outcome: choiceResult.outcome,
    });
    this.deferredPrompt = null; // Reset
    this.showInstall = false;
  }
}