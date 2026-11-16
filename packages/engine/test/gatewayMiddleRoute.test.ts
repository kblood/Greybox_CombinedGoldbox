/**
 * Golden: Gateway to the Savage Frontier's MIDDLE natural-combat route — the shipwreck island,
 * ECL4.DAX#12, SearchLocation high-table arms 126 (beach scrags) and 124 (the ruined lighthouse).
 *
 * Full byte evidence, the corpus-wide word census, every rejected candidate and the honest
 * limitations live in `docs/engine/research/gateway-middle-route.md`. Everything asserted here was
 * read from the retail files or produced by running the real `EclVm`; nothing is hand-traced.
 *
 * Shape of the proof:
 *   A. Cold `initial_entry` (vaddr 0x8014 = byte offset 22) is the block's real boot leg and
 *      byte-grounds the spawn: `SAVE #13 -> [0xC04C]`, `SAVE #13 -> [0xC04B]`, `SAVE #0 -> [0xC04D]`
 *      at vaddrs 0x804F/0x8055/0x805B, plus `SAVE #1 -> [0x4BE6]` (inDungeon) and
 *      `LOAD_FILES #12,#2,#255` (GEO block id 12 = GEO4.DAX#12).
 *   B. The dispatch descriptors are located FROM the GEO bytes with the script's own `AND #127`
 *      mask at vaddr 0x8321.
 *   C. The wall/door graph: the 19 legal directed steps, the single automatic door, and the BFS
 *      proof that the descriptor-126 beach cell (12,10) is an ARTICULATION POINT — the lighthouse
 *      cannot be reached without fighting the scrags.
 *   D. The full walk through the real VM with NOTHING seeded on top of the retail boot.
 *      Read D's silence precisely: it builds a FRESH runner per step, all on seed 0x1234, so the
 *      fourteen descriptor-1 cells each draw the SAME first value rather than fourteen independent
 *      rolls off one stream. D therefore shows "this roll is silent, fourteen times", not "fourteen
 *      independent rolls all came up silent". That is a property of the harness, not of the retail
 *      script, and it does not touch the two encounters D asserts (both are flag-gated, not random).
 *      J is where the arm's liveness is actually established.
 *   E-G. The lighthouse encounter, its consumed word [0x4C0B], the YES/NO fork writing the
 *      corpus-unique [0x4C36], the silent legal revisits and a fresh-memory negative control.
 *   H. The consumed word changes a DIFFERENT cell ((15,7) descriptor 12), and (14,6) descriptor 13
 *      is facing-gated rather than flag-gated.
 *   I. The `&0x3F` mask counterfactual — here it is discriminating: both encounters go silent.
 *   J. Disclosure: the open-terrain arm carries a live 3% wandering roll. Silence at the documented
 *      seed is an RNG outcome, not a structural guarantee.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dialogueForCell,
  primeSearchLocation,
  DialogueRunner,
  decodeGeoBlock,
  decodeMonsterArchive,
  readDaxDataBlocks,
  parseEclHeader,
  ECL_GEN1_SHORT_GATEWAY,
  EclVm,
  type EclEffect,
} from '../src/index.js';

const gateway = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const eclPath = resolve(gateway, 'ECL4.DAX');
const geoPath = resolve(gateway, 'GEO4.DAX');
const monPath = resolve(gateway, 'MON4CHA.DAX');
const haveRetail = existsSync(eclPath) && existsSync(geoPath);

async function block12(): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(eclPath)));
  return blocks.find((b) => b.blockId === 12)!.raw;
}

async function geoBlock12(): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(geoPath)));
  return blocks.find((b) => b.blockId === 12)!.raw;
}

type Dir = 'north' | 'east' | 'south' | 'west';
const DELTA: Record<Dir, [number, number]> = {
  north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
};

/**
 * The Gen1 GEO edge graph, decoded exactly as `tools/find_geo_path.decode_edges` does it:
 * wall planes at raw[2:258] / raw[258:514], door flags at raw[770:1026]. Returns
 * `[wallSlot, doorFlag]` per direction. An edge is passable when the wall slot is 0 OR a door flag
 * is set.
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

/** Breadth-first reachable-cell count from `start`, optionally with cells removed from the graph. */
function reachableFrom(raw: Uint8Array, start: [number, number], blocked: Array<[number, number]> = []): number {
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
  return seen.size;
}

