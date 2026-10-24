import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { MotionService } from '../../core/services/motion.service';
import { StoryCard, StoryService } from '../../core/services/story.service';
import { IconComponent } from './icon.component';

const AUTO_ADVANCE_MS = 6500;
const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const EMPTY: StoryCard = { id: 'empty', title: '' };

/**
 * The full-screen story viewer. It lives in the app shell, outside every page, so it always covers the whole screen.
 * Tap the right side for the next card and the left side to go back, hold to pause, swipe down (or press Esc) to close.
 * It advances by itself unless the user prefers reduced motion.
 */
@Component({
  selector: 'app-story-viewer',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown)': 'onKey($event)',
    '(document:visibilitychange)': 'onVisibility()',
  },
  template: `
    @if (request(); as r) {
      <div class="backdrop" (click)="close()"></div>

      <section
        #viewer
        class="viewer"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="r.title"
        tabindex="-1"
        [attr.data-tone]="card().tone ?? 'brand'"
      >
        @for (t of [card().tone ?? 'brand']; track t) {
          <div class="glows" aria-hidden="true">
            <span class="glow g1"></span><span class="glow g2"></span>
          </div>
        }

        <header class="top">
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

          <div class="meta">
            <div class="who">
              <span class="avatar"
                ><app-icon name="sparkles" [size]="16"
              /></span>
              <span class="titles"
                ><strong class="truncate">{{ r.title }}</strong
                ><small class="truncate">{{ r.subtitle }}</small></span
              >
            </div>
            <div class="tools">
              @if (auto()) {
                <button
                  type="button"
                  class="tool"
                  (click)="userPaused.set(!userPaused())"
                  [attr.aria-label]="userPaused() ? 'Play' : 'Pause'"
                >
                  <app-icon
                    [name]="userPaused() ? 'play' : 'pause'"
                    [size]="18"
                  />
                </button>
              }
              <button
                type="button"
                class="tool"
                aria-label="Close"
                (click)="close()"
              >
                <app-icon name="x" [size]="20" />
              </button>
            </div>
          </div>
        </header>

        <div
          class="stage"
          (pointerdown)="onDown($event)"
          (pointerup)="onUp($event)"
          (pointercancel)="onCancel()"
        >
          @for (c of [card()]; track c.id) {
            <article class="card">
              @if (c.kicker) {
                <p class="kicker"><i class="dot"></i>{{ c.kicker }}</p>
              }

              @if (c.metric) {
                <div class="hero">
                  <span class="value num">{{ c.metric }}</span>
                  @if (c.metricLabel) {
                    <span class="label">{{ c.metricLabel }}</span>
                  }
                </div>
              }

              <h2>{{ c.title }}</h2>
              @if (c.body) {
                <p class="body">{{ c.body }}</p>
              }

              @if (c.visual; as v) {
                <div class="visual">
                  @if (v.kind === 'rank') {
                    <ul class="rank">
                      @for (it of v.items; track it.label; let i = $index) {
                        <li
                          [class.muted]="it.muted"
                          [style.--i]="i"
                          [style.--w]="it.ratio"
                        >
                          <div class="row">
                            <span class="name">{{ it.label }}</span
                            ><span class="val num">{{ it.text }}</span>
                          </div>
                          <div class="track"><i></i></div>
                        </li>
                      }
                    </ul>
                  } @else if (v.kind === 'week') {
                    <div
                      class="week"
                      role="img"
                      aria-label="Typical spending for each day of the week"
                    >
                      @for (d of v.days; track $index) {
                        <div
                          class="day"
                          [class.accent]="d.accent"
                          [style.--i]="$index"
                          [style.--h]="d.ratio"
                        >
                          <i></i><span>{{ d.label }}</span>
                        </div>
                      }
                    </div>
                  } @else if (v.kind === 'ring') {
                    <div class="ringbox">
                      <svg
                        width="124"
                        height="124"
                        viewBox="0 0 124 124"
                        [style.--circ]="ringLength"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <defs>
                          <linearGradient
                            id="story-ring-grad"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              style="stop-color: var(--accent)"
                            />
                            <stop
                              offset="100%"
                              style="stop-color: var(--accent2)"
                            />
                          </linearGradient>
                        </defs>
                        <circle
                          class="ring-track"
                          cx="62"
                          cy="62"
                          r="52"
                          fill="none"
                          stroke-width="12"
                        />
                        <circle
                          class="ring-bar"
                          cx="62"
                          cy="62"
                          r="52"
                          fill="none"
                          stroke-width="12"
                          stroke-linecap="round"
                          [attr.stroke-dasharray]="ringDash(v.percent)"
                          transform="rotate(-90 62 62)"
                        />
                        <text
                          x="62"
                          y="70"
                          text-anchor="middle"
                          class="ring-center"
                        >
                          {{ v.center }}
                        </text>
                      </svg>
                      <p class="ring-caption">{{ v.caption }}</p>
                    </div>
                  } @else if (v.kind === 'receipt') {
                    <div class="receipt">
                      <div class="r-head">{{ v.title }}</div>
                      @for (l of v.lines; track l.label) {
                        <div class="r-line">
                          <span>{{ l.label }}</span
                          ><span>{{ l.value }}</span>
                        </div>
                      }
                      <div class="r-total">
                        <span>Total</span
                        ><strong class="num">{{ v.total }}</strong>
                      </div>
                    </div>
                  }
                </div>
              }

              @if (c.action; as a) {
                <button type="button" class="cta" (click)="go(a.link)">
                  {{ a.label }} <app-icon name="chevron-right" [size]="18" />
                </button>
              }
            </article>
          }
        </div>

        <footer class="bottom">
          <button
            type="button"
            class="nav"
            aria-label="Previous card"
            (click)="prev()"
            [disabled]="index() === 0"
          >
            <app-icon name="chevron-left" [size]="20" />
          </button>
          @if (index() === 0) {
            <p class="hint">
              Tap the right side for the next card, the left side to go back.
              Hold to pause.
            </p>
          }
          <button
            type="button"
            class="nav"
            aria-label="Next card"
            (click)="next()"
          >
            <app-icon name="chevron-right" [size]="20" />
          </button>
        </footer>
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 2000;
        background: rgba(4, 5, 10, 0.82);
        backdrop-filter: blur(10px);
        animation: fadeIn 0.25s both;
      }

      .viewer {
        --accent: #8b7bff;
        --accent2: #f472b6;
        position: fixed;
        z-index: 2001;
        inset: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        outline: 0;
        color: #f5f6fb;
        background: #0a0b12;
        touch-action: pan-y;
        padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
        animation: viewerIn 0.38s cubic-bezier(0.2, 0.9, 0.3, 1) both;
      }
      .viewer[data-tone='success'] {
        --accent: #34d399;
        --accent2: #22d3ee;
      }
      .viewer[data-tone='warning'] {
        --accent: #fbbf24;
        --accent2: #fb923c;
      }
      .viewer[data-tone='danger'] {
        --accent: #fb7185;
        --accent2: #f472b6;
      }
      .viewer[data-tone='info'] {
        --accent: #60a5fa;
        --accent2: #22d3ee;
      }
      /* Keeps text readable over the glow at the top and bottom. */
      .viewer::after {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(
          180deg,
          rgba(0, 0, 0, 0.3),
          transparent 24%,
          transparent 66%,
          rgba(0, 0, 0, 0.4)
        );
      }

      .glows {
        position: absolute;
        inset: 0;
        pointer-events: none;
        animation: fadeIn 0.8s both;
      }
      .glow {
        position: absolute;
        border-radius: 50%;
        aspect-ratio: 1;
      }
      .g1 {
        width: 120%;
        top: -48%;
        right: -42%;
        background: radial-gradient(
          closest-side,
          color-mix(in srgb, var(--accent) 42%, transparent),
          transparent
        );
      }
      .g2 {
        width: 110%;
        bottom: -52%;
        left: -46%;
        background: radial-gradient(
          closest-side,
          color-mix(in srgb, var(--accent2) 30%, transparent),
          transparent
        );
      }

      .top {
        position: relative;
        z-index: 3;
        padding: 12px 16px 0;
      }
      .bars {
        display: flex;
        gap: 4px;
      }
      .bar {
        flex: 1;
        height: 3px;
        border-radius: 3px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.22);
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
        animation: storyFill var(--dur, 6500ms) linear both;
      }
      .bar i.active.paused {
        animation-play-state: paused;
      }
      .meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-top: 12px;
      }
      .who {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .avatar {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        flex: none;
        border-radius: 50%;
        color: #0a0b12;
        background: conic-gradient(
          from 200deg,
          var(--accent),
          var(--accent2),
          var(--accent)
        );
      }
      .titles {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .titles strong {
        font-size: 0.92rem;
        letter-spacing: -0.01em;
      }
      .titles small {
        color: rgba(255, 255, 255, 0.62);
        font-size: 0.76rem;
      }
      .tools {
        display: flex;
        gap: 8px;
        flex: none;
      }
      .tool {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border: 0;
        border-radius: 50%;
        color: #fff;
        background: rgba(255, 255, 255, 0.1);
        cursor: pointer;
        backdrop-filter: blur(6px);
        transition:
          background 0.2s,
          transform 0.15s;
      }
      .tool:hover {
        background: rgba(255, 255, 255, 0.2);
      }
      .tool:active {
        transform: scale(0.92);
      }

      .stage {
        position: relative;
        z-index: 2;
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 8px 24px;
        cursor: pointer;
        user-select: none;
        -webkit-user-select: none;
        overflow-y: auto;
      }
      .card {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding-block: 8px;
      }
      .card > * {
        animation: fadeUp 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
      }
      .card > :nth-child(2) {
        animation-delay: 0.07s;
      }
      .card > :nth-child(3) {
        animation-delay: 0.14s;
      }
      .card > :nth-child(4) {
        animation-delay: 0.21s;
      }
      .card > :nth-child(5) {
        animation-delay: 0.28s;
      }
      .card > :nth-child(6) {
        animation-delay: 0.35s;
      }

      .kicker {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.74);
      }
      .dot {
        width: 7px;
        height: 7px;
        flex: none;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 0 0 12px var(--accent);
      }
      .hero {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .value {
        font-size: clamp(3.4rem, 17vw, 5.2rem);
        font-weight: 850;
        letter-spacing: -0.045em;
        line-height: 0.95;
        color: #fff;
        overflow-wrap: anywhere;
      }
      @supports (-webkit-background-clip: text) or (background-clip: text) {
        .value {
          background: linear-gradient(
            135deg,
            #fff 30%,
            color-mix(in srgb, var(--accent) 60%, #fff)
          );
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          color: transparent;
        }
      }
      .label {
        font-size: 1.05rem;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.8);
      }
      h2 {
        margin: 0;
        font-size: clamp(1.45rem, 6.4vw, 1.9rem);
        font-weight: 750;
        line-height: 1.18;
        letter-spacing: -0.02em;
        overflow-wrap: anywhere;
      }
      .body {
        margin: 0;
        font-size: 1.05rem;
        line-height: 1.55;
        color: rgba(255, 255, 255, 0.78);
        overflow-wrap: anywhere;
      }

      .visual {
        padding: 16px;
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.12);
        backdrop-filter: blur(8px);
      }
      .rank {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 0.92rem;
        font-weight: 600;
      }
      .name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .val {
        flex: none;
      }
      .track {
        height: 8px;
        margin-top: 7px;
        border-radius: 99px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.12);
      }
      .track i {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--accent), var(--accent2));
        transform: scaleX(var(--w));
        transform-origin: left;
        animation: grow 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        animation-delay: calc(0.35s + var(--i) * 0.12s);
      }
      .muted .track i {
        background: rgba(255, 255, 255, 0.38);
      }
      .muted .row {
        color: rgba(255, 255, 255, 0.72);
      }

      .week {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 8px;
        height: 132px;
      }
      .day {
        flex: 1;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
      }
      .day i {
        width: 100%;
        max-width: 30px;
        height: calc(var(--h) * 96px);
        min-height: 6px;
        border-radius: 8px 8px 4px 4px;
        background: rgba(255, 255, 255, 0.28);
        transform-origin: bottom;
        animation: growY 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        animation-delay: calc(0.3s + var(--i) * 0.07s);
      }
      .day.accent i {
        background: linear-gradient(180deg, var(--accent), var(--accent2));
      }
      .day span {
        font-size: 0.74rem;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.65);
      }
      .day.accent span {
        color: #fff;
      }

      .ringbox {
        display: flex;
        align-items: center;
        gap: 18px;
      }
      .ringbox svg {
        flex: none;
      }
      .ring-track {
        stroke: rgba(255, 255, 255, 0.14);
      }
      .ring-bar {
        stroke: url(#story-ring-grad);
        animation: sweep 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.3s both;
      }
      .ring-center {
        fill: #fff;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.02em;
      }
      .ring-caption {
        margin: 0;
        font-size: 0.95rem;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.8);
      }

      .receipt {
        display: flex;
        flex-direction: column;
        gap: 10px;
        font-variant-numeric: tabular-nums;
      }
      .r-head {
        padding-bottom: 10px;
        border-bottom: 1px dashed rgba(255, 255, 255, 0.28);
        font-weight: 700;
        font-size: 1.02rem;
        overflow-wrap: anywhere;
      }
      .r-line {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 0.9rem;
        color: rgba(255, 255, 255, 0.76);
      }
      .r-total {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding-top: 10px;
        border-top: 1px dashed rgba(255, 255, 255, 0.28);
      }
      .r-total strong {
        font-size: 1.7rem;
        letter-spacing: -0.02em;
      }

      .cta {
        align-self: flex-start;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-height: 48px;
        padding: 0 22px;
        border: 0;
        border-radius: 999px;
        font: inherit;
        font-weight: 700;
        color: #0a0b12;
        background: #fff;
        cursor: pointer;
        transition: transform 0.15s;
      }
      .cta:active {
        transform: scale(0.96);
      }

      .bottom {
        position: relative;
        z-index: 3;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
        min-height: 56px;
        padding: 6px 20px 14px;
      }
      .hint {
        margin: 0;
        text-align: center;
        font-size: 0.78rem;
        line-height: 1.4;
        color: rgba(255, 255, 255, 0.6);
      }
      .nav {
        display: none;
      }

      @keyframes storyFill {
        from {
          transform: scaleX(0);
        }
        to {
          transform: scaleX(1);
        }
      }
      @keyframes grow {
        from {
          transform: scaleX(0);
        }
      }
      @keyframes growY {
        from {
          transform: scaleY(0);
        }
      }
      @keyframes viewerIn {
        from {
          opacity: 0;
          transform: translateY(28px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @keyframes viewerDesktopIn {
        from {
          opacity: 0;
          transform: translate(-50%, -46%) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translate(-50%, -50%);
        }
      }

      @media (min-width: 768px) {
        .viewer {
          inset: auto;
          left: 50%;
          top: 50%;
          width: min(420px, 92vw);
          height: min(88dvh, 800px);
          padding: 0;
          border-radius: 28px;
          transform: translate(-50%, -50%);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 40px 90px -20px rgba(0, 0, 0, 0.7);
          animation: viewerDesktopIn 0.38s cubic-bezier(0.2, 0.9, 0.3, 1) both;
        }
        .nav {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          flex: none;
          border: 0;
          border-radius: 50%;
          color: #fff;
          background: rgba(255, 255, 255, 0.1);
          cursor: pointer;
          transition:
            background 0.2s,
            transform 0.15s;
        }
        .nav:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.2);
        }
        .nav:active:not(:disabled) {
          transform: scale(0.92);
        }
        .nav:disabled {
          opacity: 0.3;
          cursor: default;
        }
      }
      @media (max-height: 640px) {
        .value {
          font-size: clamp(2.8rem, 14vw, 4rem);
        }
        .card {
          gap: 12px;
        }
      }
    `,
  ],
})
export class StoryViewerComponent {
  private readonly service = inject(StoryService);
  private readonly motion = inject(MotionService);
  private readonly router = inject(Router);
  private readonly viewer = viewChild<ElementRef<HTMLElement>>('viewer');

