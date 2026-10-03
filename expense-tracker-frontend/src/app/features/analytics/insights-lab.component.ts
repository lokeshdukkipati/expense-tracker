import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, of } from 'rxjs';
import { AnalyticsApi } from '../../core/api/analytics.api';
import { BudgetsApi } from '../../core/api/budgets.api';
import {
  buildInsights, categoryWorkdays, healthScore, lifestyleInflation, microSpend, noSpendStats, paydayEffect, runwayDays, spendingPersona, weekendSplit,
} from '../../core/analytics/insights';
import {
  AnomalyDto, BudgetStatusDto, CategoryBreakdownDto, ForecastDto, PatternsDto, RecurringExpenseDto, SummaryDto, TagStatDto, TopDescriptionDto, TrendPointDto,
} from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { colorAt } from '../../core/utils/colors';
import { addMonths, endOfMonth, parseYmd, startOfMonth, todayYmd, ymd } from '../../core/utils/dates';
import { formatDate, formatMoney, formatPercent } from '../../core/utils/format';
import { TableState, compareNumber, compareText } from '../../core/utils/table-state';
import { BarChartComponent } from '../../shared/charts/bar-chart.component';
import { ChartSeries } from '../../shared/charts/chart-utils';
import { GaugeComponent } from '../../shared/charts/gauge.component';
import { ProgressBarComponent } from '../../shared/charts/progress-bar.component';
import { RankBarsComponent, RankItem } from '../../shared/charts/rank-bars.component';
import { SankeyComponent, FlowItem } from '../../shared/charts/sankey.component';
import { SearchBoxComponent, SortHeaderComponent } from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { CountUpComponent, MoneyComponent, MoneyPipe } from '../../shared/ui/money.component';
import { PaginatorComponent } from '../../shared/ui/paginator.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select.component';
import { EmptyStateComponent, SkeletonComponent } from '../../shared/ui/ui-bits.component';
import { AnalyticsFilterService } from './analytics-filter.service';

interface Lab {
  summary: SummaryDto | null;
  days: TrendPointDto[] | null;
  months: TrendPointDto[] | null;
  patterns: PatternsDto | null;
  top: TopDescriptionDto[] | null;
  recurring: RecurringExpenseDto[] | null;
  anomalies: AnomalyDto[] | null;
  forecast: ForecastDto | null;
  budgets: BudgetStatusDto[] | null;
  categories: CategoryBreakdownDto | null;
  tags: TagStatDto[] | null;
}

const MONTH_DAYS = 30.44;

