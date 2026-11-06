import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api } from '../core/api';
import { Session } from '../core/session';
import { Toasts } from '../core/toast';
import { TimerState } from '../core/timer';
import { Icon } from '../shared/icon';
import { Avatar } from '../shared/ui';
import { formatDuration } from '../core/format';
import { QuickAction } from '../core/quick';
import { CountPop } from '../shared/motion';

interface NavItem { path: string; label: string; icon: string; perm?: string | string[]; badge?: () => number; }
interface NavGroup { label: string; items: NavItem[]; }

const SIDEBAR_KEY = 'fieldwork.sidebar';
function readPref(): 'rail' | 'full' | null {
  try { const v = localStorage.getItem(SIDEBAR_KEY); return v === 'rail' || v === 'full' ? v : null; } catch { return null; }
}

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Administrator', project_manager: 'Project manager', finance: 'Finance', staff: 'Staff member', viewer: 'Viewer' };

@Component({
  selector: 'fw-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Avatar, CountPop],
  host: { '[class.rail]': 'rail()', '(window:resize)': 'onResize($event)', '(document:keydown)': 'onKey($event)' },
  styles: [`
    /* Three layouts, driven by width (drag the window to see them change):
       ≥1200px full sidebar · 768–1199px icon rail · <768px top bar + bottom tab bar. */
    :host { display: grid; grid-template-columns: var(--sidebar-w) minmax(0, 1fr); min-height: 100vh; transition: grid-template-columns var(--dur-3) var(--ease-in-out); }
    aside { position: sticky; top: 0; height: 100vh; overflow-y: auto; overflow-x: hidden; padding: var(--space-4) var(--space-4) var(--space-3); display: flex; flex-direction: column; gap: var(--space-4); border-right: var(--hairline) solid var(--color-border); background: var(--color-bg-sidebar); }
    .ws { position: relative; padding-bottom: var(--space-4); border-bottom: var(--hairline) solid var(--color-border); }
    .ws-btn { width: 100%; display: flex; align-items: center; gap: var(--space-3); padding: var(--space-1); border-radius: var(--radius-md); border: 0; background: none; cursor: pointer; text-align: left; transition: background-color var(--dur-1) var(--ease-out); }
    .ws-btn:hover { background: var(--color-bg-selected); }
    .logo { width: 40px; height: 40px; border-radius: 28%; background: var(--color-ink); display: inline-flex; align-items: center; justify-content: center; flex: none; }
    .logo.sm { width: 34px; height: 34px; }
    .ws-name { display: block; font-weight: var(--weight-bold); font-size: var(--text-heading); line-height: var(--lh-heading); letter-spacing: var(--track-tight); }
    .ws-role { display: block; color: var(--color-text-tertiary); font-size: var(--text-micro); line-height: var(--lh-micro); }
    .ws .popover { left: 0; width: 260px; top: calc(100% - var(--space-2)); }
    nav { display: flex; flex-direction: column; gap: var(--space-4); }
    .group-label { padding: 0 var(--space-3); margin-bottom: var(--space-2); white-space: nowrap; }
    .nav-link { position: relative; display: flex; align-items: center; gap: var(--space-3); height: var(--control-md); padding: 0 var(--space-3); border-radius: var(--radius-md); color: var(--color-text-secondary); text-decoration: none; font-weight: var(--weight-medium); font-size: var(--text-body); white-space: nowrap; transition: background-color var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out); }
    .nav-link + .nav-link { margin-top: 2px; }
    .nav-link:hover { background: var(--color-bg-selected); color: var(--color-text); }
    .nav-link.active { background: var(--color-bg-selected); color: var(--color-text); font-weight: var(--weight-semibold); }
    .nav-link fw-icon { color: var(--color-text-tertiary); }
    .nav-link.active fw-icon { color: var(--color-text); }
    .nav-link .count { margin-left: auto; background: var(--color-bg-sunken); box-shadow: 0 0 0 1px var(--color-border); }
    .foot { margin-top: auto; display: flex; flex-direction: column; gap: var(--space-3); padding-top: var(--space-4); border-top: var(--hairline) solid var(--color-border); }
    .me { position: relative; display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-1) 0; }
    .me b { display: block; font-weight: var(--weight-semibold); font-size: var(--text-small); }
    .me-btn { border: 0; background: none; padding: 0; border-radius: var(--radius-full); cursor: pointer; display: inline-flex; }
    .me .popover { left: 0; width: 240px; bottom: calc(100% + var(--space-1)); }
    .main { min-width: 0; display: flex; flex-direction: column; }
    header { position: sticky; top: 0; z-index: 20; height: var(--topbar-h); display: flex; align-items: center; gap: var(--space-3); padding: 0 var(--space-6); background: color-mix(in oklch, var(--color-bg) 85%, transparent); backdrop-filter: blur(10px); }
    .crumb { display: inline-flex; align-items: center; gap: var(--space-2); height: 32px; padding: 0 var(--space-3); border-radius: var(--radius-md); background: var(--color-bg-surface); box-shadow: var(--shadow-ring); font-size: var(--text-small); color: var(--color-text-tertiary); white-space: nowrap; }
    .crumb b { color: var(--color-text); font-weight: var(--weight-semibold); }
    .m-brand, .m-quick, .tabbar { display: none; }
    .timer { display: inline-flex; align-items: center; gap: var(--space-2); height: var(--control-md); padding: 0 var(--space-1) 0 var(--space-3); border-radius: var(--radius-md); background: var(--color-bg-surface); box-shadow: var(--shadow-raised); font-size: var(--text-small); }
    .timer .dot { width: 8px; height: 8px; border-radius: var(--radius-full); background: var(--color-accent); }
    .bell { position: relative; }
    .bell .badge-count { position: absolute; top: -4px; right: -4px; }
    .verify { margin: 0 var(--space-6) var(--space-4); }

    /* ---- icon rail: tablet by default, or any width ≥768px when the toggle collapses the sidebar ---- */
    .rail-dot { display: none; }
    .ws { display: flex; align-items: center; gap: var(--space-1); }
    .ws-btn { flex: 1; min-width: 0; }
    .side-toggle { flex: none; color: var(--color-text-tertiary); }
    .side-toggle:hover { color: var(--color-text); }
    :host(.rail) { grid-template-columns: 76px minmax(0, 1fr); }
    :host(.rail) aside { padding: var(--space-4) var(--space-3) var(--space-3); align-items: center; }
    :host(.rail) .lbl, :host(.rail) .nav-link .count, :host(.rail) .ws-btn fw-icon { display: none !important; }
    :host(.rail) .ws { padding-bottom: var(--space-3); width: 100%; flex-direction: column; justify-content: center; gap: var(--space-2); }
    :host(.rail) .ws-btn { width: auto; flex: none; }
    :host(.rail) nav { gap: var(--space-3); width: 100%; align-items: center; }
    :host(.rail) nav > div { display: flex; flex-direction: column; align-items: center; gap: 2px; width: 100%; }
    :host(.rail) nav > div + div { padding-top: var(--space-3); border-top: var(--hairline) solid var(--color-border); }
    :host(.rail) .group-label { display: none; }
    :host(.rail) .nav-link { width: 44px; height: 44px; padding: 0; justify-content: center; }
    :host(.rail) .nav-link + .nav-link { margin-top: 0; }
    :host(.rail) .nav-link fw-icon { width: 18px; height: 18px; }
    :host(.rail) .rail-dot { display: block; position: absolute; top: 8px; right: 8px; width: 8px; height: 8px; border-radius: var(--radius-full); background: var(--color-accent); box-shadow: 0 0 0 2px var(--color-bg-sidebar); }
    :host(.rail) .foot { width: 100%; align-items: center; }
    :host(.rail) .me { padding: var(--space-1) 0 0; justify-content: center; }
    :host(.rail) .me .more { display: none; }
    @media (max-width: 1199px) { header { padding: 0 var(--space-5); } }

    /* ---- phone: top bar + bottom tabs; the sidebar becomes the "More" drawer ---- */
    @media (max-width: 767px) {
      :host { grid-template-columns: minmax(0, 1fr); }
      aside { position: fixed; z-index: 50; left: 0; top: 0; width: 300px; transform: translateX(-105%); transition: transform var(--dur-4) var(--ease-drawer); box-shadow: var(--shadow-overlay); }
      aside.open { transform: none; }
      .rail-dot, .side-toggle { display: none !important; }
      header { padding: 0 var(--space-4); height: 60px; }
      .crumb, .timer-label { display: none; }
      .m-brand { display: flex; align-items: center; gap: var(--space-2); min-width: 0; border: 0; background: none; padding: 0; text-align: left; cursor: pointer; }
      .m-brand b { display: block; font-size: var(--text-body); font-weight: var(--weight-bold); letter-spacing: var(--track-tight); }
      .m-quick { display: inline-flex; }
      .timer .t-project { display: none; }
      .main { padding-bottom: calc(72px + env(safe-area-inset-bottom)); }
      .tabbar { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; position: fixed; z-index: 30; left: 0; right: 0; bottom: 0; padding: var(--space-2) var(--space-2) calc(var(--space-2) + env(safe-area-inset-bottom)); background: color-mix(in oklch, var(--color-bg-surface) 92%, transparent); backdrop-filter: blur(12px); border-top: var(--hairline) solid var(--color-border); }
      .tab { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; height: 52px; border-radius: var(--radius-md); border: 0; background: none; color: var(--color-text-tertiary); font-size: var(--text-micro); font-weight: var(--weight-medium); text-decoration: none; cursor: pointer; }
      .tab fw-icon { width: 20px; height: 20px; }
      .tab.active { color: var(--color-text); }
      .tab.active .tab-icon { background: var(--color-ink); color: var(--color-on-ink); }
      .tab-icon { width: 40px; height: 28px; border-radius: var(--radius-full); display: inline-flex; align-items: center; justify-content: center; transition: background-color var(--dur-2) var(--ease-out), color var(--dur-2) var(--ease-out); }
      .tab-icon fw-icon { color: inherit; }
      .tab .badge-count { position: absolute; top: 2px; left: calc(50% + 6px); }
      .verify { margin: 0 var(--space-4) var(--space-4); }
    }
  `],
  template: `
    @if (menuOpen()) { <div class="scrim" style="z-index:45" (click)="menuOpen.set(false)"></div> }
    <aside [class.open]="menuOpen()" aria-label="Main navigation">
      <div class="ws">
        <button class="ws-btn" type="button" (click)="wsOpen.set(!wsOpen())" [attr.aria-expanded]="wsOpen()" aria-haspopup="menu" [attr.aria-label]="'Workspace ' + session.workspace()?.name" [attr.title]="session.workspace()?.name">
          <span class="logo"><svg width="100%" height="100%" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 24V14a6 6 0 0 1 6-6h10" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M14 24v-4a4 4 0 0 1 4-4h6" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="22.5" cy="22.5" r="2.6" fill="#f0512a"/></svg></span>
          <span class="grow lbl" style="min-width: 0">
            <span class="ws-name truncate">{{ session.workspace()?.name }}</span>
            <span class="ws-role">{{ roleLabel() }} · {{ session.workspace()?.currency }}</span>
          </span>
        </button>
        <button class="btn btn-ghost btn-icon btn-sm side-toggle" type="button" (click)="toggleSidebar()" [attr.aria-label]="rail() ? 'Expand sidebar' : 'Collapse sidebar'" [attr.title]="(rail() ? 'Expand sidebar' : 'Collapse sidebar') + ' ([)'" [attr.aria-expanded]="!rail()"><fw-icon [name]="rail() ? 'sidebarOpen' : 'sidebar'" /></button>
        @if (wsOpen()) {
          <div class="popover" role="menu">
            <div style="padding: var(--space-2) var(--space-3)"><b class="small" style="display:block">{{ session.workspace()?.name }}</b><span class="cell-sub">{{ roleLabel() }} · {{ session.workspace()?.currency }}</span></div>
            @for (w of session.workspaces(); track w.id) {
              @if (w.id !== session.workspace()?.id) {
                <button class="menu-item" role="menuitem" (click)="switchWorkspace(w.id)">
                  <fw-icon name="switch" /><span class="grow"><span style="display:block; font-weight: var(--weight-medium)">Switch to {{ w.name }}</span><span class="cell-sub">{{ role(w.role) }} · {{ w.currency }}</span></span>
                </button>
              }
            }
          </div>
        }
      </div>

      <nav>
        @for (g of visibleNav(); track g.label) {
          <div>
            <div class="group-label caps">{{ g.label }}</div>
            @for (item of g.items; track item.path) {
              <a class="nav-link" [routerLink]="item.path" routerLinkActive="active" (click)="menuOpen.set(false)" [attr.title]="item.label" [attr.aria-label]="item.label">
                <fw-icon [name]="item.icon" /><span class="lbl">{{ item.label }}</span>
                @if (item.badge && item.badge() > 0) { <span class="count">{{ item.badge() }}</span><span class="rail-dot" aria-hidden="true"></span> }
              </a>
            }
          </div>
        }
      </nav>

      <div class="foot">
        @if (session.can('workspace.settings')) {
          <a class="nav-link" routerLink="/settings" routerLinkActive="active" (click)="menuOpen.set(false)" title="Settings" aria-label="Settings"><fw-icon name="settings" /><span class="lbl">Settings</span></a>
        }
        <div class="me">
          <button class="me-btn" type="button" aria-label="Account menu" [attr.aria-expanded]="userOpen()" aria-haspopup="menu" (click)="userOpen.set(!userOpen())"><fw-avatar [name]="session.user()?.name" /></button>
          <span class="grow lbl" style="min-width: 0"><b class="truncate">{{ session.user()?.name }}</b><span class="cell-sub truncate" style="display:block">{{ session.user()?.email }}</span></span>
          <button class="btn btn-ghost btn-icon btn-sm more lbl" type="button" aria-label="Account menu" (click)="userOpen.set(!userOpen())"><fw-icon name="more" /></button>
          @if (userOpen()) {
            <div class="popover" role="menu" (click)="userOpen.set(false)">
              <div style="padding: var(--space-2) var(--space-3)"><b class="small" style="display:block">{{ session.user()?.name }}</b><span class="cell-sub">{{ session.user()?.email }}</span></div>
              <a class="menu-item" routerLink="/profile" role="menuitem"><fw-icon name="users" />Profile and password</a>
              <a class="menu-item" routerLink="/notifications" [queryParams]="{ tab: 'preferences' }" role="menuitem"><fw-icon name="bell" />Notification preferences</a>
              <button class="menu-item" role="menuitem" (click)="logout()"><fw-icon name="logout" />Sign out</button>
            </div>
          }
        </div>
      </div>
    </aside>

    <div class="main">
      <header>
        <button class="m-brand" type="button" (click)="menuOpen.set(true)" aria-label="Open navigation">
          <span class="logo sm"><svg width="100%" height="100%" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 24V14a6 6 0 0 1 6-6h10" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round"/><path d="M14 24v-4a4 4 0 0 1 4-4h6" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="22.5" cy="22.5" r="2.6" fill="#f0512a"/></svg></span>
          <span style="min-width: 0"><b class="truncate">{{ session.workspace()?.name }}</b><span class="cell-sub">{{ roleLabel() }}</span></span>
        </button>
        <span class="crumb" aria-label="Breadcrumb">{{ crumb().group }} <span aria-hidden="true">/</span> <b>{{ crumb().label }}</b></span>
        <div class="grow"></div>
        @if (session.can('time.own')) {
          @if (timer.running(); as t) {
            <div class="timer" role="timer" aria-live="off">
              <span class="dot" data-seenry-dot></span>
              <span class="truncate t-project" style="max-width: 180px">{{ t.project?.name }}</span>
              <b class="tabular">{{ timer.elapsedText() }}</b>
              <button class="btn btn-sm btn-primary" type="button" (click)="stopTimer()" aria-label="Stop timer"><fw-icon name="stop" /><span class="timer-label">Stop</span></button>
            </div>
          } @else {
            <a class="btn" routerLink="/time" aria-label="Start timer"><fw-icon name="play" /><span class="timer-label">Start timer</span></a>
          }
        }
        <a class="btn btn-icon btn-round bell" routerLink="/notifications" [attr.aria-label]="'Notifications, ' + unread() + ' unread'">
          <fw-icon name="bell" />
          @if (unread() > 0) { <span class="badge-count" data-seenry-dot>{{ unread() > 99 ? '99+' : unread() }}</span> }
        </a>
        @if (pageQuick.current(); as pq) { <button class="btn btn-primary btn-icon btn-round m-quick" type="button" [attr.aria-label]="pq.label" [attr.title]="pq.label" (click)="pq.run()"><fw-icon name="plus" /></button> }
        @else if (quick(); as q) { <a class="btn btn-primary btn-icon btn-round m-quick" [routerLink]="q.path" [queryParams]="q.params" [attr.aria-label]="q.label" [attr.title]="q.label"><fw-icon name="plus" /></a> }
      </header>
      @if (session.user() && !session.user()!.email_verified) {
        <div class="alert info verify"><fw-icon name="mail" /><span class="grow">Confirm your email address to secure your account.</span><button class="btn btn-sm" (click)="resend()">Resend email</button></div>
      }
      <main id="main"><router-outlet /></main>
    </div>

    <nav class="tabbar" aria-label="Sections">
      @for (t of tabs(); track t.path) {
        <a class="tab" [routerLink]="t.path" routerLinkActive="active" [attr.aria-label]="t.label">
          <span class="tab-icon"><fw-icon [name]="t.icon" /></span>{{ t.label }}
          @if (t.badge && t.badge() > 0) { <span class="badge-count">{{ t.badge() }}</span> }
        </a>
      }
      <button class="tab" type="button" (click)="menuOpen.set(true)" aria-label="More sections"><span class="tab-icon"><fw-icon name="menu" /></span>More</button>
    </nav>
  `,
})
export class Shell {
  /** Bottom tabs on phone: the four sections this role uses most; the rest live under More. */
  tabs = computed(() => {
    const all = this.visibleNav().flatMap((g) => g.items);
    const pick = (paths: string[]) => paths.map((p) => all.find((i) => i.path === p)).filter((i): i is NavItem => !!i);
    const preferred = this.session.can('finance.view')
      ? ['/overview', '/invoices', '/payments', '/projects']
      : ['/overview', '/projects', '/time', '/chat'];
    const chosen = pick(preferred);
    for (const i of all) if (chosen.length < 4 && !chosen.includes(i)) chosen.push(i);
    return chosen.slice(0, 4);
  });

