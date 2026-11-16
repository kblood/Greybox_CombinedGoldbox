// Executable packaging fixtures; no generated assets or browser required.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../scripts/bundle-restyle-animations.mjs', import.meta.url));
const item = { id: 'test_anim', frames: 3, staged: [0, 2], texts: [{ frame: 0, what: 'hub', source: 'hub' }] };

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'goldbox-anim-pack-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  const output = join(root, 'output');
  const target = join(output, 'restyle', 'anim');
  const put = (rel, bytes) => {
    const path = join(source, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  };
  const index = Buffer.from(JSON.stringify({ items: [item], problems: [] }, null, 3) + '\n');
  function populate() {
    put('index.json', index);
    for (const frame of item.staged) {
      for (const prefix of ['o', 'r']) put(`test_anim/${prefix}${frame}.png`, Buffer.from([0, 255, frame, prefix.charCodeAt(0)]));
    }
  }
  const run = (metadataOnly = false) => spawnSync(process.execPath,
    [script, output, source, ...(metadataOnly ? ['--metadata-only'] : [])], { encoding: 'utf8' });
  return { source, target, put, index, populate, run };
}

test('copies exact index and every referenced pair, omitting unrelated files and stale output', (t) => {
  const f = fixture(t);
  f.populate();
  f.put('test_anim/unrelated.png', 'do not publish');
  f.put('unused/o0.png', 'do not publish');
  mkdirSync(f.target, { recursive: true });
  writeFileSync(join(f.target, 'stale.png'), 'old');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(f.target).sort(), ['index.json', 'test_anim']);
  const manifest = JSON.parse(readFileSync(join(f.target, 'index.json'), 'utf8'));
  assert.deepEqual(manifest.items, [item]);
  assert.deepEqual(Object.keys(manifest.imageSha256).sort(), ['test_anim/o0.png', 'test_anim/o2.png', 'test_anim/r0.png', 'test_anim/r2.png']);
  assert.deepEqual(readdirSync(join(f.target, item.id)).sort(), ['o0.png', 'o2.png', 'r0.png', 'r2.png']);
  for (const frame of item.staged) {
    for (const prefix of ['o', 'r']) {
      const rel = `${item.id}/${prefix}${frame}.png`;
      const bytes = readFileSync(join(f.source, rel));
      assert.deepEqual(readFileSync(join(f.target, rel)), bytes);
      assert.equal(manifest.imageSha256[rel], createHash('sha256').update(bytes).digest('hex'));
    }
  }
});

test('absent source creates a valid empty index', (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(f.target, 'index.json'), 'utf8')), { items: [], problems: [] });
});

test('metadata-only mode validates source frames but packages only the animation index', (t) => {
  const f = fixture(t);
  f.populate();
  const result = f.run(true);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(f.target), ['index.json']);
  const manifest = JSON.parse(readFileSync(join(f.target, 'index.json'), 'utf8'));
  assert.deepEqual(manifest.items, [item]);
  assert.deepEqual(Object.keys(manifest.imageSha256).sort(), ['test_anim/o0.png', 'test_anim/o2.png', 'test_anim/r0.png', 'test_anim/r2.png']);
  for (const [path, bytes] of [
    ['test_anim/o0.png', Buffer.from([0, 255, 0, 111])], ['test_anim/o2.png', Buffer.from([0, 255, 2, 111])],
    ['test_anim/r0.png', Buffer.from([0, 255, 0, 114])], ['test_anim/r2.png', Buffer.from([0, 255, 2, 114])],
  ]) assert.equal(manifest.imageSha256[path], createHash('sha256').update(bytes).digest('hex'));
});

test('standalone animation page supports a local restyle folder and its script parses', () => {
  const htmlPath = fileURLToPath(new URL('../public/restyle/animations.html', import.meta.url));
  const html = readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(html.includes('webkitdirectory'), 'folder picker supports browsers without showDirectoryPicker');
  assert.ok(html.includes("readLocal('anim/index.json')"), 'the manifest can be read from the selected folder');
  assert.ok(html.includes('Filer uploades ikke.'), 'the page explains files stay local');
  assert.ok(html.includes('crypto.subtle.digest(\'SHA-256\''), 'local frames are checked against packaged hashes');
  assert.ok(html.includes('timers = timers.filter'), 'stopped playback timers are removed from the cleanup roster');
  assert.ok(scripts.length);
  assert.doesNotThrow(() => new Function(scripts.at(-1)[1]));
});

for (const [name, manifest] of [
  ['malformed JSON', '{'],
  ['missing arrays', '{}'],
  ['unsafe id', JSON.stringify({ items: [{ ...item, id: '../escape' }], problems: [] })],
  ['duplicate id', JSON.stringify({ items: [item, item], problems: [] })],
  ['invalid frame count', JSON.stringify({ items: [{ ...item, frames: 0 }], problems: [] })],
  ['out of range staged frame', JSON.stringify({ items: [{ ...item, staged: [0, 3] }], problems: [] })],
  ['duplicate staged frame', JSON.stringify({ items: [{ ...item, staged: [0, 0] }], problems: [] })],
  ['missing texts', JSON.stringify({ items: [{ ...item, texts: null }], problems: [] })],
]) {
  test(`rejects ${name}`, (t) => {
    const f = fixture(t);
    f.put('index.json', manifest);
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /bundle-restyle-animations/);
  });
}

test('existing source without index fails instead of emitting empty data', (t) => {
  const f = fixture(t);
  mkdirSync(f.source);
  assert.notEqual(f.run().status, 0);
});

test('missing later frame fails before replacing previous output', (t) => {
  const f = fixture(t);
  f.populate();
  rmSync(join(f.source, item.id, 'r2.png'));
  mkdirSync(f.target, { recursive: true });
  writeFileSync(join(f.target, 'index.json'), 'previous output');
  const result = f.run(true);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /r2\.png/);
  assert.equal(readFileSync(join(f.target, 'index.json'), 'utf8'), 'previous output');
});

test('rejects a directory in place of a referenced image', (t) => {
  const f = fixture(t);
  f.populate();
  const image = join(f.source, item.id, 'r2.png');
  rmSync(image);
  mkdirSync(image);
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected regular file/);
});
