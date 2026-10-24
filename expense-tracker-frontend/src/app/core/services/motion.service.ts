import { Injectable, computed, inject, signal } from '@angular/core';
import { PreferencesService } from './preferences.service';

/** One place that answers "should this animate?", from the device setting and the user's own choice in Settings. */
@Injectable({ providedIn: 'root' })
export class MotionService {
  private readonly prefs = inject(PreferencesService);
  private readonly media = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  );
  private readonly system = signal(this.media.matches);

  /** True when animation and effects should be kept to a minimum. */
  readonly reduced = computed(() => this.prefs.reduceMotion() || this.system());

  constructor() {
    this.media.addEventListener('change', (event) =>
      this.system.set(event.matches),
    );
  }

  /** A short tap of haptic feedback on phones that support it. */
  tap(pattern: number | number[] = 10): void {
    if (this.reduced() || !('vibrate' in navigator)) return;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* vibration is optional */
    }
  }
}
