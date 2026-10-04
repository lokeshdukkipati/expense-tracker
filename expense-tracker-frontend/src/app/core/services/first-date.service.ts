import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { TransactionsApi } from '../api/transactions.api';
import { ymd } from '../utils/dates';
import { AuthService } from './auth.service';
import { RefreshService } from './refresh.service';

/**
 * Date ("YYYY-MM-DD", local time) of the user's earliest transaction, income or expense.
 * It defines what the "All" timeline preset means everywhere in the app, and is refreshed after every
 * import, edit or delete so "All" always starts at the first record that still exists.
 */
@Injectable({ providedIn: 'root' })
export class FirstDateService {
  private readonly api = inject(TransactionsApi);
  private readonly auth = inject(AuthService);
  private readonly refresh = inject(RefreshService);

  /** Null until loaded, or when the user has no transactions yet. */
  readonly date = signal<string | null>(null);
  readonly loaded = signal(false);

  private subscription?: Subscription;

  constructor() {
    effect(() => {
      this.refresh.version();
      const userId = this.auth.user()?.id;
      untracked(() => this.load(userId));
    });
  }

  private load(userId: string | undefined): void {
    this.subscription?.unsubscribe();

    if (!userId) {
      this.date.set(null);
      this.loaded.set(false);
      return;
    }

    this.subscription = this.api
      .query({ page: 1, pageSize: 1, sortBy: 'date', sortDir: 'asc' })
      .subscribe({
        next: (page) => {
          const first = page.items[0];
          this.date.set(first ? ymd(new Date(first.occurredAt)) : null);
          this.loaded.set(true);
        },
        // The error interceptor has already told the user; keep the last known date.
        error: () => this.loaded.set(true),
      });
  }
}
