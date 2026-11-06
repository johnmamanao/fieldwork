import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * State/continuity: one shared highlight glides to the selected option of a segmented control
 * (`.seg`, `aria-pressed`) or tab bar (`.tabs`, `.active`). Animated with clip-path so no
 * layout property moves; CSS transitions retarget from the current value on rapid input.
 */
@Directive({ selector: '.seg, .tabs' })
export class Glide {
  private host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const isTabs = this.host.classList.contains('tabs');
      const layer = document.createElement('span');
      layer.className = isTabs ? 'ink no-anim' : 'glide no-anim';
      layer.setAttribute('aria-hidden', 'true');
      this.host.appendChild(layer);
      this.host.classList.add('has-glide');

      const place = () => {
        const active = this.host.querySelector<HTMLElement>(isTabs ? ':scope > .active' : ':scope > button[aria-pressed="true"]');
        if (!active) { layer.style.opacity = '0'; return; }
        layer.style.opacity = '1';
        const box = layer.getBoundingClientRect();
        const a = active.getBoundingClientRect();
        const left = Math.max(0, a.left - box.left);
        const right = Math.max(0, box.right - a.right);
        layer.style.clipPath = isTabs ? `inset(0 ${right}px 0 ${left}px)` : `inset(0 ${right}px 0 ${left}px round 6px)`;
      };

      // Scrolling tab strips: the ink lives in scroll coordinates, so re-measure on scroll too.
      const mo = new MutationObserver(() => place());
      mo.observe(this.host, { subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'class'], childList: true });
      const ro = new ResizeObserver(() => place());
      ro.observe(this.host);
      this.host.addEventListener('scroll', place, { passive: true });
      place();
      // First paint lands without travel; later selections glide.
      requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.remove('no-anim')));
      destroy.onDestroy(() => { mo.disconnect(); ro.disconnect(); });
    });
  }
}

/**
 * Explanation (first load, rare): a KPI figure counts up to its value once, then rests on the
 * exact text Angular rendered. Later changes count from the previous value. The final string is
 * always the real one; reduced motion, or a change of unit (k to M), shows it immediately.
 *
 * The observer also fires after our own frame writes (asynchronously, so a flag cannot catch
 * them), so every string we write is remembered and ignored: only text Angular put there
 * starts a new count.
 */
@Directive({ selector: '.kpi-figure' })
export class CountUp {
  private host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private last: { value: number; pre: string; post: string } | null = null;
  private frame = 0;
  private written = new Set<string>();

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const run = () => {
        const node = this.textNode();
        if (!node) return;
        const target = node.data;
        if (this.written.has(target)) return; // one of our own frames, not a new value
        cancelAnimationFrame(this.frame);
        this.written.clear();
        const parsed = parse(target);
        if (!parsed) { this.last = null; return; }
        const prev = this.last;
        this.last = { value: parsed.value, pre: parsed.pre, post: parsed.post };
        const sameUnit = !prev || (prev.pre === parsed.pre && prev.post === parsed.post);
        const from = prev && sameUnit ? prev.value : 0;
        // The node already holds the real text, so returning early is always correct.
        if (reduced() || !sameUnit || from === parsed.value) return;
        const start = performance.now();
        const duration = 600;
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const text = t >= 1 ? target : parsed.format(from + (parsed.value - from) * (1 - Math.pow(1 - t, 4)));
          this.written.add(text);
          node.data = text;
          if (t < 1) this.frame = requestAnimationFrame(step);
        };
        this.frame = requestAnimationFrame(step);
      };
      const mo = new MutationObserver(run);
      mo.observe(this.host, { characterData: true, childList: true, subtree: true });
      run();
      destroy.onDestroy(() => { mo.disconnect(); cancelAnimationFrame(this.frame); });
    });
  }

  private textNode(): Text | null {
    for (const n of Array.from(this.host.childNodes)) if (n.nodeType === Node.TEXT_NODE && /\d/.test(n.textContent ?? '')) return n as Text;
    return null;
  }
}

/** Reads "$164k", "982", "40.1%", "1,036.8" and rebuilds the same shape for intermediate values. */
function parse(text: string): { value: number; pre: string; post: string; format: (v: number) => string } | null {
  const m = /^(\D*?)(-?[\d,]*\.?\d+)(.*)$/s.exec(text.trim());
  if (!m) return null;
  const [, pre, num, post] = m;
  const decimals = num.includes('.') ? num.split('.')[1].length : 0;
  const grouped = num.includes(',');
  const value = Number(num.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const lead = text.slice(0, text.indexOf(text.trim()));
  return {
    value,
    pre,
    post,
    format: (v) => lead + pre + (grouped ? v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : v.toFixed(decimals)) + post,
  };
}

/** Feedback: when a counter goes up, it pops once. Decreases change silently. */
@Directive({ selector: '.badge-count, .count' })
export class CountPop {
  private host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      let prev = Number.parseInt(this.host.textContent ?? '', 10);
      const mo = new MutationObserver(() => {
        const next = Number.parseInt(this.host.textContent ?? '', 10);
        if (Number.isFinite(next) && Number.isFinite(prev) && next > prev && !reduced()) {
          this.host.classList.remove('pop');
          void this.host.offsetWidth;
          this.host.classList.add('pop');
        }
        prev = next;
      });
      mo.observe(this.host, { characterData: true, childList: true, subtree: true });
      this.host.addEventListener('animationend', () => this.host.classList.remove('pop'));
      destroy.onDestroy(() => mo.disconnect());
    });
  }
}

export const MOTION = [Glide, CountUp, CountPop];
