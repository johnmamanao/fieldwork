import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Api } from '../core/api';
import { Toasts } from '../core/toast';
import { FORMAT_PIPES } from '../core/format';
import { UI } from '../shared/ui';

const ICON: Record<string, string> = { assignment: 'projects', mention: 'chat', comment: 'chat', approval: 'time', time: 'time', leave: 'calendar', invoice: 'invoices', payment: 'payments', milestone: 'calendar' };

@Component({
  selector: 'fw-notifications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ...FORMAT_PIPES, ...UI],
  styles: [`
    .n { display: flex; gap: var(--space-3); padding: var(--space-4) var(--space-5); border-bottom: var(--hairline) solid var(--color-border); cursor: pointer; text-align: left; width: 100%; background: none; border-left: 0; border-right: 0; border-top: 0; }
    .n:hover { background: var(--color-bg-hover); }
    .n.unread { background: var(--color-accent-subtle); }
    .n .ic { width: 32px; height: 32px; border-radius: var(--radius-md); background: var(--color-bg-sunken); display: inline-flex; align-items: center; justify-content: center; flex: none; }
    .pref { display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) var(--space-5); border-bottom: var(--hairline) solid var(--color-border); }
  `],
  template: `
    <div class="page" style="max-width: 880px">
      <div class="page-head"><div><h1>Notifications</h1><p class="sub">{{ unread() }} unread</p></div>
        @if (tab() === 'inbox' && unread()) { <button class="btn" (click)="readAll()"><fw-icon name="check" />Mark all read</button> }</div>
      <nav class="tabs">
        <button type="button" [class.active]="tab() === 'inbox'" (click)="setTab('inbox')">Inbox</button>
        <button type="button" [class.active]="tab() === 'preferences'" (click)="setTab('preferences')">Preferences</button>
      </nav>
      @if (tab() === 'inbox') {
        <div class="toolbar"><div class="seg" role="group" aria-label="Filter">
          <button type="button" [attr.aria-pressed]="filter === ''" (click)="filter = ''; load()">All</button>
          <button type="button" [attr.aria-pressed]="filter === 'unread'" (click)="filter = 'unread'; load()">Unread</button></div></div>
        <div class="panel" style="overflow: hidden">
          @for (n of items(); track n.id) {
            <button class="n" [class.unread]="!n.read_at" (click)="open(n)">
              <span class="ic"><fw-icon [name]="icon(n.category)" /></span>
              <span class="grow"><span style="display:block; font-weight: var(--weight-medium)">{{ n.title }}</span>
                @if (n.body) { <span class="small muted" style="display:block">{{ n.body }}</span> }
                <span class="small faint">{{ n.category | label }} · {{ n.created_at | ago }}</span></span>
              @if (!n.read_at) { <span class="badge info" data-seenry-dot>New</span> }
            </button>
          } @empty { <fw-empty icon="bell" title="You are all caught up" text="Assignments, mentions, time decisions, milestones and billing updates show up here." /> }
        </div>
      } @else if (prefs(); as p) {
        <div class="panel">
          <div class="pref"><span><span style="display:block; font-weight: var(--weight-medium)">Email delivery</span><span class="small muted">Also send notifications by email</span></span>
            <input type="checkbox" class="check" aria-label="Email delivery" [(ngModel)]="p.email_enabled" (change)="save()" /></div>
          @for (c of p.categories; track c) {
            <div class="pref"><span><span style="display:block; font-weight: var(--weight-medium)">{{ c | label }}</span><span class="small muted">{{ describe(c) }}</span></span>
              <input type="checkbox" [attr.aria-label]="'Notify me about ' + c" [checked]="!p.muted_categories.includes(c)" (change)="toggle(c)" /></div>
          }
        </div>
      }
    </div>
  `,
})
export class NotificationsPage implements OnInit {
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toasts = inject(Toasts);
  tab = signal<'inbox' | 'preferences'>('inbox');
  items = signal<any[]>([]);
  unread = signal(0);
  prefs = signal<any>(null);
  filter = '';

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('tab') === 'preferences') this.setTab('preferences');
    this.load();
  }
  icon(c: string): string { return ICON[c] ?? 'bell'; }
  describe(c: string): string {
    return ({ assignment: 'Added to a project or assigned a task', mention: 'Someone mentions you in chat', comment: 'Comments on your tasks', approval: 'Time waiting for your approval', time: 'Your time approved or returned',
      leave: 'Leave requests and decisions', invoice: 'Invoices issued or overdue', payment: 'Payments received', milestone: 'Milestones due soon' } as Record<string, string>)[c] ?? '';
  }
  setTab(t: 'inbox' | 'preferences'): void {
    this.tab.set(t);
    if (t === 'preferences') this.api.get('/notification-preferences').then((p) => this.prefs.set(p));
  }
  async load(): Promise<void> {
    const r = await this.api.get<any>('/notifications', { filter: this.filter });
    this.items.set(r.data);
    this.unread.set(r.unread);
  }
  async open(n: any): Promise<void> {
    if (!n.read_at) await this.api.post(`/notifications/${n.id}/read`);
    if (n.link) this.router.navigateByUrl(n.link); else this.load();
  }
  async readAll(): Promise<void> { await this.api.post('/notifications/read-all'); this.load(); }
  toggle(c: string): void {
    const p = this.prefs();
    p.muted_categories = p.muted_categories.includes(c) ? p.muted_categories.filter((x: string) => x !== c) : [...p.muted_categories, c];
    this.save();
  }
  async save(): Promise<void> {
    const p = this.prefs();
    this.prefs.set(await this.api.put('/notification-preferences', { muted_categories: p.muted_categories, email_enabled: p.email_enabled }));
    this.toasts.ok('Preferences saved');
  }
}
