/**
 * Dungeon wall-set loading — DOS Champions of Krynn (older Gold Box) (M1.S5c).
 *
 * Clean-room transcription of COAB `LoadWalldef` (ovr031.cs:642) + `Load8x8D` boot wiring
 * (seg001.cs:309-310) — see docs/engine/research/firstperson-wall-walk-cok.md §3 (CONFIRMED).
 * No COAB code copied. Turns the three per-dungeon WALLDEF block ids (the ECL `Pieces` opcode
 * operands for symbol sets 1/2/3) into:
 *   - the relocated WALLDEF tables (one per wallset 0..2) and a `readId` for `composeWallView`,
 *   - the five `routeTileId` 8X8D tile sets (0/4 = game-global boot tiles, 1/2/3 = per-dungeon).
 *
 * `.Offset` relocation (WallDefBlock.Offset): every WALLDEF entry `>= 0x2D` is shifted by
 * `varA = SYMBOL_SET_FIX[s] - SYMBOL_SET_FIX[1]` (= 0 / 0x46 / 0x8C for set 1/2/3), byte-wrapped,
 * so the relocated id lands in that set's `routeTileId` range. A single WALLDEF block holding
 * `k` records fills `k` consecutive slots, all relocated by the CALL's set offset (the §3.2
 * nuance) — and pairs with 8X8D block `B` (k=1) or `B*10+1 … B*10+k` (k>1).
 */
import type { IndexedImage, TileSet } from '../model/index.js';
import { decodeWalldefBlock, WALLDEF_TILE_MIN } from '../loaders/walldef.js';
import { decode8x8dBlock } from '../loaders/tiles8x8.js';
import { SYMBOL_SET_FIX, routeTileId, type WallTileBlit } from './wallpieces.js';

/** Default tile decode: the DOS 8X8D plane-order strip (unchanged default behavior). */
function decodeDosTileBlock(raw: Uint8Array, label: string): TileSet {
  return decode8x8dBlock(raw, label, { transparentMagenta: true });
}

/** Pieces-opcode sentinel: "leave this symbol set empty" (COAB `Reset`). */
export const WALLDEF_RESET = 0xff;
/**
 * Pieces-opcode sentinel: "default/blank wall set" → load WALLDEF block 0. COAB's CoK dispatch only
 * checks it on set 1 (`var_3 == 0x7F → LoadWalldef(1, 0)`) because no CoK area uses it elsewhere, but
 * **Death Knights of Krynn passes it on set 3** (e.g. GEO 34 pieces `[1, 0xFF, 0x7F]`). It is a
 * sentinel value, never a literal block id, so we honour it on any set; if the default block 0 isn't
 * present (DoK's WALLDEF1 ships only block 1), the set is simply left empty rather than failing.
 */
export const WALLDEF_DEFAULT_SET1 = 0x7f;
/** Boot 8X8D block for routeTileId set 0 (low fixed/border tiles). */
export const BOOT_8X8D_SET0 = 0xcb;
/** Boot 8X8D block for routeTileId set 4 (high fixed/special tiles). */
export const BOOT_8X8D_SET4 = 0xca;

/** One symbol set's relocated WALLDEF table: 5 depth slices × 156 pool columns of tile ids. */
export interface RelocatedWalldef {
  /** `slices[slice][poolColumn]` = relocated tile id (0 = no tile, 0x01 = border). */
  slices: Uint8Array[];
}

