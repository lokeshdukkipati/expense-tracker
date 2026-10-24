import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { WealthApi } from '../../core/api/wealth.api';
import {
  AchievementsDto,
  BadgeDto,
  StreakDto,
} from '../../core/models/api.models';
import { PreferencesService } from '../../core/services/preferences.service';
import { RefreshService } from '../../core/services/refresh.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { ConfettiService } from '../../shared/ui/confetti.component';
import {
  IconComponent,
  IconName,
  iconOr,
} from '../../shared/ui/icon.component';
import { ProgressRingComponent } from '../../shared/ui/progress-ring.component';
import {
  ErrorStateComponent,
  SkeletonComponent,
} from '../../shared/ui/ui-bits.component';

const GROUPS = [
  { id: 'habits', label: 'Habits' },
  { id: 'saving', label: 'Saving' },
  { id: 'budget', label: 'Budget' },
  { id: 'goals', label: 'Goals' },
  { id: 'setup', label: 'Getting set up' },
];

interface StreakCard {
  key: string;
  title: string;
  icon: IconName;
  streak: StreakDto;
  hint: string;
  link?: string;
  linkLabel?: string;
}

@Component({
  selector: 'app-achievements',
  imports: [
    RouterLink,
    IconComponent,
    ProgressRingComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Streaks & badges</h1>
          <p>
            Small habits, rewarded. Everything here is worked out from your own
            data.
          </p>
        </div>
      </div>

      @if (error(); as e) {
        <app-error-state [error]="e" (retry)="refresh.bump()" />
      } @else if (!loaded()) {
        <div class="auto-grid">
          <app-skeleton height="150px" radius="20px" /><app-skeleton
            height="150px"
            radius="20px"
          /><app-skeleton height="150px" radius="20px" />
        </div>
      } @else if (summary()) {
        @let d = summary()!;
        <section class="card card-pad head reveal">
          <app-progress-ring
            [value]="earnedPercent()"
            [size]="88"
            [stroke]="10"
            label="Badges earned"
          >
            <strong class="num">{{ d.earnedCount }}/{{ d.totalCount }}</strong>
          </app-progress-ring>
          <div class="head-text">
            <strong
              >{{ d.earnedCount }} of {{ d.totalCount }} badges earned</strong
            >
            <small class="muted"
              >{{ d.noSpendDaysLast30 }} no-spend day{{
                d.noSpendDaysLast30 === 1 ? '' : 's'
              }}
              in the last 30 days</small
            >
          </div>
        </section>

        <div class="streaks">
          @for (s of streakCards(); track s.key; let i = $index) {
            <article
              class="card card-pad streak"
              [class.live]="s.streak.current > 0"
              [style.--i]="i"
            >
              <span class="ico"><app-icon [name]="s.icon" [size]="24" /></span>
              <div class="info">
                <span class="muted">{{ s.title }}</span>
                @if (s.streak.available) {
                  <strong class="num big"
                    >{{ s.streak.current }}
                    <small>{{ unit(s.streak) }}</small></strong
                  >
                  <small class="muted"
                    >Best: {{ s.streak.best }}
                    {{ unit(s.streak, s.streak.best) }}</small
                  >
                } @else {
                  <small class="muted hint">{{ s.hint }}</small>
                  @if (s.link) {
                    <a [routerLink]="s.link" class="btn btn-secondary btn-sm">{{
                      s.linkLabel
                    }}</a>
                  }
                }
              </div>
            </article>
          }
        </div>

        @for (g of groups(); track g.id) {
          <h2 class="group">{{ g.label }}</h2>
          <div class="badges">
            @for (b of g.badges; track b.id; let i = $index) {
              <article
                class="badge-card"
                [class.earned]="b.isEarned"
                [class.fresh]="isNew(b)"
                [attr.data-tier]="b.tier"
                [style.--i]="i"
              >
                @if (isNew(b)) {
                  <span class="new">New</span>
                }
                <span class="medal"
                  ><app-icon [name]="badgeIcon(b)" [size]="26"
                /></span>
                <strong>{{ b.title }}</strong>
                <small class="muted">{{ b.description }}</small>
                @if (b.isEarned) {
                  <span class="done"
                    ><app-icon name="check" [size]="14" /> Earned</span
                  >
                } @else {
                  <div
                    class="meter"
                    role="progressbar"
                    [attr.aria-valuenow]="b.progress"
                    aria-valuemin="0"
                    [attr.aria-valuemax]="b.target"
                    [attr.aria-label]="b.title + ' progress'"
                  >
                    <i [style.width.%]="percent(b)"></i>
                  </div>
                  <small class="muted num"
                    >{{ b.progress }} / {{ b.target }}</small
                  >
                }
              </article>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      .head {
        display: flex;
        align-items: center;
        gap: 18px;
        margin-bottom: 16px;
      }
      .head-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .streaks {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        margin-bottom: 8px;
      }
      .streak {
        display: flex;
        gap: 14px;
        align-items: flex-start;
        animation: fadeUp 0.45s both;
        animation-delay: calc(var(--i) * 60ms);
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
      .streak.live .ico {
        color: #fff;
        background: var(--grad);
        box-shadow: 0 10px 24px -10px var(--primary);
      }
      .streak.live .ico app-icon {
        animation: flicker 2.2s ease-in-out infinite;
      }
      .info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        align-items: flex-start;
      }
      .big {
        font-size: 2rem;
        font-weight: 850;
        letter-spacing: -0.03em;
        line-height: 1.1;
      }
      .big small {
        font-size: 0.9rem;
        font-weight: 600;
        color: var(--muted);
        letter-spacing: 0;
      }
      .hint {
        line-height: 1.4;
        margin-bottom: 6px;
      }
      .group {
        font-size: 1.05rem;
        margin: 22px 2px 10px;
      }
      .badges {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 170px), 1fr));
      }
      .badge-card {
        --tier: #cd7f32;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        padding: 16px 14px;
        border-radius: 20px;
        border: 1px solid var(--border);
        background: var(--surface);
        opacity: 0.72;
        animation: fadeUp 0.4s both;
        animation-delay: calc(var(--i) * 40ms);
      }
      .badge-card[data-tier='silver'] {
        --tier: #94a3b8;
      }
      .badge-card[data-tier='gold'] {
        --tier: #f5b301;
      }
      .badge-card.earned {
        opacity: 1;
        border-color: color-mix(in srgb, var(--tier) 55%, transparent);
        background: linear-gradient(
          160deg,
          color-mix(in srgb, var(--tier) 14%, transparent),
          var(--surface)
        );
      }
      .badge-card:not(.earned) .medal {
        filter: grayscale(1);
      }
      .badge-card.fresh {
        animation:
          fadeUp 0.4s both,
          glow 2.2s ease-in-out 3;
      }
      .medal {
        display: grid;
        place-items: center;
        width: 52px;
        height: 52px;
        border-radius: 50%;
        color: #fff;
        margin-bottom: 4px;
        background: radial-gradient(
          circle at 30% 25%,
          color-mix(in srgb, var(--tier) 70%, #fff),
          var(--tier)
        );
        box-shadow: inset 0 -4px 8px rgba(0, 0, 0, 0.18);
      }
      .badge-card strong {
        font-size: 0.95rem;
      }
      .badge-card small {
        line-height: 1.35;
      }
      .new {
        position: absolute;
        top: 10px;
        right: 10px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #fff;
        background: var(--grad);
      }
      .done {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-top: 2px;
        font-size: 0.78rem;
        font-weight: 700;
        color: var(--success);
      }
      .meter {
        width: 100%;
        height: 6px;
        border-radius: 999px;
        background: var(--surface-2);
        overflow: hidden;
        margin-top: 4px;
      }
      .meter i {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: var(--grad);
        transition: width 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      @keyframes flicker {
        0%,
        100% {
          transform: scale(1) rotate(0);
        }
        40% {
          transform: scale(1.12) rotate(-4deg);
        }
        70% {
          transform: scale(0.96) rotate(3deg);
        }
      }
      @keyframes glow {
        0%,
        100% {
          box-shadow: 0 0 0 0 transparent;
        }
        50% {
          box-shadow: 0 0 0 6px color-mix(in srgb, var(--tier) 30%, transparent);
        }
      }
      @media (max-width: 820px) {
        .streaks {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class AchievementsComponent {
  private readonly api = inject(WealthApi);
  private readonly prefs = inject(PreferencesService);
  private readonly confetti = inject(ConfettiService);
  protected readonly refresh = inject(RefreshService);

  private readonly state = asyncState<AchievementsDto>();
  protected readonly summary = this.state.data;
  protected readonly loaded = this.state.loaded;
  protected readonly error = this.state.error;

  /** Badges earned since the last time this page was opened. Kept for the visit so they stay highlighted. */
  private readonly newIds = signal<ReadonlySet<string>>(new Set());

  protected readonly earnedPercent = computed(() => {
    const d = this.summary();
    return d && d.totalCount > 0
      ? Math.round((d.earnedCount / d.totalCount) * 100)
      : 0;
  });

  protected readonly streakCards = computed<StreakCard[]>(() => {
    const d = this.summary();
    if (!d) return [];
    return [
      {
        key: 'logging',
        title: 'Logging streak',
        icon: 'flame',
        streak: d.logging,
        hint: 'Add a transaction today to start a streak.',
      },
      {
        key: 'nospend',
        title: 'No-spend streak',
        icon: 'leaf',
        streak: d.noSpend,
        hint: 'Go a day without spending to start one.',
      },
      {
        key: 'budget',
        title: 'Budget streak',
        icon: 'shield',
        streak: d.budget,
        hint: 'Set an overall monthly budget to start a streak.',
        link: '/budgets',
        linkLabel: 'Set a budget',
      },
    ];
  });

  protected readonly groups = computed(() => {
    const badges = this.summary()?.badges ?? [];
    return GROUPS.map((g) => ({
      ...g,
      badges: badges.filter((b) => b.group === g.id),
    })).filter((g) => g.badges.length > 0);
  });

  constructor() {
    autoLoad(this.state, () => {
      this.refresh.version();
      return this.api.achievements();
    });

    // Celebrate badges earned since the last visit, then remember they have been seen.
    effect(() => {
      const data = this.summary();
      if (!data || !this.prefs.synced()) return;

      untracked(() => {
        const seen = new Set(this.prefs.seenBadges());
        const earned = data.badges.filter((b) => b.isEarned).map((b) => b.id);
        const fresh = earned.filter((id) => !seen.has(id));
        if (fresh.length === 0) return;

        this.newIds.set(new Set(fresh));
        this.confetti.burst({
          count: Math.min(60 + fresh.length * 30, 150),
          y: 0.3,
        });
        this.prefs.markBadgesSeen(earned);
      });
    });
  }

  protected isNew(badge: BadgeDto): boolean {
    return badge.isEarned && this.newIds().has(badge.id);
  }

  protected badgeIcon(badge: BadgeDto): IconName {
    return iconOr(badge.icon, 'award');
  }

  protected percent(badge: BadgeDto): number {
    return badge.target > 0
      ? Math.min(100, Math.round((badge.progress / badge.target) * 100))
      : 0;
  }

  protected unit(streak: StreakDto, count = streak.current): string {
    const base = streak.unit === 'months' ? 'month' : 'day';
    return count === 1 ? base : `${base}s`;
  }
}
