import { Injectable, signal } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
  title?: string;
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);

  private nextId = 1;
  private readonly recent = new Map<string, number>();

  show(tone: ToastTone, message: string, title?: string, duration?: number): void {
    // Identical messages within 3 seconds are shown once (e.g. several parallel requests failing together).
    const key = `${tone}|${message}`;
    const now = Date.now();
    if ((this.recent.get(key) ?? 0) > now - 3_000) return;
    this.recent.set(key, now);

    const toast: Toast = { id: this.nextId++, tone, message, title, duration: duration ?? (tone === 'error' ? 7_000 : 4_500) };
    this.toasts.update((list) => [...list.slice(-3), toast]);
    setTimeout(() => this.dismiss(toast.id), toast.duration);
  }

  success(message: string, title?: string): void {
    this.show('success', message, title);
  }

  error(message: string, title?: string): void {
    this.show('error', message, title);
  }

  info(message: string, title?: string): void {
    this.show('info', message, title);
  }

  warning(message: string, title?: string): void {
    this.show('warning', message, title);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
