// The real skyline animation, frame by frame: the app's clock is frozen and stepped 1/30 s per frame.
// Run: node capture-skyline.mjs <playwright index.mjs>. Writes media/sky/0000.jpg … (the panel only).
const pw = await import(process.argv[2] ?? 'playwright');
const { chromium } = pw.default ?? pw;
const { mkdirSync } = await import('node:fs');
const OUT = new URL('./media/sky/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, timezoneId: 'America/New_York' });
const p = await ctx.newPage();
await p.goto('http://localhost:8080/login?demo=1', { waitUntil: 'networkidle' });
await p.locator('.person', { hasText: 'Avery Brooks' }).first().click(); await p.waitForURL(/overview/);
await p.goto('http://localhost:8080/analytics', { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
await p.addStyleTag({ content: '.toasts,.toast{display:none!important} .sky .legend{visibility:hidden}' });
// from here on, animation time only moves when we say so: performance.now and requestAnimationFrame are
// replaced by a virtual clock that advances one film frame per step
await p.evaluate(() => {
  let vt = performance.now(); const q = [];
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = (ms) => { vt += ms; const cbs = q.splice(0); cbs.forEach((cb) => cb(vt)); };
});
await p.getByRole('button', { name: /view as skyline/i }).click();
await p.waitForTimeout(600);
const panel = p.locator('aside.sky .sky-stage');
await panel.waitFor();
const box = await panel.boundingBox();
const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
const FRAMES = 66;            // 2.2 s of the animation at 30 fps (tilt 520 ms, then the bars rise in a wave)
for (let i = 0; i < FRAMES; i++) {
  await p.screenshot({ path: `${OUT}${String(i).padStart(4, '0')}.jpg`, clip, quality: 88 });
  await p.evaluate(() => window.__step(1000 / 30)); await p.waitForTimeout(40);
}
console.log('frames', FRAMES, 'clip', JSON.stringify(clip));
await b.close();
