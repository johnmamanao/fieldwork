// Page positions (CSS px, page coordinates at scroll 0, 1600×1000 viewport) of what each shot pushes into.
const pw = await import(process.argv[2] ?? 'playwright');
const { chromium } = pw.default ?? pw;
const b = await chromium.launch();
const out = {};
async function as(name, fn) {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'America/New_York' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8080/login?demo=1', { waitUntil: 'networkidle' });
  await p.locator('.person', { hasText: name }).first().click(); await p.waitForURL(/overview/); await p.waitForTimeout(800);
  await fn(p); await ctx.close();
}
const box = async (p, key, loc) => { const r = await loc.first().boundingBox().catch(() => null); out[key] = r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
await as('Priya Raman', async (p) => {
  await p.goto('http://localhost:8080/time?tab=approvals', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  await p.locator('thead input[type=checkbox]').first().check().catch(() => {}); await p.waitForTimeout(500);
  await box(p, 'apSelected', p.getByText(/selected ·/)); await box(p, 'apApprove', p.getByRole('button', { name: /^Approve$/ }));
  await box(p, 'apTable', p.locator('table').first()); await box(p, 'apLeoRow', p.locator('tr', { hasText: 'Leo Martins' }).first());
});
await as('Avery Brooks', async (p) => {
  await p.goto('http://localhost:8080/invoices/25', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  await box(p, 'invDue', p.getByText('$16,336.25').first()); await box(p, 'invLeo', p.locator('tr', { hasText: 'Leo Martins (Oct 5' }));
  await box(p, 'invLines', p.locator('table').first()); await box(p, 'invTitle', p.getByRole('heading', { name: 'LK-0024' }));
  await p.goto('http://localhost:8080/invoices/5', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  await box(p, 'paidDue', p.getByText('$0.00').first()); await box(p, 'paidPay', p.getByText('Settled').first()); await box(p, 'paidTitle', p.getByRole('heading', { name: 'LK-0005' }));
  await box(p, 'paidBadge', p.getByText('Paid', { exact: true }).first());
  await p.goto('http://localhost:8080/analytics', { waitUntil: 'networkidle' }); await p.waitForTimeout(1200);
  await box(p, 'anKpis', p.locator('.kpis').first());
});
await as('Leo Martins', async (p) => {
  await p.goto('http://localhost:8080/time', { waitUntil: 'networkidle' }); await p.waitForTimeout(800);
  for (let i = 0; i < 4; i++) { if ((await p.locator('h2').first().innerText()).includes('Oct 12')) break; await p.getByRole('button', { name: 'Previous week' }).click(); await p.waitForTimeout(600); }
  await box(p, 'lkGrid', p.locator('.grid-week').first());
  await box(p, 'lkBadge', p.getByText('Invoiced', { exact: false }).first());
  const all = await p.getByText('Invoiced').all(); out.lkBadges = [];
  for (const l of all) { const r = await l.boundingBox(); if (r) out.lkBadges.push({ x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }); }
  await box(p, 'lkEntries', p.getByRole('heading', { name: 'Entries' }));
});
console.log(JSON.stringify(out, null, 1));
const { writeFileSync } = await import('node:fs');
writeFileSync(new URL('./media/shots/marks.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), JSON.stringify(out, null, 1));
await b.close();
