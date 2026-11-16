/**
 * Treasures of the Savage Frontier — opcode `0x42 LOAD_AREA_PIECES` (real retail bytes).
 *
 * This title carries one command the shared Gen1 table does not have. It was decoded here as an
 * opaque 1-operand extension with a trailing byte and left unhandled, which meant 19 of
 * ECL1.DAX's 30 blocks — including ECL1#16, the area the retail game OPENS in — emitted no
 * `loadFiles` at all and could not be mounted.
 *
 * It is really a 4-operand combined loader: `LOAD_AREA_PIECES area, set1, set2, set3`, doing in
 * one instruction what CoAB splits across `0x21 LOAD_FILES` and `0x37 LOAD_PIECES`. This file
 * carries the evidence for that frame, and — just as importantly — carries the reason the OLD
 * reading looked fine: both frames end on the same byte, so neither produces a bad opcode.
 *
 * WHAT IS NOT CLAIMED: no handler trace. Treasures' GAME.OVR keeps each command's operand count
 * as an immediate inside the handler (`mov al,N; push ax; lcall 0058:002a`) rather than in a
 * table, and the opcode→handler dispatch was not located, so the count could not be read off the
 * binary the way Pools of Darkness's was. The mapping of operands 1/2/3 onto wall sets 1/2/3 is
 * assumed from `0x37`'s own order; a wrong order still renders, just with the sets swapped.
 */
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  ECL_GEN1_SHORT_TREASURES, EclVm, disassembleSubroutine, loadDungeon, parseEclHeader,
  readDaxDataBlocks, type DungeonSources, type EclDialect,
} from '../src/index.js';

const TSF = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier';
const haveRetail = existsSync(resolve(TSF, 'ECL1.DAX')) && existsSync(resolve(TSF, 'GEO1.DAX'));

/** Gen1 addressing: vbase 0x7FFE, file offset = vaddr − 0x8000 + 2. */
const v2f = (vaddr: number): number => vaddr - 0x8000 + 2;

const hex = (raw: Uint8Array, vaddr: number, len: number): string =>
  [...raw.slice(v2f(vaddr), v2f(vaddr) + len)].map((b) => b.toString(16).padStart(2, '0')).join(' ');

async function daxIndex(file: string): Promise<Map<number, Uint8Array>> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(resolve(TSF, file))));
  return new Map(blocks.map((b) => [b.blockId, b.raw]));
}

/** The frame this repo used to decode 0x42 with, kept as the control. */
const OLD_READING: EclDialect = {
  ...ECL_GEN1_SHORT_TREASURES,
  opcodeOverrides: {
    ...ECL_GEN1_SHORT_TREASURES.opcodeOverrides,
    0x42: { wordSet: 1, trailingBytes: 1, mnemonic: 'TREASURES_EXT_42', uncertain: true },
  },
};

const entryOffsetOf = (raw: Uint8Array): number =>
  (parseEclHeader(raw, ECL_GEN1_SHORT_TREASURES) as unknown as { eclInitialEntry: number })
    .eclInitialEntry - 0x7ffe;

