import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ConfirmService } from '../../core/services/confirm.service';
import { OverlayComponent } from './overlay.component';

@Component({
  selector: 'app-confirm-host',
  imports: [OverlayComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-overlay [open]="!!state()" [title]="state()?.title ?? ''" variant="dialog" [width]="420" (closed)="confirm.answer(false)">
      <p class="msg">{{ state()?.message }}</p>
      <ng-container footer>
        <button type="button" class="btn btn-ghost" (click)="confirm.answer(false)">{{ state()?.cancelText ?? 'Cancel' }}</button>
        <button type="button" class="btn" [class.btn-danger]="danger()" [class.btn-primary]="!danger()" (click)="confirm.answer(true)">
          {{ state()?.confirmText ?? 'Confirm' }}
        </button>
      </ng-container>
    </app-overlay>
  `,
  styles: [`.msg { margin: 0; color: var(--muted); line-height: 1.55; white-space: pre-line; }`],
})
export class ConfirmHostComponent {
  protected readonly confirm = inject(ConfirmService);
  protected readonly state = this.confirm.state;
  protected readonly danger = computed(() => this.state()?.tone === 'danger');
}
