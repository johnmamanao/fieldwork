import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Api, apiError } from '../core/api';
import { Session } from '../core/session';
import { Toasts } from '../core/toast';
import { TimerState } from '../core/timer';
import { FORMAT_PIPES, formatDuration, parseDuration } from '../core/format';
import { UI } from '../shared/ui';
import { QuickAction } from '../core/quick';


function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

@Component({
  selector: 'fw-time',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ...FORMAT_PIPES, ...UI],
  styles: [`
    .week-nav { display: flex; align-items: center; gap: var(--space-2); }
    .grid-week th.day { text-align: right; min-width: 72px; }
    .grid-week td.cell { text-align: right; font-variant-numeric: tabular-nums; }
    .grid-week td.cell button { border: 0; background: none; padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm); cursor: pointer; font: inherit; color: inherit; min-width: 48px; text-align: right; }
    .grid-week td.cell button:hover { background: var(--color-bg-hover); }
    .grid-week td.today, .grid-week th.today { background: var(--color-accent-subtle); }
    .timer-card { display: flex; gap: var(--space-3); align-items: flex-end; flex-wrap: wrap; }
    .state-dot { width: 8px; height: 8px; border-radius: var(--radius-full); display: inline-block; }
    .group-row td { background: var(--color-bg-sunken); font-weight: var(--weight-medium); }
    .day-chip { width: 44px; height: 44px; border-radius: var(--radius-md); background: var(--color-bg-sunken); display: inline-flex; flex-direction: column; align-items: center; justify-content: center; font-size: var(--text-micro); line-height: 12px; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: var(--track-caps); flex: none; }
    .day-chip b { font-size: var(--text-body); line-height: var(--lh-small); color: var(--color-text); letter-spacing: 0; }
    .day-chip.today { background: var(--color-ink); color: rgb(255 255 255 / 0.7); }
    .day-chip.today b { color: var(--color-on-ink); }
    @media (max-width: 767px) {
      .week-nav h2 { font-size: var(--text-body); }
      .week-nav { width: 100%; }
      .timer-card .field { width: 100% !important; }
      .timer-card .btn-primary { width: 100%; }
      .toolbar .select { width: 100% !important; }
    }
  `],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Time</h1><p class="sub">Log work, submit your week, and approve your team's time.</p></div>
      </div>
      <nav class="tabs">
        @if (session.can('time.own')) { <button type="button" [class.active]="tab() === 'mine'" (click)="setTab('mine')">My timesheet</button> }
        @if (session.can('time.approve')) { <button type="button" [class.active]="tab() === 'approvals'" (click)="setTab('approvals')">Approvals <span class="count">{{ queue().length }}</span></button> }
        @if (session.can('finance.view')) { <button type="button" [class.active]="tab() === 'uninvoiced'" (click)="setTab('uninvoiced')">Uninvoiced time</button> }
      </nav>

      @if (tab() === 'mine') {
        <section class="panel panel-pad" style="margin-bottom: var(--space-4)">
          @if (timer.running(); as t) {
            <div class="spread wrap">
              <div><div class="small muted">Timer running</div><div class="kpi-figure">{{ timer.elapsedText() }}</div><div class="small">{{ t.project?.name }}{{ t.notes ? ' · ' + t.notes : '' }}</div></div>
              <button class="btn btn-primary" (click)="stopTimer()"><fw-icon name="stop" />Stop and log</button>
            </div>
          } @else {
            <form class="timer-card" (ngSubmit)="startTimer()">
              <div class="field" style="width: 240px"><label for="tp">Project</label>
                <select id="tp" class="select" name="p" [(ngModel)]="timerForm.project_id">
                  <option [ngValue]="null">Choose a project</option>
                  @for (p of projects(); track p.id) { <option [ngValue]="p.id">{{ p.code }} · {{ p.name }}</option> }
                </select></div>
              <div class="field grow" style="min-width: 220px"><label for="tn">What are you working on?</label><input id="tn" class="input" name="n" [(ngModel)]="timerForm.notes" /></div>
              <button class="btn btn-primary" type="submit" [disabled]="!timerForm.project_id"><fw-icon name="play" />Start timer</button>
            </form>
          }
        </section>

        <div class="spread wrap" style="margin-bottom: var(--space-3)">
          <div class="week-nav">
            <button class="btn btn-icon" aria-label="Previous week" (click)="shiftWeek(-7)"><fw-icon name="chevronLeft" /></button>
            <h2>{{ weekStart() | day }} – {{ weekEnd() | day }}</h2>
            <button class="btn btn-icon" aria-label="Next week" (click)="shiftWeek(7)"><fw-icon name="chevronRight" /></button>
            <button class="btn btn-sm btn-ghost" (click)="loadWeek(null)">This week</button>
          </div>
          <div class="row wrap">
            <span class="small muted">{{ statusSummary() }}</span>
            @if (counts().submitted > 0 && counts().draft === 0) { <button class="btn" (click)="withdraw()"><fw-icon name="undo" />Withdraw submission</button> }
            <button class="btn btn-primary" [disabled]="counts().draft === 0" (click)="submit()"><fw-icon name="send" />Submit week</button>
          </div>
        </div>

        <div class="panel" style="margin-bottom: var(--space-4)">
          <div class="table-wrap d-table"><table class="table grid-week">
            <thead><tr><th>Project</th>@for (d of days(); track d) { <th class="day" [class.today]="d === today">{{ d | day: 'day' }}</th> }<th class="num">Total</th></tr></thead>
            <tbody>
              @for (r of gridRows(); track r.project.id) {
                <tr>
                  <td><span class="row"><span class="swatch" [style.background]="r.project.color || 'var(--color-compare)'"></span>{{ r.project.name }}</span></td>
                  @for (d of days(); track d) {
                    <td class="cell" [class.today]="d === today"><button type="button" (click)="openNew(r.project.id, d)" [attr.aria-label]="'Log time on ' + r.project.name + ' for ' + d">{{ r.byDay[d] ? fmt(r.byDay[d]) : '·' }}</button></td>
                  }
                  <td class="num"><b>{{ fmt(r.total) }}</b></td>
                </tr>
              } @empty {
                <tr><td [attr.colspan]="9" class="muted">No time this week yet. Pick a day below or start a timer.</td></tr>
              }
            </tbody>
            <tfoot><tr><td>Total</td>@for (d of days(); track d) { <td class="num" [class.today]="d === today">{{ dayTotal(d) ? fmt(dayTotal(d)) : '—' }}</td> }<td class="num">{{ fmt(weekTotal()) }}</td></tr></tfoot>
          </table></div>
          <ul class="m-list" aria-label="Days this week">@for (d of days(); track d) {
            <li class="m-row" (click)="openNew(null, d)" [attr.aria-label]="'Log time on ' + d">
              <span class="day-chip" [class.today]="d === today"><b>{{ dayNum(d) }}</b>{{ dayName(d) }}</span>
              <span class="m-main"><span class="m-title">{{ d === today ? 'Today' : (d | day: 'day') }}</span><span class="m-sub">{{ dayProjects(d) || 'Nothing logged · tap to add' }}</span></span>
              <span class="m-end"><span class="m-amount" [class.faint]="!dayTotal(d)">{{ dayTotal(d) ? fmt(dayTotal(d)) : '—' }}</span></span>
            </li>
          }
            <li class="m-row" style="cursor: default"><span class="m-main"><span class="m-title">Week total</span></span><span class="m-end"><span class="m-amount">{{ fmt(weekTotal()) }}</span></span></li>
          </ul>
        </div>

        <div class="panel">
          <div class="panel-head"><h2>Entries</h2><button class="btn btn-sm" (click)="openNew(null, defaultDay())"><fw-icon name="plus" />Add entry</button></div>
          <div class="table-wrap d-table"><table class="table">
            <thead><tr><th>Date</th><th>Project</th><th>Notes</th><th class="hide-md">Type</th><th class="num">Duration</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (e of entries(); track e.id) {
                <tr>
                  <td class="tabular">{{ e.work_date | day: 'day' }}</td>
                  <td>{{ e.project?.name }}@if (e.task) { <span class="cell-sub" style="display:block">{{ e.task.title }}</span> }</td>
                  <td class="muted">{{ e.notes }}@if (e.rejected_reason && e.status === 'rejected') { <span class="small" style="display:block; color: var(--color-danger)">Returned: {{ e.rejected_reason }}</span> }</td>
                  <td class="hide-md">{{ e.billable ? 'Billable' : 'Nonbillable' }}</td>
                  <td class="num">@if (e.timer_started_at) { <span class="badge info">Running</span> } @else { {{ fmt(e.minutes) }} }</td>
                  <td><fw-status [value]="e.status" />@if (e.invoice_id) { <span class="badge" style="margin-left: var(--space-1)"><fw-icon name="lock" />Invoiced</span> }</td>
                  <td class="num">
                    @if ((e.status === 'draft' || e.status === 'rejected') && !e.timer_started_at && !e.invoice_id) {
                      <button class="btn btn-sm btn-ghost" (click)="openEdit(e)">Edit</button>
                      <button class="btn btn-sm btn-ghost btn-icon" [attr.aria-label]="'Delete entry'" (click)="remove(e)"><fw-icon name="trash" /></button>
                    } @else if (e.status === 'submitted') { <span class="small faint">Withdraw to edit</span> }
                  </td>
                </tr>
              } @empty { <tr><td colspan="7"><fw-empty icon="time" title="Nothing logged this week" text="Entries you add stay as drafts until you submit the week." hint="Durations accept 1:30, 1.5 or 90m."><button class="btn btn-primary" (click)="openNew(null, defaultDay())">Add an entry</button></fw-empty></td></tr> }
            </tbody>
          </table></div>
          <ul class="m-list">@for (e of entries(); track e.id) {
            <li class="m-row" (click)="editable(e) ? openEdit(e) : null" [style.cursor]="editable(e) ? 'pointer' : 'default'">
              <span class="swatch" style="width: 12px; height: 12px; border-radius: 4px" [style.background]="e.project?.color || 'var(--color-compare)'"></span>
              <span class="m-main"><span class="m-title">{{ e.project?.name }}</span>
                <span class="m-sub">{{ e.work_date | day: 'day' }}{{ e.notes ? ' · ' + e.notes : '' }}{{ e.billable ? '' : ' · Nonbillable' }}</span>
                @if (e.rejected_reason && e.status === 'rejected') { <span class="m-sub" style="color: var(--color-danger)">Returned: {{ e.rejected_reason }}</span> }</span>
              <span class="m-end"><span class="m-amount">@if (e.timer_started_at) { Running } @else { {{ fmt(e.minutes) }} }</span><fw-status [value]="e.status" /></span>
            </li>
          } @empty { <li class="m-row" style="cursor: default"><span class="m-main"><span class="m-title">Nothing logged this week</span><span class="m-sub">Tap a day above or use + to add an entry.</span></span></li> }</ul>
        </div>
      }

      @if (tab() === 'approvals') {
        <div class="toolbar">
          <select class="select" style="width: 200px" aria-label="Filter by person" [(ngModel)]="approvalUser" (ngModelChange)="loadQueue()"><option value="">Everyone</option>
            @for (u of queuePeople(); track u.id) { <option [value]="u.id">{{ u.name }}</option> }</select>
          <div class="grow"></div>
          <span class="small muted">{{ selected().size }} selected · {{ fmt(selectedMinutes()) }}</span>
          <button class="btn" [disabled]="!selected().size" (click)="rejecting.set(true)">Return</button>
          <button class="btn btn-primary" [disabled]="!selected().size || approving()" (click)="approve()"><fw-icon name="check" />Approve</button>
        </div>
        <div class="panel">
          @if (queue().length) {
            <div class="table-wrap d-table"><table class="table">
              <thead><tr><th style="width: 40px"><input type="checkbox" aria-label="Select all" [checked]="selected().size === queue().length" (change)="toggleAll()" /></th><th>Date</th><th>Person</th><th>Project</th><th class="hide-md">Notes</th><th class="hide-md">Type</th><th class="num">Duration</th></tr></thead>
              <tbody>
                @for (e of queue(); track e.id) {
                  <tr [class.selected]="selected().has(e.id)">
                    <td><input type="checkbox" [attr.aria-label]="'Select entry from ' + e.user?.name" [checked]="selected().has(e.id)" (change)="toggle(e.id)" /></td>
                    <td class="tabular">{{ e.work_date | day: 'day' }}</td>
                    <td><span class="row"><fw-avatar [name]="e.user?.name" />{{ e.user?.name }}</span></td>
                    <td>{{ e.project?.name }}</td>
                    <td class="muted truncate hide-md" style="max-width: 260px">{{ e.notes }}</td>
                    <td class="hide-md">{{ e.billable ? 'Billable' : 'Nonbillable' }}</td>
                    <td class="num">{{ fmt(e.minutes) }}</td>
                  </tr>
                }
              </tbody>
            </table></div>
            <ul class="m-list">
              <li class="m-row" (click)="toggleAll()"><input type="checkbox" aria-label="Select all" [checked]="selected().size === queue().length" (click)="$event.stopPropagation()" (change)="toggleAll()" /><span class="m-main"><span class="m-title">Select all</span><span class="m-sub">{{ queue().length }} entries waiting</span></span></li>
              @for (e of queue(); track e.id) {
                <li class="m-row" [style.background]="selected().has(e.id) ? 'var(--color-bg-hover)' : null" (click)="toggle(e.id)">
                  <input type="checkbox" [attr.aria-label]="'Select entry from ' + e.user?.name" [checked]="selected().has(e.id)" (click)="$event.stopPropagation()" (change)="toggle(e.id)" />
                  <fw-avatar [name]="e.user?.name" />
                  <span class="m-main"><span class="m-title">{{ e.user?.name }}</span><span class="m-sub">{{ e.project?.name }} · {{ e.work_date | day: 'day' }}{{ e.notes ? ' · ' + e.notes : '' }}</span></span>
                  <span class="m-end"><span class="m-amount">{{ fmt(e.minutes) }}</span><span class="m-sub">{{ e.billable ? 'Billable' : 'Nonbillable' }}</span></span>
                </li>
              }
            </ul>
          } @else {
            <fw-empty icon="check" title="All caught up" text="Submitted time for projects you manage appears here for approval." />
          }
        </div>
      }

      @if (tab() === 'uninvoiced') {
        <div class="panel">
          <div class="panel-head"><h2>Approved, billable, not yet invoiced</h2><span class="small muted">{{ fmt(uninvoicedTotal()) }} across {{ uninvoiced().length }} entries</span></div>
          <div class="table-wrap d-table"><table class="table compact">
            <thead><tr><th>Date</th><th>Person</th><th>Project</th><th class="hide-md">Notes</th><th class="num">Hours</th><th class="num">Value</th></tr></thead>
            <tbody>@for (e of uninvoiced().slice(0, 300); track e.id) {
              <tr><td class="tabular">{{ e.work_date | day }}</td><td>{{ e.user?.name }}</td><td>{{ e.project?.name }}</td><td class="muted hide-md">{{ e.notes }}</td><td class="num">{{ e.minutes | hours: 2 }}</td><td class="num">{{ (e.minutes * e.bill_rate_cents) / 60 | money }}</td></tr>
            } @empty { <tr><td colspan="6" class="muted">Every approved billable entry is on an invoice.</td></tr> }</tbody>
          </table></div>
          <ul class="m-list">@for (e of uninvoiced().slice(0, 100); track e.id) {
            <li class="m-row" style="cursor: default"><fw-avatar [name]="e.user?.name" />
              <span class="m-main"><span class="m-title">{{ e.project?.name }}</span><span class="m-sub">{{ e.user?.name }} · {{ e.work_date | day }}</span></span>
              <span class="m-end"><span class="m-amount">{{ (e.minutes * e.bill_rate_cents) / 60 | money }}</span><span class="m-sub">{{ e.minutes | hours: 2 }}h</span></span></li>
          } @empty { <li class="m-row" style="cursor: default"><span class="m-main"><span class="m-title">Nothing waiting to invoice</span></span></li> }</ul>
        </div>
      }
    </div>

    @if (entryOpen()) {
      <fw-dialog [title]="entryForm.id ? 'Edit entry' : 'Log time'" (close)="entryOpen.set(false)">
        <form class="form-grid" id="entry" (ngSubmit)="saveEntry()">
          <div class="field full"><label for="ep">Project</label>
            <select id="ep" class="select" name="p" [(ngModel)]="entryForm.project_id" (ngModelChange)="entryForm.task_id = null; entryForm.billable = billableDefault($event)">
              <option [ngValue]="null">Choose a project</option>
              @for (p of projects(); track p.id) { <option [ngValue]="p.id">{{ p.code }} · {{ p.name }}</option> }</select>
            @if (entryErrors().project_id) { <span class="error">{{ entryErrors().project_id }}</span> }</div>
          <div class="field full"><label for="et">Task (optional)</label>
            <select id="et" class="select" name="t" [(ngModel)]="entryForm.task_id"><option [ngValue]="null">No task</option>
              @for (t of tasksFor(entryForm.project_id); track t.id) { <option [ngValue]="t.id">{{ t.title }}</option> }</select></div>
          <div class="field"><label for="ed">Date</label><input id="ed" class="input" type="date" name="d" [(ngModel)]="entryForm.work_date" /></div>
          <div class="field"><label for="em">Duration</label><input id="em" class="input" name="m" placeholder="1:30" [(ngModel)]="entryForm.duration" />
            @if (entryErrors().minutes) { <span class="error">{{ entryErrors().minutes }}</span> } @else { <span class="hint">1:30, 1.5 or 90m</span> }</div>
          <div class="field full"><label for="en">Notes</label><textarea id="en" class="textarea" name="n" [(ngModel)]="entryForm.notes"></textarea></div>
          <label class="check full"><input type="checkbox" name="b" [(ngModel)]="entryForm.billable" />Billable</label>
          @if (entryError()) { <div class="form-error full" role="alert">{{ entryError() }}</div> }
        </form>
        <ng-container foot><button class="btn" (click)="entryOpen.set(false)">Cancel</button><button class="btn btn-primary" type="submit" form="entry" [disabled]="saving()">Save entry</button></ng-container>
      </fw-dialog>
    }

    @if (rejecting()) {
      <fw-dialog title="Return time for changes" [subtitle]="selected().size + ' entries go back to their authors with your note.'" (close)="rejecting.set(false)">
        <div class="field"><label for="rr">Reason</label><textarea id="rr" class="textarea" [(ngModel)]="rejectReason" placeholder="What should change?"></textarea></div>
        <ng-container foot><button class="btn" (click)="rejecting.set(false)">Cancel</button><button class="btn btn-primary" [disabled]="!rejectReason.trim()" (click)="reject()">Return entries</button></ng-container>
      </fw-dialog>
    }
  `,
})
export class TimePage implements OnInit {
  session = inject(Session);
  timer = inject(TimerState);
  private api = inject(Api);
  private toasts = inject(Toasts);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  today = new Date().toLocaleDateString('en-CA', { timeZone: this.session.timezone() });
  tab = signal<'mine' | 'approvals' | 'uninvoiced'>('mine');
  weekStart = signal('');
  weekEnd = signal('');
  entries = signal<any[]>([]);
  projects = signal<any[]>([]);
  queue = signal<any[]>([]);
  uninvoiced = signal<any[]>([]);
  selected = signal(new Set<number>());
  approvalUser = '';
  approving = signal(false);
  rejecting = signal(false);
  rejectReason = '';
  timerForm: { project_id: number | null; notes: string } = { project_id: null, notes: '' };
  entryOpen = signal(false);
  entryForm: any = {};
  entryError = signal('');
  entryErrors = signal<Record<string, string>>({});
  saving = signal(false);
  private queuePeopleCache = signal<any[]>([]);

  days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(this.weekStart() || this.today, i)));
  counts = computed(() => {
    const c = { draft: 0, submitted: 0, approved: 0, rejected: 0 } as Record<string, number>;
    for (const e of this.entries()) if (!e.timer_started_at && e.minutes > 0) c[e.status] = (c[e.status] ?? 0) + 1;
    c['draft'] += c['rejected'];
    return c;
  });
  statusSummary = computed(() => {
    const c = this.counts();
    const parts = [];
    if (c['draft']) parts.push(`${c['draft']} to submit`);
    if (c['submitted']) parts.push(`${c['submitted']} awaiting approval`);
    if (c['approved']) parts.push(`${c['approved']} approved`);
    return parts.join(' · ') || 'No entries';
  });
  gridRows = computed(() => {
    const map = new Map<number, { project: any; byDay: Record<string, number>; total: number }>();
    for (const e of this.entries()) {
      const row = map.get(e.project_id) ?? { project: e.project, byDay: {}, total: 0 };
      row.byDay[e.work_date] = (row.byDay[e.work_date] ?? 0) + e.minutes;
      row.total += e.minutes;
      map.set(e.project_id, row);
    }
    return [...map.values()];
  });
  weekTotal = computed(() => this.entries().reduce((a, e) => a + e.minutes, 0));
  selectedMinutes = computed(() => this.queue().filter((e) => this.selected().has(e.id)).reduce((a, e) => a + e.minutes, 0));
  queuePeople = computed(() => this.queuePeopleCache());
  uninvoicedTotal = computed(() => this.uninvoiced().reduce((a, e) => a + e.minutes, 0));

  constructor() { if (this.session.can('time.own')) inject(QuickAction).register('Log time', () => this.openNew(null, this.defaultDay())); }

  ngOnInit(): void {
    const t = this.route.snapshot.queryParamMap.get('tab') as any;
    if (!this.session.can('time.own')) this.tab.set('approvals');
    if (t && ['mine', 'approvals', 'uninvoiced'].includes(t)) this.tab.set(t);
    if (this.session.can('time.own')) this.loadWeek(null);
    if (this.session.can('time.approve')) this.loadQueue();
    if (this.tab() === 'uninvoiced') this.setTab('uninvoiced');
  }

  fmt(m: number): string { return formatDuration(m); }
  editable(e: any): boolean { return (e.status === 'draft' || e.status === 'rejected') && !e.timer_started_at && !e.invoice_id; }
  dayNum(d: string): string { return String(Number(d.slice(8, 10))); }
  dayName(d: string): string { return new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }); }
  dayProjects(d: string): string { return [...new Set(this.entries().filter((e) => e.work_date === d && e.minutes > 0).map((e) => e.project?.name))].join(', '); }
  dayTotal(d: string): number { return this.entries().filter((e) => e.work_date === d).reduce((a, e) => a + e.minutes, 0); }
  defaultDay(): string { return this.days().includes(this.today) ? this.today : this.weekStart(); }
  tasksFor(pid: number | null): any[] { return this.projects().find((p) => p.id === pid)?.tasks ?? []; }
  billableDefault(pid: number | null): boolean { return this.projects().find((p) => p.id === pid)?.billing_model !== 'non_billable'; }

  setTab(t: 'mine' | 'approvals' | 'uninvoiced'): void {
    this.tab.set(t);
    this.router.navigate([], { queryParams: { tab: t === 'mine' ? null : t }, replaceUrl: true });
    if (t === 'uninvoiced') this.api.get<any[]>('/time/uninvoiced').then((r) => this.uninvoiced.set(r));
  }

  async loadWeek(week: string | null): Promise<void> {
    try {
      const r = await this.api.get<any>('/time-entries', { week });
      this.weekStart.set(r.week_start);
      this.weekEnd.set(r.week_end);
      this.entries.set(r.entries);
      this.projects.set(r.projects);
      this.timer.running.set(r.timer);
    } catch (e) { this.toasts.error(apiError(e).message); }
  }
  shiftWeek(n: number): void { this.loadWeek(addDays(this.weekStart(), n)); }

  async loadQueue(): Promise<void> {
    const all = await this.api.get<any[]>('/approvals');
    const people = new Map<number, any>();
    all.forEach((e) => people.set(e.user_id, e.user));
    this.queuePeopleCache.set([...people.values()]);
    this.queue.set(this.approvalUser ? all.filter((e) => String(e.user_id) === this.approvalUser) : all);
    this.selected.set(new Set());
  }
  toggle(id: number): void { const s = new Set(this.selected()); s.has(id) ? s.delete(id) : s.add(id); this.selected.set(s); }
  toggleAll(): void { this.selected.set(this.selected().size === this.queue().length ? new Set() : new Set(this.queue().map((e) => e.id))); }

  async approve(): Promise<void> {
    this.approving.set(true);
    try {
      const r = await this.api.post<{ approved: number }>('/approvals/approve', { ids: [...this.selected()] });
      this.toasts.ok(`Approved ${r.approved} entries. Analytics now include them.`);
      await this.loadQueue();
    } catch (e) { this.toasts.error(apiError(e).message); } finally { this.approving.set(false); }
  }
  async reject(): Promise<void> {
    try {
      const r = await this.api.post<{ rejected: number }>('/approvals/reject', { ids: [...this.selected()], reason: this.rejectReason });
      this.toasts.ok(`Returned ${r.rejected} entries`);
      this.rejecting.set(false);
      this.rejectReason = '';
      await this.loadQueue();
    } catch (e) { this.toasts.error(apiError(e).message); }
  }

  async startTimer(): Promise<void> {
    try {
      await this.timer.start({ project_id: this.timerForm.project_id!, notes: this.timerForm.notes });
      this.timerForm = { project_id: null, notes: '' };
      this.loadWeek(this.weekStart());
    } catch (e) { this.toasts.error(apiError(e).message); }
  }
  async stopTimer(): Promise<void> {
    try {
      const r = await this.timer.stop();
      this.toasts.ok(`Logged ${formatDuration(r.entry.minutes)}`);
      this.loadWeek(this.weekStart());
    } catch (e) { this.toasts.error(apiError(e).message); }
  }

  async submit(): Promise<void> {
    try {
      const r = await this.api.post<{ submitted: number }>('/timesheets/submit', { week: this.weekStart() });
      this.toasts.ok(`Submitted ${r.submitted} entries for approval`);
      this.loadWeek(this.weekStart());
    } catch (e) { this.toasts.error(apiError(e).message); }
  }
  async withdraw(): Promise<void> {
    try {
      const r = await this.api.post<{ withdrawn: number }>('/timesheets/withdraw', { week: this.weekStart() });
      this.toasts.ok(`Withdrew ${r.withdrawn} entries. They are drafts again.`);
      this.loadWeek(this.weekStart());
    } catch (e) { this.toasts.error(apiError(e).message); }
  }

  openNew(projectId: number | null, day: string): void {
    this.entryForm = { project_id: projectId, task_id: null, work_date: day, duration: '', notes: '', billable: this.billableDefault(projectId) };
    this.entryError.set('');
    this.entryErrors.set({});
    this.entryOpen.set(true);
  }
  openEdit(e: any): void {
    this.entryForm = { id: e.id, project_id: e.project_id, task_id: e.task_id, work_date: e.work_date, duration: formatDuration(e.minutes), notes: e.notes, billable: e.billable };
    this.entryError.set('');
    this.entryErrors.set({});
    this.entryOpen.set(true);
  }
  async saveEntry(): Promise<void> {
    const f = this.entryForm;
    const minutes = parseDuration(String(f.duration ?? ''));
    if (!minutes) { this.entryErrors.set({ minutes: 'Enter a duration like 1:30 or 1.5' }); return; }
    this.saving.set(true);
    const body = { project_id: f.project_id, task_id: f.task_id, work_date: f.work_date, minutes, notes: f.notes || null, billable: f.billable };
    try {
      if (f.id) await this.api.patch(`/time-entries/${f.id}`, body);
      else await this.api.post('/time-entries', body);
      this.entryOpen.set(false);
      this.loadWeek(this.weekStart());
    } catch (e) {
      const { message, fields } = apiError(e);
      this.entryErrors.set(fields);
      this.entryError.set(Object.keys(fields).length ? '' : message);
    } finally { this.saving.set(false); }
  }
  async remove(e: any): Promise<void> {
    if (!confirm('Delete this entry?')) return;
    try { await this.api.delete(`/time-entries/${e.id}`); this.loadWeek(this.weekStart()); } catch (err) { this.toasts.error(apiError(err).message); }
  }
}
