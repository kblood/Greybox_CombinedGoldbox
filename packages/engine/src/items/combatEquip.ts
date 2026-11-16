/**
 * Item → tactical-combat bridge (CT.7k-1) — turns a character's **readied** equipment + carried-weight
 * movement rate into the `Weapon[]` and per-round move allowance the tactical engine fights with. Pure
 * and DOM/Node-free (engine layer); the web UI calls these to replace the old placeholder "first hero
 * +bow / move 5" synthesis (CT.2) with each member's actual gear.
 *
 * The numbers are the engine's existing ruleset/item data: weapon damage dice come straight from
 * {@link BaseItem.damage} (the 1e/COAB-grounded `BASE_ITEMS` table); melee-vs-missile + range from the
 * item's {@link BaseItem.ranged}/{@link BaseItem.range}; the move-rate→cells map is 1e-inferred + labelled
 * (see {@link moveRateToCells}). No new byte-claims are made here.
 */
import type { DamageDice } from '../loaders/monster.js';
import type { Weapon } from '../combat/tactical.js';
import { BASE_ITEMS, type BaseItem } from './baseItems.js';
import type { Inventory } from './inventory.js';
import { equippedWeapon } from './inventory.js';

/** A sane unarmed strike used when a figure has no readied weapon (1e: a fist ≈ 1d2). */
export const UNARMED: Weapon = { name: 'fist', kind: 'melee', damage: { count: 1, sides: 2, bonus: 0 }, reach: 1 };

/** Default ammunition count for a missile weapon with no tracked ammo stack (full quiver, 1e-inferred). */
const DEFAULT_AMMO = 20;

/**
 * Build the tactical {@link Weapon} a base-item readies as. A ranged item (bow/sling, {@link BaseItem.ranged}
 * `'missile'`) becomes a `missile` weapon carrying its {@link BaseItem.range} (cells) + ammo; a `'thrown'`
 * item (dart) is a melee weapon that ALSO carries a `range`, so the engine can offer it both ways. A plain
 * weapon is melee, reach 1. `damageOverride` folds in a per-character bonus (e.g. the Strength damage
 * adjustment the caller already computes) without mutating the catalogue dice.
 */
export function weaponFromBaseItem(item: BaseItem, damageOverride?: DamageDice, ammo?: number): Weapon {
  const damage = damageOverride ?? item.damage ?? { count: 1, sides: 2, bonus: 0 };
  if (item.ranged === 'missile') {
    return { name: item.name, kind: 'missile', damage, range: item.range ?? 12, ammo: ammo ?? DEFAULT_AMMO };
  }
  // Melee (or a thrown weapon, which keeps a range so the UI can lob it). Reach 1 — the standard footprint.
  const w: Weapon = { name: item.name, kind: 'melee', damage, reach: 1 };
  if (item.ranged === 'thrown' && item.range !== undefined) w.range = item.range;
  return w;
}

/**
 * The tactical weapon list for a character's pack: their **readied** weapon (the Gold Box single readied
 * slot — {@link equippedWeapon}), or {@link UNARMED} when nothing is readied. `damageOverride` lets the
 * caller fold a Strength/magic damage bonus into the readied weapon's dice. Returns at least one weapon so
 * the figure can always act.
 */
export function tacticalWeaponsFor(inv: Inventory, damageOverride?: DamageDice): Weapon[] {
  const readied = equippedWeapon(inv);
  if (!readied) return [{ ...UNARMED }];
  const base = BASE_ITEMS[readied.baseTypeId];
  if (!base) return [{ ...UNARMED }];
  return [weaponFromBaseItem(base, damageOverride)];
}

/**
 * Convert an AD&D movement **rate** (inches/round, as {@link Encumbrance.moveRate} returns: 12 unencumbered
 * down to 0 overloaded) into a tactical **cell** allowance per round.
 *
 * **1e-inferred + labelled:** the Gold Box combat grid square is ~10 ft; a base 12" move (= 120 ft/turn,
 * AD&D-1e) is the engine's "fast" footing, which the old placeholder rendered as ~5 cells (combat.ts CT.2).
 * Keeping that calibration, a cell ≈ `12/5` ≈ 2.4 inches of move rate, i.e. `cells = round(rate / 2.4)` —
 * so 12" → 5 cells, 9" (light) → ~4, 6" (moderate) → ~3, 3" (heavy) → ~1, 0" (overloaded) → 0. The Krynn
 * games' own move-rate→square table is cross-overlay/UNLOCATED, so this mapping is the labelled inference,
 * matching the prior hand-tuned placeholder rather than inventing a new scale. Clamped to ≥ 0.
 */
export function moveRateToCells(moveRate: number): number {
  if (moveRate <= 0) return 0;
  return Math.max(0, Math.round(moveRate / 2.4));
}
