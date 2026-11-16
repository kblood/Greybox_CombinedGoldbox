/**
 * MANUAL render harness — composes the REAL Champions of Krynn exploration screen from the
 * game's own 8X8D1.DAX (frame tiles block 202 + font block 201) and writes a PNG to
 * renders/explore/ for visual validation. Skipped automatically when the GOG assets aren't
 * present. This is the empirical check behind composeExploreScreen (synthetic unit tests in
 * exploreScreen.test.ts cover placement logic; this confirms it against the actual tiles).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  decodeDax,
  loadCokFont,
  composeExploreScreen,
  createFramebuffer,
  fillRectIndexed,
  framebufferToRGBA,
  makeEgaPalette,
} from '../src/index.js';

const DAX_PATH = resolve(__dirname, '../../../Champions of Krynn/8X8D1.DAX');
const OUT_DIR = resolve(__dirname, '../../../renders/explore');

// ── Minimal PNG encoder (truecolor, no deps beyond zlib) ─────────────────────────────────
function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const t = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);
  const body = new Uint8Array(t.length + data.length);
  body.set(t, 0);
  body.set(data, t.length);
  const out = new Uint8Array(4 + body.length + 4); // length(4) + (type+data) + crc(4)
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(body, 4);
  dv.setUint32(4 + body.length, crc32(body));
  return out;
}
function encodePNG(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = y * (1 + w * 3) + 1 + x * 3;
      raw[d] = rgba[s]!;
      raw[d + 1] = rgba[s + 1]!;
      raw[d + 2] = rgba[s + 2]!;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolor
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

describe.skipIf(!existsSync(DAX_PATH))('CoK exploration screen — real-asset render', () => {
  it('composes the screen from 8X8D1.DAX and writes a PNG', () => {
    const bytes = new Uint8Array(readFileSync(DAX_PATH));
    const archive = decodeDax(bytes, '8X8D1.DAX');
    const block202 = archive.blocks.find((b) => b.blockId === 202);
    expect(block202?.frames?.length).toBe(38); // CoK frame tiles (20-25) + arrows + moons
    // CoK's exploration frame is block 202 (set 4) tiles 20-25, driven by COK_FRAME_LAYOUT
    // (extracted MSE=0 from a real screenshot — docs/engine/research/cok-frame-arrays.md).
    const frameTiles = block202!.frames!;
    // Moons: block-202 tiles 32 (Solinari/white), 29 (Lunitari/red), 36 (Nuitari/blue) as in
    // the reference screenshot; order matches MOON_COLUMNS (cols 8/19/30 left→right).
    const moons = [frameTiles[32]!, frameTiles[29]!, frameTiles[36]!];
    const font = loadCokFont(bytes);
    expect(font).not.toBeNull();

    // Placeholder viewport: a ceiling/floor split so the window is visibly placed.
    const viewport = createFramebuffer(168, 168, 0); // black ceiling
    fillRectIndexed(viewport, 0, 84, 168, 84, 8); // dark-gray floor

    const fb = composeExploreScreen({
      frameTiles,
      moons,
      font,
      viewport,
      party: [
        { name: 'Caramon', ac: 4, hp: 42, active: true },
        { name: 'Raistlin', ac: 8, hp: 18 },
        { name: 'Tanis', ac: 5, hp: 35 },
        { name: 'Goldmoon', ac: 6, hp: 28 },
      ],
      position: '12,7 NORTH 06:30',
      message: 'You are in a dark passage.\nExits lead north and east.',
      prompt: 'EXPLORE: MOVE OR (S)EARCH',
    });

    const rgba = framebufferToRGBA(fb, makeEgaPalette());
    mkdirSync(OUT_DIR, { recursive: true });
    const png = encodePNG(rgba, fb.width, fb.height);
    writeFileSync(resolve(OUT_DIR, 'cok-explore.png'), png);

    // Also dump the 45 frame tiles (block 203) as a strip for tile-index annotation.
    const strip = createFramebuffer(frameTiles.length * 8, 8, 0);
    frameTiles.forEach((t, i) => {
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 8; x++) {
          const idx = t.indices[y * 8 + x]!;
          strip.indices[y * strip.width + i * 8 + x] = idx === t.transparentIndex ? 5 : idx;
        }
    });
    writeFileSync(
      resolve(OUT_DIR, 'block203-tiles.png'),
      encodePNG(framebufferToRGBA(strip, makeEgaPalette()), strip.width, strip.height),
    );

    expect(png.length).toBeGreaterThan(100);
  });
});
