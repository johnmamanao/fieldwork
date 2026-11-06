import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input } from '@angular/core';

/**
 * Fieldwork's own pixel ground: a timesheet seen from far away. Square cells in
 * columns of days, each as bright as the hours logged that day (weekends quiet,
 * midweek full), on the vermilion field. The cells give way around the copy so
 * the headline sits on calm colour, and the bottom rows sink into ink. A "today"
 * column walks slowly across, lighting each day as it logs it.
 * Runs only while on screen; under reduced motion it is drawn once and holds still.
 */
const BASE = '#b4351a';
const LEVELS = ['#121214', '#3b140a', '#6e2210', '#982b15', BASE, '#cf411d', '#e64d24', '#fb6a3d', '#ff9a78'];

function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

@Component({
  selector: 'fw-hours-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`:host { display: block; position: absolute; inset: 0; pointer-events: none; overflow: hidden; } canvas { display: block; width: 100%; height: 100%; }`],
  template: `<canvas aria-hidden="true"></canvas>`,
})
export class HoursField {
  /** CSS pixels per cell, including its gap. */
  readonly cell = input(18);
  readonly seed = input(5);
  /** Where the copy sits, as a fraction of the box: the cells clear an ellipse around it. */
  readonly clearX = input(0.5);
  readonly clearY = input(0.3);
  readonly clearW = input(0.36);
  readonly clearH = input(0.26);
  /** Fraction of the height, from the bottom, that sinks into ink. */
  readonly sink = input(0.3);

  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const canvas = this.host.querySelector('canvas')!;
      const ctx = canvas.getContext('2d')!;
      const still = matchMedia('(prefers-reduced-motion: reduce)');
      let W = 0, H = 0, cols = 0, rows = 0, dpr = 1, hours: Float32Array = new Float32Array(0), logged: Float32Array = new Float32Array(0);
      let t = 0, raf = 0, prev = 0, seen = false, last = '';

      const size = () => {
        const r = this.host.getBoundingClientRect();
        const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
        if (key === last || !r.width || !r.height) return;
        last = key;
        dpr = Math.min(2, devicePixelRatio || 1);
        W = r.width; H = r.height;
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        const c = this.cell();
        cols = Math.ceil(W / c) + 1; rows = Math.ceil(H / c) + 1;
        // hours per day: a weekly rhythm down each column, busier weeks and quiet ones across
        hours = new Float32Array(cols * rows);
        logged = new Float32Array(cols * rows);
        const s = this.seed();
        for (let x = 0; x < cols; x++) {
          const week = 0.55 + 0.45 * hash(Math.floor(x / 3), 0, s);
          for (let y = 0; y < rows; y++) {
            const day = y % 7;
            const rhythm = day >= 5 ? 0.12 : [0.75, 0.9, 1, 0.92, 0.7][day];
            hours[y * cols + x] = Math.min(1, rhythm * week * (0.55 + 0.6 * hash(x, y, s)));
          }
        }
        draw();
      };

      const draw = () => {
        const c = this.cell(), gap = Math.max(2, Math.round(c * 0.18)), sq = c - gap;
        // on a narrow screen the copy runs edge to edge, so the clearing widens with it
        const narrow = W < 720;
        const cx = this.clearX(), cy = this.clearY(), sink = this.sink();
        const cw = narrow ? Math.max(this.clearW(), 0.85) : this.clearW(), chh = narrow ? Math.max(this.clearH(), 0.3) : this.clearH();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = BASE;
        ctx.fillRect(0, 0, W, H);
        const today = cols ? (t * 0.9) % (cols + 6) - 3 : -10;
        const top = LEVELS.length - 1;
        for (let x = 0; x < cols; x++) {
          const u = (x * c + c / 2) / W;
          for (let y = 0; y < rows; y++) {
            const v = (y * c + c / 2) / H, k = y * cols + x;
            // calm around the copy: the cells fade out inside the ellipse
            const e = ((u - cx) / cw) ** 2 + ((v - cy) / chh) ** 2;
            const calm = Math.min(1, Math.max(0, (e - 0.55) / 0.9));
            // the walking "today" column lights the day it passes, which stays a little brighter
            const near = Math.max(0, 1 - Math.abs(x - today) / 1.5);
            if (near > 0.6) logged[k] = Math.min(0.5, logged[k] + 0.04);
            else logged[k] *= 0.996;
            // a quiet day reads darker than the ground, a full one brighter
            let lvl = 4 + (hours[k] * 4.4 - 1.4) * calm + near * 2.2 * calm + logged[k] * calm * 2;
            const down = sink > 0 ? Math.min(1, Math.max(0, (v - (1 - sink)) / sink)) : 0;
            lvl -= down * down * 6;
            const i = Math.max(0, Math.min(top, Math.round(lvl)));
            if (i === 4) continue;                          // the ground colour itself: nothing to draw
            ctx.fillStyle = LEVELS[i];
            ctx.fillRect(x * c, y * c, sq, sq);
          }
        }
      };

      const tick = (now: number) => {
        raf = 0;
        if (!seen || document.hidden || still.matches) return;
        if (now - prev >= 90) { t += Math.min(now - prev, 180) / 1000; prev = now; draw(); }
        raf = requestAnimationFrame(tick);
      };
      const wake = () => { if (!raf && seen && !document.hidden && !still.matches) { prev = performance.now(); raf = requestAnimationFrame(tick); } };

      size();
      const ro = new ResizeObserver(size); ro.observe(this.host);
      const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; wake(); }); io.observe(this.host);
      document.addEventListener('visibilitychange', wake);
      still.addEventListener('change', wake);
      destroy.onDestroy(() => { ro.disconnect(); io.disconnect(); cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', wake); still.removeEventListener('change', wake); });
    });
  }
}
