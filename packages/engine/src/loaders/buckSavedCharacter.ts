/**
 * Buck Rogers XXVc `chrdata{n}.sav` loader (R2, round 34).
 *
 * Buck Rogers: Countdown to Doomsday ships six pregenerated party members as loose, UNCOMPRESSED
 * 259-byte files (`chrdata1.sav` .. `chrdata6.sav` — no DAX container, no TOC, straight bytes on
 * disk; confirmed by reading them directly against
 * `D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/`). Round 33
 * (`docs/engine/research/buck-containers.md`) had already found Buck's OWN `mon0cha.dax` monster
 * archive decompresses to 263-byte records and Matrix Cubed's `MON0CHA.DAX` to 259-byte records,
 * neither matching any `MonsterLayoutProfile`, and flagged both as genuinely unmapped rather than
 * fit to the nearest size.
 *
 * **This file's finding: the 259-byte save format IS Matrix's 259-byte monster format**, and Buck's
 * own 263-byte monster format is the same layout with 4 bytes inserted near the tail (evidence and
 * the full insertion-point method are on `packages/engine/src/loaders/monster.ts`'s
 * `MonsterLayoutProfile` doc comment and `docs/engine/research/buck-record-layout.md` — not repeated
 * here). This loader decodes the SAVE side only; it does not decode monster records (see that other
 * file's doc comment for exactly why no `MonsterLayoutProfile` was added despite the shared layout:
 * `MonsterLayout.ac`/`.thac0` are non-optional, and AC/THAC0 were not located this round).
 *
 * **THE EPISTEMIC SPLIT THIS FILE ENFORCES** (same convention `secretSavedCharacter.ts` uses):
 *
 * **MEASURED (own oracle, reproduced against the real 6-pregen party):**
 *  - `name`@0 — a `PString` (length byte, ≤ 15, ASCII, NUL-padded to 15), same convention as every
 *    other Gen1/CoAB-lineage save format. All 6 decode to the expected party member name
 *    (FLAVIUS/CELESTE/PIERRE/"NICOLE STEELE"/ROARKE/JANELLE), length byte matching the string length
 *    exactly in all 6 cases.
 *  - `abilities`@16 / `abilitiesMax`@23 — an exhaustive uniqueness sweep over every offset pair
 *    `(a, a+7)` in the 259-byte record (mirroring `secretSavedCharacter.ts`'s own ability-offset
 *    sweep technique) finds exactly ONE non-trivial 7-byte block that duplicates itself across all 6
 *    records with values that vary party-to-party: `16..22` / `23..29`. Values run 9..21 — wider
 *    than the classic AD&D 3..18 CoK/CoAB/Secret use, consistent with Buck Rogers XXVc being a
 *    different (percentile/TECH-augmented) ruleset, not a decode error (the SAME "current == max at
 *    creation" shape those AD&D titles' own ability blocks show). **Field ORDER within the septet
 *    (STR/DEX/CON/INT/WIS/CHA/TECH, matching this round's plan text) is NOT independently verified
 *    against any in-game or manual source — no digitized Buck Rogers ability-order reference exists
 *    in this repo — so the septet is exposed as an ordered tuple, not named fields, until an order
 *    oracle exists.**
 *  - `hitPoints`@69, mirrored @227 — the SAME uniqueness-sweep technique, applied to every offset
 *    pair 158 bytes apart, finds `raw[69] === raw[227]` on all 6 pregens with 6 DISTINCT nonzero
 *    values (26, 22, 16, 16, 14, 13) — the Gen1-standard "HP stored twice"
 *    convention this codebase already documents for CoK (214/251), DoK (40/214) and Secret
 *    (305/437). The sweep's only other qualifying pair, `54`/`229` (values 15/15/12/12/9/9, only 3
 *    distinct values), is a second, unidentified field — kept off this type rather than misnamed;
 *    reachable via `raw` for now.
 *
 * **PREDICTED, shipped at reduced confidence:**
 *  - `moralePercent` — byte 231 reuses `monster.ts`'s exported {@link decodeMorale} (the SAME
 *    `control_morale` >0x7F gate CoK/DoK/CoAB/Gateway/Treasures already use). All 6 Buck pregens
 *    read ≤ 0x7F here (never-checks-morale, like the rest of a "brave" party), so this file's own
 *    oracle has NOT observed the >0x7F branch fire on a save record — only on a cross-title monster
 *    record (`monster.ts`'s doc comment: Matrix's "ZANE" reads 148 at this same offset). Shipped
 *    because the gate and the offset both transfer from elsewhere in this codebase, not because a
 *    Buck save has been seen to exercise it.
 *
 * **NOT NAMED — carried raw only, exposed via {@link BuckSavedCharacter.raw}:** everything else,
 * including the two single-byte fields at 40/41 that plausibly hold class/category (offset 40 varies
 * 1..5 across the party; offset 41 is a constant 2 on all 6 pregens, unlike Matrix's monster "ZANE"
 * which reads 1 there — consistent with 41 discriminating "player-created" vs "monster" but NOT
 * cross-checked against a second monster to rule out coincidence), and the byte(s) at 52/61 (both
 * constant 1 on all 6 pregens — a "level 1" candidate that a six-strong, all-level-1 pregen party
 * cannot itself discriminate from any other always-1 creation-time field). No hypothesis for any of
 * these survived contact with a second independent oracle this round, so none is named here.
 */
