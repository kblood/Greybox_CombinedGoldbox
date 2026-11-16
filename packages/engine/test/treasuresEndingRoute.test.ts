/**
 * Golden: Treasures of the Savage Frontier's ENDING leg — `ECL1.DAX#38`, the Freezefire lair.
 *
 * WHAT THIS TEST ESTABLISHES
 *   - `GEO1.DAX#38` has exactly two cells whose descriptor masks to 121 ((2,6) and (3,6), raw
 *     0xF9), and block 38's `search_location` dispatches masked-descriptor 121 to vaddr 0x9227.
 *   - Running the REAL `EclVm` from that cell plays the campaign's terminal sequence end to end:
 *     the blackrobe ambush, the Amanitas cinematic, the revived dragon FREEZFIRE, the victory at
 *     0x9F41, the denouement, two treasure awards, the game's last line at 0xA31D, and
 *     `NEWECL #51` with the spawn quad (facing 3, x 7, y 1, area 54).
 *   - `[0x025C]` — set once at 0x9F3B, immediately after the dragon dies — has exactly ONE writer
 *     in the entire 30-block corpus and is read by three OTHER blocks (19, 33, 51). Proven here by
 *     a raw byte scan that uses no control-flow model at all.
 *   - Closing this chain needs two Treasures-only operand-frame corrections beyond the shipped
 *     `ECL_GEN1_SHORT_TREASURES` dialect: `0x27` is `wordSet 4 / countAt 3` (not 8) and `0x37` is
 *     the two-operand party-name lookup (not three-operand LOAD_PIECES). The count-ladder proof
 *     for `0x27` and the required negative control (what the shipped dialect does instead) are
 *     both asserted below.
 *
 * WHAT THIS TEST DOES **NOT** ESTABLISH
 *   - It does not prove the `0x27` frame from Treasures' own `GAME.OVR` handler bytes. The
 *     evidence is corpus-structural (the ECL1#47 count ladder, zero illegal operand codes, a 99/99
 *     "always followed by COMBAT or RETURN" invariant, and a cross-title control). See §1 and §10
 *     of docs/engine/research/treasures-ending-route.md.
 *   - It does not establish the *semantics* of `0x27`'s operands ("coins + item list" is an
 *     inference), so it asserts the decoded instruction shape, never the VM's `treasure` payload.
 *   - It does not prove how the party reaches the Ice Peak map in the first place — only that a
 *     legal 6-step path exists inside GEO1#38 from that map's own re-entry cell (7,8) to (3,6).
 *   - It does not verify any rendering (pictures #241..#245, #167) or run anything under DOSBox.
 *   - `[0x0034]/[0x0035]` = party X/Y, `[0x0239]` = a progress counter, and monster id 28
 *     (DWARF HERO) being an ALLY are all inferences, flagged as such in the research doc. This
 *     test only pins the values the retail bytes and the real VM actually produce.
 *
 * Full byte evidence, the corpus-wide census of all 30 blocks, the rejected candidates and the
 * measured recall of the filtered-text alternative live in
 * `docs/engine/research/treasures-ending-route.md`.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dialogueForCell,
  decodeMonsterArchive,
  readDaxDataBlocks,
  decodeInstructionAt,
  parseEclHeader,
  ECL_GEN1_SHORT_TREASURES,
  type EclDialect,
} from '../src/index.js';

const root = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier';
const eclPath = resolve(root, 'ECL1.DAX');
const geoPath = resolve(root, 'GEO1.DAX');
const monPath = resolve(root, 'MON1CHA.DAX');
const haveRetail = existsSync(eclPath) && existsSync(geoPath) && existsSync(monPath);

/** Gen1 addressing for this title: file offset = vaddr - 0x8000 + 2. */
const VADDR_ADDEND = 0x8000;
const off = (vaddr: number) => vaddr - VADDR_ADDEND + 2;
const hex = (raw: Uint8Array, vaddr: number, len: number) =>
  [...raw.slice(off(vaddr), off(vaddr) + len)].map((b) => b.toString(16).padStart(2, '0')).join(' ');

/**
 * Treasures' corrected ECL frame. Two deltas on top of the shipped dialect:
 *   0x27 — three fixed operands, then a COUNT, then `count` more (proven by ECL1#47's 1..8 ladder,
 *          asserted in test C below).
 *   0x37 — the two-operand inline-name party lookup. The engine's VM keys that behaviour off the
 *          mnemonic `POOLS_FIND_CHARACTER` (vm.ts case 0x37), which is why that exact string is
 *          used here; Pools' own GAME.OVR+0x1eca handler is the proven reference for the contract.
 */
const ENDING_DIALECT: EclDialect = {
  ...ECL_GEN1_SHORT_TREASURES,
  opcodeOverrides: {
    ...ECL_GEN1_SHORT_TREASURES.opcodeOverrides,
    0x27: { wordSet: 4, mnemonic: 'TREASURE', countAt: 3 },
    0x37: { wordSet: 2, mnemonic: 'POOLS_FIND_CHARACTER' },
  },
};

