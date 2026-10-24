import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DuplicatesApi } from '../../core/api/duplicates.api';
import { TransactionsApi } from '../../core/api/transactions.api';
import { DuplicateChargeDto } from '../../core/models/api.models';
import { ConfirmService } from '../../core/services/confirm.service';
import { PreferencesService } from '../../core/services/preferences.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { formatDateTime } from '../../core/utils/format';
import { EmptyArtComponent } from '../../shared/ui/empty-art.component';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { MoneyPipe } from '../../shared/ui/money.component';
import {
  ErrorStateComponent,
  SkeletonComponent,
  SpinnerComponent,
} from '../../shared/ui/ui-bits.component';

@Component({
  selector: 'app-duplicates',
  imports: [
    IconComponent,
    MoneyPipe,
    SegmentedComponent,
    EmptyArtComponent,
    ErrorStateComponent,
    SkeletonComponent,
    SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Double charges</h1>
          <p>
            The same amount charged twice within minutes. Review each pair, and
            delete the extra one.
          </p>
        </div>
        <div class="head-actions">
          <app-segmented
            [options]="ranges"
            [value]="days().toString()"
            (valueChange)="setDays($event)"
          />
        </div>
      </div>

      @if (error(); as e) {
        <app-error-state [error]="e" (retry)="refresh.bump()" />
      } @else if (!loaded()) {
        <div class="stack">
          <app-skeleton height="170px" radius="20px" /><app-skeleton
            height="170px"
            radius="20px"
          />
        </div>
      } @else if (visible().length === 0) {
        <section class="card card-pad empty">
          <app-empty-art kind="search" />
          <h2>No double charges found</h2>
          <p class="muted">
            Nothing in the last {{ days() }} days looks like the same charge
            made twice.
          </p>
        </section>
      } @else {
        <div class="list">
          @for (d of visible(); track d.key; let i = $index) {
            <article class="card card-pad dup" [style.--i]="i">
              <header>
                <div class="who">
                  <strong class="truncate">{{
                    d.description || d.categoryName
                  }}</strong
                  ><small class="muted truncate"
                    >{{ d.accountName }} · {{ d.categoryName }}</small
                  >
                </div>
                <strong class="num amt">{{
                  d.amount | money: '' : d.currency
                }}</strong>
              </header>

              <div class="when">
                <span
                  class="badge"
                  [class.danger]="d.confidence === 'high'"
                  [class.warning]="d.confidence === 'medium'"
                  >{{ confidenceLabel(d) }}</span
                >
                <span class="muted">{{ gap(d) }}</span>
              </div>

              <ol class="pair">
                <li>
                  <small class="muted">First</small
                  ><span>{{ when(d.firstAt) }}</span>
                </li>
                <li>
                  <small class="muted">Second</small
                  ><span>{{ when(d.secondAt) }}</span>
                </li>
              </ol>

              <footer class="actions">
                <button
                  type="button"
                  class="btn btn-secondary btn-sm"
                  (click)="keepBoth(d)"
                >
                  Keep both
                </button>
                <button
                  type="button"
                  class="btn btn-outline-danger btn-sm"
                  (click)="deleteSecond(d)"
                  [disabled]="busy() === d.key"
                >
                  @if (busy() === d.key) {
                    <app-spinner [size]="14" />
                  } @else {
                    <app-icon name="trash" [size]="15" />
                  }
                  Delete the second
                </button>
              </footer>
            </article>
          }
        </div>
      }

      @if (dismissedCount() > 0) {
        <p class="note muted">
          {{ dismissedCount() }} dismissed pair{{
            dismissedCount() === 1 ? '' : 's'
          }}.
          <button
            type="button"
            class="link"
            (click)="showDismissed.set(!showDismissed())"
          >
            {{ showDismissed() ? 'Hide them' : 'Show them' }}
          </button>
        </p>
      }
    </div>
  `,
  styles: [
    `
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 8px;
        padding-block: 28px;
      }
      .empty h2,
      .empty p {
        margin: 0;
      }
      .list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .dup {
        display: flex;
        flex-direction: column;
        gap: 12px;
        animation: fadeUp 0.4s both;
        animation-delay: calc(var(--i) * 50ms);
      }
      .dup header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .who {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .amt {
        font-size: 1.3rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        white-space: nowrap;
      }
      .when {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }
      .pair {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .pair li {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 10px 12px;
        border-radius: 14px;
        background: var(--surface-2);
        font-weight: 600;
        font-size: 0.9rem;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }
      .note {
        margin-top: 16px;
        font-size: 0.88rem;
      }
      .link {
        border: 0;
        background: none;
        color: var(--primary-2);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        padding: 4px 2px;
      }
      @media (max-width: 480px) {
        .actions .btn {
          flex: 1;
        }
        .pair {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class DuplicatesComponent {
  private readonly api = inject(DuplicatesApi);
  private readonly txApi = inject(TransactionsApi);
  private readonly prefs = inject(PreferencesService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly refData = inject(ReferenceDataService);
  protected readonly refresh = inject(RefreshService);

  protected readonly ranges: SegmentOption[] = [
    { value: '30', label: '30 days' },
    { value: '90', label: '90 days' },
    { value: '365', label: '1 year' },
  ];
  protected readonly days = signal(90);
  protected readonly showDismissed = signal(false);
  protected readonly busy = signal<string | null>(null);

  private readonly state = asyncState<DuplicateChargeDto[]>();
  protected readonly loaded = this.state.loaded;
  protected readonly error = this.state.error;

  private readonly dismissed = computed(
    () => new Set(this.prefs.dismissedDuplicates()),
  );
  private readonly all = computed(() => this.state.data() ?? []);
  protected readonly visible = computed(() =>
    this.all().filter(
      (d) => this.showDismissed() || !this.dismissed().has(d.key),
    ),
  );
  protected readonly dismissedCount = computed(
    () => this.all().filter((d) => this.dismissed().has(d.key)).length,
  );

  constructor() {
    autoLoad(this.state, () => {
      this.refresh.version();
      return this.api.find(this.days());
    });
  }

  protected setDays(value: string): void {
    this.days.set(Number(value) || 90);
  }

  protected confidenceLabel(d: DuplicateChargeDto): string {
    return d.confidence === 'high'
      ? 'Very likely a double charge'
      : d.confidence === 'medium'
        ? 'Possible double charge'
        : 'Worth a look';
  }

  protected gap(d: DuplicateChargeDto): string {
    return d.minutesApart === 0
      ? 'In the same minute'
      : `${d.minutesApart} minute${d.minutesApart === 1 ? '' : 's'} apart`;
  }

  protected when(iso: string): string {
    return formatDateTime(iso);
  }

  protected keepBoth(d: DuplicateChargeDto): void {
    this.prefs.dismissDuplicate(d.key);
    this.toast.success('Kept both. This pair will not be flagged again.');
  }

  protected async deleteSecond(d: DuplicateChargeDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Delete the second charge?',
      message: `The later ${d.description || d.categoryName} entry (${this.when(d.secondAt)}) is removed from your records and analytics.`,
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    this.busy.set(d.key);
    this.txApi.delete(d.secondId).subscribe({
      next: () => {
        this.busy.set(null);
        this.toast.success('Deleted.');
        this.refData.load().subscribe();
        this.refresh.bump();
      },
      error: () => this.busy.set(null),
    });
  }
}