  pageQuick = inject(QuickAction);

  /** Fallback for the round "+" when the page registers none: the role's most common create action. */
  quick = computed(() => {
    if (this.session.can('invoices.manage')) return { path: '/invoices', params: { new: 1 }, label: 'New invoice' };
    if (this.session.can('projects.manage')) return { path: '/projects', params: { new: 1 }, label: 'New project' };
    if (this.session.can('time.own')) return { path: '/time', params: {}, label: 'Log time' };
    return null;
  });

  session = inject(Session);
  timer = inject(TimerState);
  private api = inject(Api);
  private router = inject(Router);
  private toasts = inject(Toasts);

  menuOpen = signal(false);

  /** Viewport width and the saved sidebar choice ('rail' | 'full', or none = follow the width). */
  width = signal(typeof innerWidth === 'number' ? innerWidth : 1440);
  private sidebarPref = signal<'rail' | 'full' | null>(readPref());
  /** Icon rail at ≥768px: tablet by default, or whenever the toggle says so. */
  rail = computed(() => {
    const w = this.width();
    if (w < 768) return false;
    const pref = this.sidebarPref();
    return pref ? pref === 'rail' : w < 1200;
  });

  onResize(e: Event): void { this.width.set((e.target as Window).innerWidth); }

  toggleSidebar(): void {
    const next = this.rail() ? 'full' : 'rail';
    this.sidebarPref.set(next);
    try { localStorage.setItem(SIDEBAR_KEY, next); } catch { /* storage unavailable */ }
    this.wsOpen.set(false);
    this.userOpen.set(false);
  }

