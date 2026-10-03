import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { useWidth } from './chart-utils';

export interface FlowItem {
  label: string;
  value: number;
  color: string;
}

interface Ribbon {
  path: string;
  gradient: string;
  index: number;
}

/**
 * "Money flow": income on the left fans out into spending categories and savings on the right.
 * When spending exceeds income, the shortfall appears as a second source ("From savings").
 */
@Component({
  selector: 'app-sankey',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flow">
      <svg [attr.width]="width()" [attr.height]="layout().height" [attr.viewBox]="'0 0 ' + width() + ' ' + layout().height" role="img" aria-label="Money flow from income to spending and savings">
        <defs>
          @for (r of layout().ribbons; track r.index) {
            <linearGradient [attr.id]="'sk' + r.index" x1="0" x2="1">
              <stop offset="0" [attr.stop-color]="r.gradient" stop-opacity=".55" />
              <stop offset="1" [attr.stop-color]="layout().rights[r.index].color" stop-opacity=".55" />
            </linearGradient>
          }
        </defs>

        @for (r of layout().ribbons; track r.index) {
          <path class="ribbon" [class.dim]="hover() !== null && hover() !== r.index" [attr.d]="r.path" [attr.fill]="'url(#sk' + r.index + ')'" [style.--i]="r.index"
                (pointerenter)="hover.set(r.index)" (pointerleave)="hover.set(null)" />
        }
        @for (n of layout().lefts; track n.label) {
          <rect class="node" [attr.x]="0" [attr.y]="n.y" [attr.width]="nodeWidth" [attr.height]="n.h" rx="4" [attr.fill]="n.color" />
          <text class="lbl-left" [attr.x]="nodeWidth + 8" [attr.y]="n.y + n.h / 2 - 2">{{ n.label }}</text>
          <text class="val-left" [attr.x]="nodeWidth + 8" [attr.y]="n.y + n.h / 2 + 13">{{ format()(n.value) }}</text>
        }
        @for (n of layout().rights; track n.label; let i = $index) {
          <rect class="node" [class.dim]="hover() !== null && hover() !== i" [attr.x]="layout().rightX" [attr.y]="n.y" [attr.width]="nodeWidth" [attr.height]="n.h" rx="4" [attr.fill]="n.color"
                (pointerenter)="hover.set(i)" (pointerleave)="hover.set(null)" />
          <text class="lbl" [class.dim]="hover() !== null && hover() !== i" [attr.x]="layout().rightX + nodeWidth + 8" [attr.y]="n.y + Math.max(n.h / 2, 12) - 1">{{ n.label }}</text>
          <text class="val" [class.dim]="hover() !== null && hover() !== i" [attr.x]="layout().rightX + nodeWidth + 8" [attr.y]="n.y + Math.max(n.h / 2, 12) + 13">{{ format()(n.value) }} · {{ n.percent }}%</text>
        }
      </svg>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    svg { display: block; overflow: visible; }
    .ribbon { transition: opacity .2s; animation: fadeIn .9s both; animation-delay: calc(var(--i) * 80ms + 150ms); }
    .ribbon.dim, .node.dim, .lbl.dim, .val.dim { opacity: .25; }
    .node { transition: opacity .2s; animation: fadeIn .6s both; }
    text { font-size: 12px; fill: var(--text); transition: opacity .2s; }
    .val, .val-left { fill: var(--muted); font-size: 11px; }
    .lbl-left { font-weight: 650; }
  `],
})
export class SankeyComponent {
  readonly income = input.required<number>();
  readonly flows = input.required<readonly FlowItem[]>();
  readonly format = input<(n: number) => string>((n) => String(Math.round(n)));
  readonly maxFlows = input(6);

  protected readonly Math = Math;
  protected readonly nodeWidth = 12;
  protected readonly width = useWidth(520);
  protected readonly hover = signal<number | null>(null);

  protected readonly layout = computed(() => {
    const width = this.width();
    const gap = 10;
    const income = Math.max(0, this.income());

    // Top N categories, the rest grouped into "Other".
    const sorted = [...this.flows()].filter((f) => f.value > 0).sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, this.maxFlows());
    const rest = sorted.slice(this.maxFlows()).reduce((sum, f) => sum + f.value, 0);
    const items: FlowItem[] = rest > 0 ? [...top, { label: 'Other', value: rest, color: '#64748b' }] : top;

    const spent = items.reduce((sum, f) => sum + f.value, 0);
    const saved = Math.max(0, income - spent);
    const deficit = Math.max(0, spent - income);
    if (saved > 0) items.push({ label: 'Saved', value: saved, color: '#34d399' });

    const total = items.reduce((sum, f) => sum + f.value, 0);
    const height = Math.max(240, Math.min(440, items.length * 46 + 20));
    const scale = total > 0 ? (height - gap * (items.length - 1)) / total : 0;

    const labelWidth = Math.min(190, Math.max(110, width * 0.4));
    const rightX = Math.max(80, width - labelWidth - this.nodeWidth);

    const lefts = [{ label: 'Income', value: income, color: '#7c6cff', y: 0, h: 0 }];
    if (deficit > 0) lefts.push({ label: 'From savings', value: deficit, color: '#fbbf24', y: 0, h: 0 });
    const leftTotalH = total * scale;
    let ly = (height - leftTotalH) / 2;
    for (const n of lefts) {
      n.h = Math.max(6, n.value * scale);
      n.y = ly;
      ly += n.h;
    }

    const rights = items.map((item) => ({ ...item, y: 0, h: Math.max(6, item.value * scale), percent: total > 0 ? Math.round((item.value / total) * 100) : 0 }));
    const rightsHeight = rights.reduce((sum, n) => sum + n.h, 0) + gap * (rights.length - 1);
    let ry = Math.max(0, (height - rightsHeight) / 2);
    for (const n of rights) {
      n.y = ry;
      ry += n.h + gap;
    }

    // Ribbons: fill each right node from the sources in order (income first, then the shortfall).
    const cursors = lefts.map((n) => ({ y: n.y, remaining: n.value }));
    const x0 = this.nodeWidth;
    const x1 = rightX;
    const mid = (x0 + x1) / 2;
    const ribbons: Ribbon[] = [];

    rights.forEach((node, index) => {
      let need = node.value;
      let targetY = node.y;
      const targetPerValue = need > 0 ? node.h / need : 0;

      while (need > 0.0001) {
        const sourceIndex = cursors.findIndex((c) => c.remaining > 0.0001);
        if (sourceIndex === -1) break;
        const source = cursors[sourceIndex];
        const take = Math.min(need, source.remaining);

        const sh = take * scale;
        const th = take * targetPerValue;
        const sy = source.y;
        ribbons.push({
          index,
          gradient: lefts[sourceIndex].color,
          path: `M${x0},${sy}C${mid},${sy} ${mid},${targetY} ${x1},${targetY}L${x1},${targetY + th}C${mid},${targetY + th} ${mid},${sy + sh} ${x0},${sy + sh}Z`,
        });

        source.y += sh;
        source.remaining -= take;
        targetY += th;
        need -= take;
      }
    });

    return { height, lefts, rights, rightX, ribbons: mergeByIndex(ribbons) };
  });
}

/** One gradient per right node: keep the first source's colour, draw every ribbon segment under the same index. */
function mergeByIndex(ribbons: Ribbon[]): Ribbon[] {
  const seen = new Map<number, Ribbon>();
  for (const r of ribbons) {
    const existing = seen.get(r.index);
    if (existing) existing.path += r.path;
    else seen.set(r.index, { ...r });
  }
  return [...seen.values()];
}
