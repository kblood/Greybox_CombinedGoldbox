/**
 * Golden: Pools of Darkness's ENDING leg — `ECL1.DAX#75`, the finale at Bane's pool.
 *
 * WHAT THIS ESTABLISHES (every number below is produced by this file at run time — either read
 * from the retail bytes or produced by running the real `EclVm` under the shipped
 * `ECL_GEN1_SHORT_POOLS` dialect; nothing is hand-traced and nothing is transcribed):
 *   A. Retail identity — file and decompressed-block sizes and sha256s; Pools ships exactly ONE
 *      script archive with 56 blocks.
 *   B. Block 75 is a CUTSCENE block, not a map area: all four map/camp header entries resolve to
 *      0x97A8, which is a single `EXIT` byte; the block contains exactly ONE `ON_GOTO` (0x89BD, on
 *      the combat-tier word) and ZERO references to the dialect's `cellDescAddr` 0x002D. Entry is
 *      by `NEWECL` only.
 *   C. The three entry guards are byte-exact, and 0x859A is NOT a third denouement — it is a
 *      four-instruction prefix that falls straight through into the finale at 0x85DD.
 *   D. The real VM selects the arm from the guard word: nothing seeded → the MID-campaign
 *      Shal/Petra scene; `[0x01D0]=255` → the finale opening; `[0x0254]=255` → the same finale
 *      prefixed by the Gothmenes-summons line; `[0x02EE]=255` → the epilogue alone, chaining to
 *      block 24 with the spawn triple.
 *   E. Driven from either final-balor arm, victory runs the crystal-to-dust narration, writes the
 *      completion latch `[0x02EE]=255`, and chains to block 24.
 *   F. The PANAJUXID word puzzle is real input, and saying the word is a LOSING ending: the VM
 *      exits carrying an unconditional party-wide DAMAGE effect. Negative control: any other word
 *      takes a different, non-terminal arm.
 *   G. `[0x02EE]` has EXACTLY ONE writer in the entire 56-block corpus (0x9666 in block 75), proven
 *      by an alignment-free raw operand scan that uses no control-flow model at all. `NEWECL #75`
 *      likewise has exactly three sites corpus-wide by the same model-free method.
 *   H. Block 24 is a completion-GATED post-victory Phlan, not a credits roll: its first instruction
 *      bounces to block 16 unless the latch is set. Both polarities are asserted.
 *   I. A three-block continuity run — block 65 → `chain 75` → block 24 — through ONE shared memory
 *      map, with two negative controls on block 65's own gate words.
 *   J. The physical approach exists: block 65 IS a map area, its cell dispatch arm 11 starts the
 *      endgame arming chain, and GEO1#65 has exactly three cells that select that arm, all
 *      reachable over the real wall/door graph.
 *
 * WHAT THIS TEST DOES **NOT** ESTABLISH
 *   - No DOSBox-X, GameLink, emulator or screenshot evidence. Every engine-side claim is retail
 *     bytes plus this repo's TypeScript `EclVm`; a VM opcode mis-model would be inherited.
 *   - **DISCLOSED HARNESS STOP.** The two seeded finale arms driven from entry 22 do NOT run to a
 *     clean pause: they end `halted` / `step-budget exceeded` inside the crystal-bearer scan at
 *     0x9817, whose `COMPARE memstr[0x032B],memstr[0x0401]` can never become equal in a headless VM
 *     (`rvalue` of a `0x81` operand returns the pointer itself, so the two cells compare 0x032B vs
 *     0x0401 forever). Test D asserts that halt explicitly rather than hiding it. Those two runs
 *     therefore prove ARM SELECTION only; the terminus is proven separately by test E, entering at
 *     each balor arm's own vaddr.
 *   - No single VM run crosses a `NEWECL` boundary. Test I chains three blocks through one shared
 *     memory map, but re-enters block 75 at a balor arm rather than at its own entry, for the
 *     reason above.
 *   - Test J proves the arm-11 cells exist and are graph-reachable in GEO1#65. It does NOT walk
 *     them through the VM, and no `find_geo_path`-grade route is claimed.
 *   - `PROGRAM #1` at 0x966C is asserted as a byte fact only; its host semantics were not traced,
 *     and the VM treats it as a fall-through — which is what makes the 0x9666 → 0x966F continuity
 *     work here.
 *   - `[0x003A]`/`[0x0025]`/`[0x0026]` are asserted as the exact values the retail bytes and the
 *     real VM produce. Reading them as "region selector" and "overland cursor X/Y" is INFERENCE and
 *     is not asserted.
 *   - Opcode `0x31` is framed by the shipped dialect as zero-operand `SPRITE_OFF`. Static evidence
 *     (recorded in §9 of the research doc) says it is a MENU in the Gen1-short family. That
 *     correction is NOT shipped and is NOT applied here — test B asserts the one place it costs the
 *     ending arm anything, so the gap is visible rather than silent.
 *   - No browser wiring, no `?explore=` route id and no e2e acceptance is claimed or implied.
 *
 * Full byte evidence, the corpus-wide census, the rejected alternative readings and the six
 * adversarial refuter citations live in `docs/engine/research/pools-ending-route.md`.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  readDaxDataBlocks,
  decodeInstructionAt,
  decodeMonsterArchive,
  parseEclHeader,
  ECL_GEN1_SHORT_POOLS,
  EclVm,
  Explorer,
  decodeGeoBlock,
  primeSearchLocation,
} from '../src/index.js';

const pools = 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness';
const eclPath = resolve(pools, 'ECL1.DAX');
const geoPath = resolve(pools, 'GEO1.DAX');
const monPath = resolve(pools, 'MON1CHA.DAX');
const haveRetail = existsSync(eclPath) && existsSync(geoPath) && existsSync(monPath);

/** Gen1 addressing for Pools of Darkness: file offset = vaddr - 0x8000 + 2. */
const VADDR_ADDEND = 0x8000;
const off = (vaddr: number) => vaddr - VADDR_ADDEND + 2;
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const hex = (raw: Uint8Array, vaddr: number, len: number) =>
  [...raw.slice(off(vaddr), off(vaddr) + len)].map((b) => b.toString(16).padStart(2, '0')).join(' ');

