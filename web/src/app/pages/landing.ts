import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Session } from '../core/session';
import { Icon } from '../shared/icon';
import { AppTour } from '../shared/app-tour';
import { Dither } from '../shared/dither';
import { PixelEdge } from '../shared/pixel-edge';
import { IsoRecords } from '../shared/iso-records';
import { Scramble } from '../shared/scramble';
import { HoursField } from '../shared/hours-field';
import { ParticleWord } from '../shared/particle-word';

const ROLES = [
  { key: 'owner', label: 'Owner', line: 'Everything, including billing settings, integrations and handing the workspace on.',
    sees: [['Collected this quarter', '$164,200'], ['Outstanding', '$175,118'], ['Utilization', '40.1%']] },
  { key: 'admin', label: 'Admin', line: 'Every module, plus members, invitations, rates and workspace settings.',
    sees: [['Members', 'Invite, deactivate'], ['Rates', 'Bill and cost'], ['Audit log', 'Every change']] },
  { key: 'pm', label: 'Project manager', line: 'Their projects, milestones and staffing, and the time waiting for their approval.',
    sees: [['Waiting for approval', '57 entries'], ['Milestones due', '4 in 30 days'], ['Over budget', 'Dispatch, 106%']] },
  { key: 'finance', label: 'Finance', line: 'Clients, invoices, payments and the aging and collections reports.',
    sees: [['Overdue', '$80,726 on 5'], ['Draft invoices', '1'], ['Pending transfers', '1']] },
  { key: 'staff', label: 'Staff', line: 'Assigned work, their own timesheet and their project channels. No rates or money.',
    sees: [['This week', '15:15 logged'], ['Returned', '1 entry'], ['Unread', '14 messages']] },
  { key: 'viewer', label: 'Viewer', line: 'Dashboards and reports to read. Nothing can be changed.',
    sees: [['Overview', 'Read only'], ['Reports', 'Open to read'], ['Changes', 'None allowed']] },
];

