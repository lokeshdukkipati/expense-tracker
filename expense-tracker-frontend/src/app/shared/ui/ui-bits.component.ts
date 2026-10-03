import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ApiError } from '../../core/errors/api-error';
import { IconComponent, IconName } from './icon.component';

@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.height]': 'height()', '[style.width]': 'width()', '[style.borderRadius]': 'radius()', class: 'skeleton' },
  template: '',
  styles: [`:host { display: block; max-width: 100%; }`],
})
export class SkeletonComponent {
  readonly height = input('16px');
  readonly width = input('100%');
  readonly radius = input('10px');
}

@Component({
  selector: 'app-spinner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.width.px]': 'size()', '[style.height.px]': 'size()', role: 'progressbar', 'aria-label': 'Loading' },
  template: '',
  styles: [`:host { display: inline-block; border-radius: 50%; border: 2.5px solid color-mix(in srgb, currentColor 22%, transparent);
    border-top-color: currentColor; animation: spin .7s linear infinite; }`],
})
export class SpinnerComponent {
  readonly size = input(18);
}

@Component({
  selector: 'app-empty-state',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <div class="art"><app-icon [name]="icon()" [size]="30" /></div>
      <h3>{{ title() }}</h3>
      @if (message()) { <p>{{ message() }}</p> }
      <div class="actions"><ng-content /></div>
    </div>
  `,
  styles: [`
    .empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 36px 20px; gap: 6px; animation: fadeUp .5s both; }
    .art { display: grid; place-items: center; width: 68px; height: 68px; border-radius: 22px; margin-bottom: 8px; color: var(--primary-2);
      background: color-mix(in srgb, var(--primary) 14%, transparent); animation: float 4s ease-in-out infinite; }
    h3 { margin: 0; font-size: 1.05rem; }
    p { margin: 0; max-width: 360px; color: var(--muted); font-size: .92rem; line-height: 1.5; }
    .actions { margin-top: 14px; display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
    .actions:empty { display: none; }
  `],
})
export class EmptyStateComponent {
  readonly icon = input<IconName>('inbox');
  readonly title = input.required<string>();
  readonly message = input('');
}

@Component({
  selector: 'app-error-state',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="err">
      <app-icon name="alert-circle" [size]="22" />
      <div class="msg"><strong>Couldn't load this</strong><span>{{ error()?.message }}</span></div>
      <button type="button" class="btn btn-secondary btn-sm" (click)="retry.emit()"><app-icon name="refresh" [size]="14" /> Retry</button>
    </div>
  `,
  styles: [`
    .err { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 14px; flex-wrap: wrap; color: var(--danger);
      background: color-mix(in srgb, var(--danger) 10%, transparent); border: 1px solid color-mix(in srgb, var(--danger) 28%, transparent); }
    .msg { flex: 1; min-width: 180px; display: flex; flex-direction: column; font-size: .9rem; }
    .msg span { color: var(--muted); }
  `],
})
export class ErrorStateComponent {
  readonly error = input<ApiError | null>(null);
  readonly retry = output<void>();
}
