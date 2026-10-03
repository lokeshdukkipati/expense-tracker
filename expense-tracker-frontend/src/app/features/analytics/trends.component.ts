import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AnalyticsApi } from '../../core/api/analytics.api';
import { TrendGranularity, TrendPointDto } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { RefreshService } from '../../core/services/refresh.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { autoGranularity, parseYmd } from '../../core/utils/dates';
import { formatDate, formatMoney, formatPercent } from '../../core/utils/format';
import { TableState, compareNumber } from '../../core/utils/table-state';
import { BarChartComponent } from '../../shared/charts/bar-chart.component';
import { ChartSeries } from '../../shared/charts/chart-utils';
import { LineChartComponent } from '../../shared/charts/line-chart.component';
import { SearchBoxComponent, SegmentOption, SegmentedComponent, SortHeaderComponent } from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyPipe } from '../../shared/ui/money.component';
import { PaginatorComponent } from '../../shared/ui/paginator.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../shared/ui/ui-bits.component';
import { AnalyticsFilterService } from './analytics-filter.service';

interface Row {
  point: TrendPointDto;
  label: string;
  rate: number | null;
}

const GRANULARITIES: SelectOption[] = [
  { value: 'Auto', label: 'Auto' }, { value: 'Day', label: 'Daily' }, { value: 'Week', label: 'Weekly' },
  { value: 'Month', label: 'Monthly' }, { value: 'Quarter', label: 'Quarterly' }, { value: 'Year', label: 'Yearly' },
];

