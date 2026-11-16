import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { buildGraphicsReviewQueues, filterGraphicsReviewRows, pageGraphicsReviewRows,
  readGraphicsReviewQuery, writeGraphicsReviewQuery } from '../src/ui/graphics-review-queue.mjs';
import { frameHypothesisRows, validateGraphicsFrameHypotheses } from '../src/ui/graphics-frame-hypotheses.mjs';

const hash = (digit) => digit.repeat(64);
const source = (id, description = 'unknown', consumers = []) => ({ id, platform: 'DOS-EGA', archive: { name: 'WILDCOM.DAX' },
  decoded: { sha256: hash('a') }, description: { status: description, text: 'Recorded description', evidence: [] }, gameConsumers: consumers });
const consumer = (status) => ({ status, use: `${status} use`, evidence: [] });
function fixture() {
  const registry = { assets: [source('z', 'unknown', []), source('a', 'partial', [consumer('verified'), consumer('unknown')]),
    source('b', 'verified', [consumer('partial')])], restyles: [], animationGroups: [
    { id: 'unknown-playback', semantics: 'temporal', playback: 'unknown', frames: [{ assetId: 'a' }], evidence: [] },
    { id: 'distance', semantics: 'zoom-distance', playback: 'none', frames: [{ assetId: 'a' }], evidence: [] },
    { id: 'unknown-semantics', semantics: 'unknown', playback: 'none', frames: [{ assetId: 'z' }], evidence: [] },
  ] };
  const card = { id: 'asset-0001-aaaaaaaaaaaa', stem: 'asset-0001-aaaaaaaaaaaa', sourceSha256: hash('a'), outputSha256: hash('b'),
    source: `images/${hash('a')}.png`, output: `images/${hash('b')}.png`, sourceSize: [24,24], outputSize: [96,96],
    platform: 'DOS', platforms: ['DOS'], family: 'DOS WILDCOM', families: ['DOS WILDCOM'],
    aliases: [{ ledger: 'fixture.json', status: 'generated', family: 'DOS WILDCOM', platform: 'DOS', sourceName: 'fixture.png' }],
    outputType: 'Generated/restyled variant', promptReferences: [], sourceMatched: true, compositionReview: 'not-reviewed',
    runtimeApproved: false, runtimeApprovalEvidence: [], prompt: '', ledgerStatuses: ['generated'], animations: [] };
  const inventory = { schema: 'cok-restyle-inventory-v1', assets: [card], externalComparisons: [], excluded: [], held: [],
    counts: { uniquePairs: 1, sourceOutputEdges: 1, tileAliasRows: 0, externalComparisonAliases: 0, aliasEdges: 0,
      ledgerRecords: 1, eligibleRecords: 1, excludedRows: 0, heldRows: 0, uniquePngFiles: 2, uniquePngBytes: 10 } };
  const restyle = { id: 'restyle/exact', externalReferences: [{ system: 'cok-restyle-inventory-v1', id: card.id }],
    sourceAssetIds: ['a'], outputs: [{ role: 'gallery-copy', sha256: hash('b') }], evidence: [] };
  return { registry, inventory, restyle };
}

test('unknown classification retains mixed consumer peers, excludes partial descriptions and known distance views', () => {
  const { registry } = fixture(), before = structuredClone(registry), model = buildGraphicsReviewQueues(registry);
  assert.deepEqual(model.queues['unknown-description'].map((row) => row.key), ['z']);
  assert.deepEqual(model.queues['unknown-consumer'].map((row) => row.key), ['a', 'z']);
  assert.deepEqual(model.queues['unknown-consumer'][0].details.consumers.map((row) => row.status), ['verified', 'unknown']);
  assert.deepEqual(model.queues['unknown-animation'].map((row) => row.key), ['unknown-playback', 'unknown-semantics']);
  assert.deepEqual(registry, before);
});

