/**
 * DAA golden-file parity test (Amiga 32-color planar).
 *
 * For each fixture (test/fixtures/daa/*.json — produced by make-fixtures.py from
 * tools/daa_decode.py), run the TS decodeDaa on the SAME source .DAA file, find
 * the same blockId, and assert EXACT equality of width, height, the palette-index
 * array, AND the palette-mapped RGBA against the Python decoder's RGB output.
 *
 * Fixtures and game data are git-ignored; absent fixture or source => SKIP.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { decodeDaa, decodeDaaComStrip, isDaaComStrip } from '../src/loaders/daa.js';
import { readDaxDataBlocks } from '../src/loaders/dax.js';
import { indexedToRGBA } from '../src/render/rgba.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'daa');
const REPO_ROOT = resolve(__dirname, '..', '..', '..'); // packages/engine/test/../../.. = repo root

interface Fixture {
  file: string;
  stem: string;
  blockId: number;
  width: number;
  height: number;
  palette: [number, number, number][];
  indices: number[];
  rgb: number[];
}

function listFixtures(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));
}

const fixtures = listFixtures();

describe('DAA golden parity (TS decodeDaa vs Python daa_decode)', () => {
  if (fixtures.length === 0) {
    it.skip('no fixtures present — run `python test/make-fixtures.py` (needs game data)', () => {
      /* skipped */
    });
    return;
  }

  for (const fname of fixtures) {
    const fixture = JSON.parse(
      readFileSync(join(FIXTURE_DIR, fname), 'utf8'),
    ) as Fixture;
    const srcPath = join(REPO_ROOT, fixture.file);
    const label = `${fixture.stem} block ${fixture.blockId} (${fixture.width}x${fixture.height})`;

    if (!existsSync(srcPath)) {
      it.skip(`${label} — source DAA missing: ${fixture.file}`, () => {
        /* skipped */
      });
      continue;
    }

    it(`${label} matches the Python decode exactly`, () => {
      const bytes = new Uint8Array(readFileSync(srcPath));
      const archive = decodeDaa(bytes, fixture.stem);
      const image = archive.frameSet.frames.get(fixture.blockId);

      expect(image, `block ${fixture.blockId} should decode`).toBeDefined();
      if (!image) return;

      expect(image.width).toBe(fixture.width);
      expect(image.height).toBe(fixture.height);
      expect(image.indices.length).toBe(fixture.width * fixture.height);

      // Exact palette-index parity.
      expect(Array.from(image.indices)).toEqual(fixture.indices);

      // Exact RGB parity against the Python frame (alpha 255 everywhere; opaque).
      const rgba = indexedToRGBA(image);
      const px = fixture.width * fixture.height;
      let mismatch = -1;
      for (let p = 0; p < px; p++) {
        const o = p * 4;
        if (
          rgba[o] !== fixture.rgb[p * 3] ||
          rgba[o + 1] !== fixture.rgb[p * 3 + 1] ||
          rgba[o + 2] !== fixture.rgb[p * 3 + 2] ||
          rgba[o + 3] !== 255
        ) {
          mismatch = p;
          break;
        }
      }
      expect(mismatch, `RGBA mismatch at pixel ${mismatch}`).toBe(-1);
    });
  }
});

/**
 * The 6-byte sub-frame index variant (SPRIT, PIC, HEAD families) is now SOLVED
 * end-to-end, including pixels (2026-06-25 Amiga-executable disassembly; see
 * docs/daa-format.md §1b, docs/engine/research/subframe-format.md §3, and the
 * reference decoder tools/subframe_decode.py — `rle_amiga_sprite` /
 * `decode_amiga_subframe`, ported here as `rleAmigaSprite` / `decodeAmigaSubEntry`).
 *
 * The synthetic tests below are a byte-exact known-answer check (no game data
 * needed): a hand-built 6-byte-index DAA whose sub-entry bodies use the INNER
 * Amiga sprite RLE (distinct from the outer container's `signedByteRLE`) encoded
 * as one literal op per segment — mirroring how the real files' segments never
 * have an RLE op straddle a header/frame boundary (required for the segmented
 * decode to be well-defined at all: an op that crosses a boundary would have its
 * tail silently discarded).
 */
