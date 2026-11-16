/**
 * Golden: Gateway to the Savage Frontier's EARLY natural-combat route — Yartar, ECL2.DAX#1,
 * SearchLocation ON_GOTO arm 39 (the thug rescue that introduces KREVISH).
 *
 * Full byte evidence, every rejected candidate, and the corpus-wide guard-word census live in
 * `docs/engine/research/gateway-ecl2-1-yartar-early-route.md`. Everything asserted here was read
 * from the retail files or produced by running the real `EclVm`; nothing is hand-traced.
 *
 * Shape of the proof:
 *   A. Cold `initial_entry` (vaddr 0x8014 = byte offset 22) is the block's real boot leg — not a
 *      GOTO trampoline — and byte-grounds the spawn: `SAVE #1 -> [0xC04B]`, `SAVE #10 -> [0xC04C]`,
 *      `SAVE #0 -> [0xC04D]` at vaddrs 0x807A/0x8080/0x8086, plus `SAVE #1 -> [0x4BE6]`
 *      (inDungeon) and `LOAD_FILES #1,#2,#255` (GEO block id 1 = GEO2.DAX#1).
 *   B. The dispatch descriptor is located FROM the GEO bytes: the four `(floor & 0x7F) === 39`
 *      cells, using the script's own `AND #127` mask at vaddr 0x82AD.
 *   C. The nine-step legal walk from the spawn to the nearest of those cells
 *      (`tools/find_geo_path.py`: west,north,east,north,east,south,south,south,south — two
 *      automatic doors, zero bash/pick/knock edges), with every intermediate cell executed through
 *      the real VM.
 *   D-G. The encounter, its consumed word `[0x4C20]`, the silent legal revisit, a fresh-memory
 *      negative control, and the DECLINE control that leaves the encounter re-offerable.
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
const eclPath = resolve(gateway, 'ECL2.DAX');
const geoPath = resolve(gateway, 'GEO2.DAX');
const monPath = resolve(gateway, 'MON2CHA.DAX');
const haveRetail = existsSync(eclPath) && existsSync(geoPath);

async function block1(): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(eclPath)));
  return blocks.find((b) => b.blockId === 1)!.raw;
}

async function geoBlock1(): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(geoPath)));
  return blocks.find((b) => b.blockId === 1)!.raw;
}

function printedText(effects: readonly EclEffect[]): string {
  return effects
    .filter((e): e is Extract<EclEffect, { type: 'print' }> => e.type === 'print')
    .map((e) => e.text ?? '')
    .join(' ');
}

/**
 * The nine legal directed steps from the block's own byte-grounded spawn `(1,10,north)` to the
 * nearest descriptor-39 cell `(2,12)`, with the facing the party carries INTO each cell.
 * `tools/find_geo_path.py --geo GEO2.DAX --block 1 --start 1,10 --target 2,12 --facing north`.
 */
const ROUTE: ReadonlyArray<{ x: number; y: number; facing: 'north' | 'east' | 'south' | 'west' }> = [
  { x: 0, y: 10, facing: 'west' },
  { x: 0, y: 9, facing: 'north' },
  { x: 1, y: 9, facing: 'east' },
  { x: 1, y: 8, facing: 'north' },
  { x: 2, y: 8, facing: 'east' },
  { x: 2, y: 9, facing: 'south' },
  { x: 2, y: 10, facing: 'south' },
  { x: 2, y: 11, facing: 'south' },
  { x: 2, y: 12, facing: 'south' },
];

/**
 * Boot the block for real, then hand back the memory the walk continues from.
 *
 * The walk does NOT start from a hand-written state: it starts from whatever the retail
 * `initial_entry` leaves behind (spawn registers, `[0x4BE6]`, the step counter `[0x4C00]`), with
 * exactly ONE documented host-model correction applied on top.
 *
 * That correction is `[0x4C01]`/`[0x4C02]`, the previous/current masked cell descriptors.
 * `initial_entry`'s own tail computes them — `AND #127,[0xC04F],[0x4C02]` at 0x8284 then
 * `SAVE [0x4C02] -> [0x4C01]` at 0x828D — but it reads them out of `[0xC04F]`, which the *host*
 * populates with the cell the party is standing on. A headless boot has no host, so `[0xC04F]` is
 * 0 there and both words land at 0 instead of the spawn cell's own masked descriptor 3. Seeding 3
 * is therefore modelling the host, not overriding the script.
 *
 * Read test H honestly: it shows this UNPROVEN MODELLING ASSUMPTION changes an asserted outcome.
 * That is a disclosure, not a strength. The assumption is confined to exactly one assertion —
 * whether step 1 at (0,10) is silent or opens the Inn's rest prompt. An adversarial re-derivation
 * (2026-08-05) ran the same walk with NOTHING seeded and reached the identical combat, the
 * identical roster and the identical `[0x4C20]` 4->1 transition, so the load-bearing early-leg
 * claim — natural combat plus consumed state — does NOT depend on the seed. What is still
 * inference is that the retail host really holds 0x83 in `[0xC04F]` at that moment; that follows
 * from the engine's documented `[0xC04F]` contract, not from a live read.
 */
