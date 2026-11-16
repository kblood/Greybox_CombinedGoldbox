/**
 * GLIB drawing method `0x19` — the Amiga twin of the DOS HLIB method-25 "image-id list"
 * composite (round 35 R3).
 *
 * WHAT WAS BROKEN. `glib.ts`'s `decodeImage` ended with `return null; // 0x19 image-id list and
 * placeholders: skip`, and `walkLeaf` filed those bytes under `rawMembers` — the archive had no
 * `composites` array at all, so the Amiga side of a format the DOS side has assembled correctly
 * since 2026-08-22 produced nothing. Across the whole never-vendored WHDLoad Amiga corpus (272
 * `.TLB`/`.GLB` files, 171 GLIB-magic) exactly ONE file carries `0x19` records: Amiga DQK
 * `data/Disk3/FRAME.TLB`, with exactly 3 — against the DOS twin `DISK3/FRAME.TLB`'s 3.
 *
 * THE NULL, AND A DEFECT FOUND AND CORRECTED 2026-09-05. The plan's null for "the record layout
 * is big-endian" was the un-swapped little-endian reading of the same bytes, judged by the DOS
 * height invariant `max(destY) + height(source) === height(composite)`. Round 35 R3's first pass
 * reported that null as holding 3/3 under BOTH byte orders — "structurally incapable of
 * discriminating" — but that result was manufactured: R3's little-endian arm ALSO byte-swapped
 * `height(source)`, the height of the part's source image read from that image's OWN header
 * elsewhere in the leaf. That value is not a field of the `0x19` record at all — swapping it is
 * not "reading this record little-endian", it is an unrelated extra transform, and it is the only
 * reason the two arms agreed (every stored value here is < 256, so swapping `height(source)` too
 * makes the whole homogeneous-degree-1 relation scale-invariant by construction — but the record
 * does not contain that field, so that scale-invariance is not a fact about the record).
 *
 * Measured correctly — swapping ONLY the record's own two 16-bit fields (each part's destY, and
 * the composite's own declared height) and leaving `height(source)` unswapped — the invariant
 * DOES discriminate: **BE 3/3, LE 0/3.** See the "NULL MEASURED" test below for the corrected
 * figures. The lesson is the durable part: a null computed by byte-swapping a value the format
 * does not contain is not a null about the format.
 *
 * WHAT CARRIES THE VERDICT (unchanged by the correction, and separately sufficient on its own) is
 * the DOS twin, exactly as the plan's fallback said it would have to: read big-endian, the three
 * Amiga records reproduce the three DOS records field for field — part counts 15/8/6, source
 * pointer indices 47 / 46xN / 45, the strictly-descending destY ladders, and the single non-zero
 * destX of 3 in the middle record. Byte-swapped they reproduce none of it (28672, 26624, ... and
 * destX 768), and the declared composite height becomes 30720 rows.
 *
 * The little-endian arm is computed here by byte-swapping the parsed values rather than by
 * re-reading bytes, because an Amiga GLIB leaf is LZ77-compressed: its member bytes exist only
 * inside `decodeGlib`. A 16-bit LE read of the same two bytes IS the byte swap of the BE read for
 * the record's own fields — and doing it arithmetically keeps the test independent of the
 * decoder's internal decompression buffer. `height(source)` is deliberately NOT swapped, because
 * it is not one of those two bytes.
 *
 * External, never-vendored sources (the user's WHDLoad tree and the repo's DQK install); absent
 * => the test SKIPS rather than passing vacuously, and every arm asserts its fixture is present
 * before it asserts anything about content.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGlib, renderGlibComposite, type GlibCompositePart } from '../src/loaders/glib.js';
import { decodeHlib } from '../src/loaders/hlib.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

const AMIGA_FRAME =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/DarkQueenOfKrynn/data/Disk3/FRAME.TLB';
const DOS_FRAME = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK3', 'FRAME.TLB');

const have = existsSync(AMIGA_FRAME) && existsSync(DOS_FRAME);

/** A 16-bit LE read of the same two bytes a BE read produced `v` from. */
const swap16 = (v: number): number => ((v & 0xff) << 8) | ((v >> 8) & 0xff);

const swapPart = (p: GlibCompositePart): GlibCompositePart => ({
  sourcePtrIndex: p.sourcePtrIndex, // a byte: identical under both readings, by construction
  destY: swap16(p.destY),
  destX: swap16(p.destX),
});

