/**
 * ECL VM tests (M2.S2).
 *
 * 1) Synthetic blocks exercising the confirmed core: GOTO, GOSUB/RETURN, the
 *    COMPARE→IF_* branch pattern (taken and skipped), SAVE/arithmetic into the
 *    address-keyed memory model, host effects (PRINT/PICTURE), input pause/resume,
 *    COMBAT pause, and NEWECL chaining.
 * 2) Golden: run the REAL CoK ECL1 block 18 (the area-transition script from research
 *    §4.2) and assert the VM reproduces its branch decision and NEWECL chain target
 *    given seeded area flags (skips cleanly when game data is absent).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EclVm, runEclChain, readDaxDataBlocks, parseEclHeader, ECL_HEADER_LEN, ECL_VBASE, ECL_GEN2, encodeEclString } from '../src/index.js';

/** Build a block: 22-byte header (magic const) + body bytes (body[0] is vaddr 0x8014). */
function block(...body: number[]): Uint8Array {
  const raw = new Uint8Array(ECL_HEADER_LEN + body.length);
  raw[0] = 0x88; raw[1] = 0x13; raw[2] = 0x01; raw[3] = 0x01; // magic = 0x1388
  raw.set(body, ECL_HEADER_LEN);
  return raw;
}

function gen2Block(...body: number[]): Uint8Array {
  const raw = new Uint8Array(ECL_GEN2.headerLen + body.length);
  for (let slot = 0; slot < 5; slot++) {
    const off = slot * 4;
    raw[off] = 0x01;
    raw[off + 1] = 0x01;
    raw[off + 2] = 0x14;
    raw[off + 3] = 0x80;
  }
  raw.set(body, ECL_GEN2.headerLen);
  return raw;
}

// Operand encodings used below:
//   imm(v)      -> code 0x00, high v                      (2 bytes)
//   addr(w)     -> code 0x01, high lo, val hi  (word=w)   (3 bytes)
const imm = (v: number) => [0x00, v & 0xff];
const imm16 = (v: number) => [0x02, v & 0xff, (v >> 8) & 0xff];
const addr = (w: number) => [0x01, w & 0xff, (w >> 8) & 0xff];
const strAddr = (w: number) => [0x81, w & 0xff, (w >> 8) & 0xff];
const str = (text: string) => {
  const packed = encodeEclString(text);
  return [0x80, packed.length, ...packed];
};

function encounterMenuBody(
  actionValues: readonly number[],
  opts: { dest?: number; fleeThreshold?: number; monsterFleeThreshold?: number } = {},
): number[] {
  const dest = opts.dest ?? 0x4c20;
  const fleeThreshold = opts.fleeThreshold ?? 5;
  const monsterFleeThreshold = opts.monsterFleeThreshold ?? 5;
  return [
    0x29,
    ...imm(9), // sprite block
    ...imm(3), // max encounter distance
    ...imm(5), // pic block
    ...addr(dest),
    ...imm(actionValues[0] ?? 0),
    ...imm(actionValues[1] ?? 0),
    ...imm(actionValues[2] ?? 0),
    ...imm(actionValues[3] ?? 0),
    ...imm(actionValues[4] ?? 0),
    ...imm(0), ...imm(0), ...imm(0), // text slots; string-table refs are host-resolved later
    ...imm(fleeThreshold),
    ...imm(monsterFleeThreshold),
  ];
}

