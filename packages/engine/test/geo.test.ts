/**
 * GEO map decoder tests (M1.S4; layout corrected 2026-06-21 to the COAB nibble model).
 *
 * 1) Synthetic block: nibble-packed plane layout (plane0 = (N<<4)|E, plane1 = (S<<4)|W),
 *    all four explicit per-cell walls, backdrop/door planes, and Explorer collision.
 * 2) Golden: real CoK GEO1 block 32 — verifies the nibble unpack against the raw bytes AND
 *    asserts the wall-edge symmetry signature that proved the layout (skips if data absent).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeGeoBlock,
  decodeWallByte,
  doorFlag,
  readDaxDataBlocks,
  Explorer,
  GEO_GRID,
  GEO_BLOCK_SIZE,
  decodeGen2GeoBlock,
  decodeGen2GeoArchive,
  sniffGen2GeoBlock,
  GEN2_GEO_HEADER,
  decodeHlib,
} from '../src/index.js';

// Build a 1026-byte GEO block from four 256-byte planes.
function makeBlock(p0: Uint8Array, p1: Uint8Array, p2: Uint8Array, p3: Uint8Array): Uint8Array {
  const raw = new Uint8Array(GEO_BLOCK_SIZE);
  raw[0] = 0x00; raw[1] = 0x04; // 1024
  raw.set(p0, 2);
  raw.set(p1, 258);
  raw.set(p2, 514);
  raw.set(p3, 770);
  return raw;
}
const zeros = () => new Uint8Array(256);
const idx = (x: number, y: number) => y * GEO_GRID + x;

describe('decodeGeoBlock — synthetic', () => {
  it('unpacks all four walls from the two nibble-packed planes', () => {
    const p0 = zeros();
    const p1 = zeros();
    // Cell (2,2): North slot 3, East slot 5  →  plane0 = (3<<4)|5 = 0x35
    p0[idx(2, 2)] = 0x35;
    // Cell (2,2): South slot 7, West slot 1  →  plane1 = (7<<4)|1 = 0x71
    p1[idx(2, 2)] = 0x71;
    const block = decodeGeoBlock(makeBlock(p0, p1, zeros(), zeros()), 'syn');

    expect(block.map.width).toBe(16);
    expect(block.map.height).toBe(16);
    expect(block.map.cells).toHaveLength(256);
    expect(block.map.sharedEdges).toBe(false);

    const w = block.map.cells[idx(2, 2)].walls;
    expect(w).toEqual({ north: 3, east: 5, south: 7, west: 1 });
    // Open everywhere else.
    expect(block.map.cells[idx(5, 5)].walls).toEqual({ north: 0, east: 0, south: 0, west: 0 });
  });

  it('decodes a wall slot into its WALLDEF set/variant routing', () => {
    expect(decodeWallByte(0)).toEqual({ raw: 0, slot: 0, wallset: -1, slice: -1 });
    expect(decodeWallByte(1)).toEqual({ raw: 1, slot: 1, wallset: 0, slice: 0 });
    expect(decodeWallByte(6)).toEqual({ raw: 6, slot: 6, wallset: 1, slice: 0 }); // (6-1)/5=1
    expect(decodeWallByte(15)).toEqual({ raw: 15, slot: 15, wallset: 2, slice: 4 }); // (15-1)/5=2,%5=4
  });

  it('extracts 2-bit door flags per direction from a plane-3 byte', () => {
    // N=1, E=2, S=3, W=0  →  byte = (0<<6)|(3<<4)|(2<<2)|(1<<0) = 0x39
    const b = (0 << 6) | (3 << 4) | (2 << 2) | (1 << 0);
    expect(doorFlag(b, 'north')).toBe(1);
    expect(doorFlag(b, 'east')).toBe(2);
    expect(doorFlag(b, 'south')).toBe(3);
    expect(doorFlag(b, 'west')).toBe(0);
  });

  it('produces a map the Explorer walks with correct collision', () => {
    const p0 = zeros();
    const p1 = zeros();
    // East wall on (3,3): plane0 low nibble (East) non-zero → blocks eastward step.
    p0[idx(3, 3)] = 0x02;
    const { map } = decodeGeoBlock(makeBlock(p0, p1, zeros(), zeros()), 'walk');
    const ex = new Explorer(map, { x: 3, y: 3, facing: 'east' });
    expect(ex.forward().moved).toBe(false); // blocked by east wall
    ex.turnRight(); // now facing south
    expect(ex.forward().moved).toBe(true); // open south
    expect(ex.getPose()).toMatchObject({ x: 3, y: 4 });
  });

  it('rejects a malformed block', () => {
    expect(() => decodeGeoBlock(new Uint8Array(10))).toThrow(/expected a 1026/);
  });
});

// --- Golden: real CoK GEO1 block 32 (skips if data absent) ------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const geo1Path = resolve(repoRoot, 'Champions of Krynn', 'GEO1.DAX');

describe('decodeGeoBlock — golden CoK GEO1 block 32', () => {
  it.skipIf(!existsSync(geo1Path))('unpacks nibble walls and shows shared-edge symmetry', async () => {
    const bytes = new Uint8Array(await readFile(geo1Path));
    const blocks = readDaxDataBlocks(bytes);
    const blk32 = blocks.find((b) => b.blockId === 32);
    expect(blk32, 'GEO1 must contain block 32').toBeDefined();
    expect(blk32!.raw.length).toBe(GEO_BLOCK_SIZE);

    const { map, wallPlane0, wallPlane1 } = decodeGeoBlock(blk32!.raw, 'GEO1#32');
    const cell = (x: number, y: number) => map.cells[idx(x, y)];

    // Plane 0 row 0 raw: 37 41 30 41 47  →  N = high nibble, E = low nibble.
    expect([0, 1, 2, 3, 4].map((x) => cell(x, 0).walls.north)).toEqual([3, 4, 3, 4, 4]);
    expect([0, 1, 2, 3, 4].map((x) => cell(x, 0).walls.east)).toEqual([7, 1, 0, 1, 7]);
    // The decoded walls must equal the nibble split of the raw plane bytes.
    expect(cell(0, 0).walls.north).toBe(wallPlane0[idx(0, 0)] >> 4);
    expect(cell(0, 0).walls.south).toBe(wallPlane1[idx(0, 0)] >> 4);

    // Every wall slot is a valid 0..15 routing target.
    for (const c of map.cells)
      for (const d of ['north', 'east', 'south', 'west'] as const) {
        const wd = decodeWallByte(c.walls[d]);
        expect(wd.slot).toBeGreaterThanOrEqual(0);
        expect(wd.slot).toBeLessThanOrEqual(15);
      }

    // Shared-edge symmetry signature (the discriminator that proved the layout): a cell's
    // South slot matches the north neighbour's North slot for the large majority of edges.
    let match = 0, total = 0;
    for (let y = 0; y < GEO_GRID - 1; y++)
      for (let x = 0; x < GEO_GRID; x++) {
        total++;
        if (cell(x, y).walls.south === cell(x, y + 1).walls.north) match++;
      }
    expect(match / total).toBeGreaterThan(0.6); // ~80% for block 32; full-byte reading gives 0%
  });
});

// ---------------------------------------------------------------------------
// Gen2 (DQK / HLIB) GEO maps
// ---------------------------------------------------------------------------

// Build a Gen2 GEO member: byte0=H, byte1=W (the retail order — see
// decodeGen2GeoBlock), 6 header bytes, then 4 planes of W*H.
function makeGen2(w: number, h: number, p0: Uint8Array, p1: Uint8Array, p2: Uint8Array, p3: Uint8Array): Uint8Array {
  const plane = w * h;
  const raw = new Uint8Array(GEN2_GEO_HEADER + 4 * plane);
  raw[0] = h; raw[1] = w;
  raw[2] = 0xaa; // 6 reserved header bytes (preserved verbatim)
  raw[7] = 0xbb;
  raw.set(p0, GEN2_GEO_HEADER);
  raw.set(p1, GEN2_GEO_HEADER + plane);
  raw.set(p2, GEN2_GEO_HEADER + 2 * plane);
  raw.set(p3, GEN2_GEO_HEADER + 3 * plane);
  return raw;
}

describe('decodeGen2GeoBlock — synthetic', () => {
  it('decodes a variable-size map with the same nibble wall semantics as Gen1', () => {
    const W = 10, H = 7, plane = W * H;
    const p0 = new Uint8Array(plane);
    const p1 = new Uint8Array(plane);
    const i = 3 * W + 4; // cell (4,3)
    p0[i] = 0x35; // North 3, East 5
    p1[i] = 0x71; // South 7, West 1
    const m = decodeGen2GeoBlock(makeGen2(W, H, p0, p1, new Uint8Array(plane), new Uint8Array(plane)), 'syn2', 9);
    expect(m.map.width).toBe(W);
    expect(m.map.height).toBe(H);
    expect(m.map.cells).toHaveLength(plane);
    expect(m.id).toBe(9);
    expect([...m.header]).toEqual([0xaa, 0, 0, 0, 0, 0xbb]);
    expect(m.map.cells[i].walls).toEqual({ north: 3, east: 5, south: 7, west: 1 });
    expect(m.map.cells[0].walls).toEqual({ north: 0, east: 0, south: 0, west: 0 });
  });

  it('sniffs by the 8 + 4*W*H length invariant', () => {
    expect(sniffGen2GeoBlock(makeGen2(4, 4, new Uint8Array(16), new Uint8Array(16), new Uint8Array(16), new Uint8Array(16)))).toBe(true);
    expect(sniffGen2GeoBlock(new Uint8Array(7))).toBe(false); // shorter than header
    const bad = makeGen2(4, 4, new Uint8Array(16), new Uint8Array(16), new Uint8Array(16), new Uint8Array(16)).subarray(0, 40);
    expect(sniffGen2GeoBlock(bad)).toBe(false); // truncated body
  });

  it('produces an Explorer-walkable map', () => {
    const W = 6, H = 6, plane = W * H;
    const p0 = new Uint8Array(plane);
    p0[3 * W + 3] = 0x02; // east wall at (3,3)
    const { map } = decodeGen2GeoBlock(makeGen2(W, H, p0, new Uint8Array(plane), new Uint8Array(plane), new Uint8Array(plane)));
    const ex = new Explorer(map, { x: 3, y: 3, facing: 'east' });
    expect(ex.forward().moved).toBe(false);
    ex.turnRight();
    expect(ex.forward().moved).toBe(true);
  });

  it('rejects a block whose declared W×H disagrees with its length', () => {
    const raw = makeGen2(4, 4, new Uint8Array(16), new Uint8Array(16), new Uint8Array(16), new Uint8Array(16));
    raw[0] = 5; // claim height 5 → expected length changes, actual unchanged
    expect(() => decodeGen2GeoBlock(raw)).toThrow(/implies/);
  });
});

// --- Golden: real DQK GEO.GLB (HLIB DATA library; skips if data absent) ------

const geoGlbPath = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK3', 'GEO.GLB');

describe('decodeGen2GeoArchive — golden DQK GEO.GLB', () => {
  it.skipIf(!existsSync(geoGlbPath))('walks the HLIB DATA library into 20 walkable maps', async () => {
    const bytes = new Uint8Array(await readFile(geoGlbPath));
    const arch = decodeHlib(bytes, 'GEO.GLB');
    expect(arch.tag).toBe('DATA');
    expect(arch.nonImage).toBe(true);
    // magic=1 → rawMembers[0] is the id table (not a map); members[1..20] are maps.
    const maps = decodeGen2GeoArchive(arch.rawMembers, 'GEO');
    expect(maps.length).toBe(20);

    // Known dimensions of the first few maps (captured from the container directory).
    expect(maps[0].map.width).toBe(10);
    expect(maps[0].map.height).toBe(10);
    expect(maps[6].map.width).toBe(16);
    expect(maps[6].map.height).toBe(16);

    // Every map's length matches its declared geometry, walls stay in 0..15, and a
    // majority of shared edges are symmetric — the same signature that validated Gen1.
    for (const m of maps) {
      const { map, wallPlane0 } = m;
      expect(map.cells.length).toBe(map.width * map.height);
      expect(wallPlane0.length).toBe(map.width * map.height);
      for (const c of map.cells)
        for (const d of ['north', 'east', 'south', 'west'] as const) {
          expect(c.walls[d]).toBeGreaterThanOrEqual(0);
          expect(c.walls[d]).toBeLessThanOrEqual(15);
        }
    }

    // Aggregate East-edge symmetry across all maps (cell East slot == east-neighbour West slot):
    // the planar nibble model gives 0.85–1.00; a wrong reading collapses to ~0.
    let match = 0, total = 0;
    for (const m of maps) {
      const { map } = m;
      const at = (x: number, y: number) => map.cells[y * map.width + x];
      for (let y = 0; y < map.height; y++)
        for (let x = 0; x < map.width - 1; x++) {
          total++;
          if (at(x, y).walls.east === at(x + 1, y).walls.west) match++;
        }
    }
    expect(match / total).toBeGreaterThan(0.6);
  });
});
