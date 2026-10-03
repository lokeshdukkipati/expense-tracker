import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, computed, effect, inject, input, model, signal, viewChild,
} from '@angular/core';
import { IconComponent } from './icon.component';

export interface SelectOption {
  value: string | number | null;
  label: string;
  hint?: string;
  color?: string | null;
}

/**
 * Accessible dropdown (button + listbox). The list is moved to <body> while open, so it is never clipped by
 * cards or scroll containers, and flips upwards when there is no room below.
 */
@Component({
  selector: 'app-select',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.block]': 'block()' },
  template: `
    <button type="button" class="sel-btn" #trigger [class.open]="open()" [class.sm]="size() === 'sm'" [disabled]="disabled()"
            [attr.aria-expanded]="open()" aria-haspopup="listbox" [attr.aria-label]="ariaLabel() || placeholder()"
            (click)="toggle()" (keydown)="onKey($event)">
      @if (selected(); as s) {
        @if (s.color) { <i class="dot" [style.background]="s.color"></i> }
        <span class="txt">{{ s.label }}</span>
      } @else {
        <span class="txt ph">{{ placeholder() }}</span>
      }
      @if (clearable() && selected()) {
        <span class="clr" role="button" aria-label="Clear" (click)="clear($event)"><app-icon name="x" [size]="14" /></span>
      }
      <app-icon class="chev" name="chevron-down" [size]="16" />
    </button>

    @if (open()) {
      <div class="panel" #panel role="listbox" [style.left.px]="pos().left" [style.top.px]="pos().top" [style.bottom.px]="pos().bottom"
           [style.min-width.px]="pos().width" [class.up]="pos().up">
        @if (searchable()) {
          <label class="search">
            <app-icon name="search" [size]="14" />
            <input #searchInput type="text" placeholder="Search…" [value]="query()" (input)="onQuery($event)" (keydown)="onKey($event)" />
          </label>
        }
        <ul>
          @for (o of filtered(); track o.value; let i = $index) {
            <li role="option" [class.active]="i === highlight()" [class.selected]="o.value === value()" [attr.aria-selected]="o.value === value()"
                (click)="choose(o)" (mouseenter)="highlight.set(i)">
              @if (o.color) { <i class="dot" [style.background]="o.color"></i> }
              <span class="lbl">{{ o.label }}</span>
              @if (o.hint) { <small>{{ o.hint }}</small> }
              @if (o.value === value()) { <app-icon name="check" [size]="14" /> }
            </li>
          } @empty {
            <li class="none">No results</li>
          }
        </ul>
      </div>
    }
  `,
  styles: [`
    :host { display: inline-block; position: relative; }
    :host(.block) { display: block; width: 100%; }
    .sel-btn { display: inline-flex; align-items: center; gap: 8px; width: 100%; min-height: 42px; padding: 0 12px; border-radius: 12px;
      border: 1px solid var(--border); background: var(--field); color: var(--text); font: inherit; cursor: pointer; text-align: left;
      transition: border-color .2s, box-shadow .2s, background .2s; }
    .sel-btn.sm { min-height: 34px; padding: 0 10px; font-size: .85rem; border-radius: 10px; }
    .sel-btn:hover { border-color: var(--border-strong); }
    .sel-btn:focus-visible, .sel-btn.open { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }
    .sel-btn:disabled { opacity: .55; cursor: not-allowed; }
    .txt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ph { color: var(--faint); }
    .chev { color: var(--muted); transition: transform .25s cubic-bezier(.2,.8,.2,1); }
    .open .chev { transform: rotate(180deg); }
    .clr { display: inline-flex; color: var(--muted); border-radius: 6px; padding: 2px; }
    .clr:hover { color: var(--text); background: var(--surface-2); }
    .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
    .panel { position: fixed; z-index: 1000; max-height: 320px; display: flex; flex-direction: column; border-radius: 14px;
      background: var(--panel); border: 1px solid var(--border-strong); box-shadow: var(--shadow-lg); backdrop-filter: blur(18px);
      animation: pop .16s cubic-bezier(.2,.8,.2,1) both; transform-origin: top center; overflow: hidden; }
    .panel.up { transform-origin: bottom center; }
    .search { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border); color: var(--muted); }
    .search input { flex: 1; min-width: 0; background: none; border: 0; outline: 0; color: var(--text); font: inherit; font-size: .9rem; }
    ul { list-style: none; margin: 0; padding: 6px; overflow-y: auto; overscroll-behavior: contain; }
    li { display: flex; align-items: center; gap: 8px; padding: 9px 10px; border-radius: 9px; cursor: pointer; font-size: .9rem; color: var(--text); }
    li .lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    li small { color: var(--faint); }
    li.active { background: var(--surface-2); }
    li.selected { color: var(--primary-2); font-weight: 600; }
    li.none { color: var(--faint); cursor: default; justify-content: center; }
  `],
})
export class SelectComponent {
  readonly options = input.required<readonly SelectOption[]>();
  readonly value = model<string | number | null>(null);
  readonly placeholder = input('Select…');
  readonly ariaLabel = input('');
  readonly searchable = input(false);
  readonly clearable = input(false);
  readonly disabled = input(false);
  readonly block = input(true);
  readonly up = input(false);
  readonly size = input<'md' | 'sm'>('md');

  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly highlight = signal(0);
  protected readonly pos = signal<{ left: number; top: number | null; bottom: number | null; width: number; up: boolean }>(
    { left: 0, top: 0, bottom: null, width: 0, up: false });

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private moved = false;

