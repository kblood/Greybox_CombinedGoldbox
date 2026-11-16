// Authored under the source-only hold. This suite never launches Vite/browser/build tooling.
// Real reviewed imports are copied only into an owned temporary fixture, then mutated there.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { bundleCokTitleRestyle } from '../scripts/bundle-cok-title-restyle.mjs';

const SOURCE = process.env.GB_COK_TITLE_IMPORTS
  ?? 'C:/GoldBoxImg/cok_restyle_work/title-gallery-candidate-20261027/restyle/out';
// Independent review pins: sharing the production manifest here would conceal stale #2 drift.
const EXPECTED = [
  { file: '001_band_cok_dos_ssi_presents.png', destination: 'TITLE_001_restyle.png', bytes: 744986,
    width: 1600, height: 1000, colorType: 2, sha256: 'c249541adb4d6b29d9c0de8adedfc81a22244a90fed4aa7938c92c725ed0e886' },
  { file: '010_band_cok_title_art.png', destination: 'TITLE_002_restyle.png', bytes: 2932616,
    width: 1600, height: 1000, colorType: 2, sha256: '429c8f4336ef06724fcc08428e663f746b2c84563b2bcb0ef765eea3b1d26c98' },
  { file: '002_cok_dos_title_logo.png', destination: 'TITLE_003_restyle.png', bytes: 1163750,
    width: 1680, height: 616, colorType: 6, sha256: '608e3dee3f53cab258160438e773e741711aad4b2b0b82c4089b07519b709188' },
  { file: '003_cok_dos_dragonlance_vol1.png', destination: 'TITLE_004_restyle.png', bytes: 866583,
    width: 1600, height: 440, colorType: 6, sha256: '8eab1dd63fe9df2bb670b5655cb873920826684e06cc7270992e71ad7f7ae7fe' },
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function snapshot(root) {
  const walk = (directory, prefix = '') => readdirSync(directory).sort().flatMap((name) => {
    const path = join(directory, name), rel = prefix ? `${prefix}/${name}` : name, stat = lstatSync(path);
    return stat.isDirectory() ? [[rel, 'directory'], ...walk(path, rel)]
      : [[rel, stat.size, sha(readFileSync(path))]];
  });
  return walk(root);
}

function fixture(t) {
  const temporary = mkdtempSync(join(tmpdir(), 'greybox-title-package-'));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const source = join(temporary, 'imports'), output = join(temporary, 'package');
  mkdirSync(source); mkdirSync(output);
  for (const expected of EXPECTED) {
    const bytes = readFileSync(join(SOURCE, expected.file));
    assert.equal(bytes.length, expected.bytes, `Reviewed fixture size: ${expected.file}`);
    assert.equal(sha(bytes), expected.sha256, `Reviewed fixture SHA-256: ${expected.file}`);
    copyFileSync(join(SOURCE, expected.file), join(source, expected.file));
  }
  const gallery = join(output, 'restyle', 'out'); mkdirSync(gallery, { recursive: true });
  writeFileSync(join(gallery, '010_band_cok_title_art.png'), 'stale gallery sentinel: never a runtime title source');
  writeFileSync(join(output, 'unowned.bin'), Buffer.from([0,255,7,12]));
  return { temporary, source, output };
}

test('packages exactly the four independent reviewed imports at unique runtime URLs', (t) => {
  const f = fixture(t), sourceBefore = snapshot(f.source), before = snapshot(f.output);
  writeFileSync(join(f.source, 'unreferenced.png'), 'must never be packaged');
  const files = bundleCokTitleRestyle(f.source, f.output);
  assert.deepEqual(files, EXPECTED.map(({ destination }) => join(f.output, 'restyle', 'cok', 'title', destination)));
  assert.deepEqual(readdirSync(join(f.output, 'restyle', 'cok', 'title')).sort(), EXPECTED.map(({ destination }) => destination));
  for (const expected of EXPECTED) {
    const packaged = readFileSync(join(f.output, 'restyle', 'cok', 'title', expected.destination));
    assert.equal(sha(packaged), expected.sha256);
    assert.equal(packaged.length, expected.bytes);
    assert.equal(packaged.readUInt32BE(16), expected.width);
    assert.equal(packaged.readUInt32BE(20), expected.height);
    assert.equal(packaged[24], 8); assert.equal(packaged[25], expected.colorType);
    assert.deepEqual(packaged, readFileSync(join(f.source, expected.file)), 'No cropping, recompression or regeneration');
  }
  assert.deepEqual(snapshot(f.output).filter(([name]) => !/^restyle\/cok(?:\/|$)/.test(name)), before);
  assert.deepEqual(snapshot(f.source).filter(([name]) => name !== 'unreferenced.png'), sourceBefore);
});

test('metadata-only mode validates all reviewed imports and leaves the output tree unchanged', (t) => {
  const f = fixture(t), before = snapshot(f.output), sourceBefore = snapshot(f.source);
  assert.deepEqual(bundleCokTitleRestyle(f.source, f.output, { includeImages: false }), []);
  assert.deepEqual(snapshot(f.output), before);
  assert.deepEqual(snapshot(f.source), sourceBefore);
});

for (const expected of EXPECTED) for (const failure of ['missing', 'size', 'signature', 'geometry', 'type', 'hash']) {
  test(`rejects ${expected.destination} ${failure} before changing any packaged bytes`, (t) => {
    const f = fixture(t), destination = join(f.output, 'restyle', 'cok', 'title');
    mkdirSync(destination, { recursive: true });
    for (const item of EXPECTED) writeFileSync(join(destination, item.destination), `previous ${item.destination}`);
    const path = join(f.source, expected.file), bytes = readFileSync(path);
    if (failure === 'missing') rmSync(path);
    else {
      if (failure === 'signature') bytes[0] ^= 1;
      if (failure === 'geometry') bytes.writeUInt32BE(expected.width - 1, 16);
      if (failure === 'type') bytes[25] = expected.colorType === 2 ? 6 : 2;
      if (failure === 'hash') bytes[bytes.length - 1] ^= 1;
      writeFileSync(path, failure === 'size' ? bytes.subarray(0, bytes.length - 1) : bytes);
    }
    const before = snapshot(f.output), sourceBefore = snapshot(f.source);
    assert.throws(() => bundleCokTitleRestyle(f.source, f.output), /ENOENT|size differs|Invalid title PNG|geometry\/type differs|SHA-256 differs/);
    assert.deepEqual(snapshot(f.output), before, 'Preflight must reject before the first output write');
    assert.deepEqual(snapshot(f.source), sourceBefore, 'Invalid input must never be repaired or changed');
  });
}

test('missing external root and overlapping source/output fail closed', (t) => {
  const f = fixture(t), before = snapshot(f.output);
  assert.throws(() => bundleCokTitleRestyle(join(f.temporary, 'absent'), f.output), /ENOENT/);
  assert.throws(() => bundleCokTitleRestyle(f.source, f.source), /must not overlap/);
  const nested = join(f.source, 'nested'); mkdirSync(nested);
  assert.throws(() => bundleCokTitleRestyle(f.source, nested), /must not overlap/);
  assert.deepEqual(snapshot(f.output), before);
});

for (const field of ['sha256', 'bytes', 'width', 'colorType', 'destination']) {
  test(`an isolated mutated block-2 manifest ${field} cannot package the reviewed fixture`, async (t) => {
    const f = fixture(t), moduleRoot = join(f.temporary, 'mutated-module');
    const scripts = join(moduleRoot, 'scripts'), ui = join(moduleRoot, 'src', 'ui');
    mkdirSync(scripts, { recursive: true }); mkdirSync(ui, { recursive: true });
    const manifest = JSON.parse(readFileSync(new URL('../src/ui/cokTitleRestyleManifest.json', import.meta.url), 'utf8'));
    const entry = manifest.blocks['2'];
    entry[field] = field === 'sha256' ? '0'.repeat(64) : field === 'destination' ? 'TITLE_001_restyle.png' : entry[field] + 1;
    writeFileSync(join(ui, 'cokTitleRestyleManifest.json'), JSON.stringify(manifest));
    const script = join(scripts, 'bundle-cok-title-restyle.mjs');
    copyFileSync(new URL('../scripts/bundle-cok-title-restyle.mjs', import.meta.url), script);
    const isolated = await import(pathToFileURL(script).href);
    const before = snapshot(f.output), sourceBefore = snapshot(f.source);
    assert.throws(() => isolated.bundleCokTitleRestyle(f.source, f.output),
      /size differs|geometry\/type differs|SHA-256 differs|Invalid reviewed title import\/destination mapping/);
    assert.deepEqual(snapshot(f.output), before);
    assert.deepEqual(snapshot(f.source), sourceBefore);
  });
}

test('normal build packages the unique title lane before the public artifact audit', () => {
  const build = readFileSync(new URL('../scripts/build-app.mjs', import.meta.url), 'utf8');
  const step = build.indexOf("scripts/bundle-cok-title-restyle.mjs");
  assert.ok(step >= 0);
  // The audit is the call site (auditOutput(OUTPUT, ...)); the module is imported, not spelled as a path.
  const audit = build.indexOf('auditOutput(OUTPUT');
  assert.ok(audit > step, 'title lane step must come before the public artifact audit call');
  const runtime = readFileSync(new URL('../src/ui/cokTitleArt.ts', import.meta.url), 'utf8');
  assert.ok(runtime.includes('restyle/cok/title/${expected.destination}'));
  assert.ok(!runtime.includes('restyle/out/'), 'Runtime must never consume the stale gallery title path');
  assert.ok(runtime.includes("import manifest from './cokTitleRestyleManifest.json'"));
  for (const block of [1,2,3,4]) assert.ok(runtime.includes(`Object.freeze(manifest.blocks[${block}])`));
});
