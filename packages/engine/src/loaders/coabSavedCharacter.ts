/**
 * R2 — Curse of the Azure Bonds saved-character loader. Reads the GOG install's
 * `SAVE/CHRDATA{1..6}.SAV`, six real pregenerated heroes shipped with the game (MATHEW, MARK,
 * TRAVIS, LEDERA, SHARA, PHILIPPE). Unlike DoK's `.GAM` (a repurposed *monster* record, M13) or
 * DQK's `.QSV` roster (only 1 of 6 class codes lands in a known enum, `importDqkParty.ts`), CoAB's
 * `Player` struct is the project's own `coab_extracted/Classes/Player.cs` decompile output —
 * COAB's OWN Rosetta stone, not a guess ported over from a different Gold Box title. Every offset
 * below cites a `[DataOffset(...)]` attribute or a literal byte constant in that file.
 *
 * `Player.StructSize = 0x1A6` (422 decimal, `Player.cs:708`) matches the real file size exactly,
 * and two INDEPENDENT fields agree with each other on every sampled record: the single `_class`
 * byte@0x75 (`ClassId` enum, `Enums.cs:69-89`) and the `ClassLevel[8]` array@0x109..0x110 (one byte
 * per `SkillType` slot, `Enums.cs:57-67`) — a single-class code implies exactly one nonzero slot, a
 * multiclass `mc_X_Y` code implies exactly the two component slots, and this holds 6/6 in the real
 * saves ({@link coabExpectedClassLevelSlots}, exercised as the "consistency oracle" in
 * `coabSavedCharacter.test.ts`). That two-field agreement is the reason this loader can claim
 * **byte-faithful** class and level, not an inferred one.
 *
 * **Byte-faithful fields** (read straight from the save, no inference):
 *  - `name` (`PString`@0x00, `Player.cs:334-335`, max 15 chars — the field occupies 16 bytes,
 *    ending exactly at 0x10 where `stats2` begins);
 *  - the seven-value ability block @0x10 (`PlayerStats.Write`'s OWN field order, `Player.cs:107-116`:
 *    Str, Int, Wis, Dex, Con, Cha, Str00 — NOT alphabetical or the display order — each a
 *    `(cur, full)` byte pair, `StatValue.Write`, `Player.cs:77-81`). `str00` is the "exceptional
 *    strength" percentile (`AbilityScores.strPct`), only ever nonzero for an 18-STR fighter-type in
 *    the real saves (Player.cs's own doc note: "the (nn) percentile applies only to a fighter-type
 *    who rolls 18 STR"). **Deliberately does NOT replicate `StatValue.Read`'s clamp-to-25**
 *    (`Player.cs:83-88`), even though that clamp is the literal decompiled behaviour for every
 *    `PlayerStats` field including `Str00`: MATHEW's real record stores `str00 = 100` (18/00
 *    exceptional strength, the correct AD&D-1e notation for max STR), and clamping it to 25 would
 *    silently destroy a verified byte to match a generic reader that most likely was never meant to
 *    gate a 0-100 percentile the same way it gates a 3-25 ability score. Reported RAW for every
 *    field — a case where the decompile's own generic helper is the thing to doubt, not the
 *    measured byte (see the project's `goldbox-verify-gaps-against-binary` standard);
 *  - `thac0` (`SByte`@0x73, `Player.cs:347-348`) — carried RAW, not inverted. COAB's own display
 *    path (`engine/seg043.cs:133`, `0x3c - p.hitBonus`, with `hitBonus` copied from `thac0` at
 *    every touch point — `engine/ovr025.cs:18`/`427`) reduces to a fixed `0x3c - thac0`; exposed as
 *    {@link coabDisplayThac0} so a caller doesn't have to re-derive the constant, but the RAW byte
 *    is what `CoabSavedCharacter.thac0` holds;
 *  - `race` (`IByte`@0x74, `Race` enum, `Player.cs:350-351`/`Enums.cs:45-55`);
 *  - `classCode` (`IByte`@0x75, `ClassId` enum, `Player.cs:353-354`/`Enums.cs:69-89`);
 *  - `age` (`SWord`@0x76, `Player.cs:355-356`);
 *  - `hpMax` (`Byte`@0x78, `Player.cs:358-359`);
 *  - `classLevel` (`ByteArray[8]`@0x109, `Player.cs:403-404`, one byte per `SkillType` slot —
 *    cleric/druid/fighter/paladin/ranger/magic_user/thief/monk, `Enums.cs:57-67`);
 *  - `sex` (`Byte`@0x119, `Player.cs:497-498`) — `0 = male, 1 = female` per COAB's own display code
 *    (`engine/ovr006.cs:750`: `player.sex == 0 ? "his" : "her"`), NOT an assumption ported from
 *    another title;
 *  - `alignment` (`Byte`@0x11b, `Player.cs:501-502`) — carried RAW; no `Alignment` enum was found in
 *    `coab_extracted` (`ovr018.cs`'s `alignmentString`/`gbl.class_alignments` index into a STRING
 *    table by class, not a fixed numeric enum this loader can cite), so the byte is reported
 *    unlabelled rather than guessed;
 *  - `baseAc` (`Byte`@0x124, `Player.cs:522-523`) — RAW inverted-store byte. `engine/ovr018.cs:344`
 *    (`createPlayer`) sets this to a CONSTANT `50` for every new character regardless of class,
 *    and `engine/ovr025.cs:425` copies it straight into the live `ac` field before any Dexterity
 *    adjustment — so `0x3c - baseAc` is COAB's own unarmoured-human baseline (`50` → `10`, the same
 *    AD&D-1e convention `dokSavedCharacter.ts`'s `baseArmorClass` documents for a different game).
 *    {@link coabDisplayBaseAc} exposes the same `0x3c` inversion as {@link coabDisplayThac0};
 *  - `exp` (`Int`@0x127, `Player.cs:528-529`);
 *  - `hitPointRolled` (`Byte`@0x12c, `Player.cs:532-533`).
 *
 * **Explicitly NOT modelled this round** (left as untouched raw bytes, per the plan's "keep
 * unmodelled bytes untouched" scope): spellbook@0x79 (100 bytes), thief skills@0xea, saving
 * throws@0xdf, equipped items@0x14d (a pointer-shaped field in the C# model, not a fixed-size save
 * blob), and the live combat-state tail from 0x185 on. `raw` carries the full 422-byte record so a
 * future pass can extend this loader without a new file format investigation.
 */

