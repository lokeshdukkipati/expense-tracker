import { Signal, computed, effect, signal, untracked } from '@angular/core';

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export interface TableConfig<T> {
  /** Text the search box matches against. */
  searchText?: (row: T) => string;
  /** One comparer per sortable column key (ascending order). */
  comparers?: Record<string, (a: T, b: T) => number>;
  defaultSort?: SortState;
  pageSize?: number;
  /** Remember the chosen page size across visits. */
  storageKey?: string;
}

export const PAGE_SIZES = [10, 25, 50, 100] as const;

export function readPageSize(storageKey: string | undefined, fallback: number): number {
  if (!storageKey) return fallback;
  try {
    const stored = Number(localStorage.getItem(`et.pageSize.${storageKey}`));
    return (PAGE_SIZES as readonly number[]).includes(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function persistPageSize(storageKey: string | undefined, size: number): void {
  if (!storageKey) return;
  try {
    localStorage.setItem(`et.pageSize.${storageKey}`, String(size));
  } catch {
    /* storage unavailable: ignore */
  }
}

/** Client-side search + sort + pagination for lists the API returns in full. */
export class TableState<T> {
  readonly search = signal('');
  readonly sort = signal<SortState | null>(null);
  readonly page = signal(1);
  readonly pageSize: ReturnType<typeof signal<number>>;

  readonly filtered: Signal<readonly T[]>;
  readonly sorted: Signal<readonly T[]>;
  readonly total: Signal<number>;
  readonly totalPages: Signal<number>;
  readonly currentPage: Signal<number>;
  readonly pageItems: Signal<readonly T[]>;

  constructor(
    private readonly rows: () => readonly T[],
    private readonly config: TableConfig<T> = {},
  ) {
    this.pageSize = signal(readPageSize(config.storageKey, config.pageSize ?? 10));
    this.sort.set(config.defaultSort ?? null);

    this.filtered = computed(() => {
      const all = this.rows();
      const query = this.search().trim().toLowerCase();
      const text = this.config.searchText;
      return query && text ? all.filter((row) => text(row).toLowerCase().includes(query)) : all;
    });

    this.sorted = computed(() => {
      const rows = this.filtered();
      const sort = this.sort();
      const compare = sort ? this.config.comparers?.[sort.key] : undefined;
      if (!sort || !compare) return rows;
      const direction = sort.dir === 'asc' ? 1 : -1;
      return [...rows].sort((a, b) => compare(a, b) * direction);
    });

    this.total = computed(() => this.sorted().length);
    this.totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
    this.currentPage = computed(() => Math.min(Math.max(1, this.page()), this.totalPages()));
    this.pageItems = computed(() => {
      const size = this.pageSize();
      const start = (this.currentPage() - 1) * size;
      return this.sorted().slice(start, start + size);
    });

    // Searching or re-sorting always returns to the first page.
    effect(() => {
      this.search();
      this.sort();
      untracked(() => this.page.set(1));
    });
  }

  setSearch(value: string): void {
    this.search.set(value);
  }

  toggleSort(key: string): void {
    const current = this.sort();
    if (!current || current.key !== key) this.sort.set({ key, dir: 'asc' });
    else this.sort.set({ key, dir: current.dir === 'asc' ? 'desc' : 'asc' });
  }

  setPage(page: number): void {
    this.page.set(page);
  }

  setPageSize(size: number): void {
    this.pageSize.set(size);
    persistPageSize(this.config.storageKey, size);
    this.page.set(1);
  }
}

export const compareText = (a: string | null | undefined, b: string | null | undefined): number =>
  (a ?? '').localeCompare(b ?? '', undefined, { sensitivity: 'base' });

export const compareNumber = (a: number | null | undefined, b: number | null | undefined): number => (a ?? 0) - (b ?? 0);
