/**
 * CoK item loader (M2.S6 prerequisite). An `ITEM{n}.DAX` archive packs **63-byte item records**
 * (every block length is a multiple of 63; a block holds one or more items back-to-back). Unlike
 * the FRUA `item.dat` (18-byte, VOCAB-coded names), CoK stores a length-prefixed **plain-ASCII
 * name** then a stat block.
 *
 * Verified fields (decompressed record):
 *   0        u8   name length
 *   1..      ascii name (NUL-padded within the record)
 *   42       u8   base-type id — the standard-catalogue index (5 = vial, 6 = staff sling,
 *                 7 = sling, … 15) for stock gear; **0 = special / unique item** (named magic,
 *                 quest items, most potions/scrolls/wands/rings)
 *   46       u8   item-type id (`Item.type`) — the runtime identity tested by ECL `FIND_ITEM`
 *   57       u8   stack / quantity count (0 for non-stackables; e.g. "20 Arrow" = 20)
 *
 * Base weapon damage / armour AC are **not** stored per-record: they are keyed off the base-type
 * id (offset 42) into an engine base-item table (see docs/engine/research/cok-item-format.md). The
 * per-record magic/effect block (47–53, 58–62) is located but not fully pinned. The full 63-byte
 * record is kept on `raw` so those fields decode without a re-extract.
 *
 * **DoK note:** Death Knights of Krynn does NOT use this plain-ASCII 63-byte record. Its `ITEM0.DAX`
 * is a single packed binary table whose names are VOCAB-coded rather than stored inline. That format
 * is now reversed too — see {@link decodeDokItemArchive} below — so `decodeItemArchive` (the CoK
 * 63-byte reader) skips any block that is not an exact multiple of the CoK record size, returning
 * nothing (rather than junk) for the DoK table. See [[goldbox-dok-gen1-deltas]].
 */
import { readDaxDataBlocks } from './dax.js';

export const ITEM_RECORD_SIZE = 63;
const NAME_OFFSET = 1;
const BASE_TYPE_OFFSET = 42;
const ITEM_TYPE_OFFSET = 0x2e;
const COUNT_OFFSET = 57;

export interface ItemRecord {
  /** Index of this record within its archive (0-based, block then in-block order). */
  index: number;
  /** Sparse ITEM archive block id that supplied this record; -1 for a standalone decode. */
  archiveBlockId: number;
  /** Zero-based record index within {@link archiveBlockId}; -1 for a standalone decode. */
  blockItemIndex: number;
  name: string;
  /** Standard-catalogue type id; 0 = special/unique item. */
  baseTypeId: number;
  /** Runtime `Item.type` at 0x2e, used by ECL `FIND_ITEM` and `DESTROY_ITEMS`. */
  itemTypeId: number;
  /** Stack/quantity count for stackable items (ammo, vials); 0 for non-stackables. */
  count: number;
  /** The full 63-byte record (identity + count parsed; magic/effect block awaits pinning). */
  raw: Uint8Array;
}

