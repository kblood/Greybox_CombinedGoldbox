/**
 * C64 fixed-size full-screen picture loader (`c64Picture.ts`) — port of `tools/c64_pic.py`.
 *
 * Two tiers:
 *  1. Structural / synthetic-byte tests (no external corpus needed) that pin the layout
 *     arithmetic and the per-cell hires/multicolour render rule directly, each checked against
 *     a deliberate mutation so it can be seen failing, per this project's evidence standard.
 *  2. Real-corpus golden-hash tests (`describe.skipIf` when the C64 disk images aren't present
 *     on this machine): decode the SAME three real files `tools/test_c64_pic.py` pins
 *     (Champions of Krynn PIC70, Death Knights of Krynn PIC71, Gateway to the Savage Frontier
 *     PIC7C) and assert byte-identical sha256 of the rendered RGB buffer, proving the TS port is
 *     the same renderer as the Python reference, not just a plausible independent one.
 *
 * The real-corpus tier needs a `.d64` directory/file reader. Rather than adding a new `src/`
 * loader outside this slice's file ownership, a small self-contained D64 reader (a subset of
 * `tools/c64_disk.py`: sector layout, CBM directory walk, sector-chain follow) is ported directly
 * into this test file, used only to pull real PRG bytes for the golden assertions.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
  C64_PICTURE_COLS as COLS,
  C64_PICTURE_ROWS as ROWS,
  C64_PICTURE_CELL as CELL,
  C64_PICTURE_WIDTH as WIDTH,
  C64_PICTURE_HEIGHT as HEIGHT,
  C64_PICTURE_SCREEN_LEN as SCREEN_LEN,
  C64_PICTURE_COLOUR_OFF as COLOUR_OFF,
  C64_PICTURE_GLYPH_OFF as GLYPH_OFF,
  C64_PICTURE_GLYPH_COUNT as GLYPH_COUNT,
  C64_PICTURE_GLYPH_LEN as GLYPH_LEN,
  C64_PICTURE_REG_OFF as REG_OFF,
  C64_PICTURE_BODY_LEN as BODY_LEN,
  C64_PICTURE_SIZES as SIZES,
  C64_PICTURE_RESIDENT_GLYPHS as RESIDENT_GLYPHS,
  C64_PICTURE_CHARSET_BODY as CHARSET_BODY,
  C64_PALETTE,
  makeC64Palette,
  c64PictureBody,
  isC64Picture,
  c64CharsetGlyphs,
  parseC64Picture,
  c64PictureGlyph,
  decodeC64PictureIndices,
  decodeC64Picture,
} from '../src/index.js';

// ---------------------------------------------------------------------------------------------
// Tier 1 — layout arithmetic (mirrors tools/test_c64_pic.py's LayoutTests, no corpus needed)
// ---------------------------------------------------------------------------------------------

describe('C64 picture layout constants', () => {
  it('the four regions tile the body exactly', () => {
    expect(SCREEN_LEN).toBe(COLS * ROWS);
    expect(SCREEN_LEN + SCREEN_LEN + GLYPH_LEN + 3).toBe(BODY_LEN);
    expect(BODY_LEN).toBe(2679);
    expect(SIZES).toEqual([2681, 2682]);
    expect(COLOUR_OFF).toBe(SCREEN_LEN);
    expect(GLYPH_OFF).toBe(SCREEN_LEN * 2);
    expect(REG_OFF).toBe(GLYPH_OFF + GLYPH_LEN);
    expect(WIDTH).toBe(COLS * CELL);
    expect(HEIGHT).toBe(ROWS * CELL);
  });

  it('the shipped and resident glyphs add up to a full 256-code character set', () => {
    expect(GLYPH_COUNT + RESIDENT_GLYPHS).toBe(256);
    expect(GLYPH_LEN + CHARSET_BODY).toBe(2048);
  });

  it('a wrongly sized file is rejected rather than decoded', () => {
    // Mutation check: BODY_LEN+2 (2681) is the one length that must NOT throw — proves the
    // negative assertions below aren't vacuously true because parseC64Picture always throws.
    const valid = new Uint8Array(BODY_LEN + 2);
    expect(() => parseC64Picture(valid)).not.toThrow();
    for (const total of [2680, 2683, 2, 0]) {
      expect(() => parseC64Picture(new Uint8Array(total)), `size ${total}`).toThrow();
    }
  });

  it('isC64Picture agrees with parseC64Picture on every boundary size', () => {
    for (const total of [2679, 2680, 2681, 2682, 2683]) {
      const buf = new Uint8Array(total);
      expect(isC64Picture(buf), `size ${total}`).toBe(SIZES.includes(total));
    }
  });

  it('c64PictureBody strips exactly the 2-byte CBM load word', () => {
    const prg = new Uint8Array([0x00, 0x40, 1, 2, 3, 4]);
    expect([...c64PictureBody(prg)]).toEqual([1, 2, 3, 4]);
  });

  it('charsetGlyphs rejects a CHARSET file shorter than the 512-byte resident set', () => {
    const short = new Uint8Array(2 + CHARSET_BODY - 1);
    expect(() => c64CharsetGlyphs(short)).toThrow();
    const ok = new Uint8Array(2 + CHARSET_BODY);
    expect(() => c64CharsetGlyphs(ok)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
// Tier 1 — glyph routing and per-cell render rule, on synthetic bytes
// ---------------------------------------------------------------------------------------------

describe('C64 picture glyph routing', () => {
  function blankPrg(): Uint8Array {
    return new Uint8Array(BODY_LEN + 2); // load word 0x0000 is fine, body content is what's tested
  }

  it('codes below $40 come from the resident CHARSET, $40..$FF from the file', () => {
    const prg = blankPrg();
    const pic = parseC64Picture(prg);
    // 256 distinct byte values repeated so any 8-byte window is unique and traceable.
    const resident = new Uint8Array(512);
    for (let i = 0; i < 512; i++) resident[i] = i % 256;

    expect([...c64PictureGlyph(pic, 0x00, resident)]).toEqual([...resident.subarray(0, 8)]);
    expect([...c64PictureGlyph(pic, 0x3f, resident)]).toEqual([...resident.subarray(0x3f * 8, 0x3f * 8 + 8)]);
    expect(c64PictureGlyph(pic, 0x40, resident).length).toBe(8);
    expect(c64PictureGlyph(pic, 0xff, resident).length).toBe(8);

    // Mutation check: changing the resident bytes changes only the <$40 lookup, proving the
    // routing genuinely reads from `resident` rather than coincidentally matching zeros.
    const resident2 = resident.slice();
    resident2[0] = 0xaa;
    expect(c64PictureGlyph(pic, 0x00, resident2)[0]).toBe(0xaa);
    expect(c64PictureGlyph(pic, 0x00, resident2)[0]).not.toBe(c64PictureGlyph(pic, 0x00, resident)[0]);
  });

  it('a code >= $40 reads from the picture own glyph table, not the resident set', () => {
    const prg = blankPrg();
    // Screen code $40 -> glyph table index 0 -> body offset GLYPH_OFF.
    prg[2 + GLYPH_OFF] = 0x77;
    const pic = parseC64Picture(prg);
    const resident = new Uint8Array(512); // all zero
    expect(c64PictureGlyph(pic, 0x40, resident)[0]).toBe(0x77);
    // Mutation check: a resident-only edit must NOT affect this glyph.
    const resident2 = new Uint8Array(512).fill(0xff);
    expect(c64PictureGlyph(pic, 0x40, resident2)[0]).toBe(0x77);
  });
});

// ---------------------------------------------------------------------------------------------
// Tier 1 — the hires / multicolour render rule (VIC-II hardware behaviour), on one crafted cell
// ---------------------------------------------------------------------------------------------

describe('C64 picture per-cell hires/multicolour render rule', () => {
  /** Build a minimal one-cell picture: cell (0,0) uses screen code $40 (glyph table index 0). */
  function oneCellPrg(colourByte: number, glyphRow0: number, bg0: number, bg1: number, bg2: number): Uint8Array {
    const prg = new Uint8Array(BODY_LEN + 2);
    prg[2 + 0] = 0x40; // screen[0] = code $40 -> first glyph slot
    prg[2 + COLOUR_OFF] = colourByte;
    prg[2 + GLYPH_OFF] = glyphRow0; // glyph row 0 for code $40
    prg[2 + REG_OFF] = bg0;
    prg[2 + REG_OFF + 1] = bg1;
    prg[2 + REG_OFF + 2] = bg2;
    return prg;
  }

  it('hires mode: set bits take the colour nibble, clear bits take background 0', () => {
    // 0xAA = 10101010 -> pixels: nib, bg0, nib, bg0, nib, bg0, nib, bg0
    const prg = oneCellPrg(/* colour */ 0x05, /* glyph row0 */ 0xaa, /* bg0 */ 0x02, 0, 0);
    const resident = new Uint8Array(512);
    const pic = parseC64Picture(prg);
    const px = decodeC64PictureIndices(pic, resident);
    const row0 = px.subarray(0, 8);
    expect([...row0]).toEqual([5, 2, 5, 2, 5, 2, 5, 2]);

    // Mutation check: changing bg0 changes only the clear-bit pixels.
    const prg2 = oneCellPrg(0x05, 0xaa, 0x07, 0, 0);
    const row0b = decodeC64PictureIndices(parseC64Picture(prg2), resident).subarray(0, 8);
    expect([...row0b]).toEqual([5, 7, 5, 7, 5, 7, 5, 7]);
    expect([...row0b]).not.toEqual([...row0]);
  });

  it('multicolour mode (colour bit 3 set): 2-bit pairs -> bg0/bg1/bg2/(nib&7), each pixel doubled', () => {
    // 0x1B = 00 01 10 11 -> v = 0,1,2,3
    const prg = oneCellPrg(/* colour */ 0x0f /* bit3 set, low3 = 7 */, 0x1b, /* bg0 */ 4, /* bg1 */ 5, /* bg2 */ 6);
    const resident = new Uint8Array(512);
    const px = decodeC64PictureIndices(parseC64Picture(prg), resident);
    const row0 = px.subarray(0, 8);
    expect([...row0]).toEqual([4, 4, 5, 5, 6, 6, 7, 7]);

    // Mutation check: without the multicolour bit (bit 3 clear), the SAME glyph byte must decode
    // through the hires path instead and produce a different pattern.
    const hiresColour = 0x07; // bit3 clear, nib=7
    const prgHires = oneCellPrg(hiresColour, 0x1b, 4, 5, 6);
    const rowHires = decodeC64PictureIndices(parseC64Picture(prgHires), resident).subarray(0, 8);
    expect([...rowHires]).not.toEqual([...row0]);
  });

  it('the colour byte high nibble is dirty and ignored (blit stores it unmasked)', () => {
    // Same low nibble (0x05, hires), garbage high nibble -> identical render.
    const resident = new Uint8Array(512);
    const clean = decodeC64PictureIndices(parseC64Picture(oneCellPrg(0x05, 0xff, 1, 0, 0)), resident);
    const dirty = decodeC64PictureIndices(parseC64Picture(oneCellPrg(0xf5, 0xff, 1, 0, 0)), resident);
    expect([...dirty.subarray(0, 8)]).toEqual([...clean.subarray(0, 8)]);
    // Mutation check: this equality is not vacuous -- a genuinely different LOW nibble does
    // change the render (proves the comparison bytes are load-bearing, not both-zero noise).
    const differentLow = decodeC64PictureIndices(parseC64Picture(oneCellPrg(0x06, 0xff, 1, 0, 0)), resident);
    expect([...differentLow.subarray(0, 8)]).not.toEqual([...clean.subarray(0, 8)]);
  });

  it('background registers are masked to a nibble before use as a palette index', () => {
    // $D023 = $15 is a real observed value (Buck Rogers PIC71) -- out of nibble range but
    // harmless because VIC only reads the low nibble.
    const resident = new Uint8Array(512);
    const px = decodeC64PictureIndices(parseC64Picture(oneCellPrg(0x00, 0x00, 0x15, 0, 0)), resident);
    // glyph row 0x00 = all clear bits -> every pixel is bg0 & 0x0F = 5.
    expect([...px.subarray(0, 8)]).toEqual([5, 5, 5, 5, 5, 5, 5, 5]);
    expect(Math.max(...px)).toBeLessThan(16);
  });

  it('trailing byte: present only in 2682-byte files, absent (null) in 2681-byte files', () => {
    const prg2681 = new Uint8Array(2681);
    const prg2682 = new Uint8Array(2682);
    prg2682[2 + BODY_LEN] = 0x42;
    expect(parseC64Picture(prg2681).trailing).toBeNull();
    expect(parseC64Picture(prg2682).trailing).toBe(0x42);
  });
});

