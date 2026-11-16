/**
 * Town economy (A5.2) — shop pricing + buy/sell transactions, temple heal/raise costs, and the
 * training-hall level-up eligibility check (keyed off the AD&D-1e XP tables).
 */
import { describe, it, expect } from 'vitest';
import {
  itemPrice,
  buyPrice,
  sellPrice,
  buyItem,
  sellItem,
  sellStack,
  healCost,
  raiseCost,
  trainingCost,
  levelHpGain,
  checkTraining,
  xpForLevel,
} from '../src/index.js';

describe('shop pricing', () => {
  it('uses explicit list prices and a half buy-back', () => {
    expect(itemPrice(10)).toBe(15); // Long Sword
    expect(buyPrice(10)).toBe(15);
    expect(sellPrice(10)).toBe(7); // floor(15/2)
    expect(itemPrice(81)).toBe(90); // Chain Mail
    expect(sellPrice(81)).toBe(45);
  });

  it('prices unknown ids at zero (not for sale)', () => {
    expect(itemPrice(9999)).toBe(0);
  });
});

describe('shop transactions', () => {
  it('buys when affordable and deducts the price', () => {
    const t = buyItem(100, 10); // Long Sword @15
    expect(t.ok).toBe(true);
    expect(t.price).toBe(15);
    expect(t.gold).toBe(85);
  });

  it('refuses a buy the party cannot afford (gold unchanged)', () => {
    const t = buyItem(10, 81); // Chain Mail @90
    expect(t.ok).toBe(false);
    expect(t.gold).toBe(10);
    expect(t.reason).toMatch(/steel/i);
  });

  it('refuses to buy an item that is not for sale', () => {
    const t = buyItem(1000, 9999);
    expect(t.ok).toBe(false);
    expect(t.reason).toMatch(/not for sale/i);
  });

  it('sells at half list and credits the pool', () => {
    const t = sellItem(50, 10); // sell Long Sword → +7
    expect(t.ok).toBe(true);
    expect(t.price).toBe(7);
    expect(t.gold).toBe(57);
  });

  it('sells a whole stack at once with the real bulk-sale penalty (M19.S1)', () => {
    // Leather Armor @40 → half=20. A stack of 3 sold individually would be 3×20=60; the shop's
    // real bulk formula (`ShopSellItem`, ovr020) is floor(3·20/20)=3 — a steep single-sale offer.
    const bulk = sellStack(0, 15, 3);
    expect(bulk.price).toBe(3);
    expect(bulk.price).toBeLessThan(3 * sellPrice(15));

    // count ≤ 1 is identical to the existing per-unit sellItem (no behaviour change there).
    expect(sellStack(0, 15, 1).price).toBe(sellItem(0, 15).price);
  });

  it('a real per-instance value (M30.S1) overrides the synthetic catalogue price', () => {
    // Real DoK BLACK MAGE Leather Armor (id 15): stored value 900 vs. the synthetic ITEM_PRICE[15]=40.
    expect(sellStack(0, 15, 1, 900).price).toBe(450); // floor(900/2), vs. synthetic floor(40/2)=20
    expect(sellStack(0, 15, 1).price).toBe(20); // no value passed -> unchanged synthetic fallback

    // Stacked real value still takes the bulk-penalty branch, just off the real half-value.
    expect(sellStack(0, 15, 3, 900).price).toBe(67); // floor(3*450/20)

    // Ammo (Arrow, id 8) with a real value still takes the full per-unit ammo rate, off the real half.
    expect(sellStack(0, 8, 5, 900).price).toBe(2250); // 450*5
    expect(sellStack(0, 8, 5).price).toBe(0); // synthetic Arrow price is 1 -> half floors to 0
  });
});

describe('temple costs', () => {
  it('charges per missing hit point and nothing when full', () => {
    expect(healCost(0)).toBe(0);
    expect(healCost(10)).toBe(30); // 3 sp/HP
  });

  it('raises the dead at a base + per-level price', () => {
    expect(raiseCost(1)).toBe(750 + 250);
    expect(raiseCost(5)).toBe(750 + 5 * 250);
    expect(raiseCost(0)).toBe(750 + 250); // clamps level to ≥1
  });
});

describe('training hall', () => {
  it('prices training by the level being gained', () => {
    expect(trainingCost(3)).toBe(3000);
  });

  it('gains the hit-die average HP per level', () => {
    expect(levelHpGain(10)).toBe(6); // d10 fighter
    expect(levelHpGain(8)).toBe(5); // d8 cleric
    expect(levelHpGain(4)).toBe(3); // d4 mage
  });

  it('is ineligible below the next XP threshold', () => {
    // A level-2 fighter needs xpForLevel(fighter,3)=4000 to train to 3.
    const need = xpForLevel('fighter', 3);
    const c = checkTraining('fighter', 2, need - 1, 100000);
    expect(c.eligible).toBe(false);
    expect(c.targetLevel).toBe(3);
    expect(c.needXp).toBe(need);
    expect(c.reason).toMatch(/experience/i);
  });

  it('is ineligible when XP is enough but gold is short', () => {
    const need = xpForLevel('fighter', 3);
    const c = checkTraining('fighter', 2, need, 10);
    expect(c.eligible).toBe(false);
    expect(c.reason).toMatch(/steel/i);
  });

  it('is eligible with enough XP and gold', () => {
    const need = xpForLevel('fighter', 3);
    const c = checkTraining('fighter', 2, need, 5000);
    expect(c.eligible).toBe(true);
    expect(c.cost).toBe(3000);
    expect(c.reason).toBeUndefined();
  });

  it('M92.S1 — refuses training past an injected level cap even with enough XP and gold', () => {
    const need = xpForLevel('fighter', 9);
    const c = checkTraining('fighter', 8, need, 100000, 8); // capped at 8, training targets 9
    expect(c.eligible).toBe(false);
    expect(c.targetLevel).toBe(9);
    expect(c.reason).toMatch(/level cap/i);
  });

  it('M92.S1 — an omitted/null cap leaves training uncapped (default, and explicit DQK opt-out)', () => {
    const need = xpForLevel('fighter', 9);
    expect(checkTraining('fighter', 8, need, 100000).eligible).toBe(true); // no cap arg at all
    expect(checkTraining('fighter', 8, need, 100000, null).eligible).toBe(true); // explicit null
  });
});
