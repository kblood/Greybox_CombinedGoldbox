import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const browser = readFileSync(new URL('../src/ui/graphicsBrowser.ts', import.meta.url), 'utf8');
const restyle = readFileSync(new URL('../src/ui/restyle.ts', import.meta.url), 'utf8');
const coverage = readFileSync(new URL('../src/ui/graphics-coverage.mjs', import.meta.url), 'utf8');

test('binding sidecar stays a nested lazy import inside the lazy graphics route', () => {
  assert.match(browser, /function loadAliasBindings\(\)[\s\S]*?import\(['"]\.\.\/\.\.\/\.\.\/\.\.\/docs\/engine\/research\/cok-graphics-alias-bindings-v1\.json['"]\)/);
  const main = readFileSync(new URL('../src/ui/main.ts', import.meta.url), 'utf8');
  assert.match(main, /await import\(['"]\.\/graphicsBrowser\.js['"]\)/);
  assert.doesNotMatch(main, /cok-graphics-alias-bindings-v1/);
});

test('gallery navigation uses exact resolvers and discloses unresolved evidence', () => {
  assert.match(browser, /resolveCuratedGalleryCard\(reference\.id\)/);
  assert.match(browser, /verifyCurrentComparisonPair\([\s\S]*?sourceUrl:[\s\S]*?outputUrl:[\s\S]*?sourceSha256:[\s\S]*?outputSha256:/);
  assert.match(browser, /currentPair\.sourceSha256[\s\S]*?currentPair\.outputSha256/);
  assert.match(browser, /resolveGeneratedGalleryCardForSource\(reference\.id, asset\.id, restyle\.id, reference\.outputSha256/);
  assert.match(browser, /requireExactRestyleBinding\(result,[\s\S]*?sourceAssetId, restyleId, outputSha256/);
  assert.match(browser, /verifyGalleryPair\(`cok-generated\/\$\{sourcePath\}`[\s\S]*?item\.sourceSha256, item\.outputSha256/);
  assert.match(browser, /resolveExternalGalleryCard[\s\S]*?sourcePath = `orig\/\$\{item\.stem\}\.png`[\s\S]*?currentPair\.status !== 'resolved'/);
  assert.match(browser, /Unresolved gallery link: \$\{result\.reason/);
  assert.match(restyle, /resolveCuratedGalleryCard\(item\.id, item\.stem\)/);
  assert.match(restyle, /resolveGeneratedGalleryAliases\(item\)/);
  assert.match(restyle, /Unresolved source identity: \$\{result\.reason/);
  assert.match(restyle, /Unresolved source identity: \$\{external\.reason/);
  assert.match(restyle, /Alias \$\{aliasIndex \+ 1\} unresolved: \$\{result\.reason/);
  assert.match(restyle, /Candidate source IDs \(unresolved\)/);
  assert.match(restyle, /candidate-source-link/);
  assert.doesNotMatch(restyle, /sourceAssetIdsFor(?:CuratedRestyleCard|RestyleGalleryCard)/);
});

test('Restyle cards show canonical descriptions and game use only for exactly resolved IDs', () => {
  assert.match(browser, /getCanonicalGraphicsSummaries\(sourceAssetIds:[\s\S]*?catalog\.sourcesFor\(sourceAssetIds\)/);
  assert.match(restyle, /if \(result\.status !== 'resolved'\)[\s\S]*?return;[\s\S]*?fillSourceContextPanel\(sourceContext, result\.sourceAssetIds\)/);
  assert.match(restyle, /fillSourceContextPanel\(sourceContext, external\.sourceAssetIds\)/);
  assert.match(restyle, /const sourceIds = \[\.\.\.new Set\(aliases\.flatMap\([\s\S]*?result\.status === 'resolved' \? result\.sourceAssetIds : \[\]/);
  assert.match(restyle, /Description · \$\{summary\.descriptionStatus\}: \$\{summary\.description\}/);
  assert.match(restyle, /Visible appearance: \$\{summary\.visualDescription\}/);
  assert.match(restyle, /Game use · \$\{consumer\.status\}: \$\{consumer\.use\}/);
  assert.match(restyle, /Game use · unknown: no consumer evidence recorded/);
  assert.match(browser, /animationGroups: catalog\.animationGroupsFor\(asset\.id\)/);
  assert.match(restyle, /Animation group \$\{group\.id\} · \$\{group\.status\} · \$\{group\.semantics\} · \$\{group\.playback\}/);
  assert.match(restyle, /Ordered source frames:/);
  assert.match(restyle, /canonical-animation-frame-link/);
  assert.match(restyle, /Animation membership · no source frame group is recorded for this ID/);
  assert.ok(browser.includes('export async function getCanonicalGraphicsCoverage'));
  assert.ok(coverage.includes('model.sourceLinks.has(id)'));
  assert.ok(coverage.includes('model.usage.get(id)'));
  assert.ok(coverage.includes('runtimeObservation: model.report.runtimeObservation'));
  assert.ok(restyle.includes("details.addEventListener('toggle'"));
  assert.ok(restyle.includes('getCanonicalGraphicsCoverage([sourceId])'));
  assert.match(restyle, /Static coverage only\. The report explicitly marks runtime observation and production packaging unverified/);
  assert.match(restyle, /no exact source-pinned match in the current bounded coverage snapshot/);
});

test('production gallery aliases and Restyle proposal cannot fetch remote image bytes', () => {
  assert.match(browser, /async function verifyGalleryPair[\s\S]*?localAssetPackPinnedBytes\(sourcePath, sourceSha256\)[\s\S]*?allowFetch: IS_DEV/);
  assert.match(browser, /else if \(IS_DEV\) tryNext\(\);[\s\S]*?select the local Restyle image folder/);
  assert.match(restyle, /async function startProposal\(\): Promise<number> \{[\s\S]*?if \(!IS_DEV\) \{[\s\S]*?return 0;[\s\S]*?const url = IS_DEV \?/);
  const dok = readFileSync(new URL('../src/ui/dokOpeningArt.ts', import.meta.url), 'utf8');
  assert.match(dok, /localAssetPackPinnedBytes\(`out\/\$\{file\}`, DOK_DRAGON_RESTYLE\.sha256\)/);
  assert.match(dok, /if \(!pinnedBytes && import\.meta\.env\.DEV\)[\s\S]*?fetch\(assetUrl/);
  assert.match(dok, /if \(!pinnedBytes\) throw new Error/);
});
