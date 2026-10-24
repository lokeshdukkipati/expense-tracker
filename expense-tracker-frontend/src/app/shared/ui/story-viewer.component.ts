import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MotionService } from '../../core/services/motion.service';
import { IconComponent, IconName } from './icon.component';

export type StoryTone = 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface StoryCard {
  id: string;
  /** Small label above the headline, for example "Food". */
  kicker?: string;
  title: string;
  /** The big number or phrase, for example "₹12,400" or "+22%". */
  metric?: string;
  metricLabel?: string;
  body?: string;
  tone?: StoryTone;
  icon?: IconName;
}

const AUTO_ADVANCE_MS = 5500;

/**
 * Full-screen, swipeable story cards (think Instagram stories) for the money story and monthly recap.
 * Tap right/left to move, hold to pause, swipe down or press Escape to close. It auto-advances unless the user
 * prefers reduced motion, in which case it is manual only.
 */
@Component({
  selector: 'app-story-viewer',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    @if (open() && stories().length > 0) {
      <div class="scrim" (click)="close()"></div>

      <section
        #viewer
        class="viewer"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'Story ' + (index() + 1) + ' of ' + stories().length"
        [attr.data-tone]="card().tone ?? 'brand'"
        tabindex="-1"
      >
        <div class="bars" aria-hidden="true">
          @for (s of stories(); track s.id; let i = $index) {
            <span class="bar">
              <i
                [class.done]="i < index()"
                [class.active]="i === index()"
                [class.auto]="auto()"
                [class.paused]="paused()"
                [style.--dur.ms]="duration"
                (animationend)="onBarEnd(i)"
              ></i>
            </span>
          }
        </div>

        <span class="count" aria-hidden="true"
          >{{ index() + 1 }} / {{ stories().length }}</span
        >
        <button
          type="button"
          class="close"
          aria-label="Close"
          (click)="close()"
        >
          <app-icon name="x" [size]="22" />
        </button>

        <div
          class="stage"
          (pointerdown)="onDown($event)"
          (pointerup)="onUp($event)"
          (pointercancel)="onCancel()"
        >
          <span class="blob b1"></span>
          <span class="blob b2"></span>

          @for (c of [card()]; track c.id) {
            <article class="card">
              @if (c.icon) {
                <span class="badge-icon"
                  ><app-icon [name]="c.icon" [size]="26"
                /></span>
              }
              @if (c.kicker) {
                <p class="kicker">{{ c.kicker }}</p>
              }
              @if (c.metric) {
                <p class="metric num">{{ c.metric }}</p>
                @if (c.metricLabel) {
                  <p class="metric-label">{{ c.metricLabel }}</p>
                }
              }
              <h2>{{ c.title }}</h2>
              @if (c.body) {
                <p class="body">{{ c.body }}</p>
              }
            </article>
          }
          @if (index() === 0) {
            <p class="tip" aria-hidden="true">
              Tap right for the next card · left to go back · hold to pause
            </p>
          }
        </div>

        <footer>
          <button
            type="button"
            class="nav"
            aria-label="Previous"
            (click)="prev()"
            [disabled]="index() === 0"
          >
            <app-icon name="chevron-left" [size]="20" />
          </button>
          <button
            type="button"
            class="nav"
            [attr.aria-label]="userPaused() ? 'Play' : 'Pause'"
            (click)="userPaused.set(!userPaused())"
            [hidden]="!auto()"
          >
            <app-icon [name]="userPaused() ? 'play' : 'pause'" [size]="18" />
          </button>
          <button type="button" class="nav" aria-label="Next" (click)="next()">
            <app-icon name="chevron-right" [size]="20" />
          </button>
        </footer>
      </section>
    }
  `,
  styles: [
    `
      .scrim {
        position: fixed;
        inset: 0;
        z-index: 1200;
        background: rgba(5, 6, 14, 0.72);
        backdrop-filter: blur(8px);
        animation: fadeIn 0.25s both;
      }
      .viewer {
        --t1: #7c6cff;
        --t2: #f472b6;
        position: fixed;
        z-index: 1201;
        inset: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        color: #fff;
        outline: none;
        padding: max(env(safe-area-inset-top), 12px) 16px
          max(env(safe-area-inset-bottom), 12px);
        background: linear-gradient(
          160deg,
          color-mix(in srgb, var(--t1) 68%, #05060e),
          color-mix(in srgb, var(--t2) 52%, #05060e)
        );
        animation: viewerIn 0.35s cubic-bezier(0.2, 0.9, 0.3, 1) both;
        touch-action: pan-y;
      }
      .viewer[data-tone='success'] {
        --t1: #10b981;
        --t2: #22d3ee;
      }
      .viewer[data-tone='warning'] {
        --t1: #f59e0b;
        --t2: #f97316;
      }
      .viewer[data-tone='danger'] {
        --t1: #f43f5e;
        --t2: #f472b6;
      }
      .viewer[data-tone='info'] {
        --t1: #3b82f6;
        --t2: #22d3ee;
      }
      @media (min-width: 768px) {
        .viewer {
          inset: auto;
          left: 50%;
          top: 50%;
          width: min(440px, calc(100vw - 24px));
          height: min(86dvh, 820px);
          border-radius: 28px;
          box-shadow: var(--shadow-lg);
          animation: viewerDesktopIn 0.35s cubic-bezier(0.2, 0.9, 0.3, 1) both;
        }
      }
      .bars {
        display: flex;
        gap: 5px;
        padding: 6px 44px 0 0;
      }
      .count {
        margin: 10px 2px 0;
        font-size: 0.82rem;
        font-weight: 700;
        opacity: 0.9;
      }
      .tip {
        position: absolute;
        left: 12px;
        right: 12px;
        bottom: 4px;
        margin: 0;
        text-align: center;
        font-size: 0.78rem;
        opacity: 0.85;
      }
      .bar {
        flex: 1;
        height: 3px;
        border-radius: 3px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.3);
      }
      .bar i {
        display: block;
        height: 100%;
        background: #fff;
        transform-origin: left;
        transform: scaleX(0);
      }
      .bar i.done {
        transform: scaleX(1);
      }
      .bar i.active:not(.auto) {
        transform: scaleX(1);
      }
      .bar i.active.auto {
        animation: storyFill var(--dur, 5500ms) linear both;
      }
      .bar i.active.paused {
        animation-play-state: paused;
      }
      .close {
        position: absolute;
        z-index: 3;
        top: max(env(safe-area-inset-top), 12px);
        right: 12px;
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border: 0;
        border-radius: 50%;
        color: #fff;
        background: rgba(0, 0, 0, 0.22);
        cursor: pointer;
        margin-top: 4px;
      }
      .stage {
        position: relative;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 0;
        user-select: none;
        -webkit-user-select: none;
        cursor: pointer;
      }
      .blob {
        position: absolute;
        border-radius: 50%;
        filter: blur(40px);
        opacity: 0.22;
        pointer-events: none;
        animation: float 7s ease-in-out infinite;
      }
      .b1 {
        width: 220px;
        height: 220px;
        top: 6%;
        left: -60px;
        background: var(--t2);
      }
      .b2 {
        width: 260px;
        height: 260px;
        bottom: 4%;
        right: -80px;
        background: var(--t1);
        animation-delay: -3s;
      }
      .card {
        position: relative;
        z-index: 1;
        width: 100%;
        padding: 8px 12px;
        text-align: left;
        display: flex;
        flex-direction: column;
        gap: 10px;
        text-shadow: 0 1px 14px rgba(0, 0, 0, 0.35);
      }
      .card > * {
        animation: fadeUp 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
      .card > :nth-child(2) {
        animation-delay: 0.06s;
      }
      .card > :nth-child(3) {
        animation-delay: 0.12s;
      }
      .card > :nth-child(4) {
        animation-delay: 0.18s;
      }
      .card > :nth-child(5) {
        animation-delay: 0.24s;
      }
      .badge-icon {
        display: grid;
        place-items: center;
        width: 56px;
        height: 56px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.2);
        backdrop-filter: blur(6px);
        margin-bottom: 6px;
      }
      .kicker {
        margin: 0;
        align-self: flex-start;
        padding: 4px 12px;
        border-radius: 999px;
        background: rgba(0, 0, 0, 0.25);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-size: 0.76rem;
        font-weight: 700;
      }
      .metric {
        margin: 0;
        font-size: clamp(3rem, 15vw, 4.8rem);
        font-weight: 850;
        letter-spacing: -0.035em;
        line-height: 1;
        overflow-wrap: anywhere;
      }
      .metric-label {
        margin: 0;
        font-size: 1.05rem;
        font-weight: 600;
      }
      h2 {
        margin: 10px 0 0;
        font-size: clamp(1.6rem, 7vw, 2.1rem);
        font-weight: 780;
        line-height: 1.2;
        letter-spacing: -0.02em;
        overflow-wrap: anywhere;
      }
      .body {
        margin: 0;
        font-size: 1.12rem;
        line-height: 1.55;
        overflow-wrap: anywhere;
      }
      footer {
        position: relative;
        z-index: 2;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
        padding-top: 8px;
      }
      .nav {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border: 0;
        border-radius: 50%;
        color: #fff;
        background: rgba(0, 0, 0, 0.22);
        cursor: pointer;
        transition:
          background 0.2s,
          transform 0.15s;
      }
      .nav:hover:not(:disabled) {
        background: rgba(0, 0, 0, 0.34);
      }
      .nav:active:not(:disabled) {
        transform: scale(0.92);
      }
      .nav:disabled {
        opacity: 0.35;
        cursor: default;
      }
      @keyframes storyFill {
        from {
          transform: scaleX(0);
        }
        to {
          transform: scaleX(1);
        }
      }
      @keyframes viewerIn {
        from {
          opacity: 0;
          transform: translateY(24px) scale(0.98);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @keyframes viewerDesktopIn {
        from {
          opacity: 0;
          transform: translate(-50%, -46%) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
      }
      @media (min-width: 768px) {
        .viewer {
          transform: translate(-50%, -50%);
        }
      }
    `,
  ],
})
export class StoryViewerComponent {
  readonly stories = input.required<StoryCard[]>();
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  protected readonly duration = AUTO_ADVANCE_MS;
  protected readonly index = signal(0);
  protected readonly userPaused = signal(false);

  private readonly motion = inject(MotionService);
  private readonly holding = signal(false);
  private readonly viewer = viewChild<ElementRef<HTMLElement>>('viewer');

  protected readonly auto = computed(() => !this.motion.reduced());
  protected readonly paused = computed(
    () => this.holding() || this.userPaused(),
  );
  protected readonly card = computed(
    () =>
      this.stories()[
        Math.min(this.index(), Math.max(0, this.stories().length - 1))
      ] ?? EMPTY_CARD,
  );

  private downAt = 0;
  private downX = 0;
  private downY = 0;

  constructor() {
    effect(() => {
      const open = this.open();
      untracked(() => {
        if (open) {
          this.index.set(0);
          this.userPaused.set(false);
          this.holding.set(false);
        }
        document.documentElement.classList.toggle('scroll-lock', open);
      });
    });

    // Move keyboard focus into the viewer once it is shown, so Escape and the arrow keys work straight away.
    effect(() => {
      const element = this.viewer();
      if (element) untracked(() => element.nativeElement.focus());
    });
  }

  protected next(): void {
    if (this.index() >= this.stories().length - 1) {
      this.close();
    } else {
      this.index.update((i) => i + 1);
    }
  }

  protected prev(): void {
    this.index.update((i) => Math.max(0, i - 1));
  }

  protected close(): void {
    document.documentElement.classList.remove('scroll-lock');
    this.closed.emit();
  }

  protected onBarEnd(i: number): void {
    if (i === this.index() && this.auto()) this.next();
  }

  protected onKey(event: KeyboardEvent): void {
    if (!this.open()) return;
    if (event.key === 'ArrowRight') this.next();
    else if (event.key === 'ArrowLeft') this.prev();
    else if (event.key === 'Escape') this.close();
    else if (event.key === ' ' && this.auto()) {
      event.preventDefault();
      this.userPaused.update((p) => !p);
    }
  }

  protected onDown(event: PointerEvent): void {
    this.downAt = performance.now();
    this.downX = event.clientX;
    this.downY = event.clientY;
    this.holding.set(true);
  }

  protected onUp(event: PointerEvent): void {
    this.holding.set(false);

    const dx = event.clientX - this.downX;
    const dy = event.clientY - this.downY;
    const heldFor = performance.now() - this.downAt;

    if (dy > 90 && Math.abs(dx) < 60) {
      this.close(); // swipe down
    } else if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) this.next();
      else this.prev();
    } else if (heldFor < 250 && Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      // A tap: the left third goes back, the rest goes forward.
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      if (event.clientX - rect.left < rect.width * 0.32) this.prev();
      else this.next();
    }
  }

  protected onCancel(): void {
    this.holding.set(false);
  }
}

const EMPTY_CARD: StoryCard = { id: 'empty', title: '' };
