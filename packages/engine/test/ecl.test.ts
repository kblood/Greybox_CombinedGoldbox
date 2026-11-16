/**
 * ECL disassembler tests (M2.S1).
 *
 * 1) Opcode-table sanity + synthetic-block framing (runs on any clone).
 * 2) Golden disassembly of the REAL CoK ECL1 block 18 against the hand-verified
 *    worked example in docs/engine/research/ecl-krynn-gen1-opcodes.md §4 (skipped
 *    cleanly when the game data is absent).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KRYNN_GEN1_OPCODES,
  disassembleEclBlock,
  readDaxDataBlocks,
  ECL_HEADER_LEN,
  ECL_GEN1_SHORT,
  ECL_POOL,
} from '../src/index.js';

describe('Krynn-Gen1 opcode table', () => {
  it('is dense and well-formed across 0x00..0x40', () => {
    for (let op = 0x00; op <= 0x40; op++) {
      const def = KRYNN_GEN1_OPCODES[op];
      expect(def, `opcode 0x${op.toString(16)}`).toBeDefined();
      expect(def.wordSet).toBeGreaterThanOrEqual(0);
      expect(def.mnemonic.length).toBeGreaterThan(0);
    }
    expect(KRYNN_GEN1_OPCODES[0x00].mnemonic).toBe('EXIT');
    expect(KRYNN_GEN1_OPCODES[0x20].mnemonic).toBe('NEWECL');
    expect(KRYNN_GEN1_OPCODES[0x29].wordSet).toBe(14); // ENCOUNTER_MENU, largest
    // The only handlerless entry is flagged uncertain; PARTY_SURPRISE is handler-backed.
    expect(KRYNN_GEN1_OPCODES[0x1f].uncertain).toBe(true);
    expect(KRYNN_GEN1_OPCODES[0x22].uncertain).toBeUndefined();
  });
});

describe('disassembleEclBlock — synthetic framing', () => {
  it('maps Pool early-Gen1 body offsets through the executable-derived 0x98FE base', () => {
    const raw = new Uint8Array(ECL_HEADER_LEN + 1);
    raw[0] = 0x88; raw[1] = 0x13;
    raw[20] = 0x14; raw[21] = 0x99;
    raw[ECL_HEADER_LEN] = 0x00;

    const block = disassembleEclBlock(raw, ECL_POOL);

    expect(ECL_POOL.vbase).toBe(0x98fe);
    expect(block.header.eclInitialEntry).toBe(0x9914);
    expect(block.instructions[0]).toMatchObject({ offset: 22, vaddr: 0x9914, mnemonic: 'EXIT' });
  });

  it('decodes 2- and 3-byte arg forms and stops at EXIT', () => {
    const header = new Uint8Array(ECL_HEADER_LEN);
    header[0] = 0x88; header[1] = 0x13; // magic = 0x1388
    const body = new Uint8Array([
      0x20, 0x00, 0x05, // NEWECL #5
      0x01, 0x01, 0x14, 0x80, // GOTO 0x8014  (arg code=1 → 3-byte, word=(0x80<<8)|0x14)
      0x09, 0x00, 0x12, 0x01, 0xf2, 0x4b, // SAVE #18, 0x4bf2
      0x00, // EXIT
      0x99, // trailing junk after EXIT must NOT be decoded
    ]);
    const raw = new Uint8Array([...header, ...body]);
    const block = disassembleEclBlock(raw);

    expect(block.header.magic).toBe(0x1388);
    expect(block.instructions.map((i) => i.mnemonic)).toEqual(['NEWECL', 'GOTO', 'SAVE', 'EXIT']);

    const [newecl, goto_, save] = block.instructions;
    expect(newecl.args[0]).toMatchObject({ code: 0x00, high: 5, word: 5, kind: 'imm' });
    expect(goto_.args[0]).toMatchObject({ code: 0x01, high: 0x14, val: 0x80, word: 0x8014, kind: 'word' });
    expect(save.args[0]).toMatchObject({ word: 18, kind: 'imm' });
    expect(save.args[1]).toMatchObject({ word: 0x4bf2, kind: 'word' });

    // First instruction sits right after the 22-byte header, at the canonical entry 0x8014.
    expect(newecl.offset).toBe(ECL_HEADER_LEN);
    expect(newecl.vaddr).toBe(0x8014);
  });

  it('flags an undefined opcode instead of throwing', () => {
    const raw = new Uint8Array(ECL_HEADER_LEN + 1);
    raw[ECL_HEADER_LEN] = 0xff; // not in the table
    const block = disassembleEclBlock(raw);
    expect(block.instructions).toHaveLength(0);
    expect(block.badOpcodeAt).toBe(ECL_HEADER_LEN);
  });

  it('frames 0x81 memory-string operands as three-byte operands', () => {
    const header = new Uint8Array(ECL_HEADER_LEN);
    header[0] = 0x88; header[1] = 0x13; // magic = 0x1388
    const body = new Uint8Array([
      0x12, 0x81, 0x00, 0x7c, // PRINTCLEAR string copied from runtime memory at 0x7C00
      0x11, 0x80, 0x0b, 0x80, 0x62, 0x4e, 0x11, 0x38, 0x01, 0x81, 0x44, 0x81, 0x42, 0xe0,
      0x1d, 0x00, 0x01, // PARTYSTRENGTH #1
      0x00,
    ]);
    const block = disassembleEclBlock(new Uint8Array([...header, ...body]));

    expect(block.badOpcodeAt).toBeUndefined();
    expect(block.instructions.map((i) => i.mnemonic)).toEqual(['PRINTCLEAR', 'PRINT', 'PARTYSTRENGTH', 'EXIT']);
    expect(block.instructions[0].args[0]).toMatchObject({
      code: 0x81,
      high: 0x00,
      val: 0x7c,
      word: 0x7c00,
      kind: 'string',
    });
    expect(block.instructions[1].args[0].text).toBe(' FINDS A TRAP.');
    expect(block.instructions[2].offset).toBe(ECL_HEADER_LEN + 18);
  });
});

describe('ECL_GEN1_SHORT — 1991+ short operand frames (DoK/Savage/PoD)', () => {
  // Real DoK ECL1#16 tail bytes (file offset 1799, dok-natural-route.md Update 8):
  // `1d | 01 01 89 81 | 01 01 89 81 | 00` — PARTYSTRENGTH (0 operands), GOTO 0x8189 twice, EXIT.
  const dokTail = [0x1d, 0x01, 0x01, 0x89, 0x81, 0x01, 0x01, 0x89, 0x81, 0x00];

  function block(body: number[]): Uint8Array {
    const header = new Uint8Array(ECL_HEADER_LEN);
    header[0] = 0x88;
    header[1] = 0x13;
    return new Uint8Array([...header, ...body]);
  }

  it('decodes 0x1D as zero-operand (Gen1 long frame desyncs the same bytes)', () => {
    const short = disassembleEclBlock(block(dokTail), ECL_GEN1_SHORT);
    expect(short.badOpcodeAt).toBeUndefined();
    expect(short.instructions.map((i) => i.mnemonic)).toEqual(['PARTYSTRENGTH', 'GOTO', 'GOTO', 'EXIT']);
    expect(short.instructions[1].args[0]).toMatchObject({ word: 0x8189, kind: 'word' });

    // The same bytes under the CoK long frame consume `01 01 89` as the PARTYSTRENGTH operand
    // and then hit 0x81 — not an opcode. That desync is exactly what hid DoK combats from scans.
    const long = disassembleEclBlock(block(dokTail));
    expect(long.badOpcodeAt).toBe(ECL_HEADER_LEN + 4);
  });

  it('decodes 0x2C PARLAY as one operand', () => {
    // DoK ECL1#2 shape: `2c 00 85` (PARLAY #133) followed by EXIT.
    const short = disassembleEclBlock(block([0x2c, 0x00, 0x85, 0x00]), ECL_GEN1_SHORT);
    expect(short.badOpcodeAt).toBeUndefined();
    expect(short.instructions.map((i) => i.mnemonic)).toEqual(['PARLAY', 'EXIT']);
    expect(short.instructions[0].args).toHaveLength(1);
    expect(short.instructions[0].size).toBe(3);
  });

  it('keeps the Gen1 header/vbase conventions (only operand frames differ)', () => {
    expect(ECL_GEN1_SHORT).toMatchObject({ headerLen: 22, vbase: 0x7ffe, hasMagic: true });
    // 0x23=0 and 0x0c=4 added 2026-07-23 from DoK's own GAME.OVR handler disassembly (0x23 @
    // 0x3076 fetches no operands + tail-calls CMD_Exit; 0x0C @ 0xBAC is vm_LoadCmdSets(4)) —
    // see ECL_GEN1_SHORT's doc comment for the corpus audit.
    expect(ECL_GEN1_SHORT.wordSetOverrides).toEqual({ 0x0c: 4, 0x1d: 0, 0x22: 0, 0x23: 0, 0x2c: 1 });
    // 0x21 LOAD_FILES stays at the shared Gen1 three-operand frame (proven for DoK by
    // ECL1#34's `LOAD_FILES #34,#127,#255` and whole-block exact parses of ECL1#2).
    expect(ECL_GEN1_SHORT.wordSetOverrides?.[0x21]).toBeUndefined();
    expect(KRYNN_GEN1_OPCODES[0x21].wordSet).toBe(3);
  });
});

// --- Golden: real CoK ECL1 block 18 (skips if game data absent) -------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const ecl1Path = resolve(repoRoot, 'Champions of Krynn', 'ECL1.DAX');

describe('disassembleEclBlock — golden CoK ECL1 block 18', () => {
  it.skipIf(!existsSync(ecl1Path))('matches the research worked example', async () => {
    const bytes = new Uint8Array(await readFile(ecl1Path));
    const blocks = readDaxDataBlocks(bytes);
    const blk18 = blocks.find((b) => b.blockId === 18);
    expect(blk18, 'ECL1 must contain block 18').toBeDefined();

    const block = disassembleEclBlock(blk18!.raw);

    // Header: magic is the game-global VM dispatch constant; the entry pointer is 0x8014.
    expect(block.header.magic).toBe(0x1388);
    expect(block.header.vmRun1).toBe(0x8085); // first far pointer (EclDump ground truth)
    expect(block.header.eclInitialEntry).toBe(0x8014);

    // Main subroutine mnemonic sequence, from entry 0x8014 to the EXIT at 0x8083. Verified
    // byte-for-byte against EclDump (daxdump_extracted/ECL1_018.txt): three opening SAVEs
    // (inDungeon, word_270, LastEclBlockId), then the area-transition COMPARE/IF=/GOTO idiom.
    const expected = [
      'SAVE', 'SAVE', 'SAVE', 'COMPARE', 'IF_EQ', 'GOTO', 'SAVE', 'SAVE',
      'PROGRAM', 'SAVE', 'SAVE', 'COMPARE', 'IF_EQ', 'GOTO', 'SAVE', 'NEWECL',
      'COMPARE', 'IF_EQ', 'GOTO', 'SAVE', 'NEWECL', 'SAVE', 'SAVE', 'NEWECL', 'EXIT',
    ];
    expect(block.instructions.map((i) => i.mnemonic)).toEqual(expected);
    expect(block.badOpcodeAt).toBeUndefined();

    // The three NEWECL chain targets are modules 80, 97, 68 (EclDump: load ECL 80/97/68).
    const neweclTargets = block.instructions
      .filter((i) => i.mnemonic === 'NEWECL')
      .map((i) => i.args[0].word);
    expect(neweclTargets).toEqual([80, 97, 68]);

    // EXIT is the final instruction at virtual 0x8083 (EclDump: "0x8083 0x00 EXIT").
    const last = block.instructions[block.instructions.length - 1];
    expect(last.mnemonic).toBe('EXIT');
    expect(last.vaddr).toBe(0x8083);
  });
});
