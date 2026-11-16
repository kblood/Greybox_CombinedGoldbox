/**
 * `classFlags` item-usability gating + `UndreadyAll` (ovr026 `ReclacClassBonuses` lines 211-222) —
 * the piece of the multiclass recalc left TODO by `recalc.test.ts`. See
 * `docs/engine/research/decompile-ovr026-class-recalc.md`.
 */
import { describe, it, expect } from 'vitest';
import {
  CLASS_FLAG,
  computeClassFlags,
  itemUsableByClassFlags,
  findItemsToUnready,
  type DragonlanceClassSlot,
} from '../src/index.js';
import { decodeDqkBaseItem, decodeDqkItemRecord } from '../src/index.js';

describe('CLASS_FLAG — verified against hackdocs CCHFORM.TXT offset 183', () => {
  it('matches the documented Item Use Indicator bit values', () => {
    expect(CLASS_FLAG.magicUser).toBe(0x01);
    expect(CLASS_FLAG.cleric).toBe(0x02);
    expect(CLASS_FLAG.thief).toBe(0x04);
    expect(CLASS_FLAG.fighter).toBe(0x08);
    expect(CLASS_FLAG.knight).toBe(0x10);
    expect(CLASS_FLAG.ranger).toBe(0x40);
  });
});

describe('computeClassFlags — current classes', () => {
  it('ORs the bit of every active current class', () => {
    const slots: DragonlanceClassSlot[] = [
      { classId: 'fighter', level: 5 },
      { classId: 'cleric', level: 3 },
    ];
    expect(computeClassFlags(slots, [], 5)).toBe(0x08 | 0x02);
  });
  it('ignores level-0 slots', () => {
    expect(computeClassFlags([{ classId: 'thief', level: 0 }], [], 0)).toBe(0);
    expect(computeClassFlags([], [], 0)).toBe(0);
  });
  it('a single-class knight gets only the knight bit', () => {
    expect(computeClassFlags([{ classId: 'knight', level: 9 }], [], 9)).toBe(0x10);
  });
});

describe('computeClassFlags — dual-class old-slot reactivation window', () => {
  it('withholds the old class while its frozen level is still ahead of current hit dice', () => {
    // Dual-classed fighter(6, frozen) -> cleric(4 active). HitDice = max active level = 4.
    const slots: DragonlanceClassSlot[] = [{ classId: 'cleric', level: 4 }];
    const oldSlots: DragonlanceClassSlot[] = [{ classId: 'fighter', level: 6 }];
    // old fighter level (6) is NOT below hitDiceLevel (4) -> not yet reactivated, cleric-only.
    expect(computeClassFlags(slots, oldSlots, 4)).toBe(0x02);
  });
  it('reactivates the old class once the new class level surpasses the frozen old level', () => {
    const slots: DragonlanceClassSlot[] = [{ classId: 'cleric', level: 7 }];
    const oldSlots: DragonlanceClassSlot[] = [{ classId: 'fighter', level: 6 }];
    // hitDiceLevel = 7 (new cleric level) > old fighter's frozen 6 -> fighter gear usable again too.
    expect(computeClassFlags(slots, oldSlots, 7)).toBe(0x02 | 0x08);
  });
  it('keeps the old class withheld while the new class has not yet caught up', () => {
    const slots: DragonlanceClassSlot[] = [{ classId: 'cleric', level: 2 }];
    const oldSlots: DragonlanceClassSlot[] = [{ classId: 'fighter', level: 6 }];
    // hitDiceLevel = 2 (new cleric level), still below old fighter's frozen 6 -> fighter stays gated off.
    expect(computeClassFlags(slots, oldSlots, 2)).toBe(0x02);
  });
  it('ignores a level-0 old slot', () => {
    expect(computeClassFlags([], [{ classId: 'fighter', level: 0 }], 0)).toBe(0);
  });
});