  protected readonly request = this.service.request;
  protected readonly stories = computed(() => this.request()?.cards ?? []);
  protected readonly duration = AUTO_ADVANCE_MS;
  protected readonly ringLength = RING_LENGTH;
  protected readonly index = signal(0);
  protected readonly userPaused = signal(false);

  private readonly holding = signal(false);
  private readonly hidden = signal(false);
  protected readonly auto = computed(() => !this.motion.reduced());
  protected readonly paused = computed(
    () => this.holding() || this.userPaused() || this.hidden(),
  );
  protected readonly card = computed(() => {
    const list = this.stories();
    return list[Math.min(this.index(), Math.max(0, list.length - 1))] ?? EMPTY;
  });

  private previousFocus: HTMLElement | null = null;
  private downAt = 0;
  private downX = 0;
  private downY = 0;
  private ignorePointer = false;

  constructor() {
    effect(() => {
      const open = this.request() !== null;
      untracked(() => {
        if (open) {
          this.previousFocus = document.activeElement as HTMLElement | null;
          this.index.set(0);
          this.userPaused.set(false);
          this.holding.set(false);
        } else if (this.previousFocus) {
          this.previousFocus.focus?.();
          this.previousFocus = null;
        }
        document.documentElement.classList.toggle('scroll-lock', open);
      });
    });

    // Keyboard focus goes into the viewer, so Esc and the arrow keys work straight away.
    effect(() => {
      const element = this.viewer();
      if (element)
        untracked(() =>
          queueMicrotask(() =>
            element.nativeElement.focus({ preventScroll: true }),
          ),
        );
    });
  }

