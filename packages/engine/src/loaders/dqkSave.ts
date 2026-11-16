/**
 * DQK saved-game (`SAVGAMA.QSV`) global-state decoder — E6.2a.
 *
 * The DQK release ships a real saved game at `The Dark Queen of Krynn/SAVGAMA.QSV` (and a copy under
 * `SAVE/`, plus the character `VAULTA.DAT`). This reads the **global game-state header** — the per-party
 * flags + position + time that prefix the file, documented for the classic Gold Box engine in
 * `hackdocs_extracted/SAVGAM.TXT` (by David Knott). We re-verify the relevant offsets against the **real
 * 7965-byte shipped DQK save** rather than trusting the CoK/DoK-era doc blindly:
 *
 *   - **`partySize` @31 = 6** on the shipped save — DQK's six pre-generated heroes. This is the field that
 *     gates "Begin Adventuring": the front menu enables it only when the roster is non-empty
 *     (`allow_begin` ↔ `SelectedPlayer != null`; see docs/engine/research/dqk-newgame-entry.md §1). A save
 *     with `partySize > 0` therefore makes the button selectable.
 *   - **`speed` @17 = 4** matches.
 *   - **`currentModule` @18 and `eclMemberId` @21 both read 0** on the shipped save. Earlier notes used
 *     the CoK-era "initiated" label for @21, but DQK runtime traces prove it is copied to current-record
 *     `+0x16`, then `[ae63]`, and passed to the `ECL1` member loader.
 *
 * Why this matters for the rebuild (E6.2): dropping a `partySize > 0` save into a ported CoK build is the
 * deterministic way to make "Begin Adventuring" selectable under DOSBox WITHOUT mouse-driving character
 * creation — the enabler for the in-game map capture (E6.2b). This decoder lets the build tooling read /
 * sanity-check such a save. It does NOT yet decode the per-character roster records inside the file (the
 * `.CCH`-family layout `savedCharacter.ts` handles for CoK CHRDATA) — that is the next sub-slice.
 *
 * See `docs/engine/research/dqk-save-format.md`.
 */
import { decodeNpcRecord } from './moncha.js';
import type { MonsterRecord } from './monster.js';

/** Party-time clock (each field one byte; rolls over per SAVGAM.TXT). */
export interface DqkSaveTime {
  rounds: number;
  turns: number;
  hours: number;
  days: number;
  months: number;
  years: number;
}

/** The decoded DQK saved-game global header (the fields verified against the real shipped save). */
export interface DqkSaveHeader {
  /** Total file length (the real shipped DQK save is 7965 bytes). */
  byteLength: number;
  /** "No Magic" flag @1. */
  noMagic: number;
  /** Game clock @5..10. */
  time: DqkSaveTime;
  /** Facing direction @16 (0=N,1=NE,…,7=NW). */
  facing: number;
  /** Game speed @17 (4 on the shipped save). */
  speed: number;
  /**
   * Current module @18 (1–4 = overland, 5+ = dungeons per SAVGAM.TXT). NOTE: reads 0 on the shipped DQK
   * save — recorded as-is; see the module note.
   */
  currentModule: number;
  /** Loaded-save ECL member selector id @21 (runtime current-record +0x16 -> [ae63] -> ECL1 loader). */
  eclMemberId: number;
  /** @deprecated Use `eclMemberId`; @21 is not an initiated flag in the DQK loaded-save route. */
  initiated: number;
  /** Overland flag @25. */
  overland: number;
  /** "Party Never Dies" flag @28. */
  partyNeverDies: number;
  /** "No Treasure" flag @29. */
  noTreasure: number;
  /** "No XP For Combat" flag @30. */
  noXpForCombat: number;
  /** Party size @31 — the count of characters in the roster (6 on the shipped DQK save). */
  partySize: number;
  /** Dungeon flag @33. */
  dungeon: number;
  /** Overland party column @36 / row @37. */
  overlandPos: { col: number; row: number };
}

/** Offsets that are read directly (kept named so the doc + tests line up with the code). */
const OFF = {
  noMagic: 1,
  rounds: 5,
  turns: 6,
  hours: 7,
  days: 8,
  months: 9,
  years: 10,
  facing: 16,
  speed: 17,
  currentModule: 18,
  eclMemberId: 21,
  overland: 25,
  partyNeverDies: 28,
  noTreasure: 29,
  noXpForCombat: 30,
  partySize: 31,
  dungeon: 33,
  overlandCol: 36,
  overlandRow: 37,
} as const;

/** The smallest file we will treat as a DQK save header (must reach the read offsets). */
export const DQK_SAVE_MIN_BYTES = OFF.overlandRow + 1;

/**
 * Decode the DQK `SAVGAMA.QSV` global-state header. Reads only the documented + real-verified single-byte
 * fields; the per-character roster (later in the file) is not decoded here. Throws if the buffer is too
 * short to hold the header.
 */
