import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, apiError } from '../core/api';
import { Session } from '../core/session';
import { Toasts } from '../core/toast';
import { FORMAT_PIPES } from '../core/format';
import { UI } from '../shared/ui';

interface Msg { id: number | string; conversation_id: number; user: { id: number; name: string } | null; body: string; deleted: boolean; edited: boolean; attachment_name: string | null; client_uuid: string; created_at: string; pending?: boolean; failed?: boolean; }

@Component({
  selector: 'fw-chat',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ...FORMAT_PIPES, ...UI],
  styles: [`
    :host { display: block; }
    /* One screen tall; the message list scrolls inside it, never the page (grid rows and flex children must be allowed to shrink). */
    .wrap { display: grid; grid-template-columns: 300px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); height: calc(100vh - var(--topbar-h)); overflow: hidden; }
    .side { min-height: 0; border-right: var(--hairline) solid var(--color-border); overflow-y: auto; display: flex; flex-direction: column; }
    .side-head { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); border-bottom: var(--hairline) solid var(--color-border); }
    .conv { display: flex; gap: var(--space-3); padding: var(--space-3) var(--space-4); text-decoration: none; border-bottom: var(--hairline) solid var(--color-border); }
    .conv:hover { background: var(--color-bg-hover); }
    .conv.active { background: var(--color-bg-surface); }
    .conv .name { font-weight: var(--weight-medium); }
    .conv .count { background: var(--color-accent-strong); color: var(--color-on-ink); }
    .thread { display: flex; flex-direction: column; min-width: 0; min-height: 0; background: var(--color-bg-surface); }
    .thread-head { padding: var(--space-3) var(--space-5); border-bottom: var(--hairline) solid var(--color-border); display: flex; align-items: center; gap: var(--space-3); }
    .messages { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-4); }
    /* Messenger layout: others on the left with their photo, mine on the right in an ink bubble. */
    .msg { flex: none; display: flex; align-items: flex-end; gap: var(--space-2); max-width: min(72%, 560px); align-self: flex-start; }
    .msg.mine { align-self: flex-end; flex-direction: row-reverse; }
    .msg .col { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); }
    .msg.mine .col { align-items: flex-end; }
    .msg.mine .meta { flex-direction: row-reverse; }
    .msg .meta { display: flex; align-items: center; gap: var(--space-2); padding: 0 var(--space-1); }
    .msg .bubble { padding: var(--space-2) var(--space-3); border-radius: var(--radius-lg); border-bottom-left-radius: var(--radius-xs); background: var(--color-bg-sunken); color: var(--color-text); max-width: 100%; }
    .msg.mine .bubble { background: var(--color-ink); color: var(--color-on-ink); border-bottom-left-radius: var(--radius-lg); border-bottom-right-radius: var(--radius-xs); }
    .msg .body { white-space: pre-wrap; word-break: break-word; line-height: var(--lh-body); }
    .msg .bubble.deleted { background: transparent; box-shadow: inset 0 0 0 1px var(--color-border); color: var(--color-text-tertiary); font-style: italic; }
    .msg .edit { width: min(480px, 70vw); }
    .msg .actions { visibility: hidden; display: inline-flex; gap: var(--space-1); }
    .msg:hover .actions, .msg:focus-within .actions { visibility: visible; }
    @media (hover: none) { .msg .actions { visibility: visible; } }
    .msg.highlight .bubble { box-shadow: 0 0 0 2px var(--color-accent); }
    /* consecutive messages from one person tuck together */
    .msg + .msg.same { margin-top: calc(var(--space-3) * -1); }
    .msg.same .meta { display: none; }
    .msg.same:not(.mine) fw-avatar { visibility: hidden; }
    @media (max-width: 560px) { .msg { max-width: 86%; } }
    .composer { border-top: var(--hairline) solid var(--color-border); padding: var(--space-3) var(--space-5); display: flex; gap: var(--space-2); align-items: flex-end; }
    .composer textarea { min-height: 44px; max-height: 160px; }
    .conn { font-size: var(--text-small); color: var(--color-text-tertiary); }
    .conn.bad { color: var(--color-danger); }
    /* phone: the shell keeps a fixed tab bar at the bottom, so the thread ends above it */
    @media (max-width: 767px) { .wrap { height: calc(100dvh - 60px - 72px - env(safe-area-inset-bottom)); } }
    @media (max-width: 860px) { .wrap { grid-template-columns: minmax(0, 1fr); } .side { display: none; } .wrap.list .side { display: flex; } .wrap.list .thread { display: none; } }
  `],
  template: `
    <div class="wrap" [class.list]="!id()">
      <aside class="side" aria-label="Conversations">
        <div class="side-head">
          <div class="spread"><h2>Chat</h2><button class="btn btn-sm" (click)="newDm.set(true)"><fw-icon name="plus" />Message</button></div>
          <input class="input sm" type="search" placeholder="Search messages" aria-label="Search messages" [(ngModel)]="query" (keydown.enter)="search()" />
        </div>
        @if (results()) {
          <div class="spread" style="padding: var(--space-2) var(--space-4)"><span class="small muted">{{ results()!.length }} results</span><button class="btn btn-sm btn-ghost" (click)="results.set(null); query = ''">Clear</button></div>
          @for (m of results()!; track m.id) {
            <a class="conv" [routerLink]="['/chat', m.conversation_id]" [queryParams]="{ message: m.id }"><span class="grow"><span class="name small">{{ m.conversation_name }}</span>
              <span class="small muted" style="display:block">{{ m.user?.name }}: {{ m.body }}</span></span></a>
          }
        } @else {
          @for (c of conversations(); track c.id) {
            <a class="conv" [class.active]="c.id === +(id() ?? 0)" [routerLink]="['/chat', c.id]">
              @if (c.type === 'project') { <span class="swatch" style="margin-top: 6px" [style.background]="c.project?.color || 'var(--color-compare)'"></span> } @else { <fw-avatar [name]="c.name" /> }
              <span class="grow" style="min-width: 0"><span class="spread"><span class="name truncate">{{ c.name }}</span>@if (c.unread) { <span class="count" data-seenry-dot>{{ c.unread }}</span> }</span>
                <span class="small muted truncate" style="display:block">{{ c.last_message ? c.last_message.user + ': ' + c.last_message.body : (c.type === 'project' ? 'Project channel' : 'No messages yet') }}</span></span>
            </a>
          } @empty { <p class="muted" style="padding: var(--space-4)">No conversations yet. Project channels appear when you join a project.</p> }
        }
      </aside>

      <section class="thread">
        @if (current(); as c) {
          <div class="thread-head">
            <a class="btn btn-ghost btn-icon btn-sm" routerLink="/chat" aria-label="Back to conversations"><fw-icon name="arrowLeft" /></a>
            <div class="grow"><h2>{{ c.name }}</h2><div class="small muted">{{ c.type === 'project' ? 'Everyone on ' + c.project?.code + ' can read this channel' : 'Private conversation' }}</div></div>
            <span class="conn" [class.bad]="offline()" aria-live="polite">{{ offline() ? 'Reconnecting…' : 'Live' }}</span>
            @if (c.type === 'project') { <a class="btn btn-sm" [routerLink]="['/projects', c.project?.id]">Open project</a> }
          </div>
          <div class="messages" #scroller (scroll)="onScroll()">
            @if (hasMore()) { <button class="btn btn-sm btn-ghost" style="align-self: center" (click)="older()">Load earlier messages</button> }
            @for (m of messages(); track m.client_uuid; let i = $index) {
              @let mine = m.user?.id === session.user()?.id;
              <div class="msg" [class.mine]="mine" [class.same]="sameAsPrev(i)" [class.highlight]="m.id === highlight()" [attr.id]="'m' + m.id">
                @if (!mine) { <fw-avatar [name]="m.user?.name" /> }
                <div class="col">
                  <div class="meta small">
                    @if (!mine) { <b style="font-weight: var(--weight-semibold)">{{ m.user?.name }}</b> }
                    <span class="faint">{{ m.created_at | ago }}{{ m.edited ? ' · edited' : '' }}</span>
                    @if (!m.deleted && !m.pending && mine) {
                      <span class="actions"><button class="btn btn-ghost btn-sm" (click)="startEdit(m)">Edit</button><button class="btn btn-ghost btn-sm" (click)="remove(m)">Delete</button></span>
                    }</div>
                  @if (editing() === m.id) {
                    <div class="stack-2 edit"><textarea class="textarea" [(ngModel)]="editText" aria-label="Edit message"></textarea>
                      <div class="row"><button class="btn btn-sm btn-primary" (click)="saveEdit(m)">Save</button><button class="btn btn-sm" (click)="editing.set(null)">Cancel</button></div></div>
                  } @else if (m.deleted) { <div class="bubble deleted"><div class="body">Message deleted</div></div> }
                  @else {
                    <div class="bubble"><div class="body">{{ m.body }}</div></div>
                    @if (m.attachment_name) { <button class="btn btn-sm" (click)="attachment(m)"><fw-icon name="paperclip" />{{ m.attachment_name }}</button> }
                    @if (m.pending) { <div class="small faint">Sending…</div> }
                    @if (m.failed) { <div class="small" style="color: var(--color-danger)">Not sent. <button class="btn btn-sm btn-ghost" (click)="retry(m)">Retry</button></div> }
                  }
                </div>
              </div>
            } @empty { <fw-empty icon="chat" title="Start the conversation" text="Messages here are visible to everyone with access to this conversation." /> }
          </div>
          <form class="composer" (ngSubmit)="send()">
            <label class="btn btn-ghost btn-icon" aria-label="Attach a file"><fw-icon name="paperclip" /><input type="file" class="sr-only" (change)="pick($event)" /></label>
            <div class="grow stack-1">
              @if (file()) { <span class="badge">{{ file()!.name }} <button type="button" class="btn btn-ghost btn-sm" style="height: 18px; padding: 0" aria-label="Remove attachment" (click)="file.set(null)"><fw-icon name="x" /></button></span> }
              <textarea class="textarea" name="draft" aria-label="Message" placeholder="Write a message. Mention with @email." [(ngModel)]="draft" (keydown.enter)="enter($event)"></textarea>
            </div>
            <button class="btn btn-primary" type="submit" [disabled]="!draft.trim() && !file()"><fw-icon name="send" />Send</button>
          </form>
        } @else {
          <fw-empty icon="chat" title="Choose a conversation" text="Project channels follow project membership. Direct messages are private to their members." />
        }
      </section>
    </div>

    @if (newDm()) {
      <fw-dialog title="New message" subtitle="Start a private conversation with one or more people." (close)="newDm.set(false)">
        <div class="stack-2" style="max-height: 320px; overflow-y: auto">
          @for (m of people(); track m.user.id) {
            <label class="check" style="display:flex"><input type="checkbox" [checked]="dmPick().has(m.user.id)" (change)="toggleDm(m.user.id)" /><fw-avatar [name]="m.user.name" />{{ m.user.name }}</label>
          }
        </div>
        <ng-container foot><button class="btn" (click)="newDm.set(false)">Cancel</button><button class="btn btn-primary" [disabled]="!dmPick().size" (click)="startDm()">Open conversation</button></ng-container>
      </fw-dialog>
    }
  `,
})
export class ChatPage implements OnInit, OnDestroy {
  id = input<string>();
  message = input<string>();
  session = inject(Session);
  private api = inject(Api);
  private toasts = inject(Toasts);
  private router = inject(Router);
  scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  conversations = signal<any[]>([]);
  messages = signal<Msg[]>([]);
  hasMore = signal(false);
  offline = signal(false);
  results = signal<any[] | null>(null);
  editing = signal<number | string | null>(null);
  highlight = signal<number | null>(null);
  file = signal<File | null>(null);
  newDm = signal(false);
  dmPick = signal(new Set<number>());
  people = signal<any[]>([]);
  draft = '';
  editText = '';
  query = '';
  private timer: any;
  private stickToBottom = true;

