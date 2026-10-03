import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsApi } from '../../core/api/analytics.api';
import { CategoryBreakdownDto, SummaryDto, TrendPointDto } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { colorAt } from '../../core/utils/colors';
import { autoGranularity, parseYmd } from '../../core/utils/dates';
import { formatDate, formatMoney } from '../../core/utils/format';
import { BarChartComponent } from '../../shared/charts/bar-chart.component';
import { DonutChartComponent, DonutItem } from '../../shared/charts/donut-chart.component';
import { LineChartComponent } from '../../shared/charts/line-chart.component';
import { RankBarsComponent, RankItem } from '../../shared/charts/rank-bars.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyPipe } from '../../shared/ui/money.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../shared/ui/ui-bits.component';
import { AnalyticsFilterService } from './analytics-filter.service';

@Component({
  selector: 'app-analytics-overview',
  imports: [
    RouterLink, IconComponent, MoneyPipe, StatCardComponent, LineChartComponent, BarChartComponent, DonutChartComponent, RankBarsComponent,
    EmptyStateComponent, ErrorStateComponent, SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (summary.error(); as e) {
      <app-error-state [error]="e" (retry)="refresh.bump()" />
    } @else {
      @if (summary.data(); as s) {
        @if (s.transactionCount === 0) {
          <section class="card card-pad">
            <app-empty-state icon="chart" title="No transactions in this period" message="Nothing matches the current timeline and filters. Widen the range or reset the filters.">
              <button type="button" class="btn btn-secondary btn-sm" (click)="filters.reset()">Reset filters</button>
              <a routerLink="/transactions" class="btn btn-primary btn-sm">Go to transactions</a>
            </app-empty-state>
          </section>
        } @else {
          <div class="cols-4 reveal">
            <app-stat-card label="Income" icon="arrow-down-right" tone="var(--success)" [value]="s.income" [delta]="s.incomeChangePercent" [goodWhenUp]="true" hint="vs previous period" />
            <app-stat-card label="Expenses" icon="arrow-up-right" tone="var(--danger)" [value]="s.expense" [delta]="s.expenseChangePercent" [goodWhenUp]="false" hint="vs previous period" />
            <app-stat-card label="Net savings" icon="wallet" tone="var(--primary)" [value]="s.net" [hint]="s.net >= 0 ? 'You kept more than you spent' : 'You spent more than you earned'" />
            <app-stat-card label="Savings rate" icon="percent" tone="var(--accent)" kind="percent" [value]="s.savingsRatePercent ?? 0" [hint]="s.savingsRatePercent === null ? 'No income in this period' : 'Target: 20% or more'" />
          </div>

          <div class="cols-4 reveal row2">
            <app-stat-card label="Avg. daily spend" icon="calendar" tone="var(--warning)" [value]="s.averageDailyExpense" hint="across elapsed days" />
            <app-stat-card label="Transactions" icon="list" tone="var(--info)" kind="number" [value]="s.transactionCount" hint="income and expenses" />
            <article class="card card-pad big-one">
              <span class="icon-tile" style="--tile: var(--danger)"><app-icon name="trending-up" /></span>
              <div><small>Largest expense</small>
                @if (s.largestExpense; as l) { <strong>{{ l.amount | money }}</strong><span class="truncate">{{ l.description || l.categoryName }} · {{ date(l.occurredAt) }}</span> } @else { <strong class="faint">—</strong><span>None in this period</span> }</div>
            </article>
            <article class="card card-pad big-one">
              <span class="icon-tile" style="--tile: var(--success)"><app-icon name="trending-down" /></span>
              <div><small>Largest income</small>
                @if (s.largestIncome; as l) { <strong>{{ l.amount | money }}</strong><span class="truncate">{{ l.description || l.categoryName }} · {{ date(l.occurredAt) }}</span> } @else { <strong class="faint">—</strong><span>None in this period</span> }</div>
            </article>
          </div>

          <div class="grid-12 sec">
            <section class="card card-pad c-8">
              <div class="card-head"><div><h3 class="card-title"><app-icon name="activity" [size]="18" /> Income vs expenses</h3><p class="card-sub">{{ granLabel() }} totals</p></div></div>
              @if (trend.data(); as pts) {
                <app-line-chart [labels]="labels()" [series]="series()" [format]="money" [height]="280" ariaLabel="Income and expenses over time" />
                <div class="legend"><span><i style="background: var(--success)"></i>Income</span><span><i style="background: var(--danger)"></i>Expenses</span><span class="muted">{{ pts.length }} points</span></div>
              } @else { @if (trend.error(); as e) { <app-error-state [error]="e" (retry)="refresh.bump()" /> }
              @else { <app-skeleton height="280px" radius="16px" /> } }
            </section>

            <section class="card card-pad c-4">
              <div class="card-head"><div><h3 class="card-title"><app-icon name="repeat" [size]="18" /> Versus previous period</h3><p class="card-sub">{{ prevLabel(s) }}</p></div></div>
              <app-bar-chart [labels]="['Previous', 'Current']" [series]="compareSeries()" [format]="money" [height]="250" ariaLabel="Current versus previous period" />
              <div class="legend"><span><i style="background: var(--success)"></i>Income</span><span><i style="background: var(--danger)"></i>Expenses</span></div>
            </section>
          </div>

          <div class="grid-12 sec">
            <section class="card card-pad c-5">
              <div class="card-head"><div><h3 class="card-title"><app-icon name="chart" [size]="18" /> Spending mix</h3></div><a routerLink="/analytics/categories" class="btn btn-ghost btn-sm">Explore</a></div>
              @if (categories.data(); as c) {
                @if (c.items.length > 0) { <app-donut-chart [items]="donut()" [size]="210" centerLabel="Spent" [centerFormat]="money" ariaLabel="Spending by category" /> }
                @else { <app-empty-state icon="chart" title="No expenses" message="There is no spending in this period to break down." /> }
              } @else { <app-skeleton height="240px" radius="16px" /> }
            </section>
            <section class="card card-pad c-4">
              <div class="card-head"><div><h3 class="card-title"><app-icon name="tag" [size]="18" /> Top categories</h3></div></div>
              @if (categories.data(); as c) {
                @if (c.items.length > 0) { <app-rank-bars [items]="ranks()" /> } @else { <app-empty-state icon="tag" title="Nothing to rank" /> }
              } @else { <app-skeleton height="240px" radius="16px" /> }
            </section>
            <section class="card card-pad c-3">
              <div class="card-head"><div><h3 class="card-title"><app-icon name="wallet" [size]="18" /> Balances</h3></div><a routerLink="/accounts" class="btn btn-ghost btn-sm">Manage</a></div>
              @if (accounts().length > 0) {
                <ul class="acc">@for (a of accounts(); track a.id) { <li><span class="truncate">{{ a.name }}</span><b class="num" [class.text-danger]="a.currentBalance < 0">{{ a.currentBalance | money: 'compact' : a.currency }}</b></li> }</ul>
              } @else { <app-empty-state icon="wallet" title="No accounts" message="Create an account to see balances." /> }
            </section>
          </div>
        }
      } @else {
        <div class="cols-4"><app-skeleton height="130px" radius="20px" /><app-skeleton height="130px" radius="20px" /><app-skeleton height="130px" radius="20px" /><app-skeleton height="130px" radius="20px" /></div>
        <div class="sec"><app-skeleton height="320px" radius="20px" /></div>
      }
    }
  `,
  styles: [`
    .row2 { margin-top: 16px; } .sec { margin-top: 16px; }
    .big-one { display: flex; gap: 14px; align-items: center; }
    .big-one div { display: flex; flex-direction: column; min-width: 0; }
    .big-one small { color: var(--muted); font-weight: 600; }
    .big-one strong { font-size: 1.5rem; font-weight: 800; letter-spacing: -.02em; }
    .big-one span.truncate { color: var(--faint); font-size: .8rem; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; font-size: .8rem; color: var(--muted); }
    .legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
    .acc { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
    .acc li { display: flex; justify-content: space-between; gap: 10px; font-size: .92rem; }
  `],
})
export class OverviewComponent {
  protected readonly filters = inject(AnalyticsFilterService);
  protected readonly refresh = inject(RefreshService);
  private readonly api = inject(AnalyticsApi);
  private readonly auth = inject(AuthService);
  private readonly refData = inject(ReferenceDataService);

  protected readonly summary = asyncState<SummaryDto>();
  protected readonly trend = asyncState<TrendPointDto[]>();
  protected readonly categories = asyncState<CategoryBreakdownDto>();

  protected readonly money = (n: number): string => formatMoney(n, this.auth.currency(), { compact: true });
  protected readonly accounts = computed(() => this.refData.activeAccounts());
  private readonly gran = computed(() => autoGranularity(this.filters.range()));
  protected readonly granLabel = computed(() => ({ Day: 'Daily', Week: 'Weekly', Month: 'Monthly', Quarter: 'Quarterly' })[this.gran()]);

  constructor() {
    autoLoad(this.summary, () => (this.refresh.version(), this.api.summary(this.filters.filter())));
    autoLoad(this.trend, () => (this.refresh.version(), this.api.trend(this.filters.filter(), this.gran())));
    autoLoad(this.categories, () => (this.refresh.version(), this.api.categories(this.filters.filter(), 'Expense')));
  }

  protected readonly labels = computed(() =>
    (this.trend.data() ?? []).map((p) => (this.gran() === 'Month' || this.gran() === 'Quarter' ? formatDate(parseYmd(p.periodStart), 'month') : formatDate(parseYmd(p.periodStart), 'day'))));

  protected readonly series = computed(() => [
    { name: 'Income', color: '#34d399', values: (this.trend.data() ?? []).map((p) => p.income) },
    { name: 'Expenses', color: '#fb7185', values: (this.trend.data() ?? []).map((p) => p.expense) },
  ]);

  protected readonly compareSeries = computed(() => {
    const s = this.summary.data();
    return [
      { name: 'Income', color: '#34d399', values: [s?.previous.income ?? 0, s?.income ?? 0] },
      { name: 'Expenses', color: '#fb7185', values: [s?.previous.expense ?? 0, s?.expense ?? 0] },
    ];
  });

  protected readonly donut = computed<DonutItem[]>(() => {
    const items = this.categories.data()?.items ?? [];
    const top = items.slice(0, 7).map((c, i) => ({ label: c.name, value: c.amount, color: c.color ?? colorAt(i) }));
    const rest = items.slice(7).reduce((s, c) => s + c.amount, 0);
    return rest > 0 ? [...top, { label: 'Other', value: rest, color: '#64748b' }] : top;
  });

  protected readonly ranks = computed<RankItem[]>(() =>
    (this.categories.data()?.items ?? []).slice(0, 6).map((c, i) => ({
      id: c.categoryId, label: c.name, value: c.amount, valueText: `${formatMoney(c.amount, this.auth.currency(), { compact: true })} · ${c.percent.toFixed(0)}%`, color: c.color ?? colorAt(i),
    })));

  protected date(value: string): string {
    return formatDate(value);
  }

  protected prevLabel(s: SummaryDto): string {
    return `${formatDate(s.previous.from, 'day')} – ${formatDate(s.previous.to, 'day')}`;
  }
}
