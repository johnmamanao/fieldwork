import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, apiError } from '../core/api';
import { Session } from '../core/session';
import { Toasts } from '../core/toast';
import { FORMAT_PIPES, label } from '../core/format';
import { UI } from '../shared/ui';
import { TableFoot, pageOf } from '../shared/list';
import { QuickAction } from '../core/quick';


type Tab = 'open' | 'active' | 'on_hold' | 'draft' | 'completed' | 'archived';
const BILLING: Record<string, string> = { time_and_materials: 'Time & materials', fixed_fee: 'Fixed fee', non_billable: 'Nonbillable' };

@Component({
  selector: 'fw-projects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TableFoot, ...FORMAT_PIPES, ...UI],
  host: { '(document:keydown)': 'hotkey($event)' },
  styles: [`.use { display: flex; align-items: center; gap: var(--space-2); min-width: 96px; } .use .meter { flex: 1; }`],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Projects</h1><p class="sub">{{ counts().active }} active across {{ clientCount() }} clients · {{ totalHours() | hours: 0 }} approved hours</p></div>
        @if (session.can('projects.manage')) { <button class="btn btn-primary dup" (click)="openCreate()"><fw-icon name="plus" />New project</button> }
      </div>

      <div class="list-bar">
        <div class="seg" role="group" aria-label="Project status">
          @for (t of tabs; track t.key) { <button type="button" [attr.aria-pressed]="tab() === t.key" (click)="setTab(t.key)">{{ t.label }} <span class="n">{{ counts()[t.key] }}</span></button> }
        </div>
        <span class="grow"></span>
        <label class="pill-btn"><fw-icon name="switch" /><span class="sr-only">Sort</span>
          <select class="select" [ngModel]="sort()" (ngModelChange)="sort.set($event)" aria-label="Sort by">
            <option value="status">Sort: Status</option><option value="name">Sort: Name</option><option value="end">Sort: End date</option><option value="used">Sort: Hours used</option>
          </select></label>
      </div>

      <div class="search-row">
        <label class="searchbar"><fw-icon name="search" /><span class="sr-only">Search projects</span>
          <input #search type="search" placeholder="Search project name, code or client" [ngModel]="q()" (ngModelChange)="q.set($event); page.set(1)" />
          <span class="kbd" aria-hidden="true">/</span></label>
        <div class="filters">
          <button class="pill-btn" style="height: var(--control-lg)" type="button" (click)="filtersOpen.set(!filtersOpen())" [attr.aria-expanded]="filtersOpen()"><fw-icon name="filter" />Filters
            @if (filterCount()) { <span class="badge-count">{{ filterCount() }}</span> }</button>
          @if (filtersOpen()) {
            <div class="popover stack-3" role="dialog" aria-label="Filters">
              <div class="field"><label for="fc">Client</label><select id="fc" class="select" [ngModel]="f().client_id" (ngModelChange)="setF('client_id', $event)"><option value="">Any client</option>
                @for (c of clients(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></div>
              <div class="field"><label for="fm">Manager</label><select id="fm" class="select" [ngModel]="f().manager_id" (ngModelChange)="setF('manager_id', $event)"><option value="">Any manager</option>
                @for (m of managers(); track m.user.id) { <option [value]="m.user.id">{{ m.user.name }}</option> }</select></div>
              <div class="field"><label for="ft">Team member</label><select id="ft" class="select" [ngModel]="f().member_id" (ngModelChange)="setF('member_id', $event)"><option value="">Anyone</option>
                @for (m of members(); track m.user.id) { <option [value]="m.user.id">{{ m.user.name }}</option> }</select></div>
              <div class="field"><label for="fb">Billing model</label><select id="fb" class="select" [ngModel]="f().billing_model" (ngModelChange)="setF('billing_model', $event)"><option value="">Any billing</option>
                <option value="time_and_materials">Time & materials</option><option value="fixed_fee">Fixed fee</option><option value="non_billable">Nonbillable</option></select></div>
              <label class="check small"><input type="checkbox" [ngModel]="f().over === '1'" (ngModelChange)="setF('over', $event ? '1' : '')" />Over 90% of hours budget</label>
              <button class="btn btn-sm" type="button" (click)="filtersOpen.set(false)">Done</button>
            </div>
          }
        </div>
      </div>

      <div class="chips-row">
        <div class="chips">
          @if (tab() !== 'open') { <span class="chip"><span class="k">Status is</span> <b>{{ tabLabel() }}</b><button type="button" aria-label="Remove status filter" (click)="setTab('open')"><fw-icon name="x" /></button></span> }
          @if (f().client_id) { <span class="chip"><span class="k">Client is</span> <b>{{ nameOf(clients(), f().client_id) }}</b><button type="button" aria-label="Remove client filter" (click)="setF('client_id', '')"><fw-icon name="x" /></button></span> }
          @if (f().manager_id) { <span class="chip"><span class="k">Manager is</span> <b>{{ memberName(f().manager_id) }}</b><button type="button" aria-label="Remove manager filter" (click)="setF('manager_id', '')"><fw-icon name="x" /></button></span> }
          @if (f().member_id) { <span class="chip"><span class="k">Team includes</span> <b>{{ memberName(f().member_id) }}</b><button type="button" aria-label="Remove team filter" (click)="setF('member_id', '')"><fw-icon name="x" /></button></span> }
          @if (f().billing_model) { <span class="chip"><span class="k">Billing is</span> <b>{{ billing[f().billing_model] }}</b><button type="button" aria-label="Remove billing filter" (click)="setF('billing_model', '')"><fw-icon name="x" /></button></span> }
          @if (f().over) { <span class="chip"><span class="k">Hours used</span> <b>over 90%</b><button type="button" aria-label="Remove budget filter" (click)="setF('over', '')"><fw-icon name="x" /></button></span> }
          <button class="chip-add" type="button" (click)="filtersOpen.set(true)"><fw-icon name="plus" />Add filter</button>
          @if (filterCount() || tab() !== 'open' || q()) { <button class="link-accent" type="button" (click)="clearAll()">Clear all</button> }
        </div>
        <span class="small muted"><b style="color: var(--color-text)">{{ filtered().length }}</b> of {{ rows().length }} projects</span>
      </div>

      <div class="panel">
        @if (loading() && !rows().length) {
          <div class="panel-body muted">Loading projects…</div>
        } @else if (error()) {
          <div class="panel-body"><div class="alert danger">{{ error() }}</div></div>
        } @else if (!filtered().length) {
          <fw-empty icon="projects" [title]="rows().length ? 'No projects match' : 'No projects yet'"
            [text]="rows().length ? 'Try clearing a filter or searching by project code.' : 'A project holds tasks, milestones, a team and the time logged against it.'"
            [hint]="rows().length ? '' : 'Start with the engagement you are delivering this week.'">
            @if (rows().length) { <button class="btn" (click)="clearAll()">Clear filters</button> }
            @else if (session.can('projects.manage')) { <button class="btn btn-primary" (click)="openCreate()">Create a project</button> }
          </fw-empty>
        } @else {
          <div class="table-wrap d-table"><table class="table">
            <thead><tr>
              <th><button class="sort" [class.active]="sort() === 'name'" (click)="sort.set('name')">Project</button></th>
              <th>Client</th><th class="hide-md">Manager</th><th class="hide-md">Team</th>
              <th><button class="sort" [class.active]="sort() === 'end'" (click)="sort.set('end')">Ends</button></th>
              <th><button class="sort" [class.active]="sort() === 'used'" (click)="sort.set('used')">Hours used</button></th>
              <th><button class="sort" [class.active]="sort() === 'status'" (click)="sort.set('status')">Status</button></th>
              <th style="width: 44px"><span class="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>@for (p of pageRows(); track p.id) {
              <tr class="clickable" (click)="open(p)">
                <td style="white-space: nowrap"><span class="row"><span class="swatch" [style.background]="p.color || 'var(--color-compare)'"></span><span><span class="cell-title">{{ p.name }}</span><span class="cell-id">{{ p.code }} · {{ billing[p.billing_model] }}</span></span></span></td>
                <td style="white-space: nowrap"><span class="who"><fw-avatar [name]="p.client?.name || 'Internal'" kind="org" size="sm" />{{ p.client?.name || 'Internal' }}</span></td>
                <td class="hide-md" style="white-space: nowrap">@if (p.manager) { <span class="who"><fw-avatar [name]="p.manager.name" size="sm" />{{ short(p.manager.name) }}</span> } @else { <span class="faint">—</span> }</td>
                <td class="hide-md" style="white-space: nowrap"><span class="avatar-stack">@for (m of p.members.slice(0, 3); track m.id) { <fw-avatar [name]="m.user?.name" size="sm" /> }</span>@if (p.members.length > 3) { <span class="cell-sub"> +{{ p.members.length - 3 }}</span> }</td>
                <td class="tabular muted" style="white-space: nowrap">{{ p.end_date ? (p.end_date | day) : 'Ongoing' }}</td>
                <td>@if (p.budget_minutes) {
                    <div class="use"><div class="meter" [class.accent]="pct(p) > 90 && pct(p) <= 100" [class.over]="pct(p) > 100"><span [style.width.%]="min(pct(p), 100)"></span></div><span class="small tabular">{{ pct(p) }}%</span></div>
                  } @else { <span class="small tabular">{{ p.approved_minutes | hours: 0 }}h</span> }</td>
                <td style="white-space: nowrap"><fw-status [value]="p.status" /></td>
                <td (click)="$event.stopPropagation()">
                  <div class="rowmenu">
                    <button class="btn btn-ghost btn-icon btn-sm" type="button" [attr.aria-label]="'Actions for ' + p.name" (click)="menu.set(menu() === p.id ? null : p.id)"><fw-icon name="more" /></button>
                    @if (menu() === p.id) {
                      <div class="popover" role="menu">
                        <a class="menu-item" role="menuitem" [routerLink]="['/projects', p.id]"><fw-icon name="projects" />Open</a>
                        <a class="menu-item" role="menuitem" [routerLink]="['/projects', p.id]" [queryParams]="{ tab: 'tasks' }"><fw-icon name="board" />Tasks</a>
                        <a class="menu-item" role="menuitem" [routerLink]="['/projects', p.id]" [queryParams]="{ tab: 'time' }"><fw-icon name="time" />Time</a>
                        @if (p.client && session.can('invoices.manage')) { <a class="menu-item" role="menuitem" routerLink="/invoices" [queryParams]="{ new: 1, client_id: p.client.id, project_id: p.id }"><fw-icon name="invoices" />New invoice</a> }
                      </div>
                    }
                  </div>
                </td>
              </tr>
            }</tbody>
          </table></div>
          <ul class="m-list">@for (p of pageRows(); track p.id) {
            <li class="m-row" (click)="open(p)">
              <fw-avatar [name]="p.client?.name || 'Internal'" kind="org" />
              <span class="m-main"><span class="m-title">{{ p.name }}</span><span class="m-sub">{{ p.code }} · {{ p.client?.name || 'Internal' }}{{ p.end_date ? ' · ends ' + (p.end_date | day) : '' }}</span></span>
              <span class="m-end"><span class="m-amount" [style.color]="pct(p) > 100 ? 'var(--color-danger)' : null">{{ p.budget_minutes ? pct(p) + '%' : (p.approved_minutes | hours: 0) + 'h' }}</span><fw-status [value]="p.status" /></span>
            </li>
          }</ul>
          <fw-table-foot [total]="filtered().length" [(page)]="page" [(perPage)]="perPage" />
        }
      </div>
    </div>

    @if (creating()) {
      <fw-dialog title="New project" subtitle="Projects start as drafts. Activate one when work begins." (close)="creating.set(false)">
        <form class="form-grid" (ngSubmit)="create()" id="new-project">
          <div class="field full"><label for="pn">Name</label><input id="pn" class="input" name="name" [(ngModel)]="form.name" required />
            @if (formErrors().name) { <span class="error">{{ formErrors().name }}</span> }</div>
          <div class="field"><label for="pc">Client</label>
            <select id="pc" class="select" name="client" [(ngModel)]="form.client_id"><option [ngValue]="null">Internal (no client)</option>
              @for (c of clients(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }</select></div>
          <div class="field"><label for="pb">Billing model</label>
            <select id="pb" class="select" name="billing" [(ngModel)]="form.billing_model">
              <option value="time_and_materials">Time and materials</option><option value="fixed_fee">Fixed fee</option><option value="non_billable">Nonbillable</option></select></div>
          <div class="field"><label for="pm">Manager</label>
            <select id="pm" class="select" name="manager" [(ngModel)]="form.manager_id">
              @for (m of managers(); track m.user.id) { <option [ngValue]="m.user.id">{{ m.user.name }}</option> }</select></div>
          <div class="field"><label for="ph">Hours budget</label><input id="ph" class="input" type="number" min="0" name="hours" [(ngModel)]="form.hours" />
            <span class="hint">Planned hours. Money budget is separate.</span></div>
          <div class="field"><label for="ps">Start</label><input id="ps" class="input" type="date" name="start" [(ngModel)]="form.start_date" /></div>
          <div class="field"><label for="pe">End</label><input id="pe" class="input" type="date" name="end" [(ngModel)]="form.end_date" />
            @if (formErrors().end_date) { <span class="error">{{ formErrors().end_date }}</span> }</div>
          @if (session.can('finance.view')) {
            <div class="field"><label for="pa">Money budget</label><input id="pa" class="input" type="number" min="0" step="0.01" name="amount" [(ngModel)]="form.amount" /></div>
            @if (form.billing_model === 'fixed_fee') {
              <div class="field"><label for="pf">Fixed fee</label><input id="pf" class="input" type="number" min="0" step="0.01" name="fee" [(ngModel)]="form.fee" /></div>
            } @else {
              <div class="field"><label for="pr">Default bill rate / hour</label><input id="pr" class="input" type="number" min="0" step="0.01" name="rate" [(ngModel)]="form.rate" /></div>
            }
          }
          <div class="field full"><label for="pd">Description</label><textarea id="pd" class="textarea" name="desc" [(ngModel)]="form.description"></textarea></div>
          @if (formError()) { <div class="form-error full" role="alert">{{ formError() }}</div> }
        </form>
        <ng-container foot>
          <button class="btn" type="button" (click)="creating.set(false)">Cancel</button>
          <button class="btn btn-primary" type="submit" form="new-project" [disabled]="saving()">Create project</button>
        </ng-container>
      </fw-dialog>
    }
  `,
})
export class ProjectsPage implements OnInit {
  session = inject(Session);
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toasts = inject(Toasts);
  searchEl = viewChild<ElementRef<HTMLInputElement>>('search');

  billing = BILLING;
  tabs: { key: Tab; label: string }[] = [
    { key: 'open', label: 'Open' }, { key: 'active', label: 'Active' }, { key: 'on_hold', label: 'On hold' },
    { key: 'draft', label: 'Draft' }, { key: 'completed', label: 'Completed' }, { key: 'archived', label: 'Archived' },
  ];
  rows = signal<any[]>([]);
  loading = signal(true);
  error = signal('');
  clients = signal<any[]>([]);
  members = signal<any[]>([]);
  managers = computed(() => this.members().filter((x) => ['owner', 'admin', 'project_manager'].includes(x.role)));
  tab = signal<Tab>('open');
  sort = signal<'status' | 'name' | 'end' | 'used'>('status');
  q = signal('');
  f = signal<Record<string, string>>({ client_id: '', manager_id: '', member_id: '', billing_model: '', over: '' });
  page = signal(1);
  perPage = signal(12);
  menu = signal<number | null>(null);
  filtersOpen = signal(false);

  creating = signal(false);
  saving = signal(false);
  formError = signal('');
  formErrors = signal<Record<string, string>>({});
  form: any = {};

  /** Search and panel filters; the status tabs count on this set. */
  private base = computed(() => {
    const q = this.q().trim().toLowerCase();
    const f = this.f();
    return this.rows().filter((p) =>
      (!q || [p.name, p.code, p.client?.name].some((v) => v && String(v).toLowerCase().includes(q)))
      && (!f['client_id'] || String(p.client_id) === f['client_id'])
      && (!f['manager_id'] || String(p.manager_id) === f['manager_id'])
      && (!f['member_id'] || p.members.some((m: any) => String(m.user_id) === f['member_id']))
      && (!f['billing_model'] || p.billing_model === f['billing_model'])
      && (!f['over'] || this.pct(p) > 90));
  });
  counts = computed(() => {
    const c: Record<Tab, number> = { open: 0, active: 0, on_hold: 0, draft: 0, completed: 0, archived: 0 };
    for (const p of this.base()) { c[p.status as Tab]++; if (p.status !== 'archived') c.open++; }
    return c;
  });
  filtered = computed(() => {
    const t = this.tab();
    const order: Record<string, number> = { active: 0, on_hold: 1, draft: 2, completed: 3, archived: 4 };
    const list = this.base().filter((p) => (t === 'open' ? p.status !== 'archived' : p.status === t));
    const s = this.sort();
    return [...list].sort((a, b) =>
      s === 'name' ? a.name.localeCompare(b.name)
        : s === 'end' ? (a.end_date ?? '9999').localeCompare(b.end_date ?? '9999')
          : s === 'used' ? this.pct(b) - this.pct(a)
            : order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  });
  pageRows = computed(() => pageOf(this.filtered(), this.page(), this.perPage()));
  filterCount = computed(() => Object.values(this.f()).filter(Boolean).length);
  tabLabel = computed(() => this.tabs.find((t) => t.key === this.tab())?.label ?? '');
  clientCount = computed(() => new Set(this.rows().filter((p) => p.status === 'active' && p.client_id).map((p) => p.client_id)).size);
  totalHours = computed(() => this.rows().reduce((a, p) => a + (Number(p.approved_minutes) || 0), 0));

  constructor() { if (this.session.can('projects.manage')) inject(QuickAction).register('New project', () => this.openCreate()); }

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    const st = q.get('status') as Tab | null;
    if (st && this.tabs.some((t) => t.key === st)) this.tab.set(st);
    const f = { ...this.f() };
    for (const k of Object.keys(f)) f[k] = q.get(k) ?? '';
    this.f.set(f);
    this.load();
    if (this.session.can('clients.view')) this.api.get<any>('/clients', { per_page: 100, status: 'all' }).then((r) => this.clients.set(r.data));
    this.api.get<any[]>('/members').then((m) => this.members.set(m.filter((x) => x.status === 'active'))).catch(() => undefined);
    if (q.get('new') && this.session.can('projects.manage')) this.openCreate();
  }

  /** Open projects and archived ones, so every tab has a true count. */
  async load(): Promise<void> {
    try {
      const [open, archived] = await Promise.all([
        this.api.get<any>('/projects', { per_page: 100 }),
        this.api.get<any>('/projects', { per_page: 100, status: 'archived' }),
      ]);
      this.rows.set([...open.data, ...archived.data]);
      this.error.set('');
    } catch (e) { this.error.set(apiError(e).message); } finally { this.loading.set(false); }
  }

  hotkey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) { e.preventDefault(); this.searchEl()?.nativeElement.focus(); }
    if (e.key === 'Escape') { this.menu.set(null); this.filtersOpen.set(false); }
  }

  setTab(t: Tab): void { this.tab.set(t); this.page.set(1); this.syncUrl(); }
  setF(key: string, value: string): void { this.f.update((f) => ({ ...f, [key]: value ?? '' })); this.page.set(1); this.syncUrl(); }
  clearAll(): void { this.tab.set('open'); this.q.set(''); this.f.set({ client_id: '', manager_id: '', member_id: '', billing_model: '', over: '' }); this.page.set(1); this.syncUrl(); }
  private syncUrl(): void {
    const params: Record<string, string | null> = { status: this.tab() === 'open' ? null : this.tab() };
    for (const [k, v] of Object.entries(this.f())) params[k] = v || null;
    this.router.navigate([], { queryParams: params, replaceUrl: true });
  }

  open(p: any): void { this.router.navigate(['/projects', p.id]); }
  pct(p: any): number { return p.budget_minutes ? Math.round(((Number(p.approved_minutes) || 0) / p.budget_minutes) * 100) : 0; }
  min(a: number, b: number): number { return Math.min(a, b); }
  short(name: string): string { const parts = name.split(' '); return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name; }
  nameOf(list: any[], id: string): string { return list.find((x) => String(x.id) === id)?.name ?? ''; }
  memberName(id: string): string { return this.members().find((m) => String(m.user.id) === id)?.user.name ?? ''; }
  labelOf(v: string): string { return label(v); }

  openCreate(): void {
    this.form = { name: '', client_id: null, billing_model: 'time_and_materials', manager_id: this.session.user()?.id, hours: null, start_date: new Date().toISOString().slice(0, 10), end_date: '', amount: null, fee: null, rate: null, description: '' };
    this.formError.set('');
    this.formErrors.set({});
    this.creating.set(true);
  }

  async create(): Promise<void> {
    this.saving.set(true);
    const f = this.form;
    const cents = (v: any) => (v === null || v === '' || v === undefined ? null : Math.round(Number(v) * 100));
    try {
      const p = await this.api.post<any>('/projects', {
        name: f.name, client_id: f.client_id, billing_model: f.billing_model, manager_id: f.manager_id, description: f.description || null,
        start_date: f.start_date || null, end_date: f.end_date || null, budget_minutes: f.hours ? Math.round(f.hours * 60) : null,
        budget_amount_cents: cents(f.amount), fixed_fee_cents: cents(f.fee), default_bill_rate_cents: cents(f.rate),
      });
      this.toasts.ok(`Created ${p.name} (${p.code})`);
      this.creating.set(false);
      this.router.navigate(['/projects', p.id]);
    } catch (e) {
      const { message, fields } = apiError(e);
      this.formErrors.set(fields);
      this.formError.set(Object.keys(fields).length ? '' : message);
    } finally {
      this.saving.set(false);
    }
  }
}
