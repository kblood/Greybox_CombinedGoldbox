/**
 * P3.1 Savage Frontier VGA archive contract — resolving the file families flagged
 * "not tested against either format" by `dax-vga-picture.test.ts` / the research doc's
 * "Open items": `PIC*.DAX`, `CPIC*.DAX`, `CBODY.DAX`, `CHEAD.DAX`, `COMSPR.DAX`, plus
 * `BODY.DAX` and `DUNGCOM.DAX` (equally untested, found while surveying the corpus).
 *
 * Method (same as `dax-vga-picture.test.ts` and the leaf's own prior history): decode
 * every real retail block under each candidate format's exact byte-count formula, keep
 * only zero-slop matches, then decode -> re-encode and require a byte-for-byte match
 * against the ORIGINAL retail bytes as the parity proof (no independent reference
 * renderer exists for either format here). See
 * docs/engine/research/gateway-vga-picture-format.md for the full per-family writeup.
 *
 * Real-bytes-gated: every test below reads either the user's local Gateway to the
 * Savage Frontier GOG install or this repo's committed `Champions of Krynn/` DAX files
 * (used as plain-EGA baseline / negative controls, same convention as
 * `dax-vga-picture.test.ts`). No synthetic-only substitute.
 *
 * PIC*.DAX addendum (2026-07-17, research doc "Part 6"): the byte BOUNDARIES of every
 * `PIC*.DAX` frame are now provably exact (a header field predicts frame 0's pixel-
 * region size + trailer length for all 73/74 single-frame blocks with zero exceptions;
 * the one multi-frame block's frame-boundary stride is also known exactly).
 *
 * PIC*.DAX addendum 2 (2026-07-22, research doc "Part 17"): the pixel packing inside
 * those exact boundaries is now SOLVED — the "trailer" is really a PREFIX between the
 * frame header and the pixels, and each row is 5 consecutive 1-bit planes — proven
 * byte-exactly against a live-captured loader output buffer. The engine decoder and its
 * oracle golden live in `daxVgaPicture.ts` / `dax-gateway-pic-planar5.test.ts`; the
 * tests below keep pinning the (still-true) boundary arithmetic and the honest negative
 * facts from the earlier passes.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodeDax, readDaxDataBlocks } from '../src/loaders/dax.js';
import {
  parseVgaExtendedPicture,
  encodeVgaExtendedPicture,
  parseGatewayPicStructureRecord,
  encodeGatewayPicStructureRecord,
  gatewayExtendedDacFromCore24,
  GATEWAY_VGA_EXT_DAC,
} from '../src/loaders/daxVgaPicture.js';

const repoRoot = resolve(__dirname, '..', '..', '..');
const gatewayDir = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const cokDir = resolve(repoRoot, 'Champions of Krynn');

const haveGateway = existsSync(resolve(gatewayDir, 'CBODY.DAX'));

function loadBlocks(dir: string, file: string) {
  const bytes = new Uint8Array(readFileSync(resolve(dir, file)));
  return readDaxDataBlocks(bytes);
}

/**
 * Re-encode a plain-EGA standard frame or fixed-size item array (17-byte header, 2
 * px/byte chunky nibbles, HIGH nibble = left pixel) back to raw bytes — the same
 * packing `dax.ts`'s `expandIndices` reads, inverted. Used purely as this family's
 * parity proof (mirrors `encodeVgaExtendedPicture`'s role for the VGA format).
 */
function encodeEgaItemArray(
  width: number,
  height: number,
  xOff: number,
  yOff: number,
  itemCount: number,
  itemsIndices: Uint8Array[],
): Uint8Array {
  const rowBytes = width / 2;
  const itemBytes = rowBytes * height;
  const out = new Uint8Array(17 + itemCount * itemBytes);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, height, true);
  dv.setUint16(2, width / 8, true);
  dv.setUint16(4, yOff, true);
  dv.setUint16(6, xOff, true);
  out[8] = itemCount;
  for (let i = 0; i < itemCount; i++) {
    const indices = itemsIndices[i];
    const base = 17 + i * itemBytes;
    for (let y = 0; y < height; y++) {
      for (let xb = 0; xb < rowBytes; xb++) {
        const hi = indices[y * width + 2 * xb] & 0x0f;
        const lo = indices[y * width + 2 * xb + 1] & 0x0f;
        out[base + y * rowBytes + xb] = (hi << 4) | lo;
      }
    }
  }
  return out;
}

