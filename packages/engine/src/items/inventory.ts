/**
 * Character inventory model (A4.1) — a pure, immutable list of carried items with ready/equip,
 * drop and use operations, plus the armour-class / THAC0 recompute that readying gear drives. The
 * engine keeps no DOM or storage here; the web layer persists a serialised {@link Inventory} per
 * character and renders it through {@link composeInventory}.
 *
 * Equip rules (single melee/missile slot, one armour, one shield, matching the Gold Box "Ready"
 * verb): readying a weapon un-readies any other weapon; a two-handed weapon also drops the shield,
 * and readying a shield drops a two-handed weapon. Readying armour un-readies other armour. Ammo
 * cannot be readied; misc items can only be readied when the base catalogue marks them as combat-use
 * magic/scroll/potion hooks. All operations return a new Inventory.
 */
import { BASE_ITEMS, baseItem, isCombatUsable, isEquippable, type BaseItem } from './baseItems.js';

export interface InventoryEntry {
  /** Display name (from the item record; falls back to the catalogue name). */
  name: string;
  /** Base-type id keying {@link BASE_ITEMS} for combat stats. */
  baseTypeId: number;
  /** Runtime item-instance type used by ECL FIND_ITEM, when known from a retail item record. */
  itemTypeId?: number;
  /** Stack count (≥ 1). */
  count: number;
  /** Whether the item is currently readied / worn. */
  equipped: boolean;
  /**
   * M30.S1 — stored real price, if this stack came from a real monster-carried instance
   * (`CarriedLoot.value`); `undefined` for shop-bought/starter-kit gear, which falls back to the
   * catalogue price on resale (`town/shop.ts`'s `sellStack`).
   */
  value?: number;
}

export interface Inventory {
  entries: InventoryEntry[];
}

const UNARMORED_AC = 10;

export function emptyInventory(): Inventory {
  return { entries: [] };
}

/** Build an inventory from base-type ids (each a single readied=false stack of `count`). */
export function inventoryFromIds(ids: { id: number; count?: number; name?: string }[]): Inventory {
  return {
    entries: ids.map(({ id, count, name }) => ({
      name: name ?? baseItem(id)?.name ?? `Item ${id}`,
      baseTypeId: id,
      count: Math.max(1, count ?? 1),
      equipped: false,
    })),
  };
}

function kindOf(entry: InventoryEntry): BaseItem['kind'] | undefined {
  return BASE_ITEMS[entry.baseTypeId]?.kind;
}

function isTwoHanded(entry: InventoryEntry): boolean {
  return !!BASE_ITEMS[entry.baseTypeId]?.twoHanded;
}

function clone(inv: Inventory): InventoryEntry[] {
  return inv.entries.map((e) => ({ ...e }));
}

/**
 * Ready (equip) the item at `index`, enforcing the single-slot rules. Returns the inventory
 * unchanged when the item is not equippable. Re-readying an already-readied item is a no-op.
 */
export function readyItem(inv: Inventory, index: number): Inventory {
  const target = inv.entries[index];
  if (!target || (!isEquippable(target.baseTypeId) && !isCombatUsable(target.baseTypeId))) return inv;
  if (!isEquippable(target.baseTypeId)) {
    const entries = clone(inv);
    entries[index].equipped = true;
    return { entries };
  }
  const kind = kindOf(target);
  const twoH = isTwoHanded(target);
  const entries = clone(inv);
  entries.forEach((e, i) => {
    if (i === index) {
      e.equipped = true;
      return;
    }
    if (!e.equipped) return;
    const k = kindOf(e);
    if (k === kind) e.equipped = false; // one weapon / one armour / one shield
    else if (twoH && k === 'shield') e.equipped = false; // two-hander frees the shield hand
    else if (kind === 'shield' && k === 'weapon' && isTwoHanded(e)) e.equipped = false;
  });
  return { entries };
}

/** Un-ready the item at `index`. */
export function unreadyItem(inv: Inventory, index: number): Inventory {
  const target = inv.entries[index];
  if (!target || !target.equipped) return inv;
  const entries = clone(inv);
  entries[index].equipped = false;
  return { entries };
}

/** Toggle the readied state of the item at `index` (applies the ready rules when equipping). */
export function toggleReady(inv: Inventory, index: number): Inventory {
  const target = inv.entries[index];
  if (!target) return inv;
  return target.equipped ? unreadyItem(inv, index) : readyItem(inv, index);
}

