/**
 * R3 — Pools of Darkness / Treasures of the Savage Frontier 510-byte pregen importer, built on the
 * SAME layout-parameterised decoder `secretSavedCharacter.ts` established for Secret of the Silver
 * Blades (`decodeGen1SavedCharacter` / `Gen1SavedCharacterLayout`). Round 30's
 * `docs/engine/research/pools-treasures-chrdata-layout.md` located the load-bearing pair — class
 * byte@0xae / `ClassLevel[8]`@0x151 — against the same `coabExpectedClassLevelSlots` oracle
 * `coabSavedCharacter.ts` and `secretSavedCharacter.ts` both rest on, and a dozen further "plausible,
 * unverified" fields. This file gives each of those twelve its own oracle, run over all 14 real
 * records (6 Pools + 8 Treasures — the layout is IDENTICAL for both titles, proven by decoding both
 * titles' real records through the ONE constant below, not two near-duplicate ones — see
 * `poolsTreasuresSavedCharacter.test.ts`), and ships the field decoded, bounded, or raw accordingly.
 * Full accept/reject tables and the two outliers' byte-level facts:
 * `docs/engine/research/pools-treasures-chrdata-fields.md`.
 *
 * Data (never vendored, read in place): the external, read-only GOG Galaxy installs' own
 * `SAVE\CHRDATA{n}.SAV` folders for each of the two titles (510 bytes each; unlike Secret's install,
 * both titles' saves DO live under `SAVE\`).
 *
 * **THE TWO OUTLIERS, SHOWN, NOT SMOOTHED.** Pools record index 4 (`ABAGAIL`, class byte 5 =
 * `magic_user`) and Treasures record index 6 (`OUGO`, class byte 2 = `fighter`) both FAIL the
 * class/`ClassLevel[8]` consistency oracle every other record in both parties passes — the two
 * bytes disagree, not just "don't happen to be interesting". This file does not pick a hypothesis
 * that makes either one fit (see `pools-treasures-chrdata-layout.md` §6 for why a single-example
 * predicate can't be checked against a null); `poolsTreasuresClassLevelAgrees` reports the
 * disagreement so a caller (the importer panel) can display it rather than translate it.
 *
 * **MEASURED (own oracle, reproduced against the retail bytes this round):**
 *  - `class`@0xae / `classLevel[8]`@0x151 — the SAME `coabExpectedClassLevelSlots` oracle, scored
 *    over each title's own real records: Pools **5/6** (miss: `ABAGAIL`, whose window sets BOTH the
 *    expected `magic_user` slot AND `monk` slot 7 — the only record with any nonzero byte at that
 *    window slot in all 14), Treasures **7/8** (miss: `OUGO`, whose window sets `cleric` slot 0
 *    instead of the expected `fighter` slot 2 — a full mismatch, not an extra bit — and is the only
 *    record with a nonzero byte at `0x15a`, two bytes past the window, value `8`, matching the
 *    misplaced level). Shifted-offset check (class byte moved one either side): Pools `0xad` → 1/6,
 *    `0xaf` → 1/6 (both partial coincidences, not full agreement); Treasures `0xad` → 3/8, `0xaf` →
 *    2/8 — every shift scores well below the real offset's 5/6 and 7/8.
 *  - `abilities`@0x10 — the SAME from-scratch uniqueness sweep `secretSavedCharacter.ts` ran for
 *    Secret, over all 14 Pools+Treasures records combined (search space `0..498`, a 510-byte
 *    record, 6 pairs = 12 bytes wide): exactly **one** offset satisfies "6 `(cur,full)` pairs per
 *    record, `cur==full`, values `3..18`, at least one pair party-varying" — `0x10`, the SAME base
 *    CoAB, Secret and this title all share.
 *  - `baseAc`@0x170 = `0x32` — constant on **14/14** records, matching CoAB's own `createPlayer`
 *    constant exactly (same convention-matched, not independently discriminated, confidence as
 *    Secret's own `baseAc`@0x129).
 *  - `partySlot`@0x19c — **exact**: Pools reads `0..5`, Treasures `0..7`, precisely each record's own
 *    file index (`CHRDATA{n}.SAV` → slot `n-1`).
 *
 * **PREDICTED / BOUNDED, shipped at reduced confidence (a real check ran, but it is not a
 * discriminating oracle):**
 *  - `thac0`@0xac — `0x3C - raw` compared against this engine's own `bestThac0()` for the record's
 *    OWN `classLevel` slots (using the ACTUAL nonzero slots, not the class byte's expectation, so
 *    `ABAGAIL`/`OUGO` are included): matches on only **4 of 12** oracle-accepted records (Treasures'
 *    low-level TRISTLE/MELLIA/CHERROD/SMOKE; every Pools record and 3 of 7 Treasures records
 *    mismatch, mostly by 1-5). Pools' 5 accepted records are ALL level ≥ 12 — past
 *    `combatTables.ts`'s own documented `MAX_COL = 12` clamp ("the engine caps here") — so the
 *    engine's own table cannot represent a level-13/14 character's TRUE 1e THAC0 (which keeps
 *    improving past level 12); Treasures' low-level records mostly match, consistent with this
 *    being the engine table's own ceiling, not necessarily the store's placement. Ships RAW with a
 *    "plausible, not independently verified" label — a materially WEAKER claim than Secret's clean
 *    6/6.
 *  - `exp`@0x172 (LE u32) — `xpForLevel(class, level) <= exp < xpForLevel(class, level+1)` for
 *    EVERY active class (same convention as Secret's multiclass check — every class's range must
 *    contain `exp`, not just one): **8 of 12** oracle-accepted records pass. Several records share
 *    an identical value (Pools: `1500001` on 3 of 6; Treasures: `22600` on 5 of 8) — consistent with
 *    a shared default/reset value on at least some records rather than individually-earned XP.
 *    Ships RAW with the same reduced-confidence label as `thac0`.
 *  - `hpMax`@0xb2 — the SAME weak bound as Secret (`level <= hp <= level * (best active-class hit
 *    die + CON hp bonus)`, using the record's OWN nonzero `classLevel` slots and CON score, not the
 *    class byte's expectation): **13 of 14** pass; the one miss is Treasures' `PAINE`-equivalent
 *    Pools record `PAINE` (magic-user 13, CON 16 → ceiling 78, stored 96). Labelled "bounded, not
 *    proven" wherever surfaced, same as Secret.
 *  - `savingThrows`@0x132 (5 bytes) — every byte on all 14 records falls inside `[5, 20]`, the GLOBAL
 *    min/max of this engine's own `combatTables.ts` `SAVES` table across every class and level (not
 *    an invented bound); only 10 of the 506 possible 5-byte-wide offsets in the record satisfy that
 *    same in-range-and-varying test, so this is a weak but non-trivial corroboration, not a proof of
 *    placement. Ships RAW ("in 1e range, not independently discriminated").
 *  - `age`@0xb0 (u16 LE) — range only, no independent table (same honest gap as Secret): all 14
 *    values sit in `25..46`. A cross-field correlation LIKE Secret's (the one record whose `race`
 *    byte differs from its party also has the largest age) holds for TREASURES (`CHERROD`, race 1,
 *    age 46 — the party maximum) but does **NOT** hold for POOLS (`BINKY`, race 1, age 34 — NOT the
 *    party's maximum; `Guy de Valois`, age 41, is, and shares the party's common race value). Both
 *    outcomes are reported — a correlation that holds in one title and not the other is not claimed
 *    as a rule. Ships RAW, "not verified".
 *
 * **NOT NAMED — carried raw via `extraByte`:** the byte at `class + 1` (`0xaf`; values `[0,1,0,0,0,0]`
 * Pools, `[1,0,0,0,0,0,0,0]` Treasures — the SAME "only one record nonzero" shape Secret's own
 * `class - 1` byte has). No hypothesis for it survived contact with either party. Exposed via the
 * new `Gen1SavedCharacterLayout.extraByte` optional field (`secretSavedCharacter.ts`), NOT folded
 * into `unverifiedOffsets` (Secret keeps using that mechanism for its own extra byte unchanged).
 *
 * **TRANSLATED (round 35 R4) — `race`@0xad, from each title's OWN `GAME.EXE`.** Round 31 shipped
 * this byte RAW (raw values: Pools `[1,5,5,5,5,5]`, Treasures `[5,5,5,1,5,5,5,5]`) precisely
 * because no enum had been sourced from these titles' own binaries, and the importer merely TRIED
 * CoAB's `Race` enum for disclosure. Both titles' unpacked `GAME.EXE` in fact carry a **7-entry,
 * 9-byte-stride** Pascal-`string[8]` race table — Pools at file offset **`0xAEAD`**, Treasures at
 * **`0xD454`** — each sitting immediately after that title's own 18-entry, 27-byte-stride class
 * table (`0xACC7` / `0xD26E`), whose content is byte-for-byte CoAB's `ClassId` enum order.
 * `tools/pools_treasures_race_table.py` re-derives both from the retail bytes;
 * `docs/engine/research/pools-treasures-race-table.md` carries the full evidence chain.
 *
 *  - **Fencepost null:** 7/7 plausible short PStrings at each real base, **0/7 at all 16** shifted
 *    offsets (-8..-1, +1..+8), for each title from its own image. The stride is 9, so a +-8 window
 *    cannot alias onto the table's own neighbouring entry — a caveat that is not free: two of
 *    Buck's four tables have stride 5 and 7 and the SAME null scores 6/7 and 2/2 there
 *    (`tools/buck_string_tables.py`). The boundary anchor (one stride before the base is not a
 *    plausible PString in either title) is what fixes the extent.
 *  - **THE ENUM IS NOT FAMILY-STABLE.** Secret of the Silver Blades' own table (round 34) has
 *    EIGHT entries with a leading `Tribble`; these two have SEVEN starting at `Elf`. Reusing
 *    Secret's numbering here would read byte 5 as `Halfling`. Four Gen1 titles, three numberings.
 *  - **Independent corroboration:** the 7 entries in this order ARE the FRUA `.CCH` race enum
 *    `hackdocs_extracted/CCHFORM.TXT` documents at record offset 88 (0=Elf … 6=Monster), and
 *    `LEVLIM.TXT` independently names "race 5 (Human)" in the same enum.
 *  - **0-based, argued by consequence — the indexing instruction was NOT located** (same honest
 *    gap `secretSavedCharacter.ts` records for Secret; the probe that was run and why it is
 *    non-discriminating are in the research doc). What carries the reading: (1) the CLASS byte
 *    @0xae indexes the immediately-preceding table in the SAME block and its 0-based read agrees
 *    with the record's own `classLevel[8]` window on **12 of 14** records against **0 of 14**
 *    1-based; (2) both class-byte-3 heroes (Guy de Valois, MAXWELL) are **Paladins**, and a 1e
 *    paladin is human-only — byte 5 reads `Human` under 0-based, `Halfling` under 1-based;
 *    (3) exactly the 2 records with a MULTI-class class byte (14, 15) carry race byte 1, and all
 *    12 single-class records carry race byte 5 = `Human`, the one entry in the table that 1e (and
 *    this engine's own `isMultiClassAllowed`) forbids from multi-classing — a 14/14 split.
 *  - **MEASURED NON-DISCRIMINATOR, reported not hidden:** this engine's own import outcome does
 *    NOT separate 0-based from 1-based. Under 1-based, byte 5 reads `Halfling`, which has no
 *    Dragonlance analog and falls back to `human` anyway, so both readings accept 14/14 records;
 *    only the CoAB enum is falsified by outcome (12/14, rejecting BINKY and CHERROD). The
 *    discriminator is the label the reading assigns, not the party it produces.
 */
