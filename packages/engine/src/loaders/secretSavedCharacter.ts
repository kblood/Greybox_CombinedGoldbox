/**
 * R2 — Gen1-family (CoAB-lineage) saved-character loader, made LAYOUT-PARAMETERISED so Secret of
 * the Silver Blades' `CHRDATA{n}.SAV` (439 bytes) can share the same decode machinery
 * `coabSavedCharacter.ts` established for Curse of the Azure Bonds (422 bytes), instead of forking
 * a second ~300-line file for one offset table. `coabSavedCharacter.ts` itself is untouched this
 * round (out of scope, see the R2 brief's must-not-touch list) — this file imports its already-
 * transcribed `ClassId`/`SkillType` enums and its consistency oracle rather than re-deriving them.
 *
 * **THE EPISTEMIC SPLIT THIS FILE ENFORCES.** Every offset below was either MEASURED against an
 * independent oracle (a property of the real 6-record party that accepts the true offset and
 * rejects its neighbours) or is a PREDICTION carried at reduced confidence. Only the first group is
 * named with full confidence; the file doc says which is which. Full per-field oracle results,
 * accept/reject counts and the mutation test are in
 * `docs/engine/research/secret-chrdata-fields.md` and `secretSavedCharacter.test.ts` — this doc
 * gives the short version next to each offset.
 *
 * **MEASURED (own oracle, reproduced by this round — not merely inherited from R3):**
 *  - `class`@0x6c / `classLevel[8]`@0x111 — `docs/engine/research/secret-chrdata-layout.md`'s
 *    discriminating offset sweep (`tools/secret_chrdata_sweep.py`): the UNIQUE `(c, l)` pair in the
 *    whole 439-byte record where `coabExpectedClassLevelSlots(record[c])` agrees with the nonzero
 *    slots of `record[l..l+7]` on all 6 real records, with a party-varying class byte (not a
 *    degenerate all-cleric match) and a shuffled-byte null of 0/200. R2 reproduced this directly
 *    against the retail bytes (not re-cited from the doc): applying `class`@0x6c to all 6 CURSE
 *    records (a different title, 422-byte layout) accepts **0/6** — Secret's offsets are not simply
 *    coincidentally-valid everywhere (`secretSavedCharacter.test.ts`'s cross-title null).
 *  - `abilities`@0x10 — a from-scratch uniqueness sweep over every offset 0..(size-12): the base
 *    offset of 6 (cur, full) byte pairs, `cur == full`, values in 3..18, with at least one pair
 *    varying across the 6-record party. Exactly **one** offset in the whole record satisfies this:
 *    `0x10` — the SAME offset CoAB's own `ABILITY_OFFSET` uses, found independently, not assumed.
 *    A 7th pair at `+0xc` (`str00`, the exceptional-STR percentile) also reads `cur == full` on all
 *    6 records with plausible values (`100/51/50/5/0/0`, e.g. Guy de Valois' STR 18 pairs with a
 *    100 = "18/00" 1e notation) — outside the 3..18 filter that made the offset SEARCH unique, but
 *    corroborating that the whole 7-pair `PlayerStats`-shaped block carried over unchanged.
 *  - `thac0`@0x6a — `0x3C - raw` equals this engine's own `bestThac0` (best/lowest THAC0 across a
 *    character's active class slots, `ruleset/addnd1e/recalc.ts`, applied to the SAME `classLevel`
 *    array read from `classLevel`@0x111) for **6/6** real records, including the one multiclass
 *    record (MALACHITE, fighter 7 / thief 8: `min(thac0('fighter',7)=14, thac0('thief',8)=19) = 14`,
 *    and the raw byte inverts to exactly 14). See `secretSavedCharacter.test.ts`.
 *  - `exp`@0x12c (LE u32) — for every active class/level pair, `xpForLevel(class, level) <= exp <
 *    xpForLevel(class, level + 1)` (`ruleset/addnd1e/progression.ts`, the 1e PHB cumulative-XP
 *    tables) holds for **6/6** records (both classes' ranges for the one multiclass record).
 *
 * **PREDICTED, shipped at reduced confidence (a real check ran, but it is not a discriminating
 * oracle — see the file's field-level comments and the research doc for exactly why):**
 *  - `hpMax`@0x70 — only a WEAK bound holds (`level <= hp <= level * (best class hit die + CON hp
 *    bonus)`, `ruleset/addnd1e/abilities.ts`'s CON table): passes 6/6, but a wide range of byte
 *    values would also pass at this offset, so this is NOT proof the byte lives here, only that it
 *    is consistent with living here. Labelled "bounded, not proven" wherever it is surfaced.
 *  - `age`@0x6e (u16 LE) — no independent table exists to check against (no Secret race enum is
 *    established — see `race` below). The only corroboration is a cross-field correlation: the ONE
 *    record whose `race` byte differs from the other five (MALACHITE, `race = 3` vs `6`) also has
 *    by far the largest age (60 vs 17-27) — consistent with an elf/half-elf-type long lifespan, but
 *    this is a single data point, not a verified table.
 *  - `baseAc`@0x129 — reads the SAME constant `0x32` CoAB stores (at its own, different offset
 *    `0x124`) on **6/6** records. A constant-across-the-party byte cannot be discriminated by the
 *    uniqueness-sweep technique that found `abilities`/`class` (any offset that is ALSO constant at
 *    0x32 across all 6 records would tie it) — this is convention-matched, not independently located.
 *
 * **NOT NAMED — carried raw only, exposed via {@link Gen1SavedCharacter.unverified}:**
 *  - the byte at `class - 1` (`0x6d` for Secret; values `[1,0,0,0,0,0]` — only "Guy de Valois" is
 *    nonzero). No hypothesis for this byte survived contact with the party (it is not consistently
 *    linked to any other field); Pools of Darkness has the SAME single extra byte at its own
 *    `class - 1` offset with the same "only one record nonzero" shape, per the R3 sweep doc, so it
 *    is a structural inclusion in this title generation, not decoded here.
 *
 * **TRANSLATED (round 34 R3) — `race`@0x6b, from Secret's own `START.EXE` string table.**
 * Unpacked (`tools/exepack_unpack.py`) Secret `START.EXE` carries a contiguous run of fixed-stride
 * Pascal `string[N]` tables starting at file offset `0xE9AB` (`tools/secret_race_table.py`
 * reproduces every offset below from bytes, not from this comment):
 *
 *  - **class-descriptor table**, base `0xE9AB`, stride 27, 18 entries, 0-based:
 *    `Cleric, Druid, Fighter, Paladin, Ranger, Magic-User, Thief, Monk, Cleric/Fighter,
 *    Cleric/Fighter/Magic-User, Cleric/Ranger, Cleric/Magic-User, Cleric/Thief, Fighter/Magic-User,
 *    Fighter/Thief, Fighter/Magic-User/Thief, Magic-User/Thief, Illegal type`. This is
 *    **byte-for-byte CoAB's own `ClassId` enum order** (`coabSavedCharacter.ts`'s `COAB_CLASS_LABEL`
 *    `0..17`, transcribed from the CoAB decompile's `Enums.cs`, including CoAB's own slot-1
 *    `druid`). The FRUA hackdoc below documents this SAME slot 1 as "Knight (Not Used)" in FRUA's
 *    own release, i.e. this engine family has one per-title-varying slot at position 1; CoAB and
 *    Secret both happen to fill it with the real class `Druid`. This is independent, code-grounded
 *    confirmation that Secret's `classCode`@0x6c (already verified via `coabExpectedClassLevelSlots`
 *    in this file's `class` oracle above) is the SAME 0-based numbering CoAB compiles to, not
 *    merely a coincidentally-matching one.
 *  - **race table**, base `0xEB91` (`0xE9AB + 18*27`), stride 9, 8 entries, contiguous with the
 *    class table above and immediately followed by the alignment table (stride 17 — the SAME stride
 *    CoK's own alignment table uses, `docs/engine/research/cok-character-record-race.md`) then a
 *    sex table (`Male`/`Female`) and item-condition strings: `Tribble, Elf, Half-Elf, Dwarf, Gnome,
 *    Halfling, Human, Monster`.
 *
 * **What is proven vs argued, named explicitly (this is the epistemic gap round 33/34's own
 * discipline requires):**
 *  - PROVEN, from bytes: the table's existence, position, content and stride (`tools/
 *    secret_race_table.py`, re-checkable), and that it sits in the SAME contiguous "descriptor
 *    string" block as the class table above, which independently reproduces a KNOWN, verified
 *    enum (CoAB's `ClassId`) in the SAME order.
 *  - PROVEN, from a second source: `hackdocs_extracted/CCHFORM.TXT` (the FRUA/Unlimited Adventures
 *    community save-format doc — FRUA shares this engine's CHRDATA lineage) documents FRUA's OWN
 *    race byte as `0=Elf, 1=Half-Elf, 2=Dwarf, 3=Gnome, 4=Halfling, 5=Human, 6=Monster` — Secret's
 *    own 8-entry table is EXACTLY this 7-entry list, in the SAME order, with one new slot
 *    (`Tribble`) prepended. FRUA's own class enum in the same doc (`0=Cleric,1=Knight(Not Used),
 *    2=Fighter,3=Paladin,4=Ranger,5=Magic-User,6=Thief,7=Monk,8=C/F...`) also matches the class
 *    table above slot-for-slot (its own "Not Used" slot 1 is exactly where CoAB/Secret put `Druid`).
 *    Both FRUA's hackdoc and CoAB's decompile independently establish that THIS ENGINE FAMILY reads
 *    a title's race/class byte as a **plain 0-based index into that title's own compiled list, in
 *    that title's own order** — CoAB's list (`monster=0..human=7`) and FRUA's list (`elf=0..
 *    monster=6`) are NOT the same order as each other, so "0-based, title-local order" is the
 *    invariant, not any specific numbering — which is exactly what indexing Secret's OWN table
 *    0-based, `0=Tribble`, predicts.
 *  - ARGUED, not proven: no MACHINE INSTRUCTION that reads `raw[0x6b]`, multiplies by 9 and adds
 *    `0xEB91` was located. An extensive static search (documented in
 *    `docs/engine/research/secret-chrdata-fields.md`) for every 8086 codegen idiom this compiler
 *    could plausibly use (immediate-load-then-`MUL`/`IMUL` for every register, `SHL`-by-3-then-ADD
 *    for every register, a `LOOP`-style `ADD reg,9` walk, a `JMP`/`CALL` case-dispatch table, a
 *    per-entry hardcoded address for every one of the 26 class+race strings against every candidate
 *    `DS` segment) found **nothing above the chance rate** (measured: the best-scoring segment's
 *    match rate is statistically indistinguishable from 26 random 2-byte patterns against an 80KB
 *    file, ≈31.7 expected by chance vs ≈33.7 best-observed). This does not mean the multiply is
 *    absent — 8086 disassembly without a recursive-descent tool or a dynamic trace can miss code
 *    reached only through indirect control flow — it means this round's static search could not
 *    confirm it, and the two-alternative resolution above (Bar A) rests on the class-table/FRUA/CoAB
 *    precedent argument, not on a quoted instruction. The decisive experiment, same shape as
 *    `cok-character-record-race.md`'s own closing paragraph, is a dynamic trace or a retail
 *    character-sheet screen read — out of scope for this item (R6 is this round's sole DOSBox-X
 *    owner).
 *  - REJECTED, by code (not fit): CoAB's OWN `Race` enum (`COAB_RACE_LABEL`, this same file's
 *    import) gives `3 = gnome`, `6 = half_orc` — `importSecretParty.ts`'s predecessor already
 *    established (round 30) that neither has a Dragonlance analog, so trying CoAB's table on
 *    Secret's bytes was already a documented dead end BEFORE this round: it is a foreign title's
 *    enum, not evidence about Secret's. Rejected, not merely "also considered."
 *  - REJECTED, by consequence: the shared-numbering hypothesis (Secret's byte reuses FRUA's raw
 *    codes directly, ignoring Secret's own table's order) predicts `3 = Gnome`, `6 = Monster` —
 *    every one of the five `race=6` pregens would be an unplayable NPC race, which
 *    `SECRET_RACE_TO_DL` cannot resolve to any Dragonlance race (same "no analog" verdict
 *    `COAB_RACE_TO_DL` already gives `gnome`/`monster`), rejecting all five outright. Named as
 *    "FRUA's enum" in the round plan; the table above shows Secret's list already contains FRUA's
 *    entries as a subrange in FRUA's own order, so this alternative amounts to indexing Secret's
 *    table with the WRONG title's numbers, not a plausible alternative reading of Secret's own
 *    bytes.
 *  - NOT REJECTED, only argued against: a 1-based read (`race=1` -> table[0]) would give `3 =
 *    Half-Elf`, `6 = Halfling`. Pascal supports arbitrary array lower bounds (`array[1..8] of
 *    string[8]` compiles a `-1` into the SAME multiply site this round could not locate), so this
 *    cannot be excluded by the table's own storage layout alone. Argument against it, not proof:
 *    Halfling has no Dragonlance analog (same as Gnome), so a 1-based read would reject the SAME
 *    five `race=6` pregens the FRUA-numbering alternative does, for the same reason — every
 *    alternative to the 0-based reading rejects the majority of the party, and only the 0-based
 *    reading produces a fully legal 6/6 six-hero party (see `secretSavedCharacter.test.ts`'s Bar B
 *    check).
 *
 * `SECRET_RACE_LABEL` below is the transcribed table; `SECRET_SAVED_CHARACTER_LAYOUT.raceLabelTable`
 * wires it into `decodeGen1SavedCharacter`'s new (opt-in, additive) `raceLabel` field.
 * `poolsTreasuresSavedCharacter.ts`'s own layout does not set `raceLabelTable`, so its output is
 * completely unchanged by this addition — the shared `Gen1SavedCharacterLayout`/`Gen1SavedCharacter`
 * types keep every existing field and every existing function signature; `raceLabelTable`/
 * `raceLabel` are new, optional, and `undefined` wherever a layout does not opt in.
 */
