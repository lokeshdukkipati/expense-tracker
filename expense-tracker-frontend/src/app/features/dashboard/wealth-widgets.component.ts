import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DuplicatesApi } from '../../core/api/duplicates.api';
import { GoalsApi } from '../../core/api/goals.api';
import { WealthApi } from '../../core/api/wealth.api';
import {
  AchievementsDto,
  DuplicateChargeDto,
  GoalDto,
  NetWorthDto,
} from '../../core/models/api.models';
import { PreferencesService } from '../../core/services/preferences.service';
import { RefreshService } from '../../core/services/refresh.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { SparklineComponent } from '../../shared/charts/sparkline.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyComponent, MoneyPipe } from '../../shared/ui/money.component';
import { SkeletonComponent } from '../../shared/ui/ui-bits.component';

/** Dashboard block: net worth, the closest goals, and today's habits (with a nudge about possible double charges). */
@Component({
  selector: 'app-wealth-widgets',
  imports: [
    RouterLink,
    IconComponent,
    MoneyComponent,
    MoneyPipe,
    SparklineComponent,
    SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid">
      <section class="card card-pad">
        <div class="card-head">
          <div>
            <h3 class="card-title">
              <app-icon name="landmark" [size]="18" /> Net worth
            </h3>
            <p class="card-sub">Assets minus liabilities</p>
          </div>
          <a routerLink="/net-worth" class="btn btn-ghost btn-sm">Details</a>
        </div>
        @if (nw(); as d) {
          @if (d.accounts.length === 0) {
            <p class="muted">Add an account to see your net worth here.</p>
            <a routerLink="/accounts" class="btn btn-secondary btn-sm"
              >Add an account</a
            >
          } @else {
            <strong class="big num" [class.text-danger]="d.netWorth < 0"
              ><app-money
                [value]="d.netWorth"
                [currency]="d.currency"
                [compact]="true"
            /></strong>
            <span
              class="chg"
              [class.up]="d.monthlyChange >= 0"
              [class.down]="d.monthlyChange < 0"
            >
              {{ d.monthlyChange | money: 'signed' : d.currency }}
              <span class="muted">since last month end</span>
            </span>
            <app-sparkline [values]="history()" [height]="56" />
          }
        } @else if (nwFailed()) {
          <p class="muted">Net worth could not be loaded.</p>
        } @else {
          <app-skeleton height="130px" radius="14px" />
        }
      </section>

      <section class="card card-pad">
        <div class="card-head">
          <div>
            <h3 class="card-title">
              <app-icon name="rocket" [size]="18" /> Goals
            </h3>
            <p class="card-sub">Closest to the finish line</p>
          </div>
          <a routerLink="/goals" class="btn btn-ghost btn-sm">All goals</a>
        </div>
        @if (goalsLoaded()) {
          @if (topGoals().length === 0) {
            <p class="muted">No goals yet. Pick something to save for.</p>
            <a routerLink="/goals" class="btn btn-secondary btn-sm"
              >Create a goal</a
            >
          } @else {
            <ul class="goals">
              @for (g of topGoals(); track g.id) {
                <li [style.--gc]="g.color || 'var(--primary)'">
                  <div class="line">
                    <strong class="truncate">{{ g.name }}</strong
                    ><span class="num">{{ g.progressPercent }}%</span>
                  </div>
                  <div
                    class="bar"
                    role="progressbar"
                    [attr.aria-valuenow]="g.progressPercent"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    [attr.aria-label]="g.name + ' progress'"
                  >
                    <i [style.width.%]="g.progressPercent"></i>
                  </div>
                  <small class="muted"
                    >{{ g.currentAmount | money: 'compact' : g.currency }} of
                    {{ g.targetAmount | money: 'compact' : g.currency }}</small
                  >
                </li>
              }
            </ul>
          }
        } @else {
          <app-skeleton height="130px" radius="14px" />
        }
      </section>

      <section class="card card-pad">
        <div class="card-head">
          <div>
            <h3 class="card-title">
              <app-icon name="flame" [size]="18" /> Habits
            </h3>
            <p class="card-sub">Streaks and badges</p>
          </div>
          <a routerLink="/achievements" class="btn btn-ghost btn-sm">See all</a>
        </div>
        @if (ach(); as a) {
          <div class="streak">
            <span class="ico" [class.live]="a.logging.current > 0"
              ><app-icon name="flame" [size]="22"
            /></span>
            <div class="info">
              <strong class="num big2"
                >{{ a.logging.current }}
                <small
                  >day{{ a.logging.current === 1 ? '' : 's' }} logged in a
                  row</small
                ></strong
              >
              <small class="muted"
                >Best {{ a.logging.best }} · {{ a.earnedCount }} of
                {{ a.totalCount }} badges earned</small
              >
            </div>
          </div>
        } @else {
          <app-skeleton height="64px" radius="14px" />
        }

        @if (duplicateCount() > 0) {
          <a routerLink="/duplicates" class="alert">
            <app-icon name="copy" [size]="18" />
            <span
              ><strong
                >{{ duplicateCount() }} possible double charge{{
                  duplicateCount() === 1 ? '' : 's'
                }}</strong
              ><small>Review them and delete the extras.</small></span
            >
            <app-icon name="chevron-right" [size]="18" />
          </a>
        }
      </section>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
      }
      .card {
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-width: 0;
      }
      .big {
        font-size: clamp(1.7rem, 7vw, 2.3rem);
        font-weight: 850;
        letter-spacing: -0.03em;
        line-height: 1.1;
        overflow-wrap: anywhere;
      }
      .chg {
        font-weight: 700;
        font-size: 0.88rem;
      }
      .chg.up {
        color: var(--success);
      }
      .chg.down {
        color: var(--danger);
      }
      .chg .muted {
        font-weight: 500;
      }
      .goals {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .goals li {
        --gc: var(--primary);
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
      }
      .line {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 10px;
      }
      .bar {
        height: 8px;
        border-radius: 999px;
        background: var(--surface-2);
        overflow: hidden;
      }
      .bar i {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--gc);
        transition: width 0.9s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      .streak {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .ico {
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        flex: none;
        border-radius: 16px;
        color: var(--muted);
        background: var(--surface-2);
      }
      .ico.live {
        color: #fff;
        background: var(--grad);
      }
      .info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .big2 {
        font-size: 1.5rem;
        font-weight: 850;
        letter-spacing: -0.02em;
      }
      .big2 small {
        font-size: 0.82rem;
        font-weight: 600;
        color: var(--muted);
        letter-spacing: 0;
      }
      .alert {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 16px;
        text-decoration: none !important;
        color: var(--text);
        background: color-mix(in srgb, var(--warning) 14%, transparent);
        border: 1px solid color-mix(in srgb, var(--warning) 35%, transparent);
      }
      .alert span {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .alert small {
        color: var(--muted);
      }
    `,
  ],
})
export class WealthWidgetsComponent {
  private readonly wealth = inject(WealthApi);
  private readonly goalsApi = inject(GoalsApi);
  private readonly duplicatesApi = inject(DuplicatesApi);
  private readonly prefs = inject(PreferencesService);
  private readonly refresh = inject(RefreshService);

  private readonly nwState = asyncState<NetWorthDto>();
  private readonly goalsState = asyncState<GoalDto[]>();
  private readonly achState = asyncState<AchievementsDto>();
  private readonly dupState = asyncState<DuplicateChargeDto[]>();

  protected readonly nw = this.nwState.data;
  protected readonly nwFailed = computed(() => this.nwState.error() !== null);
  protected readonly goalsLoaded = this.goalsState.loaded;
  protected readonly ach = this.achState.data;

  protected readonly history = computed(() =>
    (this.nw()?.history ?? []).map((p) => p.netWorth),
  );

  /** Goals still to reach come first, closest to done first. */
  protected readonly topGoals = computed(() =>
    [...(this.goalsState.data() ?? [])]
      .filter((g) => !g.isArchived)
      .sort(
        (a, b) =>
          Number(a.isCompleted) - Number(b.isCompleted) ||
          b.progressPercent - a.progressPercent,
      )
      .slice(0, 3),
  );

  protected readonly duplicateCount = computed(() => {
    const dismissed = new Set(this.prefs.dismissedDuplicates());
    return (this.dupState.data() ?? []).filter((d) => !dismissed.has(d.key))
      .length;
  });

  constructor() {
    autoLoad(this.nwState, () => {
      this.refresh.version();
      return this.wealth.netWorth(6);
    });
    autoLoad(this.goalsState, () => {
      this.refresh.version();
      return this.goalsApi.list(false);
    });
    autoLoad(this.achState, () => {
      this.refresh.version();
      return this.wealth.achievements();
    });
    autoLoad(this.dupState, () => {
      this.refresh.version();
      return this.duplicatesApi.find(30);
    });
  }
}
