import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { PaletteService } from '../../core/services/palette.service';
import { QuickAddService } from '../../core/services/quick-add.service';
import { ShortcutsService } from '../../core/services/shortcuts.service';
import { ThemeService } from '../../core/services/theme.service';
import { TxFormService } from '../../core/services/tx-form.service';
import { IconComponent, IconName } from './icon.component';

interface PaletteItem {
  id: string;
  label: string;
  hint: string;
  icon: IconName;
  /** Extra words that should also find this item. */
  keywords: string;
  group: 'Suggested' | 'Go to' | 'Actions';
  run: () => void;
}

interface Row {
  item: PaletteItem;
  index: number;
}

const RECENT_KEY = 'et.palette.recent';
const MAX_RECENT = 4;

/** Ctrl/Cmd + K: jump to any page or start any action by typing a few letters. Mount once near the app root. */
@Component({
  selector: 'app-command-palette',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (palette.isOpen()) {
      <div class="scrim" (click)="palette.close()"></div>
      <section
        class="panel"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div class="search">
          <app-icon name="search" [size]="20" />
          <input
            #input
            class="field"
            [value]="query()"
            (input)="onInput($event)"
            (keydown)="onKey($event)"
            placeholder="Search pages and actions…"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            [attr.aria-activedescendant]="'pal-' + active()"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            enterkeyhint="go"
          />
          <button
            type="button"
            class="close"
            aria-label="Close"
            (click)="palette.close()"
          >
            <app-icon name="x" [size]="18" />
          </button>
        </div>

        <ul id="palette-list" class="list" role="listbox">
          @for (g of groups(); track g.label) {
            <li class="group" role="presentation">{{ g.label }}</li>
            @for (row of g.rows; track row.item.id) {
              <li
                [id]="'pal-' + row.index"
                class="row"
                role="option"
                [class.on]="row.index === active()"
                [attr.aria-selected]="row.index === active()"
                (click)="choose(row.item)"
                (pointermove)="active.set(row.index)"
              >
                <span class="ico"
                  ><app-icon [name]="row.item.icon" [size]="18"
                /></span>
                <span class="lbl">{{ row.item.label }}</span>
                @if (row.item.hint) {
                  <kbd>{{ row.item.hint }}</kbd>
                }
              </li>
            }
          } @empty {
            <li class="none">Nothing matches “{{ query() }}”.</li>
          }
        </ul>

        <footer class="foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span
          ><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span>
        </footer>
      </section>
    }
  `,
  styles: [
    `
      .scrim {
        position: fixed;
        inset: 0;
        z-index: 1150;
        background: rgba(5, 6, 14, 0.6);
        backdrop-filter: blur(6px);
        animation: fadeIn 0.18s both;
      }
      .panel {
        position: fixed;
        z-index: 1151;
        left: 50%;
        top: 11vh;
        width: min(620px, calc(100vw - 24px));
        max-height: min(70dvh, 560px);
        display: flex;
        flex-direction: column;
        transform: translateX(-50%);
        border-radius: 22px;
        border: 1px solid var(--border-strong);
        background: var(--panel-solid);
        box-shadow: var(--shadow-lg);
        overflow: hidden;
        animation: paletteIn 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.1) both;
      }
      .search {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--border);
        color: var(--muted);
      }
      .field {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: 0;
        background: none;
        color: var(--text);
        font: inherit;
        font-size: 1.05rem;
      }
      .field::placeholder {
        color: var(--faint);
      }
      .close {
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border: 0;
        border-radius: 12px;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
      }
      .close:hover {
        background: var(--surface-2);
      }
      .list {
        list-style: none;
        margin: 0;
        padding: 6px;
        overflow-y: auto;
        overscroll-behavior: contain;
      }
      .group {
        padding: 10px 12px 4px;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--faint);
      }
      .row {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 48px;
        padding: 0 12px;
        border-radius: 14px;
        cursor: pointer;
      }
      .row.on {
        background: color-mix(in srgb, var(--primary) 16%, transparent);
      }
      .ico {
        display: grid;
        place-items: center;
        width: 32px;
        height: 32px;
        flex: none;
        border-radius: 10px;
        background: var(--surface-2);
        color: var(--primary-2);
      }
      .row.on .ico {
        background: var(--grad);
        color: #fff;
      }
      .lbl {
        flex: 1;
        min-width: 0;
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      kbd {
        padding: 2px 8px;
        border-radius: 8px;
        border: 1px solid var(--border-strong);
        background: var(--surface);
        color: var(--muted);
        font: inherit;
        font-size: 0.72rem;
        font-weight: 700;
      }
      .none {
        padding: 26px 12px;
        text-align: center;
        color: var(--muted);
      }
      .foot {
        display: flex;
        gap: 16px;
        padding: 10px 16px;
        border-top: 1px solid var(--border);
        font-size: 0.76rem;
        color: var(--faint);
      }
      .foot span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      @keyframes paletteIn {
        from {
          opacity: 0;
          transform: translate(-50%, -8px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translate(-50%, 0) scale(1);
        }
      }
      @media (max-width: 767.98px) {
        .panel {
          top: 8px;
          width: calc(100vw - 16px);
          max-height: 82dvh;
        }
        .foot {
          display: none;
        }
        .row {
          min-height: 52px;
        }
        .field {
          font-size: 1rem;
        }
      }
    `,
  ],
})
export class CommandPaletteComponent {
  protected readonly palette = inject(PaletteService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly txForm = inject(TxFormService);
  private readonly quickAdd = inject(QuickAddService);
  private readonly shortcuts = inject(ShortcutsService);

  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');

  protected readonly query = signal('');
  protected readonly active = signal(0);
  private readonly recent = signal<string[]>(this.readRecent());

  private readonly items = computed<PaletteItem[]>(() => {
    const go = (path: string) => () => void this.router.navigateByUrl(path);
    const page = (
      id: string,
      label: string,
      icon: IconName,
      path: string,
      hint = '',
      keywords = '',
    ): PaletteItem => ({
      id,
      label,
      icon,
      hint,
      keywords,
      group: 'Go to',
      run: go(path),
    });
    const action = (
      id: string,
      label: string,
      icon: IconName,
      run: () => void,
      hint = '',
      keywords = '',
    ): PaletteItem => ({
      id,
      label,
      icon,
      hint,
      keywords,
      group: 'Actions',
      run,
    });

    return [
      page(
        'p-dashboard',
        'Dashboard',
        'home',
        '/dashboard',
        'G D',
        'home overview',
      ),
      page(
        'p-transactions',
        'Transactions',
        'list',
        '/transactions',
        'G T',
        'expenses income history',
      ),
      page(
        'p-analytics',
        'Analytics',
        'chart',
        '/analytics',
        'G A',
        'charts reports insights trends',
      ),
      page(
        'p-budgets',
        'Budgets',
        'target',
        '/budgets',
        'G B',
        'limits spending',
      ),
      page(
        'p-accounts',
        'Accounts',
        'wallet',
        '/accounts',
        'G C',
        'bank cash card balance reconcile',
      ),
      page(
        'p-categories',
        'Categories',
        'tag',
        '/categories',
        '',
        'groups labels',
      ),
      page(
        'p-import',
        'Import',
        'upload',
        '/import',
        'G I',
        'upload file statement money manager csv',
      ),
      page(
        'p-goals',
        'Savings goals',
        'rocket',
        '/goals',
        'G O',
        'targets saving',
      ),
      page(
        'p-networth',
        'Net worth',
        'landmark',
        '/net-worth',
        'G W',
        'assets liabilities wealth',
      ),
      page(
        'p-badges',
        'Streaks & badges',
        'award',
        '/achievements',
        '',
        'achievements rewards flame',
      ),
      page(
        'p-rules',
        'Auto-categorise rules',
        'wand',
        '/rules',
        'G R',
        'automatic categories',
      ),
      page(
        'p-duplicates',
        'Review duplicate charges',
        'copy',
        '/duplicates',
        '',
        'double charged twice',
      ),
      page(
        'p-settings',
        'Settings',
        'settings',
        '/settings',
        'G S',
        'profile appearance theme accent password export',
      ),

      action(
        'a-expense',
        'Add an expense',
        'arrow-up-right',
        () => this.txForm.openNew('Expense'),
        'N',
        'new spend',
      ),
      action(
        'a-income',
        'Add income',
        'arrow-down-right',
        () => this.txForm.openNew('Income'),
        '',
        'new salary',
      ),
      action(
        'a-transfer',
        'New transfer between accounts',
        'swap',
        () => this.txForm.openTransfer(),
        'T',
        'move money atm withdrawal',
      ),
      action(
        'a-quick',
        'Quick add (type a sentence)',
        'zap',
        () => this.quickAdd.open(),
        'Q',
        'fast natural language',
      ),
      action(
        'a-story',
        'Play my money story',
        'play',
        () => void this.router.navigateByUrl('/dashboard?story=1'),
        '',
        'recap summary month',
      ),
      action(
        'a-theme',
        'Switch light / dark theme',
        this.theme.resolved() === 'dark' ? 'sun' : 'moon',
        () => this.theme.toggle(),
        '',
        'appearance',
      ),
      action(
        'a-help',
        'Keyboard shortcuts',
        'keyboard',
        () => this.shortcuts.helpOpen.set(true),
        '?',
        'help keys',
      ),
      action(
        'a-signout',
        'Sign out',
        'log-out',
        () => this.auth.logout(),
        '',
        'logout',
      ),
    ];
  });

  private readonly rows = computed<Row[]>(() => {
    const q = this.query().trim().toLowerCase();
    const items = this.items();
    const result: PaletteItem[] = [];

    if (q.length === 0) {
      const byId = new Map(items.map((i) => [i.id, i]));
      for (const id of this.recent()) {
        const item = byId.get(id);
        if (item) result.push({ ...item, group: 'Suggested' });
      }
      const recentIds = new Set(this.recent());
      result.push(...items.filter((i) => !recentIds.has(i.id)));
    } else {
      // Anything with a number in it might be a transaction: offer to add it.
      if (/\d/.test(q)) {
        const text = this.query().trim();
        result.push({
          id: 'a-quick-text',
          label: `Quick add “${text}”`,
          icon: 'zap',
          hint: '',
          keywords: '',
          group: 'Suggested',
          run: () => this.quickAdd.open(text),
        });
      }

      const tokens = q.split(/\s+/);
      const scored = items
        .map((item) => ({ item, score: this.score(item, tokens) }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);
      result.push(...scored.map((s) => s.item));
    }

    return result.map((item, index) => ({ item, index }));
  });

  protected readonly groups = computed(() => {
    const order: PaletteItem['group'][] = ['Suggested', 'Go to', 'Actions'];
    return order
      .map((label) => ({
        label,
        rows: this.rows().filter((r) => r.item.group === label),
      }))
      .filter((g) => g.rows.length > 0);
  });

  constructor() {
    // Fresh start every time the palette opens, with the cursor in the box.
    effect(() => {
      if (this.palette.isOpen()) {
        untracked(() => {
          this.query.set('');
          this.active.set(0);
          queueMicrotask(() => this.input()?.nativeElement.focus());
        });
      }
    });

    // Keep the highlighted row in view while moving with the arrow keys.
    effect(() => {
      const index = this.active();
      if (this.palette.isOpen()) {
        queueMicrotask(() =>
          document
            .getElementById(`pal-${index}`)
            ?.scrollIntoView({ block: 'nearest' }),
        );
      }
    });
  }

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.rows().length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.active.update((i) => (count === 0 ? 0 : (i + 1) % count));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.active.update((i) => (count === 0 ? 0 : (i - 1 + count) % count));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = this.rows()[this.active()];
      if (row) this.choose(row.item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.palette.close();
    }
  }

  protected choose(item: PaletteItem): void {
    this.palette.close();
    if (item.id !== 'a-quick-text') this.remember(item.id);
    item.run();
  }

  /** Every word typed must appear somewhere; matches at the start of the label rank highest. */
  private score(item: PaletteItem, tokens: string[]): number {
    const label = item.label.toLowerCase();
    const haystack = `${label} ${item.keywords}`;
    let total = 0;
    for (const token of tokens) {
      if (label.startsWith(token)) total += 100;
      else if (label.split(/[\s&/-]+/).some((word) => word.startsWith(token)))
        total += 80;
      else if (label.includes(token)) total += 60;
      else if (haystack.includes(token)) total += 40;
      else return 0;
    }
    return total;
  }

  private remember(id: string): void {
    const next = [id, ...this.recent().filter((x) => x !== id)].slice(
      0,
      MAX_RECENT,
    );
    this.recent.set(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }

  private readRecent(): string[] {
    try {
      const parsed: unknown = JSON.parse(
        localStorage.getItem(RECENT_KEY) ?? '[]',
      );
      return Array.isArray(parsed)
        ? parsed
            .filter((x): x is string => typeof x === 'string')
            .slice(0, MAX_RECENT)
        : [];
    } catch {
      return [];
    }
  }
}
