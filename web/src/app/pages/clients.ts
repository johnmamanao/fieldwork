import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, apiError } from '../core/api';
import { Session } from '../core/session';
import { Toasts } from '../core/toast';
import { FORMAT_PIPES } from '../core/format';
import { UI } from '../shared/ui';
import { TableFoot, pageOf } from '../shared/list';
import { QuickAction } from '../core/quick';


const emptyClient = () => ({ name: '', email: '', phone: '', website: '', industry: '', owner_id: null, tax_id: '', notes: '', billing_address: { line1: '', line2: '', city: '', region: '', postal_code: '', country: '' } });

@Component({
  selector: 'fw-client-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="form-grid">
      <div class="field full"><label for="cn">Organization name</label><input id="cn" class="input" name="cn" [(ngModel)]="model().name" />
        @if (errors()['name']) { <span class="error">{{ errors()['name'] }}</span> }</div>
      <div class="field"><label for="ce">Billing email</label><input id="ce" class="input" type="email" name="ce" [(ngModel)]="model().email" />
        @if (errors()['email']) { <span class="error">{{ errors()['email'] }}</span> }</div>
      <div class="field"><label for="cp">Phone</label><input id="cp" class="input" name="cp" [(ngModel)]="model().phone" /></div>
      <div class="field"><label for="ci">Industry</label><input id="ci" class="input" name="ci" [(ngModel)]="model().industry" /></div>
      <div class="field"><label for="co">Account owner</label><select id="co" class="select" name="co" [(ngModel)]="model().owner_id"><option [ngValue]="null">Nobody</option>
        @for (m of members(); track m.user.id) { <option [ngValue]="m.user.id">{{ m.user.name }}</option> }</select></div>
      <div class="field full"><label for="a1">Billing address</label><input id="a1" class="input" name="a1" placeholder="Street" [(ngModel)]="model().billing_address.line1" /></div>
      <div class="field"><input class="input" aria-label="City" name="a3" placeholder="City" [(ngModel)]="model().billing_address.city" /></div>
      <div class="field"><input class="input" aria-label="Region" name="a4" placeholder="State / region" [(ngModel)]="model().billing_address.region" /></div>
      <div class="field"><input class="input" aria-label="Postal code" name="a5" placeholder="Postal code" [(ngModel)]="model().billing_address.postal_code" /></div>
      <div class="field"><input class="input" aria-label="Country" name="a6" placeholder="Country" [(ngModel)]="model().billing_address.country" /></div>
      <div class="field"><label for="ct">Tax ID</label><input id="ct" class="input" name="ct" [(ngModel)]="model().tax_id" /></div>
      <div class="field"><label for="cw">Website</label><input id="cw" class="input" name="cw" [(ngModel)]="model().website" /></div>
      <div class="field full"><label for="cno">Notes</label><textarea id="cno" class="textarea" name="cno" [(ngModel)]="model().notes"></textarea></div>
    </div>
  `,
})
export class ClientForm {
  model = input.required<any>();
  members = input<any[]>([]);
  errors = input<Record<string, string>>({});
}

@Component({
  selector: 'fw-clients',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ClientForm, TableFoot, ...FORMAT_PIPES, ...UI],
  host: { '(document:keydown)': 'hotkey($event)' },
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Clients</h1><p class="sub">{{ counts().active }} active organizations · {{ projectTotal() }} projects · {{ industries().length }} industries</p></div>
        @if (session.can('clients.manage')) { <button class="btn btn-primary dup" (click)="openCreate()"><fw-icon name="plus" />New client</button> }
      </div>

      <div class="list-bar">
        <div class="seg" role="group" aria-label="Client status">
          @for (t of tabs; track t.key) { <button type="button" [attr.aria-pressed]="tab() === t.key" (click)="tab.set(t.key); page.set(1)">{{ t.label }} <span class="n">{{ counts()[t.key] }}</span></button> }
        </div>
        <span class="grow"></span>
        <label class="pill-btn"><fw-icon name="switch" /><span class="sr-only">Sort</span>
          <select class="select" [ngModel]="sort()" (ngModelChange)="sort.set($event)" aria-label="Sort by">
            <option value="name">Sort: Name</option><option value="projects">Sort: Projects</option><option value="recent">Sort: Recently added</option>
          </select></label>
      </div>

      <div class="search-row">
        <label class="searchbar"><fw-icon name="search" /><span class="sr-only">Search clients</span>
          <input #search type="search" placeholder="Search name, email, city or contact" [ngModel]="q()" (ngModelChange)="q.set($event); page.set(1)" />
          <span class="kbd" aria-hidden="true">/</span></label>
        <div class="filters">
          <button class="pill-btn" style="height: var(--control-lg)" type="button" (click)="filtersOpen.set(!filtersOpen())" [attr.aria-expanded]="filtersOpen()"><fw-icon name="filter" />Filters
            @if (filterCount()) { <span class="badge-count">{{ filterCount() }}</span> }</button>
          @if (filtersOpen()) {
            <div class="popover stack-3" role="dialog" aria-label="Filters">
              <div class="field"><label for="fi">Industry</label><select id="fi" class="select" [ngModel]="industry()" (ngModelChange)="industry.set($event); page.set(1)"><option value="">Any industry</option>
                @for (i of industries(); track i) { <option [value]="i">{{ i }}</option> }</select></div>
              <div class="field"><label for="fo">Account owner</label><select id="fo" class="select" [ngModel]="owner()" (ngModelChange)="owner.set($event); page.set(1)"><option value="">Anyone</option>
                @for (m of members(); track m.user.id) { <option [value]="m.user.id">{{ m.user.name }}</option> }</select></div>
              <label class="check small"><input type="checkbox" [ngModel]="noProjects()" (ngModelChange)="noProjects.set($event); page.set(1)" />No projects yet</label>
              <button class="btn btn-sm" type="button" (click)="filtersOpen.set(false)">Done</button>
            </div>
          }
        </div>
      </div>

      <div class="chips-row">
        <div class="chips">
          @if (tab() === 'archived') { <span class="chip"><span class="k">Status is</span> <b>Archived</b><button type="button" aria-label="Remove status filter" (click)="tab.set('active')"><fw-icon name="x" /></button></span> }
          @if (industry()) { <span class="chip"><span class="k">Industry is</span> <b>{{ industry() }}</b><button type="button" aria-label="Remove industry filter" (click)="industry.set('')"><fw-icon name="x" /></button></span> }
          @if (owner()) { <span class="chip"><span class="k">Owner is</span> <b>{{ ownerName() }}</b><button type="button" aria-label="Remove owner filter" (click)="owner.set('')"><fw-icon name="x" /></button></span> }
          @if (noProjects()) { <span class="chip"><span class="k">Projects</span> <b>none</b><button type="button" aria-label="Remove projects filter" (click)="noProjects.set(false)"><fw-icon name="x" /></button></span> }
          <button class="chip-add" type="button" (click)="filtersOpen.set(true)"><fw-icon name="plus" />Add filter</button>
          @if (filterCount() || tab() !== 'active' || q()) { <button class="link-accent" type="button" (click)="clearAll()">Clear all</button> }
        </div>
        <span class="small muted"><b style="color: var(--color-text)">{{ filtered().length }}</b> of {{ rows().length }} clients</span>
      </div>

      <div class="panel">
        @if (loading()) {
          <div class="panel-body muted">Loading clients…</div>
        } @else if (filtered().length) {
          <div class="table-wrap d-table"><table class="table">
            <thead><tr>
              <th><button class="sort" [class.active]="sort() === 'name'" (click)="sort.set('name')">Client</button></th>
              <th class="hide-md">Industry</th><th>Account owner</th><th class="hide-md">Billing email</th>
              <th class="num"><button class="sort" [class.active]="sort() === 'projects'" (click)="sort.set('projects')">Projects @if (sort() === 'projects') { <fw-icon name="chevronDown" /> }</button></th>
              <th>Status</th>
              <th style="width: 44px"><span class="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>@for (c of pageRows(); track c.id) {
              <tr class="clickable" (click)="open(c)">
                <td style="white-space: nowrap"><span class="row-3"><fw-avatar [name]="c.name" kind="org" /><span><span class="cell-title">{{ c.name }}</span><span class="cell-id">{{ place(c) }}</span></span></span></td>
                <td class="hide-md">@if (c.industry) { <span class="tag">{{ c.industry }}</span> } @else { <span class="faint">—</span> }</td>
                <td style="white-space: nowrap">@if (c.owner) { <span class="who"><fw-avatar [name]="c.owner.name" size="sm" />{{ short(c.owner.name) }}</span> } @else { <span class="faint">—</span> }</td>
                <td class="muted hide-md">{{ c.email || '—' }}</td>
                <td class="amount">{{ c.projects_count }}</td>
                <td><fw-status [value]="c.status" /></td>
                <td (click)="$event.stopPropagation()">
                  <div class="rowmenu">
                    <button class="btn btn-ghost btn-icon btn-sm" type="button" [attr.aria-label]="'Actions for ' + c.name" (click)="menu.set(menu() === c.id ? null : c.id)"><fw-icon name="more" /></button>
                    @if (menu() === c.id) {
                      <div class="popover" role="menu" (click)="menu.set(null)">
                        <a class="menu-item" role="menuitem" [routerLink]="['/clients', c.id]"><fw-icon name="clients" />Open</a>
                        @if (session.can('invoices.manage') && c.status === 'active') { <a class="menu-item" role="menuitem" routerLink="/invoices" [queryParams]="{ new: 1, client_id: c.id }"><fw-icon name="invoices" />New invoice</a> }
                        @if (session.can('finance.view')) { <a class="menu-item" role="menuitem" routerLink="/invoices" [queryParams]="{ client_id: c.id }"><fw-icon name="file" />Invoices</a> }
                        @if (session.can('clients.manage')) {
                          @if (c.status === 'active') { <button class="menu-item" role="menuitem" (click)="setArchived(c, true)"><fw-icon name="lock" />Archive</button> }
                          @else { <button class="menu-item" role="menuitem" (click)="setArchived(c, false)"><fw-icon name="undo" />Restore</button> }
                        }
                      </div>
                    }
                  </div>
                </td>
              </tr>
            }</tbody>
          </table></div>
          <ul class="m-list">@for (c of pageRows(); track c.id) {
            <li class="m-row" (click)="open(c)">
              <fw-avatar [name]="c.name" kind="org" />
              <span class="m-main"><span class="m-title">{{ c.name }}</span><span class="m-sub">{{ c.industry || 'Client' }} · {{ place(c) }}</span></span>
              <span class="m-end"><span class="m-amount">{{ c.projects_count }} {{ c.projects_count === 1 ? 'project' : 'projects' }}</span><fw-status [value]="c.status" /></span>
            </li>
          }</ul>
          <fw-table-foot [total]="filtered().length" [(page)]="page" [(perPage)]="perPage" />
        } @else {
          <fw-empty icon="clients" [title]="rows().length ? 'No clients match' : 'No clients yet'" text="Clients hold contacts, billing details, projects and invoice history.">
            @if (rows().length) { <button class="btn" (click)="clearAll()">Clear filters</button> } @else if (session.can('clients.manage')) { <button class="btn btn-primary" (click)="openCreate()">Add a client</button> }
          </fw-empty>
        }
      </div>
    </div>
    @if (creating()) {
      <fw-dialog title="New client" (close)="creating.set(false)" [wide]="true">
        <form id="nc" (ngSubmit)="create()"><fw-client-form [model]="form" [members]="members()" [errors]="errors()" /></form>
        <ng-container foot><button class="btn" (click)="creating.set(false)">Cancel</button><button class="btn btn-primary" type="submit" form="nc">Create client</button></ng-container>
      </fw-dialog>
    }
  `,
})
export class ClientsPage implements OnInit {
  session = inject(Session);
  private api = inject(Api);
  private router = inject(Router);
  private toasts = inject(Toasts);
  searchEl = viewChild<ElementRef<HTMLInputElement>>('search');