// ---------------------------------------------------------------------------------------------
// Tier 1 — palette and the whole-image decode entry point
// ---------------------------------------------------------------------------------------------

describe('C64 palette and decodeC64Picture', () => {
  it('makeC64Palette defines exactly the 16 VIC-II colours and leaves 16..255 null', () => {
    const pal = makeC64Palette();
    for (let i = 0; i < 16; i++) {
      expect(pal.colors[i], `index ${i}`).toEqual(C64_PALETTE[i]);
    }
    for (let i = 16; i < 256; i++) {
      expect(pal.colors[i], `index ${i}`).toBeNull();
    }
    // Mutation check: not every slot is trivially null -- there really are 16 defined entries.
    expect(pal.colors.filter((c) => c !== null).length).toBe(16);
  });

  it('decodeC64Picture returns a full opaque WIDTH*HEIGHT frame with in-range indices', () => {
    const prg = new Uint8Array(BODY_LEN + 2);
    const resident = new Uint8Array(512);
    const img = decodeC64Picture(prg, resident);
    expect(img.width).toBe(WIDTH);
    expect(img.height).toBe(HEIGHT);
    expect(img.indices.length).toBe(WIDTH * HEIGHT);
    expect(img.transparentIndex).toBeNull();
    expect(img.indices.reduce((m, v) => (v > m ? v : m), 0)).toBeLessThan(16);
    expect(img.palette?.colors[0]).toEqual(C64_PALETTE[0]);
  });
});