export function decodeDqkSaveHeader(bytes: Uint8Array): DqkSaveHeader {
  if (bytes.byteLength < DQK_SAVE_MIN_BYTES) {
    throw new Error(`DQK save: ${bytes.byteLength} bytes; need ≥ ${DQK_SAVE_MIN_BYTES} for the header`);
  }
  const b = (o: number) => bytes[o];
  return {
    byteLength: bytes.byteLength,
    noMagic: b(OFF.noMagic),
    time: {
      rounds: b(OFF.rounds),
      turns: b(OFF.turns),
      hours: b(OFF.hours),
      days: b(OFF.days),
      months: b(OFF.months),
      years: b(OFF.years),
    },
    facing: b(OFF.facing),
    speed: b(OFF.speed),
    currentModule: b(OFF.currentModule),
    eclMemberId: b(OFF.eclMemberId),
    initiated: b(OFF.eclMemberId),
    overland: b(OFF.overland),
    partyNeverDies: b(OFF.partyNeverDies),
    noTreasure: b(OFF.noTreasure),
    noXpForCombat: b(OFF.noXpForCombat),
    partySize: b(OFF.partySize),
    dungeon: b(OFF.dungeon),
    overlandPos: { col: b(OFF.overlandCol), row: b(OFF.overlandRow) },
  };
}

/**
 * True when this save would make "Begin Adventuring" selectable on the DQK front menu — i.e. the roster is
 * non-empty (the `allow_begin` gate, E6.1). Dropping such a save into a ported build is the E6.2 enabler.
 */
export function saveEnablesBeginAdventuring(header: DqkSaveHeader): boolean {
  return header.partySize > 0;
}

/**
 * The fields that mark a save as "resume into area/member N" (E6.2b-2). The shipped DQK
 * `SAVGAMA.QSV` is "party assembled but NOT initiated" — `CurrentModule @18 = 0` and the DQK resume
 * block is absent — so on load the engine takes the `LastEclBlockId == 0` fresh-start branch (hard-codes
 * `EclBlockId = 1`). Writing these fields takes the **resume** branch instead, pairing the saved
 * area/context byte at `@18` with the ECL member selector id at `@21`. Offsets + values are from
 * `hackdocs SAVGAM.TXT` plus the DQK runtime correction in `docs/engine/research/dqk-save-resume.md`.
 *
 * NOTE: the *engine load path* uses `@18` (resume area) + the roster (CCH records @1039) directly; the
 * DQK's observed second-block values differ from the older Gen1 convention: real loaded DQK saves use
 * `@1031=2`, `@1033=4`, and zero at `@1034..1036`. This removes the proven mismatch associated with
 * the retail post-journal `DISK READ ERROR` seen under the old Gen1 `F0 FE F0 FE` pattern; a complete
 * visual resume confirmation remains a separate trace requirement.
 *
 * ## The second block is four 16-bit words, and the `F0 FE F0 FE` recipe is not in any retail save
 *
 * `docs/engine/research/dqk-ca03-runtime-probe.md` §"@1024 reads" traced what `DQK.EXE` actually
 * does with these offsets on load: it reads **2 bytes** into `DS:ae67` (`@1029..@1030`), 2 into
 * `DS:ae57` (`@1031..@1032`), 2 into `DS:ca03` (`@1033..@1034`) and 2 into `DS:ca05`
 * (`@1035..@1036`). They are four little-endian **words**, not six independent flag bytes, and the
 * hackdoc's "240 / 254 / 240 / 254" is really the single word `0xFEF0` written twice. The same
 * trace observed retail `ae67=0x0004` and `ae57=0x0002`.
 *
 * Census over every `SAVGAM*` save this project holds — the repo, the ten GOG Galaxy DOS installs
 * and the loose DOS Buck Rogers — **excluding `build/`**, deduplicated by content: 50 distinct
 * saves, 13 of which carry a nonzero second block, covering DQK areas 4/58/66 and FRUA areas
 * 5/14.
 *
 * | offset | retail values seen                       | the withdrawn recipe |
 * |--------|------------------------------------------|----------------------|
 * | `@1029`| **4 in 13 of 13** — never 3, never else   | `3` when overland    |
 * | `@1031`| 2 (initiated) or 0                       | `2` — agrees         |
 * | `@1033`| 1, 4 or 5 (area-dependent) or 0          | `240`                |
 * | `@1034`| 0 in every DQK save                      | `254`                |
 * | `@1035`| 0 in every DQK save                      | `240`                |
 * | `@1036`| 0 in every DQK save                      | `254`                |
 *
 * `240` at `@1033` and `254` at `@1034` each occur **0 times** in those 50 saves, and the byte
 * sequence `F0 FE F0 FE` occurs **0 times anywhere in any of them**. It is not that the corpus is
 * silent: scanning the same offsets *including* `build/` turns up 40 saves that do hold it and 14
 * that hold `@1029=3` — every one of them written by this repo's own `patchDqkSaveResumeArea`. An
 * unscoped scan "confirms" the recipe on our own output.
 *
 * Consequences for this file, both applied:
 *   - `@1029` is **not** an overland/dungeon discriminator. Five distinct resume areas across two
 *     games all store 4, so the byte does not vary with the thing it was named after. The
 *     `overland` option is kept as an explicit probe escape hatch but no longer defaults on for
 *     `areaId <= 4`; the default now writes the retail 4 for every area.
 *   - `@1033` is **SOLVED (2026-08-22)**: it is the second operand of ECL opcode `0x21`
 *     (`LOAD_FILES`). `DQK.EXE`'s handler at file offset `0x0420ac` fetches two operands and
 *     writes operand 2 straight into `DS:ca03` (skipping the write on the `0xFF` sentinel or an
 *     unchanged value). Each area's entry-point script opens with a *self-referential*
 *     `LOAD_FILES #<own area>, #n`, and that `n` is what the save stores: area 4 → 4, area 58 → 1,
 *     area 66 → 5. Verified across every retail DQK save we hold — **18 hits, 0 misses** over 30
 *     saves once the 12 degenerate `area=0, ca03=0` ones are excluded.
 *
 *     The null matters, because `1` is the modal value. Across the 18 areas that carry a
 *     self-referential `LOAD_FILES`, operand 2 is 1 in 9 of them, 4 in 3, and 5 in exactly one —
 *     area 66's. So the area-66 match is the discriminating one (1 in 18), and the three
 *     observed pairs together land at roughly 0.005 by chance, on top of the static proof that
 *     operand 2 *is literally the byte written*, not a correlate.
 *
 *     Previously ruled out and still ruled out: the resume area's own Gen2 GEO header set-id
 *     sextet — area 58's is `06 05 0b 01 02 09` and does not lead with its saved 1, and area
 *     66's `03 0a 06 0f 01 09` contains no 5 at all.
 *
 *     The writer still emits the constant 4 by default. That is now a *choice* rather than a
 *     guess: {@link resumeCa03ForArea} derives the right value for a known area. Harmless
 *     either way for the area-load path, which `cok-m4-fidelity-plan.md` §8.1 run 5 isolated
 *     to the GEO header instead.
 */

