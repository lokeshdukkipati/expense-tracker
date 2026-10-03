import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/errors/api-error';
import { AuthService } from '../../core/services/auth.service';
import { IconComponent } from '../../shared/ui/icon.component';
import { SpinnerComponent } from '../../shared/ui/ui-bits.component';
import { AuthLayoutComponent } from './auth-layout.component';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, IconComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-layout title="Welcome back" subtitle="Sign in to see your latest numbers.">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="stack">
        @if (error(); as e) {
          <div class="alert" role="alert"><app-icon name="alert-circle" [size]="18" /> <span>{{ e }}</span></div>
        }

        <div class="field">
          <label for="email">Email</label>
          <input id="email" class="input" type="email" formControlName="email" autocomplete="username" placeholder="you@example.com"
                 [class.invalid]="invalid('email')" />
          @if (invalid('email')) { <span class="field-error">Enter a valid email address.</span> }
        </div>

        <div class="field">
          <label for="password">Password</label>
          <div class="input-affix">
            <input id="password" class="input" [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="current-password"
                   placeholder="Your password" [class.invalid]="invalid('password')" />
            <button type="button" class="btn btn-icon btn-sm btn-ghost" [attr.aria-label]="show() ? 'Hide password' : 'Show password'" (click)="show.set(!show())">
              <app-icon [name]="show() ? 'eye-off' : 'eye'" [size]="18" />
            </button>
          </div>
          @if (invalid('password')) { <span class="field-error">Enter your password.</span> }
        </div>

        <button type="submit" class="btn btn-primary btn-block" [disabled]="busy()">
          @if (busy()) { <app-spinner [size]="16" /> Signing in… } @else { Sign in <app-icon name="arrow-right" [size]="18" /> }
        </button>
      </form>
      <p foot>New here? <a routerLink="/register">Create an account</a></p>
    </app-auth-layout>
  `,
  styles: [`
    .alert { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px; font-size: .9rem; color: var(--danger);
      background: color-mix(in srgb, var(--danger) 12%, transparent); border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); animation: fadeUp .3s both; }
  `],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly busy = signal(false);
  protected readonly show = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  protected invalid(name: 'email' | 'password'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();

    this.auth.login({ email: email.trim(), password }).subscribe({
      next: () => {
        const target = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(target && target.startsWith('/') && !target.startsWith('//') ? target : '/dashboard');
      },
      error: (err: unknown) => {
        const apiError = ApiError.from(err);
        this.error.set(apiError.hasFieldErrors ? 'Please check your email and password.' : apiError.message);
        this.busy.set(false);
      },
    });
  }
}