// ---------------------------------------------------------------------------------------------
// Tier 2 — real-corpus golden hashes (skipped when the C64 disk images aren't present)
// ---------------------------------------------------------------------------------------------

const C64_SETS = 'D:/Games/Emulator/C64/Goldbox';

// --- minimal D64 reader (subset of tools/c64_disk.py, ported for this test only) ---

const SECTORS_PER_TRACK: readonly number[] = [
  ...Array(17).fill(21),
  ...Array(7).fill(19),
  ...Array(6).fill(18),
  ...Array(5).fill(17),
  ...Array(5).fill(17), // tracks 36-40 (non-standard extension some images use)
];

function sectorOffset(track: number, sector: number): number {
  let base = 0;
  for (let t = 1; t < track; t++) base += SECTORS_PER_TRACK[t - 1]!;
  return (base + sector) * 256;
}

interface D64 {
  sectors: Map<string, Uint8Array>;
}

function readD64(data: Uint8Array): D64 {
  const sizeTracks: Record<number, number> = { 174848: 35, 175531: 35, 196608: 40, 197376: 40 };
  const tracks = sizeTracks[data.byteLength] ?? (data.byteLength >= 174848 ? 35 : 0);
  const sectors = new Map<string, Uint8Array>();
  for (let t = 1; t <= tracks; t++) {
    for (let s = 0; s < SECTORS_PER_TRACK[t - 1]!; s++) {
      const off = sectorOffset(t, s);
      if (off + 256 <= data.byteLength) sectors.set(`${t},${s}`, data.subarray(off, off + 256));
    }
  }
  return { sectors };
}