  protected ringDash(percent: number): string {
    const clamped = Math.max(0, Math.min(100, percent));
    return `${(RING_LENGTH * clamped) / 100} ${RING_LENGTH}`;
  }

  protected next(): void {
    if (this.index() >= this.stories().length - 1) this.close();
    else this.index.update((i) => i + 1);
  }

  protected prev(): void {
    this.index.update((i) => Math.max(0, i - 1));
  }

  protected close(): void {
    this.service.close();
  }

  protected go(link: string): void {
    this.close();
    void this.router.navigateByUrl(link);
  }

  protected onBarEnd(i: number): void {
    if (i === this.index() && this.auto()) this.next();
  }

  protected onVisibility(): void {
    this.hidden.set(document.hidden);
  }

  protected onKey(event: KeyboardEvent): void {
    if (!this.request()) return;
    if (event.key === 'ArrowRight') this.next();
    else if (event.key === 'ArrowLeft') this.prev();
    else if (event.key === 'Escape') this.close();
    else if (event.key === ' ' && this.auto()) {
      event.preventDefault();
      this.userPaused.update((p) => !p);
    }
  }

  protected onDown(event: PointerEvent): void {
    this.ignorePointer = !!(event.target as HTMLElement).closest('button');
    if (this.ignorePointer) return;
    this.downAt = performance.now();
    this.downX = event.clientX;
    this.downY = event.clientY;
    this.holding.set(true);
  }

  protected onUp(event: PointerEvent): void {
    if (this.ignorePointer) return;
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
