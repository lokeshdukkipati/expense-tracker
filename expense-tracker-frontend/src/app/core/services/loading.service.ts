import { Injectable, computed, signal } from '@angular/core';

/** Counts in-flight HTTP requests; drives the global progress bar. */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly active = signal(0);
  readonly busy = computed(() => this.active() > 0);

  start(): void {
    this.active.update((n) => n + 1);
  }

  stop(): void {
    this.active.update((n) => Math.max(0, n - 1));
  }
}