/** Size of a CoAB `CHRDATA{n}.SAV` record — `Player.StructSize`, `Player.cs:708`. */
export const COAB_SAVED_CHARACTER_SIZE = 422;

const NAME_MAX = 15; // Player.cs:334, DataOffset(0x00, DataType.PString, 15)
const ABILITY_OFFSET = 0x10; // Player.cs:340
const THAC0_OFFSET = 0x73; // Player.cs:347-348
const RACE_OFFSET = 0x74; // Player.cs:350-351
const CLASS_OFFSET = 0x75; // Player.cs:353-354
const AGE_OFFSET = 0x76; // Player.cs:355-356
const HP_MAX_OFFSET = 0x78; // Player.cs:358-359
const CLASS_LEVEL_OFFSET = 0x109; // Player.cs:403-404
const CLASS_LEVEL_SLOTS = 8;
const SEX_OFFSET = 0x119; // Player.cs:497-498
const ALIGNMENT_OFFSET = 0x11b; // Player.cs:501-502
const BASE_AC_OFFSET = 0x124; // Player.cs:522-523
const EXP_OFFSET = 0x127; // Player.cs:528-529
const HIT_POINT_ROLLED_OFFSET = 0x12c; // Player.cs:532-533
/** COAB's own inverted-store constant (`0x3c`), shared by the THAC0 and base-AC display formulas —
 * see the file doc's citations. */
const INVERTED_STORE_BASE = 0x3c;

/** `Race` enum, `Enums.cs:45-55` — transcribed, not assumed. */
export const COAB_RACE_LABEL: Readonly<Record<number, string>> = {
  0: 'monster',
  1: 'dwarf',
  2: 'elf',
  3: 'gnome',
  4: 'half_elf',
  5: 'halfling',
  6: 'half_orc',
  7: 'human',
};

/** `ClassId` enum, `Enums.cs:69-89` — transcribed, not assumed. `mc_X_Y` codes are multiclass. */
export const COAB_CLASS_LABEL: Readonly<Record<number, string>> = {
  0: 'cleric',
  1: 'druid',
  2: 'fighter',
  3: 'paladin',
  4: 'ranger',
  5: 'magic_user',
  6: 'thief',
  7: 'monk',
  8: 'mc_c_f',
  9: 'mc_c_f_m',
  10: 'mc_c_r',
  11: 'mc_c_mu',
  12: 'mc_c_t',
  13: 'mc_f_mu',
  14: 'mc_f_t',
  15: 'mc_f_mu_t',
  16: 'mc_mu_t',
  17: 'unknown',
};