  tabs: { key: 'active' | 'archived' | 'all'; label: string }[] = [{ key: 'active', label: 'Active' }, { key: 'archived', label: 'Archived' }, { key: 'all', label: 'All' }];
  rows = signal<any[]>([]);
  loading = signal(true);
  members = signal<any[]>([]);
  tab = signal<'active' | 'archived' | 'all'>('active');
  sort = signal<'name' | 'projects' | 'recent'>('name');
  q = signal('');
  industry = signal('');
  owner = signal('');
  noProjects = signal(false);
  page = signal(1);
  perPage = signal(12);
  menu = signal<number | null>(null);
  filtersOpen = signal(false);
  creating = signal(false);
  form: any = emptyClient();
  errors = signal<Record<string, string>>({});

  private base = computed(() => {
    const q = this.q().trim().toLowerCase();
    return this.rows().filter((c) =>
      (!q || [c.name, c.email, c.industry, c.billing_address?.city].some((v) => v && String(v).toLowerCase().includes(q)))
      && (!this.industry() || c.industry === this.industry())
      && (!this.owner() || String(c.owner_id) === this.owner())
      && (!this.noProjects() || c.projects_count === 0));
  });
  counts = computed(() => {
    const c = { active: 0, archived: 0, all: 0 };
    for (const r of this.base()) { c.all++; c[r.status as 'active' | 'archived']++; }
    return c;
  });
  filtered = computed(() => {
    const list = this.base().filter((c) => this.tab() === 'all' || c.status === this.tab());
    const s = this.sort();
    return [...list].sort((a, b) => s === 'projects' ? b.projects_count - a.projects_count : s === 'recent' ? b.id - a.id : a.name.localeCompare(b.name));
  });
  pageRows = computed(() => pageOf(this.filtered(), this.page(), this.perPage()));
  industries = computed(() => [...new Set(this.rows().map((c) => c.industry).filter(Boolean))].sort() as string[]);
  projectTotal = computed(() => this.rows().reduce((a, c) => a + c.projects_count, 0));
  filterCount = computed(() => [this.industry(), this.owner(), this.noProjects()].filter(Boolean).length);
  ownerName = computed(() => this.members().find((m) => String(m.user.id) === this.owner())?.user.name ?? '');

