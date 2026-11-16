import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { memoryGameFolderBackend } from '../src/ui/localGameFolderStore.mjs';
import { addLocalGameFolderPicker, chooseLocalGameFolder, chooseSessionGameFolder, clearLocalGameFolder,
  localGameFolderCount, localGameFolderState, reconnectLocalGameFolder, readLocalGameArchive, restoreLocalGameFolder,
  setLocalGameArchives, setLocalGameFolder } from '../src/ui/localGameArchives.ts';

// Each test uses its own game id: the controller state is module-level, as it is in the page.
const bytes = (text) => new TextEncoder().encode(text);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

/** A directory handle with the Chromium permission methods. `gate` delays enumeration until released. */
function fakeFolder({ files = [], query = 'granted', request = 'granted', gate, error, withPermission = true } = {}) {
  const perm = { query, request, requests: 0, queries: 0 };
  const handle = {
    kind: 'directory',
    name: 'extracted',
    values: async function* values() {
      if (gate) await gate.promise;
      if (error) throw Object.assign(new Error(error), { name: 'NotAllowedError' });
      for (const [name, value] of files) yield { kind: 'file', name, getFile: async () => new File([value], name) };
    },
  };
  if (withPermission) {
    handle.queryPermission = async () => { perm.queries++; return perm.query; };
    handle.requestPermission = async () => { perm.requests++; return perm.request; };
  }
  return { handle, perm };
}

test('a remembered folder with granted permission is restored and answers its game', async (t) => {
  const game = 'restore-granted';
  t.after(() => { setLocalGameFolder(game, []); });
  const value = bytes('restored TITLE fixture');
  const backend = memoryGameFolderBackend();
  await backend.save(game, fakeFolder({ files: [['TITLE.DAX', value]] }).handle);
  await restoreLocalGameFolder(game, backend);
  assert.deepEqual(localGameFolderState(game), { status: 'loaded', count: 1, remembered: true, message: undefined });
  assert.deepEqual(new Uint8Array(await readLocalGameArchive('TITLE.DAX', sha(value), game)), value);
});

test('a prompt permission waits for a click, and reconnect then loads the folder', async (t) => {
  const game = 'restore-prompt';
  t.after(() => { clearLocalGameFolder(game, null); });
  const value = bytes('prompt TITLE fixture');
  const folder = fakeFolder({ files: [['TITLE.DAX', value]], query: 'prompt', request: 'granted' });
  const backend = memoryGameFolderBackend();
  await backend.save(game, folder.handle);
  await restoreLocalGameFolder(game, backend);
  assert.equal(localGameFolderState(game).status, 'reconnect');
  assert.equal(localGameFolderCount(game), 0, 'nothing is read before permission is granted');
  assert.equal(folder.perm.requests, 0, 'restore alone never prompts');
  assert.equal(await reconnectLocalGameFolder(game), true);
  assert.equal(folder.perm.requests, 1);
  assert.equal(localGameFolderState(game).status, 'loaded');
  assert.equal(localGameFolderCount(game), 1);
});

test('a denied reconnect keeps the remembered folder, and a later grant recovers it', async (t) => {
  const game = 'restore-denied';
  t.after(() => { clearLocalGameFolder(game, null); });
  const folder = fakeFolder({ files: [['PIC.DAA', bytes('daa')]], query: 'denied', request: 'denied' });
  const backend = memoryGameFolderBackend();
  await backend.save(game, folder.handle);
  await restoreLocalGameFolder(game, backend);
  assert.equal(localGameFolderState(game).status, 'denied');
  assert.equal(await reconnectLocalGameFolder(game), false);
  assert.equal(localGameFolderState(game).status, 'denied');
  assert.match(localGameFolderState(game).message, /not granted/);
  assert.equal(backend.size(), 1, 'a denial does not forget the folder');
  folder.perm.request = 'granted';
  assert.equal(await reconnectLocalGameFolder(game), true);
  assert.equal(localGameFolderState(game).status, 'loaded');
});

