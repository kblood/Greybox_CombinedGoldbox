/**
 * Pools of Darkness — QUEST leg golden: `[0x0208]`, "Kalistes slain".
 *
 * NAMING, disclosed 2026-08-06: "Kalistes slain" is a LABEL COINED BY THIS PROJECT, not a retail
 * string — NO SUCH LITERAL EXISTS ANYWHERE IN THE INSTALL. The retail artefact is the word
 * `[0x0208]` and the instructions that touch it. Do not quote the name as if the game used it.
 *
 * WHAT THIS TEST ESTABLISHES (all from real retail bytes under the GOG install, no fixtures):
 *   1. RAW BYTE ANCHORS. The exact instruction bytes at the sole LITERAL-ADDRESS writer
 *      (`ECL1.DAX#82 @0x9ACE`,
 *      `SAVE #1 -> [0x0208]`, on the VICTORY arm of the Kalistes fight) and at the three driven
 *      consumers (`ECL1#64 @0x8289`, `ECL1#19 @0x8886`, `ECL1#48 @0x8339`), plus the `ON_GOTO`
 *      dispatch arm that reaches each of them.
 *   2. A CORPUS-WIDE, CONTROL-FLOW-FREE CANDIDATE CENSUS. Every Gen1 three-byte word-bearing code
 *      (`0x01/0x02/0x03/0x81`; code `0x02` is a 16-bit immediate and can be a false candidate) and
 *      short code `0x7F`, followed by bytes `08 02`, over
 *      EVERY decompressed block of EVERY one of the 25 `.DAX` archives in the install. Exactly 76
 *      hits: 62 in `ECL1.DAX` (1 writer + 60 `COMPARE` reads + 1 data coincidence) and 14 byte
 *      coincidences inside compressed graphics/sound payloads. The 6-byte writer pattern occurs
 *      EXACTLY ONCE in the whole install.
 *   3. THE READS ARE SPREAD ACROSS 16 BLOCKS, 15 of them foreign to the writer — the substitute
 *      for cross-archive discrimination (see below).
 *   4. THE EARLY LEG'S WORDS ARE NOT QUEST FLAGS. `[0x0278]` and `[0x0276]` (established by the
 *      already-proven `early` leg) are censused the same way and shown to be block-local /
 *      two-block-local. Asserted, not assumed, because the brief required the check.
 *   5. GEO GROUND TRUTH + A LEGAL WALK. `GEO1#84` carries masked descriptor 27 at exactly (2,6)
 *      and (2,10); its walk graph under the engine's OWN `Explorer` step rule is one 239-cell
 *      component plus 17 isolated cells; the capture-cinematic drop point (1,1) — which the block
 *      writes itself at `0x81C2` — and both descriptor-27 cells are in that component, and the
 *      34-step path is walked with the real `Explorer`.
 *   6. THE SETTER IN THE REAL VM, AND THE NEGATIVE CONTROL. Victory over the Kalistes roster
 *      (13x1 / 37x7 / 40x8 / 7x5) writes `[0x0208] = 1`. `fled` AND `defeat` take
 *      `0x9AC9 IF_NE -> GOTO 0x9CEE` and the word is NEVER WRITTEN AT ALL. Two further retail
 *      controls: the flag already set makes the cell an immediate no-op `EXIT`, and `[0x020B]`
 *      bit 7 clear reaches a different scene with no combat and no write.
 *   7. THREE CONSUMERS, THREE BLOCKS, THREE DIFFERENT KINDS OF EFFECT, each driven BOTH
 *      DIRECTIONS end to end by carrying the setter's own memory map forward, AND from a bare
 *      seeded memory that isolates the flag as the cause:
 *        - `#64` the Iron Wall: the same YES chains to script block 74 vs script block 65.
 *          CORRECTED 2026-08-06 — this is NOT "a different area". It re-points a `NEWECL` to a
 *          DIFFERENT RESIDENT SCRIPT OVER THE SAME GEO MAP: there is no `GEO1#74`, and
 *          `ECL1#65 @0x803F` and `ECL1#74 @0x805D` BOTH run `LOAD_FILES #65,#4` and both then set
 *          `[0x0034]=0`, `[0x0035]=0`, `[0x0011]=1` — identical map, identical entry cell and
 *          facing. The observable difference is which block's events/monsters are resident, plus
 *          `[0x009C]` = 48 (#74) vs 45 (#65). Real and structural, but never a map/area change.
 *          Asserted from the retail bytes in the byte-anchor test below;
 *        - `#19` the Zhentil Keep gate: `DROW`/`picId 35` vs `ZHENTARIM`/`spriteId 79`;
 *        - `#48` TRANED: the sentence " THEY NEED HELP! " present vs absent.
 *
 * WHAT IT DOES **NOT** ESTABLISH:
 *   - CROSS-ARCHIVE discrimination. Pools of Darkness ships exactly ONE script archive
 *     (`ECL1.DAX`, 329,456 bytes, 56 blocks), so the writer-in-one-file / reader-in-another shape
 *     used by the Gateway and NWN quest-flag goldens is STRUCTURALLY IMPOSSIBLE for this title.
 *     The corpus-wide census in (2) plus the 16-block spread in (3) is the substitute, and it is
 *     a WEAKER claim. Do NOT cite this leg as equivalent to those. Same precedent as
 *     `treasuresQuestFlag.test.ts`.
 *   - "SOLE WRITER" IN ANY WIDER SENSE THAN THE LITERAL-ADDRESS CENSUS (scope stated 2026-08-06).
 *     The census matches operands naming the address LITERALLY
 *     (`<code in 0x01/0x02/0x03/0x7F/0x81> 08 02`). The VM's `SAVE_TABLE` (0x35) writes a COMPUTED
 *     `base+offset`, so a computed-address write would be INVISIBLE to it; a bounded scan found
 *     only one candidate base (0x0116) within an 8-bit offset of 0x0208, so the residual risk is
 *     low but NON-ZERO.
 *   - That the host (`GAME.EXE`/`GAME.OVR`) never writes `[0x0208]` itself. UNLOCATED — NO HOST
 *     DISASSEMBLY WAS DONE IN ANY PASS. The census covers the SCRIPT corpus only, and this remains
 *     the single strongest counter-argument to the leg.
 *   - PERSISTENCE ACROSS AREA CHANGE, which is ASSUMED WITH NO POSITIVE EVIDENCE.
 *     WITHDRAWN 2026-08-06: the earlier "every block re-claims `[0x0016]` in its own
 *     `initial_entry`" argument is retracted. `[0x0016]` is HOST-WRITTEN by `CMD_NewECL`, so its
 *     correctness after a chain is supplied by the engine and says NOTHING about whether the ECL
 *     word array (and hence `[0x0208]`) survives a `NEWECL`. No save/reload round-trip is
 *     established; no save-format work was done. THIS GOLDEN ASSERTS THE WIRING ONLY.
 *   - That the §5 walk is an UNINTERRUPTED playthrough. It is geometric reachability under the
 *     real `Explorer` rule; the shortest path crosses other event descriptors that would fire
 *     their own arms in a live game. The setter arm is driven with `primeSearchLocation`, exactly
 *     as the accepted Treasures golden does.
 *   - SOLE CAUSATION at the setter cell: `[0x020B]` bit 7 ("Kalistes has noticed you") is a real
 *     precondition. It is seeded openly and its absence is asserted as its own control, not hidden.
 *
 * Full evidence chain, rejected candidates, caveats and the 2026-08-06 re-verification table:
 * docs/engine/research/pools-quest-flag.md
 */
