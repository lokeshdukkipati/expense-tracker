import { Signal, effect, signal } from '@angular/core';

/** Read-only copy of `source` that updates `ms` after the last change (call from an injection context). */
export function debounced<T>(source: Signal<T>, ms = 300): Signal<T> {
  const output = signal(source());
  effect((onCleanup) => {
    const value = source();
    const timer = setTimeout(() => output.set(value), ms);
    onCleanup(() => clearTimeout(timer));
  });
  return output.asReadonly();
}
