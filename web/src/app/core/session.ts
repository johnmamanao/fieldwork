import { Injectable, computed, signal } from '@angular/core';

export interface WorkspaceSummary {
  id: number;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  week_start: number;
  role: string;
  permissions: string[];
}

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  email_verified: boolean;
}

export interface Profile {
  user: SessionUser;
  workspaces: WorkspaceSummary[];
}

const TOKEN_KEY = 'fieldwork.token';
const WS_KEY = 'fieldwork.workspace';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null): void {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

/** Session state. Permissions here only hide UI; the API enforces every rule. */
@Injectable({ providedIn: 'root' })
export class Session {
  readonly token = signal<string | null>(read(TOKEN_KEY));
  readonly user = signal<SessionUser | null>(null);
  readonly workspaces = signal<WorkspaceSummary[]>([]);
  readonly workspaceId = signal<number | null>(Number(read(WS_KEY)) || null);

  /** Null until a profile with at least one workspace has loaded. */
  readonly workspace = computed<WorkspaceSummary | null>(() => {
    const list = this.workspaces();
    return list.find((w) => w.id === this.workspaceId()) ?? list[0] ?? null;
  });
  readonly role = computed(() => this.workspace()?.role ?? null);
  readonly permissions = computed(() => new Set(this.workspace()?.permissions ?? []));
  readonly currency = computed(() => this.workspace()?.currency ?? 'USD');
  readonly timezone = computed(() => this.workspace()?.timezone ?? 'UTC');

  can(permission: string): boolean {
    return this.permissions().has(permission);
  }

  setToken(token: string | null): void {
    this.token.set(token);
    write(TOKEN_KEY, token);
  }

  setProfile(profile: Profile, preferId?: number | null): void {
    this.user.set(profile.user);
    this.workspaces.set(profile.workspaces);
    const wanted = preferId ?? this.workspaceId();
    const pick = profile.workspaces.find((w) => w.id === wanted) ?? profile.workspaces[0];
    this.selectWorkspace(pick?.id ?? null);
  }

  selectWorkspace(id: number | null): void {
    this.workspaceId.set(id);
    write(WS_KEY, id === null ? null : String(id));
  }

  clear(): void {
    this.setToken(null);
    this.user.set(null);
    this.workspaces.set([]);
  }
}
