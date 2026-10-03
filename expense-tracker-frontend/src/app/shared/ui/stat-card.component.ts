import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatNumber, formatPercent } from '../../core/utils/format';
import { IconComponent, IconName } from './icon.component';
import { CountUpComponent, MoneyComponent } from './money.component';

/** Headline number with an icon, optional change badge versus the previous period, and a hint line. */
@Component({
  selector: 'app-stat-card',
  imports: [IconComponent, MoneyComponent, CountUpComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="card card-pad stat hover">
      <div class="top">
        <span class="icon-tile" [style.--tile]="tone()"><app-icon [name]="icon()" /></span>
        <span class="lbl">{{ label() }}</span>
        @if (delta() !== undefined) { <span class="delta" [class]="deltaClass()">{{ deltaText() }}</span> }
      </div>
      <strong class="big">
        @if (text()) { <span class="txt">{{ text() }}</span> } @else {
        @switch (kind()) {
          @case ('money') { <app-money [value]="value()" [compact]="compact()" /> }
          @case ('percent') { <app-count-up [value]="value()" [format]="pct" /> }
          @default { <app-count-up [value]="value()" [format]="num" /> }
        }
        }
      </strong>
      @if (hint()) { <small>{{ hint() }}</small> }
    </article>
  `,
  styles: [`
    .stat { display: flex; flex-direction: column; gap: 6px; height: 100%; }
    .top { display: flex; align-items: center; gap: 10px; }
    .lbl { flex: 1; color: var(--muted); font-weight: 600; font-size: .88rem; }
    .big { font-size: clamp(1.4rem, 2.2vw, 1.85rem); font-weight: 800; letter-spacing: -.03em; line-height: 1.15; margin-top: 4px; }
    small { color: var(--faint); font-size: .8rem; }
    .txt { font-size: 1.25rem; letter-spacing: -.02em; }
  `],
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly icon = input<IconName>('wallet');
  readonly tone = input('var(--primary)');
  readonly kind = input<'money' | 'percent' | 'number'>('money');
  readonly compact = input(false);
  readonly hint = input('');
  /** Shows this text instead of the number (for facts like a weekday name). */
  readonly text = input('');
  /** Percent change versus the previous period; null renders "new". Leave undefined to hide the badge. */
  readonly delta = input<number | null | undefined>(undefined);
  readonly goodWhenUp = input(true);

  protected readonly pct = (n: number): string => formatPercent(n, 1);
  protected readonly num = (n: number): string => formatNumber(n);

  protected readonly deltaClass = computed(() => {
    const d = this.delta();
    if (d === null || d === undefined || Math.abs(d) < 0.5) return 'flat';
    return (d > 0) === this.goodWhenUp() ? 'up' : 'down';
  });

  protected readonly deltaText = computed(() => {
    const d = this.delta();
    return d === null || d === undefined ? 'new' : formatPercent(d, 0, true);
  });
}
