import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createGraphicsCatalog } from '../src/ui/graphics-catalog.mjs';
import { COMMON_PIXEL_THRESHOLD, buildVersionOverview, coverageByPlatform, coverageByPlatformAndArchive, filterVersionOverview } from '../src/ui/graphics-version-overview.mjs';

const source = (id, platform, pixelSha256 = null) => ({ id, game: 'cok', platform, edition: `${platform} set`,
  archive: { name: 'A.DAT' }, decoded: pixelSha256 ? { pixelSha256 } : null });
const link = (fromAssetId, toAssetId, confidence = 'verified') =>
  ({ fromAssetId, toAssetId, relation: 'pixel-identical', confidence, evidence: [] });
const empty = { restyles: [], animationGroups: [], appearanceSets: [] };

test('overview classifies sources by direct links only and never merges transitively', () => {
  const catalog = createGraphicsCatalog({ ...empty, assets: [source('d/1', 'DOS-EGA', 'p'), source('a/1', 'Amiga', 'p'),
    source('a/2', 'Amiga', 'p'), source('d/2', 'DOS-EGA', 'q')],
    crossVersionLinks: [link('d/1', 'a/1'), link('a/1', 'a/2', 'possible')] });
  const overview = buildVersionOverview(catalog, 'cok');
  const byId = Object.fromEntries(overview.rows.map((row) => [row.id, row]));
  assert.equal(byId['d/1'].status, 'cross-platform-recorded');
  assert.equal(byId['a/2'].status, 'same-platform-only');
  assert.equal(byId['a/2'].unverifiedLinkCount, 1);
  assert.equal(byId['d/2'].status, 'no-direct-counterpart');
  assert.deepEqual(byId['d/2'].unrecordedPlatforms, ['Amiga']);
  // d/1 is not directly linked to a/2 and must not inherit it.
  assert.equal(byId['d/1'].counterpartCount, 1);
  assert.equal(overview.summary.pixelGroupsShared, 1);
  assert.equal(overview.summary.largestPixelGroup, 3);
});

test('real CoK overview accounts for every registry source exactly once', () => {
  const registry = JSON.parse(readFileSync(new URL('../../../docs/engine/research/cok-graphics-identity-registry-v1.json', import.meta.url), 'utf8'));
  const overview = buildVersionOverview(createGraphicsCatalog(registry), 'cok');
  assert.equal(overview.rows.length, registry.assets.length);
  assert.equal(new Set(overview.rows.map((row) => row.id)).size, registry.assets.length);
  const statusTotal = Object.values(overview.summary.byStatus).reduce((sum, count) => sum + count, 0);
  assert.equal(statusTotal, overview.summary.sourceCount);
  assert.equal(overview.summary.byStatus['cross-platform-recorded'] + overview.summary.byStatus['same-platform-only'] + overview.summary.byStatus['no-direct-counterpart'], registry.assets.length);
});

test('overview filters and pages without mutating rows', () => {
  const rows = Array.from({ length: 250 }, (_, index) => ({ id: `x/${String(index).padStart(3, '0')}`,
    platform: index % 3 ? 'Amiga' : 'DOS-EGA', status: index % 2 ? 'same-platform-only' : 'no-direct-counterpart' }));
  const overview = { rows, platforms: ['Amiga', 'DOS-EGA'], summary: {}, game: 'cok' };
  const snapshot = structuredClone(rows);
  const all = filterVersionOverview(overview, { status: 'all', platform: 'all', page: 0 });
  assert.equal(all.pageCount, 3);
  assert.equal(all.rows.length, 100);
  const last = filterVersionOverview(overview, { status: 'all', platform: 'all', page: 99 });
  assert.equal(last.page, 2);
  assert.equal(last.rows.length, 50);
  const filtered = filterVersionOverview(overview, { status: 'same-platform-only', platform: 'DOS-EGA', page: 0 });
  assert.ok(filtered.rows.every((row) => row.status === 'same-platform-only' && row.platform === 'DOS-EGA'));
  assert.deepEqual(rows, snapshot);
  const empty = filterVersionOverview(overview, { status: 'cross-platform-recorded', platform: 'all', page: 0 });
  assert.equal(empty.rows.length, 0);
  assert.equal(empty.pageCount, 1);
});

test('overview filters by edition and archive', () => {
  const rows = [
    { id: 'a', platform: 'DOS-EGA', edition: 'original', archiveName: 'PIC1', status: 'same-platform-only' },
    { id: 'b', platform: 'DOS-EGA', edition: 'remake', archiveName: 'PIC1', status: 'same-platform-only' },
    { id: 'c', platform: 'Amiga', edition: 'original', archiveName: 'ECL', status: 'no-direct-counterpart' },
  ];
  const overview = { rows, platforms: ['Amiga', 'DOS-EGA'], editions: ['original', 'remake'], archives: ['ECL', 'PIC1'], summary: {}, game: 'cok' };
  const state = { status: 'all', platform: 'all', edition: 'all', archive: 'all', page: 0 };
  assert.deepEqual(filterVersionOverview(overview, state).rows.map((row) => row.id), ['a', 'b', 'c']);
  assert.deepEqual(filterVersionOverview(overview, { ...state, edition: 'remake' }).rows.map((row) => row.id), ['b']);
  assert.deepEqual(filterVersionOverview(overview, { ...state, archive: 'PIC1' }).rows.map((row) => row.id), ['a', 'b']);
  assert.deepEqual(filterVersionOverview(overview, { ...state, archive: 'PIC1', edition: 'original' }).rows.map((row) => row.id), ['a']);
  // Older callers without edition/archive still mean 'all'.
  assert.equal(filterVersionOverview(overview, { status: 'all', platform: 'all', page: 0 }).rows.length, 3);
});

