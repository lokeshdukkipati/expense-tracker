import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsApi } from '../../core/api/analytics.api';
import { BudgetsApi } from '../../core/api/budgets.api';
import { TransactionsApi } from '../../core/api/transactions.api';
import {
  buildInsights,
  healthScore,
  noSpendStats,
  paydayEffect,
  safeToSpend,
  spendingPace,
} from '../../core/analytics/insights';
import {
  BudgetStatusDto,
  CategoryBreakdownDto,
  ForecastDto,
  PagedResult,
  RecurringExpenseDto,
  SummaryDto,
  TransactionDto,
  TrendPointDto,
} from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { TimelineService } from '../../core/services/timeline.service';
import { TxFormService } from '../../core/services/tx-form.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { colorAt } from '../../core/utils/colors';
import {
  DateRange,
  addDays,
  addMonths,
  autoGranularity,
  endOfMonth,
  parseYmd,
  startOfMonth,
  todayYmd,
  ymd,
} from '../../core/utils/dates';
import {
  clamp,
  formatDate,
  formatMoney,
  formatPercent,
  greeting,
} from '../../core/utils/format';
import { debounced } from '../../core/utils/debounce';
import { persistPageSize, readPageSize } from '../../core/utils/table-state';
import { ChartSeries } from '../../shared/charts/chart-utils';
import {
  DonutChartComponent,
  DonutItem,
} from '../../shared/charts/donut-chart.component';
import { GaugeComponent } from '../../shared/charts/gauge.component';
import { LineChartComponent } from '../../shared/charts/line-chart.component';
import { ProgressBarComponent } from '../../shared/charts/progress-bar.component';
import { SparklineComponent } from '../../shared/charts/sparkline.component';
import { SearchBoxComponent } from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import {
  CountUpComponent,
  MoneyComponent,
  MoneyPipe,
} from '../../shared/ui/money.component';
import { PaginatorComponent } from '../../shared/ui/paginator.component';
import {
  SelectComponent,
  SelectOption,
} from '../../shared/ui/select.component';
import { TimelineFilterComponent } from '../../shared/ui/timeline-filter.component';
import {
  EmptyStateComponent,
  ErrorStateComponent,
  SkeletonComponent,
} from '../../shared/ui/ui-bits.component';
import { TransactionListComponent } from '../transactions/transaction-list.component';

