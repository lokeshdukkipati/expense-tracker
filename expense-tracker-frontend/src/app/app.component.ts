import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConnectivityService } from './core/services/connectivity.service';
import { LoadingService } from './core/services/loading.service';
import { ThemeService } from './core/services/theme.service';
import { ConfirmHostComponent } from './shared/ui/confirm-host.component';
import { IconComponent } from './shared/ui/icon.component';
import { ToastHostComponent } from './shared/ui/toast-host.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent, ConfirmHostComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading.busy()) { <div class="progress" role="progressbar" aria-label="Loading"><i></i></div> }
    @if (!connectivity.online()) {
      <div class="offline" role="alert"><app-icon name="alert-triangle" [size]="16" /> You're offline. Changes can't be saved until you reconnect.</div>
    }
    <router-outlet />
    <app-toast-host />
    <app-confirm-host />
  `,
  styles: [`
    .progress { position: fixed; z-index: 3000; top: 0; left: 0; right: 0; height: 3px; overflow: hidden; pointer-events: none; animation: fadeIn 0s .15s both; }
    .progress i { position: absolute; inset: 0; width: 40%; background: var(--grad); border-radius: 3px; animation: bar 1.1s ease-in-out infinite; box-shadow: 0 0 12px var(--primary); }
    @keyframes bar { 0% { left: -40%; } 100% { left: 100%; } }
    .offline { position: fixed; z-index: 2900; left: 50%; top: 10px; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 999px;
      font-size: .85rem; font-weight: 600; color: var(--warning); background: var(--panel-solid); border: 1px solid color-mix(in srgb, var(--warning) 40%, transparent); box-shadow: var(--shadow-lg); animation: fadeUp .3s both; max-width: calc(100vw - 24px); }
  `],
})
export class AppComponent {
  protected readonly loading = inject(LoadingService);
  protected readonly connectivity = inject(ConnectivityService);

  // Instantiated here so the saved theme is applied as soon as the app starts.
  private readonly theme = inject(ThemeService);
}
