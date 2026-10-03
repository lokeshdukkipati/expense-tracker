import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CountUpComponent } from '../ui/money.component';
import { clampNumber } from './chart-utils';

/** Semicircle gauge, 0-100. Colour moves from red through amber to green (or the reverse when `invert`). */
@Component({
  selector: 'app-gauge',
  imports: [CountUpComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gauge" [style.width.px]="size()">
      <svg [attr.viewBox]="'0 0 200 120'" role="img" [attr.aria-label]="label() + ' ' + clamped() + ' out of 100'">
        <defs>
          <linearGradient id="gaugeGrad" x1="0" x2="1">
            <stop offset="0" stop-color="var(--danger)" /><stop offset=".5" stop-color="var(--warning)" /><stop offset="1" stop-color="var(--success)" />
          </linearGradient>
        </defs>
        <path class="track" d="M20 100 A80 80 0 0 1 180 100" pathLength="100" />
        <path class="fill" d="M20 100 A80 80 0 0 1 180 100" pathLength="100" [attr.stroke]="color()" [style.stroke-dasharray]="clamped() + ' 100'" />
        @for (t of ticks; track t) {
          <line class="tick" [attr.x1]="tickPoint(t, 70).x" [attr.y1]="tickPoint(t, 70).y" [attr.x2]="tickPoint(t, 76).x" [attr.y2]="tickPoint(t, 76).y" />
        }
      </svg>
      <div class="read">
        <strong><app-count-up [value]="clamped()" [format]="whole" /></strong>
        <span>{{ label() }}</span>
        @if (sublabel()) { <small [style.color]="color()">{{ sublabel() }}</small> }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .gauge { position: relative; margin: 0 auto; max-width: 100%; }
    svg { display: block; width: 100%; overflow: visible; }
    .track { fill: none; stroke: var(--grid); stroke-width: 14; stroke-linecap: round; opacity: .7; }
    .fill { fill: none; stroke-width: 14; stroke-linecap: round; transition: stroke-dasharray 1.1s cubic-bezier(.3, .8, .2, 1), stroke .4s; animation: gaugeIn 1.2s cubic-bezier(.3, .8, .2, 1) both; filter: drop-shadow(0 0 8px color-mix(in srgb, currentColor 40%, transparent)); }
    .tick { stroke: var(--panel-solid); stroke-width: 2; }
    .read { position: absolute; left: 0; right: 0; bottom: 2px; display: flex; flex-direction: column; align-items: center; text-align: center; }
    .read strong { font-size: 2.1rem; line-height: 1; font-weight: 800; letter-spacing: -.03em; }
    .read span { font-size: .8rem; color: var(--muted); margin-top: 2px; }
    .read small { font-size: .78rem; font-weight: 650; margin-top: 2px; }
    @keyframes gaugeIn { from { stroke-dasharray: 0 100; } }
  `],
})
export class GaugeComponent {
  readonly value = input.required<number>();
  readonly label = input('');
  readonly sublabel = input('');
  readonly size = input(220);
  readonly invert = input(false);

  protected readonly ticks = [25, 50, 75];
  protected readonly whole = (n: number): string => String(Math.round(n));
  protected readonly clamped = computed(() => Math.round(clampNumber(this.value(), 0, 100)));

  protected readonly color = computed(() => {
    const v = this.invert() ? 100 - this.clamped() : this.clamped();
    return v >= 70 ? 'var(--success)' : v >= 40 ? 'var(--warning)' : 'var(--danger)';
  });

  protected tickPoint(percent: number, radius: number): { x: number; y: number } {
    const angle = Math.PI - (percent / 100) * Math.PI;
    return { x: 100 + radius * Math.cos(angle), y: 100 - radius * Math.sin(angle) };
  }
}
