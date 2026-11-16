/**
 * Dragonlance overlay (M2.S4) — golden tests against the Champions of Krynn manual oracle
 * (docs/engine/research/cok-dragonlance-rules.md). Every assertion pins a value the Journal prints.
 */
import { describe, it, expect } from 'vitest';
import {
  addnd1eDragonlance,
  ADND1E_DRAGONLANCE_ID,
  dragonlance,
  DL_RACES,
  abilityRange,
  exceptionalStrengthCap,
  clampToRace,
  classesForRace,
  allowsClass,
  maxLevel,
  dqkMaxLevel,
  isMultiClassAllowed,
  petitionableOrder,
  knightThac0,
  knightSavingThrows,
  isDeityAllowed,
  deitiesForRace,
  deityThac0Bonus,
  deityHealDieBonus,
  moonPhaseMods,
  moonPhaseForDay,
  moonPhasesForDay,
  thac0,
  savingThrows,
  createRulesetRegistry,
  addnd1e,
  type AbilityScores,
} from '../src/index.js';

describe('Dragonlance overlay — plugin wiring', () => {
  it('extends addnd1e and resolves base-first through the registry', () => {
    expect(addnd1eDragonlance.id).toBe(ADND1E_DRAGONLANCE_ID);
    expect(addnd1eDragonlance.extends).toBe('addnd1e');
    const reg = createRulesetRegistry();
    reg.register(addnd1e);
    reg.register(addnd1eDragonlance);
    const chain = reg.resolve(ADND1E_DRAGONLANCE_ID);
    expect(chain?.map((p) => p.id)).toEqual(['addnd1e', ADND1E_DRAGONLANCE_ID]);
  });

  it('inherits the base ability/THAC0 math unchanged', () => {
    // Overlay spread keeps base members callable.
    expect(addnd1eDragonlance.thac0?.('fighter', 1)).toBe(thac0('fighter', 1));
    expect(addnd1eDragonlance.xpForLevel('fighter', 3)).toBe(addnd1e.xpForLevel('fighter', 3));
  });
});

describe('Dragonlance races', () => {
  it('has exactly the seven CoK races (no Gnome; Elf/Dwarf split)', () => {
    expect(Object.keys(DL_RACES).sort()).toEqual(
      ['halfElf', 'hillDwarf', 'human', 'kender', 'mountainDwarf', 'qualinestiElf', 'silvanestiElf'].sort(),
    );
  });

  it('pins verified ability ranges from the Journal table', () => {
    // Hill Dwarf CON 14-19 (the +1-CON ceiling), CHA 3-12.
    expect(abilityRange('hillDwarf', 'con')).toEqual({ min: 14, max: 19 });
    expect(abilityRange('hillDwarf', 'cha')).toEqual({ min: 3, max: 12 });
    // Silvanesti Elf INT 10-18, CHA 12-18, DEX 7-19 (racial DEX can exceed 18).
    expect(abilityRange('silvanestiElf', 'int')).toEqual({ min: 10, max: 18 });
    expect(abilityRange('silvanestiElf', 'dex')).toEqual({ min: 7, max: 19 });
    // Kender STR capped at 16 with no exceptional strength.
    expect(abilityRange('kender', 'str')).toEqual({ min: 6, max: 16 });
    expect(exceptionalStrengthCap('kender')).toBe(0);
  });

  it('lowers the female STR cap per the table', () => {
    expect(abilityRange('silvanestiElf', 'str', 'male')).toEqual({ min: 3, max: 18 });
    expect(abilityRange('silvanestiElf', 'str', 'female')).toEqual({ min: 3, max: 16 });
    expect(abilityRange('qualinestiElf', 'str', 'male')).toEqual({ min: 7, max: 18 });
  });

  it('clamps generated scores into racial range and caps exceptional STR', () => {
    // A Kender rolled with STR 18(00) → clamped to STR 16, exceptional percentile stripped.
    const rolled: AbilityScores = { str: 18, strPct: 100, int: 20, wis: 1, dex: 20, con: 5, cha: 10 };
    const k = clampToRace(rolled, 'kender');
    expect(k.str).toBe(16);
    expect(k.strPct).toBe(0);
    expect(k.int).toBe(18); // INT 6-18
    expect(k.wis).toBe(3); // WIS 3-16, min floor
    expect(k.con).toBe(10); // CON 10-18, min floor
    // A Hill Dwarf fighter with 18(00) keeps STR 18 but the percentile is capped to 99.
    const d = clampToRace({ str: 18, strPct: 100, int: 10, wis: 10, dex: 10, con: 18, cha: 10 }, 'hillDwarf');
    expect(d.str).toBe(18);
    expect(d.strPct).toBe(99);
  });
});

