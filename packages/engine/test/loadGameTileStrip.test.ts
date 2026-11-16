/**
 * Regression test: DAA 8X8D tile-strip blocks must NOT be silently skipped in loadGame.
 *
 * Before the fix, framesFromDecoded fell into `skipped++` for any block where b.image===null,
 * which is exactly what tile-strip blocks produce (parseFrameHeader returns null because they
 * don't have the 5-plane image geometry). This test constructs a minimal synthetic DAA file
 * containing a single tile-strip block and asserts that loadGame surfaces the decoded tiles
 * rather than skipping them.
 *
 * Uses a fully synthetic buffer so it runs without any external game-file assets.
 */
import { describe, it, expect } from 'vitest';
import { loadGame, type GameManifest, type FetchBytes } from '../src/index.js';

// ---------------------------------------------------------------------------
// Build a minimal valid DAA archive containing exactly one 8X8D tile-strip block.
//
// DAA container layout (big-endian):
//   offset 0 : uint16 BE  word0 = 2 + n*9  (= dataBase)
//   offset 2 : n × 9-byte TOC entries
//               [u8 blockId] [u32 BE dataOffset] [u16 BE rawSize] [u16 BE compSize]
//   offset word0 : compressed block data
//
// Tile-strip raw format (decompressed):
//   [u16 BE height=8] [u16 BE widthDiv8=1] [u16 BE yOff=0] [u16 BE xOff=0] [u8 count]
//   then TILE_PLANES(4) × rowBytes(2) × TILE_PX(8) = 64 bytes of planar pixel data
//   Total raw = 9 + 64 = 73 bytes.
//
// Signed-byte RLE encoding of the 73-byte raw:
//   [0x08, 0x00,0x08, 0x00,0x01, 0x00,0x00, 0x00,0x00, 0x01]  — literal run of 9 bytes
//   [0xC0, 0x00]                                                — repeat 0x00 × 64
//   Total compressed = 12 bytes.
// ---------------------------------------------------------------------------

function buildTileStripDaa(): Uint8Array {
  // Compressed body: 9-byte literal header, then 64 zeros (RLE repeat).
  const compressed = new Uint8Array([
    0x08,                                                     // literal run of 9 bytes
    0x00, 0x08,   // height = 8
    0x00, 0x01,   // widthDiv8 = 1
    0x00, 0x00,   // yOff = 0
    0x00, 0x00,   // xOff = 0
    0x01,         // count = 1 tile
    0xC0, 0x00,   // repeat 0x00 × (256 - 0xC0 = 64)
  ]);
  const compSize = compressed.length; // 12
  const rawSize = 73;
  const blockId = 202;
  const dataBase = 11; // 2 + 1*9

  const buf = new Uint8Array(dataBase + compSize);
  const dv = new DataView(buf.buffer);

  // Header word0
  dv.setUint16(0, dataBase, false);

  // TOC entry at offset 2
  buf[2] = blockId;                          // blockId u8
  dv.setUint32(3, 0, false);                 // dataOffset u32 BE
  dv.setUint16(7, rawSize, false);           // rawSize u16 BE
  dv.setUint16(9, compSize, false);          // compSize u16 BE

  // Block data
  buf.set(compressed, dataBase);

  return buf;
}

// A manifest that references a single tile-category DAA file backed by our synthetic buffer.
const FAKE_PATH = 'synthetic/8X8D1.DAA';

const manifest: GameManifest = {
  id: 'test-tile-strip',
  title: 'Tile Strip Test',
  platform: 'Amiga',
  display: { width: 320, height: 200, pixelAspect: 1, defaultZoom: 1 },
  files: [
    { path: FAKE_PATH, category: 'tiles', label: '8X8D1 (tile strip)' },
  ],
};

const syntheticBytes = buildTileStripDaa();

const fakeFetch: FetchBytes = async (path: string): Promise<Uint8Array> => {
  if (path === FAKE_PATH) return syntheticBytes;
  throw new Error(`unexpected path: ${path}`);
};

describe('loadGame tile-strip routing', () => {
  it('surfaces tile-strip frames instead of skipping them', async () => {
    const game = await loadGame(manifest, fakeFetch);

    // The tiles category must have been decoded.
    const tiles = game.categories.find((c) => c.category === 'tiles');
    expect(tiles).toBeDefined();

    // We encoded exactly 1 tile in the strip.
    expect(tiles!.frameCount).toBe(1);

    // The file result must carry frames, not an error/skip.
    const fileResult = tiles!.files[0]!;
    expect(fileResult.error).toBeUndefined();
    expect(fileResult.frames).toHaveLength(1);

    // Each tile must be an 8×8 IndexedImage.
    const frame = fileResult.frames[0]!;
    expect(frame.image.width).toBe(8);
    expect(frame.image.height).toBe(8);
    expect(frame.encoding).toBe('daa-tile8x8');

    // Label must identify the block id and tile index.
    expect(frame.label).toMatch(/block 202 tile 0/);
  });

  it('loadGame total frame count reflects the decoded tile (not zero)', async () => {
    const game = await loadGame(manifest, fakeFetch);
    expect(game.totalFrames).toBe(1);
    // No unhandled errors.
    expect(game.errors).toHaveLength(0);
  });
});
