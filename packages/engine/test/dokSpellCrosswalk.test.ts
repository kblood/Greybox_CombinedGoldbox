/**
 * M31.S1 — `preparedSpellsFromDokIds`: the crosswalk that lets a real DoK monster's memorized spell
 * list (`MonsterRecord.preparedSpellIds`, decoded from `MON{n}WIZ.DAX`) actually cast in the tactical
 * combat engine. Verifies the grouping (duplicate ids -> one spell with usesLeft = copy count), the
 * drop of unmapped/ungeometried ids, and the "no ids / nothing survives" -> undefined convention that
 * matches `TacticalCombatant.preparedSpells`'s own "no spellbook" default.
 *
 * M32.S1 — `memorizationFromDokIds`: the sibling crosswalk for the DoK->DQK player-import side
 * (`apps/web/src/ui/importDokParty.ts`). Same crosswalk table, but ALSO filters by class (a monster
 * combatant has no stored class; an imported character does), and builds a `Memorization` (grouped by
 * spell level, duplicates kept as separate entries) rather than a `TacticalSpell[]`.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  preparedSpellsFromDokIds,
  DOK_SPELL_CROSSWALK,
  memorizationFromDokIds,
  decodeMonsterWizRecord,
  dokIdsFromMemorizedSlugs,
  exportDokWizFromMemorizedSlugs,
  classVoteFromDokIds,
  MON_WIZ_RECORD_SIZE,
} from '../src/index.js';

describe('preparedSpellsFromDokIds (M31.S1)', () => {
  it('returns undefined for no ids (the common case: a non-caster monster)', () => {
    expect(preparedSpellsFromDokIds(undefined, 6)).toBeUndefined();
    expect(preparedSpellsFromDokIds([], 6)).toBeUndefined();
  });

  it('real monster id 97 (IGORF, DoK): [47,32,33,34,10,15,21] crosswalks to exactly 4 castable spells', () => {
    // Fireball(47), Stinking Cloud(34), Magic Missile(15), Sleep(21) all have GEOMETRY entries;
    // Mirror Image(32), Ray of Enfeeblement(33), Charm Person(10) have no crosswalk entry — dropped.
    const spells = preparedSpellsFromDokIds([47, 32, 33, 34, 10, 15, 21], 6);
    expect(spells).toBeDefined();
    expect(spells!.map((s) => s.id).sort()).toEqual(
      ['m1-magic-missile', 'm1-sleep', 'm2-stinking-cloud', 'm3-fireball'].sort(),
    );
    expect(spells!.every((s) => s.usesLeft === 1)).toBe(true); // no duplicates in this real list
  });

  it('groups duplicate memorized copies of the same id into one spell with usesLeft = copy count', () => {
    // Real monster id 49 (TANAR, DoK): raw memorized ids 23×3 (C:Hold Person), 74×3 (C:Flame Strike).
    const spells = preparedSpellsFromDokIds([23, 23, 23, 74, 74, 74], 6);
    expect(spells).toHaveLength(2);
    const hold = spells!.find((s) => s.id === 'c2-hold-person')!;
    const flameStrike = spells!.find((s) => s.id === 'c5-flame-strike')!;
    expect(hold.usesLeft).toBe(3);
    expect(flameStrike.usesLeft).toBe(3);
  });

  it('returns undefined when every id is unmapped (e.g. 6th-level-and-up spells past the CoK player cap)', () => {
    // Real DoK spell numbers 110 (Death), 111 (Disintegrate), 113 (Stone to Flesh) — none has a
    // DOK_SPELL_CROSSWALK entry (past CoK's 5-level player spell cap). No single real monster's FULL
    // list is only these ids (every real caster keeps at least one mapped spell — m31-audit.md Part
    // 1(b)); this exercises the drop-everything edge case directly.
    expect(preparedSpellsFromDokIds([113, 111, 111, 110], 6)).toBeUndefined();
  });

  it('DOK_SPELL_CROSSWALK covers exactly the ids independently verified against COK_SPELLS + GEOMETRY', () => {
    const ids = Object.keys(DOK_SPELL_CROSSWALK).map(Number).sort((a, b) => a - b);
    expect(ids).toEqual([15, 21, 23, 34, 47, 49, 51, 58, 72, 74, 84, 87, 91, 92]);
  });

  it('crosswalks DoK Cloudkill as a zone-only tactical spell', () => {
    const spells = preparedSpellsFromDokIds([91], 9);
    expect(spells).toHaveLength(1);
    expect(spells![0]).toMatchObject({ id: 'm5-cloudkill', zone: { kind: 'cloudkill', rounds: 5 }, usesLeft: 1 });
  });

  it('scales perLevel dice (Fireball) by the passed nominal caster level, honestly not decoded', () => {
    const low = preparedSpellsFromDokIds([47], 3)!.find((s) => s.id === 'm3-fireball')!;
    const high = preparedSpellsFromDokIds([47], 9)!.find((s) => s.id === 'm3-fireball')!;
    expect(low.casterLevel).toBe(3);
    expect(high.casterLevel).toBe(9);
  });
});

describe('memorizationFromDokIds (M32.S1)', () => {
  it('returns undefined for no ids (a non-caster import candidate)', () => {
    expect(memorizationFromDokIds(undefined, 'cleric')).toBeUndefined();
    expect(memorizationFromDokIds([], 'magicUser')).toBeUndefined();
  });

  it('buckets surviving ids by spell level and keeps duplicate copies as separate entries', () => {
    // 15 (Magic Missile, level 1) x2, 47 (Fireball, level 3) x2 — both magicUser.
    const mem = memorizationFromDokIds([15, 15, 47, 47], 'magicUser')!;
    expect(mem).toBeDefined();
    expect(mem.byLevel[0]).toEqual(['m1-magic-missile', 'm1-magic-missile']);
    expect(mem.byLevel[2]).toEqual(['m3-fireball', 'm3-fireball']);
    expect(mem.byLevel[1]).toEqual([]);
  });

  it('drops a crosswalked spell whose class does not match the requested class', () => {
    // 23 = C:Hold Person (cleric) — asking for magicUser drops it, leaving nothing.
    expect(memorizationFromDokIds([23], 'magicUser')).toBeUndefined();
    // Asking for the correct class keeps it.
    const mem = memorizationFromDokIds([23], 'cleric')!;
    expect(mem.byLevel[1]).toEqual(['c2-hold-person']); // Hold Person is a level-2 cleric spell
  });

  it('drops unmapped ids same as the monster-side crosswalk', () => {
    expect(memorizationFromDokIds([110, 111, 113], 'magicUser')).toBeUndefined();
  });

  // --- Golden: real DoK SAVE .WIZ files through the full decode -> crosswalk -> class-filter chain ---

  const here = fileURLToPath(new URL('.', import.meta.url));
  const saveDir = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'SAVE');
  const flaviusWiz = resolve(saveDir, 'CHRDATA4.WIZ');

  it.skipIf(!existsSync(flaviusWiz))(
    'real FLAVIUS (CHRDATA4.WIZ, inferred cleric): only C:Hold Person survives the class filter',
    async () => {
      const entry = decodeMonsterWizRecord(new Uint8Array(await readFile(flaviusWiz)));
      const mem = memorizationFromDokIds(entry.spells.map((s) => s.spellId), 'cleric')!;
      expect(mem).toBeDefined();
      expect(mem.byLevel.flat()).toEqual(['c2-hold-person']);
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA6.WIZ')))(
    'real CELESTE (CHRDATA6.WIZ, inferred magicUser): Magic Missile x2 and Fireball x2 survive',
    async () => {
      const entry = decodeMonsterWizRecord(new Uint8Array(await readFile(resolve(saveDir, 'CHRDATA6.WIZ'))));
      const mem = memorizationFromDokIds(entry.spells.map((s) => s.spellId), 'magicUser')!;
      expect(mem).toBeDefined();
      expect(mem.byLevel[0]).toEqual(['m1-magic-missile', 'm1-magic-missile']);
      expect(mem.byLevel[2]).toEqual(['m3-fireball', 'm3-fireball']);
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA3.WIZ')))(
    'real TANAR (CHRDATA3.WIZ, inferred magicUser): real spells are cleric-class, so nothing survives — an honest partial result',
    async () => {
      const entry = decodeMonsterWizRecord(new Uint8Array(await readFile(resolve(saveDir, 'CHRDATA3.WIZ'))));
      expect(memorizationFromDokIds(entry.spells.map((s) => s.spellId), 'magicUser')).toBeUndefined();
    },
  );

  it.skipIf(!existsSync(resolve(saveDir, 'CHRDATA1.WIZ')))(
    'real SIR DRYDEN (CHRDATA1.WIZ, non-caster): all-zero record decodes to no spells at all',
    async () => {
      const entry = decodeMonsterWizRecord(new Uint8Array(await readFile(resolve(saveDir, 'CHRDATA1.WIZ'))));
      expect(entry.spells).toHaveLength(0);
    },
  );
});

// --- dokIdsFromMemorizedSlugs / exportDokWizFromMemorizedSlugs: synthesize a .WIZ file's CONFIRMED
// memorized-spell-list region from a Greybox character's memorized spell slugs (2026-07-16,
// BUILD-QUEUE P2.4 "original save import/export" — DoK half). The write-direction inverse of
// memorizationFromDokIds, scoped to ONLY the 14-id crosswalk and the CONFIRMED 0-73 window — bytes
// 74..219 (the still-open "known spell" table + tail, dok-chrdata-save-format.md §4.2) are always left
// zero. This is what lets an exported CASTER's cleric-vs-magicUser class actually survive a reimport,
// since .GAM's classCode alone only proves caster-vs-not (dokSavedCharacter.ts's classCodeForDokCaster).

describe('dokIdsFromMemorizedSlugs (synthetic)', () => {
  it('crosswalks known slugs back to their real DoK ids', () => {
    expect(dokIdsFromMemorizedSlugs(['c2-hold-person', 'm1-magic-missile'])).toEqual([23, 15]);
  });

  it('drops slugs outside the 14-id crosswalk, silently — same convention as the decode side', () => {
    expect(dokIdsFromMemorizedSlugs(['c1-not-a-real-spell', 'm1-magic-missile'])).toEqual([15]);
  });

  it('preserves duplicates (multiple simultaneously-memorized copies)', () => {
    expect(dokIdsFromMemorizedSlugs(['m1-magic-missile', 'm1-magic-missile'])).toEqual([15, 15]);
  });
});

describe('exportDokWizFromMemorizedSlugs (synthetic)', () => {
  it('round-trips through decodeMonsterWizRecord + classVoteFromDokIds: an all-cleric list votes cleric', () => {
    const raw = exportDokWizFromMemorizedSlugs(['c2-hold-person', 'c4-cure-serious-wounds']);
    expect(raw).toHaveLength(MON_WIZ_RECORD_SIZE);
    const ids = decodeMonsterWizRecord(raw).spells.map((s) => s.spellId);
    expect(classVoteFromDokIds(ids)).toBe('cleric');
  });

  it('round-trips: an all-magicUser list votes magicUser', () => {
    const raw = exportDokWizFromMemorizedSlugs(['m1-magic-missile', 'm3-fireball']);
    const ids = decodeMonsterWizRecord(raw).spells.map((s) => s.spellId);
    expect(classVoteFromDokIds(ids)).toBe('magicUser');
  });

  it('round-trips through memorizationFromDokIds: the exact slugs come back for the matching class', () => {
    const raw = exportDokWizFromMemorizedSlugs(['c2-hold-person']);
    const ids = decodeMonsterWizRecord(raw).spells.map((s) => s.spellId);
    const mem = memorizationFromDokIds(ids, 'cleric')!;
    expect(mem.byLevel.flat()).toEqual(['c2-hold-person']);
  });

  it('an empty slug list produces an all-zero record (a non-caster .WIZ)', () => {
    const raw = exportDokWizFromMemorizedSlugs([]);
    expect(raw.every((b) => b === 0)).toBe(true);
  });

  // --- Real-fixture-guarded oracle: FLAVIUS's real CHRDATA4.WIZ has exactly one id (23, C:Hold
  // Person) inside the 14-id crosswalk (memorizationFromDokIds's own golden test above proves this:
  // "only C:Hold Person survives the class filter"). Re-synthesizing a .WIZ from that SAME surviving
  // slug and re-running it through the identical decode -> crosswalk -> class-filter chain must
  // reproduce the exact same result — proving the encoder is the genuine inverse of the decoder for
  // the subset both sides can represent, not just a synthetic-only claim.
  const here = fileURLToPath(new URL('.', import.meta.url));
  const saveDir = resolve(here, '..', '..', '..', 'Death Knights of Krynn', 'SAVE');
  const flaviusWiz = resolve(saveDir, 'CHRDATA4.WIZ');

  it.skipIf(!existsSync(flaviusWiz))(
    'a synthesized FLAVIUS (from the real save\'s own surviving slug) reproduces the real memorizationFromDokIds result',
    async () => {
      const realEntry = decodeMonsterWizRecord(new Uint8Array(await readFile(flaviusWiz)));
      const realMem = memorizationFromDokIds(realEntry.spells.map((s) => s.spellId), 'cleric')!;
      expect(realMem.byLevel.flat()).toEqual(['c2-hold-person']); // ground truth, re-proven here

      const synthesized = exportDokWizFromMemorizedSlugs(realMem.byLevel.flat());
      const synthesizedIds = decodeMonsterWizRecord(synthesized).spells.map((s) => s.spellId);
      const synthesizedMem = memorizationFromDokIds(synthesizedIds, 'cleric')!;
      expect(synthesizedMem.byLevel).toEqual(realMem.byLevel);
      expect(classVoteFromDokIds(synthesizedIds)).toBe('cleric');
    },
  );
});