/** `SkillType` enum, `Enums.cs:57-67` — the `ClassLevel[8]` slot order, `Player.cs:403-445`
 * (`cleric_lvl`..`monk_lvl` accessors document the exact slot-to-name mapping). */
export const COAB_CLASS_LEVEL_SLOT_LABEL: readonly string[] = [
  'cleric',
  'druid',
  'fighter',
  'paladin',
  'ranger',
  'magic_user',
  'thief',
  'monk',
];

/**
 * The `ClassLevel[8]` slot indices a `_class` code (`ClassId`, `Enums.cs:69-89`) implies should be
 * nonzero — derived purely from the enum member's own name (`mc_c_f` = cleric+fighter, etc.), never
 * hard-coded per game sample. Returns `null` for `unknown` (17) or any code outside the enum, since
 * there is nothing to check against. This is the independent cross-check between `_class`@0x75 and
 * `ClassLevel`@0x109 the file doc's "consistency oracle" claim rests on.
 */
export function coabExpectedClassLevelSlots(classCode: number): Set<number> | null {
  const name = COAB_CLASS_LABEL[classCode];
  if (name === undefined || name === 'unknown') return null;
  if (!name.startsWith('mc_')) {
    return new Set([COAB_CLASS_LEVEL_SLOT_LABEL.indexOf(name)]);
  }
  const shortToSlotName: Readonly<Record<string, string>> = {
    c: 'cleric',
    f: 'fighter',
    r: 'ranger',
    mu: 'magic_user',
    t: 'thief',
    m: 'monk',
  };
  const parts = name.slice(3).split('_'); // 'mc_f_mu' -> ['f', 'mu']
  const slots = new Set<number>();
  for (const part of parts) {
    const slotName = shortToSlotName[part];
    if (slotName === undefined) return null; // an unrecognised short code -- don't fabricate a slot
    slots.add(COAB_CLASS_LEVEL_SLOT_LABEL.indexOf(slotName));
  }
  return slots;
}

/** `0x3c - thac0` — COAB's own displayed THAC0 (see file doc). */
export function coabDisplayThac0(thac0: number): number {
  return INVERTED_STORE_BASE - thac0;
}

/** `0x3c - baseAc` — COAB's own displayed (unarmoured-baseline) AC (see file doc). */
export function coabDisplayBaseAc(baseAc: number): number {
  return INVERTED_STORE_BASE - baseAc;
}

/** One ability's `(cur, full)` byte pair, `StatValue`, `Player.cs:20-23`. */
export interface CoabAbilityPair {
  cur: number;
  full: number;
}

/** The seven-value ability block, `PlayerStats.Write`'s OWN order (`Player.cs:107-116`) —
 * Str, Int, Wis, Dex, Con, Cha, Str00. `str00` is the exceptional-strength percentile. */
export interface CoabSavedAbilities {
  str: CoabAbilityPair;
  int: CoabAbilityPair;
  wis: CoabAbilityPair;
  dex: CoabAbilityPair;
  con: CoabAbilityPair;
  cha: CoabAbilityPair;
  str00: CoabAbilityPair;
}

/** One character read out of a CoAB `CHRDATA{n}.SAV` file — see the file-level doc for the
 * byte-faithful vs. explicitly-unmodelled split. */
export interface CoabSavedCharacter {
  name: string;
  abilities: CoabSavedAbilities;
  /** RAW `_class`@0x73... store; COAB's own displayed THAC0 is {@link coabDisplayThac0}(thac0). */
  thac0: number;
  /** Raw `Race` enum byte@0x74. */
  race: number;
  /** `Race` enum label, or `undefined` for a code outside `Enums.cs`'s 0..7 range. */
  raceLabel: string | undefined;
  /** Raw `ClassId` enum byte@0x75. */
  classCode: number;
  /** `ClassId` enum label, or `undefined` for a code outside `Enums.cs`'s 0..17 range. */
  classLabel: string | undefined;
  age: number;
  hpMax: number;
  /** `ClassLevel[8]`@0x109 — one byte per `SkillType` slot, see {@link COAB_CLASS_LEVEL_SLOT_LABEL}. */
  classLevel: number[];
  /** Raw byte@0x119; `0 = male, 1 = female` (`engine/ovr006.cs:750`). */
  sex: number;
  sexLabel: 'male' | 'female';
  /** Raw byte@0x11b — no enum found in `coab_extracted`; reported unlabelled (see file doc). */
  alignment: number;
  /** RAW inverted-store byte@0x124; COAB's own displayed baseline AC is {@link coabDisplayBaseAc}(baseAc). */
  baseAc: number;
  exp: number;
  hitPointRolled: number;
  /** The full 422-byte record. */
  raw: Uint8Array;
}

