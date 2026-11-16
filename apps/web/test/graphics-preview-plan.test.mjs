import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { planGraphicsPreviews, requireResolvedGraphicsPreviews } from '../scripts/graphics-preview-plan.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytes = Buffer.from('synthetic source bytes'), hash = sha(bytes);
const hashPath = `restyle/cok-generated/images/${hash}.png`;
const source = (id, path = 'images/source.png', digest = hash) => ({ id, decoded: { path, sha256: digest } });
const registry = (assets, restyles = []) => ({ assets, restyles });
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'graphics-preview-plan-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (path, value = bytes) => { const full = join(root, path); mkdirSync(dirname(full), { recursive: true }); writeFileSync(full, value); };
  const manifest = (items) => put('restyle/manifest.json', JSON.stringify({ items }));
  return { root, put, manifest };
}
function snapshot(root, prefix = '') {
  return readdirSync(join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? [[path, 'directory'], ...snapshot(root, path)] : [[path, sha(readFileSync(join(root, path)))]];
  });
}

test('shared source and output hashes retain references in one deterministic record without writes', (t) => {
  const f = fixture(t); f.put(hashPath);
  const input = registry([source('z'), source('a')], [{ id: 'r', outputs: [{ path: 'images/output.png', sha256: hash }] }]);
  const before = structuredClone(input), files = snapshot(f.root);
  const result = planGraphicsPreviews(input, f.root);
  assert.equal(result.records.length, 1); assert.equal(result.counts.available, 1);
  assert.equal(result.records[0].references.length, 3);
  assert.deepEqual(result, planGraphicsPreviews(registry([...input.assets].reverse(), input.restyles), f.root));
  assert.deepEqual(input, before); assert.deepEqual(snapshot(f.root), files);
});

test('decoded-path fallbacks use exact browser order and distinguish missing metadata from missing files', (t) => {
  const f = fixture(t); f.put('restyle/cok/images/source.png');
  const result = planGraphicsPreviews(registry([source('fallback'), { id: 'absent', decoded: null }, source('missing', '', 'b'.repeat(64))]), f.root);
  assert.deepEqual(result.counts, { available: 1, missing: 1, conflicting: 0, 'unresolved-no-decoded-preview': 1 });
  assert.deepEqual(result.records.find((row) => row.sha256 === hash).references[0].candidates.map((row) => [row.path, row.state]),
    [[hashPath, 'missing'], ['restyle/images/source.png', 'missing'], ['restyle/cok/images/source.png', 'available']]);
});

test('wrong bytes under hash filename remain conflicting even when a fallback matches', (t) => {
  const f = fixture(t); f.put(hashPath, 'wrong'); f.put('restyle/images/source.png');
  const result = planGraphicsPreviews(registry([source('a')]), f.root);
  assert.equal(result.records[0].state, 'conflicting');
  assert.equal(result.records[0].references[0].candidates[0].reason, 'sha256-mismatch');
});

test('an exact earlier candidate wins over later wrong bytes or unsafe paths', (t) => {
  const f = fixture(t); f.put(hashPath); f.put('restyle/images/source.png', 'wrong');
  for (const path of ['images/source.png', '../../outside.png']) {
    const result = planGraphicsPreviews(registry([source('a', path)]), f.root);
    assert.equal(result.records[0].state, 'available');
    const reference = result.records[0].references[0];
    assert.equal(reference.state, 'available');
    assert.equal(reference.candidates[0].state, 'available');
    assert.equal(reference.candidates[1].state, 'conflicting', 'later issue remains visible as a diagnostic');
  }
});

test('the first existing fallback decides coverage after a missing hash path', (t) => {
  const f = fixture(t); f.put('restyle/images/source.png'); f.put('restyle/cok/images/source.png', 'wrong');
  const input = registry([source('a')]);
  assert.equal(planGraphicsPreviews(input, f.root).records[0].state, 'available');
  f.put('restyle/images/source.png', 'wrong'); f.put('restyle/cok/images/source.png');
  assert.equal(planGraphicsPreviews(input, f.root).records[0].state, 'conflicting');
});

