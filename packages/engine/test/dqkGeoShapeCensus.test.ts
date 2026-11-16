/**
 * The Dark Queen of Krynn — R4 (round 29): pin every Gen2 GEO map's decoded (areaId, height,
 * width) shape and the square-map null.
 *
 * Commit `dc12cd1` (2026-08-07) corrected `decodeGen2GeoBlock` from the buggy `(width, height)`
 * header-byte order to the retail-correct `(height, width)` order ("8 of 20 DQK maps were being
 * transposed"). Research written before that date computed cell `(x,y)` coordinates against the
 * old, wrong stride; `docs/engine/research/dqk-geo-shape-audit.md` re-derives every such claim.
 * This file is the byte-level anchor that audit script trusts: the actual 20 shapes straight out
 * of `decodeGen2GeoArchive`, and a proof that the null (a square map is invisible to the
 * transposition bug) actually holds for all 12 square maps — not merely asserted, but checked by
 * decoding the SAME raw plane bytes under a deliberately transposed stride and comparing every
 * cell.
 *
 * Case A pins the (areaId, h, w) table exactly as measured (also reproduced standalone in
 * `tools/dqk_geo_shape_census.py`, a from-scratch HLIB/id-table reader that does not import
 * `geo.ts`, so the two independently agree). Case B asserts exactly 8 non-square maps at the ids
 * the plan names. Case C is the null: for each of the 12 square maps, decoding under a
 * deliberately transposed (width, height) reading must reproduce the SAME cell content at every
 * (x,y) as the real decode — because on a square map swapping the stride does not move any cell's
 * position in the row-major layout in a way index arithmetic can distinguish... concretely,
 * `y*W+x` under W=H is symmetric only along the diagonal, so this case decodes both ways and
 * diffs every cell, asserting zero mismatches (mutation ii in the round plan disables this and
 * expects nothing to change in the *classification* counts elsewhere, which is a property of the
 * audit script, not this file — this file's own null must still pass on unmutated code).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGen2GeoArchive, decodeHlib, type Gen2GeoMap } from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const geoPath = resolve(here, '..', '..', '..', 'The Dark Queen of Krynn', 'DISK3', 'GEO.GLB');
const haveRetail = existsSync(geoPath);

let geoCache: Gen2GeoMap[] | null = null;
async function geoMaps(): Promise<Gen2GeoMap[]> {
  if (!geoCache) {
    const arch = decodeHlib(new Uint8Array(await readFile(geoPath)), 'GEO.GLB');
    geoCache = decodeGen2GeoArchive(arch.rawMembers, 'GEO.GLB');
  }
  return geoCache;
}

let rawCache: { members: Uint8Array[]; memberIndexById: Map<number, number> } | null = null;
async function rawMembers() {
  if (!rawCache) {
    const arch = decodeHlib(new Uint8Array(await readFile(geoPath)), 'GEO.GLB');
    const maps = await geoMaps();
    const memberIndexById = new Map<number, number>();
    for (const m of maps) memberIndexById.set(m.id, m.member);
    rawCache = { members: arch.rawMembers, memberIndexById };
  }
  return rawCache;
}

/** The planner's own measurement (Python over GEO.GLB), reproduced by `tools/dqk_geo_shape_census.py`. */
const EXPECTED_SHAPES: Array<{ area: number; member: number; h: number; w: number }> = [
  { area: 2, member: 1, h: 10, w: 10 },
  { area: 4, member: 2, h: 17, w: 17 },
  { area: 10, member: 3, h: 28, w: 28 },
  { area: 14, member: 4, h: 39, w: 20 },
  { area: 18, member: 5, h: 16, w: 11 },
  { area: 22, member: 6, h: 27, w: 24 },
  { area: 24, member: 7, h: 16, w: 16 },
  { area: 26, member: 8, h: 22, w: 22 },
  { area: 30, member: 9, h: 28, w: 28 },
  { area: 34, member: 10, h: 28, w: 28 },
  { area: 38, member: 11, h: 20, w: 39 },
  { area: 42, member: 12, h: 28, w: 28 },
  { area: 46, member: 13, h: 27, w: 29 },
  { area: 47, member: 14, h: 27, w: 29 },
  { area: 50, member: 15, h: 28, w: 28 },
  { area: 54, member: 16, h: 23, w: 21 },
  { area: 58, member: 17, h: 28, w: 28 },
  { area: 62, member: 18, h: 28, w: 28 },
  { area: 63, member: 19, h: 12, w: 12 },
  { area: 66, member: 20, h: 22, w: 34 },
];

const NON_SQUARE_AREAS = [14, 18, 22, 38, 46, 47, 54, 66];
const SQUARE_AREAS = EXPECTED_SHAPES.map((s) => s.area).filter((a) => !NON_SQUARE_AREAS.includes(a));

/**
 * Decode a raw Gen2 GEO member under a DELIBERATELY TRANSPOSED (width, height) reading — the
 * pre-`dc12cd1` bug, reimplemented locally (never imported from `geo.ts`, since the whole point
 * is to compare the corrected decoder against the buggy one on the SAME bytes).
 */
