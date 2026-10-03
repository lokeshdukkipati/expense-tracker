import { ChangeDetectionStrategy, Component, computed, input, model, output } from '@angular/core';

export interface DonutItem {
  label: string;
  value: number;
  color: string;
}

/** Donut with animated sweep, hover/tap highlight and a centre read-out. */
@Component({
  selector: 'app-donut-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="donut" [style.width.px]="size()" [style.height.px]="size()">
      <svg [attr.width]="size()" [attr.height]="size()" [attr.viewBox]="'0 0 ' + size() + ' ' + size()" role="img" [attr.aria-label]="ariaLabel()">
        <circle class="track" [attr.cx]="size() / 2" [attr.cy]="size() / 2" [attr.r]="radius()" [attr.stroke-width]="thickness()" />
        <g [attr.transform]="'rotate(-90 ' + size() / 2 + ' ' + size() / 2 + ')'">
          @for (a of arcs(); track a.index) {
            <circle class="seg" [class.dim]="active() !== null && active() !== a.index" [class.on]="active() === a.index"
                    [attr.cx]="size() / 2" [attr.cy]="size() / 2" [attr.r]="radius()" [attr.stroke]="a.color"
                    [attr.stroke-width]="active() === a.index ? thickness() + 6 : thickness()"
                    [attr.stroke-dasharray]="a.length + ' ' + (circumference() - a.length)" [attr.stroke-dashoffset]="-a.offset"
                    [style.--len]="a.length" [style.--circ]="circumference()" [style.--i]="a.index"
                    (pointerenter)="active.set(a.index)" (pointerleave)="active.set(null)" (click)="itemClick.emit(a.index)" />
          }
        </g>
      </svg>
      <div class="center">
        @if (activeItem(); as it) {
          <small>{{ it.label }}</small>
          <strong>{{ centerFormat()(it.value) }}</strong>
          <em>{{ it.percent }}%</em>
        } @else {
          <small>{{ centerLabel() }}</small>
          <strong>{{ centerFormat()(total()) }}</strong>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: inline-block; }
    .donut { position: relative; margin: 0 auto; }
    svg { display: block; overflow: visible; }
    .track { fill: none; stroke: var(--grid); opacity: .6; }
    .seg { fill: none; cursor: pointer; transition: stroke-width .25s cubic-bezier(.2, .9, .3, 1), opacity .2s; animation: sweep .9s cubic-bezier(.3, .8, .2, 1) both; animation-delay: calc(var(--i) * 70ms); stroke-linecap: butt; }
    .seg.dim { opacity: .3; }
    .center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 18%; pointer-events: none; gap: 2px; }
    .center small { color: var(--muted); font-size: .75rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .center strong { font-size: 1.25rem; font-weight: 750; letter-spacing: -.02em; font-variant-numeric: tabular-nums; animation: fadeIn .25s both; }
    .center em { font-style: normal; font-size: .78rem; color: var(--primary-2); font-weight: 650; }
  `],
})
export class DonutChartComponent {
  readonly items = input.required<readonly DonutItem[]>();
  readonly size = input(220);
  readonly thickness = input(26);
  readonly centerLabel = input('Total');
  readonly centerFormat = input<(n: number) => string>((n) => String(Math.round(n)));
  readonly ariaLabel = input('Donut chart');
  readonly active = model<number | null>(null);
  readonly itemClick = output<number>();

  protected readonly radius = computed(() => (this.size() - this.thickness()) / 2 - 8);
  protected readonly circumference = computed(() => 2 * Math.PI * this.radius());
  protected readonly total = computed(() => this.items().reduce((sum, i) => sum + Math.max(0, i.value), 0));

  protected readonly arcs = computed(() => {
    const total = this.total();
    const circ = this.circumference();
    const gap = this.items().length > 1 ? 2.5 : 0;
    let offset = 0;
    return this.items().map((item, index) => {
      const share = total > 0 ? Math.max(0, item.value) / total : 0;
      const length = Math.max(0, share * circ - gap);
      const arc = { index, color: item.color, length, offset };
      offset += share * circ;
      return arc;
    });
  });

  protected readonly activeItem = computed(() => {
    const i = this.active();
    const item = i === null ? null : this.items()[i];
    const total = this.total();
    return item ? { label: item.label, value: item.value, percent: total > 0 ? Math.round((item.value / total) * 1000) / 10 : 0 } : null;
  });
}