/** Sources for the per-area WALLDEF / 8X8D DAX blocks (already DAX-decompressed). */
export interface DungeonWallSources {
  /** Decompressed `WALLDEF{area}.DAX` block by id, or null if absent. */
  walldefBlock(blockId: number): Uint8Array | null;
  /** Decompressed `8X8D{area}.DAX` block by id, or null if absent. */
  tileBlock(blockId: number): Uint8Array | null;
  /**
   * Decode one raw tile block's bytes into a `TileSet` — defaults to the DOS 8X8D plane-order
   * decoder. A caller can swap in the Amiga 8X8D decoder (`decodeDaaTileStrip`) here to build an
   * Amiga-art `DungeonWalls` for the SAME dungeon: WALLDEF's routing (which tile-catalog slot
   * fills which pool position) is shared game-logic data across platforms — only the pixel art
   * differs — and the Amiga `.DAA` 8X8D archive uses the SAME sparse block ids as its DOS `.DAX`
   * counterpart (see `daa.ts`'s `DaaBlock.blockId` doc comment), so `tileBlock` can source Amiga
   * raw bytes by the exact ids this module already computes.
   */
  decodeTileBlock?(raw: Uint8Array, label: string): TileSet;
  /**
   * Supply an already-decoded tile bank for `blockId`, bypassing `tileBlock` + `decodeTileBlock`
   * entirely. Takes precedence when it returns non-null; returning null falls through to the raw
   * path, so a source can mix the two.
   *
   * This exists because the raw-bytes contract above assumes a container that hands out one
   * self-contained compressed bank per block id — true of DOS `.DAX` and Amiga `.DAA`, but NOT of
   * the Amiga GLIB `.TLB` masters used by the DataLib-era ports (Pools of Darkness, Gateway,
   * Treasures, DQK). A GLIB master's per-set members are only meaningful in the context of the
   * master's own header and colour tables, so slicing one out and decoding it standalone would be
   * a fiction. The honest adapter decodes the master once and answers by set.
   *
   * The cross-platform premise the `decodeTileBlock` comment states for `.DAA` was measured for
   * GLIB before this hook was added: Pools of Darkness's Amiga `WALLDEF.GLB` records are
   * BYTE-IDENTICAL to its DOS `WALLDEF1.DAX` blocks (6 records, 2340 bytes each), under the same
   * id table (1..6), against tile banks of the same 256 x 8x8 shape on both platforms. Wall
   * geometry really is shared game-logic data there; only the pixel art differs.
   */
  tileSetForBlock?(blockId: number, label: string): TileSet | null;
  /**
   * NWN's WALLDEF records already name tiles relative to the 8X8D bank paired with that WALLDEF
   * block. Unlike CoK, do not relocate ids by symbol-set position; ids >= 0x2e resolve from the
   * originating wallset's bank (while the low boot ids still use set 0).
   */
  directWallsetTileIds?: boolean;
}

/** The loaded dungeon wall assets, ready to drive `composeWallView`. */
export interface DungeonWalls {
  /** Relocated WALLDEF tables by wallset 0..2 (null = set Reset/empty). */
  walldefBlocks: (RelocatedWalldef | null)[];
  /** Decoded 8X8D tile pools by routeTileId set 0..4 (null = not loaded). */
  tileSets: (TileSet | null)[];
  /**
   * DoK packing: a single 256-tile 8X8D bank shared by all three symbol sets (null for CoK, which
   * uses a separate per-set block). When present, wall blits (sets 1..3) resolve by the **global**
   * relocated tile id into this bank rather than by per-set index.
   */
  singleBank: TileSet | null;
  /** Gateway packing: one 210-tile combined bank per WALLDEF symbol set. */
  combinedBanks: (TileSet | null)[];
  /** WALLDEF reader for `composeWallView`: relocated id at (wallset, slice, poolColumn). */
  readId(wallset: number, slice: number, poolColumn: number): number;
  /** Resolve a `composeWallView` blit to its 8×8 tile image (null if the set/index is absent). */
  lookupTile(blit: Pick<WallTileBlit, 'set' | 'index' | 'tileId' | 'wallset'>): IndexedImage | null;
  /** Exact originating block/local tile before WALLDEF relocation. Missing for synthetic banks. */
  tileOrigin?(image: IndexedImage): { blockId: number; tileIndex: number; raw: Uint8Array } | null;
}

/** Relocate one WALLDEF record's five slices by `varA` (ids >= 0x2D shift, byte-wrapped). */
function relocateRecord(slices: Uint8Array[], varA: number): RelocatedWalldef {
  const out = slices.map((row) => {
    const r = new Uint8Array(row.length);
    for (let i = 0; i < row.length; i++) {
      const v = row[i];
      r[i] = v >= WALLDEF_TILE_MIN ? (v + varA) & 0xff : v;
    }
    return r;
  });
  return { slices: out };
}

/**
 * Replicate `LoadWalldef` for symbol sets 1/2/3 given their WALLDEF block ids (from the ECL
 * `Pieces` opcode: `setBlockIds[0..2]` → sets 1/2/3). `0xFF` leaves a set empty; `0x7F` on set
 * 1 loads block 0. Loads the game-global boot tile sets 0 (8X8D 0xCB) and 4 (8X8D 0xCA) once.
 *
 * Throws if a non-empty set names a WALLDEF block the sources can't supply, or if a block's
 * record count would overflow past set 3 (`k + s > 4`, COAB's FATAL guard).
 */
