import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (name) => readFileSync(new URL(`../src/ui/${name}`, import.meta.url), 'utf8');
const browser = read('graphicsBrowser.ts');
const coverage = read('graphicsCoverage.ts');
const restyle = read('restyle.ts');

test('runtime coverage loads the report and renderer on demand inside the graphics browser', () => {
  assert.match(browser, /createCoverageLoader\(async \(\) => \{\s*const \[report, receipt\] = await Promise\.all\(\[\s*import\('[^']+cok-runtime-art-coverage-v2\.json'\),\s*import\('[^']+cok-runtime-art-combat-sites-v2\.json'\)/);
  assert.match(browser, /coverage\.addEventListener\('toggle'[\s\S]*?if \(!coverage\.open[\s\S]*?Promise\.all\(\[import\('\.\/graphicsCoverage\.js'\), loadCoverage\(\)\]\)/);
  assert.match(browser, /showCoverage = async[\s\S]*?if \(!stillSelected\(\)\) return;[\s\S]*?ui\.renderCoverageMode/);
  assert.match(browser, /if \(stillSelected\(\)\) coverage\.replaceChildren[^\n]*Coverage unavailable/);
  for (const source of [read('main.ts'), restyle, coverage]) assert.doesNotMatch(source, /cok-runtime-art-(?:coverage|combat-sites)-v[12]\.json/);
  assert.doesNotMatch(browser, /cok-runtime-art-coverage-v1\.json/);
});

test('the coverage view keeps scope visible and the old comparison accessible', () => {
  assert.match(restyle, /coverage\.href = '\?graphics=1&coverage=1'/);
  assert.match(restyle, /graphicsBrowser\.href = '\?graphics=1'/);
  assert.match(restyle, /graphicsBrowser\.dataset\.role = 'graphics-identity-link'/);
  assert.match(restyle, /resolveCuratedGalleryCard\(item\.id, item\.stem\)/);
  assert.match(read('main.ts'), /\['Game graphics · IDs and versions', '\?graphics=1'\]/);
  assert.match(coverage, /comparison\.href = '\?restyle=1'/);
  assert.match(coverage, /Town and main-menu original-source use/);
  assert.match(coverage, /selected DOS archive is not hash-verified/);
  assert.match(coverage, /Campaign coverage is incomplete[\s\S]*?bounded DOS ECL traversal[\s\S]*?unverified/);
  assert.match(coverage, /container\.replaceChildren\(overview\(model, openSource\), controls, layout\)/);
  assert.match(coverage, /Not recorded in this coverage snapshot/);
  assert.doesNotMatch(coverage, /gallery=|exact-restyle-link/);
});