const SORTS: SelectOption[] = [
  { value: 'date:desc', label: 'Newest first' },
  { value: 'date:asc', label: 'Oldest first' },
  { value: 'amount:desc', label: 'Highest amount' },
  { value: 'amount:asc', label: 'Lowest amount' },
];

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    IconComponent,
    MoneyComponent,
    MoneyPipe,
    CountUpComponent,
    TimelineFilterComponent,
    SparklineComponent,
    LineChartComponent,
    DonutChartComponent,
    GaugeComponent,
    ProgressBarComponent,
    PaginatorComponent,
    SearchBoxComponent,
    SelectComponent,
    TransactionListComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="dash">
        <header class="head">
          <h1>{{ greeting }}, {{ firstName() }}</h1>
          <p>Here is how your money is moving.</p>
        </header>

        @if (hasData()) {
          <div class="filter">
            <app-timeline-filter
              [range]="range()"
              (rangeChange)="setRange($event)"
            />
          </div>
        }

        @if (anyData.error(); as e) {
          <app-error-state [error]="e" (retry)="reloadAll()" />
        } @else if (anyData.loaded() && !hasData()) {
          <section class="card card-pad welcome">
            <div class="welcome-art">
              <i class="o1"></i><i class="o2"></i
              ><app-icon name="sparkles" [size]="34" />
            </div>
            <h2>Let's get your money in here</h2>
            <p>
              Import a statement to see months of history in seconds, or add
              your first transaction by hand. Duplicates are skipped
              automatically.
            </p>
            <div class="cta">
              <a routerLink="/import" class="btn btn-primary"
                ><app-icon name="upload" [size]="18" /> Import a file</a
              >
              <button
                type="button"
                class="btn btn-secondary"
                (click)="txForm.openNew()"
              >
                <app-icon name="plus" [size]="18" /> Add a transaction
              </button>
            </div>
            <div class="steps">
              <div><b>1</b><span>Import your .xlsx export</span></div>
              <div><b>2</b><span>Review the preview</span></div>
              <div><b>3</b><span>Explore analytics</span></div>
            </div>
          </section>
        } @else {
          <!-- ===== KPIs ===== -->
          <div class="kpis reveal">
            <article class="card kpi hover">
              <div class="top">
                <span class="icon-tile" style="--tile: var(--success)"
                  ><app-icon name="arrow-down-right" [size]="18" /></span
                ><span class="lbl">Income</span>
              </div>
              <div class="val">
                @if (summary.data(); as s) {
                  <strong class="big"><app-money [value]="s.income" /></strong>
                  <span
                    class="delta"
                    [class]="deltaClass(s.incomeChangePercent, true)"
                    >{{ deltaText(s.incomeChangePercent) }}</span
                  >
                } @else {
                  <app-skeleton height="30px" width="72%" />
                }
              </div>
              <div class="spark">
                <app-sparkline
                  [values]="incomeSeries()"
                  color="var(--success)"
                />
              </div>
            </article>

            <article class="card kpi hover">
              <div class="top">
                <span class="icon-tile" style="--tile: var(--danger)"
                  ><app-icon name="arrow-up-right" [size]="18" /></span
                ><span class="lbl">Expenses</span>
              </div>
              <div class="val">
                @if (summary.data(); as s) {
                  <strong class="big"><app-money [value]="s.expense" /></strong>
                  <span
                    class="delta"
                    [class]="deltaClass(s.expenseChangePercent, false)"
                    >{{ deltaText(s.expenseChangePercent) }}</span
                  >
                } @else {
                  <app-skeleton height="30px" width="72%" />
                }
              </div>
              <div class="spark">
                <app-sparkline
                  [values]="expenseSeries()"
                  color="var(--danger)"
                />
              </div>
            </article>

            <article class="card kpi hover">
              <div class="top">
                <span class="icon-tile" style="--tile: var(--primary)"
                  ><app-icon name="wallet" [size]="18" /></span
                ><span class="lbl">Net savings</span>
              </div>
              <div class="val">
                @if (summary.data(); as s) {
                  <strong class="big" [class.text-danger]="s.net < 0"
                    ><app-money [value]="s.net"
                  /></strong>
                } @else {
                  <app-skeleton height="30px" width="72%" />
                }
              </div>
              @if (summary.data(); as s) {
                <small class="hint"
                  >{{ s.transactionCount }} transaction{{
                    s.transactionCount === 1 ? '' : 's'
                  }}
                  · avg
                  {{ s.averageDailyExpense | money: 'compact' }}/day</small
                >
              }
              <div class="spark">
                <app-sparkline [values]="netSeries()" color="var(--primary)" />
              </div>
            </article>

            <article class="card kpi hover">
              <div class="top">
                <span class="icon-tile" style="--tile: var(--accent)"
                  ><app-icon name="percent" [size]="18" /></span
                ><span class="lbl">Savings rate</span>
              </div>
              <div class="val">
                @if (summary.data(); as s) {
                  @if (s.savingsRatePercent !== null) {
                    <strong
                      class="big"
                      [class.text-danger]="s.savingsRatePercent < 0"
                      ><app-count-up
                        [value]="s.savingsRatePercent"
                        [format]="pct"
                    /></strong>
                  } @else {
                    <strong class="big faint">—</strong>
                  }
                } @else {
                  <app-skeleton height="30px" width="50%" />
                }
              </div>
              @if (summary.data(); as s) {
                <small class="hint">{{
                  s.savingsRatePercent === null
                    ? 'No income recorded in this period'
                    : rateHint(s.savingsRatePercent)
                }}</small>
              }
              <div class="rate-bar">
                <app-progress
                  [value]="clampedRate()"
                  tone="primary"
                  [marker]="20"
                />
              </div>
            </article>
          </div>

          <!-- ===== Cash flow + categories ===== -->
          <div class="row row-a reveal">
            <section class="card card-pad">
              <div class="card-head">
                <div>
                  <h3 class="card-title">
                    <app-icon name="activity" [size]="18" /> Cash flow
                  </h3>
                  <p class="card-sub">Income and spending over time</p>
                </div>
                <a routerLink="/analytics/trends" class="btn btn-ghost btn-sm"
                  >Details <app-icon name="arrow-right" [size]="14"
                /></a>
              </div>
              @if (trend.error(); as e) {
                <app-error-state [error]="e" (retry)="reloadAll()" />
              } @else {
                @if (trend.data(); as points) {
                  @if (hasFlow(points)) {
                    <app-line-chart
                      [labels]="trendLabels()"
                      [series]="trendSeries()"
                      [format]="compactMoney"
                      [height]="260"
                      ariaLabel="Income and expenses over time"
                    />
                    <div class="legend">
                      <span
                        ><i style="background: var(--success)"></i>Income</span
                      ><span
                        ><i style="background: var(--danger)"></i>Expenses</span
                      >
                    </div>
                  } @else {
                    <app-empty-state
                      icon="activity"
                      title="No activity in this period"
                      message="Pick another range, or add a transaction to see your cash flow."
                    />
                  }
                } @else {
                  <app-skeleton height="260px" radius="16px" />
                }
              }
            </section>

            <section class="card card-pad">
              <div class="card-head">
                <div>
                  <h3 class="card-title">
                    <app-icon name="chart" [size]="18" /> Where it goes
                  </h3>
                  <p class="card-sub">Spending by category</p>
                </div>
              </div>
              @if (categories.error(); as e) {
                <app-error-state [error]="e" (retry)="reloadAll()" />
              } @else {
                @if (categories.data(); as c) {
                  @if (c.items.length > 0) {
                    <div class="donut">
                      <app-donut-chart
                        [items]="donutItems()"
                        [size]="196"
                        [thickness]="24"
                        centerLabel="Spent"
                        [centerFormat]="compactMoney"
                        [(active)]="activeSlice"
                        ariaLabel="Spending by category"
                      />
                    </div>
                    <ul class="cats">
                      @for (
                        it of topCategories();
                        track it.label;
                        let i = $index
                      ) {
                        <li
                          [class.on]="activeSlice() === i"
                          (pointerenter)="activeSlice.set(i)"
                          (pointerleave)="activeSlice.set(null)"
                        >
                          <i class="dot" [style.background]="it.color"></i
                          ><span class="truncate">{{ it.label }}</span
                          ><b class="num">{{ it.value | money: 'compact' }}</b>
                        </li>
                      }
                    </ul>
                  } @else {
                    <app-empty-state
                      icon="chart"
                      title="No spending yet"
                      message="Expenses in this period will be broken down here."
                    />
                  }
                } @else {
                  <app-skeleton height="260px" radius="16px" />
                }
              }
            </section>
          </div>

          <!-- ===== Pace, health, safe to spend ===== -->
          <div class="row row-b reveal">
            <section class="card card-pad pace">
              <div class="card-head">
                <div>
                  <h3 class="card-title">
                    <app-icon name="zap" [size]="18" /> Spending pace
                  </h3>
                  <p class="card-sub">
                    This month versus last month, cumulative
                  </p>
                </div>
                @if (pace(); as p) {
                  <span
                    class="delta"
                    [class]="
                      p.deltaToDate > 0
                        ? 'down'
                        : p.deltaToDate < 0
                          ? 'up'
                          : 'flat'
                    "
                    >{{ signedWhole(p.deltaToDate) }}</span
                  >
                }
              </div>
              @if (paceError(); as e) {
                <app-error-state [error]="e" (retry)="reloadAll()" />
              } @else {
                @if (pace(); as p) {
                  <app-line-chart
                    [labels]="p.labels"
                    [series]="paceSeries()"
                    [format]="compactMoney"
                    [height]="220"
                    ariaLabel="Cumulative spending this month versus last month"
                  />
                  <div class="legend">
                    <span
                      ><i style="background: var(--primary)"></i>This
                      month</span
                    ><span
                      ><i style="background: var(--faint)"></i>Last month</span
                    >
                    @if (forecast.data(); as f) {
                      <span
                        ><i style="background: var(--warning)"></i>Projected
                        {{ f.projectedMonthEnd | money: 'compact' }}</span
                      >
                    }
                  </div>
                  <p class="note">
                    @if (p.deltaToDate > 0) {
                      You're
                      <b class="text-danger">{{ whole(p.deltaToDate) }}</b>
                      ahead of last month's pace.
                    } @else if (p.deltaToDate < 0) {
                      You're
                      <b class="text-success">{{ whole(p.deltaToDate) }}</b>
                      behind last month's pace. Nice.
                    } @else {
                      Exactly on last month's pace.
                    }
                  </p>
                } @else {
                  <app-skeleton height="270px" radius="16px" />
                }
              }
            </section>

            <section class="card card-pad">
              <div class="card-head">
                <h3 class="card-title">
                  <app-icon name="shield" [size]="18" /> Health score
                </h3>
              </div>
              @if (health(); as h) {
                <app-gauge
                  [value]="h.score"
                  label="out of 100"
                  [sublabel]="h.grade"
                  [size]="200"
                />
                <ul class="hl">
                  @for (c of h.components; track c.key) {
                    <li>
                      <span>{{ c.label }}</span
                      ><app-progress
                        [value]="c.score"
                        [tone]="
                          c.score >= 70
                            ? 'OnTrack'
                            : c.score >= 40
                              ? 'Warning'
                              : 'Exceeded'
                        "
                      />
                    </li>
                  }
                </ul>
                <a
                  routerLink="/analytics/insights"
                  class="btn btn-ghost btn-sm btn-block"
                  >How it's calculated</a
                >
              } @else if (healthLoading()) {
                <app-skeleton height="230px" radius="16px" />
              } @else {
                <app-empty-state
                  icon="shield"
                  title="Not enough data yet"
                  message="Add income and a few weeks of spending to unlock your score."
                />
              }
            </section>

            <section class="card card-pad">
              <div class="card-head">
                <h3 class="card-title">
                  <app-icon name="target" [size]="18" /> Safe to spend
                </h3>
              </div>
              @if (safe(); as s) {
                <div class="safe">
                  <strong class="big"
                    ><app-money [value]="s.perDay" [decimals]="0"
                  /></strong>
                  <span class="muted"
                    >per day for the next {{ s.daysLeft }} day{{
                      s.daysLeft === 1 ? '' : 's'
                    }}</span
                  >
                </div>
                <p class="note">
                  @if (s.basis === 'budget') {
                    Based on your overall monthly budget —
                    {{ whole(s.remaining) }} left.
                  } @else {
                    Based on your recent monthly average —
                    {{ whole(s.remaining) }} left to match it.
                  }
                </p>
              } @else if (forecast.loaded() || budgets.loaded()) {
                <app-empty-state
                  icon="target"
                  title="Set a budget"
                  message="Create an overall monthly budget to see your daily allowance."
                >
                  <a routerLink="/budgets" class="btn btn-secondary btn-sm"
                    >Create budget</a
                  >
                </app-empty-state>
              } @else {
                <app-skeleton height="120px" radius="16px" />
              }

              @if (forecast.data(); as f) {
                <hr class="divider" />
                <div class="fc">
                  <div>
                    <small class="muted">Projected month-end</small
                    ><b class="num">{{ whole(f.projectedMonthEnd) }}</b>
                  </div>
                  <div>
                    <small class="muted">Daily run rate</small
                    ><b class="num">{{ whole(f.dailyRunRate) }}</b>
                  </div>
                </div>
              }
            </section>
          </div>

          <!-- ===== Budgets, insights, bills ===== -->
          <div class="row row-c reveal">
            <section class="card card-pad">
              <div class="card-head">
                <h3 class="card-title">
                  <app-icon name="target" [size]="18" /> Budgets
                </h3>
                <a routerLink="/budgets" class="btn btn-ghost btn-sm">Manage</a>
              </div>
              @if (budgets.error(); as e) {
                <app-error-state [error]="e" (retry)="reloadAll()" />
              } @else {
                @if (budgets.data(); as list) {
                  @if (list.length > 0) {
                    <ul class="bl">
                      @for (b of list.slice(0, 4); track b.budget.id) {
                        <li>
                          <div class="r">
                            <span class="truncate">{{
                              b.budget.categoryName ?? 'Overall'
                            }}</span
                            ><b class="num"
                              >{{ b.spent | money: 'compact' }} /
                              {{ b.budget.amount | money: 'compact' }}</b
                            >
                          </div>
                          <app-progress
                            [value]="b.percentUsed"
                            [tone]="b.state"
                            [marker]="b.budget.alertThresholdPercent"
                          />
                        </li>
                      }
                    </ul>
                  } @else {
                    <app-empty-state
                      icon="target"
                      title="No budgets yet"
                      message="Set limits to get alerts before you overspend."
                      ><a routerLink="/budgets" class="btn btn-secondary btn-sm"
                        >Add a budget</a
                      ></app-empty-state
                    >
                  }
                } @else {
                  <app-skeleton height="160px" radius="16px" />
                }
              }
            </section>

            <section class="card card-pad">
              <div class="card-head">
                <h3 class="card-title">
                  <app-icon name="sparkles" [size]="18" /> Insights
                </h3>
                <a routerLink="/analytics/insights" class="btn btn-ghost btn-sm"
                  >Insights Lab</a
                >
              </div>
              @if (insights().length > 0) {
                <ul class="ins">
                  @for (
                    i of insights().slice(0, 4);
                    track i.title;
                    let n = $index
                  ) {
                    <li [class]="i.tone" [style.--i]="n">
                      <span class="ic"
                        ><app-icon [name]="i.icon" [size]="16"
                      /></span>
                      <div>
                        <b>{{ i.title }}</b
                        ><small>{{ i.text }}</small>
                      </div>
                    </li>
                  }
                </ul>
              } @else if (summary.loaded()) {
                <app-empty-state
                  icon="sparkles"
                  title="Nothing to flag"
                  message="Insights appear as your history grows."
                />
              } @else {
                <app-skeleton height="160px" radius="16px" />
              }
            </section>

            <section class="card card-pad bills">
              <div class="card-head">
                <h3 class="card-title">
                  <app-icon name="repeat" [size]="18" /> Upcoming bills
                </h3>
                <a
                  routerLink="/analytics/recurring"
                  class="btn btn-ghost btn-sm"
                  >All</a
                >
              </div>
              @if (recurring.error(); as e) {
                <app-error-state [error]="e" (retry)="reloadAll()" />
              } @else {
                @if (recurring.data(); as list) {
                  @if (upcoming().length > 0) {
                    <ul class="up">
                      @for (r of upcoming(); track r.description) {
                        <li>
                          <span class="when"
                            ><b>{{ day(r.nextExpectedDate) }}</b
                            ><small>{{
                              month(r.nextExpectedDate)
                            }}</small></span
                          ><span class="truncate"
                            >{{ r.description
                            }}<small>{{ r.frequency }}</small></span
                          ><b class="num">{{ r.typicalAmount | money }}</b>
                        </li>
                      }
                    </ul>
                  } @else {
                    <app-empty-state
                      icon="repeat"
                      [title]="
                        list.length
                          ? 'Nothing due soon'
                          : 'No recurring payments found'
                      "
                      message="Regular payments are detected automatically after a few months of history."
                    />
                  }
                } @else {
                  <app-skeleton height="160px" radius="16px" />
                }
              }
            </section>
          </div>

          <!-- ===== Transactions ===== -->
          <section
            class="card card-pad recent"
            [class.is-loading]="recent.loading() && !!recent.data()"
          >
            <div class="card-head">
              <div>
                <h3 class="card-title">
                  <app-icon name="list" [size]="18" /> Transactions
                </h3>
                <p class="card-sub">Latest activity in the selected period</p>
              </div>
              <a routerLink="/transactions" class="btn btn-secondary btn-sm"
                >View all</a
              >
            </div>

            <div class="tools">
              <app-search-box
                [value]="search()"
                (valueChange)="onSearch($event)"
                placeholder="Search transactions"
              />
              <app-select
                [options]="sorts"
                [value]="sortKey()"
                [block]="false"
                (valueChange)="setSort($event)"
                ariaLabel="Sort order"
              />
            </div>

            @if (recent.error(); as e) {
              <app-error-state [error]="e" (retry)="reloadAll()" />
            } @else {
              @if (recent.data(); as page) {
                @if (page.items.length > 0) {
                  <app-transaction-list
                    [items]="page.items"
                    [sortBy]="sortBy()"
                    [sortDir]="sortDir()"
                    (sortToggle)="toggleSort($event)"
                    (rowClick)="txForm.openEdit($event)"
                  />
                  <app-paginator
                    [total]="page.totalCount"
                    [page]="pageNo()"
                    [pageSize]="pageSize()"
                    (pageChange)="pageNo.set($event)"
                    (pageSizeChange)="setPageSize($event)"
                  />
                } @else {
                  <app-empty-state
                    icon="inbox"
                    [title]="
                      search() ? 'No matches' : 'No transactions in this period'
                    "
                    [message]="
                      search()
                        ? 'Try a different search term.'
                        : 'Choose another timeline range or add a transaction.'
                    "
                  >
                    @if (search()) {
                      <button
                        type="button"
                        class="btn btn-secondary btn-sm"
                        (click)="onSearch('')"
                      >
                        Clear search
                      </button>
                    } @else {
                      <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        (click)="txForm.openNew()"
                      >
                        <app-icon name="plus" [size]="16" /> Add transaction
                      </button>
                    }
                  </app-empty-state>
                }
              } @else {
                <div class="stack">
                  <app-skeleton height="52px" /><app-skeleton
                    height="52px"
                  /><app-skeleton height="52px" /><app-skeleton height="52px" />
                </div>
              }
            }
          </section>
        }
      </div>
    </div>
  `,
  styles: [
    `
      /*
     * Layout is driven by container queries on .dash (the page's own width), not the viewport, so it adapts
     * correctly whether the sidebar is expanded, collapsed or absent (phone, tablet, laptop, ultrawide).
     * Mobile first: everything is one column, KPIs are 2 x 2, and nothing can force the page wider than the screen.
     */
      :host {
        display: block;
        min-width: 0;
        max-width: 100%;
      }
      .page {
        overflow-x: clip;
      }
      .dash {
        container-type: inline-size;
        container-name: dash;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 16px;
        min-width: 0;
      }
      .dash > * {
        min-width: 0;
      }

      .head h1 {
        font-size: clamp(1.4rem, 5.6vw, 1.95rem);
        font-weight: 800;
        line-height: 1.15;
      }
      .head p {
        color: var(--muted);
        margin-top: 4px;
      }
      .filter {
        min-width: 0;
        max-width: 100%;
      }
      .filter app-timeline-filter {
        display: block;
        width: 100%;
        min-width: 0;
        max-width: 100%;
      }

      /* Charts may never be wider than their card, even for the instant before they measure themselves. */
      app-line-chart,
      app-sparkline {
        display: block;
        max-width: 100%;
        overflow-x: clip;
      }
      app-donut-chart,
      app-gauge {
        max-width: 100%;
      }
      .donut {
        display: grid;
        place-items: center;
        padding: 4px 0;
      }

      /* ---- KPI cards ---- */
      .kpis {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .kpi {
        container-type: inline-size;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 14px;
        overflow: hidden;
      }
      .kpi .top {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .kpi .icon-tile {
        width: 36px;
        height: 36px;
        border-radius: 12px;
      }
      .kpi .lbl {
        flex: 1;
        min-width: 0;
        color: var(--muted);
        font-weight: 600;
        font-size: 0.88rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .kpi .val {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px 8px;
        min-width: 0;
        margin-top: 2px;
      }
      .kpi .big {
        font-size: 1.5rem;
        font-size: clamp(1.15rem, 9.5cqi, 1.9rem);
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1.15;
        min-width: 0;
      }
      .kpi .hint {
        color: var(--faint);
        font-size: 0.78rem;
        line-height: 1.35;
      }
      .kpi .spark {
        margin: 6px -6px -8px;
      }
      .kpi .rate-bar {
        margin-top: 12px;
      }

      /* ---- Rows ---- */
      .row {
        display: grid;
        gap: 16px;
        grid-template-columns: minmax(0, 1fr);
      }
      .row > * {
        min-width: 0;
      }

      @container dash (max-width: 599px) {
        .card-pad {
          padding: 16px;
        }
      }
      @container dash (min-width: 640px) {
        .kpi {
          padding: 18px;
        }
        .row-b {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .row-b > .pace {
          grid-column: 1 / -1;
        }
        .row-c {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .row-c > .bills {
          grid-column: 1 / -1;
        }
      }
      @container dash (min-width: 760px) {
        .kpis {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
        }
      }
      @container dash (min-width: 820px) {
        .row-a {
          grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
        }
      }
      @container dash (min-width: 980px) {
        .row-c {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .row-c > .bills {
          grid-column: auto;
        }
      }
      @container dash (min-width: 1040px) {
        .row-b {
          grid-template-columns: minmax(0, 5fr) minmax(0, 3fr) minmax(0, 4fr);
        }
        .row-b > .pace {
          grid-column: auto;
        }
      }

      /* ---- Card contents ---- */
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 18px;
        margin-top: 10px;
        font-size: 0.8rem;
        color: var(--muted);
      }
      .legend i {
        display: inline-block;
        width: 9px;
        height: 9px;
        border-radius: 50%;
        margin-right: 6px;
      }
      .note {
        margin-top: 10px;
        font-size: 0.88rem;
        color: var(--muted);
        line-height: 1.5;
      }
      .cats {
        list-style: none;
        margin: 12px 0 0;
        padding: 0;
        display: grid;
        gap: 4px;
      }
      .cats li {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 10px;
        border-radius: 10px;
        font-size: 0.88rem;
        transition: background 0.2s;
        cursor: default;
      }
      .cats li.on,
      .cats li:hover {
        background: var(--surface-2);
      }
      .cats li span {
        flex: 1;
      }
      .hl {
        list-style: none;
        margin: 12px 0;
        padding: 0;
        display: grid;
        gap: 10px;
      }
      .hl li {
        display: grid;
        gap: 5px;
        font-size: 0.78rem;
        color: var(--muted);
      }
      .safe {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .safe .big {
        font-size: 2.1rem;
        font-weight: 800;
        letter-spacing: -0.03em;
        background: var(--grad);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      .fc {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .fc div {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .fc b {
        font-size: 1.05rem;
      }
      .bl,
      .ins,
      .up {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 14px;
      }
      .bl .r {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        font-size: 0.88rem;
        margin-bottom: 6px;
      }
      .bl .r b {
        font-size: 0.82rem;
        color: var(--muted);
        white-space: nowrap;
      }
      .ins li {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        animation: fadeUp 0.4s both;
        animation-delay: calc(var(--i) * 70ms);
      }
      .ins .ic {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        flex: none;
      }
      .ins li.good .ic {
        color: var(--success);
        background: color-mix(in srgb, var(--success) 15%, transparent);
      }
      .ins li.warn .ic {
        color: var(--warning);
        background: color-mix(in srgb, var(--warning) 15%, transparent);
      }
      .ins li.bad .ic {
        color: var(--danger);
        background: color-mix(in srgb, var(--danger) 15%, transparent);
      }
      .ins li.info .ic {
        color: var(--info);
        background: color-mix(in srgb, var(--info) 15%, transparent);
      }
      .ins li > div {
        min-width: 0;
      }
      .ins b {
        display: block;
        font-size: 0.9rem;
      }
      .ins small {
        color: var(--muted);
        font-size: 0.8rem;
        line-height: 1.4;
        display: block;
      }
      .up li {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .up .when {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 44px;
        padding: 6px 0;
        border-radius: 12px;
        background: var(--surface-2);
        flex: none;
      }
      .up .when b {
        font-size: 1.05rem;
        line-height: 1;
      }
      .up .when small {
        font-size: 0.66rem;
        text-transform: uppercase;
        color: var(--faint);
      }
      .up li > span.truncate {
        flex: 1;
        display: flex;
        flex-direction: column;
        font-weight: 600;
        font-size: 0.9rem;
      }
      .up li > span small {
        color: var(--faint);
        font-weight: 400;
        font-size: 0.76rem;
      }

      /* ---- Transactions ---- */
      .tools {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
        margin-bottom: 14px;
      }
      .tools app-search-box {
        flex: 1 1 240px;
        min-width: 0;
      }
      .tools app-select {
        flex: 0 0 190px;
      }
      @container dash (max-width: 599px) {
        .tools app-search-box,
        .tools app-select {
          flex: 1 1 100%;
        }
      }

      /* ---- First-run welcome ---- */
      .welcome {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        padding: clamp(28px, 6vw, 60px) 20px;
        overflow: hidden;
      }
      .welcome h2 {
        font-size: clamp(1.4rem, 3vw, 2rem);
        font-weight: 800;
      }
      .welcome p {
        color: var(--muted);
        max-width: 520px;
        line-height: 1.6;
      }
      .welcome-art {
        position: relative;
        display: grid;
        place-items: center;
        width: 84px;
        height: 84px;
        border-radius: 28px;
        color: #fff;
        background: var(--grad);
        box-shadow: 0 20px 50px -12px var(--primary);
        animation: float 4s ease-in-out infinite;
      }
      .welcome-art i {
        position: absolute;
        border-radius: 50%;
        background: var(--grad);
        opacity: 0.35;
      }
      .welcome-art .o1 {
        width: 130px;
        height: 130px;
        animation: pulseRing 2.8s infinite;
      }
      .welcome-art .o2 {
        width: 190px;
        height: 190px;
        opacity: 0.15;
        animation: pulseRing 2.8s 0.8s infinite;
      }
      .cta {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        justify-content: center;
        margin-top: 8px;
      }
      .steps {
        display: flex;
        gap: 18px 28px;
        flex-wrap: wrap;
        justify-content: center;
        margin-top: 18px;
        color: var(--muted);
        font-size: 0.9rem;
      }
      .steps div {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .steps b {
        display: grid;
        place-items: center;
        width: 26px;
        height: 26px;
        border-radius: 50%;
        color: var(--primary-2);
        background: color-mix(in srgb, var(--primary) 16%, transparent);
        font-size: 0.8rem;
      }
    `,
  ],
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
  protected readonly firstName = computed(
    () => (this.auth.user()?.fullName ?? '').split(' ')[0] || 'there',
  );
  protected readonly range = this.timeline.range;
  protected readonly activeSlice = signal<number | null>(null);
  protected readonly sorts = SORTS;

  // ---- recent transactions (server-side paging, search and sort)
  protected readonly search = signal('');
  protected readonly pageNo = signal(1);
  protected readonly pageSize = signal(readPageSize('dashboard', 10));
  protected readonly sortBy = signal<'date' | 'amount'>('date');
  protected readonly sortDir = signal<'asc' | 'desc'>('desc');
  protected readonly sortKey = computed(
    () => `${this.sortBy()}:${this.sortDir()}`,
  );
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

  protected readonly hasData = computed(
    () => (this.anyData.data()?.totalCount ?? 0) > 0 || !this.anyData.loaded(),
  );
  protected readonly paceError = computed(
    () => this.paceCurrent.error() ?? this.pacePrevious.error(),
  );
  private readonly filter = computed(() => ({
    from: this.range().from,
    to: this.range().to,
  }));
  private readonly today = new Date();

  protected readonly pct = (n: number): string => formatPercent(n, 1);
  protected readonly compactMoney = (n: number): string =>
    formatMoney(n, this.auth.currency(), { compact: true });
  protected readonly whole = (n: number): string =>
    formatMoney(Math.abs(n), this.auth.currency(), { decimals: 0 });
  protected readonly signedWhole = (n: number): string =>
    formatMoney(n, this.auth.currency(), { decimals: 0, signed: true });

  constructor() {
    const v = () => this.refresh.version();

    autoLoad(
      this.anyData,
      () => (
        v(),
        this.txApi.query({
          page: 1,
          pageSize: 1,
          sortBy: 'date',
          sortDir: 'desc',
        })
      ),
    );
    autoLoad(this.summary, () => (v(), this.analytics.summary(this.filter())));
    autoLoad(
      this.categories,
      () => (v(), this.analytics.categories(this.filter(), 'Expense')),
    );
    autoLoad(
      this.trend,
      () => (
        v(),
        this.analytics.trend(this.filter(), autoGranularity(this.range()))
      ),
    );

    const monthStart = startOfMonth(this.today);
    autoLoad(
      this.months,
      () => (
        v(),
        this.analytics.trend(
          {
            from: ymd(addMonths(monthStart, -6)),
            to: ymd(endOfMonth(this.today)),
          },
          'Month',
        )
      ),
    );
    autoLoad(
      this.paceCurrent,
      () => (
        v(),
        this.analytics.trend(
          { from: ymd(monthStart), to: ymd(endOfMonth(this.today)) },
          'Day',
        )
      ),
    );
    const prevStart = addMonths(monthStart, -1);
    autoLoad(
      this.pacePrevious,
      () => (
        v(),
        this.analytics.trend(
          { from: ymd(prevStart), to: ymd(endOfMonth(prevStart)) },
          'Day',
        )
      ),
    );
    autoLoad(this.forecast, () => (v(), this.analytics.forecast()));
    autoLoad(this.budgets, () => (v(), this.budgetsApi.status()));
    autoLoad(this.recurring, () => (v(), this.analytics.recurring()));

    autoLoad(this.recent, () => {
      v();
      return this.txApi.query({
        ...this.filter(),
        page: this.pageNo(),
        pageSize: this.pageSize(),
        sortBy: this.sortBy(),
        sortDir: this.sortDir(),
        search: this.debouncedSearch().trim(),
      });
    });
  }

  // ---- derived series
  protected readonly incomeSeries = computed(() =>
    (this.trend.data() ?? []).map((p) => p.income),
  );
  protected readonly expenseSeries = computed(() =>
    (this.trend.data() ?? []).map((p) => p.expense),
  );
  protected readonly netSeries = computed(() =>
    (this.trend.data() ?? []).map((p) => p.net),
  );
  protected readonly clampedRate = computed(() =>
    clamp(this.summary.data()?.savingsRatePercent ?? 0, 0, 100),
  );

  protected readonly trendLabels = computed(() => {
    const gran = autoGranularity(this.range());
    return (this.trend.data() ?? []).map((p) => {
      const d = parseYmd(p.periodStart);
      return gran === 'Month' || gran === 'Quarter'
        ? formatDate(d, 'month')
        : formatDate(d, 'day');
    });
  });

  protected readonly trendSeries = computed(() => [
    { name: 'Income', color: '#34d399', values: this.incomeSeries() },
    { name: 'Expenses', color: '#fb7185', values: this.expenseSeries() },
  ]);

  protected readonly donutItems = computed<DonutItem[]>(() => {
    const items = this.categories.data()?.items ?? [];
    const top = items
      .slice(0, 7)
      .map((c, i) => ({
        label: c.name,
        value: c.amount,
        color: c.color ?? colorAt(i),
      }));
    const rest = items.slice(7).reduce((s, c) => s + c.amount, 0);
    return rest > 0
      ? [...top, { label: 'Other', value: rest, color: '#64748b' }]
      : top;
  });
  protected readonly topCategories = computed(() =>
    this.donutItems().slice(0, 6),
  );

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
      {
        name: 'Last month',
        color: '#6d7399',
        values: p.previous,
        dashed: true,
      },
      { name: 'This month', color: '#7c6cff', values: p.current },
    ];

    if (f && p.dayOfMonth < p.labels.length) {
      // A straight dashed line from today's total to the projected month-end, so the projection is actually drawn.
      const start = p.dayOfMonth - 1;
      const end = p.labels.length - 1;
      const last = p.current[start] ?? 0;
      const target = Math.max(last, f.projectedMonthEnd);
      series.push({
        name: 'Projected',
        color: '#fbbf24',
        dashed: true,
        values: p.labels.map((_, i) =>
          i < start
            ? null
            : last + ((target - last) * (i - start)) / (end - start),
        ),
      });
    }
    return series;
  });

  private readonly completeMonths = computed(() => {
    const monthKey = ymd(startOfMonth(this.today));
    return (this.months.data() ?? []).filter((m) => m.periodStart < monthKey);
  });

  protected readonly healthLoading = computed(
    () => !this.summary.loaded() || !this.months.loaded(),
  );

  protected readonly health = computed(() => {
    const summary = this.summary.data();
    const months = this.completeMonths();
    if (!summary || !this.months.loaded()) return null;

    const recurringCost = (this.recurring.data() ?? []).reduce(
      (s, r) => s + r.monthlyCost,
      0,
    );
    const active = months.filter((m) => m.expense > 0 || m.income > 0);
    const avgIncome = active.length
      ? active.reduce((s, m) => s + m.income, 0) / active.length
      : 0;
    const avgExpense = active.length
      ? active.reduce((s, m) => s + m.expense, 0) / active.length
      : 0;
    const accounts = this.refData.activeAccounts();

    return healthScore({
      savingsRatePercent: summary.savingsRatePercent,
      budgets: this.budgets.data() ?? [],
      monthlyExpenses: active.map((m) => m.expense),
      recurringMonthlyCost: recurringCost,
      avgMonthlyIncome: avgIncome,
      avgMonthlyExpense: avgExpense,
      balance: accounts.length
        ? accounts.reduce((s, a) => s + a.currentBalance, 0)
        : null,
    });
  });

  protected readonly safe = computed(() =>
    safeToSpend(this.budgets.data() ?? [], this.forecast.data()),
  );

  protected readonly upcoming = computed(() => {
    const limit = ymd(addDays(this.today, 30));
    return (this.recurring.data() ?? [])
      .filter(
        (r) =>
          r.nextExpectedDate <= limit &&
          r.nextExpectedDate >= ymd(addDays(this.today, -3)),
      )
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
      noSpend: this.paceCurrent.data()
        ? noSpendStats(this.paceCurrent.data() ?? [], todayYmd())
        : null,
      forecast: this.forecast.data(),
      money: (n) => formatMoney(n, this.auth.currency(), { compact: true }),
    }),
  );

  // ---- actions
  protected setRange(range: DateRange): void {
    this.timeline.set(range);
    this.pageNo.set(1);
  }

  protected onSearch(value: string): void {
    this.search.set(value);
    this.pageNo.set(1);
  }

  protected setSort(value: string | number | null): void {
    const [by, dir] = String(value ?? 'date:desc').split(':');
    this.sortBy.set(by === 'amount' ? 'amount' : 'date');
    this.sortDir.set(dir === 'asc' ? 'asc' : 'desc');
    this.pageNo.set(1);
  }

  protected toggleSort(key: string): void {
    const k = key === 'amount' ? 'amount' : 'date';
    if (this.sortBy() === k)
      this.sortDir.set(this.sortDir() === 'desc' ? 'asc' : 'desc');
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
    return change > 0 === goodWhenUp ? 'up' : 'down';
  }

  protected deltaText(change: number | null): string {
    return change === null ? 'new' : formatPercent(change, 0, true);
  }

  protected rateHint(rate: number): string {
    return rate >= 20
      ? 'Above the 20% target'
      : rate >= 0
        ? 'Target is 20% or more'
        : 'Spending exceeds income';
  }

  protected day(date: string): string {
    return String(parseYmd(date).getDate());
  }

  protected month(date: string): string {
    return parseYmd(date).toLocaleDateString(undefined, { month: 'short' });
  }
}