function decodeTransposed(raw: Uint8Array): { width: number; height: number; cells: number[] } {
  const width = raw[0]; // buggy: byte0 read as width
  const height = raw[1]; // buggy: byte1 read as height
  const plane = width * height;
  const o = 8;
  const backdrop = raw.slice(o + 2 * plane, o + 3 * plane); // plane2 = backdrop (same plane index either way)
  return { width, height, cells: Array.from(backdrop) };
}

describe('DQK Gen2 GEO shape census (R4, round 29)', () => {
  it.skipIf(!haveRetail)('case A: all 20 maps decode to the measured (areaId, h, w) table', async () => {
    const maps = await geoMaps();
    expect(maps.length).toBe(20);
    const byArea = new Map(maps.map((m) => [m.id, m]));
    for (const exp of EXPECTED_SHAPES) {
      const m = byArea.get(exp.area);
      expect(m, `area ${exp.area} missing from decoded archive`).toBeDefined();
      expect(m!.member, `area ${exp.area} member index`).toBe(exp.member);
      expect(m!.map.height, `area ${exp.area} height`).toBe(exp.h);
      expect(m!.map.width, `area ${exp.area} width`).toBe(exp.w);
    }
  });

  it.skipIf(!haveRetail)('case B: exactly 8 non-square maps, at the ids the plan names', async () => {
    const maps = await geoMaps();
    const nonSquare = maps.filter((m) => m.map.width !== m.map.height).map((m) => m.id).sort((a, b) => a - b);
    expect(nonSquare).toEqual([...NON_SQUARE_AREAS].sort((a, b) => a - b));
    expect(nonSquare.length).toBe(8);
    const square = maps.filter((m) => m.map.width === m.map.height).map((m) => m.id).sort((a, b) => a - b);
    expect(square.length).toBe(12);
    expect(square).toEqual([...SQUARE_AREAS].sort((a, b) => a - b));
  });

  it.skipIf(!haveRetail)(
    'case C (the null): on every square map, the transposed reading reproduces the SAME cell values',
    async () => {
      const { members, memberIndexById } = await rawMembers();
      const maps = await geoMaps();
      const byId = new Map(maps.map((m) => [m.id, m]));
      let checked = 0;
      for (const areaId of SQUARE_AREAS) {
        const mi = memberIndexById.get(areaId)!;
        const raw = members[mi];
        const correct = byId.get(areaId)!;
        const transposed = decodeTransposed(raw);
        // Square precondition: the null is meaningless (and the plan says the audit script would
        // be broken) unless width===height so the two readings share one plane length.
        expect(transposed.width).toBe(transposed.height);
        expect(correct.map.width).toBe(correct.map.height);
        expect(transposed.width).toBe(correct.map.width);
        // Compare cell-by-cell: correct decode's backdrop plane (row-major, stride = correct.width)
        // against the transposed decode's backdrop plane (row-major, stride = transposed.width).
        // On a square map W===H so y*W+x is identical either way — the SAME byte offset is read
        // for the SAME (x,y), for every cell, which is exactly why the bug is invisible here.
        for (let y = 0; y < correct.map.height; y++) {
          for (let x = 0; x < correct.map.width; x++) {
            const idx = y * correct.map.width + x;
            expect(transposed.cells[idx], `area ${areaId} cell (${x},${y})`).toBe(
              correct.map.cells[idx].floor,
            );
            checked++;
          }
        }
      }
      // Sanity: the null actually exercised every square-map cell, not zero of them.
      expect(checked).toBeGreaterThan(1000);
    },
  );

  it.skipIf(!haveRetail)(
    'mutation-visible: on a NON-square map, the transposed reading does NOT reproduce the same cells',
    async () => {
      const { members, memberIndexById } = await rawMembers();
      const maps = await geoMaps();
      const byId = new Map(maps.map((m) => [m.id, m]));
      let anyMismatch = false;
      for (const areaId of NON_SQUARE_AREAS) {
        const mi = memberIndexById.get(areaId)!;
        const raw = members[mi];
        const correct = byId.get(areaId)!;
        const transposed = decodeTransposed(raw);
        // The transposed reading swaps w/h, so its own plane length still matches (w*h commutes)
        // but its per-cell addressing (stride = transposed.width = correct.height) disagrees with
        // the correct addressing (stride = correct.width) whenever width !== height.
        expect(transposed.width).toBe(correct.map.height);
        expect(transposed.height).toBe(correct.map.width);
        for (let y = 0; y < correct.map.height && !anyMismatch; y++) {
          for (let x = 0; x < correct.map.width && !anyMismatch; x++) {
            const idxCorrect = y * correct.map.width + x;
            const idxTransposed = y * transposed.width + x;
            if (idxTransposed >= transposed.cells.length) continue;
            if (transposed.cells[idxTransposed] !== correct.map.cells[idxCorrect].floor) {
              anyMismatch = true;
            }
          }
        }
      }
      expect(anyMismatch).toBe(true);
    },
  );
});