function assertEgaRoundTrip(blockId: number, raw: Uint8Array, img: { width: number; height: number; xOffset: number; yOffset: number; indices: Uint8Array }, itemCount: number, allIndices: Uint8Array[]) {
  const reenc = encodeEgaItemArray(img.width, img.height, img.xOffset, img.yOffset, itemCount, allIndices);
  expect(reenc.byteLength, `block ${blockId} length`).toBe(raw.byteLength);
  expect(reenc.subarray(0, 9), `block ${blockId} header[0..9)`).toEqual(raw.subarray(0, 9));
  expect(reenc.subarray(17), `block ${blockId} pixels[17..)`).toEqual(raw.subarray(17));
}

// ---------------------------------------------------------------------------------
// RESOLVED to plain EGA (dax.ts's existing decoder) — zero slop, exact round-trip.
// ---------------------------------------------------------------------------------

describe('Gateway CBODY.DAX / CHEAD.DAX — resolved: plain EGA, not VGA-extended', () => {
  it.skipIf(!haveGateway)('CBODY.DAX: all 128 blocks are exact-fit single-frame plain EGA and round-trip losslessly', () => {
    const bytes = new Uint8Array(readFileSync(resolve(gatewayDir, 'CBODY.DAX')));
    const arc = decodeDax(bytes, 'CBODY');
    expect(arc.blocks.length).toBe(128);
    for (const b of arc.blocks) {
      expect(b.kind, `block ${b.blockId}`).toBe('frame');
      expect(b.image, `block ${b.blockId}`).not.toBeNull();
      // Every block is 24x24 => 17 + 24*24/2 = 305 bytes exactly (verified across the
      // whole file): this is the SAME geometry Gateway's own CPIC*.DAX uses in the
      // VGA-extended 410-byte form (17 + 24*(12+3) + 33), proving CBODY genuinely omits
      // the extension plane + trailer rather than merely happening to look small.
      expect(b.raw.byteLength).toBe(305);
      assertEgaRoundTrip(b.blockId, b.raw, b.image!, 1, [b.image!.indices]);
      // Negative check: this block does NOT also satisfy the VGA-extended formula.
      expect(parseVgaExtendedPicture(b.raw), `block ${b.blockId} must not double-match VGA-extended`).toBeNull();
    }
  });

  it.skipIf(!haveGateway)('CHEAD.DAX: all 56 blocks are exact-fit single-frame plain EGA and round-trip losslessly', () => {
    const bytes = new Uint8Array(readFileSync(resolve(gatewayDir, 'CHEAD.DAX')));
    const arc = decodeDax(bytes, 'CHEAD');
    expect(arc.blocks.length).toBe(56);
    for (const b of arc.blocks) {
      expect(b.kind, `block ${b.blockId}`).toBe('frame');
      expect(b.image, `block ${b.blockId}`).not.toBeNull();
      assertEgaRoundTrip(b.blockId, b.raw, b.image!, 1, [b.image!.indices]);
      expect(parseVgaExtendedPicture(b.raw), `block ${b.blockId} must not double-match VGA-extended`).toBeNull();
    }
  });
});

describe('Gateway DUNGCOM.DAX — resolved: plain EGA tileset (untested by the original leaf; equally EGA)', () => {
  it.skipIf(!haveGateway)('DUNGCOM.DAX: single block is the exact-fit 25-tile EGA tileset, round-trips losslessly', () => {
    const bytes = new Uint8Array(readFileSync(resolve(gatewayDir, 'DUNGCOM.DAX')));
    const arc = decodeDax(bytes, 'DUNGCOM');
    expect(arc.blocks.length).toBe(1);
    const b = arc.blocks[0];
    expect(b.kind).toBe('tileset');
    const frames = b.frames!;
    expect(frames.length).toBe(25);
    expect(frames[0].width).toBe(24);
    expect(frames[0].height).toBe(24);
    // Same 17 + count*tileBytes formula CoK's own DUNGCOM.DAX uses (7217 bytes, 25 tiles).
    expect(b.raw.byteLength).toBe(7217);
    const reenc = encodeEgaItemArray(
      frames[0].width, frames[0].height, frames[0].xOffset, frames[0].yOffset,
      frames.length, frames.map((f) => f.indices),
    );
    expect(reenc.byteLength).toBe(b.raw.byteLength);
    expect(reenc.subarray(0, 9)).toEqual(b.raw.subarray(0, 9));
    expect(reenc.subarray(17)).toEqual(b.raw.subarray(17));
  });
});

