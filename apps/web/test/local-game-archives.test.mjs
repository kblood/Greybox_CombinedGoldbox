import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createGraphicsArchiveCache } from '../src/ui/graphics-archive-cache.mjs';
import { addLocalGameArchivePicker, localGameArchiveCount, localGameArchiveRevision, localGameFolderCount, setLocalGameFolder,
  readLocalGameArchive, selectLocalGameArchives, setLocalGameArchives } from '../src/ui/localGameArchives.ts';

const bytes = (text) => new TextEncoder().encode(text);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function countedFile(name, value, read = async () => value.slice().buffer) {
  const file = new File([value], name);
  let reads = 0;
  Object.defineProperty(file, 'arrayBuffer', { value: () => { reads++; return read(); } });
  return { file, reads: () => reads };
}
function reset(t) { setLocalGameArchives([]); t.after(() => setLocalGameArchives([])); }

// These tests are serial: the application intentionally has one selected archive folder.
test('cached archive miss is retried after selecting matching files', async (t) => {
  reset(t);
  const value = bytes('matching LBM fixture'), file = countedFile('IMAGE.LBM', value);
  const cache = createGraphicsArchiveCache(localGameArchiveRevision);
  const load = () => readLocalGameArchive('image.lbm', sha(value));
  assert.equal(await cache.get('image', load), null);
  assert.equal(await cache.get('image', load), null);
  setLocalGameArchives([file.file]);
  assert.deepEqual(await cache.get('image', load), value);
  assert.equal(file.reads(), 1);
});

test('cached hit becomes a miss after clearing archives', async (t) => {
  reset(t);
  const value = bytes('selected archive'), file = countedFile('PIC.DAA', value);
  const cache = createGraphicsArchiveCache(localGameArchiveRevision);
  const load = () => readLocalGameArchive('PIC.DAA', sha(value));
  setLocalGameArchives([file.file]);
  assert.deepEqual(await cache.get('picture', load), value);
  setLocalGameArchives([]);
  assert.equal(cache.size, 0);
  assert.equal(await cache.get('picture', load), null);
  assert.equal(file.reads(), 1, 'cleared source must not be read again');
});

for (const action of ['replace', 'clear', 'reselect']) {
  test(`pending archive read is discarded after ${action}`, async (t) => {
    reset(t);
    const first = bytes('first selection'), second = bytes('second selection');
    const waiting = deferred();
    const old = countedFile('PIC.DAX', first, () => waiting.promise);
    const replacement = countedFile('PIC.DAX', second);
    setLocalGameArchives([old.file]);
    const revision = localGameArchiveRevision();
    const pending = readLocalGameArchive('PIC.DAX', sha(first));
    assert.equal(old.reads(), 1);
    setLocalGameArchives(action === 'replace' ? [replacement.file] : action === 'reselect' ? [old.file] : []);
    assert.ok(localGameArchiveRevision() > revision);
    waiting.resolve(first.slice().buffer);
    assert.equal(await pending, null);
    assert.deepEqual(await readLocalGameArchive('PIC.DAX', sha(action === 'replace' ? second : first)),
      action === 'clear' ? null : action === 'replace' ? second : first);
    if (action === 'reselect') assert.equal(old.reads(), 2, 'same-folder selection performs a fresh read');
  });
}

test('same File reselection retries a cached failed read and decoded miss', async (t) => {
  reset(t);
  const value = bytes('retry succeeds');
  let fail = true;
  const source = countedFile('PIC.DAA', value, async () => {
    if (fail) throw new Error('synthetic temporary read failure');
    return value.slice().buffer;
  });
  const cache = createGraphicsArchiveCache(localGameArchiveRevision);
  const load = () => readLocalGameArchive('PIC.DAA', sha(value));
  setLocalGameArchives([source.file]);
  assert.equal(await cache.get('picture', load), null);
  fail = false;
  assert.equal(await cache.get('picture', load), null);
  assert.equal(source.reads(), 1, 'a miss is cached until explicit retry');
  setLocalGameArchives([source.file]);
  assert.deepEqual(await cache.get('picture', load), value);
  assert.equal(source.reads(), 2);
});

test('duplicate basenames resolve by exact hash and never use a different basename', async (t) => {
  reset(t);
  const first = bytes('wrong edition'), wanted = bytes('correct edition');
  const wrong = countedFile('PIC1.DAX', first), right = countedFile('pic1.dax', wanted);
  const other = countedFile('OTHER.DAX', wanted);
  setLocalGameArchives([wrong.file, other.file]);
  assert.equal(await readLocalGameArchive('PIC1.DAX', sha(wanted)), null);
  assert.equal(other.reads(), 0);
  setLocalGameArchives([wrong.file, right.file, other.file]);
  assert.deepEqual(await readLocalGameArchive('PiC1.DaX', sha(wanted).toUpperCase()), wanted);
  assert.equal(right.reads(), 1);
  assert.equal(other.reads(), 0);
  assert.equal(await readLocalGameArchive('PIC1.DAX', 'not-a-hash'), null);
});

test('empty and unsupported selections replace the folder and always refresh once', (t) => {
  reset(t);
  const notifications = [];
  const refresh = (count) => notifications.push({ count, observed: localGameArchiveCount(), revision: localGameArchiveRevision() });
  selectLocalGameArchives([new File(['source'], 'PIC.DAX')], refresh);
  selectLocalGameArchives([new File(['unsupported'], 'notes.txt')], refresh);
  selectLocalGameArchives([], refresh);
  assert.deepEqual(notifications.map(({ count, observed }) => [count, observed]), [[1, 1], [0, 0], [0, 0]]);
  assert.ok(notifications[0].revision < notifications[1].revision);
  assert.ok(notifications[1].revision < notifications[2].revision);
});

