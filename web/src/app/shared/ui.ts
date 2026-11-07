import { ChangeDetectionStrategy, Component, DestroyRef, Directive, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Icon } from './icon';
import { ORG_MARKS } from './org-marks';
import { MOTION } from './motion';
import { initials } from '../core/format';

const STATUS_TONE: Record<string, string> = {
  active: 'positive', approved: 'positive', paid: 'positive', settled: 'positive', completed: 'positive', done: 'positive', on_time: 'positive', accepted: 'positive', ready: 'positive', reconciled: 'positive',
  submitted: 'info', in_review: 'info', in_progress: 'info', issued: 'info', pending: 'warning', partially_paid: 'warning', on_hold: 'warning', draft: '', planned: '', todo: '',
  rejected: 'danger', overdue: 'danger', missed: 'danger', late: 'warning', failed: 'danger', reversed: 'danger', void: '', cancelled: '', archived: '', revoked: 'danger', expired: '', inactive: '',
  unpaid: 'warning', urgent: 'danger', high: 'warning', medium: '', low: '', adjusted: 'warning',
};

/** Status chip: tone plus a text label, never colour alone. */
@Component({
  selector: 'fw-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="'status ' + tone()"><i aria-hidden="true"></i>{{ text() }}</span>`,
})
export class StatusBadge {
  value = input.required<string | null | undefined>();
  override = input<string | null>(null);
  tone = computed(() => STATUS_TONE[this.value() ?? ''] ?? '');
  text = computed(() => {
    if (this.override()) return this.override()!;
    const v = (this.value() ?? '').replace(/_/g, ' ');
    return v.charAt(0).toUpperCase() + v.slice(1);
  });
}

/** Portraits for the seeded demo people (public/people, Unsplash License; provenance in manifest.json). */
const PHOTOS = new Set(['avery-brooks', 'jordan-ellis', 'priya-raman', 'marcus-webb', 'leo-martins', 'hana-sato', 'grace-okafor', 'maya-chen', 'tomas-rivera', 'sam-patel', 'elena-novak', 'noah-kim', 'iris-lindqvist', 'dana-fischer',
  // client contacts
  'rhea-lund', 'owen-price', 'dr-celia-moreau', 'victor-hale', 'ines-duarte', 'paula-greer', 'kofi-mensah', 'lydia-shaw', 'marta-ruiz', 'jules-hart', 'nadia-bloom']);
const slug = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

@Component({
  selector: 'fw-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (photo(); as src) {
      <img [class]="variantClass() + ' photo'" [src]="src" alt="" [attr.title]="name()" loading="lazy" decoding="async" (error)="broken.set(true)" />
    } @else if (mark(); as m) {
      <span [class]="'avatar logo ' + (size() === 'md' ? '' : size())" [style.background]="m.bg" [attr.title]="name()" aria-hidden="true"><svg viewBox="0 0 32 32" width="100%" height="100%" [innerHTML]="m.svg"></svg></span>
    } @else {
      <span class="avatar" [class]="variantClass()" [style.background]="bg()" [attr.title]="name()">{{ letters() }}</span>
    }`,
})
export class Avatar {
  name = input<string | null | undefined>('');
  /** A person with a portrait shows it; everyone else (and orgs) keeps the initials. */
  broken = signal(false);
  photo = computed(() => {
    if (this.kind() !== 'person' || this.broken()) return null;
    const s = slug(this.name() ?? '');
    return PHOTOS.has(s) ? `/people/${s}.jpg` : null;
  });
  private sanitizer = inject(DomSanitizer);
  /** A known client shows its drawn mark (org-marks.ts, our own SVG); other orgs keep the letter tile. */
  mark = computed(() => {
    if (this.kind() !== 'org') return null;
    const m = ORG_MARKS[slug(this.name() ?? '')];
    return m ? { bg: m.bg, svg: this.sanitizer.bypassSecurityTrustHtml(m.svg) } : null;
  });
  size = input<'sm' | 'md' | 'lg'>('md');
  /** person: soft tinted circle · org: logo-like mark (ink, accent or outlined), one letter */
  kind = input<'person' | 'org'>('person');
  private hash = computed(() => { const n = this.name() ?? ''; let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 360; return h; });
  letters = computed(() => (this.kind() === 'org' ? (this.name() ?? '?').trim().charAt(0).toUpperCase() : initials(this.name())));
  variantClass = computed(() => 'avatar ' + (this.size() === 'md' ? '' : this.size()) + ' ' + (this.kind() === 'org' ? ['ink', 'soft', 'accent', 'soft', 'ink'][(this.hash() * 7 + (this.name() ?? '').length) % 5] : ''));
  bg = computed(() => (this.kind() === 'org' ? null : `oklch(0.93 0.035 ${this.hash()})`));
}

@Component({
  selector: 'fw-empty',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    <div class="empty">
      <div class="empty-icon"><fw-icon [name]="icon()" /></div>
      <h3>{{ title() }}</h3>
      <p>{{ text() }}</p>
      <div class="actions"><ng-content /></div>
      @if (hint()) { <p class="small faint">{{ hint() }}</p> }
    </div>
  `,
})
export class EmptyState {
  icon = input('file');
  title = input.required<string>();
  text = input('');
  hint = input('');
}

