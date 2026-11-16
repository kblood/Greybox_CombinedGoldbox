/**
 * Golden: Pools of Darkness's MIDDLE leg — `ECL1.DAX#34` / `GEO1.DAX#34`, the dragon realm reached
 * through the block-18 hub's computed gate.
 *
 * WHAT THIS ESTABLISHES (all of it read from the retail files or produced by running the real
 * `EclVm` / `DialogueRunner`; nothing is hand-traced):
 *   A. Retail identity — file and decompressed-block sizes and sha256s, and the fact that Pools
 *      ships exactly ONE script archive with 56 blocks.
 *   B. Block 34's own `initial_entry` (vaddr 0x8014 = byte offset 22) byte-grounds the spawn:
 *      `SAVE #1 -> [0x0034]`, `SAVE #13 -> [0x0035]`, `SAVE #2 -> [0x0011]` at 0x8039/0x803F/0x8045,
 *      plus `LOAD_FILES #34 #2` (GEO block 34) and the `[0x0016] == 34` already-here guard. Pools
 *      uses the low-address register map ([0x0034]/[0x0035]/[0x0011]/[0x002D]/[0x0016]), NOT the
 *      CoK/Gateway 0xC04B/4C/4D/4F family.
 *   C. Mid-campaign placement, derived from script flow: an alignment-checked census over all 56
 *      blocks finds ZERO `NEWECL #34`; block 18's realm table at 0x926D is the only site that stores
 *      the LITERAL 34 into [0x009B] (which is otherwise a reused scratch word, ~70 writes across ~28
 *      blocks); block 18 reaches it via `NEWECL [0x009B]` at 0x8851; and block 34's only outgoing
 *      NEWECL is #18, back to the hub. CORRECTED 2026-08-06: this is block 34's only CAMPAIGN-script
 *      entry, not its only entry corpus-wide — ECL1#1's shipped developer JUMPER
 *      (0x81EA INPUT_NUMBER -> [0x00C0] -> 0x829A NEWECL [0x00C0]) can reach any block id. The
 *      campaign opening is block 1's "START" arm at 0x807D NEWECL #16.
 *   D. The 19-step route is legal over the real wall/door graph; four of its steps cross a door and
 *      all four are flag 1 = automatic (no bash/pick/knock).
 *   E. The BFS articulation argument: `(7,14)` is a genuine cut vertex (250 reachable cells drop to
 *      15 when it is removed), and exhaustive single-cell removal yields exactly 13 articulation
 *      points for spawn -> (1,12), all of them on the route.
 *   F. The full walk through the real VM, resuming the retail arrival combat, reaching the
 *      `UMBER HULK x5` encounter at (1,12) by movement alone — and doing so identically at eight
 *      different seeds.
 *   G. The consumed word [0x0154] bit 1, including the fact that DEFEAT consumes it too.
 *   H. The `(7,14)` prerequisite [0x0150] bit 4, and the ordering theorem: the unique setter of that
 *      bit lives at (6,4), which is outside the 15-cell spawn pocket.
 *   I. `ON_GOTO` fall-through and masked-vs-raw arm selection, demonstrated on this block.
 *   J. Disclosure of the pose seeding, with the unseeded control.
 *
 * WHAT THIS DOES **NOT** ESTABLISH:
 *   - No native/DOSBox-X trace was run. Every engine-side claim is retail bytes plus this repo's
 *     TypeScript `EclVm`; if that VM mis-models an opcode the walk inherits the error.
 *   - The word "middle" is INFERENCE. What is proven is "not the opening" (no static entry, two
 *     hops behind a hub) and "not a terminus" (its only exit returns to the hub). No ordering is
 *     claimed against the already-proven `early` leg's ECL1#72.
 *   - What gates the hub's realm choice is NOT established: [0x0099] is a reused scratch word set
 *     inside block 18 itself, so "you must have progressed to reach block 34" is not shown — only
 *     "you must have reached block 18 and taken row 1".
 *   - The &0x3F mask is quoted from the script's own 0x81BA byte, NOT proven by counterfactual: on
 *     this map no descriptor has bit 6 set, so &0x3F and &0x7F are indistinguishable. No mask
 *     counterfactual is asserted here because it would prove nothing.
 *   - [0x0152] (a global suppressor) and [0x00EC]'s first-visit polarity were not traced.
 *   - The 13-articulation-point result is specific to spawn -> (1,12). Only the (7,14) cut-vertex
 *     result is general.
 *   - The per-step pose writes ([0x0011]/[0x0034]/[0x0035]) are the HARNESS emulating the host, not
 *     script state. Test J shows the target encounter does not depend on them, and that the only
 *     cell that does is the facing-gated (4,13).
 *   - HARNESS (disclosed 2026-08-06): `step()` builds a fresh DialogueRunner per cell with the same
 *     seed, so every step draws the same first PRNG value (verified: 15 consecutive rolling steps
 *     all yield 40). This route is unaffected because 0x8273 exits before 0x8286 RANDOM on all 19
 *     steps, but the harness must not be used to argue anything probabilistic.
 *   - No browser wiring, no `?explore=` route id, no e2e acceptance. (The campaign-matrix
 *     promotion of this leg was made separately on 2026-08-06, after the refuter pass; this golden
 *     asserts none of it.)
 *
 * Full derivation, the rejected readings and the complete limitation list:
 * docs/engine/research/pools-middle-route.md
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  dialogueForCell,
  decodeGeoBlock,
  decodeMonsterArchive,
  readDaxDataBlocks,
  parseEclHeader,
  ECL_GEN1_SHORT_POOLS,
  EclVm,
} from '../src/index.js';

const pools = 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness';
const eclPath = resolve(pools, 'ECL1.DAX');
const geoPath = resolve(pools, 'GEO1.DAX');
const monPath = resolve(pools, 'MON1CHA.DAX');
const haveRetail = existsSync(eclPath) && existsSync(geoPath);

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function eclBlocks() {
  return readDaxDataBlocks(new Uint8Array(await readFile(eclPath)));
}
async function ecl(id: number): Promise<Uint8Array> {
  return (await eclBlocks()).find((b) => b.blockId === id)!.raw;
}
async function geo(id: number): Promise<Uint8Array> {
  return readDaxDataBlocks(new Uint8Array(await readFile(geoPath))).find((b) => b.blockId === id)!.raw;
}

type Dir = 'north' | 'east' | 'south' | 'west';
const DELTA: Record<Dir, [number, number]> = {
  north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
};
/** Pools' facing encoding, from block 34's own `SAVE #2 -> [0x0011]` spawn literal (south = 2). */
const FACE: Record<Dir, number> = { north: 0, east: 1, south: 2, west: 3 };

