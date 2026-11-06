import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, apiError } from '../core/api';
import { Session } from '../core/session';
import { Toasts } from '../core/toast';
import { FORMAT_PIPES, formatMoney } from '../core/format';
import { UI } from '../shared/ui';
import { QuickAction } from '../core/quick';


type Tab = 'all' | 'paid' | 'partially_paid' | 'unpaid' | 'overdue' | 'draft' | 'void';
type Range = 'all' | 'month' | 'last30' | 'quarter' | 'year';

function bucket(i: any): Tab[] {
  if (i.status === 'draft') return ['draft'];
  if (i.status === 'void') return ['void'];
  const out: Tab[] = [i.settlement.state];
  if (i.settlement.overdue) out.push('overdue');
  return out;
}

@Component({
  selector: 'fw-invoices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ...FORMAT_PIPES, ...UI],
  host: { '(document:keydown)': 'hotkey($event)' },
  styles: [],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Invoices</h1>
          <p class="sub">{{ issuedCount() }} issued across {{ clientCount() }} clients · {{ outstanding() | money: session.currency() }} outstanding</p></div>
        <div class="row">
          @if (session.can('reports.finance')) { <a class="btn" routerLink="/reports" [queryParams]="{ type: 'aging' }"><fw-icon name="download" />Export aging</a> }
          @if (session.can('invoices.manage')) { <button class="btn btn-primary dup" (click)="openCreate()"><fw-icon name="plus" />New invoice</button> }
        </div>
      </div>

      <div class="list-bar">
        <div class="seg" role="group" aria-label="Invoice status">
          @for (t of tabs; track t.key) {
            <button type="button" [attr.aria-pressed]="tab() === t.key" (click)="setTab(t.key)">{{ t.label }} <span class="n">{{ counts()[t.key] }}</span></button>
          }
        </div>
        <span class="grow"></span>
        <label class="pill-btn"><fw-icon name="calendar" /><span class="sr-only">Issued</span>
          <select class="select" [ngModel]="range()" (ngModelChange)="range.set($event); page.set(1)" aria-label="Issued date range">
            <option value="all">All dates</option><option value="month">This month</option><option value="last30">Last 30 days</option><option value="quarter">This quarter</option><option value="year">This year</option>
          </select></label>
        <label class="pill-btn"><fw-icon name="switch" /><span class="sr-only">Sort</span>
          <select class="select" [ngModel]="sort()" (ngModelChange)="sort.set($event)" aria-label="Sort by">
            <option value="issued">Sort: Newest</option><option value="amount">Sort: Amount</option><option value="balance">Sort: Balance</option><option value="due">Sort: Due date</option>
          </select></label>
      </div>

      <div class="search-row">
        <label class="searchbar"><fw-icon name="search" /><span class="sr-only">Search invoices</span>
          <input #search type="search" placeholder="Search invoice number, client or project" [ngModel]="q()" (ngModelChange)="q.set($event); page.set(1)" />
          <span class="kbd" aria-hidden="true">/</span></label>
        <div class="filters">
          <button class="pill-btn" style="height: var(--control-lg)" type="button" (click)="filtersOpen.set(!filtersOpen())" [attr.aria-expanded]="filtersOpen()"><fw-icon name="filter" />Filters
            @if (filterCount()) { <span class="badge-count">{{ filterCount() }}</span> }</button>
          @if (filtersOpen()) {
            <div class="popover stack-3" role="dialog" aria-label="Filters">
              <div class="field"><label for="fc">Client</label><select id="fc" class="select" [ngModel]="clientId()" (ngModelChange)="clientId.set($event); page.set(1)"><option value="">Any client</option>
                @for (c of clients(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></div>
              <div class="field"><label for="fp">Project</label><select id="fp" class="select" [ngModel]="projectCode()" (ngModelChange)="projectCode.set($event); page.set(1)"><option value="">Any project</option>
                @for (p of projectCodes(); track p) { <option [value]="p">{{ p }}</option> }</select></div>
              <div class="field"><label for="fm">Balance greater than</label><input id="fm" class="input" type="number" min="0" step="100" [ngModel]="minBalance()" (ngModelChange)="minBalance.set($event); page.set(1)" /></div>
              <button class="btn btn-sm" type="button" (click)="filtersOpen.set(false)">Done</button>
            </div>
          }
        </div>
      </div>

      <div class="chips-row">
        <div class="chips">
          @if (tab() !== 'all') { <span class="chip"><span class="k">Status is</span> <b>{{ tabLabel() }}</b><button type="button" aria-label="Remove status filter" (click)="setTab('all')"><fw-icon name="x" /></button></span> }
          @if (range() !== 'all') { <span class="chip"><span class="k">Issued</span> <b>{{ rangeLabel() }}</b><button type="button" aria-label="Remove date filter" (click)="range.set('all')"><fw-icon name="x" /></button></span> }
          @if (clientId()) { <span class="chip"><span class="k">Client is</span> <b>{{ clientName() }}</b><button type="button" aria-label="Remove client filter" (click)="clientId.set('')"><fw-icon name="x" /></button></span> }
          @if (projectCode()) { <span class="chip"><span class="k">Project is</span> <b>{{ projectCode() }}</b><button type="button" aria-label="Remove project filter" (click)="projectCode.set('')"><fw-icon name="x" /></button></span> }
          @if (minBalance()) { <span class="chip"><span class="k">Balance greater than</span> <b>{{ minBalance()! * 100 | money }}</b><button type="button" aria-label="Remove balance filter" (click)="minBalance.set(null)"><fw-icon name="x" /></button></span> }
          <button class="chip-add" type="button" (click)="filtersOpen.set(true)"><fw-icon name="plus" />Add filter</button>
          @if (filterCount() || tab() !== 'all' || range() !== 'all' || q()) { <button class="link-accent" type="button" (click)="clearAll()">Clear all</button> }
        </div>
        <span class="small muted"><b style="color: var(--color-text)">{{ filtered().length }}</b> of {{ rows().length }} invoices</span>
      </div>

      @if (selected().size) {
        <div class="selection-bar" role="status">
          <b>{{ selected().size }} selected</b><span>· {{ selectedTotal() | money }} balance</span><span class="grow"></span>
          <button class="btn btn-sm" type="button" (click)="exportSelected()"><fw-icon name="download" />Export CSV</button>
          <button class="btn btn-sm btn-ghost" style="color: inherit" type="button" (click)="clearSelection()">Clear</button>
        </div>
      }

      <div class="panel">
        @if (loading()) {
          <div class="panel-body muted">Loading invoices…</div>
        } @else if (filtered().length) {
          <div class="table-wrap d-table"><table class="table">
            <thead><tr>
              <th class="w-check"><input type="checkbox" aria-label="Select all on this page" [checked]="allOnPageSelected()" (change)="togglePage()" /></th>
              <th><button class="sort" [class.active]="sort() === 'issued'" (click)="sort.set('issued')">Invoice</button></th>
              <th>Client</th><th class="hide-md">Project</th>
              <th class="hide-md"><button class="sort" [class.active]="sort() === 'issued'" (click)="sort.set('issued')">Issued</button></th>
              <th><button class="sort" [class.active]="sort() === 'due'" (click)="sort.set('due')">Due @if (sort() === 'due') { <fw-icon name="chevronDown" /> }</button></th>
              <th>Status</th>
              <th class="num"><button class="sort" [class.active]="sort() === 'amount'" (click)="sort.set('amount')">Amount @if (sort() === 'amount') { <fw-icon name="chevronDown" /> }</button></th>
              <th class="num hide-md"><button class="sort" [class.active]="sort() === 'balance'" (click)="sort.set('balance')">Balance @if (sort() === 'balance') { <fw-icon name="chevronDown" /> }</button></th>
              <th style="width: 44px"><span class="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>@for (i of pageRows(); track i.id) {
              <tr class="clickable" [class.selected]="selected().has(i.id)" (click)="open(i)">
                <td class="w-check" (click)="$event.stopPropagation()"><input type="checkbox" [attr.aria-label]="'Select ' + (i.number || 'draft')" [checked]="selected().has(i.id)" (change)="toggle(i.id)" /></td>
                <td style="white-space: nowrap"><span class="cell-title">{{ title(i) }}</span><span class="cell-id">{{ i.number || 'DRAFT-' + i.id }}</span></td>
                <td style="white-space: nowrap"><span class="who"><fw-avatar [name]="client(i)" kind="org" size="sm" />{{ client(i) }}</span></td>
                <td class="hide-md">@if (i.project) { <span class="tag">{{ i.project.code }}</span> } @else { <span class="tag">General</span> }</td>
                <td class="tabular muted hide-md" style="white-space: nowrap">{{ i.issue_date ? (i.issue_date | day) : '—' }}</td>
                <td class="tabular muted" style="white-space: nowrap">{{ i.due_date ? (i.due_date | day) : '—' }}</td>
                <td style="white-space: nowrap">
                  @if (i.status !== 'issued') { <fw-status [value]="i.status" /> }
                  @else if (i.settlement.overdue) { <fw-status value="overdue" /> }
                  @else { <fw-status [value]="i.settlement.state" /> }
                </td>
                <td class="amount">{{ i.total_cents | money: i.currency }}</td>
                <td class="num small hide-md" [class.muted]="!i.settlement.balance_cents">{{ i.status === 'issued' ? (i.settlement.balance_cents | money: i.currency) : '—' }}</td>
                <td (click)="$event.stopPropagation()">
                  <div class="rowmenu">
                    <button class="btn btn-ghost btn-icon btn-sm" type="button" [attr.aria-label]="'Actions for ' + (i.number || 'draft')" (click)="menu.set(menu() === i.id ? null : i.id)"><fw-icon name="more" /></button>
                    @if (menu() === i.id) {
                      <div class="popover" role="menu">
                        <a class="menu-item" role="menuitem" [routerLink]="['/invoices', i.id]"><fw-icon name="file" />Open</a>
                        @if (i.status === 'issued' && i.settlement.balance_cents > 0 && session.can('payments.manage')) {
                          <a class="menu-item" role="menuitem" routerLink="/payments" [queryParams]="{ record: 1, invoice_id: i.id, client_id: i.client_id }"><fw-icon name="payments" />Record payment</a>
                        }
                        <a class="menu-item" role="menuitem" [routerLink]="['/clients', i.client_id]"><fw-icon name="clients" />View client</a>
                      </div>
                    }
                  </div>
                </td>
              </tr>
            }</tbody>
          </table></div>
          <ul class="m-list">@for (i of pageRows(); track i.id) {
            <li class="m-row" (click)="open(i)">
              <fw-avatar [name]="client(i)" kind="org" />
              <span class="m-main"><span class="m-title">{{ title(i) }}</span><span class="m-sub">{{ client(i) }} · {{ i.number || 'Draft' }}{{ i.due_date ? ' · due ' + (i.due_date | day) : '' }}</span></span>
              <span class="m-end"><span class="m-amount">{{ i.total_cents | money: i.currency }}</span>
                @if (i.status !== 'issued') { <fw-status [value]="i.status" /> } @else if (i.settlement.overdue) { <fw-status value="overdue" /> } @else { <fw-status [value]="i.settlement.state" /> }</span>
            </li>
          }</ul>
          <div class="table-foot">
            <label class="row">Rows per page
              <select class="select sm" style="width: 72px" [ngModel]="perPage()" (ngModelChange)="perPage.set(+$event); page.set(1)" aria-label="Rows per page">
                <option [ngValue]="12">12</option><option [ngValue]="25">25</option><option [ngValue]="50">50</option></select></label>
            <div class="row-3">
              <span class="tabular"><b style="color: var(--color-text)">{{ rangeStart() }}–{{ rangeEnd() }}</b> of {{ filtered().length }}</span>
              <nav class="pager" aria-label="Pagination">
                <button type="button" aria-label="Previous page" [disabled]="page() <= 1" (click)="page.set(page() - 1)"><fw-icon name="chevronLeft" /></button>
                @for (n of pages(); track n) { <button type="button" [attr.aria-current]="n === page() ? 'page' : null" (click)="page.set(n)">{{ n }}</button> }
                <button type="button" aria-label="Next page" [disabled]="page() >= pages().length" (click)="page.set(page() + 1)"><fw-icon name="chevronRight" /></button>
              </nav>
            </div>
          </div>
        } @else {
          <fw-empty icon="invoices" [title]="rows().length ? 'No invoices match' : 'No invoices yet'" text="Create a draft for a client, pull in approved time or add fixed-fee lines, then issue it." hint="Only approved, billable time can be invoiced, and only once.">
            @if (rows().length) { <button class="btn" (click)="clearAll()">Clear filters</button> } @else if (session.can('invoices.manage')) { <button class="btn btn-primary" (click)="openCreate()">Create a draft</button> }
          </fw-empty>
        }
      </div>
    </div>

    @if (creating()) {
      <fw-dialog title="New draft invoice" subtitle="Currency, tax and payment terms come from workspace settings and can be changed on the draft." (close)="creating.set(false)">
        <form class="stack-4" id="ni" (ngSubmit)="create()">
          <div class="field"><label for="ic">Client</label><select id="ic" class="select" name="c" [(ngModel)]="form.client_id" (ngModelChange)="form.project_id = null"><option [ngValue]="null">Choose a client</option>
            @for (c of clients(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }</select></div>
          <div class="field"><label for="ip">Project (optional)</label><select id="ip" class="select" name="p" [(ngModel)]="form.project_id"><option [ngValue]="null">No specific project</option>
            @for (p of clientProjects(); track p.id) { <option [ngValue]="p.id">{{ p.code }} · {{ p.name }}</option> }</select></div>
          @if (formError()) { <div class="form-error">{{ formError() }}</div> }
        </form>
        <ng-container foot><button class="btn" (click)="creating.set(false)">Cancel</button><button class="btn btn-primary" type="submit" form="ni" [disabled]="!form.client_id">Create draft</button></ng-container>
      </fw-dialog>
    }
  `,
})
export class InvoicesPage implements OnInit {
  session = inject(Session);
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toasts = inject(Toasts);
  searchEl = viewChild<ElementRef<HTMLInputElement>>('search');

  tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'paid', label: 'Paid' }, { key: 'partially_paid', label: 'Partial' }, { key: 'unpaid', label: 'Unpaid' },
    { key: 'overdue', label: 'Overdue' }, { key: 'draft', label: 'Draft' },
  ];

  rows = signal<any[]>([]);
  loading = signal(true);
  clients = signal<any[]>([]);
  projects = signal<any[]>([]);
  tab = signal<Tab>('all');
  range = signal<Range>('all');
  sort = signal<'issued' | 'amount' | 'balance' | 'due'>('issued');
  q = signal('');
  clientId = signal('');
  projectCode = signal('');
  minBalance = signal<number | null>(null);
  page = signal(1);
  perPage = signal(12);
  selected = signal(new Set<number>());
  menu = signal<number | null>(null);
  filtersOpen = signal(false);
  creating = signal(false);
  form: any = { client_id: null, project_id: null };
  formError = signal('');

  counts = computed(() => {
    const c: Record<Tab, number> = { all: 0, paid: 0, partially_paid: 0, unpaid: 0, overdue: 0, draft: 0, void: 0 };
    for (const i of this.base()) { c.all++; for (const b of bucket(i)) c[b]++; }
    return c;
  });
  issuedCount = computed(() => this.rows().filter((i) => i.status === 'issued').length);
  clientCount = computed(() => new Set(this.rows().map((i) => i.client_id)).size);
  outstanding = computed(() => this.rows().filter((i) => i.status === 'issued').reduce((a, i) => a + i.settlement.balance_cents, 0));
  projectCodes = computed(() => [...new Set(this.rows().map((i) => i.project?.code).filter(Boolean))].sort() as string[]);
  filterCount = computed(() => [this.clientId(), this.projectCode(), this.minBalance()].filter(Boolean).length);
  tabLabel = computed(() => this.tabs.find((t) => t.key === this.tab())?.label ?? '');
  clientName = computed(() => this.clients().find((c) => String(c.id) === String(this.clientId()))?.name ?? '');
  rangeLabel = computed(() => ({ all: 'Any time', month: 'This month', last30: 'Last 30 days', quarter: 'This quarter', year: 'This year' })[this.range()]);

  /** Rows after search, date range and the filter panel (tab counts are computed on this). */
  private base = computed(() => {
    const q = this.q().trim().toLowerCase();
    const from = this.rangeStartDate();
    return this.rows().filter((i) =>
      (!q || [i.number, this.client(i), i.project?.name, i.project?.code].some((v) => v && String(v).toLowerCase().includes(q)))
      && (!from || (i.issue_date && i.issue_date >= from))
      && (!this.clientId() || String(i.client_id) === String(this.clientId()))
      && (!this.projectCode() || i.project?.code === this.projectCode())
      && (!this.minBalance() || i.settlement.balance_cents > this.minBalance()! * 100));
  });
  filtered = computed(() => {
    const t = this.tab();
    const list = this.base().filter((i) => t === 'all' || bucket(i).includes(t));
    const key = this.sort();
    const val = (i: any) => key === 'amount' ? i.total_cents : key === 'balance' ? i.settlement.balance_cents : key === 'due' ? (i.due_date ?? '9999') : (i.issue_date ?? '9999');
    return [...list].sort((a, b) => key === 'due' ? (val(a) < val(b) ? -1 : 1) : (val(a) < val(b) ? 1 : val(a) > val(b) ? -1 : 0));
  });
  pages = computed(() => Array.from({ length: Math.max(1, Math.ceil(this.filtered().length / this.perPage())) }, (_, n) => n + 1));
  pageRows = computed(() => this.filtered().slice((this.page() - 1) * this.perPage(), this.page() * this.perPage()));
  rangeStart = computed(() => (this.filtered().length ? (this.page() - 1) * this.perPage() + 1 : 0));
  rangeEnd = computed(() => Math.min(this.page() * this.perPage(), this.filtered().length));
  allOnPageSelected = computed(() => this.pageRows().length > 0 && this.pageRows().every((i) => this.selected().has(i.id)));
  selectedTotal = computed(() => this.rows().filter((i) => this.selected().has(i.id)).reduce((a, i) => a + (i.settlement?.balance_cents ?? 0), 0));

  constructor() { if (this.session.can('invoices.manage')) inject(QuickAction).register('New invoice', () => this.openCreate()); }

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    const s = qp.get('settlement') as Tab | null;
    if (s && this.tabs.some((t) => t.key === s)) this.tab.set(s);
    if (qp.get('status') === 'draft') this.tab.set('draft');
    if (qp.get('client_id') && !qp.get('new')) this.clientId.set(qp.get('client_id')!);
    this.load();
    this.api.get<any>('/clients', { per_page: 100, status: 'all' }).then((r) => this.clients.set(r.data));
    this.api.get<any>('/projects', { per_page: 100 }).then((r) => this.projects.set(r.data));
    if (qp.get('new')) {
      this.form = { client_id: Number(qp.get('client_id')) || null, project_id: Number(qp.get('project_id')) || null };
      this.creating.set(true);
    }
  }

  async load(): Promise<void> {
    try { this.rows.set((await this.api.get<any>('/invoices')).data); } catch (e) { this.toasts.error(apiError(e).message); } finally { this.loading.set(false); }
  }

  hotkey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) { e.preventDefault(); this.searchEl()?.nativeElement.focus(); }
    if (e.key === 'Escape') { this.menu.set(null); this.filtersOpen.set(false); }
  }

  client(i: any): string { return i.billing_snapshot?.client_name || i.client?.name; }
  title(i: any): string { return i.project?.name ?? (i.items_count ? 'Invoice' : (i.notes?.split('.')[0] || 'General billing')); }
  setTab(t: Tab): void {
    this.tab.set(t);
    this.page.set(1);
    this.router.navigate([], { queryParams: { settlement: t === 'all' ? null : t }, replaceUrl: true });
  }
  clearAll(): void { this.setTab('all'); this.range.set('all'); this.q.set(''); this.clientId.set(''); this.projectCode.set(''); this.minBalance.set(null); }
  clearSelection(): void { this.selected.set(new Set()); }
  open(i: any): void { this.router.navigate(['/invoices', i.id]); }
  toggle(id: number): void { const s = new Set(this.selected()); s.has(id) ? s.delete(id) : s.add(id); this.selected.set(s); }
  togglePage(): void {
    const s = new Set(this.selected());
    const all = this.allOnPageSelected();
    for (const i of this.pageRows()) all ? s.delete(i.id) : s.add(i.id);
    this.selected.set(s);
  }

  private rangeStartDate(): string | null {
    const now = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    switch (this.range()) {
      case 'month': return iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
      case 'last30': return iso(new Date(now.getTime() - 30 * 86400000));
      case 'quarter': return iso(new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1)));
      case 'year': return iso(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));
      default: return null;
    }
  }

  /** Client-side CSV of the selected rows (values already visible to this user). */
  exportSelected(): void {
    const rows = this.rows().filter((i) => this.selected().has(i.id));
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Invoice', 'Client', 'Project', 'Issued', 'Due', 'Status', 'Total', 'Balance'].join(',')];
    for (const i of rows) {
      lines.push([i.number ?? 'Draft', this.client(i), i.project?.code ?? '', i.issue_date ?? '', i.due_date ?? '', i.status === 'issued' ? i.settlement.state : i.status,
        (i.total_cents / 100).toFixed(2), ((i.settlement?.balance_cents ?? 0) / 100).toFixed(2)].map(esc).join(','));
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.toasts.ok(`Exported ${rows.length} invoices (${formatMoney(this.selectedTotal(), this.session.currency())} open)`);
  }

  clientProjects(): any[] { return this.projects().filter((p) => p.client_id === this.form.client_id); }
  openCreate(): void { this.form = { client_id: null, project_id: null }; this.formError.set(''); this.creating.set(true); }
  async create(): Promise<void> {
    try {
      const inv = await this.api.post<any>('/invoices', this.form);
      this.toasts.ok('Draft created');
      this.router.navigate(['/invoices', inv.id]);
    } catch (e) { this.formError.set(apiError(e).message); }
  }
}
