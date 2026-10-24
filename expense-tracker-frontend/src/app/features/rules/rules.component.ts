import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { catchError, combineLatest, debounceTime, of, switchMap } from 'rxjs';
import { RulesApi } from '../../core/api/rules.api';
import { ApiError } from '../../core/errors/api-error';
import {
  RuleDto,
  RuleMatchResultDto,
  RuleMatchType,
  TransactionType,
} from '../../core/models/api.models';
import { ConfirmService } from '../../core/services/confirm.service';
import { ReferenceDataService } from '../../core/services/reference-data.service';
import { RefreshService } from '../../core/services/refresh.service';
import { ToastService } from '../../core/services/toast.service';
import { asyncState, autoLoad } from '../../core/utils/async-state';
import { EmptyArtComponent } from '../../shared/ui/empty-art.component';
import {
  SegmentOption,
  SegmentedComponent,
} from '../../shared/ui/form-controls.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { OverlayComponent } from '../../shared/ui/overlay.component';
import {
  SelectComponent,
  SelectOption,
} from '../../shared/ui/select.component';
import {
  ErrorStateComponent,
  SkeletonComponent,
  SpinnerComponent,
} from '../../shared/ui/ui-bits.component';

const MATCH_OPTIONS: SelectOption[] = [
  { value: 'Contains', label: 'Contains' },
  { value: 'StartsWith', label: 'Starts with' },
  { value: 'Equals', label: 'Is exactly' },
];
const TYPE_OPTIONS: SegmentOption[] = [
  { value: 'Expense', label: 'Expense' },
  { value: 'Income', label: 'Income' },
];
const EXAMPLES = ['swiggy', 'uber', 'netflix', 'electricity'];

/** At least two real characters, not counting spaces. */
function atLeastTwo(control: AbstractControl): ValidationErrors | null {
  return String(control.value ?? '').trim().length >= 2
    ? null
    : { short: true };
}

