/**
 * 8X8D dungeon-tile decoder tests (M1.S5c prerequisite).
 *
 * 1) Synthetic: header sniff, 9-byte header with the count byte at offset 8, 8×8 chunky-4bpp
 *    unpack (high nibble = left pixel), EGA palette attached.
 * 2) Golden: real CoK 8X8D1.DAX — block 11 = 70 tiles, 202 = 38, 203 = 45; the count byte
 *    equals (len-9)/32 and tile pixels are valid 0..15 indices (skips if data absent).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decode8x8dBlock,
  sniff8x8dBlock,
  readDaxDataBlocks,
  TILE8X8_BYTES,
  TILE8X8_HEADER,
  TILE8X8_COUNT_OFFSET,
  TILE8X8_TRAILER,
  TILE8X8_PLANAR5_BYTES,
  TILE8X8_PLANAR5_TRAILER,
  TILE8X8_PLANAR5_WALL_TRAILER,
  sniff8x8dPlanar5Block,
} from '../src/index.js';
import { decodeDax } from '../src/loaders/dax.js';
import { makeEgaPalette } from '../src/render/palette.js';

/** Build a tile block: 9-byte header (dims + count byte), then N×32 contiguous tiles. */
function makeTileBlock(tileBytes: number[][]): Uint8Array {
  const raw = new Uint8Array(TILE8X8_HEADER + tileBytes.length * TILE8X8_BYTES);
  raw[0] = 8; raw[1] = 0; // height = 8
  raw[2] = 1; raw[3] = 0; // width/8 = 1
  raw[TILE8X8_COUNT_OFFSET] = tileBytes.length; // count byte
  let o = TILE8X8_HEADER;
  for (const t of tileBytes) { raw.set(t, o); o += TILE8X8_BYTES; }
  return raw;
}

describe('decode8x8dBlock — synthetic', () => {
  it('sniffs the (8,1) tile-strip header with a matching count byte', () => {
    expect(sniff8x8dBlock(makeTileBlock([new Array(32).fill(0)]))).toBe(true);
    const notTile = new Uint8Array(64); // header (0,0)
    expect(sniff8x8dBlock(notTile)).toBe(false);
    // Right dims but the count byte disagrees with the framing → not a tile block.
    const badCount = makeTileBlock([new Array(32).fill(0)]);
    badCount[TILE8X8_COUNT_OFFSET] = 9;
    expect(sniff8x8dBlock(badCount)).toBe(false);
  });

  it('reads the tile count from the byte at offset 8 (no trailing tail)', () => {
    const t0 = new Array(32).fill(0x12);
    const t1 = new Array(32).fill(0x34);
    const ts = decode8x8dBlock(makeTileBlock([t0, t1]));
    expect(ts.tiles).toHaveLength(2);
    expect(ts.tileWidth).toBe(8);
    expect(ts.tileHeight).toBe(8);
  });

  it('unpacks 8×8 chunky-4bpp with high nibble = left pixel', () => {
    // One tile, every byte 0xA3 → left pixel 0xA, right pixel 0x3, across all 64 px.
    const ts = decode8x8dBlock(makeTileBlock([new Array(32).fill(0xa3)]));
    const img = ts.tiles[0];
    expect(img.width).toBe(8);
    expect(img.indices).toHaveLength(64);
    for (let x = 0; x < 8; x++) expect(img.indices[x]).toBe(x % 2 === 0 ? 0xa : 0x3);
    expect(img.palette?.source).toBe('ega-fixed');
    expect(img.transparentIndex).toBeNull(); // default: opaque (raw bytes for the browser)
  });

  it('marks colour 13 transparent when transparentMagenta is requested', () => {
    const ts = decode8x8dBlock(makeTileBlock([new Array(32).fill(0xdd)]), '', {
      transparentMagenta: true,
    });
    expect(ts.tiles[0].transparentIndex).toBe(13);
  });

  it('decodes Gateway strict 5-plane UI tiles and keeps them opaque', () => {
    const raw = new Uint8Array(TILE8X8_HEADER + TILE8X8_PLANAR5_BYTES + TILE8X8_PLANAR5_TRAILER);
    raw[0] = 8; raw[2] = 1; raw[TILE8X8_COUNT_OFFSET] = 1;
    // Row 0: plane 0 has alternating pixels, plane 4 has its left pixel set.
    const pixelStart = TILE8X8_HEADER + TILE8X8_PLANAR5_TRAILER;
    raw[pixelStart] = 0b10101010;
    raw[pixelStart + 4] = 0b10000000;
    expect(sniff8x8dPlanar5Block(raw)).toBe(true);
    expect(sniff8x8dBlock(raw)).toBe(true);
    const tile = decode8x8dBlock(raw, 'gateway-ui', { transparentMagenta: true }).tiles[0];
    expect([...tile.indices.slice(0, 8)]).toEqual([17, 0, 1, 0, 1, 0, 1, 0]);
    expect(tile.transparentIndex).toBeNull();
    expect(tile.encoding).toBe('8x8d-planar5');
  });

  it('accepts Gateway planar5 wall banks with their distinct 41-byte tail', () => {
    const raw = new Uint8Array(TILE8X8_HEADER + TILE8X8_PLANAR5_BYTES + TILE8X8_PLANAR5_WALL_TRAILER);
    raw[0] = 8; raw[2] = 1; raw[TILE8X8_COUNT_OFFSET] = 1;
    raw[TILE8X8_HEADER + TILE8X8_PLANAR5_WALL_TRAILER + 1] = 0x80;
    expect(sniff8x8dPlanar5Block(raw)).toBe(true);
    const tile = decode8x8dBlock(raw, 'gateway-wall', { transparentMagenta: true }).tiles[0];
    expect(tile.indices[0]).toBe(2);
    expect(tile.transparentIndex).toBe(13);
  });

  it('rejects a non-tile block', () => {
    expect(() => decode8x8dBlock(new Uint8Array(40))).toThrow(/expected a tile block/);
  });
});

