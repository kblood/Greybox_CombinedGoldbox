/**
 * Shop pricing-formula tests (ovr007/020/022) — asserts the VERIFIED economy math from
 * `docs/engine/research/decompile-ovr007-economy.md`: value×tier buy price, half-list sell with
 * the stacked-item bulk penalty, platinum=5 coin payout, the gem/jewelry appraisal tables, the
 * identify cost, and the randomBonus d20 mapping.
 */
import { describe, it, expect } from 'vitest';
import {
  SHOP_TIER,
  buyPriceFromValue,
  sellOffer,
  coinPayout,
  appraiseGem,
  appraiseJewelry,
  randomMagicBonus,
  IDENTIFY_COST_STEEL,
  PLATINUM_TO_STEEL,
  MoneySlot,
} from '../src/index.js';

describe('buyPriceFromValue — value scaled by the shop tier', () => {
  const tiers = [
    SHOP_TIER.sixteenth,
    SHOP_TIER.eighth,
    SHOP_TIER.quarter,
    SHOP_TIER.half,
    SHOP_TIER.par,
    SHOP_TIER.double,
    SHOP_TIER.quadruple,
    SHOP_TIER.octuple,
  ];
  const scaledTiers = tiers.filter((tier) => tier !== SHOP_TIER.par);

  it('scales values above the signed 32-bit range without wrapping', () => {
    expect(tiers.map((tier) => buyPriceFromValue(2_400_000_000, tier))).toEqual([
      150_000_000, 300_000_000, 600_000_000, 1_200_000_000,
      2_400_000_000, 4_800_000_000, 9_600_000_000, 19_200_000_000,
    ]);
    expect(buyPriceFromValue(2_400_000_000, 0x99)).toBe(2_400_000_000);
  });

  it('floors fractional values before scaling and floors discounted prices', () => {
    expect(scaledTiers.map((tier) => buyPriceFromValue(31.9, tier))).toEqual([
      1, 3, 7, 15, 62, 124, 248,
    ]);
    expect(buyPriceFromValue(31.9, SHOP_TIER.par)).toBe(31);
    expect(buyPriceFromValue(31.9, 0x99)).toBe(31);
  });

  it('returns zero for negative and zero values across every tier and unknown masks', () => {
    for (const value of [-31.9, -0.1, 0, -Infinity]) {
      for (const tier of [...tiers, 0x99]) {
        expect(buyPriceFromValue(value, tier)).toBe(0);
      }
    }
  });

  it('retains non-finite distinctions between scaled and par/unknown tiers', () => {
    for (const value of [NaN, Infinity]) {
      for (const tier of scaledTiers) {
        expect(buyPriceFromValue(value, tier)).toBe(0);
      }
      for (const tier of [SHOP_TIER.par, 0x99]) {
        expect(buyPriceFromValue(value, tier)).toBe(value);
      }
    }
  });

  it('is exact at the largest safe input whose octuple price remains safe', () => {
    const value = Math.floor(Number.MAX_SAFE_INTEGER / 8);
    expect(value).toBe(1_125_899_906_842_623);
    const prices = tiers.map((tier) => buyPriceFromValue(value, tier));
    expect(prices).toEqual([
      70_368_744_177_663, 140_737_488_355_327, 281_474_976_710_655,
      562_949_953_421_311, 1_125_899_906_842_623, 2_251_799_813_685_246,
      4_503_599_627_370_492, 9_007_199_254_740_984,
    ]);
    expect(prices.every(Number.isSafeInteger)).toBe(true);
    expect(Number.isSafeInteger((value + 1) * 8)).toBe(false);
  });
  it('scales a 160-value item across the whole tier table', () => {
    expect(buyPriceFromValue(160, SHOP_TIER.sixteenth)).toBe(10); // ÷16, floored
    expect(buyPriceFromValue(160, SHOP_TIER.eighth)).toBe(20); // ÷8, floored
    expect(buyPriceFromValue(160, SHOP_TIER.quarter)).toBe(40); // ÷4, floored
    expect(buyPriceFromValue(160, SHOP_TIER.half)).toBe(80); // ÷2, floored
    expect(buyPriceFromValue(160, SHOP_TIER.par)).toBe(160); // ×1
    expect(buyPriceFromValue(160, SHOP_TIER.double)).toBe(320); // ×2
    expect(buyPriceFromValue(160, SHOP_TIER.quadruple)).toBe(640); // ×4
    expect(buyPriceFromValue(160, SHOP_TIER.octuple)).toBe(1280); // ×8
  });
  it('an unknown mask prices at par, negatives floor at 0', () => {
    expect(buyPriceFromValue(50, 0x99)).toBe(50);
    expect(buyPriceFromValue(-10, SHOP_TIER.par)).toBe(0);
  });
});