function petscii(raw: Uint8Array): string {
  let end = raw.indexOf(0xa0);
  if (end < 0) end = raw.length;
  let out = '';
  for (let i = 0; i < end; i++) {
    const c = raw[i]!;
    out += c >= 32 && c < 127 ? String.fromCharCode(c) : '.';
  }
  return out.replace(/\s+$/, '');
}

interface DirEntry {
  name: string;
  isPrg: boolean;
  closed: boolean;
  track: number;
  sector: number;
  blocks: number;
}

function directory(disk: D64): DirEntry[] {
  const bam = disk.sectors.get('18,0');
  if (!bam) return [];
  const entries: DirEntry[] = [];
  let t = bam[0]!;
  let s = bam[1]!;
  const seen = new Set<string>();
  while (t !== 0 && !seen.has(`${t},${s}`)) {
    seen.add(`${t},${s}`);
    const block = disk.sectors.get(`${t},${s}`);
    if (!block) break;
    for (let i = 0; i < 8; i++) {
      const slot = block.subarray(i * 32, i * 32 + 32);
      if (slot.length < 32 || slot[2] === 0) continue;
      entries.push({
        name: petscii(slot.subarray(5, 21)),
        isPrg: (slot[2]! & 7) === 2,
        closed: (slot[2]! & 0x80) !== 0,
        track: slot[3]!,
        sector: slot[4]!,
        blocks: slot[30]! | (slot[31]! << 8),
      });
    }
    t = block[0]!;
    s = block[1]!;
  }
  return entries;
}

