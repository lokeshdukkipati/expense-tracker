import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsApi } from '../../core/api/analytics.api';
import { RecurringExpenseDto } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { RefreshService } from '../../core/services/refresh.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { addDays, parseYmd, ymd } from '../../core/utils/dates';
import { formatDate, formatMoney } from '../../core/utils/format';
import { TableState, compareNumber, compareText } from '../../core/utils/table-state';
import { SearchBoxComponent, SortHeaderComponent } from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent, MoneyPipe } from '../../shared/ui/money.component';
import { PaginatorComponent } from '../../shared/ui/paginator.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../shared/ui/ui-bits.component';

@Component({
  selector: 'app-analytics-recurring',
  imports: [RouterLink, IconComponent, MoneyPipe, MoneyComponent, StatCardComponent, SearchBoxComponent, SortHeaderComponent, PaginatorComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state.error(); as e) {
      <app-error-state [error]="e" (retry)="refresh.bump()" />
    } @else {
      @if (state.data(); as list) {
        @if (list.length === 0) {
          <section class="card card-pad">
            <app-empty-state icon="repeat" title="No recurring payments detected yet" message="We look for the same description paid at a steady interval and amount at least three times in the last two years. Keep recording descriptions and they will show up here.">
              <a routerLink="/transactions" class="btn btn-secondary btn-sm">Review transactions</a>
            </app-empty-state>
          </section>
        } @else {
          <div class="cols-4 reveal">
            <app-stat-card label="Per month" icon="repeat" tone="var(--primary)" [value]="monthly()" hint="committed before you decide anything" />
            <app-stat-card label="Per year" icon="calendar" tone="var(--warning)" [value]="monthly() * 12" hint="if nothing changes" />
            <app-stat-card label="Active payments" icon="list" tone="var(--info)" kind="number" [value]="list.length" hint="detected automatically" />
            <app-stat-card label="Due in 30 days" icon="clock" tone="var(--danger)" [value]="dueSoon().total" [hint]="dueSoon().count + ' payment' + (dueSoon().count === 1 ? '' : 's')" />
          </div>

          @if (dueSoon().items.length > 0) {
            <section class="card card-pad sec">
              <div class="card-head"><div><h3 class="card-title"><app-icon name="calendar" [size]="18" /> Coming up</h3><p class="card-sub">Expected in the next 30 days</p></div></div>
              <div class="timeline">
                @for (r of dueSoon().items; track r.description; let i = $index) {
                  <div class="t" [style.--i]="i"><span class="when"><b>{{ day(r.nextExpectedDate) }}</b><small>{{ month(r.nextExpectedDate) }}</small></span>
                    <span class="what truncate">{{ r.description }}<small>{{ r.frequency }}</small></span><b class="num">{{ r.typicalAmount | money }}</b></div>
                }
              </div>
            </section>
          }

          <section class="card card-pad sec">
            <div class="card-head">
              <div><h3 class="card-title"><app-icon name="list" [size]="18" /> All recurring payments</h3><p class="card-sub">Tick the ones you might cancel to see what you'd save</p></div>
              <app-search-box class="srch" [value]="table.search()" (valueChange)="table.setSearch($event)" placeholder="Search payments" />
            </div>

            @if (selected().size > 0) {
              <div class="whatif">
                <app-icon name="sparkles" [size]="18" />
                <span>Cancelling <b>{{ selected().size }}</b> would save <b class="text-success"><app-money [value]="savingMonthly()" /></b> a month, <b class="text-success"><app-money [value]="savingMonthly() * 12" /></b> a year.</span>
                <button type="button" class="btn btn-ghost btn-sm" (click)="selected.set(empty)">Clear</button>
              </div>
            }

            @if (table.total() === 0) {
              <app-empty-state icon="search" title="No payments match" message="Try a different search."><button type="button" class="btn btn-secondary btn-sm" (click)="table.setSearch('')">Clear search</button></app-empty-state>
            } @else {
              <div class="table-wrap"><table class="table">
                <thead><tr>
                  <th style="width: 44px"></th>
                  <th><app-sort-header label="Payment" key="name" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="hide-mobile">Frequency</th>
                  <th class="right"><app-sort-header label="Amount" key="amount" align="right" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="right"><app-sort-header label="Per month" key="monthly" align="right" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="hide-tablet"><app-sort-header label="Next due" key="next" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                </tr></thead>
                <tbody>
                  @for (r of table.pageItems(); track r.description; let i = $index) {
                    <tr [style.--i]="i"><td><input type="checkbox" class="checkbox" [checked]="selected().has(r.description)" (change)="toggle(r.description)" [attr.aria-label]="'Select ' + r.description" /></td>
                      <td><div class="cell-main"><strong>{{ r.description }}</strong><small>{{ r.categoryName || 'Uncategorised' }} · seen {{ r.occurrences }} times</small></div></td>
                      <td class="hide-mobile"><span class="badge primary">{{ r.frequency }}</span></td>
                      <td class="right num">{{ r.typicalAmount | money }}</td><td class="right num">{{ r.monthlyCost | money }}</td>
                      <td class="hide-tablet muted nowrap">{{ date(r.nextExpectedDate) }}</td></tr>
                  }
                </tbody></table></div>
              <app-paginator [total]="table.total()" [page]="table.currentPage()" [pageSize]="table.pageSize()" (pageChange)="table.setPage($event)" (pageSizeChange)="table.setPageSize($event)" />
            }
          </section>
        }
      } @else { <div class="cols-4"><app-skeleton height="120px" radius="20px" /><app-skeleton height="120px" radius="20px" /><app-skeleton height="120px" radius="20px" /><app-skeleton height="120px" radius="20px" /></div><div class="sec"><app-skeleton height="300px" radius="20px" /></div> }
    }
  `,
  styles: [`
    .sec { margin-top: 16px; } .srch { min-width: min(280px, 100%); }
    .timeline { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
    .t { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 16px; border: 1px solid var(--border); background: var(--surface); animation: fadeUp .4s both; animation-delay: calc(var(--i) * 50ms); }
    .when { display: flex; flex-direction: column; align-items: center; width: 46px; padding: 6px 0; border-radius: 12px; background: var(--surface-2); flex: none; }
    .when b { font-size: 1.1rem; line-height: 1; } .when small { font-size: .66rem; text-transform: uppercase; color: var(--faint); }
    .what { flex: 1; display: flex; flex-direction: column; font-weight: 600; } .what small { color: var(--faint); font-weight: 400; font-size: .76rem; }
    .whatif { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 12px 16px; border-radius: 14px; margin-bottom: 14px; color: var(--text);
      background: linear-gradient(135deg, color-mix(in srgb, var(--success) 14%, transparent), color-mix(in srgb, var(--primary) 10%, transparent)); border: 1px solid color-mix(in srgb, var(--success) 30%, transparent); animation: fadeUp .3s both; }
    .whatif span { flex: 1; min-width: 200px; }
  `],
})
export class RecurringComponent {
  protected readonly refresh = inject(RefreshService);
  private readonly api = inject(AnalyticsApi);
  private readonly auth = inject(AuthService);

  protected readonly empty: ReadonlySet<string> = new Set<string>();
  protected readonly selected = signal<ReadonlySet<string>>(new Set<string>());
  protected readonly state = asyncState<RecurringExpenseDto[]>();

  protected readonly table = new TableState<RecurringExpenseDto>(() => this.state.data() ?? [], {
    searchText: (r) => `${r.description} ${r.categoryName ?? ''} ${r.frequency}`,
    comparers: {
      name: (a, b) => compareText(a.description, b.description),
      amount: (a, b) => compareNumber(a.typicalAmount, b.typicalAmount),
      monthly: (a, b) => compareNumber(a.monthlyCost, b.monthlyCost),
      next: (a, b) => a.nextExpectedDate.localeCompare(b.nextExpectedDate),
    },
    defaultSort: { key: 'monthly', dir: 'desc' },
    storageKey: 'analytics-recurring',
  });

  constructor() {
    autoLoad(this.state, () => (this.refresh.version(), this.api.recurring()));
  }

  protected readonly monthly = computed(() => (this.state.data() ?? []).reduce((s, r) => s + r.monthlyCost, 0));
  protected readonly savingMonthly = computed(() => (this.state.data() ?? []).filter((r) => this.selected().has(r.description)).reduce((s, r) => s + r.monthlyCost, 0));

  protected readonly dueSoon = computed(() => {
    const today = ymd(new Date());
    const limit = ymd(addDays(new Date(), 30));
    const items = (this.state.data() ?? []).filter((r) => r.nextExpectedDate >= today && r.nextExpectedDate <= limit).sort((a, b) => a.nextExpectedDate.localeCompare(b.nextExpectedDate));
    return { items, count: items.length, total: items.reduce((s, r) => s + r.typicalAmount, 0) };
  });

  protected toggle(description: string): void {
    const next = new Set(this.selected());
    if (next.has(description)) next.delete(description);
    else next.add(description);
    this.selected.set(next);
  }

  protected money(n: number): string {
    return formatMoney(n, this.auth.currency());
  }

  protected date(value: string): string {
    return formatDate(value);
  }

  protected day(value: string): string {
    return String(parseYmd(value).getDate());
  }

  protected month(value: string): string {
    return parseYmd(value).toLocaleDateString(undefined, { month: 'short' });
  }
}
