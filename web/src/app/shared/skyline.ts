import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { formatHours } from '../core/format';

export interface DayProject { id: number; name: string | null; code: string | null; color: string | null; minutes: number }
export interface Day { date: string; minutes: number; people: number; projects: DayProject[] }

const NS = 'http://www.w3.org/2000/svg';
const ROWS = 7;
const P = 16;            // grid pitch in viewBox units
const R = 6.2;           // half the cell, for the bounds
const HS = 5.8;          // half the drawn square: a little gap between days, like the landing hero's cells
const H = 92;            // tallest bar
const TURN = (30 * Math.PI) / 180;   // how far the plane turns on its way to isometric
const SQUASH = 0.5;      // how flat the plane lies in isometric
// Five steps from empty to deep vermilion, the same steps as the landing hero's hours grid.
export const FILL = ['#ececee', '#ffcdbd', '#ff9a78', '#f0512a', '#b4351a'];
const SIDE = ['#d9d9de', '#eaa892', '#e0774f', '#c8401c', '#7e2412'];   // left face, in shade
const SIDE2 = ['#e3e3e7', '#f4bba8', '#ef8963', '#dc4a22', '#982b15'];  // right face, half lit
const HOT = { top: '#121214', side: '#000000', side2: '#26252a' };

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); // in-out for the tilt
const out = (t: number) => 1 - Math.pow(1 - t, 3);                                      // out for the bars


/**
 * A contribution graph that can stand up as a skyline. In "grid" it is a flat calendar of square cells
 * (one column per week, one row per weekday). In "3d" the same plane turns and tilts to an isometric
 * view, then every day rises as a square block, its height the hours that day, in a wave from the oldest
 * week. Switching back sinks the bars, then lays the plane flat. Either change can be interrupted and
 * reverses from where it is. Hover a day (or move with the arrow keys) for its breakdown.
 */
