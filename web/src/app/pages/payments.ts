import { ChangeDetectionStrategy, Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, apiError } from '../core/api';
import { Session } from '../core/session';
import { Toasts } from '../core/toast';
import { FORMAT_PIPES } from '../core/format';
import { UI } from '../shared/ui';
import { RANGE_LABEL, TableFoot, pageOf, rangeStart } from '../shared/list';
import { QuickAction } from '../core/quick';


type Tab = 'all' | 'settled' | 'pending' | 'reversed' | 'failed';
const METHOD: Record<string, string> = { bank_transfer: 'Bank transfer', check: 'Check', cash: 'Cash', card_external: 'Card (external)', other: 'Other' };

@Component({
  selector: 'fw-payments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TableFoot, ...FORMAT_PIPES, ...UI],
  host: { '(document:keydown)': 'hotkey($event)' },
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Payments</h1><p class="sub">{{ collected() | money: session.currency() }} settled {{ range() === 'all' ? 'to date' : rangeLabel().toLowerCase() }}, net of refunds · only settled payments reduce balances</p></div>
        @if (session.can('payments.manage')) { <button class="btn btn-primary dup" (click)="openRecord()"><fw-icon name="plus" />Record payment</button> }
      </div>

      <div class="list-bar">
        <div class="seg" role="group" aria-label="Payment status">
          @for (t of tabs; track t.key) { <button type="button" [attr.aria-pressed]="tab() === t.key" (click)="setTab(t.key)">{{ t.label }} <span class="n">{{ counts()[t.key] }}</span></button> }
        </div>
        <span class="grow"></span>
        <label class="pill-btn"><fw-icon name="calendar" /><span class="sr-only">Received</span>
          <select class="select" [ngModel]="range()" (ngModelChange)="range.set($event); page.set(1)" aria-label="Received date range">
            <option value="all">All dates</option><option value="month">This month</option><option value="last30">Last 30 days</option><option value="quarter">This quarter</option><option value="year">This year</option>
          </select></label>
        <label class="pill-btn"><fw-icon name="switch" /><span class="sr-only">Sort</span>
          <select class="select" [ngModel]="sort()" (ngModelChange)="sort.set($event)" aria-label="Sort by">
            <option value="received">Sort: Newest</option><option value="amount">Sort: Amount</option><option value="client">Sort: Client</option>
          </select></label>
      </div>

      <div class="search-row">
        <label class="searchbar"><fw-icon name="search" /><span class="sr-only">Search payments</span>
          <input #search type="search" placeholder="Search reference, client or invoice number" [ngModel]="q()" (ngModelChange)="q.set($event); page.set(1)" />
          <span class="kbd" aria-hidden="true">/</span></label>
        <div class="filters">
          <button class="pill-btn" style="height: var(--control-lg)" type="button" (click)="filtersOpen.set(!filtersOpen())" [attr.aria-expanded]="filtersOpen()"><fw-icon name="filter" />Filters
            @if (filterCount()) { <span class="badge-count">{{ filterCount() }}</span> }</button>
          @if (filtersOpen()) {
            <div class="popover stack-3" role="dialog" aria-label="Filters">
              <div class="field"><label for="fc">Client</label><select id="fc" class="select" [ngModel]="clientId()" (ngModelChange)="clientId.set($event); page.set(1)"><option value="">Any client</option>
                @for (c of clients(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select></div>
              <div class="field"><label for="fm">Method</label><select id="fm" class="select" [ngModel]="method()" (ngModelChange)="method.set($event); page.set(1)"><option value="">Any method</option>
                @for (m of methodKeys; track m) { <option [value]="m">{{ methods[m] }}</option> }</select></div>
              <label class="check small"><input type="checkbox" [ngModel]="corrected()" (ngModelChange)="corrected.set($event); page.set(1)" />Has refunds or reversals</label>
              <button class="btn btn-sm" type="button" (click)="filtersOpen.set(false)">Done</button>
            </div>
          }
        </div>
      </div>

      <div class="chips-row">
        <div class="chips">
          @if (tab() !== 'all') { <span class="chip"><span class="k">Status is</span> <b>{{ tabLabel() }}</b><button type="button" aria-label="Remove status filter" (click)="setTab('all')"><fw-icon name="x" /></button></span> }
          @if (range() !== 'all') { <span class="chip"><span class="k">Received</span> <b>{{ rangeLabel() }}</b><button type="button" aria-label="Remove date filter" (click)="range.set('all')"><fw-icon name="x" /></button></span> }
          @if (clientId()) { <span class="chip"><span class="k">Client is</span> <b>{{ clientName() }}</b><button type="button" aria-label="Remove client filter" (click)="clientId.set('')"><fw-icon name="x" /></button></span> }
          @if (method()) { <span class="chip"><span class="k">Method is</span> <b>{{ methods[method()] }}</b><button type="button" aria-label="Remove method filter" (click)="method.set('')"><fw-icon name="x" /></button></span> }
          @if (corrected()) { <span class="chip"><span class="k">Has</span> <b>corrections</b><button type="button" aria-label="Remove correction filter" (click)="corrected.set(false)"><fw-icon name="x" /></button></span> }
          <button class="chip-add" type="button" (click)="filtersOpen.set(true)"><fw-icon name="plus" />Add filter</button>
          @if (filterCount() || tab() !== 'all' || range() !== 'all' || q()) { <button class="link-accent" type="button" (click)="clearAll()">Clear all</button> }
        </div>
        <span class="small muted"><b style="color: var(--color-text)">{{ filtered().length }}</b> of {{ rows().length }} payments</span>
      </div>

      <div class="panel">
        @if (loading()) {
          <div class="panel-body muted">Loading payments…</div>
        } @else if (filtered().length) {
          <div class="table-wrap d-table"><table class="table">
            <thead><tr>
              <th>Payment</th>
              <th><button class="sort" [class.active]="sort() === 'client'" (click)="sort.set('client')">Client</button></th>
              <th class="hide-md">Applied to</th>
              <th><button class="sort" [class.active]="sort() === 'received'" (click)="sort.set('received')">Received</button></th>
              <th>Status</th><th class="hide-md">Reconciliation</th>
              <th class="num"><button class="sort" [class.active]="sort() === 'amount'" (click)="sort.set('amount')">Amount @if (sort() === 'amount') { <fw-icon name="chevronDown" /> }</button></th>
              <th style="width: 44px"><span class="sr-only">Actions</span></th>
            </tr></thead>
            <tbody>@for (p of pageRows(); track p.id) {
              <tr>
                <td style="white-space: nowrap"><span class="cell-title">{{ methods[p.method] }}</span><span class="cell-id">{{ p.reference || 'PAY-' + p.id }}{{ p.provider ? ' · via ' + p.provider : '' }}</span></td>
                <td style="white-space: nowrap"><span class="who"><fw-avatar [name]="p.client?.name" kind="org" size="sm" />{{ p.client?.name }}</span></td>
                <td class="hide-md"><div class="row wrap" style="gap: var(--space-1)">@for (a of p.allocations; track a.id) { <a class="tag" style="text-decoration: none" [routerLink]="['/invoices', a.invoice_id]">{{ a.invoice?.number }}</a> }</div></td>
                <td class="tabular muted" style="white-space: nowrap">{{ p.received_on | day }}@if (p.settled_at && p.settled_at.slice(0, 10) !== p.received_on) { <span class="cell-sub" style="display:block">settled {{ p.settled_at | day }}</span> }</td>
                <td style="white-space: nowrap"><fw-status [value]="p.status" /></td>
                <td class="small muted hide-md" style="white-space: nowrap">{{ p.reconciliation | label }}</td>
                <td class="amount">{{ p.amount_cents | money: p.currency }}@if (p.refunded_cents) { <span class="cell-sub" style="display:block; color: var(--color-danger); font-weight: var(--weight-medium)">−{{ p.refunded_cents | money: p.currency }}</span> }</td>
                <td>
                  <div class="rowmenu">
                    <button class="btn btn-ghost btn-icon btn-sm" type="button" [attr.aria-label]="'Actions for payment ' + (p.reference || p.id)" (click)="menu.set(menu() === p.id ? null : p.id)"><fw-icon name="more" /></button>
                    @if (menu() === p.id) {
                      <div class="popover" role="menu" (click)="menu.set(null)">
                        @for (a of p.allocations; track a.id) { <a class="menu-item" role="menuitem" [routerLink]="['/invoices', a.invoice_id]"><fw-icon name="invoices" />Open {{ a.invoice?.number }}</a> }
                        @if (session.can('payments.manage') && p.status === 'pending') { <button class="menu-item" role="menuitem" (click)="settle(p)"><fw-icon name="check" />Mark settled</button> }
                        @if (session.can('payments.correct') && (p.status === 'settled' || p.status === 'pending')) { <button class="menu-item" role="menuitem" (click)="openCorrect(p)"><fw-icon name="undo" />{{ p.status === 'pending' ? 'Mark failed' : 'Refund or reverse' }}</button> }
                        <a class="menu-item" role="menuitem" [routerLink]="['/clients', p.client_id]"><fw-icon name="clients" />View client</a>
                      </div>
                    }
                  </div>
                </td>
              </tr>
            }</tbody>
          </table></div>
          <ul class="m-list">@for (p of pageRows(); track p.id) {
            <li class="m-row" (click)="menu.set(null); openFirstInvoice(p)">
              <fw-avatar [name]="p.client?.name" kind="org" />
              <span class="m-main"><span class="m-title">{{ p.client?.name }}</span><span class="m-sub">{{ methods[p.method] }} · {{ p.received_on | day }}{{ p.allocations.length ? ' · ' + p.allocations[0].invoice?.number : '' }}</span></span>
              <span class="m-end"><span class="m-amount">{{ p.amount_cents | money: p.currency }}</span><fw-status [value]="p.status" /></span>
            </li>
          }</ul>
          <fw-table-foot [total]="filtered().length" [(page)]="page" [(perPage)]="perPage" />
        } @else {
          <fw-empty icon="payments" [title]="rows().length ? 'No payments match' : 'No payments recorded'" text="Record a bank transfer, check or cash payment against an issued invoice." hint="Pending payments do not change balances until they settle.">
            @if (rows().length) { <button class="btn" (click)="clearAll()">Clear filters</button> } @else if (session.can('payments.manage')) { <button class="btn btn-primary" (click)="openRecord()">Record a payment</button> }
          </fw-empty>
        }
      </div>
    </div>

    @if (recording()) {
      <fw-dialog title="Record payment" subtitle="Allocate the payment to one or more of the client's open invoices." [wide]="true" (close)="recording.set(false)">
        <form class="stack-4" id="rp" (ngSubmit)="record()">
          <div class="form-grid">
            <div class="field"><label for="pc">Client</label><select id="pc" class="select" name="c" [(ngModel)]="form.client_id" (ngModelChange)="loadOpen()"><option [ngValue]="null">Choose a client</option>
              @for (c of clients(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }</select></div>
            <div class="field"><label for="pm">Method</label><select id="pm" class="select" name="m" [(ngModel)]="form.method">@for (m of methodKeys; track m) { <option [value]="m">{{ methods[m] }}</option> }</select></div>
            <div class="field"><label for="pd">Received on</label><input id="pd" class="input" type="date" name="d" [(ngModel)]="form.received_on" /></div>
            <div class="field"><label for="ps">Status</label><select id="ps" class="select" name="s" [(ngModel)]="form.status"><option value="settled">Settled (funds received)</option><option value="pending">Pending (in transit)</option></select></div>
            <div class="field full"><label for="pr">Reference</label><input id="pr" class="input" name="r" placeholder="Bank reference or check number" [(ngModel)]="form.reference" /></div>
          </div>
          @if (open().length) {
            <div class="table-wrap"><table class="table compact">
              <thead><tr><th>Invoice</th><th>Due</th><th class="num">Balance</th><th class="num" style="width: 160px">Allocate</th></tr></thead>
              <tbody>@for (i of open(); track i.id) {
                <tr><td><span class="cell-title">{{ i.number }}</span></td><td class="tabular">{{ i.due_date | day }} @if (i.settlement.overdue) { <fw-status value="overdue" /> }</td><td class="num">{{ i.settlement.balance_cents | money }}</td>
                  <td class="num"><input class="input sm" type="number" min="0" step="0.01" [attr.aria-label]="'Allocate to ' + i.number" [name]="'a' + i.id" [(ngModel)]="alloc[i.id]" /></td></tr>
              }</tbody>
              <tfoot><tr><td colspan="3">Payment total</td><td class="num">{{ allocTotal() | money }}</td></tr></tfoot>
            </table></div>
          } @else if (form.client_id) { <p class="muted">This client has no open invoices.</p> }
          @if (error()) { <div class="form-error" role="alert">{{ error() }}</div> }
        </form>
        <ng-container foot><button class="btn" (click)="recording.set(false)">Cancel</button><button class="btn btn-primary" type="submit" form="rp" [disabled]="busy() || allocTotal() <= 0">Record {{ allocTotal() | money }}</button></ng-container>
      </fw-dialog>
    }

    @if (correcting(); as p) {
      <fw-dialog title="Correct payment" [subtitle]="(p.amount_cents | money: p.currency) + ' from ' + p.client?.name + '. Corrections are linked records with a reason; the original is never removed.'" (close)="correcting.set(null)">
        <div class="seg" role="group" aria-label="Correction type" style="margin-bottom: var(--space-4)">
          @if (p.status === 'settled') {
            <button type="button" [attr.aria-pressed]="mode === 'refund'" (click)="mode = 'refund'">Partial refund</button>
            <button type="button" [attr.aria-pressed]="mode === 'reverse'" (click)="mode = 'reverse'">Reverse (bounced)</button>
          } @else { <button type="button" aria-pressed="true">Mark failed</button> }
        </div>
        <div class="form-grid">
          @if (mode === 'refund' && p.status === 'settled') {
            <div class="field"><label for="ri">Invoice</label><select id="ri" class="select" [(ngModel)]="corr.invoice_id">@for (a of p.allocations; track a.id) { <option [ngValue]="a.invoice_id">{{ a.invoice?.number }}</option> }</select></div>
            <div class="field"><label for="ra">Amount</label><input id="ra" class="input" type="number" min="0.01" step="0.01" [(ngModel)]="corr.amount" /></div>
          }
          <div class="field full"><label for="rr">Reason</label><input id="rr" class="input" [(ngModel)]="corr.reason" /></div>
        </div>
        @if (error()) { <div class="form-error" style="margin-top: var(--space-3)">{{ error() }}</div> }
        <ng-container foot><button class="btn" (click)="correcting.set(null)">Cancel</button><button class="btn btn-primary" [disabled]="!corr.reason" (click)="applyCorrection(p)">Apply correction</button></ng-container>
      </fw-dialog>
    }
  `,
})
export class PaymentsPage implements OnInit {
  session = inject(Session);
  private api = inject(Api);
  private toasts = inject(Toasts);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  searchEl = viewChild<ElementRef<HTMLInputElement>>('search');

  methods = METHOD;
  methodKeys = Object.keys(METHOD);
  tabs: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'settled', label: 'Settled' }, { key: 'pending', label: 'Pending' }, { key: 'reversed', label: 'Reversed' }, { key: 'failed', label: 'Failed' },
  ];
  rows = signal<any[]>([]);
  loading = signal(true);
  clients = signal<any[]>([]);
  tab = signal<Tab>('all');
  range = signal('all');
  sort = signal<'received' | 'amount' | 'client'>('received');
  q = signal('');
  clientId = signal('');
  method = signal('');
  corrected = signal(false);
  page = signal(1);
  perPage = signal(12);
  menu = signal<number | null>(null);
  filtersOpen = signal(false);

  recording = signal(false);
  open = signal<any[]>([]);
  alloc: Record<number, number | null> = {};
  form: any = {};
  error = signal('');
  busy = signal(false);
  correcting = signal<any>(null);
  mode: 'refund' | 'reverse' = 'refund';
  corr: any = {};

  private base = computed(() => {
    const q = this.q().trim().toLowerCase();
    const from = rangeStart(this.range());
    return this.rows().filter((p) =>
      (!q || [p.reference, p.client?.name, ...p.allocations.map((a: any) => a.invoice?.number)].some((v) => v && String(v).toLowerCase().includes(q)))
      && (!from || p.received_on >= from)
      && (!this.clientId() || String(p.client_id) === this.clientId())
      && (!this.method() || p.method === this.method())
      && (!this.corrected() || p.refunded_cents > 0));
  });
  counts = computed(() => {
    const c: Record<Tab, number> = { all: 0, settled: 0, pending: 0, reversed: 0, failed: 0 };
    for (const p of this.base()) { c.all++; c[p.status as Tab]++; }
    return c;
  });
  filtered = computed(() => {
    const list = this.base().filter((p) => this.tab() === 'all' || p.status === this.tab());
    const s = this.sort();
    return [...list].sort((a, b) =>
      s === 'amount' ? b.amount_cents - a.amount_cents
        : s === 'client' ? (a.client?.name ?? '').localeCompare(b.client?.name ?? '')
          : b.received_on.localeCompare(a.received_on) || b.id - a.id);
  });
  pageRows = computed(() => pageOf(this.filtered(), this.page(), this.perPage()));
  /** Settled cash in the selected date range (gross of refunds shown per row). */
  collected = computed(() => this.base().filter((p) => p.status === 'settled').reduce((a, p) => a + p.amount_cents - (p.refunded_cents ?? 0), 0));
  filterCount = computed(() => [this.clientId(), this.method(), this.corrected()].filter(Boolean).length);
  tabLabel = computed(() => this.tabs.find((t) => t.key === this.tab())?.label ?? '');
  rangeLabel = computed(() => (this.range() === 'all' ? 'All time' : RANGE_LABEL[this.range()]));
  clientName = computed(() => this.clients().find((c) => String(c.id) === this.clientId())?.name ?? '');

  constructor() { if (this.session.can('payments.manage')) inject(QuickAction).register('Record payment', () => this.openRecord()); }

  ngOnInit(): void {
    this.load();
    this.api.get<any>('/clients', { per_page: 100, status: 'all' }).then((r) => this.clients.set(r.data));
    const q = this.route.snapshot.queryParamMap;
    if (q.get('record')) {
      this.openRecord(Number(q.get('client_id')) || null, Number(q.get('invoice_id')) || null);
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
  }
  async load(): Promise<void> {
    try { this.rows.set(await this.api.get<any[]>('/payments')); } catch (e) { this.toasts.error(apiError(e).message); } finally { this.loading.set(false); }
  }

  hotkey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) { e.preventDefault(); this.searchEl()?.nativeElement.focus(); }
    if (e.key === 'Escape') { this.menu.set(null); this.filtersOpen.set(false); }
  }
  setTab(t: Tab): void { this.tab.set(t); this.page.set(1); }
  openFirstInvoice(p: any): void { if (p.allocations[0]) this.router.navigate(['/invoices', p.allocations[0].invoice_id]); }
  clearAll(): void { this.tab.set('all'); this.range.set('all'); this.q.set(''); this.clientId.set(''); this.method.set(''); this.corrected.set(false); this.page.set(1); }

  allocTotal(): number { return Object.values(this.alloc).reduce<number>((a, v) => a + Math.round((Number(v) || 0) * 100), 0); }

  openRecord(clientId: number | null = null, invoiceId: number | null = null): void {
    this.form = { client_id: clientId, method: 'bank_transfer', received_on: new Date().toISOString().slice(0, 10), status: 'settled', reference: '' };
    this.alloc = {};
    this.open.set([]);
    this.error.set('');
    this.recording.set(true);
    if (clientId) this.loadOpen(invoiceId);
  }
  async loadOpen(prefill: number | null = null): Promise<void> {
    this.alloc = {};
    if (!this.form.client_id) { this.open.set([]); return; }
    const r = await this.api.get<any>('/invoices', { client_id: this.form.client_id, status: 'issued' });
    const open = r.data.filter((i: any) => i.settlement.balance_cents > 0);
    this.open.set(open);
    const target = open.find((i: any) => i.id === prefill);
    if (target) this.alloc[target.id] = target.settlement.balance_cents / 100;
  }
  async record(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    const allocations = Object.entries(this.alloc).map(([id, v]) => ({ invoice_id: Number(id), amount_cents: Math.round((Number(v) || 0) * 100) })).filter((a) => a.amount_cents > 0);
    try {
      await this.api.post('/payments', { ...this.form, reference: this.form.reference || null, amount_cents: this.allocTotal(), allocations });
      this.toasts.ok(this.form.status === 'settled' ? 'Payment recorded and applied' : 'Pending payment recorded; balances change when it settles');
      this.recording.set(false);
      this.load();
    } catch (e) { const { message, fields } = apiError(e); this.error.set(Object.values(fields)[0] ?? message); }
    finally { this.busy.set(false); }
  }
  async settle(p: any): Promise<void> {
    try { await this.api.post(`/payments/${p.id}/settle`); this.toasts.ok('Payment settled'); this.load(); } catch (e) { this.toasts.error(apiError(e).message); }
  }
  openCorrect(p: any): void {
    this.mode = p.status === 'pending' ? 'reverse' : 'refund';
    this.corr = { invoice_id: p.allocations[0]?.invoice_id, amount: null, reason: '' };
    this.error.set('');
    this.correcting.set(p);
  }
  async applyCorrection(p: any): Promise<void> {
    try {
      if (p.status === 'pending') await this.api.post(`/payments/${p.id}/fail`, { reason: this.corr.reason });
      else if (this.mode === 'refund') await this.api.post(`/payments/${p.id}/refund`, { invoice_id: this.corr.invoice_id, amount_cents: Math.round((this.corr.amount || 0) * 100), reason: this.corr.reason });
      else await this.api.post(`/payments/${p.id}/reverse`, { reason: this.corr.reason });
      this.toasts.ok('Correction recorded');
      this.correcting.set(null);
      this.load();
    } catch (e) { const { message, fields } = apiError(e); this.error.set(Object.values(fields)[0] ?? message); }
  }
}

@Component({
  selector: 'fw-cards',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ...UI],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Cards</h1><p class="sub">Saved client payment methods, stored as provider tokens only.</p></div></div>
      @if (d(); as d) {
        @if (!d.provider_configured) {
          <div class="panel">
            <fw-empty icon="cards" title="Connect a payment provider to enable cards" text="Fieldwork never stores card numbers or security codes. Cards are added through a provider's hosted fields, and only a token, brand, last four digits and expiry are kept." hint="Until a provider is connected, record card payments taken elsewhere as external card payments.">
              @if (session.can('workspace.settings')) { <a class="btn btn-primary" routerLink="/settings" [queryParams]="{ tab: 'integrations' }">Open integrations</a> }
              <a class="btn" routerLink="/payments" [queryParams]="{ record: 1 }">Record a payment</a>
            </fw-empty>
            <div class="panel-body" style="border-top: var(--hairline) solid var(--color-border)">
              <h3 style="margin-bottom: var(--space-2)">Setup steps</h3>
              <ol class="small muted stack-1" style="margin: 0; padding-left: var(--space-5)">@for (s of d.setup; track $index) { <li>{{ s }}</li> }</ol>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class CardsPage implements OnInit {
  session = inject(Session);
  private api = inject(Api);
  d = signal<any>(null);
  ngOnInit(): void { this.api.get('/cards').then((r) => this.d.set(r)); }
}
