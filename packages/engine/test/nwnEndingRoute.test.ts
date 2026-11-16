/**
 * Golden: Neverwinter Nights (DOS/AOL) ENDING leg — verdict `structurally-absent`.
 *
 * WHAT THIS TEST ESTABLISHES. Every number below was read out of the user's retail NWN files
 * (`ECL*.DAX`, `GEO*.DAX`, `GAME.EXE`, `GAME.OVR`) by this test itself. Nothing is transcribed
 * from a doc and nothing is hand-traced. It establishes, for the shipped DOS client:
 *   - The corpus is exactly 33 ECL blocks in 6 archives and 29 GEO blocks in 4 archives, with the
 *     exact id sets asserted. `ECL4.DAX`, `ECL6.DAX` and `GEO4..GEO9.DAX` do not exist on disk.
 *   - **No block is a terminal.** A CFG walk from all five ECL header entries of all 33 blocks
 *     finds a reachable `NEWECL` in every single block, every `NEWECL`/`LOAD_FILES` operand is an
 *     immediate (zero dynamic targets), and every target names a block id that ships.
 *   - The four blocks with no GEO (51, 59, 78, 79) are **not** endgame scripts: 51/78/79 are map
 *     overlays whose dispatched cell descriptors all exist in their host area's GEO — **which is
 *     consistent with the host but does NOT identify it** (corrected 2026-08-05: 78's four
 *     descriptors are satisfied by 6 of the 29 GEO blocks and 79's fifteen by 6 of 29; only 51's
 *     {36,37} is unique. The host is pinned by the on-entry `COMPARE [0x4BF2],#28/#29` guards and
 *     the `NEWECL` hand-backs — test C2 now measures both) — and 59 — the
 *     only block in the corpus with no descriptor-mask idiom at all, i.e. the only cutscene-shaped
 *     block — is a mid-campaign rescue scene that ends `NEWECL #9`.
 *   - A scan of **every byte position** of all 33 blocks recovers 1,836 inline 6-bit strings
 *     (1,409 unique; 111,316 decoded characters in total, 96,542 of them in the unique set) and a
 *     44-term ending-language predicate produces exactly **11** hits, asserted individually with
 *     its sentence. `YOU HAVE WON`, `YOUR QUEST IS` and `VICTORY IS YOURS` occur **zero** times.
 *     `CONGRAT` occurs **once** — `ECL0.DAX#8` @0x14e9, a villain congratulating a villain inside
 *     an ambush scene, not a player ending. **Corrected 2026-08-05**: this comment and test D2
 *     previously said 10 hits and `CONGRAT` zero; both were wrong, and the cause is disclosed
 *     below — `scanStrings` is a *filtered* extraction (≥85 % letters-and-spaces), not an
 *     exhaustive one. It drops 258 real strings that an instruction-aligned extraction recovers,
 *     that one included (it is 77.4 % letters). Test D4 now asserts that recall gap directly.
 *   - **Positive control**: the identical scanner and identical predicate, run on four sibling
 *     Gen1 titles, lands on their real endings (Pool of Radiance's "CONGRATULATIONS! YOUR QUEST IS
 *     OVER!", CoAB's "CONGRATULATIONS, YOU HAVE WON", …). The scanner is not silently broken.
 *   - The install directory holds 36 entries — 35 shipped game files plus `CCFP.MOV`, a 16-byte
 *     ASCII config file the runtime writes on this machine (**disclosed 2026-08-05**; the earlier
 *     comment said "the client ships 36 files", which counted that side-effect file as shipped).
 *     None is named `FINAL*`, while `GAME.OVR` still contains the Pascal literal `\x05FINAL`
 *     exactly once at 0x46323 next to `\x03PIC` and `\x04.dax`.
 *   - The one victory-looking string in the binary — `"You've won. Save before quitting? "` at
 *     file 0x4308 — is located, its dispatch chain pinned by exact bytes (ECL opcode dispatcher
 *     0x48EF → opcode 0x38 `PROGRAM` → 0x432A → `PROGRAM #7`/`#12`/`#13`/`#14` → 0x4244 → 0x404C),
 *     and shown on the ECL side to fire once per ordinary map block: `PROGRAM #7` 28 sites,
 *     `PROGRAM #12` 28 sites, 28/28 immediately paired, one pair in each of blocks 2..30, inside
 *     the area-entry preamble. A once-per-campaign terminal cannot be that.
 *
 * WHAT THIS TEST DOES **NOT** ESTABLISH.
 *   - **It does not prove the game has no ending in some absolute sense.** It proves the shipped
 *     DOS data set contains no terminal script and no denouement text. NWN was an online
 *     persistent-world game; a fuller AOL data set may exist and is not in evidence here.
 *   - **The CFG walk over-approximates.** It explores both arms of every conditional and never
 *     evaluates a comparison, so its reachable sets are supersets of what actually runs. For a
 *     negative result that is the safe direction, but the instruction counts are not "instructions
 *     the game executes".
 *   - **It does not discriminate the ECL dialect.** Test B2 proves *why* that is harmless here:
 *     the corpus contains zero CFG-reachable `0x1D`/`0x22`/`0x2C` instructions, so `ECL_GEN1` and
 *     `ECL_GEN1_SHORT` produce byte-identical reachable sets for all 33 blocks. `ECL_GEN1` is used
 *     because it is NWN's declared dialect, not because this route proves it.
 *   - **It does not identify what the four 115-entry `GAME.OVR` activities are**, nor what
 *     `lcall 0x98:0x34` decides. That is genuinely unresolved and is asserted only as byte facts
 *     about the call graph, never as an interpretation.
 *   - The 68 static x86 byte anchors in test F are asserted as *bytes*. Their reading as
 *     instructions came from a Capstone 16-bit disassembly done outside this test; the bytes are
 *     what is locked in, so the test cannot drift if that reading is ever revised.
 *   - It does not run the `EclVm`. Nothing here is a runtime route; this leg's claim is about what
 *     the data contains, and a route through content that does not exist cannot be walked.
 *
 * Shape of the proof:
 *   A. Retail inventory: file count, no FINAL*, which archives exist, block id sets, GEO sizes.
 *   B. CFG walk: per-block census, no sinks, no dynamic targets, closure; dialect non-discrimination.
 *   C. The four GEO-less blocks: overlays vs. the single cutscene block.
 *   D. String scan (filtered) + the 44-term ending predicate + the 6-bit round-trip + the
 *      instruction-aligned recall check that measures what the filter drops.
 *   E. Positive control on Pool of Radiance / CoAB / Secret / Champions of Krynn.
 *   F. The `GAME.OVR` victory prompt: bytes, dispatch chain, and its 56 ECL call sites.
 *
 * See `docs/engine/research/nwn-ending-route.md`.
 */
import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  readDaxDataBlocks,
  parseEclHeader,
  decodeInstructionAt,
  decodeEclString,
  ECL_GEN1,
  ECL_GEN1_SHORT,
  type EclDialect,
  type EclInstruction,
} from '../src/index.js';

const NWN = 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint';
const GOG = 'C:/Program Files (x86)/GOG Galaxy/Games';

/** All six ECL archives NWN ships (there is no ECL4 / ECL6). */
const ECL_ARCHIVES = ['ECL0.DAX', 'ECL1.DAX', 'ECL2.DAX', 'ECL3.DAX', 'ECL5.DAX', 'ECL7.DAX'] as const;
const GEO_ARCHIVES = ['GEO0.DAX', 'GEO1.DAX', 'GEO2.DAX', 'GEO3.DAX'] as const;

const haveRetail =
  ECL_ARCHIVES.every((f) => existsSync(resolve(NWN, f))) &&
  GEO_ARCHIVES.every((f) => existsSync(resolve(NWN, f))) &&
  existsSync(resolve(NWN, 'GAME.OVR')) &&
  existsSync(resolve(NWN, 'GAME.EXE'));

