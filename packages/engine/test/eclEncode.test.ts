/**
 * ECL content port (E3.3) — port a Gen1 (CoK/DoK) ECL script onto the DQK Gen2 `ECL.GLB` path. The
 * dialects share an identical instruction set; the only difference is the block header (Gen1 22-byte with
 * a 0x1388 magic, Gen2 20-byte without), and removing the magic preserves every virtual address. Verified:
 *
 *  1) Synthetic: a hand-built Gen1 block ports to `block.subarray(2)`; disassembling the result as Gen2
 *     yields the same instruction stream (vaddrs/mnemonics/operands) as the Gen1 original as Gen1.
 *  2) Real content port (skip when CoK data absent): real `ECL1.DAX` Gen1 blocks port and their
 *     executable bridge prefix matches on the DQK path through the first `LOAD_FILES`; DQK's native
 *     `LOAD_FILES` framing consumes two operands, so bytes after that host bridge are not a same-shape
 *     Gen1/Gen2 disassembly.
 *  3) Archive round-trip: `portGen1EclArchiveToGen2` → `decodeEclGlb` resolves each block by id and the
 *     ported script disassembles on the Gen2 path the same as the Gen1 original.
 *  4) Operand-frame transcode (2026-07-23, cok-m4-fidelity-plan.md §25): the Gen2 interpreter parses
 *     SETUP_MONSTER with FOUR operand frames (live handler `25a4:2db1`) and LOAD_FILES with TWO, vs
 *     CoK Gen1-long's 3/3 — `transcodeGen1EclBlockToGen2` rewrites every reachable such site into a
 *     GOTO trampoline (byte-position-preserving) whose appended stub re-encodes the instruction in the
 *     frame shape Gen2 actually parses, then jumps back. PARLAY (6→4) has no proven semantic mapping
 *     and is reported untranslated, not guessed at.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  disassembleEclBlock,
  decodeInstructionAt,
  readDaxDataBlocks,
  decodeEclGlb,
  ECL_GEN1,
  ECL_GEN2,
  portGen1EclToGen2,
  transcodeGen1EclBlockToGen2,
  sniffGen1EclBlock,
  encodeEclGlb,
  portGen1EclArchiveToGen2,
  makeEclForwardStub,
  planEntryStub,
  ECL_GEN1_MAGIC,
} from '../src/index.js';

/**
 * A comparable projection of a disassembly: per-instruction vaddr + mnemonic + opcode + operands. The
 * `badOpcodeAt` byte offset (where a linear sweep past the subroutine hits data) is normalised to its
 * **virtual address** (`offset + vbase`) — the raw byte offset differs by the 2-byte header delta between
 * the dialects, but the vaddr is invariant, which is exactly the property the port preserves.
 */
function shape(raw: Uint8Array, dialect: typeof ECL_GEN1) {
  const b = disassembleEclBlock(raw, dialect);
  return {
    badOpcodeAt: b.badOpcodeAt === undefined ? undefined : b.badOpcodeAt + dialect.vbase,
    ins: b.instructions.map((i) => ({
      vaddr: i.vaddr,
      mnemonic: i.mnemonic,
      opcode: i.opcode,
      size: i.size,
      args: JSON.stringify(i.args),
    })),
  };
}

function bridgeShape(raw: Uint8Array, dialect: typeof ECL_GEN1) {
  const s = shape(raw, dialect);
  const ins = [];
  for (const i of s.ins) {
    if (i.opcode === 0x21) {
      ins.push({ ...i, size: 5, args: JSON.stringify(JSON.parse(i.args).slice(0, 2)) });
      break;
    }
    ins.push(i);
  }
  return { badOpcodeAt: undefined, ins };
}

/**
 * Assert a ported member is the TRANSCODED equivalent of its Gen1 source: every reachable
 * SETUP_MONSTER/LOAD_FILES site is a `GOTO stub` trampoline whose appended stub re-encodes the
 * instruction in the Gen2 frame shape (kept operands byte-identical, SETUP_MONSTER's appended 4th
 * frame = imm 0) and jumps back to the instruction after the original site.
 */
