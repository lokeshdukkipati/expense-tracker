import { ChangeDetectionStrategy, Component, DestroyRef, Pipe, PipeTransform, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { formatMoney } from '../../core/utils/format';

const reduced = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animated number: counts up from the previous value to the new one. */
@Component({
  selector: 'app-count-up',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ text() }}`,
  host: { class: 'num' },
})
export class CountUpComponent {
  readonly value = input.required<number>();
  readonly format = input<(n: number) => string>((n) => String(Math.round(n)));
  readonly duration = input(750);

  protected readonly display = signal(0);
  protected readonly text = computed(() => this.format()(this.display()));

  private frame = 0;

  constructor() {
    effect(() => {
      const target = this.value();
      untracked(() => this.run(Number.isFinite(target) ? target : 0));
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  private run(target: number): void {
    cancelAnimationFrame(this.frame);
    const from = this.display();
    if (reduced() || from === target) {
      this.display.set(target);
      return;
    }

    const start = performance.now();
    const duration = this.duration();
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.display.set(from + (target - from) * eased);
      if (t < 1) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }
}

/** Animated currency amount in the user's currency. */
@Component({
  selector: 'app-money',
  imports: [CountUpComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-count-up [value]="value()" [format]="fmt()" [duration]="duration()" />`,
  host: { class: 'money' },
})
export class MoneyComponent {
  private readonly auth = inject(AuthService);

  readonly value = input.required<number>();
  readonly compact = input(false);
  readonly signed = input(false);
  readonly decimals = input<number | undefined>(undefined);
  readonly duration = input(750);
  readonly currency = input<string | undefined>(undefined);

  protected readonly fmt = computed(() => {
    const currency = this.currency() ?? this.auth.currency();
    const options = { compact: this.compact(), signed: this.signed(), decimals: this.decimals() };
    return (n: number) => formatMoney(n, currency, options);
  });
}

/** Static currency text: `{{ amount | money }}`, `| money:'compact'`, `| money:'signed'`. */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly auth = inject(AuthService);

  transform(value: number | null | undefined, mode: '' | 'compact' | 'signed' = '', currency?: string): string {
    return formatMoney(value ?? 0, currency ?? this.auth.currency(), { compact: mode === 'compact', signed: mode === 'signed' });
  }
}
