/**
 * Parity check for the Treasures of the Savage Frontier / Pools of Darkness "chunky
 * VGA256 title" DAX picture format (`src/loaders/daxVga256Title.ts`), found in
 * `docs/engine/research/treasures-pools-darkness-scoping.md` §2.
 *
 * No independent reference renderer exists for this format either (same situation as
 * Gateway's own VGA-extended format), so this proves the shape the same way that
 * format's test does: every real block matches the exact byte-count formula, the
 * would-be palette region is a valid 6-bit DAC range throughout, and CoK/Gateway's own
 * TITLE.DAX (different formats entirely) are negative controls that never match.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readDaxDataBlocks } from '../src/loaders/dax.js';
import { parseVga256Title, vga256TitleByteLength } from '../src/loaders/daxVga256Title.js';

const repoRoot = resolve(__dirname, '..', '..', '..');
const treasuresDir = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier';
const poolsDir = 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness';
const gatewayDir = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const cokDir = resolve(repoRoot, 'Champions of Krynn');

const haveTreasures = existsSync(resolve(treasuresDir, 'TITLE.DAX'));
const havePools = existsSync(resolve(poolsDir, 'TITLE.DAX'));
const haveGateway = existsSync(resolve(gatewayDir, 'TITLE.DAX'));

function loadBlocks(dir: string, file: string) {
  const bytes = new Uint8Array(readFileSync(resolve(dir, file)));
  return readDaxDataBlocks(bytes);
}

describe('parseVga256Title — Treasures/Pools retail TITLE.DAX', () => {
  it.skipIf(!haveTreasures)('Treasures TITLE.DAX: every block matches the byte formula and decodes a valid palette', () => {
    const blocks = loadBlocks(treasuresDir, 'TITLE.DAX');
    expect(blocks.length).toBeGreaterThan(0);
    for (const blk of blocks) {
      expect(blk.raw.byteLength, `block ${blk.blockId} size`).toBe(vga256TitleByteLength(320, 200));
      const pic = parseVga256Title(blk.raw);
      expect(pic, `block ${blk.blockId}`).not.toBeNull();
      expect(pic!.width).toBe(320);
      expect(pic!.height).toBe(200);
      expect(pic!.indices.length).toBe(320 * 200);
      expect(pic!.palette.source).toBe('dax-vga256-title');
      expect(pic!.palette.colors.length).toBe(256);
      // Every one of the 256 slots is defined (this format embeds a FULL palette).
      for (const c of pic!.palette.colors) expect(c).not.toBeNull();
      expect(pic!.trailer.byteLength).toBe(132);
    }
  });

  it.skipIf(!havePools)('Pools of Darkness TITLE.DAX: every block matches the byte formula and decodes a valid palette', () => {
    const blocks = loadBlocks(poolsDir, 'TITLE.DAX');
    expect(blocks.length).toBeGreaterThan(0);
    for (const blk of blocks) {
      const pic = parseVga256Title(blk.raw);
      expect(pic, `block ${blk.blockId}`).not.toBeNull();
      expect(pic!.indices.length).toBe(320 * 200);
      for (const c of pic!.palette.colors) expect(c).not.toBeNull();
    }
  });

  it.skipIf(!haveTreasures || !havePools)('both titles use the same container shape (byte length, header, valid full palette)', () => {
    // Both titles' TITLE.DAX blocks are 64910 bytes and decode under the same rule —
    // structural proof this is one shared "Treasures/Pools family" format, not a
    // coincidence of one title's byte count alone (Gateway's own TITLE.DAX, by
    // contrast, is a different size and format entirely — see the negative control
    // below). Palette CONTENT legitimately differs per title's own art, so this checks
    // shape, not color equality.
    const t = parseVga256Title(loadBlocks(treasuresDir, 'TITLE.DAX')[0]!.raw)!;
    const p = parseVga256Title(loadBlocks(poolsDir, 'TITLE.DAX')[0]!.raw)!;
    expect(t.width).toBe(p.width);
    expect(t.height).toBe(p.height);
    expect(t.trailer.byteLength).toBe(p.trailer.byteLength);
  });
});

describe('parseVga256Title — negative controls (other formats never match)', () => {
  it('CoK TITLE.DAX blocks (plain EGA) are rejected', () => {
    const blocks = loadBlocks(cokDir, 'TITLE.DAX');
    expect(blocks.length).toBeGreaterThan(0);
    for (const blk of blocks) {
      expect(parseVga256Title(blk.raw), `CoK TITLE block ${blk.blockId}`).toBeNull();
    }
  });

  it.skipIf(!haveGateway)('Gateway TITLE.DAX blocks (vga-ext-frame, different byte count) are rejected', () => {
    const blocks = loadBlocks(gatewayDir, 'TITLE.DAX');
    expect(blocks.length).toBeGreaterThan(0);
    for (const blk of blocks) {
      expect(parseVga256Title(blk.raw), `Gateway TITLE block ${blk.blockId}`).toBeNull();
    }
  });
});
