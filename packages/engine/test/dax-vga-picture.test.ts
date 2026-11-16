/**
 * P3.1 Savage Frontier VGA archive contract — parity proof for the Gateway
 * VGA-extended DAX "picture" frame format (`src/loaders/daxVgaPicture.ts`).
 *
 * No independent VGA reference renderer exists for this format (unlike DaxDump.exe for
 * plain DAX), so the parity proof required by BUILD-QUEUE.md's P3.1 leaf is built
 * straight from retail bytes, per that leaf's own allowed fallback:
 *   1. Every real Gateway "picture" DAX block matches the documented byte formula
 *      EXACTLY (zero slop) — proving the pixel-packing rule's byte-accounting.
 *   2. decode → re-encode round-trips to the ORIGINAL retail bytes byte-for-byte —
 *      proving the decode is lossless and the packing rule (33-byte prefix followed by
 *      five per-row bitplanes) is exactly correct, not just plausible.
 *   3. CoK's own same-named files (TITLE.DAX, BIGPIC1.DAX, committed in-repo) are a
 *      negative control: they never match this format, so detection cannot be
 *      accidentally firing on plain EGA data.
 *
 * See docs/engine/research/gateway-vga-picture-format.md for the full derivation
 * (including the GAME.OVR INT10 AX=1010h DAC-register evidence) and
 * docs/dax-format.md §4d for the format summary.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readDaxDataBlocks } from '../src/loaders/dax.js';
import {
  encodeVgaExtendedPicture,
  GATEWAY_VGA_EXT_DAC,
  parseVgaExtendedPicture,
  vgaExtendedPictureByteLength,
  vgaExtendedPictureToIndexedImage,
  buildGatewayVgaExtendedPalette,
} from '../src/loaders/daxVgaPicture.js';

const repoRoot = resolve(__dirname, '..', '..', '..');
const gatewayDir = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const cokDir = resolve(repoRoot, 'Champions of Krynn');

const haveGateway = existsSync(resolve(gatewayDir, 'TITLE.DAX')) && existsSync(resolve(gatewayDir, 'BIGPIC1.DAX'));

function loadBlocks(dir: string, file: string) {
  const bytes = new Uint8Array(readFileSync(resolve(dir, file)));
  return readDaxDataBlocks(bytes);
}

describe('parseVgaExtendedPicture — Gateway retail picture blocks', () => {
  it.skipIf(!haveGateway)('TITLE.DAX: every block matches the byte formula exactly and round-trips losslessly', () => {
    const blocks = loadBlocks(gatewayDir, 'TITLE.DAX');
    expect(blocks.length).toBeGreaterThan(0);
    for (const blk of blocks) {
      const pic = parseVgaExtendedPicture(blk.raw);
      expect(pic, `block ${blk.blockId}`).not.toBeNull();
      const expectedLen = vgaExtendedPictureByteLength(pic!.width, pic!.height);
      expect(blk.raw.byteLength, `block ${blk.blockId} exact byte formula`).toBe(expectedLen);
      // Known retail geometry: Gateway's TITLE screens are all 320x200.
      expect(pic!.width).toBe(320);
      expect(pic!.height).toBe(200);
      expect(pic!.indices.length).toBe(320 * 200);
      // Every decoded index is in range 0..31 (five one-bit planes).
      for (const idx of pic!.indices) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThanOrEqual(31);
      }
      // Round-trip: re-encoding the decoded planes must reproduce the ORIGINAL retail
      // bytes exactly — this is the lossless pixel-packing-rule proof.
      const reencoded = encodeVgaExtendedPicture(pic!);
      expect(reencoded.byteLength).toBe(blk.raw.byteLength);
      expect(reencoded).toEqual(blk.raw);
    }
  });

  it.skipIf(!haveGateway)('BIGPIC1.DAX: every scene block matches the byte formula exactly and round-trips losslessly', () => {
    const blocks = loadBlocks(gatewayDir, 'BIGPIC1.DAX');
    expect(blocks.length).toBeGreaterThan(0);
    for (const blk of blocks) {
      const pic = parseVgaExtendedPicture(blk.raw);
      expect(pic, `block ${blk.blockId}`).not.toBeNull();
      const expectedLen = vgaExtendedPictureByteLength(pic!.width, pic!.height);
      expect(blk.raw.byteLength, `block ${blk.blockId} exact byte formula`).toBe(expectedLen);
      const reencoded = encodeVgaExtendedPicture(pic!);
      expect(reencoded).toEqual(blk.raw);
    }
  });

  it.skipIf(!haveGateway)('every metadata prefix is exactly 33 bytes and genuinely varies', () => {
    const blocks = [...loadBlocks(gatewayDir, 'TITLE.DAX'), ...loadBlocks(gatewayDir, 'BIGPIC1.DAX')];
    const prefixes = blocks.map((blk) => parseVgaExtendedPicture(blk.raw)!.prefix);
    for (const prefix of prefixes) expect(prefix.byteLength).toBe(33);
    const hexes = new Set(prefixes.map((prefix) => Buffer.from(prefix).toString('hex')));
    expect(hexes.size).toBeGreaterThan(1);
  });

  it.skipIf(!haveGateway)('the no-prefix fallback still defines only the two independently proven registers', () => {
    // This is now the FALLBACK palette, used when a block's own 24 bytes fail the self-check.
    // Real decodes go through `gatewayExtendedPaletteFromPicture` and fill 18..31.
    const palette = buildGatewayVgaExtendedPalette();
    expect(palette.source).toBe('dax-vga-ext-partial');
    for (let i = 0; i < 16; i++) expect(palette.colors[i]).not.toBeNull();
    expect(palette.colors[16]).toEqual(GATEWAY_VGA_EXT_DAC[16]);
    expect(palette.colors[17]).toEqual(GATEWAY_VGA_EXT_DAC[17]);
    for (let i = 18; i <= 31; i++) expect(palette.colors[i], `index ${i}`).toBeNull();
    // 6-bit DAC (0x3C,0x30,0x10) and (0x3C,0x24,0x10) scaled to 8-bit (round(v*255/63)), per GAME.OVR.
    expect(GATEWAY_VGA_EXT_DAC[16]).toEqual({ r: 243, g: 194, b: 65 });
    expect(GATEWAY_VGA_EXT_DAC[17]).toEqual({ r: 243, g: 146, b: 65 });
  });

  it.skipIf(!haveGateway)('every vga-ext picture family carries its own extended palette too', () => {
    // The rule was derived on the PIC*.DAX planar5 family. It generalises: TITLE, BIGPIC,
    // BODY and CPIC blocks all pass the same self-check, on files with different geometry.
    let checked = 0;
    for (const file of ['TITLE.DAX', 'BIGPIC1.DAX', 'BODY.DAX', 'CPIC2.DAX']) {
      for (const blk of loadBlocks(gatewayDir, file)) {
        const pic = parseVgaExtendedPicture(blk.raw);
        if (!pic) continue;
        const img = vgaExtendedPictureToIndexedImage(pic);
        expect(img.palette!.source, `${file} block ${blk.blockId}`).toBe('dax-vga-ext');
        expect(img.palette!.colors[16]).toEqual(GATEWAY_VGA_EXT_DAC[16]);
        for (let i = 18; i <= 31; i++) expect(img.palette!.colors[i]).not.toBeNull();
        checked++;
      }
    }
    expect(checked).toBe(54);
  });
});

describe('parseVgaExtendedPicture — negative control (CoK EGA files never match)', () => {
  it('CoK TITLE.DAX blocks are plain EGA (no extension plane) and are rejected', () => {
    const blocks = loadBlocks(cokDir, 'TITLE.DAX');
    expect(blocks.length).toBeGreaterThan(0);
    for (const blk of blocks) {
      expect(parseVgaExtendedPicture(blk.raw), `CoK TITLE block ${blk.blockId}`).toBeNull();
    }
  });

  it('CoK BIGPIC1.DAX blocks are plain EGA (no extension plane) and are rejected', () => {
    const blocks = loadBlocks(cokDir, 'BIGPIC1.DAX');
    expect(blocks.length).toBeGreaterThan(0);
    for (const blk of blocks) {
      expect(parseVgaExtendedPicture(blk.raw), `CoK BIGPIC1 block ${blk.blockId}`).toBeNull();
    }
  });
});
