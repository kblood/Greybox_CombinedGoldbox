/**
 * Buck Rogers: Countdown to Doomsday — Amiga art (R1) golden parity (G3).
 *
 * The Amiga WHDLoad dump of Buck Rogers is DAA/DAX-shaped like CoK/DoK's Amiga
 * ports (NOT GLIB), and decodes end-to-end with the existing `decodeDaa` /
 * `tools/daa_decode.py` / `tools/subframe_decode.py --amiga` decoders — no new
 * decoder was needed. This test proves the TS `decodeDaa` path is pixel-identical
 * to the Python reference on three real blocks spanning the two container
 * sub-kinds and a non-16-aligned width:
 *
 *   - bigpic1.daa block 112 — a 9-byte-TOC "blocks" frame, 304x120 (a `304 % 16 != 0`
 *     wide frame, so the Amiga word-aligned-row padding must be handled correctly).
 *   - cpic1.daa block 10 — a 9-byte-TOC "blocks" frame, 24x24 (also non-16-aligned;
 *     the smallest common case).
 *   - sprit1.daa block 11 — a 6-byte sub-frame INDEX entry, all 3 distance frames
 *     (the "sub-frame triple"), 88x88 each.
 *
 * Golden digests were computed ONCE from the Python PNG path — decode with the
 * checked-in Python oracle at `--scale 1` (no upscaling, so pixel dimensions match
 * the raw frame exactly), then sha256 the PNG's RGB pixel bytes (`Image.open(...)
 * .convert("RGB").tobytes()`). Reproduce with:
 *
 *   D="D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/BuckRogersCountdownDday/data"
 *   python tools/daa_decode.py --scale 1 --out /tmp/bigpic1 "$D/bigpic1.daa"
 *   python tools/daa_decode.py --scale 1 --out /tmp/cpic1 "$D/cpic1.daa"
 *   python tools/subframe_decode.py --amiga --scale 1 --out /tmp/sprit1 "$D/sprit1.daa"
 *   python -c "import hashlib; from PIL import Image; \
 *     print(hashlib.sha256(Image.open('/tmp/bigpic1/bigpic1_112.png').convert('RGB').tobytes()).hexdigest())"
 *   # ...and similarly for cpic1_010.png, and sprit1_011_f0/f1/f2.png concatenated.
 *
 * The TS side decodes the SAME file via `decodeDaa`, converts each frame's
 * `indices` through its own embedded `palette` to RGB the same way (row-major,
 * top-left origin), and hashes that. `skipIf` when the external, never-vendored
 * WHDLoad path is absent on this machine (see CLAUDE.md's Amiga source-location
 * list) — the D: drive is read-only source, not committed to the repo.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { decodeDaa, type IndexedImage } from '../src/index.js';

const BUCK_AMIGA_DIR =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/BuckRogersCountdownDday/data';

const haveCorpus = existsSync(BUCK_AMIGA_DIR);

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Convert an IndexedImage's palette indices to flat RGB bytes, row-major, top-left origin —
 *  the same byte layout `Image.convert("RGB").tobytes()` produces for the Python PNG. */
function toRgbBytes(img: IndexedImage): Uint8Array {
  const pal = img.palette;
  if (!pal) throw new Error('golden fixture image has no embedded palette');
  const out = new Uint8Array(img.width * img.height * 3);
  for (let i = 0; i < img.indices.length; i++) {
    const c = pal.colors[img.indices[i]!];
    if (!c) throw new Error(`palette index ${img.indices[i]} undefined at pixel ${i}`);
    out[i * 3] = c.r;
    out[i * 3 + 1] = c.g;
    out[i * 3 + 2] = c.b;
  }
  return out;
}

