import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

const DEFAULT_DESCRIPTION = 'Fieldwork joins timesheets, approvals, invoices and payments for services studios. Approved hours are billed once and closed by a payment.';

/**
 * Sets the tab title from each route's `title`, and keeps the description and
 * share-preview tags in step with it: a route can give its own `data.description`,
 * and the preview image and page address are made absolute for the current origin.
 * Signed-in screens are marked noindex; they are private to a workspace.
 */
@Injectable()
export class PageMeta extends TitleStrategy {
  private title = inject(Title);
  private meta = inject(Meta);

  override updateTitle(state: RouterStateSnapshot): void {
    const title = this.buildTitle(state) ?? 'Fieldwork';
    let route: ActivatedRouteSnapshot | null = state.root, description = DEFAULT_DESCRIPTION, priv = false;
    while (route) {
      if (route.data['description']) description = route.data['description'];
      if (route.data['private']) priv = true;
      route = route.firstChild;
    }
    this.title.setTitle(title);
    const origin = location.origin;
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: origin + state.url });
    this.meta.updateTag({ property: 'og:image', content: origin + '/og.png' });
    if (priv) this.meta.updateTag({ name: 'robots', content: 'noindex' });
    else this.meta.removeTag('name="robots"');
  }
}
