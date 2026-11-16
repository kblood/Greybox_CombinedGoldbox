/**
 * HLIB golden-file parity test (DQK DOS VGA 256-color, Chain-4).
 *
 * For each fixture (test/fixtures/hlib/*.json — produced by make-fixtures.py from
 * tools/hlib_decode.py), run the TS decodeHlib on the SAME source .TLB, find the
 * image with the same walk label, and assert EXACT equality of width, height, the
 * 8bpp index array, AND the palette-mapped RGB against the Python decoder.
 *
 * Palette inheritance: the fixture captures the EXACT palette the Python `main`
 * used (after the `pal = pal or last_pal` chain), so we compare against the
 * fixture RGB directly. Transparent methods (21/23) store 255 as a key index;
 * Python renders 255 THROUGH the palette, so for parity we render opaque
 * (transparentIndex forced null) to mirror indices_to_rgb exactly.
 *
 * Fixtures and game data are git-ignored; absent fixture or source => SKIP.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { Palette } from '../src/model/index.js';
import { decodeHlib, renderHlibComposite } from '../src/loaders/hlib.js';

/** Method 25, spelled out here so the machine-code assertion below cannot drift from the loader. */
const COMPOSITE_METHOD_FOR_TEST = 25;
import { indexedToRGBA } from '../src/render/rgba.js';
import { monchaRLE } from '../src/util/rle.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'hlib');
const REPO_ROOT = resolve(__dirname, '..', '..', '..'); // packages/engine/test/../../.. = repo root

interface Fixture {
  file: string;
  stem: string;
  label: string;
  width: number;
  height: number;
  drawMethod: number;
  indices: number[];
  rgb: number[];
}

function listFixtures(): string[] {
  if (!existsSync(FIXTURE_DIR)) return [];
  return readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.json'));
}

const fixtures = listFixtures();

describe('HLIB golden parity (TS decodeHlib vs Python hlib_decode)', () => {
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
    const label = `${fixture.stem} ${fixture.label} (${fixture.width}x${fixture.height}, method ${fixture.drawMethod})`;

    if (!existsSync(srcPath)) {
      it.skip(`${label} — source TLB missing: ${fixture.file}`, () => {
        /* skipped */
      });
      continue;
    }

    it(`${label} matches the Python decode exactly`, () => {
      const bytes = new Uint8Array(readFileSync(srcPath));
      const archive = decodeHlib(bytes, fixture.stem);
      const member = archive.images.find((m) => m.label === fixture.label);

      expect(member, `image ${fixture.label} should decode`).toBeDefined();
      if (!member) return;
      const image = member.image;

      expect(image.width).toBe(fixture.width);
      expect(image.height).toBe(fixture.height);
      expect(member.drawMethod).toBe(fixture.drawMethod);
      expect(image.indices.length).toBe(fixture.width * fixture.height);

      // Exact 8bpp index parity.
      expect(Array.from(image.indices)).toEqual(fixture.indices);

      // RGB parity vs Python indices_to_rgb: render opaque so 255 maps through
      // the palette exactly as the Python oracle does (no alpha keying).
      const opaque = { ...image, transparentIndex: null };
      const rgba = indexedToRGBA(opaque);
      const px = fixture.width * fixture.height;
      let mismatch = -1;
      for (let p = 0; p < px; p++) {
        const o = p * 4;
        if (
          rgba[o] !== fixture.rgb[p * 3] ||
          rgba[o + 1] !== fixture.rgb[p * 3 + 1] ||
          rgba[o + 2] !== fixture.rgb[p * 3 + 2]
        ) {
          mismatch = p;
          break;
        }
      }
      expect(mismatch, `RGB mismatch at pixel ${mismatch}`).toBe(-1);
    });
  }
});

/**
 * Mid-leaf colour tables (`extraPalettes`).
 *
 * DQK's `DISK3/FRAME.TLB` carries FIVE 16-colour tables for palette slots 16..31, not one: the
 * leading one at ptr[0] and four more at ptrs 41..44. Only the first was ever read. The other four
 * went to `decodeImage`, which read their cmagic byte as a drawing method, did not recognise it and
 * returned null — so four distinct alternate frame palettes were dropped with no diagnostic.
 */
describe('HLIB mid-leaf colour tables', () => {
  const framePath = resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK3', 'FRAME.TLB');

  it.skipIf(!existsSync(framePath))('recovers FRAME.TLB’s four extra 16-colour tables', async () => {
    const arc = decodeHlib(new Uint8Array(await readFile(framePath)), 'FRAME.TLB');
    expect(arc.extraPalettes.map((p) => p.ptrIndex)).toEqual([41, 42, 43, 44]);
    for (const e of arc.extraPalettes) {
      expect(e.cmagic).toBe(0x18); // 24 — a cmagic, never a drawing method
      expect(e.palette.firstColor).toBe(16);
      expect(e.palette.count).toBe(16);
      // Every slot in 16..31 is defined; nothing outside it is touched.
      for (let i = 16; i < 32; i++) expect(e.palette.colors[i]).not.toBeNull();
      expect(e.palette.colors[15]).toBeNull();
      expect(e.palette.colors[32]).toBeNull();
    }
  });

  it.skipIf(!existsSync(framePath))('they are four DIFFERENT palettes, and differ from the leading one', async () => {
    const arc = decodeHlib(new Uint8Array(await readFile(framePath)), 'FRAME.TLB');
    const key = (cs: readonly ({ r: number; g: number; b: number } | null)[]): string =>
      cs.slice(16, 32).map((c) => (c ? `${c.r},${c.g},${c.b}` : '-')).join('|');
    const keys = arc.extraPalettes.map((e) => key(e.palette.colors));
    expect(new Set(keys).size).toBe(4); // recovering the same table four times would prove nothing
    // The leading table (which the images already use) is a fifth, distinct one.
    const lead = arc.images[0]?.image.palette;
    expect(lead).toBeTruthy();
    expect(keys).not.toContain(key(lead!.colors));
    // ptr[43] is the near-twin of the leading grey table: one slot apart, which is why "distinct"
    // has to be measured rather than eyeballed.
    expect(key(lead!.colors).split('|').filter((v, i) => v !== keys[2]!.split('|')[i]).length).toBe(1);
  });

  it.skipIf(!existsSync(framePath))('does not disturb the image slots', async () => {
    const arc = decodeHlib(new Uint8Array(await readFile(framePath)), 'FRAME.TLB');
    // Those pointer regions never produced an image, so pulling them out changes no index.
    expect(arc.images.length).toBeGreaterThan(0);
    expect(arc.frameSet.frames.size).toBe(arc.images.length);
  });
});

/**
 * Drawing method 25 — the "image-id list" the spec listed as unsolved and skipped.
 *
 * The record structure is now decoded (see `HlibComposite`), the vertical composition is proven
 * exactly, and horizontal placement is deliberately left open. These slots are still not rendered,
 * so nothing downstream sees a guess; this pins the parse and the evidence for it.
 */
