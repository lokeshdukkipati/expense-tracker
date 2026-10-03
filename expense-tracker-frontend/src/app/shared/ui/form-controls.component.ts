import { ChangeDetectionStrategy, Component, ElementRef, computed, input, model, output, signal, viewChild } from '@angular/core';
import { SortState } from '../../core/utils/table-state';
import { IconComponent, IconName } from './icon.component';

@Component({
  selector: 'app-search-box',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="search">
      <app-icon name="search" [size]="16" />
      <input #box type="text" [value]="value()" [placeholder]="placeholder()" [attr.aria-label]="placeholder()" autocomplete="off" spellcheck="false"
             (input)="onInput($event)" (keydown.escape)="clear()" />
      @if (value()) {
        <button type="button" aria-label="Clear search" (click)="clear()"><app-icon name="x" [size]="14" /></button>
      }
    </label>
  `,
  styles: [`
    .search { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--border);
      background: var(--field); color: var(--muted); transition: border-color .2s, box-shadow .2s; }
    .search:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); color: var(--primary-2); }
    input { flex: 1; min-width: 0; background: none; border: 0; outline: 0; color: var(--text); font: inherit; }
    input::placeholder { color: var(--faint); }
    button { display: grid; place-items: center; background: var(--surface-2); border: 0; color: var(--muted); border-radius: 50%; width: 22px; height: 22px; cursor: pointer; }
    button:hover { color: var(--text); }
  `],
})
export class SearchBoxComponent {
  readonly value = model('');
  readonly placeholder = input('Search…');

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }

  protected clear(): void {
    this.value.set('');
  }
}

export interface SegmentOption {
  value: string;
  label: string;
  icon?: IconName;
}

/** Segmented control with a sliding highlight. */
@Component({
  selector: 'app-segmented',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[style.--n]': 'options().length', '[style.--i]': 'index()', '[attr.data-tone]': 'tone()' },
  template: `
    <div class="seg" role="tablist">
      <i class="thumb"></i>
      @for (o of options(); track o.value) {
        <button type="button" role="tab" [class.on]="o.value === value()" [attr.aria-selected]="o.value === value()" (click)="value.set(o.value)">
          @if (o.icon) { <app-icon [name]="o.icon" [size]="15" /> }
          <span>{{ o.label }}</span>
        </button>
      }
    </div>
  `,
  styles: [`
    :host { display: inline-block; }
    :host(.block) { display: block; }
    .seg { position: relative; display: grid; grid-template-columns: repeat(var(--n), 1fr); padding: 4px; border-radius: 14px; background: var(--field); border: 1px solid var(--border); }
    .thumb { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc((100% - 8px) / var(--n)); border-radius: 10px; background: var(--grad);
      box-shadow: 0 8px 20px -8px var(--primary); transform: translateX(calc(var(--i) * 100%)); transition: transform .35s cubic-bezier(.3, 1.2, .4, 1), background .3s; }
    :host([data-tone='income']) .thumb { background: linear-gradient(135deg, #10b981, #34d399); box-shadow: 0 8px 20px -8px var(--success); }
    :host([data-tone='expense']) .thumb { background: linear-gradient(135deg, #f43f5e, #fb7185); box-shadow: 0 8px 20px -8px var(--danger); }
    button { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 0 14px; border: 0; background: none;
      color: var(--muted); font: inherit; font-weight: 600; font-size: .9rem; cursor: pointer; border-radius: 10px; transition: color .25s; white-space: nowrap; }
    button.on { color: #fff; }
    button:not(.on):hover { color: var(--text); }
  `],
})
export class SegmentedComponent {
  readonly options = input.required<readonly SegmentOption[]>();
  readonly value = model<string>('');
  readonly tone = input<'' | 'income' | 'expense'>('');

  protected readonly index = computed(() => Math.max(0, this.options().findIndex((o) => o.value === this.value())));
}

/** Tag input: Enter or comma adds, Backspace removes the last. Tags are lower-cased, max 10, 30 characters each. */
@Component({
  selector: 'app-chip-input',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chips" (click)="input().nativeElement.focus()">
      @for (t of tags(); track t) {
        <span class="chip">#{{ t }}<button type="button" [attr.aria-label]="'Remove ' + t" (click)="remove(t); $event.stopPropagation()"><app-icon name="x" [size]="12" /></button></span>
      }
      <input #inp type="text" [value]="draft()" [placeholder]="tags().length ? '' : placeholder()" maxlength="30" aria-label="Add tag"
             (input)="draft.set(inp.value)" (keydown)="onKey($event)" (blur)="commit()" [disabled]="tags().length >= max" />
    </div>
  `,
  styles: [`
    .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 42px; padding: 6px 10px; border-radius: 12px; border: 1px solid var(--border); background: var(--field); cursor: text;
      transition: border-color .2s, box-shadow .2s; }
    .chips:focus-within { border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }
    .chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 4px 3px 10px; border-radius: 999px; font-size: .8rem; font-weight: 600; color: var(--primary-2);
      background: color-mix(in srgb, var(--primary) 16%, transparent); animation: pop .2s both; }
    .chip button { display: grid; place-items: center; width: 18px; height: 18px; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
    .chip button:hover { background: color-mix(in srgb, var(--primary) 30%, transparent); }
    input { flex: 1; min-width: 90px; background: none; border: 0; outline: 0; color: var(--text); font: inherit; font-size: .9rem; }
  `],
})
export class ChipInputComponent {
  readonly tags = model<string[]>([]);
  readonly placeholder = input('Add tags (press Enter)');

  protected readonly max = 10;
  protected readonly draft = signal('');
  protected readonly input = viewChild.required<ElementRef<HTMLInputElement>>('inp');

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.commit();
    } else if (event.key === 'Backspace' && !this.draft() && this.tags().length) {
      this.tags.update((t) => t.slice(0, -1));
    }
  }

  protected commit(): void {
    const tag = this.draft().trim().replace(/^#/, '').toLowerCase().slice(0, 30);
    this.draft.set('');
    this.input().nativeElement.value = '';
    if (tag && !this.tags().includes(tag) && this.tags().length < this.max) this.tags.update((t) => [...t, tag]);
  }

  protected remove(tag: string): void {
    this.tags.update((t) => t.filter((x) => x !== tag));
  }
}

/** Table header cell content that toggles sorting. */
@Component({
  selector: 'app-sort-header',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="sh" [class.on]="active()" [class.right]="align() === 'right'" (click)="toggle.emit(key())">
      <span>{{ label() }}</span>
      <app-icon class="arr" [class.desc]="active() && sort()?.dir === 'desc'" [name]="active() ? 'arrow-up' : 'chevron-down'" [size]="13" />
    </button>
  `,
  styles: [`
    .sh { display: inline-flex; align-items: center; gap: 4px; background: none; border: 0; padding: 0; color: inherit; font: inherit; font-weight: inherit;
      text-transform: inherit; letter-spacing: inherit; cursor: pointer; }
    .sh.right { flex-direction: row-reverse; }
    .sh:hover { color: var(--text); }
    .sh.on { color: var(--primary-2); }
    .arr { opacity: .35; transition: transform .25s, opacity .2s; }
    .on .arr { opacity: 1; }
    .arr.desc { transform: rotate(180deg); }
  `],
})
export class SortHeaderComponent {
  readonly label = input.required<string>();
  readonly key = input.required<string>();
  readonly sort = input<SortState | null>(null);
  readonly align = input<'left' | 'right'>('left');
  readonly toggle = output<string>();

  protected readonly active = computed(() => this.sort()?.key === this.key());
}
