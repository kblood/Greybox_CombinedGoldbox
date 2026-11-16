/**
 * HLIB loader — DQK (DOS VGA, 256-color) DataLib graphics container (.TLB / .GLB).
 *
 * Direct port of tools/hlib_decode.py. LITTLE-ENDIAN; pointer-table directory
 * (NOT a sized TOC); 8bpp chunky 256-color; an 8-bit RGB colour table per leaf
 * (NO <<2 scaling); Chain-4 interleaved pixels; per-row PCX-style compression.
 * See docs/hlib-format.md.
 *
 * Container nesting: a MASTER "HLIB" packs self-contained leaf "TILE" files
 * ("sets"); a leaf "TILE" holds images directly. Non-image .GLB libraries
 * (DIG4/DATA members) share the container but are NOT decoded — they are exposed
 * as raw members instead.
 *
 * Drawing methods 16/21 (raw), 17 (AND mask + XOR pixels), 18 (compressed opaque),
 * 23 (compressed transparent) are decoded; method 25 (image-id list) is UNSOLVED
 * and skipped.
 */
import type { ColorCycle, FrameSet, IndexedImage, Palette, RGB } from '../model/index.js';
import { mergePalettes } from '../render/palette.js';

/** Transparent / key index convention (matches the 255 model convention). */
const TRANSPARENT = 255;

interface HlibHeader {
  fsize: number;
  /** Pointer count INCLUDING the trailing EOF sentinel. */
  count: number;
  magic: number;
  tag: string;
  /** Pointers relative to `base`. */
  ptrs: number[];
  base: number;
}

export interface HlibImageMember {
  /** Hierarchical label, e.g. "set01_img001" (master) or "img001" (leaf). */
  label: string;
  drawMethod: number;
  image: IndexedImage;
}

export interface HlibArchive {
  name: string;
  tag: string;
  /** Decoded image members (in walk order). */
  images: HlibImageMember[];
  /** Images keyed by positional walk index. */
  frameSet: FrameSet;
  /**
   * Bytes this loader did not turn into an image, so a caller can tell "fully decoded" from
   * "decoded what it could". Two populations end up here:
   *
   *  - **non-image (.GLB) containers** whose member tag is not TILE/HLIB — the whole directory,
   *    payload not decoded;
   *  - **image containers**, any member region {@link decodeImage} refused that is not already
   *    captured as an `extraPalettes` entry or a `composites` slot.
   *
   * The second population used to be dropped on the floor: `decodeHlib` hardcoded `rawMembers: []`
   * for TILE/HLIB, so a refused region left no trace at all. Measured across every shipped HLIB
   * image container (DQK `DISK1..3` + FRUA `DISK1..3`, 42 files, 3,732 member regions,
   * 6,094,566 member bytes) this fires on exactly **2 regions, 16 bytes** — both the same
   * `01 00 00 00 00 00 00 18` header-only stub in `TOPVIEW.TLB`, independently in DQK's copy and
   * FRUA's. That is four orders of magnitude smaller than the same bug in `glib.ts` (437,680 of
   * 439,671 bytes), and it is fixed for the same reason: the size of a silent loss is not something
   * the caller can find out after the fact.
   */
  rawMembers: Uint8Array[];
  /** True for a .GLB-style non-image library (DIG4/DATA). */
  nonImage: boolean;
  /**
   * Colour tables found **after** a leaf's leading one, in walk order. See
   * {@link HlibExtraPalette}. Empty for every shipped container except DQK's `DISK3/FRAME.TLB`.
   */
  extraPalettes: HlibExtraPalette[];
  /** Drawing-method-25 composite slots, parsed but NOT rendered. See {@link HlibComposite}. */
  composites: HlibComposite[];
}

/**
 * One part of a drawing-method-25 composite: "take the image at `sourcePtrIndex` in this same
 * leaf and put it at row `destY`".
 */
export interface HlibCompositePart {
  /** Pointer index, within the same leaf, of the source image. Valid in 71 of 71 shipped records. */
  sourcePtrIndex: number;
  /** Destination row, added to the composite's own draw Y. Strictly descending down the list. */
  destY: number;
  /**
   * Destination column, added to the composite's own draw X — SOLVED 2026-08-22 from `DQK.EXE`
   * itself, after the corpus refused to settle it. See {@link HlibComposite}'s note.
   *
   * 0 in 70 of the 71 shipped records and 3 in the remaining one, which is *why* the corpus could
   * not decide it: a field that is almost always zero is indistinguishable from a field that is
   * never read. The disassembly is not ambiguous in the same way.
   */
  destX: number;
}

