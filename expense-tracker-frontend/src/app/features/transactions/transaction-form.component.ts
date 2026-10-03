import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { startWith } from 'rxjs';
import { TransactionsApi } from '../../core/api/transactions.api';
import { ApiError } from '../../core/errors/api-error';
import { TransactionDto, TransactionType } from '../../core/models/api.models';
import { ConfirmService } from '../../core/services/confirm.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import { TxFormRequest, TxFormService } from '../../core/services/tx-form.service';
import { toLocalInput } from '../../core/utils/dates';
import { ChipInputComponent, SegmentOption, SegmentedComponent } from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { OverlayComponent } from '../../shared/ui/overlay.component';
import { SelectComponent } from '../../shared/ui/select.component';
import { SpinnerComponent } from '../../shared/ui/ui-bits.component';

const LAST_ACCOUNT_KEY = 'et.lastAccount';

/** Add / edit transaction drawer (bottom sheet on phones). Opened through TxFormService. */
@Component({
  selector: 'app-transaction-form',
  imports: [ReactiveFormsModule, OverlayComponent, SelectComponent, SegmentedComponent, ChipInputComponent, IconComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-overlay [open]="open()" [title]="editing() ? 'Edit transaction' : 'New transaction'" [subtitle]="editing() ? 'Update the details below.' : 'Press Ctrl + Enter to save quickly.'"
                 variant="drawer" [width]="540" (closed)="close()">
      <form [formGroup]="form" (ngSubmit)="save(false)" (keydown.control.enter)="save(false)" novalidate class="stack" id="tx-form">
        <app-segmented class="block" [options]="types" [value]="type()" [tone]="type() === 'Income' ? 'income' : 'expense'" (valueChange)="setType($event)" />

        <div class="amount" [class.invalid]="showError('amount')">
          <span class="cur">{{ currency() }}</span>
          <input type="number" inputmode="decimal" step="0.01" min="0" formControlName="amount" placeholder="0.00" aria-label="Amount" autocomplete="off" />
        </div>
        @if (showError('amount'); as e) { <span class="field-error amount-err">{{ e }}</span> }

        <div class="form-grid">
          <div class="field">
            <label>Account</label>
            <app-select [options]="refData.accountOptions()" [value]="form.controls.accountId.value" placeholder="Choose account"
                        (valueChange)="setField('accountId', $event)" ariaLabel="Account" />
            @if (showError('accountId'); as e) { <span class="field-error">{{ e }}</span> }
          </div>

          <div class="field">
            <label>Category</label>
            <app-select [options]="categories()" [value]="form.controls.categoryId.value" placeholder="Choose category" [searchable]="true"
                        (valueChange)="setField('categoryId', $event)" ariaLabel="Category" />
            @if (showError('categoryId'); as e) { <span class="field-error">{{ e }}</span> }
          </div>

          <div class="field full">
            <label for="when">Date & time</label>
            <input id="when" class="input" type="datetime-local" formControlName="occurredAt" [class.invalid]="!!showError('occurredAt')" />
            @if (showError('occurredAt'); as e) { <span class="field-error">{{ e }}</span> }
          </div>

          <div class="field full">
            <label for="desc">Description</label>
            <input id="desc" class="input" formControlName="description" maxlength="500" placeholder="What was it for?" autocomplete="off" />
            @if (showError('description'); as e) { <span class="field-error">{{ e }}</span> }
          </div>

          <div class="field full">
            <label>Tags</label>
            <app-chip-input [tags]="tags()" (tagsChange)="tags.set($event)" />
            <span class="field-hint">Tags let you slice analytics, e.g. #trip or #work.</span>
          </div>

          <div class="field full">
            <label for="note">Note</label>
            <textarea id="note" class="textarea" formControlName="note" maxlength="2000" placeholder="Optional details"></textarea>
          </div>
        </div>
      </form>

      <ng-container footer>
        @if (editing()) {
          <button type="button" class="btn btn-outline-danger" (click)="remove()" [disabled]="saving()"><app-icon name="trash" [size]="16" /> Delete</button>
        }
        <span class="spacer"></span>
        @if (!editing()) {
          <button type="button" class="btn btn-secondary hide-mobile" (click)="save(true)" [disabled]="saving()">Save & add another</button>
        }
        <button type="submit" form="tx-form" class="btn btn-primary" [disabled]="saving()">
          @if (saving()) { <app-spinner [size]="16" /> Saving… } @else { <app-icon name="check" [size]="18" /> {{ editing() ? 'Save changes' : 'Add transaction' }} }
        </button>
      </ng-container>
    </app-overlay>
  `,
  styles: [`
    .amount { display: flex; align-items: center; gap: 10px; padding: 14px 18px; border-radius: 18px; background: var(--field); border: 1px solid var(--border); transition: border-color .2s, box-shadow .2s; }
    .amount:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }
    .amount.invalid { border-color: var(--danger); }
    .cur { color: var(--muted); font-weight: 700; font-size: 1.1rem; }
    .amount input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; color: var(--text); font-size: 2.1rem; font-weight: 800; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
    .amount input::placeholder { color: var(--faint); }
    .amount input::-webkit-outer-spin-button, .amount input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .amount input { -moz-appearance: textfield; appearance: textfield; }
    .amount-err { margin-top: -8px; }
    .block { display: block; }
  `],
})
export class TransactionFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(TransactionsApi);
  private readonly service = inject(TxFormService);
  private readonly toast = inject(ToastService);
  private readonly refresh = inject(RefreshService);
  private readonly confirm = inject(ConfirmService);
  protected readonly refData = inject(ReferenceDataService);

  protected readonly types: SegmentOption[] = [
    { value: 'Expense', label: 'Expense', icon: 'arrow-up-right' },
    { value: 'Income', label: 'Income', icon: 'arrow-down-right' },
  ];

  protected readonly request = this.service.request;
  protected readonly open = computed(() => this.request() !== null);
  protected readonly editing = computed(() => this.request()?.transaction ?? null);

  protected readonly form = this.fb.nonNullable.group({
    type: ['Expense' as TransactionType],
    amount: [null as number | null, [Validators.required, Validators.min(0.01), Validators.max(1_000_000_000_000)]],
    occurredAt: ['', [Validators.required]],
    accountId: ['', [Validators.required]],
    categoryId: ['', [Validators.required]],
    description: ['', [Validators.maxLength(500)]],
    note: ['', [Validators.maxLength(2000)]],
  });

  protected readonly tags = signal<string[]>([]);
  protected readonly saving = signal(false);
  private readonly submitted = signal(false);
  private readonly serverErrors = signal<Record<string, string[]>>({});

  protected readonly type = toSignal(this.form.controls.type.valueChanges.pipe(startWith(this.form.controls.type.value)), { initialValue: 'Expense' as TransactionType });
  private readonly accountId = toSignal(this.form.controls.accountId.valueChanges.pipe(startWith('')), { initialValue: '' });

  protected readonly categories = computed(() => this.refData.categoryOptions(this.type()));
  protected readonly currency = computed(() => this.refData.accounts().find((a) => a.id === this.accountId())?.currency ?? '');

  constructor() {
    effect(() => {
      const request = this.request();
      untracked(() => this.reset(request));
    });
  }

  protected setType(value: string): void {
    const next: TransactionType = value === 'Income' ? 'Income' : 'Expense';
    this.form.controls.type.setValue(next);

    // A category belongs to one type: drop the choice if it no longer applies.
    const category = this.refData.categoryById().get(this.form.controls.categoryId.value);
    if (category && category.type !== next) this.form.controls.categoryId.setValue('');
  }

  protected setField(name: 'accountId' | 'categoryId', value: string | number | null): void {
    this.form.controls[name].setValue(typeof value === 'string' ? value : '');
    this.form.controls[name].markAsDirty();
  }

  protected showError(name: 'amount' | 'accountId' | 'categoryId' | 'occurredAt' | 'description'): string | null {
    const server = this.serverErrors()[name]?.[0];
    if (server) return server;

    const control = this.form.controls[name];
    if (!control.invalid || !(control.touched || control.dirty || this.submitted())) return null;

    const errors = control.errors ?? {};
    if (errors['required']) {
      return { amount: 'Enter an amount.', accountId: 'Choose an account.', categoryId: 'Choose a category.', occurredAt: 'Choose a date and time.', description: '' }[name];
    }
    if (errors['min']) return 'Amount must be greater than zero.';
    if (errors['max']) return 'Amount is too large.';
    if (errors['maxlength']) return 'This is too long.';
    return 'Invalid value.';
  }

  protected close(): void {
    if (!this.saving()) this.service.close();
  }

  protected save(another: boolean): void {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const value = this.form.getRawValue();
    const occurred = new Date(value.occurredAt);
    if (Number.isNaN(occurred.getTime())) {
      this.form.controls.occurredAt.setErrors({ required: true });
      return;
    }

    const payload = {
      accountId: value.accountId,
      categoryId: value.categoryId,
      type: value.type,
      amount: Math.round((value.amount ?? 0) * 100) / 100,
      occurredAt: occurred.toISOString(),
      description: value.description.trim() || null,
      note: value.note.trim() || null,
      tags: this.tags(),
    };

    this.saving.set(true);
    this.serverErrors.set({});
    const existing = this.editing();
    const call$ = existing ? this.api.update(existing.id, { ...payload, version: existing.version }) : this.api.create(payload);

    call$.subscribe({
      next: () => {
        this.saving.set(false);
        this.remember(value.accountId);
        this.toast.success(existing ? 'Transaction updated.' : 'Transaction added.');
        this.afterChange();

        if (another && !existing) {
          this.reset({ transaction: null, type: value.type });
          this.form.controls.accountId.setValue(value.accountId);
        } else {
          this.service.close();
        }
      },
      error: (err: unknown) => {
        const apiError = ApiError.from(err);
        this.saving.set(false);
        if (apiError.hasFieldErrors) this.serverErrors.set(apiError.errors);
        if (apiError.code === 'concurrency_conflict') this.afterChange();
      },
    });
  }

  protected async remove(): Promise<void> {
    const tx = this.editing();
    if (!tx) return;

    const ok = await this.confirm.confirm({
      title: 'Delete this transaction?',
      message: `${tx.description || tx.categoryName} will be removed from your records and analytics.`,
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    this.saving.set(true);
    this.api.delete(tx.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success('Transaction deleted.');
        this.afterChange();
        this.service.close();
      },
      error: () => this.saving.set(false),
    });
  }

  private afterChange(): void {
    this.refresh.bump();
    this.refData.load().subscribe();
  }

  private reset(request: TxFormRequest | null): void {
    this.submitted.set(false);
    this.serverErrors.set({});
    if (!request) return;

    const tx: TransactionDto | null = request.transaction;
    if (tx) {
      this.form.reset({
        type: tx.type,
        amount: tx.amount,
        occurredAt: toLocalInput(new Date(tx.occurredAt)),
        accountId: tx.accountId,
        categoryId: tx.categoryId,
        description: tx.description ?? '',
        note: tx.note ?? '',
      });
      this.tags.set([...tx.tags]);
    } else {
      this.form.reset({
        type: request.type ?? 'Expense',
        amount: null,
        occurredAt: toLocalInput(new Date()),
        accountId: this.defaultAccount(),
        categoryId: '',
        description: '',
        note: '',
      });
      this.tags.set([]);
    }
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  private defaultAccount(): string {
    const accounts = this.refData.activeAccounts();
    try {
      const last = localStorage.getItem(LAST_ACCOUNT_KEY);
      if (last && accounts.some((a) => a.id === last)) return last;
    } catch {
      /* fall back to the first account */
    }
    return accounts[0]?.id ?? '';
  }

  private remember(accountId: string): void {
    try {
      localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
    } catch {
      /* preference not persisted */
    }
  }
}