import {
  decodeGen1SavedCharacter,
  sniffGen1SavedCharacter,
  coabExpectedClassLevelSlots,
  type Gen1SavedCharacter,
  type Gen1SavedCharacterLayout,
} from './secretSavedCharacter.js';

export { coabExpectedClassLevelSlots };

/** Size of a Pools of Darkness / Treasures of the Savage Frontier `CHRDATA{n}.SAV` record. */
export const POOLS_TREASURES_SAVED_CHARACTER_SIZE = 510;

/**
 * Both titles' OWN `GAME.EXE` race-name string table — Pools unpacked file offset `0xAEAD`,
 * Treasures `0xD454`, each a 9-byte Pascal-`string[8]` stride with **7** entries, 0-based (see the
 * file doc's "TRANSLATED" section for the evidence chain and its named gap: the table is proven
 * from bytes in both images independently, the machine instruction that indexes it is not).
 * `tools/pools_treasures_race_table.py` re-derives this from the retail bytes of BOTH titles;
 * `tools/test_pools_treasures_race_table.py` pins every number.
 *
 * Deliberately NOT `SECRET_RACE_LABEL`: Secret's own table has eight entries with `Tribble` at 0,
 * so its byte 5 is `Halfling` where these titles' byte 5 is `Human`. One constant per title-family
 * whose binary was actually read — never one shared enum.
 */
