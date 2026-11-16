/**
 * Game Library + "Add asset folder reference" (M0.S5 UI).
 *
 * The shipping load flow: the user clicks "Add asset folder reference," points at one
 * of their own game installs, and the engine fingerprints the folder against the
 * built-in detection profiles to identify the game + platform + graphic set, then
 * registers it as a playable Library entry.
 *
 * Folder access:
 *   - Electron shell (M6.S1): `window.electronAPI`, a `contextBridge` seam backed by a
 *     native `dialog.showOpenDialog` + real `fs.readdir`/`fs.readFile` in the main
 *     process (see `apps/electron/src/{main,preload}`). Takes priority when present —
 *     it's the best UX (native dialog) and gives real filesystem access, not just a
 *     one-shot handle.
 *   - Browser: the File System Access API (`window.showDirectoryPicker()`), which
 *     yields a `FileSystemDirectoryHandle` we walk recursively. The handle is retained
 *     so later milestones can stream the actual asset bytes on demand.
 *   - Fallback (Firefox/Safari/older): a hidden `<input type="file" webkitdirectory>`,
 *     whose `File.webkitRelativePath` gives us the same relative-path list.
 *
 * The fingerprinting itself lives in the pure engine (`fingerprintFolder` /
 * `confirmWithMagic`); this module only walks the folder into `FolderEntry[]`, provides
 * a first-bytes reader for the magic pass, and renders the Library list.
 *
 * A small `window.__greybox` seam exposes `addFromEntries()` so headless e2e can drive
 * detection deterministically without a native folder dialog.
 */
import {
  fingerprintFolder,
  confirmWithMagic,
  deserializeModulePackage,
  serializeModulePackage,
  importFruaDesign,
  validateModulePackage,
  type FolderEntry,
  type DetectionMatch,
  type ReadFirstBytes,
  type ModulePackage,
  type ModuleValidationDiagnostic,
  type ModuleValidationReport,
  type FruaMonsterDesignFile,
  type FruaItemCatalogue,
} from '@goldbox/engine';
import { el } from './render.js';
import { createAssetPathReader, indexPreferredAssetPaths, normalizeAssetPath, NULL_ASSET_SOURCE, type AssetSource } from './assetSource.js';
import { assetUrl } from './catalog.js';
import { saveLastModule, loadLastModule } from './modulePersist.js';
import {
  buildTestModuleGbmod,
  buildTestModuleCombatGbmod,
  buildTestModuleWithArtGbmod,
} from './testFixtures.js';

// --- Minimal File System Access API shapes (not fully in lib.dom yet) --------

interface FSFileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}
interface FSDirHandleLike {
  kind: 'directory';
  name: string;
  entries(): AsyncIterableIterator<[string, FSFileHandleLike | FSDirHandleLike]>;
}
type ShowDirectoryPicker = () => Promise<FSDirHandleLike>;

// --- Electron shell bridge (apps/electron/src/preload) -----------------------

interface PickedFolder {
  sourceId: string;
  folderName: string;
  entries: string[]; // relative paths, '/'-joined
}
interface ElectronAPI {
  pickFolder(): Promise<PickedFolder | null>;
  pickFolderForTest?: (path: string) => Promise<PickedFolder | null>;
  readFile(sourceId: string, relPath: string, maxLength?: number): Promise<Uint8Array>;
}

function getElectronAPI(): ElectronAPI | null {
  return (window as unknown as { electronAPI?: ElectronAPI }).electronAPI ?? null;
}

const MAX_SCAN_FILES = 4096; // generous cap; Gold Box installs are well under this.

// --- Library state ----------------------------------------------------------

/** A detected, playable game install — the original Library entry kind. */
export interface GameLibraryEntry {
  kind: 'game';
  match: DetectionMatch;
  folderName: string;
  fileCount: number;
  /** Reads this entry's own files by basename (M7.S1) — see `assetSource.ts`. */
  assetSource: AssetSource;
}

/** An imported authored module (M11.S3) — distinct from a detected-game entry: no `profileId`/
 * `platform` to route on, just a whole `ModulePackage` ready for `loadModule`. */
export interface ModuleLibraryEntry {
  kind: 'module';
  pkg: ModulePackage;
  fileName: string;
  /** Exact decoded text accepted by the portable-package parser. It is retained verbatim so a
   * save/restart acceptance route can prove that it re-imported the same artifact rather than a
   * normalized reserialization. Raw byte identity is pinned separately below. */
  packageText?: string;
  /** Number of UTF-8 bytes selected by the user (not JavaScript UTF-16 code units). */
  packageByteLength?: number;
  /** Lower-case SHA-256 of the exact selected bytes. */
  packageSha256?: string;
  /** Base-contract validation evidence captured before this entry was registered. */
  validation?: ModuleValidationReport;
  /** Package entrypoint selected for this Library checkpoint (portable .gbmod defaults to 0). */
  entryPointId?: number;
  /** Retail FRUA provenance for honest Library labeling and acceptance evidence. */
  fruaModuleNumber?: number;
  /** Exact selected-install bestiary which enabled source-backed FRUA Combat for this entry. */
  bestiarySource?: FruaBestiarySourceEvidence;
  /** Exact selected-install item tables and their decoded catalogue. This capability is retained
   * outside the portable module so a forged `.gbmod` cannot authorize a FRUA reward itself. */
  itemSource?: FruaItemSourceCapability;
}

export type LibraryEntry = GameLibraryEntry | ModuleLibraryEntry;

const LIBRARY: LibraryEntry[] = [];
let onSelectEntry: ((entry: LibraryEntry) => void) | null = null;

export function getLibrary(): readonly LibraryEntry[] {
  return LIBRARY;
}

/** Register a callback fired when a Library entry is clicked (wired by main.ts). */
export function setLibrarySelectHandler(fn: (entry: LibraryEntry) => void): void {
  onSelectEntry = fn;
}