/**
 * `DS:ca03` (save `@1033`) per resume area, read out of DQK's own `DISK3/ECL.GLB`: the second
 * operand of each area's self-referential entry-point `LOAD_FILES #<area>, #n`. See the
 * {@link RESUME} header note for the mechanism and the corpus result (18 hits / 0 misses).
 *
 * Only 17 of DQK's 47 areas open with such a call, and two of those are deliberately absent
 * here rather than guessed at:
 *   - area 14 issues TWO self-referential calls with DIFFERENT operands (1 and 3), so which
 *     one is live on entry is a control-flow question this table cannot answer;
 *   - area 26 passes `255`, the handler's documented "leave `ca03` alone" sentinel, so it
 *     states no value at all.
 * Area 2's `191` is unusual but is a real write, so it is kept.
 *
 * Areas absent from this table return `null` — callers should fall back to the retail-modal 4
 * rather than inventing one.
 */
const RESUME_CA03_BY_AREA: ReadonlyMap<number, number> = new Map([
  [2, 191], [4, 4], [10, 2], [18, 1], [22, 1], [30, 1], [34, 1], [38, 1],
  [42, 1], [46, 1], [50, 4], [54, 4], [58, 1], [62, 6], [66, 5],
]);

/**
 * The `DS:ca03` word DQK itself would hold after entering `areaId`, or `null` when the area's
 * script does not state one. See {@link RESUME_CA03_BY_AREA}.
 */
export function resumeCa03ForArea(areaId: number): number | null {
  return RESUME_CA03_BY_AREA.get(areaId) ?? null;
}