describe.skipIf(!haveCorpus)(
  'Buck Rogers Amiga DAA — TS decodeDaa pixel parity with the Python oracle (real WHDLoad corpus)',
  () => {
    it('bigpic1.daa block 112 (304x120, non-16-aligned width) matches the Python golden sha256', () => {
      const bytes = new Uint8Array(readFileSync(`${BUCK_AMIGA_DIR}/bigpic1.daa`));
      const arc = decodeDaa(bytes, 'bigpic1.daa');
      expect(arc.kind).toBe('blocks');
      const blk = arc.blocks.find((b) => b.blockId === 112);
      expect(blk, 'block 112 present').toBeDefined();
      expect(blk!.image, 'block 112 decodes to an image').not.toBeNull();
      const img = blk!.image!;
      expect(img.width).toBe(304);
      expect(img.height).toBe(120);
      const rgb = toRgbBytes(img);
      expect(rgb.length).toBe(304 * 120 * 3);
      const golden = '20daa7e142597afebaf0d92bee4363d9af4d727dd2a680252b8c7fcc35bca7ac';
      expect(sha256Hex(rgb)).toBe(golden);

      // Mutation: flip the plane-order assumption by XOR-ing one byte of the hashed RGB stream
      // (equivalent to corrupting a single decoded pixel) -- a golden that still matches with
      // wrong pixel data is not a golden.
      const mutated = rgb.slice();
      mutated[0] = mutated[0]! ^ 0xff;
      expect(sha256Hex(mutated)).not.toBe(golden);
    });

    it('cpic1.daa block 10 (24x24, smallest non-16-aligned case) matches the Python golden sha256', () => {
      const bytes = new Uint8Array(readFileSync(`${BUCK_AMIGA_DIR}/cpic1.daa`));
      const arc = decodeDaa(bytes, 'cpic1.daa');
      expect(arc.kind).toBe('blocks');
      const blk = arc.blocks.find((b) => b.blockId === 10);
      expect(blk, 'block 10 present').toBeDefined();
      expect(blk!.image, 'block 10 decodes to an image').not.toBeNull();
      const img = blk!.image!;
      expect(img.width).toBe(24);
      expect(img.height).toBe(24);
      const rgb = toRgbBytes(img);
      const golden = '816093a1889740f8ccac4c280a1d707ba7a5774926700df43903a93f43a0f4ea';
      expect(sha256Hex(rgb)).toBe(golden);

      const mutated = rgb.slice();
      mutated[0] = mutated[0]! ^ 0xff;
      expect(sha256Hex(mutated)).not.toBe(golden);
    });

    it('sprit1.daa block 11, all 3 distance frames (the "sub-frame triple") match the Python golden sha256', () => {
      const bytes = new Uint8Array(readFileSync(`${BUCK_AMIGA_DIR}/sprit1.daa`));
      const arc = decodeDaa(bytes, 'sprit1.daa');
      expect(arc.kind).toBe('index');
      const sf = arc.subFrames.find((s) => s.blockId === 11);
      expect(sf, 'sub-frame block 11 present').toBeDefined();
      expect(sf!.frames).toHaveLength(3);
      const combined = new Uint8Array(88 * 88 * 3 * 3);
      let at = 0;
      for (const frame of sf!.frames) {
        expect(frame.width).toBe(88);
        expect(frame.height).toBe(88);
        combined.set(toRgbBytes(frame), at);
        at += 88 * 88 * 3;
      }
      const golden = '08ea7f364c7627fad7da8155dea61a9eb9acee5f9e835a3e5c702c9ab05fb4ef';
      expect(sha256Hex(combined)).toBe(golden);

      // Mutation: swap frame order (f0/f1/f2 -> f1/f0/f2) -- if the digest still matched after a
      // reorder, the golden would not be sensitive to per-frame content, only to size.
      const reordered = new Uint8Array(combined.length);
      reordered.set(toRgbBytes(sf!.frames[1]!), 0);
      reordered.set(toRgbBytes(sf!.frames[0]!), 88 * 88 * 3);
      reordered.set(toRgbBytes(sf!.frames[2]!), 88 * 88 * 3 * 2);
      expect(sha256Hex(reordered)).not.toBe(golden);
    });
  },
);
