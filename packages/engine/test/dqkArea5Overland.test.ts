import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { DialogueRunner, DqkArea5OverlandSession, ECL_GEN2, decodeEclGlb, decodeDqkArea5Overland, dqkArea5VmRunSeed, primeVmRun1 } from '../src/index.js';

describe('DQK Area 5 overland grid', () => {
  it('decodes the 38x30 inline ECL table and pins the proven dragon selector', async () => {
    const path = new URL('../../../The Dark Queen of Krynn/DISK3/ECL.GLB', import.meta.url);
    const archive = decodeEclGlb(new Uint8Array(await readFile(path)), 'ECL.GLB');
    const area5 = archive.blockSourceById(5);
    expect(area5).toBeTruthy();
    const grid = decodeDqkArea5Overland(area5!);

    expect(grid.width).toBe(38);
    expect(grid.height).toBe(30);
    expect(grid.values).toHaveLength(38 * 30);
    // selector 3 + host coordinates (29,2) produces table coordinate (30,3).
    expect(grid.valueAt(30, 3)).toBe(0xe5);
    expect(grid.valueAt(-1, 0)).toBeUndefined();
    expect(grid.valueAt(38, 29)).toBeUndefined();
  });

  it('rejects a block too short to contain the anchored inline table', () => {
    expect(() => decodeDqkArea5Overland(new Uint8Array(64))).toThrow(/overland table is absent/);
  });

  it('runs the real selector-3 table transition through Gen2 vmRun1', async () => {
    const path = new URL('../../../The Dark Queen of Krynn/DISK3/ECL.GLB', import.meta.url);
    const archive = decodeEclGlb(new Uint8Array(await readFile(path)), 'ECL.GLB');
    const memory = new Map<number, number>();
    const vm = primeVmRun1(archive.blockSourceById(5)!, {
      dialect: ECL_GEN2,
      memory,
      seedMemory: dqkArea5VmRunSeed('south-east', 29, 2),
      partyStrength: 240,
    });
    expect(vm?.run().status).toBe('exited');
    expect(memory.get(0x00c0)).toBe(30);
    expect(memory.get(0x00c1)).toBe(3);
    expect(memory.get(0x00ca)).toBe(14);
    expect(memory.get(0x00cb)).toBe(5);
    expect(memory.get(0x00cc)).toBe(0xe5);
  });

  it('persists real vmRun1 terrain state without inventing a combat handoff', async () => {
    const path = new URL('../../../The Dark Queen of Krynn/DISK3/ECL.GLB', import.meta.url);
    const archive = decodeEclGlb(new Uint8Array(await readFile(path)), 'ECL.GLB');
    const session = new DqkArea5OverlandSession(archive.blockSourceById(5)!, { x: 29, y: 2 });
    const step = session.step('south-east');

    expect(step.run.status).toBe('exited');
    expect(step.from).toEqual({ x: 29, y: 2 });
    expect(step.to).toEqual({ x: 30, y: 3 });
    expect(step.moved).toBe(true);
    expect(step.terrain).toBe(0xe5);
    expect(step.terrainHigh).toBe(14);
    expect(step.terrainLow).toBe(5);
    expect(session.getPosition()).toEqual({ x: 30, y: 3 });
  });

  it('only bridges the recovered 0xE5 state into the real CampInterrupted dragon handler', async () => {
    const path = new URL('../../../The Dark Queen of Krynn/DISK3/ECL.GLB', import.meta.url);
    const archive = decodeEclGlb(new Uint8Array(await readFile(path)), 'ECL.GLB');
    const session = new DqkArea5OverlandSession(archive.blockSourceById(5)!, { x: 29, y: 2 });
    expect(session.beginCampInterrupted()).toBeNull();
    session.step('south-east');
    const vm = session.beginCampInterrupted(240);
    expect(vm).toBeTruthy();
    // Bridge rows are asserted before the retail handler mutates c1/c2 for its encounter roll.
    expect(session.memory.get(0x0112)).toBe(16);
    expect(session.memory.get(0x00c1)).toBe(3);
    expect(session.memory.get(0x00c2)).toBe(2);
    const runner = new DialogueRunner(vm!);
    let turn = runner.start();
    for (let guard = 0; guard < 12 && turn.kind !== 'combat'; guard++) turn = runner.choose(0);
    session.retainRng(vm!);

    if (turn.kind !== 'combat') throw new Error(`expected combat, got ${turn.kind}`);
    // The corrected one-operand Gen2 PARLAY framing preserves the following
    // RANDOM/ADD/LOAD_MONSTER instructions and matches the clean-room VM's
    // deterministic Area-5 count.
    //
    // 2026-08-07: the same class of fix, one layer deeper. TREASURE (0x27) is a FOUR-operand
    // frame in Gen2, not eight — handler 25a4:2127 prefetches 4, reads them, then does
    // `dec [pc]` + a count-driven second prefetch. At nine bytes the TREASURE at 0x91a4 no longer
    // swallows the guarded LOAD_MONSTER that follows it:
    //   91a4  27 00 64 00 01 00 00 00 00   TREASURE #100,#1,#0,#0
    //   91ad  19                            IF_GT
    //   91ae  0b 00 34 01 c1 00 00 34      LOAD_MONSTER #52,[00C1],#52   <- previously eaten
    //   91b6  19                            IF_GT
    //   91b7  0b 00 25 01 c2 00 00 25      LOAD_MONSTER #37,[00C2],#37
    // With the trace's c1=6 / c2=4 both groups load, so the roster is two entries, not one.
    expect(turn.monsters).toEqual([
      { monsterId: 0x34, count: 6, picBlockId: 0x34 },
      { monsterId: 0x25, count: 4, picBlockId: 0x25 },
    ]);
  });

  it('does not replay CampInterrupted after the retail post-combat flag is set', async () => {
    const path = new URL('../../../The Dark Queen of Krynn/DISK3/ECL.GLB', import.meta.url);
    const archive = decodeEclGlb(new Uint8Array(await readFile(path)), 'ECL.GLB');
    const session = new DqkArea5OverlandSession(archive.blockSourceById(5)!, { x: 29, y: 2 });
    session.step('south-east');
    session.memory.set(0x003a, 1);

    expect(session.beginCampInterrupted(240)).toBeNull();
  });

  it('pins the browser CampInterrupted instruction trace before its combat yield', async () => {
    const path = new URL('../../../The Dark Queen of Krynn/DISK3/ECL.GLB', import.meta.url);
    const archive = decodeEclGlb(new Uint8Array(await readFile(path)), 'ECL.GLB');
    const session = new DqkArea5OverlandSession(archive.blockSourceById(5)!, { x: 29, y: 2 });
    session.step('south-east');
    const vm = session.beginCampInterrupted(240);
    expect(vm).toBeTruthy();
    const trace: string[] = [];
    for (let guard = 0; guard < 256; guard++) {
      const result = vm!.step();
      if (result.instruction && ['RANDOM', 'ADD', 'PARLAY', 'LOAD_MONSTER', 'COMBAT'].includes(result.instruction.mnemonic)) {
        trace.push(`${result.instruction.vaddr.toString(16)} ${result.instruction.mnemonic} c1=${session.memory.get(0x00c1)} c2=${session.memory.get(0x00c2)} rng=${vm!.rngState.toString(16)}`);
      }
      if (result.status === 'combat') break;
    }
    expect(trace).toEqual([
      '841c ADD c1=3 c2=2 rng=1234',
      '9526 RANDOM c1=3 c2=2 rng=ac49803',
      '952c RANDOM c1=3 c2=2 rng=f546dd86',
      '9132 RANDOM c1=3 c2=2 rng=8f61972d',
      '9164 PARLAY c1=3 c2=2 rng=8f61972d',
      '9167 RANDOM c1=1 c2=2 rng=2a048ea8',
      '916d ADD c1=6 c2=2 rng=2a048ea8',
      '9176 RANDOM c1=6 c2=1 rng=1de921e7',
      '917c ADD c1=6 c2=4 rng=1de921e7',
      // Exposed by the corrected four-operand Gen2 TREASURE frame — see the roster case above.
      '91ae LOAD_MONSTER c1=6 c2=4 rng=1de921e7',
      '91b7 LOAD_MONSTER c1=6 c2=4 rng=1de921e7',
      '91cf COMBAT c1=6 c2=4 rng=1de921e7',
    ]);
  });
});
