import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AccountsApi } from '../../core/api/accounts.api';
import { ApiError } from '../../core/errors/api-error';
import { AccountDto, AccountType } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import { CURRENCY_OPTIONS } from '../../core/utils/currencies';
import { TableState, compareNumber, compareText } from '../../core/utils/table-state';
import { SearchBoxComponent, SortHeaderComponent } from '../../shared/ui/form-controls.component';
import { IconComponent, IconName } from '../../shared/ui/icon.component';
import { MoneyComponent, MoneyPipe } from '../../shared/ui/money.component';
import { OverlayComponent } from '../../shared/ui/overlay.component';
import { PaginatorComponent } from '../../shared/ui/paginator.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select.component';
import { EmptyStateComponent, SkeletonComponent, SpinnerComponent } from '../../shared/ui/ui-bits.component';

const TYPE_OPTIONS: SelectOption[] = ['Cash', 'Bank', 'Card', 'Wallet', 'Investment', 'Other'].map((t) => ({ value: t, label: t }));
const TYPE_ICONS: Record<AccountType, IconName> = { Cash: 'wallet', Bank: 'folder', Card: 'credit-card', Wallet: 'wallet', Investment: 'trending-up', Other: 'layers' };

@Component({
  selector: 'app-accounts',
  imports: [
    ReactiveFormsModule, IconComponent, MoneyComponent, MoneyPipe, SearchBoxComponent, SortHeaderComponent, PaginatorComponent, OverlayComponent, SelectComponent,
    EmptyStateComponent, SkeletonComponent, SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Accounts</h1><p>Wallets, bank accounts and cards. Balances update as you add transactions.</p></div>
        <div class="head-actions"><button type="button" class="btn btn-primary" (click)="openNew()"><app-icon name="plus" [size]="18" /> New account</button></div>
      </div>

      @if (!refData.loaded()) {
        <div class="auto-grid"><app-skeleton height="140px" radius="20px" /><app-skeleton height="140px" radius="20px" /><app-skeleton height="140px" radius="20px" /></div>
      } @else if (refData.accounts().length === 0) {
        <section class="card card-pad">
          <app-empty-state icon="wallet" title="No accounts yet" message="Create an account to start tracking balances. Importing a file creates the accounts it contains automatically.">
            <button type="button" class="btn btn-primary" (click)="openNew()"><app-icon name="plus" [size]="18" /> Create your first account</button>
          </app-empty-state>
        </section>
      } @else {
        <section class="card card-pad hero">
          <div><span class="muted">Total balance</span><strong class="big"><app-money [value]="total()" /></strong>
            <small class="muted">across {{ active().length }} active account{{ active().length === 1 ? '' : 's' }}@if (mixedCurrency()) { · mixed currencies are added without conversion }</small></div>
          <div class="chips">
            @for (a of active().slice(0, 4); track a.id) { <span class="chip"><app-icon [name]="icon(a.type)" [size]="14" /> {{ a.name }} · {{ a.currentBalance | money: 'compact' : a.currency }}</span> }
          </div>
        </section>

        <div class="auto-grid cardgrid">
          @for (a of active(); track a.id; let i = $index) {
            <article class="card card-pad acct hover" [style.--i]="i" (click)="openEdit(a)" tabindex="0" (keydown.enter)="openEdit(a)">
              <div class="row"><span class="icon-tile"><app-icon [name]="icon(a.type)" /></span><div class="grow"><strong>{{ a.name }}</strong><small>{{ a.type }} · {{ a.currency }}</small></div>
                <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Edit account" (click)="$event.stopPropagation(); openEdit(a)"><app-icon name="edit" [size]="15" /></button></div>
              <strong class="bal" [class.text-danger]="a.currentBalance < 0"><app-money [value]="a.currentBalance" [currency]="a.currency" /></strong>
              <small class="muted">Opened with {{ a.openingBalance | money: '' : a.currency }}</small>
            </article>
          }
        </div>

        <section class="card card-pad list">
          <div class="card-head">
            <div><h3 class="card-title"><app-icon name="list" [size]="18" /> All accounts</h3><p class="card-sub">Including archived</p></div>
            <app-search-box class="srch" [value]="table.search()" (valueChange)="table.setSearch($event)" placeholder="Search accounts" />
          </div>

          @if (table.total() === 0) {
            <app-empty-state icon="search" title="No accounts match" message="Try a different search.">
              <button type="button" class="btn btn-secondary btn-sm" (click)="table.setSearch('')">Clear search</button>
            </app-empty-state>
          } @else {
            <div class="table-wrap">
              <table class="table">
                <thead><tr>
                  <th><app-sort-header label="Account" key="name" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="hide-mobile"><app-sort-header label="Type" key="type" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="right"><app-sort-header label="Balance" key="balance" align="right" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="hide-mobile">Status</th><th style="width: 90px"></th>
                </tr></thead>
                <tbody>
                  @for (a of table.pageItems(); track a.id; let i = $index) {
                    <tr class="clickable" [style.--i]="i" (click)="openEdit(a)">
                      <td><div class="cell-main"><strong>{{ a.name }}</strong><small>{{ a.currency }}</small></div></td>
                      <td class="hide-mobile">{{ a.type }}</td>
                      <td class="right num" [class.text-danger]="a.currentBalance < 0">{{ a.currentBalance | money: '' : a.currency }}</td>
                      <td class="hide-mobile">@if (a.isArchived) { <span class="badge">Archived</span> } @else { <span class="badge success">Active</span> }</td>
                      <td class="right"><span class="row-actions">
                        <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Edit" (click)="$event.stopPropagation(); openEdit(a)"><app-icon name="edit" [size]="15" /></button>
                        <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Delete" (click)="$event.stopPropagation(); remove(a)"><app-icon name="trash" [size]="15" /></button>
                      </span></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <app-paginator [total]="table.total()" [page]="table.currentPage()" [pageSize]="table.pageSize()" (pageChange)="table.setPage($event)" (pageSizeChange)="table.setPageSize($event)" />
          }
        </section>
      }
    </div>

    <app-overlay [open]="formOpen()" [title]="editing() ? 'Edit account' : 'New account'" [subtitle]="editing() ? 'Changes apply immediately.' : 'Track a wallet, bank account or card.'" variant="dialog" [width]="480" (closed)="closeForm()">
      <form [formGroup]="form" (ngSubmit)="save()" novalidate class="stack" id="acct-form">
        <div class="field"><label for="an">Name</label>
          <input id="an" class="input" formControlName="name" maxlength="100" placeholder="e.g. HDFC Savings" [class.invalid]="!!err('name')" />
          @if (err('name'); as e) { <span class="field-error">{{ e }}</span> }</div>
        <div class="form-grid">
          <div class="field"><label>Type</label><app-select [options]="types" [value]="form.controls.type.value" (valueChange)="setType($event)" ariaLabel="Account type" /></div>
          <div class="field"><label>Currency</label>
            <app-select [options]="currencies" [value]="form.controls.currency.value" [searchable]="true" [disabled]="!!editing()" (valueChange)="setCurrency($event)" ariaLabel="Currency" />
            @if (editing()) { <span class="field-hint">Currency can't change after creation.</span> }</div>
        </div>
        <div class="field"><label for="ob">Opening balance</label>
          <input id="ob" class="input" type="number" inputmode="decimal" step="0.01" formControlName="openingBalance" [class.invalid]="!!err('openingBalance')" />
          @if (err('openingBalance'); as e) { <span class="field-error">{{ e }}</span> }</div>
        @if (editing()) {
          <label class="check"><input type="checkbox" class="checkbox" [checked]="form.controls.isArchived.value" (change)="form.controls.isArchived.setValue(!form.controls.isArchived.value)" />
            <span>Archive this account <small>Hidden from pickers; history is kept.</small></span></label>
        }
      </form>
      <ng-container footer>
        <button type="button" class="btn btn-ghost" (click)="closeForm()">Cancel</button>
        <button type="submit" form="acct-form" class="btn btn-primary" [disabled]="saving()">@if (saving()) { <app-spinner [size]="16" /> } {{ editing() ? 'Save changes' : 'Create account' }}</button>
      </ng-container>
    </app-overlay>
  `,
  styles: [`
    .hero { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: center; margin-bottom: 16px; }
    .hero > div:first-child { display: flex; flex-direction: column; gap: 2px; }
    .big { font-size: clamp(1.8rem, 4vw, 2.6rem); font-weight: 850; letter-spacing: -.03em; background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .cardgrid { margin-bottom: 16px; }
    .acct { display: flex; flex-direction: column; gap: 10px; cursor: pointer; animation: fadeUp .45s both; animation-delay: calc(var(--i) * 50ms); }
    .acct .row { align-items: center; }
    .acct .grow { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .acct small { color: var(--faint); }
    .bal { font-size: 1.6rem; font-weight: 800; letter-spacing: -.02em; }
    .srch { min-width: min(280px, 100%); }
    .check { display: flex; gap: 12px; align-items: flex-start; cursor: pointer; }
    .check span { display: flex; flex-direction: column; font-weight: 600; }
    .check small { color: var(--faint); font-weight: 400; }
  `],
})
export class AccountsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(AccountsApi);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly refresh = inject(RefreshService);
  protected readonly refData = inject(ReferenceDataService);

  protected readonly types = TYPE_OPTIONS;
  protected readonly currencies = CURRENCY_OPTIONS;
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<AccountDto | null>(null);
  protected readonly saving = signal(false);
  private readonly serverErrors = signal<Record<string, string[]>>({});

  protected readonly active = computed(() => this.refData.accounts().filter((a) => !a.isArchived));
  protected readonly total = computed(() => this.active().reduce((s, a) => s + a.currentBalance, 0));
  protected readonly mixedCurrency = computed(() => new Set(this.active().map((a) => a.currency)).size > 1);

  protected readonly table = new TableState<AccountDto>(() => this.refData.accounts(), {
    searchText: (a) => `${a.name} ${a.type} ${a.currency}`,
    comparers: {
      name: (a, b) => compareText(a.name, b.name),
      type: (a, b) => compareText(a.type, b.type),
      balance: (a, b) => compareNumber(a.currentBalance, b.currentBalance),
    },
    defaultSort: { key: 'name', dir: 'asc' },
    storageKey: 'accounts',
  });

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    type: ['Bank' as AccountType],
    currency: [this.auth.currency(), [Validators.required]],
    openingBalance: [0, [Validators.required, Validators.min(-1_000_000_000_000), Validators.max(1_000_000_000_000)]],
    isArchived: [false],
  });

  protected icon(type: AccountType): IconName {
    return TYPE_ICONS[type];
  }

  protected setType(value: string | number | null): void {
    this.form.controls.type.setValue((typeof value === 'string' ? value : 'Bank') as AccountType);
  }

  protected setCurrency(value: string | number | null): void {
    this.form.controls.currency.setValue(typeof value === 'string' ? value : this.auth.currency());
  }

  protected err(field: 'name' | 'openingBalance'): string | null {
    const server = this.serverErrors()[field]?.[0];
    if (server) return server;
    const c = this.form.controls[field];
    if (!c.invalid || !(c.touched || c.dirty)) return null;
    if (c.errors?.['required']) return field === 'name' ? 'Enter a name.' : 'Enter a number.';
    return field === 'name' ? 'Name is too long.' : 'That amount is out of range.';
  }

  protected openNew(): void {
    this.editing.set(null);
    this.serverErrors.set({});
    this.form.reset({ name: '', type: 'Bank', currency: this.auth.currency(), openingBalance: 0, isArchived: false });
    this.formOpen.set(true);
  }

  protected openEdit(account: AccountDto): void {
    this.editing.set(account);
    this.serverErrors.set({});
    this.form.reset({ name: account.name, type: account.type, currency: account.currency, openingBalance: account.openingBalance, isArchived: account.isArchived });
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    if (!this.saving()) this.formOpen.set(false);
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const v = this.form.getRawValue();
    const existing = this.editing();
    this.saving.set(true);
    this.serverErrors.set({});

    const call$ = existing
      ? this.api.update(existing.id, { name: v.name.trim(), type: v.type, openingBalance: v.openingBalance, isArchived: v.isArchived, version: existing.version })
      : this.api.create({ name: v.name.trim(), type: v.type, currency: v.currency, openingBalance: v.openingBalance });

    call$.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(existing ? 'Account updated.' : 'Account created.');
        this.refData.load().subscribe();
        this.refresh.bump();
      },
      error: (err: unknown) => {
        const e = ApiError.from(err);
        this.saving.set(false);
        if (e.code === 'account_name_taken') this.serverErrors.set({ name: ['You already have an account with this name.'] });
        else if (e.hasFieldErrors) this.serverErrors.set(e.errors);
        if (e.code === 'concurrency_conflict') this.refData.load().subscribe();
      },
    });
  }

  protected async remove(account: AccountDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `Delete “${account.name}”?`,
      message: 'This only works for accounts with no transactions. Otherwise archive it to keep your history.',
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    this.api.delete(account.id).subscribe({
      next: () => {
        this.toast.success('Account deleted.');
        this.refData.load().subscribe();
        this.refresh.bump();
      },
      error: (err: unknown) => {
        if (ApiError.from(err).code === 'account_in_use') this.openEdit(account);
      },
    });
  }
}
