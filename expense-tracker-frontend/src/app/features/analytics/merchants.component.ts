import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AnalyticsApi } from '../../core/api/analytics.api';
import { TopDescriptionDto, TransactionType } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { RefreshService } from '../../core/services/refresh.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { colorAt, colorForLabel } from '../../core/utils/colors';
import { formatDate, formatMoney } from '../../core/utils/format';
import { TableState, compareNumber, compareText } from '../../core/utils/table-state';
import { RankBarsComponent, RankItem } from '../../shared/charts/rank-bars.component';
import { SearchBoxComponent, SegmentOption, SegmentedComponent, SortHeaderComponent } from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyPipe } from '../../shared/ui/money.component';
import { PaginatorComponent } from '../../shared/ui/paginator.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent } from '../../shared/ui/ui-bits.component';
import { AnalyticsFilterService } from './analytics-filter.service';

@Component({
  selector: 'app-analytics-merchants',
  imports: [IconComponent, MoneyPipe, RankBarsComponent, SegmentedComponent, SearchBoxComponent, SortHeaderComponent, PaginatorComponent, StatCardComponent, EmptyStateComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card card-pad head">
      <app-segmented [options]="types" [value]="type()" [tone]="type() === 'Income' ? 'income' : 'expense'" (valueChange)="setType($event)" />
      <span class="muted note">Grouped by description, ignoring case and spacing. Showing the top 50.</span>
    </section>

    @if (state.error(); as e) {
      <app-error-state [error]="e" (retry)="refresh.bump()" />
    } @else {
      @if (state.data(); as list) {
        @if (list.length === 0) {
          <section class="card card-pad sec"><app-empty-state icon="tag" title="No descriptions to group" message="Transactions with a description in this period appear here. Add descriptions when you record spending, or widen the timeline." /></section>
        } @else {
          <div class="cols-3 reveal sec">
            <app-stat-card label="Top by amount" icon="trending-up" tone="var(--danger)" [value]="top()?.total ?? 0" [hint]="top()?.description ?? '—'" />
            <app-stat-card label="Most frequent" icon="repeat" tone="var(--primary)" kind="number" [value]="frequent()?.count ?? 0" [hint]="frequent()?.description ?? '—'" />
            <app-stat-card label="Biggest average" icon="award" tone="var(--warning)" [value]="biggest()?.average ?? 0" [hint]="biggest()?.description ?? '—'" />
          </div>

          <div class="grid-12 sec">
            <section class="card card-pad c-5">
              <div class="card-head"><div><h3 class="card-title"><app-icon name="bar-chart" [size]="18" /> Top 10</h3><p class="card-sub">By total {{ type() === 'Income' ? 'received' : 'spent' }}</p></div></div>
              <app-rank-bars [items]="ranks()" />
            </section>

            <section class="card card-pad c-7">
              <div class="card-head">
                <div><h3 class="card-title"><app-icon name="list" [size]="18" /> All merchants</h3><p class="card-sub">{{ table.total() }} result{{ table.total() === 1 ? '' : 's' }}</p></div>
                <app-search-box class="srch" [value]="table.search()" (valueChange)="table.setSearch($event)" placeholder="Search" />
              </div>
              @if (table.total() === 0) {
                <app-empty-state icon="search" title="No matches" message="Try a different search."><button type="button" class="btn btn-secondary btn-sm" (click)="table.setSearch('')">Clear search</button></app-empty-state>
              } @else {
                <div class="table-wrap"><table class="table">
                  <thead><tr>
                    <th><app-sort-header label="Description" key="name" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                    <th class="right"><app-sort-header label="Total" key="total" align="right" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                    <th class="right"><app-sort-header label="Times" key="count" align="right" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                    <th class="right hide-mobile"><app-sort-header label="Average" key="average" align="right" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                    <th class="hide-tablet"><app-sort-header label="Last" key="last" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                  </tr></thead>
                  <tbody>
                    @for (r of table.pageItems(); track r.description; let i = $index) {
                      <tr [style.--i]="i"><td><span class="m"><i class="dot" [style.background]="color(r.description)"></i><span class="truncate">{{ r.description }}</span></span></td>
                        <td class="right num">{{ r.total | money }}</td><td class="right num">{{ r.count }}</td><td class="right num hide-mobile muted">{{ r.average | money }}</td>
                        <td class="hide-tablet muted nowrap">{{ date(r.lastOccurredAt) }}</td></tr>
                    }
                  </tbody></table></div>
                <app-paginator [total]="table.total()" [page]="table.currentPage()" [pageSize]="table.pageSize()" (pageChange)="table.setPage($event)" (pageSizeChange)="table.setPageSize($event)" />
              }
            </section>
          </div>
        }
      } @else { <div class="cols-3 sec"><app-skeleton height="120px" radius="20px" /><app-skeleton height="120px" radius="20px" /><app-skeleton height="120px" radius="20px" /></div><div class="sec"><app-skeleton height="320px" radius="20px" /></div> }
    }
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: center; gap: 14px; flex-wrap: wrap; }
    .note { font-size: .85rem; } .sec { margin-top: 16px; } .srch { min-width: min(240px, 100%); }
    .m { display: inline-flex; align-items: center; gap: 10px; font-weight: 600; max-width: 260px; }
  `],
})
export class MerchantsComponent {
  protected readonly filters = inject(AnalyticsFilterService);
  protected readonly refresh = inject(RefreshService);
  private readonly api = inject(AnalyticsApi);
  private readonly auth = inject(AuthService);

  protected readonly types: SegmentOption[] = [{ value: 'Expense', label: 'Expenses' }, { value: 'Income', label: 'Income' }];
  protected readonly type = signal<TransactionType>('Expense');
  protected readonly state = asyncState<TopDescriptionDto[]>();

  protected readonly table = new TableState<TopDescriptionDto>(() => this.state.data() ?? [], {
    searchText: (r) => r.description,
    comparers: {
      name: (a, b) => compareText(a.description, b.description),
      total: (a, b) => compareNumber(a.total, b.total),
      count: (a, b) => compareNumber(a.count, b.count),
      average: (a, b) => compareNumber(a.average, b.average),
      last: (a, b) => a.lastOccurredAt.localeCompare(b.lastOccurredAt),
    },
    defaultSort: { key: 'total', dir: 'desc' },
    storageKey: 'analytics-merchants',
  });

  constructor() {
    autoLoad(this.state, () => (this.refresh.version(), this.api.topDescriptions(this.filters.filter(), this.type(), 50)));
  }

  protected readonly top = computed<TopDescriptionDto | null>(() => (this.state.data() ?? [])[0] ?? null);
  protected readonly frequent = computed<TopDescriptionDto | null>(() => [...(this.state.data() ?? [])].sort((a, b) => b.count - a.count)[0] ?? null);
  protected readonly biggest = computed<TopDescriptionDto | null>(() => [...(this.state.data() ?? [])].filter((r) => r.count >= 2).sort((a, b) => b.average - a.average)[0] ?? null);

  protected readonly ranks = computed<RankItem[]>(() =>
    (this.state.data() ?? []).slice(0, 10).map((r, i) => ({
      id: r.description, label: r.description, value: r.total, color: colorAt(i),
      valueText: formatMoney(r.total, this.auth.currency(), { compact: true }), sub: `${r.count} time${r.count === 1 ? '' : 's'} · avg ${formatMoney(r.average, this.auth.currency(), { compact: true })}`,
    })));

  protected setType(value: string): void {
    this.type.set(value === 'Income' ? 'Income' : 'Expense');
    this.table.setPage(1);
  }

  protected color(label: string): string {
    return colorForLabel(label);
  }

  protected date(value: string): string {
    return formatDate(value);
  }
}