async function eclBlock(blockId: number): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(eclPath)));
  return blocks.find((b) => b.blockId === blockId)!.raw;
}
async function geoBlock(blockId: number): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(geoPath)));
  return blocks.find((b) => b.blockId === blockId)!.raw;
}

/**
 * Decoded CFG walk from all five header far-pointers, returning the sorted set of IMMEDIATE
 * `NEWECL` (0x20) targets that are actually reachable. Added 2026-08-06 to replace a raw
 * `20 00 ??` byte scan, which produced false positives (block 17 yields {16,24,27} raw, but only
 * #16 is reachable).
 *
 * Control-flow model mirrors `tools/gen1_ecl_encounter_scan.successors()`: 0x00 EXIT / 0x13
 * RETURN / 0x20 NEWECL are terminal; 0x16..0x1B conditionals GUARD the next instruction, so both
 * "execute it" and "skip it" are successors (this is why a naive linear walk that stops at the
 * first EXIT reaches only ~60 of block 17's instructions instead of 560); 0x01 GOTO takes its
 * target; 0x02 GOSUB takes target + fall-through; 0x25/0x26 take fall-through + all `count`
 * targets.
 */
function reachableNewEclTargets(raw: Uint8Array, dialect: EclDialect = ENDING_DIALECT): number[] {
  const vbase = dialect.vbase!;
  const header = parseEclHeader(raw, dialect);
  const queue = [
    header.vmRun1,
    header.searchLocation,
    header.preCampCheck,
    header.campInterrupted,
    header.eclInitialEntry,
  ].map((v) => v - vbase);
  const seen = new Set<number>();
  const targets = new Set<number>();
  const push = (o: number) => {
    if (o >= 0 && o < raw.length) queue.push(o);
  };
  const targetOf = (a: { code: number; word: number } | undefined) =>
    a && a.code === 0x01 && a.word >= vbase && a.word - vbase < raw.length ? a.word - vbase : undefined;

  while (queue.length) {
    const pos = queue.pop()!;
    if (pos < 0 || pos >= raw.length || seen.has(pos)) continue;
    seen.add(pos);
    const dec = decodeInstructionAt(raw, pos, vbase, dialect);
    if (dec.badOpcode || !dec.ins) continue;
    const ins = dec.ins;
    const op = ins.opcode;
    if (op === 0x20) {
      if (ins.args[0]?.code === 0x00) targets.add(ins.args[0].word);
      continue;
    }
    if (op === 0x00 || op === 0x13) continue;
    if (op === 0x01) {
      const t = targetOf(ins.args[0]);
      push(t !== undefined ? t : dec.next);
      continue;
    }
    if (op === 0x02) {
      const t = targetOf(ins.args[0]);
      if (t !== undefined) push(t);
      push(dec.next);
      continue;
    }
    if (op >= 0x16 && op <= 0x1b) {
      push(dec.next);
      const guarded = decodeInstructionAt(raw, dec.next, vbase, dialect);
      if (guarded.ins) push(dec.next + guarded.ins.size);
      continue;
    }
    if (op === 0x25 || op === 0x26) {
      push(dec.next);
      const count = ins.args[1]?.word ?? 0;
      for (const a of ins.args.slice(2, 2 + count)) {
        const t = targetOf(a);
        if (t !== undefined) push(t);
      }
      continue;
    }
    push(dec.next);
  }
  return [...targets].sort((a, b) => a - b);
}

/** Drive block 38's SearchLocation from a lair cell, answering `victory` to every COMBAT. */
function driveEnding(
  raw: Uint8Array,
  dialect: EclDialect,
  opts: { x?: number; memory?: Map<number, number>; findCharacter?: (n: string) => { index: number; inCombat: boolean } | null } = {},
) {
  const memory = opts.memory ?? new Map<number, number>();
  const runner = dialogueForCell(raw, 0xf9, {
    memory,
    facing: 'west',
    dialect,
    seedMemory: { 0x0020: 6, 0x0034: opts.x ?? 3, 0x0035: 6 },
    ...(opts.findCharacter ? { findCharacter: opts.findCharacter } : {}),
  })!;
  const kinds: string[] = [];
  const combats: Array<{ monsters: unknown; setup: unknown }> = [];
  let text = '';
  let turn = runner.start() as any;
  let chainBlockId: number | undefined;
  for (let i = 0; i < 24; i++) {
    kinds.push(turn.kind);
    if (turn.text) text += (text ? ' ' : '') + turn.text;
    if (turn.kind === 'combat') {
      combats.push({ monsters: turn.monsters, setup: turn.setup });
      turn = runner.afterCombat('victory');
      continue;
    }
    if (turn.kind === 'say') {
      turn = runner.choose(0);
      continue;
    }
    if (turn.kind === 'chain') chainBlockId = turn.blockId;
    break;
  }
  return { runner, memory, kinds, combats, text, chainBlockId };
}

