import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AnalyticsApi } from '../../core/api/analytics.api';
import { CategoryAmountDto, CategoryBreakdownDto, CategoryComparisonDto, TransactionType } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { RefreshService } from '../../core/services/refresh.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { colorAt } from '../../core/utils/colors';
import { formatMoney, formatPercent } from '../../core/utils/format';
import { TableState, compareNumber, compareText } from '../../core/utils/table-state';
import { DonutChartComponent, DonutItem } from '../../shared/charts/donut-chart.component';
import { RankBarsComponent, RankItem } from '../../shared/charts/rank-bars.component';
import { SearchBoxComponent, SegmentOption, SegmentedComponent, SortHeaderComponent } from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyPipe } from '../../shared/ui/money.component';
import { PaginatorComponent } from '../../shared/ui/paginator.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../shared/ui/ui-bits.component';
import { AnalyticsFilterService } from './analytics-filter.service';

@Component({
  selector: 'app-analytics-categories',
  imports: [
    IconComponent, MoneyPipe, DonutChartComponent, RankBarsComponent, SegmentedComponent, SearchBoxComponent, SortHeaderComponent, PaginatorComponent,
    EmptyStateComponent, ErrorStateComponent, SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card card-pad head">
      <app-segmented [options]="types" [value]="type()" [tone]="type() === 'Income' ? 'income' : 'expense'" (valueChange)="setType($event)" />
      <nav class="crumbs" aria-label="Breadcrumb">
        <button type="button" [class.on]="!drill()" (click)="drill.set(null)">All categories</button>
        @if (drill(); as d) { <app-icon name="chevron-right" [size]="14" /><span class="on">{{ d.name }}</span>
          <button type="button" class="btn btn-ghost btn-sm" (click)="drill.set(null)"><app-icon name="arrow-left" [size]="14" /> Back</button> }
      </nav>
    </section>

    @if (breakdown.error(); as e) {
      <app-error-state [error]="e" (retry)="refresh.bump()" />
    } @else {
      @if (breakdown.data(); as b) {
        @if (b.items.length === 0) {
          <section class="card card-pad sec"><app-empty-state icon="chart" [title]="'No ' + type().toLowerCase() + ' in this period'" message="Try a wider timeline or reset the account and category filters." /></section>
        } @else {
          <div class="grid-12 sec">
            <section class="card card-pad c-5">
              <div class="card-head"><div><h3 class="card-title"><app-icon name="chart" [size]="18" /> {{ drill() ? drill()?.name : 'All categories' }}</h3><p class="card-sub">{{ drill() ? 'Subcategory split' : 'Tap a slice to see its subcategories' }}</p></div></div>
              <app-donut-chart [items]="donut()" [size]="240" [thickness]="28" [centerLabel]="type() === 'Income' ? 'Earned' : 'Spent'" [centerFormat]="money" (itemClick)="onSlice($event)" ariaLabel="Category breakdown" />
              @if (drill() && b.items.length === 1) { <p class="hint">This category has no subcategories with activity in this period.</p> }
            </section>
            <section class="card card-pad c-7">
              <div class="card-head"><div><h3 class="card-title"><app-icon name="tag" [size]="18" /> Ranking</h3><p class="card-sub">By amount</p></div></div>
              <app-rank-bars [items]="ranks()" [clickable]="!drill()" (picked)="onRank($event)" />
            </section>
          </div>

          <section class="card card-pad sec">
            <div class="card-head">
              <div><h3 class="card-title"><app-icon name="list" [size]="18" /> Breakdown table</h3><p class="card-sub">{{ table.total() }} categor{{ table.total() === 1 ? 'y' : 'ies' }}</p></div>
              <app-search-box class="srch" [value]="table.search()" (valueChange)="table.setSearch($event)" placeholder="Search categories" />
            </div>
            @if (table.total() === 0) {
              <app-empty-state icon="search" title="No categories match" message="Try a different search."><button type="button" class="btn btn-secondary btn-sm" (click)="table.setSearch('')">Clear search</button></app-empty-state>
            } @else {
              <div class="table-wrap"><table class="table">
                <thead><tr>
                  <th><app-sort-header label="Category" key="name" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="right"><app-sort-header label="Amount" key="amount" align="right" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="hide-mobile" style="width: 28%"><app-sort-header label="Share" key="percent" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="right hide-mobile"><app-sort-header label="Txns" key="count" align="right" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="right hide-tablet">Avg</th>
                </tr></thead>
                <tbody>
                  @for (c of table.pageItems(); track c.categoryId; let i = $index) {
                    <tr [style.--i]="i" [class.clickable]="!drill()" (click)="!drill() && drillInto(c)">
                      <td><span class="cat"><i class="dot" [style.background]="c.color ?? '#7c6cff'"></i>{{ c.name }}</span></td>
                      <td class="right num">{{ c.amount | money }}</td>
                      <td class="hide-mobile"><div class="share"><i [style.width.%]="c.percent" [style.background]="c.color ?? '#7c6cff'"></i></div><small class="num">{{ c.percent.toFixed(1) }}%</small></td>
                      <td class="right num hide-mobile">{{ c.count }}</td>
                      <td class="right num hide-tablet muted">{{ (c.count ? c.amount / c.count : 0) | money }}</td>
                    </tr>
                  }
                </tbody>
              </table></div>
              <app-paginator [total]="table.total()" [page]="table.currentPage()" [pageSize]="table.pageSize()" (pageChange)="table.setPage($event)" (pageSizeChange)="table.setPageSize($event)" />
            }
          </section>
        }
      } @else {
        <div class="grid-12 sec"><app-skeleton class="c-5" height="340px" radius="20px" /><app-skeleton class="c-7" height="340px" radius="20px" /></div>
      }
    }

    @if (type() === 'Expense' && !drill()) {
      <section class="card card-pad sec">
        <div class="card-head">
          <div><h3 class="card-title"><app-icon name="repeat" [size]="18" /> Compared with the previous period</h3><p class="card-sub">Where spending moved the most</p></div>
          <app-search-box class="srch" [value]="compare.search()" (valueChange)="compare.setSearch($event)" placeholder="Search categories" />
        </div>
        @if (comparison.error(); as e) {
          <app-error-state [error]="e" (retry)="refresh.bump()" />
        } @else {
          @if (comparison.data(); as rows) {
            @if (rows.length === 0) {
              <app-empty-state icon="repeat" title="Nothing to compare" message="There is no spending in this period or the one before it." />
            } @else if (compare.total() === 0) {
              <app-empty-state icon="search" title="No categories match" message="Try a different search."><button type="button" class="btn btn-secondary btn-sm" (click)="compare.setSearch('')">Clear search</button></app-empty-state>
            } @else {
              <div class="table-wrap"><table class="table">
                <thead><tr>
                  <th><app-sort-header label="Category" key="name" [sort]="compare.sort()" (toggle)="compare.toggleSort($event)" /></th>
                  <th class="right"><app-sort-header label="This period" key="current" align="right" [sort]="compare.sort()" (toggle)="compare.toggleSort($event)" /></th>
                  <th class="right hide-mobile"><app-sort-header label="Previous" key="previous" align="right" [sort]="compare.sort()" (toggle)="compare.toggleSort($event)" /></th>
                  <th class="right"><app-sort-header label="Change" key="change" align="right" [sort]="compare.sort()" (toggle)="compare.toggleSort($event)" /></th>
                </tr></thead>
                <tbody>
                  @for (r of compare.pageItems(); track r.categoryId; let i = $index) {
                    <tr [style.--i]="i"><td><span class="cat"><i class="dot" [style.background]="r.color ?? '#7c6cff'"></i>{{ r.name }}</span></td>
                      <td class="right num">{{ r.current | money }}</td><td class="right num hide-mobile muted">{{ r.previous | money }}</td>
                      <td class="right"><span class="delta" [class]="r.change > 0 ? 'down' : r.change < 0 ? 'up' : 'flat'">{{ r.change | money: 'signed' }}@if (r.changePercent !== null) { · {{ pct(r.changePercent) }} }</span></td></tr>
                  }
                </tbody></table></div>
              <app-paginator [total]="compare.total()" [page]="compare.currentPage()" [pageSize]="compare.pageSize()" (pageChange)="compare.setPage($event)" (pageSizeChange)="compare.setPageSize($event)" />
            }
          } @else { <app-skeleton height="200px" radius="16px" /> }
        }
      </section>
    }
  `,
  styles: [`
    .head { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; justify-content: space-between; }
    .crumbs { display: flex; align-items: center; gap: 8px; color: var(--faint); }
    .crumbs button:not(.btn) { background: none; border: 0; color: var(--muted); font-weight: 600; cursor: pointer; padding: 4px 6px; border-radius: 8px; }
    .crumbs button:not(.btn):hover { background: var(--surface-2); }
    .crumbs .on { color: var(--text); font-weight: 700; }
    .sec { margin-top: 16px; }
    .hint { text-align: center; color: var(--faint); font-size: .85rem; margin-top: 10px; }
    .srch { min-width: min(280px, 100%); }
    .cat { display: inline-flex; align-items: center; gap: 10px; font-weight: 600; }
    .share { height: 7px; border-radius: 999px; background: var(--grid); overflow: hidden; margin-bottom: 4px; }
    .share i { display: block; height: 100%; border-radius: inherit; animation: growX .8s both; transform-origin: left; }
    td small { color: var(--faint); }
  `],
})
export class CategoriesTabComponent {
  protected readonly filters = inject(AnalyticsFilterService);
  protected readonly refresh = inject(RefreshService);
  private readonly api = inject(AnalyticsApi);
  private readonly auth = inject(AuthService);

  protected readonly types: SegmentOption[] = [{ value: 'Expense', label: 'Expenses' }, { value: 'Income', label: 'Income' }];
  protected readonly type = signal<TransactionType>('Expense');
  protected readonly drill = signal<{ id: string; name: string } | null>(null);

  protected readonly breakdown = asyncState<CategoryBreakdownDto>();
  protected readonly comparison = asyncState<CategoryComparisonDto[]>();

  protected readonly money = (n: number): string => formatMoney(n, this.auth.currency(), { compact: true });
  protected readonly pct = (n: number): string => formatPercent(n, 0, true);

  protected readonly table = new TableState<CategoryAmountDto>(() => this.breakdown.data()?.items ?? [], {
    searchText: (c) => c.name,
    comparers: {
      name: (a, b) => compareText(a.name, b.name),
      amount: (a, b) => compareNumber(a.amount, b.amount),
      percent: (a, b) => compareNumber(a.percent, b.percent),
      count: (a, b) => compareNumber(a.count, b.count),
    },
    defaultSort: { key: 'amount', dir: 'desc' },
    storageKey: 'analytics-categories',
  });

  protected readonly compare = new TableState<CategoryComparisonDto>(() => this.comparison.data() ?? [], {
    searchText: (c) => c.name,
    comparers: {
      name: (a, b) => compareText(a.name, b.name),
      current: (a, b) => compareNumber(a.current, b.current),
      previous: (a, b) => compareNumber(a.previous, b.previous),
      change: (a, b) => compareNumber(a.change, b.change),
    },
    defaultSort: { key: 'change', dir: 'desc' },
    storageKey: 'analytics-compare',
  });

  constructor() {
    autoLoad(this.breakdown, () => (this.refresh.version(), this.api.categories(this.filters.filter(), this.type(), this.drill()?.id)));
    autoLoad(this.comparison, () => (this.refresh.version(), this.api.categoryComparison(this.filters.filter())));
  }

  protected readonly donut = computed<DonutItem[]>(() => {
    const items = this.breakdown.data()?.items ?? [];
    const top = items.slice(0, 9).map((c, i) => ({ label: c.name, value: c.amount, color: c.color ?? colorAt(i) }));
    const rest = items.slice(9).reduce((s, c) => s + c.amount, 0);
    return rest > 0 ? [...top, { label: 'Other', value: rest, color: '#64748b' }] : top;
  });

  protected readonly ranks = computed<RankItem[]>(() =>
    (this.breakdown.data()?.items ?? []).slice(0, 12).map((c, i) => ({
      id: c.categoryId, label: c.name, value: c.amount, color: c.color ?? colorAt(i),
      valueText: `${formatMoney(c.amount, this.auth.currency(), { compact: true })} · ${c.percent.toFixed(1)}%`, sub: `${c.count} transaction${c.count === 1 ? '' : 's'}`,
    })));

  protected setType(value: string): void {
    this.type.set(value === 'Income' ? 'Income' : 'Expense');
    this.drill.set(null);
    this.table.setPage(1);
  }

  protected drillInto(item: CategoryAmountDto): void {
    this.drill.set({ id: item.categoryId, name: item.name });
  }

  protected onSlice(index: number): void {
    const item = this.breakdown.data()?.items[index];
    if (item && !this.drill()) this.drillInto(item);
  }

  protected onRank(rank: RankItem): void {
    const item = this.breakdown.data()?.items.find((c) => c.categoryId === rank.id);
    if (item && !this.drill()) this.drillInto(item);
  }
}
