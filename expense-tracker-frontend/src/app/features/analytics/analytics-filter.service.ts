import { Injectable, computed, inject, signal } from '@angular/core';
import { AnalyticsFilterParams } from '../../core/models/api.models';
import { TimelineService } from '../../core/services/timeline.service';
import { DateRange, daysInRange } from '../../core/utils/dates';

/** Scope shared by every analytics tab: timeline range plus optional account and category. */
@Injectable({ providedIn: 'root' })
export class AnalyticsFilterService {
  private readonly timeline = inject(TimelineService);

  readonly range = this.timeline.range;
  readonly accountId = signal<string | null>(null);
  readonly categoryId = signal<string | null>(null);

  readonly filter = computed<AnalyticsFilterParams>(() => ({
    from: this.range().from,
    to: this.range().to,
    accountId: this.accountId(),
    categoryId: this.categoryId(),
  }));

  readonly periodDays = computed(() => daysInRange(this.range()));
  readonly isScoped = computed(() => !!this.accountId() || !!this.categoryId());

  setRange(range: DateRange): void {
    this.timeline.set(range);
  }

  reset(): void {
    this.accountId.set(null);
    this.categoryId.set(null);
  }
}