export function loadDungeonWalls(
  setBlockIds: readonly [number, number, number],
  sources: DungeonWallSources,
): DungeonWalls {
  const walldefBlocks: (RelocatedWalldef | null)[] = [null, null, null];
  const tileSets: (TileSet | null)[] = [null, null, null, null, null];
  let singleBank: TileSet | null = null;
  const combinedBanks: (TileSet | null)[] = [null, null, null];
  const origins = new WeakMap<IndexedImage, { blockId: number; tileIndex: number; raw: Uint8Array }>();

  const decodeTile = sources.decodeTileBlock ?? decodeDosTileBlock;
  const loadTiles = (blockId: number, label: string): TileSet | null => {
    const direct = sources.tileSetForBlock?.(blockId, label);
    if (direct) return direct;
    const raw = sources.tileBlock(blockId);
    if (!raw) return null;
    // First-person walls overlay sparse stone detail over a magenta key (OverlayUnbounded).
    try {
      const bank = decodeTile(raw, label);
      bank.tiles.forEach((image, tileIndex) => origins.set(image, { blockId, tileIndex, raw }));
      return bank;
    } catch {
      // A present-but-undecodable tile block is a genuinely new/unrecognized 8X8D sub-format
      // (2026-07-19: Treasures of the Savage Frontier's own `8X8D1.DAX` — large uniform-length
      // blocks that fail the standard plane-strip sniff, not yet reverse-engineered). Degrade to
      // "no art for this tile set" rather than hard-failing the whole dungeon load: the map/ECL
      // logic + the "walk any area" picker still work, wall pixel art is honestly just absent for
      // that title until the format is solved. Every currently-supported title's 8X8D blocks decode
      // cleanly, so this catch path is inert for them — zero behavior change on the happy path. (No
      // console here: the pure `engine` package's tsconfig has no DOM/Node lib; callers that want a
      // dev-time warning can wrap `decodeTileBlock` themselves.)
      return null;
    }
  };

  // Boot tiles: set 0 (low/border) and set 4 (high/special) are game-global, loaded once.
  tileSets[0] = loadTiles(BOOT_8X8D_SET0, '8X8D:set0');
  tileSets[4] = loadTiles(BOOT_8X8D_SET4, '8X8D:set4');

  for (let s = 1; s <= 3; s++) {
    const operand = setBlockIds[s - 1];
    if (operand === WALLDEF_RESET) continue; // empty set
    // 0x7F = the default/blank wall set on any symbol set → WALLDEF block 0 (sentinel, not a block id).
    const isDefaultSet = operand === WALLDEF_DEFAULT_SET1;
    const blockId = isDefaultSet ? 0 : operand;

    const raw = sources.walldefBlock(blockId);
    if (!raw) {
      // A default-set sentinel with no block 0 available (DoK's WALLDEF1 ships only block 1) just
      // leaves the set empty; a missing *real* block id is still a genuine, fatal load error.
      if (isDefaultSet) continue;
      throw new Error(`loadDungeonWalls: WALLDEF block ${blockId} (set ${s}) not found`);
    }
    const { records } = decodeWalldefBlock(raw);
    const k = records.length;
    if (k + s > 4) {
      throw new Error(
        `loadDungeonWalls: WALLDEF block ${blockId} has ${k} records; set ${s} + ${k} overflows past set 3`,
      );
    }

    // A multi-record WALLDEF block has two tile packings. CoK splits its k wall sets across small
    // per-record 8X8D blocks (`blockId*10+i+1`). Death Knights of Krynn instead packs all three
    // sets into a SINGLE 256-tile 8X8D bank at `blockId` and selects each set's sub-range by the
    // relocation offset. Detect DoK by: per-record block absent but a large bank at `blockId`.
    const usesSingleBank =
      k > 1 && !sources.tileBlock(blockId * 10 + 1) && (() => {
        const bank = loadTiles(blockId, `8X8D:bank${blockId}`);
        if (bank && bank.tiles.length >= 128) {
          singleBank = bank;
          return true;
        }
        return false;
      })();

    // CoK: every record is local to a symbol set and relocated by the CALL's set offset (COAB
    // §3.2). DoK's single 256-tile bank is different: all three WALLDEF records already store
    // zero-based GLOBAL bank indices (confirmed against the native demo framebuffer), so applying
    // CoK's 0x46/0x8C offsets corrupts records 2/3.
    const callVarA = sources.directWallsetTileIds ? 0 : SYMBOL_SET_FIX[s] - SYMBOL_SET_FIX[1];

    for (let i = 0; i < k; i++) {
      const slot = s + i; // 1-based symbol set 1..3
      if (slot < 1 || slot > 3) continue;
      const varA = usesSingleBank ? 0 : callVarA;
      walldefBlocks[slot - 1] = relocateRecord(records[i].slices, varA);
      if (usesSingleBank) {
        tileSets[slot] = singleBank; // all sets share the one bank; lookup is by global id
      } else {
        const tile8x8Id = k > 1 ? blockId * 10 + i + 1 : blockId;
        const loaded = loadTiles(tile8x8Id, `8X8D:set${slot}`);
        tileSets[slot] = loaded;
        // Gateway stores all three 70-tile routing ranges in each ECL-selected 210-tile bank.
        // A relocated id that crosses into range 2/3 must remain in this originating archive;
        // index it from the first ordinary symbol base (0x2e), not switch to another ECL set.
        // Gateway's 210-tile banks combine all three generic symbol ranges. NWN also has large
        // direct per-WALLDEF banks (210/255 tiles), but its low ids 1..45 are boot tiles; treating
        // those banks as Gateway combined ranges makes `tileId - 46` negative and drops the blit.
        if (!sources.directWallsetTileIds && k === 1 && loaded && loaded.tiles.length >= 3 * 70) {
          combinedBanks[slot - 1] = loaded;
        }
      }
    }
  }

  const readId = (wallset: number, slice: number, poolColumn: number): number => {
    const blk = walldefBlocks[wallset];
    if (!blk) return 0;
    const row = blk.slices[slice];
    if (!row || poolColumn < 0 || poolColumn >= row.length) return 0;
    return row[poolColumn];
  };

  const lookupTile = (blit: Pick<WallTileBlit, 'set' | 'index' | 'tileId' | 'wallset'>): IndexedImage | null => {
    // Neverwinter Nights' WALLDEF values are already local offsets in the WALLDEF block's paired
    // 8X8D bank. CoK's relocation would make a set-2 tile select set 3, producing garbled walls.
    if (sources.directWallsetTileIds && blit.tileId >= SYMBOL_SET_FIX[1] && blit.wallset !== undefined) {
      const bank = tileSets[blit.wallset + 1];
      const index = blit.tileId - SYMBOL_SET_FIX[1];
      return bank && index >= 0 && index < bank.tiles.length ? bank.tiles[index] : null;
    }
    // DoK single-bank: WALLDEF values are already zero-based GLOBAL bank indices. This deliberately
    // differs from CoK's one-based Put8x8Symbol ids (`id - SYMBOL_SET_FIX[set]`). Native demo pose
    // (5,15,N) proves raw value 55 selects bank tile 55, not tile 54.
    // The bank owns the complete 0..255 id space, including low ids that CoK's generic
    // `routeTileId` labels set 0 and high ids it labels set 4. Falling through for those ids would
    // incorrectly fetch boot/UI tiles (the missing DoK sky, floor, and gate pieces in the demo).
    if (singleBank) {
      const gi = blit.tileId;
      return gi >= 0 && gi < singleBank.tiles.length ? singleBank.tiles[gi] : null;
    }
    const combined = blit.wallset === undefined ? null : combinedBanks[blit.wallset];
    if (combined) {
      const index = blit.tileId - SYMBOL_SET_FIX[1];
      return index >= 0 && index < combined.tiles.length ? combined.tiles[index] : null;
    }
    const ts = tileSets[blit.set];
    if (!ts || blit.index < 0 || blit.index >= ts.tiles.length) return null;
    return ts.tiles[blit.index];
  };

  return { walldefBlocks, tileSets, singleBank, combinedBanks, readId, lookupTile,
    tileOrigin: (image) => origins.get(image) ?? null };
}

/** Re-export routeTileId so callers can resolve ids without importing wallpieces directly. */
export { routeTileId };
