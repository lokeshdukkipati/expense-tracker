import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export interface RankItem {
  id: string;
  label: string;
  value: number;
  valueText: string;
  color: string;
  sub?: string;
}

/** Horizontal ranking bars (categories, merchants). */
@Component({
  selector: 'app-rank-bars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul>
      @for (it of items(); track it.id; let i = $index) {
        <li [class.click]="clickable()" (click)="clickable() && picked.emit(it)" [style.--i]="i">
          <div class="head">
            <span class="name"><i [style.background]="it.color"></i>{{ it.label }}</span>
            <span class="val">{{ it.valueText }}</span>
          </div>
          <div class="track"><div class="fill" [style.width.%]="pct(it.value)" [style.background]="it.color"></div></div>
          @if (it.sub) { <small>{{ it.sub }}</small> }
        </li>
      }
    </ul>
  `,
  styles: [`
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
    li { animation: fadeUp .45s both; animation-delay: calc(var(--i) * 45ms); }
    li.click { cursor: pointer; border-radius: 10px; transition: background .2s; margin: 0 -8px; padding: 4px 8px; }
    li.click:hover { background: var(--surface-2); }
    .head { display: flex; justify-content: space-between; gap: 12px; font-size: .9rem; margin-bottom: 6px; }
    .name { display: inline-flex; align-items: center; gap: 8px; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name i { width: 9px; height: 9px; border-radius: 50%; flex: none; }
    .val { font-variant-numeric: tabular-nums; font-weight: 650; white-space: nowrap; }
    .track { height: 8px; border-radius: 999px; background: var(--grid); overflow: hidden; }
    .fill { height: 100%; border-radius: inherit; transform-origin: left; animation: growX .9s cubic-bezier(.2, .9, .3, 1) both; animation-delay: calc(var(--i) * 45ms + 120ms); }
    small { color: var(--faint); font-size: .76rem; display: block; margin-top: 4px; }
  `],
})
export class RankBarsComponent {
  readonly items = input.required<readonly RankItem[]>();
  readonly clickable = input(false);
  readonly picked = output<RankItem>();

  private readonly max = computed(() => Math.max(1, ...this.items().map((i) => i.value)));

  protected pct(value: number): number {
    return Math.max(2, (value / this.max()) * 100);
  }
}
