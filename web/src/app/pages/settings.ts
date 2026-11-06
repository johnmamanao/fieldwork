import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api, apiError } from '../core/api';
import { Toasts } from '../core/toast';
import { FORMAT_PIPES } from '../core/format';
import { UI } from '../shared/ui';

@Component({
  selector: 'fw-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ...FORMAT_PIPES, ...UI],
  styles: [`
    .row-set { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: var(--space-5); padding: var(--space-5); border-bottom: var(--hairline) solid var(--color-border); }
    .row-set:last-child { border-bottom: 0; }
    .row-set h3 { font-size: var(--text-body); }
    .days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--space-2); }
    .days label { font-size: var(--text-small); color: var(--color-text-secondary); }
    @media (max-width: 860px) { .row-set { grid-template-columns: minmax(0, 1fr); } .days { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
  `],
  template: `
    <div class="page" style="max-width: 1040px">
      <div class="page-head"><div><h1>Settings</h1><p class="sub">Workspace rules that every module uses.</p></div>
        @if (d()?.can_edit) { <button class="btn btn-primary" (click)="save()" [disabled]="saving()">Save changes</button> }</div>
      <nav class="tabs">
        @for (t of tabs; track t.key) { <button type="button" [class.active]="tab() === t.key" (click)="tab.set(t.key)">{{ t.label }}</button> }
      </nav>
      @if (error()) { <div class="alert danger" style="margin-bottom: var(--space-4)">{{ error() }}</div> }
      @if (d(); as d) {
        @switch (tab()) {
          @case ('general') {
            <div class="panel">
              <div class="row-set"><div><h3>Workspace name</h3><p class="small muted">Shown on invoices and emails.</p></div><input class="input" aria-label="Workspace name" [(ngModel)]="f.name" /></div>
              <div class="row-set"><div><h3>Timezone</h3><p class="small muted">Sets period boundaries for analytics and timesheets.</p></div>
                <select class="select" aria-label="Timezone" [(ngModel)]="f.timezone">@for (z of zones; track z) { <option [value]="z">{{ z }}</option> }</select></div>
              <div class="row-set"><div><h3>Base currency</h3><p class="small muted">Locked once invoices exist; currencies are never summed together.</p></div>
                <select class="select" aria-label="Currency" [(ngModel)]="f.currency">@for (c of ['USD','EUR','GBP','CAD','AUD']; track c) { <option [value]="c">{{ c }}</option> }</select></div>
              <div class="row-set"><div><h3>Week starts on</h3><p class="small muted">Timesheets and capacity weeks.</p></div>
                <div class="seg" role="group" aria-label="Week start"><button type="button" [attr.aria-pressed]="f.week_start === 1" (click)="f.week_start = 1">Monday</button><button type="button" [attr.aria-pressed]="f.week_start === 7" (click)="f.week_start = 7">Sunday</button></div></div>
              <div class="row-set"><div><h3>Brand colour</h3><p class="small muted">Used on documents.</p></div><input class="input" style="width: 160px" aria-label="Brand colour" [(ngModel)]="f.brand_color" placeholder="#B4532A" /></div>
            </div>
          }
          @case ('schedule') {
            <div class="panel">
              <div class="row-set"><div><h3>Default working schedule</h3><p class="small muted">Hours per day for staff without a personal schedule. Capacity = schedule − holidays − approved leave.</p></div>
                <div class="days">@for (day of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']; track day; let i = $index) {
                  <div class="field"><label [for]="'d' + i">{{ day }}</label><input class="input" type="number" min="0" max="24" step="0.5" [id]="'d' + i" [(ngModel)]="hours[i]" /></div>
                }</div></div>
              <div class="row-set"><div><h3>Holidays</h3><p class="small muted">Managed with staff capacity.</p></div><a class="btn" routerLink="/staff" [queryParams]="{ tab: 'holidays' }" style="justify-self: start">Edit holidays</a></div>
            </div>
          }
          @case ('billing') {
            <div class="panel">
              <div class="row-set"><div><h3>Invoice numbering</h3><p class="small muted">Numbers are assigned when an invoice is issued. Next: {{ f.invoice_prefix }}{{ pad(d.workspace.invoice_next_number) }}</p></div>
                <input class="input" style="width: 160px" aria-label="Invoice prefix" [(ngModel)]="f.invoice_prefix" /></div>
              <div class="row-set"><div><h3>Payment terms</h3><p class="small muted">Default days until due for new drafts.</p></div><input class="input" style="width: 160px" type="number" min="0" aria-label="Payment terms" [(ngModel)]="f.payment_terms_days" /></div>
              <div class="row-set"><div><h3>Tax rate</h3><p class="small muted">Default for new drafts, as a percentage.</p></div><input class="input" style="width: 160px" type="number" min="0" step="0.01" aria-label="Tax rate" [(ngModel)]="taxPercent" /></div>
            </div>
          }
          @case ('integrations') {
            <div class="panel">
              @for (k of keys(d.integrations ?? {}); track k) {
                <div class="row-set"><div><h3>{{ d.integrations[k].label || (k | label) }}</h3>
                  @if (d.integrations[k].url) { <p class="small muted">Signed with HMAC-SHA256 in the X-Fieldwork-Signature header. Duplicate events are ignored.</p> }</div>
                  <div class="stack-2"><fw-status [value]="d.integrations[k].status === 'configured' ? 'active' : 'pending'" [override]="d.integrations[k].status === 'configured' ? 'Configured' : 'Not configured'" />
                    @if (d.integrations[k].url) { <code class="small" style="word-break: break-all">{{ d.integrations[k].url }}</code> }</div></div>
              }
              <div class="row-set"><div><h3>Secrets</h3></div><p class="small muted">Provider keys and webhook secrets are read from the deployment environment, never stored in the database or shown here.</p></div>
            </div>
          }
          @case ('retention') {
            <div class="panel">
              <div class="row-set"><div><h3>File retention</h3><p class="small muted">Days to keep project and chat files after a project is archived.</p></div><input class="input" style="width: 160px" type="number" min="30" aria-label="File retention days" [(ngModel)]="f.file_retention_days" /></div>
              <div class="row-set"><div><h3>Notification defaults</h3><p class="small muted">Each person can change their own preferences.</p></div><a class="btn" routerLink="/notifications" [queryParams]="{ tab: 'preferences' }" style="justify-self: start">Your preferences</a></div>
            </div>
          }
        }
      }
    </div>
  `,
})
export class SettingsPage implements OnInit {
  private api = inject(Api);
  private toasts = inject(Toasts);
  private route = inject(ActivatedRoute);
  tabs = [{ key: 'general', label: 'General' }, { key: 'schedule', label: 'Schedule' }, { key: 'billing', label: 'Billing' }, { key: 'integrations', label: 'Integrations' }, { key: 'retention', label: 'Retention' }];
  tab = signal(this.route.snapshot.queryParamMap.get('tab') ?? 'general');
  d = signal<any>(null);
  f: any = {};
  hours: number[] = [];
  taxPercent = 0;
  saving = signal(false);
  error = signal('');
  zones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Europe/Lisbon', 'Asia/Singapore', 'Australia/Sydney', 'UTC'];