// --- Golden: real CoK 8X8D1.DAX (skips if data absent) ----------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const tilePath = resolve(repoRoot, 'Champions of Krynn', '8X8D1.DAX');

describe('decode8x8dBlock — golden CoK 8X8D1', () => {
  it.skipIf(!existsSync(tilePath))('decodes the expected tile counts and valid pixels', async () => {
    const blocks = readDaxDataBlocks(new Uint8Array(await readFile(tilePath)));
    const expected: Record<number, number> = { 11: 70, 12: 70, 31: 70, 32: 70, 23: 70, 202: 38, 203: 45 };
    for (const [id, n] of Object.entries(expected)) {
      const blk = blocks.find((b) => b.blockId === Number(id));
      expect(blk, `8X8D1 must contain block ${id}`).toBeDefined();
      expect(sniff8x8dBlock(blk!.raw)).toBe(true);
      // The count byte is authoritative; tiles + the 9-byte header + 8-byte trailer = length.
      expect(blk!.raw[TILE8X8_COUNT_OFFSET], `block ${id} count byte`).toBe(n);
      expect(TILE8X8_HEADER + n * TILE8X8_BYTES + TILE8X8_TRAILER, `block ${id} exact length`).toBe(
        blk!.raw.length,
      );
      const ts = decode8x8dBlock(blk!.raw, `8X8D1#${id}`);
      expect(ts.tiles.length, `block ${id} tile count`).toBe(n);
      // Every pixel is a valid 0..15 EGA index.
      for (const px of ts.tiles[0].indices) expect(px).toBeLessThanOrEqual(15);
    }
  });

  it.skipIf(!existsSync(tilePath))(
    'the dedicated 8X8D path and the generic DAX tileset path agree pixel-for-pixel',
    async () => {
      // Two independent decoders must produce identical tiles (locks the 17-byte header
      // so a future regression to the old offset-9 split can't slip through silently).
      const file = new Uint8Array(await readFile(tilePath));
      const dedicated = readDaxDataBlocks(file);
      const generic = decodeDax(file, '8X8D1');
      for (const blk of generic.blocks.filter((b) => b.kind === 'tileset')) {
        const ts = decode8x8dBlock(
          dedicated.find((d) => d.blockId === blk.blockId)!.raw,
          `8X8D1#${blk.blockId}`,
          { transparentMagenta: true },
        );
        expect(ts.tiles.length).toBe(blk.frames!.length);
        for (let i = 0; i < ts.tiles.length; i++) {
          expect([...ts.tiles[i].indices], `block ${blk.blockId} tile ${i}`).toEqual([
            ...blk.frames![i].indices,
          ]);
        }
      }
    },
  );
});

// --- Retail: the Pools/Treasures VGA chunky framing obeys the same switch --------------------

