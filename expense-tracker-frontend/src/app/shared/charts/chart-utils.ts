import { DestroyRef, ElementRef, Signal, afterNextRender, inject, signal } from '@angular/core';

export interface ChartSeries {
  name: string;
  color: string;
  values: (number | null)[];
  /** Dashed, un-animated line (forecasts, comparisons). */
  dashed?: boolean;
  /** Fill under the line. Defaults to true. */
  area?: boolean;
}

let nextId = 0;
export const uniqueId = (prefix: string): string => `${prefix}${++nextId}`;

export const prefersReducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Tracks the host element's width (call from an injection context). */
export function useWidth(fallback = 480): Signal<number> {
  const width = signal(fallback);
  const host = inject<ElementRef<HTMLElement>>(ElementRef);
  const destroyRef = inject(DestroyRef);

  afterNextRender(() => {
    const element = host.nativeElement;
    width.set(Math.max(120, Math.floor(element.getBoundingClientRect().width)) || fallback);

    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0].contentRect.width);
      if (next > 0) width.set(next);
    });
    observer.observe(element);
    destroyRef.onDestroy(() => observer.disconnect());
  });

  return width;
}

function niceNumber(range: number, round: boolean): number {
  const exponent = Math.floor(Math.log10(range));
  const fraction = range / Math.pow(10, exponent);
  let nice: number;
  if (round) nice = fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10;
  else nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * Math.pow(10, exponent);
}

export interface Scale {
  min: number;
  max: number;
  ticks: number[];
}

/** Round axis bounds and tick values that always include zero when the data does. */
export function niceScale(min: number, max: number, tickCount = 5): Scale {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) {
    if (max === 0) return { min: 0, max: 1, ticks: [0, 0.5, 1] };
    min = Math.min(0, min);
    max = Math.max(0, max);
  }

  const range = niceNumber(max - min, false);
  const step = niceNumber(range / (tickCount - 1), true);
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min: niceMin, max: niceMax, ticks };
}

export interface Pt {
  x: number;
  y: number | null;
}

const sign = (x: number): number => (x < 0 ? -1 : 1);

function slope3(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): number {
  const h0 = x1 - x0;
  const h1 = x2 - x1;
  const s0 = (y1 - y0) / (h0 || (h1 < 0 ? -0 : 0));
  const s1 = (y2 - y1) / (h1 || (h0 < 0 ? -0 : 0));
  const p = (s0 * h1 + s1 * h0) / (h0 + h1);
  return (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

function slope2(x0: number, y0: number, x1: number, y1: number, t: number): number {
  const h = x1 - x0;
  return h ? ((3 * (y1 - y0)) / h - t) / 2 : t;
}

const f = (n: number): string => (Math.round(n * 100) / 100).toString();

/** Smooth monotone curve (never overshoots the data) through a run of points. */
export function monotonePath(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M${f(points[0].x)},${f(points[0].y)}`;
  if (n === 2) return `M${f(points[0].x)},${f(points[0].y)}L${f(points[1].x)},${f(points[1].y)}`;

  const t: number[] = new Array<number>(n);
  for (let i = 1; i < n - 1; i++) {
    t[i] = slope3(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
  }
  t[0] = slope2(points[0].x, points[0].y, points[1].x, points[1].y, t[1]);
  t[n - 1] = slope2(points[n - 2].x, points[n - 2].y, points[n - 1].x, points[n - 1].y, t[n - 2]);

  let d = `M${f(points[0].x)},${f(points[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = (points[i + 1].x - points[i].x) / 3;
    d += `C${f(points[i].x + dx)},${f(points[i].y + dx * t[i])},${f(points[i + 1].x - dx)},${f(points[i + 1].y - dx * t[i + 1])},${f(points[i + 1].x)},${f(points[i + 1].y)}`;
  }
  return d;
}

/** Splits at null values so gaps are drawn as gaps. */
export function runs(points: Pt[]): { x: number; y: number }[][] {
  const result: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p.y === null) {
      if (current.length) result.push(current);
      current = [];
    } else {
      current.push({ x: p.x, y: p.y });
    }
  }
  if (current.length) result.push(current);
  return result;
}

export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${trim(n / 1e7)}Cr`;
  if (abs >= 1e5) return `${trim(n / 1e5)}L`;
  if (abs >= 1e3) return `${trim(n / 1e3)}k`;
  return trim(n);
}

const trim = (n: number): string => (Math.round(n * 10) / 10).toString();

export const clampNumber = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
