/**
 * CoK saved-character loader (B3 — the series "import a party from the previous game" feature).
 *
 * Champions of Krynn writes each party member to `SAVE/CHRDATA{n}.SAV` as a **409-byte record** — the
 * very same `.CCH`-family layout the monster loader decodes (monsters *are* characters in the Gold
 * Box engine). Decoding a real save confirms it: `CHRDATA1.SAV` reads name "SIR STRONGSWORD",
 * abilities at offset 16, HP at 98, AC/THAC0/saves at the monster offsets — the FRUA `.cch` offsets
 * (name@96, class@89, levels@150+) are all zero, so CoK uses the SSI layout, not the FRUA one.
 *
 * This decodes the **verified** fields that transfer a character into the next game:
 *   0..15    name (length byte + ASCII, ≤ 15)
 *   16..27   six ability scores, 2 bytes each (current, max): STR, INT, WIS, DEX, CON, CHA
 *   89       THAC0, inverted (to-hit-AC0 = 60 − byte)
 *   98       hit points
 *   208..212 five saving throws (paralyze/poison/death, petrify/polymorph, rod/staff/wand, breath, spell)
 *   90       **race** code — the 8-entry CoK race enum ({@link COK_RACE_NAMES})
 *   91       **class** code — the 17-entry CoK class enum ({@link COK_CLASS_NAMES}), NOT the
 *            COAB/FRUA `ClassId`
 *   275      armour class, inverted (AC = 60 − byte)
 *   304..305 experience-point total (u16 little-endian; often 0 in these mid-campaign saves)
 *
 * **CORRECTED 2026-09-07: offset 90 is the RACE, not the class; the class is offset 91.** Everything
 * this header used to say about "class code (offset 90)" — that 1 = Cleric, 2 = Magic-User, 5 = Thief,
 * 6 = Knight — was reversed from six records against a three-name guess, and is retracted. It is quoted
 * in {@link dragonlanceClassForCode} so the shape of the error stays visible. The reason it looked
 * validated is the reason to be careful with a six-record sample: **race and class are correlated in
 * this one party**, and 3 of the 6 old readings happened to land on a defensible answer anyway (see
 * the null below).
 *
 * **The enums are read off the game, not inferred.** `Champions of Krynn\START.EXE` carries both as
 * length-prefixed string tables. After `tools/exepack_unpack.py` decompresses the executable,
 * the class table has its length byte at 0xCBBA with stride 27 and runs `Cleric, Druid, Fighter,
 * Paladin, Ranger, Mage, Thief, Knight, Cleric/Fighter, Cleric/Fighter/Mage, Cleric/Ranger,
 * Cleric/Mage, Cleric/Thief, Fighter/Mage, Fighter/Thief, Fighter/Mage/Thief, Mage/Thief` (17 entries,
 * terminated by the unrelated string "OK buddy, who are you?"), and the race table has its length byte at 0xCDA0 with stride 16 and runs
 * `Silvanesti Elf, Qualinesti Elf, Half-elf, Mountain Dwarf, Hill Dwarf, Kender, Human, Monster`
 * (8 entries, followed by the alignment table starting "Lawful ..."). This is an oracle that owes
 * nothing to our decoder.
 *
 * **Three independent in-record signals agree with the swap, each with its null:**
 *  1. **Enum legality — the decisive one.** Under `90=race / 91=class` all 6 of 6 records carry a
 *     legal pair. Under the swap (`91` as race) the values 13, 14, 11 and 9 all exceed the 8-entry
 *     race enum, so **4 of 6 records would carry an out-of-range race**. The assignment is not
 *     symmetric; this alone decides it.
 *  2. **Cleric spell slots @79–81 are nonzero in exactly 2 of 6 records** (KAL, SIRRION) — and those
 *     are exactly the two whose byte 91 is a `Cleric/*` multiclass (11 = Cleric/Mage,
 *     9 = Cleric/Fighter/Mage). Thief skills @219 are nonzero in exactly 1 of 6 (MOLLY) — and hers is
 *     the one Thief-bearing code (14 = Fighter/Thief). Zero false positives and zero misses in both.
 *  3. **Stored saving throws @208–212 reproduce from the class code.** Scoring each record's five
 *     saves against this engine's own COAB-derived `addnd1e/combatTables.ts` `SAVES` table under the
 *     AD&D multiclass "best of each component" rule, with the level left free (1..9 per component, so
 *     the fit is generous to BOTH readings): byte 91 reproduces **24 of 25 save slots across the 5
 *     scoreable records** (Knight has no table row), versus **15 of 30 for byte 90 over all 6**. The
 *     single miss is MOLLY's paralyze/poison/death (stored 18, table 13); Kender fear immunity is the
 *     obvious suspect but no mechanism was verified, so it is recorded as an unexplained miss.
 *     GARIN (13 = Fighter/Mage), KAL and SIRRION (Cleric/Mage, Cleric/Fighter/Mage) and ISTAN
 *     (4 = Ranger) each reproduce 5 of 5 exactly.
 *
 * **The null, stated plainly, because it is what made the old reading look right.** The old
 * byte-90 map was not absurd: SIR STRONGSWORD's race byte is 6 (Human) and the old map read 6 as
 * `knight`, which is his real class; KAL's and SIRRION's race byte is 1 (Qualinesti Elf) and the old
 * map read 1 as `cleric`, which is a real component of both their multiclasses. **3 of 6 records
 * therefore produced a defensible class from the wrong byte.** Only ISTAN (race 2 = Half-elf read as
 * `magicUser`; he is a Ranger) and MOLLY (race 5 read as an unmapped code; she is a Fighter/Thief)
 * broke it, and the old code declined to map MOLLY's byte at all, hiding half of that. Note too that
 * signal 3's null is not a shutout — SIR STRONGSWORD's saves happen to fit a 9th-level Thief 5/5, so
 * the byte-90 reading scores a spurious perfect record; a per-record verdict would have been
 * ambiguous where the 24/25-vs-15/30 aggregate is not.
 *
 * **UNSEEN codes — nothing in this sample pins them.** The six records exercise class codes
 * 4, 7, 9, 11, 13, 14 and races 1, 2, 5, 6 only. Class codes **0, 1, 2, 3, 5, 6, 8, 10, 12, 15, 16**
 * and races **0, 3, 4, 7** are read off the retail menu enum in `START.EXE` and are *not* corroborated
 * by any record we hold. They are transcription of the game's own table, not measurement.
 *
 * **Still not mapped (documented gap):** the per-class *level* breakdown, alignment, gender. The
 * level is not pinned (offsets 206/214 hold small 1–3 enums, not a campaign level), so the import
 * still derives level from HP vs the class hit die — and because the class code names a *multiclass*
 * for 4 of the 6 real records, the importer assigns the same estimated level to each component (see
 * {@link dragonlanceClassesForCode}). Every combat-relevant number — abilities, HP, AC, THAC0,
 * saves — remains byte-faithful to the save.
 *
 * (Superseded: `docs/engine/research/cok-character-record-race.md` and the 2026-08-24 conclusion that
 * the race byte was "not findable from the corpus we hold" — that search filtered on ability-score
 * legality, which six overlapping-range records cannot decide, and never tried the class enum's own
 * cardinality as the discriminator.)
 *
 * **Export (2026-07-16, BUILD-QUEUE P2.4 "original save import/export" — CoK half).**
 * {@link exportSavedCharacter} is the sibling of {@link encodeSavedCharacter}: where that function
 * overlays edits onto an *already-loaded* record (preserving every unmodelled byte from `sc.raw`),
 * `exportSavedCharacter` SYNTHESIZES a full 409-byte record from scratch out of a Greybox in-session
 * character — no source `.SAV` file required. It writes exactly the fields this file has verified
 * (name, abilities, HP, AC, THAC0, saves, XP, class code, **race code**) against a zero-filled base,
 * plus the ability *max* byte (a freshly-synthesized character has taken no stat drain, so
 * current === max — a sane default for a field whose position and meaning are verified, not an
 * invented encoding). Every field this module has NOT reversed (sex, alignment, the per-class level
 * breakdown, the spell-slot bytes at 79–81, and the rest of the unmodelled record) is left zero,
 * exactly as honest as leaving it out — see {@link classCodeForDragonlanceClass} and
 * {@link raceCodeForDragonlanceRace} for the write-direction maps. **`race` left this "NOT reversed"
 * list on 2026-09-07**; note that unlike before there is no longer a spare "unknown" byte in either
 * field, since code 0 is a real Cleric and a real Silvanesti Elf.
 */
