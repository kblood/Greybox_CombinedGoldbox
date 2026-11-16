/**
 * CoK character creation/validation (M2.S4c). Confirms the validator enforces the manual's race/class
 * rules and that a legal request derives the right combat + spell stats.
 */
import { describe, it, expect } from 'vitest';
import {
  createCharacter,
  thac0,
  savingThrows,
  spellSlots,
  clericSpellSlots,
  conPoisonSaveBonus,
  type CharacterRequest,
} from '../src/index.js';

/** A legal baseline: a human fighter. Tests clone-and-tweak this. */
function base(overrides: Partial<CharacterRequest> = {}): CharacterRequest {
  return {
    name: 'Test',
    race: 'human',
    sex: 'male',
    classes: { fighter: 5 },
    abilities: { str: 17, strPct: 0, int: 10, wis: 10, dex: 16, con: 14, cha: 10 },
    hp: 40,
    maxHp: 40,
    baseAc: 4,
    ...overrides,
  };
}

describe('createCharacter — validation', () => {
  it('accepts a legal human fighter', () => {
    const res = createCharacter(base());
    expect(res.ok).toBe(true);
  });

  it('rejects a class the race may not take', () => {
    const res = createCharacter(base({ race: 'hillDwarf', classes: { magicUser: 3 } }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(' ')).toMatch(/hillDwarf may not be a magicUser/);
  });

  it('rejects multi-class for humans', () => {
    const res = createCharacter(base({ classes: { fighter: 4, thief: 4 } }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(' ')).toMatch(/may not multi-class/);
  });

  it('allows multi-class for non-humans across their permitted classes', () => {
    const res = createCharacter(
      base({
        race: 'qualinestiElf',
        classes: { fighter: 4, magicUser: 4 },
        abilities: { str: 14, strPct: 0, int: 14, wis: 10, dex: 16, con: 12, cha: 12 },
      }),
    );
    expect(res.ok).toBe(true);
  });

  it('rejects a level above the racial cap', () => {
    // Kender fighter caps at 5 with STR ≤ 16.
    const res = createCharacter(
      base({
        race: 'kender',
        classes: { fighter: 7 },
        abilities: { str: 16, strPct: 0, int: 10, wis: 10, dex: 16, con: 12, cha: 10 },
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(' ')).toMatch(/exceeds the kender cap of 5/);
  });

  it('M95.S1 — levelCapRuleset: "dqk" validates against DQK\'s own, more permissive table, not CoK\'s', () => {
    // A human cleric at level 10 exceeds CoK's flat cap of 8 (Journal p.56) but DQK's own manual
    // places no cap on a human cleric (dqkMaxLevel('human','cleric') === null, M93).
    const cok = createCharacter(base({ classes: { cleric: 10 }, deity: 'mishakal' }));
    expect(cok.ok).toBe(false);
    if (!cok.ok) expect(cok.errors.join(' ')).toMatch(/exceeds the human cap of 8/);

    const dqk = createCharacter(base({ classes: { cleric: 10 }, deity: 'mishakal', levelCapRuleset: 'dqk' }));
    expect(dqk.ok).toBe(true);

    // DQK's own table is not uniformly uncapped either: a Half-Elf Fighter caps at 9 even under 'dqk'.
    const halfElfDqk = createCharacter(
      base({
        race: 'halfElf',
        classes: { fighter: 10 },
        abilities: { str: 16, strPct: 0, int: 12, wis: 11, dex: 16, con: 14, cha: 15 },
        levelCapRuleset: 'dqk',
      }),
    );
    expect(halfElfDqk.ok).toBe(false);
    if (!halfElfDqk.ok) expect(halfElfDqk.errors.join(' ')).toMatch(/exceeds the halfElf cap of 9/);
  });

  it('rejects ability scores outside the racial range', () => {
    // Hill Dwarf CHA caps at 12.
    const res = createCharacter(
      base({
        race: 'hillDwarf',
        classes: { fighter: 5 },
        abilities: { str: 16, strPct: 0, int: 10, wis: 10, dex: 14, con: 15, cha: 18 },
      }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join(' ')).toMatch(/CHA 18 out of hillDwarf range 3-12/);
  });

  it('requires a deity for clerics and forces dwarves to Reorx', () => {
    const noDeity = createCharacter(base({ classes: { cleric: 5 }, abilities: base().abilities }));
    expect(noDeity.ok).toBe(false);
    if (!noDeity.ok) expect(noDeity.errors.join(' ')).toMatch(/Cleric must choose a deity/);

    const dwarfWrongDeity = createCharacter(
      base({
        race: 'hillDwarf',
        classes: { cleric: 5 },
        abilities: { str: 14, strPct: 0, int: 10, wis: 14, dex: 12, con: 16, cha: 8 },
        deity: 'mishakal',
      }),
    );
    expect(dwarfWrongDeity.ok).toBe(false);
    if (!dwarfWrongDeity.ok) expect(dwarfWrongDeity.errors.join(' ')).toMatch(/must worship Reorx/);
  });

  it('rejects Black Robe (NPC-only) but allows White/Red, and permits no robe at all (M21.S1)', () => {
    const abilities = { str: 10, strPct: 0, int: 15, wis: 10, dex: 10, con: 12, cha: 10 };
    const black = createCharacter(base({ classes: { magicUser: 3 }, abilities, robe: 'black' }));
    expect(black.ok).toBe(false);
    if (!black.ok) expect(black.errors.join(' ')).toMatch(/Black Robe is NPC-only/);

    const white = createCharacter(base({ classes: { magicUser: 3 }, abilities, robe: 'white' }));
    expect(white.ok).toBe(true);
    if (white.ok) expect(white.sheet.robe).toBe('white');

    // A "Rogue mage" (no robe chosen) is legal — the manual's own concept for a mage who skipped
    // the Test of High Sorcery; they simply get no moon benefits (wired in magic.ts, not here).
    const rogue = createCharacter(base({ classes: { magicUser: 3 }, abilities }));
    expect(rogue.ok).toBe(true);
    if (rogue.ok) expect(rogue.sheet.robe).toBeUndefined();

    // A robe on a non-magic-user is a warning, not an error, and is dropped from the sheet.
    const ignored = createCharacter(base({ robe: 'white' }));
    expect(ignored.ok).toBe(true);
    if (ignored.ok) {
      expect(ignored.sheet.robe).toBeUndefined();
      expect(ignored.warnings.join(' ')).toMatch(/robe white ignored/);
    }
  });
});

describe('createCharacter — derived stats', () => {
  it('derives THAC0 from class + STR, AC from DEX', () => {
    // Fighter L5 THAC0 16; STR 17 → +1 hit; DEX 16 → −2 AC.
    const res = createCharacter(base({ abilities: { str: 17, strPct: 0, int: 10, wis: 10, dex: 16, con: 14, cha: 10 } }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.sheet.thac0).toBe(thac0('fighter', 5) - 1);
      expect(res.sheet.ac).toBe(4 - 2);
    }
  });

  it('folds the deity THAC0 grant in (Kiri-Jolith +1)', () => {
    const res = createCharacter(
      base({ classes: { cleric: 5 }, abilities: { str: 12, strPct: 0, int: 10, wis: 16, dex: 10, con: 12, cha: 14 }, deity: 'kiriJolith' }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sheet.thac0).toBe(thac0('cleric', 5) - 0 - 1); // STR 12 → +0 hit, deity −1
  });

  it('takes the best save per category across multi-classes', () => {
    const res = createCharacter(
      base({
        race: 'qualinestiElf',
        classes: { fighter: 6, thief: 6 },
        abilities: { str: 14, strPct: 0, int: 12, wis: 10, dex: 17, con: 12, cha: 12 },
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      const f = savingThrows('fighter', 6);
      const t = savingThrows('thief', 6);
      expect(res.sheet.savingThrows.breath).toBe(Math.min(f.breath, t.breath));
    }
  });

  it('gives a Knight a petitionable order and fighter THAC0', () => {
    const res = createCharacter(
      base({ classes: { knight: 5 }, abilities: { str: 16, strPct: 0, int: 12, wis: 14, dex: 13, con: 16, cha: 12 } }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.sheet.thac0).toBe(thac0('fighter', 5) - 0); // STR 16 → +0
      expect(res.sheet.knightOrder).toBe('rose'); // meets Rose minimums
    }
  });

  it('folds the racial poison-save bonus in for Hill Dwarf / Mountain Dwarf / Kender (M17.S1)', () => {
    // Same class/level/abilities across races — only race differs, so only the poison save should
    // move (the manual's "resistant to magic & poison", the poison half — `conPoisonSaveBonus`).
    const abilities = { str: 16, strPct: 0, int: 10, wis: 10, dex: 14, con: 16, cha: 10 };
    const human = createCharacter(base({ abilities }));
    const hillDwarf = createCharacter(base({ race: 'hillDwarf', abilities }));
    const mountainDwarf = createCharacter(base({ race: 'mountainDwarf', abilities }));
    const kender = createCharacter(base({ race: 'kender', classes: { fighter: 5 }, abilities }));
    const qualinesti = createCharacter(base({ race: 'qualinestiElf', abilities })); // not resistant
    expect(human.ok && hillDwarf.ok && mountainDwarf.ok && kender.ok && qualinesti.ok).toBe(true);
    if (human.ok && hillDwarf.ok && mountainDwarf.ok && kender.ok && qualinesti.ok) {
      const bonus = conPoisonSaveBonus(16);
      expect(bonus).toBeGreaterThan(0);
      const basePoison = human.sheet.savingThrows.paralyzePoisonDeath;
      expect(hillDwarf.sheet.savingThrows.paralyzePoisonDeath).toBe(basePoison - bonus);
      expect(mountainDwarf.sheet.savingThrows.paralyzePoisonDeath).toBe(basePoison - bonus);
      expect(kender.sheet.savingThrows.paralyzePoisonDeath).toBe(basePoison - bonus);
      expect(qualinesti.sheet.savingThrows.paralyzePoisonDeath).toBe(basePoison); // unaffected race
      // A category the bonus doesn't touch stays identical across all races.
      expect(hillDwarf.sheet.savingThrows.breath).toBe(human.sheet.savingThrows.breath);
    }
  });

  it('computes spell slots per caster class', () => {
    const res = createCharacter(
      base({
        race: 'qualinestiElf',
        classes: { cleric: 5, magicUser: 5 },
        abilities: { str: 12, strPct: 0, int: 16, wis: 16, dex: 16, con: 12, cha: 12 },
        deity: 'mishakal',
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      // Cleric L5 base [3,3,1] + Wis-16 bonus (+1 L1,+1 L2) = [4,4,1,0,0].
      expect(res.sheet.spellSlots.cleric).toEqual(clericSpellSlots(5, 16));
      expect(res.sheet.spellSlots.magicUser).toEqual(spellSlots('magicUser', 5));
      expect(res.sheet.spellSlots.fighter).toBeUndefined();
    }
  });
});
