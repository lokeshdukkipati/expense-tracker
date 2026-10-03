import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BudgetsApi } from '../../core/api/budgets.api';
import { ApiError } from '../../core/errors/api-error';
import { BudgetDto, BudgetPeriod, BudgetState, BudgetStatusDto } from '../../core/models/api.models';
import { ConfirmService } from '../../core/services/confirm.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { TableState, compareNumber, compareText } from '../../core/utils/table-state';
import { forkJoin } from 'rxjs';
import { GaugeComponent } from '../../shared/charts/gauge.component';
import { ProgressBarComponent } from '../../shared/charts/progress-bar.component';
import { SearchBoxComponent, SegmentOption, SegmentedComponent, SortHeaderComponent } from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent, MoneyPipe } from '../../shared/ui/money.component';
import { OverlayComponent } from '../../shared/ui/overlay.component';
import { PaginatorComponent } from '../../shared/ui/paginator.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent, SpinnerComponent } from '../../shared/ui/ui-bits.component';
import { formatDate } from '../../core/utils/format';

interface BudgetRow {
  budget: BudgetDto;
  status: BudgetStatusDto | null;
}

const OVERALL = 'overall';
const STATE_ORDER: Record<BudgetState, number> = { Exceeded: 3, Warning: 2, OnTrack: 1 };

