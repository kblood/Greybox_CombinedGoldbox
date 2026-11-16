/**
 * AD&D-1e spell-slot progression (M2.S4b). Golden values are the canonical PHB tables, which the
 * SSI engine reproduces (coab `ClericSpellLevels` / `MU_spell_lvl_learn` accumulation) — so these
 * double as a cross-check that our delta accumulation matches the engine.
 */
import { describe, it, expect } from 'vitest';
import {
  spellSlots,
  clericWisdomBonusSpells,
  clericSpellSlots,
  addnd1e,
} from '../src/index.js';

describe('magic-user spell slots (PHB)', () => {
  it('matches the canonical per-level table 1..11', () => {
    expect(spellSlots('magicUser', 1)).toEqual([1, 0, 0, 0, 0]);
    expect(spellSlots('magicUser', 2)).toEqual([2, 0, 0, 0, 0]);
    expect(spellSlots('magicUser', 3)).toEqual([2, 1, 0, 0, 0]);
    expect(spellSlots('magicUser', 4)).toEqual([3, 2, 0, 0, 0]);
    expect(spellSlots('magicUser', 5)).toEqual([4, 2, 1, 0, 0]);
    expect(spellSlots('magicUser', 6)).toEqual([4, 2, 2, 0, 0]);
    expect(spellSlots('magicUser', 7)).toEqual([4, 3, 2, 1, 0]);
    expect(spellSlots('magicUser', 8)).toEqual([4, 3, 3, 2, 0]);
    expect(spellSlots('magicUser', 9)).toEqual([4, 3, 3, 2, 1]);
    expect(spellSlots('magicUser', 10)).toEqual([4, 4, 3, 2, 2]);
    expect(spellSlots('magicUser', 11)).toEqual([4, 4, 4, 3, 3]);
  });

  it('treats illusionist as the magic-user track', () => {
    expect(spellSlots('illusionist', 5)).toEqual(spellSlots('magicUser', 5));
  });
});

describe('cleric spell slots (PHB)', () => {
  it('matches the canonical per-level table 1..9', () => {
    expect(spellSlots('cleric', 1)).toEqual([1, 0, 0, 0, 0]);
    expect(spellSlots('cleric', 2)).toEqual([2, 0, 0, 0, 0]);
    expect(spellSlots('cleric', 3)).toEqual([2, 1, 0, 0, 0]);
    expect(spellSlots('cleric', 4)).toEqual([3, 2, 0, 0, 0]);
    expect(spellSlots('cleric', 5)).toEqual([3, 3, 1, 0, 0]);
    expect(spellSlots('cleric', 6)).toEqual([3, 3, 2, 0, 0]);
    expect(spellSlots('cleric', 7)).toEqual([3, 3, 2, 1, 0]);
    expect(spellSlots('cleric', 8)).toEqual([3, 3, 3, 2, 0]);
    expect(spellSlots('cleric', 9)).toEqual([4, 4, 3, 2, 1]);
  });

  it('treats druid as the cleric track', () => {
    expect(spellSlots('druid', 4)).toEqual(spellSlots('cleric', 4));
  });
});

describe('non-casters and bounds', () => {
  it('fighters/thieves/rangers get no base slots', () => {
    for (const c of ['fighter', 'thief', 'ranger', 'paladin'] as const) {
      expect(spellSlots(c, 9)).toEqual([0, 0, 0, 0, 0]);
    }
  });
  it('level < 1 yields zeros', () => {
    expect(spellSlots('magicUser', 0)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('cleric Wisdom bonus spells (PHB)', () => {
  it('adds 1st-level bonuses at Wis 13/14', () => {
    expect(clericWisdomBonusSpells(13, 1)).toEqual([1, 0, 0, 0, 0]);
    expect(clericWisdomBonusSpells(14, 1)).toEqual([2, 0, 0, 0, 0]);
  });
  it('adds 2nd-level bonuses at Wis 15/16 — but only where a base slot exists', () => {
    // A level-1 cleric has no 2nd-level base slot, so the 2nd-level bonus is suppressed.
    expect(clericWisdomBonusSpells(16, 1)).toEqual([2, 0, 0, 0, 0]);
    // A level-3 cleric (base [2,1,..]) gets the 2nd-level bonuses.
    expect(clericWisdomBonusSpells(16, 3)).toEqual([2, 2, 0, 0, 0]);
  });
  it('adds 3rd/4th-level bonuses at Wis 17/18 where slots exist', () => {
    // Level-9 cleric (base [4,4,3,2,1]) with Wis 18 → +2 L1, +2 L2, +1 L3, +1 L4.
    expect(clericWisdomBonusSpells(18, 9)).toEqual([2, 2, 1, 1, 0]);
    expect(clericSpellSlots(9, 18)).toEqual([6, 6, 4, 3, 1]);
  });
});

describe('plugin exposes spellSlots', () => {
  it('is callable through the ruleset plugin', () => {
    expect(addnd1e.spellSlots?.('magicUser', 7)).toEqual([4, 3, 2, 1, 0]);
  });
});