function readPString(raw: Uint8Array, offset: number, maxLen: number): string {
  const len = Math.min(raw[offset] ?? 0, maxLen);
  let s = '';
  for (let i = 0; i < len; i++) {
    const c = raw[offset + 1 + i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** Read one `(cur, full)` byte pair RAW — see the file doc's note on why this does NOT replicate
 * `StatValue.Read`'s clamp-to-25 (`Player.cs:83-88`). */
function readAbilityPair(raw: Uint8Array, offset: number): CoabAbilityPair {
  return {
    cur: raw[offset] ?? 0,
    full: raw[offset + 1] ?? 0,
  };
}

function readAbilities(raw: Uint8Array, base: number): CoabSavedAbilities {
  // PlayerStats.Write field order (Player.cs:107-116): Str, Int, Wis, Dex, Con, Cha, Str00 -- each
  // a 2-byte (cur, full) pair, so the stride below is +2 per field, in THIS order.
  return {
    str: readAbilityPair(raw, base + 0x00),
    int: readAbilityPair(raw, base + 0x02),
    wis: readAbilityPair(raw, base + 0x04),
    dex: readAbilityPair(raw, base + 0x06),
    con: readAbilityPair(raw, base + 0x08),
    cha: readAbilityPair(raw, base + 0x0a),
    str00: readAbilityPair(raw, base + 0x0c),
  };
}

/** `raw[0]` is the `PString` length prefix; a real record's name is 1..15 chars (`NAME_MAX`). */
export function sniffCoabSavedCharacter(raw: Uint8Array): boolean {
  return raw.length === COAB_SAVED_CHARACTER_SIZE && raw[0] >= 1 && raw[0] <= NAME_MAX;
}

/** Decode one 422-byte CoAB `CHRDATA{n}.SAV` record. Throws if it is not that size. */
export function decodeCoabSavedCharacter(raw: Uint8Array): CoabSavedCharacter {
  if (raw.length !== COAB_SAVED_CHARACTER_SIZE) {
    throw new Error(`coabSavedCharacter: expected a ${COAB_SAVED_CHARACTER_SIZE}-byte record, got ${raw.length}`);
  }
  const race = raw[RACE_OFFSET];
  const classCode = raw[CLASS_OFFSET];
  const sex = raw[SEX_OFFSET];
  return {
    name: readPString(raw, 0x00, NAME_MAX),
    abilities: readAbilities(raw, ABILITY_OFFSET),
    thac0: (raw[THAC0_OFFSET] << 24) >> 24, // SByte@0x73 (Player.cs:347-348)
    race,
    raceLabel: COAB_RACE_LABEL[race],
    classCode,
    classLabel: COAB_CLASS_LABEL[classCode],
    age: ((raw[AGE_OFFSET] | (raw[AGE_OFFSET + 1] << 8)) << 16) >> 16, // SWord, little-endian
    hpMax: raw[HP_MAX_OFFSET],
    classLevel: Array.from(raw.subarray(CLASS_LEVEL_OFFSET, CLASS_LEVEL_OFFSET + CLASS_LEVEL_SLOTS)),
    sex,
    sexLabel: sex === 0 ? 'male' : 'female',
    alignment: raw[ALIGNMENT_OFFSET],
    baseAc: raw[BASE_AC_OFFSET],
    exp:
      (raw[EXP_OFFSET] |
        (raw[EXP_OFFSET + 1] << 8) |
        (raw[EXP_OFFSET + 2] << 16) |
        (raw[EXP_OFFSET + 3] << 24)) >>>
      0,
    hitPointRolled: raw[HIT_POINT_ROLLED_OFFSET],
    raw,
  };
}
