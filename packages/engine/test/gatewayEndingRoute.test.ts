/**
 * Golden: Gateway to the Savage Frontier's ENDING / late-area natural-combat route — **Ascore**,
 * `ECL6.DAX#20`, the three tapestry-mirror walls (SearchLocation descriptors 123 / 124 / 125).
 *
 * Full byte evidence, the corpus-wide persistence-word census, the "later" argument and every
 * rejected candidate live in `docs/engine/research/gateway-ending-route.md`. Everything asserted
 * here was read from the retail files or produced by running the real `EclVm`; nothing is
 * hand-traced.
 *
 * Shape of the proof:
 *   A. Cold `initial_entry` (vaddr 0x8014 = byte offset 22) is the block's real boot leg — not a
 *      GOTO trampoline — and byte-grounds the spawn: `SAVE #7 -> [0xC04C]`, `SAVE #0 -> [0xC04B]`,
 *      `SAVE #1 -> [0xC04D]` at vaddrs 0x805A/0x8060/0x8066, plus `SAVE #1 -> [0x4BE6]` (local map)
 *      and `LOAD_FILES #20,#2,#255` (GEO block id 20 = GEO6.DAX#20).
 *   B. The three dispatch descriptors are located FROM the GEO bytes with the script's own
 *      `AND #127` mask at vaddr 0x80A1.
 *   C. The 27-step legal walk from the spawn to the nearest mirror cell (5,9), every cell driven
 *      through the real VM in the retail per-step order (vmRun1 first, then SearchLocation).
 *   D. The three-stage gauntlet: each stage sets its own bit in `[0x4C46]` and advances `[0x4C45]`
 *      1 -> 2 -> 3, with three DIFFERENT fixed ASCORIAN MUMMY / ASCORE SKELETON rosters.
 *   E. The terminal flag `[0x4C45] = 4` is written by `vmRun1`'s `GOSUB 0x9AD2` and ONLY after the
 *      third stage — proven still clear after stages 1 and 2.
 *   F-H. Silent legal revisits (per descriptor, not per cell), the same-word-different-bit
 *      independence of the three `[0x4C46]` bits, and a fresh-memory negative control.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dialogueForCell,
  dialogueForVmRun1,
  decodeGeoBlock,
  decodeMonsterArchive,
  readDaxDataBlocks,
  parseEclHeader,
  ECL_GEN1_SHORT_GATEWAY,
  EclVm,
  type EclEffect,
} from '../src/index.js';

const gateway = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const eclPath = resolve(gateway, 'ECL6.DAX');
const geoPath = resolve(gateway, 'GEO6.DAX');
const monPath = resolve(gateway, 'MON6CHA.DAX');
const haveRetail = existsSync(eclPath) && existsSync(geoPath);

/**
 * The engine's ECL PRNG is a plain LCG seeded per VM instance, so every `dialogueForCell` call in a
 * walk restarts the same sequence. That is a harness property, not retail behaviour, and it is why
 * this file pins one seed and says so: with 0x1234 the first `RANDOM #100` is 31, which is >= 5, so
 * the 5%-chance wandering-undead roll that guards descriptors 1 and 3 (`COMPARE [0x7F7F],#5 ;
 * IF_GE EXIT` at vaddr 0x82EA / 0x83BB) never fires on the approach. None of the load-bearing
 * mirror-gauntlet claims depend on it — those arms contain no RANDOM at all.
 */
const SEED = 0x1234;

async function block20(): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(eclPath)));
  return blocks.find((b) => b.blockId === 20)!.raw;
}

async function geoBlock20(): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(geoPath)));
  return blocks.find((b) => b.blockId === 20)!.raw;
}

type Facing = 'north' | 'east' | 'south' | 'west';
interface Step { x: number; y: number; facing: Facing }

/**
 * The 27 legal directed steps from this block's OWN byte-grounded cold spawn `(0,7,east)` to the
 * nearest tapestry-mirror cell `(5,9)`, produced by
 * `tools/find_geo_path.py --geo GEO6.DAX --block 20 --start 0,7 --target 5,9 --facing east
 *  --event-mask 127 --avoid-event-index 27`
 * — `step_count 27`, `final_facing west`, `required_interactions []`: no bash/pick/knock edge
 * anywhere on it. The last two edges are door flag 1 (automatic).
 */