import type { SavingThrows } from '../ruleset/types.js';
import type { DragonlanceClassId } from '../ruleset/addnd1e-dragonlance/classes.js';
import type { DragonlanceRaceId } from '../ruleset/addnd1e-dragonlance/races.js';
import type { CokCharacterAppearanceRecord } from '../ruleset/addnd1e-dragonlance/character.js';

/** Size of a CoK saved-character record (same as the monster `.CCH` record). */
export const SAVED_CHARACTER_SIZE = 409;
const NAME_MAX = 15;
const ABILITY_OFFSET = 16;
const THAC0_OFFSET = 89;
const RACE_OFFSET = 90;
const CLASS_OFFSET = 91;
const HP_OFFSET = 98;
const SAVES_OFFSET = 208;
/**
 * The eight thief skills, byte-located 2026-08-26 from the retail pregenerated party. NOT the
 * hackdocs `CCHFORM.TXT` position — that is the FRUA `.CCH` layout, whose thief-skill block sits at
 * **139..146** (`hackdocs_extracted/CCHFORM.TXT` lists 139 Pick Pocket .. 146 Read Languages; the
 * neighbouring 137..138 are Current Level and Level in Former Class, which is what the earlier
 * "137..144" citation here had picked up by mistake).
 *
 * **CORRECTED 2026-09-07 — the reason given here was false and is retracted.** This comment used to
 * argue: *"bytes 99..205 of every CoK record we hold are entirely zero, so no FRUA-derived offset in
 * that window can be right."* That is not true. Measured over all six retail records, **27 of 642
 * (offset, record) cells in 99..205 are nonzero, spread across 13 distinct offsets** — 99, 101, 103,
 * 104, 109, 110, 113, 116, 119, 200, 202, 203, 204 — in 3 of the 6 records (KAL 12 cells, SIRRION 10,
 * GARIN 5; SIR STRONGSWORD, ISTAN and MOLLY are indeed all-zero across the window).
 *
 * **The conclusion survives on the narrow measurement the broad one should have been.** Bytes
 * **139..146 specifically are zero in 6 of 6 records, MOLLY included** — and MOLLY is the one record
 * that demonstrably HAS thief skills (nonzero at 219). A field cannot be at an offset that is zero in
 * the only record known to carry it, so the FRUA position is still excluded; only the argument
 * changed, from a sweeping claim about a 107-byte window to a claim about the 8 bytes actually at
 * issue.
 *
 * **The null, and why the false sentence looked safe.** Both nonzero clusters are caster data — the
 * three records with nonzero cells are exactly KAL, SIRRION and GARIN, the three with spell content —
 * so a party with no casters in it would have made the broad claim measure as true. A six-record
 * sample cannot support a universally-quantified statement about 107 offsets; it can support one
 * about 8.
 *
 * See {@link SavedCharacter.thiefSkills} for the field's own evidence and its null.
 */