describe('DAA 6-byte sub-frame index — SOLVED (header + pixels)', () => {
  const PALETTE_ENTRIES = 32;

  /** Literal-encode a payload as ONE Amiga-sprite-RLE op (`c = len-1`, then the bytes). */
  function literalOp(bytes: number[]): number[] {
    if (bytes.length === 0 || bytes.length > 128) {
      throw new Error('literalOp: 1..128 bytes per op (this RLE variant caps literal runs at 128)');
    }
    return [bytes.length - 1, ...bytes];
  }

  /** The 75-byte fixed header segment: pixOff=75 (no extra per-frame table), 8×8 canvas. */
  function buildHeader(numDist: number): number[] {
    const bytes: number[] = [
      75, // pixOff (header offset 0)
      0x00, 0x08, // height = 8, BE u16 (offset 1)
      0x00, 0x01, // widthDiv8 = 1 -> width 8, BE u16 (offset 3)
      0x00, 0x00, // x, BE u16 (offset 5)
      0x00, 0x00, // y, BE u16 (offset 7)
      0x00, // flag (offset 9, unused)
      numDist, // numDist (offset 10 — NOT 9)
    ];
    for (let c = 0; c < PALETTE_ENTRIES; c++) bytes.push(0x00, c); // BE u16 word == c
    expect(bytes.length).toBe(75); // guard the fixture itself, not the decoder
    return bytes;
  }

  /** A uniform 8×8 frame where every pixel is the same 5-bit palette index. */
  function buildUniformFrame(index: number): number[] {
    const bytes: number[] = [];
    for (let p = 0; p < 5; p++) {
      const bit = (index >> p) & 1;
      for (let y = 0; y < 8; y++) bytes.push(bit ? 0xff : 0x00, 0x00); // rowBytes=2, word-aligned
    }
    return bytes; // 5 planes * 2 bytes/row * 8 rows = 80 bytes
  }

  /** An 8×8 frame where every pixel in row y has index y (0..7) — varies per row. */
  function buildRowIndexFrame(): number[] {
    const bytes: number[] = [];
    for (let p = 0; p < 5; p++) {
      for (let y = 0; y < 8; y++) {
        const bit = (y >> p) & 1;
        bytes.push(bit ? 0xff : 0x00, 0x00);
      }
    }
    return bytes;
  }

  /** Expected RGB for palette index c under `buildHeader`'s `word == c` convention. */
  function expectedRgb(c: number): { r: number; g: number; b: number } {
    return { r: 0, g: ((c >> 4) & 0xf) * 17, b: (c & 0xf) * 17 };
  }

  function push32BE(arr: number[], v: number): void {
    arr.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  }

  function buildIndexDaa(): { bytes: Uint8Array; entryA: number[]; entryB: number[]; entryC: number[] } {
    // Entry A (blockId 1): 1 stored frame, per-row-varying pixel index (exercises the planar
    // decode precisely). Entry B (blockId 8): 2 stored frames, each uniform (exercises the
    // multi-frame array + "frame 0 -> frameSet" rule). Entry C (blockId 99): a deliberately
    // truncated body (not enough bytes for even the header) — must fail to decode WITHOUT
    // taking down the other two entries.
    const entryA = [...literalOp(buildHeader(1)), ...literalOp(buildRowIndexFrame())];
    const entryB = [
      ...literalOp(buildHeader(2)),
      ...literalOp(buildUniformFrame(3)),
      ...literalOp(buildUniformFrame(20)),
    ];
    const entryC = literalOp([0xaa, 0xbb, 0xcc]); // 3 decompressed bytes, nowhere near 75

    const n = 3;
    const dataBase = 2 + n * 6; // = 20
    const toc: number[] = [];
    toc.push(1, 0x00);
    push32BE(toc, 0);
    toc.push(8, 0x00);
    push32BE(toc, entryA.length);
    toc.push(99, 0x00);
    push32BE(toc, entryA.length + entryB.length);
    const bytes = Uint8Array.from([
      (dataBase >> 8) & 0xff,
      dataBase & 0xff,
      ...toc,
      ...entryA,
      ...entryB,
      ...entryC,
    ]);
    return { bytes, entryA, entryB, entryC };
  }

  it('decodes every stored frame with byte-exact pixels + palette', () => {
    const { bytes } = buildIndexDaa();
    const arc = decodeDaa(bytes, 'SYNTH.DAA');
    expect(arc.kind).toBe('index');
    expect(arc.blocks).toHaveLength(0);
    expect(arc.subFrames).toHaveLength(3);

    const [a, b, c] = arc.subFrames;

    // Entry A: single frame, per-row varying index.
    expect(a.index).toBe(0);
    expect(a.blockId).toBe(1);
    expect(a.subOffset).toBe(0);
    expect(a.pixOff).toBe(75);
    expect(a.height).toBe(8);
    expect(a.widthDiv8).toBe(1);
    expect(a.width).toBe(8);
    expect(a.numDist).toBe(1);
    expect(a.frames).toHaveLength(1);
    const imgA = a.frames[0];
    expect(imgA.width).toBe(8);
    expect(imgA.height).toBe(8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        expect(imgA.indices[y * 8 + x], `pixel (${x},${y})`).toBe(y);
      }
    }
    // Palette round-trips through the shared 12-bit Amiga decode (see readPalette).
    expect(imgA.palette?.colors[5]).toEqual(expectedRgb(5));
    expect(imgA.palette?.colors[20]).toEqual(expectedRgb(20));

    // Entry B: two stored frames, each uniform.
    expect(b.index).toBe(1);
    expect(b.blockId).toBe(8);
    expect(b.numDist).toBe(2);
    expect(b.frames).toHaveLength(2);
    expect(Array.from(new Set(b.frames[0].indices))).toEqual([3]);
    expect(Array.from(new Set(b.frames[1].indices))).toEqual([20]);

    // Entry C: truncated body decodes to zero frames, not a thrown error.
    expect(c.index).toBe(2);
    expect(c.blockId).toBe(99);
    expect(c.frames).toHaveLength(0);

    // frameSet gets each entry's first stored frame as its generic preview.
    expect(arc.frameSet.frames.size).toBe(2); // A + B; C contributed nothing
    expect(arc.frameSet.frames.get(1)).toBe(imgA);
    expect(arc.frameSet.frames.get(8)).toBe(b.frames[0]); // the index-3 frame, NOT index-20
    expect(arc.frameSet.frames.has(99)).toBe(false);
  });

  // --- Real fixtures, cross-checked against `python tools/subframe_decode.py --amiga --list` ---

  const cokDisk2 = (f: string) =>
    resolve(REPO_ROOT, 'amiga_extracted', 'ChampionsOfKrynn', 'disk2', f);
  const dokDisk2 = (f: string) =>
    resolve(REPO_ROOT, 'amiga_extracted', 'DeathKnightsOfKrynn', 'disk2', f);

  const sprit = cokDisk2('SPRIT1.DAA');
  it.skipIf(!existsSync(sprit))(
    'real CoK SPRIT1.DAA: 17 entries, all 88x88 with 3 stored frames (Python oracle)',
    () => {
      const arc = decodeDaa(new Uint8Array(readFileSync(sprit)), 'SPRIT1.DAA');
      expect(arc.kind).toBe('index');
      expect(arc.subFrames).toHaveLength(17);
      expect(arc.frameSet.frames.size).toBe(17); // every entry decoded (Python: 0 failures)
      for (const sf of arc.subFrames) {
        expect(sf.height, `block ${sf.blockId} height`).toBe(88);
        expect(sf.widthDiv8, `block ${sf.blockId} widthDiv8`).toBe(11);
        expect(sf.width, `block ${sf.blockId} width`).toBe(88);
        expect(sf.numDist, `block ${sf.blockId} numDist`).toBe(3); // Python: nFrames=3 for all 17
        expect(sf.frames).toHaveLength(3);
        for (const img of sf.frames) {
          expect(img.width).toBe(88);
          expect(img.height).toBe(88);
          expect(img.indices.length).toBe(88 * 88);
          // Non-trivial: a real sprite is not a flat fill.
          expect(new Set(img.indices).size, `block ${sf.blockId} pixel variety`).toBeGreaterThan(1);
        }
      }
    },
  );

  const pic1 = cokDisk2('pic1.daa');
  // blockId -> numDist, captured verbatim from `python tools/subframe_decode.py --amiga
  // amiga_extracted/ChampionsOfKrynn/disk2/pic1.daa --list` (27 entries, all 88x88).
  const PIC1_EXPECTED_NUM_DIST: Record<number, number> = {
    57: 1, 14: 5, 5: 1, 6: 4, 2: 1, 58: 1, 34: 1, 18: 1, 59: 4, 60: 1,
    1: 1, 8: 1, 15: 1, 35: 1, 44: 1, 48: 1, 51: 1, 54: 1, 67: 1, 41: 1,
    61: 1, 62: 1, 63: 1, 23: 6, 30: 4, 19: 3, 12: 4,
  };
  it.skipIf(!existsSync(pic1))(
    'real CoK pic1.daa: 27 entries, all 88x88, per-id stored-frame counts match the Python oracle',
    () => {
      const arc = decodeDaa(new Uint8Array(readFileSync(pic1)), 'pic1.daa');
      expect(arc.kind).toBe('index');
      expect(arc.subFrames).toHaveLength(27);
      expect(Object.keys(PIC1_EXPECTED_NUM_DIST)).toHaveLength(27);
      expect(arc.frameSet.frames.size).toBe(27); // every entry decoded (Python: 0 failures)
      for (const sf of arc.subFrames) {
        expect(sf.width, `block ${sf.blockId} width`).toBe(88);
        expect(sf.height, `block ${sf.blockId} height`).toBe(88);
        const expected = PIC1_EXPECTED_NUM_DIST[sf.blockId];
        expect(expected, `block ${sf.blockId} is in the oracle table`).toBeDefined();
        expect(sf.numDist, `block ${sf.blockId} numDist`).toBe(expected);
        expect(sf.frames, `block ${sf.blockId} frames`).toHaveLength(expected);
      }
    },
  );

  // ------------------------------------------------------------------------
  // Routing regression: the formerly "mis-routed ~11 files" (comspr/COMSPR,
  // CPIC*, HEAD* — word0 divisible by BOTH 9 and 6) are ordinary 9-byte-TOC
  // standard-frame containers. The chain validation in parseContainer must
  // route them to kind 'blocks' and every block must decode to an image.
  // Cross-validated 2026-07-18 against the DOS DAX renders of the same block
  // ids (Amiga HEAD1.DAA 68/69 88x40 == DOS HEAD2.DAX 68/69 scene-for-scene;
  // comspr/CPIC sprites render the same subjects in richer Amiga colours).
  // See docs/daa-format.md §1b.
  // ------------------------------------------------------------------------
  const cokDisk1 = (f: string) =>
    resolve(REPO_ROOT, 'amiga_extracted', 'ChampionsOfKrynn', 'disk1', f);
  const dokDisk1 = (f: string) =>
    resolve(REPO_ROOT, 'amiga_extracted', 'DeathKnightsOfKrynn', 'disk1', f);

  const AMBIGUOUS_BLOCK_FILES: Array<{
    path: string;
    label: string;
    blockCount: number;
  }> = [
    { path: cokDisk1('comspr.daa'), label: 'CoK comspr.daa', blockCount: 32 },
    { path: cokDisk2('CPIC1.DAA'), label: 'CoK CPIC1.DAA', blockCount: 62 },
    { path: cokDisk2('HEAD1.DAA'), label: 'CoK HEAD1.DAA', blockCount: 2 },
    { path: dokDisk1('COMSPR.DAA'), label: 'DoK COMSPR.DAA', blockCount: 44 },
    { path: dokDisk1('CPIC1.daa'), label: 'DoK CPIC1.daa', blockCount: 106 },
  ];

  describe('9/6-ambiguous files route to the 9-byte blocks path (comspr/CPIC/HEAD)', () => {
    for (const { path, label, blockCount } of AMBIGUOUS_BLOCK_FILES) {
      it.skipIf(!existsSync(path))(
        `${label}: kind 'blocks', ${blockCount} blocks, every block decodes`,
        () => {
          const arc = decodeDaa(new Uint8Array(readFileSync(path)), label);
          expect(arc.kind).toBe('blocks');
          expect(arc.subFrames).toHaveLength(0);
          expect(arc.blocks).toHaveLength(blockCount);
          for (const blk of arc.blocks) {
            expect(blk.image, `block ${blk.blockId} decodes to an image`).not.toBeNull();
          }
        },
      );
    }

    const head1 = cokDisk2('HEAD1.DAA');
    it.skipIf(!existsSync(head1))(
      'CoK HEAD1.DAA carries the same block ids + dimensions as DOS HEAD2.DAX (68/69, 88x40)',
      () => {
        const arc = decodeDaa(new Uint8Array(readFileSync(head1)), 'HEAD1.DAA');
        expect(arc.blocks.map((b) => b.blockId)).toEqual([68, 69]);
        for (const blk of arc.blocks) {
          expect(blk.image?.width).toBe(88);
          expect(blk.image?.height).toBe(40);
        }
      },
    );
  });

  // Optional DoK cross-check (per CLAUDE.md, CoK is the primary target; DoK is a bonus signal
  // that the header offset-10 fix + segmented-RLE algorithm generalize across games).
  const dokSprit = dokDisk2('SPRIT1.DAA');
  it.skipIf(!existsSync(dokSprit))(
    'real DoK SPRIT1.DAA: every entry decodes to a plausible 88x88 sprite array',
    () => {
      const arc = decodeDaa(new Uint8Array(readFileSync(dokSprit)), 'SPRIT1.DAA');
      expect(arc.kind).toBe('index');
      expect(arc.subFrames.length).toBeGreaterThan(0);
      for (const sf of arc.subFrames) {
        expect(sf.width).toBe(88);
        expect(sf.height).toBe(88);
        expect(sf.numDist).toBeGreaterThanOrEqual(1);
        expect(sf.numDist).toBeLessThanOrEqual(6);
        expect(sf.frames).toHaveLength(sf.numDist);
      }
    },
  );
});

