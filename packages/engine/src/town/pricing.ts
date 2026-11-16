/**
 * Gold Box **shop pricing formulas** — the VERIFIED economy math from Champions of Krynn
 * `ovr007`/`ovr020`/`ovr022` (`docs/engine/research/decompile-ovr007-economy.md`).
 *
 * These are the pinned-oracle replacements for the CANDIDATE fixed list-prices in `shop.ts`:
 * the original derives every price from an item's stored intrinsic value, scaled by the shop's
 * price tier, and pays out in coin denominations with platinum worth 5 steel. Pure functions —
 * the RNG-driven appraisal/bonus take an injected roll so they stay deterministic and decoupled
 * from the (still-deferred) SSI RNG. Currency is **steel** (Dragonlance base coin).
 */

/**
 * Shop price-tier masks — `area2_ptr.field_6DA`, a one-hot value selecting how an item's intrinsic
 * value is scaled to its **buy** price (cheap dungeon vendor → expensive city shop).
 */
export const SHOP_TIER = {
  /** ×1/16 */ sixteenth: 0x01,
  /** ×1/8 */ eighth: 0x02,
  /** ×1/4 */ quarter: 0x04,
  /** ×1/2 */ half: 0x08,
  /** ×1 (default) */ par: 0x00,
  /** ×2 */ double: 0x20,
  /** ×4 */ quadruple: 0x40,
  /** ×8 */ octuple: 0x80,
} as const;

/**
 * **Buy price** = an item's intrinsic `value` scaled by the shop's `tierMask` (`ItemsValue`,
 * ovr007). Floor the value before scaling; cheap shops divide with flooring, pricey shops
 * multiply, without signed 32-bit coercion. An unrecognised mask prices at par (×1).
 * Negative values floor at 0. Scaled tiers retain legacy NaN/+Infinity → 0 behavior;
 * par/unknown masks preserve NaN/+Infinity. Integer exactness requires safe inputs and outputs.
 */
export function buyPriceFromValue(value: number, tierMask: number): number {
  const v = Math.max(0, Math.floor(value));
  const scaledValue = Number.isFinite(v) ? v : 0;
  switch (tierMask) {
    case SHOP_TIER.sixteenth:
      return Math.floor(scaledValue / 16);
    case SHOP_TIER.eighth:
      return Math.floor(scaledValue / 8);
    case SHOP_TIER.quarter:
      return Math.floor(scaledValue / 4);
    case SHOP_TIER.half:
      return Math.floor(scaledValue / 2);
    case SHOP_TIER.double:
      return scaledValue * 2;
    case SHOP_TIER.quadruple:
      return scaledValue * 4;
    case SHOP_TIER.octuple:
      return scaledValue * 8;
    default:
      return v; // SHOP_TIER.par and any unknown mask
  }
}

/**
 * **Sell offer** for an item the shop buys back (`ShopSellItem`, ovr020). Base = `value / 2`
 * (Gold-Box half-list). A stack of `count > 1` that is **not** ammo suffers the bulk penalty
 * `count · (value/2) / 20` (you can't dump 20 potions at full half-price); ammo (arrows/quarrels)
 * pays full per-unit `(value/2) · count`.
 */
export function sellOffer(value: number, count = 1, isAmmo = false): number {
  const half = Math.floor(Math.max(0, value) / 2);
  if (count <= 1) return half;
  if (isAmmo) return half * count;
  return Math.floor((count * half) / 20);
}

/** Coin denominations for a payout: **1 platinum = 5 steel(gold)** (`GetGoldWorth`/sell payout). */
export interface CoinPayout {
  platinum: number;
  gold: number;
}

/** Split a steel `offer` into platinum + steel change (`plat = offer/5; gold = offer%5`). */
export function coinPayout(offer: number): CoinPayout {
  const o = Math.max(0, Math.floor(offer));
  return { platinum: Math.floor(o / 5), gold: o % 5 };
}

/** Flat **identify** cost (`IdentifyItem`, ovr020) — 200 steel to reveal an item's true name. */
export const IDENTIFY_COST_STEEL = 200;

/** Steel value of one platinum piece (`GetGoldWorth`). */
export const PLATINUM_TO_STEEL = 5;

/** The seven money slots (`GetMoneyIndexFromString`, ovr022); index 7 = none. */
export enum MoneySlot {
  Copper = 0,
  Silver = 1,
  Electrum = 2,
  Gold = 3, // steel, the base coin
  Platinum = 4,
  Gems = 5,
  Jewelry = 6,
}

/**
 * **Gem appraisal** (`appraiseGemsJewels`, ovr022): one `d100` (1..100) → fixed steel value.
 * 01–25 → 10, 26–50 → 50, 51–70 → 100, 71–90 → 500, 91–99 → 1000, 100 → 5000.
 */
export function appraiseGem(d100: number): number {
  if (d100 <= 25) return 10;
  if (d100 <= 50) return 50;
  if (d100 <= 70) return 100;
  if (d100 <= 90) return 500;
  if (d100 <= 99) return 1000;
  return 5000;
}

/** A band of the jewelry appraisal table: `rand(span) + base`. */
interface JewelryBand {
  span: number;
  base: number;
}

/** Jewelry value bands keyed by the `d100` roll (`appraiseGemsJewels`, ovr022). */
const JEWELRY_BANDS: ReadonlyArray<{ max: number; band: JewelryBand }> = [
  { max: 10, band: { span: 900, base: 100 } },
  { max: 20, band: { span: 1000, base: 200 } },
  { max: 40, band: { span: 1500, base: 300 } },
  { max: 50, band: { span: 2500, base: 500 } },
  { max: 70, band: { span: 5000, base: 1000 } },
  { max: 90, band: { span: 6000, base: 2000 } },
  { max: 100, band: { span: 10000, base: 2000 } },
];

/**
 * **Jewelry appraisal** (`appraiseGemsJewels`, ovr022): one `d100` selects a band, then a value
 * within it. `rand(n)` must return `0..n-1` (the SSI `Random(n)` contract) — inject it so the
 * result is deterministic in tests and independent of the deferred RNG.
 */
export function appraiseJewelry(d100: number, rand: (n: number) => number): number {
  const entry = JEWELRY_BANDS.find((b) => d100 <= b.max) ?? JEWELRY_BANDS[JEWELRY_BANDS.length - 1]!;
  const { span, base } = entry.band;
  return rand(span) + base;
}

/**
 * **Random magic bonus** (`randomBonus`, ovr022): a `d20` (1..20) → the magic plus rolled when
 * generating a random magic item — 1–14 → +1, 15–20 → +2.
 */
export function randomMagicBonus(d20: number): 1 | 2 {
  return d20 >= 15 ? 2 : 1;
}
