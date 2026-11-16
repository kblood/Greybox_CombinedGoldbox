/**
 * Treasures of the Savage Frontier dungeon load-path golden (2026-07-19, "walk any area" picker).
 *
 * Treasures' `ECL1.DAX` (its only disk) exposed a genuine format delta beyond the shared 1991+
 * "short form" dialect (`ECL_GEN1_SHORT`, DoK/Gateway/PoD): LOAD_FILES (0x21) itself decodes
 * cleanly only under Gen2's own 2-operand short frame, not Gen1's 3-operand one — every reachable
 * area script desyncs into a bad-opcode halt a few bytes past its own LOAD_FILES operands under
 * the plain frame. `ECL_GEN1_SHORT_TREASURES` carries this override; DoK/Gateway/PoD are left on
 * the shared `ECL_GEN1_SHORT` since their own corpora are independently proven fine under the
 * 3-operand frame (see that constant's doc comment in `ecl/disassemble.ts`).
 *
 * A second, independent delta: unlike CoK/DoK's own init blocks, NONE of `ECL1.DAX`'s 30 blocks
 * ever call LOAD_PIECES (verified by running every one of them, even under the LOAD_FILES fix) —
 * its wilderness-encounter scripts (LOAD_FILES then an immediate `encounterSurprise`) apparently
 * reuse a wall/tile set the host is expected to already have loaded, not per-encounter. This golden
 * pins `loadDungeon`'s `fallbackPieces` opt-in escape hatch (added alongside this file) against real
 * bytes: WALLDEF1 block 1 (the only real wall set on this disk) is supplied as the set-1 default.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readDaxDataBlocks,
  loadDungeon,
  EclVm,
  ECL_GEN1_SHORT_TREASURES,
  ECL_GEN1_SHORT,
  type DungeonSources,
} from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const dir = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier';
const have = ['ECL1.DAX', 'GEO1.DAX', 'WALLDEF1.DAX'].every((f) => existsSync(resolve(dir, f)));
void here;

async function daxIndex(file: string): Promise<Map<number, Uint8Array>> {
  const blocks = readDaxDataBlocks(new Uint8Array(await readFile(resolve(dir, file))));
  return new Map(blocks.map((b) => [b.blockId, b.raw]));
}

describe.skipIf(!have)('Treasures of the Savage Frontier dungeon load path (real bytes)', () => {
  it('boots ECL1 area 20 under ECL_GEN1_SHORT_TREASURES + a fallback WALLDEF piece set', async () => {
    const ecl = await daxIndex('ECL1.DAX');
    const geo = await daxIndex('GEO1.DAX');
    const wd = await daxIndex('WALLDEF1.DAX');
    const src: DungeonSources = {
      geoBlock: (id) => geo.get(id) ?? null,
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: () => null,
    };
    const d = loadDungeon(ecl.get(20)!, src, {
      label: 'Treasures GEO1#20',
      dialect: ECL_GEN1_SHORT_TREASURES,
      fallbackPieces: [1, 0xff, 0xff],
    });
    expect(d.geoBlockId).toBe(20);
    expect(d.map.width).toBe(16);
    expect(d.map.height).toBe(16);
    expect(d.map.cells.length).toBe(256);
    // No script-supplied LOAD_PIECES — the fallback triple came through verbatim.
    expect(d.pieces.setBlockIds).toEqual([1, 0xff, 0xff]);
  });

  /**
   * CORRECTION (2026-08-08). This case used to assert the opposite — that area 16 "still refuses
   * to boot" because it "never calls LOAD_FILES at all". The refusal was real but the reason was
   * ours: block 16 loads its area through `0x42 LOAD_AREA_PIECES`, Treasures' own combined
   * loader, which this repo decoded as an opaque 1-operand extension and left unhandled. Block 16
   * is Llorkh, the area the retail game OPENS in; it was never a "dialogue/menu script, not a
   * dungeon". See `ECL_GEN1_SHORT_TREASURES`'s `0x42` doc comment for the evidence.
   *
   * The surviving point of the original case — that `eclInitBlock` needs a bootability sweep and
   * not merely a GEO/ECL pairing check — is kept below as its own assertion.
   */
  it('area 16 (Llorkh, the opening area) boots through its own 0x42 loader, pieces and all', async () => {
    const ecl = await daxIndex('ECL1.DAX');
    const geo = await daxIndex('GEO1.DAX');
    const wd = await daxIndex('WALLDEF1.DAX');
    const src: DungeonSources = {
      geoBlock: (id) => geo.get(id) ?? null,
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: () => null,
    };
    // No fallbackPieces: the script supplies its own triple, which is the whole point.
    const d = loadDungeon(ecl.get(16)!, src, {
      label: 'Treasures GEO1#16',
      dialect: ECL_GEN1_SHORT_TREASURES,
    });
    expect(d.geoBlockId).toBe(16);
    expect(d.map.width).toBe(16);
    expect(d.map.height).toBe(16);
    // Byte-exact: ECL1#16's entry is `SAVE #16 -> [0x0016]` then `42 00 10 00 09 00 0a 00 0b`.
    expect(d.pieces.operands).toEqual([9, 10, 11]);
    expect(d.pieces.setBlockIds).toEqual([9, 10, 11]);
    // ...and all three are real WALLDEF1.DAX blocks, so the walk renders retail art rather than
    // the placeholder set the fallback used to supply.
    for (const id of d.pieces.setBlockIds) expect(wd.has(id)).toBe(true);
  });

  it('a bootability sweep is still required: not every GEO/ECL pairing is a mountable area', async () => {
    // The original point of the case above, kept: `listPairedGen1Areas`-style pairing says block 21
    // is an area (both archives hold a block 21), but its INIT path emits no area load of either
    // kind — its one 0x42 sits at 0x8686, far off the entry path. Pairing is necessary, not
    // sufficient. (11 of the 30 blocks still need `fallbackPieces`: those load through 0x21, which
    // carries no piece triple. Only the 0x42 half became self-sufficient.)
    const ecl = await daxIndex('ECL1.DAX');
    const geo = await daxIndex('GEO1.DAX');
    const wd = await daxIndex('WALLDEF1.DAX');
    expect(geo.has(21) && ecl.has(21)).toBe(true);
    const src: DungeonSources = {
      geoBlock: (id) => geo.get(id) ?? null,
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: () => null,
    };
    expect(() =>
      loadDungeon(ecl.get(21)!, src, {
        label: 'Treasures GEO1#21',
        dialect: ECL_GEN1_SHORT_TREASURES,
        fallbackPieces: [1, 0xff, 0xff],
      }),
    ).toThrow(/LOAD_FILES/);
  });

  it('the plain (non-Treasures) short dialect halts on a bad opcode a few bytes past the same LOAD_FILES', async () => {
    // Sanity check that `ECL_GEN1_SHORT_TREASURES`'s override is load-bearing, not cosmetic: run
    // the VM directly (not through `loadDungeon`, which only cares whether `loadFiles` fired at
    // all) under both dialects on the same real block. The plain 3-operand frame still emits a
    // `loadFiles` effect (its first operand reads the same regardless of trailing operand count)
    // but then desyncs into a bad-opcode halt instead of the real script's own clean `EXIT`.
    const ecl = await daxIndex('ECL1.DAX');
    const raw = ecl.get(20)!;

    const withTreasuresDialect = new EclVm(raw, { dialect: ECL_GEN1_SHORT_TREASURES }).run();
    expect(withTreasuresDialect.status).toBe('exited');
    expect(withTreasuresDialect.effects.map((e) => e.type)).toContain('loadFiles');

    const withPlainDialect = new EclVm(raw, { dialect: ECL_GEN1_SHORT }).run();
    expect(withPlainDialect.status).toBe('halted');
    expect(withPlainDialect.haltReason).toMatch(/bad opcode/);
  });

  it('without fallbackPieces, the strict original behavior still throws on this block', async () => {
    const ecl = await daxIndex('ECL1.DAX');
    const geo = await daxIndex('GEO1.DAX');
    const wd = await daxIndex('WALLDEF1.DAX');
    const src: DungeonSources = {
      geoBlock: (id) => geo.get(id) ?? null,
      walldefBlock: (id) => wd.get(id) ?? null,
      tileBlock: () => null,
    };
    expect(() =>
      loadDungeon(ecl.get(20)!, src, { label: 'Treasures GEO1#20 (no fallback)', dialect: ECL_GEN1_SHORT_TREASURES }),
    ).toThrow(/LOAD_PIECES/);
  });
});