export const POOLS_TREASURES_RACE_LABEL: Readonly<Record<number, string>> = {
  0: 'Elf',
  1: 'Half-Elf',
  2: 'Dwarf',
  3: 'Gnome',
  4: 'Halfling',
  5: 'Human',
  6: 'Monster',
};

/**
 * ONE shared layout for both titles — see the file doc for why a single constant (not two
 * near-duplicate ones) is the claim: both titles' real records decode correctly through it
 * (`poolsTreasuresSavedCharacter.test.ts`'s golden test loops both titles' files through this same
 * object). Every offset's oracle (or lack of one) is cited in the file doc above;
 * `docs/engine/research/pools-treasures-chrdata-fields.md` has the full 14-record table.
 */
export const POOLS_TREASURES_SAVED_CHARACTER_LAYOUT: Gen1SavedCharacterLayout = {
  title: 'Pools of Darkness / Treasures of the Savage Frontier',
  size: POOLS_TREASURES_SAVED_CHARACTER_SIZE,
  name: 0x00,
  nameMaxLen: 15,
  abilities: 0x10,
  thac0: 0xac,
  race: 0xad,
  raceLabelTable: POOLS_TREASURES_RACE_LABEL,
  class: 0xae,
  age: 0xb0,
  hpMax: 0xb2,
  classLevel: 0x151,
  classLevelSlots: 8,
  baseAc: 0x170,
  exp: 0x172,
  savingThrows: 0x132,
  partySlot: 0x19c,
  extraByte: 0xaf,
};

