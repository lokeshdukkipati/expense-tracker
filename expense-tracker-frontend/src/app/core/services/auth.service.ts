import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { EMPTY, Observable, catchError, finalize, of, shareReplay, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthResponse, ChangePasswordRequest, LoginRequest, RegisterRequest, UpdateProfileRequest, UserDto } from '../models/api.models';
import { ToastService } from './toast.service';

const KEY = 'et.auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly base = `${environment.apiUrl}/auth`;

  readonly session = signal<AuthResponse | null>(this.read());
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly currency = computed(() => this.user()?.defaultCurrency ?? 'INR');

  private refreshing$?: Observable<AuthResponse>;

  accessToken(): string | null {
    return this.session()?.accessToken ?? null;
  }

  hasRefreshToken(): boolean {
    return !!this.session()?.refreshToken;
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/login`, request).pipe(tap((s) => this.store(s)));
  }

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/register`, request).pipe(tap((s) => this.store(s)));
  }

  /** One refresh at a time: concurrent 401s share the same request, so the rotating refresh token is used once. */
  refresh(): Observable<AuthResponse> {
    const token = this.session()?.refreshToken;
    if (!token) return EMPTY;

    this.refreshing$ ??= this.http.post<AuthResponse>(`${this.base}/refresh`, { refreshToken: token }).pipe(
      tap((s) => this.store(s)),
      finalize(() => (this.refreshing$ = undefined)),
      shareReplay(1),
    );
    return this.refreshing$;
  }

  /** Signs out locally and (best effort) revokes the refresh token on the server. */
  logout(options: { expired?: boolean } = {}): void {
    const token = this.session()?.refreshToken;
    this.clear();

    if (token) {
      this.http.post(`${this.base}/logout`, { refreshToken: token }).pipe(catchError(() => of(null))).subscribe();
    }

    if (options.expired) this.toast.warning('Your session expired. Please sign in again.');
    void this.router.navigate(['/login'], options.expired ? { queryParams: { returnUrl: this.router.url } } : {});
  }

  changePassword(request: ChangePasswordRequest): Observable<void> {
    return this.http.post<void>(`${this.base}/change-password`, request);
  }

  updateProfile(request: UpdateProfileRequest): Observable<UserDto> {
    return this.http.put<UserDto>(`${environment.apiUrl}/profile`, request).pipe(tap((user) => this.updateUser(user)));
  }

  deleteAccount(password: string): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/profile`, { body: { password } }).pipe(tap(() => this.clear()));
  }

  updateUser(user: UserDto): void {
    const current = this.session();
    if (current) this.store({ ...current, user });
  }

  private store(session: AuthResponse): void {
    this.session.set(session);
    try {
      localStorage.setItem(KEY, JSON.stringify(session));
    } catch {
      /* storage unavailable: the session lasts until the tab closes */
    }
  }

  private clear(): void {
    this.session.set(null);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* nothing to clear */
    }
  }

  private read(): AuthResponse | null {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AuthResponse;
      return parsed?.accessToken && parsed?.refreshToken && parsed?.user ? parsed : null;
    } catch {
      return null;
    }
  }
}
