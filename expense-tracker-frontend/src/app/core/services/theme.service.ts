import { Injectable, effect, inject, signal } from '@angular/core';
import { AccentName, ThemeMode } from '../models/api.models';
import { MotionService } from './motion.service';
import { PreferencesService } from './preferences.service';

export type { ThemeMode } from '../models/api.models';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly prefs = inject(PreferencesService);
  private readonly motion = inject(MotionService);

  /** The user's choice: dark, light, or follow the device (the default). Saved on the account. */
  readonly mode = this.prefs.theme;
  readonly accent = this.prefs.accent;
  readonly resolved = signal<'dark' | 'light'>('dark');

  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  constructor() {
    this.media.addEventListener('change', () => this.apply());
    effect(() => {
      this.mode();
      this.accent();
      this.prefs.reduceMotion();
      this.apply();
    });
  }

  /** Changes the theme. With an origin (where the user tapped) the new theme spreads out from that point. */
  set(mode: ThemeMode, origin?: { x: number; y: number }): void {
    this.transition(() => this.prefs.setTheme(mode), origin);
  }

  setAccent(accent: AccentName): void {
    this.prefs.setAccent(accent);
  }

  toggle(event?: MouseEvent): void {
    const origin = event ? { x: event.clientX, y: event.clientY } : undefined;
    this.set(this.resolved() === 'dark' ? 'light' : 'dark', origin);
  }

  /** Runs the change inside a View Transition (a circular reveal) when the browser supports it and motion is allowed. */
  private transition(
    change: () => void,
    origin?: { x: number; y: number },
  ): void {
    const doc = document as Document & {
      startViewTransition?: (update: () => void) => {
        finished: Promise<unknown>;
      };
    };
    if (!doc.startViewTransition || this.motion.reduced()) {
      change();
      return;
    }

    const root = document.documentElement;
    root.style.setProperty(
      '--vt-x',
      `${origin?.x ?? window.innerWidth - 36}px`,
    );
    root.style.setProperty('--vt-y', `${origin?.y ?? 36}px`);
    root.classList.add('theme-vt');

    const transition = doc.startViewTransition(() => {
      change();
      this.apply(); // the page must already show the new theme when the transition takes its "after" snapshot
    });
    void transition.finished.finally(() => root.classList.remove('theme-vt'));
  }

  private apply(): void {
    const mode = this.mode();
    const resolved =
      mode === 'system' ? (this.media.matches ? 'dark' : 'light') : mode;
    this.resolved.set(resolved);

    const root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-accent', this.accent());
    if (this.prefs.reduceMotion()) root.setAttribute('data-motion', 'reduced');
    else root.removeAttribute('data-motion');
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'dark' ? '#0a0b14' : '#f4f5fb');
  }
}
