import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input } from '@angular/core';

/** Characters from light to dense, as in an ASCII brightness ramp. */
const RAMP = ' .:-=+*#%';

interface P { hx: number; hy: number; x: number; y: number; vx: number; vy: number; v: number; core: boolean }

/**
 * A wordmark drawn as ASCII art: every cell of a monospaced grid takes the
 * character whose density matches the letters underneath, dense at the top of
 * each letter and thinning toward the bottom, with dots around the edges.
 * Each character is a particle: a scan of light crosses the word, and the
 * pointer pushes characters aside, lighting them up, before they settle back.
 * Runs only while on screen; under reduced motion it is drawn once and holds still.
 */
@Component({
  selector: 'fw-particle-word',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`:host { display: block; position: absolute; inset: 0; touch-action: pan-y; } canvas { display: block; width: 100%; height: 100%; }`],
  template: `<canvas role="img" [attr.aria-label]="text()"></canvas>`,
})
export class ParticleWord {
  readonly text = input('Fieldwork');

  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private destroy = inject(DestroyRef);
  private ps: P[] = [];
  private W = 0;
  private H = 0;
  private cw = 8;
  private ch = 13;
  private dpr = 1;
  private ptr = { x: -1e4, y: -1e4, on: false };
  private t = 0;

  constructor() {
    afterNextRender(() => {
      const canvas = this.host.querySelector('canvas')!;
      const ctx = canvas.getContext('2d')!;
      const still = matchMedia('(prefers-reduced-motion: reduce)');
      let raf = 0, seen = false, prev = 0, lastKey = '';

      const build = () => {
        const r = this.host.getBoundingClientRect();
        const key = `${Math.round(r.width)}x${Math.round(r.height)}`;
        if (key === lastKey || !r.width || !r.height) return;
        lastKey = key;
        this.dpr = Math.min(2, devicePixelRatio || 1);
        this.W = r.width; this.H = r.height;
        canvas.width = Math.round(r.width * this.dpr); canvas.height = Math.round(r.height * this.dpr);
        this.sample();
        draw();
      };

      const draw = () => {
        const { W, H, dpr, cw, ch } = this;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        ctx.font = `500 ${Math.round(ch * 0.92)}px "Geist Mono", ui-monospace, monospace`;
        ctx.textBaseline = 'top';
        const scan = ((this.t * 0.2) % 1.6) - 0.3;
        const top = RAMP.length - 1;
        for (const p of this.ps) {
          const u = p.hx / W;
          const lit = p.core ? Math.exp(-(((u - scan) / 0.06) ** 2)) * 0.35 : 0;
          const moved = Math.min(1, Math.hypot(p.x - p.hx, p.y - p.hy) / (cw * 4));
          const v = Math.min(1, p.v + lit + moved * 0.45);
          const c = RAMP[Math.max(1, Math.round(v * top))];
          // rust at rest, vermilion to pale coral where the scan or the pointer lights it
          const k = Math.min(1, v * 0.85 + lit * 1.4 + moved * 0.8);
          const r = 96 + 159 * k, g = 34 + 140 * k * k, b = 22 + 130 * k * k;
          ctx.fillStyle = `rgb(${r | 0} ${g | 0} ${b | 0} / ${0.35 + 0.65 * Math.min(1, v + moved)})`;
          ctx.fillText(c, p.x, p.y);
        }
      };

      const step = (dt: number) => {
        this.t += dt;
        const R = this.cw * 12, { x: mx, y: my, on } = this.ptr;
        for (const p of this.ps) {
          if (on) {
            const dx = p.x - mx, dy = p.y - my, d = Math.hypot(dx, dy);
            if (d < R && d > 0.01) { const f = ((R - d) / R) ** 2 * 3.4; p.vx += (dx / d) * f; p.vy += (dy / d) * f; }
          }
          p.vx = (p.vx + (p.hx - p.x) * 0.06) * 0.84;
          p.vy = (p.vy + (p.hy - p.y) * 0.06) * 0.84;
          p.x += p.vx; p.y += p.vy;
        }
      };

      const tick = (now: number) => {
        raf = 0;
        if (!seen || document.hidden || still.matches) return;
        const dt = Math.min(48, now - prev) / 1000; prev = now;
        step(dt); draw();
        raf = requestAnimationFrame(tick);
      };
      const wake = () => { if (!raf && seen && !document.hidden && !still.matches) { prev = performance.now(); raf = requestAnimationFrame(tick); } };

      build();
      document.fonts?.ready.then(() => { lastKey = ''; build(); });
      const ro = new ResizeObserver(build); ro.observe(this.host);
      const io = new IntersectionObserver(([e]) => { seen = e.isIntersecting; wake(); }); io.observe(this.host);
      const move = (e: PointerEvent) => { const r = this.host.getBoundingClientRect(); this.ptr = { x: e.clientX - r.left, y: e.clientY - r.top, on: true }; };
      const leave = () => { this.ptr.on = false; };
      this.host.addEventListener('pointermove', move);
      this.host.addEventListener('pointerleave', leave);
      this.host.addEventListener('pointercancel', leave);
      document.addEventListener('visibilitychange', wake);
      still.addEventListener('change', wake);
      this.destroy.onDestroy(() => {
        ro.disconnect(); io.disconnect(); cancelAnimationFrame(raf);
        this.host.removeEventListener('pointermove', move); this.host.removeEventListener('pointerleave', leave); this.host.removeEventListener('pointercancel', leave);
        document.removeEventListener('visibilitychange', wake); still.removeEventListener('change', wake);
      });
    });
  }