import {
  COAB_CLASS_LABEL,
  COAB_CLASS_LEVEL_SLOT_LABEL,
  coabExpectedClassLevelSlots,
} from './coabSavedCharacter.js';

export { COAB_CLASS_LABEL, COAB_CLASS_LEVEL_SLOT_LABEL, coabExpectedClassLevelSlots };

/** One ability's `(cur, full)` byte pair — same shape as CoAB's `CoabAbilityPair`, not imported
 * (that type is private to `CoabSavedAbilities`'s own field order) so this loader stays fully
 * layout-independent. */
export interface Gen1AbilityPair {
  cur: number;
  full: number;
}

/** The seven-value ability block, in `PlayerStats.Write`'s field order (Str, Int, Wis, Dex, Con,
 * Cha, Str00) — see the file doc's `abilities` bullet for why this order (not the offset alone) is
 * corroborated for Secret too. */
export interface Gen1SavedAbilities {
  str: Gen1AbilityPair;
  int: Gen1AbilityPair;
  wis: Gen1AbilityPair;
  dex: Gen1AbilityPair;
  con: Gen1AbilityPair;
  cha: Gen1AbilityPair;
  str00: Gen1AbilityPair;
}

/**
 * The byte offsets one Gen1/CoAB-lineage `CHRDATA{n}.SAV` layout needs. A field is present here
 * only when this file's doc (or a future title's own research doc) states the oracle that admitted
 * it — `unverifiedOffsets` is the deliberate escape hatch for everything else, so a layout with a
 * gap does not have to invent a value.
 */
