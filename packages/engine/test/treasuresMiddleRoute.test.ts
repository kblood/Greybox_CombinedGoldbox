/**
 * Golden: Treasures of the Savage Frontier's MIDDLE natural-combat route — the underground city
 * of Fireshear, `ECL1.DAX#33` / `GEO1.DAX#33`, SearchLocation high-descriptor arm 127 (the
 * occupied miner's quarters).
 *
 * Full byte evidence, the corpus-wide flag census, the mid-campaign derivation and every honest
 * limitation live in `docs/engine/research/treasures-middle-route.md`. Everything asserted here
 * was read out of the retail files or produced by running the real `EclVm` / `DialogueRunner`;
 * nothing is hand-traced.
 *
 * WHAT THIS TEST ESTABLISHES
 *   A. Block 33's cold `initial_entry` (vaddr 0x8014 = byte offset 22) byte-grounds the spawn:
 *      `SAVE #0 -> [0x0011]` / `#6 -> [0x0034]` / `#15 -> [0x0035]` at 0x815E/0x8164/0x816A,
 *      plus `LOAD_FILES #33,#12`. Arriving from area 28 (Neverwinter) reaches the SAME pose and
 *      additionally prints the sea-passage narration.
 *   C. The three encounter descriptors are located FROM the GEO bytes with the script's own
 *      `AND #127` mask at 0x83DE.
 *   D. The 36 route steps are legal directed edges over the real wall/door graph; the four doors
 *      on it are all flag 1 (automatic).
 *   E. 22 of the 36 route cells are ARTICULATION POINTS — removing any one of them strands all
 *      six descriptor-0xFF cubicles — and those 22 are exhaustively the only such cells on the
 *      map. The route is forced, not one arbitrary path.
 *   F. The full walk through the real VM with nothing seeded on top of the retail boot except
 *      `[0x0016]=28`, and the exact persistent delta it leaves: THREE words, not two — the
 *      arrival-room one-shot [0x0228], the corridor one-shot [0x022C] and the encounter's
 *      consumed [0x0230]. The three high addresses `primeSearchLocation` seeds for every Gen1
 *      dialect (0x7F79/0xC04D/0xC04F) are asserted separately rather than filtered away.
 *   G. The 0xFF consumed word [0x0230]: silent revisit, fresh-memory re-fire, and a defeat
 *      control that writes nothing and raises the retail PARLAY menu instead.
 *   H. The cross-leg gate: block 34's proven `SAVE #1 -> [0x022D]` pacifies block 33's wandering
 *      arm at a seed that otherwise fires it.
 *   I0/I/J. The Great Hall's west-only facing gate (the facing the route actually arrives with),
 *      the facing gate on descriptor 0xFD, and the `&0x3F` mask counterfactual.
 *
 * WHAT THIS TEST DOES *NOT* ESTABLISH
 *   - Nothing here is a DOSBox-X trace. Every dynamic observation is this repo's own `EclVm`, so
 *     it inherits that VM's semantics; a retail-engine divergence would be invisible.
 *   - `[0x0016]=28` is SEEDED, not produced by executing block 28. Reading it as "arrived from
 *     Neverwinter" rests on the corpus-wide guard/latch pattern (doc §2) — an inference.
 *   - Case F builds a FRESH runner per step at one fixed seed, so the 21 route cells carrying a
 *     live 5-7% wandering roll all draw the SAME first value. F therefore shows "this roll is
 *     silent, 21 times", NOT "21 independent rolls all came up silent". That is a property of the
 *     harness. Case H is where the arm's liveness is actually established, and none of F's four
 *     asserted events has a RANDOM on its path.
 *   - No browser `?explore=` route is wired for this leg and no `apps/web` file was touched.
 *   - `vm_run_1` (0x83A8) is not exercised.
 *   - Chapter naming and any reading of "middle" beyond doc §1's facts 1.1-1.4 is inference; doc
 *     §1 also records honestly that the encounters walked to here require `[0x022D]==0`, i.e.
 *     they precede the early leg's yeti victory in strict chronology.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dialogueForCell,
  decodeGeoBlock,
  decodeMonsterArchive,
  readDaxDataBlocks,
  parseEclHeader,
  ECL_GEN1_SHORT_TREASURES,
  EclVm,
} from '../src/index.js';

const treasures = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier';
const eclPath = resolve(treasures, 'ECL1.DAX');
const geoPath = resolve(treasures, 'GEO1.DAX');
const monPath = resolve(treasures, 'MON1CHA.DAX');
const haveRetail = existsSync(eclPath) && existsSync(geoPath);

async function eclBlock33(): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(eclPath)));
  return blocks.find((b) => b.blockId === 33)!.raw;
}
async function geoBlock33(): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(geoPath)));
  return blocks.find((b) => b.blockId === 33)!.raw;
}

type Dir = 'north' | 'east' | 'south' | 'west';
const DELTA: Record<Dir, [number, number]> = {
  north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
};
/** Treasures stores facing in [0x0011] as a raw ordinal (doc §2b). */
const FACING_ORDINAL: Record<Dir, number> = { north: 0, east: 1, south: 2, west: 3 };