describe('EclVm — core control flow', () => {
  it('runs straight to EXIT', () => {
    const vm = new EclVm(block(0x00)); // EXIT
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.done).toBe(true);
  });

  it('SAVE writes an immediate into the address-keyed memory', () => {
    // SAVE #42, addr:0x4c00 ; EXIT
    const vm = new EclVm(block(0x09, ...imm(42), ...addr(0x4c00), 0x00));
    vm.run();
    expect(vm.memory.get(0x4c00)).toBe(42);
  });

  it('reads operand code 0x02 as a 16-bit immediate, without reading the named address', () => {
    const vm = new EclVm(block(0x09, ...imm16(0x01b8), ...addr(0x4c00), 0x00), {
      memory: new Map([[0x01b8, 7]]),
    });
    expect(vm.run().status).toBe('exited');
    expect(vm.memory.get(0x4c00)).toBe(0x01b8);
    expect(vm.memory.get(0x01b8)).toBe(7);
  });

  it('allows an opt-in validated inclusive host roll for title-specific RANDOM handlers', () => {
    const maxima: number[] = [];
    const vm = new EclVm(
      block(0x08, ...imm(1), ...addr(0x4c00), 0x08, ...imm(100), ...addr(0x4c02), 0x00),
      {
        rollRandomInclusive: (maximumInclusive) => {
          maxima.push(maximumInclusive);
          return maximumInclusive;
        },
      },
    );
    vm.run();
    expect(maxima).toEqual([1, 100]);
    expect(vm.memory.get(0x4c00)).toBe(1);
    expect(vm.memory.get(0x4c02)).toBe(100);

    const invalid = new EclVm(
      block(0x08, ...imm(1), ...addr(0x4c00), 0x00),
      { rollRandomInclusive: () => 2 },
    );
    expect(() => invalid.run()).toThrow(/inclusive RANDOM #1 returned invalid value 2/);

    const unprovenBoundary = new EclVm(
      block(0x08, ...imm(255), ...addr(0x4c00), 0x00),
      { rollRandomInclusive: () => 0 },
    );
    expect(() => unprovenBoundary.run()).toThrow(/does not model operand 255/);
  });

  it('GOTO jumps past an instruction to a virtual address', () => {
    // Layout: GOTO(20..23) ; SAVE #99(24..29) ; SAVE #7(30..35) ; EXIT(36).
    // GOTO 0x801E (= offset 30) skips the SAVE #99 and lands on SAVE #7 → mem = 7.
    const vm = new EclVm(
      block(
        0x01, 0x01, 0x1e, 0x80, // GOTO 0x801E
        0x09, ...imm(99), ...addr(0x4c00), // skipped
        0x09, ...imm(7), ...addr(0x4c00), // target
        0x00,
      ),
    );
    vm.run();
    expect(vm.memory.get(0x4c00)).toBe(7);
  });

  it('takes an IF branch when the comparison holds', () => {
    // COMPARE addr:0x4c00, #1 ; IF= ; SAVE #5,0x4c10 ; SAVE #9,0x4c11 ; EXIT
    // mem[0x4c00]=1 → equal → guarded SAVE #5 runs, then SAVE #9 runs too.
    const vm = new EclVm(
      block(
        0x03, ...addr(0x4c00), ...imm(1), // COMPARE
        0x16, // IF=
        0x09, ...imm(5), ...addr(0x4c10), // guarded SAVE #5
        0x09, ...imm(9), ...addr(0x4c11), // SAVE #9
        0x00,
      ),
      { memory: new Map([[0x4c00, 1]]) },
    );
    vm.run();
    expect(vm.memory.get(0x4c10)).toBe(5);
    expect(vm.memory.get(0x4c11)).toBe(9);
  });

  it('skips the guarded instruction when the comparison fails', () => {
    // mem[0x4c00]=0 → not equal → guarded SAVE #5 is SKIPPED, SAVE #9 still runs.
    const vm = new EclVm(
      block(
        0x03, ...addr(0x4c00), ...imm(1), // COMPARE 0x4c00 vs 1
        0x16, // IF=
        0x09, ...imm(5), ...addr(0x4c10), // guarded — skipped
        0x09, ...imm(9), ...addr(0x4c11), // runs
        0x00,
      ),
      { memory: new Map([[0x4c00, 0]]) },
    );
    vm.run();
    expect(vm.memory.has(0x4c10)).toBe(false);
    expect(vm.memory.get(0x4c11)).toBe(9);
  });

  // COMPARE_AND (0x14): COAB `CMD_CompareAnd` (sub_26B0C) sets compare_flags[0] (==) iff
  // BOTH operand pairs are equal, else compare_flags[1] (!=) — every other flag stays false.
  // Block: COMPARE_AND [0x4c00],#1,[0x4c01],#2 ; <IF> ; SAVE #5,0x4c10 ; SAVE #9,0x4c11 ; EXIT.
  const compareAndBlock = (ifOpcode: number) =>
    block(
      0x14, ...addr(0x4c00), ...imm(1), ...addr(0x4c01), ...imm(2), // COMPARE_AND a,b,c,d
      ifOpcode,
      0x09, ...imm(5), ...addr(0x4c10), // guarded SAVE #5
      0x09, ...imm(9), ...addr(0x4c11), // SAVE #9 (always)
      0x00,
    );

  it('COMPARE_AND + IF_EQ passes only when BOTH pairs are equal', () => {
    // mem[0x4c00]=1, mem[0x4c01]=2 → (1==1) AND (2==2) → IF_EQ guarded SAVE runs.
    const ok = new EclVm(compareAndBlock(0x16), { memory: new Map([[0x4c00, 1], [0x4c01, 2]]) });
    ok.run();
    expect(ok.memory.get(0x4c10)).toBe(5);

    // Second pair mismatches (2 ≠ 99) → IF_EQ skips the guarded SAVE; SAVE #9 still runs.
    const no = new EclVm(compareAndBlock(0x16), { memory: new Map([[0x4c00, 1], [0x4c01, 99]]) });
    no.run();
    expect(no.memory.has(0x4c10)).toBe(false);
    expect(no.memory.get(0x4c11)).toBe(9);
  });

  it('COMPARE_AND + IF_NE passes when the pairs are NOT both equal', () => {
    const vm = new EclVm(compareAndBlock(0x17), { memory: new Map([[0x4c00, 1], [0x4c01, 99]]) });
    vm.run();
    expect(vm.memory.get(0x4c10)).toBe(5);
  });

  it('COMPARE_AND sets ONLY the == flag — IF_LE/IF_GE do not spuriously pass on a match', () => {
    // Regression guard: a naive {left:0,right:0} encoding would make IF_LE/IF_GE pass here.
    // COAB sets compare_flags[0] alone, so an ordering IF after a matching COMPARE_AND SKIPS.
    const le = new EclVm(compareAndBlock(0x1a), { memory: new Map([[0x4c00, 1], [0x4c01, 2]]) }); // IF_LE
    le.run();
    expect(le.memory.has(0x4c10)).toBe(false);

    const ge = new EclVm(compareAndBlock(0x1b), { memory: new Map([[0x4c00, 1], [0x4c01, 2]]) }); // IF_GE
    ge.run();
    expect(ge.memory.has(0x4c10)).toBe(false);
  });

  it('GOSUB/RETURN call and return', () => {
    // GOSUB sub ; SAVE #1,0x4c00 ; EXIT ; sub: SAVE #2,0x4c01 ; RETURN
    // header22: GOSUB(4b)=22..25; SAVE(6b)=26..31; EXIT=32; sub SAVE(6b)=33..38; RETURN=39
    // sub vaddr = ECL_VBASE + 33 = 0x801F. Target the GOSUB at that vaddr.
    const subOff = ECL_HEADER_LEN + 4 + 6 + 1; // 33
    const subV = ECL_VBASE + subOff;
    const vm = new EclVm(
      block(
        0x02, 0x01, subV & 0xff, (subV >> 8) & 0xff, // GOSUB sub
        0x09, ...imm(1), ...addr(0x4c00), // SAVE #1 after return
        0x00, // EXIT
        0x09, ...imm(2), ...addr(0x4c01), // sub: SAVE #2
        0x13, // RETURN
      ),
    );
    vm.run();
    expect(vm.memory.get(0x4c01)).toBe(2); // sub ran
    expect(vm.memory.get(0x4c00)).toBe(1); // returned and continued
  });

  it('emits PRINT and PICTURE effects without pausing', () => {
    const vm = new EclVm(
      block(
        0x0e, ...imm(12), // PICTURE 12
        0x11, 0x80, 7, // PRINT strref 7
        0x00,
      ),
    );
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects).toContainEqual({ type: 'picture', id: 12 });
    expect(r.effects.some((e) => e.type === 'print' && e.stringRef === 7)).toBe(true);
  });

  it('keeps 0x81 runtime memory-string PRINT operands aligned with following opcodes', () => {
    const vm = new EclVm(
      block(
        0x12, 0x81, 0x00, 0x7c, // PRINTCLEAR runtime string at 0x7C00
        0x11, 0x80, 0x0b, 0x80, 0x62, 0x4e, 0x11, 0x38, 0x01, 0x81, 0x44, 0x81, 0x42, 0xe0,
        0x1d, ...imm(1), // PARTYSTRENGTH #1 must be decoded after the inline PRINT
        0x00,
      ),
      { partyStrength: 240 },
    );
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.haltReason).toBeUndefined();
    expect(r.effects).toContainEqual(expect.objectContaining({
      type: 'print',
      clear: true,
      stringRef: 0x7c00,
    }));
    expect(r.effects).toContainEqual(expect.objectContaining({
      type: 'print',
      text: ' FINDS A TRAP.',
    }));
    expect(r.effects).toContainEqual(expect.objectContaining({
      type: 'partyStrength',
      strength: 240,
      threshold: 1,
    }));
  });

  it('pauses on INPUT and resumes with the supplied value', () => {
    // INPUT_NUMBER ignored,#dest ; EXIT
    const vm = new EclVm(
      block(
        0x0f, ...imm(0), ...addr(0x4c20),
        0x00,
      ),
    );
    const r1 = vm.run();
    expect(r1.status).toBe('awaiting-input');
    expect(r1.effects.some((e) => e.type === 'input' && e.mode === 'number')).toBe(true);
    const r2 = vm.resume(77);
    expect(r2.status).toBe('exited');
    expect(vm.memory.get(0x4c20)).toBe(77);
  });

  it('writes an upper-cased INPUT_STRING through operand 2 for runtime string comparison', () => {
    const vm = new EclVm(block(
      0x10, ...imm(6), ...strAddr(0x02ef),
      0x03, ...str('HANDS'), ...strAddr(0x02ef),
      0x16,
      0x09, ...imm(1), ...addr(0x4c20),
      0x00,
    ));
    const paused = vm.run();
    expect(paused.effects).toContainEqual(expect.objectContaining({
      type: 'input', mode: 'string', maxLength: 6, destAddr: 0x02ef,
    }));
    const resumed = vm.resume('hands');
    expect(resumed.status).toBe('exited');
    expect(vm.memory.get(0x02ef)).toBe('H'.charCodeAt(0));
    expect(vm.memory.get(0x02f4)).toBe(0);
    expect(vm.memory.get(0x4c20)).toBe(1);
  });

  it('VERTICAL_MENU resumes into its destination operand for later branches', () => {
    const vm = new EclVm(
      block(
        0x15, ...addr(0x4c20), ...imm(0), ...imm(2), ...imm(0), ...imm(0),
        0x03, ...addr(0x4c20), ...imm(1),
        0x16,
        0x09, ...imm(9), ...addr(0x4c21),
        0x00,
      ),
    );
    const paused = vm.run();
    expect(paused.status).toBe('awaiting-input');
    expect(paused.effects).toContainEqual(expect.objectContaining({
      type: 'menu',
      style: 'vertical',
      destAddr: 0x4c20,
    }));

    const resumed = vm.resume(1);
    expect(resumed.status).toBe('exited');
    expect(vm.memory.get(0x4c20)).toBe(1);
    expect(vm.memory.get(0x4c21)).toBe(9);
  });

  it('HORIZONTAL_MENU resumes into its destination operand for later branches', () => {
    const vm = new EclVm(
      block(
        0x2b, ...addr(0x4c30), ...imm(3), ...imm(0), ...imm(0), ...imm(0),
        0x03, ...addr(0x4c30), ...imm(2),
        0x16,
        0x09, ...imm(7), ...addr(0x4c31),
        0x00,
      ),
    );
    const paused = vm.run();
    expect(paused.status).toBe('awaiting-input');
    expect(paused.effects).toContainEqual(expect.objectContaining({
      type: 'menu',
      style: 'horizontal',
      destAddr: 0x4c30,
    }));

    const resumed = vm.resume(2);
    expect(resumed.status).toBe('exited');
    expect(vm.memory.get(0x4c30)).toBe(2);
    expect(vm.memory.get(0x4c31)).toBe(7);
  });

  it('pauses on COMBAT and resumes', () => {
    const vm = new EclVm(block(0x24, 0x09, ...imm(3), ...addr(0x4c00), 0x00));
    const r1 = vm.run();
    expect(r1.status).toBe('combat');
    expect(r1.effects.some((e) => e.type === 'combat')).toBe(true);
    const r2 = vm.resume();
    expect(r2.status).toBe('exited');
    expect(vm.memory.get(0x4c00)).toBe(3);
  });

  it('queues LOAD_MONSTER groups and surfaces them in the COMBAT effect', () => {
    // LOAD_MONSTER id=9,copies=3,pic=5 ; LOAD_MONSTER id=19,copies=1,pic=2 ; COMBAT ; EXIT
    const vm = new EclVm(
      block(
        0x0b, ...imm(9), ...imm(3), ...imm(5),
        0x0b, ...imm(19), ...imm(1), ...imm(2),
        0x24,
        0x00,
      ),
    );
    const r = vm.run();
    expect(r.status).toBe('combat');
    const combat = r.effects.find((e) => e.type === 'combat');
    expect(combat).toBeDefined();
    expect(combat!.type === 'combat' && combat!.monsters).toEqual([
      { monsterId: 9, count: 3, picBlockId: 5 },
      { monsterId: 19, count: 1, picBlockId: 2 },
    ]);
    // The roster is consumed by COMBAT — a second COMBAT would start empty.
    expect(vm.resume().status).toBe('exited');
  });

  it('ADD_NPC (0x36) surfaces an addNpc effect and keeps running (M35.S1)', () => {
    // ADD_NPC #48,#100 ; ADD_NPC #49,#100 ; EXIT (COAB CMD_AddNPC, ovr003.cs:1769)
    const vm = new EclVm(
      block(
        0x36, ...imm(48), ...imm(100),
        0x36, ...imm(49), ...imm(100),
        0x00,
      ),
    );
    const r = vm.run();
    expect(r.status).toBe('exited');
    const joins = r.effects.filter((e) => e.type === 'addNpc');
    expect(joins).toEqual([
      { type: 'addNpc', npcId: 48, morale: 100 },
      { type: 'addNpc', npcId: 49, morale: 100 },
    ]);
  });

  it('surfaces host-facing script effects as structured effects instead of unhandled', () => {
    const vm = new EclVm(
      block(
        0x27, ...imm(1), ...imm(2), ...imm(3), ...imm(4), ...imm(5), ...imm(6), ...imm(7), ...imm(8),
        0x28, ...imm(9), ...imm(10), ...imm(11),
        0x2d, ...imm(50),
        0x2e, ...imm(12), ...imm(13), ...imm(14), ...imm(15), ...imm(16),
        0x34, ...imm(5), ...imm(2),
        0x1f, ...imm(77), ...imm(78),
        0x00,
      ),
    );

    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects.filter((e) => e.type === 'scriptEffect').map((e) => ({
      kind: e.type === 'scriptEffect' ? e.kind : '',
      opcode: e.type === 'scriptEffect' ? e.opcode : 0,
      operands: e.type === 'scriptEffect' ? e.operands : [],
    }))).toEqual([
      { kind: 'unknown1f', opcode: 0x1f, operands: [77, 78] },
    ]);
    expect(r.effects).toContainEqual(expect.objectContaining({
      type: 'call',
      routineId: 0x8033,
      operand: 50,
    }));
    expect(r.effects.some((e) => e.type === 'unhandled' && [0x1f, 0x27, 0x28, 0x2d, 0x2e, 0x34].includes(e.opcode))).toBe(false);
    expect(r.effects).toContainEqual(expect.objectContaining({
      type: 'treasure',
      coins: { copper: 1, electrum: 2, silver: 3, gold: 4, platinum: 5, gems: 6, jewelry: 7 },
      itemBlockId: 8,
      itemSource: 'itemBlock',
      randomItemCount: 0,
      operands: [1, 2, 3, 4, 5, 6, 7, 8],
    }));
    expect(r.effects).toContainEqual(expect.objectContaining({
      type: 'rob',
      scope: 'party',
      moneyLossPercent: 10,
      moneyKeepPercent: 90,
      itemRobChance: 11,
      operands: [9, 10, 11],
    }));
    expect(r.effects).toContainEqual(expect.objectContaining({
      type: 'damage',
      dice: { count: 13, sides: 14, bonus: 15 },
      policy: { mode: 'attackRoll', target: 'random', attempts: 12, toHitBonus: 16 },
      operands: [12, 13, 14, 15, 16],
    }));
    expect(r.effects).toContainEqual(expect.objectContaining({
      type: 'eclClock',
      timeStep: 5,
      timeSlot: 2,
      before: [0, 0, 0, 0, 0, 0, 0],
      after: [0, 0, 5, 0, 0, 0, 0],
      elapsedMinutes: 50,
      yearRollovers: 0,
    }));
    expect(vm.gameClock).toEqual([0, 0, 5, 0, 0, 0, 0]);
  });

  it('DAMAGE decodes save-based target policies without mutating party HP', () => {
    const vm = new EclVm(
      block(
        0x2e, ...imm(0x85), ...imm(2), ...imm(6), ...imm(3), ...imm(0x85),
        0x2e, ...imm(0xe5), ...imm(1), ...imm(8), ...imm(0), ...imm(4),
        0x00,
      ),
    );

    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects.filter((e) => e.type === 'damage')).toEqual([
      expect.objectContaining({
        type: 'damage',
        dice: { count: 2, sides: 6, bonus: 3 },
        policy: {
          mode: 'savingThrow',
          target: 'selected',
          saveBonus: 5,
          saveType: 'spell',
          saveTypeId: 4,
          damageOnSave: 'none',
        },
        operands: [0x85, 2, 6, 3, 0x85],
      }),
      expect.objectContaining({
        type: 'damage',
        dice: { count: 1, sides: 8, bonus: 0 },
        policy: { mode: 'automatic', target: 'party', reason: 'noSaveFlag' },
        operands: [0xe5, 1, 8, 0, 4],
      }),
    ]);
  });

  it('CALL decodes known COAB routine ids from the raw operand word, not rvalue memory', () => {
    const vm = new EclVm(
      block(
        0x2d, ...addr(0x2e10), // (0x2e10 - 0x7fff) & 0xffff = 0xae11
        0x09, ...imm(7), ...addr(0x0100),
        0x00,
      ),
      { memory: new Map([[0x2e10, 0x1234]]) },
    );

    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects).toContainEqual(expect.objectContaining({
      type: 'call',
      routineId: 0xae11,
      routine: 'redrawDungeonView',
      operand: 0x2e10,
    }));
    expect(r.effects.some((e) => e.type === 'scriptEffect' && e.opcode === 0x2d)).toBe(false);
    expect(vm.memory.get(0x0100)).toBe(7);
  });

  it('CALL snapshots temporal memory for host-side presentation routines', () => {
    const vm = new EclVm(block(
      0x09, ...imm(4), ...addr(0xc04b),
      0x09, ...imm(7), ...addr(0xc04c),
      0x09, ...imm(1), ...addr(0xc04d),
      0x2d, ...addr(0x2dcb),
      0x04, ...imm(1), ...addr(0xc04b), ...addr(0xc04b),
      0x2d, ...addr(0x2e10),
      0x00,
    ));

    const calls = vm.run().effects.filter((e): e is Extract<EclEffect, { type: 'call' }> => e.type === 'call');
    expect(calls.map((call) => call.routine)).toEqual(['redrawDungeonView', 'redrawDungeonView']);
    expect(calls.map((call) => new Map(call.memory).get(0xc04b))).toEqual([4, 5]);
    expect(new Map(calls[0].memory)).toEqual(new Map([[0xc04b, 4], [0xc04c, 7], [0xc04d, 1]]));
  });

  it('CALL invokes the host synchronously before the following ECL instruction', () => {
    const memory = new Map<number, number>([[0xc04b, 4]]);
    const observed: Array<{ routine: string | undefined; before: number | undefined }> = [];
    const vm = new EclVm(
      block(
        0x2d, ...addr(0xc01e), // (0xc01e - 0x7fff) = 0x401f movePositionForward
        0x09, ...addr(0xc04b), ...addr(0x0100), // copy the host-updated X into a script word
        0x00,
      ),
      {
        memory,
        onCall: (effect, liveMemory) => {
          observed.push({ routine: effect.routine, before: new Map(effect.memory).get(0xc04b) });
          liveMemory.set(0xc04b, 9);
        },
      },
    );

    const result = vm.run();
    expect(result.status).toBe('exited');
    expect(observed).toEqual([{ routine: 'movePositionForward', before: 4 }]);
    expect(memory.get(0xc04b)).toBe(9);
    expect(memory.get(0x0100)).toBe(9); // proves the callback ran before the following SAVE
  });

  it('CALL may synchronously return a comparison pair for the immediately following IF', () => {
    const script = block(
      0x2d, ...addr(0x080c),
      0x16, // IF_EQ guards the following SAVE
      0x09, ...imm(7), ...addr(0x0100),
      0x00,
    );
    const equal = new EclVm(script, {
      onCall: () => ({ comparison: { left: 1, right: 1 } }),
    });
    const unequal = new EclVm(script, {
      onCall: () => ({ comparison: { left: 0, right: 1 } }),
    });
    const legacyVoid = new EclVm(script, {
      onCall: () => { /* Existing memory-only/void callbacks do not touch comparison flags. */ },
    });

    expect(equal.run().status).toBe('exited');
    expect(equal.memory.get(0x0100)).toBe(7);
    expect(equal.compareFlags).toEqual([true, false, false, false, true, true]);
    expect(unequal.run().status).toBe('exited');
    expect(unequal.memory.has(0x0100)).toBe(false);
    expect(unequal.compareFlags).toEqual([false, true, true, false, true, false]);
    expect(legacyVoid.run().status).toBe('exited');
    expect(legacyVoid.memory.has(0x0100)).toBe(false);
    expect(legacyVoid.compareFlags).toEqual([false, false, false, false, false, false]);
  });

  it('CALL decodes low raw words as direct routine ids in the Gen2 DQK dialect', () => {
    const vm = new EclVm(
      gen2Block(
        0x2d, ...addr(0x0001),
        0x2d, ...addr(0x0002),
        0x00,
      ),
      { dialect: ECL_GEN2 },
    );

    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects.filter((e) => e.type === 'call')).toEqual([
      expect.objectContaining({
        type: 'call',
        routineId: 1,
        routine: 'setupDuelAttack',
        operand: 0x0001,
      }),
      expect.objectContaining({
        type: 'call',
        routineId: 2,
        routine: 'setupDuelDefend',
        operand: 0x0002,
      }),
    ]);
    expect(r.effects.some((e) => e.type === 'scriptEffect' && e.opcode === 0x2d)).toBe(false);
  });

  it('CALL preserves unknown raw operand words instead of rvalue memory', () => {
    const vm = new EclVm(
      block(
        0x2d, ...addr(0x9000),
        0x00,
      ),
      { memory: new Map([[0x9000, 0x1234]]) },
    );

    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects).toContainEqual(expect.objectContaining({
      type: 'call',
      routineId: 0x1001,
      operand: 0x9000,
    }));
    expect(r.effects.some((e) => e.type === 'scriptEffect' && e.opcode === 0x2d)).toBe(false);
  });

  it('PROGRAM emits an explicit host dispatch effect while PROTECTION and DUMP are clean-room no-ops', () => {
    const vm = new EclVm(
      block(
        0x38, ...imm(0),
        0x3c, ...imm(35),
        0x3e,
        0x09, ...imm(77), ...addr(0x4c20),
        0x00,
      ),
    );

    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects).toContainEqual(expect.objectContaining({
      type: 'program',
      programId: 0,
    }));
    expect(r.effects.some((e) => e.type === 'scriptEffect')).toBe(false);
    expect(r.effects.some((e) => e.type === 'unhandled' && [0x38, 0x3c, 0x3e].includes(e.opcode))).toBe(false);
    expect(vm.memory.get(0x4c20)).toBe(77);
  });

  it('SETUP_MONSTER records encounter approach art and clamps host distance to the script maximum', () => {
    const vm = new EclVm(
      block(0x0c, ...imm(9), ...imm(3), ...imm(5), 0x00),
      { encounterDistance: 7 },
    );
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects).toContainEqual(expect.objectContaining({
      type: 'encounterSetup',
      setup: { spriteId: 9, maxDistance: 3, picId: 5, distance: 3 },
    }));
  });

  it('APPROACH decrements active encounter distance without going below zero', () => {
    const vm = new EclVm(
      block(
        0x0c, ...imm(9), ...imm(3), ...imm(5),
        0x0d,
        0x0d,
        0x00,
      ),
      { encounterDistance: 1 },
    );
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects.filter((e) => e.type === 'encounterSetup').map((e) => (
      e.type === 'encounterSetup' ? e.setup.distance : -1
    ))).toEqual([1, 0, 0]);
  });

  it('ENCOUNTER_MENU offers ADVANCE while distant and COMBAT writes the COAB result code', () => {
    const vm = new EclVm(
      block(...encounterMenuBody([0, 0, 0, 0, 0]), 0x00),
      { encounterDistance: 2, inDungeon: true },
    );

    const paused = vm.run();
    expect(paused.status).toBe('awaiting-input');
    expect(paused.effects).toContainEqual(expect.objectContaining({
      type: 'encounterSetup',
      setup: { spriteId: 9, maxDistance: 3, picId: 5, distance: 2 },
    }));
    expect(paused.effects).toContainEqual(expect.objectContaining({
      type: 'menu',
      style: 'encounter',
      items: ['COMBAT', 'WAIT', 'FLEE', 'ADVANCE'],
    }));

    const resumed = vm.resume(0);
    expect(resumed.status).toBe('exited');
    expect(vm.memory.get(0x4c20)).toBe(1);
  });

  it('ENCOUNTER_MENU ADVANCE decrements distance and then exposes PARLAY at distance zero', () => {
    const vm = new EclVm(
      block(...encounterMenuBody([0, 0, 0, 1, 4]), 0x00),
      { encounterDistance: 1, inDungeon: true },
    );

    expect(vm.run().status).toBe('awaiting-input');
    const advanced = vm.resume(3);
    expect(advanced.status).toBe('awaiting-input');
    expect(advanced.effects).toContainEqual(expect.objectContaining({
      type: 'encounterSetup',
      setup: { spriteId: 9, maxDistance: 3, picId: 5, distance: 0 },
    }));
    expect(advanced.effects).toContainEqual(expect.objectContaining({
      type: 'menu',
      style: 'encounter',
      items: ['COMBAT', 'WAIT', 'FLEE', 'PARLAY'],
    }));

    const parlay = vm.resume(3);
    expect(parlay.status).toBe('exited');
    expect(vm.memory.get(0x4c20)).toBe(3);
  });

  it('ENCOUNTER_MENU maps outdoor PARLAY display choice to the fifth action slot', () => {
    const vm = new EclVm(
      block(...encounterMenuBody([0, 0, 0, 1, 2]), 0x00),
      { encounterDistance: 2, inDungeon: false },
    );

    const paused = vm.run();
    expect(paused.status).toBe('awaiting-input');
    expect(paused.effects).toContainEqual(expect.objectContaining({
      type: 'menu',
      style: 'encounter',
      items: ['COMBAT', 'WAIT', 'FLEE', 'PARLAY'],
    }));
    const resumed = vm.resume(3);
    expect(resumed.status).toBe('exited');
    expect(vm.memory.get(0x4c20)).toBe(0);
  });

  it('ENCOUNTER_MENU FLEE result is gated by party minimum movement like COAB', () => {
    const slow = new EclVm(
      block(...encounterMenuBody([0, 0, 0, 0, 0], { dest: 0x4c20, fleeThreshold: 5 }), 0x00),
      { partyMovements: [3], encounterDistance: 0 },
    );
    slow.run();
    slow.resume(2);
    expect(slow.memory.get(0x4c20)).toBe(1);

    const fast = new EclVm(
      block(...encounterMenuBody([0, 0, 0, 0, 0], { dest: 0x4c21, fleeThreshold: 5 }), 0x00),
      { partyMovements: [6], encounterDistance: 0 },
    );
    fast.run();
    fast.resume(2);
    expect(fast.memory.get(0x4c21)).toBe(2);
  });

  it('PARLAY (0x2c) pauses for an attitude choice and writes the selected mapped value', () => {
    const vm = new EclVm(
      block(
        0x2c, ...imm(10), ...imm(20), ...imm(30), ...imm(40), ...imm(50), ...addr(0x4c20),
        0x00,
      ),
    );

    const paused = vm.run();
    expect(paused.status).toBe('awaiting-input');
    expect(paused.effects).toContainEqual(expect.objectContaining({
      type: 'menu',
      style: 'parlay',
      items: ['HAUGHTY', 'SLY', 'NICE', 'MEEK', 'ABUSIVE'],
    }));

    const resumed = vm.resume(3);
    expect(resumed.status).toBe('exited');
    expect(vm.memory.get(0x4c20)).toBe(40);
  });

  it('CLEAR_MONSTERS empties a queued roster before COMBAT', () => {
    const vm = new EclVm(
      block(
        0x0b, ...imm(9), ...imm(2), ...imm(0), // queue something
        0x1c, // CLEAR_MONSTERS
        0x24, // COMBAT
        0x00,
      ),
    );
    const r = vm.run();
    expect(r.status).toBe('combat');
    const combat = r.effects.find((e) => e.type === 'combat');
    expect(combat!.type === 'combat' && combat!.monsters).toEqual([]);
  });

  // PARTYSTRENGTH (0x1d): set the comparison register from {host party-strength, operand threshold}
  // for the following IF_*. The real DQK pattern is `PARTYSTRENGTH thr ; IF_GE ; <gated>` (research
  // C4.2b-2b-2b §4) — a strength *gate*, NOT a roster auto-fill. Block: PARTYSTRENGTH 128 ; IF_GE ;
  // SAVE #5,0x4c10 (gated) ; SAVE #9,0x4c11 (always) ; EXIT.
  const partyStrengthGate = () =>
    block(
      0x1d, ...imm(128), // PARTYSTRENGTH threshold=128
      0x1b, // IF_GE (left >= right)
      0x09, ...imm(5), ...addr(0x4c10), // gated SAVE #5
      0x09, ...imm(9), ...addr(0x4c11), // always SAVE #9
      0x00,
    );

  it('PARTYSTRENGTH passes IF_GE when host strength ≥ threshold', () => {
    const vm = new EclVm(partyStrengthGate(), { partyStrength: 200 }); // 200 ≥ 128 → gate open
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.memory.get(0x4c10)).toBe(5); // gated instruction ran
    expect(vm.memory.get(0x4c11)).toBe(9);
    expect(r.effects).toContainEqual(
      expect.objectContaining({ type: 'partyStrength', strength: 200, threshold: 128 }),
    );
  });

  it('PARTYSTRENGTH fails IF_GE at the default strength 0 (gate stays shut)', () => {
    const vm = new EclVm(partyStrengthGate()); // default partyStrength 0; 0 ≥ 128 is false
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.memory.has(0x4c10)).toBe(false); // gated instruction skipped
    expect(vm.memory.get(0x4c11)).toBe(9); // unconditional one still ran
  });

  it('PARTYSTRENGTH reads its threshold from a memory variable operand', () => {
    // threshold comes from mem[0x4c00]=50; host strength 75 ≥ 50 → gate open.
    const vm = new EclVm(
      block(0x1d, ...addr(0x4c00), 0x1b, 0x09, ...imm(5), ...addr(0x4c10), 0x00),
      { partyStrength: 75, memory: new Map([[0x4c00, 50]]) },
    );
    vm.run();
    expect(vm.memory.get(0x4c10)).toBe(5);
  });

  it('PARTYSTRENGTH preserves a 0x81 runtime memory-string operand as a word rvalue', () => {
    const vm = new EclVm(block(0x1d, 0x81, 0x00, 0x7c, 0x00), { partyStrength: 0x7c00 });
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects).toContainEqual(
      expect.objectContaining({ type: 'partyStrength', strength: 0x7c00, threshold: 0x7c00 }),
    );
  });

  it('PARTY_SURPRISE writes deterministic no-ranger defaults in headless mode', () => {
    const vm = new EclVm(block(0x22, ...addr(0x4c20), ...addr(0x4c21), 0x00));
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.memory.get(0x4c20)).toBe(0);
    expect(vm.memory.get(0x4c21)).toBe(0);
    expect(r.effects).toEqual([]);
  });

  it('PARTY_SURPRISE writes ranger-present signal when the host supplies one', () => {
    const vm = new EclVm(block(0x22, ...addr(0x4c20), ...addr(0x4c21), 0x00), {
      partyHasRanger: true,
    });
    vm.run();
    expect(vm.memory.get(0x4c20)).toBe(1);
    expect(vm.memory.get(0x4c21)).toBe(0);
  });

  it('FIND_ITEM sets EQ only when a host-supplied party item type is present', () => {
    const found = new EclVm(
      block(0x32, ...imm(31), 0x16, 0x09, ...imm(5), ...addr(0x4c10), 0x00),
      { partyItemTypes: [31] },
    );
    found.run();
    expect(found.memory.get(0x4c10)).toBe(5);

    const absent = new EclVm(
      block(0x32, ...imm(31), 0x17, 0x09, ...imm(7), ...addr(0x4c11), 0x00),
    );
    absent.run();
    expect(absent.memory.get(0x4c11)).toBe(7);
  });

  it('DESTROY_ITEMS removes an item type from later FIND_ITEM queries', () => {
    const vm = new EclVm(
      block(
        0x40, ...imm(31),
        0x32, ...imm(31),
        0x17,
        0x09, ...imm(7), ...addr(0x4c11),
        0x00,
      ),
      { partyItemTypes: [31, 44] },
    );
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.memory.get(0x4c11)).toBe(7);
    expect(r.effects).toHaveLength(1);
    expect(r.effects[0]).toMatchObject({ type: 'destroyItems', itemTypeId: 31 });
  });

  it('DESTROY_ITEMS remains absent from FIND_ITEM after a NEWECL boundary', () => {
    const blocks = new Map([
      [1, block(0x40, ...imm(31), 0x20, ...imm(2))],
      [2, block(0x32, ...imm(31), 0x17, 0x09, ...imm(7), ...addr(0x4c11), 0x00)],
    ]);
    const result = runEclChain(1, (blockId) => blocks.get(blockId), { partyItemTypes: [31, 44] });
    expect(result.status).toBe('exited');
    expect(result.visited).toEqual([1, 2]);
    expect(result.memory.get(0x4c11)).toBe(7);
  });

  it('FIND_SPECIAL queries the selected-player affect set', () => {
    const found = new EclVm(
      block(0x3f, ...imm(12), 0x16, 0x09, ...imm(5), ...addr(0x4c10), 0x00),
      { selectedPlayerAffects: [12] },
    );
    found.run();
    expect(found.memory.get(0x4c10)).toBe(5);

    const absent = new EclVm(
      block(0x3f, ...imm(12), 0x17, 0x09, ...imm(7), ...addr(0x4c11), 0x00),
    );
    absent.run();
    expect(absent.memory.get(0x4c11)).toBe(7);
  });

  it('LOAD_CHARACTER selects the party-member affect set used by FIND_SPECIAL', () => {
    const vm = new EclVm(
      block(
        0x0a, ...imm(1),
        0x3f, ...imm(12),
        0x16,
        0x09, ...imm(5), ...addr(0x4c10),
        0x00,
      ),
      { partyMemberAffects: [[], [12]] },
    );
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.memory.get(0x4c10)).toBe(5);
    expect(r.effects).toEqual([]);
  });

  it('LOAD_CHARACTER masks the high bit and leaves the prior selection unchanged when the target is missing', () => {
    const vm = new EclVm(
      block(
        0x0a, ...imm(0x82), // low 7 bits = 2, missing in the supplied partyMemberAffects list
        0x3f, ...imm(12),
        0x16,
        0x09, ...imm(7), ...addr(0x4c11),
        0x00,
      ),
      { selectedPartyIndex: 1, partyMemberAffects: [[], [12]] },
    );
    vm.run();
    expect(vm.memory.get(0x4c11)).toBe(7);
  });

  it('LOAD_CHARACTER exposes selected-player in_combat through pseudo-field 0x7D00', () => {
    const vm = new EclVm(
      block(
        0x0a, ...imm(1),
        0x03, ...addr(0x7d00), ...imm(1),
        0x16,
        0x09, ...imm(5), ...addr(0x4c10),
        0x00,
      ),
      { partyMemberInCombat: [false, true] },
    );
    vm.run();
    expect(vm.memory.get(0x4c10)).toBe(5);
  });

  it('LOAD_CHARACTER reports one missed selected-player in_combat read as 0', () => {
    const vm = new EclVm(
      block(
        0x0a, ...imm(2),
        0x03, ...addr(0x7d00), ...imm(0),
        0x16,
        0x09, ...imm(5), ...addr(0x4c10),
        0x00,
      ),
      { selectedPartyIndex: 1, partyMemberInCombat: [false, true] },
    );
    vm.run();
    expect(vm.memory.get(0x4c10)).toBe(5);
  });

  it('LOAD_CHARACTER exposes selected-player thief skills through 0x7CA5..0x7CAC', () => {
    const vm = new EclVm(
      block(
        0x0a, ...imm(1),
        0x03, ...addr(0x7ca7), ...imm(42),
        0x16,
        0x09, ...imm(5), ...addr(0x4c10),
        0x00,
      ),
      { partyThiefSkills: [[0, 0, 0], [10, 20, 42]] },
    );
    vm.run();
    expect(vm.memory.get(0x4c10)).toBe(5);
  });

  it('FIND_ITEM and FIND_SPECIAL leave ordering flags clear', () => {
    const item = new EclVm(
      block(0x32, ...imm(31), 0x1a, 0x09, ...imm(5), ...addr(0x4c10), 0x00),
      { partyItemTypes: [31] },
    );
    item.run();
    expect(item.memory.has(0x4c10)).toBe(false);

    const special = new EclVm(
      block(0x3f, ...imm(12), 0x1b, 0x09, ...imm(7), ...addr(0x4c11), 0x00),
    );
    special.run();
    expect(special.memory.has(0x4c11)).toBe(false);
  });

  it('CHECKPARTY writes a party-affect presence flag to its fourth destination', () => {
    const vm = new EclVm(
      block(
        0x1e, ...addr(0x9f40), ...imm(12),
        ...addr(0x4c20), ...addr(0x4c21), ...addr(0x4c22), ...addr(0x4c23),
        0x00,
      ),
      { partyAffects: [12] },
    );
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.memory.get(0x4c20)).toBe(0);
    expect(vm.memory.get(0x4c21)).toBe(0);
    expect(vm.memory.get(0x4c22)).toBe(0);
    expect(vm.memory.get(0x4c23)).toBe(1);
    expect(r.effects).toEqual([]);
  });

  it('CHECKPARTY computes movement min, max, and average', () => {
    const vm = new EclVm(
      block(
        0x1e, ...addr(0x809e), ...imm(0),
        ...addr(0x4c20), ...addr(0x4c21), ...addr(0x4c22), ...addr(0x4c23),
        0x00,
      ),
      { partyMovements: [6, 12, 9] },
    );
    vm.run();
    expect(vm.memory.get(0x4c20)).toBe(6);
    expect(vm.memory.get(0x4c21)).toBe(12);
    expect(vm.memory.get(0x4c22)).toBe(9);
    expect(vm.memory.get(0x4c23)).toBe(0);
  });

  it('CHECKPARTY computes one of the eight thief-skill min, max, and average queries', () => {
    const vm = new EclVm(
      block(
        0x1e, ...addr(0x80a4), ...imm(0),
        ...addr(0x4c20), ...addr(0x4c21), ...addr(0x4c22), ...addr(0x4c23),
        0x00,
      ),
      { partyThiefSkills: [[10, 20], [30, 40], [20, 60]] },
    );
    vm.run();
    expect(vm.memory.get(0x4c20)).toBe(10);
    expect(vm.memory.get(0x4c21)).toBe(30);
    expect(vm.memory.get(0x4c22)).toBe(20);
    expect(vm.memory.get(0x4c23)).toBe(0);
  });

  it('CHECKPARTY writes zero statistics in headless empty-roster mode', () => {
    const vm = new EclVm(
      block(
        0x1e, ...addr(0x809e), ...imm(0),
        ...addr(0x4c20), ...addr(0x4c21), ...addr(0x4c22), ...addr(0x4c23),
        0x00,
      ),
    );
    vm.run();
    expect(vm.memory.get(0x4c20)).toBe(0);
    expect(vm.memory.get(0x4c21)).toBe(0);
    expect(vm.memory.get(0x4c22)).toBe(0);
    expect(vm.memory.get(0x4c23)).toBe(0);
  });

  it('SPELL writes 1-based spell slot and 0-based party index when the host spell list contains the spell', () => {
    const vm = new EclVm(
      block(0x3b, ...imm(22), ...addr(0x4c20), ...addr(0x4c21), 0x00),
      { partySpellLists: [[3, 4], [8, 22, 23]] },
    );
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.memory.get(0x4c20)).toBe(2);
    expect(vm.memory.get(0x4c21)).toBe(1);
    expect(r.effects).toEqual([]);
  });

  it('SPELL writes 0xFF and the last scanned party index when the spell is absent', () => {
    const vm = new EclVm(
      block(0x3b, ...imm(22), ...addr(0x4c20), ...addr(0x4c21), 0x00),
      { partySpellLists: [[3, 4], [8, 23]] },
    );
    vm.run();
    expect(vm.memory.get(0x4c20)).toBe(0xff);
    expect(vm.memory.get(0x4c21)).toBe(1);
  });

  it('SPELL uses 0xFF for both outputs in headless empty-roster mode', () => {
    const vm = new EclVm(block(0x3b, ...imm(22), ...addr(0x4c20), ...addr(0x4c21), 0x00));
    vm.run();
    expect(vm.memory.get(0x4c20)).toBe(0xff);
    expect(vm.memory.get(0x4c21)).toBe(0xff);
  });

  it('SURPRISE writes the COAB surprise result to memory cell 0x02CB', () => {
    // partyThreshold = arg4 + 2 - arg1 = 6, monsterThreshold = arg2 + 2 - arg3 = 0:
    // party side always passes its d6 check, monster side never does, so result = 1.
    const vm = new EclVm(block(0x23, ...imm(0), ...imm(0), ...imm(2), ...imm(4), 0x00));
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.memory.get(0x02cb)).toBe(1);
    expect(r.effects).toHaveLength(1);
    expect(r.effects[0]).toMatchObject({
      type: 'encounterSurprise',
      surprise: {
        args: [0, 0, 2, 4],
        partyThreshold: 6,
        monsterThreshold: 0,
        result: 1,
      },
    });
  });

  it('SURPRISE mirrors the original overwrite when both d6 checks pass', () => {
    // Both thresholds are 6, so both d6 checks pass. The COAB listing writes 3 first,
    // then immediately overwrites it with 2 on the second check.
    const vm = new EclVm(block(0x23, ...imm(0), ...imm(4), ...imm(0), ...imm(4), 0x00));
    const r = vm.run();
    expect(vm.memory.get(0x02cb)).toBe(2);
    const fx = r.effects.find((e) => e.type === 'encounterSurprise');
    expect(fx?.type === 'encounterSurprise' && fx.surprise.result).toBe(2);
  });

  it('GETTABLE copies a table cell at base + byte offset into the destination', () => {
    const vm = new EclVm(
      block(0x2a, ...addr(0x4c30), ...imm(3), ...addr(0x4c20), 0x00),
      { memory: new Map([[0x4c33, 0x66]]) },
    );
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.memory.get(0x4c20)).toBe(0x66);
    expect(r.effects).toEqual([]);
  });

  it('SAVE_TABLE writes a value to base + offset', () => {
    const vm = new EclVm(block(0x35, ...imm(0x77), ...addr(0x4c40), ...imm(4), 0x00));
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.memory.get(0x4c44)).toBe(0x77);
    expect(r.effects).toEqual([]);
  });

  it('chains via NEWECL and reports the target block id', () => {
    const vm = new EclVm(block(0x20, ...imm(68), 0x00)); // NEWECL #68
    const r = vm.run();
    expect(r.status).toBe('chain');
    expect(r.chainBlockId).toBe(68);
  });

  it('surfaces LOAD_FILES with the dungeon GEO block id', () => {
    // LOAD_FILES 34, 2, 255 ; EXIT  (operand 0 = GEO map block)
    const vm = new EclVm(block(0x21, ...imm(34), ...imm(2), ...imm(255), 0x00));
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects).toContainEqual({ type: 'loadFiles', geoBlockId: 34, operands: [34, 2, 255] });
  });

  it('surfaces LOAD_PIECES as a normal three-set area (no area flags set)', () => {
    // LOAD_PIECES 3, 4, 23 ; EXIT — with both area flags 0, the CMD_LoadFiles dispatch keeps
    // operand order: sets 1/2/3 ← blocks 3/4/23.
    const vm = new EclVm(block(0x37, ...imm(3), ...imm(4), ...imm(23), 0x00));
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects).toContainEqual({ type: 'loadPieces', setBlockIds: [3, 4, 23], operands: [3, 4, 23], twoSet: false });
  });

  it('LOAD_PIECES two-set area (both 0x4be7/0x4be8 flags set) skips set 2', () => {
    // Same operands, but pre-seed the two area flags non-zero → set 2 (block 4) is dropped to
    // the 0xFF Reset sentinel; sets 1/3 keep blocks 3/23.
    const vm = new EclVm(block(0x37, ...imm(3), ...imm(4), ...imm(23), 0x00), {
      memory: new Map([[0x4be7, 1], [0x4be8, 1]]),
    });
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects).toContainEqual({ type: 'loadPieces', setBlockIds: [3, 0xff, 23], operands: [3, 4, 23], twoSet: true });
  });

  it('LOAD_PIECES 0x7F on set 1 loads WALLDEF block 0 and resets sets 2/3', () => {
    const vm = new EclVm(block(0x37, ...imm(0x7f), ...imm(4), ...imm(23), 0x00));
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects).toContainEqual({ type: 'loadPieces', setBlockIds: [0x7f, 0xff, 0xff], operands: [0x7f, 4, 23], twoSet: false });
  });

  it('does arithmetic into the LAST operand (COAB dest = op3; SUBTRACT = op2 − op1)', () => {
    // Byte-verified from the real ECL: e.g. CoK block 34 `AND 0xc04f, #63, 0x7f79` writes the
    // result into the 3rd operand, and DQK area 30 `SUBTRACT #1, [0x0097], [0x0097]` decrements.
    // ADD #5, #6, [0x4c00] → 11
    let vm = new EclVm(block(0x04, ...imm(5), ...imm(6), ...addr(0x4c00), 0x00));
    vm.run();
    expect(vm.memory.get(0x4c00)).toBe(11);

    // SUBTRACT #1, #10, [0x4c00] → op2 − op1 = 10 − 1 = 9 (operand order is reversed for SUB).
    vm = new EclVm(block(0x05, ...imm(1), ...imm(10), ...addr(0x4c00), 0x00));
    vm.run();
    expect(vm.memory.get(0x4c00)).toBe(9);

    // AND #0xBD, #0x7F, [0x4c00] → 0x3D (the cell-descriptor masking pattern).
    vm = new EclVm(block(0x2f, ...imm(0xbd), ...imm(0x7f), ...addr(0x4c00), 0x00));
    vm.run();
    expect(vm.memory.get(0x4c00)).toBe(0x3d);
  });

  it('DIVIDE writes the quotient to op3 and the retail remainder alias to 0x7F3F', () => {
    // COAB CMD_AddSubDivMulti writes val_a / val_b to op3 and val_a % val_b to
    // Area2.field_67E. vm_GetMemoryValue aliases that field as ECL word 0x7F3F. Gateway's
    // descriptor-18 post-combat turn depends on reading the remainder back immediately.
    const vm = new EclVm(block(
      0x06, ...imm(6), ...imm(4), ...addr(0x4c00),
      0x09, ...addr(0x7f3f), ...addr(0x4c01),
      0x00,
    ));
    vm.run();
    expect(vm.memory.get(0x4c00)).toBe(1);
    expect(vm.memory.get(0x7f3f)).toBe(2);
    expect(vm.memory.get(0x4c01)).toBe(2);
  });

  it('DIVIDE by zero fails instead of inventing retail state', () => {
    const vm = new EclVm(block(0x06, ...imm(6), ...imm(0), ...addr(0x4c00), 0x00));
    expect(() => vm.run()).toThrow(/DIVIDE by zero/);
  });

  // Shared layout for the ON_GOTO tests (vaddr = 0x7FFE + byte offset; body starts at 0x8014):
  //   0x8014 SAVE #sel, 0x4c00          (6 bytes)
  //   0x801A ON_GOTO mem[0x4c00], 2, t0, t1   (12 bytes) → fall-through at 0x8026
  //   0x8026 SAVE #11, 0x4c10 ; EXIT    (target 0, 7 bytes)
  //   0x802D SAVE #22, 0x4c10 ; EXIT    (target 1)
  const T0 = 0x8026;
  const T1 = 0x802d;
  const onGotoBlock = (sel: number, fall: number) =>
    block(
      0x09, ...imm(sel), ...addr(0x4c00),
      0x25, ...addr(0x4c00), ...imm(2), 0x01, T0 & 0xff, T0 >> 8, 0x01, T1 & 0xff, T1 >> 8,
      0x09, ...imm(fall), ...addr(0x4c10), 0x00, // T0 = 0x8026 (also the fall-through)
      0x09, ...imm(22), ...addr(0x4c10), 0x00, // T1 = 0x802D
    );

  it('ON_GOTO dispatches 0-based to target[selector]', () => {
    const vm = new EclVm(onGotoBlock(1, 11)); // selector 1 → branch to T1
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.memory.get(0x4c10)).toBe(22);
  });

  it('ON_GOTO selector 0 branches to the first target', () => {
    const vm = new EclVm(onGotoBlock(0, 11)); // selector 0 → branch to T0 (writes 11)
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.memory.get(0x4c10)).toBe(11);
  });

  it('ON_GOTO with an out-of-range selector falls through (no branch)', () => {
    // selector 5 ≥ count 2 → no branch; execution falls into T0's instruction (writes 99).
    const vm = new EclVm(onGotoBlock(5, 99));
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(vm.memory.get(0x4c10)).toBe(99);
  });
});

