import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLocalRestylePack, LOCAL_RESTYLE_PACK_STEPS } from '../scripts/build-local-restyle-pack.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function temporaryDirectory(t) {
  const root = mkdtempSync(join(tmpdir(), 'goldbox-local-pack-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('refuses an existing target without changing its contents', (t) => {
  const root = temporaryDirectory(t);
  const target = join(root, 'restyle-pack');
  mkdirSync(target);
  writeFileSync(join(target, 'sentinel.txt'), 'keep');

  assert.throws(() => buildLocalRestylePack(target), /Refusing to replace an existing local Restyle pack/);
  assert.equal(readFileSync(join(target, 'sentinel.txt'), 'utf8'), 'keep');
});

test('refuses targets inside the repository before creating any output', () => {
  const target = join(REPO, 'apps/web/.local-restyle-pack-test');
  assert.throws(() => buildLocalRestylePack(target), /must be outside the repository/);
});

test('packager order preserves metadata before additions and completes coverage before install', () => {
  assert.deepEqual(LOCAL_RESTYLE_PACK_STEPS, [
    'bundle-restyle-stills.mjs',
    'bundle-cok-title-gallery.mjs',
    'bundle-restyle-animations.mjs',
    'bundle-cok-combat-restyle.mjs',
    'bundle-cok-player-appearance.mjs',
    'bundle-cok-dialogue-restyle.mjs',
    'bundle-cok-amiga-dialogue18.mjs',
    'bundle-cok-travel-restyle.mjs',
    'bundle-cok-generated-inventory.mjs',
    'bundle-cok-dos-source-previews.mjs',
    'bundle-cok-dos-tiles-001-previews.mjs',
    'bundle-cok-demo-restyle.mjs',
    'bundle-cok-amiga-dialogue57.mjs',
    'bundle-cok-terrain-restyle.mjs',
    'bundle-cok-wall-restyle.mjs',
    'bundle-cok-title-restyle.mjs',
  ]);
});
