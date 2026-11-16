/**
 * FRUA global item source (`DISK1/ITEM.DAT` + `DISK1/ITEMS.DAT`).
 *
 * Hackdocs `ITEM.TXT` fixes the important indexing distinction: `ITEM.DAT` contains 254
 * 18-byte records numbered **1..254**, while `ITEMS.DAT` contains 128 16-byte base records
 * numbered **0..127**. Event item value 0 means none and 255 means a random mage scroll, so
 * neither value is an addressable `ITEM.DAT` record. The decoder keeps those rules explicit
 * instead of accepting a plausible-looking zero-based slice.
 *
 * Item names are assembled from bytes 3, 2, 1 through FRUA's own `VOCAB.TXT` table. This must
 * not reuse the DQK vocabulary: their numeric order differs (notably FRUA code 30 = `Arrow`).
 */

export const FRUA_ITEM_RECORD_SIZE = 18;
export const FRUA_ITEM_RECORD_COUNT = 254;
export const FRUA_ITEM_DAT_SIZE = FRUA_ITEM_RECORD_SIZE * FRUA_ITEM_RECORD_COUNT;

export const FRUA_BASE_ITEM_RECORD_SIZE = 16;
export const FRUA_BASE_ITEM_RECORD_COUNT = 128;
export const FRUA_ITEMS_DAT_SIZE = FRUA_BASE_ITEM_RECORD_SIZE * FRUA_BASE_ITEM_RECORD_COUNT;

/** FRUA `VOCAB.TXT`, indexed exactly by ITEM.DAT name-code byte. */
export const FRUA_ITEM_VOCAB: readonly string[] = [
  '', 'Battle Axe', 'Hand Axe', 'Club', 'Dagger', 'Dart', 'Hammer', 'Javelin', 'Mace',
  'Morning Star', 'Military Pick', 'Awl Pike', 'Bolt', 'Scimitar', 'Spear', 'Quarter Staff',
  'Bastard Sword', 'Broad Sword', 'Long Sword', 'Short Sword', 'Two-Handed Sword', 'Trident',
  'Composite Long Bow', 'Composite Short Bow', 'Long Bow', 'Short Bow', 'Fine',
  'Light Crossbow', 'Sling', 'Staff', 'Arrow', 'Leather', 'Ring', 'Scale', 'Chain', 'Banded',
  'Plate', 'Shield', 'Cleric', 'Scroll', 'Mage', 'Helm', 'Belt', 'Robe', 'Cloak', 'Boots',
  'Ring', 'Mail', 'Armor', 'Of Prot', 'Bracers', 'Wand', 'Elixir', 'Potion', 'Youth', 'Ruby',
  'Boulder', 'Dragon Breath', 'Displacement', 'Eyes', 'Drow', 'Elfin Chain', 'Ice Storm',
  'Sapphire', 'Emerald', 'Wizardry', "Hornet's Nest", 'Fire Resistance', 'Stone', 'Good Luck',
  'Flail', 'Halberd', 'Gauntlets', 'Periapt', 'Health', 'Cursed', 'Blessed', 'Bundle of',
  'Ogre Power', 'Girdle', 'Giant Strength', 'Mirror', 'Necklace', 'Dragon', 'vs Giants',
  'vorpal', 'cold resistance', 'Diamond', 'Lightning', 'Fireballs', 'of', 'Vulnerability',
  'Speed', 'Silver', 'Extra', 'Healing', 'Charming', 'Fear', 'Magic Missiles', 'Missiles',
  '1 Spell', '2 Spells', '3 Spells', 'Paralyzation', 'Invisibility', 'Cute Yellow Canary',
  'AC 10', 'AC 6', 'AC 4', 'AC 3', 'AC 2', '+1', '+2', '+3', '+4', '+5', '-1', '-2', '-3',
  'Electric Immunity', 'Gaze Resistance', 'Spiritual', 'Gem', 'Jewelry', 'blinking', 'from evil',
];

