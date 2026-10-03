import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PAGE_SIZES } from '../../core/utils/table-state';
import { IconComponent } from './icon.component';
import { SelectComponent, SelectOption } from './select.component';

/** Page navigation with a "rows per page" dropdown. Pages are 1-based. */
@Component({
  selector: 'app-paginator',
  imports: [IconComponent, SelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="pager" aria-label="Pagination">
      <div class="info">
        <span class="range">
          @if (total() === 0) { No results } @else { <b>{{ from() }}–{{ to() }}</b> of <b>{{ total() }}</b> }
        </span>
        <span class="size">
          <span class="lbl">Rows</span>
          <app-select [options]="sizeOptions()" [value]="pageSize()" size="sm" [block]="false" [up]="true" ariaLabel="Rows per page"
                      (valueChange)="onSize($event)" />
        </span>
      </div>

      <div class="nav">
        <button type="button" class="pg" [disabled]="page() <= 1" (click)="go(1)" aria-label="First page"><app-icon name="chevrons-left" [size]="16" /></button>
        <button type="button" class="pg" [disabled]="page() <= 1" (click)="go(page() - 1)" aria-label="Previous page"><app-icon name="chevron-left" [size]="16" /></button>

        <span class="compact">Page {{ page() }} / {{ totalPages() }}</span>

        <span class="numbers">
          @for (p of pages(); track $index) {
            @if (p === 0) {
              <span class="gap">…</span>
            } @else {
              <button type="button" class="pg num" [class.on]="p === page()" [attr.aria-current]="p === page() ? 'page' : null" (click)="go(p)">{{ p }}</button>
            }
          }
        </span>

        <button type="button" class="pg" [disabled]="page() >= totalPages()" (click)="go(page() + 1)" aria-label="Next page"><app-icon name="chevron-right" [size]="16" /></button>
        <button type="button" class="pg" [disabled]="page() >= totalPages()" (click)="go(totalPages())" aria-label="Last page"><app-icon name="chevrons-right" [size]="16" /></button>
      </div>
    </nav>
  `,
  styles: [`
    .pager { display: flex; align-items: center; justify-content: space-between; gap: 12px 20px; flex-wrap: wrap; padding: 14px 4px 2px; color: var(--muted); font-size: .88rem; }
    .info { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .size { display: inline-flex; align-items: center; gap: 8px; }
    .size app-select { width: 82px; }
    b { color: var(--text); font-weight: 650; }
    .nav { display: flex; align-items: center; gap: 4px; }
    .pg { min-width: 34px; height: 34px; padding: 0 8px; display: inline-grid; place-items: center; border-radius: 10px; border: 1px solid transparent; background: transparent;
      color: var(--muted); font: inherit; font-weight: 600; cursor: pointer; transition: background .2s, color .2s, transform .15s, border-color .2s; }
    .pg:hover:not(:disabled) { background: var(--surface-2); color: var(--text); transform: translateY(-1px); }
    .pg:disabled { opacity: .35; cursor: not-allowed; }
    .pg.on { color: #fff; background: var(--grad); box-shadow: 0 6px 18px -6px var(--primary); }
    .gap { padding: 0 4px; color: var(--faint); }
    .compact { display: none; padding: 0 8px; font-variant-numeric: tabular-nums; }
    @media (max-width: 639.98px) {
      .numbers { display: none; }
      .compact { display: inline; }
      .pager { justify-content: center; }
      .info { justify-content: center; }
    }
  `],
})
export class PaginatorComponent {
  readonly total = input.required<number>();
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly sizes = input<readonly number[]>(PAGE_SIZES);

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly from = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1));
  protected readonly to = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
  protected readonly sizeOptions = computed<SelectOption[]>(() => this.sizes().map((s) => ({ value: s, label: String(s) })));

  /** Window of page numbers with 0 standing for an ellipsis. */
  protected readonly pages = computed<number[]>(() => {
    const total = this.totalPages();
    const current = this.page();
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const result: number[] = [1];
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    if (start > 2) result.push(0);
    for (let p = start; p <= end; p++) result.push(p);
    if (end < total - 1) result.push(0);
    result.push(total);
    return result;
  });

  protected go(page: number): void {
    const next = Math.min(this.totalPages(), Math.max(1, page));
    if (next !== this.page()) this.pageChange.emit(next);
  }

  protected onSize(value: string | number | null): void {
    const size = Number(value);
    if (size > 0 && size !== this.pageSize()) this.pageSizeChange.emit(size);
  }
}
