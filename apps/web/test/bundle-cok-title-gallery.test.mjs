// Source authored under the execution hold; do not interpret this file as a run receipt.
// Fixtures use reviewed local imports, never synthetic replacements for the image hash pins.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { bundleCokTitleGallery } from '../scripts/bundle-cok-title-gallery.mjs';

const SOURCE = process.env.GB_COK_TITLE_GALLERY
  ?? 'C:/GoldBoxImg/cok_restyle_work/title-gallery-candidate-20261027/restyle';
const BASE = fileURLToPath(new URL('../../../renders/restyle-site/restyle', import.meta.url));
const TITLE = [
  ['001_band_cok_dos_ssi_presents', 'c249541adb4d6b29d9c0de8adedfc81a22244a90fed4aa7938c92c725ed0e886'],
  ['010_band_cok_title_art', '429c8f4336ef06724fcc08428e663f746b2c84563b2bcb0ef765eea3b1d26c98'],
  ['002_cok_dos_title_logo', '608e3dee3f53cab258160438e773e741711aad4b2b0b82c4089b07519b709188'],
  ['003_cok_dos_dragonlance_vol1', '8eab1dd63fe9df2bb670b5655cb873920826684e06cc7270992e71ad7f7ae7fe'],
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const load = (path) => JSON.parse(readFileSync(path, 'utf8'));
function snapshot(root) {
  return readdirSync(root).sort().flatMap((name) => {
    const path = join(root, name), stat = lstatSync(path);
    return stat.isDirectory() ? [[name, 'directory'], ...snapshot(path).map(([rel, ...rest]) => [`${name}/${rel}`, ...rest])]
      : [[name, sha(readFileSync(path))]];
  });
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'greybox-title-gallery-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source'), output = join(root, 'package'), target = join(output, 'restyle');
  for (const [from, to] of [[SOURCE, source], [BASE, target]]) {
    for (const file of ['manifest.json', 'fidelity.json', ...TITLE.flatMap(([stem]) => [`orig/${stem}.png`, `out/${stem}.png`])]) {
      mkdirSync(dirname(join(to, file)), { recursive: true });
      copyFileSync(join(from, file), join(to, file));
    }
  }
  for (const file of ['game-manifest.json', 'restyle/anim/hub/frame0.png', 'restyle/animations.html',
    'restyle/cok/generated-inventory.json', 'restyle/orig/unrelated.png', 'restyle/out/unrelated.png']) {
    mkdirSync(dirname(join(output, file)), { recursive: true }); writeFileSync(join(output, file), `preserve ${file}`);
  }
  return { root, source, output, target };
}
function edit(path, mutate) { const value = load(path); mutate(value); writeFileSync(path, JSON.stringify(value)); }

test('corrects only title #2 PNG/metadata/fidelity, preserves all siblings, and repeats without writes', (t) => {
  const f = fixture(t), before = snapshot(f.output), sourceBefore = snapshot(f.source);
  const manifestBefore = load(join(f.target, 'manifest.json')), fidelityBefore = load(join(f.target, 'fidelity.json'));
  assert.equal(sha(readFileSync(join(f.target, 'out', `${TITLE[1][0]}.png`))),
    'bd8d068ad61eab73f2dd6e125c8451fc9736f6ec6d133da8ae8f4ad7ecd54e97');
  const changed = bundleCokTitleGallery(f.source, f.output);
  assert.deepEqual(changed, [`out/${TITLE[1][0]}.png`, 'fidelity.json', 'manifest.json'].map((name) => join(f.target, name)));
  for (const [stem, expected] of TITLE) assert.equal(sha(readFileSync(join(f.target, 'out', `${stem}.png`))), expected);
  const manifest = load(join(f.target, 'manifest.json')), fidelity = load(join(f.target, 'fidelity.json'));
  const card = manifest.items.find((item) => item.id === 'band_cok_title_art');
  assert.equal(card.input, '010_band_cok_title_art_corrected_input.png');
  assert.equal(card.prompt, '010_band_cok_title_art_strict_prompt_used.txt');
  assert.equal(card.expected_output, 'restyle/out/010_band_cok_title_art.png');
  assert.equal(card.restyle_lineage.prompt_sha256, '0780ceb60baecc299a95f7eb9ff29043db71c6505e5a5809f1e7866132190223');
  assert.equal(card.source_decoded_pixel_sha256, '969c8e42b9c885af221b4f47505f49c7b8f845eb35f5c7e98ef01f422bbd242b');
  const metric = fidelity.results.find((item) => item.id === card.id);
  assert.deepEqual([metric.edge_corr, metric.hist_dist, metric.aspect_dev, metric.verdict], [0.8386, 0.2536, 0, 'ok']);
  manifest.items[manifest.items.findIndex((item) => item.id === card.id)] = manifestBefore.items.find((item) => item.id === card.id);
  fidelity.results[fidelity.results.findIndex((item) => item.id === card.id)] = fidelityBefore.results.find((item) => item.id === card.id);
  assert.deepEqual(manifest, manifestBefore); assert.deepEqual(fidelity, fidelityBefore);
  const changedNames = new Set(changed.map((path) => path.slice(f.output.length + 1).replaceAll('\\', '/')));
  assert.deepEqual(snapshot(f.output).filter(([name]) => !changedNames.has(name)), before.filter(([name]) => !changedNames.has(name)));
  assert.deepEqual(snapshot(f.source), sourceBefore);
  const corrected = snapshot(f.output);
  assert.deepEqual(bundleCokTitleGallery(f.source, f.output), []);
  assert.deepEqual(snapshot(f.output), corrected);
});

