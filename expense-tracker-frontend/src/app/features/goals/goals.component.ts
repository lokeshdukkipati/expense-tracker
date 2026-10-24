import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { startWith } from 'rxjs';
import { GoalsApi } from '../../core/api/goals.api';
import { ApiError } from '../../core/errors/api-error';
import { GoalDto } from '../../core/models/api.models';
import { AuthService } from '../../core/services/auth.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import { ViewportService } from '../../core/services/viewport.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { parseYmd, toLocalInput } from '../../core/utils/dates';
import { formatDate } from '../../core/utils/format';
import { ConfettiService } from '../../shared/ui/confetti.component';
import { EmptyArtComponent } from '../../shared/ui/empty-art.component';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../shared/ui/form-controls.component';
import { IconComponent, iconOr } from '../../shared/ui/icon.component';
import { MoneyComponent, MoneyPipe } from '../../shared/ui/money.component';
import { OverlayComponent } from '../../shared/ui/overlay.component';
import {
  ProgressRingComponent,
  RingTone,
} from '../../shared/ui/progress-ring.component';
import { SelectComponent } from '../../shared/ui/select.component';
import {
  ErrorStateComponent,
  SkeletonComponent,
  SpinnerComponent,
} from '../../shared/ui/ui-bits.component';

const COLORS = [
  '#7c6cff',
  '#06b6d4',
  '#22c55e',
  '#f59e0b',
  '#f43f5e',
  '#ec4899',
] as const;
const ICONS = [
  'target',
  'plane',
  'shield',
  'rocket',
  'gift',
  'star',
  'wallet',
  'home',
] as const;
const IDEAS = ['Emergency fund', 'Vacation', 'New phone', 'Down payment'];
const QUICK_AMOUNTS = [500, 1000, 5000];
const round2 = (n: number): number => Math.round(n * 100) / 100;