function expectTranscodedEquivalence(member: Uint8Array, gen1raw: Uint8Array, label: string) {
  const { block: expected, report } = transcodeGen1EclBlockToGen2(gen1raw);
  expect(Array.from(member), `${label}: member = transcoded block`).toEqual(Array.from(expected));
  for (const p of report.patched) {
    const siteOff = p.vaddr - ECL_GEN2.vbase;
    // Site now opens with GOTO stubVaddr; the remainder of the original site is zero-filled.
    expect(member[siteOff], `${label} site 0x${p.vaddr.toString(16)}`).toBe(0x01);
    expect(member[siteOff + 1]).toBe(0x01);
    expect(member[siteOff + 2] | (member[siteOff + 3] << 8)).toBe(p.stubVaddr);
    // The stub decodes under Gen2 as the original opcode with the kept Gen1 operand values.
    const g1 = decodeInstructionAt(gen1raw, p.vaddr - ECL_GEN1.vbase, ECL_GEN1.vbase, ECL_GEN1).ins!;
    const stub = decodeInstructionAt(member, p.stubVaddr - ECL_GEN2.vbase, ECL_GEN2.vbase, ECL_GEN2).ins!;
    expect(stub.opcode, `${label} stub for 0x${p.vaddr.toString(16)}`).toBe(p.opcode);
    const keep = p.opcode === 0x21 ? 2 : 3;
    expect(stub.args.length).toBe(p.opcode === 0x0c ? 4 : 2);
    for (let i = 0; i < keep; i++) {
      expect(stub.args[i].code).toBe(g1.args[i].code);
      expect(stub.args[i].word).toBe(g1.args[i].word);
    }
    if (p.opcode === 0x0c) {
      expect(stub.args[3].kind).toBe('imm');
      expect(stub.args[3].word).toBe(0);
    }
    // The stub's trailing GOTO returns to the instruction after the original site.
    const back = decodeInstructionAt(member, p.stubVaddr - ECL_GEN2.vbase + stub.size, ECL_GEN2.vbase, ECL_GEN2).ins!;
    expect(back.opcode, `${label} back-GOTO for 0x${p.vaddr.toString(16)}`).toBe(0x01);
    expect(back.args[0].word).toBe(g1.vaddr + g1.size);
  }
}

/** Build a minimal Gen1 ECL block: 0x1388 magic + a 20-byte far-ptr table + a tiny body, then EXIT. */
function makeGen1Block(body: number[]): Uint8Array {
  const header = new Uint8Array(ECL_GEN1.headerLen);
  header[0] = 0x88; // magic 0x1388
  header[1] = 0x13;
  // far-pointer 4 (eclInitialEntry) vaddr word at table offset 4*4+2 = 18 → 0x8014
  header[2 + 4 * 4 + 2] = 0x14;
  header[2 + 4 * 4 + 2 + 1] = 0x80;
  return Uint8Array.from([...header, ...body]);
}

describe('portGen1EclToGen2 — header-only port', () => {
  it('drops the 0x1388 magic and preserves the far-ptr table + body', () => {
    const body = [0x00]; // EXIT
    const g1 = makeGen1Block(body);
    expect(sniffGen1EclBlock(g1)).toBe(true);

    const g2 = portGen1EclToGen2(g1);
    expect(g2.length).toBe(g1.length - 2);
    // The Gen2 20-byte header equals the Gen1 far-pointer table (Gen1 bytes 2..21).
    expect(Array.from(g2.subarray(0, ECL_GEN2.headerLen))).toEqual(Array.from(g1.subarray(2, 2 + ECL_GEN2.headerLen)));
    // The body is byte-identical.
    expect(Array.from(g2.subarray(ECL_GEN2.headerLen))).toEqual(Array.from(g1.subarray(ECL_GEN1.headerLen)));
    // Both header lengths reach the same entry vaddr 0x8014.
    expect(ECL_GEN1.vbase + ECL_GEN1.headerLen).toBe(0x8014);
    expect(ECL_GEN2.vbase + ECL_GEN2.headerLen).toBe(0x8014);
  });

  it('rejects a non-Gen1 block', () => {
    expect(() => portGen1EclToGen2(new Uint8Array(ECL_GEN1.headerLen))).toThrow(); // no magic
    expect(() => portGen1EclToGen2(Uint8Array.from([0x88, 0x13]))).toThrow(); // too short
    expect(ECL_GEN1_MAGIC).toBe(0x1388);
  });
});

