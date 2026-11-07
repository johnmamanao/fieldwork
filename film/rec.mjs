// Real screen recordings of the app for the film. The browser streams every frame it paints (CDP screencast,
// JPEG, with timestamps) while the script drives the app at a human pace; a visible cursor is drawn into the page
// so clicks can be seen. Each clip lands in media/rec/<clip>/ as 00000.jpg … plus frames.json [{f, t}].
// Usage: node rec.mjs <playwright index.mjs> <clip|all>
const pw = await import(process.argv[2]);
const { chromium } = pw.default ?? pw;
const { mkdirSync, writeFileSync, rmSync } = await import('node:fs');
const ROOT = new URL('./media/rec/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const BASE = 'http://localhost:8080';
const which = process.argv[3] ?? 'all';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch();

// ------------------------------------------------------------------ session, cursor, recorder
async function session(name) {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1.5, timezoneId: 'America/New_York' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/login?demo=1', { waitUntil: 'networkidle' });
  await p.locator('.person', { hasText: name }).first().click(); await p.waitForURL(/overview/); await p.waitForTimeout(900);
  return { ctx, p };
}
const CURSOR_CSS = `#__cur{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-3px,-2px);transition:transform 60ms}
#__cur.down{transform:translate(-3px,-2px) scale(.86)}
#__ripple{position:fixed;z-index:2147483646;pointer-events:none;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:3px solid #f0512a;opacity:0}
.toasts,.toast{transition:none!important}`;
async function cursor(p) {
  await p.addStyleTag({ content: CURSOR_CSS });
  await p.evaluate(() => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div'); c.id = '__cur';
    c.innerHTML = '<svg viewBox="0 0 26 26" width="26" height="26"><path d="M3 2l18 9.5-7.6 1.9-3.4 7.4z" fill="#121214" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const r = document.createElement('div'); r.id = '__ripple'; document.body.appendChild(r);
    addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', (e) => { c.classList.add('down'); r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      r.animate([{ opacity: .9, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.4)' }], { duration: 420, easing: 'cubic-bezier(.23,1,.32,1)' }); }, true);
    addEventListener('mouseup', () => c.classList.remove('down'), true);
  });
}
let mx = 800, my = 500;
async function moveTo(p, loc, { dx = 0.5, dy = 0.5, steps = 22 } = {}) {
  const bx = await loc.boundingBox(); const x = bx.x + bx.width * dx, y = bx.y + bx.height * dy;
  await p.mouse.move(x, y, { steps }); mx = x; my = y; await sleep(120);
}
async function click(p, loc, opts) { await moveTo(p, loc, opts); await p.mouse.down(); await sleep(90); await p.mouse.up(); await sleep(250); }
async function type(p, text, delay = 70) { await p.keyboard.type(text, { delay }); }

