import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, apiError } from '../core/api';
import { Session } from '../core/session';
import { Toasts } from '../core/toast';
import { FORMAT_PIPES } from '../core/format';
import { UI } from '../shared/ui';

@Component({
  selector: 'fw-invoice-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ...FORMAT_PIPES, ...UI],
  styles: [`
    .doc { padding: var(--space-7); }
    .doc-head { display: flex; justify-content: space-between; gap: var(--space-5); flex-wrap: wrap; margin-bottom: var(--space-6); }
    .doc-num { font-size: var(--text-title); line-height: var(--lh-title); font-weight: var(--weight-semibold); letter-spacing: var(--track-tight); }
    .meta-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-5); margin-bottom: var(--space-6); }
    .meta-grid .label { color: var(--color-text-tertiary); font-size: var(--text-small); font-weight: var(--weight-medium); margin-bottom: var(--space-1); }
    .sums { margin-left: auto; width: min(320px, 100%); margin-top: var(--space-4); }
    .sums div { display: flex; justify-content: space-between; padding: var(--space-1) 0; font-variant-numeric: tabular-nums; }
    .sums .total { border-top: var(--hairline) solid var(--color-border); margin-top: var(--space-2); padding-top: var(--space-3); font-weight: var(--weight-semibold); font-size: var(--text-heading); }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--space-5); align-items: start; }
    @media (max-width: 1100px) { .layout { grid-template-columns: minmax(0, 1fr); } .meta-grid { grid-template-columns: minmax(0, 1fr); } .doc { padding: var(--space-5); } }
    @media print {
      :host ::ng-deep aside, :host ::ng-deep header, .no-print { display: none !important; }
      .layout { display: block; } .panel { border: 0; }
    }
  `],
  template: `
    <div class="page">
      @if (error()) { <div class="alert danger">{{ error() }}</div> }
      @if (inv(); as i) {
        <div class="no-print">
          <a class="small muted row" routerLink="/invoices" style="text-decoration:none; margin-bottom: var(--space-3)"><fw-icon name="arrowLeft" />Invoices</a>
          <div class="page-head">
            <div><div class="row"><h1>{{ i.number || 'Draft invoice' }}</h1>
              @if (i.status === 'issued') { <fw-status [value]="i.settlement.state" />@if (i.settlement.overdue) { <fw-status value="overdue" /> } } @else { <fw-status [value]="i.status" /> }</div>
              <p class="sub">{{ i.client?.name }}{{ i.project ? ' · ' + i.project.name : '' }}{{ i.delivered_at ? ' · sent to ' + i.delivered_to + ' ' + (i.delivered_at | ago) : '' }}</p></div>
            <div class="row wrap">
              <button class="btn" (click)="print()"><fw-icon name="download" />Print or save PDF</button>
              @if (canManage()) {
                @if (i.status === 'draft') {
                  <button class="btn btn-ghost btn-danger" (click)="deleteDraft()">Delete draft</button>
                  <button class="btn btn-primary" (click)="confirmIssue.set(true)" [disabled]="!i.items.length"><fw-icon name="check" />Issue invoice</button>
                }
                @if (i.status === 'issued') {
                  <button class="btn" (click)="openSend()"><fw-icon name="mail" />Send</button>
                  <button class="btn" (click)="creditOpen.set(true)" [disabled]="i.settlement.balance_cents <= 0">Credit note</button>
                  <button class="btn" (click)="voidOpen.set(true)">Void</button>
                  @if (i.settlement.balance_cents > 0 && session.can('payments.manage')) { <a class="btn btn-primary" routerLink="/payments" [queryParams]="{ record: 1, invoice_id: i.id, client_id: i.client_id }"><fw-icon name="payments" />Record payment</a> }
                }
              }
            </div>
          </div>
        </div>

        <div class="layout">
          <article class="panel doc">
            <div class="doc-head">
              <div><div class="doc-num">{{ i.number || 'Draft' }}</div><div class="muted">{{ i.billing_snapshot?.workspace_name || i.workspace.name }}</div></div>
              <div style="text-align: right"><div class="small muted">Amount due</div><div class="kpi-figure">{{ (i.status === 'issued' ? i.settlement.balance_cents : i.total_cents) | money: i.currency }}</div>
                @if (i.due_date) { <div class="small muted">due {{ i.due_date | day: 'long' }}</div> }</div>
            </div>
            <div class="meta-grid">
              <div><div class="label">Billed to</div><div>{{ snap().client_name }}</div>
                @if (snap().billing_address; as a) { <div class="small muted">{{ a.line1 }}@if (a.line2) {, {{ a.line2 }} }<br />{{ a.city }} {{ a.region }} {{ a.postal_code }}<br />{{ a.country }}</div> }
                @if (snap().tax_id) { <div class="small muted">{{ snap().tax_id }}</div> }</div>
              <div><div class="label">Issued</div><div>{{ i.issue_date ? (i.issue_date | day: 'long') : 'Not yet issued' }}</div><div class="label" style="margin-top: var(--space-3)">Terms</div><div>Net {{ i.payment_terms_days }} days</div></div>
              <div><div class="label">Project</div><div>{{ i.project?.name || '—' }}</div><div class="label" style="margin-top: var(--space-3)">Currency</div><div>{{ i.currency }}</div></div>
            </div>

            <div class="table-wrap"><table class="table">
              <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th>@if (i.status === 'draft' && canManage()) { <th class="no-print"></th> }</tr></thead>
              <tbody>
                @for (l of lines(); track $index) {
                  <tr><td>{{ l.description }}@if (l.kind === 'time') { <span class="cell-sub" style="display:block">{{ l.time_links?.length ?? '' }}{{ l.time_links ? ' approved entries' : 'Approved time' }}</span> }</td>
                    <td class="num">{{ qty(l.quantity_milli) }}{{ l.kind === 'time' ? ' h' : '' }}</td><td class="num">{{ l.unit_price_cents | money: i.currency }}</td><td class="num">{{ l.amount_cents | money: i.currency }}</td>
                    @if (i.status === 'draft' && canManage()) { <td class="num no-print"><button class="btn btn-sm btn-ghost btn-icon" [attr.aria-label]="'Remove ' + l.description" (click)="removeLine(l)"><fw-icon name="x" /></button></td> }</tr>
                } @empty { <tr><td colspan="5" class="muted">No lines yet. Add approved time or a fixed-fee line.</td></tr> }
              </tbody>
            </table></div>

            <div class="sums">
              <div><span class="muted">Subtotal</span><span>{{ i.subtotal_cents | money: i.currency }}</span></div>
              @if (i.discount_cents) { <div><span class="muted">Discount</span><span>−{{ i.discount_cents | money: i.currency }}</span></div> }
              <div><span class="muted">Tax ({{ i.tax_rate_bp / 100 }}%)</span><span>{{ i.tax_cents | money: i.currency }}</span></div>
              <div class="total"><span>Total</span><span>{{ i.total_cents | money: i.currency }}</span></div>
              @if (i.status === 'issued') {
                @if (i.settlement.credited_cents) { <div><span class="muted">Credited</span><span>−{{ i.settlement.credited_cents | money: i.currency }}</span></div> }
                <div><span class="muted">Paid</span><span>−{{ i.settlement.paid_cents | money: i.currency }}</span></div>
                <div style="font-weight: var(--weight-semibold)"><span>Balance due</span><span>{{ i.settlement.balance_cents | money: i.currency }}</span></div>
              }
            </div>
            @if (i.notes) { <p class="small muted" style="margin-top: var(--space-6); white-space: pre-line">{{ i.notes }}</p> }
            @if (i.status === 'void') { <div class="alert" style="margin-top: var(--space-5)">Voided {{ i.voided_at | day }}: {{ i.void_reason }}</div> }
          </article>

          <aside class="stack-4 no-print">
            @if (i.status === 'draft' && canManage()) {
              <section class="panel panel-pad stack-3">
                <h2>Add lines</h2>
                <button class="btn" (click)="openTime()"><fw-icon name="time" />Add approved time</button>
                <form class="stack-2" (ngSubmit)="addLine()">
                  <div class="field"><label for="ld">Fixed-fee or manual line</label><input id="ld" class="input" name="ld" placeholder="Description" [(ngModel)]="line.description" /></div>
                  <div class="row"><input class="input" type="number" min="0.001" step="0.25" name="lq" aria-label="Quantity" placeholder="Qty" [(ngModel)]="line.quantity" />
                    <input class="input" type="number" min="0" step="0.01" name="lp" aria-label="Unit price" placeholder="Unit price" [(ngModel)]="line.price" /></div>
                  <div class="row"><select class="select" name="lk" aria-label="Line type" [(ngModel)]="line.kind"><option value="fixed_fee">Fixed fee</option><option value="manual">Manual</option></select>
                    <button class="btn" type="submit" [disabled]="!line.description || !line.quantity || line.price === null">Add</button></div>
                </form>
              </section>
              <section class="panel panel-pad stack-3">
                <h2>Terms</h2>
                <div class="form-grid">
                  <div class="field"><label for="dd">Discount</label><input id="dd" class="input" type="number" min="0" step="0.01" [(ngModel)]="terms.discount" /></div>
                  <div class="field"><label for="tx">Tax %</label><input id="tx" class="input" type="number" min="0" step="0.01" [(ngModel)]="terms.tax" /></div>
                  <div class="field"><label for="pt">Net days</label><input id="pt" class="input" type="number" min="0" [(ngModel)]="terms.days" /></div>
                </div>
                <div class="field"><label for="nt">Notes</label><textarea id="nt" class="textarea" [(ngModel)]="terms.notes"></textarea></div>
                <button class="btn" (click)="saveTerms()">Save terms</button>
              </section>
            }
            @if (i.status !== 'draft') {
              <section class="panel">
                <div class="panel-head"><h2>Payments</h2></div>
                <ul class="list">
                  @for (a of i.allocations; track a.id) {
                    <li><span class="grow"><span style="display:block">{{ a.payment.method | label }}{{ a.payment.reference ? ' · ' + a.payment.reference : '' }}</span><span class="cell-sub">{{ a.payment.received_on | day }}</span></span>
                      <span class="stack-1" style="text-align:right"><b class="tabular">{{ a.amount_cents | money: i.currency }}</b><fw-status [value]="a.payment.status" /></span></li>
                  }
                  @for (r of i.refunds; track r.id) {
                    <li><span class="grow"><span style="display:block">{{ r.kind | label }}</span><span class="cell-sub">{{ r.refunded_on | day }} · {{ r.reason }}</span></span><b class="tabular" style="color: var(--color-danger)">−{{ r.amount_cents | money: i.currency }}</b></li>
                  }
                  @for (c of i.credit_notes; track c.id) {
                    <li><span class="grow"><span style="display:block">Credit {{ c.number }}</span><span class="cell-sub">{{ c.issued_at | day }} · {{ c.reason }}</span></span><b class="tabular">−{{ c.amount_cents | money: i.currency }}</b></li>
                  }
                  @if (!i.allocations.length && !i.refunds.length && !i.credit_notes.length) { <li class="muted">No payments recorded.</li> }
                </ul>
              </section>
            }
            <p class="small faint">{{ i.status === 'draft' ? 'Drafts reserve the time on them. Deleting the draft releases it.' : 'Issued content is locked. Corrections use a credit note or a void and reissue.' }}</p>
          </aside>
        </div>
      }
    </div>

    @if (timeOpen()) {
      <fw-dialog title="Add approved time" subtitle="Approved, billable time for this client that is not on another invoice." [wide]="true" (close)="timeOpen.set(false)">
        @if (available().length) {
          <div class="spread" style="margin-bottom: var(--space-2)"><label class="check"><input type="checkbox" [checked]="picked().size === available().length" (change)="toggleAllTime()" />Select all</label>
            <span class="small muted">{{ picked().size }} entries · {{ pickedMinutes() | hours: 2 }}h · {{ pickedValue() | money }}</span></div>
          <div class="table-wrap" style="max-height: 420px; overflow-y: auto"><table class="table compact">
            <thead><tr><th></th><th>Date</th><th>Person</th><th>Project</th><th>Notes</th><th class="num">Hours</th><th class="num">Rate</th></tr></thead>
            <tbody>@for (e of available(); track e.id) {
              <tr [class.selected]="picked().has(e.id)"><td><input type="checkbox" [attr.aria-label]="'Select entry ' + e.id" [checked]="picked().has(e.id)" (change)="togglePick(e.id)" /></td>
                <td class="tabular">{{ e.work_date | day }}</td><td>{{ e.user?.name }}</td><td>{{ e.project?.code }}</td><td class="muted truncate" style="max-width: 200px">{{ e.notes }}</td>
                <td class="num">{{ e.minutes | hours: 2 }}</td><td class="num">{{ e.bill_rate_cents | money }}</td></tr>
            }</tbody>
          </table></div>
        } @else { <p class="muted">There is no unbilled approved time for this client.</p> }
        <ng-container foot><button class="btn" (click)="timeOpen.set(false)">Cancel</button><button class="btn btn-primary" [disabled]="!picked().size" (click)="addTime()">Add {{ picked().size }} entries</button></ng-container>
      </fw-dialog>
    }
    @if (confirmIssue()) {
      <fw-dialog title="Issue this invoice?" subtitle="It receives the next invoice number and its lines, rates, tax and billing details are locked." (close)="confirmIssue.set(false)">
        <p>Total {{ inv().total_cents | money: inv().currency }} to {{ inv().client?.name }}, due in {{ inv().payment_terms_days }} days.</p>
        <ng-container foot><button class="btn" (click)="confirmIssue.set(false)">Cancel</button><button class="btn btn-primary" [disabled]="busy()" (click)="issue()">Issue invoice</button></ng-container>
      </fw-dialog>
    }
    @if (sendOpen()) {
      <fw-dialog title="Send invoice" subtitle="The invoice is emailed to the address below." (close)="sendOpen.set(false)">
        <div class="field"><label for="se">Recipient</label><input id="se" class="input" type="email" [(ngModel)]="sendTo" /></div>
        <ng-container foot><button class="btn" (click)="sendOpen.set(false)">Cancel</button><button class="btn btn-primary" [disabled]="!sendTo" (click)="send()">Send</button></ng-container>
      </fw-dialog>
    }
    @if (creditOpen()) {
      <fw-dialog title="Issue a credit note" subtitle="Reduces the balance without editing the issued invoice." (close)="creditOpen.set(false)">
        <div class="form-grid">
          <div class="field"><label for="ca">Amount</label><input id="ca" class="input" type="number" min="0.01" step="0.01" [(ngModel)]="credit.amount" />
            <span class="hint">Up to {{ inv().settlement.balance_cents | money: inv().currency }}</span></div>
          <div class="field"><label for="cr">Reason</label><input id="cr" class="input" [(ngModel)]="credit.reason" /></div>
        </div>
        @if (dialogError()) { <div class="form-error" style="margin-top: var(--space-3)">{{ dialogError() }}</div> }
        <ng-container foot><button class="btn" (click)="creditOpen.set(false)">Cancel</button><button class="btn btn-primary" [disabled]="!credit.amount || !credit.reason" (click)="creditNote()">Issue credit</button></ng-container>
      </fw-dialog>
    }
    @if (voidOpen()) {
      <fw-dialog title="Void this invoice?" subtitle="Its number stays used, its time is released for re-invoicing, and the void is audited." (close)="voidOpen.set(false)">
        <div class="field"><label for="vr">Reason</label><input id="vr" class="input" [(ngModel)]="voidReason" /></div>
        @if (dialogError()) { <div class="form-error" style="margin-top: var(--space-3)">{{ dialogError() }}</div> }
        <ng-container foot><button class="btn" (click)="voidOpen.set(false)">Cancel</button><button class="btn btn-primary" [disabled]="!voidReason" (click)="voidInvoice()">Void invoice</button></ng-container>
      </fw-dialog>
    }
  `,
})
export class InvoiceDetailPage implements OnInit {
  id = input.required<string>();
  session = inject(Session);
  private api = inject(Api);
  private toasts = inject(Toasts);
  private router = inject(Router);