// --- Golden: real CoK ECL1 block 18 (skips if game data absent) -------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const ecl1Path = resolve(repoRoot, 'Champions of Krynn', 'ECL1.DAX');

// These goldens run the FULL real block 18 and assert its control flow, cross-checked
// instruction-by-instruction against EclDump ground truth (daxdump_extracted/ECL1_018.txt).
// Block 18 is an area-transition dispatcher: three opening SAVEs, then `COMPARE flag ; IF= ;
// GOTO` pairs that route to one of three NEWECL targets (ECL 80 / 97 / 68) by area flag.
describe('EclVm — golden CoK ECL1 block 18 (area transition)', () => {
  it.skipIf(!existsSync(ecl1Path))('chains to module 97 with default (all-zero) flags', async () => {
    const bytes = new Uint8Array(await readFile(ecl1Path));
    const blk18 = readDaxDataBlocks(bytes).find((b) => b.blockId === 18)!;
    expect(blk18).toBeDefined();

    // All area-flag variables 0. `COMPARE 1==word_208(0x4c04) ; IF=` fails (1≠0) so its GOTO
    // is skipped and PROGRAM StartGameMenu runs. `COMPARE 0==word_362(0x4cb1) ; IF=` SUCCEEDS
    // (0==0) so `GOTO 0x8060` is taken, skipping the ECL-80 block. `COMPARE 1==word_34C(0x4ca6)
    // ; IF=` fails (1≠0) so its GOTO is skipped → SAVE game_area(0x7f12)=6 ; NEWECL 97.
    const vm = new EclVm(blk18.raw);
    const r = vm.run();
    expect(r.status).toBe('chain');
    expect(r.chainBlockId).toBe(97);
    expect(vm.memory.get(0x7f12)).toBe(6); // game_area = 6 set before the chain
    // PROGRAM StartGameMenu is surfaced as an explicit host dispatch on the way; all GOTOs were local.
    const unhandled = r.effects.filter((e) => e.type === 'unhandled').map((e) => e.type === 'unhandled' && e.mnemonic);
    const program = r.effects.find((e) => e.type === 'program');
    expect(program).toMatchObject({ type: 'program', programId: 0 });
    expect(unhandled).not.toContain('GOTO(nonlocal)');
  });

  it.skipIf(!existsSync(ecl1Path))('chains to module 80 when the word_362 (0x4cb1) area flag is set', async () => {
    const bytes = new Uint8Array(await readFile(ecl1Path));
    const blk18 = readDaxDataBlocks(bytes).find((b) => b.blockId === 18)!;
    // Set word_362 (0x4cb1) = 1 so `COMPARE 0==word_362 ; IF=` now FAILS (0≠1); its `GOTO
    // 0x8060` is skipped, so SAVE game_area(0x7f12)=5 runs and execution reaches NEWECL 80.
    const vm = new EclVm(blk18.raw, { memory: new Map([[0x4cb1, 1]]) });
    const r = vm.run();
    expect(r.status).toBe('chain');
    expect(r.chainBlockId).toBe(80);
    expect(vm.memory.get(0x7f12)).toBe(5); // area indicator set before the chain
  });

  it.skipIf(!existsSync(ecl1Path))('emits the dungeon-init LOAD_FILES/LOAD_PIECES of real block 34', async () => {
    const bytes = new Uint8Array(await readFile(ecl1Path));
    const blk34 = readDaxDataBlocks(bytes).find((b) => b.blockId === 34)!;
    expect(blk34).toBeDefined();
    // Default memory: the opening `COMPARE 34==LastEclBlockId ; IF=` fails (34≠0), skips its
    // EXIT, then runs the dungeon setup → LOAD GEO 34 + LOAD WALLDEF [3,4,23] → EXIT.
    // (EclDump prints the WALLDEF ids reversed as "23 4 3"; operand order is set1/2/3 = 3/4/23.)
    // Block 34 SAVEs both area flags (0x4be7/0x4be8) = 1 just before LOAD_PIECES, so it resolves
    // as a two-set area: set 2 (block 4 — not even present in WALLDEF1.DAX) drops to 0xFF Reset.
    const vm = new EclVm(blk34.raw);
    const r = vm.run();
    expect(r.status).toBe('exited');
    expect(r.effects).toContainEqual({ type: 'loadFiles', geoBlockId: 34, operands: [34, 2, 255] });
    expect(r.effects).toContainEqual({ type: 'loadPieces', setBlockIds: [3, 0xff, 23], operands: [3, 4, 23], twoSet: true });
  });
});

