import { describe, it, expect } from 'vitest';
import {
  weaponFromBaseItem,
  tacticalWeaponsFor,
  moveRateToCells,
  UNARMED,
} from '../src/items/combatEquip.js';
import { baseItem } from '../src/items/baseItems.js';
import { inventoryFromIds, readyItem } from '../src/items/inventory.js';

// CT.7k-1 — the item→tactical bridge: a readied weapon's dice/kind/range reach the combatant, the
// carried-weight move-rate maps to a cell allowance, and the unarmed fallback is sane.
describe('combatEquip — weapon plumbing', () => {
  it('maps a melee weapon (long sword) to a melee Weapon, reach 1', () => {
    const w = weaponFromBaseItem(baseItem(10)!); // long sword 1d8
    expect(w.kind).toBe('melee');
    expect(w.damage).toEqual({ count: 1, sides: 8, bonus: 0 });
    expect(w.reach).toBe(1);
    expect(w.range).toBeUndefined();
  });

  it('maps a bow to a missile Weapon with range + ammo', () => {
    const w = weaponFromBaseItem(baseItem(9)!); // short bow, range 15
    expect(w.kind).toBe('missile');
    expect(w.range).toBe(15);
    expect((w.ammo ?? 0)).toBeGreaterThan(0);
  });

  it('maps a dart (thrown) to a melee Weapon that still carries a range', () => {
    const w = weaponFromBaseItem(baseItem(13)!); // dart, thrown, range 5
    expect(w.kind).toBe('melee');
    expect(w.range).toBe(5);
  });

  it('folds a damage override (e.g. Strength bonus) into the dice', () => {
    const w = weaponFromBaseItem(baseItem(10)!, { count: 1, sides: 8, bonus: 3 });
    expect(w.damage.bonus).toBe(3);
  });

  it("tacticalWeaponsFor returns the readied weapon", () => {
    let inv = inventoryFromIds([{ id: 10 }, { id: 9 }]); // long sword + short bow
    inv = readyItem(inv, 1); // ready the bow
    const weapons = tacticalWeaponsFor(inv);
    expect(weapons).toHaveLength(1);
    expect(weapons[0].kind).toBe('missile');
    expect(weapons[0].name).toBe('Short Bow');
  });

  it('falls back to UNARMED when nothing is readied', () => {
    const inv = inventoryFromIds([{ id: 10 }]); // carried but not readied
    const weapons = tacticalWeaponsFor(inv);
    expect(weapons).toHaveLength(1);
    expect(weapons[0]).toEqual(UNARMED);
  });
});

describe('combatEquip — movement plumbing', () => {
  it('maps the unencumbered 12" rate to ~5 cells (matches the old placeholder)', () => {
    expect(moveRateToCells(12)).toBe(5);
  });
  it('steps down with encumbrance and bottoms out at 0', () => {
    expect(moveRateToCells(9)).toBe(4); // light
    expect(moveRateToCells(6)).toBeGreaterThanOrEqual(2); // moderate
    expect(moveRateToCells(6)).toBeLessThanOrEqual(3);
    expect(moveRateToCells(3)).toBeGreaterThanOrEqual(1); // heavy
    expect(moveRateToCells(0)).toBe(0); // overloaded — can't move
  });
});