function printedText(effects: readonly EclEffect[]): string {
  return effects
    .filter((e): e is Extract<EclEffect, { type: 'print' }> => e.type === 'print')
    .map((e) => e.text ?? '')
    .join(' ');
}

/**
 * The 19 legal directed steps from the block's own byte-grounded spawn `(13,13,north)` to the
 * nearest descriptor-124 cell `(14,5)`, with the facing the party carries INTO each cell.
 * `tools/find_geo_path.py --geo GEO4.DAX --block 12 --start 13,13 --target 14,5 --facing north`.
 */
const ROUTE: ReadonlyArray<{ x: number; y: number; facing: Dir }> = [
  { x: 13, y: 12, facing: 'north' }, { x: 13, y: 11, facing: 'north' },
  { x: 14, y: 11, facing: 'east' }, { x: 15, y: 11, facing: 'east' },
  { x: 15, y: 10, facing: 'north' }, { x: 15, y: 9, facing: 'north' },
  { x: 14, y: 9, facing: 'west' }, { x: 14, y: 10, facing: 'south' },
  { x: 13, y: 10, facing: 'west' }, { x: 12, y: 10, facing: 'west' },
  { x: 12, y: 9, facing: 'north' }, { x: 12, y: 8, facing: 'north' },
  { x: 13, y: 8, facing: 'east' }, { x: 14, y: 8, facing: 'east' },
  { x: 15, y: 8, facing: 'east' }, { x: 15, y: 7, facing: 'north' },
  { x: 14, y: 7, facing: 'west' }, { x: 14, y: 6, facing: 'north' },
  { x: 14, y: 5, facing: 'north' },
];

const BEACH_TEXT =
  'THREE TALL, FOUL-SMELLING CREATURES ARE KNEELING IN THE CENTER OF THIS BEACH, TEARING STRIPS'
  + " OF MEAT FROM A SINGLE SMALL FISH THEY'VE CAUGHT. WHEN THEY SEE THE PARTY THEY CRY OUT IN"
  + ' HARSH, HIGH TONES AND THEN ATTACK!';
const LIGHTHOUSE_TEXT =
  "SEVERAL MEN ARE IN THE LIGHTHOUSE KEEPER'S QUARTERS, RUMMAGING THROUGH ITS CABINETS AND CHESTS."
  + ' THEY ATTACK!';
/** `0x8A05`, prefixed at runtime by the `GOSUB 0x8429` party-member name (empty when partyless). */
const DOUSE_QUESTION =
  "LOOKS AROUND THE RUINED LIGHTHOUSE AND SAYS, 'IF THOSE PIRATES WERE TENDING THE LIGHT, MAYBE"
  + " WHOEVER PLANS TO USE IT IS AN ENEMY, NOT A FRIEND. SHOULD WE DOUSE IT?'";