@Component({
  selector: 'fw-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, AppTour, Dither, PixelEdge, IsoRecords, Scramble, ParticleWord, HoursField],
  styles: [`
    :host { --ink: #121214; --light: #f5f4f2; --rail: rgb(18 18 20 / 0.09); --rail-d: rgb(255 255 255 / 0.09); --sq: #f0512a;
      display: block; background: var(--light); color: var(--ink); overflow-x: clip; }
    .wrap { width: min(1280px, 100% - 2 * clamp(0px, 5.5vw - 20px, 80px)); margin-inline: auto; padding-inline: clamp(16px, 3vw, 40px); position: relative; }
    .railed { border-inline: 1px solid var(--rail); }
    .dark .railed, .railed.d { border-color: var(--rail-d); }
    section[id] { scroll-margin-top: var(--space-9); }
    .dark { background: var(--ink); color: #eeeef0; position: relative; isolation: isolate; }
    .dark > fw-dither { z-index: -1; }

    /* type */
    .idx { margin: 0 0 var(--space-5); font-family: var(--font-mono); font-size: var(--text-small); font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; color: #55565c; display: flex; align-items: center; gap: var(--space-2); }
    .idx span { color: #a1a1aa; }
    .idx em { font-style: normal; color: #f0512a; }
    .idx b { font-weight: inherit; }
    .dark .idx { color: #b9b9c0; } .dark .idx span { color: #6b6b73; }
    .h2 { margin: 0; font-size: clamp(1.875rem, 3.1vw, 2.75rem); line-height: 1.18; letter-spacing: -0.02em; font-weight: 500; text-wrap: balance; }
    .h2 span { display: block; color: #7a7b82; }
    .dark .h2 span { color: #ff8a64; display: inline; }
    .body { margin: var(--space-5) 0 0; font-size: var(--text-lead); line-height: 1.6; color: #45464c; max-width: 34rem; font-weight: 500; }
    .dark .body { color: rgb(238 238 240 / 0.72); }

    /* buttons with pixel notches */
    .tree a, .demo-card .alt a, .brand, .roles .seg button { transition: color var(--dur-1) var(--ease-out), background-color var(--dur-1) var(--ease-out), opacity var(--dur-1) var(--ease-out); }
    .ctas { display: flex; gap: var(--space-5); flex-wrap: wrap; margin-top: var(--space-6); padding-inline: var(--space-2); }
    .sq { position: absolute; width: 5px; height: 5px; background: var(--sq); }

    /* nav */
    .nav { position: fixed; top: 12px; left: 0; right: 0; z-index: 50; pointer-events: none; }
    .bar { pointer-events: auto; position: relative; width: min(1216px, 100% - 24px); margin-inline: auto; height: 56px; padding: 0 var(--space-2) 0 var(--space-3); display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; background: var(--ink); box-shadow: 0 0 0 1px rgb(255 255 255 / 0.08), 0 12px 32px -16px rgb(0 0 0 / 0.5); }
    .bar .sq { width: 4px; height: 4px; }
    .brand { justify-self: start; display: flex; align-items: center; gap: var(--space-2); height: 40px; padding: 0 var(--space-2); color: #fff; text-decoration: none; font-weight: 600; font-size: var(--text-large); letter-spacing: -0.02em; }
    .logo { width: 28px; height: 28px; border-radius: 28%; background: #fff; display: grid; place-items: center; }
    .links { display: flex; gap: 2px; }
    .links a, .signin { height: 40px; padding: 0 var(--space-4); display: inline-flex; align-items: center; color: #b9b9c0; text-decoration: none; font-family: var(--font-mono); font-size: var(--text-small); font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; transition: color var(--dur-1) var(--ease-out); }
    @media (hover: hover) and (pointer: fine) { .links a:hover, .signin:hover { color: #fff; } }
    .acts { justify-self: end; display: flex; align-items: center; gap: var(--space-3); padding-right: var(--space-2); }
    @media (max-width: 960px) { .bar { grid-template-columns: 1fr auto; } .links { display: none; } }
    @media (max-width: 480px) { .signin { display: none; } }

    /* hero */
    .hero { position: relative; isolation: isolate; background: #b4351a; color: #fff; padding-top: var(--space-11); overflow: hidden; }
    .hero > fw-hours-field { z-index: -1; }
    .hero-copy { display: flex; flex-direction: column; align-items: center; text-align: center; }
    h1 { margin: 0; font-size: clamp(2.5rem, 4.45vw, 4rem); line-height: 1.1; letter-spacing: -0.028em; font-weight: 500; max-width: 24ch; text-wrap: balance; }
    h1 span { display: block; }
    h1 span { color: #ffcdbd; }
    .lead { margin: var(--space-5) 0 0; max-width: 37.5rem; font-size: var(--text-large); line-height: 1.55; color: #fff3ee; font-weight: 500; text-wrap: balance; }
    .hero .ctas { justify-content: center; margin-top: var(--space-6); }
    .product { position: relative; margin: var(--space-9) auto 0; max-width: 1104px; }
    .frame { position: relative; height: clamp(260px, 38vw, 540px); overflow: hidden; background: var(--ink); padding: var(--space-2) var(--space-2) 0; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.12), 0 -20px 60px -20px rgb(0 0 0 / 0.35); }
    .frame img { display: block; width: 100%; height: auto; }
    .frame fw-dither { top: auto; height: 46%; }
    .co { position: absolute; z-index: 2; background: var(--ink); color: #fff; padding: var(--space-4) var(--space-5); box-shadow: 0 0 0 1px rgb(255 255 255 / 0.14), 0 24px 40px -18px rgb(0 0 0 / 0.6); }
    .co .sq { width: 4px; height: 4px; }
    .co small { display: block; font-family: var(--font-mono); font-size: var(--text-small); font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; color: #ff9a78; }
    .co.l { left: -40px; top: 150px; width: 260px; }
    .co.l b { display: block; margin-top: var(--space-2); font-size: var(--text-stat); line-height: 1; font-weight: 500; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
    .co.l p { margin: var(--space-2) 0 var(--space-3); font-size: var(--text-body); color: #c9c9cf; }
    .co.l p em { font-style: normal; color: #ff8a64; font-weight: 600; }
    .seg5 { display: grid; grid-template-columns: 46fr 54fr; gap: var(--space-1); height: 8px; }
    .seg5 i { background: #f0512a; }
    .seg5-key { display: flex; justify-content: space-between; margin-top: var(--space-2); font-size: var(--text-small); color: #c9c9cf; } .seg5 i + i { background: #3a393d; }
    .co.r { right: -40px; top: -44px; width: 352px; display: grid; grid-template-columns: 1fr auto; gap: var(--space-1) var(--space-4); align-items: center; }
    .co.r strong { grid-column: 1; font-size: var(--text-body); font-weight: 600; line-height: 1.35; }
    .co.r .ok { grid-column: 1; font-size: var(--text-small); color: #c9c9cf; display: flex; align-items: center; gap: var(--space-2); }
    .co.r .ok::before { content: ''; width: 6px; height: 6px; background: #f0512a; }
    .gauge { grid-column: 2; grid-row: 1 / span 3; width: 64px; text-align: center; font-family: var(--font-mono); font-size: var(--text-small); color: #b9b9c0; }
    .gauge svg { display: block; width: 58px; height: 58px; }
    .gauge text { font-family: var(--font-sans); font-size: var(--text-micro); font-weight: 600; fill: #fff; }
    @media (max-width: 1240px) { .co.l { left: 12px; } .co.r { right: 12px; } }
    @media (max-width: 760px) {
      .hero { padding-top: var(--space-10); }
      .product { margin-top: var(--space-8); }
      .co.l, .co.r { display: none; }
    }

    /* module strip */
    .mods { padding: var(--space-6) 0 var(--space-7); }
    .mods-t { margin: 0; padding: 0 0 var(--space-6); text-align: center; font-size: var(--text-body); font-weight: 500; color: #c9c9cf; }
    .cells { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); border-top: 1px solid var(--rail-d); border-bottom: 1px solid var(--rail-d); position: relative; }
    .cells li { position: relative; height: 96px; display: flex; align-items: center; justify-content: center; gap: var(--space-3); font-size: var(--text-large); font-weight: 500; letter-spacing: -0.02em; color: #fff; }
    .cells li + li { border-left: 1px solid var(--rail-d); }
    .cells ::ng-deep svg { width: 22px; height: 22px; color: #ff7d55; }
    .cells .sq { top: -3px; } .cells .sq.b { top: auto; bottom: -3px; }
    @media (max-width: 860px) { .cells { grid-template-columns: repeat(3, minmax(0, 1fr)); } .cells li { height: 72px; font-size: var(--text-lead); } .cells li:nth-child(4) { border-left: 0; } .cells li:nth-child(n + 4) { border-top: 1px solid var(--rail-d); } }

    /* [00] how */
    .how .wrap { padding-block: 0; }
    .pin { height: calc(100svh + 4 * 26svh); }
    .pin-in { position: sticky; top: 72px; min-height: calc(100svh - 72px); display: grid; align-content: center; padding-block: var(--space-6); }
    /* a faint isometric drafting grid behind the drawing, fading out at its edges */
    .iso-stage { position: relative; isolation: isolate; }
    .iso-stage::before { content: ''; position: absolute; inset: -14% -12%; z-index: -1; pointer-events: none;
      background: repeating-linear-gradient(30deg, rgb(18 18 20 / 0.07) 0 1px, transparent 1px 28px), repeating-linear-gradient(-30deg, rgb(18 18 20 / 0.07) 0 1px, transparent 1px 28px);
      mask-image: radial-gradient(closest-side, #000 35%, transparent); -webkit-mask-image: radial-gradient(closest-side, #000 35%, transparent); }
    .how-grid { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr); gap: var(--space-7); align-items: center; }
    .ticks { list-style: none; margin: var(--space-6) 0 0; padding: 0; display: grid; gap: 2px; max-width: 30rem; }
    .ticks li { display: grid; grid-template-columns: 28px 1fr; column-gap: var(--space-2); padding: var(--space-2) 0; color: #5f6067; transition: color var(--dur-2) var(--ease-out); }
    .ticks li > span { font-family: var(--font-mono); font-size: var(--text-small); padding-top: 2px; }
    .ticks b { font-size: var(--text-lead); font-weight: 600; }
    .ticks li.on { color: var(--ink); } .ticks li.on > span { color: #c93d1d; }
    .ticks .more { grid-column: 2; display: grid; grid-template-rows: 0fr; transition: grid-template-rows var(--dur-3) var(--ease-out); }
    .ticks li.on .more { grid-template-rows: 1fr; }
    .ticks .more > p { margin: 0; overflow: hidden; min-height: 0; font-size: var(--text-lead); line-height: 1.5; color: #55565c; font-weight: 500; }
    .ticks .more > p::before { content: ''; display: block; height: 4px; }
    @media (max-width: 900px) {
      .pin { height: auto; } .pin-in { position: static; min-height: 0; padding-block: var(--space-9) var(--space-8); }
      .how-grid { grid-template-columns: minmax(0, 1fr); gap: var(--space-6); }
      .ticks .more { grid-template-rows: 1fr; } .ticks li { color: var(--ink); }
    }

    /* [01] watch */
    .watch { padding: var(--space-10) 0; }
    /* the 60-second video: a third hero action, a poster in Watch it work, and a full-screen player */
    .pxb.see { --b: transparent; --f: #fff; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.7); }
    .pxb.see::before, .pxb.see::after { display: none; }
    @media (hover: hover) and (pointer: fine) { .pxb.see:hover { --b: rgb(255 255 255 / 0.12); box-shadow: inset 0 0 0 1px #fff; } }
    .pi { width: 18px; height: 18px; flex: none; }
    .vposter { all: unset; box-sizing: border-box; position: relative; display: block; width: min(100%, 1040px); margin: 0 auto var(--space-7); cursor: pointer; border-radius: var(--radius-md); overflow: hidden;
      aspect-ratio: 16 / 9; background: #121214; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.12), 0 40px 80px -30px rgb(0 0 0 / 0.7); }
    .vposter img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform var(--dur-3) var(--ease-out), opacity var(--dur-2) var(--ease-out); }
    .vplay { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: inline-flex; align-items: center; gap: var(--space-3); height: 64px; padding: 0 var(--space-6);
      background: var(--color-accent); color: #121214; font-family: var(--font-mono); font-size: var(--text-lead); font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; white-space: nowrap;
      box-shadow: 0 20px 40px -12px rgb(0 0 0 / 0.6); transition: transform var(--dur-2) var(--ease-out), background-color var(--dur-2) var(--ease-out); }
    .vplay .pi { width: 22px; height: 22px; }
    @media (hover: hover) and (pointer: fine) { .vposter:hover img { transform: scale(1.02); opacity: .85; } .vposter:hover .vplay { background: #ff6c43; transform: translate(-50%, -50%) scale(1.04); } }
    .vposter:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 4px; }
    .vplayer { padding: 0; border: 0; background: transparent; max-width: none; max-height: none; width: min(1280px, 92vw); overflow: visible; }
    .vplayer::backdrop { background: rgb(10 10 12 / 0.88); backdrop-filter: blur(6px); }
    .vplayer[open] { animation: vp-in var(--dur-3) var(--ease-out) both; }
    @keyframes vp-in { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: none; } }
    .vbox { position: relative; aspect-ratio: 16 / 9; background: #000; border-radius: var(--radius-md); overflow: hidden; box-shadow: 0 40px 120px -20px rgb(0 0 0 / 0.8); }
    .vbox video { display: block; width: 100%; height: 100%; }
    .vclose { all: unset; position: absolute; top: calc(-1 * var(--space-7)); right: 0; width: 40px; height: 40px; display: grid; place-items: center; cursor: pointer; color: #fff; border-radius: 50%;
      background: rgb(255 255 255 / 0.12); transition: background-color var(--dur-1) var(--ease-out); }
    .vclose svg { width: 20px; height: 20px; }
    .vclose:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
    @media (hover: hover) and (pointer: fine) { .vclose:hover { background: rgb(255 255 255 / 0.22); } }
    @media (max-width: 720px) { .vposter { margin-bottom: var(--space-5); } .vplay { height: 52px; padding: 0 var(--space-4); font-size: var(--text-small); } .vplayer { width: 96vw; } .vclose { top: auto; bottom: calc(-1 * var(--space-7)); right: 50%; transform: translateX(50%); } }
    @media (prefers-reduced-motion: reduce) { .vplayer[open] { animation: none; } .vposter img, .vplay { transition: none; } }
    .center-head { justify-content: center; }
    .head { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--space-5); margin-bottom: var(--space-7); flex-wrap: wrap; }
    .head .note { margin: var(--space-4) 0 0; max-width: 34rem; color: rgb(238 238 240 / 0.72); font-size: var(--text-lead); font-weight: 500; line-height: 1.5; }
    @media (max-width: 720px) { .watch { padding: var(--space-9) 0; } .head { margin-bottom: var(--space-5); } }

    /* [02] studio cards */
    .studio { padding: var(--space-10) 0; }
    .center { text-align: center; display: flex; flex-direction: column; align-items: center; }
    .center .idx { justify-content: center; }
    .center .body { max-width: 40rem; }
    .figures.dk { margin: 0 0 var(--space-7); border-color: var(--rail-d); }
    .figures.dk div + div { border-color: var(--rail-d); }
    .figures.dk dt { color: #fff; } .figures.dk dt small { color: #9a9aa2; } .figures.dk dd { color: rgb(238 238 240 / 0.72); }
    .figures.dk div:last-child dt { color: #ff8a64; }
    .figures { margin: var(--space-7) 0 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-block: 1px solid var(--rail); }
    .figures div { padding: var(--space-5) var(--space-5) var(--space-6); }
    .figures div + div { border-left: 1px solid var(--rail); }
    .figures dt { font-size: clamp(2.75rem, 4.45vw, 4rem); line-height: 1; font-weight: 500; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
    .figures dt small { font-size: var(--text-title); margin-left: var(--space-1); color: #7a7b82; letter-spacing: 0; }
    .figures dd { margin: var(--space-3) 0 0; font-size: var(--text-lead); line-height: 1.45; color: #55565c; font-weight: 500; max-width: 24ch; }
    @media (max-width: 760px) { .figures { grid-template-columns: minmax(0, 1fr); } .figures div + div { border-left: 0; border-top: 1px solid var(--rail); } .figures div { padding: var(--space-5) 0; } }
    .cards { margin-top: var(--space-7); display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: var(--space-4); }
    .card { grid-column: span 2; background: #fff; box-shadow: 0 0 0 1px rgb(18 18 20 / 0.08); display: flex; flex-direction: column; padding: var(--space-5); gap: var(--space-4); }
    .card.wide { grid-column: span 3; }
    .card header { display: grid; gap: var(--space-2); }
    .card.wide header { grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); gap: var(--space-4); }
    .card h3 { margin: 0; font-size: var(--text-lead); font-weight: 600; letter-spacing: -0.01em; }
    .card header p { margin: 0; font-size: var(--text-lead); line-height: 1.5; color: #55565c; font-weight: 500; }
    .well { position: relative; isolation: isolate; overflow: hidden; background: var(--ink); height: 240px; margin-top: auto; }
    .well > fw-dither { z-index: -1; }
    .well img { position: absolute; left: 24px; top: 28px; width: 150%; max-width: none; height: auto; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.14), 0 20px 40px -12px rgb(0 0 0 / 0.6); }
    .card.wide .well img { width: 112%; }
    .well img.phone-shot { left: 50%; translate: -50% 0; width: 46%; border-radius: var(--radius-md); border: 5px solid #2a292c; }
    @media (max-width: 1000px) { .card, .card.wide { grid-column: span 3; } .card.wide header { grid-template-columns: minmax(0, 1fr); gap: var(--space-2); } }
    @media (max-width: 640px) { .studio { padding: var(--space-9) 0; } .cards { grid-template-columns: minmax(0, 1fr); } .card, .card.wide { grid-column: auto; } .well { height: 200px; } }

    /* [03] analytics */
    .ana { padding: var(--space-10) 0; }
    .ana-foot { margin-top: var(--space-7); display: flex; align-items: center; justify-content: space-between; gap: var(--space-5); flex-wrap: wrap; padding: var(--space-5) 8px 0 0; border-top: 1px solid var(--rail-d); }
    .ana-foot p { margin: 0; max-width: 36rem; font-size: var(--text-lead); line-height: 1.5; color: rgb(238 238 240 / 0.72); font-weight: 500; }
    .ana-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); }
    .ac { position: relative; background: #19181b; box-shadow: 0 0 0 1px rgb(255 255 255 / 0.1); display: flex; flex-direction: column; text-decoration: none; color: inherit; transition: box-shadow var(--dur-2) var(--ease-out); }
    .ac .sq { width: 4px; height: 4px; }
    .ac .shot { height: 220px; margin: var(--space-3) var(--space-3) 0; overflow: hidden; background: #fff; }
    .ac .shot img { display: block; width: 100%; height: 100%; object-fit: cover; }
    .ac .meta { padding: var(--space-4) var(--space-5) var(--space-5); display: grid; gap: var(--space-3); }
    .ac .kind { font-family: var(--font-mono); font-size: var(--text-small); font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; color: #ff8a64; }
    .ac h3 { margin: 0; font-size: var(--text-large); line-height: 1.35; font-weight: 500; letter-spacing: -0.015em; color: #fff; }
    .ac .go { font-family: var(--font-mono); font-size: var(--text-small); font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; color: #c9c9cf; display: inline-flex; gap: var(--space-2); align-items: center; }
    @media (hover: hover) and (pointer: fine) { .ac:hover { box-shadow: 0 0 0 1px rgb(240 81 42 / 0.6); } .ac:hover .go { color: #fff; } }
    .ac:focus-visible { outline: 2px solid #f0512a; outline-offset: 3px; }
    @media (max-width: 960px) { .ana-cards { grid-template-columns: minmax(0, 1fr); } .ac .shot { height: 200px; } }
    @media (max-width: 720px) { .ana { padding: var(--space-9) 0; } }

    /* [04] access grid */
    .access { padding: var(--space-10) 0 var(--space-7); }
    .tgrid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); background: #fff; box-shadow: 0 0 0 1px rgb(18 18 20 / 0.1); }
    .tc { position: relative; padding: var(--space-6); }
    .tc .sq { width: 5px; height: 5px; }
    .tc.big { grid-row: span 2; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 0.8fr); gap: var(--space-5); align-items: center; border-right: 1px solid rgb(18 18 20 / 0.1); background: radial-gradient(circle at 75% 55%, #fbeee8, transparent 55%); }
    .tc.big .pxb { margin-top: var(--space-6); }
    .tc.side + .tc.side { border-top: 1px solid rgb(18 18 20 / 0.1); }
    .tc.side .n { display: inline-grid; place-items: center; width: 30px; height: 24px; font-family: var(--font-mono); font-size: var(--text-small); color: #c93d1d; box-shadow: inset 0 0 0 1px rgb(240 81 42 / 0.5); }
    .tc.side h3 { margin: var(--space-4) 0 var(--space-2); font-size: var(--text-large); font-weight: 600; letter-spacing: -0.01em; }
    .tc.side p { margin: 0; font-size: var(--text-lead); line-height: 1.55; color: #55565c; font-weight: 500; }
    .tc.roles { grid-column: 1 / -1; border-top: 1px solid rgb(18 18 20 / 0.1); display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-6); align-items: start; }
    .roles .seg { flex-wrap: wrap; border-radius: 0; }
    .roles .seg button { border-radius: 0; }
    .roles p.line { margin: var(--space-4) 0 0; font-size: var(--text-lead); line-height: 1.55; color: #55565c; font-weight: 500; min-height: 3.1em; }
    .roles p.line b { color: var(--ink); font-weight: 600; }
    .sees { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); }
    .sees div { background: var(--light); padding: var(--space-4); animation: card-in var(--dur-3) var(--ease-out) both; }
    .sees small { display: block; font-size: var(--text-small); color: #6b6c72; font-weight: 500; }
    .sees b { display: block; margin-top: var(--space-1); font-size: var(--text-large); font-weight: 500; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
    .lockfig { width: 100%; height: auto; display: block; }
    @media (max-width: 960px) {
      .tgrid { grid-template-columns: minmax(0, 1fr); }
      .tc.big { grid-row: auto; border-right: 0; grid-template-columns: minmax(0, 1fr); }
      .tc.big .lockfig { max-width: 300px; justify-self: center; }
      .tc.side { border-top: 1px solid rgb(18 18 20 / 0.1); }
      .tc.roles { grid-template-columns: minmax(0, 1fr); gap: var(--space-4); }
    }
    @media (max-width: 560px) { .access { padding-top: var(--space-9); } .tc { padding: var(--space-5) var(--space-5); } .sees { grid-template-columns: minmax(0, 1fr); } }

    /* [05] start */
    .start { position: relative; isolation: isolate; padding: var(--space-9) 0 var(--space-11); }
    .start > fw-dither { z-index: -1; top: auto; height: 300px; }
    .start-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 440px); gap: var(--space-7); align-items: start; }
    .fits { margin-top: var(--space-6); }
    .fits small { display: block; font-size: var(--text-small); color: #55565c; font-weight: 500; margin-bottom: var(--space-3); }
    .fits ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 220px)); gap: var(--space-2); }
    .fits li { height: 40px; display: flex; align-items: center; gap: var(--space-2); padding: 0 var(--space-3); background: #fff; box-shadow: 0 0 0 1px rgb(18 18 20 / 0.1); font-size: var(--text-small); font-weight: 500; }
    .fits ::ng-deep svg { color: #c93d1d; }
    .demo-card { position: relative; background: #fff; box-shadow: 0 0 0 1px rgb(18 18 20 / 0.1), 0 30px 60px -30px rgb(18 18 20 / 0.25); padding: var(--space-5); }
    .demo-card .sq { width: 5px; height: 5px; }
    .demo-card h3 { margin: 0; display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-large); font-weight: 600; letter-spacing: -0.01em; padding-bottom: var(--space-4); border-bottom: 1px solid rgb(18 18 20 / 0.08); }
    .demo-card .intro { margin: var(--space-4) 0 var(--space-2); font-size: var(--text-body); color: #55565c; font-weight: 500; }
    .folks { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
    .folks a { display: grid; grid-template-columns: 36px 1fr auto; gap: var(--space-3); align-items: center; padding: var(--space-2); text-decoration: none; color: var(--ink); transition: background-color var(--dur-1) var(--ease-out); }
    .folks img { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
    .folks b { display: block; font-size: var(--text-body); font-weight: 600; }
    .folks small { display: block; font-size: var(--text-small); color: #6b6c72; font-weight: 500; }
    .folks ::ng-deep svg { color: #7a7b82; }
    @media (hover: hover) and (pointer: fine) { .folks a:hover { background: var(--light); } }
    .folks a:focus-visible { outline: 2px solid #f0512a; outline-offset: 0; }
    .demo-card .pxb { width: calc(100% - 16px); margin: var(--space-5) var(--space-2) 0; }
    .demo-card .alt { margin: var(--space-4) 0 0; text-align: center; font-size: var(--text-body); color: #55565c; font-weight: 500; }
    .demo-card .alt a { color: var(--ink); font-weight: 600; }
    @media (max-width: 960px) { .start-grid { grid-template-columns: minmax(0, 1fr); } }
    @media (max-width: 560px) { .start { padding: var(--space-9) 0 var(--space-11); } .fits ul { grid-template-columns: minmax(0, 1fr); } }

    /* footer */
    footer { padding: var(--space-7) 0 0; }
    .fgrid { display: grid; grid-template-columns: minmax(0, 1.3fr) repeat(2, minmax(0, 1fr)); border-bottom: 1px solid var(--rail-d); }
    .fgrid > div { padding: var(--space-2) var(--space-6) var(--space-7) 0; }
    .fgrid > div + div { padding-left: var(--space-6); border-left: 1px solid var(--rail-d); }
    .fgrid p { margin: var(--space-4) 0 0; color: #b9b9c0; font-size: var(--text-lead); font-weight: 500; max-width: 26ch; line-height: 1.5; }
    .fgrid h4 { margin: 0 0 var(--space-4); font-family: var(--font-mono); font-size: var(--text-small); font-weight: 500; letter-spacing: 0.07em; text-transform: uppercase; color: #fff; }
    .tree { list-style: none; margin: 0; padding: 0 0 0 var(--space-1); border-left: 1px solid rgb(255 255 255 / 0.16); }
    .tree li { position: relative; padding: var(--space-1) 0 var(--space-1) var(--space-4); }
    .tree li::before { content: ''; position: absolute; left: 0; top: 50%; width: 9px; border-top: 1px solid rgb(255 255 255 / 0.16); }
    .tree a { color: #c9c9cf; text-decoration: none; font-size: var(--text-small); font-weight: 500; }
    @media (hover: hover) and (pointer: fine) { .tree a:hover { color: #fff; } }
    .fbase { display: flex; justify-content: space-between; align-items: center; gap: var(--space-4); padding: var(--space-5) 0; color: #9a9aa2; font-size: var(--text-small); flex-wrap: wrap; }
    .fbase .pxb { --b: #f0512a; --f: var(--ink); }
    .word { position: relative; height: clamp(110px, 17vw, 250px); margin-top: var(--space-5); }
    @media (max-width: 760px) { .fgrid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .fgrid > div:first-child { grid-column: 1 / -1; padding-right: 0; } .fgrid > div:nth-child(2) { border-left: 0; padding-left: 0; } }

    /* entrance: the hero settles in once */
    .in { animation: hero-in var(--dur-scene-1) var(--ease-out) both; }
    @keyframes hero-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
    @keyframes card-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .in, .sees div { animation: none; } .ticks .more { transition: none; } }
  `],
  host: { '(window:scroll)': 'onScroll()', '(window:resize)': 'onScroll()' },
  template: `
    <header class="nav">
      <div class="bar">
        <i class="sq" style="left:-2px;top:-2px"></i><i class="sq" style="right:-2px;top:-2px"></i><i class="sq" style="left:-2px;bottom:-2px"></i><i class="sq" style="right:-2px;bottom:-2px"></i>
        <a class="brand" routerLink="/"><span class="logo"><svg width="100%" height="100%" viewBox="0 0 32 32" aria-hidden="true"><rect x="8" y="4.5" width="5" height="5" rx=".8" fill="#121214"/><rect x="14" y="4.5" width="5" height="5" rx=".8" fill="#121214"/><rect x="20" y="4.5" width="5" height="5" rx=".8" fill="#121214"/><rect x="8" y="10.5" width="5" height="5" rx=".8" fill="#121214"/><rect x="8" y="16.5" width="5" height="5" rx=".8" fill="#121214"/><rect x="8" y="22.5" width="5" height="5" rx=".8" fill="#121214"/><rect x="14" y="16.5" width="5" height="5" rx=".8" fill="#f0512a"/></svg></span>Fieldwork</a>
        <nav class="links" aria-label="Sections"><a href="#how">Product</a><a href="#watch">Tour</a><a href="#analytics">Analytics</a><a href="#access">Access</a></nav>
        <div class="acts">
          @if (session.token()) {
            <a class="pxb accent sm" routerLink="/overview"><span fwScramble="hover">Open workspace</span></a>
          } @else {
            <a class="signin" routerLink="/login">Sign in</a>
            <a class="pxb accent sm" routerLink="/register"><span fwScramble="hover">Start free</span></a>
          }
        </div>
      </div>
    </header>

    <main>
      <section class="hero">
        <fw-hours-field />
        <div class="wrap">
          <div class="hero-copy">
            <h1 class="in">Approved hours, billed once <span>and closed by a payment.</span></h1>
            <p class="lead in" style="animation-delay: 80ms">Fieldwork joins timesheets, approvals, invoices and payments for services studios. Every figure on the dashboard opens the records behind it.</p>
            <div class="ctas in" style="animation-delay: 160ms">
              <a class="pxb light lg" routerLink="/register"><span fwScramble="hover">Create a workspace</span></a>
              <a class="pxb lg" routerLink="/login" [queryParams]="{ demo: 1 }"><span fwScramble="hover">Explore the demo</span></a>
              <button type="button" class="pxb lg see" (click)="openVideo()" aria-haspopup="dialog"><svg class="pi" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg><span fwScramble="hover">See it in 60 seconds</span></button>
            </div>
          </div>
          <div class="product in" style="animation-delay: 240ms">
            <div class="frame" data-seenry-product>
              <img src="/landing/tour-overview.webp" width="1800" height="1125" fetchpriority="high" alt="The Fieldwork Overview for Larkspur & Co.: 6 active projects, 982 billable hours, $164k collected and $175k outstanding, with the projects that need attention." />
              <fw-dither kind="sink" [cell]="4" [seed]="3" />
            </div>
            <div class="co l in" style="animation-delay: 420ms" aria-hidden="true">
              <i class="sq" style="left:-2px;top:-2px"></i><i class="sq" style="right:-2px;bottom:-2px"></i>
              <small>Outstanding</small><b>$175k</b><p><em>$80.7k</em> overdue on 5 invoices</p>
              <div class="seg5"><i></i><i></i></div>
              <div class="seg5-key"><span>Overdue 46%</span><span>Not yet due</span></div>
            </div>
            <div class="co r in" style="animation-delay: 520ms" aria-hidden="true">
              <i class="sq" style="left:-2px;top:-2px"></i><i class="sq" style="right:-2px;bottom:-2px"></i>
              <small>Needs attention</small>
              <strong>Dispatch dashboard has used 106% of its hours budget</strong>
              <span class="ok">From approved time only</span>
              <div class="gauge"><svg viewBox="0 0 58 58"><circle cx="29" cy="29" r="23" fill="none" stroke="#3a393d" stroke-width="6"/><circle cx="29" cy="29" r="23" fill="none" stroke="#f0512a" stroke-width="6" stroke-dasharray="144.5 200" transform="rotate(-90 29 29)"/><text x="29" y="34" text-anchor="middle">106%</text></svg>Used</div>
            </div>
          </div>
        </div>
      </section>

      <section class="dark mods" aria-label="Modules">
        <div class="wrap railed">
          <p class="mods-t">Everything a studio runs on, in one workspace</p>
          <ul class="cells">
            @for (m of modules; track m[0]; let i = $index) {
              <li><i class="sq" style="left:-3px"></i><i class="sq b" style="left:-3px"></i>@if (i === modules.length - 1) { <i class="sq" style="right:-3px"></i><i class="sq b" style="right:-3px"></i> }<fw-icon [name]="m[1]" />{{ m[0] }}</li>
            }
          </ul>
        </div>
      </section>

      <fw-pixel-edge from="#121214" to="#f5f4f2" [seed]="3" />

      <section class="how" id="how">
        <div class="wrap railed">
          <div class="pin" #howPin>
            <div class="pin-in">
              <div class="how-grid">
                <div>
                  <p class="idx"><span>[</span>00<span>]</span><b fwScramble>How it connects</b><em>+</em></p>
                  <h2 class="h2">Your week, taken apart <span>the way your books read it.</span></h2>
                  <p class="body">Every logged hour is a record. Approval locks its rate, an invoice reserves it exactly once, and a settled payment closes it.</p>
                  <ol class="ticks">
                    @for (s of flow; track s.title; let i = $index) {
                      <li [class.on]="isoStep() === i + 1"><span>{{ i + 1 }}.</span><b>{{ s.title }}</b><div class="more"><p>{{ s.text }}</p></div></li>
                    }
                  </ol>
                  <div class="ctas">
                    <a class="pxb accent lg" routerLink="/register"><span fwScramble="hover">Create a workspace</span></a>
                    <a class="pxb line lg" routerLink="/login" [queryParams]="{ demo: 1 }"><span fwScramble="hover">See it in the demo</span></a>
                  </div>
                </div>
                <div class="iso-stage" data-seenry-signature><fw-iso-records [step]="isoStep()" /></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <fw-pixel-edge from="#f5f4f2" to="#121214" [seed]="8" />

      <section class="dark watch" id="watch">
        <fw-dither kind="cloud" [cell]="6" [seed]="21" [live]="true" />
        <div class="wrap railed">
          <div class="head center-head">
            <div class="center"><p class="idx"><span>[</span>01<span>]</span><b fwScramble>Watch it work</b><em>+</em></p><h2 class="h2">Log. Approve. Invoice. Get paid.</h2>
            <p class="note">The same five steps every week, shown on the real product with a seeded studio.</p></div>
          </div>
          <button type="button" class="vposter" (click)="openVideo()" aria-haspopup="dialog" aria-label="See it in 60 seconds: play the Fieldwork video">
            <img src="/video/poster.jpg" alt="" width="1600" height="900" loading="lazy" decoding="async" />
            <span class="vplay"><svg class="pi" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>See it in 60 seconds</span>
          </button>
          <fw-app-tour />
        </div>
      </section>

      <dialog #vd class="vplayer" aria-label="See it in 60 seconds" (close)="closeVideo()" (click)="$event.target === vd ? vd.close() : null">
        <div class="vbox">
          <video #vv controls playsinline preload="none" poster="/video/poster.jpg" aria-label="Fieldwork in 60 seconds: time logged, approved, invoiced once and paid, on the real product"></video>
          <button type="button" class="vclose" aria-label="Close video" (click)="vd.close()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        </div>
      </dialog>

      <fw-pixel-edge from="#121214" to="#f5f4f2" [seed]="14" />

      <section class="studio" id="studio">
        <div class="wrap railed">
          <div class="center">
            <p class="idx"><span>[</span>02<span>]</span><b fwScramble>Across the studio</b><em>+</em></p>
            <h2 class="h2">Runs the studio, not only the books.</h2>
            <p class="body">Projects, clients, time and reports share the records billing uses, so the people doing the work and the people sending invoices read the same numbers.</p>
          </div>
          <div class="cards">
            @for (c of cards; track c.title) {
              <article class="card" [class.wide]="c.wide">
                <header><h3>{{ c.title }}</h3><p>{{ c.text }}</p></header>
                <div class="well">
                  <fw-dither kind="cloud" [cell]="5" [seed]="c.seed" />
                  <img [src]="c.src" [alt]="c.alt" [class.phone-shot]="c.phone" loading="lazy" />
                </div>
              </article>
            }
          </div>
        </div>
      </section>

      <fw-pixel-edge from="#f5f4f2" to="#121214" [seed]="5" />

      <section class="dark ana" id="analytics">
        <fw-dither kind="cloud" [cell]="6" [seed]="33" [live]="true" />
        <div class="wrap railed">
          <div class="head">
            <div><p class="idx"><span>[</span>03<span>]</span><b fwScramble>Analytics</b><em>+</em></p><h2 class="h2">Numbers <span>you can open.</span></h2></div>
          </div>
          <dl class="figures dk">
            <div><dt>8,425<small>h</small></dt><dd>approved hours on record in the demo studio</dd></div>
            <div><dt>28</dt><dd>invoices issued from those hours, none billed twice</dd></div>
            <div><dt>$175,118</dt><dd>outstanding, and every dollar opens its invoice</dd></div>
          </dl>
          <div class="ana-cards">
            @for (a of ana; track a.title) {
              <a class="ac" routerLink="/login" [queryParams]="{ demo: 1 }">
                <i class="sq" style="left:-2px;top:-2px"></i><i class="sq" style="right:-2px;top:-2px"></i><i class="sq" style="left:-2px;bottom:-2px"></i><i class="sq" style="right:-2px;bottom:-2px"></i>
                <div class="shot"><img [src]="a.src" [alt]="a.alt" [style.object-position]="a.pos" loading="lazy" /></div>
                <div class="meta"><span class="kind">{{ a.tag }}</span><h3>{{ a.title }}</h3><span class="go">Open in the demo<fw-icon name="arrowUpRight" /></span></div>
              </a>
            }
          </div>
          <div class="ana-foot"><p>Every total opens the entries behind it, with the same rules in Analytics, Reports and exports.</p><a class="pxb accent lg" routerLink="/login" [queryParams]="{ demo: 1 }"><span fwScramble="hover">Open Analytics</span></a></div>
        </div>
      </section>

      <fw-pixel-edge from="#121214" to="#f5f4f2" [seed]="17" />

      <section class="access" id="access">
        <div class="wrap railed">
          <div class="tgrid">
            <div class="tc big">
              <i class="sq" style="left:-3px;top:-3px"></i><i class="sq" style="right:-3px;top:-3px"></i>
              <div>
                <p class="idx"><span>[</span>04<span>]</span><b fwScramble>Access</b><em>+</em></p>
                <h2 class="h2">Access that checks itself <span>on every request.</span></h2>
                <p class="body">Six roles, denied by default and enforced by the API rather than by the menu.</p>
                <a class="pxb line" href="#roles"><span fwScramble="hover">See who sees what</span></a>
              </div>
              <svg class="lockfig" viewBox="0 0 320 250" aria-hidden="true">
                <g transform="matrix(0.866 0.5 -0.866 0.5 160 72)">
                  <rect x="0" y="0" width="150" height="150" rx="8" fill="#ece9e6" transform="translate(16 16)" />
                  <rect x="0" y="0" width="150" height="150" rx="8" fill="#fff" stroke="#121214" stroke-opacity="0.5" />
                  <rect x="18" y="18" width="114" height="114" rx="4" fill="none" stroke="#121214" stroke-opacity="0.15" stroke-dasharray="4 5" />
                  <rect x="48" y="66" width="54" height="46" rx="6" fill="#fff6f2" stroke="#f0512a" stroke-width="1.6" />
                  <path d="M58 66V54a17 17 0 0 1 34 0v12" fill="none" stroke="#f0512a" stroke-width="1.6" />
                  <circle cx="75" cy="86" r="5" fill="#f0512a" />
                  <path d="M75 91v9" stroke="#f0512a" stroke-width="1.6" />
                </g>
                <circle cx="262" cy="170" r="6" fill="#f0512a" />
                <path d="M262 170 L232 152" stroke="#f0512a" stroke-opacity="0.5" stroke-dasharray="3 4" />
              </svg>
            </div>
            <div class="tc side">
              <span class="n">01</span><h3>Deny by default</h3><p>A permission nobody granted is a request the API refuses, whatever the screen shows.</p>
            </div>
            <div class="tc side">
              <span class="n">02</span><h3>Every change on record</h3><p>Rates, invoices, payments and members each leave an audit entry: who, what and when.</p>
            </div>
            <div class="tc roles" id="roles">
              <i class="sq" style="left:-3px;top:-3px"></i><i class="sq" style="right:-3px;top:-3px"></i><i class="sq" style="left:-3px;bottom:-3px"></i><i class="sq" style="right:-3px;bottom:-3px"></i>
              <div>
                <div class="seg" role="group" aria-label="Role">
                  @for (r of roles; track r.key) { <button type="button" [attr.aria-pressed]="role() === r.key" (click)="role.set(r.key)">{{ r.label }}</button> }
                </div>
                <p class="line"><b>{{ current().label }}.</b> {{ current().line }}</p>
              </div>
              <div class="sees" aria-live="polite">
                @for (r of [current()]; track r.key) {
                  @for (c of r.sees; track c[0]; let i = $index) { <div [style.animation-delay.ms]="i * 40"><small>{{ c[0] }}</small><b>{{ c[1] }}</b></div> }
                }
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="start" id="start">
        <fw-dither kind="fade" [cell]="6" [seed]="41" />
        <div class="wrap railed">
          <div class="start-grid">
            <div>
              <p class="idx"><span>[</span>05<span>]</span><b fwScramble>Get started</b><em>+</em></p>
              <h2 class="h2">Bring this week's timesheets. <span>Leave with the invoice.</span></h2>
              <p class="body">Create a workspace in a minute, or open the seeded studio as any role and click through a full billing week.</p>
            </div>
            <div class="demo-card">
              <i class="sq" style="left:-3px;top:-3px"></i><i class="sq" style="right:-3px;top:-3px"></i><i class="sq" style="left:-3px;bottom:-3px"></i><i class="sq" style="right:-3px;bottom:-3px"></i>
              <h3>Open the demo studio</h3>
              <p class="intro">Larkspur &amp; Co., a seeded studio. Sign in as:</p>
              <ul class="folks">
                @for (p of people; track p.slug) {
                  <li><a routerLink="/login" [queryParams]="{ demo: 1 }"><img [src]="'/people/' + p.slug + '.jpg'" alt="" width="36" height="36" loading="lazy" /><span><b>{{ p.name }}</b><small>{{ p.role }}</small></span><fw-icon name="chevronRight" /></a></li>
                }
              </ul>
              <a class="pxb accent" routerLink="/register"><span fwScramble="hover">Create a workspace</span></a>
              <p class="alt">Already have an account? <a routerLink="/login">Sign in</a></p>
            </div>
          </div>
        </div>
      </section>

      <fw-pixel-edge from="#f5f4f2" to="#121214" [seed]="23" />
    </main>

    <footer class="dark">
      <div class="wrap railed">
        <div class="fgrid">
          <div>
            <a class="brand" routerLink="/" style="padding:0">Fieldwork</a>
            <p>Time, invoices and payments for studios that bill by the hour.</p>
          </div>
          <div><h4 fwScramble>Product/</h4><ul class="tree"><li><a href="#how">How it works</a></li><li><a href="#watch">Tour</a></li><li><a href="#studio">Across the studio</a></li><li><a href="#analytics">Analytics</a></li><li><a href="#access">Access</a></li></ul></div>
          <div><h4 fwScramble>Get started/</h4><ul class="tree"><li><a routerLink="/register">Create a workspace</a></li><li><a routerLink="/login" [queryParams]="{ demo: 1 }">Open the demo</a></li><li><a routerLink="/login">Sign in</a></li></ul></div>
        </div>
        <div class="fbase"><span>© 2026 Fieldwork</span><button type="button" class="pxb sm" (click)="top()"><span fwScramble="hover">Back to top</span></button></div>
      </div>
      <div class="word"><fw-particle-word text="Fieldwork" /></div>
    </footer>
  `,
})
export class LandingPage {
  session = inject(Session);
  private howPin = viewChild<ElementRef<HTMLElement>>('howPin');
  private vd = viewChild<ElementRef<HTMLDialogElement>>('vd');
  private vv = viewChild<ElementRef<HTMLVideoElement>>('vv');

