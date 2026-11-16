/**
 * First-person wall-piece geometry + tile routing (M1.S5c core).
 *
 * These are the **verbatim-confirmed** primitives the COAB engine uses to turn a GEO wall
 * slot + the WALLDEF 5×156 table into 8×8 tile blits in the dungeon viewport. Source and
 * proof: docs/engine/research/firstperson-wall-geometry-cok.md (§1 viewport, §3 piece table,
 * §4 tile expansion, §6 routing) — all marked CONFIRMED, lifted from COAB ovr031/ovr038.
 *
 * This module is the load-bearing primitive; the far→mid→near cell *walk* that decides which
 * pieces fire for a given party pose lives in `wallview.ts` (`planWallView`/`composeWallView`,
 * a 1:1 transcription of the COAB draw routines). Everything below is exact.
 *
 * The pipeline for one wall surface:
 *   GEO wall slot (1..15) ─wallSlotRouting─► { wallset 0..2, slice 0..4 }
 *   piece (Far/Mid/Near × front/side) ─PIECES─► run of (rowCount×colCount) tiles
 *   WALLDEF Id(slice, idxOffset+i) ─+setOffset reloc─► tile id
 *   tile id ─routeTileId─► { set 0..4, index } into the matching 8X8D tile pool
 *   blit at pixel ((colX+3)*8, (rowY+3)*8), clipped to the 168×168 viewport
 */

/** The dungeon viewport clip box (EGA): x∈[8,176), y∈[8,176) = 168×168 px. */
export const WALL_VIEWPORT = { x0: 8, y0: 8, x1: 176, y1: 176 } as const;
/** One 8×8 tile, chunky-4bpp. */
export const WALL_TILE_PX = 8;

/** Put8x8Symbol set bases: id − fix[set] = tile index within that 8X8D set. */
export const SYMBOL_SET_FIX = [0x01, 0x2e, 0x74, 0xba, 0x100] as const;

/**
 * The 10 on-screen wall pieces (pieceIdx 0..9). `idxOffset` = start column in the 156-wide
 * WALLDEF pool; `cols`/`rows` = tile rectangle; `colBase`/`rowBase` = draw-grid anchor
 * (the centre-most fan instance — §3.2). Run lengths sum to 156 (asserted in tests).
 */
export interface WallPiece {
  /** Far/Mid/Near depth this piece belongs to. */
  depth: 'far' | 'mid' | 'near';
  /** Which wall surface relative to the viewer. */
  surface: 'front' | 'left' | 'right' | 'cap';
  idxOffset: number;
  cols: number;
  rows: number;
  colBase: number;
  rowBase: number;
}

// VERBATIM from ovr031.cs (research §3.1). Order = pieceIdx 0..9.
export const PIECES: readonly WallPiece[] = [
  { depth: 'far', surface: 'front', idxOffset: 0, cols: 1, rows: 2, colBase: 5, rowBase: 4 },
  { depth: 'far', surface: 'left', idxOffset: 2, cols: 1, rows: 4, colBase: 4, rowBase: 3 },
  { depth: 'far', surface: 'right', idxOffset: 6, cols: 1, rows: 4, colBase: 6, rowBase: 3 },
  { depth: 'mid', surface: 'front', idxOffset: 10, cols: 3, rows: 4, colBase: 4, rowBase: 3 },
  { depth: 'mid', surface: 'left', idxOffset: 22, cols: 2, rows: 8, colBase: 2, rowBase: 1 },
  { depth: 'mid', surface: 'right', idxOffset: 38, cols: 2, rows: 8, colBase: 7, rowBase: 1 },
  { depth: 'near', surface: 'front', idxOffset: 54, cols: 7, rows: 8, colBase: 2, rowBase: 1 },
  { depth: 'near', surface: 'left', idxOffset: 110, cols: 2, rows: 11, colBase: 0, rowBase: 0 },
  { depth: 'near', surface: 'right', idxOffset: 132, cols: 2, rows: 11, colBase: 9, rowBase: 0 },
  { depth: 'far', surface: 'cap', idxOffset: 154, cols: 1, rows: 2, colBase: 5, rowBase: 4 },
] as const;