/** Change versus the comparison period. Absolute change when the prior value is zero. */
@Component({
  selector: 'fw-delta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="delta" [class.up]="dir() === 'up'" [class.down]="dir() === 'down'" [class.flat]="dir() === 'flat'">
    @if (dir() === 'up') { <span aria-hidden="true">▲</span> } @else if (dir() === 'down') { <span aria-hidden="true">▼</span> }
    {{ text() }}<span class="sr-only"> versus comparison period</span></span>`,
})
export class Delta {
  percent = input<number | null | undefined>(null);
  absolute = input<string | null>(null);
  change = input<number>(0);
  invert = input(false);
  /** True when the comparison value was zero, so a percentage is meaningless. */
  noPrior = input(true);
  dir = computed(() => {
    const c = this.change();
    if (!c) return 'flat';
    const up = c > 0;
    return (this.invert() ? !up : up) ? 'up' : 'down';
  });
  text = computed(() => {
    const p = this.percent();
    if (p === null || p === undefined) return this.absolute() ? `${this.change() > 0 ? '+' : ''}${this.absolute()}${this.noPrior() ? ' (no prior)' : ''}` : 'No prior data';
    return `${p > 0 ? '+' : ''}${p}%`;
  });
}

@Component({
  selector: 'fw-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // A native <dialog> opened with showModal() lives in the browser's top layer, so its backdrop covers the
  // sticky header, the sidebar and the phone tab bar, and focus and Escape are handled by the browser.
  template: `
    <dialog #el class="modal" [attr.aria-label]="title()" (cancel)="$event.preventDefault(); close.emit()" (click)="$event.target === el ? close.emit() : null">
      <div class="dialog" [class.wide]="wide()">
        <div class="dialog-head">
          <h2>{{ title() }}</h2>
          @if (subtitle()) { <p>{{ subtitle() }}</p> }
        </div>
        <div class="dialog-body"><ng-content /></div>
        <div class="dialog-foot"><ng-content select="[foot]" /></div>
      </div>
    </dialog>
  `,
})
export class Dialog {
  title = input.required<string>();
  subtitle = input('');
  wide = input(false);
  close = output<void>();
  private el = viewChild.required<ElementRef<HTMLDialogElement>>('el');

  constructor() {
    afterNextRender(() => { const d = this.el().nativeElement; if (!d.open) d.showModal(); });
    inject(DestroyRef).onDestroy(() => { const d = this.el()?.nativeElement; if (d?.open) d.close(); });
  }
}

/** Opens a <dialog fwModal> in the top layer while it is rendered (for drawers and other custom modals). */
@Directive({ selector: 'dialog[fwModal]' })
export class ModalDialog {
  constructor() {
    const el = inject(ElementRef<HTMLDialogElement>).nativeElement as HTMLDialogElement;
    afterNextRender(() => { if (!el.open) el.showModal(); });
    inject(DestroyRef).onDestroy(() => { if (el.open) el.close(); });
  }
}

export const UI = [StatusBadge, Avatar, EmptyState, Delta, Dialog, ModalDialog, Icon, ...MOTION];
