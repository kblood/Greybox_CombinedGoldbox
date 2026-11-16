// Build the static authoring app (GOLDBOX_BUILD=app vite build). No asset-bundling step is
// needed (unlike apps/web) — the editor has no dependency on real game data files.

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, '..');
const env = { ...process.env, GOLDBOX_BUILD: 'app' };

const r = spawnSync(process.execPath, [resolve(APP, 'node_modules/vite/bin/vite.js'), 'build'], {
  stdio: 'inherit',
  cwd: APP,
  env,
});
if (r.status !== 0) {
  console.error(`[build-app] vite build failed, exit ${r.status}`);
  process.exit(r.status ?? 1);
}
console.log('[build-app] done -> dist-app/');
