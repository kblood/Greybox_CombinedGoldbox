import { findHashMatchedCandidate, matchesLocalAssetSha256 } from './localAssetPackCore.mjs';
import { folderMemorySupported, indexedDbGameFolderBackend, queryFolderPermission, requestFolderPermission,
  type FolderPermission, type GameFolderBackend } from './localGameFolderStore.mjs';

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};
type EnumerableDirectoryHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterableIterator<FileSystemHandle>;
};
type FileHandleWithFile = FileSystemHandle & { kind: 'file'; getFile(): Promise<File> };
type DirectoryInput = HTMLInputElement & { webkitdirectory?: boolean };

let archivesByName = new Map<string, File[]>();
// Per-game folders (for example 'cok'). A game folder is searched first for an
// exact SHA-256 match; the global folder is the fallback. Both use the same hash verification.
const archivesByGame = new Map<string, Map<string, File[]>>();
let archiveFileCount = 0;
let archiveSelectionRevision = 0;
let verifiedBytes = new WeakMap<File, Map<string, Promise<Uint8Array | null>>>();

const isSupportedArchive = (name: string): boolean => /\.(dax|daa|lbm)$/i.test(name);

export function setLocalGameArchives(files: readonly File[]): number {
  const next = new Map<string, File[]>();
  for (const file of files) {
    if (!isSupportedArchive(file.name)) continue;
    const key = file.name.toLowerCase();
    const matches = next.get(key) ?? [];
    matches.push(file);
    next.set(key, matches);
  }
  archivesByName = next;
  archiveFileCount = [...next.values()].reduce((count, matches) => count + matches.length, 0);
  archiveSelectionRevision++;
  // Reselecting the same File objects is an explicit retry, including failed reads.
  verifiedBytes = new WeakMap();
  return archiveFileCount;
}

function indexArchives(files: readonly File[]): Map<string, File[]> {
  const index = new Map<string, File[]>();
  for (const file of files) {
    if (!isSupportedArchive(file.name)) continue;
    const key = file.name.toLowerCase();
    const matches = index.get(key) ?? [];
    matches.push(file);
    index.set(key, matches);
  }
  return index;
}

/** Set (or clear, with an empty list) the folder for one game. Other games and the global folder are unchanged. */
export function setLocalGameFolder(game: string, files: readonly File[]): number {
  const index = indexArchives(files);
  if (index.size) archivesByGame.set(game, index); else archivesByGame.delete(game);
  archiveSelectionRevision++;
  verifiedBytes = new WeakMap();
  return [...index.values()].reduce((count, matches) => count + matches.length, 0);
}

export function localGameFolderCount(game: string): number {
  const index = archivesByGame.get(game);
  return index ? [...index.values()].reduce((count, matches) => count + matches.length, 0) : 0;
}

export function localGameArchiveCount(): number { return archiveFileCount; }
export function localGameArchiveRevision(): number { return archiveSelectionRevision; }

/** Selection replaces the previous folder, including empty/unsupported folders. Always refresh. */
export function selectLocalGameArchives(files: readonly File[], refresh: (count: number) => void): number {
  const count = setLocalGameArchives(files);
  refresh(count);
  return count;
}

async function findHashMatchedFile(candidates: readonly File[], expectedSha256: string): Promise<Uint8Array | null> {
  const revision = archiveSelectionRevision;
  const cache = verifiedBytes;
  const bytes = await findHashMatchedCandidate(candidates, expectedSha256, async (file, expected) => {
    if (revision !== archiveSelectionRevision) return null;
    let byHash = cache.get(file);
    if (!byHash) { byHash = new Map(); cache.set(file, byHash); }
    let verified = byHash.get(expected);
    if (!verified) {
      verified = file.arrayBuffer().then(async (buffer) => {
        const bytes = new Uint8Array(buffer);
        return await matchesLocalAssetSha256(bytes, expected) ? bytes : null;
      }).catch(() => null);
      byHash.set(expected, verified);
    }
    const result = await verified;
    return revision === archiveSelectionRevision ? result : null;
  });
  return revision === archiveSelectionRevision ? bytes : null;
}

