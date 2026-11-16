/**
 * `reclac_thief_skills` (ovr026, sub_6AAEA) port — see
 * `packages/engine/src/ruleset/addnd1e/thiefSkills.ts` for the algorithm + the deliberately
 * deferred pieces (magic-item bonus branches, CoK race-row/dex-row mapping).
 *
 * `raceRow: 0` is a genuine "no modifier" baseline (RACE_MODIFIER row 0 is all-zero), but
 * `dexRow: 0` is NOT — DEX_MODIFIER row 0 has real nonzero entries for skills 1–3. Tests that want
 * to isolate `base_chance` in isolation use `dexRow: 8` instead, which transcribes to an all-zero
 * row (verified below by the "neutral dexRow" test).
 */
import { describe, it, expect } from 'vitest';
import {
  THIEF_SKILL_NAMES,
  thiefSkillPercent,
  recalcThiefSkills,
} from '../src/ruleset/addnd1e/thiefSkills.js';

const NEUTRAL = { raceRow: 0, dexRow: 8 } as const;

describe('recalcThiefSkills — level 0 (no thief levels)', () => {
  it('returns all-zero, 8 slots, matching PlayerCharacter.thiefSkills width', () => {
    const skills = recalcThiefSkills(0);
    expect(skills).toEqual(new Array(8).fill(0));
    expect(skills.length).toBe(THIEF_SKILL_NAMES.length);
  });

  it('also zeroes for a negative level (defensive clamp, not a throw)', () => {
    expect(recalcThiefSkills(-3)).toEqual(new Array(8).fill(0));
  });
});

describe('thiefSkillPercent — base_chance table transcription (neutral race + dex rows)', () => {
  it('dexRow 8 is genuinely all-zero (the neutral baseline these tests rely on)', () => {
    for (let skill = 1; skill <= 5; skill++) {
      expect(thiefSkillPercent(5, skill as 1, { dexRow: 8 })).toBe(thiefSkillPercent(5, skill as 1, { dexRow: 13 }));
    }
  });

  it('level 1: matches the COAB base_chance row 1 (0x1E,0x19,0x14,0x0F,0x0A,0x0A,0x55,0x00)', () => {
    const expected = [0x1e, 0x19, 0x14, 0x0f, 0x0a, 0x0a, 0x55, 0x00];
    for (let skill = 1; skill <= 8; skill++) {
      expect(thiefSkillPercent(1, skill as 1, NEUTRAL)).toBe(expected[skill - 1]);
    }
  });

  it('level 12 (table max): matches the COAB base_chance row 12', () => {
    const expected = [0x64, 0x4d, 0x4b, 0x5e, 0x4d, 0x23, 0x63, 0x41];
    for (let skill = 1; skill <= 8; skill++) {
      expect(thiefSkillPercent(12, skill as 1, NEUTRAL)).toBe(expected[skill - 1]);
    }
  });

  it('clamps levels above the table max (13+) to the level-12 row, not a crash', () => {
    expect(thiefSkillPercent(13, 1, NEUTRAL)).toBe(thiefSkillPercent(12, 1, NEUTRAL));
    expect(thiefSkillPercent(99, 7, NEUTRAL)).toBe(thiefSkillPercent(12, 7, NEUTRAL));
  });

  it('Climb Walls (skill 7) starts high (~85%) and climbs — the AD&D-1e signature shape', () => {
    // A real internal-consistency check: Climb Walls is famously ~85%+ from level 1 in 1e,
    // unlike the other skills which start low. Confirms the skill-index/column mapping (CCHFORM.TXT
    // byte 145) lines up with the transcribed table, independent of the COAB source's own comments.
    // (Skill 7 never consults the dex table, so NEUTRAL isn't even required here.)
    const l1 = thiefSkillPercent(1, 7);
    const l12 = thiefSkillPercent(12, 7);
    expect(l1).toBeGreaterThanOrEqual(85);
    expect(l12).toBeGreaterThanOrEqual(l1);
  });
});

describe('thiefSkillPercent — race modifier', () => {
  it('raceRow 0 (all-zero row) leaves the base chance untouched', () => {
    for (let skill = 1; skill <= 8; skill++) {
      expect(thiefSkillPercent(5, skill as 1, { raceRow: 0 })).toBe(thiefSkillPercent(5, skill as 1));
    }
  });

  it('a positive race modifier adds to the base (row 4, skill 1: +10)', () => {
    const base = thiefSkillPercent(3, 1, { dexRow: 8 });
    expect(thiefSkillPercent(3, 1, { raceRow: 4, dexRow: 8 })).toBe(base + 10);
  });

  it('a negative race modifier bigger than the base floors the skill at 0, not negative', () => {
    // Row 8, skill 4 = -20. At level 1 the base (0x0F=15) is smaller than 20, so the floor fires.
    // Skill 4's dexRow-0 entry happens to be 0, so the un-neutralized default is safe to assert on.
    expect(thiefSkillPercent(1, 4)).toBe(0x0f);
    expect(thiefSkillPercent(1, 4, { raceRow: 8 })).toBe(0);
  });

  it('a negative race modifier smaller than the base just subtracts (no floor)', () => {
    // Row 8, skill 8 (Read Languages) = +10 (positive — sanity check that not every row-8 entry is
    // negative; skill 8 also never consults the dex table, so no NEUTRAL needed).
    const base = thiefSkillPercent(6, 8);
    expect(thiefSkillPercent(6, 8, { raceRow: 8 })).toBe(base + 10);
  });
});

