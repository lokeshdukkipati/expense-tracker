import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, startWith } from 'rxjs';
import { TransactionsApi } from '../../core/api/transactions.api';
import { TransfersApi } from '../../core/api/transfers.api';
import { ApiError } from '../../core/errors/api-error';
import { TransactionDto, TransactionType } from '../../core/models/api.models';
import { ConfirmService } from '../../core/services/confirm.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import {
  TxFormRequest,
  TxFormService,
  TxFormType,
} from '../../core/services/tx-form.service';
import { toLocalInput } from '../../core/utils/dates';
import { ChipInputComponent, SegmentOption, SegmentedComponent } from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { OverlayComponent } from '../../shared/ui/overlay.component';
import { SelectComponent } from '../../shared/ui/select.component';
import { SpinnerComponent } from '../../shared/ui/ui-bits.component';

const LAST_ACCOUNT_KEY = 'et.lastAccount';

/** The fields a transfer needs from the form. */
interface TransferFormValue {
  accountId: string;
  toAccountId: string;
  amount: number | null;
  occurredAt: string;
  description: string;
  note: string;
  fee: number | null;
  feeCategoryId: string;
}

/** Add / edit transaction drawer (bottom sheet on phones). Opened through TxFormService. */
@Component({
  selector: 'app-transaction-form',
  imports: [
    ReactiveFormsModule,
    OverlayComponent,
    SelectComponent,
    SegmentedComponent,
    ChipInputComponent,
    IconComponent,
    SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-overlay
      [open]="open()"
      [title]="title()"
      [subtitle]="subtitle()"
      variant="drawer"
      [width]="540"
      (closed)="close()"
    >
      @if (converting()) {
        <div class="stack convert">
          <div class="field">
            <label>{{ convertLabel() }}</label>
            <app-select
              [options]="otherAccountOptions()"
              [value]="otherAccountId()"
              placeholder="Choose account"
              (valueChange)="setOther($event)"
              ariaLabel="Other account"
            />
            @if (otherAccountOptions().length === 0) {
              <span class="field-error"
                >You need another account in the same currency.</span
              >
            }
          </div>
          <p>
            The amount, date and notes stay as they are. The category is
            removed, because moving money between your own accounts is not
            spending or income.
          </p>
        </div>
      } @else {
        <form
          [formGroup]="form"
          (ngSubmit)="save(false)"
          (keydown.control.enter)="save(false)"
          novalidate
          class="stack"
          id="tx-form"
        >
          @if (!editingTransfer()) {
            <app-segmented
              class="block"
              [options]="types()"
              [value]="type()"
              [tone]="tone()"
              (valueChange)="setType($event)"
            />
          }

          <div class="amount" [class.invalid]="showError('amount')">
            <span class="cur">{{ currency() }}</span>
            <input
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0"
              formControlName="amount"
              placeholder="0.00"
              aria-label="Amount"
              autocomplete="off"
            />
          </div>
          @if (showError('amount'); as e) {
            <span class="field-error amount-err">{{ e }}</span>
          }

          <div class="form-grid">
            <div class="field">
              <label>{{ isTransfer() ? 'From account' : 'Account' }}</label>
              <app-select
                [options]="refData.accountOptions()"
                [value]="form.controls.accountId.value"
                placeholder="Choose account"
                (valueChange)="setField('accountId', $event)"
                [ariaLabel]="isTransfer() ? 'From account' : 'Account'"
              />
              @if (showError('accountId'); as e) {
                <span class="field-error">{{ e }}</span>
              }
            </div>

            @if (isTransfer()) {
              <div class="field">
                <label>To account</label>
                <app-select
                  [options]="toAccountOptions()"
                  [value]="form.controls.toAccountId.value"
                  placeholder="Choose account"
                  (valueChange)="setField('toAccountId', $event)"
                  ariaLabel="To account"
                />
                @if (showError('toAccountId'); as e) {
                  <span class="field-error">{{ e }}</span>
                }
                @if (currencyMismatch()) {
                  <span class="field-error"
                    >Transfers between accounts in different currencies aren't
                    supported.</span
                  >
                }
              </div>

              @if (!editingTransfer()) {
                <div class="field full fee">
                  <label for="fee"
                    >Fee
                    <small>(optional, for example an ATM charge)</small></label
                  >
                  <input
                    id="fee"
                    class="input"
                    type="number"
                    inputmode="decimal"
                    step="0.01"
                    min="0"
                    formControlName="fee"
                    placeholder="0.00"
                    autocomplete="off"
                  />
                  @if (showError('fee'); as e) {
                    <span class="field-error">{{ e }}</span>
                  }
                  @if (feeFilled()) {
                    <app-select
                      [options]="feeCategories()"
                      [value]="form.controls.feeCategoryId.value"
                      placeholder="Fee category (optional)"
                      [searchable]="true"
                      (valueChange)="setField('feeCategoryId', $event)"
                      ariaLabel="Fee category"
                    />
                    <span class="field-hint"
                      >The fee is recorded as a separate expense on the source
                      account.</span
                    >
                  }
                </div>
              }
            } @else {
              <div class="field">
                <label>Category</label>
                <app-select
                  [options]="categories()"
                  [value]="form.controls.categoryId.value"
                  placeholder="Choose category"
                  [searchable]="true"
                  (valueChange)="setField('categoryId', $event)"
                  ariaLabel="Category"
                />
                @if (showError('categoryId'); as e) {
                  <span class="field-error">{{ e }}</span>
                }
              </div>
            }

            <div class="field full">
              <label for="when">Date & time</label>
              <input
                id="when"
                class="input"
                type="datetime-local"
                formControlName="occurredAt"
                [class.invalid]="!!showError('occurredAt')"
              />
              @if (showError('occurredAt'); as e) {
                <span class="field-error">{{ e }}</span>
              }
            </div>

            <div class="field full">
              <label for="desc">Description</label>
              <input
                id="desc"
                class="input"
                formControlName="description"
                maxlength="500"
                placeholder="What was it for?"
                autocomplete="off"
              />
              @if (showError('description'); as e) {
                <span class="field-error">{{ e }}</span>
              }
            </div>

            <div class="field full">
              <label>Tags</label>
              <app-chip-input [tags]="tags()" (tagsChange)="tags.set($event)" />
              <span class="field-hint"
                >Tags let you slice analytics, e.g. #trip or #work.</span
              >
            </div>

            <div class="field full">
              <label for="note">Note</label>
              <textarea
                id="note"
                class="textarea"
                formControlName="note"
                maxlength="2000"
                placeholder="Optional details"
              ></textarea>
            </div>
          </div>
        </form>
      }

      <ng-container footer>
        @if (converting()) {
          <button
            type="button"
            class="btn btn-ghost"
            (click)="converting.set(false)"
            [disabled]="saving()"
          >
            Back
          </button>
          <span class="spacer"></span>
          <button
            type="button"
            class="btn btn-primary"
            (click)="convert()"
            [disabled]="saving() || !otherAccountId()"
          >
            @if (saving()) {
              <app-spinner [size]="16" /> Converting…
            } @else {
              <app-icon name="swap" [size]="18" /> Convert to transfer
            }
          </button>
        } @else {
          @if (editing()) {
            <button
              type="button"
              class="btn btn-outline-danger"
              (click)="remove()"
              [disabled]="saving()"
            >
              <app-icon name="trash" [size]="16" /> Delete
            </button>
          }
          @if (canConvert()) {
            <button
              type="button"
              class="btn btn-ghost"
              (click)="startConvert()"
              [disabled]="saving()"
            >
              <app-icon name="swap" [size]="16" /> Make it a transfer
            </button>
          }
          <span class="spacer"></span>
          @if (!editing()) {
            <button
              type="button"
              class="btn btn-secondary hide-mobile"
              (click)="save(true)"
              [disabled]="saving()"
            >
              Save & add another
            </button>
          }
          <button
            type="submit"
            form="tx-form"
            class="btn btn-primary"
            [disabled]="saving() || loadingTransfer()"
          >
            @if (saving()) {
              <app-spinner [size]="16" /> Saving…
            } @else {
              <app-icon name="check" [size]="18" /> {{ submitLabel() }}
            }
          </button>
        }
      </ng-container>
    </app-overlay>
  `,
  styles: [
    `
      .amount {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 18px;
        border-radius: 18px;
        background: var(--field);
        border: 1px solid var(--border);
        transition:
          border-color 0.2s,
          box-shadow 0.2s;
      }
      .amount:focus-within {
        border-color: var(--primary);
        box-shadow: 0 0 0 3px var(--ring);
      }
      .amount.invalid {
        border-color: var(--danger);
      }
      .cur {
        color: var(--muted);
        font-weight: 700;
        font-size: 1.1rem;
      }
      .amount input {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: 0;
        background: none;
        color: var(--text);
        font-size: 2.1rem;
        font-weight: 800;
        letter-spacing: -0.03em;
        font-variant-numeric: tabular-nums;
      }
      .amount input::placeholder {
        color: var(--faint);
      }
      .amount input::-webkit-outer-spin-button,
      .amount input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .amount input {
        -moz-appearance: textfield;
        appearance: textfield;
      }
      .amount-err {
        margin-top: -8px;
      }
      .block {
        display: block;
      }
      .convert p {
        margin: 0;
        color: var(--muted);
        line-height: 1.5;
      }
      .fee small {
        color: var(--faint);
        font-weight: 400;
      }
    `,
  ],
})
export class TransactionFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(TransactionsApi);
  private readonly transfers = inject(TransfersApi);
  private readonly service = inject(TxFormService);
  private readonly toast = inject(ToastService);
  private readonly refresh = inject(RefreshService);
  private readonly confirm = inject(ConfirmService);
  protected readonly refData = inject(ReferenceDataService);

  private readonly baseTypes: SegmentOption[] = [
    { value: 'Expense', label: 'Expense', icon: 'arrow-up-right' },
    { value: 'Income', label: 'Income', icon: 'arrow-down-right' },
  ];
  private readonly allTypes: SegmentOption[] = [
    ...this.baseTypes,
    { value: 'Transfer', label: 'Transfer', icon: 'swap' },
  ];

  /** An existing entry becomes a transfer through "Make it a transfer", so only new entries offer the Transfer tab. */
  protected readonly types = computed(() =>
    this.editing() ? this.baseTypes : this.allTypes,
  );

  protected readonly request = this.service.request;
  protected readonly open = computed(() => this.request() !== null);
  protected readonly editing = computed(
    () => this.request()?.transaction ?? null,
  );

  /** True while the entry being edited is one side of a transfer: the whole transfer is edited together. */
  protected readonly editingTransfer = computed(
    () => this.editing()?.transferGroupId != null,
  );
  protected readonly converting = signal(false);
  protected readonly otherAccountId = signal('');
  protected readonly loadingTransfer = signal(false);
  private transferGroupId: string | null = null;
  private transferVersion = 0;

  protected readonly form = this.fb.nonNullable.group({
    type: ['Expense' as TxFormType],
    amount: [
      null as number | null,
      [
        Validators.required,
        Validators.min(0.01),
        Validators.max(1_000_000_000_000),
      ],
    ],
    occurredAt: ['', [Validators.required]],
    accountId: ['', [Validators.required]],
    toAccountId: [''],
    categoryId: ['', [Validators.required]],
    description: ['', [Validators.maxLength(500)]],
    note: ['', [Validators.maxLength(2000)]],
    fee: [
      null as number | null,
      [Validators.min(0.01), Validators.max(1_000_000_000_000)],
    ],
    feeCategoryId: [''],
  });

  protected readonly tags = signal<string[]>([]);
  protected readonly saving = signal(false);
  private readonly submitted = signal(false);
  private readonly serverErrors = signal<Record<string, string[]>>({});

  protected readonly type = toSignal(
    this.form.controls.type.valueChanges.pipe(
      startWith(this.form.controls.type.value),
    ),
    { initialValue: 'Expense' as TxFormType },
  );
  private readonly accountId = toSignal(
    this.form.controls.accountId.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );
  private readonly toAccountId = toSignal(
    this.form.controls.toAccountId.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );
  private readonly feeValue = toSignal(
    this.form.controls.fee.valueChanges.pipe(startWith(null as number | null)),
    { initialValue: null as number | null },
  );

  protected readonly isTransfer = computed(() => this.type() === 'Transfer');
  protected readonly tone = computed<'' | 'income' | 'expense'>(() =>
    this.type() === 'Income'
      ? 'income'
      : this.type() === 'Expense'
        ? 'expense'
        : '',
  );
  protected readonly categories = computed(() =>
    this.refData.categoryOptions(
      this.type() === 'Income'
        ? 'Income'
        : this.type() === 'Expense'
          ? 'Expense'
          : undefined,
    ),
  );
  protected readonly feeCategories = computed(() =>
    this.refData.categoryOptions('Expense'),
  );
  protected readonly currency = computed(
    () =>
      this.refData.accounts().find((a) => a.id === this.accountId())
        ?.currency ?? '',
  );
  protected readonly toAccountOptions = computed(() =>
    this.refData.accountOptions().filter((o) => o.value !== this.accountId()),
  );
  protected readonly feeFilled = computed(() => (this.feeValue() ?? 0) > 0);

  protected readonly currencyMismatch = computed(() => {
    const accounts = this.refData.accounts();
    const from = accounts.find((a) => a.id === this.accountId());
    const to = accounts.find((a) => a.id === this.toAccountId());
    return !!from && !!to && from.currency !== to.currency;
  });

  protected readonly title = computed(() => {
    if (this.converting()) return 'Make it a transfer';
    if (this.editing())
      return this.isTransfer() ? 'Edit transfer' : 'Edit transaction';
    return this.isTransfer() ? 'New transfer' : 'New transaction';
  });
  protected readonly subtitle = computed(() => {
    if (this.converting())
      return 'Money moved between your own accounts is not spending or income.';
    if (this.isTransfer())
      return 'Move money between your own accounts, such as an ATM withdrawal.';
    return this.editing()
      ? 'Update the details below.'
      : 'Press Ctrl + Enter to save quickly.';
  });
  protected readonly submitLabel = computed(() => {
    const edit = !!this.editing();
    if (this.isTransfer()) return edit ? 'Save transfer' : 'Add transfer';
    return edit ? 'Save changes' : 'Add transaction';
  });

  protected readonly canConvert = computed(() => {
    const tx = this.editing();
    return (
      !!tx &&
      tx.transferGroupId == null &&
      this.refData.activeAccounts().length > 1
    );
  });
  protected readonly convertLabel = computed(() =>
    this.editing()?.type === 'Income'
      ? 'Which account did this money come from?'
      : 'Which account did this money go to?',
  );
  protected readonly otherAccountOptions = computed(() => {
    const tx = this.editing();
    if (!tx) return [];
    return this.refData
      .activeAccounts()
      .filter((a) => a.id !== tx.accountId && a.currency === tx.currency)
      .map((a) => ({ value: a.id, label: a.name, hint: a.currency }));
  });

  constructor() {
    effect(() => {
      const request = this.request();
      untracked(() => this.reset(request));
    });
  }

  protected setType(value: string): void {
    const next: TxFormType =
      value === 'Income'
        ? 'Income'
        : value === 'Transfer'
          ? 'Transfer'
          : 'Expense';
    this.form.controls.type.setValue(next);
    this.applyTypeRules(next);

    // A category belongs to one type: drop the choice if it no longer applies.
    const category = this.refData
      .categoryById()
      .get(this.form.controls.categoryId.value);
    if (category && category.type !== next)
      this.form.controls.categoryId.setValue('');
  }

  protected setField(
    name: 'accountId' | 'toAccountId' | 'categoryId' | 'feeCategoryId',
    value: string | number | null,
  ): void {
    this.form.controls[name].setValue(typeof value === 'string' ? value : '');
    this.form.controls[name].markAsDirty();
  }

  protected showError(
    name:
      | 'amount'
      | 'accountId'
      | 'toAccountId'
      | 'categoryId'
      | 'occurredAt'
      | 'description'
      | 'fee',
  ): string | null {
    const server = this.serverErrors()[name]?.[0];
    if (server) return server;

    const control = this.form.controls[name];
    if (
      !control.invalid ||
      !(control.touched || control.dirty || this.submitted())
    )
      return null;

    const errors = control.errors ?? {};
    if (errors['required']) {
      return {
        amount: 'Enter an amount.',
        accountId: 'Choose an account.',
        toAccountId: 'Choose the destination account.',
        categoryId: 'Choose a category.',
        occurredAt: 'Choose a date and time.',
        description: '',
        fee: '',
      }[name];
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

    if (value.type === 'Transfer') {
      this.saveTransfer(value, occurred, another);
      return;
    }

    const payload = {
      accountId: value.accountId,
      categoryId: value.categoryId,
      type:
        value.type === 'Income' ? ('Income' as const) : ('Expense' as const),
      amount: Math.round((value.amount ?? 0) * 100) / 100,
      occurredAt: occurred.toISOString(),
      description: value.description.trim() || null,
      note: value.note.trim() || null,
      tags: this.tags(),
    };

    this.saving.set(true);
    this.serverErrors.set({});
    const existing = this.editing();
    const call$ = existing
      ? this.api.update(existing.id, { ...payload, version: existing.version })
      : this.api.create(payload);

    call$.subscribe({
      next: () => {
        this.saving.set(false);
        this.remember(value.accountId);
        this.toast.success(
          existing ? 'Transaction updated.' : 'Transaction added.',
        );
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

    const isTransfer = tx.transferGroupId != null;
    const ok = await this.confirm.confirm({
      title: isTransfer ? 'Delete this transfer?' : 'Delete this transaction?',
      message: isTransfer
        ? 'Both sides of the transfer will be removed, so the balances of both accounts change.'
        : `${tx.description || tx.categoryName} will be removed from your records and analytics.`,
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
    this.converting.set(false);
    this.otherAccountId.set('');
    this.loadingTransfer.set(false);
    this.transferGroupId = null;
    this.applyTypeRules(request?.type === 'Transfer' ? 'Transfer' : 'Expense');
    if (!request) return;

    if (request.transaction?.transferGroupId) {
      this.resetForTransferLeg(
        request.transaction,
        request.transaction.transferGroupId,
      );
      return;
    }

    const tx: TransactionDto | null = request.transaction;
    if (tx) {
      this.form.reset({
        type: tx.type === 'Income' ? 'Income' : 'Expense',
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
        accountId: request.prefill?.fromAccountId ?? this.defaultAccount(),
        toAccountId: request.prefill?.toAccountId ?? '',
        categoryId: '',
        description: '',
        note: '',
      });
      this.tags.set([]);
    }
    this.form.markAsPristine();
    this.form.markAsUntouched();
  }

  protected startConvert(): void {
    this.otherAccountId.set('');
    this.converting.set(true);
  }

  protected setOther(value: string | number | null): void {
    this.otherAccountId.set(typeof value === 'string' ? value : '');
  }

  /** Turns the entry being edited into a transfer to or from the chosen account. */
  protected convert(): void {
    const tx = this.editing();
    const other = this.otherAccountId();
    if (!tx || !other || this.saving()) return;

    this.saving.set(true);
    this.transfers
      .convert(tx.id, { otherAccountId: other, version: tx.version })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.toast.success('Converted to a transfer.');
          this.afterChange();
          this.service.close();
        },
        error: (err: unknown) => {
          this.saving.set(false);
          if (ApiError.from(err).code === 'concurrency_conflict')
            this.afterChange();
        },
      });
  }

  private saveTransfer(
    value: TransferFormValue,
    occurred: Date,
    another: boolean,
  ): void {
    if (this.currencyMismatch()) return;

    const feeAmount =
      value.fee && value.fee > 0 ? Math.round(value.fee * 100) / 100 : null;
    const base = {
      fromAccountId: value.accountId,
      toAccountId: value.toAccountId,
      amount: Math.round((value.amount ?? 0) * 100) / 100,
      occurredAt: occurred.toISOString(),
      description: value.description.trim() || null,
      note: value.note.trim() || null,
      tags: this.tags(),
    };

    this.saving.set(true);
    this.serverErrors.set({});
    const existing = this.editing();
    const groupId = this.transferGroupId;
    const call$: Observable<unknown> =
      existing && groupId
        ? this.transfers.update(groupId, {
            ...base,
            version: this.transferVersion,
          })
        : this.transfers.create({
            ...base,
            fee: feeAmount,
            feeCategoryId: feeAmount ? value.feeCategoryId || null : null,
          });

    call$.subscribe({
      next: () => {
        this.saving.set(false);
        this.remember(value.accountId);
        this.toast.success(existing ? 'Transfer updated.' : 'Transfer added.');
        this.afterChange();

        if (another && !existing) {
          this.reset({ transaction: null, type: 'Transfer' });
          this.form.controls.accountId.setValue(value.accountId);
        } else {
          this.service.close();
        }
      },
      error: (err: unknown) => {
        const apiError = ApiError.from(err);
        this.saving.set(false);
        if (apiError.hasFieldErrors) {
          const errors = { ...apiError.errors };
          if (errors['fromAccountId'])
            errors['accountId'] = errors['fromAccountId'];
          this.serverErrors.set(errors);
        }
        if (apiError.code === 'concurrency_conflict') this.afterChange();
      },
    });
  }

  /** A category is required for income and expenses; a destination account is required for transfers. */
  private applyTypeRules(type: TxFormType): void {
    const { categoryId, toAccountId } = this.form.controls;
    if (type === 'Transfer') {
      categoryId.clearValidators();
      toAccountId.setValidators([Validators.required]);
    } else {
      categoryId.setValidators([Validators.required]);
      toAccountId.clearValidators();
    }
    categoryId.updateValueAndValidity({ emitEvent: false });
    toAccountId.updateValueAndValidity({ emitEvent: false });
  }

  /** Opens one side of a transfer: the form shows the whole transfer and saves both sides together. */
  private resetForTransferLeg(tx: TransactionDto, groupId: string): void {
    const isOut = tx.type === 'TransferOut';
    this.form.reset({
      type: 'Transfer',
      amount: tx.amount,
      occurredAt: toLocalInput(new Date(tx.occurredAt)),
      accountId: isOut ? tx.accountId : (tx.transferAccountId ?? ''),
      toAccountId: isOut ? (tx.transferAccountId ?? '') : tx.accountId,
      categoryId: '',
      description: tx.description ?? '',
      note: tx.note ?? '',
      fee: null,
      feeCategoryId: '',
    });
    this.tags.set([...tx.tags]);
    this.applyTypeRules('Transfer');
    this.form.markAsPristine();
    this.form.markAsUntouched();

    // The transfer's own version (needed to save it) comes from the server.
    this.transferGroupId = groupId;
    this.loadingTransfer.set(true);
    this.transfers.get(groupId).subscribe({
      next: (transfer) => {
        if (this.transferGroupId !== groupId) return; // another form was opened in the meantime
        this.transferVersion = transfer.version;
        this.loadingTransfer.set(false);
      },
      error: () => this.service.close(),
    });
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
