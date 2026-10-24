import {
  DestroyRef,
  Directive,
  ElementRef,
  NgZone,
  inject,
  input,
  numberAttribute,
  signal,
} from '@angular/core';

/**
 * Fades an element up the first time it scrolls into view.
 * Optional delay in milliseconds for staggering: <div appReveal="120">. The look is defined in styles.scss (.rv).
 */
@Directive({
  selector: '[appReveal]',
  host: {
    class: 'rv',
    '[class.rv-in]': 'shown()',
    '[style.--rv-delay]': 'delay()',
  },
})
export class RevealDirective {
  readonly delay = input(0, {
    alias: 'appReveal',
    transform: (value: unknown) => numberAttribute(value, 0),
  });

  protected readonly shown = signal(false);

  constructor() {
    if (typeof IntersectionObserver === 'undefined') {
      this.shown.set(true);
      return;
    }

    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const zone = inject(NgZone);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          zone.run(() => this.shown.set(true));
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );

    zone.runOutsideAngular(() => observer.observe(element));
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }
}
