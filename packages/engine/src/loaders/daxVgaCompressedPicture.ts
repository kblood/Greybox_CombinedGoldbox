/**
 * Late-Gen1 compressed VGA pictures (`PIC*.DAX`, `SPRIT*.DAX`) used by Treasures, Pools and
 * Buck Rogers.
 *
 * The retail loader shape was recovered from Treasures `GAME.EXE`, then checked against the
 * native attract capture: `PIC1.DAX#21` expands to the 7,744-byte portrait buffer found in
 * `ram-t0060.bin` with 7,744/7,744 bytes equal. The inner stream uses DRAW18's PackBits variant
 * (literal `c+1` for c<128, repeat `257-c` otherwise), but is flat row-major rather than HLIB's
 * Chain-4 display order.
 *
 * ## The record count is a field, not a constant (2026-08-26)
 *
 * This module originally required the `u16` at `recordStart` to be **0** and the single declared
 * payload to run to the end of the block. That is the PIC case, and reading the zero as a
 * structural constant is what made every `SPRIT*.DAX` block in three shipped titles decode to
 * nothing. After the count come `frameCount` copies of the same 3-byte
 * `{u16 compressedLength, u8 mode}` record header the single-frame path already read, and then the
 * payloads back to back — so the old layout is exactly this one at `frameCount === 1`, not a
 * special case beside it.
 *
 * ## Which field holds the count — corrected the same day
 *
 * The first fix read the count from the `u16` at `recordStart`, because it is 0 for a PIC portrait
 * and 2 for a SPRIT triple and `word + 1` therefore looked like the answer. **It is not.** The
 * count is the standard DAX block header's own `item_count` at **byte 8** — the same field the
 * chunky-items reading uses — as `raw[8] + 1`. The two agree on 275 of the 293 accepted blocks and
 * diverge on exactly the 18 that matter: Buck Rogers' and Pools' multi-frame `PIC` blocks, where
 * the word takes values like 256, 1029 and 1541 that no frame count could be. Reading the word left
 * 21 blocks undecodable; reading byte 8 leaves none.
 *
 * **The number is not fitted, and the null says so.** Sweep every candidate count 1..16 against the
 * two structural constraints — the declared lengths sum to `blockLength - payloadStart` exactly,
 * and each payload expands to exactly `width · height` — and across all 293 accepted blocks
 * **exactly one** of the sixteen fits, every time. The data pins the count on its own; byte 8 then
 * agrees with it 293/293. Had the field been the wrong one, that unique solution would have
 * disagreed somewhere.
 *
 * Corpus, all 88x88: Buck Rogers 40 `PIC` (28 single, then 3/4/6/8/9-frame runs) = 88 frames and
 * 35 `SPRIT` x3 = 105; Pools of Darkness 49 `PIC` = 81 and 29 `SPRIT` x3 = 87; Treasures 127 of 139
 * `PIC` = 130 and 13 `SPRIT` x3 = 39. The `SPRIT` triple is the monster near/mid/far view-size set,
 * whose decoded coverage falls 31% → 12% → 4% of the canvas. Negative control: of the 411
 * `PIC*`/`SPRIT*` blocks in the EGA-generation titles (CoK 104, DoK 59, Curse 102, Secret 72,
 * Gateway 74, and Pool of Radiance's zero — it names no block that way), **none** is accepted.
 *
 * **The mode byte is not a boolean.** The first fix rejected any record whose mode exceeded 1.
 * Observed values across the corpus are 0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 20 and 99, and keeping that
 * gate would discard 24 otherwise-exact blocks, so it is gone. The byte is carried through
 * uninterpreted rather than guessed at.
 *
 * **The `u16` at `recordStart` is now unread.** Its observed values are 0, 1, 2, 3, 4, 256, 1029 and
 * 1541. It is carried on the result as `recordWord` so a later reading has the bytes to hand, but
 * nothing depends on it.
 *
 * **Twelve Treasures blocks are still undecoded** and are a disclosed gap, not a silent drop:
 * `PIC1.DAX#38/47/48/57/68/70` and `PIC1A.DAX#78/81/89/90/100/119`. All twelve are 798 bytes and
 * open `00 00 00 00 00 00 01 00 20 df 15`; width and height are both zero, so they are not pictures
 * under this reading at all, and `colorCount` would be 21 — odd, which the palette gate rejects
 * first. They are twelve *distinct* records, not one repeated: they share a 64-byte prefix and then
 * differ in 29..108 of their bytes. One unknown record type, twelve instances, and the shared
 * prefix is where a future reading should start. Whatever they are, it is not this format.
 *
 * **What is still unread:** the four bytes between the lookup seeds and `recordStart`, which are
 * zero in the PIC blocks that motivated the `+ 4` skip and are NOT zero in `SPRIT` (e.g.
 * `09 ab 2f 4f`). They are skipped here, as before, rather than guessed at.
 *
 * **Palette caveat, measured:** Treasures' SPRIT blocks declare a tight 80-colour window at base
 * 176 and every pixel lands inside it. Pools and Buck declare 32..255 but fill 32..175 with
 * `(63,63,63)` padding, and a minority of pixels index into that padded window — 0.58% of Pools'
 * non-transparent pixels and 8.81% of Buck's. Those pixels take their colour from a palette the
 * block does not carry, so they render white here; the geometry is unaffected.
 */
