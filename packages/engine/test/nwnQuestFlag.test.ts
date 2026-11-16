/**
 * Golden: Neverwinter Nights (DOS/AOL)'s QUEST leg — the Kraken Society dock password
 * (`[0x32C8]` / `[0x32CA]`).
 *
 * WHAT THIS TEST ESTABLISHES
 *   1. `[0x32C8]` and `[0x32CA]` each have exactly ONE corpus-wide write site that stores a
 *      password value, and both are the same three instructions in `ECL5.DAX#51` — proven by a
 *      raw byte scan over all 33 blocks of all six ECL archives that needs no control-flow model.
 *   2. Running the REAL `EclVm` over the REAL retail block, that setter lands the player's typed
 *      index in both cells.
 *   3. Carrying that memory into `ECL1.DAX#14` — a DIFFERENT ARCHIVE — the descriptor-112
 *      corpse encounter prints the matching password word on its looted note. (cross-archive
 *      consumer, 25 `COMPARE [0x32ca]` reads, zero writers in that archive)
 *   4. Carrying it into `ECL5.DAX#51`'s descriptor-36 dock gate, the doorman ACCEPTS that same
 *      word (`FIND_ITEM #70`, `EXIT`) and REFUSES anything else (the "PURPLE SQUID" Kraken
 *      Society brush-off, `PROGRAM #5`, `NEWECL #1`). Both directions, for all 26 indices.
 *   5. The `[0x4BC9]` night gate: by day the same cell never reaches the password prompt.
 *
 * WHAT THIS TEST DOES **NOT** ESTABLISH
 *   a. That a player can reach the SETTER by walking. It provably cannot be walked to — the
 *      descriptor-37 console at `GEO0.DAX#1` (4,0) sits in a four-cell pocket no declared spawn
 *      can enter (asserted below as a negative result, not hidden). The wiring proven here is
 *      "the note always names exactly the word the doorman expects, for every index".
 *      **CORRECTED 2026-08-05.** This used to end "— which holds at the untouched default
 *      0 = FUTURE as well", stated flat. That holds only under the PER-AREA-BANK reading of the
 *      `PROGRAM #17` bracket, which the doc's §9.2 labels unproven. Under the alternative
 *      single-global-word reading (§9.3, live) NEITHER cell is untouched by the time the party
 *      reaches the dock: `[0x32C8]` is written by the day cache in 28 blocks — including
 *      `ECL1.DAX#14`, the note's OWN block, at 0x81F6 — plus the hour (`ECL1#16@0x8AF6`) and #1
 *      (`ECL2#26@0x8CD0`); `[0x32CA]` by `ECL1#17@0x8CAF/@0x8DAD/@0x9153` and
 *      `ECL2#27@0x9336/@0x933D`. Test K asserts the FUTURE/FUTURE default AND the fact that the
 *      note's own block clobbers `[0x32C8]` on entry, so the conditionality is measured, not prose.
 *      This leg does not discriminate between the two readings.
 *   b. That `[0x32C8]`/`[0x32CA]` are per-area banked by the `SAVE #n,[0x4bc5]; PROGRAM #17`
 *      bracket around the setter. That reading is an INFERENCE; NWN's own `PROGRAM` dispatch in
 *      `GAME.OVR` was not disassembled. The corpus also reuses `[0x32C8]` as a per-area
 *      "already visited this period" day cache at 28 other sites — asserted below as a
 *      disclosure, so nothing here silently depends on the banked reading.
 *   c. Anything about the retail host seeding these cells at new-game/load time (UNLOCATED).
 *   d. Anything dynamic: no DOSBox-X run was made. All reachability is static CFG + GEO graph.
 *
 * Full byte evidence, the census, the rejected candidates and every caveat live in
 * `docs/engine/research/nwn-quest-flag.md`.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dialogueForCell,
  primeSearchLocation,
  decodeGeoBlock,
  readDaxDataBlocks,
  parseEclHeader,
  ECL_GEN1,
  EclVm,
  type EclEffect,
} from '../src/index.js';

const nwnRoot = 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint';
const p = (name: string) => resolve(nwnRoot, name);
/** Every ECL archive this title ships — the census below is exhaustive over exactly these. */
const eclArchives = ['ECL0.DAX', 'ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX', 'ECL5.DAX', 'ECL7.DAX'] as const;
const haveRetail = [...eclArchives, 'GEO0.DAX', 'GEO1.DAX'].every((n) => existsSync(p(n)));

async function block(path: string, blockId: number): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(path)));
  return blocks.find((b) => b.blockId === blockId)!.raw;
}