test('coverage tables count every overview row exactly once per table', () => {
  const rows = [
    { id: 'a', platform: 'Amiga', archiveName: 'X.DAA', status: 'cross-platform-recorded', restyleCount: 1 },
    { id: 'b', platform: 'Amiga', archiveName: 'X.DAA', status: 'same-platform-only', restyleCount: 0 },
    { id: 'c', platform: 'Amiga', archiveName: 'Y.DAA', status: 'no-direct-counterpart', restyleCount: 2 },
    { id: 'd', platform: 'DOS-EGA', archiveName: null, status: 'no-direct-counterpart', restyleCount: 0 },
  ];
  const overview = { rows, platforms: ['Amiga', 'DOS-EGA'], summary: {}, game: 'cok' };
  const byArchive = coverageByPlatformAndArchive(overview);
  assert.deepEqual(byArchive.map((row) => [row.platform, row.archiveName, row.sourceCount, row.withRestyle]),
    [['Amiga', 'X.DAA', 2, 1], ['Amiga', 'Y.DAA', 1, 1], ['DOS-EGA', null, 1, 0]]);
  assert.equal(byArchive[0].byStatus['cross-platform-recorded'], 1);
  const byPlatform = coverageByPlatform(overview);
  assert.deepEqual(byPlatform.map((row) => [row.platform, row.sourceCount]), [['Amiga', 3], ['DOS-EGA', 1]]);
  assert.equal(byPlatform.reduce((sum, row) => sum + row.sourceCount, 0), rows.length);
});

test('real CoK coverage tables reconcile with the overview totals', () => {
  const registry = JSON.parse(readFileSync(new URL('../../../docs/engine/research/cok-graphics-identity-registry-v1.json', import.meta.url), 'utf8'));
  const overview = buildVersionOverview(createGraphicsCatalog(registry), 'cok');
  const byArchive = coverageByPlatformAndArchive(overview);
  const byPlatform = coverageByPlatform(overview);
  const total = (tables) => tables.reduce((sum, row) => sum + row.sourceCount, 0);
  assert.equal(total(byArchive), overview.summary.sourceCount);
  assert.equal(total(byPlatform), overview.summary.sourceCount);
  assert.equal(byPlatform.reduce((sum, row) => sum + row.withRestyle, 0), overview.summary.withRestyle);
  for (const row of byPlatform) {
    assert.equal(Object.values(row.byStatus).reduce((sum, count) => sum + count, 0), row.sourceCount, row.platform);
  }
});

test('large shared-pixel groups are labelled as common-pixel candidates', () => {
  const assets = Array.from({ length: COMMON_PIXEL_THRESHOLD }, (_, i) => source('c/' + i, 'Amiga', 'solid'))
    .concat([source('s/1', 'DOS-EGA', 'pair'), source('s/2', 'Amiga', 'pair')]);
  const overview = buildVersionOverview(createGraphicsCatalog({ ...empty, assets, crossVersionLinks: [] }), 'cok');
  assert.ok(overview.rows.filter((row) => row.id.startsWith('c/')).every((row) => row.commonPixelCandidate));
  assert.ok(overview.rows.filter((row) => row.id.startsWith('s/')).every((row) => !row.commonPixelCandidate));
  assert.equal(overview.summary.commonPixelCandidateGroups, 1);
  assert.equal(overview.summary.commonPixelCandidateSources, COMMON_PIXEL_THRESHOLD);
});

test('real CoK common-pixel candidates are the large solid-tile groups', () => {
  const registry = JSON.parse(readFileSync(new URL('../../../docs/engine/research/cok-graphics-identity-registry-v1.json', import.meta.url), 'utf8'));
  const overview = buildVersionOverview(createGraphicsCatalog(registry), 'cok');
  assert.equal(overview.summary.largestPixelGroup, 140);
  assert.equal(overview.summary.commonPixelCandidateGroups, 5);
  assert.equal(overview.summary.commonPixelCandidateSources, overview.rows.filter((row) => row.pixelGroupSize >= COMMON_PIXEL_THRESHOLD).length);
  assert.ok(overview.rows.filter((row) => row.commonPixelCandidate).every((row) => row.pixelGroupSize >= COMMON_PIXEL_THRESHOLD));
});

test('stored font glyphs group by their source pixel hash when no decoded image hash exists', () => {
  const glyph = (id, hash) => ({ id, game: 'cok', platform: 'DOS-EGA', edition: 'DOS install',
    archive: { name: '8X8D1.DAX' }, locator: { kind: 'glyph' }, decoded: null, sourcePixelSha256: hash });
  const catalog = createGraphicsCatalog({ ...empty, assets: [glyph('g/1', 'h'), glyph('g/2', 'h'), glyph('g/3', 'k')],
    crossVersionLinks: [link('g/1', 'g/2')] });
  const rows = Object.fromEntries(buildVersionOverview(catalog, 'cok').rows.map((row) => [row.id, row]));
  assert.equal(rows['g/3'].pixelSha256, 'k');
  assert.equal(rows['g/1'].pixelGroupSize, 2);
  assert.equal(rows['g/1'].status, 'same-platform-only');
  assert.equal(rows['g/3'].pixelGroupSize, 1);
});