import type { IndexedImage, Palette, RGB } from '../model/index.js';

const HEADER_LEN = 11;
const scale6to8 = (value: number): number => Math.round((value * 255) / 63);

export interface VgaCompressedPicture {
  width: number;
  height: number;
  xOffset: number;
  yOffset: number;
  /** Mode byte of the first record. Per-record modes are on `frames`. */
  mode: number;
  /** The `u16` at `recordStart`. Carried, not interpreted — see the module docblock. */
  recordWord: number;
  /** First frame's pixels — identical to `frames[0].indices`. */
  indices: Uint8Array;
  /** Every declared frame, in file order. Length 1 for the PIC case. */
  frames: VgaCompressedFrame[];
  palette: Palette;
}

export interface VgaCompressedFrame {
  mode: number;
  indices: Uint8Array;
}

function decodeDraw18Flat(source: Uint8Array, expected: number): Uint8Array | null {
  const output = new Uint8Array(expected);
  let input = 0;
  let out = 0;
  while (input < source.length && out < expected) {
    const control = source[input++]!;
    if (control < 128) {
      const count = control + 1;
      if (input + count > source.length || out + count > expected) return null;
      output.set(source.subarray(input, input + count), out);
      input += count;
      out += count;
    } else {
      const count = 257 - control;
      if (input >= source.length || out + count > expected) return null;
      output.fill(source[input++]!, out, out + count);
      out += count;
    }
  }
  return input === source.length && out === expected ? output : null;
}

export function parseVgaCompressedPicture(raw: Uint8Array): VgaCompressedPicture | null {
  if (raw.length < HEADER_LEN + 10) return null;
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const height = view.getUint16(0, true);
  const width8 = view.getUint16(2, true);
  const width = width8 * 8;
  if (!width || !height || width > 4096 || height > 2048) return null;

  const paletteBase = raw[9]!;
  const colorCount = raw[10]!;
  if (colorCount < 2 || (colorCount & 1) !== 0 || paletteBase + colorCount > 256) return null;
  const paletteEnd = HEADER_LEN + colorCount * 3;
  const seedEnd = paletteEnd + colorCount / 2;
  const recordStart = seedEnd + 4;
  if (recordStart + 5 > raw.length) return null;

  const colors: (RGB | null)[] = new Array(256).fill(null);
  for (let i = 0; i < colorCount; i++) {
    const offset = HEADER_LEN + i * 3;
    const r = raw[offset]!;
    const g = raw[offset + 1]!;
    const b = raw[offset + 2]!;
    if (r > 63 || g > 63 || b > 63) return null;
    colors[paletteBase + i] = { r: scale6to8(r), g: scale6to8(g), b: scale6to8(b) };
  }

  // The frame count is the standard DAX header's `item_count` at byte 8, as `raw[8] + 1`. The word
  // at `recordStart` is skipped: it equals `frameCount - 1` on most blocks but is 256, 1029 or 1541
  // on some multi-frame ones. Then one 3-byte header per frame, then the payloads concatenated. The
  // one-byte mode sits outside its record's declared byte count.
  const recordWord = view.getUint16(recordStart, true);
  const frameCount = raw[8]! + 1;
  if (frameCount > 16) return null;
  const headersEnd = recordStart + 2 + frameCount * 3;
  if (headersEnd > raw.length) return null;
  const headers: { length: number; mode: number }[] = [];
  let declared = 0;
  for (let i = 0; i < frameCount; i++) {
    const at = recordStart + 2 + i * 3;
    const length = view.getUint16(at, true);
    headers.push({ length, mode: raw[at + 2]! });
    declared += length;
  }
  // Exact consume across the whole block, not just the first record.
  if (headersEnd + declared !== raw.length) return null;
  const frames: VgaCompressedFrame[] = [];
  let payloadAt = headersEnd;
  for (const header of headers) {
    const indices = decodeDraw18Flat(raw.subarray(payloadAt, payloadAt + header.length), width * height);
    if (!indices) return null;
    frames.push({ mode: header.mode, indices });
    payloadAt += header.length;
  }
  const mode = frames[0]!.mode;
  const indices = frames[0]!.indices;

  return {
    width,
    height,
    xOffset: view.getInt16(6, true),
    yOffset: view.getInt16(4, true),
    mode,
    recordWord,
    indices,
    frames,
    palette: {
      colors,
      source: 'dax-vga-compressed-picture',
      firstColor: paletteBase,
      count: colorCount,
    },
  };
}

export function vgaCompressedPictureToIndexedImage(picture: VgaCompressedPicture): IndexedImage {
  return vgaCompressedPictureToIndexedImages(picture)[0]!;
}

/** Every declared frame as an image. Single-element for PIC portraits, three for SPRIT view-sizes. */
export function vgaCompressedPictureToIndexedImages(picture: VgaCompressedPicture): IndexedImage[] {
  return picture.frames.map((frame) => ({
    width: picture.width,
    height: picture.height,
    indices: frame.indices,
    xOffset: picture.xOffset,
    yOffset: picture.yOffset,
    transparentIndex: null,
    palette: picture.palette,
    encoding: 'dax-vga-compressed-picture' as const,
  }));
}