test('metadata-only correction validates source art and updates only the title card metadata', (t) => {
  const f = fixture(t);
  rmSync(join(f.target, 'orig'), { recursive: true });
  rmSync(join(f.target, 'out'), { recursive: true });
  const before = snapshot(f.output), sourceBefore = snapshot(f.source);
  const changed = bundleCokTitleGallery(f.source, f.output, { includeImages: false });
  assert.deepEqual(changed, ['fidelity.json', 'manifest.json'].map((name) => join(f.target, name)));
  assert.equal(existsSync(join(f.target, 'orig')), false);
  assert.equal(existsSync(join(f.target, 'out')), false);
  const manifest = load(join(f.target, 'manifest.json'));
  const card = manifest.items.find((item) => item.id === 'band_cok_title_art');
  assert.equal(card.input, '010_band_cok_title_art_corrected_input.png');
  assert.equal(card.prompt, '010_band_cok_title_art_strict_prompt_used.txt');
  assert.deepEqual(snapshot(f.source), sourceBefore);
  const corrected = snapshot(f.output).filter(([name]) => !['restyle/manifest.json', 'restyle/fidelity.json'].includes(name));
  const original = before.filter(([name]) => !['restyle/manifest.json', 'restyle/fidelity.json'].includes(name));
  assert.deepEqual(corrected, original);
  assert.deepEqual(bundleCokTitleGallery(f.source, f.output, { includeImages: false }), []);
});

for (const side of ['source', 'target']) for (const [stem] of TITLE) for (const failure of ['missing', 'hash', 'identity', 'geometry', 'fidelity']) {
  test(`rejects ${side} ${stem} ${failure} before changing package`, (t) => {
    const f = fixture(t), root = f[side];
    const path = join(root, 'out', `${stem}.png`);
    if (failure === 'missing') rmSync(path);
    if (failure === 'hash') { const bytes = readFileSync(path); bytes[bytes.length - 1] ^= 1; writeFileSync(path, bytes); }
    if (failure === 'identity' || failure === 'geometry') edit(join(root, 'manifest.json'), (data) => {
      const item = data.items.find((item) => item.stem === stem);
      if (failure === 'identity') item.source_block = 99; else item.native_w++;
    });
    if (failure === 'fidelity') edit(join(root, 'fidelity.json'), (data) => { data.results.find((item) => item.stem === stem).edge_corr = -1; });
    const before = snapshot(f.output), sourceBefore = snapshot(f.source);
    assert.throws(() => bundleCokTitleGallery(f.source, f.output), /ENOENT|SHA-256|differs|Invalid restyle fidelity/);
    assert.deepEqual(snapshot(f.output), before); assert.deepEqual(snapshot(f.source), sourceBefore);
  });
}