  /** The 60-second video: nothing downloads until someone asks for it; then it plays with sound. */
  openVideo(): void {
    const dlg = this.vd()?.nativeElement, video = this.vv()?.nativeElement;
    if (!dlg || !video) return;
    if (!video.getAttribute('src')) video.src = '/video/fieldwork-60s.mp4';
    dlg.showModal();
    video.currentTime = 0;
    video.play().catch(() => { /* the browser wants a second tap; the controls are there */ });
  }
  closeVideo(): void { this.vv()?.nativeElement.pause(); }
  /** How many record sheets have landed in the iso drawing, 1 to 5. */
  isoStep = signal(1);

  modules = [['Time', 'time'], ['Approvals', 'check'], ['Invoices', 'invoices'], ['Payments', 'payments'], ['Analytics', 'analytics'], ['Chat', 'chat']];

  flow = [
    { title: 'Time entry', text: 'A timer or the weekly grid. One running timer per person, held by the database.' },
    { title: 'Approval', text: 'Managers approve their projects, and the bill and cost rates lock at that moment.' },
    { title: 'Invoice', text: 'A draft reserves approved time, so the same hour can never be billed twice.' },
    { title: 'Payment', text: 'A settled transfer closes the balance; refunds and reversals stay linked to it.' },
    { title: 'Overview', text: 'Billable hours, utilization and collections are read from those same records.' },
  ];

