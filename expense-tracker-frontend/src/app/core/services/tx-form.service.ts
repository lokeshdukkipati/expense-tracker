import { Injectable, signal } from '@angular/core';
import { TransactionDto, TransactionType } from '../models/api.models';

export interface TxFormRequest {
  transaction: TransactionDto | null;
  type?: TransactionType;
}

/** Opens the add/edit transaction drawer from anywhere (FAB, tables, keyboard shortcut). */
@Injectable({ providedIn: 'root' })
export class TxFormService {
  readonly request = signal<TxFormRequest | null>(null);

  openNew(type: TransactionType = 'Expense'): void {
    this.request.set({ transaction: null, type });
  }

  openEdit(transaction: TransactionDto): void {
    this.request.set({ transaction });
  }

  close(): void {
    this.request.set(null);
  }
}