// --- Golden: real ADD_NPC (0x36) sites (M35.S1) -----------------------------

const dokEcl1Path = resolve(repoRoot, 'Death Knights of Krynn', 'ECL1.DAX');
const dokEcl2Path = resolve(repoRoot, 'Death Knights of Krynn', 'ECL2.DAX');
const cokEcl2Path = resolve(repoRoot, 'Champions of Krynn', 'ECL2.DAX');

describe('EclVm — DoK block 51 selected thief matrix route', () => {
  it.skipIf(!existsSync(dokEcl2Path))('distinguishes trap-found and failed-trap vmRun1 paths from per-member thief rows', async () => {
    const bytes = new Uint8Array(await readFile(dokEcl2Path));
    const blk51 = readDaxDataBlocks(bytes).find((b) => b.blockId === 51)!;
    expect(blk51).toBeDefined();
    const entry = (parseEclHeader(blk51.raw).vmRun1 - ECL_VBASE) & 0xffff;
    const baseMemory = () => new Map<number, number>([
      [0xc04f, 29],
      [0xc04e, 0],
    ]);
    const rows = (value: number) => Array.from({ length: 6 }, () => Array.from({ length: 8 }, () => value));

    const found = new EclVm(blk51.raw, {
      entry,
      memory: baseMemory(),
      partyMemberInCombat: [true, true, true, true, true, true],
      partyThiefSkills: rows(100),
      partyHasRanger: true,
      encounterDistance: 4,
    });
    const foundResult = found.run();
    expect(foundResult.status).toBe('halted');
    if (foundResult.status === 'halted') expect(foundResult.haltReason).toBe('bad opcode at 567');
    expect(foundResult.effects.some((e) => e.type === 'combat')).toBe(false);
    expect(foundResult.effects.some((e) => e.type === 'print' && /FINDS A TRAP/.test(e.text))).toBe(true);
    expect(found.memory.get(0x4ce9)).toBeUndefined();

    const failed = new EclVm(blk51.raw, {
      entry,
      memory: baseMemory(),
      partyMemberInCombat: [true, true, true, true, true, true],
      partyThiefSkills: rows(0),
      partyHasRanger: true,
      encounterDistance: 4,
    });
    const failedResult = failed.run();
    expect(failedResult.status).toBe('exited');
    expect(failedResult.effects.some((e) => e.type === 'combat')).toBe(false);
    expect(failedResult.effects.some((e) => e.type === 'damage')).toBe(true);
    expect(failed.memory.get(0x4ce8)).toBe(0x10);
    expect(failed.memory.get(0x4ce9)).toBeUndefined();
  });
});