describe('HLIB drawing method 25 (composite slots)', () => {
  const framePath = resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK3', 'FRAME.TLB');
  const piccPath = resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK2', 'PICC.TLB');

  it.skipIf(!existsSync(framePath))('FRAME.TLB stacks three 8-row tiles into its vertical borders', async () => {
    const arc = decodeHlib(new Uint8Array(await readFile(framePath)), 'FRAME.TLB');
    expect(arc.composites.map((c) => c.ptrIndex)).toEqual([20, 21, 22]);
    const tall = arc.composites[0]!;
    expect(tall.height).toBe(120);
    expect(tall.parts.length).toBe(15);
    // A top cap, a repeated middle, a bottom cap — the ids are pointer indices in this same leaf.
    expect(tall.parts[0]!.sourcePtrIndex).toBe(47);
    expect(new Set(tall.parts.slice(1, -1).map((p) => p.sourcePtrIndex))).toEqual(new Set([46]));
    expect(tall.parts.at(-1)!.sourcePtrIndex).toBe(45);
    // Rows descend by 8 — the referenced tiles are 8 tall — and the last lands on 0.
    expect(tall.parts.map((p) => p.destY)).toEqual([112, 104, 96, 88, 80, 72, 64, 56, 48, 40, 32, 24, 16, 8, 0]);
  });

  it.skipIf(!existsSync(framePath))('every part names a real image, and the parts reproduce the height', async () => {
    const arc = decodeHlib(new Uint8Array(await readFile(framePath)), 'FRAME.TLB');
    const byPtr = new Map(arc.images.map((m) => [Number(m.label.slice(3)), m.image]));
    for (const c of arc.composites) {
      const top = c.parts.reduce((a, b) => (b.destY > a.destY ? b : a));
      const src = byPtr.get(top.sourcePtrIndex);
      expect(src, `part ${top.sourcePtrIndex} must be a decoded image`).toBeTruthy();
      // The rule that carries the whole finding: 16/16 across DQK and FRUA, against a null of 1.11.
      expect(top.destY + src!.height).toBe(c.height);
      // Strictly descending, and the count byte agreed with the record count (readComposite
      // returns null otherwise, which would have left `composites` empty).
      for (let i = 1; i < c.parts.length; i++) expect(c.parts[i]!.destY).toBeLessThan(c.parts[i - 1]!.destY);
    }
  });

  it.skipIf(!existsSync(piccPath))('PICC.TLB uses the same record as a plain alias to one picture', async () => {
    const arc = decodeHlib(new Uint8Array(await readFile(piccPath)), 'PICC.TLB');
    const aliases = arc.composites.filter((c) => c.parts.length === 1);
    expect(aliases.length).toBeGreaterThanOrEqual(4);
    for (const a of aliases) {
      expect(a.parts[0]!.destY).toBe(0);
      expect(a.parts[0]!.sourcePtrIndex).toBeGreaterThan(0);
    }
    // Four slots sharing one stored picture is the point of the alias form.
    expect(new Set(aliases.map((a) => `${a.leafBase}:${a.parts[0]!.sourcePtrIndex}`)).size).toBeLessThan(aliases.length);
  });

  it.skipIf(!existsSync(framePath))('is parsed only — composites stay out of the image list', async () => {
    const arc = decodeHlib(new Uint8Array(await readFile(framePath)), 'FRAME.TLB');
    const imageIndices = new Set(arc.images.map((m) => Number(m.label.slice(3))));
    for (const c of arc.composites) expect(imageIndices.has(c.ptrIndex)).toBe(false);
  });
});

/**
 * Method-25 width relationship, measured per PART rather than per region.
 *
 * §5a originally recorded "byte +6 is twice the source's in 14 of 16 cases and equal in the
 * other 2", which made the 2 read as exceptions to a 2× rule. They are not: per part, across
 * every record in every region, composite width is an exact integer multiple of source width,
 * and the multiple is only ever 1 or 2.
 *
 * This test pins the measurement. It deliberately does NOT assert what byte +6 *means* — an
 * exact 1×/2× ratio is predicted equally well by "a genuine canvas width" and by "a value the
 * authoring tool derived from the source width", and nothing here separates those. Horizontal
 * placement was settled elsewhere — from `DQK.EXE`, not from this ratio (see the `destX` describe
 * below) — and what byte +6 means inside a method-25 slot is STILL open.
 */
