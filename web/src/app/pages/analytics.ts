import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, apiError } from '../core/api';
import { Session } from '../core/session';
import { FORMAT_PIPES, formatHours, formatMoney } from '../core/format';
import { UI } from '../shared/ui';
import { CompareChart, Sparkline } from '../shared/charts';
import { FILL, Skyline } from '../shared/skyline';

@Component({
  selector: 'fw-analytics',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:resize)': 'onResize()' },
  imports: [FormsModule, RouterLink, CompareChart, Sparkline, Skyline, ...FORMAT_PIPES, ...UI],
  styles: [`
    /* billable hours by day: the card */
    .daily-head { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: start; gap: var(--space-5); margin-bottom: var(--space-4); }
    .daily-stats { display: flex; gap: var(--space-5); }
    .daily-stats span, .sky-stats span { display: block; font-size: var(--text-small); color: var(--color-text-secondary); }
    .daily-stats b { font-size: var(--text-heading); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
    .daily-stats em, .sky-stats em { font-style: normal; font-weight: var(--weight-medium); font-size: var(--text-small); color: var(--color-text-tertiary); margin-left: var(--space-1); }
    .card-grid { display: block; }
    .legend { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); margin-top: var(--space-3); flex-wrap: wrap; }
    .scale { display: inline-flex; align-items: center; gap: var(--space-1); }
    .scale i { width: 10px; height: 10px; border-radius: 1px; display: inline-block; }
    @media (max-width: 900px) { .daily-head { grid-template-columns: minmax(0, 1fr); gap: var(--space-3); } .daily-stats { flex-wrap: wrap; gap: var(--space-4); } }

    /* the side panel */
    .sky { width: min(640px, 100vw); height: 100%; background: var(--color-bg-surface); box-shadow: var(--shadow-overlay); display: flex; flex-direction: column; animation: sky-in var(--dur-4) var(--ease-drawer) both; }
    @keyframes sky-in { from { transform: translateX(32px); opacity: 0; } to { transform: none; opacity: 1; } }
    .sky-head { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-5) var(--space-5) var(--space-3); }
    .sky-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 var(--space-5) var(--space-6); display: grid; gap: var(--space-4); align-content: start; }
    .sky-controls { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
    .sky-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-3); }
    .sky-stats > div + div { padding-left: var(--space-3); box-shadow: inset 1px 0 0 var(--color-border); }
    .sky-stats b { display: block; margin-top: 2px; font-size: var(--text-title); line-height: 1.1; font-weight: var(--weight-semibold); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
    .sky-stats b.accent { color: var(--color-accent); }
    .sky-stage { background: var(--color-bg); border-radius: var(--radius-lg); padding: var(--space-4) var(--space-4) var(--space-3); }
    .sky-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
    .sky-card { border-radius: var(--radius-lg); box-shadow: var(--shadow-ring); padding: var(--space-4); display: grid; gap: var(--space-3); align-content: start; }
    .sky-card h3 { font-size: var(--text-body); font-weight: var(--weight-semibold); }
    .rhythm { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--space-2); height: 120px; align-items: end; }
    .rb { display: grid; grid-template-rows: auto 1fr auto; justify-items: center; height: 100%; gap: var(--space-1); }
    .rb .v { font-size: var(--text-micro); color: var(--color-text-tertiary); font-variant-numeric: tabular-nums; }
    .rb .bar { align-self: end; width: 100%; border-radius: var(--radius-xs); background: var(--color-bg-selected); }
    .rb .bar.top { background: var(--color-accent); }
    .rb .d { font-size: var(--text-micro); color: var(--color-text-secondary); }
    .split { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-3); }
    .split li { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto; align-items: center; column-gap: var(--space-2); row-gap: var(--space-2); font-size: var(--text-small); }
    .split li i { width: 8px; height: 8px; border-radius: 50%; }
    .split .n { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .split b { font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; }
    .split .meter { grid-column: 2 / -1; }
    @media (max-width: 640px) { .sky-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: var(--space-4); } .sky-stats > div:nth-child(3) { box-shadow: none; padding-left: 0; } .sky-pair { grid-template-columns: minmax(0, 1fr); } .sky-head, .sky-body { padding-inline: var(--space-4); } }
    @media (prefers-reduced-motion: reduce) { .sky { animation: none; } }

    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); margin-bottom: var(--space-4); }
    .kpi .row-figure { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
    .breakdown { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); margin-top: var(--space-2); }
    .breakdown div { font-size: var(--text-small); color: var(--color-text-secondary); }
    .breakdown b { display: block; color: var(--color-text); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; font-size: var(--text-body); }
    .health { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); }
    .over { color: var(--color-danger); }
    @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .health { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .m-only { display: none; }
    .filter-set { display: contents; }
    @media (max-width: 767px) {
      .m-only { display: inline-flex; }
      .filter-set { display: none; width: 100%; flex-direction: column; gap: var(--space-2); }
      .filter-set.open { display: flex; }
      .filter-set .select { width: 100% !important; }
      .kpis { gap: var(--space-3); }
      .kpi { padding: var(--space-4); }
      .kpi .kpi-figure { font-size: var(--text-title); line-height: var(--lh-title); }
      .kpi fw-sparkline, .kpi .kpi-source, .kpi .breakdown { display: none; }
      .kpi .row-figure { flex-direction: column; align-items: flex-start; gap: var(--space-1); }
      .health { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Analytics</h1>
          @if (d(); as a) { <p class="sub">{{ a.period.start | day: 'long' }} – {{ endInclusive(a.period.end_exclusive) | day: 'long' }} · {{ a.period.timezone }} · compared with {{ a.comparison.mode === 'full_period' ? 'the full previous period' : 'the same elapsed days last period' }}</p> }
        </div>
        <div class="seg" role="group" aria-label="Period">
          @for (p of periods; track p.key) { <button type="button" [attr.aria-pressed]="f.period === p.key" (click)="f.period = p.key; apply()">{{ p.label }}</button> }
        </div>
      </div>

      <div class="toolbar">
        @if (f.period === 'custom') {
          <input class="input" type="date" style="width: 160px" aria-label="From" [(ngModel)]="f.from" (change)="apply()" />
          <input class="input" type="date" style="width: 160px" aria-label="To" [(ngModel)]="f.to" (change)="apply()" />
        } @else {
          <button class="btn btn-icon" aria-label="Previous period" (click)="shift(-1)"><fw-icon name="chevronLeft" /></button>
          <button class="btn btn-icon" aria-label="Next period" (click)="shift(1)"><fw-icon name="chevronRight" /></button>
        }
        <button class="pill-btn m-only" type="button" (click)="showFilters.set(!showFilters())" [attr.aria-expanded]="showFilters()"><fw-icon name="filter" />Filters @if (activeFilters()) { <span class="badge-count">{{ activeFilters() }}</span> }</button>
        <div class="filter-set" [class.open]="showFilters()">
        <select class="select" style="width: 200px" aria-label="Project" [(ngModel)]="f.project_id" (change)="apply()"><option value="">All projects</option>
          @for (p of projects(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }</select>
        @if (session.can('clients.view')) {
          <select class="select" style="width: 190px" aria-label="Client" [(ngModel)]="f.client_id" (change)="apply()"><option value="">All clients</option>
            @for (c of clients(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select>
        }
        <select class="select" style="width: 170px" aria-label="Team member" [(ngModel)]="f.user_id" (change)="apply()"><option value="">Whole team</option>
          @for (m of members(); track m.user.id) { <option [value]="m.user.id">{{ m.user.name }}</option> }</select>
        <select class="select" style="width: 170px" aria-label="Manager" [(ngModel)]="f.manager_id" (change)="apply()"><option value="">Any manager</option>
          @for (m of managers(); track m.user.id) { <option [value]="m.user.id">{{ m.user.name }}</option> }</select>
        <select class="select" style="width: 150px" aria-label="Project status" [(ngModel)]="f.status" (change)="apply()"><option value="">Any status</option>
          @for (s of ['active','on_hold','completed','draft']; track s) { <option [value]="s">{{ s | label }}</option> }</select>
        <label class="check small"><input type="checkbox" [(ngModel)]="fullCompare" (change)="apply()" />Full-period comparison</label>
        </div>
      </div>

      @if (error()) { <div class="alert danger">{{ error() }}</div> }

      @if (d(); as a) {
        <div class="kpis">
          <div class="panel kpi">
            <span class="kpi-label">Billable hours</span>
            <div class="row-figure"><span class="kpi-figure">{{ a.billable_minutes.value | hours }}<span class="unit">h</span></span>
              <fw-delta [percent]="a.billable_minutes.change_percent" [change]="a.billable_minutes.change" [absolute]="hoursText(a.billable_minutes.change) + 'h'" /></div>
            <fw-sparkline [values]="spark(a.billable_series)" />
            <span class="kpi-source">Approved billable time · <a [routerLink]="'/reports'" [queryParams]="reportLink('time')">view entries</a></span>
          </div>
          <div class="panel kpi">
            <span class="kpi-label">Utilization</span>
            <div class="row-figure"><span class="kpi-figure" [class.over]="a.utilization.over_capacity">{{ a.utilization.value === null ? 'N/A' : a.utilization.value + '%' }}</span>
              @if (a.utilization.change !== null) { <fw-delta [percent]="null" [change]="a.utilization.change" [absolute]="a.utilization.change + ' pts'" [noPrior]="false" /> }</div>
            <div class="breakdown"><div>Billable<b>{{ a.billable_minutes.value | hours: 0 }}h</b></div><div>Available<b>{{ a.available_minutes | hours: 0 }}h</b></div><div>Nonbillable<b>{{ a.nonbillable_minutes | hours: 0 }}h</b></div></div>
            <span class="kpi-source">@if (a.utilization.over_capacity) { Above 100%: billable time exceeds scheduled capacity · } <a routerLink="/reports" [queryParams]="reportLink('utilization')">by person</a></span>
          </div>
          @if (a.collected_cents) {
            <div class="panel kpi">
              <span class="kpi-label">Collected revenue</span>
              <div class="row-figure"><span class="kpi-figure">{{ a.collected_cents.value | money: a.currency : true }}</span>
                <fw-delta [percent]="a.collected_cents.change_percent" [change]="a.collected_cents.change" [absolute]="money(a.collected_cents.change, a.currency)" /></div>
              <fw-sparkline [values]="spark(a.collected_series)" />
              <span class="kpi-source">Settled payments less refunds · <a routerLink="/reports" [queryParams]="reportLink('payments')">ledger</a></span>
            </div>
            <div class="panel kpi">
              <span class="kpi-label">Invoiced</span>
              <div class="row-figure"><span class="kpi-figure">{{ a.invoiced_cents.value | money: a.currency : true }}</span>
                <fw-delta [percent]="a.invoiced_cents.change_percent" [change]="a.invoiced_cents.change" [absolute]="money(a.invoiced_cents.change, a.currency)" /></div>
              <div class="breakdown"><div>Open<b>{{ a.outstanding_cents | money: a.currency : true }}</b></div><div>Overdue<b [style.color]="a.overdue_cents ? 'var(--color-danger)' : null">{{ a.overdue_cents | money: a.currency : true }}</b></div><div>Late<b>{{ a.overdue_count }} inv.</b></div></div>
              <span class="kpi-source">Issued less credits · <a routerLink="/reports" [queryParams]="reportLink('aging')">aging</a></span>
            </div>
          } @else {
            <div class="panel kpi">
              <span class="kpi-label">On-time milestones</span>
              <span class="kpi-figure">{{ a.milestones.rate === null ? 'N/A' : a.milestones.rate + '%' }}</span>
              <span class="kpi-source">{{ a.milestones.on_time }} on time · {{ a.milestones.missed }} missed</span>
            </div>
            <div class="panel kpi">
              <span class="kpi-label">Overdue milestones</span>
              <span class="kpi-figure">{{ a.milestones.overdue_open }}</span>
              <span class="kpi-source">Open and past due</span>
            </div>
          }
        </div>

        <section class="panel panel-pad" style="margin-bottom: var(--space-4)">
          <div class="spread wrap" style="margin-bottom: var(--space-2)">
            <div><h2>{{ a.collected_series ? 'Collected revenue' : 'Billable hours' }}</h2>
              <p class="small muted">Running total by {{ a.collected_series ? a.collected_series.bucket : a.billable_series.bucket }}. Buckets with no activity count as zero; days still ahead are not drawn.</p></div>
            @if (a.collected_series) {
              <div class="seg" role="group" aria-label="Chart measure">
                <button type="button" [attr.aria-pressed]="measure() === 'revenue'" (click)="measure.set('revenue')">Revenue</button>
                <button type="button" [attr.aria-pressed]="measure() === 'hours'" (click)="measure.set('hours')">Hours</button>
              </div>
            }
          </div>
          @if (measure() === 'revenue' && a.collected_series) {
            <fw-compare-chart [points]="a.collected_series.points" [bucket]="a.collected_series.bucket" [format]="moneyFmt()" [axisFormat]="moneyAxis()"
              [currentLabel]="currentLabel()" [previousLabel]="previousLabel()" />
          } @else {
            <fw-compare-chart [points]="a.billable_series.points" [bucket]="a.billable_series.bucket" [format]="hoursFmt" [axisFormat]="hoursAxis"
              [currentLabel]="currentLabel()" [previousLabel]="previousLabel()" />
          }
        </section>

        @if (daily(); as dd) {
          <section class="panel panel-pad daily" #dailyCard style="margin-bottom: var(--space-4)">
            <div class="daily-head">
              <div><h2>Billable hours by day</h2><p class="small muted">Approved time, last {{ dd.weeks }} weeks · {{ dd.start | day }} – {{ endInclusive(dd.end_exclusive) | day }}</p></div>
              <div class="daily-stats">
                <div><span>Total</span><b>{{ dd.stats.total_minutes | hours: 0 }}h</b></div>
                @if (dd.stats.busiest; as b) { <div><span>Busiest day</span><b>{{ b.minutes | hours: 0 }}h <em>{{ b.date | day }}</em></b></div> }
                <div><span>Longest streak</span><b>{{ dd.stats.longest_streak }} <em>workdays</em></b></div>
              </div>
              <button type="button" class="btn btn-sm" (click)="openSky('3d')"><fw-icon name="analytics" />View as skyline</button>
            </div>
            <fw-skyline class="card-grid" [days]="dd.days" mode="grid" [flat]="true" [busiest]="dd.stats.busiest?.date ?? null" (dayPick)="openSky('3d')" />
            <div class="legend small faint"><span>Hover a day for its projects</span><span class="scale">Less @for (c of scale; track c) { <i [style.background]="c"></i> } More</span></div>
          </section>

          @if (skyOpen() ? sky() : null; as sk) {
            <dialog fwModal #sd class="modal side" aria-label="Billable hours by day" (cancel)="$event.preventDefault(); skyOpen.set(false)" (click)="$event.target === sd ? skyOpen.set(false) : null">
              <aside class="sky">
                <header class="sky-head">
                  <div class="grow"><h2>Billable hours by day</h2><p class="small muted">{{ session.workspace()?.name }} · {{ sk.start | day }} – {{ endInclusive(sk.end_exclusive) | day }}</p></div>
                  <button type="button" class="btn btn-ghost btn-icon" aria-label="Close" (click)="skyOpen.set(false)"><fw-icon name="x" /></button>
                </header>
                <div class="sky-body">
                  <div class="sky-controls">
                    <div class="seg" role="group" aria-label="View">
                      <button type="button" [attr.aria-pressed]="skyMode() === '3d'" (click)="skyMode.set('3d')">3D</button>
                      <button type="button" [attr.aria-pressed]="skyMode() === 'grid'" (click)="skyMode.set('grid')">Grid</button>
                    </div>
                    <span class="small faint">Last {{ sk.weeks }} weeks · approved, billable</span>
                  </div>
                  <div class="sky-stats">
                    <div><span>{{ sk.weeks }}-week total</span><b class="accent">{{ sk.stats.total_minutes | hours: 0 }}<em>h</em></b></div>
                    @if (sk.stats.busiest; as b) { <div><span>Busiest day</span><b>{{ b.minutes | hours: 0 }}<em>h · {{ b.date | day }}</em></b></div> }
                    <div><span>Longest streak</span><b>{{ sk.stats.longest_streak }}<em>workdays</em></b></div>
                    <div><span>Avg per workday</span><b>{{ avgWorkday(sk) | hours: 1 }}<em>h</em></b></div>
                  </div>
                  <div class="sky-stage">
                    <fw-skyline [days]="sk.days" [mode]="skyMode()" [busiest]="sk.stats.busiest?.date ?? null" />
                    <div class="legend small faint"><span>Hover or use the arrow keys</span><span class="scale">Less @for (c of scale; track c) { <i [style.background]="c"></i> } More</span></div>
                  </div>
                  <div class="sky-pair">
                    <section class="sky-card">
                      <div class="spread"><h3>Weekday rhythm</h3><span class="small faint">avg h / day</span></div>
                      <div class="rhythm">
                        @for (m of sk.stats.weekday_avg_minutes; track $index; let i = $index) {
                          <div class="rb"><span class="v">{{ m | hours: 1 }}</span><div class="bar" [class.top]="m === maxOf(sk.stats.weekday_avg_minutes)" [style.height.%]="pct(m, maxOf(sk.stats.weekday_avg_minutes))"></div><span class="d">{{ 'MTWTFSS'[i] }}</span></div>
                        }
                      </div>
                      <p class="small muted">{{ rhythmNote(sk.stats.weekday_avg_minutes) }}</p>
                    </section>
                    <section class="sky-card">
                      <div class="spread"><h3>Where the hours went</h3><span class="small faint">{{ sk.weeks }} weeks</span></div>
                      <ul class="split">
                        @for (p of projectTotals(sk).slice(0, 5); track p.id) {
                          <li><i [style.background]="p.color || '#a1a1aa'"></i><span class="n">{{ p.name }}</span><b>{{ p.minutes | hours: 0 }}h</b>
                            <div class="meter"><span [style.width.%]="pct(p.minutes, projectTotals(sk)[0].minutes)" [style.background]="p.color || null"></span></div></li>
                        }
                      </ul>
                    </section>
                  </div>
                </div>
              </aside>
            </dialog>
          }
        }

        <div class="grid grid-main">
          <section class="panel">
            <div class="panel-head"><h2>Team capacity</h2><span class="small faint">Approved time vs available hours</span></div>
            <div class="table-wrap d-table"><table class="table compact">
              <thead><tr><th>Person</th><th class="num">Available</th><th class="num">Logged</th><th class="num">Billable</th><th style="width: 30%">Utilization</th></tr></thead>
              <tbody>@for (s of a.capacity; track s.staff_id) {
                <tr><td><a class="cell-title" [routerLink]="['/staff', s.staff_id]">{{ s.name }}</a><span class="cell-sub" style="display:block">{{ s.title }}</span></td>
                  <td class="num">{{ s.available_minutes | hours: 0 }}h</td><td class="num">{{ s.logged_minutes | hours: 0 }}h</td><td class="num">{{ s.billable_minutes | hours: 0 }}h</td>
                  <td><div class="row"><div class="meter grow" [class.over]="(s.utilization ?? 0) > 100"><span [style.width.%]="min(s.utilization ?? 0, 100)"></span></div><span class="small tabular" style="width: 52px; text-align: right">{{ s.utilization === null ? 'N/A' : s.utilization + '%' }}</span></div></td></tr>
              }</tbody>
            </table></div>
            <ul class="m-list">@for (s of a.capacity; track s.staff_id) {
              <li><a class="m-row" [routerLink]="['/staff', s.staff_id]"><fw-avatar [name]="s.name" />
                <span class="m-main"><span class="m-title">{{ s.name }}</span><span class="m-sub">{{ s.billable_minutes | hours: 0 }}h billable of {{ s.available_minutes | hours: 0 }}h available</span>
                  <div class="meter" style="margin-top: 6px" [class.over]="(s.utilization ?? 0) > 100"><span [style.width.%]="min(s.utilization ?? 0, 100)"></span></div></span>
                <span class="m-end"><span class="m-amount">{{ s.utilization === null ? 'N/A' : s.utilization + '%' }}</span></span></a></li>
            }</ul>
          </section>
          <section class="panel panel-pad stack-4">
            <h2>Delivery health</h2>
            <div class="health" style="grid-template-columns: repeat(2, minmax(0, 1fr))">
              <div><div class="small muted">On-time rate</div><div class="kpi-figure">{{ a.milestones.rate === null ? 'N/A' : a.milestones.rate + '%' }}</div></div>
              <div><div class="small muted">Overdue open</div><div class="kpi-figure" [style.color]="a.milestones.overdue_open ? 'var(--color-danger)' : null">{{ a.milestones.overdue_open }}</div></div>
              <div><div class="small muted">On time</div><div class="v tabular">{{ a.milestones.on_time }}</div></div>
              <div><div class="small muted">Missed or late</div><div class="v tabular">{{ a.milestones.missed }}</div></div>
            </div>
            <p class="small muted">Milestones whose baseline due date falls in the period. Overdue uncompleted milestones count as missed. {{ a.milestones.pending }} still pending.</p>
            <a class="btn btn-sm" routerLink="/reports" [queryParams]="reportLink('delivery')">Open delivery report</a>
          </section>
        </div>

        <details class="panel panel-pad" style="margin-top: var(--space-4)">
          <summary style="cursor: pointer; font-weight: var(--weight-medium)">How these numbers are calculated</summary>
          <dl class="stack-2" style="margin: var(--space-3) 0 0">
            @for (k of defKeys(a.definitions); track k) { <div><dt class="small" style="font-weight: var(--weight-medium)">{{ k | label }}</dt><dd class="small muted" style="margin: 0">{{ a.definitions[k] }}</dd></div> }
          </dl>
        </details>
      } @else if (!error()) {
        <div class="kpis">@for (i of [1,2,3,4]; track i) { <div class="panel" style="height: 148px"></div> }</div>
      }
    </div>
  `,
})
export class AnalyticsPage implements OnInit {
  session = inject(Session);
  private api = inject(Api);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  periods = [{ key: 'week', label: 'Week' }, { key: 'month', label: 'Month' }, { key: 'quarter', label: 'Quarter' }, { key: 'custom', label: 'Custom' }];
  f: Record<string, string> = { period: 'quarter', anchor: '', from: '', to: '', project_id: '', client_id: '', user_id: '', manager_id: '', status: '' };
  fullCompare = false;
  d = signal<any>(null);
  error = signal('');
  projects = signal<any[]>([]);
  clients = signal<any[]>([]);
  members = signal<any[]>([]);
  managers = computed(() => this.members().filter((m) => ['owner', 'admin', 'project_manager'].includes(m.role)));
  measure = signal<'revenue' | 'hours'>('revenue');
  showFilters = signal(false);
  activeFilters(): number { return ['project_id', 'client_id', 'user_id', 'manager_id', 'status'].filter((k) => this.f[k]).length; }

