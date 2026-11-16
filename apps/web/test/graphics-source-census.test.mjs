import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectPublicGraphicsMetadata } from '../scripts/public-graphics-metadata.mjs';
import { buildSourceCensus, censusPage, clearSourceCensusQuery, createSourceCensusLoader, readSourceCensusQuery,
  registryIdentityDigest, sourceCensusSelection, writeSourceCensusQuery } from '../src/ui/graphics-source-census.mjs';

const read = (name) => JSON.parse(readFileSync(new URL(`../../../docs/engine/research/${name}.json`, import.meta.url), 'utf8'));
const report = read('cok-graphics-source-census-v1');
const { assets } = read('cok-graphics-identity-registry-v1');

test('Python receipt fingerprint matches raw and projected registry, independent of private roots', async () => {
  assert.equal(await registryIdentityDigest(assets), report.registryAssetIdentitySha256);
  assert.equal(await registryIdentityDigest([...assets].reverse()), report.registryAssetIdentitySha256);
  const projected = projectPublicGraphicsMetadata(assets);
  assert.equal(await registryIdentityDigest(projected), report.registryAssetIdentitySha256);
  const moved = [{ ...assets[0], archive: { ...assets[0].archive, path: 'Z:/different/root/example.daa' } }, ...assets.slice(1)];
  assert.equal(await registryIdentityDigest(moved), report.registryAssetIdentitySha256);
  await buildSourceCensus(report, projected);
});

test('changed portable identity fields make the receipt stale', async () => {
  const [first, ...rest] = assets;
  for (const mutation of [
    { id: `${first.id}-changed` }, { edition: 'different' }, { identityStatus: 'unverified' },
    { archive: { ...first.archive, sha256: 'a'.repeat(64) } },
    { locator: { ...first.locator, entryIndex: 99999 } },
    { decoded: { ...first.decoded, pixelSha256: 'a'.repeat(64) } },
    { sourceContentSha256: 'a'.repeat(64) }, { sourcePixelSha256: 'a'.repeat(64) },
  ]) await assert.rejects(buildSourceCensus(report, [{ ...first, ...mutation }, ...rest]), /fingerprint differs/);
});

test('model reconciles distinct occurrence, entry, child, derived, and registry counts', async () => {
  const model = await buildSourceCensus(report, assets);
  const [dos, amiga] = model.report.sourceSets.map((set) => set.summary);
  assert.deepEqual([dos.rosterFiles, dos.storedEntries, dos.totalDrawableCount, dos.drawableChildrenWithExactBinding, dos.derivedViews],
    [31, 538, 2600, 2600, 26]);
  assert.deepEqual([amiga.rosterFiles, amiga.storedEntries, amiga.totalDrawableCount, amiga.parsedCandidateDrawableChildren, amiga.derivedViews],
    [46, 415, null, 102, 8]);
  assert.equal(model.report.unresolvedRegistryBindings.length, 686);
  const screen = model.byFile.get('amiga-private-extraction/disk1/scrn1b.lbm');
  assert.equal(screen.children.length, 1);
  assert.deepEqual(screen.children[0].sourceIds, []);
  const font = model.byFile.get('dos-install/8X8D1.DAX').entries.find((entry) => entry.blockId === 201);
  assert.equal(font.children.filter((child) => child.kind === 'glyph' && child.sourceIds.length === 1).length, 177);
  assert.deepEqual(font.children[0].sourceIds, ['cok/dos-ega/disk1/8x8d1.dax/block/201/glyph/0']);
  const firstGlyph = assets.find((asset) => asset.id.endsWith('/block/201/glyph/0'));
  assert.equal(firstGlyph.gameConsumers[0].status, 'partial');
  const lastGlyph = assets.find((asset) => asset.id.endsWith('/block/201/glyph/176'));
  assert.equal(lastGlyph.gameConsumers[0].status, 'unknown');
  assert.equal(firstGlyph.sourceContentSha256, font.children[0].indexSha256);
  assert.equal(firstGlyph.sourcePixelSha256, font.children[0].rgbSha256);
});

test('rejects invalid counts, duplicate occurrences, invented and inconsistent source bindings', async () => {
  for (const [mutate, error] of [
    [(data) => { data.sourceSets[0].summary.storedEntries += 1; }, /summary counters differ/],
    [(data) => { data.files[0].drawableCount = -1; }, /file occurrence/],
    [(data) => { data.files.push(data.files[0]); }, /duplicate file occurrence/],
    [(data) => { data.unresolvedRegistryBindings[0].sourceId = 'unknown'; }, /unresolved registry row/],
    [(data) => {
      const child = data.files.flatMap((file) => file.entries.flatMap((entry) => entry.children)).find((row) => row.sourceIds.length);
      child.candidate = true;
    }, /exact child binding/],
    [(data) => {
      const child = data.files.flatMap((file) => file.entries.flatMap((entry) => entry.children)).find((row) => row.sourceIds.length);
      child.rgbSha256 = 'a'.repeat(64);
    }, /exact child binding/],
  ]) {
    const data = structuredClone(report);
    mutate(data);
    await assert.rejects(buildSourceCensus(data, assets), error);
  }
});

test('bookmarks round trip, unknown occurrences remain missing, and pages cap rows', async () => {
  const model = await buildSourceCensus(report, assets);
  const initial = new URLSearchParams('graphics=1&sourceCoverage=1&sourceSet=dos-install&sourceFile=dos-install%2FCPIC1.DAX&sourceEntry=0&sourceChildPage=1&keep=yes');
  const state = readSourceCensusQuery(initial);
  assert.equal(state.entry, 0);
  assert.equal(sourceCensusSelection(model, state).entry.entryIndex, 0);
  assert.deepEqual(readSourceCensusQuery(writeSourceCensusQuery(initial, state)), state);
  const result = sourceCensusSelection(model, { ...state, set: 'absent', file: 'ambiguous.dax' });
  assert.equal(result.file, undefined);
  assert.equal(result.missingSet, true);
  assert.equal(result.files.items.length, 0);
  assert.equal(censusPage(Array(100).fill('row'), 0).items.length, 40);
  assert.equal(censusPage(Array(100).fill('row'), 99).items.length, 20);
  clearSourceCensusQuery(initial);
  assert.equal(initial.toString(), 'graphics=1&keep=yes');
});

test('census loading is lazy, shared and retryable after failure', async () => {
  let calls = 0;
  const load = createSourceCensusLoader(async () => {
    calls++;
    if (calls === 1) throw new Error('unavailable');
    return 'model';
  });
  assert.equal(calls, 0);
  const first = load();
  assert.equal(first, load());
  await assert.rejects(first, /unavailable/);
  assert.equal(await load(), 'model');
  assert.equal(await load(), 'model');
  assert.equal(calls, 2);
});

test('the graphics browser requests the census only in its own lazy mode', () => {
  const browser = readFileSync(new URL('../src/ui/graphicsBrowser.ts', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
  assert.equal((browser.match(/cok-graphics-source-census-v1\.json/g) ?? []).length, 1);
  assert.match(browser, /await import\('[^']+cok-graphics-source-census-v1\.json'\)/);
  assert.match(browser, /browseMode === 'sourceCoverage' && render === censusRender/);
  assert.match(browser, /if \(browseMode === 'sourceCoverage'\) void showSourceCensus\(\)/);
  assert.doesNotMatch(main, /cok-graphics-source-census-v1\.json/);
});