  constructor() { if (this.session.can('clients.manage')) inject(QuickAction).register('New client', () => this.openCreate()); }

  ngOnInit(): void {
    this.load();
    this.api.get<any[]>('/members').then((m) => this.members.set(m.filter((x) => x.status === 'active'))).catch(() => undefined);
  }
  async load(): Promise<void> {
    try { this.rows.set((await this.api.get<any>('/clients', { status: 'all', per_page: 100 })).data); } catch (e) { this.toasts.error(apiError(e).message); } finally { this.loading.set(false); }
  }
  hotkey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) { e.preventDefault(); this.searchEl()?.nativeElement.focus(); }
    if (e.key === 'Escape') { this.menu.set(null); this.filtersOpen.set(false); }
  }
  clearAll(): void { this.tab.set('active'); this.q.set(''); this.industry.set(''); this.owner.set(''); this.noProjects.set(false); this.page.set(1); }
  open(c: any): void { this.router.navigate(['/clients', c.id]); }
  place(c: any): string { const a = c.billing_address; return a?.city ? `${a.city}${a.region ? ', ' + a.region : ''}` : (c.website ?? `CL-${c.id}`); }
  short(name: string): string { const p = name.split(' '); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : name; }
  async setArchived(c: any, archive: boolean): Promise<void> {
    try {
      await this.api.post(`/clients/${c.id}/${archive ? 'archive' : 'restore'}`);
      this.toasts.ok(archive ? `Archived ${c.name}` : `Restored ${c.name}`);
      this.load();
    } catch (e) { this.toasts.error(apiError(e).message); }
  }
  openCreate(): void { this.form = emptyClient(); this.errors.set({}); this.creating.set(true); }
  async create(): Promise<void> {
    try {
      const c = await this.api.post<any>('/clients', this.form);
      this.toasts.ok(`Added ${c.name}`);
      this.router.navigate(['/clients', c.id]);
    } catch (e) { const { message, fields } = apiError(e); this.errors.set(fields); if (!Object.keys(fields).length) this.toasts.error(message); }
  }
}