const THIEF_SKILLS_OFFSET = 219;
const THIEF_SKILL_COUNT = 8;
const AC_OFFSET = 275;
const XP_OFFSET = 304;
const COK_HEAD_REQUEST_OFFSET = 0x135;
const COK_BODY_BLOCK_OFFSET = 0x136;
const COK_BODY_SLOT_OFFSET = 0x137;
const COK_SUFFIX_OFFSET = 0x138;
const COK_APPEARANCE_PALETTE_OFFSET = 0x139;
const TO_HIT_BASE = 60;

/**
 * The CoK class enum (offset 91), transcribed in order from the `START.EXE` unpacked string table at 0xCBBA —
 * the game's own MODIFY/CREATE CHARACTER menu list. Index = stored byte. See the file header for the
 * table's extent and for which codes are corroborated by a real record (only 4, 7, 9, 11, 13, 14 are).
 */
export const COK_CLASS_NAMES: readonly string[] = [
  'Cleric', 'Druid', 'Fighter', 'Paladin', 'Ranger', 'Mage', 'Thief', 'Knight',
  'Cleric/Fighter', 'Cleric/Fighter/Mage', 'Cleric/Ranger', 'Cleric/Mage', 'Cleric/Thief',
  'Fighter/Mage', 'Fighter/Thief', 'Fighter/Mage/Thief', 'Mage/Thief',
];

/**
 * The CoK race enum (offset 90), transcribed in order from the `START.EXE` unpacked string table at 0xCDA0.
 * Index = stored byte. Only races 1, 2, 5 and 6 occur in the six retail records; 0, 3, 4 and 7 are the
 * game's own table, unseen here.
 */
export const COK_RACE_NAMES: readonly string[] = [
  'Silvanesti Elf', 'Qualinesti Elf', 'Half-elf', 'Mountain Dwarf', 'Hill Dwarf', 'Kender',
  'Human', 'Monster',
];

/** The game's own label for a class code, or `CLASS <n>` for a byte outside the 17-entry enum. */
export function cokClassLabel(code: number): string {
  return COK_CLASS_NAMES[code] ?? `CLASS ${code}`;
}

/** The game's own label for a race code, or `RACE <n>` for a byte outside the 8-entry enum. */
export function cokRaceLabel(code: number): string {
  return COK_RACE_NAMES[code] ?? `RACE ${code}`;
}

/**
 * Each CoK class code → the engine's Dragonlance class ids it is composed of, in the order the game's
 * own label lists them. `null` marks a code the engine's `DragonlanceClassId` set genuinely cannot
 * express: **Druid (1) and Paladin (3)**. Both are real entries in CoK's menu table, but
 * `DragonlanceClassId` is `cleric | fighter | ranger | magicUser | thief | knight` — Krynn's Solamnic
 * Knight stands in for the paladin and there is no druid — so mapping them to a neighbour would be an
 * invention. Neither code occurs in any record we hold.
 */