let eclCache: Array<{ blockId: number; raw: Uint8Array }> | undefined;
async function eclBlocks() {
  if (!eclCache) eclCache = readDaxDataBlocks(new Uint8Array(await readFile(eclPath)));
  return eclCache;
}
async function ecl(id: number): Promise<Uint8Array> {
  return (await eclBlocks()).find((b) => b.blockId === id)!.raw;
}
let geoCache: Array<{ blockId: number; raw: Uint8Array }> | undefined;
async function geoBlocks() {
  if (!geoCache) geoCache = readDaxDataBlocks(new Uint8Array(await readFile(geoPath)));
  return geoCache;
}

const D = ECL_GEN1_SHORT_POOLS;
const printed = (effects: readonly unknown[]) =>
  (effects as Array<{ type: string; text?: string }>)
    .filter((e) => e.type === 'print' && typeof e.text === 'string')
    .map((e) => e.text!);
const lastCombat = (effects: readonly unknown[]) =>
  (effects as Array<{ type: string; monsters?: unknown }>).filter((e) => e.type === 'combat').slice(-1)[0];

/** Run block 75 from `entry`, answering every COMBAT with `victory` and every prompt with 0. */
function drive(raw: Uint8Array, entryOffset: number, memory: Map<number, number>) {
  const vm = new EclVm(raw, { dialect: D, entry: entryOffset, seed: 1, memory });
  let r = vm.run();
  const kinds: string[] = [r.status];
  const combats: unknown[] = [];
  const texts: string[] = [...printed(r.effects)];
  for (let i = 0; i < 16; i++) {
    if (r.status === 'combat') {
      combats.push(lastCombat(r.effects));
      r = vm.resume(0, { combatOutcome: 'victory' });
    } else if (r.status === 'awaiting-input') {
      r = vm.resume(0);
    } else break;
    kinds.push(r.status);
    texts.push(...printed(r.effects));
  }
  return { result: r, kinds, combats, texts, memory };
}

/**
 * Alignment-free raw operand scan over every block: find every byte position whose operand-code
 * byte is one of the four legal ADDRESS codes {1,2,3,0x81} and whose following little-endian word
 * equals `addr`. This uses NO control-flow model at all, so a decode hole cannot defeat it — which
 * matters because the corpus-wide CFG walk carries 15 undecodable bytes (one each in 15 blocks).
 */
function rawOperandSites(blocks: Array<{ blockId: number; raw: Uint8Array }>, addr: number) {
  const lo = addr & 0xff;
  const hi = addr >> 8;
  const hits: Array<[number, number]> = [];
  for (const { blockId, raw } of blocks) {
    for (let i = 22; i + 2 < raw.length; i++) {
      if ((raw[i] === 1 || raw[i] === 2 || raw[i] === 3 || raw[i] === 0x81) && raw[i + 1] === lo && raw[i + 2] === hi) {
        hits.push([blockId, i + VADDR_ADDEND - 2]);
      }
    }
  }
  return hits;
}

/** Same idea for an immediate-operand `NEWECL #id` (`20 00 id`). */
function rawNewEclSites(blocks: Array<{ blockId: number; raw: Uint8Array }>, id: number) {
  const hits: Array<[number, number]> = [];
  for (const { blockId, raw } of blocks) {
    for (let i = 22; i + 2 < raw.length; i++) {
      if (raw[i] === 0x20 && raw[i + 1] === 0x00 && raw[i + 2] === id) hits.push([blockId, i + VADDR_ADDEND - 2]);
    }
  }
  return hits;
}

type Dir = 'north' | 'east' | 'south' | 'west';
const DELTA: Record<Dir, [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
/** Gen1 GEO edge graph: wall planes raw[2:258] / raw[258:514], door flags raw[770:1026]. */
function edgesOf(raw: Uint8Array, x: number, y: number): Record<Dir, [number, number]> {
  const i = y * 16 + x;
  const p0 = raw[2 + i]!;
  const p1 = raw[258 + i]!;
  const doors = raw[770 + i]!;
  return {
    north: [p0 >> 4, doors & 0x03],
    east: [p0 & 0x0f, (doors >> 2) & 0x03],
    south: [p1 >> 4, (doors >> 4) & 0x03],
    west: [p1 & 0x0f, (doors >> 6) & 0x03],
  };
}
function bfs(raw: Uint8Array, start: [number, number]): Map<number, number> {
  const dist = new Map<number, number>([[start[1] * 16 + start[0], 0]]);
  const queue: Array<[number, number]> = [start];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const here = dist.get(y * 16 + x)!;
    for (const dir of ['north', 'east', 'south', 'west'] as Dir[]) {
      const [wall, door] = edgesOf(raw, x, y)[dir];
      if (wall !== 0 && door === 0) continue;
      const [dx, dy] = DELTA[dir];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx > 15 || ny < 0 || ny > 15) continue;
      if (dist.has(ny * 16 + nx)) continue;
      dist.set(ny * 16 + nx, here + 1);
      queue.push([nx, ny]);
    }
  }
  return dist;
}