test('curated original fallback requires normalized source-path equality and exact bytes', (t) => {
  const f = fixture(t);
  f.manifest([{ src: 'renders/amiga_render_all/PIC1/PIC1_057.png', stem: 'correct' }]);
  f.put('restyle/orig/correct.png');
  const input = registry([source('a', 'C:\\GoldBoxImg\\cok_restyle_work\\amiga_render_all\\PIC1\\PIC1_057.png')]);
  assert.equal(planGraphicsPreviews(input, f.root).records[0].state, 'available');
  f.put('restyle/orig/correct.png', 'wrong');
  assert.equal(planGraphicsPreviews(input, f.root).records[0].state, 'conflicting');
  f.manifest([{ src: 'PIC2/PIC1_057.png', stem: 'correct' }]);
  assert.equal(planGraphicsPreviews(input, f.root).records[0].state, 'missing');
});

test('curated selection uses first exact path match, never a later matching-byte substitute', (t) => {
  const f = fixture(t);
  f.manifest([{ src: 'images/source.png', stem: 'first' }, { src: 'images/source.png', stem: 'second' }]);
  f.put('restyle/orig/first.png', 'wrong'); f.put('restyle/orig/second.png');
  const result = planGraphicsPreviews(registry([source('a')]), f.root);
  assert.equal(result.records[0].state, 'conflicting');
  assert.equal(result.records[0].references[0].candidates.at(-1).path, 'restyle/orig/first.png');
});

test('traversal and URL modifiers are rejected rather than resolved outside the candidate', (t) => {
  const f = fixture(t);
  for (const path of ['../../outside.png', '%2e%2e/%2e%2e/outside.png', '..\\..\\outside.png', '.. /outside.png', 'source.png?x=1', 'https://example.test/image.png']) {
    const result = planGraphicsPreviews(registry([source('a', path)]), f.root);
    assert.equal(result.records[0].state, 'conflicting', path);
    assert.equal(result.records[0].references[0].candidates[1].reason, 'unsafe-path', path);
  }
  f.manifest([{ src: 'images/source.png', stem: '../../outside' }]);
  assert.equal(planGraphicsPreviews(registry([source('a')]), f.root).records[0].state, 'conflicting');
});

test('shared bytes do not mask a missing reference-specific browser location', (t) => {
  const f = fixture(t); f.put('restyle/one.png');
  const result = planGraphicsPreviews(registry([source('a', 'one.png'), source('b', 'two.png')]), f.root);
  assert.equal(result.records.length, 1); assert.equal(result.records[0].state, 'missing');
  assert.deepEqual(result.records[0].references.map((ref) => ref.state), ['available', 'missing']);
});

test('invalid hashes fail closed and malformed optional manifest is reported', (t) => {
  const f = fixture(t); f.put('restyle/manifest.json', 'not json');
  f.put(hashPath);
  const result = planGraphicsPreviews(registry([source('a')]), f.root);
  assert.equal(result.curatedManifest.state, 'conflicting'); assert.equal(result.records[0].state, 'available');
  assert.throws(() => planGraphicsPreviews(registry([source('a', 'one.png', '../outside')]), f.root), /Invalid preview SHA/);
});

test('linked directories cannot supply previews from outside the candidate', (t) => {
  const f = fixture(t), outside = fixture(t);
  outside.put('source.png'); f.put('restyle/placeholder');
  symlinkSync(outside.root, join(f.root, 'restyle', 'linked'), 'junction');
  const result = planGraphicsPreviews(registry([source('a', 'linked/source.png')]), f.root);
  assert.equal(result.records[0].state, 'conflicting');
  assert.equal(result.records[0].references[0].candidates[1].reason, 'linked-path');
  assert.throws(() => planGraphicsPreviews(registry([]), join(f.root, 'restyle', 'linked')), /ordinary directory/);
});

test('Restyle outputs are audited independently with their own paths and hashes', (t) => {
  const f = fixture(t); f.put('restyle/cok/out/candidate.png');
  const result = planGraphicsPreviews(registry([], [{ id: 'r', outputs: [
    { path: 'out/candidate.png', sha256: hash }, { path: 'out/missing.png', sha256: 'b'.repeat(64) },
  ] }]), f.root);
  assert.deepEqual(result.counts, { available: 1, missing: 1, conflicting: 0, 'unresolved-no-decoded-preview': 0 });
  assert.equal(result.records.find((row) => row.sha256 === hash).references[0].kind, 'restyle-output');
});

