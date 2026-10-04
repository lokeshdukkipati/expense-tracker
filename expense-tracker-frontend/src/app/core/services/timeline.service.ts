import { Injectable, computed, inject, signal } from '@angular/core';
import { DateRange, presetRange } from '../utils/dates';
import { FirstDateService } from './first-date.service';

const KEY = 'et.range';

/** The timeline filter shared by dashboard, transactions and analytics, remembered between visits. */
@Injectable({ providedIn: 'root' })
export class TimelineService {
  private readonly firstDate = inject(FirstDateService);
  private readonly selected = signal<DateRange>(this.read());

  /** The active range. "All" always starts at the user's first transaction. */
  readonly range = computed<DateRange>(() => {
    const current = this.selected();
    return current.preset === 'all'
      ? presetRange('all', new Date(), this.firstDate.date())
      : current;
  });

  /** The "All time" range, for buttons outside the timeline filter. */
  allTime(): DateRange {
    return presetRange('all', new Date(), this.firstDate.date());
  }

  set(range: DateRange): void {
    this.selected.set(range);
    try {
      localStorage.setItem(KEY, JSON.stringify(range));
    } catch {
      /* storage unavailable: range still applies for this session */
    }
  }

  private read(): DateRange {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DateRange;
        if (
          parsed?.from &&
          parsed?.to &&
          /^\d{4}-\d{2}-\d{2}$/.test(parsed.from) &&
          /^\d{4}-\d{2}-\d{2}$/.test(parsed.to)
        ) {
          // Relative presets are recomputed so "30D" always means the last 30 days from today.
          return parsed.preset === 'custom' || parsed.preset === 'month'
            ? parsed
            : presetRange(parsed.preset);
        }
      }
    } catch {
      /* fall through to default */
    }
    return presetRange('month');
  }
}