// Both real sites re-derived directly from the actual game bytes via `EclVm.run()` this round (not
// a linear disassembly scan, which undercounts — see `docs/engine/research/m35-audit.md`'s Open
// Questions). These run the VM directly on the raw ECL block, independent of `loadDungeon()`: DoK's
// own block 2 genuinely can't complete a full `loadDungeon()` today (its LOAD_PIECES names WALLDEF
// block id 2, which `WALLDEF1.DAX` doesn't ship — a SEPARATE, newly-found reachability gap, not an
// ADD_NPC concern; see the audit's correction). Running the VM alone sidesteps that and still proves
// the opcode decodes correctly against real bytes.
describe('EclVm — golden ADD_NPC (0x36) sites (M35.S1)', () => {
  it.skipIf(!existsSync(dokEcl1Path))('DoK ECL1 block 2: recruits DRYDEN/TANAR/FLAVIUS (ids 48/49/50) at morale 100', async () => {
    const bytes = new Uint8Array(await readFile(dokEcl1Path));
    const blk2 = readDaxDataBlocks(bytes).find((b) => b.blockId === 2)!;
    expect(blk2).toBeDefined();
    const vm = new EclVm(blk2.raw);
    const r = vm.run();
    // The block pauses on PARLAY (0x2c) right after the three joins. All three ADD_NPCs already ran.
    expect(r.status).toBe('awaiting-input');
    const joins = r.effects.filter((e) => e.type === 'addNpc');
    expect(joins).toEqual([
      { type: 'addNpc', npcId: 48, morale: 100 },
      { type: 'addNpc', npcId: 49, morale: 100 },
      { type: 'addNpc', npcId: 50, morale: 100 },
    ]);
  });

  it.skipIf(!existsSync(cokEcl2Path))('CoK ECL2 block 57: recruits RINGWALD/VARIANNA/SWIFTFOOT (ids 60/62/61) at morale 100', async () => {
    const bytes = new Uint8Array(await readFile(cokEcl2Path));
    const blk57 = readDaxDataBlocks(bytes).find((b) => b.blockId === 57)!;
    expect(blk57).toBeDefined();
    const vm = new EclVm(blk57.raw);
    const r = vm.run();
    expect(r.status).toBe('combat'); // pauses on COMBAT after the joins + LOAD_MONSTERs
    const joins = r.effects.filter((e) => e.type === 'addNpc');
    expect(joins).toEqual([
      { type: 'addNpc', npcId: 60, morale: 100 },
      { type: 'addNpc', npcId: 62, morale: 100 },
      { type: 'addNpc', npcId: 61, morale: 100 },
    ]);
  });
});