/**
 * Offset of the FIRST inline character record in a standard 7965-byte DOS DQK `.QSV`.
 *
 * A DQK save carries its party inline, not in `VAULTA.DAT` (which is the vault, not a character
 * store). Record 0 begins here, and the record uses the SAME layout as a decompressed
 * `MONCHA.GLB` member — same engine, same character structure — for at least its whole fixed
 * header: the 16-byte NUL-padded name sits at `record + 0x68`, `isMonster` at `+0x66`, `race` at
 * `+0x58`, and the six ability-score pairs at `+0x78`.
 *
 * Measured over all 30 retail DQK saves we hold (repo + the GOG Galaxy install): a readable name
 * at `1039 + 0x68` = 1143 in **28 of the 28** standard-size files. The null is a byte-by-byte
 * offset scan across 0..300 — offsets 104..107 all score 28/28 (shifting 1..3 bytes into a name
 * still leaves ≥3 printable characters), then it falls off a cliff to 12/28 at 108 and 0/28 at
 * 103. That hard edge is what pins the field start at exactly 0x68, and it is the same 0x68
 * `moncha.ts` uses for `MONCHA.GLB`.
 *
 * The two non-standard files are the Amiga-native `SavGamA.qsv` (8188 bytes), whose record 0 sits
 * a constant 9 bytes earlier at 1030 with the identical `+0x68` name offset — the pre-roster
 * header length differs by platform, the in-record layout does not. FRUA's `.CSV` saves put
 * record 0 at 1031, again with names at `+0x68`.
 *
 * **The stride — SOLVED 2026-08-24, and the answer is that there is no stride.** A record ends
 * where a NULL-terminated linked list ends: `0x1A1` fixed bytes, then `17 * byte[0x08]` inventory
 * items, then 9-byte affect nodes until a 6-byte NULL terminator. {@link walkQsvRecords} parses it
 * forward with no scanning and reproduces every boundary the independent scan finds, 12/12 files,
 * 69 records; see that function for the perturbation nulls.
 *
 * **The old negative stands and is now explained, not overturned.** An exhaustive search for a
 * `MONCHA`-style length formula finds nothing. Single-field (`fixedLen + c·byte[a]`) over offsets
 * 0..507 × widths 1..64 — 32,512 combinations — gives **0** exact fits. Two-field
 * (`fixedLen + c₁·byte[a] + c₂·byte[b]`) over the 113 offsets whose values are even count-plausible
 * — 6,328 pairs, closed-form regression — gives **0**. Re-run allowing a residual of 0 or 1, so
 * that `MONCHA`'s `n + (n & 1)` even-padding could not be what hid the fit, it *still* gives 0.
 * The search is not underpowered: run against `MONCHA.GLB` the same method recovers that format's
 * real `(5, 17)` coefficients from 98 members. No formula exists because the node count is stored
 * nowhere — a byte-by-byte search for it over the 57 parseable records matches **no** offset, and
 * neither does any of the 56 rotated (wrong) assignments, so that negative has its own null.
 *
 * **One inference recorded here was wrong and is retracted.** Diffing the same character at two
 * lengths showed differences scattered from offset 4 onward, which was read as "something
 * variable-size sits *inside* the fixed part and shifts every later field." It does not: those
 * differences are the character's own stats changing between snapshots, and byte 0x08 changing
 * with the inventory. The fixed part really is fixed, and the variable part really is appended —
 * the model that was rejected was the right one, rejected on the wrong evidence.
 *
 * **The `[0xFF, 0|1, 0, 0, 0, 0]` sentinel lead was real** and is now identified: it is the list
 * terminator, two data bytes followed by a NULL far pointer. The seven-member family's
 * `[60, 0, 0, 0, 0, 0]` and `[26, 0, 0, 0, 0, 0]` endings fit the same shape — they differ only in
 * the two data bytes, which is why demanding `0xFF` there fit just 45 of 58 records.
 *
 * **Also found:** the two bytes at file offset `0x40D`, immediately before record 0, are a
 * little-endian party-size word duplicating byte {@link DQK_QSV_PARTY_SIZE_OFFSET} in all 13
 * corpus files. That is what rules out "the six bytes before a record belong to the previous one":
 * the pre-roster bytes are header.
 */
export const DQK_QSV_ROSTER_OFFSET = 1039;

/** As {@link DQK_QSV_ROSTER_OFFSET}, for the Amiga-native 8188-byte `.QSV` variant. */
export const DQK_QSV_ROSTER_OFFSET_AMIGA = 1030;

/**
 * The party-leader name from a DQK `.QSV`, read at {@link DQK_QSV_ROSTER_OFFSET} + `0x68`, or
 * `null` when the buffer is too short or the bytes are not a printable NUL-padded name.
 *
 * Reads ONE record by design — it is the cheap "does this save have a party" probe. To reach the
 * rest, use {@link walkQsvRecords} (exact) or {@link readQsvRoster} (independent scan).
 */
export function readQsvLeadCharacterName(
  bytes: Uint8Array,
  rosterOffset: number = DQK_QSV_ROSTER_OFFSET,
): string | null {
  const at = rosterOffset + 0x68;
  if (bytes.byteLength < at + 16) return null;
  let s = '';
  for (let i = 0; i < 16; i++) {
    const c = bytes[at + i]!;
    if (c === 0) break;
    if (c < 32 || c > 126) return null;
    s += String.fromCharCode(c);
  }
  return s.length >= 3 ? s : null;
}

/**
 * The smallest span a candidate record must have room for: MONCHA'''s fixed part (0x1A0). A record
 * is longer than this in practice — the scan only needs the three signal fields to be in bounds.
 */
const QSV_RECORD_MIN_SPAN = 0x1a0;

/**
 * Header byte holding the party size. Named here because {@link readQsvRoster} is checked against
 * it rather than against a hardcoded 6 — the corpus contains both 6- and 7-member parties.
 */
export const DQK_QSV_PARTY_SIZE_OFFSET = 31;

/**
 * The `.QSV` per-character record layout, solved 2026-08-24. A record is
 *
 * ```text
 *   0x000 .. 0x1A0   fixed part (MONCHA-shaped: flag @0x66, name @0x68, abilities @0x78)
 *   0x1A1 + 17*n     n inventory items, n = byte @0x08 (mirrored at @0xC9)
 *                    zero or more 9-byte affect nodes
 *                    a 6-byte terminator whose 4-byte pointer field is NULL
 * ```
 *
 * so the record has **no stored length** — it ends where a NULL-terminated list ends. That is why
 * the earlier exhaustive `fixedLen + c1*byte[a] + c2*byte[b]` search returned zero fits, and why
 * re-running it while allowing a 0/1 residual (to absorb `MONCHA`'s even-padding, the most likely
 * reason the first search missed) *still* returned zero: no arithmetic formula can exist.
 *
 * The affect nodes are a dumped heap linked list, `[u8][u8][u16 addr][u16 seg][u8][u8][u8]`. Within
 * one save `seg` is constant (0x5871 / 0x5858 / 0x5EF0 in the corpus), `addr` steps by exactly 9,
 * and it rises monotonically **across the whole party** rather than restarting per character — one
 * shared node pool, written out with its runtime pointers intact.
 */
