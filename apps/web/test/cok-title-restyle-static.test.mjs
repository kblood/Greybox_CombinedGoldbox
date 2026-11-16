// Synthetic source-only controls: no browser, launcher, build or original game data.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertCokTitleCandidateResponse, cokTitleCandidateEntries, cokTitleCandidateSelectionError } from './cok-title-restyle-static.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const document = (js = './assets/index-test.js', css = './assets/index-test.css') =>
  `<script type="module" src="${js}"></script><link rel="stylesheet" href="${css}">`;
function fixture(t, html = document()) {
  const root = mkdtempSync(join(tmpdir(), 'cok-title-static-binding-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'assets'));
  writeFileSync(join(root, 'assets/index-test.js'), 'synthetic JavaScript');
  writeFileSync(join(root, 'assets/index-test.css'), 'synthetic CSS');
  writeFileSync(join(root, 'index.html'), html);
  return root;
}

test('root and subpath entries bind exact candidate HTML/JS/CSS bytes', (t) => {
  const root = fixture(t);
  for (const base of ['https://example.invalid', 'https://example.invalid/greybox', 'https://example.invalid/greybox/']) {
    const binding = cokTitleCandidateEntries(root, base);
    const site = `${base.replace(/\/$/, '')}/`;
    assert.equal(binding.site, site);
    assert.equal(binding.indexSha256, sha(readFileSync(join(root, 'index.html'))));
    assert.deepEqual([...binding.assets], ['js', 'css'].map((extension) => [
      `${site}assets/index-test.${extension}`, sha(readFileSync(join(root, `assets/index-test.${extension}`))),
    ]));
  }
  writeFileSync(join(root, 'index.html'), document('/greybox/assets/index-test.js', '/greybox/assets/index-test.css'));
  assert.equal(cokTitleCandidateEntries(root, 'https://example.invalid/greybox').assets.size, 2);
});

test('missing, ambiguous or escaping entry references fail closed', (t) => {
  const root = fixture(t);
  for (const html of [
    '<link rel="stylesheet" href="./assets/index-test.css">',
    '<script type="module" src="./assets/index-test.js"></script>',
    `${document()}<script type="module" src="./assets/another.js"></script>`,
    `${document()}<link rel="stylesheet" href="./assets/another.css">`,
    '<script type="module"></script><link rel="stylesheet" href="./assets/index-test.css">',
    document('https://other.invalid/assets/index-test.js'),
    document('/assets/index-test.js'), document('../assets/index-test.js'),
    document('./assets%2findex-test.js'), document('./assets/index-test.js?alternate=1'),
    `<base href="/elsewhere/">${document()}`,
  ]) {
    writeFileSync(join(root, 'index.html'), html);
    assert.throws(() => cokTitleCandidateEntries(root, 'https://example.invalid/greybox'), undefined, html);
  }
});

test('response binding rejects stale served bytes, wrong status and unexpected URL', () => {
  const expected = new Map([['https://example.invalid/greybox/assets/index.js', sha(Buffer.from('candidate bytes'))]]);
  const [url] = expected.keys();
  assert.doesNotThrow(() => assertCokTitleCandidateResponse(url, 200, Buffer.from('candidate bytes'), expected));
  assert.throws(() => assertCokTitleCandidateResponse(url, 200, Buffer.from('older deployed bytes'), expected), /Actual packaged response differs/);
  assert.throws(() => assertCokTitleCandidateResponse(url, 404, Buffer.from('candidate bytes'), expected), /response status/);
  assert.throws(() => assertCokTitleCandidateResponse(`${url}?alternate=1`, 200, Buffer.from('candidate bytes'), expected), /Unexpected candidate response URL/);
});

test('static selection requires both inputs; ordinary dev and external runs keep their behavior', () => {
  const selected = new Set(['cok-title-restyle-static']);
  for (const [directory, base] of [[undefined, undefined], ['candidate', undefined], [undefined, 'https://example.invalid/greybox']]) {
    assert.match(cokTitleCandidateSelectionError(selected, directory, base), /requires both/);
  }
  assert.equal(cokTitleCandidateSelectionError(selected, 'candidate', 'https://example.invalid/greybox'), null);
  assert.equal(cokTitleCandidateSelectionError(new Set(), undefined, undefined), null);
  assert.equal(cokTitleCandidateSelectionError(new Set(['intro']), undefined, 'https://example.invalid/greybox'), null);
  assert.match(cokTitleCandidateSelectionError(new Set(), 'candidate', undefined), /requires GB_E2E_BASE_URL/);
});

test('configuration guard precedes Edge detection and every launch in shared harness main', () => {
  const source = readFileSync(new URL('./e2e.mjs', import.meta.url), 'utf8');
  const main = source.slice(source.indexOf('async function main() {'));
  const guard = main.indexOf('cokTitleCandidateSelectionError(ONLY, COK_TITLE_CANDIDATE, EXTERNAL_BASE)');
  assert.ok(guard >= 0);
  for (const marker of ['existsSync(EDGE)', 'vite = spawn(', 'puppeteer.launch(']) assert.ok(main.indexOf(marker) > guard, marker);
});