// --- Folder → FolderEntry[] (+ basename→File reader) -------------------------

interface ScannedFolder {
  folderName: string;
  entries: FolderEntry[];
  /** basename(lowercase) → shallowest File with that name (first seen breaks depth ties). */
  byBasename: Map<string, () => Promise<File>>;
  /** Normalized relative path → File, retained for folder-shaped formats such as FRUA .DSN. */
  byPath: Map<string, () => Promise<File>>;
}

async function scanDirectoryHandle(dir: FSDirHandleLike): Promise<ScannedFolder> {
  const entries: FolderEntry[] = [];
  const byPath = new Map<string, () => Promise<File>>();

  async function walk(node: FSDirHandleLike, prefix: string): Promise<void> {
    for await (const [name, handle] of node.entries()) {
      if (entries.length >= MAX_SCAN_FILES) return;
      const path = prefix ? `${prefix}/${name}` : name;
      if (handle.kind === 'file') {
        entries.push({ path });
        byPath.set(path.replace(/\\/g, '/').toLowerCase(), () => handle.getFile());
      } else {
        await walk(handle, path);
      }
    }
  }
  await walk(dir, '');
  const byBasename = new Map<string, () => Promise<File>>();
  for (const [basename, path] of indexPreferredAssetPaths(entries.map((entry) => entry.path))) {
    const getter = byPath.get(path.replace(/\\/g, '/').toLowerCase());
    if (getter) byBasename.set(basename, getter);
  }
  return { folderName: dir.name, entries, byBasename, byPath };
}

function scanFileList(files: FileList | File[]): ScannedFolder {
  const arr = Array.from(files).slice(0, MAX_SCAN_FILES);
  const entries: FolderEntry[] = [];
  const byPath = new Map<string, () => Promise<File>>();
  const rawPaths = arr.map((f) =>
    ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).replace(/\\/g, '/'));
  const firstSegments = rawPaths.map((path) => path.includes('/') ? path.split('/')[0] : null);
  const commonRoot = firstSegments.length > 0 && firstSegments[0] !== null &&
    firstSegments.every((segment) => segment === firstSegments[0])
    ? firstSegments[0]
    : null;
  const folderName = commonRoot ?? 'folder';
  for (const [index, f] of arr.entries()) {
    const raw = rawPaths[index]!;
    // `webkitRelativePath` includes the selected folder itself, while showDirectoryPicker and the
    // Electron scan both expose paths relative to that folder. Strip one common root component so
    // every path-authority implementation has the same exact namespace.
    const rel = commonRoot ? raw.slice(commonRoot.length + 1) : raw;
    entries.push({ path: rel });
    byPath.set(rel.replace(/\\/g, '/').toLowerCase(), () => Promise.resolve(f));
  }
  const byBasename = new Map<string, () => Promise<File>>();
  for (const [basename, path] of indexPreferredAssetPaths(entries.map((entry) => entry.path))) {
    const getter = byPath.get(path.replace(/\\/g, '/').toLowerCase());
    if (getter) byBasename.set(basename, getter);
  }
  return { folderName, entries, byBasename, byPath };
}

function makeReader(byBasename: Map<string, () => Promise<File>>): ReadFirstBytes {
  return async (base, length) => {
    const getter = byBasename.get(base);
    if (!getter) return null;
    const file = await getter();
    const slice = file.slice(0, length);
    return new Uint8Array(await slice.arrayBuffer());
  };
}

/** Full-file counterpart of `makeReader`, backing gameplay asset loads rather than magic probes. */
function makeAssetSource(scanned: ScannedFolder): AssetSource {
  return {
    async readAsset(base) {
      const getter = scanned.byBasename.get(base.toLowerCase());
      if (!getter) return null;
      const file = await getter();
      return new Uint8Array(await file.arrayBuffer());
    },
    readPath: createAssetPathReader(scanned.entries.map(({ path }) => path), async (path) => {
      const key = normalizeAssetPath(path);
      const getter = key === null ? null : scanned.byPath.get(key);
      if (!getter) return null;
      const file = await getter();
      return new Uint8Array(await file.arrayBuffer());
    }),
  };
}

// --- Core: fingerprint a scanned folder and register it ----------------------

/**
 * Fingerprint a scanned folder (optionally running the magic pass) and, on a
 * confident match, add it to the Library. Returns the match (or null if the folder
 * wasn't recognised / was ambiguous). Exposed for the e2e seam.
 */
export async function addFromEntries(
  folderName: string,
  entries: FolderEntry[],
  read?: ReadFirstBytes,
  assetSource?: AssetSource,
): Promise<DetectionMatch | null> {
  let result = fingerprintFolder(entries);
  if (read) {
    try {
      result = await confirmWithMagic(result, read);
    } catch {
      /* magic pass is best-effort; filename match already stands */
    }
  }
  if (!result.best) return null;
  const entry: LibraryEntry = {
    kind: 'game',
    match: result.best,
    folderName,
    fileCount: entries.length,
    assetSource: assetSource ?? NULL_ASSET_SOURCE,
  };
  LIBRARY.push(entry);
  renderLibrary();
  return result.best;
}

// --- Authored modules: import a .gbmod file into the Library (M11.S3) --------

export type ModuleImportResult =
  | {
      ok: true;
      title: string;
      packageByteLength: number;
      packageSha256: string;
      warnings: ModuleValidationDiagnostic[];
    }
  | {
      ok: false;
      error: string;
      validation?: ModuleValidationReport;
    };

function formatValidationDiagnostics(diagnostics: readonly ModuleValidationDiagnostic[]): string {
  return diagnostics
    .map((finding) => `[${finding.code}] ${finding.path}: ${finding.message}`)
    .join('; ');
}

