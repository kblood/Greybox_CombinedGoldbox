import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildCoverageModel, clearCoverageQuery, createCoverageLoader, pageCoverageRequests,
  readCoverageQuery, summarizeCoverageForSources, writeCoverageQuery } from '../src/ui/graphics-coverage.mjs';

const readResearch = (name) => readFileSync(new URL(`../../../docs/engine/research/${name}`, import.meta.url));
// Same pin rule as the generators: CRLF is normalised to LF before sha256.
const textSha = (bytes) => createHash('sha256').update(Buffer.from(bytes).toString('latin1').replaceAll('\r\n', '\n'), 'latin1').digest('hex');
const registryBytes = readResearch('cok-graphics-identity-registry-v1.json');
const { assets } = JSON.parse(registryBytes);
const report = JSON.parse(readResearch('cok-runtime-art-coverage-v2.json'));
const receiptBytes = readResearch('cok-runtime-art-combat-sites-v2.json');
const receipt = JSON.parse(receiptBytes);
const build = (snapshot = report, registry = assets, combatReceipt = receipt) => buildCoverageModel(snapshot, registry, combatReceipt);
const model = build();
const CPIC1 = 'cok/dos-ega/disk1/cpic1.dax/block/1/frame/0';
const CPIC2 = 'cok/dos-ega/disk2/cpic2.dax/block/1/frame/0';
const COTTAGE_DOS = 'cok/dos-ega/disk1/bigpic1.dax/block/112/frame/0';
const COTTAGE_AMIGA = 'cok/amiga/disk2/bigpic1.daa/block/112/frame/0';
const HELD_BODY = 'cok/dos-ega/install/cbody.dax/block/139/frame/0';
const TOWN_FRAME = 'cok/dos-ega/disk1/8x8d1.dax/block/202/tile/20';
const TOWN_GLYPH = 'cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/0';

test('report joins the current raw registry and keeps equal block numbers in separate banks', () => {
  assert.equal(report.inputs['docs/engine/research/cok-graphics-identity-registry-v1.json'], textSha(registryBytes));
  assert.equal(report.inputs[report.combatEvidence], textSha(receiptBytes));
  assert.equal(model.sourceLinks.size, Object.keys(report.sourceAssets).length);
  assert.equal(model.sourceLinks.get(CPIC1), CPIC1);
  assert.equal(model.sourceLinks.get(CPIC2), CPIC2);
  assert.ok(model.usage.get(CPIC1).requests.every(({ request }) => request.bank === 'CPIC1'));
  assert.ok(model.usage.get(CPIC2).requests.every(({ request }) => request.bank === 'CPIC2'));
  assert.equal(model.usage.get(CPIC1).mappings.length, 0);
  assert.ok(model.usage.get(CPIC2).mappings.some(({ id }) => id === 'combat/CPIC2/1'));
  const bad = structuredClone(report);
  bad.combatBindings.CPIC1.pictures[1].sourceId = CPIC2;
  assert.throws(() => build(bad), /COMBAT source locator/);
});

test('source summaries expose exact static coverage without promoting it to observed runtime use', () => {
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const mappedIds = new Set(Object.values(report.mappings).flatMap((mapping) =>
    [mapping.baseSourceId, mapping.generationSourceId].filter((id) => typeof id === 'string')));
  const unknownButMapped = [...mappedIds].filter((id) => byId.get(id)?.gameConsumers.every(({ status }) => status === 'unknown'));
  assert.equal(unknownButMapped.length, 80);
  const rows = summarizeCoverageForSources(model, [...unknownButMapped, 'cok/missing/archive/block/9/frame/0']);
  assert.ok(rows.slice(0, -1).every((row) => row.status === 'matched' && row.runtimeObservation === 'unverified'
    && row.mappings.length > 0));
  assert.deepEqual(rows.at(-1), { id: 'cok/missing/archive/block/9/frame/0', status: 'not-in-snapshot',
    runtimeObservation: 'unverified', requests: [], mappings: [], frames: [], originalVariants: [], originalSourceUses: [], demoSlots: [] });
  assert.ok(rows.slice(0, -1).every((row) => row.mappings.every(({ admission }) =>
    ['runtime-declared', 'admitted', 'held'].includes(admission))));
});