/** Treasures' own low-address register map — NOT the CoK/DoK 0xC04x block. See doc §2b. */
const ADDR = {
  facing: 0x0011,
  areaId: 0x0016,
  x: 0x0034,
  y: 0x0035,
  /** written by ECL1#34's yeti-victory chain — the already-proven early leg's terminal write */
  yetiChamberDone: 0x022d,
  /**
   * One-shot for the (6,15) arrival-room narration. Arm 0x8535 transcribed in full
   * (corrected 2026-08-06 — an earlier comment omitted the [0x022D] fork at its head):
   *   0x8535 GOSUB [0xA188] ; IF_NE ; GOTO [0x8659]   (post-yeti fork to an alternate narration)
   *   0x853E COMPARE [0x0228],#0 ; IF_NE ; EXIT
   *   0x8546 SAVE #1 -> [0x0228] ; 0x854C PRINTCLEAR
   * Note it GOSUBs the BARE 0xA188 leaf, not the 0xA18F EXIT-wrapper.
   */
  arrivalSeen: 0x0228,
  /**
   * One-shot for the (7,13) corridor narration (arm 0x8920). Same one-shot idiom as 0x8535 but
   * reached through the 0xA18F EXIT-wrapper rather than the bare 0xA188 leaf + GOTO.
   */
  corridorSeen: 0x022c,
  /** consumed word of the descriptor-0xFE blocked-door encounter */
  blockedDoorDone: 0x022f,
  /** consumed word of the descriptor-0xFF miner's-quarters encounter */
  quartersDone: 0x0230,
  /** set only after the sea-cavern beholder dies (sole writer 0x9E36) */
  beholderDone: 0x0231,
} as const;

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