import { describe, it, expect } from 'vitest';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DialogueRunner,
  EclVm,
  Explorer,
  ECL_GEN1_SHORT_POOLS,
  decodeGeoBlock,
  primeSearchLocation,
  readDaxDataBlocks,
} from '../src/index.js';
import type { Direction } from '../src/model/index.js';

const root = 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness';
const eclPath = resolve(root, 'ECL1.DAX');
const geoPath = resolve(root, 'GEO1.DAX');
const haveRetail = existsSync(eclPath) && existsSync(geoPath);

/** Gen1 addressing for this title: vbase 0x7FFE, addend 0x8000 => block offset = vaddr - 0x8000 + 2. */
const offsetOf = (vaddr: number): number => vaddr - 0x8000 + 2;
/** Hex-dump `len` bytes of a decompressed block at an ECL virtual address. */
function at(raw: Uint8Array, vaddr: number, len: number): string {
  return [...raw.slice(offsetOf(vaddr), offsetOf(vaddr) + len)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

async function eclBlock(id: number): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(eclPath)));
  const found = blocks.find((b) => b.blockId === id);
  if (!found) throw new Error(`ECL1.DAX has no block ${id}`);
  return found.raw;
}
async function geoMap(id: number) {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(geoPath)));
  const found = blocks.find((b) => b.blockId === id);
  if (!found) throw new Error(`GEO1.DAX has no block ${id}`);
  return decodeGeoBlock(found.raw, `Pools GEO1#${id}`).map;
}

/** Answer YES / take the equal branch at every host callback (PARTY_SURPRISE, prompts). */
const yesCall = () => ({ comparison: { left: 0, right: 1 } });

const QUEST_FLAG = 0x0208; //  coined label "Kalistes slain" — NOT a retail string (see docblock)
const NOTICED = 0x020b; //     ECL1#82-local bitfield; bit 7 = "she has noticed you"
const SCENE = 0x0212; //       ECL1#82/#84 scene selector
const PARTY_SIZE = 0x0020;
const FACING = 0x0011; //      0 = N, 1 = E, 2 = S, 3 = W
const WALL_RUINED = 0x01bb; // ECL1#64-local: the Iron Wall is already destroyed
const WALL_GATE = 0x01bd; //   ECL1#64-local dispatch gate
const GATE_SEEN = 0x00a7; //   ECL1#19-local: bit 0
const MANSHOON = 0x0162; //    the runner-up flag, seeded so #48 reaches the [0x0208] compare

/** The setter cell's raw GEO descriptor byte: GEO1#84 (2,6) and (2,10) both hold 155; 155 & 63 = 27. */
const SETTER_DESCRIPTOR = 155;

type Effect = { type: string; [k: string]: unknown };
type RunResult = { status: string; effects: readonly Effect[]; at?: { vaddr: number } };

/**
 * Drive `ECL1#82` from its descriptor-27 cell and resolve the Kalistes fight.
 * `outcome` is the ONLY thing that differs between the positive run and the negative control.
 * `[0x020B]` bit 7 must be seeded — being noticed is a real precondition of this arm (see the
 * dedicated control below, which asserts what happens without it).
 */
function runSetter(
  block82: Uint8Array,
  outcome: 'victory' | 'fled' | 'defeat',
  seedFlag?: number,
): { memory: Map<number, number>; roster: Effect | undefined; r1: RunResult; r2: RunResult } {
  const memory = new Map<number, number>([[NOTICED, 128], [PARTY_SIZE, 6]]);
  if (seedFlag !== undefined) memory.set(QUEST_FLAG, seedFlag);
  const vm = primeSearchLocation(block82, SETTER_DESCRIPTOR, {
    memory,
    facing: 'north',
    dialect: ECL_GEN1_SHORT_POOLS,
    seed: 0x1234,
    onCall: yesCall,
    findCharacter: () => null,
  });
  expect(vm).not.toBeNull();
  const r1 = vm!.run() as unknown as RunResult;
  const roster = r1.effects.find((e) => e.type === 'combat');
  const r2 = vm!.resume(0, { combatOutcome: outcome }) as unknown as RunResult;
  return { memory, roster, r1, r2 };
}

