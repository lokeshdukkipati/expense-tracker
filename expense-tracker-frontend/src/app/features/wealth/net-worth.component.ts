import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { WealthApi } from '../../core/api/wealth.api';
import { AccountType } from '../../core/models/api.models';
import { RefreshService } from '../../core/services/refresh.service';
import { ViewportService } from '../../core/services/viewport.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { parseYmd } from '../../core/utils/dates';
import { formatDate } from '../../core/utils/format';
import { LineChartComponent } from '../../shared/charts/line-chart.component';
import { ChartSeries } from '../../shared/charts/chart-utils';
import { EmptyArtComponent } from '../../shared/ui/empty-art.component';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../shared/ui/form-controls.component';
import { IconComponent, IconName } from '../../shared/ui/icon.component';
import { MoneyComponent, MoneyPipe } from '../../shared/ui/money.component';
import {
  ErrorStateComponent,
  SkeletonComponent,
} from '../../shared/ui/ui-bits.component';
import { NetWorthDto } from '../../core/models/api.models';

const TYPE_ICONS: Record<AccountType, IconName> = {
  Cash: 'wallet',
  Bank: 'landmark',
  Card: 'credit-card',
  Wallet: 'wallet',
  Investment: 'trending-up',
  Other: 'layers',
};

@Component({
  selector: 'app-net-worth',
  imports: [
    RouterLink,
    IconComponent,
    MoneyComponent,
    MoneyPipe,
    SegmentedComponent,
    LineChartComponent,
    EmptyArtComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Net worth</h1>
          <p>
            Everything you own minus everything you owe, from your accounts.
          </p>
        </div>
        <div class="head-actions">
          <app-segmented
            [options]="ranges"
            [value]="months().toString()"
            (valueChange)="setMonths($event)"
          />
        </div>
      </div>

      @if (error(); as e) {
        <app-error-state [error]="e" (retry)="refresh.bump()" />
      } @else if (!loaded()) {
        <div class="stack">
          <app-skeleton height="190px" radius="20px" /><app-skeleton
            height="280px"
            radius="20px"
          />
        </div>
      } @else if (nw()) {
        @let d = nw()!;
        @if (d.accounts.length === 0) {
          <section class="card card-pad empty">
            <app-empty-art kind="generic" />
            <h2>No accounts yet</h2>
            <p class="muted">
              Add your accounts and your net worth appears here, with its
              history.
            </p>
            <a routerLink="/accounts" class="btn btn-primary"
              ><app-icon name="plus" [size]="18" /> Add an account</a
            >
          </section>
        } @else {
          <section class="card card-pad hero reveal">
            <span class="muted">Net worth today</span>
            <strong class="big num" [class.text-danger]="d.netWorth < 0"
              ><app-money [value]="d.netWorth" [currency]="d.currency"
            /></strong>
            <span
              class="change"
              [class.up]="d.monthlyChange >= 0"
              [class.down]="d.monthlyChange < 0"
            >
              <app-icon
                [name]="d.monthlyChange >= 0 ? 'trending-up' : 'trending-down'"
                [size]="16"
              />
              {{ d.monthlyChange | money: 'signed' : d.currency }}
              @if (d.monthlyChangePercent !== null) {
                <span>({{ d.monthlyChangePercent }}%)</span>
              }
              <span class="muted">since last month end</span>
            </span>

            <div
              class="split"
              role="img"
              [attr.aria-label]="
                'Assets ' +
                (d.assets | money: '' : d.currency) +
                ', liabilities ' +
                (d.liabilities | money: '' : d.currency)
              "
            >
              <i class="assets" [style.width.%]="assetShare()"></i>
              <i class="debts" [style.width.%]="100 - assetShare()"></i>
            </div>
            <div class="legend">
              <span
                ><i class="dot assets"></i> Assets
                <strong class="num">{{
                  d.assets | money: 'compact' : d.currency
                }}</strong></span
              >
              <span
                ><i class="dot debts"></i> Liabilities
                <strong class="num">{{
                  d.liabilities | money: 'compact' : d.currency
                }}</strong></span
              >
            </div>
          </section>

          <section class="card card-pad chart reveal">
            <div class="card-head">
              <div>
                <h3 class="card-title">
                  <app-icon name="chart" [size]="18" /> Over time
                </h3>
                <p class="card-sub">
                  Month-end position, last {{ months() }} months
                </p>
              </div>
            </div>
            <app-line-chart
              [labels]="labels()"
              [series]="series()"
              [height]="viewport.isMobile() ? 220 : 300"
              ariaLabel="Net worth over time"
            />
          </section>

          <div class="cols-2 reveal">
            <section class="card card-pad">
              <div class="card-head">
                <div>
                  <h3 class="card-title">
                    <app-icon name="layers" [size]="18" /> By account type
                  </h3>
                </div>
              </div>
              <ul class="rows">
                @for (t of d.byType; track t.type) {
                  <li>
                    <span class="tile"
                      ><app-icon [name]="typeIcon(t.type)" [size]="18"
                    /></span>
                    <div class="grow">
                      <div class="line">
                        <strong>{{ t.type }}</strong
                        ><span class="num" [class.text-danger]="t.total < 0">{{
                          t.total | money: '' : d.currency
                        }}</span>
                      </div>
                      <div class="bar">
                        <i
                          [class.neg]="t.total < 0"
                          [style.width.%]="barWidth(t.total)"
                        ></i>
                      </div>
                      <small class="muted"
                        >{{ t.accounts }} account{{
                          t.accounts === 1 ? '' : 's'
                        }}</small
                      >
                    </div>
                  </li>
                }
              </ul>
            </section>

            <section class="card card-pad">
              <div class="card-head">
                <div>
                  <h3 class="card-title">
                    <app-icon name="wallet" [size]="18" /> Accounts
                  </h3>
                </div>
                <a routerLink="/accounts" class="btn btn-ghost btn-sm"
                  >Manage</a
                >
              </div>
              <ul class="rows">
                @for (a of d.accounts; track a.id) {
                  <li [class.dim]="!a.includedInTotal || a.isArchived">
                    <span class="tile"
                      ><app-icon [name]="typeIcon(a.type)" [size]="18"
                    /></span>
                    <div class="grow">
                      <div class="line">
                        <strong class="truncate">{{ a.name }}</strong
                        ><span
                          class="num"
                          [class.text-danger]="a.balance < 0"
                          >{{ a.balance | money: '' : a.currency }}</span
                        >
                      </div>
                      <small class="muted"
                        >{{ a.type }}
                        @if (a.isArchived) {
                          · archived
                        }
                        @if (!a.includedInTotal) {
                          · {{ a.currency }}, not included in the total
                        }
                      </small>
                    </div>
                  </li>
                }
              </ul>
            </section>
          </div>

          @if (d.excludedAccounts > 0) {
            <p class="note muted">
              {{ d.excludedAccounts }} account{{
                d.excludedAccounts === 1 ? ' is' : 's are'
              }}
              in another currency and
              {{ d.excludedAccounts === 1 ? 'is' : 'are' }} left out of the
              totals, because amounts are never converted.
            </p>
          }
        }
      }
    </div>
  `,
  styles: [
    `
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 10px;
        padding-block: 28px;
      }
      .empty h2,
      .empty p {
        margin: 0;
      }
      .hero {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 16px;
      }
      .big {
        font-size: clamp(2rem, 8vw, 3.2rem);
        font-weight: 850;
        letter-spacing: -0.035em;
        line-height: 1.05;
        background: var(--grad);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        overflow-wrap: anywhere;
      }
      .big.text-danger {
        background: none;
        color: var(--danger);
      }
      .change {
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        font-weight: 700;
        font-size: 0.92rem;
      }
      .change.up {
        color: var(--success);
      }
      .change.down {
        color: var(--danger);
      }
      .change .muted {
        font-weight: 500;
      }
      .split {
        display: flex;
        height: 12px;
        border-radius: 999px;
        overflow: hidden;
        background: var(--surface-2);
        margin-top: 12px;
      }
      .split i {
        display: block;
        height: 100%;
        transition: width 0.9s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      .assets {
        background: linear-gradient(90deg, #10b981, #34d399);
      }
      .debts {
        background: linear-gradient(90deg, #f43f5e, #fb7185);
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 22px;
        font-size: 0.88rem;
        color: var(--muted);
      }
      .legend span {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .legend strong {
        color: var(--text);
      }
      .dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
      }
      .chart {
        margin-bottom: 16px;
      }
      .rows {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .rows li {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .rows li.dim {
        opacity: 0.6;
      }
      .tile {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        flex: none;
        border-radius: 14px;
        color: var(--primary-2);
        background: color-mix(in srgb, var(--primary) 16%, transparent);
      }
      .grow {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .line {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
      }
      .bar {
        height: 6px;
        border-radius: 999px;
        background: var(--surface-2);
        overflow: hidden;
      }
      .bar i {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--grad);
        transition: width 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      .bar i.neg {
        background: linear-gradient(90deg, #f43f5e, #fb7185);
      }
      .note {
        margin-top: 14px;
        font-size: 0.86rem;
      }
      .cols-2 {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      @media (max-width: 820px) {
        .cols-2 {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class NetWorthComponent {
  private readonly api = inject(WealthApi);
  protected readonly refresh = inject(RefreshService);
  protected readonly viewport = inject(ViewportService);

  protected readonly ranges: SegmentOption[] = [
    { value: '6', label: '6 mo' },
    { value: '12', label: '1 yr' },
    { value: '24', label: '2 yrs' },
  ];
  protected readonly months = signal(12);

  private readonly state = asyncState<NetWorthDto>();
  protected readonly nw = this.state.data;
  protected readonly loaded = this.state.loaded;
  protected readonly error = this.state.error;

  protected readonly labels = computed(() =>
    (this.nw()?.history ?? []).map((p) =>
      formatDate(parseYmd(p.monthEnd), 'month'),
    ),
  );
  protected readonly series = computed<ChartSeries[]>(() => {
    const history = this.nw()?.history ?? [];
    return [
      {
        name: 'Net worth',
        color: 'var(--primary)',
        values: history.map((p) => p.netWorth),
      },
      {
        name: 'Assets',
        color: 'var(--success)',
        values: history.map((p) => p.assets),
        area: false,
        dashed: true,
      },
      {
        name: 'Liabilities',
        color: 'var(--danger)',
        values: history.map((p) => p.liabilities),
        area: false,
        dashed: true,
      },
    ];
  });

  protected readonly assetShare = computed(() => {
    const d = this.nw();
    if (!d) return 100;
    const total = d.assets + d.liabilities;
    return total > 0 ? Math.round((d.assets / total) * 1000) / 10 : 100;
  });

  private readonly largest = computed(() =>
    Math.max(1, ...(this.nw()?.byType ?? []).map((t) => Math.abs(t.total))),
  );

  constructor() {
    autoLoad(this.state, () => {
      this.refresh.version();
      return this.api.netWorth(this.months());
    });
  }

  protected setMonths(value: string): void {
    this.months.set(Number(value) || 12);
  }

  protected typeIcon(type: AccountType): IconName {
    return TYPE_ICONS[type];
  }

  protected barWidth(total: number): number {
    return Math.max(3, Math.round((Math.abs(total) / this.largest()) * 100));
  }
}
