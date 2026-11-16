import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createGraphicsCatalog } from '../src/ui/graphics-catalog.mjs';

const cokRegistry = JSON.parse(readFileSync(new URL('../../../docs/engine/research/cok-graphics-identity-registry-v1.json', import.meta.url), 'utf8'));

const asset = (id, game = 'cok') => ({ id, game, platform: 'Amiga', edition: 'disk 1', archive: { name: 'PIC1.DAA' } });

function fixture() {
  const restyle = { id: 'restyle/shared', sourceAssetIds: ['source/a', 'source/b'], outputs: [{ role: 'gallery-copy', sha256: 'a'.repeat(64) }] };
  const duplicateBytes = { id: 'restyle/unrelated', sourceAssetIds: ['source/c'], outputs: [{ role: 'accepted-restyle', sha256: 'a'.repeat(64) }] };
  const candidate = { id: 'restyle/candidate', sourceAssetIds: ['source/d'], outputs: [{ role: 'candidate-output', sha256: 'c'.repeat(64) }] };
  const duplicateCandidate = { id: 'restyle/candidate-2', sourceAssetIds: ['source/e'], outputs: [{ role: 'same-candidate-bytes', sha256: 'c'.repeat(64) }] };
  const unverifiedCandidate = { id: 'restyle/unverified', sourceAssetIds: ['source/f'], outputs: [{ role: 'unverified-output', sha256: 'd'.repeat(64) }] };
  const nonIdentityCandidate = { id: 'restyle/non-identity', sourceAssetIds: ['source/g'], outputs: [{ role: 'non-identity-output', sha256: 'e'.repeat(64) }] };
  const registry = { assets: ['source/a', 'source/b', 'source/c', 'source/d', 'source/e', 'source/f', 'source/g'].map((id) => asset(id)), restyles: [restyle, duplicateBytes, candidate, duplicateCandidate, unverifiedCandidate, nonIdentityCandidate],
    crossVersionLinks: [
      { fromAssetId: 'source/a', toAssetId: 'source/b', id: 'a-b', relation: 'pixel-identical', confidence: 'verified' },
      { fromAssetId: 'source/b', toAssetId: 'source/c', id: 'b-c', relation: 'possible-counterpart', confidence: 'possible' },
      { fromAssetId: 'source/a', toAssetId: 'source/d', id: 'a-d', relation: 'pixel-identical', confidence: 'verified' },
      { fromAssetId: 'source/a', toAssetId: 'source/e', id: 'a-e', relation: 'pixel-identical', confidence: 'verified' },
      { fromAssetId: 'source/a', toAssetId: 'source/f', id: 'a-f', relation: 'pixel-identical', confidence: 'possible' },
      { fromAssetId: 'source/a', toAssetId: 'source/g', id: 'a-g', relation: 'same-scene', confidence: 'verified' },
    ], animationGroups: [{ id: 'animation/example', semantics: 'time-animation', playback: 'forward', status: 'verified',
      frames: [{ assetId: 'source/b', order: 2, role: 'second' }, { assetId: 'source/a', order: 1, role: 'first' }], evidence: [] }],
    appearanceSets: [] };
  return registry;
}

