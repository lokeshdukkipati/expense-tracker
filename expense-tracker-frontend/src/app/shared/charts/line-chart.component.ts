import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ChartSeries, Pt, clampNumber, compactNumber, monotonePath, niceScale, runs, uniqueId, useWidth } from './chart-utils';

interface DrawnSeries {
  name: string;
  color: string;
  dashed: boolean;
  segments: string[];
  area: string | null;
}

/** Smooth multi-series line/area chart with a hover crosshair and tooltip. Works with touch (pointer events). */
@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart" [style.height.px]="height()">
      <svg [attr.width]="width()" [attr.height]="height()" [attr.viewBox]="'0 0 ' + width() + ' ' + height()" role="img" [attr.aria-label]="ariaLabel()"
           (pointermove)="onMove($event)" (pointerdown)="onMove($event)" (pointerleave)="hover.set(null)">
        <defs>
          @for (s of drawn(); track s.name; let i = $index) {
            <linearGradient [attr.id]="gid + i" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" [attr.stop-color]="s.color" stop-opacity=".32" />
              <stop offset="1" [attr.stop-color]="s.color" stop-opacity="0" />
            </linearGradient>
          }
        </defs>

        @for (t of yTicks(); track t.value) {
          <line class="grid" [attr.x1]="plot().l" [attr.x2]="plot().r" [attr.y1]="t.y" [attr.y2]="t.y" />
          <text class="tick" [attr.x]="plot().l - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.label }}</text>
        }
        @for (x of xTicks(); track x.index) {
          <text class="tick" [attr.x]="x.x" [attr.y]="height() - 6" [attr.text-anchor]="x.anchor">{{ x.label }}</text>
        }

        @for (s of drawn(); track s.name; let i = $index) {
          @if (s.area) { <path class="area" [attr.d]="s.area" [attr.fill]="'url(#' + gid + i + ')'" /> }
          @for (seg of s.segments; track $index) {
            @if (s.dashed) {
              <path class="line dashed" [attr.d]="seg" [attr.stroke]="s.color" />
            } @else {
              <path class="line draw" pathLength="1" [attr.d]="seg" [attr.stroke]="s.color" />
            }
          }
        }

        @if (hoverX(); as hx) {
          <line class="cross" [attr.x1]="hx" [attr.x2]="hx" [attr.y1]="plot().t" [attr.y2]="plot().b" />
          @for (d of hoverDots(); track d.name) {
            <circle class="dot" [attr.cx]="hx" [attr.cy]="d.y" r="4.5" [attr.fill]="d.color" />
          }
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
    .tick { fill: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }
    .line { fill: none; stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
    .line.dashed { stroke-dasharray: 6 6; opacity: .9; }
    .line.draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 1.2s cubic-bezier(.4, 0, .2, 1) .1s forwards; }
    .area { animation: fadeIn 1s .3s both; }
    .cross { stroke: var(--border-strong); stroke-width: 1; }
    .dot { stroke: var(--panel-solid); stroke-width: 2.5; }
    .tip { position: absolute; top: 4px; transform: translateX(-50%); pointer-events: none; min-width: 140px; padding: 10px 12px; border-radius: 12px; font-size: .8rem;
      background: var(--panel-solid); border: 1px solid var(--border-strong); box-shadow: var(--shadow-lg); z-index: 5; animation: fadeIn .12s both; }
    .tip b { display: block; margin-bottom: 6px; font-weight: 650; }
    .tip div { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
    .tip i { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    .tip span { flex: 1; color: var(--muted); }
    .tip em { font-style: normal; font-weight: 650; font-variant-numeric: tabular-nums; }
  `],
})
export class LineChartComponent {
  readonly labels = input.required<readonly string[]>();
  readonly series = input.required<readonly ChartSeries[]>();
  readonly height = input(260);
  readonly format = input<(n: number) => string>((n) => String(n));
  readonly ariaLabel = input('Line chart');
  readonly pointSelected = output<number>();

  protected readonly gid = uniqueId('lc');
  protected readonly width = useWidth();
  protected readonly hover = signal<number | null>(null);

  protected readonly plot = computed(() => ({ l: 52, r: this.width() - 12, t: 10, b: this.height() - 26 }));

  private readonly scale = computed(() => {
    let min = 0;
    let max = 0;
    for (const s of this.series()) {
      for (const v of s.values) {
        if (v === null) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return niceScale(min, max, 5);
  });

  private readonly xs = computed(() => {
    const n = this.labels().length;
    const { l, r } = this.plot();
    return Array.from({ length: n }, (_, i) => (n === 1 ? (l + r) / 2 : l + (i * (r - l)) / (n - 1)));
  });

  private y(value: number): number {
    const { t, b } = this.plot();
    const { min, max } = this.scale();
    return b - ((value - min) / (max - min || 1)) * (b - t);
  }

  protected readonly yTicks = computed(() =>
    this.scale().ticks.map((value) => ({ value, y: this.y(value), label: compactNumber(value) })));

  protected readonly xTicks = computed(() => {
    const labels = this.labels();
    const xs = this.xs();
    const n = labels.length;
    if (n === 0) return [];
    const maxTicks = Math.max(2, Math.floor((this.plot().r - this.plot().l) / 64));
    const step = Math.max(1, Math.ceil(n / maxTicks));
    const ticks: { index: number; x: number; label: string; anchor: string }[] = [];
    for (let i = 0; i < n; i += step) {
      ticks.push({ index: i, x: xs[i], label: labels[i], anchor: i === 0 ? 'start' : i >= n - step ? 'end' : 'middle' });
    }
    return ticks;
  });

  protected readonly drawn = computed<DrawnSeries[]>(() => {
    const xs = this.xs();
    const base = this.y(Math.max(0, this.scale().min));
    return this.series().map((s) => {
      const points: Pt[] = s.values.map((v, i) => ({ x: xs[i], y: v === null ? null : this.y(v) }));
      const segments = runs(points).map((run) => monotonePath(run));
      const longest = runs(points).sort((a, b) => b.length - a.length)[0];
      const showArea = (s.area ?? true) && !s.dashed && !!longest && longest.length > 1;
      const area = showArea
        ? `${monotonePath(longest)}L${longest[longest.length - 1].x},${base}L${longest[0].x},${base}Z`
        : null;
      return { name: s.name, color: s.color, dashed: !!s.dashed, segments, area };
    });
  });

  protected readonly hoverX = computed(() => {
    const i = this.hover();
    return i === null ? null : (this.xs()[i] ?? null);
  });

  protected readonly hoverDots = computed(() => {
    const i = this.hover();
    if (i === null) return [];
    return this.series()
      .filter((s) => s.values[i] !== null && s.values[i] !== undefined)
      .map((s) => ({ name: s.name, color: s.color, y: this.y(s.values[i] as number) }));
  });

  protected readonly tooltip = computed(() => {
    const i = this.hover();
    const x = this.hoverX();
    if (i === null || x === null) return null;
    const rows = this.series()
      .filter((s) => s.values[i] !== null && s.values[i] !== undefined)
      .map((s) => ({ name: s.name, color: s.color, value: this.format()(s.values[i] as number) }));
    return { label: this.labels()[i], rows, left: clampNumber(x, 80, this.width() - 80) };
  });

  protected onMove(event: PointerEvent): void {
    const n = this.labels().length;
    if (n === 0) return;
    const svg = event.currentTarget as SVGElement;
    const rect = svg.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const xs = this.xs();

    let best = 0;
    let distance = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xs[i] - px);
      if (d < distance) {
        distance = d;
        best = i;
      }
    }

    if (this.hover() !== best) this.hover.set(best);
    if (event.type === 'pointerdown') this.pointSelected.emit(best);
  }
}
