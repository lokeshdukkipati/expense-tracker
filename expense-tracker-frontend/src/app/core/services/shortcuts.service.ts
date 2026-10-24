import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { PaletteService } from './palette.service';
import { QuickAddService } from './quick-add.service';
import { TxFormService } from './tx-form.service';

export interface ShortcutDef {
  group: 'General' | 'Create' | 'Go to';
  keys: string[];
  label: string;
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  { group: 'General', keys: ['Ctrl', 'K'], label: 'Open the command palette' },
  { group: 'General', keys: ['?'], label: 'Show keyboard shortcuts' },
  { group: 'General', keys: ['/'], label: 'Jump to the search box' },
  { group: 'Create', keys: ['N'], label: 'New transaction' },
  { group: 'Create', keys: ['T'], label: 'New transfer' },
  { group: 'Create', keys: ['Q'], label: 'Quick add, typed as a sentence' },
  { group: 'Go to', keys: ['G', 'D'], label: 'Dashboard' },
  { group: 'Go to', keys: ['G', 'T'], label: 'Transactions' },
  { group: 'Go to', keys: ['G', 'A'], label: 'Analytics' },
  { group: 'Go to', keys: ['G', 'B'], label: 'Budgets' },
  { group: 'Go to', keys: ['G', 'C'], label: 'Accounts' },
  { group: 'Go to', keys: ['G', 'I'], label: 'Import' },
  { group: 'Go to', keys: ['G', 'O'], label: 'Goals' },
  { group: 'Go to', keys: ['G', 'W'], label: 'Net worth' },
  { group: 'Go to', keys: ['G', 'R'], label: 'Auto-categorise rules' },
  { group: 'Go to', keys: ['G', 'S'], label: 'Settings' },
];

const GO_TO: Record<string, string> = {
  d: '/dashboard',
  t: '/transactions',
  a: '/analytics',
  b: '/budgets',
  c: '/accounts',
  i: '/import',
  o: '/goals',
  w: '/net-worth',
  r: '/rules',
  s: '/settings',
};
const GO_TIMEOUT_MS = 1500;

/**
 * All keyboard shortcuts in one place. Single keys only fire while you are not typing in a field and no dialog is
 * open, so they never get in the way. "G" followed by a letter jumps to a page.
 */
@Injectable({ providedIn: 'root' })
export class ShortcutsService {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly txForm = inject(TxFormService);
  private readonly quickAdd = inject(QuickAddService);
  private readonly palette = inject(PaletteService);

  /** The shortcuts help dialog. */
  readonly helpOpen = signal(false);

  private waitingForGo = false;
  private goTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    document.addEventListener('keydown', (event) => this.onKey(event));
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.auth.isAuthenticated()) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.palette.toggle();
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing)
      return;
    if (this.isTyping(event.target) || this.dialogOpen()) return;

    if (this.waitingForGo) {
      this.stopWaiting();
      const path = GO_TO[event.key.toLowerCase()];
      if (path) {
        event.preventDefault();
        void this.router.navigateByUrl(path);
      }
      return;
    }

    switch (event.key) {
      case '?':
        event.preventDefault();
        this.helpOpen.update((open) => !open);
        break;
      case '/': {
        const search =
          document.querySelector<HTMLInputElement>('.search input');
        if (search) {
          event.preventDefault();
          search.focus();
        }
        break;
      }
      case 'n':
        event.preventDefault();
        this.txForm.openNew();
        break;
      case 't':
        event.preventDefault();
        this.txForm.openTransfer();
        break;
      case 'q':
        event.preventDefault();
        this.quickAdd.open();
        break;
      case 'g':
        event.preventDefault();
        this.waitingForGo = true;
        this.goTimer = setTimeout(() => this.stopWaiting(), GO_TIMEOUT_MS);
        break;
      default:
        break;
    }
  }

  private stopWaiting(): void {
    this.waitingForGo = false;
    clearTimeout(this.goTimer);
  }

  private isTyping(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return (
      !!element &&
      (element.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName))
    );
  }

  private dialogOpen(): boolean {
    return (
      document.querySelector('[role="dialog"][aria-modal="true"]') !== null
    );
  }
}