/**
 * The third 8X8D framing used to answer `transparentIndex: 13` no matter what was asked of it: its
 * branch sat ABOVE the option parsing, so `transparentMagenta` — documented as off by default and
 * honoured by the other two framings — could not reach it. `decodeDax` hands the identical bytes
 * back as `dax-vga-chunky-items` with `transparentIndex: null`, so one family answered two
 * different ways depending on the entry point.
 *
 * Measured over the retail corpus at the time of the fix: 20 chunky 8X8D blocks, 4648 tiles,
 * 297472 px, of which 33973 (11.42%) are index 13. Two blocks declare `base 0 / 16 colours` with
 * index 13 = (255,85,255) — EGA magenta, so the key colour itself is right; the other 18 declare
 * `base 32 / 112` and spend 113942 px below index 32, on the window those first two declare.
 */
const POOLS_8X8D1 = 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/8X8D1.DAX';

describe('decode8x8dBlock — retail VGA chunky (Pools of Darkness)', () => {
  const chunkyBlocks = async () => {
    const arc = decodeDax(new Uint8Array(await readFile(POOLS_8X8D1)), '8X8D1.DAX');
    return arc.blocks.filter((b) => !sniff8x8dBlock(b.raw));
  };

  it.skipIf(!existsSync(POOLS_8X8D1))('these blocks reach the chunky branch and no other', async () => {
    const blocks = await chunkyBlocks();
    // Null for the claim below: if `sniff8x8dBlock` accepted them the 4bpp path would answer
    // instead and this suite would be testing nothing.
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(sniff8x8dBlock(b.raw), 'must be rejected by the 4bpp sniff').toBe(false);
      expect(sniff8x8dPlanar5Block(b.raw), 'must be rejected by the planar5 sniff').toBe(false);
      expect(decode8x8dBlock(b.raw).tiles.length).toBe(256);
    }
  });

  it.skipIf(!existsSync(POOLS_8X8D1))('defaults to opaque, and keys 13 only when asked', async () => {
    const blocks = await chunkyBlocks();
    let realising = 0;
    for (const b of blocks) {
      const off = decode8x8dBlock(b.raw, 'off');
      const on = decode8x8dBlock(b.raw, 'on', { transparentMagenta: true });
      for (const t of off.tiles) expect(t.transparentIndex).toBeNull();
      for (const t of on.tiles) expect(t.transparentIndex).toBe(13);
      // Same pixels either way — only the claim about them changes.
      expect([...off.tiles[0].indices]).toEqual([...on.tiles[0].indices]);
      realising += on.tiles.filter((t) => t.indices.includes(13)).length;
    }
    // The key is load-bearing rather than nominal: index 13 really is present in this family.
    expect(realising).toBeGreaterThan(0);
  });

  it.skipIf(!existsSync(POOLS_8X8D1))('agrees with the generic DAX path on the default', async () => {
    // The bug in one sentence: these two disagreed. `decodeDax` says null; so must this.
    // It reaches the same bytes by a third route — `daxTreasures8x8dTile`, which returns one
    // whole sheet per block rather than 256 tiles, and whose docblock has always said opaque.
    const arc = decodeDax(new Uint8Array(await readFile(POOLS_8X8D1)), '8X8D1.DAX');
    const generic = arc.blocks.flatMap((b) => b.frames ?? (b.image ? [b.image] : []));
    const chunky = generic.filter((i) => i.encoding === 'dax-8x8d-treasures-mode2');
    expect(chunky.length).toBeGreaterThan(0);
    for (const i of chunky) expect(i.transparentIndex).toBeNull();
    for (const b of arc.blocks.filter((x) => !sniff8x8dBlock(x.raw))) {
      for (const t of decode8x8dBlock(b.raw).tiles) expect(t.transparentIndex).toBeNull();
    }
  });

  it.skipIf(!existsSync(POOLS_8X8D1))('keeps the embedded DAC window, and lets a caller override it', async () => {
    const blocks = await chunkyBlocks();
    const b = blocks[0]!;
    const embedded = decode8x8dBlock(b.raw).palette;
    // Not EGA-16: the wall banks declare a 112-entry window based at 32.
    expect(embedded.source).toBe('dax-vga-chunky-items');
    expect([embedded.firstColor, embedded.count]).toEqual([32, 112]);

    // `options.palette` was silently discarded here. It now wins, and reaches the tiles too.
    const ega = makeEgaPalette();
    const forced = decode8x8dBlock(b.raw, 'forced', { palette: ega });
    expect(forced.palette).toBe(ega);
    expect(forced.tiles[0].palette).toBe(ega);
  });
});