/**
 * Read an archive by basename and exact SHA-256. A game folder, when given, is tried before the
 * global folder. If the selection changes while the game folder is being read, the result is
 * discarded rather than answered from the new global folder.
 */
export async function readLocalGameArchive(name: string, expectedSha256: string, game?: string): Promise<Uint8Array | null> {
  const key = name.toLowerCase();
  const revision = archiveSelectionRevision;
  const gameFiles = game ? archivesByGame.get(game)?.get(key) : undefined;
  if (gameFiles?.length) {
    const fromGame = await findHashMatchedFile(gameFiles, expectedSha256);
    if (fromGame) return fromGame;
    if (revision !== archiveSelectionRevision) return null;
  }
  return findHashMatchedFile(archivesByName.get(key) ?? [], expectedSha256);
}

async function collectArchives(root: FileSystemDirectoryHandle, files: File[]): Promise<void> {
  for await (const handle of (root as EnumerableDirectoryHandle).values()) {
    if (handle.kind === 'file') {
      const fileHandle = handle as FileHandleWithFile;
      if (isSupportedArchive(fileHandle.name)) files.push(await fileHandle.getFile());
    } else if (handle.kind === 'directory') {
      await collectArchives(handle as FileSystemDirectoryHandle, files);
    }
    if (files.length > 20000) throw new Error('The selected folder contains over 20,000 supported archive files. Select a narrower extracted game folder.');
  }
}

/* ---------------------------------------------------------------------------------------------
 * Per-game folder controller (goal 207). Each game has one folder. Every operation takes a token;
 * a choose, reconnect, clear or restore that has been superseded discards its own result, so an
 * older read can never replace a newer selection. Restoration runs once per page load per game.
 * ------------------------------------------------------------------------------------------- */

export type LocalGameFolderStatus = 'none' | 'restoring' | 'reading' | 'loaded' | 'reconnect' | 'denied';
export type LocalGameFolderState = Readonly<{ status: LocalGameFolderStatus; count: number; remembered: boolean; message?: string }>;

type GameFolderRecord = {
  status: LocalGameFolderStatus;
  token: number;
  restored: boolean;
  remembered: boolean;
  handle?: FileSystemDirectoryHandle;
  message?: string;
};

const gameFolders = new Map<string, GameFolderRecord>();
const gameFolderListeners = new Map<string, Set<() => void>>();
const gameArchiveChangeHandlers = new Map<string, () => void>();

const FOLDER_UNSUPPORTED_NOTE = 'This browser cannot remember a folder; choose it again after reloading.';

function recordFor(game: string): GameFolderRecord {
  let record = gameFolders.get(game);
  if (!record) {
    record = { status: 'none', token: 0, restored: false, remembered: false };
    gameFolders.set(game, record);
  }
  return record;
}

function nextToken(game: string): number {
  return ++recordFor(game).token;
}

function isCurrent(game: string, token: number): boolean {
  return recordFor(game).token === token;
}

function supportedArchiveCount(files: readonly File[]): number {
  return files.reduce((count, file) => count + (isSupportedArchive(file.name) ? 1 : 0), 0);
}

/** Tell listeners the state changed. `archivesChanged` also re-renders the page that reads the archives. */
function publish(game: string, archivesChanged: boolean): void {
  for (const listener of [...(gameFolderListeners.get(game) ?? [])]) listener();
  if (archivesChanged) gameArchiveChangeHandlers.get(game)?.();
}

export function localGameFolderState(game: string): LocalGameFolderState {
  const record = recordFor(game);
  return { status: record.status, count: localGameFolderCount(game), remembered: record.remembered, message: record.message };
}

