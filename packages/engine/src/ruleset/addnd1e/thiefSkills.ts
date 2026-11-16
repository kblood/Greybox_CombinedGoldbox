/**
 * AD&D 1st-edition **thief skill percentages** (`reclac_thief_skills`, `sub_6AAEA` in `ovr026`;
 * called from `ReclacClassBonuses` whenever `thief_lvl > 0` or a reactivated old thief level
 * applies — `docs/engine/research/decompile-ovr026-class-recalc.md`). CoK's `PlayerCharacter`
 * already carries an 8-slot `thiefSkills` array (`save/character.ts`), but until now it was only
 * ever *copied* from a save/import — nothing in the engine *computed* it. This module is that
 * compositing glue: `base_chance[level][skill]` + a race modifier (floored at 0 if the modifier is
 * a negative bigger than the base) + a Dex modifier on the five "physical" skills.
 *
 * Skill order matches the real on-disk `.CCH` layout (hackdocs `CCHFORM.TXT` bytes 139–146,
 * "Thieving skills are adjusted for level and race but not for dexterity or armor" — the COAB
 * decompile below shows that last clause is incomplete for this specific build: there **is** a
 * Dex table, applied to skills 1–5 only).
 *
 * **Deliberately out of scope (not silently dropped — flagged):**
 * - The two magic-item bonus branches in the original routine (`var_A`/`var_B`, gated on
 *   `item.ScrollLearning(3, 2|11)` — some magic item that grants a thief-skill training bonus).
 *   `thiefSkillPercent`/`recalcThiefSkills` compute the item-free base; wiring the item bonus is a
 *   separate follow-up once the specific item(s) that set that flag are identified.
 * - **The race-modifier row index is NOT resolved to CoK's 7 Dragonlance races.** The COAB
 *   `Race` enum (monster/dwarf/elf/gnome/half_elf/halfling/half_orc/human, 8 values) does not match
 *   either `RACE_MODIFIER`'s own 13 rows or CoK's actual Dragonlance race set (human, hill dwarf,
 *   mountain dwarf, silvanesti elf, qualinesti elf, half-elf, kender — `addnd1e-dragonlance/races.ts`),
 *   and the generic hackdocs `CCHFORM.TXT` race byte (0=Elf..6=Monster, 7 values, no split
 *   elves/dwarves, no kender) is a *different, non-Dragonlance* encoding that must not be assumed
 *   to apply here without independent verification (same caution already on record in
 *   `cok-dragonlance-rules.md` §3: "needs ECL or save-file verification"). Until that mapping is
 *   pinned, callers pass the raw `raceRow` index (0 = no modifier, matching row 0/7/11's all-zero
 *   rows) rather than a `DragonlanceRaceId` — mirroring `conPoisonSaveBonus`'s existing pattern of
 *   leaving race resolution to the caller.
 * **Both row indices are RESOLVED (2026-08-24), from the routine's own two use sites rather than
 * by inference.** `ovr026.cs:543` reads `unk_1A243[player.stats2.Dex.full, skill]` and
 * `ovr026.cs:532/539` read `unk_1A230[(int)player.race, skill]`. So:
 *
 * - **The Dex row IS the raw Dexterity score**, with no offset at all. The earlier note here --
 *   that offsetting by the AD&D 3..18/19 range was "a guess, not a verified fact" -- was looking
 *   for an offset that does not exist.
 * - **The race row is the game's own `Race` enum ordinal.** That resolves COAB. It does NOT
 *   resolve CoK: the Dragonlance race set is different and larger, so the caveat below still
 *   stands and is still the thing blocking a caller.
 *
 * An independent cross-check corroborates the Dex reading rather than relying on one line of
 * decompiled C#. Read as "row index = Dexterity", rows 9..19 of `DEX_MODIFIER` line up with the
 * published AD&D 1e thief table where they should: row 9 is exactly the "Dexterity 9 or less"
 * row (-15/-10/-10/-20/-10), rows 13..15 are all-zero as AD&D's 13-15 band requires, and rows
 * 17..19 climb. A wrong offset would not put those landmarks on the right row numbers.
 *
 * **Retail corroboration, and a deviation CoK's own build carries (2026-08-26).** The Dex reading
 * above was resolved from one line of decompiled C# and cross-checked against the published AD&D
 * table. It now has a third, independent confirmation from retail bytes: CoK's shipped pregenerated
 * party stores its thief skills at save-record offset 219 (`loaders/savedCharacter.ts`), and the one
 * thief in it, MOLLY, holds `52 61 47 40 34 22 98 00`. Fitting that against these tables with the Dex
 * row left FREE over all 22 rows returns row **19** — MOLLY's own Dexterity byte. The row was
 * predicted, not chosen.
 *
 * The same fit exposes a real difference between the two games. MOLLY is
 * `recalcThiefSkills(2, { raceRow: 6, dexRow: 19 })` **plus a uniform 7** on every skill the race
 * modifier does not zero. `sub_6AAEA` as decompiled cannot produce that: its only uniform term is
 * `var_B`'s `+10`, and `var_B` is added *after* the zero clamp, so it would have left read languages
 * at 10 where MOLLY's is 0. A pre-clamp uniform term does reproduce all eight bytes including that
 * zero — which is how the placement is known even though the value is not. So CoK's routine carries
 * a `var_2`-equivalent that applies to all eight skills, where COAB's applies to skills 1–2 only.
 * **One sample.** The value 7 is fitted and has no identified source; do not build on it. What is not
 * fitted is the Dex row, the race row's existence, and the pre-clamp placement.
 *
 * **Still blocked, and this is why the module has no caller.** `raceRow` 6 fits MOLLY, and 6 is
 * `half_orc` in COAB's `Race` enum — a race CoK does not have. One sample plus a fitted bonus term
 * cannot pin the Dragonlance race→row mapping, so nothing here computes a shipped character's
 * skills; `importParty.ts` carries the stored bytes through instead.
 *
 * **Three deviations from AD&D, recorded rather than corrected** -- this transcribes the shipped
 * game, not the rulebook:
 * - Rows 0..8 (Dex 0..8) are NOT the AD&D "9 or less" row; they hold unrelated values, and row 8
 *   is all-zero. A Dex-8 thief in this build gets no penalty where AD&D imposes the largest one.
 * - Row 10 has -19 for Pick Pocket where AD&D has -10.
 * - Rows 20 and 21 (`[12,8,8,18,17,99]`, `[99,0,3,18,3,18]`) are not modifier rows at all -- 99s
 *   and 18s reading past the table's real end. `player.stats2.Dex.full` above 19 indexes them, so
 *   the original will read adjacent data for a magically boosted Dexterity.
 */

