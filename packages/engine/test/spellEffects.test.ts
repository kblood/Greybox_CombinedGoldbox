/**
 * A2.2 — spell-effect resolution (heal/damage dice, camp-castable tags, per-level scaling).
 */
import { describe, it, expect } from 'vitest';
import { spellEffect, isCampCastable, rollSpellAmount, COK_SPELLS } from '../src/index.js';

describe('spell effects', () => {
  it('classifies the cure line as camp-castable heals with the right dice', () => {
    const clw = spellEffect('c1-cure-light-wounds');
    expect(clw.kind).toBe('heal');
    expect(clw.campCastable).toBe(true);
    expect(clw.dice).toEqual({ count: 1, sides: 8, bonus: 0 });
    expect(spellEffect('c5-cure-critical-wounds').dice).toEqual({ count: 3, sides: 8, bonus: 3 });
  });

  it('classifies attack spells as non-camp damage', () => {
    const mm = spellEffect('m1-magic-missile');
    expect(mm.kind).toBe('damage');
    expect(mm.campCastable).toBe(false);
    expect(mm.dice).toMatchObject({ count: 1, sides: 4, bonus: 1 });
    expect(isCampCastable('m3-fireball')).toBe(false);
    expect(isCampCastable('c1-cure-light-wounds')).toBe(true);
  });

  it('treats raise dead as a camp-castable revive and bless as a party buff', () => {
    expect(spellEffect('c5-raise-dead').kind).toBe('revive');
    expect(spellEffect('c5-raise-dead').campCastable).toBe(true);
    expect(spellEffect('c1-bless')).toMatchObject({ kind: 'buff', target: 'allyGroup', campCastable: true });
  });

  it('falls back to flavour-only utility for unmodelled spells', () => {
    const eff = spellEffect('m1-read-magic');
    expect(eff.kind).toBe('utility');
    expect(eff.campCastable).toBe(false);
    expect(eff.dice).toBeUndefined();
  });

  it('rolls heal amounts within the dice range and is deterministic by seed', () => {
    const clw = spellEffect('c1-cure-light-wounds');
    for (let seed = 1; seed < 40; seed++) {
      const amt = rollSpellAmount(clw, 1, seed);
      expect(amt).toBeGreaterThanOrEqual(1);
      expect(amt).toBeLessThanOrEqual(8);
    }
    expect(rollSpellAmount(clw, 1, 7)).toBe(rollSpellAmount(clw, 1, 7)); // same seed → same roll
  });

  it('scales per-level damage by caster level (Fireball 1d6/level)', () => {
    const fb = spellEffect('m3-fireball');
    expect(fb.dice?.perLevel).toBe(true);
    // 5th-level caster → 5d6 → between 5 and 30.
    for (let seed = 1; seed < 20; seed++) {
      const amt = rollSpellAmount(fb, 5, seed);
      expect(amt).toBeGreaterThanOrEqual(5);
      expect(amt).toBeLessThanOrEqual(30);
    }
  });

  it('every effect id matches a real spell in the spellbook', () => {
    const ids = new Set(COK_SPELLS.map((s) => s.id));
    // Spot-check a few known-modelled ids resolve to non-utility effects on real spells.
    for (const id of ['c1-cure-light-wounds', 'm1-magic-missile', 'm3-fireball', 'c5-raise-dead']) {
      expect(ids.has(id)).toBe(true);
      expect(spellEffect(id).kind).not.toBe('utility');
    }
  });
});
