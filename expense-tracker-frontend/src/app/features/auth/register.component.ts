import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/errors/api-error';
import { AuthService } from '../../core/services/auth.service';
import { CURRENCY_OPTIONS } from '../../core/utils/currencies';
import { IconComponent } from '../../shared/ui/icon.component';
import { SelectComponent } from '../../shared/ui/select.component';
import { SpinnerComponent } from '../../shared/ui/ui-bits.component';
import { AuthLayoutComponent } from './auth-layout.component';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, IconComponent, SpinnerComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-auth-layout title="Create your account" subtitle="Free forever. Start with your first import in a minute.">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="stack">
        @if (error(); as e) {
          <div class="alert" role="alert"><app-icon name="alert-circle" [size]="18" /> <span>{{ e }}</span></div>
        }

        <div class="field">
          <label for="name">Full name</label>
          <input id="name" class="input" formControlName="fullName" autocomplete="name" placeholder="Your name" [class.invalid]="invalid('fullName')" />
          @if (invalid('fullName')) { <span class="field-error">Enter your name (up to 100 characters).</span> }
        </div>

        <div class="field">
          <label for="email">Email</label>
          <input id="email" class="input" type="email" formControlName="email" autocomplete="email" placeholder="you@example.com" [class.invalid]="invalid('email') || !!server('email')" />
          @if (invalid('email')) { <span class="field-error">Enter a valid email address.</span> }
          @if (server('email'); as s) { <span class="field-error">{{ s }}</span> }
        </div>

        <div class="field">
          <label for="password">Password</label>
          <div class="input-affix">
            <input id="password" class="input" [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="new-password"
                   placeholder="At least 8 characters" [class.invalid]="invalid('password')" />
            <button type="button" class="btn btn-icon btn-sm btn-ghost" [attr.aria-label]="show() ? 'Hide password' : 'Show password'" (click)="show.set(!show())">
              <app-icon [name]="show() ? 'eye-off' : 'eye'" [size]="18" />
            </button>
          </div>
          <div class="meter" [attr.data-score]="score()"><i></i><i></i><i></i><i></i></div>
          <ul class="rules">
            @for (r of rules(); track r.label) {
              <li [class.ok]="r.ok"><app-icon [name]="r.ok ? 'check' : 'x'" [size]="12" /> {{ r.label }}</li>
            }
          </ul>
        </div>

        <div class="field">
          <label>Default currency</label>
          <app-select [options]="currencies" [value]="form.controls.defaultCurrency.value" [searchable]="true" ariaLabel="Default currency"
                      (valueChange)="setCurrency($event)" />
        </div>

        <button type="submit" class="btn btn-primary btn-block" [disabled]="busy()">
          @if (busy()) { <app-spinner [size]="16" /> Creating account… } @else { Create account <app-icon name="arrow-right" [size]="18" /> }
        </button>
      </form>
      <p foot>Already have an account? <a routerLink="/login">Sign in</a></p>
    </app-auth-layout>
  `,
  styles: [`
    .alert { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px; font-size: .9rem; color: var(--danger);
      background: color-mix(in srgb, var(--danger) 12%, transparent); border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); animation: fadeUp .3s both; }
    .meter { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-top: 4px; }
    .meter i { height: 4px; border-radius: 4px; background: var(--grid); transition: background .3s; }
    .meter[data-score='1'] i:nth-child(-n + 1) { background: var(--danger); }
    .meter[data-score='2'] i:nth-child(-n + 2) { background: var(--warning); }
    .meter[data-score='3'] i:nth-child(-n + 3) { background: #a3e635; }
    .meter[data-score='4'] i { background: var(--success); }
    .rules { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 14px; }
    .rules li { display: inline-flex; align-items: center; gap: 5px; font-size: .78rem; color: var(--faint); transition: color .2s; }
    .rules li.ok { color: var(--success); }
  `],
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly currencies = CURRENCY_OPTIONS;
  protected readonly busy = signal(false);
  protected readonly show = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly serverErrors = signal<Record<string, string[]>>({});
  private readonly password = signal('');

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)]],
    defaultCurrency: ['INR', [Validators.required]],
  });

  constructor() {
    this.form.controls.password.valueChanges.subscribe((v) => this.password.set(v));
  }

  protected readonly rules = computed(() => {
    const p = this.password();
    return [
      { label: '8+ characters', ok: p.length >= 8 },
      { label: 'Uppercase', ok: /[A-Z]/.test(p) },
      { label: 'Lowercase', ok: /[a-z]/.test(p) },
      { label: 'Number', ok: /\d/.test(p) },
    ];
  });

  protected readonly score = computed(() => this.rules().filter((r) => r.ok).length);

  protected invalid(name: 'fullName' | 'email' | 'password'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  protected setCurrency(value: string | number | null): void {
    this.form.controls.defaultCurrency.setValue(typeof value === 'string' && value ? value : 'INR');
  }

  protected server(field: string): string | null {
    return this.serverErrors()[field]?.[0] ?? null;
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.busy()) return;

    this.busy.set(true);
    this.error.set(null);
    this.serverErrors.set({});
    const value = this.form.getRawValue();

    this.auth.register({ ...value, fullName: value.fullName.trim(), email: value.email.trim() }).subscribe({
      next: () => void this.router.navigateByUrl('/dashboard'),
      error: (err: unknown) => {
        const apiError = ApiError.from(err);
        if (apiError.code === 'email_taken') this.serverErrors.set({ email: ['An account with this email already exists. Try signing in.'] });
        else if (apiError.hasFieldErrors) this.serverErrors.set(apiError.errors);
        else this.error.set(apiError.message);
        this.busy.set(false);
      },
    });
  }
}