describe('transcodeGen1EclBlockToGen2 — Gen2 operand-frame drift trampolines', () => {
  it('rewrites a 3-operand SETUP_MONSTER into a GOTO trampoline with an imm-0 4th frame', () => {
    // Gen1 body at 0x8014: SETUP_MONSTER #5,#1,#7 (7 bytes); DELAY; APPROACH; EXIT.
    const g1 = makeGen1Block([0x0c, 0x00, 0x05, 0x00, 0x01, 0x00, 0x07, 0x3a, 0x0d, 0x00]);
    const { block, report } = transcodeGen1EclBlockToGen2(g1);
    expect(report.patched).toEqual([{ opcode: 0x0c, vaddr: 0x8014, stubVaddr: 0x8000 + (g1.length - 2) }]);
    expect(report.untranslated).toEqual([]);
    // Site: GOTO stub + zero fill; original DELAY/APPROACH/EXIT bytes untouched at their offsets.
    const siteOff = 0x8014 - ECL_GEN2.vbase;
    expect(Array.from(block.slice(siteOff, siteOff + 10))).toEqual([
      0x01, 0x01, (g1.length - 2) & 0xff, 0x80 + ((g1.length - 2) >> 8), 0x00, 0x00, 0x00, 0x3a, 0x0d, 0x00,
    ]);
    // Stub decodes under Gen2 (4-frame SETUP_MONSTER) then GOTOs back to the DELAY at 0x801b.
    const stub = decodeInstructionAt(block, g1.length - 2, ECL_GEN2.vbase, ECL_GEN2).ins!;
    expect(stub.mnemonic).toBe('SETUP_MONSTER');
    expect(stub.args.map((a) => a.word)).toEqual([5, 1, 7, 0]);
    const back = decodeInstructionAt(block, g1.length - 2 + stub.size, ECL_GEN2.vbase, ECL_GEN2).ins!;
    expect(back.opcode).toBe(0x01);
    expect(back.args[0].word).toBe(0x801b);
  });

  it('rewrites a 3-operand LOAD_FILES dropping the consumerless 3rd frame', () => {
    // LOAD_FILES #64,#2,#255 (7 bytes); EXIT. Verbatim on Gen2 the `00 ff` frame decodes as EXIT.
    const g1 = makeGen1Block([0x21, 0x00, 0x40, 0x00, 0x02, 0x00, 0xff, 0x00]);
    const { block, report } = transcodeGen1EclBlockToGen2(g1);
    expect(report.patched.map((p) => p.opcode)).toEqual([0x21]);
    const stub = decodeInstructionAt(block, report.patched[0].stubVaddr - ECL_GEN2.vbase, ECL_GEN2.vbase, ECL_GEN2).ins!;
    expect(stub.mnemonic).toBe('LOAD_FILES');
    expect(stub.args.map((a) => a.word)).toEqual([64, 2]);
    const back = decodeInstructionAt(block, report.patched[0].stubVaddr - ECL_GEN2.vbase + stub.size, ECL_GEN2.vbase, ECL_GEN2).ins!;
    expect(back.opcode).toBe(0x01);
    expect(back.args[0].word).toBe(0x8014 + 7);
  });

  it('reports a reachable 6-operand PARLAY as untranslated instead of guessing a mapping', () => {
    // PARLAY #0,#0,#1,#1,#0,[0x7f79] (13 bytes); EXIT.
    const g1 = makeGen1Block([0x2c, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x01, 0x79, 0x7f, 0x00]);
    const { block, report } = transcodeGen1EclBlockToGen2(g1);
    expect(report.patched).toEqual([]);
    expect(report.untranslated).toEqual([
      { opcode: 0x2c, vaddr: 0x8014, reason: 'no proven Gen1→Gen2 semantic operand mapping' },
    ]);
    // Untranslated ⇒ byte-identical to the header-only port.
    expect(Array.from(block)).toEqual(Array.from(portGen1EclToGen2(g1)));
  });

  it('leaves unreachable drifted bytes alone (data that merely looks like SETUP_MONSTER)', () => {
    // Entry EXITs immediately; the trailing bytes mimic a SETUP_MONSTER but are never reachable.
    const g1 = makeGen1Block([0x00, 0x0c, 0x00, 0x05, 0x00, 0x01, 0x00, 0x07]);
    const { block, report } = transcodeGen1EclBlockToGen2(g1);
    expect(report.patched).toEqual([]);
    expect(Array.from(block)).toEqual(Array.from(portGen1EclToGen2(g1)));
  });
});