function curatedOutputFixture() {
  const asset = { id: 'source-a', decoded: null, galleryReferences: [
    { system: 'cok-curated-restyle-v1', id: 'card-a', outputSha256: hash },
  ] };
  const restyle = { id: 'restyle-a', sourceAssetIds: ['source-a'], outputs: [{ path: 'C:/external/output.png', sha256: hash }] };
  return registry([asset], [restyle]);
}

test('curated output joins exact source membership, reference hash and manifest ID', (t) => {
  const f = fixture(t); f.manifest([{ id: 'card-a', stem: 'unrelated_filename' }]);
  f.put('restyle/out/unrelated_filename.png');
  const input = curatedOutputFixture(), before = structuredClone(input);
  const output = planGraphicsPreviews(input, f.root).records.find((row) => row.sha256 === hash);
  assert.equal(output.state, 'available');
  assert.equal(output.references[0].candidates.at(-1).path, 'restyle/out/unrelated_filename.png');
  assert.deepEqual(input, before);
  f.put('restyle/out/unrelated_filename.png', 'wrong');
  assert.equal(planGraphicsPreviews(input, f.root).records.find((row) => row.sha256 === hash).state, 'conflicting');
});

test('curated output rejects wrong hash, card ID, source membership and reference system', (t) => {
  const f = fixture(t); f.manifest([{ id: 'card-a', stem: 'candidate' }]); f.put('restyle/out/candidate.png');
  for (const mutate of [
    (input) => { input.assets[0].galleryReferences[0].outputSha256 = 'b'.repeat(64); },
    (input) => { input.assets[0].galleryReferences[0].id = 'card-b'; },
    (input) => { input.restyles[0].sourceAssetIds = ['other-source']; },
    (input) => { input.assets[0].galleryReferences[0].system = 'other-gallery'; },
  ]) {
    const input = curatedOutputFixture(); mutate(input);
    const output = planGraphicsPreviews(input, f.root).records.find((row) => row.sha256 === hash);
    assert.equal(output.state, 'missing');
    assert.deepEqual(output.references[0].candidates.map((row) => row.path), [hashPath]);
  }
});

test('curated output forbids unsafe stems and preserves earlier exact candidate precedence', (t) => {
  const f = fixture(t), input = curatedOutputFixture();
  f.manifest([{ id: 'card-a', stem: '../escape' }]);
  assert.equal(planGraphicsPreviews(input, f.root).records.find((row) => row.sha256 === hash).state, 'missing');
  f.manifest([{ id: 'card-a', stem: 'candidate' }]); f.put('restyle/out/candidate.png', 'wrong'); f.put(hashPath);
  const output = planGraphicsPreviews(input, f.root).records.find((row) => row.sha256 === hash);
  assert.equal(output.state, 'available');
  assert.equal(output.references[0].candidates.at(-1).state, 'conflicting');
});

