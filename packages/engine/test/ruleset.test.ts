/**
 * Ruleset core tests (M2.S3a) — registry behaviour + the `addnd1e` ability modifiers and class
 * XP/level progression. Asserts the HIGH-confidence 1e PHB values (see
 * docs/engine/research/addnd1e-tables.md); the deferred attack/save/spell tables are not present
 * and not asserted.
 */
import { describe, it, expect } from 'vitest';
import {
  createRulesetRegistry,
  defaultRulesets,
  addnd1e,
  ADND1E_ID,
  type RulesetPlugin,
} from '../src/index.js';

describe('ruleset registry', () => {
  it('registers, looks up, and lists in insertion order', () => {
    const reg = createRulesetRegistry();
    reg.register(addnd1e);
    expect(reg.get(ADND1E_ID)).toBe(addnd1e);
    expect(reg.get('nope')).toBeUndefined();
    expect(reg.ids()).toEqual([ADND1E_ID]);
  });

  it('rejects duplicate ids', () => {
    const reg = createRulesetRegistry();
    reg.register(addnd1e);
    expect(() => reg.register(addnd1e)).toThrow(/duplicate/);
  });

  it('resolves an overlay to its base-first inheritance chain', () => {
    const reg = createRulesetRegistry();
    const overlay: RulesetPlugin = { ...addnd1e, id: 'addnd1e-dragonlance', extends: ADND1E_ID };
    reg.register(addnd1e);
    reg.register(overlay);
    expect(reg.resolve('addnd1e-dragonlance')?.map((p) => p.id)).toEqual([
      ADND1E_ID,
      'addnd1e-dragonlance',
    ]);
    expect(reg.resolve(ADND1E_ID)?.map((p) => p.id)).toEqual([ADND1E_ID]);
    expect(reg.resolve('missing')).toBeNull();
  });

  it('throws on an unknown extends target and on a cycle', () => {
    const reg = createRulesetRegistry();
    reg.register({ ...addnd1e, id: 'orphan', extends: 'ghost' });
    expect(() => reg.resolve('orphan')).toThrow(/unknown/);

    const reg2 = createRulesetRegistry();
    reg2.register({ ...addnd1e, id: 'a', extends: 'b' });
    reg2.register({ ...addnd1e, id: 'b', extends: 'a' });
    expect(() => reg2.resolve('a')).toThrow(/cycle/);
  });

  it('defaultRulesets ships addnd1e registered', () => {
    expect(defaultRulesets().get(ADND1E_ID)).toBe(addnd1e);
  });
});

describe('addnd1e ability modifiers (1e PHB)', () => {
  const { abilityMods: m } = addnd1e;

  it('strength melee hit/damage incl. exceptional strength', () => {
    expect(m.strength(3)).toEqual({ hit: -3, damage: -1 });
    expect(m.strength(16)).toEqual({ hit: 0, damage: 1 });
    expect(m.strength(17)).toEqual({ hit: 1, damage: 1 });
    expect(m.strength(18)).toEqual({ hit: 1, damage: 2 });
    expect(m.strength(18, 50)).toEqual({ hit: 1, damage: 3 }); // 18/01–50
    expect(m.strength(18, 75)).toEqual({ hit: 2, damage: 3 }); // 18/51–75
    expect(m.strength(18, 90)).toEqual({ hit: 2, damage: 4 }); // 18/76–90
    expect(m.strength(18, 99)).toEqual({ hit: 2, damage: 5 }); // 18/91–99
    expect(m.strength(18, 100)).toEqual({ hit: 3, damage: 6 }); // 18/00
    // percentile ignored off STR 18.
    expect(m.strength(17, 100)).toEqual({ hit: 1, damage: 1 });
  });

  it('clamps out-of-range strength to the table ends', () => {
    expect(m.strength(1)).toEqual(m.strength(3));
    expect(m.strength(99)).toEqual(m.strength(19));
  });

  it('dexterity missile / defensive-AC / reaction', () => {
    expect(m.dexterity(3)).toEqual({ missile: -3, defensiveAc: 4, reaction: -3 });
    expect(m.dexterity(10)).toEqual({ missile: 0, defensiveAc: 0, reaction: 0 });
    expect(m.dexterity(15)).toEqual({ missile: 0, defensiveAc: -1, reaction: 0 });
    // 18 → +3, not the PHB's +2 -- COAB's own DexReactionAdj (M25.S1); see abilities.ts's DEX table doc.
    expect(m.dexterity(18)).toEqual({ missile: 3, defensiveAc: -4, reaction: 3 });
  });

  it('dexterity extends past 19 with the COAB-verified 20-25 bands (M25.S1)', () => {
    expect(m.dexterity(20)).toEqual({ missile: 3, defensiveAc: -4, reaction: 3 });
    expect(m.dexterity(23)).toEqual({ missile: 4, defensiveAc: -4, reaction: 4 });
    expect(m.dexterity(25)).toEqual({ missile: 5, defensiveAc: -4, reaction: 5 });
    expect(m.dexterity(99)).toEqual(m.dexterity(25)); // clamps at the table's top row
  });

  it('constitution HP per HD with the warrior high-CON bonus', () => {
    expect(m.constitution(3).hp).toBe(-2);
    expect(m.constitution(14).hp).toBe(0);
    expect(m.constitution(15).hp).toBe(1);
    expect(m.constitution(16).hp).toBe(2);
    expect(m.constitution(17).hp).toBe(2); // non-warrior caps at +2
    expect(m.constitution(17, true).hp).toBe(3); // warrior
    expect(m.constitution(18, true).hp).toBe(4);
    expect(m.constitution(18).hp).toBe(2);
  });
});

