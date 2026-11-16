/**
 * C64 fixed-size full-screen picture loader — the `PIC*` family (2681/2682-byte PRG files).
 *
 * Direct, faithful port of `tools/c64_pic.py`'s render core (the SOLVED layout — see that
 * module's doc comment and `docs/engine/research/c64-disk-format.md` §7.4/§7.5). This is the
 * C64 counterpart of the DOS `BIGPIC*.DAX` frames and renders at the same geometry: 304×120
 * pixels = 38×15 character cells.
 *
 * Layout (body coordinates = file offset minus the 2-byte CBM load word):
 *
 *   body    0.. 569   570 B   screen map, 38 cols x 15 rows, row-major -> $CC00 + 40*row + col
 *   body  570..1139   570 B   colour map, same geometry, LOW NIBBLE ONLY -> $D800 + 40*row + col
 *   body 1140..2675  1536 B   192 glyph bitmaps for char codes $40..$FF -> $D200
 *   body 2676..2678     3 B   VIC registers $D021, $D022, $D023 (background 0/1/2)
 *   body 2679                 one trailing byte in the 2682-byte files; role unproven
 *
 * 570 + 570 + 1536 + 3 = 2679 exactly. Glyphs $00..$3F are NOT in the picture file — they come
 * from a separate 514-byte `CHARSET` file staged at $D000 (see {@link charsetGlyphs}).
 *
 * The blit (`GDRIVE02`) writes the colour byte with `STA ($B0),Y` and no masking, so the file's
 * high nibble is dirty/hardware-ignored — only the low nibble is real, and bit 3 of it genuinely
 * selects multicolour vs hires per cell (hardware behaviour, not a file convention).
 *
 * Per cell:
 *  - hires (colour bit 3 clear): each of the 8 bits in the glyph row is one pixel; a set bit
 *    takes the (masked) colour nibble, a clear bit takes background 0 ($D021).
 *  - multicolour (colour bit 3 set): the 8 bits are read as four 2-bit pixel PAIRS (each output
 *    pixel doubled, so still 8 output pixels): 00 -> bg0, 01 -> bg1, 10 -> bg2, 11 -> nibble & 7.
 *
 * Palette: the widely-used Pepto/colodore VIC-II 16-colour measurement (matches
 * `tools/c64_pic.py`'s `PALETTE` exactly).
 *
 * Verified against `tools/test_c64_pic.py`'s three real-file sha256 goldens (Champions of Krynn
 * PIC70, Death Knights of Krynn PIC71, Gateway to the Savage Frontier PIC7C) — see
 * `packages/engine/test/c64-picture.test.ts`.
 */
import type { IndexedImage, Palette, RGB } from '../model/index.js';

export const COLS = 38;
export const ROWS = 15;
export const CELL = 8;
export const WIDTH = COLS * CELL; // 304
export const HEIGHT = ROWS * CELL; // 120

export const SCREEN_LEN = COLS * ROWS; // 570
export const COLOUR_OFF = SCREEN_LEN; // 570
export const GLYPH_OFF = SCREEN_LEN * 2; // 1140
export const GLYPH_COUNT = 192; // codes $40..$FF
export const GLYPH_LEN = GLYPH_COUNT * 8; // 1536
export const REG_OFF = GLYPH_OFF + GLYPH_LEN; // 2676
export const BODY_LEN = REG_OFF + 3; // 2679
/** Full PRG file sizes (2-byte load word included): 2681 (no trailing byte) or 2682 (one). */
export const SIZES: readonly [number, number] = [BODY_LEN + 2, BODY_LEN + 3]; // 2681, 2682

/** Screen codes below this come from the separate CHARSET file, not the picture body. */
export const RESIDENT_GLYPHS = 0x40;
/** Bytes of resident-glyph bitmap data in a CHARSET file's body (64 glyphs * 8 bytes). */
export const CHARSET_BODY = RESIDENT_GLYPHS * 8; // 512

