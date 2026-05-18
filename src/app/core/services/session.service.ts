import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  GoogleLoginResponseOnline,
  SocialLogin,
} from '@capgo/capacitor-social-login';
import { environment } from '../../../environments/environment';
import { ActivatedRoute, Router } from '@angular/router';

export type AuthMode = 'google' | 'offline';

export interface UserSession {
  mode: AuthMode;
  email?: string;
  name?: string;
  picture?: string;
  accessToken?: string;
  expiresAt?: number;
}

export interface LinkedSpreadsheet {
  id: string;
  name: string;
}

export interface SignInResult {
  success: boolean;
  reason?: 'permission_denied' | 'login_failed';
}

@Injectable({
  providedIn: 'root',
})
export class SessionService {
  private readonly SESSION_KEY = 'money-mate-user-session';
  private readonly ENTRY_KEY = 'money-mate-auth-entry-completed';
  private readonly QUERY_PARAMS_KEY = 'money-mate-auth-query-params';
  private readonly SPREADSHEET_KEY = 'money-mate-linked-spreadsheet';
  private readonly AUTH_CALLBACK_PATH = '/auth/callback';
  private readonly sessionSubject = new BehaviorSubject<UserSession | null>(null);
  private initialized = false;

  constructor(
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {
    this.loadSession();
  }

  get session$(): Observable<UserSession | null> {
    return this.sessionSubject.asObservable();
  }

  get currentSession(): UserSession | null {
    return this.sessionSubject.value;
  }

  get hasCompletedEntry(): boolean {
    return localStorage.getItem(this.ENTRY_KEY) === 'true';
  }

  get isGoogleConnected(): boolean {
    return this.currentSession?.mode === 'google';
  }

  get linkedSpreadsheet(): LinkedSpreadsheet | null {
    const raw = localStorage.getItem(this.SPREADSHEET_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as LinkedSpreadsheet;
    } catch {
      localStorage.removeItem(this.SPREADSHEET_KEY);
      return null;
    }
  }

  hasLinkedSpreadsheet(): boolean {
    return !!this.linkedSpreadsheet?.id;
  }

  setLinkedSpreadsheet(spreadsheet: LinkedSpreadsheet): void {
    localStorage.setItem(this.SPREADSHEET_KEY, JSON.stringify(spreadsheet));
  }

  clearLinkedSpreadsheet(): void {
    localStorage.removeItem(this.SPREADSHEET_KEY);
  }

  async initializeGoogleAuth(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await SocialLogin.initialize({
      google: {
        webClientId: environment.googleSignInClientId,
      },
    });

    this.initialized = true;
  }

  async signInWithGoogle(): Promise<SignInResult> {
    try {
      this.removeQueryParams();

      const response = await SocialLogin.login({
        provider: 'google',
        options: {
          scopes: environment.googleScopes,
          forceRefreshToken: true,
        },
      });

      const result = response.result as GoogleLoginResponseOnline | undefined;
      const accessToken = result?.accessToken?.token;

      if (!accessToken) {
        return { success: false, reason: 'login_failed' };
      }

      const tokenInfoResponse = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`,
      );
      const tokenInfo = await tokenInfoResponse.json() as { scope?: string };
      const grantedScopes = tokenInfo.scope?.split(' ') || [];
      const hasDriveFilePermission = grantedScopes.includes(
        'https://www.googleapis.com/auth/drive.file',
      );

      if (!hasDriveFilePermission) {
        this.restoreQueryParams();
        return { success: false, reason: 'permission_denied' };
      }

      const session: UserSession = {
        mode: 'google',
        email: result?.profile?.email ?? undefined,
        name: result?.profile?.name ?? undefined,
        picture: result?.profile?.imageUrl ?? undefined,
        accessToken,
        expiresAt: Date.now() + 60 * 60 * 1000,
      };

      this.setSession(session);
      this.markEntryCompleted();
      this.restoreQueryParams();
      return { success: true };
    } catch (error) {
      console.error('Google sign-in failed:', error);
      this.restoreQueryParams();
      return { success: false, reason: 'login_failed' };
    }
  }

  continueOffline(): void {
    this.setSession({ mode: 'offline' });
    this.markEntryCompleted();
  }

  async signOutGoogle(): Promise<void> {
    try {
      await SocialLogin.logout({ provider: 'google' });
    } catch (error) {
      console.error('Google sign-out failed:', error);
    }

    this.setSession({ mode: 'offline' });
    this.markEntryCompleted();
  }

  isTokenExpiringSoon(bufferMs = 5 * 60 * 1000): boolean {
    const session = this.currentSession;
    if (!session || session.mode !== 'google' || !session.accessToken) {
      return true;
    }

    if (!session.expiresAt) {
      return true;
    }

    return session.expiresAt <= Date.now() + bufferMs;
  }

  async refreshGoogleToken(): Promise<boolean> {
    const currentSession = this.currentSession;
    if (!currentSession || currentSession.mode !== 'google') {
      return false;
    }

    const shouldNavigateToCallback = this.isRunningOnWeb() && !this.router.url.startsWith(this.AUTH_CALLBACK_PATH);
    const returnUrl = shouldNavigateToCallback ? this.router.url : null;

    try {
      if (shouldNavigateToCallback) {
        await this.router.navigateByUrl(this.AUTH_CALLBACK_PATH, { replaceUrl: true });
      }

      await this.initializeGoogleAuth();

      const response = await SocialLogin.login({
        provider: 'google',
        options: {
          scopes: environment.googleScopes,
          forceRefreshToken: true,
        },
      });

      const result = response.result as GoogleLoginResponseOnline | undefined;
      const accessToken = result?.accessToken?.token;
      if (!accessToken) {
        return false;
      }

      const refreshedSession: UserSession = {
        mode: 'google',
        email: result?.profile?.email ?? currentSession.email,
        name: result?.profile?.name ?? currentSession.name,
        picture: result?.profile?.imageUrl ?? currentSession.picture,
        accessToken,
        expiresAt: Date.now() + 60 * 60 * 1000,
      };

      this.setSession(refreshedSession);
      return true;
    } catch (error) {
      console.error('Google token refresh failed:', error);
      return false;
    } finally {
      if (returnUrl && this.router.url.startsWith(this.AUTH_CALLBACK_PATH)) {
        await this.router.navigateByUrl(returnUrl, { replaceUrl: true });
      }
    }
  }

  private isRunningOnWeb(): boolean {
    return typeof window !== 'undefined';
  }

  private markEntryCompleted(): void {
    localStorage.setItem(this.ENTRY_KEY, 'true');
  }

  private loadSession(): void {
    const raw = localStorage.getItem(this.SESSION_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as UserSession;
      this.sessionSubject.next(parsed);
    } catch {
      localStorage.removeItem(this.SESSION_KEY);
    }
  }

  private setSession(session: UserSession): void {
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
    this.sessionSubject.next(session);
  }

  private removeQueryParams(): void {
    const currentQueryParams = this.route.snapshot.queryParams;
    localStorage.setItem(this.QUERY_PARAMS_KEY, JSON.stringify(currentQueryParams));
    this.router.navigate([], {
      replaceUrl: true,
    });
  }

  private restoreQueryParams(): void {
    const queryParams = localStorage.getItem(this.QUERY_PARAMS_KEY);
    if (!queryParams) {
      return;
    }

    const parsedQueryParams = JSON.parse(queryParams);
    this.router.navigate([], {
      queryParams: parsedQueryParams,
      replaceUrl: true,
    });
    localStorage.removeItem(this.QUERY_PARAMS_KEY);
  }

  areCategoriesOnboarded(): boolean {
    const raw = localStorage.getItem('money-mate-categories-onboarded');
    return raw === 'true';
  }
}