test('catalog preserves distinct physical IDs, indexes one shared Restyle directly, and never follows transitive version links', () => {
  const registry = fixture(), before = structuredClone(registry), catalog = createGraphicsCatalog(registry);
  assert.deepEqual(catalog.sources.map((source) => source.id), ['source/a', 'source/b', 'source/c', 'source/d', 'source/e', 'source/f', 'source/g']);
  assert.notEqual(catalog.source('source/a'), catalog.source('source/b'));
  assert.deepEqual(catalog.restylesFor('source/a').map((row) => row.id), ['restyle/shared']);
  assert.deepEqual(catalog.restylesFor('source/b').map((row) => row.id), ['restyle/shared']);
  assert.deepEqual(catalog.restylesFor('source/c').map((row) => row.id), ['restyle/unrelated']);
  assert.deepEqual(catalog.restyleOutputGroupsFor('source/a').map((group) => [group.sha256, group.uses.length]), [['a'.repeat(64), 2]]);
  assert.deepEqual(catalog.crossVersionLinksFor('source/a').map((row) => row.id), ['a-b', 'a-d', 'a-e', 'a-f', 'a-g']);
  assert.equal(catalog.crossVersionLinksFor('source/a').some((row) => row.id === 'b-c'), false);
  const reuse = catalog.inspectRestyleReuse('source/a');
  assert.deepEqual(reuse.alreadyLinkedOutputs.map((row) => [row.sha256, row.uses.length, row.otherByteIdenticalUses.length]), [['a'.repeat(64), 1, 1]]);
  assert.deepEqual(reuse.possibleReuse.map((row) => [row.sha256, row.uses.map((use) => [use.sourceId, use.restyle.id, use.output.role])]),
    [['c'.repeat(64), [['source/d', 'restyle/candidate', 'candidate-output'], ['source/e', 'restyle/candidate-2', 'same-candidate-bytes']]]]);
  assert.deepEqual(reuse.unresolvedLineage.map((row) => row.sourceId), ['source/f', 'source/g']);
  assert.equal(reuse.generationRecommendation, 'none');
  const possibleOnly = catalog.inspectRestyleReuse('source/c');
  assert.deepEqual(possibleOnly.possibleReuse, [], 'possible-counterpart is not treated as equivalent, even through source/b');
  assert.ok(possibleOnly.unresolvedLineage.some((row) => row.sourceId === 'source/b'));
  assert.equal(catalog.inspectRestyleReuse('source/missing').generationRecommendation, 'none');
  assert.deepEqual(catalog.animationGroupsFor('source/a')[0].frames.map((frame) => frame.order), [1, 2]);
  assert.deepEqual(catalog.scopes, [{ game: 'cok', sourceCount: 7, platforms: ['Amiga'], editions: ['disk 1'], completeness: 'not-established' }]);
  assert.deepEqual(registry, before);
  const reversed = structuredClone(registry);
  reversed.assets.reverse(); reversed.crossVersionLinks.reverse(); reversed.animationGroups[0].frames.reverse();
  const reverseCatalog = createGraphicsCatalog(reversed);
  assert.deepEqual(reverseCatalog.sources.map((source) => source.id), catalog.sources.map((source) => source.id));
  assert.deepEqual(reverseCatalog.crossVersionLinksFor('source/a').map((row) => row.id), ['a-b', 'a-d', 'a-e', 'a-f', 'a-g']);
  assert.deepEqual(reverseCatalog.animationGroupsFor('source/a')[0].frames.map((frame) => frame.order), [1, 2]);
});

test('duplicate canonical source IDs fail instead of silently overwriting the catalog index', () => {
  const registry = fixture(); registry.assets.push(asset('source/a'));
  assert.throws(() => createGraphicsCatalog(registry), /Duplicate canonical source ID/);
});

test('wall tile 69 Restyle resolves only to the DOS source while the pixel-identical Amiga source stays distinct', () => {
  const catalog = createGraphicsCatalog(cokRegistry);
  const dosId = 'cok/dos-ega/disk1/8x8d1.dax/block/31/tile/69';
  const amigaId = 'cok/amiga/disk2/8x8d1.dax/block/31/tile/69';
  const restyleId = 'restyle/cok-runtime/walls/8x8d1/block/31/tile/69';
  assert.equal(catalog.source(dosId)?.id, dosId);
  assert.equal(catalog.source(amigaId)?.id, amigaId);
  assert.notEqual(catalog.source(dosId), catalog.source(amigaId));
  assert.deepEqual(catalog.restylesFor(dosId).filter(({ id }) => id === restyleId).map((row) => row.outputs[0]), [{
    path: 'cok/walls/CoK_DOS_8X8D1_031_tile_069_restyle.png',
    sha256: '36589c6c249e9801ca4e966e1a0137e1deb43faf4f87cce653c4ce9d79b079b0',
    role: 'runtime-copy',
  }]);
  assert.equal(catalog.restylesFor(amigaId).some(({ id }) => id === restyleId), false);
  assert.ok(catalog.crossVersionLinksFor(dosId).some(({ relation, confidence }) =>
    relation === 'pixel-identical' && confidence === 'verified'));
});

