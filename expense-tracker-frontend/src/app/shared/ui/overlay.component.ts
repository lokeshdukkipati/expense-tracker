import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Modal dialog (centered) or drawer (right side on desktop, bottom sheet on phones) with enter/exit animation,
 * Escape and backdrop to close, and page scroll locked while open.
 */
@Component({
  selector: 'app-overlay',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'onEscape()' },
  template: `
    @if (visible()) {
      <div class="backdrop" [class.closing]="closing()" (click)="requestClose()"></div>
      <section class="panel" [class.drawer]="variant() === 'drawer'" [class.dialog]="variant() === 'dialog'" [class.closing]="closing()"
               [style.--w.px]="width()" role="dialog" aria-modal="true" [attr.aria-label]="title()">
        <header>
          <div class="titles">
            <h2>{{ title() }}</h2>
            @if (subtitle()) { <p>{{ subtitle() }}</p> }
          </div>
          <button type="button" class="btn btn-icon btn-ghost" aria-label="Close" (click)="requestClose()"><app-icon name="x" /></button>
        </header>
        <div class="body"><ng-content /></div>
        <footer><ng-content select="[footer]" /></footer>
      </section>
    }
  `,
  styles: [`
    .backdrop { position: fixed; inset: 0; z-index: 900; background: rgba(5, 6, 14, .6); backdrop-filter: blur(6px); animation: fadeIn .2s both; }
    .backdrop.closing { animation: fadeOut .2s both; }
    .panel { position: fixed; z-index: 901; display: flex; flex-direction: column; background: var(--panel-solid); border: 1px solid var(--border-strong);
      box-shadow: var(--shadow-lg); max-height: 100dvh; }
    .dialog { left: 50%; top: 50%; width: min(var(--w, 460px), calc(100vw - 24px)); max-height: min(90dvh, 760px); border-radius: 22px;
      transform: translate(-50%, -50%); animation: dialogIn .26s cubic-bezier(.2, .9, .3, 1.1) both; }
    .dialog.closing { animation: dialogOut .2s ease both; }
    .drawer { top: 0; right: 0; bottom: 0; width: min(var(--w, 520px), 100vw); border-radius: 24px 0 0 24px; animation: drawerIn .32s cubic-bezier(.2, .9, .3, 1) both; }
    .drawer.closing { animation: drawerOut .22s ease both; }
    header { display: flex; align-items: flex-start; gap: 12px; padding: 20px 20px 12px; }
    .titles { flex: 1; min-width: 0; }
    h2 { margin: 0; font-size: 1.15rem; font-weight: 700; letter-spacing: -.01em; }
    p { margin: 4px 0 0; color: var(--muted); font-size: .9rem; }
    .body { flex: 1; overflow-y: auto; padding: 8px 20px 20px; overscroll-behavior: contain; }
    footer { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; padding: 14px 20px calc(14px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); }
    footer:empty { display: none; }
    @media (max-width: 767.98px) {
      .drawer { top: auto; left: 0; right: 0; bottom: 0; width: 100%; max-height: 92dvh; border-radius: 26px 26px 0 0; animation: sheetIn .34s cubic-bezier(.2, .9, .3, 1) both; }
      .drawer.closing { animation: sheetOut .22s ease both; }
      .drawer header::before { content: ''; position: absolute; top: 8px; left: 50%; width: 42px; height: 4px; border-radius: 4px; background: var(--border-strong); transform: translateX(-50%); }
      .drawer header { position: relative; padding-top: 24px; }
    }
    @keyframes dialogIn { from { opacity: 0; transform: translate(-50%, -46%) scale(.94); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
    @keyframes dialogOut { to { opacity: 0; transform: translate(-50%, -48%) scale(.96); } }
    @keyframes drawerIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @keyframes drawerOut { to { transform: translateX(100%); } }
    @keyframes sheetIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
    @keyframes sheetOut { to { transform: translateY(100%); } }
  `],
})
export class OverlayComponent {
  readonly open = input.required<boolean>();
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly variant = input<'dialog' | 'drawer'>('dialog');
  readonly width = input(460);
  readonly closed = output<void>();

  protected readonly visible = signal(false);
  protected readonly closing = signal(false);

  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const open = this.open();
      untracked(() => (open ? this.show() : this.hide()));
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      document.documentElement.classList.remove('scroll-lock');
    });
  }

  protected onEscape(): void {
    if (this.visible() && !this.closing()) this.requestClose();
  }

  protected requestClose(): void {
    this.closed.emit();
  }

  private show(): void {
    clearTimeout(this.timer);
    this.closing.set(false);
    this.visible.set(true);
    document.documentElement.classList.add('scroll-lock');
  }

  private hide(): void {
    if (!this.visible()) return;
    this.closing.set(true);
    this.timer = setTimeout(() => {
      this.visible.set(false);
      this.closing.set(false);
      document.documentElement.classList.remove('scroll-lock');
    }, 210);
  }
}
