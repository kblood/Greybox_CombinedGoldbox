/**
 * M33.S1 — `classVoteFromDokIds`: votes a DoK caster's real memorized-spell ids cleric-vs-magicUser,
 * a stronger signal than `importDokParty.ts`'s ability-score tie-break for which of those two classes
 * a save's validated-caster-but-unresolved `classCode` actually is. Verifies the tally rules (distinct
 * ids only, strict majority, tie/empty -> undefined) and re-derives the real 4-pregen table from
 * `docs/engine/research/m33-audit.md` Part 1(c) directly from the real `CHRDATA{n}.WIZ` files.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classVoteFromDokIds, DOK_SPELL_CLASS, decodeMonsterWizRecord } from '../src/index.js';

describe('classVoteFromDokIds (M33.S1)', () => {
  it('returns undefined for no ids / empty', () => {
    expect(classVoteFromDokIds(undefined)).toBeUndefined();
    expect(classVoteFromDokIds([])).toBeUndefined();
  });

  it('returns the strict-majority class over DISTINCT ids (duplicates count once)', () => {
    // 1,3,6 = cleric (C: Bless/Cure Light Wounds/Protection from Evil); 15 = magicUser (Magic Missile).
    // 1 repeated should not double-count toward cleric.
    expect(classVoteFromDokIds([1, 1, 1, 3, 6, 15])).toBe('cleric');
  });

  it('returns undefined on an exact tie, including a 0-0 tie when every id is unmapped', () => {
    expect(classVoteFromDokIds([1, 9])).toBeUndefined(); // 1 cleric, 9 (Burning Hands) magicUser
    // 77 (D: Detect Magic, druid) and 57 ((Potion of Speed), not a spell) both classify to undefined.
    expect(classVoteFromDokIds([77, 57])).toBeUndefined();
  });

  it('excludes druid-track ids and non-spell catalogue rows from the vote entirely (not folded into either side)', () => {
    // 106 (D: Cure Disease, druid) must not tip a real cleric-vs-mage vote either way.
    expect(classVoteFromDokIds([1, 106])).toBe('cleric'); // 1 cleric vs 0 mage (106 excluded) — decisive
    expect(classVoteFromDokIds([9, 106])).toBe('magicUser'); // 0 cleric vs 1 mage (106 excluded) — decisive
  });

  it('DOK_SPELL_CLASS classifies the crosswalked ids consistently with dokSpellCrosswalk.ts', () => {
    // Same ids DOK_SPELL_CROSSWALK maps — cross-check the class matches the crosswalk's own target.
    expect(DOK_SPELL_CLASS[15]).toBe('magicUser'); // Magic Missile -> m1-magic-missile
    expect(DOK_SPELL_CLASS[21]).toBe('magicUser'); // Sleep -> m1-sleep
    expect(DOK_SPELL_CLASS[23]).toBe('cleric'); // C: Hold Person -> c2-hold-person
    expect(DOK_SPELL_CLASS[49]).toBe('magicUser'); // Hold Person (mage) -> m3-hold-person
    expect(DOK_SPELL_CLASS[51]).toBe('magicUser'); // Lightning Bolt -> m3-lightning-bolt
    expect(DOK_SPELL_CLASS[58]).toBe('cleric'); // C: Cure Serious Wounds -> c4-cure-serious-wounds
    expect(DOK_SPELL_CLASS[72]).toBe('cleric'); // C: Cause Critical Wounds -> c5-cause-critical-wounds
    expect(DOK_SPELL_CLASS[74]).toBe('cleric'); // C: Flame Strike -> c5-flame-strike
    expect(DOK_SPELL_CLASS[84]).toBe('magicUser'); // Fear -> m4-fear
    expect(DOK_SPELL_CLASS[87]).toBe('magicUser'); // Ice Storm -> m4-ice-storm
    expect(DOK_SPELL_CLASS[91]).toBe('magicUser'); // Cloudkill -> m5-cloudkill
    expect(DOK_SPELL_CLASS[92]).toBe('magicUser'); // Cone of Cold -> m5-cone-of-cold
  });

  // --- Golden: real DoK SAVE .WIZ files, re-deriving the exact m33-audit.md Part 1(c) table --------

  const here = fileURLToPath(new URL('.', import.meta.url));
  const saveDir = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'SAVE');

  async function realIds(file: string): Promise<number[]> {
    const entry = decodeMonsterWizRecord(new Uint8Array(await readFile(resolve(saveDir, file))));
    return entry.spells.map((s) => s.spellId);
  }

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA3.WIZ')))(
    'real TANAR (CHRDATA3.WIZ): 11 distinct cleric ids, 0 mage -> decisive cleric (the fix\'s whole point)',
    async () => {
      expect(classVoteFromDokIds(await realIds('CHRDATA3.WIZ'))).toBe('cleric');
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA4.WIZ')))(
    'real FLAVIUS (CHRDATA4.WIZ): 10 cleric, 6 mage -> decisive cleric (agrees with, doesn\'t change, the existing ability-score verdict)',
    async () => {
      expect(classVoteFromDokIds(await realIds('CHRDATA4.WIZ'))).toBe('cleric');
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA5.WIZ')))(
    'real NEACAIL (CHRDATA5.WIZ): 10 cleric, 0 mage -> decisive cleric (computed, but she never reaches the roster — rejected on ability range)',
    async () => {
      expect(classVoteFromDokIds(await realIds('CHRDATA5.WIZ'))).toBe('cleric');
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA6.WIZ')))(
    'real CELESTE (CHRDATA6.WIZ): exactly 8 cleric vs 8 mage (druid id 106 excluded) -> undefined, falls back to ability-score magicUser',
    async () => {
      const ids = await realIds('CHRDATA6.WIZ');
      expect(ids).toContain(106); // her one real druid-track id, must not tip the vote
      expect(classVoteFromDokIds(ids)).toBeUndefined();
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA1.WIZ')))(
    'real SIR DRYDEN (CHRDATA1.WIZ, non-caster): all-zero -> no ids at all -> undefined',
    async () => {
      expect(classVoteFromDokIds(await realIds('CHRDATA1.WIZ'))).toBeUndefined();
    },
  );
});
