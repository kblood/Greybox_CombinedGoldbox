// Synthetic fixtures only: the production archive/ledger remain read-only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  bundleCokDosTiles001Previews, COK_DOS_TILES_001_PREVIEW_CONTRACT,
} from '../scripts/bundle-cok-dos-tiles-001-previews.mjs';
import { encodeTestPng } from '../scripts/restyle-png.mjs';
import { planGraphicsPreviews, requireResolvedGraphicsPreviews } from '../scripts/graphics-preview-plan.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const put = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes); };
function snapshot(root, prefix = '') {
  return readdirSync(join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? [[path, 'directory'], ...snapshot(root, path)] : [[path, sha(readFileSync(join(root, path)))]];
  });
}
function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'cok-dos-tiles-001-preview-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const source = join(temp, 'source'), candidate = join(temp, 'candidate');
  const archivePath = join(temp, 'TILES.DAX'), ledgerPath = join(source, 'dos_tiles_001_48_provenance.json');
  mkdirSync(source); mkdirSync(candidate); put(archivePath, Buffer.from('synthetic pinned archive'));
  const assets = [], restyles = [], rows = [], expectedBytes = new Map();
  for (let global = 0; global < 48; global++) {
    const block = global < 26 ? 1 : 2, tile = global < 26 ? global : global - 26;
    const bank = `TILES_${String(block).padStart(3, '0')}`;
    const sourcePath = join(source, 'dos_tile_render', 'TILES', bank, `${bank}_tile_${String(tile).padStart(3, '0')}.png`);
    const outputPath = join(source, 'done', `CoK_DOS_TILES_001_tile_${String(global).padStart(3, '0')}_restyle.png`);
    const sourceBytes = encodeTestPng(96, 96, [global + 1, 40, 90, 255]);
    const outputBytes = encodeTestPng(96, 96, [90, global + 1, 120, 255]);
    put(sourcePath, sourceBytes); put(outputPath, outputBytes);
    const sourceHash = sha(sourceBytes), outputHash = sha(outputBytes);
    expectedBytes.set(sourceHash, sourceBytes); expectedBytes.set(outputHash, outputBytes);
    const id = `cok/dos-ega/tiles.dax/block/${block}/tile/${tile}`;
    const restyleId = `restyle/cok-dos-tiles-001-${String(block).padStart(3, '0')}-${String(tile).padStart(3, '0')}`;
    rows.push({ global_index: global, source_block: block, source_tile_index: tile,
      source: sourcePath, output: outputPath, size: [96, 96], status: 'saved-reviewed' });
    assets.push({ id, game: 'cok', edition: 'DOS install', platform: 'DOS-EGA', identityStatus: 'source-pinned',
      archive: { name: 'TILES.DAX', path: 'Champions of Krynn/TILES.DAX', sha256: 'ARCHIVE_HASH' },
      locator: { kind: 'tile', blockId: block, entryIndex: block - 1, frameIndex: null, tileIndex: tile, cellIndex: null },
      decoded: { path: `external-source/${sourceHash}.png`, sha256: sourceHash, pixelSha256: 'a'.repeat(64), width: 24, height: 24 } });
    restyles.push({ id: restyleId, sourceAssetIds: [id], sourceRelation: 'one-to-one',
      prompt: { status: 'unknown', batch: null, path: null, sha256: null, textSha256: null,
        inputPath: null, inputSha256: null, text: null, references: [], referenceAssetIds: [] },
      outputs: [{ path: outputPath, sha256: outputHash, role: 'raw-generation' }], reviewStatus: 'generated',
      externalReferences: [{ system: 'cok-dos-tiles-provenance-v1',
        id: `tiles-001-${String(block).padStart(3, '0')}-${String(tile).padStart(3, '0')}`,
        reference: `${ledgerPath.replaceAll('\\', '/')}#outputs/${global}` }] });
  }
  const archiveHash = sha(readFileSync(archivePath));
  for (const asset of assets) asset.archive.sha256 = archiveHash;
  const ledger = { asset_family: 'DOS Champions of Krynn TILES.DAX', bank: 'TILES_001', status: 'saved-reviewed',
    tile_count: 48, source_block_counts: { 1: 26, 2: 22 }, grid: [8, 6], tile_size: [96, 96],
    cell_order: 'global row-major index: block 1 tiles 000-025, then block 2 tiles 000-021', outputs: rows };
  const ledgerBytes = Buffer.from(JSON.stringify(ledger)); put(ledgerPath, ledgerBytes);
  const contract = { ...COK_DOS_TILES_001_PREVIEW_CONTRACT,
    archiveSha256: archiveHash, ledgerSha256: sha(ledgerBytes) };
  const registry = { assets, restyles };
  const bundle = () => bundleCokDosTiles001Previews(source, candidate, registry,
    { archivePath, ledgerPath, contract });
  return { temp, source, candidate, archivePath, ledgerPath, ledger, assets, restyles, registry, expectedBytes, bundle };
}