const APPROACH: readonly Step[] = [
  { x: 1, y: 7, facing: 'east' },
  { x: 1, y: 8, facing: 'south' },
  { x: 2, y: 8, facing: 'east' },
  { x: 2, y: 9, facing: 'south' },
  { x: 2, y: 10, facing: 'south' },
  { x: 1, y: 10, facing: 'west' },
  { x: 0, y: 10, facing: 'west' },
  { x: 0, y: 11, facing: 'south' },
  { x: 0, y: 12, facing: 'south' },
  { x: 0, y: 13, facing: 'south' },
  { x: 0, y: 14, facing: 'south' },
  { x: 1, y: 14, facing: 'east' },
  { x: 2, y: 14, facing: 'east' },
  { x: 2, y: 13, facing: 'north' },
  { x: 2, y: 12, facing: 'north' },
  { x: 3, y: 12, facing: 'east' },
  { x: 3, y: 13, facing: 'south' },
  { x: 4, y: 13, facing: 'east' },
  { x: 5, y: 13, facing: 'east' },
  { x: 6, y: 13, facing: 'east' },
  { x: 7, y: 13, facing: 'east' },
  { x: 7, y: 12, facing: 'north' },
  { x: 7, y: 11, facing: 'north' },
  { x: 7, y: 10, facing: 'north' }, // descriptor 127 — the forced secret-door undead checkpoint
  { x: 7, y: 9, facing: 'north' },
  { x: 6, y: 9, facing: 'west' },
  { x: 5, y: 9, facing: 'west' }, // descriptor 123 — MIRROR 1 (stage 1)
];

/**
 * The gauntlet's remaining legal steps, each verified with `tools/find_geo_path.py`
 * (`5,9 -> 5,6` = 3 steps north; `5,6 -> 6,7` = south then east; both
 * `required_interactions []`), plus one more step so the vmRun1 payoff has a step to fire on.
 */
const GAUNTLET: readonly Step[] = [
  { x: 5, y: 8, facing: 'north' },
  { x: 5, y: 7, facing: 'north' },
  { x: 5, y: 6, facing: 'north' }, // descriptor 124 — MIRROR 2 (stage 2)
  { x: 5, y: 7, facing: 'south' },
  { x: 6, y: 7, facing: 'east' },  // descriptor 125 — MIRROR 3 (stage 3)
  { x: 6, y: 8, facing: 'south' }, // the step the vmRun1 terminal payoff lands on
];

function printedText(effects: readonly EclEffect[]): string {
  return effects
    .filter((e): e is Extract<EclEffect, { type: 'print' }> => e.type === 'print')
    .map((e) => e.text ?? '')
    .join(' ');
}

/** Boot the block for real and hand back the memory the walk continues from. No hand-written state. */
async function bootedWalkMemory(): Promise<Map<number, number>> {
  const memory = new Map<number, number>();
  const vm = new EclVm(await block20(), {
    memory, dialect: ECL_GEN1_SHORT_GATEWAY, entry: 22, seed: SEED,
  });
  expect(vm.run().status).toBe('exited');
  return memory;
}

interface StepResult { kind: string; text: string; monsters?: unknown }

/**
 * One retail walk step against the real block, in the retail order the engine documents: `vmRun1`
 * (the per-step main loop) first, then `SearchLocation` for the cell just entered. Both are driven
 * to completion; combats are resolved with a victory.
 */
function walkStep(
  raw: Uint8Array,
  floor: number,
  step: Step,
  memory: Map<number, number>,
): { run1: StepResult; cell: StepResult } {
  const drive = (runner: ReturnType<typeof dialogueForCell>): StepResult => {
    // The narration of a menu-gated encounter arrives on the `say` turn that carries the menu, so
    // the text of every turn in the step is accumulated rather than only the last one's.
    let turn = runner!.start();
    const texts: string[] = [turn.text];
    if (turn.kind === 'say' && turn.choices.length > 0) {
      turn = runner!.choose(0);
      texts.push(turn.text);
    }
    const text = texts.filter((t) => t !== '').join(' ');
    if (turn.kind === 'combat') {
      const monsters = turn.monsters;
      runner!.afterCombat('victory');
      return { kind: 'combat', text, monsters };
    }
    return { kind: turn.kind, text };
  };
  const run1 = drive(dialogueForVmRun1(raw, {
    memory, facing: step.facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
    seedMemory: { 0xc04f: floor },
  }));
  const cell = drive(dialogueForCell(raw, floor, {
    memory, facing: step.facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
  }));
  return { run1, cell };
}