/** Collect the printed text of a run, so a present/absent sentence assertion is unambiguous. */
const textOf = (r: RunResult): string =>
  r.effects.filter((e) => e.type === 'print').map((e) => String(e.text ?? '')).join('');

describe.skipIf(!haveRetail)(
  'Pools of Darkness — quest flag [0x0208] (coined label "Kalistes slain"; real retail bytes)',
  () => {
    it('pins the sole writer, the three consumers and their dispatch arms at exact retail bytes', async () => {
      const b82 = await eclBlock(82);
      const b64 = await eclBlock(64);
      const b19 = await eclBlock(19);
      const b48 = await eclBlock(48);

      // Block sizes, so a different install/version fails loudly instead of drifting silently.
      expect([b19.length, b48.length, b64.length, b82.length]).toEqual([6295, 5179, 7644, 7424]);

      // --- the setter, ECL1#82 (Kalistes' parlor + basement) ------------------------------
      // The descriptor-27 arm: re-entry guard, the "noticed" precondition, then the fight.
      expect(at(b82, 0x993e, 6)).toBe('03 00 01 01 08 02'); // COMPARE #1, [0x0208]
      expect(at(b82, 0x9944, 1)).toBe('16'); //                IF_EQ
      expect(at(b82, 0x9945, 1)).toBe('00'); //                EXIT  <- already dead: a no-op cell
      expect(at(b82, 0x9946, 9)).toBe('2f 00 80 01 0b 02 01 c0 00'); // AND #128,[0x020B],[0x00C0]
      expect(at(b82, 0x994f, 1)).toBe('17'); //                IF_NE
      expect(at(b82, 0x9950, 4)).toBe('01 01 08 9a'); //       GOTO 0x9A08 (she has noticed you)
      expect(at(b82, 0x9954, 6)).toBe('09 00 23 01 12 02'); // SAVE #35 -> [0x0212] (no fight)
      // The fight itself.
      expect(at(b82, 0x9a08, 9)).toBe('0c 00 ff 00 01 00 0d 00 00'); // SETUP_MONSTER
      expect(at(b82, 0x9a40, 9)).toBe('30 00 80 01 0b 02 01 0b 02'); // OR #128 -> [0x020B] (noticed)
      expect(at(b82, 0x9aac, 7)).toBe('0b 00 0d 00 01 00 0d'); // LOAD_MONSTER #13,#1  KALISTES
      expect(at(b82, 0x9ab3, 7)).toBe('0b 00 25 00 07 00 25'); // LOAD_MONSTER #37,#7  DROW CHAMPION
      expect(at(b82, 0x9aba, 7)).toBe('0b 00 28 00 08 00 28'); // LOAD_MONSTER #40,#8  DROW WIZARD
      expect(at(b82, 0x9ac1, 7)).toBe('0b 00 07 00 05 00 07'); // LOAD_MONSTER #7,#5   PET OF KALISTES
      expect(at(b82, 0x9ac8, 1)).toBe('24'); //                COMBAT
      expect(at(b82, 0x9ac9, 1)).toBe('17'); //                IF_NE
      expect(at(b82, 0x9aca, 4)).toBe('01 01 ee 9c'); //       GOTO 0x9CEE  <- lost/fled, NO write
      expect(at(b82, 0x9ace, 6)).toBe('09 00 01 01 08 02'); // SAVE #1 -> [0x0208]  <-- THE SETTER
      expect(at(b82, 0x9ad4, 3)).toBe('0e 00 8a'); //          PICTURE #138
      expect(at(b82, 0x9add, 6)).toBe('09 00 25 01 12 02'); // SAVE #37 -> [0x0212]
      // Gen1 SAVE operand order is (source, DESTINATION) — destination last. `09 00 01 01 08 02`
      // is therefore "write immediate 1 into word 0x0208", not "write [0x0208] into 1".
      // The bounce arm and the terminal instruction it falls into.
      expect(at(b82, 0x9cee, 14)).toBe('09 01 17 00 01 34 00 09 01 18 00 01 35 00'); // restore X/Y
      expect(at(b82, 0x9cfc, 1)).toBe('23'); //                SURPRISE (script-terminal)
      expect(at(b82, 0x9cd2, 3)).toBe('20 00 54'); //          NEWECL #84 (the victory tail)

      // The block serves BOTH GEO map 82 and GEO map 84, and writes the drop point itself.
      // CORRECTED 2026-08-06: these two COMPAREs test the DEPARTED BLOCK ID, not a "current area
      // id". [0x0016] is this dialect's `lastBlockIdAddr`, HOST-written by Pools' own CMD_NewECL
      // (GAME.OVR+0x0e4a, EclBlockId at Area+0x15). They are pinned here as retail bytes only and
      // must NOT be cited as an area-id recognition proof — the "#82 serves both maps" claim rests
      // on the 0x81C2 LOAD_FILES #84 path and the disjoint descriptor partition instead.
      expect(at(b82, 0x8014, 8)).toBe('03 00 52 01 16 00 16 00'); // COMPARE #82,[0x0016]/IF_EQ/EXIT
      expect(at(b82, 0x801c, 11)).toBe('03 00 54 01 16 00 16 01 01 87 85'); // ...#84/IF_EQ/GOTO 0x8587
      expect(at(b82, 0x81c2, 5)).toBe('21 00 54 00 05'); //    LOAD_FILES #84, #5
      expect(at(b82, 0x81c7, 12)).toBe('09 00 01 01 34 00 09 00 01 01 35 00'); // -> (1,1)
      expect(at(b82, 0x81df, 6)).toBe('09 00 02 01 11 00'); // SAVE #2 -> [0x0011] (facing south)
      expect(at(b82, 0x877b, 9)).toBe('2f 00 3f 01 2d 00 01 c0 00'); // AND #63, [0x002D], [0x00C0]

      // --- consumer A, ECL1#64 (the Iron Wall) — the headline -----------------------------
      expect(at(b64, 0x81ef, 6)).toBe('03 01 11 00 00 03'); // COMPARE [0x0011], #3 (facing WEST)
      expect(at(b64, 0x81f7, 9)).toBe('2f 00 ff 01 bb 01 01 c0 00'); // AND #255,[0x01BB],[0x00C0]
      expect(at(b64, 0x8200, 5)).toBe('17 01 01 34 82'); //    IF_NE ; GOTO 0x8234 (wall in ruins)
      expect(at(b64, 0x8262, 1)).toBe('22'); //                PARTY_SURPRISE (the YES/NO prompt)
      expect(at(b64, 0x8289, 6)).toBe('03 01 08 02 00 00'); // COMPARE [0x0208], #0
      expect(at(b64, 0x828f, 1)).toBe('17'); //                IF_NE
      expect(at(b64, 0x8290, 3)).toBe('20 00 41'); //          NEWECL #65  <- Kalistes DEAD
      expect(at(b64, 0x8293, 3)).toBe('20 00 4a'); //          NEWECL #74  <- Kalistes ALIVE

      // CORRECTED 2026-08-06 — the two NEWECL targets are NOT two areas. There is no GEO1#74, and
      // both target blocks load the SAME map at the SAME cell with the SAME facing; only residency
      // and [0x009C] differ. Asserted from the retail bytes so the prose cannot drift back:
      const geoIds = readDaxDataBlocks(new Uint8Array(await readFile(geoPath)))
        .map((b) => b.blockId)
        .sort((a, b) => a - b);
      expect(geoIds).toContain(65);
      expect(geoIds).not.toContain(74); //                     there is no GEO1#74
      const b65 = await eclBlock(65);
      const b74 = await eclBlock(74);
      //          LOAD_FILES #65,#4 ; [0x0034]=0 ; [0x0035]=0 ; [0x0011]=1 — byte-identical prefix
      const samePrefix = '21 00 41 00 04 09 00 00 01 34 00 09 00 00 01 35 00 09 00 01 01 11 00';
      expect(at(b65, 0x803f, 23)).toBe(samePrefix);
      expect(at(b74, 0x805d, 23)).toBe(samePrefix);
      //          the observable difference: [0x009C] = 45 (#65) vs 48 (#74)
      expect(at(b65, 0x8039, 6)).toBe('09 00 2d 01 9c 00'); // SAVE #45 -> [0x009C]
      expect(at(b74, 0x8057, 6)).toBe('09 00 30 01 9c 00'); // SAVE #48 -> [0x009C]

      // --- consumer B, ECL1#19 (the gate to Zhentil Keep) ---------------------------------
      // CORRECTED 2026-08-06: 0x81EF is the search_location ENTRY; the descriptor MASK is twelve
      // bytes later at 0x81FB. An earlier revision conflated the two.
      expect(at(b19, 0x81ef, 6)).toBe('09 00 00 01 39 00'); // entry: SAVE #0  -> [0x0039]
      expect(at(b19, 0x81f5, 6)).toBe('09 00 50 01 1b 00'); //        SAVE #80 -> [0x001B]
      expect(at(b19, 0x81fb, 9)).toBe('2f 01 2d 00 00 3f 01 bf 00'); // MASK: AND [0x002D],#63,[0x00BF]
      expect(at(b19, 0x8873, 6)).toBe('03 01 11 00 00 00'); // COMPARE [0x0011], #0 (facing NORTH)
      expect(at(b19, 0x8886, 6)).toBe('03 01 08 02 00 00'); // COMPARE [0x0208], #0
      expect(at(b19, 0x888d, 9)).toBe('0c 00 4f 00 00 00 ff 00 00'); // SETUP_MONSTER #79 ZHENTARIM
      expect(at(b19, 0x88a2, 9)).toBe('0c 00 ff 00 00 00 23 00 00'); // SETUP_MONSTER pic #35 DROW

      // --- consumer C, ECL1#48 (TRANED) ---------------------------------------------------
      expect(at(b48, 0x8339, 6)).toBe('03 01 08 02 00 01'); // COMPARE [0x0208], #1
      expect(at(b48, 0x833f, 1)).toBe('17'); //                IF_NE
      expect(at(b48, 0x8340, 3)).toBe('11 80 0d'); //          PRINT " THEY NEED HELP! "
      expect(at(b48, 0x8350, 6)).toBe('03 01 62 01 00 ff'); // COMPARE [0x0162], #255 — a DIFFERENT
      //   word using the identical idiom two instructions later: a guard against reading the
      //   [0x0208] test as "really some other state".
    });

    it('reaches each consumer through the block\'s own ON_GOTO dispatch arm', async () => {
      // Decode the ON_GOTO arm tables rather than asserting a hand-copied target: each arm is a
      // 3-byte `01 <lo> <hi>` address entry following a 6-byte header whose last byte is the count.
      const armsOf = (raw: Uint8Array, vaddr: number): number[] => {
        const o = offsetOf(vaddr);
        expect(raw[o]).toBe(0x25); // ON_GOTO
        const count = raw[o + 5]!;
        return Array.from({ length: count }, (_, k) => {
          const p = o + 6 + k * 3;
          expect(raw[p]).toBe(0x01); // an address operand, not an immediate
          return raw[p + 1]! | (raw[p + 2]! << 8);
        });
      };

      const arms82 = armsOf(await eclBlock(82), 0x8784);
      expect(arms82).toHaveLength(31);
      expect(arms82[27]).toBe(0x993e); // the setter cell (masked descriptor 27)
      expect(arms82[28]).toBe(0x8543); // the ladder back up to the parlor — corroborates the
      //                                  "#82 serves GEO1#84 too" reading of §3a.

      const arms64 = armsOf(await eclBlock(64), 0x86b2);
      expect(arms64).toHaveLength(24);
      expect(arms64[1]).toBe(0x81ef); // the Iron Wall arm

      const arms19 = armsOf(await eclBlock(19), 0x8204);
      expect(arms19).toHaveLength(22);
      expect(arms19[1]).toBe(0x8873); // the Zhentil Keep gate arm
    });

    it('censuses every .DAX in the install: one literal-address writer, 60 reads, 16 blocks, no collision', async () => {
      // Control-flow-free: no CFG model, no dialect, no instruction decoding. This is the
      // substitute for the cross-archive discrimination this ONE-ARCHIVE title cannot offer.
      // All five operand codes the VM can dereference to a word are scanned, not just `0x01`.
      const CODES = new Set([0x01, 0x02, 0x03, 0x7f, 0x81]);
      const names = (await readdir(root)).filter((n) => n.toUpperCase().endsWith('.DAX'));
      expect(names.length).toBe(25); // a real install, not a stub

      const perArchive = new Map<string, number>();
      const perEclBlock = new Map<number, number>();
      const failures: string[] = [];
      const writerHits: string[] = [];
      let total = 0;

      for (const name of names.sort()) {
        let blocks;
        try {
          blocks = readDaxDataBlocks(new Uint8Array(await readFile(resolve(root, name))));
        } catch (err) {
          failures.push(`${name}: ${String(err)}`);
          continue;
        }
        for (const blk of blocks) {
          const raw = blk.raw;
          for (let i = 0; i + 3 <= raw.length; i += 1) {
            // the little-endian address word 0x0208, preceded by a dereferenceable operand code
            if (raw[i + 1] === 0x08 && raw[i + 2] === 0x02 && CODES.has(raw[i]!)) {
              total += 1;
              perArchive.set(name, (perArchive.get(name) ?? 0) + 1);
              if (name.toUpperCase() === 'ECL1.DAX') {
                perEclBlock.set(blk.blockId, (perEclBlock.get(blk.blockId) ?? 0) + 1);
              }
            }
            // the complete 6-byte writer instruction `SAVE #1 -> [0x0208]`
            if (
              raw[i] === 0x09 && raw[i + 1] === 0x00 && raw[i + 2] === 0x01 &&
              raw[i + 3] === 0x01 && raw[i + 4] === 0x08 && raw[i + 5] === 0x02
            ) {
              writerHits.push(`${name}#${blk.blockId}@0x${(i + 0x8000 - 2).toString(16)}`);
            }
          }
        }
      }

      // Every archive must have decoded, or the census would be silently incomplete.
      expect(failures).toEqual([]);
      expect(total).toBe(76);
      expect(Object.fromEntries([...perArchive].sort())).toEqual({
        'CBODY.DAX': 3, //     byte coincidences inside compressed picture payloads
        'ECL1.DAX': 62, //     the only script archive
        'MON1CHA.DAX': 3, //   monster records
        'MUSIC.DAX': 1,
        'PIC1.DAX': 6,
        'SPRIT1.DAX': 1,
      });

      // THE CENTRAL CLAIM: exactly one LITERAL-ADDRESS writer in the entire install.
      // SCOPE, stated 2026-08-06: this census matches operands naming the address LITERALLY. A
      // COMPUTED write via the VM's SAVE_TABLE (0x35) `base+offset` form would be invisible to it
      // (one candidate base, 0x0116, sits within an 8-bit offset of 0x0208 — residual risk low but
      // NON-ZERO), and whether GAME.EXE/GAME.OVR writes the word is UNLOCATED. Do not read this
      // assertion as "nothing anywhere writes [0x0208] except this instruction".
      expect(writerHits).toEqual(['ECL1.DAX#82@0x9ace']);
      // ...and 0x9ACE - 0x8000 + 2 = 6864 is its decompressed-block offset.
      expect(offsetOf(0x9ace)).toBe(6864);

      // 62 = 1 write + 60 COMPARE reads + 1 data coincidence (in #83, inside a byte table).
      expect(Object.fromEntries([...perEclBlock].sort((a, b) => a[0] - b[0]))).toEqual({
        17: 1, 18: 4, 19: 5, 23: 1, 35: 2, 38: 1, 48: 3, 49: 2,
        64: 1, 68: 3, 69: 5, 71: 2, 80: 1, 82: 22, 83: 8, 85: 1,
      });
      const blocksTouching = [...perEclBlock.keys()];
      expect(blocksTouching).toHaveLength(16);
      // 15 of the 16 are FOREIGN to the writer's own block — the spread that substitutes for
      // cross-archive separation. It is a weaker argument; see the header.
      expect(blocksTouching.filter((b) => b !== 82)).toHaveLength(15);
    });

    it('checks the early leg\'s [0x0276]/[0x0278]: neither is a quest flag (disclosure)', async () => {
      // The proven `early` leg observes [0x0276] |= 2 and [0x0278] = 1. The brief required a check
      // that other blocks do not reuse these words for unrelated purposes — on a sibling title
      // exactly this check demoted a "persistent state" claim to "per-area persistent slot".
      // The answer here is: no reuse, but ONLY because almost nothing else touches them at all.
      const CODES = new Set([0x01, 0x02, 0x03, 0x7f, 0x81]);
      const names = (await readdir(root)).filter((n) => n.toUpperCase().endsWith('.DAX'));

      const censusOf = async (lo: number, hi: number) => {
        const out = new Map<string, number>();
        for (const name of names.sort()) {
          const blocks = readDaxDataBlocks(new Uint8Array(await readFile(resolve(root, name))));
          for (const blk of blocks) {
            const raw = blk.raw;
            for (let i = 0; i + 3 <= raw.length; i += 1) {
              if (raw[i + 1] === lo && raw[i + 2] === hi && CODES.has(raw[i]!)) {
                const key = `${name}#${blk.blockId}`;
                out.set(key, (out.get(key) ?? 0) + 1);
              }
            }
          }
        }
        return Object.fromEntries([...out].sort());
      };

      // [0x0278] — entirely block-local to ECL1#69 (plus one graphics-payload coincidence).
      expect(await censusOf(0x78, 0x02)).toEqual({ 'ECL1.DAX#69': 5, 'PIC1.DAX#142': 1 });
      // [0x0276] — a per-area BITFIELD spanning only #69/#72, which are the SAME scene.
      expect(await censusOf(0x76, 0x02)).toEqual({ 'ECL1.DAX#69': 16, 'ECL1.DAX#72': 3 });

      // Contrast: the quest flag is touched by 16 blocks. That difference is the whole reason
      // [0x0208] was chosen over the early leg's two words.
    });

    it('places descriptor 27 at (2,6)/(2,10) in GEO1#84 and walks there from the drop point', async () => {
      const map84 = await geoMap(84);
      const cells = map84.cells
        .map((cell, i) => ({ cell, x: i % 16, y: Math.floor(i / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 27);
      expect(cells.map(({ x, y }) => `${x},${y}`).sort()).toEqual(['2,10', '2,6']);
      expect(cells.map(({ cell }) => cell.floor)).toEqual([SETTER_DESCRIPTOR, SETTER_DESCRIPTOR]);

      // The two GEO maps ECL1#82 serves partition the descriptor space: #82 owns the low arms,
      // #84 the high arms, disjoint on every non-zero value. This is why one block can serve both.
      const masked = (m: { cells: readonly { floor?: number }[] }) =>
        [...new Set(m.cells.map((c) => (c.floor ?? 0) & 0x3f))].sort((a, b) => a - b);
      expect(masked(await geoMap(82))).toEqual([...Array(16).keys()]); // {0..15}
      expect(masked(map84)).toEqual([0, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29]);

      // Walk-graph shape under the engine's OWN step rule (Explorer.canMove), computed by BFS
      // over the real map rather than re-modelling the wall/door semantics here.
      const probe = new Explorer(map84, { x: 0, y: 0, facing: 'north' });
      const DIRS: Direction[] = ['north', 'east', 'south', 'west'];
      const DELTA: Record<Direction, { dx: number; dy: number }> = {
        north: { dx: 0, dy: -1 }, east: { dx: 1, dy: 0 },
        south: { dx: 0, dy: 1 }, west: { dx: -1, dy: 0 },
      };
      const component = (sx: number, sy: number): Map<number, [number, Direction] | null> => {
        const start = sy * 16 + sx;
        const prev = new Map<number, [number, Direction] | null>([[start, null]]);
        const queue = [start];
        while (queue.length) {
          const i = queue.shift()!;
          const x = i % 16, y = Math.floor(i / 16);
          for (const dir of DIRS) {
            probe.setPose({ x, y, facing: dir });
            if (!probe.canMove(dir)) continue;
            const j = (y + DELTA[dir].dy) * 16 + (x + DELTA[dir].dx);
            if (!prev.has(j)) { prev.set(j, [i, dir]); queue.push(j); }
          }
        }
        return prev;
      };

      // ECL1#82 writes the capture-cinematic drop point itself: SAVE #1 -> [0x0034]/[0x0035].
      const fromDrop = component(1, 1);
      expect(fromDrop.size).toBe(239);
      expect(fromDrop.has(6 * 16 + 2)).toBe(true); //  (2,6)
      expect(fromDrop.has(10 * 16 + 2)).toBe(true); // (2,10)

      // The rest of the map is 17 isolated single cells — i.e. there is exactly one real component.
      const sizes = new Map<number, number>();
      const seen = new Set<number>();
      for (let s = 0; s < 256; s += 1) {
        if (seen.has(s)) continue;
        const comp = component(s % 16, Math.floor(s / 16));
        sizes.set(comp.size, (sizes.get(comp.size) ?? 0) + 1);
        for (const k of comp.keys()) seen.add(k);
      }
      expect(Object.fromEntries(sizes)).toEqual({ 1: 17, 239: 1 });

      // Now walk the shortest legal path with the real Explorer, step by step.
      const path: Direction[] = [];
      for (let cur = 6 * 16 + 2; ; ) {
        const back = fromDrop.get(cur);
        if (!back) break;
        path.unshift(back[1]);
        cur = back[0];
      }
      expect(path).toHaveLength(34);

      const explorer = new Explorer(map84, { x: 1, y: 1, facing: 'south' });
      for (const dir of path) {
        explorer.setPose({ ...explorer.getPose(), facing: dir });
        expect(explorer.canMove(dir)).toBe(true);
        expect(explorer.forward().moved).toBe(true);
      }
      const pose = explorer.getPose();
      expect({ x: pose.x, y: pose.y }).toEqual({ x: 2, y: 6 });
      expect(explorer.currentCell().floor).toBe(SETTER_DESCRIPTOR);
    });

    it('writes [0x0208] on the Kalistes VICTORY arm and NEVER on the flee/defeat arm', async () => {
      const b82 = await eclBlock(82);

      // POSITIVE.
      const win = runSetter(b82, 'victory');
      expect(win.r1.status).toBe('combat');
      expect(win.roster).toEqual({
        type: 'combat',
        monsters: [
          { monsterId: 13, count: 1, picBlockId: 13 }, // KALISTES
          { monsterId: 37, count: 7, picBlockId: 37 }, // DROW CHAMPION
          { monsterId: 40, count: 8, picBlockId: 40 }, // DROW WIZARD
          { monsterId: 7, count: 5, picBlockId: 7 }, //  PET OF KALISTES
        ],
      });
      expect(textOf(win.r1)).toContain('KALISTES SPOTS YOU AND ATTACKS.');
      expect(win.memory.get(QUEST_FLAG)).toBe(1);
      expect(win.memory.get(SCENE)).toBe(37); // the post-kill scene
      expect(win.r2.effects).toContainEqual({ type: 'picture', id: 138 });
      // Pin the decisive step positively: the victory tail chains at 0x9CD2 NEWECL #84.
      expect(win.r2.status).toBe('chain');
      expect(win.r2.at?.vaddr).toBe(0x9cd2);

      // NEGATIVE CONTROL — identical seeds, identical path, ONLY the combat outcome differs.
      // `0x9AC9 IF_NE -> GOTO 0x9CEE` bounces the party; the word is never written at all.
      for (const outcome of ['fled', 'defeat'] as const) {
        const lose = runSetter(b82, outcome);
        expect(lose.roster).toEqual(win.roster); // same path up to the decision point
        expect(lose.memory.has(QUEST_FLAG)).toBe(false); // not "0" — ABSENT
        expect(lose.memory.has(SCENE)).toBe(false);
        // Pin the bounce arm positively rather than inferring it from an absent map key:
        // 0x9CEE restores X/Y from [0x0017]/[0x0018] and falls into 0x9CFC SURPRISE (terminal).
        expect(lose.r2.status).toBe('exited');
        expect(lose.r2.at?.vaddr).toBe(0x9cfc);
      }
    });

    it('gates its own room: the flag already set makes the setter cell a no-op EXIT', async () => {
      // Recorded because it is the OPPOSITE of the Treasures precedent, where the setter's room
      // re-runs its fight forever. Here [0x0208] is a CONSUMED gate at 0x993E. A reader must not
      // assume either behaviour.
      const b82 = await eclBlock(82);
      const memory = new Map<number, number>([[NOTICED, 128], [QUEST_FLAG, 1]]);
      const vm = primeSearchLocation(b82, SETTER_DESCRIPTOR, {
        memory, facing: 'north', dialect: ECL_GEN1_SHORT_POOLS, seed: 0x1234,
        onCall: yesCall, findCharacter: () => null,
      });
      const r = vm!.run() as unknown as RunResult;
      expect(r.status).toBe('exited');
      expect(r.effects).toEqual([]); //  no narration, no combat
      expect(r.at?.vaddr).toBe(0x9945); // the EXIT at the top of the arm

      // And the disclosed precondition, asserted rather than quietly seeded: without [0x020B]
      // bit 7 the SAME cell takes 0x9954, selects scene 35, and neither fights nor writes.
      const memB = new Map<number, number>();
      const vmB = primeSearchLocation(b82, SETTER_DESCRIPTOR, {
        memory: memB, facing: 'north', dialect: ECL_GEN1_SHORT_POOLS, seed: 0x1234,
        onCall: yesCall, findCharacter: () => null,
      });
      const rB = vmB!.run() as unknown as RunResult;
      expect(rB.status).toBe('chain');
      expect(memB.get(SCENE)).toBe(35);
      expect(memB.has(QUEST_FLAG)).toBe(false);
      expect(rB.effects.some((e) => e.type === 'combat')).toBe(false);
    });

    // CORRECTED 2026-08-06: this case was titled "...leads to a DIFFERENT AREA". It does not.
    // The same YES re-points a NEWECL to a DIFFERENT RESIDENT SCRIPT OVER THE SAME GEO MAP —
    // proven in the byte-anchor case above (no GEO1#74; #65 and #74 share LOAD_FILES #65,#4 and
    // the same entry cell/facing; only residency and [0x009C] differ).
    it('consumer A — ECL1#64 the Iron Wall: the same YES chains to a DIFFERENT RESIDENT SCRIPT over the same map', async () => {
      const b82 = await eclBlock(82);
      const b64 = await eclBlock(64);

      const ask = async (memory: Map<number, number>) => {
        // NOTE (measured, not assumed): `primeSearchLocation`'s `facing` option seeds the HOST
        // register 0xC04D, NOT the ECL word [0x0011] that this block compares. The two are
        // different cells in the engine's memory map, so the ECL-visible facing must be seeded
        // explicitly or `0x81EF COMPARE [0x0011],#3` fails and the arm EXITs with no output.
        memory.set(FACING, 3); //       facing WEST, required by 0x81EF
        memory.set(WALL_RUINED, 255); // block-local: the wall is already destroyed
        memory.set(WALL_GATE, 0); //    block-local dispatch gate
        const vm = primeSearchLocation(b64, 1, {
          memory, facing: 'west', dialect: ECL_GEN1_SHORT_POOLS, seed: 0x1234,
          onCall: yesCall, findCharacter: () => null,
        });
        expect(vm).not.toBeNull();
        const runner = new DialogueRunner(vm!, () => {});
        const turn = runner.start() as { text: string; choices?: string[] };
        return { runner, turn };
      };

      // END TO END, both directions: carry the SETTER's OWN memory map into the consumer.
      const alive = await ask(new Map(runSetter(b82, 'fled').memory));
      const dead = await ask(new Map(runSetter(b82, 'victory').memory));

      // The prompt is IDENTICAL in both directions — the flag changes only which script becomes
      // resident (NOT which map is loaded; both targets load GEO1#65).
      expect(alive.turn.text).toContain('THE IRON WALL IS NOW IN RUINS. DO YOU WANT TO GO THROUGH?');
      expect(dead.turn.text).toBe(alive.turn.text);
      expect(alive.turn.choices).toEqual(['YES', 'NO']);
      expect(dead.turn.choices).toEqual(['YES', 'NO']);

      const aliveGo = alive.runner.choose(0) as { kind: string; blockId?: number };
      const deadGo = dead.runner.choose(0) as { kind: string; blockId?: number };
      expect(aliveGo.kind).toBe('chain');
      expect(deadGo.kind).toBe('chain');
      expect(aliveGo.blockId).toBe(74); // Kalistes ALIVE
      expect(deadGo.blockId).toBe(65); //  Kalistes DEAD  <- the headline behaviour change

      // SEEDED CONTROL: a bare memory with ONLY the flag differing reproduces the split, so the
      // effect is the flag itself and not some other word the setter also wrote.
      const bare = async (flag: number) => {
        const { runner } = await ask(new Map<number, number>([[QUEST_FLAG, flag]]));
        return (runner.choose(0) as { blockId?: number }).blockId;
      };
      expect(await bare(0)).toBe(74);
      expect(await bare(1)).toBe(65);
    });

    it('consumer B — ECL1#19 Zhentil Keep gate: the flag swaps the guards AND the narration', async () => {
      const b82 = await eclBlock(82);
      const b19 = await eclBlock(19);
      const map19 = await geoMap(19);

      // The arm-1 cells really carry masked descriptor 1 in the retail GEO.
      const desc1 = map19.cells
        .map((cell, i) => ({ cell, x: i % 16, y: Math.floor(i / 16) }))
        .filter(({ cell }) => ((cell.floor ?? 0) & 0x3f) === 1);
      expect(desc1.map(({ x, y }) => `${x},${y}`).sort()).toEqual(['3,4', '7,15', '8,15']);

      const enter = (memory: Map<number, number>) => {
        memory.set(FACING, 0); //  facing NORTH, required by 0x8873 (see the note on consumer A)
        memory.set(GATE_SEEN, 0);
        const vm = primeSearchLocation(b19, 1, {
          memory, facing: 'north', dialect: ECL_GEN1_SHORT_POOLS, seed: 0x1234,
          onCall: yesCall, findCharacter: () => null,
        });
        expect(vm).not.toBeNull();
        return vm!.run() as unknown as RunResult;
      };
      const setupOf = (r: RunResult) =>
        (r.effects.find((e) => e.type === 'encounterSetup') as { setup?: Record<string, number> } | undefined)?.setup;

      // END TO END, both directions.
      const alive = enter(new Map(runSetter(b82, 'fled').memory));
      const dead = enter(new Map(runSetter(b82, 'victory').memory));

      expect(textOf(alive)).toContain('DROW');
      expect(textOf(alive)).not.toContain('ZHENTARIM');
      expect(setupOf(alive)).toMatchObject({ spriteId: 255, picId: 35 }); // DROW PRIEST art

      expect(textOf(dead)).toContain('ZHENTARIM');
      expect(textOf(dead)).not.toContain('DROW');
      expect(setupOf(dead)).toMatchObject({ spriteId: 79, picId: 255 }); // ZHENTIL WARRIOR

      // The shared tail is identical, so the difference really is the guarded pair.
      const tail = ' GUARD THE GATE TO ZHENTIL KEEP. THEY LOOK YOU OVER CAREFULLY.';
      expect(textOf(alive)).toContain(tail);
      expect(textOf(dead)).toContain(tail);

      // SEEDED CONTROL.
      expect(textOf(enter(new Map([[QUEST_FLAG, 0]])))).toContain('DROW');
      expect(textOf(enter(new Map([[QUEST_FLAG, 1]])))).toContain('ZHENTARIM');
    });

    it('consumer C — ECL1#48 TRANED: the flag suppresses one sentence, in a third block', async () => {
      const b82 = await eclBlock(82);
      const b48 = await eclBlock(48);

      // Deliberately a DIFFERENT KIND of effect from A (area re-route) and B (roster swap):
      // purely textual, no monsters, no chaining. Entered at the NPC-refusal scene directly,
      // because its cell arm sits behind TRANED being an active party member.
      const speak = (memory: Map<number, number>) => {
        memory.set(MANSHOON, 255);
        const vm = new EclVm(b48, {
          memory, dialect: ECL_GEN1_SHORT_POOLS, seed: 0x1234,
          entry: offsetOf(0x82f2),
          onCall: yesCall,
          findCharacter: () => ({ index: 2, inCombat: true }),
        });
        return vm.run() as unknown as RunResult;
      };
      const NEEDS_HELP = ' THEY NEED HELP! ';

      // END TO END, both directions.
      const alive = speak(new Map(runSetter(b82, 'fled').memory));
      const dead = speak(new Map(runSetter(b82, 'victory').memory));
      expect(textOf(alive)).toContain(NEEDS_HELP);
      expect(textOf(dead)).not.toContain(NEEDS_HELP);

      // The surrounding speech is unchanged — only the one gated sentence moves.
      for (const r of [alive, dead]) {
        expect(textOf(r)).toContain("'THERE ARE SLAVES DOWN BELOW.");
        expect(textOf(r)).toContain("'GO ON WIT");
      }

      // SEEDED CONTROL.
      expect(textOf(speak(new Map([[QUEST_FLAG, 0]])))).toContain(NEEDS_HELP);
      expect(textOf(speak(new Map([[QUEST_FLAG, 1]])))).not.toContain(NEEDS_HELP);
    });
  },
);