const QSV = {
  /** Inventory-item count. Byte 0xC9 mirrors it in all 41 measurable records. */
  itemCount: 0x08,
  itemCountMirror: 0xc9,
  /** Fixed part + 1. The `+1` is real: base 416 or 418 drops the parse from 12/12 files to 1/12. */
  fixedSpan: 0x1a1,
  /** `DQK_ITEM_SIZE`, i.e. the same 17-byte inventory entry `monsterSideTables.ts` uses. */
  itemEntry: 17,
  /** Affect-node stride. NOT `MONCHA`'s 5-byte affect entry — `.QSV` dumps heap nodes instead. */
  affectNode: 9,
  /** Terminator: two data bytes then a NULL far pointer. */
  terminator: 6,
} as const;

/** Byte holding a record's inventory-item count — see the {@link walkQsvRecords} note. */
export const DQK_QSV_ITEM_COUNT_OFFSET = QSV.itemCount;

/** A record span recovered by {@link walkQsvRecords}. */
export interface QsvRecordSpan {
  /** Absolute byte offset of the record start. */
  offset: number;
  /** Record length in bytes. */
  length: number;
  /** Inventory-item count read from `offset + 0x08`. */
  itemCount: number;
  /** Number of 9-byte affect nodes before the terminator. */
  affectNodes: number;
}

/**
 * Walk a DQK `.QSV` roster EXACTLY, with no scanning: read the item count, skip the item array,
 * then follow the affect list to its NULL terminator. Returns `null` if the file does not fit the
 * model (the Amiga-native 8188-byte variant does not — see below).
 *
 * **Verification.** Over the retail corpus (13 distinct `.QSV` by SHA-1) this reproduces every
 * record boundary that {@link readQsvRoster}'s independent three-signal scan finds, in **12 of 12**
 * DOS saves — **69 records** — and the two methods share no predicate, so the agreement is a real
 * cross-check rather than a tautology. (The 61 quoted while this was in progress counted only
 * records whose length came from a pairwise delta, which cannot measure a file's last record.)
 *
 * **The nulls.** Perturbing any single ingredient collapses the agreement to 1/12 (the party-of-one
 * save, whose only record starts at a fixed offset and so passes regardless): `fixedSpan` 416 or
 * 418, `itemEntry` 16 or 18, `affectNode` 8 or 10, `terminator` 4 or 8, and reading the item count
 * from byte 0x07, 0x09 or 0x19F all fail. Moving the roster start to 0x40D or 0x410 gives 0/12.
 * The item-count identification has its own null: across the 41 records where the count is directly
 * measurable, bytes 0x08 and 0xC9 hold it exactly, and all 40 rotated (wrong) count assignments
 * match **no** offset at all.
 *
 * **Corroboration from the record's own pointers.** `+0x09..+0x0B` are zero in all 69 records,
 * which rules out the live alternative reading of `+0x08` — that it is merely the low byte of a far
 * pointer and the count match is coincidence. A segment cannot be zero. And the word at `+0x06` is
 * the segment of every affect node in the record (57 of the 58 that have nodes) and is the only
 * offset in the whole fixed part that does it: the record points into the heap block its own nodes
 * live in. The exception is the party-of-one save, whose `+0x00..+0x07` is zeroed and whose nodes
 * are `0xFF` filler — the same save that already disagrees with its own header byte.
 *
 * **The Amiga-native save is deliberately not handled.** `4fcdd3d9e5` (8188 bytes, roster at
 * {@link DQK_QSV_ROSTER_OFFSET_AMIGA}) has `byte[0x08] != byte[0xC9]`, so this refuses it rather
 * than reading a wrong count. Its node is 10 bytes with a 32-bit big-endian 68000 pointer at
 * node+4 (`00 27 CD ..`) stepping by 10 — the same shared pool, word-aligned for a 68000 — and
 * every record ends immediately after its last node, so `704 + 10 * nodes` reproduces all four
 * measurable lengths. But the split of that 704 into fixed part plus item array is
 * under-determined (`0x1A0 + 18*16` and `0x1B0 + 17*16` both fit; `byte[0xC9]` is 16 in every
 * record), and one file cannot separate them. See `docs/engine/research/dqk-save-format.md` §5.
 *
 * @param bytes the whole `.QSV` file
 * @param rosterOffset first record start; defaults to {@link DQK_QSV_ROSTER_OFFSET}
 * @param partySize record count; defaults to the header byte at {@link DQK_QSV_PARTY_SIZE_OFFSET}
 */
