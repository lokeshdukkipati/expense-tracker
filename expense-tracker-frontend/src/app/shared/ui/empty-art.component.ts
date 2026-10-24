import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type EmptyArtKind =
  | 'transactions'
  | 'goals'
  | 'search'
  | 'rules'
  | 'badges'
  | 'generic';

/**
 * Small animated illustrations for empty screens, drawn in the current accent colour.
 * Use on its own, or above the text of an empty state.
 */
@Component({
  selector: 'app-empty-art',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size() * 0.8',
    'aria-hidden': 'true',
  },
  template: `
    <svg
      viewBox="0 0 200 160"
      width="100%"
      height="100%"
      fill="none"
      focusable="false"
    >
      <defs>
        <linearGradient id="empty-art-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style="stop-color: var(--primary)" />
          <stop offset="100%" style="stop-color: var(--pink)" />
        </linearGradient>
      </defs>

      <ellipse class="shadow" cx="100" cy="144" rx="60" ry="7" />

      @switch (kind()) {
        @case ('transactions') {
          <g class="float">
            <rect class="panel" x="54" y="20" width="92" height="112" rx="14" />
            <rect
              x="68"
              y="38"
              width="40"
              height="8"
              rx="4"
              fill="url(#empty-art-grad)"
            />
            <rect class="line" x="68" y="58" width="64" height="6" rx="3" />
            <rect class="line" x="68" y="72" width="54" height="6" rx="3" />
            <rect class="line" x="68" y="86" width="60" height="6" rx="3" />
            <circle cx="128" cy="112" r="19" fill="url(#empty-art-grad)" />
            <path
              d="M128 102v20 M122 108h8a3 3 0 0 1 0 6h-6a3 3 0 0 0 0 6h9"
              stroke="#fff"
              stroke-width="3"
              stroke-linecap="round"
            />
          </g>
        }
        @case ('goals') {
          <g class="float">
            <circle class="panel" cx="100" cy="78" r="50" />
            <circle
              cx="100"
              cy="78"
              r="36"
              stroke="url(#empty-art-grad)"
              stroke-width="6"
              opacity=".35"
            />
            <circle
              cx="100"
              cy="78"
              r="22"
              stroke="url(#empty-art-grad)"
              stroke-width="6"
              opacity=".6"
            />
            <circle cx="100" cy="78" r="8" fill="url(#empty-art-grad)" />
            <path
              d="M100 78l34-34"
              stroke="url(#empty-art-grad)"
              stroke-width="4"
              stroke-linecap="round"
            />
            <path d="M128 36l14-4-4 14z" fill="url(#empty-art-grad)" />
          </g>
        }
        @case ('search') {
          <g class="float">
            <rect class="panel" x="46" y="26" width="88" height="96" rx="14" />
            <rect class="line" x="60" y="44" width="52" height="6" rx="3" />
            <rect class="line" x="60" y="58" width="40" height="6" rx="3" />
            <rect class="line" x="60" y="72" width="48" height="6" rx="3" />
            <circle
              cx="132"
              cy="92"
              r="22"
              fill="var(--panel-solid)"
              stroke="url(#empty-art-grad)"
              stroke-width="6"
            />
            <path
              d="M148 108l18 18"
              stroke="url(#empty-art-grad)"
              stroke-width="7"
              stroke-linecap="round"
            />
          </g>
        }
        @case ('rules') {
          <g class="float">
            <rect class="panel" x="48" y="46" width="104" height="64" rx="14" />
            <rect class="line" x="62" y="62" width="48" height="7" rx="3.5" />
            <rect
              x="62"
              y="80"
              width="30"
              height="14"
              rx="7"
              fill="url(#empty-art-grad)"
              opacity=".85"
            />
            <path
              d="M118 112l30-52"
              stroke="url(#empty-art-grad)"
              stroke-width="7"
              stroke-linecap="round"
            />
            <path
              d="M152 52l6-10 M162 62l10-4 M146 42l-4-10"
              stroke="url(#empty-art-grad)"
              stroke-width="3"
              stroke-linecap="round"
            />
          </g>
        }
        @case ('badges') {
          <g class="float">
            <path
              d="M80 28h40l-8 38H88z"
              fill="url(#empty-art-grad)"
              opacity=".4"
            />
            <circle cx="100" cy="86" r="34" fill="url(#empty-art-grad)" />
            <circle
              cx="100"
              cy="86"
              r="25"
              stroke="#fff"
              stroke-width="3"
              opacity=".6"
            />
            <path
              d="M100 70l5 10 11 1.6-8 7.8 2 11-10-5.4-10 5.4 2-11-8-7.8 11-1.6z"
              fill="#fff"
            />
          </g>
        }
        @default {
          <g class="float">
            <rect
              class="panel"
              x="58"
              y="40"
              width="92"
              height="70"
              rx="14"
              transform="rotate(8 104 75)"
            />
            <rect
              class="panel"
              x="50"
              y="34"
              width="92"
              height="70"
              rx="14"
              transform="rotate(-4 96 69)"
            />
            <rect
              x="64"
              y="52"
              width="40"
              height="8"
              rx="4"
              fill="url(#empty-art-grad)"
            />
            <rect class="line" x="64" y="70" width="64" height="6" rx="3" />
            <rect class="line" x="64" y="84" width="48" height="6" rx="3" />
          </g>
        }
      }

      <path
        class="spark s1"
        d="M32 38l2.4 6.6L41 47l-6.6 2.4L32 56l-2.4-6.6L23 47l6.6-2.4z"
      />
      <path
        class="spark s2"
        d="M168 24l1.8 5 5 1.8-5 1.8-1.8 5-1.8-5-5-1.8 5-1.8z"
      />
      <circle class="spark s3" cx="172" cy="104" r="3.5" />
      <circle class="spark s1" cx="28" cy="110" r="3" />
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-block;
        max-width: 100%;
      }
      .shadow {
        fill: var(--primary);
        opacity: 0.12;
      }
      .panel {
        fill: var(--panel-solid);
        stroke: var(--border-strong);
        stroke-width: 1.5;
      }
      .line {
        fill: var(--surface-2);
      }
      .float {
        animation: float 5s ease-in-out infinite;
        transform-box: fill-box;
        transform-origin: center;
      }
      .spark {
        fill: var(--primary-2);
        transform-box: fill-box;
        transform-origin: center;
        animation: twinkle 2.6s ease-in-out infinite;
      }
      .s2 {
        animation-delay: -0.9s;
        fill: var(--pink);
      }
      .s3 {
        animation-delay: -1.7s;
        fill: var(--accent);
      }
      @keyframes twinkle {
        0%,
        100% {
          opacity: 0.25;
          transform: scale(0.7);
        }
        50% {
          opacity: 1;
          transform: scale(1.15);
        }
      }
    `,
  ],
})
export class EmptyArtComponent {
  readonly kind = input<EmptyArtKind>('generic');
  readonly size = input(168);
}