describe('Dragonlance race/class matrix', () => {
  it('Knight is Human & Half-Elf only', () => {
    expect(allowsClass('human', 'knight')).toBe(true);
    expect(allowsClass('halfElf', 'knight')).toBe(true);
    for (const r of ['silvanestiElf', 'qualinestiElf', 'hillDwarf', 'mountainDwarf', 'kender'] as const) {
      expect(allowsClass(r, 'knight')).toBe(false);
    }
  });

  it('Mage is denied to both dwarves and kender', () => {
    expect(allowsClass('hillDwarf', 'magicUser')).toBe(false);
    expect(allowsClass('mountainDwarf', 'magicUser')).toBe(false);
    expect(allowsClass('kender', 'magicUser')).toBe(false);
    expect(allowsClass('qualinestiElf', 'magicUser')).toBe(true);
  });

  it('Mountain Dwarf cannot be a Ranger; Hill Dwarf can; Silvanesti cannot Thief (appendix)', () => {
    expect(allowsClass('mountainDwarf', 'ranger')).toBe(false);
    expect(allowsClass('hillDwarf', 'ranger')).toBe(true);
    expect(allowsClass('silvanestiElf', 'thief')).toBe(false);
    expect(allowsClass('qualinestiElf', 'thief')).toBe(true);
  });

  it('pins the (low) level caps; Kender fighter/ranger tier by STR', () => {
    expect(maxLevel('human', 'thief')).toBe(9);
    expect(maxLevel('human', 'cleric')).toBe(8);
    expect(maxLevel('human', 'knight')).toBe(7);
    expect(maxLevel('mountainDwarf', 'thief')).toBe(8);
    expect(maxLevel('mountainDwarf', 'ranger')).toBeNull();
    // Kender fighter: STR 16- → 5, 17 → 6, 18+ → 7.
    expect(maxLevel('kender', 'fighter', 16)).toBe(5);
    expect(maxLevel('kender', 'fighter', 17)).toBe(6);
    expect(maxLevel('kender', 'fighter', 18)).toBe(7);
  });

  it('M93.S1 — dqkMaxLevel pins DQK\'s own, materially more permissive but NOT uncapped, table', () => {
    // Humans are uncapped in DQK (unlike CoK's flat 8s/7/9).
    expect(dqkMaxLevel('human', 'fighter')).toBeNull();
    expect(dqkMaxLevel('human', 'cleric')).toBeNull();
    // But several non-human cells still carry a real, finite DQK ceiling (Journal.pdf p.49) —
    // the exact gap this round closes: Tanis, a Half-Elf Fighter, caps at 9 in DQK, not uncapped.
    expect(dqkMaxLevel('halfElf', 'fighter')).toBe(9);
    expect(dqkMaxLevel('silvanestiElf', 'fighter')).toBe(10);
    expect(dqkMaxLevel('qualinestiElf', 'fighter')).toBe(14);
    expect(dqkMaxLevel('kender', 'fighter')).toBe(5);
    expect(dqkMaxLevel('halfElf', 'ranger')).toBe(11);
    expect(dqkMaxLevel('halfElf', 'knight')).toBe(10);
    expect(dqkMaxLevel('halfElf', 'magicUser')).toBe(10);
    expect(dqkMaxLevel('hillDwarf', 'cleric')).toBe(10);
    expect(dqkMaxLevel('mountainDwarf', 'thief')).toBe(8);
    // Uncapped in DQK's own table (distinct from CoK, where these same cells are capped/disallowed).
    expect(dqkMaxLevel('silvanestiElf', 'ranger')).toBeNull();
    expect(dqkMaxLevel('qualinestiElf', 'thief')).toBeNull();
  });

  it('only non-humans may multi-class', () => {
    expect(isMultiClassAllowed('human')).toBe(false);
    expect(isMultiClassAllowed('qualinestiElf')).toBe(true);
    expect(isMultiClassAllowed('kender')).toBe(true);
  });

  it('classesForRace reflects the matrix (e.g. dwarves have no mage/knight)', () => {
    expect(classesForRace('hillDwarf')).toEqual(['cleric', 'fighter', 'ranger', 'thief']);
    expect(classesForRace('human')).toEqual(['cleric', 'fighter', 'ranger', 'knight', 'magicUser', 'thief']);
  });
});