@Component({
  selector: 'app-budgets',
  imports: [
    ReactiveFormsModule, IconComponent, MoneyComponent, MoneyPipe, GaugeComponent, ProgressBarComponent, SearchBoxComponent, SegmentedComponent, SortHeaderComponent,
    PaginatorComponent, OverlayComponent, SelectComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent, SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Budgets</h1><p>Set limits per category or overall and get warned before you overspend.</p></div>
        <div class="head-actions"><button type="button" class="btn btn-primary" (click)="openNew()"><app-icon name="plus" [size]="18" /> New budget</button></div>
      </div>

      @if (error(); as e) {
        <app-error-state [error]="e" (retry)="refresh.bump()" />
      } @else if (!loaded()) {
        <div class="auto-grid"><app-skeleton height="210px" radius="20px" /><app-skeleton height="210px" radius="20px" /><app-skeleton height="210px" radius="20px" /></div>
      } @else if (rows().length === 0) {
        <section class="card card-pad">
          <app-empty-state icon="target" title="No budgets yet" message="A budget turns your spending into a game you can win. Start with one overall monthly limit, then add categories that tend to run away.">
            <button type="button" class="btn btn-primary" (click)="openNew()"><app-icon name="plus" [size]="18" /> Create a budget</button>
          </app-empty-state>
        </section>
      } @else {
        <div class="cols-3 reveal strip">
          <div class="card card-pad stat"><span class="muted">Budgeted</span><strong class="num"><app-money [value]="totals().limit" [compact]="true" /></strong><small class="muted">{{ active().length }} active budget{{ active().length === 1 ? '' : 's' }}</small></div>
          <div class="card card-pad stat"><span class="muted">Spent so far</span><strong class="num"><app-money [value]="totals().spent" [compact]="true" /></strong><small class="muted">across current periods</small></div>
          <div class="card card-pad stat"><span class="muted">Needs attention</span><strong class="num" [class.text-danger]="attention() > 0">{{ attention() }}</strong><small class="muted">exceeded or near the limit</small></div>
        </div>

        @if (active().length > 0) {
          <div class="auto-grid cards">
            @for (r of active(); track r.budget.id; let i = $index) {
              @if (r.status; as s) {
                <article class="card card-pad bcard hover" [style.--i]="i" (click)="openEdit(r.budget)" tabindex="0" (keydown.enter)="openEdit(r.budget)">
                  <div class="row between">
                    <div class="titles"><strong class="truncate">{{ r.budget.categoryName ?? 'Overall spending' }}</strong><small>{{ r.budget.period }} · {{ range(s) }}</small></div>
                    <span class="badge" [class]="badge(s.state)">{{ label(s.state) }}</span>
                  </div>
                  <app-gauge [value]="gauge(s)" [label]="'of limit used'" [sublabel]="s.percentUsed.toFixed(0) + '%'" [size]="190" [invert]="true" />
                  <div class="nums">
                    <div><small>Spent</small><b class="num">{{ s.spent | money }}</b></div>
                    <div><small>{{ s.remaining >= 0 ? 'Left' : 'Over by' }}</small><b class="num" [class.text-danger]="s.remaining < 0">{{ abs(s.remaining) | money }}</b></div>
                    <div><small>Limit</small><b class="num">{{ r.budget.amount | money }}</b></div>
                  </div>
                  <app-progress [value]="s.percentUsed" [tone]="s.state" [marker]="r.budget.alertThresholdPercent" />
                  <p class="foot">
                    @if (s.state === 'Exceeded') { <span class="text-danger">Over budget.</span> }
                    @else if (s.projectedToExceed) { <span class="text-warning">On pace to reach {{ s.projectedSpend | money: 'compact' }}.</span> }
                    @else { <span class="text-success">On track.</span> }
                    {{ s.daysLeft }} day{{ s.daysLeft === 1 ? '' : 's' }} left.
                  </p>
                </article>
              }
            }
          </div>
        }

        <section class="card card-pad list">
          <div class="card-head">
            <div><h3 class="card-title"><app-icon name="list" [size]="18" /> All budgets</h3><p class="card-sub">Search, sort and edit</p></div>
            <app-search-box class="srch" [value]="table.search()" (valueChange)="table.setSearch($event)" placeholder="Search budgets" />
          </div>

          @if (table.total() === 0) {
            <app-empty-state icon="search" title="No budgets match" message="Try a different search."><button type="button" class="btn btn-secondary btn-sm" (click)="table.setSearch('')">Clear search</button></app-empty-state>
          } @else {
            <div class="table-wrap">
              <table class="table">
                <thead><tr>
                  <th><app-sort-header label="Budget" key="name" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="hide-mobile">Period</th>
                  <th class="right"><app-sort-header label="Limit" key="amount" align="right" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="right"><app-sort-header label="Used" key="used" align="right" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="hide-mobile">Status</th><th style="width: 90px"></th>
                </tr></thead>
                <tbody>
                  @for (r of table.pageItems(); track r.budget.id; let i = $index) {
                    <tr class="clickable" [style.--i]="i" (click)="openEdit(r.budget)">
                      <td><div class="cell-main"><strong>{{ r.budget.categoryName ?? 'Overall spending' }}</strong><small>Alert at {{ r.budget.alertThresholdPercent }}%</small></div></td>
                      <td class="hide-mobile">{{ r.budget.period }}</td>
                      <td class="right num">{{ r.budget.amount | money }}</td>
                      <td class="right num">{{ r.status ? r.status.percentUsed.toFixed(0) + '%' : '—' }}</td>
                      <td class="hide-mobile">
                        @if (!r.budget.isActive) { <span class="badge">Paused</span> }
                        @else { @if (r.status; as s) { <span class="badge" [class]="badge(s.state)">{{ label(s.state) }}</span> } }
                      </td>
                      <td class="right"><span class="row-actions">
                        <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Edit" (click)="$event.stopPropagation(); openEdit(r.budget)"><app-icon name="edit" [size]="15" /></button>
                        <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Delete" (click)="$event.stopPropagation(); remove(r.budget)"><app-icon name="trash" [size]="15" /></button>
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

    <app-overlay [open]="formOpen()" [title]="editing() ? 'Edit budget' : 'New budget'" [subtitle]="editing() ? (editing()?.categoryName ?? 'Overall spending') + ' · ' + editing()?.period : 'Choose what to limit and how much.'" variant="dialog" [width]="480" (closed)="closeForm()">
      <form [formGroup]="form" (ngSubmit)="save()" novalidate class="stack" id="bud-form">
        @if (!editing()) {
          <div class="field"><label>Applies to</label>
            <app-select [options]="categoryChoices()" [value]="form.controls.categoryId.value" [searchable]="true" (valueChange)="setCategory($event)" ariaLabel="Budget category" /></div>
          <div class="field"><label>Period</label>
            <app-segmented class="block" [options]="periods" [value]="form.controls.period.value" (valueChange)="setPeriod($event)" /></div>
        }
        <div class="field"><label for="ba">Limit</label>
          <input id="ba" class="input" type="number" inputmode="decimal" step="0.01" min="0" formControlName="amount" placeholder="0.00" [class.invalid]="!!err('amount')" />
          @if (err('amount'); as e) { <span class="field-error">{{ e }}</span> }</div>
        <div class="field"><label for="bt">Warn me at <b>{{ form.controls.alertThresholdPercent.value }}%</b></label>
          <input id="bt" type="range" min="1" max="100" step="1" class="range" formControlName="alertThresholdPercent" />
          <span class="field-hint">You'll see a warning once spending reaches this share of the limit.</span></div>
        @if (editing()) {
          <label class="check"><input type="checkbox" class="checkbox" [checked]="form.controls.isActive.value" (change)="form.controls.isActive.setValue(!form.controls.isActive.value)" />
            <span>Active <small>Paused budgets don't show alerts.</small></span></label>
        }
      </form>
      <ng-container footer>
        <button type="button" class="btn btn-ghost" (click)="closeForm()">Cancel</button>
        <button type="submit" form="bud-form" class="btn btn-primary" [disabled]="saving()">@if (saving()) { <app-spinner [size]="16" /> } {{ editing() ? 'Save changes' : 'Create budget' }}</button>
      </ng-container>
    </app-overlay>
  `,
  styles: [`
    .strip { margin-bottom: 16px; }
    .stat { display: flex; flex-direction: column; gap: 2px; }
    .stat strong { font-size: 1.7rem; font-weight: 800; letter-spacing: -.02em; }
    .cards { margin-bottom: 16px; }
    .bcard { display: flex; flex-direction: column; gap: 14px; cursor: pointer; animation: fadeUp .45s both; animation-delay: calc(var(--i) * 60ms); }
    .titles { display: flex; flex-direction: column; min-width: 0; }
    .titles small { color: var(--faint); }
    .nums { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center; }
    .nums div { display: flex; flex-direction: column; }
    .nums small { color: var(--faint); font-size: .74rem; }
    .foot { margin: 0; font-size: .84rem; color: var(--muted); }
    .srch { min-width: min(280px, 100%); }
    .range { width: 100%; accent-color: var(--primary); }
    .check { display: flex; gap: 12px; align-items: flex-start; cursor: pointer; }
    .check span { display: flex; flex-direction: column; font-weight: 600; }
    .check small { color: var(--faint); font-weight: 400; }
    .block { display: block; }
  `],
})
export class BudgetsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(BudgetsApi);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  protected readonly refresh = inject(RefreshService);
  private readonly refData = inject(ReferenceDataService);

  protected readonly periods: SegmentOption[] = [{ value: 'Weekly', label: 'Weekly' }, { value: 'Monthly', label: 'Monthly' }, { value: 'Yearly', label: 'Yearly' }];
  protected readonly abs = Math.abs;

  private readonly data = asyncState<{ budgets: BudgetDto[]; status: BudgetStatusDto[] }>();
  protected readonly loaded = this.data.loaded;
  protected readonly error = this.data.error;

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<BudgetDto | null>(null);
  protected readonly saving = signal(false);
  private readonly serverErrors = signal<Record<string, string[]>>({});

  protected readonly rows = computed<BudgetRow[]>(() => {
    const d = this.data.data();
    if (!d) return [];
    const byId = new Map(d.status.map((s) => [s.budget.id, s]));
    return d.budgets.map((budget) => ({ budget, status: byId.get(budget.id) ?? null }));
  });

  protected readonly active = computed(() =>
    this.rows().filter((r) => r.budget.isActive && r.status).sort((a, b) => STATE_ORDER[b.status!.state] - STATE_ORDER[a.status!.state] || b.status!.percentUsed - a.status!.percentUsed));

  protected readonly totals = computed(() => ({
    limit: this.active().reduce((s, r) => s + r.budget.amount, 0),
    spent: this.active().reduce((s, r) => s + (r.status?.spent ?? 0), 0),
  }));

  protected readonly attention = computed(() => this.active().filter((r) => r.status!.state !== 'OnTrack').length);

  protected readonly table = new TableState<BudgetRow>(() => this.rows(), {
    searchText: (r) => `${r.budget.categoryName ?? 'Overall'} ${r.budget.period}`,
    comparers: {
      name: (a, b) => compareText(a.budget.categoryName ?? 'Overall', b.budget.categoryName ?? 'Overall'),
      amount: (a, b) => compareNumber(a.budget.amount, b.budget.amount),
      used: (a, b) => compareNumber(a.status?.percentUsed, b.status?.percentUsed),
    },
    defaultSort: { key: 'used', dir: 'desc' },
    storageKey: 'budgets',
  });

  protected readonly categoryChoices = computed<SelectOption[]>(() => [
    { value: OVERALL, label: 'Overall (all spending)' },
    ...this.refData.categoryOptions('Expense'),
  ]);

  protected readonly form = this.fb.nonNullable.group({
    categoryId: [OVERALL],
    period: ['Monthly' as BudgetPeriod],
    amount: [null as number | null, [Validators.required, Validators.min(0.01), Validators.max(1_000_000_000_000)]],
    alertThresholdPercent: [80, [Validators.min(1), Validators.max(100)]],
    isActive: [true],
  });

  constructor() {
    autoLoad(this.data, () => {
      this.refresh.version();
      return forkJoin({ budgets: this.api.list(), status: this.api.status() });
    });
  }

  protected badge(state: BudgetState): string {
    return state === 'Exceeded' ? 'danger' : state === 'Warning' ? 'warning' : 'success';
  }

  protected label(state: BudgetState): string {
    return state === 'Exceeded' ? 'Exceeded' : state === 'Warning' ? 'Near limit' : 'On track';
  }

  protected gauge(s: BudgetStatusDto): number {
    return Math.min(100, s.percentUsed);
  }

  protected range(s: BudgetStatusDto): string {
    return `${formatDate(s.periodStart, 'day')} – ${formatDate(s.periodEnd, 'day')}`;
  }

  protected err(field: 'amount'): string | null {
    const server = this.serverErrors()[field]?.[0];
    if (server) return server;
    const c = this.form.controls[field];
    if (!c.invalid || !(c.touched || c.dirty)) return null;
    return c.errors?.['required'] ? 'Enter a limit.' : c.errors?.['min'] ? 'The limit must be greater than zero.' : 'That amount is too large.';
  }

  protected setCategory(value: string | number | null): void {
    this.form.controls.categoryId.setValue(typeof value === 'string' ? value : OVERALL);
  }

  protected setPeriod(value: string): void {
    this.form.controls.period.setValue(value === 'Weekly' || value === 'Yearly' ? value : 'Monthly');
  }

  protected openNew(): void {
    this.editing.set(null);
    this.serverErrors.set({});
    this.form.reset({ categoryId: OVERALL, period: 'Monthly', amount: null, alertThresholdPercent: 80, isActive: true });
    this.formOpen.set(true);
  }

  protected openEdit(budget: BudgetDto): void {
    this.editing.set(budget);
    this.serverErrors.set({});
    this.form.reset({ categoryId: budget.categoryId ?? OVERALL, period: budget.period, amount: budget.amount, alertThresholdPercent: budget.alertThresholdPercent, isActive: budget.isActive });
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
    const amount = Math.round((v.amount ?? 0) * 100) / 100;
    this.saving.set(true);
    this.serverErrors.set({});

    const call$ = existing
      ? this.api.update(existing.id, { amount, alertThresholdPercent: v.alertThresholdPercent, isActive: v.isActive, version: existing.version })
      : this.api.create({ categoryId: v.categoryId === OVERALL ? null : v.categoryId, amount, period: v.period, alertThresholdPercent: v.alertThresholdPercent });

    call$.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(existing ? 'Budget updated.' : 'Budget created.');
        this.refresh.bump();
      },
      error: (err: unknown) => {
        const e = ApiError.from(err);
        this.saving.set(false);
        if (e.hasFieldErrors) this.serverErrors.set(e.errors);
        if (e.code === 'concurrency_conflict') this.refresh.bump();
      },
    });
  }

  protected async remove(budget: BudgetDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Delete this budget?',
      message: `The ${budget.period.toLowerCase()} budget for ${budget.categoryName ?? 'overall spending'} will be removed. Your transactions are not affected.`,
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    this.api.delete(budget.id).subscribe(() => {
      this.toast.success('Budget deleted.');
      this.refresh.bump();
    });
  }
}