  ngOnInit(): void { this.load(); }
  keys(o: any): string[] { return Object.keys(o); }
  pad(n: number): string { return String(n).padStart(4, '0'); }
  async load(): Promise<void> {
    const d = await this.api.get<any>('/settings');
    this.d.set(d);
    this.f = { ...d.workspace };
    if (!this.zones.includes(this.f.timezone)) this.zones.unshift(this.f.timezone);
    this.hours = (d.workspace.default_schedule ?? []).map((m: number) => m / 60);
    this.taxPercent = (d.workspace.tax_rate_bp ?? 0) / 100;
  }
  async save(): Promise<void> {
    this.saving.set(true);
    this.error.set('');
    const f = this.f;
    try {
      await this.api.patch('/settings', {
        name: f.name, timezone: f.timezone, currency: f.currency, week_start: f.week_start, brand_color: f.brand_color || null,
        default_schedule: this.hours.map((h) => Math.round(Number(h) * 60)), invoice_prefix: f.invoice_prefix, payment_terms_days: Number(f.payment_terms_days),
        tax_rate_bp: Math.round(Number(this.taxPercent) * 100), file_retention_days: Number(f.file_retention_days),
      });
      this.toasts.ok('Settings saved');
      this.load();
    } catch (e) { const { message, fields } = apiError(e); this.error.set(Object.values(fields)[0] ?? message); }
    finally { this.saving.set(false); }
  }
}
