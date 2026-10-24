import {
  DestroyRef,
  Directive,
  ElementRef,
  NgZone,
  inject,
  input,
  output,
} from '@angular/core';

/**
 * Swipe a row left on a phone to reveal action buttons.
 *
 * Markup:
 * <div appSwipeRow #row="appSwipeRow" [actionsWidth]="132">
 *   <div class="swipe-actions"> ...buttons, call row.close() after one is used... </div>
 *   <div class="swipe-content"> ...the normal row... </div>
 * </div>
 *
 * Only touch and pen input swipe (mouse users keep their hover actions). Only one row is open at a time.
 */
@Directive({
  selector: '[appSwipeRow]',
  exportAs: 'appSwipeRow',
  host: { class: 'swipe-row', '[style.--swipe-w.px]': 'actionsWidth()' },
})
export class SwipeRowDirective {
  /** Width in pixels of the revealed actions. */
  readonly actionsWidth = input(120);
  readonly swipeDisabled = input(false);
  readonly opened = output<boolean>();

  private static current: SwipeRowDirective | null = null;

  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);

  private content: HTMLElement | null = null;
  private offset = 0;
  private isOpen = false;
  private startX = 0;
  private startY = 0;
  private startOffset = 0;
  private tracking = false;
  private dragging = false;
  private pointerId = -1;

  private readonly onDown = (event: PointerEvent): void => {
    if (
      event.pointerType === 'mouse' ||
      this.swipeDisabled() ||
      !event.isPrimary
    )
      return;

    this.content = this.host.querySelector<HTMLElement>(
      ':scope > .swipe-content',
    );
    if (!this.content) return;

    this.tracking = true;
    this.dragging = false;
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.startOffset = this.offset;
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (!this.tracking || event.pointerId !== this.pointerId || !this.content)
      return;

    const dx = event.clientX - this.startX;
    const dy = event.clientY - this.startY;

    if (!this.dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        this.tracking = false; // the user is scrolling the page, not swiping the row
        return;
      }
      if (Math.abs(dx) < 8) return;

      this.dragging = true;
      if (SwipeRowDirective.current && SwipeRowDirective.current !== this)
        SwipeRowDirective.current.close();
      this.content.style.transition = 'none';
      try {
        this.host.setPointerCapture(event.pointerId);
      } catch {
        /* the pointer was already released */
      }
    }

    const max = this.actionsWidth();
    let next = Math.min(0, this.startOffset + dx);
    if (next < -max) next = -max - (-max - next) * 0.25; // a little resistance past the end
    this.setOffset(next);
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (!this.tracking || event.pointerId !== this.pointerId) return;
    this.tracking = false;
    if (!this.dragging) return;
    this.dragging = false;

    // The tap that browsers fire after a drag must not activate the row underneath.
    const swallow = (e: Event): void => e.stopPropagation();
    this.host.addEventListener('click', swallow, true);
    setTimeout(
      () => this.host.removeEventListener('click', swallow, true),
      350,
    );

    this.snap(this.offset < -this.actionsWidth() * 0.4);
  };

  private readonly onOutside = (event: Event): void => {
    if (!this.host.contains(event.target as Node)) this.close();
  };

  constructor() {
    this.zone.runOutsideAngular(() => {
      this.host.addEventListener('pointerdown', this.onDown, { passive: true });
      this.host.addEventListener('pointermove', this.onMove, { passive: true });
      this.host.addEventListener('pointerup', this.onUp);
      this.host.addEventListener('pointercancel', this.onUp);
    });

    inject(DestroyRef).onDestroy(() => {
      this.host.removeEventListener('pointerdown', this.onDown);
      this.host.removeEventListener('pointermove', this.onMove);
      this.host.removeEventListener('pointerup', this.onUp);
      this.host.removeEventListener('pointercancel', this.onUp);
      document.removeEventListener('pointerdown', this.onOutside, true);
      if (SwipeRowDirective.current === this) SwipeRowDirective.current = null;
    });
  }

  /** Slides the row back to rest. */
  close(): void {
    if (this.isOpen || this.offset !== 0) this.snap(false);
  }

  private snap(open: boolean): void {
    if (!this.content) return;

    this.content.style.transition =
      'transform .28s cubic-bezier(.2, .8, .2, 1)';
    this.setOffset(open ? -this.actionsWidth() : 0);

    if (open) {
      SwipeRowDirective.current = this;
      document.addEventListener('pointerdown', this.onOutside, true);
    } else {
      if (SwipeRowDirective.current === this) SwipeRowDirective.current = null;
      document.removeEventListener('pointerdown', this.onOutside, true);
    }

    if (open !== this.isOpen) {
      this.isOpen = open;
      this.zone.run(() => this.opened.emit(open));
    }
  }

  private setOffset(px: number): void {
    this.offset = px;
    if (this.content)
      this.content.style.transform = px === 0 ? '' : `translateX(${px}px)`;
  }
}
