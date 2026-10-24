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
import { SampleDataApi } from '../../core/api/sample-data.api';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import { TourService, TourStep } from '../../core/services/tour.service';
import { IconComponent } from './icon.component';
import { SpinnerComponent } from './ui-bits.component';

const PAD = 8;
const CARD_WIDTH = 360;
const MOBILE_BREAKPOINT = 768;

/**
 * Spotlight tour: dims the page, lights up the element a step is about, and explains it next to it.
 * On phones the explanation is a sheet at the top or bottom of the screen, whichever leaves the highlight visible.
 * Mount once near the app root.
 */
@Component({
  selector: 'app-tour',
  imports: [IconComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    @if (tour.active()) {
      <div class="layer">
        @if (hole(); as h) {
          <div
            class="hole"
            [style.top.px]="h.top"
            [style.left.px]="h.left"
            [style.width.px]="h.width"
            [style.height.px]="h.height"
          ></div>
        } @else {
          <div class="dim"></div>
        }

        <section
          #card
          class="card"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="tour.step().title"
          tabindex="-1"
          [class.sheet]="mobile()"
          [class.top]="mobile() && sheetOnTop()"
          [class.bottom]="mobile() && !sheetOnTop()"
          [class.center]="!mobile() && !rect()"
          [style]="cardStyle()"
        >
          <div class="dots" aria-hidden="true">
            @for (s of tour.steps; track s.id; let i = $index) {
              <i
                [class.on]="i === tour.index()"
                [class.done]="i < tour.index()"
              ></i>
            }
          </div>
          <h2>{{ tour.step().title }}</h2>
          <p>{{ tour.step().body }}</p>

          @if (tour.step().id === 'welcome' || tour.step().id === 'done') {
            <div class="demo">
              @if (demoLoaded()) {
                <span class="ok"
                  ><app-icon name="check" [size]="16" /> Demo data loaded. Look
                  around, and remove it any time in Settings.</span
                >
              } @else {
                <button
                  type="button"
                  class="btn btn-secondary"
                  (click)="loadDemo()"
                  [disabled]="loading()"
                >
                  @if (loading()) {
                    <app-spinner [size]="16" />
                  } @else {
                    <app-icon name="sparkles" [size]="16" />
                  }
                  Try it with demo data
                </button>
              }
            </div>
          }

          <div class="actions">
            <button type="button" class="btn btn-ghost" (click)="tour.skip()">
              {{ tour.isLast() ? 'Close' : 'Skip' }}
            </button>
            <span class="spacer"></span>
            @if (!tour.isFirst()) {
              <button
                type="button"
                class="btn btn-secondary"
                (click)="tour.back()"
              >
                Back
              </button>
            }
            <button type="button" class="btn btn-primary" (click)="tour.next()">
              {{ tour.isLast() ? 'Get started' : 'Next' }}
            </button>
          </div>
        </section>
      </div>
    }
  `,
  styles: [
    `
      .layer {
        position: fixed;
        inset: 0;
        z-index: 1300;
      }
      .dim {
        position: fixed;
        inset: 0;
        background: rgba(5, 6, 14, 0.74);
        animation: fadeIn 0.25s both;
      }
      .hole {
        position: fixed;
        border-radius: 16px;
        pointer-events: none;
        box-shadow:
          0 0 0 9999px rgba(5, 6, 14, 0.74),
          0 0 0 3px var(--primary);
        transition:
          top 0.35s cubic-bezier(0.2, 0.8, 0.2, 1),
          left 0.35s cubic-bezier(0.2, 0.8, 0.2, 1),
          width 0.35s cubic-bezier(0.2, 0.8, 0.2, 1),
          height 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      .card {
        position: fixed;
        z-index: 1301;
        display: flex;
        flex-direction: column;
        gap: 10px;
        width: ${CARD_WIDTH}px;
        max-width: calc(100vw - 24px);
        padding: 20px;
        border-radius: 22px;
        border: 1px solid var(--border-strong);
        background: var(--panel-solid);
        box-shadow: var(--shadow-lg);
        outline: 0;
        animation: fadeIn 0.25s both;
      }
      .card.center {
        top: 50%;
        left: 50%;
        width: min(440px, calc(100vw - 32px));
        transform: translate(-50%, -50%);
      }
      .card.sheet {
        left: 0;
        right: 0;
        width: auto;
        max-width: none;
        border-radius: 24px 24px 0 0;
        padding: 20px 20px max(env(safe-area-inset-bottom), 18px);
      }
      .card.sheet.bottom {
        bottom: 0;
        top: auto;
      }
      .card.sheet.top {
        top: 0;
        bottom: auto;
        border-radius: 0 0 24px 24px;
        padding: max(env(safe-area-inset-top), 20px) 20px 18px;
      }
      .dots {
        display: flex;
        gap: 6px;
      }
      .dots i {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--surface-2);
        transition:
          width 0.3s,
          background 0.3s;
      }
      .dots i.done {
        background: color-mix(in srgb, var(--primary) 55%, transparent);
      }
      .dots i.on {
        width: 22px;
        border-radius: 999px;
        background: var(--grad);
      }
      h2 {
        margin: 4px 0 0;
        font-size: 1.25rem;
        letter-spacing: -0.02em;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }
      .demo {
        margin-top: 2px;
      }
      .ok {
        display: inline-flex;
        align-items: flex-start;
        gap: 8px;
        color: var(--success);
        font-size: 0.88rem;
        font-weight: 600;
        line-height: 1.4;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 6px;
      }
      .spacer {
        flex: 1;
      }
    `,
  ],
})
export class TourComponent {
  protected readonly tour = inject(TourService);
  private readonly sampleApi = inject(SampleDataApi);
  private readonly refData = inject(ReferenceDataService);
  private readonly refresh = inject(RefreshService);
  private readonly toast = inject(ToastService);

  private readonly card = viewChild<ElementRef<HTMLElement>>('card');

  protected readonly rect = signal<DOMRect | null>(null);
  protected readonly demoLoaded = signal(false);
  protected readonly loading = signal(false);

  private readonly viewport = signal({
    w: window.innerWidth,
    h: window.innerHeight,
  });
  protected readonly mobile = computed(
    () => this.viewport().w < MOBILE_BREAKPOINT,
  );

  /** On a phone the sheet goes to the top when the highlight is in the lower half, so it is never covered. */
  protected readonly sheetOnTop = computed(() => {
    const r = this.rect();
    return !!r && r.top > this.viewport().h / 2;
  });

  protected readonly hole = computed(() => {
    const r = this.rect();
    return r
      ? {
          top: r.top - PAD,
          left: r.left - PAD,
          width: r.width + PAD * 2,
          height: r.height + PAD * 2,
        }
      : null;
  });

  /** Places the card beside the highlight on larger screens; phones use the sheet classes instead. */
  protected readonly cardStyle = computed((): Record<string, string> => {
    const r = this.rect();
    const { w, h } = this.viewport();
    if (w < MOBILE_BREAKPOINT || !r) return {};

    // A target in the left menu: put the card to its right.
    if (r.right < 340) {
      const top = Math.min(Math.max(r.top - 20, 12), h - 280);
      return { left: `${r.right + PAD + 16}px`, top: `${top}px` };
    }

    const left = Math.min(
      Math.max(r.left + r.width / 2 - CARD_WIDTH / 2, 12),
      w - CARD_WIDTH - 12,
    );
    if (r.bottom + PAD + 14 + 250 <= h)
      return { left: `${left}px`, top: `${r.bottom + PAD + 14}px` };
    return { left: `${left}px`, bottom: `${h - r.top + PAD + 14}px` };
  });

  constructor() {
    window.addEventListener('resize', () => {
      this.viewport.set({ w: window.innerWidth, h: window.innerHeight });
      if (this.tour.active()) this.locate(this.tour.step());
    });

    // Find the highlighted element each time the step changes, and keep the page from scrolling behind the tour.
    effect(() => {
      const active = this.tour.active();
      const step = this.tour.step();
      untracked(() => {
        document.documentElement.classList.toggle('scroll-lock', active);
        if (active) {
          this.locate(step);
          queueMicrotask(() => this.card()?.nativeElement.focus());
        } else {
          this.rect.set(null);
        }
      });
    });
  }

  protected onKey(event: KeyboardEvent): void {
    if (!this.tour.active()) return;
    if (event.key === 'Escape') this.tour.skip();
    else if (event.key === 'ArrowRight') this.tour.next();
    else if (event.key === 'ArrowLeft') this.tour.back();
  }

  protected loadDemo(): void {
    if (this.loading()) return;
    this.loading.set(true);
    this.sampleApi.load().subscribe({
      next: () => {
        this.loading.set(false);
        this.demoLoaded.set(true);
        this.toast.success('Demo data loaded.');
        this.refData.load().subscribe();
        this.refresh.bump();
      },
      error: () => this.loading.set(false),
    });
  }

  private locate(step: TourStep): void {
    const element = step.target
      ? document.querySelector<HTMLElement>(step.target)
      : null;
    const box = element?.getBoundingClientRect();

    // Not on screen (for example a desktop-only menu on a phone): show the step on its own.
    if (!element || !box || box.width === 0 || box.height === 0) {
      this.rect.set(null);
      return;
    }

    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.rect.set(element.getBoundingClientRect());

    // Measure again once any smooth scrolling has settled.
    setTimeout(() => {
      if (this.tour.active() && this.tour.step().id === step.id)
        this.rect.set(element.getBoundingClientRect());
    }, 350);
  }
}
