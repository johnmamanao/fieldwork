import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export interface Quick { label: string; run: () => void; }

/**
 * The page's primary create action, shown as the round "+" in the phone top bar.
 * A page registers it while mounted; the shell falls back to a role default otherwise.
 */
@Injectable({ providedIn: 'root' })
export class QuickAction {
  readonly current = signal<Quick | null>(null);

  /** Call from a page constructor; clears itself when the page is destroyed. */
  register(label: string, run: () => void): void {
    const q = { label, run };
    this.current.set(q);
    inject(DestroyRef).onDestroy(() => { if (this.current() === q) this.current.set(null); });
  }
}