export interface Gen1SavedCharacterLayout {
  /** Human-readable title, used in error messages. */
  title: string;
  /** Exact record size in bytes; `decodeGen1SavedCharacter` throws if `raw.length` differs. */
  size: number;
  /** `PString` name field offset (0 in every known layout). */
  name: number;
  /** Max name length the `PString` length byte may claim (15 in every known layout). */
  nameMaxLen: number;
  /** Base offset of the 7 (cur, full) ability-score byte pairs. */
  abilities: number;
  /** Raw (not yet `0x3C`-inverted) THAC0 store byte. */
  thac0: number;
  /** Raw race byte offset — carried RAW by every consumer unless a title's own doc supplies an
   * enum (see this file's `race` section for why Secret's is not translated). */
  race: number;
  /** `ClassId`-enum class-code byte (the SAME enum `coabSavedCharacter.ts` transcribes). */
  class: number;
  /** `u16` little-endian age field offset. */
  age: number;
  /** Hit-point-maximum byte offset. */
  hpMax: number;
  /** Base offset of the `classLevelSlots`-byte `ClassLevel[]` array. */
  classLevel: number;
  /** Number of slots in the `ClassLevel[]` array (8 in every known layout). */
  classLevelSlots: number;
  /** Optional: raw inverted-store "base AC" byte, when a title's doc has located one. */
  baseAc?: number;
  /** Optional: `u32` little-endian experience-points offset, when a title's doc has located one. */
  exp?: number;
  /** Optional (R3): base offset of the 5-byte saving-throw array `[paralyzePoisonDeath,
   * petrifyPolymorph, rodStaffWand, breath, spell]` (the SAME field order
   * `ruleset/addnd1e/combatTables.ts`'s `savingThrows()` returns), when a title's doc has located
   * one. Added for Pools of Darkness / Treasures of the Savage Frontier
   * (`docs/engine/research/pools-treasures-chrdata-fields.md`); Secret's own layout does not set
   * this, so `decodeSecretSavedCharacter`'s output is unchanged. */
  savingThrows?: number;
  /** Optional (R3): raw party-slot / roster-index byte offset, when a title's doc has located one
   * (Pools/Treasures: confirmed to equal the record's own file index). Secret's own layout does not
   * set this. */
  partySlot?: number;
  /** Optional (R3): a SINGLE extra raw byte offset, carried under its own name (rather than folded
   * into `unverifiedOffsets`) when a title's doc identifies its structural position — immediately
   * after `class` — without resolving its semantics (Pools/Treasures share this shape with Secret's
   * own `class - 1` byte, see that field's doc). Secret's own layout keeps using
   * `unverifiedOffsets` for its `0x6d` byte and does not set this, so its output is unchanged. */
  extraByte?: number;
  /** Offsets with NO independent oracle for this title — decoded into `unverified` only, never
   * given a field name. */
  unverifiedOffsets?: readonly number[];
  /** Optional (round 34 R3): a title's own compiled race-name string table, keyed by the RAW
   * `race` byte value (0-based, matching this title's own compiled storage order — see this file's
   * doc for why that convention, not any other title's numbering, is what CoAB's decompile and
   * FRUA's hackdoc both independently establish). Present only when a title's own `START.EXE`/
   * `GAME.OVR` has been searched and the table located; `poolsTreasuresSavedCharacter.ts`'s layout
   * does NOT set this, so its own `race` byte stays exactly as raw/untranslated as before this
   * change. Additive and optional — no existing layout's behaviour changes by this field existing. */
  raceLabelTable?: Readonly<Record<number, string>>;
}

