/**
 * Golden: Neverwinter Nights (DOS/AOL) MIDDLE leg — the Zhentarim temple of Bane beneath
 * Longsaddle, `ECL1.DAX#17` / `GEO1.DAX#17`.
 *
 * WHAT THIS TEST ESTABLISHES. Every number below was read out of the user's retail NWN files or
 * produced by running the real `EclVm`; nothing is hand-traced. It establishes:
 *   - `ECL1.DAX#17` is a *gated interior* area: its own `initial_entry` bounces the party back to
 *     `ECL1#16` (Longsaddle) unless `[0x4BF2]` (LastEclBlockId) is 16, 17 or 126.
 *   - The entry pose (15,10) is byte-grounded in the retail transition that produces it —
 *     `ECL1#16` @0x92A8 `SAVE #15 -> [0xC04B]`, @0x92AE `SAVE #10 -> [0xC04C]`, @0x92B4
 *     `NEWECL #17` — and is ONE OF THREE such arms in `ECL1#16` (the others pose the party at
 *     (2,7) @0x94A9 and (15,0) @0x96C9, in disjoint 60- and 57-cell components). Test C asserts
 *     all three; this leg walks the (15,10) arm only.
 *   - A 20-step route over the real `GEO1#17` wall/door graph from that pose, using only
 *     wall-free edges and door flag 1 (automatic) — never flag 2 (bash/pick) or 3 (knock).
 *   - Two of the route's cells, (2,11) and (1,11), are BFS articulation points: the desc-108
 *     chamber at (0,9) is unreachable without stepping on both. That component is 72 of the map's
 *     256 cells, and holds only 6 of its 34 special cells (test C).
 *   - The retail script arms exactly one of those two cells at any hour: `[0x4BC9]` (the ECL hour)
 *     partitions them, 18..5 vs 6..17, so a fight is structural rather than seed-dependent FOR ANY
 *     ROUTE THAT REACHES (0,9). Stated conditionally on purpose (corrected 2026-08-05): a party
 *     that never goes to (0,9) is not forced into any of the three encounters, because (2,11) and
 *     (1,11) are cut vertices for (0,9), not for the component.
 *   - The forced fights, their rosters and their `[0x2AF8]`-table persistence, driven through the
 *     real VM with nothing seeded on top of the entry pose.
 *
 * WHAT THIS TEST DOES **NOT** ESTABLISH.
 *   - It does not prove where the area sits in NWN's story. The "mid-campaign" reading is an
 *     INFERENCE argued in `docs/engine/research/nwn-middle-route.md` §2 from the corpus-wide
 *     `NEWECL` graph; the only thing proven mechanically is that this is not the opening block and
 *     that it is reachable only from `ECL1#16`.
 *   - It does not model the retail combat-result word `[0x7EC7]`. This engine leaves it 0, which
 *     is the "party won and stayed" fall-through; the 128/129 branches (bounce to Longsaddle /
 *     early return) are never exercised here.
 *   - Facing at entry is NOT written by either block — it is inherited from Longsaddle. Test F
 *     turns that unknown into a proven non-dependency for this route rather than assuming it.
 *   - The descriptor-0 "plain floor" arm carries a live `RANDOM #100` roll (test H). The flavour
 *     lines the walk emits are an RNG outcome at the documented seed, not a structural guarantee.
 *     Test H's drain loop reseeds a fresh runner every iteration, so its twelve iterations draw the
 *     SAME first PRNG value — a harness property, disclosed rather than overread. "No descriptor-0
 *     outcome is a combat" is therefore proven STRUCTURALLY in test H (zero COMBAT/LOAD_MONSTER
 *     opcodes anywhere in 0x8475..0x85E4), not by sampling seeds.
 *
 * Shape of the proof:
 *   A. Header + cold `initial_entry`: LOAD_FILES/LOAD_PIECES, and the NEWECL #16 bounce.
 *   B. Boot with the retail predecessor `[0x4BF2] = 16`: no bounce, no coordinate write.
 *   C. The entry pose is byte-grounded in `ECL1#16`'s own transition bytes.
 *   D. `GEO1#17` ground truth: the descriptor plane and the 1:1 special-cell/table-index map.
 *   E. The 20 legal directed steps and the articulation-point proof.
 *   F. The night walk through the real VM; the forced desc-102 fight; facing-invariance.
 *   G. The day counterfactual, the hour partition across all 24 hours, and persistence.
 *   H. Disclosure: the descriptor-0 arm's live RNG roll.
 *   I. Counterfactual: the &0x7F descriptor mask is load-bearing (a &0x3F read silences the block).
 *   J. Disclosure: the operand dialect is NOT discriminating on this block.
 *   K. `ECL1#16` is the only block in the 33-block corpus that names block 17 as a NEWECL target.
 *   L. The descriptor-1/2 arms at 0x8181 are unreachable dead code, and the desc-2 cell is silent.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dialogueForCell,
  decodeGeoBlock,
  decodeMonsterArchive,
  disassembleSubroutine,
  readDaxDataBlocks,
  parseEclHeader,
  ECL_GEN1,
  ECL_GEN1_SHORT,
  EclVm,
} from '../src/index.js';

const NWN = 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint';
const eclPath = resolve(NWN, 'ECL1.DAX');
const geoPath = resolve(NWN, 'GEO1.DAX');
const monPath = resolve(NWN, 'MONCHA.DAX');
const haveRetail = existsSync(eclPath) && existsSync(geoPath);

async function eclBlock(id: number): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(eclPath)));
  return blocks.find((b) => b.blockId === id)!.raw;
}

async function geoBlock17(): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(geoPath)));
  return blocks.find((b) => b.blockId === 17)!.raw;
}

type Dir = 'north' | 'east' | 'south' | 'west';
const CARDINALS: readonly Dir[] = ['north', 'east', 'south', 'west'];
const DELTA: Record<Dir, [number, number]> = {
  north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
};

/**
 * The Gen1 GEO edge graph, decoded exactly as `tools/find_geo_path.decode_edges` does it: wall
 * planes at raw[2:258] / raw[258:514], door flags at raw[770:1026]. Returns `[wallSlot, doorFlag]`
 * per direction.
 */
