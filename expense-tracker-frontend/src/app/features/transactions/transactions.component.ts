import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TransactionsApi } from '../../core/api/transactions.api';
import { ExportFormat, PagedResult, TransactionDto, TransactionFilterParams, TransactionSource, TransactionType } from '../../core/models/api.models';
import { ConfirmService } from '../../core/services/confirm.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { TimelineService } from '../../core/services/timeline.service';
import { ToastService } from '../../core/services/toast.service';
import { TxFormService } from '../../core/services/tx-form.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { debounced } from '../../core/utils/debounce';
import { DateRange } from '../../core/utils/dates';
import { downloadBlob } from '../../core/utils/format';
import { persistPageSize, readPageSize } from '../../core/utils/table-state';
import { SearchBoxComponent, SegmentOption, SegmentedComponent } from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { PaginatorComponent } from '../../shared/ui/paginator.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select.component';
import { TimelineFilterComponent } from '../../shared/ui/timeline-filter.component';
import { EmptyStateComponent, ErrorStateComponent, SkeletonComponent, SpinnerComponent } from '../../shared/ui/ui-bits.component';
import { TransactionListComponent } from './transaction-list.component';

const SORTS: SelectOption[] = [
  { value: 'date:desc', label: 'Newest first' },
  { value: 'date:asc', label: 'Oldest first' },
  { value: 'amount:desc', label: 'Highest amount' },
  { value: 'amount:asc', label: 'Lowest amount' },
];

