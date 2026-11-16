/**
 * Gen1 (CoK/DoK) item files → the DQK `DISK1/ITEM.DAT` + `DISK1/ITEMS.DAT` build overrides — the
 * packaging half of the ITEM content port (DoK M4 build-audit gap 1, `cok-content-port-plan.md` §9).
 *
 * The per-record port functions ({@link ./dqkItem.js portDokItemToDqk}, {@link ./cokItem.js
 * portCokItemToDqk}) were shipped and real-byte-tested long before this module, but the CLI build
 * driver (`tools/build-dqk-dir.mts`) never called them, so both rebuilds shipped DQK's OWN item files
 * verbatim (confirmed by hash in the audit). This module packs the ported records into the two
 * on-disk shapes the DQK engine reads, so the driver can pass them as `planDqkBuild` overrides.
 *
 * **On-disk shapes (verified against the real GOG release):**
 *
 *  - **`ITEM.DAT` — 254 slots × 17 bytes = 4,318 bytes.** The per-instance item table. The on-disk
 *    stride is the SAME 17 the port functions emit (corrected 2026-08-21 — see
 *    {@link DQK_ITEM_DAT_STRIDE}; this note previously described dropping an 18th byte that DQK's
 *    format does not have)
 *    (probe: decoding the real `DISK1/ITEM.DAT` at stride 17 yields 254/254 plausible named records —
 *    "Battle Axe", "Composite Short Bow", "Spiritual Long Sword", … — while stride 18 yields garbage
 *    after slot 0). {@link packDqkItemDat} therefore writes bytes 0..16 of each ported 18-byte record
 *    and zero-fills the remaining slots up to 254, emitting a file byte-length-identical to stock.
 *  - **`ITEMS.DAT` — 128 records × 16 bytes = 2,048 bytes.** The base-item catalogue
 *    ({@link ./dqkItem.js decodeDqkItemsCatalogue}). Both Gen1 games ship the same catalogue in their
 *    `ITEMS` file (CoK's and DoK's differ in only 2 of 2,048 table bytes), stored as a **2-byte
 *    prefix + the identical 128×16 record layout**. Verified by decoding `ITEMS`+2 with the DQK decoder and checking known
 *    AD&D stats through real item instances' base-type pointers: DoK "Long Sword" (base 18) → 1d8,
 *    "Mace" (8) → 1d6, "Dart" (5) → 1d3, "Scimitar" (13) → 1d8; CoK instances resolve through the
 *    same byte (COAB `type` @0x2e) — Long Sword→18→1d8, Broad Sword→17→2d4, Battle Axe→1→1d8,
 *    Dagger→4→1d4, Sling→28→1d4. {@link portGen1ItemsCatalogueToDqk} strips the 2-byte prefix and
 *    returns the 2,048-byte table — a loss-free, index-preserving carry, which is what keeps every
 *    ported instance's base-type pointer resolving to the SAME stats it did on the Gen1 engine
 *    (DQK's own catalogue differs in ~20 % of bytes, so shipping it un-overridden mis-stats items).
 *
 * **Index preservation.**
 *  - DoK: `ITEM0.DAX` is one global table (96 × 17-byte slots, the leading ~91 valid); the port walks
 *    it in order, so slot *i* of the emitted `ITEM.DAT` is DoK's item *i* byte-for-byte (the ported
 *    record's first 17 bytes ARE the DoK record — proven in `dqkItem.test.ts`). The garbage tail
 *    slots {@link ./item.js decodeDokItemArchive}'s sniff rejects become zero slots.
 *  - CoK: `ITEM{1..3}.DAX` are AREA-keyed archives (block id = area id, 1+ 63-byte records per
 *    block), not a global table. The port flattens them in disk → block → record order, which is
 *    deterministic and carries every record's identity/name (VOCAB-recoded) faithfully — but the
 *    CoK-ECL-operand → `ITEM.DAT`-slot correspondence on the DQK engine is NOT yet verified (it needs
 *    the M4 behavioral-fidelity run to observe how `DQK.EXE` resolves a Gen1 give-item operand).
 *    Documented honestly here rather than guessed at; the flat table is still strictly more faithful
 *    than shipping DQK's own unrelated item list.
 */
import { decodeItemArchive, decodeDokItemArchive } from './item.js';
import { portDokItemToDqk, DQK_BASE_ITEM_SIZE, DQK_ITEM_SIZE } from './dqkItem.js';
import { portCokItemToDqk } from './cokItem.js';

/**
 * On-disk bytes per `DISK1/ITEM.DAT` slot. **Identical to {@link DQK_ITEM_SIZE}**, and defined in
 * terms of it so the two cannot drift apart again.
 *
 * These were separate numbers until 2026-08-21 — 17 here and 18 there — because the record was
 * modelled on FRUA's 18-byte `item.dat` and this file compensated by dropping "the always-zero
 * byte 17" on write. The measurement that settles it was already recorded in
 * `docs/engine/research/cok-content-port-plan.md`: DQK's own `DISK1/ITEM.DAT` is 4,318 bytes =
 * 254 × 17 exactly and is not divisible by 18, while FRUA's is 4,572 = 254 × 18 and is not
 * divisible by 17. There is no 18th byte in DQK's record to drop, so the truncation below is now
 * a no-op rather than a correction.
 */
