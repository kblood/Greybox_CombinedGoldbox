/**
 * Where CoK stores a character's thief skills, and what the retail bytes say about the routine that
 * computes them.
 *
 * `recalcThiefSkills` has been in the tree since 2026-07-02 with no caller, and `savedCharacter.ts`
 * listed the thief-skill field among the record's unmapped bytes. Both were closed on 2026-08-26 by
 * one experiment: the six pregenerated `CHRDATA{n}.SAV` records shipped with the game contain
 * exactly one thief, and everything else in the record is zero around the field.
 *
 * **The offset is 219, not the hackdocs' 139..146.** (Cited as "137..144" here until 2026-09-07;
 * `CCHFORM.TXT` actually lists 139 Pick Pocket .. 146 Read Languages, with 137..138 being Current
 * Level and Level in Former Class. The conclusion is unaffected — the whole of 137..146 is zero in
 * 6 of 6 — but the number was wrong.) `CCHFORM.TXT` documents the FRUA `.CCH` layout,
 * and bytes 139..146 are zero in all six CoK records — including MOLLY's, so the FRUA offset cannot
 * be where her skills live. At 219..226 MOLLY holds `52 61 47 40 34 22 98 00`, the other five records
 * hold zeros, and so do all 88 of the 409-byte character-shaped records in the Gen1 `MON*CHA.DAX`
 * archives.
 *
 * **The null matters more than the hit.** Sliding an 8-byte window over all six records gives 2412
 * positions. The tables can emit all-zeros (level 0, or a race modifier that zeroes everything), so
 * 1168 of those windows match trivially and are excluded. Every remaining match is MOLLY@219 — one
 * window in 2412. Widening the model from the single fitted bonus to all 41 bonuses 0..40 grows the
 * reachable set from 2484 distinct 8-tuples to 101803 and the answer does not change: still exactly
 * one. A null that survives a 41x more permissive model is worth more than the hit itself.
 *
 * **What is measured versus what is fitted.** Fitting MOLLY with the Dex row left free over all 22
 * rows returns row 19, which is her own Dexterity byte — the first confirmation of the "row = raw
 * Dexterity" reading from something other than the decompiled routine. The residual, a uniform +7,
 * IS fitted and has no identified source. Its *placement* is not fitted: applied after the zero clamp
 * it would leave read languages at 7, and the stored byte is 0.
 *
 * Sources are the user's read-only installs — absent source => SKIP.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { optionalFixtureSkipTitle } from './optionalFixtureSkip.js';

import { readDaxDataBlocks } from '../src/loaders/dax.js';
import { decodeSavedCharacter } from '../src/loaders/savedCharacter.js';
import { recalcThiefSkills } from '../src/ruleset/addnd1e/thiefSkills.js';
import { dragonlanceClassesForCode } from '../src/index.js';

const BS = String.fromCharCode(92);
const norm = (p: string) => p.split(BS).join('/');
const GOG = 'C:/Program Files (x86)/GOG Galaxy/Games/Champions of Krynn';
const SAVES = [1, 2, 3, 4, 5, 6].map((n) => `${GOG}/SAVE/CHRDATA${n}.SAV`);
const have = SAVES.every((p) => existsSync(norm(p)));
const missingSaveFixtures = SAVES.flatMap((path, index) =>
  existsSync(norm(path)) ? [] : [`Champions of Krynn/SAVE/CHRDATA${index + 1}.SAV`],
);

const THIEF_SKILLS_OFFSET = 219;
/** MOLLY's stored eight, in `.CCH` order. */
const MOLLY = [52, 61, 47, 40, 34, 22, 98, 0];
/**
 * The class code the retail MOLLY record actually carries: 14, `Fighter/Thief`, at offset **91**.
 *
 * RE-DERIVED 2026-09-07. This was `const THIEF_CLASS_CODE = 5` with the comment "the class code
 * `savedCharacter.ts` reads as `thief`" — 5 is MOLLY's offset-90 byte, which is her RACE (Kender), and
 * the loader was reading the wrong offset. The assertion below now asks the question that actually
 * matters and is independent of which single number is right: does the class code NAME the thief
 * class? That holds for every Thief-bearing entry in the 17-entry enum, not just MOLLY's.
 */
const MOLLY_CLASS_CODE = 14;

function records(): { name: string; raw: Uint8Array }[] {
  return SAVES.map((p) => {
    const raw = new Uint8Array(readFileSync(norm(p)));
    return { name: decodeSavedCharacter(raw).name.trim(), raw };
  });
}

