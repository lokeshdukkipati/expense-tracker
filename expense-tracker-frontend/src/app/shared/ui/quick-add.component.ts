import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  of,
  switchMap,
} from 'rxjs';
import { RulesApi } from '../../core/api/rules.api';
import { TransactionsApi } from '../../core/api/transactions.api';
import {
  RuleMatchResultDto,
  TransactionType,
} from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { QuickAddService } from '../../core/services/quick-add.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import { parseQuickEntry } from '../../core/utils/nl-parser';
import { formatDate, formatMoney, relativeDay } from '../../core/utils/format';
import { IconComponent } from './icon.component';
import { MoneyPipe } from './money.component';
import { OverlayComponent } from './overlay.component';
import { SelectComponent } from './select.component';
import { SpinnerComponent } from './ui-bits.component';

const LAST_ACCOUNT_KEY = 'et.lastAccount';
const EXAMPLES = [
  'coffee 180',
  'salary 65k',
  'uber 240 yesterday #work',
  'groceries 1,450 from Cash',
];

/**
 * Add a transaction by typing it the way you would say it. The draft updates as you type; amount, type, date,
 * account and category can all be corrected before saving. Mount once near the app root.
 */
@Component({
  selector: 'app-quick-add',
  imports: [
    IconComponent,
    MoneyPipe,
    OverlayComponent,
    SelectComponent,
    SpinnerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-overlay
      [open]="open()"
      title="Quick add"
      subtitle="Type it the way you would say it."
      variant="drawer"
      [width]="520"
      (closed)="close()"
    >
      <div class="stack">
        <input
          #field
          class="entry"
          [value]="text()"
          (input)="onText($event)"
          (keydown.enter)="save(false, $event)"
          (keydown.control.enter)="save(true, $event)"
          placeholder="Try “coffee 180 yesterday”"
          aria-label="Describe the transaction"
          autocomplete="off"
          autocapitalize="sentences"
          enterkeyhint="done"
        />

        @if (message(); as m) {
          <p class="msg" role="alert">{{ m }}</p>
        }

        <div class="pills" aria-live="polite">
          @if (amount(); as a) {
            <span class="pill amt" [class.income]="type() === 'Income'">{{
              a | money: '' : currency()
            }}</span>
          } @else {
            <span class="pill ghost">Amount</span>
          }
          <button
            type="button"
            class="pill tap"
            (click)="toggleType()"
            [attr.aria-label]="'Type: ' + type() + '. Tap to switch.'"
          >
            <app-icon
              [name]="
                type() === 'Income' ? 'arrow-down-right' : 'arrow-up-right'
              "
              [size]="14"
            />
            {{ type() }}
          </button>
          <span class="pill"
            ><app-icon name="calendar" [size]="14" /> {{ dateLabel() }}</span
          >
          @for (tag of parsed().tags; track tag) {
            <span class="pill tag">#{{ tag }}</span>
          }
        </div>

        <div class="form-grid">
          <div class="field">
            <label>Account</label>
            <app-select
              [options]="refData.accountOptions()"
              [value]="accountId()"
              placeholder="Choose account"
              (valueChange)="setAccount($event)"
              ariaLabel="Account"
            />
          </div>
          <div class="field">
            <label>Category</label>
            <app-select
              [options]="categoryChoices()"
              [value]="categoryId()"
              placeholder="Choose category"
              [searchable]="true"
              (valueChange)="setCategory($event)"
              ariaLabel="Category"
            />
            <span class="field-hint">{{ categoryHint() }}</span>
          </div>
        </div>

        <div class="examples">
          <span class="muted">Examples</span>
          @for (x of examples; track x) {
            <button type="button" class="chip-btn" (click)="useExample(x)">
              {{ x }}
            </button>
          }
        </div>
      </div>

      <ng-container footer>
        <button type="button" class="btn btn-ghost" (click)="close()">
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-secondary hide-mobile"
          (click)="save(true)"
          [disabled]="saving()"
        >
          Add &amp; keep open
        </button>
        <button
          type="button"
          class="btn btn-primary"
          (click)="save(false)"
          [disabled]="saving()"
        >
          @if (saving()) {
            <app-spinner [size]="16" /> Adding…
          } @else {
            <app-icon name="check" [size]="18" /> Add
          }
        </button>
      </ng-container>
    </app-overlay>
  `,
  styles: [
    `
      .entry {
        width: 100%;
        padding: 16px 18px;
        border-radius: 18px;
        border: 1px solid var(--border);
        background: var(--field);
        color: var(--text);
        font: inherit;
        font-size: 1.25rem;
        font-weight: 700;
        letter-spacing: -0.01em;
        transition:
          border-color 0.2s,
          box-shadow 0.2s;
      }
      .entry::placeholder {
        color: var(--faint);
        font-weight: 600;
      }
      .entry:focus {
        outline: 0;
        border-color: var(--primary);
        box-shadow: 0 0 0 3px var(--ring);
      }
      .msg {
        margin: 0;
        color: var(--danger);
        font-size: 0.88rem;
        font-weight: 600;
      }
      .pills {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 36px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--surface-2);
        color: var(--text);
        font: inherit;
        font-size: 0.85rem;
        font-weight: 700;
      }
      .pill.tap {
        cursor: pointer;
        transition:
          transform 0.15s,
          background 0.2s;
      }
      .pill.tap:active {
        transform: scale(0.95);
      }
      .pill.ghost {
        color: var(--faint);
        border-style: dashed;
        background: transparent;
      }
      .pill.amt {
        color: #fff;
        border-color: transparent;
        background: var(--grad);
        animation: pop 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.4);
      }
      .pill.amt.income {
        background: linear-gradient(135deg, #10b981, #22d3ee);
      }
      .pill.tag {
        color: var(--primary-2);
      }
      .examples {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .chip-btn {
        min-height: 36px;
        padding: 0 14px;
        border-radius: 999px;
        border: 1px solid var(--border-strong);
        background: var(--surface);
        color: var(--text);
        font: inherit;
        font-size: 0.82rem;
        font-weight: 600;
        cursor: pointer;
      }
      .chip-btn:hover {
        background: var(--surface-2);
      }
      @keyframes pop {
        from {
          transform: scale(0.8);
          opacity: 0.4;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }
    `,
  ],
})
export class QuickAddComponent {
  private readonly service = inject(QuickAddService);
  private readonly api = inject(TransactionsApi);
  private readonly rulesApi = inject(RulesApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly refresh = inject(RefreshService);
  protected readonly refData = inject(ReferenceDataService);

  protected readonly examples = EXAMPLES;
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  protected readonly open = computed(() => this.service.request() !== null);
  protected readonly text = signal('');
  protected readonly saving = signal(false);
  protected readonly message = signal<string | null>(null);

  private readonly typeOverride = signal<TransactionType | null>(null);
  private readonly accountOverride = signal<string | null>(null);
  private readonly categoryOverride = signal<string | null>(null);

  protected readonly parsed = computed(() =>
    parseQuickEntry(this.text(), {
      accounts: this.refData
        .activeAccounts()
        .map((a) => ({ id: a.id, name: a.name })),
      categories: this.refData
        .categories()
        .filter((c) => !c.isArchived)
        .map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          parentName: c.parentId
            ? (this.refData.categoryById().get(c.parentId)?.name ?? null)
            : null,
        })),
    }),
  );

  protected readonly amount = computed(() => this.parsed().amount);
  protected readonly type = computed<TransactionType>(
    () => this.typeOverride() ?? this.parsed().type,
  );

  /** Asks the user's own rules which category the description belongs to. */
  private readonly ruleMatch = toSignal(
    toObservable(
      computed(() => ({ text: this.parsed().description, type: this.type() })),
    ).pipe(
      debounceTime(300),
      distinctUntilChanged((a, b) => a.text === b.text && a.type === b.type),
      switchMap((query) =>
        query.text.length < 2
          ? of<RuleMatchResultDto | null>(null)
          : this.rulesApi
              .match(query.type, query.text)
              .pipe(catchError(() => of<RuleMatchResultDto | null>(null))),
      ),
    ),
    { initialValue: null as RuleMatchResultDto | null },
  );

  protected readonly accountId = computed(
    () =>
      this.accountOverride() ??
      this.parsed().accountId ??
      this.defaultAccount(),
  );

  /** Where the category came from: the user's choice, a word in the sentence, or one of their rules. */
  private readonly categorySource = computed<{
    id: string | null;
    from: 'user' | 'text' | 'rule' | 'none';
  }>(() => {
    const override = this.categoryOverride();
    if (override) return { id: override, from: 'user' };

    const type = this.type();
    const byId = this.refData.categoryById();
    const fromText = this.parsed().categoryId;
    if (fromText && byId.get(fromText)?.type === type)
      return { id: fromText, from: 'text' };

    const fromRule = this.ruleMatch()?.match?.categoryId;
    if (fromRule && byId.get(fromRule)?.type === type)
      return { id: fromRule, from: 'rule' };

    return { id: null, from: 'none' };
  });
  protected readonly categoryId = computed(() => this.categorySource().id);
  protected readonly categoryChoices = computed(() =>
    this.refData.categoryOptions(this.type()),
  );
  protected readonly categoryHint = computed(() => {
    switch (this.categorySource().from) {
      case 'text':
        return 'Matched from your words.';
      case 'rule':
        return `From your rule “${this.ruleMatch()?.match?.pattern ?? ''}”.`;
      case 'user':
        return '';
      default:
        return 'Choose one, or create a rule to do it for you.';
    }
  });

  protected readonly currency = computed(
    () =>
      this.refData.accounts().find((a) => a.id === this.accountId())
        ?.currency ?? this.auth.currency(),
  );
  protected readonly dateLabel = computed(() => {
    const date = this.parsed().date;
    const day = relativeDay(date);
    return day === formatDate(date, 'short')
      ? day
      : `${day} · ${formatDate(date, 'short')}`;
  });

  constructor() {
    // Each time the sheet opens, start from the text it was opened with.
    effect(() => {
      const request = this.service.request();
      untracked(() => {
        if (!request) return;
        this.text.set(request.text);
        this.typeOverride.set(null);
        this.accountOverride.set(null);
        this.categoryOverride.set(null);
        this.message.set(null);
        this.saving.set(false);
      });
    });

    // Put the cursor in the box as soon as it appears.
    effect(() => {
      const element = this.field();
      if (element && this.open())
        untracked(() => queueMicrotask(() => element.nativeElement.focus()));
    });
  }

  protected close(): void {
    if (!this.saving()) this.service.close();
  }

  protected onText(event: Event): void {
    this.text.set((event.target as HTMLInputElement).value);
    this.message.set(null);
  }

  protected useExample(example: string): void {
    this.text.set(example);
    this.message.set(null);
    this.field()?.nativeElement.focus();
  }

  protected toggleType(): void {
    this.typeOverride.set(this.type() === 'Income' ? 'Expense' : 'Income');
    this.categoryOverride.set(null); // a category belongs to one type
  }

  protected setAccount(value: string | number | null): void {
    this.accountOverride.set(typeof value === 'string' ? value : null);
  }

  protected setCategory(value: string | number | null): void {
    this.categoryOverride.set(typeof value === 'string' ? value : null);
  }

  protected save(keepOpen: boolean, event?: Event): void {
    event?.preventDefault();
    if (this.saving()) return;

    const amount = this.amount();
    const accountId = this.accountId();
    const categoryId = this.categoryId();

    if (amount === null)
      return this.fail('Add an amount, for example “coffee 180”.');
    if (!accountId) return this.fail('Choose an account.');
    if (!categoryId) return this.fail('Choose a category.');

    const entry = this.parsed();
    const categoryName = this.refData.categoryById().get(categoryId)?.name;

    this.saving.set(true);
    this.api
      .create({
        accountId,
        categoryId,
        type: this.type(),
        amount,
        occurredAt: entry.date.toISOString(),
        description: entry.description || null,
        note: null,
        tags: entry.tags,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.remember(accountId);
          this.toast.success(
            `Added ${formatMoney(amount, this.currency())}${categoryName ? ` · ${categoryName}` : ''}`,
          );
          this.refresh.bump();
          this.refData.load().subscribe();

          if (keepOpen) {
            this.text.set('');
            this.typeOverride.set(null);
            this.categoryOverride.set(null);
            this.field()?.nativeElement.focus();
          } else {
            this.service.close();
          }
        },
        error: () => this.saving.set(false),
      });
  }

  private fail(message: string): void {
    this.message.set(message);
  }

  private defaultAccount(): string {
    const accounts = this.refData.activeAccounts();
    try {
      const last = localStorage.getItem(LAST_ACCOUNT_KEY);
      if (last && accounts.some((a) => a.id === last)) return last;
    } catch {
      /* storage unavailable */
    }
    return accounts[0]?.id ?? '';
  }

  private remember(accountId: string): void {
    try {
      localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
    } catch {
      /* storage unavailable */
    }
  }
}
