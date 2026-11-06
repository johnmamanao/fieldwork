import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, apiError } from '../core/api';
import { Session } from '../core/session';
import { Toasts } from '../core/toast';
import { FORMAT_PIPES } from '../core/format';
import { UI } from '../shared/ui';
import { QuickAction } from '../core/quick';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

@Component({
  selector: 'fw-staff',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ...FORMAT_PIPES, ...UI],
  styles: [`
    .cap td.cell { min-width: 112px; vertical-align: top; }
    .cap .bar { height: 8px; border-radius: var(--radius-full); background: var(--color-bg-selected); overflow: hidden; margin: var(--space-1) 0; }
    .cap .bar span { display: block; height: 100%; background: var(--color-ink); }
    .cap .over .bar span { background: var(--color-danger); }
    .cap .over .n { color: var(--color-danger); font-weight: var(--weight-medium); }
    @media (max-width: 767px) { .toolbar .search, .toolbar .select { width: 100% !important; } .page-head > .row { width: 100%; } }
  `],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Staff</h1><p class="sub">Workforce profiles, schedules, capacity and leave.</p></div>
        <div class="row">
          <button class="btn" (click)="leaveOpen.set(true)"><fw-icon name="calendar" />Request leave</button>
          @if (session.can('staff.manage')) { <button class="btn btn-primary dup" (click)="openCreate()"><fw-icon name="plus" />Add staff</button> }
        </div>
      </div>
      <nav class="tabs">
        @for (t of tabs; track t.key) { <button type="button" [class.active]="tab() === t.key" (click)="setTab(t.key)">{{ t.label }}@if (t.key === 'leave' && pendingLeave()) { <span class="count">{{ pendingLeave() }}</span> }</button> }
      </nav>

      @switch (tab()) {
        @case ('directory') {
          <div class="toolbar">
            <input class="input search" type="search" placeholder="Search name, title or department" aria-label="Search staff" [(ngModel)]="q" (input)="load()" />
            <select class="select" style="width: 160px" aria-label="Department" [(ngModel)]="dept" (change)="load()"><option value="">All departments</option>@for (d of departments(); track d) { <option [value]="d">{{ d }}</option> }</select>
            <select class="select" style="width: 140px" aria-label="Status" [(ngModel)]="status" (change)="load()"><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select>
          </div>
          <div class="panel"><div class="table-wrap d-table"><table class="table">
            <thead><tr><th>Name</th><th>Title</th><th class="hide-md">Department</th><th>Manager</th><th class="hide-md">Type</th><th>Account</th><th class="hide-md">Skills</th></tr></thead>
            <tbody>@for (s of staff(); track s.id) {
              <tr class="clickable" [routerLink]="['/staff', s.id]">
                <td><span class="row"><fw-avatar [name]="s.name" /><a class="cell-title" [routerLink]="['/staff', s.id]">{{ s.name }}</a></span></td>
                <td>{{ s.title }}</td><td class="muted hide-md">{{ s.department }}</td><td class="muted">{{ s.manager?.name || '—' }}</td><td class="hide-md">{{ s.employment_type | label }}</td>
                <td>@if (s.user) { <fw-status value="active" override="Linked" /> } @else { <span class="badge">No login yet</span> }</td>
                <td class="small muted truncate hide-md" style="max-width: 220px">{{ (s.skills ?? []).join(', ') }}</td>
              </tr>
            } @empty { <tr><td colspan="7" class="muted">No staff match.</td></tr> }</tbody>
          </table></div>
          <ul class="m-list">@for (s of staff(); track s.id) {
            <li><a class="m-row" [routerLink]="['/staff', s.id]"><fw-avatar [name]="s.name" />
              <span class="m-main"><span class="m-title">{{ s.name }}</span><span class="m-sub">{{ s.title }} · {{ s.department }}</span></span>
              <span class="m-end">@if (s.user) { <fw-status value="active" override="Linked" /> } @else { <fw-status value="draft" override="No login" /> }<span class="m-sub">{{ s.employment_type | label }}</span></span></a></li>
          } @empty { <li class="m-row"><span class="m-main"><span class="m-title">No staff match</span></span></li> }</ul></div>
        }

        @case ('capacity') {
          <div class="toolbar">
            <button class="btn btn-icon" aria-label="Previous weeks" (click)="shiftCap(-28)"><fw-icon name="chevronLeft" /></button>
            <button class="btn btn-icon" aria-label="Next weeks" (click)="shiftCap(28)"><fw-icon name="chevronRight" /></button>
            <span class="small muted">Planned allocation against available hours (schedule − holidays − approved leave). Red means over-allocated.</span>
          </div>
          @if (cap(); as c) {
            <div class="panel"><div class="table-wrap d-table"><table class="table cap">
              <thead><tr><th>Person</th>@for (w of c.staff[0]?.weeks ?? []; track w.week_start) { <th>Week of {{ w.week_start | day }}</th> }</tr></thead>
              <tbody>@for (s of c.staff; track s.id) {
                <tr><td><a class="cell-title" [routerLink]="['/staff', s.id]">{{ s.name }}</a><span class="cell-sub" style="display:block">{{ s.title }}</span></td>
                  @for (w of s.weeks; track w.week_start) {
                    <td class="cell" [class.over]="w.over_allocated" [attr.title]="tooltip(w)">
                      <div class="small n tabular">{{ w.allocated_minutes | hours: 0 }} / {{ w.available_minutes | hours: 0 }}h</div>
                      <div class="bar"><span [style.width.%]="w.available_minutes ? min(100, w.allocated_minutes / w.available_minutes * 100) : (w.allocated_minutes ? 100 : 0)"></span></div>
                      @if (w.over_allocated) { <div class="small n">Over by {{ (w.allocated_minutes - w.available_minutes) | hours: 0 }}h</div> }
                      @else if (!w.available_minutes) { <div class="small faint">Unavailable</div> }
                    </td>
                  }
                </tr>
              }</tbody>
            </table></div>
            <div class="m-list">
              <div class="spread" style="padding: var(--space-3) var(--space-4); border-bottom: var(--hairline) solid var(--color-border)">
                <button class="btn btn-icon btn-sm" aria-label="Previous week" [disabled]="capWeek() === 0" (click)="capWeek.set(capWeek() - 1)"><fw-icon name="chevronLeft" /></button>
                <b class="small">Week of {{ c.staff[0]?.weeks[capWeek()]?.week_start | day }}</b>
                <button class="btn btn-icon btn-sm" aria-label="Next week" [disabled]="capWeek() >= (c.staff[0]?.weeks.length ?? 1) - 1" (click)="capWeek.set(capWeek() + 1)"><fw-icon name="chevronRight" /></button>
              </div>
              <ul class="list" style="padding: 0">@for (s of c.staff; track s.id) {
                @if (s.weeks[capWeek()]; as w) {
                  <li><a class="m-row" style="width: 100%; padding: 0" [routerLink]="['/staff', s.id]"><fw-avatar [name]="s.name" />
                    <span class="m-main"><span class="m-title">{{ s.name }}</span><span class="m-sub" [style.color]="w.over_allocated ? 'var(--color-danger)' : null">{{ w.over_allocated ? 'Over by ' + ((w.allocated_minutes - w.available_minutes) | hours: 0) + 'h' : (!w.available_minutes ? 'Unavailable' : s.title) }}</span>
                      <div class="meter" style="margin-top: 6px" [class.over]="w.over_allocated"><span [style.width.%]="w.available_minutes ? min(100, w.allocated_minutes / w.available_minutes * 100) : (w.allocated_minutes ? 100 : 0)"></span></div></span>
                    <span class="m-end"><span class="m-amount">{{ w.allocated_minutes | hours: 0 }}/{{ w.available_minutes | hours: 0 }}h</span></span></a></li>
                }
              }</ul>
            </div></div>
          }
        }

        @case ('leave') {
          <div class="panel"><div class="table-wrap d-table"><table class="table">
            <thead><tr><th>Person</th><th>Type</th><th>Dates</th><th class="hide-md">Reason</th><th>Status</th><th></th></tr></thead>
            <tbody>@for (l of leave(); track l.id) {
              <tr><td>{{ l.staff?.name }}</td><td>{{ l.type | label }}</td><td class="tabular">{{ l.start_date | day }} – {{ l.end_date | day }}</td><td class="muted hide-md">{{ l.reason || '—' }}</td><td><fw-status [value]="l.status" /></td>
                <td class="num">@if (l.status === 'pending' && session.can('leave.approve')) {
                    <button class="btn btn-sm" (click)="decide(l, 'approved')">Approve</button><button class="btn btn-sm btn-ghost" (click)="decide(l, 'rejected')">Decline</button> }
                  @if (l.status === 'pending' || l.status === 'approved') { <button class="btn btn-sm btn-ghost" (click)="cancelLeave(l)">Cancel</button> }</td></tr>
            } @empty { <tr><td colspan="6"><fw-empty icon="calendar" title="No leave requests" text="Approved leave reduces available hours in capacity and utilization." /></td></tr> }</tbody>
          </table></div>
          <ul class="m-list">@for (l of leave(); track l.id) {
            <li class="m-row" style="cursor: default; flex-wrap: wrap"><fw-avatar [name]="l.staff?.name" />
              <span class="m-main"><span class="m-title">{{ l.staff?.name }}</span><span class="m-sub">{{ l.type | label }} · {{ l.start_date | day }} – {{ l.end_date | day }}{{ l.reason ? ' · ' + l.reason : '' }}</span></span>
              <span class="m-end"><fw-status [value]="l.status" /></span>
              @if (l.status === 'pending' || l.status === 'approved') {
                <div class="row" style="width: 100%; padding-left: 40px">@if (l.status === 'pending' && session.can('leave.approve')) { <button class="btn btn-sm" (click)="decide(l, 'approved')">Approve</button><button class="btn btn-sm btn-ghost" (click)="decide(l, 'rejected')">Decline</button> }<button class="btn btn-sm btn-ghost" (click)="cancelLeave(l)">Cancel</button></div>
              }
            </li>
          } @empty { <li class="m-row"><span class="m-main"><span class="m-title">No leave requests</span></span></li> }</ul></div>
        }

        @case ('holidays') {
          <div class="grid grid-main">
            <div class="panel"><ul class="list">@for (h of holidays(); track h.id) {
              <li><span class="grow">{{ h.name }}</span><span class="tabular muted">{{ h.date | day: 'long' }}</span>
                @if (session.can('workspace.settings')) { <button class="btn btn-sm btn-ghost btn-icon" [attr.aria-label]="'Remove ' + h.name" (click)="removeHoliday(h)"><fw-icon name="x" /></button> }</li>
            } @empty { <li class="muted">No workspace holidays.</li> }</ul></div>
            @if (session.can('workspace.settings')) {
              <form class="panel panel-pad stack-3" (ngSubmit)="addHoliday()"><h2>Add holiday</h2>
                <div class="field"><label for="hn">Name</label><input id="hn" class="input" name="hn" [(ngModel)]="holiday.name" /></div>
                <div class="field"><label for="hd">Date</label><input id="hd" class="input" type="date" name="hd" [(ngModel)]="holiday.date" /></div>
                <button class="btn" type="submit" [disabled]="!holiday.name || !holiday.date">Add holiday</button></form>
            }
          </div>
        }
      }
    </div>

    @if (leaveOpen()) {
      <fw-dialog title="Request leave" subtitle="Your manager approves it; approved leave removes those days from your capacity." (close)="leaveOpen.set(false)">
        <div class="form-grid">
          <div class="field"><label for="lt">Type</label><select id="lt" class="select" [(ngModel)]="leaveForm.type">@for (t of ['vacation','sick','personal','parental','other']; track t) { <option [value]="t">{{ t | label }}</option> }</select></div>
          <div></div>
          <div class="field"><label for="ls">From</label><input id="ls" class="input" type="date" [(ngModel)]="leaveForm.start_date" /></div>
          <div class="field"><label for="le">To</label><input id="le" class="input" type="date" [(ngModel)]="leaveForm.end_date" /></div>
          <div class="field full"><label for="lr">Note</label><input id="lr" class="input" [(ngModel)]="leaveForm.reason" /></div>
        </div>
        @if (error()) { <div class="form-error" style="margin-top: var(--space-3)">{{ error() }}</div> }
        <ng-container foot><button class="btn" (click)="leaveOpen.set(false)">Cancel</button><button class="btn btn-primary" (click)="requestLeave()">Send request</button></ng-container>
      </fw-dialog>
    }
    @if (creating()) {
      <fw-dialog title="Add staff profile" subtitle="A profile can exist before the person has a login. Invite them from Users to link an account." (close)="creating.set(false)">
        <div class="form-grid">
          <div class="field"><label for="sn">Name</label><input id="sn" class="input" [(ngModel)]="form.name" /></div>
          <div class="field"><label for="se">Email</label><input id="se" class="input" type="email" [(ngModel)]="form.email" /></div>
          <div class="field"><label for="st">Title</label><input id="st" class="input" [(ngModel)]="form.title" /></div>
          <div class="field"><label for="sd">Department</label><input id="sd" class="input" [(ngModel)]="form.department" /></div>
          <div class="field"><label for="sty">Type</label><select id="sty" class="select" [(ngModel)]="form.employment_type"><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="contractor">Contractor</option></select></div>
          <div class="field"><label for="sso">Start date</label><input id="sso" class="input" type="date" [(ngModel)]="form.started_on" /></div>
        </div>
        @if (error()) { <div class="form-error" style="margin-top: var(--space-3)">{{ error() }}</div> }
        <ng-container foot><button class="btn" (click)="creating.set(false)">Cancel</button><button class="btn btn-primary" [disabled]="!form.name" (click)="create()">Add profile</button></ng-container>
      </fw-dialog>
    }
  `,
})
export class StaffPage implements OnInit {
  session = inject(Session);
  private api = inject(Api);
  private toasts = inject(Toasts);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  tabs = [{ key: 'directory', label: 'Directory' }, { key: 'capacity', label: 'Capacity' }, { key: 'leave', label: 'Leave' }, { key: 'holidays', label: 'Holidays' }];
  tab = signal('directory');
  staff = signal<any[]>([]);
  departments = signal<string[]>([]);
  cap = signal<any>(null);
  /** Phone shows one week of the capacity calendar at a time. */
  capWeek = signal(0);
  capStart = '';
  leave = signal<any[]>([]);
  pendingLeave = signal(0);
  holidays = signal<any[]>([]);
  holiday = { name: '', date: '' };
  q = '';
  dept = '';
  status = 'active';
  leaveOpen = signal(false);
  leaveForm: any = { type: 'vacation', start_date: '', end_date: '', reason: '' };
  creating = signal(false);
  form: any = {};
  error = signal('');

  constructor() { if (this.session.can('staff.manage')) inject(QuickAction).register('Add staff', () => this.openCreate()); }

  ngOnInit(): void {
    this.setTab(this.route.snapshot.queryParamMap.get('tab') ?? 'directory');
    this.load();
    this.loadLeave();
  }
  setTab(t: string): void {
    this.tab.set(t);
    this.router.navigate([], { queryParams: { tab: t === 'directory' ? null : t }, replaceUrl: true });
    if (t === 'capacity') this.loadCap();
    if (t === 'holidays') this.api.get<any[]>('/holidays').then((h) => this.holidays.set(h));
  }
  min(a: number, b: number): number { return Math.min(a, b); }
  tooltip(w: any): string { return w.items.map((i: any) => `${i.code}: ${Math.round(i.minutes / 60)}h`).join('\n') || 'No allocations'; }

  async load(): Promise<void> {
    const s = await this.api.get<any[]>('/staff', { q: this.q, department: this.dept, status: this.status });
    this.staff.set(s);
    if (!this.departments().length) this.departments.set([...new Set(s.map((x) => x.department).filter(Boolean))].sort() as string[]);
  }
  async loadCap(): Promise<void> { this.cap.set(await this.api.get('/capacity', { start: this.capStart, weeks: 6 })); }
  shiftCap(days: number): void {
    const base = new Date((this.cap()?.start ?? new Date().toISOString().slice(0, 10)) + 'T12:00:00Z');
    base.setUTCDate(base.getUTCDate() + days);
    this.capStart = base.toISOString().slice(0, 10);
    this.loadCap();
  }
  async loadLeave(): Promise<void> {
    const l = await this.api.get<any[]>('/leave');
    this.leave.set(l);
    this.pendingLeave.set(this.session.can('leave.approve') ? l.filter((x) => x.status === 'pending').length : 0);
  }
  async decide(l: any, status: string): Promise<void> { try { await this.api.post(`/leave/${l.id}/decide`, { status }); this.toasts.ok(`Leave ${status}`); this.loadLeave(); } catch (e) { this.toasts.error(apiError(e).message); } }
  async cancelLeave(l: any): Promise<void> { try { await this.api.post(`/leave/${l.id}/cancel`); this.loadLeave(); } catch (e) { this.toasts.error(apiError(e).message); } }
  async requestLeave(): Promise<void> {
    this.error.set('');
    try { await this.api.post('/leave', this.leaveForm); this.leaveOpen.set(false); this.toasts.ok('Leave requested'); this.setTab('leave'); this.loadLeave(); }
    catch (e) { const { message, fields } = apiError(e); this.error.set(Object.values(fields)[0] ?? message); }
  }
  async addHoliday(): Promise<void> {
    try { await this.api.post('/holidays', this.holiday); this.holiday = { name: '', date: '' }; this.holidays.set(await this.api.get<any[]>('/holidays')); }
    catch (e) { this.toasts.error(Object.values(apiError(e).fields)[0] ?? apiError(e).message); }
  }
  async removeHoliday(h: any): Promise<void> { await this.api.delete(`/holidays/${h.id}`); this.holidays.set(await this.api.get<any[]>('/holidays')); }
  openCreate(): void { this.form = { name: '', email: '', title: '', department: '', employment_type: 'full_time', started_on: new Date().toISOString().slice(0, 10) }; this.error.set(''); this.creating.set(true); }
  async create(): Promise<void> {
    try { const s = await this.api.post<any>('/staff', { ...this.form, email: this.form.email || null }); this.creating.set(false); this.router.navigate(['/staff', s.id]); }
    catch (e) { const { message, fields } = apiError(e); this.error.set(Object.values(fields)[0] ?? message); }
  }
}

@Component({
  selector: 'fw-staff-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ...FORMAT_PIPES, ...UI],
  template: `
    <div class="page">
      @if (s(); as s) {
        <a class="small muted row" routerLink="/staff" style="text-decoration:none; margin-bottom: var(--space-3)"><fw-icon name="arrowLeft" />Staff</a>
        <div class="page-head">
          <div class="row-3"><fw-avatar [name]="s.name" size="lg" /><div><div class="row"><h1>{{ s.name }}</h1>@if (s.employment_status === 'inactive') { <fw-status value="inactive" /> }</div>
            <p class="sub">{{ s.title }} · {{ s.department }}{{ s.manager ? ' · reports to ' + s.manager.name : '' }}{{ s.location ? ' · ' + s.location : '' }}</p></div></div>
          @if (session.can('staff.manage') && s.employment_status === 'active') { <button class="btn" (click)="deactivate()">Deactivate</button> }
        </div>
        <div class="grid grid-4" style="margin-bottom: var(--space-4)">
          <div class="panel kpi"><span class="kpi-label">Available this month</span><span class="kpi-figure">{{ s.month.available_minutes | hours: 0 }}<span class="unit">h</span></span><span class="kpi-source">To date, after holidays and leave</span></div>
          <div class="panel kpi"><span class="kpi-label">Approved this month</span><span class="kpi-figure">{{ s.month.approved_minutes | hours: 1 }}<span class="unit">h</span></span><span class="kpi-source">{{ s.month.billable_minutes | hours }}h billable</span></div>
          <div class="panel kpi"><span class="kpi-label">Utilization</span><span class="kpi-figure">{{ s.month.available_minutes ? round(s.month.billable_minutes / s.month.available_minutes * 100) + '%' : 'N/A' }}</span><span class="kpi-source">Month to date</span></div>
          <div class="panel kpi"><span class="kpi-label">Account</span><span class="kpi-figure" style="font-size: var(--text-heading)">{{ s.user ? 'Linked' : 'Not invited' }}</span><span class="kpi-source">{{ s.user?.email || s.email || 'No email' }}</span></div>
        </div>
        <div class="grid grid-main">
          <div class="stack-4">
            <section class="panel"><div class="panel-head"><h2>Allocations</h2></div>
              <ul class="list">@for (a of s.allocations; track a.id) {
                <li><span class="swatch" [style.background]="a.project?.color || 'var(--color-compare)'"></span><a class="grow cell-title" [routerLink]="['/projects', a.project_id]">{{ a.project?.name }}</a><span class="small muted">{{ a.start_date | day }} – {{ a.end_date | day }}</span><b class="tabular">{{ a.minutes_per_week | hours }}h/wk</b></li>
              } @empty { <li class="muted">No allocations.</li> }</ul></section>
            @if (s.rates) {
              <section class="panel"><div class="panel-head"><h2>Rates</h2><span class="small faint">Restricted to finance roles</span></div>
                <div class="table-wrap"><table class="table compact"><thead><tr><th>Effective from</th><th>Scope</th><th class="num">Bill rate</th><th class="num">Cost rate</th></tr></thead>
                  <tbody>@for (r of s.rates; track r.id) { <tr><td class="tabular">{{ r.effective_from | day }}</td><td>{{ r.project?.name || 'Standard' }}</td><td class="num">{{ r.bill_rate_cents | money }}</td><td class="num">{{ r.cost_rate_cents | money }}</td></tr> }</tbody></table></div>
                @if (session.can('rates.manage')) {
                  <form class="panel-body row wrap" style="border-top: var(--hairline) solid var(--color-border)" (ngSubmit)="addRate()">
                    <input class="input sm" style="width: 140px" type="date" name="rf" aria-label="Effective from" [(ngModel)]="rate.effective_from" />
                    <input class="input sm" style="width: 120px" type="number" step="0.01" name="rb" aria-label="Bill rate" placeholder="Bill / h" [(ngModel)]="rate.bill" />
                    <input class="input sm" style="width: 120px" type="number" step="0.01" name="rc" aria-label="Cost rate" placeholder="Cost / h" [(ngModel)]="rate.cost" />
                    <button class="btn btn-sm" type="submit" [disabled]="!rate.effective_from || rate.bill === null">Add rate</button>
                    <span class="small faint">Approved time keeps the rate captured at approval.</span>
                  </form>
                }
              </section>
            }
          </div>
          <div class="stack-4">
            <section class="panel panel-pad stack-2"><h2>Schedule</h2>
              <div class="table-wrap"><table class="table compact"><tbody>@for (m of s.schedule_effective; track $index) { <tr><td>{{ days[$index] }}</td><td class="num">{{ m ? (m | hours) + 'h' : 'Off' }}</td></tr> }</tbody></table></div>
              <p class="small faint">{{ s.schedule ? 'Personal schedule' : 'Workspace default schedule' }}</p></section>
            <section class="panel"><div class="panel-head"><h2>Leave</h2></div>
              <ul class="list">@for (l of s.leave; track l.id) { <li><span class="grow">{{ l.type | label }} <span class="small muted">{{ l.start_date | day }} – {{ l.end_date | day }}</span></span><fw-status [value]="l.status" /></li> } @empty { <li class="muted">No leave on record.</li> }</ul></section>
            @if (s.skills?.length) { <section class="panel panel-pad stack-2"><h2>Skills</h2><div class="row wrap">@for (k of s.skills; track k) { <span class="badge">{{ k }}</span> }</div></section> }
          </div>
        </div>
      }
    </div>
  `,
})
export class StaffDetailPage implements OnInit {
  id = input.required<string>();
  session = inject(Session);
  private api = inject(Api);
  private toasts = inject(Toasts);
  days = DAYS;
  s = signal<any>(null);
  rate: { effective_from: string; bill: number | null; cost: number | null } = { effective_from: '', bill: null, cost: null };
  ngOnInit(): void { this.load(); }
  round(n: number): number { return Math.round(n); }
  async load(): Promise<void> { this.s.set(await this.api.get(`/staff/${this.id()}`)); }
  async addRate(): Promise<void> {
    try {
      await this.api.post(`/staff/${this.id()}/rates`, { effective_from: this.rate.effective_from, bill_rate_cents: Math.round((this.rate.bill ?? 0) * 100), cost_rate_cents: this.rate.cost === null ? null : Math.round(this.rate.cost * 100) });
      this.rate = { effective_from: '', bill: null, cost: null };
      this.toasts.ok('Rate added');
      this.load();
    } catch (e) { this.toasts.error(Object.values(apiError(e).fields)[0] ?? apiError(e).message); }
  }
  async deactivate(): Promise<void> {
    if (!confirm('Deactivate this profile? History, rates and time are kept.')) return;
    await this.api.post(`/staff/${this.id()}/deactivate`);
    this.load();
  }
}