  current = computed(() => this.conversations().find((c) => c.id === Number(this.id())) ?? null);

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) this.openConversation(Number(id));
    });
  }

  ngOnInit(): void {
    this.loadConversations();
    this.timer = setInterval(() => this.tick(), 4000);
    this.api.get<any[]>('/members').then((m) => this.people.set(m.filter((x) => x.status === 'active' && x.user.id !== this.session.user()?.id))).catch(() => undefined);
  }
  ngOnDestroy(): void { clearInterval(this.timer); }

  async loadConversations(): Promise<void> {
    try { this.conversations.set(await this.api.get<any[]>('/conversations')); this.offline.set(false); }
    catch { this.offline.set(true); }
  }

  async openConversation(id: number): Promise<void> {
    this.messages.set([]);
    try {
      const list = await this.api.get<Msg[]>(`/conversations/${id}/messages`);
      this.messages.set(list);
      this.hasMore.set(list.length === 50);
      this.markRead();
      const target = Number(this.message());
      if (target) { this.highlight.set(target); setTimeout(() => document.getElementById('m' + target)?.scrollIntoView({ block: 'center' }), 50); }
      else this.scrollDown();
    } catch (e) {
      this.toasts.error(apiError(e).message);
      this.router.navigate(['/chat']);
    }
  }

  /** Poll for new messages; failures show a reconnecting state and retry on the next tick. */
  async tick(): Promise<void> {
    const c = this.current();
    try {
      if (c) {
        const lastId = this.messages().filter((m) => typeof m.id === 'number').reduce((a, m) => Math.max(a, m.id as number), 0);
        const fresh = await this.api.get<Msg[]>(`/conversations/${c.id}/messages`, { after_id: lastId });
        if (fresh.length) {
          const known = new Set(this.messages().map((m) => m.client_uuid));
          this.messages.update((list) => [...list, ...fresh.filter((m) => !known.has(m.client_uuid))]);
          this.markRead();
          if (this.stickToBottom) this.scrollDown();
        }
      }
      await this.loadConversations();
    } catch { this.offline.set(true); }
  }

  async older(): Promise<void> {
    const first = this.messages().find((m) => typeof m.id === 'number');
    if (!first) return;
    const list = await this.api.get<Msg[]>(`/conversations/${this.id()}/messages`, { before_id: first.id as number });
    this.messages.update((m) => [...list, ...m]);
    this.hasMore.set(list.length === 50);
  }

  private markRead(): void {
    const last = this.messages().filter((m) => typeof m.id === 'number').at(-1);
    if (last && this.current()) {
      this.api.post(`/conversations/${this.current()!.id}/read`, { message_id: last.id }).catch(() => undefined);
      this.conversations.update((list) => list.map((c) => (c.id === this.current()!.id ? { ...c, unread: 0 } : c)));
    }
  }

  onScroll(): void {
    const el = this.scroller()?.nativeElement;
    if (el) this.stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  private scrollDown(): void { setTimeout(() => { const el = this.scroller()?.nativeElement; if (el) el.scrollTop = el.scrollHeight; }, 0); }

  enter(e: Event): void {
    const ke = e as KeyboardEvent;
    if (!ke.shiftKey) { ke.preventDefault(); this.send(); }
  }
  pick(e: Event): void { this.file.set((e.target as HTMLInputElement).files?.[0] ?? null); }

  async send(): Promise<void> {
    if (!this.draft.trim() && !this.file()) return;
    const msg: Msg = { id: 'tmp-' + crypto.randomUUID(), conversation_id: this.current()!.id, user: { id: this.session.user()!.id, name: this.session.user()!.name },
      body: this.draft.trim(), deleted: false, edited: false, attachment_name: this.file()?.name ?? null, client_uuid: crypto.randomUUID(), created_at: new Date().toISOString(), pending: true };
    const file = this.file();
    this.messages.update((l) => [...l, msg]);
    this.draft = '';
    this.file.set(null);
    this.scrollDown();
    await this.deliver(msg, file);
  }

  /** The same client_uuid is reused on retry, so the server never stores a duplicate. */
  private async deliver(msg: Msg, file: File | null): Promise<void> {
    const fd = new FormData();
    fd.append('body', msg.body);
    fd.append('client_uuid', msg.client_uuid);
    if (file) fd.append('file', file);
    try {
      const saved = await this.api.post<Msg>(`/conversations/${msg.conversation_id}/messages`, fd);
      this.messages.update((l) => l.map((m) => (m.client_uuid === msg.client_uuid ? saved : m)));
      this.offline.set(false);
    } catch {
      this.messages.update((l) => l.map((m) => (m.client_uuid === msg.client_uuid ? { ...m, pending: false, failed: true } : m)));
      (msg as any)._file = file;
    }
  }
  retry(m: Msg): void {
    this.messages.update((l) => l.map((x) => (x.client_uuid === m.client_uuid ? { ...x, failed: false, pending: true } : x)));
    this.deliver(m, (m as any)._file ?? null);
  }

  /** A message from the same person within five minutes of the one before tucks under it (no repeated name or photo). */
  sameAsPrev(i: number): boolean {
    const list = this.messages(), a = list[i - 1], b = list[i];
    if (!a || !b || a.user?.id !== b.user?.id || a.deleted || b.deleted) return false;
    return Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < 5 * 60 * 1000;
  }
  startEdit(m: Msg): void { this.editing.set(m.id); this.editText = m.body; }
  async saveEdit(m: Msg): Promise<void> {
    try {
      const saved = await this.api.patch<Msg>(`/messages/${m.id}`, { body: this.editText });
      this.messages.update((l) => l.map((x) => (x.id === m.id ? saved : x)));
      this.editing.set(null);
    } catch (e) { this.toasts.error(apiError(e).message); }
  }
  async remove(m: Msg): Promise<void> {
    if (!confirm('Delete this message for everyone?')) return;
    try {
      const saved = await this.api.delete<Msg>(`/messages/${m.id}`);
      this.messages.update((l) => l.map((x) => (x.id === m.id ? saved : x)));
    } catch (e) { this.toasts.error(apiError(e).message); }
  }
  attachment(m: Msg): void { this.api.download(`/messages/${m.id}/attachment`, m.attachment_name ?? 'attachment').catch((e) => this.toasts.error(apiError(e).message)); }

  async search(): Promise<void> {
    if (this.query.trim().length < 2) return;
    try { this.results.set(await this.api.get<any[]>('/chat/search', { q: this.query })); } catch (e) { this.toasts.error(apiError(e).message); }
  }

  toggleDm(id: number): void { const s = new Set(this.dmPick()); s.has(id) ? s.delete(id) : s.add(id); this.dmPick.set(s); }
  async startDm(): Promise<void> {
    try {
      const c = await this.api.post<any>('/conversations', { user_ids: [...this.dmPick()] });
      this.newDm.set(false);
      this.dmPick.set(new Set());
      await this.loadConversations();
      this.router.navigate(['/chat', c.id]);
    } catch (e) { this.toasts.error(apiError(e).message); }
  }
}