describe.skipIf(!haveRetail)('Gateway ECL6#20 Ascore — ending/late-area mirror gauntlet', () => {
  it('A. cold initial_entry is the real boot leg and byte-grounds the spawn at (0,7,east)', async () => {
    const raw = await block20();
    expect(raw.length).toBe(7644);

    const header = parseEclHeader(raw, ECL_GEN1_SHORT_GATEWAY);
    expect(header.magic).toBe(0x1388);
    expect(header.vmRun1).toBe(0x8161);
    expect(header.searchLocation).toBe(0x809a);
    expect(header.eclInitialEntry).toBe(0x8014);
    // 0x8014 - 0x7FFE = 22 = the instruction right after the 22-byte header: real code, not a
    // GOTO trampoline into somewhere else.
    expect(header.eclInitialEntry - ECL_GEN1_SHORT_GATEWAY.vbase).toBe(22);

    const memory = new Map<number, number>();
    const vm = new EclVm(raw, { memory, dialect: ECL_GEN1_SHORT_GATEWAY, entry: 22, seed: SEED });
    const r = vm.run();
    expect(r.status).toBe('exited');

    // [0x4BF2] (LastEclBlockId) is untouched on a cold campaign — its only two ECL writers
    // corpus-wide are ECL5#99 @0x8014 (`SAVE #0`) and ECL5#98 @0x801C (`SAVE #1`), the developer
    // JUMPER debug block and its companion. So `COMPARE [0x4BF2],#20` (0x8044) and
    // `COMPARE [0x4BF2],#27` (0x804F) both fail and control reaches the 0x805A cold spawn.
    expect(memory.get(0x4bf2) ?? 0).toBe(0);
    expect(memory.get(0xc04c)).toBe(7); // Y, SAVE #7 @0x805A
    expect(memory.get(0xc04b)).toBe(0); // X, SAVE #0 @0x8060
    expect(memory.get(0xc04d)).toBe(1); // facing ordinal 1 = east, SAVE #1 @0x8066
    // 0x8030 `SAVE #1 -> [0x4BE6]`: Ascore is a local/tactical map, not overland.
    expect(memory.get(0x4be6)).toBe(1);
    expect(memory.get(0x7ec6)).toBe(99);
    expect(memory.get(0x4bfe)).toBe(13);
    expect(memory.get(0x4bfb)).toBe(0);
    expect(memory.get(0x4c00)).toBe(0);
    // GOSUB 0x81FA @0x802C with a cold [0x4BC9]=0: `COMPARE [0x4BC9],#6 ; IF_LT ; SAVE #8`.
    expect(memory.get(0x4bfd)).toBe(8);

    const loadFiles = r.effects.find((e) => e.type === 'loadFiles');
    expect(loadFiles).toMatchObject({ geoBlockId: 20, operands: [20, 2, 255] });
    const loadPieces = r.effects.find((e) => e.type === 'loadPieces');
    expect(loadPieces).toMatchObject({ setBlockIds: [5, 30, 30] });
    // The boot itself is silent — this area opens with no narration at all.
    expect(printedText(r.effects)).toBe('');

    // None of the mirror-sequence state is touched by the boot.
    expect(memory.get(0x4c45) ?? 0).toBe(0);
    expect(memory.get(0x4c46) ?? 0).toBe(0);
  });

  it("B. locates the three tapestry-mirror descriptors from the real GEO bytes with the script's own &0x7F mask", async () => {
    const map = decodeGeoBlock(await geoBlock20(), 'Gateway GEO6#20 Ascore');
    const at = (x: number, y: number) => map.map.cells[y * 16 + x]!.floor ?? 0;
    const cellsWith = (index: number) =>
      map.map.cells
        .map((cell, i) => ({ x: i % 16, y: Math.floor(i / 16), floor: cell.floor ?? 0 }))
        .filter((c) => (c.floor & 0x7f) === index)
        .map((c) => [c.x, c.y, c.floor]);

    // South wall, north wall and east wall of one sealed chamber — two cells each.
    expect(cellsWith(123)).toEqual([[4, 9, 0xfb], [5, 9, 0xfb]]);
    expect(cellsWith(124)).toEqual([[4, 6, 0xfc], [5, 6, 0xfc]]);
    expect(cellsWith(125)).toEqual([[6, 7, 0xfd], [6, 8, 0xfd]]);
    // The forced checkpoint on the approach, and the cold spawn cell.
    expect(cellsWith(127)).toEqual([[7, 10, 0x7f]]);
    expect(at(0, 7)).toBe(0x01);
    // Chamber interior: descriptor 4 = first-table ON_GOTO arm 4 @0x84A4, a bare EXIT.
    expect([at(5, 8), at(5, 7), at(3, 7), at(4, 8)]).toEqual([0x84, 0x84, 0x84, 0x84]);
    // Descriptor 107 is the arm that runs `NEWECL #27` — Ascore's own doorway into the endgame
    // gauntlet block, and the reason this area is the campaign's LAST explorable map.
    expect(cellsWith(107)).toEqual([[12, 15, 0xeb]]);
  });

  it.skipIf(!existsSync(monPath))('B2. resolves the mirror rosters against the real MON6CHA.DAX names', async () => {
    const records = decodeMonsterArchive(new Uint8Array(await readFile(monPath)), 'gateway-to-the-savage-frontier');
    const byId = new Map(records.map((r) => [r.blockId, r.name]));
    // `LOAD_MONSTER #90,...` / `LOAD_MONSTER #91,...` in all three mirror arms.
    expect(byId.get(90)).toBe('ASCORE SKELETON');
    expect(byId.get(91)).toBe('ASCORIAN MUMMY');
    // Not part of this route: the endgame antagonist waiting behind descriptor 107's NEWECL #27.
    expect(byId.get(92)).toBe('VAALGAMON');
  });

  it('C. walks the 27 legal steps from the byte-grounded spawn and fights the one forced checkpoint', async () => {
    const raw = await block20();
    const map = decodeGeoBlock(await geoBlock20(), 'Gateway GEO6#20 Ascore');
    const at = (x: number, y: number) => map.map.cells[y * 16 + x]!.floor ?? 0;
    const memory = await bootedWalkMemory();

    const combats: Array<{ x: number; y: number; text: string }> = [];
    for (const step of APPROACH.slice(0, 26)) {
      const { run1, cell } = walkStep(raw, at(step.x, step.y), step, memory);
      // vmRun1 does nothing on the approach: its `GOSUB 0x8501` needs [0x4C02]==8 and its
      // `GOSUB 0x9AD2` needs [0x4C45]==3.
      expect(run1).toMatchObject({ kind: 'end', text: '' });
      if (cell.kind === 'combat') combats.push({ x: step.x, y: step.y, text: cell.text });
      else expect(cell).toMatchObject({ kind: 'end', text: '' });
    }
    // Exactly one forced fight on the whole approach: the descriptor-127 secret-door checkpoint at
    // (7,10), whose arm @0x83A3 falls through to 0x83C5 while [0x4C09] != 1.
    expect(combats.map((c) => ({ x: c.x, y: c.y }))).toEqual([{ x: 7, y: 10 }]);
    expect(combats[0]!.text).toBe('UNDEAD GUARDS COME AROUND THE CORNER.');
    // Neither mirror word has been touched by the approach.
    expect(memory.get(0x4c45) ?? 0).toBe(0);
    expect(memory.get(0x4c46) ?? 0).toBe(0);
  });

  it('D-E. the three-stage mirror gauntlet, with the terminal flag written only after the last stage', async () => {
    const raw = await block20();
    const map = decodeGeoBlock(await geoBlock20(), 'Gateway GEO6#20 Ascore');
    const at = (x: number, y: number) => map.map.cells[y * 16 + x]!.floor ?? 0;
    const memory = await bootedWalkMemory();

    // Approach, already proven in C — replayed here so the gauntlet starts from real walked state.
    for (const step of APPROACH.slice(0, 26)) walkStep(raw, at(step.x, step.y), step, memory);
    expect(memory.get(0x4c45) ?? 0).toBe(0);
    expect(memory.get(0x4c46) ?? 0).toBe(0);

    // ---- STAGE 1: (5,9), raw 0xFB, masked 123 -> second-table arm 16 @0x977B.
    const s1 = APPROACH[26]!;
    expect(at(s1.x, s1.y)).toBe(0xfb);
    const r1 = dialogueForVmRun1(raw, {
      memory, facing: s1.facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
      seedMemory: { 0xc04f: at(s1.x, s1.y) },
    })!;
    expect(r1.start()).toEqual({ kind: 'end', text: '' });
    const c1 = dialogueForCell(raw, at(s1.x, s1.y), {
      memory, facing: s1.facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
    })!;
    const t1 = c1.start();
    expect(t1.kind).toBe('combat');
    if (t1.kind !== 'combat') throw new Error('expected the first mirror battle');
    expect(t1.text).toBe(
      'YOU STAND BY THE WALL, BUT ONLY SHREDS OF THE ANCIENT TAPESTRY NOW HANG FROM THE CEILING.'
      + ' THE MAP IT ONCE CONTAINED HAS ROTTED. THE WALL ITSELF IS COVERED WITH A TREMENDOUS MIRROR.'
      + ' SQUINTING, YOU THINK YOU SEE YOUR FACES REFLECTED AS THOSE OF LEERING SKELETONS!',
    );
    expect(t1.pictureId).toBe(25);
    // `LOAD_MONSTER #91,#2,#91` @0x98D7 then `LOAD_MONSTER #90,#5,#90` @0x98DE.
    expect(t1.monsters).toEqual([
      { monsterId: 91, count: 2, picBlockId: 91 },
      { monsterId: 90, count: 5, picBlockId: 90 },
    ]);
    expect(t1.setup).toMatchObject({ spriteId: 255, maxDistance: 1, picId: 255 });
    // Both words are written EAGERLY — `OR [0x4C46],#1` @0x978C and `SAVE #1 -> [0x4C45]` @0x97F1
    // both run before the narration and before COMBAT. Asserted at the combat pause, not after.
    expect(memory.get(0x4c46)).toBe(1);
    expect(memory.get(0x4c45)).toBe(1);
    expect(c1.afterCombat('victory').kind).toBe('end');
    expect(memory.get(0x4c45)).toBe(1);
    // Still not the terminal value: vmRun1's payoff needs [0x4C45]==3.
    const after1 = dialogueForVmRun1(raw, {
      memory, facing: 'north', dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
      seedMemory: { 0xc04f: at(5, 8) },
    })!;
    expect(after1.start()).toEqual({ kind: 'end', text: '' });
    expect(memory.get(0x4c45)).toBe(1);

    // ---- interior steps, then STAGE 2: (5,6), raw 0xFC, masked 124 -> arm 17 @0x9799.
    for (const step of GAUNTLET.slice(0, 2)) {
      const { run1, cell } = walkStep(raw, at(step.x, step.y), step, memory);
      expect(run1).toMatchObject({ kind: 'end', text: '' });
      expect(cell).toMatchObject({ kind: 'end', text: '' });
    }
    const s2 = GAUNTLET[2]!;
    expect(at(s2.x, s2.y)).toBe(0xfc);
    expect(dialogueForVmRun1(raw, {
      memory, facing: s2.facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
      seedMemory: { 0xc04f: at(s2.x, s2.y) },
    })!.start()).toEqual({ kind: 'end', text: '' });
    const c2 = dialogueForCell(raw, at(s2.x, s2.y), {
      memory, facing: s2.facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
    })!;
    const t2 = c2.start();
    expect(t2.kind).toBe('combat');
    if (t2.kind !== 'combat') throw new Error('expected the second mirror battle');
    expect(t2.text).toBe(
      'THE TAPESTRY BESIDE THIS WALL, TOO, HAS CRUMBLED INTO DUST. BEFORE YOU CAN EXAMINE THE BROAD'
      + ' MIRROR, THE SOUND OF BONES RATTLING BEHIND YOU SIGNALS THE BEGINNING OF ANOTHER BATTLE.',
    );
    // A DIFFERENT roster from stage 1 — `LOAD_MONSTER #91,#3` then `#90,#3` @0x99B1/0x99B8.
    expect(t2.monsters).toEqual([
      { monsterId: 91, count: 3, picBlockId: 91 },
      { monsterId: 90, count: 3, picBlockId: 90 },
    ]);
    // Bit 2 OR'd in on top of bit 1 — one word, three independent flags (`OR [0x4C46],#2` @0x97AA).
    expect(memory.get(0x4c46)).toBe(3);
    expect(memory.get(0x4c45)).toBe(2);
    expect(c2.afterCombat('victory').kind).toBe('end');
    // STILL not terminal after stage 2 — this is the load-bearing multi-stage assertion.
    expect(memory.get(0x4c45)).toBe(2);
    expect(dialogueForVmRun1(raw, {
      memory, facing: 'south', dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
      seedMemory: { 0xc04f: at(5, 7) },
    })!.start()).toEqual({ kind: 'end', text: '' });
    expect(memory.get(0x4c45)).toBe(2);

    // ---- STAGE 3: (6,7), raw 0xFD, masked 125 -> arm 18 @0x97B7.
    const mid = GAUNTLET[3]!;
    expect(walkStep(raw, at(mid.x, mid.y), mid, memory).cell).toMatchObject({ kind: 'end', text: '' });
    const s3 = GAUNTLET[4]!;
    expect(at(s3.x, s3.y)).toBe(0xfd);
    expect(dialogueForVmRun1(raw, {
      memory, facing: s3.facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
      seedMemory: { 0xc04f: at(s3.x, s3.y) },
    })!.start()).toEqual({ kind: 'end', text: '' });
    const c3 = dialogueForCell(raw, at(s3.x, s3.y), {
      memory, facing: s3.facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
    })!;
    const t3 = c3.start();
    expect(t3.kind).toBe('combat');
    if (t3.kind !== 'combat') throw new Error('expected the third mirror battle');
    expect(t3.text).toBe(
      'YOU ARE ON YOUR GUARD AGAINST FURTHER UNDEAD ATTACKS. THE ASCOREAN HOSTS DO NOT DISAPPOINT'
      + ' YOU, CHARGING FEARLESSLY TOWARDS THE PARTY.',
    );
    expect(t3.monsters).toEqual([
      { monsterId: 91, count: 1, picBlockId: 91 },
      { monsterId: 90, count: 5, picBlockId: 90 },
    ]);
    expect(memory.get(0x4c46)).toBe(7); // 1 | 2 | 4 — all three walls consulted
    expect(memory.get(0x4c45)).toBe(3);
    expect(c3.afterCombat('victory').kind).toBe('end');
    // The third stage itself does NOT write the terminal value.
    expect(memory.get(0x4c45)).toBe(3);

    // ---- E. the terminal payoff, on the NEXT walk step, from vmRun1's `GOSUB 0x9AD2`.
    const last = GAUNTLET[5]!;
    const payoff = dialogueForVmRun1(raw, {
      memory, facing: last.facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
      seedMemory: { 0xc04f: at(last.x, last.y) },
    })!;
    const tp = payoff.start();
    expect(tp.kind).toBe('combat');
    if (tp.kind !== 'combat') throw new Error('expected the mirrors payoff');
    // `SAVE #4 -> [0x4C45]` @0x9ADA — written the instant [0x4C45]==3 is observed.
    expect(memory.get(0x4c45)).toBe(4);
    // The retail line is " <name> STEPS ON A LOOSE STONE ...  SUFFERING <n> POINTS OF DAMAGE. ...".
    // The engine's PRINT models inline/strref strings only, so the party name and the numeric
    // damage roll render as nothing here (documented harness gap, not a route defect).
    expect(tp.text).toBe(
      'STEPS ON A LOOSE STONE AND FALLS INTO A HIDDEN PIT, SUFFERING POINTS OF DAMAGE.'
      + ' YOU SEARCH THE TRAP, AND FIND A BAG OF ITEMS!',
    );
    // `CLEARMONSTERS` @0x9B86 then `TREASURE ...,#30` @0x9B87 then a rosterless `COMBAT` @0x9B99 —
    // the retail treasure-award idiom, not a fight.
    expect(tp.monsters).toEqual([]);
    expect(tp.treasure).toMatchObject({ itemBlockId: 30, itemSource: 'itemBlock' });
    expect(payoff.afterCombat('victory').kind).toBe('end');
    // And the cell itself is now silent: bit 4 of [0x4C46] is already set.
    const cellAfter = dialogueForCell(raw, at(last.x, last.y), {
      memory, facing: last.facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
    })!;
    expect(cellAfter.start()).toEqual({ kind: 'end', text: '' });
    expect(memory.get(0x4c45)).toBe(4);
    expect(memory.get(0x4c46)).toBe(7);

    // Terminal state is stable: vmRun1 no longer re-fires now that [0x4C45] is 4, not 3.
    const again = dialogueForVmRun1(raw, {
      memory, facing: 'south', dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
      seedMemory: { 0xc04f: at(last.x, last.y) },
    })!;
    expect(again.start()).toEqual({ kind: 'end', text: '' });
    expect(memory.get(0x4c45)).toBe(4);
  });

  it('F. consumed mirrors are silent on revisit — per DESCRIPTOR, including the twin cell never walked', async () => {
    const raw = await block20();
    const map = decodeGeoBlock(await geoBlock20(), 'Gateway GEO6#20 Ascore');
    const at = (x: number, y: number) => map.map.cells[y * 16 + x]!.floor ?? 0;
    // The exact end state the D-E walk lands on.
    const memory = new Map<number, number>([[0x4c45, 4], [0x4c46, 7]]);
    for (const [x, y] of [[5, 9], [4, 9], [5, 6], [4, 6], [6, 7], [6, 8]] as const) {
      const runner = dialogueForCell(raw, at(x, y), {
        memory, facing: 'south', dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
      })!;
      expect(runner.start()).toEqual({ kind: 'end', text: '' });
    }
    expect(memory.get(0x4c45)).toBe(4);
    expect(memory.get(0x4c46)).toBe(7);
  });

  it('G. the three [0x4C46] bits are independent — one word, three flags OR\'d at three sites', async () => {
    const raw = await block20();
    const map = decodeGeoBlock(await geoBlock20(), 'Gateway GEO6#20 Ascore');
    const at = (x: number, y: number) => map.map.cells[y * 16 + x]!.floor ?? 0;

    // Bit 1 alone (mirror 123 consumed): 123 is silent, 124 and 125 still fire.
    const only1 = new Map<number, number>([[0x4c46, 1], [0x4c45, 1]]);
    expect(dialogueForCell(raw, at(5, 9), {
      memory: only1, facing: 'west', dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
    })!.start()).toEqual({ kind: 'end', text: '' });
    const live124 = dialogueForCell(raw, at(5, 6), {
      memory: only1, facing: 'north', dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
    })!.start();
    expect(live124.kind).toBe('combat');
    expect(only1.get(0x4c46)).toBe(3);

    // Bit 4 alone (mirror 125 consumed): 125 is silent, 123 still fires as the FIRST stage.
    const only4 = new Map<number, number>([[0x4c46, 4], [0x4c45, 1]]);
    expect(dialogueForCell(raw, at(6, 7), {
      memory: only4, facing: 'east', dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
    })!.start()).toEqual({ kind: 'end', text: '' });
    const live123 = dialogueForCell(raw, at(5, 9), {
      memory: only4, facing: 'west', dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
    })!.start();
    expect(live123.kind).toBe('combat');
    expect(only4.get(0x4c46)).toBe(5);
    // The battle a cell serves is chosen by the COUNTER [0x4C45], not by which wall it is: with
    // [0x4C45]=1 the 123 wall serves stage 2's roster (`COMPARE [0x4C45],#1 ; IF_EQ GOTO 0x990F`).
    if (live123.kind !== 'combat') throw new Error('expected the 123 wall to still fire');
    expect(live123.monsters).toEqual([
      { monsterId: 91, count: 3, picBlockId: 91 },
      { monsterId: 90, count: 3, picBlockId: 90 },
    ]);
    expect(only4.get(0x4c45)).toBe(2);
  });

  it('H. negative control — a genuinely fresh memory map re-fires the whole gauntlet from stage 1', async () => {
    const raw = await block20();
    const map = decodeGeoBlock(await geoBlock20(), 'Gateway GEO6#20 Ascore');
    const at = (x: number, y: number) => map.map.cells[y * 16 + x]!.floor ?? 0;
    const fresh = new Map<number, number>();
    const runner = dialogueForCell(raw, at(5, 9), {
      memory: fresh, facing: 'west', dialect: ECL_GEN1_SHORT_GATEWAY, seed: SEED,
    })!;
    const turn = runner.start();
    expect(turn.kind).toBe('combat');
    if (turn.kind !== 'combat') throw new Error('expected the gauntlet to re-fire on fresh memory');
    expect(turn.text).toMatch(/ONLY SHREDS OF THE ANCIENT TAPESTRY NOW HANG FROM THE CEILING/);
    expect(turn.monsters).toEqual([
      { monsterId: 91, count: 2, picBlockId: 91 },
      { monsterId: 90, count: 5, picBlockId: 90 },
    ]);
    expect(fresh.get(0x4c45)).toBe(1);
    expect(fresh.get(0x4c46)).toBe(1);
    // The suppression in F is caused by the retail words, not by runner state.
    expect(runner.afterCombat('victory').kind).toBe('end');
  });
});