/** Secret's own `START.EXE` race-name string table — unpacked file offset `0xEB91`, 9-byte
 * Pascal-`string[8]` stride, 8 entries, 0-based (see the file doc's "TRANSLATED" section for the
 * full evidence chain: `tools/secret_race_table.py` re-derives this from bytes). */
export const SECRET_RACE_LABEL: Readonly<Record<number, string>> = {
  0: 'Tribble',
  1: 'Elf',
  2: 'Half-Elf',
  3: 'Dwarf',
  4: 'Gnome',
  5: 'Halfling',
  6: 'Human',
  7: 'Monster',
};

/** Secret of the Silver Blades' `CHRDATA{n}.SAV` layout — every offset's oracle is cited in this
 * file's doc comment; `docs/engine/research/secret-chrdata-fields.md` has the full accept/reject
 * table. */
export const SECRET_SAVED_CHARACTER_LAYOUT: Gen1SavedCharacterLayout = {
  title: 'Secret of the Silver Blades',
  size: 439,
  name: 0x00,
  nameMaxLen: 15,
  abilities: 0x10,
  thac0: 0x6a,
  race: 0x6b,
  class: 0x6c,
  age: 0x6e,
  hpMax: 0x70,
  classLevel: 0x111,
  classLevelSlots: 8,
  raceLabelTable: SECRET_RACE_LABEL,
  baseAc: 0x129,
  exp: 0x12c,
  unverifiedOffsets: [0x6d],
};

