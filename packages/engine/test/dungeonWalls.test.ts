/**
 * loadDungeonWalls tests (M1.S5c) — replicates COAB LoadWalldef for sets 1/2/3 using
 * synthetic WALLDEF + 8X8D sources (no game data needed). Verifies the .Offset relocation,
 * the 8X8D pairing (B for k=1, B*10+i+1 for k>1), boot sets 0/4, the Reset sentinel, and
 * the readId/lookupTile wiring. Constants per docs/engine/research/firstperson-wall-walk-cok.md §3.
 */
import { describe, it, expect } from 'vitest';
import {
  loadDungeonWalls,
  WALLDEF_RESET,
  WALLDEF_DEFAULT_SET1,
  type DungeonWallSources,
} from '../src/index.js';

const RECORD = 780; // 5 slices × 156

/** A WALLDEF block of `recordCount` records; `(rec,slice,col)->value` fills entries. */
function walldef(recordCount: number, fill: (rec: number, slice: number, col: number) => number): Uint8Array {
  const raw = new Uint8Array(recordCount * RECORD);
  for (let rec = 0; rec < recordCount; rec++) {
    for (let s = 0; s < 5; s++) {
      for (let c = 0; c < 156; c++) raw[rec * RECORD + s * 156 + c] = fill(rec, s, c) & 0xff;
    }
  }
  return raw;
}

/** A valid 8X8D block (17-byte header: dims 8,1, count@8, field_9[8]); tile `i`'s pixels = nibble `i&0xf`. */
function tiles8x8(count: number): Uint8Array {
  const raw = new Uint8Array(17 + count * 32);
  raw[0] = 8; // height
  raw[2] = 1; // width/8
  raw[8] = count; // tile-count byte (field_9 occupies 9..16)
  for (let i = 0; i < count; i++) {
    const nib = i & 0x0f;
    raw.fill((nib << 4) | nib, 17 + i * 32, 17 + (i + 1) * 32); // both pixels per byte = nib
  }
  return raw;
}

/** Sources backed by two id→bytes maps. */
function sources(wd: Record<number, Uint8Array>, tl: Record<number, Uint8Array>): DungeonWallSources {
  return {
    walldefBlock: (id) => wd[id] ?? null,
    tileBlock: (id) => tl[id] ?? null,
  };
}

