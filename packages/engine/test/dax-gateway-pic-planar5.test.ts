/**
 * P3.1 Savage Frontier VGA archive contract — the Gateway `PIC*.DAX` single-frame
 * 5-bitplane picture format, SOLVED 2026-07-22 (research doc Part 17) and ported here
 * from the proven reference decoder `tools/gateway_pic_decode.py`.
 *
 * The proof chain this file pins:
 *  1. ORACLE GOLDEN (the project's byte-identity bar): the TS decode of `PIC2.DAX`
 *     block id 5 must be byte-identical to the 7,744-byte PIC-loader output buffer
 *     captured live at the strict loader's RETF in two independent DOSBox-X sessions
 *     (sha256 25293b40cd5114cf…) on all 7,736 comparable bytes — the buffer's first 8
 *     bytes are non-pixel metadata (`0000 8354 0000 01E4`; 3 of those bytes exceed the
 *     0x1F index maximum, so they cannot be pixels). The committed sha256 constants
 *     below were computed from that captured buffer and from the Python reference
 *     decode (verified equal by `tools/gateway_pic_decode.py --verify-capture`), so the
 *     oracle assertion runs even when the raw capture file (git-ignored, under
 *     `build/gateway-pic-loader-capture-20260722-b/` with a git-ignored fixture copy)
 *     is absent; when a capture file IS present, a direct byte-compare runs too.
 *  2. All 72 single-frame category-0x0c/0x0e/0x0f blocks across `PIC.DAX`–`PIC6.DAX`
 *     satisfy the exact-consume formula (zero slop, zero exceptions) and decode →
 *     re-encode byte-identically to the original decompressed block (lossless
 *     round-trip, the same parity method every other format in this suite uses).
 *  3. `decodeDax` dispatch: single-frame blocks classify as 'gateway-pic-planar5' with
 *     a real image; the one multi-frame block (`PIC.DAX` id 29) decodes as
 *     'gateway-pic-multiframe' — SOLVED 2026-07-23 (research doc Part 18): frame 0 is
 *     the full single-frame layout, each tail frame is a 14-byte header (category 0x04
 *     = "reuse frame 0's cached tail structure", per the loader disassembly) + a FULL
 *     height*5*width8-byte planar5 XOR delta against frame 0 (Part 6's "4,833-byte
 *     payload, 7 short" was 7 zero delta bytes misattributed to a phantom 21-byte
 *     header). All 6 frames decode; exact-consume 1+4894+5*4854 = 29165, zero slop;
 *     lossless multi-frame re-encode. The one plain-EGA block (`PIC3.DAX` id 2,
 *     category 0x00) still falls through to the existing 'animated' path.
 *  4. Negative control: CoK's and DoK's own `PIC*.DAX` files (committed in-repo) never
 *     match this format — every block is rejected by the strict category+byte-count
 *     gate, so detection is self-verifying, not a filename guess.
 *  5. Render path: the decoded IndexedImage carries the full 0..31 palette — EGA16 below,
 *     and 16..31 read from the 24 bytes ending at the block's pixel offset (resolved
 *     2026-08-11; see `gatewayExtendedDacFromCore24`). The rule is self-checking because
 *     registers 16/17 are known independently, from `INT 10h AX=1010h` at `GAME.OVR`
 *     0x515a2, and must fall out of it — they do, in all 73 blocks.
 *
 * See docs/engine/research/gateway-vga-picture-format.md Part 17 for the derivation.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeDax, readDaxDataBlocks } from '../src/loaders/dax.js';
import {
  GATEWAY_PIC_PREFIX_BY_CATEGORY,
  GATEWAY_PIC_TAIL_CATEGORY,
  GATEWAY_VGA_EXT_DAC,
  encodeGatewayPicPlanar5,
  encodeGatewayPicPlanar5Multi,
  gatewayExtendedDacFromCore24,
  gatewayExtendedDacFromPicture,
  gatewayExtendedPaletteFromPicture,
  gatewayPicMultiFrameToIndexedImages,
  gatewayPicPlanar5ToIndexedImage,
  parseGatewayPicPlanar5,
} from '../src/loaders/daxVgaPicture.js';

const repoRoot = resolve(__dirname, '..', '..', '..');
const gatewayDir = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const cokDir = resolve(repoRoot, 'Champions of Krynn');
const dokDir = resolve(repoRoot, 'Death Knights of Krynn');

const haveGateway = existsSync(resolve(gatewayDir, 'PIC2.DAX'));

const GATEWAY_PIC_FILES = ['PIC.DAX', 'PIC2.DAX', 'PIC3.DAX', 'PIC4.DAX', 'PIC5.DAX', 'PIC6.DAX'];

/**
 * The captured live loader buffer (7,744 bytes, sha256 below). Both locations are
 * git-ignored; the fixture copy is the stable one, the build/ path is where the
 * capture tool originally wrote it.
 */