  cards = [
    { title: 'Projects that watch their budget', text: 'Hours used against budget, milestones, staffing and status on every project.', src: '/landing/shot-projects.webp', alt: 'The Projects list: clients, managers, team avatars, end dates and hours used against budget.', wide: true, seed: 2, phone: false },
    { title: 'Clients with their whole history', text: 'Billing contact, account owner, projects and invoices for each client.', src: '/landing/shot-clients.webp', alt: 'The Clients list: each client with its industry, account owner, billing email and project count.', wide: true, seed: 5, phone: false },
    { title: 'Invoices from approved time', text: 'Paid, partial, unpaid and overdue, with the balance on each.', src: '/landing/shot-invoices.webp', alt: 'The Invoices list: 29 invoices with client, project, status, amount and balance.', wide: false, seed: 8, phone: false },
    { title: 'Staff, capacity and leave', text: 'Who is on the team, their schedule and what they can take on.', src: '/landing/shot-staff.webp', alt: 'The Staff directory: name, title, department, manager and skills for each person.', wide: false, seed: 13, phone: false },
    { title: 'Nothing cut on the phone', text: 'A tab bar and rows you can tap, with every feature kept.', src: '/landing/phone.webp', alt: 'Invoices on a phone: rows to tap and a tab bar at the bottom.', wide: false, seed: 17, phone: true },
  ];