export function walkQsvRecords(
  bytes: Uint8Array,
  rosterOffset: number = DQK_QSV_ROSTER_OFFSET,
  partySize: number = bytes[DQK_QSV_PARTY_SIZE_OFFSET] ?? 0,
): QsvRecordSpan[] | null {
  if (partySize <= 0) return null;
  const out: QsvRecordSpan[] = [];
  let off = rosterOffset;
  for (let i = 0; i < partySize; i++) {
    if (off < 0 || off + QSV.itemCountMirror + 1 > bytes.byteLength) return null;
    const itemCount = bytes[off + QSV.itemCount]!;
    if (itemCount !== bytes[off + QSV.itemCountMirror]) return null;
    let pos = off + QSV.fixedSpan + QSV.itemEntry * itemCount;
    let affectNodes = 0;
    for (;;) {
      if (pos + QSV.terminator > bytes.byteLength) return null;
      if (bytes[pos + 2] === 0 && bytes[pos + 3] === 0 && bytes[pos + 4] === 0 && bytes[pos + 5] === 0) {
        pos += QSV.terminator;
        break;
      }
      pos += QSV.affectNode;
      affectNodes++;
    }
    out.push({ offset: off, length: pos - off, itemCount, affectNodes });
    off = pos;
  }
  return out;
}

/** One record recovered by {@link readQsvRoster}. */
export interface QsvRosterEntry {
  /** Absolute byte offset of the record start within the save. */
  offset: number;
  /** Name as stored, NUL-padded to 16 bytes at `offset + 0x68`. */
  name: string;
  /** `offset + 0x66` — MONCHA's is-monster flag; false for every party record seen so far. */
  isMonster: boolean;
  /** The six current/max ability pairs at `offset + 0x78`, in stored order. */
  abilities: number[];
  /**
   * Raw byte at `offset + 0x58` — MONCHA's `race` field (7 = plain monster, 6 = humanoid on the
   * bestiary side; the six shipped party records read 0/1/5/6). **Not yet mapped to a player-race
   * enum** — recorded as-stored so a caller can disclose it rather than guess (see
   * `docs/engine/research/dqk-save-format.md` §6).
   */
  race: number;
  /**
   * The combat stat block (THAC0, stored HP, level, AC, class code) at the SAME `+0x78` ability
   * offset MONCHA's character/NPC framing uses — decoded by reusing {@link decodeNpcRecord} rather
   * than re-deriving its deltas, per that function's own THAC0(+15)/HP(+17)/level(+25)/AC(+67)/
   * classCode(+71) layout. `null` when the record does not clear `decodeNpcRecord`'s own plausibility
   * gates (THAC0 0..30, HP 1..255, level 1..40) plus this file's own AC gate (`armorClass` -12..16,
   * a bound `decodeNpcRecord` does not itself apply because a few bestiary outliers legitimately sit
   * outside it — see moncha.ts's own gate note; every real party record in this corpus sits inside
   * it). This is the shifted-offset null {@link dqkSave.test.ts} exercises: shifting the record start
   * by ±1 byte before applying the same deltas fails these gates for every real record.
   */
  stats: MonsterRecord | null;
}

/**
 * 1e's legal armour-class range is roughly -12 (best magical plate) .. 16-ish (an unarmoured,
 * negative-Dex NPC); {@link decodeNpcRecord} itself does not bound AC (a handful of MONCHA bestiary
 * outliers sit outside this range — see that file's own gate note), so this file applies its own gate
 * when reading QSV party records, all of which sit inside it in the retail corpus.
 */
function qsvArmorClassPlausible(ac: number): boolean {
  return ac >= -12 && ac <= 16;
}

/**
 * Decode a QSV roster record's combat stats by reusing {@link decodeNpcRecord} at the record's own
 * `+0x78` ability offset — no new deltas, no new plausibility table, just moncha.ts's own NPC framing
 * applied to a `.QSV` record instead of a `MONCHA.GLB` member. Returns `null` on the combined gate
 * (`decodeNpcRecord`'s own range checks plus {@link qsvArmorClassPlausible}).
 */
function readQsvRosterStats(bytes: Uint8Array, offset: number, name: string): MonsterRecord | null {
  const rec = decodeNpcRecord(bytes.subarray(offset), offset, 0x78, name);
  if (!rec || !qsvArmorClassPlausible(rec.armorClass)) return null;
  return rec;
}