/**
 * A drawing-method-25 slot — the "image-id list" §8 listed as unsolved and skipped.
 *
 * Structure, from all 16 shipped occurrences (DQK `PICC.TLB`/`FRAME.TLB`, FRUA
 * `PICA/PICD/FRAME.TLB`), 71 records in total:
 *
 *   - the payload after the 8-byte header is **6 * N bytes**, N records — 16/16;
 *   - byte 1 of **every** record is N itself, repeated — 16/16;
 *   - byte 0 is a pointer index into the same leaf — 71/71 — and the region it names always
 *     carries a real drawing method (16/17/18/21/23) — 16/16;
 *   - the word at +2 is a destination row, strictly descending down the list — 16/16 — and
 *     `max(destY) + height(source) === height(composite)` — **16/16**.
 *
 * The null for the id claim: a byte chosen at random would land on a real image in that leaf about
 * `imageCount/256` of the time, which over these 16 regions predicts **1.11** hits, not 16.
 *
 * Two shapes occur. DQK `PICC` and FRUA `PICA`/`PICD` use a single record pointing at a full-size
 * picture at row 0 — a plain alias, letting four slots share one stored picture. `FRAME.TLB` uses
 * N records of three 8x8 tiles — a top cap, a repeated middle and a bottom cap — stacked 8 rows
 * apart to build a 120/63/43/31-row vertical border. FRUA's `FRAME.TLB` does the same with its own
 * ids (26/27/28 rather than 45/46/47), so the ids are per-file and not a shared constant.
 *
 * **Horizontal placement — SOLVED 2026-08-22, from `DQK.EXE`, not from the corpus.** The record's
 * trailing word (offset +4) is `destX`, the exact counterpart of `destY` at +2. `DQK.EXE`'s
 * recursive draw routine begins at file offset `0x01984C`; its method-25 arm at `0x0198A7` reads
 * each 6-byte record into a stack buffer at `[bp-0x0a]` and then re-enters itself with
 *
 * ```
 * 8b 46 08   mov ax,[bp+08]     ; the caller's X
 * 03 46 fa   add ax,[bp-06]     ; + record word at +4
 * 50         push ax
 * 8b 46 06   mov ax,[bp+06]     ; the caller's Y
 * 03 46 f8   add ax,[bp-08]     ; + record word at +2
 * 50         push ax
 * 0e e8 4e ff call 0x01984C     ; itself — the target is exactly the function head
 * ```
 *
 * so both coordinates are *relative offsets* applied to wherever the composite itself is drawn.
 * Which stack slot is which needs no external table: `+2` is independently pinned as the row by
 * `max(destY) + height(source) === height(composite)`, 16/16, and it is the operand added to
 * `[bp+06]` — so `[bp+06]` is the vertical axis and `[bp+08]`, fed by `+4`, is the horizontal one.
 *
 * **A claim that was withdrawn on the way here**, recorded because the trap is reusable: an earlier
 * pass reported this solved from a corpus ratio of 1.692 between composite and source widths. That
 * ratio came from a *global* `imgNNN → pointer index` map, and FRUA `PICD.TLB` holds 29 sets that
 * each restart their own numbering, so the map collided and the sources being divided were not the
 * sources being composed. Re-resolved through each source's own leaf pointer table the ratio is an
 * exact integer in 71 of 71 parts, `{2: 62, 1: 9}` — a real measurement, and at the time still not
 * an answer, because an exact 1x/2x ratio is predicted equally well by "an authored canvas width"
 * and "a value the tool derived from the source width".
 *
 * **Byte +6 closed 2026-08-24, from the same routine: the engine never reads it here.** The header
 * is loaded into `[bp-0x12]`, so +6 is `[bp-0x0c]` and +7 (the method) is `[bp-0x0b]`. Inside the
 * method-25 arm (`0x198A7..0x19890D`) the only bytes read are the 6-byte record buffer at
 * `[bp-0x0a]`; `[bp-0x0c]`'s sole read in the whole function is at `0x1990F`, the `jne` target —
 * the ordinary raster branch. The epilogue reads nothing. So the byte cannot affect rendering.
 *
 * The corpus corroborates once asked the right question: the declared width EXCEEDS what the parts
 * occupy in 14 of 16 regions (by exactly 2x in 12), and per part it is always the SOURCE's own
 * width byte or twice it — it tracks the source, not the composite, across 71/71 parts including a
 * 22 -> 44 case. An independently authored canvas would not.
 *
 * **Kept out of `images`, rendered on request.** These slots stay out of `images` so image indices
 * are unchanged and nothing downstream silently gains or loses an entry; {@link renderHlibComposite}
 * composes one on request. That contract has a cost, and round 35 measured it: because the pass is
 * opt-in, every consumer must add it separately, and between 2026-08-22 and 2026-09-05 exactly one
 * did — `apps/web/src/ui/main.ts`'s single-file asset browser. `loadGame.ts` and
 * `apps/web/src/ui/nwnPreview.ts` listed `archive.images` only, so the whole-game routes dropped
 * 3 composites for `?game=dark-queen-dos` and 9 for
 * `?game=forgotten-realms-unlimited-adventures` (DQK `DISK2/PICC.TLB`'s other 4 are in no
 * manifest at all). All three sites now run the pass; see
 * `docs/engine/research/hlib-glib-composites.md`.
 */
export interface HlibComposite {
  /** Absolute offset of the leaf holding this composite (0 for a bare TILE). */
  leafBase: number;
  /** Pointer index of the composite within that leaf. */
  ptrIndex: number;
  /** Declared height from the 8-byte header. Reproduced exactly by the parts, 16/16. */
  height: number;
  /**
   * Raw header byte +6. NOT a width here, and not read by the engine on the method-25 path at all
   * (see the note above). Kept because it is real stored data, but {@link renderHlibComposite}
   * deliberately ignores it and sizes the canvas from the parts, as `DQK.EXE` does — trusting this
   * byte instead would put dead columns in 14 of the 16 shipped composites.
   */
  widthByte: number;
  parts: HlibCompositePart[];
}

/** Drawing method of a composite slot (`hackdocs`: "image-id list"). */
const COMPOSITE_METHOD = 25;