  inv = signal<any>(null);
  error = signal('');
  busy = signal(false);
  timeOpen = signal(false);
  available = signal<any[]>([]);
  picked = signal(new Set<number>());
  confirmIssue = signal(false);
  sendOpen = signal(false);
  creditOpen = signal(false);
  voidOpen = signal(false);
  dialogError = signal('');
  sendTo = '';
  voidReason = '';
  credit: { amount: number | null; reason: string } = { amount: null, reason: '' };
  line: { description: string; quantity: number | null; price: number | null; kind: string } = { description: '', quantity: 1, price: null, kind: 'fixed_fee' };
  terms: any = {};

  snap = computed(() => {
    const i = this.inv();
    return i?.billing_snapshot ?? { client_name: i?.client?.name, billing_address: i?.client?.billing_address, tax_id: i?.client?.tax_id };
  });
  lines = computed(() => {
    const i = this.inv();
    return i?.status === 'draft' || !i?.billing_snapshot?.lines ? i?.items ?? [] : i.billing_snapshot.lines;
  });
  pickedMinutes = computed(() => this.available().filter((e) => this.picked().has(e.id)).reduce((a, e) => a + e.minutes, 0));
  pickedValue = computed(() => this.available().filter((e) => this.picked().has(e.id)).reduce((a, e) => a + Math.round((e.minutes * e.bill_rate_cents) / 60), 0));

