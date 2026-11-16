import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { resolveCuratedCardSources, resolveExternalComparisonBinding, resolveGeneratedAliasBinding,
  requireExactRestyleBinding, verifyCurrentComparisonPair } from '../src/ui/graphics-alias-bindings.mjs';

const h = (char) => char.repeat(64);
const locator = { kind: 'block-frame', blockId: 23, frameIndex: 0, tileIndex: null, cellIndex: null };
function fixture(system = 'cok-restyle-inventory-v1', id = 'card-a') {
  const src = { id: 'cok/dos-ega/disk1/pic1.dax/block/23/frame/0', decoded: { sha256: h('a') },
    locator: structuredClone(locator), archive: { name: 'PIC1.DAX', path: 'disk1/PIC1.DAX', sha256: h('b') }, galleryReferences: [] };
  const restyle = { id: 'restyle/23', sourceAssetIds: [src.id], outputs: [{ role: 'gallery-copy', sha256: h('c') }],
    externalReferences: [{ system, id, outputSha256: h('c') }] };
  const binding = { sourceAssetId: src.id, locator: structuredClone(locator), archive: structuredClone(src.archive),
    decodedSourceSha256: h('a'), exactOutputSha256: h('c'), restyleIdsForExactOutput: [restyle.id],
    matchingCardReferences: [{ system, id, restyleId: restyle.id, outputSha256: h('c') }] };
  const row = { rowId: `${system === 'cok-runtime-comparison-v1' ? 'external' : 'generated'}/${id}/alias/000`, inventoryAssetId: id, sourceSha256: h('a'), outputSha256: h('c'),
    aliasKey: h('d'), aliasHash: h('e'), alias: { platform: 'DOS', family: 'PIC1', asset: 23, frame: 0, tile: null, entryIndex: null, cell: null, status: 'restyled' },
    status: 'bound', sourceAssetIds: [src.id], bindings: [binding], sourceAssetCandidates: [] };
  const sidecar = system === 'cok-runtime-comparison-v1'
    ? { generatedAliasRows: [], externalComparisonAliases: [row], curatedCards: [] }
    : { generatedAliasRows: [row], externalComparisonAliases: [], curatedCards: [] };
  const registry = { assets: [src], restyles: [restyle] };
  return { src, restyle, row, binding, sidecar, registry, card: { id, sourceSha256: h('a'), outputSha256: h('c') },
    currentAlias: { ...row.alias }, aliasIndex: 0,
    fingerprint: { rowId: row.rowId, aliasKey: row.aliasKey, aliasHash: row.aliasHash } };
}

const unresolved = (result) => { assert.equal(result.status, 'unresolved'); assert.deepEqual(result.sourceAssetIds, []); assert.deepEqual(result.sources, []); };

test('generated exact pair returns source only after rechecking current registry and exact card reference', () => {
  const f = fixture();
  const result = resolveGeneratedAliasBinding({ ...f, aliasFingerprint: f.fingerprint });
  assert.equal(result.status, 'resolved');
  assert.deepEqual(result.sourceAssetIds, [f.src.id]);
  assert.deepEqual(result.sources[0].locator, locator);
});

test('reverse gallery navigation requires the exact displayed Restyle record and output', () => {
  const f = fixture();
  const result = resolveGeneratedAliasBinding({ ...f, aliasFingerprint: f.fingerprint });
  assert.equal(requireExactRestyleBinding(result, { sourceAssetId: f.src.id, restyleId: f.restyle.id, outputSha256: h('c') }).status, 'resolved');
  for (const expected of [
    { sourceAssetId: f.src.id, restyleId: 'restyle/other', outputSha256: h('c') },
    { sourceAssetId: f.src.id, restyleId: f.restyle.id, outputSha256: h('f') },
    { sourceAssetId: 'other-source', restyleId: f.restyle.id, outputSha256: h('c') },
  ]) {
    unresolved(requireExactRestyleBinding(result, expected));
  }
});

test('changed source/output pair, stale card ID, and stale fingerprint fail closed', () => {
  const f = fixture();
  for (const card of [{ ...f.card, sourceSha256: h('f') }, { ...f.card, outputSha256: h('f') }, { ...f.card, id: 'old-card' }]) {
    unresolved(resolveGeneratedAliasBinding({ ...f, card, aliasFingerprint: f.fingerprint }));
  }
  unresolved(resolveGeneratedAliasBinding({ ...f, aliasFingerprint: { ...f.fingerprint, aliasHash: h('f') } }));
});

