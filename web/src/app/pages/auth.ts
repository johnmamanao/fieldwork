import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, apiError } from '../core/api';
import { Profile, Session } from '../core/session';
import { Icon } from '../shared/icon';
import { HoursField } from '../shared/hours-field';
import { ParticleWord } from '../shared/particle-word';
import { Scramble } from '../shared/scramble';

/* ---------------------------------------------------------------------------
   Shared pieces
   ------------------------------------------------------------------------- */

/**
 * The front door for every auth screen, in the landing page's language: a
 * vermilion pixel panel on the left (the landing hero's field and streak, the
 * claim, one real figure from the demo studio and the ASCII wordmark), and on
 * the right the warm light ground with a framed card holding the form. On
 * narrow screens the pixel panel becomes a short band above the form.
 * The sign-in page passes the demo roster inside the card; nothing else changes.
 */
@Component({
  selector: 'fw-auth-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HoursField, ParticleWord, Scramble],
  host: { '[class.duo]': 'duo()' },
  styles: [`
    :host { display: grid; grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr); min-height: 100vh; min-height: 100dvh; background: #f5f4f2; }

    /* the pixel panel */
    .pix { border-radius: 0; position: sticky; top: 0; height: 100vh; height: 100dvh; isolation: isolate; overflow: hidden; background: #b4351a; color: #fff; display: flex; flex-direction: column; padding: var(--space-6) var(--space-7) 0; }
    .pix > fw-hours-field { z-index: -1; }
    .brand { display: inline-flex; align-items: center; gap: var(--space-2); align-self: flex-start; height: 40px; padding: 0 var(--space-3) 0 var(--space-2); background: #121214; color: #fff; font-weight: 600; font-size: var(--text-large); letter-spacing: -0.02em; text-decoration: none; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.08); }
    .brand { transition: background-color var(--dur-1) var(--ease-out); }
    .brand:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
    .logo { width: 26px; height: 26px; border-radius: 28%; background: #fff; display: grid; place-items: center; flex: none; }
    .claim { margin-top: auto; padding-bottom: var(--space-6); }
    .idx { margin: 0 0 var(--space-4); font-family: var(--font-mono); font-size: var(--text-small); font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; color: #ffd9cc; display: flex; gap: var(--space-2); }
    .idx span { color: #ff9a78; }
    .claim h2 { margin: 0; font-size: clamp(2rem, 3.2vw, 2.75rem); line-height: 1.12; letter-spacing: -0.025em; font-weight: 500; max-width: 15ch; text-wrap: balance; }
    .claim h2 span { color: #ffcdbd; }
    .co { position: relative; margin-top: var(--space-6); width: min(100%, 300px); background: #121214; padding: var(--space-4) var(--space-5); box-shadow: 0 0 0 1px rgb(255 255 255 / 0.14), 0 24px 40px -18px rgb(0 0 0 / 0.6); }
    .co .sq { position: absolute; width: 4px; height: 4px; background: #f0512a; }
    .co small { display: block; font-family: var(--font-mono); font-size: var(--text-small); font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; color: #ff9a78; }
    .co b { display: block; margin-top: var(--space-2); font-size: var(--text-stat); line-height: 1; font-weight: 500; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
    .co p { margin: var(--space-2) 0 var(--space-3); font-size: var(--text-body); color: #c9c9cf; }
    .co p em { font-style: normal; color: #ff8a64; font-weight: 600; }
    .bar { display: grid; grid-template-columns: 46fr 54fr; gap: var(--space-1); height: 8px; } .bar i { background: #f0512a; } .bar i + i { background: #3a393d; }
    .word { position: relative; height: 150px; margin: 0 calc(-1 * var(--space-7)); background: #121214; }

    /* the form side */
    .side { display: flex; flex-direction: column; min-width: 0; }
    .top { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-3); min-height: 104px; padding: var(--space-6) var(--space-7) 0; }
    .stage { flex: 1; width: 100%; max-width: 488px; margin: 0 auto; padding: var(--space-6) var(--space-4) var(--space-8); display: grid; align-content: center; }
    .card { --card-px: 32px; --card-py: 32px; position: relative; background: #fff; padding: var(--card-py) var(--card-px); box-shadow: 0 0 0 1px rgb(18 18 20 / 0.1), 0 30px 60px -30px rgb(18 18 20 / 0.25); animation: card-in var(--dur-3) var(--ease-out) both; min-width: 0; }
    .card > .sq { position: absolute; width: 5px; height: 5px; background: #f0512a; }

    @media (max-width: 1000px) {
      :host { grid-template-columns: minmax(0, 1fr); }
      .pix { position: relative; height: auto; padding: var(--space-4) var(--space-4) 0; }
      .claim { padding: var(--space-7) 0 var(--space-6); }
      .claim h2 { font-size: var(--text-figure); }
      .co { display: none; }
      .word { height: 72px; margin: 0 calc(-1 * var(--space-4)); }
      .top { min-height: 0; padding: var(--space-5) var(--space-4) 0; justify-content: center; }
      .stage { padding: var(--space-5) var(--space-4) var(--space-7); align-content: start; }
    }
    @media (max-width: 560px) { .card { --card-px: 20px; --card-py: 24px; } .claim h2 { font-size: var(--text-headline); } }
    @media (prefers-reduced-motion: reduce) { .card { animation: none; } }
  `],
  template: `
    <aside class="pix">
      <fw-hours-field [cell]="16" [clearX]="0.3" [clearY]="0.62" [clearW]="0.6" [clearH]="0.24" [sink]="0.12" />
      <a class="brand" routerLink="/" aria-label="Fieldwork home"><span class="logo"><svg width="100%" height="100%" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 24V14a6 6 0 0 1 6-6h10" stroke="#121214" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M14 24v-4a4 4 0 0 1 4-4h6" stroke="#121214" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="22.5" cy="22.5" r="2.6" fill="#f0512a"/></svg></span>Fieldwork</a>
      <div class="claim">
        <p class="idx"><span>[</span>FW<span>]</span><b fwScramble style="font-weight:inherit">Time to payment</b><span>+</span></p>
        <h2>Approved hours, billed once <span>and closed by a payment.</span></h2>
        <div class="co" aria-label="In the demo studio, $175k is outstanding and $80.7k of it is overdue on 5 invoices.">
          <i class="sq" style="left:-2px;top:-2px"></i><i class="sq" style="right:-2px;bottom:-2px"></i>
          <small>Demo · Outstanding</small><b>$175k</b><p><em>$80.7k</em> overdue on 5 invoices</p>
          <div class="bar" aria-hidden="true"><i></i><i></i></div>
        </div>
      </div>
      <div class="word"><fw-particle-word text="Fieldwork" /></div>
    </aside>
    <div class="side">
      <header class="top"><ng-content select="[top]" /></header>
      <main class="stage">
        <div class="card">
          <i class="sq" style="left:-3px;top:-3px"></i><i class="sq" style="right:-3px;top:-3px"></i><i class="sq" style="left:-3px;bottom:-3px"></i><i class="sq" style="right:-3px;bottom:-3px"></i>
          <ng-content />
        </div>
      </main>
    </div>
  `,
})
export class AuthFrame {
  /** Kept for the sign-in page's call; the roster now lives inside the card. */
  duo = input(false);
}

