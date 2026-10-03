import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ViewportService {
  readonly isMobile = signal(false);
  readonly isTablet = signal(false);
  readonly isDesktop = signal(true);

  constructor() {
    this.watch('(max-width: 767.98px)', this.isMobile);
    this.watch('(min-width: 768px) and (max-width: 1023.98px)', this.isTablet);
    this.watch('(min-width: 1024px)', this.isDesktop);
  }

  private watch(query: string, target: { set(value: boolean): void }): void {
    const media = window.matchMedia(query);
    target.set(media.matches);
    media.addEventListener('change', (event) => target.set(event.matches));
  }
}
