/**
 * GraphicSet abstraction + live-switch mechanism (M1.S2).
 *
 * A GraphicSet is a named, decoded, engine-ready set of frames for ONE platform
 * variant of ONE game (DOS-EGA / Amiga / DOS-VGA / …). The engine keeps every loaded
 * set resident and holds an *active set pointer* plus a *per-frame fallback chain*;
 * switching the look at runtime is a pointer swap + redraw — no reload, no engine-state
 * change (the "best-of art, switch live" headline feature).
 *
 * Fallback is **per logical frame, not per file**: the Amiga set may have frames the DOS
 * set lacks and vice-versa, so `resolve` tries the active set first, then walks the
 * fallback chain frame-by-frame. The render layer never touches a container directly —
 * it asks `resolve(ref)` and draws the returned indexed image through the active palette.
 *
 * Contract per docs/engine/ARCHITECTURE.md §2.2. This module is pure (DOM/Node-free).
 */
import type { AssetKind, IndexedImage, DisplayProfile } from '../model/index.js';

/** Stable id for a platform variant's art. Open-ended (custom platforms allowed). */
export type GraphicSetId = 'DOS-EGA' | 'DOS-VGA' | 'Amiga' | 'PC-98' | 'Mac' | string;

/** A logical, platform-independent handle to one renderable asset. */
export interface LogicalAssetRef {
  /** Category bucket, e.g. 'pic' | 'bigpic' | 'sprite' | 'cpic' | 'tile8x8'. */
  category: AssetKind;
  /** Block/entry index within the category. */
  index: number;
}

/** One platform's decoded assets for one game. */
export interface GraphicSet {
  id: GraphicSetId;
  /** Human label, e.g. "Amiga (32 colors)". */
  label: string;
  /** Native size + pixelAspect + color mode for this set. */
  display: DisplayProfile;
  /** category → (index → frame). Sparse; a missing index falls back. */
  frames: Map<AssetKind, Map<number, IndexedImage>>;
  /** True once every referenced container decoded without gaps (UI badge). */
  complete: boolean;
}

export interface GraphicSetManager {
  /** Ids of all resident sets, in insertion order. */
  readonly available: GraphicSetId[];
  /** Currently-active set id. */
  readonly active: GraphicSetId;
  /** Fallback priority order applied after the active set, e.g. ['Amiga','DOS-EGA']. */
  readonly fallback: GraphicSetId[];
  /** The active GraphicSet object (for the renderer's display profile/palette). */
  activeSet(): GraphicSet;
  /** Swap the active set; engine state untouched; emits 'change' → host redraws. */
  setActive(id: GraphicSetId): void;
  /** Resolve a logical ref through the active set then the fallback chain. */
  resolve(ref: LogicalAssetRef): IndexedImage | null;
  /** Which set id actually supplies this ref right now (active or a fallback)? null if none. */
  resolveSet(ref: LogicalAssetRef): GraphicSetId | null;
  /** Does a SPECIFIC set have this frame (index-bounds-safe, no fallback)? */
  has(setId: GraphicSetId, ref: LogicalAssetRef): boolean;
  /** Subscribe to active-set changes; returns an unsubscribe fn. */
  on(ev: 'change', cb: (id: GraphicSetId) => void): () => void;
}

export interface GraphicSetManagerOptions {
  /** Initial active set id (defaults to the first set). */
  active?: GraphicSetId;
  /**
   * Fallback priority order (set ids). Defaults to all sets in insertion order.
   * The active set is always tried first regardless of its position here.
   */
  fallback?: GraphicSetId[];
}

/**
 * Build a GraphicSetManager over one or more resident sets.
 * @throws if `sets` is empty, ids are not unique, or `active`/`fallback` name an
 *         unknown set.
 */
export function createGraphicSetManager(
  sets: GraphicSet[],
  options: GraphicSetManagerOptions = {},
): GraphicSetManager {
  if (sets.length === 0) throw new Error('createGraphicSetManager: at least one GraphicSet is required');

  const byId = new Map<GraphicSetId, GraphicSet>();
  for (const s of sets) {
    if (byId.has(s.id)) throw new Error(`createGraphicSetManager: duplicate GraphicSet id "${s.id}"`);
    byId.set(s.id, s);
  }
  const order = sets.map((s) => s.id);

  const assertKnown = (id: GraphicSetId, ctx: string): void => {
    if (!byId.has(id)) throw new Error(`createGraphicSetManager: ${ctx} names unknown set "${id}"`);
  };

  let active: GraphicSetId = options.active ?? order[0];
  assertKnown(active, 'active');

  const fallback: GraphicSetId[] = options.fallback ? [...options.fallback] : [...order];
  for (const id of fallback) assertKnown(id, 'fallback');

  const listeners = new Set<(id: GraphicSetId) => void>();

  const frameIn = (setId: GraphicSetId, ref: LogicalAssetRef): IndexedImage | null => {
    const set = byId.get(setId);
    if (!set) return null;
    return set.frames.get(ref.category)?.get(ref.index) ?? null;
  };

  // Resolution order: active set first, then the fallback chain (skipping a repeat
  // of the active id so it's not probed twice).
  const chain = (): GraphicSetId[] => [active, ...fallback.filter((id) => id !== active)];

  return {
    get available() {
      return [...order];
    },
    get active() {
      return active;
    },
    get fallback() {
      return [...fallback];
    },
    activeSet() {
      return byId.get(active)!;
    },
    setActive(id: GraphicSetId) {
      assertKnown(id, 'setActive');
      if (id === active) return;
      active = id;
      for (const cb of listeners) cb(active);
    },
    resolve(ref: LogicalAssetRef): IndexedImage | null {
      for (const id of chain()) {
        const img = frameIn(id, ref);
        if (img) return img;
      }
      return null;
    },
    resolveSet(ref: LogicalAssetRef): GraphicSetId | null {
      for (const id of chain()) {
        if (frameIn(id, ref)) return id;
      }
      return null;
    },
    has(setId: GraphicSetId, ref: LogicalAssetRef): boolean {
      return frameIn(setId, ref) !== null;
    },
    on(ev: 'change', cb: (id: GraphicSetId) => void): () => void {
      if (ev !== 'change') return () => {};
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
