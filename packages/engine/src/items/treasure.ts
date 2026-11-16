/**
 * Combat treasure (A4.3) — turns a defeated enemy line-up into a recoverable haul (gold + items)
 * the victors collect on the post-battle treasure screen. CoK keeps per-monster treasure classes in
 * its tables; until those are decoded this derives a plausible, **deterministic** haul from the
 * enemies' experience value (tougher foes carry more) with a seeded `Rng`, so a given encounter +
 * seed always yields the same gold and drops. The gold/item formulae are CANDIDATE (isolated here)
 * pending the real treasure-class tables.
 */
import { Rng } from '../util/rng.js';
import { baseItem } from './baseItems.js';

/** A single stack in the haul (keys the {@link BASE_ITEMS} catalogue for stats once collected). */
export interface TreasureItem {
  baseTypeId: number;
  /** Runtime item-instance type (`Item.type` / offset 0x2e), when sourced from a retail item block. */
  itemTypeId?: number;
  name: string;
  count: number;
  /** M30.S1 — the real stored value of this instance, if it carried one (undefined ⇒ none recorded). */
  value?: number;
}

export interface TreasureHaul {
  gold: number;
  items: TreasureItem[];
}

/** A defeated enemy as far as treasure cares (its XP weight, plus what it actually carried). */
export interface TreasureFoe {
  xp?: number;
  /**
   * M29.S1 — the foe's real `MON{n}ITM.DAX` carried-item identities (`Combatant.carriedItems`),
   * unfiltered. A foe with ≥ 1 entry that resolves to a known {@link baseItem} catalogue entry drops
   * ALL of its resolvable items (matching COAB's own `calc_battle_exp` reading that a defeated
   * monster's entire carried-item list enters the loot pool, `readied` or not — the same "everything
   * carried" convention M26.S1's `itemPluses` already applies to the XP side of this same table),
   * instead of the synthetic {@link DROP_TABLE} roll. Undefined or all-unresolvable ⇒ unchanged
   * synthetic behavior.
   */
  carriedItems?: { itemTypeId?: number; baseTypeId: number; count: number; value?: number }[];
}

const SPECIAL_RUNTIME_ITEMS: Readonly<Record<number, { baseTypeId: number; name: string }>> = {
  94: { baseTypeId: 12, name: 'Drow Mace +3' },
  96: { baseTypeId: 81, name: 'Drow Chain Mail +3' },
  97: { baseTypeId: 10, name: 'Drow Long Sword +3' },
};

/** The small loot table a beaten foe can drop from (base-type ids), with a stack size. */
const DROP_TABLE: { id: number; count: number }[] = [
  { id: 5, count: 1 }, // Vial (potion)
  { id: 13, count: 3 }, // Darts
  { id: 8, count: 10 }, // Arrows
  { id: 64, count: 1 }, // Dagger
  { id: 14, count: 1 }, // Shield
];

/**
 * Roll the treasure for a set of defeated foes. Gold scales with total XP (≈ half the XP in steel,
 * jittered ±25%); each foe has a 1-in-3 chance to drop one item from the loot table. Deterministic
 * for a given `(enemies, seed)`.
 */
export function rollTreasure(enemies: readonly TreasureFoe[], seed = 0x7e): TreasureHaul {
  const rng = new Rng(seed);
  const totalXp = enemies.reduce((sum, e) => sum + Math.max(0, e.xp ?? 0), 0);
  let gold = 0;
  if (totalXp > 0) {
    const base = Math.floor(totalXp / 2);
    const jitter = base === 0 ? 0 : (rng.next() % (base + 1)) - Math.floor(base / 2); // ±~25%
    gold = Math.max(1, base + jitter);
  }
  const items: TreasureItem[] = [];
  for (const foe of enemies) {
    const real = (foe.carriedItems ?? [])
      .map((it): TreasureItem | null => {
        const special = it.itemTypeId === undefined ? undefined : SPECIAL_RUNTIME_ITEMS[it.itemTypeId & 0xff];
        const catalogue = baseItem(it.baseTypeId);
        if (!special && !catalogue) return null;
        return {
          baseTypeId: special?.baseTypeId ?? it.baseTypeId,
          ...(it.itemTypeId !== undefined ? { itemTypeId: it.itemTypeId & 0xff } : {}),
          name: special?.name ?? catalogue!.name,
          count: Math.max(1, it.count),
          value: it.value,
        };
      })
      .filter((it): it is TreasureItem => it !== null);
    if (real.length > 0) {
      items.push(...real);
      continue;
    }
    if (rng.die(3) === 1) {
      const drop = DROP_TABLE[rng.next() % DROP_TABLE.length];
      items.push({ baseTypeId: drop.id, name: baseItem(drop.id)?.name ?? `Item ${drop.id}`, count: drop.count });
    }
  }
  return { gold, items };
}

/** Whether a haul has anything to collect. */
export function hasTreasure(haul: TreasureHaul): boolean {
  return haul.gold > 0 || haul.items.length > 0;
}
