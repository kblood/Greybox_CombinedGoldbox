/**
 * Amiga art → DQK HLIB TILE converter (E2). The planar→chunky step is the DAA decoder's; this stage
 * does the 32→256 colour relocation + HLIB TILE emit, and must be LOSSLESS:
 *
 *  1) Synthetic remap: `amigaImageToVga` shifts indices + relocates the palette slice; the out-of-range
 *     and bad-width guards fire.
 *  2) Round-trip: a synthetic 32-colour frame → HLIB TILE → decode → pixels shifted by base, colours at
 *     the new slots (methods 16 & 18).
 *  3) Real-file golden (skipped when the Amiga disk image is absent): a real `BIGPIC1.DAA` frame
 *     converts to an HLIB TILE and re-decodes byte-identical (base 0 and base 32), proving the Amiga
 *     art now flows losslessly through the DQK VGA/HLIB pipeline.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeDaa,
  decodeHlib,
  amigaImageToVga,
  amigaImageToHlibTile,
  amigaFramesToHlibTiles,
  amigaArchiveToHlibMaster,
  amigaArchiveToHlibLeaf,
  detectTransparentBackground,
  planDqkBuild,
  buildDqkGameData,
  type IndexedImage,
  type Palette,
} from '../src/index.js';

function amigaPalette(n: number): Palette {
  const colors: ({ r: number; g: number; b: number } | null)[] = new Array(256).fill(null);
  for (let i = 0; i < n; i++) colors[i] = { r: (i * 8) & 0xff, g: (i * 4) & 0xff, b: (i * 2) & 0xff };
  return { colors, source: 'amiga-12bit', firstColor: 0, count: n };
}

function synthFrame(width: number, height: number, n = 32): IndexedImage {
  const indices = new Uint8Array(width * height);
  for (let i = 0; i < indices.length; i++) indices[i] = i % n;
  return { width, height, indices, xOffset: 0, yOffset: 0, transparentIndex: null, palette: amigaPalette(n), encoding: 'daa' };
}

describe('amigaImageToVga — 32→256 colour relocation', () => {
  it('keeps the 0..31 layout at base 0', () => {
    const vga = amigaImageToVga(synthFrame(8, 4));
    expect(vga.palette.firstColor).toBe(0);
    expect(vga.palette.count).toBe(32);
    expect(vga.indices[1]).toBe(1);
    expect(vga.palette.colors[5]).toEqual({ r: 40, g: 20, b: 10 });
  });

  it('shifts indices + colours to a chosen VGA base', () => {
    const vga = amigaImageToVga(synthFrame(8, 4), 144);
    expect(vga.palette.firstColor).toBe(144);
    expect(vga.indices[1]).toBe(145); // index 1 → 144+1
    expect(vga.palette.colors[144]).toEqual({ r: 0, g: 0, b: 0 });
    expect(vga.palette.colors[149]).toEqual({ r: 40, g: 20, b: 10 }); // colour 5 → slot 149
    expect(vga.palette.colors[5]).toBeNull(); // old slots vacated
  });

  it('throws when the base shifts indices past 255', () => {
    expect(() => amigaImageToVga(synthFrame(8, 4, 32), 240)).toThrow(); // 240 + 31 = 271 > 255
  });

  it('throws on a non-multiple-of-4 width', () => {
    expect(() => amigaImageToVga(synthFrame(6, 2))).toThrow();
  });
});

describe('amigaImageToHlibTile — lossless round-trip', () => {
  for (const method of [16, 18]) {
    for (const base of [0, 64]) {
      it(`frame → TILE → decode reproduces pixels (method ${method}, base ${base})`, () => {
        const src = synthFrame(16, 5);
        const tile = amigaImageToHlibTile(src, { method, paletteBase: base });
        const arc = decodeHlib(tile, 'AMIGA');
        expect(arc.tag).toBe('TILE');
        const got = arc.images[0].image;
        expect(got.width).toBe(16);
        expect(got.height).toBe(5);
        expect(arc.images[0].drawMethod).toBe(method);
        for (let i = 0; i < src.indices.length; i++) {
          expect(got.indices[i]).toBe(src.indices[i] + base);
        }
        expect(got.palette!.colors[base + 5]).toEqual({ r: 40, g: 20, b: 10 });
      });
    }
  }

  it('amigaFramesToHlibTiles emits one TILE per non-null frame', () => {
    const tiles = amigaFramesToHlibTiles([
      { id: 7, image: synthFrame(8, 2) },
      { id: 9, image: null },
      { id: 11, image: synthFrame(12, 3) },
    ]);
    expect([...tiles.keys()].sort((a, b) => a - b)).toEqual([7, 11]);
    expect(decodeHlib(tiles.get(7)!, 'A').images).toHaveLength(1);
  });
});

describe('amigaArchiveToHlibLeaf — shared-palette leaf TILE', () => {
  const archiveOf = (...imgs: IndexedImage[]) => ({ frameSet: { frames: new Map(imgs.map((im, i) => [i, im])) } });

  it('packs every frame into one TILE with a shared palette (method 21, base 64)', () => {
    const leaf = amigaArchiveToHlibLeaf(archiveOf(synthFrame(24, 24), synthFrame(24, 24), synthFrame(8, 4)));
    const arc = decodeHlib(leaf, 'COMSPR');
    expect(arc.tag).toBe('TILE');
    expect(arc.images).toHaveLength(3);
    expect(arc.images.every((m) => m.drawMethod === 21)).toBe(true);
    expect(arc.images[0].image.palette!.firstColor).toBe(64);
    // Indices losslessly relocated by +64 (no transparent index given).
    const src = synthFrame(24, 24).indices;
    for (let i = 0; i < src.length; i++) expect(arc.images[0].image.indices[i]).toBe(src[i] + 64);
  });

  it('maps the transparent source index to the 255 key', () => {
    const leaf = amigaArchiveToHlibLeaf(archiveOf(synthFrame(8, 4)), { transparentSourceIndex: 5 });
    const got = decodeHlib(leaf, 'T').images[0].image;
    expect(got.transparentIndex).toBe(255);
    const src = synthFrame(8, 4).indices; // indices i%32
    for (let i = 0; i < src.length; i++) expect(got.indices[i]).toBe(src[i] === 5 ? 255 : src[i] + 64);
  });

  it('merges differing frame palettes (last-non-null wins)', () => {
    const a = synthFrame(8, 4); // colour 5 → {40,20,10}
    const b: IndexedImage = {
      ...synthFrame(8, 4),
      palette: { colors: amigaPalette(32).colors.map((c, i) => (i === 5 ? { r: 99, g: 99, b: 99 } : c)), source: 'amiga-12bit', firstColor: 0, count: 32 },
    };
    const arc = decodeHlib(amigaArchiveToHlibLeaf(archiveOf(a, b)), 'M');
    // Both frames share one table; slot 64+5 resolves to the LAST frame's colour (b's {99,99,99}).
    expect(arc.images[0].image.palette!.colors[69]).toEqual({ r: 99, g: 99, b: 99 });
  });

  it('throws on an empty archive', () => {
    expect(() => amigaArchiveToHlibLeaf({ frameSet: { frames: new Map() } })).toThrow(/no solved frames/);
  });
});

describe('detectTransparentBackground — dominant border index', () => {
  /** A frame with a solid border of `bg` and a different interior. */
  const bordered = (bg: number, inner: number, w = 8, h = 8): IndexedImage => {
    const indices = new Uint8Array(w * h).fill(inner);
    for (let x = 0; x < w; x++) { indices[x] = bg; indices[(h - 1) * w + x] = bg; }
    for (let y = 0; y < h; y++) { indices[y * w] = bg; indices[y * w + (w - 1)] = bg; }
    return { width: w, height: h, indices, xOffset: 0, yOffset: 0, transparentIndex: null, palette: amigaPalette(32), encoding: 'daa' };
  };
  it('reads the background colour off the frame borders across the sheet', () => {
    const archive = { frameSet: { frames: new Map([[0, bordered(16, 3)], [1, bordered(16, 7)]]) } };
    expect(detectTransparentBackground(archive)).toBe(16);
  });
  it('returns 0 for an empty archive', () => {
    expect(detectTransparentBackground({ frameSet: { frames: new Map() } })).toBe(0);
  });
});