test('rejects mismatched prompt lineage and a mixed corrected-output/stale-metadata target', (t) => {
  const f = fixture(t);
  edit(join(f.source, 'manifest.json'), (data) => { data.items.find((item) => item.id === 'band_cok_title_art').restyle_lineage.prompt_sha256 = '0'.repeat(64); });
  const before = snapshot(f.output);
  assert.throws(() => bundleCokTitleGallery(f.source, f.output), /metadata\/lineage/);
  assert.deepEqual(snapshot(f.output), before);
  copyFileSync(join(SOURCE, 'manifest.json'), join(f.source, 'manifest.json'));
  copyFileSync(join(f.source, 'out', `${TITLE[1][0]}.png`), join(f.target, 'out', `${TITLE[1][0]}.png`));
  const mixed = snapshot(f.output);
  assert.throws(() => bundleCokTitleGallery(f.source, f.output), /SHA-256/);
  assert.deepEqual(snapshot(f.output), mixed);
});

test('rolls back a mid-install failure exactly and removes only its own stage', (t) => {
  const f = fixture(t), before = snapshot(f.output), sourceBefore = snapshot(f.source);
  let calls = 0;
  assert.throws(() => bundleCokTitleGallery(f.source, f.output, { rename(from, to) {
    if (++calls === 4) throw new Error('injected rename failure');
    renameSync(from, to);
  } }), /injected rename failure/);
  assert.deepEqual(snapshot(f.output), before); assert.deepEqual(snapshot(f.source), sourceBefore);
});

test('retains recoverable backups and reports both errors if rollback itself fails', (t) => {
  const f = fixture(t);
  let calls = 0;
  assert.throws(() => bundleCokTitleGallery(f.source, f.output, { rename(from, to) {
    calls++;
    if (calls === 4 || calls === 5) throw new Error(`injected rename failure ${calls}`);
    renameSync(from, to);
  } }), (error) => error instanceof AggregateError && error.errors.length === 2 && /backups retained/.test(error.message));
  const stages = readdirSync(f.output).filter((name) => name.startsWith('.cok-title-gallery-'));
  assert.equal(stages.length, 1);
  assert.ok(readFileSync(join(f.output, stages[0], 'backup', 'fidelity.json')).length);
  assert.equal(sha(readFileSync(join(f.output, stages[0], 'backup', 'out', `${TITLE[1][0]}.png`))),
    'bd8d068ad61eab73f2dd6e125c8451fc9736f6ec6d133da8ae8f4ad7ecd54e97');
});

for (const side of ['source', 'target']) for (const name of ['manifest.json', 'fidelity.json', `orig/${TITLE[3][0]}.png`]) {
  test(`rejects missing ${side} ${name} before any mutation`, (t) => {
    const f = fixture(t); rmSync(join(f[side], name));
    const before = snapshot(f.output);
    assert.throws(() => bundleCokTitleGallery(f.source, f.output), /ENOENT/);
    assert.deepEqual(snapshot(f.output), before);
  });
}

test('rejects overlapping roots, protected persistent output, file links and directory junctions', (t) => {
  const f = fixture(t);
  assert.throws(() => bundleCokTitleGallery(f.source, f.source), /must not overlap/);
  assert.throws(() => bundleCokTitleGallery(f.source, BASE), /must not overlap/);
  const path = join(f.source, 'out', `${TITLE[0][0]}.png`), saved = `${path}.saved`;
  renameSync(path, saved); linkSync(saved, path);
  assert.throws(() => bundleCokTitleGallery(f.source, f.output), /unlinked regular/);
  rmSync(path); renameSync(saved, path);
  const alias = join(f.root, 'alias'); symlinkSync(f.source, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => bundleCokTitleGallery(alias, f.output), /unlinked regular/);
});

test('normal build applies gallery correction immediately after persistent still packaging', () => {
  const source = readFileSync(new URL('../scripts/build-app.mjs', import.meta.url), 'utf8');
  const stills = source.indexOf('scripts/bundle-restyle-stills.mjs');
  const correction = source.indexOf('scripts/bundle-cok-title-gallery.mjs');
  assert.ok(stills >= 0 && correction > stills && correction < source.indexOf('scripts/bundle-restyle-animations.mjs'));
});
