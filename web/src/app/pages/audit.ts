import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../core/api';
import { FORMAT_PIPES } from '../core/format';
import { UI } from '../shared/ui';

@Component({
  selector: 'fw-audit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ...FORMAT_PIPES, ...UI],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Audit log</h1><p class="sub">Sensitive changes, read-only. Secrets, card data and private message content are never recorded.</p></div></div>
      <div class="toolbar">
        <input class="input search" type="search" placeholder="Search summaries" aria-label="Search audit log" [(ngModel)]="q" (input)="page = 1; load()" />
        <select class="select" style="width: 180px" aria-label="Area" [(ngModel)]="action" (change)="page = 1; load()"><option value="">All areas</option>
          @for (a of areas; track a.key) { <option [value]="a.key">{{ a.label }}</option> }</select>
      </div>
      <div class="panel">
        <div class="table-wrap"><table class="table">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Summary</th></tr></thead>
          <tbody>@for (e of rows(); track e.id) {
            <tr><td class="tabular small" style="white-space: nowrap">{{ e.created_at | day }} <span class="faint">{{ time(e.created_at) }}</span></td><td>{{ e.actor?.name || 'System' }}</td>
              <td><span class="badge">{{ e.action }}</span></td><td>{{ e.summary }}</td></tr>
          } @empty { <tr><td colspan="4" class="muted">No audit events match.</td></tr> }</tbody>
        </table></div>
        <div class="spread panel-body" style="border-top: var(--hairline) solid var(--color-border)">
          <span class="small muted">Page {{ meta().current_page }} of {{ meta().last_page }} · {{ meta().total }} events</span>
          <div class="row"><button class="btn btn-sm" [disabled]="page <= 1" (click)="page = page - 1; load()">Previous</button><button class="btn btn-sm" [disabled]="page >= meta().last_page" (click)="page = page + 1; load()">Next</button></div>
        </div>
      </div>
    </div>
  `,
})
export class AuditPage implements OnInit {
  private api = inject(Api);
  areas = [{ key: 'member', label: 'Members and roles' }, { key: 'invoice', label: 'Invoices' }, { key: 'payment', label: 'Payments' }, { key: 'time', label: 'Time approvals' }, { key: 'rate', label: 'Rates' }, { key: 'leave', label: 'Leave' }, { key: 'settings', label: 'Settings' }, { key: 'workspace', label: 'Workspace' }];
  rows = signal<any[]>([]);
  meta = signal<any>({ current_page: 1, last_page: 1, total: 0 });
  q = '';
  action = '';
  page = 1;
  ngOnInit(): void { this.load(); }
  time(iso: string): string { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  async load(): Promise<void> {
    const r = await this.api.get<any>('/audit', { q: this.q, action: this.action, page: this.page });
    this.rows.set(r.data);
    this.meta.set(r);
  }
}