/**
 * Recover the party records in a DQK `.QSV` by SCANNING — kept as the INDEPENDENT ORACLE now that
 * {@link walkQsvRecords} parses the same records exactly.
 *
 * This shares no predicate with the walker: the walker is pure arithmetic over an item count and a
 * pointer chain, this is a content filter over three MONCHA-shaped fields. They agree on all 69
 * records in 12 of 12 DOS saves, which is the cross-check that makes either one believable. Keep
 * both. It also still handles the Amiga-native variant, which the walker deliberately refuses.
 *
 * It scans for three simultaneous signals, all at MONCHA's own fixed offsets:
 *
 *   - `+0x68`: 16 bytes, printable then NUL-padded to the end of the field;
 *   - `+0x66`: the is-monster flag, 0 or 1;
 *   - `+0x78..+0x83`: six current/max ability pairs, every byte in 1..25.
 *
 * **Measured over the whole retail corpus** (30 physical `.QSV` files across the repo copy and the
 * GOG install → 13 distinct by SHA-1; 12 of the standard 7965-byte size, 1 Amiga-native 8188-byte):
 * the scan returns exactly `partySize` records — the header byte at 31 — in **11 of 12**, with real
 * Dragonlance names (SIR DRYDEN, ALARIC THE BOLD, CAIN BLOODBANE, JHESILIA, GRUNSCHKA, RAISTLIN).
 *
 * The nulls, which are what make that number mean anything:
 *
 *   - the identical filter over the pre-roster header (bytes 0..1038) returns **0** hits in all 12;
 *   - shuffling the roster region returns **0.0** hits per trial over 40 trials;
 *   - and the conjunction is doing the work, not one lucky signal — on a representative save the
 *     three predicates alone match **78**, **4014** and **18** offsets, and together **6**.
 *
 * **The one disagreement is reported, not smoothed over.** A save whose header says `partySize = 1`
 * yields 2 hits, both named CALDOR. The likely reading is a stale record the engine never cleared,
 * but that is a guess, so this function returns what it finds and lets the caller compare against
 * byte 31 itself.
 *
 * **An unexplained observation, recorded rather than rationalised.** Some names come back with a
 * lowercase first character (`aRAMNOR`) and some entirely lowercase (`gorm`, `sunflower`,
 * `neacail`) — including characters that are uppercase in other saves of the same party. Bit 0x20
 * is doing something in this field. Whether it is a flag, a different field boundary, or an artefact
 * has NOT been established, so the bytes are returned as stored.
 */
export function readQsvRoster(
  bytes: Uint8Array,
  rosterOffset: number = DQK_QSV_ROSTER_OFFSET,
): QsvRosterEntry[] {
  const out: QsvRosterEntry[] = [];
  const end = bytes.byteLength - QSV_RECORD_MIN_SPAN;
  for (let off = Math.max(0, rosterOffset); off < end; off++) {
    const flag = bytes[off + 0x66]!;
    if (flag !== 0 && flag !== 1) continue;

    let abilitiesOk = true;
    for (let i = 0; i < 12; i++) {
      const v = bytes[off + 0x78 + i]!;
      if (v < 1 || v > 25) { abilitiesOk = false; break; }
    }
    if (!abilitiesOk) continue;

    const name = readPaddedName(bytes, off + 0x68);
    if (name === null) continue;

    out.push({
      offset: off,
      name,
      isMonster: flag === 1,
      abilities: Array.from(bytes.subarray(off + 0x78, off + 0x84)),
      race: bytes[off + 0x58]!,
      stats: readQsvRosterStats(bytes, off, name),
    });
  }
  return out;
}

/**
 * A 16-byte NUL-padded name field: printable characters, then NUL to the end of the field.
 *
 * The padding requirement is load-bearing, not decoration. Without it the predicate matches 78
 * offsets per save instead of contributing to a 6-hit conjunction, because any run of printable
 * bytes anywhere in the record qualifies.
 */
function readPaddedName(bytes: Uint8Array, at: number): string | null {
  if (bytes.byteLength < at + 16) return null;
  let s = '';
  let i = 0;
  for (; i < 16; i++) {
    const c = bytes[at + i]!;
    if (c === 0) break;
    if (c < 32 || c > 126) return null;
    s += String.fromCharCode(c);
  }
  if (s.length === 0) return null;
  for (let k = i; k < 16; k++) if (bytes[at + k] !== 0) return null;
  return s;
}

const RESUME = {
  /** `CurrentModule` — resume ECL area id (0 = uninitiated → fresh start at area 1). Same byte as OFF.currentModule. */
  module: 18,
  /** Loaded-save ECL member selector id — copied to current-record +0x16 and [ae63]. */
  eclMemberId: 21,
  /** Header/current-record coordinate mirror copied to current-record +0x25/+0x26. */
  headerX: 36,
  headerY: 37,
  /** Flat post-0x400 active-pose bytes copied into c9f0/c9f1/c9f2. */
  poseX: 1024,
  poseY: 1025,
  poseFacing: 1026,
  /** Low byte of the `DS:ae67` word. Retail holds 4 in every save that has one — see the header note. */
  overlandFlag: 1029,
  /** DQK second-block resume flags, recovered from authentic nonzero-area saves. */
  initFlags: [
    [1031, 2],
    [1033, 4],
    [1034, 0],
    [1035, 0],
    [1036, 0],
  ] as const,
} as const;

/** Smallest save we can read/write the resume block on (must reach the last init flag @1036). */
export const DQK_SAVE_RESUME_MIN_BYTES = 1037;