const CAPTURE_CANDIDATES = [
  resolve(__dirname, 'fixtures', 'dax', 'gateway-pic-loader-buffer-01.bin'),
  resolve(repoRoot, 'build', 'gateway-pic-loader-capture-20260722-b', 'pic-loader-buffer-01.bin'),
];
const capturePath = CAPTURE_CANDIDATES.find((p) => existsSync(p)) ?? null;

/** sha256 of the full captured buffer (metadata head + pixels), from Part 16/17. */
const CAPTURE_SHA256 = '25293b40cd5114cf915670904b4353cc7fea00c6b8bd0fbe376d9fab9af17ecb';
/**
 * sha256 of the ORACLE-COMPARABLE region — captured buffer bytes 8..7743, verified
 * byte-identical to the Python reference decode of PIC2.DAX block 5 bytes 8..7743
 * (7,736/7,736) by `tools/gateway_pic_decode.py --verify-capture`.
 */
const ORACLE_TAIL_SHA256 = '93c3572185ec39d519b2b41f29bfaee52e6959b44871d756c8ad81b9d713d3b4';
/**
 * sha256 of the FULL 7,744-byte Python reference decode of PIC2.DAX block 5 (including
 * the true first 8 pixels, which the capture window does not preserve).
 */
const REFERENCE_DECODE_SHA256 = '1b97e75df2a23c638a87f3b582bb5f027a94906ba726ef700f71a9a1f2ffb020';

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function loadBlocks(dir: string, file: string) {
  const bytes = new Uint8Array(readFileSync(resolve(dir, file)));
  return readDaxDataBlocks(bytes);
}

describe('parseGatewayPicPlanar5 — captured-loader-buffer oracle golden (PIC2.DAX block 5)', () => {
  it.skipIf(!haveGateway)('TS decode of PIC2.DAX block 5 is byte-identical to the captured oracle (committed sha256)', () => {
    const blocks = loadBlocks(gatewayDir, 'PIC2.DAX');
    const b = blocks.find((x) => x.blockId === 5);
    expect(b, 'PIC2.DAX block 5 should exist').toBeDefined();
    const parsed = parseGatewayPicPlanar5(b!.raw);
    expect(parsed?.outcome).toBe('single-frame');
    if (parsed?.outcome !== 'single-frame') return;
    const pic = parsed.picture;
    expect(pic.width).toBe(88);
    expect(pic.height).toBe(88);
    expect(pic.category).toBe(0x0e);
    expect(pic.prefix.byteLength).toBe(33);
    expect(pic.indices.length).toBe(7744);
    // Full-decode identity with the Python reference (which itself passes
    // --verify-capture against the live buffer).
    expect(sha256Hex(pic.indices)).toBe(REFERENCE_DECODE_SHA256);
    // Oracle identity on the comparable region: decode bytes 8..7743 must hash to the
    // captured buffer's bytes 8..7743 (its first 8 bytes are non-pixel metadata).
    expect(sha256Hex(pic.indices.subarray(8))).toBe(ORACLE_TAIL_SHA256);
  });

  it.skipIf(!haveGateway || !capturePath)('direct byte-compare against the captured buffer file (all 7,736 comparable bytes)', () => {
    const buf = new Uint8Array(readFileSync(capturePath!));
    expect(buf.byteLength).toBe(7744);
    expect(sha256Hex(buf), 'capture file integrity').toBe(CAPTURE_SHA256);
    const blocks = loadBlocks(gatewayDir, 'PIC2.DAX');
    const parsed = parseGatewayPicPlanar5(blocks.find((x) => x.blockId === 5)!.raw);
    expect(parsed?.outcome).toBe('single-frame');
    if (parsed?.outcome !== 'single-frame') return;
    const img = parsed.picture.indices;
    expect(img.length).toBe(buf.byteLength);
    // Bytes 0..7 of the capture are metadata (values 0x54/0x83/0xE4 exceed the 0x1F
    // pixel maximum); bytes 8..7743 must match the decode exactly.
    let mismatches = 0;
    for (let i = 8; i < buf.byteLength; i++) if (buf[i] !== img[i]) mismatches++;
    expect(mismatches).toBe(0);
  });
});

