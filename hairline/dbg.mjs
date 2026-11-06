import { readFileSync } from 'node:fs'; import vm from 'node:vm'; import os from 'node:os';
const ctx = { window: {}, matchMedia: () => ({ matches: false, addEventListener() {} }), performance, console };
vm.createContext(ctx); vm.runInContext(readFileSync(os.homedir() + '/.claude/skills/hairline-create/kernel.js', 'utf8') + ';globalThis.HL=HL;', ctx);
const src = readFileSync('keybox.js', 'utf8');
const body = src.slice(src.indexOf('const ROLES'), src.indexOf('function mount'));
const f = new Function('HL', 'const {fillet, rad} = HL;' + body + 'return outline;')(ctx.HL);
for (let i = 0; i < 6; i++) { const o = f(i); const bad = o.findIndex((p) => p.some(Number.isNaN)); console.log(i, o.length, 'first NaN at', bad); }