/** The resume-relevant state read back from a DQK save (E6.2b-2). */
export interface DqkResumeState {
  /** Resume ECL area id (`@18`). 0 = uninitiated → the engine fresh-starts at area 1. */
  resumeArea: number;
  /** Loaded-save ECL member selector id (`@21`). Usually the same id as `resumeArea`, not the HLIB index. */
  eclMemberId: number;
  /** Whether the Gen1-style second-block init flags are present. */
  initiated: boolean;
  /** Low byte of the `DS:ae67` word (`@1029`). 4 in all 13 retail saves that carry one; 3 is a probe value only. */
  overlandFlag: number;
}

/** Options for {@link patchDqkSaveResumeArea}. */
export interface DqkResumeAreaOptions {
  /**
   * Write `@1029 = 3` instead of the retail 4. Default `false` for every area: no retail save holds
   * 3, so this exists only to reproduce the older probe builds. See the header note.
   */
  overland?: boolean;
  /** Override the ECL member selector id written to `@21`. Default: `areaId`. */
  eclMemberId?: number;
  /**
   * Optional staged runtime pose. When present, writes both the header/current-record mirror
   * (`@36/@37`) and the flat active-pose mirror (`@1024/@1025`).
   */
  position?: { x: number; y: number };
  /** Optional raw DQK facing ordinal written to flat active-pose byte `@1026` (`0=N, 1=E, 2=S, 3=W`). */
  facing?: number;
}

/**
 * Read the resume-relevant state from a DQK save. Throws if the buffer is too short to reach the
 * initiation block (`@1036`).
 */
export function decodeDqkSaveResume(bytes: Uint8Array): DqkResumeState {
  if (bytes.byteLength < DQK_SAVE_RESUME_MIN_BYTES) {
    throw new Error(`DQK save: ${bytes.byteLength} bytes; need ≥ ${DQK_SAVE_RESUME_MIN_BYTES} for the resume block`);
  }
  return {
    resumeArea: bytes[RESUME.module],
    eclMemberId: bytes[RESUME.eclMemberId],
    initiated: RESUME.initFlags.every(([off, val]) => bytes[off] === val),
    overlandFlag: bytes[RESUME.overlandFlag],
  };
}

/**
 * Return a **copy** of a party-present DQK save patched to **resume directly into ECL area `areaId`** on
 * load, instead of the uninitiated "fresh-start at area 1" path (E6.2b-2 / E6.1 "Option B" — save-state
 * injection, no EXE patch and no area-1 stub needed). Writes `CurrentModule @18 = areaId`,
 * ECL member selector `@21 = areaId` by default, plus the second-block init values retail DQK saves
 * actually carry: `@1029=4`, `@1031=2`, `@1033=4`, `@1034..@1036=0`. (The Gen1 hackdoc recipe
 * `@1033=240, @1034=254, @1035=240, @1036=254` appears in **no** retail save of any Gold Box title
 * — see the header note; the code stopped writing it before this doc comment caught up.)
 * The roster (CCH records @1039) is left untouched. Throws on an out-of-range area, a too-short buffer, or
 * a roster-empty base save (the menu would stay disabled). Input buffer is not mutated.
 */
export function patchDqkSaveResumeArea(
  bytes: Uint8Array,
  areaId: number,
  opts: DqkResumeAreaOptions = {},
): Uint8Array {
  if (!Number.isInteger(areaId) || areaId < 1 || areaId > 0xff) {
    throw new Error(`patchDqkSaveResumeArea: area id ${areaId} out of the 1..255 immediate range`);
  }
  if (bytes.byteLength < DQK_SAVE_RESUME_MIN_BYTES) {
    throw new Error(`DQK save: ${bytes.byteLength} bytes; need ≥ ${DQK_SAVE_RESUME_MIN_BYTES} to write the resume block`);
  }
  if (!saveEnablesBeginAdventuring(decodeDqkSaveHeader(bytes))) {
    throw new Error(`patchDqkSaveResumeArea: base save has an empty roster (partySize 0) — patch a party-present save`);
  }
  const overland = opts.overland ?? false;
  const eclMemberId = opts.eclMemberId ?? areaId;
  if (!Number.isInteger(eclMemberId) || eclMemberId < 1 || eclMemberId > 0xff) {
    throw new Error(`patchDqkSaveResumeArea: ECL member id ${eclMemberId} out of the 1..255 immediate range`);
  }
  if (opts.position) {
    assertDqkByte(opts.position.x, 'position.x');
    assertDqkByte(opts.position.y, 'position.y');
  }
  if (opts.facing !== undefined) assertDqkByte(opts.facing, 'facing');
  const out = bytes.slice();
  out[RESUME.module] = areaId;
  out[RESUME.eclMemberId] = eclMemberId;
  if (opts.position) {
    out[RESUME.headerX] = opts.position.x;
    out[RESUME.headerY] = opts.position.y;
    out[RESUME.poseX] = opts.position.x;
    out[RESUME.poseY] = opts.position.y;
  }
  if (opts.facing !== undefined) out[RESUME.poseFacing] = opts.facing;
  out[RESUME.overlandFlag] = overland ? 3 : 4;
  for (const [off, val] of RESUME.initFlags) out[off] = val;
  return out;
}

function assertDqkByte(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`patchDqkSaveResumeArea: ${label} ${value} out of the 0..255 byte range`);
  }
}
