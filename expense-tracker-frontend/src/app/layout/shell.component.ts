import { ChangeDetectionStrategy, Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import { ConfirmService } from '../core/services/confirm.service';
import { ReferenceDataService } from '../core/services/reference-data.service';
import { ThemeService } from '../core/services/theme.service';
import { TxFormService } from '../core/services/tx-form.service';
import { ViewportService } from '../core/services/viewport.service';
import { initials } from '../core/utils/format';
import { TransactionFormComponent } from '../features/transactions/transaction-form.component';
import { IconComponent, IconName } from '../shared/ui/icon.component';
import { OverlayComponent } from '../shared/ui/overlay.component';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
}

const NAV: NavItem[] = [
  { path: '/dashboard', label: 'Dashboard', icon: 'home' },
  { path: '/transactions', label: 'Transactions', icon: 'list' },
  { path: '/analytics', label: 'Analytics', icon: 'chart' },
  { path: '/budgets', label: 'Budgets', icon: 'target' },
  { path: '/accounts', label: 'Accounts', icon: 'wallet' },
  { path: '/categories', label: 'Categories', icon: 'tag' },
  { path: '/import', label: 'Import', icon: 'upload' },
];

const COLLAPSE_KEY = 'et.nav.collapsed';

@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    OverlayComponent,
    TransactionFormComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell" [class.collapsed]="collapsed()">
      <aside class="side" aria-label="Main navigation">
        <a
          class="brand"
          routerLink="/dashboard"
          aria-label="Expense Tracker home"
        >
          <span class="mark"><app-icon name="trending-up" [size]="20" /></span>
          <span class="name">Expense<b>Tracker</b></span>
        </a>

        <nav>
          @for (item of nav; track item.path; let i = $index) {
            <a
              [routerLink]="item.path"
              routerLinkActive="active"
              [style.--i]="i"
              [attr.title]="collapsed() ? item.label : null"
            >
              <app-icon [name]="item.icon" [size]="20" />
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="side-foot">
          <button type="button" class="add" (click)="txForm.openNew()">
            <app-icon name="plus" [size]="20" /><span>Add transaction</span>
          </button>
          <a
            routerLink="/settings"
            routerLinkActive="active"
            class="settings"
            [attr.title]="collapsed() ? 'Settings' : null"
            ><app-icon name="settings" [size]="20" /><span>Settings</span></a
          >
          <button
            type="button"
            class="collapse hide-tablet"
            (click)="toggleCollapsed()"
            [attr.aria-label]="
              collapsed() ? 'Expand sidebar' : 'Collapse sidebar'
            "
          >
            <app-icon
              [name]="collapsed() ? 'chevrons-right' : 'chevrons-left'"
              [size]="18"
            /><span>Collapse</span>
          </button>
        </div>
      </aside>

      <div class="main">
        <header class="top">
          <h2 class="title">{{ pageTitle() }}</h2>
          <span class="spacer"></span>
          <button
            type="button"
            class="btn btn-primary btn-sm hide-mobile"
            (click)="txForm.openNew()"
          >
            <app-icon name="plus" [size]="16" /> New
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-icon"
            (click)="theme.toggle()"
            [attr.aria-label]="
              theme.resolved() === 'dark'
                ? 'Switch to light theme'
                : 'Switch to dark theme'
            "
          >
            <app-icon [name]="theme.resolved() === 'dark' ? 'sun' : 'moon'" />
          </button>

          <div class="user">
            <button
              type="button"
              class="avatar-btn"
              (click)="menu.set(!menu())"
              aria-haspopup="menu"
              [attr.aria-expanded]="menu()"
            >
              <span class="avatar">{{ initials(user()?.fullName ?? '') }}</span>
              <span class="who hide-mobile"
                ><strong>{{ user()?.fullName }}</strong
                ><small>{{ user()?.email }}</small></span
              >
              <app-icon class="hide-mobile" name="chevron-down" [size]="16" />
            </button>
            @if (menu()) {
              <div class="menu" role="menu">
                <div class="who-mobile">
                  <strong>{{ user()?.fullName }}</strong
                  ><small>{{ user()?.email }}</small>
                </div>
                <a
                  routerLink="/settings"
                  role="menuitem"
                  (click)="menu.set(false)"
                  ><app-icon name="settings" [size]="16" /> Settings</a
                >
                <button type="button" role="menuitem" (click)="signOut()">
                  <app-icon name="log-out" [size]="16" /> Sign out
                </button>
              </div>
            }
          </div>
        </header>

        <main id="content"><router-outlet /></main>
      </div>

      <nav class="bottom" aria-label="Primary">
        <a routerLink="/dashboard" routerLinkActive="active"
          ><app-icon name="home" [size]="22" /><span>Home</span></a
        >
        <a routerLink="/transactions" routerLinkActive="active"
          ><app-icon name="list" [size]="22" /><span>Activity</span></a
        >
        <button
          type="button"
          class="fab"
          (click)="txForm.openNew()"
          aria-label="Add transaction"
        >
          <app-icon name="plus" [size]="26" [stroke]="2.6" />
        </button>
        <a routerLink="/analytics" routerLinkActive="active"
          ><app-icon name="chart" [size]="22" /><span>Analytics</span></a
        >
        <button type="button" [class.active]="more()" (click)="more.set(true)">
          <app-icon name="grid" [size]="22" /><span>More</span>
        </button>
      </nav>
    </div>

    <app-overlay
      [open]="more()"
      title="More"
      variant="drawer"
      [width]="420"
      (closed)="more.set(false)"
    >
      <div class="more-grid">
        @for (item of moreItems; track item.path) {
          <a [routerLink]="item.path" (click)="more.set(false)"
            ><span class="icon-tile"><app-icon [name]="item.icon" /></span
            >{{ item.label }}</a
          >
        }
      </div>
      <div class="more-actions">
        <button
          type="button"
          class="btn btn-secondary btn-block"
          (click)="theme.toggle()"
        >
          <app-icon
            [name]="theme.resolved() === 'dark' ? 'sun' : 'moon'"
            [size]="18"
          />
          {{ theme.resolved() === 'dark' ? 'Light' : 'Dark' }} theme
        </button>
        <button
          type="button"
          class="btn btn-outline-danger btn-block"
          (click)="signOut()"
        >
          <app-icon name="log-out" [size]="18" /> Sign out
        </button>
      </div>
    </app-overlay>

    <app-transaction-form />
  `,
  styles: [
    `
      .shell {
        display: grid;
        grid-template-columns: var(--nav-w) minmax(0, 1fr);
        min-height: 100dvh;
        transition: grid-template-columns 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      .shell.collapsed {
        grid-template-columns: var(--nav-w-collapsed) minmax(0, 1fr);
      }

      .side {
        position: sticky;
        top: 0;
        height: 100dvh;
        display: flex;
        flex-direction: column;
        gap: 18px;
        padding: 20px 14px;
        border-right: 1px solid var(--border);
        background: color-mix(in srgb, var(--panel-solid) 55%, transparent);
        backdrop-filter: blur(18px);
        overflow: hidden auto;
        z-index: 20;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 4px 8px 10px;
        color: var(--text);
        text-decoration: none !important;
        white-space: nowrap;
      }
      .mark {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        flex: none;
        border-radius: 13px;
        color: #fff;
        background: var(--grad);
        box-shadow: 0 10px 24px -8px var(--primary);
      }
      .name {
        font-weight: 600;
        font-size: 1.1rem;
        letter-spacing: -0.02em;
      }
      .name b {
        font-weight: 850;
        margin-left: 2px;
        background: var(--grad);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }
      nav {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      nav a,
      .side-foot a,
      .side-foot button {
        display: flex;
        align-items: center;
        gap: 14px;
        height: 46px;
        padding: 0 14px;
        border-radius: 14px;
        color: var(--muted);
        font-weight: 600;
        font-size: 0.94rem;
        text-decoration: none !important;
        white-space: nowrap;
        border: 0;
        background: none;
        cursor: pointer;
        width: 100%;
        text-align: left;
        position: relative;
        transition:
          color 0.2s,
          background 0.2s,
          transform 0.2s;
      }
      nav a {
        animation: fadeUp 0.5s both;
        animation-delay: calc(var(--i) * 40ms + 100ms);
      }
      nav a:hover,
      .side-foot a:hover,
      .side-foot button:hover {
        color: var(--text);
        background: var(--surface-2);
        transform: translateX(3px);
      }
      nav a.active,
      .side-foot a.active {
        color: var(--text);
        background: var(--grad-soft);
      }
      nav a.active::before,
      .side-foot a.active::before {
        content: '';
        position: absolute;
        left: -14px;
        top: 10px;
        bottom: 10px;
        width: 4px;
        border-radius: 0 4px 4px 0;
        background: var(--grad);
      }
      nav a.active app-icon,
      .side-foot a.active app-icon {
        color: var(--primary-2);
      }
      .side-foot {
        margin-top: auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .side-foot .add {
        color: #fff;
        background: var(--grad);
        box-shadow: 0 12px 26px -10px var(--primary);
        margin-bottom: 8px;
        justify-content: flex-start;
      }
      .side-foot .add:hover {
        color: #fff;
        background: var(--grad);
        transform: translateY(-2px);
      }
      .collapsed .side .name,
      .collapsed .side nav span,
      .collapsed .side-foot span {
        display: none;
      }
      .collapsed .side nav a,
      .collapsed .side-foot a,
      .collapsed .side-foot button {
        justify-content: center;
        padding: 0;
      }
      .collapsed .side nav a.active::before,
      .collapsed .side-foot a.active::before {
        left: -14px;
      }
      .collapsed .brand {
        justify-content: center;
        padding: 4px 0 10px;
      }

      .main {
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .top {
        position: sticky;
        top: 0;
        z-index: 15;
        display: flex;
        align-items: center;
        gap: 10px;
        height: var(--topbar-h);
        padding: 0 clamp(14px, 3vw, 36px);
        background: color-mix(in srgb, var(--bg) 72%, transparent);
        backdrop-filter: blur(16px) saturate(150%);
        border-bottom: 1px solid var(--border);
      }
      .title {
        font-size: 1.15rem;
        font-weight: 750;
        animation: fadeIn 0.3s both;
      }
      .user {
        position: relative;
      }
      .avatar-btn {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 4px 8px 4px 4px;
        border-radius: 14px;
        border: 1px solid transparent;
        background: none;
        cursor: pointer;
        color: var(--text);
        transition:
          background 0.2s,
          border-color 0.2s;
      }
      .avatar-btn:hover {
        background: var(--surface-2);
        border-color: var(--border);
      }
      .who {
        display: flex;
        flex-direction: column;
        text-align: left;
        line-height: 1.2;
        max-width: 180px;
      }
      .who strong {
        font-size: 0.86rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .who small {
        color: var(--faint);
        font-size: 0.74rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .menu {
        position: absolute;
        right: 0;
        top: calc(100% + 8px);
        z-index: 50;
        min-width: 220px;
        padding: 8px;
        border-radius: 16px;
        background: var(--panel-solid);
        border: 1px solid var(--border-strong);
        box-shadow: var(--shadow-lg);
        animation: pop 0.16s both;
        transform-origin: top right;
      }
      .menu a,
      .menu button {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        height: 40px;
        padding: 0 12px;
        border: 0;
        border-radius: 10px;
        background: none;
        color: var(--text);
        font-size: 0.9rem;
        cursor: pointer;
        text-decoration: none !important;
      }
      .menu a:hover,
      .menu button:hover {
        background: var(--surface-2);
      }
      .who-mobile {
        display: none;
        flex-direction: column;
        padding: 8px 12px 10px;
        border-bottom: 1px solid var(--border);
        margin-bottom: 6px;
      }
      .who-mobile small {
        color: var(--faint);
      }

      .bottom {
        display: none;
      }
      .more-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
        margin-bottom: 18px;
      }
      .more-grid a {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px;
        border-radius: 16px;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--text);
        font-weight: 600;
        text-decoration: none !important;
        transition:
          transform 0.2s,
          background 0.2s;
      }
      .more-grid a:hover {
        transform: translateY(-2px);
        background: var(--surface-2);
      }
      .more-actions {
        display: grid;
        gap: 10px;
      }

      @media (max-width: 1023.98px) {
        .shell,
        .shell.collapsed {
          grid-template-columns: var(--nav-w-collapsed) minmax(0, 1fr);
        }
        .name,
        nav span,
        .side-foot span {
          display: none;
        }
        nav a,
        .side-foot a,
        .side-foot button {
          justify-content: center;
          padding: 0;
        }
        .brand {
          justify-content: center;
          padding: 4px 0 10px;
        }
      }
      @media (max-width: 767.98px) {
        .shell,
        .shell.collapsed {
          grid-template-columns: minmax(0, 1fr);
        }
        .side {
          display: none;
        }
        .who-mobile {
          display: flex;
        }
        main {
          padding-bottom: calc(
            var(--bottom-h) + 18px + env(safe-area-inset-bottom)
          );
        }
        .bottom {
          position: fixed;
          z-index: 30;
          left: 10px;
          right: 10px;
          bottom: calc(10px + env(safe-area-inset-bottom));
          height: var(--bottom-h);
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          align-items: center;
          padding: 0 6px;
          border-radius: 26px;
          background: color-mix(in srgb, var(--panel-solid) 88%, transparent);
          backdrop-filter: blur(20px) saturate(160%);
          border: 1px solid var(--border-strong);
          box-shadow: var(--shadow-lg);
        }
        .bottom a,
        .bottom button:not(.fab) {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          height: 100%;
          width: auto;
          padding: 0;
          border: 0;
          border-radius: 0;
          background: none;
          color: var(--faint);
          font-size: 0.68rem;
          font-weight: 650;
          text-decoration: none !important;
          cursor: pointer;
          position: static;
          transform: none;
          transition: color 0.2s;
        }
        .bottom a:hover,
        .bottom button:not(.fab):hover {
          background: none;
          color: var(--faint);
          transform: none;
        }
        .bottom a::before,
        .bottom a.active::before {
          content: none;
          display: none;
        }
        .bottom span {
          display: block;
        }
        .bottom a.active,
        .bottom button.active {
          color: var(--primary-2);
          background: none;
        }
        .bottom a.active app-icon {
          transform: translateY(-2px) scale(1.08);
        }
        .fab {
          justify-self: center;
          width: 56px;
          height: 56px;
          margin-top: -26px;
          border: 0;
          border-radius: 20px;
          color: #fff;
          background: var(--grad);
          cursor: pointer;
          box-shadow: 0 14px 30px -8px var(--primary);
          animation: pulseRing 2.6s infinite;
          transition: transform 0.2s;
        }
        .fab:active {
          transform: scale(0.92);
        }
      }
    `,
  ],
})
export class ShellComponent {
  protected readonly nav = NAV;
  protected readonly moreItems: NavItem[] = [
    ...NAV.slice(3),
    { path: '/settings', label: 'Settings', icon: 'settings' },
  ];
  protected readonly initials = initials;

  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);
  protected readonly txForm = inject(TxFormService);
  protected readonly viewport = inject(ViewportService);
  private readonly refData = inject(ReferenceDataService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  protected readonly user = this.auth.user;
  protected readonly collapsed = signal(this.readCollapsed());
  protected readonly menu = signal(false);
  protected readonly more = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly pageTitle = computed(() => {
    const url = this.url();
    const all = [
      ...NAV,
      { path: '/settings', label: 'Settings', icon: 'settings' as IconName },
    ];
    return (
      all.find(
        (n) =>
          url === n.path ||
          url.startsWith(`${n.path}/`) ||
          url.startsWith(`${n.path}?`),
      )?.label ?? 'Expense Tracker'
    );
  });

  constructor() {
    this.refData.load().subscribe();

    // Close menus when navigating.
    effect(() => {
      this.url();
      this.menu.set(false);
      this.more.set(false);
    });
  }

  protected toggleCollapsed(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
    } catch {
      /* preference not persisted */
    }
  }

  protected async signOut(): Promise<void> {
    this.menu.set(false);
    this.more.set(false);
    const ok = await this.confirm.confirm({
      title: 'Sign out?',
      message: 'You will need to sign in again to see your data.',
      confirmText: 'Sign out',
      tone: 'primary',
    });
    if (ok) {
      this.refData.clear();
      this.auth.logout();
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  protected onPointer(event: PointerEvent): void {
    if (this.menu() && !(event.target as HTMLElement).closest('.user'))
      this.menu.set(false);
  }

  @HostListener('document:keydown', ['$event'])
  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing =
      !!target &&
      (target.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.key === 'n') {
      event.preventDefault();
      this.txForm.openNew();
    } else if (event.key === '/') {
      const search = document.querySelector<HTMLInputElement>('.search input');
      if (search) {
        event.preventDefault();
        search.focus();
      }
    }
  }

  private readCollapsed(): boolean {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
