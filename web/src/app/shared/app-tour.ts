import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, signal } from '@angular/core';
import { Icon } from './icon';

interface Stop { src: string; step: string; module: string; icon: string; caption: string; alt: string }

/**
 * The "watch it work" stage: real screens from the seeded demo workspace in a
 * window, step labels above and a dock of modules below. It advances on its own
 * while it is on screen, and any step or dock tile jumps to that screen.
 */
@Component({
  selector: 'fw-app-tour',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  styles: [`
    :host { display: block; color: #eeeef0; --beat: 4200ms; }
    .steps { display: flex; justify-content: center; gap: var(--space-1); flex-wrap: wrap; margin-bottom: var(--space-5); }
    .steps button { all: unset; cursor: pointer; position: relative; height: 36px; padding: 0 var(--space-4); display: inline-flex; align-items: center; gap: var(--space-2); font-family: var(--font-mono); font-size: var(--text-small); font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; color: rgb(238 238 240 / 0.6); border: 1px solid rgb(255 255 255 / 0.1); background: rgb(18 18 20 / 0.6); overflow: hidden; transition: color var(--dur-2) var(--ease-out), border-color var(--dur-2) var(--ease-out); }
    .steps button b { font-weight: 500; color: rgb(238 238 240 / 0.4); }
    .steps button.on { color: #fff; border-color: rgb(240 81 42 / 0.7); }
    .steps button.on b { color: #ff7d55; }
    .steps button i { position: absolute; left: 0; bottom: 0; height: 2px; width: 100%; background: #f0512a; transform: scaleX(0); transform-origin: left; }
    .steps button.on i { animation: fill var(--beat) linear forwards; }
    :host(.paused) .steps button.on i, :host(.away) .steps button.on i { animation-play-state: paused; }
    @keyframes fill { to { transform: none; } }
    .steps button:focus-visible, .dock button:focus-visible, .pp:focus-visible { outline: 2px solid #f0512a; outline-offset: 2px; }
    @media (hover: hover) and (pointer: fine) { .steps button:hover { color: #fff; } }

    .win { max-width: 1040px; margin: 0 auto; border-radius: var(--radius-md); overflow: hidden; background: #fff; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.12), 0 40px 80px -30px rgb(0 0 0 / 0.7); }
    .bar { height: 36px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 0 var(--space-4); background: #f4f4f5; border-bottom: 1px solid #e6e6e8; color: #55565c; font-size: var(--text-small); font-weight: 500; }
    .bar .dots { display: flex; gap: var(--space-2); }
    .bar .dots span { width: 10px; height: 10px; border-radius: 50%; background: #dcdce0; }
    .stage { position: relative; display: grid; aspect-ratio: 1440 / 900; background: #f4f4f5; }
    .stage img { grid-area: 1 / 1; width: 100%; height: 100%; display: block; object-fit: cover; object-position: top left; opacity: 0; visibility: hidden; transition: opacity var(--dur-3) var(--ease-out), visibility 0s linear var(--dur-3); }
    .stage img.on { opacity: 1; visibility: visible; transition-delay: 0s; }

    .dock-wrap { display: flex; flex-direction: column; align-items: center; gap: var(--space-3); margin-top: calc(-1 * var(--space-6)); position: relative; }
    .dock { display: flex; gap: var(--space-2); padding: var(--space-2); border-radius: var(--radius-md); background: rgb(28 27 29 / 0.82); backdrop-filter: blur(12px); box-shadow: 0 0 0 1px rgb(255 255 255 / 0.1), 0 20px 40px -16px rgb(0 0 0 / 0.6); }
    .dock button { all: unset; cursor: pointer; width: 52px; height: 52px; border-radius: var(--radius-md); display: grid; place-items: center; background: #2a292c; color: #c9c9cf; transition: translate var(--dur-2) var(--ease-out), background-color var(--dur-2) var(--ease-out), color var(--dur-2) var(--ease-out); }
    .dock ::ng-deep svg { width: 22px; height: 22px; }
    .dock button.on { background: #f0512a; color: #121214; translate: 0 -6px; }
    @media (hover: hover) and (pointer: fine) { .dock button:not(.on):hover { background: #363538; color: #fff; } }
    .pp { all: unset; cursor: pointer; width: 52px; height: 52px; border-radius: var(--radius-md); display: grid; place-items: center; color: #c9c9cf; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12); }
    .hint { font-size: var(--text-body); font-weight: 500; color: rgb(238 238 240 / 0.72); text-align: center; min-height: 1.4em; }
    .hint b { font-weight: 500; color: #fff; }
    @media (max-width: 720px) {
      .steps { justify-content: flex-start; }
      .steps button { padding: 0 var(--space-3); }
      .bar { height: 32px; }
      .dock-wrap { margin-top: var(--space-4); }
      .dock { gap: var(--space-1); padding: var(--space-2); } .dock button, .pp { width: 44px; height: 44px; border-radius: var(--radius-md); }
    }
    @media (prefers-reduced-motion: reduce) { .stage img { transition: opacity 120ms linear; } .dock button { transition: none; } .dock button.on { translate: none; } }
  `],
  host: { '[class.paused]': 'paused()', '[class.away]': '!visible()' },
  template: `
    <div class="steps" role="group" aria-label="Steps">
      @for (s of stops; track s.src; let k = $index) {
        <button type="button" [class.on]="k === i()" [attr.aria-pressed]="k === i()" (click)="go(k)"><b>{{ k + 1 }}.</b>{{ s.step }}<i></i></button>
      }
    </div>
    <div class="win" data-seenry-product>
      <div class="bar"><span class="dots" aria-hidden="true"><span></span><span></span><span></span></span><span>Larkspur &amp; Co. · {{ stops[i()].module }}</span><span></span></div>
      <div class="stage">
        @for (s of stops; track s.src; let k = $index) {
          <img [src]="s.src" [alt]="k === i() ? s.alt : ''" [attr.aria-hidden]="k !== i()" [class.on]="k === i()" loading="lazy" width="1800" height="1125" />
        }
      </div>
    </div>
    <div class="dock-wrap">
      <div class="dock" role="group" aria-label="Modules">
        @for (s of stops; track s.src; let k = $index) {
          <button type="button" [class.on]="k === i()" [attr.aria-label]="s.module" [attr.aria-pressed]="k === i()" (click)="go(k)"><fw-icon [name]="s.icon" /></button>
        }
        <button type="button" class="pp" [attr.aria-label]="paused() ? 'Play the tour' : 'Pause the tour'" (click)="toggle()"><fw-icon [name]="paused() ? 'play' : 'stop'" /></button>
      </div>
      <p class="hint" aria-live="polite"><b>{{ stops[i()].module }}</b> · {{ stops[i()].caption }}</p>
    </div>
  `,
})
export class AppTour {
  readonly beat = 4200;
  readonly stops: Stop[] = [
    { src: '/landing/tour-time.webp', step: 'Log', module: 'Time', icon: 'time', caption: 'The week, logged and submitted',
      alt: 'Fieldwork Time page: a weekly timesheet with hours per project and a Submit week button.' },
    { src: '/landing/tour-approve.webp', step: 'Approve', module: 'Approvals', icon: 'check', caption: 'Approved, with rates locked',
      alt: 'The Approvals tab: submitted entries by person and project, ready to approve.' },
    { src: '/landing/tour-invoice.webp', step: 'Invoice', module: 'Invoices', icon: 'invoices', caption: 'Approved time on one invoice',
      alt: 'An invoice for Halden Outdoor Co. built from approved time line items.' },
    { src: '/landing/tour-payments.webp', step: 'Get paid', module: 'Payments', icon: 'payments', caption: 'Settled transfers close balances',
      alt: 'The Payments page: bank transfers by client with settled, pending and reversed statuses.' },
    { src: '/landing/tour-overview.webp', step: 'See it', module: 'Overview', icon: 'overview', caption: 'The dashboard reads the same records',
      alt: 'The Overview dashboard: billable hours, collected revenue, outstanding balances and projects that need attention.' },
  ];
  i = signal(0);
  paused = signal(false);
  visible = signal(false);
  private t: ReturnType<typeof setTimeout> | null = null;
  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    const destroy = inject(DestroyRef);
    const restart = () => this.schedule();
    document.addEventListener('visibilitychange', restart);
    destroy.onDestroy(() => { this.clear(); document.removeEventListener('visibilitychange', restart); });
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) this.paused.set(true);
    afterNextRender(() => {
      const io = new IntersectionObserver(([e]) => { this.visible.set(e.isIntersecting); this.schedule(); }, { threshold: 0.35 });
      io.observe(this.host);
      destroy.onDestroy(() => io.disconnect());
    });
  }

  go(k: number): void { this.i.set(k); this.schedule(); }
  toggle(): void { this.paused.update((p) => !p); this.schedule(); }

  private clear(): void { if (this.t) clearTimeout(this.t); this.t = null; }
  private schedule(): void {
    this.clear();
    if (this.paused() || !this.visible() || document.hidden) return;
    this.t = setTimeout(() => { this.i.update((k) => (k + 1) % this.stops.length); this.schedule(); }, this.beat);
  }
}