/** Parse a method-25 composite region. Returns null when the payload is not a whole 6-byte list. */
function readComposite(
  bytes: Uint8Array,
  start: number,
  end: number,
  leafBase: number,
  ptrIndex: number,
): HlibComposite | null {
  const body = end - start - 8;
  if (body <= 0 || body % 6 !== 0) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = body / 6;
  const parts: HlibCompositePart[] = [];
  for (let k = 0; k < n; k++) {
    const at = start + 8 + 6 * k;
    if (bytes[at + 1] !== n) return null; // byte 1 is the record count, in every record
    parts.push({
      sourcePtrIndex: bytes[at]!,
      destY: dv.getUint16(at + 2, true),
      destX: dv.getUint16(at + 4, true),
    });
  }
  return { leafBase, ptrIndex, height: dv.getUint16(start, true), widthByte: bytes[start + 6]!, parts };
}

/**
 * Compose a drawing-method-25 slot into a single image, using the `destX`/`destY` offsets that
 * `DQK.EXE`'s own draw routine applies (see {@link HlibComposite}).
 *
 * Deliberately NOT called by {@link decodeHlib}: composites stay out of `HlibArchive.images` so
 * pointer indices downstream are unchanged. Pass the same `bytes` the archive was decoded from.
 *
 * Consumers (grep `renderHlibComposite`, 2026-09-05): `apps/web/src/ui/main.ts` (asset browser),
 * `packages/engine/src/game/loadGame.ts` (every `?game=` route), and
 * `apps/web/src/ui/nwnPreview.ts`. The Amiga counterpart is `renderGlibComposite` in
 * `loaders/glib.ts`, which takes a DECOMPRESSED leaf rather than the file, because a GLIB leaf
 * can be LZW/LZ77-compressed and its members do not exist in the on-disk bytes.
 *
 * Returns `null` when any part's source cannot be decoded, rather than emitting a partial picture —
 * a half-drawn border is harder to notice than a missing one.
 */
export function renderHlibComposite(
  bytes: Uint8Array,
  composite: HlibComposite,
  palette: Palette | null = null,
): IndexedImage | null {
  let hdr: HlibHeader;
  try {
    hdr = readHeader(bytes, composite.leafBase);
  } catch {
    return null;
  }
  const abs = hdr.ptrs.map((p) => composite.leafBase + p);
  const sources: { part: HlibCompositePart; img: NonNullable<ReturnType<typeof decodeImage>> }[] = [];
  for (const part of composite.parts) {
    const i = part.sourcePtrIndex;
    if (i < 0 || i + 1 >= abs.length) return null;
    const img = decodeImage(bytes, abs[i]!, abs[i + 1]!);
    if (!img) return null;
    sources.push({ part, img });
  }
  if (sources.length === 0) return null;

  const width = Math.max(...sources.map((s) => s.part.destX + s.img.width));
  const height = Math.max(composite.height, ...sources.map((s) => s.part.destY + s.img.height));
  if (width <= 0 || height <= 0 || width * height > 1 << 22) return null;

  const indices = new Uint8Array(width * height).fill(TRANSPARENT);
  for (const { part, img } of sources) {
    for (let y = 0; y < img.height; y++) {
      const dy = part.destY + y;
      if (dy < 0 || dy >= height) continue;
      for (let x = 0; x < img.width; x++) {
        const v = img.indices[y * img.width + x]!;
        if (v === TRANSPARENT) continue;
        const dx = part.destX + x;
        if (dx < 0 || dx >= width) continue;
        indices[dy * width + dx] = v;
      }
    }
  }
  return {
    width,
    height,
    indices,
    xOffset: 0,
    yOffset: 0,
    transparentIndex: TRANSPARENT,
    palette: palette ?? { colors: new Array<null>(256).fill(null), source: 'hlib-range', firstColor: 0, count: 0 },
    encoding: 'hlib-composite',
  };
}

/**
 * A colour table sitting mid-leaf, past the one at `ptr[0]`/`ptr[1]` that the leaf's images use.
 *
 * The container format allows a leaf only one leading colour table, so anything after it was being
 * handed to {@link decodeImage} — which reads byte +7 as a drawing method, does not recognise the
 * cmagic value there, and returns null. Four alternate palettes were therefore dropped without a
 * trace. They are separated out here instead of being decoded as images; the flattened image
 * indices are unaffected, since those regions never produced an image to begin with.
 *
 * Corpus-wide, byte +7 across every non-leading leaf region in DQK and FRUA takes the values
 * 16, 17, 18, 21, 23 (drawing methods), 25 (an unsolved drawing method) and **24 — exactly four
 * times, all four in DQK's `DISK3/FRAME.TLB` at pointer indices 41..44**. The value 8, the other
 * documented cmagic, never occurs mid-leaf. So the cmagic values genuinely do not collide with the
 * drawing methods, and the split below is unambiguous rather than a heuristic.
 */
export interface HlibExtraPalette {
  /** Absolute offset of the leaf this table belongs to (0 for a bare TILE). */
  leafBase: number;
  /** Pointer index of the table within that leaf. */
  ptrIndex: number;
  /** Byte +7 that identified it. Its low nibble is 8; the corpus always has the full byte at 24. */
  cmagic: number;
  /** The parsed table. `firstColor`/`count` say which palette slice it patches. */
  palette: Palette;
}

