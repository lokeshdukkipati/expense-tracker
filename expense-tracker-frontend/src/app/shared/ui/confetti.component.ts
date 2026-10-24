import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injectable,
  NgZone,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { MotionService } from '../../core/services/motion.service';

export interface ConfettiOptions {
  /** Number of pieces (max 160). */
  count?: number;
  /** Where the burst starts, as a fraction of the screen (0-1). Default: horizontally centred, upper third. */
  x?: number;
  y?: number;
  /** Colours to use. Default: the app's current accent palette. */
  colors?: string[];
  /** Width of the fan in radians (Math.PI * 2 sprays in every direction). Default about 200 degrees, aimed upwards. */
  spread?: number;
}

/** Fires a celebration. Does nothing when the user prefers reduced motion. */
@Injectable({ providedIn: 'root' })
export class ConfettiService {
  private readonly motion = inject(MotionService);
  readonly request = signal<{ id: number; options: ConfettiOptions } | null>(
    null,
  );
  private nextId = 0;

  burst(options: ConfettiOptions = {}): void {
    if (this.motion.reduced()) return;
    this.request.set({ id: ++this.nextId, options });
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
  age: number;
  ttl: number;
  round: boolean;
}

const FALLBACK_COLORS = ['#7c6cff', '#f472b6', '#22d3ee', '#34d399', '#fbbf24'];

/** Mount once near the app root. It draws bursts requested through <see cref="ConfettiService"/>. */
@Component({
  selector: 'app-confetti-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #canvas aria-hidden="true"></canvas>`,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 3500;
        pointer-events: none;
      }
      canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class ConfettiHostComponent {
  private readonly service = inject(ConfettiService);
  private readonly zone = inject(NgZone);
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');

  private particles: Particle[] = [];
  private frame = 0;
  private last = 0;

  constructor() {
    effect(() => {
      const request = this.service.request();
      if (request) {
        untracked(() =>
          this.zone.runOutsideAngular(() => this.spawn(request.options)),
        );
      }
    });

    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
  }

  private spawn(options: ConfettiOptions): void {
    const canvas = this.canvas()?.nativeElement;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const styles = getComputedStyle(document.documentElement);
    const themed = ['--primary', '--pink', '--accent', '--success', '--warning']
      .map((name) => styles.getPropertyValue(name).trim())
      .filter((value) => value.length > 0);
    const palette = options.colors?.length
      ? options.colors
      : themed.length > 0
        ? themed
        : FALLBACK_COLORS;

    const count = Math.min(options.count ?? 90, 160);
    const originX = (options.x ?? 0.5) * width;
    const originY = (options.y ?? 0.35) * height;
    const spread = options.spread ?? Math.PI * 1.15;

    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const speed = 6 + Math.random() * 9;
      this.particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 6 + Math.random() * 6,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.4,
        color: palette[i % palette.length] ?? FALLBACK_COLORS[0]!,
        age: 0,
        ttl: 90 + Math.random() * 60,
        round: Math.random() < 0.3,
      });
    }

    if (this.frame === 0) {
      this.last = performance.now();
      this.frame = requestAnimationFrame((now) =>
        this.tick(now, context, width, height),
      );
    }
  }

  private tick(
    now: number,
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const step = Math.min((now - this.last) / 16.67, 2.5); // in 60 fps frames, so speed is the same on any display
    this.last = now;

    context.clearRect(0, 0, width, height);
    this.particles = this.particles.filter(
      (p) => p.age < p.ttl && p.y < height + 30,
    );

    for (const p of this.particles) {
      p.age += step;
      p.vy += 0.32 * step;
      p.vx *= Math.pow(0.985, step);
      p.vy *= Math.pow(0.992, step);
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.rotation += p.spin * step;

      context.save();
      context.globalAlpha = Math.max(0, Math.min(1, (p.ttl - p.age) / 25));
      context.translate(p.x, p.y);
      context.rotate(p.rotation);
      context.fillStyle = p.color;
      if (p.round) {
        context.beginPath();
        context.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.6);
      }
      context.restore();
    }

    if (this.particles.length > 0) {
      this.frame = requestAnimationFrame((time) =>
        this.tick(time, context, width, height),
      );
    } else {
      this.frame = 0;
      context.clearRect(0, 0, width, height);
    }
  }
}
