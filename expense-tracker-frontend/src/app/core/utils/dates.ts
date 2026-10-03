/** Calendar helpers. All dates are local-calendar "YYYY-MM-DD" strings, matching the time zone sent to the API. */

export type PresetKey = 'today' | '7d' | '30d' | 'month' | '3m' | '6m' | 'ytd' | '12m' | 'all' | 'custom';

export interface DateRange {
  preset: PresetKey;
  from: string;
  to: string;
}

export const TIME_ZONE: string = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

const pad = (n: number): string => String(n).padStart(2, '0');

export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseYmd(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function addMonths(d: Date, n: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
}

export const startOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), 1);
export const endOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth() + 1, 0);

export const diffDays = (from: string, to: string): number =>
  Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 86_400_000);

export const daysInRange = (range: Pick<DateRange, 'from' | 'to'>): number => diffDays(range.from, range.to) + 1;

export const todayYmd = (): string => ymd(new Date());

export const PRESETS: { key: PresetKey; label: string; title: string }[] = [
  { key: 'today', label: 'Today', title: 'Today' },
  { key: '7d', label: '7D', title: 'Last 7 days' },
  { key: '30d', label: '30D', title: 'Last 30 days' },
  { key: 'month', label: 'Month', title: 'Calendar month' },
  { key: '3m', label: '3M', title: 'Last 3 months' },
  { key: '6m', label: '6M', title: 'Last 6 months' },
  { key: 'ytd', label: 'YTD', title: 'Year to date' },
  { key: '12m', label: '1Y', title: 'Last 12 months' },
  { key: 'all', label: 'All', title: 'All time' },
  { key: 'custom', label: 'Custom', title: 'Custom range' },
];

export function presetRange(preset: PresetKey, today: Date = new Date()): DateRange {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const to = ymd(t);
  switch (preset) {
    case 'today':
      return { preset, from: to, to };
    case '7d':
      return { preset, from: ymd(addDays(t, -6)), to };
    case '30d':
      return { preset, from: ymd(addDays(t, -29)), to };
    case 'month':
      return { preset, from: ymd(startOfMonth(t)), to: ymd(endOfMonth(t)) };
    case '3m':
      return { preset, from: ymd(addDays(addMonths(t, -3), 1)), to };
    case '6m':
      return { preset, from: ymd(addDays(addMonths(t, -6), 1)), to };
    case 'ytd':
      return { preset, from: `${t.getFullYear()}-01-01`, to };
    case '12m':
      return { preset, from: ymd(addDays(addMonths(t, -12), 1)), to };
    case 'all':
      return { preset, from: ymd(addDays(t, -3650)), to };
    default:
      return { preset: 'custom', from: ymd(addDays(t, -29)), to };
  }
}

export function canShiftForward(range: DateRange, today: Date = new Date()): boolean {
  if (range.preset === 'all') return false;
  return range.to < ymd(today) || (range.preset === 'month' && range.to < ymd(endOfMonth(today)));
}

export function shiftRange(range: DateRange, dir: -1 | 1): DateRange {
  if (range.preset === 'all') return range;

  if (range.preset === 'month') {
    const first = addMonths(startOfMonth(parseYmd(range.from)), dir);
    return { preset: 'month', from: ymd(first), to: ymd(endOfMonth(first)) };
  }

  const span = daysInRange(range);
  const from = addDays(parseYmd(range.from), dir * span);
  const to = addDays(parseYmd(range.to), dir * span);
  return { preset: 'custom', from: ymd(from), to: ymd(to) };
}

export function rangeLabel(range: DateRange): string {
  const from = parseYmd(range.from);
  const to = parseYmd(range.to);

  if (range.preset === 'all') return 'All time';
  if (range.preset === 'today' || range.from === range.to) {
    return from.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const isFullMonth = from.getDate() === 1 && ymd(endOfMonth(from)) === range.to;
  if (isFullMonth) {
    return from.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  const sameYear = from.getFullYear() === to.getFullYear();
  const start = from.toLocaleDateString(undefined, sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
  const end = to.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${start} – ${end}`;
}

/** Chart granularity that keeps a series readable for the length of the range. */
export function autoGranularity(range: Pick<DateRange, 'from' | 'to'>): 'Day' | 'Week' | 'Month' | 'Quarter' {
  const days = daysInRange(range);
  if (days <= 45) return 'Day';
  if (days <= 200) return 'Week';
  if (days <= 1100) return 'Month';
  return 'Quarter';
}

/** The same-length window immediately before `range`. */
export function previousRange(range: DateRange): DateRange {
  const span = daysInRange(range);
  const to = addDays(parseYmd(range.from), -1);
  const from = addDays(to, -(span - 1));
  return { preset: 'custom', from: ymd(from), to: ymd(to) };
}

/** Value for <input type="datetime-local"> in the user's local time. */
export function toLocalInput(date: Date): string {
  return `${ymd(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