@Component({
  selector: 'app-insights-lab',
  imports: [
    RouterLink, IconComponent, MoneyPipe, MoneyComponent, CountUpComponent, GaugeComponent, ProgressBarComponent, SankeyComponent, BarChartComponent, RankBarsComponent,
    SelectComponent, SearchBoxComponent, SortHeaderComponent, PaginatorComponent, EmptyStateComponent, SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (lab.data(); as d) {
      @if (!d.summary || d.summary.transactionCount === 0) {
        <section class="card card-pad">
          <app-empty-state icon="sparkles" [title]="d.summary ? 'Nothing to analyse in this period' : 'Insights are unavailable right now'"
                           [message]="d.summary ? 'The Insights Lab needs transactions in the selected timeline. Widen the range or reset the filters.' : 'We could not load your data. Check your connection and try again.'">
            @if (d.summary) { <button type="button" class="btn btn-secondary btn-sm" (click)="filters.reset()">Reset filters</button> }
            <button type="button" class="btn btn-primary btn-sm" (click)="refresh.bump()"><app-icon name="refresh" [size]="15" /> Reload</button>
            <a routerLink="/import" class="btn btn-secondary btn-sm">Import data</a>
          </app-empty-state>
        </section>
      } @else {
        <div class="grid-12 reveal">
          <section class="card card-pad c-4 glow-border">
            <div class="card-head"><h3 class="card-title"><app-icon name="shield" [size]="18" /> Financial health</h3></div>
            @if (health(); as h) {
              <app-gauge [value]="h.score" label="out of 100" [sublabel]="h.grade" [size]="230" />
              <ul class="bars">@for (c of h.components; track c.key) {
                <li><div class="r"><span>{{ c.label }}</span><b class="num">{{ c.score }}</b></div><app-progress [value]="c.score" [tone]="c.score >= 70 ? 'OnTrack' : c.score >= 40 ? 'Warning' : 'Exceeded'" /><small>{{ c.detail }}</small></li>
              }</ul>
            } @else { <app-empty-state icon="shield" title="Not enough data yet" message="Add income and a few weeks of spending to unlock your score." /> }
          </section>

          <section class="card card-pad c-4">
            <div class="card-head"><h3 class="card-title"><app-icon name="user" [size]="18" /> Spending personality</h3></div>
            @if (persona(); as p) {
              <div class="persona"><strong>{{ p.title }}</strong><p>{{ p.description }}</p>
                <div class="traits">@for (t of p.traits; track t) { <span class="chip">{{ t }}</span> }</div></div>
            } @else { <app-empty-state icon="user" title="No pattern yet" message="Your habits take shape after a few days of spending." /> }
            <hr class="divider" />
            <div class="mini">
              <div><small>Spending days</small><b><app-count-up [value]="streak().elapsedDays - streak().noSpendDays" /></b></div>
              <div><small>No-spend days</small><b><app-count-up [value]="streak().noSpendDays" /></b></div>
              <div><small>Current streak</small><b><app-icon name="flame" [size]="16" /> <app-count-up [value]="streak().currentStreak" /></b></div>
              <div><small>Longest streak</small><b><app-count-up [value]="streak().longestStreak" /></b></div>
            </div>
          </section>

          <section class="card card-pad c-4">
            <div class="card-head"><h3 class="card-title"><app-icon name="sparkles" [size]="18" /> What stands out</h3></div>
            @if (feed().length > 0) {
              <ul class="feed">@for (i of feed(); track i.title; let n = $index) {
                <li [class]="i.tone" [style.--i]="n"><span class="ic"><app-icon [name]="i.icon" [size]="16" /></span><div><b>{{ i.title }}</b><small>{{ i.text }}</small></div></li>
              }</ul>
            } @else { <app-empty-state icon="sparkles" title="Nothing unusual" message="Everything looks steady for this period." /> }
          </section>
        </div>

        <section class="card card-pad sec">
          <div class="card-head"><div><h3 class="card-title"><app-icon name="layers" [size]="18" /> Money flow</h3><p class="card-sub">How income turns into spending and savings in this period</p></div></div>
          @if (flows().length > 0 || d.summary.income > 0) {
            <app-sankey [income]="d.summary.income" [flows]="flows()" [format]="compact" />
          } @else { <app-empty-state icon="layers" title="No flow to show" message="Record income and expenses in this period to see where it goes." /> }
        </section>

        <div class="grid-12 sec">
          <section class="card card-pad c-6">
            <div class="card-head"><div><h3 class="card-title"><app-icon name="zap" [size]="18" /> What-if simulator</h3><p class="card-sub">Cut a category and see what it does to your year</p></div></div>
            @if (categoryChoices().length > 0) {
              <div class="stack">
                <div class="field"><label>Category</label><app-select [options]="categoryChoices()" [value]="whatCategory()" [searchable]="true" (valueChange)="setWhatCategory($event)" ariaLabel="Category to reduce" /></div>
                <div class="field"><label for="cut">Spend <b>{{ cut() }}%</b> less on it</label>
                  <input id="cut" class="range" type="range" min="0" max="100" step="5" [value]="cut()" (input)="onCut($event)" /></div>
                @if (whatIf(); as w) {
                  <div class="wi">
                    <div><small>Saved per month</small><b class="text-success num"><app-money [value]="w.monthly" /></b></div>
                    <div><small>Saved per year</small><b class="text-success num"><app-money [value]="w.yearly" /></b></div>
                    <div><small>New savings rate</small><b class="num">{{ w.newRate === null ? '—' : pct(w.newRate) }}</b></div>
                    <div><small>Extra runway</small><b class="num">{{ w.extraRunwayDays === null ? '—' : w.extraRunwayDays.toFixed(0) + ' days' }}</b></div>
                  </div>
                }
              </div>
            } @else { <app-empty-state icon="zap" title="No categories to simulate" message="You need expenses in this period to try a what-if." /> }
          </section>

          <section class="card card-pad c-6">
            <div class="card-head"><div><h3 class="card-title"><app-icon name="clock" [size]="18" /> Cost in work-days</h3><p class="card-sub">How many days of income each category consumes</p></div></div>
            @if (workdays().length > 0) { <app-rank-bars [items]="workdays()" /> }
            @else { <app-empty-state icon="clock" title="Needs income" message="Add income in this period to translate spending into days of work." /> }
          </section>
        </div>

        <div class="grid-12 sec">
          <section class="card card-pad c-4">
            <div class="card-head"><h3 class="card-title"><app-icon name="zap" [size]="18" /> Payday effect</h3></div>
            @if (payday(); as p) {
              <p class="big">{{ p.ratio >= 1 ? '+' : '' }}{{ ((p.ratio - 1) * 100).toFixed(0) }}%</p>
              <p class="note">more spending per day in the 3 days after income arrives ({{ p.paydays }} payday{{ p.paydays === 1 ? '' : 's' }} found).</p>
              <div class="duo"><div><small>After payday</small><b class="num">{{ p.afterAvg | money: 'compact' }}/day</b><app-progress [value]="(p.afterAvg / duoMax(p.afterAvg, p.baselineAvg)) * 100" tone="Warning" /></div>
                <div><small>Other days</small><b class="num">{{ p.baselineAvg | money: 'compact' }}/day</b><app-progress [value]="(p.baselineAvg / duoMax(p.afterAvg, p.baselineAvg)) * 100" tone="primary" /></div></div>
            } @else { <app-empty-state icon="zap" title="Not enough data" message="Needs two weeks of data that includes income." /> }
          </section>

          <section class="card card-pad c-4">
            <div class="card-head"><h3 class="card-title"><app-icon name="calendar" [size]="18" /> Weekend vs weekday</h3></div>
            @if (weekend(); as w) {
              <p class="big">{{ w.ratio.toFixed(1) }}x</p>
              <p class="note">{{ w.ratio >= 1 ? 'a weekend day costs more than a weekday' : 'a weekday costs more than a weekend day' }}.</p>
              <div class="duo"><div><small>Weekend day</small><b class="num">{{ w.weekendAvg | money: 'compact' }}</b><app-progress [value]="(w.weekendAvg / duoMax(w.weekendAvg, w.weekdayAvg)) * 100" tone="Warning" /></div>
                <div><small>Weekday</small><b class="num">{{ w.weekdayAvg | money: 'compact' }}</b><app-progress [value]="(w.weekdayAvg / duoMax(w.weekendAvg, w.weekdayAvg)) * 100" tone="primary" /></div></div>
            } @else { <app-empty-state icon="calendar" title="No pattern yet" message="Needs spending on both weekdays and weekends." /> }
          </section>

          <section class="card card-pad c-4">
            <div class="card-head"><h3 class="card-title"><app-icon name="trending-up" [size]="18" /> Lifestyle inflation</h3></div>
            @if (inflation(); as l) {
              <span class="badge" [class]="l.verdict === 'inflating' ? 'danger' : l.verdict === 'healthy' ? 'success' : 'warning'">{{ l.verdict === 'inflating' ? 'Spending is outpacing income' : l.verdict === 'healthy' ? 'Income is keeping up' : 'Roughly steady' }}</span>
              <div class="duo"><div><small>Spending, last 3 months</small><b class="num" [class.text-danger]="l.expenseGrowth > 0">{{ pct(l.expenseGrowth, true) }}</b></div>
                <div><small>Income, last 3 months</small><b class="num" [class.text-success]="l.incomeGrowth > 0">{{ pct(l.incomeGrowth, true) }}</b></div></div>
              <p class="note">Compared with the three months before.</p>
            } @else { <app-empty-state icon="trending-up" title="Needs 6 months" message="Keep tracking and this will compare your recent months with the ones before." /> }
          </section>
        </div>

        <div class="grid-12 sec">
          <section class="card card-pad c-6">
            <div class="card-head"><div><h3 class="card-title"><app-icon name="coffee" [size]="18" /> Small-spend leaks</h3><p class="card-sub">Frequent small purchases that add up</p></div></div>
            @if (micro(); as m) {
              <p class="note"><b class="text-danger"><app-money [value]="m.total" /></b> across these habits, {{ m.sharePercent.toFixed(0) }}% of all spending.</p>
              <app-rank-bars [items]="microRanks()" />
            } @else { <app-empty-state icon="coffee" title="No leaks found" message="No frequent small purchases stand out in this period." /> }
          </section>

          <section class="card card-pad c-6">
            <div class="card-head"><div><h3 class="card-title"><app-icon name="activity" [size]="18" /> Forecast</h3><p class="card-sub">Recent months, this month's projection and the next three</p></div></div>
            @if (forecastChart(); as f) {
              <app-bar-chart [labels]="f.labels" [series]="f.series" [stacked]="true" [format]="compact" [height]="250" ariaLabel="Spending forecast" />
              <div class="legend"><span><i style="background: #7c6cff"></i>Actual</span><span><i style="background: #fbbf24"></i>Projected</span></div>
              @if (runway(); as r) { <p class="note">At your recent pace, your balances cover about <b>{{ r.toFixed(0) }} days</b> of spending.</p> }
            } @else { <app-empty-state icon="activity" title="No forecast yet" message="A forecast appears after you have spending history." /> }
          </section>
        </div>

        <section class="card card-pad sec">
          <div class="card-head">
            <div><h3 class="card-title"><app-icon name="alert-triangle" [size]="18" /> Unusual expenses</h3><p class="card-sub">Much larger than your normal for that category</p></div>
            <app-search-box class="srch" [value]="anomalies.search()" (valueChange)="anomalies.setSearch($event)" placeholder="Search" />
          </div>
          @if ((d.anomalies ?? []).length === 0) {
            <app-empty-state icon="shield" title="Nothing unusual" message="No expenses stand out from your normal spending for their category. We need about 10 transactions in a category to judge." />
          } @else if (anomalies.total() === 0) {
            <app-empty-state icon="search" title="No matches" message="Try a different search."><button type="button" class="btn btn-secondary btn-sm" (click)="anomalies.setSearch('')">Clear search</button></app-empty-state>
          } @else {
            <div class="table-wrap"><table class="table">
              <thead><tr>
                <th><app-sort-header label="When" key="date" [sort]="anomalies.sort()" (toggle)="anomalies.toggleSort($event)" /></th><th>What</th>
                <th class="right"><app-sort-header label="Amount" key="amount" align="right" [sort]="anomalies.sort()" (toggle)="anomalies.toggleSort($event)" /></th>
                <th class="right hide-mobile">Usual</th>
                <th class="right"><app-sort-header label="Unusualness" key="z" align="right" [sort]="anomalies.sort()" (toggle)="anomalies.toggleSort($event)" /></th>
              </tr></thead>
              <tbody>
                @for (a of anomalies.pageItems(); track a.transactionId; let i = $index) {
                  <tr [style.--i]="i"><td class="nowrap">{{ date(a.occurredAt) }}</td><td><div class="cell-main"><strong>{{ a.description || a.categoryName }}</strong><small>{{ a.categoryName }}</small></div></td>
                    <td class="right num text-danger">{{ a.amount | money }}</td><td class="right num hide-mobile muted">{{ a.categoryAverage | money }}</td>
                    <td class="right"><span class="badge warning">{{ a.zScore.toFixed(1) }}σ</span></td></tr>
                }
              </tbody></table></div>
            <app-paginator [total]="anomalies.total()" [page]="anomalies.currentPage()" [pageSize]="anomalies.pageSize()" (pageChange)="anomalies.setPage($event)" (pageSizeChange)="anomalies.setPageSize($event)" />
          }
        </section>

        <section class="card card-pad sec">
          <div class="card-head">
            <div><h3 class="card-title"><app-icon name="tag" [size]="18" /> Tags</h3><p class="card-sub">Spending grouped by the #tags you add</p></div>
            <app-search-box class="srch" [value]="tags.search()" (valueChange)="tags.setSearch($event)" placeholder="Search tags" />
          </div>
          @if ((d.tags ?? []).length === 0) {
            <app-empty-state icon="tag" title="No tags yet" message="Add #tags when you record a transaction (for example #trip or #work) to see totals per tag here." />
          } @else if (tags.total() === 0) {
            <app-empty-state icon="search" title="No tags match" message="Try a different search."><button type="button" class="btn btn-secondary btn-sm" (click)="tags.setSearch('')">Clear search</button></app-empty-state>
          } @else {
            <div class="table-wrap"><table class="table">
              <thead><tr>
                <th><app-sort-header label="Tag" key="tag" [sort]="tags.sort()" (toggle)="tags.toggleSort($event)" /></th>
                <th class="right"><app-sort-header label="Expenses" key="expense" align="right" [sort]="tags.sort()" (toggle)="tags.toggleSort($event)" /></th>
                <th class="right hide-mobile"><app-sort-header label="Income" key="income" align="right" [sort]="tags.sort()" (toggle)="tags.toggleSort($event)" /></th>
                <th class="right"><app-sort-header label="Uses" key="count" align="right" [sort]="tags.sort()" (toggle)="tags.toggleSort($event)" /></th>
              </tr></thead>
              <tbody>
                @for (t of tags.pageItems(); track t.tag; let i = $index) {
                  <tr [style.--i]="i"><td><span class="badge primary">#{{ t.tag }}</span></td><td class="right num">{{ t.expense | money }}</td><td class="right num hide-mobile text-success">{{ t.income | money }}</td><td class="right num">{{ t.count }}</td></tr>
                }
              </tbody></table></div>
            <app-paginator [total]="tags.total()" [page]="tags.currentPage()" [pageSize]="tags.pageSize()" (pageChange)="tags.setPage($event)" (pageSizeChange)="tags.setPageSize($event)" />
          }
        </section>
      }
    } @else {
      <div class="grid-12"><app-skeleton class="c-4" height="420px" radius="20px" /><app-skeleton class="c-4" height="420px" radius="20px" /><app-skeleton class="c-4" height="420px" radius="20px" /></div>
      <div class="sec"><app-skeleton height="360px" radius="20px" /></div>
    }
  `,
  styles: [`
    .sec { margin-top: 16px; } .srch { min-width: min(260px, 100%); }
    .bars { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 12px; }
    .bars .r { display: flex; justify-content: space-between; font-size: .84rem; margin-bottom: 5px; } .bars small { color: var(--faint); font-size: .76rem; }
    .persona strong { display: block; font-size: 1.6rem; font-weight: 850; letter-spacing: -.03em; background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .persona p { color: var(--muted); margin: 6px 0 12px; } .traits { display: flex; gap: 8px; flex-wrap: wrap; }
    .mini { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; } .mini div { display: flex; flex-direction: column; } .mini small { color: var(--faint); font-size: .76rem; }
    .mini b { font-size: 1.35rem; font-weight: 800; display: inline-flex; align-items: center; gap: 4px; } .mini b app-icon { color: var(--warning); }
    .feed { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
    .feed li { display: flex; gap: 12px; animation: fadeUp .4s both; animation-delay: calc(var(--i) * 60ms); }
    .feed .ic { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; flex: none; }
    .feed li.good .ic { color: var(--success); background: color-mix(in srgb, var(--success) 15%, transparent); }
    .feed li.warn .ic { color: var(--warning); background: color-mix(in srgb, var(--warning) 15%, transparent); }
    .feed li.bad .ic { color: var(--danger); background: color-mix(in srgb, var(--danger) 15%, transparent); }
    .feed li.info .ic { color: var(--info); background: color-mix(in srgb, var(--info) 15%, transparent); }
    .feed b { display: block; font-size: .9rem; } .feed small { color: var(--muted); font-size: .8rem; line-height: 1.4; display: block; }
    .range { width: 100%; accent-color: var(--primary); }
    .wi { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; padding: 14px; border-radius: 16px; background: var(--grad-soft); } .wi div { display: flex; flex-direction: column; }
    .wi small { color: var(--muted); font-size: .78rem; } .wi b { font-size: 1.3rem; font-weight: 800; }
    .big { font-size: 2.6rem; font-weight: 850; letter-spacing: -.04em; line-height: 1; background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .note { color: var(--muted); font-size: .88rem; margin: 6px 0 12px; line-height: 1.5; }
    .duo { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; } .duo div { display: flex; flex-direction: column; gap: 4px; } .duo small { color: var(--faint); font-size: .76rem; } .duo b { font-size: 1.05rem; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; font-size: .8rem; color: var(--muted); } .legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
  `],
})
export class InsightsLabComponent {
  protected readonly filters = inject(AnalyticsFilterService);
  protected readonly refresh = inject(RefreshService);
  private readonly api = inject(AnalyticsApi);
  private readonly budgetsApi = inject(BudgetsApi);
  private readonly auth = inject(AuthService);
  private readonly refData = inject(ReferenceDataService);

  protected readonly lab = asyncState<Lab>();
  protected readonly whatCategory = signal<string | null>(null);
  protected readonly cut = signal(20);
  private readonly today = new Date();

  protected readonly compact = (n: number): string => formatMoney(n, this.auth.currency(), { compact: true });
  protected readonly duoMax = (a: number, b: number): number => Math.max(a, b, 1);

  protected readonly anomalies = new TableState<AnomalyDto>(() => this.lab.data()?.anomalies ?? [], {
    searchText: (a) => `${a.description ?? ''} ${a.categoryName}`,
    comparers: { date: (a, b) => a.occurredAt.localeCompare(b.occurredAt), amount: (a, b) => compareNumber(a.amount, b.amount), z: (a, b) => compareNumber(a.zScore, b.zScore) },
    defaultSort: { key: 'z', dir: 'desc' },
    pageSize: 10,
  });

  protected readonly tags = new TableState<TagStatDto>(() => this.lab.data()?.tags ?? [], {
    searchText: (t) => t.tag,
    comparers: { tag: (a, b) => compareText(a.tag, b.tag), expense: (a, b) => compareNumber(a.expense, b.expense), income: (a, b) => compareNumber(a.income, b.income), count: (a, b) => compareNumber(a.count, b.count) },
    defaultSort: { key: 'expense', dir: 'desc' },
    pageSize: 10,
  });

  constructor() {
    const safe = <T>(source: Observable<T>): Observable<T | null> => source.pipe(catchError(() => of(null)));

    autoLoad(this.lab, () => {
      this.refresh.version();
      const f = this.filters.filter();
      const monthsFilter = { ...f, from: ymd(addMonths(startOfMonth(this.today), -11)), to: ymd(endOfMonth(this.today)) };

      return forkJoin({
        summary: safe(this.api.summary(f)),
        days: safe(this.api.trend(f, 'Day')),
        months: safe(this.api.trend(monthsFilter, 'Month')),
        patterns: safe(this.api.patterns(f)),
        top: safe(this.api.topDescriptions(f, 'Expense', 50)),
        recurring: safe(this.api.recurring()),
        anomalies: safe(this.api.anomalies(f)),
        forecast: safe(this.api.forecast()),
        budgets: safe(this.budgetsApi.status()),
        categories: safe(this.api.categories(f, 'Expense')),
        tags: safe(this.api.tags(f)),
      });
    });
  }

  private readonly completeMonths = computed(() => {
    const key = ymd(startOfMonth(this.today));
    return (this.lab.data()?.months ?? []).filter((m) => m.periodStart < key);
  });

  private readonly activeMonths = computed(() => this.completeMonths().filter((m) => m.income > 0 || m.expense > 0));
  private readonly avgIncome = computed(() => this.mean(this.activeMonths().map((m) => m.income)));
  private readonly avgExpense = computed(() => this.mean(this.activeMonths().map((m) => m.expense)));
  private readonly balance = computed(() => {
    const accounts = this.refData.activeAccounts();
    return accounts.length ? accounts.reduce((s, a) => s + a.currentBalance, 0) : null;
  });

  protected readonly health = computed(() => {
    const d = this.lab.data();
    if (!d?.summary) return null;
    return healthScore({
      savingsRatePercent: d.summary.savingsRatePercent,
      budgets: d.budgets ?? [],
      monthlyExpenses: this.activeMonths().map((m) => m.expense),
      recurringMonthlyCost: (d.recurring ?? []).reduce((s, r) => s + r.monthlyCost, 0),
      avgMonthlyIncome: this.avgIncome(),
      avgMonthlyExpense: this.avgExpense(),
      balance: this.balance(),
    });
  });

  protected readonly weekend = computed(() => {
    const p = this.lab.data()?.patterns;
    return p ? weekendSplit(p) : null;
  });

  protected readonly persona = computed(() => spendingPersona(this.lab.data()?.patterns ?? null, this.weekend()));
  protected readonly payday = computed(() => paydayEffect(this.lab.data()?.days ?? []));
  protected readonly streak = computed(() => noSpendStats(this.lab.data()?.days ?? [], todayYmd()));
  protected readonly inflation = computed(() => lifestyleInflation(this.completeMonths()));

  protected readonly micro = computed(() => {
    const d = this.lab.data();
    return d?.top && d.summary ? microSpend(d.top, d.summary) : null;
  });

  protected readonly microRanks = computed<RankItem[]>(() =>
    (this.micro()?.items ?? []).map((t, i) => ({
      id: t.description, label: t.description, value: t.total, color: colorAt(i + 3),
      valueText: this.compact(t.total), sub: `${t.count} times · avg ${this.compact(t.average)}`,
    })));

  protected readonly feed = computed(() => {
    const d = this.lab.data();
    return buildInsights({
      summary: d?.summary ?? null,
      categories: d?.categories?.items ?? [],
      budgets: d?.budgets ?? [],
      anomalies: d?.anomalies ?? [],
      recurring: d?.recurring ?? [],
      payday: this.payday(),
      noSpend: this.streak(),
      forecast: d?.forecast ?? null,
      money: this.compact,
    });
  });

  protected readonly flows = computed<FlowItem[]>(() =>
    (this.lab.data()?.categories?.items ?? []).map((c, i) => ({ label: c.name, value: c.amount, color: c.color ?? colorAt(i) })));

  protected readonly workdays = computed<RankItem[]>(() => {
    const d = this.lab.data();
    if (!d?.summary || !d.categories) return [];
    return categoryWorkdays(d.categories.items, d.summary.income, this.filters.periodDays()).map((w, i) => ({
      id: w.name, label: w.name, value: w.days, color: w.color ?? colorAt(i),
      valueText: `${w.days.toFixed(1)} days`, sub: this.compact(w.amount),
    }));
  });

  protected readonly categoryChoices = computed<SelectOption[]>(() =>
    (this.lab.data()?.categories?.items ?? []).map((c) => ({ value: c.categoryId, label: c.name, color: c.color })));

  protected readonly whatIf = computed(() => {
    const d = this.lab.data();
    const items = d?.categories?.items ?? [];
    const item = items.find((c) => c.categoryId === this.whatCategory()) ?? items[0];
    if (!d?.summary || !item) return null;

    const pct = this.cut() / 100;
    const savedInPeriod = item.amount * pct;
    const months = Math.max(0.25, this.filters.periodDays() / MONTH_DAYS);
    const monthly = savedInPeriod / months;
    const income = d.summary.income;
    const dailyExpense = this.avgExpense() / MONTH_DAYS;

    return {
      monthly,
      yearly: monthly * 12,
      newRate: income > 0 ? ((d.summary.net + savedInPeriod) / income) * 100 : null,
      extraRunwayDays: this.balance() !== null && dailyExpense > 0 ? this.runwayAfter(dailyExpense, monthly) : null,
    };
  });

  protected readonly runway = computed(() => {
    const b = this.balance();
    return b === null ? null : runwayDays(b, this.avgExpense() / MONTH_DAYS);
  });

  protected readonly forecastChart = computed<{ labels: string[]; series: ChartSeries[] } | null>(() => {
    const f = this.lab.data()?.forecast;
    const complete = this.completeMonths().slice(-5);
    if (!f || (complete.length === 0 && f.spentSoFar === 0)) return null;

    const label = (d: string) => formatDate(parseYmd(d), 'month');
    const labels = [...complete.map((m) => label(m.periodStart)), 'This month', ...f.nextMonths.map((m) => label(m.monthStart))];
    const actual = [...complete.map((m) => m.expense), f.spentSoFar, ...f.nextMonths.map(() => 0)];
    const projected = [
      ...complete.map(() => 0),
      Math.max(0, f.projectedMonthEnd - f.spentSoFar),
      ...f.nextMonths.map((m) => m.projectedExpense),
    ];
    return {
      labels,
      series: [{ name: 'Actual', color: '#7c6cff', values: actual }, { name: 'Projected', color: '#fbbf24', values: projected }],
    };
  });

  protected setWhatCategory(value: string | number | null): void {
    this.whatCategory.set(typeof value === 'string' ? value : null);
  }

  protected onCut(event: Event): void {
    this.cut.set(Number((event.target as HTMLInputElement).value));
  }

  protected pct(value: number, signed = false): string {
    return formatPercent(value, 1, signed);
  }

  protected date(value: string): string {
    return formatDate(value);
  }

  private runwayAfter(dailyExpense: number, monthlySaving: number): number | null {
    const balance = this.balance();
    if (balance === null || balance <= 0) return null;
    const newDaily = Math.max(0.01, dailyExpense - monthlySaving / MONTH_DAYS);
    return balance / newDaily - balance / dailyExpense;
  }

  private mean(values: number[]): number {
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }
}