/** The 8 thief skills, in `PlayerCharacter.thiefSkills` / `.CCH` byte order (139–146). */
export const THIEF_SKILL_NAMES = [
  'pickPocket',
  'openLocks',
  'findRemoveTraps',
  'moveSilently',
  'hideInShadows',
  'hearNoise',
  'climbWalls',
  'readLanguages',
] as const;
export type ThiefSkillName = (typeof THIEF_SKILL_NAMES)[number];

/** 1-based skill index into {@link THIEF_SKILL_NAMES} (matches the decompile's `skill` loop var). */
export type ThiefSkillIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * `base_chance[level][skill]`, thief level 0..12, skill 1..8 (column 0 unused). Transcribed
 * byte-for-byte from `coab_extracted/engine/ovr026.cs` (`unk_1A1D0`, file `seg600:3EC0`).
 */
const BASE_CHANCE: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0x1e, 0x19, 0x14, 0x0f, 0x0a, 0x0a, 0x55, 0x00],
  [0, 0x23, 0x1d, 0x19, 0x15, 0x0f, 0x0a, 0x56, 0x00],
  [0, 0x28, 0x21, 0x1e, 0x1b, 0x14, 0x0f, 0x57, 0x00],
  [0, 0x2d, 0x25, 0x23, 0x21, 0x19, 0x0f, 0x58, 0x14],
  [0, 0x32, 0x2a, 0x28, 0x28, 0x1f, 0x14, 0x5a, 0x19],
  [0, 0x37, 0x2f, 0x2d, 0x25, 0x14, 0x5c, 0x1e, 0x3c],
  [0, 0x34, 0x32, 0x37, 0x2b, 0x19, 0x5e, 0x23, 0x41],
  [0, 0x39, 0x37, 0x3e, 0x31, 0x19, 0x60, 0x28, 0x46],
  [0, 0x3e, 0x3c, 0x46, 0x38, 0x1e, 0x62, 0x2d, 0x50],
  [0, 0x43, 0x41, 0x4e, 0x3f, 0x1e, 0x63, 0x32, 0x5a],
  [0, 0x48, 0x46, 0x56, 0x46, 0x23, 0x63, 0x3c, 0x64],
  [0, 0x64, 0x4d, 0x4b, 0x5e, 0x4d, 0x23, 0x63, 0x41],
];

/**
 * Race-modifier row, skill 1..8 (column 0 unused). Transcribed byte-for-byte from
 * `coab_extracted/engine/ovr026.cs` (`unk_1A230`, file `seg600:3F20`). Row *index* semantics are
 * unresolved for CoK — see the module doc comment. Rows 0, 7 and 11 are all-zero (no modifier).
 */
const RACE_MODIFIER: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 10, 15, 0, 0, 0, -10, -5],
  [0, 5, -5, 0, 5, 10, 5, 0, 0],
  [0, 0, 5, 10, 5, 5, 10, -15, 0],
  [0, 10, 0, 0, 0, 5, 0, 0, 0],
  [0, 5, 5, 5, 10, 15, 5, -15, -5],
  [0, -5, 5, 5, 0, 0, 5, 5, -10],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, -15, -10, -10, -20, -10, -19, -5, 10],
  [0, -15, -5, -5, 0, -5, -10, 0, 0],
  [0, 0, 0, -5, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, -5, 0, 0, 0],
];

