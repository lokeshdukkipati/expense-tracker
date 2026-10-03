import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="nf">
      <div class="code">404</div>
      <h1>This page wandered off</h1>
      <p>The page you're looking for doesn't exist or was moved.</p>
      <a routerLink="/dashboard" class="btn btn-primary"><app-icon name="home" [size]="18" /> Back to dashboard</a>
    </div>
  `,
  styles: [`
    .nf { min-height: 100dvh; display: grid; place-content: center; justify-items: center; gap: 12px; text-align: center; padding: 24px; animation: fadeUp .6s both; }
    .code { font-size: clamp(5rem, 18vw, 9rem); font-weight: 900; line-height: 1; letter-spacing: -.06em; background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent;
      background-size: 200% 200%; animation: gradientShift 6s ease infinite; }
    h1 { font-size: 1.5rem; }
    p { color: var(--muted); margin-bottom: 8px; }
  `],
})
export class NotFoundComponent {}
