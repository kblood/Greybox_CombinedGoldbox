import { describe, it, expect } from 'vitest';
import {
  inventoryFromIds,
  readyItem,
  unreadyItem,
  toggleReady,
  dropItem,
  useItem,
  equippedWeapon,
  equippedArmor,
  equippedShield,
  wornArmorAc,
  computeArmorClass,
  computeThac0,
  inventoryWeightTenths,
  inventoryWeightLb,
  transferItem,
  emptyInventory,
} from '../src/items/inventory.js';
import { baseItem, isCombatUsable, isEquippable } from '../src/items/baseItems.js';

// ids: 10 long sword, 12 mace, 14 shield, 15 leather, 80 ring, 81 chain, 11 quarter staff (2H),
// 8 arrow (ammo), 5 vial (misc).
const kit = () =>
  inventoryFromIds([
    { id: 10 }, // 0 long sword
    { id: 14 }, // 1 shield
    { id: 15 }, // 2 leather
    { id: 81 }, // 3 chain mail
    { id: 11 }, // 4 quarter staff (two-handed)
    { id: 8, count: 20 }, // 5 arrows
    { id: 5 }, // 6 vial
  ]);

describe('base-item catalogue', () => {
  it('keys stats off the base-type id', () => {
    expect(baseItem(10)?.name).toBe('Long Sword');
    expect(baseItem(10)?.damage).toEqual({ count: 1, sides: 8, bonus: 0 });
    expect(baseItem(15)?.armorAc).toBe(8);
    expect(baseItem(14)?.shieldBonus).toBe(1);
    expect(baseItem(11)?.twoHanded).toBe(true);
  });
  it('marks only weapons/armour/shields equippable', () => {
    expect(isEquippable(10)).toBe(true); // weapon
    expect(isEquippable(15)).toBe(true); // armour
    expect(isEquippable(14)).toBe(true); // shield
    expect(isEquippable(8)).toBe(false); // ammo
    expect(isEquippable(5)).toBe(false); // misc
    expect(isCombatUsable(5)).toBe(true); // potion-style combat Use item
  });
});

describe('inventory ready rules', () => {
  it('readies one weapon, one armour and one shield together', () => {
    let inv = kit();
    inv = readyItem(inv, 0); // long sword
    inv = readyItem(inv, 2); // leather
    inv = readyItem(inv, 1); // shield
    expect(equippedWeapon(inv)?.baseTypeId).toBe(10);
    expect(equippedArmor(inv)?.baseTypeId).toBe(15);
    expect(equippedShield(inv)?.baseTypeId).toBe(14);
  });

  it('readying a second armour un-readies the first', () => {
    let inv = kit();
    inv = readyItem(inv, 2); // leather
    inv = readyItem(inv, 3); // chain
    expect(equippedArmor(inv)?.baseTypeId).toBe(81);
    expect(inv.entries[2].equipped).toBe(false);
  });

  it('a two-handed weapon drops the shield, and a shield drops the two-hander', () => {
    let inv = kit();
    inv = readyItem(inv, 1); // shield
    inv = readyItem(inv, 4); // quarter staff (2H) → shield off
    expect(equippedShield(inv)).toBeNull();
    expect(equippedWeapon(inv)?.baseTypeId).toBe(11);
    inv = readyItem(inv, 1); // re-ready shield → 2H weapon off
    expect(equippedWeapon(inv)).toBeNull();
    expect(equippedShield(inv)?.baseTypeId).toBe(14);
  });

  it('cannot ready ammo, but can ready combat-use misc; toggle and unready behave', () => {
    let inv = kit();
    inv = readyItem(inv, 5); // arrows — no-op
    inv = readyItem(inv, 6); // vial — readied for combat Use
    expect(inv.entries[5].equipped).toBe(false);
    expect(inv.entries[6].equipped).toBe(true);
    inv = unreadyItem(inv, 6);
    expect(inv.entries[6].equipped).toBe(false);
    inv = toggleReady(inv, 0); // ready sword
    expect(inv.entries[0].equipped).toBe(true);
    inv = toggleReady(inv, 0); // unready
    expect(inv.entries[0].equipped).toBe(false);
    expect(unreadyItem(inv, 0)).toBe(inv); // already off → unchanged
  });
});