/** Follow a file's sector chain. Returns null on any chain problem (missing sector, loop). */
function readFileChecked(disk: D64, entry: DirEntry): Uint8Array | null {
  const chunks: Uint8Array[] = [];
  let t = entry.track;
  let s = entry.sector;
  const seen = new Set<string>();
  while (t !== 0 && !seen.has(`${t},${s}`)) {
    seen.add(`${t},${s}`);
    const block = disk.sectors.get(`${t},${s}`);
    if (!block) return null;
    const nt = block[0]!;
    const ns = block[1]!;
    chunks.push(nt ? block.subarray(2, 256) : block.subarray(2, ns + 1));
    t = nt;
    s = ns;
  }
  if (t !== 0) return null; // chain loops back
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.byteLength;
  }
  return out;
}

/** Every readable closed PRG on one .d64 image, by name (later directory entries win). */
function diskFiles(path: string): Map<string, Uint8Array> {
  const disk = readD64(new Uint8Array(readFileSync(path)));
  const out = new Map<string, Uint8Array>();
  for (const e of directory(disk)) {
    if (!e.isPrg || !e.closed) continue;
    const data = readFileChecked(disk, e);
    if (data) out.set(e.name, data);
  }
  return out;
}

/** Every readable PRG across a title's disk sides, first side wins on duplicate names. */
function titleFiles(title: string): Map<string, Uint8Array> {
  const dir = `${C64_SETS}/${title}`;
  const out = new Map<string, Uint8Array>();
  if (!existsSync(dir)) return out;
  const names = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && /\.d64$/i.test(d.name))
    .map((d) => d.name)
    .sort();
  for (const name of names) {
    for (const [fname, data] of diskFiles(`${dir}/${name}`)) {
      if (!out.has(fname)) out.set(fname, data);
    }
  }
  return out;
}

const GOLDENS: { title: string; pic: string; sha256: string }[] = [
  {
    title: 'Champions of Krynn',
    pic: 'PIC70',
    sha256: '05629bafa50482621f05ff4cfb7de003e7c7a01cda2d7bfe375a8f7b3fdc7f15',
  },
  {
    title: 'Death Knights of Krynn',
    pic: 'PIC71',
    sha256: 'ee9dfbca44c0231df3533290f9f8920bad3e444caba26a61c2f2f93a0f6bc03b',
  },
  {
    title: 'Gateway to the Savage Frontier',
    pic: 'PIC7C',
    sha256: 'db4619cb3f881aae67ee9cf220cdf317befa5aa9b822e99f8a331359411b6308',
  },
];

const haveCorpus = existsSync(C64_SETS) && GOLDENS.every((g) => existsSync(`${C64_SETS}/${g.title}`));

/** Pack an IndexedImage's palette indices as RGB triples (top-left, row-major) -- exactly what
 *  `tools/c64_pic.py`'s `Picture.rgb()` hashes, so this test hashes an identical byte layout. */