/** Remove the item at `index` from the pack entirely (drop the whole stack). */
export function dropItem(inv: Inventory, index: number): Inventory {
  if (index < 0 || index >= inv.entries.length) return inv;
  const entries = clone(inv);
  entries.splice(index, 1);
  return { entries };
}

/**
 * Use one of the item at `index`: decrement its stack, removing the entry when the last one is
 * consumed. Equippable gear is not "used up" — using it is a no-op (use Ready instead). Returns the
 * new inventory plus whether a unit was actually consumed.
 */
export function useItem(inv: Inventory, index: number): { inventory: Inventory; consumed: boolean } {
  const target = inv.entries[index];
  if (!target || isEquippable(target.baseTypeId)) return { inventory: inv, consumed: false };
  const entries = clone(inv);
  if (entries[index].count > 1) entries[index].count -= 1;
  else entries.splice(index, 1);
  return { inventory: { entries }, consumed: true };
}

/** The readied armour entry (worn body armour), or null. */
export function equippedArmor(inv: Inventory): InventoryEntry | null {
  return inv.entries.find((e) => e.equipped && kindOf(e) === 'armor') ?? null;
}

/** The readied shield, or null. */
export function equippedShield(inv: Inventory): InventoryEntry | null {
  return inv.entries.find((e) => e.equipped && kindOf(e) === 'shield') ?? null;
}

/** The readied weapon, or null. */
export function equippedWeapon(inv: Inventory): InventoryEntry | null {
  return inv.entries.find((e) => e.equipped && kindOf(e) === 'weapon') ?? null;
}

/** Worn-armour AC before Dexterity (10 unarmoured), improved by an equipped shield. */
export function wornArmorAc(inv: Inventory): number {
  const armor = equippedArmor(inv);
  let ac = armor ? (BASE_ITEMS[armor.baseTypeId]?.armorAc ?? UNARMORED_AC) : UNARMORED_AC;
  const shield = equippedShield(inv);
  if (shield) ac -= BASE_ITEMS[shield.baseTypeId]?.shieldBonus ?? 0;
  return ac;
}

/**
 * Final armour class from the readied gear, including the Dexterity defensive adjustment (signed,
 * as the ruleset's `dexterity(score).defensiveAc`). Mirrors `createCharacter`'s `baseAc + defensiveAc`.
 */
export function computeArmorClass(inv: Inventory, dexDefensiveAc = 0): number {
  return wornArmorAc(inv) + dexDefensiveAc;
}

/**
 * THAC0 after readying a weapon. Stock gear carries no magic bonus (the per-record bonus isn't
 * pinned yet — see the research doc), so this returns the base THAC0 today; the `magicBonus`
 * parameter is the hook for +1/+2 weapons once that field is decoded.
 */
export function computeThac0(baseThac0: number, magicBonus = 0): number {
  return baseThac0 - magicBonus;
}

/** Total carried weight in tenths of a pound (sum of base-item weight × stack count). */
export function inventoryWeightTenths(inv: Inventory): number {
  let w = 0;
  for (const e of inv.entries) w += (BASE_ITEMS[e.baseTypeId]?.weightTenths ?? 0) * Math.max(1, e.count);
  return w;
}

/** Total carried weight in pounds (one decimal). */
export function inventoryWeightLb(inv: Inventory): number {
  return inventoryWeightTenths(inv) / 10;
}

/**
 * Trade: move the whole stack at `index` from `from` to `to` (the Gold Box "give to another member"
 * action). A readied item is **un-readied as it leaves the pack** (the readied-weapon rule — you
 * can't carry gear readied that you no longer own). Returns new inventories for both parties plus
 * the moved entry (null when the index is invalid).
 */
export function transferItem(
  from: Inventory,
  to: Inventory,
  index: number,
): { from: Inventory; to: Inventory; moved: InventoryEntry | null } {
  const target = from.entries[index];
  if (!target) return { from, to, moved: null };
  const fromEntries = clone(from);
  const [moved] = fromEntries.splice(index, 1);
  moved.equipped = false; // un-ready on hand-off
  const toEntries = clone(to);
  toEntries.push(moved);
  return { from: { entries: fromEntries }, to: { entries: toEntries }, moved };
}
