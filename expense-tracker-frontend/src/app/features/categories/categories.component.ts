import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoriesApi } from '../../core/api/categories.api';
import { ApiError } from '../../core/errors/api-error';
import { CategoryDto, TransactionType } from '../../core/models/api.models';
import { ConfirmService } from '../../core/services/confirm.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import { CATEGORY_SWATCHES, colorForLabel } from '../../core/utils/colors';
import { TableState, compareText } from '../../core/utils/table-state';
import { SearchBoxComponent, SegmentOption, SegmentedComponent, SortHeaderComponent } from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { OverlayComponent } from '../../shared/ui/overlay.component';
import { PaginatorComponent } from '../../shared/ui/paginator.component';
import { SelectComponent, SelectOption } from '../../shared/ui/select.component';
import { EmptyStateComponent, SkeletonComponent, SpinnerComponent } from '../../shared/ui/ui-bits.component';

interface Row {
  category: CategoryDto;
  children: CategoryDto[];
}

@Component({
  selector: 'app-categories',
  imports: [
    ReactiveFormsModule, IconComponent, SearchBoxComponent, SegmentedComponent, SortHeaderComponent, PaginatorComponent, OverlayComponent, SelectComponent,
    EmptyStateComponent, SkeletonComponent, SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Categories</h1><p>Group spending and income. Add subcategories for finer detail.</p></div>
        <div class="head-actions"><button type="button" class="btn btn-primary" (click)="openNew(null)"><app-icon name="plus" [size]="18" /> New category</button></div>
      </div>

      <section class="card card-pad">
        <div class="toolbar">
          <app-segmented [options]="typeOptions" [value]="type()" [tone]="type() === 'Income' ? 'income' : 'expense'" (valueChange)="setType($event)" />
          <app-search-box class="grow" [value]="table.search()" (valueChange)="table.setSearch($event)" placeholder="Search categories and subcategories" />
          <label class="check"><input type="checkbox" class="checkbox" [checked]="showArchived()" (change)="showArchived.set(!showArchived())" /> Show archived</label>
        </div>

        @if (!refData.loaded()) {
          <div class="stack top"><app-skeleton height="56px" /><app-skeleton height="56px" /><app-skeleton height="56px" /></div>
        } @else if (rows().length === 0) {
          <app-empty-state icon="tag" [title]="'No ' + type().toLowerCase() + ' categories'" message="Create one to start organising your transactions.">
            <button type="button" class="btn btn-primary btn-sm" (click)="openNew(null)"><app-icon name="plus" [size]="16" /> Add category</button>
          </app-empty-state>
        } @else if (table.total() === 0) {
          <app-empty-state icon="search" title="No categories match" message="Try a different search term.">
            <button type="button" class="btn btn-secondary btn-sm" (click)="table.setSearch('')">Clear search</button>
          </app-empty-state>
        } @else {
          <div class="table-wrap top">
            <table class="table">
              <thead><tr>
                <th><app-sort-header label="Category" key="name" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                <th class="hide-mobile"><app-sort-header label="Subcategories" key="children" [sort]="table.sort()" (toggle)="table.toggleSort($event)" /></th>
                <th class="hide-mobile">Status</th><th style="width: 130px"></th>
              </tr></thead>
              <tbody>
                @for (r of table.pageItems(); track r.category.id; let i = $index) {
                  <tr [style.--i]="i">
                    <td>
                      <div class="name">
                        @if (r.children.length) {
                          <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="isOpen(r) ? 'Collapse' : 'Expand'" (click)="toggle(r.category.id)"><app-icon [name]="isOpen(r) ? 'chevron-down' : 'chevron-right'" [size]="16" /></button>
                        } @else { <span class="pad"></span> }
                        <i class="dot big" [style.background]="color(r.category)"></i>
                        <div class="cell-main"><strong>{{ r.category.name }}</strong><small class="show-mobile">{{ r.children.length }} sub</small></div>
                      </div>
                    </td>
                    <td class="hide-mobile">{{ r.children.length }}</td>
                    <td class="hide-mobile">@if (r.category.isArchived) { <span class="badge">Archived</span> } @else { <span class="badge success">Active</span> }</td>
                    <td class="right"><span class="row-actions">
                      <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Add subcategory" title="Add subcategory" (click)="openNew(r.category)"><app-icon name="plus" [size]="15" /></button>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Edit" (click)="openEdit(r.category)"><app-icon name="edit" [size]="15" /></button>
                      <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Delete" (click)="remove(r.category)"><app-icon name="trash" [size]="15" /></button>
                    </span></td>
                  </tr>
                  @if (isOpen(r)) {
                    @for (c of r.children; track c.id) {
                      <tr class="sub">
                        <td><div class="name indent"><i class="dot" [style.background]="color(c, r.category)"></i><div class="cell-main"><strong>{{ c.name }}</strong></div></div></td>
                        <td class="hide-mobile"></td>
                        <td class="hide-mobile">@if (c.isArchived) { <span class="badge">Archived</span> } @else { <span class="badge success">Active</span> }</td>
                        <td class="right"><span class="row-actions">
                          <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Edit" (click)="openEdit(c)"><app-icon name="edit" [size]="15" /></button>
                          <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Delete" (click)="remove(c)"><app-icon name="trash" [size]="15" /></button>
                        </span></td>
                      </tr>
                    }
                  }
                }
              </tbody>
            </table>
          </div>
          <app-paginator [total]="table.total()" [page]="table.currentPage()" [pageSize]="table.pageSize()" (pageChange)="table.setPage($event)" (pageSizeChange)="table.setPageSize($event)" />
        }
      </section>
    </div>

    <app-overlay [open]="formOpen()" [title]="title()" [subtitle]="parentName() ? 'Subcategory of ' + parentName() : ''" variant="dialog" [width]="480" (closed)="closeForm()">
      <form [formGroup]="form" (ngSubmit)="save()" novalidate class="stack" id="cat-form">
        <div class="field"><label for="cn">Name</label>
          <input id="cn" class="input" formControlName="name" maxlength="100" placeholder="e.g. Groceries" [class.invalid]="!!err()" />
          @if (err(); as e) { <span class="field-error">{{ e }}</span> }</div>

        @if (!editing()) {
          <div class="field"><label>Type</label>
            <app-segmented class="block" [options]="typeOptions" [value]="form.controls.type.value" [tone]="form.controls.type.value === 'Income' ? 'income' : 'expense'" (valueChange)="setFormType($event)" /></div>
          <div class="field"><label>Parent</label>
            <app-select [options]="parentOptions()" [value]="form.controls.parentId.value" placeholder="None (top-level category)" [clearable]="true" (valueChange)="setParent($event)" ariaLabel="Parent category" /></div>
        }

        <div class="field"><label>Colour</label>
          <div class="swatches">
            @for (s of swatches; track s) {
              <button type="button" class="sw" [style.background]="s" [class.on]="form.controls.color.value === s" [attr.aria-label]="'Colour ' + s" (click)="form.controls.color.setValue(s)"></button>
            }
          </div>
        </div>

        @if (editing()) {
          <label class="check"><input type="checkbox" class="checkbox" [checked]="form.controls.isArchived.value" (change)="form.controls.isArchived.setValue(!form.controls.isArchived.value)" />
            <span>Archive <small>Hidden from pickers; existing transactions keep it.</small></span></label>
        }
      </form>
      <ng-container footer>
        <button type="button" class="btn btn-ghost" (click)="closeForm()">Cancel</button>
        <button type="submit" form="cat-form" class="btn btn-primary" [disabled]="saving()">@if (saving()) { <app-spinner [size]="16" /> } {{ editing() ? 'Save changes' : 'Create' }}</button>
      </ng-container>
    </app-overlay>
  `,
  styles: [`
    .top { margin-top: 16px; }
    .toolbar .grow { flex: 1 1 240px; }
    .check { display: inline-flex; align-items: center; gap: 10px; cursor: pointer; color: var(--muted); font-size: .9rem; }
    .check span { display: flex; flex-direction: column; font-weight: 600; color: var(--text); }
    .check small { color: var(--faint); font-weight: 400; }
    .name { display: flex; align-items: center; gap: 10px; }
    .name.indent { padding-left: 52px; }
    .pad { width: 32px; flex: none; }
    .dot.big { width: 12px; height: 12px; }
    tr.sub td { background: color-mix(in srgb, var(--surface-2) 45%, transparent); }
    .swatches { display: flex; flex-wrap: wrap; gap: 10px; }
    .sw { width: 32px; height: 32px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: transform .15s, border-color .15s; }
    .sw:hover { transform: scale(1.12); }
    .sw.on { border-color: var(--text); box-shadow: 0 0 0 3px var(--panel-solid) inset; transform: scale(1.12); }
    .block { display: block; }
  `],
})
export class CategoriesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(CategoriesApi);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly refresh = inject(RefreshService);
  protected readonly refData = inject(ReferenceDataService);

  protected readonly swatches = CATEGORY_SWATCHES;
  protected readonly typeOptions: SegmentOption[] = [{ value: 'Expense', label: 'Expense' }, { value: 'Income', label: 'Income' }];
  protected readonly type = signal<TransactionType>('Expense');
  protected readonly showArchived = signal(false);
  protected readonly open = signal<ReadonlySet<string>>(new Set<string>());

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<CategoryDto | null>(null);
  protected readonly parentName = signal('');
  protected readonly saving = signal(false);
  private readonly serverErrors = signal<Record<string, string[]>>({});

  protected readonly rows = computed<Row[]>(() => {
    const all = this.refData.categories().filter((c) => c.type === this.type() && (this.showArchived() || !c.isArchived));
    return all.filter((c) => !c.parentId).map((category) => ({
      category,
      children: all.filter((c) => c.parentId === category.id).sort((a, b) => a.name.localeCompare(b.name)),
    }));
  });

  protected readonly table = new TableState<Row>(() => this.rows(), {
    // A parent matches if its own name or any subcategory name matches.
    searchText: (r) => `${r.category.name} ${r.children.map((c) => c.name).join(' ')}`,
    comparers: {
      name: (a, b) => compareText(a.category.name, b.category.name),
      children: (a, b) => a.children.length - b.children.length,
    },
    defaultSort: { key: 'name', dir: 'asc' },
    storageKey: 'categories',
  });

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    type: ['Expense' as TransactionType],
    parentId: [''],
    color: [CATEGORY_SWATCHES[0]],
    isArchived: [false],
  });

  protected readonly parentOptions = computed<SelectOption[]>(() => {
    const type = this.form.controls.type.value;
    return this.refData.categories().filter((c) => !c.parentId && !c.isArchived && c.type === type).sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ value: c.id, label: c.name, color: c.color }));
  });

  protected readonly title = computed(() => (this.editing() ? 'Edit category' : this.parentName() ? 'New subcategory' : 'New category'));

  protected setType(value: string): void {
    this.type.set(value === 'Income' ? 'Income' : 'Expense');
    this.table.setPage(1);
  }

  protected isOpen(row: Row): boolean {
    // While searching, expand everything so a matching subcategory is visible.
    return this.table.search().trim() !== '' || this.open().has(row.category.id);
  }

  protected toggle(id: string): void {
    const next = new Set(this.open());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.open.set(next);
  }

  protected color(category: CategoryDto, parent?: CategoryDto): string {
    return category.color ?? parent?.color ?? colorForLabel(category.name);
  }

  protected err(): string | null {
    const server = this.serverErrors()['name']?.[0];
    if (server) return server;
    const c = this.form.controls.name;
    if (!c.invalid || !(c.touched || c.dirty)) return null;
    return c.errors?.['required'] ? 'Enter a name.' : 'Name is too long.';
  }

  protected setFormType(value: string): void {
    this.form.controls.type.setValue(value === 'Income' ? 'Income' : 'Expense');
    this.form.controls.parentId.setValue('');
    this.parentName.set('');
  }

  protected setParent(value: string | number | null): void {
    const id = typeof value === 'string' ? value : '';
    this.form.controls.parentId.setValue(id);
    this.parentName.set(this.refData.categoryById().get(id)?.name ?? '');
  }

  protected openNew(parent: CategoryDto | null): void {
    this.editing.set(null);
    this.serverErrors.set({});
    this.parentName.set(parent?.name ?? '');
    this.form.reset({ name: '', type: parent?.type ?? this.type(), parentId: parent?.id ?? '', color: parent?.color ?? CATEGORY_SWATCHES[0], isArchived: false });
    this.formOpen.set(true);
  }

  protected openEdit(category: CategoryDto): void {
    this.editing.set(category);
    this.serverErrors.set({});
    this.parentName.set(this.refData.categoryById().get(category.parentId ?? '')?.name ?? '');
    this.form.reset({ name: category.name, type: category.type, parentId: category.parentId ?? '', color: category.color ?? CATEGORY_SWATCHES[0], isArchived: category.isArchived });
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    if (!this.saving()) this.formOpen.set(false);
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;

    const v = this.form.getRawValue();
    const existing = this.editing();
    this.saving.set(true);
    this.serverErrors.set({});

    const call$ = existing
      ? this.api.update(existing.id, { name: v.name.trim(), color: v.color, icon: existing.icon, isArchived: v.isArchived, version: existing.version })
      : this.api.create({ name: v.name.trim(), type: v.type, parentId: v.parentId || null, color: v.color, icon: null });

    call$.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(existing ? 'Category updated.' : 'Category created.');
        this.refData.load().subscribe();
        this.refresh.bump();
      },
      error: (err: unknown) => {
        const e = ApiError.from(err);
        this.saving.set(false);
        if (e.code === 'category_name_taken') this.serverErrors.set({ name: ['That name is already used here.'] });
        else if (e.hasFieldErrors) this.serverErrors.set(e.errors);
        if (e.code === 'concurrency_conflict') this.refData.load().subscribe();
      },
    });
  }

  protected async remove(category: CategoryDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `Delete “${category.name}”?`,
      message: 'Only categories with no transactions or subcategories can be deleted. Otherwise archive it instead.',
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    this.api.delete(category.id).subscribe({
      next: () => {
        this.toast.success('Category deleted.');
        this.refData.load().subscribe();
        this.refresh.bump();
      },
      error: (err: unknown) => {
        const code = ApiError.from(err).code;
        if (code === 'category_in_use') this.openEdit(category);
      },
    });
  }
}
