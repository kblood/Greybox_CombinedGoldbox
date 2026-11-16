/**
 * GraphicSetManager backing for the first-person wall viewport (M9.S2).
 *
 * `DungeonWalls.lookupTile` (dungeonWalls.ts) resolves a `WallTileBlit` straight to a decoded
 * 8×8 `IndexedImage` from THIS dungeon's own relocated WALLDEF/8X8D tile pools — a different,
 * finer-grained addressing scheme than `buildGraphicSet.ts`'s whole-game, manifest-file-order
 * `(category,index)` positional mapping (M9.S1). Rendering a specific dungeon needs the former;
 * a live art-source switch needs the latter's `GraphicSetManager` machinery. This module bridges
 * them: packs one dungeon's tile pools into a `GraphicSet` under a STABLE ref-index scheme that
 * exactly mirrors `lookupTile`'s own branching (`buildDungeonWallGraphicSet`), then wraps a
 * `GraphicSetManager` back into a `WallTileLookup` (`resolveWallTileLookup`) so
 * `renderWallView`/`renderWallViewIndexed` can pull frames through `manager.resolve()` without
 * knowing a GraphicSet exists.
 *
 * `readId` (which WALLDEF entry is active where) is dungeon MAP data, not art — it passes
 * through unchanged regardless of which graphic set is active.
 */
import type { IndexedImage, DisplayProfile } from '../model/index.js';
import type { GraphicSet, GraphicSetId, GraphicSetManager } from '../graphics/graphicSet.js';
import type { DungeonWalls } from './dungeonWalls.js';
import type { WallTileLookup } from './renderWallView.js';
import type { WallTileBlit } from './wallpieces.js';

/** Offset band for the DoK-style shared 256-tile bank, kept well clear of the regular
 * `set*1000+index` band (max realistic regular key is a few thousand) so the two never collide. */
const SINGLE_BANK_BAND = 100_000;

/**
 * The `tile8x8` ref index for one blit, addressed so it round-trips through
 * {@link buildDungeonWallGraphicSet}. Mirrors `DungeonWalls.lookupTile`'s own branching exactly:
 * the DoK single-bank path keys by the zero-based GLOBAL id (`tileId`), everything else keys by
 * `(set, index)` — `blit.index` alone is not globally unique across sets, so it must be paired
 * with `set` in the regular band.
 */
function wallTileRefIndex(walls: DungeonWalls, blit: Pick<WallTileBlit, 'set' | 'index' | 'tileId'>): number {
  if (walls.singleBank) {
    return SINGLE_BANK_BAND + blit.tileId;
  }
  return blit.set * 1000 + blit.index;
}

/**
 * Pack one loaded dungeon's wall tile pools into a `GraphicSet`'s `tile8x8` category, using
 * {@link wallTileRefIndex}'s addressing so every ref `resolveWallTileLookup` will ever compute
 * for this SAME `walls` instance is present. Skips the regular per-set band for sets 1..3 when a
 * `singleBank` is active — it owns the complete global 0..255 id space, even when generic routing
 * labels a low/high id as set 0/4. The regular sets 1..3 already ARE the same bank
 * (`dungeonWalls.ts` points them at the same object), so populating both bands would just duplicate frames
 * under a key `lookupTile` never actually reaches.
 */
export function buildDungeonWallGraphicSet(
  walls: DungeonWalls,
  id: GraphicSetId,
  label: string,
  display: DisplayProfile,
): GraphicSet {
  const tile8x8 = new Map<number, IndexedImage>();

  if (walls.singleBank) {
    walls.singleBank.tiles.forEach((img, gi) => tile8x8.set(SINGLE_BANK_BAND + gi, img));
  }
  for (let set = 0; set <= 4; set++) {
    if (walls.singleBank && set >= 1 && set <= 3) continue;
    const ts = walls.tileSets[set];
    if (!ts) continue;
    ts.tiles.forEach((img, index) => tile8x8.set(set * 1000 + index, img));
  }

  return {
    id,
    label,
    display,
    frames: new Map([['tile8x8', tile8x8]]),
    complete: true,
  };
}

/**
 * Wrap a `GraphicSetManager` (built over one or more {@link buildDungeonWallGraphicSet} sets for
 * THIS SAME `walls` instance) back into a `WallTileLookup`, so `renderWallView`/
 * `renderWallViewIndexed` can consume it exactly like the direct `walls` lookup, transparently —
 * `readId` is unchanged map data; `lookupTile` resolves through the manager's active-set +
 * fallback chain instead of `walls`'s own single fixed source.
 */
export function resolveWallTileLookup(manager: GraphicSetManager, walls: DungeonWalls): WallTileLookup {
  return {
    readId: walls.readId,
    lookupTile(blit: Pick<WallTileBlit, 'set' | 'index' | 'tileId'>): IndexedImage | null {
      return manager.resolve({ category: 'tile8x8', index: wallTileRefIndex(walls, blit) });
    },
  };
}

/** One category's real-time art provenance (M9.S5). */
export interface WallArtCategoryProvenance {
  /** Human-readable category label, e.g. "wall bricks (shared bank)" or "symbol set 4". */
  category: string;
  /**
   * Which set actually supplies EVERY tile in this category right now (active, or a fallback);
   * `'mixed'` when different tiles in the SAME category resolve to different sets (a genuine
   * partial fallback, not assumed all-or-nothing); `null` when the category resolves nowhere.
   */
  source: GraphicSetId | 'mixed' | null;
}

/**
 * An honest "Amiga where available, DOS fallback elsewhere" breakdown for whichever set is
 * CURRENTLY ACTIVE on `manager` — never a blanket "Amiga" claim when some categories actually
 * fell back. Walks every ref `dosSet` defines (DOS is always the complete base a dungeon loads
 * from, so its `tile8x8` key space is authoritative for "what categories exist"), grouped by the
 * SAME category bands `buildDungeonWallGraphicSet`/`wallTileRefIndex` use, and asks the manager
 * which set resolves each ref via `resolveSet` (active-first, then the fallback chain — so this
 * naturally reports 'DOS-EGA' for every category when DOS-EGA itself is active, and only shows
 * real fallback structure when a richer set like Amiga is active).
 */
export function wallArtProvenance(dosSet: GraphicSet, manager: GraphicSetManager): WallArtCategoryProvenance[] {
  const tile8x8 = dosSet.frames.get('tile8x8');
  if (!tile8x8) return [];
  const byCategory = new Map<string, number[]>();
  for (const key of tile8x8.keys()) {
    const category = key >= SINGLE_BANK_BAND ? 'wall bricks (shared bank)' : `symbol set ${Math.floor(key / 1000)}`;
    const keys = byCategory.get(category);
    if (keys) keys.push(key);
    else byCategory.set(category, [key]);
  }
  return [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, keys]) => {
      const sources = new Set(keys.map((key) => manager.resolveSet({ category: 'tile8x8', index: key })));
      const source: GraphicSetId | 'mixed' | null = sources.size === 1 ? [...sources][0] ?? null : 'mixed';
      return { category, source };
    });
}
