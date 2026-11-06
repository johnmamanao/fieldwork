import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Session } from '../core/session';
import { HoursField } from '../shared/hours-field';
import { ParticleWord } from '../shared/particle-word';
import { Scramble } from '../shared/scramble';

/**
 * A rare screen, so it gets the landing page's pixel moment: the hours grid
 * behind, "404" in ASCII characters that scatter under the pointer, and the
 * ledger card telling the visitor what was asked for and what matched.
 */
@Component({
  selector: 'fw-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HoursField, ParticleWord, Scramble],
  styles: [`
    :host { position: relative; isolation: isolate; display: grid; place-items: center; min-height: 100vh; min-height: 100dvh; padding: var(--space-6) var(--space-4); background: #b4351a; overflow: hidden; }
    :host > fw-hours-field { z-index: -1; }
    .wrap { width: 100%; max-width: 520px; }
    .word { position: relative; height: 132px; background: #121214; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.1); }
    .card { position: relative; background: #fff; padding: var(--space-6); text-align: center; box-shadow: 0 30px 60px -24px rgb(0 0 0 / 0.45); animation: dialog-in var(--dur-3) var(--ease-out) both; }
    .sq { position: absolute; width: 5px; height: 5px; background: #f0512a; }
    .code { margin: 0; font-family: var(--font-mono); font-size: var(--text-small); font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; color: #55565c; display: flex; justify-content: center; gap: var(--space-2); }
    .code span { color: #a1a1aa; } .code em { font-style: normal; color: #f0512a; }
    h1 { font-size: var(--text-headline); line-height: 1.2; letter-spacing: -0.025em; font-weight: 500; margin-top: var(--space-3); }
    p { color: var(--color-text-secondary); margin-top: var(--space-2); }
    .ledger { margin: var(--space-5) auto var(--space-6); max-width: 340px; text-align: left; background: #f5f4f2; padding: var(--space-2) var(--space-3); font-size: var(--text-small); }
    .ledger div { display: flex; justify-content: space-between; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px dashed rgb(18 18 20 / 0.14); }
    .ledger div:last-child { border-bottom: 0; }
    .ledger b { font-family: var(--font-mono); font-weight: 500; }
    .ledger .miss b { color: #c93d1d; }
    .row { display: flex; gap: var(--space-5); justify-content: center; flex-wrap: wrap; padding-inline: var(--space-2); }
    @media (max-width: 560px) { .card { padding: var(--space-5) var(--space-4); } .word { height: 96px; } }
    @media (prefers-reduced-motion: reduce) { .card { animation: none; } }
  `],
  template: `
    <fw-hours-field [cell]="18" [clearW]="0.3" [clearH]="0.36" [clearY]="0.5" [sink]="0" />
    <div class="wrap">
      <div class="word"><fw-particle-word text="404" /></div>
      <div class="card">
        <i class="sq" style="left:-3px;bottom:-3px"></i><i class="sq" style="right:-3px;bottom:-3px"></i>
        <p class="code"><span>[</span>404<span>]</span><b fwScramble style="font-weight:inherit">Not on the ledger</b><em>+</em></p>
        <h1>This page isn't on the ledger</h1>
        <p>The link may be old, or the record was moved to another workspace.</p>
        <div class="ledger" aria-hidden="true">
          <div><span>Requested</span><b class="truncate">{{ path }}</b></div>
          <div class="miss"><span>Matched</span><b>0 records</b></div>
        </div>
        <div class="row">
          <button class="pxb line" type="button" (click)="back()"><span fwScramble="hover">Go back</span></button>
          <a class="pxb accent" [routerLink]="session.token() ? '/overview' : '/'"><span fwScramble="hover">{{ session.token() ? 'Open overview' : 'Home page' }}</span></a>
        </div>
      </div>
    </div>
  `,
})
export class NotFoundPage {
  session = inject(Session);
  private location = inject(Location);
  private router = inject(Router);
  path = this.router.url.length > 32 ? this.router.url.slice(0, 31) + '…' : this.router.url;
  back(): void { history.length > 1 ? this.location.back() : this.router.navigateByUrl('/'); }
}
