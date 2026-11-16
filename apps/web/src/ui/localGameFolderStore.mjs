/**
 * Browser memory for one extracted-game folder per game (goal 207 / CoK full implementation).
 *
 * Only a `FileSystemDirectoryHandle` is stored, in this browser's IndexedDB, keyed by the game id.
 * No file bytes, paths or uploads leave the page. A remembered handle is never trusted blindly:
 * `queryFolderPermission` must report `granted` before its files are read again, and a `prompt` or
 * `denied` result is surfaced to the user as a reconnect action (permission requests need a click).
 *
 * Everything degrades quietly. Without IndexedDB (or without the directory-handle API) the backend
 * is `null` and the caller keeps the folder for the current session only.
 * Types live in localGameFolderStore.d.mts.
 */

const DB_NAME = 'greybox.localGameFolders';
const STORE_NAME = 'folders';
const DB_VERSION = 1;

function hasIndexedDb() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function runStore(mode, run) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE_NAME)) open.result.createObjectStore(STORE_NAME);
    };
    open.onerror = () => reject(open.error ?? new Error('IndexedDB open failed'));
    open.onblocked = () => reject(new Error('IndexedDB open blocked'));
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE_NAME, mode);
      const request = run(tx.objectStore(STORE_NAME));
      let result;
      request.onsuccess = () => { result = request.result; };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error ?? new Error('IndexedDB transaction failed')); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('IndexedDB transaction aborted')); };
    };
  });
}

/** The IndexedDB backend, or `null` when this browser has no IndexedDB. */
export function indexedDbGameFolderBackend() {
  if (!hasIndexedDb()) return null;
  return {
    async load(game) {
      const handle = await runStore('readonly', (store) => store.get(game));
      return handle ?? undefined;
    },
    async save(game, handle) {
      await runStore('readwrite', (store) => store.put(handle, game));
    },
    async remove(game) {
      await runStore('readwrite', (store) => store.delete(game));
    },
  };
}

/** An in-memory backend with the same contract, for tests and for browsers that lack IndexedDB. */
export function memoryGameFolderBackend() {
  const handles = new Map();
  return {
    size: () => handles.size,
    async load(game) { return handles.get(game); },
    async save(game, handle) { handles.set(game, handle); },
    async remove(game) { handles.delete(game); },
  };
}

/** True when the browser can pick a directory handle that could be remembered. */
export function folderMemorySupported() {
  const scope = typeof window === 'undefined' ? undefined : window;
  return typeof scope?.showDirectoryPicker === 'function' && indexedDbGameFolderBackend() !== null;
}

function toPermission(state) {
  return state === 'granted' || state === 'prompt' || state === 'denied' ? state : 'denied';
}

/** Re-check read permission for a remembered handle without prompting the user. */
export async function queryFolderPermission(handle) {
  if (typeof handle.queryPermission !== 'function') return 'unavailable';
  return toPermission(await handle.queryPermission({ mode: 'read' }));
}

/** Ask for read permission. Must run from a user gesture (for example a click) to show a prompt. */
export async function requestFolderPermission(handle) {
  if (typeof handle.requestPermission !== 'function') return 'unavailable';
  return toPermission(await handle.requestPermission({ mode: 'read' }));
}
