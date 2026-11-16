/**
 * Golden: Gateway to the Savage Frontier's QUEST leg — the cross-archive flag `[0x4C21]`
 * ("Amanitas rescued").
 *
 * `ECL3.DAX#5` (Everlund's undercity, `GEO3.DAX#5` cell (5,13)) executes
 * `SAVE #1 -> [0x4C21]` at vaddr 0x9026 after the Amanitas rescue combat. Afterwards
 * `GEO2.DAX#1` cell (14,2) in **Yartar** — a different area, a different archive — stops
 * being a tavern and becomes a KRAKEN SPY x6 ambush.
 *
 * Full byte evidence, the exhaustive write-set census (two independent methods), the
 * reachability runs and every rejected candidate live in
 * `docs/engine/research/gateway-quest-flag.md`. Everything asserted here was read from the
 * retail files or produced by running the real `EclVm`; nothing is hand-traced.
 *
 * Shape of the proof:
 *   A/B. `[0x4C21]` has exactly ONE writer in the entire five-archive corpus, proven by a
 *        raw byte scan that needs no control-flow model at all, plus the exact instruction
 *        bytes at the setter and at the consumer's fork.
 *   C/D. The setter: GEO ground truth for the descriptor-121 cell, then the real VM running
 *        the rescue to a victory and landing `[0x4C21] = 1`.
 *   E/F. The consumer: the SAME retail cell, block, dialect and seed produce a `combat` turn
 *        with `[0x4C21] = 1` and a `say`/menu turn with `[0x4C21] = 0`. (E is the positive
 *        golden, F is the required flag-clear NEGATIVE CONTROL.)
 *   G.   End-to-end: the setter's own memory map is carried into `ECL2#1`'s `initial_entry`,
 *        which byte-grounds the wilderness re-entry spawn (11,0), and the five legal steps
 *        to (14,2) are walked with every intermediate cell executed through the VM.
 *   H/I. Two further cross-block consumers whose content also changes.
 *   J.   Disclosure: `[0x4C03]` is SHARED scratch, and `[0x4C03] = 1` alone silences the cell.
 *   K/L. The descriptor mask and the dialect, and exactly how far each of them discriminates.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  dialogueForCell,
  DialogueRunner,
  primeSearchLocation,
  decodeGeoBlock,
  decodeMonsterArchive,
  readDaxDataBlocks,
  parseEclHeader,
  ECL_GEN1,
  ECL_GEN1_SHORT,
  ECL_GEN1_SHORT_GATEWAY,
  EclVm,
  type EclEffect,
} from '../src/index.js';

const gateway = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const ecl2Path = resolve(gateway, 'ECL2.DAX');
const ecl3Path = resolve(gateway, 'ECL3.DAX');
const geo2Path = resolve(gateway, 'GEO2.DAX');
const geo3Path = resolve(gateway, 'GEO3.DAX');
const mon2Path = resolve(gateway, 'MON2CHA.DAX');
const mon3Path = resolve(gateway, 'MON3CHA.DAX');
const eclArchives = ['ECL2.DAX', 'ECL3.DAX', 'ECL4.DAX', 'ECL5.DAX', 'ECL6.DAX'] as const;
const haveRetail =
  existsSync(ecl2Path) && existsSync(ecl3Path) && existsSync(geo2Path) && existsSync(geo3Path);

async function block(path: string, blockId: number): Promise<Uint8Array> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(path)));
  return blocks.find((b) => b.blockId === blockId)!.raw;
}

/** file offset -> vaddr for Gen1 with address addend 0x8000 (vaddr = offset + 0x8000 - 2). */
const VADDR_ADDEND = 0x8000;
function at(raw: Uint8Array, vaddr: number, length: number): string {
  const offset = vaddr - VADDR_ADDEND + 2;
  return [...raw.slice(offset, offset + length)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

/** The retail "press a key" / yes-no host CALLs; index 0 keeps every branch on its YES arm. */
const yesCall = () => ({ comparison: { left: 0, right: 1 } });

/** The five legal directed steps from ECL2#1's own byte-grounded wilderness re-entry spawn
 *  (11,0,south) to the descriptor-30 consumer cell (14,2), with the facing carried INTO each
 *  cell. `tools/find_geo_path.py --geo GEO2.DAX --block 1 --start 11,0 --target 14,2
 *  --facing north --event-mask 127` -> step_count 5, one automatic door, zero bash/pick/knock
 *  edges, blocked_cell_count 0. */
const ROUTE: ReadonlyArray<{ x: number; y: number; facing: 'north' | 'east' | 'south' | 'west' }> = [
  { x: 11, y: 1, facing: 'south' },
  { x: 11, y: 2, facing: 'south' },
  { x: 12, y: 2, facing: 'east' },
  { x: 13, y: 2, facing: 'east' },
  { x: 14, y: 2, facing: 'east' },
];

/** Dispatch one cell of ECL2#1's Yartar map through the real VM and return the turn. */
function dispatchYartar(
  raw: Uint8Array,
  floor: number,
  memory: Map<number, number>,
  facing: 'north' | 'east' | 'south' | 'west' = 'east',
  seed = 0x1234,
) {
  const runner = dialogueForCell(raw, floor, {
    memory, facing, dialect: ECL_GEN1_SHORT_GATEWAY, seed, onCall: yesCall,
  });
  expect(runner).not.toBeNull();
  return { runner: runner!, turn: runner!.start() };
}

describe.skipIf(!haveRetail)('Gateway [0x4C21] — cross-archive quest flag (Amanitas rescued)', () => {
  it('A. the setter and the consumer fork, byte-for-byte at their real vaddrs', async () => {
    const setter = await block(ecl3Path, 5);
    const consumer = await block(ecl2Path, 1);
    expect(setter.length).toBe(5690);
    expect(consumer.length).toBe(7578);

    const header = parseEclHeader(setter, ECL_GEN1_SHORT_GATEWAY);
    expect(header.magic).toBe(0x1388);
    expect(header.searchLocation).toBe(0x807c);
    expect(header.eclInitialEntry).toBe(0x8014);

    // ECL3#5, the ONLY write of [0x4C21] anywhere in the corpus, at file offset 4136.
    expect(at(setter, 0x9026, 6)).toBe('09 00 01 01 21 4c');
    // ...unconditionally the next instruction after the "'WELL, WELL, WELL,'" PRINTCLEAR at
    // 0x8F8C, whose packed length byte is 0x97 (3982 + 3 + 151 = 4136).
    expect(at(setter, 0x8f8c, 3)).toBe('12 80 97');
    // The rescue arm's own guard, roster and consumed bit.
    expect(at(setter, 0x8e3b, 6)).toBe('03 01 32 4c 00 01'); // COMPARE [0x4C32],#1
    expect(at(setter, 0x8f04, 7)).toBe('0b 00 04 00 02 00 04'); // LOAD_MONSTER #4,#2,#4
    expect(at(setter, 0x8f0b, 7)).toBe('0b 00 17 00 02 00 17'); // LOAD_MONSTER #23,#2,#23
    expect(at(setter, 0x8f12, 1)).toBe('24'); // COMBAT
    expect(at(setter, 0x8f13, 6)).toBe('09 00 01 01 32 4c'); // SAVE #1 -> [0x4C32]
    // The script's own descriptor mask in this block: AND #127,[0xC04F],[0x4C02].
    expect(at(setter, 0x8083, 9)).toBe('2f 00 7f 01 4f c0 01 02 4c');

    // ECL2#1 arm 30 — the fork. COMPARE [0x4C21],#0 / IF_EQ / GOTO 0x89D2 (the tavern).
    expect(at(consumer, 0x917d, 6)).toBe('03 01 21 4c 00 00');
    expect(at(consumer, 0x9183, 1)).toBe('16');
    expect(at(consumer, 0x9184, 4)).toBe('01 01 d2 89');
    // ...then the ambush's own consumed-bit guard, roster and write.
    expect(at(consumer, 0x9188, 6)).toBe('03 01 03 4c 00 01'); // COMPARE [0x4C03],#1
    expect(at(consumer, 0x91aa, 7)).toBe('0c 00 ff 00 00 00 ff'); // SETUP_MONSTER #255,#0,#255
    expect(at(consumer, 0x91b1, 7)).toBe('0b 00 00 00 06 00 00'); // LOAD_MONSTER #0,#6,#0
    expect(at(consumer, 0x91b8, 1)).toBe('24'); // COMBAT
    expect(at(consumer, 0x91b9, 6)).toBe('09 00 01 01 03 4c'); // SAVE #1 -> [0x4C03]
    // ON_GOTO arm 30's operand slot: table base file offset 714, three bytes per arm.
    expect([...consumer.slice(714 + 3 * 30, 714 + 3 * 30 + 3)]).toEqual([0x01, 0x7d, 0x91]);
  });

  it('B. [0x4C21] has exactly ONE writer in the whole five-archive corpus (raw byte scan)', async () => {
    // The Gen1 operand encoding for the word [0x4C21] is the literal three bytes 01 21 4c.
    // This scan makes no control-flow assumption at all: it just counts occurrences.
    const needle = [0x01, 0x21, 0x4c];
    const sites: { file: string; blockId: number; offset: number; kind: string }[] = [];
    for (const name of eclArchives) {
      const bytes = new Uint8Array(await readFile(resolve(gateway, name)));
      for (const blk of readDaxDataBlocks(bytes)) {
        const raw = blk.raw;
        for (let i = 0; i + 3 <= raw.length; i++) {
          if (raw[i] !== needle[0] || raw[i + 1] !== needle[1] || raw[i + 2] !== needle[2]) continue;
          // A COMPARE reading it is `03 01 21 4c ..`; the sole write is `09 00 01 01 21 4c`.
          const kind = raw[i - 1] === 0x03 ? 'compare-read' : raw[i - 3] === 0x09 ? 'save-write' : 'other';
          sites.push({ file: name, blockId: blk.blockId, offset: i, kind });
        }
      }
    }
    expect(sites.filter((s) => s.kind === 'save-write')).toEqual([
      { file: 'ECL3.DAX', blockId: 5, offset: 4139, kind: 'save-write' },
    ]);
    expect(sites.filter((s) => s.kind === 'other')).toEqual([]);
    // Eleven gating reads, in three blocks across two archives — none in the setter's block.
    const reads = sites.filter((s) => s.kind === 'compare-read');
    expect(reads.length).toBe(11);
    expect(reads.map((s) => `${s.file}#${s.blockId}@0x${(s.offset - 1 + 0x8000 - 2).toString(16)}`)).toEqual([
      'ECL2.DAX#1@0x845e', 'ECL2.DAX#1@0x8629', 'ECL2.DAX#1@0x863f', 'ECL2.DAX#1@0x8665',
      'ECL2.DAX#1@0x867b', 'ECL2.DAX#1@0x8c97', 'ECL2.DAX#1@0x917d', 'ECL2.DAX#1@0x9378',
      'ECL2.DAX#4@0x96fb', 'ECL2.DAX#4@0x992f', 'ECL3.DAX#14@0x85b9',
    ]);
    // The single writer is in ECL3.DAX#5; every reader is in a DIFFERENT block, and ten of the
    // eleven are in a DIFFERENT ARCHIVE. That is the quest leg's structural requirement.
    expect(reads.filter((s) => s.file !== 'ECL3.DAX').length).toBe(10);
    expect(new Set(reads.map((s) => `${s.file}#${s.blockId}`))).toEqual(
      new Set(['ECL2.DAX#1', 'ECL2.DAX#4', 'ECL3.DAX#14']),
    );
  });

  it('C. GEO ground truth: one descriptor-121 setter cell, one descriptor-30 consumer cell', async () => {
    const everlund = decodeGeoBlock(await block(geo3Path, 5), 'Gateway GEO3#5 Everlund');
    const setterCells = everlund.map.cells
      .map((cell, i) => ({ x: i % 16, y: Math.floor(i / 16), floor: cell.floor ?? 0 }))
      .filter((c) => (c.floor & 0x7f) === 121);
    expect(setterCells).toEqual([{ x: 5, y: 13, floor: 0xf9 }]);

    const yartar = decodeGeoBlock(await block(geo2Path, 1), 'Gateway GEO2#1 Yartar');
    const floorAt = (x: number, y: number) => yartar.map.cells[y * 16 + x]!.floor ?? 0;
    const consumerCells = yartar.map.cells
      .map((cell, i) => ({ x: i % 16, y: Math.floor(i / 16), floor: cell.floor ?? 0 }))
      .filter((c) => (c.floor & 0x7f) === 30);
    expect(consumerCells).toEqual([{ x: 14, y: 2, floor: 0x9e }]);

    // The whole walked route, straight from the GEO plane.
    expect(floorAt(11, 0)).toBe(0x01); // the byte-grounded wilderness re-entry spawn
    expect([floorAt(11, 1), floorAt(12, 2)]).toEqual([0x00, 0x00]);
    expect(floorAt(11, 2)).toBe(0x27); // the early leg's thug cell, masked 39
    expect(floorAt(13, 2)).toBe(0x1d); // the Three Rivers Festhall sign, masked 29
  });

  it.skipIf(!existsSync(mon2Path) || !existsSync(mon3Path))(
    'C2. resolves both rosters against the real MONnCHA.DAX names', async () => {
      const m2 = decodeMonsterArchive(new Uint8Array(await readFile(mon2Path)), 'gateway-to-the-savage-frontier');
      const m3 = decodeMonsterArchive(new Uint8Array(await readFile(mon3Path)), 'gateway-to-the-savage-frontier');
      const by = (recs: typeof m2) => new Map(recs.map((r) => [r.blockId, r.name]));
      // Setter, ECL3#5 @0x8F04/@0x8F0B — matching its own narration ("TWO MEN WATCH", "A
      // DROOLING OWLBEAR FACING HIM ON EITHER SIDE").
      expect(by(m3).get(4)).toBe('ZHENTIL FIGHTER');
      expect(by(m3).get(23)).toBe('OWLBEAR');
      // Consumer, ECL2#1 @0x91B1 — matching "KRAKEN SPIES ATTACK!".
      expect(by(m2).get(0)).toBe('KRAKEN SPY');
    },
  );

  it('D. SETTER: the real VM runs the Amanitas rescue and lands [0x4C21] = 1', async () => {
    const raw = await block(ecl3Path, 5);
    const geo = decodeGeoBlock(await block(geo3Path, 5), 'Gateway GEO3#5 Everlund');
    const floor = geo.map.cells[13 * 16 + 5]!.floor ?? 0;
    expect(floor).toBe(0xf9);

    const memory = new Map<number, number>();
    const effects: EclEffect[] = [];
    const vm = primeSearchLocation(raw, floor, {
      memory, facing: 'north', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234, onCall: yesCall,
    });
    expect(vm).not.toBeNull();
    const runner = new DialogueRunner(vm!, (batch) => effects.push(...batch));

    const turn = runner.start();
    expect(turn.kind).toBe('combat');
    if (turn.kind !== 'combat') throw new Error('expected the Amanitas rescue combat');
    expect(turn.text).toBe(
      'ON THE FAR SIDE OF THE ROOM AN OLD MAN STANDS CHAINED TO THE WALL, A DROOLING OWLBEAR'
      + " FACING HIM ON EITHER SIDE. TWO MEN WATCH, AND ONE OF THEM IS SAYING '...HIM TRY TO"
      + " CAST A SPELL--THEY'LL TEAR HIS ARMS OFF!'",
    );
    expect(turn.pictureId).toBe(21);
    expect(turn.monsters).toEqual([
      { monsterId: 4, count: 2, picBlockId: 4 },
      { monsterId: 23, count: 2, picBlockId: 23 },
    ]);
    expect(turn.setup).toMatchObject({ spriteId: 255, maxDistance: 1, picId: 255 });
    // Nothing is written before the fight: both the fight's consumed bit AND the quest flag
    // land only after a victory.
    expect(memory.get(0x4c32) ?? 0).toBe(0);
    expect(memory.get(0x4c21) ?? 0).toBe(0);
    expect(effects.map((e) => e.type)).toEqual([
      'print', 'picture', 'call', 'treasure', 'encounterSetup', 'combat',
    ]);

    const after = runner.afterCombat('victory');
    expect(after.kind).toBe('end');
    expect(runner.isDone()).toBe(true);
    // 0x8F13 SAVE #1 -> [0x4C32]: this fight's own consumed bit.
    expect(memory.get(0x4c32)).toBe(1);
    // 0x9026 SAVE #1 -> [0x4C21]: THE QUEST FLAG. It runs on the path both branches of the
    // "is EREK in the party" scan (GOSUB 0x9201) converge on, so a partyless run reaches it.
    expect(memory.get(0x4c21)).toBe(1);
    expect(after.text).toMatch(/'WELL, WELL, WELL,' SAYS THE OLD MAN AS YOU RELEASE HIM FROM HIS CHAINS\./);
    expect(after.text).toMatch(/YOU RECORD WHAT HAPPENS NEXT AS JOURNAL ENTRY #29\./);
    expect(after.text).toMatch(/AMANITAS REACHES DEEP WITHIN HIS ROBES AND HANDS OVER A RATHER PLAIN-LOOKING RING\./);
    expect(after.text).toMatch(/YARTAR SHOULD BE YOUR FIRST DESTINATION--WE KNOW THE KRAKEN HAVE A BASE THERE\./);
  });

  it('E. POSITIVE: with [0x4C21] = 1 the Yartar cell (14,2) is a KRAKEN SPY ambush', async () => {
    const raw = await block(ecl2Path, 1);
    const geo = decodeGeoBlock(await block(geo2Path, 1), 'Gateway GEO2#1 Yartar');
    const floor = geo.map.cells[2 * 16 + 14]!.floor ?? 0;

    const memory = new Map<number, number>([[0x4c21, 1]]);
    const effects: EclEffect[] = [];
    const vm = primeSearchLocation(raw, floor, {
      memory, facing: 'east', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234, onCall: yesCall,
    });
    expect(vm).not.toBeNull();
    const runner = new DialogueRunner(vm!, (batch) => effects.push(...batch));

    const turn = runner.start();
    expect(turn.kind).toBe('combat');
    if (turn.kind !== 'combat') throw new Error('expected the Kraken Spy ambush');
    expect(turn.text).toBe('KRAKEN SPIES ATTACK!');
    expect(turn.pictureId).toBe(14);
    expect(turn.monsters).toEqual([{ monsterId: 0, count: 6, picBlockId: 0 }]);
    expect(turn.setup).toMatchObject({ spriteId: 255, maxDistance: 0, picId: 255 });
    expect(effects.map((e) => e.type)).toEqual([
      'print', 'picture', 'call', 'encounterSetup', 'combat',
    ]);
    // The consumed bit is NOT written eagerly here — 0x91B9 runs after COMBAT.
    expect(memory.get(0x4c03) ?? 0).toBe(0);

    expect(runner.afterCombat('victory')).toEqual({ kind: 'end', text: '' });
    expect(runner.isDone()).toBe(true);
    expect(memory.get(0x4c03)).toBe(1);
    // The quest flag itself is never cleared: it has no other writer corpus-wide (test B).
    expect(memory.get(0x4c21)).toBe(1);

    // Silent legal revisit: 0x9188's COMPARE [0x4C03],#1 now passes and 0x918F EXITs before
    // any PRINTCLEAR, so the cell produces no narration and no roster.
    expect(dispatchYartar(raw, floor, memory).turn).toEqual({ kind: 'end', text: '' });
    expect(memory.get(0x4c03)).toBe(1);
    expect(memory.get(0x4c21)).toBe(1);
  });

  it('F. NEGATIVE CONTROL: with [0x4C21] cleared the identical cell is a tavern menu', async () => {
    const raw = await block(ecl2Path, 1);
    const geo = decodeGeoBlock(await block(geo2Path, 1), 'Gateway GEO2#1 Yartar');
    const floor = geo.map.cells[2 * 16 + 14]!.floor ?? 0;

    // Same block, same cell, same dialect, same seed — only the flag differs.
    const memory = new Map<number, number>([[0x4c21, 0]]);
    const { turn } = dispatchYartar(raw, floor, memory);
    expect(turn.kind).toBe('say');
    if (turn.kind !== 'say') throw new Error('expected the tavern menu on the flag-clear branch');
    // 0x9184 GOTO 0x89D2 lands in ON_GOTO arm 5's shared tavern handler.
    expect(turn.text).toBe("'WHAT'LL IT BE?'");
    expect(turn.awaiting).toBe('menu');
    expect(turn.choices).toEqual(['FIGHT', 'LEAVE']);
    expect(turn.pictureId).toBe(6);
    // No roster is queued and the ambush's consumed bit is untouched.
    expect(memory.get(0x4c03) ?? 0).toBe(0);

    // Fully unset memory (not merely 0) takes the same branch.
    const empty = new Map<number, number>();
    const bare = dispatchYartar(raw, floor, empty).turn;
    expect(bare.kind).toBe('say');
    expect(bare.text).toBe("'WHAT'LL IT BE?'");
    expect(empty.get(0x4c03) ?? 0).toBe(0);
  });

  it('G. END-TO-END: the setter\'s own memory carried into ECL2#1, spawn (11,0), five steps', async () => {
    const setterRaw = await block(ecl3Path, 5);
    const setterGeo = decodeGeoBlock(await block(geo3Path, 5), 'Gateway GEO3#5 Everlund');
    const memory = new Map<number, number>();
    const setter = new DialogueRunner(
      primeSearchLocation(setterRaw, setterGeo.map.cells[13 * 16 + 5]!.floor ?? 0, {
        memory, facing: 'north', dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234, onCall: yesCall,
      })!,
    );
    expect(setter.start().kind).toBe('combat');
    setter.afterCombat('victory');
    expect(memory.get(0x4c21)).toBe(1);

    // The party leaves Everlund for the overland and walks back into Yartar. [0x4BF2] is the
    // host's LastEclBlockId (21 = ECL6#21, the proven wilderness block) and [0x03B2] the entry
    // facing this block's own 0x835B copies into [0xC04D]; both are host inputs and only
    // select WHICH of the block's own initial_entry spawn arms runs.
    const raw = await block(ecl2Path, 1);
    const geo = decodeGeoBlock(await block(geo2Path, 1), 'Gateway GEO2#1 Yartar');
    const floorAt = (x: number, y: number) => geo.map.cells[y * 16 + x]!.floor ?? 0;
    memory.set(0x4bf2, 21);
    memory.set(0x03b2, 2); // south
    const boot = new EclVm(raw, { memory, dialect: ECL_GEN1_SHORT_GATEWAY, entry: 22, seed: 0x1234 });
    const booted = boot.run();
    expect(booted.status).toBe('exited');
    // 0x838D SAVE #0 -> [0xC04C], 0x8393 SAVE #11 -> [0xC04B]: the north-gate re-entry spawn.
    expect(memory.get(0xc04b)).toBe(11);
    expect(memory.get(0xc04c)).toBe(0);
    expect(memory.get(0xc04d)).toBe(2);
    expect(memory.get(0x4be6)).toBe(1); // Yartar is a local/tactical map
    expect(memory.get(0x4c00)).toBe(0); // 0x801A: the open-street step counter starts at 0
    expect(booted.effects.find((e) => e.type === 'loadFiles')).toMatchObject({
      geoBlockId: 1, operands: [1, 2, 255],
    });
    // The quest flag survived the block transition; the ambush's own bit is still clear.
    expect(memory.get(0x4c21)).toBe(1);
    expect(memory.get(0x4c03) ?? 0).toBe(0);

    const seen: string[] = [];
    for (const step of ROUTE) {
      memory.set(0xc04b, step.x);
      memory.set(0xc04c, step.y);
      const { runner, turn } = dispatchYartar(raw, floorAt(step.x, step.y), memory, step.facing);
      seen.push(`${step.x},${step.y}:${turn.kind}`);
      if (step.x === 14) {
        if (turn.kind !== 'combat') throw new Error('expected the ambush at (14,2)');
        expect(turn.text).toBe('KRAKEN SPIES ATTACK!');
        expect(turn.monsters).toEqual([{ monsterId: 0, count: 6, picBlockId: 0 }]);
        expect(runner.afterCombat('victory')).toEqual({ kind: 'end', text: '' });
      } else if (step.x === 13) {
        expect(turn.text).toBe(
          'A BRIGHT, MULTICOLORED BANNER FLIES OVER THIS DOOR. ON IT ARE STITCHED THE WORDS:'
          + ' THREE RIVERS FESTHALL',
        );
      } else {
        // (11,1) and (12,2) are descriptor-0 street cells; (11,2) is the early leg's thug cell,
        // silenced because 0x9378's `COMPARE [0x4C21],#0 ; IF_NE ; EXIT` now fires.
        expect(turn).toEqual({ kind: 'end', text: '' });
      }
    }
    expect(seen).toEqual(['11,1:end', '11,2:end', '12,2:end', '13,2:end', '14,2:combat']);
    // Only two descriptor-0 cells were crossed, so [0x4C00] stays far below arm 0's `> 5`
    // wandering-monster gate at 0x8404 — the walk never reaches the RANDOM at 0x843C and is
    // therefore seed-independent (see the mirrored control below).
    expect(memory.get(0x4c00)).toBe(2);
    expect(memory.get(0x4c03)).toBe(1);
  });

  it('G2. the SAME five steps with the flag never set produce the other content', async () => {
    const raw = await block(ecl2Path, 1);
    const geo = decodeGeoBlock(await block(geo2Path, 1), 'Gateway GEO2#1 Yartar');
    const floorAt = (x: number, y: number) => geo.map.cells[y * 16 + x]!.floor ?? 0;

    for (const seed of [0x1234, 0x5678]) {
      const memory = new Map<number, number>([[0x4bf2, 21], [0x03b2, 2]]);
      const boot = new EclVm(raw, { memory, dialect: ECL_GEN1_SHORT_GATEWAY, entry: 22, seed });
      expect(boot.run().status).toBe('exited');
      expect(memory.get(0xc04b)).toBe(11);
      expect(memory.get(0xc04c)).toBe(0);
      expect(memory.get(0x4c21) ?? 0).toBe(0);

      const kinds: string[] = [];
      for (const step of ROUTE) {
        memory.set(0xc04b, step.x);
        memory.set(0xc04c, step.y);
        const { runner, turn } = dispatchYartar(raw, floorAt(step.x, step.y), memory, step.facing, seed);
        kinds.push(turn.kind);
        if (step.x === 11 && step.y === 2) {
          // The early leg's thug rescue is LIVE while the quest flag is clear.
          if (turn.kind !== 'combat') throw new Error('expected the thug rescue at (11,2)');
          expect(turn.text).toBe(
            'SEVERAL THUGS HAVE CORNERED A SMALL, TERRIFIED MAN IN AN ALCOVE OF THIS NARROW'
            + ' STREET. DO YOU WANT TO HELP HIM?',
          );
          expect(turn.monsters).toEqual([{ monsterId: 1, count: 5, picBlockId: 1 }]);
          runner.afterCombat('victory');
          expect(memory.get(0x4c20)).toBe(1);
        }
        if (step.x === 14) {
          if (turn.kind !== 'say') throw new Error('expected the tavern menu at (14,2)');
          expect(turn.text).toBe("'WHAT'LL IT BE?'");
          expect(turn.choices).toEqual(['FIGHT', 'LEAVE']);
        }
      }
      // Identical under both seeds: no RANDOM is reached on this route.
      expect(kinds).toEqual(['end', 'combat', 'end', 'end', 'say']);
      expect(memory.get(0x4c03) ?? 0).toBe(0);
    }
  });

  it('H. second cross-archive consumer: the flag silences the Yartar thug rescue at (11,2)', async () => {
    const raw = await block(ecl2Path, 1);
    const geo = decodeGeoBlock(await block(geo2Path, 1), 'Gateway GEO2#1 Yartar');
    const floor = geo.map.cells[2 * 16 + 11]!.floor ?? 0;
    expect(floor).toBe(0x27);

    // 0x9378 COMPARE [0x4C21],#0 ; 0x937E IF_NE ; 0x937F EXIT.
    expect(at(raw, 0x9378, 6)).toBe('03 01 21 4c 00 00');
    expect(at(raw, 0x937e, 2)).toBe('17 00');

    const clear = new Map<number, number>();
    const offered = dispatchYartar(raw, floor, clear).turn;
    expect(offered.kind).toBe('combat');
    if (offered.kind !== 'combat') throw new Error('expected the thug offer with the flag clear');
    expect(offered.monsters).toEqual([{ monsterId: 1, count: 5, picBlockId: 1 }]);

    const set = new Map<number, number>([[0x4c21, 1]]);
    expect(dispatchYartar(raw, floor, set).turn).toEqual({ kind: 'end', text: '' });
    // ...and it is the flag, not a consumed bit: [0x4C20] was never written.
    expect(set.get(0x4c20) ?? 0).toBe(0);
  });

  it('I. third consumer: the Waterbaron records a different journal entry', async () => {
    const raw = await block(ecl2Path, 1);
    const geo = decodeGeoBlock(await block(geo2Path, 1), 'Gateway GEO2#1 Yartar');
    const cells = geo.map.cells
      .map((cell, i) => ({ x: i % 16, y: Math.floor(i / 16), floor: cell.floor ?? 0 }))
      .filter((c) => (c.floor & 0x7f) === 14);
    expect(cells.map((c) => [c.x, c.y])).toEqual([[10, 7], [10, 8]]);
    // 0x8C97 COMPARE [0x4C21],#0 ; IF_EQ GOTO 0x8CB1 (PRINT "ENTRY #9."); else 0x8CA2
    // PRINT "ENTRY #32.".
    expect(at(raw, 0x8c97, 6)).toBe('03 01 21 4c 00 00');

    // NOTE the assertion style: this arm ends `GOTO 0x9A71`, whose `CALL [0xC01E]` (the retail
    // host's "turn around and step back out") this engine does not model, so `collectText`
    // repeats the paragraph. That is a known VM gap, not retail behaviour, hence `toContain`.
    for (const { x, y, floor } of cells) {
      expect(dispatchYartar(raw, floor, new Map([[0x4c21, 0]]), 'east').turn.text).toContain(
        `THE WATERBARON GREETS YOU, AND YOU RECORD YOUR CONVERSATION AS JOURNAL ENTRY #9.`,
      );
      const set = dispatchYartar(raw, floor, new Map([[0x4c21, 1]]), 'east').turn.text;
      expect(set).toContain('AS JOURNAL ENTRY #32.');
      expect(set).not.toContain('AS JOURNAL ENTRY #9.');
      expect([x, y]).toHaveLength(2);
    }
  });

  it('J. DISCLOSURE: [0x4C03] is shared scratch — 1 alone silences the ambush', async () => {
    const raw = await block(ecl2Path, 1);
    const geo = decodeGeoBlock(await block(geo2Path, 1), 'Gateway GEO2#1 Yartar');
    const floor = geo.map.cells[2 * 16 + 14]!.floor ?? 0;

    // 0x9188 tests EQUALITY with 1, so only the exact value 1 suppresses the cell. ECL3#5's own
    // Everlund street arm increments [0x4C03] (0x848F ADD #1,[0x4C03],[0x4C03]), so a carried
    // value of exactly 1 would suppress Yartar's ambush. Whether the retail engine zeroes this
    // range on an area change is NOT proven in this repo; the behaviour is disclosed, not hidden.
    expect(dispatchYartar(raw, floor, new Map([[0x4c21, 1], [0x4c03, 1]])).turn)
      .toEqual({ kind: 'end', text: '' });
    for (const carried of [0, 2, 5]) {
      const turn = dispatchYartar(raw, floor, new Map([[0x4c21, 1], [0x4c03, carried]])).turn;
      expect(turn.kind).toBe('combat');
    }
    // The load-bearing fork is 0x917D, which runs BEFORE 0x9188: with the quest flag clear the
    // cell is the tavern for every one of those [0x4C03] values.
    for (const carried of [0, 1, 2, 5]) {
      expect(dispatchYartar(raw, floor, new Map([[0x4c21, 0], [0x4c03, carried]])).turn.kind).toBe('say');
    }
  });

  it('K. the &0x7F mask is load-bearing on the setter cell (unlike the early leg)', async () => {
    const raw = await block(ecl3Path, 5);
    // The setter cell's raw floor byte is 0xF9: &0x7F = 121 (the rescue), &0x3F = 57 (nothing).
    expect(0xf9 & 0x7f).toBe(121);
    expect(0xf9 & 0x3f).toBe(57);
    expect(dispatchYartarLike(raw, 0xf9).kind).toBe('combat');
    expect(dispatchYartarLike(raw, 0x79).kind).toBe('combat'); // same masked value, no high bit
    // Feeding the descriptor a &0x3F-equivalent byte reaches no arm at all.
    expect(dispatchYartarLike(raw, 0x39)).toEqual({ kind: 'end', text: '' });

    function dispatchYartarLike(block5: Uint8Array, floor: number) {
      return dialogueForCell(block5, floor, {
        memory: new Map<number, number>(), facing: 'north',
        dialect: ECL_GEN1_SHORT_GATEWAY, seed: 0x1234, onCall: yesCall,
      })!.start();
    }
  });

  it('L. how far the Gateway dialect discriminates, stated precisely', async () => {
    const raw = await block(ecl2Path, 1);
    const geo = decodeGeoBlock(await block(geo2Path, 1), 'Gateway GEO2#1 Yartar');
    const floor = geo.map.cells[2 * 16 + 14]!.floor ?? 0;
    const run = (dialect: typeof ECL_GEN1_SHORT_GATEWAY) =>
      dialogueForCell(raw, floor, {
        memory: new Map<number, number>([[0x4c21, 1]]), facing: 'east',
        dialect, seed: 0x1234, onCall: yesCall,
      })!.start();

    // DoK's table desyncs silently: SETUP_MONSTER's 4-operand frame swallows LOAD_MONSTER, so
    // the roster and the COMBAT disappear while the narration still prints.
    const short = run(ECL_GEN1_SHORT);
    expect(short.kind).toBe('end');
    expect(short.text).toBe('KRAKEN SPIES ATTACK!');
    // Honest limit: the plain long ECL_GEN1 default produces the IDENTICAL result here, so this
    // route does NOT by itself prove the Gateway split. The Gateway dialect is used because it
    // is the title's declared dialect; the split's justification is the 0x0C operand census in
    // ECL_GEN1_SHORT_GATEWAY's own doc comment.
    expect(run(ECL_GEN1)).toEqual(run(ECL_GEN1_SHORT_GATEWAY));
    expect(run(ECL_GEN1_SHORT_GATEWAY).kind).toBe('combat');
  });
});