function readName(raw: Uint8Array): string {
  const len = Math.min(raw[0] ?? 0, ITEM_RECORD_SIZE - NAME_OFFSET);
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = raw[NAME_OFFSET + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** Decode one 63-byte item record. */
export function decodeItemRecord(
  raw: Uint8Array,
  index = -1,
  archiveBlockId = -1,
  blockItemIndex = -1,
): ItemRecord {
  if (raw.length < ITEM_RECORD_SIZE) {
    throw new Error(`item: record too small (${raw.length} bytes, need ${ITEM_RECORD_SIZE})`);
  }
  return {
    index,
    archiveBlockId,
    blockItemIndex,
    name: readName(raw),
    baseTypeId: raw[BASE_TYPE_OFFSET],
    itemTypeId: raw[ITEM_TYPE_OFFSET],
    count: raw[COUNT_OFFSET],
    raw,
  };
}

/** A slice looks like an item record: ≥ 63 bytes with a sane name-length byte. */
export function sniffItemRecord(raw: Uint8Array): boolean {
  return raw.length >= ITEM_RECORD_SIZE && raw[0] >= 1 && raw[0] <= 40;
}

/**
 * Decode every item in an `ITEM{n}.DAX` archive. Each block is split into 63-byte records; a
 * record with an out-of-range name-length byte ends that block (trailing padding / non-items).
 */
export function decodeItemArchive(bytes: Uint8Array): ItemRecord[] {
  const out: ItemRecord[] = [];
  for (const block of readDaxDataBlocks(bytes)) {
    const raw = block.raw;
    // A CoK item block is always an exact multiple of the 63-byte record. A block that is not (e.g.
    // DoK's packed/VOCAB-coded ITEM0 table) is a different format — skip it rather than emit junk.
    if (raw.length === 0 || raw.length % ITEM_RECORD_SIZE !== 0) continue;
    for (let off = 0; off + ITEM_RECORD_SIZE <= raw.length; off += ITEM_RECORD_SIZE) {
      const rec = raw.subarray(off, off + ITEM_RECORD_SIZE);
      if (!sniffItemRecord(rec)) break;
      out.push(decodeItemRecord(rec, out.length, block.blockId, off / ITEM_RECORD_SIZE));
    }
  }
  return out;
}

/* ──────────────────────────── Death Knights of Krynn item table ──────────────────────────── */

/**
 * DoK item record size (B5). Death Knights of Krynn's `ITEM0.DAX` holds ONE block — a packed table
 * of **17-byte records** (verified: the block is exactly 96 × 17 = 1632 bytes, and the structural
 * `06 00 01` marker recurs every 17 bytes). The layout is the classic SSI item record (the FRUA
 * `item.dat` is the same fields plus one trailing always-zero byte = 18 bytes); DoK drops that byte:
 *
 *   0      u8    base-type pointer — indexes the engine base-item catalogue (weapon dmg / armour AC)
 *   1..3   u8×3  VOCAB-coded name, read high→low (byte3 = primary noun, byte2 = adjective, byte1 = …)
 *   4..5   u16   encumbrance (coins; 10 coins = 1 lb)
 *   6..7   u16   value / price
 *   8      u8    magic bonus (+N)
 *   9      u8    secondary code
 *   10     u8    ready flag (0/1)
 *   11     u8    identified mask (0 = fully identified; bits conceal name codes)
 *   12     u8    cursed flag
 *   13     u8    bundle count
 *   14     u8    charges (0 = permanent)
 *   15     u8    magical-effect code
 *   16     u8    special code (128 = special ability, etc.)
 *
 * Names stay VOCAB-coded (the DoK vocabulary is a separate table), so `nameCodes` carries the raw
 * codes and `baseTypeId` maps to a catalogue name for display. The 1632-byte table has 96 slots of
 * which ~91 are real items (the tail holds unused/garbage slots); {@link sniffDokItemRecord} gates
 * them. See [[goldbox-dok-gen1-deltas]] and docs/engine/research/cok-item-format.md.
 */
export const DOK_ITEM_RECORD_SIZE = 17;

export interface DokItemRecord {
  index: number;
  /** Base-type pointer (byte 0) → base-item catalogue id (damage / armour class). */
  baseTypeId: number;
  /** VOCAB name codes [primary noun (byte3), adjective (byte2), qualifier (byte1)]. */
  nameCodes: [number, number, number];
  /** Encumbrance in coins (u16 @4). */
  encumbrance: number;
  /** Value / price (u16 @6). */
  value: number;
  /** Magic bonus +N (byte 8). */
  magicBonus: number;
  /** Number of charges; 0 = permanent (byte 14). */
  charges: number;
  /** Item is currently readied/worn (byte 10). */
  ready: boolean;
  /** True when the item's name is fully identified (byte 11 == 0). */
  identified: boolean;
  /** Item is cursed (byte 12 != 0). */
  cursed: boolean;
  /** The full 17-byte record. */
  raw: Uint8Array;
}

/**
 * A 17-byte slice looks like a real DoK item: a sane base-type pointer, a small magic bonus, and a
 * boolean ready flag. This rejects the table's trailing unused slots (whose bytes are out of range)
 * without a hard-coded record count.
 */
export function sniffDokItemRecord(raw: Uint8Array): boolean {
  return (
    raw.length >= DOK_ITEM_RECORD_SIZE &&
    raw[0] >= 1 &&
    raw[0] <= 150 && // base-type pointer in catalogue range
    raw[8] <= 20 && // magic bonus is small (+0..+20)
    raw[10] <= 1 // ready flag is a boolean
  );
}

/** Decode one 17-byte DoK item record (no validity check — use {@link sniffDokItemRecord} first). */
export function decodeDokItemRecord(raw: Uint8Array, index = -1): DokItemRecord {
  if (raw.length < DOK_ITEM_RECORD_SIZE) {
    throw new Error(`dok item: record too small (${raw.length} bytes, need ${DOK_ITEM_RECORD_SIZE})`);
  }
  const u16 = (o: number) => raw[o] | (raw[o + 1] << 8);
  return {
    index,
    baseTypeId: raw[0],
    nameCodes: [raw[3], raw[2], raw[1]],
    encumbrance: u16(4),
    value: u16(6),
    magicBonus: raw[8],
    charges: raw[14],
    ready: raw[10] !== 0,
    identified: raw[11] === 0,
    cursed: raw[12] !== 0,
    raw: raw.slice(),
  };
}

/**
 * Decode the DoK `ITEM0.DAX` item table. Splits each 17-byte-multiple block into records and keeps
 * the leading run of valid ones (stops at the first slot that fails {@link sniffDokItemRecord} —
 * i.e. the unused tail). Non-17-multiple blocks (e.g. a CoK 63-byte archive) yield nothing.
 */
export function decodeDokItemArchive(bytes: Uint8Array): DokItemRecord[] {
  const out: DokItemRecord[] = [];
  for (const block of readDaxDataBlocks(bytes)) {
    const raw = block.raw;
    if (raw.length === 0 || raw.length % DOK_ITEM_RECORD_SIZE !== 0) continue;
    for (let off = 0; off + DOK_ITEM_RECORD_SIZE <= raw.length; off += DOK_ITEM_RECORD_SIZE) {
      const rec = raw.subarray(off, off + DOK_ITEM_RECORD_SIZE);
      if (!sniffDokItemRecord(rec)) break;
      out.push(decodeDokItemRecord(rec, out.length));
    }
  }
  return out;
}