test('pinned TILES previews package all 48 source/output pairs and satisfy exact planner coverage', (t) => {
  const f = fixture(t), before = snapshot(f.source), registryBefore = structuredClone(f.registry);
  const result = f.bundle();
  assert.equal(result.sourceRows, 48); assert.equal(result.restyleRows, 48);
  assert.equal(result.uniquePreviews, 96); assert.equal(result.copied, 96); assert.equal(result.skipped, 0);
  assert.deepEqual(snapshot(f.source), before); assert.deepEqual(f.registry, registryBefore);
  for (const row of result.previews) {
    assert.deepEqual(readFileSync(join(f.candidate, row.destination)), f.expectedBytes.get(row.sha256));
    assert.equal(sha(readFileSync(join(f.candidate, row.destination))), row.sha256);
  }
  const plan = planGraphicsPreviews(f.registry, f.candidate);
  assert.equal(plan.counts.missing, 0); assert.equal(plan.counts.conflicting, 0);
  assert.equal(plan.counts['unresolved-no-decoded-preview'], 0);
  assert.equal(requireResolvedGraphicsPreviews(plan).available, 96);
  const again = f.bundle(); assert.equal(again.copied, 0); assert.equal(again.skipped, 96);
});

test('archive, ledger, output hash, prompt status and image geometry are fail-closed before writes', (t) => {
  const cases = [
    (f) => { put(f.archivePath, Buffer.from('changed archive')); },
    (f) => { f.ledger.outputs[0].source_tile_index = 1; put(f.ledgerPath, Buffer.from(JSON.stringify(f.ledger))); },
  ];
  for (const mutate of cases) {
    const f = fixture(t), before = snapshot(f.candidate); mutate(f);
    assert.throws(f.bundle); assert.deepEqual(snapshot(f.candidate), before);
  }
  const badOutput = fixture(t), output = badOutput.registry.restyles[0].outputs[0];
  output.sha256 = 'f'.repeat(64); let before = snapshot(badOutput.candidate);
  assert.throws(badOutput.bundle, /Restyle mapping\/hash\/status mismatch/); assert.deepEqual(snapshot(badOutput.candidate), before);
  const badPrompt = fixture(t); badPrompt.registry.restyles[0].prompt.status = 'linked-full-text'; before = snapshot(badPrompt.candidate);
  assert.throws(badPrompt.bundle, /prompt provenance must remain explicitly unknown/); assert.deepEqual(snapshot(badPrompt.candidate), before);
  const badGeometry = fixture(t); put(badGeometry.ledger.outputs[0].source, encodeTestPng(95, 96));
  before = snapshot(badGeometry.candidate);
  assert.throws(badGeometry.bundle, /must be 96x96/); assert.deepEqual(snapshot(badGeometry.candidate), before);
});

test('conflicting candidate bytes reject the whole TILES packaging operation', (t) => {
  const f = fixture(t), first = f.ledger.outputs[0].source;
  const sourceHash = sha(readFileSync(first));
  put(join(f.candidate, 'restyle', 'cok-generated', 'images', `${sourceHash}.png`), Buffer.from('wrong'));
  const before = snapshot(f.candidate);
  assert.throws(f.bundle, /Conflicting candidate preview/);
  assert.deepEqual(snapshot(f.candidate), before);
});

test('DOS TILES previews stay in the user-owned pack and pass exact preview coverage', () => {
  const publicBuild = readFileSync(new URL('../scripts/build-app.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(publicBuild, /bundle-cok-dos-(?:source|tiles-001)-previews\.mjs|graphics-preview-plan\.mjs/);
  const localPack = readFileSync(new URL('../scripts/build-local-restyle-pack.mjs', import.meta.url), 'utf8');
  const lines = localPack.split(/\r?\n/);
  const inventory = lines.findIndex((line) => line.includes("'bundle-cok-generated-inventory.mjs'"));
  const tiles = lines.findIndex((line) => line.includes("'bundle-cok-dos-tiles-001-previews.mjs'"));
  const dosTiles = lines.findIndex((line) => line.includes("'bundle-cok-dos-source-previews.mjs'"));
  const gate = lines.findIndex((line) => line.includes("'graphics-preview-plan.mjs'"));
  assert.ok(inventory >= 0 && dosTiles > inventory && tiles > dosTiles && gate > tiles);
  const tileRun = lines.find((line) => line.includes("run(stageRoot, 'bundle-cok-dos-tiles-001-previews.mjs'"));
  assert.match(tileRun, /root, GENERATED_ROOT/);
});