import { decodeMorale } from './monster.js';

export { decodeMorale };

/** Exact byte size of a `chrdata{n}.sav` file — plain bytes on disk, no DAX/TOC wrapper. */
export const BUCK_SAVED_CHARACTER_SIZE = 259;

/* --- Round 35 R4: the four label tables Buck's OWN `START.EXE` carries -------------------------
 *
 * TRANSCRIBED FROM BYTES, DELIBERATELY NOT WIRED TO A RECORD COLUMN. `tools/buck_string_tables.py`
 * re-derives all four from the retail, never-vendored DOS release
 * (`D:\Games\Emulator\DOS\GoldBox\BuckRogers1-CountdownToDoomsday\start.exe`, EXEPACK-unpacked)
 * and `tools/test_buck_string_tables.py` pins every number;
 * `docs/engine/research/buck-string-tables.md` carries the evidence and the refusals.
 *
 * WHY THEY ARE UNCONSUMED, STATED RATHER THAN LEFT TO BE DISCOVERED: no save-record column can be
 * assigned to any of them on this evidence. All EIGHT of the (candidate column 39/40) x
 * (career/race table) x (0-based/1-based) combinations produce a party in which every one of the
 * six pregens lands on a named entry, and 16 of the record's 259 columns pass the same
 * career-index plausibility filter at all. That is the measured NULL, and it does not
 * discriminate — so these constants are exported for the research trail and for a future round
 * that has an order oracle (a creation-screen or character-sheet read), and NOTHING in this file
 * reads them. Round 34's Buck panel carries the same disclosure for the ability septet's order.
 *
 * THE FENCEPOST NULL IS NOT UNIFORM ACROSS THE FOUR, and the difference is recorded because it
 * cost a false sense of anchoring elsewhere: `career` (stride 12) and `race` (stride 14) score
 * 7/7 and 8/8 at their real base against 0 at all 16 shifts, but `abbrev` (stride 5) scores 6/7 at
 * shifts ±5 and `sex` (stride 7) scores 2/2 at shift +7 — a ±8 window cannot separate a table
 * whose stride it can reach. Those two are anchored by their boundaries instead.
 */

/** Buck's OWN career-name table — unpacked `START.EXE` file offset `0xECDC`, 12-byte
 * Pascal-`string[11]` stride, 7 entries, keyed 0-based by table position (NOT by any record byte —
 * see the block comment above). SIX non-monster careers, one more than
 * `ruleset/buckrogers/index.ts`'s `BUCK_ROGERS_CAREERS` models. */
export const BUCK_CAREER_LABEL: Readonly<Record<number, string>> = {
  0: 'Rocket Jock',
  1: 'Medic',
  2: 'Warrior',
  3: 'Engineer',
  4: 'Rogue',
  5: 'Scout',
  6: 'Monster',
};

/** Buck's OWN race-name table — unpacked `START.EXE` file offset `0xED32`, 14-byte stride, 8
 * entries, keyed 0-based by table position. Note the base is `0xED32`, not the `0xED30` the career
 * table's own end would suggest: two pad bytes sit between the tables, which is why this offset is
 * measured from the `Terran` PString rather than computed. */
export const BUCK_RACE_LABEL: Readonly<Record<number, string>> = {
  0: 'Terran',
  1: 'Martian',
  2: 'Venusian',
  3: 'Mercurian',
  4: 'Tinker',
  5: 'Desert Runner',
  6: 'lunarian',
  7: 'lowlander',
};

/** Buck's OWN ability-abbreviation table — unpacked `START.EXE` file offset `0xE77C`, 5-byte
 * stride, 7 entries. This is the abbreviation LIST; it is explicitly NOT a claim that the record's
 * ability septet at offsets 16..22 is stored in this order (that order stays unmeasured — see this
 * file's `abilities` bullet). */
export const BUCK_ABILITY_ABBREV: readonly string[] = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA', 'TCH'];

