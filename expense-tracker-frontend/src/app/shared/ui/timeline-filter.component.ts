import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
} from '@angular/core';
import { FirstDateService } from '../../core/services/first-date.service';
import {
  DateRange,
  PRESETS,
  PresetKey,
  canShiftForward,
  parseYmd,
  presetRange,
  rangeLabel,
  shiftRange,
  todayYmd,
  ymd,
} from '../../core/utils/dates';
import { IconComponent } from './icon.component';

/**
 * Timeline filter: previous / next period arrows, the current range label, quick presets and a custom range.
 * Works with a single two-way bound DateRange.
 */
@Component({
  selector: 'app-timeline-filter',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tl">
      <div class="nav">
        <button
          type="button"
          class="arrow"
          aria-label="Previous period"
          [disabled]="range().preset === 'all'"
          (click)="shift(-1)"
        >
          <app-icon name="chevron-left" [size]="18" />
        </button>
        <div class="label" aria-live="polite">
          <app-icon name="calendar" [size]="16" /><span>{{ label() }}</span>
        </div>
        <button
          type="button"
          class="arrow"
          aria-label="Next period"
          [disabled]="!canNext()"
          (click)="shift(1)"
        >
          <app-icon name="chevron-right" [size]="18" />
        </button>
      </div>

      <div class="chips" role="tablist" aria-label="Quick ranges">
        @for (p of presets; track p.key) {
          <button
            type="button"
            role="tab"
            class="chip-btn"
            [class.on]="range().preset === p.key"
            [attr.aria-selected]="range().preset === p.key"
            [attr.title]="p.title"
            (click)="pick(p.key)"
          >
            {{ p.label }}
          </button>
        }
      </div>

      @if (range().preset === 'custom') {
        <div class="custom">
          <label
            >From
            <input
              type="date"
              [value]="range().from"
              [max]="range().to"
              (change)="setFrom($event)"
          /></label>
          <label
            >To
            <input
              type="date"
              [value]="range().to"
              [min]="range().from"
              [max]="today"
              (change)="setTo($event)"
          /></label>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        max-width: 100%;
      }
      .tl {
        display: flex;
        align-items: center;
        gap: 10px 14px;
        flex-wrap: wrap;
      }
      .nav {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px;
        border-radius: 14px;
        background: var(--field);
        border: 1px solid var(--border);
      }
      .arrow {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        transition:
          background 0.2s,
          color 0.2s,
          transform 0.15s;
      }
      .arrow:hover:not(:disabled) {
        background: var(--surface-2);
        color: var(--text);
        transform: scale(1.06);
      }
      .arrow:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      .label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 150px;
        justify-content: center;
        padding: 0 8px;
        font-weight: 650;
        white-space: nowrap;
        animation: fadeIn 0.3s both;
      }
      .label app-icon {
        color: var(--primary-2);
      }
      .chips {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        padding: 2px;
        max-width: 100%;
        min-width: 0;
      }
      .chips::-webkit-scrollbar {
        display: none;
      }
      .chip-btn {
        flex: none;
        height: 34px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: transparent;
        color: var(--muted);
        font: inherit;
        font-size: 0.84rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      .chip-btn:hover {
        color: var(--text);
        border-color: var(--border-strong);
        transform: translateY(-1px);
      }
      .chip-btn.on {
        color: #fff;
        border-color: transparent;
        background: var(--grad);
        box-shadow: 0 8px 20px -8px var(--primary);
      }
      .custom {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        animation: fadeUp 0.3s both;
      }
      .custom label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        color: var(--muted);
        font-size: 0.85rem;
      }
      .custom input {
        height: 36px;
        padding: 0 10px;
        border-radius: 10px;
        border: 1px solid var(--border);
        background: var(--field);
        color: var(--text);
        font: inherit;
        color-scheme: dark light;
      }
      @media (max-width: 639.98px) {
        .nav {
          width: 100%;
          justify-content: space-between;
        }
        .label {
          flex: 1;
        }
      }
    `,
  ],
})
export class TimelineFilterComponent {
  private readonly firstDate = inject(FirstDateService);

  readonly range = model.required<DateRange>();
  readonly presets = PRESETS;
  readonly today = todayYmd();

  protected readonly label = computed(() => rangeLabel(this.range()));
  protected readonly canNext = computed(() => canShiftForward(this.range()));

  protected pick(key: PresetKey): void {
    if (key === 'custom') {
      const current = this.range();
      this.range.set({ preset: 'custom', from: current.from, to: current.to });
    } else {
      this.range.set(presetRange(key, new Date(), this.firstDate.date()));
    }
  }

  protected shift(dir: -1 | 1): void {
    this.range.set(shiftRange(this.range(), dir));
  }

  protected setFrom(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) return;
    const current = this.range();
    const to = value > current.to ? value : current.to;
    this.range.set({ preset: 'custom', from: value, to });
  }

  protected setTo(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) return;
    const current = this.range();
    const from = value < current.from ? value : current.from;
    const to = parseYmd(value) > new Date() ? ymd(new Date()) : value;
    this.range.set({ preset: 'custom', from, to });
  }
}