const CLASS_CODE_COMPONENTS: readonly (readonly DragonlanceClassId[] | null)[] = [
  ['cleric'],                              //  0 Cleric
  null,                                    //  1 Druid — no DragonlanceClassId
  ['fighter'],                             //  2 Fighter
  null,                                    //  3 Paladin — no DragonlanceClassId (Krynn has Knights)
  ['ranger'],                              //  4 Ranger
  ['magicUser'],                           //  5 Mage
  ['thief'],                               //  6 Thief
  ['knight'],                              //  7 Knight
  ['cleric', 'fighter'],                   //  8 Cleric/Fighter
  ['cleric', 'fighter', 'magicUser'],      //  9 Cleric/Fighter/Mage
  ['cleric', 'ranger'],                    // 10 Cleric/Ranger
  ['cleric', 'magicUser'],                 // 11 Cleric/Mage
  ['cleric', 'thief'],                     // 12 Cleric/Thief
  ['fighter', 'magicUser'],                // 13 Fighter/Mage
  ['fighter', 'thief'],                    // 14 Fighter/Thief
  ['fighter', 'magicUser', 'thief'],       // 15 Fighter/Mage/Thief
  ['magicUser', 'thief'],                  // 16 Mage/Thief
];

/**
 * Every Dragonlance class a saved class code (offset 91) names, in the game's own label order — so
 * code 11 (`Cleric/Mage`) returns `['cleric', 'magicUser']`, not just one of them. Returns `null` for
 * a byte outside the 17-entry enum and for the two codes the engine's class set cannot express
 * (see {@link CLASS_CODE_COMPONENTS}).
 *
 * This is the primary read-direction map; {@link dragonlanceClassForCode} is the narrower
 * "primary class only" view of the same table.
 */
export function dragonlanceClassesForCode(code: number): DragonlanceClassId[] | null {
  const parts = CLASS_CODE_COMPONENTS[code];
  return parts ? parts.slice() : null;
}

/**
 * The PRIMARY (first-listed) Dragonlance class of a saved class code (offset 91), or null when the
 * code is outside the enum or is one the engine's class set cannot express. Callers that can render a
 * multiclass should prefer {@link dragonlanceClassesForCode}; this exists because the importer and the
 * editor each need one class id to key a single-class sheet or a one-line label.
 *
 * **The offset changed on 2026-09-07 and so did every code.** This function used to read offset 90 —
 * the RACE byte — through a hand-built three-entry map that the file header now retracts in full:
 * `1: 'cleric', 2: 'magicUser', 6: 'knight'`, with a comment claiming code 1 was "VALIDATED" by cleric
 * spell slots and code 2 by "textbook weak Magic-User saving throws". Those two arguments are worth
 * keeping visible because both were confirmations of a wrong hypothesis built from correlated
 * evidence: the spell slots really are there, but they belong to codes 11 and 9 at offset 91
 * (`Cleric/Mage` and `Cleric/Fighter/Mage`), and ISTAN's saves 14/15/16/17/17 are not a Magic-User row
 * at all — they are this engine's own `addnd1e` **fighter/ranger** row for levels 1–2, matching his
 * real class code 4 (Ranger) exactly.
 */
export function dragonlanceClassForCode(code: number): DragonlanceClassId | null {
  return CLASS_CODE_COMPONENTS[code]?.[0] ?? null;
}

/**
 * Each CoK race code → the engine's `DragonlanceRaceId`. Index = stored byte. Code 7 (`Monster`) is
 * `null`: it is a real entry in the game's table (the record layout is shared with monsters) but not a
 * playable Dragonlance race, so there is nothing honest to map it to.
 */
const RACE_CODE_TO_ID: readonly (DragonlanceRaceId | null)[] = [
  'silvanestiElf', // 0
  'qualinestiElf', // 1
  'halfElf',       // 2
  'mountainDwarf', // 3
  'hillDwarf',     // 4
  'kender',        // 5
  'human',         // 6
  null,            // 7 Monster — not a playable race
];

/**
 * Map a saved race code (offset 90) to a `DragonlanceRaceId`, or null for `Monster` and for a byte
 * outside the 8-entry enum. The six retail records decode to Human, Half-elf ×2, Kender and
 * Qualinesti Elf ×2 — and every one of those pairs legally with that record's class code (6 of 6),
 * which is the check that identified this byte in the first place (file header, signal 1).
 */
export function dragonlanceRaceForCode(code: number): DragonlanceRaceId | null {
  return RACE_CODE_TO_ID[code] ?? null;
}

/**
 * Map a Dragonlance class to a CoK save class code (offset 91) for EXPORT — the write-direction
 * counterpart of {@link dragonlanceClassForCode}. Every one of the engine's six Dragonlance classes
 * now has an exact single-class entry in the game's own 17-entry table, so all six round-trip and
 * nothing is invented:
 * `cleric`→0, `fighter`→2, `ranger`→4, `magicUser`→5, `thief`→6, `knight`→7.
 *
 * **This replaces a map whose codes were all wrong** (`cleric`→1, `magicUser`→2, `thief`→5,
 * `knight`→6, and `fighter`/`ranger`→0 as a deliberate "no class code observed" sentinel). Note the
 * sentinel is gone on purpose and cannot come back: **0 is `Cleric` in the real enum**, so writing 0
 * for an unknown class would now assert a specific class rather than decline to. There is no
 * "unknown" byte available in this field.
 *
 * The export side writes only single-class codes. A multiclass character cannot be synthesized here
 * because {@link ExportCharacterInput} carries one `classId`; a *decoded* multiclass survives a
 * round-trip through {@link encodeSavedCharacter} instead, which preserves the stored byte.
 */