describe('loadDungeonWalls', () => {
  it('loads three single-record sets, boot tiles, and relocates by the set .Offset', () => {
    // Each set's WALLDEF block puts tile id 0x30 at slice 0, pool column 10 (mid-front start).
    const wdBlock = walldef(1, (_r, s, c) => (s === 0 && c === 10 ? 0x30 : 0));
    const dw = loadDungeonWalls(
      [5, 6, 7], // set 1←block5, set 2←block6, set 3←block7
      sources(
        { 5: wdBlock, 6: wdBlock, 7: wdBlock },
        { 5: tiles8x8(70), 6: tiles8x8(70), 7: tiles8x8(70), 0xcb: tiles8x8(45), 0xca: tiles8x8(40) },
      ),
    );

    // Boot sets 0 and 4 loaded; per-dungeon sets 1/2/3 loaded; nothing else.
    expect(dw.tileSets[0]?.tiles.length).toBe(45); // 0xCB
    expect(dw.tileSets[4]?.tiles.length).toBe(40); // 0xCA
    expect(dw.tileSets[1]?.tiles.length).toBe(70);
    expect(dw.tileSets[2]?.tiles.length).toBe(70);
    expect(dw.tileSets[3]?.tiles.length).toBe(70);

    // Relocation: set 1 varA=0 → 0x30; set 2 varA=0x46 → 0x76; set 3 varA=0x8C → 0xBC.
    expect(dw.readId(0, 0, 10)).toBe(0x30); // wallset 0 = set 1
    expect(dw.readId(1, 0, 10)).toBe(0x76); // wallset 1 = set 2
    expect(dw.readId(2, 0, 10)).toBe(0xbc); // wallset 2 = set 3
    // Reserved entries (0 = none) are never relocated.
    expect(dw.readId(1, 0, 0)).toBe(0);
  });

  it('honours the 0xFF Reset sentinel (empty set → readId 0, no WALLDEF table)', () => {
    const wdBlock = walldef(1, (_r, s, c) => (s === 0 && c === 10 ? 0x30 : 0));
    const dw = loadDungeonWalls(
      [5, WALLDEF_RESET, 7],
      sources(
        { 5: wdBlock, 7: wdBlock },
        { 5: tiles8x8(70), 7: tiles8x8(70), 0xcb: tiles8x8(45), 0xca: tiles8x8(40) },
      ),
    );
    expect(dw.walldefBlocks[1]).toBeNull(); // set 2 left empty
    expect(dw.readId(1, 0, 10)).toBe(0);
    expect(dw.tileSets[2]).toBeNull();
    expect(dw.walldefBlocks[0]).not.toBeNull(); // set 1 still loaded
  });

  it('maps 0x7F on set 1 to WALLDEF block 0', () => {
    const block0 = walldef(1, (_r, s, c) => (s === 0 && c === 10 ? 0x40 : 0));
    const dw = loadDungeonWalls(
      [WALLDEF_DEFAULT_SET1, WALLDEF_RESET, WALLDEF_RESET],
      sources({ 0: block0 }, { 0: tiles8x8(70), 0xcb: tiles8x8(45), 0xca: tiles8x8(40) }),
    );
    expect(dw.readId(0, 0, 10)).toBe(0x40); // block 0 loaded into set 1, varA 0
  });

  it('pairs a multi-record WALLDEF block with 8X8D B*10+i+1 and uses the call set offset', () => {
    // Set 1 ← block 12 with 2 records: record 0 → slot 1, record 1 → slot 2. Both use varA(set1)=0.
    const wd2 = walldef(2, (rec, s, c) => (s === 0 && c === 10 ? (rec === 0 ? 0x30 : 0x31) : 0));
    const dw = loadDungeonWalls(
      [12, WALLDEF_RESET, WALLDEF_RESET],
      sources(
        { 12: wd2 },
        { 121: tiles8x8(70), 122: tiles8x8(50), 0xcb: tiles8x8(45), 0xca: tiles8x8(40) },
      ),
    );
    // 8X8D pairing: B*10+1=121 → set 1, B*10+2=122 → set 2.
    expect(dw.tileSets[1]?.tiles.length).toBe(70);
    expect(dw.tileSets[2]?.tiles.length).toBe(50);
    // Both records relocated by the CALL's set-1 offset (0), NOT the slot's own offset.
    expect(dw.readId(0, 0, 10)).toBe(0x30); // record 0 → wallset 0
    expect(dw.readId(1, 0, 10)).toBe(0x31); // record 1 → wallset 1, still +0
  });

  it('throws on a missing WALLDEF block and on record overflow', () => {
    const tl = { 0xcb: tiles8x8(45), 0xca: tiles8x8(40) };
    expect(() => loadDungeonWalls([5, WALLDEF_RESET, WALLDEF_RESET], sources({}, tl))).toThrow(
      /block 5 .* not found/,
    );
    // A 2-record block loaded into set 3 overflows (k+s = 2+3 > 4). Both records carry real
    // (non-zero) data — decodeWalldefBlock trims trailing all-zero records as padding (see its own
    // doc comment / Neverwinter Nights DOS finding), so a genuinely-degenerate all-zero record
    // would no longer exercise this guard; this test still needs to see a real k=2 block.
    const wd2 = walldef(2, (rec, s, c) => (s === 0 && c === 10 ? (rec === 0 ? 0x30 : 0x31) : 0));
    expect(() =>
      loadDungeonWalls([WALLDEF_RESET, WALLDEF_RESET, 9], sources({ 9: wd2 }, tl)),
    ).toThrow(/overflows past set 3/);
  });

  it('lookupTile resolves a routed blit to its 8×8 tile image', () => {
    const wdBlock = walldef(1, () => 0);
    const dw = loadDungeonWalls(
      [5, WALLDEF_RESET, WALLDEF_RESET],
      sources({ 5: wdBlock }, { 5: tiles8x8(70), 0xcb: tiles8x8(45), 0xca: tiles8x8(40) }),
    );
    const img = dw.lookupTile({ set: 1, index: 3 });
    expect(img?.width).toBe(8);
    expect(img?.indices.every((v) => v === 3)).toBe(true); // tile 3 was filled with byte 3 → nibbles 3
    expect(dw.lookupTile({ set: 1, index: 999 })).toBeNull();
  });

  it('keeps direct WALLDEF tile ids in their originating NWN wallset bank', () => {
    const wdBlock = walldef(1, (_r, s, c) => (s === 0 && c === 10 ? 61 : 0));
    const dw = loadDungeonWalls(
      [5, 6, WALLDEF_RESET],
      { ...sources(
        { 5: wdBlock, 6: wdBlock },
        { 5: tiles8x8(70), 6: tiles8x8(70), 0xcb: tiles8x8(45), 0xca: tiles8x8(40) },
      ), directWallsetTileIds: true },
    );
    // 61 remains raw (rather than CoK's set-2 relocation to 131) and resolves in block 6 at 61-46.
    expect(dw.readId(1, 0, 10)).toBe(61);
    expect(dw.lookupTile({ wallset: 1, set: 1, index: 15, tileId: 61 })?.indices.every((v) => v === 15)).toBe(true);
  });

  it('keeps NWN low ids in boot block 203 even when its local bank is 210 tiles', () => {
    const dw = loadDungeonWalls(
      [5, WALLDEF_RESET, WALLDEF_RESET],
      { ...sources(
        { 5: walldef(1, () => 0) },
        { 5: tiles8x8(210), 0xcb: tiles8x8(45), 0xca: tiles8x8(40) },
      ), directWallsetTileIds: true },
    );
    // Prior to the NWN guard this bank was mistaken for Gateway's combined range and id 1
    // returned null (`1 - 46 < 0`) instead of the shared boot tile at index 0.
    expect(dw.lookupTile({ wallset: 0, set: 0, index: 0, tileId: 1 })?.indices.every((v) => v === 0)).toBe(true);
  });

  it('keeps Gateway-style 210-tile routing inside the originating wallset bank', () => {
    const wdBlock = walldef(1, (_r, s, c) => (s === 0 && c === 10 ? 117 : 0));
    const dw = loadDungeonWalls(
      [5, 6, WALLDEF_RESET],
      sources(
        { 5: wdBlock, 6: wdBlock },
        { 5: tiles8x8(210), 6: tiles8x8(210), 0xcb: tiles8x8(45), 0xca: tiles8x8(40) },
      ),
    );
    // Relocated id 117 ordinarily routes to set 2/index 1. Gateway's combined set-1 bank instead
    // owns the whole 46..255 range, so it must select originating-bank index 117-46 = 71.
    const img = dw.lookupTile({ wallset: 0, set: 2, index: 1, tileId: 117 });
    expect(img?.indices.every((value) => value === 7)).toBe(true);
    // With no origin metadata, legacy CoK routing remains unchanged.
    expect(dw.lookupTile({ set: 2, index: 1, tileId: 117 })?.indices.every((value) => value === 1)).toBe(true);
  });
});