describe('parseGatewayPicPlanar5 — full retail corpus (exact fit + lossless round-trip)', () => {
  it.skipIf(!haveGateway)('all 72 single-frame blocks decode exact-fit and re-encode byte-identically', () => {
    let singles = 0;
    for (const f of GATEWAY_PIC_FILES) {
      for (const b of loadBlocks(gatewayDir, f)) {
        const parsed = parseGatewayPicPlanar5(b.raw);
        if (!parsed || parsed.outcome !== 'single-frame') continue;
        singles++;
        const pic = parsed.picture;
        // Exact-consume already gated inside the parser; re-assert the arithmetic here
        // so a parser regression can't silently weaken the formula.
        const prefixLen = GATEWAY_PIC_PREFIX_BY_CATEGORY[pic.category]!;
        expect(b.raw.byteLength, `${f} block ${b.blockId}`).toBe(
          22 + prefixLen + pic.height * 5 * (pic.width / 8),
        );
        // Every decoded pixel is a 5-bit index.
        for (const idx of pic.indices) {
          if (idx > 31) throw new Error(`${f} block ${b.blockId}: index ${idx} out of range`);
        }
        // Lossless round-trip: head + prefix verbatim, pixels repacked → original bytes.
        const reencoded = encodeGatewayPicPlanar5(pic);
        expect(reencoded.byteLength, `${f} block ${b.blockId} length`).toBe(b.raw.byteLength);
        expect(reencoded, `${f} block ${b.blockId} round-trip`).toEqual(b.raw);
      }
    }
    expect(singles).toBe(72);
  });

  it.skipIf(!haveGateway)('decodeDax dispatch: 72 planar5 images, 1 decoded multi-frame animation, 1 plain-EGA animated', () => {
    let planar5 = 0;
    let multiframe = 0;
    let animated = 0;
    for (const f of GATEWAY_PIC_FILES) {
      const bytes = new Uint8Array(readFileSync(resolve(gatewayDir, f)));
      const arc = decodeDax(bytes, f.replace('.DAX', ''));
      for (const b of arc.blocks) {
        if (b.kind === 'gateway-pic-planar5') {
          planar5++;
          expect(b.image, `${f} block ${b.blockId}`).not.toBeNull();
          expect(b.image!.encoding).toBe('dax-gateway-pic-planar5');
          expect(arc.frameSet.frames.get(b.blockId)).toBe(b.image);
        } else if (b.kind === 'gateway-pic-multiframe') {
          multiframe++;
          // Decoded XOR-delta animation (Part 18): frame 0 as the block image, all 6
          // frames kept, like the plain-EGA 'animated' path.
          expect(f).toBe('PIC.DAX');
          expect(b.blockId).toBe(29);
          expect(b.image, `${f} block ${b.blockId}`).not.toBeNull();
          expect(b.image!.encoding).toBe('dax-gateway-pic-planar5');
          expect(b.frames).toBeDefined();
          expect(b.frames!.length).toBe(6);
          expect(b.frames![0]).toBe(b.image);
          expect(arc.frameSet.frames.get(b.blockId)).toBe(b.image);
        } else if (b.kind === 'animated') {
          animated++;
          // PIC3.DAX id 2 — the corpus's one category-0x00 plain-EGA block, still
          // handled by the pre-existing animated path, untouched by this decoder.
          expect(f).toBe('PIC3.DAX');
          expect(b.blockId).toBe(2);
        } else {
          throw new Error(`${f} block ${b.blockId}: unexpected kind '${b.kind}'`);
        }
      }
    }
    expect(planar5).toBe(72);
    expect(multiframe).toBe(1);
    expect(animated).toBe(1);
  });
});

