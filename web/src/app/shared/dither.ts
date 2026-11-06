import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input } from '@angular/core';

/**
 * Pixel material drawn in code: a smooth field quantised to a short palette with
 * ordered (Bayer 4x4) dithering, painted one canvas pixel per cell and scaled up
 * with nearest-neighbour so the cells stay crisp. Static; redrawn on resize.
 */
export type DitherKind = 'cloud' | 'fade' | 'sink';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

const PALETTES: Record<DitherKind, (string | null)[]> = {
  // warm grey cloud on ink, a little rust in the dense parts
  cloud: [null, '#18171a', '#211e20', '#2c2525', '#3b2b26', '#5a3222'],
  // a light warm haze rising from the bottom of a light section
  fade: [null, '#efe9e6', '#ead9d1', '#e7c4b5', '#f0a487'],
  // transparent above, ink below: dissolves whatever sits behind it into the dark band
  sink: [null, '#1212142e', '#12121466', '#121214a8', '#121214dd', '#121214'],
};

function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x: number, y: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, s: number): number {
  let t = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 4; o++) { t += amp * noise(x * f, y * f, s + o); f *= 2; amp *= 0.5; }
  return t / 0.9375;
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

@Component({
  selector: 'fw-dither',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
    canvas { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
  `],
  template: `<canvas aria-hidden="true"></canvas>`,
})
export class Dither {
  readonly kind = input<DitherKind>('cloud');
  /** CSS pixels per cell. */
  readonly cell = input(4);
  readonly seed = input(7);
  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Slow drift in the cloud field. Off for still materials. */
  readonly live = input(false);

  private destroy = inject(DestroyRef);
  private cols = 0;
  private rows = 0;
  private base: Float32Array | null = null;
  private img: ImageData | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private pal: number[][] = [];

  constructor() {
    afterNextRender(() => {
      let last = '';
      const size = () => {
        const r = this.host.getBoundingClientRect();
        const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
        if (key === last || !r.width || !r.height) return;
        last = key;
        this.prepare(Math.ceil(r.width / this.cell()), Math.ceil(r.height / this.cell()));
        this.render(this.time);
      };
      size();
      const ro = new ResizeObserver(size);
      ro.observe(this.host);
      this.destroy.onDestroy(() => ro.disconnect());

      // The loop runs only while the material is on screen, the tab is visible and motion is allowed,
      // at about 12 frames a second: pixel art reads as stepped anyway, and it keeps the cost low.
      const still = matchMedia('(prefers-reduced-motion: reduce)');
      if (!this.live()) return;
      let seen = false, raf = 0, prev = 0;
      const tick = (now: number) => {
        raf = 0;
        if (!seen || document.hidden || still.matches) return;
        if (now - prev >= 80) { this.time += Math.min(now - prev, 160) / 1000; prev = now; this.render(this.time); }
        raf = requestAnimationFrame(tick);
      };
      const wake = () => { if (!raf && seen && !document.hidden && !still.matches) { prev = performance.now(); raf = requestAnimationFrame(tick); } };
      const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; wake(); });
      io.observe(this.host);
      document.addEventListener('visibilitychange', wake);
      still.addEventListener('change', wake);
      this.destroy.onDestroy(() => { io.disconnect(); cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', wake); still.removeEventListener('change', wake); });
    });
  }
  private time = 0;

  /** Work out the still part of the field once per size; frames only add the moving part. */
  private prepare(cols: number, rows: number): void {
    const canvas = this.host.querySelector('canvas')!;
    canvas.width = cols; canvas.height = rows;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;
    this.cols = cols; this.rows = rows;
    const kind = this.kind(), seed = this.seed();
    this.pal = PALETTES[kind].map((c) => (c ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), c.length > 7 ? parseInt(c.slice(7, 9), 16) : 255] : [0, 0, 0, 0]));
    this.img = this.ctx.createImageData(cols, rows);
    const n = cols * rows;
    this.base = new Float32Array(n);
    const field = this.field(kind, cols, rows, seed);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) this.base[y * cols + x] = field(x, y);
  }

  private render(t: number): void {
    const { ctx, img, base, cols, rows } = this;
    if (!ctx || !img || !base) return;
    const kind = this.kind(), seed = this.seed(), pal = this.pal, top = pal.length - 1, live = this.live() && t > 0;
    const aspect = cols / rows;
    for (let y = 0; y < rows; y++) {
      const v = y / rows;
      for (let x = 0; x < cols; x++) {
        const k = y * cols + x;
        let f = base[k];
        if (live) {
          const u = x / cols;
          if (kind === 'cloud') f += (noise(u * 3.2 * aspect + t * 0.06, v * 3.2 + t * 0.03, seed + 30) - 0.5) * 2.4;
        }
        const lvl = clamp(Math.floor(f + BAYER[(y & 3) * 4 + (x & 3)]), 0, top);
        const c = pal[lvl], i = k * 4;
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = c[3];
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  /** Each kind is a field returning a continuous palette index. */
  private field(kind: DitherKind, cols: number, rows: number, seed: number): (x: number, y: number) => number {
    const W = cols, H = rows, aspect = W / H;
    switch (kind) {
      case 'cloud':
        return (x, y) => {
          const u = x / W, v = y / H;
          const c = fbm(u * 3.2 * aspect, v * 3.2, seed);
          const detail = fbm(u * 18 * aspect, v * 18, seed + 5);
          return (c - 0.42) * 9 + (detail - 0.5) * 1.6;
        };
      case 'fade':
        return (x, y) => {
          const u = x / W, v = y / H;
          const c = fbm(u * 5 * aspect, v * 4, seed);
          return (v - 0.35) * 5.2 + (c - 0.5) * 3.2;
        };
      case 'sink':
        return (x, y) => {
          const u = x / W, v = y / H;
          return v * v * 6.2 - 0.4 + (fbm(u * 20 * aspect, v * 6, seed) - 0.5) * 1.2;
        };
    }
  }
}
