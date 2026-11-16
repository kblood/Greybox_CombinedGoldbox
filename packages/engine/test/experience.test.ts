/**
 * Post-combat XP award/split tests (ovr006 `calc_battle_exp` / `addExp`) — asserts the two
 * VERIFIED formulas from `docs/engine/research/decompile-ovr006-xp-treasure.md`:
 *   battle XP = Σ(perHpXp·rolledHp + flatXp) + goldXP + Σ(plus·400);
 *   per-char share = total / (party − animated); single class +10% on prime-req 16+,
 *   multiclass ÷ nClasses.
 */
import { describe, it, expect } from 'vitest';
import {
  calcBattleExp,
  calcDuelExp,
  hasPrimeRequisiteBonus,
  characterXpShare,
  awardCombatExperience,
  type AbilityScores,
  type XpRecipient,
} from '../src/index.js';

const AB = (over: Partial<AbilityScores> = {}): AbilityScores => ({
  str: 10,
  int: 10,
  wis: 10,
  dex: 10,
  con: 10,
  cha: 10,
  ...over,
});

describe('calcBattleExp', () => {
  it('sums perHpXp·rolledHp + flatXp per enemy', () => {
    // 2 goblins: 5·7 + 10 = 45 each → 90
    const total = calcBattleExp([
      { perHpXp: 5, rolledHp: 7, flatXp: 10 },
      { perHpXp: 5, rolledHp: 7, flatXp: 10 },
    ]);
    expect(total).toBe(90);
  });

  it('uses flatXp alone when HD terms are absent (our monster.ts @304 case)', () => {
    expect(calcBattleExp([{ flatXp: 35 }, { flatXp: 35 }])).toBe(70);
  });

  it('adds gold XP worth and +plus·400 for positive-plus magic items only', () => {
    const total = calcBattleExp([{ flatXp: 100 }], {
      goldXpWorth: 250,
      itemPluses: [2, 0, -1, 3], // +2 and +3 count → (2+3)·400 = 2000
    });
    expect(total).toBe(100 + 250 + 2000);
  });

  it('is zero for an empty battle', () => {
    expect(calcBattleExp([])).toBe(0);
  });

  // M26.S1 — the real DoK MON1CHA/MON1ITM SOLAMNIC KNIGHT (id 64) carries a single +1 item among its
  // decoded itemPluses ([0, 0, 1], see monsterSideTables.test.ts's applyItemPluses real-bytes test);
  // once joined, this is the exact XP bonus that real byte should produce.
  it("real SOLAMNIC KNIGHT itemPluses ([0, 0, 1]) is worth exactly one item-plus's XP", () => {
    expect(calcBattleExp([{ flatXp: 0 }], { itemPluses: [0, 0, 1] })).toBe(400);
  });
});

describe('calcDuelExp', () => {
  it('awards HitDice·100', () => {
    expect(calcDuelExp(7)).toBe(700);
    expect(calcDuelExp(0)).toBe(0);
  });
});

describe('hasPrimeRequisiteBonus', () => {
  it('fighter needs Str 16+', () => {
    expect(hasPrimeRequisiteBonus('fighter', AB({ str: 16 }))).toBe(true);
    expect(hasPrimeRequisiteBonus('fighter', AB({ str: 15 }))).toBe(false);
  });
  it('paladin needs Str AND Wis 16+', () => {
    expect(hasPrimeRequisiteBonus('paladin', AB({ str: 16, wis: 16 }))).toBe(true);
    expect(hasPrimeRequisiteBonus('paladin', AB({ str: 16, wis: 15 }))).toBe(false);
  });
  it('ranger needs Str AND Int AND Wis 16+', () => {
    expect(hasPrimeRequisiteBonus('ranger', AB({ str: 16, int: 16, wis: 16 }))).toBe(true);
    expect(hasPrimeRequisiteBonus('ranger', AB({ str: 16, int: 15, wis: 16 }))).toBe(false);
  });
  it('cleric→Wis, magicUser→Int, thief→Dex', () => {
    expect(hasPrimeRequisiteBonus('cleric', AB({ wis: 18 }))).toBe(true);
    expect(hasPrimeRequisiteBonus('magicUser', AB({ int: 18 }))).toBe(true);
    expect(hasPrimeRequisiteBonus('thief', AB({ dex: 18 }))).toBe(true);
    expect(hasPrimeRequisiteBonus('thief', AB({ dex: 12 }))).toBe(false);
  });
});

describe('characterXpShare', () => {
  it('single class with prime req gets +10% (floored)', () => {
    // 105 + floor(105/10)=10 → 115
    expect(characterXpShare(105, { abilities: AB({ str: 17 }), classes: ['fighter'] })).toBe(115);
  });
  it('single class without prime req gets the plain share', () => {
    expect(characterXpShare(105, { abilities: AB({ str: 10 }), classes: ['fighter'] })).toBe(105);
  });
  it('dual class splits ÷2, triple ÷3, and takes no prime-req bonus', () => {
    const ab = AB({ str: 18, int: 18, wis: 18, dex: 18 });
    expect(characterXpShare(100, { abilities: ab, classes: ['fighter', 'magicUser'] })).toBe(50);
    expect(
      characterXpShare(100, { abilities: ab, classes: ['fighter', 'magicUser', 'thief'] }),
    ).toBe(33);
  });
  it('awards nothing to animated or absent members', () => {
    expect(characterXpShare(100, { abilities: AB(), classes: ['fighter'], animated: true })).toBe(0);
    expect(
      characterXpShare(100, { abilities: AB(), classes: ['fighter'], inCombat: false }),
    ).toBe(0);
  });
});

describe('awardCombatExperience', () => {
  it('splits by non-animated party size then applies per-character rules', () => {
    const party: XpRecipient[] = [
      { abilities: AB({ str: 17 }), classes: ['fighter'] }, // +10%
      { abilities: AB(), classes: ['cleric', 'fighter'] }, // dual ÷2
      { abilities: AB(), classes: ['magicUser'] }, // plain
    ];
    // total 600 / 3 living = 200 share
    const awards = awardCombatExperience(party, 600);
    expect(awards.map((a) => a.awarded)).toEqual([220, 100, 200]);
  });

  it('excludes animated members from the divisor and the award', () => {
    const party: XpRecipient[] = [
      { abilities: AB(), classes: ['fighter'] },
      { abilities: AB(), classes: ['cleric'] },
      { abilities: AB(), classes: ['magicUser'], animated: true }, // skeleton — no share
    ];
    // 600 / (3 − 1) = 300 each to the two living; animated gets 0
    const awards = awardCombatExperience(party, 600);
    expect(awards.map((a) => a.awarded)).toEqual([300, 300, 0]);
  });

  it('a member who sat out still counts toward the divisor but earns nothing', () => {
    const party: XpRecipient[] = [
      { abilities: AB(), classes: ['fighter'] },
      { abilities: AB(), classes: ['cleric'], inCombat: false }, // counted, unpaid
    ];
    // 600 / 2 = 300 share; absent member earns 0
    const awards = awardCombatExperience(party, 600);
    expect(awards.map((a) => a.awarded)).toEqual([300, 0]);
  });

  it('never divides by zero when the whole party is animated', () => {
    const party: XpRecipient[] = [
      { abilities: AB(), classes: ['fighter'], animated: true },
    ];
    expect(() => awardCombatExperience(party, 100)).not.toThrow();
    expect(awardCombatExperience(party, 100)[0].awarded).toBe(0);
  });
});