@Component({
  selector: 'fw-client-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ClientForm, ...FORMAT_PIPES, ...UI],
  template: `
    <div class="page">
      @if (c(); as c) {
        <a class="small muted row" routerLink="/clients" style="text-decoration:none; margin-bottom: var(--space-3)"><fw-icon name="arrowLeft" />Clients</a>
        <div class="page-head">
          <div><div class="row"><fw-avatar [name]="c.name" kind="org" size="lg" /><h1>{{ c.name }}</h1>@if (c.status === 'archived') { <fw-status value="archived" /> }</div>
            <p class="sub">{{ c.industry || 'Client' }}{{ c.owner ? ' · owned by ' + c.owner.name : '' }}</p></div>
          @if (session.can('clients.manage')) {
            <div class="row">
              <button class="btn" (click)="openEdit()"><fw-icon name="edit" />Edit</button>
              @if (c.status === 'archived') { <button class="btn" (click)="restore()">Restore</button> } @else { <button class="btn" (click)="archive()">Archive</button> }
              @if (session.can('invoices.manage') && c.status !== 'archived') { <a class="btn btn-primary" routerLink="/invoices" [queryParams]="{ new: 1, client_id: c.id }"><fw-icon name="invoices" />New invoice</a> }
            </div>
          }
        </div>
        @if (c.status === 'archived') { <div class="alert" style="margin-bottom: var(--space-4)"><fw-icon name="info" />Archived clients keep their projects and invoices. Restore to start new work.</div> }

        <div class="grid grid-main">
          <div class="stack-4">
            <section class="panel">
              <div class="panel-head"><h2>Projects</h2><span class="count">{{ c.projects.length }}</span></div>
              <ul class="list">@for (p of c.projects; track p.id) {
                <li><a class="row-link" [routerLink]="['/projects', p.id]"><span class="swatch" [style.background]="p.color || 'var(--color-compare)'"></span><span class="grow">{{ p.name }} <span class="faint small">{{ p.code }}</span></span><fw-status [value]="p.status" /></a></li>
              } @empty { <li class="muted">No projects for this client.</li> }</ul>
            </section>
            @if (c.invoices) {
              <section class="panel">
                <div class="panel-head"><h2>Invoice history</h2><span class="small muted">{{ c.outstanding_cents | money }} outstanding</span></div>
                <div class="table-wrap"><table class="table compact">
                  <thead><tr><th>Invoice</th><th>Issued</th><th>Due</th><th class="num">Total</th><th class="num">Balance</th><th>Status</th></tr></thead>
                  <tbody>@for (i of c.invoices; track i.id) {
                    <tr class="clickable" [routerLink]="['/invoices', i.id]"><td class="cell-title">{{ i.number || 'Draft' }}</td><td class="tabular">{{ i.issue_date | day }}</td><td class="tabular">{{ i.due_date | day }}</td>
                      <td class="num">{{ i.total_cents | money: i.currency }}</td><td class="num">{{ i.balance_cents | money: i.currency }}</td>
                      <td>@if (i.overdue) { <fw-status value="overdue" /> } @else { <fw-status [value]="i.state" /> }</td></tr>
                  } @empty { <tr><td colspan="6" class="muted">No invoices yet.</td></tr> }</tbody>
                </table></div>
              </section>
            }
          </div>
          <div class="stack-4">
            <section class="panel panel-pad stack-2">
              <h2>Billing details</h2>
              <div class="small muted">{{ c.email || 'No billing email' }} · {{ c.phone || 'No phone' }}</div>
              @if (c.billing_address) {
                <address class="small" style="font-style: normal">{{ c.billing_address.line1 }}@if (c.billing_address.line2) { <br />{{ c.billing_address.line2 }} }<br />{{ c.billing_address.city }} {{ c.billing_address.region }} {{ c.billing_address.postal_code }}<br />{{ c.billing_address.country }}</address>
              }
              @if (c.tax_id) { <div class="small">Tax ID {{ c.tax_id }}</div> }
              <p class="small faint">Issued invoices keep a snapshot of these details; editing them never rewrites history.</p>
            </section>
            <section class="panel">
              <div class="panel-head"><h2>Contacts</h2>@if (session.can('clients.manage')) { <button class="btn btn-sm" (click)="openContact(null)"><fw-icon name="plus" />Add</button> }</div>
              <ul class="list">@for (p of c.contacts; track p.id) {
                <li><fw-avatar [name]="p.name" /><span class="grow"><span style="display:block">{{ p.name }} @if (p.is_primary) { <span class="badge ink">Primary</span> }</span><span class="cell-sub">{{ p.role }} · {{ p.email }}</span></span>
                  @if (session.can('clients.manage')) { <button class="btn btn-sm btn-ghost" (click)="openContact(p)">Edit</button> }</li>
              } @empty { <li class="muted">No contacts yet.</li> }</ul>
            </section>
            @if (c.notes) { <section class="panel panel-pad stack-2"><h2>Notes</h2><p class="small muted" style="white-space: pre-line">{{ c.notes }}</p></section> }
          </div>
        </div>
      } @else if (error()) { <div class="alert danger">{{ error() }}</div> }
    </div>

    @if (editing()) {
      <fw-dialog title="Edit client" (close)="editing.set(false)" [wide]="true">
        <form id="ec" (ngSubmit)="save()"><fw-client-form [model]="form" [members]="members()" [errors]="errors()" /></form>
        <ng-container foot><button class="btn" (click)="editing.set(false)">Cancel</button><button class="btn btn-primary" type="submit" form="ec">Save</button></ng-container>
      </fw-dialog>
    }
    @if (contactOpen()) {
      <fw-dialog [title]="contact.id ? 'Edit contact' : 'New contact'" (close)="contactOpen.set(false)">
        <form class="form-grid" id="ct" (ngSubmit)="saveContact()">
          <div class="field"><label for="kn">Name</label><input id="kn" class="input" name="kn" [(ngModel)]="contact.name" /></div>
          <div class="field"><label for="kr">Role</label><input id="kr" class="input" name="kr" [(ngModel)]="contact.role" /></div>
          <div class="field"><label for="ke">Email</label><input id="ke" class="input" type="email" name="ke" [(ngModel)]="contact.email" /></div>
          <div class="field"><label for="kp">Phone</label><input id="kp" class="input" name="kp" [(ngModel)]="contact.phone" /></div>
          <label class="check full"><input type="checkbox" name="kpr" [(ngModel)]="contact.is_primary" />Primary contact</label>
        </form>
        <ng-container foot>
          @if (contact.id) { <button class="btn btn-ghost btn-danger" style="margin-right: auto" (click)="deleteContact()">Delete</button> }
          <button class="btn" (click)="contactOpen.set(false)">Cancel</button><button class="btn btn-primary" type="submit" form="ct">Save contact</button></ng-container>
      </fw-dialog>
    }
  `,
})
export class ClientDetailPage implements OnInit {
  id = input.required<string>();
  session = inject(Session);
  private api = inject(Api);
  private toasts = inject(Toasts);
  c = signal<any>(null);
  error = signal('');
  members = signal<any[]>([]);
  editing = signal(false);
  form: any = {};
  errors = signal<Record<string, string>>({});
  contactOpen = signal(false);
  contact: any = {};