describe('Gateway COMSPR.DAX — resolved: 26 plain-EGA sprites + 2 pixel-less structure records', () => {
  it.skipIf(!haveGateway)('COMSPR.DAX: 26 of 28 blocks are exact-fit plain EGA and round-trip losslessly', () => {
    const bytes = new Uint8Array(readFileSync(resolve(gatewayDir, 'COMSPR.DAX')));
    const arc = decodeDax(bytes, 'COMSPR');
    expect(arc.blocks.length).toBe(28);
    let egaCount = 0;
    for (const b of arc.blocks) {
      if (b.kind !== 'frame') continue;
      egaCount++;
      assertEgaRoundTrip(b.blockId, b.raw, b.image!, 1, [b.image!.indices]);
    }
    expect(egaCount).toBe(26);
  });

  // Blocks 254/255 — RESOLVED 2026-07-23 (research doc Part 19): pixel-less planar5
  // STRUCTURE RECORDS. Zero geometry (height=0, width_div8=0 → zero pixel bytes), the
  // 0x01 pad/count byte, a Part 18 category byte, then the exact category-gated component
  // stream ([comp8][comp16][core24] for 0x0f = 254, [comp16][core24] for 0x0e = 255) —
  // zero slop. Static disassembly of retail GAME.OVR proved the boot preloader loads
  // them into dedicated globals (id 0xFF → DS:0x53F8 at +0x11751, id 0xFE → DS:0x53FC at
  // +0x11773) and each has exactly one consumer, "drawing" the record via the standard
  // draw-image primitive 0x149:0x43 gated on video mode == 3 (VGA): 255 after the
  // exploration area-view draw (+0x41E6A), 254 after the 3D dungeon-view draw (+0x48410).
  // Component MEANINGS remain unidentified, exactly as Part 18 records for the PIC prefix.
  it.skipIf(!haveGateway)('COMSPR.DAX: blocks 254/255 parse as pixel-less structure records with the Part 18 component signatures and round-trip losslessly', () => {
    const bytes = new Uint8Array(readFileSync(resolve(gatewayDir, 'COMSPR.DAX')));
    const arc = decodeDax(bytes, 'COMSPR');
    const expected: Record<number, { category: number; length: number }> = {
      254: { category: 0x0f, length: 58 },
      255: { category: 0x0e, length: 50 },
    };
    for (const [idStr, exp] of Object.entries(expected)) {
      const id = Number(idStr);
      const b = arc.blocks.find((x) => x.blockId === id)!;
      expect(b, `block ${id} should exist`).toBeDefined();
      expect(b.raw.byteLength, `block ${id} length`).toBe(exp.length);
      // decodeDax dispatch: typed structure-record classification, image null by design.
      expect(b.kind, `block ${id} kind`).toBe('gateway-structure-record');
      expect(b.image).toBeNull();
      expect(b.structure).toBeDefined();
      const rec = b.structure!;
      expect(rec.category, `block ${id} category`).toBe(exp.category);
      // Component shapes per the Part 18 grammar (exact fit, zero slop).
      expect(rec.comp8?.byteLength ?? null).toBe(exp.category === 0x0f ? 8 : null);
      expect(rec.comp16!.byteLength).toBe(16);
      expect(rec.core24.byteLength).toBe(24);
      // Part 18 signatures: comp16[8] === 0x7e (57/60 PIC specimens carry it too) and
      // core24's first-6 low nibbles are the constant f c 4 f 9 4 (73/73 in PIC).
      expect(rec.comp16![8], `block ${id} comp16[8]`).toBe(0x7e);
      expect(
        Array.from(rec.core24.subarray(0, 6)).map((v) => v & 0x0f),
        `block ${id} core24 low-nibble signature`,
      ).toEqual([0xf, 0xc, 0x4, 0xf, 0x9, 0x4]);
      // Lossless round-trip to the exact retail bytes.
      expect(encodeGatewayPicStructureRecord(rec)).toEqual(b.raw);
      // Still (correctly) rejected by the pixel-picture decoder — no image was invented.
      expect(parseVgaExtendedPicture(b.raw), `block ${id}`).toBeNull();
    }
    // Block 255's comp16 opens on the EXACT identity nibble permutation (Part 18's
    // constant); 254's varies in exactly one nibble (entry 13 → 0) — pinned as data.
    const rec255 = arc.blocks.find((x) => x.blockId === 255)!.structure!;
    expect(Array.from(rec255.comp16!.subarray(0, 8))).toEqual([
      0x10, 0x32, 0x54, 0x76, 0x98, 0xba, 0xdc, 0xfe,
    ]);
  });

  // Part 22 (2026-08-11): the two structure records carry real extended palettes.
  //
  // Part 19 closed these blocks' STRUCTURE and their consumers (255 → the exploration/area
  // view, 254 → the 3D dungeon viewport, both VGA-gated) but left the component MEANINGS
  // open, recording one lead: "if 0x149:0x43's structure-apply programs extended DAC
  // registers, these two records are the register 18..31 RGB SOURCE for the main play
  // screens". Part 21 then solved core24 for pictures. Applying that rule here settles the
  // lead statically — no live DAC capture needed. The self-check is what makes this a
  // result rather than a reinterpretation: registers 16/17 were proven independently from
  // GAME.OVR's INT10 AX=1010h writes, and both records reproduce them exactly.
  it.skipIf(!haveGateway)('COMSPR.DAX: both structure records decode to a valid extended DAC palette, one per play screen', () => {
    const arc = decodeDax(new Uint8Array(readFileSync(resolve(gatewayDir, 'COMSPR.DAX'))));
    const palettes = new Map<number, ReturnType<typeof gatewayExtendedDacFromCore24>>();
    for (const id of [254, 255]) {
      const rec = arc.blocks.find((x) => x.blockId === id)!.structure!;
      const dac = gatewayExtendedDacFromCore24(rec.core24);
      expect(dac, `block ${id} core24 fails the registers-16/17 self-check`).not.toBeNull();
      expect(dac!.length).toBe(16); // registers 16..31
      expect(dac![0]).toEqual(GATEWAY_VGA_EXT_DAC[16]);
      expect(dac![1]).toEqual(GATEWAY_VGA_EXT_DAC[17]);
      palettes.set(id, dac);
    }
    // Two DIFFERENT palettes, which is the whole point: each play screen gets its own
    // registers 18..31. If these ever compare equal, the per-screen reading is wrong.
    expect(palettes.get(254)).not.toEqual(palettes.get(255));
    // The exploration view (255) and the 3D view (254) disagree on register 31 in
    // particular — 255 uses a near-black blue, 254 a near-white. Pinned as retail data.
    expect(palettes.get(255)![15]).toEqual({ r: 0, g: 0, b: 97 });
    expect(palettes.get(254)![15]).toEqual({ r: 227, g: 227, b: 227 });
  });

  // Negative control: no other title ships structure records — every CoK and DoK
  // COMSPR block has nonzero geometry and must NOT satisfy the strict gate. (A
  // 547-file / 7,683-block sweep across all nine installed titles matched only
  // Gateway's two blocks; the committed repo corpora pin that here.)
  it('CoK/DoK COMSPR.DAX: no block parses as a structure record', () => {
    for (const dir of [cokDir, resolve(repoRoot, 'Death Knights of Krynn')]) {
      if (!existsSync(resolve(dir, 'COMSPR.DAX'))) continue;
      for (const b of loadBlocks(dir, 'COMSPR.DAX')) {
        expect(parseGatewayPicStructureRecord(b.raw), `${dir} block ${b.blockId}`).toBeNull();
      }
    }
  });
});