test('current structured alias status, locator fields and platform must match the fingerprinted sidecar row', () => {
  for (const [field, value] of [['status', 'held'], ['asset', 24], ['entryIndex', 4], ['cell', 1], ['platform', 'Amiga']]) {
    const f = fixture(); f.currentAlias[field] = value;
    unresolved(resolveGeneratedAliasBinding({ ...f, aliasFingerprint: f.fingerprint }));
  }
  const f = fixture();
  unresolved(resolveGeneratedAliasBinding({ ...f, aliasIndex: 1, aliasFingerprint: f.fingerprint }));
});

test('one alias cannot borrow another row binding, even when the second row is exact', () => {
  const f = fixture();
  const other = structuredClone(f.row);
  other.rowId = 'generated/card-b/alias/0'; other.inventoryAssetId = 'card-b';
  other.aliasKey = h('f'); other.aliasHash = h('1');
  other.sourceSha256 = h('2'); other.outputSha256 = h('3');
  f.sidecar.generatedAliasRows.push(other);
  unresolved(resolveGeneratedAliasBinding({ ...f, aliasFingerprint: { rowId: other.rowId, aliasKey: other.aliasKey, aliasHash: other.aliasHash } }));
  unresolved(resolveGeneratedAliasBinding({ ...f, aliasFingerprint: { aliasKey: h('f'), aliasHash: f.row.aliasHash } }));
});

test('unresolved and candidate-only rows never produce a canonical source ID', () => {
  const f = fixture();
  f.row.status = 'unresolved'; f.row.reason = 'ambiguous'; f.row.bindings = [];
  f.row.sourceAssetIds = [f.src.id]; f.row.sourceAssetCandidates = [{ sourceAssetId: f.src.id }]; f.row.candidateCount = 1;
  const result = resolveGeneratedAliasBinding({ ...f, aliasFingerprint: f.fingerprint });
  unresolved(result);
  assert.equal(result.reason, 'alias-row-not-bound');
  assert.deepEqual(result.candidateSourceAssetIds, [f.src.id]);
  f.row.candidateCount = 2;
  assert.deepEqual(resolveGeneratedAliasBinding({ ...f, aliasFingerprint: f.fingerprint }).candidateSourceAssetIds, []);
});

test('archive SHA, full locator, decoded source hash and output hash tampering fail closed', () => {
  for (const mutate of [
    (f) => { f.src.archive.sha256 = h('f'); },
    (f) => { f.binding.locator.frameIndex = 1; },
    (f) => { f.src.decoded.sha256 = h('f'); },
    (f) => { f.restyle.outputs[0].sha256 = h('f'); },
    (f) => { f.binding.exactOutputSha256 = h('f'); },
  ]) {
    const f = fixture(); mutate(f);
    unresolved(resolveGeneratedAliasBinding({ ...f, aliasFingerprint: f.fingerprint }));
  }
});

test('generated binding requires the exact Restyle source and external card reference', () => {
  for (const mutate of [
    (f) => { f.restyle.externalReferences[0].id = 'different-card'; },
    (f) => { f.restyle.externalReferences[0].outputSha256 = h('f'); },
    (f) => { f.restyle.sourceAssetIds = ['other-source']; },
    (f) => { f.binding.matchingCardReferences[0].system = 'wrong-system'; },
  ]) {
    const f = fixture(); mutate(f);
    unresolved(resolveGeneratedAliasBinding({ ...f, aliasFingerprint: f.fingerprint }));
  }
});

test('card references may rely on the hash-pinned Restyle output instead of duplicating its output hash', () => {
  const f = fixture();
  delete f.restyle.externalReferences[0].outputSha256;
  assert.equal(resolveGeneratedAliasBinding({ ...f, aliasFingerprint: f.fingerprint }).status, 'resolved');
  f.restyle.externalReferences[0].outputSha256 = h('f');
  unresolved(resolveGeneratedAliasBinding({ ...f, aliasFingerprint: f.fingerprint }));
});

test('external comparison path requires its distinct exact runtime-comparison reference', () => {
  const f = fixture('cok-runtime-comparison-v1', 'comparison-a');
  const args = { ...f, aliasFingerprint: f.fingerprint };
  assert.equal(resolveExternalComparisonBinding(args).status, 'resolved');
  unresolved(resolveGeneratedAliasBinding(args));
  f.restyle.externalReferences[0].system = 'cok-restyle-inventory-v1';
  unresolved(resolveExternalComparisonBinding(args));
});