function hubInventoryFixture() {
  const sourceHash = sha(Buffer.from('hub source')), outputHash = sha(Buffer.from('hub restyle'));
  const frameHash = sha(Buffer.from('hub changed frame')), promptHash = '4'.repeat(64);
  const animation = { id: 'test-hub', label: 'Hub test', basisSourceSha256: sourceHash, basisOutputSha256: outputHash,
    playbackOrder: ['r0', 'r1', 'r0'], frames: {
      r0: { sha256: outputHash, size: [8, 8], note: 'restyled frame 0; shared basis for every change', promptReference: null },
      r1: { sha256: frameHash, size: [8, 8], note: 'changed frame', promptReference: {
        file: 'hub/hub1_prompt.txt', sha256: promptHash, inputSha256: outputHash, outputSha256: frameHash, text: 'change independently from r0',
      } },
    }, playbackEvidence: 'hub/PLAYBACK.md', derivation: 'Each change uses r0.' };
  const item = { id: 'asset-0001-aaaaaaaaaaaa', stem: 'asset-0001-aaaaaaaaaaaa', label: 'test', family: 'PIC1', families: ['PIC1'],
    platform: 'Amiga', platforms: ['Amiga'], source: `images/${sourceHash}.png`, output: `images/${outputHash}.png`, sourceName: 'source.png',
    sourceProvenance: 'source.png', sourceSha256: sourceHash, outputSha256: outputHash,
    outputType: 'Generated/restyled variant', sourceSize: [8, 8], outputSize: [8, 8], ledgerStatuses: ['generated'],
    aliases: [{ ledger: 'fixture.json', status: 'generated', family: 'PIC1', platform: 'Amiga' }], sourceMatched: true,
    compositionReview: 'not-reviewed', runtimeApproved: false, runtimeApprovalEvidence: [], prompt: 'prompt unavailable', reviewNotes: [],
    animations: [animation], promptReferences: [] };
  const inventory = { schema: 'cok-restyle-inventory-v1', assets: [item], externalComparisons: [], excluded: [], held: [],
    counts: { ledgerRecords: 1, eligibleRecords: 1, sourceOutputEdges: 1, tileAliasRows: 0, uniquePairs: 1,
      externalComparisonAliases: 0, aliasEdges: 0, animations: 1, animationPlaybackSteps: 3, excludedRows: 0, heldRows: 0,
      uniquePngFiles: 3, uniquePngBytes: 1 } };
  const linkedRegistry = registry([{ id: 'source-id', decoded: { path: `images/${sourceHash}.png`, sha256: sourceHash } }], [{
    id: 'restyle-id', sourceAssetIds: ['source-id'], externalReferences: [{ system: 'cok-restyle-inventory-v1', id: item.id }],
    outputs: [{ path: `images/${outputHash}.png`, sha256: outputHash }],
  }]);
  return { linkedRegistry, inventory, sourceHash, outputHash, frameHash,
    sourceBytes: Buffer.from('hub source'), outputBytes: Buffer.from('hub restyle'), frameBytes: Buffer.from('hub changed frame') };
}

test('animation hub frame PNG hashes are part of exact preview coverage', (t) => {
  const f = fixture(t), h = hubInventoryFixture();
  f.put(`restyle/cok-generated/images/${h.sourceHash}.png`, h.sourceBytes);
  f.put(`restyle/cok-generated/images/${h.outputHash}.png`, h.outputBytes);
  f.put(`restyle/cok-generated/images/${h.frameHash}.png`, h.frameBytes);
  f.put('restyle/cok-generated/manifest.json', JSON.stringify(h.inventory));
  let plan = planGraphicsPreviews(h.linkedRegistry, f.root);
  assert.equal(plan.counts.missing, 0); assert.equal(plan.counts.conflicting, 0);
  assert.ok(plan.records.find((row) => row.sha256 === h.frameHash).references.some((row) => row.kind === 'animation-frame'));

  f.put(`restyle/cok-generated/images/${h.frameHash}.png`, 'corrupt');
  plan = planGraphicsPreviews(h.linkedRegistry, f.root);
  assert.equal(plan.counts.conflicting, 1, 'wrong bytes under the changed-frame hash must fail');
  assert.throws(() => requireResolvedGraphicsPreviews(plan), /1 conflicting/);
});

test('missing animation changed-frame PNG blocks complete preview coverage', (t) => {
  const f = fixture(t), h = hubInventoryFixture();
  f.put(`restyle/cok-generated/images/${h.sourceHash}.png`, h.sourceBytes);
  f.put(`restyle/cok-generated/images/${h.outputHash}.png`, h.outputBytes);
  f.put('restyle/cok-generated/manifest.json', JSON.stringify(h.inventory));
  const plan = planGraphicsPreviews(h.linkedRegistry, f.root);
  assert.equal(plan.counts.missing, 1);
  assert.equal(plan.records.find((row) => row.sha256 === h.frameHash).references[0].kind, 'animation-frame');
  assert.throws(() => requireResolvedGraphicsPreviews(plan), /1 missing/);
});

test('require-resolved passes exact previews while keeping absent decoded metadata explicitly unresolved', (t) => {
  const f = fixture(t); f.put(hashPath);
  const plan = planGraphicsPreviews(registry([source('available'), { id: 'unknown', decoded: null }]), f.root);
  const before = structuredClone(plan);
  assert.deepEqual(requireResolvedGraphicsPreviews(plan), {
    available: 1, missing: 0, conflicting: 0, 'unresolved-no-decoded-preview': 1,
  });
  assert.deepEqual(plan, before);
});

