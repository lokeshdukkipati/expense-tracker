import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import {
  SHORTCUTS,
  ShortcutsService,
} from '../../core/services/shortcuts.service';
import { OverlayComponent } from './overlay.component';

/** The "?" help dialog listing every keyboard shortcut. Mount once near the app root. */
@Component({
  selector: 'app-shortcuts-overlay',
  imports: [OverlayComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-overlay
      [open]="shortcuts.helpOpen()"
      title="Keyboard shortcuts"
      subtitle="They work when you are not typing in a box."
      variant="dialog"
      [width]="520"
      (closed)="shortcuts.helpOpen.set(false)"
    >
      <div class="stack">
        @for (g of groups; track g.name) {
          <section>
            <h3>{{ g.name }}</h3>
            <ul>
              @for (s of g.items; track s.label) {
                <li>
                  <span>{{ s.label }}</span>
                  <span class="keys">
                    @for (k of s.keys; track $index) {
                      <kbd>{{ k }}</kbd>
                    }
                  </span>
                </li>
              }
            </ul>
          </section>
        }
      </div>
      <ng-container footer>
        <button
          type="button"
          class="btn btn-primary"
          (click)="shortcuts.helpOpen.set(false)"
        >
          Got it
        </button>
      </ng-container>
    </app-overlay>
  `,
  styles: [
    `
      h3 {
        margin: 0 0 8px;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--faint);
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
      }
      li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 44px;
        border-bottom: 1px solid var(--border);
        font-weight: 500;
      }
      li:last-child {
        border-bottom: 0;
      }
      .keys {
        display: inline-flex;
        gap: 6px;
        flex: none;
      }
      kbd {
        min-width: 28px;
        padding: 3px 9px;
        text-align: center;
        border-radius: 9px;
        border: 1px solid var(--border-strong);
        background: var(--surface-2);
        color: var(--text);
        font: inherit;
        font-size: 0.8rem;
        font-weight: 700;
      }
    `,
  ],
})
export class ShortcutsOverlayComponent {
  protected readonly shortcuts = inject(ShortcutsService);

  protected readonly groups = (['General', 'Create', 'Go to'] as const).map(
    (name) => ({
      name,
      items: SHORTCUTS.filter((s) => s.group === name),
    }),
  );
}