describe.skipIf(!haveRetail)('Pools of Darkness — ENDING leg (ECL1.DAX#75)', () => {
  // ------------------------------------------------------------------ A: retail identity
  it('A. retail identity — one script archive, 56 blocks, byte-exact hashes', async () => {
    const eclRaw = new Uint8Array(await readFile(eclPath));
    expect(eclRaw.length).toBe(329456);
    expect(sha(eclRaw)).toBe('46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af');

    const monRaw = new Uint8Array(await readFile(monPath));
    expect(monRaw.length).toBe(13428);
    expect(sha(monRaw)).toBe('dd9394a142899136da8b5466b1e2cae4357c31847abb18745bea75ae8b2e6eef');

    const geoRaw = new Uint8Array(await readFile(geoPath));
    expect(geoRaw.length).toBe(28349);
    expect(sha(geoRaw)).toBe('d628bae8349044a1c1c05b821ccfbba6464ed5bfa57cef15ca05ec52cc5afc1f');

    const blocks = await eclBlocks();
    expect(blocks.length).toBe(56);
    expect(blocks.map((b) => b.blockId)).toEqual([
      1, 2, 3, 4, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 32, 33, 34, 35, 36, 37, 38, 39, 40,
      41, 42, 48, 49, 50, 51, 52, 53, 54, 55, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77,
      80, 81, 82, 83, 84, 85, 86,
    ]);

    const expected: Array<[number, number, string]> = [
      [75, 6233, '0675cbff7acf5e98a62d3d7bf4dae2f18a094b0dc6ac665de702aaeb04e73cf2'],
      [24, 7625, '9c2b7f8f730ab3d3c3af417c34f344c7c8274c9b1fc6c6a4ad0a9d02a6d3c89b'],
      [23, 7617, '1f29e34f251fac429ed3c6b5daef4b3a1f293da2ab9842834a5418bd71eff4a9'],
      [65, 6567, '0a85f1e4d967c6c31058c91a0735057fb3af0b3a37d9b128530af6a498837425'],
      [67, 6473, '4ae9ee725aa62371e5b3467f8d6237fcca158aa0187d343d9d32847a60d20347'],
      [73, 7660, '2b812e356ac0bb547307c25f110a4f9c5dece677f70bf4ac4186f792923686d3'],
      [74, 7368, 'efbf09a9173e4c81532357df6bb6e579000dcf2c890b7cec976c536cbea6e3cb'],
      [39, 6446, '20edfda5fcdf0fc726984d0e29d2a4811ba1a89fd5788567cd7583da9018a005'],
      // Identical to the value this game's already-proven `middle` citation records — an
      // independent cross-check that this test resolved the same install.
      [18, 6141, '0ced2a5603595b8b30c9c6020495689be5a027fcc816129ab0b9e979e656b357'],
    ];
    for (const [id, len, digest] of expected) {
      const raw = await ecl(id);
      expect([id, raw.length, sha(raw)]).toEqual([id, len, digest]);
    }
  });

  // -------------------------------------------------- B: block 75 is a cutscene, not a map area
  it('B. block 75 is a cutscene block — all map/camp entries are a bare EXIT, one ON_GOTO, no cell dispatch', async () => {
    const raw = await ecl(75);
    const header = parseEclHeader(raw, D);

    // Header magic, and all four map/camp far-pointers collapsed onto the same address…
    expect(hex(raw, 0x7ffe, 22)).toBe(
      '88 13 01 01 a8 97 01 01 a8 97 01 01 a8 97 01 01 a8 97 01 01 14 80',
    );
    expect([header.vmRun1, header.searchLocation, header.preCampCheck, header.campInterrupted]).toEqual([
      0x97a8, 0x97a8, 0x97a8, 0x97a8,
    ]);
    // …which is a single EXIT byte, so entering block 75 as a map does nothing at all.
    expect(raw[off(0x97a8)]).toBe(0x00);
    expect(header.eclInitialEntry).toBe(0x8014);
    expect(off(0x8014)).toBe(22);

    // Walk every decodable instruction linearly from the entry and count the dispatch shapes that
    // a real map area would have. Block 75 has exactly one ON_GOTO and it is NOT a cell dispatch.
    const onGoto: number[] = [];
    const cellDescRefs: number[] = [];
    const lastBlockIdRefs: Array<[number, string, number, number]> = [];
    for (let pos = 22; pos < raw.length; ) {
      const dec = decodeInstructionAt(raw, pos, D.vbase!, D);
      if (dec.badOpcode || !dec.ins) {
        pos += 1;
        continue;
      }
      const vaddr = pos + D.vbase!;
      if (dec.ins.opcode === 0x25) onGoto.push(vaddr);
      dec.ins.args.forEach((a, i) => {
        if ([1, 2, 3, 0x81].includes(a.code) && a.word === D.cellDescAddr) cellDescRefs.push(vaddr);
        if ([1, 2, 3, 0x81].includes(a.code) && a.word === D.lastBlockIdAddr) {
          lastBlockIdRefs.push([vaddr, dec.ins!.mnemonic, i, dec.ins!.args.length]);
        }
      });
      pos = dec.next;
    }
    expect(D.cellDescAddr).toBe(0x002d);
    expect(cellDescRefs).toEqual([]); // no cell dispatch anywhere in the block
    expect(onGoto).toEqual([0x89bd]); // the combat-tier fork, the block's only ON_GOTO
    expect(hex(raw, 0x89bd, 15)).toBe('25 01 5c 02 00 03 01 cc 89 01 f5 89 01 1e 8a');

    // The block WRITES the last-block-id slot and never reads it — the entry fork is on story
    // flags, not on which block called. (Gen1 SAVE puts the destination LAST, so index 1 of 2.)
    expect(D.lastBlockIdAddr).toBe(0x0016);
    expect(lastBlockIdRefs).toEqual([[0x8014, 'SAVE', 1, 2]]);

    // The one place the unshipped 0x31=MENU framing costs the ENDING arm anything: 0x87CC is a
    // real GOTO on the finale path that the shipped SPRITE_OFF frame turns into an operand-code
    // 0xBF salad. Asserted here so the known dialect gap is visible, not silent.
    expect(hex(raw, 0x87ca, 6)).toBe('22 17 01 01 04 89');
    const goto87cc = decodeInstructionAt(raw, off(0x87cc), D.vbase!, D);
    expect(goto87cc.ins?.mnemonic).toBe('GOTO');
    expect(goto87cc.ins?.args[0]?.word).toBe(0x8904);
  });

  // ------------------------------------------------------- C: entry guards and the 0x859A prefix
  it('C. the three entry guards are byte-exact and 0x859A is a prefix that falls through into 0x85DD', async () => {
    const raw = await ecl(75);
    expect(hex(raw, 0x8014, 6)).toBe('09 00 4b 01 16 00'); // SAVE #75 -> [0x0016]
    expect(hex(raw, 0x801a, 11)).toBe('03 01 ee 02 00 ff 16 01 01 6f 96'); // [0x02EE] -> 0x966F
    expect(hex(raw, 0x8025, 11)).toBe('03 01 54 02 00 ff 16 01 01 9a 85'); // [0x0254] -> 0x859A
    expect(hex(raw, 0x8030, 11)).toBe('03 01 d0 01 00 ff 16 01 01 dd 85'); // [0x01D0] -> 0x85DD
    expect(hex(raw, 0x803b, 3)).toBe('0e 00 74'); // else PICTURE #116 (the mid-campaign arm)

    // 0x859A is four instructions, and the fourth ENDS at 0x85DD — it is a prefix, not a variant.
    const chain: string[] = [];
    let pos = off(0x859a);
    for (let i = 0; i < 4; i++) {
      const dec = decodeInstructionAt(raw, pos, D.vbase!, D);
      chain.push(dec.ins!.mnemonic);
      pos = dec.next;
    }
    expect(chain).toEqual(['SAVE', 'PICTURE', 'PRINTCLEAR', 'PARTYSTRENGTH']);
    expect(hex(raw, 0x85dc, 1)).toBe('1d'); // PARTYSTRENGTH, one byte
    expect(pos + D.vbase!).toBe(0x85dd); // …lands exactly on the finale entry

    // Terminal instructions of the two arms.
    expect(hex(raw, 0x8597, 3)).toBe('20 00 12'); // mid-campaign arm: NEWECL #18
    expect(hex(raw, 0x9666, 6)).toBe('09 00 ff 01 ee 02'); // ending arm: the completion latch
    expect(hex(raw, 0x966c, 3)).toBe('38 00 01'); // PROGRAM #1 (byte fact only; semantics untraced)
    expect(hex(raw, 0x9793, 18)).toBe(
      '09 00 04 01 3a 00 09 00 09 01 25 00 09 00 04 01 26 00',
    );
    expect(hex(raw, 0x97a5, 3)).toBe('20 00 18'); // NEWECL #24
  });

  // ---------------------------------------------- D: the real VM selects the arm from the flag
  it('D. the guard word picks the arm in the real VM (and the two finale arms halt in the party scan)', async () => {
    const raw = await ecl(75);

    // No flag: the MID-campaign Shal / Vessel-of-Moander scene, pausing on its own prompt.
    const bare = new EclVm(raw, { dialect: D, entry: 22, seed: 1, memory: new Map() });
    const bareRun = bare.run();
    expect(bareRun.status).toBe('awaiting-input');
    expect(bareRun.effects.some((e) => e.type === 'picture' && (e as { id: number }).id === 116)).toBe(true);
    expect(bareRun.chainBlockId).toBeUndefined();

    // [0x01D0] = 255 → the finale opening, in order, verbatim.
    const finaleOpening = [
      'YOU TURN TO REGARD THE SINISTER DARK POOL OF DEATH.',
      'THE DARK FLUID BEGINS TO BOIL. FELL CREATURES EMERGE!',
      'WITH A CLATTER OF SKELETAL WINGS DRACOLICHES SOAR UP FROM THE POOL, SHRIEKING THEIR HATE!',
      'GIANT BITS OF MOANDER BOB TO THE SURFACE AND CLAMBER UP THE SIDES. BEHIND COME BANE MINIONS!',
      'THEN THE GLEAMING BLACK PETS OF KALISTES HOIST THEMSELVES FROM THE HORRIPILATING LIQUID.',
      'THERE SEEMS TO BE NO END TO THEM.',
    ];
    const d0 = new EclVm(raw, { dialect: D, entry: 22, seed: 1, memory: new Map([[0x01d0, 255]]) });
    const r0 = d0.run();
    expect(printed(r0.effects)).toEqual(finaleOpening);
    // DISCLOSED: this is a harness stop, not a clean pause. The 0x9817 crystal-bearer scan compares
    // two 0x81 string cells that a headless VM can never make equal, so the loop cannot terminate.
    expect(r0.status).toBe('halted');
    expect(r0.haltReason).toBe('step-budget exceeded');
    expect(hex(raw, 0x9821, 7)).toBe('03 81 2b 03 81 01 04'); // COMPARE memstr[0x032B],memstr[0x0401]

    // [0x0254] = 255 → the IDENTICAL finale, prefixed by the summons line. This is what proves the
    // 0x859A fall-through at run time rather than only in the byte layout.
    const d1 = new EclVm(raw, { dialect: D, entry: 22, seed: 1, memory: new Map([[0x0254, 255]]) });
    const r1 = d1.run();
    expect(printed(r1.effects)).toEqual([
      'SUDDENLY IN A LOUD VOICE GOTHMENES SUMMONS THE RUINOUS SUBJECTS OF BANE!',
      ...finaleOpening,
    ]);
    expect(r1.status).toBe('halted');
    expect(r1.haltReason).toBe('step-budget exceeded');

    // [0x02EE] = 255 → the epilogue alone. Once the latch is set, re-entering area 75 replays only
    // the denouement and hands off to block 24.
    const memory = new Map([[0x02ee, 255]]);
    const d2 = new EclVm(raw, { dialect: D, entry: 22, seed: 1, memory });
    const r2 = d2.run();
    expect(printed(r2.effects)).toEqual([
      'AS IF FROM FAR AWAY, ELMINSTER SPEAKS.',
      "'SO HAVE THE POWERS OF GOOD UNDONE ALL OF BANE'S PLOT.'",
      "'EVERYTHING IS AS IT WAS. ONLY YE AND I KNOW WHAT FATE THE REALMS ALMOST BORE.'",
      "'AND I HAVE SEEN THE DEEPEST PART OF BANE'S POOL, YET YE HAVE PULLED ME BACK. I SHALL NOT FORGET YE.'",
      'THE CRYSTAL IS ALL GONE. THE FOG OF FORGETFULNESS LIFTS...',
    ]);
    expect(r2.status).toBe('chain');
    expect(r2.chainBlockId).toBe(24);
    expect([memory.get(0x003a), memory.get(0x0025), memory.get(0x0026)]).toEqual([4, 9, 4]);
  });

  // ------------------------------------------------ E: the terminus, driven from the balor arms
  it('E. either final-balor arm ends the campaign: latch written, chain to block 24', async () => {
    const raw = await ecl(75);

    // The agreed / wrong-word arm and the refused arm carry different retail rosters.
    const agreed = drive(raw, off(0x9252), new Map());
    const refused = drive(raw, off(0x941d), new Map());
    expect((agreed.combats[0] as { monsters: unknown }).monsters).toEqual([
      { monsterId: 12, count: 1, picBlockId: 12 },
      { monsterId: 28, count: 3, picBlockId: 28 },
      { monsterId: 9, count: 8, picBlockId: 9 },
      { monsterId: 4, count: 3, picBlockId: 4 },
    ]);
    expect((refused.combats[0] as { monsters: unknown }).monsters).toEqual([
      { monsterId: 12, count: 1, picBlockId: 12 },
      { monsterId: 28, count: 2, picBlockId: 28 },
      { monsterId: 9, count: 8, picBlockId: 9 },
      { monsterId: 3, count: 2, picBlockId: 3 },
    ]);

    for (const run of [agreed, refused]) {
      expect(run.result.status).toBe('chain');
      expect(run.result.chainBlockId).toBe(24);
      expect(run.memory.get(0x02ee)).toBe(255); // the completion latch
      expect([run.memory.get(0x003a), run.memory.get(0x0025), run.memory.get(0x0026)]).toEqual([4, 9, 4]);
      expect(run.texts).toContain('THE MONSTER IS GONE. SLOWLY A FOG OF PAIN LIFTS FROM YOUR EYES.');
      expect(run.texts).toContain(" HAND. BANE'S CRYSTAL IS TURNED TO DUST, WHICH TRICKLES OUT BETWEEN ");
      expect(run.texts).toContain(' FINGERS, AND BLOWS AWAY ON A FRESHENING WIND.');
      expect(run.texts).toContain("'SO HAVE THE POWERS OF GOOD UNDONE ALL OF BANE'S PLOT.'");
    }

    // Monster ids in LOAD_MONSTER are 1-BASED: id N is the record whose blockId is N, i.e.
    // `records[N-1]`. Reading `records[N]` gives the wrong creature for every id in this fight.
    const records = decodeMonsterArchive(new Uint8Array(await readFile(monPath)), 'pools-of-darkness');
    expect(records.length).toBe(122);
    for (const [id, name] of [
      [12, 'GOTHMENES'],
      [28, 'GREEN DRAGON'],
      [9, 'MINION OF BANE'],
      [77, 'DRACOLICH'],
      [7, 'PET OF KALISTES'],
      [31, 'BEHOLDER'],
      [95, 'DEATH TYRANT'],
      [94, 'ELDER ORB'],
    ] as Array<[number, string]>) {
      expect([id, records[id - 1]!.blockId, records[id - 1]!.name]).toEqual([id, id, name]);
    }
    expect(records[77]!.name).toBe('MARCUS'); // the naive 0-based read, and why it is wrong
  });

  // ------------------------------------------------- F: the PANAJUXID puzzle and its two outcomes
  it('F. saying PANAJUXID is a LOSING ending; any other word is not (negative control)', async () => {
    const raw = await ecl(75);
    expect(hex(raw, 0x8f7a, 6)).toBe('09 80 00 81 3f 03'); // SAVE "" -> memstr[0x033F]
    expect(hex(raw, 0x8f80, 6)).toBe('10 00 0f 81 3f 03'); // INPUT_STRING #15, memstr[0x033F]
    expect(hex(raw, 0x8f86, 13)).toBe('03 81 3f 03 80 07 40 13 81 29 56 09 10'); // COMPARE …,"PANAJUXID"
    const cmp = decodeInstructionAt(raw, off(0x8f86), D.vbase!, D);
    expect(cmp.ins?.mnemonic).toBe('COMPARE');
    expect(cmp.ins?.args[1]?.text).toBe('PANAJUXID');

    // Saying the word: a party wipe, terminating the run.
    const lose = new EclVm(raw, { dialect: D, entry: off(0x8f7a), seed: 1 });
    expect(lose.run().status).toBe('awaiting-input');
    const lost = lose.resume('PANAJUXID');
    expect(lost.status).toBe('exited');
    expect(printed(lost.effects)).toContain('AS YOU SPEAK THE WORD, SOMETHING ERUPTS OUT OF THE POOL! ');
    expect(printed(lost.effects)).toContain(
      "IT TAKES A LONG MOMENT TO REALIZE THAT THE TWISTED THING IS ELMINSTER. AND THAT'S ALL THE TIME YOU HAVE.",
    );
    const damage = lost.effects.filter((e) => e.type === 'damage') as Array<Record<string, unknown>>;
    expect(damage.length).toBe(1);
    expect(damage[0]!.dice).toEqual({ count: 10, sides: 10, bonus: 255 });
    expect(damage[0]!.policy).toEqual({ mode: 'automatic', target: 'party', reason: 'noSaveFlag' });
    expect(damage[0]!.operands).toEqual([224, 10, 10, 255, 0]);
    expect(hex(raw, 0x90ec, 11)).toBe('2e 00 e0 00 0a 00 0a 00 ff 00 00');
    expect(raw[off(0x90f7)]).toBe(0x00); // EXIT

    // NEGATIVE CONTROL — a different word takes the taunt arm and the script keeps running.
    const wrong = new EclVm(raw, { dialect: D, entry: off(0x8f7a), seed: 1 });
    wrong.run();
    const wrongRes = wrong.resume('BANANA');
    expect(printed(wrongRes.effects)[0]).toBe(
      "'WRONG! BUT MY BLACK HEART LEAPS TO SEE YOUR WEAKNESS FOR POWER!'",
    );
    expect(wrongRes.status).not.toBe('exited');
    expect(wrongRes.effects.filter((e) => e.type === 'damage')).toEqual([]);
  });

  // ------------------------------------------------------ G: the model-free corpus-wide censuses
  it('G. [0x02EE] has exactly one writer corpus-wide, and NEWECL #75 exactly three sites', async () => {
    const blocks = await eclBlocks();

    // 21 raw operand sites for the latch. The CFG-reachable census (run separately in the research
    // doc via tools/gen1_ecl_encounter_scan.scan_block) finds 19 aligned refs across 12 blocks with
    // exactly ONE write; the two extra raw sites are CFG-unreachable READ operands.
    const latch = rawOperandSites(blocks, 0x02ee);
    expect(latch.length).toBe(21);
    expect(latch.filter(([b]) => b === 75).map(([, v]) => v)).toEqual([0x801b, 0x9669]);
    // …and 0x9669 is the DESTINATION operand of the block's SAVE #255, the only write anywhere.
    const raw75 = await ecl(75);
    const save = decodeInstructionAt(raw75, off(0x9666), D.vbase!, D);
    expect(save.ins?.mnemonic).toBe('SAVE');
    expect(save.ins?.args.map((a) => [a.code, a.word])).toEqual([
      [0, 255],
      [1, 0x02ee],
    ]);

    // The two finale arming flags, and block 65's own handoff gate.
    expect(rawOperandSites(blocks, 0x0254).length).toBe(9);
    expect(rawOperandSites(blocks, 0x01d0).length).toBe(5);
    expect(rawOperandSites(blocks, 0x01cf).length).toBe(10);

    // Entrances to block 75: exactly three, and the alignment-free sweep finds the same three, so
    // there is no unaligned immediate entrance hiding anywhere in the corpus.
    expect(rawNewEclSites(blocks, 75)).toEqual([
      [65, 0x8488],
      [67, 0x8a19],
      [73, 0x8484],
    ]);
    for (const [id, vaddr] of [
      [65, 0x8488],
      [67, 0x8a19],
      [73, 0x8484],
    ] as Array<[number, number]>) {
      expect(hex(await ecl(id), vaddr, 3)).toBe('20 00 4b');
    }
  });

  // --------------------------------------------- H: block 24 is a completion-gated post-victory
  it('H. block 24 refuses to run without the latch (positive and negative control)', async () => {
    const raw = await ecl(24);
    // COMPARE [0x02EE],#0 ; IF_EQ ; NEWECL #16 — the very first instruction of the block.
    expect(hex(raw, 0x8014, 10)).toBe('03 01 ee 02 00 00 16 20 00 10');

    const off24 = new EclVm(raw, { dialect: D, entry: 22, seed: 1, memory: new Map() }).run();
    expect(off24.status).toBe('chain');
    expect(off24.chainBlockId).toBe(16); // straight back to the ordinary Phlan block
    expect(printed(off24.effects)).toEqual([]);

    const on24 = new EclVm(raw, { dialect: D, entry: 22, seed: 1, memory: new Map([[0x02ee, 255]]) }).run();
    expect(printed(on24.effects)).toEqual([
      'YOU STAND ONCE AGAIN ON A PEACEFUL STREET IN PHLAN. TOWNSFOLK SCURRY ABOUT AND CHILDREN PLAY IN THE STREETS.',
      'FROM ALL APPEARANCES, PHLAN IS THE SAME AS IT WAS THE DAY YOU FIRST ARRIVED.',
    ]);
    expect(on24.status).toBe('exited');
    expect(on24.chainBlockId).toBeUndefined();

    // A second, independent block agrees on the polarity of the same latch.
    expect(hex(await ecl(23), 0x84bf, 13)).toBe('03 01 ee 02 00 00 17 20 00 18 20 00 10');

    // …and the competing "retirement" beat in the optional trial area (block 39) also chains to
    // 24 — but writes no latch, so it is degraded straight back to block 16 by the gate above.
    expect(hex(await ecl(39), 0x858a, 3)).toBe('20 00 18');
    expect(rawOperandSites([{ blockId: 39, raw: await ecl(39) }], 0x02ee)).toEqual([]);
  });

  // ------------------------------------------------------------- I: three-block continuity run
  it('I. block 65 -> chain 75 -> chain 24, through ONE shared memory map (with negative controls)', async () => {
    const b65 = await ecl(65);
    // Block 65's own gates, byte-exact: the [0x01D0] re-entry fork and the [0x01CF] handoff gate.
    expect(hex(b65, 0x8022, 6)).toBe('03 00 ff 01 d0 01'); // COMPARE #255,[0x01D0]
    expect(hex(b65, 0x8171, 10)).toBe('03 01 cf 01 00 ff 17 01 01 8b'); // [0x01CF] != 255 -> skip
    expect(hex(b65, 0x8488, 3)).toBe('20 00 4b');

    const runBlock65 = (memory: Map<number, number>) => {
      const vm = new EclVm(b65, { dialect: D, entry: 22, seed: 1, memory });
      let r = vm.run();
      for (let i = 0; i < 8 && r.status === 'awaiting-input'; i++) r = vm.resume(0);
      return r;
    };

    // NEGATIVE CONTROL 1 — nothing armed: block 65 plays its antechamber line and exits.
    const bare = runBlock65(new Map());
    expect(bare.status).toBe('exited');
    expect(bare.chainBlockId).toBeUndefined();
    expect(printed(bare.effects)).toEqual([
      'IN THE ANTECHAMBER OF THE PALACE OF GOTHMENES, SILENCE REIGNS. THE SMALL SOUNDS YOU MAKE SEEM TO CURL UP AND DIE.',
    ]);

    // NEGATIVE CONTROL 2 — armed but without block 73's [0x01CF]: it chains to 73, NOT to 75.
    const partial = runBlock65(new Map([[0x01d0, 255]]));
    expect(partial.status).toBe('chain');
    expect(partial.chainBlockId).toBe(73);

    // THE HOP — both gates set: block 65 executes into `NEWECL #75`.
    const memory = new Map([
      [0x01d0, 255],
      [0x01cf, 255],
    ]);
    const hop1 = runBlock65(memory);
    expect(hop1.status).toBe('chain');
    expect(hop1.chainBlockId).toBe(75);
    expect(printed(hop1.effects)).toContain("'I WILL OCCUPY THE BALOR!'");
    expect(printed(hop1.effects)).toContain(
      'HE WEAVES AROUND THE POOL, WITH GOTHMENES FOLLOWING IN A DEADLY DANCE.',
    );

    // HOP 2 — the same memory map carried into block 75. DISCLOSED: re-entry is at the balor arm's
    // own vaddr, not at block 75's entry, because of the headless party-scan stop asserted in D.
    const hop2 = drive(await ecl(75), off(0x9252), memory);
    expect(hop2.result.status).toBe('chain');
    expect(hop2.result.chainBlockId).toBe(24);
    expect(memory.get(0x02ee)).toBe(255);

    // HOP 3 — the same memory map again: block 24 now passes its own gate and plays post-victory.
    const hop3 = new EclVm(await ecl(24), { dialect: D, entry: 22, seed: 1, memory }).run();
    expect(hop3.status).toBe('exited');
    expect(printed(hop3.effects)[0]).toBe(
      'YOU STAND ONCE AGAIN ON A PEACEFUL STREET IN PHLAN. TOWNSFOLK SCURRY ABOUT AND CHILDREN PLAY IN THE STREETS.',
    );
  });

  // ------------------------------------------------------- J: the physical approach exists in GEO
  it('J. GEO ships no map for 73/74/75, but block 65 IS a map whose arm-11 cells start the endgame', async () => {
    const geo = await geoBlocks();
    const ids = geo.map((b) => b.blockId);
    // The three endgame script blocks are cutscenes: no GEO map ships for any of them.
    expect(ids).not.toContain(73);
    expect(ids).not.toContain(74);
    expect(ids).not.toContain(75);
    expect(ids).toContain(65);

    const b65 = await ecl(65);
    // Block 65's cell dispatch: AND #63,[0x002D]->[0x009B] then a 12-arm ON_GOTO.
    expect(hex(b65, 0x8822, 9)).toBe('2f 00 3f 01 2d 00 01 9b 00');
    const dispatch = decodeInstructionAt(b65, off(0x8836), D.vbase!, D);
    expect(dispatch.ins?.mnemonic).toBe('ON_GOTO');
    expect(dispatch.ins?.args[1]?.word).toBe(12);
    expect(dispatch.ins?.args.slice(2).map((a) => a.word)).toEqual([
      0x8861, 0x8acd, 0x8b34, 0x8c26, 0x8f6e, 0x9049, 0x9122, 0x913f, 0x91ed, 0x9302, 0x9348, 0x95dd,
    ]);
    // Arm 11 (0-based) is the only one that starts the endgame arming chain.
    expect(hex(b65, 0x95dd, 9)).toBe('09 00 01 01 5d 02 20 00 4a'); // SAVE #1->[0x025D]; NEWECL #74

    const geo65 = geo.find((b) => b.blockId === 65)!.raw;
    expect(geo65.length).toBe(1026);
    expect(sha(geo65)).toBe('b032a6b0559a5df054550d72675e8666373244296c4a3a431123e42767588772');
    const desc = geo65.slice(514, 770);
    const arm11: Array<[number, number, number]> = [];
    for (let i = 0; i < 256; i++) if ((desc[i]! & 0x3f) === 11) arm11.push([i % 16, Math.floor(i / 16), desc[i]!]);
    expect(arm11).toEqual([
      [9, 7, 0x8b],
      [8, 8, 0x8b],
      [7, 9, 0x8b],
    ]);

    // All three are reachable over the real wall/door graph from block 65's own spawn.
    expect(hex(b65, 0x8044, 12)).toBe('09 00 00 01 34 00 09 00 00 01 35 00'); // SAVE #0->[34]/[35]
    const dist = bfs(geo65, [0, 0]);
    expect(dist.size).toBe(248);
    expect(arm11.map(([x, y]) => dist.get(y * 16 + x))).toEqual([36, 36, 36]);
  });

  // ------------------------------------------------- K: the walk itself, through the real engine
  //
  // Closes the gap this doc recorded as §10 item 3 ("No GEO walk"): case J proves the arm-11 cells
  // exist and are graph-reachable, but it does so with THIS FILE'S OWN `edgesOf`/`bfs` re-modelling
  // of the wall/door semantics, and it never runs the dispatch. Case K uses the engine's own
  // `Explorer.canMove` step rule and the real `EclVm`, so it is both an independent control on case
  // J's graph and the missing behavioural half.
  //
  // Same shape as the accepted `poolsQuestFlag.test.ts` GEO-walk case, on the same title.
  it('K. the real Explorer walks block 65 spawn -> an arm-11 cell, and the VM chains to block 74', async () => {
    const geo65 = (await geoBlocks()).find((b) => b.blockId === 65)!.raw;
    const map = decodeGeoBlock(geo65, 'Pools GEO1#65').map;

    type D4 = Dir;
    const DIRS: D4[] = ['north', 'east', 'south', 'west'];
    const probe = new Explorer(map, { x: 0, y: 0, facing: 'north' });
    const component = (sx: number, sy: number): Map<number, [number, D4] | null> => {
      const start = sy * 16 + sx;
      const prev = new Map<number, [number, D4] | null>([[start, null]]);
      const queue = [start];
      while (queue.length) {
        const i = queue.shift()!;
        const x = i % 16;
        const y = Math.floor(i / 16);
        for (const dir of DIRS) {
          probe.setPose({ x, y, facing: dir });
          if (!probe.canMove(dir)) continue;
          const [dx, dy] = DELTA[dir];
          const j = (y + dy) * 16 + (x + dx);
          if (!prev.has(j)) { prev.set(j, [i, dir]); queue.push(j); }
        }
      }
      return prev;
    };

    // (1) INDEPENDENT CONTROL ON CASE J. Block 65's own spawn is (0,0) (0x8044 SAVE #0 ->
    //     [0x0034]/[0x0035]). Under the ENGINE's step rule the reachable set is 248 cells — the
    //     same number case J's hand-rolled wall/door graph produces. Two independent models of the
    //     same bytes agree.
    const fromSpawn = component(0, 0);
    expect(fromSpawn.size).toBe(248);

    // The remainder is 6 isolated cells plus one 2-cell pocket: 248 + 6 + 2 = 256, exactly one
    // real component. (Case J asserts only the 248; the partition of the other 8 is new here.)
    const seen = new Set<number>();
    const sizes = new Map<number, number>();
    for (let s = 0; s < 256; s += 1) {
      if (seen.has(s)) continue;
      const comp = component(s % 16, Math.floor(s / 16));
      sizes.set(comp.size, (sizes.get(comp.size) ?? 0) + 1);
      for (const k of comp.keys()) seen.add(k);
    }
    expect(Object.fromEntries(sizes)).toEqual({ 1: 6, 2: 1, 248: 1 });

    // (2) THE WALK. Reconstruct the shortest legal path to the first arm-11 cell (9,7) and walk it
    //     one step at a time with the real Explorer, asserting every step is legal and moves.
    const path: D4[] = [];
    for (let cur = 7 * 16 + 9; ;) {
      const back = fromSpawn.get(cur);
      if (!back) break;
      path.unshift(back[1]);
      cur = back[0];
    }
    expect(path).toHaveLength(36); // matches case J's independent BFS distance

    const explorer = new Explorer(map, { x: 0, y: 0, facing: 'north' });
    const crossed: number[] = [];
    for (const dir of path) {
      explorer.setPose({ ...explorer.getPose(), facing: dir });
      expect(explorer.canMove(dir)).toBe(true);
      expect(explorer.forward().moved).toBe(true);
      crossed.push((explorer.currentCell().floor ?? 0) & 0x3f);
    }
    const pose = explorer.getPose();
    expect({ x: pose.x, y: pose.y }).toEqual({ x: 9, y: 7 });
    expect(explorer.currentCell().floor).toBe(0x8b);

    // (3) DISCLOSURE, ASSERTED RATHER THAN NARRATED. This is geometric reachability, NOT an
    //     uninterrupted playthrough. The shortest path crosses nine other masked descriptors, and
    //     descriptor 0 — crossed once, at step 22 — is itself a combat arm (proved in (5) below).
    //     A live party would fight there. The same limitation is stated for the accepted
    //     `poolsQuestFlag.test.ts` walk.
    expect([...new Set(crossed)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 5, 6, 9, 10, 11, 55]);
    expect(crossed.filter((d) => d === 0)).toHaveLength(1);
    expect(crossed[crossed.length - 1]).toBe(11); // the walk ends ON arm 11

    // (4) THE DISPATCH. Hand the arrival cell's real descriptor byte to block 65's own
    //     search_location. Pools reads the raw GEO descriptor from [0x002D] (D.cellDescAddr), so
    //     `primeSearchLocation` seeds exactly the byte the map holds.
    const b65 = await ecl(65);
    const runCell = (backdrop: number) => {
      const memory = new Map<number, number>();
      const vm = primeSearchLocation(b65, backdrop, {
        memory, dialect: D, seed: 0x1234, seedMemory: { 0x0034: 9, 0x0035: 7 },
      })!;
      let turn = vm.run();
      let guard = 0;
      while (turn.status === 'awaiting-input' && guard++ < 6) turn = vm.resume(0);
      return { turn, memory };
    };

    const arrival = runCell(0x8b);
    expect(arrival.memory.get(0x009b)).toBe(11); // AND #63 -> arm index 11
    expect(arrival.turn.status).toBe('chain');
    expect(arrival.turn.chainBlockId).toBe(74); // 0x95DD: SAVE #1 -> [0x025D]; NEWECL #74
    expect(arrival.memory.get(0x025d)).toBe(1); // the endgame arming write

    // (5) NEGATIVE CONTROLS on the SAME block, SAME handler, SAME seed — only the map byte differs.
    //     Arm 10 (0x8A, ON_GOTO target 0x9348) exits with no chain and no arming write; arm 0
    //     (0x00, target 0x8861) is an ordinary combat cell. Neither reaches block 74, so the
    //     endgame handoff is caused by the CELL DESCRIPTOR, not by priming the handler at all.
    const arm10 = runCell(0x8a);
    expect(arm10.memory.get(0x009b)).toBe(10);
    expect(arm10.turn.status).toBe('exited');
    expect(arm10.turn.chainBlockId).toBeUndefined();
    expect(arm10.memory.get(0x025d)).toBeUndefined();

    const arm0 = runCell(0x00);
    expect(arm0.memory.get(0x009b)).toBe(0);
    expect(arm0.turn.status).toBe('combat');
    expect(arm0.turn.chainBlockId).toBeUndefined();
    expect(arm0.memory.get(0x025d)).toBeUndefined();
  });
});