@Component({
  selector: 'app-analytics-trends',
  imports: [
    IconComponent, MoneyPipe, LineChartComponent, BarChartComponent, SegmentedComponent, SelectComponent, StatCardComponent, SearchBoxComponent, SortHeaderComponent,
    PaginatorComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (trend.error(); as e) {
      <app-error-state [error]="e" (retry)="refresh.bump()" />
    } @else {
      @if (trend.data(); as pts) {
        @if (!hasData()) {
          <section class="card card-pad"><app-empty-state icon="trending-up" title="No activity in this period" message="There is nothing to chart for this timeline and filter. Try a wider range." /></section>
        } @else {
          <div class="cols-4 reveal">
            <app-stat-card label="Total income" icon="arrow-down-right" tone="var(--success)" [value]="stats().income" [hint]="pts.length + ' ' + unit() + 's'" />
            <app-stat-card label="Total expenses" icon="arrow-up-right" tone="var(--danger)" [value]="stats().expense" [hint]="'avg ' + money(stats().avgExpense) + ' per ' + unit()" />
            <app-stat-card label="Lowest spending" icon="trending-down" tone="var(--info)" [value]="stats().best?.expense ?? 0" [hint]="stats().best ? stats().best!.label : '—'" />
            <app-stat-card label="Highest spending" icon="trending-up" tone="var(--warning)" [value]="stats().worst?.expense ?? 0" [hint]="stats().worst ? stats().worst!.label : '—'" />
          </div>

          <section class="card card-pad sec">
            <div class="card-head">
              <div><h3 class="card-title"><app-icon name="activity" [size]="18" /> Trend</h3><p class="card-sub">Switch the grouping, chart style and series</p></div>
              <div class="controls">
                <app-select [options]="granularities" [value]="granChoice()" [block]="false" size="sm" (valueChange)="setGran($event)" ariaLabel="Grouping" />
                <app-segmented [options]="chartTypes" [value]="chartType()" (valueChange)="chartType.set($event)" />
              </div>
            </div>
            <div class="toggles">
              @for (s of seriesDefs; track s.key) {
                <button type="button" class="tg" [class.off]="!visible().has(s.key)" (click)="toggle(s.key)"><i [style.background]="s.color"></i>{{ s.label }}</button>
              }
            </div>
            @if (visible().size === 0) {
              <app-empty-state icon="filter" title="No series selected" message="Turn on at least one series above." />
            } @else if (chartType() === 'bars') {
              <app-bar-chart [labels]="labels()" [series]="series()" [format]="money" [height]="320" ariaLabel="Trend bars" />
            } @else {
              <app-line-chart [labels]="labels()" [series]="series()" [format]="money" [height]="320" ariaLabel="Trend lines" />
            }
          </section>

          <section class="card card-pad sec">
            <div class="card-head">
              <div><h3 class="card-title"><app-icon name="list" [size]="18" /> By {{ unit() }}</h3><p class="card-sub">{{ table.total() }} row{{ table.total() === 1 ? '' : 's' }}</p></div>
              <app-search-box class="srch" [value]="table.search()" (valueChange)="table.setSearch($event)" placeholder="Search periods" />
            </div>
            @if (table.total() === 0) {
              <app-empty-state icon="search" title="No periods match" message="Try a different search."><button type="button" class="btn btn-secondary btn-sm" (click)="table.setSearch('')">Clear search</button></app-empty-state>
            } @else {
              <div class="table-wrap"><table class="table">
                <thead><tr>
                  <th><app-sort-header label="Period" key="date" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="right"><app-sort-header label="Income" key="income" align="right" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="right"><app-sort-header label="Expenses" key="expense" align="right" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="right"><app-sort-header label="Net" key="net" align="right" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="right hide-mobile"><app-sort-header label="Saved" key="rate" align="right" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  <th class="right hide-mobile">Txns</th>
                </tr></thead>
                <tbody>
                  @for (r of table.pageItems(); track r.point.periodStart; let i = $index) {
                    <tr [style.--i]="i"><td class="nowrap"><b>{{ r.label }}</b></td><td class="right num text-success">{{ r.point.income | money }}</td><td class="right num">{{ r.point.expense | money }}</td>
                      <td class="right num" [class.text-danger]="r.point.net < 0">{{ r.point.net | money: 'signed' }}</td>
                      <td class="right num hide-mobile">{{ r.rate === null ? '—' : pct(r.rate) }}</td><td class="right num hide-mobile muted">{{ r.point.count }}</td></tr>
                  }
                </tbody></table></div>
              <app-paginator [total]="table.total()" [page]="table.currentPage()" [pageSize]="table.pageSize()" (pageChange)="table.setPage($event)" (pageSizeChange)="table.setPageSize($event)" />
            }
          </section>
        }
      } @else {
        <div class="cols-4"><app-skeleton height="120px" radius="20px" /><app-skeleton height="120px" radius="20px" /><app-skeleton height="120px" radius="20px" /><app-skeleton height="120px" radius="20px" /></div>
        <div class="sec"><app-skeleton height="400px" radius="20px" /></div>
      }
    }
  `,
  styles: [`
    .sec { margin-top: 16px; }
    .controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .controls app-select { min-width: 130px; }
    .toggles { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
    .tg { display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border-strong); background: var(--surface-2); color: var(--text); font-weight: 600; font-size: .85rem; cursor: pointer; transition: all .2s; }
    .tg i { width: 9px; height: 9px; border-radius: 50%; }
    .tg.off { opacity: .45; background: transparent; } .tg:hover { transform: translateY(-1px); }
    .srch { min-width: min(280px, 100%); }
  `],
})
export class TrendsComponent {
  protected readonly filters = inject(AnalyticsFilterService);
  protected readonly refresh = inject(RefreshService);
  private readonly api = inject(AnalyticsApi);
  private readonly auth = inject(AuthService);

  protected readonly granularities = GRANULARITIES;
  protected readonly chartTypes: SegmentOption[] = [{ value: 'area', label: 'Lines', icon: 'activity' }, { value: 'bars', label: 'Bars', icon: 'bar-chart' }];
  protected readonly seriesDefs = [
    { key: 'income', label: 'Income', color: '#34d399' }, { key: 'expense', label: 'Expenses', color: '#fb7185' }, { key: 'net', label: 'Net', color: '#7c6cff' },
  ];

  protected readonly granChoice = signal<string>('Auto');
  protected readonly chartType = signal<string>('area');
  protected readonly visible = signal<ReadonlySet<string>>(new Set(['income', 'expense']));
  protected readonly trend = asyncState<TrendPointDto[]>();

  protected readonly money = (n: number): string => formatMoney(n, this.auth.currency(), { compact: true });
  protected readonly pct = (n: number): string => formatPercent(n, 0);

  protected readonly gran = computed<TrendGranularity>(() => {
    const choice = this.granChoice();
    return choice === 'Auto' ? autoGranularity(this.filters.range()) : (choice as TrendGranularity);
  });
  protected readonly unit = computed(() => this.gran().toLowerCase());

  private readonly rows = computed<Row[]>(() =>
    (this.trend.data() ?? []).map((point) => ({
      point,
      label: this.labelFor(point.periodStart),
      rate: point.income > 0 ? ((point.income - point.expense) / point.income) * 100 : null,
    })));

  protected readonly table = new TableState<Row>(() => this.rows(), {
    searchText: (r) => r.label,
    comparers: {
      date: (a, b) => a.point.periodStart.localeCompare(b.point.periodStart),
      income: (a, b) => compareNumber(a.point.income, b.point.income),
      expense: (a, b) => compareNumber(a.point.expense, b.point.expense),
      net: (a, b) => compareNumber(a.point.net, b.point.net),
      rate: (a, b) => compareNumber(a.rate ?? -999, b.rate ?? -999),
    },
    defaultSort: { key: 'date', dir: 'desc' },
    storageKey: 'analytics-trends',
  });

  constructor() {
    autoLoad(this.trend, () => (this.refresh.version(), this.api.trend(this.filters.filter(), this.gran())));
  }

  protected readonly hasData = computed(() => (this.trend.data() ?? []).some((p) => p.count > 0));
  protected readonly labels = computed(() => this.rows().map((r) => r.label));

  protected readonly series = computed<ChartSeries[]>(() => {
    const pts = this.trend.data() ?? [];
    const on = this.visible();
    const all: Record<string, ChartSeries> = {
      income: { name: 'Income', color: '#34d399', values: pts.map((p) => p.income) },
      expense: { name: 'Expenses', color: '#fb7185', values: pts.map((p) => p.expense) },
      net: { name: 'Net', color: '#7c6cff', values: pts.map((p) => p.net) },
    };
    return this.seriesDefs.filter((d) => on.has(d.key)).map((d) => all[d.key]);
  });

  protected readonly stats = computed(() => {
    const rows = this.rows().filter((r) => r.point.count > 0);
    const income = rows.reduce((s, r) => s + r.point.income, 0);
    const expense = rows.reduce((s, r) => s + r.point.expense, 0);
    const spending = rows.filter((r) => r.point.expense > 0);
    const best = spending.length ? spending.reduce((a, b) => (b.point.expense < a.point.expense ? b : a)) : null;
    const worst = spending.length ? spending.reduce((a, b) => (b.point.expense > a.point.expense ? b : a)) : null;
    return { income, expense, avgExpense: rows.length ? expense / rows.length : 0, best: best ? { expense: best.point.expense, label: best.label } : null, worst: worst ? { expense: worst.point.expense, label: worst.label } : null };
  });

  protected setGran(value: string | number | null): void {
    this.granChoice.set(typeof value === 'string' ? value : 'Auto');
    this.table.setPage(1);
  }

  protected toggle(key: string): void {
    const next = new Set(this.visible());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.visible.set(next);
  }

  protected money2(n: number): string {
    return formatMoney(n, this.auth.currency());
  }

  private labelFor(periodStart: string): string {
    const d = parseYmd(periodStart);
    switch (this.gran()) {
      case 'Month': return formatDate(d, 'month');
      case 'Quarter': return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
      case 'Year': return String(d.getFullYear());
      case 'Week': return `Wk ${formatDate(d, 'day')}`;
      default: return formatDate(d, 'day');
    }
  }
}
