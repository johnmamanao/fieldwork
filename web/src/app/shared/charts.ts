import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, signal } from '@angular/core';
import { Icon } from './icon';
import { formatDate } from '../core/format';

export interface SeriesPoint { label: string; current: number | null; previous: number | null; }

/** Tiny trend line for KPI tiles (decorative; the figure carries the value). */
@Component({
  selector: 'fw-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 120 32'" width="100%" height="32" preserveAspectRatio="none" aria-hidden="true">
      <path [attr.d]="path()" fill="none" stroke="var(--color-series-current)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    </svg>`,
})
export class Sparkline {
  values = input<(number | null)[]>([]);
  path = computed(() => {
    const v = this.values().filter((x): x is number => x !== null);
    if (v.length < 2) return '';
    const max = Math.max(...v, 1);
    const min = Math.min(...v, 0);
    return v.map((y, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1)) * 120},${30 - ((y - min) / (max - min || 1)) * 28}`).join(' ');
  });
}

/**
 * Current vs comparison series on one axis. Crosshair tooltip on hover/focus, keyboard
 * stepping with arrow keys, legend, and a table view with identical numbers.
 */
@Component({
  selector: 'fw-compare-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  host: { 'data-seenry-signature': '' },
  styles: [`
    :host { display: block; }
    .legend { display: flex; gap: var(--space-4); align-items: center; color: var(--color-text-secondary); font-size: var(--text-small); }
    .key { display: inline-flex; align-items: center; gap: var(--space-2); }
    .key i { width: 16px; height: 0; border-top: 2px solid var(--color-series-current); display: inline-block; }
    .key i.cmp { border-top: 2px dashed var(--color-series-compare); }
    .plot { position: relative; margin-top: var(--space-3); }
    svg { display: block; overflow: visible; }
    .axis { fill: var(--color-text-tertiary); font-size: var(--text-micro); font-variant-numeric: tabular-nums; }
    .tip { position: absolute; top: 0; pointer-events: none; background: var(--color-bg-surface); box-shadow: var(--shadow-overlay); border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); min-width: 168px; font-size: var(--text-small); line-height: var(--lh-small); transform: translateX(-50%); white-space: nowrap; z-index: 2; }
    .tip .r { display: flex; justify-content: space-between; gap: var(--space-4); }
    .tip b { font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; }
  `],
  template: `
    <div class="spread wrap">
      <div class="legend">
        <span class="key"><i></i>{{ currentLabel() }}</span>
        <span class="key"><i class="cmp"></i>{{ previousLabel() }}</span>
      </div>
      <div class="seg" role="group" aria-label="Chart view">
        <button type="button" [attr.aria-pressed]="!asTable()" (click)="asTable.set(false)"><fw-icon name="chart" /> Chart</button>
        <button type="button" [attr.aria-pressed]="asTable()" (click)="asTable.set(true)"><fw-icon name="table" /> Table</button>
      </div>
    </div>

