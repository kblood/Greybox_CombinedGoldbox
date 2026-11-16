import { createAssetPathReader, normalizeAssetPath } from './assetSource.js';
import { createHostedRestyleReader, createLocalAssetPackEpoch, createLocalImageUrlCache, matchesLocalAssetSha256, normalizeLocalPackPath,
  readLocalThenHostedImageUrl, readPackSnapshot, readPinnedLocalAsset, readPinnedLocalOrFetch } from './localAssetPackCore.mjs';

export type LocalAssetPack = {
  label: string;
  readPath(path: string): Promise<Uint8Array | null>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};
type DirectoryInput = HTMLInputElement & { webkitdirectory?: boolean };

let activePack: LocalAssetPack | null = null;
const packEpoch = createLocalAssetPackEpoch<LocalAssetPack | null>(null);
const hostedPin: unknown = import.meta.env.VITE_HOSTED_RESTYLE_INVENTORY_SHA256;
const hostedReader = createHostedRestyleReader(hostedPin, import.meta.env.BASE_URL);
const imageUrls = createLocalImageUrlCache({
  createUrl: (bytes: Uint8Array) => URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'image/png' })),
  revokeUrl: (url: string) => URL.revokeObjectURL(url),
  matchesHash: matchesLocalAssetSha256,
});

export class StaleLocalAssetPackError extends Error {
  constructor() { super('Local image folder changed while an image was loading'); this.name = 'StaleLocalAssetPackError'; }
}

export function isStaleLocalAssetPackError(error: unknown): boolean {
  return error instanceof StaleLocalAssetPackError;
}

export function setLocalAssetPack(pack: LocalAssetPack | null): void {
  activePack = pack;
  const revision = packEpoch.replace(pack);
  imageUrls.replace(revision);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('goldbox:local-asset-pack', { detail: { label: pack?.label ?? null, revision } }));
}

export function localAssetPackLabel(): string | null {
  return activePack?.label ?? null;
}

export function localAssetPackRevision(): number { return packEpoch.snapshot().revision; }

