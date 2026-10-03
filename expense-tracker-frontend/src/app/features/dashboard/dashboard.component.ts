import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsApi } from '../../core/api/analytics.api';
import { BudgetsApi } from '../../core/api/budgets.api';
import { TransactionsApi } from '../../core/api/transactions.api';
import {
  buildInsights, healthScore, noSpendStats, paydayEffect, safeToSpend, spendingPace,
} from '../../core/analytics/insights';
import {
  BudgetStatusDto, CategoryBreakdownDto, ForecastDto, PagedResult, RecurringExpenseDto, SummaryDto, TransactionDto, TrendPointDto,
} from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { TimelineService } from '../../core/services/timeline.service';
import { TxFormService } from '../../core/services/tx-form.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { colorAt } from '../../core/utils/colors';
import { DateRange, addDays, addMonths, autoGranularity, endOfMonth, parseYmd, startOfMonth, todayYmd, ymd } from '../../core/utils/dates';
import { clamp, formatDate, formatMoney, formatPercent, greeting } from '../../core/utils/format';
import { debounced } from '../../core/utils/debounce';
import { ChartSeries } from '../../shared/charts/chart-utils';
import { DonutChartComponent, DonutItem } from '../../shared/charts/donut-chart.component';
import { GaugeComponent } from '../../shared/charts/gauge.component';
import { LineChartComponent } from '../../shared/charts/line-chart.component';
import { ProgressBarComponent } from '../../shared/charts/progress-bar.component';
import { SparklineComponent } from '../../shared/charts/sparkline.component';
import { SearchBoxComponent } from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { CountUpComponent, MoneyComponent, MoneyPipe } from '../../shared/ui/money.component';
import { PaginatorComponent } from '../../shared/ui/paginator.component';
import { TimelineFilterComponent } from '../../shared/ui/timeline-filter.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../shared/ui/ui-bits.component';
import { TransactionListComponent } from '../transactions/transaction-list.component';
import { readPageSize, persistPageSize } from '../../core/utils/table-state';

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink, IconComponent, MoneyComponent, MoneyPipe, CountUpComponent, TimelineFilterComponent, SparklineComponent, LineChartComponent,
    DonutChartComponent, GaugeComponent, ProgressBarComponent, PaginatorComponent, SearchBoxComponent, TransactionListComponent, EmptyStateComponent,
    ErrorStateComponent, SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>{{ greeting }}, {{ firstName() }}</h1>
          <p>Here is how your money is moving.</p>
        </div>
        @if (hasData()) { <app-timeline-filter [range]="range()" (rangeChange)="setRange($event)" /> }
      </div>

      @if (anyData.error(); as e) {
        <app-error-state [error]="e" (retry)="reloadAll()" />
      } @else if (anyData.loaded() && !hasData()) {
        <section class="card card-pad welcome">
          <div class="welcome-art"><i class="o1"></i><i class="o2"></i><app-icon name="sparkles" [size]="34" /></div>
          <h2>Let's get your money in here</h2>
          <p>Import a statement to see months of history in seconds, or add your first transaction by hand. Duplicates are skipped automatically.</p>
          <div class="cta">
            <a routerLink="/import" class="btn btn-primary"><app-icon name="upload" [size]="18" /> Import a file</a>
            <button type="button" class="btn btn-secondary" (click)="txForm.openNew()"><app-icon name="plus" [size]="18" /> Add a transaction</button>
          </div>
          <div class="steps">
            <div><b>1</b><span>Import your .xlsx export</span></div>
            <div><b>2</b><span>Review the preview</span></div>
            <div><b>3</b><span>Explore analytics</span></div>
          </div>
        </section>
      } @else {
        <div class="cols-4 reveal kpis">
          <article class="card card-pad kpi hover">
            <div class="top"><span class="icon-tile" style="--tile: var(--success)"><app-icon name="arrow-down-right" /></span><span class="lbl">Income</span>
              @if (summary.data(); as s) { <span class="delta" [class]="deltaClass(s.incomeChangePercent, true)">{{ deltaText(s.incomeChangePercent) }}</span> }</div>
            @if (summary.data(); as s) { <strong class="big"><app-money [value]="s.income" /></strong> } @else { <app-skeleton height="34px" width="70%" /> }
            <div class="spark"><app-sparkline [values]="incomeSeries()" color="var(--success)" /></div>
          </article>

          <article class="card card-pad kpi hover">
            <div class="top"><span class="icon-tile" style="--tile: var(--danger)"><app-icon name="arrow-up-right" /></span><span class="lbl">Expenses</span>
              @if (summary.data(); as s) { <span class="delta" [class]="deltaClass(s.expenseChangePercent, false)">{{ deltaText(s.expenseChangePercent) }}</span> }</div>
            @if (summary.data(); as s) { <strong class="big"><app-money [value]="s.expense" /></strong> } @else { <app-skeleton height="34px" width="70%" /> }
            <div class="spark"><app-sparkline [values]="expenseSeries()" color="var(--danger)" /></div>
          </article>

          <article class="card card-pad kpi hover">
            <div class="top"><span class="icon-tile" style="--tile: var(--primary)"><app-icon name="wallet" /></span><span class="lbl">Net savings</span></div>
            @if (summary.data(); as s) {
              <strong class="big" [class.text-danger]="s.net < 0"><app-money [value]="s.net" /></strong>
              <small class="muted">{{ s.transactionCount }} transactions · avg {{ s.averageDailyExpense | money: 'compact' }}/day</small>
            } @else { <app-skeleton height="34px" width="70%" /> }
            <div class="spark"><app-sparkline [values]="netSeries()" color="var(--primary)" /></div>
          </article>

          <article class="card card-pad kpi hover">
            <div class="top"><span class="icon-tile" style="--tile: var(--accent)"><app-icon name="percent" /></span><span class="lbl">Savings rate</span></div>
            @if (summary.data(); as s) {
              @if (s.savingsRatePercent !== null) {
                <strong class="big" [class.text-danger]="s.savingsRatePercent < 0"><app-count-up [value]="s.savingsRatePercent" [format]="pct" /></strong>
                <small class="muted">{{ rateHint(s.savingsRatePercent) }}</small>
              } @else {
                <strong class="big faint">—</strong>
                <small class="muted">No income recorded in this period</small>
              }
            } @else { <app-skeleton height="34px" width="50%" /> }
            <div class="rate-bar"><app-progress [value]="clampedRate()" tone="primary" [marker]="20" /></div>
          </article>
        </div>

        <div class="grid-12 section">
          <section class="card card-pad c-8">
            <div class="card-head">
              <div><h3 class="card-title"><app-icon name="activity" [size]="18" /> Cash flow</h3><p class="card-sub">Income and spending over time</p></div>
              <a routerLink="/analytics/trends" class="btn btn-ghost btn-sm">Details <app-icon name="arrow-right" [size]="14" /></a>
            </div>
            @if (trend.error(); as e) { <app-error-state [error]="e" (retry)="reloadAll()" /> }
            @else { @if (trend.data(); as points) {
              @if (hasFlow(points)) {
                <app-line-chart [labels]="trendLabels()" [series]="trendSeries()" [format]="compactMoney" [height]="270" ariaLabel="Income and expenses over time" />
                <div class="legend"><span><i style="background: var(--success)"></i>Income</span><span><i style="background: var(--danger)"></i>Expenses</span></div>
              } @else {
                <app-empty-state icon="activity" title="No activity in this period" message="Pick another range, or add a transaction to see your cash flow." />
              }
            } @else { <app-skeleton height="270px" radius="16px" /> } }
          </section>

          <section class="card card-pad c-4">
            <div class="card-head">
              <div><h3 class="card-title"><app-icon name="chart" [size]="18" /> Where it goes</h3><p class="card-sub">Spending by category</p></div>
            </div>
            @if (categories.error(); as e) { <app-error-state [error]="e" (retry)="reloadAll()" /> }
            @else { @if (categories.data(); as c) {
              @if (c.items.length > 0) {
                <app-donut-chart [items]="donutItems()" [size]="196" [thickness]="24" centerLabel="Spent" [centerFormat]="compactMoney" [(active)]="activeSlice" ariaLabel="Spending by category" />
                <ul class="cats">
                  @for (it of topCategories(); track it.label; let i = $index) {
                    <li [class.on]="activeSlice() === i" (pointerenter)="activeSlice.set(i)" (pointerleave)="activeSlice.set(null)">
                      <i class="dot" [style.background]="it.color"></i><span class="truncate">{{ it.label }}</span><b class="num">{{ it.value | money: 'compact' }}</b>
                    </li>
                  }
                </ul>
              } @else {
                <app-empty-state icon="chart" title="No spending yet" message="Expenses in this period will be broken down here." />
              }
            } @else { <app-skeleton height="260px" radius="16px" /> } }
          </section>
        </div>

        <div class="grid-12 section">
          <section class="card card-pad c-5">
            <div class="card-head">
              <div><h3 class="card-title"><app-icon name="zap" [size]="18" /> Spending pace</h3><p class="card-sub">This month versus last month, cumulative</p></div>
              @if (pace(); as p) {
                <span class="delta" [class]="p.deltaToDate > 0 ? 'down' : p.deltaToDate < 0 ? 'up' : 'flat'">{{ p.deltaToDate | money: 'signed' }}</span>
              }
            </div>
            @if (paceCurrent.error() || pacePrevious.error()) { <app-error-state [error]="paceCurrent.error() ?? pacePrevious.error()" (retry)="reloadAll()" /> }
            @else { @if (pace(); as p) {
              <app-line-chart [labels]="p.labels" [series]="paceSeries()" [format]="compactMoney" [height]="220" ariaLabel="Cumulative spending this month versus last month" />
              <div class="legend">
                <span><i style="background: var(--primary)"></i>This month</span><span><i style="background: var(--faint)"></i>Last month</span>
                @if (forecast.data(); as f) { <span><i style="background: var(--warning)"></i>Projected {{ f.projectedMonthEnd | money: 'compact' }}</span> }
              </div>
              <p class="note">
                @if (p.deltaToDate > 0) { You're <b class="text-danger">{{ p.deltaToDate | money }}</b> ahead of last month's pace. }
                @else if (p.deltaToDate < 0) { You're <b class="text-success">{{ -p.deltaToDate | money }}</b> behind last month's pace. Nice. }
                @else { Exactly on last month's pace. }
              </p>
            } @else { <app-skeleton height="270px" radius="16px" /> } }
          </section>

          <section class="card card-pad c-3">
            <div class="card-head"><h3 class="card-title"><app-icon name="shield" [size]="18" /> Health score</h3></div>
            @if (health(); as h) {
              <app-gauge [value]="h.score" label="out of 100" [sublabel]="h.grade" [size]="200" />
              <ul class="hl">
                @for (c of h.components; track c.key) {
                  <li><span>{{ c.label }}</span><app-progress [value]="c.score" [tone]="c.score >= 70 ? 'OnTrack' : c.score >= 40 ? 'Warning' : 'Exceeded'" /></li>
                }
              </ul>
              <a routerLink="/analytics/insights" class="btn btn-ghost btn-sm btn-block">How it's calculated</a>
            } @else if (healthLoading()) { <app-skeleton height="230px" radius="16px" /> }
            @else { <app-empty-state icon="shield" title="Not enough data yet" message="Add income and a few weeks of spending to unlock your score." /> }
          </section>

          <section class="card card-pad c-4">
            <div class="card-head"><h3 class="card-title"><app-icon name="target" [size]="18" /> Safe to spend</h3></div>
            @if (safe(); as s) {
              <div class="safe">
                <strong class="big"><app-money [value]="s.perDay" /></strong>
                <span class="muted">per day for the next {{ s.daysLeft }} day{{ s.daysLeft === 1 ? '' : 's' }}</span>
              </div>
              <p class="note">
                @if (s.basis === 'budget') { Based on your overall monthly budget — {{ s.remaining | money }} left. }
                @else { Based on your recent monthly average — {{ s.remaining | money }} left to match it. }
              </p>
            } @else if (forecast.loaded() || budgets.loaded()) {
              <app-empty-state icon="target" title="Set a budget" message="Create an overall monthly budget to see your daily allowance.">
                <a routerLink="/budgets" class="btn btn-secondary btn-sm">Create budget</a>
              </app-empty-state>
            } @else { <app-skeleton height="120px" radius="16px" /> }

            @if (forecast.data(); as f) {
              <hr class="divider" />
              <div class="fc">
                <div><small class="muted">Projected month-end</small><b class="num">{{ f.projectedMonthEnd | money }}</b></div>
                <div><small class="muted">Daily run rate</small><b class="num">{{ f.dailyRunRate | money }}</b></div>
              </div>
            }
          </section>
        </div>

        <div class="grid-12 section">
          <section class="card card-pad c-4">
            <div class="card-head"><h3 class="card-title"><app-icon name="target" [size]="18" /> Budgets</h3><a routerLink="/budgets" class="btn btn-ghost btn-sm">Manage</a></div>
            @if (budgets.data(); as list) {
              @if (list.length > 0) {
                <ul class="bl">
                  @for (b of list.slice(0, 4); track b.budget.id) {
                    <li>
                      <div class="r"><span class="truncate">{{ b.budget.categoryName ?? 'Overall' }}</span><b class="num">{{ b.spent | money: 'compact' }} / {{ b.budget.amount | money: 'compact' }}</b></div>
                      <app-progress [value]="b.percentUsed" [tone]="b.state" [marker]="b.budget.alertThresholdPercent" />
                    </li>
                  }
                </ul>
              } @else {
                <app-empty-state icon="target" title="No budgets yet" message="Set limits to get alerts before you overspend."><a routerLink="/budgets" class="btn btn-secondary btn-sm">Add a budget</a></app-empty-state>
              }
            } @else { @if (budgets.error(); as e) { <app-error-state [error]="e" (retry)="reloadAll()" /> }
            @else { <app-skeleton height="160px" radius="16px" /> } }
          </section>

          <section class="card card-pad c-4">
            <div class="card-head"><h3 class="card-title"><app-icon name="sparkles" [size]="18" /> Insights</h3><a routerLink="/analytics/insights" class="btn btn-ghost btn-sm">Insights Lab</a></div>
            @if (insights().length > 0) {
              <ul class="ins">
                @for (i of insights().slice(0, 4); track i.title; let n = $index) {
                  <li [class]="i.tone" [style.--i]="n"><span class="ic"><app-icon [name]="i.icon" [size]="16" /></span><div><b>{{ i.title }}</b><small>{{ i.text }}</small></div></li>
                }
              </ul>
            } @else if (summary.loaded()) {
              <app-empty-state icon="sparkles" title="Nothing to flag" message="Insights appear as your history grows." />
            } @else { <app-skeleton height="160px" radius="16px" /> }
          </section>

          <section class="card card-pad c-4">
            <div class="card-head"><h3 class="card-title"><app-icon name="repeat" [size]="18" /> Upcoming bills</h3><a routerLink="/analytics/recurring" class="btn btn-ghost btn-sm">All</a></div>
            @if (recurring.data(); as list) {
              @if (upcoming().length > 0) {
                <ul class="up">
                  @for (r of upcoming(); track r.description) {
                    <li><span class="when"><b>{{ day(r.nextExpectedDate) }}</b><small>{{ month(r.nextExpectedDate) }}</small></span><span class="truncate">{{ r.description }}<small>{{ r.frequency }}</small></span><b class="num">{{ r.typicalAmount | money }}</b></li>
                  }
                </ul>
              } @else {
                <app-empty-state icon="repeat" [title]="list.length ? 'Nothing due soon' : 'No recurring payments found'" message="Regular payments are detected automatically after a few months of history." />
              }
            } @else { @if (recurring.error(); as e) { <app-error-state [error]="e" (retry)="reloadAll()" /> }
            @else { <app-skeleton height="160px" radius="16px" /> } }
          </section>
        </div>

        <section class="card card-pad section recent" [class.is-loading]="recent.loading() && !!recent.data()">
          <div class="card-head">
            <div><h3 class="card-title"><app-icon name="list" [size]="18" /> Transactions</h3><p class="card-sub">Latest activity in the selected period</p></div>
            <div class="toolbar">
              <app-search-box class="srch" [value]="search()" (valueChange)="onSearch($event)" placeholder="Search transactions" />
              <a routerLink="/transactions" class="btn btn-secondary btn-sm">View all</a>
            </div>
          </div>

          @if (recent.error(); as e) { <app-error-state [error]="e" (retry)="reloadAll()" /> }
          @else { @if (recent.data(); as page) {
            @if (page.items.length > 0) {
              <app-transaction-list [items]="page.items" [sortBy]="sortBy()" [sortDir]="sortDir()" (sortToggle)="toggleSort($event)" (rowClick)="txForm.openEdit($event)" />
              <app-paginator [total]="page.totalCount" [page]="pageNo()" [pageSize]="pageSize()" (pageChange)="pageNo.set($event)" (pageSizeChange)="setPageSize($event)" />
            } @else {
              <app-empty-state icon="inbox" [title]="search() ? 'No matches' : 'No transactions in this period'" [message]="search() ? 'Try a different search term.' : 'Choose another timeline range or add a transaction.'">
                @if (search()) { <button type="button" class="btn btn-secondary btn-sm" (click)="onSearch('')">Clear search</button> }
                @else { <button type="button" class="btn btn-primary btn-sm" (click)="txForm.openNew()"><app-icon name="plus" [size]="16" /> Add transaction</button> }
              </app-empty-state>
            }
          } @else { <div class="stack"><app-skeleton height="52px" /><app-skeleton height="52px" /><app-skeleton height="52px" /><app-skeleton height="52px" /></div> } }
        </section>
      }
    </div>
  `,
  styles: [`
    .section { margin-top: 16px; }
    .kpi { display: flex; flex-direction: column; gap: 6px; overflow: hidden; }
    .kpi .top { display: flex; align-items: center; gap: 10px; }
    .kpi .lbl { color: var(--muted); font-weight: 600; font-size: .9rem; flex: 1; }
    .kpi .big { font-size: clamp(1.45rem, 2.2vw, 1.9rem); font-weight: 800; letter-spacing: -.03em; line-height: 1.15; margin-top: 4px; }
    .kpi .spark { margin: 6px -8px -8px; opacity: .95; }
    .kpi .rate-bar { margin-top: 14px; }
    .legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; font-size: .8rem; color: var(--muted); }
    .legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
    .note { margin-top: 10px; font-size: .88rem; color: var(--muted); line-height: 1.5; }
    .cats { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 4px; }
    .cats li { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: 10px; font-size: .88rem; transition: background .2s; cursor: default; }
    .cats li.on, .cats li:hover { background: var(--surface-2); }
    .cats li span { flex: 1; }
    .hl { list-style: none; margin: 12px 0; padding: 0; display: grid; gap: 10px; }
    .hl li { display: grid; gap: 5px; font-size: .78rem; color: var(--muted); }
    .safe { display: flex; flex-direction: column; gap: 2px; }
    .safe .big { font-size: 2.1rem; font-weight: 800; letter-spacing: -.03em; background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .fc { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .fc div { display: flex; flex-direction: column; }
    .fc b { font-size: 1.05rem; }
    .bl, .ins, .up { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
    .bl .r { display: flex; justify-content: space-between; gap: 10px; font-size: .88rem; margin-bottom: 6px; }
    .bl .r b { font-size: .82rem; color: var(--muted); white-space: nowrap; }
    .ins li { display: flex; gap: 12px; align-items: flex-start; animation: fadeUp .4s both; animation-delay: calc(var(--i) * 70ms); }
    .ins .ic { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; flex: none; }
    .ins li.good .ic { color: var(--success); background: color-mix(in srgb, var(--success) 15%, transparent); }
    .ins li.warn .ic { color: var(--warning); background: color-mix(in srgb, var(--warning) 15%, transparent); }
    .ins li.bad .ic { color: var(--danger); background: color-mix(in srgb, var(--danger) 15%, transparent); }
    .ins li.info .ic { color: var(--info); background: color-mix(in srgb, var(--info) 15%, transparent); }
    .ins b { display: block; font-size: .9rem; }
    .ins small { color: var(--muted); font-size: .8rem; line-height: 1.4; display: block; }
    .up li { display: flex; align-items: center; gap: 12px; }
    .up .when { display: flex; flex-direction: column; align-items: center; width: 44px; padding: 6px 0; border-radius: 12px; background: var(--surface-2); flex: none; }
    .up .when b { font-size: 1.05rem; line-height: 1; }
    .up .when small { font-size: .66rem; text-transform: uppercase; color: var(--faint); }
    .up li > span.truncate { flex: 1; display: flex; flex-direction: column; font-weight: 600; font-size: .9rem; }
    .up li > span small { color: var(--faint); font-weight: 400; font-size: .76rem; }
    .recent .srch { min-width: min(280px, 100%); }
    .welcome { text-align: center; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: clamp(28px, 6vw, 60px) 20px; overflow: hidden; }
    .welcome h2 { font-size: clamp(1.4rem, 3vw, 2rem); font-weight: 800; }
    .welcome p { color: var(--muted); max-width: 520px; line-height: 1.6; }
    .welcome-art { position: relative; display: grid; place-items: center; width: 84px; height: 84px; border-radius: 28px; color: #fff; background: var(--grad); box-shadow: 0 20px 50px -12px var(--primary); animation: float 4s ease-in-out infinite; }
    .welcome-art i { position: absolute; border-radius: 50%; background: var(--grad); opacity: .35; }
    .welcome-art .o1 { width: 130px; height: 130px; animation: pulseRing 2.8s infinite; }
    .welcome-art .o2 { width: 190px; height: 190px; opacity: .15; animation: pulseRing 2.8s .8s infinite; }
    .cta { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-top: 8px; }
    .steps { display: flex; gap: 18px 28px; flex-wrap: wrap; justify-content: center; margin-top: 18px; color: var(--muted); font-size: .9rem; }
    .steps div { display: flex; align-items: center; gap: 10px; }
    .steps b { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; color: var(--primary-2); background: color-mix(in srgb, var(--primary) 16%, transparent); font-size: .8rem; }
  `],
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly timeline = inject(TimelineService);
  private readonly analytics = inject(AnalyticsApi);
  private readonly budgetsApi = inject(BudgetsApi);
  private readonly txApi = inject(TransactionsApi);
  private readonly refresh = inject(RefreshService);
  private readonly refData = inject(ReferenceDataService);
  protected readonly txForm = inject(TxFormService);

  protected readonly greeting = greeting();
  protected readonly firstName = computed(() => (this.auth.user()?.fullName ?? '').split(' ')[0] || 'there');
  protected readonly range = this.timeline.range;
  protected readonly activeSlice = signal<number | null>(null);

  // ---- recent transactions (server-side paging, search and sort)
  protected readonly search = signal('');
  protected readonly pageNo = signal(1);
  protected readonly pageSize = signal(readPageSize('dashboard', 10));
  protected readonly sortBy = signal<'date' | 'amount'>('date');
  protected readonly sortDir = signal<'asc' | 'desc'>('desc');
  private readonly debouncedSearch = debounced(this.search, 300);

  // ---- data
  protected readonly anyData = asyncState<PagedResult<TransactionDto>>();
  protected readonly summary = asyncState<SummaryDto>();
  protected readonly categories = asyncState<CategoryBreakdownDto>();
  protected readonly trend = asyncState<TrendPointDto[]>();
  protected readonly months = asyncState<TrendPointDto[]>();
  protected readonly paceCurrent = asyncState<TrendPointDto[]>();
  protected readonly pacePrevious = asyncState<TrendPointDto[]>();
  protected readonly forecast = asyncState<ForecastDto>();
  protected readonly budgets = asyncState<BudgetStatusDto[]>();
  protected readonly recurring = asyncState<RecurringExpenseDto[]>();
  protected readonly recent = asyncState<PagedResult<TransactionDto>>();

  protected readonly hasData = computed(() => (this.anyData.data()?.totalCount ?? 0) > 0 || !this.anyData.loaded());
  private readonly filter = computed(() => ({ from: this.range().from, to: this.range().to }));
  private readonly today = new Date();

  protected readonly pct = (n: number): string => formatPercent(n, 1);
  protected readonly compactMoney = (n: number): string => formatMoney(n, this.auth.currency(), { compact: true });

  constructor() {
    const v = () => this.refresh.version();

    autoLoad(this.anyData, () => (v(), this.txApi.query({ page: 1, pageSize: 1, sortBy: 'date', sortDir: 'desc' })));
    autoLoad(this.summary, () => (v(), this.analytics.summary(this.filter())));
    autoLoad(this.categories, () => (v(), this.analytics.categories(this.filter(), 'Expense')));
    autoLoad(this.trend, () => (v(), this.analytics.trend(this.filter(), autoGranularity(this.range()))));

    const monthStart = startOfMonth(this.today);
    autoLoad(this.months, () => (v(), this.analytics.trend({ from: ymd(addMonths(monthStart, -6)), to: ymd(endOfMonth(this.today)) }, 'Month')));
    autoLoad(this.paceCurrent, () => (v(), this.analytics.trend({ from: ymd(monthStart), to: ymd(endOfMonth(this.today)) }, 'Day')));
    const prevStart = addMonths(monthStart, -1);
    autoLoad(this.pacePrevious, () => (v(), this.analytics.trend({ from: ymd(prevStart), to: ymd(endOfMonth(prevStart)) }, 'Day')));
    autoLoad(this.forecast, () => (v(), this.analytics.forecast()));
    autoLoad(this.budgets, () => (v(), this.budgetsApi.status()));
    autoLoad(this.recurring, () => (v(), this.analytics.recurring()));

    autoLoad(this.recent, () => {
      v();
      return this.txApi.query({
        ...this.filter(), page: this.pageNo(), pageSize: this.pageSize(), sortBy: this.sortBy(), sortDir: this.sortDir(), search: this.debouncedSearch().trim(),
      });
    });
  }

  // ---- derived series
  protected readonly incomeSeries = computed(() => (this.trend.data() ?? []).map((p) => p.income));
  protected readonly expenseSeries = computed(() => (this.trend.data() ?? []).map((p) => p.expense));
  protected readonly netSeries = computed(() => (this.trend.data() ?? []).map((p) => p.net));
  protected readonly clampedRate = computed(() => clamp(this.summary.data()?.savingsRatePercent ?? 0, 0, 100));

  protected readonly trendLabels = computed(() => {
    const gran = autoGranularity(this.range());
    return (this.trend.data() ?? []).map((p) => {
      const d = parseYmd(p.periodStart);
      return gran === 'Month' || gran === 'Quarter' ? formatDate(d, 'month') : formatDate(d, 'day');
    });
  });

  protected readonly trendSeries = computed(() => [
    { name: 'Income', color: '#34d399', values: this.incomeSeries() },
    { name: 'Expenses', color: '#fb7185', values: this.expenseSeries() },
  ]);

  protected readonly donutItems = computed<DonutItem[]>(() => {
    const items = this.categories.data()?.items ?? [];
    const top = items.slice(0, 7).map((c, i) => ({ label: c.name, value: c.amount, color: c.color ?? colorAt(i) }));
    const rest = items.slice(7).reduce((s, c) => s + c.amount, 0);
    return rest > 0 ? [...top, { label: 'Other', value: rest, color: '#64748b' }] : top;
  });
  protected readonly topCategories = computed(() => this.donutItems().slice(0, 6));

  protected readonly pace = computed(() => {
    const cur = this.paceCurrent.data();
    const prev = this.pacePrevious.data();
    return cur && prev ? spendingPace(cur, prev, this.today.getDate()) : null;
  });

  protected readonly paceSeries = computed<ChartSeries[]>(() => {
    const p = this.pace();
    if (!p) return [];
    const f = this.forecast.data();
    const series: ChartSeries[] = [
      { name: 'Last month', color: '#6d7399', values: p.previous, dashed: true },
      { name: 'This month', color: '#7c6cff', values: p.current },
    ];
    if (f && p.dayOfMonth < p.labels.length) {
      const last = p.current[p.dayOfMonth - 1] ?? 0;
      series.push({
        name: 'Projected', color: '#fbbf24', dashed: true,
        values: p.labels.map((_, i) => (i === p.dayOfMonth - 1 ? last : i === p.labels.length - 1 ? f.projectedMonthEnd : null)),
      });
    }
    return series;
  });

  private readonly completeMonths = computed(() => {
    const monthKey = ymd(startOfMonth(this.today));
    return (this.months.data() ?? []).filter((m) => m.periodStart < monthKey);
  });

  protected readonly healthLoading = computed(() => !this.summary.loaded() || !this.months.loaded());

  protected readonly health = computed(() => {
    const summary = this.summary.data();
    const months = this.completeMonths();
    if (!summary || !this.months.loaded()) return null;

    const recurringCost = (this.recurring.data() ?? []).reduce((s, r) => s + r.monthlyCost, 0);
    const active = months.filter((m) => m.expense > 0 || m.income > 0);
    const avgIncome = active.length ? active.reduce((s, m) => s + m.income, 0) / active.length : 0;
    const avgExpense = active.length ? active.reduce((s, m) => s + m.expense, 0) / active.length : 0;
    const accounts = this.refData.activeAccounts();

    return healthScore({
      savingsRatePercent: summary.savingsRatePercent,
      budgets: this.budgets.data() ?? [],
      monthlyExpenses: active.map((m) => m.expense),
      recurringMonthlyCost: recurringCost,
      avgMonthlyIncome: avgIncome,
      avgMonthlyExpense: avgExpense,
      balance: accounts.length ? accounts.reduce((s, a) => s + a.currentBalance, 0) : null,
    });
  });

  protected readonly safe = computed(() => safeToSpend(this.budgets.data() ?? [], this.forecast.data()));

  protected readonly upcoming = computed(() => {
    const limit = ymd(addDays(this.today, 30));
    return (this.recurring.data() ?? [])
      .filter((r) => r.nextExpectedDate <= limit && r.nextExpectedDate >= ymd(addDays(this.today, -3)))
      .sort((a, b) => a.nextExpectedDate.localeCompare(b.nextExpectedDate))
      .slice(0, 5);
  });

  protected readonly insights = computed(() =>
    buildInsights({
      summary: this.summary.data(),
      categories: this.categories.data()?.items ?? [],
      budgets: this.budgets.data() ?? [],
      anomalies: [],
      recurring: this.recurring.data() ?? [],
      payday: paydayEffect(this.paceCurrent.data() ?? []),
      noSpend: this.paceCurrent.data() ? noSpendStats(this.paceCurrent.data() ?? [], todayYmd()) : null,
      forecast: this.forecast.data(),
      money: (n) => formatMoney(n, this.auth.currency(), { compact: true }),
    }));

  // ---- actions
  protected setRange(range: DateRange): void {
    this.timeline.set(range);
    this.pageNo.set(1);
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.pageNo.set(1);
  }

  protected toggleSort(key: string): void {
    const k = key === 'amount' ? 'amount' : 'date';
    if (this.sortBy() === k) this.sortDir.set(this.sortDir() === 'desc' ? 'asc' : 'desc');
    else {
      this.sortBy.set(k);
      this.sortDir.set('desc');
    }
    this.pageNo.set(1);
  }

  protected setPageSize(size: number): void {
    this.pageSize.set(size);
    persistPageSize('dashboard', size);
    this.pageNo.set(1);
  }

  protected reloadAll(): void {
    this.refresh.bump();
  }

  protected hasFlow(points: readonly TrendPointDto[]): boolean {
    return points.some((p) => p.income > 0 || p.expense > 0);
  }

  protected deltaClass(change: number | null, goodWhenUp: boolean): string {
    if (change === null || Math.abs(change) < 0.5) return 'flat';
    return (change > 0) === goodWhenUp ? 'up' : 'down';
  }

  protected deltaText(change: number | null): string {
    return change === null ? 'new' : formatPercent(change, 0, true);
  }

  protected rateHint(rate: number): string {
    return rate >= 20 ? 'Above the 20% target' : rate >= 0 ? 'Target is 20% or more' : 'Spending exceeds income';
  }

  protected day(date: string): string {
    return String(parseYmd(date).getDate());
  }

  protected month(date: string): string {
    return parseYmd(date).toLocaleDateString(undefined, { month: 'short' });
  }
}