  hoursFmt = (v: number) => `${formatHours(v, 1)}h`;
  hoursAxis = (v: number) => `${formatHours(v, 0)}h`;
  moneyFmt = computed(() => (v: number) => formatMoney(v, this.d()?.currency ?? this.session.currency()));
  moneyAxis = computed(() => (v: number) => formatMoney(v, this.d()?.currency ?? this.session.currency(), true).replace('.00', ''));
  currentLabel = computed(() => ({ week: 'This week', month: 'This month', quarter: 'This quarter', custom: 'Selected range' })[this.d()?.period.kind as string] ?? 'This period');
  previousLabel = computed(() => ({ week: 'Previous week', month: 'Previous month', quarter: 'Previous quarter', custom: 'Previous range' })[this.d()?.period.kind as string] ?? 'Previous period');

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    for (const k of Object.keys(this.f)) this.f[k] = q.get(k) ?? this.f[k];
    this.fullCompare = q.get('compare') === 'full';
    this.load();
    this.api.get<any>('/projects', { per_page: 100 }).then((r) => this.projects.set(r.data)).catch(() => undefined);
    if (this.session.can('clients.view')) this.api.get<any>('/clients', { per_page: 100 }).then((r) => this.clients.set(r.data)).catch(() => undefined);
    this.api.get<any[]>('/members').then((m) => this.members.set(m.filter((x) => x.status === 'active'))).catch(() => undefined);
  }

  apply(): void {
    if (this.f['period'] !== 'custom') { this.f['from'] = ''; this.f['to'] = ''; }
    this.router.navigate([], { queryParams: { ...this.clean(), compare: this.fullCompare ? 'full' : null }, replaceUrl: true });
    this.load();
  }

  shift(dir: number): void {
    const base = this.f['anchor'] || this.d()?.period.start || new Date().toISOString().slice(0, 10);
    const dt = new Date(base + 'T12:00:00Z');
    if (this.f['period'] === 'week') dt.setUTCDate(dt.getUTCDate() + 7 * dir);
    else if (this.f['period'] === 'month') dt.setUTCMonth(dt.getUTCMonth() + dir);
    else dt.setUTCMonth(dt.getUTCMonth() + 3 * dir);
    this.f['anchor'] = dt.toISOString().slice(0, 10);
    this.apply();
  }

  private clean(): Record<string, string> {
    return Object.fromEntries(Object.entries(this.f).filter(([, v]) => v));
  }

  async load(): Promise<void> {
    this.loadDaily();
    try {
      this.d.set(await this.api.get('/analytics', { ...this.clean(), compare: this.fullCompare ? 'full' : null }));
      if (!this.d().collected_series) this.measure.set('hours');
      this.error.set('');
    } catch (e) { this.error.set(apiError(e).message); }
  }

  /* ---------- billable hours by day: the contribution grid and its skyline ---------- */
  daily = signal<any>(null);
  skyOpen = signal(false);
  skyMode = signal<'3d' | 'grid'>('3d');
  readonly scale = FILL;

  /** The side panel's data: always 26 weeks, so the 3D bars stay wide enough to read. */
  sky = signal<any>(null);
  /** How many weeks the card shows: as many as fit at a comfortable cell size, from a quarter to a year. */
  private cardWeeks = 26;
  private dailyCard = viewChild<ElementRef<HTMLElement>>('dailyCard');
  private fitWeeks(): number {
    const w = this.dailyCard()?.nativeElement.clientWidth ?? (document.querySelector('.page') as HTMLElement | null)?.clientWidth ?? innerWidth;
    return Math.max(13, Math.min(53, Math.floor((w - 48 - 38) / 26)));
  }
  private resizeTimer: ReturnType<typeof setTimeout> | undefined;
  /** A wider or narrower window changes how many weeks fit; reload once the resize settles. */
  onResize(): void {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => { if (this.fitWeeks() !== this.cardWeeks) this.loadDaily(); }, 250);
  }

  /** Same filters as the page, for as many whole weeks as fit the card. */
  private async loadDaily(): Promise<void> {
    const { project_id, client_id, user_id, manager_id, status } = this.f;
    this.cardWeeks = this.fitWeeks();
    this.sky.set(null);
    try { this.daily.set(await this.api.get('/analytics/daily', { weeks: this.cardWeeks, project_id, client_id, user_id, manager_id, status })); }
    catch { this.daily.set(null); }
  }
  async openSky(mode: '3d' | 'grid'): Promise<void> {
    this.skyMode.set(mode);
    if (!this.sky()) {
      const dd = this.daily();
      if (dd?.weeks === 26) this.sky.set(dd);
      else {
        const { project_id, client_id, user_id, manager_id, status } = this.f;
        try { this.sky.set(await this.api.get('/analytics/daily', { weeks: 26, project_id, client_id, user_id, manager_id, status })); } catch { return; }
      }
    }
    this.skyOpen.set(true);
  }
  avgWorkday(dd: any): number { return dd.stats.days_worked ? dd.stats.total_minutes / dd.stats.days_worked : 0; }
  maxOf(a: number[]): number { return Math.max(1, ...a); }
  pct(v: number, max: number): number { return max ? Math.max(2, (v / max) * 100) : 0; }
  rhythmNote(avg: number[]): string {
    const names = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];
    const top = avg.indexOf(Math.max(...avg));
    const weekend = avg[5] + avg[6];
    return `${names[top]} peak${weekend ? '' : ' · weekends stay clear'}.`;
  }
  private totalsCache = new WeakMap<object, any[]>();
  projectTotals(dd: any): any[] {
    let t = this.totalsCache.get(dd);
    if (!t) {
      const m = new Map<number, any>();
      for (const d of dd.days) for (const p of d.projects) { const e = m.get(p.id) ?? { ...p, minutes: 0 }; e.minutes += p.minutes; m.set(p.id, e); }
      t = [...m.values()].sort((a, b) => b.minutes - a.minutes);
      this.totalsCache.set(dd, t);
    }
    return t;
  }

  reportLink(type: string): Record<string, string> { return { type, ...this.clean() }; }
  spark(series: any): (number | null)[] { return (series?.points ?? []).map((p: any) => p.current); }
  hoursText(min: number): string { return formatHours(min, 1); }
  money(c: number, cur: string): string { return formatMoney(c, cur, true); }
  min(a: number, b: number): number { return Math.min(a, b); }
  defKeys(o: Record<string, string>): string[] { return Object.keys(o ?? {}); }
  endInclusive(endExclusive: string): string {
    const d = new Date(endExclusive + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
}