describe('addnd1e XP / level progression (1e PHB)', () => {
  it('fighter cumulative XP thresholds and beyond-name-level increment', () => {
    expect(addnd1e.xpForLevel('fighter', 1)).toBe(0);
    expect(addnd1e.xpForLevel('fighter', 2)).toBe(2000);
    expect(addnd1e.xpForLevel('fighter', 5)).toBe(18000);
    expect(addnd1e.xpForLevel('fighter', 9)).toBe(250000);
    expect(addnd1e.xpForLevel('fighter', 10)).toBe(500000); // +250000
    expect(addnd1e.xpForLevel('fighter', 11)).toBe(750000);
  });

  it('magic-user and thief thresholds', () => {
    expect(addnd1e.xpForLevel('magicUser', 2)).toBe(2500);
    expect(addnd1e.xpForLevel('magicUser', 11)).toBe(375000);
    expect(addnd1e.xpForLevel('magicUser', 12)).toBe(750000); // +375000
    expect(addnd1e.xpForLevel('thief', 2)).toBe(1250);
    expect(addnd1e.xpForLevel('thief', 11)).toBe(220000);
  });

  it('levelForXp is the inverse of the thresholds', () => {
    expect(addnd1e.levelForXp('fighter', 0)).toBe(1);
    expect(addnd1e.levelForXp('fighter', 1999)).toBe(1);
    expect(addnd1e.levelForXp('fighter', 2000)).toBe(2);
    expect(addnd1e.levelForXp('fighter', 17999)).toBe(4);
    expect(addnd1e.levelForXp('fighter', 250000)).toBe(9);
    expect(addnd1e.levelForXp('fighter', 500000)).toBe(10);
    expect(addnd1e.levelForXp('fighter', 999999)).toBe(11);
    expect(addnd1e.levelForXp('fighter', -5)).toBe(1);
  });

  it('round-trips: levelForXp(xpForLevel(L)) === L', () => {
    for (const cls of ['fighter', 'cleric', 'magicUser', 'thief'] as const) {
      for (let L = 1; L <= 14; L++) {
        expect(addnd1e.levelForXp(cls, addnd1e.xpForLevel(cls, L))).toBe(L);
      }
    }
  });

  it('exposes hit dice per class', () => {
    expect(addnd1e.hitDie?.('fighter', 1)).toBe(10);
    expect(addnd1e.hitDie?.('cleric', 1)).toBe(8);
    expect(addnd1e.hitDie?.('thief', 1)).toBe(6);
    expect(addnd1e.hitDie?.('magicUser', 1)).toBe(4);
  });
});
