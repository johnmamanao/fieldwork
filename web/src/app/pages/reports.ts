import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Api, apiError } from '../core/api';
import { Session } from '../core/session';
import { Toasts } from '../core/toast';
import { FORMAT_PIPES, formatDate, formatMoney, label } from '../core/format';
import { UI } from '../shared/ui';

@Component({
  selector: 'fw-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ...FORMAT_PIPES, ...UI],
  styles: [`
    .layout { display: grid; grid-template-columns: minmax(0, 1fr); }
    .toolbar .search { flex: 1 1 140px; min-width: 0; max-width: 240px; width: auto; }
    .saved { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin: calc(-1 * var(--space-2)) 0 var(--space-4); }
    .chip { display: inline-flex; align-items: center; height: var(--control-sm); padding-left: var(--space-3); border-radius: var(--radius-full); background: var(--color-bg-surface); box-shadow: var(--shadow-ring); }
    .chip button { border: 0; background: none; cursor: pointer; color: var(--color-text); font: inherit; font-size: var(--text-small); }
    .chip-name { padding: 0 var(--space-1) 0 0; }
    .chip-x { width: var(--control-sm); height: var(--control-sm); display: grid; place-items: center; border-radius: var(--radius-full); color: var(--color-text-tertiary) !important; transition: color var(--dur-1) var(--ease-out), background-color var(--dur-1) var(--ease-out); }
    .chip-x:hover { color: var(--color-text) !important; background: var(--color-bg-selected); }
    .totals { display: flex; gap: var(--space-6); flex-wrap: wrap; }
    .totals div { font-size: var(--text-small); color: var(--color-text-secondary); }
    .totals b { display: block; font-size: var(--text-heading); line-height: var(--lh-heading); color: var(--color-text); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; }
    @media (max-width: 767px) {
      .toolbar .select, .toolbar .input { width: 100% !important; }
      .toolbar .grow { display: none; }
      .toolbar .btn { flex: 1; }
      .totals { gap: var(--space-4); }
      .totals b { font-size: var(--text-body); }
    }
  `],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Reports</h1><p class="sub">Detail behind every Analytics figure, with the same rules and totals.</p></div></div>
      <nav class="tabs" aria-label="Report">
        @for (t of types(); track t.type) {
          <button type="button" [class.active]="type() === t.type" [attr.aria-current]="type() === t.type ? 'page' : null" [attr.title]="t.label" (click)="select(t.type)">{{ short(t) }}</button>
        }
      </nav>
      @if (saved().length) {
        <div class="saved" aria-label="Saved views">
          <span class="small muted">Saved views</span>
          @for (s of saved(); track s.id) {
            <span class="chip"><button type="button" class="chip-name" (click)="applySaved(s)">{{ s.name }}</button><button type="button" class="chip-x" [attr.aria-label]="'Delete ' + s.name" (click)="deleteSaved(s)"><fw-icon name="x" /></button></span>
          }
        </div>
      }
      <div class="layout">
        <section class="stack-4" style="min-width: 0">
          <div class="toolbar" style="margin: 0">
            <select class="select" style="width: 148px" aria-label="Period" [(ngModel)]="f.period" (change)="load()">
              <option value="month">This month</option><option value="quarter">This quarter</option><option value="week">This week</option><option value="custom">Custom range</option></select>
            @if (f.period === 'custom') {
              <input class="input" type="date" style="width: 150px" aria-label="From" [(ngModel)]="f.from" (change)="load()" />
              <input class="input" type="date" style="width: 150px" aria-label="To" [(ngModel)]="f.to" (change)="load()" />
            }
            <select class="select" style="width: 160px" aria-label="Project" [(ngModel)]="f.project_id" (change)="load()"><option value="">All projects</option>
              @for (p of projects(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }</select>
            @if (session.can('clients.view')) {
              <select class="select" style="width: 152px" aria-label="Client" [(ngModel)]="f.client_id" (change)="load()"><option value="">All clients</option>
                @for (c of clients(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select>
            }
            <input class="input search" type="search" placeholder="Search rows" aria-label="Search rows" [(ngModel)]="q" (input)="page = 1; load()" />
            <div class="grow"></div>
            <button class="btn" (click)="print()"><fw-icon name="file" />Print</button>
            <button class="btn" (click)="saveView()"><fw-icon name="plus" />Save view</button>
            <button class="btn btn-primary" (click)="exportCsv()" [disabled]="exporting()"><fw-icon name="download" />{{ exporting() ? 'Preparing CSV…' : 'Export CSV' }}</button>
          </div>

          @if (error()) { <div class="alert danger">{{ error() }}</div> }
          @if (r(); as r) {
            <div class="panel panel-pad stack-3">
              <div class="spread wrap"><div><h2>{{ r.title }}</h2>
                <p class="small muted">{{ r.workspace }} · {{ r.currency }} · {{ r.period.start | day }} – {{ endInclusive(r.period.measured_until_exclusive) | day }} · generated {{ r.generated_at | ago }}</p></div></div>
              <div class="totals">
                @for (k of keys(r.totals); track k) { <div>{{ k | label }}<b>{{ totalText(k, r.totals[k], r) }}</b></div> }
              </div>
              <p class="small faint">{{ r.disclosure }}</p>
            </div>

            <div class="panel">
              @if (r.rows.length) {
                <div class="table-wrap d-table"><table class="table compact">
                  <thead><tr>@for (c of r.columns; track c.key) {
                    <th [class.num]="isNum(c)"><button class="sort" (click)="sortBy(c.key)">{{ c.label }}@if (sort === c.key) { <span aria-hidden="true">{{ dir === 'asc' ? '↑' : '↓' }}</span> }</button></th>
                  }</tr></thead>
                  <tbody>@for (row of r.rows; track $index) {
                    <tr>@for (c of r.columns; track c.key) {
                      <td [class.num]="isNum(c)">@if (c.type === 'status') { <fw-status [value]="row[c.key]" /> } @else { {{ cell(c, row[c.key], r) }} }</td>
                    }</tr>
                  }</tbody>
                </table></div>
                <ul class="m-list">@for (row of r.rows; track $index) {
                  <li class="m-row" style="cursor: default">
                    <span class="m-main"><span class="m-title">{{ mTitle(row, r) }}</span><span class="m-sub">{{ mSub(row, r) }}</span></span>
                    <span class="m-end"><span class="m-amount">{{ mEnd(row, r) }}</span>@if (statusCol(r); as sc) { <fw-status [value]="row[sc.key]" /> }</span>
                  </li>
                }</ul>
                <div class="spread panel-body" style="border-top: var(--hairline) solid var(--color-border)">
                  <span class="small muted">{{ (r.page - 1) * r.per_page + 1 }}–{{ min(r.page * r.per_page, r.total_rows) }} of {{ r.total_rows }} rows</span>
                  <div class="row"><button class="btn btn-sm" [disabled]="r.page <= 1" (click)="page = page - 1; load()">Previous</button>
                    <button class="btn btn-sm" [disabled]="r.page * r.per_page >= r.total_rows" (click)="page = page + 1; load()">Next</button></div>
                </div>
              } @else {
                <fw-empty icon="reports" title="No rows for this view" text="Widen the period or clear a filter. Only approved and issued records appear in reports." />
              }
            </div>

            <details class="panel panel-pad"><summary style="cursor: pointer; font-weight: var(--weight-medium)">Definitions</summary>
              <dl class="stack-2" style="margin: var(--space-3) 0 0">@for (k of keys(r.definitions); track k) { <div><dt class="small" style="font-weight: var(--weight-medium)">{{ k }}</dt><dd class="small muted" style="margin:0">{{ r.definitions[k] }}</dd></div> }</dl>
            </details>
          }
        </section>
      </div>
    </div>
  `,
})
export class ReportsPage implements OnInit, OnDestroy {
  session = inject(Session);
  private api = inject(Api);
  private toasts = inject(Toasts);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  types = signal<any[]>([]);
  /** Tab labels: the report names are long sentences, so each tab gets its short name (the full one is the tooltip and the panel title). */
  private static SHORT: Record<string, string> = {
    'Project delivery and milestones': 'Delivery', 'Staff utilization and capacity': 'Utilization', 'Approved time': 'Approved time',
    'Budget versus actual hours': 'Budget vs actual', 'Invoice aging and outstanding balance': 'Invoice aging', 'Payments and collected revenue': 'Payments',
  };
  short(t: { label: string }): string { return ReportsPage.SHORT[t.label] ?? t.label; }
  type = signal('time');
  r = signal<any>(null);
  error = signal('');
  projects = signal<any[]>([]);
  clients = signal<any[]>([]);
  saved = signal<any[]>([]);
  exporting = signal(false);
  f: Record<string, string> = { period: 'quarter', from: '', to: '', project_id: '', client_id: '', user_id: '', manager_id: '', status: '', anchor: '' };
  q = '';
  sort = '';
  dir: 'asc' | 'desc' = 'asc';
  page = 1;
  private poll: any;

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    for (const k of Object.keys(this.f)) this.f[k] = qp.get(k) ?? this.f[k];
    this.api.get<any[]>('/reports').then((t) => {
      this.types.set(t);
      const wanted = qp.get('type');
      this.type.set(t.find((x) => x.type === wanted)?.type ?? t[0]?.type ?? 'time');
      this.load();
    }).catch((e) => this.error.set(apiError(e).message));
    this.api.get<any>('/projects', { per_page: 100 }).then((r) => this.projects.set(r.data)).catch(() => undefined);
    if (this.session.can('clients.view')) this.api.get<any>('/clients', { per_page: 100 }).then((r) => this.clients.set(r.data)).catch(() => undefined);
    this.loadSaved();
  }
  ngOnDestroy(): void { clearInterval(this.poll); }

  select(t: string): void { this.type.set(t); this.sort = ''; this.page = 1; this.load(); }
  keys(o: any): string[] { return Object.keys(o ?? {}); }
  isNum(c: any): boolean { return ['money', 'hours', 'percent', 'number'].includes(c.type); }
  min(a: number, b: number): number { return Math.min(a, b); }
  endInclusive(d: string): string { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); return x.toISOString().slice(0, 10); }
  cell(c: any, v: any, r: any): string {
    if (v === null || v === undefined || v === '') return '—';
    if (c.type === 'money') return formatMoney(v, r.currency);
    if (c.type === 'percent') return `${v}%`;
    if (c.type === 'date') return formatDate(v);
    if (c.type === 'hours') return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (typeof v === 'string' && (/^\d+\s*(?:[-‐‑‒–—_]\s*(?:\d+|plus)|\+)$/i.test(v) || v === 'current')) return label(v);
    return typeof v === 'string' && /^[a-z_]+$/.test(v) && v.includes('_') ? label(v) : String(v);
  }
  totalText(k: string, v: any, r: any): string {
    if (v === null) return 'N/A';
    if (/rate|utilization/.test(k)) return `${v}%`;
    if (/hours/.test(k)) return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (['outstanding', 'collected', 'current', '1_30', '31_60', '61_90', '90_plus'].includes(k)) return formatMoney(v, r.currency);
    return String(v);
  }
  sortBy(key: string): void {
    this.dir = this.sort === key && this.dir === 'asc' ? 'desc' : 'asc';
    this.sort = key;
    this.load();
  }
  private params(): Record<string, string> { return Object.fromEntries(Object.entries(this.f).filter(([, v]) => v)); }

  async load(): Promise<void> {
    this.router.navigate([], { queryParams: { type: this.type(), ...this.params() }, replaceUrl: true });
    try {
      this.r.set(await this.api.get(`/reports/${this.type()}`, { ...this.params(), q: this.q, sort: this.sort, dir: this.dir, page: this.page }));
      this.error.set('');
    } catch (e) { this.error.set(apiError(e).message); }
  }

  /** Queued export: the worker writes the CSV, then the browser downloads it with auth. */
  async exportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      const job = await this.api.post<any>(`/reports/${this.type()}/exports`, this.params());
      let tries = 0;
      clearInterval(this.poll);
      this.poll = setInterval(async () => {
        tries++;
        const s = await this.api.get<any>(`/report-exports/${job.id}`);
        if (s.status === 'ready') {
          clearInterval(this.poll);
          await this.api.download(`/report-exports/${job.id}/download`, `${this.type()}.csv`);
          this.toasts.ok(`Exported ${s.row_count} rows`);
          this.exporting.set(false);
        } else if (s.status === 'failed' || tries > 30) {
          clearInterval(this.poll);
          this.toasts.error(s.error ?? 'Export is taking too long. Check that the worker container is running.');
          this.exporting.set(false);
        }
      }, 1000);
    } catch (e) {
      this.toasts.error(apiError(e).message);
      this.exporting.set(false);
    }
  }

  print(): void { window.print(); }

  /** Phone list rows: first column as the title, the next two as detail, the last figure on the right. */
  private textCols(r: any): any[] { return r.columns.filter((c: any) => !this.isNum(c) && c.type !== 'status'); }
  mTitle(row: any, r: any): string { const c = this.textCols(r)[0]; return c ? this.cell(c, row[c.key], r) : ''; }
  mSub(row: any, r: any): string { return this.textCols(r).slice(1, 4).map((c: any) => this.cell(c, row[c.key], r)).filter((v: string) => v && v !== '—').join(' · '); }
  mEnd(row: any, r: any): string { const nums = r.columns.filter((c: any) => this.isNum(c)); const c = nums[nums.length - 1]; return c ? this.cell(c, row[c.key], r) : ''; }
  statusCol(r: any): any { return r.columns.find((c: any) => c.type === 'status') ?? null; }

  async loadSaved(): Promise<void> { this.saved.set(await this.api.get<any[]>('/saved-reports').catch(() => [])); }
  async saveView(): Promise<void> {
    const name = prompt('Name this view', `${this.types().find((t) => t.type === this.type())?.label} · ${this.f['period']}`);
    if (!name) return;
    try { await this.api.post('/saved-reports', { name, report: this.type(), filters: this.params() }); this.loadSaved(); this.toasts.ok('View saved'); }
    catch (e) { this.toasts.error(apiError(e).message); }
  }
  applySaved(s: any): void {
    for (const k of Object.keys(this.f)) this.f[k] = s.filters[k] ?? '';
    if (!this.f['period']) this.f['period'] = 'quarter';
    this.select(s.report);
  }
  async deleteSaved(s: any): Promise<void> { await this.api.delete(`/saved-reports/${s.id}`); this.loadSaved(); }
}
