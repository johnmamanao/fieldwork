import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icon } from './icon';

/** "Rows per page", the visible range and page buttons — shared by every list page. */
@Component({
  selector: 'fw-table-foot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Icon],
  template: `
    <div class="table-foot">
      <label class="row">Rows per page
        <select class="select sm" style="width: 72px" [ngModel]="perPage()" (ngModelChange)="perPage.set(+$event); page.set(1)" aria-label="Rows per page">
          @for (n of sizes; track n) { <option [ngValue]="n">{{ n }}</option> }
        </select></label>
      <div class="row-3">
        <span class="tabular"><b style="color: var(--color-text)">{{ start() }}–{{ end() }}</b> of {{ total() }}</span>
        <nav class="pager" aria-label="Pagination">
          <button type="button" aria-label="Previous page" [disabled]="page() <= 1" (click)="page.set(page() - 1)"><fw-icon name="chevronLeft" /></button>
          @for (n of pages(); track n) { <button type="button" [attr.aria-current]="n === page() ? 'page' : null" (click)="page.set(n)">{{ n }}</button> }
          <button type="button" aria-label="Next page" [disabled]="page() >= last()" (click)="page.set(page() + 1)"><fw-icon name="chevronRight" /></button>
        </nav>
      </div>
    </div>
  `,
})
export class TableFoot {
  total = input.required<number>();
  page = model(1);
  perPage = model(12);
  sizes = [12, 25, 50];
  last = computed(() => Math.max(1, Math.ceil(this.total() / this.perPage())));
  /** Up to seven page buttons around the current page. */
  pages = computed(() => {
    const last = this.last();
    const from = Math.max(1, Math.min(this.page() - 3, last - 6));
    return Array.from({ length: Math.min(7, last) }, (_, i) => from + i);
  });
  start = computed(() => (this.total() ? (this.page() - 1) * this.perPage() + 1 : 0));
  end = computed(() => Math.min(this.page() * this.perPage(), this.total()));
}

/** Slice of rows for the current page. */
export function pageOf<T>(rows: T[], page: number, perPage: number): T[] {
  return rows.slice((page - 1) * perPage, page * perPage);
}

/** Start date (ISO) for a named issued/received range, in UTC days. */
export function rangeStart(range: string): string | null {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (range) {
    case 'month': return iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
    case 'last30': return iso(new Date(now.getTime() - 30 * 86400000));
    case 'quarter': return iso(new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1)));
    case 'year': return iso(new Date(Date.UTC(now.getUTCFullYear(), 0, 1)));
    default: return null;
  }
}

export const RANGE_LABEL: Record<string, string> = { all: 'Any time', month: 'This month', last30: 'Last 30 days', quarter: 'This quarter', year: 'This year' };
