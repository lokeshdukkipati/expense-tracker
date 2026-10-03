import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AnalyticsApi } from '../../core/api/analytics.api';
import { weekendSplit } from '../../core/analytics/insights';
import { PatternsDto, TrendPointDto } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { RefreshService } from '../../core/services/refresh.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { formatMoney } from '../../core/utils/format';
import { BarChartComponent } from '../../shared/charts/bar-chart.component';
import { HeatDay, HeatmapComponent } from '../../shared/charts/heatmap.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../shared/ui/ui-bits.component';
import { AnalyticsFilterService } from './analytics-filter.service';

const SHORT: Record<string, string> = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' };

@Component({
  selector: 'app-analytics-patterns',
  imports: [IconComponent, HeatmapComponent, BarChartComponent, StatCardComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (patterns.error() || days.error()) {
      <app-error-state [error]="patterns.error() ?? days.error()" (retry)="refresh.bump()" />
    } @else {
      @if (patterns.data() && days.data()) {
        @if (!hasSpending()) {
          <section class="card card-pad"><app-empty-state icon="calendar" title="No spending in this period" message="Patterns appear once there are expenses in the selected timeline. Try a wider range." /></section>
        } @else {
          <div class="cols-4 reveal">
            <app-stat-card label="Busiest weekday" icon="calendar" tone="var(--primary)" [value]="0" [text]="facts().busiestDay" hint="highest average per day" />
            <app-stat-card label="Peak hour" icon="clock" tone="var(--accent)" [value]="0" [text]="facts().peakHour" hint="when most money leaves" />
            <app-stat-card label="Weekend vs weekday" icon="repeat" tone="var(--warning)" [value]="0" [text]="facts().weekend" hint="average spend per day" />
            <app-stat-card label="Spending days" icon="activity" tone="var(--info)" kind="number" [value]="facts().activeDays" [hint]="'of ' + facts().totalDays + ' days'" />
          </div>

          <section class="card card-pad sec">
            <div class="card-head"><div><h3 class="card-title"><app-icon name="calendar" [size]="18" /> Spending calendar</h3><p class="card-sub">Darker days mean more spending</p></div></div>
            <app-heatmap [data]="heat()" [from]="filters.range().from" [to]="filters.range().to" [format]="money" />
          </section>

          <div class="grid-12 sec">
            <section class="card card-pad c-6">
              <div class="card-head"><div><h3 class="card-title"><app-icon name="bar-chart" [size]="18" /> Average by weekday</h3><p class="card-sub">What a typical day costs</p></div></div>
              <app-bar-chart [labels]="weekdayLabels()" [series]="weekdaySeries()" [format]="money" [height]="260" ariaLabel="Average spending by weekday" />
            </section>
            <section class="card card-pad c-6">
              <div class="card-head"><div><h3 class="card-title"><app-icon name="clock" [size]="18" /> Time of day</h3><p class="card-sub">When the money leaves</p></div></div>
              <app-bar-chart [labels]="hourLabels" [series]="hourSeries()" [format]="money" [height]="260" ariaLabel="Spending by hour of day" />
            </section>
          </div>
        }
      } @else { <app-skeleton height="200px" radius="20px" /><div class="sec"><app-skeleton height="300px" radius="20px" /></div> }
    }
  `,
  styles: [`.sec { margin-top: 16px; }`],
})
export class PatternsComponent {
  protected readonly filters = inject(AnalyticsFilterService);
  protected readonly refresh = inject(RefreshService);
  private readonly api = inject(AnalyticsApi);
  private readonly auth = inject(AuthService);

  protected readonly patterns = asyncState<PatternsDto>();
  protected readonly days = asyncState<TrendPointDto[]>();

  protected readonly hourLabels = Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? `${h}h` : ''));
  protected readonly money = (n: number): string => formatMoney(n, this.auth.currency(), { compact: true });

  constructor() {
    autoLoad(this.patterns, () => (this.refresh.version(), this.api.patterns(this.filters.filter())));
    autoLoad(this.days, () => (this.refresh.version(), this.api.trend(this.filters.filter(), 'Day')));
  }

  protected readonly hasSpending = computed(() => (this.patterns.data()?.byHour ?? []).some((h) => h.total > 0));

  protected readonly heat = computed<HeatDay[]>(() => (this.days.data() ?? []).map((d) => ({ date: d.periodStart, value: d.expense, count: d.count })));
  protected readonly weekdayLabels = computed(() => (this.patterns.data()?.byWeekday ?? []).map((d) => SHORT[d.day] ?? d.day));
  protected readonly weekdaySeries = computed(() => [{ name: 'Avg per day', color: '#7c6cff', values: (this.patterns.data()?.byWeekday ?? []).map((d) => Math.round(d.averagePerDay)) }]);
  protected readonly hourSeries = computed(() => [{ name: 'Spent', color: '#22d3ee', values: (this.patterns.data()?.byHour ?? []).map((h) => h.total) }]);

  protected readonly facts = computed(() => {
    const p = this.patterns.data();
    const days = this.days.data() ?? [];
    const money = (n: number) => formatMoney(n, this.auth.currency(), { compact: true });
    const busiest = p ? [...p.byWeekday].sort((a, b) => b.averagePerDay - a.averagePerDay)[0] : undefined;
    const peak = p ? [...p.byHour].sort((a, b) => b.total - a.total)[0] : undefined;
    const split = p ? weekendSplit(p) : null;
    const elapsed = days.length;
    return {
      busiestDay: busiest && busiest.averagePerDay > 0 ? `${busiest.day}` : 'No clear pattern',
      peakHour: peak && peak.total > 0 ? `${String(peak.hour).padStart(2, '0')}:00 – ${String((peak.hour + 1) % 24).padStart(2, '0')}:00` : '—',
      weekend: split ? (split.ratio >= 1.15 ? `Weekends +${((split.ratio - 1) * 100).toFixed(0)}%` : split.ratio <= 0.85 ? `Weekdays +${((1 / split.ratio - 1) * 100).toFixed(0)}%` : 'About equal') : '—',
      activeDays: days.filter((d) => d.expense > 0).length,
      totalDays: elapsed,
    };
  });
}
