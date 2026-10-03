import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';
import { IconComponent, IconName } from './icon.component';

@Component({
  selector: 'app-toast-host',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" role="status" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast" [class]="t.tone" [style.--dur.ms]="t.duration">
          <span class="ico"><app-icon [name]="icon(t.tone)" [size]="18" /></span>
          <div class="txt">
            @if (t.title) { <strong>{{ t.title }}</strong> }
            <span>{{ t.message }}</span>
          </div>
          <button type="button" aria-label="Dismiss" (click)="toasts.dismiss(t.id)"><app-icon name="x" [size]="14" /></button>
          <i class="bar"></i>
        </div>
      }
    </div>
  `,
  styles: [`
    .stack { position: fixed; z-index: 2000; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 10px; width: min(380px, calc(100vw - 32px)); pointer-events: none; }
    .toast { position: relative; display: flex; align-items: flex-start; gap: 12px; padding: 14px 14px 16px; border-radius: 16px; overflow: hidden; pointer-events: auto;
      background: var(--panel-solid); border: 1px solid var(--border-strong); box-shadow: var(--shadow-lg); animation: toastIn .35s cubic-bezier(.2, .9, .3, 1.15) both; }
    .ico { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; flex: none; }
    .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: .9rem; line-height: 1.35; }
    .txt strong { font-weight: 650; }
    .txt span { color: var(--muted); overflow-wrap: anywhere; }
    button { background: none; border: 0; color: var(--faint); cursor: pointer; padding: 4px; border-radius: 8px; }
    button:hover { color: var(--text); background: var(--surface-2); }
    .bar { position: absolute; left: 0; bottom: 0; height: 3px; width: 100%; transform-origin: left; animation: shrink var(--dur) linear forwards; }
    .success .ico, .success .bar { background: color-mix(in srgb, var(--success) 18%, transparent); color: var(--success); }
    .success .bar { background: var(--success); }
    .error .ico { background: color-mix(in srgb, var(--danger) 18%, transparent); color: var(--danger); }
    .error .bar { background: var(--danger); }
    .warning .ico { background: color-mix(in srgb, var(--warning) 18%, transparent); color: var(--warning); }
    .warning .bar { background: var(--warning); }
    .info .ico { background: color-mix(in srgb, var(--info) 18%, transparent); color: var(--info); }
    .info .bar { background: var(--info); }
    @keyframes toastIn { from { opacity: 0; transform: translateY(16px) scale(.96); } to { opacity: 1; transform: none; } }
    @keyframes shrink { to { transform: scaleX(0); } }
    @media (max-width: 767.98px) { .stack { right: 50%; transform: translateX(50%); bottom: auto; top: calc(12px + env(safe-area-inset-top)); } }
  `],
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);

  protected icon(tone: string): IconName {
    return tone === 'success' ? 'check' : tone === 'error' ? 'alert-circle' : tone === 'warning' ? 'alert-triangle' : 'info';
  }
}
