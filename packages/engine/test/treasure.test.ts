import { describe, it, expect } from 'vitest';
import { rollTreasure, hasTreasure } from '../src/items/treasure.js';
import { baseItem } from '../src/items/baseItems.js';

const band = [{ xp: 35 }, { xp: 28 }, { xp: 42 }]; // a draconian band, 105 XP total

describe('rollTreasure', () => {
  it('is deterministic for a given (enemies, seed)', () => {
    const a = rollTreasure(band, 0x55);
    const b = rollTreasure(band, 0x55);
    expect(a).toEqual(b);
  });

  it('different seeds can yield different hauls', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => JSON.stringify(rollTreasure(band, s)));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('gold scales with total XP (≈ half), and is positive for a real band', () => {
    const haul = rollTreasure(band, 0x55);
    expect(haul.gold).toBeGreaterThan(0);
    expect(haul.gold).toBeLessThan(105); // bounded around XP/2 ± jitter
  });

  it('drops are real catalogue items with sane stacks', () => {
    for (let s = 0; s < 40; s++) {
      for (const it of rollTreasure(band, s).items) {
        expect(baseItem(it.baseTypeId)).toBeTruthy();
        expect(it.count).toBeGreaterThan(0);
        expect(it.name.length).toBeGreaterThan(0);
      }
    }
  });

  it('produces item drops for at least some seeds', () => {
    const anyItems = Array.from({ length: 40 }, (_, s) => rollTreasure(band, s).items.length).some((n) => n > 0);
    expect(anyItems).toBe(true);
  });

  it('no enemies → empty haul', () => {
    const haul = rollTreasure([], 1);
    expect(haul.gold).toBe(0);
    expect(haul.items).toEqual([]);
    expect(hasTreasure(haul)).toBe(false);
  });

  it('hasTreasure is true when there is gold', () => {
    expect(hasTreasure(rollTreasure(band, 0x55))).toBe(true);
  });
});

describe('rollTreasure — real carried-item loot (M29.S1)', () => {
  it('retains CoAB Drow runtime types 94/96/97 with usable catalogue identities', () => {
    const foe = [{
      xp: 0,
      carriedItems: [
        { itemTypeId: 94, baseTypeId: 94, count: 0 },
        { itemTypeId: 96, baseTypeId: 96, count: 0 },
        { itemTypeId: 97, baseTypeId: 97, count: 0 },
        { itemTypeId: 250, baseTypeId: 250, count: 1 },
      ],
    }];
    expect(rollTreasure(foe, 1).items).toEqual([
      { itemTypeId: 94, baseTypeId: 12, name: 'Drow Mace +3', count: 1, value: undefined },
      { itemTypeId: 96, baseTypeId: 81, name: 'Drow Chain Mail +3', count: 1, value: undefined },
      { itemTypeId: 97, baseTypeId: 10, name: 'Drow Long Sword +3', count: 1, value: undefined },
    ]);
  });

  it('a foe with a resolvable carried item drops it exactly, deterministically, for every seed', () => {
    const foe = [{ xp: 0, carriedItems: [{ baseTypeId: 5, count: 9 }] }]; // real CoK BLACK ROBE MAGE (id 38) shape
    for (let s = 0; s < 20; s++) {
      expect(rollTreasure(foe, s).items).toEqual([{ baseTypeId: 5, name: 'Vial', count: 9 }]);
    }
  });

  it('a foe whose carried items are all unresolvable falls back to the existing synthetic DROP_TABLE roll', () => {
    const foe = [{ xp: 0, carriedItems: [{ baseTypeId: 19, count: 1 }] }]; // real GOBLIN (id 9) shape: unmapped id
    const withUnresolvable = Array.from({ length: 40 }, (_, s) => rollTreasure(foe, s).items);
    const withUndefined = Array.from({ length: 40 }, (_, s) => rollTreasure([{ xp: 0 }], s).items);
    expect(withUnresolvable).toEqual(withUndefined); // identical statistical shape to carriedItems: undefined
  });

  it('a mixed resolvable/unresolvable carry yields only the resolvable item, silently dropping the rest', () => {
    const foe = [{ xp: 0, carriedItems: [{ baseTypeId: 5, count: 3 }, { baseTypeId: 999, count: 1 }] }];
    expect(rollTreasure(foe, 7).items).toEqual([{ baseTypeId: 5, name: 'Vial', count: 3 }]);
  });

  it('every pre-existing assertion is unaffected — the band fixture never sets carriedItems', () => {
    const a = rollTreasure(band, 0x55);
    const b = rollTreasure(band, 0x55);
    expect(a).toEqual(b);
    for (const it of a.items) expect(baseItem(it.baseTypeId)).toBeTruthy();
  });
});

describe('rollTreasure — real carried-item value threading (M30.S1)', () => {
  it('a resolvable carried item with a real value carries that value onto the dropped TreasureItem, deterministically', () => {
    // Real DoK BLACK MAGE (id 66) shape: Leather Armor with real stored value 900.
    const foe = [{ xp: 0, carriedItems: [{ baseTypeId: 15, count: 1, value: 900 }] }];
    for (let s = 0; s < 20; s++) {
      expect(rollTreasure(foe, s).items).toEqual([{ baseTypeId: 15, name: 'Leather Armor', count: 1, value: 900 }]);
    }
  });

  it('a carried item with value omitted (or 0) resolves with value: undefined — no value is fabricated', () => {
    const noValue = [{ xp: 0, carriedItems: [{ baseTypeId: 5, count: 9 }] }]; // M29.S1's own BLACK ROBE MAGE shape
    expect(rollTreasure(noValue, 3).items[0]!.value).toBeUndefined();
  });
});
