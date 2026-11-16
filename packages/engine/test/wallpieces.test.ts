/**
 * First-person wall-piece geometry tests (M1.S5c core). All assertions check the
 * verbatim-confirmed COAB constants/arithmetic from
 * docs/engine/research/firstperson-wall-geometry-cok.md (§2,§3,§4,§6).
 */
import { describe, it, expect } from 'vitest';
import {
  PIECES,
  WALL_POOL_COLUMNS,
  SYMBOL_SET_FIX,
  wallSlotRouting,
  routeTileId,
  pieceRect,
  expandWallPiece,
} from '../src/index.js';

describe('wall-piece table', () => {
  it('partitions exactly 156 columns across the 10 pieces', () => {
    const sum = PIECES.reduce((a, p) => a + p.cols * p.rows, 0);
    expect(sum).toBe(WALL_POOL_COLUMNS);
  });

  it('has contiguous idxOffsets matching the run lengths (except the overlapping cap)', () => {
    // Pieces 0..8 are laid end to end; piece 9 (far cap) deliberately reuses column 154.
    let col = 0;
    for (let i = 0; i < 9; i++) {
      expect(PIECES[i].idxOffset).toBe(col);
      col += PIECES[i].cols * PIECES[i].rows;
    }
    expect(col).toBe(154);
    expect(PIECES[9].idxOffset).toBe(154);
  });

  it('matches the §3.2 base pixel rectangles', () => {
    const expectRect = (i: number, x: number, y: number, w: number, h: number) => {
      const p = PIECES[i];
      expect(pieceRect(i, p.colBase, p.rowBase)).toEqual({ x, y, w, h });
    };
    expectRect(0, 64, 56, 8, 16); // far front
    expectRect(3, 56, 48, 24, 32); // mid front
    expectRect(6, 40, 32, 56, 64); // near front
    expectRect(7, 24, 24, 16, 88); // near left
    expectRect(8, 96, 24, 16, 88); // near right
  });
});

describe('wallSlotRouting', () => {
  it('splits a slot into wallset/slice, null for open', () => {
    expect(wallSlotRouting(0)).toBeNull();
    expect(wallSlotRouting(1)).toEqual({ wallset: 0, slice: 0 });
    expect(wallSlotRouting(5)).toEqual({ wallset: 0, slice: 4 });
    expect(wallSlotRouting(6)).toEqual({ wallset: 1, slice: 0 });
    expect(wallSlotRouting(15)).toEqual({ wallset: 2, slice: 4 });
  });
});

describe('routeTileId (Put8x8Symbol ranges)', () => {
  it('routes id ranges to sets and subtracts the set base', () => {
    expect(routeTileId(0x01)).toEqual({ set: 0, index: 0 });
    expect(routeTileId(0x2d)).toEqual({ set: 0, index: 0x2d - SYMBOL_SET_FIX[0] });
    expect(routeTileId(0x2e)).toEqual({ set: 1, index: 0 });
    expect(routeTileId(0x73)).toEqual({ set: 1, index: 0x73 - 0x2e });
    expect(routeTileId(0x74)).toEqual({ set: 2, index: 0 });
    expect(routeTileId(0xb9)).toEqual({ set: 2, index: 0xb9 - 0x74 });
    expect(routeTileId(0xba)).toEqual({ set: 3, index: 0 });
    expect(routeTileId(0xff)).toEqual({ set: 3, index: 0xff - 0xba });
  });
});

describe('expandWallPiece', () => {
  it('returns nothing for an open slot', () => {
    expect(expandWallPiece(3, 0, 4, 3, () => 0x40)).toEqual([]);
  });

  it('expands a mid-front wall into 12 tiles with incrementing pool columns and pixels', () => {
    // slot 1 → wallset 0, slice 0. readId echoes the pool column as the tile id so we can
    // verify the run reads idxOffset[3]=10 .. 21 row-major across a 3-wide × 4-tall piece.
    const cols: number[] = [];
    const blits = expandWallPiece(3, 1, 4, 3, (ws, sl, col) => {
      expect(ws).toBe(0);
      expect(sl).toBe(0);
      cols.push(col);
      return 0x30 + col; // a real tile id (≥ 0x2D)
    });
    expect(blits).toHaveLength(12); // 3 cols × 4 rows
    expect(cols).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    // First tile sits at the piece's base pixel (56,48) = ((4+3)*8,(3+3)*8).
    expect({ px: blits[0].px, py: blits[0].py }).toEqual({ px: 56, py: 48 });
    // Tile (row 0, col 2) → colX 6, rowY 3 → pixel (72,48).
    expect({ px: blits[2].px, py: blits[2].py }).toEqual({ px: 72, py: 48 });
    // Tile (row 1, col 0) → colX 4, rowY 4 → pixel (56,56).
    expect({ px: blits[3].px, py: blits[3].py }).toEqual({ px: 56, py: 56 });
  });

  it('skips tiles whose draw-grid cell leaves the 0..10 viewport range', () => {
    // Anchor far right so colX runs 9,10,11 — the third column is out of range.
    const blits = expandWallPiece(3, 1, 9, 3, (_ws, _sl, col) => 0x30 + col);
    // 4 rows × (cols 9,10 in-range; 11 dropped) = 8 tiles.
    expect(blits).toHaveLength(8);
    expect(blits.every((b) => b.colX <= 10)).toBe(true);
  });
});