    @if (!asTable()) {
      <div class="plot" (mouseleave)="hover.set(null)">
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" width="100%" [attr.height]="H" role="img" [attr.aria-label]="ariaSummary()"
             tabindex="0" (keydown)="onKey($event)" (mousemove)="onMove($event)" (focus)="hover.set(hover() ?? lastIndex())" (blur)="hover.set(null)">
          @for (t of ticks(); track t.v) {
            <line [attr.x1]="PAD_L" [attr.x2]="W - PAD_R" [attr.y1]="t.y" [attr.y2]="t.y" stroke="var(--color-grid)" stroke-width="1" />
            <text class="axis" [attr.x]="PAD_L - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.text }}</text>
          }
          @for (x of xLabels(); track x.i) {
            <text class="axis" [attr.x]="x.x" [attr.y]="H - 6" text-anchor="middle">{{ x.text }}</text>
          }
          <path [attr.d]="prevPath()" fill="none" stroke="var(--color-series-compare)" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round" />
          <path [attr.d]="areaPath()" fill="var(--color-series-current)" fill-opacity="0.08" />
          <path [attr.d]="curPath()" fill="none" stroke="var(--color-series-current)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          @if (hover() !== null) {
            <line [attr.x1]="xAt(hover()!)" [attr.x2]="xAt(hover()!)" [attr.y1]="PAD_T" [attr.y2]="H - PAD_B" stroke="var(--color-border-control)" stroke-width="1" />
            @if (series()[hover()!].previous !== null) {
              <circle [attr.cx]="xAt(hover()!)" [attr.cy]="yAt(series()[hover()!].previous!)" r="4" fill="var(--color-series-compare)" stroke="var(--color-bg-surface)" stroke-width="2" />
            }
            @if (series()[hover()!].current !== null) {
              <circle [attr.cx]="xAt(hover()!)" [attr.cy]="yAt(series()[hover()!].current!)" r="4.5" fill="var(--color-series-current)" stroke="var(--color-bg-surface)" stroke-width="2" />
            }
          }
        </svg>
        @if (hover() !== null) {
          <div class="tip" [style.left.%]="(xAt(hover()!) / W) * 100">
            <div class="faint">{{ bucketText(hover()!) }}</div>
            <div class="r"><span>{{ currentLabel() }}</span><b>{{ series()[hover()!].current === null ? 'Not yet' : format()(series()[hover()!].current!) }}</b></div>
            <div class="r"><span>{{ previousLabel() }}</span><b>{{ series()[hover()!].previous === null ? '—' : format()(series()[hover()!].previous!) }}</b></div>
          </div>
        }
      </div>
    } @else {
      <div class="table-wrap" style="margin-top: var(--space-3); overflow-y: auto" [style.height.px]="H">
        <table class="table compact">
          <thead><tr><th>{{ bucket() === 'week' ? 'Week of' : 'Day' }}</th><th class="num">{{ currentLabel() }}</th><th class="num">{{ previousLabel() }}</th></tr></thead>
          <tbody>
            @for (p of points(); track p.label; let i = $index) {
              <tr><td>{{ bucketText(i) }}</td><td class="num">{{ p.current === null ? '—' : format()(p.current) }}</td><td class="num">{{ p.previous === null ? '—' : format()(p.previous) }}</td></tr>
            }
          </tbody>
          <tfoot><tr><td>Total</td><td class="num">{{ format()(totalCurrent()) }}</td><td class="num">{{ format()(totalPrevious()) }}</td></tr></tfoot>
        </table>
      </div>
    }
  `,
})
export class CompareChart {
  points = input<SeriesPoint[]>([]);
  bucket = input<'day' | 'week'>('day');
  format = input<(v: number) => string>((v) => String(v));
  axisFormat = input<(v: number) => string>((v) => String(v));
  currentLabel = input('This period');
  previousLabel = input('Previous period');
  cumulative = input(true);

  /** Drawn at the container's real width, so text and marks stay legible from phone to desktop. */
  private width = signal(760);
  get W(): number { return this.width(); }
  get H(): number { return this.width() < 480 ? 220 : 260; }

  constructor() {
    const el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const ro = new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w > 0) this.width.set(w); });
      ro.observe(el);
      destroy.onDestroy(() => ro.disconnect());
    });
  }
  readonly PAD_L = 56;
  readonly PAD_R = 12;
  readonly PAD_T = 12;
  readonly PAD_B = 28;

  asTable = signal(false);
  /** Sets the view from the page (the landing page scrolls it); null leaves it to the buttons. */
  table = input<boolean | null>(null);
  private follow = effect(() => { const t = this.table(); if (t !== null) this.asTable.set(t); });
  hover = signal<number | null>(null);

  /** Cumulative series read as "running total so far" and make period comparison clear. */
  series = computed(() => {
    const pts = this.points();
    if (!this.cumulative()) return pts;
    let c = 0;
    let p = 0;
    return pts.map((pt) => {
      const cur = pt.current === null ? null : (c += pt.current);
      const prev = pt.previous === null ? null : (p += pt.previous);
      return { ...pt, current: cur, previous: prev };
    });
  });

  private max = computed(() => {
    const vals = this.series().flatMap((p) => [p.current ?? 0, p.previous ?? 0]);
    const m = Math.max(...vals, 1);
    const pow = Math.pow(10, Math.floor(Math.log10(m)));
    return Math.ceil(m / pow) * pow;
  });

  ticks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: f, y: this.yAt(this.max() * f), text: this.axisFormat()(this.max() * f) })));

  xAt(i: number): number {
    const n = Math.max(this.points().length - 1, 1);
    return this.PAD_L + (i / n) * (this.W - this.PAD_L - this.PAD_R);
  }
  yAt(v: number): number {
    return this.H - this.PAD_B - (v / this.max()) * (this.H - this.PAD_T - this.PAD_B);
  }
  private line(key: 'current' | 'previous'): string {
    let d = '';
    this.series().forEach((p, i) => {
      const v = p[key];
      if (v === null) return;
      d += `${d ? 'L' : 'M'}${this.xAt(i).toFixed(1)},${this.yAt(v).toFixed(1)}`;
    });
    return d;
  }
  curPath = computed(() => this.line('current'));
  prevPath = computed(() => this.line('previous'));
  areaPath = computed(() => {
    const s = this.series();
    const idx = s.map((p, i) => (p.current === null ? -1 : i)).filter((i) => i >= 0);
    if (idx.length < 2) return '';
    const base = this.yAt(0);
    return `M${this.xAt(idx[0])},${base} ` + idx.map((i) => `L${this.xAt(i).toFixed(1)},${this.yAt(s[i].current!).toFixed(1)}`).join(' ') + ` L${this.xAt(idx[idx.length - 1])},${base} Z`;
  });
  xLabels = computed(() => {
    const n = this.points().length;
    const step = Math.max(1, Math.ceil(n / (this.W < 480 ? 4 : 7)));
    return this.points().map((p, i) => ({ i, x: this.xAt(i), text: formatDate(p.label) })).filter((x) => x.i % step === 0);
  });
  totalCurrent = computed(() => this.points().reduce((a, p) => a + (p.current ?? 0), 0));
  totalPrevious = computed(() => this.points().reduce((a, p) => a + (p.previous ?? 0), 0));
  lastIndex = computed(() => {
    const s = this.points();
    for (let i = s.length - 1; i >= 0; i--) if (s[i].current !== null) return i;
    return 0;
  });
  ariaSummary = computed(() => `${this.currentLabel()} running total ${this.format()(this.totalCurrent())}; ${this.previousLabel()} ${this.format()(this.totalPrevious())}. Use arrow keys to inspect each ${this.bucket()}.`);

  bucketText(i: number): string {
    const label = this.points()[i]?.label;
    const prefix = this.cumulative() ? 'Through ' : '';
    return this.bucket() === 'week' ? `${prefix}week of ${formatDate(label)}` : prefix + formatDate(label, 'day');
  }

  onMove(e: MouseEvent): void {
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.W;
    const n = this.points().length - 1;
    const i = Math.round(((x - this.PAD_L) / (this.W - this.PAD_L - this.PAD_R)) * n);
    this.hover.set(Math.min(Math.max(i, 0), n));
  }

  onKey(e: KeyboardEvent): void {
    const n = this.points().length - 1;
    const cur = this.hover() ?? this.lastIndex();
    if (e.key === 'ArrowRight') { this.hover.set(Math.min(cur + 1, n)); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { this.hover.set(Math.max(cur - 1, 0)); e.preventDefault(); }
    if (e.key === 'Escape') this.hover.set(null);
  }
}