@Component({
  selector: 'app-rules',
  imports: [
    ReactiveFormsModule,
    IconComponent,
    OverlayComponent,
    SelectComponent,
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
          <h1>Auto-categorise</h1>
          <p>
            Teach the app once: when a description contains some text, it picks
            the category for you on imports.
          </p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn btn-primary" (click)="openNew()">
            <app-icon name="plus" [size]="18" /> New rule
          </button>
        </div>
      </div>

      <section class="card card-pad tester reveal">
        <div class="tester-head">
          <strong><app-icon name="wand" [size]="18" /> Try it</strong>
          <app-segmented
            [options]="typeOptions"
            [value]="testType()"
            (valueChange)="setTestType($event)"
          />
        </div>
        <input
          class="input"
          [value]="testText()"
          (input)="onTest($event)"
          placeholder="Type a description, e.g. Swiggy order 4821"
          aria-label="Description to test"
          autocomplete="off"
        />
        @if (testText().trim().length >= 2) {
          @if (testResult()?.match; as m) {
            <p class="result ok">
              <app-icon name="check" [size]="16" /> Matches “{{ m.pattern }}” →
              <strong>{{
                m.parentCategoryName
                  ? m.parentCategoryName + ' › ' + m.categoryName
                  : m.categoryName
              }}</strong>
            </p>
          } @else {
            <p class="result muted">No rule matches this text yet.</p>
          }
        }
      </section>

      @if (error(); as e) {
        <app-error-state [error]="e" (retry)="refresh.bump()" />
      } @else if (!loaded()) {
        <div class="stack">
          <app-skeleton height="84px" radius="18px" /><app-skeleton
            height="84px"
            radius="18px"
          />
        </div>
      } @else if (rules().length === 0) {
        <section class="card card-pad empty">
          <app-empty-art kind="rules" />
          <h2>No rules yet</h2>
          <p class="muted">
            A rule says “if the description contains this, use that category”.
            Imports then sort themselves.
          </p>
          <div class="examples">
            @for (x of examples; track x) {
              <button type="button" class="chip-btn" (click)="openNew(x)">
                {{ x }}
              </button>
            }
          </div>
          <button type="button" class="btn btn-primary" (click)="openNew()">
            <app-icon name="plus" [size]="18" /> Create a rule
          </button>
        </section>
      } @else {
        <div class="rules">
          @for (r of rules(); track r.id; let i = $index) {
            <article
              class="card rule"
              [class.off]="!r.isActive"
              [style.--i]="i"
            >
              <div class="main">
                <span class="pat"
                  ><span class="kw">{{ matchLabel(r.matchType) }}</span>
                  <code>{{ r.pattern }}</code></span
                >
                <app-icon name="chevron-right" [size]="16" />
                <span class="cat">{{
                  r.parentCategoryName
                    ? r.parentCategoryName + ' › ' + r.categoryName
                    : r.categoryName
                }}</span>
              </div>
              <div class="meta">
                <span class="badge" [class.success]="r.type === 'Income'">{{
                  r.type
                }}</span>
                @if (!r.isActive) {
                  <span class="badge">Paused</span>
                }
                <small class="muted"
                  >Used {{ r.timesApplied }} time{{
                    r.timesApplied === 1 ? '' : 's'
                  }}</small
                >
                <span class="spacer"></span>
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  (click)="applyToPast(r)"
                  [disabled]="applying() === r.id"
                >
                  @if (applying() === r.id) {
                    <app-spinner [size]="14" />
                  } @else {
                    <app-icon name="refresh" [size]="15" />
                  }
                  Apply to past
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-icon btn-sm"
                  aria-label="Edit rule"
                  (click)="openEdit(r)"
                >
                  <app-icon name="edit" [size]="15" />
                </button>
                <button
                  type="button"
                  class="btn btn-ghost btn-icon btn-sm"
                  aria-label="Delete rule"
                  (click)="remove(r)"
                >
                  <app-icon name="trash" [size]="15" />
                </button>
              </div>
            </article>
          }
        </div>
      }
    </div>

    <app-overlay
      [open]="formOpen()"
      [title]="editing() ? 'Edit rule' : 'New rule'"
      [subtitle]="
        editing()
          ? 'Changes apply to future imports.'
          : 'Matching ignores capital letters and extra spaces.'
      "
      variant="dialog"
      [width]="480"
      (closed)="closeForm()"
    >
      <form
        [formGroup]="form"
        (ngSubmit)="save()"
        novalidate
        class="stack"
        id="rule-form"
      >
        @if (!editing()) {
          <app-segmented
            class="block"
            [options]="typeOptions"
            [value]="formType()"
            (valueChange)="setFormType($event)"
          />
        }

        <div class="form-grid">
          <div class="field">
            <label>When the description</label>
            <app-select
              [options]="matchOptions"
              [value]="form.controls.matchType.value"
              (valueChange)="setMatch($event)"
              ariaLabel="Match type"
            />
          </div>
          <div class="field">
            <label for="rpat">this text</label>
            <input
              id="rpat"
              class="input"
              formControlName="pattern"
              maxlength="100"
              placeholder="e.g. swiggy"
              autocomplete="off"
              [class.invalid]="!!err('pattern')"
            />
            @if (err('pattern'); as e) {
              <span class="field-error">{{ e }}</span>
            }
          </div>
        </div>

        <div class="field">
          <label>use this category</label>
          <app-select
            [options]="categoryChoices()"
            [value]="form.controls.categoryId.value"
            placeholder="Choose category"
            [searchable]="true"
            (valueChange)="setCategory($event)"
            ariaLabel="Category"
          />
          @if (err('categoryId'); as e) {
            <span class="field-error">{{ e }}</span>
          }
        </div>

        <div class="form-grid">
          <div class="field">
            <label for="rprio"
              >Priority <small class="muted">(lower runs first)</small></label
            >
            <input
              id="rprio"
              class="input"
              type="number"
              inputmode="numeric"
              step="1"
              formControlName="priority"
            />
            @if (err('priority'); as e) {
              <span class="field-error">{{ e }}</span>
            }
          </div>
          @if (editing()) {
            <label class="toggle"
              ><input
                type="checkbox"
                class="checkbox"
                [checked]="form.controls.isActive.value"
                (change)="
                  form.controls.isActive.setValue(!form.controls.isActive.value)
                "
              />
              <span>Rule is active</span></label
            >
          }
        </div>
      </form>
      <ng-container footer>
        <button type="button" class="btn btn-ghost" (click)="closeForm()">
          Cancel
        </button>
        <button
          type="submit"
          form="rule-form"
          class="btn btn-primary"
          [disabled]="saving()"
        >
          @if (saving()) {
            <app-spinner [size]="16" />
          }
          {{ editing() ? 'Save changes' : 'Create rule' }}
        </button>
      </ng-container>
    </app-overlay>
  `,
  styles: [
    `
      .tester {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 18px;
      }
      .tester-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 10px;
      }
      .tester-head strong {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .result {
        margin: 0;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 0.92rem;
      }
      .result.ok {
        color: var(--success);
      }
      .result.ok strong {
        color: var(--text);
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 10px;
        padding-block: 28px;
      }
      .empty h2,
      .empty p {
        margin: 0;
      }
      .examples {
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
      }
      .chip-btn:hover {
        background: var(--surface-2);
      }
      .rules {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .rule {
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        animation: fadeUp 0.4s both;
        animation-delay: calc(var(--i) * 40ms);
      }
      .rule.off {
        opacity: 0.6;
      }
      .main {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px 10px;
        min-width: 0;
      }
      .pat {
        display: inline-flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
        min-width: 0;
      }
      .kw {
        color: var(--muted);
        font-size: 0.85rem;
      }
      code {
        padding: 3px 10px;
        border-radius: 10px;
        background: var(--field);
        border: 1px solid var(--border);
        font-weight: 600;
        overflow-wrap: anywhere;
      }
      .cat {
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px 8px;
      }
      .spacer {
        flex: 1;
      }
      .block {
        display: block;
      }
      .toggle {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 44px;
        cursor: pointer;
        font-weight: 600;
        align-self: end;
      }
    `,
  ],
})
export class RulesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(RulesApi);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly refData = inject(ReferenceDataService);
  protected readonly refresh = inject(RefreshService);

  protected readonly matchOptions = MATCH_OPTIONS;
  protected readonly typeOptions = TYPE_OPTIONS;
  protected readonly examples = EXAMPLES;

  private readonly data = asyncState<RuleDto[]>();
  protected readonly loaded = this.data.loaded;
  protected readonly error = this.data.error;
  protected readonly rules = computed(() => this.data.data() ?? []);

  protected readonly testText = signal('');
  protected readonly testType = signal<TransactionType>('Expense');
  protected readonly testResult = toSignal(
    combineLatest([
      toObservable(this.testText),
      toObservable(this.testType),
    ]).pipe(
      debounceTime(300),
      switchMap(([text, type]) =>
        text.trim().length < 2
          ? of<RuleMatchResultDto | null>(null)
          : this.api
              .match(type, text)
              .pipe(catchError(() => of<RuleMatchResultDto | null>(null))),
      ),
    ),
    { initialValue: null as RuleMatchResultDto | null },
  );

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<RuleDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly applying = signal<string | null>(null);
  protected readonly formType = signal<TransactionType>('Expense');
  private readonly serverErrors = signal<Record<string, string[]>>({});

  protected readonly categoryChoices = computed(() =>
    this.refData.categoryOptions(this.formType()),
  );

  protected readonly form = this.fb.nonNullable.group({
    pattern: ['', [Validators.required, Validators.maxLength(100), atLeastTwo]],
    matchType: ['Contains' as RuleMatchType],
    categoryId: ['', [Validators.required]],
    priority: [0, [Validators.min(-1000), Validators.max(1000)]],
    isActive: [true],
  });

  constructor() {
    autoLoad(this.data, () => {
      this.refresh.version();
      return this.api.list();
    });
  }

  protected matchLabel(type: RuleMatchType): string {
    return type === 'StartsWith'
      ? 'starts with'
      : type === 'Equals'
        ? 'is exactly'
        : 'contains';
  }

  protected onTest(event: Event): void {
    this.testText.set((event.target as HTMLInputElement).value);
  }

  protected setTestType(value: string): void {
    this.testType.set(value === 'Income' ? 'Income' : 'Expense');
  }

  protected setFormType(value: string): void {
    this.formType.set(value === 'Income' ? 'Income' : 'Expense');
    this.form.controls.categoryId.setValue(''); // a category belongs to one type
  }

  protected setMatch(value: string | number | null): void {
    const next: RuleMatchType =
      value === 'StartsWith' || value === 'Equals' ? value : 'Contains';
    this.form.controls.matchType.setValue(next);
  }

  protected setCategory(value: string | number | null): void {
    this.form.controls.categoryId.setValue(
      typeof value === 'string' ? value : '',
    );
    this.form.controls.categoryId.markAsDirty();
  }

  protected err(field: 'pattern' | 'categoryId' | 'priority'): string | null {
    const server = this.serverErrors()[field]?.[0];
    if (server) return server;
    const control = this.form.controls[field];
    if (!control.invalid || !(control.touched || control.dirty)) return null;
    const errors = control.errors ?? {};
    if (errors['required'])
      return field === 'pattern'
        ? 'Enter the text to look for.'
        : 'Choose a category.';
    if (errors['short']) return 'Enter at least 2 characters.';
    if (errors['maxlength']) return 'This is too long.';
    if (errors['min'] || errors['max'])
      return 'Use a number between -1000 and 1000.';
    return 'Invalid value.';
  }

  protected openNew(pattern = ''): void {
    this.editing.set(null);
    this.serverErrors.set({});
    this.formType.set('Expense');
    this.form.reset({
      pattern,
      matchType: 'Contains',
      categoryId: '',
      priority: 0,
      isActive: true,
    });
    this.formOpen.set(true);
  }

  protected openEdit(rule: RuleDto): void {
    this.editing.set(rule);
    this.serverErrors.set({});
    this.formType.set(rule.type);
    this.form.reset({
      pattern: rule.pattern,
      matchType: rule.matchType,
      categoryId: rule.categoryId,
      priority: rule.priority,
      isActive: rule.isActive,
    });
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
    const priority = Math.round(v.priority ?? 0);

    this.saving.set(true);
    this.serverErrors.set({});

    const call$ = existing
      ? this.api.update(existing.id, {
          pattern: v.pattern.trim(),
          matchType: v.matchType,
          categoryId: v.categoryId,
          priority,
          isActive: v.isActive,
          version: existing.version,
        })
      : this.api.create({
          pattern: v.pattern.trim(),
          matchType: v.matchType,
          type: this.formType(),
          categoryId: v.categoryId,
          priority,
        });

    call$.subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success(existing ? 'Rule updated.' : 'Rule created.');
        this.refresh.bump();
      },
      error: (err: unknown) => {
        const apiError = ApiError.from(err);
        this.saving.set(false);
        if (apiError.code === 'rule_exists')
          this.serverErrors.set({
            pattern: ['A rule for this text already exists.'],
          });
        else if (apiError.hasFieldErrors)
          this.serverErrors.set(apiError.errors);
        if (apiError.code === 'concurrency_conflict') this.refresh.bump();
      },
    });
  }

  /** Counts the matching past transactions first, then asks before changing anything. */
  protected applyToPast(rule: RuleDto): void {
    this.applying.set(rule.id);
    this.api.apply(rule.id, { dryRun: true }).subscribe({
      next: (preview) => {
        this.applying.set(null);
        if (preview.matchedCount === 0) {
          this.toast.info('No past transactions need changing for this rule.');
          return;
        }
        void this.confirmApply(rule, preview.matchedCount);
      },
      error: () => this.applying.set(null),
    });
  }

  private async confirmApply(rule: RuleDto, count: number): Promise<void> {
    const category = rule.parentCategoryName
      ? `${rule.parentCategoryName} › ${rule.categoryName}`
      : rule.categoryName;
    const ok = await this.confirm.confirm({
      title: `Update ${count} transaction${count === 1 ? '' : 's'}?`,
      message: `They will move to “${category}”, including any you categorised by hand.`,
      confirmText: 'Update',
      tone: 'primary',
    });
    if (!ok) return;

    this.applying.set(rule.id);
    this.api.apply(rule.id, { dryRun: false }).subscribe({
      next: (result) => {
        this.applying.set(null);
        this.toast.success(
          `${result.updatedCount} transaction${result.updatedCount === 1 ? '' : 's'} updated.`,
        );
        this.refresh.bump();
      },
      error: () => this.applying.set(null),
    });
  }

  protected async remove(rule: RuleDto): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Delete this rule?',
      message:
        'Transactions already categorised by it keep their category. Future imports will not use it.',
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;

    this.api.delete(rule.id).subscribe({
      next: () => {
        this.toast.success('Rule deleted.');
        this.refresh.bump();
      },
    });
  }
}