test('missing visual descriptions are queued separately from description status', () => {
  const { registry } = fixture();
  registry.assets[0].description.visualDescription = 'A verified visual description.';
  const model = buildGraphicsReviewQueues(registry);
  assert.deepEqual(model.queues['missing-visual-description'].map((row) => row.key), ['a', 'b']);
  assert.equal(model.queues['missing-visual-description'][0].details.description.status, 'partial');
  assert.deepEqual(model.queues['missing-visual-description'][0].reasons, ['No visual description is recorded.']);
});

test('open frame hypotheses join only their pinned direct source IDs without creating animation groups', () => {
  const { registry } = fixture();
  registry.assets.push(source('c', 'verified', []));
  for (const asset of registry.assets) asset.decoded.pixelSha256 = hash('a');
  const hypothesis = { schema: 'cok-graphics-frame-hypotheses-v1', hypotheses: [{ id: 'hypothesis/example',
    title: 'Possible pose relationship', status: 'open', relationHypothesis: 'Unverified relation.',
    sources: [{ assetId: 'a', pixelSha256: hash('a'), proposedRole: 'idle? unverified' },
      { assetId: 'b', pixelSha256: hash('a'), proposedRole: 'attack? unverified' }],
    evidence: [{ kind: 'user-report', reference: 'conversation:example', note: 'Unverified.' }] }] };
  const before = structuredClone(registry);
  const validation = validateGraphicsFrameHypotheses(hypothesis, registry);
  assert.equal(validation.status, 'ready');
  const rows = frameHypothesisRows(validation, registry);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].sourceIds, ['a', 'b']);
  assert.equal(rows[0].groupId, null);
  const queue = buildGraphicsReviewQueues(registry, null, hypothesis);
  assert.equal(queue.queues['frame-hypotheses'].length, 1);
  assert.deepEqual(queue.queues['frame-hypotheses'][0].sourceIds, ['a', 'b']);
  assert.deepEqual(registry, before);
});

test('frame hypothesis validation fails closed on unknown or duplicate sources, stale pins, group membership, and missing evidence', () => {
  const { registry } = fixture();
  for (const asset of registry.assets) asset.decoded.pixelSha256 = hash('a');
  const base = { schema: 'cok-graphics-frame-hypotheses-v1', hypotheses: [{ id: 'hypothesis/example', title: 'Possible',
    status: 'open', relationHypothesis: 'Unverified.', sources: [{ assetId: 'a', pixelSha256: hash('a') },
      { assetId: 'b', pixelSha256: hash('a') }], evidence: [{ kind: 'user-report', reference: 'conversation:example' }] }] };
  const invalid = (mutate) => {
    const value = structuredClone(base); mutate(value.hypotheses[0]);
    assert.equal(validateGraphicsFrameHypotheses(value, registry).status, 'invalid');
  };
  invalid((row) => { row.sources[0].assetId = 'missing'; });
  invalid((row) => { row.sources[1].assetId = 'a'; });
  invalid((row) => { row.sources[0].pixelSha256 = hash('c'); });
  invalid((row) => { row.evidence = []; });
  invalid((row) => { row.status = 'confirmed'; });
  const duplicateId = structuredClone(base); duplicateId.hypotheses.push(structuredClone(base.hypotheses[0]));
  assert.equal(validateGraphicsFrameHypotheses(duplicateId, registry).status, 'invalid');
  registry.assets[1].animationGroupId = 'canonical-existing-group';
  invalid(() => {});
  assert.equal(validateGraphicsFrameHypotheses(null, registry).status, 'missing');
});

