import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar" role="progressbar" [attr.aria-valuenow]="shown()" aria-valuemin="0" aria-valuemax="100">
      <div class="fill" [class]="tone()" [style.width.%]="shown()"></div>
      @if (marker() !== null) { <i class="marker" [style.left.%]="marker()"></i> }
    </div>
  `,
  styles: [`
    .bar { position: relative; height: 10px; border-radius: 999px; background: var(--grid); overflow: visible; }
    .fill { height: 100%; border-radius: inherit; transition: width .9s cubic-bezier(.2, .9, .3, 1); animation: growX .9s cubic-bezier(.2, .9, .3, 1) both; transform-origin: left; }
    .OnTrack { background: linear-gradient(90deg, #10b981, #34d399); }
    .Warning { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
    .Exceeded { background: linear-gradient(90deg, #f43f5e, #fb7185); }
    .primary { background: var(--grad); }
    .marker { position: absolute; top: -3px; width: 2px; height: 16px; border-radius: 2px; background: var(--text); opacity: .7; transform: translateX(-1px); }
  `],
})
export class ProgressBarComponent {
  readonly value = input.required<number>();
  readonly tone = input<'OnTrack' | 'Warning' | 'Exceeded' | 'primary'>('primary');
  /** Optional marker, e.g. the alert threshold or projected spend (percent). */
  readonly marker = input<number | null>(null);

  protected readonly shown = computed(() => Math.max(0, Math.min(100, this.value())));
}