  /** "[" toggles the sidebar, as in Linear and Notion; ignored while typing. */
  onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return;
    if (this.width() < 768) { this.menuOpen.set(!this.menuOpen()); return; }
    e.preventDefault();
    this.toggleSidebar();
  }
  wsOpen = signal(false);
  userOpen = signal(false);
  unread = signal(0);
  pendingApprovals = signal(0);
  private url = signal(this.router.url);

  private nav: NavGroup[] = [
    { label: 'Workspace', items: [
      { path: '/overview', label: 'Overview', icon: 'overview' },
      { path: '/projects', label: 'Projects', icon: 'projects' },
      { path: '/time', label: 'Time', icon: 'time', perm: ['time.own', 'time.approve'], badge: () => this.pendingApprovals() },
      { path: '/analytics', label: 'Analytics', icon: 'analytics', perm: 'analytics.view' },
      { path: '/reports', label: 'Reports', icon: 'reports', perm: 'reports.view' },
      { path: '/chat', label: 'Chat', icon: 'chat', perm: 'chat.use' },
    ] },
    { label: 'Finance', items: [
      { path: '/clients', label: 'Clients', icon: 'clients', perm: 'clients.view' },
      { path: '/invoices', label: 'Invoices', icon: 'invoices', perm: 'finance.view' },
      { path: '/payments', label: 'Payments', icon: 'payments', perm: 'finance.view' },
      { path: '/cards', label: 'Cards', icon: 'cards', perm: 'finance.view' },
    ] },
    { label: 'People', items: [
      { path: '/users', label: 'Users', icon: 'users', perm: 'users.manage' },
      { path: '/staff', label: 'Staff', icon: 'staff', perm: 'staff.view' },
    ] },
    { label: 'Account', items: [
      { path: '/notifications', label: 'Notifications', icon: 'bell', badge: () => this.unread() },
      { path: '/audit', label: 'Audit log', icon: 'audit', perm: 'audit.view' },
    ] },
  ];

  visibleNav = computed(() => {
    this.session.permissions();
    return this.nav
      .map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || (Array.isArray(i.perm) ? i.perm.some((p) => this.session.can(p)) : this.session.can(i.perm))) }))
      .filter((g) => g.items.length > 0);
  });

  crumb = computed(() => {
    const path = this.url().split('?')[0];
    if (path.startsWith('/settings')) return { group: 'Workspace', label: 'Settings' };
    for (const g of this.nav) for (const i of g.items) if (path === i.path || path.startsWith(i.path + '/')) return { group: g.label, label: i.label };
    return { group: 'Workspace', label: 'Overview' };
  });

  roleLabel = computed(() => ROLE_LABEL[this.session.role() ?? ''] ?? '');
  role(r: string): string { return ROLE_LABEL[r] ?? r; }

  constructor() {
    this.refreshCounts();
    this.timer.load();
    const id = setInterval(() => this.refreshCounts(), 30000);
    inject(DestroyRef).onDestroy(() => clearInterval(id));
    // Stops with the shell: a leftover subscription would keep calling the API after sign-out and bounce
    // a signed-out visitor to "session ended".
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe((e) => { this.url.set((e as NavigationEnd).urlAfterRedirects); this.wsOpen.set(false); this.refreshCounts(); });
  }

  async refreshCounts(): Promise<void> {
    if (!this.session.token()) return;
    try {
      const n = await this.api.get<{ unread: number }>('/notifications', { filter: 'unread' });
      this.unread.set(n.unread);
      if (this.session.can('time.approve')) this.pendingApprovals.set((await this.api.get<unknown[]>('/approvals')).length);
    } catch { /* counts are best effort */ }
  }

  switchWorkspace(id: number): void {
    this.session.selectWorkspace(id);
    this.wsOpen.set(false);
    this.router.navigateByUrl('/overview').then(() => location.reload());
  }

  async stopTimer(): Promise<void> {
    try {
      const res = await this.timer.stop();
      this.toasts.ok(`Logged ${formatDuration(res.entry.minutes)} to ${res.entry.project?.name}`);
    } catch { this.toasts.error('Could not stop the timer.'); }
  }

  async resend(): Promise<void> {
    await this.api.post('/auth/resend-verification');
    this.toasts.ok('Verification email sent. Check your inbox.');
  }

  async logout(): Promise<void> {
    try { await this.api.post('/auth/logout'); } catch { /* already expired */ }
    this.session.clear();
    this.router.navigate(['/login']);
  }
}