/** One character decoded out of a Gen1/CoAB-lineage `CHRDATA{n}.SAV` record, under some
 * {@link Gen1SavedCharacterLayout}. See the file doc for which fields are independently oracled vs
 * carried at reduced ("bounded, not proven" / convention-matched) confidence. */
export interface Gen1SavedCharacter {
  name: string;
  abilities: Gen1SavedAbilities;
  /** RAW store byte — see the file doc's `thac0` oracle. Not yet `0x3C`-inverted. */
  thac0: number;
  /** RAW byte at the layout's `race` offset. */
  race: number;
  /** `layout.raceLabelTable` lookup on `race` (round 34 R3) — see the file doc's "TRANSLATED"
   * section for the evidence chain and its explicitly-named gap (the table is proven from bytes and
   * cross-title precedent; the machine instruction that reads it was not located). `undefined` when
   * the layout sets no table (Pools/Treasures) or the byte is out of the table's range. */
  raceLabel: string | undefined;
  classCode: number;
  /** `COAB_CLASS_LABEL` lookup on `classCode` — the SAME `ClassId` enum, verified to still apply
   * (see the file doc's `class` oracle). `undefined` for a code outside that enum. */
  classLabel: string | undefined;
  /** Reduced confidence — see the file doc's `age` bullet (a single cross-field correlation, not a
   * verified table). */
  age: number;
  /** Reduced confidence — "bounded, not proven"; see the file doc's `hpMax` bullet. */
  hpMax: number;
  classLevel: number[];
  /** RAW inverted-store byte, present only when the layout measured a `baseAc` offset. Convention-
   * matched to CoAB's own baseAc byte (same `0x32` constant, different offset), not independently
   * discriminated — see the file doc. */
  baseAc?: number;
  /** RAW `u32` LE store, present only when the layout measured an `exp` offset. See the file doc's
   * `exp` oracle. */
  exp?: number;
  /** RAW 5-byte saving-throw array, present only when the layout set
   * {@link Gen1SavedCharacterLayout.savingThrows}. `undefined` for Secret (its layout does not set
   * that offset). */
  savingThrows?: { paralyzePoisonDeath: number; petrifyPolymorph: number; rodStaffWand: number; breath: number; spell: number };
  /** RAW party-slot / roster-index byte, present only when the layout set
   * {@link Gen1SavedCharacterLayout.partySlot}. `undefined` for Secret. */
  partySlot?: number;
  /** RAW single extra byte, present only when the layout set
   * {@link Gen1SavedCharacterLayout.extraByte}. `undefined` for Secret, which instead carries its
   * own extra byte via `unverified` (unchanged). */
  extraByte?: number;
  /** `{offset, byte}` for every {@link Gen1SavedCharacterLayout.unverifiedOffsets} entry — carried,
   * never named, never guessed at. */
  unverified: { offset: number; byte: number }[];
  /** The full raw record. */
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

function readAbilityPair(raw: Uint8Array, offset: number): Gen1AbilityPair {
  return {
    cur: raw[offset] ?? 0,
    full: raw[offset + 1] ?? 0,
  };
}

function readAbilities(raw: Uint8Array, base: number): Gen1SavedAbilities {
  // PlayerStats.Write field order (Player.cs:107-116, mirrored by coabSavedCharacter.ts): Str,
  // Int, Wis, Dex, Con, Cha, Str00 -- a 2-byte (cur, full) pair per field, so stride +2.
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

/** `raw[layout.name]` is the `PString` length prefix; a real record's name is `1..nameMaxLen`
 * chars, and the record must be exactly `layout.size` bytes. */
export function sniffGen1SavedCharacter(raw: Uint8Array, layout: Gen1SavedCharacterLayout): boolean {
  return raw.length === layout.size && raw[layout.name] >= 1 && raw[layout.name] <= layout.nameMaxLen;
}

/** Decode one Gen1/CoAB-lineage `CHRDATA{n}.SAV` record under the given layout. Throws if
 * `raw.length !== layout.size`. */
export function decodeGen1SavedCharacter(raw: Uint8Array, layout: Gen1SavedCharacterLayout): Gen1SavedCharacter {
  if (raw.length !== layout.size) {
    throw new Error(`${layout.title}: expected a ${layout.size}-byte record, got ${raw.length}`);
  }
  const classCode = raw[layout.class];
  const baseAc = layout.baseAc !== undefined ? raw[layout.baseAc] : undefined;
  const exp =
    layout.exp !== undefined
      ? (raw[layout.exp] |
          (raw[layout.exp + 1] << 8) |
          (raw[layout.exp + 2] << 16) |
          (raw[layout.exp + 3] << 24)) >>>
        0
      : undefined;
  const savingThrows =
    layout.savingThrows !== undefined
      ? {
          paralyzePoisonDeath: raw[layout.savingThrows],
          petrifyPolymorph: raw[layout.savingThrows + 1],
          rodStaffWand: raw[layout.savingThrows + 2],
          breath: raw[layout.savingThrows + 3],
          spell: raw[layout.savingThrows + 4],
        }
      : undefined;
  const partySlot = layout.partySlot !== undefined ? raw[layout.partySlot] : undefined;
  const extraByte = layout.extraByte !== undefined ? raw[layout.extraByte] : undefined;
  return {
    name: readPString(raw, layout.name, layout.nameMaxLen),
    abilities: readAbilities(raw, layout.abilities),
    thac0: (raw[layout.thac0] << 24) >> 24, // SByte, mirroring coabSavedCharacter.ts's THAC0_OFFSET read
    race: raw[layout.race],
    raceLabel: layout.raceLabelTable?.[raw[layout.race]],
    classCode,
    classLabel: COAB_CLASS_LABEL[classCode],
    age: ((raw[layout.age] | (raw[layout.age + 1] << 8)) << 16) >> 16, // SWord, little-endian
    hpMax: raw[layout.hpMax],
    classLevel: Array.from(raw.subarray(layout.classLevel, layout.classLevel + layout.classLevelSlots)),
    baseAc,
    exp,
    savingThrows,
    partySlot,
    extraByte,
    unverified: (layout.unverifiedOffsets ?? []).map((offset) => ({ offset, byte: raw[offset] })),
    raw,
  };
}

/** Secret of the Silver Blades' record size (439 bytes). */
export const SECRET_SAVED_CHARACTER_SIZE = SECRET_SAVED_CHARACTER_LAYOUT.size;

/** Decode one Secret of the Silver Blades `CHRDATA{n}.SAV` record. Throws if it is not 439 bytes. */
export function decodeSecretSavedCharacter(raw: Uint8Array): Gen1SavedCharacter {
  return decodeGen1SavedCharacter(raw, SECRET_SAVED_CHARACTER_LAYOUT);
}

/** `raw[0]` is the `PString` length prefix; a real Secret record's name is 1..15 chars and the
 * record is exactly 439 bytes. */
export function sniffSecretSavedCharacter(raw: Uint8Array): boolean {
  return sniffGen1SavedCharacter(raw, SECRET_SAVED_CHARACTER_LAYOUT);
}
