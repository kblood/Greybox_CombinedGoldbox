/**
 * DQK (Gen2) item format + the ITEM content port (E3.2b).
 *
 * DQK uses the **standard Gold Box two-file item model** (hackdocs ITEM.TXT / ITEMS.TXT), confirmed
 * byte-exact against the shipped `DISK1/ITEMS.DAT`:
 *
 *  - **`ITEMS.DAT` — the base-item catalogue** (`items.dat`): 128 records × **16 bytes**, indexed by an
 *    item instance's base-type pointer. Each record gives the carry slot, weapon damage dice (vs Large and
 *    vs Small/Medium), rate of fire, protection value (→ armour class), weapon/missile class and range.
 *    {@link decodeDqkBaseItem} / {@link decodeDqkItemsCatalogue} read it; verified on the real file
 *    (Battle Axe 1d8, Hand Axe 1d6 throwable, Dagger 1d4/1d3, Leather AC 8, Plate AC 3).
 *  - **`item.dat` — the per-instance item record**: 254 records × **17 bytes** (base-type pointer,
 *    3-byte VOCAB-coded name, encumbrance, price, magic bonus, charges, effect/special codes).
 *    {@link decodeDqkItemRecord} / {@link encodeDqkItemRecord} read & write it. This was documented
 *    as 18 bytes with an "always 0" byte 17 until 2026-08-21 — see {@link DQK_ITEM_SIZE} for the
 *    byte evidence that 18 is FRUA's stride, not DQK's.
 *
 * **The port (the E3 deliverable).** Death Knights of Krynn stores its items in **the same 17-byte
 * record** (see `loaders/item.ts` {@link DokItemRecord}), so porting a DoK item onto the DQK engine
 * is a straight 17-byte copy — loss-free with nothing appended. {@link portDokItemToDqk} does this
 * and the round-trip is proven on real `Death Knights of Krynn/ITEM0.DAX` bytes in
 * `dqkItem.test.ts`. The previous "append the zero byte" step was writing an 18th byte that DQK's
 * own file format does not have, which would have shifted every subsequent record in a written
 * `ITEM.DAT` by one byte per item.
 *
 * **Champions of Krynn note (deferred).** CoK's `ITEM{n}.DAX` uses a 63-byte *plain-ASCII-name* record
 * (not VOCAB-coded), so a CoK→DQK item port carries the base-type id + count cleanly but must re-encode
 * the free-form name into the DQK vocabulary — that name recoding needs the DQK VOCAB table and is its
 * own slice; the structural port here covers the DoK (VOCAB-coded) bestiary fully.
 */
import type { DamageDice } from './monster.js';
import type { DokItemRecord } from './item.js';

/** Bytes per base-item catalogue record (`items.dat`). */
export const DQK_BASE_ITEM_SIZE = 16;
/**
 * Bytes per per-instance item record (`item.dat`).
 *
 * **17, not 18** (corrected 2026-08-21). DQK's own shipped `DISK1/ITEM.DAT` is **4318 bytes =
 * 254 x 17 exactly**, and is not divisible by 18 (239.9). The 18 this held until now is the
 * **FRUA** figure: FRUA's `DISK1/ITEM.DAT` is 4572 bytes = **254 x 18** exactly, and is not
 * divisible by 17. Both games ship 254 records; only the stride differs, so a record count alone
 * cannot tell them apart — which is how the FRUA number reached the DQK reader. At stride 17
 * DQK's file is also structurally coherent: byte 16 reads `specialCode` as documented (224 records
 * 0 = "byte 15 is a spell", 22 records 128 = "special ability", 3 others in 129..133), and byte 10
 * (`ready`) is zero in all 254, as a fresh catalogue requires.
 */
export const DQK_ITEM_SIZE = 17;

/** One decoded `items.dat` base-item catalogue record (hackdocs ITEMS.TXT). */
export interface DqkBaseItem {
  index: number;
  /** Carry slot (0 = weapon hand, 1 = shield hand, 2 = body/armour, … 10 = ammo quiver). */
  carryLocation: number;
  /** Hands required to use. */
  handsRequired: number;
  /** Damage dice vs size Large (bytes 2–4). */
  damageVsLarge: DamageDice;
  /** Damage dice vs size Small/Medium (bytes 9–11). */
  damageVsSmall: DamageDice;
  /** Rate of fire per two rounds (byte 5). */
  rateOfFire: number;
  /** Raw protection value (byte 6); see {@link baseArmorClass} for the decoded AC. */
  protectionValue: number;
  /**
   * Base armour class for body armour / bracers (`188 − protectionValue`), or `null` for non-armour
   * (weapons, shields, misc). Verified: Leather (pv 180) → AC 8, Plate (pv 185) → AC 3.
   */
  baseArmorClass: number | null;
  /** Weapon class byte (0 = not a weapon, 1 = cutting, 128 = blunt). */
  weaponClass: number;
  /** True when usable in melee (byte 8 = 0); false when 128 (e.g. a dart). */
  meleeUsable: boolean;
  /** Range of the item (byte 12). */
  range: number;
  /** Class-usability bitmask (byte 13; one bit per class, as .cch offset 183). */
  classMask: number;
  /** Missile-type bitfield (byte 14; e.g. 4 = hand-held, 11 = bow, 138 = crossbow). */
  missileType: number;
  /** The full 16-byte record. */
  raw: Uint8Array;
}

function dice(raw: Uint8Array, base: number): DamageDice {
  return { count: raw[base], sides: raw[base + 1], bonus: raw[base + 2] };
}