describe('HLIB method 25 — composite width vs source width', () => {
  const files = [
    { path: resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK2', 'PICC.TLB') },
    { path: resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK3', 'FRAME.TLB') },
    { path: 'C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures/DISK2/PICA.TLB' },
    { path: 'C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures/DISK2/PICD.TLB' },
    { path: 'C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures/DISK3/FRAME.TLB' },
  ];
  const have = files.every((f) => existsSync(f.path));

  it.skipIf(!have)('is an exact 1× or 2× in every part of every region, with no exceptions', async () => {
    let parts = 0;
    let regions = 0;
    const ratios = new Map<number, number>();
    const extras = new Map<number, number>();

    for (const f of files) {
      const bytes = new Uint8Array(await readFile(f.path));
      const arc = decodeHlib(bytes, f.path);
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      for (const c of arc.composites) {
        regions++;
        // Resolve each source through ITS OWN leaf's pointer table. A global label→pointer map
        // collides across sets (FRUA PICD.TLB restarts numbering in each of its 29 sets) and
        // produced a confident, wrong "non-integer ratio" reading before this was fixed.
        const leafPtrCount = dv.getUint16(c.leafBase + 8, true) + 1;
        const ptrAt = (i: number) => c.leafBase + dv.getUint32(c.leafBase + 16 + 4 * i, true);
        const compositeWidth = c.widthByte * 4;
        for (const p of c.parts) {
          expect(p.sourcePtrIndex).toBeLessThan(leafPtrCount);
          const sourceWidth = bytes[ptrAt(p.sourcePtrIndex) + 6]! * 4;
          expect(sourceWidth).toBeGreaterThan(0);
          expect(compositeWidth % sourceWidth).toBe(0);
          const r = compositeWidth / sourceWidth;
          ratios.set(r, (ratios.get(r) ?? 0) + 1);
          extras.set(p.destX, (extras.get(p.destX) ?? 0) + 1);
          parts++;
        }
      }
    }

    expect(regions).toBe(16);
    expect(parts).toBe(71);
    // The whole point: only 1 and 2 ever occur. A ratio of 3, 4 or a fraction would show here.
    expect([...ratios.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [1, 9],
      [2, 62],
    ]);
    // The trailing word is destX (SOLVED from DQK.EXE, see the destX test below). It is why this
    // ratio could never settle the question from the corpus alone: 70 of 71 parts sit at x=0, so
    // the field is almost perfectly constant and carries almost no information here.
    expect([...extras.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [0, 70],
      [3, 1],
    ]);
  });
});

/**
 * Method 25's horizontal placement — SOLVED 2026-08-22, from `DQK.EXE` rather than from the corpus.
 *
 * The corpus could not decide this and never would have: 70 of the 71 shipped records hold 0 in the
 * trailing word, so "it is destX" and "it is never read" predict identical bytes. The executable
 * distinguishes them. This test therefore asserts the *machine code*, so the claim breaks loudly if
 * the offsets were ever misread, and separately asserts the corpus behaviour that follows from it.
 */
describe('HLIB method 25 — the trailing word is destX, per DQK.EXE', () => {
  const exePath = resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DQK.EXE');

  it.skipIf(!existsSync(exePath))('the draw routine adds record +4 to X and record +2 to Y', async () => {
    const exe = new Uint8Array(await readFile(exePath));
    const hex = (at: number, n: number) =>
      [...exe.subarray(at, at + n)].map((b) => b.toString(16).padStart(2, '0')).join(' ');

    // The routine head: push bp / mov bp,sp / sub sp,0x12 / push si / push di.
    expect(hex(0x01984c, 8)).toBe('55 8b ec 83 ec 12 56 57');

    // The method-25 arm. Each 6-byte record is read into the stack buffer at [bp-0x0a], so the
    // record's word at +2 lives at [bp-0x08] and its word at +4 at [bp-0x06].
    expect(hex(0x0198b2, 5)).toBe('16 8d 46 f6 50'); //   push ss / lea ax,[bp-0x0a] / push ax
    expect(hex(0x0198ec, 3)).toBe('8b 46 08'); //          mov ax,[bp+08]   — the caller's X
    expect(hex(0x0198ef, 3)).toBe('03 46 fa'); //          add ax,[bp-06]   — + record word at +4
    expect(hex(0x0198f3, 3)).toBe('8b 46 06'); //          mov ax,[bp+06]   — the caller's Y
    expect(hex(0x0198f6, 3)).toBe('03 46 f8'); //          add ax,[bp-08]   — + record word at +2

    // …and it re-enters ITSELF: push cs (0x0e) + near call whose target is the routine head.
    expect(exe[0x0198fa]).toBe(0x0e);
    expect(exe[0x0198fb]).toBe(0xe8);
    const rel = new DataView(exe.buffer, exe.byteOffset, exe.byteLength).getInt16(0x0198fc, true);
    expect(0x0198fe + rel).toBe(0x01984c);

    // Which slot is which needs no external table, and no appeal to the corpus either. Just after
    // reading the child's own 8-byte header into [bp-0x12], the routine subtracts that header's
    // two offset fields from the same two stack slots:
    expect(hex(0x01988e, 3)).toBe('8b 46 f0'); //  mov ax,[bp-0x10]  — header +2, the y offset
    expect(hex(0x019891, 3)).toBe('29 46 06'); //  sub [bp+06],ax
    expect(hex(0x019894, 3)).toBe('8b 46 f2'); //  mov ax,[bp-0x0e]  — header +4, the x offset
    expect(hex(0x019897, 3)).toBe('29 46 08'); //  sub [bp+08],ax
    // `decodeImage` above reads exactly those two header words as yOffset (+2) and xOffset (+4),
    // so [bp+06] is the vertical axis and [bp+08] the horizontal one — and therefore the record
    // word at +4, which is added to [bp+08], is destX.

    // And this really is the method-25 arm: low nibble of the child's drawMethod compared to 9.
    expect(hex(0x01989a, 3)).toBe('8a 46 f5'); //  mov al,[bp-0x0b]  — header +7, the draw method
    expect(hex(0x01989f, 3)).toBe('25 0f 00'); //  and ax,0x000f
    expect(hex(0x0198a2, 3)).toBe('3d 09 00'); //  cmp ax,0x0009      (25 & 0x0f === 9)
    expect(COMPOSITE_METHOD_FOR_TEST & 0x0f).toBe(9);
  });

  it.skipIf(!existsSync(exePath))('NULL: the two operands are genuinely distinct stack slots', async () => {
    const exe = new Uint8Array(await readFile(exePath));
    // If this were one coordinate written twice — the failure mode that would make the reading
    // vacuous — the two `add` instructions would name the same displacement. They do not, and the
    // two `mov`s do not either. All four displacements are distinct.
    const displacements = [exe[0x0198ee]!, exe[0x0198f1]!, exe[0x0198f5]!, exe[0x0198f8]!];
    expect(new Set(displacements).size).toBe(4);
    expect(displacements).toEqual([0x08, 0xfa, 0x06, 0xf8]);
  });

  it.skipIf(!existsSync(resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK3', 'FRAME.TLB')))(
    'renderHlibComposite reproduces the declared height, and the one nonzero destX shifts its part',
    async () => {
      const p = resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK3', 'FRAME.TLB');
      const bytes = new Uint8Array(await readFile(p));
      const arc = decodeHlib(bytes, p);
      expect(arc.composites.length).toBeGreaterThan(0);

      for (const c of arc.composites) {
        const img = renderHlibComposite(bytes, c);
        expect(img, 'every shipped composite must compose').not.toBeNull();
        // destY is exact (16/16 in the describe above), so the composed height IS the declared one.
        expect(img!.height).toBe(c.height);
        // The composed width is max(destX + sourceWidth) — the honest consequence of the solve,
        // not a canvas size guessed from the header byte at +6.
        expect(img!.width).toBeGreaterThanOrEqual(Math.max(...c.parts.map((q) => q.destX)) + 1);
        // Composing must not leave the canvas untouched.
        expect(img!.indices.some((v) => v !== 255)).toBe(true);
      }

      // The whole corpus's evidence for the field being read at all is ONE record. It is in this
      // file, so pin it: exactly one part carries a nonzero destX, and it is 3.
      const xs = arc.composites.flatMap((c) => c.parts.map((q) => q.destX));
      expect(xs.filter((x) => x !== 0)).toEqual([3]);

      // NULL: rendering that part at destX 0 instead must change the picture. If it did not, the
      // solve would be untestable here no matter how the disassembly reads.
      const target = arc.composites.find((c) => c.parts.some((q) => q.destX !== 0))!;
      const shifted = renderHlibComposite(bytes, target)!;
      const flattened = renderHlibComposite(bytes, {
        ...target,
        parts: target.parts.map((q) => ({ ...q, destX: 0 })),
      })!;
      expect(Array.from(flattened.indices)).not.toEqual(Array.from(shifted.indices));
    },
  );
});

/**
 * Method-25 header byte +6 — CLOSED 2026-08-24, and it is not a canvas width.
 *
 * `hlib-format.md` §5a left this open: an exact `compositeWidth % sourceWidth == 0` in 71/71 parts
 * with ratios `{2: 62, 1: 9}` is predicted equally well by "a genuine, independently authored canvas
 * width" and "a value the authoring tool derived from the source width", and 16/16 regions is the
 * entire corpus, so there was nothing held out to generalise to.
 *
 * Settled the same way `destX` was — from `DQK.EXE`, not from the corpus. The recursive draw routine
 * at file offset `0x01984C` reads the slot's 8-byte header into `[bp-0x12]`, so header +6 lives at
 * `[bp-0x0c]` and +7 (the method) at `[bp-0x0b]`. It dispatches on `method & 0x0f == 9`, and inside
 * the method-25 arm (`0x198A7..0x19890D`) the only bytes it ever reads are the 6-byte record buffer
 * at `[bp-0x0a]`. **`[bp-0x0c]` is never read on that path** — its sole read is at `0x1990F`, which
 * is the `jne` target, i.e. the ordinary raster branch. The epilogue reads nothing.
 *
 * So the byte cannot affect rendering, and the corpus agrees once you ask it the right question:
 * the declared width EXCEEDS the width the parts actually occupy in 14 of 16 regions (by exactly 2x
 * in 12), and per part `widthByte` is always either the source's own width byte or twice it — it
 * tracks the source rather than the composite. An authored canvas would not do that in lockstep
 * across 71/71 parts including the 22 -> 44 case.
 *
 * This is also a correctness check on us: `renderHlibComposite` sizes its canvas from the parts,
 * which is what the engine does. Had it trusted `widthByte`, 14 of these 16 pictures would carry
 * dead columns — for DQK `FRAME.TLB` ptr 20 an 8-pixel blank stripe down a screen border.
 */
describe('HLIB method 25 — header byte +6 is not a width the engine reads', () => {
  const files = [
    resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK2', 'PICC.TLB'),
    resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK3', 'FRAME.TLB'),
  ];

  it.skipIf(!files.some(existsSync))(
    'the declared width over-states the content, and the render ignores it',
    async () => {
      let regions = 0;
      let over = 0;
      const ratios: number[] = [];
      for (const p of files.filter(existsSync)) {
        const bytes = new Uint8Array(await readFile(p));
        const arc = decodeHlib(bytes, p);
        expect(arc.composites.length).toBeGreaterThan(0);
        for (const c of arc.composites) {
          regions++;
          const img = renderHlibComposite(bytes, c)!;
          expect(img).toBeTruthy();

          // What the header claims, vs what the parts occupy (= what we render).
          const declared = c.widthByte * 4;
          expect(img.width).toBeLessThanOrEqual(declared);
          if (declared > img.width) over++;

          // Never under-declared: no shipped composite would clip if the byte WERE a canvas.
          // The case against it is the over-declaration plus the disassembly, not clipping.
          expect(declared).toBeGreaterThanOrEqual(img.width);

          // Read each source's own header byte +6 straight from the leaf's pointer array.
          const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          const ptrAt = (i: number) => c.leafBase + dv.getUint32(c.leafBase + 16 + 4 * i, true);
          for (const q of c.parts) {
            const srcWidth = bytes[ptrAt(q.sourcePtrIndex) + 6]! * 4;
            expect(srcWidth).toBeGreaterThan(0);
            ratios.push(declared / srcWidth);
          }
        }
      }
      expect(regions).toBe(7); // 4 PICC aliases + 3 FRAME stacks, the repo's share of the 16
      // Every part's declared width is exactly 1x or 2x its SOURCE's width — it tracks the source.
      expect([...new Set(ratios)].sort()).toEqual([2]);
      // And it over-states the real content in most regions, which a canvas width has no reason to.
      expect(over).toBe(7);
    },
  );
});

/**
 * `DATA` libraries: the member-0 id table generalises from §1c, and the length word does not.
 *
 * Two claims `hlib-format.md` carried as explicitly unmeasured, closed 2026-08-24 by sweeping every
 * `DATA`/`DIG4` library in both DOS HLIB installs (DQK and FRUA — 10 libraries; four of them,
 * FRUA's `GAME`/`GEO`/`SCRIPT`/`STRG`, had never been looked at).
 *
 * 1. **The `magic == 1` id table is a container property, not an image one.** §1c documented
 *    `WORD count` then `count × {WORD id, WORD ptrIndex}` at `ptr[0]` for `magic == 1` TILE leaves.
 *    It holds for **7 of 7** `magic == 1` `DATA` libraries and **0 of 3** `magic == 0` ones — the
 *    magic flag is the whole rule, and the `magic == 0` group is the null.
 *
 * 2. **The §6a big-endian uncompressed-length word does NOT generalise.** It is present in exactly
 *    the two libraries already known (DQK `MONCHA.GLB`, FRUA `MONST.GLB`) and absent from the other
 *    eight, on a decisive test — the word must equal the length of `monchaRLE(member[2:])`.
 *
 * A trap worth recording, because it produced a wrong "6 of 7" before it was caught: the id count
 * is NOT the member count. FRUA `GEO.GLB` maps **43 area ids onto 3 map members**, many-to-one (it
 * is the editor: 43 blank area slots sharing template maps). Testing `n === memberCount` rejected a
 * table that is perfectly well formed; the right test is `span === 2 + 4n`. DQK's three tables are
 * also *sparse* in their ids — `MONCHA` 1..119 for 98 records, `ECL` 1..67 for 47, `GEO` 2..66 for
 * 20 — so an id is not an index in this format and anything resolving one must go through the
 * table. (`loaders/moncha.ts` already does.)
 */
describe('HLIB DATA libraries — the id table generalises, the length word does not', () => {
  interface Lib {
    game: string;
    file: string;
    tag: string;
    magic: number;
    members: number;
    ptrs: number[];
    bytes: Uint8Array;
  }

  /** Path compare without regex escaping games: normalise separators, then use plain string ops. */
  const BSLASH = String.fromCharCode(92);
  const norm = (p: string) => p.split(BSLASH).join('/');

  const roots: Array<[string, string]> = [
    ['DQK', resolve(REPO_ROOT, 'The Dark Queen of Krynn')],
    ['FRUA', 'C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures'],
  ];
  const missingRoots = roots.map(([, root]) => root).filter((root) => !existsSync(root));
  const corpusTitle = (title: string) => missingRoots.length
    ? `${title} — missing source roots: ${missingRoots.join(', ')}`
    : title;

  const collect = (): Lib[] => {
    const out: Lib[] = [];
    for (const [game, root] of roots) {
      if (!existsSync(root)) continue;
      const files: string[] = [];
      const walk = (d: string) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const f = resolve(d, e.name);
          if (e.isDirectory()) walk(f);
          else if (/\.(TLB|GLB)$/i.test(e.name)) files.push(f);
        }
      };
      walk(root);
      for (const p of files) {
        if (norm(p).includes('/tools/')) continue; // repo-local fixtures, not shipped data
        const bytes = new Uint8Array(readFileSync(p));
        if (String.fromCharCode(...bytes.slice(0, 4)) !== 'HLIB') continue;
        const tag = String.fromCharCode(...bytes.slice(12, 16));
        if (tag !== 'DATA' && tag !== 'DIG4') continue;
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const count = dv.getUint16(8, true) + 1;
        const ptrs: number[] = [];
        for (let i = 0; i < count; i++) ptrs.push(dv.getUint32(16 + 4 * i, true));
        out.push({ game, file: norm(p).split('/').pop()!, tag, magic: bytes[11]!, members: count - 1, ptrs, bytes });
      }
    }
    return out;
  };

  it.skipIf(missingRoots.length > 0)(corpusTitle('a member-0 id table appears iff magic === 1'), () => {
    const libs = collect();
    let withTable = 0;
    let magicOne = 0;
    let magicZero = 0;
    for (const L of libs) {
      const dv = new DataView(L.bytes.buffer, L.bytes.byteOffset, L.bytes.byteLength);
      const span = L.ptrs[1]! - L.ptrs[0]!;
      const n = span >= 2 ? dv.getUint16(L.ptrs[0]!, true) : -1;
      const isTable = n >= 0 && span === 2 + 4 * n;
      if (L.magic === 1) {
        magicOne++;
        expect(isTable, `${L.game} ${L.file} is magic 1 and must carry an id table`).toBe(true);
        withTable++;
        // Every entry points at a real member, and together they cover every member but member 0.
        const idx = new Set<number>();
        for (let i = 0; i < n; i++) {
          const mi = dv.getUint16(L.ptrs[0]! + 2 + 4 * i + 2, true);
          expect(mi).toBeGreaterThanOrEqual(1);
          expect(mi).toBeLessThanOrEqual(L.members);
          idx.add(mi);
        }
        expect(idx.size, `${L.file} covers every member except the table itself`).toBe(L.members - 1);
      } else {
        magicZero++;
        expect(isTable, `${L.game} ${L.file} is magic 0 and must NOT look like an id table`).toBe(false);
      }
    }
    // The null is the magic-0 group: without it, "every library has a table" would be untested.
    expect(magicOne).toBe(7);
    expect(magicZero).toBe(3);
    expect(withTable).toBe(7);
  });

  it.skipIf(missingRoots.length > 0)(
    corpusTitle('the big-endian length word is confined to MONCHA.GLB and MONST.GLB'),
    () => {
      const libs = collect();
      const carriers: string[] = [];
      for (const L of libs) {
        let hits = 0;
        let total = 0;
        // Member 0 is the id table where one exists, so records start at 1.
        const first = L.magic === 1 ? 1 : 0;
        for (let i = first; i < L.ptrs.length - 1; i++) {
          const s = L.ptrs[i]!;
          const e = L.ptrs[i + 1]!;
          if (e - s < 4 || e > L.bytes.length) continue;
          total++;
          const be = (L.bytes[s]! << 8) | L.bytes[s + 1]!;
          if (be === monchaRLE(L.bytes.subarray(s + 2, e)).length) hits++;
        }
        if (total > 0 && hits === total) carriers.push(`${L.game} ${L.file} (${total})`);
        else expect(hits, `${L.game} ${L.file} must not carry the length word`).toBe(0);
      }
      expect(carriers.sort()).toEqual(['DQK MONCHA.GLB (98)', 'FRUA MONST.GLB (127)']);
    },
  );
});

/**
 * `rawMembers` on an IMAGE container — the `glib.ts` bug in its second, much smaller shape.
 *
 * `decodeHlib` used to hardcode `rawMembers: []` for TILE/HLIB, so any member region `decodeImage`
 * refused vanished without trace. Surfacing them found exactly two regions, 16 bytes, both the
 * leading member of a `TOPVIEW.TLB` — and on 2026-08-24 those turned out not to be undecodable at
 * all (see below). So the shipped DOS corpus now reports **zero** undecoded TILE members, and the
 * plumbing earns its keep on the `.GLB` side, which is the third test here.
 */
describe('decodeHlib reports image-container bytes it could not decode', () => {
  const topviews = [
    resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK2', 'TOPVIEW.TLB'),
    'C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures/DISK2/TOPVIEW.TLB',
  ];

  /**
   * TOPVIEW's leading member is a colour table that declares zero colours — "inherit the caller's
   * palette" — and `docs/hlib-format.md` already recorded that TOPVIEW ships no palette of its own.
   * The reader nonetheless filed those 8 bytes as an undecodable region for months, because the
   * leading-region branch asked `readPalette() !== null`, and that returns `null` both for "this is
   * not a colour table" and for "this is a colour table with nothing in it". The previous version of
   * this very test spelled the byte out — `drawMethod 0x18 = 24 = a colour-table magic with 0
   * colours` — and still asserted the region was undecoded. Reading a byte correctly and routing on
   * it are two different things.
   */
  it.skipIf(!topviews.some(existsSync))(
    'TOPVIEW.TLB: the leading member is an empty colour table, not undecoded bytes',
    async () => {
      let checked = 0;
      for (const p of topviews.filter(existsSync)) {
        const bytes = new Uint8Array(await readFile(p));
        const arc = decodeHlib(bytes, p);
        expect(arc.nonImage).toBe(false);
        expect(arc.rawMembers, `${p} has nothing left undecoded`).toEqual([]);
        // The image count is unchanged: the stub was never decoding to a picture anyway.
        expect(arc.images.length).toBe(20);
        // An empty table patches nothing, so it must NOT be published as an extra palette either.
        expect(arc.extraPalettes).toEqual([]);

        // Pin the record itself, parsed as the colour-table header it is:
        // cycle=1, first=0, ncolors=0, nranges=0, cmagic=0x18.
        const first = 104;
        const hex = [...bytes.slice(first, first + 8)]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join(' ');
        expect(hex).toBe('01 00 00 00 00 00 00 18');
        const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        expect(dv.getUint16(first + 4, true), 'ncolors is what makes it empty').toBe(0);
        checked++;
      }
      expect(checked).toBeGreaterThan(0);
    },
  );

  /**
   * NULL — the probe above must be able to fail.
   *
   * Corrupt the one byte the decision now rests on (cmagic at +7) into a value that is not a
   * colour-table magic. The leading region then genuinely is not a table, the reader falls into the
   * cpic-style "ptr[0] is an image" branch, `decodeImage` refuses an 8-byte header-only region, and
   * the member comes back as undecoded. If this stayed green, the test above would be pinning the
   * decoder's silence rather than its behaviour.
   */
  it.skipIf(!topviews.some(existsSync))(
    'NULL: break the cmagic byte and the same member is reported undecoded again',
    async () => {
      const p = topviews.find(existsSync)!;
      const bytes = new Uint8Array(await readFile(p));
      // 0x17 is adjacent to the real 0x18 and is not in COLOUR_TABLE_MAGIC.
      bytes[104 + 7] = 0x17;
      const arc = decodeHlib(bytes, p);
      expect(arc.rawMembers.length).toBe(1);
      expect(arc.rawMembers[0]!.length).toBe(8);
      expect(arc.images.length).toBe(20);
    },
  );

  /**
   * The corpus safety measurement behind the change, as a standing assertion.
   *
   * Routing the leading region on cmagic instead of on `readPalette` would drop a real picture in
   * any leaf that puts an image at `ptr[0]` — the shape the old comment attributed to cpic combat
   * icons. Measured across every DOS HLIB container we hold (DQK + FRUA, 52 containers, **435 TILE
   * leaves**): the leading region carries a colour-table cmagic in **435 of 435**, and no leaf is
   * cpic-style. Only 2 of the 435 are empty, and both are the TOPVIEW above. This test re-measures
   * the repo half of that corpus by its observable consequence: no image container loses a member.
   */
  it('every shipped DOS image container decodes all of its members', async () => {
    const root = resolve(REPO_ROOT, 'The Dark Queen of Krynn');
    if (!existsSync(root)) return;
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(TLB|GLB)$/i.test(e.name)) files.push(full);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(10);

    let imageContainers = 0;
    const leftover: string[] = [];
    for (const p of files) {
      const arc = decodeHlib(new Uint8Array(await readFile(p)), p);
      if (arc.nonImage) continue;
      imageContainers++;
      if (arc.rawMembers.length) leftover.push(`${p} (${arc.rawMembers.length})`);
    }
    expect(imageContainers).toBeGreaterThan(10);
    expect(leftover).toEqual([]);
  });

  it.skipIf(!existsSync(resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK3', 'FRAME.TLB')))(
    'renderHlibComposite reproduces the declared height, and the one nonzero destX shifts its part',
    async () => {
      const p = resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK3', 'FRAME.TLB');
      const bytes = new Uint8Array(await readFile(p));
      const arc = decodeHlib(bytes, p);
      expect(arc.composites.length).toBeGreaterThan(0);

      for (const c of arc.composites) {
        const img = renderHlibComposite(bytes, c);
        expect(img, 'every shipped composite must compose').not.toBeNull();
        // destY is exact (16/16 in the describe above), so the composed height IS the declared one.
        expect(img!.height).toBe(c.height);
        // The composed width is max(destX + sourceWidth) — the honest consequence of the solve,
        // not a canvas size guessed from the header byte at +6.
        expect(img!.width).toBeGreaterThanOrEqual(Math.max(...c.parts.map((q) => q.destX)) + 1);
        // Composing must not leave the canvas untouched.
        expect(img!.indices.some((v) => v !== 255)).toBe(true);
      }

      // The whole corpus's evidence for the field being read at all is ONE record. It is in this
      // file, so pin it: exactly one part carries a nonzero destX, and it is 3.
      const xs = arc.composites.flatMap((c) => c.parts.map((q) => q.destX));
      expect(xs.filter((x) => x !== 0)).toEqual([3]);

      // NULL: rendering that part at destX 0 instead must change the picture. If it did not, the
      // solve would be untestable here no matter how the disassembly reads.
      const target = arc.composites.find((c) => c.parts.some((q) => q.destX !== 0))!;
      const shifted = renderHlibComposite(bytes, target)!;
      const flattened = renderHlibComposite(bytes, {
        ...target,
        parts: target.parts.map((q) => ({ ...q, destX: 0 })),
      })!;
      expect(Array.from(flattened.indices)).not.toEqual(Array.from(shifted.indices));
    },
  );
  it.skipIf(!existsSync(resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK3', 'FRAME.TLB')))(
    'NULL: a container whose refusals are all accounted for reports none',
    async () => {
      // FRAME.TLB is the strongest control available: it is the ONE shipped file with mid-leaf
      // colour tables (4) AND it carries method-25 composites. Both make decodeImage return null.
      // If the capture were naive, this file would report 4+ phantom "undecoded" members.
      const p = resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK3', 'FRAME.TLB');
      const arc = decodeHlib(new Uint8Array(await readFile(p)), p);
      expect(arc.extraPalettes.length).toBe(4);
      expect(arc.composites.length).toBeGreaterThan(0);
      expect(arc.rawMembers).toEqual([]);
    },
  );

  it.skipIf(!existsSync(resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK1', 'SOUNDS.GLB')))(
    'a non-image .GLB still exposes its whole directory, as before',
    async () => {
      const p = resolve(REPO_ROOT, 'The Dark Queen of Krynn', 'DISK1', 'SOUNDS.GLB');
      const arc = decodeHlib(new Uint8Array(await readFile(p)), p);
      expect(arc.nonImage).toBe(true);
      expect(arc.rawMembers.length).toBeGreaterThan(0);
    },
  );
});

/**
 * The colour-table record header, read out of DQK.EXE rather than guessed from the corpus.
 *
 * Two routines settle it. The realizer at `DQK.EXE:0x01a296` (`0x1796:0x0536`) loads the 8-byte
 * header, does `and ax,0x0f / cmp ax,8` on byte +7, then branches on bits 0..2 of the LEADING WORD
 * to decide what follows it. The installer at `DQK.EXE:0x018661` (`0x161b:0x00b1`) takes what it
 * read and patches a single global 768-byte shadow palette at `DS:0xd145`.
 *
 * Everything asserted here is a consequence of that code, checked against every TILE member in the
 * DOS corpus. The old readings being replaced were: "cmagic is 8 or 24" (right answer, wrong rule)
 * and "the leading word is a cycling speed, >= 3 means cycling" (wrong — it is a flags word).
 */
describe('HLIB colour tables — the record header per DQK.EXE', () => {
  const ROOTS = [
    'C:/Program Files (x86)/GOG Galaxy/Games/The Dark Queen of Krynn',
    'C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures',
  ];
  const have = ROOTS.every((r) => existsSync(r));

  const BSLASH = String.fromCharCode(92);
  const norm = (p: string) => p.split(BSLASH).join('/');

  interface Rec {
    file: string;
    path: string;
    member: number;
    len: number;
    b7: number;
    flags: number;
    first: number;
    ncol: number;
    nrangeByte: number;
    bytes: Uint8Array;
    start: number;
  }

  /**
   * Walk to the TILE leaves the same way the loader does: `count` is the stored word + 1 and the
   * LAST pointer is EOF, so there are `count - 1` members. A master (`magic === 1`) spends its
   * member 0 on the id table of §1c and holds nested containers in the rest. Reading `count`
   * pointers rather than `count + 1` matters: the word after the array is not a pointer, and
   * treating it as one drops whole libraries through the bounds guard.
   */
  const collect = (): {
    leaves: number;
    members: number;
    tables: Rec[];
    methods: Set<number>;
  } => {
    const files: string[] = [];
    const walkDir = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = norm(resolve(d, e.name));
        if (e.isDirectory()) walkDir(full);
        else if (/\.(TLB|GLB)$/i.test(e.name)) files.push(full);
      }
    };
    for (const r of ROOTS) walkDir(r);

    const seen = new Set<string>();
    let leaves = 0;
    let members = 0;
    const tables: Rec[] = [];
    const methods = new Set<number>();

    const walk = (file: string, bytes: Uint8Array, base: number) => {
      if (String.fromCharCode(...bytes.slice(base, base + 4)) !== 'HLIB') return;
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const n = dv.getUint16(base + 8, true) + 1;
      const magic = bytes[base + 11]!;
      const tag = String.fromCharCode(...bytes.slice(base + 12, base + 16));
      const ptrs: number[] = [];
      for (let i = 0; i < n; i++) ptrs.push(base + dv.getUint32(base + 16 + 4 * i, true));
      if (ptrs.some((p) => p < base || p > bytes.byteLength)) return;
      let mem = ptrs.slice(0, n - 1).map((p, i) => [p, ptrs[i + 1]!] as const);
      if (magic === 1) mem = mem.slice(1);
      if (mem.length && String.fromCharCode(...bytes.slice(mem[0]![0], mem[0]![0] + 4)) === 'HLIB') {
        for (const [s] of mem) walk(file, bytes, s);
        return;
      }
      if (tag !== 'TILE') return;
      leaves++;
      mem.forEach(([s, e], i) => {
        if (e - s < 8) return;
        members++;
        const b7 = bytes[s + 7]!;
        if ((b7 & 0x0f) !== 8) {
          methods.add(b7);
          return;
        }
        tables.push({
          file: file.slice(file.lastIndexOf('/') + 1),
          path: file,
          member: i,
          len: e - s,
          b7,
          flags: dv.getUint16(s, true),
          first: dv.getUint16(s + 2, true),
          ncol: dv.getUint16(s + 4, true),
          nrangeByte: bytes[s + 6]!,
          bytes,
          start: s,
        });
      });
    };

    for (const f of files) {
      const bytes = new Uint8Array(readFileSync(f));
      const key = `${f.slice(f.lastIndexOf('/') + 1).toUpperCase()}:${bytes.byteLength}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (String.fromCharCode(...bytes.slice(0, 4)) === 'HLIB') walk(f, bytes, 0);
    }
    return { leaves, members, tables, methods };
  };

  it.skipIf(!have)(
    'the record type is the LOW NIBBLE of byte +7, and it agrees with the old set',
    () => {
      const { leaves, members, tables, methods } = collect();
      expect(leaves).toBe(434);
      expect(members).toBe(4144);

      // The engine's rule and the rule it replaced pick out exactly the same records.
      expect(tables.length).toBe(438);
      expect(tables.filter((t) => t.b7 === 0x08 || t.b7 === 0x18).length).toBe(438);
      // ... and no drawing method is mistaken for a table by the narrow set. That is the null: if
      // both rules simply matched everything, this would be nonzero.
      expect([...methods].filter((m) => m === 0x08 || m === 0x18)).toEqual([]);
      // The full byte is 24 every time, so the corpus alone could never have found the nibble rule.
      expect([...new Set(tables.map((t) => t.b7))]).toEqual([0x18]);
      expect([...methods].sort((a, b) => a - b)).toEqual([16, 17, 18, 21, 23, 25]);
    },
  );

  it.skipIf(!have)('the leading word is a flags word, not a cycling speed', () => {
    const { tables } = collect();

    // A speed would take arbitrary values. Only bits 0..2 are ever set, in the whole corpus.
    const values = [...new Set(tables.map((t) => t.flags))].sort((a, b) => a - b);
    expect(values).toEqual([0, 1, 3, 5, 7]);
    expect(tables.filter((t) => t.flags & ~7).length).toBe(0);

    // bit 0 — "the record declares its own first/ncolors". Exactly one record leaves it clear,
    // and it declares the very window the engine would substitute, so honouring the stored
    // fields unconditionally is right on everything we hold.
    const noBit0 = tables.filter((t) => !(t.flags & 1));
    expect(noBit0.length).toBe(1);
    expect(noBit0[0]!.file).toBe('TITLE.TLB');
    expect([noBit0[0]!.first, noBit0[0]!.ncol]).toEqual([0, 256]);

    // bit 1 — "nranges range records follow". Two-sided, zero exceptions either way.
    expect(tables.filter((t) => t.flags & 2).every((t) => t.nrangeByte > 0)).toBe(true);
    expect(tables.filter((t) => !(t.flags & 2)).every((t) => t.nrangeByte === 0)).toBe(true);
    expect(tables.filter((t) => t.flags & 2).length).toBe(51);
    expect(tables.filter((t) => !(t.flags & 2)).length).toBe(387);

    // The predicate this replaced, `word >= 3`, fires on flags 5 as well — 151 records where the
    // engine reads no ranges at all. That is what the loader used to fabricate a cycle range for.
    expect(tables.filter((t) => t.flags >= 3 && !(t.flags & 2)).length).toBe(151);
  });

  it.skipIf(!have)('the record length is fully explained by the three flag bits', () => {
    const { tables } = collect();
    const model = (t: Rec, ega: boolean) => {
      const b =
        8 + t.ncol * 3 + (t.flags & 2 ? t.nrangeByte * 4 : 0) + (ega ? Math.ceil(t.ncol / 2) : 0);
      return b + (b & 1); // then pad to an even length
    };
    expect(tables.filter((t) => t.len === model(t, (t.flags & 4) !== 0)).length).toBe(438);
    // Both nulls: the bit-2 term is neither always absent nor always present.
    expect(tables.filter((t) => t.len === model(t, false)).length).toBe(264);
    expect(tables.filter((t) => t.len === model(t, true)).length).toBe(175);
  });

  it.skipIf(!have)('the bit-2 trailing block is an EGA-16 index per colour', () => {
    const { tables } = collect();
    const EGA: [number, number, number][] = [
      [0, 0, 0],
      [0, 0, 171],
      [0, 171, 0],
      [0, 171, 171],
      [171, 0, 0],
      [171, 0, 171],
      [171, 87, 0],
      [171, 171, 171],
      [87, 87, 87],
      [87, 87, 255],
      [87, 255, 87],
      [87, 255, 255],
      [255, 87, 87],
      [255, 87, 255],
      [255, 255, 87],
      [255, 255, 255],
    ];
    const nearest = (r: number, g: number, b: number) => {
      let best = 0;
      let bd = Infinity;
      EGA.forEach(([er, eg, eb], i) => {
        const d = (er - r) ** 2 + (eg - g) ** 2 + (eb - b) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    };

    // A deterministic LCG, so the null below is reproducible without a seeded-RNG dependency.
    let state = 20260824;
    const rnd = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x80000000;
    };

    let hit = 0;
    let nullHit = 0;
    let total = 0;
    for (const t of tables) {
      if (!(t.flags & 4) || t.ncol === 0) continue;
      const off = t.start + 8 + t.ncol * 3 + (t.flags & 2 ? t.nrangeByte * 4 : 0);
      const stored: number[] = [];
      const want: number[] = [];
      for (let c = 0; c < t.ncol; c++) {
        const by = t.bytes[off + (c >> 1)]!;
        stored.push(c % 2 === 0 ? by >> 4 : by & 0x0f);
        const p = t.start + 8 + 3 * c;
        want.push(nearest(t.bytes[p]!, t.bytes[p + 1]!, t.bytes[p + 2]!));
      }
      total += t.ncol;
      hit += stored.filter((v, i) => v === want[i]).length;
      // Null: the SAME nibbles, shuffled within the record. Histogram-preserving, so it cannot be
      // beaten by a block that is merely mostly one value.
      const sh = stored.slice();
      for (let i = sh.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = sh[i]!;
        sh[i] = sh[j]!;
        sh[j] = tmp;
      }
      nullHit += sh.filter((v, i) => v === want[i]).length;
    }

    expect(total).toBe(24338);
    expect(hit).toBe(17737); // 72.9%
    expect(hit / total).toBeGreaterThan(0.7);
    expect(nullHit / total).toBeLessThan(0.25); // ~18.6% — the finding is 4x its own null
  });

  it.skipIf(!have)('the bit-2 block is a DQK build property, and FRUA has none of it', () => {
    // §2c's open question was "who reads this?", and the answer turned out to be nobody: the
    // three routines in DQK.EXE that dispatch on record type 8 are the three callers of the
    // colour-table loader 0x169b:0x0075, and none of them tests bit 2 or reads past
    // `8 + ncolors*3 + nranges*4`. This pins the corpus half of that argument.
    //
    // The hypothesis the doc recommended testing first — authoring-tool residue — is refuted by
    // this split. FRUA IS the authoring tool. If a shared packer had left the block behind, FRUA
    // would carry it too.
    const { tables } = collect();
    const dqk = tables.filter((t) => t.path.includes('Dark Queen'));
    const frua = tables.filter((t) => t.path.includes('Unlimited Adventures'));
    expect(dqk.length + frua.length).toBe(tables.length);

    // 263, not 264: `collect()` dedupes by NAME:size across both roots, and FRUA ships its own
    // `TOPVIEW.TLB` at exactly DQK's 1552 bytes (different content, same length), so that one
    // record is attributed to whichever root is walked first. Per root in isolation: 175 + 264.
    expect(frua.length).toBe(263);
    expect(frua.filter((t) => t.flags & 4).length).toBe(0);

    expect(dqk.length).toBe(175);
    expect(dqk.filter((t) => t.flags & 4).length).toBe(174);
    // The single DQK record without it is the ncolors == 0 inherit record, which has no colours
    // to describe — so the packer's rule is "every non-empty colour table", with no exceptions.
    const bare = dqk.filter((t) => !(t.flags & 4));
    expect(bare.map((t) => [t.file, t.ncol])).toEqual([['TOPVIEW.TLB', 0]]);

    // Per library it is total, never partial: 19 DQK libraries, each n-of-n.
    const perFile = new Map<string, [number, number]>();
    for (const t of dqk) {
      const e = perFile.get(t.file) ?? [0, 0];
      e[0]++;
      if (t.flags & 4) e[1]++;
      perFile.set(t.file, e);
    }
    expect(perFile.size).toBe(19);
    const partial = [...perFile.entries()].filter(([, [n, k]]) => k !== 0 && k !== n);
    expect(partial).toEqual([]);
  });

  it.skipIf(!have)('readPalette emits ranges only where the engine reads them', async () => {
    const { tables } = collect();

    // Pick the container that exercises the distinction hardest rather than naming one: the file
    // with the most bit-1 leaves. Hard-coding a name went wrong once here — DQK and FRUA both ship
    // a PICA.TLB, and filtering the table list by basename counted a file the decode never read.
    const byPath = new Map<string, Rec[]>();
    for (const t of tables) byPath.set(t.path, [...(byPath.get(t.path) ?? []), t]);
    let target = '';
    let bestBit1 = 0;
    for (const [path, recs] of byPath) {
      const n = recs.filter((r) => r.flags & 2).length;
      if (n > bestBit1) {
        bestBit1 = n;
        target = path;
      }
    }
    expect(bestBit1).toBeGreaterThan(0);

    const here = byPath.get(target)!.filter((t) => t.ncol > 0);
    expect(here.filter((t) => !(t.flags & 2)).length).toBeGreaterThan(0);

    const arc = decodeHlib(new Uint8Array(await readFile(target)), target);

    // The decisive count: the ranges the loader emits for this file must equal the number the
    // engine would read — the nranges byte summed over bit-1 records only, zero for the rest.
    const expected = here.reduce((n, t) => n + (t.flags & 2 ? t.nrangeByte : 0), 0);
    const seenPals = new Set<Palette>();
    for (const m of arc.images) if (m.image.palette) seenPals.add(m.image.palette);
    if (arc.palette) seenPals.add(arc.palette);
    for (const e of arc.extraPalettes) seenPals.add(e.palette);
    const emitted = [...seenPals].reduce((n, p) => n + (p.cycles?.length ?? 0), 0);
    expect(emitted).toBe(expected);
    // The old `word >= 3` rule emitted one range per flags-3/5/7 leaf instead. Different number,
    // so this assertion is what would have gone red on the code it replaced.
    expect(emitted).not.toBe(here.filter((t) => t.flags >= 3).length);
  });
});

/**
 * Drawing method 17 — which of its two planes is the mask, and why dropping it was a bug.
 *
 * `hlib-format.md` §8 listed "method 17's visible plane is the OR-mask" under *Assumed*. It is
 * now verified from the data in both directions, and the decoder was wrong in a way the old
 * assumption hid: it read the right plane and threw the other one away, so `transparentIndex`
 * advertised 255 for a buffer that never contained one.
 */
describe('HLIB drawing method 17 — the AND mask is the first plane, and it is load-bearing', () => {
  const ROOTS = [
    'C:/Program Files (x86)/GOG Galaxy/Games/The Dark Queen of Krynn',
    'C:/Program Files (x86)/GOG Galaxy/Games/Unlimited Adventures',
  ];
  const have = ROOTS.every((r) => existsSync(r));
  const BSLASH2 = String.fromCharCode(92);
  const norm2 = (p: string) => p.split(BSLASH2).join('/');

  interface M17 {
    path: string;
    width: number;
    height: number;
    mask: Uint8Array;
    pixels: Uint8Array;
  }

  const collect17 = (): M17[] => {
    const files: string[] = [];
    const walkDir = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const full = norm2(resolve(d, e.name));
        if (e.isDirectory()) walkDir(full);
        else if (/\.(TLB|GLB)$/i.test(e.name)) files.push(full);
      }
    };
    for (const r of ROOTS) walkDir(r);
    const seen = new Set<string>();
    const out: M17[] = [];

    const walk = (file: string, bytes: Uint8Array, base: number) => {
      if (String.fromCharCode(...bytes.slice(base, base + 4)) !== 'HLIB') return;
      const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const n = dv.getUint16(base + 8, true) + 1;
      const magic = bytes[base + 11]!;
      const tag = String.fromCharCode(...bytes.slice(base + 12, base + 16));
      const ptrs: number[] = [];
      for (let i = 0; i < n; i++) ptrs.push(base + dv.getUint32(base + 16 + 4 * i, true));
      if (ptrs.some((p) => p < base || p > bytes.byteLength)) return;
      let mem = ptrs.slice(0, n - 1).map((p, i) => [p, ptrs[i + 1]!] as const);
      if (magic === 1) mem = mem.slice(1);
      if (mem.length && String.fromCharCode(...bytes.slice(mem[0]![0], mem[0]![0] + 4)) === 'HLIB') {
        for (const [s] of mem) walk(file, bytes, s);
        return;
      }
      if (tag !== 'TILE') return;
      for (const [s, e] of mem) {
        if (e - s < 8 || bytes[s + 7] !== 17) continue;
        const height = dv.getUint16(s, true);
        const width = bytes[s + 6]! * 4;
        const need = width * height;
        if (!need || e - s - 8 < 2 * need) continue;
        out.push({
          path: file,
          width,
          height,
          mask: bytes.slice(s + 8, s + 8 + need),
          pixels: bytes.slice(s + 8 + need, s + 8 + 2 * need),
        });
      }
    };

    for (const f of files) {
      const bytes = new Uint8Array(readFileSync(f));
      const key = `${f.slice(f.lastIndexOf('/') + 1).toUpperCase()}:${bytes.byteLength}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (String.fromCharCode(...bytes.slice(0, 4)) === 'HLIB') walk(f, bytes, 0);
    }
    return out;
  };

  it.skipIf(!have)('the first plane is binary and the second is not', () => {
    const all = collect17();
    expect(all.length).toBe(34);
    // A mask takes two values. Pixels do not. This is what identifies the planes without
    // needing the blit code, and it has no exceptions either way.
    expect(all.every((m) => new Set(m.mask).size <= 2)).toBe(true);
    expect(all.every((m) => [...new Set(m.mask)].every((v) => v === 0x00 || v === 0xff))).toBe(true);
    const maskValues = new Set<number>();
    for (const m of all) for (const v of m.mask) maskValues.add(v);
    expect([...maskValues].sort((a, b) => a - b)).toEqual([0x00, 0xff]);
    // Null: the second plane is NOT binary for the great majority, so the test discriminates.
    expect(all.filter((m) => new Set(m.pixels).size > 2).length).toBe(30);
  });

  it.skipIf(!have)('mask 0xFF implies pixel 0, and the converse fails', () => {
    const all = collect17();
    let ffTotal = 0;
    let ffNonZero = 0;
    let opaque = 0;
    let opaqueZero = 0;
    let opaqueFF = 0;
    let zeros = 0;
    let total = 0;
    for (const m of all) {
      for (let i = 0; i < m.mask.length; i++) {
        total++;
        if (m.pixels[i] === 0) zeros++;
        if (m.mask[i] === 0xff) {
          ffTotal++;
          if (m.pixels[i] !== 0) ffNonZero++;
        } else {
          opaque++;
          if (m.pixels[i] === 0) opaqueZero++;
          if (m.pixels[i] === 0xff) opaqueFF++;
        }
      }
    }
    // The OR half of `dst = (dst & mask) | pixels`: a transparent pixel MUST be 0.
    expect(ffTotal).toBe(8284);
    expect(ffNonZero).toBe(0);
    // Null: pixel 0 is common anyway, so 100% only means something next to the base rate.
    expect(zeros / total).toBeGreaterThan(0.65);
    expect(zeros / total).toBeLessThan(0.75);

    // The converse fails, which is exactly why the mask cannot be thrown away: index 0 is a real
    // opaque colour in 1201 of the 5276 opaque positions.
    expect(opaque).toBe(5276);
    expect(opaqueZero).toBe(1201);

    // ... and 255 is free to use as the transparent key.
    expect(opaqueFF).toBe(0);
  });

  it.skipIf(!have)('decodeHlib now marks those pixels transparent, exactly as many as the mask', async () => {
    const all = collect17();
    const target = all[0]!.path;
    const mine = all.filter((m) => m.path === target);
    expect(mine.length).toBeGreaterThan(0);

    const arc = decodeHlib(new Uint8Array(await readFile(target)), target);
    const decoded = arc.images.filter((m) => m.image.encoding === 'hlib-method17');
    expect(decoded.length).toBe(mine.length);

    const wantTransparent = mine.reduce(
      (n, m) => n + [...m.mask].filter((v) => v === 0xff).length,
      0,
    );
    const gotTransparent = decoded.reduce(
      (n, m) => n + [...m.image.indices].filter((v) => v === 255).length,
      0,
    );
    // Before the mask was applied this was 0 while transparentIndex still claimed 255.
    expect(wantTransparent).toBeGreaterThan(0);
    expect(gotTransparent).toBe(wantTransparent);
    for (const m of decoded) expect(m.image.transparentIndex).toBe(255);
  });
});