describe('parseGatewayPicPlanar5 — multi-frame XOR-delta animation (PIC.DAX id 29, Part 18)', () => {
  it.skipIf(!haveGateway)('block 29 decodes 6 frames with exact-consume arithmetic and a lossless re-encode', () => {
    const blocks = loadBlocks(gatewayDir, 'PIC.DAX');
    const b = blocks.find((x) => x.blockId === 29);
    expect(b, 'PIC.DAX block 29 should exist').toBeDefined();
    // Exact-consume: 1 + (21 + 33 + 4840) + 5*(14 + 4840) = 29165, zero slop.
    expect(b!.raw.byteLength).toBe(1 + 21 + 33 + 4840 + 5 * (14 + 4840));
    const parsed = parseGatewayPicPlanar5(b!.raw);
    expect(parsed?.outcome).toBe('multi-frame');
    if (parsed?.outcome !== 'multi-frame') return;
    const { picture, frames, tailHeads } = parsed.multi;
    expect(picture.width).toBe(88);
    expect(picture.height).toBe(88);
    expect(picture.category).toBe(0x0e);
    expect(frames.length).toBe(6);
    expect(tailHeads.length).toBe(5);
    for (const head of tailHeads) {
      // 14-byte tail header: h/w8 match frame 0, pad 0x01, category 0x04 (the loader's
      // "reuse frame 0's cached tail structure" marker — disassembly-proven).
      expect(head.byteLength).toBe(14);
      const dv = new DataView(head.buffer, head.byteOffset, head.byteLength);
      expect(dv.getUint16(4, true)).toBe(88);
      expect(dv.getUint16(6, true)).toBe(11);
      expect(head[12]).toBe(0x01);
      expect(head[13]).toBe(GATEWAY_PIC_TAIL_CATEGORY);
    }
    // Every frame: valid 5-bit indices; tail frames differ from frame 0 by a SMALL,
    // localized pixel set (sparse animation deltas — 97%+ of delta bytes are zero),
    // and no two consecutive frames are identical (it is a real animation).
    for (let f = 0; f < frames.length; f++) {
      for (const v of frames[f]) {
        if (v > 31) throw new Error(`frame ${f}: index ${v} out of range`);
      }
      if (f > 0) {
        let changed = 0;
        for (let i = 0; i < frames[f].length; i++) {
          if (frames[f][i] !== frames[0][i]) changed++;
        }
        expect(changed, `frame ${f} vs frame 0`).toBeGreaterThan(0);
        expect(changed, `frame ${f} vs frame 0`).toBeLessThan(500);
      }
    }
    // Lossless multi-frame round-trip: frame 0 head+prefix verbatim + repacked planes,
    // tail heads verbatim + repacked (frameN XOR frame0) deltas → original bytes.
    const reencoded = encodeGatewayPicPlanar5Multi(parsed.multi);
    expect(reencoded.byteLength).toBe(b!.raw.byteLength);
    expect(reencoded).toEqual(b!.raw);
    // Render path: one IndexedImage per frame, all sharing frame 0's palette — the tail
    // frames carry a 14-byte header with no prefix, so there is only one palette to read.
    const imgs = gatewayPicMultiFrameToIndexedImages(parsed.multi);
    expect(imgs.length).toBe(6);
    for (const img of imgs) {
      expect(img.width).toBe(88);
      expect(img.height).toBe(88);
      expect(img.encoding).toBe('dax-gateway-pic-planar5');
      expect(img.palette!.source).toBe('dax-vga-ext');
      for (let i = 18; i <= 31; i++) expect(img.palette!.colors[i], `index ${i}`).not.toBeNull();
    }
    expect(imgs[0].indices).toBe(picture.indices);
  });
});

describe('parseGatewayPicPlanar5 — negative control (CoK/DoK PIC files never match)', () => {
  it('every CoK and DoK PIC*.DAX block is rejected and still decodes on its original path', () => {
    const sources: Array<[string, string[]]> = [
      [cokDir, ['PIC1.DAX', 'PIC2.DAX', 'PIC3.DAX']],
      [dokDir, ['PIC1.DAX', 'PIC2.DAX', 'PIC3.DAX', 'PIC4.DAX', 'PIC5.DAX', 'PIC6.DAX', 'PIC7.DAX']],
    ];
    for (const [dir, files] of sources) {
      for (const f of files) {
        const bytes = new Uint8Array(readFileSync(resolve(dir, f)));
        for (const b of readDaxDataBlocks(bytes)) {
          expect(parseGatewayPicPlanar5(b.raw), `${dir} ${f} block ${b.blockId}`).toBeNull();
        }
        // Dispatch stays on the pre-existing paths (these are XOR-delta animated
        // portraits) — the new PIC-stem branch must not disturb them.
        const arc = decodeDax(bytes, f.replace('.DAX', ''));
        for (const b of arc.blocks) {
          expect(
            b.kind === 'gateway-pic-planar5' || b.kind === 'gateway-pic-multiframe',
            `${dir} ${f} block ${b.blockId} must not classify as gateway-pic`,
          ).toBe(false);
        }
      }
    }
  });
});