test('archive picker refreshes its label and missing-source state for unsupported selection and clear', (t) => {
  reset(t);
  const previousDocument = globalThis.document;
  // A minimal event target exercises the real picker handlers without a browser or a DOM library.
  class Element extends EventTarget {
    style = {}; children = []; textContent = ''; hidden = false; value = ''; files = null;
    setAttribute() {}
    append(...children) { this.children.push(...children); }
  }
  globalThis.document = { createElement: () => new Element() };
  t.after(() => { if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument; });
  setLocalGameArchives([new File(['source'], 'PIC.DAX')]);
  let refreshes = 0;
  const wrap = addLocalGameArchivePicker(new Element(), () => { refreshes++; });
  const [button, clear, note, input] = wrap.children;
  assert.equal(button.textContent, 'Local game archives: 1 files');
  assert.equal(clear.hidden, false);
  input.files = [new File(['unsupported'], 'notes.txt')];
  input.dispatchEvent(new Event('change'));
  assert.equal(localGameArchiveCount(), 0);
  assert.equal(refreshes, 1);
  assert.equal(button.textContent, 'Choose local game archive folder');
  assert.equal(clear.hidden, true);
  assert.match(note.textContent, /No supported DAX\/DAA\/LBM archives selected/);
  input.files = [new File(['new source'], 'MAP.LBM')];
  input.dispatchEvent(new Event('change'));
  assert.equal(localGameArchiveCount(), 1);
  assert.equal(clear.hidden, false);
  clear.dispatchEvent(new Event('click'));
  assert.equal(refreshes, 3);
  assert.equal(localGameArchiveCount(), 0);
  assert.equal(clear.hidden, true);
  assert.match(note.textContent, /No supported/);
});

for (const action of ['replace', 'clear']) {
  test(`pending decoded cache result cannot escape archive ${action}`, async () => {
    let revision = 1;
    const cache = createGraphicsArchiveCache(() => revision);
    const waiting = deferred();
    const old = cache.get('same-archive', () => waiting.promise);
    await Promise.resolve();
    revision++;
    if (action === 'replace') assert.equal(await cache.get('same-archive', () => 'new pixels'), 'new pixels');
    waiting.resolve('old pixels');
    assert.equal(await old, null, 'even an outstanding decode after file verification must be invalidated');
    if (action === 'clear') assert.equal(cache.size, 0);
  });
}

test('cache coalesces promises, retains hits and misses, and evicts the oldest entry above six', async () => {
  const cache = createGraphicsArchiveCache(() => 0);
  const waiting = deferred();
  let calls = 0;
  const first = cache.get('0', () => { calls++; return waiting.promise; });
  assert.equal(cache.get('0', () => { throw new Error('duplicate loader called'); }), first);
  await Promise.resolve();
  assert.equal(calls, 1);
  waiting.resolve(null);
  assert.equal(await first, null);
  assert.equal(cache.get('0', () => 'incorrect retry'), first);
  for (let key = 1; key <= 6; key++) assert.equal(await cache.get(String(key), () => key), key);
  assert.equal(cache.size, 6);
  assert.equal(await cache.get('0', () => 'fresh after eviction'), 'fresh after eviction');
  assert.equal(cache.size, 6);
  assert.equal(await cache.get('6', () => 'incorrect replacement'), 6);
});

test('explicit cache clear invalidates pending work even without a selection revision change', async () => {
  const cache = createGraphicsArchiveCache(() => 0), waiting = deferred();
  const old = cache.get('archive', () => waiting.promise);
  await Promise.resolve();
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(await cache.get('archive', () => 'fresh'), 'fresh');
  waiting.resolve('stale');
  assert.equal(await old, null);
});

test('a revision change before loading skips the obsolete loader, and stale failures are discarded', async () => {
  let revision = 0;
  const cache = createGraphicsArchiveCache(() => revision);
  const obsolete = cache.get('archive', () => { throw new Error('obsolete loader must not start'); });
  revision++;
  assert.equal(await obsolete, null);
  const waiting = deferred();
  const stale = cache.get('archive', () => waiting.promise);
  await Promise.resolve();
  revision++;
  waiting.reject(new Error('obsolete decode failure'));
  assert.equal(await stale, null);
  await assert.rejects(cache.get('archive', () => { throw new Error('current decode failure'); }), /current decode failure/);
});

test('a game folder is tried before the global folder and falls back on a hash mismatch', async (t) => {
  setLocalGameFolder('nwn', []); setLocalGameArchives([]);
  t.after(() => { setLocalGameFolder('nwn', []); setLocalGameArchives([]); });
  const gameValue = bytes('nwn TITLE fixture'), globalValue = bytes('global TITLE fixture');
  const gameFile = new File([gameValue], 'TITLE.DAX');
  const globalFile = new File([globalValue], 'TITLE.DAX');
  assert.equal(setLocalGameFolder('nwn', [gameFile]), 1);
  setLocalGameArchives([globalFile]);
  assert.equal(localGameFolderCount('nwn'), 1);
  assert.deepEqual(new Uint8Array(await readLocalGameArchive('TITLE.DAX', sha(gameValue), 'nwn')), gameValue);
  // The game folder has no match for this hash, so the global folder answers.
  assert.deepEqual(new Uint8Array(await readLocalGameArchive('TITLE.DAX', sha(globalValue), 'nwn')), globalValue);
  // Without a game, only the global folder is searched.
  assert.equal(await readLocalGameArchive('TITLE.DAX', sha(gameValue)), null);
  assert.equal(setLocalGameFolder('nwn', []), 0);
  assert.equal(localGameFolderCount('nwn'), 0);
  assert.equal(await readLocalGameArchive('TITLE.DAX', sha(gameValue), 'nwn'), null);
});