test('Town source uses resolve only their exact border tiles and addressable font glyphs', () => {
  const uses = new Map(report.originalSourceUses.map((row) => [row.id, row]));
  assert.deepEqual(uses.get('town/frame').sourceIds,
    Array.from({ length: 6 }, (_, index) => `cok/dos-ega/disk1/8x8d1.dax/block/202/tile/${index + 20}`));
  assert.deepEqual(uses.get('town/font').sourceIds,
    Array.from({ length: 64 }, (_, index) => `cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/${index}`));
  assert.deepEqual(model.usage.get(TOWN_FRAME).originalSourceUses.map(({ id, consumerIds }) => [id, consumerIds]),
    [['town/frame', ['main-menu', 'town-services']]]);
  assert.deepEqual(model.usage.get(TOWN_GLYPH).originalSourceUses.map(({ id, consumerIds }) => [id, consumerIds]),
    [['town/font', ['main-menu', 'town-services']]]);
  assert.equal(model.usage.get(TOWN_FRAME).mappings.length, 0);
  assert.equal(model.usage.get(TOWN_GLYPH).frames.length, 0);
  const mutation = structuredClone(assets);
  const glyph = mutation.find(({ id }) => id === TOWN_GLYPH);
  glyph.locator.glyphIndex = 1;
  assert.throws(() => build(report, mutation), /original source identity/);
});

test('missing, repeated or stale identities suppress only their own source links', () => {
  for (const replacement of [
    [],
    [{ id: CPIC1, identityStatus: 'candidate' }],
    [{ id: CPIC1, archive: { name: 'CPIC1.DAX', sha256: '0'.repeat(64) } }],
    [{ id: CPIC1, archive: { name: 'CPIC2.DAX', sha256: report.sourceAssets[CPIC1].archiveSha256 } }],
    [{ id: CPIC1, locator: { ...report.sourceAssets[CPIC1].locator, entryIndex: 3 } }],
    [{ id: CPIC1, locator: { ...report.sourceAssets[CPIC1].locator, frameIndex: 1 } }],
    [{ id: CPIC1 }, { id: CPIC1 }],
  ]) {
    const asset = assets.find(({ id }) => id === CPIC1);
    const changed = [...assets.filter(({ id }) => id !== CPIC1), ...replacement.map((entry) => ({ ...asset, ...entry }))];
    const stale = build(report, changed);
    assert.equal(stale.sourceLinks.has(CPIC1), false);
    assert.equal(stale.sourceLinks.get(CPIC2), CPIC2);
    assert.ok(stale.usage.get(CPIC1).requests.length);
  }
});

test('mapping roles, component admission, reviewed Restyle evidence and availability stay separate', () => {
  assert.deepEqual(model.usage.get(COTTAGE_DOS).mappings.find(({ id }) => id === 'cottage/112'), { id: 'cottage/112', role: 'base source' });
  assert.deepEqual(model.usage.get(COTTAGE_AMIGA).mappings.find(({ id }) => id === 'cottage/112'), { id: 'cottage/112', role: 'generation source' });
  const [body] = model.usage.get(HELD_BODY).frames;
  assert.equal(body.component.role, 'body');
  const held = report.mappings[body.component.mappingId];
  assert.equal(report.frames[body.id].admission, 'held');
  assert.equal(held.admission, 'held');
  assert.match(report.outputs[held.outputPath].sha256, /^[a-f0-9]{64}$/);
  assert.equal(report.productionPackage, 'unverified');
  assert.equal(report.mappings['combat/CPIC2/1'].admission, 'runtime-declared');
  const admitted = Object.values(report.mappings).find(({ admission }) => admission === 'admitted');
  assert.ok(admitted);
  const [key, exact] = Object.entries(report.mappings).find(([, row]) => row.exactRestyleRecordIds.length);
  const stale = structuredClone(report);
  stale.outputs[exact.outputPath].sha256 = '0'.repeat(64);
  assert.throws(() => build(stale), new RegExp(`mapping ${key}`));
});