test('a browser that cannot re-check permission forgets the handle instead of trusting it', async (t) => {
  const game = 'restore-unavailable';
  t.after(() => { clearLocalGameFolder(game, null); });
  const folder = fakeFolder({ files: [['PIC.DAX', bytes('x')]], withPermission: false });
  const backend = memoryGameFolderBackend();
  await backend.save(game, folder.handle);
  await restoreLocalGameFolder(game, backend);
  assert.equal(backend.size(), 0);
  assert.equal(localGameFolderState(game).status, 'none');
  assert.match(localGameFolderState(game).message, /cannot re-check/);
});

test('restoration runs once per page load, and no backend means nothing is remembered', async (t) => {
  const game = 'restore-once';
  t.after(() => { clearLocalGameFolder(game, null); });
  const backend = memoryGameFolderBackend();
  let loads = 0;
  const load = backend.load;
  backend.load = (key) => { loads++; return load(key); };
  await restoreLocalGameFolder(game, backend);
  await restoreLocalGameFolder(game, backend);
  assert.equal(loads, 1);
  // Without IndexedDB the session still works, but the choice is not remembered.
  const session = fakeFolder({ files: [['PIC.DAX', bytes('session')]] });
  assert.equal(await chooseLocalGameFolder(game, session.handle, null), true);
  assert.equal(localGameFolderState(game).remembered, false);
  assert.match(localGameFolderState(game).message, /cannot remember a folder/);
});

test('a choose is saved only after its read succeeds, and a failed read leaves nothing remembered', async (t) => {
  const game = 'choose-failure';
  t.after(() => { clearLocalGameFolder(game, null); });
  const backend = memoryGameFolderBackend();
  const bad = fakeFolder({ error: 'folder access revoked' });
  assert.equal(await chooseLocalGameFolder(game, bad.handle, backend), false);
  assert.equal(localGameFolderState(game).status, 'denied');
  assert.equal(backend.size(), 0);
});

test('a save failure reports a session-only folder and removes any stale stored handle', async (t) => {
  const game = 'save-failure';
  t.after(() => { clearLocalGameFolder(game, null); });
  const value = bytes('save failure fixture');
  const backend = memoryGameFolderBackend();
  backend.save = async () => { throw new Error('quota'); };
  const folder = fakeFolder({ files: [['TITLE.DAX', value]] });
  assert.equal(await chooseLocalGameFolder(game, folder.handle, backend), true);
  const state = localGameFolderState(game);
  assert.equal(state.status, 'loaded');
  assert.equal(state.remembered, false);
  assert.match(state.message, /did not remember it/);
  assert.equal(backend.size(), 0);
});

test('a pending restore never overrides a newer choice', async (t) => {
  const game = 'restore-superseded';
  t.after(() => { clearLocalGameFolder(game, null); });
  const older = fakeFolder({ files: [['TITLE.DAX', bytes('older')]] });
  const newer = fakeFolder({ files: [['TITLE.DAX', bytes('newer')]] });
  const backend = memoryGameFolderBackend();
  const loading = deferred();
  backend.load = () => loading.promise;
  const restoring = restoreLocalGameFolder(game, backend);
  assert.equal(await chooseLocalGameFolder(game, newer.handle, backend), true);
  loading.resolve(older.handle);
  await restoring;
  assert.deepEqual(new Uint8Array(await readLocalGameArchive('TITLE.DAX', sha(bytes('newer')), game)), bytes('newer'));
  assert.equal(await readLocalGameArchive('TITLE.DAX', sha(bytes('older')), game), null);
});