async function bootedWalkMemory(): Promise<Map<number, number>> {
  const memory = new Map<number, number>();
  const vm = new EclVm(await block1(), {
    memory, dialect: ECL_GEN1_SHORT_GATEWAY, entry: 22, seed: 0x1234,
  });
  expect(vm.run().status).toBe('exited');
  expect(memory.get(0x4c01)).toBe(0);
  expect(memory.get(0x4c02)).toBe(0);
  memory.set(0x4c01, 3);
  memory.set(0x4c02, 3);
  return memory;
}

describe.skipIf(!haveRetail)('Gateway ECL2#1 Yartar — early natural-combat route (arm 39)', () => {
  it('A. cold initial_entry is the real boot leg and byte-grounds the spawn at (1,10,north)', async () => {
    const raw = await block1();
    expect(raw.length).toBe(7578);

    const header = parseEclHeader(raw, ECL_GEN1_SHORT_GATEWAY);
    expect(header.magic).toBe(0x1388);
    expect(header.searchLocation).toBe(0x82a6);
    expect(header.eclInitialEntry).toBe(0x8014);
    // 0x8014 - 0x7FFE = 22 = the instruction immediately after the 22-byte header, i.e. this is
    // real code, not a trampoline into somewhere else.
    expect(header.eclInitialEntry - ECL_GEN1_SHORT_GATEWAY.vbase).toBe(22);

    const memory = new Map<number, number>();
    const vm = new EclVm(raw, { memory, dialect: ECL_GEN1_SHORT_GATEWAY, entry: 22, seed: 0x1234 });
    const r = vm.run();
    expect(r.status).toBe('exited');

    // Spawn, byte-grounded in this block's own SAVEs (0x807A/0x8080/0x8086).
    expect(memory.get(0xc04b)).toBe(1);
    expect(memory.get(0xc04c)).toBe(10);
    expect(memory.get(0xc04d)).toBe(0);
    // 0x8030 SAVE #1 -> [0x4BE6]: Yartar is inDungeon=1 (the local/tactical map mode), not overland.
    expect(memory.get(0x4be6)).toBe(1);
    expect(memory.get(0x4bfe)).toBe(2);
    expect(memory.get(0x4bc9)).toBe(7);
    // [0x4BF2] is untouched on a cold campaign (its only two writers corpus-wide are ECL5#99/#98),
    // so all four incoming-area guards at 0x8044..0x806C fall through to the 0x807A spawn.
    expect(memory.get(0x4bf2) ?? 0).toBe(0);

    const loadFiles = r.effects.find((e) => e.type === 'loadFiles');
    expect(loadFiles).toMatchObject({ geoBlockId: 1, operands: [1, 2, 255] });
    const loadPieces = r.effects.find((e) => e.type === 'loadPieces');
    expect(loadPieces).toMatchObject({ setBlockIds: [36, 31, 15] });

    const text = printedText(r.effects);
    expect(text).toMatch(/IT IS A NIGHT OF CELEBRATION!/);
    expect(text).toMatch(/PROTECTED THE CARAVAN FROM CITADEL ADBAR ALL THE WAY TO YARTAR!/);
    expect(text).toMatch(/A TOWN FAMOUS FOR THE DEXTERITY OF ITS THIEVES/);
    expect(text).toMatch(/JOURNAL ENTRY #5/);
  });

  it('B. locates the descriptor-39 dispatch cells from the real GEO bytes with the script\'s own &0x7F mask', async () => {
    const map = decodeGeoBlock(await geoBlock1(), 'Gateway GEO2#1 Yartar');
    const matching = map.map.cells
      .map((cell, index) => ({ cell, x: index % 16, y: Math.floor(index / 16) }))
      .filter(({ cell }) => ((cell.floor ?? 0) & 0x7f) === 39);
    expect(matching.map(({ x, y, cell }) => [x, y, cell.floor])).toEqual([
      [4, 0, 0x27],
      [11, 2, 0x27],
      [2, 12, 0x27],
      [11, 12, 0x27],
    ]);

    // The spawn and every cell on the walked route, straight from the GEO plane.
    const floorAt = (x: number, y: number) => map.map.cells[y * 16 + x]!.floor ?? 0;
    expect(floorAt(1, 10)).toBe(0x83); // spawn, masked 3
    expect([floorAt(0, 10), floorAt(0, 9), floorAt(1, 9)]).toEqual([0x83, 0x83, 0x83]);
    expect(floorAt(1, 8)).toBe(0x02); // the Inn of the Glowing Gem sign
    expect([floorAt(2, 8), floorAt(2, 9), floorAt(2, 10), floorAt(2, 11)]).toEqual([0, 0, 0, 0]);
  });

  it.skipIf(!existsSync(monPath))('B2. resolves the roster ids against the real MON2CHA.DAX names', async () => {
    const records = decodeMonsterArchive(new Uint8Array(await readFile(monPath)), 'gateway-to-the-savage-frontier');
    const byId = new Map(records.map((r) => [r.blockId, r.name]));
    // LOAD_MONSTER #1,#5,#1 at vaddr 0x943C — five of monster id 1.
    expect(byId.get(1)).toBe('BANDIT');
    // ADD_NPC #60,#99 at vaddr 0x942F — the rescued man who joins the party.
    expect(byId.get(60)).toBe('KREVISH');
  });

  it('C-D. walks the nine legal steps into the thug encounter and consumes [0x4C20] on victory', async () => {
    const raw = await block1();
    const map = decodeGeoBlock(await geoBlock1(), 'Gateway GEO2#1 Yartar');
    const floorAt = (x: number, y: number) => map.map.cells[y * 16 + x]!.floor ?? 0;
    const memory = await bootedWalkMemory();
    // The state the walk actually inherits from the retail boot, not from this test.
    expect(memory.get(0xc04b)).toBe(1);
    expect(memory.get(0xc04c)).toBe(10);
    expect(memory.get(0xc04d)).toBe(0);
    expect(memory.get(0x4c00)).toBe(1);
    expect(memory.get(0x4c20) ?? 0).toBe(0);

    // Steps 1-3: three identical descriptor-3 cells. Arm 3 @0x892A opens with
    // `COMPARE [0x4C02],[0x4C01] ; IF_EQ ; EXIT`, so a step that does not change the masked
    // descriptor is silent.
    for (const step of ROUTE.slice(0, 3)) {
      const runner = dialogueForCell(raw, floorAt(step.x, step.y), {
        memory, facing: step.facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
      })!;
      expect(runner).not.toBeNull();
      expect(runner.start()).toEqual({ kind: 'end', text: '' });
    }

    // Step 4: the Inn sign at (1,8) — pure retail narration, writes no state.
    const signStep = ROUTE[3]!;
    const signRunner = dialogueForCell(raw, floorAt(signStep.x, signStep.y), {
      memory, facing: signStep.facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
    })!;
    const sign = signRunner.start();
    expect(sign.kind).toBe('end');
    expect(sign.text).toBe(
      "A SIGN HANGING ABOVE THE DOOR HERE READS: 'THE INN OF THE GLOWING GEM'",
    );

    // Steps 5-8: four descriptor-0 open-street cells. Arm 0 @0x8404 is a pure step counter on a
    // cold campaign — `COMPARE [0x4C00],#5 ; IF_GT GOTO 0x8429 ; ADD [0x4C00],#1 -> [0x4C00]` —
    // and its wandering-monster tail at 0x8429 is gated by `COMPARE [0x4C21],#0 ; IF_EQ EXIT` at
    // 0x845E, with [0x4C21]'s only writer corpus-wide being ECL3#5 @0x9026 (post-Amanitas).
    for (const step of ROUTE.slice(4, 8)) {
      const runner = dialogueForCell(raw, floorAt(step.x, step.y), {
        memory, facing: step.facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
      })!;
      expect(runner.start()).toEqual({ kind: 'end', text: '' });
    }
    // 1 (from the boot) + one increment per open-street cell.
    expect(memory.get(0x4c00)).toBe(5);
    expect(memory.get(0x4c20) ?? 0).toBe(0);

    // Step 9: (2,12), raw 0x27, masked 39 -> ON_GOTO arm 39 @0x9378.
    const target = ROUTE[8]!;
    expect(floorAt(target.x, target.y)).toBe(0x27);
    const vm = primeSearchLocation(raw, floorAt(target.x, target.y), {
      memory,
      facing: target.facing,
      dialect: ECL_GEN1_SHORT_GATEWAY,
      seed: 0x1234,
      // CALL [0x080C] at 0x93FB is the retail yes/no host handler; the native code compares the
      // choice index against 1, so index 0 (YES) leaves left=0,right=1 -> IF_NE at 0x93FF takes
      // its GOTO 0x942F into the fight.
      onCall: () => ({ comparison: { left: 0, right: 1 } }),
    });
    expect(vm).not.toBeNull();
    const effects: EclEffect[] = [];
    const runner = new DialogueRunner(vm!, (batch) => effects.push(...batch));

    const turn = runner.start();
    expect(turn.kind).toBe('combat');
    if (turn.kind !== 'combat') throw new Error('expected the Yartar thug combat');
    expect(turn.text).toBe(
      'SEVERAL THUGS HAVE CORNERED A SMALL, TERRIFIED MAN IN AN ALCOVE OF THIS NARROW STREET. DO YOU WANT TO HELP HIM?',
    );
    expect(turn.pictureId).toBe(4);
    // LOAD_MONSTER #1,#5,#1 at 0x943C -> MON2CHA.DAX#1 = "BANDIT", five of them.
    expect(turn.monsters).toEqual([{ monsterId: 1, count: 5, picBlockId: 1 }]);
    expect(turn.setup).toMatchObject({ spriteId: 255, maxDistance: 1, picId: 255 });
    // `SAVE #4 -> [0x4C20]` at 0x939B runs BEFORE the prompt: the offer itself is recorded.
    expect(memory.get(0x4c20)).toBe(4);

    // The exact retail effect stream this arm emits, in script order (0x93A1 PICTURE, 0x93A4
    // PRINTCLEAR, 0x93FB CALL, 0x942F ADD_NPC, 0x9435 SETUP_MONSTER, 0x943C+0x9443 COMBAT).
    expect(effects.map((e) => e.type)).toEqual([
      'picture', 'print', 'call', 'addNpc', 'encounterSetup', 'combat',
    ]);
    // `ADD_NPC #60,#99` at 0x942F joins MON2CHA.DAX#60 = "KREVISH" — the man the thugs cornered,
    // named by this same block's own post-combat text and by its 0x9D2F string compare.
    expect(effects.find((e) => e.type === 'addNpc')).toMatchObject({ npcId: 60 });

    const after = runner.afterCombat('victory');
    expect(after.kind).toBe('end');
    expect(runner.isDone()).toBe(true);
    // `SAVE #1 -> [0x4C20]` at 0x9444 is unconditional and runs before the GOSUB 0x9D1E party
    // scan for "KREVISH", so the consumed word lands with or without a live party.
    expect(memory.get(0x4c20)).toBe(1);
  });

  it('E-F. revisiting the consumed cell is silent, while a fresh campaign re-fires it', async () => {
    const raw = await block1();
    const map = decodeGeoBlock(await geoBlock1(), 'Gateway GEO2#1 Yartar');
    const floor = map.map.cells[12 * 16 + 2]!.floor ?? 0;

    // Legal revisit on the SAME memory: 0x9388's ==0 fails, 0x9393's ==4 fails, 0x939A EXITs.
    const consumed = new Map<number, number>([...(await bootedWalkMemory()), [0x4c20, 1], [0x4c01, 0], [0x4c02, 0]]);
    const revisit = dialogueForCell(raw, floor, {
      memory: consumed, facing: 'south', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
      onCall: () => ({ comparison: { left: 0, right: 1 } }),
    })!;
    expect(revisit.start()).toEqual({ kind: 'end', text: '' });
    expect(consumed.get(0x4c20)).toBe(1);

    // Negative control: the suppression is caused by the retail word, not by runner state.
    const fresh = new Map<number, number>();
    const again = dialogueForCell(raw, floor, {
      memory: fresh, facing: 'south', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
      onCall: () => ({ comparison: { left: 0, right: 1 } }),
    })!;
    const turn = again.start();
    expect(turn.kind).toBe('combat');
    if (turn.kind !== 'combat') throw new Error('expected the encounter to re-fire on fresh memory');
    expect(turn.text).toMatch(/SEVERAL THUGS HAVE CORNERED A SMALL, TERRIFIED MAN/);
    expect(turn.monsters).toEqual([{ monsterId: 1, count: 5, picBlockId: 1 }]);
    expect(fresh.get(0x4c20)).toBe(4);
  });

  it('G. declining leaves [0x4C20]=4 so the encounter is re-offered, and a later YES still fights', async () => {
    const raw = await block1();
    const map = decodeGeoBlock(await geoBlock1(), 'Gateway GEO2#1 Yartar');
    const floor = map.map.cells[12 * 16 + 2]!.floor ?? 0;

    const memory = await bootedWalkMemory();
    const decline = dialogueForCell(raw, floor, {
      memory, facing: 'south', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
      // Choice index 1 (NO) equals the native handler's own comparison operand, so IF_NE fails and
      // control falls through to the decline narration at 0x9404.
      onCall: () => ({ comparison: { left: 1, right: 1 } }),
    })!;
    const declined = decline.start();
    expect(declined.kind).toBe('end');
    // The host CALL is answered synchronously here, so the prompt and the decline reply arrive in
    // one effect batch and `collectText` joins them — both retail strings, in script order.
    expect(declined.text).toBe(
      'SEVERAL THUGS HAVE CORNERED A SMALL, TERRIFIED MAN IN AN ALCOVE OF THIS NARROW STREET.'
      + ' DO YOU WANT TO HELP HIM? THE LITTLE MAN CONTINUES TO DODGE HIS ATTACKERS.',
    );
    expect(memory.get(0x4c20)).toBe(4);

    // The re-offer path: [0x4C20]==4 fails 0x9388's ==0 test but PASSES 0x9393's ==4 test, so
    // 0x939A's EXIT is skipped and the prompt is presented again.
    const retry = dialogueForCell(raw, floor, {
      memory, facing: 'south', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
      onCall: () => ({ comparison: { left: 0, right: 1 } }),
    })!;
    const fight = retry.start();
    expect(fight.kind).toBe('combat');
    if (fight.kind !== 'combat') throw new Error('expected the re-offered encounter to reach combat');
    expect(fight.monsters).toEqual([{ monsterId: 1, count: 5, picBlockId: 1 }]);
    expect(retry.afterCombat('victory').kind).toBe('end');
    expect(memory.get(0x4c20)).toBe(1);
  });

  it('I. the consumed word changes a DIFFERENT, distant cell: Krevish\'s house at (13,13) is silent until it is set', async () => {
    const raw = await block1();
    const map = decodeGeoBlock(await geoBlock1(), 'Gateway GEO2#1 Yartar');
    const house = map.map.cells[13 * 16 + 13]!.floor ?? 0;
    expect(house).toBe(0xa8);
    expect(house & 0x7f).toBe(40); // ON_GOTO arm 40 @0x98EB
    // (2,12) -> (13,13) is 20 legal directed steps over the real wall/door graph, one automatic
    // door, no bash/pick/knock edge (tools/find_geo_path.py --start 2,12 --target 13,13).

    const dispatch = (consumed: number) => {
      const memory = new Map<number, number>([[0x4c20, consumed]]);
      return dialogueForCell(raw, house, {
        memory, facing: 'south', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
        onCall: () => ({ comparison: { left: 0, right: 1 } }),
      })!.start();
    };

    // Before the rescue (and on the offered-but-unresolved value 4) the house is silent: arm 40's
    // own `COMPARE [0x4C20],#2` @0x98EB and `COMPARE [0x4C20],#1` @0x98F6 both fail.
    expect(dispatch(0)).toEqual({ kind: 'end', text: '' });
    expect(dispatch(4)).toEqual({ kind: 'end', text: '' });
    // After the victory this golden proves ([0x4C20] = 1) the same cell has content.
    expect(dispatch(1).text).toMatch(
      /KREVISH GREETS YOU AT THE DOOR\. 'YOU CAME TO SEE ME!' HE PROCLAIMS WITH DELIGHT\./,
    );
  });

  it('H. discloses the host-model seed\'s blast radius: it flips only step 1 (Inn rest prompt), not the encounter', async () => {
    const raw = await block1();
    const map = decodeGeoBlock(await geoBlock1(), 'Gateway GEO2#1 Yartar');
    const floor = map.map.cells[10 * 16 + 0]!.floor ?? 0;
    expect(floor).toBe(0x83);

    const unseeded = new Map<number, number>();
    const runner = dialogueForCell(raw, floor, {
      memory: unseeded, facing: 'west', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234,
    })!;
    const turn = runner.start();
    expect(turn.text).toMatch(/WOULD YOU LIKE TO REST FOR 1 PLATINUM/);
  });
});