const haveControl = [
  'Pool of Radiance/POOLRAD/ECL3.DAX',
  'Curse of the Azure Bonds/ECL4.DAX',
  'Secret of the Silver Blades/ECL1.DAX',
  'Champions of Krynn/ECL1.DAX',
].every((p) => existsSync(resolve(GOG, p)));

// ---------------------------------------------------------------------------------------------
// Retail loading helpers
// ---------------------------------------------------------------------------------------------

async function archiveBlocks(dir: string, file: string) {
  return readDaxDataBlocks(new Uint8Array(await readFile(resolve(dir, file))));
}

/** blockId -> { archive, raw } across a whole title's ECL archive list. */
async function loadCorpus(dir: string, files: readonly string[]) {
  const out = new Map<number, { archive: string; raw: Uint8Array }>();
  for (const f of files) {
    if (!existsSync(resolve(dir, f))) continue;
    for (const b of await archiveBlocks(dir, f)) out.set(b.blockId, { archive: f, raw: b.raw });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// CFG walk. Mirrors tools/gen1_ecl_encounter_scan.py `successors()` with all compare outcomes
// enabled: both arms of every conditional are explored and no comparison is ever evaluated.
// ---------------------------------------------------------------------------------------------

const VADDR_ADDEND = 0x8000;
const toOffset = (vaddr: number) => ((vaddr + VADDR_ADDEND) & 0xffff) + 2;
const toVaddr = (offset: number) => (offset - 2 - VADDR_ADDEND) & 0xffff;

function reachable(raw: Uint8Array, dialect: EclDialect = ECL_GEN1): Map<number, EclInstruction> {
  const header = parseEclHeader(raw, dialect);
  const seen = new Map<number, EclInstruction>();
  const visited = new Set<string>();
  const queue: Array<{ off: number; stack: number[] }> = [];
  const entries = [
    header.vmRun1,
    header.searchLocation,
    header.preCampCheck,
    header.campInterrupted,
    header.eclInitialEntry,
  ];
  const push = (off: number, stack: number[]) => {
    if (off >= dialect.headerLen && off < raw.length && stack.length <= 24) queue.push({ off, stack });
  };
  for (const v of entries) push(toOffset(v), []);

  while (queue.length) {
    const state = queue.pop()!;
    const key = `${state.off}|${state.stack.slice(-6).join(',')}`;
    if (visited.has(key)) continue;
    visited.add(key);
    const dec = decodeInstructionAt(raw, state.off, dialect.vbase, dialect);
    if (dec.badOpcode || !dec.ins) continue;
    const ins = dec.ins;
    seen.set(state.off, ins);
    const next = state.off + ins.size;
    const op = ins.opcode;

    if (op === 0x00 /* EXIT */ || op === 0x20 /* NEWECL */) continue;
    if (op === 0x13 /* RETURN */) {
      if (state.stack.length) push(state.stack[state.stack.length - 1]!, state.stack.slice(0, -1));
      continue;
    }
    if (op === 0x01 /* GOTO */) {
      const a = ins.args[0];
      if (a && a.code <= 3) push(toOffset(a.word), state.stack);
      else push(next, state.stack);
      continue;
    }
    if (op === 0x02 /* GOSUB */) {
      const a = ins.args[0];
      if (a && a.code <= 3) push(toOffset(a.word), [...state.stack, next]);
      continue;
    }
    if (op >= 0x16 && op <= 0x1b /* IF_xx: guards exactly the next instruction */) {
      push(next, state.stack);
      const guarded = decodeInstructionAt(raw, next, dialect.vbase, dialect);
      if (!guarded.badOpcode && guarded.ins) push(next + guarded.ins.size, state.stack);
      continue;
    }
    if (op === 0x25 || op === 0x26 /* ON_GOTO / ON_GOSUB */) {
      push(next, state.stack);
      const count = ins.args[1]?.word ?? 0;
      for (const a of ins.args.slice(2, 2 + count)) {
        if (a.code <= 3) push(toOffset(a.word), op === 0x26 ? [...state.stack, next] : state.stack);
      }
      continue;
    }
    push(next, state.stack);
  }
  return seen;
}

/** Immediate operands of `opcode` over a reachable set. */
function immediates(m: Map<number, EclInstruction>, opcode: number, argIndex = 0): number[] {
  const out: number[] = [];
  for (const ins of m.values()) {
    if (ins.opcode !== opcode) continue;
    const a = ins.args[argIndex];
    if (a && a.code === 0) out.push(a.word);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// EXTRACTION A — byte-position inline-string scan. Tries a `0x80 <len>` frame at EVERY byte
// position, decodes with the engine's own decodeEclString, and keeps frames that decode to
// English-shaped uppercase text.
//
// !! NOT EXHAUSTIVE (disclosed 2026-08-05) !! The `letters / t.length > 0.85` shape filter below
// rejects real game text that is punctuation-heavy. Measured: it drops 258 strings that the
// instruction-aligned extraction B (`alignedStrings`) recovers, 78 of them >= 12 chars, including
// the corpus's only `CONGRATULATIONS` (ECL0#8 @0x14e9, 77.4 % letters). Never build an
// "occurs zero times" claim on this function alone — use the union with `alignedStrings`.
// Test D4 pins the size of the gap so it cannot silently grow.
// ---------------------------------------------------------------------------------------------

const TEXT_OK = /^[A-Z0-9 ,.'!?\-:;()/"&+*$%#@]+$/;

function scanStrings(raw: Uint8Array): Array<{ off: number; text: string }> {
  const hits: Array<{ off: number; text: string }> = [];
  let i = 0;
  while (i < raw.length - 2) {
    if (raw[i] === 0x80) {
      const n = raw[i + 1]!;
      if (n >= 3 && n <= 250 && i + 2 + n <= raw.length) {
        const t = decodeEclString(raw, i + 2, n);
        const letters = [...t].filter((c) => (c >= 'A' && c <= 'Z') || c === ' ').length;
        if (t.length >= 6 && TEXT_OK.test(t) && letters / t.length > 0.85) {
          hits.push({ off: i, text: t });
          i += 2 + n;
          continue;
        }
      }
    }
    i++;
  }
  return hits;
}

/**
 * EXTRACTION B — instruction-aligned, UNFILTERED (added 2026-08-05).
 *
 * Walks the same CFG as `reachable()` and takes the `0x80` operand that *terminates* each reachable
 * instruction, applying no shape filter at all. Returned offsets point at the `0x80` code byte, the
 * same convention `scanStrings` uses, so the two are directly comparable.
 *
 * Neither extraction subsumes the other: A reaches bytes no CFG walk enters (dead code, trailing
 * data), B reaches strings A's shape filter rejects. Absence claims must use the union.
 */
function alignedStrings(raw: Uint8Array): Array<{ off: number; text: string }> {
  const out: Array<{ off: number; text: string }> = [];
  for (const [off, ins] of [...reachable(raw).entries()].sort((a, b) => a[0] - b[0])) {
    const last = ins.args.at(-1);
    if (!last || last.code !== 0x80) continue;
    // Re-walk the operand bytes to recover the frame offset the decoder does not record.
    let pos = off + 1;
    let frame: number | undefined;
    for (const a of ins.args) {
      pos += 2;
      if (a.code === 1 || a.code === 2 || a.code === 3 || a.code === 0x81) pos += 1;
      if (a.code === 0x80) {
        frame = pos - 2;
        pos += a.high;
      }
    }
    if (frame !== undefined) out.push({ off: frame, text: last.text ?? '' });
  }
  return out;
}

/** Inverse of decodeEclString, no terminator: 6 bits/char, MSB-first. */
function encodeEclString(text: string): Uint8Array {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const ch of text) {
    acc = (acc << 6) | (ch.charCodeAt(0) & 0x3f);
    bits += 6;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  if (bits) out.push((acc << (8 - bits)) & 0xff);
  return Uint8Array.from(out);
}

/**
 * The ending-language predicate: 44 case-insensitive substrings drawn from the actual endgame text
 * of this project's other Gold Box titles plus generic denouement vocabulary. Deliberately broad.
 */
const ENDING_TERMS = [
  'CONGRATULATIONS', 'YOU HAVE WON', 'YOU WIN', 'VICTORY IS YOURS', 'TRIUMPHANT',
  'THE END', 'YOUR QUEST IS', 'QUEST IS COMPLETE', 'QUEST IS OVER', 'ADVENTURE IS OVER',
  'ADVENTURE IS AT AN END', 'IS AT AN END', 'AT LAST', 'FOREVER', 'NEVER AGAIN',
  'PEACE RETURNS', 'PEACE HAS RETURNED', 'RESTORED TO', 'SAVED THE CITY',
  'SAVED NEVERWINTER', 'SAVED THE REALM', 'THE REALM IS', 'CELEBRATION', 'CELEBRATE',
  'BANQUET', 'FEAST IN YOUR', 'IN YOUR HONOR', 'HONOR YOU', 'HAILED AS', 'HEROES OF',
  'GREAT HEROES', 'REWARD YOU', 'YOUR REWARD', 'GRATEFUL', 'GRATITUDE OF',
  'FAREWELL', 'GOODBYE', 'RETIRE', 'SONGS WILL BE SUNG', 'BARDS WILL',
  'LEGEND', 'TALE WILL BE TOLD', 'DEFEATED AT LAST', 'IS NO MORE',
] as const;

function predicateHits(text: string): string[] {
  const upper = text.toUpperCase();
  return ENDING_TERMS.filter((t) => upper.includes(t));
}

/** Hex dump of `length` bytes at `offset` in a raw file image. */
function bytesAt(buf: Uint8Array, offset: number, length: number): string {
  return [...buf.slice(offset, offset + length)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

function countOccurrences(hay: Uint8Array, needle: Uint8Array): number {
  let n = 0;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    n++;
  }
  return n;
}

const ascii = (s: string) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)));

// =============================================================================================

describe.skipIf(!haveRetail)('NWN ENDING leg — structurally absent (retail bytes)', () => {
  // -------------------------------------------------------------------------------------------
  // A. Retail inventory
  // -------------------------------------------------------------------------------------------

  it('A1. the install holds 36 entries (35 shipped + one runtime-written file) and none is FINAL*', async () => {
    const files = await readdir(NWN);
    // Corrected 2026-08-05: this used to read `expect(files.length).toBe(36)` under the comment
    // "the install ships 36 files". 36 is the directory count, but one entry — CCFP.MOV, 16 bytes,
    // ASCII "14 4 1\r\n15 4 1\r\n", mtime 2026 — is written by the runtime on this machine and is
    // not part of the release. Pin both numbers so the distinction cannot be lost again.
    expect(files.length).toBe(36);
    expect(files.includes('CCFP.MOV') || files.includes('ccfp.mov')).toBe(true);
    expect(files.filter((f) => !/^ccfp\.mov$/i.test(f)).length).toBe(35);
    expect(files.filter((f) => f.toUpperCase().startsWith('FINAL'))).toEqual([]);

    // The six ECL archives exist; ECL4/ECL6 — the ids that would carry blocks 40-49 / 60-69
    // under NWN's own ECL<id/10> naming — do not.
    for (const f of ECL_ARCHIVES) expect(existsSync(resolve(NWN, f)), f).toBe(true);
    expect(existsSync(resolve(NWN, 'ECL4.DAX'))).toBe(false);
    expect(existsSync(resolve(NWN, 'ECL6.DAX'))).toBe(false);
    for (const f of GEO_ARCHIVES) expect(existsSync(resolve(NWN, f)), f).toBe(true);
    for (let i = 4; i <= 9; i++) expect(existsSync(resolve(NWN, `GEO${i}.DAX`)), `GEO${i}`).toBe(false);
  });

  it('A2. exactly 33 ECL blocks and 29 GEO blocks, with the exact id sets', async () => {
    const ecl = await loadCorpus(NWN, ECL_ARCHIVES);
    const geo = await loadCorpus(NWN, GEO_ARCHIVES);

    const eclIds = [...ecl.keys()].sort((a, b) => a - b);
    const geoIds = [...geo.keys()].sort((a, b) => a - b);
    const ordinary = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30];

    expect(eclIds).toEqual([...ordinary, 51, 59, 78, 79]);
    expect(geoIds).toEqual(ordinary);
    expect(eclIds.length).toBe(33);
    expect(geoIds.length).toBe(29);

    // Gen1 GEO blocks are a fixed 1026 bytes (16x16).
    for (const [id, g] of geo) expect(g.raw.length, `GEO#${id}`).toBe(1026);

    // Every ordinary block has a GEO of its own id; the four ECL-only blocks have none.
    for (const id of ordinary) expect(geo.has(id), `GEO#${id}`).toBe(true);
    for (const id of [51, 59, 78, 79]) expect(geo.has(id), `GEO#${id} must not exist`).toBe(false);
  });

  it('A3. the FINAL* convention exists in sibling installs but not here', () => {
    // Corroboration only — see the doc: CoAB/Secret/CoK have endings and ship no FINAL* either.
    const siblings = [
      'Pool of Radiance/POOLRAD/FINAL5.DAX',
      'Pools of Darkness/FINAL.ACF',
      'The Dark Queen of Krynn/DISK3/FINAL.TLB',
    ];
    const present = siblings.filter((p) => existsSync(resolve(GOG, p)));
    if (present.length) {
      // At least one sibling install is on this machine and does ship a FINAL* archive.
      expect(present.length).toBeGreaterThan(0);
    }
    expect(existsSync(resolve(NWN, 'FINAL.DAX'))).toBe(false);
    expect(existsSync(resolve(NWN, 'FINAL5.DAX'))).toBe(false);
  });

  // -------------------------------------------------------------------------------------------
  // B. The block graph has no terminal
  // -------------------------------------------------------------------------------------------

  /**
   * Per-block CFG census. Produced independently in Python by
   * `tools/gen1_ecl_encounter_scan.py`'s decoder and reproduced here by the engine's own
   * `decodeInstructionAt`; the two agree exactly (see the doc's §9).
   * [blockId, archive, byteLength, reachableInstructions, combatCount, newEclTargets]
   */
  const CENSUS: ReadonlyArray<readonly [number, string, number, number, number, number[]]> = [
    [1, 'ECL0.DAX', 4808, 452, 6, [2, 3, 4, 8, 12, 20, 27, 28, 51]],
    [2, 'ECL0.DAX', 4685, 528, 2, [1, 5]],
    [3, 'ECL0.DAX', 5477, 590, 4, [1, 24]],
    [4, 'ECL0.DAX', 4358, 522, 3, [1, 9]],
    [5, 'ECL0.DAX', 5079, 580, 5, [2, 6]],
    [6, 'ECL0.DAX', 4727, 616, 5, [5, 7, 8]],
    [7, 'ECL0.DAX', 4150, 473, 6, [6]],
    // Block 8: 722 -> 723 reachable instructions on 2026-09-04 (round 34 Phase B), after opcode
    // 0x41 (wordSet 2) entered the base Gen1 table and NWN's deep desync count went 1 -> 0.
    // ONLY the instruction count moved. The claim this census exists to support -- that NWN's
    // ENDING leg is STRUCTURALLY ABSENT -- is unchanged and was re-verified, not re-pinned:
    // block 8 still has NEWECL targets [6], still hands control on, still reaches no sink and no
    // dynamic target, and the graph is still closed over shipped blocks. A proven negative that
    // survives a decode fix is stronger than it was; one that quietly absorbed a changed number
    // without re-checking its own predicate would not be.
    [8, 'ECL0.DAX', 7219, 723, 6, [6]],
    [9, 'ECL0.DAX', 7547, 707, 12, [4, 10, 59]],
    [10, 'ECL1.DAX', 6598, 663, 11, [9, 11]],
    [11, 'ECL1.DAX', 3679, 393, 2, [10, 12]],
    [12, 'ECL1.DAX', 7676, 724, 11, [1, 11, 14, 15, 30]],
    [14, 'ECL1.DAX', 5668, 620, 8, [10, 12]],
    [15, 'ECL1.DAX', 5639, 546, 7, [12, 16]],
    [16, 'ECL1.DAX', 5858, 532, 6, [15, 17, 21]],
    [17, 'ECL1.DAX', 6681, 539, 7, [16]],
    [18, 'ECL1.DAX', 2844, 419, 2, [19, 20]],
    [19, 'ECL1.DAX', 2392, 374, 2, [18, 21]],
    [20, 'ECL2.DAX', 2474, 398, 2, [18, 21, 22, 25]],
    [21, 'ECL2.DAX', 2408, 388, 2, [16, 19, 20, 23]],
    [22, 'ECL2.DAX', 2604, 377, 2, [20, 23]],
    [23, 'ECL2.DAX', 3061, 412, 2, [21, 22]],
    [24, 'ECL2.DAX', 7662, 590, 4, [3, 25]],
    [25, 'ECL2.DAX', 6113, 506, 6, [20, 24, 26]],
    [26, 'ECL2.DAX', 7137, 638, 7, [25]],
    [27, 'ECL2.DAX', 6939, 802, 7, [1, 12]],
    [28, 'ECL2.DAX', 7676, 656, 2, [1, 29, 78]],
    [29, 'ECL2.DAX', 7678, 687, 5, [28, 79]],
    [30, 'ECL3.DAX', 4717, 613, 5, [5, 12]],
    [51, 'ECL5.DAX', 5529, 144, 0, [1]],
    [59, 'ECL5.DAX', 1124, 67, 0, [9]],
    [78, 'ECL7.DAX', 2441, 76, 0, [28, 29]],
    [79, 'ECL7.DAX', 5310, 192, 3, [28, 29]],
  ];

  it('B1. every block hands control on: no sinks, no dynamic targets, closed graph', async () => {
    const ecl = await loadCorpus(NWN, ECL_ARCHIVES);
    const shipped = new Set(ecl.keys());
    let totalInstructions = 0;

    for (const [id, archive, bytes, insCount, combat, newEcl] of CENSUS) {
      const entry = ecl.get(id);
      expect(entry, `block ${id}`).toBeDefined();
      expect(entry!.archive, `block ${id} archive`).toBe(archive);
      expect(entry!.raw.length, `block ${id} size`).toBe(bytes);

      const m = reachable(entry!.raw);
      totalInstructions += m.size;
      expect(m.size, `block ${id} reachable instructions`).toBe(insCount);
      const combats = [...m.values()].filter((i) => i.opcode === 0x24 /* COMBAT */).length;
      expect(combats, `block ${id} COMBAT`).toBe(combat);

      const targets = [...new Set(immediates(m, 0x20 /* NEWECL */))].sort((a, b) => a - b);
      expect(targets, `block ${id} NEWECL targets`).toEqual(newEcl);

      // No sink: every block hands control to another block.
      expect(targets.length, `block ${id} must not be a graph sink`).toBeGreaterThan(0);
      // Closure: every target ships.
      for (const t of targets) expect(shipped.has(t), `block ${id} -> ${t} must ship`).toBe(true);

      // Zero dynamic NEWECL / LOAD_FILES operands anywhere.
      for (const ins of m.values()) {
        if (ins.opcode === 0x20 || ins.opcode === 0x21) {
          expect(ins.args[0]?.code, `block ${id} @0x${toVaddr(ins.offset).toString(16)} operand kind`).toBe(0);
        }
      }
    }

    expect(totalInstructions).toBe(16547); // 16546 + block 8's one newly decoded instruction
  });

  it('B2. the ending question is dialect-proof: zero reachable 0x1D/0x22/0x2C sites', async () => {
    const ecl = await loadCorpus(NWN, ECL_ARCHIVES);
    let discriminators = 0;
    for (const [id, { raw }] of ecl) {
      const long = reachable(raw, ECL_GEN1);
      for (const ins of long.values()) {
        if (ins.opcode === 0x1d || ins.opcode === 0x22 || ins.opcode === 0x2c) discriminators++;
      }
      // The two dialects frame exactly those three opcodes differently. With none reachable,
      // the reachable-offset sets must be identical block for block.
      const short = reachable(raw, ECL_GEN1_SHORT);
      expect([...short.keys()].sort((a, b) => a - b), `block ${id} short-dialect reachable set`)
        .toEqual([...long.keys()].sort((a, b) => a - b));
    }
    expect(discriminators).toBe(0);
  });

  // -------------------------------------------------------------------------------------------
  // C. The four GEO-less blocks are overlays and one rescue cutscene, not endgame scripts
  // -------------------------------------------------------------------------------------------

  it('C1. 29 blocks LOAD_FILES their own id; 51/59/78/79 have no LOAD_FILES at all', async () => {
    const ecl = await loadCorpus(NWN, ECL_ARCHIVES);
    for (const [id, { raw }] of ecl) {
      const lf = [...new Set(immediates(reachable(raw), 0x21 /* LOAD_FILES */))];
      if (id === 51 || id === 59 || id === 78 || id === 79) {
        expect(lf, `block ${id} must have no LOAD_FILES`).toEqual([]);
      } else {
        expect(lf, `block ${id} LOAD_FILES`).toEqual([id]);
      }
    }
  });

  it('C2. 51/78/79 dispatch only descriptors that exist in their host area GEO', async () => {
    const ecl = await loadCorpus(NWN, ECL_ARCHIVES);
    const geo = await loadCorpus(NWN, GEO_ARCHIVES);

    /** Descriptors an overlay tests against the masked cell value [0x4C02]. */
    const dispatched = (raw: Uint8Array) => {
      const out = new Set<number>();
      for (const ins of reachable(raw).values()) {
        if (ins.opcode !== 0x03 /* COMPARE */) continue;
        const [a, b] = ins.args;
        if (a && b && a.code === 1 && a.word === 0x4c02 && b.code === 0) out.add(b.word);
      }
      return [...out].sort((x, y) => x - y);
    };
    /**
     * descriptor -> cells, from the GEO descriptor plane raw[514:770] indexed y*16+x.
     *
     * The `v & 0x7f` mask is applied to ANY non-zero byte, deliberately. The doc's §1 used to say
     * raw byte `128|d` marks a special cell with descriptor d, which reads as if the high bit were
     * what makes a cell dispatchable — this function silently adopted the looser reading and the
     * two contradicted each other (disclosed and reconciled 2026-08-05). The looser reading is the
     * right one: `ECL0.DAX#1`'s search_location forks on the RAW byte against #129 and sends
     * `< 129` to the street-sign table and `>= 129` to the doorway table, BOTH indexed on the
     * masked value. The high bit picks a table; it does not gate dispatchability. The plain-byte
     * cases are asserted explicitly below.
     */
    const geoDescriptors = (raw: Uint8Array) => {
      const map = new Map<number, Array<[number, number, number]>>();
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const v = raw[514 + y * 16 + x]!;
          if (!v) continue;
          const d = v & 0x7f;
          if (!map.has(d)) map.set(d, []);
          map.get(d)!.push([x, y, v]);
        }
      }
      return map;
    };

    const CASES: ReadonlyArray<readonly [number, number, number[]]> = [
      [51, 1, [36, 37]],
      [78, 28, [17, 19, 23, 26]],
      [79, 29, [7, 8, 9, 10, 12, 15, 19, 108, 114, 116, 121, 122, 124, 125, 127]],
    ];
    for (const [overlay, host, expected] of CASES) {
      const descs = dispatched(ecl.get(overlay)!.raw);
      expect(descs, `overlay ${overlay} dispatched descriptors`).toEqual(expected);
      const hostDescs = geoDescriptors(geo.get(host)!.raw);
      for (const d of descs) {
        expect(hostDescs.has(d), `overlay ${overlay} desc ${d} must exist in GEO#${host}`).toBe(true);
      }
    }

    // Exact cells, so this is anchored to bytes and not just to set membership.
    const g1 = geoDescriptors(geo.get(1)!.raw);
    expect(g1.get(36)).toEqual([[1, 11, 36], [1, 13, 36]]);
    expect(g1.get(37)).toEqual([[4, 0, 37]]);
    const g28 = geoDescriptors(geo.get(28)!.raw);
    expect(g28.get(17)).toEqual([[7, 11, 145]]);
    expect(g28.get(26)).toEqual([[11, 1, 154]]);
    const g29 = geoDescriptors(geo.get(29)!.raw);
    expect(g29.get(114)).toEqual([[1, 9, 242]]); // 242 = 128 | 114
    expect(g29.get(125)).toEqual([[1, 3, 253]]); // 253 = 128 | 125
    expect(g29.get(108)).toEqual([[9, 15, 236]]);

    // ---- THE `128|d` RECONCILIATION (added 2026-08-05) ------------------------------------------
    // The doc's §1 rule "raw byte 128|d marks a special cell with descriptor d" is contradicted by
    // these very bytes: overlay 51's 36/37 and overlay 79's 7/9/10 are dispatched and carry NO high
    // bit. Pinned so the strict rule cannot be restored without this failing.
    expect(g1.get(36)!.every(([, , v]) => (v & 0x80) === 0)).toBe(true);
    expect(g1.get(37)!.every(([, , v]) => (v & 0x80) === 0)).toBe(true);
    for (const d of [7, 9, 10]) {
      expect(g29.get(d), `GEO#29 desc ${d}`).toBeDefined();
      expect(g29.get(d)!.every(([, , v]) => (v & 0x80) === 0), `GEO#29 desc ${d} plain`).toBe(true);
    }
    expect(g29.get(7)).toEqual([[15, 7, 7]]);
    expect(g29.get(9)).toEqual([[14, 8, 9]]);
    expect(g29.get(10)).toEqual([[14, 5, 10]]);
    // ...while these DO carry it, so the plane genuinely mixes both forms within one block.
    for (const d of [108, 114, 116, 121, 122, 124, 125, 127]) {
      expect(g29.get(d)!.every(([, , v]) => (v & 0x80) !== 0), `GEO#29 desc ${d} high bit`).toBe(true);
    }

    // ---- WHAT THIS TEST DOES **NOT** SHOW (added 2026-08-05) -------------------------------------
    // RETRACTED: the doc presented "every dispatched descriptor present in the host GEO" as if it
    // identified the host. It does not — for two of the three overlays it gives the SAME answer
    // under the alternative it supposedly rules out. Measured over all 29 GEO blocks:
    const allGeo = [...geo.entries()].sort((a, b) => a[0] - b[0]);
    const satisfiedBy = (descs: number[]) =>
      allGeo.filter(([, g]) => {
        const m = geoDescriptors(g.raw);
        return descs.every((d) => m.has(d));
      }).map(([id]) => id);
    expect(allGeo.length).toBe(29);
    expect(satisfiedBy([36, 37])).toEqual([1]);                        // 1 of 29 — uniquely 51's host
    expect(satisfiedBy([17, 19, 23, 26])).toEqual([3, 12, 24, 25, 26, 28]);   // 6 of 29
    expect(satisfiedBy([7, 8, 9, 10, 12, 15, 19, 108, 114, 116, 121, 122, 124, 125, 127]))
      .toEqual([2, 3, 9, 10, 27, 29]);                                 // 6 of 29
    // Under the STRICT `128|d` reading the column would be worse still: GEO#1 satisfies NEITHER of
    // overlay 51's descriptors, i.e. the strict rule refutes the host assignment least in doubt.
    const strictSet = (raw: Uint8Array) => {
      const s = new Set<number>();
      for (let i = 514; i < 770; i++) if (raw[i]! & 0x80) s.add(raw[i]! & 0x7f);
      return s;
    };
    expect([...strictSet(geo.get(1)!.raw)].filter((d) => d === 36 || d === 37)).toEqual([]);

    // WHAT ACTUALLY PINS THE HOST is the on-entry LastEclBlockId guard and the NEWECL hand-back —
    // both already asserted in C3 — not the descriptor sets. Re-checked here at the same bytes so
    // this test carries its own attribution rather than deferring it.
    for (const [overlay, vaddr, host] of [[78, 0x801d, 28], [79, 0x8014, 29]] as const) {
      const ins = decodeInstructionAt(ecl.get(overlay)!.raw, toOffset(vaddr), ECL_GEN1.vbase, ECL_GEN1).ins!;
      expect(ins.opcode, `overlay ${overlay} guard opcode`).toBe(0x03); // COMPARE
      expect(ins.args[0]!.word, `overlay ${overlay} guard reads 0x4BF2`).toBe(0x4bf2);
      expect([ins.args[1]!.code, ins.args[1]!.word], `overlay ${overlay} guard host`).toEqual([0, host]);
      expect([...new Set(immediates(reachable(ecl.get(overlay)!.raw), 0x20))].sort((a, b) => a - b))
        .toEqual([28, 29]);
    }
    expect([...new Set(immediates(reachable(ecl.get(51)!.raw), 0x20))]).toEqual([1]);

    // Disclosure 2026-08-05 — descriptors DO NOT discriminate an ending, and this test must not be
    // read as if they did. Descriptor bytes are dense and reused on every map; there is no value
    // reserved corpus-wide for "campaign end". Measured here so the point is a number, not a claim:
    expect(g1.size).toBe(33);
    expect(g28.size).toBe(45);
    expect(g29.size).toBe(40);
    // What C2 establishes is only that these three blocks are *overlays of an existing map*, i.e.
    // not free-standing endgame scripts, and that their descriptor sets are CONSISTENT with (not
    // identifying of) their hosts. The map layer is otherwise silent on this leg.
  });

  it('C3. ECL5#59 is the only cutscene-shaped block, and it is a mid-campaign rescue', async () => {
    const ecl = await loadCorpus(NWN, ECL_ARCHIVES);

    /** Count of the cell-descriptor mask idiom: AND(0xC04F, #127) -> 0x4C02, either source order. */
    const maskSites = (raw: Uint8Array) => {
      let n = 0;
      for (const ins of reachable(raw).values()) {
        if (ins.opcode !== 0x2f /* AND */ || ins.args.length !== 3) continue;
        const [a, b, dest] = ins.args;
        if (!a || !b || !dest || dest.word !== 0x4c02) continue;
        const srcs = new Set([`${a.code}:${a.word}`, `${b.code}:${b.word}`]);
        if (srcs.has('0:127') && srcs.has(`1:${0xc04f}`)) n++;
      }
      return n;
    };

    const without: number[] = [];
    for (const [id, { raw }] of ecl) if (maskSites(raw) === 0) without.push(id);
    expect(without, 'exactly one block has no descriptor dispatch').toEqual([59]);

    const raw59 = ecl.get(59)!.raw;
    const header = parseEclHeader(raw59, ECL_GEN1);
    // initial_entry lands directly on a PRINTCLEAR, not on a dispatch trampoline.
    expect(header.eclInitialEntry).toBe(0x8018);
    const first = decodeInstructionAt(raw59, toOffset(0x8018), ECL_GEN1.vbase, ECL_GEN1).ins!;
    expect(first.opcode).toBe(0x12); // PRINTCLEAR
    expect(first.args.find((a) => a.code === 0x80)?.text)
      .toBe("'I AM WILLO CLOVYR, AND I THANK YOU");

    // It ends by handing control back to the block that invoked it.
    const last = decodeInstructionAt(raw59, toOffset(0x8440), ECL_GEN1.vbase, ECL_GEN1).ins!;
    expect(last.opcode).toBe(0x20); // NEWECL
    expect(last.args[0]!.code).toBe(0);
    expect(last.args[0]!.word).toBe(9);

    // ...and ECL0#9 is where it is invoked from — one call site, mid-graph.
    const callers: Array<[number, number]> = [];
    for (const [id, { raw }] of ecl) {
      for (const ins of reachable(raw).values()) {
        if (ins.opcode === 0x20 && ins.args[0]?.code === 0 && ins.args[0]?.word === 59) {
          callers.push([id, toVaddr(ins.offset)]);
        }
      }
    }
    expect(callers).toEqual([[9, 0x9ce1]]);

    // Both ECL7 overlays re-assert their host on entry via LastEclBlockId (0x4BF2).
    const guard = (raw: Uint8Array, vaddr: number, blockId: number) => {
      const ins = decodeInstructionAt(raw, toOffset(vaddr), ECL_GEN1.vbase, ECL_GEN1).ins!;
      expect(ins.opcode).toBe(0x03); // COMPARE
      expect(ins.args[0]!.word).toBe(0x4bf2);
      expect(ins.args[1]!.code).toBe(0);
      expect(ins.args[1]!.word).toBe(blockId);
    };
    guard(ecl.get(78)!.raw, 0x801d, 28);
    guard(ecl.get(79)!.raw, 0x8014, 29);
  });

  // -------------------------------------------------------------------------------------------
  // D. Text scan (filtered) + the ending predicate + the recall check that measures the filter
  // -------------------------------------------------------------------------------------------

  it('D1. 1,836 inline strings / 1,409 unique / 111,316 chars, and the exact 6-bit round-trip', async () => {
    const ecl = await loadCorpus(NWN, ECL_ARCHIVES);
    let total = 0;
    let totalChars = 0;
    let exact = 0;
    let prefixOnly = 0;
    let mismatched = 0;
    const unique = new Set<string>();
    for (const [, { raw }] of ecl) {
      for (const { off, text } of scanStrings(raw)) {
        total++;
        totalChars += text.length;
        unique.add(text);
        const n = raw[off + 1]!;
        const payload = raw.slice(off + 2, off + 2 + n);
        const re = encodeEclString(text);
        if (payload.length === re.length && payload.every((b, i) => b === re[i])) exact++;
        else if (payload.slice(0, re.length).every((b, i) => b === re[i])) prefixOnly++;
        else mismatched++;
      }
    }
    expect(total).toBe(1836);
    expect(unique.size).toBe(1409);
    // Corrected 2026-08-05: 96,542 is the character count of the 1,409 UNIQUE strings, not of all
    // 1,836 frames. Both are now pinned so neither can be quoted as the other.
    expect(totalChars).toBe(111316);
    expect([...unique].reduce((a, s) => a + s.length, 0)).toBe(96542);

    // Corrected 2026-08-05: this used to assert `roundTripped === 1836` under the comment "every
    // recovered string re-encodes to the exact retail bytes", but its comparison only checked a
    // PREFIX, so it could not distinguish exact from prefix and the doc's "1,836 / 1,836
    // byte-identical" was overstated. The true split: 1,827 byte-identical including the final
    // partial byte, 9 strict-prefix (the frame's declared length runs past the 6-bit terminator),
    // 0 mismatches. That is still a decoder proof — nothing decodes to bytes that are not there.
    expect(exact).toBe(1827);
    expect(prefixOnly).toBe(9);
    expect(mismatched).toBe(0);
    expect(exact + prefixOnly).toBe(1836);
  });

  it('D2. the ending-language predicate produces exactly 11 hits over the A+B union', async () => {
    // Corrected 2026-08-05. This test used to scan `scanStrings` alone and assert 10 hits, and it
    // called all ten false positives. Both were wrong: the filtered scan misses the corpus's one
    // real CONGRATULATIONS (ECL0#8 @0x14e9, 77.4 % letters, below the 85 % threshold). The union
    // with the instruction-aligned extraction finds it. It is still not a player ending — it is a
    // villain congratulating a villain, and the assertions below pin its neighbours to show that —
    // but "10 hits, every one a false positive" was a false statement and is retracted.
    const ecl = await loadCorpus(NWN, ECL_ARCHIVES);
    const seen = new Set<string>();
    const hits: Array<[string, number, number, string, string]> = [];
    for (const [id, { archive, raw }] of ecl) {
      for (const { off, text } of [...scanStrings(raw), ...alignedStrings(raw)]) {
        for (const term of predicateHits(text)) {
          const key = `${id}|${off}|${term}`;
          if (seen.has(key)) continue;
          seen.add(key);
          hits.push([archive, id, off, term, text]);
        }
      }
    }
    hits.sort((a, b) => a[1] - b[1] || a[2] - b[2]);

    const EXPECTED: ReadonlyArray<readonly [string, number, number, string, string]> = [
      ['ECL0.DAX', 1, 0x0d5e, 'THE END', 'ICE-COLD SEA OF SWORDS'],
      ['ECL0.DAX', 2, 0x0d97, 'GRATEFUL', "WE'RE GRATEFUL FOR YOUR"],
      ['ECL0.DAX', 8, 0x14e9, 'CONGRATULATIONS', 'CONGRATULATIONS'],
      ['ECL1.DAX', 12, 0x13b0, 'GRATEFUL', 'WELCOME TO TRIBOAR'],
      ['ECL1.DAX', 12, 0x1bff, 'THE END', 'A RING ON THE END OF IT'],
      ['ECL1.DAX', 15, 0x13d2, 'GRATEFUL', 'FREED THE GRATEFUL CAPTIVES'],
      ['ECL1.DAX', 17, 0x153a, 'THE END', 'STAIRWAY AT THE END OF THE ROOM'],
      ['ECL1.DAX', 17, 0x1687, 'IS NO MORE', 'IS NO MORE THAN 3 FEET HIGH'],
      ['ECL2.DAX', 29, 0x1151, 'THE END', 'THE MAZE WILL BE THE END OF YOU'],
      ['ECL5.DAX', 51, 0x0332, 'YOUR REWARD', 'HERE IS YOUR REWARD'],
      ['ECL5.DAX', 51, 0x0d5b, 'THE END', 'APPROACH THE END OF THE DOCK'],
    ];
    expect(hits.length).toBe(11);
    for (let i = 0; i < EXPECTED.length; i++) {
      const [archive, id, off, term, fragment] = EXPECTED[i]!;
      const [gotArchive, gotId, gotOff, gotTerm, gotText] = hits[i]!;
      expect([gotArchive, gotId, gotOff, gotTerm], `hit ${i}`).toEqual([archive, id, off, term]);
      // The surrounding sentence is what decides whether a hit is an ending or not.
      expect(gotText.replace(/\s+/g, ' '), `hit ${i} context`).toContain(fragment);
    }

    // The one non-trivial hit, read in place. ECL0#8 is an overheard Zhentarim conversation in
    // Luskan that ends in an ambush, so the CONGRATULATIONS is villain-to-villain.
    const block8 = ecl.get(8)!.raw;
    const scene = alignedStrings(block8).map((s) => s.text);
    const congrats = scene.filter((t) => t.includes('CONGRAT'));
    expect(congrats.length).toBe(1);
    expect(congrats[0]).toContain('MYTHKAR');
    expect(scene.some((t) => t.includes('GREETINGS, BAJYPH'))).toBe(true);
    expect(scene.some((t) => t.includes('CREATED THIS DARK PROPHECY'))).toBe(true);
    // It hands off to an ordinary mid-campaign block, not to a terminal.
    expect([...new Set(immediates(reachable(block8), 0x20 /* NEWECL */))]).toEqual([6]);
    // ...and the scene arms real encounters: 67 reachable LOAD_MONSTER in this block, laid out as
    // PICTURE + LOAD_MONSTER groups separated by GOTO right after the conversation ends (0x9B57 on).
    const lm = [...reachable(block8).values()].filter((i) => i.opcode === 0x0b /* LOAD_MONSTER */);
    expect(lm.length).toBe(67);
    expect(lm.some((i) => i.vaddr === 0x9b57)).toBe(true);
  });

  it('D3. no player-facing victory statement occurs anywhere in the A+B union', async () => {
    const ecl = await loadCorpus(NWN, ECL_ARCHIVES);
    const all: string[] = [];
    for (const [, { raw }] of ecl) {
      for (const { text } of [...scanStrings(raw), ...alignedStrings(raw)]) all.push(text.toUpperCase());
    }
    const joined = all.join('\u0000');
    // Corrected 2026-08-05: 'CONGRAT' was in this must-not-occur list, and the list was checked
    // against the FILTERED scan only — which is why the assertion passed while being false. It is
    // removed (CONGRAT occurs once, see D2) and every remaining phrase is now checked against the
    // union of both extractions, so these zeros are not shape-filter artefacts.
    for (const phrase of [
      'YOU HAVE WON', 'YOU WIN', 'YOUR QUEST IS', 'VICTORY IS YOURS',
      'QUEST IS OVER', 'ADVENTURE IS OVER', 'IN YOUR HONOR', 'HAILED AS', 'CELEBRATION',
    ]) {
      expect(joined.includes(phrase), `"${phrase}" must not occur`).toBe(false);
    }
    // The retracted one, pinned at its true value so the retraction cannot silently revert.
    expect(new Set(all.filter((t) => t.includes('CONGRAT'))).size).toBe(1);
  });

  it('D4. the filtered scan is NOT exhaustive: extraction B recovers 258 strings it drops', async () => {
    // Added 2026-08-05. Keeps the recall gap visible and bounded. Without it `scanStrings` looks
    // like a complete extraction and every absence claim built on it inherits an unmeasured hole —
    // which is exactly how the "CONGRAT occurs 0 times" error happened.
    const ecl = await loadCorpus(NWN, ECL_ARCHIVES);
    const a = new Set<string>();
    const b = new Map<string, string>();
    for (const [id, { raw }] of ecl) {
      for (const { off } of scanStrings(raw)) a.add(`${id}|${off}`);
      for (const { off, text } of alignedStrings(raw)) b.set(`${id}|${off}`, text);
    }
    expect(b.size).toBe(1980);
    const onlyB = [...b].filter(([k]) => !a.has(k));
    expect(onlyB.length).toBe(258);
    expect(onlyB.filter(([, t]) => t.length >= 12).length).toBe(78);

    // Real game text the shape filter throws away, quoted so the gap is concrete and not a number.
    const dropped = new Set(onlyB.map(([, t]) => t));
    for (const s of [
      "IT'S A FIGHT!",
      "'DANGER!  DO NOT ENTER!'",
      "SAYS 'IMPOUND AREA'.",
      'WHICH CANDLE DO YOU BLOW OUT? (1-13)',
      "'DO YOU WISH TO BUY A GEM FOR 250 GOLD OR A JEWEL FOR 2200 GOLD?'",
    ]) {
      expect(dropped.has(s), `extraction A should be shown to drop ${JSON.stringify(s)}`).toBe(true);
    }
    // Neither extraction subsumes the other: A also reaches bytes no CFG walk enters.
    expect([...a].filter((k) => !b.has(k)).length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------------------------
  // F. The GAME.OVR victory prompt: located, and shown to fire once per map block
  // -------------------------------------------------------------------------------------------

  it('F1. the FINAL/PIC/.dax literals and the victory string, as retail bytes', async () => {
    const ovr = new Uint8Array(await readFile(resolve(NWN, 'GAME.OVR')));
    const exe = new Uint8Array(await readFile(resolve(NWN, 'GAME.EXE')));
    expect(ovr.length).toBe(375300);
    expect(exe.length).toBe(51006);

    // Pascal literals: length byte, then text.
    expect(bytesAt(ovr, 0x4631f, 4)).toBe('03 50 49 43'); // \x03 "PIC"
    expect(bytesAt(ovr, 0x46323, 6)).toBe('05 46 49 4e 41 4c'); // \x05 "FINAL"
    expect(bytesAt(ovr, 0x46329, 5)).toBe('04 2e 64 61 78'); // \x04 ".dax"

    // The engine still knows the endgame archive name; nothing ever produces it.
    expect(countOccurrences(ovr, ascii('FINAL'))).toBe(1);
    expect(countOccurrences(exe, ascii('FINAL'))).toBe(0);
    expect(countOccurrences(ovr, Uint8Array.from([0x03, ...ascii('PIC')]))).toBe(5);
    expect(countOccurrences(ovr, Uint8Array.from([0x05, ...ascii('FINAL')]))).toBe(1);

    // The one victory-looking string in the binary.
    expect(ovr[0x4307]).toBe(0x22); // Pascal length 34
    expect(new TextDecoder('latin1').decode(ovr.slice(0x4308, 0x4308 + 0x22)))
      .toBe("You've won. Save before quitting? ");
    // Its structural counterpart, the death message.
    expect(ovr[0x36cf]).toBe(0x15);
    expect(new TextDecoder('latin1').decode(ovr.slice(0x36d0, 0x36d0 + 0x15)))
      .toBe('You have been killed!');

    // No denouement vocabulary anywhere in either binary.
    for (const w of ['CONGRATULAT', 'congratulat', 'epilogue', 'Epilogue', 'victory', 'Victory', 'THE END']) {
      expect(countOccurrences(ovr, ascii(w)), `OVR "${w}"`).toBe(0);
      expect(countOccurrences(exe, ascii(w)), `EXE "${w}"`).toBe(0);
    }
    // The three "Congratulations" that DO exist are the post-combat XP award.
    expect(new TextDecoder('latin1').decode(ovr.slice(0x46f3, 0x46f3 + 0x2b)))
      .toBe('Congratulations the party gains experience!');
    expect(new TextDecoder('latin1').decode(ovr.slice(0x825c, 0x825c + 0x16)))
      .toBe('You have won the duel.');
  });

  it('F2. the dispatch chain from ECL opcode 0x38 to the victory string, as retail bytes', async () => {
    const ovr = new Uint8Array(await readFile(resolve(NWN, 'GAME.OVR')));

    // The ECL opcode dispatcher at 0x48EF: prologue, then `mov al,[0xB577]` and a compare chain
    // covering ids 0x00..0x41 — exactly the Gen1 ECL opcode range.
    expect(bytesAt(ovr, 0x48ef, 3)).toBe('55 89 e5'); // push bp; mov bp,sp
    expect(bytesAt(ovr, 0x48f9, 3)).toBe('a0 77 b5'); // mov al,[0xB577]
    expect(bytesAt(ovr, 0x48fc, 2)).toBe('3c 00'); // cmp al,0 — first arm
    expect(bytesAt(ovr, 0x4b5c, 2)).toBe('3c 41'); // cmp al,0x41 — last arm

    // Opcode 0x38 is PROGRAM. Its arm calls 0x432A: e8 rel16 with rel = 0xF820 from 0x4B0A.
    expect(bytesAt(ovr, 0x4b02, 8)).toBe('3c 38 75 06 0e e8 20 f8');
    expect(0x4b0a + ((0xf820 << 16) >> 16)).toBe(0x432a);

    // 0x432A is a function that evaluates ONE ECL operand into al, then dispatches ids 0x00..0x11.
    expect(bytesAt(ovr, 0x432a, 3)).toBe('55 89 e5');
    expect(bytesAt(ovr, 0x4352, 11)).toBe('b0 01 50 9a 2a 00 81 00 b0 01 50'); // operand fetch pair
    expect(bytesAt(ovr, 0x435d, 5)).toBe('9a 25 00 81 00');
    expect(bytesAt(ovr, 0x4368, 2)).toBe('3c 00'); // first dispatched PROGRAM id

    // Four PROGRAM ids funnel into 0x4244 with kinds 0..3:
    //   cmp al,<id> / jne / mov al,<kind> / push ax / push cs / call 0x4244
    expect(bytesAt(ovr, 0x43df, 11)).toBe('3c 07 75 0a b0 00 50 0e e8 5a fe'); // #7  -> kind 0
    expect(bytesAt(ovr, 0x44cb, 11)).toBe('3c 0c 75 09 b0 01 50 0e e8 6e fd'); // #12 -> kind 1
    expect(bytesAt(ovr, 0x44d8, 11)).toBe('3c 0d 75 09 b0 02 50 0e e8 61 fd'); // #13 -> kind 2
    expect(bytesAt(ovr, 0x44e5, 11)).toBe('3c 0e 75 09 b0 03 50 0e e8 54 fd'); // #14 -> kind 3
    expect(0x43ea + ((0xfe5a << 16) >> 16)).toBe(0x4244);

    // 0x4244 gates on a per-kind byte table, then calls 0x404C.
    expect(bytesAt(ovr, 0x4244, 3)).toBe('55 89 e5');
    expect(bytesAt(ovr, 0x42fd, 4)).toBe('0e e8 4b fd'); // push cs; call 0x404C
    expect(0x4301 + ((0xfd4b << 16) >> 16)).toBe(0x404c);

    // The four 115-byte (0x73) tables, one per kind, in DGROUP.
    expect(bytesAt(ovr, 0x40d1, 3)).toBe('bf d4 e6'); // mov di,0xE6D4  (kind 0)
    expect(bytesAt(ovr, 0x40ea, 3)).toBe('bf bc e7'); // mov di,0xE7BC  (kind 1)
    expect(bytesAt(ovr, 0x4103, 3)).toBe('bf 48 e7'); // mov di,0xE748  (kind 2)
    expect(bytesAt(ovr, 0x411c, 3)).toBe('bf 30 e8'); // mov di,0xE830  (kind 3)
    expect(bytesAt(ovr, 0x40db, 3)).toBe('b8 73 00'); // mov ax,0x73 = 115 entries

    // 0x404C loads the victory string from cs:0x3637. The function's segment base is 0xCD0,
    // so 0xCD0 + 0x3637 = 0x4307 — the Pascal length byte of "You've won. …" asserted in F1.
    expect(bytesAt(ovr, 0x416e, 10)).toBe('bf 37 36 0e 57 9a c4 0e a5 06');
    expect(0x0cd0 + 0x3637).toBe(0x4307);
  });

  it('F3. PROGRAM #7/#12 fire once per map block, in the area-entry preamble', async () => {
    const ecl = await loadCorpus(NWN, ECL_ARCHIVES);
    const programCensus = new Map<number, number>();
    const blocksWithPair: number[] = [];
    let sevens = 0;
    let twelves = 0;
    let paired = 0;
    const unguarded: Array<[number, number, string]> = [];

    for (const [id, { raw }] of ecl) {
      const m = reachable(raw);
      const offs = [...m.keys()].sort((a, b) => a - b);
      let pairsHere = 0;
      for (let i = 0; i < offs.length; i++) {
        const ins = m.get(offs[i]!)!;
        if (ins.opcode !== 0x38 /* PROGRAM */) continue;
        const a = ins.args[0];
        if (!a || a.code !== 0) continue;
        programCensus.set(a.word, (programCensus.get(a.word) ?? 0) + 1);
        if (a.word === 12) twelves++;
        if (a.word !== 7) continue;
        sevens++;
        pairsHere++;
        const next = m.get(offs[i + 1]!);
        if (next?.opcode === 0x38 && next.args[0]?.code === 0 && next.args[0]?.word === 12) paired++;
        const prev = m.get(offs[i - 1]!);
        const isAreaSync =
          prev?.opcode === 0x09 /* SAVE */ &&
          prev.args[0]?.word === 0x4bca &&
          prev.args[1]?.word === 0x32c8;
        if (!isAreaSync) {
          const arg1 = prev?.args[1];
          unguarded.push([id, toVaddr(ins.offset), `${prev?.mnemonic} -> 0x${arg1?.word.toString(16)}`]);
        }
      }
      if (pairsHere) blocksWithPair.push(id);
    }

    expect(sevens).toBe(28);
    expect(twelves).toBe(28);
    expect(paired, 'every PROGRAM #7 is immediately followed by PROGRAM #12').toBe(28);
    // One pair in each of the 28 ordinary map blocks 2..30. Block 1 and all four overlays: none.
    expect(blocksWithPair.sort((a, b) => a - b)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
    ]);
    // 26 of 28 sit immediately after the area-id resync SAVE [0x4BCA] -> [0x32C8]; the two
    // exceptions write the adjacent byte 0x32C9 of the same variable.
    expect(unguarded).toEqual([
      [28, 0x812d, 'SAVE -> 0x32c9'],
      [29, 0x80ea, 'SAVE -> 0x32c9'],
    ]);

    // The corpus never uses PROGRAM #13 / #14 (kinds 2 and 3) at all.
    expect(programCensus.get(13)).toBeUndefined();
    expect(programCensus.get(14)).toBeUndefined();
    expect([...programCensus.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [0, 2], [2, 4], [4, 131], [5, 39], [6, 21], [7, 28], [11, 2], [12, 28], [16, 62], [17, 2],
    ]);
  });
});

// =============================================================================================
// E. Positive control — the same scanner and the same predicate on titles that DO have endings.
// =============================================================================================

describe.skipIf(!haveControl)('NWN ENDING leg — positive control on four sibling Gen1 titles', () => {
  const CONTROLS: ReadonlyArray<{
    title: string;
    dir: string;
    files: string[];
    strings: number;
    hits: number;
    proof: Array<{ archive: string; blockId: number; fragment: string }>;
  }> = [
    {
      title: 'Pool of Radiance',
      dir: 'Pool of Radiance/POOLRAD',
      files: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `ECL${i}.DAX`),
      strings: 1937,
      hits: 17,
      proof: [{ archive: 'ECL3.DAX', blockId: 8, fragment: 'CONGRATULATIONS! YOUR QUEST IS OVER!' }],
    },
    {
      title: 'Curse of the Azure Bonds',
      dir: 'Curse of the Azure Bonds',
      files: [1, 2, 3, 4, 5, 6].map((i) => `ECL${i}.DAX`),
      strings: 2495,
      hits: 12,
      proof: [
        { archive: 'ECL4.DAX', blockId: 35, fragment: 'CONGRATULATIONS, YOU HAVE WON' },
        { archive: 'ECL1.DAX', blockId: 81, fragment: 'ARE HELD IN YOUR HONOR' },
      ],
    },
    {
      title: 'Secret of the Silver Blades',
      dir: 'Secret of the Silver Blades',
      files: [1, 2, 3].map((i) => `ECL${i}.DAX`),
      strings: 1687,
      hits: 7,
      proof: [{ archive: 'ECL1.DAX', blockId: 16, fragment: 'YOU WILL BE HEROES HERE FOREVER' }],
    },
    {
      title: 'Champions of Krynn',
      dir: 'Champions of Krynn',
      files: [1, 2, 3].map((i) => `ECL${i}.DAX`),
      strings: 2333,
      hits: 8,
      proof: [
        { archive: 'ECL1.DAX', blockId: 17, fragment: 'CONGRATULATIONS ON RECOVERING THE DRAGON EGGS' },
        { archive: 'ECL3.DAX', blockId: 98, fragment: 'HONORED IN SONG AND LEGEND FOREVER' },
      ],
    },
  ];

  for (const c of CONTROLS) {
    it(`E. ${c.title}: the identical predicate lands on its real ending`, async () => {
      let total = 0;
      const found: Array<{ archive: string; blockId: number; text: string }> = [];
      for (const f of c.files) {
        const path = resolve(GOG, c.dir, f);
        if (!existsSync(path)) continue;
        for (const b of readDaxDataBlocks(new Uint8Array(await readFile(path)))) {
          for (const { text } of scanStrings(b.raw)) {
            total++;
            if (predicateHits(text).length) found.push({ archive: f, blockId: b.blockId, text });
          }
        }
      }
      expect(total, `${c.title} strings scanned`).toBe(c.strings);
      expect(found.length, `${c.title} predicate hits`).toBe(c.hits);
      for (const p of c.proof) {
        const hit = found.find(
          (h) => h.archive === p.archive && h.blockId === p.blockId && h.text.includes(p.fragment),
        );
        expect(hit, `${c.title} ${p.archive}#${p.blockId} "${p.fragment}"`).toBeDefined();
      }
    });
  }
});
