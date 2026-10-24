import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { AnalyticsApi } from '../../core/api/analytics.api';
import { WealthApi } from '../../core/api/wealth.api';
import { AuthService } from '../../core/services/auth.service';
import { RefreshService } from '../../core/services/refresh.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { formatMoney } from '../../core/utils/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { StoryViewerComponent } from '../../shared/ui/story-viewer.component';
import { StoryInput, buildMoneyStory } from './money-story';

const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const rangeText = (from: Date, to: Date): string => {
  const format = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
  });
  return `${format.format(from)} – ${format.format(to)}`;
};
/**
 * A card that opens "your month in a few cards" as swipeable stories. It renders nothing until there is something to
 * tell, and opens by itself when the page is visited with ?story=1 (the command palette uses that).
 * Place it on the dashboard.
 */
@Component({
  selector: 'app-money-story',
  imports: [IconComponent, StoryViewerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (stories().length > 0) {
      <section class="card story">
        <span class="glow" aria-hidden="true"></span>
        <div class="text">
          <span class="kicker">Your {{ label() }} story</span>
          <strong class="headline">{{ headline() }}</strong>
          <small>{{ stories().length }} cards · under a minute</small>
        </div>
        <button
          type="button"
          class="play"
          aria-label="Play your money story"
          (click)="open.set(true)"
        >
          <app-icon name="play" [size]="22" />
        </button>
      </section>
      <app-story-viewer
        [stories]="stories()"
        [open]="open()"
        (closed)="open.set(false)"
      />
    }
  `,
  styles: [
    `
      .story {
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 18px 20px;
        color: #fff;
        border: 0;
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--primary) 85%, #05060e),
          color-mix(in srgb, var(--pink) 70%, #05060e)
        );
      }
      .glow {
        position: absolute;
        width: 220px;
        height: 220px;
        right: -60px;
        top: -90px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.18);
        filter: blur(30px);
        pointer-events: none;
      }
      .text {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }
      .kicker {
        font-size: 0.74rem;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        opacity: 0.85;
      }
      .headline {
        font-size: clamp(1.2rem, 5vw, 1.5rem);
        letter-spacing: -0.02em;
        overflow-wrap: anywhere;
      }
      small {
        opacity: 0.8;
      }
      .play {
        position: relative;
        display: grid;
        place-items: center;
        width: 52px;
        height: 52px;
        flex: none;
        border: 0;
        border-radius: 50%;
        cursor: pointer;
        color: var(--primary);
        background: #fff;
        box-shadow: 0 10px 26px -8px rgba(0, 0, 0, 0.5);
        transition: transform 0.15s;
      }
      .play:hover {
        transform: scale(1.06);
      }
      .play:active {
        transform: scale(0.94);
      }
    `,
  ],
})
export class MoneyStoryComponent {
  private readonly analytics = inject(AnalyticsApi);
  private readonly wealth = inject(WealthApi);
  private readonly auth = inject(AuthService);
  private readonly refresh = inject(RefreshService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly open = signal(false);

  private readonly state = asyncState<Omit<StoryInput, 'currency'>>();
  /** "October", "September" or "recent": whichever period actually has something to tell. */
  protected readonly label = computed(
    () => this.state.data()?.periodLabel ?? '',
  );

  private readonly storyParam = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('story'))),
    {
      initialValue: this.route.snapshot.queryParamMap.get('story'),
    },
  );

  protected readonly stories = computed(() => {
    const data = this.state.data();
    return data
      ? buildMoneyStory({ ...data, currency: this.auth.currency() })
      : [];
  });

  protected readonly headline = computed(() => {
    const data = this.state.data();
    return data
      ? `${formatMoney(data.summary.expense, this.auth.currency(), { compact: true })} spent${data.isCurrent ? ' so far' : ''}`
      : '';
  });

  /** This month so far, then last month, then the last 90 days. */
  private periods(): {
    label: string;
    from: Date;
    to: Date;
    isCurrent: boolean;
  }[] {
    const now = new Date();
    const monthName = (d: Date): string =>
      new Intl.DateTimeFormat(undefined, { month: 'long' }).format(d);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return [
      {
        label: monthName(now),
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: now,
        isCurrent: true,
      },
      {
        label: monthName(lastMonthStart),
        from: lastMonthStart,
        to: new Date(now.getFullYear(), now.getMonth(), 0),
        isCurrent: false,
      },
      {
        label: 'recent',
        from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89),
        to: now,
        isCurrent: false,
      },
    ];
  }

  /** Uses the first period with enough activity to tell a story, so the card does not vanish in a quiet month. */
  private loadPeriod(index: number): Observable<Omit<StoryInput, 'currency'>> {
    const periods = this.periods();
    const period = periods[index] ?? periods[periods.length - 1]!;
    const filter = { from: ymd(period.from), to: ymd(period.to) };

    // The comparison period is the same number of days straight before this one.
    const days =
      Math.round((period.to.getTime() - period.from.getTime()) / 86_400_000) +
      1;
    const previousTo = new Date(
      period.from.getFullYear(),
      period.from.getMonth(),
      period.from.getDate() - 1,
    );
    const previousFrom = new Date(
      previousTo.getFullYear(),
      previousTo.getMonth(),
      previousTo.getDate() - (days - 1),
    );

    return this.analytics.summary(filter).pipe(
      switchMap((summary) => {
        if (summary.transactionCount < 3 && index < periods.length - 1)
          return this.loadPeriod(index + 1);

        return forkJoin([
          this.analytics.categoryComparison(filter),
          this.analytics.patterns(filter),
          this.wealth.achievements().pipe(catchError(() => of(null))), // nice to have, never required
        ]).pipe(
          map(([comparison, patterns, achievements]) => ({
            summary,
            comparison,
            patterns,
            achievements,
            periodLabel: period.label,
            isCurrent: period.isCurrent,
            rangeText: rangeText(period.from, period.to),
            previousText: rangeText(previousFrom, previousTo),
          })),
        );
      }),
    );
  }

  constructor() {
    autoLoad(this.state, () => {
      this.refresh.version();
      return this.loadPeriod(0);
    });

    // Opened from the command palette: show the story as soon as it is ready, then tidy the address.
    effect(() => {
      const wanted = this.storyParam() === '1';
      const ready = this.stories().length > 0;
      if (wanted && ready) {
        untracked(() => {
          this.open.set(true);
          void this.router.navigate([], {
            queryParams: { story: null },
            queryParamsHandling: 'merge',
            replaceUrl: true,
          });
        });
      }
    });
  }
}
