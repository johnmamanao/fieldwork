import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';

const GLYPHS = 'ABCDEFGHJKLMNPRSTUVWXYZ/<>+%#';

/**
 * A short mono label resolves from scrambled glyphs into its text, left to right.
 * `fwScramble` (default) runs once when the label scrolls into view and again on hover;
 * `fwScramble="hover"` runs only when its button or link is hovered or focused.
 * Unresolved glyphs are wrapped in <i> so they can take the glyph colour.
 * The real text stays as the accessible name; reduced motion shows the text as is.
 */
@Directive({ selector: '[fwScramble]' })
export class Scramble {
  readonly fwScramble = input<'' | 'hover'>('');

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const text = el.textContent ?? '';
      if (!text.trim() || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const onHover = this.fwScramble() === 'hover';
      const trigger = onHover ? (el.closest('a, button') as HTMLElement | null) ?? el : el;
      // the accessible name stays the real words while the glyphs run
      if (!onHover) el.setAttribute('aria-label', text);
      else if (!trigger.hasAttribute('aria-label')) trigger.setAttribute('aria-label', text.trim());
      let timer = 0;
      const esc = (c: string) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c);
      const run = () => {
        clearInterval(timer);
        let frame = 0;
        const frames = Math.min(10, text.length + 2);
        timer = window.setInterval(() => {
          frame++;
          const done = Math.floor((frame / frames) * text.length);
          el.innerHTML = [...text].map((ch, i) => (i < done || ch === ' ' ? esc(ch) : `<i>${esc(GLYPHS[(i * 7 + frame * 3) % GLYPHS.length])}</i>`)).join('');
          if (frame >= frames) { clearInterval(timer); el.textContent = text; }
        }, 32);
      };
      const io = onHover ? null : new IntersectionObserver(([e]) => { if (e.isIntersecting) { run(); io!.disconnect(); } }, { threshold: 1 });
      io?.observe(el);
      const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (fine) trigger.addEventListener('mouseenter', run);
      const focus = () => { if (trigger.matches(':focus-visible')) run(); };
      if (onHover) trigger.addEventListener('focus', focus);
      destroy.onDestroy(() => {
        io?.disconnect(); clearInterval(timer);
        trigger.removeEventListener('mouseenter', run); trigger.removeEventListener('focus', focus);
        el.textContent = text;
      });
    });
  }
}