async function readDirectoryHandle(root: FileSystemDirectoryHandle, relativePath: string): Promise<Uint8Array | null> {
  const normalized = normalizeAssetPath(relativePath);
  if (!normalized) return null;
  const parts = relativePath.replace(/\\/g, '/').split('/');
  let directory = root;
  try {
    for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
    const file = await (await directory.getFileHandle(parts.at(-1)!)).getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch {
    return null;
  }
}

function directoryHandlePack(root: FileSystemDirectoryHandle): LocalAssetPack {
  return { label: root.name, readPath: (path) => readDirectoryHandle(root, path) };
}

function fileListPack(files: FileList): LocalAssetPack | null {
  const entries = Array.from(files);
  if (!entries.length) return null;
  const rawPaths = entries.map((file) => (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name);
  const roots = rawPaths.map((path) => path.replace(/\\/g, '/').split('/')[0] ?? '');
  const commonRoot = roots[0] && roots.every((root) => root === roots[0]) ? roots[0] : '';
  const relative = rawPaths.map((path) => {
    const normalized = path.replace(/\\/g, '/');
    return commonRoot ? normalized.slice(commonRoot.length + 1) : normalized;
  });
  const byPath = new Map<string, File>();
  for (const [index, path] of relative.entries()) {
    const key = normalizeAssetPath(path);
    if (key !== null) byPath.set(key, entries[index]!);
  }
  const readPath = createAssetPathReader(relative, async (path) => {
    const key = normalizeAssetPath(path);
    const file = key === null ? undefined : byPath.get(key);
    return file ? new Uint8Array(await file.arrayBuffer()) : null;
  });
  return { label: commonRoot || 'selected folder', readPath };
}

/** Attach a local Restyle-folder picker. The chosen directory is the contents of `restyle/`:
 * manifest.json, orig/, out/, cok-generated/, and related local image files.
 *
 * `isOwnerCurrent` (optional, default always-true) gates every picker control: the folder button does not open
 * the dialog, Clear does nothing, the fallback file input is ignored, and a pick that resolves after the user's
 * choice is dropped. A dropped pick leaves the global pack unchanged, does not update this control's UI, and
 * dispatches no `goldbox:local-asset-pack` event. Callers whose owner can be retired while the folder dialog is open
 * (e.g. a replaced creator) pass a guard; every other caller keeps the existing behavior. A guard that only checks
 * the owner's session is not tied to the owner's render, so a same-session rerender does not drop a pending pick.
 */
export function addLocalAssetPackPicker(parent: HTMLElement, onChange: () => void, isOwnerCurrent: () => boolean = () => true): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'gbx-local-pack-picker';
  wrap.style.display = 'flex';
  wrap.style.alignItems = 'center';
  wrap.style.flexWrap = 'wrap';
  wrap.style.gap = '8px';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = activePack ? `Local image folder: ${activePack.label}` : 'Choose local Restyle image folder';
  button.setAttribute('aria-label', 'Choose a local Restyle image folder');
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Clear';
  clear.hidden = !activePack;
  const refreshLabel = (): void => {
    button.textContent = activePack ? `Local image folder: ${activePack.label}` : 'Choose local Restyle image folder';
    clear.hidden = !activePack;
  };
  clear.addEventListener('click', () => {
    if (!isOwnerCurrent()) return;
    setLocalAssetPack(null);
    button.textContent = 'Choose local Restyle image folder';
    clear.hidden = true;
    onChange();
  });
  const input = document.createElement('input') as DirectoryInput;
  input.type = 'file';
  input.multiple = true;
  input.webkitdirectory = true;
  input.setAttribute('webkitdirectory', '');
  input.hidden = true;
  input.addEventListener('change', () => {
    const pack = input.files ? fileListPack(input.files) : null;
    if (!pack) return;
    if (!isOwnerCurrent()) { input.value = ''; return; }
    setLocalAssetPack(pack);
    button.textContent = `Local image folder: ${pack.label}`;
    clear.hidden = false;
    input.value = '';
    onChange();
  });
  button.addEventListener('click', () => {
    if (!isOwnerCurrent()) return;
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (picker) {
      void picker.call(window).then((root) => {
        // The owner may have been retired or replaced while the folder dialog was open: drop the stale pick.
        if (!isOwnerCurrent()) return;
        const pack = directoryHandlePack(root);
        setLocalAssetPack(pack);
        button.textContent = `Local image folder: ${pack.label}`;
        clear.hidden = false;
        onChange();
      }).catch(() => { /* User cancellation leaves the current folder selected. */ });
    } else input.click();
  });
  const note = document.createElement('small');
  note.textContent = 'Select the restyle/ folder; images are read locally in this browser and are never uploaded.';
  note.style.color = 'var(--muted)';
  note.style.fontSize = '11px';
  wrap.append(button, clear, note, input);
  parent.append(wrap);
  const packListener = (): void => refreshLabel();
  window.addEventListener('goldbox:local-asset-pack', packListener);
  const cleanup = new MutationObserver(() => {
    if (!wrap.isConnected) {
      window.removeEventListener('goldbox:local-asset-pack', packListener);
      cleanup.disconnect();
    }
  });
  cleanup.observe(document.body, { childList: true, subtree: true });
  return wrap;
}

function packPath(candidate: string): string | null {
  return normalizeLocalPackPath(candidate);
}

/** Local first; missing files alone may use a verified hosted descriptor/image. */
export async function localAssetImageUrl(candidates: readonly string[], expectedSha256?: string | null): Promise<string | null> {
  const snapshot = packEpoch.snapshot();
  const paths = candidates.map(packPath).filter((path): path is string => path !== null);
  try {
    return await readLocalThenHostedImageUrl(imageUrls, snapshot, packEpoch.isCurrent, paths, expectedSha256,
      (captured, path) => readPackSnapshot(captured, packEpoch.isCurrent, path),
      async (captured: { pack: LocalAssetPack | null; revision: number }, path: string) => {
        if (!packEpoch.isCurrent(captured)) return null;
        return hostedReader.read(path, expectedSha256 ?? path.match(/(?:^|\/)([a-f0-9]{64})\.png$/i)?.[1],
          undefined, () => packEpoch.isCurrent(captured));
      }, (path) => hostedReader.pin(path, undefined, () => packEpoch.isCurrent(snapshot)));
  } catch (error) { if (!packEpoch.isCurrent(snapshot)) return null; throw error; }
}

/** Read metadata by path from the selected Restyle folder. */
export async function localAssetPackBytes(path: string): Promise<Uint8Array | null> {
  const normalized = packPath(path);
  const snapshot = packEpoch.snapshot();
  return normalized ? readPackSnapshot(snapshot, packEpoch.isCurrent, normalized) : null;
}

/** Read one exact local asset and reject mismatched bytes before runtime decoding. */
export async function localAssetPackPinnedBytes(path: string, expectedSha256: string): Promise<Uint8Array | null> {
  const snapshot = packEpoch.snapshot();
  if (!snapshot.pack) return null;
  const bytes = await readPinnedLocalAsset((candidate) => readPackSnapshot(snapshot, packEpoch.isCurrent, candidate), path, expectedSha256);
  return packEpoch.isCurrent(snapshot) ? bytes : null;
}

/** Preserve admitted pins: local first, verified host next, then development-only fallback. */
export async function localAssetPackOrDevFetchPinned(path: string, expectedSha256: string, url: string,
  maxBytes: number, signal?: AbortSignal, label?: string): Promise<Uint8Array> {
  const snapshot = packEpoch.snapshot();
  const readPath = snapshot.pack ? async (candidate: string): Promise<Uint8Array | null> => {
    if (!packEpoch.isCurrent(snapshot)) throw new StaleLocalAssetPackError();
    const bytes = await readPackSnapshot(snapshot, packEpoch.isCurrent, candidate);
    if (!packEpoch.isCurrent(snapshot)) throw new StaleLocalAssetPackError();
    return bytes;
  } : null;
  let bytes: Uint8Array;
  try {
    bytes = await readPinnedLocalOrFetch(readPath, path, expectedSha256, url, maxBytes, signal, label,
      import.meta.env.DEV, () => packEpoch.isCurrent(snapshot), hostedReader);
  } catch (error) {
    if (!packEpoch.isCurrent(snapshot)) throw new StaleLocalAssetPackError();
    throw error;
  }
  if (!packEpoch.isCurrent(snapshot)) throw new StaleLocalAssetPackError();
  return bytes;
}
