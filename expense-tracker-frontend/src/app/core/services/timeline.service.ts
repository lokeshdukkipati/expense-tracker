import { Injectable, signal } from '@angular/core';
import { DateRange, presetRange } from '../utils/dates';

const KEY = 'et.range';

/** The timeline filter shared by dashboard, transactions and analytics, remembered between visits. */
@Injectable({ providedIn: 'root' })
export class TimelineService {
  readonly range = signal<DateRange>(this.read());

  set(range: DateRange): void {
    this.range.set(range);
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
        if (parsed?.from && parsed?.to && /^\d{4}-\d{2}-\d{2}$/.test(parsed.from) && /^\d{4}-\d{2}-\d{2}$/.test(parsed.to)) {
          // Relative presets are recomputed so "30D" always means the last 30 days from today.
          return parsed.preset === 'custom' || parsed.preset === 'month' ? parsed : presetRange(parsed.preset);
        }
      }
    } catch {
      /* fall through to default */
    }
    return presetRange('month');
  }
}