/**
 * A record's type is the **low nibble** of byte +7; 8 means "colour table".
 *
 * This is not a corpus generalisation, it is the engine's own test. DQK's colour-table realizer
 * (`DQK.EXE` file offset `0x01a296`, i.e. `0x1796:0x0536`) loads the 8-byte record header and does
 * `mov al,[bp-0x345] / and ax,0x0f / cmp ax,8`, erroring out through `0x1102:0x03cf` when it does
 * not match. The same shape as the composite dispatch, which is `& 0x0f == 9`. The high nibble is
 * a modifier the palette path ignores.
 *
 * The set this replaced was `{0x08, 0x18}` — the two values `hackdocs` UAPALETT lists. Over every
 * TILE member in the DOS corpus (DQK + FRUA, 434 leaves, 4144 members) the two rules agree
 * exactly: **438 colour tables by the nibble rule, 438 by the set, 0 missed and 0 false positives**,
 * because the full byte is `0x18` every single time and the drawing methods are 16, 17, 18, 21, 23
 * and 25 — no other high nibble occurs. So this change is behaviour-preserving on everything we
 * hold; it is made because the narrow rule was right for the wrong reason and would have silently
 * mis-routed a `0x28`/`0x38`/… table in any container we do not have.
 */
const COLOUR_TABLE_TYPE = 0x08;

/**
 * Is the region `[start, end)` a colour table rather than an image?
 *
 * Decided by the cmagic byte at +7, which never collides with a drawing method (see the
 * {@link HlibExtraPalette} note). This is deliberately NOT "did {@link readPalette} return
 * something": that function returns `null` for a table with `ncolors === 0`, which is a real,
 * well-formed record meaning *inherit the caller's palette* — not a parse failure. Conflating the
 * two is what made DQK's `TOPVIEW.TLB` report a phantom "undecoded member region" for months: its
 * leading 8-byte record `01 00 00 00 00 00 00 18` is exactly such an inherit-table, and it was
 * being tried as an image, failing, and getting filed as undecoded bytes.
 *
 * Measured over every DOS HLIB container we hold (DQK + FRUA, 52 containers, **435 TILE leaves**):
 * the leading region carries a colour-table cmagic in **435 of 435**, and only **2** of those are
 * empty — both in `TOPVIEW.TLB`. Mid-leaf tables: 4 full (DQK `DISK3/FRAME.TLB` pointers 41..44),
 * 0 empty. So the "cpic combat icons put an image at ptr[0]" fallback below is never actually taken
 * by an image in this corpus; it is retained rather than deleted because removing a branch nothing
 * exercises is an unverified change, not a simplification.
 */
function isColourTable(bytes: Uint8Array, start: number, end: number): boolean {
  return end - start >= 8 && (bytes[start + 7]! & 0x0f) === COLOUR_TABLE_TYPE;
}

/** Cheap shape check: ASCII "HLIB" at offset 0. */
export function sniffHlib(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 16) return false;
  return (
    bytes[0] === 0x48 && // 'H'
    bytes[1] === 0x4c && // 'L'
    bytes[2] === 0x49 && // 'I'
    bytes[3] === 0x42 // 'B'
  );
}

function readHeader(bytes: Uint8Array, base = 0): HlibHeader {
  if (
    bytes[base] !== 0x48 ||
    bytes[base + 1] !== 0x4c ||
    bytes[base + 2] !== 0x49 ||
    bytes[base + 3] !== 0x42
  ) {
    throw new Error(`HLIB: bad signature at ${base}; not an HLIB container`);
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fsize = dv.getUint32(base + 4, true);
  const count = dv.getUint16(base + 8, true) + 1; // stored value is count-1
  const magic = bytes[base + 11];
  const tag = String.fromCharCode(
    bytes[base + 12],
    bytes[base + 13],
    bytes[base + 14],
    bytes[base + 15],
  );
  const ptrs: number[] = [];
  for (let i = 0; i < count; i++) {
    ptrs.push(dv.getUint32(base + 16 + 4 * i, true));
  }
  return { fsize, count, magic, tag, ptrs, base };
}

/**
 * Parse a colour table at absolute offset `off`. Returns a Palette (with only the
 * [first_col, first_col+ncolors) slice defined) or null when ncolors === 0
 * (inherit). 8-bit RGB in the file.
 *
 * **The leading word is a FLAGS word, not a cycling speed.** DQK's realizer
 * (`DQK.EXE:0x01a296`) branches on two of its bits and on nothing else:
 *
 * - **bit 0** — the record declares its own `first`/`ncolors`. When it is CLEAR the engine
 *   ignores both fields and installs `0 .. 255` instead (or `0 .. 15` when its own mode query
 *   at `0x12b7:0x14bc` / `0x12b7:0x14b4` says the display is 16-colour). Exactly **1** of the
 *   438 DOS colour tables has it clear — FRUA `DISK1/TITLE.TLB` member 0 — and that record
 *   declares `first=0, ncolors=256`, i.e. precisely what the engine would have substituted.
 *   So honouring the stored fields unconditionally, as below, is right on everything we hold.
 * - **bit 1** — `nranges` 4-byte range records follow the RGB block. When it is CLEAR the
 *   engine *zeroes* `nranges` before reading anything (`test [bp-0x34c],2 / je` →
 *   `mov byte [bp-0x346],0`), so a nonzero byte there would be ignored. Two-sided in the
 *   corpus: bit 1 set ⇒ the byte is nonzero in **51 of 51**, clear ⇒ it is zero in **387 of
 *   387**. The old code produced a cycle range whenever the word was `>= 3`, which fabricated
 *   one for the 151 records with flags `5` — bit 1 clear, bit 2 set — where the engine reads
 *   no ranges at all.
 * - **bit 2** — a trailing EGA-16 approximation table follows: `ceil(ncolors/2)` bytes, one
 *   nibble per colour, high nibble first. Nothing in the palette path reads it; see the
 *   {@link HlibArchive} note and `docs/hlib-format.md` §2c.
 *
 * No colour table in the corpus sets any bit above 2 (values seen: 0, 1, 3, 5, 7), which is
 * itself the evidence against the "cycling speed" reading — a speed would take arbitrary values.
 *
 * The 4-byte range records are `{ key0, key1, firstColor, count }`. Bytes +2/+3 are proven to be
 * a palette slot range by the installer at `DQK.EXE:0x018661`, which does interval arithmetic on
 * them (`rec[+6] < first+ncolors && rec[+6]+rec[+7] > first` selects the registrations to evict).
 * Bytes +0/+1 are only ever compared for equality — they are the cache key that lets the engine
 * skip a reload when the same source re-registers the same range. `hackdocs` calls those two
 * `dir`/`speed`; that is a guess this codebase has never verified, and the `ColorCycle` field
 * names below preserve it only so the shape stays stable.
 */
function readPalette(bytes: Uint8Array, off: number): Palette | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = dv.getUint16(off, true);
  const first = dv.getUint16(off + 2, true);
  const ncol = dv.getUint16(off + 4, true);
  // cmagic = bytes[off+7] (routed on before we get here, see isColourTable)
  if (ncol === 0) return null;
  const colors: (RGB | null)[] = new Array(256).fill(null);
  let p = off + 8;
  for (let c = 0; c < ncol; c++) {
    const r = bytes[p];
    const g = bytes[p + 1];
    const b = bytes[p + 2];
    const idx = first + c;
    if (idx >= 0 && idx < 256) colors[idx] = { r, g, b };
    p += 3;
  }
  const nranges = flags & 0x02 ? bytes[off + 6]! : 0;
  const cycles: ColorCycle[] = [];
  for (let i = 0; i < nranges; i++) {
    const q = p + 4 * i;
    if (q + 4 > bytes.byteLength) break;
    cycles.push({
      dir: bytes[q]!,
      speed: bytes[q + 1]!,
      start: bytes[q + 2]!,
      count: bytes[q + 3]!,
    });
  }
  return {
    colors,
    source: 'hlib-range',
    firstColor: first,
    count: ncol,
    ...(cycles.length ? { cycles } : {}),
  };
}