test('require-resolved fails on missing or conflicting exact previews', (t) => {
  const f = fixture(t), input = registry([source('required')]);
  assert.throws(() => requireResolvedGraphicsPreviews(planGraphicsPreviews(input, f.root)), /1 missing, 0 conflicting/);
  f.put(hashPath, 'wrong');
  assert.throws(() => requireResolvedGraphicsPreviews(planGraphicsPreviews(input, f.root)), /0 missing, 1 conflicting/);
  assert.throws(() => requireResolvedGraphicsPreviews({ counts: { available: 1 } }), /Invalid.*counts/);
});

test('require-resolved rejects a synthetic 93-group tile-preview omission', (t) => {
  const f = fixture(t);
  const assets = Array.from({ length: 93 }, (_, index) => source(`tile-${index}`, '', (index + 1).toString(16).padStart(64, '0')));
  const plan = planGraphicsPreviews(registry(assets), f.root);
  assert.equal(plan.counts.missing, 93);
  assert.throws(() => requireResolvedGraphicsPreviews(plan), /93 missing, 0 conflicting/);
});

test('imported DOS TILES.DAX #1/#2 source and unknown-prompt Restyle hashes resolve independently', (t) => {
  const f = fixture(t), sourceBytes = Buffer.from('pinned TILES source PNG bytes');
  const outputBytes = Buffer.from('pinned TILES Restyle PNG bytes');
  const sourceHash = sha(sourceBytes), outputHash = sha(outputBytes);
  f.put(`restyle/cok-generated/images/${sourceHash}.png`, sourceBytes);
  f.put(`restyle/cok-generated/images/${outputHash}.png`, outputBytes);
  const assets = [], restyles = [];
  for (let global = 0; global < 48; global++) {
    const block = global < 26 ? 1 : 2, tile = global < 26 ? global : global - 26;
    const id = `cok/dos-ega/tiles.dax/block/${block}/tile/${tile}`;
    assets.push({ id, game: 'cok', edition: 'DOS install', platform: 'DOS-EGA',
      archive: { name: 'TILES.DAX', path: 'Champions of Krynn/TILES.DAX', sha256: 'a'.repeat(64) },
      locator: { kind: 'tile', blockId: block, tileIndex: tile },
      decoded: { path: `external-source/${sourceHash}.png`, sha256: sourceHash, width: 24, height: 24 } });
    restyles.push({ id: `restyle/cok-dos-tiles-001-${String(block).padStart(3, '0')}-${String(tile).padStart(3, '0')}`,
      sourceAssetIds: [id], sourceRelation: 'one-to-one', reviewStatus: 'generated',
      prompt: { status: 'unknown', path: null, inputPath: null, inputSha256: null, text: null },
      outputs: [{ path: `C:/GoldBoxImg/cok_restyle_work/done/CoK_DOS_TILES_001_tile_${String(global).padStart(3, '0')}_restyle.png`, sha256: outputHash, role: 'raw-generation' }] });
  }
  const plan = planGraphicsPreviews(registry(assets, restyles), f.root);
  assert.deepEqual(plan.counts, { available: 2, missing: 0, conflicting: 0, 'unresolved-no-decoded-preview': 0 });
  assert.deepEqual(requireResolvedGraphicsPreviews(plan), plan.counts);
  const sourceGroup = plan.records.find((row) => row.sha256 === sourceHash);
  const outputGroup = plan.records.find((row) => row.sha256 === outputHash);
  assert.equal(sourceGroup.references.filter((row) => row.kind === 'source').length, 48);
  assert.equal(outputGroup.references.filter((row) => row.kind === 'restyle-output').length, 48);
});

test('local Restyle pack checks exact preview completeness after its image packers', () => {
  const publicBuild = readFileSync(new URL('../scripts/build-app.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(publicBuild, /graphics-preview-plan\.mjs/);
  const localPack = readFileSync(new URL('../scripts/build-local-restyle-pack.mjs', import.meta.url), 'utf8');
  const lines = localPack.split(/\r?\n/);
  const gate = lines.findIndex((line) => line.includes("'graphics-preview-plan.mjs'"));
  const bundlers = lines.flatMap((line, index) => /^\s*run\(stageRoot, 'bundle-/.test(line) ? [index] : []);
  assert.ok(bundlers.length > 0 && bundlers.every((index) => index < gate));
  assert.match(lines[gate], /REGISTRY, root, '--require-resolved'/);
});
