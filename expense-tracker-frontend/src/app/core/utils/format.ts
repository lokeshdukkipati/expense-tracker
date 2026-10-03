const moneyFormats = new Map<string, Intl.NumberFormat>();

export interface MoneyOptions {
  compact?: boolean;
  /** Prefix + for positive numbers (useful for deltas). */
  signed?: boolean;
  /** Force an exact number of fraction digits. */
  decimals?: number;
}

function localeFor(currency: string): string | undefined {
  return currency === 'INR' ? 'en-IN' : undefined;
}

export function formatMoney(value: number, currency = 'INR', options: MoneyOptions = {}): string {
  const safe = Number.isFinite(value) ? value : 0;
  const key = `${currency}|${options.compact ? 'c' : 'f'}|${options.decimals ?? 'a'}`;

  let format = moneyFormats.get(key);
  if (!format) {
    try {
      format = new Intl.NumberFormat(localeFor(currency), {
        style: 'currency',
        currency,
        notation: options.compact ? 'compact' : 'standard',
        minimumFractionDigits: options.decimals ?? 0,
        maximumFractionDigits: options.decimals ?? (options.compact ? 1 : 2),
      });
    } catch {
      format = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
    }
    moneyFormats.set(key, format);
  }

  const text = format.format(safe);
  return options.signed && safe > 0 ? `+${text}` : text;
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value: number | null | undefined, digits = 1, signed = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const text = `${value.toFixed(digits)}%`;
  return signed && value > 0 ? `+${text}` : text;
}

export function formatDate(value: string | Date, style: 'short' | 'long' | 'day' | 'month' = 'short'): string {
  const date = typeof value === 'string' ? new Date(value.length === 10 ? `${value}T00:00:00` : value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  switch (style) {
    case 'long':
      return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    case 'day':
      return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    case 'month':
      return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
    default:
      return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
}

export function formatTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(value: string | Date): string {
  return `${formatDate(value)} · ${formatTime(value)}`;
}

/** "Today", "Yesterday" or a weekday + date, for grouping lists. */
export function relativeDay(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(date)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return formatDate(date, 'long');
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export function greeting(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