export function classCodeForDragonlanceClass(cls: DragonlanceClassId): number {
  switch (cls) {
    case 'cleric':
      return 0;
    case 'fighter':
      return 2;
    case 'ranger':
      return 4;
    case 'magicUser':
      return 5;
    case 'thief':
      return 6;
    case 'knight':
      return 7;
    default:
      return 2; // exhaustive above; `fighter` is the neutral default for an unreachable branch
  }
}

/**
 * Map a `DragonlanceRaceId` to a CoK save race code (offset 90) for EXPORT — the write-direction
 * counterpart of {@link dragonlanceRaceForCode}. All seven playable races have an exact entry in the
 * game's own 8-entry table.
 */
export function raceCodeForDragonlanceRace(race: DragonlanceRaceId): number {
  const idx = RACE_CODE_TO_ID.indexOf(race);
  return idx >= 0 ? idx : 6; // 6 = Human, the engine's own default race elsewhere
}

/** Six ability scores in Gold Box order. */
export interface SavedAbilities {
  str: number;
  int: number;
  wis: number;
  dex: number;
  con: number;
  cha: number;
}

/** A character read out of a CoK `CHRDATA{n}.SAV` file — the fields that carry into the next game. */
export interface SavedCharacter {
  name: string;
  abilities: SavedAbilities;
  /** Hit points stored in the save (treated as both current and max for the import). */
  hitPoints: number;
  /** Armour class (recovered from the inverted store: 60 − byte[275]). */
  armorClass: number;
  /** THAC0 — to-hit armour-class-0 (recovered from 60 − byte[89]). */
  thac0: number;
  /**
   * Raw CoK class code, **offset 91** — an index into the game's own 17-entry {@link COK_CLASS_NAMES}
   * table, which includes multiclasses. See {@link dragonlanceClassesForCode} to resolve it to engine
   * class ids, {@link cokClassLabel} for the game's own label.
   *
   * **This field read offset 90 — the race byte — until 2026-09-07.** See {@link dragonlanceClassForCode}.
   */
  classCode: number;
  /**
   * Raw CoK race code, **offset 90** — an index into the game's own 8-entry {@link COK_RACE_NAMES}
   * table. See {@link dragonlanceRaceForCode} / {@link cokRaceLabel}.
   *
   * **New on 2026-09-07.** This file previously recorded race as "not findable from the corpus we
   * hold"; that conclusion was reached by filtering candidate offsets on ability-score legality, which
   * six records with overlapping ability ranges cannot decide. The class enum's cardinality decides it
   * instead — see the file header, signal 1.
   */
  raceCode: number;
  /** The five saving throws. */
  savingThrows: SavingThrows;
  /** Experience-point total (u16 @304; may be 0 in mid-campaign saves). */
  xp: number;
  /**
   * The eight thief skills as stored, in `.CCH` order (pick pocket, open locks, find/remove traps,
   * move silently, hide in shadows, hear noise, climb walls, read languages). All zero for a
   * non-thief.
   *
   * **Byte-located 2026-08-26 at offset 219, from the retail pregenerated party** — the field was an
   * open gap until then, and the FRUA offset does not apply (see {@link THIEF_SKILLS_OFFSET}). Of the
   * six shipped `CHRDATA{n}.SAV` records exactly one, MOLLY, is nonzero here: `52 61 47 40 34 22 98
   * 00`. MOLLY is also the only record whose class code is 5, the code this module already reads as
   * `thief`. Every other record is zero across the whole window, and so are all 88 of the 409-byte
   * character-shaped records in the Gen1 `MON*CHA.DAX` archives — a monster has no thief skills.
   *
   * The values are what `reclac_thief_skills` computes. `recalcThiefSkills(2, { raceRow: 6, dexRow:
   * 19 })` returns `45 54 40 33 27 15 91 0`; MOLLY is that plus a uniform 7 on the seven skills that
   * are not zeroed. **`dexRow` 19 is MOLLY's own Dexterity byte** — the search left the row free over
   * all 22 and it came back at exactly the raw score, which is the first confirmation of that reading
   * from retail data rather than from the decompiled routine.
   *
   * The uniform +7 is a *description*, not a mechanism: COAB's routine cannot produce it (see
   * `ruleset/addnd1e/thiefSkills.ts`). It is a single sample and is recorded as such.
   */
  thiefSkills: number[];
  /** Raw CHEAD/CBODY selection bytes, when the record carries a non-empty appearance tuple. */
  appearance?: CokCharacterAppearanceRecord;
  /** The full 409-byte record (verified fields parsed; the per-class level breakdown, alignment and
   * sex still await a reversing pass — class and race no longer do). */
  raw: Uint8Array;
}

