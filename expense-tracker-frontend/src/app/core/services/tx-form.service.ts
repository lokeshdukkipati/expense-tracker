import { Injectable, signal } from '@angular/core';
import { TransactionDto, TransactionType } from '../models/api.models';

/** What the add/edit drawer is for: an expense, income, or a transfer between two of the user's accounts. */
export type TxFormType = TransactionType | 'Transfer';

export interface TxFormRequest {
  transaction: TransactionDto | null;
  type?: TxFormType;
  /** Accounts to preselect when opening a new transfer (for example from an account card). */
  prefill?: { fromAccountId?: string; toAccountId?: string };
}

/** Opens the add/edit transaction drawer from anywhere (FAB, tables, keyboard shortcut). */
@Injectable({ providedIn: 'root' })
export class TxFormService {
  readonly request = signal<TxFormRequest | null>(null);

  openNew(type: TxFormType = 'Expense'): void {
    this.request.set({ transaction: null, type });
  }

  openTransfer(prefill?: {
    fromAccountId?: string;
    toAccountId?: string;
  }): void {
    this.request.set({ transaction: null, type: 'Transfer', prefill });
  }

  openEdit(transaction: TransactionDto): void {
    this.request.set({ transaction });
  }

  close(): void {
    this.request.set(null);
  }
}