/** file offset -> vaddr for Gen1 with address addend 0x8000 (vaddr = offset + 0x8000 - 2). */
const VADDR_ADDEND = 0x8000;
function at(raw: Uint8Array, vaddr: number, length: number): string {
  const offset = vaddr - VADDR_ADDEND + 2;
  return [...raw.slice(offset, offset + length)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

/** Count non-overlapping-start occurrences of a byte pattern in a buffer. */
function countPattern(raw: Uint8Array, pattern: number[]): number {
  let n = 0;
  outer: for (let i = 0; i + pattern.length <= raw.length; i++) {
    for (let j = 0; j < pattern.length; j++) if (raw[i + j] !== pattern[j]) continue outer;
    n++;
  }
  return n;
}

/** Pin the same decoded retail corpus for every pattern in this exhaustive census. */
let corpusBlocks: Promise<{ name: (typeof eclArchives)[number]; blocks: ReturnType<typeof readDaxDataBlocks> }[]> | undefined;
function loadCorpusBlocks() {
  return (corpusBlocks ??= Promise.all(eclArchives.map(async (name) => ({
    name,
    blocks: readDaxDataBlocks(new Uint8Array(await readFile(p(name)))),
  }))));
}

/** Every (archive, blockId, vaddr) where `pattern` occurs, across the whole ECL corpus. */
async function scanCorpus(pattern: number[]): Promise<string[]> {
  const hits: string[] = [];
  for (const { name, blocks } of await loadCorpusBlocks()) {
    for (const b of blocks) {
      outer: for (let i = 0; i + pattern.length <= b.raw.length; i++) {
        for (let j = 0; j < pattern.length; j++) if (b.raw[i + j] !== pattern[j]) continue outer;
        hits.push(`${name}#${b.blockId}@0x${(i + VADDR_ADDEND - 2).toString(16)}`);
      }
    }
  }
  return hits;
}

/**
 * The 26 password words, in table order, transcribed from the `SAVE "<word>", [str:0x7b1e]`
 * ladders. Index 0 is the unconditional default that a never-written cell resolves to.
 */
const PASSWORDS = [
  'FUTURE', 'TIME', 'FRONT', 'RIPE', 'STORM', 'JUNGLE', 'VISION', 'MATAGA', 'BORK', 'TWAIN',
  'MOUNTAIN', 'WOODS', 'PALADIN', 'BARDICHE', 'GNOME', 'STATUE', 'GODDESS', 'UNDOMIEL', 'TEMPLE',
  'RAPTURE', 'EMPIRE', 'VIOLIN', 'FIEND', 'PENDENT', 'OMINOUS', 'DUNGEON',
] as const;

/**
 * The looted note's password word, pulled out of the joined narrative. The word is emitted by its
 * own `PRINT [str:0x7b1e]` effect, so `collectText`'s space-joining puts blanks inside the quotes.
 */
const NOTE_RE = /THE PASSWORD IS '\s*([A-Z]+)\s*'/;

/** Join every PRINT emitted in a VM batch, the way `collectText` does. */
function textOf(effects: readonly EclEffect[]): string {
  return effects
    .filter((e): e is Extract<EclEffect, { type: 'print' }> => e.type === 'print')
    .map((e) => e.text ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Drive `ECL5.DAX#51`'s descriptor-37 console through the real VM and set the password to
 * `index`. Returns the VM (its `memory` is the seed for the consumers) and the last turn's text.
 *
 * Script shape (see the doc): the console GOSUBs the word ladder, prints
 * `CURRENT: <n> '<word>' SET NEW PASSWORD.'`, then a YES/NO `HORIZONTAL_MENU` (answer 0 = YES),
 * then `INPUT_NUMBER` (answer = the index), then writes and loops back to re-display.
 */
async function runSetter(index: number): Promise<{ vm: EclVm; redisplay: string; programs: number[] }> {
  const raw = await block(p('ECL5.DAX'), 51);
  const memory = new Map<number, number>([[0xc04f, 37]]);
  const vm = new EclVm(raw, { memory });
  const programs: number[] = [];

  const first = vm.run(); // -> the YES/NO menu
  expect(first.status).toBe('awaiting-input');
  for (const e of first.effects) if (e.type === 'program') programs.push(e.programId);

  const asked = vm.resume(0); // YES -> INPUT_NUMBER
  expect(asked.status).toBe('awaiting-input');
  expect(asked.effects.some((e) => e.type === 'input' && e.mode === 'number')).toBe(true);
  for (const e of asked.effects) if (e.type === 'program') programs.push(e.programId);

  const looped = vm.resume(index); // writes both cells, loops back to the display
  expect(looped.status).toBe('awaiting-input');
  for (const e of looped.effects) if (e.type === 'program') programs.push(e.programId);

  return { vm, redisplay: textOf(looped.effects), programs };
}

describe.skipIf(!haveRetail)('Neverwinter Nights (DOS/AOL) QUEST leg — the Kraken Society dock password', () => {
  // --- A. byte anchors ------------------------------------------------------------------------
  it('A. the setter, the gate fork and the two word ladders are exactly where the doc says', async () => {
    const ecl5_51 = await block(p('ECL5.DAX'), 51);
    const ecl1_14 = await block(p('ECL1.DAX'), 14);
    const ecl0_1 = await block(p('ECL0.DAX'), 1);
    expect(ecl5_51.length).toBe(5529);
    expect(ecl1_14.length).toBe(5668);
    expect(ecl0_1.length).toBe(4808);

    // The setter: SAVE [0x7f79] -> [0x32c8], the [0x4bc5]/PROGRAM #17 bracket, then -> [0x32ca].
    // Gen1 SAVE operand order is (source, destination) — destination LAST.
    expect(at(ecl5_51, 0x9572, 7)).toBe('09 01 79 7f 01 c8 32');
    expect(at(ecl5_51, 0x9579, 6)).toBe('09 00 0e 01 c5 4b'); // SAVE #14 -> [0x4bc5]
    expect(at(ecl5_51, 0x957f, 3)).toBe('38 00 11'); //           PROGRAM #17
    expect(at(ecl5_51, 0x9582, 7)).toBe('09 01 79 7f 01 ca 32');
    expect(at(ecl5_51, 0x9589, 6)).toBe('09 00 01 01 c5 4b'); // SAVE #1 -> [0x4bc5]
    expect(at(ecl5_51, 0x958f, 3)).toBe('38 00 11');

    // The gate fork: COMPARE typed-string vs expected-word, IF_EQ, GOTO accept.
    expect(at(ecl5_51, 0x8dcd, 6)).toBe('10 00 08 81 00 7b'); // INPUT_STRING #8, [str:0x7b00]
    expect(at(ecl5_51, 0x8dd3, 4)).toBe('02 01 52 93'); //        GOSUB the [0x32c8] ladder
    expect(at(ecl5_51, 0x8dd7, 7)).toBe('03 81 00 7b 81 1e 7b');
    expect(at(ecl5_51, 0x8dde, 1)).toBe('16'); //                 IF_EQ
    expect(at(ecl5_51, 0x8ddf, 4)).toBe('01 01 7c 8e'); //        GOTO 0x8e7c
    expect(at(ecl5_51, 0x8e7c, 3)).toBe('32 00 46'); //           FIND_ITEM #70  (accept arm)
    expect(at(ecl5_51, 0x8e7f, 1)).toBe('00'); //                 EXIT

    // The cross-archive consumer: GOSUB the [0x32ca] ladder, then PRINT the selected word.
    expect(at(ecl1_14, 0x8f92, 4)).toBe('02 01 56 94');
    expect(at(ecl1_14, 0x8f96, 4)).toBe('11 81 1e 7b');

    // The two ladders differ ONLY in the cell they compare.
    expect(at(ecl5_51, 0x935d, 6)).toBe('03 01 c8 32 00 01'); // COMPARE [0x32c8], #1
    expect(at(ecl1_14, 0x9461, 6)).toBe('03 01 ca 32 00 01'); // COMPARE [0x32ca], #1

    // ECL0#1's dispatch into the overlay, and its own default spawn (8,7) facing 3 = west.
    expect(at(ecl0_1, 0x92b7, 6)).toBe('03 01 4d c0 00 03'); // COMPARE [0xc04d], #3
    expect(at(ecl0_1, 0x92c2, 3)).toBe('20 00 33'); //          NEWECL #51
    expect(at(ecl0_1, 0x8138, 6)).toBe('09 00 08 01 4b c0');
    expect(at(ecl0_1, 0x8144, 6)).toBe('09 00 07 01 4c c0');
    expect(at(ecl0_1, 0x8150, 6)).toBe('09 00 03 01 4d c0');

    // Header sanity: ECL5#51's SearchLocation slot is the bare `NEWECL #1` stub at 0x80fb, so
    // this block is an EVENT OVERLAY reached by NEWECL, not an area with its own per-step events.
    const h = parseEclHeader(ecl5_51, ECL_GEN1);
    expect(h.searchLocation).toBe(0x80fb);
    expect(at(ecl5_51, 0x80fb, 3)).toBe('20 00 01');
  });

  // --- B. control-flow-free corpus census -----------------------------------------------------
  it('B. exactly ONE corpus-wide site writes a password value into either cell', async () => {
    // SAVE [0x7f79] -> [0x32c8]  and  SAVE [0x7f79] -> [0x32ca]
    expect(await scanCorpus([0x09, 0x01, 0x79, 0x7f, 0x01, 0xc8, 0x32])).toEqual([
      'ECL5.DAX#51@0x9572',
    ]);
    expect(await scanCorpus([0x09, 0x01, 0x79, 0x7f, 0x01, 0xca, 0x32])).toEqual([
      'ECL5.DAX#51@0x9582',
    ]);
    // [0x4bc5] is written only by the bracket around that one setter — and read nowhere.
    expect(await scanCorpus([0x09, 0x00, 0x0e, 0x01, 0xc5, 0x4b])).toEqual(['ECL5.DAX#51@0x9579']);
    expect(await scanCorpus([0x09, 0x00, 0x01, 0x01, 0xc5, 0x4b])).toEqual(['ECL5.DAX#51@0x9589']);

    // 25 COMPARE [0x32ca], #n reads select the printed word — ALL of them in ECL1.DAX, i.e. a
    // different archive from the single writer. This is the cross-archive half of the leg.
    const compares: string[] = [];
    for (let n = 1; n <= 25; n++) {
      compares.push(...(await scanCorpus([0x03, 0x01, 0xca, 0x32, 0x00, n])));
    }
    expect(compares.length).toBe(25);
    expect(new Set(compares.map((h) => h.split('@')[0]))).toEqual(new Set(['ECL1.DAX#14']));
    // CLARIFIED 2026-08-05. "All in a different archive" is about the 25 READS. It must NOT be read
    // as "ECL1.DAX contains no writer of [0x32ca]" — it contains three (see B2b). The property that
    // carries the leg is narrower and sharper: the READER BLOCK ECL1.DAX#14 never writes either
    // cell itself. Pinned here so the stronger, false reading cannot be inferred from this test.
    const ecl1_14 = await block(p('ECL1.DAX'), 14);
    expect(countPattern(ecl1_14, [0x09, 0x01, 0x79, 0x7f, 0x01, 0xca, 0x32])).toBe(0);
    expect(countPattern(ecl1_14, [0x09, 0x01, 0xca, 0x4b, 0x01, 0xca, 0x32])).toBe(0);
  });

  it('B2. DISCLOSURE: [0x32c8] is ALSO reused as a per-area day cache at 28 other sites', async () => {
    // `SAVE [0x4bca] -> [0x32c8]` — one per area block's initial_entry. Under a "single global
    // word" reading these would collide with the dock's expected password; that inconsistency is
    // what motivates the (UNPROVEN) per-area-bank reading of PROGRAM #17. Nothing in this file
    // depends on which reading is right, so the collision is asserted rather than hidden.
    const dayCache = await scanCorpus([0x09, 0x01, 0xca, 0x4b, 0x01, 0xc8, 0x32]);
    expect(dayCache.length).toBe(28);
    expect(dayCache).not.toContain('ECL5.DAX#51@0x9572');

    // ADDED 2026-08-05 — the positive half of the same idiom, which the doc's §7 now leans on and
    // previously never invoked. Each of the 28 sites is preceded 12 bytes earlier by
    // `COMPARE [0x4bca],[0x32c8]`: the "have I already been here this period?" test. 28 COMPAREs,
    // 28 SAVEs, in the SAME 28 blocks — an idiom that only works if the slot survives an area
    // change AND is not shared between areas. That is what makes [0x32C8] a per-area PERSISTENT
    // SLOT rather than "persistent state" flat (the overstatement §7 used to make).
    const dayCompare = await scanCorpus([0x03, 0x01, 0xca, 0x4b, 0x01, 0xc8, 0x32]);
    expect(dayCompare.length).toBe(28);
    const blockOf = (h: string) => h.split('@')[0]!;
    expect(new Set(dayCompare.map(blockOf))).toEqual(new Set(dayCache.map(blockOf)));
    expect(new Set(dayCache.map(blockOf)).size).toBe(28); // one pair per block, never two
    // The COMPARE sits exactly 12 bytes ahead of its SAVE in every block.
    const addr = (h: string) => parseInt(h.split('@0x')[1]!, 16);
    for (const c of dayCompare) {
      expect(dayCache.some((s) => blockOf(s) === blockOf(c) && addr(s) === addr(c) + 12), c).toBe(true);
    }

    // Area 1's own script never touches [0x32c8] at all, so nothing in Neverwinter itself
    // clobbers the dock's cell from inside the area the overlay runs on.
    const ecl0_1 = await block(p('ECL0.DAX'), 1);
    expect(countPattern(ecl0_1, [0x01, 0xc8, 0x32])).toBe(0);
  });

  it('B2b. DISCLOSURE: six FURTHER writers exist that are not day-cache shaped', async () => {
    // ADDED 2026-08-05. B2 disclosed the 28-site day cache and stopped there, which understates the
    // collision hazard in the doc's §9.3: there are six more reachable writers of these two cells
    // and none of them is a day stamp. They store the HOUR, or the literals 255 / 1 / 0. The leg's
    // claim survives (only [0x7f79] — a password INDEX — is written by the setter, and only there),
    // but the full writer set belongs in the golden rather than in prose.
    const cases: Array<[string, number[], string[]]> = [
      // SAVE [0x4bc9] (hour) -> [0x32c8]
      ['hour -> 0x32c8', [0x09, 0x01, 0xc9, 0x4b, 0x01, 0xc8, 0x32], ['ECL1.DAX#16@0x8af6']],
      // SAVE #255 -> [0x32ca]
      ['#255 -> 0x32ca', [0x09, 0x00, 0xff, 0x01, 0xca, 0x32],
        ['ECL1.DAX#17@0x8dad', 'ECL1.DAX#17@0x9153']],
      // SAVE #1 -> [0x32c8]
      ['#1 -> 0x32c8', [0x09, 0x00, 0x01, 0x01, 0xc8, 0x32], ['ECL2.DAX#26@0x8cd0']],
      // SAVE #1 -> [0x32ca]
      ['#1 -> 0x32ca', [0x09, 0x00, 0x01, 0x01, 0xca, 0x32], ['ECL2.DAX#27@0x9336']],
      // SAVE #0 -> [0x32ca]
      ['#0 -> 0x32ca', [0x09, 0x00, 0x00, 0x01, 0xca, 0x32], ['ECL2.DAX#27@0x933d']],
    ];
    for (const [label, pattern, expected] of cases) {
      expect(await scanCorpus(pattern), label).toEqual(expected);
    }
    // 28 day-cache + 1 day-cache to 0x32ca + 2 setter + these 6 = 37 writers in total. The setter
    // remains the ONLY site that writes a password index ([0x7f79]) into either cell (test B).
    expect(28 + 1 + 2 + cases.flatMap(([, , e]) => e).length).toBe(37);
  });

  it('B3. PROGRAM #17 occurs at exactly two REAL instruction sites, both around the setter', async () => {
    // Raw scan finds five `38 00 11` runs; three are byte coincidences inside other
    // instructions' operands in ECL2.DAX#26. This test pins the raw count AND the two real ones,
    // so the "PROGRAM #17 is unique to the setter" claim is stated at the precision it has.
    const raw = await scanCorpus([0x38, 0x00, 0x11]);
    expect(raw.length).toBe(5);
    expect(raw.filter((h) => h.startsWith('ECL5.DAX#51'))).toEqual([
      'ECL5.DAX#51@0x957f',
      'ECL5.DAX#51@0x958f',
    ]);
    expect(raw.filter((h) => h.startsWith('ECL2.DAX#26')).length).toBe(3);
  });

  // --- C. GEO ground truth --------------------------------------------------------------------
  it('C. the dock, the console and the note encounter are the retail cells the doc names', async () => {
    const geo0 = decodeGeoBlock(await block(p('GEO0.DAX'), 1), 'NWN GEO0#1').map;
    const desc = (x: number, y: number) => (geo0.cells[y * geo0.width + x]!.floor ?? 0) & 0x7f;
    expect(desc(1, 11)).toBe(36); // the doorman
    expect(desc(1, 13)).toBe(36); // the doorman, second approach cell
    expect(desc(4, 0)).toBe(37); //  the "SET NEW PASSWORD" console

    const geo1 = decodeGeoBlock(await block(p('GEO1.DAX'), 14), 'NWN GEO1#14').map;
    expect((geo1.cells[6 * geo1.width + 15]!.floor ?? 0) & 0x7f).toBe(112); // the corpse
  });

  // --- D. routing: area 1's search_location dispatches both cells into the overlay -------------
  it('D. GEO0#1 (1,11) facing west chains to block 51; facing north does not', async () => {
    const ecl0_1 = await block(p('ECL0.DAX'), 1);

    const west = primeSearchLocation(ecl0_1, 36, { facing: 'west' })!;
    expect(west).not.toBeNull();
    const westRun = west.run();
    expect(westRun.status).toBe('chain');
    expect(westRun.chainBlockId).toBe(51);

    // NEGATIVE CONTROL on the facing gate at 0x92b7 (COMPARE [0xc04d], #3 / IF_NE EXIT).
    const north = primeSearchLocation(ecl0_1, 36, { facing: 'north' })!;
    const northRun = north.run();
    expect(northRun.status).not.toBe('chain');

    // The console cell has no facing gate at all — arm 37 is a bare NEWECL #51.
    const console37 = primeSearchLocation(ecl0_1, 37, { facing: 'north' })!;
    const consoleRun = console37.run();
    expect(consoleRun.status).toBe('chain');
    expect(consoleRun.chainBlockId).toBe(51);
  });

  // --- E. the setter, through the real VM -----------------------------------------------------
  it('E. the descriptor-37 console writes the typed index into BOTH cells and re-displays it', async () => {
    const { vm, redisplay, programs } = await runSetter(9);
    expect(vm.memory.get(0x32c8)).toBe(9);
    expect(vm.memory.get(0x32ca)).toBe(9);
    // The bracket really executes: PROGRAM #17 twice, with [0x4bc5] left restored to 1.
    expect(programs.filter((id) => id === 17).length).toBe(2);
    expect(vm.memory.get(0x4bc5)).toBe(1);
    // The re-display reads the value back through the ladder — the write is observable in-script.
    expect(redisplay).toContain('TWAIN');
    expect(redisplay).toContain('SET NEW PASSWORD');
  });

  it('E2. INPUT_NUMBER is clamped at 25, so no index can escape the 26-entry table', async () => {
    const { vm } = await runSetter(200);
    expect(vm.memory.get(0x32c8)).toBe(25);
    expect(vm.memory.get(0x32ca)).toBe(25);
  });

  // --- F. cross-archive consumer: the note names the word the setter chose ---------------------
  it('F. ECL1#14 (a DIFFERENT archive) prints the setter-chosen word on the looted note', async () => {
    const ecl1_14 = await block(p('ECL1.DAX'), 14);
    const { vm } = await runSetter(9);

    const runner = dialogueForCell(ecl1_14, 112, { memory: vm.memory, facing: 'east' });
    expect(runner).not.toBeNull();

    const fight = runner!.start();
    expect(fight.kind).toBe('combat');
    if (fight.kind !== 'combat') throw new Error('expected the descriptor-112 ambush');
    expect(fight.monsters).toEqual([
      { monsterId: 44, count: 2, picBlockId: 44 },
      { monsterId: 94, count: 4, picBlockId: 94 },
    ]);

    let turn = runner!.afterCombat('victory');
    let seen = turn.text;
    for (let i = 0; i < 8 && turn.kind === 'say'; i++) {
      turn = runner!.choose(0);
      seen += ' ' + turn.text;
    }
    // The word arrives as its own PRINT effect (`PRINT [str:0x7b1e]` at 0x8f96), so the joined
    // narrative reads `... THE PASSWORD IS ' TWAIN ' FOR TRAVEL ...`; the regex spans that split.
    expect(seen).toContain('THE PASSWORD IS');
    expect(NOTE_RE.exec(seen)?.[1]).toBe('TWAIN');
    expect(seen).toContain('FOR TRAVEL TO THE PURPLE ROCKS');
  });

  // --- G/H. the gate: accept the note's word, refuse everything else ---------------------------
  /**
   * Drive `ECL5.DAX#51`'s descriptor-36 dock gate at night with `[0x32c8] = index` and answer the
   * doorman with `answer`. Returns the terminal status plus all text emitted along the way.
   */
  async function runGate(index: number, answer: string): Promise<{ status: string; chain?: number; text: string }> {
    const raw = await block(p('ECL5.DAX'), 51);
    const memory = new Map<number, number>([
      [0xc04f, 36],
      [0x4bc9, 2], // hour 2 — [0x4bc9] < 5 takes the night branch at 0x8bcc
      [0x32c8, index],
    ]);
    const vm = new EclVm(raw, { memory });
    let r = vm.run();
    let text = textOf(r.effects);
    expect(r.status).toBe('awaiting-input');
    expect(r.effects.some((e) => e.type === 'input' && e.mode === 'string' && e.maxLength === 8)).toBe(true);
    r = vm.resume(answer);
    text += ' ' + textOf(r.effects);
    return { status: r.status, ...(r.chainBlockId !== undefined ? { chain: r.chainBlockId } : {}), text };
  }

  it('G. the doorman ACCEPTS the note word (FIND_ITEM #70 / EXIT) for every one of the 26 indices', async () => {
    for (let index = 0; index < PASSWORDS.length; index++) {
      const r = await runGate(index, PASSWORDS[index]!);
      expect(`${index}:${r.status}`).toBe(`${index}:exited`);
      expect(r.text).not.toContain('PURPLE SQUID');
    }
  });

  it('H. NEGATIVE CONTROL — a wrong word is REFUSED and bounces the party back to block 1', async () => {
    for (let index = 0; index < PASSWORDS.length; index++) {
      // Answer with the NEXT table entry: a real password word, just not this cell's value. That
      // rules out "any non-empty string works" and "the compare is against a constant".
      const wrong = PASSWORDS[(index + 1) % PASSWORDS.length]!;
      const r = await runGate(index, wrong);
      expect(`${index}:${r.status}`).toBe(`${index}:chain`);
      expect(r.chain).toBe(1);
      expect(r.text).toContain('PURPLE SQUID');
    }

    // Empty and junk answers are refused too.
    for (const junk of ['', 'XYZZY', 'PASSWORD']) {
      const r = await runGate(9, junk);
      expect(r.status).toBe('chain');
      expect(r.text).toContain('PURPLE SQUID');
    }
  });

  it('H2. the two ladders agree: setting the password makes the note match the gate end-to-end', async () => {
    // The whole leg in one loop, driven only through the real VM: set index -> read the note's
    // word from the OTHER archive -> hand that word back to the doorman -> accepted.
    const ecl1_14 = await block(p('ECL1.DAX'), 14);
    for (const index of [0, 1, 9, 17, 25]) {
      const { vm } = await runSetter(index);
      const runner = dialogueForCell(ecl1_14, 112, { memory: vm.memory, facing: 'east' })!;
      expect(runner.start().kind).toBe('combat');
      let turn = runner.afterCombat('victory');
      let seen = turn.text;
      for (let i = 0; i < 8 && turn.kind === 'say'; i++) {
        turn = runner.choose(0);
        seen += ' ' + turn.text;
      }
      const noted = NOTE_RE.exec(seen)?.[1];
      expect(noted).toBe(PASSWORDS[index]);
      const gate = await runGate(index, noted!);
      expect(gate.status).toBe('exited');
    }
  });

  it('I. the password scene is night-gated on [0x4bc9]; by day the dock is empty', async () => {
    const raw = await block(p('ECL5.DAX'), 51);
    const memory = new Map<number, number>([
      [0xc04f, 36],
      [0x4bc9, 12], // midday: 5 <= hour < 20 takes the daytime description branch
      [0x32c8, 9],
    ]);
    const vm = new EclVm(raw, { memory });
    let r = vm.run();
    let text = textOf(r.effects);
    // The daytime branch is three PRINTCLEARs separated by "PRESS ENTER TO CONTINUE" menus.
    for (let i = 0; i < 6 && r.status === 'awaiting-input'; i++) {
      expect(r.effects.some((e) => e.type === 'input' && e.mode === 'string')).toBe(false);
      r = vm.resume(0);
      text += ' ' + textOf(r.effects);
    }
    expect(r.status).toBe('chain');
    expect(r.chainBlockId).toBe(1);
    expect(text).toContain('THE DOCK NOW LIES EMPTY AND UNUSED');
    expect(text).not.toContain('WHAT IS THE PASSWORD');
  });

  // --- J. the honest negative: the setter cell cannot be walked to -----------------------------
  it('J. NEGATIVE RESULT — the descriptor-37 console at (4,0) is walk-unreachable', async () => {
    const geo = decodeGeoBlock(await block(p('GEO0.DAX'), 1), 'NWN GEO0#1').map;
    const raw = await block(p('GEO0.DAX'), 1);
    expect(raw.length).toBe(1026);

    // Reuse the engine's OWN wall model rather than re-deriving it: `Explorer` blocks a step when
    // `cell.walls[dir] !== 0 && (cell.doors?.[dir] ?? 0) === 0` (explorer.ts:163). That rule is the
    // permissive one — every door/gateway edge counts as passable, no bash/pick/knock required — so
    // an unreachable verdict under it is strictly stronger than one under a stricter rule.
    const W = geo.width, H = geo.height;
    const idx = (x: number, y: number) => y * W + x;
    const DIRS = ['north', 'east', 'south', 'west'] as const;
    const DELTA: Record<(typeof DIRS)[number], [number, number]> = {
      north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
    };
    const step = (x: number, y: number, dir: (typeof DIRS)[number]): [number, number] | null => {
      const cell = geo.cells[idx(x, y)]!;
      if (cell.walls[dir] !== 0 && (cell.doors?.[dir] ?? 0) === 0) return null;
      const [dx, dy] = DELTA[dir];
      const nx = x + dx, ny = y + dy;
      return nx < 0 || ny < 0 || nx >= W || ny >= H ? null : [nx, ny];
    };

    // Forward BFS from ECL0#1's OWN byte-grounded default spawn (8,7) — see anchor A.
    const seen = new Set<number>([idx(8, 7)]);
    const queue: [number, number][] = [[8, 7]];
    while (queue.length) {
      const [x, y] = queue.shift()!;
      for (const dir of DIRS) {
        const nxt = step(x, y, dir);
        if (nxt && !seen.has(idx(nxt[0], nxt[1]))) {
          seen.add(idx(nxt[0], nxt[1]));
          queue.push(nxt);
        }
      }
    }
    // The doorman IS reachable by walking; the console is NOT.
    expect(seen.has(idx(1, 11))).toBe(true);
    expect(seen.has(idx(1, 13))).toBe(true);
    expect(seen.has(idx(4, 0))).toBe(false);

    // The exact 11-step walk the doc cites, replayed edge by edge from the same spawn.
    const walk = [
      'south', 'west', 'south', 'west', 'west', 'west', 'west', 'south', 'south', 'west', 'west',
    ] as const;
    let pose: [number, number] = [8, 7];
    for (const dir of walk) {
      const nxt = step(pose[0], pose[1], dir);
      expect(`${pose[0]},${pose[1]} ${dir}`).toBe(nxt ? `${pose[0]},${pose[1]} ${dir}` : 'BLOCKED');
      pose = nxt!;
    }
    expect(pose).toEqual([1, 11]);
    expect((geo.cells[idx(1, 11)]!.floor ?? 0) & 0x7f).toBe(36);

    // ...and none of area 1's seven declared entry poses lies in the console's pocket either.
    //
    // STRENGTHENED 2026-08-05. This block used to assert only `!== [4,0]` for each spawn, which is
    // a tautology given the list is a literal — it tested nothing. Two real assertions now:
    //   (1) the seven poses are the ones ECL0#1 actually declares, read back out of the retail
    //       bytes at their vaddrs (the pair order varies: some write Y first, which is why a naive
    //       X-then-Y scan of this block finds only five);
    //   (2) the BFS is run from ALL SEVEN, not just the cold-boot default, because the doc's
    //       unreachability claim is quantified over all of them.
    const ecl0_1raw = await block(p('ECL0.DAX'), 1);
    const imm = (vaddr: number) => ecl0_1raw[vaddr - 0x7ffe + 2]!; // `09 00 <imm> 01 lo hi`
    const dest = (vaddr: number) =>
      (ecl0_1raw[vaddr - 0x7ffe + 5]! << 8) | ecl0_1raw[vaddr - 0x7ffe + 4]!;
    const DECLARED: Array<[number, number, number, number]> = [
      // [xVaddr, yVaddr, x, y]
      [0x80a0, 0x809a, 7, 0],
      [0x80b0, 0x80aa, 10, 5],
      [0x80cb, 0x80d1, 15, 7],
      [0x80ec, 0x80e6, 7, 15],
      [0x8101, 0x8107, 2, 6],
      [0x8122, 0x8128, 1, 11],
      [0x8138, 0x8144, 8, 7],
    ];
    for (const [xv, yv, x, y] of DECLARED) {
      expect([dest(xv), imm(xv)], `X pose at 0x${xv.toString(16)}`).toEqual([0xc04b, x]);
      expect([dest(yv), imm(yv)], `Y pose at 0x${yv.toString(16)}`).toEqual([0xc04c, y]);
    }
    const spawns = DECLARED.map(([, , x, y]) => [x, y] as [number, number]);
    expect(spawns.length).toBe(7);
    // (1,11) — the dock gate itself — is one of them: the game CAN place the party on the consumer
    // cell. It is only the setter cell that no declared pose reaches.
    expect(spawns).toContainEqual([1, 11]);

    for (const [sx, sy] of spawns) {
      const reach = new Set<number>([idx(sx, sy)]);
      const q: [number, number][] = [[sx, sy]];
      while (q.length) {
        const [x, y] = q.shift()!;
        for (const dir of DIRS) {
          const nxt = step(x, y, dir);
          if (nxt && !reach.has(idx(nxt[0], nxt[1]))) {
            reach.add(idx(nxt[0], nxt[1]));
            q.push(nxt);
          }
        }
      }
      expect(reach.has(idx(4, 0)), `spawn (${sx},${sy}) must not reach the console`).toBe(false);
      for (const px of [1, 2, 3]) {
        expect(reach.has(idx(px, 0)), `spawn (${sx},${sy}) must not reach (${px},0)`).toBe(false);
      }
    }

    // Reverse BFS: which cells can ever step INTO (4,0)?
    const into = new Set<number>([idx(4, 0)]);
    const rq: [number, number][] = [[4, 0]];
    while (rq.length) {
      const [x, y] = rq.shift()!;
      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          if (into.has(idx(px, py))) continue;
          for (const dir of DIRS) {
            const nxt = step(px, py, dir);
            if (nxt && nxt[0] === x && nxt[1] === y) {
              into.add(idx(px, py));
              rq.push([px, py]);
              break;
            }
          }
        }
      }
    }
    // A four-cell dead pocket along the top edge, disjoint from everything the party can walk.
    expect([...into].sort((a, b) => a - b)).toEqual(
      [idx(1, 0), idx(2, 0), idx(3, 0), idx(4, 0)].sort((a, b) => a - b),
    );
    for (const cell of into) expect(seen.has(cell)).toBe(false);
  });

  // --- K. the default -------------------------------------------------------------------------
  it('K. with the setter never run, both ladders still agree — index 0 = FUTURE on both sides', async () => {
    // This is what blunts J: the wiring proven here is "the note names exactly the word the doorman
    // expects", and that is true of the untouched cell too.
    //
    // QUALIFIED 2026-08-05. "Untouched" is only available under the PER-AREA-BANK reading of the
    // PROGRAM #17 bracket, which the doc's §9.2 labels UNPROVEN. Under the alternative
    // single-global-word reading the cells are not untouched at all by the time the party reaches
    // the dock — and the sharpest counter-example is asserted at the bottom of this test: the note's
    // own block, ECL1.DAX#14, writes the day cache into [0x32C8] in its own initial_entry. So this
    // test establishes the default-agreement fact; it does NOT establish that a real playthrough
    // ever observes it, and this leg does not discriminate between the two readings.
    const ecl1_14 = await block(p('ECL1.DAX'), 14);
    const runner = dialogueForCell(ecl1_14, 112, { memory: new Map<number, number>(), facing: 'east' })!;
    expect(runner.start().kind).toBe('combat');
    let turn = runner.afterCombat('victory');
    let seen = turn.text;
    for (let i = 0; i < 8 && turn.kind === 'say'; i++) {
      turn = runner.choose(0);
      seen += ' ' + turn.text;
    }
    expect(NOTE_RE.exec(seen)?.[1]).toBe('FUTURE');

    const raw = await block(p('ECL5.DAX'), 51);
    const vm = new EclVm(raw, { memory: new Map<number, number>([[0xc04f, 36], [0x4bc9, 2]]) });
    expect(vm.run().status).toBe('awaiting-input');
    const accepted = vm.resume('FUTURE');
    expect(accepted.status).toBe('exited');

    // ...and the counter-example that makes the qualification above measurable rather than prose:
    // the NOTE'S OWN BLOCK clobbers [0x32C8] in its own initial_entry. Under the single-global-word
    // reading the party cannot even reach the note without the gate's cell having been overwritten,
    // so "untouched" is a property of the BANKED reading only.
    expect(at(ecl1_14, 0x81ea, 7)).toBe('03 01 ca 4b 01 c8 32'); // COMPARE [0x4bca],[0x32c8]
    expect(at(ecl1_14, 0x81f6, 7)).toBe('09 01 ca 4b 01 c8 32'); // SAVE    [0x4bca] -> [0x32c8]
    // ECL1#14 still writes NEITHER cell with a password index — test B's uniqueness claim stands.
    expect(countPattern(ecl1_14, [0x09, 0x01, 0x79, 0x7f, 0x01, 0xc8, 0x32])).toBe(0);
  });
});