/** Base-record names explicitly allocated by hackdocs `ITEMS.TXT`; unlisted records stay unnamed. */
export const FRUA_BASE_ITEM_NAMES: Readonly<Partial<Record<number, string>>> = {
  0: 'No Item',
  1: 'Battle Axe', 2: 'Hand Axe', 3: 'Club', 4: 'Dagger', 5: 'Dart(s)', 6: 'Hammer',
  7: 'Javelin(s)', 8: 'Mace', 9: 'Morning Star', 10: 'Military Pick', 11: 'Awl Pike',
  12: 'Bolt(s)', 13: 'Scimitar', 14: 'Spear', 15: 'Quarter Staff', 16: 'Bastard Sword',
  17: 'Broad Sword', 18: 'Long Sword', 19: 'Short Sword', 20: 'Two Handed Sword', 21: 'Trident',
  22: 'Composite Long Bow', 23: 'Composite Short Bow', 24: 'Long Bow', 25: 'Short Bow',
  26: 'Fine Long Bow', 27: 'Light Crossbow', 28: 'Sling', 29: 'Staff Sling', 30: 'Arrow(s)',
  31: 'Leather Armor', 32: 'Ring Mail', 33: 'Scale Mail', 34: 'Chain Mail', 35: 'Banded Mail',
  36: 'Plate Mail', 37: 'Shield', 38: 'Scroll of Protection', 39: 'Scroll of Mage Spells',
  40: 'Scroll of Cleric Spells', 41: 'Helm', 42: 'Belt', 43: 'Robe', 44: 'Cloak', 45: 'Boots',
  46: 'Misc. Ring', 47: 'Special Item', 48: 'Mirror', 50: 'Bracers', 51: 'Wand',
  58: 'Cloak of Displacement', 59: 'Ring of Protection', 61: 'Elfin Chain', 62: 'Drow Chain',
  63: 'Drow Long Sword', 65: 'Ring of Wizardry', 66: "Dart of Hornet's Nest", 70: 'Flail',
  71: 'Halberd', 72: 'Gauntlets', 73: 'Scroll Bundle', 74: 'Blessed Bolt(s)',
  75: 'Cloak of Protection', 105: 'Vorpal Long Sword',
};

export interface FruaItemDamage {
  count: number;
  sides: number;
  bonus: number;
}

/** One zero-based 16-byte `ITEMS.DAT` base record. */
export interface FruaBaseItemRecord {
  id: number;
  /** Documented name for allocated records; absent for unallocated/unknown catalogue slots. */
  name?: string;
  carryLocation: number;
  handsRequired: number;
  damageVsLarge: FruaItemDamage;
  rateOfFire: number;
  protectionValue: number;
  weaponClass: number;
  /** Raw byte 8 (`0` usable in melee, `128` not usable). */
  meleeClass: number;
  meleeUsable: boolean;
  damageVsSmall: FruaItemDamage;
  range: number;
  classMask: number;
  missileType: number;
  reserved: number;
  raw: Uint8Array;
}

/** One one-based 18-byte `ITEM.DAT` item instance/definition. */
export interface FruaItemRecord {
  id: number;
  /** Byte 0, a zero-based pointer into `ITEMS.DAT`. */
  baseTypeId: number;
  /** Name codes in display order: byte 3, then byte 2, then byte 1. */
  nameCodes: [number, number, number];
  /** Fully identified name assembled through {@link FRUA_ITEM_VOCAB}. */
  name: string;
  /** Name after applying byte 11's concealment bits (1 hides byte3, 2 byte2, 4 byte1). */
  unidentifiedName: string;
  /** Encumbrance in coins (10 coins = 1 pound), little-endian u16 at bytes 4..5. */
  weightCoins: number;
  /** Price in platinum pieces, little-endian u16 at bytes 6..7. */
  valuePlatinum: number;
  magicBonus: number;
  secondaryCode: number;
  ready: boolean;
  identifyMask: number;
  cursed: boolean;
  bundleCount: number;
  charges: number;
  effectCode: number;
  specialCode: number;
  reserved: number;
  raw: Uint8Array;
}

export interface FruaResolvedItemRecord extends FruaItemRecord {
  base: FruaBaseItemRecord;
}

export interface FruaItemCatalogue {
  /** One-based ITEM.DAT id -> resolved item. */
  byId: Map<number, FruaResolvedItemRecord>;
  /** Zero-based ITEMS.DAT id -> base mechanics. */
  baseById: Map<number, FruaBaseItemRecord>;
}

function requireIntegerInRange(label: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`FRUA items: ${label} ${value} is outside ${min}..${max}`);
  }
}

function requireExactLength(label: string, bytes: Uint8Array, expected: number): void {
  if (bytes.length !== expected) {
    throw new Error(`FRUA ${label}: expected ${expected} bytes, got ${bytes.length}`);
  }
}

function u16(raw: Uint8Array, offset: number): number {
  return raw[offset] | (raw[offset + 1] << 8);
}

function damage(raw: Uint8Array, offset: number): FruaItemDamage {
  return { count: raw[offset], sides: raw[offset + 1], bonus: raw[offset + 2] };
}

/** Render display-order codes, optionally applying ITEM.DAT byte 11's concealment mask. */
export function fruaItemNameFromCodes(
  codes: readonly [number, number, number],
  concealMask = 0,
): string {
  requireIntegerInRange('identify mask', concealMask, 0, 0xff);
  return codes.flatMap((code, index) => {
    requireIntegerInRange(`name code ${index + 1}`, code, 0, FRUA_ITEM_VOCAB.length - 1);
    if (code === 0 || (concealMask & (1 << index)) !== 0) return [];
    return [FRUA_ITEM_VOCAB[code]];
  }).join(' ');
}