/** Inclusive value bounds for the editable saved-character fields (drive the editor's clamping). */
export const SAVED_CHARACTER_BOUNDS = {
  name: { maxLen: NAME_MAX },
  ability: { min: 1, max: 25 },
  hitPoints: { min: 0, max: 255 },
  armorClass: { min: -10, max: 10 },
  thac0: { min: 0, max: 30 },
  save: { min: 0, max: 20 },
  xp: { min: 0, max: 0xffff },
} as const;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : Math.round(v));

/**
 * Apply a partial edit to a {@link SavedCharacter}, clamping each field to {@link SAVED_CHARACTER_BOUNDS}
 * and returning a NEW record (the original is untouched). Abilities are merged field-by-field. The raw
 * byte buffer is carried through unchanged so {@link encodeSavedCharacter} can preserve the unmodelled
 * bytes (the per-class level breakdown, alignment, spell slots) when it overlays the edited fields.
 */
export function editSavedCharacter(
  sc: SavedCharacter,
  patch: Partial<Omit<SavedCharacter, 'raw' | 'abilities' | 'savingThrows' | 'thiefSkills' | 'appearance'>> & {
    abilities?: Partial<SavedAbilities>;
    savingThrows?: Partial<SavingThrows>;
  },
): SavedCharacter {
  const B = SAVED_CHARACTER_BOUNDS;
  const ab = { ...sc.abilities, ...(patch.abilities ?? {}) };
  const sv = { ...sc.savingThrows, ...(patch.savingThrows ?? {}) };
  return {
    name: (patch.name ?? sc.name).slice(0, B.name.maxLen),
    abilities: {
      str: clamp(ab.str, B.ability.min, B.ability.max),
      int: clamp(ab.int, B.ability.min, B.ability.max),
      wis: clamp(ab.wis, B.ability.min, B.ability.max),
      dex: clamp(ab.dex, B.ability.min, B.ability.max),
      con: clamp(ab.con, B.ability.min, B.ability.max),
      cha: clamp(ab.cha, B.ability.min, B.ability.max),
    },
    hitPoints: clamp(patch.hitPoints ?? sc.hitPoints, B.hitPoints.min, B.hitPoints.max),
    armorClass: clamp(patch.armorClass ?? sc.armorClass, B.armorClass.min, B.armorClass.max),
    thac0: clamp(patch.thac0 ?? sc.thac0, B.thac0.min, B.thac0.max),
    classCode: (patch.classCode ?? sc.classCode) & 0xff,
    raceCode: (patch.raceCode ?? sc.raceCode) & 0xff,
    savingThrows: {
      paralyzePoisonDeath: clamp(sv.paralyzePoisonDeath, B.save.min, B.save.max),
      petrifyPolymorph: clamp(sv.petrifyPolymorph, B.save.min, B.save.max),
      rodStaffWand: clamp(sv.rodStaffWand, B.save.min, B.save.max),
      breath: clamp(sv.breath, B.save.min, B.save.max),
      spell: clamp(sv.spell, B.save.min, B.save.max),
    },
    xp: clamp(patch.xp ?? sc.xp, B.xp.min, B.xp.max),
    // Read-only: the editor exposes no thief-skill field, and `encodeSavedCharacter` leaves the
    // stored bytes untouched, so the decoded value carries through unchanged.
    thiefSkills: sc.thiefSkills.slice(),
    appearance: sc.appearance
      ? { ...sc.appearance, paletteBytes: [...sc.appearance.paletteBytes] }
      : undefined,
    raw: sc.raw,
  };
}

/**
 * Encode a {@link SavedCharacter} back into a 409-byte CoK `CHRDATA{n}.SAV` record — the round-trip
 * writer for the save editor (and a first concrete write of the SSI `.CCH` layout for the native-format
 * goal). It overlays ONLY the verified fields onto a base buffer (defaulting to `sc.raw`), so every
 * unmodelled byte — the per-class level breakdown, alignment and spell-slot data we can't yet decode —
 * is preserved exactly. Both the class byte (91) and the race byte (90) are written from the decoded
 * record, so a decoded multiclass survives a round-trip even though the export path can only
 * synthesize single-class codes. `decodeSavedCharacter(encodeSavedCharacter(sc))` reproduces `sc`'s decoded fields.
 *
 * Inverted stores match the decoder: `byte[89] = 60 − thac0`, `byte[275] = 60 − armorClass`. Each
 * ability's *current* byte is written (the decoded field); its *max* byte is left as the base's, so a
 * round-trip of a real record is byte-stable. Values are clamped to {@link SAVED_CHARACTER_BOUNDS}.
 */