// --- Real content port (skip when CoK data is absent) -------------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const ecl1Path = resolve(repoRoot, 'Champions of Krynn', 'ECL1.DAX');

describe('portGen1EclToGen2 — real CoK ECL1.DAX scripts onto the DQK ECL path', () => {
  it.skipIf(!existsSync(ecl1Path))('Gen1 blocks preserve the executable Gen2 bridge prefix', async () => {
    const bytes = new Uint8Array(await readFile(ecl1Path));
    const eclBlocks = readDaxDataBlocks(bytes).filter((b) => sniffGen1EclBlock(b.raw));
    expect(eclBlocks.length, 'ECL1.DAX must hold Gen1 ECL blocks').toBeGreaterThan(0);

    // Every ported block reaches the same executable bridge prefix on the DQK (Gen2) path as the
    // Gen1 original. The comparison intentionally stops at LOAD_FILES because native DQK consumes
    // two LOAD_FILES operands while Gen1 stores three.
    for (const b of eclBlocks.slice(0, 12)) {
      const gen1 = bridgeShape(b.raw, ECL_GEN1);
      const gen2 = bridgeShape(portGen1EclToGen2(b.raw), ECL_GEN2);
      expect(gen2, `ECL block ${b.blockId}`).toEqual(gen1);
    }

    // The known worked example (block 18) — its three NEWECL chain targets survive the port.
    const blk18 = eclBlocks.find((b) => b.blockId === 18);
    if (blk18) {
      const ported = portGen1EclToGen2(blk18.raw);
      const g2 = disassembleEclBlock(ported, ECL_GEN2);
      expect(g2.header.eclInitialEntry).toBe(0x8014);
      expect(g2.instructions.filter((i) => i.mnemonic === 'NEWECL').map((i) => i.args[0].word)).toEqual([80, 97, 68]);
    }
  });

  it.skipIf(!existsSync(ecl1Path))('portGen1EclArchiveToGen2 → decodeEclGlb resolves ported scripts by id', async () => {
    const bytes = new Uint8Array(await readFile(ecl1Path));
    const eclBlocks = readDaxDataBlocks(bytes).filter((b) => sniffGen1EclBlock(b.raw)).slice(0, 6);
    const entries = eclBlocks.map((b) => ({ id: b.blockId, block: b.raw }));

    const glb = portGen1EclArchiveToGen2(entries);
    const arch = decodeEclGlb(glb, 'ECL.GLB');
    expect(arch.members.length).toBe(entries.length + 1); // id table + blocks

    for (const e of entries) {
      const member = arch.blockSourceById(e.id);
      expect(member, `area ${e.id}`).toBeDefined();
      // The script the DQK loader hands back is the operand-frame-transcoded port of the original.
      expectTranscodedEquivalence(member!, e.block, `area ${e.id}`);
    }
  });
});

// --- Milestone 2 (cok-content-port-plan.md §6) — lock the ECL-drift verdict across the WHOLE game,
// not just an ECL1.DAX sample. The test above already covers all 7 of ECL1's blocks (it slices to 12,
// which is >= ECL1's real count); this extends the same identity check to ECL2.DAX and ECL3.DAX so
// every one of CoK's 22 real Gen1 ECL blocks (7+8+7, ids 16-99) is proven to re-disassemble identically
// on the Gen2/DQK path. Zero divergence here is CRUX 1 (no opcode drift) proven for the whole game.
const eclPaths = [1, 2, 3].map((n) => resolve(repoRoot, 'Champions of Krynn', `ECL${n}.DAX`));
const allEclPresent = eclPaths.every((p) => existsSync(p));

