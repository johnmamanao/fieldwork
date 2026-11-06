import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, apiError } from '../core/api';
import { Session } from '../core/session';
import { Toasts } from '../core/toast';
import { FORMAT_PIPES } from '../core/format';
import { UI } from '../shared/ui';

const ROLES: Record<string, { label: string; text: string }> = {
  owner: { label: 'Owner', text: 'Full control, billing, integrations and ownership transfer.' },
  admin: { label: 'Administrator', text: 'Runs the workspace and operations; cannot transfer ownership.' },
  project_manager: { label: 'Project manager', text: 'Manages assigned projects, tasks, staffing and time approval.' },
  finance: { label: 'Finance', text: 'Client billing, invoices, payments, rates and financial reports.' },
  staff: { label: 'Staff member', text: 'Assigned work, own time, permitted conversations and profile.' },
  viewer: { label: 'Viewer', text: 'Read-only access to clients and non-financial analytics.' },
};

@Component({
  selector: 'fw-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ...FORMAT_PIPES, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Users</h1><p class="sub">Who can sign in to {{ session.workspace()?.name }} and what they can do.</p></div>
        <button class="btn btn-primary" (click)="inviteOpen.set(true)"><fw-icon name="mail" />Invite people</button>
      </div>
      <nav class="tabs">
        <button type="button" [class.active]="tab() === 'members'" (click)="tab.set('members')">Members <span class="count">{{ activeCount() }}</span></button>
        <button type="button" [class.active]="tab() === 'invitations'" (click)="tab.set('invitations')">Invitations <span class="count">{{ pendingInvites() }}</span></button>
        <button type="button" [class.active]="tab() === 'roles'" (click)="tab.set('roles')">Roles</button>
      </nav>

      @if (tab() === 'members') {
        <div class="panel"><div class="table-wrap"><table class="table">
          <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Joined</th><th></th></tr></thead>
          <tbody>@for (m of members(); track m.id) {
            <tr>
              <td><span class="row"><fw-avatar [name]="m.user.name" /><span><span style="display:block">{{ m.user.name }}@if (m.user.id === session.user()?.id) { <span class="faint"> (you)</span> }</span><span class="cell-sub">{{ m.user.email }}</span></span></span></td>
              <td>@if (canChange(m)) {
                  <select class="select sm" style="width: 170px" [attr.aria-label]="'Role for ' + m.user.name" [ngModel]="m.role" (ngModelChange)="pendingRole.set({ member: m, role: $event })">
                    @for (r of assignable(); track r) { <option [value]="r">{{ roles[r].label }}</option> }</select>
                } @else { {{ roles[m.role]?.label ?? m.role }} }</td>
              <td><fw-status [value]="m.status" /></td>
              <td class="tabular muted">{{ m.joined_at | day }}</td>
              <td class="num">
                @if (m.status === 'active' && m.role !== 'owner' && m.user.id !== session.user()?.id) { <button class="btn btn-sm btn-ghost btn-danger" (click)="revoking.set(m)">Revoke access</button> }
                @if (session.role() === 'owner' && m.status === 'active' && m.role !== 'owner') { <button class="btn btn-sm btn-ghost" (click)="transfer(m)">Make owner</button> }
              </td>
            </tr>
          }</tbody>
        </table></div></div>
      }

      @if (tab() === 'invitations') {
        <div class="panel">
          @if (invitations().length) {
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Email</th><th>Role</th><th>Invited by</th><th>Expires</th><th>State</th><th></th></tr></thead>
              <tbody>@for (i of invitations(); track i.id) {
                <tr><td>{{ i.email }}</td><td>{{ roles[i.role]?.label }}</td><td class="muted">{{ i.invited_by }}</td><td class="tabular">{{ i.expires_at | day }}</td><td><fw-status [value]="i.state" /></td>
                  <td class="num">@if (i.state === 'pending' || i.state === 'expired') { <button class="btn btn-sm" (click)="resend(i)">Resend</button> }
                    @if (i.state === 'pending') { <button class="btn btn-sm btn-ghost btn-danger" (click)="revokeInvite(i)">Revoke</button> }</td></tr>
              }</tbody>
            </table></div>
          } @else { <fw-empty icon="mail" title="No invitations" text="Invitations expire after 7 days and only work for the email they were sent to." /> }
        </div>
      }

      @if (tab() === 'roles') {
        <div class="grid grid-3">@for (r of roleKeys; track r) {
          <div class="panel panel-pad stack-2"><h2>{{ roles[r].label }}</h2><p class="small muted">{{ roles[r].text }}</p></div>
        }</div>
        <p class="small faint" style="margin-top: var(--space-4)">Access is deny-by-default and enforced by the API on every request. Hidden navigation is a convenience, not the control.</p>
      }
    </div>

    @if (inviteOpen()) {
      <fw-dialog title="Invite people" subtitle="They receive an email link to join the workspace." (close)="inviteOpen.set(false)">
        <div class="stack-4">
          <div class="field"><label for="ie">Email addresses</label><textarea id="ie" class="textarea" placeholder="one@studio.com, two@studio.com" [(ngModel)]="inviteEmails"></textarea></div>
          <div class="field"><label for="ir">Role</label><select id="ir" class="select" [(ngModel)]="inviteRole">@for (r of assignable(); track r) { <option [value]="r">{{ roles[r].label }}</option> }</select>
            <span class="hint">{{ roles[inviteRole].text }}</span></div>
          @if (error()) { <div class="form-error">{{ error() }}</div> }
        </div>
        <ng-container foot><button class="btn" (click)="inviteOpen.set(false)">Cancel</button><button class="btn btn-primary" [disabled]="!inviteEmails.trim()" (click)="invite()">Send invitations</button></ng-container>
      </fw-dialog>
    }
    @if (pendingRole(); as pr) {
      <fw-dialog title="Change role?" [subtitle]="pr.member.user.name + ' becomes ' + roles[pr.role].label + '.'" (close)="pendingRole.set(null); load()">
        <p class="small">{{ roles[pr.role].text }}</p>
        @if (pr.role === 'finance' || pr.member.role === 'finance') { <p class="small muted" style="margin-top: var(--space-2)">This changes access to rates, invoices and payments.</p> }
        <ng-container foot><button class="btn" (click)="pendingRole.set(null); load()">Cancel</button><button class="btn btn-primary" (click)="changeRole(pr)">Change role</button></ng-container>
      </fw-dialog>
    }
    @if (revoking(); as m) {
      <fw-dialog title="Revoke access?" [subtitle]="m.user.name + ' can no longer sign in to this workspace. Their tasks, messages, approvals and financial history stay.'" (close)="revoking.set(null)">
        <p class="small muted">Open browser sessions lose access on their next request, including exports, files and chat.</p>
        <ng-container foot><button class="btn" (click)="revoking.set(null)">Cancel</button><button class="btn btn-primary" (click)="revoke(m)">Revoke access</button></ng-container>
      </fw-dialog>
    }
  `,
})
export class UsersPage implements OnInit {
  session = inject(Session);
  private api = inject(Api);
  private toasts = inject(Toasts);
  roles = ROLES;
  roleKeys = Object.keys(ROLES);
  tab = signal<'members' | 'invitations' | 'roles'>('members');
  members = signal<any[]>([]);
  invitations = signal<any[]>([]);
  inviteOpen = signal(false);
  inviteEmails = '';
  inviteRole = 'staff';
  error = signal('');
  pendingRole = signal<{ member: any; role: string } | null>(null);
  revoking = signal<any>(null);

  ngOnInit(): void { this.load(); }
  activeCount(): number { return this.members().filter((m) => m.status === 'active').length; }
  pendingInvites(): number { return this.invitations().filter((i) => i.state === 'pending').length; }
  assignable(): string[] { return this.session.role() === 'owner' ? ['admin', 'project_manager', 'finance', 'staff', 'viewer'] : ['project_manager', 'finance', 'staff', 'viewer']; }
  canChange(m: any): boolean { return m.status === 'active' && m.role !== 'owner' && m.user.id !== this.session.user()?.id && (this.session.role() === 'owner' || m.role !== 'admin'); }

  async load(): Promise<void> {
    this.members.set(await this.api.get<any[]>('/members'));
    this.invitations.set(await this.api.get<any[]>('/invitations'));
  }
  async invite(): Promise<void> {
    this.error.set('');
    const emails = this.inviteEmails.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean);
    const failed: string[] = [];
    for (const email of emails) {
      try { await this.api.post('/invitations', { email, role: this.inviteRole }); } catch (e) { failed.push(`${email}: ${Object.values(apiError(e).fields)[0] ?? apiError(e).message}`); }
    }
    if (failed.length) { this.error.set(failed.join(' · ')); } else { this.inviteOpen.set(false); this.inviteEmails = ''; }
    if (emails.length > failed.length) this.toasts.ok(`Sent ${emails.length - failed.length} invitation${emails.length - failed.length === 1 ? '' : 's'}`);
    this.tab.set('invitations');
    this.load();
  }
  async changeRole(pr: { member: any; role: string }): Promise<void> {
    try { await this.api.patch(`/members/${pr.member.id}`, { role: pr.role }); this.toasts.ok('Role updated'); } catch (e) { this.toasts.error(Object.values(apiError(e).fields)[0] ?? apiError(e).message); }
    this.pendingRole.set(null);
    this.load();
  }
  async revoke(m: any): Promise<void> {
    try { await this.api.post(`/members/${m.id}/revoke`); this.toasts.ok(`Revoked access for ${m.user.name}`); } catch (e) { this.toasts.error(apiError(e).message); }
    this.revoking.set(null);
    this.load();
  }
  async transfer(m: any): Promise<void> {
    if (!confirm(`Transfer ownership to ${m.user.name}? You become an administrator.`)) return;
    try { await this.api.post(`/members/${m.id}/transfer-ownership`); location.reload(); } catch (e) { this.toasts.error(apiError(e).message); }
  }
  async resend(i: any): Promise<void> { await this.api.post(`/invitations/${i.id}/resend`); this.toasts.ok('Invitation sent again'); this.load(); }
  async revokeInvite(i: any): Promise<void> { await this.api.post(`/invitations/${i.id}/revoke`); this.load(); }
}