export function encodeSavedCharacter(sc: SavedCharacter, base?: Uint8Array): Uint8Array {
  const src = base ?? sc.raw;
  const out = new Uint8Array(SAVED_CHARACTER_SIZE);
  if (src && src.length >= SAVED_CHARACTER_SIZE) out.set(src.subarray(0, SAVED_CHARACTER_SIZE));

  const B = SAVED_CHARACTER_BOUNDS;
  // Name: length byte + ASCII, zero-padded across the 15-byte field.
  const name = sc.name.slice(0, NAME_MAX);
  out[0] = name.length;
  for (let i = 0; i < NAME_MAX; i++) out[1 + i] = i < name.length ? name.charCodeAt(i) & 0x7f : 0;

  // Abilities: write the current byte of each (cur,max) pair; preserve the max byte from the base.
  const ab = [sc.abilities.str, sc.abilities.int, sc.abilities.wis, sc.abilities.dex, sc.abilities.con, sc.abilities.cha];
  ab.forEach((v, slot) => { out[ABILITY_OFFSET + slot * 2] = clamp(v, B.ability.min, B.ability.max); });

  out[THAC0_OFFSET] = clamp(TO_HIT_BASE - clamp(sc.thac0, B.thac0.min, B.thac0.max), 0, 255);
  out[CLASS_OFFSET] = sc.classCode & 0xff;
  out[RACE_OFFSET] = sc.raceCode & 0xff;
  out[HP_OFFSET] = clamp(sc.hitPoints, B.hitPoints.min, B.hitPoints.max);
  out[SAVES_OFFSET] = clamp(sc.savingThrows.paralyzePoisonDeath, B.save.min, B.save.max);
  out[SAVES_OFFSET + 1] = clamp(sc.savingThrows.petrifyPolymorph, B.save.min, B.save.max);
  out[SAVES_OFFSET + 2] = clamp(sc.savingThrows.rodStaffWand, B.save.min, B.save.max);
  out[SAVES_OFFSET + 3] = clamp(sc.savingThrows.breath, B.save.min, B.save.max);
  out[SAVES_OFFSET + 4] = clamp(sc.savingThrows.spell, B.save.min, B.save.max);
  out[AC_OFFSET] = clamp(TO_HIT_BASE - clamp(sc.armorClass, B.armorClass.min, B.armorClass.max), 0, 255);
  const xp = clamp(sc.xp, B.xp.min, B.xp.max);
  out[XP_OFFSET] = xp & 0xff;
  out[XP_OFFSET + 1] = (xp >> 8) & 0xff;
  return out;
}

/** A Greybox in-session character's fields this module can synthesize into a retail CoK record. Not a
 * `CharacterSheet` import to keep this loader UI/ruleset-shape-agnostic — callers (e.g. the character
 * creator or an editor screen) adapt their own sheet type into this shape. `xp` is separate because
 * `CharacterSheet` itself does not carry XP (the app tracks it in a parallel name-keyed store); it
 * defaults to 0, matching a freshly-created character and the `sc.xp === 0` case `importParty.ts`
 * already treats as "do not call setXp()". */
export interface ExportCharacterInput {
  name: string;
  abilities: SavedAbilities;
  hitPoints: number;
  armorClass: number;
  thac0: number;
  savingThrows: SavingThrows;
  /** The character's primary class, used only to pick the class code — see
   * {@link classCodeForDragonlanceClass}. All six Dragonlance classes have an exact code in the
   * game's own enum, so every one round-trips. */
  classId: DragonlanceClassId;
  /** The character's race, written to the race byte (offset 90) via {@link raceCodeForDragonlanceRace}.
   * Optional: omitted means `human`, the same default `blankCharacter()` and the importer already use —
   * and, unlike the old behaviour of leaving the byte 0, that default is stated rather than accidental
   * (0 is a real Silvanesti Elf, not an "unset" marker). */
  raceId?: DragonlanceRaceId;
  xp?: number;
}

/**
 * Synthesize a full 409-byte CoK `CHRDATA{n}.SAV` record from a Greybox in-session character — NOT an
 * edit of an existing save (that is {@link encodeSavedCharacter}'s job). Every field this module has
 * verified is written from `input`; every field it has not (sex, alignment, the per-class level
 * breakdown, the spell-slot bytes at 79–81, and the rest of the record) is left `0` on a fresh
 * zero-filled buffer — genuinely unknown, not invented. Ability bytes are written twice (current AND
 * max, both equal to `input.abilities.*`) since a freshly-synthesized character has no stat drain, so
 * current === max is the only defensible default for a byte position/meaning that IS verified.
 *
 * `decodeSavedCharacter(exportSavedCharacter(input))` reproduces every field `input` supplies, and
 * `dragonlanceClassForCode(...classCode)` / `dragonlanceRaceForCode(...raceCode)` recover
 * `input.classId` and `input.raceId` for **all six** Dragonlance classes and **all seven** playable
 * races — every one has an exact entry in the game's own enums, so nothing falls back any more.
 */