/** Breadth-first reachable set (as `y*16+x` keys) from `start`, with cells optionally removed. */
function reachableFrom(
  raw: Uint8Array,
  start: readonly [number, number],
  blocked: ReadonlyArray<readonly [number, number]> = [],
): Set<number> {
  const block = new Set(blocked.map(([x, y]) => y * 16 + x));
  const seen = new Set([start[1] * 16 + start[0]]);
  const queue: Array<[number, number]> = [[start[0], start[1]]];
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

/** Byte-grounded spawn: ECL1#33 0x815E / 0x8164 / 0x816A. */
const SPAWN = { x: 6, y: 15, facing: 'north' as Dir };

/**
 * The 36 legal directed steps from the byte-grounded spawn (6,15) to the nearest
 * descriptor-0xFF cubicle (13,14), with the facing the party carries INTO each cell.
 * Reproduced independently by
 * `python tools/find_geo_path.py --geo GEO1.DAX --block 33 --start 6,15 --target 13,14
 *  --facing north`  ->  step_count 36, final_facing "east", required_interactions 0.
 */
const ROUTE: ReadonlyArray<{ x: number; y: number; facing: Dir }> = [
  { x: 6, y: 14, facing: 'north' }, { x: 7, y: 14, facing: 'east' },
  { x: 7, y: 13, facing: 'north' }, { x: 8, y: 13, facing: 'east' },
  { x: 8, y: 12, facing: 'north' }, { x: 8, y: 11, facing: 'north' },
  { x: 7, y: 11, facing: 'west' }, { x: 7, y: 10, facing: 'north' },
  { x: 6, y: 10, facing: 'west' }, { x: 6, y: 9, facing: 'north' },
  { x: 5, y: 9, facing: 'west' }, { x: 4, y: 9, facing: 'west' },
  { x: 3, y: 9, facing: 'west' }, { x: 3, y: 8, facing: 'north' },
  { x: 3, y: 7, facing: 'north' }, { x: 4, y: 7, facing: 'east' },
  { x: 5, y: 7, facing: 'east' }, { x: 5, y: 6, facing: 'north' },
  { x: 6, y: 6, facing: 'east' }, { x: 7, y: 6, facing: 'east' },
  { x: 8, y: 6, facing: 'east' }, { x: 8, y: 7, facing: 'south' },
  { x: 9, y: 7, facing: 'east' }, { x: 10, y: 7, facing: 'east' },
  { x: 10, y: 8, facing: 'south' }, { x: 11, y: 8, facing: 'east' },
  { x: 11, y: 9, facing: 'south' }, { x: 11, y: 10, facing: 'south' },
  { x: 11, y: 11, facing: 'south' }, { x: 10, y: 11, facing: 'west' },
  { x: 10, y: 12, facing: 'south' }, { x: 11, y: 12, facing: 'east' },
  { x: 12, y: 12, facing: 'east' }, { x: 12, y: 13, facing: 'south' },
  { x: 12, y: 14, facing: 'south' }, { x: 13, y: 14, facing: 'east' },
];

/**
 * Every cell whose removal strands all six descriptor-0xFF cubicles, with the number of cells
 * still reachable from the spawn once it is removed (baseline: 197). Doc §5.
 */
const CUT_VERTICES: ReadonlyArray<readonly [number, number, number]> = [
  [7, 14, 5], [7, 13, 6], [8, 13, 7], [8, 12, 8], [8, 11, 10], [7, 11, 11], [7, 10, 13],
  [6, 10, 14], [6, 9, 15], [5, 9, 17], [4, 9, 18], [3, 9, 19], [3, 8, 58], [4, 7, 62],
  [5, 7, 63], [6, 6, 66], [10, 7, 145], [10, 8, 146], [11, 8, 147], [11, 9, 148],
  [11, 10, 149], [11, 11, 150],
];

const CELLS_FF: ReadonlyArray<readonly [number, number]> = [
  [13, 13], [14, 13], [13, 14], [14, 14], [13, 15], [14, 15],
];
const CELLS_FE: ReadonlyArray<readonly [number, number]> = [
  [9, 13], [11, 13], [9, 14], [11, 14], [9, 15], [11, 15],
];
const CELLS_FD: ReadonlyArray<readonly [number, number]> = [[1, 1], [1, 4]];

const ARRIVAL_TEXT =
  'DESCENDING A SHORT FLIGHT OF STEPS, YOU ENTER A LOW-CEILINGED ROOM, ITS WALLS CARVED FROM THE'
  + ' ROCK OF THE MOUNTAINS. THE CHAMBER IS DARK--AND FOR ONCE YOU WELCOME DARKNESS. SCATTERED'
  + ' THROUGHOUT THE ROOM, ON THE STAIRS, IN THE DOORWAYS ARE THE TWISTED BODIES OF DEAD'
  + ' MINERS--HUMANS, DWARVES, AND GNOMES ALIKE. SOME TERRIBLE EVIL HAS PASSED THIS WAY.';
const CORRIDOR_TEXT =
  'AS YOU ADVANCE DOWN THE CORRIDOR, EVERYONE IN THE PARTY INCREASINGLY BECOMES AWARE THAT THE'
  + " ONLY SOUNDS YOU HEAR ARE THE RAPS OF THE PARTY'S FOOTFALLS AND THEIR ECHOES.";
const FIRELIGHT_TEXT = 'TO THE WEST, YOU SEE A FLICKERING, BARELY VISIBLE GLOW OF FIRELIGHT.';
const QUARTERS_TEXT =
  "LIKE ALL THE REST, THIS A JUST A SMALL CUBICLE--ANOTHER MINER'S QUARTERS. UNLIKE ALL THE REST,"
  + ' THIS ONE IS OCCUPIED!';
const GHOGH_NOTE =
  "ON ONE OF THE ORCS THE PARTY FINDS A CRUDELY SCRAWLED NOTE THAT READS: 'FALLO THE MONSTRS."
  + " FIND OUT WOT'S GOING ON. HOOS IN COMAND. AINT THOS BIG DUM FRCLAWS. GHOGH'";
const WANDER_TEXT = 'A TALL, WHITE-FURRED MONSTER AND ITS GREAT WHITE DOGS APPEAR UP AHEAD!';
const MINE_SHAFT_TEXT = 'A WIDE, WELL-BRACED MINE SHAFT LEADS DOWN INTO THE DARKNESS.';

/** Build a SearchLocation runner for one cell, seeding Treasures' own facing register. */
function cellRunner(
  block: Uint8Array,
  descriptor: number,
  memory: Map<number, number>,
  facing: Dir,
  seed = 0x1234,
) {
  return dialogueForCell(block, descriptor, {
    memory,
    facing,
    dialect: ECL_GEN1_SHORT_TREASURES,
    seed,
    // primeSearchLocation seeds the CoK/DoK 0xC04D for every Gen1 dialect; Treasures reads
    // [0x0011] instead, so the pose has to be supplied here (doc §2b).
    seedMemory: { [ADDR.facing]: FACING_ORDINAL[facing] },
    // DISCLOSED (2026-08-06), not load-bearing: a blanket host stub forcing NE after any
    // 0x2D CALL. Block 33 contains exactly one 0x2D, at 0xA1A8 (after PARLAY #10 on the defeat
    // tail, immediately before GOTO 0x83D8), and case G pauses at the PARLAY menu before
    // reaching it — so the stub is inert for every assertion in this file. Kept rather than
    // removed so no assertion rests on an unexamined host stub.
    onCall: () => ({ comparison: { left: 0, right: 1 } }),
  })!;
}

describe.skipIf(!haveRetail)('Treasures ECL1#33 Fireshear — middle natural-combat route', () => {
  it('A. cold initial_entry byte-grounds the spawn at (6,15,north) and loads GEO block 33', async () => {
    const raw = await eclBlock33();
    expect(raw.length).toBe(8988);

    const header = parseEclHeader(raw, ECL_GEN1_SHORT_TREASURES);
    expect(header.magic).toBe(0x1388);
    expect(header.vmRun1).toBe(0x83a8);
    expect(header.searchLocation).toBe(0x83d8);
    expect(header.eclInitialEntry).toBe(0x8014);
    // 0x8014 - 0x7FFE = 22 = the instruction right after the 22-byte Gen1 header: real code.
    expect(header.eclInitialEntry - ECL_GEN1_SHORT_TREASURES.vbase).toBe(22);

    // The spawn literals at 0x815E / 0x8164 / 0x816A (file offsets 352 / 358 / 364), then
    // SAVE #0 -> [0x0040]. Byte-exact. Gen1 SAVE operand order is (source, dest) — destination
    // LAST — so `09 00 06 01 34 00` is `SAVE #6 -> [0x0034]` (X), not the other way round.
    expect(Buffer.from(raw.slice(352, 376)).toString('hex'))
      .toBe('09000001110009000601340009000f013500090000014000');
    // 0x817C LOAD_FILES #33,#12 followed IMMEDIATELY by 0x23 SURPRISE. Under the shared Gen1
    // short dialect 0x21 takes three operands and would swallow that 0x23 — this is Treasures'
    // own two-operand 0x21 proving itself on the bytes.
    expect(Buffer.from(raw.slice(382, 388)).toString('hex')).toBe('210021000c23');
    // The three incoming-area guards at 0x8034 / 0x8051 / 0x805C.
    expect(Buffer.from(raw.slice(54, 60)).toString('hex')).toBe('030022011600');
    expect(Buffer.from(raw.slice(83, 89)).toString('hex')).toBe('030023011600');
    expect(Buffer.from(raw.slice(94, 100)).toString('hex')).toBe('03001c011600');

    const memory = new Map<number, number>();
    const result = new EclVm(raw, {
      memory, dialect: ECL_GEN1_SHORT_TREASURES, entry: 22, seed: 0x1234,
    }).run();
    expect(result.status).toBe('exited');

    expect(memory.get(ADDR.x)).toBe(6);
    expect(memory.get(ADDR.y)).toBe(15);
    expect(memory.get(ADDR.facing)).toBe(0);
    expect(memory.get(ADDR.areaId)).toBe(33);
    expect(result.effects.find((e) => e.type === 'loadFiles'))
      .toMatchObject({ geoBlockId: 33, operands: [33, 12] });
    // A cold boot takes the default arm, so no narration and no encounter word is touched.
    expect(result.effects.some((e) => e.type === 'print')).toBe(false);
    expect(memory.get(ADDR.yetiChamberDone) ?? 0).toBe(0);
    expect(memory.get(ADDR.quartersDone) ?? 0).toBe(0);
    expect(memory.get(ADDR.beholderDone) ?? 0).toBe(0);
    // Treasures never uses the CoK/DoK host position registers.
    expect(memory.get(0xc04b)).toBeUndefined();
    expect(memory.get(0xc04c)).toBeUndefined();
  });

  it('B. arriving from Neverwinter (area 28) reaches the same pose plus the sea-passage narration', async () => {
    const raw = await eclBlock33();
    const memory = new Map<number, number>([[ADDR.areaId, 28]]);
    const result = new EclVm(raw, {
      memory, dialect: ECL_GEN1_SHORT_TREASURES, entry: 22, seed: 0x1234,
    }).run();
    expect(result.status).toBe('exited');

    expect(memory.get(ADDR.x)).toBe(6);
    expect(memory.get(ADDR.y)).toBe(15);
    expect(memory.get(ADDR.facing)).toBe(0);
    expect(memory.get(ADDR.areaId)).toBe(33);

    const text = result.effects
      .filter((e): e is Extract<typeof e, { type: 'print' }> => e.type === 'print')
      .map((e) => e.text ?? '')
      .join(' ');
    expect(text).toMatch(/^THE PASSAGE FROM NEVERWINTER IS VERY DIFFICULT/);
    expect(text).toMatch(/MAKE YOUR WAY DOWN INTO THE UNDERGROUND CITY OF FIRESHEAR\./);
    // 0x8067 `COMPARE [0x0231],#1` fails on a fresh campaign, so the narration arm is taken and
    // falls through into the SAME 0x815E spawn the cold boot uses.
    expect(memory.get(ADDR.beholderDone) ?? 0).toBe(0);
  });

  it("C. locates the three encounter descriptors from the real GEO bytes with the script's own &0x7F mask", async () => {
    const graw = await geoBlock33();
    expect(graw.length).toBe(1026);
    const map = decodeGeoBlock(graw, 'Treasures GEO1#33 Fireshear');
    const cellsWith = (masked: number) =>
      map.map.cells
        .map((cell, index) => ({ floor: cell.floor ?? 0, x: index % 16, y: Math.floor(index / 16) }))
        .filter((c) => (c.floor & 0x7f) === masked)
        .map((c) => [c.x, c.y] as const);

    expect(cellsWith(125)).toEqual(CELLS_FD);
    expect(cellsWith(126)).toEqual(CELLS_FE);
    expect(cellsWith(127)).toEqual(CELLS_FF);

    const floorAt = (x: number, y: number) => map.map.cells[y * 16 + x]!.floor ?? 0;
    // The spawn cell's own descriptor is the arrival narration — the spawn literal (test A) and
    // the map agree without either being derived from the other.
    expect(floorAt(SPAWN.x, SPAWN.y)).toBe(0x86);
    expect(floorAt(13, 14)).toBe(0xff);

    // Each 0xFF cell is a one-cell room: three wall-slot-1 edges plus a single automatic door.
    for (const [x, y] of CELLS_FF) {
      const edges = edgesOf(graw, x, y);
      const doorDirs = (['north', 'east', 'south', 'west'] as Dir[])
        .filter((d) => edges[d][1] !== 0);
      expect(doorDirs).toEqual([x === 13 ? 'west' : 'east']);
      expect(edges[doorDirs[0]!]).toEqual([5, 1]);
    }

    // Every walked cell resolves to one of nine raw descriptors: open floor 0x80, the three
    // wandering-arm bytes 0x81/0x82/0x83, four narrative cells, and the target.
    const routeFloors = ROUTE.map((s) => floorAt(s.x, s.y));
    expect([...new Set([floorAt(SPAWN.x, SPAWN.y), ...routeFloors])].sort((a, b) => a - b))
      .toEqual([0x80, 0x81, 0x82, 0x83, 0x86, 0x8a, 0x8b, 0x8c, 0xff]);
    // 21 of the 36 steps land on a live wandering-roll descriptor. See the header note and test H.
    expect(routeFloors.filter((f) => f >= 0x81 && f <= 0x83).length).toBe(21);
  });

  it('D. every one of the 36 steps is a legal directed edge, and all four doors are automatic', async () => {
    const graw = await geoBlock33();
    const cells: Array<[number, number]> = [
      [SPAWN.x, SPAWN.y], ...ROUTE.map((s) => [s.x, s.y] as [number, number]),
    ];
    expect(cells.length).toBe(37);

    const doorEdges: Array<[string, number, number]> = [];
    for (let i = 0; i + 1 < cells.length; i++) {
      const [x, y] = cells[i]!;
      const [nx, ny] = cells[i + 1]!;
      const dir = (['north', 'east', 'south', 'west'] as Dir[]).find(
        (d) => DELTA[d][0] === nx - x && DELTA[d][1] === ny - y,
      )!;
      // The step direction must match the facing the route carries into the destination cell.
      expect(dir).toBe(ROUTE[i]!.facing);
      const [wall, door] = edgesOf(graw, x, y)[dir];
      expect(wall === 0 || door !== 0).toBe(true); // passable
      expect(door).not.toBe(2); // no bash/pick
      expect(door).not.toBe(3); // no knock
      if (door !== 0) doorEdges.push([`(${x},${y})->${dir}`, wall, door]);
    }
    expect(doorEdges).toEqual([
      ['(3,8)->north', 2, 1],
      ['(11,10)->south', 2, 1],
      ['(10,11)->south', 2, 1],
      ['(12,14)->east', 5, 1],
    ]);
  });

  it('E. proves the route is forced: 22 of its cells are articulation points for all six cubicles', async () => {
    const graw = await geoBlock33();
    const start: readonly [number, number] = [SPAWN.x, SPAWN.y];
    const key = ([x, y]: readonly [number, number]) => y * 16 + x;

    const base = reachableFrom(graw, start);
    expect(base.size).toBe(197);
    // The spawn's component holds every 0xFE and 0xFF cell...
    for (const cell of [...CELLS_FE, ...CELLS_FF]) expect(base.has(key(cell))).toBe(true);
    // ...but NOT the two sea-cavern 0xFD cells: they live in a separate 29-cell pocket (test I).
    for (const cell of CELLS_FD) expect(base.has(key(cell))).toBe(false);
    expect(reachableFrom(graw, [1, 2]).size).toBe(29);

    const routeKeys = new Set(
      [start, ...ROUTE.map((s) => [s.x, s.y] as const)].map(key),
    );
    for (const [x, y, remaining] of CUT_VERTICES) {
      const cut = reachableFrom(graw, start, [[x, y]]);
      expect(cut.size).toBe(remaining);
      // Removing this one cell strands ALL SIX cubicles, so any route to any of them must pass
      // through it...
      for (const cell of CELLS_FF) expect(cut.has(key(cell))).toBe(false);
      // ...and it lies on the walked route.
      expect(routeKeys.has(y * 16 + x)).toBe(true);
    }
    expect(CUT_VERTICES.length).toBe(22);

    // Exhaustive sweep: these 22 are the ONLY single-cell cuts on the whole 16x16 map.
    const found: string[] = [];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (x === SPAWN.x && y === SPAWN.y) continue;
        if (CELLS_FF.some(([cx, cy]) => cx === x && cy === y)) continue;
        const cut = reachableFrom(graw, start, [[x, y]]);
        if (!CELLS_FF.some((cell) => cut.has(key(cell)))) found.push(`${x},${y}`);
      }
    }
    expect(found.sort()).toEqual(CUT_VERTICES.map(([x, y]) => `${x},${y}`).sort());
  });

  it("F. walks the 36 steps from the retail boot and fights the miners' quarters at the end", async () => {
    const raw = await eclBlock33();
    const graw = await geoBlock33();
    const map = decodeGeoBlock(graw, 'Treasures GEO1#33 Fireshear');
    const floorAt = (x: number, y: number) => map.map.cells[y * 16 + x]!.floor ?? 0;

    // Boot the block for real; the ONLY thing seeded on top is the incoming-area word.
    const memory = new Map<number, number>([[ADDR.areaId, 28]]);
    expect(new EclVm(raw, {
      memory, dialect: ECL_GEN1_SHORT_TREASURES, entry: 22, seed: 0x1234,
    }).run().status).toBe('exited');
    expect(memory.get(ADDR.x)).toBe(6);
    expect(memory.get(ADDR.y)).toBe(15);

    // The party is standing on the arrival cell before it takes a single step. Descriptor 0x86
    // masks to 6, whose arm 0x8535 is (corrected 2026-08-06 — the earlier comment started this
    // listing at the one-shot check and omitted the fork):
    //   0x8535 GOSUB [0xA188] ; IF_NE ; GOTO [0x8659]  (post-yeti fork to an alternate narration)
    //   0x853E COMPARE [0x0228],#0 ; IF_NE ; EXIT
    //   0x8546 SAVE #1 -> [0x0228] ; 0x854C PRINTCLEAR
    // So this step DOES leave a persistent write behind.
    expect(memory.get(ADDR.arrivalSeen) ?? 0).toBe(0);
    expect(cellRunner(raw, floorAt(SPAWN.x, SPAWN.y), memory, SPAWN.facing).start())
      .toEqual({ kind: 'end', text: ARRIVAL_TEXT });
    expect(memory.get(ADDR.arrivalSeen)).toBe(1);

    const seen: string[] = [];
    for (const step of ROUTE) {
      const runner = cellRunner(raw, floorAt(step.x, step.y), memory, step.facing);
      const turn = runner.start();

      if (step.x === 7 && step.y === 13) {
        expect(turn).toEqual({ kind: 'end', text: CORRIDOR_TEXT });
        seen.push('corridor');
      } else if (step.x === 5 && step.y === 9) {
        expect(turn).toEqual({ kind: 'end', text: FIRELIGHT_TEXT });
        seen.push('firelight');
      } else if (step.x === 3 && step.y === 9) {
        expect(turn.kind).toBe('end');
        expect(turn.text).toMatch(/^YOU STEP INTO THE GREAT HALL OF FIRESHEAR\. IT HAS BEEN RANSACKED\./);
        expect(turn.text).toMatch(/MASSIVE, TRIANGULAR GRANITE TABLE-- OVERTURNED AND CRACKED IN TWO/);
        seen.push('great-hall');
      } else if (step.x === 13 && step.y === 14) {
        expect(turn.kind).toBe('combat');
        if (turn.kind !== 'combat') throw new Error('expected the miners-quarters combat');
        expect(turn.text).toBe(QUARTERS_TEXT);
        expect(turn.monsters).toEqual([
          { monsterId: 84, count: 3, picBlockId: 84 },
          { monsterId: 89, count: 3, picBlockId: 89 },
        ]);
        expect(turn.setup).toMatchObject({ spriteId: 255, maxDistance: 0, picId: 150, distance: 0 });
        // 0xA0F7 `SAVE #1 -> [0x0230]` lands only AFTER combat, so the word is clear at the pause.
        expect(memory.get(ADDR.quartersDone) ?? 0).toBe(0);
        const after = runner.afterCombat('victory');
        expect(after).toEqual({ kind: 'end', text: GHOGH_NOTE });
        expect(runner.isDone()).toBe(true);
        expect(memory.get(ADDR.quartersDone)).toBe(1);
        seen.push('quarters-combat');
      } else {
        // Open floor (0x80) plus the three wandering-roll descriptors, silent at this seed.
        expect(turn).toEqual({ kind: 'end', text: '' });
      }
    }
    expect(seen).toEqual(['corridor', 'firelight', 'great-hall', 'quarters-combat']);

    // Exact delta of the whole walk inside Treasures' own persistent word band (0x0100-0x0FFF):
    // the arrival one-shot, the corridor one-shot, and the encounter's consumed word. Nothing else.
    const persistent = [...memory.entries()]
      .filter(([addr]) => addr >= 0x0100 && addr < 0x1000)
      .sort((a, b) => a[0] - b[0]);
    expect(persistent).toEqual([
      [ADDR.arrivalSeen, 1], [ADDR.corridorSeen, 1], [ADDR.quartersDone, 1],
    ]);
    // Disclosure, not a script fact: `primeSearchLocation` seeds the CoK/DoK-family Gen1 host
    // registers for EVERY Gen1 dialect, so three high addresses also carry values after the walk
    // (the last cell's descriptor 0xFF and facing east). No Treasures script reads any of them —
    // a corpus-wide SAVE-destination census finds zero writes to 0xC04B/0xC04C/0xC04D. They are
    // asserted here so the delta above cannot be accused of hiding them behind a filter.
    const aboveBand = [...memory.entries()]
      .filter(([addr]) => addr >= 0x1000)
      .sort((a, b) => a[0] - b[0]);
    expect(aboveBand).toEqual([[0x7f79, 0x3f], [0xc04d, 1], [0xc04f, 0xff]]);
    // Nothing on this route touched the other two fixed encounters or the early leg's word.
    expect(memory.get(ADDR.yetiChamberDone) ?? 0).toBe(0);
    expect(memory.get(ADDR.blockedDoorDone) ?? 0).toBe(0);
    expect(memory.get(ADDR.beholderDone) ?? 0).toBe(0);
  });

  it('G. the consumed word silences a revisit, a fresh campaign re-fires, and defeat writes nothing', async () => {
    const raw = await eclBlock33();

    // Revisit on the consumed memory: 0xA07D `IF_NE ; EXIT` before the PRINTCLEAR.
    const consumed = new Map<number, number>([[ADDR.quartersDone, 1]]);
    expect(cellRunner(raw, 0xff, consumed, 'east').start()).toEqual({ kind: 'end', text: '' });
    expect(consumed.get(ADDR.quartersDone)).toBe(1);

    // Negative control: the suppression is the retail word, not runner state.
    const fresh = new Map<number, number>();
    const again = cellRunner(raw, 0xff, fresh, 'east');
    const turn = again.start();
    expect(turn.kind).toBe('combat');
    if (turn.kind !== 'combat') throw new Error('expected the encounter to re-fire on fresh memory');
    expect(turn.monsters).toEqual([
      { monsterId: 84, count: 3, picBlockId: 84 },
      { monsterId: 89, count: 3, picBlockId: 89 },
    ]);
    expect(fresh.get(ADDR.quartersDone) ?? 0).toBe(0);
    again.afterCombat('victory');
    expect(fresh.get(ADDR.quartersDone)).toBe(1);

    // Defeat takes 0xA0F2's `IF_NE ; GOTO 0xA197` instead: no consumed write, and the retail
    // parlay menu is raised.
    const defeated = new Map<number, number>();
    const loser = cellRunner(raw, 0xff, defeated, 'east');
    expect(loser.start().kind).toBe('combat');
    const after = loser.afterCombat('defeat');
    expect(after.kind).toBe('say');
    if (after.kind !== 'say') throw new Error('expected the parlay menu after defeat');
    expect(after.choices).toEqual(['HAUGHTY', 'SLY', 'NICE', 'MEEK', 'ABUSIVE']);
    expect(defeated.get(ADDR.quartersDone)).toBeUndefined();

    // The 0xFE blocked-door encounter is the same shape on its own word [0x022F].
    const door = new Map<number, number>();
    const doorRunner = cellRunner(raw, 0xfe, door, 'east');
    const doorTurn = doorRunner.start();
    expect(doorTurn.kind).toBe('combat');
    if (doorTurn.kind !== 'combat') throw new Error('expected the blocked-door combat');
    expect(doorTurn.text).toMatch(/^SOMETHING IS BLOCKING THIS DOOR\./);
    expect(doorTurn.monsters).toEqual([
      { monsterId: 86, count: 3, picBlockId: 86 },
      { monsterId: 89, count: 2, picBlockId: 89 },
      { monsterId: 84, count: 1, picBlockId: 84 },
    ]);
    expect(doorRunner.afterCombat('victory').text)
      .toMatch(/FIND OUT HOOS GIVING THE ORDRS! GHOGH\./);
    expect(door.get(ADDR.blockedDoorDone)).toBe(1);
  });

  it("H. the wandering arm is LIVE, and the early leg's [0x022D] write is what pacifies it", async () => {
    const raw = await eclBlock33();
    // Arm 1 @0x84F6: `RANDOM #129 -> [0x00BF] ; COMPARE [0x00BF],#9 ; IF_GE ; EXIT ;
    // GOSUB 0xA18F ; SUBTRACT ... ; GOTO 0x822D`.
    const roll = (seed: number, seedYetiDone = false) => {
      const memory = new Map<number, number>(seedYetiDone ? [[ADDR.yetiChamberDone, 1]] : []);
      const runner = cellRunner(raw, 0x81, memory, 'north', seed);
      return { runner, turn: runner.start(), memory };
    };

    // The seed the walk (test F) uses, plus four more: every roll lands >= 9, so every step is
    // silent. This is the harness disclosure in the header, not a structural guarantee.
    for (const [seed, expected] of [[0x1234, 16], [2003, 73], [7, 93], [99, 106], [12345, 71]] as const) {
      const quiet = roll(seed);
      expect(quiet.turn).toEqual({ kind: 'end', text: '' });
      expect(quiet.memory.get(0x00bf)).toBe(expected);
    }

    // Seed 8 rolls 2 and trips the arm for real. Deliberately coupled to the engine's PRNG: this
    // is the assertion that test F's silence is an RNG outcome, not a structural one.
    const loud = roll(8);
    expect(loud.memory.get(0x00bf)).toBe(2);
    expect(loud.turn.kind).toBe('say');
    if (loud.turn.kind !== 'say') throw new Error('expected the wandering encounter menu');
    expect(loud.turn.text).toBe(WANDER_TEXT);
    expect(loud.turn.choices).toEqual(['ATTACK', 'FLEE']);
    const fight = loud.runner.choose(0);
    expect(fight.kind).toBe('combat');
    if (fight.kind !== 'combat') throw new Error('expected a real roster after ATTACK');
    expect(fight.monsters).toEqual([
      { monsterId: 86, count: 3, picBlockId: 86 },
      { monsterId: 84, count: 1, picBlockId: 84 },
    ]);

    // THE CROSS-LEG CLAIM: same seed, same cell, but with the early leg's proven terminal write
    // (`ECL1#34 0x8DF9 SAVE #1 -> [0x022D]`) already in memory. The roll still happens — it is
    // upstream of the gate, and still comes up 2 — but 0xA18F's `IF_NE ; EXIT` abandons the arm.
    const pacified = roll(8, true);
    expect(pacified.memory.get(0x00bf)).toBe(2);
    expect(pacified.turn).toEqual({ kind: 'end', text: '' });
    // The same word also silences both fixed encounters on an otherwise fresh campaign.
    for (const descriptor of [0xfe, 0xff]) {
      expect(cellRunner(raw, descriptor, new Map([[ADDR.yetiChamberDone, 1]]), 'east').start())
        .toEqual({ kind: 'end', text: '' });
    }
  });

  it('I0. the Great Hall narration is facing-gated west, which is the facing the route arrives with', async () => {
    const raw = await eclBlock33();
    // Arm masked-12 @0x8A3F: `COMPARE [0x0011],#3 ; IF_NE ; EXIT` before anything else. The route
    // enters (3,9) heading west (step 13), so the beat is not incidental to the path taken — it is
    // reachable only because the walk approaches the Great Hall from the east.
    expect(ROUTE[12]).toEqual({ x: 3, y: 9, facing: 'west' });
    for (const facing of ['north', 'east', 'south'] as Dir[]) {
      expect(cellRunner(raw, 0x8c, new Map<number, number>(), facing).start())
        .toEqual({ kind: 'end', text: '' });
    }
    const west = cellRunner(raw, 0x8c, new Map<number, number>(), 'west').start();
    expect(west.kind).toBe('end');
    expect(west.text).toMatch(/^YOU STEP INTO THE GREAT HALL OF FIRESHEAR\. IT HAS BEEN RANSACKED\./);
  });

  it('I. descriptor 0xFD is facing-gated (west only) and lives outside the city component', async () => {
    const raw = await eclBlock33();
    // 0x9B84: `COMPARE [0x0011],#3 ; IF_NE ; EXIT` — facing, not a flag.
    for (const facing of ['north', 'east', 'south'] as Dir[]) {
      expect(cellRunner(raw, 0xfd, new Map<number, number>(), facing).start())
        .toEqual({ kind: 'end', text: '' });
    }
    const west = cellRunner(raw, 0xfd, new Map<number, number>(), 'west').start();
    expect(west.kind).toBe('combat');
    if (west.kind !== 'combat') throw new Error('expected the sea-cavern combat facing west');
    expect(west.text).toMatch(/^THIS CAVERN ON THE SEA IS FILLED WITH YETI AND ICE HOUNDS\./);
    expect(west.monsters).toEqual([
      { monsterId: 84, count: 8, picBlockId: 84 },
      { monsterId: 86, count: 10, picBlockId: 86 },
    ]);

    // 0x9B8C: once the beholder is dead ([0x0231], sole writer 0x9E36) the same west-facing step
    // is scenery instead.
    const done = cellRunner(raw, 0xfd, new Map([[ADDR.beholderDone, 1]]), 'west').start();
    expect(done.kind).toBe('end');
    expect(done.text).toMatch(/^THE ROOF OF THE CAVERN HERE OPENS OUT TO THE SKY/);

    // Both 0xFD cells are entered through an automatic door from the east — i.e. the party
    // physically arrives facing west, which is exactly what the gate demands.
    const graw = await geoBlock33();
    for (const [x, y] of CELLS_FD) {
      expect(edgesOf(graw, x, y).east).toEqual([5, 1]);
      expect(edgesOf(graw, x + 1, y).west).toEqual([5, 1]);
    }
  });

  it('J. the &0x3F mask counterfactual routes all three encounters into the mine shaft to area 34', async () => {
    const raw = await eclBlock33();
    // 0x83DE masks with #127. Under #63 the three encounter descriptors become 61/62/63, which
    // fall into the 0x8469 arm — whose DESCEND branch is `NEWECL #34`, the early leg's area.
    // The wrong mask does not lose the encounter; it silently teleports the party.
    for (const [raw127, raw63] of [[0xff, 63], [0xfe, 62], [0xfd, 61]] as const) {
      expect(raw127 & 0x3f).toBe(raw63);
      const turn = cellRunner(raw, raw63, new Map<number, number>(), 'west').start();
      expect(turn.kind).toBe('say');
      if (turn.kind !== 'say') throw new Error('expected the mine-shaft menu under the wrong mask');
      expect(turn.text).toBe(MINE_SHAFT_TEXT);
      expect(turn.choices).toEqual(['DESCEND', 'AVOID']);
    }
  });

  it.skipIf(!existsSync(monPath))('K. resolves every roster id against the real MON1CHA.DAX names', async () => {
    const records = decodeMonsterArchive(
      new Uint8Array(await readFile(monPath)), 'treasures-of-the-savage-frontier',
    );
    const byId = new Map(records.map((r) => [r.blockId, r.name]));
    expect(byId.get(84)).toBe('YETI CHIEF');   // 0xA0E3 LOAD_MONSTER #84,#3,#84
    expect(byId.get(89)).toBe('ORC CHIEF');    // 0xA0EA LOAD_MONSTER #89,#3,#89
    expect(byId.get(86)).toBe('ICE HOUND');    // the 0xFE and wandering rosters
    expect(byId.get(31)).toBe('BEHOLDER');     // 0x9E29, the sea cavern's second wave
    // 84 and 86 are the same ids the already-proven early leg decodes out of this archive.
  });
});
