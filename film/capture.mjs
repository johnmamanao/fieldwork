// Real captures of the running app for the film. Run: node capture.mjs <playwright index.mjs>
// Every screen is the seeded demo studio, Larkspur & Co. Writes media/shots/*.png and media/shots/rects.json.
const pw = await import(process.argv[2] ?? 'playwright');
const { chromium } = pw.default ?? pw;
const OUT = new URL('./media/shots/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const BASE = 'http://localhost:8080';
const b = await chromium.launch();
const rects = {};

async function as(name, fn) {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, timezoneId: 'America/New_York', reducedMotion: 'no-preference' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/login?demo=1', { waitUntil: 'networkidle' });
  await p.locator('.person', { hasText: name }).first().click();
  await p.waitForURL(/overview/); await p.waitForTimeout(1200);
  try { await fn(p); } finally { await ctx.close(); }
}
const rect = async (p, key, sel) => { const r = await p.locator(sel).first().boundingBox().catch(() => null); if (r) rects[key] = r; return r; };
const shot = (p, name, full = false) => p.screenshot({ path: OUT + name + '.png', fullPage: full });
const settle = (p, ms = 900) => p.waitForTimeout(ms);
// hide toasts and the floating quick-action button so frames are clean
const clean = (p) => p.addStyleTag({ content: '.toasts,.toast,fw-toasts{display:none!important}' });

// 1–2. Leo: quick start from Overview, then the running timer on the timesheet
await as('Leo Martins', async (p) => {
  await clean(p);
  await p.getByRole('button', { name: 'Start timer' }).click(); await settle(p, 600);
  const opt = await p.$$eval('#qs-p option', (o) => o.find((x) => /Winter campaign/.test(x.textContent))?.value);
  await p.selectOption('#qs-p', opt); await p.fill('#qs-n', 'Hero video edit'); await settle(p, 300);
  await rect(p, 'quick', '#quick-start'); await rect(p, 'quickBtn', 'header .quick');
  await shot(p, '01-quick-start');
  await p.locator('#quick-start button[type=submit]').click(); await settle(p, 1200);
  await rect(p, 'barTimer', 'header .timer'); await shot(p, '02-timer-bar');
  await p.goto(BASE + '/time', { waitUntil: 'networkidle' }); await clean(p);
  await p.waitForTimeout(40000); // long enough for the live cell to read 0:01
  await rect(p, 'runCard', 'main section.panel'); await rect(p, 'liveCell', 'td.cell button.live'); await rect(p, 'grid', 'table.grid-week, .grid-week');
  await shot(p, '03-timesheet-live');
  // stop and remove the film's entry so Leo's timesheet is as it was
  await p.getByRole('button', { name: /stop and log/i }).click(); await settle(p, 1500);
  const del = await p.evaluate(async () => {
    const tok = localStorage.getItem('fieldwork.token'); const ws = localStorage.getItem('fieldwork.workspace') ?? '1';
    const h = { Authorization: 'Bearer ' + tok, 'X-Workspace-Id': ws, Accept: 'application/json' };
    const r = await (await fetch('/api/time-entries?week=' + new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), { headers: h })).json();
    const mine = r.entries.filter((e) => e.notes === 'Hero video edit' && e.status === 'draft');
    for (const e of mine) await fetch('/api/time-entries/' + e.id, { method: 'DELETE', headers: h });
    return mine.length;
  });
  console.log('film timer entries removed:', del);
  // 6. the turn: Leo's approved week of Oct 12, entries locked "Invoiced"
  await p.goto(BASE + '/time', { waitUntil: 'networkidle' }); await clean(p);
  await p.evaluate(() => scrollTo(0, 0));
  for (let i = 0; i < 4; i++) { await p.locator('button[aria-label*="revious"], .wk-nav button').first().click().catch(() => {}); await settle(p, 500); if ((await p.locator('h2').first().innerText()).includes('Oct 12')) break; }
  await settle(p, 600);
  await rect(p, 'lockedWeek', 'h2'); await shot(p, '06-locked-week', true);
});

// 3. Priya: the approval queue with Leo's submitted week selected
await as('Priya Raman', async (p) => {
  await clean(p);
  await p.goto(BASE + '/time?tab=approvals', { waitUntil: 'networkidle' }); await settle(p, 1200);
  await p.locator('thead input[type=checkbox]').first().check().catch(() => {});
  await settle(p, 600);
  await rect(p, 'selectionBar', '.selection-bar');
  await shot(p, '04-approvals', true);
});

// 4–5, 7–8. Avery: invoices, paid invoice, analytics and the skyline
await as('Avery Brooks', async (p) => {
  await clean(p);
  await p.goto(BASE + '/invoices/25', { waitUntil: 'networkidle' }); await settle(p, 1200);
  await shot(p, '05-invoice', true);
  await p.goto(BASE + '/invoices/5', { waitUntil: 'networkidle' }); await settle(p, 1200);
  await shot(p, '07-paid', true);
  await p.goto(BASE + '/analytics', { waitUntil: 'networkidle' }); await settle(p, 1600);
  await shot(p, '08-analytics');
  await p.getByRole('button', { name: /view as skyline/i }).click(); await settle(p, 2800);
  await p.mouse.move(5, 990); await settle(p, 400);
  await rect(p, 'skyStage', 'aside.sky'); await shot(p, '09-skyline');
});

const { writeFileSync } = await import('node:fs');
writeFileSync(OUT + 'rects.json', JSON.stringify(rects, null, 1));
console.log(Object.keys(rects));
await b.close();