/** Subscribe to state changes for one game. Returns the unsubscribe function. */
export function subscribeLocalGameFolder(game: string, listener: () => void): () => void {
  let listeners = gameFolderListeners.get(game);
  if (!listeners) { listeners = new Set(); gameFolderListeners.set(game, listeners); }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function failGameFolder(game: string, error: unknown): void {
  const record = recordFor(game);
  setLocalGameFolder(game, []);
  const denied = error instanceof Error && /NotAllowed|Security/.test(error.name);
  record.status = denied ? 'denied' : 'none';
  record.message = error instanceof Error ? error.message : 'The folder could not be read.';
  publish(game, true);
}

function applyGameFolder(game: string, handle: FileSystemDirectoryHandle | undefined, files: readonly File[], remembered: boolean, message?: string): void {
  const record = recordFor(game);
  setLocalGameFolder(game, files);
  record.handle = handle;
  record.remembered = remembered;
  record.status = supportedArchiveCount(files) ? 'loaded' : 'none';
  record.message = supportedArchiveCount(files) ? message : 'No supported DAX/DAA/LBM archives were found in that folder.';
  publish(game, true);
}

/**
 * Restore the remembered folder for a game, at most once per page load. Access is only used when
 * permission is `granted`. A `prompt` or `denied` result becomes a reconnect or denied state.
 */
export async function restoreLocalGameFolder(game: string, backend: GameFolderBackend | null = indexedDbGameFolderBackend()): Promise<void> {
  const record = recordFor(game);
  if (record.restored) return;
  record.restored = true;
  if (!backend) return;
  const token = nextToken(game);
  record.status = 'restoring';
  publish(game, false);
  let handle: FileSystemDirectoryHandle | undefined;
  try { handle = await backend.load(game); } catch { handle = undefined; }
  if (!isCurrent(game, token)) return;
  if (!handle) { record.status = 'none'; publish(game, false); return; }
  record.handle = handle;
  record.remembered = true;
  const permission: FolderPermission = await queryFolderPermission(handle).catch(() => 'denied');
  if (!isCurrent(game, token)) return;
  if (permission === 'granted') {
    await readRememberedFolder(game, handle, token);
    return;
  }
  if (permission === 'prompt') { record.status = 'reconnect'; publish(game, false); return; }
  if (permission === 'denied') { record.status = 'denied'; publish(game, false); return; }
  // This browser cannot re-check the handle, so it is useless here. Forget it rather than guess.
  record.handle = undefined;
  record.remembered = false;
  record.status = 'none';
  record.message = 'This browser cannot re-check a remembered folder. Choose it again.';
  await backend.remove(game).catch(() => undefined);
  publish(game, false);
}

async function readRememberedFolder(game: string, handle: FileSystemDirectoryHandle, token: number): Promise<void> {
  recordFor(game).status = 'reading';
  publish(game, false);
  const files: File[] = [];
  try {
    await collectArchives(handle, files);
  } catch (error) {
    if (isCurrent(game, token)) failGameFolder(game, error);
    return;
  }
  if (!isCurrent(game, token)) return;
  applyGameFolder(game, handle, files, true);
}

/**
 * The user picked a folder. It is read first, then remembered. A newer choose, reconnect or clear
 * that starts meanwhile wins, and this result is discarded.
 */
export async function chooseLocalGameFolder(game: string, handle: FileSystemDirectoryHandle,
  backend: GameFolderBackend | null = indexedDbGameFolderBackend()): Promise<boolean> {
  const token = nextToken(game);
  recordFor(game).status = 'reading';
  publish(game, false);
  const files: File[] = [];
  try {
    await collectArchives(handle, files);
  } catch (error) {
    if (isCurrent(game, token)) failGameFolder(game, error);
    return false;
  }
  if (!isCurrent(game, token)) return false;
  let remembered = false;
  let message: string | undefined;
  if (backend) {
    try {
      await backend.save(game, handle);
      remembered = true;
    } catch {
      // Drop any earlier handle so a reload cannot restore a folder the user just replaced.
      await backend.remove(game).catch(() => undefined);
      message = 'The folder works for this session, but this browser did not remember it.';
    }
  } else {
    message = FOLDER_UNSUPPORTED_NOTE;
  }
  if (!isCurrent(game, token)) return false;
  applyGameFolder(game, handle, files, remembered, message);
  return true;
}

/** Session-only folder from the `webkitdirectory` fallback. It is never remembered. */
export function chooseSessionGameFolder(game: string, files: readonly File[]): number {
  nextToken(game);
  const record = recordFor(game);
  const count = setLocalGameFolder(game, files);
  record.handle = undefined;
  record.remembered = false;
  record.status = count ? 'loaded' : 'none';
  record.message = count ? (folderMemorySupported() ? undefined : FOLDER_UNSUPPORTED_NOTE)
    : 'No supported DAX/DAA/LBM archives were found in that folder.';
  publish(game, true);
  return count;
}

/** Ask for permission again for a remembered folder. Must be called from a click. */
export async function reconnectLocalGameFolder(game: string): Promise<boolean> {
  const record = recordFor(game);
  const handle = record.handle;
  if (!handle) return false;
  const token = nextToken(game);
  const permission = await requestFolderPermission(handle).catch(() => 'denied' as const);
  if (!isCurrent(game, token)) return false;
  if (permission !== 'granted') {
    record.status = 'denied';
    record.message = 'Permission was not granted. Reconnect, choose the folder again, or allow access in browser settings.';
    publish(game, false);
    return false;
  }
  record.status = 'reading';
  record.message = undefined;
  publish(game, false);
  const files: File[] = [];
  try {
    await collectArchives(handle, files);
  } catch (error) {
    if (isCurrent(game, token)) failGameFolder(game, error);
    return false;
  }
  if (!isCurrent(game, token)) return false;
  applyGameFolder(game, handle, files, record.remembered);
  return true;
}

/** Clear the game's folder and forget the remembered handle. Pending reads for it are discarded. */
export async function clearLocalGameFolder(game: string,
  backend: GameFolderBackend | null = indexedDbGameFolderBackend()): Promise<void> {
  nextToken(game);
  const record = recordFor(game);
  setLocalGameFolder(game, []);
  record.handle = undefined;
  record.remembered = false;
  record.status = 'none';
  record.message = undefined;
  publish(game, true);
  if (!backend) return;
  try {
    await backend.remove(game);
  } catch {
    record.message = 'The browser could not forget the remembered folder. Clear it again after reloading.';
    publish(game, false);
  }
}

/** Add a picker for extracted original game archives. The app retains only local File handles. */
export function addLocalGameArchivePicker(parent: HTMLElement, onChange: () => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'gbx-local-pack-picker';
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.flexWrap = 'wrap';
  wrap.style.gap = '8px';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = archiveFileCount ? `Local game archives: ${archiveFileCount} files` : 'Choose local game archive folder';
  button.setAttribute('aria-label', 'Choose a local extracted game archive folder');
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Clear archives';
  clear.hidden = archiveFileCount === 0;
  const note = document.createElement('small');
  note.textContent = 'Select extracted DAX/DAA/LBM archives; exact SHA-256 matching keeps editions separate. Files stay local.';
  note.style.color = 'var(--muted)';
  note.style.fontSize = '11px';
  const input = document.createElement('input') as DirectoryInput;
  input.type = 'file';
  input.multiple = true;
  input.webkitdirectory = true;
  input.setAttribute('webkitdirectory', '');
  input.hidden = true;
  const apply = (files: readonly File[]) => {
    selectLocalGameArchives(files, (count) => {
      button.textContent = count ? `Local game archives: ${count} files` : 'Choose local game archive folder';
      clear.hidden = count === 0;
      note.textContent = count
        ? 'Select extracted DAX/DAA/LBM archives; exact SHA-256 matching keeps editions separate. Files stay local.'
        : 'No supported DAX/DAA/LBM archives selected. Choose an extracted game folder. Files stay local.';
      onChange();
    });
  };
  input.addEventListener('change', () => {
    if (input.files) apply(Array.from(input.files));
    input.value = '';
  });
  button.addEventListener('click', () => {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (picker) {
      void picker.call(window).then(async (root) => {
        const files: File[] = [];
        await collectArchives(root, files);
        apply(files);
      }).catch((error) => {
        if (error instanceof Error && !/abort/i.test(error.name)) note.textContent = error.message;
      });
    } else input.click();
  });
  clear.addEventListener('click', () => {
    apply([]);
  });
  wrap.append(button, clear, note, input);
  parent.append(wrap);
  return wrap;
}

function directoryPickerApi(): ((this: unknown) => Promise<FileSystemDirectoryHandle>) | undefined {
  const picker = (globalThis as unknown as DirectoryPickerWindow).showDirectoryPicker;
  return typeof picker === 'function' ? picker : undefined;
}

const STATUS_TEXT: Record<LocalGameFolderStatus, (label: string, count: number, remembered: boolean) => string> = {
  none: (label) => `${label}: no folder chosen. Choose the extracted game folder; files stay on this device.`,
  restoring: (label) => `${label}: checking the remembered folder.`,
  reading: (label) => `${label}: reading the folder.`,
  loaded: (label, count, remembered) => `${label}: ${count} archive files ${remembered ? 'remembered in this browser' : 'for this session only'}.`,
  reconnect: (label) => `${label}: the remembered folder needs permission again. Reconnect to use it.`,
  denied: (label) => `${label}: access to the remembered folder was not granted. Reconnect, choose the folder again, or allow access in browser settings.`,
};

/**
 * Game-labelled picker for one game's extracted archive folder (`game` is the registry asset.game
 * key, for example 'cok'). It restores a remembered folder once per page load, and offers
 * reconnect, replace and clear. Archive changes call `onChange` so the page re-reads its archives.
 */
export function addLocalGameFolderPicker(parent: HTMLElement, game: string, label: string, onChange: () => void): HTMLElement {
  gameArchiveChangeHandlers.set(game, onChange);
  const wrap = document.createElement('div');
  wrap.className = 'gbx-local-pack-picker gbx-local-game-folder';
  wrap.setAttribute('data-local-game-folder', game);
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.flexWrap = 'wrap';
  wrap.style.gap = '8px';
  const status = document.createElement('small');
  status.setAttribute('aria-live', 'polite');
  status.style.color = 'var(--muted)';
  status.style.fontSize = '11px';
  const choose = document.createElement('button');
  choose.type = 'button';
  const reconnect = document.createElement('button');
  reconnect.type = 'button';
  reconnect.textContent = `Reconnect ${label} folder`;
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = `Clear ${label} folder`;
  const input = document.createElement('input') as DirectoryInput;
  input.type = 'file';
  input.multiple = true;
  input.webkitdirectory = true;
  input.setAttribute('webkitdirectory', '');
  input.hidden = true;

  const render = () => {
    const state = localGameFolderState(game);
    const busy = state.status === 'restoring' || state.status === 'reading';
    choose.textContent = state.status === 'loaded' ? `Replace ${label} folder` : `Choose ${label} folder`;
    choose.disabled = busy;
    reconnect.hidden = state.status !== 'reconnect' && state.status !== 'denied';
    reconnect.disabled = busy;
    clear.hidden = state.status !== 'loaded' && state.status !== 'reconnect' && state.status !== 'denied';
    const text = STATUS_TEXT[state.status](label, state.count, state.remembered);
    status.textContent = [text, state.message].filter(Boolean).join(' ');
  };

  const unsubscribe = subscribeLocalGameFolder(game, () => {
    if (wrap.isConnected === false) { unsubscribe(); return; }
    render();
  });
  choose.addEventListener('click', () => {
    const picker = directoryPickerApi();
    if (!picker) { input.click(); return; }
    void picker.call(globalThis).then((handle) => chooseLocalGameFolder(game, handle)).catch((error) => {
      if (error instanceof Error && !/abort/i.test(error.name)) status.textContent = error.message;
    });
  });
  input.addEventListener('change', () => {
    if (input.files) chooseSessionGameFolder(game, Array.from(input.files));
    input.value = '';
  });
  reconnect.addEventListener('click', () => { void reconnectLocalGameFolder(game); });
  clear.addEventListener('click', () => { void clearLocalGameFolder(game); });
  wrap.append(choose, reconnect, clear, status, input);
  parent.append(wrap);
  render();
  void restoreLocalGameFolder(game).catch(() => undefined);
  return wrap;
}
