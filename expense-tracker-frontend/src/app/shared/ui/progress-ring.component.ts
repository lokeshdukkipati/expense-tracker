import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

export type RingTone = 'brand' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<RingTone, [string, string]> = {
  brand: ['var(--primary)', 'var(--pink)'],
  success: ['var(--success)', 'var(--accent)'],
  warning: ['var(--warning)', 'var(--danger)'],
  danger: ['var(--danger)', 'var(--pink)'],
  info: ['var(--info)', 'var(--accent)'],
};

let nextId = 0;

/** A circular progress indicator with a gradient stroke. Anything placed inside is centred in the ring. */
@Component({
  selector: 'app-progress-ring',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    '[attr.aria-valuenow]': 'percent()',
    '[attr.aria-label]': 'label()',
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
  },
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.viewBox]="'0 0 ' + size() + ' ' + size()"
      [style.--circ]="circumference()"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" [style.stop-color]="colors()[0]" />
          <stop offset="100%" [style.stop-color]="colors()[1]" />
        </linearGradient>
      </defs>
      <circle
        class="track"
        [attr.cx]="half()"
        [attr.cy]="half()"
        [attr.r]="radius()"
        fill="none"
        [attr.stroke-width]="stroke()"
      />
      <circle
        class="bar"
        [attr.cx]="half()"
        [attr.cy]="half()"
        [attr.r]="radius()"
        fill="none"
        [attr.stroke-width]="stroke()"
        [attr.stroke]="'url(#' + gradientId + ')'"
        stroke-linecap="round"
        [attr.stroke-dasharray]="dash()"
        [attr.transform]="'rotate(-90 ' + half() + ' ' + half() + ')'"
      />
    </svg>
    <div class="center"><ng-content /></div>
  `,
  styles: [
    `
      :host {
        position: relative;
        display: inline-grid;
        place-items: center;
        flex: none;
      }
      svg {
        display: block;
      }
      .track {
        stroke: var(--surface-2);
      }
      .bar {
        transition: stroke-dasharray 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
        animation: sweep 1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.1s both;
      }
      .center {
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        text-align: center;
        line-height: 1.15;
        padding: 8%;
      }
    `,
  ],
})
export class ProgressRingComponent {
  /** Progress from 0 to 100. */
  readonly value = input.required<number>();
  readonly size = input(96);
  readonly stroke = input(10);
  readonly tone = input<RingTone>('brand');
  readonly label = input('Progress');

  protected readonly gradientId = `ring-grad-${nextId++}`;

  protected readonly percent = computed(() => {
    const v = this.value();
    return Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) : 0;
  });
  protected readonly colors = computed(() => TONES[this.tone()]);
  protected readonly half = computed(() => this.size() / 2);
  protected readonly radius = computed(() => (this.size() - this.stroke()) / 2);
  protected readonly circumference = computed(
    () => 2 * Math.PI * this.radius(),
  );
  protected readonly dash = computed(() => {
    const circ = this.circumference();
    return `${(circ * this.percent()) / 100} ${circ}`;
  });
}
