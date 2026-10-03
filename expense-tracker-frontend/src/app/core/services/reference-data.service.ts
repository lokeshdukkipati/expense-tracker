import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin, tap } from 'rxjs';
import { AccountsApi } from '../api/accounts.api';
import { CategoriesApi } from '../api/categories.api';
import { AccountDto, CategoryDto, TransactionType } from '../models/api.models';

export interface Option {
  value: string | number | null;
  label: string;
  hint?: string;
  color?: string | null;
}

/** Accounts and categories are needed on almost every screen, so they are loaded once and shared. */
@Injectable({ providedIn: 'root' })
export class ReferenceDataService {
  private readonly accountsApi = inject(AccountsApi);
  private readonly categoriesApi = inject(CategoriesApi);

  readonly accounts = signal<AccountDto[]>([]);
  readonly categories = signal<CategoryDto[]>([]);
  readonly loaded = signal(false);

  readonly activeAccounts = computed(() => this.accounts().filter((a) => !a.isArchived));
  readonly categoryById = computed(() => new Map(this.categories().map((c) => [c.id, c])));
  readonly accountOptions = computed<Option[]>(() =>
    this.activeAccounts().map((a) => ({ value: a.id, label: a.name, hint: a.currency })));

  /** Flat list for pickers: each parent followed by its subcategories, labelled "Parent › Child". */
  categoryOptions(type?: TransactionType, includeArchived = false): Option[] {
    const all = this.categories().filter((c) => (!type || c.type === type) && (includeArchived || !c.isArchived));
    const parents = all.filter((c) => !c.parentId).sort((a, b) => a.name.localeCompare(b.name));
    const result: Option[] = [];

    for (const parent of parents) {
      result.push({ value: parent.id, label: parent.name, color: parent.color });
      all.filter((c) => c.parentId === parent.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((child) => result.push({ value: child.id, label: `${parent.name} › ${child.name}`, color: child.color ?? parent.color }));
    }
    return result;
  }

  load(): Observable<unknown> {
    return forkJoin([this.accountsApi.list(true), this.categoriesApi.list(true)]).pipe(
      tap(([accounts, categories]) => {
        this.accounts.set(accounts);
        this.categories.set(categories);
        this.loaded.set(true);
      }),
    );
  }

  clear(): void {
    this.accounts.set([]);
    this.categories.set([]);
    this.loaded.set(false);
  }
}
