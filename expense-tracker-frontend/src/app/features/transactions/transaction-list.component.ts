import { ChangeDetectionStrategy, Component, computed, inject, input, model, output } from '@angular/core';
import { TransactionDto } from '../../core/models/api.models';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { ViewportService } from '../../core/services/viewport.service';
import { colorForLabel } from '../../core/utils/colors';
import { formatDate, formatTime, relativeDay } from '../../core/utils/format';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyPipe } from '../../shared/ui/money.component';
import { SortHeaderComponent } from '../../shared/ui/form-controls.component';
import { SortState } from '../../core/utils/table-state';

interface DayGroup {
  label: string;
  total: number;
  items: TransactionDto[];
}

/** Transactions as a table on tablets/desktops and as grouped cards on phones. */
@Component({
  selector: 'app-transaction-list',
  imports: [IconComponent, MoneyPipe, SortHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (viewport.isMobile()) {
      <div class="cards">
        @for (g of groups(); track g.label) {
          <div class="day"><span>{{ g.label }}</span><span class="num" [class.text-success]="g.total > 0" [class.text-danger]="g.total < 0">{{ g.total | money: 'signed' }}</span></div>
          @for (t of g.items; track t.id; let i = $index) {
            <button type="button" class="card-row" [style.--i]="i" (click)="rowClick.emit(t)">
              @if (selectable()) {
                <input type="checkbox" class="checkbox" [checked]="isSelected(t.id)" (click)="$event.stopPropagation(); toggle(t.id)" [attr.aria-label]="'Select ' + (t.description || t.categoryName)" />
              }
              <span class="tile" [style.--tile]="colorOf(t)">{{ initial(t) }}</span>
              <span class="mid">
                <strong class="truncate">{{ t.description || t.categoryName }}</strong>
                <small class="truncate">{{ categoryLabel(t) }} · {{ t.accountName }} · {{ time(t) }}</small>
              </span>
              <span class="amt num" [class.text-success]="t.type === 'Income'">{{ signed(t) | money }}</span>
            </button>
          }
        }
      </div>
    } @else {
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              @if (selectable()) {
                <th style="width: 44px"><input type="checkbox" class="checkbox" [checked]="allSelected()" (change)="toggleAll()" aria-label="Select all on this page" /></th>
              }
              <th>
                @if (sortable()) { <app-sort-header label="Date" key="date" [sort]="sortState()" (toggle)="sortToggle.emit($event)" /> } @else { Date }
              </th>
              <th>Description</th>
              <th>Category</th>
              <th class="hide-tablet">Account</th>
              <th class="right">
                @if (sortable()) { <app-sort-header label="Amount" key="amount" align="right" [sort]="sortState()" (toggle)="sortToggle.emit($event)" /> } @else { Amount }
              </th>
              <th style="width: 48px"></th>
            </tr>
          </thead>
          <tbody>
            @for (t of items(); track t.id; let i = $index) {
              <tr class="clickable" [style.--i]="i" [class.sel]="isSelected(t.id)" (click)="rowClick.emit(t)">
                @if (selectable()) {
                  <td (click)="$event.stopPropagation()"><input type="checkbox" class="checkbox" [checked]="isSelected(t.id)" (change)="toggle(t.id)" [attr.aria-label]="'Select ' + (t.description || t.categoryName)" /></td>
                }
                <td class="nowrap"><div class="cell-main"><strong>{{ date(t) }}</strong><small>{{ time(t) }}</small></div></td>
                <td>
                  <div class="cell-main">
                    <strong>{{ t.description || '—' }}</strong>
                    @if (t.tags.length || t.note) {
                      <small class="tags">
                        @for (tag of t.tags; track tag) { <span class="tag">#{{ tag }}</span> }
                        @if (t.note) { <span class="truncate">{{ t.note }}</span> }
                      </small>
                    }
                  </div>
                </td>
                <td><span class="cat"><i class="dot" [style.background]="colorOf(t)"></i>{{ categoryLabel(t) }}</span></td>
                <td class="hide-tablet muted">{{ t.accountName }}</td>
                <td class="right num amount" [class.text-success]="t.type === 'Income'">{{ signed(t) | money }}</td>
                <td class="right"><span class="row-actions"><button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Edit" (click)="$event.stopPropagation(); rowClick.emit(t)"><app-icon name="edit" [size]="15" /></button></span></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    .cards { display: flex; flex-direction: column; gap: 6px; }
    .day { display: flex; justify-content: space-between; padding: 14px 4px 4px; font-size: .78rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: var(--faint); }
    .card-row { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px; text-align: left; border-radius: 16px; border: 1px solid var(--border); background: var(--surface); color: var(--text);
      cursor: pointer; animation: fadeUp .35s both; animation-delay: calc(var(--i) * 30ms); transition: transform .15s, background .2s; }
    .card-row:active { transform: scale(.985); background: var(--surface-2); }
    .tile { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 14px; flex: none; font-weight: 800; color: var(--tile); background: color-mix(in srgb, var(--tile) 18%, transparent); }
    .mid { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .mid strong { font-weight: 600; font-size: .95rem; }
    .mid small { color: var(--faint); font-size: .76rem; }
    .amt { font-weight: 750; white-space: nowrap; }
    .cat { display: inline-flex; align-items: center; gap: 8px; }
    .amount { font-weight: 700; white-space: nowrap; }
    .tags { display: flex; gap: 6px; align-items: center; }
    .tag { color: var(--primary-2); font-weight: 600; }
    tr.sel { background: color-mix(in srgb, var(--primary) 10%, transparent); }
  `],
})
export class TransactionListComponent {
  protected readonly viewport = inject(ViewportService);
  private readonly refData = inject(ReferenceDataService);

  readonly items = input.required<readonly TransactionDto[]>();
  readonly selectable = input(false);
  readonly selected = model<ReadonlySet<string>>(new Set<string>());
  readonly sortBy = input<'date' | 'amount' | null>(null);
  readonly sortDir = input<'asc' | 'desc'>('desc');
  readonly rowClick = output<TransactionDto>();
  readonly sortToggle = output<string>();

  protected readonly sortable = computed(() => this.sortBy() !== null);
  protected readonly sortState = computed<SortState | null>(() => (this.sortBy() ? { key: this.sortBy() as string, dir: this.sortDir() } : null));
  protected readonly allSelected = computed(() => this.items().length > 0 && this.items().every((t) => this.selected().has(t.id)));

  protected readonly groups = computed<DayGroup[]>(() => {
    const map = new Map<string, DayGroup>();
    for (const t of this.items()) {
      const label = relativeDay(t.occurredAt);
      const group = map.get(label) ?? { label, total: 0, items: [] };
      group.items.push(t);
      group.total += t.type === 'Income' ? t.amount : -t.amount;
      map.set(label, group);
    }
    return [...map.values()];
  });

  protected isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  protected toggle(id: string): void {
    const next = new Set(this.selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selected.set(next);
  }

  protected toggleAll(): void {
    const next = new Set(this.selected());
    if (this.allSelected()) this.items().forEach((t) => next.delete(t.id));
    else this.items().forEach((t) => next.add(t.id));
    this.selected.set(next);
  }

  protected signed(t: TransactionDto): number {
    return t.type === 'Income' ? t.amount : -t.amount;
  }

  protected colorOf(t: TransactionDto): string {
    const category = this.refData.categoryById().get(t.categoryId);
    const parent = category?.parentId ? this.refData.categoryById().get(category.parentId) : undefined;
    return category?.color ?? parent?.color ?? colorForLabel(t.parentCategoryName ?? t.categoryName);
  }

  protected categoryLabel(t: TransactionDto): string {
    return t.parentCategoryName ? `${t.parentCategoryName} › ${t.categoryName}` : t.categoryName;
  }

  protected initial(t: TransactionDto): string {
    return (t.parentCategoryName ?? t.categoryName).charAt(0).toUpperCase();
  }

  protected date(t: TransactionDto): string {
    return formatDate(t.occurredAt);
  }

  protected time(t: TransactionDto): string {
    return formatTime(t.occurredAt);
  }
}