describe('AC / THAC0 recompute', () => {
  it('worn AC follows armour + shield, with the Dex adjustment folded in', () => {
    let inv = kit();
    expect(wornArmorAc(inv)).toBe(10); // unarmoured
    inv = readyItem(inv, 2); // leather (8)
    expect(wornArmorAc(inv)).toBe(8);
    inv = readyItem(inv, 1); // + shield (−1)
    expect(wornArmorAc(inv)).toBe(7);
    inv = readyItem(inv, 3); // swap to chain (5), shield stays
    expect(wornArmorAc(inv)).toBe(4);
    expect(computeArmorClass(inv, -2)).toBe(2); // Dex 16 defensiveAc = −2
    expect(computeArmorClass(inv, 0)).toBe(4);
  });
  it('THAC0 only shifts with a weapon magic bonus (0 for stock gear)', () => {
    expect(computeThac0(15)).toBe(15);
    expect(computeThac0(15, 1)).toBe(14);
  });
});

describe('drop / use', () => {
  it('drop removes the whole stack', () => {
    let inv = kit();
    const n = inv.entries.length;
    inv = dropItem(inv, 6); // vial
    expect(inv.entries.length).toBe(n - 1);
    expect(dropItem(inv, 99)).toBe(inv); // out of range → unchanged
  });
  it('use decrements a consumable stack and removes the last one', () => {
    let inv = inventoryFromIds([{ id: 5, count: 2 }]); // 2 vials
    let r = useItem(inv, 0);
    expect(r.consumed).toBe(true);
    expect(r.inventory.entries[0].count).toBe(1);
    r = useItem(r.inventory, 0);
    expect(r.consumed).toBe(true);
    expect(r.inventory.entries.length).toBe(0);
  });
  it('use is a no-op on equippable gear', () => {
    const inv = inventoryFromIds([{ id: 10 }]); // long sword
    const r = useItem(inv, 0);
    expect(r.consumed).toBe(false);
    expect(r.inventory).toBe(inv);
  });
  it('empty inventory recomputes to unarmoured AC', () => {
    expect(wornArmorAc(emptyInventory())).toBe(10);
  });
});

describe('weight (A4.2)', () => {
  it('sums base-item weight times stack count', () => {
    // long sword 40 + shield 100 + leather 150 + chain 300 + staff 40 + 20×arrow(1)=20 + vial 5.
    expect(inventoryWeightTenths(kit())).toBe(40 + 100 + 150 + 300 + 40 + 20 + 5);
    expect(inventoryWeightTenths(emptyInventory())).toBe(0);
    expect(inventoryWeightLb(inventoryFromIds([{ id: 10 }]))).toBe(4); // 40 tenths = 4.0 lb
  });
});

describe('transfer / trade (A4.2)', () => {
  it('moves the whole stack between members and un-readies it on hand-off', () => {
    let a = kit();
    a = readyItem(a, 0); // ready the long sword on A
    expect(a.entries[0].equipped).toBe(true);
    const b = emptyInventory();
    const r = transferItem(a, b, 0); // give the sword to B
    expect(r.moved?.baseTypeId).toBe(10);
    expect(r.from.entries.length).toBe(a.entries.length - 1);
    expect(r.to.entries.length).toBe(1);
    expect(r.to.entries[0].equipped).toBe(false); // readied-weapon rule: un-readied on transfer
    expect(r.to.entries[0].baseTypeId).toBe(10);
  });
  it('moves the full stack count and is a no-op on a bad index', () => {
    const a = inventoryFromIds([{ id: 8, count: 20 }]); // 20 arrows
    const r = transferItem(a, emptyInventory(), 0);
    expect(r.to.entries[0].count).toBe(20);
    const bad = transferItem(a, emptyInventory(), 9);
    expect(bad.moved).toBeNull();
    expect(bad.from).toBe(a);
  });
});