test('gallery card references require exact source/output hashes and extant source IDs', () => {
  for (const mutation of ['none', 'output', 'source', 'missing', 'conflicting', 'exact']) {
    const { registry, inventory, restyle } = fixture();
    if (mutation !== 'none') registry.restyles.push(restyle);
    if (mutation === 'output') restyle.outputs[0].sha256 = hash('c');
    if (mutation === 'source') registry.assets[1].decoded.sha256 = hash('c');
    if (mutation === 'missing') restyle.sourceAssetIds = ['missing'];
    if (mutation === 'conflicting') registry.restyles.push({ ...restyle, id: 'restyle/conflicting', sourceAssetIds: ['missing'] });
    const before = structuredClone({ registry, inventory }), model = buildGraphicsReviewQueues(registry, inventory);
    assert.equal(model.inventory.status, 'ready');
    assert.equal(model.inventory.unresolvedCards, mutation === 'exact' ? 0 : 1, mutation);
    if (mutation !== 'exact') {
      assert.equal(model.queues['unresolved-gallery'][0].details.state,
        mutation === 'none' ? 'none' : mutation === 'conflicting' ? 'conflicting' : 'stale');
      assert.equal(model.queues['unresolved-gallery'][0].details.aliasResolution, 'not-established-by-card-coverage');
    }
    assert.deepEqual({ registry, inventory }, before);
  }
});

test('registry references to gallery cards absent from the validated inventory are separately queued', () => {
  const { registry, inventory, restyle } = fixture();
  restyle.externalReferences[0].id = 'asset-obsolete-000000000000';
  registry.restyles.push(restyle);
  const model = buildGraphicsReviewQueues(registry, inventory);
  assert.equal(model.queues['unresolved-gallery'].length, 1);
  assert.equal(model.queues['unresolved-gallery'][0].details.state, 'none');
  assert.equal(model.queues['stale-gallery-reference'].length, 1);
  assert.equal(model.queues['stale-gallery-reference'][0].key, 'asset-obsolete-000000000000');
  assert.equal(model.queues['stale-gallery-reference'][0].details.state, 'stale-card-id');
  assert.equal(model.inventory.unresolvedCards, 1, 'absent IDs are not counted as cards in the inventory denominator');
  assert.equal(model.inventory.staleReferences, 1);
});

test('missing or invalid inventory stays unavailable with unknown counts', () => {
  const { registry } = fixture();
  for (const inventory of [null, {}, { schema: 'cok-restyle-inventory-v1', assets: [] }]) {
    const model = buildGraphicsReviewQueues(registry, inventory);
    assert.equal(model.inventory.status, 'unavailable');
    assert.equal(model.inventory.unresolvedCards, null);
    assert.equal(model.inventory.totalCards, null);
    assert.ok(model.inventory.error);
  }
});

test('stable sort, intersecting filters and bounded pagination leave input unchanged', () => {
  const { registry } = fixture();
  registry.assets = Array.from({ length: 101 }, (_, i) => source(`source-${String(100-i).padStart(3,'0')}`));
  registry.assets[0].platform = 'Amiga';
  const before = structuredClone(registry), model = buildGraphicsReviewQueues(registry);
  const rows = filterGraphicsReviewRows(model, { category: 'unknown-consumer', platform: 'DOS-EGA', query: 'wildcom' });
  assert.equal(rows.length, 100);
  assert.equal(rows[0].key, 'source-000');
  const first = pageGraphicsReviewRows(rows), second = pageGraphicsReviewRows(rows, 1);
  assert.equal(first.items.length, 48); assert.equal(second.items.length, 48);
  assert.equal(pageGraphicsReviewRows(rows, 999).items.length, 4);
  assert.equal(new Set([...first.items, ...second.items].map((row)=>row.key)).size, 96);
  assert.throws(() => pageGraphicsReviewRows(rows, 0, 49), /limited to 48/);
  assert.deepEqual(registry, before);
});

test('shareable queue URL roundtrips and clears canonical selections without mutating input', () => {
  const params = new URLSearchParams('graphics=1&id=old&appearance=old&theme=dark');
  const state = { category: 'unknown-consumer', platform: 'DOS-EGA', query: 'wildcom', page: 2 };
  const result = new URLSearchParams(writeGraphicsReviewQuery(params, state));
  assert.deepEqual(readGraphicsReviewQuery(result), state);
  assert.equal(result.get('theme'), 'dark'); assert.equal(result.has('id'), false); assert.equal(result.has('appearance'), false);
  assert.equal(params.get('id'), 'old');
  assert.equal(readGraphicsReviewQuery(new URLSearchParams('review=bad&reviewPage=-1')).page, 0);
});

