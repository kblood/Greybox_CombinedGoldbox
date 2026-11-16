import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import manifest from '../src/ui/cokPlayerAppearanceManifest.json' with { type: 'json' };
import admission from '../src/ui/cokPlayerRestyleAdmission.json' with { type: 'json' };
import bindings from '../src/ui/cokPlayerCanonicalBindings.json' with { type: 'json' };
import { cokPlayerAppearanceHeldRestylePaths, cokPlayerAppearancePackagePlan } from '../src/ui/cok-player-restyle-admission.mjs';
import { bundleCokPlayerAppearance } from '../scripts/bundle-cok-player-appearance.mjs';

const source = resolve(process.env.GB_COK_PLAYER_ART_SOURCE ?? 'C:/GoldBoxImg/cok_restyle_work');

function fixture(t) {
  const temporary = mkdtempSync(join(tmpdir(), 'greybox-player-package-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const input = join(temporary, 'input');
  const output = join(temporary, 'output');
  mkdirSync(input); mkdirSync(output);
  const plan = cokPlayerAppearancePackagePlan(manifest, admission);
  for (const entry of plan) {
    const path = join(input, entry.file);
    mkdirSync(resolve(path, '..'), { recursive: true });
    copyFileSync(join(source, entry.file), path);
  }
  return { input, output, plan };
}

test('metadata-only mode validates player frames and removes only owned image paths', (t) => {
  if (!existsSync(source)) { t.skip(`External player-art source unavailable: ${source}`); return; }
  const { input, output, plan } = fixture(t);
  const owned = [
    ...plan.map((entry) => join(output, 'restyle', 'cok', 'player', entry.dest)),
    ...cokPlayerAppearanceHeldRestylePaths(manifest, admission).map((path) => join(output, 'restyle', 'cok', 'player', path)),
  ];
  for (const path of owned) {
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, 'synthetic stale image');
  }
  const unrelated = join(output, 'restyle', 'unrelated', 'keep.txt');
  mkdirSync(resolve(unrelated, '..'), { recursive: true });
  writeFileSync(unrelated, 'preserve');

  assert.equal(bundleCokPlayerAppearance(input, output, { includeImages: false }), plan.length);
  assert.ok(owned.every((path) => !existsSync(path)), 'All pinned and held image paths owned by this packer are removed');
  assert.equal(readdirSync(resolve(unrelated, '..')).length, 1);
  assert.equal(readdirSync(output, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).length, 1);
});

test('default mode still stages the full pinned appearance roster', (t) => {
  if (!existsSync(source)) { t.skip(`External player-art source unavailable: ${source}`); return; }
  const { input, output, plan } = fixture(t);
  assert.equal(bundleCokPlayerAppearance(input, output), plan.length);
  for (const entry of plan) assert.ok(existsSync(join(output, 'restyle', 'cok', 'player', entry.dest)));
});

test('stale canonical bindings abort before any package output can change', (t) => {
  const temporary = mkdtempSync(join(tmpdir(), 'greybox-player-package-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const input = join(temporary, 'input');
  const output = join(temporary, 'output');
  mkdirSync(input); mkdirSync(output);
  const held = join(output, 'restyle', 'cok', 'player', cokPlayerAppearanceHeldRestylePaths(manifest, admission)[0]);
  mkdirSync(resolve(held, '..'), { recursive: true });
  writeFileSync(held, 'must survive rejection');
  const changed = structuredClone(bindings);
  changed.appearanceSets[0].variants[0].components[0].assetId =
    changed.appearanceSets[0].variants[1].components[0].assetId;
  assert.throws(() => bundleCokPlayerAppearance(input, output, { includeImages: false, bindings: changed }),
    /canonical projection differs/);
  assert.ok(existsSync(held));
  assert.equal(readdirSync(output, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).length, 1);
});