describe.skipIf(!haveRetail)('Treasures 0x42 LOAD_AREA_PIECES (real retail bytes)', () => {
  it('A. byte anchor: ECL1#16 writes game_area 16, then loads area 16 with sets 9/10/11', async () => {
    const b16 = (await daxIndex('ECL1.DAX')).get(16)!;
    expect(b16.length).toBe(10599);
    // SAVE #16 -> [0x0016]   (the game_area write)
    expect(hex(b16, 0x8083, 6)).toBe('09 00 10 01 16 00');
    // 42 <#16> <#9> <#10> <#11>   — four immediate operands, nine bytes
    expect(hex(b16, 0x8089, 9)).toBe('42 00 10 00 09 00 0a 00 0b');
    // ...and the next instruction is the arrival copy the town route already relies on.
    expect(hex(b16, 0x8092, 7)).toBe('09 01 eb 02 01 11 00');
  });

  it('B. position: each area block loads through exactly one of 0x21 / 0x42, and only 0x42 brings pieces', async () => {
    // Behaviour, not layout: run each block's real entry path and look at what it emits. (A linear
    // disassembly would count instructions the script jumps over.)
    const ecl = await daxIndex('ECL1.DAX');
    const geo = await daxIndex('GEO1.DAX');
    const viaLoadFiles: number[] = [];
    const viaLoadArea: number[] = [];
    const neither: number[] = [];
    for (const [id, raw] of [...ecl].sort((a, b) => a[0] - b[0])) {
      if (!geo.has(id)) continue; // block 4 is the attract script, not an area — see case C.
      const run = new EclVm(raw, { dialect: ECL_GEN1_SHORT_TREASURES }).run();
      const loads = run.effects.filter((e) => e.type === 'loadFiles');
      const pieces = run.effects.filter((e) => e.type === 'loadPieces');
      expect(loads.length, `block ${id} area loads`).toBeLessThanOrEqual(1);
      const load = loads[0] as { operands: number[] } | undefined;
      if (!load) {
        expect(pieces).toHaveLength(0);
        neither.push(id);
      } else if (load.operands.length === 4) {
        // Only the 4-operand loader carries a piece triple; nothing in this corpus calls 0x37.
        expect(pieces, `block ${id} pieces`).toHaveLength(1);
        viaLoadArea.push(id);
      } else {
        expect(load.operands).toHaveLength(2);
        expect(pieces, `block ${id} pieces`).toHaveLength(0);
        viaLoadFiles.push(id);
      }
    }
    expect(viaLoadArea).toEqual([16, 17, 18, 19, 23, 26, 27, 28, 29, 30, 31, 32, 35, 36, 37, 38, 39, 49, 50]);
    expect(viaLoadFiles).toEqual([20, 22, 24, 25, 33, 34, 40, 47, 51]);
    // One paired block loads no area on its entry path at all (21's own 0x42 sits at 0x8686, far
    // off it) — so pairing a GEO with an ECL is not the same thing as bootability.
    expect(neither).toEqual([21]);
  });

  it('C. necessity + operand domain: operand 0 is the area just written; 1..3 are real WALLDEF ids', async () => {
    const ecl = await daxIndex('ECL1.DAX');
    const geo = await daxIndex('GEO1.DAX');
    const wd = await daxIndex('WALLDEF1.DAX');
    const tiles = await daxIndex('8X8D1.DAX');
    // The two piece archives are keyed identically — a set id is meaningful in both.
    expect([...wd.keys()].sort((a, b) => a - b)).toEqual([1, 2, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect([...tiles.keys()].sort((a, b) => a - b)).toEqual([...wd.keys()].sort((a, b) => a - b));

    let sites = 0;
    for (const [id, raw] of ecl) {
      // Executed, not merely present: take the operands off the effect the real entry path emits.
      const run = new EclVm(raw, { dialect: ECL_GEN1_SHORT_TREASURES }).run();
      const load = run.effects.find((e) => e.type === 'loadFiles' && e.operands.length === 4) as
        { operands: number[] } | undefined;
      if (!load) continue;
      sites++;
      const ops = load.operands;
      expect(ops).toHaveLength(4);
      // Operand 0 is always a real GEO map, and for an AREA block it is that block's own id — the
      // same invariant the 0x21 sites satisfy. Block 4 is the exception that proves the rule: it
      // is the attract script (it has no GEO of its own) and it loads Llorkh, area 16, to narrate
      // over — with the identical set triple ECL1#16 uses for itself.
      expect(geo.has(ops[0]!), `block ${id} operand 0 is a GEO map`).toBe(true);
      if (geo.has(id)) expect(ops[0], `block ${id} operand 0`).toBe(id);
      else expect([id, ...ops]).toEqual([4, 16, 9, 10, 11]);
      // Operands 1..3 are real piece-set ids, or 0xFF for "no set" (the 0x37 convention).
      for (const op of ops.slice(1)) {
        expect(op === 0xff || wd.has(op), `block ${id} set id ${op}`).toBe(true);
      }
    }
    expect(sites).toBe(20);  // the 19 area blocks plus the attract script
  });

  it('D. the old 1-operand reading is not merely different — it decodes the impossible', async () => {
    const ecl = await daxIndex('ECL1.DAX');
    const b16 = ecl.get(16)!;

    // Decode from the load site itself under both frames. (Reading from the block entry would
    // reach neither: the entry branches past this arm.)
    const now = disassembleSubroutine(b16, v2f(0x8089), ECL_GEN1_SHORT_TREASURES);
    const before = disassembleSubroutine(b16, v2f(0x8089), OLD_READING);
    // Neither frame produces a bad opcode, which is exactly why the old reading looked healthy.
    expect(now.badOpcodeAt).toBeUndefined();
    expect(before.badOpcodeAt).toBeUndefined();
    expect(now.instructions[0]?.mnemonic).toBe('LOAD_AREA_PIECES');
    expect(before.instructions[0]?.mnemonic).toBe('TREASURES_EXT_42');

    // What the old frame actually produced at this site: a SAVE whose DESTINATION is an immediate
    // rather than a memory location, which the retail VM cannot execute — that is the
    // discriminator the "it re-lands on SAVE" argument missed. Under the real frame the same bytes
    // are operand data and no instruction starts there.
    const strayAddr = 0x8089 + 1 + 2 + 1; // opcode + one operand + the assumed trailing byte
    const stray = before.instructions.find((i) => i.vaddr === strayAddr);
    expect(stray?.mnemonic, `old reading at ${strayAddr.toString(16)}`).toBe('SAVE');
    expect(stray?.args.map((arg) => arg.kind)).toEqual(['imm', 'imm']);
    expect(now.instructions.some((i) => i.vaddr === strayAddr)).toBe(false);
    // Both frames resume at the same instruction, which is why nothing downstream ever complained.
    for (const listing of [now, before]) {
      expect(listing.instructions.some((i) => i.vaddr === 0x8092)).toBe(true);
    }
  });

  it('E. the VM now mounts Llorkh from its own script, with retail wall art instead of a fallback', async () => {
    const ecl = await daxIndex('ECL1.DAX');
    const geo = await daxIndex('GEO1.DAX');
    const wd = await daxIndex('WALLDEF1.DAX');
    const src: DungeonSources = {
      geoBlock: (id) => geo.get(id) ?? null,
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: () => null,
    };
    // No fallbackPieces — the script supplies its own triple.
    const dungeon = loadDungeon(ecl.get(16)!, src, {
      label: 'Treasures GEO1#16', dialect: ECL_GEN1_SHORT_TREASURES,
    });
    expect(dungeon.geoBlockId).toBe(16);
    expect(dungeon.pieces.setBlockIds).toEqual([9, 10, 11]);

    // The same run through the raw VM emits both effects, in that order.
    const run = new EclVm(ecl.get(16)!, { dialect: ECL_GEN1_SHORT_TREASURES }).run();
    const kinds = run.effects.filter((e) => e.type === 'loadFiles' || e.type === 'loadPieces').map((e) => e.type);
    expect(kinds.slice(0, 2)).toEqual(['loadFiles', 'loadPieces']);
    expect(run.status).toBe('exited');
  });
});
