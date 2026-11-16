/**
 * WALLDEF loader — Champions/Death Knights of Krynn first-person wall-symbol tables.
 *
 * A `WALLDEF*.DAX` block is NOT graphics (see docs/engine/research/dax-complex-subframe.md
 * §C). After the standard DAX container RLE is undone, each block is one or more fixed
 * **780-byte records**, and each record is a `byte[5][156]` grid of **8×8-tile IDs**: 5
 * depth "slices" of the first-person corridor × 156 wall positions within a slice. The
 * actual tile pixels live in the matching `8X8D*.DAX` (decoded elsewhere as tile strips);
 * WALLDEF only says which tile goes where.
 *
 * Tile-ID convention (COAB `WallDefBlock.Offset`): entries `< 0x2D` (45) are reserved —
 * `0x00` = "no tile", `0x01` = border/edge symbol — and entries `>= 0x2D` are real tile
 * indices that the engine relocates into the shared 8×8 tile pool by adding a base offset.
 * This loader decodes the raw table faithfully and exposes a helper to resolve an entry to
 * a tile index given that base; the on-screen placement geometry (which column maps to
 * which screen rectangle) is a separate concern — see
 * docs/engine/research/firstperson-wall-geometry-cok.md.
 */

/** Bytes per WALLDEF record: 5 depth slices × 156 wall positions. */
export const WALLDEF_RECORD_SIZE = 780;
/** Number of depth slices per record (index 0 = one corridor depth … 4 = another). */
export const WALLDEF_SLICES = 5;
/** Wall positions per slice. */
export const WALLDEF_COLUMNS = 156;
/** Entries below this are reserved (0 = none, 1 = border); at/above are real tile IDs. */
export const WALLDEF_TILE_MIN = 0x2d;

/** A reserved/special WALLDEF entry. */
export type WalldefEntryKind = 'none' | 'border' | 'tile';

/** One decoded WALLDEF record: 5 slices, each a 156-entry row of tile-ID bytes. */
export interface WalldefRecord {
  /** `slices[s][c]` = the raw tile-ID byte at depth slice `s`, wall position `c`. */
  slices: Uint8Array[];
}

export interface WalldefBlockDecode {
  /** All records in the block (block length / 780). */
  records: WalldefRecord[];
}

/** Classify a raw WALLDEF entry byte. */
export function walldefEntryKind(value: number): WalldefEntryKind {
  if (value === 0x00) return 'none';
  if (value < WALLDEF_TILE_MIN) return 'border';
  return 'tile';
}

/**
 * Resolve a raw WALLDEF entry to a tile index in the 8×8 pool, or null for reserved
 * entries (none/border). `base` is the per-block relocation offset the engine adds to real
 * tile IDs (COAB `WallDefBlock.Offset`; defaults to 0 = use the ID as-is).
 */
export function walldefTileIndex(value: number, base = 0): number | null {
  return value >= WALLDEF_TILE_MIN ? value + base : null;
}

/**
 * Decode a decompressed WALLDEF block (raw bytes from `readDaxDataBlocks`) into its
 * 780-byte records. Throws if the length is not a positive multiple of 780.
 */
export function decodeWalldefBlock(raw: Uint8Array): WalldefBlockDecode {
  if (raw.length === 0 || raw.length % WALLDEF_RECORD_SIZE !== 0) {
    throw new Error(
      `WALLDEF: block length ${raw.length} is not a positive multiple of ${WALLDEF_RECORD_SIZE}`,
    );
  }
  const count = raw.length / WALLDEF_RECORD_SIZE;
  const records: WalldefRecord[] = [];
  for (let r = 0; r < count; r++) {
    const recBase = r * WALLDEF_RECORD_SIZE;
    const slices: Uint8Array[] = [];
    for (let s = 0; s < WALLDEF_SLICES; s++) {
      const off = recBase + s * WALLDEF_COLUMNS;
      slices.push(raw.subarray(off, off + WALLDEF_COLUMNS));
    }
    records.push({ slices });
  }
  // Trim trailing all-zero records. Neverwinter Nights (DOS/AOL) pads every WALLDEF block to a
  // uniform 2340-byte (3-record) size regardless of how many symbol sets it actually supplies —
  // unlike CoK/DoK, whose block *length itself* varies with real record count. A fully-zero
  // record decodes to `walldefEntryKind === 'none'` at every one of its 780 entries, so it carries
  // no tile information; keeping it only inflates `records.length`, which is exactly what
  // `loadDungeonWalls`'s `k + s > 4` overflow guard (COAB's own FATAL check) uses to decide
  // whether a multi-record block spans past symbol set 3 — real NWN blocks referenced from
  // LOAD_PIECES operand 2 or 3 were tripping that guard purely from trailing padding, not from a
  // real 3-set span (cross-checked against `8X8D.DAX`, which maps art to each WALLDEF block id
  // directly/1:1, the `k===1` convention — never CoK's `blockId*10+i+1` multi-record split).
  // Never trims to zero records; a block that is entirely zero-filled keeps its one (empty) record
  // rather than becoming record-less. See docs/engine/research/neverwinter-nights-dos-eclinit.md.
  while (records.length > 1) {
    const last = records[records.length - 1];
    const isAllZero = last.slices.every((row) => row.every((v) => v === 0));
    if (!isAllZero) break;
    records.pop();
  }
  return { records };
}

/** True if a decompressed block length is a valid WALLDEF table size. */
export function sniffWalldef(raw: Uint8Array): boolean {
  return raw.length > 0 && raw.length % WALLDEF_RECORD_SIZE === 0;
}