describe('portGen1EclToGen2 — ECL-drift verdict locked across ALL CoK blocks (Milestone 2)', () => {
  it.skipIf(!allEclPresent)('every Gen1 ECL block across ECL1/ECL2/ECL3.DAX preserves the Gen2 bridge prefix', async () => {
    let total = 0;
    for (const p of eclPaths) {
      const bytes = new Uint8Array(await readFile(p));
      const eclBlocks = readDaxDataBlocks(bytes).filter((b) => sniffGen1EclBlock(b.raw));
      expect(eclBlocks.length, `${p} must hold Gen1 ECL blocks`).toBeGreaterThan(0);
      for (const b of eclBlocks) {
        const gen1 = bridgeShape(b.raw, ECL_GEN1);
        const gen2 = bridgeShape(portGen1EclToGen2(b.raw), ECL_GEN2);
        expect(gen2, `${p} block ${b.blockId}`).toEqual(gen1);
      }
      total += eclBlocks.length;
    }
    // Pins the corpus size so a future format change (a block silently failing to sniff as Gen1) fails
    // loudly here instead of the test quietly covering fewer blocks than it claims.
    expect(total).toBe(22);
  });

  it.skipIf(!allEclPresent)('the full merged corpus round-trips through portGen1EclArchiveToGen2 -> decodeEclGlb by id', async () => {
    const entries: { id: number; block: Uint8Array }[] = [];
    for (const p of eclPaths) {
      const bytes = new Uint8Array(await readFile(p));
      for (const b of readDaxDataBlocks(bytes).filter((b) => sniffGen1EclBlock(b.raw))) {
        entries.push({ id: b.blockId, block: b.raw });
      }
    }
    expect(new Set(entries.map((e) => e.id)).size, 'ids must be globally unique across the 3 disks').toBe(entries.length);

    const glb = portGen1EclArchiveToGen2(entries);
    const arch = decodeEclGlb(glb, 'ECL.GLB');
    expect(arch.members.length).toBe(entries.length + 1); // id table + blocks

    for (const e of entries) {
      const member = arch.blockSourceById(e.id);
      expect(member, `area ${e.id}`).toBeDefined();
      expectTranscodedEquivalence(member!, e.block, `area ${e.id}`);
    }
  });

  it.skipIf(!allEclPresent)('the frame-drift surface of the whole CoK corpus is pinned (88 SETUP_MONSTER + 10 LOAD_FILES trampolines, 32 untranslated sites)', async () => {
    let setupMonster = 0;
    let loadFiles = 0;
    const untranslated: string[] = [];
    for (const p of eclPaths) {
      const bytes = new Uint8Array(await readFile(p));
      for (const b of readDaxDataBlocks(bytes).filter((b) => sniffGen1EclBlock(b.raw))) {
        const { report } = transcodeGen1EclBlockToGen2(b.raw);
        setupMonster += report.patched.filter((s) => s.opcode === 0x0c).length;
        loadFiles += report.patched.filter((s) => s.opcode === 0x21).length;
        for (const u of report.untranslated) untranslated.push(`${b.blockId}:0x${u.opcode.toString(16)}@0x${u.vaddr.toString(16)}`);
      }
    }
    // Pinned against the 2026-07-23 reachability scan (cok-m4-fidelity-plan.md §25) — includes the
    // live-crash site, area 34's wandering-encounter SETUP_MONSTER at vaddr 0x834f.
    expect(setupMonster).toBe(88);
    expect(loadFiles).toBe(10);
    // 2026-08-07 — this surface GREW from 2 sites to 32, and the growth is real, not a
    // regression in the transcoder. The Gen2 operand table was read straight out of DQK.EXE's
    // per-handler operand prefetches (see ECL_GEN2's comment in src/ecl/disassemble.ts); three
    // more opcodes turn out to have a NARROWER Gen2 frame than Gen1, so ported CoK bytes that
    // were previously assumed frame-compatible are not:
    //
    //   0x27 TREASURE       Gen1 8 -> Gen2 4 (+ a count-driven tail)   22 sites
    //   0x37 LOAD_PIECES    Gen1 3 -> Gen2 2                            7 sites
    //   0x29 ENCOUNTER_MENU Gen1 14 -> Gen2 0                           1 site
    //   0x2c PARLAY         Gen1 6 -> Gen2 1 (was 4)                    2 sites (unchanged set)
    //
    // These are honest gaps, exactly like the two PARLAY sites already were: the transcoder has
    // no proven Gen1->Gen2 mapping for them and reports rather than guessing. They are ALSO a
    // concrete new lead for the long-running CoK-on-DQK combat-init crash — a Gen1-width TREASURE
    // or LOAD_PIECES left unpatched in ported data desynchronises DQK's own decoder downstream,
    // which is the shape of failure that investigation kept describing without pinning.
    expect(untranslated).toEqual([
      '17:0x27@0x8795', '17:0x27@0x8af1',
      '32:0x27@0x89ef', '32:0x27@0x8bce', '32:0x27@0x92e1', '32:0x27@0x9313',
      '33:0x29@0x851e', '33:0x2c@0x85c7', '33:0x27@0x9087',
      '34:0x27@0x8755', '34:0x27@0x8bf4',
      '48:0x2c@0x902e', '48:0x27@0x990c',
      '49:0x27@0x89b5', '49:0x27@0x8d7d',
      '50:0x27@0x8b97', '50:0x27@0x8cf7', '50:0x27@0x9652',
      '57:0x37@0x8027', '64:0x37@0x8028', '66:0x37@0x801b', '67:0x37@0x8028',
      '68:0x27@0x8937', '68:0x27@0x9561', '68:0x27@0x965f',
      '80:0x27@0x8f0f', '80:0x27@0x946a', '81:0x27@0x89f6',
      '96:0x37@0x802d', '97:0x37@0x801b',
      '98:0x27@0x8a1d', '99:0x37@0x8028',
    ]);
  });
});