/** Decode one 510-byte Pools of Darkness / Treasures of the Savage Frontier `CHRDATA{n}.SAV`
 * record. Throws if it is not that size. Both titles share the one layout above. */
export function decodePoolsTreasuresSavedCharacter(raw: Uint8Array): Gen1SavedCharacter {
  return decodeGen1SavedCharacter(raw, POOLS_TREASURES_SAVED_CHARACTER_LAYOUT);
}

/** `raw[0]` is the `PString` length prefix; a real record's name is 1..15 chars and the record is
 * exactly 510 bytes. */
export function sniffPoolsTreasuresSavedCharacter(raw: Uint8Array): boolean {
  return sniffGen1SavedCharacter(raw, POOLS_TREASURES_SAVED_CHARACTER_LAYOUT);
}

/**
 * Whether the record's `classCode`@0xae and its OWN `classLevel[8]`@0x151 window agree, via the
 * SAME `coabExpectedClassLevelSlots` oracle the layout's load-bearing pair rests on. `false` for
 * `ABAGAIL` (Pools) and `OUGO` (Treasures) — the two records this round explicitly does NOT
 * translate, only shows disagreeing (see the file doc and
 * `docs/engine/research/pools-treasures-chrdata-fields.md` §6-equivalent).
 */
export function poolsTreasuresClassLevelAgrees(sc: Pick<Gen1SavedCharacter, 'classCode' | 'classLevel'>): boolean {
  const expected = coabExpectedClassLevelSlots(sc.classCode);
  if (expected === null || expected.size === 0) return false;
  const actual = new Set(sc.classLevel.map((v, i) => (v !== 0 ? i : -1)).filter((i) => i >= 0));
  if (expected.size !== actual.size) return false;
  for (const slot of expected) if (!actual.has(slot)) return false;
  return true;
}