/**
 * The Gen1 GEO edge graph, decoded exactly as `tools/find_geo_path.decode_edges` does it: wall
 * planes at raw[2:258] / raw[258:514], door flags at raw[770:1026]. Returns `[wallSlot, doorFlag]`
 * per direction. An edge is passable when the wall slot is 0 OR a door flag is set.
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

/** Set of cells reachable from `start`, optionally with cells removed from the graph. */
function reachableFrom(
  raw: Uint8Array, start: [number, number], blocked: Array<[number, number]> = [],
): Set<number> {
  const block = new Set(blocked.map(([x, y]) => y * 16 + x));
  const seen = new Set([start[1] * 16 + start[0]]);
  const queue: Array<[number, number]> = [start];
  while (queue.length) {
    const [x, y] = queue.shift()!;
    const edges = edgesOf(raw, x, y);
    for (const dir of ['north', 'east', 'south', 'west'] as Dir[]) {
      const [wall, door] = edges[dir];
      if (wall !== 0 && door === 0) continue;
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

const SPAWN: [number, number] = [1, 13];
const TARGET: [number, number] = [1, 12];

/**
 * The BFS shortest path from the block's own byte-grounded spawn (1,13,south) to the descriptor-0xA9
 * UMBER HULK cell (1,12), with the facing the party carries INTO each cell.
 */
const ROUTE: ReadonlyArray<{ x: number; y: number; facing: Dir }> = [
  { x: 1, y: 14, facing: 'south' }, { x: 1, y: 15, facing: 'south' },
  { x: 2, y: 15, facing: 'east' }, { x: 3, y: 15, facing: 'east' },
  { x: 4, y: 15, facing: 'east' }, { x: 4, y: 14, facing: 'north' },
  { x: 5, y: 14, facing: 'east' }, { x: 6, y: 14, facing: 'east' },
  { x: 7, y: 14, facing: 'east' }, { x: 7, y: 13, facing: 'north' },
  { x: 7, y: 12, facing: 'north' }, { x: 6, y: 12, facing: 'west' },
  { x: 5, y: 12, facing: 'west' }, { x: 5, y: 13, facing: 'south' },
  { x: 4, y: 13, facing: 'west' }, { x: 4, y: 12, facing: 'north' },
  { x: 3, y: 12, facing: 'west' }, { x: 2, y: 12, facing: 'west' },
  { x: 1, y: 12, facing: 'west' },
];

/** The 13 cells that no route from the spawn to (1,12) can avoid. */
const ARTICULATION: ReadonlyArray<[number, number]> = [
  [2, 12], [5, 12], [6, 12], [7, 12], [4, 13], [5, 13], [7, 13],
  [1, 14], [7, 14], [1, 15], [2, 15], [3, 15], [4, 15],
];

const HULK_TEXT = 'UMBER HULKS CRASH THROUGH THE WALLS!';
const DRAGON_QUESTION =
  'DRAGONS STAND WING TO WING IN THE HALL AS THEY AWAIT THE THIRD BLAST FROM THE HORN OF DOOM.'
  + ' YOU COUNT AT LEAST SIX, BUT CANNOT SEE BEYOND THEM. DO YOU TRY TO LEAVE QUIETLY?';

/** Run one cell exactly as the walk does, on a caller-supplied memory. */
function step(
  raw: Uint8Array, descriptor: number, memory: Map<number, number>,
  facing: Dir = 'west', seed = 0x1234, seedPose = true,
) {
  const opts: Record<string, unknown> = {
    memory, facing, dialect: ECL_GEN1_SHORT_POOLS, seed,
  };
  if (seedPose) opts.seedMemory = { 0x0011: FACE[facing] };
  return dialogueForCell(raw, descriptor, opts as never)!;
}

describe.skipIf(!haveRetail)('Pools of Darkness ECL1#34 dragon realm — middle natural-combat route', () => {
  it('A. pins the retail archives and the three decompressed blocks this leg reads', async () => {
    const eclFile = new Uint8Array(await readFile(eclPath));
    const geoFile = new Uint8Array(await readFile(geoPath));
    expect(eclFile.length).toBe(329_456);
    expect(sha(eclFile)).toBe('46aab737acb289b1995ae5a8ef495424d2e4e40bae45e33a1e9741f4c50064af');
    expect(geoFile.length).toBe(28_349);
    expect(sha(geoFile)).toBe('d628bae8349044a1c1c05b821ccfbba6464ed5bfa57cef15ca05ec52cc5afc1f');

    // Pools ships exactly ONE script archive, and it is the largest Gen1 script corpus in the
    // project at 56 blocks. The ids are realm-grouped, not contiguous.
    const blocks = await eclBlocks();
    expect(blocks.length).toBe(56);
    expect(blocks.map((b) => b.blockId)).toContain(34);
    expect(blocks.map((b) => b.blockId)).toContain(18);

    const b34 = await ecl(34);
    expect(b34.length).toBe(7_644);
    expect(sha(b34)).toBe('8b77dc7d77f4717ffd408cbc497226c83420db49d1d0cfd7b061cdc91ff6b795');
    const b18 = await ecl(18);
    expect(b18.length).toBe(6_141);
    expect(sha(b18)).toBe('0ced2a5603595b8b30c9c6020495689be5a027fcc816129ab0b9e979e656b357');
    const g34 = await geo(34);
    expect(g34.length).toBe(1_026);
    expect(sha(g34)).toBe('0cb389ea820ea38fd8db42ac6cea1515e504711b00cb92b1c8cb4e8e7ae1e2a7');
  });

  it('B. cold initial_entry byte-grounds the spawn at (1,13,south) and loads GEO block 34', async () => {
    const raw = await ecl(34);
    const header = parseEclHeader(raw, ECL_GEN1_SHORT_POOLS);
    expect(header.magic).toBe(0x1388);
    expect(header.searchLocation).toBe(0x819f);
    expect(header.eclInitialEntry).toBe(0x8014);
    // 0x8014 - 0x7FFE = 22 = the instruction right after the 22-byte header: real code.
    expect(header.eclInitialEntry - ECL_GEN1_SHORT_POOLS.vbase).toBe(22);

    // The already-here guard `COMPARE [0x0016],#34 ; IF_EQ ; EXIT` at file offset 22.
    expect(Buffer.from(raw.slice(22, 29)).toString('hex')).toBe('03011600002216');
    // `LOAD_FILES #34 #2` at 0x8034 — the two-operand Pools short form.
    expect(Buffer.from(raw.slice(0x8034 - 0x8000 + 2, 0x8039 - 0x8000 + 2)).toString('hex'))
      .toBe('2100220002');
    // The three spawn SAVEs at 0x8039 / 0x803F / 0x8045, destination LAST:
    //   SAVE #1 -> [0x0034] ; SAVE #13 -> [0x0035] ; SAVE #2 -> [0x0011]
    expect(Buffer.from(raw.slice(0x8039 - 0x8000 + 2, 0x804b - 0x8000 + 2)).toString('hex'))
      .toBe('090001013400' + '09000d013500' + '090002011100');

    const memory = new Map<number, number>();
    const vm = new EclVm(raw, { memory, dialect: ECL_GEN1_SHORT_POOLS, entry: 22, seed: 0x1234 });
    const boot = vm.run();

    // Pools' low-address register map — NOT the CoK/Gateway 0xC04B/4C/4D family.
    expect(memory.get(0x0034)).toBe(1);
    expect(memory.get(0x0035)).toBe(13);
    expect(memory.get(0x0011)).toBe(2); // south
    expect(memory.get(0x0016)).toBe(34); // current area id
    // Nothing on the 0xC04x page was written by the retail boot.
    expect(memory.get(0xc04b)).toBeUndefined();
    expect(memory.get(0xc04c)).toBeUndefined();
    // The arrival marker is bit 0 only; the (7,14) prerequisite bit 4 is NOT set by the boot.
    expect(memory.get(0x0150)).toBe(1);
    expect((memory.get(0x0150)! & 0x10)).toBe(0);
    // Neither encounter's consumed word has been touched.
    expect(memory.get(0x0154) ?? 0).toBe(0);

    expect(boot.effects.find((e) => e.type === 'loadFiles')).toMatchObject({ geoBlockId: 34 });
    const text = boot.effects
      .filter((e): e is Extract<typeof e, { type: 'print' }> => e.type === 'print')
      .map((e) => e.text ?? '').join(' ');
    expect(text).toMatch(/THRUST THROUGH THE DIMENSIONAL DOOR, YOU FIND YOURSELF IN THE MIDST OF DRAGONS\./);

    // The block boots straight into a retail arrival combat: RED DRAGON x2.
    expect(boot.status).toBe('combat');
    expect(boot.effects.find((e) => e.type === 'combat')).toMatchObject({
      monsters: [{ monsterId: 26, count: 2, picBlockId: 26 }],
    });
    expect(vm.resume(0, { combatOutcome: 'victory' }).status).toBe('exited');
  });

  it('C. block 34 has no static entry; its only way in is the block-18 hub\'s computed NEWECL', async () => {
    const blocks = await eclBlocks();
    // A census of every NEWECL-shaped site (opcode 0x20 + one operand) across all 56 blocks.
    // Gen1 operand encoding, per `gen1_ecl_encounter_scan.read_operand`: code 0x00 = immediate and
    // the value is a SINGLE byte; code 0x01 = register and the value is a 2-byte little-endian
    // address. (Reading a 16-bit word in both cases is the obvious bug here, and it silently
    // reports near-zero immediates — this scan is deliberately written the correct way.)
    //
    // This sweeps every byte offset rather than following instruction sizes, so it is a strict
    // SUPERSET of the real instruction stream: misaligned coincidences are counted too. That makes
    // a zero result the strongest available form of the claim.
    let immediate34 = 0;
    let immediate18 = 0;
    let total = 0;
    for (const b of blocks) {
      const raw = b.raw;
      for (let i = 22; i + 3 < raw.length; i++) {
        if (raw[i] !== 0x20) continue;
        const code = raw[i + 1]!;
        if (code !== 0x00 && code !== 0x01) continue;
        total++;
        if (code !== 0x00) continue;
        const value = raw[i + 2]!;
        if (value === 34) immediate34++;
        if (value === 18) immediate18++;
      }
    }
    expect(total).toBeGreaterThan(100);
    // The headline: nowhere in the game — not even as a misaligned byte coincidence — is block 34
    // a statically-named NEWECL destination.
    expect(immediate34).toBe(0);
    // ...while the hub it hangs off IS reachable statically, from many places (10 real decoded
    // sites across 9 distinct blocks; the superset scan sees 11).
    expect(immediate18).toBeGreaterThanOrEqual(10);

    const b18 = await ecl(18);
    const at = (v: number) => v - 0x8000 + 2;
    // The hub's realm table: `SUBTRACT #1 [0x0099] -> [0x00BF]` then a 4-arm ON_GOTO at 0x9276.
    expect(Buffer.from(b18.slice(at(0x926d), at(0x9276))).toString('hex'))
      .toBe('05000101990001bf00');
    // Row 1 writes 33 -> [0x009A] and 34 -> [0x009B]; the latter is the only site in the whole
    // corpus that puts 34 into [0x009B].
    expect(Buffer.from(b18.slice(at(0x92a3), at(0x92a9))).toString('hex')).toBe('090022019b00');
    // ...and 0x8851 is `NEWECL [0x009B]` — the computed gate.
    expect(Buffer.from(b18.slice(at(0x8851), at(0x8855))).toString('hex')).toBe('20019b00');

    // Running the hub's table through the real VM reproduces all four realm rows.
    const rows: Array<[number, number, number]> = [];
    for (const sel of [1, 2, 3, 4]) {
      const memory = new Map<number, number>([[0x0099, sel]]);
      new EclVm(b18, {
        memory, dialect: ECL_GEN1_SHORT_POOLS, entry: 0x926d - 0x8000 + 2, seed: 1,
      }).run();
      rows.push([memory.get(0x009a)!, memory.get(0x009b)!, memory.get(0x00a1)!]);
    }
    expect(rows).toEqual([[33, 34, 1], [69, 83, 2], [17, 52, 4], [38, 64, 8]]);

    // And block 34 is a traversal, not a terminus: its ONLY outgoing NEWECL is #18, back to the
    // hub. Same superset sweep as above (1-byte immediate), and here it finds exactly one site.
    const b34 = await ecl(34);
    const targets: Array<[string, number]> = [];
    for (let i = 22; i + 3 < b34.length; i++) {
      if (b34[i] === 0x20 && b34[i + 1] === 0x00) {
        targets.push([(i - 2 + 0x8000).toString(16), b34[i + 2]!]);
      }
    }
    expect(targets).toEqual([['9b43', 18]]);
    expect(Buffer.from(b34.slice(0x9b43 - 0x8000 + 2, 0x9b43 - 0x8000 + 5)).toString('hex'))
      .toBe('200012');
  });

  it('D. the 19-step route is legal, and its 4 doors are all automatic (no bash/pick/knock)', async () => {
    const graw = await geo(34);
    const cells: Array<[number, number]> = [SPAWN, ...ROUTE.map((s) => [s.x, s.y] as [number, number])];
    const doors: Array<[string, number, number]> = [];
    for (let i = 0; i + 1 < cells.length; i++) {
      const [x, y] = cells[i]!;
      const [nx, ny] = cells[i + 1]!;
      const dir = (['north', 'east', 'south', 'west'] as Dir[]).find(
        (d) => DELTA[d][0] === nx - x && DELTA[d][1] === ny - y,
      );
      expect(dir).toBeDefined(); // every hop is a single orthogonal move
      const [wall, door] = edgesOf(graw, x, y)[dir!];
      expect(wall === 0 || door !== 0).toBe(true); // passable
      expect(door).not.toBe(2); // never bash/pick
      expect(door).not.toBe(3); // never knock
      if (door !== 0) doors.push([`(${x},${y})->${dir}`, wall, door]);
      // The route's facing is exactly the direction of travel.
      expect(ROUTE[i]!.facing).toBe(dir);
    }
    // Four of the nineteen steps pass through a door, and every one is flag 1 = AUTOMATIC: the
    // party walks through without a bash, pick or knock check. Note the bottleneck cell (7,14) is
    // itself a doorway.
    expect(doors).toEqual([
      ['(1,15)->east', 9, 1],
      ['(7,14)->north', 10, 1],
      ['(5,13)->west', 9, 1],
      ['(2,12)->west', 9, 1],
    ]);
  });

  it('E. (7,14) is a cut vertex, and exactly 13 cells are unavoidable on ANY route to (1,12)', async () => {
    const graw = await geo(34);
    const key = ([x, y]: [number, number]) => y * 16 + x;

    const full = reachableFrom(graw, SPAWN);
    expect(full.size).toBe(250);
    expect(full.has(key(TARGET))).toBe(true);

    // The bottleneck: removing (7,14) strands all but a 15-cell pocket around the spawn.
    const pocket = reachableFrom(graw, SPAWN, [[7, 14]]);
    expect(pocket.size).toBe(15);
    expect(pocket.has(key(TARGET))).toBe(false);

    // Exhaustive single-cell removal over all 250 reachable cells — this is the strong form of the
    // claim: not "here is a path", but "no path avoids these".
    const found: Array<[number, number]> = [];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if ((x === SPAWN[0] && y === SPAWN[1]) || (x === TARGET[0] && y === TARGET[1])) continue;
        if (!full.has(key([x, y]))) continue;
        if (!reachableFrom(graw, SPAWN, [[x, y]]).has(key(TARGET))) found.push([x, y]);
      }
    }
    expect(found.length).toBe(13);
    expect(new Set(found.map(key))).toEqual(new Set(ARTICULATION.map(key)));
    // ...and every one of them is on the walked route.
    const routeKeys = new Set(ROUTE.map((s) => key([s.x, s.y])));
    for (const cell of ARTICULATION) expect(routeKeys.has(key(cell))).toBe(true);
  });

  it('F. walks the 19 steps and reaches the UMBER HULK x5 encounter by movement alone', async () => {
    const raw = await ecl(34);
    const map = decodeGeoBlock(await geo(34), 'Pools GEO1#34').map;
    const floorAt = (x: number, y: number) => map.cells[y * 16 + x]!.floor ?? 0;

    expect(floorAt(...SPAWN)).toBe(0x80);
    expect(floorAt(...TARGET)).toBe(0xa9);
    expect(0xa9 & 0x3f).toBe(41); // arm 41 = 0x9C46

    // Start from whatever the retail boot leaves behind — resume its arrival combat, seed nothing.
    const memory = new Map<number, number>();
    const vm = new EclVm(raw, { memory, dialect: ECL_GEN1_SHORT_POOLS, entry: 22, seed: 0x1234 });
    expect(vm.run().status).toBe('combat');
    expect(vm.resume(0, { combatOutcome: 'victory' }).status).toBe('exited');

    const seen: string[] = [];
    for (const s of ROUTE) {
      const runner = step(raw, floorAt(s.x, s.y), memory, s.facing);
      const turn = runner.start();
      if (s.x === TARGET[0] && s.y === TARGET[1]) {
        expect(turn.kind).toBe('combat');
        if (turn.kind !== 'combat') throw new Error('expected the umber hulk combat');
        expect(turn.text).toBe(HULK_TEXT);
        expect(turn.monsters).toEqual([{ monsterId: 76, count: 5, picBlockId: 76 }]);
        expect(turn.setup).toMatchObject({ spriteId: 76, picId: 255, extra: 8 });
        // `OR #2 [0x0154]` sits AFTER the COMBAT, so the word is still clear at the pause.
        expect(memory.get(0x0154) ?? 0).toBe(0);
        expect(runner.afterCombat('victory')).toEqual({ kind: 'end', text: '' });
        expect(memory.get(0x0154)).toBe(2);
        seen.push('hulks');
      } else if (s.x === 4 && s.y === 15) {
        expect(turn.kind).toBe('end');
        expect(turn.text).toMatch(/^DRAGONS HERD CAPTIVES AROUND THE CORNER\./);
        seen.push('captives');
      } else if (s.x === 4 && s.y === 13) {
        // UPDATED 2026-09-04 (round 33 Phase B). This branch pinned `kind: 'end'` with no
        // treasure, because `0x27 TREASURE` was decoded under a flat 8-word frame that ran past
        // the instruction and destroyed the award. With the shipped `{wordSet: 4, countAt: 3}`
        // frame the cell is what its own retail text says it is: the count operand reads 15 and
        // is followed by EXACTLY 15 item ids, and the narration promises "A PILE OF WHAT MUST BE
        // THE CAPTIVES BELONGINGS". Players of this engine were told about the pile and handed
        // nothing. The empty-roster CLEARMONSTERS/TREASURE/COMBAT shape is the same loot-award
        // idiom `treasuresEndingRoute.test.ts` documents for Treasures' finale.
        expect(turn.kind).toBe('combat');
        if (turn.kind !== 'combat') throw new Error('expected the ki-rin loot award');
        expect(turn.text).toMatch(/^DUMPED IN THE CORNER IS THE ROTTING CORPSE OF A KI-RIN\./);
        expect(turn.text).toContain('A PILE OF WHAT MUST BE THE CAPTIVES BELONGINGS');
        expect(turn.monsters).toEqual([]); // loot award, not a fight
        expect(turn.treasure?.frame).toBe('gold3Tail');
        expect(turn.treasure?.itemSource).toBe('none');
        expect(turn.treasure?.partyGold).toEqual([0, 0, 0]);
        // The self-consistency that makes the frame decidable from the data alone: operand #4 is
        // the count, and the tail is exactly that long.
        expect(turn.treasure?.operands?.[3]).toBe(15);
        expect(turn.treasure?.itemTail).toEqual([5, 8, 34, 28, 41, 105, 105, 97, 140, 153, 127, 161, 151, 169, 144]);
        expect(turn.treasure?.itemTail).toHaveLength(turn.treasure!.operands![3]!);
        seen.push('ki-rin');
      } else if (s.x === 7 && s.y === 14) {
        // The bottleneck is crossed SILENTLY — its prerequisite cannot yet be met (test H).
        expect(turn).toEqual({ kind: 'end', text: '' });
        seen.push('bottleneck-silent');
      } else {
        expect(turn).toEqual({ kind: 'end', text: '' });
      }
    }
    expect(seen).toEqual(['captives', 'bottleneck-silent', 'ki-rin', 'hulks']);
    // The per-step counter advanced once per cell and never reached the wandering threshold of 25.
    // [0x009E] ends at 19, below 0x8273's threshold of 25, so 0x8286 RANDOM is never reached on any
    // of the 19 steps. ([0x00BF] is NOT usable as evidence here: it is rewritten every step by
    // 0x81BA and again by the target arm's own 0x9C46, and it ends at 0 whether or not a roll
    // executed — verified by re-running with [0x009E] preset to 30. CORRECTED 2026-08-06: the first
    // draft cited the [0x00BF] value as proof that the roll never ran; that rationale is retracted,
    // the assertion is kept only as a state pin.)
    expect(memory.get(0x009e)).toBe(19);
    expect(memory.get(0x00bf)).toBe(0);
  });

  it('F2. the whole walk is seed-independent — the wandering roll is skipped structurally', async () => {
    const raw = await ecl(34);
    const map = decodeGeoBlock(await geo(34), 'Pools GEO1#34').map;
    const floorAt = (x: number, y: number) => map.cells[y * 16 + x]!.floor ?? 0;

    // `0x8273 COMPARE [0x009E],#25 ; IF_LT ; EXIT` exits before `0x8286 RANDOM #99` for every one of
    // the 19 steps, so the outcome cannot depend on the seed. This is a structural guarantee, not
    // an RNG outcome — which is why this assertion is allowed to be exact.
    const patterns = new Set<string>();
    for (const seed of [0x1234, 1, 2, 3, 7, 11, 99, 2003]) {
      const memory = new Map<number, number>();
      const vm = new EclVm(raw, { memory, dialect: ECL_GEN1_SHORT_POOLS, entry: 22, seed });
      vm.run();
      vm.resume(0, { combatOutcome: 'victory' });
      const marks: string[] = [];
      for (const s of ROUTE) {
        const runner = step(raw, floorAt(s.x, s.y), memory, s.facing, seed);
        const turn = runner.start();
        marks.push(turn.kind === 'combat' ? 'C' : (turn.text ? 'T' : '.'));
        if (turn.kind === 'combat') runner.afterCombat('victory');
      }
      patterns.add(`${marks.join('')}|${memory.get(0x009e)}|${memory.get(0x00bf)}|${memory.get(0x0154)}`);
    }
    // UPDATED 2026-09-04 (round 33 Phase B): position 14 moved 'T' -> 'C'. That is the ki-rin
    // cell at (4,13), which the corrected `0x27 TREASURE` frame turns from a text-only stop
    // into the empty-roster loot award its narration promises (see test F). Seed
    // independence -- the property this test actually guards -- is unchanged: still ONE
    // pattern across all eight seeds.
    expect([...patterns]).toEqual(['....T.........C...C|19|0|2']);
  });

  it('F3. the wandering arm IS live past the 25-step threshold, and the threshold is what silences it', async () => {
    const raw = await ecl(34);
    // Past the threshold the roll runs. Seed 11 rolls 2 (<= 5) and trips the retail rogue encounter.
    const live = new Map<number, number>([[0x009e, 30]]);
    const loud = step(raw, 0x80, live, 'east', 11).start();
    expect(loud.text).toBe('YOU STUMBLE UPON A GROUP OF ROGUES.');
    expect(live.get(0x00bf)).toBeLessThanOrEqual(5);

    // Same descriptor, same seeds, still past the threshold — but these rolls lose.
    for (const seed of [0x1234, 8, 3, 99]) {
      const m = new Map<number, number>([[0x009e, 30]]);
      expect(step(raw, 0x80, m, 'east', seed).start()).toEqual({ kind: 'end', text: '' });
      expect(m.get(0x00bf)).toBeGreaterThan(5);
    }

    // The discriminating control: the SAME seed 11 that fires above is silent below the threshold,
    // and the roll register is never written at all. The route's silence is the threshold, not luck.
    const below = new Map<number, number>([[0x009e, 5]]);
    expect(step(raw, 0x80, below, 'east', 11).start()).toEqual({ kind: 'end', text: '' });
    expect(below.get(0x00bf) ?? 0).toBe(0);
  });

  it('G. [0x0154] bit 1 consumes the encounter — on defeat as well as victory', async () => {
    const raw = await ecl(34);

    // Fresh memory: fires.
    const fresh = new Map<number, number>();
    const r1 = step(raw, 0xa9, fresh);
    expect(r1.start().kind).toBe('combat');
    r1.afterCombat('victory');
    expect(fresh.get(0x0154)).toBe(2);

    // Consumed memory: the 0x9C46 gate exits silently.
    const consumed = new Map<number, number>([[0x0154, 2]]);
    expect(step(raw, 0xa9, consumed).start()).toEqual({ kind: 'end', text: '' });

    // Defeat also consumes it: `OR #2 [0x0154]` at 0x9C81 is unconditional on outcome, so losing
    // does NOT leave the encounter re-armed.
    const defeat = new Map<number, number>();
    const r2 = step(raw, 0xa9, defeat);
    expect(r2.start().kind).toBe('combat');
    r2.afterCombat('defeat');
    expect(defeat.get(0x0154)).toBe(2);
  });

  it('H. the ordering theorem: (7,14) can only be armed from (6,4), which is beyond (7,14)', async () => {
    const raw = await ecl(34);
    const graw = await geo(34);
    const map = decodeGeoBlock(graw, 'Pools GEO1#34').map;
    const floorAt = (x: number, y: number) => map.cells[y * 16 + x]!.floor ?? 0;

    // `0x973C AND #16,[0x0150] ; IF_EQ ; EXIT` — the prerequisite is bit 4.
    expect(Buffer.from(raw.slice(0x973c - 0x8000 + 2, 0x9747 - 0x8000 + 2)).toString('hex'))
      .toBe('2f001001500101bf00' + '16' + '00');

    // With only the boot's bit 0, the bottleneck is silent.
    expect(step(raw, 0x8d, new Map([[0x0150, 1]]), 'east').start()).toEqual({ kind: 'end', text: '' });

    // With bit 4 additionally set it raises the retail YES/NO question.
    const armed = new Map<number, number>([[0x0150, 0x11]]);
    const runner = step(raw, 0x8d, armed, 'east');
    const turn = runner.start();
    expect(turn.kind).toBe('say');
    expect(turn.text).toBe(DRAGON_QUESTION);
    expect((turn as { choices?: string[] }).choices).toEqual(['YES', 'NO']);

    // YES slips past silently; NO yields the four-group, sixteen-dragon roster.
    const yesRunner = step(raw, 0x8d, new Map([[0x0150, 0x11]]), 'east');
    yesRunner.start();
    expect(yesRunner.choose(0)).toEqual({ kind: 'end', text: '' });
    const noRunner = step(raw, 0x8d, new Map([[0x0150, 0x11]]), 'east');
    noRunner.start();
    const fight = noRunner.choose(1);
    expect(fight.kind).toBe('combat');
    if (fight.kind !== 'combat') throw new Error('expected the dragon combat');
    expect(fight.text).toBe('THE DRAGONS NOTICE YOU! THEY ATTACK!');
    expect(fight.monsters).toEqual([
      { monsterId: 26, count: 6, picBlockId: 26 },
      { monsterId: 27, count: 3, picBlockId: 27 },
      { monsterId: 28, count: 3, picBlockId: 28 },
      { monsterId: 29, count: 4, picBlockId: 29 },
    ]);

    // The ordering argument. `OR #16 [0x0150]` at 0x8A62 is the unique setter of bit 4 in the whole
    // corpus, and it lives in arm 12 — reachable only from a cell whose descriptor masks to 12.
    expect(Buffer.from(raw.slice(0x8a62 - 0x8000 + 2, 0x8a6b - 0x8000 + 2)).toString('hex'))
      .toBe('300010015001015001');
    const arm12Cells: Array<[number, number]> = [];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) if ((floorAt(x, y) & 0x3f) === 12) arm12Cells.push([x, y]);
    }
    expect(arm12Cells).toEqual([[6, 4]]);
    // (6,4) is NOT in the 15-cell spawn pocket, so it cannot be reached without first crossing
    // (7,14) — at which time bit 4 is still clear and the bottleneck is silent.
    const pocket = reachableFrom(graw, SPAWN, [[7, 14]]);
    expect(pocket.has(4 * 16 + 6)).toBe(false);
  });

  it('I. ON_GOTO is 0-based with 42 arms and falls through; the MASKED value selects the arm', async () => {
    const raw = await ecl(34);
    // `0x81BA AND #63,[0x002D] -> [0x00BF]` then `0x81D1 ON_GOTO [0x00BF] #42`.
    expect(Buffer.from(raw.slice(0x81ba - 0x8000 + 2, 0x81c3 - 0x8000 + 2)).toString('hex'))
      .toBe('2f003f012d0001bf00');
    expect(Buffer.from(raw.slice(0x81d1 - 0x8000 + 2, 0x81d7 - 0x8000 + 2)).toString('hex'))
      .toBe('2501bf00002a');

    // Index 41 is the last valid arm; 42 is out of range and falls through silently.
    for (const descriptor of [0xaa, 42]) {
      expect(descriptor & 0x3f).toBe(42);
      expect(step(raw, descriptor, new Map()).start()).toEqual({ kind: 'end', text: '' });
    }
    // 0x29 masks to 41 and fires the SAME arm as 0xA9 — the masked value selects, not the raw byte.
    const bare = step(raw, 0x29, new Map());
    const bareTurn = bare.start();
    expect(bareTurn.kind).toBe('combat');
    expect(bareTurn.text).toBe(HULK_TEXT);
  });

  it('J. discloses the pose seeding: the target does not depend on it, only the facing-gated (4,13) does', async () => {
    const raw = await ecl(34);
    const map = decodeGeoBlock(await geo(34), 'Pools GEO1#34').map;
    const floorAt = (x: number, y: number) => map.cells[y * 16 + x]!.floor ?? 0;

    // Re-walk with seedMemory removed entirely. The harness no longer emulates the host's pose
    // writes, so [0x0011] keeps the boot value 2 (south) for the whole route.
    const memory = new Map<number, number>();
    const vm = new EclVm(raw, { memory, dialect: ECL_GEN1_SHORT_POOLS, entry: 22, seed: 0x1234 });
    vm.run();
    vm.resume(0, { combatOutcome: 'victory' });
    const marks: string[] = [];
    for (const s of ROUTE) {
      const runner = step(raw, floorAt(s.x, s.y), memory, s.facing, 0x1234, /* seedPose */ false);
      const turn = runner.start();
      marks.push(turn.kind === 'combat' ? 'C' : (turn.text ? 'T' : '.'));
      if (turn.kind === 'combat') {
        // The target encounter is IDENTICAL without any pose seeding: arm 0x9C46 reads only [0x0154].
        expect(turn.text).toBe(HULK_TEXT);
        expect(turn.monsters).toEqual([{ monsterId: 76, count: 5, picBlockId: 76 }]);
        runner.afterCombat('victory');
      }
    }
    // The ONLY difference from test F2's pattern is the (4,13) narration at index 14.
    expect(marks.join('')).toBe('....T.............C');
    expect(memory.get(0x0154)).toBe(2);

    // ...because (4,13)'s arm 0x833B opens `COMPARE [0x0011],#3 ; IF_NE ; EXIT` — facing-gated west.
    expect(Buffer.from(raw.slice(0x833b - 0x8000 + 2, 0x8343 - 0x8000 + 2)).toString('hex'))
      .toBe('030111000003' + '17' + '00');
    for (const facing of ['north', 'east', 'south'] as Dir[]) {
      expect(step(raw, 0x81, new Map(), facing).start()).toEqual({ kind: 'end', text: '' });
    }
    expect(step(raw, 0x81, new Map(), 'west').start().text)
      .toMatch(/^DUMPED IN THE CORNER IS THE ROTTING CORPSE OF A KI-RIN\./);
  });

  it.skipIf(!existsSync(monPath))('K. resolves both rosters against the real MON1CHA.DAX names', async () => {
    const records = decodeMonsterArchive(new Uint8Array(await readFile(monPath)), 'pools-of-darkness');
    expect(records.length).toBe(122);
    const byId = new Map(records.map((r) => [r.blockId, r.name]));
    expect(byId.get(76)).toBe('UMBER HULK'); // LOAD_MONSTER #76 #5 #76 at 0x9C79
    expect(byId.get(26)).toBe('RED DRAGON'); // the arrival combat and the bottleneck
    expect(byId.get(27)).toBe('WHITE DRAGON');
    expect(byId.get(28)).toBe('GREEN DRAGON');
    expect(byId.get(29)).toBe('BLUE DRAGON');
    expect(byId.get(90)).toBe('ROGUE'); // the wandering arm at 0x8294
  });
});