describe('gatewayPicPlanar5ToIndexedImage — render path (full 0..31 palette)', () => {
  it.skipIf(!haveGateway)('decoded image renders through the model contract with the block’s own palette', () => {
    const blocks = loadBlocks(gatewayDir, 'PIC2.DAX');
    const parsed = parseGatewayPicPlanar5(blocks.find((x) => x.blockId === 5)!.raw);
    expect(parsed?.outcome).toBe('single-frame');
    if (parsed?.outcome !== 'single-frame') return;
    const img = gatewayPicPlanar5ToIndexedImage(parsed.picture);
    expect(img.width).toBe(88);
    expect(img.height).toBe(88);
    expect(img.transparentIndex).toBeNull();
    expect(img.encoding).toBe('dax-gateway-pic-planar5');
    // 0..15 EGA, 16..31 read from the block's own prefix. 16/17 must still come out as the
    // two independently known DAC registers — that is the rule's self-check, not a restatement.
    expect(img.palette).not.toBeNull();
    expect(img.palette!.source).toBe('dax-vga-ext');
    for (let i = 0; i <= 31; i++) expect(img.palette!.colors[i], `index ${i}`).not.toBeNull();
    expect(img.palette!.colors[16]).toEqual(GATEWAY_VGA_EXT_DAC[16]);
    expect(img.palette!.colors[17]).toEqual(GATEWAY_VGA_EXT_DAC[17]);
    // The scene genuinely uses the extended range (it is a VGA-extended picture): at
    // least one pixel above 15 must exist, and every pixel is in 0..31.
    let extended = 0;
    for (const v of img.indices) {
      expect(v).toBeLessThanOrEqual(31);
      if (v > 15) extended++;
    }
    expect(extended).toBeGreaterThan(0);
  });
});

describe('gatewayExtendedDacFromCore24 — DAC registers 18..31 (resolved 2026-08-11)', () => {
  it.skipIf(!haveGateway)('every planar5 block in the corpus yields a self-consistent palette', () => {
    let checked = 0;
    for (const file of ['PIC.DAX', 'PIC2.DAX', 'PIC3.DAX', 'PIC4.DAX', 'PIC5.DAX', 'PIC6.DAX']) {
      for (const blk of loadBlocks(gatewayDir, file)) {
        const parsed = parseGatewayPicPlanar5(blk.raw);
        if (parsed?.outcome !== 'single-frame' && parsed?.outcome !== 'multi-frame') continue;
        const pic = parsed.outcome === 'single-frame' ? parsed.picture : parsed.multi.picture;
        const ext = gatewayExtendedDacFromPicture(pic);
        // A null here means the self-check rejected the block, which is the failure mode
        // this test exists to catch.
        expect(ext, `${file} block ${blk.blockId}`).not.toBeNull();
        expect(ext!.length).toBe(16);
        checked++;
      }
    }
    expect(checked).toBe(73);
  });

  it('rejects a prefix whose nibbles do not reproduce the two known registers', () => {
    // The self-check is the whole safety property: without it the rule would happily read
    // 16 colours out of any 24 bytes. A prefix of zeroes must be refused, not decoded.
    expect(gatewayExtendedDacFromCore24(new Uint8Array(24))).toBeNull();
    expect(gatewayExtendedDacFromCore24(new Uint8Array(23))).toBeNull();
  });

  it.skipIf(!haveGateway)('a corrupted nibble in the signature makes the block fall back rather than guess', () => {
    const blocks = loadBlocks(gatewayDir, 'PIC2.DAX');
    const parsed = parseGatewayPicPlanar5(blocks.find((x) => x.blockId === 5)!.raw);
    if (parsed?.outcome !== 'single-frame') return;
    const good = gatewayExtendedPaletteFromPicture(parsed.picture);
    expect(good.source).toBe('dax-vga-ext');

    const mutated = Uint8Array.from(parsed.picture.prefix);
    mutated[mutated.length - 24] ^= 0x01; // flip one bit of register 16's red nibble
    const fallback = gatewayExtendedPaletteFromPicture({ head: parsed.picture.head, prefix: mutated });
    expect(fallback.source).toBe('dax-vga-ext-partial');
    for (let i = 18; i <= 31; i++) expect(fallback.colors[i], `index ${i}`).toBeNull();
  });
});