describe('sellOffer — half list with stacked penalty', () => {
  it('a single item sells at half value (floored)', () => {
    expect(sellOffer(15)).toBe(7);
    expect(sellOffer(100)).toBe(50);
  });
  it('a non-ammo stack takes the bulk penalty count·(value/2)/20', () => {
    // 20 potions of value 100: half=50, 20*50/20 = 50 (one potion equivalent)
    expect(sellOffer(100, 20, false)).toBe(50);
    // 5 of value 100: 5*50/20 = 12 (floored)
    expect(sellOffer(100, 5, false)).toBe(12);
  });
  it('ammo pays full half-price per unit', () => {
    // 20 arrows of value 2: half=1, 1*20 = 20
    expect(sellOffer(2, 20, true)).toBe(20);
  });
});

describe('coinPayout — platinum is 5 steel', () => {
  it('splits an offer into platinum + steel change', () => {
    expect(coinPayout(17)).toEqual({ platinum: 3, gold: 2 });
    expect(coinPayout(5)).toEqual({ platinum: 1, gold: 0 });
    expect(coinPayout(4)).toEqual({ platinum: 0, gold: 4 });
  });
  it('PLATINUM_TO_STEEL is 5', () => {
    expect(PLATINUM_TO_STEEL).toBe(5);
  });
});

describe('appraiseGem — d100 → fixed value', () => {
  it('maps each band boundary', () => {
    expect(appraiseGem(1)).toBe(10);
    expect(appraiseGem(25)).toBe(10);
    expect(appraiseGem(26)).toBe(50);
    expect(appraiseGem(50)).toBe(50);
    expect(appraiseGem(51)).toBe(100);
    expect(appraiseGem(70)).toBe(100);
    expect(appraiseGem(71)).toBe(500);
    expect(appraiseGem(90)).toBe(500);
    expect(appraiseGem(91)).toBe(1000);
    expect(appraiseGem(99)).toBe(1000);
    expect(appraiseGem(100)).toBe(5000);
  });
});

describe('appraiseJewelry — d100 band + injected rand', () => {
  it('selects the band and adds rand(span)+base (rand=0 → base)', () => {
    const zero = () => 0;
    expect(appraiseJewelry(1, zero)).toBe(100); // band 01-10: rand(900)+100
    expect(appraiseJewelry(20, zero)).toBe(200); // band 11-20: rand(1000)+200
    expect(appraiseJewelry(40, zero)).toBe(300); // band 21-40
    expect(appraiseJewelry(50, zero)).toBe(500); // band 41-50
    expect(appraiseJewelry(70, zero)).toBe(1000); // band 51-70
    expect(appraiseJewelry(90, zero)).toBe(2000); // band 71-90
    expect(appraiseJewelry(100, zero)).toBe(2000); // band 91-100
  });
  it('adds the rolled offset within the band', () => {
    // band 01-10, rand returns span-1 → 899+100 = 999
    expect(appraiseJewelry(5, (n) => n - 1)).toBe(999);
  });
});

describe('randomMagicBonus — d20', () => {
  it('1-14 → +1, 15-20 → +2', () => {
    expect(randomMagicBonus(1)).toBe(1);
    expect(randomMagicBonus(14)).toBe(1);
    expect(randomMagicBonus(15)).toBe(2);
    expect(randomMagicBonus(20)).toBe(2);
  });
});

describe('constants', () => {
  it('identify costs 200 steel; money slots are ordered copper..jewelry', () => {
    expect(IDENTIFY_COST_STEEL).toBe(200);
    expect(MoneySlot.Gold).toBe(3); // steel = the base coin
    expect(MoneySlot.Platinum).toBe(4);
    expect(MoneySlot.Jewelry).toBe(6);
  });
});