async function record(p, clip, fn) {
  const dir = ROOT + clip + '/'; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const cdp = await p.context().newCDPSession(p);
  const frames = []; let t0 = null, n = 0;
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const ts = metadata.timestamp; if (t0 === null) t0 = ts;
    const f = String(n++).padStart(5, '0'); writeFileSync(dir + f + '.jpg', Buffer.from(data, 'base64'));
    frames.push({ f, t: +(ts - t0).toFixed(3) });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 2400, maxHeight: 1500, everyNthFrame: 1 });
  await sleep(300);
  await fn();
  await sleep(400);
  await cdp.send('Page.stopScreencast');
  writeFileSync(dir + 'frames.json', JSON.stringify(frames));
  console.log(clip, frames.length, 'frames over', frames.at(-1)?.t, 's');
}
async function api(p, method, path, body) {
  return p.evaluate(async ({ method, path, body }) => {
    const h = { Authorization: 'Bearer ' + localStorage.getItem('fieldwork.token'), 'X-Workspace-Id': localStorage.getItem('fieldwork.workspace') ?? '1', Accept: 'application/json', 'Content-Type': 'application/json' };
    const r = await fetch('/api' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, { method, path, body });
}

// ------------------------------------------------------------------ clips
const CLIPS = {};

// LOG: Leo starts the clock from the top bar, on Winter campaign microsite
CLIPS.log = async () => {
  const { ctx, p } = await session('Leo Martins');
  await warm(p); await cursor(p); await p.mouse.move(820, 520);
  await record(p, 'log', async () => {
    await sleep(500);
    await click(p, p.getByRole('button', { name: 'Start timer' }));
    await sleep(450);
    const opt = await p.$$eval('#qs-p option', (o) => o.find((x) => /Winter campaign/.test(x.textContent))?.value);
    await moveTo(p, p.locator('#qs-p')); await p.selectOption('#qs-p', opt); await sleep(500);
    await click(p, p.locator('#qs-n')); await type(p, 'Hero video edit'); await sleep(300);
    await click(p, p.locator('#quick-start button[type=submit]'));
    await p.mouse.move(980, 600, { steps: 18 });
    await sleep(3200);                                // the clock ticks in the top bar
  });
  // stop it: a run this short logs nothing, so Leo's timesheet is untouched
  await p.getByRole('button', { name: 'Stop timer' }).click().catch(() => {}); await sleep(800);
  await ctx.close();
};


// warm a page: open/close the quick-start once so its project list is loaded before the camera rolls
async function warm(p) { await p.getByRole('button', { name: 'Start timer' }).click(); await sleep(700); await p.keyboard.press('Escape'); await sleep(300); }

// SUBMIT: Leo opens his timesheet and submits the week
CLIPS.submit = async () => {
  const { ctx, p } = await session('Leo Martins');
  await p.goto(BASE + '/time', { waitUntil: 'networkidle' }); await sleep(800); await cursor(p); await p.mouse.move(900, 600);
  await record(p, 'submit', async () => {
    await sleep(700);
    await click(p, p.getByRole('button', { name: 'Submit week' }));
    await sleep(2600);
  });
  await ctx.close();
};

// APPROVE: Avery (owner, approves across projects) approves Leo's week
CLIPS.approve = async () => {
  const { ctx, p } = await session('Avery Brooks');
  await p.goto(BASE + '/time?tab=approvals', { waitUntil: 'networkidle' }); await sleep(900); await cursor(p); await p.mouse.move(900, 600);
  await record(p, 'approve', async () => {
    await sleep(500);
    const sel = p.getByLabel('Filter by person');
    await moveTo(p, sel); const v = await sel.locator('option', { hasText: 'Leo Martins' }).getAttribute('value'); await sel.selectOption(v); await sleep(900);
    await click(p, p.locator('thead input[type=checkbox]'));
    await sleep(500);
    await click(p, p.getByRole('button', { name: 'Approve', exact: true }));
    await sleep(2600);
  });
  await ctx.close();
};

// INVOICE: Avery drafts an invoice for Halden / HAL-02, adds the approved time, issues it, records the payment
CLIPS.invoice = async () => {
  const { ctx, p } = await session('Avery Brooks');
  await p.goto(BASE + '/invoices', { waitUntil: 'networkidle' }); await sleep(900); await cursor(p); await p.mouse.move(900, 600);
  await record(p, 'invoice', async () => {
    await sleep(500);
    await click(p, p.getByRole('button', { name: 'New invoice' })); await sleep(500);
    const ic = p.locator('#ic'); await moveTo(p, ic); await ic.selectOption({ label: 'Halden Outdoor Co.' }); await sleep(500);
    const ip = p.locator('#ip'); await moveTo(p, ip); const pv = await ip.locator('option', { hasText: 'Winter campaign' }).getAttribute('value'); await ip.selectOption(pv); await sleep(500);
    await click(p, p.getByRole('button', { name: 'Create draft' }));
    await p.waitForURL(/invoices\/\d+/); await sleep(1300);
    await click(p, p.getByRole('button', { name: 'Add approved time' })); await sleep(900);
    await click(p, p.locator('label.check', { hasText: 'Select all' }).locator('input')); await sleep(600);
    await click(p, p.getByRole('button', { name: /^Add \d+ entries$/ })); await sleep(1500);
    await click(p, p.getByRole('button', { name: 'Issue invoice' }).first()); await sleep(700);
    await click(p, p.locator('fw-dialog').getByRole('button', { name: 'Issue invoice' })); await sleep(2200);
  });
  const url = p.url();
  await record(p, 'pay', async () => {
    await sleep(500);
    await click(p, p.getByRole('link', { name: 'Record payment' }).first()); await sleep(1300);
    await click(p, p.getByRole('button', { name: /^Record \$/ })); await sleep(1400);
    await p.goto(url, { waitUntil: 'networkidle' }); await cursor(p); await p.mouse.move(900, 600); await sleep(2200);
  });
  writeFileSync(ROOT + 'invoice-url.txt', url);
  await ctx.close();
};

// LOCK: Leo's timesheet now shows the Winter campaign entries as Invoiced
CLIPS.lock = async () => {
  const { ctx, p } = await session('Leo Martins');
  await p.goto(BASE + '/time', { waitUntil: 'networkidle' }); await sleep(900); await cursor(p); await p.mouse.move(900, 500);
  await record(p, 'lock', async () => {
    await sleep(600);
    await p.mouse.wheel(0, 700); await sleep(1200);
    await moveTo(p, p.getByText('Invoiced').first()); await sleep(1500);
  });
  await ctx.close();
};

const run = which === 'all' ? Object.keys(CLIPS) : which.split(',');
for (const k of run) await CLIPS[k]();
await b.close();