export const DQK_ITEM_DAT_STRIDE = DQK_ITEM_SIZE;
/** Slots in the real `DISK1/ITEM.DAT` (254 × 17 = 4,318 bytes, the stock file's exact size). */
export const DQK_ITEM_DAT_SLOTS = 254;
/** Bytes of the unidentified prefix before the 128×16 catalogue in a Gen1 `ITEMS` file. */
export const GEN1_ITEMS_PREFIX = 2;
/** Byte length of the emitted `ITEMS.DAT` catalogue (128 × 16). */
export const DQK_ITEMS_DAT_SIZE = 128 * DQK_BASE_ITEM_SIZE;

/**
 * Pack ported `item.dat` records into the on-disk `ITEM.DAT` shape: {@link DQK_ITEM_DAT_STRIDE}
 * bytes per slot, zero-filled to {@link DQK_ITEM_DAT_SLOTS}
 * so the emitted file is byte-length-identical to the stock release's. Record order is slot order
 * (index-preserving). Throws if there are more records than slots (nothing to silently drop) or if a
 * record is shorter than 17 bytes.
 */
export function packDqkItemDat(records: readonly Uint8Array[]): Uint8Array {
  if (records.length > DQK_ITEM_DAT_SLOTS) {
    throw new Error(`packDqkItemDat: ${records.length} records exceed the ${DQK_ITEM_DAT_SLOTS}-slot ITEM.DAT table`);
  }
  const out = new Uint8Array(DQK_ITEM_DAT_SLOTS * DQK_ITEM_DAT_STRIDE);
  for (let i = 0; i < records.length; i++) {
    if (records[i].length < DQK_ITEM_DAT_STRIDE) {
      throw new Error(`packDqkItemDat: record ${i} too small (${records[i].length} bytes, need ${DQK_ITEM_DAT_STRIDE})`);
    }
    out.set(records[i].subarray(0, DQK_ITEM_DAT_STRIDE), i * DQK_ITEM_DAT_STRIDE);
  }
  return out;
}

/**
 * Strip a Gen1 `ITEMS` file's 2-byte prefix and return the 2,048-byte 128×16 base-item catalogue in
 * the exact shape of `DISK1/ITEMS.DAT` — the loss-free, index-preserving catalogue carry (see the
 * module doc for the real-byte verification). Throws if the file is not prefix + full catalogue.
 */
export function portGen1ItemsCatalogueToDqk(itemsFile: Uint8Array): Uint8Array {
  if (itemsFile.length < GEN1_ITEMS_PREFIX + DQK_ITEMS_DAT_SIZE) {
    throw new Error(
      `portGen1ItemsCatalogueToDqk: ITEMS file too small (${itemsFile.length} bytes, need ${GEN1_ITEMS_PREFIX + DQK_ITEMS_DAT_SIZE})`,
    );
  }
  return itemsFile.slice(GEN1_ITEMS_PREFIX, GEN1_ITEMS_PREFIX + DQK_ITEMS_DAT_SIZE);
}

/**
 * Build the `ITEM.DAT` override from DoK's global `ITEM0.DAX` item table: decode the leading run of
 * valid 17-byte records ({@link decodeDokItemArchive}), port each through the loss-free
 * {@link portDokItemToDqk}, and pack index-preserving — slot *i* is DoK item *i*, byte-for-byte.
 */
export function buildDokItemDat(item0Dax: Uint8Array): Uint8Array {
  return packDqkItemDat(decodeDokItemArchive(item0Dax).map((r) => portDokItemToDqk(r)));
}

/**
 * Build the `ITEM.DAT` override from CoK's area-keyed `ITEM{1..3}.DAX` archives: decode every 63-byte
 * record ({@link decodeItemArchive}) in disk → block → record order and port each through the
 * VOCAB-recoding {@link portCokItemToDqk}. See the module doc's index-preservation note for the
 * honest limit of the flat ordering (CoK ECL operand correspondence awaits the M4 run).
 */
export function buildCokItemDat(itemDaxes: readonly Uint8Array[]): Uint8Array {
  return packDqkItemDat(itemDaxes.flatMap((a) => decodeItemArchive(a).map((r) => portCokItemToDqk(r.raw))));
}

/** Inputs for {@link buildGen1ItemOverrides}: the source game's item archives + its `ITEMS` catalogue. */
export interface Gen1ItemSources {
  /** `ITEM{k}.DAX` archives in file order (DoK: the single `ITEM0.DAX`; CoK: `ITEM1..3.DAX`). */
  itemDaxes: Uint8Array[];
  /** The Gen1 `ITEMS` catalogue file (2-byte prefix + 128×16 records; CoK's and DoK's are near-identical). */
  itemsFile?: Uint8Array;
}

/**
 * Build the `planDqkBuild` overrides for both item files of a Gen1 target — the one call the CLI
 * build driver was missing (audit gap 1). Returns a record suitable for merging into
 * `DqkBuildOptions.overrides`: `ITEM.DAT` from the ported instance records ({@link buildDokItemDat} /
 * {@link buildCokItemDat} by target) and, when the `ITEMS` catalogue file is supplied, `ITEMS.DAT`
 * from the index-preserving catalogue carry. A `dqk` target gets no overrides (DQK ships its own).
 */
export function buildGen1ItemOverrides(
  target: 'cok' | 'dok' | 'dqk',
  sources: Gen1ItemSources,
): Record<string, Uint8Array> {
  if (target === 'dqk') return {};
  const out: Record<string, Uint8Array> = {};
  if (sources.itemDaxes.length > 0) {
    out['ITEM.DAT'] =
      target === 'dok' ? buildDokItemDat(sources.itemDaxes[0]) : buildCokItemDat(sources.itemDaxes);
  }
  if (sources.itemsFile) out['ITEMS.DAT'] = portGen1ItemsCatalogueToDqk(sources.itemsFile);
  return out;
}