  ana = [
    { tag: 'Analytics / By day', title: 'Billable hours as a skyline of the last 26 weeks', src: '/landing/shot-skyline-panel.webp', pos: 'center 30%', alt: 'The skyline panel: daily billable hours as 3D bars, with the busiest day and longest streak.' },
    { tag: 'Analytics / Revenue', title: 'Collected this quarter against the same days of last', src: '/landing/shot-analytics.webp', pos: '0 0', alt: 'Analytics: billable hours, utilization, collected revenue and the collected revenue chart against last quarter.' },
    { tag: 'Reports / Delivery', title: 'Reports that use the dashboard’s own rules', src: '/landing/shot-reports.webp', pos: '0 0', alt: 'The delivery report: milestones by project with baseline and current due dates and outcome.' },
  ];

  people = [
    { slug: 'avery-brooks', name: 'Avery Brooks', role: 'Owner' },
    { slug: 'priya-raman', name: 'Priya Raman', role: 'Project manager' },
    { slug: 'marcus-webb', name: 'Marcus Webb', role: 'Finance' },
    { slug: 'leo-martins', name: 'Leo Martins', role: 'Staff' },
  ];

  roles = ROLES;
  role = signal('owner');
  current = computed(() => ROLES.find((r) => r.key === this.role())!);

  onScroll(): void {
    const el = this.howPin()?.nativeElement;
    if (!el) return;
    if (!matchMedia('(min-width: 901px)').matches) { this.isoStep.set(5); return; }
    const r = el.getBoundingClientRect(), range = r.height - innerHeight + 72;
    const p = Math.min(1, Math.max(0, (72 - r.top) / range));
    this.isoStep.set(Math.min(5, 1 + Math.floor(p * 5)));
  }

  constructor() { afterNextRender(() => this.onScroll()); }

  top(): void {
    scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}
