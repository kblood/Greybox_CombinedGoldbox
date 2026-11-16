/**
 * Pools of Darkness — Amiga wall art over DOS wall geometry.
 *
 * The premise behind every "swap the art, keep the game" toggle in this engine is that a Gold Box
 * port changes pixels, not wall geometry. `DungeonWallSources.decodeTileBlock` asserts that for
 * the Amiga `.DAA` titles (CoK/DoK). This file MEASURES it for a GLIB/DataLib-era title instead of
 * assuming it carries over, because GLIB is a different container generation with a different
 * endianness, a different set/master structure, and its own id tables.
 *
 * The four things that have to hold for the swap to be faithful, each asserted below:
 *   A. the Amiga WALLDEF records are byte-identical to the DOS ones,
 *   B. the Amiga tile master's id table names the same block ids as the DOS 8X8D archive,
 *   C. the banks are the same shape on both platforms (256 tiles of 8x8), so an index valid on
 *      one is valid on the other,
 *   D. `loadDungeonWalls` accepts the Amiga banks through `tileSetForBlock` and produces a
 *      DungeonWalls whose geometry matches the DOS build tile-for-tile while the PIXELS differ.
 *
 * D is the one that could still fail after A-C pass, and it is the one that would actually be
 * visible to a player, so it is asserted on real lookups rather than on counts.
 *
 * Retail bytes are read from the local installs; the test skips (rather than fails) when either
 * source is absent, since neither the GOG install nor the Amiga WHDLoad set is vendored.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { decodeDax } from '../src/loaders/dax.js';
import { decodeGlib, glibIdTable } from '../src/loaders/glib.js';
import { glibTileBanks, readGlibIdTable } from '../src/loaders/glibTileBank.js';
import { decode8x8dBlock } from '../src/loaders/tiles8x8.js';
import { loadDungeonWalls } from '../src/world/dungeonWalls.js';

const DOS = 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness';
const AMIGA =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2';

const have = existsSync(`${DOS}/WALLDEF1.DAX`) && existsSync(`${AMIGA}/WALLDEF.GLB`);
const maybe = have ? describe : describe.skip;

const read = (p: string) => new Uint8Array(readFileSync(p));

maybe('Pools of Darkness — Amiga GLIB wall art over DOS wall geometry', () => {
  it('A. the Amiga WALLDEF.GLB records are byte-identical to the DOS WALLDEF1.DAX blocks', () => {
    const dos = decodeDax(read(`${DOS}/WALLDEF1.DAX`), 'WALLDEF1.DAX');
    const amiga = decodeGlib(read(`${AMIGA}/WALLDEF.GLB`), 'WALLDEF.GLB');

    // A DATA library, so decodeGlib exposes raw members rather than images.
    expect(amiga.nonImage).toBe(true);
    expect(amiga.tag).toBe('DATA');

    const idTable = readGlibIdTable(read(`${AMIGA}/WALLDEF.GLB`).subarray(48, 74));
    expect([...(idTable ?? new Map())]).toEqual([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]]);

    const dosById = new Map(dos.blocks.map((b) => [b.blockId, b.raw]));
    expect([...dosById.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);

    // rawMembers skips the id table, so member i-1 is walldef id i.
    for (const [blockId, memberIndex] of idTable!) {
      const d = dosById.get(blockId)!;
      const a = amiga.rawMembers[memberIndex - 1];
      expect(d.length, `walldef ${blockId} length`).toBe(2340);
      expect(a.length, `walldef ${blockId} amiga length`).toBe(2340);
      expect(Buffer.from(a).equals(Buffer.from(d)), `walldef ${blockId} bytes`).toBe(true);
    }
  });

  it('B+C. the Amiga tile master names the same block ids, with banks of the same shape', () => {
    const bytes = read(`${AMIGA}/8X8D.TLB`);
    const archive = decodeGlib(bytes, '8X8D.TLB');
    const banks = glibTileBanks(archive, glibIdTable(bytes));

    expect(banks.idTableUsed).toBe(true);
    expect([...banks.banks.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);

    const dos = decodeDax(read(`${DOS}/8X8D1.DAX`), '8X8D1.DAX');
    for (const b of dos.blocks) {
      const dosSet = decode8x8dBlock(b.raw, `dos#${b.blockId}`);
      const amigaSet = banks.banks.get(b.blockId)!;
      expect(dosSet.tiles.length, `dos bank ${b.blockId}`).toBe(256);
      expect(amigaSet.tiles.length, `amiga bank ${b.blockId}`).toBe(256);
      expect([amigaSet.tileWidth, amigaSet.tileHeight]).toEqual([8, 8]);
      expect([dosSet.tiles[0].width, dosSet.tiles[0].height]).toEqual([8, 8]);
    }
  });

  it('D. loadDungeonWalls builds the same geometry from either art source, with different pixels', () => {
    const walldef = decodeDax(read(`${DOS}/WALLDEF1.DAX`), 'WALLDEF1.DAX');
    const wdIdx = new Map(walldef.blocks.map((b) => [b.blockId, b.raw]));
    const tiles0 = decodeDax(read(`${DOS}/8X8D0.DAX`), '8X8D0.DAX');
    const tiles1 = decodeDax(read(`${DOS}/8X8D1.DAX`), '8X8D1.DAX');
    const dosTiles = new Map([...tiles0.blocks, ...tiles1.blocks].map((b) => [b.blockId, b.raw]));

    const amigaBytes = read(`${AMIGA}/8X8D.TLB`);
    const amigaBanks = glibTileBanks(decodeGlib(amigaBytes, '8X8D.TLB'), glibIdTable(amigaBytes));

    // The routed Pools area's own source-backed fallback piece set.
    const setBlockIds = [1, 255, 255] as const;
    const base = {
      walldefBlock: (id: number) => wdIdx.get(id) ?? null,
      tileBlock: (id: number) => dosTiles.get(id) ?? null,
    };
    const dosWalls = loadDungeonWalls(setBlockIds, base);
    const amigaWalls = loadDungeonWalls(setBlockIds, {
      ...base,
      // Only the wall banks come from the Amiga master; the boot/UI sets 0 and 4 live in
      // 8X8DA.TLB on a different disk and are deliberately left on the DOS art here, which is
      // exactly what `tileSetForBlock` returning null for them expresses.
      tileSetForBlock: (id: number) => amigaBanks.banks.get(id) ?? null,
    });

    // Geometry is read from WALLDEF, which A proved identical — so it must agree exactly.
    for (const wallset of [0, 1, 2]) {
      for (const slice of [0, 1, 2, 3, 4]) {
        for (const col of [0, 1, 2, 3, 4, 5]) {
          expect(amigaWalls.readId(wallset, slice, col), `readId(${wallset},${slice},${col})`)
            .toBe(dosWalls.readId(wallset, slice, col));
        }
      }
    }

    // And the art must actually differ, or the toggle would be a no-op dressed up as a feature.
    const blit = { set: 1, index: 40, tileId: 40, wallset: 0 };
    const dosTile = dosWalls.lookupTile(blit);
    const amigaTile = amigaWalls.lookupTile(blit);
    expect(dosTile).not.toBeNull();
    expect(amigaTile).not.toBeNull();
    expect([amigaTile!.width, amigaTile!.height]).toEqual([dosTile!.width, dosTile!.height]);
    expect(Buffer.from(amigaTile!.indices).equals(Buffer.from(dosTile!.indices))).toBe(false);

    // The Amiga art carries a real 32-colour table; the DOS side is fixed EGA-16.
    expect(amigaWalls.tileSets[1]?.palette).toBeTruthy();
  });
});
