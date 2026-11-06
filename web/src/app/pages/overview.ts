import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, apiError } from '../core/api';
import { Session } from '../core/session';
import { FORMAT_PIPES } from '../core/format';
import { UI } from '../shared/ui';

@Component({
  selector: 'fw-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ...FORMAT_PIPES, ...UI],
  styles: [`
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); margin-bottom: var(--space-5); }
    .kpi-card { text-decoration: none; transition: box-shadow var(--dur-1) var(--ease-out), transform var(--dur-1) var(--ease-out); }
    .kpi-card:hover { box-shadow: var(--shadow-raised); }
    .kpi-top { display: flex; align-items: center; justify-content: space-between; }
    .kpi-foot { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-1); flex-wrap: wrap; }
    .warn-text { color: var(--color-danger); }
    .issues { display: flex; gap: var(--space-1); flex-wrap: wrap; }
    .use { display: flex; align-items: center; gap: var(--space-2); min-width: 112px; }
    .use .small { min-width: 4ch; text-align: right; }
    .quiet-empty { display: flex; align-items: center; gap: var(--space-3); }
    .qe-icon { width: 32px; height: 32px; flex: none; border-radius: var(--radius-full); display: grid; place-items: center; background: var(--color-positive-subtle, var(--color-bg-sunken)); color: var(--color-positive); }
    .use .meter { flex: 1; }
    .team li { gap: var(--space-3); }
    .team .meter { margin-top: var(--space-2); }
    @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 767px) { td { white-space: normal !important; } .issues .status { height: auto; min-height: 24px; padding-block: 2px; white-space: normal; } .kpis { gap: var(--space-3); } .kpi { padding: var(--space-4); } .kpi-figure { font-size: var(--text-title); line-height: var(--lh-title); } .kpi-icon { width: 30px; height: 30px; } .kpi-foot .kpi-source { display: none; } }
  `],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>{{ greeting() }}, {{ firstName() }}</h1>
          <p class="sub">
            @if (d(); as o) { {{ periodLabel() }} · {{ o.period.start | day }} – today · {{ o.active_projects }} active projects · refreshed {{ o.refreshed_at | ago }} }
            @else { Loading your workspace… }
          </p>
        </div>
        <div class="row wrap">
          <div class="seg" role="group" aria-label="Period">
            @for (p of periods; track p.key) { <button type="button" [attr.aria-pressed]="period() === p.key" (click)="setPeriod(p.key)">{{ p.label }}</button> }
          </div>
          @if (session.can('time.own')) { <a class="btn" routerLink="/time"><fw-icon name="time" />Log time</a> }
          @if (session.can('invoices.manage')) { <a class="btn btn-primary dup" routerLink="/invoices" [queryParams]="{ new: 1 }"><fw-icon name="plus" />New invoice</a> }
          @else if (session.can('projects.manage')) { <a class="btn btn-primary dup" routerLink="/projects" [queryParams]="{ new: 1 }"><fw-icon name="plus" />New project</a> }
        </div>
      </div>

      @if (error()) { <div class="alert danger"><fw-icon name="alert" />{{ error() }}</div> }

      @if (d(); as o) {
        <div class="kpis">
          <a class="panel kpi kpi-card" routerLink="/projects" [queryParams]="{ status: 'active' }">
            <div class="kpi-top"><span class="kpi-label">Active projects</span><span class="kpi-icon"><fw-icon name="projects" /></span></div>
            <span class="kpi-figure">{{ o.active_projects }}</span>
            <div class="kpi-foot"><span class="status" [class.danger]="o.overdue_tasks > 0"><i></i>{{ o.overdue_tasks }} overdue tasks</span><span class="kpi-source">{{ o.open_tasks }} open</span></div>
          </a>
          <a class="panel kpi kpi-card" [routerLink]="session.can('analytics.view') ? '/analytics' : '/time'" [queryParams]="session.can('analytics.view') ? { period: period() } : {}">
            <div class="kpi-top"><span class="kpi-label">Billable hours</span><span class="kpi-icon"><fw-icon name="time" /></span></div>
            <span class="kpi-figure">{{ o.billable_minutes | hours }}<span class="unit">h</span></span>
            <div class="kpi-foot"><span class="kpi-source">Approved time {{ periodLabel().toLowerCase() }}</span></div>
          </a>
          @if (session.can('finance.view')) {
            <a class="panel kpi kpi-card" routerLink="/reports" [queryParams]="{ type: 'payments', period: period() }">
              <div class="kpi-top"><span class="kpi-label">Collected revenue</span><span class="kpi-icon"><fw-icon name="payments" /></span></div>
              <span class="kpi-figure">{{ o.collected_cents | money: o.currency : true }}</span>
              <div class="kpi-foot"><span class="kpi-source">Settled payments less refunds</span></div>
            </a>
            <a class="panel kpi kpi-card" routerLink="/invoices" [queryParams]="{ settlement: 'overdue' }">
              <div class="kpi-top"><span class="kpi-label">Outstanding</span><span class="kpi-icon"><fw-icon name="invoices" /></span></div>
              <span class="kpi-figure">{{ o.outstanding_cents | money: o.currency : true }}</span>
              <div class="meter accent" aria-hidden="true"><span [style.width.%]="o.outstanding_cents ? (o.overdue_cents / o.outstanding_cents) * 100 : 0"></span></div>
              <div class="kpi-foot"><span class="kpi-source"><b class="warn-text" style="font-weight: var(--weight-semibold)">{{ o.overdue_cents | money: o.currency : true }}</b> overdue on {{ o.overdue_count }} invoice{{ o.overdue_count === 1 ? '' : 's' }}</span></div>
            </a>
          } @else {
            <a class="panel kpi kpi-card" routerLink="/projects">
              <div class="kpi-top"><span class="kpi-label">My open tasks</span><span class="kpi-icon"><fw-icon name="list" /></span></div>
              <span class="kpi-figure">{{ o.my_tasks.length }}</span>
              <div class="kpi-foot"><span class="kpi-source">Assigned to you</span></div>
            </a>
            <a class="panel kpi kpi-card" [routerLink]="session.can('time.approve') ? '/time' : '/projects'" [queryParams]="session.can('time.approve') ? { tab: 'approvals' } : {}">
              <div class="kpi-top"><span class="kpi-label">{{ session.can('time.approve') ? 'Waiting for approval' : 'Milestones due' }}</span><span class="kpi-icon"><fw-icon [name]="session.can('time.approve') ? 'check' : 'calendar'" /></span></div>
              <span class="kpi-figure">{{ session.can('time.approve') ? o.pending_approvals : o.upcoming_milestones.length }}</span>
              <div class="kpi-foot"><span class="kpi-source">{{ session.can('time.approve') ? 'Submitted time entries' : 'Overdue and next 30 days' }}</span></div>
            </a>
          }
        </div>

        <div class="grid grid-main">
          <div class="stack-4" style="min-width: 0">
            <section class="panel">
              <div class="panel-head"><div><h2>Needs attention</h2><p class="cell-sub" style="margin-top: 2px">Budget, schedule and status signals from approved records</p></div><a class="btn btn-sm" routerLink="/projects">All projects</a></div>
              @if (o.attention.length) {
                <div class="table-wrap"><table class="table">
                  <thead><tr><th>Project</th><th class="hide-md">Client</th><th>Signals</th><th class="hide-sm">Hours used</th></tr></thead>
                  <tbody>@for (p of o.attention; track p.id) {
                    <tr class="clickable" [routerLink]="['/projects', p.id]">
                      <td style="min-width: 10rem"><span class="cell-title">{{ p.name }}</span><span class="cell-id">{{ p.code }}</span></td>
                      <td class="hide-md" style="white-space: nowrap"><span class="who"><fw-avatar [name]="p.client || 'Internal'" kind="org" size="sm" />{{ p.client || 'Internal' }}</span></td>
                      <td><div class="issues">@for (r of p.reasons; track r) { <span class="status" [class.danger]="r.includes('Over hours') || r.includes('overdue')" [class.warning]="r.includes('90%') || r === 'On hold'"><i></i>{{ r }}</span> }</div></td>
                      <td class="hide-sm">@if (p.consumed !== null) { <div class="use"><div class="meter" [class.over]="p.consumed > 100" [class.accent]="p.consumed > 90 && p.consumed <= 100"><span [style.width.%]="min(p.consumed, 100)"></span></div><span class="small tabular">{{ p.consumed }}%</span></div> } @else { <span class="faint">No budget</span> }</td>
                    </tr>
                  }</tbody>
                </table></div>
              } @else { <div class="panel-body muted">Every active project is within budget and on schedule.</div> }
            </section>

            <section class="panel">
              <div class="panel-head"><div><h2>Milestones due</h2><p class="cell-sub" style="margin-top: 2px">Overdue and the next 30 days</p></div></div>
              @if (o.upcoming_milestones.length) {
                <div class="table-wrap"><table class="table">
                  <thead><tr><th>Milestone</th><th class="hide-md">Project</th><th>Due</th><th>Status</th></tr></thead>
                  <tbody>@for (m of o.upcoming_milestones; track m.id) {
                    <tr class="clickable" [routerLink]="['/projects', m.project_id]" [queryParams]="{ tab: 'milestones' }">
                      <td><span class="cell-title">{{ m.name }}</span><span class="cell-id">{{ m.project?.code }}</span></td>
                      <td class="muted hide-md">{{ m.project?.name }}</td>
                      <td class="tabular">{{ m.due_date | day }}@if (m.due_date !== m.baseline_due_date) { <span class="cell-sub" style="display:block">moved from {{ m.baseline_due_date | day }}</span> }</td>
                      <td>@if (isPast(m.due_date)) { <fw-status value="overdue" /> } @else { <fw-status [value]="m.status" /> }</td>
                    </tr>
                  }</tbody>
                </table></div>
              } @else { <div class="panel-body muted">No milestones are due in the next 30 days.</div> }
            </section>

            @if (o.overdue_invoices?.length) {
              <section class="panel">
                <div class="panel-head"><div><h2>Overdue invoices</h2><p class="cell-sub" style="margin-top: 2px">Past due with a balance</p></div><a class="btn btn-sm" routerLink="/invoices" [queryParams]="{ settlement: 'overdue' }">View all</a></div>
                <div class="table-wrap"><table class="table">
                  <thead><tr><th>Invoice</th><th class="hide-sm">Client</th><th>Due</th><th class="num">Balance</th></tr></thead>
                  <tbody>@for (i of o.overdue_invoices; track i.id) {
                    <tr class="clickable" [routerLink]="['/invoices', i.id]">
                      <td><span class="cell-title mono" style="font-size: var(--text-small)">{{ i.number }}</span></td>
                      <td class="hide-sm"><span class="who"><fw-avatar [name]="i.client" kind="org" size="sm" />{{ i.client }}</span></td>
                      <td class="tabular">{{ i.due_date | day }} <span class="status danger" style="margin-left: var(--space-2)"><i></i>{{ daysLate(i.due_date) }}d late</span></td>
                      <td class="amount">{{ i.balance_cents | money: o.currency }}</td>
                    </tr>
                  }</tbody>
                </table></div>
              </section>
            }
          </div>

          <div class="stack-4" style="min-width: 0">
            <section class="panel">
              <div class="panel-head"><h2>My tasks</h2><span class="count">{{ o.my_tasks.length }}</span></div>
              @if (o.my_tasks.length) {
                <ul class="list">@for (t of o.my_tasks; track t.id) {
                  <li><a class="row-link" [routerLink]="['/projects', t.project_id]" [queryParams]="{ task: t.id }">
                    <span class="grow"><span class="truncate cell-title" style="display:block">{{ t.title }}</span><span class="cell-sub">{{ t.project?.code }} · {{ t.due_date ? ('due ' + (t.due_date | day)) : 'no due date' }}</span></span>
                    <fw-status [value]="t.status" /></a></li>
                }</ul>
              } @else { <div class="panel-body quiet-empty"><span class="qe-icon"><fw-icon name="check" /></span><span class="muted">Nothing assigned to you right now.</span></div> }
            </section>

            @if (o.team) {
              <section class="panel">
                <div class="panel-head"><div><h2>Team this week</h2><p class="cell-sub" style="margin-top: 2px">Logged time against available hours</p></div><a class="btn btn-sm" routerLink="/staff" [queryParams]="{ tab: 'capacity' }">Capacity</a></div>
                <ul class="list team">@for (s of o.team; track s.staff_id) {
                  <li>
                    <fw-avatar [name]="s.name" />
                    <span class="grow" style="min-width: 0"><span class="spread"><span class="small truncate" style="font-weight: var(--weight-medium)">{{ s.name }}</span><span class="small tabular faint">{{ s.logged_minutes | hours: 0 }}/{{ s.available_minutes | hours: 0 }}h</span></span>
                      <div class="meter" [class.over]="s.utilization > 100"><span [style.width.%]="min(s.utilization, 100)"></span></div></span>
                  </li>
                }</ul>
                @if (o.pending_approvals) {
                  <div class="panel-body" style="border-top: var(--hairline) solid var(--color-border)">
                    <a class="btn btn-sm" routerLink="/time" [queryParams]="{ tab: 'approvals' }"><fw-icon name="check" />Review {{ o.pending_approvals }} submitted entries</a>
                  </div>
                }
              </section>
            }

            <section class="panel">
              <div class="panel-head"><h2>Recent activity</h2></div>
              @if (o.recent_activity.length) {
                <ul class="list">@for (a of o.recent_activity; track a.id) {
                  <li style="align-items: flex-start">
                    <fw-avatar [name]="a.user?.name" size="sm" />
                    <span class="grow small"><b style="font-weight: var(--weight-semibold)">{{ a.user?.name }}</b><span class="muted"> {{ lower(a.summary) }}</span>
                      <span class="cell-sub" style="display:block; margin-top: 2px">{{ a.project?.name }} · {{ a.created_at | ago }}</span></span>
                  </li>
                }</ul>
              } @else { <div class="panel-body muted">Activity appears here as your team works.</div> }
            </section>
          </div>
        </div>
      } @else if (!error()) {
        <div class="kpis">@for (i of [1,2,3,4]; track i) { <div class="panel" style="height: 160px"></div> }</div>
      }
    </div>
  `,
})
export class OverviewPage {
  session = inject(Session);
  private api = inject(Api);
  d = signal<any>(null);
  error = signal('');
  period = signal<'week' | 'month' | 'quarter'>('quarter');
  periods = [{ key: 'week' as const, label: 'Week' }, { key: 'month' as const, label: 'Month' }, { key: 'quarter' as const, label: 'Quarter' }];

  constructor() { this.load(); }

  setPeriod(p: 'week' | 'month' | 'quarter'): void { this.period.set(p); this.load(); }
  load(): void {
    this.api.get('/overview', { period: this.period() }).then((o) => { this.d.set(o); this.error.set(''); }).catch((e) => this.error.set(apiError(e).message));
  }
  periodLabel(): string { return { week: 'This week', month: 'Month to date', quarter: 'Quarter to date' }[this.period()]; }
  firstName(): string { return (this.session.user()?.name ?? '').split(' ')[0]; }
  greeting(): string {
    const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: this.session.timezone() }).format(new Date()));
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }
  isPast(date: string): boolean { return date < new Date().toISOString().slice(0, 10); }
  daysLate(date: string): number { return Math.max(0, Math.round((Date.now() - new Date(date + 'T12:00:00Z').getTime()) / 86400000)); }
  min(a: number, b: number): number { return Math.min(a, b); }
  /** Activity summaries arrive as "Moved X from 2026-10-30 to 2026-11-13": lower-case the verb and show dates the way the rest of the app does. */
  lower(s: string): string {
    if (!s) return s;
    const t = s.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y, m, d) => new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    return t.charAt(0).toLowerCase() + t.slice(1);
  }
}