/**
 * Amiga 24×24 `*COM` combat backdrops (DUNGCOM / WILDCOM / RANDCOM) — the last unsolved
 * Krynn graphics blocks, SOLVED 2026-08-22.
 *
 * The DOS `.DAX` twin is the oracle: it ships the same sets as N × 288-byte chunky 4bpp items
 * after a 17-byte header. If the Amiga strip layout is right, the Amiga 5-bit index map must
 * *determine* the DOS 4-bit one — the Amiga art has more colours, so it refines DOS rather than
 * equalling it, and the honest metric is `1 - H(DOS|Amiga)/H(DOS)`, which is 1.0 for an exact
 * refinement and ~0 for unrelated pictures.
 *
 * The nulls matter here: every earlier attempt at this format reported a structural score with
 * no null (or a null that beat the real data), so this test pins the real number AND the
 * item-permuted null it has to beat.
 */
describe('Amiga *COM 24×24 combat-backdrop strips vs the DOS DAX oracle', () => {
  const cases = [
    { name: 'CoK DUNGCOM', dax: 'Champions of Krynn/DUNGCOM.DAX', daa: 'amiga_extracted/ChampionsOfKrynn/disk1/DUNGCOM.DAA', count: 25, refineAtLeast: 0.999 },
    { name: 'DoK DUNGCOM', dax: 'Death Knights of Krynn/DUNGCOM.DAX', daa: 'amiga_extracted/DeathKnightsOfKrynn/disk1/DUNGCOM.daa', count: 25, refineAtLeast: 0.999 },
    { name: 'CoK WILDCOM', dax: 'Champions of Krynn/WILDCOM.DAX', daa: 'amiga_extracted/ChampionsOfKrynn/disk1/WILDCOM.DAA', count: 35, refineAtLeast: 0.9 },
    { name: 'CoK RANDCOM', dax: 'Champions of Krynn/RANDCOM.DAX', daa: 'amiga_extracted/ChampionsOfKrynn/disk1/RANDCOM.DAA', count: 6, refineAtLeast: 0.85 },
  ];

  /** DOS side: 17-byte header, then `count` × 288-byte chunky 4bpp 24×24 items. */
  function dosItems(raw: Uint8Array, count: number): Uint8Array[] {
    const out: Uint8Array[] = [];
    for (let k = 0; k < count; k++) {
      const it = raw.subarray(17 + 288 * k, 17 + 288 * (k + 1));
      const px = new Uint8Array(24 * 24);
      for (let y = 0; y < 24; y++) {
        for (let xb = 0; xb < 12; xb++) {
          const b = it[y * 12 + xb]!;
          px[y * 24 + xb * 2] = b >> 4;
          px[y * 24 + xb * 2 + 1] = b & 15;
        }
      }
      out.push(px);
    }
    return out;
  }

  /** 1 - H(DOS|Amiga)/H(DOS): 1.0 iff the Amiga index exactly determines the DOS index. */
  function refinement(dos: Uint8Array[], ami: Uint8Array[]): number {
    const n = dos.length * 24 * 24;
    const hd = new Map<number, number>();
    const ha = new Map<number, number>();
    const hj = new Map<number, number>();
    const bump = (m: Map<number, number>, k: number) => m.set(k, (m.get(k) ?? 0) + 1);
    for (let i = 0; i < dos.length; i++) {
      for (let j = 0; j < 24 * 24; j++) {
        const d = dos[i]![j]!;
        const a = ami[i]![j]!;
        bump(hd, d);
        bump(ha, a);
        bump(hj, a * 64 + d);
      }
    }
    const H = (m: Map<number, number>) =>
      [...m.values()].reduce((s, c) => s - (c / n) * Math.log(c / n), 0);
    return 1 - (H(hj) - H(ha)) / H(hd);
  }

  for (const c of cases) {
    const daxPath = resolve(REPO_ROOT, c.dax);
    const daaPath = resolve(REPO_ROOT, c.daa);
    const have = existsSync(daxPath) && existsSync(daaPath);

    it.skipIf(!have)(`${c.name}: the Amiga strip refines the DOS render, and beats its null`, () => {
      const daaRaw = decodeDaa(new Uint8Array(readFileSync(daaPath)), c.name).blocks[0]!.raw;
      const geo = isDaaComStrip(daaRaw);
      expect(geo, 'block must be recognised as a *COM strip').toBe(true);

      const items = decodeDaaComStrip(daaRaw);
      expect(items.length).toBe(c.count);
      expect(items[0]!.width).toBe(24);
      expect(items[0]!.height).toBe(24);
      expect(items[0]!.palette!.count).toBe(32);
      expect(items[0]!.palette!.source).toBe('amiga-12bit');

      const dosRaw = readDaxDataBlocks(new Uint8Array(readFileSync(daxPath)))[0]!.raw;
      // The item count is published by BOTH platforms at the same header byte.
      expect(dosRaw[8]).toBe(c.count);
      expect(dosRaw.length).toBe(17 + 288 * c.count);

      const dos = dosItems(dosRaw, c.count);
      const ami = items.map((i) => i.indices);
      const real = refinement(dos, ami);

      // NULL: the same metric with the Amiga items permuted. A layout that merely produced
      // "image-shaped" output would score the same either way.
      let worstNull = 0;
      for (const shift of [1, 2, 3]) {
        const rotated = ami.map((_, i) => ami[(i + shift) % ami.length]!);
        worstNull = Math.max(worstNull, refinement(dos, rotated));
      }

      expect(real).toBeGreaterThanOrEqual(c.refineAtLeast);
      expect(real).toBeGreaterThan(worstNull + 0.25);
    });
  }

  it('rejects a block whose trailing byte count is not the *COM 2-byte trailer', () => {
    // Positive control for the guard: a well-formed header whose body is one byte short must
    // NOT be accepted, or `isDaaComStrip` would be a rubber stamp.
    const count = 4;
    const rowBytes = Math.ceil((count * 24) / 16) * 2;
    const good = new Uint8Array(73 + 5 * rowBytes * 24 + 2);
    const dv = new DataView(good.buffer);
    dv.setUint16(0, 24, false);
    dv.setUint16(2, 3, false);
    good[8] = count;
    expect(isDaaComStrip(good)).toBe(true);
    expect(decodeDaaComStrip(good).length).toBe(count);
    expect(isDaaComStrip(good.subarray(0, good.length - 1))).toBe(false);
    expect(decodeDaaComStrip(good.subarray(0, good.length - 1))).toEqual([]);
  });
});

