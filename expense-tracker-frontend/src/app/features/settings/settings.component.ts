import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TransactionsApi } from '../../core/api/transactions.api';
import { ApiError } from '../../core/errors/api-error';
import { ExportFormat } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { ThemeMode, ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { CURRENCY_OPTIONS } from '../../core/utils/currencies';
import { TIME_ZONE } from '../../core/utils/dates';
import { downloadBlob, initials } from '../../core/utils/format';
import { SegmentOption, SegmentedComponent } from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { OverlayComponent } from '../../shared/ui/overlay.component';
import { SelectComponent } from '../../shared/ui/select.component';
import { SpinnerComponent } from '../../shared/ui/ui-bits.component';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, IconComponent, SegmentedComponent, SelectComponent, OverlayComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Settings</h1><p>Your profile, appearance, security and data.</p></div></div>

      <div class="grid-12 reveal">
        <section class="card card-pad c-4 who">
          <span class="avatar big">{{ initials(user()?.fullName ?? '') }}</span>
          <h2>{{ user()?.fullName }}</h2>
          <p class="muted">{{ user()?.email }}</p>
          <div class="meta"><span class="chip"><app-icon name="wallet" [size]="14" /> {{ user()?.defaultCurrency }}</span><span class="chip"><app-icon name="clock" [size]="14" /> {{ tz }}</span></div>
          <button type="button" class="btn btn-secondary btn-block" (click)="signOut()"><app-icon name="log-out" [size]="18" /> Sign out</button>
        </section>

        <div class="c-8 stack">
          <section class="card card-pad">
            <h3 class="card-title"><app-icon name="user" [size]="18" /> Profile</h3>
            <form [formGroup]="profile" (ngSubmit)="saveProfile()" novalidate class="stack top">
              <div class="form-grid">
                <div class="field"><label for="pn">Full name</label><input id="pn" class="input" formControlName="fullName" maxlength="100" [class.invalid]="profile.controls.fullName.invalid && profile.controls.fullName.touched" />
                  @if (profile.controls.fullName.invalid && profile.controls.fullName.touched) { <span class="field-error">Enter your name.</span> }</div>
                <div class="field"><label>Default currency</label><app-select [options]="currencies" [value]="profile.controls.defaultCurrency.value" [searchable]="true" (valueChange)="setCurrency($event)" ariaLabel="Default currency" />
                  <span class="field-hint">Used for new accounts and budgets.</span></div>
              </div>
              <div class="row end"><button type="submit" class="btn btn-primary" [disabled]="savingProfile() || profile.pristine">@if (savingProfile()) { <app-spinner [size]="16" /> } Save profile</button></div>
            </form>
          </section>

          <section class="card card-pad">
            <h3 class="card-title"><app-icon name="sun" [size]="18" /> Appearance</h3>
            <p class="card-sub">Choose how the app looks on this device.</p>
            <app-segmented class="top" [options]="themes" [value]="theme.mode()" (valueChange)="setTheme($event)" />
          </section>

          <section class="card card-pad">
            <h3 class="card-title"><app-icon name="lock" [size]="18" /> Password</h3>
            <p class="card-sub">Changing it signs you out on every device.</p>
            <form [formGroup]="password" (ngSubmit)="savePassword()" novalidate class="stack top">
              <div class="form-grid">
                <div class="field"><label for="cp">Current password</label><input id="cp" class="input" type="password" formControlName="currentPassword" autocomplete="current-password" [class.invalid]="!!pwError('currentPassword')" />
                  @if (pwError('currentPassword'); as e) { <span class="field-error">{{ e }}</span> }</div>
                <div class="field"><label for="np">New password</label><input id="np" class="input" type="password" formControlName="newPassword" autocomplete="new-password" [class.invalid]="!!pwError('newPassword')" />
                  @if (pwError('newPassword'); as e) { <span class="field-error">{{ e }}</span> } @else { <span class="field-hint">8+ characters with upper, lower case and a number.</span> }</div>
              </div>
              <div class="row end"><button type="submit" class="btn btn-secondary" [disabled]="savingPassword()">@if (savingPassword()) { <app-spinner [size]="16" /> } Update password</button></div>
            </form>
          </section>

          <section class="card card-pad">
            <h3 class="card-title"><app-icon name="download" [size]="18" /> Your data</h3>
            <p class="card-sub">Download every transaction you have recorded.</p>
            <div class="row wrap top">
              <button type="button" class="btn btn-secondary" (click)="exportAll('Xlsx')" [disabled]="exporting()">@if (exporting()) { <app-spinner [size]="16" /> } @else { <app-icon name="file" [size]="16" /> } Excel</button>
              <button type="button" class="btn btn-secondary" (click)="exportAll('Csv')" [disabled]="exporting()"><app-icon name="file" [size]="16" /> CSV</button>
            </div>
          </section>

          <section class="card card-pad danger">
            <h3 class="card-title text-danger"><app-icon name="alert-triangle" [size]="18" /> Danger zone</h3>
            <p class="card-sub">Deleting your account permanently removes every account, category, budget, transaction and import. This cannot be undone.</p>
            <div class="row top"><button type="button" class="btn btn-outline-danger" (click)="openDelete()"><app-icon name="trash" [size]="16" /> Delete my account</button></div>
          </section>
        </div>
      </div>
    </div>

    <app-overlay [open]="deleteOpen()" title="Delete your account?" subtitle="This permanently erases all your data." variant="dialog" [width]="460" (closed)="closeDelete()">
      <div class="stack">
        <div class="field"><label for="dp">Your password</label><input id="dp" class="input" type="password" [value]="deletePassword()" (input)="deletePassword.set($any($event.target).value)" autocomplete="current-password" /></div>
        <div class="field"><label for="dc">Type <b>DELETE</b> to confirm</label><input id="dc" class="input" [value]="deleteText()" (input)="deleteText.set($any($event.target).value)" autocomplete="off" /></div>
        @if (deleteError(); as e) { <span class="field-error">{{ e }}</span> }
      </div>
      <ng-container footer>
        <button type="button" class="btn btn-ghost" (click)="closeDelete()">Cancel</button>
        <button type="button" class="btn btn-danger" (click)="deleteAccount()" [disabled]="!canDelete() || deleting()">@if (deleting()) { <app-spinner [size]="16" /> } Delete everything</button>
      </ng-container>
    </app-overlay>
  `,
  styles: [`
    .who { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; align-self: start; }
    .avatar.big { width: 84px; height: 84px; border-radius: 28px; font-size: 1.8rem; box-shadow: 0 20px 44px -14px var(--primary); }
    .who h2 { font-size: 1.3rem; } .meta { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin: 4px 0 10px; }
    .top { margin-top: 16px; } .end { justify-content: flex-end; }
    .danger { border-color: color-mix(in srgb, var(--danger) 35%, var(--border)); }
  `],
})
export class SettingsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly txApi = inject(TransactionsApi);
  private readonly refData = inject(ReferenceDataService);
  protected readonly theme = inject(ThemeService);

  protected readonly user = this.auth.user;
  protected readonly initials = initials;
  protected readonly tz = TIME_ZONE;
  protected readonly currencies = CURRENCY_OPTIONS;
  protected readonly themes: SegmentOption[] = [
    { value: 'dark', label: 'Dark', icon: 'moon' }, { value: 'light', label: 'Light', icon: 'sun' }, { value: 'system', label: 'System', icon: 'settings' },
  ];

  protected readonly savingProfile = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly exporting = signal(false);
  protected readonly deleting = signal(false);
  protected readonly deleteOpen = signal(false);
  protected readonly deletePassword = signal('');
  protected readonly deleteText = signal('');
  protected readonly deleteError = signal<string | null>(null);
  private readonly serverErrors = signal<Record<string, string[]>>({});

  protected readonly canDelete = computed(() => this.deletePassword().length > 0 && this.deleteText().trim() === 'DELETE');

  protected readonly profile = this.fb.nonNullable.group({
    fullName: [this.auth.user()?.fullName ?? '', [Validators.required, Validators.maxLength(100)]],
    defaultCurrency: [this.auth.user()?.defaultCurrency ?? 'INR', [Validators.required]],
  });

  protected readonly password = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(128), Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/)]],
  });

  protected setCurrency(value: string | number | null): void {
    this.profile.controls.defaultCurrency.setValue(typeof value === 'string' ? value : 'INR');
    this.profile.markAsDirty();
  }

  protected setTheme(value: string): void {
    this.theme.set(value === 'light' || value === 'system' ? (value as ThemeMode) : 'dark');
  }

  protected pwError(field: 'currentPassword' | 'newPassword'): string | null {
    const server = this.serverErrors()[field]?.[0];
    if (server) return server;
    const c = this.password.controls[field];
    if (!c.invalid || !(c.touched || c.dirty)) return null;
    return c.errors?.['required'] ? 'This is required.' : 'Use 8+ characters with upper and lower case letters and a number.';
  }

  protected saveProfile(): void {
    this.profile.markAllAsTouched();
    if (this.profile.invalid || this.savingProfile()) return;

    this.savingProfile.set(true);
    const v = this.profile.getRawValue();
    this.auth.updateProfile({ fullName: v.fullName.trim(), defaultCurrency: v.defaultCurrency }).subscribe({
      next: () => {
        this.savingProfile.set(false);
        this.profile.markAsPristine();
        this.toast.success('Profile saved.');
      },
      error: () => this.savingProfile.set(false),
    });
  }

  protected savePassword(): void {
    this.password.markAllAsTouched();
    if (this.password.invalid || this.savingPassword()) return;

    this.savingPassword.set(true);
    this.serverErrors.set({});
    this.auth.changePassword(this.password.getRawValue()).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.toast.success('Password changed. Please sign in again.');
        this.refData.clear();
        this.auth.logout();
      },
      error: (err: unknown) => {
        const e = ApiError.from(err);
        this.savingPassword.set(false);
        if (e.code === 'invalid_current_password') this.serverErrors.set({ currentPassword: ['That is not your current password.'] });
        else if (e.hasFieldErrors) this.serverErrors.set(e.errors);
      },
    });
  }

  protected exportAll(format: ExportFormat): void {
    this.exporting.set(true);
    this.txApi.export({}, format).subscribe({
      next: ({ blob, filename }) => {
        downloadBlob(blob, filename);
        this.exporting.set(false);
        this.toast.success(`Exported ${filename}`);
      },
      error: () => this.exporting.set(false),
    });
  }

  protected async signOut(): Promise<void> {
    const ok = await this.confirm.confirm({ title: 'Sign out?', message: 'You will need to sign in again to see your data.', confirmText: 'Sign out', tone: 'primary' });
    if (ok) {
      this.refData.clear();
      this.auth.logout();
    }
  }

  protected openDelete(): void {
    this.deletePassword.set('');
    this.deleteText.set('');
    this.deleteError.set(null);
    this.deleteOpen.set(true);
  }

  protected closeDelete(): void {
    if (!this.deleting()) this.deleteOpen.set(false);
  }

  protected deleteAccount(): void {
    if (!this.canDelete() || this.deleting()) return;

    this.deleting.set(true);
    this.deleteError.set(null);
    this.auth.deleteAccount(this.deletePassword()).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteOpen.set(false);
        this.refData.clear();
        this.toast.success('Your account has been deleted.');
        void this.router.navigate(['/register']);
      },
      error: (err: unknown) => {
        const e = ApiError.from(err);
        this.deleting.set(false);
        this.deleteError.set(e.code === 'invalid_password' ? 'That password is not correct.' : e.message);
      },
    });
  }
}