function curatedFixture() {
  const sourceIds = ['cok/amiga/disk1/bigpic1.daa/block/2/frame/0', 'cok/dos-ega/disk1/bigpic1.dax/block/2/frame/0'];
  const assets = sourceIds.map((id, index) => ({ id, decoded: { sha256: h('a') },
    locator: { ...locator, blockId: 2 }, archive: { name: 'BIGPIC1', path: `${index}/BIGPIC1`, sha256: h(index ? 'd' : 'b') },
    galleryReferences: [{ system: 'cok-curated-restyle-v1', id: 'scene', manifestSha256: h('f'), sourceSha256: h('a'), outputSha256: h('c') }] }));
  const links = assets.map((asset) => ({ sourceAssetId: asset.id, sourceSha256: h('a'), outputSha256: h('c'), decodedSourceSha256: h('a'),
    locator: asset.locator, archive: asset.archive, galleryReference: { system: 'cok-curated-restyle-v1', id: 'scene', manifestSha256: h('f'), sourceSha256: h('a'), outputSha256: h('c') },
    exactSourceFileMatch: true, exactOutputFileMatch: true, status: 'exact' }));
  return { sidecar: { curatedCards: [{ cardId: 'scene', status: 'exact', sourceLinks: links }] }, registry: { assets, restyles: [] }, links, assets };
}

test('curated exact gallery references preserve all source versions without requiring Restyle records', () => {
  const f = curatedFixture();
  const result = resolveCuratedCardSources({ cardId: 'scene', sourceSha256: h('a'), outputSha256: h('c'), ...f });
  assert.equal(result.status, 'resolved');
  assert.deepEqual(result.sourceAssetIds, f.assets.map((asset) => asset.id));
});

test('curated source/output mismatch, stale gallery ref, archive and locator changes fail closed', () => {
  const f = curatedFixture();
  unresolved(resolveCuratedCardSources({ cardId: 'scene', sourceSha256: h('e'), outputSha256: h('c'), ...f }));
  unresolved(resolveCuratedCardSources({ cardId: 'scene', sourceSha256: h('a'), outputSha256: h('e'), ...f }));
  f.assets[0].galleryReferences[0].manifestSha256 = h('e');
  unresolved(resolveCuratedCardSources({ cardId: 'scene', sourceSha256: h('a'), outputSha256: h('c'), ...f }));
  const g = curatedFixture(); g.links[0].archive = structuredClone(g.links[0].archive); g.links[0].archive.sha256 = h('e');
  unresolved(resolveCuratedCardSources({ cardId: 'scene', sourceSha256: h('a'), outputSha256: h('c'), ...g }));
  const k = curatedFixture(); k.links[0].locator = structuredClone(k.links[0].locator); k.links[0].locator.blockId = 99;
  unresolved(resolveCuratedCardSources({ cardId: 'scene', sourceSha256: h('a'), outputSha256: h('c'), ...k }));
});

test('current comparison bytes are hashed and changed source or output PNGs fail closed', async () => {
  const bytes = { source: new TextEncoder().encode('current original bytes'), output: new TextEncoder().encode('current restyle bytes') };
  const sha = (value) => createHash('sha256').update(value).digest('hex');
  const fetchImpl = async (url) => ({ ok: true, arrayBuffer: async () => bytes[url.includes('source') ? 'source' : 'output'].slice().buffer });
  const pair = { sourceUrl: 'synthetic-source', outputUrl: 'synthetic-output',
    expectedSourceSha256: sha(bytes.source), expectedOutputSha256: sha(bytes.output), fetchImpl };
  const exact = await verifyCurrentComparisonPair(pair);
  assert.equal(exact.status, 'resolved');
  assert.equal(exact.sourceSha256, pair.expectedSourceSha256);
  assert.equal(exact.outputSha256, pair.expectedOutputSha256);
  bytes.source = new TextEncoder().encode('changed source bytes');
  const changedSource = await verifyCurrentComparisonPair({ ...pair, sourceUrl: 'mutated-source' });
  assert.equal(changedSource.status, 'unresolved');
  assert.equal(changedSource.reason, 'current-source-png-hash-mismatch');
  bytes.output = new TextEncoder().encode('changed output bytes');
  const changedOutput = await verifyCurrentComparisonPair({ ...pair, outputUrl: 'mutated-output' });
  assert.equal(changedOutput.status, 'unresolved');
  assert.equal(changedOutput.reason, 'current-output-png-hash-mismatch');
  assert.deepEqual(changedSource.sourceAssetIds, []);
  assert.deepEqual(changedOutput.sourceAssetIds, []);
});

