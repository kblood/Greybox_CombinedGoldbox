/**
 * Round 35 R4 — the four label tables Buck Rogers: Countdown to Doomsday's own `START.EXE`
 * carries, and the reason three of them are shipped as CONSTANTS WITH NO FIELD BEHIND THEM.
 *
 * The byte-side derivation (EXEPACK unpack, each table's base and stride measured from its own
 * entries, the fencepost null, the boundary anchors, the column-reading null over the six pregens)
 * lives in `tools/buck_string_tables.py` and its pytest. What this file pins is the TypeScript
 * consequence:
 *
 *   1. the transcription is exact and in table order;
 *   2. `BUCK_CAREER_LABEL` has SEVEN entries including `Scout`, which is what falsifies
 *      `ruleset/buckrogers/index.ts`'s former "the 5 careers above are the only ones the real game
 *      has" — that comment is corrected in this same change;
 *   3. `BUCK_ABILITY_ABBREV` stays an ORDERED ARRAY, not a numeric-keyed record, because the
 *      record's ability field ORDER was not measured this round and a numeric key would read as a
 *      claim that it was;
 *   4. the decoded record does NOT gain a `career`, `race` or `sex` field: the plan's own null —
 *      "does the party come out fully named?" — was measured over all 8
 *      (column 39/40) x (career/race table) x (0-based/1-based) combinations and came back 8/8, so
 *      it separates nothing, and 16 of the record's 259 columns pass the same filter. These
 *      constants are STATED-NOT-WIRED on purpose, and this file is the thing that says so out loud.
 *
 * Reads only the repo's own source; the record cases skip when the external, never-vendored
 * `D:/` install is absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  decodeBuckSavedCharacter,
  BUCK_CAREER_LABEL,
  BUCK_RACE_LABEL,
  BUCK_ABILITY_ABBREV,
  BUCK_SEX_LABEL,
} from '../src/loaders/buckSavedCharacter.js';
import { BUCK_ROGERS_CAREERS, classForCareer, type BuckRogersCareer } from '../src/ruleset/buckrogers/index.js';

const BUCK_DIR = 'D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday';
const HAVE_BUCK = existsSync(`${BUCK_DIR}/chrdata1.sav`);

describe("Buck Rogers' own START.EXE label tables (round 35 R4)", () => {
  it('career table: seven entries, in table order, with Scout at index 5', () => {
    expect(BUCK_CAREER_LABEL).toEqual({
      0: 'Rocket Jock',
      1: 'Medic',
      2: 'Warrior',
      3: 'Engineer',
      4: 'Rogue',
      5: 'Scout',
      6: 'Monster',
    });
  });

  it('the career table has SIX non-monster careers, one more than the ruleset overlay models', () => {
    // The falsification, stated as a comparison rather than as prose. `BUCK_ROGERS_CAREERS`'s
    // keys are the overlay's selectable list; the retail table has a sixth non-monster entry it
    // does not offer. This
    // round deliberately does NOT add `scout` as a selectable `CareerId` — appearing in a string
    // table is not evidence that the creation screen offers it, and nothing was measured about the
    // creation screen. The gap is the finding.
    const nonMonster = Object.values(BUCK_CAREER_LABEL).filter((l) => l !== 'Monster');
    expect(nonMonster).toHaveLength(6);
    expect(nonMonster).toContain('Scout');
    const selectable = Object.keys(BUCK_ROGERS_CAREERS) as BuckRogersCareer[];
    expect(selectable).toHaveLength(5);
    expect(selectable).not.toContain('scout' as unknown as BuckRogersCareer);
    // The one entry of the seven that is a sentinel rather than a career.
    expect(BUCK_CAREER_LABEL[6]).toBe('Monster');
    // Every career the overlay DOES offer still resolves, i.e. the correction did not touch behaviour.
    for (const c of selectable) expect(typeof classForCareer(c)).toBe('string');
  });

  it('race table: eight entries, including the two lower-cased ones the retail bytes actually carry', () => {
    // `lunarian` and `lowlander` are lower-case IN THE BINARY. Title-casing them here would be a
    // silent edit of the source of truth, so they are transcribed as found; the pytest asserts the
    // same two strings from the byte side.
    expect(BUCK_RACE_LABEL).toEqual({
      0: 'Terran',
      1: 'Martian',
      2: 'Venusian',
      3: 'Mercurian',
      4: 'Tinker',
      5: 'Desert Runner',
      6: 'lunarian',
      7: 'lowlander',
    });
  });

  it('sex table: exactly two entries', () => {
    expect(BUCK_SEX_LABEL).toEqual({ 0: 'Male', 1: 'Female' });
  });

  it('ability abbreviations stay an ORDERED ARRAY, because the record field order is unmeasured', () => {
    expect(BUCK_ABILITY_ABBREV).toEqual(['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA', 'TCH']);
    // The shape assertion is the load-bearing half: a `Record<number, string>` here would assert
    // that record ability slot i is abbreviation i, which round 35 R4 did not measure.
    expect(Array.isArray(BUCK_ABILITY_ABBREV)).toBe(true);
  });
});

describe('the Buck label tables are STATED-NOT-WIRED, and the null is why', () => {
  it.skipIf(!HAVE_BUCK)(
    'the decoded record exposes no career/race/sex field, and no column is claimed for one',
    () => {
      // MEASURED NON-DISCRIMINATOR (`tools/test_buck_string_tables.py`): all 8 of the
      // (column 39/40) x (career/race) x (0-based/1-based) readings give all six pregens a named
      // entry, and 16 of the 259 columns pass the same "all values are valid 0-based career
      // indices and vary" filter. "The party comes out fully named" is therefore evidence for none
      // of them. Until a reading is located rather than guessed, the decoder assigns nothing —
      // and this pin goes RED the moment someone adds the field without the evidence.
      const rec = readFileSync(`${BUCK_DIR}/chrdata1.sav`);
      const c = decodeBuckSavedCharacter(rec);
      expect(c.name).toBe('FLAVIUS');
      expect('career' in c).toBe(false);
      expect('race' in c).toBe(false);
      expect('sex' in c).toBe(false);
    },
  );

  it.skipIf(!HAVE_BUCK)(
    'the raw bytes at 39 and 40 are in range for a career index under BOTH basings — which is the point',
    () => {
      // Six records, one byte each. Both candidate columns hold small values that index the
      // 7-entry table legally whether the byte is 0-based or 1-based, so range alone cannot pick
      // either the column or the basing.
      const values39: number[] = [];
      const values40: number[] = [];
      for (let n = 1; n <= 6; n++) {
        const rec = readFileSync(`${BUCK_DIR}/chrdata${n}.sav`);
        values39.push(rec[39]);
        values40.push(rec[40]);
      }
      const zeroBasedOk = (v: number[]) => v.every((x) => x in BUCK_CAREER_LABEL);
      const oneBasedOk = (v: number[]) => v.every((x) => x - 1 in BUCK_CAREER_LABEL);
      expect(zeroBasedOk(values39)).toBe(true);
      expect(zeroBasedOk(values40)).toBe(true);
      expect(oneBasedOk(values39)).toBe(true);
      expect(oneBasedOk(values40)).toBe(true);
    },
  );
});