  ngOnInit(): void {
    this.load();
    this.api.get<any[]>('/members').then((m) => this.members.set(m.filter((x) => x.status === 'active'))).catch(() => undefined);
  }
  async load(): Promise<void> { try { this.c.set(await this.api.get(`/clients/${this.id()}`)); } catch (e) { this.error.set(apiError(e).message); } }
  openEdit(): void {
    const c = this.c();
    this.form = { name: c.name, email: c.email, phone: c.phone, website: c.website, industry: c.industry, owner_id: c.owner_id, tax_id: c.tax_id, notes: c.notes, billing_address: { ...emptyClient().billing_address, ...(c.billing_address ?? {}) } };
    this.errors.set({});
    this.editing.set(true);
  }
  async save(): Promise<void> {
    try { await this.api.patch(`/clients/${this.id()}`, this.form); this.editing.set(false); this.load(); this.toasts.ok('Client saved'); }
    catch (e) { const { message, fields } = apiError(e); this.errors.set(fields); if (!Object.keys(fields).length) this.toasts.error(message); }
  }
  async archive(): Promise<void> { await this.api.post(`/clients/${this.id()}/archive`); this.load(); this.toasts.ok('Client archived'); }
  async restore(): Promise<void> { await this.api.post(`/clients/${this.id()}/restore`); this.load(); }
  openContact(p: any): void { this.contact = p ? { ...p } : { name: '', role: '', email: '', phone: '', is_primary: false }; this.contactOpen.set(true); }
  async saveContact(): Promise<void> {
    const body = { name: this.contact.name, role: this.contact.role, email: this.contact.email || null, phone: this.contact.phone, is_primary: !!this.contact.is_primary };
    try {
      if (this.contact.id) await this.api.patch(`/clients/${this.id()}/contacts/${this.contact.id}`, body);
      else await this.api.post(`/clients/${this.id()}/contacts`, body);
      this.contactOpen.set(false);
      this.load();
    } catch (e) { this.toasts.error(apiError(e).message); }
  }
  async deleteContact(): Promise<void> {
    if (!confirm(`Remove ${this.contact.name}?`)) return;
    await this.api.delete(`/clients/${this.id()}/contacts/${this.contact.id}`);
    this.contactOpen.set(false);
    this.load();
  }
}