/**
 * Dex-modifier row, skill 1..5 only (column 0 unused; skills 6–8 never index this table — that's
 * the `skill < 6` guard in the original routine, and matches real AD&D-1e: Hear Noise, Climb
 * Walls and Read Languages are not Dex-scaled). Transcribed byte-for-byte from
 * `coab_extracted/engine/ovr026.cs` (`unk_1A243`, file `seg600:3F33`), 22 rows (0..21). **Row-index
 * mapping to a raw Dexterity score is UNRESOLVED** (same caution as `RACE_MODIFIER` above) — row 0
 * is not all-zero (unlike `BASE_CHANCE`/`RACE_MODIFIER` row 0), so it is very unlikely to be a
 * "no Dex score" placeholder; whether row *n* means Dex *n* or Dex *(n+3)* (offsetting for AD&D's
 * 3..25 range) or something else needs an ECL/save-byte cross-check. Callers pass a raw `dexRow`
 * table index, not an ability score.
 */
const DEX_MODIFIER: readonly (readonly number[])[] = [
  [0, 5, 10, 5, 0, 0],
  [0, 0, 5, 10, 5, 5],
  [5, 10, -15, 0, 10, 0],
  [0, 0, 0, 5, 0, 0],
  [0, 0, 5, 5, 5, 10],
  [10, 15, 5, -15, -5, -5],
  [-5, 5, 5, 0, 0, 5],
  [5, 5, -10, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
  [0, -15, -10, -10, -20, -10],
  [-10, -19, -5, -10, -15, -5],
  [-5, -5, 0, -5, -10, 0],
  [0, 0, 0, 0, -5, 0],
  [0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0],
  [0, 0, -5, 0, 0, 0],
  [0, 5, 10, 0, 5, 5],
  [5, 10, 15, 5, 10, 10],
  [10, 15, 20, 10, 12, 12],
  [12, 8, 8, 18, 17, 99],
  [99, 0, 3, 18, 3, 18],
];

const MAX_TABLE_LEVEL = BASE_CHANCE.length - 1;
const MAX_TABLE_DEX_ROW = DEX_MODIFIER.length - 1;

export interface ThiefSkillModifiers {
  /** Race-modifier table row (0 = none — see the module doc comment on the unresolved mapping). */
  raceRow?: number;
  /**
   * Dex-modifier table row (0..21). **This IS the raw Dexterity score, with no offset** —
   * `ovr026.cs:543` indexes the table with `player.stats2.Dex.full` directly. This doc said the
   * opposite ("not a raw Dexterity score; the row↔score mapping is unresolved") until 2026-08-26,
   * two days after the module header recorded the resolution; the contradiction sat inside this one
   * file and was exactly the sentence that would stop a caller passing Dexterity here.
   *
   * Only consulted for skills 1–5. Defaults to 0, which is a real (nonzero) table row rather than a
   * "no Dex bonus" baseline — pass the character's Dexterity, not a sentinel.
   */
  dexRow?: number;
}

/**
 * One skill's percentage at `thiefLevel` (item-bonus branches excluded — see module doc). Clamps
 * `thiefLevel`/`dexRow` into the transcribed tables' range rather than throwing (levels/rows above
 * the covered range reuse the table's last row, matching the "no room left to grow" shape the
 * decompile's own `Math.Abs` floor check implies for out-of-band race modifiers).
 */
export function thiefSkillPercent(
  thiefLevel: number,
  skill: ThiefSkillIndex,
  mods: ThiefSkillModifiers = {},
): number {
  const level = Math.max(0, Math.min(thiefLevel, MAX_TABLE_LEVEL));
  const raceRow = mods.raceRow ?? 0;
  const raceMod = RACE_MODIFIER[raceRow]?.[skill] ?? 0;
  const base = BASE_CHANCE[level][skill];

  // The decompile's floor: a negative race modifier bigger in magnitude than the base chance
  // zeroes the skill outright, rather than going negative.
  if (raceMod < 0 && base < Math.abs(raceMod)) return 0;

  let pct = base + raceMod;
  if (skill < 6) {
    const dexRow = Math.max(0, Math.min(mods.dexRow ?? 0, MAX_TABLE_DEX_ROW));
    pct += DEX_MODIFIER[dexRow]?.[skill] ?? 0;
  }
  return pct;
}

/**
 * All 8 thief skills at `thiefLevel`, in `PlayerCharacter.thiefSkills` order. Returns all-zero at
 * level 0 (no thief levels — matches `player.thief_skills` staying untouched/zeroed when
 * `reclac_thief_skills` is never called, which `ReclacClassBonuses` only does for `thief_lvl > 0`).
 */
export function recalcThiefSkills(thiefLevel: number, mods: ThiefSkillModifiers = {}): number[] {
  if (thiefLevel <= 0) return new Array(THIEF_SKILL_NAMES.length).fill(0);
  return THIEF_SKILL_NAMES.map((_, i) => thiefSkillPercent(thiefLevel, ((i + 1) as ThiefSkillIndex), mods));
}