export function exportSavedCharacter(input: ExportCharacterInput): Uint8Array {
  const sc: SavedCharacter = {
    name: input.name,
    abilities: input.abilities,
    hitPoints: input.hitPoints,
    armorClass: input.armorClass,
    thac0: input.thac0,
    classCode: classCodeForDragonlanceClass(input.classId),
    raceCode: raceCodeForDragonlanceRace(input.raceId ?? 'human'),
    savingThrows: input.savingThrows,
    xp: input.xp ?? 0,
    // A synthesized character has no computed thief skills: the engine cannot derive them without a
    // Dragonlance race-modifier row (see `ruleset/addnd1e/thiefSkills.ts`), so all-zero is the honest
    // value, matching every non-thief record the game itself ships.
    thiefSkills: new Array(THIEF_SKILL_COUNT).fill(0),
    raw: new Uint8Array(SAVED_CHARACTER_SIZE), // no source record: synthesize on an all-zero base
  };
  const out = encodeSavedCharacter(sc);

  // Write the ability "max" byte too (encodeSavedCharacter only writes "current", preserving the base's
  // max byte — which is 0 here since there is no source record). current === max for a brand-new
  // character.
  const B = SAVED_CHARACTER_BOUNDS;
  const ab = [
    input.abilities.str,
    input.abilities.int,
    input.abilities.wis,
    input.abilities.dex,
    input.abilities.con,
    input.abilities.cha,
  ];
  ab.forEach((v, slot) => {
    out[ABILITY_OFFSET + slot * 2 + 1] = clamp(v, B.ability.min, B.ability.max);
  });

  return out;
}

function readName(raw: Uint8Array): string {
  const len = Math.min(raw[0] ?? 0, NAME_MAX);
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = raw[1 + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

function readAbilities(raw: Uint8Array): SavedAbilities {
  const a = (slot: number) => raw[ABILITY_OFFSET + slot * 2]; // current byte of each (cur,max) pair
  return { str: a(0), int: a(1), wis: a(2), dex: a(3), con: a(4), cha: a(5) };
}

function readAppearance(raw: Uint8Array): CokCharacterAppearanceRecord | undefined {
  const cHeadRequest = raw[COK_HEAD_REQUEST_OFFSET]!;
  const cBodyBlock = raw[COK_BODY_BLOCK_OFFSET]!;
  const cBodySlot = raw[COK_BODY_SLOT_OFFSET]!;
  const suffixCode = raw[COK_SUFFIX_OFFSET]!;
  const paletteBytes = Array.from(
    raw.subarray(COK_APPEARANCE_PALETTE_OFFSET, COK_APPEARANCE_PALETTE_OFFSET + 6),
  );
  const empty = cHeadRequest === 0 && cBodyBlock === 0 && cBodySlot === 0 && suffixCode === 0
    && paletteBytes.every((byte) => byte === 0);
  if (empty) {
    return undefined;
  }
  return { cHeadRequest, cBodyBlock, cBodySlot, suffixCode, paletteBytes };
}

/** True when a blob is the right size and carries a sane name-length byte for a saved character. */
export function sniffSavedCharacter(raw: Uint8Array): boolean {
  return raw.length === SAVED_CHARACTER_SIZE && raw[0] >= 1 && raw[0] <= NAME_MAX;
}

/** Decode one 409-byte CoK `CHRDATA{n}.SAV` record. Throws if it is not that size. */
export function decodeSavedCharacter(raw: Uint8Array): SavedCharacter {
  if (raw.length !== SAVED_CHARACTER_SIZE) {
    throw new Error(
      `savedCharacter: expected a ${SAVED_CHARACTER_SIZE}-byte record, got ${raw.length}`,
    );
  }
  return {
    name: readName(raw),
    abilities: readAbilities(raw),
    hitPoints: raw[HP_OFFSET],
    armorClass: TO_HIT_BASE - raw[AC_OFFSET],
    thac0: TO_HIT_BASE - raw[THAC0_OFFSET],
    classCode: raw[CLASS_OFFSET],
    raceCode: raw[RACE_OFFSET],
    savingThrows: {
      paralyzePoisonDeath: raw[SAVES_OFFSET],
      petrifyPolymorph: raw[SAVES_OFFSET + 1],
      rodStaffWand: raw[SAVES_OFFSET + 2],
      breath: raw[SAVES_OFFSET + 3],
      spell: raw[SAVES_OFFSET + 4],
    },
    xp: raw[XP_OFFSET] | (raw[XP_OFFSET + 1] << 8),
    thiefSkills: Array.from(raw.subarray(THIEF_SKILLS_OFFSET, THIEF_SKILLS_OFFSET + THIEF_SKILL_COUNT)),
    appearance: readAppearance(raw),
    raw,
  };
}