// ---------------------------------------------------------------------------------
// RESOLVED to the VGA-extended format (daxVgaPicture.ts) — zero slop, exact round-trip.
// ---------------------------------------------------------------------------------

describe('Gateway BODY.DAX / CPIC2..6.DAX — resolved: VGA-extended, not plain EGA', () => {
  it.skipIf(!haveGateway)('BODY.DAX: all 13 blocks match the VGA-extended formula exactly and round-trip losslessly', () => {
    const blocks = loadBlocks(gatewayDir, 'BODY.DAX');
    expect(blocks.length).toBe(13);
    for (const blk of blocks) {
      const pic = parseVgaExtendedPicture(blk.raw);
      expect(pic, `block ${blk.blockId}`).not.toBeNull();
      // Retail geometry: 88x48 single-item body-art frames (11*8=88 wide).
      expect(pic!.width).toBe(88);
      expect(pic!.height).toBe(48);
      const reencoded = encodeVgaExtendedPicture(pic!);
      expect(reencoded).toEqual(blk.raw);
    }
  });

  it.skipIf(!haveGateway)('CPIC2.DAX..CPIC6.DAX: every block (154 total) matches the VGA-extended formula exactly and round-trips losslessly', () => {
    const files = ['CPIC2.DAX', 'CPIC3.DAX', 'CPIC4.DAX', 'CPIC5.DAX', 'CPIC6.DAX'];
    let total = 0;
    for (const f of files) {
      const blocks = loadBlocks(gatewayDir, f);
      expect(blocks.length, f).toBeGreaterThan(0);
      for (const blk of blocks) {
        total++;
        const pic = parseVgaExtendedPicture(blk.raw);
        expect(pic, `${f} block ${blk.blockId}`).not.toBeNull();
        const reencoded = encodeVgaExtendedPicture(pic!);
        expect(reencoded, `${f} block ${blk.blockId}`).toEqual(blk.raw);
      }
    }
    expect(total).toBe(154);
  });

  it.skipIf(!haveGateway)('CPIC2 block 68 decodes as the native Giant Squid planar image', () => {
    const block = loadBlocks(gatewayDir, 'CPIC2.DAX').find((entry) => entry.blockId === 68)!;
    const pic = parseVgaExtendedPicture(block.raw)!;
    expect([pic.width, pic.height]).toEqual([48, 48]);
    const counts = new Map<number, number>();
    for (const index of pic.indices) counts.set(index, (counts.get(index) ?? 0) + 1);
    // Byte-level native oracle: the t=150 expanded CPIC buffer paired with frame t0128 uses
    // exactly these dominant Giant Squid indices. The former interleaved-nibble decode emitted
    // all 32 indices as noise and cannot satisfy this signature.
    expect(counts.get(0)).toBe(897);
    expect(counts.get(8)).toBe(436);
    expect(counts.get(12)).toBe(216);
    expect(counts.get(28)).toBe(228);
    expect(counts.get(29)).toBe(116);
  });

  it('negative control: CoK has no CPIC-family file that accidentally matches VGA-extended', () => {
    // CoK ships CPIC1..3.DAX (fewer, different naming range than Gateway's CPIC2..6) —
    // confirm they decode as plain EGA 'frame' blocks and never satisfy the VGA formula,
    // so detection above isn't an artifact of the CPIC* filename itself.
    for (const f of ['CPIC1.DAX', 'CPIC2.DAX', 'CPIC3.DAX']) {
      const bytes = new Uint8Array(readFileSync(resolve(cokDir, f)));
      const arc = decodeDax(bytes, f.replace('.DAX', ''));
      for (const b of arc.blocks) {
        expect(b.kind, `CoK ${f} block ${b.blockId}`).toBe('frame');
        expect(parseVgaExtendedPicture(b.raw), `CoK ${f} block ${b.blockId}`).toBeNull();
      }
    }
  });
});