function toRgbBytes(indices: Uint8Array): Uint8Array {
  const out = new Uint8Array(indices.length * 3);
  for (let i = 0; i < indices.length; i++) {
    const c = C64_PALETTE[indices[i]!]!;
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  return out;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe.skipIf(!haveCorpus)('C64 picture real-corpus golden renders (parity with tools/test_c64_pic.py)', () => {
  for (const g of GOLDENS) {
    it(`${g.title} ${g.pic} renders to the same sha256 as the Python reference`, () => {
      const files = titleFiles(g.title);
      const charset = files.get('CHARSET');
      const picPrg = files.get(g.pic);
      expect(charset, `${g.title}: CHARSET present`).toBeDefined();
      expect(picPrg, `${g.title}: ${g.pic} present`).toBeDefined();

      const resident = c64CharsetGlyphs(charset!);
      const img = decodeC64Picture(picPrg!, resident);
      expect(img.indices.length).toBe(WIDTH * HEIGHT);

      const rgb = toRgbBytes(img.indices);
      expect(rgb.length).toBe(WIDTH * HEIGHT * 3);
      expect(sha256Hex(rgb)).toBe(g.sha256);

      // Mutation check: this hash comparison can genuinely fail. Flipping a SINGLE screen-code
      // byte was tried first and, on Gateway's PIC7C, turned out to be an unsafe probe: that
      // cell's colour byte happens to select multicolour mode with bg0 == (nib & 7) == 0, a
      // VIC-II degenerate case where 2-bit pair values 0 and 3 render the SAME palette index --
      // so a glyph swap that only touches 00/11 pairs is invisible in that one cell. Flipping the
      // ENTIRE screen-code map (all 570 cells' glyph selection at once) has no such single-cell
      // escape hatch: it is not plausible for every one of 570 independently-selected glyphs to
      // still render pixel-identical.
      const mutated = picPrg!.slice();
      for (let i = 0; i < SCREEN_LEN; i++) mutated[2 + i] = mutated[2 + i]! ^ 0xff;
      const mutatedImg = decodeC64Picture(mutated, resident);
      expect(sha256Hex(toRgbBytes(mutatedImg.indices))).not.toBe(g.sha256);
    });
  }
});

// ---------------------------------------------------------------------------------------------
// Tier 3 — how much the CHARSET companion actually decides
//
// The web viewer gained a C64 path on 2026-08-23: catalog `kind: 'c64-picture'` plus a
// `companionPath` pointing at the disk's 514-byte CHARSET PRG. A picture only ships glyphs
// $40..$FF; codes $00..$3F come from that companion, so the obvious worry is that a silently
// failed companion fetch still yields a 304x120 image and still counts as "1 frame rendered".
//
// Measuring it corrected the premise. The companion is nearly INERT for Champions and Death
// Knights and load-bearing only for Gateway, because what matters is not how many low-code
// cells a picture uses but whether those codes have non-blank glyphs:
//
//   cok/PIC70    0 px      no low codes at all
//   cok/PIC72   18 px      two low codes, $20 (blank) and $2F (one cell, 18 set pixels)
//   dok/PIC71    0 px      165 low cells, all of them $20, whose glyph is blank
//   gateway/PIC7C, 7D, 7E
//              14848 px    40.7% of the image, IDENTICAL in all three
//
// $20 is the space glyph and is blank in both charsets, so a picture can be full of low-code
// cells and still be untouched by the companion. Gateway's 14,848 is code $1C in exactly 232
// cells at byte-identical positions in all three pictures -- spread across all 15 rows and all
// 38 columns, so a fill/texture pattern in a shared layout, not a border.
//
// Sources are the pre-extracted files under the git-ignored `c64_extracted/`
// (`tools/c64_disk.py --extract`); absent => SKIP, like the other real-corpus tiers.
// ---------------------------------------------------------------------------------------------

const C64_EXTRACTED = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'c64_extracted');

function charsetFootprint(slug: string, pic: string): number {
  const bytes = new Uint8Array(readFileSync(resolve(C64_EXTRACTED, slug, pic)));
  const charset = new Uint8Array(readFileSync(resolve(C64_EXTRACTED, slug, 'CHARSET.PRG')));
  const real = decodeC64Picture(bytes, c64CharsetGlyphs(charset));
  // The null for every number below: same picture, same code path, glyphs $00..$3F all zero.
  // Anything the companion does not decide comes out identical, so the difference IS its
  // footprint -- no separate control needed.
  const blank = decodeC64Picture(bytes, new Uint8Array(CHARSET_BODY));
  expect(blank.width).toBe(real.width);
  expect(blank.height).toBe(real.height);
  let diff = 0;
  for (let i = 0; i < real.indices.length; i++) if (real.indices[i] !== blank.indices[i]) diff++;
  return diff;
}

describe('C64 picture — what the CHARSET companion is worth, per title', () => {
  const have = (slug: string, pic: string) => existsSync(resolve(C64_EXTRACTED, slug, pic));

  it('Gateway: the companion decides 14,848 pixels, the same ones in every picture', () => {
    const pics = ['PIC7C.PRG', 'PIC7D.PRG', 'PIC7E.PRG'].filter((f) => have('gateway', f));
    if (pics.length === 0) return;
    for (const pic of pics) expect(charsetFootprint('gateway', pic)).toBe(14848);
  });

  it('Champions and Death Knights: the companion is all but inert, and that is not a bug', () => {
    // Asserted as exact measurements rather than a threshold. A "> 5%" bound of the kind this
    // test was first written with would have been satisfied by Gateway alone and would have
    // been FALSE for four of the six pictures -- the premise, not the code, was wrong.
    if (have('cok', 'PIC70.PRG')) expect(charsetFootprint('cok', 'PIC70.PRG')).toBe(0);
    if (have('cok', 'PIC72.PRG')) expect(charsetFootprint('cok', 'PIC72.PRG')).toBe(18);
    if (have('dok', 'PIC71.PRG')) expect(charsetFootprint('dok', 'PIC71.PRG')).toBe(0);
  });

  it('a picture can be full of low-code cells and still owe the companion nothing', () => {
    // dok/PIC71 is the case that breaks the intuition: 165 of its 570 cells use a code below
    // $40, every one of them $20, whose glyph is blank in the charset. Cell count is not the
    // predictor; non-blank glyph codes are.
    if (!have('dok', 'PIC71.PRG')) return;
    const pic = parseC64Picture(new Uint8Array(readFileSync(resolve(C64_EXTRACTED, 'dok', 'PIC71.PRG'))));
    const low = [...pic.screen].filter((c) => c < RESIDENT_GLYPHS);
    expect(low.length).toBe(165);
    expect(new Set(low)).toEqual(new Set([0x20]));
    expect(charsetFootprint('dok', 'PIC71.PRG')).toBe(0);
  });

  it('the Gateway footprint is one glyph code in a fixed 232-cell layout', () => {
    const pics = ['PIC7C.PRG', 'PIC7D.PRG', 'PIC7E.PRG'].filter((f) => have('gateway', f));
    if (pics.length < 2) return;
    const positions = pics.map((pic) => {
      const p = parseC64Picture(new Uint8Array(readFileSync(resolve(C64_EXTRACTED, 'gateway', pic))));
      const cells: number[] = [];
      for (let i = 0; i < p.screen.length; i++) if (p.screen[i] === 0x1c) cells.push(i);
      return cells;
    });
    for (const cells of positions) expect(cells.length).toBe(232);
    for (const cells of positions.slice(1)) expect(cells).toEqual(positions[0]);
    expect(232 * 64).toBe(14848); // ties the cell count to the pixel count asserted above
    // NULL: the shared layout is $1C specifically, not "every low code sits in fixed cells".
    // $20's count varies across the same three files, which is why its footprint is 0 and this
    // one is 40.7%.
    const spaces = pics.map((pic) => {
      const p = parseC64Picture(new Uint8Array(readFileSync(resolve(C64_EXTRACTED, 'gateway', pic))));
      return [...p.screen].filter((c) => c === 0x20).length;
    });
    expect(new Set(spaces).size).toBeGreaterThan(1);
  });
});
