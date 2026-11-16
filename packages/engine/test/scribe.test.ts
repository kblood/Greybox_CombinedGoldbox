/**
 * A2.3 — spell scribing (magic-user learn chance + spellbook caps) and clerical prayer grants.
 */
import { describe, it, expect } from 'vitest';
import {
  chanceToLearnSpell,
  maxSpellsPerLevel,
  minSpellsPerLevel,
  attemptScribe,
  prayerGrant,
} from '../src/index.js';

describe('spell scribing (magic-user)', () => {
  it('maps Intelligence to the AD&D 1e learn chance', () => {
    expect(chanceToLearnSpell(8)).toBe(0); // too low to be a mage
    expect(chanceToLearnSpell(9)).toBe(35);
    expect(chanceToLearnSpell(13)).toBe(45);
    expect(chanceToLearnSpell(17)).toBe(65);
    expect(chanceToLearnSpell(18)).toBe(75);
    expect(chanceToLearnSpell(25)).toBe(85); // clamps to the top row
  });

  it('maps Intelligence to the spells-per-level caps', () => {
    expect(maxSpellsPerLevel(9)).toBe(6);
    expect(maxSpellsPerLevel(18)).toBe(18);
    expect(minSpellsPerLevel(9)).toBe(4);
    expect(minSpellsPerLevel(18)).toBe(9);
    expect(maxSpellsPerLevel(8)).toBe(0);
    // The book is at least as deep as its guaranteed minimum at every modelled INT.
    for (let int = 9; int <= 19; int++) {
      expect(maxSpellsPerLevel(int)).toBeGreaterThanOrEqual(minSpellsPerLevel(int));
    }
  });

  it('rolls d100 against the chance, deterministic by seed and within bounds', () => {
    for (let seed = 1; seed < 60; seed++) {
      const a = attemptScribe(17, seed);
      expect(a.chance).toBe(65);
      expect(a.roll).toBeGreaterThanOrEqual(1);
      expect(a.roll).toBeLessThanOrEqual(100);
      expect(a.learned).toBe(a.roll <= 65);
    }
    expect(attemptScribe(17, 7)).toEqual(attemptScribe(17, 7)); // same seed → same attempt
  });

  it('learns more often at higher Intelligence over many seeds', () => {
    const rate = (int: number): number => {
      let hits = 0;
      for (let seed = 1; seed <= 200; seed++) if (attemptScribe(int, seed).learned) hits++;
      return hits / 200;
    };
    expect(rate(18)).toBeGreaterThan(rate(9));
  });
});

describe('clerical prayer grants', () => {
  it('names the deity and returns its bonus spells', () => {
    const g = prayerGrant('mishakal');
    expect(g.deity).toBe('mishakal');
    expect(g.message).toContain('Mishakal');
    expect(g.bonusSpells).toContain('Bless');
  });

  it('still answers an unfocused prayer with no deity', () => {
    const g = prayerGrant(null);
    expect(g.deity).toBeNull();
    expect(g.message).toMatch(/answered/i);
    expect(g.bonusSpells).toEqual([]);
  });
});
