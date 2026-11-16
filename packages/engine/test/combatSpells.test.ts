/**
 * CT.4b — `tacticalSpellFor`: building a tactical-combat `TacticalSpell` from a memorized Krynn spell.
 * The dice come from the verified `spellEffect()` table; this layer adds the (inferred) 1e/Gold Box
 * combat geometry (range / area / save-mode). CT.5a adds status spells (Sleep/Hold/Fear/Slow/Haste)
 * via their `inflict` data; persistent cloud spells can be zone-only; unresolved special-effect
 * placeholders with neither dice, inflict, nor zone → null.
 */
import { describe, it, expect } from 'vitest';
import { tacticalSpellFor, isTacticalCastable, spellEffect } from '../src/index.js';

describe('tacticalSpellFor (CT.4b)', () => {
  it('builds a single-target damage spell from the ruleset dice + geometry', () => {
    const mm = tacticalSpellFor('m1-magic-missile', 'Magic Missile', 3, 2);
    expect(mm).not.toBeNull();
    expect(mm!.target).toBe('enemy');
    expect(mm!.area).toBe('single');
    expect(mm!.save).toBe('none');
    expect(mm!.usesLeft).toBe(2); // two copies memorized
    // dice mirror spellEffect (1d4+1), not hardcoded
    expect(mm!.damage).toEqual(spellEffect('m1-magic-missile').dice);
    expect(mm!.heal).toBeUndefined();
  });

  it('carries per-level scaling + half-save geometry for Fireball', () => {
    const fb = tacticalSpellFor('m3-fireball', 'Fireball', 5, 1);
    expect(fb).not.toBeNull();
    expect(fb!.area).toBe('burst');
    expect(fb!.radius).toBe(2);
    expect(fb!.save).toBe('half');
    expect(fb!.casterLevel).toBe(5);
    expect(fb!.damage?.perLevel).toBe(true);
  });

  it('builds a touch heal aimed at allies', () => {
    const clw = tacticalSpellFor('c1-cure-light-wounds', 'Cure Light Wounds', 2, 3);
    expect(clw).not.toBeNull();
    expect(clw!.target).toBe('ally');
    expect(clw!.range).toBe(1);
    expect(clw!.heal).toEqual(spellEffect('c1-cure-light-wounds').dice);
    expect(clw!.damage).toBeUndefined();
  });

  it('builds inflict-only status spells (CT.5a): Sleep, Hold Person, Haste', () => {
    const sleep = tacticalSpellFor('m1-sleep', 'Sleep', 3, 1);
    expect(sleep).not.toBeNull();
    expect(sleep!.target).toBe('enemy');
    expect(sleep!.damage).toBeUndefined();
    expect(sleep!.heal).toBeUndefined();
    expect(sleep!.inflict).toEqual({ status: 'asleep', rounds: 99, hdCap: 4 });

    const hold = tacticalSpellFor('c2-hold-person', 'Hold Person', 4, 1);
    expect(hold!.inflict).toEqual({ status: 'held', rounds: 6 });
    expect(hold!.save).toBe('negate');

    // Haste buffs allies → target 'ally', not 'enemy'.
    const haste = tacticalSpellFor('m3-haste', 'Haste', 5, 1);
    expect(haste!.target).toBe('ally');
    expect(haste!.inflict).toEqual({ status: 'hasted', rounds: 3 });

    expect(isTacticalCastable('m1-sleep')).toBe(true);
    expect(isTacticalCastable('m1-magic-missile')).toBe(true);
  });

  it('still returns null for unmodelled special-effect spells (0/0/0 placeholders)', () => {
    expect(tacticalSpellFor('c5-slay-living', 'Slay Living', 9, 1)).toBeNull(); // no dice, no inflict
  });

  it('builds Cloudkill as a zone-only tactical spell', () => {
    const ck = tacticalSpellFor('m5-cloudkill', 'Cloudkill', 9, 1);
    expect(ck).not.toBeNull();
    expect(ck!.target).toBe('enemy');
    expect(ck!.range).toBe(2);
    expect(ck!.damage).toBeUndefined();
    expect(ck!.inflict).toBeUndefined();
    expect(ck!.zone).toEqual({ kind: 'cloudkill', rounds: 5 });
    expect(ck!.priority).toBe(5);
    expect(isTacticalCastable('m5-cloudkill')).toBe(true);
  });

  it("folds a deity's heal-die bonus into heal dice only (M18.S1, Mishakal = +1 die)", () => {
    const base = spellEffect('c1-cure-light-wounds').dice!;
    const plain = tacticalSpellFor('c1-cure-light-wounds', 'Cure Light Wounds', 2, 1);
    expect(plain!.heal).toEqual(base); // no bonus → identical to the ruleset table

    const blessed = tacticalSpellFor('c1-cure-light-wounds', 'Cure Light Wounds', 2, 1, 1);
    expect(blessed!.heal).toEqual({ ...base, count: base.count + 1 }); // +1 die, same sides/bonus

    // A damage spell is untouched by the same bonus (heal-only grant).
    const dmg = tacticalSpellFor('m1-magic-missile', 'Magic Missile', 3, 1, 1);
    expect(dmg!.damage).toEqual(spellEffect('m1-magic-missile').dice);
  });

  it('floors caster level / uses to sane minimums', () => {
    const s = tacticalSpellFor('m1-magic-missile', 'Magic Missile', 0, 0);
    expect(s!.casterLevel).toBe(1); // never below 1 for perLevel scaling
    expect(s!.usesLeft).toBe(0); // 0 copies = exists but not castable (engine rejects at 0)
  });
});