/** Password input with a show/hide toggle and an optional strength meter. */
@Component({
  selector: 'fw-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  styles: [`
    :host { display: block; }
    .wrap { position: relative; }
    .wrap .input { height: var(--control-lg); padding-right: var(--control-lg); border-radius: 0; }
    .eye { position: absolute; right: 4px; top: 50%; translate: 0 -50%; width: 34px; height: 34px; border: 0; background: transparent; border-radius: 0; color: var(--color-text-tertiary); display: grid; place-items: center; cursor: pointer; transition: color var(--dur-2) var(--ease-out), background-color var(--dur-2) var(--ease-out); }
    .eye:hover { color: var(--color-text); background: var(--color-bg-selected); }
    .eye:active { scale: 0.94; }
    .eye svg { transition: opacity var(--dur-1) var(--ease-out); }
    .strength { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-1); margin-top: var(--space-2); }
    .strength i { height: var(--space-1); border-radius: 0; background: var(--color-bg-selected); transition: background-color var(--dur-2) var(--ease-out); }
    .strength i.on.s1 { background: var(--color-danger); }
    .strength i.on.s2 { background: var(--color-warning); }
    .strength i.on.s3, .strength i.on.s4 { background: var(--color-positive); }
    .verdict { display: flex; justify-content: space-between; margin-top: var(--space-2); font-size: var(--text-micro); color: var(--color-text-tertiary); }
    .verdict b { font-weight: 600; color: var(--color-text-secondary); }
  `],
  template: `
    <div class="wrap">
      <input class="input" [id]="inputId()" [type]="shown() ? 'text' : 'password'" [name]="inputId()" [attr.autocomplete]="autocomplete()" [ngModel]="value()" (ngModelChange)="value.set($event)" [attr.aria-invalid]="invalid() || null" [attr.aria-describedby]="meter() ? inputId() + '-strength' : null" />
      <button class="eye" type="button" (click)="shown.set(!shown())" [attr.aria-label]="shown() ? 'Hide password' : 'Show password'" [attr.aria-pressed]="shown()">
        @if (shown()) {
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.4 5.2A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7M6.3 6.3C4.3 7.6 2.7 9.6 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.6-1.3"/></svg>
        } @else {
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
        }
      </button>
    </div>
    @if (meter()) {
      <div class="strength" aria-hidden="true">@for (n of [1, 2, 3, 4]; track n) { <i [class]="'s' + score()" [class.on]="score() >= n"></i> }</div>
      <div class="verdict" [id]="inputId() + '-strength'" aria-live="polite"><span>{{ value().length < 10 ? (10 - value().length) + ' more characters needed' : 'Length is fine' }}</span><b>{{ verdict() }}</b></div>
    }
  `,
})
export class PasswordField {
  value = model('');
  inputId = input('password');
  autocomplete = input('current-password');
  meter = input(false);
  invalid = input(false);
  shown = signal(false);
  score = computed(() => {
    const v = this.value();
    if (!v) return 0;
    let s = v.length >= 10 ? 1 : 0;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) s++;
    if (/\d/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v) || v.length >= 16) s++;
    return Math.max(1, Math.min(4, s));
  });
  verdict = computed(() => (!this.value() ? '' : ['', 'Weak', 'Fair', 'Good', 'Strong'][this.score()]));
}

/** Spinner shown inside a busy button; the label stays so the width holds. */
const SPIN = `@if (busy()) { <span class="spinner" aria-hidden="true"></span> }`;

const PAGE_STYLES = `
  h1 { font-size: var(--text-headline); line-height: 1.2; letter-spacing: -0.025em; font-weight: 500; }
  .field label { font-family: var(--font-mono); font-size: var(--text-small); font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; color: #45464c; }
  form .input { border-radius: 0; }
  .lead { color: var(--color-text-secondary); margin: var(--space-1) 0 var(--space-5); font-size: var(--text-lead); line-height: 1.55; font-weight: 500; }
  form .input { height: var(--control-lg); }
  h1.solo { margin-bottom: var(--space-6); }
  .field .spread { min-height: var(--control-sm); align-items: center; }
  form { display: flex; flex-direction: column; gap: var(--space-4); }
  form .pxb, .sent .pxb { width: calc(100% - 16px); margin: var(--space-1) 8px 0; }
  /* the demo: its own quieter zone at the foot of the sign-in card, grouped by workspace, one action per role */
  .demo { margin: var(--space-6) calc(-1 * var(--card-px)) calc(-1 * var(--card-py)); padding: var(--space-3) var(--card-px); background: #f5f4f2; border-top: 1px solid rgb(18 18 20 / 0.1); }
  .demo h2 { margin: 0 calc(-1 * var(--space-3)); }
  .toggle { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: 0; transition: background-color var(--dur-1) var(--ease-out); }
  @media (hover: hover) and (pointer: fine) { .toggle:hover { background: var(--color-bg-surface); } }
  .toggle:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
  .toggle > span { display: grid; }
  .toggle .t { font-size: var(--text-heading); line-height: var(--lh-heading); letter-spacing: -0.01em; font-weight: 500; color: var(--color-text); }
  .toggle .s { font-size: var(--text-body); line-height: var(--lh-body); font-weight: 400; color: var(--color-text-secondary); }
  .toggle .chev { flex: none; color: var(--color-text-secondary); transition: rotate var(--dur-2) var(--ease-out); }
  .toggle[aria-expanded="true"] .chev { rotate: 180deg; }
  .demo .body { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows var(--dur-3) var(--ease-out), opacity var(--dur-2) var(--ease-out); }
  .demo .body.open { grid-template-rows: 1fr; opacity: 1; }
  .demo .body > .inner { min-height: 0; overflow: hidden; }
  .group { margin-top: var(--space-3); }
  .group:last-child { padding-bottom: var(--space-2); }
  .group h3 { margin-bottom: var(--space-2); font-family: var(--font-mono); font-size: var(--text-small); line-height: var(--lh-small); font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; color: #55565c; }
  .people { display: grid; gap: calc(var(--space-1) / 2); margin: 0 calc(-1 * var(--space-3)); }
  .person { all: unset; box-sizing: border-box; width: 100%; min-height: var(--control-primary); cursor: pointer; display: grid; grid-template-columns: 9.5rem minmax(0, 1fr) var(--space-5); align-items: center; column-gap: var(--space-3); padding: 0 var(--space-3); border-radius: 0; font-size: var(--text-body); line-height: var(--lh-body); animation: card-in var(--dur-3) var(--ease-out) both; transition: background-color var(--dur-1) var(--ease-out), box-shadow var(--dur-1) var(--ease-out), scale var(--dur-1) var(--ease-out), opacity var(--dur-2) var(--ease-out); }
  @media (hover: hover) and (pointer: fine) { .person:hover:not([disabled]) { background: var(--color-bg-surface); box-shadow: var(--shadow-ring); } .person:hover:not([disabled]) .arrow { color: var(--color-text); translate: 2px 0; } }
  .person:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
  .person:active:not([disabled]) { scale: 0.99; }
  .person[disabled] { cursor: default; opacity: 0.5; }
  .person.going { opacity: 1; background: var(--color-bg-surface); box-shadow: var(--shadow-ring); }
  .person .role { font-weight: 500; color: var(--color-text); white-space: nowrap; }
  .person .name { min-width: 0; font-weight: 400; color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .person .arrow { justify-self: end; display: grid; place-items: center; color: var(--color-text-tertiary); transition: color var(--dur-1) var(--ease-out), translate var(--dur-1) var(--ease-out); }
  .person .spinner { width: var(--space-4); height: var(--space-4); border-radius: var(--radius-full); border: 2px solid currentColor; border-right-color: transparent; animation: pop-in var(--dur-2) var(--ease-out), spin 700ms linear infinite; color: var(--color-text); }
  @media (max-width: 560px) { .person { min-height: calc(var(--space-7) + var(--space-2)); grid-template-columns: minmax(0, 1fr) var(--space-5); grid-template-rows: auto auto; padding: var(--space-2) var(--space-3); } .person .name { grid-column: 1; grid-row: 2; } .person .arrow { grid-column: 2; grid-row: 1 / 3; } }
  .alt { margin-top: var(--space-5); text-align: center; font-size: var(--text-small); color: var(--color-text-secondary); }
  .alt a { font-weight: 600; }
  .top-link { font-size: var(--text-small); font-weight: 500; color: var(--color-text-secondary); }
  .top-link a { margin-left: var(--space-1); font-family: var(--font-mono); font-size: var(--text-small); font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; color: var(--color-text); text-decoration: none; box-shadow: inset 0 -1px 0 #f0512a; }
  .top-link a, .spread a, .alt a, .sent a { transition: color var(--dur-1) var(--ease-out), box-shadow var(--dur-1) var(--ease-out); }
  .top-link a:hover { box-shadow: inset 0 -2px 0 #f0512a; }
  @media (max-width: 560px) { .top-link .q { display: none; } }
  .steps { display: flex; gap: var(--space-2); margin-bottom: var(--space-5); }
  .steps i { height: var(--space-1); flex: 1; border-radius: var(--radius-full); background: var(--color-bg-selected); transition: background-color var(--dur-3) var(--ease-out); }
  .steps i.on { background: #f0512a; }
  .steps i { border-radius: 0; }
  .sent { text-align: center; padding: var(--space-5) 0; }
  .sent .mail { width: var(--space-8); height: var(--space-8); margin: 0 auto var(--space-4); border-radius: var(--radius-lg); background: var(--color-accent-subtle); color: var(--color-accent-strong); display: grid; place-items: center; animation: pop-in var(--dur-3) var(--ease-out) both; }
  .sent p { color: var(--color-text-secondary); margin-top: var(--space-2); }
  @media (prefers-reduced-motion: reduce) { .demo .body, .toggle .chev { transition: none; } .sent .mail, .person, .person .spinner { animation: none; } .person:active:not([disabled]) { scale: none; } .person:hover .arrow { translate: none; } }
`;

/** Briefly shakes the form after a rejected submit. */
function shaker() {
  const on = signal(false);
  return { on, fire: () => { on.set(false); requestAnimationFrame(() => { on.set(true); setTimeout(() => on.set(false), 320); }); } };
}

interface DemoAccount { email: string; name: string; role: string; workspace: string; password: string; }

/* ---------------------------------------------------------------------------
   Sign in
   ------------------------------------------------------------------------- */

@Component({
  selector: 'fw-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, AuthFrame, PasswordField],
  styles: [PAGE_STYLES],
  template: `
    <fw-auth-frame>
      <span top class="top-link"><span class="q">New studio? </span><a routerLink="/register">Create a workspace</a></span>
      <h1 class="solo">Sign in to Fieldwork</h1>
      @if (notice()) { <div class="alert info" style="margin-bottom: var(--space-4)">{{ notice() }}</div> }
      <form (ngSubmit)="submit()" novalidate [class.shake]="shake.on()">
        <div class="field">
          <label for="email">Email</label>
          <input id="email" class="input" type="email" name="email" autocomplete="username" [(ngModel)]="email" required [attr.aria-invalid]="!!errors().email || null" />
          @if (errors().email) { <span class="error">{{ errors().email }}</span> }
        </div>
        <div class="field">
          <div class="spread"><label for="password">Password</label><a class="small muted" routerLink="/forgot-password">Forgot password?</a></div>
          <fw-password inputId="password" [(value)]="password" [invalid]="!!error()" />
        </div>
        @if (error()) { <div class="form-error" role="alert">{{ error() }}</div> }
        <button class="pxb accent lg" type="submit" [disabled]="busy()">${SPIN}{{ busy() && !going() ? 'Signing in…' : 'Sign in' }}</button>
      </form>

      @if (groups().length) {
        <section class="demo" id="demo" data-seenry-signature aria-labelledby="demo-title">
          <h2><button type="button" class="toggle" id="demo-title" aria-controls="demo-body" [attr.aria-expanded]="demoOpen()" (click)="demoOpen.set(!demoOpen())">
            <span><span class="t">Explore the demo</span><span class="s">Pick a role to enter. No account needed.</span></span>
            <svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          </button></h2>
          <div class="body" id="demo-body" [class.open]="demoOpen()" [attr.inert]="demoOpen() ? null : ''"><div class="inner">
          @for (g of groups(); track g.workspace) {
            <div class="group">
              <h3>{{ g.workspace }}</h3>
              <div class="people">
                @for (a of g.accounts; track a.email; let i = $index) {
                  <button type="button" class="person" (click)="useDemo(a)" [disabled]="busy()" [class.going]="going() === a.email" [style.animation-delay.ms]="i * 30" [attr.aria-label]="'Enter the demo as ' + a.name + ', ' + a.role + ' at ' + a.workspace">
                    <span class="role">{{ a.role }}</span><span class="name">{{ a.name }}</span>
                    <span class="arrow" aria-hidden="true">
                      @if (going() === a.email) { <span class="spinner"></span> }
                      @else { <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg> }
                    </span>
                  </button>
                }
              </div>
            </div>
          }
          </div></div>
        </section>
      }
    </fw-auth-frame>
  `,
})
export class LoginPage implements OnInit {
  private api = inject(Api);
  private session = inject(Session);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  email = '';
  password = '';
  busy = signal(false);
  going = signal('');
  error = signal('');
  errors = signal<Record<string, string>>({});
  notice = signal('');
  demo = signal<DemoAccount[]>([]);
  /** The demo directory is closed for returning people and open for evaluators who arrive with ?demo=1. */
  demoOpen = signal(false);
  shake = shaker();

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    if (q.get('expired')) this.notice.set('Your session ended. Sign in again to continue.');
    if (q.get('verified')) this.notice.set('Email confirmed. Thanks!');
    if (q.get('reset')) this.notice.set('Password updated. Sign in with your new password.');
    if (q.get('noworkspace')) this.notice.set('Your account has no active workspace. Ask an administrator for a new invitation.');
    this.api.get<DemoAccount[]>('/demo-accounts').then((d) => {
      this.demo.set(d);
      if (q.get('demo')) this.demoOpen.set(true);
      if (q.get('demo')) requestAnimationFrame(() => document.getElementById('demo')?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
    }).catch(() => undefined);
  }

  groups = computed(() => {
    const out: { workspace: string; accounts: DemoAccount[] }[] = [];
    for (const a of this.demo()) {
      const g = out.find((x) => x.workspace === a.workspace);
      if (g) g.accounts.push(a); else out.push({ workspace: a.workspace, accounts: [a] });
    }
    return out;
  });



  useDemo(a: DemoAccount): void {
    this.email = a.email;
    this.password = a.password;
    this.going.set(a.email);
    this.submit();
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.errors.set({});
    try {
      const res = await this.api.post<Profile & { token: string }>('/auth/login', { email: this.email, password: this.password });
      this.session.setToken(res.token);
      this.session.setProfile(res);
      this.router.navigateByUrl('/overview');
    } catch (e) {
      const { message, fields } = apiError(e);
      this.errors.set(fields);
      this.error.set(Object.keys(fields).length ? '' : message);
      this.shake.fire();
    } finally {
      this.busy.set(false);
      this.going.set('');
    }
  }
}

/* ---------------------------------------------------------------------------
   Create a workspace (two short steps)
   ------------------------------------------------------------------------- */

@Component({
  selector: 'fw-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, AuthFrame, PasswordField],
  styles: [PAGE_STYLES],
  template: `
    <fw-auth-frame>
      <span top class="small muted">Have an account? <a routerLink="/login">Sign in</a></span>
      <div class="steps" aria-hidden="true"><i class="on"></i><i [class.on]="step() === 2"></i></div>
      <h1>{{ step() === 1 ? 'Create your account' : 'Set up your studio' }}</h1>
      <p class="lead">{{ step() === 1 ? 'You will own the workspace and can invite your team once you are in.' : 'Money and dates in reports use these settings. You can change them later.' }}</p>
      <form (ngSubmit)="next()" novalidate [class.shake]="shake.on()">
        @if (step() === 1) {
          <div class="field"><label for="name">Your name</label><input id="name" class="input" name="name" autocomplete="name" [(ngModel)]="form.name" [attr.aria-invalid]="!!errors().name || null" />
            @if (errors().name) { <span class="error">{{ errors().name }}</span> }</div>
          <div class="field"><label for="em">Work email</label><input id="em" class="input" type="email" name="email" autocomplete="email" [(ngModel)]="form.email" [attr.aria-invalid]="!!errors().email || null" />
            @if (errors().email) { <span class="error">{{ errors().email }}</span> }</div>
          <div class="field"><label for="pw">Password</label>
            <fw-password inputId="pw" autocomplete="new-password" [meter]="true" [(value)]="form.password" [invalid]="!!errors().password" />
            @if (errors().password) { <span class="error">{{ errors().password }}</span> }</div>
          @if (error()) { <div class="form-error" role="alert">{{ error() }}</div> }
          <button class="pxb accent lg" type="submit">Continue</button>
        } @else {
          <div class="field"><label for="ws">Studio name</label><input id="ws" class="input" name="ws" [(ngModel)]="form.workspace_name" placeholder="e.g. Larkspur & Co." [attr.aria-invalid]="!!errors().workspace_name || null" />
            @if (errors().workspace_name) { <span class="error">{{ errors().workspace_name }}</span> }</div>
          <div class="form-grid">
            <div class="field"><label for="tz">Timezone</label>
              <select id="tz" class="select" name="tz" [(ngModel)]="form.timezone">@for (z of zones; track z) { <option [value]="z">{{ z }}</option> }</select></div>
            <div class="field"><label for="cur">Currency</label>
              <select id="cur" class="select" name="cur" [(ngModel)]="form.currency">@for (c of ['USD','EUR','GBP','CAD','AUD']; track c) { <option [value]="c">{{ c }}</option> }</select></div>
          </div>
          @if (error()) { <div class="form-error" role="alert">{{ error() }}</div> }
          <button class="pxb accent lg" type="submit" [disabled]="busy()">${SPIN}{{ busy() ? 'Creating workspace…' : 'Create workspace' }}</button>
          <button class="btn btn-ghost" type="button" (click)="step.set(1)" [disabled]="busy()">Back</button>
        }
      </form>
    </fw-auth-frame>
  `,
})
export class RegisterPage {
  private api = inject(Api);
  private session = inject(Session);
  private router = inject(Router);
  zones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Europe/Lisbon', 'Asia/Singapore', 'Australia/Sydney', 'UTC'];
  form = { workspace_name: '', name: '', email: '', password: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', currency: 'USD' };
  step = signal<1 | 2>(1);
  busy = signal(false);
  error = signal('');
  errors = signal<Record<string, string>>({});
  shake = shaker();

  constructor() {
    if (!this.zones.includes(this.form.timezone)) this.zones.unshift(this.form.timezone);
  }

  next(): void {
    if (this.step() === 2) { this.submit(); return; }
    const errs: Record<string, string> = {};
    if (!this.form.name.trim()) errs['name'] = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(this.form.email)) errs['email'] = 'Enter a valid email address.';
    if (this.form.password.length < 10) errs['password'] = 'Use at least 10 characters.';
    this.errors.set(errs);
    this.error.set('');
    if (Object.keys(errs).length) { this.shake.fire(); return; }
    this.step.set(2);
    requestAnimationFrame(() => document.getElementById('ws')?.focus());
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const res = await this.api.post<Profile & { token: string }>('/auth/register', this.form);
      this.session.setToken(res.token);
      this.session.setProfile(res);
      this.router.navigateByUrl('/overview');
    } catch (e) {
      const { message, fields } = apiError(e);
      this.errors.set(fields);
      // Account fields live on step one: go back there when the API rejects one.
      if (fields['name'] || fields['email'] || fields['password']) this.step.set(1);
      this.error.set(Object.keys(fields).length ? '' : message);
      this.shake.fire();
    } finally {
      this.busy.set(false);
    }
  }
}

/* ---------------------------------------------------------------------------
   Recovery
   ------------------------------------------------------------------------- */

@Component({
  selector: 'fw-forgot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, AuthFrame],
  styles: [PAGE_STYLES],
  template: `
    <fw-auth-frame>
      <a top class="small muted" routerLink="/login">Back to sign in</a>
      @if (sent()) {
        <div class="sent" role="status">
          <div class="mail"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div>
          <h1>Check your inbox</h1>
          <p>{{ sent() }}</p>
          <div style="margin-top: var(--space-5); display: grid; gap: var(--space-2)">
            <a class="pxb accent lg" routerLink="/login">Back to sign in</a>
            <button class="btn btn-ghost" type="button" (click)="sent.set('')">Use a different email</button>
          </div>
        </div>
      } @else {
        <h1>Reset your password</h1>
        <p class="lead">Enter the email you sign in with and we will send a reset link.</p>
        <form (ngSubmit)="submit()" [class.shake]="shake.on()">
          <div class="field"><label for="em">Email</label><input id="em" class="input" type="email" name="email" autocomplete="email" [(ngModel)]="email" /></div>
          @if (error()) { <div class="form-error" role="alert">{{ error() }}</div> }
          <button class="pxb accent lg" type="submit" [disabled]="busy()">${SPIN}{{ busy() ? 'Sending…' : 'Send reset link' }}</button>
        </form>
      }
    </fw-auth-frame>
  `,
})
export class ForgotPage {
  private api = inject(Api);
  email = '';
  busy = signal(false);
  sent = signal('');
  error = signal('');
  shake = shaker();
  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.api.post<{ message: string }>('/auth/forgot-password', { email: this.email });
      this.sent.set(r.message);
    } catch (e) {
      const { message, fields } = apiError(e);
      this.error.set(fields['email'] ?? message);
      this.shake.fire();
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'fw-reset',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, AuthFrame, PasswordField, RouterLink],
  styles: [PAGE_STYLES],
  template: `
    <fw-auth-frame>
      <a top class="small muted" routerLink="/login">Back to sign in</a>
      <h1>Choose a new password</h1>
      <p class="lead">For {{ emailParam() || 'your account' }}</p>
      <form (ngSubmit)="submit()" [class.shake]="shake.on()">
        <div class="field"><label for="pw">New password</label>
          <fw-password inputId="pw" autocomplete="new-password" [meter]="true" [(value)]="password" [invalid]="!!error()" /></div>
        @if (error()) { <div class="form-error" role="alert">{{ error() }}</div> }
        <button class="pxb accent lg" type="submit" [disabled]="busy()">${SPIN}{{ busy() ? 'Updating…' : 'Update password' }}</button>
      </form>
    </fw-auth-frame>
  `,
})
export class ResetPage {
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  password = '';
  busy = signal(false);
  error = signal('');
  shake = shaker();
  emailParam = signal(this.route.snapshot.queryParamMap.get('email') ?? '');

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.post('/auth/reset-password', { token: this.route.snapshot.queryParamMap.get('token'), email: this.emailParam(), password: this.password });
      this.router.navigate(['/login'], { queryParams: { reset: 1 } });
    } catch (e) {
      const { message, fields } = apiError(e);
      this.error.set(fields['password'] ?? fields['email'] ?? message);
      this.shake.fire();
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'fw-invite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, Icon, AuthFrame, PasswordField],
  styles: [PAGE_STYLES],
  template: `
    <fw-auth-frame>
      @if (invalid()) {
        <h1>Invitation unavailable</h1>
        <p class="lead">{{ invalid() }}</p>
        <a class="btn" routerLink="/login"><fw-icon name="arrowLeft" />Go to sign in</a>
      } @else if (info(); as i) {
        <h1>Join {{ i.workspace }}</h1>
        <p class="lead">{{ i.invited_by }} invited {{ i.email }} as {{ i.role.replace('_', ' ') }}.</p>
        <form (ngSubmit)="submit()" [class.shake]="shake.on()">
          @if (!i.has_account) {
            <div class="field"><label for="n">Your name</label><input id="n" class="input" name="n" autocomplete="name" [(ngModel)]="name" /></div>
          }
          <div class="field"><label for="p">{{ i.has_account ? 'Your password' : 'Choose a password' }}</label>
            <fw-password inputId="p" [autocomplete]="i.has_account ? 'current-password' : 'new-password'" [meter]="!i.has_account" [(value)]="password" [invalid]="!!error()" /></div>
          @if (error()) { <div class="form-error" role="alert">{{ error() }}</div> }
          <button class="pxb accent lg" type="submit" [disabled]="busy()">${SPIN}{{ busy() ? 'Joining…' : 'Accept and continue' }}</button>
        </form>
      } @else {
        <div class="skeleton-panel" style="height: 220px; border-radius: var(--radius-lg)"></div>
      }
    </fw-auth-frame>
  `,
})
export class InvitePage implements OnInit {
  token = input.required<string>();
  private api = inject(Api);
  private session = inject(Session);
  private router = inject(Router);
  info = signal<{ email: string; role: string; workspace: string; invited_by: string; has_account: boolean } | null>(null);
  invalid = signal('');
  name = '';
  password = '';
  busy = signal(false);
  error = signal('');
  shake = shaker();

  ngOnInit(): void {
    this.api.get<any>(`/invitations/${this.token()}`).then((i) => this.info.set(i)).catch((e) => this.invalid.set(apiError(e).message));
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const res = await this.api.post<{ token: string; workspace_id: number }>(`/invitations/${this.token()}/accept`, { name: this.name, password: this.password });
      this.session.setToken(res.token);
      this.session.setProfile(await this.api.get<Profile>('/auth/me'), res.workspace_id);
      this.router.navigateByUrl('/overview');
    } catch (e) {
      const { message, fields } = apiError(e);
      this.error.set(Object.values(fields)[0] ?? message);
      this.shake.fire();
    } finally {
      this.busy.set(false);
    }
  }
}