describe('Knight of Solamnia', () => {
  it('fights and saves on the fighter tables', () => {
    for (const lvl of [1, 5, 7]) {
      expect(knightThac0(lvl)).toBe(thac0('fighter', lvl));
      expect(knightSavingThrows(lvl)).toEqual(savingThrows('fighter', lvl));
    }
  });

  it('petitions the highest order whose ability minimums are met', () => {
    // Below Sword minimums → entry order Crown.
    expect(petitionableOrder({ str: 11, int: 8, wis: 12, dex: 11, con: 14, cha: 10 })).toBe('crown');
    // Meets Sword (STR12/INT9/WIS13/DEX9/CON10) but not Rose (STR15).
    expect(petitionableOrder({ str: 13, int: 9, wis: 13, dex: 12, con: 15, cha: 10 })).toBe('sword');
    // Meets Rose (STR15/INT10/WIS13/DEX12/CON15).
    expect(petitionableOrder({ str: 16, int: 12, wis: 14, dex: 13, con: 16, cha: 10 })).toBe('rose');
  });

  it('M96.S1 — meets the real Sword floor (DEX 9/CON 10) even when below the old, mis-transcribed Rose-borrowed floor (DEX 12/CON 15)', () => {
    // Journal p.9: Sword = STR 12, INT 9, WIS 13, DEX 9, CON 10. This ability spread clears Sword's
    // real DEX/CON with margin but falls short of the pre-M96 buggy floor that had copied Rose's
    // stricter DEX 12/CON 15 — before the fix this returned 'crown', silently under-titling the knight.
    expect(petitionableOrder({ str: 13, int: 10, wis: 14, dex: 10, con: 12, cha: 10 })).toBe('sword');
  });
});

describe('Dragonlance deities', () => {
  it('forces dwarven clerics to Reorx', () => {
    expect(isDeityAllowed('reorx', 'hillDwarf')).toBe(true);
    expect(isDeityAllowed('mishakal', 'hillDwarf')).toBe(false);
    expect(isDeityAllowed('mishakal', 'human')).toBe(true);
    expect(deitiesForRace('mountainDwarf').map((d) => d.id)).toEqual(['reorx']);
  });

  it('applies THAC0 grants — Kiri-Jolith +1 for all, Reorx +1 dwarves only', () => {
    expect(deityThac0Bonus('kiriJolith', 'human')).toBe(1);
    expect(deityThac0Bonus('reorx', 'hillDwarf')).toBe(1);
    expect(deityThac0Bonus('reorx', 'human')).toBe(0); // dwarf-only
    expect(deityThac0Bonus('mishakal', 'human')).toBe(0); // grants healing, not THAC0
  });

  it("applies Mishakal's +1 healing-die grant, and only Mishakal's (M18.S1)", () => {
    expect(deityHealDieBonus('mishakal')).toBe(1);
    expect(deityHealDieBonus('kiriJolith')).toBe(0); // grants THAC0, not healing
    expect(deityHealDieBonus(undefined)).toBe(0); // no deity (non-cleric)
  });
});

describe('Three moons — mage modifiers', () => {
  it('matches the moon-phase effect table', () => {
    expect(moonPhaseMods('lowSanction')).toEqual({ saveMod: -1, additionalSpells: 0, effectiveLevelMod: -1 });
    expect(moonPhaseMods('waning')).toEqual({ saveMod: 0, additionalSpells: 0, effectiveLevelMod: 0 });
    expect(moonPhaseMods('waxing')).toEqual({ saveMod: 0, additionalSpells: 1, effectiveLevelMod: 0 });
  });

  it('full-moon +1 effective level only for level≥6 & INT≥15', () => {
    expect(moonPhaseMods('highSanction', { level: 6, int: 15 }).effectiveLevelMod).toBe(1);
    expect(moonPhaseMods('highSanction', { level: 5, int: 18 }).effectiveLevelMod).toBe(0);
    expect(moonPhaseMods('highSanction', { level: 9, int: 14 }).effectiveLevelMod).toBe(0);
    // Saves/extra spells still apply regardless of the level/INT gate.
    expect(moonPhaseMods('highSanction', { level: 1, int: 1 })).toMatchObject({ saveMod: 1, additionalSpells: 2 });
  });

  it('walks each moon through the new→waxing→full→waning cycle by game day', () => {
    // Day 0 = every moon new (low sanction); the fast black moon (period 8) hits each quarter first.
    expect(moonPhaseForDay('black', 0)).toBe('lowSanction');
    expect(moonPhaseForDay('black', 2)).toBe('waxing');
    expect(moonPhaseForDay('black', 4)).toBe('highSanction');
    expect(moonPhaseForDay('black', 6)).toBe('waning');
    // Full period returns to new; negative days wrap cleanly.
    expect(moonPhaseForDay('black', 8)).toBe('lowSanction');
    expect(moonPhaseForDay('black', -8)).toBe('lowSanction');
    // The three moons cycle at different rates, so they generally read different phases.
    const reads = moonPhasesForDay(5);
    expect(reads.map((r) => r.robe)).toEqual(['white', 'red', 'black']);
    expect(reads[2].info.moon).toBe('Nuitari');
    expect(reads.every((r) => r.illumination >= 0 && r.illumination <= 1)).toBe(true);
  });
});

describe('dragonlance grouped surface', () => {
  it('exposes the same helpers via the data object', () => {
    expect(dragonlance.id).toBe(ADND1E_DRAGONLANCE_ID);
    expect(dragonlance.allowsClass('human', 'knight')).toBe(true);
    expect(dragonlance.maxLevel('kender', 'fighter', 18)).toBe(7);
    expect(dragonlance.moonPhaseMods('waxing').additionalSpells).toBe(1);
  });
});
