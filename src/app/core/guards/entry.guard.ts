import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { SessionService } from '../services';

export const appEntryGuard: CanMatchFn = () => {
  const router = inject(Router);
  const sessionService = inject(SessionService);

  if (!sessionService.hasCompletedEntry) {
    return router.createUrlTree(['/login']);
  }

  if (!sessionService.areCategoriesOnboarded()) {
    return router.createUrlTree(['/onboarding-categories']);
  }

  return true;
};