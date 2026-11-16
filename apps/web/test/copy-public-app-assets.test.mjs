import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { copyPublicAppAssets } from '../scripts/copy-public-app-assets.mjs';

const put = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'greybox-public-assets-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const publicRoot = join(root, 'public'), output = join(root, 'dist');
  mkdirSync(publicRoot); mkdirSync(output);
  return { root, publicRoot, output };
}
function files(root, prefix = '') {
  return readdirSync(join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? files(root, path) : [path.replaceAll('\\', '/')];
  });
}

test('production public copy includes only the explicit app-owned file allowlist', (t) => {
  const { publicRoot, output } = fixture(t);
  put(join(publicRoot, 'dragon.svg'), '<svg/>');
  put(join(publicRoot, 'restyle/animations.html'), '<!doctype html>local animation viewer');
  put(join(publicRoot, 'restyle/cok/combat/CPIC1_008_restyle.png'), 'synthetic game art');
  assert.deepEqual(copyPublicAppAssets(output, publicRoot), ['dragon.svg', 'restyle/animations.html']);
  assert.deepEqual(files(output), ['dragon.svg', 'restyle/animations.html']);
  assert.equal(readFileSync(join(output, 'restyle/animations.html'), 'utf8'), '<!doctype html>local animation viewer');
});

test('missing allowlisted source fails before copying any earlier entry', (t) => {
  const { publicRoot, output } = fixture(t);
  put(join(publicRoot, 'dragon.svg'), '<svg/>');
  assert.throws(() => copyPublicAppAssets(output, publicRoot), /ENOENT/);
  assert.deepEqual(files(output), []);
});

test('production Vite build disables recursive public copying and copies allowlisted files after Vite', () => {
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  const build = readFileSync(new URL('../scripts/build-app.mjs', import.meta.url), 'utf8');
  assert.match(config, /publicDir:\s*APP_BUILD\s*\?\s*false\s*:\s*'public'/);
  const vite = build.indexOf("'vite build'");
  const copy = build.indexOf("'copy-public-app-assets'");
  const pack = build.indexOf("'bundle-assets'");
  assert.ok(vite >= 0 && copy > vite && pack > copy, 'safe public files are copied after Vite and before remaining packaging');
});