describe('thiefSkillPercent — Dex modifier applies only to skills 1-5', () => {
  it('skill 6 (Hear Noise), 7 (Climb Walls), 8 (Read Languages) ignore dexRow entirely', () => {
    for (const skill of [6, 7, 8] as const) {
      const noDex = thiefSkillPercent(5, skill);
      const highDex = thiefSkillPercent(5, skill, { dexRow: 21 });
      expect(highDex).toBe(noDex);
    }
  });

  it('skill 1 (Pick Pocket): dexRow 18 adds +5 over the implicit dexRow-0 baseline (transcribed table)', () => {
    const base = thiefSkillPercent(5, 1); // dexRow defaults to 0, contributing +5 (row 0 idx 1)
    expect(thiefSkillPercent(5, 1, { dexRow: 18 })).toBe(base + 5); // row 18 idx 1 = 10
  });

  it('clamps dexRow above the table max (22+) to the last row, not a crash', () => {
    expect(thiefSkillPercent(5, 2, { dexRow: 21 })).toBe(thiefSkillPercent(5, 2, { dexRow: 99 }));
  });
});

describe('recalcThiefSkills — composes all 8 skills in PlayerCharacter.thiefSkills order', () => {
  it('matches calling thiefSkillPercent for each of the 8 skill indices', () => {
    const mods = { raceRow: 5, dexRow: 16 };
    const composed = recalcThiefSkills(9, mods);
    const manual = THIEF_SKILL_NAMES.map((_, i) => thiefSkillPercent(9, (i + 1) as 1, mods));
    expect(composed).toEqual(manual);
  });
});


/**
 * The row-index mapping, resolved 2026-08-24 from the routine's own use sites rather than guessed:
 * `ovr026.cs:543` is `unk_1A243[player.stats2.Dex.full, skill]`, so the Dex row IS the raw
 * Dexterity score with no offset. These tests corroborate that reading against the published AD&D
 * 1e thief table -- if the offset were wrong, the AD&D landmarks would not land on the row numbers
 * their Dexterity scores name.
 */
describe('the Dex row is the raw Dexterity score', () => {
  /** AD&D 1e thief Dexterity adjustments, skills 1..5, for the scores the table covers. */
  const ADND: Record<number, number[]> = {
    9: [-15, -10, -10, -20, -10],
    11: [-5, 0, -5, -10, 0],
    13: [0, 0, 0, 0, 0],
    14: [0, 0, 0, 0, 0],
    15: [0, 0, 0, 0, 0],
  };

  function dexDelta(dex: number, skill: 1 | 2 | 3 | 4 | 5): number {
    // Difference between this Dex row and a row known to be all-zero isolates the Dex term.
    return thiefSkillPercent(12, skill, { dexRow: dex }) - thiefSkillPercent(12, skill, { dexRow: 8 });
  }

  for (const [dex, expected] of Object.entries(ADND)) {
    it(`row ${dex} matches the AD&D adjustments for Dexterity ${dex}`, () => {
      const got = [1, 2, 3, 4, 5].map((s) => dexDelta(Number(dex), s as 1));
      expect(got).toEqual(expected);
    });
  }

  it('the AD&D landmarks are NOT the same on neighbouring rows', () => {
    // The null. Rows 13/14/15 are all-zero, so a match there is worth nothing on its own; row 9
    // is the discriminating one, and shifting it by one in either direction must break it.
    expect([1, 2, 3, 4, 5].map((s) => dexDelta(9, s as 1))).toEqual(ADND[9]);
    expect([1, 2, 3, 4, 5].map((s) => dexDelta(8, s as 1))).not.toEqual(ADND[9]);
    expect([1, 2, 3, 4, 5].map((s) => dexDelta(10, s as 1))).not.toEqual(ADND[9]);
  });

  it('rows 0..8 are NOT the AD&D "9 or less" row -- a deviation, not a bug in this decoder', () => {
    // AD&D applies the row-9 penalty to every score at or below 9. This build does not: row 8 is
    // all-zero, so a Dex-8 thief takes no penalty where the rulebook imposes the largest one.
    for (const skill of [1, 2, 3, 4, 5] as const) expect(dexDelta(8, skill)).toBe(0);
    expect(dexDelta(9, 1)).toBe(-15);
  });

  it('row 10 carries -19 for Pick Pocket where AD&D has -10', () => {
    expect(dexDelta(10, 1)).toBe(-19);
  });

  it('rows 20 and 21 are past the end of the real table', () => {
    // Not modifier data: 99s and 18s from whatever follows it. `Dex.full` above 19 indexes them,
    // so a magically boosted Dexterity reads adjacent bytes in the original.
    expect([1, 2, 3, 4, 5].map((s) => dexDelta(20, s as 1))).toEqual([8, 8, 18, 17, 99]);
    expect([1, 2, 3, 4, 5].map((s) => dexDelta(21, s as 1))).toEqual([0, 3, 18, 3, 18]);
    // Every legitimate row stays inside a plausible percentage adjustment; these do not.
    for (let dex = 9; dex <= 19; dex++) {
      for (const skill of [1, 2, 3, 4, 5] as const) {
        expect(Math.abs(dexDelta(dex, skill))).toBeLessThanOrEqual(20);
      }
    }
  });
});