describe.skipIf(!haveRetail)('Treasures of the Savage Frontier — ENDING leg (ECL1.DAX#38)', () => {
  // ---------------------------------------------------------------- A: GEO ground truth
  it('A. GEO1#38 has exactly two descriptor-121 cells, (2,6) and (3,6), both raw 0xF9', async () => {
    const geo = await geoBlock(38);
    expect(geo.length).toBe(1026); // Gen1 GEO block: 16x16
    const desc = geo.slice(514, 770);
    const hits: Array<[number, number, number]> = [];
    for (let i = 0; i < 256; i++) {
      if ((desc[i] & 0x7f) === 121) hits.push([i % 16, Math.floor(i / 16), desc[i]]);
    }
    expect(hits).toEqual([
      [2, 6, 0xf9],
      [3, 6, 0xf9],
    ]);
    // No other descriptor value in the map masks to 121 (the two hits are the same raw byte).
    expect(new Set(hits.map((h) => h[2])).size).toBe(1);
  });

  // ------------------------------------------------- B: the search_location dispatch arithmetic
  it('B. block 38 dispatches masked-descriptor 121 to vaddr 0x9227', async () => {
    const raw = await eclBlock(38);
    const header = parseEclHeader(raw, ECL_GEN1_SHORT_TREASURES);
    expect(header.searchLocation).toBe(0x85f9);

    // AND #127, [0x002d] -> [0x009a]   (Treasures reads its descriptor from 0x002d, not 0xc04f)
    expect(hex(raw, 0x8610, 9)).toBe('2f 00 7f 01 2d 00 01 9a 00');
    // SUBTRACT #121, [0x009a] -> [0x00bf]   (SUBTRACT is op2 - op1, so [00bf] = desc&0x7f - 121)
    expect(hex(raw, 0x866d, 9)).toBe('05 00 79 01 9a 00 01 bf 00');
    // ON_GOTO [0x00bf], 7 targets — 0-based, so index 0 (descriptor 121) is the first target.
    const onGoto = decodeInstructionAt(raw, off(0x8676), 0x7ffe, ECL_GEN1_SHORT_TREASURES);
    expect(onGoto.ins?.mnemonic).toBe('ON_GOTO');
    expect(onGoto.ins?.args[1]?.word).toBe(7);
    expect(onGoto.ins?.args.slice(2).map((a) => a.word)).toEqual([
      0x9227, 0xa41a, 0xa5b6, 0xa6c1, 0xa789, 0xa7a9, 0xa849,
    ]);
  });

  // ------------------------------------------- C: the count ladder that fixes the 0x27 frame
  it('C. ECL1#47 holds an 8-rung 0x27 count ladder that fixes wordSet 4 / countAt 3', async () => {
    const raw = await eclBlock(47);
    const rungs = [0x9e4b, 0x9e57, 0x9e65, 0x9e75, 0x9e87, 0x9e9b, 0x9eb1, 0x9ec9];
    rungs.forEach((vaddr, i) => {
      const n = i + 1;
      // Raw bytes: 27, three `00 00` immediates, `00 n`, then exactly n copies of `00 9e`, then RETURN.
      const expected = ['27', '00', '00', '00', '00', '00', '00', '00', n.toString(16).padStart(2, '0')]
        .concat(Array.from({ length: n }, () => ['00', '9e']).flat())
        .concat(['13'])
        .join(' ');
      expect(hex(raw, vaddr, 10 + 2 * n)).toBe(expected);

      // …and the corrected dialect decodes exactly that, landing on the RETURN.
      const d = decodeInstructionAt(raw, off(vaddr), 0x7ffe, ENDING_DIALECT);
      expect(d.ins?.mnemonic).toBe('TREASURE');
      expect(d.ins?.args.length).toBe(4 + n);
      expect(d.ins?.args[3]?.word).toBe(n);
      expect(d.ins?.args.slice(4).map((a) => a.word)).toEqual(Array.from({ length: n }, () => 158));
      expect(d.next + 0x7ffe).toBe(vaddr + 9 + 2 * n);
      expect(raw[d.next]).toBe(0x13); // RETURN
    });
  });

  // ------------------------------------------ D: the shipped frame desyncs at the ending's TREASURE
  it('D. at 0xA1A4 the SHIPPED frame now lands on COMBAT; the old flat frame ran off the code', async () => {
    const raw = await eclBlock(38);
    expect(hex(raw, 0xa1a4, 10)).toBe('27 02 98 3a 00 fa 00 28 00 00');
    const legal = new Set([0, 1, 2, 3, 0x80, 0x81]);

    // UPDATED 2026-09-04 (round 33 Phase B). Until then `ECL_GEN1_SHORT_TREASURES` had no `0x27`
    // override and this test asserted that the SHIPPED dialect ran off the code here — i.e. it
    // pinned a known decode desync in retail bytes as the shipped behaviour, while a test-local
    // `ENDING_DIALECT` next to it decoded the same bytes correctly. The frame has now shipped, so
    // the two agree and the roles are reversed: the shipped dialect is asserted CORRECT, and the
    // pre-fix behaviour is reproduced from an explicit local dialect so the evidence for why the
    // fix was needed survives, and so reverting the frame turns this red again.
    const LEGACY_FLAT: EclDialect = (() => {
      const { 0x27: _dropped, ...rest } = ECL_GEN1_SHORT_TREASURES.opcodeOverrides ?? {};
      return { ...ECL_GEN1_SHORT_TREASURES, opcodeOverrides: rest };
    })();

    const legacy = decodeInstructionAt(raw, off(0xa1a4), 0x7ffe, LEGACY_FLAT);
    expect(legacy.ins?.size).toBe(18);
    expect(legacy.next + 0x7ffe).toBe(0xa1b6);
    // Three of the eight operands carry impossible operand-code bytes (legal: 0,1,2,3,0x80,0x81)…
    expect(legacy.ins!.args.filter((a) => !legal.has(a.code)).map((a) => a.code)).toEqual([
      0x24, 0x12, 0x70,
    ]);
    // …and the byte it lands on is not an opcode at all, so the stream dies there.
    expect(raw[off(0xa1b6)]).toBe(0x61);
    expect(decodeInstructionAt(raw, off(0xa1b6), 0x7ffe, LEGACY_FLAT).badOpcode).toBe(true);

    // The shipped dialect now decodes it the way the handler at GAME.OVR 0x1afd reads it.
    const shipped = decodeInstructionAt(raw, off(0xa1a4), 0x7ffe, ECL_GEN1_SHORT_TREASURES);
    expect(shipped.ins?.size).toBe(10);
    expect(shipped.ins?.args.map((a) => a.word)).toEqual([0x3a98, 250, 40, 0]);
    expect(shipped.next + 0x7ffe).toBe(0xa1ae);
    expect(raw[shipped.next]).toBe(0x24); // COMBAT
    expect(shipped.ins!.args.every((a) => legal.has(a.code))).toBe(true);

    // …and it is now indistinguishable from the test-local corrected dialect, which is the point.
    const fixed = decodeInstructionAt(raw, off(0xa1a4), 0x7ffe, ENDING_DIALECT);
    expect(fixed.ins?.size).toBe(shipped.ins?.size);
    expect(fixed.next).toBe(shipped.next);
  });

  // ------------------------------------------------- E: the real VM plays the ending end to end
  it('E. the real VM runs the whole terminal sequence and chains to block 51', async () => {
    const raw = await eclBlock(38);
    const { runner, memory, kinds, text, chainBlockId } = driveEnding(raw, ENDING_DIALECT);

    // Two real fights, then the two empty-roster CLEARMONSTERS/TREASURE/COMBAT loot awards.
    expect(kinds).toEqual(['combat', 'combat', 'combat', 'combat', 'chain']);
    expect(chainBlockId).toBe(51);
    expect(runner.isDone()).toBe(true);

    expect(text).toContain("THIS MUST BE IT--FREEZEFIRE'S LAIR!");
    expect(text).toContain('YOUR %5ENEMIES %7HAVE BEATEN YOU TO THE TREASURE');
    expect(text).toContain('AMANITAS SAYS, EXAMINING HIS PROJECTED IMAGE');
    expect(text).toContain('THE WITHERED %FDRAGON %AHAS RETURNED TO LIFE!');
    expect(text).toContain(
      "%7FREEZEFIRE'S DEAD BODY LIES AT YOUR FEET! YOU HAVE DESTROYED YOUR BLACKROBED ENEMIES!",
    );
    expect(text).toContain('%E...AFTER THE PARTY IS REWARDED!');
    expect(text).toContain('LUSKAN HAS WITHDRAWN ALL FORCES ATTACKING THE LORDS');
    expect(text).toContain("THE HEROES OF ASCORE ARE NOW 'THE HEROES OF THE NORTH'");

    // The game's last line, and the fact that nothing follows it.
    expect(text.endsWith('IT HAS, INDEED, BEEN GLORIOUS!')).toBe(true);

    // Terminal writes.
    expect(memory.get(0x025c)).toBe(1); // campaign-terminal latch
    expect(memory.get(0x0056)).toBe(0); // set 1 at 0xA19D, cleared at 0xA2F2
    expect([0x02eb, 0x02ec, 0x02ed, 0x02ee].map((a) => memory.get(a))).toEqual([3, 7, 1, 54]);
  });

  // -------------------------------------------------------- F: the required negative control
  it('F. NEGATIVE CONTROL — the old flat frame truncated the ending mid-denouement', async () => {
    const raw = await eclBlock(38);
    // UPDATED 2026-09-04 (round 33 Phase B): the control now runs against an explicit local
    // reconstruction of the pre-fix frame rather than against the shipped dialect, because the
    // shipped dialect is the fixed one. What this test measures is unchanged — how much of the
    // real ending the flat frame destroys — and it still fails if the frame is reverted, because
    // `fixed` is the shipped dialect and the two would then coincide.
    const LEGACY_FLAT: EclDialect = (() => {
      const { 0x27: _dropped, ...rest } = ECL_GEN1_SHORT_TREASURES.opcodeOverrides ?? {};
      return { ...ECL_GEN1_SHORT_TREASURES, opcodeOverrides: rest };
    })();

    const fixed = driveEnding(raw, ECL_GEN1_SHORT_TREASURES);
    const legacy = driveEnding(raw, LEGACY_FLAT);

    // It looked plausible: both fights played and the terminal latch was even set…
    expect(legacy.kinds).toEqual(['combat', 'combat', 'end']);
    expect(legacy.memory.get(0x025c)).toBe(1);
    // …but it stopped at the fifth denouement beat and never reached the end of the game.
    expect(legacy.text.endsWith('%E...AFTER THE PARTY IS REWARDED!')).toBe(true);
    expect(legacy.text).not.toContain('IT HAS, INDEED, BEEN GLORIOUS!');
    expect(legacy.chainBlockId).toBeUndefined();
    expect(legacy.memory.get(0x0056)).toBe(1); // never cleared
    expect([0x02eb, 0x02ec, 0x02ed, 0x02ee].map((a) => legacy.memory.get(a))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    // The correction is worth ~570 characters of retail narration, all of it the actual ending —
    // and as of this round the players of Treasures in this engine actually get it.
    expect(fixed.text.length).toBeGreaterThan(legacy.text.length + 500);
    expect(fixed.kinds).toEqual(['combat', 'combat', 'combat', 'combat', 'chain']);
    expect(fixed.chainBlockId).toBe(51);
    expect(fixed.text).toContain('IT HAS, INDEED, BEEN GLORIOUS!');
  });

  // ------------------------------------------------------------------ G: the two combats
  it('G. both ending combats carry their retail rosters, and the two lair cells differ', async () => {
    const raw = await eclBlock(38);
    const from3 = driveEnding(raw, ENDING_DIALECT, { x: 3 });
    const from2 = driveEnding(raw, ENDING_DIALECT, { x: 2 });

    // Combat 1 — the blackrobe ambush. Identical roster from either cell…
    const wave1 = [
      { monsterId: 28, count: 3, picBlockId: 28 },
      { monsterId: 127, count: 1, picBlockId: 127 },
      { monsterId: 112, count: 1, picBlockId: 112 },
      { monsterId: 126, count: 1, picBlockId: 126 },
      { monsterId: 28, count: 3, picBlockId: 28 },
      { monsterId: 127, count: 1, picBlockId: 127 },
      { monsterId: 112, count: 1, picBlockId: 112 },
      { monsterId: 126, count: 1, picBlockId: 126 },
      { monsterId: 28, count: 3, picBlockId: 28 },
      { monsterId: 127, count: 5, picBlockId: 127 },
      { monsterId: 112, count: 4, picBlockId: 112 },
      { monsterId: 126, count: 4, picBlockId: 126 },
    ];
    expect(from3.combats[0].monsters).toEqual(wave1);
    expect(from2.combats[0].monsters).toEqual(wave1);

    // …but the placement fork at 0x9415 (`COMPARE [0034],#2`) makes the setup differ by cell.
    expect(hex(raw, 0x9415, 6)).toBe('03 01 34 00 00 02');
    expect((from3.combats[0].setup as any).extra).toBe(11);
    expect((from2.combats[0].setup as any).extra).toBe(15);
    expect((from3.combats[0].setup as any).spriteId).toBe(112);

    // Combat 2 — the revived dragon.
    expect(from3.combats[1].monsters).toEqual([
      { monsterId: 28, count: 5, picBlockId: 28 },
      { monsterId: 28, count: 3, picBlockId: 28 },
      { monsterId: 88, count: 1, picBlockId: 88 },
    ]);
    expect((from3.combats[1].setup as any).spriteId).toBe(255);
    expect(hex(raw, 0x9f2b, 7)).toBe('0b 00 58 00 01 00 58'); // LOAD_MONSTER #88, #1, #88

    // Combats 3 and 4 are the loot awards: CLEARMONSTERS; TREASURE; COMBAT with no roster.
    expect(from3.combats[2].monsters).toEqual([]);
    expect(from3.combats[3].monsters).toEqual([]);
    expect(hex(raw, 0xa1a3, 1)).toBe('1c'); // CLEARMONSTERS immediately before 0xA1A4
    expect(hex(raw, 0xa275, 9)).toBe('27 00 00 00 14 00 14 00 00'); // the second TREASURE
  });

  // ------------------------------------------------------------ H: difficulty scaling
  it('H. [0x0239] scales the ambush, exactly as the DIVIDE/ADD chain at 0x949D says', async () => {
    const raw = await eclBlock(38);
    // DIVIDE [0239], #5 -> [00c8] ; ADD #5,[00c8] -> [00c7] ; ADD #4,[00c8] -> [00c8]
    expect(hex(raw, 0x949d, 9)).toBe('06 01 39 02 00 05 01 c8 00');
    for (const [flag, master, spy] of [
      [0, 5, 4],
      [25, 10, 9],
      [60, 17, 16],
      [99, 24, 23],
    ]) {
      const memory = new Map<number, number>([[0x0239, flag]]);
      const { combats } = driveEnding(raw, ENDING_DIALECT, { memory });
      expect((combats[0].monsters as any[]).slice(-3)).toEqual([
        { monsterId: 127, count: master, picBlockId: 127 },
        { monsterId: 112, count: spy, picBlockId: 112 },
        { monsterId: 126, count: spy, picBlockId: 126 },
      ]);
    }
  });

  // ------------------------------------------------------- I: the NPC-conditioned variants
  it('I. GAUHOK/KRIIADOR presence selects four distinct confrontation branches', async () => {
    const raw = await eclBlock(38);
    // FIND_CHARACTER "GAUHOK" -> [00c0], then COMPARE [00c0],#7 / IF_GT.
    expect(hex(raw, 0x96ba, 11)).toBe('37 80 05 1c 15 48 3c b0 01 c0 00');
    expect(hex(raw, 0x96d1, 7)).toBe('03 01 c0 00 00 07 19');

    const present = (who: string) => (n: string) =>
      n === who ? { index: 2, inCombat: true } : null;

    // Both absent (host answers "not in party" for every name → 0xFF > 7 twice).
    const none = driveEnding(raw, ENDING_DIALECT, { findCharacter: () => null });
    expect(none.text).not.toContain('GAUHOK AND KRIIADOR EYE EACH OTHER');
    expect(none.text).not.toContain('THE LEGENDARY HOARD OF FREEZEFIRE');
    expect(none.text).toContain('SUDDENLY, BEFORE YOUR VERY EYES,');

    const gauhok = driveEnding(raw, ENDING_DIALECT, { findCharacter: present('GAUHOK') });
    expect(gauhok.text).toContain('MY ANCESTORS, I CAN FEEL THEM HERE');

    const kriiador = driveEnding(raw, ENDING_DIALECT, { findCharacter: present('KRIIADOR') });
    expect(kriiador.text).toContain('THE LEGENDARY HOARD OF FREEZEFIRE');

    // No host bridge at all → neither lookup writes, both stay 0 (<= 7) → the both-present arm.
    const both = driveEnding(raw, ENDING_DIALECT);
    expect(both.text).toContain('GAUHOK AND KRIIADOR EYE EACH OTHER WARILY');

    // All four converge on the same cinematic.
    for (const run of [none, gauhok, kriiador, both]) {
      expect(run.text).toContain('AMANITAS SAYS, EXAMINING HIS PROJECTED IMAGE');
      expect(run.chainBlockId).toBe(51);
    }
  });

  // --------------------------------------------------------- J: the boss is the archive extreme
  it('J. FREEZFIRE (MON1CHA #88) is the unique best AC and THAC0 of all 102 records', async () => {
    const recs = decodeMonsterArchive(
      new Uint8Array(await readFile(monPath)),
      'treasures-of-the-savage-frontier',
    ) as any[];
    expect(recs.length).toBe(102);
    const boss = recs.find((r) => r.blockId === 88)!;
    expect(boss.name).toBe('FREEZFIRE');
    expect(boss.armorClass).toBe(-4);
    expect(boss.thac0).toBe(4);
    expect(recs.filter((r) => r.armorClass <= boss.armorClass).map((r) => r.blockId)).toEqual([88]);
    expect(recs.filter((r) => r.thac0 <= boss.thac0).map((r) => r.blockId)).toEqual([88]);

    expect(recs.find((r) => r.blockId === 112)!.name).toBe('BLACKROBED SPY');
    expect(recs.find((r) => r.blockId === 126)!.name).toBe('BLACKROBED MAGE');
    expect(recs.find((r) => r.blockId === 127)!.name).toBe('BLKROBED MASTER');
    expect(recs.find((r) => r.blockId === 28)!.name).toBe('DWARF HERO');
  });

  // ------------------------------- K: the terminal latch, proven without a control-flow model
  it('K. [0x025C] has exactly one writer corpus-wide and three cross-block readers', async () => {
    const blocks = readDaxDataBlocks(new Uint8Array(await readFile(eclPath)));
    expect(blocks.length).toBe(30);
    expect(blocks.map((b) => b.blockId)).toEqual([
      4, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38,
      39, 40, 47, 49, 50, 51,
    ]);

    // A three-byte operand referring to 0x025C is `{01|02|03|81} 5c 02`. Scan every byte of every
    // block — no disassembly, no reachability model, nothing that could hide a site.
    const sites: Array<{ blockId: number; vaddr: number }> = [];
    for (const b of blocks) {
      for (let i = 0; i + 2 < b.raw.length; i++) {
        if ([1, 2, 3, 0x81].includes(b.raw[i]) && b.raw[i + 1] === 0x5c && b.raw[i + 2] === 0x02) {
          sites.push({ blockId: b.blockId, vaddr: i + VADDR_ADDEND - 2 });
        }
      }
    }
    expect(sites).toEqual([
      { blockId: 19, vaddr: 0x890d },
      { blockId: 33, vaddr: 0x975e },
      { blockId: 38, vaddr: 0x9f3e },
      { blockId: 51, vaddr: 0x8064 },
    ]);

    // The one in block 38 is the WRITE — `SAVE #1 -> [0x025C]`, directly after the dragon fight.
    const b38 = blocks.find((b) => b.blockId === 38)!.raw;
    expect(hex(b38, 0x9f32, 3)).toBe('24 17 01'); // COMBAT ; IF_NE ; GOTO(defeat)
    expect(hex(b38, 0x9f3b, 6)).toBe('09 00 01 01 5c 02'); // SAVE #1 -> [0x025C]

    // The other three are READS — each the left side of a COMPARE against #0.
    for (const [blockId, vaddr] of [
      [19, 0x890c],
      [33, 0x975d],
      [51, 0x8063],
    ] as const) {
      const raw = blocks.find((b) => b.blockId === blockId)!.raw;
      expect(hex(raw, vaddr, 6)).toBe('03 01 5c 02 00 00'); // COMPARE [0x025C], #0
    }
  });

  // ------------------------------------------------------------ L: the last line and the chain
  it('L. the ending writes the spawn quad and chains to the wilderness block', async () => {
    const raw = await eclBlock(38);
    // SAVE #7->[02ec] ; #1->[02ed] ; #3->[02eb] ; #54->[02ee] ; NEWECL #51
    expect(hex(raw, 0xa3a5, 24)).toBe(
      '09 00 07 01 ec 02 09 00 01 01 ed 02 09 00 03 01 eb 02 09 00 36 01 ee 02',
    );
    expect(hex(raw, 0xa3bd, 3)).toBe('20 00 33');
    const newecl = decodeInstructionAt(raw, off(0xa3bd), 0x7ffe, ENDING_DIALECT);
    expect(newecl.ins?.mnemonic).toBe('NEWECL');
    expect(newecl.ins?.args[0]?.word).toBe(51);

    // Block 51 consumes exactly that quad on entry: LOAD_FILES [02ee] then y/x/facing.
    const b51 = await eclBlock(51);
    expect(hex(b51, 0x809a, 28)).toBe(
      '21 01 ee 02 01 ee 02 09 01 ed 02 01 35 00 09 01 ec 02 01 34 00 09 01 eb 02 01 11 00',
    );

    // The final PRINTCLEAR of the game, decoded from its own inline packed string.
    const last = decodeInstructionAt(raw, off(0xa31d), 0x7ffe, ENDING_DIALECT);
    expect(last.ins?.mnemonic).toBe('PRINTCLEAR');
    expect(last.ins?.args[0]?.text).toBe(
      'ON A HILLSIDE OUTSIDE WATERDEEP YOU RECALL YOUR MANY QUESTS. THE MONSTERS SLAIN, THE ' +
        "TREASURES WON, THE THOUSANDS OF INNOCENT LIVES YOU'VE SAVED. IT HAS, INDEED, BEEN GLORIOUS!",
    );
  });

  // ------------------------------------- M: what actually discriminates the latch (see §2a-bis)
  it('M. the latch is selected by what its readers REMOVE, not by its writer/reader arithmetic', async () => {
    // The "one writer, N cross-block readers" SHAPE is common in this corpus and proves nothing on
    // its own — the research doc's §2a-bis census finds seven such addresses. The two facts that
    // actually discriminate [0x025C] are asserted here.

    // (1) Block 33's travel menu loses the ENDGAME DESTINATION once the latch is set.
    const b33 = await eclBlock(33);
    expect(hex(b33, 0x975d, 8)).toBe('03 01 5c 02 00 00 16 01'); // COMPARE [025C],#0 ; IF_EQ ; GOTO
    const clearArm = decodeInstructionAt(b33, off(0x978a), 0x7ffe, ENDING_DIALECT);
    const setArm = decodeInstructionAt(b33, off(0x9768), 0x7ffe, ENDING_DIALECT);
    expect(clearArm.ins?.mnemonic).toBe('HORIZONTAL_MENU');
    expect(setArm.ins?.mnemonic).toBe('HORIZONTAL_MENU');
    // Latch CLEAR -> three destinations; latch SET -> the Ice Peak voyage is gone.
    expect(clearArm.ins?.args.slice(2).map((a) => a.text)).toEqual([
      'NEVERWINTER',
      'ICE PEAK',
      'STAY',
    ]);
    expect(setArm.ins?.args.slice(2).map((a) => a.text)).toEqual(['NEVERWINTER', 'STAY']);
    // …and the corresponding ON_GOTO drops the middle target (0x9917, the voyage itself).
    const clearGoto = decodeInstructionAt(b33, off(0x97a8), 0x7ffe, ENDING_DIALECT);
    const setGoto = decodeInstructionAt(b33, off(0x977e), 0x7ffe, ENDING_DIALECT);
    expect(clearGoto.ins?.args.slice(2).map((a) => a.word)).toEqual([0x97b7, 0x9917, 0x9ad2]);
    expect(setGoto.ins?.args.slice(2).map((a) => a.word)).toEqual([0x97b7, 0x9ad2]);

    // (2) The nearest rival latch [0x0208] is a "seen this scene once" flag: its OWN write is
    // guarded by a re-entry check that EXITs if already set. [0x025C]'s write has no such guard.
    const b31 = await eclBlock(31);
    expect(hex(b31, 0xa6bd, 8)).toBe('03 01 08 02 00 01 16 00'); // COMPARE [0208],#1 ; IF_EQ ; EXIT(0x00)
    expect(hex(b31, 0xa6c5, 6)).toBe('09 00 01 01 08 02'); // SAVE #1 -> [0208]
    const b38 = await eclBlock(38);
    // Immediately before block 38's write is the boss COMBAT's IF_NE/GOTO, not a re-entry guard.
    expect(hex(b38, 0x9f32, 3)).toBe('24 17 01');
  });

  // ----------------------------------- N: corpus-wide, nothing else reads as an ending (see §2d)
  it('N. ending vocabulary occurs only in block 38, and block 17 chains onward instead', async () => {
    const blocks = readDaxDataBlocks(new Uint8Array(await readFile(eclPath)));

    // Raw, model-free substring search over the 6-bit packed text of EVERY block. Decoding the
    // whole block at every bit offset is unnecessary: inline strings are byte-aligned, so scan
    // each block's bytes as packed 6-bit text from each byte start.
    const unpack = (raw: Uint8Array, start: number, len: number) => {
      let acc = 0;
      let bits = 0;
      let out = '';
      for (let i = start; i < Math.min(start + len, raw.length); i++) {
        acc = ((acc << 8) | raw[i]) & 0xffffff;
        bits += 8;
        while (bits >= 6) {
          bits -= 6;
          const v = (acc >> bits) & 0x3f;
          if (v === 0) return out;
          out += String.fromCharCode(v >= 1 && v <= 31 ? v + 64 : v);
        }
      }
      return out;
    };
    const findNeedle = (needle: string) => {
      const hits: number[] = [];
      for (const b of blocks) {
        let found = false;
        for (let i = 0; i < b.raw.length && !found; i++) {
          if (unpack(b.raw, i, Math.ceil(((needle.length + 2) * 6) / 8) + 2).includes(needle)) {
            found = true;
          }
        }
        if (found) hits.push(b.blockId);
      }
      return hits;
    };

    // POSITIVE/NEGATIVE CONTROLS — without these, a bug that returned [38] (or nothing) for every
    // query would make the two assertions below look like proof while proving nothing.
    // NB: this raw scan has HIGHER recall than a CFG-reachable extraction, which finds FAREWELL
    // only in 23/26/27 — blocks 31 and 37 carry it in bytes the control-flow walk never reaches.
    // That asymmetry is the point: the uniqueness assertions below survive the stricter instrument.
    expect(findNeedle('FAREWELL')).toEqual([23, 26, 27, 31, 37]); // multi-block hit, not just 38
    expect(findNeedle('PIRATES ATTACK!')).toEqual([29, 31]); // blocks that are NOT 38
    expect(findNeedle('QQZZXJ')).toEqual([]); // absent needle really returns empty

    // The two unmistakable ending phrases appear in exactly one block: 38.
    expect(findNeedle('BEEN GLORIOUS')).toEqual([38]);
    expect(findNeedle("'THE HEROES OF THE NORTH'")).toEqual([38]);

    // The strongest counter-candidate — block 17's Geildarr victory — is a CHAPTER victory: it
    // ends by chaining to block 16, so the campaign demonstrably continues past it.
    const b17 = await eclBlock(17);
    expect(findNeedle('OUR VICTORY IS WON')).toEqual([17]);
    // CORRECTED 2026-08-06. This used to be a raw `20 00 ??` byte scan asserting `.has(16)`.
    // That scan yields {16, 24, 27} in block 17 — two of the three are false positives — so it
    // could not establish "block 17 NEWECLs to block 16". Replaced with a decoded CFG walk from
    // all five header entries, which finds block 17's ONLY reachable NEWECL target is #16.
    expect(reachableNewEclTargets(b17)).toEqual([16]);
    // And it writes no campaign latch: [0x025C] still has exactly one writer, in block 38 (test K).
  });

  it('O. NEGATIVE CONTROL — a non-0xF9 cell of GEO1#38 does not reach the ending', async () => {
    // Tests A/B establish the descriptor arithmetic STATICALLY (0xF9 & 0x7F = 121 -> arm 0x9227).
    // Nothing previously ran the VM at a cell that is NOT 0xF9 to show the ending stays shut.
    // (7,8) carries descriptor 0x8C, which masks to ON_GOTO index 12 -> [0x8B95], a facing-gated
    // narration — a different arm entirely. Added 2026-08-06.
    const raw = await eclBlock(38);
    const graw = await geoBlock(38);
    expect(graw[514 + 8 * 16 + 7]).toBe(0x8c); // the re-entry cell, read from the GEO plane

    const memory = new Map<number, number>();
    const runner = dialogueForCell(raw, 0x8c, {
      memory,
      facing: 'west',
      dialect: ENDING_DIALECT,
      seedMemory: { 0x0020: 6, 0x0034: 7, 0x0035: 8 },
    })!;
    let text = '';
    let turn = runner.start() as any;
    for (let i = 0; i < 8 && turn && turn.kind !== 'end'; i++) {
      if (turn.text) text += ' ' + turn.text;
      if (turn.kind === 'combat') turn = runner.afterCombat('victory');
      else if (turn.kind === 'say') turn = runner.choose(0);
      else break;
    }
    if (turn?.text) text += ' ' + turn.text;

    expect(text).not.toContain('ENTERING THE CHAMBER');
    expect(text).not.toContain('BEEN GLORIOUS');
    expect(memory.has(0x025c)).toBe(false);
  });
});
