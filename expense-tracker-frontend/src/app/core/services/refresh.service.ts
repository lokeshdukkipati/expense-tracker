import { Injectable, signal } from '@angular/core';

/** Bump after any write so pages showing that data reload themselves. */
@Injectable({ providedIn: 'root' })
export class RefreshService {
  readonly version = signal(0);

  bump(): void {
    this.version.update((v) => v + 1);
  }
}
