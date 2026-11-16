/**
 * Whole-`ModulePackage` serializer (M11.S1) — the portable `.gbmod` file format. Everything else
 * in `module/` already round-trips (`editor.ts`'s `serializeModuleMap`, `database.ts`'s
 * `serializeModuleDatabase`) but nothing serializes a WHOLE package as one artifact, which is what
 * an author needs to save a design to a file and share it (VISION pillar 3's FRUA baseline —
 * ARCHITECTURE.md §2.5). This is the exact inverse of `loadModule`'s input, not a new model.
 *
 * **`graphicSets` carrier (M11.S4): EMBEDDED, not referenced.** M5.S2b's imported art
 * (`FrameSet.frames` — a `Map<number, IndexedImage>` of decoded pixel data) doesn't survive
 * `JSON.stringify` as-is (Maps serialize to `{}`, `Uint8Array` to a giant number-array), so M11.S1
 * dropped it with just an `_omittedGraphicSets` name manifest. M11.S4 replaces that with a real
 * embed: `frameSetToPortable`/`frameSetFromPortable` turn the Map into an array of `[id, image]`
 * pairs and each image's `indices` `Uint8Array` into a base64 string (`base64.ts` — this package
 * excludes DOM/Node libs, so no `btoa`/`Buffer`). The alternative (a referenced-asset manifest the
 * user re-points at their own install, the same tactic original-game distribution uses) was
 * rejected for THIS round-trip: Export/Import is a local, single-user artifact (never committed to
 * the repo or hosted), so it carries the same status as a savegame, not a public redistribution —
 * that legal question is exactly what M11.S5's flagged "public module gallery" fork exists to
 * decide separately, before any hosting feature embeds original-derived art.
 */
import type { ModulePackage } from './types.js';
import type { AssetKind, FrameSet, IndexedImage } from '../model/index.js';
import { bytesToBase64, base64ToBytes } from './base64.js';

/** `IndexedImage` minus its `Uint8Array`, which becomes a base64 string. */
interface PortableIndexedImage extends Omit<IndexedImage, 'indices'> {
  indices: string;
}

/** `FrameSet` minus its `Map`, which becomes an ordered array of `[frameId, image]` pairs. */
interface PortableFrameSet {
  name: string;
  kind: AssetKind;
  frames: [number, PortableIndexedImage][];
}

function frameSetToPortable(fs: FrameSet): PortableFrameSet {
  return {
    name: fs.name,
    kind: fs.kind,
    frames: [...fs.frames].map(([id, img]) => [id, { ...img, indices: bytesToBase64(img.indices) }]),
  };
}

function frameSetFromPortable(pfs: PortableFrameSet): FrameSet {
  return {
    name: pfs.name,
    kind: pfs.kind,
    frames: new Map(pfs.frames.map(([id, img]) => [id, { ...img, indices: base64ToBytes(img.indices) }])),
  };
}

/** The on-disk/wire shape: a `ModulePackage` with `graphicSets` replaced by its portable form
 * (present only when the source package had at least one set). */
type PortableModulePackage = Omit<ModulePackage, 'graphicSets'> & {
  _graphicSets?: PortableFrameSet[];
};

/**
 * Serialize a whole `ModulePackage` to a portable JSON string (the `.gbmod` format). `graphicSets`
 * — see the file header — is embedded under `_graphicSets`, base64-encoding each frame's pixel
 * bytes; omitted entirely when the package has no art.
 */
export function serializeModulePackage(pkg: ModulePackage): string {
  const { graphicSets, ...rest } = pkg;
  const portable: PortableModulePackage =
    graphicSets && graphicSets.length > 0 ? { ...rest, _graphicSets: graphicSets.map(frameSetToPortable) } : rest;
  // Portable files are text artifacts, so end them with a newline. Besides being friendly to
  // normal text tooling, this makes checked-in golden `.gbmod` bytes reproducible through the
  // same serializer that Author uses for Save and Export.
  return `${JSON.stringify(portable)}\n`;
}

/** Validate only the fields consumed by portable art conversion, not image metadata or base64 syntax. */
function isPortableIndexedImage(v: unknown): v is PortableIndexedImage {
  return !!v && typeof v === 'object' && !Array.isArray(v) &&
    typeof (v as Record<string, unknown>).indices === 'string';
}

function isPortableFrame(v: unknown): v is [number, PortableIndexedImage] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && isPortableIndexedImage(v[1]);
}

function isPortableFrameSet(v: unknown): v is PortableFrameSet {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const set = v as Record<string, unknown>;
  return typeof set.name === 'string' && typeof set.kind === 'string' &&
    Array.isArray(set.frames) && set.frames.every(isPortableFrame);
}

function isModulePackageShape(v: unknown): v is PortableModulePackage {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    p.schema === 1 &&
    typeof p.id === 'string' &&
    typeof p.title === 'string' &&
    typeof p.ruleset === 'string' &&
    Array.isArray(p.maps) &&
    Array.isArray(p.entrypoints) &&
    (p._graphicSets === undefined || (Array.isArray(p._graphicSets) && p._graphicSets.every(isPortableFrameSet)))
  );
}

/**
 * Parse + validate a `serializeModulePackage` payload back into a loadable `ModulePackage`.
 * Throws on malformed JSON, a shape mismatch, or an unsupported schema — a corrupt/foreign file is
 * reported, not silently patched (matches `deserializeModuleMap`/`deserializeModuleDatabase`).
 * Restores `graphicSets` from `_graphicSets` when present (M11.S4) — the returned package's art is
 * byte-identical to what was serialized.
 */
export function deserializeModulePackage(json: string): ModulePackage {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (err) {
    throw new Error(`deserializeModulePackage: invalid JSON (${(err as Error).message})`);
  }
  if (!isModulePackageShape(data)) throw new Error('deserializeModulePackage: not a ModulePackage-shaped object');
  const { _graphicSets, ...pkg } = data;
  const result: ModulePackage = pkg as ModulePackage;
  if (_graphicSets && _graphicSets.length > 0) result.graphicSets = _graphicSets.map(frameSetFromPortable);
  return result;
}

/** The names of a serialized package's embedded graphic sets (empty if it has none). Lets a
 * caller show "this module includes BIGPIC, …" without a full deserialize (which would decode
 * every frame's base64 pixel data). */
export function graphicSetNames(json: string): string[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!data || typeof data !== 'object') return [];
  const sets = (data as Record<string, unknown>)._graphicSets;
  if (!Array.isArray(sets)) return [];
  return sets
    .map((s) => (s && typeof s === 'object' ? (s as Record<string, unknown>).name : undefined))
    .filter((n): n is string => typeof n === 'string');
}