/** Decode one exact 16-byte, zero-based `ITEMS.DAT` record. */
export function decodeFruaBaseItemRecord(raw: Uint8Array, id: number): FruaBaseItemRecord {
  requireIntegerInRange('base item id', id, 0, FRUA_BASE_ITEM_RECORD_COUNT - 1);
  requireExactLength('ITEMS.DAT record', raw, FRUA_BASE_ITEM_RECORD_SIZE);
  const name = FRUA_BASE_ITEM_NAMES[id];
  return {
    id,
    ...(name === undefined ? {} : { name }),
    carryLocation: raw[0],
    handsRequired: raw[1],
    damageVsLarge: damage(raw, 2),
    rateOfFire: raw[5],
    protectionValue: raw[6],
    weaponClass: raw[7],
    meleeClass: raw[8],
    meleeUsable: raw[8] === 0,
    damageVsSmall: damage(raw, 9),
    range: raw[12],
    classMask: raw[13],
    missileType: raw[14],
    reserved: raw[15],
    raw: raw.slice(),
  };
}

/** Decode one exact 18-byte, one-based `ITEM.DAT` record. */
export function decodeFruaItemRecord(raw: Uint8Array, id: number): FruaItemRecord {
  requireIntegerInRange('item id', id, 1, FRUA_ITEM_RECORD_COUNT);
  requireExactLength('ITEM.DAT record', raw, FRUA_ITEM_RECORD_SIZE);
  const baseTypeId = raw[0];
  requireIntegerInRange('base item pointer', baseTypeId, 0, FRUA_BASE_ITEM_RECORD_COUNT - 1);
  const nameCodes: [number, number, number] = [raw[3], raw[2], raw[1]];
  // Validate all three even when concealed/zero, then derive both source-visible names.
  const name = fruaItemNameFromCodes(nameCodes);
  const identifyMask = raw[11];
  const unidentifiedName = fruaItemNameFromCodes(nameCodes, identifyMask);
  if (raw[17] !== 0) {
    throw new Error(`FRUA ITEM.DAT item ${id}: reserved byte 17 is ${raw[17]}, expected 0`);
  }
  return {
    id,
    baseTypeId,
    nameCodes,
    name,
    unidentifiedName,
    weightCoins: u16(raw, 4),
    valuePlatinum: u16(raw, 6),
    magicBonus: raw[8],
    secondaryCode: raw[9],
    ready: raw[10] !== 0,
    identifyMask,
    cursed: raw[12] !== 0,
    bundleCount: raw[13],
    charges: raw[14],
    effectCode: raw[15],
    specialCode: raw[16],
    reserved: raw[17],
    raw: raw.slice(),
  };
}

/** Decode the exact 128-record global base catalogue. Partial/trailing records are rejected. */
export function decodeFruaItemsDat(bytes: Uint8Array): Map<number, FruaBaseItemRecord> {
  requireExactLength('ITEMS.DAT', bytes, FRUA_ITEMS_DAT_SIZE);
  const byId = new Map<number, FruaBaseItemRecord>();
  for (let id = 0; id < FRUA_BASE_ITEM_RECORD_COUNT; id++) {
    const offset = id * FRUA_BASE_ITEM_RECORD_SIZE;
    byId.set(id, decodeFruaBaseItemRecord(bytes.subarray(offset, offset + FRUA_BASE_ITEM_RECORD_SIZE), id));
  }
  return byId;
}

/** Decode the exact 254-record global item table using its documented one-based id space. */
export function decodeFruaItemDat(bytes: Uint8Array): Map<number, FruaItemRecord> {
  requireExactLength('ITEM.DAT', bytes, FRUA_ITEM_DAT_SIZE);
  const byId = new Map<number, FruaItemRecord>();
  for (let id = 1; id <= FRUA_ITEM_RECORD_COUNT; id++) {
    const offset = (id - 1) * FRUA_ITEM_RECORD_SIZE;
    byId.set(id, decodeFruaItemRecord(bytes.subarray(offset, offset + FRUA_ITEM_RECORD_SIZE), id));
  }
  return byId;
}

/** Decode and join both selected-install sources without mutating either input. */
export function decodeFruaItemCatalogue(
  itemDat: Uint8Array,
  itemsDat: Uint8Array,
): FruaItemCatalogue {
  const baseById = decodeFruaItemsDat(itemsDat);
  const records = decodeFruaItemDat(itemDat);
  const byId = new Map<number, FruaResolvedItemRecord>();
  for (const [id, record] of records) {
    const base = baseById.get(record.baseTypeId);
    if (!base) {
      // The pointer was range-checked above; retain this guard against a future sparse catalogue.
      throw new Error(`FRUA ITEM.DAT item ${id}: missing ITEMS.DAT base record ${record.baseTypeId}`);
    }
    byId.set(id, { ...record, base });
  }
  return { byId, baseById };
}

/** Resolve an addressable ITEM.DAT id; 0 (none), 255 (random scroll), and missing ids reject. */
export function requireFruaItem(catalogue: FruaItemCatalogue, id: number): FruaResolvedItemRecord {
  requireIntegerInRange('item id', id, 1, FRUA_ITEM_RECORD_COUNT);
  const item = catalogue.byId.get(id);
  if (!item) throw new Error(`FRUA items: item id ${id} is missing from the catalogue`);
  return item;
}