@Component({
  selector: 'app-goals',
  imports: [
    ReactiveFormsModule,
    IconComponent,
    MoneyComponent,
    MoneyPipe,
    OverlayComponent,
    SelectComponent,
    SegmentedComponent,
    ProgressRingComponent,
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
          <h1>Savings goals</h1>
          <p>
            Set a target, watch the ring fill, and see when you will get there.
          </p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn btn-primary" (click)="openNew()">
            <app-icon name="plus" [size]="18" /> New goal
          </button>
        </div>
      </div>

      @if (error(); as e) {
        <app-error-state [error]="e" (retry)="refresh.bump()" />
      } @else if (!loaded()) {
        <div class="auto-grid">
          <app-skeleton height="260px" radius="20px" /><app-skeleton
            height="260px"
            radius="20px"
          />
        </div>
      } @else if (goals().length === 0) {
        <section class="card card-pad empty">
          <app-empty-art kind="goals" />
          <h2>What are you saving for?</h2>
          <p class="muted">
            A goal turns "someday" into a number and a date. Pick an idea to
            start, or create your own.
          </p>
          <div class="ideas">
            @for (idea of ideas; track idea) {
              <button type="button" class="chip-btn" (click)="openNew(idea)">
                {{ idea }}
              </button>
            }
          </div>
          <button type="button" class="btn btn-primary" (click)="openNew()">
            <app-icon name="plus" [size]="18" /> Create a goal
          </button>
        </section>
      } @else {
        <section class="card card-pad strip reveal">
          <app-progress-ring
            [value]="summary().percent"
            [size]="viewport.isMobile() ? 84 : 96"
            [stroke]="10"
            label="Overall progress"
          >
            <strong class="num">{{ summary().percent }}%</strong>
          </app-progress-ring>
          <div class="strip-text">
            <span class="muted">Saved across active goals</span>
            <strong class="big num"
              ><app-money
                [value]="summary().saved"
                [currency]="summary().currency"
                [compact]="true"
            /></strong>
            <small class="muted"
              >of
              {{ summary().target | money: 'compact' : summary().currency }} ·
              {{ summary().completed }} of {{ summary().count }} reached</small
            >
          </div>
        </section>

        <label class="toggle"
          ><input
            type="checkbox"
            class="checkbox"
            [checked]="showArchived()"
            (change)="showArchived.set(!showArchived())"
          />
          <span>Show archived goals</span></label
        >

        <div class="auto-grid goalgrid">
          @for (g of goals(); track g.id; let i = $index) {
            <article
              class="card card-pad goal"
              [class.done]="g.isCompleted"
              [class.archived]="g.isArchived"
              [style.--i]="i"
              [style.--gc]="g.color || 'var(--primary)'"
            >
              <header>
                <span class="tile"
                  ><app-icon [name]="iconFor(g)" [size]="20"
                /></span>
                <div class="title">
                  <strong class="truncate">{{ g.name }}</strong
                  ><small class="muted truncate">{{
                    g.accountName
                      ? 'Follows ' + g.accountName
                      : 'Tracked by hand'
                  }}</small>
                </div>
                <span
                  class="badge"
                  [class.success]="
                    g.status === 'completed' || g.status === 'on_track'
                  "
                  [class.warning]="g.status === 'behind'"
                  [class.danger]="g.status === 'overdue'"
                  >{{ statusLabel(g) }}</span
                >
              </header>

              <div class="body">
                <app-progress-ring
                  [value]="g.progressPercent"
                  [size]="viewport.isMobile() ? 92 : 108"
                  [stroke]="11"
                  [tone]="ringTone(g)"
                  [label]="g.name + ' progress'"
                >
                  <strong class="pct num">{{ g.progressPercent }}%</strong>
                </app-progress-ring>
                <div class="nums">
                  <strong class="num amount"
                    ><app-money
                      [value]="g.currentAmount"
                      [currency]="g.currency"
                  /></strong>
                  <span class="muted"
                    >of {{ g.targetAmount | money: '' : g.currency }}</span
                  >
                  @if (g.isCompleted) {
                    <small class="text-success">Goal reached</small>
                  } @else {
                    <small class="muted"
                      >{{ g.remainingAmount | money: '' : g.currency }} to
                      go</small
                    >
                  }
                </div>
              </div>

              <ul class="facts">
                @if (g.targetDate) {
                  <li>
                    <app-icon name="calendar" [size]="15" /> {{ deadline(g) }}
                  </li>
                }
                @if (g.requiredPerMonth) {
                  <li>
                    <app-icon name="trending-up" [size]="15" /> Save
                    {{ g.requiredPerMonth | money: '' : g.currency }} a month to
                    make it
                  </li>
                }
                @if (g.projectedDate && !g.isCompleted) {
                  <li>
                    <app-icon name="clock" [size]="15" /> At your pace:
                    {{ projected(g) }}
                  </li>
                }
              </ul>

              <footer class="actions">
                @if (!g.accountId && !g.isArchived) {
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    (click)="openContribute(g)"
                  >
                    <app-icon name="plus" [size]="15" /> Add money
                  </button>
                }
                <span class="spacer"></span>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  (click)="openEdit(g)"
                >
                  <app-icon name="edit" [size]="15" /> Edit
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-icon btn-sm"
                  aria-label="Delete goal"
                  (click)="remove(g)"
                >
                  <app-icon name="trash" [size]="15" />
                </button>
              </footer>
            </article>
          }
        </div>
      }
    </div>

    <app-overlay
      [open]="formOpen()"
      [title]="editing() ? 'Edit goal' : 'New goal'"
      [subtitle]="
        editing()
          ? 'Changes apply immediately.'
          : 'Name it, set a target and an optional date.'
      "
      variant="dialog"
      [width]="500"
      (closed)="closeForm()"
    >
      <form
        [formGroup]="form"
        (ngSubmit)="save()"
        novalidate
        class="stack"
        id="goal-form"
      >
        <div class="field">
          <label for="gname">Name</label>
          <input
            id="gname"
            class="input"
            formControlName="name"
            maxlength="100"
            placeholder="e.g. Goa trip"
            autocomplete="off"
            [class.invalid]="!!err('name')"
          />
          @if (err('name'); as e) {
            <span class="field-error">{{ e }}</span>
          }
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="gtarget">Target amount</label>
            <input
              id="gtarget"
              class="input"
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0"
              formControlName="targetAmount"
              placeholder="0.00"
              [class.invalid]="!!err('targetAmount')"
            />
            @if (err('targetAmount'); as e) {
              <span class="field-error">{{ e }}</span>
            }
          </div>
          <div class="field">
            <label for="gdate"
              >Target date <small class="muted">(optional)</small></label
            >
            <input
              id="gdate"
              class="input"
              type="date"
              formControlName="targetDate"
              [attr.min]="editing() ? null : today"
            />
            @if (err('targetDate'); as e) {
              <span class="field-error">{{ e }}</span>
            }
          </div>
        </div>

        <div class="field">
          <label>How is progress tracked?</label>
          <app-select
            [options]="accountChoices()"
            [value]="form.controls.accountId.value"
            (valueChange)="setAccount($event)"
            ariaLabel="Linked account"
          />
          <span class="field-hint"
            >Link an account (for example a savings account) and the goal
            follows its balance. Otherwise you add money by hand.</span
          >
        </div>

        @if (!linked() && !editing()) {
          <div class="field">
            <label for="ginitial"
              >Already saved <small class="muted">(optional)</small></label
            >
            <input
              id="ginitial"
              class="input"
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0"
              formControlName="initialAmount"
              placeholder="0.00"
            />
            @if (err('initialAmount'); as e) {
              <span class="field-error">{{ e }}</span>
            }
          </div>
        }

        <div class="field">
          <label>Colour</label>
          <div class="swatches" role="radiogroup" aria-label="Goal colour">
            @for (c of colors; track c) {
              <button
                type="button"
                class="swatch"
                role="radio"
                [attr.aria-checked]="color() === c"
                [attr.aria-label]="'Colour ' + c"
                [class.on]="color() === c"
                [style.background]="c"
                (click)="color.set(c)"
              ></button>
            }
          </div>
        </div>

        <div class="field">
          <label>Icon</label>
          <div class="picks" role="radiogroup" aria-label="Goal icon">
            @for (i of icons; track i) {
              <button
                type="button"
                class="pick"
                role="radio"
                [attr.aria-checked]="icon() === i"
                [attr.aria-label]="i"
                [class.on]="icon() === i"
                (click)="icon.set(i)"
              >
                <app-icon [name]="i" [size]="20" />
              </button>
            }
          </div>
        </div>

        @if (editing()) {
          <label class="toggle"
            ><input
              type="checkbox"
              class="checkbox"
              [checked]="form.controls.isArchived.value"
              (change)="
                form.controls.isArchived.setValue(
                  !form.controls.isArchived.value
                )
              "
            />
            <span
              >Archive this goal
              <small class="muted"
                >Hidden from the main list; kept for your history.</small
              ></span
            ></label
          >
        }
      </form>
      <ng-container footer>
        <button type="button" class="btn btn-ghost" (click)="closeForm()">
          Cancel
        </button>
        <button
          type="submit"
          form="goal-form"
          class="btn btn-primary"
          [disabled]="saving()"
        >
          @if (saving()) {
            <app-spinner [size]="16" />
          }
          {{ editing() ? 'Save changes' : 'Create goal' }}
        </button>
      </ng-container>
    </app-overlay>

    <app-overlay
      [open]="contributeFor() !== null"
      [title]="contributeFor()?.name ?? ''"
      subtitle="Add money you have set aside, or take some out."
      variant="dialog"
      [width]="420"
      (closed)="closeContribute()"
    >
      @if (contributeFor(); as g) {
        <form
          class="stack"
          id="contribute-form"
          (submit)="$event.preventDefault(); submitContribute()"
          novalidate
        >
          <app-segmented
            class="block"
            [options]="modes"
            [value]="mode()"
            [tone]="mode() === 'add' ? 'income' : 'expense'"
            (valueChange)="setMode($event)"
          />
          <div class="amount">
            <span class="cur">{{ g.currency }}</span>
            <input
              type="number"
              inputmode="decimal"
              step="0.01"
              min="0"
              [value]="amountText()"
              (input)="onAmount($event)"
              placeholder="0.00"
              aria-label="Amount"
              autocomplete="off"
            />
          </div>
          <div class="quick">
            @for (q of quick; track q) {
              <button type="button" class="chip-btn" (click)="setAmount(q)">
                {{ q | money: 'compact' : g.currency }}
              </button>
            }
            @if (mode() === 'add' && g.remainingAmount > 0) {
              <button
                type="button"
                class="chip-btn"
                (click)="setAmount(g.remainingAmount)"
              >
                Finish it
              </button>
            }
          </div>
          <p class="muted note">
            Saved so far {{ g.currentAmount | money: '' : g.currency }} ·
            {{ g.remainingAmount | money: '' : g.currency }} to go
          </p>
        </form>
      }
      <ng-container footer>
        <button type="button" class="btn btn-ghost" (click)="closeContribute()">
          Cancel
        </button>
        <button
          type="submit"
          form="contribute-form"
          class="btn btn-primary"
          [disabled]="saving() || amountNumber() === null"
        >
          @if (saving()) {
            <app-spinner [size]="16" />
          }
          {{ mode() === 'add' ? 'Add money' : 'Take out' }}
        </button>
      </ng-container>
    </app-overlay>
  `,
  styles: [
    `
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 10px;
        padding-block: 28px;
      }
      .empty h2 {
        margin: 0;
      }
      .empty p {
        margin: 0;
        max-width: 44ch;
      }
      .ideas {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
        margin: 4px 0 8px;
      }
      .chip-btn {
        min-height: 40px;
        padding: 0 16px;
        border-radius: 999px;
        border: 1px solid var(--border-strong);
        background: var(--surface);
        color: var(--text);
        font: inherit;
        font-weight: 600;
        font-size: 0.88rem;
        cursor: pointer;
        transition:
          background 0.2s,
          transform 0.15s;
      }
      .chip-btn:hover {
        background: var(--surface-2);
      }
      .chip-btn:active {
        transform: scale(0.96);
      }
      .strip {
        display: flex;
        align-items: center;
        gap: 18px;
        margin-bottom: 14px;
      }
      .strip-text {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .big {
        font-size: clamp(1.7rem, 6vw, 2.4rem);
        font-weight: 850;
        letter-spacing: -0.03em;
        line-height: 1.1;
      }
      .toggle {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        margin: 4px 2px 14px;
        cursor: pointer;
        min-height: 32px;
      }
      .toggle span {
        display: flex;
        flex-direction: column;
        font-weight: 600;
        font-size: 0.9rem;
      }
      .toggle small {
        font-weight: 400;
      }
      .goal {
        --gc: var(--primary);
        display: flex;
        flex-direction: column;
        gap: 14px;
        position: relative;
        overflow: hidden;
        animation: fadeUp 0.45s both;
        animation-delay: calc(var(--i) * 50ms);
      }
      .goal::before {
        content: '';
        position: absolute;
        inset: 0 0 auto 0;
        height: 3px;
        background: var(--gc);
      }
      .goal.archived {
        opacity: 0.65;
      }
      .goal header {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .tile {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        flex: none;
        border-radius: 14px;
        color: var(--gc);
        background: color-mix(in srgb, var(--gc) 18%, transparent);
      }
      .title {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .body {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .pct {
        font-size: 1.15rem;
        font-weight: 800;
      }
      .nums {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .amount {
        font-size: 1.35rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        overflow-wrap: anywhere;
      }
      .facts {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
        color: var(--muted);
        font-size: 0.86rem;
      }
      .facts li {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: auto;
      }
      .spacer {
        flex: 1;
      }
      .swatches,
      .picks {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .swatch {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 3px solid transparent;
        cursor: pointer;
        transition:
          transform 0.15s,
          box-shadow 0.2s;
      }
      .swatch.on {
        box-shadow:
          0 0 0 2px var(--panel-solid),
          0 0 0 4px currentColor;
        transform: scale(1.08);
      }
      .swatch:active {
        transform: scale(0.92);
      }
      .pick {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: var(--field);
        color: var(--muted);
        cursor: pointer;
        transition:
          background 0.2s,
          color 0.2s,
          border-color 0.2s;
      }
      .pick.on {
        color: #fff;
        background: var(--grad);
        border-color: transparent;
      }
      .block {
        display: block;
      }
      .amount {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 18px;
        border-radius: 18px;
        background: var(--field);
        border: 1px solid var(--border);
        transition:
          border-color 0.2s,
          box-shadow 0.2s;
      }
      .amount:focus-within {
        border-color: var(--primary);
        box-shadow: 0 0 0 3px var(--ring);
      }
      .cur {
        color: var(--muted);
        font-weight: 700;
        font-size: 1.1rem;
      }
      .amount input {
        flex: 1;
        min-width: 0;
        border: 0;
        outline: 0;
        background: none;
        color: var(--text);
        font-size: 2rem;
        font-weight: 800;
        letter-spacing: -0.03em;
        font-variant-numeric: tabular-nums;
      }
      .amount input::-webkit-outer-spin-button,
      .amount input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      .amount input {
        -moz-appearance: textfield;
        appearance: textfield;
      }
      .quick {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .note {
        margin: 0;
      }
    `,
  ],
})
export class GoalsComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(GoalsApi);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly confetti = inject(ConfettiService);
  private readonly refData = inject(ReferenceDataService);
  protected readonly refresh = inject(RefreshService);
  protected readonly viewport = inject(ViewportService);

  protected readonly colors = COLORS;
  protected readonly icons = ICONS;
  protected readonly ideas = IDEAS;
  protected readonly quick = QUICK_AMOUNTS;
  protected readonly today = toLocalInput(new Date()).slice(0, 10);
  protected readonly modes: SegmentOption[] = [
    { value: 'add', label: 'Add money', icon: 'arrow-down-right' },
    { value: 'remove', label: 'Take out', icon: 'arrow-up-right' },
  ];

  private readonly data = asyncState<GoalDto[]>();
  protected readonly loaded = this.data.loaded;
  protected readonly error = this.data.error;
  protected readonly showArchived = signal(false);
  protected readonly goals = computed(() => this.data.data() ?? []);

  protected readonly summary = computed(() => {
    const currency = this.auth.currency();
    const active = this.goals().filter((g) => !g.isArchived);
    const sameCurrency = active.filter((g) => g.currency === currency);
    const target = sameCurrency.reduce((sum, g) => sum + g.targetAmount, 0);
    const saved = sameCurrency.reduce(
      (sum, g) => sum + Math.min(g.currentAmount, g.targetAmount),
      0,
    );
    return {
      currency,
      count: active.length,
      completed: active.filter((g) => g.isCompleted).length,
      saved,
      target,
      percent:
        target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0,
    };
  });

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<GoalDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly color = signal<string>(COLORS[0]);
  protected readonly icon = signal<string>('target');
  private readonly serverErrors = signal<Record<string, string[]>>({});

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    targetAmount: [
      null as number | null,
      [
        Validators.required,
        Validators.min(0.01),
        Validators.max(1_000_000_000_000),
      ],
    ],
    targetDate: [''],
    accountId: [''],
    initialAmount: [
      null as number | null,
      [Validators.min(0), Validators.max(1_000_000_000_000)],
    ],
    isArchived: [false],
  });

  private readonly accountValue = toSignal(
    this.form.controls.accountId.valueChanges.pipe(startWith('')),
    { initialValue: '' },
  );
  protected readonly linked = computed(() => this.accountValue() !== '');
  protected readonly accountChoices = computed(() => [
    { value: '', label: 'Track by hand (I add the money)' },
    ...this.refData.accountOptions(),
  ]);

  protected readonly contributeFor = signal<GoalDto | null>(null);
  protected readonly mode = signal<'add' | 'remove'>('add');
  protected readonly amountText = signal('');
  protected readonly amountNumber = computed(() => {
    const n = Number(this.amountText());
    return this.amountText().trim() !== '' && Number.isFinite(n) && n > 0
      ? round2(n)
      : null;
  });

  constructor() {
    autoLoad(this.data, () => {
      this.refresh.version();
      return this.api.list(this.showArchived());
    });
  }

  protected iconFor(g: GoalDto) {
    return iconOr(g.icon, 'target');
  }

  protected statusLabel(g: GoalDto): string {
    switch (g.status) {
      case 'completed':
        return 'Reached';
      case 'on_track':
        return 'On track';
      case 'behind':
        return 'Behind';
      case 'overdue':
        return 'Overdue';
      default:
        return 'No deadline';
    }
  }

  protected ringTone(g: GoalDto): RingTone {
    switch (g.status) {
      case 'completed':
        return 'success';
      case 'behind':
        return 'warning';
      case 'overdue':
        return 'danger';
      default:
        return 'brand';
    }
  }

  protected deadline(g: GoalDto): string {
    if (!g.targetDate) return '';
    const date = formatDate(parseYmd(g.targetDate), 'day');
    const days = g.daysLeft;
    if (days === null) return date;
    if (days < 0)
      return `${date} · ${Math.abs(days)} day${days === -1 ? '' : 's'} overdue`;
    if (days === 0) return `${date} · due today`;
    return `${date} · ${days} day${days === 1 ? '' : 's'} left`;
  }

  protected projected(g: GoalDto): string {
    return g.projectedDate
      ? formatDate(parseYmd(g.projectedDate), 'month')
      : '';
  }

  protected err(
    field: 'name' | 'targetAmount' | 'targetDate' | 'initialAmount',
  ): string | null {
    const server = this.serverErrors()[field]?.[0];
    if (server) return server;
    const control = this.form.controls[field];
    if (!control.invalid || !(control.touched || control.dirty)) return null;
    const errors = control.errors ?? {};
    if (errors['required'])
      return field === 'name' ? 'Enter a name.' : 'Enter an amount.';
    if (errors['min']) return 'Amount must be greater than zero.';
    if (errors['max']) return 'That amount is too large.';
    if (errors['maxlength']) return 'This is too long.';
    return 'Invalid value.';
  }

  protected setAccount(value: string | number | null): void {
    this.form.controls.accountId.setValue(
      typeof value === 'string' ? value : '',
    );
  }

  protected openNew(name = ''): void {
    this.editing.set(null);
    this.serverErrors.set({});
    this.form.reset({
      name,
      targetAmount: null,
      targetDate: '',
      accountId: '',
      initialAmount: null,
      isArchived: false,
    });
    this.color.set(COLORS[0]);
    this.icon.set('target');
    this.formOpen.set(true);
  }

  protected openEdit(goal: GoalDto): void {
    this.editing.set(goal);
    this.serverErrors.set({});
    this.form.reset({
      name: goal.name,
      targetAmount: goal.targetAmount,
      targetDate: goal.targetDate ?? '',
      accountId: goal.accountId ?? '',
      initialAmount: null,
      isArchived: goal.isArchived,
    });
    this.color.set(goal.color ?? COLORS[0]);
    this.icon.set(goal.icon ?? 'target');
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
    const accountId = v.accountId || null;
    const base = {
      name: v.name.trim(),
      targetAmount: round2(v.targetAmount ?? 0),
      targetDate: v.targetDate || null,
      accountId,
      color: this.color(),
      icon: this.icon(),
    };

    this.saving.set(true);
    this.serverErrors.set({});

    const call$ = existing
      ? this.api.update(existing.id, {
          ...base,
          isArchived: v.isArchived,
          version: existing.version,
        })
      : this.api.create({
          ...base,
          initialAmount:
            accountId || !v.initialAmount || v.initialAmount <= 0
              ? null
              : round2(v.initialAmount),
        });

    call$.subscribe({
      next: (goal) => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(existing ? 'Goal updated.' : 'Goal created.');
        if (goal.isCompleted && !existing?.isCompleted) this.confetti.burst();
        this.refresh.bump();
      },
      error: (err: unknown) => {
        const apiError = ApiError.from(err);
        this.saving.set(false);
        if (apiError.code === 'goal_exists')
          this.serverErrors.set({
            name: ['You already have an active goal with this name.'],
          });
        else if (apiError.hasFieldErrors)
          this.serverErrors.set(apiError.errors);
        if (apiError.code === 'concurrency_conflict') this.refresh.bump();
      },
    });
  }

  protected openContribute(goal: GoalDto): void {
    this.mode.set('add');
    this.amountText.set('');
    this.contributeFor.set(goal);
  }

  protected closeContribute(): void {
    if (!this.saving()) this.contributeFor.set(null);
  }

  protected setMode(value: string): void {
    this.mode.set(value === 'remove' ? 'remove' : 'add');
  }

  protected onAmount(event: Event): void {
    this.amountText.set((event.target as HTMLInputElement).value);
  }

  protected setAmount(amount: number): void {
    this.amountText.set(String(round2(amount)));
  }

  protected submitContribute(): void {
    const goal = this.contributeFor();
    const amount = this.amountNumber();
    if (!goal || amount === null || this.saving()) return;

    this.saving.set(true);
    this.api
      .contribute(goal.id, { amount: this.mode() === 'add' ? amount : -amount })
      .subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.contributeFor.set(null);
          this.toast.success(
            this.mode() === 'add' ? 'Money added.' : 'Money taken out.',
          );
          if (updated.isCompleted && !goal.isCompleted)
            this.confetti.burst({ count: 140 });
          this.refresh.bump();
        },
        error: () => this.saving.set(false),
      });
  }

  protected async remove(goal: GoalDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `Delete “${goal.name}”?`,
      message:
        'The goal is removed. Your accounts and transactions are not affected. Archive it instead to keep the history.',
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    this.api.delete(goal.id).subscribe({
      next: () => {
        this.toast.success('Goal deleted.');
        this.refresh.bump();
      },
    });
  }
}