test('animation frame-set matches require verified pixel identity at every same ordinal and preserve ambiguity', () => {
  const registry = {
    assets: ['source/a0', 'source/a1', 'source/b0', 'source/b1', 'source/c0', 'source/c1'].map((id) => asset(id)),
    restyles: [], appearanceSets: [],
    crossVersionLinks: [
      { fromAssetId: 'source/a0', toAssetId: 'source/b0', relation: 'pixel-identical', confidence: 'verified' },
      { fromAssetId: 'source/a1', toAssetId: 'source/b1', relation: 'pixel-identical', confidence: 'verified' },
      { fromAssetId: 'source/c0', toAssetId: 'source/a0', relation: 'pixel-identical', confidence: 'verified' },
      { fromAssetId: 'source/c1', toAssetId: 'source/a1', relation: 'pixel-identical', confidence: 'verified' },
    ],
    animationGroups: [
      { id: 'group/a', semantics: 'unknown', playback: 'unknown', status: 'unknown', evidence: [],
        frames: [{ assetId: 'source/a1', order: 1, role: 'stored frame 1' }, { assetId: 'source/a0', order: 0, role: 'stored frame 0' }] },
      { id: 'group/b', semantics: 'unknown', playback: 'unknown', status: 'unknown', evidence: [],
        frames: [{ assetId: 'source/b0', order: 0, role: 'stored frame 0' }, { assetId: 'source/b1', order: 1, role: 'stored frame 1' }] },
      { id: 'group/c', semantics: 'unknown', playback: 'unknown', status: 'unknown', evidence: [],
        frames: [{ assetId: 'source/c0', order: 0, role: 'stored frame 0' }, { assetId: 'source/c1', order: 1, role: 'stored frame 1' }] },
    ],
  };
  const catalog = createGraphicsCatalog(registry);
  const matches = catalog.animationGroupMatchesFor('group/a');
  assert.deepEqual(matches.map((row) => [row.targetGroupId, row.candidateCount]), [['group/b', 2], ['group/c', 2]]);
  assert.deepEqual(matches[0].framePairs, [
    { order: 0, sourceAssetId: 'source/a0', targetAssetId: 'source/b0' },
    { order: 1, sourceAssetId: 'source/a1', targetAssetId: 'source/b1' },
  ]);
  registry.crossVersionLinks.pop();
  assert.deepEqual(createGraphicsCatalog(registry).animationGroupMatchesFor('group/a').map((row) => row.targetGroupId), ['group/b']);
  registry.crossVersionLinks[0].confidence = 'possible';
  assert.deepEqual(createGraphicsCatalog(registry).animationGroupMatchesFor('group/a'), []);
});

test('bulk source lookup preserves requested order, distinct IDs and missing rows', () => {
  const registry = fixture();
  registry.assets[0].description = { status: 'partial', text: 'BAAZ combat-art association' };
  const before = structuredClone(registry), catalog = createGraphicsCatalog(registry);
  const rows = catalog.sourcesFor(['source/b', 'missing/source', 'source/a', 'source/b']);
  assert.deepEqual(rows.map((row) => row?.id ?? null), ['source/b', null, 'source/a', 'source/b']);
  assert.equal(rows[2]?.description.status, 'partial');
  assert.notEqual(rows[0], rows[2], 'distinct archive-qualified sources remain separate even when pixels match');
  assert.deepEqual(registry, before);
});
