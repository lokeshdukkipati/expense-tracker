import { Injectable, signal } from '@angular/core';

/** Opens the quick-add sheet from anywhere (shortcut, command palette, button). */
@Injectable({ providedIn: 'root' })
export class QuickAddService {
  /** Non-null while the sheet is open. */
  readonly request = signal<{ text: string } | null>(null);

  open(text = ''): void {
    this.request.set({ text });
  }

  close(): void {
    this.request.set(null);
  }
}
