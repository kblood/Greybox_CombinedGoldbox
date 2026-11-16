/**
 * RANDCOM classification (Gap G4) — proven on REAL CoK bytes.
 *
 * The port plan's Gap G4 ("RANDCOM = random-encounter combat tables, not yet ported") rests on a
 * filename inference that the REAL bytes disprove: `RANDCOM.DAX` is a **graphics** archive — combat
 * backdrop tiles, exactly like `DUNGCOM.DAX` / `WILDCOM.DAX` — not a random-encounter data table. This
 * is confirmed two ways:
 *
 *  1) The COAB clean-room decompile loads it as art: `ovr011.cs` →
 *     `ovr034.Load24x24Set(6, 0x22, 1, "RandCom")` (a 24×24 tile-set loader, same call shape as
 *     DUNGCOM/WILDCOM), NOT as any encounter table.
 *  2) Decoding `RANDCOM.DAX` here yields a single block that parses as a **24×24 tile-set** (the DAX
 *     `parseTileSet` path: height 24, width 24, item_count 6, exact-consume 17 + 6·288 = 1745), with
 *     real pixel images — never a data block.
 *
 * Conclusion (no code to write for "RANDCOM the table"): there is no separate random-encounter table to
 * port. In the Gold Box engine, wilderness/random encounters are driven by the **area ECL scripts**
 * (the overland ECL calls combat with monster ids), which already port through `portGen1EclArchiveToGen2`
 * + the area-1 entry stub. So G4 is resolved by classification, not by a new loader. This test pins the
 * classification so a future "port RANDCOM as data" attempt fails loudly here first.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeDax } from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const cokRandcom = resolve(repoRoot, 'Champions of Krynn', 'RANDCOM.DAX');

describe('RANDCOM (Gap G4) — is graphics, not a data table', () => {
  it.skipIf(!existsSync(cokRandcom))('CoK RANDCOM.DAX decodes as a 24×24 combat-backdrop tile-set', async () => {
    const arch = decodeDax(new Uint8Array(await readFile(cokRandcom)), 'RANDCOM');
    expect(arch.blocks.length).toBe(1);
    const blk = arch.blocks[0];
    // It is a graphics tile-set (the DUNGCOM/WILDCOM family), not a 'complex'/data block.
    expect(blk.kind).toBe('tileset');
    expect(blk.frames, 'tile-set frames present').toBeDefined();
    expect(blk.frames!.length).toBe(6); // item_count = 6 backdrop tiles
    // 24×24 tiles (matches COAB Load24x24Set("RandCom")).
    for (const f of blk.frames!) {
      expect(f.width).toBe(24);
      expect(f.height).toBe(24);
      expect(f.indices.length).toBe(24 * 24);
    }
    // Exact-consume sanity: header 17 + 6 × (24·24/2) = 1745.
    expect(blk.rawSize).toBe(17 + 6 * ((24 * 24) / 2));
  });
});
