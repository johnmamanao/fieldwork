// Prints screen points for world points, using the kernel's own camera maths.
// usage: node pts.mjs S cx,cy "fitpts as JSON" "query pts as JSON"
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
const src = readFileSync(os.homedir() + '/.claude/skills/hairline-create/kernel.js', 'utf8');
const ctx = { window: {}, matchMedia: () => ({ matches: false, addEventListener() {} }), performance, console };
vm.createContext(ctx); vm.runInContext(src + '\n;globalThis.HL = HL;', ctx);
const [S, c, fitPts, q] = process.argv.slice(2);
const HL = ctx.HL, C = HL.Cam(45, 0.5, Number(S)), [cx, cy] = c.split(',').map(Number);
HL.fit(C, JSON.parse(fitPts), cx, cy);
const P = HL.proj(C);
const all = JSON.parse(fitPts).map((p) => P(...p));
const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
console.log('fit box', Math.round(Math.min(...xs)), Math.round(Math.min(...ys)), Math.round(Math.max(...xs)), Math.round(Math.max(...ys)));
for (const p of JSON.parse(q)) console.log(JSON.stringify(p), '->', P(...p).map(Math.round).join(','));