describe('GLIB method-0x19 composites', () => {
  it.skipIf(!have)('parses and assembles all 3 Amiga DQK FRAME.TLB records', () => {
    // Fixture presence asserted FIRST, before any content assertion: a missing external source
    // must skip (above), never quietly satisfy the body.
    expect(existsSync(AMIGA_FRAME)).toBe(true);

    const arc = decodeGlib(new Uint8Array(readFileSync(AMIGA_FRAME)), 'FRAME.TLB');
    expect(arc.composites).toHaveLength(3);
    expect(arc.composites.map((c) => c.parts.length)).toEqual([15, 8, 6]);
    expect(arc.composites.map((c) => c.height)).toEqual([120, 63, 43]);
    expect(arc.composites.map((c) => c.ptrIndex)).toEqual([20, 21, 22]);

    // Every one assembles. `image === null` would mean a part source failed to decode.
    for (const c of arc.composites) {
      expect(c.image).not.toBeNull();
      // The height invariant, realised: the canvas the parts occupy is exactly the declared
      // height, so no part overhangs and none is missing from the bottom.
      expect(c.image!.height).toBe(c.height);
      expect(c.image!.width).toBeGreaterThan(0);
      expect(c.image!.encoding).toBe('glib-composite');
    }

    // They stay OUT of `images` (positional walk indices must not shift), and are no longer
    // filed as undecoded bytes.
    expect(arc.images.some((m) => m.label.endsWith('img020'))).toBe(false);
    expect(arc.rawMembers).toHaveLength(0);
  });

  it.skipIf(!have)(
    'NULL MEASURED CORRECTLY: the height invariant DOES separate big- from little-endian (BE 3/3, LE 0/3)',
    () => {
      expect(existsSync(AMIGA_FRAME)).toBe(true);
      const arc = decodeGlib(new Uint8Array(readFileSync(AMIGA_FRAME)), 'FRAME.TLB');

      // Source member heights, read from the archive's own decoded images. The three sources
      // these records name (leaf pointer indices 45/46/47) are 8-row tiles. `height(source)` is
      // NOT a field of the 0x19 record — it comes from a separate image header — so it is never
      // byte-swapped below; only the record's own two 16-bit fields (destY, composite height) are.
      const sourceHeight = new Map<number, number>();
      for (const m of arc.images) {
        const idx = Number(m.label.slice(m.label.length - 3));
        sourceHeight.set(idx, m.image.height);
      }

      let beHolds = 0;
      let leHolds = 0;
      for (const c of arc.composites) {
        const be = c.parts.map((p) => p.destY + (sourceHeight.get(p.sourcePtrIndex) ?? 0));
        if (Math.max(...be) === c.height) beHolds++;
        // The little-endian reading of the record's OWN fields only: destY and the composite's
        // declared height are byte-swapped (they are 16-bit fields stored in the record);
        // height(source) is left alone because the record does not store it. Swapping it too (as
        // round 35 R3's first pass did) manufactures a false 3/3-both-ways result — see the
        // corrected docblock above and in glib.ts.
        const le = c.parts.map((p) => swap16(p.destY) + (sourceHeight.get(p.sourcePtrIndex) ?? 0));
        if (Math.max(...le) === swap16(c.height)) leHolds++;
      }
      // Corrected finding, with its denominator: BE 3/3, LE 0/3. The relation is NOT
      // scale-invariant once only the record's own fields are swapped, because height(source) —
      // which the relation also adds — stays fixed while destY and the composite height each
      // scale by 256. E.g. record 1: BE 112 + 8 = 120 (== declared height 120); LE
      // swap16(112) + 8 = 28680, vs swap16(120) = 30720 (28680 !== 30720).
      expect(beHolds).toBe(3);
      expect(leHolds).toBe(0);
    },
  );

  it.skipIf(!have)(
    'the DOS twin decides it: big-endian reproduces DISK3/FRAME.TLB field for field, little-endian reproduces none of it',
    () => {
      expect(existsSync(AMIGA_FRAME)).toBe(true);
      expect(existsSync(DOS_FRAME)).toBe(true);

      const amiga = decodeGlib(new Uint8Array(readFileSync(AMIGA_FRAME)), 'FRAME.TLB');
      const dos = decodeHlib(new Uint8Array(readFileSync(DOS_FRAME)), 'FRAME.TLB');

      expect(dos.composites).toHaveLength(3);
      expect(amiga.composites).toHaveLength(3);

      // Part counts and declared heights agree across the platform boundary.
      expect(amiga.composites.map((c) => c.parts.length)).toEqual(
        dos.composites.map((c) => c.parts.length),
      );
      expect(amiga.composites.map((c) => c.height)).toEqual(dos.composites.map((c) => c.height));

      const strip = (p: { sourcePtrIndex: number; destY: number; destX: number }) => ({
        sourcePtrIndex: p.sourcePtrIndex,
        destY: p.destY,
        destX: p.destX,
      });

      let beMatches = 0;
      let leMatches = 0;
      for (let i = 0; i < 3; i++) {
        const want = dos.composites[i]!.parts.map(strip);
        const be = amiga.composites[i]!.parts.map(strip);
        const le = amiga.composites[i]!.parts.map(swapPart).map(strip);
        if (JSON.stringify(be) === JSON.stringify(want)) beMatches++;
        if (JSON.stringify(le) === JSON.stringify(want)) leMatches++;
      }
      expect(beMatches).toBe(3);
      expect(leMatches).toBe(0);

      // The lone informative field: 70 of the DOS corpus's 71 parts sit at destX 0, and the one
      // that does not is in this file's middle record. It survives the crossing at 3, not 768.
      const beX = amiga.composites.flatMap((c) => c.parts.map((p) => p.destX)).filter((x) => x !== 0);
      expect(beX).toEqual([3]);
      const leX = amiga.composites
        .flatMap((c) => c.parts.map((p) => swap16(p.destX)))
        .filter((x) => x !== 0);
      expect(leX).toEqual([768]);
    },
  );

  /**
   * CORRECTED 2026-09-05 (round 35 R3 defect #2). This test used to call `renderGlibComposite`
   * with the on-disk (still LZ77-compressed) file bytes as if they were a decompressed leaf, and
   * a real composite whose `sourcePtrIndex`es (45/46/47) are comfortably inside that raw buffer's
   * own 49-entry top-level pointer table. The range guard
   * (`if (i < 0 || i + 1 >= hdr.ptrs.length) return null`) never engaged — `null` came back
   * because `decodeImage` failed to parse the (wrong, still-compressed) bytes it was pointed at,
   * a completely different code path. Mutation-tested: deleting the range-guard line left this
   * test GREEN (see the mutation evidence in the handoff). A test that cannot fail the way it
   * claims is not evidence — see `goldbox-probe-must-be-able-to-fail`.
   *
   * The replacement below builds a minimal, self-contained (no external fixture) two-pointer
   * GLIB leaf by hand: pointer 0 bounds a real, valid 1x1 opaque image (13 bytes); pointer 1 is
   * the trailing EOF-sentinel entry — a real pointer VALUE, but with no `ptrs[2]` after it to
   * bound a region. A composite part naming `sourcePtrIndex: 1` is exactly the case the guard
   * exists for: there is no pointer pair to read a region from. The buffer deliberately carries
   * more bytes after the sentinel offset that decode as a second, "phantom" valid image — data
   * that exists only because the test put it there, standing in for whatever garbage or unrelated
   * content follows a leaf's declared extent in a real file. Without the guard, `renderGlibComposite`
   * reads through the sentinel into that phantom region and returns a non-null image assembled
   * from it (a "half-drawn picture" from content outside the leaf's declared bounds); with the
   * guard, it refuses before ever calling `decodeImage` for that part.
   */
  it('renderGlibComposite refuses a part whose sourcePtrIndex has no ptrs[i+1] to bound it', () => {
    // Header: 'GLIB', fsize (unused by renderGlibComposite), count-1=1 (2 pointers), method,
    // magic, tag 'TILE', then 2 big-endian uint32 pointers.
    const buf = new Uint8Array(50);
    const dv = new DataView(buf.buffer);
    buf.set([0x47, 0x4c, 0x49, 0x42], 0); // 'GLIB'
    dv.setUint32(4, buf.length, false); // fsize
    dv.setUint16(8, 1, false); // stored count-1 => 2 pointers
    buf[10] = 0; // method (irrelevant here — leafBytes is already "decompressed")
    buf[11] = 0; // magic
    buf.set([0x54, 0x49, 0x4c, 0x45], 12); // 'TILE'
    dv.setUint32(16, 24, false); // ptrs[0]: real image start
    dv.setUint32(20, 37, false); // ptrs[1]: EOF sentinel (= real image end, no ptrs[2] follows)

    // Real image at [24, 37): 8-byte header + 5-byte opaque body (height=1, wb=1, dm=0xE0 -> 5
    // planes x 1x1 = 5 bytes).
    dv.setUint16(24, 1, false); // height
    buf[30] = 1; // wb
    buf[31] = 0xe0; // dm: raw opaque, 5 planes
    // bytes 32..36 (5-byte body) left as zero — a valid, if blank, opaque image.

    // Phantom "image" at [37, 50): same shape, placed only so a missing guard would read it.
    dv.setUint16(37, 1, false); // height
    buf[43] = 1; // wb
    buf[44] = 0xe0; // dm: raw opaque, 5 planes
    // bytes 45..49 (5-byte body) left as zero.

    const composite = {
      leafLabel: '',
      ptrIndex: 0,
      height: 1,
      widthByte: 1,
      parts: [{ sourcePtrIndex: 1, destY: 0, destX: 0 }],
    };

    expect(renderGlibComposite(buf, composite, null)).toBeNull();
  });
});
