import { DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { ApiError } from '../errors/api-error';

/**
 * Loading / data / error for one request. A new load cancels the previous one (the HTTP request is aborted,
 * which the API sees as a cancelled request). Previous data stays visible while reloading, so the UI never flashes empty.
 */
export class AsyncState<T> {
  readonly data = signal<T | null>(null);
  readonly loading = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly loaded = signal(false);

  private subscription?: Subscription;

  load(source$: Observable<T> | null): void {
    this.subscription?.unsubscribe();

    if (!source$) {
      this.data.set(null);
      this.loading.set(false);
      this.error.set(null);
      this.loaded.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.subscription = source$.subscribe({
      next: (value) => {
        this.data.set(value);
        this.loaded.set(true);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(ApiError.from(err));
        this.loading.set(false);
      },
    });
  }

  destroy(): void {
    this.subscription?.unsubscribe();
  }
}

/** Create inside an injection context (field initialiser / constructor); cleans itself up. */
export function asyncState<T>(): AsyncState<T> {
  const state = new AsyncState<T>();
  inject(DestroyRef).onDestroy(() => state.destroy());
  return state;
}

/** Re-runs `source` whenever any signal it reads changes. Return null to clear. */
export function autoLoad<T>(state: AsyncState<T>, source: () => Observable<T> | null): void {
  effect(() => {
    const next = source();
    untracked(() => state.load(next));
  });
}
