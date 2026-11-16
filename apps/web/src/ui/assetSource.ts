/**
 * A "read this game's real asset file bytes" seam (M7.S1) — backs Library entries that
 * came from a user-picked folder (Electron native fs / browser File System Access API),
 * so a game booted from the Library reads the user's OWN copy of its files instead of
 * silently falling back to the bundled repo copy `catalog.ts#assetUrl` resolves.
 *
 * Legacy gameplay reads are keyed by basename: every Krynn-Gen1 DOS install (the shape this is
 * wired for so far — CoK/DoK via `gameData.ts`, see `explore.ts#readAssetBytes`) ships its
 * DAX archives flat in the install root, so `gameData.ts`'s `'Champions of Krynn/ECL1.DAX'`
 * paths reduce to a basename lookup (`ECL1.DAX`) against whatever the user's folder is
 * actually named. DQK's HLIB path (`dqkExplore.ts`) is not wired yet — a follow-on slice.
 */
export interface AssetSource {
  /** Read a file's full bytes by case-insensitive basename. Null if not found. */
  readAsset(basename: string): Promise<Uint8Array | null>;
  /** Optional exact path relative to the selected folder, case/slash-insensitive.
   * Null for missing, invalid or ambiguous paths; never falls back to a basename.
   */
  readPath?(relativePath: string): Promise<Uint8Array | null>;
}

/** A source with nothing behind it — the default for Library entries that predate this seam. */
export const NULL_ASSET_SOURCE: AssetSource = {
  async readAsset() {
    return null;
  },
  async readPath() {
    return null;
  },
};

/** Folder-relative lookup key, not a URL or an OS path resolver. Reject aliases/traversal. */
export function normalizeAssetPath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/');
  if (!normalized || /[\x00-\x1f:]/.test(normalized)) return null;
  const segments = normalized.split('/');
  if (segments.some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part))) return null;
  return normalized.toLowerCase();
}

/**
 * Resolve only uniquely indexed paths, forwarding their original spelling to the backend.
 * Case/slash collisions are ambiguous even if a backing map would retain the last file.
 * The basename index and its legacy shallowest/scan-order preference remain independent.
 */
export function createAssetPathReader(
  paths: readonly string[],
  readIndexedPath: (path: string) => Promise<Uint8Array | null>,
): (relativePath: string) => Promise<Uint8Array | null> {
  const exact = new Map<string, string | null>();
  for (const path of paths) {
    const key = normalizeAssetPath(path);
    if (key !== null) exact.set(key, exact.has(key) ? null : path);
  }
  return async (relativePath) => {
    const key = normalizeAssetPath(relativePath);
    const indexedPath = key === null ? null : exact.get(key);
    return indexedPath ? readIndexedPath(indexedPath) : null;
  };
}

/** `'Champions of Krynn/ECL1.DAX'` → `'ECL1.DAX'` (also normalises backslashes). */
export function basenameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Build the basename index used by picked folders. Installers may retain backup/cloud trees with
 * duplicate names; prefer the shallowest relative path so `SAVE/CHRDATA1.GAM` wins over
 * `cloud_saves/SAVE/CHRDATA1.GAM`. Equal-depth collisions retain scan order for compatibility.
 */
export function indexPreferredAssetPaths(paths: readonly string[]): Map<string, string> {
  const indexed = new Map<string, string>();
  const depth = (path: string) => path.replace(/\\/g, '/').split('/').filter(Boolean).length;
  for (const path of paths) {
    const basename = basenameOf(path).toLowerCase();
    const current = indexed.get(basename);
    if (!current || depth(path) < depth(current)) indexed.set(basename, path);
  }
  return indexed;
}
