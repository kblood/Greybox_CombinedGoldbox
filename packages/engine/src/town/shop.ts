/**
 * Town shop economy (A5.2) — base list prices for the item catalogue plus pure buy/sell transactions
 * over the party's steel-piece pool. The shop reads the same `BASE_ITEMS` catalogue the inventory and
 * treasure systems use, so "buy a Long Sword" resolves to the very item the party then wields.
 *
 * Pricing is two-tier: an explicit per-item list price where we have one, falling back to a per-kind
 * default for anything else. Shops buy gear back at half list (the Gold Box convention). All prices
 * are CANDIDATE tuning values (plausible feel, not pinned to an oracle) — isolated in this one file.
 * The functions are pure: they take the current gold and return the new gold + the price, leaving the
 * inventory mutation to the host (which owns persistence).
 */
import { baseItem, type ItemKind } from '../items/baseItems.js';
import { sellOffer } from './pricing.js';

/** Default list price (steel pieces) by item kind, used when an id has no explicit price. CANDIDATE. */
const KIND_PRICE: Record<ItemKind, number> = {
  weapon: 15,
  armor: 40,
  shield: 10,
  ammo: 1,
  misc: 5,
};

/** Explicit per-item list prices (steel pieces); overrides the kind default. CANDIDATE values. */
export const ITEM_PRICE: Record<number, number> = {
  5: 5, // Vial
  6: 8, // Staff Sling
  7: 5, // Sling
  8: 1, // Arrow
  9: 30, // Short Bow
  10: 15, // Long Sword
  11: 5, // Quarter Staff
  12: 10, // Mace
  13: 2, // Dart
  14: 10, // Shield
  15: 40, // Leather Armor
  64: 3, // Dagger
  65: 50, // Two-Handed Sword
  80: 75, // Ring Mail
  81: 90, // Chain Mail
  82: 200, // Banded Mail
  83: 400, // Plate Mail
  84: 1000, // Bracers AC4
};

/** The list (buy) price of an item id; 0 when the id is unknown to the catalogue. */
export function itemPrice(id: number): number {
  if (id in ITEM_PRICE) return ITEM_PRICE[id]!;
  const it = baseItem(id);
  return it ? KIND_PRICE[it.kind] : 0;
}

export function buyPrice(id: number): number {
  return itemPrice(id);
}

/** Shops buy gear back at half list price (rounded down). */
export function sellPrice(id: number): number {
  return Math.floor(itemPrice(id) / 2);
}

export interface ShopTxn {
  ok: boolean;
  /** Gold after the transaction (unchanged if it failed). */
  gold: number;
  /** The price charged (buy) or paid (sell). */
  price: number;
  reason?: string;
}

/** Buy one of `id`: deduct the list price if the party can afford it and the item is for sale. */
export function buyItem(gold: number, id: number): ShopTxn {
  const price = buyPrice(id);
  if (price <= 0) return { ok: false, gold, price, reason: 'not for sale' };
  if (gold < price) return { ok: false, gold, price, reason: 'not enough steel' };
  return { ok: true, gold: gold - price, price };
}

/** Sell one of `id`: credit the buy-back price to the party pool. */
export function sellItem(gold: number, id: number): ShopTxn {
  const price = sellPrice(id);
  return { ok: true, gold: gold + price, price };
}

/**
 * Sell a whole stack of `count` units of `id` in one transaction (M19.S1) — the shop's real
 * bulk-sale formula (`ShopSellItem`, ovr020, `docs/engine/research/decompile-ovr007-economy.md`):
 * a stack of non-ammo items takes a steep bulk penalty (`count·(value/2)/20`, you can't dump a
 * pile of potions for full half-price each); ammo (arrows/quarrels) sells at the full per-unit
 * half-list rate instead. For `count <= 1` this is identical to {@link sellItem}.
 *
 * `value` (M30.S1) is the stack's own real stored value (`InventoryEntry.value`, sourced from a real
 * monster-carried instance's `MonsterItem.value`), used in place of the synthetic catalogue
 * {@link itemPrice} when present — real loot sells for its own worth, not a flat per-type guess.
 */
export function sellStack(gold: number, id: number, count: number, value?: number): ShopTxn {
  const isAmmo = baseItem(id)?.kind === 'ammo';
  const price = sellOffer(value ?? itemPrice(id), count, isAmmo);
  return { ok: true, gold: gold + price, price };
}
