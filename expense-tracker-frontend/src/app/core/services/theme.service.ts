import { Injectable, effect, signal } from '@angular/core';

export type ThemeMode = 'dark' | 'light' | 'system';

const KEY = 'et.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>(this.read());
  readonly resolved = signal<'dark' | 'light'>('dark');

  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.media.addEventListener('change', () => this.apply());
    effect(() => {
      this.mode();
      this.apply();
    });
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      /* storage unavailable: theme still applies for this session */
    }
  }

  toggle(): void {
    this.set(this.resolved() === 'dark' ? 'light' : 'dark');
  }

  private apply(): void {
    const mode = this.mode();
    const resolved = mode === 'system' ? (this.media.matches ? 'dark' : 'light') : mode;
    this.resolved.set(resolved);
    document.documentElement.setAttribute('data-theme', resolved);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0a0b14' : '#f4f5fb');
  }

  private read(): ThemeMode {
    try {
      const stored = localStorage.getItem(KEY);
      return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
    } catch {
      return 'dark';
    }
  }
}