// --- Real-file golden (skip when the Amiga disk image is absent) --------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const bigpicPath = resolve(repoRoot, 'amiga_extracted', 'ChampionsOfKrynn', 'disk2', 'BIGPIC1.DAA');

describe('amigaImageToHlibTile — real BIGPIC1.DAA art', () => {
  it.skipIf(!existsSync(bigpicPath))('converts a real Amiga frame to HLIB TILE losslessly (base 0 & 32)', () => {
    const arc = decodeDaa(new Uint8Array(readFileSync(bigpicPath)), 'BIGPIC1.DAA');
    const block = arc.blocks.find((b) => b.image && b.image.width % 4 === 0);
    expect(block, 'BIGPIC1.DAA must have a renderable frame').toBeDefined();
    const src = block!.image!;

    for (const method of [16, 18]) {
      for (const base of [0, 32]) {
        const tile = amigaImageToHlibTile(src, { method, paletteBase: base });
        const re = decodeHlib(tile, 'BIGPIC-RE');
        const got = re.images[0].image;
        expect(got.width).toBe(src.width);
        expect(got.height).toBe(src.height);
        // Pixels reproduce (shifted by base).
        for (let i = 0; i < src.indices.length; i++) {
          if (got.indices[i] !== src.indices[i] + base) {
            throw new Error(`pixel ${i} mismatch (method ${method}, base ${base}): ${got.indices[i]} != ${src.indices[i] + base}`);
          }
        }
        // The Amiga colours land at their relocated slots.
        const sp = src.palette!;
        const first = sp.firstColor ?? 0;
        expect(got.palette!.colors[base]).toEqual(sp.colors[first]);
      }
    }
  });
});