test('production-style alias verification hashes only supplied local bytes and never fetches URLs', async () => {
  const sourceBytes = new TextEncoder().encode('pinned local source bytes');
  const outputBytes = new TextEncoder().encode('pinned local output bytes');
  const sha = (value) => createHash('sha256').update(value).digest('hex');
  let fetches = 0;
  const pair = { sourceUrl: 'https://example.invalid/source.png', outputUrl: 'https://example.invalid/output.png',
    sourceBytes, outputBytes, allowFetch: false,
    expectedSourceSha256: sha(sourceBytes), expectedOutputSha256: sha(outputBytes),
    fetchImpl: async () => { fetches++; throw new Error('network fetch must not run'); } };
  const exact = await verifyCurrentComparisonPair(pair);
  assert.equal(exact.status, 'resolved');
  assert.equal(fetches, 0);
  const missing = await verifyCurrentComparisonPair({ ...pair, sourceBytes: undefined });
  assert.equal(missing.status, 'unresolved');
  assert.match(missing.reason, /exact local comparison bytes are unavailable/);
  assert.equal(fetches, 0);
});

test('actual sidecar bindings remain exact against the current registry, including unresolved and multi-source rows', () => {
  const repo = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
  const sidecar = JSON.parse(readFileSync(resolve(repo, 'docs/engine/research/cok-graphics-alias-bindings-v1.json'), 'utf8'));
  const registry = JSON.parse(readFileSync(resolve(repo, 'docs/engine/research/cok-graphics-identity-registry-v1.json'), 'utf8'));
  const inventory = JSON.parse(readFileSync(resolve(repo, 'docs/engine/data/cok-restyle-inventory-v1.json'), 'utf8'));
  const generated = sidecar.generatedAliasRows;
  const samples = [
    generated.find((row) => row.status === 'bound'),
    generated.find((row) => row.status === 'bound' && row.sourceAssetIds.some((id) => id.includes('/amiga/'))),
    sidecar.externalComparisonAliases.find((row) => row.status === 'bound'),
    generated.find((row) => row.status === 'unresolved' && row.candidateCount > 1),
  ];
  assert.ok(samples.every(Boolean));
  for (const row of samples) {
    const aliasIndex = Number(row.rowId.match(/\/alias\/(\d+)$/)?.[1]);
    const card = row.rowId.startsWith('external/')
      ? inventory.externalComparisons.find((entry) => entry.id === row.inventoryAssetId)
      : inventory.assets.find((entry) => entry.id === row.inventoryAssetId);
    const currentAlias = card?.aliases?.[aliasIndex];
    assert.ok(currentAlias, row.rowId);
    const args = { card: { id: row.inventoryAssetId, sourceSha256: row.sourceSha256, outputSha256: row.outputSha256 },
      currentAlias, aliasIndex,
      aliasFingerprint: { rowId: row.rowId, aliasKey: row.aliasKey, aliasHash: row.aliasHash }, sidecar, registry };
    const resolveRow = row.rowId.startsWith('external/') ? resolveExternalComparisonBinding : resolveGeneratedAliasBinding;
    const result = resolveRow(args);
    if (row.status === 'bound') {
      assert.equal(result.status, 'resolved', row.rowId);
      assert.deepEqual(result.sourceAssetIds, row.sourceAssetIds, row.rowId);
      assert.deepEqual(result.sources[0].locator, row.bindings[0].locator, row.rowId);
    } else {
      assert.equal(result.status, 'unresolved', row.rowId);
      assert.deepEqual(result.sourceAssetIds, [], row.rowId);
      assert.deepEqual(result.candidateSourceAssetIds, row.sourceAssetIds, row.rowId);
    }
  }

  const multi = sidecar.curatedCards.find((card) => card.status === 'exact' && card.sourceIdCount > 1);
  const link = multi.sourceLinks[0];
  const result = resolveCuratedCardSources({ cardId: multi.cardId, sourceSha256: link.sourceSha256,
    outputSha256: link.outputSha256, sidecar, registry });
  assert.equal(result.status, 'resolved');
  assert.deepEqual(result.sourceAssetIds, multi.sourceLinks.map((source) => source.sourceAssetId));
});