@Component({
  selector: 'fw-skyline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; position: relative; }
    svg { display: block; width: 100%; height: auto; overflow: visible; touch-action: pan-y; }
    svg:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 4px; border-radius: var(--radius-md); }
    .tip { position: absolute; z-index: 2; pointer-events: none; min-width: 210px; max-width: 260px; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); background: #18181b; color: #fff; box-shadow: 0 16px 40px -12px rgb(0 0 0 / 0.45); font-size: var(--text-small); animation: tip-in var(--dur-1) var(--ease-out) both; }
    @keyframes tip-in { from { opacity: 0; transform: translateY(4px) scale(0.98); } to { opacity: 1; transform: none; } }
    .tip .head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); }
    .tip .head b { font-weight: var(--weight-semibold); }
    .tip .badge { font-size: var(--text-micro); font-weight: var(--weight-semibold); background: var(--color-accent); color: #fff; border-radius: var(--radius-full); padding: 1px var(--space-2); }
    .tip .big { display: flex; align-items: baseline; gap: var(--space-2); margin: var(--space-2) 0 var(--space-2); }
    .tip .big strong { font-size: var(--text-title); line-height: 1; font-weight: var(--weight-semibold); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
    .tip .big span { color: rgb(255 255 255 / 0.6); }
    .tip ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
    .tip li { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; gap: var(--space-2); }
    .tip li i { width: 8px; height: 8px; border-radius: 50%; }
    .tip li span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: rgb(255 255 255 / 0.85); }
    .tip li b { font-variant-numeric: tabular-nums; font-weight: var(--weight-medium); }
    .tip .foot { margin-top: var(--space-2); color: rgb(255 255 255 / 0.55); }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @media (prefers-reduced-motion: reduce) { .tip { animation: none; } }
  `],
  template: `
    <svg #svg role="img" tabindex="0" [attr.aria-label]="label()" (keydown)="key($event)" (pointerleave)="hover.set(-1)" (blur)="hover.set(-1)"></svg>
    @if (tipDay(); as d) {
      <div class="tip" [style.left.px]="tipPos().x" [style.top.px]="tipPos().y">
        <div class="head"><b>{{ when(d.date) }}</b>@if (isBusiest(d)) { <span class="badge">Busiest</span> }</div>
        <div class="big"><strong>{{ hours(d.minutes) }}</strong><span>billable hours</span></div>
        @if (d.projects.length) {
          <ul>
            @for (p of d.projects.slice(0, 3); track p.id) { <li><i [style.background]="p.color || '#a1a1aa'"></i><span>{{ p.name }}</span><b>{{ hours(p.minutes) }}</b></li> }
            @if (d.projects.length > 3) { <li><i style="background:#71717a"></i><span>Others</span><b>{{ hours(rest(d)) }}</b></li> }
          </ul>
          <div class="foot">{{ d.people }} {{ d.people === 1 ? 'person' : 'people' }} logged time</div>
        } @else { <div class="foot">No approved billable time</div> }
      </div>
    }
    <p class="sr" aria-live="polite">{{ live() }}</p>
  `,
})
export class Skyline {
  days = input.required<Day[]>();
  mode = input<'3d' | 'grid'>('grid');
  /** Show weekday and month labels (the full view); the card hides them. */
  labels = input(true);
  /** Only ever flat (the card): size to the grid alone, with no room kept for bars. */
  flat = input(false);
  /** The day the stats call busiest, for the badge. */
  busiest = input<string | null>(null);
  dayPick = output<Day>();

  hover = signal(-1);
  private svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  private host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  // animation state: tilt 0 flat → 1 isometric; one growth value per week column
  private tilt = 0;
  private grow: number[] = [];
  private frame = 0;
  private cells: { g: SVGGElement; side: SVGPathElement; side2: SVGPathElement; top: SVGPolygonElement; i: number }[] = [];
  private textEls: SVGTextElement[] = [];
  private pos: { x: number; y: number; h: number }[] = [];

  weeks = computed(() => Math.ceil(this.days().length / ROWS));
  max = computed(() => Math.max(1, ...this.days().map((d) => d.minutes)));
  /** Quartile cut points of the days with time, so the scale shows variation like a contribution graph. */
  private cuts = computed(() => {
    const v = this.days().map((d) => d.minutes).filter((m) => m > 0).sort((a, b) => a - b);
    const q = (f: number) => v[Math.min(v.length - 1, Math.floor(f * v.length))] ?? 0;
    return [q(0.25), q(0.5), q(0.75)];
  });
  level = (m: number) => { if (m <= 0) return 0; const [a, b, c] = this.cuts(); return m <= a ? 1 : m <= b ? 2 : m <= c ? 3 : 4; };
  tipDay = computed(() => (this.hover() >= 0 ? this.days()[this.hover()] : null));
  tipPos = signal({ x: 0, y: 0 });
  label = computed(() => `Approved billable hours per day for ${this.weeks()} weeks. Use the arrow keys to read each day.`);
  live = computed(() => { const d = this.tipDay(); return d ? `${this.when(d.date)}: ${this.hours(d.minutes)} hours` : ''; });

  constructor() {
    const destroy = inject(DestroyRef);
    destroy.onDestroy(() => cancelAnimationFrame(this.frame));
    afterNextRender(() => {
      this.build();
      const to3d = this.mode() === '3d';
      if (to3d && !reduced()) { this.tilt = 0; this.grow = this.grow.map(() => 0); this.draw(); this.animate(true); }
      else { this.tilt = to3d ? 1 : 0; this.grow = this.grow.map(() => (to3d ? 1 : 0)); this.draw(); }
    });
    // rebuild when the data changes; animate when the mode changes
    // inputs are not set yet in the constructor, so the first run of the effect only records them
    let lastMode: string | null = null, lastDays: Day[] | null = null;
    effect(() => {
      const m = this.mode(), d = this.days();
      if (lastMode === null) { lastMode = m; lastDays = d; return; }
      if (!this.cells.length) return;
      if (d !== lastDays) { lastDays = d; this.build(); this.draw(); }
      if (m !== lastMode) { lastMode = m; this.animate(m === '3d'); }
    });
    effect(() => { this.hover(); if (this.cells.length) this.paint(); });
  }

  /* ---------- formatting ---------- */
  when(date: string): string { return new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  hours(m: number): string { return formatHours(m); }
  rest(d: Day): number { return d.projects.slice(3).reduce((s, p) => s + p.minutes, 0); }
  isBusiest(d: Day): boolean { return d.date === this.busiest(); }

  /* ---------- geometry ---------- */
  private centre() { return { cx: ((this.weeks() - 1) * P) / 2, cy: ((ROWS - 1) * P) / 2 }; }
  /** Screen position of a cell for a given tilt: rotate the plane, then lay it down. */
  private place(col: number, row: number, t: number) {
    const { cx, cy } = this.centre();
    const u = col * P - cx, v = row * P - cy, a = TURN * t, s = 1 - (1 - SQUASH) * t;
    const lift = this.flat() ? 0 : (1 - t) * (-H / 2);
    return { x: u * Math.cos(a) - v * Math.sin(a), y: (u * Math.sin(a) + v * Math.cos(a)) * s + lift, s };
  }

  private build(): void {
    const svg = this.svg().nativeElement;
    svg.replaceChildren();
    this.cells = []; this.textEls = [];
    const days = this.days(), weeks = this.weeks();
    this.grow = Array.from({ length: weeks }, (_, c) => this.grow[c] ?? (this.mode() === '3d' && reduced() ? 1 : 0));
    // viewBox: the union of the flat grid and the full skyline
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const t of this.flat() ? [0] : [0, 1]) for (const [c, r] of [[0, 0], [weeks - 1, 0], [0, ROWS - 1], [weeks - 1, ROWS - 1]]) {
      const p = this.place(c, r, t); x0 = Math.min(x0, p.x - R); x1 = Math.max(x1, p.x + R); y0 = Math.min(y0, p.y - R - (t ? H : 0)); y1 = Math.max(y1, p.y + R);
    }
    const padL = this.labels() ? 30 : 4, padT = this.labels() ? 18 : 4;
    svg.setAttribute('viewBox', `${x0 - padL} ${y0 - padT} ${x1 - x0 + padL + 8} ${y1 - y0 + padT + 8}`);

    if (this.labels()) {
      // weekday labels (Mon, Wed, Fri) and month labels where a month starts; they fade as the plane tilts
      for (const [row, txt] of [[0, 'Mon'], [2, 'Wed'], [4, 'Fri']] as const) {
        const t = document.createElementNS(NS, 'text'); t.textContent = txt; t.dataset['row'] = String(row); t.setAttribute('class', 'wd');
        this.textEls.push(t);
      }
      let lastMonth = -1;
      for (let c = 0; c < weeks; c++) {
        const d = days[c * ROWS]; if (!d) continue;
        const m = new Date(d.date + 'T12:00:00').getMonth();
        if (m !== lastMonth) {
          lastMonth = m;
          const t = document.createElementNS(NS, 'text'); t.textContent = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short' }); t.dataset['col'] = String(c);
          this.textEls.push(t);
        }
      }
      for (const t of this.textEls) { t.setAttribute('font-size', '8.5'); t.setAttribute('fill', '#8a8a93'); t.setAttribute('font-family', 'Manrope, sans-serif'); svg.appendChild(t); }
    }

    days.forEach((d, i) => {
      const g = document.createElementNS(NS, 'g');
      const side = document.createElementNS(NS, 'path');
      const side2 = document.createElementNS(NS, 'path');
      const top = document.createElementNS(NS, 'polygon');
      g.append(side, side2, top);
      g.addEventListener('pointerenter', (e) => { this.hover.set(i); this.moveTip(e as PointerEvent); });
      g.addEventListener('pointermove', (e) => this.moveTip(e as PointerEvent));
      g.addEventListener('click', () => this.dayPick.emit(d));
      g.style.cursor = 'pointer';
      svg.appendChild(g);
      this.cells.push({ g, side, side2, top, i });
    });
  }

  /** Recompute every cell for the current tilt and growth, then paint back to front. */
  private draw(): void {
    const days = this.days(), max = this.max();
    this.pos = days.map((d, i) => {
      const col = Math.floor(i / ROWS), row = i % ROWS, p = this.place(col, row, this.tilt);
      return { x: p.x, y: p.y, h: (H * (d.minutes / max)) * (this.grow[col] ?? 0) };
    });
    const s = 1 - (1 - SQUASH) * this.tilt;
    const svg = this.svg().nativeElement;
    // back to front: further up the screen paints first
    const order = this.cells.slice().sort((a, b) => this.pos[a.i].y - this.pos[b.i].y || this.pos[a.i].x - this.pos[b.i].x);
    // the square's corners turn and flatten with the plane, exactly as the cell centres do
    const a = TURN * this.tilt, ca = Math.cos(a), sa = Math.sin(a);
    const corners = [[-HS, -HS], [HS, -HS], [HS, HS], [-HS, HS]].map(([du, dv]) => [du * ca - dv * sa, (du * sa + dv * ca) * s]);
    const front = corners.reduce((k, q, i) => (q[1] > corners[k][1] ? i : k), 0), prev = (front + 3) % 4, next = (front + 1) % 4;
    for (const c of order) {
      const { x, y, h } = this.pos[c.i];
      const top = corners.map(([dx, dy]) => [x + dx, y + dy - h]);
      c.top.setAttribute('points', top.map((q) => q[0].toFixed(2) + ',' + q[1].toFixed(2)).join(' '));
      // the two faces that look at the viewer meet at the lowest corner on screen; the left one is in shade
      if (h > 0.4) {
        const face = (i: number, j: number) => { const [ax, ay] = corners[i], [bx, by] = corners[j];
          return `M${(x + ax).toFixed(2)} ${(y + ay - h).toFixed(2)}L${(x + ax).toFixed(2)} ${(y + ay).toFixed(2)}L${(x + bx).toFixed(2)} ${(y + by).toFixed(2)}L${(x + bx).toFixed(2)} ${(y + by - h).toFixed(2)}Z`; };
        const left = corners[prev][0] < corners[next][0] ? prev : next, right = left === prev ? next : prev;
        c.side.setAttribute('d', face(left, front));
        c.side2.setAttribute('d', face(front, right));
      } else { c.side.setAttribute('d', ''); c.side2.setAttribute('d', ''); }
      svg.appendChild(c.g);
    }
    // labels: weekday names left of the first column, months above their column; fade with the tilt
    for (const t of this.textEls) {
      const o = Math.max(0, 1 - this.tilt * 2.5);
      t.setAttribute('opacity', o.toFixed(2));
      if (t.dataset['row']) { const p = this.place(0, Number(t.dataset['row']), this.tilt); t.setAttribute('x', (p.x - R - 22).toFixed(1)); t.setAttribute('y', (p.y + 3).toFixed(1)); }
      else { const p = this.place(Number(t.dataset['col']), 0, this.tilt); t.setAttribute('x', (p.x - R).toFixed(1)); t.setAttribute('y', (p.y - R - 6).toFixed(1)); }
    }
    this.paint();
  }

  /** Colours only: level of each day, and the hovered one in ink. */
  private paint(): void {
    const days = this.days(), hov = this.hover();
    for (const c of this.cells) {
      const lv = this.level(days[c.i].minutes), hot = c.i === hov;
      c.top.setAttribute('fill', hot ? HOT.top : FILL[lv]);
      c.side.setAttribute('fill', hot ? HOT.side : SIDE[lv]);
      c.side2.setAttribute('fill', hot ? HOT.side2 : SIDE2[lv]);
    }
  }

  /* ---------- motion ---------- */
  /**
   * To 3D: the plane tilts (in-out, 520ms), and once it is mostly down each week rises in turn
   * (out, 560ms, 14ms apart). To grid: everything sinks together (out, 240ms), then the plane lifts
   * flat (in-out, 420ms). Starts from the current values, so a second click reverses mid-way.
   */
  private animate(to3d: boolean): void {
    cancelAnimationFrame(this.frame);
    if (reduced()) { this.tilt = to3d ? 1 : 0; this.grow = this.grow.map(() => (to3d ? 1 : 0)); this.draw(); return; }
    const t0 = performance.now(), tiltFrom = this.tilt, growFrom = this.grow.slice(), cols = this.grow.length;
    const TILT = to3d ? 520 : 420, BAR = to3d ? 560 : 240, STAG = 14;
    const step = (now: number) => {
      const e = now - t0;
      let done = true;
      if (to3d) {
        const k = Math.min(1, e / TILT); this.tilt = tiltFrom + (1 - tiltFrom) * ease(k); if (k < 1) done = false;
        const start = TILT * 0.55;
        for (let c = 0; c < cols; c++) {
          const kb = Math.min(1, Math.max(0, (e - start - c * STAG) / BAR));
          this.grow[c] = growFrom[c] + (1 - growFrom[c]) * out(kb); if (kb < 1) done = false;
        }
      } else {
        const kb = Math.min(1, e / BAR);
        for (let c = 0; c < cols; c++) this.grow[c] = growFrom[c] * (1 - out(kb));
        if (kb < 1) done = false;
        const k = Math.min(1, Math.max(0, (e - BAR * 0.6) / TILT)); this.tilt = tiltFrom * (1 - ease(k)); if (k < 1) done = false;
      }
      this.draw();
      if (!done) this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  /* ---------- tooltip and keyboard ---------- */
  private moveTip(e: PointerEvent): void {
    const box = this.host.getBoundingClientRect();
    const w = 240, h = 170;
    let x = e.clientX - box.left + 14, y = e.clientY - box.top - h - 10;
    if (x + w > box.width) x = e.clientX - box.left - w - 14;
    if (y < 0) y = e.clientY - box.top + 16;
    this.tipPos.set({ x: Math.max(0, x), y });
  }

  key(e: KeyboardEvent): void {
    const n = this.days().length;
    let i = this.hover() < 0 ? this.days().findIndex((d) => d.date === this.busiest()) : this.hover();
    if (i < 0) i = 0;
    const moves: Record<string, number> = { ArrowRight: ROWS, ArrowLeft: -ROWS, ArrowDown: 1, ArrowUp: -1 };
    if (e.key in moves) { e.preventDefault(); i = Math.min(n - 1, Math.max(0, i + (this.hover() < 0 ? 0 : moves[e.key]))); }
    else if (e.key === 'Escape') { this.hover.set(-1); return; }
    else return;
    this.hover.set(i);
    // place the card over the day
    const p = this.pos[i], svg = this.svg().nativeElement, vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect(), box = this.host.getBoundingClientRect();
    const sx = r.left - box.left + ((p.x - vb.x) / vb.width) * r.width, sy = r.top - box.top + ((p.y - p.h - vb.y) / vb.height) * r.height;
    this.tipPos.set({ x: Math.max(0, Math.min(box.width - 240, sx + 12)), y: Math.max(0, sy - 180) });
  }
}

function reduced(): boolean { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