/**
 * The VIC-II palette, in the widely-used Pepto/colodore measurement. Matches
 * `tools/c64_pic.py`'s `PALETTE` table exactly, index for index.
 */
export const C64_PALETTE: readonly RGB[] = [
  { r: 0x00, g: 0x00, b: 0x00 }, // 0  black
  { r: 0xff, g: 0xff, b: 0xff }, // 1  white
  { r: 0x81, g: 0x33, b: 0x38 }, // 2  red
  { r: 0x75, g: 0xce, b: 0xc8 }, // 3  cyan
  { r: 0x8e, g: 0x3c, b: 0x97 }, // 4  purple
  { r: 0x56, g: 0xac, b: 0x4d }, // 5  green
  { r: 0x2e, g: 0x2c, b: 0x9b }, // 6  blue
  { r: 0xed, g: 0xf1, b: 0x71 }, // 7  yellow
  { r: 0x8e, g: 0x50, b: 0x29 }, // 8  orange
  { r: 0x55, g: 0x38, b: 0x00 }, // 9  brown
  { r: 0xc4, g: 0x6c, b: 0x71 }, // 10 light red
  { r: 0x4a, g: 0x4a, b: 0x4a }, // 11 dark grey
  { r: 0x7b, g: 0x7b, b: 0x7b }, // 12 grey
  { r: 0xa9, g: 0xff, b: 0x9f }, // 13 light green
  { r: 0x70, g: 0x6d, b: 0xeb }, // 14 light blue
  { r: 0xb2, g: 0xb2, b: 0xb2 }, // 15 light grey
] as const;

/**
 * `model/index.ts`'s `PaletteSource` union is closed and out of scope for this slice (that file
 * is not among the files this loader is allowed to touch), so there is no registered
 * `'c64-fixed'` literal yet. Tag with that string anyway via a narrow, well-commented cast rather
 * than mislabeling this VIC-II table as `'ega-fixed'` (a different, unrelated hardware palette) —
 * a future patch to `model/index.ts` should add a real `'c64-fixed'` member and this cast can be
 * dropped. Nothing at runtime switches on `Palette.source`'s literal value (checked: only
 * `typeof === 'string'` validation exists in `module/validate.ts`), so this is safe today.
 */
const C64_FIXED_SOURCE = 'c64-fixed' as unknown as Palette['source'];

/** Build a neutral-model Palette from the fixed VIC-II table: 0..15 defined, 16..255 null. */
export function makeC64Palette(): Palette {
  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let i = 0; i < C64_PALETTE.length; i++) {
    const c = C64_PALETTE[i]!;
    colors[i] = { r: c.r, g: c.g, b: c.b };
  }
  return { colors, source: C64_FIXED_SOURCE };
}

/** Strip the 2-byte CBM load word. For this corpus it is a staging buffer, not a destination. */
export function c64PictureBody(prg: Uint8Array): Uint8Array {
  return prg.subarray(2);
}

/** True when `prg`'s total length (load word included) matches a fixed-size picture file. */
export function isC64Picture(prg: Uint8Array): boolean {
  return SIZES.includes(prg.byteLength);
}

/** The 64 resident glyphs ($00..$3F) from a CHARSET file. Throws if the file is too short. */
export function charsetGlyphs(prg: Uint8Array): Uint8Array {
  const body = c64PictureBody(prg);
  if (body.byteLength < CHARSET_BODY) {
    throw new Error(`C64 CHARSET too short: ${body.byteLength} body bytes, need ${CHARSET_BODY}`);
  }
  return body.subarray(0, CHARSET_BODY);
}

/** A parsed picture. Fields are views into the body, so a bad file fails at parse, not at draw. */
export interface C64Picture {
  screen: Uint8Array; // 570 screen codes, 38x15 row-major
  colour: Uint8Array; // 570 colour bytes (high nibble dirty; mask with & 0x0F before use)
  glyphs: Uint8Array; // 1536 bytes: 192 * 8-row glyph bitmaps for codes $40..$FF
  bg0: number; // $D021 raw byte (mask with & 0x0F before use as a palette index)
  bg1: number; // $D022 raw byte
  bg2: number; // $D023 raw byte
  trailing: number | null; // present only in 2682-byte files; role unproven
}