  ngOnInit(): void { this.load(); }
  canManage(): boolean { return this.session.can('invoices.manage'); }
  qty(m: number): string { return (m / 1000).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

  async load(): Promise<void> {
    try {
      const i = await this.api.get<any>(`/invoices/${this.id()}`);
      this.inv.set(i);
      this.terms = { discount: i.discount_cents / 100 || null, tax: i.tax_rate_bp / 100, days: i.payment_terms_days, notes: i.notes };
    } catch (e) { this.error.set(apiError(e).message); }
  }
  private async run(fn: () => Promise<any>, ok?: string): Promise<boolean> {
    this.busy.set(true);
    this.dialogError.set('');
    try {
      const r = await fn();
      if (r && r.id) { this.inv.set(r); }
      if (ok) this.toasts.ok(ok);
      return true;
    } catch (e) {
      const { message, fields } = apiError(e);
      const msg = Object.values(fields)[0] ?? message;
      this.dialogError.set(msg);
      this.toasts.error(msg);
      return false;
    } finally { this.busy.set(false); }
  }

  async openTime(): Promise<void> {
    const i = this.inv();
    this.available.set(await this.api.get<any[]>('/time/uninvoiced', { client_id: i.client_id, project_id: i.project_id }));
    this.picked.set(new Set());
    this.timeOpen.set(true);
  }
  togglePick(id: number): void { const s = new Set(this.picked()); s.has(id) ? s.delete(id) : s.add(id); this.picked.set(s); }
  toggleAllTime(): void { this.picked.set(this.picked().size === this.available().length ? new Set() : new Set(this.available().map((e) => e.id))); }
  async addTime(): Promise<void> {
    if (await this.run(() => this.api.post(`/invoices/${this.id()}/time`, { time_entry_ids: [...this.picked()] }), 'Time added and reserved')) this.timeOpen.set(false);
  }
  async addLine(): Promise<void> {
    const l = this.line;
    if (await this.run(() => this.api.post(`/invoices/${this.id()}/lines`, { kind: l.kind, description: l.description, quantity: l.quantity, unit_price_cents: Math.round((l.price ?? 0) * 100) }))) {
      this.line = { description: '', quantity: 1, price: null, kind: 'fixed_fee' };
    }
  }
  removeLine(l: any): void { this.run(() => this.api.delete(`/invoices/${this.id()}/lines/${l.id}`)); }
  saveTerms(): void {
    const t = this.terms;
    this.run(() => this.api.patch(`/invoices/${this.id()}`, { discount_cents: Math.round((t.discount || 0) * 100), tax_rate_bp: Math.round((t.tax || 0) * 100), payment_terms_days: t.days, notes: t.notes || null }), 'Terms saved');
  }
  async issue(): Promise<void> { if (await this.run(() => this.api.post(`/invoices/${this.id()}/issue`), 'Invoice issued')) this.confirmIssue.set(false); }
  openSend(): void { const i = this.inv(); this.sendTo = i.client?.contacts?.find((c: any) => c.is_primary)?.email ?? i.client?.email ?? ''; this.sendOpen.set(true); }
  async send(): Promise<void> { if (await this.run(() => this.api.post(`/invoices/${this.id()}/deliver`, { email: this.sendTo }), `Sent to ${this.sendTo}`)) this.sendOpen.set(false); }
  async creditNote(): Promise<void> {
    if (await this.run(() => this.api.post(`/invoices/${this.id()}/credit-notes`, { amount_cents: Math.round((this.credit.amount ?? 0) * 100), reason: this.credit.reason }), 'Credit note issued')) {
      this.creditOpen.set(false);
      this.credit = { amount: null, reason: '' };
    }
  }
  async voidInvoice(): Promise<void> { if (await this.run(() => this.api.post(`/invoices/${this.id()}/void`, { reason: this.voidReason }), 'Invoice voided')) this.voidOpen.set(false); }
  async deleteDraft(): Promise<void> {
    if (!confirm('Delete this draft? Its reserved time becomes available again.')) return;
    await this.api.delete(`/invoices/${this.id()}`);
    this.router.navigate(['/invoices']);
  }
  print(): void { window.print(); }
}