// ---------------------------------------------------------------------------------
// PIC*.DAX — a genuinely distinct third packing. The tests here pin the byte-boundary
// facts from Parts 3/6/8 (all still true) and that neither of the two EARLIER decoders
// accepts these blocks. The packing itself is SOLVED as of Part 17 (2026-07-22) and
// decoded by `parseGatewayPicPlanar5` — see `dax-gateway-pic-planar5.test.ts` for the
// oracle golden, corpus round-trip, and dispatch tests.
// ---------------------------------------------------------------------------------

describe('Gateway PIC.DAX / PIC2..6.DAX — a third packing, distinct from both earlier formats (solved separately, Part 17)', () => {
  const files = ['PIC.DAX', 'PIC2.DAX', 'PIC3.DAX', 'PIC4.DAX', 'PIC5.DAX', 'PIC6.DAX'];

  it.skipIf(!haveGateway)('every block fails BOTH earlier decoders outright (neither plain-EGA-animated nor single-frame VGA-extended accepts it)', () => {
    let total = 0;
    let egaAnimated = 0;
    for (const f of files) {
      const bytes = new Uint8Array(readFileSync(resolve(gatewayDir, f)));
      const arc = decodeDax(bytes, f.replace('.DAX', ''));
      const blocks = loadBlocks(gatewayDir, f);
      total += arc.blocks.length;
      for (const b of arc.blocks) {
        if (b.kind === 'animated') egaAnimated++;
        // The single-frame VGA-extended parser never matches either (these blocks use
        // an animation-style numFrames prefix, not the item_count===1 standard header).
        const raw = blocks.find((x) => x.blockId === b.blockId)!.raw;
        expect(parseVgaExtendedPicture(raw), `${f} block ${b.blockId}`).toBeNull();
      }
    }
    // Exactly 1 block in the whole 74-block corpus fits the plain-EGA animated
    // exact-consume check outright: PIC3.DAX block 2 (3894 bytes) — plain EGA with NO
    // extension plane, at a DIFFERENT byte count than the 4895-byte majority (see the
    // next test). Everything else now decodes via the Part 17/18 planar5 decoder (see
    // dax-gateway-pic-planar5.test.ts), including the one multi-frame block (solved
    // Part 18: full planar5 XOR-delta tail frames under 14-byte headers).
    expect(total).toBe(74);
    expect(egaAnimated).toBe(1);
  });

  it.skipIf(!haveGateway)('documented partial characterization: shared header shape, mostly single-frame, constant 88x88 geometry, but no zero-slop trailer formula', () => {
    // Facts established by direct byte inspection (see research doc):
    //  - Every block starts with a 1-byte "numFrames" count, exactly like dax.ts's
    //    existing plain-EGA `parseAnimatedPicture` container (`ANIM_FRAME_HEADER`=21
    //    bytes/frame: u32 delay, u16 height, u16 width/8, u16 x, u16 y, u8[8] field).
    //  - numFrames is 1 for 73 of 74 blocks; exactly one block (PIC.DAX id 29) has
    //    numFrames=6.
    //  - For every numFrames=1 block, frame 0's header decodes to height=88, width8=11
    //    (88x88) with ZERO exceptions — this part is exact and reproducible.
    //  - Interpreting frame 0's pixel region under the SAME interleaved 4bpp+1bpp
    //    row-packing rule daxVgaPicture.ts uses consumes EXACTLY 88*(11*4+11) = 4840
    //    bytes with zero slop for every one of those blocks.
    //  - What follows that 4840-byte region is NOT a fixed length: across PIC.DAX's 16
    //    numFrames=1 blocks, 14 end with exactly 33 trailing bytes (matching the
    //    VGA_PICTURE_TRAILER_LEN constant proven for TITLE.DAX/BIGPIC1.DAX) and 2 end
    //    with exactly 17 trailing bytes — no bit in the shared header (including the
    //    8-byte field_9) was found to predict which. PIC3.DAX additionally has 2 blocks
    //    ending with 41 trailing bytes, and ONE block (id 2, 3894 bytes total) that is
    //    968 bytes SHORT of the 4840-byte VGA-extended pixel region entirely — but
    //    matches EXACTLY (zero slop) if frame 0 is instead read as PLAIN (non-extended)
    //    EGA pixels (88*11*4 = 3872 bytes: 1+21+3872 = 3894). So this family may mix
    //    plain-EGA and VGA-extended pixel encodings within the same animation-header
    //    container, selected by a criterion not identified in this pass.
    //  - The one true multi-frame block (numFrames=6, PIC.DAX id 29) does not reconcile
    //    at either the 4840-byte (VGA-extended) or 3872-byte (plain EGA) per-frame pixel
    //    stride once frame 1's header is read at the resulting offset (garbage values),
    //    so whatever governs frame boundaries in a genuine multi-frame block is also
    //    unresolved.
    // No formula here reconciles the WHOLE corpus with zero slop, so per this project's
    // "UNLOCATED beats invention" ethic (docs/engine/HANDOFF.md §5) this family is left
    // OPEN rather than force-fit to either known format or a guessed third one. This
    // test only pins the reproducible sub-facts above as real, checkable assertions —
    // it does NOT claim the format is solved.
    const bytes = new Uint8Array(readFileSync(resolve(gatewayDir, 'PIC.DAX')));
    const blocks = readDaxDataBlocks(bytes);
    let numFrames1 = 0;
    let numFrames6 = 0;
    let trailer33 = 0;
    let trailer17 = 0;
    for (const b of blocks) {
      const raw = b.raw;
      const numFrames = raw[0];
      if (numFrames === 1) {
        numFrames1++;
        const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        const height = dv.getUint16(5, true);
        const width8 = dv.getUint16(7, true);
        expect(height, `block ${b.blockId} height`).toBe(88);
        expect(width8, `block ${b.blockId} width8`).toBe(11);
        const remain = raw.byteLength - (1 + 21 + 4840);
        if (remain === 33) trailer33++;
        else if (remain === 17) trailer17++;
      } else if (numFrames === 6) {
        numFrames6++;
      }
    }
    expect(numFrames1).toBe(16); // 17 total blocks in PIC.DAX - the one numFrames=6 block
    expect(numFrames6).toBe(1);
    expect(trailer33).toBe(14);
    expect(trailer17).toBe(2); // the 2-of-16 minority that don't match the 33-byte trailer seen elsewhere
  });

  // -------------------------------------------------------------------------------
  // 2026-07-17 follow-up ("Part 6" in the research doc): a header field EXACTLY
  // predicts frame 0's pixel-encoding + trailer length, across the FULL 6-file corpus
  // (not just PIC.DAX). This closes the byte-BOUNDARY question with zero exceptions.
  // It does NOT decode pixels -- the pixel content inside those boundaries was tested
  // against 7 packing hypotheses (interleaved VGA-extended in both plane orders and
  // both nibble orders, two-whole-plane chunky, 4-bitplane planar row-interleaved
  // across all 24 plane/bit-position permutations, 4-bitplane planar whole-image,
  // byte-interleaved-by-column-group planar) and none produced a coherent image, so no
  // decode/round-trip is asserted here. See the research doc's Part 6 for the full
  // derivation and the ruled-out hypotheses.
  // -------------------------------------------------------------------------------
  it.skipIf(!haveGateway)('byte-boundary predictor: a header-tail byte exactly predicts frame 0 pixel encoding + trailer length for all 73 single-frame blocks (zero exceptions, full 6-file corpus)', () => {
    const files = ['PIC.DAX', 'PIC2.DAX', 'PIC3.DAX', 'PIC4.DAX', 'PIC5.DAX', 'PIC6.DAX'];
    const counts: Record<number, number> = { 0: 0, 0x0c: 0, 0x0e: 0, 0x0f: 0 };
    let singleFrameTotal = 0;
    let multiFrameTotal = 0;
    for (const f of files) {
      const bytes = new Uint8Array(readFileSync(resolve(gatewayDir, f)));
      const blocks = readDaxDataBlocks(bytes);
      for (const b of blocks) {
        const raw = b.raw;
        const numFrames = raw[0];
        if (numFrames !== 1) {
          multiFrameTotal++;
          continue;
        }
        singleFrameTotal++;
        const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
        const height = dv.getUint16(5, true);
        const width8 = dv.getUint16(7, true);
        // The header-tail byte at absolute offset 14 (the second byte of the 9-byte
        // tail immediately preceding the pixel region at offset 22) is the proven
        // predictor. dax.ts's ANIM_FRAME_HEADER doc comment undercounts this tail by
        // one byte (it says "u8[8] field"; it is actually 9 bytes, offsets 13..21).
        const formatByte = raw[14];
        expect(counts, `block ${f}#${b.blockId} unexpected formatByte 0x${formatByte.toString(16)}`).toHaveProperty(
          String(formatByte),
        );
        counts[formatByte]++;
        const pixOffset = 22;
        let predictedTotal: number;
        if (formatByte === 0) {
          // Plain-EGA variant: no extension plane, no trailer.
          predictedTotal = pixOffset + height * width8 * 4;
        } else {
          const trailerLen = 17 + 8 * (formatByte - 12);
          const rowBytes4bpp = (width8 * 8) / 2;
          const rowBytes1bpp = Math.ceil((width8 * 8) / 8);
          predictedTotal = pixOffset + height * (rowBytes4bpp + rowBytes1bpp) + trailerLen;
        }
        expect(raw.byteLength, `${f} block ${b.blockId} (formatByte=0x${formatByte.toString(16)})`).toBe(
          predictedTotal,
        );
      }
    }
    expect(singleFrameTotal).toBe(73);
    expect(multiFrameTotal).toBe(1); // PIC.DAX id 29, the one numFrames=6 block
    expect(counts[0]).toBe(1); // plain-EGA variant (PIC3.DAX id 2)
    expect(counts[0x0c]).toBe(13); // 17-byte trailer
    expect(counts[0x0e]).toBe(57); // 33-byte trailer
    expect(counts[0x0f]).toBe(2); // 41-byte trailer
  });

  it.skipIf(!haveGateway)('multi-frame block (PIC.DAX id 29): frame-boundary stride arithmetic is exact (historical boundary proof, reinterpreted by Part 18)', () => {
    const bytes = new Uint8Array(readFileSync(resolve(gatewayDir, 'PIC.DAX')));
    const blocks = readDaxDataBlocks(bytes);
    const b = blocks.find((x) => x.blockId === 29);
    expect(b, 'PIC.DAX block 29 should exist').toBeDefined();
    const raw = b!.raw;
    expect(raw[0]).toBe(6); // numFrames
    const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

    // Frame 0 uses the single-frame formula proven above (formatByte=0x0e -> 33-byte trailer).
    expect(raw[14]).toBe(0x0e);
    const frame0Span = 21 + 4840 + 33; // header + VGA-extended pixels + 33-byte trailer
    let pos = 1 + frame0Span;

    // Frames 1..5 each use a uniform 4854-byte span. Part 6 read this as "21-byte
    // header + 4833-byte payload"; Part 18 proved the true split is a 14-byte header +
    // a FULL 4840-byte planar5 XOR delta (the 7 "header tail" zero bytes are really the
    // delta's first 7 unchanged pixel bytes) -- same 4854 total, so this boundary
    // arithmetic stands unchanged. The actual decode lives in
    // dax-gateway-pic-planar5.test.ts.
    const frameNSpan = 21 + 4833;
    for (let f = 1; f <= 5; f++) {
      const height = dv.getUint16(pos + 4, true);
      const width8 = dv.getUint16(pos + 6, true);
      const x = dv.getUint16(pos + 8, true);
      const y = dv.getUint16(pos + 10, true);
      expect(height, `frame ${f} height`).toBe(88);
      expect(width8, `frame ${f} width8`).toBe(11);
      expect(x, `frame ${f} x`).toBe(0);
      expect(y, `frame ${f} y`).toBe(0);
      pos += frameNSpan;
    }
    expect(pos, 'final position must land exactly on the block end').toBe(raw.byteLength);
  });

  // -------------------------------------------------------------------------------
  // 2026-07-21 follow-up ("Part 8" in the research doc): a full disassembly of the real
  // GAME.OVR loader (0x4687e-0x46d1f) traced a separate 59-byte "tail structure"
  // cache/reuse mechanism (0x149:0x5c parses it; 0x343:0xa3d -- a Move/memcpy primitive,
  // confirmed by its 3-arg src/dest/count push pattern -- copies a saved reference copy
  // over a non-reference frame's own copy when byte0 of the parsed structure is 4). This
  // explains Part 6(c)'s previously-unexplained "frame 1's header-tail byte1 is 0x04, a
  // value that never occurs in any numFrames=1 block": the ON-DISK tail for non-reference
  // frames is a degenerate, content-free sentinel, not real per-frame data. This test
  // pins that exact byte fact; it is still not a pixel/image decode claim.
  // -------------------------------------------------------------------------------
  it.skipIf(!haveGateway)('multi-frame block (PIC.DAX id 29): frames 1..5 carry an identical degenerate tail sentinel, not real per-frame tail data', () => {
    const bytes = new Uint8Array(readFileSync(resolve(gatewayDir, 'PIC.DAX')));
    const blocks = readDaxDataBlocks(bytes);
    const b = blocks.find((x) => x.blockId === 29);
    expect(b, 'PIC.DAX block 29 should exist').toBeDefined();
    const raw = b!.raw;

    // Frame 0's real tail: byte0=1 (constant), byte1=0x0e (the Part 6(b) predictor,
    // 33-byte-trailer category), and real, non-repeating content after that.
    const tail0 = raw.slice(1 + 12, 1 + 21);
    expect(Array.from(tail0), 'frame 0 tail').toEqual([0x01, 0x0e, 0x10, 0x32, 0x54, 0x76, 0x98, 0xba, 0xdc]);

    // Frames 1..5 (uniform 4854-byte stride after frame 0's 4894-byte span, per the prior
    // test) each carry the SAME 9 bytes at the 21-byte-header-tail position:
    // 01 04 00 00 00 00 00 00 00. Part 18 reinterpretation: only 01 04 (pad + the 0x04
    // reuse marker) belong to the (14-byte) tail-frame header -- the 7 zero bytes are
    // the XOR delta's first 7 (unchanged) pixel bytes, which is why they are zero.
    let pos = 1 + (21 + 4840 + 33);
    for (let f = 1; f <= 5; f++) {
      const tail = raw.slice(pos + 12, pos + 21);
      expect(Array.from(tail), `frame ${f} tail`).toEqual([0x01, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      pos += 21 + 4833;
    }
  });
});
