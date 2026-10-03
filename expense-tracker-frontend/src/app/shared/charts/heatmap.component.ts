import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, computed, input, signal, viewChild } from '@angular/core';
import { addDays, parseYmd, ymd } from '../../core/utils/dates';

export interface HeatDay {
  date: string;
  value: number;
  count: number;
}

/** Calendar heatmap (weeks as columns, Monday first). Tap or hover a day to read its value. */
@Component({
  selector: 'app-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="readout" aria-live="polite">
      @if (picked(); as p) {
        <b>{{ p.label }}</b><span>{{ p.text }}</span>
      } @else {
        <span class="hint">Hover or tap a day</span>
      }
    </div>
    <div class="scroll" #scroll>
      <div class="map" [style.--cols]="weeks().length">
        <div class="months">
          @for (m of monthLabels(); track m.col) { <span [style.grid-column]="m.col + 1">{{ m.label }}</span> }
        </div>
        <div class="days">
          <span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span>
        </div>
        <div class="grid">
          @for (w of weeks(); track w.index) {
            <div class="col">
              @for (c of w.cells; track $index) {
                @if (c) {
                  <button type="button" class="cell" [attr.data-l]="c.level" [style.--d]="w.index" [attr.aria-label]="c.aria"
                          (pointerenter)="pick(c)" (focus)="pick(c)" (click)="pick(c)"></button>
                } @else {
                  <span class="cell off"></span>
                }
              }
            </div>
          }
        </div>
      </div>
    </div>
    <div class="legend"><span>Less</span> @for (l of levels; track l) { <i class="cell" [attr.data-l]="l"></i> } <span>More</span></div>
  `,
  styles: [`
    :host { display: block; }
    .readout { min-height: 24px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; font-size: .88rem; margin-bottom: 8px; }
    .readout b { font-weight: 650; }
    .readout span { color: var(--muted); }
    .hint { color: var(--faint) !important; }
    .scroll { overflow-x: auto; padding-bottom: 6px; scrollbar-width: thin; }
    .map { display: grid; grid-template-columns: 30px 1fr; grid-template-rows: auto auto; gap: 6px 6px; width: max-content; min-width: 100%; }
    .months { grid-column: 2; display: grid; grid-template-columns: repeat(var(--cols), 17px); font-size: .7rem; color: var(--faint); height: 14px; }
    .months span { white-space: nowrap; }
    .days { grid-row: 2; display: grid; grid-template-rows: repeat(7, 14px); gap: 3px; font-size: .65rem; color: var(--faint); align-items: center; }
    .grid { grid-row: 2; grid-column: 2; display: grid; grid-auto-flow: column; grid-auto-columns: 14px; gap: 3px; }
    .col { display: grid; grid-template-rows: repeat(7, 14px); gap: 3px; }
    .cell { width: 14px; height: 14px; border-radius: 4px; border: 0; padding: 0; display: block; background: var(--heat-0); }
    button.cell { cursor: pointer; animation: pop .4s both; animation-delay: calc(var(--d) * 9ms); transition: transform .15s, box-shadow .15s; }
    button.cell:hover, button.cell:focus-visible { transform: scale(1.35); outline: none; box-shadow: 0 0 0 2px var(--panel-solid), 0 0 0 3px var(--primary-2); position: relative; z-index: 2; }
    .cell.off { background: transparent; }
    [data-l='1'] { background: color-mix(in srgb, var(--primary) 28%, var(--heat-0)); }
    [data-l='2'] { background: color-mix(in srgb, var(--primary) 52%, var(--heat-0)); }
    [data-l='3'] { background: color-mix(in srgb, var(--primary) 78%, var(--heat-0)); }
    [data-l='4'] { background: var(--pink); }
    .legend { display: flex; align-items: center; gap: 4px; justify-content: flex-end; font-size: .72rem; color: var(--faint); margin-top: 6px; }
    .legend .cell { width: 12px; height: 12px; border-radius: 3px; }
  `],
})
export class HeatmapComponent implements AfterViewInit {
  readonly data = input.required<readonly HeatDay[]>();
  readonly from = input.required<string>();
  readonly to = input.required<string>();
  readonly format = input<(n: number) => string>((n) => String(n));

  protected readonly levels = [0, 1, 2, 3, 4];
  protected readonly picked = signal<{ label: string; text: string } | null>(null);
  private readonly scroll = viewChild.required<ElementRef<HTMLElement>>('scroll');

  private readonly thresholds = computed(() => {
    const values = this.data().map((d) => d.value).filter((v) => v > 0).sort((a, b) => a - b);
    if (!values.length) return [0, 0, 0];
    const q = (p: number) => values[Math.min(values.length - 1, Math.floor(p * values.length))];
    return [q(0.25), q(0.5), q(0.85)];
  });

  protected readonly weeks = computed(() => {
    const byDate = new Map(this.data().map((d) => [d.date, d]));
    const start = parseYmd(this.from());
    const end = parseYmd(this.to());
    const gridStart = addDays(start, -((start.getDay() + 6) % 7));
    const [t1, t2, t3] = this.thresholds();
    const fmt = this.format();

    const weeks: { index: number; start: Date; cells: ({ level: number; aria: string; label: string; text: string } | null)[] }[] = [];
    for (let cursor = gridStart, index = 0; cursor <= end; cursor = addDays(cursor, 7), index++) {
      const cells = Array.from({ length: 7 }, (_, d) => {
        const date = addDays(cursor, d);
        if (date < start || date > end) return null;
        const key = ymd(date);
        const day = byDate.get(key);
        const value = day?.value ?? 0;
        const level = value <= 0 ? 0 : value <= t1 ? 1 : value <= t2 ? 2 : value <= t3 ? 3 : 4;
        const label = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        const text = value > 0 ? `${fmt(value)} · ${day?.count ?? 0} transaction${(day?.count ?? 0) === 1 ? '' : 's'}` : 'No spending';
        return { level, label, text, aria: `${label}: ${text}` };
      });
      weeks.push({ index, start: cursor, cells });
    }
    return weeks;
  });

  protected readonly monthLabels = computed(() => {
    const labels: { col: number; label: string }[] = [];
    let last = -1;
    for (const w of this.weeks()) {
      const firstDay = w.cells.findIndex((c) => c !== null);
      const date = addDays(w.start, Math.max(0, firstDay));
      if (date.getMonth() !== last && (labels.length === 0 || w.index - labels[labels.length - 1].col >= 3)) {
        labels.push({ col: w.index, label: date.toLocaleDateString(undefined, { month: 'short' }) });
      }
      last = date.getMonth();
    }
    return labels;
  });

  ngAfterViewInit(): void {
    // Start at the most recent weeks.
    const el = this.scroll().nativeElement;
    el.scrollLeft = el.scrollWidth;
  }

  protected pick(cell: { label: string; text: string } | null): void {
    this.picked.set(cell ? { label: cell.label, text: cell.text } : null);
  }
}