@Component({
  selector: 'app-transactions',
  imports: [
    RouterLink,
    IconComponent,
    SearchBoxComponent,
    SegmentedComponent,
    SelectComponent,
    TimelineFilterComponent,
    PaginatorComponent,
    TransactionListComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    SkeletonComponent,
    SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Transactions</h1>
          <p>
            Search, filter and manage every entry. Press <kbd>n</kbd> to add,
            <kbd>/</kbd> to search.
          </p>
        </div>
        <div class="head-actions">
          <div class="export">
            <button
              type="button"
              class="btn btn-secondary"
              (click)="exportMenu.set(!exportMenu())"
              [disabled]="exporting()"
              aria-haspopup="menu"
              [attr.aria-expanded]="exportMenu()"
            >
              @if (exporting()) {
                <app-spinner [size]="16" />
              } @else {
                <app-icon name="download" [size]="18" />
              }
              Export
            </button>
            @if (exportMenu()) {
              <div class="menu" role="menu">
                <button type="button" role="menuitem" (click)="export('Xlsx')">
                  <app-icon name="file" [size]="16" /> Excel (.xlsx)
                </button>
                <button type="button" role="menuitem" (click)="export('Csv')">
                  <app-icon name="file" [size]="16" /> CSV (.csv)
                </button>
                <small>Exports the current filters.</small>
              </div>
            }
          </div>
          <button
            type="button"
            class="btn btn-primary"
            (click)="txForm.openNew()"
          >
            <app-icon name="plus" [size]="18" /> New transaction
          </button>
        </div>
      </div>

      <section class="card card-pad controls">
        <div class="toolbar">
          <app-search-box
            class="grow"
            [value]="search()"
            (valueChange)="setSearch($event)"
            placeholder="Search description or note"
          />
          <app-select
            class="sort"
            [options]="sorts"
            [value]="sortKey()"
            [block]="false"
            (valueChange)="setSort($event)"
            ariaLabel="Sort order"
          />
          <button
            type="button"
            class="btn btn-secondary"
            [class.active]="showFilters()"
            (click)="showFilters.set(!showFilters())"
            [attr.aria-expanded]="showFilters()"
          >
            <app-icon name="filter" [size]="17" /> Filters
            @if (activeCount() > 0) {
              <span class="count">{{ activeCount() }}</span>
            }
          </button>
        </div>

        <app-timeline-filter
          [range]="range()"
          (rangeChange)="setRange($event)"
        />

        @if (showFilters()) {
          <div class="filters">
            <div class="field">
              <label>Type</label>
              <app-segmented
                class="block"
                [options]="typeOptions"
                [value]="type() ?? 'all'"
                (valueChange)="setType($event)"
              />
            </div>
            <div class="field">
              <label>Source</label>
              <app-segmented
                class="block"
                [options]="sourceOptions"
                [value]="source() ?? 'all'"
                (valueChange)="setSource($event)"
              />
            </div>
            <div class="field">
              <label>Account</label>
              <app-select
                [options]="accountOptions()"
                [value]="accountId()"
                placeholder="All accounts"
                [clearable]="true"
                (valueChange)="setAccount($event)"
                ariaLabel="Account"
              />
            </div>
            <div class="field">
              <label>Category</label>
              <app-select
                [options]="categoryOptions()"
                [value]="categoryId()"
                placeholder="All categories"
                [searchable]="true"
                [clearable]="true"
                (valueChange)="setCategory($event)"
                ariaLabel="Category"
              />
            </div>
            <div class="field">
              <label>Min amount</label>
              <input
                class="input"
                type="number"
                inputmode="decimal"
                min="0"
                [value]="minAmount()"
                (input)="setMin($event)"
                placeholder="0"
              />
            </div>
            <div class="field">
              <label>Max amount</label>
              <input
                class="input"
                type="number"
                inputmode="decimal"
                min="0"
                [value]="maxAmount()"
                (input)="setMax($event)"
                placeholder="No limit"
              />
            </div>
            <div class="field">
              <label>Tag</label>
              <input
                class="input"
                [value]="tag()"
                (input)="setTag($event)"
                placeholder="e.g. trip"
                maxlength="30"
              />
            </div>
            <div class="field actions">
              <button
                type="button"
                class="btn btn-ghost"
                (click)="clearFilters()"
                [disabled]="activeCount() === 0"
              >
                <app-icon name="x" [size]="16" /> Clear all
              </button>
            </div>
          </div>
        }

        @if (activeCount() > 0 && !showFilters()) {
          <div class="active">
            @for (c of activeChips(); track c) {
              <span class="chip">{{ c }}</span>
            }
            <button type="button" class="link" (click)="clearFilters()">
              Clear all
            </button>
          </div>
        }
      </section>

      <section
        class="card card-pad results"
        [class.is-loading]="state.loading() && !!state.data()"
      >
        @if (state.error(); as e) {
          <app-error-state [error]="e" (retry)="refresh.bump()" />
        } @else {
          @if (state.data(); as page) {
            @if (page.items.length > 0) {
              <div class="meta">
                <span
                  ><b>{{ page.totalCount }}</b> transaction{{
                    page.totalCount === 1 ? '' : 's'
                  }}</span
                >
                @if (selected().size > 0) {
                  <span class="sel"
                    >{{ selected().size }} selected
                    <button
                      type="button"
                      class="link"
                      (click)="selected.set(emptySet)"
                    >
                      Clear
                    </button></span
                  >
                }
              </div>
              <app-transaction-list
                [items]="page.items"
                [selectable]="true"
                [(selected)]="selected"
                [sortBy]="sortBy()"
                [sortDir]="sortDir()"
                (sortToggle)="toggleSort($event)"
                (rowClick)="txForm.openEdit($event)"
              />
              <app-paginator
                [total]="page.totalCount"
                [page]="pageNo()"
                [pageSize]="pageSize()"
                (pageChange)="goTo($event)"
                (pageSizeChange)="setPageSize($event)"
              />
            } @else if (activeCount() > 0) {
              <app-empty-state
                icon="search"
                title="No transactions match"
                message="Nothing fits these filters. Try loosening them or clearing the search."
              >
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  (click)="clearFilters()"
                >
                  Clear filters
                </button>
              </app-empty-state>
            } @else {
              <app-empty-state
                icon="inbox"
                title="No transactions in this period"
                message="Pick a wider range, add one by hand, or import a statement."
              >
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  (click)="setRange(allTime())"
                >
                  <app-icon name="calendar" [size]="15" /> Show all time
                </button>
                <button
                  type="button"
                  class="btn btn-primary btn-sm"
                  (click)="txForm.openNew()"
                >
                  <app-icon name="plus" [size]="15" /> Add transaction
                </button>
                <a routerLink="/import" class="btn btn-secondary btn-sm"
                  ><app-icon name="upload" [size]="15" /> Import file</a
                >
              </app-empty-state>
            }
          } @else {
            <div class="stack">
              <app-skeleton height="54px" /><app-skeleton
                height="54px"
              /><app-skeleton height="54px" /><app-skeleton
                height="54px"
              /><app-skeleton height="54px" />
            </div>
          }
        }
      </section>
    </div>

    @if (selected().size > 0) {
      <div class="bulk" role="region" aria-label="Bulk actions">
        <span
          ><b>{{ selected().size }}</b> selected</span
        >
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          (click)="selected.set(emptySet)"
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-danger btn-sm"
          (click)="bulkDelete()"
          [disabled]="deleting()"
        >
          @if (deleting()) {
            <app-spinner [size]="14" />
          } @else {
            <app-icon name="trash" [size]="15" />
          }
          Delete
        </button>
      </div>
    }
  `,
  styles: [
    `
      kbd {
        padding: 1px 7px;
        border-radius: 6px;
        border: 1px solid var(--border-strong);
        background: var(--surface-2);
        font: inherit;
        font-size: 0.78rem;
      }
      .controls {
        display: flex;
        flex-direction: column;
        gap: 14px;
        margin-bottom: 16px;
      }
      .sort {
        min-width: 170px;
      }
      .btn.active {
        border-color: var(--primary);
        background: color-mix(in srgb, var(--primary) 14%, transparent);
      }
      .count {
        display: inline-grid;
        place-items: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        border-radius: 999px;
        font-size: 0.72rem;
        color: #fff;
        background: var(--grad);
      }
      .filters {
        display: grid;
        gap: 14px;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        padding-top: 4px;
        animation: fadeUp 0.3s both;
      }
      .filters .actions {
        justify-content: flex-end;
      }
      .block {
        display: block;
      }
      .active {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      .link {
        background: none;
        border: 0;
        color: var(--primary-2);
        font-weight: 600;
        cursor: pointer;
        padding: 0 4px;
      }
      .meta {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        padding: 0 2px 12px;
        color: var(--muted);
        font-size: 0.88rem;
      }
      .meta b {
        color: var(--text);
      }
      .export {
        position: relative;
      }
      .menu {
        position: absolute;
        right: 0;
        top: calc(100% + 8px);
        z-index: 30;
        min-width: 210px;
        padding: 8px;
        border-radius: 16px;
        background: var(--panel-solid);
        border: 1px solid var(--border-strong);
        box-shadow: var(--shadow-lg);
        animation: pop 0.16s both;
        transform-origin: top right;
      }
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
        cursor: pointer;
      }
      .menu button:hover {
        background: var(--surface-2);
      }
      .menu small {
        display: block;
        padding: 6px 12px 2px;
        color: var(--faint);
      }
      .bulk {
        position: fixed;
        z-index: 40;
        left: 50%;
        bottom: calc(24px + env(safe-area-inset-bottom));
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 10px 14px 10px 20px;
        border-radius: 18px;
        background: var(--panel-solid);
        border: 1px solid var(--border-strong);
        box-shadow: var(--shadow-lg);
        animation: bulkIn 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.2) both;
      }
      @keyframes bulkIn {
        from {
          opacity: 0;
          transform: translate(-50%, 20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translate(-50%, 0);
        }
      }
      @media (max-width: 1099.98px) {
        .filters {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 767.98px) {
        .filters {
          grid-template-columns: minmax(0, 1fr);
        }
        .sort {
          min-width: 0;
          flex: 1;
        }
        .bulk {
          bottom: calc(var(--bottom-h) + 28px + env(safe-area-inset-bottom));
          width: calc(100vw - 24px);
          justify-content: space-between;
        }
      }
    `,
  ],
})
export class TransactionsComponent {
  private readonly api = inject(TransactionsApi);
  private readonly timeline = inject(TimelineService);
  private readonly refData = inject(ReferenceDataService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  protected readonly refresh = inject(RefreshService);
  protected readonly txForm = inject(TxFormService);

  protected readonly sorts = SORTS;
  protected readonly emptySet: ReadonlySet<string> = new Set<string>();
  protected readonly typeOptions: SegmentOption[] = [
    { value: 'all', label: 'All' },
    { value: 'Expense', label: 'Expense' },
    { value: 'Income', label: 'Income' },
  ];
  protected readonly sourceOptions: SegmentOption[] = [
    { value: 'all', label: 'All' },
    { value: 'Manual', label: 'Manual' },
    { value: 'Import', label: 'Imported' },
  ];

  protected readonly range = this.timeline.range;
  protected readonly search = signal('');
  protected readonly type = signal<TransactionType | null>(null);
  protected readonly source = signal<TransactionSource | null>(null);
  protected readonly accountId = signal<string | null>(null);
  protected readonly categoryId = signal<string | null>(null);
  protected readonly minAmount = signal('');
  protected readonly maxAmount = signal('');
  protected readonly tag = signal('');
  protected readonly sortBy = signal<'date' | 'amount'>('date');
  protected readonly sortDir = signal<'asc' | 'desc'>('desc');
  protected readonly pageNo = signal(1);
  protected readonly pageSize = signal(readPageSize('transactions', 25));
  protected readonly selected = signal<ReadonlySet<string>>(new Set<string>());
  protected readonly showFilters = signal(false);
  protected readonly exportMenu = signal(false);
  protected readonly exporting = signal(false);
  protected readonly deleting = signal(false);

  private readonly searchD = debounced(this.search, 300);
  private readonly minD = debounced(this.minAmount, 400);
  private readonly maxD = debounced(this.maxAmount, 400);
  private readonly tagD = debounced(this.tag, 400);

  protected readonly state = asyncState<PagedResult<TransactionDto>>();

  protected readonly accountOptions = computed(() =>
    this.refData.accountOptions(),
  );
  protected readonly categoryOptions = computed(() =>
    this.refData.categoryOptions(undefined, true),
  );
  protected readonly sortKey = computed(
    () => `${this.sortBy()}:${this.sortDir()}`,
  );

  private readonly filter = computed<TransactionFilterParams>(() => ({
    from: this.range().from,
    to: this.range().to,
    type: this.type(),
    source: this.source(),
    accountId: this.accountId(),
    categoryId: this.categoryId(),
    search: this.searchD().trim(),
    minAmount: this.num(this.minD()),
    maxAmount: this.num(this.maxD()),
    tag: this.tagD().trim().toLowerCase(),
  }));

  protected readonly activeCount = computed(() => {
    let n = 0;
    if (this.search().trim()) n++;
    if (this.type()) n++;
    if (this.source()) n++;
    if (this.accountId()) n++;
    if (this.categoryId()) n++;
    if (this.minAmount()) n++;
    if (this.maxAmount()) n++;
    if (this.tag().trim()) n++;
    return n;
  });

  protected readonly activeChips = computed(() => {
    const chips: string[] = [];
    if (this.search().trim()) chips.push(`“${this.search().trim()}”`);
    if (this.type()) chips.push(this.type() as string);
    if (this.source())
      chips.push(this.source() === 'Import' ? 'Imported' : 'Manual');
    const account = this.refData
      .accounts()
      .find((a) => a.id === this.accountId());
    if (account) chips.push(account.name);
    const category = this.refData.categoryById().get(this.categoryId() ?? '');
    if (category) chips.push(category.name);
    if (this.minAmount()) chips.push(`≥ ${this.minAmount()}`);
    if (this.maxAmount()) chips.push(`≤ ${this.maxAmount()}`);
    if (this.tag().trim()) chips.push(`#${this.tag().trim()}`);
    return chips;
  });

  constructor() {
    autoLoad(this.state, () => {
      this.refresh.version();
      return this.api.query({
        ...this.filter(),
        page: this.pageNo(),
        pageSize: this.pageSize(),
        sortBy: this.sortBy(),
        sortDir: this.sortDir(),
      });
    });
  }

  @HostListener('document:pointerdown', ['$event'])
  protected onPointer(event: PointerEvent): void {
    if (this.exportMenu() && !(event.target as HTMLElement).closest('.export'))
      this.exportMenu.set(false);
  }

  protected allTime(): DateRange {
    return this.timeline.allTime();
  }

  protected setRange(range: DateRange): void {
    this.timeline.set(range);
    this.reset();
  }

  protected setSearch(value: string): void {
    this.search.set(value);
    this.reset();
  }

  protected setType(value: string): void {
    this.type.set(value === 'Expense' || value === 'Income' ? value : null);
    this.reset();
  }

  protected setSource(value: string): void {
    this.source.set(value === 'Manual' || value === 'Import' ? value : null);
    this.reset();
  }

  protected setAccount(value: string | number | null): void {
    this.accountId.set(typeof value === 'string' ? value : null);
    this.reset();
  }

  protected setCategory(value: string | number | null): void {
    this.categoryId.set(typeof value === 'string' ? value : null);
    this.reset();
  }

  protected setMin(event: Event): void {
    this.minAmount.set((event.target as HTMLInputElement).value);
    this.reset();
  }

  protected setMax(event: Event): void {
    this.maxAmount.set((event.target as HTMLInputElement).value);
    this.reset();
  }

  protected setTag(event: Event): void {
    this.tag.set((event.target as HTMLInputElement).value);
    this.reset();
  }

  protected setSort(value: string | number | null): void {
    const [by, dir] = String(value ?? 'date:desc').split(':');
    this.sortBy.set(by === 'amount' ? 'amount' : 'date');
    this.sortDir.set(dir === 'asc' ? 'asc' : 'desc');
    this.reset();
  }

  protected toggleSort(key: string): void {
    const by = key === 'amount' ? 'amount' : 'date';
    if (this.sortBy() === by)
      this.sortDir.set(this.sortDir() === 'desc' ? 'asc' : 'desc');
    else {
      this.sortBy.set(by);
      this.sortDir.set('desc');
    }
    this.reset();
  }

  protected goTo(page: number): void {
    this.pageNo.set(page);
    this.selected.set(this.emptySet);
  }

  protected setPageSize(size: number): void {
    this.pageSize.set(size);
    persistPageSize('transactions', size);
    this.reset();
  }

  protected clearFilters(): void {
    this.search.set('');
    this.type.set(null);
    this.source.set(null);
    this.accountId.set(null);
    this.categoryId.set(null);
    this.minAmount.set('');
    this.maxAmount.set('');
    this.tag.set('');
    this.reset();
  }

  protected export(format: ExportFormat): void {
    this.exportMenu.set(false);
    this.exporting.set(true);
    this.api.export(this.filter(), format).subscribe({
      next: ({ blob, filename }) => {
        downloadBlob(blob, filename);
        this.exporting.set(false);
        this.toast.success(`Exported ${filename}`);
      },
      error: () => this.exporting.set(false),
    });
  }

  protected async bulkDelete(): Promise<void> {
    const ids = [...this.selected()];
    if (ids.length === 0) return;

    const ok = await this.confirm.confirm({
      title: `Delete ${ids.length} transaction${ids.length === 1 ? '' : 's'}?`,
      message: 'They will be removed from your records and analytics.',
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    this.deleting.set(true);
    this.api.bulkDelete(ids).subscribe({
      next: (result) => {
        this.deleting.set(false);
        this.selected.set(this.emptySet);
        this.toast.success(
          `${result.deleted} transaction${result.deleted === 1 ? '' : 's'} deleted.`,
        );
        this.refresh.bump();
        this.refData.load().subscribe();
      },
      error: () => this.deleting.set(false),
    });
  }

  private reset(): void {
    this.pageNo.set(1);
    this.selected.set(this.emptySet);
  }

  private num(value: string): number | null {
    const n = Number(value);
    return value.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
  }
}
