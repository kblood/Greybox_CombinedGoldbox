/**
 * MANUAL calibration harness for Neverwinter Nights (DOS/AOL) `8X8D.DAX` block 202 (the
 * exploration-screen frame/moon-chrome tileset). NWN's block 202 has 40 tiles vs. CoK's 38
 * (`docs/engine/research/neverwinter-nights-dos-format-coverage.md`'s 8X8D detail section), so
 * `COK_FRAME_LAYOUT`'s hardcoded tile indices cannot be imported unmodified — see `gameData.ts`'s
 * `frameTilesUnverified` flag.
 *
 * This harness dumps EVERY block-202 tile individually, labeled by index, at a legible scale, so
 * the tiles can be identified by eye the same way CoK's own layout was originally pinned (MSE=0
 * match against a real screenshot in `cok-frame-arrays.md`) — except NWN has no known surviving
 * DOS screenshot to match against, so this is a *structural* calibration (find the horizontal
 * bar / vertical bar / junction / bracket / moon tiles by visual pattern, the same six-role
 * grammar CoK's own frame uses) rather than a pixel-exact one. Skipped automatically when the
 * user's real NWN assets aren't present.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import {
  decodeDax,
  createFramebuffer,
  fillRectIndexed,
  framebufferToRGBA,
  makeEgaPalette,
  loadCokFont,
  composeExploreScreen,
  NWN_FRAME_LAYOUT,
  type IndexedFramebuffer,
} from '../src/index.js';

const NWN_DIR = 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint';
const DAX_PATH = resolve(NWN_DIR, '8X8D.DAX');
const OUT_DIR = resolve(__dirname, '../../../renders/explore/nwn');

// ── Minimal PNG encoder (truecolor, no deps beyond zlib) — copied from renderExplore.manual.test.ts ──
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
  const out = new Uint8Array(4 + body.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  out.set(body, 4);
  dv.setUint32(4 + body.length, crc32(body));
  return out;
}
function encodePNG(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const raw = new Uint8Array(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
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
  ihdr[8] = 8;
  ihdr[9] = 2;
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
function writePng(name: string, fb: IndexedFramebuffer): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const rgba = framebufferToRGBA(fb, makeEgaPalette());
  writeFileSync(resolve(OUT_DIR, name), encodePNG(rgba, fb.width, fb.height));
}

describe.skipIf(!existsSync(DAX_PATH))('NWN 8X8D.DAX block 202 — frame-tile calibration dump', () => {
  it('renders each tile labeled + a scaled grid for visual inspection', () => {
    const bytes = new Uint8Array(readFileSync(DAX_PATH));
    const archive = decodeDax(bytes, '8X8D.DAX');
    const block202 = archive.blocks.find((b) => b.blockId === 202);
    expect(block202?.frames?.length).toBe(40);
    const tiles = block202!.frames!;

    // 8x per-row grid, each cell 8px tile + 1px black gutter, scaled 6x, with the row/col index
    // baked in only by position (labels are documented in the accompanying text output — a real
    // font-overlay label would need loadCokFont wired first, which is a separate follow-up item).
    const COLS = 8;
    const ROWS = Math.ceil(tiles.length / COLS);
    const CELL = 8;
    const GUTTER = 2;
    const SCALE = 8;
    const cellStride = CELL + GUTTER;
    const gridFb = createFramebuffer(COLS * cellStride * SCALE, ROWS * cellStride * SCALE, 5); // gray gutter bg
    tiles.forEach((tile, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const ox = col * cellStride * SCALE;
      const oy = row * cellStride * SCALE;
      for (let y = 0; y < CELL; y++)
        for (let x = 0; x < CELL; x++) {
          const idx = tile.indices[y * CELL + x]!;
          const color = idx === tile.transparentIndex ? 13 : idx; // magenta for transparent, matches EGA convention
          for (let sy = 0; sy < SCALE; sy++)
            for (let sx = 0; sx < SCALE; sx++) {
              gridFb.indices[(oy + y * SCALE + sy) * gridFb.width + (ox + x * SCALE + sx)] = color;
            }
        }
    });
    writePng('block202_grid_labeled.png', gridFb);

    // Print the (row,col)->index map to stdout so it's easy to cross-reference against the PNG
    // while eyeballing it (row-major, same order the grid above uses).
    // eslint-disable-next-line no-console
    console.log(
      `NWN 8X8D.DAX block 202: ${tiles.length} tiles, ${COLS} per row -> index i is at grid (row ${Math.floor(0 / COLS)}, col 0) etc. Grid is strictly row-major i = row*${COLS}+col.`,
    );

    expect(existsSync(resolve(OUT_DIR, 'block202_grid_labeled.png'))).toBe(true);
  });

  it('renders a high-zoom close-up strip for fine detail inspection', () => {
    const bytes = new Uint8Array(readFileSync(DAX_PATH));
    const archive = decodeDax(bytes, '8X8D.DAX');
    const block202 = archive.blocks.find((b) => b.blockId === 202);
    const tiles = block202!.frames!;

    // 4 tiles per row at high zoom so subtle shading/glyph differences (e.g. between the
    // "plain gray" cluster) are actually visible, unlike the 8-per-row overview above.
    const COLS = 4;
    const ROWS = Math.ceil(tiles.length / COLS);
    const CELL = 8;
    const GUTTER = 2;
    const SCALE = 16;
    const cellStride = CELL + GUTTER;
    const gridFb = createFramebuffer(COLS * cellStride * SCALE, ROWS * cellStride * SCALE, 5);
    tiles.forEach((tile, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const ox = col * cellStride * SCALE;
      const oy = row * cellStride * SCALE;
      for (let y = 0; y < CELL; y++)
        for (let x = 0; x < CELL; x++) {
          const idx = tile.indices[y * CELL + x]!;
          const color = idx === tile.transparentIndex ? 13 : idx;
          for (let sy = 0; sy < SCALE; sy++)
            for (let sx = 0; sx < SCALE; sx++) {
              gridFb.indices[(oy + y * SCALE + sy) * gridFb.width + (ox + x * SCALE + sx)] = color;
            }
        }
    });
    writePng('block202_grid_zoom.png', gridFb);
    expect(existsSync(resolve(OUT_DIR, 'block202_grid_zoom.png'))).toBe(true);
  });

  it('renders an even-higher-zoom close-up of tiles 20-39 only (candidate frame/moon tiles)', () => {
    const bytes = new Uint8Array(readFileSync(DAX_PATH));
    const archive = decodeDax(bytes, '8X8D.DAX');
    const block202 = archive.blocks.find((b) => b.blockId === 202);
    const allTiles = block202!.frames!;
    const tiles = allTiles.slice(20, 40); // skip the arrow(0-3)/gauge(4-19) clusters, already identified

    const COLS = 4;
    const ROWS = Math.ceil(tiles.length / COLS);
    const CELL = 8;
    const GUTTER = 2;
    const SCALE = 28;
    const cellStride = CELL + GUTTER;
    const gridFb = createFramebuffer(COLS * cellStride * SCALE, ROWS * cellStride * SCALE, 5);
    tiles.forEach((tile, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const ox = col * cellStride * SCALE;
      const oy = row * cellStride * SCALE;
      for (let y = 0; y < CELL; y++)
        for (let x = 0; x < CELL; x++) {
          const idx = tile.indices[y * CELL + x]!;
          const color = idx === tile.transparentIndex ? 13 : idx;
          for (let sy = 0; sy < SCALE; sy++)
            for (let sx = 0; sx < SCALE; sx++) {
              gridFb.indices[(oy + y * SCALE + sy) * gridFb.width + (ox + x * SCALE + sx)] = color;
            }
        }
    });
    writePng('block202_grid_20to39.png', gridFb);
    expect(existsSync(resolve(OUT_DIR, 'block202_grid_20to39.png'))).toBe(true);
  });

  it('composes a full candidate exploration screen with NWN_FRAME_LAYOUT for visual review', () => {
    const bytes = new Uint8Array(readFileSync(DAX_PATH));
    const archive = decodeDax(bytes, '8X8D.DAX');
    const block202 = archive.blocks.find((b) => b.blockId === 202);
    const frameTiles = block202!.frames!;
    const font = loadCokFont(bytes); // block 201 — same archive, already confirmed to decode (follow-up item 3)

    const viewport = createFramebuffer(168, 168, 0);
    fillRectIndexed(viewport, 0, 84, 168, 84, 8);

    const fb = composeExploreScreen({
      frameTiles,
      frameLayout: NWN_FRAME_LAYOUT,
      font,
      viewport,
      party: [
        { name: 'Aleena', ac: 4, hp: 32, active: true },
        { name: 'Roag', ac: 6, hp: 24 },
      ],
      position: '14,4 EAST 06:30',
      message: 'You are in Neverwinter.\nCrossergate Gems and Jewelry Store.',
      prompt: 'EXPLORE: MOVE OR (S)EARCH',
    });
    writePng('nwn-explore-candidate.png', fb);
    expect(existsSync(resolve(OUT_DIR, 'nwn-explore-candidate.png'))).toBe(true);
  });
});