/** Every 8-tuple `recalcThiefSkills` can emit, with a uniform pre-clamp bonus of `bonus`. */
function reachable(bonus: number): Set<string> {
  const out = new Set<string>();
  for (let level = 0; level <= 12; level++) {
    for (let raceRow = 0; raceRow <= 12; raceRow++) {
      for (let dexRow = 0; dexRow <= 21; dexRow++) {
        out.add(withBonus(recalcThiefSkills(level, { raceRow, dexRow }), level, raceRow, bonus).join(','));
      }
    }
  }
  return out;
}

/**
 * Add a uniform bonus the way the routine's own `var_2` does — BEFORE the zero clamp, so a skill the
 * race modifier zeroes stays zero. `recalcThiefSkills` has already clamped, so a zeroed skill is
 * recognised by its 0 and left alone. That is only sound because no genuine nonzero skill in these
 * tables is 0, which the null test below asserts rather than assumes.
 */
function withBonus(skills: number[], level: number, raceRow: number, bonus: number): number[] {
  if (level <= 0 || bonus === 0) return skills;
  return skills.map((v) => (v === 0 ? 0 : v + bonus));
}

describe.skipIf(!have)(
  optionalFixtureSkipTitle('CoK saved-character thief skills — offset 219', missingSaveFixtures),
  () => {
  it('exactly one shipped record is nonzero there, and it is the only thief', () => {
    const recs = records();
    expect(recs.map((r) => r.name)).toEqual([
      'SIR STRONGSWORD',
      'ISTAN HORBIN',
      'GARIN',
      'MOLLY',
      'KAL',
      'SIRRION',
    ]);

    const nonzero = recs.filter((r) =>
      [...r.raw.subarray(THIEF_SKILLS_OFFSET, THIEF_SKILLS_OFFSET + 8)].some((v) => v !== 0),
    );
    expect(nonzero.map((r) => r.name)).toEqual(['MOLLY']);

    // The same record, and only that record, carries a class code that names the thief class. Asked
    // through the enum rather than against one literal, so a Cleric/Thief or Mage/Thief would count
    // too — the correlation being tested is "has thief skills iff the class code says thief".
    const thieves = recs.filter((r) => (dragonlanceClassesForCode(decodeSavedCharacter(r.raw).classCode) ?? []).includes('thief'));
    expect(thieves.map((r) => r.name)).toEqual(['MOLLY']);
    expect(decodeSavedCharacter(recs.find((r) => r.name === 'MOLLY')!.raw).classCode).toBe(MOLLY_CLASS_CODE);

    const molly = recs.find((r) => r.name === 'MOLLY')!;
    expect(decodeSavedCharacter(molly.raw).thiefSkills).toEqual(MOLLY);

    // The hackdocs/FRUA position is empty in every record, MOLLY's included, so it cannot be the
    // field. Note the surrounding window is NOT uniformly empty — GARIN, KAL and SIRRION carry
    // spell-known flags at 99..119 — so this is a statement about a specific 8 bytes, not a vacuous
    // one about the whole window.
    //
    // CITATION CORRECTED 2026-09-07: `CCHFORM.TXT` puts the eight thief skills at **139..146**
    // (139 Pick Pocket .. 146 Read Languages); 137 and 138 are Current Level and Level in Former
    // Class. The slice checked here is widened to 137..146 so it covers both the real FRUA window and
    // the "137..144" this file used to cite, and it is zero in 6 of 6 either way.
    for (const r of recs) {
      expect(`${r.name}:${[...r.raw.subarray(137, 147)].some((v) => v !== 0)}`).toBe(`${r.name}:false`);
    }
    const spellFlagged = recs.filter((r) => [...r.raw.subarray(99, 206)].some((v) => v !== 0));
    expect(spellFlagged.map((r) => r.name)).toEqual(['GARIN', 'KAL', 'SIRRION']);
  });

  it('the Dex row was predicted, not chosen: it comes back as MOLLY\u2019s own Dexterity', () => {
    const molly = records().find((r) => r.name === 'MOLLY')!;
    const dexByte = decodeSavedCharacter(molly.raw).abilities.dex;
    expect(dexByte).toBe(19);

    // Search with EVERY parameter free, including the Dex row over all 22 of them.
    const fits: { level: number; raceRow: number; dexRow: number; bonus: number }[] = [];
    for (let level = 0; level <= 12; level++) {
      for (let raceRow = 0; raceRow <= 12; raceRow++) {
        for (let dexRow = 0; dexRow <= 21; dexRow++) {
          for (let bonus = 0; bonus <= 40; bonus++) {
            const p = withBonus(recalcThiefSkills(level, { raceRow, dexRow }), level, raceRow, bonus);
            if (p.join(',') === MOLLY.join(',')) fits.push({ level, raceRow, dexRow, bonus });
          }
        }
      }
    }
    expect(fits).toEqual([{ level: 2, raceRow: 6, dexRow: 19, bonus: 7 }]);
    expect(fits[0]!.dexRow).toBe(dexByte);

    // The unfitted half of the residual: the bonus lands BEFORE the clamp. After it, read languages
    // would be 7 — this is the number the alternative predicts, next to the 0 that is stored.
    const base = recalcThiefSkills(2, { raceRow: 6, dexRow: 19 });
    expect(base).toEqual([45, 54, 40, 33, 27, 15, 91, 0]);
    expect(base.map((v) => v + 7)[7]).toBe(7);
    expect(MOLLY[7]).toBe(0);
  });

  it('the null: 2412 windows, and only one of them is a non-degenerate match', () => {
    const recs = records();
    const reach = reachable(7);

    let scanned = 0;
    let trivialZero = 0;
    const degenerate: string[] = [];
    const real: string[] = [];
    for (const r of recs) {
      for (let off = 0; off + 8 <= r.raw.length; off++) {
        scanned++;
        const w = [...r.raw.subarray(off, off + 8)];
        if (!reach.has(w.join(','))) continue;
        const nz = w.filter((v) => v !== 0).length;
        if (nz === 0) trivialZero++;
        else if (nz < 5) degenerate.push(`${r.name}@${off}`);
        else real.push(`${r.name}@${off}=${w.join(' ')}`);
      }
    }
    expect(scanned).toBe(2412);
    expect(trivialZero).toBe(1168);
    expect(degenerate.length).toBe(0);
    expect(real).toEqual([`MOLLY@${THIEF_SKILLS_OFFSET}=${MOLLY.join(' ')}`]);
    expect(reach.size).toBe(2484);

    // The control that makes the null mean something: make the model 41x more permissive by
    // admitting every uniform bonus 0..40, not just the fitted 7. The reachable set grows to
    // 101803 distinct 8-tuples and the corpus still yields exactly the same single window.
    const wide = new Set<string>();
    for (let bonus = 0; bonus <= 40; bonus++) for (const k of reachable(bonus)) wide.add(k);
    expect(wide.size).toBe(101803);
    const wideHits: string[] = [];
    for (const r of recs) {
      for (let off = 0; off + 8 <= r.raw.length; off++) {
        const w = [...r.raw.subarray(off, off + 8)];
        if (w.some((v) => v !== 0) && wide.has(w.join(','))) wideHits.push(`${r.name}@${off}`);
      }
    }
    expect(wideHits).toEqual([`MOLLY@${THIEF_SKILLS_OFFSET}`]);

    // The assumption `withBonus` rests on: a zeroed skill really is the only 0 the tables emit at a
    // real thief level, so "leave the zeros alone" is not quietly dropping a legitimate 0.
    let zeroBearing = 0;
    for (let raceRow = 0; raceRow <= 12; raceRow++) {
      for (let dexRow = 0; dexRow <= 21; dexRow++) {
        for (const v of recalcThiefSkills(1, { raceRow, dexRow })) if (v === 0) zeroBearing++;
      }
    }
    expect(zeroBearing).toBeGreaterThan(0); // read languages is 0 at level 1 for everyone
  });

  it('no monster record carries the field — it is character-only', () => {
    const archives = [1, 2, 3].map((n) => `${GOG}/MON${n}CHA.DAX`).filter((p) => existsSync(norm(p)));
    expect(archives.length).toBeGreaterThan(0);
    let scanned = 0;
    let nonzero = 0;
    for (const a of archives) {
      for (const b of readDaxDataBlocks(new Uint8Array(readFileSync(norm(a))))) {
        if (b.raw.length !== 409) continue;
        scanned++;
        if ([...b.raw.subarray(THIEF_SKILLS_OFFSET, THIEF_SKILLS_OFFSET + 8)].some((v) => v !== 0)) {
          nonzero++;
        }
      }
    }
    expect(scanned).toBeGreaterThan(20);
    expect(nonzero).toBe(0);
  });
  },
);
