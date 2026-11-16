/**
 * Per-viewer persistence for the last imported authored module (R1, round 30).
 *
 * `?module=1` is written into the address bar when a `kind: 'module'` Library entry is opened
 * (`main.ts`'s `onLibrarySelect`), but the Library itself lives only in memory (`library.ts`'s
 * `LIBRARY` array) — a read arm for that flag has nothing to reload from. This module is the
 * storage half of the fix: it remembers the exact UTF-8 text of the most recently imported
 * `.gbmod`/FRUA-converted package (never the deserialized object — see `library.ts`'s
 * `restoreLastModuleEntry`, which re-parses and re-validates the stored text through the same
 * import path a user file-drop takes, so a reload never trusts persisted bytes).
 *
 * Storage is the same per-viewer convenience `automapPanel.ts` and `journal.ts` already use, but
 * a module package can carry embedded art (`buildTestModuleWithArtGbmod`) that can exceed a
 * `localStorage` quota, so this uses IndexedDB instead: one object store (`modules`) in a
 * dedicated database (`greybox.modules`), holding a single record under the fixed key `'last'`.
 *
 * Every exported function is wrapped so a throwing or absent `indexedDB` (private windows, the
 * artifact/thumbnail sandboxes, older browsers) resolves to `null`/no-op rather than throwing —
 * this module must never be the reason a module import fails.
 */

/** The exact record persisted for the last successful module import. */
export interface StoredModuleRecord {
  /** Original file name (or a synthesized label for a non-file-input import path). */
  fileName: string;
  /** Exact UTF-8 text handed to `deserializeModulePackage`/`importModuleText` — never the
   * deserialized `ModulePackage` object. Restoring re-runs the real import/validation path over
   * this text rather than trusting a persisted object shape. */
  packageText: string;
  /** SHA-256 of the imported bytes, when available, for a cheap identity check by callers. */
  sha256?: string;
  /** `Date.now()` at import time. */
  importedAt: number;
}

const DB_NAME = 'greybox.modules';
const STORE_NAME = 'modules';
const RECORD_KEY = 'last';
const DB_VERSION = 1;

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (!hasIndexedDb()) {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Store the given record as the last-imported module, replacing any previous one. Never throws;
 * a storage failure (quota, disabled storage, private window) is a silent no-op. */
export async function saveLastModule(record: StoredModuleRecord): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record, RECORD_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // No-op: persistence is a convenience, never a requirement for import to succeed.
  }
}

/** Load the last-persisted module record, or `null` if none exists or storage is unavailable.
 * The caller (`library.ts`'s `restoreLastModuleEntry`) MUST treat the returned `packageText` as
 * untrusted input and re-validate it through the real import path — this function performs no
 * validation of its own. */
export async function loadLastModule(): Promise<StoredModuleRecord | null> {
  try {
    const db = await openDb();
    if (!db) return null;
    return await new Promise<StoredModuleRecord | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
        req.onsuccess = () => {
          const value = req.result as StoredModuleRecord | undefined;
          resolve(value ?? null);
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

/** Remove the persisted last-module record, if any. */
export async function clearLastModule(): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(RECORD_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // No-op.
  }
}
