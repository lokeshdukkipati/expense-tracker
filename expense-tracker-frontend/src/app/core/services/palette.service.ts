import { Injectable, signal } from '@angular/core';

/** Opens and closes the command palette (Ctrl/Cmd + K). */
@Injectable({ providedIn: 'root' })
export class PaletteService {
  readonly isOpen = signal(false);

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  toggle(): void {
    this.isOpen.update((v) => !v);
  }
}