describe.skipIf(!haveRetail)('Gateway ECL4#12 shipwreck island — middle natural-combat route', () => {
  it('A. cold initial_entry is the real boot leg and byte-grounds the spawn at (13,13,north)', async () => {
    const raw = await block12();
    expect(raw.length).toBe(3464);

    const header = parseEclHeader(raw, ECL_GEN1_SHORT_GATEWAY);
    expect(header.magic).toBe(0x1388);
    expect(header.vmRun1).toBe(0x8383);
    expect(header.searchLocation).toBe(0x831a);
    expect(header.eclInitialEntry).toBe(0x8014);
    // 0x8014 - 0x7FFE = 22 = the instruction immediately after the 22-byte header: real code, not a
    // trampoline into somewhere else.
    expect(header.eclInitialEntry - ECL_GEN1_SHORT_GATEWAY.vbase).toBe(22);

    // The three spawn SAVEs, as bytes, at their quoted file offsets (0x804F / 0x8055 / 0x805B).
    expect(Buffer.from(raw.slice(81, 99)).toString('hex')).toBe('09000d014cc009000d014bc0090000014dc0');
    // The single incoming-area guard: COMPARE [0x4BF2],#12 ; IF_EQ ; GOTO 0x8308.
    expect(Buffer.from(raw.slice(70, 81)).toString('hex')).toBe('0301f24b000c1601010883');

    const memory = new Map<number, number>();
    const vm = new EclVm(raw, { memory, dialect: ECL_GEN1_SHORT_GATEWAY, entry: 22, seed: 0x1234 });
    const r = vm.run();
    expect(r.status).toBe('exited');

    expect(memory.get(0xc04b)).toBe(13);
    expect(memory.get(0xc04c)).toBe(13);
    expect(memory.get(0xc04d)).toBe(0);
    // 0x8030 SAVE #1 -> [0x4BE6]: the island is inDungeon=1 (the local/tactical map mode).
    expect(memory.get(0x4be6)).toBe(1);
    expect(memory.get(0x4bfe)).toBe(9);
    expect(memory.get(0x4bfb)).toBe(0);
    expect(memory.get(0x4c00)).toBe(0);
    // [0x4BF2] is untouched on a cold boot (its only two ECL writers corpus-wide are ECL5#99/#98,
    // which write 0 and 1), so 0x8044's `== #12` fails and control falls to the 0x804F spawn.
    expect(memory.get(0x4bf2) ?? 0).toBe(0);
    // Neither encounter's consumed word has been touched by the boot.
    expect(memory.get(0x4c09) ?? 0).toBe(0);
    expect(memory.get(0x4c0b) ?? 0).toBe(0);
    expect(memory.get(0x4c36) ?? 0).toBe(0);

    expect(r.effects.find((e) => e.type === 'loadFiles')).toMatchObject({
      geoBlockId: 12, operands: [12, 2, 255],
    });
    expect(r.effects.find((e) => e.type === 'loadPieces')).toMatchObject({ setBlockIds: [8, 15, 9] });

    const text = printedText(r.effects);
    expect(text).toMatch(/CRASH!!! A YARDARM FALLS TO THE DECK/);
    expect(text).toMatch(/A GIANT KRAKEN TIGHTENS ITS INEXORABLE GRIP!/);
    expect(text).toMatch(/FOR 3 DAYS, NO TRACE OF SHIP OR LAND\./);
    expect(text).toMatch(/YOU FINALLY SPOT A TINY ISLAND/);
  });

  it('B. locates both dispatch descriptors from the real GEO bytes with the script\'s own &0x7F mask', async () => {
    const graw = await geoBlock12();
    expect(graw.length).toBe(1026);
    const map = decodeGeoBlock(graw, 'Gateway GEO4#12 shipwreck island');
    const cellsWith = (masked: number) =>
      map.map.cells
        .map((cell, index) => ({ floor: cell.floor ?? 0, x: index % 16, y: Math.floor(index / 16) }))
        .filter((c) => (c.floor & 0x7f) === masked)
        .map((c) => [c.x, c.y, c.floor]);

    expect(cellsWith(124)).toEqual([[14, 4, 0xfc], [14, 5, 0xfc], [15, 5, 0xfc]]);
    // Exactly one descriptor-126 cell in the whole map — the beach.
    expect(cellsWith(126)).toEqual([[12, 10, 0x7e]]);

    const floorAt = (x: number, y: number) => map.map.cells[y * 16 + x]!.floor ?? 0;
    expect(floorAt(13, 13)).toBe(0x05); // spawn, masked 5 -> arm 0x85E7 (bare EXIT)
    expect(floorAt(13, 12)).toBe(0x02); // masked 2 -> arm 0x85E4 (bare EXIT)
    expect(floorAt(15, 7)).toBe(0x0c); // masked 12 -> arm 0x880F (gated on [0x4C0B])
    expect(floorAt(14, 6)).toBe(0x0d); // masked 13 -> arm 0x8882 (gated on facing)
    // Every route cell resolves to one of five raw descriptor bytes: open terrain 0x01, the inert
    // 0x02 step out of the wreck camp, the two narration cells 0x0C/0x0D, and the two encounters.
    const routeFloors = ROUTE.map((s) => floorAt(s.x, s.y));
    expect([...new Set(routeFloors)].sort((a, b) => a - b)).toEqual([0x01, 0x02, 0x0c, 0x0d, 0x7e, 0xfc]);
    expect(routeFloors.filter((f) => f === 0x01).length).toBe(14);

    // The mask choice is load-bearing on THIS map: 18 descriptor bytes differ between &0x3F and
    // &0x7F, and every one of them is a high-table encounter cell.
    const differing = map.map.cells.filter((c) => ((c.floor ?? 0) & 0x3f) !== ((c.floor ?? 0) & 0x7f));
    expect(differing.length).toBe(18);
  });

  it.skipIf(!existsSync(monPath))('B2. resolves both rosters against the real MON4CHA.DAX names', async () => {
    const records = decodeMonsterArchive(new Uint8Array(await readFile(monPath)), 'gateway-to-the-savage-frontier');
    const byId = new Map(records.map((r) => [r.blockId, r.name]));
    // LOAD_MONSTER #69,#3,#69 at 0x8C2A (beach) and #69,#1,#69 at 0x89EA (lighthouse).
    expect(byId.get(69)).toBe('SCRAG');
    // LOAD_MONSTER #70,#5,#70 at 0x89E3 (lighthouse).
    expect(byId.get(70)).toBe('PIRATE');
  });

  it('C. the route is legal over the real wall/door graph and (12,10) is an articulation point', async () => {
    const graw = await geoBlock12();

    // Every step is a legal directed edge; exactly one of the nineteen is a door, and it is flag 1
    // (automatic — no bash/pick/knock anywhere on this route).
    const cells: Array<[number, number]> = [[13, 13], ...ROUTE.map((s) => [s.x, s.y] as [number, number])];
    const doorEdges: Array<[string, number, number]> = [];
    for (let i = 0; i + 1 < cells.length; i++) {
      const [x, y] = cells[i]!;
      const [nx, ny] = cells[i + 1]!;
      const dir = (['north', 'east', 'south', 'west'] as Dir[]).find(
        (d) => DELTA[d][0] === nx - x && DELTA[d][1] === ny - y,
      )!;
      const [wall, door] = edgesOf(graw, x, y)[dir];
      expect(wall === 0 || door !== 0).toBe(true); // passable
      expect(door).not.toBe(2); // no bash/pick
      expect(door).not.toBe(3); // no knock
      if (door !== 0 || wall !== 0) doorEdges.push([`(${x},${y})->${dir}`, wall, door]);
    }
    expect(doorEdges).toEqual([['(14,6)->north', 15, 1]]);

    // The beach cell is a genuine cut vertex: removing it strands the entire northern half of the
    // island, including all three descriptor-124 lighthouse cells.
    expect(reachableFrom(graw, [13, 13])).toBe(70);
    expect(reachableFrom(graw, [13, 13], [[12, 10]])).toBe(28);
  });

  it('D. walks the nineteen legal steps, fighting the forced beach scrags and then the lighthouse', async () => {
    const raw = await block12();
    const map = decodeGeoBlock(await geoBlock12(), 'Gateway GEO4#12 shipwreck island');
    const floorAt = (x: number, y: number) => map.map.cells[y * 16 + x]!.floor ?? 0;

    // The walk starts from whatever the retail boot leaves behind — NOTHING is seeded on top.
    const memory = new Map<number, number>();
    expect(new EclVm(raw, { memory, dialect: ECL_GEN1_SHORT_GATEWAY, entry: 22, seed: 0x1234 }).run().status)
      .toBe('exited');
    expect(memory.get(0xc04b)).toBe(13);
    expect(memory.get(0xc04c)).toBe(13);
    expect(memory.get(0x4c01) ?? 0).toBe(0);
    expect(memory.get(0x4c02) ?? 0).toBe(0);

    const seen: string[] = [];
    for (const step of ROUTE) {
      const runner = dialogueForCell(raw, floorAt(step.x, step.y), {
        memory, facing: step.facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
        onCall: () => ({ comparison: { left: 0, right: 1 } }),
      })!;
      expect(runner).not.toBeNull();
      const turn = runner.start();

      if (step.x === 12 && step.y === 10) {
        // Step 10: the forced beach encounter. `SAVE #1 -> [0x4C09]` at 0x8C32 lands only after
        // COMBAT, so the word is still clear at the pause.
        expect(turn.kind).toBe('combat');
        if (turn.kind !== 'combat') throw new Error('expected the beach scrag combat');
        expect(turn.text).toBe(BEACH_TEXT);
        expect(turn.pictureId).toBe(41);
        expect(turn.monsters).toEqual([{ monsterId: 69, count: 3, picBlockId: 69 }]);
        expect(memory.get(0x4c09) ?? 0).toBe(0);
        expect(runner.afterCombat('victory')).toEqual({ kind: 'end', text: '' });
        expect(memory.get(0x4c09)).toBe(1);
        expect(memory.get(0x4c0b) ?? 0).toBe(0);
        seen.push('beach-combat');
      } else if (step.x === 14 && step.y === 5) {
        expect(turn.kind).toBe('combat');
        if (turn.kind !== 'combat') throw new Error('expected the lighthouse combat');
        expect(turn.text).toBe(LIGHTHOUSE_TEXT);
        expect(turn.pictureId).toBe(40);
        expect(turn.monsters).toEqual([
          { monsterId: 70, count: 5, picBlockId: 70 },
          { monsterId: 69, count: 1, picBlockId: 69 },
        ]);
        expect(memory.get(0x4c0b) ?? 0).toBe(0);
        const after = runner.afterCombat('victory');
        expect(after.kind).toBe('end');
        expect(after.text).toBe(DOUSE_QUESTION);
        expect(runner.isDone()).toBe(true);
        // `SAVE #1 -> [0x4C0B]` at 0x89F2 is unconditional and runs before the name GOSUB.
        expect(memory.get(0x4c0b)).toBe(1);
        // Answering the 0x8A84 CALL with index 0 (YES) falls through IF_EQ into 0x8A8D.
        expect(memory.get(0x4c36)).toBe(1);
        seen.push('lighthouse-combat');
      } else if (step.x === 15 && step.y === 7) {
        expect(turn.kind).toBe('end');
        expect(turn.text).toBe(
          'THE DELICATE TOWER OF A SMALL LIGHTHOUSE RISES TO THE NORTH. ITS POWERFUL LAMP IS'
          + ' VISIBLE, BURNING THROUGH A THIN MANTLE OF WHIRLING FOG.',
        );
        seen.push('tower-text');
      } else if (step.x === 14 && step.y === 6) {
        expect(turn.kind).toBe('end');
        expect(turn.text).toMatch(/^THE PARTY STANDS BEFORE THE LIGHTHOUSE\./);
        seen.push('before-lighthouse');
      } else {
        // Every other step is silent: arms 0x85E4 (descriptor 2) and the descriptor-1 wandering arm,
        // whose 3% RANDOM roll does not trip at this seed (test J).
        expect(turn).toEqual({ kind: 'end', text: '' });
      }
    }
    expect(seen).toEqual(['beach-combat', 'tower-text', 'before-lighthouse', 'lighthouse-combat']);
    // Terminal state after the whole route.
    expect(memory.get(0x4c09)).toBe(1);
    expect(memory.get(0x4c0b)).toBe(1);
    expect(memory.get(0x4c36)).toBe(1);
    // Nothing on this route touched the other two encounters' words.
    expect(memory.get(0x4c08) ?? 0).toBe(0);
    expect(memory.get(0x4c0a) ?? 0).toBe(0);
  });

  it('E. the lighthouse arm emits exactly the retail effect stream, in script order', async () => {
    const raw = await block12();
    const map = decodeGeoBlock(await geoBlock12(), 'Gateway GEO4#12 shipwreck island');
    const floor = map.map.cells[5 * 16 + 14]!.floor ?? 0;
    expect(floor).toBe(0xfc);

    const memory = new Map<number, number>();
    const vm = primeSearchLocation(raw, floor, {
      memory, facing: 'north', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
      onCall: () => ({ comparison: { left: 0, right: 1 } }),
    });
    expect(vm).not.toBeNull();
    const effects: EclEffect[] = [];
    const runner = new DialogueRunner(vm!, (batch) => effects.push(...batch));

    const turn = runner.start();
    expect(turn.kind).toBe('combat');
    if (turn.kind !== 'combat') throw new Error('expected the lighthouse combat');
    expect(turn.setup).toMatchObject({ spriteId: 255, maxDistance: 0, picId: 255 });
    runner.afterCombat('victory');

    // 0x8980 PRINTCLEAR, 0x89D4 PICTURE, 0x89D7 CALL, 0x89DC SETUP_MONSTER, 0x89E3+0x89EA+0x89F1
    // COMBAT, then 0x89F8 PRINTCLEAR(empty), 0x8A01 GOSUB name, 0x8A05 PRINT, 0x8A84 CALL, tail CALL.
    expect(effects.map((e) => e.type)).toEqual([
      'print', 'picture', 'call', 'encounterSetup', 'combat',
      'print', 'print', 'print', 'call', 'call',
    ]);
  });

  it('F. declining the post-combat question still consumes [0x4C0B] but leaves [0x4C36] unwritten', async () => {
    const raw = await block12();
    const map = decodeGeoBlock(await geoBlock12(), 'Gateway GEO4#12 shipwreck island');
    const floor = map.map.cells[5 * 16 + 14]!.floor ?? 0;

    const memory = new Map<number, number>();
    const runner = dialogueForCell(raw, floor, {
      memory, facing: 'north', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
      // Choice index 1 (NO) equals the native handler's own comparison operand, so IF_EQ at 0x8A88
      // passes and 0x8A8D's `SAVE #1 -> [0x4C36]` is skipped.
      onCall: () => ({ comparison: { left: 1, right: 1 } }),
    })!;
    expect(runner.start().kind).toBe('combat');
    const after = runner.afterCombat('victory');
    expect(after.kind).toBe('end');
    expect(after.text).toBe(DOUSE_QUESTION);
    expect(memory.get(0x4c0b)).toBe(1);
    expect(memory.get(0x4c36)).toBeUndefined();
  });

  it('G. revisiting either consumed cell is silent, while a fresh campaign re-fires both', async () => {
    const raw = await block12();
    const map = decodeGeoBlock(await geoBlock12(), 'Gateway GEO4#12 shipwreck island');
    const beach = map.map.cells[10 * 16 + 12]!.floor ?? 0;
    const lighthouse = map.map.cells[5 * 16 + 14]!.floor ?? 0;

    // Legal revisits on a memory that already carries the consumed words: 0x8B6E / 0x8978 EXIT
    // before their PRINTCLEARs.
    const consumed = new Map<number, number>([[0x4c09, 1], [0x4c0b, 1]]);
    for (const floor of [beach, lighthouse]) {
      const revisit = dialogueForCell(raw, floor, {
        memory: consumed, facing: 'north', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
        onCall: () => ({ comparison: { left: 0, right: 1 } }),
      })!;
      expect(revisit.start()).toEqual({ kind: 'end', text: '' });
    }
    expect(consumed.get(0x4c09)).toBe(1);
    expect(consumed.get(0x4c0b)).toBe(1);
    expect(consumed.get(0x4c36)).toBeUndefined();

    // Negative control: the suppression is caused by the retail words, not by runner state.
    for (const [floor, monsters, word] of [
      [beach, [{ monsterId: 69, count: 3, picBlockId: 69 }], 0x4c09],
      [lighthouse, [
        { monsterId: 70, count: 5, picBlockId: 70 },
        { monsterId: 69, count: 1, picBlockId: 69 },
      ], 0x4c0b],
    ] as const) {
      const fresh = new Map<number, number>();
      const again = dialogueForCell(raw, floor, {
        memory: fresh, facing: 'north', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
        onCall: () => ({ comparison: { left: 0, right: 1 } }),
      })!;
      const turn = again.start();
      expect(turn.kind).toBe('combat');
      if (turn.kind !== 'combat') throw new Error('expected the encounter to re-fire on fresh memory');
      expect(turn.monsters).toEqual(monsters);
      expect(fresh.get(word) ?? 0).toBe(0);
      again.afterCombat('victory');
      expect(fresh.get(word)).toBe(1);
    }
  });

  it('H. the consumed word silences a DIFFERENT cell, and (14,6) is facing-gated rather than flag-gated', async () => {
    const raw = await block12();
    const map = decodeGeoBlock(await geoBlock12(), 'Gateway GEO4#12 shipwreck island');
    const tower = map.map.cells[7 * 16 + 15]!.floor ?? 0; // (15,7), descriptor 12 -> arm 0x880F
    const doorstep = map.map.cells[6 * 16 + 14]!.floor ?? 0; // (14,6), descriptor 13 -> arm 0x8882

    const dispatchTower = (consumed: number) => {
      const memory = new Map<number, number>([[0x4c0b, consumed]]);
      return dialogueForCell(raw, tower, {
        memory, facing: 'north', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
      })!.start();
    };
    // 0x880F: `COMPARE #1,[0x4C0B] ; IF_EQ ; EXIT` — the lamp stops being described once the
    // lighthouse encounter has been consumed. (15,7) is four steps back down the route from (14,5).
    expect(dispatchTower(0).text).toMatch(/ITS POWERFUL LAMP IS VISIBLE, BURNING/);
    expect(dispatchTower(1)).toEqual({ kind: 'end', text: '' });

    // 0x8882: `COMPARE [0xC04D],#0 ; IF_NE ; EXIT` — facing, not a flag.
    const dispatchDoorstep = (facing: Dir) =>
      dialogueForCell(raw, doorstep, {
        memory: new Map<number, number>(), facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
      })!.start();
    expect(dispatchDoorstep('north').text).toMatch(/^THE PARTY STANDS BEFORE THE LIGHTHOUSE\./);
    for (const facing of ['east', 'south', 'west'] as Dir[]) {
      expect(dispatchDoorstep(facing)).toEqual({ kind: 'end', text: '' });
    }
  });

  it('I. the &0x3F mask counterfactual silences BOTH encounters — the script\'s AND #127 is load-bearing', async () => {
    const raw = await block12();
    const map = decodeGeoBlock(await geoBlock12(), 'Gateway GEO4#12 shipwreck island');
    for (const [x, y, masked3f] of [[12, 10, 62], [14, 5, 60]] as const) {
      const floor = map.map.cells[y * 16 + x]!.floor ?? 0;
      expect(floor & 0x3f).toBe(masked3f);
      // 15..123 falls through the 0x8335 table (count 15) AND the post-subtract 0x8371 table.
      const runner = dialogueForCell(raw, floor & 0x3f, {
        memory: new Map<number, number>(), facing: 'north', dialect: ECL_GEN1_SHORT_GATEWAY,
        seed: 0x1234, onCall: () => ({ comparison: { left: 0, right: 1 } }),
      })!;
      expect(runner.start()).toEqual({ kind: 'end', text: '' });
    }
  });

  it('J. discloses that open terrain carries a live 3% wandering roll, silent only by RNG outcome', async () => {
    const raw = await block12();
    // Arm 1 @0x8532: `COMPARE [0x4C0C],#5 ; IF_GE ; EXIT ; RANDOM #100 -> [0x7F7F] ;
    // COMPARE [0x7F7F],#3 ; IF_GE ; EXIT`. Descriptor 1 is fourteen of this route's twenty walked
    // cells (spawn + nineteen steps) -- see the toBe(14) assertion below; earlier drafts of this
    // comment said "thirteen", which was wrong.
    const roll = (seed: number) => {
      const memory = new Map<number, number>();
      const turn = dialogueForCell(raw, 1, {
        memory, facing: 'north', dialect: ECL_GEN1_SHORT_GATEWAY, seed,
        onCall: () => ({ comparison: { left: 0, right: 1 } }),
      })!.start();
      return { turn, memory };
    };

    // The seed the walk (test D) uses: the roll comes up >= 3, so the step is silent.
    const quiet = roll(0x1234);
    expect(quiet.turn).toEqual({ kind: 'end', text: '' });
    expect(quiet.memory.get(0x7f7f)).toBeGreaterThanOrEqual(3);

    // The arm IS live. Seed 2003 rolls 1 and trips it — retail text, and the wandering-fight marker
    // `SAVE #1 -> [0x4C17]` at 0x8549. This assertion is deliberately coupled to the engine's PRNG:
    // it is the disclosure that test D's silence is an RNG outcome, not a structural guarantee.
    const loud = roll(2003);
    expect(loud.memory.get(0x7f7f)).toBeLessThan(3);
    expect(loud.turn.kind).not.toBe('end');
    expect(loud.turn.text).toBe('SCRAG ATTACK!');
    expect(loud.memory.get(0x4c17)).toBe(1);
  });
});