/**
 * Decode one image (header at `start`, bytes up to `end`) into an index buffer.
 * Returns null for unrecognized geometry or unsolved drawing methods (e.g. 25).
 * 255 is the transparent/untouched key index. Mirrors decode_image.
 */
function decodeImage(
  bytes: Uint8Array,
  start: number,
  end: number,
): { width: number; height: number; indices: Uint8Array; drawMethod: number; xOffset: number; yOffset: number } | null {
  if (end - start < 8) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const height = dv.getUint16(start, true);
  // Stored offsets describe how far the source origin lies above/left of its destination.
  // Negating them yields ordinary screen-space placement coordinates.
  const yOffset = -dv.getInt16(start + 2, true);
  const xOffset = -dv.getInt16(start + 4, true);
  const w4 = bytes[start + 6];
  const dm = bytes[start + 7];
  const width = w4 * 4;
  if (width === 0 || height === 0 || width > 4096 || height > 2048) return null;

  const body = bytes.subarray(start + 8, end);
  const bn = body.byteLength;
  const px = new Uint8Array(width * height).fill(TRANSPARENT);
  const q = Math.floor(width / 4); // quarter width (pixels per sweep per row)

  if (dm === 16 || dm === 21) {
    // uncompressed; 4 quarter-sweeps per row, sweep s contributes cols s,s+4,...
    const need = width * height;
    if (bn < need) return null;
    let k = 0;
    for (let y = 0; y < height; y++) {
      for (let s = 0; s < 4; s++) {
        for (let i = 0; i < q; i++) {
          const x = i * 4 + s;
          px[y * width + x] = body[k++];
        }
      }
    }
    return { width, height, indices: px, drawMethod: dm, xOffset, yOffset };
  }

  if (dm === 17) {
    // Two uncompressed `width*height` planes: an AND mask, then the pixels. DQK's row blitter
    // (`0x00342a`) does `lodsw / and ax, es:[di] / xor ax, [bx] / stosw`, i.e.
    // `dst = (mask & dst) ^ pixels`, which is why the mask plane holds only 0x00/0xFF.
    //
    // Verified both ways over all 34 method-17 members in the DOS corpus:
    // - the first plane takes exactly TWO values, 0x00 and 0xFF, in 34 of 34 members, while the
    //   second takes 65 across the family — so the mask is the first block, not the second;
    // - mask 0xFF implies pixel 0 in **8284 of 8284** positions, zero exceptions, against a 69.9%
    //   base rate for pixel 0. That is the second half of the idiom: a transparent pixel must be 0
    //   so the XOR is a no-op — and under XOR that is mandatory, not merely tidy, since a non-zero
    //   pixel under a 0xFF mask would scramble the destination rather than brighten it.
    // The converse does NOT hold — 1201 of the 5276 opaque positions legitimately hold index 0 —
    // so transparency is NOT recoverable from the pixel plane alone, and dropping the mask (as
    // this decoder used to) makes 61% of the family's pixels an opaque black rectangle around the
    // sprite while `transparentIndex` claims 255. That claim is made true here instead.
    //
    // 255 is safe as the key: no opaque position in the corpus holds 0xFF (0 of 5276).
    // See `docs/hlib-format.md` §5c/§5d and DQK's 16-colour blit arm at `DQK.EXE:0x019061`, which
    // positions its second pointer at `+ height*stride`, advances both planes in lockstep, and
    // passes the UN-advanced one as the AND operand — which is what fixes the plane order.
    const need = width * height;
    if (bn < 2 * need) return null;
    const andmask = body.subarray(0, need);
    const ormask = body.subarray(need, 2 * need);
    let k = 0;
    for (let y = 0; y < height; y++) {
      for (let s = 0; s < 4; s++) {
        for (let i = 0; i < q; i++) {
          const x = i * 4 + s;
          px[y * width + x] = andmask[k] === 0xff ? TRANSPARENT : ormask[k];
          k++;
        }
      }
    }
    return { width, height, indices: px, drawMethod: dm, xOffset, yOffset };
  }

  // Chain-4 column-visit order within a row: sweep0 cols 0,4,8.. then sweep1 1,5,9..
  const order = new Int32Array(width); // length == width
  {
    let oi = 0;
    for (let s = 0; s < 4; s++) {
      for (let i = 0; i < q; i++) order[oi++] = i * 4 + s;
    }
  }

  if (dm === 18) {
    // compressed opaque; runs span the whole row (4 sweeps) as one stream.
    let pos = 0;
    for (let y = 0; y < height; y++) {
      let col = 0;
      while (col < width && pos < bn) {
        const c = body[pos++];
        if (c < 128) {
          const cnt = c + 1;
          for (let k = 0; k < cnt; k++) {
            if (col < width && pos < bn) {
              px[y * width + order[col]] = body[pos++];
              col++;
            }
          }
        } else {
          const cnt = 257 - c;
          const val = pos < bn ? body[pos] : 0;
          pos++;
          for (let k = 0; k < cnt; k++) {
            if (col < width) {
              px[y * width + order[col]] = val;
              col++;
            }
          }
        }
      }
    }
    return { width, height, indices: px, drawMethod: dm, xOffset, yOffset };
  }

  if (dm === 23) {
    // compressed transparent: 4 image sweeps; 0 ends a row; 256-c skip.
    let pos = 0;
    for (let s = 0; s < 4; s++) {
      // this sweep's columns L->R
      const sweepCols = new Int32Array(q);
      for (let i = 0; i < q; i++) sweepCols[i] = i * 4 + s;
      for (let y = 0; y < height; y++) {
        let col = 0;
        while (pos < bn) {
          const c = body[pos++];
          if (c === 0) break; // end of this row
          if (c >= 128) {
            col += 256 - c; // skip transparent
          } else {
            for (let k = 0; k < c; k++) {
              if (pos < bn && col < q) px[y * width + sweepCols[col]] = body[pos];
              pos++;
              col++;
            }
          }
        }
      }
    }
    return { width, height, indices: px, drawMethod: dm, xOffset, yOffset };
  }

  return null; // method 25 (image-id list) and unknowns: skip
}