describe('itemUsableByClassFlags — the ovr026.cs:693 / Player.cs:308 AND-check', () => {
  it('usable when any bit overlaps', () => {
    expect(itemUsableByClassFlags(0x08 | 0x10, 0x08)).toBe(true);
  });
  it('not usable when no bit overlaps', () => {
    expect(itemUsableByClassFlags(0x01, 0x08)).toBe(false);
  });
  it('does NOT special-case itemClassFlags === 0 as unrestricted (byte-faithful AND)', () => {
    expect(itemUsableByClassFlags(0, 0x08)).toBe(false);
  });
});

describe('findItemsToUnready — UndreadyAll(classFlags)', () => {
  interface Slot {
    equipped: boolean;
    itemClassFlags: number;
    cursed: boolean;
  }
  const get = (s: Slot) => s;

  it('un-readies an equipped item the new classFlags no longer covers', () => {
    const slots: Slot[] = [
      { equipped: true, itemClassFlags: 0x08, cursed: false }, // fighter-only weapon
      { equipped: true, itemClassFlags: 0x02, cursed: false }, // cleric-usable armour
    ];
    // player is now cleric-only (0x02): slot 0 (fighter-only) should drop, slot 1 stays.
    expect(findItemsToUnready(slots, 0x02, get)).toEqual([0]);
  });
  it('leaves non-equipped items alone even if class-incompatible', () => {
    const slots: Slot[] = [{ equipped: false, itemClassFlags: 0x08, cursed: false }];
    expect(findItemsToUnready(slots, 0x02, get)).toEqual([]);
  });
  it('a cursed item stays readied even when class-incompatible', () => {
    const slots: Slot[] = [{ equipped: true, itemClassFlags: 0x08, cursed: true }];
    expect(findItemsToUnready(slots, 0x02, get)).toEqual([]);
  });
  it('a compatible equipped item is left alone', () => {
    const slots: Slot[] = [{ equipped: true, itemClassFlags: 0x08 | 0x02, cursed: false }];
    expect(findItemsToUnready(slots, 0x02, get)).toEqual([]);
  });
});

describe('findItemsToUnready — composed against real decoded DQK ITEMS.DAT/item.dat bytes', () => {
  // 0xFE = usable by everyone but Magic-User (a common melee-weapon pattern in the real catalogue).
  const meleeWeaponRaw = new Uint8Array(16);
  meleeWeaponRaw[13] = 0xfe;
  const meleeWeapon = decodeDqkBaseItem(meleeWeaponRaw, 1);

  // 0x01 = Magic-User only (e.g. a dagger reserved for mages under this bitmask scheme).
  const mageOnlyRaw = new Uint8Array(16);
  mageOnlyRaw[13] = 0x01;
  const mageOnlyItem = decodeDqkBaseItem(mageOnlyRaw, 2);

  function itemRecord(baseTypeId: number, ready: boolean, cursed: boolean) {
    const raw = new Uint8Array(18);
    raw[0] = baseTypeId;
    raw[10] = ready ? 1 : 0;
    raw[12] = cursed ? 1 : 0;
    return decodeDqkItemRecord(raw, 0);
  }

  it('a fighter carrying a mage-only item gets it un-readied on recalc', () => {
    const catalogue = { [meleeWeapon.index]: meleeWeapon, [mageOnlyItem.index]: mageOnlyItem };
    const inventory = [itemRecord(meleeWeapon.index, true, false), itemRecord(mageOnlyItem.index, true, false)];
    const playerClassFlags = computeClassFlags([{ classId: 'fighter', level: 5 }], [], 5);
    const toUnready = findItemsToUnready(inventory, playerClassFlags, (rec) => ({
      equipped: rec.ready,
      itemClassFlags: catalogue[rec.baseTypeId].classMask,
      cursed: rec.cursed,
    }));
    expect(toUnready).toEqual([1]); // only the mage-only item (index 1 in the inventory array)
  });
});
