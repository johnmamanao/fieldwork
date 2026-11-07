// Production build for CI hosts (Vercel). `ng build` finishes its work but can stay running, held open by an
// idle esbuild service process, so a host would wait until its build timeout. This runs the normal build, ends
// it once Angular reports where it wrote the files, and fails if the build reported an error.
import { spawn } from 'node:child_process';

const ng = spawn(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'build', ...process.argv.slice(2)], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NG_CLI_ANALYTICS: 'false' },
});

let failed = false, done = false;
function watch(chunk, out) {
  const text = chunk.toString();
  out.write(text);
  if (/\[ERROR\]|^Error:|An unhandled exception/m.test(text)) failed = true;
  if (!done && /Output location:/.test(text)) {
    done = true;
    setTimeout(() => { ng.kill('SIGTERM'); process.exit(failed ? 1 : 0); }, 1500);
  }
}
ng.stdout.on('data', (c) => watch(c, process.stdout));
ng.stderr.on('data', (c) => watch(c, process.stderr));
ng.on('exit', (code) => { if (!done) process.exit(code ?? 1); });