  /**
   * Draw the word at grid resolution, then give every cell a density: full
   * coverage near the top of each letter, thinning toward its foot, and a
   * blurred halo for the dots around the edges.
   */
  private sample(): void {
    const W = this.W, H = this.H, text = this.text();
    this.cw = Math.max(4, Math.min(9, W / 168));
    this.ch = this.cw * 1.6;
    const cols = Math.floor(W / this.cw), rows = Math.floor(H / this.ch);
    const off = document.createElement('canvas');
    off.width = cols; off.height = rows;
    const o = off.getContext('2d')!;
    // cells are 1.6 times taller than wide, so the word is drawn squashed to come out true
    let size = rows * 1.02;
    const setFont = () => { o.font = `800 ${size}px Manrope, system-ui, sans-serif`; };
    setFont();
    const fit = () => (o.measureText(text).width * 1.6);
    if (fit() > cols * 0.96) { size *= (cols * 0.96) / fit(); setFont(); }
    const m = o.measureText(text);
    const base = rows * 0.88, capTop = base - m.actualBoundingBoxAscent;
    o.fillStyle = '#fff';
    o.save(); o.scale(1.6, 1);
    o.fillText(text, (cols - fit()) / 2 / 1.6, base);
    o.restore();
    const sharp = o.getImageData(0, 0, cols, rows).data;
    const halo = document.createElement('canvas');
    halo.width = cols; halo.height = rows;
    const h = halo.getContext('2d')!;
    h.filter = 'blur(1.2px)';
    h.drawImage(off, 0, 0);
    const soft = h.getImageData(0, 0, cols, rows).data;
    let s = 1234567;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const ps: P[] = [];
    for (let y = 0; y < rows; y++) {
      const fall = Math.min(1, Math.max(0, (y - capTop) / Math.max(1, base - capTop)));
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4 + 3;
        const cover = sharp[i] / 255, glow = soft[i] / 255;
        const core = cover > 0.3;
        let v: number;
        if (core) v = Math.min(1, (0.55 + 0.45 * cover) * (1 - 0.5 * fall) + (rnd() - 0.5) * 0.1);
        else if (glow > 0.08) v = 0.12 + glow * 0.18;
        else if (rnd() < 0.025) v = 0.12;
        else continue;
        const hx = x * this.cw, hy = y * this.ch;
        ps.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0, v, core });
      }
    }
    this.ps = ps;
  }
}