/**
 * Yield (label, start, end, palette) for each image in a leaf TILE. `base` is the
 * absolute offset of this leaf; its pointers are relative to it. Resolves the
 * colour table per magic, with the cpic/topview "no palette" detection.
 */
function* iterLeafImages(
  bytes: Uint8Array,
  base: number,
  hdr: HlibHeader,
  fallbackPal: Palette | null,
  extra?: HlibExtraPalette[],
  composites?: HlibComposite[],
): Generator<{ imgIndex: number; start: number; end: number; pal: Palette | null }> {
  const ptrs = hdr.ptrs.map((p) => base + p); // absolute
  let pal = fallbackPal;
  let firstImg: number;
  if (hdr.magic === 1) {
    // ptr[0]=image-id table, ptr[1]=colour table, ptr[2..]=images
    firstImg = 2;
    if (ptrs.length > 2) {
      const p = readPalette(bytes, ptrs[1]);
      if (p) pal = p;
    }
  } else if (isColourTable(bytes, ptrs[0], ptrs[1] ?? ptrs[0])) {
    // ptr[0] is a colour table. It may be EMPTY (ncolors === 0), which means "inherit" and is why
    // this routes on the cmagic rather than on readPalette's return — see isColourTable.
    firstImg = 1;
    const p = readPalette(bytes, ptrs[0]);
    if (p) pal = p;
  } else {
    // No colour table here: ptr[0] is the first image (the cpic combat-icon shape). Unexercised in
    // the DOS corpus we hold; kept so an unmeasured container is not silently mis-read.
    firstImg = 0;
  }
  for (let i = firstImg; i < ptrs.length - 1; i++) {
    const start = ptrs[i];
    const end = ptrs[i + 1];
    // A mid-leaf colour table, not an image: byte +7 is a cmagic, which never collides with a
    // drawing method. Route it to `extra` rather than letting decodeImage silently return null.
    if (isColourTable(bytes, start, end)) {
      const p = readPalette(bytes, start);
      if (p) extra?.push({ leafBase: base, ptrIndex: i, cmagic: bytes[start + 7]!, palette: p });
      // An empty (inherit) table yields nothing to patch, but it is still a colour table and must
      // not fall through to be tried as an image.
      continue;
    }
    // A method-25 composite: parsed into `composites`, still not rendered (decodeImage returns null
    // for it, so leaving it in the yield stream would change nothing either way).
    if (composites && end - start >= 8 && bytes[start + 7] === COMPOSITE_METHOD) {
      const c = readComposite(bytes, start, end, base, i);
      if (c) composites.push(c);
    }
    yield { imgIndex: i, start, end, pal };
  }
}

interface WalkItem {
  label: string;
  image: IndexedImage;
  drawMethod: number;
}

