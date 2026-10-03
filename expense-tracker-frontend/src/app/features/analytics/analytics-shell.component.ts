import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { IconComponent, IconName } from '../../shared/ui/icon.component';
import { SelectComponent } from '../../shared/ui/select.component';
import { TimelineFilterComponent } from '../../shared/ui/timeline-filter.component';
import { AnalyticsFilterService } from './analytics-filter.service';

interface Tab {
  path: string;
  label: string;
  icon: IconName;
  badge?: string;
}

const TABS: Tab[] = [
  { path: 'overview', label: 'Overview', icon: 'grid' },
  { path: 'categories', label: 'Categories', icon: 'chart' },
  { path: 'trends', label: 'Trends', icon: 'trending-up' },
  { path: 'patterns', label: 'Patterns', icon: 'calendar' },
  { path: 'merchants', label: 'Merchants', icon: 'tag' },
  { path: 'recurring', label: 'Recurring', icon: 'repeat' },
  { path: 'insights', label: 'Insights Lab', icon: 'sparkles', badge: 'New' },
];

@Component({
  selector: 'app-analytics-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    SelectComponent,
    TimelineFilterComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Analytics</h1>
          <p>
            Understand where your money goes, and what it says about your
            habits.
          </p>
        </div>
      </div>

      <section class="card card-pad bar">
        <app-timeline-filter
          [range]="filters.range()"
          (rangeChange)="filters.setRange($event)"
        />
        <div class="scope">
          <app-select
            [options]="accountOptions()"
            [value]="filters.accountId()"
            placeholder="All accounts"
            [clearable]="true"
            [block]="false"
            size="sm"
            (valueChange)="setAccount($event)"
            ariaLabel="Account filter"
          />
          <app-select
            [options]="categoryOptions()"
            [value]="filters.categoryId()"
            placeholder="All categories"
            [searchable]="true"
            [clearable]="true"
            [block]="false"
            size="sm"
            (valueChange)="setCategory($event)"
            ariaLabel="Category filter"
          />
          @if (filters.isScoped()) {
            <button
              type="button"
              class="btn btn-ghost btn-sm"
              (click)="filters.reset()"
            >
              <app-icon name="x" [size]="14" /> Reset
            </button>
          }
        </div>
      </section>

      <nav class="tabs" aria-label="Analytics sections">
        @for (t of tabs; track t.path) {
          <a [routerLink]="t.path" routerLinkActive="on"
            ><app-icon [name]="t.icon" [size]="16" /> {{ t.label }}
            @if (t.badge) {
              <em>{{ t.badge }}</em>
            }
          </a>
        }
      </nav>

      <router-outlet />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .bar {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 16px;
      }
      .scope {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
      }
      .scope app-select {
        min-width: 190px;
      }
      .tabs {
        display: flex;
        gap: 6px;
        overflow-x: auto;
        scrollbar-width: none;
        padding: 4px 2px 14px;
        margin: 0 -2px;
        position: sticky;
        top: var(--topbar-h);
        z-index: 10;
      }
      .tabs::-webkit-scrollbar {
        display: none;
      }
      .tabs a {
        flex: none;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 40px;
        padding: 0 16px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--panel-solid);
        color: var(--muted);
        font-weight: 650;
        font-size: 0.88rem;
        text-decoration: none !important;
        transition: all 0.25s;
        white-space: nowrap;
      }
      .tabs a:hover {
        color: var(--text);
        border-color: var(--border-strong);
        transform: translateY(-1px);
      }
      .tabs a.on {
        color: #fff;
        border-color: transparent;
        background: var(--grad);
        box-shadow: 0 10px 24px -10px var(--primary);
      }
      .tabs em {
        font-style: normal;
        font-size: 0.66rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--pink);
        color: #fff;
      }
      @media (max-width: 599.98px) {
        .scope app-select {
          flex: 1 1 100%;
        }
        .tabs {
          top: calc(var(--topbar-h) - 6px);
        }
      }
    `,
  ],
})
export class AnalyticsShellComponent {
  protected readonly filters = inject(AnalyticsFilterService);
  private readonly refData = inject(ReferenceDataService);

  protected readonly tabs = TABS;
  protected readonly accountOptions = computed(() =>
    this.refData.accountOptions(),
  );
  protected readonly categoryOptions = computed(() =>
    this.refData.categoryOptions(undefined, true),
  );

  protected setAccount(value: string | number | null): void {
    this.filters.accountId.set(typeof value === 'string' ? value : null);
  }

  protected setCategory(value: string | number | null): void {
    this.filters.categoryId.set(typeof value === 'string' ? value : null);
  }
}