/**
 * Bank-swap parity — the precondition for letting the live graphics toggle reach combat backdrops.
 *
 * The DOS geometry drives the Amiga art unchanged: a tile index picked by the DOS-derived encounter
 * terrain is looked up in whichever bank is mounted. So a bank is only safe to substitute if the
 * Amiga side holds at least as many items, in the same order. `apps/web/src/ui/gameData.ts` declares
 * `amigaDungcomPath` on exactly the pairs this test admits.
 */
describe('Amiga *COM bank-swap parity against the DOS bank', () => {
  const pairs = [
    { name: 'CoK DUNGCOM', dax: 'Champions of Krynn/DUNGCOM.DAX', daa: 'amiga_extracted/ChampionsOfKrynn/disk1/DUNGCOM.DAA', dos: 25, amiga: 25 },
    { name: 'DoK DUNGCOM', dax: 'Death Knights of Krynn/DUNGCOM.DAX', daa: 'amiga_extracted/DeathKnightsOfKrynn/disk1/DUNGCOM.daa', dos: 25, amiga: 25 },
    { name: 'CoK WILDCOM', dax: 'Champions of Krynn/WILDCOM.DAX', daa: 'amiga_extracted/ChampionsOfKrynn/disk1/WILDCOM.DAA', dos: 35, amiga: 35 },
    { name: 'CoK RANDCOM', dax: 'Champions of Krynn/RANDCOM.DAX', daa: 'amiga_extracted/ChampionsOfKrynn/disk1/RANDCOM.DAA', dos: 6, amiga: 6 },
    // Recorded because it is the ONE pair that does not match, and a silent mismatch is exactly what
    // this test exists to prevent: DoK's Amiga WILDCOM holds 45 items to the DOS bank's 38. Indices
    // 0..37 still align (refinement 0.85 against a 0.13 null), and the extra 7 are simply never
    // referenced — but it is a superset, not a twin, so it is called out rather than assumed.
    { name: 'DoK WILDCOM', dax: 'Death Knights of Krynn/WILDCOM.DAX', daa: 'amiga_extracted/DeathKnightsOfKrynn/disk1/WILDCOM.daa', dos: 38, amiga: 45 },
  ];

  for (const c of pairs) {
    const daxPath = resolve(REPO_ROOT, c.dax);
    const daaPath = resolve(REPO_ROOT, c.daa);
    it.skipIf(!existsSync(daxPath) || !existsSync(daaPath))(`${c.name}: Amiga holds ≥ the DOS item count, in order`, () => {
      const daaRaw = decodeDaa(new Uint8Array(readFileSync(daaPath)), c.name).blocks[0]!.raw;
      const amigaItems = decodeDaaComStrip(daaRaw);
      expect(amigaItems.length).toBe(c.amiga);

      const daxRaw = readDaxDataBlocks(new Uint8Array(readFileSync(daxPath)))[0]!.raw;
      expect((daxRaw.length - 17) % 288).toBe(0);
      expect((daxRaw.length - 17) / 288).toBe(c.dos);

      // The safety condition itself.
      expect(amigaItems.length).toBeGreaterThanOrEqual(c.dos);
      // Every item the DOS side can index must exist on the Amiga side at the same cell size.
      for (let t = 0; t < c.dos; t++) {
        expect(amigaItems[t]!.width).toBe(24);
        expect(amigaItems[t]!.height).toBe(24);
      }
    });
  }
});