test('clearing while a choose is still reading discards that read and remembers nothing', async (t) => {
  const game = 'clear-pending';
  t.after(() => { clearLocalGameFolder(game, null); });
  const gate = deferred();
  const backend = memoryGameFolderBackend();
  const folder = fakeFolder({ files: [['TITLE.DAX', bytes('pending')]], gate });
  const choosing = chooseLocalGameFolder(game, folder.handle, backend);
  await clearLocalGameFolder(game, backend);
  gate.resolve();
  assert.equal(await choosing, false);
  assert.equal(localGameFolderCount(game), 0);
  assert.equal(localGameFolderState(game).status, 'none');
  assert.equal(backend.size(), 0);
});

test('the last of two overlapping choices wins, even when the earlier read finishes last', async (t) => {
  const game = 'replace-pending';
  t.after(() => { clearLocalGameFolder(game, null); });
  const gate = deferred();
  const first = fakeFolder({ files: [['TITLE.DAX', bytes('first')]], gate });
  const second = fakeFolder({ files: [['TITLE.DAX', bytes('second')]] });
  const backend = memoryGameFolderBackend();
  const firstChoice = chooseLocalGameFolder(game, first.handle, backend);
  assert.equal(await chooseLocalGameFolder(game, second.handle, backend), true);
  gate.resolve();
  assert.equal(await firstChoice, false);
  assert.deepEqual(new Uint8Array(await readLocalGameArchive('TITLE.DAX', sha(bytes('second')), game)), bytes('second'));
  assert.equal(await readLocalGameArchive('TITLE.DAX', sha(bytes('first')), game), null);
  assert.equal(backend.size(), 1);
});

test('a game-folder lookup does not answer from the new global folder after a mid-read selection change', async (t) => {
  const game = 'mid-read';
  t.after(() => { clearLocalGameFolder(game, null); setLocalGameArchives([]); });
  const value = bytes('mid-read TITLE');
  const gate = deferred();
  // Hold the game file's bytes until the selection has changed.
  const gameFile = new File([value], 'TITLE.DAX');
  Object.defineProperty(gameFile, 'arrayBuffer', { value: () => gate.promise.then(() => value.slice().buffer) });
  setLocalGameFolder(game, [gameFile]);
  const pending = readLocalGameArchive('TITLE.DAX', sha(value), game);
  setLocalGameArchives([new File([value], 'TITLE.DAX')]);
  gate.resolve();
  assert.equal(await pending, null);
});

// Minimal element used by the DOM render check; the picker only needs these members.
class FakeElement extends EventTarget {
  constructor(tag) {
    super();
    this.tagName = tag; this.style = {}; this.children = []; this.attributes = {};
    this.textContent = ''; this.hidden = false; this.disabled = false; this.isConnected = true;
    this.value = ''; this.files = null; this.type = ''; this.className = ''; this.multiple = false;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  append(...children) { this.children.push(...children); }
}

test('the game picker is labelled, offers replace and clear, and re-renders after a session choice', async (t) => {
  const game = 'picker-dom';
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => new FakeElement(tag) };
  t.after(() => {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    clearLocalGameFolder(game, null);
  });
  let changes = 0;
  const wrap = addLocalGameFolderPicker(new FakeElement('div'), game, 'Champions of Krynn archives', () => { changes++; });
  const [choose, reconnect, clear, status] = wrap.children;
  assert.equal(choose.textContent, 'Choose Champions of Krynn archives folder');
  assert.equal(reconnect.hidden, true);
  assert.equal(clear.hidden, true);
  assert.match(status.textContent, /no folder chosen/);
  const input = wrap.children[4];
  input.files = [new File(['x'], 'TITLE.DAX'), new File(['y'], 'notes.txt')];
  input.dispatchEvent(new Event('change'));
  assert.equal(changes, 1);
  assert.equal(choose.textContent, 'Replace Champions of Krynn archives folder');
  assert.equal(clear.hidden, false);
  assert.match(status.textContent, /1 archive files for this session only/);
  clear.dispatchEvent(new Event('click'));
  assert.equal(changes, 2);
  assert.equal(localGameFolderCount(game), 0);
  assert.equal(clear.hidden, true);
  assert.match(status.textContent, /no folder chosen/);
});
