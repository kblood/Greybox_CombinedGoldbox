/**
 * Base-item catalogue (A4.1) — the engine-side table that supplies the combat stats CoK keeps in
 * its executable rather than per-record. Each `ITEM{n}.DAX` record stores only an item's identity
 * (name, base-type id at offset 42, stack count) and magic deltas; the base damage / armour-class /
 * two-handedness is keyed off the base-type id. See `docs/engine/research/cok-item-format.md`.
 *
 * Pinned CoK ids (HIGH confidence, from the research doc): 6 staff-sling, 7 sling, 8 arrow,
 * 9 short bow, 10 long sword, 11 quarter staff, 12 mace, 13 dart, 14 shield, 15 leather; 5 = vial.
 * Armours CoK stores as base-type **0 / special** (ring, chain, plate, bracers) are given
 * engine-internal ids ≥ 64 here so the inventory model can recompute AC for them; when real
 * `ITEM.DAX` records are loaded those map in by name (the loader keeps the full record).
 *
 * Damage values are canonical AD&D-1e (long sword 1d8, mace 1d6, dagger/dart 1d4/1d3, staff 1d6);
 * armour AC is the worn-armour AC **before** Dexterity (10 = unarmoured, lower = better), matching
 * the `baseAc` the ruleset's `createCharacter` expects.
 */
import type { DamageDice } from '../loaders/monster.js';

export type ItemKind = 'weapon' | 'armor' | 'shield' | 'ammo' | 'misc';

export interface BaseItem {
  /** Base-type id (CoK offset-42 id for pinned gear; engine-internal ≥ 64 for special armours). */
  id: number;
  name: string;
  kind: ItemKind;
  /** Melee/thrown/missile damage (weapons only). */
  damage?: DamageDice;
  /** A two-handed weapon can't be wielded alongside a shield. */
  twoHanded?: boolean;
  /**
   * A ranged weapon (bow/sling) — drives the tactical engine's `missile` weapon kind so it shoots
   * across a clear line of fire instead of meleeing. Melee weapons omit this. `thrown` marks a weapon
   * (dart) usable BOTH in melee and as a thrown missile.
   */
  ranged?: 'missile' | 'thrown';
  /**
   * Maximum missile/thrown range in **grid cells** (Chebyshev) — only meaningful with {@link ranged}.
   * 1e-inferred + labelled: AD&D-1e quotes bow/sling/dart ranges in 10-yard increments (short bow ~5/10/
   * 15", sling ~5/10/20", dart ~1.5/3/4.5"); mapped to the Gold Box combat grid at the same ~1 cell ≈ 10ft
   * scale the engine already uses for movement (see `moveRateToCells`). The Krynn games' own per-weapon
   * range table is cross-overlay/UNLOCATED (disasm-spells-krynn.md §17), so these are the 1e/Gold-Box
   * community-standard cell ranges, labelled inferred.
   */
  range?: number;
  /** Worn-armour AC before Dexterity (armour only; 10 = none, lower = better). */
  armorAc?: number;
  /** Shields improve AC by this many points (subtracted from the worn AC). */
  shieldBonus?: number;
  /**
   * Provisional combat-use bridge for magic consumables: CoAB item use routes a readied scroll/magic
   * item through the spell resolver. Until per-instance ITEM affect bytes are fully decoded, only
   * known catalogue hooks should set this.
   */
  combatUseSpellId?: string;
  /** Whether one stack unit is consumed when the combat-use spell fires. */
  combatUseConsumes?: boolean;
  /**
   * Item weight in **tenths of a pound** (so darts/arrows stay integers). Drives encumbrance via
   * {@link inventoryWeight}. Values are canonical-AD&D-ish and CANDIDATE pending a per-record weight
   * field (the item record keeps `raw`, so a decoded weight can replace these later).
   */
  weightTenths: number;
}

const d = (count: number, sides: number, bonus = 0): DamageDice => ({ count, sides, bonus });

/** The catalogue keyed by base-type id. */
export const BASE_ITEMS: Record<number, BaseItem> = {
  // Consumables / misc.
  5: { id: 5, name: 'Vial', kind: 'misc', weightTenths: 5, combatUseSpellId: 'c1-cure-light-wounds', combatUseConsumes: true },
  // Weapons (pinned CoK ids).
  6: { id: 6, name: 'Staff Sling', kind: 'weapon', damage: d(1, 4), twoHanded: true, ranged: 'missile', range: 14, weightTenths: 30 },
  7: { id: 7, name: 'Sling', kind: 'weapon', damage: d(1, 4), ranged: 'missile', range: 14, weightTenths: 5 },
  8: { id: 8, name: 'Arrow', kind: 'ammo', weightTenths: 1 },
  9: { id: 9, name: 'Short Bow', kind: 'weapon', damage: d(1, 6), twoHanded: true, ranged: 'missile', range: 15, weightTenths: 20 },
  10: { id: 10, name: 'Long Sword', kind: 'weapon', damage: d(1, 8), weightTenths: 40 },
  11: { id: 11, name: 'Quarter Staff', kind: 'weapon', damage: d(1, 6), twoHanded: true, weightTenths: 40 },
  12: { id: 12, name: 'Mace', kind: 'weapon', damage: d(1, 6), weightTenths: 80 },
  13: { id: 13, name: 'Dart', kind: 'weapon', damage: d(1, 3), ranged: 'thrown', range: 5, weightTenths: 5 },
  // Armour / shield (pinned).
  14: { id: 14, name: 'Shield', kind: 'shield', shieldBonus: 1, weightTenths: 100 },
  15: { id: 15, name: 'Leather Armor', kind: 'armor', armorAc: 8, weightTenths: 150 },
  // Common weapons CoK stores as specials, given engine-internal ids.
  64: { id: 64, name: 'Dagger', kind: 'weapon', damage: d(1, 4), weightTenths: 10 },
  65: { id: 65, name: 'Two-Handed Sword', kind: 'weapon', damage: d(1, 10), twoHanded: true, weightTenths: 150 },
  // Armours CoK stores as base-type 0 / special, given engine-internal ids.
  80: { id: 80, name: 'Ring Mail', kind: 'armor', armorAc: 7, weightTenths: 250 },
  81: { id: 81, name: 'Chain Mail', kind: 'armor', armorAc: 5, weightTenths: 300 },
  82: { id: 82, name: 'Banded Mail', kind: 'armor', armorAc: 4, weightTenths: 350 },
  83: { id: 83, name: 'Plate Mail', kind: 'armor', armorAc: 3, weightTenths: 450 },
  84: { id: 84, name: 'Bracers AC4', kind: 'armor', armorAc: 4, weightTenths: 10 },
};

export function baseItem(id: number): BaseItem | undefined {
  return BASE_ITEMS[id];
}

/** Whether a base type can be readied/worn (weapons, armour, shields). Ammo/misc cannot. */
export function isEquippable(id: number): boolean {
  const b = BASE_ITEMS[id];
  return !!b && (b.kind === 'weapon' || b.kind === 'armor' || b.kind === 'shield');
}

/** Whether an item can be readied for the combat Use command. */
export function isCombatUsable(id: number): boolean {
  return !!BASE_ITEMS[id]?.combatUseSpellId;
}