function buildImage(
  r: { width: number; height: number; indices: Uint8Array; drawMethod: number; xOffset: number; yOffset: number },
  pal: Palette | null,
): IndexedImage {
  // Methods 17/21/23 leave 255 as the transparent key; 16/18 are opaque but the
  // Python renders 255 through the palette like any index, so only flag transparent
  // for the transparent-class methods.
  const transparent =
    r.drawMethod === 17 || r.drawMethod === 21 || r.drawMethod === 23
      ? TRANSPARENT
      : null;
  return {
    width: r.width,
    height: r.height,
    indices: r.indices,
    xOffset: r.xOffset,
    yOffset: r.yOffset,
    transparentIndex: transparent,
    palette: pal,
    encoding: `hlib-method${r.drawMethod}`,
  };
}

/**
 * Is a region that {@link decodeImage} refused already accounted for by another channel? Mid-leaf
 * colour tables land in `extraPalettes` and method-25 slots in `composites`; only what neither
 * catches is a genuine silent drop.
 */
function isCapturedElsewhere(bytes: Uint8Array, start: number, end: number): boolean {
  if (end - start < 8) return false;
  if (bytes[start + 7] === COMPOSITE_METHOD) return true;
  return isColourTable(bytes, start, end);
}

/** Walk a container (master or leaf) and yield decoded image members in order. */
function* walk(
  bytes: Uint8Array,
  base = 0,
  fallbackPal: Palette | null = null,
  extra?: HlibExtraPalette[],
  composites?: HlibComposite[],
  undecoded?: Uint8Array[],
): Generator<WalkItem> {
  const hdr = readHeader(bytes, base);
  if (hdr.tag === 'HLIB') {
    // master: ptr[0]=setid table, ptr[1..]=sets, last=EOF
    const ptrs = hdr.ptrs.map((p) => base + p);
    for (let si = 1; si < ptrs.length - 1; si++) {
      const setBase = ptrs[si];
      const sub = readHeader(bytes, setBase);
      for (const it of iterLeafImages(bytes, setBase, sub, fallbackPal, extra, composites)) {
        const r = decodeImage(bytes, it.start, it.end);
        if (r) {
          yield {
            label: `set${String(si).padStart(2, '0')}_img${String(it.imgIndex).padStart(3, '0')}`,
            image: buildImage(r, it.pal),
            drawMethod: r.drawMethod,
          };
        } else if (!isCapturedElsewhere(bytes, it.start, it.end)) {
          undecoded?.push(bytes.subarray(it.start, it.end));
        }
      }
    }
  } else if (hdr.tag === 'TILE') {
    for (const it of iterLeafImages(bytes, base, hdr, fallbackPal, extra, composites)) {
      const r = decodeImage(bytes, it.start, it.end);
      if (r) {
        yield {
          label: `img${String(it.imgIndex).padStart(3, '0')}`,
          image: buildImage(r, it.pal),
          drawMethod: r.drawMethod,
        };
      } else if (!isCapturedElsewhere(bytes, it.start, it.end)) {
        undecoded?.push(bytes.subarray(it.start, it.end));
      }
    }
  } else {
    throw new Error(`HLIB: unknown tag ${JSON.stringify(hdr.tag)}`);
  }
}

/**
 * Decode an HLIB container to the neutral model. Master "HLIB" recurses into its
 * self-contained leaf sets; leaf "TILE" decodes its images directly. Non-image
 * (.GLB DIG4/DATA) libraries are exposed as raw member slices, payload not decoded.
 */
export function decodeHlib(bytes: Uint8Array, name = ''): HlibArchive {
  const hdr = readHeader(bytes, 0);

  const frameSet: FrameSet = {
    name,
    frames: new Map<number, IndexedImage>(),
    kind: 'unknown',
  };

  if (hdr.tag !== 'TILE' && hdr.tag !== 'HLIB') {
    // .GLB sound/data library (DIG4 / DATA): expose raw members, don't decode.
    const rawMembers: Uint8Array[] = [];
    for (let i = 0; i < hdr.ptrs.length - 1; i++) {
      rawMembers.push(bytes.subarray(hdr.ptrs[i], hdr.ptrs[i + 1]));
    }
    return {
      name,
      tag: hdr.tag,
      images: [],
      frameSet,
      rawMembers,
      nonImage: true,
      extraPalettes: [],
      composites: [],
    };
  }

  const images: HlibImageMember[] = [];
  const extraPalettes: HlibExtraPalette[] = [];
  const composites: HlibComposite[] = [];
  const rawMembers: Uint8Array[] = [];
  let pos = 0;
  for (const item of walk(bytes, 0, null, extraPalettes, composites, rawMembers)) {
    images.push({ label: item.label, drawMethod: item.drawMethod, image: item.image });
    frameSet.frames.set(pos++, item.image);
  }

  return { name, tag: hdr.tag, images, frameSet, rawMembers, nonImage: false, extraPalettes, composites };
}

/**
 * Where one flattened {@link decodeHlib} image index physically lives inside a MASTER container —
 * the bridge between the art-slot mapping model (which addresses "slot N" = the N-th decoded image)
 * and the raw container layout (which nests images inside self-contained leaf sets). Produced by
 * {@link mapHlibMasterSlots}; consumed by the drop-in override rebuild (`hlibEncode.ts`'s
 * `rebuildHlibMasterWithSlotReplacements`), which must replace exactly the right image chunk while
 * carrying every other byte of the original file through verbatim.
 */
export interface HlibMasterSlotRef {
  /** Master pointer index of the set holding this image (1..count-2; ptr[0] is the set-id table). */
  setPtrIndex: number;
  /** Pointer index of the image chunk WITHIN its leaf set (past the id-table/colour-table members). */
  imagePtrIndex: number;
  /** The slot's real geometry + draw method, read from the original image chunk header. */
  width: number;
  height: number;
  drawMethod: number;
}

