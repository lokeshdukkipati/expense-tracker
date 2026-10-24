import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { AnalyticsApi } from '../../core/api/analytics.api';
import { WealthApi } from '../../core/api/wealth.api';
import { AuthService } from '../../core/services/auth.service';
import { RefreshService } from '../../core/services/refresh.service';
import { StoryService } from '../../core/services/story.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { formatMoney } from '../../core/utils/format';
import { IconComponent } from '../../shared/ui/icon.component';
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
 * The dashboard card that opens "your month in a few cards" as full-screen stories.
 * It tells the story of this month, or last month, or the last 90 days: whichever has enough activity.
 * Renders nothing until there is something to tell. Visiting any page with ?story=1 opens it straight away.
 */
@Component({
  selector: 'app-money-story',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (stories().length > 0) {
      <button
        type="button"
        class="story"
        (click)="play()"
        aria-label="Play your money story"
      >
        <span class="ring" aria-hidden="true"
          ><span class="core"><app-icon name="play" [size]="20" /></span
        ></span>
        <span class="text">
          <span class="kicker">Your {{ label() }} story</span>
          <strong class="headline">{{ headline() }}</strong>
          <small>{{ stories().length }} cards · {{ range() }}</small>
        </span>
        <app-icon name="chevron-right" [size]="20" />
      </button>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .story {
        position: relative;
        width: 100%;
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px 18px;
        border-radius: 22px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        text-align: left;
        cursor: pointer;
        font: inherit;
        color: #f5f6fb;
        overflow: hidden;
        background:
          radial-gradient(
            120% 140% at 100% 0%,
            color-mix(in srgb, var(--primary) 38%, transparent),
            transparent 60%
          ),
          radial-gradient(
            120% 140% at 0% 100%,
            color-mix(in srgb, var(--pink) 26%, transparent),
            transparent 60%
          ),
          #0e1018;
        transition:
          transform 0.2s,
          box-shadow 0.2s;
      }
      .story:hover {
        transform: translateY(-2px);
        box-shadow: 0 18px 40px -18px rgba(0, 0, 0, 0.7);
      }
      .story:active {
        transform: scale(0.985);
      }
      .ring {
        position: relative;
        display: grid;
        place-items: center;
        width: 62px;
        height: 62px;
        flex: none;
        border-radius: 50%;
      }
      .ring::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: conic-gradient(
          from 0deg,
          var(--primary),
          var(--pink),
          var(--accent),
          var(--primary)
        );
        animation: spin 5s linear infinite;
      }
      .core {
        position: relative;
        display: grid;
        place-items: center;
        width: 54px;
        height: 54px;
        border-radius: 50%;
        background: #0e1018;
        color: #fff;
      }
      .text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }
      .kicker {
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.7);
      }
      .headline {
        font-size: clamp(1.15rem, 5vw, 1.45rem);
        letter-spacing: -0.02em;
        overflow-wrap: anywhere;
      }
      small {
        color: rgba(255, 255, 255, 0.65);
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class MoneyStoryComponent {
  private readonly analytics = inject(AnalyticsApi);
  private readonly wealth = inject(WealthApi);
  private readonly auth = inject(AuthService);
  private readonly refresh = inject(RefreshService);
  private readonly story = inject(StoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly state = asyncState<Omit<StoryInput, 'currency'>>();
  private readonly storyParam = toSignal(
    this.route.queryParamMap.pipe(map((p) => p.get('story'))),
    {
      initialValue: this.route.snapshot.queryParamMap.get('story'),
    },
  );

  /** "October", "September" or "recent": whichever period actually has something to tell. */
  protected readonly label = computed(
    () => this.state.data()?.periodLabel ?? '',
  );
  protected readonly range = computed(() => this.state.data()?.rangeText ?? '');

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
          this.play();
          void this.router.navigate([], {
            queryParams: { story: null },
            queryParamsHandling: 'merge',
            replaceUrl: true,
          });
        });
      }
    });
  }

  protected play(): void {
    this.story.open({
      title: `Your ${this.label() || 'money'} story`,
      subtitle: this.range(),
      cards: this.stories(),
    });
  }

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
}
