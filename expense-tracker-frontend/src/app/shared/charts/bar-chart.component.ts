import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ChartSeries, clampNumber, compactNumber, niceScale, useWidth } from './chart-utils';

/** Grouped or stacked vertical bars (negative values hang below the zero line). */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart" [style.height.px]="height()">
      <svg [attr.width]="width()" [attr.height]="height()" [attr.viewBox]="'0 0 ' + width() + ' ' + height()" role="img" [attr.aria-label]="ariaLabel()"
           (pointerleave)="hover.set(null)">
        @for (t of yTicks(); track t.value) {
          <line class="grid" [attr.x1]="plot().l" [attr.x2]="plot().r" [attr.y1]="t.y" [attr.y2]="t.y" />
          <text class="tick" [attr.x]="plot().l - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.label }}</text>
        }
        <line class="zero" [attr.x1]="plot().l" [attr.x2]="plot().r" [attr.y1]="zeroY()" [attr.y2]="zeroY()" />

        @for (g of groups(); track g.index) {
          <rect class="hit" [attr.x]="g.x" [attr.y]="plot().t" [attr.width]="g.w" [attr.height]="plot().b - plot().t"
                (pointerenter)="hover.set(g.index)" (pointerdown)="hover.set(g.index); barClick.emit(g.index)" />
          @for (b of g.bars; track b.name) {
            <rect class="bar" [class.dim]="hover() !== null && hover() !== g.index" [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h"
                  [attr.rx]="b.rx" [attr.fill]="b.color" [style.--i]="g.index" [style.--origin]="b.negative ? 'top' : 'bottom'" />
          }
        }

        @for (x of xTicks(); track x.index) {
          <text class="tick" [attr.x]="x.x" [attr.y]="height() - 6" text-anchor="middle">{{ x.label }}</text>
        }
      </svg>

      @if (tooltip(); as tip) {
        <div class="tip" [style.left.px]="tip.left">
          <b>{{ tip.label }}</b>
          @for (row of tip.rows; track row.name) {
            <div><i [style.background]="row.color"></i><span>{{ row.name }}</span><em>{{ row.value }}</em></div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .chart { position: relative; width: 100%; touch-action: pan-y; }
    svg { display: block; overflow: visible; }
    .grid { stroke: var(--grid); stroke-width: 1; stroke-dasharray: 3 5; }
    .zero { stroke: var(--border-strong); stroke-width: 1; }
    .tick { fill: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }
    .hit { fill: transparent; cursor: pointer; }
    .bar { transform-box: fill-box; transform-origin: center var(--origin, bottom); animation: growY .7s cubic-bezier(.2, .9, .3, 1) both; animation-delay: calc(var(--i) * 22ms); transition: opacity .2s, filter .2s; pointer-events: none; }
    .bar.dim { opacity: .35; }
    .tip { position: absolute; top: 0; transform: translateX(-50%); pointer-events: none; min-width: 140px; padding: 10px 12px; border-radius: 12px; font-size: .8rem;
      background: var(--panel-solid); border: 1px solid var(--border-strong); box-shadow: var(--shadow-lg); z-index: 5; animation: fadeIn .12s both; }
    .tip b { display: block; margin-bottom: 6px; font-weight: 650; }
    .tip div { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
    .tip i { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    .tip span { flex: 1; color: var(--muted); }
    .tip em { font-style: normal; font-weight: 650; font-variant-numeric: tabular-nums; }
  `],
})
export class BarChartComponent {
  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly ChartSeries[]>();
  readonly height = input(240);
  readonly stacked = input(false);
  readonly format = input<(n: number) => string>((n) => String(n));
  readonly ariaLabel = input('Bar chart');
  readonly barClick = output<number>();

  protected readonly width = useWidth();
  protected readonly hover = signal<number | null>(null);
  protected readonly plot = computed(() => ({ l: 52, r: this.width() - 8, t: 10, b: this.height() - 26 }));

  private readonly scale = computed(() => {
    const n = this.labels().length;
    let min = 0;
    let max = 0;
    for (let i = 0; i < n; i++) {
      let pos = 0;
      let neg = 0;
      for (const s of this.series()) {
        const v = s.values[i] ?? 0;
        if (this.stacked()) {
          if (v >= 0) pos += v;
          else neg += v;
        } else {
          max = Math.max(max, v);
          min = Math.min(min, v);
        }
      }
      if (this.stacked()) {
        max = Math.max(max, pos);
        min = Math.min(min, neg);
      }
    }
    return niceScale(min, max, 5);
  });

  private y(value: number): number {
    const { t, b } = this.plot();
    const { min, max } = this.scale();
    return b - ((value - min) / (max - min || 1)) * (b - t);
  }

  protected readonly zeroY = computed(() => this.y(0));
  protected readonly yTicks = computed(() => this.scale().ticks.map((value) => ({ value, y: this.y(value), label: compactNumber(value) })));

  protected readonly groups = computed(() => {
    const n = this.labels().length;
    const { l, r } = this.plot();
    const groupWidth = (r - l) / Math.max(1, n);
    const series = this.series();
    const stacked = this.stacked();
    const inner = groupWidth * 0.68;
    const barWidth = stacked ? inner : Math.max(2, (inner - (series.length - 1) * 3) / series.length);
    const zero = this.zeroY();

    return Array.from({ length: n }, (_, index) => {
      const x0 = l + index * groupWidth;
      const start = x0 + (groupWidth - (stacked ? inner : series.length * barWidth + (series.length - 1) * 3)) / 2;
      let pos = zero;
      let neg = zero;

      const bars = series.map((s, si) => {
        const value = s.values[index] ?? 0;
        const height = Math.abs(this.y(value) - zero);
        const h = value === 0 ? 0 : Math.max(2, height);
        let y: number;
        if (stacked) {
          if (value >= 0) {
            pos -= h;
            y = pos;
          } else {
            y = neg;
            neg += h;
          }
        } else {
          y = value >= 0 ? zero - h : zero;
        }
        return {
          name: s.name,
          color: s.color,
          x: stacked ? start : start + si * (barWidth + 3),
          y,
          w: barWidth,
          h,
          rx: Math.min(6, barWidth / 2, h / 2),
          negative: value < 0,
        };
      });
      return { index, x: x0, w: groupWidth, bars };
    });
  });

  protected readonly xTicks = computed(() => {
    const labels = this.labels();
    const n = labels.length;
    const groupWidth = (this.plot().r - this.plot().l) / Math.max(1, n);
    const step = Math.max(1, Math.ceil(44 / groupWidth));
    const ticks: { index: number; x: number; label: string }[] = [];
    for (let i = 0; i < n; i += step) ticks.push({ index: i, x: this.plot().l + i * groupWidth + groupWidth / 2, label: labels[i] });
    return ticks;
  });

  protected readonly tooltip = computed(() => {
    const i = this.hover();
    if (i === null) return null;
    const group = this.groups()[i];
    if (!group) return null;
    const rows = this.series().map((s) => ({ name: s.name, color: s.color, value: this.format()(s.values[i] ?? 0) }));
    return { label: this.labels()[i], rows, left: clampNumber(group.x + group.w / 2, 80, this.width() - 80) };
  });
}
