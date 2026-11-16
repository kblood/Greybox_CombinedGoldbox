/**
 * GEO content port (E3.1) — emit the DQK Gen2 GEO format from a decoded map. Each encoder is the
 * exact inverse of the Gen2 decoder:
 *
 *  1) Block round-trip: synthetic planes → `encodeGen2GeoBlock` → `decodeGen2GeoBlock` → byte-identical
 *     planes + matching cells + preserved reserved header.
 *  2) Archive round-trip: maps → `encodeGen2GeoArchive` → `decodeHlib().rawMembers` →
 *     `decodeGen2GeoArchive` → ids + grids match (the GEO.GLB id-table pairing).
 *  3) Real content port (skip when CoK data absent): a real `GEO1.DAX` Gen1 map → `portGen1GeoToGen2`
 *     → decode on the Gen2 path → every cell's walls/doors/floor matches the Gen1 original (a CoK
 *     dungeon now loads through the DQK GEO loader).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeGeoBlock,
  decodeGen2GeoBlock,
  decodeGen2GeoArchive,
  decodeHlib,
  readDaxDataBlocks,
  sniffGeoBlock,
  encodeGen2GeoBlock,
  encodeGen2GeoArchive,
  portGen1GeoToGen2,
  type GeoDecodeResult,
} from '../src/index.js';

/** A deterministic Gen2-style GEO result with W×H planes carrying varied wall/door/floor bytes. */
function synthGeo(width: number, height: number, seed = 1): GeoDecodeResult {
  const n = width * height;
  const p0 = new Uint8Array(n), p1 = new Uint8Array(n), p2 = new Uint8Array(n), p3 = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    p0[i] = (i * 7 + seed) & 0xff;
    p1[i] = (i * 13 + seed) & 0xff;
    p2[i] = (i * 3 + seed) & 0xff;
    p3[i] = (i * 5 + seed) & 0xff;
  }
  // Reuse the real plane→GameMap assembly via the Gen2 decoder on a freshly-built block.
  const blk = new Uint8Array(8 + 4 * n);
  blk[0] = width; blk[1] = height;
  blk.set(p0, 8); blk.set(p1, 8 + n); blk.set(p2, 8 + 2 * n); blk.set(p3, 8 + 3 * n);
  return decodeGen2GeoBlock(blk, 'synth');
}

function cellsEqual(a: GeoDecodeResult, b: GeoDecodeResult): void {
  expect(b.map.width).toBe(a.map.width);
  expect(b.map.height).toBe(a.map.height);
  for (let i = 0; i < a.map.cells.length; i++) {
    expect(b.map.cells[i].walls, `cell ${i} walls`).toEqual(a.map.cells[i].walls);
    expect(b.map.cells[i].doors, `cell ${i} doors`).toEqual(a.map.cells[i].doors);
    expect(b.map.cells[i].floor, `cell ${i} floor`).toBe(a.map.cells[i].floor);
  }
}

describe('encodeGen2GeoBlock — block round-trip', () => {
  it('reproduces planes, cells, and the reserved header', () => {
    const geo = synthGeo(12, 9, 3);
    const header = Uint8Array.from([1, 2, 3, 4, 5, 6]);
    const bytes = encodeGen2GeoBlock(geo, header);
    expect(bytes.length).toBe(8 + 4 * 12 * 9);
    const back = decodeGen2GeoBlock(bytes, 'rt', 42, 1);
    expect(Array.from(back.wallPlane0)).toEqual(Array.from(geo.wallPlane0));
    expect(Array.from(back.doorPlane)).toEqual(Array.from(geo.doorPlane));
    expect(Array.from(back.header)).toEqual([1, 2, 3, 4, 5, 6]);
    cellsEqual(geo, back);
  });

  it.each([[1.5, 2], [2, 1.5]])('rejects fractional dimensions %s×%s with matching planes', (width, height) => {
    // Build valid three-byte planes first; inject fractions only after decoding.
    const geo = synthGeo(1, 3);
    expect(() => encodeGen2GeoBlock({ ...geo, map: { ...geo.map, width, height } }))
      .toThrow(`GEO(gen2) encode: W/H must be 1..255, got ${width}×${height}`);
  });

  it('rejects an oversized map and mismatched planes', () => {
    const geo = synthGeo(8, 8);
    expect(() => encodeGen2GeoBlock({ ...geo, map: { ...geo.map, width: 300 } })).toThrow();
    expect(() => encodeGen2GeoBlock({ ...geo, wallPlane0: new Uint8Array(3) })).toThrow();
  });
});

describe('encodeGen2GeoArchive — GEO.GLB round-trip', () => {
  it('packs an id table + maps the Gen2 archive decoder reads back', () => {
    const entries = [
      { id: 34, geo: synthGeo(10, 10, 1) },
      { id: 7, geo: synthGeo(16, 12, 2) },
      { id: 99, geo: synthGeo(20, 8, 3) },
    ];
    const glb = encodeGen2GeoArchive(entries);
    const arc = decodeHlib(glb, 'GEO.GLB');
    expect(arc.nonImage).toBe(true);
    const maps = decodeGen2GeoArchive(arc.rawMembers, 'GEO');
    expect(maps).toHaveLength(entries.length);
    expect(maps.map((m) => m.id)).toEqual([34, 7, 99]); // id-table pairing preserved
    for (let i = 0; i < entries.length; i++) cellsEqual(entries[i].geo, maps[i]);
  });
});

// --- Real content port (skip when CoK data is absent) -------------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const geo1Path = resolve(repoRoot, 'Champions of Krynn', 'GEO1.DAX');

describe('portGen1GeoToGen2 — real CoK GEO1.DAX map onto the DQK GEO path', () => {
  it.skipIf(!existsSync(geo1Path))('a Gen1 CoK map loads losslessly through the Gen2 decoder', async () => {
    const bytes = new Uint8Array(await readFile(geo1Path));
    const blocks = readDaxDataBlocks(bytes).filter((b) => sniffGeoBlock(b.raw));
    expect(blocks.length, 'GEO1.DAX must hold at least one 1026-byte GEO map').toBeGreaterThan(0);

    // Port the first few real CoK dungeon maps and verify the walkable grid survives the format change.
    for (const b of blocks.slice(0, 3)) {
      const gen1 = decodeGeoBlock(b.raw, `cok/geo${b.blockId}`);
      const ported = portGen1GeoToGen2(gen1);
      const gen2 = decodeGen2GeoBlock(ported, `cok/geo${b.blockId}`, b.blockId, 1);
      expect(gen2.map.width).toBe(16);
      expect(gen2.map.height).toBe(16);
      cellsEqual(gen1, gen2);
    }

    // And the whole set packs into one GEO.GLB the Gen2 archive walker reads back by id.
    const entries = blocks.slice(0, 5).map((b) => ({ id: b.blockId, geo: decodeGeoBlock(b.raw, `g${b.blockId}`) }));
    const maps = decodeGen2GeoArchive(decodeHlib(encodeGen2GeoArchive(entries), 'GEO').rawMembers, 'GEO');
    expect(maps).toHaveLength(entries.length);
    for (let i = 0; i < entries.length; i++) cellsEqual(entries[i].geo, maps[i]);
  });
});