/** Parse a fixed-size picture PRG. Throws if `prg`'s size doesn't match {@link SIZES}. */
export function parseC64Picture(prg: Uint8Array): C64Picture {
  if (!isC64Picture(prg)) {
    throw new Error(
      `C64 picture: not a fixed-size picture, ${prg.byteLength} bytes, expected one of [${SIZES.join(', ')}]`,
    );
  }
  const b = c64PictureBody(prg);
  return {
    screen: b.subarray(0, SCREEN_LEN),
    colour: b.subarray(COLOUR_OFF, COLOUR_OFF + SCREEN_LEN),
    glyphs: b.subarray(GLYPH_OFF, GLYPH_OFF + GLYPH_LEN),
    bg0: b[REG_OFF]!,
    bg1: b[REG_OFF + 1]!,
    bg2: b[REG_OFF + 2]!,
    trailing: b.byteLength > BODY_LEN ? b[BODY_LEN]! : null,
  };
}

/** The 8-row bitmap for one screen code: from `resident` (CHARSET) below $40, else from `pic`. */
export function c64PictureGlyph(pic: C64Picture, code: number, resident: Uint8Array): Uint8Array {
  if (code < RESIDENT_GLYPHS) {
    return resident.subarray(code * 8, code * 8 + 8);
  }
  const i = (code - RESIDENT_GLYPHS) * 8;
  return pic.glyphs.subarray(i, i + 8);
}

/**
 * Render to WIDTH*HEIGHT palette indices (0..15).
 *
 * Per cell, the colour RAM nibble's bit 3 chooses the mode — that is VIC-II hardware, and the
 * blit stores the byte unmasked, so the file's high nibble never reaches the decision.
 */
export function decodeC64PictureIndices(pic: C64Picture, resident: Uint8Array): Uint8Array {
  const px = new Uint8Array(WIDTH * HEIGHT);
  const regs = [pic.bg0 & 0x0f, pic.bg1 & 0x0f, pic.bg2 & 0x0f];
  for (let cy = 0; cy < ROWS; cy++) {
    for (let cx = 0; cx < COLS; cx++) {
      const k = cy * COLS + cx;
      const bits = c64PictureGlyph(pic, pic.screen[k]!, resident);
      const nib = pic.colour[k]! & 0x0f;
      const multicolour = (nib & 0x08) !== 0;
      for (let r = 0; r < 8; r++) {
        const byte = bits[r]!;
        const base = (cy * 8 + r) * WIDTH + cx * 8;
        if (multicolour) {
          for (let j = 0; j < 4; j++) {
            const v = (byte >> (6 - 2 * j)) & 3;
            const idx = v < 3 ? regs[v]! : nib & 0x07;
            px[base + j * 2] = idx;
            px[base + j * 2 + 1] = idx;
          }
        } else {
          for (let j = 0; j < 8; j++) {
            px[base + j] = ((byte >> (7 - j)) & 1) !== 0 ? nib : regs[0]!;
          }
        }
      }
    }
  }
  return px;
}

/**
 * Decode a fixed-size picture PRG into a neutral-model {@link IndexedImage}: 304x120 palette
 * indices with the fixed VIC-II palette attached, fully opaque (`transparentIndex: null` — these
 * are full-screen art, not overlay tiles). `resident` is the 64-glyph CHARSET body (see
 * {@link charsetGlyphs}) — required because screen codes below $40 are not stored in the picture.
 */
export function decodeC64Picture(prg: Uint8Array, resident: Uint8Array): IndexedImage {
  const pic = parseC64Picture(prg);
  const indices = decodeC64PictureIndices(pic, resident);
  return {
    width: WIDTH,
    height: HEIGHT,
    indices,
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: makeC64Palette(),
    encoding: 'c64-picture',
  };
}