  protected readonly selected = computed(() => this.options().find((o) => o.value === this.value()) ?? null);
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.options().filter((o) => o.label.toLowerCase().includes(q)) : this.options();
  });

  private readonly onScroll = (event: Event): void => {
    const panel = this.panel()?.nativeElement;
    if (panel && event.target instanceof Node && panel.contains(event.target)) return;
    this.close();
  };

  constructor() {
    // Move the open list to <body> so no ancestor can clip it.
    effect(() => {
      const el = this.panel()?.nativeElement;
      if (el && !this.moved) {
        document.body.appendChild(el);
        this.moved = true;
        this.searchInput()?.nativeElement.focus();
        queueMicrotask(() => this.scrollToActive());
      }
      if (!el) this.moved = false;
    });

    inject(DestroyRef).onDestroy(() => this.detach());
  }

  @HostListener('document:pointerdown', ['$event'])
  protected onOutside(event: PointerEvent): void {
    if (!this.open()) return;
    const target = event.target as Node;
    if (this.host.nativeElement.contains(target) || this.panel()?.nativeElement.contains(target)) return;
    this.close();
  }

  @HostListener('window:resize')
  protected onResize(): void {
    if (this.open()) this.close();
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.openPanel();
  }

  private openPanel(): void {
    const rect = this.trigger().nativeElement.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const goUp = this.up() || (spaceBelow < 280 && rect.top > spaceBelow);
    const width = Math.max(rect.width, 200);
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));

    this.pos.set(goUp
      ? { left, top: null, bottom: window.innerHeight - rect.top + 6, width, up: true }
      : { left, top: rect.bottom + 6, bottom: null, width, up: false });

    this.query.set('');
    const index = this.options().findIndex((o) => o.value === this.value());
    this.highlight.set(Math.max(0, index));
    this.open.set(true);
    window.addEventListener('scroll', this.onScroll, true);
  }

  protected close(): void {
    this.open.set(false);
    this.detach();
  }

  private detach(): void {
    window.removeEventListener('scroll', this.onScroll, true);
  }

  protected choose(option: SelectOption): void {
    this.value.set(option.value);
    this.close();
    this.trigger().nativeElement.focus();
  }

  protected clear(event: Event): void {
    event.stopPropagation();
    this.value.set(null);
  }

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.highlight.set(0);
  }

  protected onKey(event: KeyboardEvent): void {
    const list = this.filtered();
    if (!this.open()) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        this.openPanel();
      }
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.highlight.set(Math.min(list.length - 1, this.highlight() + 1));
        this.scrollToActive();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.highlight.set(Math.max(0, this.highlight() - 1));
        this.scrollToActive();
        break;
      case 'Home':
        this.highlight.set(0);
        break;
      case 'End':
        this.highlight.set(Math.max(0, list.length - 1));
        break;
      case 'Enter': {
        event.preventDefault();
        const option = list[this.highlight()];
        if (option) this.choose(option);
        break;
      }
      case 'Escape':
      case 'Tab':
        this.close();
        break;
    }
  }

  private scrollToActive(): void {
    this.panel()?.nativeElement.querySelector('li.active')?.scrollIntoView({ block: 'nearest' });
  }
}
