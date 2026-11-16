/**
 * Multiclass / dual-class recalc tests (ovr026 ReclacClassBonuses) — asserts the compositing rules
 * from `docs/engine/research/decompile-ovr026-class-recalc.md`: best-of THAC0, max-level hit dice,
 * the warrior multiple-attack breakpoints (current + dual-class reactivation), and the Con-based
 * poison-save bonus.
 */
import { describe, it, expect } from 'vitest';
import {
  bestThac0,
  maxClassLevel,
  warriorMultipleAttacks,
  dualClassWarriorReactivates,
  conPoisonSaveBonus,
  recalcCombatProfile,
  type ClassSlot,
} from '../src/index.js';

// A deterministic stub: THAC0 = 20 − (level − 1) for any class (lower = better), floored at 1.
const stubThac0 = (_c: string, level: number) => Math.max(1, 20 - (level - 1));

describe('bestThac0 — best (lowest) matrix over class slots', () => {
  it('picks the lowest THAC0 across a multiclass set', () => {
    const slots: ClassSlot[] = [
      { classId: 'fighter', level: 5 }, // 16
      { classId: 'magicUser', level: 9 }, // 12
    ];
    expect(bestThac0(slots, stubThac0)).toBe(12);
  });
  it('ignores level-0 slots and defaults to 20 for no class', () => {
    expect(bestThac0([{ classId: 'thief', level: 0 }], stubThac0)).toBe(20);
    expect(bestThac0([], stubThac0)).toBe(20);
  });
});

describe('maxClassLevel — hit dice = highest class level', () => {
  it('returns the max level among active slots', () => {
    expect(
      maxClassLevel([
        { classId: 'fighter', level: 6 },
        { classId: 'thief', level: 9 },
      ]),
    ).toBe(9);
    expect(maxClassLevel([])).toBe(0);
  });
});

describe('warriorMultipleAttacks — current-class breakpoint', () => {
  it('fighter≥7, paladin≥7, ranger≥8 grant multi-attack', () => {
    expect(warriorMultipleAttacks([{ classId: 'fighter', level: 7 }])).toBe(true);
    expect(warriorMultipleAttacks([{ classId: 'paladin', level: 7 }])).toBe(true);
    expect(warriorMultipleAttacks([{ classId: 'ranger', level: 8 }])).toBe(true);
  });
  it('below the breakpoint, no multi-attack', () => {
    expect(warriorMultipleAttacks([{ classId: 'fighter', level: 6 }])).toBe(false);
    expect(warriorMultipleAttacks([{ classId: 'ranger', level: 7 }])).toBe(false);
    expect(warriorMultipleAttacks([{ classId: 'magicUser', level: 12 }])).toBe(false);
  });
});

describe('dualClassWarriorReactivates — old-class breakpoint (>6 / >7)', () => {
  it('old fighter/paladin > 6 or old ranger > 7 reactivates multi-attack', () => {
    expect(dualClassWarriorReactivates([{ classId: 'fighter', level: 7 }])).toBe(true);
    expect(dualClassWarriorReactivates([{ classId: 'ranger', level: 8 }])).toBe(true);
  });
  it('at or below the old breakpoint, no reactivation', () => {
    expect(dualClassWarriorReactivates([{ classId: 'fighter', level: 6 }])).toBe(false);
    expect(dualClassWarriorReactivates([{ classId: 'ranger', level: 7 }])).toBe(false);
  });
});

describe('conPoisonSaveBonus — dwarf/halfling Con table', () => {
  it('maps each verified tier', () => {
    expect(conPoisonSaveBonus(3)).toBe(0);
    expect(conPoisonSaveBonus(4)).toBe(1);
    expect(conPoisonSaveBonus(6)).toBe(1);
    expect(conPoisonSaveBonus(7)).toBe(2);
    expect(conPoisonSaveBonus(10)).toBe(2);
    expect(conPoisonSaveBonus(11)).toBe(3);
    expect(conPoisonSaveBonus(13)).toBe(3);
    expect(conPoisonSaveBonus(14)).toBe(4);
    expect(conPoisonSaveBonus(17)).toBe(4);
    expect(conPoisonSaveBonus(18)).toBe(5); // inferred continuation
  });
});

describe('recalcCombatProfile — composite', () => {
  it('composes THAC0/hitDice/multi-attack for a plain multiclass', () => {
    const slots: ClassSlot[] = [
      { classId: 'fighter', level: 7 },
      { classId: 'magicUser', level: 9 },
    ];
    const p = recalcCombatProfile(slots, [], stubThac0);
    expect(p).toEqual({ thac0: 12, hitDiceLevel: 9, multipleAttacks: true });
  });

  it('reactivated dual-class old warrior raises THAC0 and multi-attack but not hit dice', () => {
    // current: mage 5 (THAC0 16); old: fighter 8 (THAC0 13) reactivated
    const slots: ClassSlot[] = [{ classId: 'magicUser', level: 5 }];
    const oldSlots: ClassSlot[] = [{ classId: 'fighter', level: 8 }];
    const p = recalcCombatProfile(slots, oldSlots, stubThac0);
    expect(p.thac0).toBe(13); // best of new(16) + old(13)
    expect(p.hitDiceLevel).toBe(5); // old class does not raise hit dice
    expect(p.multipleAttacks).toBe(true); // old fighter 8 > 6
  });
});
