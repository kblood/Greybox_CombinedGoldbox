import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createGraphicsCatalog } from '../src/ui/graphics-catalog.mjs';
import { buildVersionComparison } from '../src/ui/graphics-version-comparison.mjs';

const hash = (digit) => digit.repeat(64);
const source = (id, platform, edition) => ({ id, game: 'cok', platform, edition, decoded: { sha256: hash('a') } });
const link = (fromAssetId, toAssetId, relation = 'pixel-identical', confidence = 'verified') =>
  ({ fromAssetId, toAssetId, relation, confidence, evidence: [] });

test('one-hop comparison groups counterparts, keeps identities separate and reports unrecorded platforms', () => {
  const registry = {
    assets: [source('dos/a', 'DOS-EGA', 'DOS disk 1'), source('dos/b', 'DOS-EGA', 'DOS disk 2'),
      source('amiga/a', 'Amiga', 'Amiga disk 2'), source('dos/c', 'DOS-EGA', 'DOS disk 3')],
    restyles: [{ id: 'r/1', sourceAssetIds: ['dos/a'], sourceRelation: 'one-to-one', outputs: [] },
      { id: 'r/2', sourceAssetIds: ['amiga/a', 'dos/b'], sourceRelation: 'many-to-one', outputs: [] }],
    animationGroups: [], appearanceSets: [],
    crossVersionLinks: [link('dos/a', 'dos/b'), link('amiga/a', 'dos/a', 'pixel-identical', 'possible'),
      link('dos/c', 'dos/b')],
  };
  const catalog = createGraphicsCatalog(registry);
  const comparison = buildVersionComparison(catalog, 'dos/a');
  assert.deepEqual(comparison.members.map((member) => [member.assetId, member.depth]),
    [['dos/a', 0], ['amiga/a', 1], ['dos/b', 1]]);
  assert.deepEqual(comparison.members.find((member) => member.assetId === 'dos/a').restyleIds, ['r/1']);
  assert.deepEqual(comparison.members.find((member) => member.assetId === 'dos/b').restyleIds, ['r/2']);
  assert.equal(comparison.unverifiedLinkCount, 1);
  assert.deepEqual(comparison.platforms.map((group) => group.platform), ['Amiga', 'DOS-EGA']);
  assert.deepEqual(comparison.unrecordedPlatforms.map((row) => row.platform), []);
  // dos/c is two hops away and must not be pulled in by a one-hop comparison.
  assert.ok(!comparison.members.some((member) => member.assetId === 'dos/c'));
  // Distinct identities remain distinct even when pixel-identical.
  assert.equal(new Set(comparison.members.map((member) => member.assetId)).size, comparison.members.length);
});

test('a subject with no direct links reports every other game platform as unrecorded, not absent', () => {
  const registry = { assets: [source('dos/a', 'DOS-EGA', 'DOS disk 1'), source('amiga/a', 'Amiga', 'Amiga disk 2')],
    restyles: [], animationGroups: [], appearanceSets: [], crossVersionLinks: [] };
  const comparison = buildVersionComparison(createGraphicsCatalog(registry), 'dos/a');
  assert.deepEqual(comparison.members.map((member) => member.assetId), ['dos/a']);
  assert.deepEqual(comparison.unrecordedPlatforms.map((row) => row.platform), ['Amiga']);
  assert.match(comparison.unrecordedPlatforms[0].note, /not evidence that the platform lacks/);
});

test('unknown subjects are rejected', () => {
  const catalog = createGraphicsCatalog({ assets: [], restyles: [], animationGroups: [], appearanceSets: [], crossVersionLinks: [] });
  assert.throws(() => buildVersionComparison(catalog, 'missing'), /Unknown source ID/);
});

test('real CoK DOS PIC1 pilot subject resolves its recorded counterparts and restyle candidates', () => {
  const registry = JSON.parse(readFileSync(new URL('../../../docs/engine/research/cok-graphics-identity-registry-v1.json', import.meta.url), 'utf8'));
  const catalog = createGraphicsCatalog(registry);
  const subjectId = 'cok/dos-ega/disk1/pic1.dax/block/57/frame/0';
  const comparison = buildVersionComparison(catalog, subjectId);
  const ids = comparison.members.map((member) => member.assetId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(comparison.members[0].assetId, subjectId);
  assert.ok(comparison.members.every((member) => member.resolved), 'every counterpart should be a registry source');
  assert.ok(comparison.members.some((member) => member.platform === 'Amiga'), 'the candidate Amiga copy is recorded');
  assert.ok(comparison.restyles.length >= 2, 'both restyle records for block 57 are visible');
  assert.ok(comparison.unrecordedPlatforms.some((row) => row.platform === 'Amiga') === false);
});
