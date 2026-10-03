import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { monotonePath, uniqueId, useWidth } from './chart-utils';

@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.width]="width()" [attr.height]="height()" [attr.viewBox]="'0 0 ' + width() + ' ' + height()" aria-hidden="true">
      <defs>
        <linearGradient [attr.id]="gid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" [attr.stop-color]="color()" stop-opacity=".35" /><stop offset="1" [attr.stop-color]="color()" stop-opacity="0" />
        </linearGradient>
      </defs>
      @if (paths(); as p) {
        <path class="area" [attr.d]="p.area" [attr.fill]="'url(#' + gid + ')'" />
        <path class="line" pathLength="1" [attr.d]="p.line" [attr.stroke]="color()" />
      }
    </svg>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    svg { display: block; overflow: visible; }
    .line { fill: none; stroke-width: 2; stroke-linecap: round; stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw 1.1s ease .15s forwards; }
    .area { animation: fadeIn .9s .3s both; }
  `],
})
export class SparklineComponent {
  readonly values = input.required<readonly number[]>();
  readonly color = input('var(--primary)');
  readonly height = input(40);

  protected readonly gid = uniqueId('sp');
  protected readonly width = useWidth(120);

  protected readonly paths = computed(() => {
    const v = this.values();
    if (v.length < 2) return null;
    const w = this.width();
    const h = this.height();
    const min = Math.min(...v);
    const max = Math.max(...v);
    const pts = v.map((value, i) => ({ x: (i * w) / (v.length - 1), y: h - 3 - ((value - min) / (max - min || 1)) * (h - 8) }));
    const line = monotonePath(pts);
    return { line, area: `${line}L${w},${h}L0,${h}Z` };
  });
}