/** Decode one 16-byte base-item catalogue record. `carryLocation === 2` (body) marks decodable armour AC. */
export function decodeDqkBaseItem(raw: Uint8Array, index = -1): DqkBaseItem {
  if (raw.length < DQK_BASE_ITEM_SIZE) {
    throw new Error(`dqk base item: record too small (${raw.length} bytes, need ${DQK_BASE_ITEM_SIZE})`);
  }
  const protectionValue = raw[6];
  // Body armour & bracers store 188 − baseAC; only decode AC for the body slot to avoid misreading a
  // shield's "+128 bonus" encoding or a weapon's zero as an absolute AC.
  const baseArmorClass = raw[0] === 2 && protectionValue >= 128 ? 188 - protectionValue : null;
  return {
    index,
    carryLocation: raw[0],
    handsRequired: raw[1],
    damageVsLarge: dice(raw, 2),
    rateOfFire: raw[5],
    protectionValue,
    baseArmorClass,
    weaponClass: raw[7],
    meleeUsable: raw[8] !== 128,
    damageVsSmall: dice(raw, 9),
    range: raw[12],
    classMask: raw[13],
    missileType: raw[14],
    raw: raw.slice(0, DQK_BASE_ITEM_SIZE),
  };
}

/** Decode the whole `ITEMS.DAT` base-item catalogue (128 fixed-size records). */
export function decodeDqkItemsCatalogue(bytes: Uint8Array): DqkBaseItem[] {
  const out: DqkBaseItem[] = [];
  for (let off = 0, i = 0; off + DQK_BASE_ITEM_SIZE <= bytes.length; off += DQK_BASE_ITEM_SIZE, i++) {
    out.push(decodeDqkBaseItem(bytes.subarray(off, off + DQK_BASE_ITEM_SIZE), i));
  }
  return out;
}

/** One decoded `item.dat` per-instance item record (18-byte; hackdocs ITEM.TXT). */
export interface DqkItemRecord {
  index: number;
  /** Base-type pointer into the `items.dat` catalogue (byte 0). */
  baseTypeId: number;
  /** VOCAB name codes `[byte3 (primary noun), byte2 (adjective), byte1 (qualifier)]`. */
  nameCodes: [number, number, number];
  /** Encumbrance in coins, u16 @4 (10 coins = 1 lb). */
  encumbrance: number;
  /** Price in platinum, u16 @6. */
  value: number;
  /** Magic bonus +N (byte 8). */
  magicBonus: number;
  /** Secondary code (byte 9). */
  secondaryCode: number;
  /** Item is currently readied/worn (byte 10). */
  ready: boolean;
  /** Name-concealment mask (byte 11; 0 = fully identified). */
  identifyMask: number;
  /** Item is cursed (byte 12). */
  cursed: boolean;
  /** Bundle count (byte 13; 0 = cannot be joined). */
  bundleCount: number;
  /** Charges; 0 = permanent (byte 14). */
  charges: number;
  /** Magical-effect / spell code (byte 15; interpreted via {@link specialCode}). */
  effectCode: number;
  /** Special code (byte 16; 0 = byte15 is a spell, 1–127 = scroll, 128 = special ability, …). */
  specialCode: number;
  /** The full 18-byte record. */
  raw: Uint8Array;
}

/** Decode one 17-byte `item.dat` record. */
export function decodeDqkItemRecord(raw: Uint8Array, index = -1): DqkItemRecord {
  if (raw.length < DQK_ITEM_SIZE) {
    throw new Error(`dqk item: record too small (${raw.length} bytes, need ${DQK_ITEM_SIZE})`);
  }
  const u16 = (o: number) => raw[o] | (raw[o + 1] << 8);
  return {
    index,
    baseTypeId: raw[0],
    nameCodes: [raw[3], raw[2], raw[1]],
    encumbrance: u16(4),
    value: u16(6),
    magicBonus: raw[8],
    secondaryCode: raw[9],
    ready: raw[10] !== 0,
    identifyMask: raw[11],
    cursed: raw[12] !== 0,
    bundleCount: raw[13],
    charges: raw[14],
    effectCode: raw[15],
    specialCode: raw[16],
    raw: raw.slice(0, DQK_ITEM_SIZE),
  };
}

/** Serialise a decoded item back to its 17-byte `item.dat` record. */
export function encodeDqkItemRecord(item: DqkItemRecord): Uint8Array {
  const out = new Uint8Array(DQK_ITEM_SIZE);
  out[0] = item.baseTypeId & 0xff;
  out[1] = item.nameCodes[2] & 0xff; // qualifier
  out[2] = item.nameCodes[1] & 0xff; // adjective
  out[3] = item.nameCodes[0] & 0xff; // primary noun
  out[4] = item.encumbrance & 0xff;
  out[5] = (item.encumbrance >> 8) & 0xff;
  out[6] = item.value & 0xff;
  out[7] = (item.value >> 8) & 0xff;
  out[8] = item.magicBonus & 0xff;
  out[9] = item.secondaryCode & 0xff;
  out[10] = item.ready ? 1 : 0;
  out[11] = item.identifyMask & 0xff;
  out[12] = item.cursed ? 1 : 0;
  out[13] = item.bundleCount & 0xff;
  out[14] = item.charges & 0xff;
  out[15] = item.effectCode & 0xff;
  out[16] = item.specialCode & 0xff;
  return out;
}

/**
 * Port a Death Knights of Krynn item record onto the DQK engine's `item.dat` record. The two are
 * **the same 17-byte record**, so the port is a straight copy — loss-free with nothing appended.
 * Returns the 17-byte record bytes (decode with {@link decodeDqkItemRecord}).
 */
export function portDokItemToDqk(dok: DokItemRecord): Uint8Array {
  const out = new Uint8Array(DQK_ITEM_SIZE);
  out.set(dok.raw.subarray(0, DQK_ITEM_SIZE), 0);
  return out;
}
