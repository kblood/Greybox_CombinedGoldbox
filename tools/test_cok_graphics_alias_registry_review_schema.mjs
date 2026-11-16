import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const electronRequire = createRequire(new URL('../apps/electron/package.json', import.meta.url));
const builderRequire = createRequire(electronRequire.resolve('electron-builder'));
const appBuilderRequire = createRequire(builderRequire.resolve('app-builder-lib'));
const Ajv2020 = appBuilderRequire('ajv/dist/2020.js');
const schema = JSON.parse(readFileSync(new URL('../docs/engine/research/cok-graphics-alias-registry-review-v1.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ allErrors: true }).compile(schema);
const hash = (char) => char.repeat(64);
const ids = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}-${i}`);

function reviewFixture(status) {
  const data = {
    schema: 'cok-graphics-alias-registry-review-v1', status,
    inputs: { priorSidecarSha256: hash('a'), priorRegistrySha256: hash('b'), currentRegistrySha256: hash('c'),
      inventorySha256: hash('d'), curatedManifestSha256: hash('e'), runtimeComparisonSha256: hash('f') },
    counts: { generatedAliasesBefore: 6151, generatedAliasesAfter: 6151, externalAliasesBefore: 1,
      externalAliasesAfter: 1, boundAliasesAfter: 0, boundAliasesWithLocatorArchiveSourceOutputAndCardEvidence: 0,
      unresolvedAliasesRetained: 0, aliasCandidateSetsUnchanged: 0, curatedCardsBefore: 27, curatedCardsAfter: 27,
      curatedSourceLinksAfter: 0, curatedMultiSourceCardsAfter: 0, curatedUnresolvedCardsRetained: 0,
      inventoryPngFilesExpected: 4840, inventoryPngFilesVerified: 4840, inventoryPngFilesMissing: 0,
      inventoryPngFilesHashMismatch: 0, semanticDifferences: 0, nullEntryIndexPromotions: 0 },
    semanticProjectionSha256: hash('1'), updatedSidecarSha256: hash('2'), differences: [],
    nullEntryIndexPromotions: [], limitations: ['source identity only', 'no subject semantics', 'no runtime approval'],
  };
  const correction = (counts, differenceCount, extra = {}) => {
    Object.assign(data.counts, counts);
    data.differences = ids('difference', differenceCount).map((id) => ({ id }));
    Object.assign(data, extra);
  };
  if (status === 'reviewed-null-entry-index-correction') {
    correction({ boundAliasesAfter: 5160, unresolvedAliasesRetained: 992, aliasCandidateSetsUnchanged: 4553,
      semanticDifferences: 1599, nullEntryIndexPromotions: 1599 }, 1599,
    { nullEntryIndexPromotions: ids('null-entry', 1599) });
  } else if (status === 'reviewed-entry-index-hash-correction') {
    correction({ boundAliasesAfter: 5802, unresolvedAliasesRetained: 350, aliasCandidateSetsUnchanged: 6140,
      semanticDifferences: 12, nullEntryIndexPromotions: 0, entryIndexHashPromotions: 12 }, 12,
    { entryIndexHashPromotions: ids('entry-index', 12) });
  } else if (status === 'reviewed-frame-index-hash-correction') {
    correction({ boundAliasesAfter: 5548, unresolvedAliasesRetained: 604, aliasCandidateSetsUnchanged: 5764,
      semanticDifferences: 388, nullEntryIndexPromotions: 0, frameIndexHashPromotions: 388 }, 388,
    { frameIndexHashPromotions: ids('frame-index', 388) });
  } else if (status === 'reviewed-block-index-hash-correction') {
    correction({ boundAliasesAfter: 5730, unresolvedAliasesRetained: 422, aliasCandidateSetsUnchanged: 5919,
      semanticDifferences: 233, nullEntryIndexPromotions: 0, blockIndexHashPromotions: 182,
      blockIndexCandidateRowsDisclosed: 51 }, 233,
    { blockIndexHashPromotions: ids('block-index', 182), blockIndexCandidateRowsDisclosed: ids('candidate', 51) });
  } else if (status === 'reviewed-amiga-comspr-hash-correction') {
    correction({ boundAliasesAfter: 5790, unresolvedAliasesRetained: 362, aliasCandidateSetsUnchanged: 6088,
      semanticDifferences: 64, nullEntryIndexPromotions: 0, blockIndexCandidateRowsDisclosed: 0,
      amigaComsprHashPromotions: 60, amigaComsprCandidateRowsDisclosed: 4 }, 64,
    { amigaComsprHashPromotions: ids('comspr', 60), amigaComsprCandidateRowsDisclosed: ids('candidate', 4),
      amigaComsprArchivePin: { name: 'comspr.daa', sha256: hash('3'), actualSha256: hash('3'),
        scope: 'hash-pinned local candidate/fixture copy only; independent retail/WHDLoad provenance is not established' } });
  } else if (status === 'reviewed-exact-curated-face-links') {
    correction({ semanticDifferences: 4, curatedSourceLinksAfter: 39, curatedUnresolvedCardsRetained: 0 }, 4, {
      reviewedCuratedFaceLinks: [
        { cardId: 'face_cok_amiga_068', sourceSha256: '1c4be53cba24d24f6eef5185598b0cdaa78e665130c4b92dc9d8053f07c07a35', outputSha256: 'a046392a8ee9fb2a6f2ec2e9f5b6b213bc94f13bccee9003050e9fca9acc337e', sourceAssetIds: ['cok/amiga/disk2/head1.daa/block/68/frame/0', 'cok/amiga/disk3/head2.daa/block/68/frame/0'] },
        { cardId: 'face_cok_amiga_069', sourceSha256: '379a7f5870da6bef99aa3b0b61df4900911e9c7e8d3c0d0168bc1b909aa02fa3', outputSha256: '03cecaea9147c02ecd262e354786eaaa60ba73f807320f6540ff704f6f2823b6', sourceAssetIds: ['cok/amiga/disk2/head1.daa/block/69/frame/0', 'cok/amiga/disk3/head2.daa/block/69/frame/0'] },
        { cardId: 'face_cok_dos_068', sourceSha256: '9b5a2eb68ed79bfff2e51544f4256358022260370768b2ae83a4980dd7a02c3f', outputSha256: 'e09b9e0669b31d564cb62057eca1cd142a67e61640bbd5d2fa5cefc054b0372b', sourceAssetIds: ['cok/dos-ega/disk1/head2.dax/block/68/frame/0', 'cok/dos-ega/disk1/head3.dax/block/68/frame/0'] },
        { cardId: 'face_cok_dos_069', sourceSha256: 'bbc1a2ee865060ad4add766989154258aa14b365e84c01e242ec237fe03b2942', outputSha256: '4a4b55bad8e5bb95436576a0da08032b4c7b4b4350c86a0e35785c3e0988a71d', sourceAssetIds: ['cok/dos-ega/disk1/head2.dax/block/69/frame/0', 'cok/dos-ega/disk1/head3.dax/block/69/frame/0'] },
      ],
    });
  }
  return data;
}

test('review schema accepts synthetic fixtures for every supported status without generated receipts', () => {
  for (const status of ['exactly-compatible', 'reviewed-null-entry-index-correction',
    'reviewed-entry-index-hash-correction', 'reviewed-frame-index-hash-correction',
    'reviewed-block-index-hash-correction', 'reviewed-amiga-comspr-hash-correction',
    'reviewed-exact-curated-face-links']) {
    const fixture = reviewFixture(status);
    assert.equal(validate(fixture), true, `${status}: ${JSON.stringify(validate.errors)}`);
  }
});

test('curated face-link review receipt pins every source/output hash and archive-qualified ID', () => {
  for (const mutate of [
    (data) => { data.reviewedCuratedFaceLinks[0].sourceAssetIds[0] = 'cok/amiga/wrong/archive/block/68/frame/0'; },
    (data) => { data.reviewedCuratedFaceLinks[1].outputSha256 = hash('9'); },
    (data) => { data.counts.curatedUnresolvedCardsRetained = 1; },
  ]) {
    const changed = structuredClone(reviewFixture('reviewed-exact-curated-face-links'));
    mutate(changed);
    assert.equal(validate(changed), false, JSON.stringify(validate.errors));
  }
});

test('entry-index receipt requires exactly twelve unique-source promotions', () => {
  for (const [mutate, expectedPath] of [
    [(data) => { data.counts.entryIndexHashPromotions = 11; }, '/counts/entryIndexHashPromotions'],
    [(data) => { data.entryIndexHashPromotions.pop(); }, '/entryIndexHashPromotions'],
    [(data) => { data.counts.unresolvedAliasesRetained = 349; }, '/counts/unresolvedAliasesRetained'],
  ]) {
    const changed = structuredClone(reviewFixture('reviewed-entry-index-hash-correction'));
    mutate(changed);
    assert.equal(validate(changed), false, expectedPath);
    assert.ok(validate.errors.some((error) => error.instancePath === expectedPath || error.instancePath.startsWith(expectedPath)),
      JSON.stringify(validate.errors));
  }
});

test('review receipt rejects malformed hashes, changed alias counts and semantic deltas', () => {
  for (const [mutate, expectedPath] of [
    [(data) => { data.inputs.currentRegistrySha256 = 'stale'; }, '/inputs/currentRegistrySha256'],
    [(data) => { data.counts.aliasCandidateSetsUnchanged--; }, '/counts/aliasCandidateSetsUnchanged'],
    [(data) => { data.counts.semanticDifferences = 1; }, '/counts/semanticDifferences'],
    [(data) => { data.differences.push({ collection: 'generatedAliasRows', id: 'x', fields: ['locator'] }); }, '/differences'],
    [(data) => { data.counts.inventoryPngFilesMissing = -1; }, '/counts/inventoryPngFilesMissing'],
  ]) {
    const changed = structuredClone(reviewFixture('reviewed-block-index-hash-correction'));
    mutate(changed);
    assert.equal(validate(changed), false, expectedPath);
    assert.ok(validate.errors.some((error) => error.instancePath === expectedPath || error.instancePath.startsWith(expectedPath)),
      JSON.stringify(validate.errors));
  }
});

test('Amiga COMSPR receipt requires its correction delta and retail-provenance limitation', () => {
  for (const [mutate, expectedPath] of [
    [(data) => { data.counts.amigaComsprHashPromotions = 59; }, '/counts/amigaComsprHashPromotions'],
    [(data) => { data.amigaComsprCandidateRowsDisclosed.pop(); }, '/amigaComsprCandidateRowsDisclosed'],
    [(data) => { data.amigaComsprArchivePin.scope = 'retail archive'; }, '/amigaComsprArchivePin/scope'],
    [(data) => { data.amigaComsprArchivePin.actualSha256 = 'bad'; }, '/amigaComsprArchivePin/actualSha256'],
  ]) {
    const changed = structuredClone(reviewFixture('reviewed-amiga-comspr-hash-correction'));
    mutate(changed);
    assert.equal(validate(changed), false, expectedPath);
    assert.ok(validate.errors.some((error) => error.instancePath === expectedPath || error.instancePath.startsWith(expectedPath)),
      JSON.stringify(validate.errors));
  }
});
