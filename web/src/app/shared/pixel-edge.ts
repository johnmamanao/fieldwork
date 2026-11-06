import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, signal, DestroyRef } from '@angular/core';

/**
 * The seam between a light and a dark section: the next section's colour rises
 * in stepped blocks, with a broken strip of accent pixels across the middle.
 * Seeded, so it is the same on every visit.
 */
@Component({
  selector: 'fw-pixel-edge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`:host { display: block; height: 160px; overflow: hidden; } svg { display: block; width: 100%; height: 100%; } @media (max-width: 720px) { :host { height: 96px; } }`],
  template: `
    <svg [attr.viewBox]="'0 0 ' + w() + ' 160'" preserveAspectRatio="none" aria-hidden="true" [style.background]="from()">
      @for (b of blocks(); track $index) { <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" [attr.fill]="b.c" shape-rendering="crispEdges" /> }
    </svg>
  `,
})
export class PixelEdge {
  readonly from = input('#f5f4f2');
  readonly to = input('#121214');
  readonly seed = input(1);
  /** Accent shades for the strip; light-on-dark seams use paler ones. */
  readonly strip = input<string[]>(['#f0512a', '#e24a25', '#ff9a78', '#ffc2ad', '#b4351a']);

  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  w = signal(1440);

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const ro = new ResizeObserver(() => this.w.set(Math.max(320, Math.round(this.host.clientWidth))));
      ro.observe(this.host);
      destroy.onDestroy(() => ro.disconnect());
    });
  }

  blocks = computed(() => {
    const W = this.w(), to = this.to(), strip = this.strip();
    let s = this.seed() * 9301 + 49297;
    const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    const out: { x: number; y: number; w: number; h: number; c: string }[] = [];
    const unit = W < 720 ? 12 : 20;
    // the rising silhouette: columns of the next colour, stepped in whole units
    out.push({ x: 0, y: 160 - unit * 2, w: W, h: unit * 2, c: to });
    for (let x = 0; x < W; ) {
      const cw = unit * (2 + Math.floor(rnd() * 5));
      const h = unit * Math.floor(rnd() * 4);
      if (h) out.push({ x, y: 160 - unit * 2 - h, w: cw, h: h + 1, c: to });
      x += cw;
    }
    // the broken accent strip, sitting just above the silhouette
    for (let x = 0; x < W; ) {
      const cw = unit * (1 + Math.floor(rnd() * 6));
      if (rnd() > 0.38) {
        const row = Math.floor(rnd() * 2);
        out.push({ x, y: 160 - unit * (6 - row), w: cw, h: unit / 2 + (rnd() > 0.7 ? unit / 2 : 0), c: strip[Math.floor(rnd() * strip.length)] });
      }
      x += cw + (rnd() > 0.6 ? unit : 0);
    }
    return out;
  });
}
