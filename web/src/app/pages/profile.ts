import { ChangeDetectionStrategy, Component, WritableSignal, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, apiError } from '../core/api';
import { Profile, Session } from '../core/session';
import { Toasts } from '../core/toast';
import { UI } from '../shared/ui';
import { PasswordField } from './auth';

@Component({
  selector: 'fw-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PasswordField, ...UI],
  styles: [`
    .row-set { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: var(--space-5); padding: var(--space-5); border-bottom: var(--hairline) solid var(--color-border); }
    .row-set:last-of-type { border-bottom: 0; }
    .row-set h3 { font-size: var(--text-body); }
    .stack { display: grid; gap: var(--space-4); max-width: 420px; }
    .foot { display: flex; justify-content: flex-end; gap: var(--space-2); padding: var(--space-4) var(--space-5); border-top: var(--hairline) solid var(--color-border); background: var(--color-bg); border-radius: 0 0 var(--radius-lg) var(--radius-lg); }
    .who { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-5); border-bottom: var(--hairline) solid var(--color-border); }
    .who h2 { font-size: var(--text-heading); }
    .roles { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .saved { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--color-positive); font-size: var(--text-small); font-weight: 600; animation: pop-in var(--dur-2) var(--ease-out) both; }
    @media (max-width: 860px) { .row-set { grid-template-columns: minmax(0, 1fr); gap: var(--space-3); } }
    @media (prefers-reduced-motion: reduce) { .saved { animation: none; } }
  `],
  template: `
    <div class="page" style="max-width: 1040px">
      <div class="page-head"><div><h1>Profile</h1><p class="sub">Your name, sign-in details and workspace roles.</p></div></div>

      <form class="panel" style="margin-bottom: var(--space-5)" (ngSubmit)="saveName()" [class.shake]="shakeName()">
        <div class="who">
          <fw-avatar [name]="name || session.user()?.name" size="lg" />
          <div style="min-width: 0"><h2 class="truncate">{{ name || session.user()?.name }}</h2><span class="muted small">{{ session.user()?.email }}</span></div>
        </div>
        <div class="row-set"><div><h3>Display name</h3><p class="small muted">Shown on timesheets, chat and approvals.</p></div>
          <div class="field" style="max-width: 420px"><input class="input" name="name" aria-label="Display name" autocomplete="name" [(ngModel)]="name" />
            @if (nameError()) { <span class="error">{{ nameError() }}</span> }</div></div>
        <div class="row-set"><div><h3>Workspaces</h3><p class="small muted">Roles are managed by each workspace's administrators.</p></div>
          <div class="roles">@for (w of session.workspaces(); track w.id) { <span class="chip"><b>{{ w.name }}</b>&nbsp;·&nbsp;{{ roleLabel(w.role) }}</span> }</div></div>
        <div class="foot">
          @if (nameSaved()) { <span class="saved" style="margin-right: auto"><fw-icon name="check" />Saved</span> }
          <button class="btn btn-primary" type="submit" [disabled]="savingName() || !nameChanged()">@if (savingName()) { <span class="spinner" aria-hidden="true"></span> }Save name</button>
        </div>
      </form>

      <form class="panel" (ngSubmit)="changePassword()" [class.shake]="shakePw()">
        <div class="row-set"><div><h3>Password</h3><p class="small muted">Changing it signs out your other devices.</p></div>
          <div class="stack">
            <div class="field"><label for="cur">Current password</label><fw-password inputId="cur" [(value)]="current" [invalid]="!!pwErrors().current_password" />
              @if (pwErrors().current_password) { <span class="error">{{ pwErrors().current_password }}</span> }</div>
            <div class="field"><label for="new">New password</label><fw-password inputId="new" autocomplete="new-password" [meter]="true" [(value)]="next" [invalid]="!!pwErrors().password" />
              @if (pwErrors().password) { <span class="error">{{ pwErrors().password }}</span> }</div>
          </div></div>
        <div class="foot">
          <button class="btn btn-primary" type="submit" [disabled]="savingPw() || !current || next.length < 10">@if (savingPw()) { <span class="spinner" aria-hidden="true"></span> }Update password</button>
        </div>
      </form>
    </div>
  `,
})
export class ProfilePage {
  session = inject(Session);
  private api = inject(Api);
  private toasts = inject(Toasts);
  name = this.session.user()?.name ?? '';
  current = '';
  next = '';
  savingName = signal(false);
  savingPw = signal(false);
  nameSaved = signal(false);
  nameError = signal('');
  pwErrors = signal<Record<string, string>>({});
  shakeName = signal(false);
  shakePw = signal(false);
  private savedName = signal(this.name);
  nameChanged = () => this.name.trim() !== this.savedName() && !!this.name.trim();

  roleLabel(r: string): string { return ({ project_manager: 'Project manager', admin: 'Administrator' } as Record<string, string>)[r] ?? r.charAt(0).toUpperCase() + r.slice(1); }

  private shake(s: WritableSignal<boolean>): void {
    s.set(false);
    requestAnimationFrame(() => { s.set(true); setTimeout(() => s.set(false), 320); });
  }

  async saveName(): Promise<void> {
    this.savingName.set(true);
    this.nameError.set('');
    try {
      const p = await this.api.patch<Profile>('/auth/me', { name: this.name.trim() });
      this.session.setProfile(p);
      this.savedName.set(p.user.name);
      this.nameSaved.set(true);
      setTimeout(() => this.nameSaved.set(false), 2400);
    } catch (e) {
      const { message, fields } = apiError(e);
      this.nameError.set(fields['name'] ?? message);
      this.shake(this.shakeName);
    } finally {
      this.savingName.set(false);
    }
  }

  async changePassword(): Promise<void> {
    this.savingPw.set(true);
    this.pwErrors.set({});
    try {
      const r = await this.api.post<{ message: string }>('/auth/password', { current_password: this.current, password: this.next });
      this.current = '';
      this.next = '';
      this.toasts.ok(r.message);
    } catch (e) {
      const { message, fields } = apiError(e);
      this.pwErrors.set(Object.keys(fields).length ? fields : { password: message });
      this.shake(this.shakePw);
    } finally {
      this.savingPw.set(false);
    }
  }
}
