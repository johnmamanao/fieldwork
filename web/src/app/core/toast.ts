import { Component, Injectable, inject, signal } from '@angular/core';

interface Toast { id: number; text: string; kind: 'ok' | 'error'; leaving?: boolean; }

/** Toasts: the newest three stay; each fades out briefly before it is removed. */
@Injectable({ providedIn: 'root' })
export class Toasts {
  readonly items = signal<Toast[]>([]);
  private next = 1;

  ok(text: string): void { this.push(text, 'ok'); }
  error(text: string): void { this.push(text, 'error'); }

  dismiss(id: number): void {
    this.items.update((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => this.items.update((list) => list.filter((t) => t.id !== id)), 140);
  }

  private push(text: string, kind: Toast['kind']): void {
    const id = this.next++;
    // Overflow leaves the active stack immediately so a fourth event never queues.
    this.items.update((list) => [...list.filter((t) => !t.leaving).slice(-2), { id, text, kind }]);
    setTimeout(() => this.dismiss(id), kind === 'error' ? 6000 : 3500);
  }
}

@Component({
  selector: 'fw-toasts',
  template: `
    <div class="toast-host" role="status" aria-live="polite">
      @for (t of toasts.items(); track t.id) {
        <div class="toast" [class.error]="t.kind === 'error'" [class.leaving]="t.leaving" (click)="toasts.dismiss(t.id)">
          @if (t.kind === 'ok') {
            <span class="tick" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17 19 7"/></svg></span>
          } @else {
            <span class="tick" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg></span>
          }
          <span>{{ t.text }}</span>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  toasts = inject(Toasts);
}