function edgesOf(raw: Uint8Array, x: number, y: number): Record<Dir, [number, number]> {
  const i = y * 16 + x;
  const plane0 = raw[2 + i]!;
  const plane1 = raw[258 + i]!;
  const doors = raw[770 + i]!;
  return {
    north: [plane0 >> 4, doors & 0x03],
    east: [plane0 & 0x0f, (doors >> 2) & 0x03],
    south: [plane1 >> 4, (doors >> 4) & 0x03],
    west: [plane1 & 0x0f, (doors >> 6) & 0x03],
  };
}

/**
 * STRICT passability: an edge is walkable only when the wall slot is 0 (open) or the door flag is
 * 1 (automatic). Flags 2 (bash/pick) and 3 (knock) are deliberately excluded — they are not
 * unconditional steps, so a route that needs one is not a walked route.
 */
function walkable(raw: Uint8Array, x: number, y: number, dir: Dir): boolean {
  const [wall, door] = edgesOf(raw, x, y)[dir];
  return wall === 0 || door === 1;
}

/** Breadth-first reachable set under {@link walkable}, optionally with cells removed. */
function reachableFrom(
  raw: Uint8Array,
  start: [number, number],
  blocked: ReadonlyArray<[number, number]> = [],
): Set<number> {
  const block = new Set(blocked.map(([x, y]) => y * 16 + x));
  const seen = new Set([start[1] * 16 + start[0]]);
  const queue: Array<[number, number]> = [start];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const dir of CARDINALS) {
      if (!walkable(raw, x, y, dir)) continue;
      const [dx, dy] = DELTA[dir];
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx > 15 || ny < 0 || ny > 15) continue;
      const key = ny * 16 + nx;
      if (block.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

/**
 * The entry pose this leg walks from: `ECL1#16` @0x92A8/0x92AE writes X=15, Y=10 before its
 * `NEWECL #17` at @0x92B4.
 *
 * DISCLOSED SELECTION, not uniqueness (added 2026-08-05 after review). `ECL1#16` has THREE
 * CFG-reachable `NEWECL #17` sites and each writes a DIFFERENT pose — (15,10) @0x92B4,
 * (2,7) @0x94A9, (15,0) @0x96C9 — landing in three PAIRWISE DISJOINT strict-passability
 * components of 72 / 60 / 57 cells. Test C asserts all three. Everything this golden proves
 * (the route, the articulation points, the forced encounters) holds for the (15,10) arm only.
 */
const ENTRY: { x: number; y: number } = { x: 15, y: 10 };

/**
 * The 20 legal directed steps from the entry pose to the descriptor-108 chamber at (0,9), with the
 * facing the party carries INTO each cell. Produced by a strict-passability BFS over the real
 * `GEO1#17` bytes (see `docs/engine/research/nwn-middle-route.md` §4).
 */
const ROUTE: ReadonlyArray<{ x: number; y: number; facing: Dir; desc: number }> = [
  { x: 15, y: 11, facing: 'south', desc: 0 },
  { x: 14, y: 11, facing: 'west', desc: 0 },
  { x: 13, y: 11, facing: 'west', desc: 2 },
  { x: 12, y: 11, facing: 'west', desc: 0 },
  { x: 11, y: 11, facing: 'west', desc: 0 },
  { x: 10, y: 11, facing: 'west', desc: 0 },
  { x: 9, y: 11, facing: 'west', desc: 0 },
  { x: 8, y: 11, facing: 'west', desc: 0 },
  { x: 7, y: 11, facing: 'west', desc: 0 },
  { x: 6, y: 11, facing: 'west', desc: 0 },
  { x: 6, y: 10, facing: 'north', desc: 0 },
  { x: 5, y: 10, facing: 'west', desc: 0 },
  { x: 4, y: 10, facing: 'west', desc: 0 },
  { x: 3, y: 10, facing: 'west', desc: 0 },
  { x: 3, y: 11, facing: 'south', desc: 0 },
  { x: 2, y: 11, facing: 'west', desc: 102 },
  { x: 1, y: 11, facing: 'west', desc: 103 },
  { x: 1, y: 10, facing: 'north', desc: 0 },
  { x: 0, y: 10, facing: 'west', desc: 0 },
  { x: 0, y: 9, facing: 'north', desc: 108 },
];

/** The 34 special cells of GEO1#17: descriptor (masked &0x7F) -> [x, y]. Table index = desc - 93. */
const SPECIAL_CELLS: ReadonlyArray<[number, number, number]> = [
  [94, 12, 14], [95, 9, 14], [96, 6, 14], [97, 3, 14], [98, 0, 14], [99, 5, 11],
  [100, 4, 13], [101, 1, 12], [102, 2, 11], [103, 1, 11], [104, 12, 9], [105, 11, 9],
  [106, 6, 9], [107, 3, 9], [108, 0, 9], [109, 15, 6], [110, 13, 7], [111, 9, 7],
  [112, 9, 5], [113, 12, 4], [114, 11, 4], [115, 13, 2], [116, 11, 1], [117, 7, 0],
  [118, 8, 5], [119, 7, 5], [120, 4, 6], [121, 4, 5], [122, 3, 3], [123, 2, 3],
  [124, 5, 1], [125, 4, 1], [126, 4, 0], [127, 3, 0],
];

const SEED = 0x1234;
/** `[0x4BC9]` is the ECL-owned hour (see `apps/web/src/ui/demoGen1.ts` AREA_HOUR_ADDR). */
const HOUR = 0x4bc9;

/** Run one cell through the real SearchLocation with a shared memory map. */
function step(
  raw: Uint8Array,
  descriptor: number,
  memory: Map<number, number>,
  at: { x: number; y: number; facing: Dir },
  seed = SEED,
) {
  const runner = dialogueForCell(raw, descriptor, {
    memory,
    facing: at.facing,
    dialect: ECL_GEN1,
    seed,
    seedMemory: { 0xc04b: at.x, 0xc04c: at.y },
  })!;
  return { runner, turn: runner.start() };
}

describe.skipIf(!haveRetail)('NWN ECL1#17 temple of Bane — middle natural-combat route', () => {
  it('A. cold initial_entry loads GEO 17 and bounces to Longsaddle when [0x4BF2] is unset', async () => {
    const raw = await eclBlock(17);
    expect(raw.length).toBe(6681);

    const header = parseEclHeader(raw, ECL_GEN1);
    expect(header.magic).toBe(0x1388);
    expect(header.vmRun1).toBe(0x840a);
    expect(header.searchLocation).toBe(0x811c);
    expect(header.preCampCheck).toBe(0x841b);
    expect(header.campInterrupted).toBe(0x8444);
    // NOT the canonical 0x8014 trampoline: this block's own entry is 151 bytes in, real code.
    expect(header.eclInitialEntry).toBe(0x8095);
    expect(header.eclInitialEntry - ECL_GEN1.vbase).toBe(151);

    // The prologue, as bytes, at its quoted file offset: AND #127,[0xC04F] -> [0x4C02];
    // SAVE [0x4C02] -> [0x4C01]; four zero/one/two SAVEs; LOAD_FILES #17,#2,#255;
    // LOAD_PIECES #3,#17,#255.
    expect(Buffer.from(raw.slice(151, 205)).toString('hex')).toBe(
      '2f007f014fc001024c0901024c01014c09000001004c09000101fb4b09000201fe4c09000001004d21001100'
      + '0200ff370003001100ff',
    );
    // 0x83A3: SAVE #9 -> [0xC04C]; SAVE #0 -> [0xC04B]; NEWECL #16 — the "wrong predecessor" bounce.
    expect(Buffer.from(raw.slice(933, 948)).toString('hex')).toBe('090009014cc0090000014bc0200010');

    const memory = new Map<number, number>();
    const vm = new EclVm(raw, { memory, dialect: ECL_GEN1, entry: 151, seed: SEED });
    const r = vm.run();

    // The area's own file/tile loads happen before the predecessor test, so they are unconditional.
    expect(r.effects.find((e) => e.type === 'loadFiles')).toMatchObject({
      geoBlockId: 17, operands: [17, 2, 255],
    });
    expect(r.effects.find((e) => e.type === 'loadPieces')).toMatchObject({ setBlockIds: [3, 17, 255] });
    expect(memory.get(0x4bfb)).toBe(1);
    expect(memory.get(0x4cfe)).toBe(2);
    expect(memory.get(0x4d00)).toBe(0);
    expect(memory.get(0x4bfe)).toBe(2);

    // [0x4BF2] is untouched on a cold boot, so the 0x80DB/0x80E6/0x80F1 chain falls to 0x83A3.
    expect(memory.get(0x4bf2) ?? 0).toBe(0);
    expect(memory.get(0xc04b)).toBe(0);
    expect(memory.get(0xc04c)).toBe(9);
    // NEWECL yields `status: 'chain'` rather than an effect (see EclRunResult.chainBlockId).
    expect(r.status).toBe('chain');
    expect(r.chainBlockId).toBe(16);
  });

  it('B. booting with the retail predecessor [0x4BF2] = 16 neither bounces nor writes a pose', async () => {
    const raw = await eclBlock(17);
    const memory = new Map<number, number>([[0x4bf2, 16], [0xc04b, 15], [0xc04c, 10]]);
    const vm = new EclVm(raw, { memory, dialect: ECL_GEN1, entry: 151, seed: SEED });
    const r = vm.run();

    expect(r.status).not.toBe('chain');
    expect(r.chainBlockId).toBeUndefined();
    // The entry pose survives the boot untouched — block 17 never writes X/Y on this path.
    expect(memory.get(0xc04b)).toBe(15);
    expect(memory.get(0xc04c)).toBe(10);
    // Same unconditional loads as the cold path.
    expect(r.effects.find((e) => e.type === 'loadFiles')).toMatchObject({ geoBlockId: 17 });

    // The two other ACCEPTED predecessor values take the same non-bouncing branch. Corrected
    // framing 2026-08-05: only 16 is a real predecessor in the shipped data. 126 is NOT a block id
    // in this corpus at all (the 33 shipped ids are 1-12, 14-30, 51, 59, 78, 79 — see test K's
    // blockCount), and 17 is this block's own id, so both arms are unreachable in practice. The
    // measured behaviour below is unchanged; only the earlier "legal predecessors" wording was
    // overstated.
    for (const predecessor of [17, 126]) {
      const m = new Map<number, number>([[0x4bf2, predecessor]]);
      const run = new EclVm(raw, { memory: m, dialect: ECL_GEN1, entry: 151, seed: SEED }).run();
      expect(run.chainBlockId, `predecessor ${predecessor}`).toBeUndefined();
    }
    // Any other predecessor bounces straight back to Longsaddle at (0,9).
    for (const predecessor of [1, 10, 12, 15, 21, 30]) {
      const m = new Map<number, number>([[0x4bf2, predecessor]]);
      const run = new EclVm(raw, { memory: m, dialect: ECL_GEN1, entry: 151, seed: SEED }).run();
      expect(run.status, `predecessor ${predecessor}`).toBe('chain');
      expect(run.chainBlockId, `predecessor ${predecessor}`).toBe(16);
      expect(m.get(0xc04b)).toBe(0);
      expect(m.get(0xc04c)).toBe(9);
    }
  });

  it('C. the entry pose (15,10) is byte-grounded in ECL1#16\'s own transition into block 17', async () => {
    const raw16 = await eclBlock(16);
    expect(raw16.length).toBe(5858);
    // 0x92A8 SAVE #15 -> [0xC04B]; 0x92AE SAVE #10 -> [0xC04C]; 0x92B4 NEWECL #17.
    expect(Buffer.from(raw16.slice(4778, 4793)).toString('hex')).toBe('09000f014bc009000a014cc0200011');

    // Those bytes are the tail of Longsaddle's descriptor-125 arm, so the transition is the
    // aftermath of a real cell event, not a debug hook. GEO1#16 has exactly one descriptor-125 cell.
    const geoBlocks = readDaxDataBlocks(new Uint8Array(await readFile(geoPath)));
    const geo16 = geoBlocks.find((b) => b.blockId === 16)!.raw;
    const cells125: Array<[number, number]> = [];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if ((geo16[514 + y * 16 + x]! & 0x7f) === 125) cells125.push([x, y]);
      }
    }
    expect(cells125).toEqual([[9, 12]]);

    // --- DISCLOSURE (2026-08-05): (15,10) is a SELECTION among three retail arms ------------
    // ECL1#16 chains into block 17 from three different places, each writing a different pose.
    // Asserting all three here means the doc's "the entry pose" can never be read as "the only
    // entry pose".
    const ARMS: ReadonlyArray<readonly [number, string, number, number]> = [
      // [file offset of NEWECL #17, hex of the two SAVEs + NEWECL, x, y]
      [4790, '09000f014bc009000a014cc0200011', 15, 10],
      [5291, '090002014bc0090007014cc0200011', 2, 7],
      [5835, '09000f014bc0090000014cc0200011', 15, 0],
    ];
    const newEcl17: number[] = [];
    for (let i = 0; i + 2 < raw16.length; i++) {
      if (raw16[i] === 0x20 && raw16[i + 1] === 0x00 && raw16[i + 2] === 17) newEcl17.push(i);
    }
    expect(newEcl17).toEqual(ARMS.map(([off]) => off));
    for (const [off, hex, x, y] of ARMS) {
      expect(Buffer.from(raw16.slice(off - 12, off + 3)).toString('hex'), `arm @${off}`).toBe(hex);
      expect([raw16[off - 10], raw16[off - 4]], `arm @${off} pose`).toEqual([x, y]);
    }

    // The three poses land in three PAIRWISE DISJOINT components of GEO1#17, so the other two
    // arms cannot reach this route's cells at all.
    const graw = await geoBlock17();
    const comps = ARMS.map(([, , x, y]) => reachableFrom(graw, [x, y]));
    expect(comps.map((c) => c.size)).toEqual([72, 60, 57]);
    for (let i = 0; i < comps.length; i++) {
      for (let j = i + 1; j < comps.length; j++) {
        expect([...comps[i]!].filter((c) => comps[j]!.has(c)), `components ${i}/${j}`).toEqual([]);
      }
    }
    // ...and specifically: neither alternative arm can reach the route's two articulation points
    // or the descriptor-108 chamber.
    for (const c of comps.slice(1)) {
      for (const [x, y] of [[2, 11], [1, 11], [0, 9]] as Array<[number, number]>) {
        expect(c.has(y * 16 + x), `(${x},${y}) must be out of reach`).toBe(false);
      }
    }

    // Scope for the "72": that is 72 of 256 cells (28%), and only 6 of the 34 special cells of
    // GEO1#17 lie inside it. The rest of the map is not walkable from this entry.
    const entryComponent = comps[0]!;
    expect(entryComponent.size / 256).toBeLessThan(0.3);
    const specialsInside = SPECIAL_CELLS
      .filter(([, x, y]) => entryComponent.has(y * 16 + x))
      .map(([d]) => d);
    expect(specialsInside).toEqual([98, 100, 101, 102, 103, 108]);
  });

  it('D. GEO1#17 ground truth: 34 special cells, one per high-table index', async () => {
    const graw = await geoBlock17();
    expect(graw.length).toBe(1026);
    expect(graw[0]! | (graw[1]! << 8)).toBe(1024); // the CoK-shaped Gen1 GEO header word

    // Cross-check the raw descriptor plane against the engine's own decoder.
    const map = decodeGeoBlock(graw, 'NWN GEO1#17 temple of Bane');
    for (let i = 0; i < 256; i++) {
      expect(map.map.cells[i]!.floor ?? 0).toBe(graw[514 + i]);
    }

    const masked = (x: number, y: number) => graw[514 + y * 16 + x]! & 0x7f;
    // Every descriptor byte carries the 0x80 bit; the script's own `AND #127` at 0x8095/0x8123 is
    // what makes the table index meaningful.
    for (let i = 0; i < 256; i++) expect(graw[514 + i]! & 0x80).toBe(0x80);

    // The high table (ON_GOTO @0x823A) has 35 entries; index = descriptor - 93. Descriptors 94..127
    // occur exactly once each, so the 34 non-generic indices are in 1:1 correspondence with cells.
    for (const [desc, x, y] of SPECIAL_CELLS) {
      expect(masked(x, y), `descriptor ${desc}`).toBe(desc);
    }
    const highCells: number[] = [];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) if (masked(x, y) > 93) highCells.push(masked(x, y));
    }
    expect(highCells.length).toBe(34);
    expect([...new Set(highCells)].length).toBe(34);

    // The route's own cells resolve to exactly four descriptor values.
    expect(masked(ENTRY.x, ENTRY.y)).toBe(0);
    for (const s of ROUTE) expect(masked(s.x, s.y), `(${s.x},${s.y})`).toBe(s.desc);
    expect([...new Set(ROUTE.map((s) => s.desc))].sort((a, b) => a - b)).toEqual([0, 2, 102, 103, 108]);
  });

  it('E. the route is legal on the real wall/door graph and (2,11)/(1,11) are articulation points', async () => {
    const graw = await geoBlock17();

    const cells: Array<[number, number]> = [
      [ENTRY.x, ENTRY.y], ...ROUTE.map((s) => [s.x, s.y] as [number, number]),
    ];
    const doorEdges: Array<[string, number, number]> = [];
    for (let i = 0; i + 1 < cells.length; i++) {
      const [x, y] = cells[i]!;
      const [nx, ny] = cells[i + 1]!;
      const dir = CARDINALS.find((d) => DELTA[d][0] === nx - x && DELTA[d][1] === ny - y)!;
      expect(dir, `step ${i}`).toBe(ROUTE[i]!.facing);
      const [wall, door] = edgesOf(graw, x, y)[dir];
      expect(wall === 0 || door === 1, `step ${i} passable`).toBe(true);
      expect(door, `step ${i} not bash/pick`).not.toBe(2);
      expect(door, `step ${i} not knock`).not.toBe(3);
      if (door !== 0) doorEdges.push([`(${x},${y})->${dir}`, wall, door]);
    }
    // Exactly four automatic (flag-1) doors on the route; every other edge is wall-free.
    expect(doorEdges).toEqual([
      ['(14,11)->west', 1, 1], ['(5,10)->west', 1, 1],
      ['(2,11)->west', 1, 1], ['(0,10)->north', 1, 1],
    ]);

    // The entry pose sits in a 72-cell strict-passability component.
    const whole = reachableFrom(graw, [ENTRY.x, ENTRY.y]);
    expect(whole.size).toBe(72);
    for (const s of ROUTE) expect(whole.has(s.y * 16 + s.x), `(${s.x},${s.y}) reachable`).toBe(true);

    // Cut-vertex proof. Removing the descriptor-102 cell strands the desc-103 cell AND the
    // desc-108 chamber; removing the descriptor-103 cell strands the desc-108 chamber.
    const without102 = reachableFrom(graw, [ENTRY.x, ENTRY.y], [[2, 11]]);
    expect(without102.size).toBe(61);
    expect(without102.has(11 * 16 + 1)).toBe(false); // (1,11)
    expect(without102.has(9 * 16 + 0)).toBe(false); // (0,9)
    const without103 = reachableFrom(graw, [ENTRY.x, ENTRY.y], [[1, 11]]);
    expect(without103.size).toBe(62);
    expect(without103.has(9 * 16 + 0)).toBe(false); // (0,9)

    // Negative controls — the cut-vertex test discriminates. Removing the plain corridor cell
    // (9,11) strands only its own alcove (9,10); removing (15,13) strands nothing at all. In both
    // cases the desc-108 chamber stays reachable, so "strands (0,9)" is a property of (2,11) and
    // (1,11), not an artefact of deleting any cell.
    const without911 = reachableFrom(graw, [ENTRY.x, ENTRY.y], [[9, 11]]);
    expect(without911.size).toBe(70);
    expect(without911.has(10 * 16 + 9)).toBe(false); // (9,10), the alcove behind it
    expect(without911.has(9 * 16 + 0)).toBe(true); // (0,9) still reachable
    const withoutFar = reachableFrom(graw, [ENTRY.x, ENTRY.y], [[15, 13]]);
    expect(withoutFar.size).toBe(71);
    expect(withoutFar.has(9 * 16 + 0)).toBe(true);
  });

  it.skipIf(!existsSync(monPath))('E2. resolves the forced rosters against the real MONCHA.DAX names', async () => {
    const records = decodeMonsterArchive(new Uint8Array(await readFile(monPath)), 'neverwinter-nights-dos');
    const byId = new Map(records.map((r) => [r.blockId, r.name]));
    expect(byId.get(34)).toBe('DISPLACER BEAST'); // desc 102 @0x8F07 and desc 103 @0x8F1C
    expect(byId.get(98)).toBe('UMBER HULK'); //     desc 102 @0x8F0E
    expect(byId.get(92)).toBe('PYRO SNAKE'); //     desc 103 @0x8F23
    expect(byId.get(35)).toBe('HELL HOUND'); //     desc 108 @0x95E3
    expect(byId.get(95)).toBe('SALAMANDER'); //     desc 108 @0x95EA
    // Longsaddle's own descriptor-125 fight, the one whose aftermath drops the party in here.
    expect(byId.get(43)).toBe('DRIDER');
    expect(byId.get(93)).toBe('REMORHAZ');
  });

  it('F. walks the twenty steps at the cold hour and fights the forced desc-102 encounter', async () => {
    const raw = await eclBlock(17);
    const graw = await geoBlock17();
    const floorAt = (x: number, y: number) => graw[514 + y * 16 + x]!;

    // Boot the block exactly as the retail transition leaves it: predecessor 16, pose (15,10).
    // NOTHING else is seeded. The cold [0x4BC9] is 0 — hour 0, i.e. the night half of the day.
    const memory = new Map<number, number>([[0x4bf2, 16], [0xc04b, ENTRY.x], [0xc04c, ENTRY.y]]);
    expect(new EclVm(raw, { memory, dialect: ECL_GEN1, entry: 151, seed: SEED }).run().effects
      .filter((e) => e.type === 'newEcl')).toEqual([]);
    expect(memory.get(HOUR) ?? 0).toBe(0);
    expect(memory.get(0x2af8 + 9) ?? 0).toBe(0); // desc-102 persistence slot, still clear

    const fights: string[] = [];
    for (const s of ROUTE) {
      const { runner, turn } = step(raw, floorAt(s.x, s.y), memory, s);
      if (s.desc === 102) {
        expect(turn.kind).toBe('combat');
        if (turn.kind !== 'combat') throw new Error('expected the descriptor-102 combat');
        expect(turn.pictureId).toBe(84);
        expect(turn.monsters).toEqual([
          { monsterId: 34, count: 5, picBlockId: 34 },
          { monsterId: 98, count: 2, picBlockId: 98 },
        ]);
        // `SAVE_TABLE #1,[0x2AF8],[0x7F79]` @0x83EF lands only after COMBAT.
        expect(memory.get(0x2af8 + 9) ?? 0).toBe(0);
        expect(runner.afterCombat('victory')).toEqual({ kind: 'end', text: '' });
        expect(memory.get(0x2af8 + 9)).toBe(1);
        fights.push('displacer-beasts');
      } else if (s.desc === 103 || s.desc === 108) {
        // Night: the 0x835F gate (hours 6..17) suppresses these two and CLEARS their slot.
        expect(turn, `(${s.x},${s.y}) suppressed at hour 0`).toEqual({ kind: 'end', text: '' });
        expect(memory.get(0x2af8 + (s.desc - 93))).toBe(0);
      } else {
        expect(turn.kind).toBe('end');
      }
    }
    expect(fights).toEqual(['displacer-beasts']);
    // Only the desc-102 slot was consumed; nothing else in the 34-slot table was set.
    const set = [...Array(35).keys()].filter((i) => (memory.get(0x2af8 + i) ?? 0) === 1);
    expect(set).toEqual([9]);

    // Revisiting the consumed cell is silent, on the SAME memory.
    expect(step(raw, floorAt(2, 11), memory, ROUTE[15]!).turn).toEqual({ kind: 'end', text: '' });
    // Negative control: a fresh memory at the same hour re-fires it.
    const fresh = new Map<number, number>();
    const again = step(raw, floorAt(2, 11), fresh, ROUTE[15]!).turn;
    expect(again.kind).toBe('combat');

    // Facing-invariance: entry facing is inherited from Longsaddle and is NOT written by either
    // block, so it must not change the outcome. It does not.
    for (const facing of CARDINALS) {
      const m = new Map<number, number>();
      const t = step(raw, floorAt(2, 11), m, { x: 2, y: 11, facing }).turn;
      expect(t.kind, `facing ${facing}`).toBe('combat');
    }
  });

  it('G. the hour partitions the two forced cells, and the day walk fights the other two', async () => {
    const raw = await eclBlock(17);
    const graw = await geoBlock17();
    const floorAt = (x: number, y: number) => graw[514 + y * 16 + x]!;

    // 0x8345 (desc 102) arms outside 6..17; 0x835F (desc 103, 108) arms inside 6..17. The two
    // gates are exact complements, so at EVERY hour one of the two forced cells is armed.
    const armed = (desc: number, hour: number) => {
      const memory = new Map<number, number>([[HOUR, hour]]);
      const x = desc === 102 ? 2 : desc === 103 ? 1 : 0;
      const y = desc === 108 ? 9 : 11;
      return step(raw, floorAt(x, y), memory, { x, y, facing: 'west' }).turn.kind === 'combat';
    };
    for (let hour = 0; hour < 24; hour++) {
      const day = hour >= 6 && hour <= 17;
      expect(armed(102, hour), `desc 102 @hour ${hour}`).toBe(!day);
      expect(armed(103, hour), `desc 103 @hour ${hour}`).toBe(day);
      expect(armed(108, hour), `desc 108 @hour ${hour}`).toBe(day);
      // The articulation-point pair always yields exactly one forced fight.
      expect([armed(102, hour), armed(103, hour)].filter(Boolean).length).toBe(1);
    }

    // The full day walk: desc 102 silent, desc 103 and desc 108 both fight.
    const memory = new Map<number, number>([[0x4bf2, 16], [0xc04b, ENTRY.x], [0xc04c, ENTRY.y]]);
    new EclVm(raw, { memory, dialect: ECL_GEN1, entry: 151, seed: SEED }).run();
    memory.set(HOUR, 12);
    const fights: string[] = [];
    for (const s of ROUTE) {
      const { runner, turn } = step(raw, floorAt(s.x, s.y), memory, s);
      if (s.desc === 103) {
        expect(turn.kind).toBe('combat');
        if (turn.kind !== 'combat') throw new Error('expected the descriptor-103 combat');
        expect(turn.pictureId).toBe(84);
        expect(turn.monsters).toEqual([
          { monsterId: 34, count: 5, picBlockId: 34 },
          { monsterId: 92, count: 4, picBlockId: 92 },
        ]);
        runner.afterCombat('victory');
        expect(memory.get(0x2af8 + 10)).toBe(1);
        fights.push('pyro-snakes');
      } else if (s.desc === 108) {
        expect(turn.kind).toBe('combat');
        if (turn.kind !== 'combat') throw new Error('expected the descriptor-108 combat');
        expect(turn.pictureId).toBe(85);
        expect(turn.monsters).toEqual([
          { monsterId: 35, count: 5, picBlockId: 35 },
          { monsterId: 95, count: 2, picBlockId: 95 },
        ]);
        runner.afterCombat('victory');
        expect(memory.get(0x2af8 + 15)).toBe(1);
        fights.push('hell-hounds');
      } else if (s.desc === 102) {
        expect(turn).toEqual({ kind: 'end', text: '' });
        expect(memory.get(0x2af8 + 9)).toBe(0);
      }
    }
    expect(fights).toEqual(['pyro-snakes', 'hell-hounds']);
    const set = [...Array(35).keys()].filter((i) => (memory.get(0x2af8 + i) ?? 0) === 1);
    expect(set).toEqual([10, 15]);

    // Persistence survives an hour change: the consumed day fights stay silent, and desc 102 is
    // still armed at night because its own slot was cleared, not set.
    memory.set(HOUR, 0);
    expect(step(raw, floorAt(1, 11), memory, ROUTE[16]!).turn).toEqual({ kind: 'end', text: '' });
    expect(step(raw, floorAt(2, 11), memory, ROUTE[15]!).turn.kind).toBe('combat');
  });

  it('H. discloses the descriptor-0 arm\'s live RANDOM roll — flavour text only, never combat', async () => {
    const raw = await eclBlock(17);

    // STRUCTURAL FIRST (added 2026-08-05). "A plain cell never fights" is established by
    // disassembling the WHOLE descriptor-0 arm — 0x8475 up to the next arm at 0x85E4, restarting
    // the linear disassembler past each EXIT — and finding zero COMBAT (0x24) and zero
    // LOAD_MONSTER/SETUP_MONSTER (0x0B/0x0C). No seed can produce a fight from a plain cell.
    {
      const end = 0x85e4 - 0x7ffe;
      const opcodes: number[] = [];
      let pos = 0x8475 - 0x7ffe;
      while (pos < end) {
        const dis = disassembleSubroutine(raw, pos, ECL_GEN1);
        if (!dis.instructions.length) break;
        for (const ins of dis.instructions) if (ins.offset < end) opcodes.push(ins.opcode);
        const last = dis.instructions.at(-1)!;
        pos = last.offset + last.size;
        if (dis.badOpcodeAt !== undefined) break;
      }
      expect(opcodes.length).toBeGreaterThan(20);
      expect(opcodes.filter((o) => o === 0x24 || o === 0x0b || o === 0x0c)).toEqual([]);
    }

    // Arm 0x8475: a step counter in [0x4C00]; once it exceeds 6 every plain step rolls
    // `RANDOM #100 -> [0x7F7B]` at 0x84AD and may print one of six atmosphere lines.
    //
    // HARNESS PROPERTY, DISCLOSED: `drain` builds a FRESH runner per iteration with the SAME seed,
    // so its twelve iterations all draw the same first PRNG value — one roll repeated twelve times,
    // not twelve independent rolls (and five seeds = five distinct first values, not sixty). The
    // "never combat" guarantee therefore comes from the structural check above, not from this loop.
    const drain = (seed: number) => {
      const memory = new Map<number, number>([[0x4c00, 7]]);
      const said: string[] = [];
      for (let i = 0; i < 12; i++) {
        const { turn } = step(raw, 0x80, memory, { x: 7, y: 11, facing: 'west' }, seed);
        expect(turn.kind, 'a plain cell never produces a combat').toBe('end');
        if (turn.text) said.push(turn.text);
      }
      return { said, memory };
    };

    const a = drain(SEED);
    // At most six lines ever fire: 0x84D6's `COMPARE [0x7B00],#5 ; IF_GT ; EXIT` caps the counter.
    expect(a.said.length).toBeLessThanOrEqual(6);
    expect(a.said.length).toBeGreaterThan(0);
    expect(a.said[0]).toBe('THE DARK CHILL OF OLD EVIL MAGIC PASSES THROUGH YOUR BODY.');
    expect(a.memory.get(0x7b00)).toBeLessThanOrEqual(6);
    // The roll is genuinely live: it lands somewhere in 0..99 and is read back at 0x7F7B.
    expect(a.memory.get(0x7f7b)).toBeGreaterThanOrEqual(0);
    expect(a.memory.get(0x7f7b)).toBeLessThanOrEqual(99);

    // A different seed still never manufactures a combat — the disclosure is bounded.
    for (const seed of [1, 7, 2003, 0xbeef]) {
      const r = drain(seed);
      expect(r.said.length).toBeLessThanOrEqual(6);
    }

    // The six lines are the retail strings, in the retail order (ON_GOTO @0x84E7).
    const all = drain(SEED).said;
    const expected = [
      'THE DARK CHILL OF OLD EVIL MAGIC PASSES THROUGH YOUR BODY.',
      'THIS PLACE LOOKS NORMAL BUT FEELS COLD. WHAT HAPPENED HERE?',
      'YOU SMELL FIRE FAR IN THE DISTANCE.',
      'THIS IS NOT A GOOD PLACE TO BE ALONE.',
      "YOU FEEL LIKE YOU'RE BEING WATCHED.",
      'SO MANY MONSTERS! WHERE DO THEY COME FROM?',
    ];
    expect(all).toEqual(expected.slice(0, all.length));
  });

  it('I. the &0x7F descriptor mask is load-bearing — a &0x3F read silences both forced cells', async () => {
    const raw = await eclBlock(17);
    const graw = await geoBlock17();
    const floorAt = (x: number, y: number) => graw[514 + y * 16 + x]!;

    // Control: the retail byte (0x80 | desc) fights at the right hour, as tests F/G show.
    expect(step(raw, floorAt(2, 11), new Map([[HOUR, 0]]), { x: 2, y: 11, facing: 'west' }).turn.kind)
      .toBe('combat');
    expect(step(raw, floorAt(1, 11), new Map([[HOUR, 12]]), { x: 1, y: 11, facing: 'west' }).turn.kind)
      .toBe('combat');

    // Counterfactual: mask with 0x3F instead (102 -> 38, 103 -> 39). Both land under 94, get clamped
    // to 93 -> table index 0, take gate-table entry 0 (0x839D `COMPARE #0,#0` => equal) and hit the
    // **0x8226** EXIT — the whole encounter half of the block disappears. So the mask at
    // 0x8095/0x8123 is what selects these arms; it is not a cosmetic detail.
    // (Corrected 2026-08-05: this comment and the doc's §4 both used to name 0x84D5, which is the
    // EXIT inside the descriptor-0 plain-floor arm and is not on this path at all.)
    expect(floorAt(2, 11) & 0x3f).toBe(38);
    expect(floorAt(1, 11) & 0x3f).toBe(39);
    expect(step(raw, floorAt(2, 11) & 0x3f, new Map([[HOUR, 0]]), { x: 2, y: 11, facing: 'west' }).turn)
      .toEqual({ kind: 'end', text: '' });
    expect(step(raw, floorAt(1, 11) & 0x3f, new Map([[HOUR, 12]]), { x: 1, y: 11, facing: 'west' }).turn)
      .toEqual({ kind: 'end', text: '' });
  });

  it('J. discloses that the operand dialect is NOT discriminating on this block', async () => {
    const raw = await eclBlock(17);
    const graw = await geoBlock17();
    const floorAt = (x: number, y: number) => graw[514 + y * 16 + x]!;

    // NWN is a LONG-frame Gen1 title, so `ECL_GEN1` is the right dialect. This test does not claim
    // the choice was verified by a dialect counterfactual — it records the opposite, honestly: no
    // instruction on any path this leg walks is one of the frames that differ (0x1D/0x21/0x22/0x2C),
    // so re-running the entire route under `ECL_GEN1_SHORT` produces identical results. A desync
    // would show up as garbage here, and it does not.
    const run = (dialect: typeof ECL_GEN1) => {
      const memory = new Map<number, number>([[0x4bf2, 16], [0xc04b, ENTRY.x], [0xc04c, ENTRY.y]]);
      new EclVm(raw, { memory, dialect, entry: 151, seed: SEED }).run();
      return ROUTE.map((s) => {
        const t = dialogueForCell(raw, floorAt(s.x, s.y), {
          memory, facing: s.facing, dialect, seed: SEED,
          seedMemory: { 0xc04b: s.x, 0xc04c: s.y },
        })!.start();
        return t.kind === 'combat' ? `combat:${t.monsters.map((m) => m.monsterId).join('/')}` : t.kind;
      });
    };
    const long = run(ECL_GEN1);
    expect(long[15]).toBe('combat:34/98');
    expect(run(ECL_GEN1_SHORT)).toEqual(long);
  });

  it('K. ECL1#16 is the only block in the 33-block corpus that names block 17 as a NEWECL target', async () => {
    // Raw byte-pattern scan for the IMMEDIATE encoding of `NEWECL #17` (`20 00 11`) across every
    // ECL archive the game ships. This is a byte-occurrence claim, not a control-flow claim: the
    // exclusion direction is sound (a block whose bytes never contain the pattern cannot execute
    // it), but a NEWECL with a computed word operand would not be caught. See
    // `docs/engine/research/nwn-middle-route.md` §2 for the eight such candidate sites, none of
    // which is in this leg's neighbourhood.
    const archives = [0, 1, 2, 3, 5, 7].map((n) => resolve(NWN, `ECL${n}.DAX`));
    for (const p of archives) expect(existsSync(p), p).toBe(true);

    const hits: string[] = [];
    let blockCount = 0;
    for (const p of archives) {
      const name = p.slice(p.lastIndexOf('ECL'), p.lastIndexOf('.'));
      for (const b of readDaxDataBlocks(new Uint8Array(await readFile(p)))) {
        blockCount++;
        for (let i = 0; i + 2 < b.raw.length; i++) {
          if (b.raw[i] === 0x20 && b.raw[i + 1] === 0x00 && b.raw[i + 2] === 17) {
            hits.push(`${name}#${b.blockId}@${i}`);
          }
        }
      }
    }
    expect(blockCount).toBe(33);
    expect(hits).toEqual(['ECL1#16@4790', 'ECL1#16@5291', 'ECL1#16@5835']);

    // The reciprocal: block 17's own four exits all name Longsaddle (block 16).
    const raw = await eclBlock(17);
    const back: number[] = [];
    for (let i = 0; i + 2 < raw.length; i++) {
      if (raw[i] === 0x20 && raw[i + 1] === 0x00 && raw[i + 2] === 16) back.push(i);
    }
    expect(back).toEqual([945, 5536, 5978, 6461]);
  });

  it('L. the descriptor-1/2 arms at 0x8181 are dead code, and the desc-2 cell really is silent', async () => {
    const raw = await eclBlock(17);
    const graw = await geoBlock17();

    // `ON_GOTO [0x4C02] #3 [0x8475] [0x86AC] [0x86CA]` @0x8181 is only reached when the descriptor
    // is 0 (`COMPARE [0x4C02] #0 ; IF_GT GOTO 0x8190` diverts everything >= 1 to the clamp), so
    // indices 1 and 2 can never be selected. Nothing else jumps to them either: an xref for the
    // little-endian target words finds exactly one occurrence of each, both inside that ON_GOTO's
    // own operand list.
    const xref = (vaddr: number) => {
      const lo = vaddr & 0xff;
      const hi = vaddr >> 8;
      const at: number[] = [];
      for (let i = 0; i + 1 < raw.length; i++) if (raw[i] === lo && raw[i + 1] === hi) at.push(i);
      return at;
    };
    expect(xref(0x8475)).toEqual([394]);
    expect(xref(0x86ac)).toEqual([397]);
    expect(xref(0x86ca)).toEqual([400]);

    // Consequence, reproduced through the real VM: walking onto a descriptor-1 or descriptor-2 cell
    // prints nothing at all — the "A VAST TEMPLE STRETCHES AWAY TO THE WEST..." string at 0x86CB is
    // unreachable from cell dispatch. Checked at both halves of the clock so this is not an hour
    // artefact.
    //
    // Corrected 2026-08-05: GEO1#17 has TWO descriptor-2 cells, (13,11) AND (13,12) — the doc and
    // this test both said "the descriptor-2 cell", singular — plus a descriptor-1 cell at (12,1),
    // so arm index 1 (0x86AC) is dead code with a real cell behind it too. All three are asserted.
    const cellsWithMasked = (want: number) => {
      const out: Array<[number, number]> = [];
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) if ((graw[514 + y * 16 + x]! & 0x7f) === want) out.push([x, y]);
      }
      return out;
    };
    expect(cellsWithMasked(1)).toEqual([[12, 1]]);
    expect(cellsWithMasked(2)).toEqual([[13, 11], [13, 12]]);
    for (const [x, y] of [...cellsWithMasked(1), ...cellsWithMasked(2)]) {
      for (const hour of [0, 12]) {
        const memory = new Map<number, number>([[HOUR, hour]]);
        expect(step(raw, graw[514 + y * 16 + x]!, memory, { x, y, facing: 'west' }).turn,
          `(${x},${y}) @hour ${hour}`).toEqual({ kind: 'end', text: '' });
      }
    }
  });
});
