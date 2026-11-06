import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * A billing week taken apart: the five records Fieldwork keeps, drawn as
 * isometric sheets stacked bottom to top (time, approval, invoice, payment,
 * overview). `step` says how many have landed; the newest is drawn in accent.
 * Each sheet is drawn flat in its own 320 x 200 plane and projected with one
 * isometric matrix, so its lines and labels lie on the sheet.
 */
@Component({
  selector: 'fw-iso-records',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; }
    svg { display: block; width: 100%; height: auto; overflow: visible; }
    .sheet { transition: opacity 420ms var(--ease-out), translate 520ms var(--ease-out); }
    .sheet.off { opacity: 0; translate: 0 -36px; }
    .plate { fill: #fff; stroke: #121214; stroke-opacity: 0.55; stroke-width: 1; transition: fill 240ms var(--ease-out), stroke 240ms var(--ease-out); }
    .on .plate { fill: #fff6f2; stroke: #f0512a; stroke-opacity: 1; stroke-width: 1.4; }
    .ln { stroke: #121214; stroke-opacity: 0.28; stroke-width: 1; fill: none; }
    .blk { fill: #121214; fill-opacity: 0.12; }
    .on .blk.hot { fill: #f0512a; fill-opacity: 0.85; }
    .blk.hot { fill: #121214; fill-opacity: 0.55; }
    .tx { font-family: var(--font-mono); font-size: var(--text-small); letter-spacing: 0.04em; fill: #121214; fill-opacity: 0.75; text-transform: uppercase; }
    .on .tx.k { fill: #c93d1d; fill-opacity: 1; }
    .big { font-family: var(--font-sans); font-size: var(--text-xl); font-weight: 500; letter-spacing: -0.02em; fill: #121214; }
    .tab { fill: #121214; }
    .on .tab { fill: #f0512a; }
    .tabtx { font-family: var(--font-mono); font-size: var(--text-small); letter-spacing: 0.04em; fill: #fff; }
    .post { stroke: #121214; stroke-opacity: 0.35; stroke-dasharray: 3 4; transition: opacity 420ms var(--ease-out); }
    .post.off { opacity: 0; }
    .ground { fill: none; stroke: #121214; stroke-opacity: 0.07; }
    @media (prefers-reduced-motion: reduce) { .sheet, .post { transition: opacity 120ms linear; } .sheet.off { translate: none; } }
  `],
  template: `
    <svg viewBox="96 0 512 620" role="img" [attr.aria-label]="label()">
      <!-- ground grid under the stack -->
      <g [attr.transform]="'matrix(' + M + ' 300 ' + (base + 34) + ')'" >
        @for (g of gx; track g) { <path class="ground" [attr.d]="'M' + g + ' -30V230'" /> }
        @for (g of gy; track g) { <path class="ground" [attr.d]="'M-30 ' + g + 'H350'" /> }
      </g>
      <!-- corner posts between landed sheets -->
      @for (s of sheets; track s.key; let i = $index) {
        @if (i > 0) {
          @for (c of corners; track $index) {
            <line class="post" [class.off]="step() < i + 1" [attr.x1]="px(c[0], c[1]) + 300" [attr.y1]="py(c[0], c[1]) + base - (i - 1) * gap" [attr.x2]="px(c[0], c[1]) + 300" [attr.y2]="py(c[0], c[1]) + base - i * gap" />
          }
        }
      }
      @for (s of sheets; track s.key; let i = $index) {
        <g class="sheet" [class.off]="step() < i + 1" [class.on]="step() === i + 1" [attr.transform]="'matrix(' + M + ' 300 ' + (base - i * gap) + ')'">
          <rect class="plate" x="0" y="0" width="320" height="200" rx="6" />
          <rect class="tab" x="14" y="-11" [attr.width]="s.tab.length * 8.8 + 20" height="24" rx="3" />
          <text class="tabtx" x="24" y="5">{{ s.tab }}</text>
          @switch (s.key) {
            @case ('time') {
              @for (r of [0,1,2,3]; track r) {
                @for (c of [0,1,2,3,4]; track c) {
                  <rect class="blk" [class.hot]="(r + c) % 3 === 0" [attr.x]="22 + c * 56" [attr.y]="34 + r * 34" width="48" height="24" rx="3" />
                }
              }
              <text class="tx k" x="22" y="186">Trail app · 12.5 h</text>
            }
            @case ('approve') {
              @for (r of [0,1,2,3]; track r) {
                <rect class="blk" [class.hot]="r < 3" x="22" [attr.y]="36 + r * 34" width="18" height="18" rx="3" />
                <path class="ln" [attr.d]="'M54 ' + (45 + r * 34) + 'H' + (210 - r * 18)" />
                <text class="tx" x="244" [attr.y]="49 + r * 34">{{ ['$185', '$185', '$185', '—'][r] }}</text>
              }
              <text class="tx k" x="22" y="186">12.5 h at $185</text>
            }
            @case ('invoice') {
              <text class="tx" x="22" y="44">LK-0031 · Trail app</text>
              @for (r of [0,1,2]; track r) { <path class="ln" [attr.d]="'M22 ' + (70 + r * 22) + 'H' + (238 - r * 30)" /><rect class="blk" x="258" [attr.y]="63 + r * 22" width="40" height="12" rx="2" /> }
              <text class="big" x="22" y="164">$2,312.50</text>
              <text class="tx k" x="22" y="186">12.5 h, billed once</text>
            }
            @case ('pay') {
              <rect class="blk hot" x="22" y="34" width="276" height="44" rx="6" />
              <text class="tx" x="36" y="61" style="fill:#fff;fill-opacity:1">$2,312.50 received</text>
              <path class="ln" d="M22 104H298M22 126H210" />
              <text class="big" x="22" y="164">Balance $0.00</text>
              <text class="tx k" x="22" y="186">LK-0031 closed</text>
            }
            @case ('see') {
              @for (b of [52, 70, 44, 88, 64, 104, 92]; track $index; let j = $index) {
                <rect class="blk" [class.hot]="j === 5" [attr.x]="22 + j * 30" [attr.y]="150 - b" width="20" [attr.height]="b" rx="2" />
              }
              <text class="big" x="244" y="88">$164k</text>
              <text class="tx" x="244" y="108">Collected</text>
              <text class="tx k" x="22" y="186">+$2,312.50 collected</text>
            }
          }
        </g>
      }
    </svg>
  `,
})
export class IsoRecords {
  /** How many sheets have landed, 0 to 5. */
  readonly step = input(5);
  readonly M = '0.866 0.5 -0.866 0.5';
  readonly base = 330;
  readonly gap = 76;
  readonly gx = [-30, 10, 50, 90, 130, 170, 210, 250, 290, 330];
  readonly gy = [-30, 10, 50, 90, 130, 170, 210];
  readonly corners: [number, number][] = [[0, 0], [320, 0], [320, 200], [0, 200]];
  readonly sheets = [
    { key: 'time', tab: 'Time entry' },
    { key: 'approve', tab: 'Approval' },
    { key: 'invoice', tab: 'Invoice' },
    { key: 'pay', tab: 'Payment' },
    { key: 'see', tab: 'Overview' },
  ];
  px(x: number, y: number): number { return 0.866 * x - 0.866 * y; }
  py(x: number, y: number): number { return 0.5 * x + 0.5 * y; }
  label = computed(() => 'Five records stacked: a time entry, its approval, the invoice that bills it, the payment that settles it, and the overview that reads them.');
}
