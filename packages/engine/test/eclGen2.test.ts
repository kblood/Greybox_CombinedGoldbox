/**
 * Gen2 ECL dialect tests (Phase C, C2).
 *
 * The DQK `ECL.GLB` scripts share the Gen1 opcode table, operand framing and 6-bit string
 * packing; the only delta is the block HEADER (20 bytes, five far pointers, NO 0x1388 magic,
 * vbase 0x8000). These tests pin that dialect:
 *   1) Synthetic: a hand-built Gen2 block disassembles/runs with the right entry + target maths.
 *   2) Golden (skips if data absent): the real ECL.GLB decodes into an addressable archive, every
 *      member is Gen2 (no magic), an area init runs through the VM and fires real effects, and the
 *      inline strings decode to readable English.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ECL_GEN1,
  ECL_GEN2,
  parseEclHeader,
  disassembleEclBlock,
  decodeInstructionAt,
  EclVm,
  runEclChain,
  decodeEclGlb,
  ECL_OPCODE_MAX,
  KRYNN_GEN1_OPCODES,
} from '../src/index.js';

// Build a Gen2 ECL block: 20-byte header (5 far pointers {0x0101, vaddr}, NO magic) + body.
function makeGen2Block(body: Uint8Array, vaddrs = [0x8014, 0x8014, 0x8014, 0x8014, 0x8014]): Uint8Array {
  const raw = new Uint8Array(20 + body.length);
  const dv = new DataView(raw.buffer);
  for (let s = 0; s < 5; s++) {
    raw[s * 4] = 0x01; raw[s * 4 + 1] = 0x01; // segment word 0x0101
    dv.setUint16(s * 4 + 2, vaddrs[s], true);
  }
  raw.set(body, 20);
  return raw;
}

// Build a Gen1 ECL block: 22-byte header (0x1388 magic + 5 far pointers) + body, entry at 0x8014.
function makeGen1Block(body: number[]): Uint8Array {
  const raw = new Uint8Array(22 + body.length);
  raw[0] = 0x88; raw[1] = 0x13; // magic = 0x1388
  const dv = new DataView(raw.buffer);
  for (let s = 0; s < 5; s++) {
    raw[2 + s * 4] = 0x01; raw[3 + s * 4] = 0x01;
    dv.setUint16(4 + s * 4, 0x8014, true);
  }
  raw.set(body, 22);
  return raw;
}

// Operand encodings shared with vm.test.ts's convention: imm = code 0x00 immediate (2 bytes),
// addr = code 0x01 word address (3 bytes).
const imm = (v: number) => [0x00, v & 0xff];
const addr = (w: number) => [0x01, w & 0xff, (w >> 8) & 0xff];

describe('Gen2 ECL dialect — synthetic', () => {
  it('parses a magic-less 20-byte header and finds the far pointers', () => {
    const body = Uint8Array.from([0x00]); // EXIT
    const blk = makeGen2Block(body, [0x8102, 0x8b68, 0x80a5, 0x80f4, 0x8014]);
    const h = parseEclHeader(blk, ECL_GEN2);
    expect(h.magic).toBe(0); // no magic word in Gen2
    expect(h.vmRun1).toBe(0x8102);
    expect(h.searchLocation).toBe(0x8b68);
    expect(h.eclInitialEntry).toBe(0x8014); // always byte 20 = header end
  });

  it('disassembles from byte 20 (not 22) and runs PRINT then EXIT', () => {
    // PRINT (0x11) with an inline 6-bit string "HI", then EXIT (0x00).
    // "HI" packs as H=8, I=9 → 6-bit bits 001000 001001 = 0x20 0x90 (2 bytes carry both chars).
    const body = Uint8Array.from([0x11, 0x80, 0x02, 0x20, 0x90, 0x00]);
    const blk = makeGen2Block(body);
    const dis = disassembleEclBlock(blk, ECL_GEN2);
    expect(dis.instructions[0].mnemonic).toBe('PRINT');
    expect(dis.instructions[0].vaddr).toBe(0x8014); // entry vaddr under vbase 0x8000
    const vm = new EclVm(blk, { dialect: ECL_GEN2 });
    const res = vm.run();
    expect(res.status).toBe('exited');
    const print = res.effects.find((e) => e.type === 'print');
    expect(print).toBeDefined();
    expect((print as { text?: string }).text).toBe('HI');
  });

  it('resolves GOTO targets against the Gen2 vbase (0x8000)', () => {
    // GOTO 0x8019 (→ byte 25) lands on a PRINT "OK"; the bytes between are skipped.
    // body layout (byte offsets from 20):
    //  20: GOTO 0x8019         (01 03 19 80)  → 4 bytes
    //  24: EXIT (skipped)      (00)
    //  25: PRINT "OK" (4F=O→15, 4B=K→11) packed → 6-bit 001111 001011 = 0x3C 0xB0
    //      (11 80 02 3C B0) 5 bytes
    //  30: EXIT               (00)
    const body = Uint8Array.from([
      0x01, 0x03, 0x19, 0x80, // GOTO 0x8019
      0x00, // EXIT (jumped over)
      0x11, 0x80, 0x02, 0x3c, 0xb0, // PRINT "OK"
      0x00, // EXIT
    ]);
    const blk = makeGen2Block(body);
    const res = new EclVm(blk, { dialect: ECL_GEN2 }).run();
    expect(res.status).toBe('exited');
    expect(res.effects.map((e) => (e as { text?: string }).text).filter(Boolean)).toEqual(['OK']);
  });

  it('decodes and dispatches GEN2_EXT_41 (opcode 0x41, Gen2-only) with the trace-proven 2-operand frame', () => {
    // Live trace r3 (docs/engine/research/decompile-dqk-ecl-dispatch.md, "2026-07-18 DYNAMIC
    // TRACE -- SOLVED") witnessed opcode 0x41 fire with raw operand bytes `00 01 00 64` -- two
    // 2-byte immediate EclOpp sets (values 1 and 100). This pins that exact byte shape.
    const body = Uint8Array.from([0x41, 0x00, 0x01, 0x00, 0x64, 0x00]); // GEN2_EXT_41 #1,#100; EXIT
    const blk = makeGen2Block(body);
    const dis = disassembleEclBlock(blk, ECL_GEN2);
    expect(dis.instructions[0].mnemonic).toBe('GEN2_EXT_41');
    expect(dis.instructions[0].args.map((a) => a.word)).toEqual([1, 100]);

    const vm = new EclVm(blk, { dialect: ECL_GEN2 });
    const res = vm.run();
    expect(res.status).toBe('exited');
    const ext = res.effects.find(
      (e): e is Extract<typeof e, { type: 'scriptEffect' }> => e.type === 'scriptEffect' && e.kind === 'gen2Ext41',
    );
    expect(ext?.operands).toEqual([1, 100]);
  });

  it('Gen1 dialect still bad-opcode/halts on an out-of-table byte — the decode-drift detector this project relies on)', () => {
    // RE-ANCHORED 2026-09-04 (round 34 Phase B). This test used 0x41 as its "can never be a
    // Gen1 opcode" sentinel; round 34 R1 measured 0x41 to be a REAL Gen1 opcode (wordSet 2,
    // closing 33/33 CoK, 40/40 Secret and 47/72 DoK deep-desync sites), so the sentinel became
    // valid and this detector silently stopped detecting. The byte is now taken from
    // ECL_OPCODE_MAX + 1 rather than hard-coded, so growing the table re-anchors the sentinel
    // instead of disarming the probe. The general trap: a sentinel chosen as "current max + 1"
    // rots the moment the table it is defined against grows.
    //
    // ECL_GEN1 has no entry for this byte in KRYNN_GEN1_OPCODES and no opcodeOverrides, so a
    // genuine Gen1-dialect decode of it as an opcode must still fail loudly. This is the same
    // "silent no-op" DQK's own >0x41 range check gives real Gen2 opcodes -- but the engine
    // realizes that as a defensive halt (a deliberate desync-detection convention pinned by
    // test/vm.test.ts's existing "bad opcode at N" case), not literal continued execution.
    const raw = new Uint8Array(22 + 1);
    raw[0] = 0x88; raw[1] = 0x13; // Gen1 magic
    const dv = new DataView(raw.buffer);
    for (let s = 0; s < 5; s++) { raw[2 + s * 4] = 0x01; raw[3 + s * 4] = 0x01; dv.setUint16(4 + s * 4, 0x8014, true); }
    const outOfRange = ECL_OPCODE_MAX + 1; // 0x42 today; tracks the table so it stays invalid
    expect(KRYNN_GEN1_OPCODES[outOfRange]).toBeUndefined();
    raw[22] = outOfRange;
    const dec = decodeInstructionAt(raw, 22, ECL_GEN1.vbase, ECL_GEN1);
    expect(dec.badOpcode).toBe(true);
    const res = new EclVm(raw, { dialect: ECL_GEN1 }).run();
    expect(res.status).toBe('halted');
  });

  it('Gen1 header parsing is unchanged (regression guard)', () => {
    // A Gen1 block: magic 0x1388 + 5 far pointers; entry vaddr 0x8014 at byte 22.
    const raw = new Uint8Array(22 + 1);
    raw[0] = 0x88; raw[1] = 0x13;
    const dv = new DataView(raw.buffer);
    for (let s = 0; s < 5; s++) { raw[2 + s * 4] = 0x01; raw[3 + s * 4] = 0x01; dv.setUint16(4 + s * 4, 0x8014, true); }
    raw[22] = 0x00; // EXIT
    const h = parseEclHeader(raw, ECL_GEN1);
    expect(h.magic).toBe(0x1388);
    expect(h.eclInitialEntry).toBe(0x8014);
  });
});

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const eclGlbPath = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK3', 'ECL.GLB');

// --- DIV remainder address is dialect-aware (vm.ts's DIVIDE handler) --------
//
// Gen1/CoAB proof: `coab_extracted/engine/ovr003.cs` `CMD_AddSubDivMulti` case 6 writes
// `gbl.area2_ptr.field_67E = (short)(val_a % val_b)` — a *named* decompiled struct field, declared
// at struct offset 0x67e in `coab_extracted/Classes/Area2.cs:77`. ECL reaches that same field
// through `vm_GetMemoryValue`'s generic path (`ovr008.cs:839`,
// `gbl.area2_ptr.field_800_Get((loc * 2) + 0x800)`), i.e. struct offset `(loc * 2 + 0x800) &
// 0xFFFF`. Solving for `loc` with target `0x67e` gives `loc === 0x7f3f` exactly.
//
// Gen2/DQK proof: DQK's own retail `ECL.GLB` area 31 (a generic "set bit N of a bitfield" helper)
// at vaddr 0xA43B disassembles to `DIV [0x00BF], #8 -> [0x00BF]` immediately followed by a SAVE
// whose source operand is `(code 3, addr 0x0029)` — the remainder is read back through ECL address
// 0x0029, not 0x7f3f. See EclDialect.divRemainderAddr's own doc comment for the full byte trace.
describe('DIV remainder address — dialect-aware (vm.ts case 0x06 / EclDialect.divRemainderAddr)', () => {
  it('the SAME DIV instruction writes its remainder to 0x7f3f under Gen1 and 0x0029 under Gen2', () => {
    // DIV #6, #4, [0x4c00]; EXIT -> quotient 1 to [0x4c00], remainder 2 to the dialect's address.
    const body = [0x06, ...imm(6), ...imm(4), ...addr(0x4c00), 0x00];

    const gen1 = new EclVm(makeGen1Block(body), { dialect: ECL_GEN1 });
    const r1 = gen1.run();
    expect(r1.status).toBe('exited');
    expect(gen1.memory.get(0x4c00)).toBe(1); // quotient, dialect-independent
    expect(gen1.memory.get(0x7f3f)).toBe(2); // remainder at the Gen1 address
    expect(gen1.memory.get(0x0029) ?? 0).toBe(0); // the Gen2 address must stay untouched

    const gen2 = new EclVm(makeGen2Block(Uint8Array.from(body)), { dialect: ECL_GEN2 });
    const r2 = gen2.run();
    expect(r2.status).toBe('exited');
    expect(gen2.memory.get(0x4c00)).toBe(1); // quotient, dialect-independent
    expect(gen2.memory.get(0x0029)).toBe(2); // remainder at the Gen2 address
    expect(gen2.memory.get(0x7f3f) ?? 0).toBe(0); // the Gen1 address must stay untouched
  });

  it.skipIf(!existsSync(eclGlbPath))(
    'retail DQK area 31 helper @0xA43B: DIV [0x00BF],#8 writes a sane remainder to [0x0029]',
    async () => {
      // Area 31's generic bit-set helper (docs/engine/research/dqk-campaign-legs.md) computes
      // byteIndex = bitNumber / 8 into [0x00BF] and, per this task's byte evidence, reads the
      // remainder (bitNumber % 8) back through address 0x0029 to index the 8-entry mask table at
      // 0xA4DC (`01 02 04 08 10 20 40 80`). Seed bit number 12 -> byteIndex 1, bit-within-byte 4,
      // so a correct VM must leave [0x00BF]=1 (quotient) and [0x0029]=4 (remainder) after exactly
      // one DIV instruction. This only exercises the DIVIDE opcode itself (via step(), not run()) —
      // it does not attempt the helper's later TABLE/OR/SAVE_TABLE tail, which depends on other,
      // separately-tracked Gen2 VM gaps (a GETTABLE fallback issue and the still-open
      // wordSetOverrides for 0x2C/0x1F/0x37 noted in the task brief).
      const bytes = new Uint8Array(await readFile(eclGlbPath));
      const arch = decodeEclGlb(bytes, 'ECL.GLB');
      const memberIdx = arch.idToMember.get(31)!;
      const block = arch.members[memberIdx];

      // Pin the exact retail bytes this test relies on before trusting the decode.
      const off = 0xa43b - ECL_GEN2.vbase;
      const raw = Array.from(block.slice(off, off + 9)).map((b) => b.toString(16).padStart(2, '0')).join(' ');
      expect(raw).toBe('06 01 bf 00 00 08 01 bf 00');

      const dec = decodeInstructionAt(block, off, ECL_GEN2.vbase, ECL_GEN2);
      expect(dec.ins?.mnemonic).toBe('DIVIDE');

      const vm = new EclVm(block, {
        dialect: ECL_GEN2,
        entry: off,
        memory: new Map<number, number>([[0x00bf, 12]]), // bit number 12
      });
      const step = vm.step();
      expect(step.status).toBe('running'); // one instruction executed, VM did not yield/halt
      expect(vm.memory.get(0x00bf)).toBe(1); // quotient: 12 / 8
      expect(vm.memory.get(0x0029)).toBe(4); // remainder: 12 % 8, at the Gen2 address
    },
  );
});

// --- Golden: real DQK ECL.GLB (skips if data absent) ------------------------

describe('Gen2 ECL — golden DQK ECL.GLB', () => {
  it.skipIf(!existsSync(eclGlbPath))('decodes the script library and fires real events through the VM', async () => {
    const bytes = new Uint8Array(await readFile(eclGlbPath));
    const arch = decodeEclGlb(bytes, 'ECL.GLB');

    // 47 logical scripts; the id table pairs area ids with members (area 34 is a real DQK area).
    expect(arch.members.length).toBe(48); // member 0 = id table, 1..47 = blocks
    expect(arch.idToMember.size).toBe(47);
    expect(arch.idToMember.get(34)).toBe(20);

    // Every ECL block is Gen2: zero carry the Gen1 0x1388 magic, every far-pointer segment is 0x0101.
    for (let i = 1; i < arch.members.length; i++) {
      const m = arch.members[i];
      expect(m[0] | (m[1] << 8)).not.toBe(0x1388);
      const h = parseEclHeader(m, ECL_GEN2);
      expect(h.eclInitialEntry & 0xff00).toBe(0x8000); // vaddr in the 0x80xx code window
    }

    // Run the first dungeon area (id 2) through the VM in the Gen2 dialect — its init loads the
    // dungeon files, so a `loadFiles` effect must fire (the area's "events" actually run).
    const run = runEclChain(2, arch.blockSourceById, { dialect: ECL_GEN2, autoInput: () => 0, autoCombat: true });
    const loadFiles = run.effects.find((e) => e.type === 'loadFiles');
    expect(loadFiles, 'the DQK area init must fire a loadFiles event').toBeDefined();

    // Area 4's entry script prints the real DQK intro narrative — a full dialogue/event decoded
    // through the Gen2 VM, the clearest proof the dialect runs end-to-end. The intro is gated by
    // the script's own `COMPARE_AND [0x16],#4,[0x9c],#2` (entry-mode == 4 AND sub-state == 2,
    // byte-verified from the area-4 init disassembly @0x801f); seed those trigger constants — the
    // values the real DQK engine supplies, which the headless harness otherwise leaves 0. (Before
    // the COMPARE_AND compound-equality fix this passed spuriously: the buggy opcode compared the
    // two unseeded-zero memory cells and found them "equal".)
    const area4 = runEclChain(4, arch.blockSourceById, {
      dialect: ECL_GEN2, autoInput: () => 0, autoCombat: true,
      memory: new Map<number, number>([[0x16, 4], [0x9c, 2]]),
    });
    const narrative = area4.effects.find(
      (e): e is Extract<typeof e, { type: 'print' }> => e.type === 'print' && !!e.text,
    );
    expect(narrative?.text).toContain('VOYAGE BEGINS PEACEFULLY');

    // The inline 6-bit strings decode to readable English across the library (proves the shared
    // string packing + opcode framing under the Gen2 header).
    const strings: string[] = [];
    for (let i = 1; i < arch.members.length && strings.length < 200; i++) {
      const blk = disassembleEclBlock(arch.members[i], ECL_GEN2);
      for (const ins of blk.instructions)
        for (const a of ins.args) if (a.text && a.text.length >= 4) strings.push(a.text);
    }
    expect(strings.length).toBeGreaterThan(0);
    // The bootstrap carries the jump-to-area debug UI text.
    const joined = strings.join(' | ');
    expect(/WISH TO GO|POSITION|NORTH|FACING/.test(joined)).toBe(true);
  });

  it.skipIf(!existsSync(eclGlbPath))('fires the real GEN2_EXT_41 (opcode 0x41) chain on retail area 65 exactly as the live Unicorn trace did', async () => {
    // Cross-checks the engine's static ECL_GEN2.opcodeOverrides wiring against the SAME retail
    // bytes the 2026-07-18 dynamic trace (docs/engine/research/decompile-dqk-ecl-dispatch.md,
    // "How the trace was actually routed") ran against. Area 65's member entry is a resume guard
    // (`COMPARE #65,[0x0016]; IF_EQ; EXIT`) exactly like the doc documents, so this test starts
    // the VM at vaddr 0x80aa (the doc's `poke-dgroup16:0xb7f9:0x80aa:area65-narration-jump`
    // target) instead — the SAME "synthetic route control only, real opcode bytes and VM
    // execution" convention the trace itself used (see that section's own caveat), reusing the
    // VM's public `entry` option rather than any new mechanism.
    const bytes = new Uint8Array(await readFile(eclGlbPath));
    const arch = decodeEclGlb(bytes, 'ECL.GLB');
    const memberIdx = arch.idToMember.get(65)!;
    const block = arch.members[memberIdx];

    // The doc's static census pins this opcode at file 0x069104 / vaddr 0x8110h for area 65;
    // confirm the real retail bytes decode to GEN2_EXT_41 there before running the VM.
    const atTarget = decodeInstructionAt(block, 0x8110 - ECL_GEN2.vbase, ECL_GEN2.vbase, ECL_GEN2);
    expect(atTarget.ins?.mnemonic).toBe('GEN2_EXT_41');

    const vm = new EclVm(block, { dialect: ECL_GEN2, entry: 0x80aa - ECL_GEN2.vbase });
    const res = vm.run();
    expect(res.status).toBe('exited'); // reaches the trailing EXIT, not a halt/bad-opcode stop

    // r3's fired sequence from the poke was: 0x12,0x1d,0x12,0x1d,0x41@0x8110,0x09,0x12,0x1d,
    // 0x12,0x1d,0x0c — this reproduces the 0x41 hop with the SAME live-observed operands (1,100).
    const ext = res.effects.find(
      (e): e is Extract<typeof e, { type: 'scriptEffect' }> => e.type === 'scriptEffect' && e.kind === 'gen2Ext41',
    );
    expect(ext, 'area 65 must fire GEN2_EXT_41 on this route, matching the live trace').toBeDefined();
    expect(ext?.operands).toEqual([1, 100]);
    expect(ext?.ins.vaddr).toBe(0x8110);

    // The route continues past 0x41 into a real SETUP_MONSTER (0x0c) — proving the VM correctly
    // advanced past the extended opcode's 2-operand frame rather than desyncing the stream.
    const setup = res.effects.find((e) => e.type === 'encounterSetup');
    expect(setup, 'stream must resync correctly after GEN2_EXT_41 and reach SETUP_MONSTER').toBeDefined();
  });
});
