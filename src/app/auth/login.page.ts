import { Component, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  AlertButton,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
  ToastController,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { logoGoogle, phonePortraitOutline, chevronDown, chevronUp, trash } from 'ionicons/icons';
import { AnalyticsService, SessionService } from '../core/services';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonButton,
    IonIcon,
    IonText,
    IonSpinner,
  ],
})
export class LoginPage {
  errorMessage: string | null = null;
  isBusy = false;
  showTroubleshooting = false;

  constructor(
    private readonly sessionService: SessionService,
    private readonly analyticsService: AnalyticsService,
    private readonly router: Router,
    private readonly toastController: ToastController,
    private readonly alertController: AlertController,
    private readonly zone: NgZone,
  ) {
    addIcons({ logoGoogle, phonePortraitOutline, chevronDown, chevronUp, trash });
  }

  async ngOnInit(): Promise<void> {
    await this.sessionService.initializeGoogleAuth();
  }

  async continueWithGoogle(): Promise<void> {
    this.analyticsService.trackEvent('auth_google_sign_in', { action: 'attempt' });
    this.errorMessage = null;
    this.isBusy = true;

    const result = await this.zone.run(() => this.sessionService.signInWithGoogle());
    this.isBusy = false;

    if (result.success) {
      this.analyticsService.trackEvent('auth_google_sign_in', {
        action: 'success',
        has_linked_sheet: this.sessionService.hasLinkedSpreadsheet(),
      });

      if (this.sessionService.hasLinkedSpreadsheet()) {
        await this.router.navigate(['/tabs/dashboard'], { replaceUrl: true });
        return;
      }

      await this.router.navigate(['/onboarding'], { replaceUrl: true });
      return;
    }

    if (result.reason === 'permission_denied') {
      this.analyticsService.trackEvent('auth_google_sign_in', {
        action: 'failed',
        reason: 'permission_denied',
      });
      this.errorMessage = 'Google Drive access is required to sync sheets.';
      await this.showPermissionAlert();
      return;
    }

    this.analyticsService.trackEvent('auth_google_sign_in', {
      action: 'failed',
      reason: result.reason ?? 'login_failed',
    });

    this.errorMessage = 'Google sign-in failed. You can retry or continue offline.';
    const toast = await this.toastController.create({
      message: 'Unable to sign in with Google',
      duration: 2500,
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  }

  private async showPermissionAlert(): Promise<void> {
    const buttons: AlertButton[] = [
      {
        text: 'Try Again',
        handler: async () => {
          await this.continueWithGoogle();
        },
      },
      {
        text: 'Continue Offline',
        role: 'cancel',
        handler: async () => {
          await this.continueOffline();
        },
      },
    ];

    const alert = await this.alertController.create({
      header: 'Permission Required',
      subHeader: 'Google Drive Access',
      message:
        'Money Mate needs Google Drive file access to create or pick your sync sheet. Please sign in again and grant the requested permissions.',
      buttons,
    });

    await alert.present();
  }

  async continueOffline(): Promise<void> {
    this.sessionService.continueOffline();    
    this.analyticsService.trackEvent('auth_continue_offline');
    await this.router.navigate(['/onboarding-categories'], { replaceUrl: true });
  }

  toggleTroubleshooting(): void {
    this.showTroubleshooting = !this.showTroubleshooting;
  }

  async clearAppData(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Clear All Data?',
      message: 'This will delete all local app data. You will have to login again.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
          cssClass: 'secondary',
        },
        {
          text: 'Clear All Data',
          role: 'destructive',
          handler: async () => {
            try {
              localStorage.clear();
              sessionStorage.clear();
              this.analyticsService.trackEvent('app_data_cleared');

              const toast = await this.toastController.create({
                message: 'All data cleared. Refreshing...',
                duration: 2000,
                color: 'success',
                position: 'bottom',
              });
              await toast.present();

              setTimeout(() => {
                window.location.href = '/login';
              }, 1000);
            } catch (error) {
              console.error('Error clearing data:', error);
              const errorToast = await this.toastController.create({
                message: 'Error clearing data',
                duration: 2500,
                color: 'danger',
                position: 'bottom',
              });
              await errorToast.present();
            }
          },
        },
      ],
    });
    await alert.present();
  }
}