/**
 * Parse a `magic == 1` container's own image-id / set-id table at `ptr[0]` (docs/hlib-format.md
 * §1c): `WORD count` then `count × {WORD id, WORD ptrIndex}` (ptrIndex is 1-based into the
 * container's own pointer list — for a MASTER "HLIB" that IS {@link HlibMasterSlotRef.setPtrIndex};
 * for a leaf "TILE" it is the image pointer index). This is the SAME table `decodeHlib`/
 * `mapHlibMasterSlots` intentionally ignore (they walk positionally) — it exists purely for the
 * *reverse* lookup this function performs: given a logical id an ECL `PICTURE` opcode names, find
 * which physical slot holds it. Returns an empty map for a `magic == 0` container (no id table).
 */
export function parseHlibSetIdTable(bytes: Uint8Array, base = 0): Map<number, number> {
  const hdr = readHeader(bytes, base);
  const map = new Map<number, number>();
  if (hdr.magic !== 1 || hdr.ptrs.length === 0) return map;
  const tableOff = base + hdr.ptrs[0];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = dv.getUint16(tableOff, true);
  for (let i = 0; i < n; i++) {
    const entryOff = tableOff + 2 + 4 * i;
    if (entryOff + 4 > bytes.byteLength) break;
    const id = dv.getUint16(entryOff, true);
    const ptrIndex = dv.getUint16(entryOff + 2, true);
    map.set(id, ptrIndex);
  }
  return map;
}

/**
 * Decode every image in ONE set of a MASTER "HLIB" container, addressed by `setPtrIndex` (the
 * value {@link parseHlibSetIdTable} resolves a logical id to — i.e. `ptrs[setPtrIndex]`). This is
 * the id-addressed counterpart to {@link mapHlibMasterSlots}'s positional walk: given a real ECL
 * `PICTURE` id, the caller first resolves `id → setPtrIndex` via the id table, then calls this to
 * get the actual decoded image(s) (almost always exactly one, for the portrait libraries
 * PICA/PICB/PICC this exists for). Returns `[]` for an out-of-range index or an empty/undecodable
 * set (never throws — callers treat a miss as "picture not found", same convention as a missing
 * GEO/ECL id).
 */
export function dqkPictureSlotImages(bytes: Uint8Array, setPtrIndex: number): HlibImageMember[] {
  const hdr = readHeader(bytes, 0);
  if (hdr.tag !== 'HLIB') return [];
  if (setPtrIndex < 1 || setPtrIndex >= hdr.ptrs.length - 1) return [];
  const setBase = hdr.ptrs[setPtrIndex];
  const sub = readHeader(bytes, setBase);
  const out: HlibImageMember[] = [];
  for (const it of iterLeafImages(bytes, setBase, sub, null)) {
    const r = decodeImage(bytes, it.start, it.end);
    if (r) {
      out.push({
        label: `set${String(setPtrIndex).padStart(2, '0')}_img${String(it.imgIndex).padStart(3, '0')}`,
        image: buildImage(r, it.pal),
        drawMethod: r.drawMethod,
      });
    }
  }
  return out;
}

/** Convenience: the first (almost always only) decoded image of {@link dqkPictureSlotImages}, or
 *  `null` when the set decodes no images. */
export function dqkPictureSlot(bytes: Uint8Array, setPtrIndex: number): HlibImageMember | null {
  return dqkPictureSlotImages(bytes, setPtrIndex)[0] ?? null;
}

/**
 * Map every flattened image index of a MASTER "HLIB" container to its physical location
 * (set pointer + image pointer within that set) and its real per-slot geometry/draw method.
 * Mirrors {@link decodeHlib}'s walk exactly — including skipping sets with no decodable images
 * (e.g. PICA's palette-only first set) and skipping unsolved draw methods — so index i here IS
 * `decodeHlib(bytes).images[i]`. Throws on a non-master container.
 */
export function mapHlibMasterSlots(bytes: Uint8Array): HlibMasterSlotRef[] {
  const hdr = readHeader(bytes, 0);
  if (hdr.tag !== 'HLIB') throw new Error(`mapHlibMasterSlots: not a master HLIB (tag ${JSON.stringify(hdr.tag)})`);
  const refs: HlibMasterSlotRef[] = [];
  const ptrs = hdr.ptrs;
  for (let si = 1; si < ptrs.length - 1; si++) {
    const setBase = ptrs[si];
    const sub = readHeader(bytes, setBase);
    for (const it of iterLeafImages(bytes, setBase, sub, null)) {
      const r = decodeImage(bytes, it.start, it.end);
      if (r) {
        refs.push({
          setPtrIndex: si,
          imagePtrIndex: it.imgIndex,
          width: r.width,
          height: r.height,
          drawMethod: r.drawMethod,
        });
      }
    }
  }
  return refs;
}

/**
 * Composite every leaf palette in this archive into one 256-colour VGA palette
 * (see `mergePalettes`). For a master like BIGPIC whose leaves all carry the same
 * slice this returns that slice; layering ACROSS libraries (e.g. ALWAYS's 0–15 UI
 * palette + BIGPIC's 32–255 picture palette → a full DAC) is done by passing each
 * archive's composite back through `mergePalettes`. Empty/non-image archives yield
 * an all-null palette.
 */
export function compositeHlibPalette(archive: HlibArchive): Palette {
  return mergePalettes(...archive.images.map((m) => m.image.palette));
}