/** Buck's OWN sex table — unpacked `START.EXE` file offset `0xEDA2`, 7-byte stride, 2 entries.
 * Record offset 38 is the ONLY one of the 259 columns whose six values are exactly `[0,1,0,1,0,1]`,
 * and 0=Male/1=Female would agree with the six pregens' own names — but three other columns are
 * strictly binary and "the names sound male/female" is a subjective oracle, so no column is
 * assigned. Reported in `docs/engine/research/buck-string-tables.md`, not shipped as a field. */
export const BUCK_SEX_LABEL: Readonly<Record<number, string>> = {
  0: 'Male',
  1: 'Female',
};

const NAME_OFFSET = 1;
const NAME_MAX = 15;
const ABILITIES_OFFSET = 16;
const ABILITIES_MAX_OFFSET = 23;
const ABILITIES_COUNT = 7;
const HP_OFFSET = 69;
const HP_MIRROR_OFFSET = 227;
const MORALE_OFFSET = 231;

/**
 * The seven raw XXVc ability bytes, in on-disk order. Field identity (which slot is STR vs TECH) is
 * a plan-text hypothesis, not independently verified this round — see the file doc's "MEASURED"
 * section — so this is an ordered tuple rather than a named-field object.
 */
export type BuckAbilitySeptet = readonly [number, number, number, number, number, number, number];

export interface BuckSavedCharacter {
  /** `PString` name, e.g. "FLAVIUS", "NICOLE STEELE". */
  name: string;
  /** Raw ability septet @16..22 (see {@link BuckAbilitySeptet}'s caveat on field order). */
  abilities: BuckAbilitySeptet;
  /** The duplicate septet @23..29. Equal to {@link abilities} on all 6 known pregens (unmodified
   * characters at creation); kept separate because a modified/boosted character need not stay equal. */
  abilitiesMax: BuckAbilitySeptet;
  /** Hit points, read from offset 69 (mirrored at 227 — see {@link hitPointsMirrorAgrees}). */
  hitPoints: number;
  /** Combat morale % (0..102), or `undefined` if the record's control_morale byte is ≤ 0x7F (the
   * "never checks morale" gate) — see {@link decodeMorale}. */
  moralePercent: number | undefined;
  /** `raw[69] === raw[227]`. `false` would mean this record breaks the mirror every other known
   * Gen1/XXVc pregen honours; surfaced so a caller (or a test) can catch that without re-reading
   * `raw` itself. */
  hitPointsMirrorAgrees: boolean;
  /** The full 259-byte record. Every byte not named above (including the offset-40/41 and 52/61
   * candidates the file doc describes but declines to name) is reachable only here. */
  raw: Uint8Array;
}

function readName(raw: Uint8Array): string {
  const len = Math.min(raw[0] ?? 0, NAME_MAX);
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = raw[NAME_OFFSET + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function readSeptet(raw: Uint8Array, base: number): BuckAbilitySeptet {
  const out: number[] = [];
  for (let i = 0; i < ABILITIES_COUNT; i++) out.push(raw[base + i]);
  return out as unknown as BuckAbilitySeptet;
}

/** Decode one `chrdata{n}.sav` file. Throws if `raw.length !== 259`. */
export function decodeBuckSavedCharacter(raw: Uint8Array): BuckSavedCharacter {
  if (raw.length !== BUCK_SAVED_CHARACTER_SIZE) {
    throw new Error(`buckSavedCharacter: expected ${BUCK_SAVED_CHARACTER_SIZE} bytes, got ${raw.length}`);
  }
  return {
    name: readName(raw),
    abilities: readSeptet(raw, ABILITIES_OFFSET),
    abilitiesMax: readSeptet(raw, ABILITIES_MAX_OFFSET),
    hitPoints: raw[HP_OFFSET],
    moralePercent: decodeMorale(raw, MORALE_OFFSET),
    hitPointsMirrorAgrees: raw[HP_OFFSET] === raw[HP_MIRROR_OFFSET],
    raw,
  };
}

/**
 * A decompressed/raw block looks like a Buck `chrdata.sav` record: the right size, a sane
 * name-length byte, and a name that reads as printable text with at least one letter — the same
 * rule `monster.ts`'s `sniffMonsterRecord` uses for the sibling Gen1 formats.
 */
export function sniffBuckSavedCharacter(raw: Uint8Array): boolean {
  if (raw.length !== BUCK_SAVED_CHARACTER_SIZE) return false;
  if (!(raw[0] >= 1 && raw[0] <= NAME_MAX)) return false;
  let letters = 0;
  for (let i = 0; i < raw[0]; i++) {
    const c = raw[NAME_OFFSET + i];
    if (c === 0) break;
    if (c < 0x20 || c > 0x7e) return false;
    if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) letters++;
  }
  return letters > 0;
}
