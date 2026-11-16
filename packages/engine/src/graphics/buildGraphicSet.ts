/**
 * Bridge: a loaded game's decoded frames → a `GraphicSet` (M1.S2 build path).
 *
 * `loadGame` groups decoded frames by coarse manifest `GameCategory`; the
 * GraphicSetManager addresses frames by `(AssetKind, index)` logical refs. This maps
 * one to the other with a STABLE category→kind table so that the DOS and Amiga sets of
 * the *same* game place corresponding art in the same logical slots — which is what
 * makes the per-frame fallback and the live DOS↔Amiga switch line up.
 *
 * Indices are assigned sequentially within each category, in manifest file order then
 * frame order. (When precise cross-platform frame alignment matters beyond this, a
 * later pass can key by source block id; this positional mapping is the v1 the render
 * pipeline consumes.)
 */
import type { LoadedGame, GameCategory, AssetKind, IndexedImage } from '../model/index.js';
import type { GraphicSet, GraphicSetId } from './graphicSet.js';

/** Stable map from the coarse manifest category to the GraphicSet frame key. */
export const CATEGORY_TO_KIND: Record<GameCategory, AssetKind> = {
  title: 'title',
  scenes: 'bigpic',
  portraits: 'cpic',
  backdrops: 'back',
  tiles: 'tile8x8',
  sprites: 'sprite',
  ui: 'frame-ui',
  data: 'unknown',
};

/**
 * Build a `GraphicSet` from a `LoadedGame`. `complete` is true when the game loaded
 * with no per-file errors (drives the UI "complete set" badge).
 */
export function buildGraphicSet(game: LoadedGame, id: GraphicSetId, label: string): GraphicSet {
  const frames = new Map<AssetKind, Map<number, IndexedImage>>();

  for (const group of game.categories) {
    const kind = CATEGORY_TO_KIND[group.category];
    let map = frames.get(kind);
    if (!map) {
      map = new Map<number, IndexedImage>();
      frames.set(kind, map);
    }
    let index = 0;
    for (const file of group.files) {
      for (const f of file.frames) {
        map.set(index, f.image);
        index += 1;
      }
    }
  }

  return {
    id,
    label,
    display: game.display,
    frames,
    complete: game.errors.length === 0,
  };
}