const registryPath = new URL('../../../docs/engine/research/cok-graphics-identity-registry-v1.json', import.meta.url);
const hypothesisPath = new URL('../../../docs/engine/research/cok-graphics-frame-hypotheses-v1.json', import.meta.url);
const inventoryPath = new URL('../../../docs/engine/data/cok-restyle-inventory-v1.json', import.meta.url);
test('the checked-in Amiga CPIC lead resolves only its two pinned, currently ungrouped source IDs',
  { skip: !existsSync(registryPath) || !existsSync(hypothesisPath) }, () => {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    const sidecar = JSON.parse(readFileSync(hypothesisPath, 'utf8'));
    const validation = validateGraphicsFrameHypotheses(sidecar, registry);
    assert.equal(validation.status, 'ready', validation.error ?? 'valid sidecar');
    assert.deepEqual(frameHypothesisRows(validation, registry)[0].sourceIds, [
      'cok/amiga/disk2/cpic1.daa/block/1/frame/0',
      'cok/amiga/disk2/cpic1.daa/block/129/frame/0',
    ]);
    for (const id of validation.hypotheses[0].sources.map((row) => row.assetId)) {
      assert.equal(registry.assets.find((asset) => asset.id === id).animationGroupId, null);
    }
  });

test('canonical inventory retains only the unresolved source card after exact font lineage',
  { skip: !existsSync(registryPath) }, () => {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8')), inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
    const model = buildGraphicsReviewQueues(registry, inventory);
    assert.equal(model.inventory.status, 'ready');
    assert.deepEqual(model.queues['unresolved-gallery'].map((row) => row.cardId), ['asset-1287-800f03742f9b']);
  });

test('source registry has visual descriptions while retaining the independent semantic review queue',
  { skip: !existsSync(registryPath) }, () => {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    const model = buildGraphicsReviewQueues(registry);
    const missing = registry.assets.filter((asset) => typeof asset.description?.visualDescription !== 'string'
      || !asset.description.visualDescription.trim());
    assert.equal(model.queues['missing-visual-description'].length, missing.length);
    const dosGlyphs = registry.assets.filter((asset) => asset.id.includes('/8x8d1.dax/block/201/glyph/'));
    assert.equal(dosGlyphs.length, 177);
    assert.ok(dosGlyphs.every((asset) => typeof asset.description?.visualDescription === 'string'
      && asset.description.visualDescription.trim()), 'all DOS glyphs have explicit visual descriptions');
    assert.equal(missing.length, 0, 'the source review has described every CoK image in the current registry');
    assert.ok(model.queues['unknown-description'].length > 0,
      'visible appearance notes must not promote semantic descriptions to known');
  });

test('graphics identity browser and its registry stay out of the initial app route', () => {
  const main = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /import\s*\{\s*startGraphicsBrowser\s*\}\s*from\s*['"]\.\/graphicsBrowser\.js['"]/);
  assert.match(main, /params\.get\(['"]graphics['"]\)\s*!==\s*null\)\s*\{[\s\S]*?await import\(['"]\.\/graphicsBrowser\.js['"]\)/,
    'the large graphics registry is loaded only after the graphics route is selected');
  assert.doesNotMatch(main, /import\s*\{\s*startRestyle\s*\}\s*from\s*['"]\.\/restyle\.js['"]/);
  assert.match(main, /params\.get\(['"]restyle['"]\)\s*!==\s*null\)\s*\{[\s\S]*?await import\(['"]\.\/restyle\.js['"]\)/,
    'the before/after route loads only when selected, keeping its source-ID registry dependency out of the app entry graph');
});