/** Parse, validate, fingerprint, and register the exact UTF-8 bytes of a portable package. */
async function importModuleBytes(
  text: string,
  bytes: Uint8Array,
  fileName: string,
): Promise<ModuleImportResult> {
  let pkg: ModulePackage;
  try {
    pkg = deserializeModulePackage(text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const validation = validateModulePackage(pkg);
  if (!validation.ok) {
    return {
      ok: false,
      error: `module validation failed: ${formatValidationDiagnostics(validation.errors)}`,
      validation,
    };
  }

  const packageSha256 = await sha256Hex(bytes);
  if (!packageSha256) return { ok: false, error: 'SHA-256 is unavailable in this browser' };
  const packageByteLength = bytes.byteLength;
  const entry: ModuleLibraryEntry = {
    kind: 'module',
    pkg,
    fileName,
    // Portable packages are not required to number their first entrypoint zero. Route the
    // Library row to the package's declared default instead of silently inventing id 0.
    entryPointId: pkg.entrypoints[0]?.id,
    packageText: text,
    packageByteLength,
    packageSha256,
    validation,
  };
  LIBRARY.push(entry);
  renderLibrary();
  // R1: remember the exact imported text so `?module=1` can be reproduced after a reload —
  // see `modulePersist.ts` and `restoreLastModuleEntry` below. Fire-and-forget, deliberately not
  // awaited: this function's caller (`importModuleFile`) reads its resolved `result` to update
  // visible UI text (`setNote`) immediately, and gating that on an IndexedDB round-trip would
  // delay the note relative to the `.lib-entry` DOM row `renderLibrary()` just wrote above,
  // reopening exactly the race `greyfen-reference-campaign` polls for. Persistence failure is
  // already a silent no-op inside `saveLastModule`; it must never affect or delay the result seen
  // by the caller either.
  void saveLastModule({ fileName, packageText: text, sha256: packageSha256, importedAt: Date.now() });
  return {
    ok: true,
    title: pkg.title,
    packageByteLength,
    packageSha256,
    warnings: validation.warnings.map((warning) => ({ ...warning })),
  };
}

/** Parse + register a serialized `ModulePackage` (a `.gbmod` file's contents) as a Library entry.
 * Text-driven callers are fingerprinted over the exact UTF-8 encoding of the supplied string. The
 * real file-input path below supplies its original bytes directly instead. */
export async function importModuleText(
  text: string,
  fileName = 'module.gbmod',
): Promise<ModuleImportResult> {
  return importModuleBytes(text, new TextEncoder().encode(text), fileName);
}

/** R1: reload/share support for `?module=1`. Loads the last-imported module's persisted text
 * (`modulePersist.ts`) and re-runs it through the exact same `importModuleText` path a user's
 * file-drop takes — so the restored bytes are re-parsed and re-validated, never trusted as a
 * stored object. Returns the newly (re-)registered `LibraryEntry` already pushed onto `LIBRARY`
 * and rendered, or `null` when there is nothing stored, storage is unavailable, or the stored
 * text no longer imports cleanly (a corrupted/tampered record must not silently mutate the
 * Library). Does not read or write `location.search` — that belongs to `main.ts`'s `boot()`. */
export async function restoreLastModuleEntry(): Promise<LibraryEntry | null> {
  const stored = await loadLastModule();
  if (!stored) return null;
  const before = LIBRARY.length;
  const result = await importModuleText(stored.packageText, stored.fileName);
  if (!result.ok) return null;
  // importModuleText only pushes on success, and pushes exactly one entry (the FRUA path is not
  // reachable through this text-only re-import), so the new tail entry is the restored one.
  if (LIBRARY.length <= before) return null;
  return LIBRARY[LIBRARY.length - 1];
}

type ReadPathBytes = (relativePath: string) => Promise<Uint8Array | null>;
export interface FruaBestiarySourceEvidence {
  /** Root-relative path authorized by the selected UA-install capability. */
  path: string;
  /** SHA-256 of the bytes actually read through that capability. */
  sha256: string;
}

export interface FruaItemFileEvidence {
  /** Root-relative path authorized by the selected UA-install capability. */
  path: string;
  /** SHA-256 of the bytes actually read through that capability. */
  sha256: string;
}

/** JSON-safe evidence for the two files that jointly define FRUA's item vocabulary/mechanics. */
export interface FruaItemSourceEvidence {
  itemDat: FruaItemFileEvidence;
  itemsDat: FruaItemFileEvidence;
}

/** Live selected-root capability. The catalogue is intentionally omitted from Library/e2e JSON
 * projections but retained in memory for source-backed receipt resolution. */
export interface FruaItemSourceCapability extends FruaItemSourceEvidence {
  catalogue: FruaItemCatalogue;
}

export interface FruaFolderImportOptions {
  /**
   * Root-relative `.DSN` directory. Omit when the selected folder itself is the design; pass
   * `HEIRS.DSN` when `paths`/`readPath` are rooted at the Unlimited Adventures installation.
   */
  designPrefix?: string;
}

export type FruaFolderImportResult =
  | {
      ok: true;
      title: string;
      mapCount: number;
      entryPointId: number;
      selectedModule: number;
      questionEntryPointId?: number;
      unmappedCount: number;
      /** Present only when the exact selected-root HEIRS bestiary gate succeeded. */
      bestiarySource?: FruaBestiarySourceEvidence;
      /** Present only when both exact selected-root FRUA item-table gates succeeded. */
      itemSource?: FruaItemSourceEvidence;
    }
  | { ok: false; error: string };

const HEIRS_GAME001_SHA256 = 'a9ce8098a3db84055c9b834d9d1c6586644117ef35328c9d971c96e06f18cd28';
const HEIRS_GEO001_SHA256 = 'd43a499497c7af97fe92e0518b2d0ab62998d10b89ce4bc40e31c17401f8df85';
const HEIRS_GEO017_SHA256 = '42cc7fd6038a14e52b7f140186078e81027290676e1a19355e7d3e6c92d4ab80';
const HEIRS_MONST_SHA256 = 'b402b28fd48c5fcdfa7b6f1c8744fdf1621f511758d38d6e21772f618f6bf3de';
const HEIRS_ITEM_DAT_SHA256 = '00dcfdea515ec9021ff70f9104d68c6f2aa2d204c350ae80ff26a19664862211';
const HEIRS_ITEMS_DAT_SHA256 = '87ef0a1b564c282f24156d07492b0e8b83a6f383a629463e99249af985217fcb';
const HEIRS_DESIGN_PREFIX = 'HEIRS.DSN';
const FRUA_BESTIARY_PATH = 'DISK2/MONST.GLB';
const FRUA_ITEM_DAT_PATH = 'DISK1/ITEM.DAT';
const FRUA_ITEMS_DAT_PATH = 'DISK1/ITEMS.DAT';

async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

/** Canonicalize one capability-relative path without ever permitting an absolute/upward read. */
function normalizeRootRelativePath(path: string): string | null {
  const normalized = path.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) return null;
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return parts.join('/');
}

/** Import one selected FRUA `.DSN` folder without collapsing its path-shaped file set to basenames.
 * Every design retains GAME001's authentic start. The exact hash-locked retail HEIRS design gains
 * a second, explicitly labelled module-17 den checkpoint; folder naming alone never redirects
 * a design. The selected entrypoint is derived from imported map/entry tables, never hardcoded. */
export async function importFruaFolder(
  folderName: string,
  paths: string[],
  readPath: ReadPathBytes,
  options: FruaFolderImportOptions = {},
): Promise<FruaFolderImportResult> {
  const normalized = paths.flatMap((inputPath) => {
    const path = normalizeRootRelativePath(inputPath);
    return path ? [{ path, lower: path.toLowerCase() }] : [];
  });
  const rawPrefix = options.designPrefix?.replace(/[\\/]+$/, '');
  const designPrefix = rawPrefix === undefined ? '' : normalizeRootRelativePath(rawPrefix);
  if (designPrefix === null) return { ok: false, error: `invalid FRUA design prefix ${JSON.stringify(options.designPrefix)}` };
  const prefixLower = designPrefix.toLowerCase();
  const designName = designPrefix ? (designPrefix.split('/').pop() ?? designPrefix) : folderName;
  const scoped = normalized.flatMap(({ path, lower }) => {
    let leaf = path;
    if (designPrefix) {
      const prefix = `${prefixLower}/`;
      if (!lower.startsWith(prefix)) return [];
      leaf = path.slice(designPrefix.length + 1);
    }
    // Only direct design children are part of this import. Backups or nested designs never win by
    // basename, even if they contain another GAME001/GEO/MONST file.
    if (!leaf || leaf.includes('/')) return [];
    return [{ path, leaf, base: leaf.toUpperCase() }];
  });
  const gamePaths = scoped.filter(({ base }) => base === 'GAME001.DAT');
  if (gamePaths.length !== 1) {
    const scope = designPrefix ? `design ${designPrefix}` : 'selected .DSN folder';
    return { ok: false, error: `expected one direct GAME001.DAT in ${scope}; found ${gamePaths.length}` };
  }
  const geoPaths = scoped
    .map(({ path, base }) => ({ path, match: /^GEO(\d{3})\.DAT$/.exec(base) }))
    .filter((item): item is { path: string; match: RegExpExecArray } => item.match !== null);
  if (geoPaths.length === 0) return { ok: false, error: 'no GEOxxx.DAT maps found in selected .DSN folder' };
  const overridePaths = scoped
    .map(({ path, base }) => ({ path, match: /^MONST(\d{3})\.DAT$/.exec(base) }))
    .filter((item): item is { path: string; match: RegExpExecArray } => item.match !== null)
    .sort((left, right) => Number(left.match[1]) - Number(right.match[1]));
  const globalMonstPaths = normalized.filter(({ lower }) => lower === FRUA_BESTIARY_PATH.toLowerCase());
  const globalItemDatPaths = normalized.filter(({ lower }) => lower === FRUA_ITEM_DAT_PATH.toLowerCase());
  const globalItemsDatPaths = normalized.filter(({ lower }) => lower === FRUA_ITEMS_DAT_PATH.toLowerCase());

  try {
    const game001 = await readPath(gamePaths[0].path);
    if (!game001) return { ok: false, error: `could not read ${gamePaths[0].path}` };
    const geos = new Map<number, Uint8Array>();
    for (const { path, match } of geoPaths) {
      const bytes = await readPath(path);
      if (!bytes) return { ok: false, error: `could not read ${path}` };
      geos.set(Number(match[1]), bytes);
    }
    const geo001 = geos.get(1);
    const geo017 = geos.get(17);
    const game001Sha256 = await sha256Hex(game001);
    const geo001Sha256 = geo001 ? await sha256Hex(geo001) : null;
    const geo017Sha256 = geo017 ? await sha256Hex(geo017) : null;
    const heirsCheckpoint = geo017 !== undefined &&
      game001Sha256 === HEIRS_GAME001_SHA256 && geo017Sha256 === HEIRS_GEO017_SHA256;
    const heirsQuestionCheckpoint = heirsCheckpoint && geo001 !== undefined &&
      geo001Sha256 === HEIRS_GEO001_SHA256;

    let bestiarySource: FruaBestiarySourceEvidence | undefined;
    let monstGlb: Uint8Array | undefined;
    let monsterOverrides: FruaMonsterDesignFile[] | undefined;
    let itemSourceEvidence: FruaItemSourceEvidence | undefined;
    let itemDat: Uint8Array | undefined;
    let itemsDat: Uint8Array | undefined;
    const exactHeirsFromUaRoot = prefixLower === HEIRS_DESIGN_PREFIX.toLowerCase() &&
      game001Sha256 === HEIRS_GAME001_SHA256 && geo001Sha256 === HEIRS_GEO001_SHA256;
    if (exactHeirsFromUaRoot && globalMonstPaths.length === 1) {
      const bytes = await readPath(globalMonstPaths[0].path);
      if (!bytes) return { ok: false, error: `could not read ${FRUA_BESTIARY_PATH} from the selected UA install` };
      const sha256 = await sha256Hex(bytes);
      if (sha256 === HEIRS_MONST_SHA256) {
        monstGlb = bytes;
        bestiarySource = { path: FRUA_BESTIARY_PATH, sha256 };
        monsterOverrides = [];
        for (const { path } of overridePaths) {
          const overrideBytes = await readPath(path);
          if (!overrideBytes) return { ok: false, error: `could not read ${path}` };
          monsterOverrides.push({ name: path, bytes: overrideBytes });
        }
      }
    }
    if (exactHeirsFromUaRoot && globalItemDatPaths.length === 1 && globalItemsDatPaths.length === 1) {
      const itemBytes = await readPath(globalItemDatPaths[0].path);
      if (!itemBytes) return { ok: false, error: `could not read ${FRUA_ITEM_DAT_PATH} from the selected UA install` };
      const baseBytes = await readPath(globalItemsDatPaths[0].path);
      if (!baseBytes) return { ok: false, error: `could not read ${FRUA_ITEMS_DAT_PATH} from the selected UA install` };
      const itemSha256 = await sha256Hex(itemBytes);
      const baseSha256 = await sha256Hex(baseBytes);
      if (itemSha256 === HEIRS_ITEM_DAT_SHA256 && baseSha256 === HEIRS_ITEMS_DAT_SHA256) {
        itemDat = itemBytes;
        itemsDat = baseBytes;
        itemSourceEvidence = {
          itemDat: { path: FRUA_ITEM_DAT_PATH, sha256: itemSha256 },
          itemsDat: { path: FRUA_ITEMS_DAT_PATH, sha256: baseSha256 },
        };
      }
    }

    const imported = importFruaDesign(designName, {
      game001,
      geos,
      ...(monstGlb && bestiarySource
        ? {
            monstGlb,
            monstGlbSourceName: bestiarySource.path,
            monsterOverrides: monsterOverrides ?? [],
            supportedCombatSlotsByModule: new Map([[1, new Set([12])]]),
        }
        : {}),
      ...(itemDat && itemsDat && itemSourceEvidence
        ? {
            itemDat,
            itemsDat,
            itemDatSourceName: itemSourceEvidence.itemDat.path,
            itemsDatSourceName: itemSourceEvidence.itemsDat.path,
            supportedGiveTreasureSlotsByModule: new Map([[1, new Set([45])]]),
          }
        : {}),
    });
    // FRUA conversion is a second package-ingress boundary, just like the plain `.gbmod` file
    // route above. Validate before the first Library mutation, and retain the exact report on
    // every checkpoint entry so importer sourceWarnings remain available to the host/UI.
    const validation = validateModulePackage(imported.package);
    if (!validation.ok) {
      return {
        ok: false,
        error: `imported FRUA module validation failed: ${formatValidationDiagnostics(validation.errors)}`,
      };
    }
    const itemSource: FruaItemSourceCapability | undefined = itemSourceEvidence && imported.itemCatalogue
      ? { ...itemSourceEvidence, catalogue: imported.itemCatalogue }
      : undefined;
    const selectedModule = heirsCheckpoint ? 17 : imported.game001.startingModule;
    let entryPointId = 0;
    if (selectedModule !== imported.game001.startingModule) {
      const mapIndex = imported.moduleNumberToMapIndex.get(selectedModule);
      const entry = imported.package.entrypoints.find((candidate) => candidate.mapIndex === mapIndex && candidate.entryId === 0);
      if (!entry) return { ok: false, error: `module ${selectedModule} has no imported entry 0` };
      entryPointId = entry.id;
    }
    // Resolve every optional checkpoint before committing any row. A late checkpoint error must
    // leave the Library exactly as it was before this import attempt.
    const pendingEntries: ModuleLibraryEntry[] = [{
      kind: 'module',
      pkg: imported.package,
      fileName: designName,
      entryPointId: 0,
      fruaModuleNumber: imported.game001.startingModule,
      validation,
      ...(bestiarySource ? { bestiarySource } : {}),
      ...(itemSource ? { itemSource } : {}),
    }];
    let questionEntryPointId: number | undefined;
    if (heirsQuestionCheckpoint) {
      const mapIndex = imported.moduleNumberToMapIndex.get(1);
      const entry = imported.package.entrypoints.find((candidate) =>
        candidate.mapIndex === mapIndex && candidate.entryId === 0);
      if (!entry) return { ok: false, error: 'module 1 has no imported entry 0' };
      questionEntryPointId = entry.id;
      pendingEntries.push({
        kind: 'module',
        pkg: imported.package,
        fileName: `${designName} · Caravan question checkpoint`,
        entryPointId: questionEntryPointId,
        fruaModuleNumber: 1,
        validation,
        ...(bestiarySource ? { bestiarySource } : {}),
        ...(itemSource ? { itemSource } : {}),
      });
    }
    if (heirsCheckpoint) {
      pendingEntries.push({
        kind: 'module',
        pkg: imported.package,
        fileName: `${designName} · Den checkpoint`,
        entryPointId,
        fruaModuleNumber: selectedModule,
        validation,
        ...(bestiarySource ? { bestiarySource } : {}),
        ...(itemSource ? { itemSource } : {}),
      });
    }
    LIBRARY.push(...pendingEntries);
    renderLibrary();
    // R1: FRUA folders convert straight to a `ModulePackage` — there is no original imported
    // "text" the way a `.gbmod` file has one. Serialize the package so `?module=1` can still be
    // reproduced by re-running it through the same text-import path `restoreLastModuleEntry` uses
    // for every other module kind. When a checkpoint gate added more than one Library row, persist
    // the LAST one pushed (most-recently-added), matching "last imported" for the plain path above.
    // Fire-and-forget for the same reason as the plain `.gbmod` path above: never gate a
    // caller-visible result on an IndexedDB round-trip.
    const lastPending = pendingEntries[pendingEntries.length - 1];
    void saveLastModule({
      fileName: lastPending.fileName,
      packageText: serializeModulePackage(lastPending.pkg),
      importedAt: Date.now(),
    });
    return {
      ok: true,
      title: imported.package.title,
      mapCount: imported.package.maps.length,
      entryPointId,
      selectedModule,
      questionEntryPointId,
      unmappedCount: imported.unmapped.length,
      ...(bestiarySource ? { bestiarySource } : {}),
      ...(itemSourceEvidence && itemSource ? { itemSource: itemSourceEvidence } : {}),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function importModuleFile(file: File): Promise<void> {
  setNote(`Reading "${file.name}"…`);
  let bytes: Uint8Array;
  let text: string;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (err) {
    setNote(
      `Couldn't import "${file.name}": invalid UTF-8 (${err instanceof Error ? err.message : String(err)})`,
      'error',
    );
    return;
  }
  const result = await importModuleBytes(text, bytes, file.name);
  if (result.ok) {
    const warningText = result.warnings.length === 0
      ? 'validation clean'
      : `${result.warnings.length} validation warning${result.warnings.length === 1 ? '' : 's'}`;
    setNote(
      `Imported authored module "${result.title}" — ${result.packageByteLength} UTF-8 bytes · ` +
      `SHA-256 ${result.packageSha256} · ${warningText}.`,
    );
  } else {
    setNote(`Couldn't import "${file.name}": ${result.error}`, 'error');
  }
}

async function addFromScanned(scanned: ScannedFolder): Promise<DetectionMatch | null> {
  return addFromEntries(
    scanned.folderName,
    scanned.entries,
    makeReader(scanned.byBasename),
    makeAssetSource(scanned),
  );
}

async function importFruaFromScanned(
  scanned: ScannedFolder,
  options: FruaFolderImportOptions = {},
): Promise<FruaFolderImportResult> {
  return importFruaFolder(scanned.folderName, scanned.entries.map(({ path }) => path), async (path) => {
    const getter = scanned.byPath.get(path.replace(/\\/g, '/').toLowerCase());
    if (!getter) return null;
    const file = await getter();
    return new Uint8Array(await file.arrayBuffer());
  }, options);
}

function isUnlimitedAdventures(match: DetectionMatch | null): boolean {
  return match?.profileId === 'forgotten-realms-unlimited-adventures';
}

/** Basename→shallowest-relative-path reader backed by `electronAPI.readFile`. */
function makeElectronReader(electron: ElectronAPI, sourceId: string, entries: string[]): ReadFirstBytes {
  const byBasename = indexPreferredAssetPaths(entries);
  return async (base, length) => {
    const path = byBasename.get(base);
    if (!path) return null;
    return electron.readFile(sourceId, path, length);
  };
}

/** Full-file counterpart of `makeElectronReader`, backing gameplay asset loads. */
function makeElectronAssetSource(electron: ElectronAPI, sourceId: string, entries: string[]): AssetSource {
  const byBasename = indexPreferredAssetPaths(entries);
  return {
    async readAsset(base) {
      const path = byBasename.get(base.toLowerCase());
      if (!path) return null;
      return electron.readFile(sourceId, path);
    },
    readPath: createAssetPathReader(entries, (path) => electron.readFile(sourceId, path)),
  };
}

async function addFromPickedFolder(electron: ElectronAPI, picked: PickedFolder): Promise<DetectionMatch | null> {
  const entries: FolderEntry[] = picked.entries.map((path) => ({ path }));
  return addFromEntries(
    picked.folderName,
    entries,
    makeElectronReader(electron, picked.sourceId, picked.entries),
    makeElectronAssetSource(electron, picked.sourceId, picked.entries),
  );
}

// --- Public entry point: the "Add asset folder reference" button -------------

function setNote(msg: string, kind: 'info' | 'error' = 'info'): void {
  const note = document.querySelector('#library-note');
  if (note) {
    note.textContent = msg;
    note.className = kind === 'error' ? 'note small error' : 'note small';
  }
}

export async function addAssetFolderReference(): Promise<void> {
  const electron = getElectronAPI();
  if (electron) {
    try {
      const picked = await electron.pickFolder();
      if (!picked) return; // user cancelled the native dialog
      setNote(`Scanning "${picked.folderName}"…`);
      const match = await addFromPickedFolder(electron, picked);
      if (match) {
        if (isUnlimitedAdventures(match)) {
          const frua = await importFruaFolder(
            picked.folderName,
            picked.entries,
            (path) => electron.readFile(picked.sourceId, path),
            { designPrefix: HEIRS_DESIGN_PREFIX },
          );
          if (frua.ok) {
            setNote(
              `Detected ${match.title} (${match.platform}) and imported FRUA design ` +
              `"${frua.title}" (${frua.mapCount} maps) from the same selected install.`,
            );
          } else {
            setNote(
              `Detected ${match.title} (${match.platform}), but couldn't import ${HEIRS_DESIGN_PREFIX}: ${frua.error}`,
              'error',
            );
          }
        } else {
          setNote(`Detected ${match.title} (${match.platform}) — added to Library.`);
        }
      } else {
        const frua = await importFruaFolder(
          picked.folderName,
          picked.entries,
          (path) => electron.readFile(picked.sourceId, path),
        );
        if (frua.ok) setNote(`Imported FRUA design "${frua.title}" (${frua.mapCount} maps) — added to Library.`);
        else setNote(`Couldn't recognise "${picked.folderName}" (${picked.entries.length} files): ${frua.error}`, 'error');
      }
    } catch (err) {
      setNote(`Could not read folder: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
    return;
  }
  const picker = (window as unknown as { showDirectoryPicker?: ShowDirectoryPicker }).showDirectoryPicker;
  try {
    if (typeof picker === 'function') {
      const dir = await picker();
      setNote(`Scanning "${dir.name}"…`);
      const scanned = await scanDirectoryHandle(dir);
      await finishAdd(scanned);
    } else {
      // Fallback: hidden directory input.
      const input = document.querySelector('#folder-input') as HTMLInputElement | null;
      if (!input) {
        setNote('Folder picking is not supported in this browser.', 'error');
        return;
      }
      input.value = '';
      input.onchange = async () => {
        if (!input.files || input.files.length === 0) return;
        setNote('Scanning folder…');
        await finishAdd(scanFileList(input.files));
      };
      input.click();
    }
  } catch (err) {
    // AbortError = user cancelled the dialog; stay quiet.
    if (err instanceof DOMException && err.name === 'AbortError') return;
    setNote(`Could not read folder: ${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}

async function finishAdd(scanned: ScannedFolder): Promise<void> {
  const match = await addFromScanned(scanned);
  if (match) {
    if (isUnlimitedAdventures(match)) {
      const frua = await importFruaFromScanned(scanned, { designPrefix: HEIRS_DESIGN_PREFIX });
      if (frua.ok) {
        setNote(
          `Detected ${match.title} (${match.platform}) and imported FRUA design ` +
          `"${frua.title}" (${frua.mapCount} maps) from the same selected install.`,
        );
      } else {
        setNote(
          `Detected ${match.title} (${match.platform}), but couldn't import ${HEIRS_DESIGN_PREFIX}: ${frua.error}`,
          'error',
        );
      }
    } else {
      setNote(`Detected ${match.title} (${match.platform}) — added to Library.`);
    }
  } else {
    const frua = await importFruaFromScanned(scanned);
    if (frua.ok) setNote(`Imported FRUA design "${frua.title}" (${frua.mapCount} maps) — added to Library.`);
    else setNote(`Couldn't recognise "${scanned.folderName}" (${scanned.entries.length} files): ${frua.error}`, 'error');
  }
}

// --- Render the Library list ------------------------------------------------

export function renderLibrary(): void {
  const host = document.querySelector('#library-list');
  if (!host) return;
  host.innerHTML = '';
  if (LIBRARY.length === 0) {
    host.appendChild(el('div', 'note small muted', 'No games yet — click "Add asset folder reference".'));
    return;
  }
  LIBRARY.forEach((entry, i) => {
    const item = el('div', 'cat-asset lib-entry');
    item.dataset.libIndex = String(i);
    if (entry.kind === 'module') {
      if (entry.packageSha256) item.dataset.moduleSha256 = entry.packageSha256;
      if (entry.packageByteLength !== undefined) item.dataset.moduleByteLength = String(entry.packageByteLength);
      if (entry.validation) item.dataset.moduleValidationWarnings = String(entry.validation.warnings.length);
      item.appendChild(el('span', 'cat-game', entry.pkg.title));
      const mapWord = entry.pkg.maps.length === 1 ? 'map' : 'maps';
      const kind = entry.fruaModuleNumber === undefined ? 'Authored module' : `FRUA design · module ${entry.fruaModuleNumber}`;
      item.appendChild(el('span', 'cat-meta', `${kind} · ${entry.pkg.maps.length} ${mapWord} · ${entry.fileName}`));
      if (entry.packageSha256 && entry.packageByteLength !== undefined) {
        item.appendChild(
          el('span', 'cat-meta', `${entry.packageByteLength} UTF-8 bytes · SHA-256 ${entry.packageSha256}`),
        );
      }
      for (const warning of entry.validation?.warnings ?? []) {
        item.appendChild(el('span', 'cat-meta', `Warning ${formatValidationDiagnostics([warning])}`));
      }
    } else {
      const m = entry.match;
      item.appendChild(el('span', 'cat-game', m.title));
      const meta = `${m.platform} · ${m.container} · ${m.graphicSet}${m.magicConfirmed ? ' · verified' : ''} · ${Math.round(m.confidence * 100)}%`; // M47.S1 — container format (DAX/DAA/HLIB)
      item.appendChild(el('span', 'cat-meta', meta));
    }
    item.addEventListener('click', () => onSelectEntry?.(entry));
    host.appendChild(item);
  });
}

// --- Wire the button + the headless seam ------------------------------------

export function setupLibrary(): void {
  const btn = document.querySelector('#add-folder-btn');
  if (btn) btn.addEventListener('click', () => void addAssetFolderReference());

  // Import an authored module (M11.S3). A plain file input is genuinely sufficient here — unlike
  // folder-picking (which needed the Electron native-dialog bridge to get a root path for later
  // per-file reads), this is a one-shot text read of a single file, and Electron's renderer is a
  // full Chromium context where `<input type="file">` already works identically to the browser.
  const importBtn = document.querySelector('#import-module-btn');
  const importInput = document.querySelector('#module-input') as HTMLInputElement | null;
  if (importBtn && importInput) {
    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', () => {
      const file = importInput.files?.[0];
      if (file) void importModuleFile(file);
      importInput.value = '';
    });
  }
  renderLibrary();

  // Deterministic e2e seam: drive detection without a native dialog.
  (window as unknown as { __greybox?: Record<string, unknown> }).__greybox = {
    addFromEntries: (folderName: string, paths: string[]) =>
      addFromEntries(folderName, paths.map((path) => ({ path }))),
    getLibrary: () =>
      LIBRARY.map((e) => (e.kind === 'module' ? {
        kind: 'module', title: e.pkg.title, moduleId: e.pkg.id, fileName: e.fileName, entryPointId: e.entryPointId ?? 0,
        fruaModuleNumber: e.fruaModuleNumber, mapCount: e.pkg.maps.length,
        ...(e.packageText !== undefined ? { packageText: e.packageText } : {}),
        ...(e.packageByteLength !== undefined ? { packageByteLength: e.packageByteLength } : {}),
        ...(e.packageSha256 ? { packageSha256: e.packageSha256 } : {}),
        ...(e.validation ? {
          validation: {
            ok: e.validation.ok,
            diagnostics: e.validation.diagnostics.map((finding) => ({ ...finding })),
            errors: e.validation.errors.map((finding) => ({ ...finding })),
            warnings: e.validation.warnings.map((finding) => ({ ...finding })),
          },
        } : {}),
        ...(e.bestiarySource ? { bestiarySource: { ...e.bestiarySource } } : {}),
        ...(e.itemSource ? {
          itemSource: {
            itemDat: { ...e.itemSource.itemDat },
            itemsDat: { ...e.itemSource.itemsDat },
          },
        } : {}),
      } : { kind: 'game', ...e.match, folderName: e.folderName })),
    // M11.S3 — import a serialized ModulePackage without a real file input, the module-entry
    // analog of addFromEntriesWithAssets (a real, non-native way to drive the real import path).
    importModuleText: (text: string, fileName?: string) => importModuleText(text, fileName),
    // R1 — `?module=1` reload/reproduce proof seam: re-imports the last persisted module (if
    // any) through the real import path and returns the resulting LibraryEntry (or `null`).
    // `main.ts`'s `boot()` will call this on `?module=1` in Phase B; Phase A proves it directly.
    restoreLastModule: () => restoreLastModuleEntry(),
    // e2e-only fixture builders — see testFixtures.ts's header.
    buildTestModuleGbmod: () => buildTestModuleGbmod(),
    buildTestModuleCombatGbmod: () => buildTestModuleCombatGbmod(),
    buildTestModuleWithArtGbmod: () => buildTestModuleWithArtGbmod(),
    importFruaDesignAssets: (
      folderName: string,
      paths: string[],
      assets: Record<string, string>,
      designPrefix?: string,
    ) => {
      const byPath = new Map<string, Uint8Array>();
      for (const [path, b64] of Object.entries(assets)) {
        byPath.set(path.replace(/\\/g, '/').toLowerCase(), Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      }
      return importFruaFolder(
        folderName,
        paths,
        async (path) => byPath.get(path.replace(/\\/g, '/').toLowerCase()) ?? null,
        designPrefix ? { designPrefix } : {},
      );
    },
    // M9.S5 — lets an e2e test fetch the SAME bundled bytes explore.ts's own bundled-copy path
    // would read, so it can build a REAL (not garbage) synthetic assetSource for
    // addFromEntriesWithAssets — proving a Library boot with genuine data, not just the garbage-
    // bytes failure proof M7.S1 already covers.
    assetUrl: (repoRelPath: string) => assetUrl(repoRelPath),
    // M7.S1 wiring proof (browser, no real folder access): a synthetic AssetSource keyed
    // by basename → base64 bytes, so an e2e test can prove startExplore() genuinely reads
    // through a Library entry's assetSource (not the bundled repo copy) without needing a
    // real native folder — e.g. by supplying deliberately-wrong bytes for one required
    // file and asserting the load fails loudly instead of silently using the bundled file.
    addFromEntriesWithAssets: (folderName: string, paths: string[], assets: Record<string, string>) => {
      const byBasename = new Map<string, Uint8Array>();
      for (const [base, b64] of Object.entries(assets)) {
        byBasename.set(base.toLowerCase(), Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      }
      const assetSource: AssetSource = {
        async readAsset(base) {
          return byBasename.get(base.toLowerCase()) ?? null;
        },
      };
      return addFromEntries(folderName, paths.map((path) => ({ path })), undefined, assetSource);
    },
    // Electron desktop smoke test (M6.S1): drives the native fs seam via the loader's
    // pickFolderForTest IPC handler (bypasses the un-automatable native dialog), with a
    // real recursive fs.readdir + fs.readFile — proves the desktop shell reads real bytes
    // off disk, not synthetic basename lists.
    ...(getElectronAPI()?.pickFolderForTest ? {
    addFromElectronFolder: async (path: string) => {
      const electron = getElectronAPI();
      if (!electron) return { ok: false, reason: 'no electronAPI' };
      if (!electron.pickFolderForTest) return { ok: false, reason: 'test folder picker disabled' };
      const picked = await electron.pickFolderForTest(path);
      if (!picked) return { ok: false, reason: 'pickFolderForTest returned null' };
      const match = await addFromPickedFolder(electron, picked);
      const frua = isUnlimitedAdventures(match)
        ? await importFruaFolder(
            picked.folderName,
            picked.entries,
            (relativePath) => electron.readFile(picked.sourceId, relativePath),
            { designPrefix: HEIRS_DESIGN_PREFIX },
          )
        : undefined;
      return { ok: true, match, fileCount: picked.entries.length, sourceId: picked.sourceId, frua };
    },
    importFruaFromElectronFolder: async (path: string, designPrefix?: string) => {
      const electron = getElectronAPI();
      if (!electron) return { ok: false, error: 'no electronAPI' };
      if (!electron.pickFolderForTest) return { ok: false, error: 'test folder picker disabled' };
      const picked = await electron.pickFolderForTest(path);
      if (!picked) return { ok: false, error: 'pickFolderForTest returned null' };
      const result = await importFruaFolder(
        picked.folderName,
        picked.entries,
        (relativePath) => electron.readFile(picked.sourceId, relativePath),
        designPrefix ? { designPrefix } : {},
      );
      return result.ok ? { ...result, fileCount: picked.entries.length, sourceId: picked.sourceId } : result;
    },
    readElectronFileForTest: async (sourceId: string, relativePath: string, maxLength?: number) => {
      const electron = getElectronAPI();
      if (!electron?.pickFolderForTest) throw new Error('test folder picker disabled');
      return Array.from(await electron.readFile(sourceId, relativePath, maxLength));
    },
    } : {}),
  };
}