describe('E6.1 — new-game entry stub (DQK.EXE loads ECL area 1 on a fresh "Begin Adventuring")', () => {
  it('makeEclForwardStub builds a 24-byte Gen2 block: NEWECL #target, EXIT, entry 0x8014', () => {
    const stub = makeEclForwardStub(16);
    expect(stub.length).toBe(24);
    // Byte-faithful body: `20 00 10` (NEWECL #16) then `00` (EXIT) — matches the real CoK encoding.
    expect(Array.from(stub.slice(20))).toEqual([0x20, 0x00, 0x10, 0x00]);
    const dis = disassembleEclBlock(stub, ECL_GEN2);
    expect(dis.header.eclInitialEntry).toBe(0x8014);
    expect(dis.instructions.map((i) => i.mnemonic)).toEqual(['NEWECL', 'EXIT']);
    expect(dis.instructions[0].args[0].word).toBe(16);
    expect(() => makeEclForwardStub(300)).toThrow(/0\.\.255/); // area id must fit the immediate
  });

  it('planEntryStub injects only when the area id is absent; forwards to the lowest id by default', () => {
    expect(planEntryStub([16, 17, 36], { entryAreaId: 1 })).toEqual({ areaId: 1, forwardsTo: 16 });
    expect(planEntryStub([16, 17], { entryAreaId: 1, entryForwardsTo: 17 })).toEqual({ areaId: 1, forwardsTo: 17 });
    expect(planEntryStub([1, 16], { entryAreaId: 1 }), 'already present → no stub').toBeNull();
    expect(planEntryStub([], { entryAreaId: 1 }), 'nothing to forward to → no stub').toBeNull();
    expect(planEntryStub([16], {}), 'no entryAreaId requested → no stub').toBeNull();
  });

  it('portGen1EclArchiveToGen2 with entryAreaId prepends a resolvable area-1 forwarder', () => {
    const block = makeGen1Block([0x00]); // a tiny real-shaped Gen1 block
    const glb = portGen1EclArchiveToGen2([{ id: 16, block }], { entryAreaId: 1 });
    const arch = decodeEclGlb(glb, 'ECL.GLB');
    expect(arch.blockSourceById(16), 'real area 16 still resolves').toBeDefined();
    const entry = arch.blockSourceById(1);
    expect(entry, 'injected area 1 resolves').toBeDefined();
    const dis = disassembleEclBlock(entry!, ECL_GEN2);
    expect(dis.instructions[0].mnemonic).toBe('NEWECL');
    expect(dis.instructions[0].args[0].word).toBe(16);
  });
});

describe('encodeEclGlb — pairs scripts to maps by id', () => {
  it('packs Gen2 blocks the loader reads back by area id', () => {
    const block = portGen1EclToGen2(makeGen1Block([0x00]));
    const glb = encodeEclGlb([{ id: 34, block }, { id: 7, block }]);
    const arch = decodeEclGlb(glb, 'ECL.GLB');
    expect([...arch.idToMember.keys()].sort((a, b) => a - b)).toEqual([7, 34]);
    expect(arch.idToMember.get(34)).toBe(1);
    expect(arch.idToMember.get(7)).toBe(2);
  });
});
