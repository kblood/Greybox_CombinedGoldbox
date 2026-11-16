/**
 * CoK Amiga 8X8D tile-strip decode (`decodeDaaTileStrip`) — verified against the DOS oracle.
 *
 * The Amiga `8X8D1.DAA` block 202 holds the same logical tiles as the DOS `8X8D1.DAX` block 202
 * (exploration frame 20–25, moons 26–37) in the 4-plane EGA strip format the research solved
 * (docs/engine/research/amiga-8x8d-planeorder.md). The decisive, non-circular check is the
 * **cross-platform identity**: CoK's 8×8 UI chrome is byte-for-byte the SAME 16-colour EGA art on
 * DOS and Amiga — every one of the 38 block-202 tiles decodes to identical palette indices (IoU 1.0,
 * 0 differing pixels). That identity is exactly what validates the decoder: a correct plane order +
 * palette reproduces the DOS oracle pixel-perfectly. (The Amiga visual advantage in CoK lives in the
 * 32-colour full-screen art — BIGPIC/portraits/backdrops — NOT this shared 8×8 chrome.)
 * Skipped automatically when the GOG / Amiga assets aren't present locally.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeDax, decodeDaa, decodeDaaTileStrip, isDaaTileStrip, type IndexedImage, type DaaBlock } from '../src/index.js';
import type { DaxBlock } from '../src/index.js';

const DOS = resolve(__dirname, '../../../Champions of Krynn/8X8D1.DAX');
const AMIGA = resolve(__dirname, '../../../amiga_extracted/ChampionsOfKrynn/disk2/8X8D1.DAA');
const MAGENTA = 13;

/** Opaque-pixel mask (true where the tile draws, i.e. not the magenta key). */
function opaqueMask(img: IndexedImage): boolean[] {
  return Array.from(img.indices, (i) => i !== MAGENTA);
}
function maskEqual(a: boolean[], b: boolean[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

describe.skipIf(!existsSync(DOS) || !existsSync(AMIGA))('CoK Amiga 8X8D tile strip', () => {
  // Defer file reads to beforeAll so they never run during describe-collection when
  // describe.skipIf is true (Vitest still invokes the describe callback for test registration).
  let amigaBlock202: DaaBlock | undefined;
  let dosBlock202: DaxBlock | undefined;

  beforeAll(() => {
    amigaBlock202 = decodeDaa(new Uint8Array(readFileSync(AMIGA)), '8X8D1.DAA').blocks.find(
      (b) => b.blockId === 202,
    );
    dosBlock202 = decodeDax(new Uint8Array(readFileSync(DOS)), '8X8D1.DAX').blocks.find(
      (b) => b.blockId === 202,
    );
  });

  it('detects + decodes block 202 as a 38-tile strip', () => {
    expect(amigaBlock202).toBeDefined();
    expect(isDaaTileStrip(amigaBlock202!.raw)).toBe(true);
    const tiles = decodeDaaTileStrip(amigaBlock202!.raw);
    expect(tiles).toHaveLength(38);
    expect(tiles[0]!.width).toBe(8);
    expect(tiles[0]!.height).toBe(8);
    expect(tiles[0]!.palette?.source).toBe('ega-fixed');
  });

  it('frame tiles 20/21 match the DOS block-202 shapes exactly (cross-platform oracle)', () => {
    const amiga = decodeDaaTileStrip(amigaBlock202!.raw);
    const dos = dosBlock202!.frames!;
    for (const idx of [20, 21]) {
      expect(maskEqual(opaqueMask(amiga[idx]!), opaqueMask(dos[idx]!))).toBe(true);
    }
  });

  it('ALL 38 tiles are byte-identical to DOS (the cross-platform identity that validates the decoder)', () => {
    const amiga = decodeDaaTileStrip(amigaBlock202!.raw);
    const dos = dosBlock202!.frames!;
    expect(amiga).toHaveLength(38);
    expect(dos.length).toBeGreaterThanOrEqual(38);
    let differingPixels = 0;
    const differingTiles: number[] = [];
    for (let t = 0; t < 38; t++) {
      const a = amiga[t]!.indices;
      const d = dos[t]!.indices;
      expect(a.length).toBe(d.length);
      let tileDiff = 0;
      for (let p = 0; p < a.length; p++) if (a[p] !== d[p]) tileDiff++;
      if (tileDiff > 0) differingTiles.push(t);
      differingPixels += tileDiff;
    }
    // CoK's 8×8 chrome is the same EGA art on both platforms: expect a perfect match.
    expect({ differingPixels, differingTiles }).toEqual({ differingPixels: 0, differingTiles: [] });
  });

  it('decodes the three moon colours (red/white/blue) per the EGA-16 palette', () => {
    const tiles = decodeDaaTileStrip(amigaBlock202!.raw);
    const has = (t: IndexedImage, color: number) => Array.from(t.indices).includes(color);
    expect(has(tiles[28]!, 4)).toBe(true); // Lunitari group → EGA red (idx 4)
    expect(has(tiles[32]!, 15)).toBe(true); // Solinari group → EGA white (idx 15)
    expect(has(tiles[36]!, 1)).toBe(true); // Nuitari group → EGA blue (idx 1)
  });

  it('rejects a non-strip block (5-plane image frame)', () => {
    // A 5-plane BIGPIC frame must NOT be misdetected as a tile strip.
    const bigpic = resolve(__dirname, '../../../amiga_extracted/ChampionsOfKrynn/disk2/BIGPIC1.DAA');
    if (!existsSync(bigpic)) return;
    const arc = decodeDaa(new Uint8Array(readFileSync(bigpic)), 'BIGPIC1.DAA');
    for (const b of arc.blocks) expect(isDaaTileStrip(b.raw)).toBe(false);
  });
});

/**
 * Archive-level routing: `decodeDaa` must surface every tile of a strip, not just the first.
 *
 * Until 2026-08-21 the block loop had no strip check at all — every block went straight to
 * `parseFrameHeader`, which ignores header byte 8. For an 8X8D strip that header parses as an
 * 8×8 picture whose "palette" is the next 64 bytes of *tile pixels*, so a 70-tile block became
 * one mis-coloured tile and the other 69 were unreachable from the archive. `decodeDaaTileStrip`
 * itself was correct the whole time (the suite above pins it at IoU 1.0 against DOS); nothing
 * called it here.
 *
 * The oracle is the DOS `.DAX` of the same name: it stores `item_count` at the same header
 * offset, for the same sparse block ids, and its loader has always honoured it.
 */
describe.skipIf(!existsSync(DOS) || !existsSync(AMIGA))('DAA archive tile-strip routing', () => {
  it('gives every 8X8D block the tile count the DOS block declares', () => {
    const amiga = decodeDaa(new Uint8Array(readFileSync(AMIGA)), '8X8D1.DAA');
    const dos = decodeDax(new Uint8Array(readFileSync(DOS)), '8X8D1.DAX');

    const dosCount = new Map<number, number>();
    for (const b of dos.blocks) {
      // Exclude the Gen1 text-font bank (block 201, kind 'font', 2026-09-02): a 64-glyph
      // sheet with no Amiga tile-strip counterpart, not a wall/decoration tile bank like the
      // other multi-item 8X8D blocks this DOS-vs-Amiga comparison is about.
      if (b.kind === 'font') continue;
      if (b.frames && b.frames.length > 1) dosCount.set(b.blockId, b.frames.length);
    }
    // Guard the oracle itself: if DOS stopped reporting multi-item blocks this test would
    // vacuously pass on an empty comparison. DOS splits its 8X8D banks across 8X8D0/1/2
    // differently from Amiga (7 multi-item blocks here against Amiga's 12), so the comparison
    // runs over the shared block ids and the Amiga total is asserted separately.
    expect(dosCount.size).toBe(7);

    const compared: Record<number, [number, number]> = {};
    for (const [blockId, want] of dosCount) {
      const blk = amiga.blocks.find((b) => b.blockId === blockId);
      if (!blk) continue;
      compared[blockId] = [blk.frames?.length ?? 1, want];
    }
    const mismatched = Object.entries(compared).filter(([, [got, want]]) => got !== want);
    expect({ mismatched, shared: Object.keys(compared).length }).toEqual({
      mismatched: [],
      shared: 7,
    });

    // The number that regresses if the routing is removed: the archive would expose 12 single
    // tiles instead of 783.
    const total = amiga.blocks.reduce((a, b) => a + (b.frames?.length ?? 0), 0);
    expect(total).toBe(783);
  });

  it('marks routed strips as tilesets and keeps image === frames[0]', () => {
    const amiga = decodeDaa(new Uint8Array(readFileSync(AMIGA)), '8X8D1.DAA');
    const strips = amiga.blocks.filter((b) => b.kind === 'tileset');
    expect(strips.length).toBeGreaterThanOrEqual(12);
    for (const b of strips) {
      expect(b.frames!.length).toBe(b.raw[8]);
      expect(b.image).toBe(b.frames![0]);
      // The frameSet entry a browser/compositor reads must be the real first tile.
      expect(amiga.frameSet.frames.get(b.blockId)).toBe(b.frames![0]);
    }
  });
});