test('request filters retain unresolved and dynamic rows with their original evidence', () => {
  const state = { consumer: 'all', state: 'unresolved', page: 0, request: '' };
  const result = pageCoverageRequests(model, state);
  assert.ok(result.total > 48);
  assert.equal(result.items.length, 48);
  const isEmpty = (variant) => !variant.roster.length;
  assert.ok(result.items.some(({ request }) => request.kind === 'combat-site' && request.variants.some(isEmpty)));
  const dynamic = model.rows.find(({ request }) => request.kind === 'ecl-picture' && request.pictureId === null);
  assert.deepEqual(dynamic.states, ['unresolved']);
  assert.deepEqual(dynamic.sources, []);
  assert.deepEqual(dynamic.mappingIds, []);
  assert.equal(dynamic.request.operand.kind, 'dynamic');
  assert.equal(dynamic.request.entryWitnesses.length, dynamic.request.entries.length);
  const combatWithDynamic = model.rows.find(({ request }) => request.variants?.some((variant) => variant.dynamicPictures > 0));
  assert.ok(combatWithDynamic.states.includes('unresolved'));
  const noRoster = result.items.find(({ request }) => request.kind === 'combat-site' && request.variants.every(isEmpty));
  assert.deepEqual(noRoster.sources, []);
  assert.deepEqual(noRoster.mappingIds, []);
  const unmapped = pageCoverageRequests(model, { ...state, consumer: 'combat-icons', state: 'unmapped' });
  assert.ok(unmapped.items.some(({ sources }) => sources.includes(CPIC1)));
  assert.ok(unmapped.items.every(({ states }) => states.includes('unmapped')));
  assert.throws(() => pageCoverageRequests(model, state, 49), /limited to 48/);
});

test('bounded v2 scope keeps physical sites, variants and demo slots separate', () => {
  const scan = report.summary.combatScan;
  assert.equal(model.rows.length, 338);
  assert.equal(model.rows.length, scan.physicalSites + report.summary.eclPictureSites.total);
  assert.equal(scan.campaignComplete, false);
  assert.equal(scan.variantRetention, 'all-distinct-discovered-rosters');
  assert.equal(scan.distinctRosterVariants, 267);
  assert.equal(scan.entrySiteAssociations, 221);
  assert.equal(scan.entryVariantAssociations, 323);
  assert.equal(scan.hasExplorationFrontiers, false);
  assert.equal(scan.distinctImmediatePictureIds, 61);
  assert.equal(scan.withDeclaredMapping, 51);
  assert.equal(report.runtimeObservation, 'unverified');
  assert.equal(report.demoCombat.bindings.length, 15);
  assert.equal(model.demoPictureIds, 6);
  const mutations = [
    (data) => { data.summary.combatScan.campaignComplete = true; },
    (data) => { data.summary.combatScan.variantRetention = 'representative-rosters'; },
    (data) => { data.productionPackage = 'verified'; },
    (data) => { data.runtimeObservation = 'observed'; },
  ];
  for (const mutate of mutations) {
    const stale = structuredClone(report);
    mutate(stale);
    assert.throws(() => build(stale), /evidence scope/);
  }
});