/** Total columns in the WALLDEF pool the pieces partition (must be 156). */
export const WALL_POOL_COLUMNS = 156;

/**
 * Map a GEO wall slot (1..15) to which WALLDEF symbol set (0..2) and variant slice (0..4)
 * draw it. Returns null for slot 0 (open edge — nothing drawn).
 * `wallset = (slot-1)/5`, `slice = (slot-1)%5` (§2, verbatim).
 */
export function wallSlotRouting(slot: number): { wallset: number; slice: number } | null {
  const s = slot & 0x0f;
  if (s === 0) return null;
  return { wallset: Math.floor((s - 1) / 5), slice: (s - 1) % 5 };
}

/**
 * Route an (already relocated) WALLDEF tile id to a loaded 8X8D set and tile index, exactly
 * as Put8x8Symbol does (§6.2): set by id range, index = id − fix[set].
 */
export function routeTileId(id: number): { set: number; index: number } {
  const set = id <= 0x2d ? 0 : id <= 0x73 ? 1 : id <= 0xb9 ? 2 : id <= 0xff ? 3 : 4;
  return { set, index: id - SYMBOL_SET_FIX[set] };
}

/** The pre-clip pixel rectangle of a piece anchored at draw-grid (colStart,rowStart). */
export function pieceRect(
  pieceIdx: number,
  colStart: number,
  rowStart: number,
): { x: number; y: number; w: number; h: number } {
  const p = PIECES[pieceIdx];
  return {
    x: (colStart + 3) * WALL_TILE_PX,
    y: (rowStart + 3) * WALL_TILE_PX,
    w: p.cols * WALL_TILE_PX,
    h: p.rows * WALL_TILE_PX,
  };
}

/** One 8×8 tile to blit: which 8X8D set + index, and where (top-left pixel, pre-clip). */
export interface WallTileBlit {
  /** Originating WALLDEF symbol set (0..2); needed by Gateway's per-wallset combined banks. */
  wallset?: number;
  /** 8X8D set 0..4 (routeTileId). */
  set: number;
  /** Tile index within that set. */
  index: number;
  /** Relocated WALLDEF tile id (for diagnostics). */
  tileId: number;
  /** Draw-grid cell (for diagnostics / clip checks). */
  colX: number;
  rowY: number;
  /** Top-left pixel anchor in the 320×200 frame (pre-clip). */
  px: number;
  py: number;
}

/**
 * Expand one wall surface into its run of 8×8 tile blits (§4, verbatim `draw_3D_8x8_titles`).
 *
 * @param pieceIdx   which of the 10 PIECES (chosen by the Far/Mid/Near caller)
 * @param slot       the GEO wall slot 1..15 (0 = open → no blits)
 * @param colStart   draw-grid column anchor (piece colBase + per-fan lateral shift)
 * @param rowStart   draw-grid row anchor (piece rowBase)
 * @param readId     WALLDEF table reader: (wallset, slice, poolColumn) → relocated tile id
 *                   (the caller pre-applies the per-set `.Offset` relocation, or uses
 *                   walldefTileIndex). Return ≤0 for "no tile".
 */
export function expandWallPiece(
  pieceIdx: number,
  slot: number,
  colStart: number,
  rowStart: number,
  readId: (wallset: number, slice: number, poolColumn: number) => number,
): WallTileBlit[] {
  const route = wallSlotRouting(slot);
  if (!route) return [];
  const p = PIECES[pieceIdx];
  const out: WallTileBlit[] = [];
  let col = p.idxOffset;
  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++, col++) {
      const colX = colStart + c;
      const rowY = rowStart + r;
      if (rowY < 0 || rowY > 10 || colX < 0 || colX > 10) continue;
      const tileId = readId(route.wallset, route.slice, col);
      if (tileId <= 0) continue;
      const { set, index } = routeTileId(tileId);
      out.push({
        wallset: route.wallset,
        set,
        index,
        tileId,
        colX,
        rowY,
        px: (colX + 3) * WALL_TILE_PX,
        py: (rowY + 3) * WALL_TILE_PX,
      });
    }
  }
  return out;
}