// --- E5.1: whole archive → master art TLB (the BIGPIC.TLB drop-in) -------------

describe('amigaArchiveToHlibMaster — master art container', () => {
  it('packs every frame as a leaf set the master walk reads back', () => {
    const archive = {
      frameSet: {
        frames: new Map<number, IndexedImage>([
          [114, synthFrame(16, 4)],
          [121, synthFrame(20, 3)],
          [112, synthFrame(8, 2)],
        ]),
      },
    };
    const master = amigaArchiveToHlibMaster(archive, { method: 18, paletteBase: 32 });
    const re = decodeHlib(master, 'BIGPIC.TLB');
    expect(re.tag).toBe('HLIB'); // master, not a leaf TILE
    expect(re.nonImage).toBe(false);
    expect(re.images).toHaveLength(3);
    // Each set keeps its own geometry + relocated palette, in iteration order.
    expect(re.images[0].image.width).toBe(16);
    expect(re.images[1].image.width).toBe(20);
    expect(re.images[2].image.width).toBe(8);
    for (const m of re.images) {
      expect(m.drawMethod).toBe(18);
      // relocated to base 32: source colour 5 sits at slot 37.
      expect(m.image.palette!.colors[37]).toEqual({ r: 40, g: 20, b: 10 });
    }
  });

  it('throws on an archive with no solved frames', () => {
    expect(() => amigaArchiveToHlibMaster({ frameSet: { frames: new Map() } })).toThrow();
  });
});

describe('amigaArchiveToHlibMaster — real BIGPIC1.DAA → DQK BIGPIC.TLB drop-in', () => {
  it.skipIf(!existsSync(bigpicPath))('rebuilds the overland art as a master the engine reads back', () => {
    const arc = decodeDaa(new Uint8Array(readFileSync(bigpicPath)), 'BIGPIC1.DAA');
    const nFrames = arc.frameSet.frames.size;
    expect(nFrames, 'BIGPIC1.DAA has solved frames').toBeGreaterThan(0);

    const master = amigaArchiveToHlibMaster(arc, { method: 18, paletteBase: 32 });
    const re = decodeHlib(master, 'BIGPIC.TLB');
    expect(re.tag).toBe('HLIB');
    expect(re.images).toHaveLength(nFrames);

    // Every emitted set matches its source frame, pixels shifted to the DQK picture DAC slice (base 32).
    const sources = [...arc.frameSet.frames.values()];
    for (let s = 0; s < sources.length; s++) {
      const src = sources[s];
      const got = re.images[s].image;
      expect(got.width).toBe(src.width);
      expect(got.height).toBe(src.height);
      expect(re.images[s].drawMethod).toBe(18);
      for (let i = 0; i < src.indices.length; i++) {
        if (got.indices[i] !== src.indices[i] + 32) {
          throw new Error(`set ${s} pixel ${i}: ${got.indices[i]} != ${src.indices[i] + 32}`);
        }
      }
      // The frame's first Amiga colour landed at slot 32 (the BIGPIC palette base).
      const sp = src.palette!;
      expect(got.palette!.colors[32]).toEqual(sp.colors[sp.firstColor ?? 0]);
    }
  });

  it.skipIf(!existsSync(bigpicPath))('feeds planDqkBuild as a BIGPIC.TLB override (art moves to emit)', () => {
    const arc = decodeDaa(new Uint8Array(readFileSync(bigpicPath)), 'BIGPIC1.DAA');
    const master = amigaArchiveToHlibMaster(arc);
    const gameData = buildDqkGameData({ geo: new Uint8Array(4), mon: new Uint8Array(4), ecl: new Uint8Array(4) });
    const exe = new TextEncoder().encode('HDR..The Dark Queen of Krynn\0..');
    const plan = planDqkBuild({ gameData, exe, target: 'cok', overrides: { 'BIGPIC.TLB': master } });

    const emitted = plan.emit.find((f) => f.path === 'DISK2/BIGPIC.TLB');
    expect(emitted, 'BIGPIC.TLB now emitted (Amiga art), not copied').toBeDefined();
    expect(Buffer.from(emitted!.bytes).equals(Buffer.from(master))).toBe(true);
    expect(plan.copy.some((f) => f.path === 'DISK2/BIGPIC.TLB')).toBe(false);
    // It re-decodes as the same master from inside the build plan.
    expect(decodeHlib(emitted!.bytes, 'BIGPIC.TLB').images.length).toBe(arc.frameSet.frames.size);
  });
});