test('new CPIC2 #23 links through its v2 variants and receipt inconsistencies fail closed', () => {
  const id = 'cok/dos-ega/disk2/cpic2.dax/block/23/frame/0';
  const usage = model.usage.get(id);
  assert.equal(usage.requests.length, 12);
  assert.equal(usage.requests.flatMap(({ request }) => request.variants.filter((variant) => variant.pictureIds.includes(23))).length, 13);
  const row = model.requestById.get('combat-site/ECL2.DAX/64/1496/');
  assert.equal(row.request.variants.filter((variant) => variant.pictureIds.includes(23)).length, 2);
  assert.equal(row.request.bindings.find((binding) => binding.pictureId === 23).mappingId, 'combat/CPIC2/23');
  const corrupt = structuredClone(receipt);
  corrupt.archives[0].blocks[0].sites[0].variants[0].pictureIds = [2];
  assert.throws(() => build(report, assets, corrupt), /COMBAT variant picture IDs/);
  const pinDrift = structuredClone(receipt);
  const helper = Object.keys(pinDrift.inputs)[0];
  pinDrift.inputs[helper] = '0'.repeat(64);
  assert.throws(() => build(report, assets, pinDrift), /COMBAT receipt pins and bounds/);
  const old = JSON.parse(readResearch('cok-runtime-art-coverage-v1.json'));
  assert.throws(() => build(old), /report version/);
});

test('summary denominators fail closed when rows and saved counts drift', () => {
  const changes = [
    (data) => { data.summary.canonicalSourceIds++; },
    (data) => { data.summary.outputPaths++; },
    (data) => { data.summary.distinctOutputHashes++; },
    (data) => { data.summary.mappingEntriesByConsumer['combat-icons']++; },
    (data) => { data.summary.eclPictureSites.total++; },
    (data) => { data.summary.combatScan.entrySiteAssociations++; },
    (data) => { data.summary.combatScan.distinctRosterVariants++; },
    (data) => { data.summary.combatScan.hasExplorationFrontiers = true; },
    (data) => { data.summary.combatScan.byBank.CPIC1.withDeclaredMapping++; },
    (data) => { data.summary.frameComponentPlacements++; },
    (data) => { data.summary.framesByKind['screen-composition']++; },
  ];
  for (const mutate of changes) {
    const stale = structuredClone(report);
    mutate(stale);
    assert.throws(() => build(stale), /summary counts/);
  }
});

test('coverage query round-trips request filters and leaves source modes independent', () => {
  const malformed = new URLSearchParams('coverage=1&coverageState=complete&coveragePage=-2&coverageConsumer=unknown&coverageRequest=missing');
  assert.deepEqual(readCoverageQuery(malformed, model), { consumer: 'all', state: 'all', page: 0, request: '' });
  const request = model.rows.find(({ request }) => request.consumer === 'combat-icons').id;
  const state = { consumer: 'combat-icons', state: 'unmapped', page: 0, request };
  const params = writeCoverageQuery(new URLSearchParams('graphics=1&id=original&review=unknown-description&appearance=variant'), state);
  assert.deepEqual(readCoverageQuery(params, model), state);
  for (const key of ['id', 'review', 'appearance']) assert.equal(params.has(key), false);
  params.set('id', CPIC1);
  clearCoverageQuery(params);
  assert.equal(params.get('id'), CPIC1);
  assert.equal(params.has('coverage'), false);
  assert.equal(params.has('coverageRequest'), false);
  const legacy = new URLSearchParams({ coverageRequest: 'combat-entry/ECL1.DAX/16/1556/search_location', coveragePage: '9' });
  assert.deepEqual(readCoverageQuery(legacy, model), { consumer: 'all', state: 'all', page: 0, request });
});

test('lazy loading runs only on request and keeps failure scoped to coverage', async () => {
  let calls = 0;
  const load = createCoverageLoader(async () => { calls++; throw new Error('data unavailable'); }, assets);
  assert.equal(calls, 0);
  const promise = load();
  assert.equal(load(), promise);
  await assert.rejects(promise, /data unavailable/);
  assert.equal(calls, 1);
  assert.equal(assets.find(({ id }) => id === CPIC1).id, CPIC1);
});
