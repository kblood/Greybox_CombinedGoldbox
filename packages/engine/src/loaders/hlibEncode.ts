/**
 * HLIB writer (E1) — the repacker side of {@link decodeHlib}. Emits the DQK "DataLib" container
 * (`.TLB` / `.GLB`): the LITTLE-ENDIAN `HLIB`-signature header, the pointer-table directory (stored
 * count is the real count − 1; the last pointer is the EOF sentinel == file size), and either
 * **image** members (leaf `TILE`: an 8-bit colour table + Chain-4 interleaved pixel chunks, drawing
 * method 16 raw, 18 compressed, 21 raw transparent, or 23 compressed transparent) or **raw** members
 * (`DATA` / `DIG4` `.GLB` libraries — ECL scripts,
 * GEO maps, sounds — packed verbatim).
 *
 * This is the format the CoK/DoK → DQK rebuild writes: the PRIMARY native-goal pipeline converts the
 * older games' content into HLIB `TILE`/`DATA` chunks the DQK engine loads. Every encoder here is the
 * exact inverse of the matching decoder path, so `decodeHlib(encode(x))` reproduces `x` (verified by
 * round-trip + real-file goldens in `hlibEncode.test.ts`). See `docs/hlib-format.md`.
 */
import type { IndexedImage, Palette, RGB } from '../model/index.js';
import { mapHlibMasterSlots } from './hlib.js';

/** Build the 16-byte HLIB header + pointer table for a container whose member chunks are `chunks`. */
function buildContainer(tag: string, magic: number, chunks: Uint8Array[]): Uint8Array {
  if (tag.length !== 4) throw new Error(`HLIB encode: tag must be 4 chars, got ${JSON.stringify(tag)}`);
  const count = chunks.length + 1; // member-start pointers + the trailing EOF sentinel
  const headerLen = 16 + 4 * count;
  const total = chunks.reduce((n, c) => n + c.byteLength, headerLen);

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  // Signature "HLIB" (present on every container, master or leaf).
  out[0] = 0x48; out[1] = 0x4c; out[2] = 0x49; out[3] = 0x42;
  dv.setUint32(4, total, true); // file size
  dv.setUint16(8, count - 1, true); // stored count-1
  out[10] = 0; // unused
  out[11] = magic & 0xff;
  for (let i = 0; i < 4; i++) out[12 + i] = tag.charCodeAt(i);

  // Pointer table: member offsets, then EOF == file size.
  let off = headerLen;
  for (let i = 0; i < chunks.length; i++) {
    dv.setUint32(16 + 4 * i, off, true);
    out.set(chunks[i], off);
    off += chunks[i].byteLength;
  }
  dv.setUint32(16 + 4 * chunks.length, total, true); // EOF sentinel
  return out;
}

/**
 * Pack raw member byte-arrays into an HLIB `.GLB`-style library (DATA / DIG4 / generic). Members are
 * written verbatim and delimited by the pointer table — exactly what {@link decodeHlib} exposes as
 * `rawMembers` for non-image containers. With `magic === 1` the first member is the engine's id table
 * (the caller supplies it as `members[0]`); the decode walk is magic-agnostic, so round-trip holds
 * either way. This is the writer the content port (E3: GEO maps / ECL scripts → DQK) uses.
 */
export function encodeHlibDataLibrary(
  members: Uint8Array[],
  opts: { tag?: string; magic?: number } = {},
): Uint8Array {
  return buildContainer(opts.tag ?? 'DATA', opts.magic ?? 0, members);
}

/** Chain-4 column visit order for a row: sweep 0 → cols 0,4,8…; sweep 1 → 1,5,9…; … (length = width). */
function chain4Order(width: number): Int32Array {
  const q = Math.floor(width / 4);
  const order = new Int32Array(width);
  let oi = 0;
  for (let s = 0; s < 4; s++) for (let i = 0; i < q; i++) order[oi++] = i * 4 + s;
  return order;
}

/** Encode one row (already in Chain-4 visit order) as a method-18 PCX-style RLE stream. */
function encodeMethod18Row(row: Uint8Array): number[] {
  const out: number[] = [];
  const w = row.length;
  let col = 0;
  while (col < w) {
    // Length of the identical run starting at col (capped at 129 — repeat control 128..255 → 2..129).
    let runLen = 1;
    while (col + runLen < w && row[col + runLen] === row[col] && runLen < 129) runLen++;
    if (runLen >= 2) {
      out.push(257 - runLen, row[col]); // control c = 257 − count, then the repeated value
      col += runLen;
    } else {
      // Gather literals until a ≥2 repeat begins or the 128-literal cap is hit.
      const start = col;
      let lit = 0;
      while (col < w && lit < 128) {
        if (col + 1 < w && row[col + 1] === row[col]) break; // a repeat run starts next
        col++; lit++;
      }
      out.push(lit - 1); // control c < 128 → copy c+1 literals
      for (let k = 0; k < lit; k++) out.push(row[start + k]);
    }
  }
  return out;
}

/**
 * Encode one image as a method-23 "compressed transparent" stream — the exact inverse of the decoder's
 * `dm === 23` branch: 4 **image** sweeps (outer; sweep `s` covers columns `s, s+4, …`), rows inner,
 * every row terminated by a `0` control byte. Controls: `c < 128` copies `c` literal pixels;
 * `c >= 128` skips `256 − c` transparent (index-255) columns, which the engine leaves untouched so the
 * backdrop shows through. Canonical choices, all verified byte-identical against the 93 method-23
 * streams in the real DISK2 `SPRIT.TLB` (see `hlibEncode.test.ts`): transparent pixels are always
 * encoded as skips (never as literal 255 — the original packer never does either), and a transparent
 * run reaching the row end is dropped entirely (the row terminator already implies it; the decoder's
 * fresh 255-fill supplies those pixels).
 */
function encodeMethod23(indices: Uint8Array, width: number, height: number): number[] {
  const q = Math.floor(width / 4);
  const out: number[] = [];
  for (let s = 0; s < 4; s++) {
    for (let y = 0; y < height; y++) {
      let col = 0;
      while (col < q) {
        if (indices[y * width + (col * 4 + s)] === 255) {
          // Transparent run: measure it; drop it if it reaches the row end, else emit ≤128-col skips.
          let t = 1;
          while (col + t < q && indices[y * width + ((col + t) * 4 + s)] === 255) t++;
          if (col + t >= q) break;
          while (t > 0) {
            const step = Math.min(t, 128);
            out.push(256 - step); // skip control: c = 256 − count
            t -= step;
            col += step;
          }
        } else {
          // Literal run of opaque pixels (control 1..127, then that many pixel bytes).
          const start = col;
          let lit = 0;
          while (col < q && lit < 127 && indices[y * width + (col * 4 + s)] !== 255) { col++; lit++; }
          out.push(lit);
          for (let k = 0; k < lit; k++) out.push(indices[y * width + ((start + k) * 4 + s)]);
        }
      }
      out.push(0); // row terminator
    }
  }
  return out;
}

/**
 * Encode one indexed image as an HLIB image chunk (8-byte header + Chain-4 body). `method` 16 is
 * uncompressed opaque (lossless, simplest); 18 is compressed opaque (the workhorse the real BIGPIC
 * backdrops use); **21 is uncompressed transparent** — the body is byte-identical to method 16 (the
 * decoder treats them the same raster), the only difference being that index 255 is the transparent
 * key, so callers writing transparent sprites (DQK COMSPR/CBODY/ALWAYS leaf TILEs) put 255 at the
 * see-through pixels and emit with method 21; **23 is compressed transparent** (the DQK SPRIT.TLB
 * combat-sprite codec — see {@link encodeMethod23}), same 255-key convention as 21. Width must be a
 * multiple of 4 (width/4 is stored in one byte).
 *
 * The header's vertical/horizontal placement offsets are preserved from `image.yOffset/xOffset`.
 * HLIB stores the inverse sign (positive values move the source up/left), so ordinary positive
 * screen coordinates are written as negative offsets. Trailing padding beyond the compressed stream
 * is not reproduced. Method-23 chunks ARE
 * word-aligned with one 0x00 pad when the stream length is odd, matching the original packer
 * (verified: every odd-length SPRIT.TLB method-23 stream carries exactly that pad, even-length ones none).
 */
export function encodeHlibImage(image: { width: number; height: number; indices: Uint8Array; xOffset?: number; yOffset?: number }, method = 16): Uint8Array {
  const { width, height, indices } = image;
  if (width % 4 !== 0) throw new Error(`HLIB encode: width must be %4==0, got ${width}`);
  if (width <= 0 || height <= 0 || width > 4096 || height > 2048) throw new Error(`HLIB encode: bad geometry ${width}x${height}`);
  if (indices.length < width * height) throw new Error(`HLIB encode: indices too short (${indices.length} < ${width * height})`);
  if (method !== 16 && method !== 18 && method !== 21 && method !== 23) throw new Error(`HLIB encode: unsupported draw method ${method} (16, 18, 21, or 23)`);

  const order = chain4Order(width);
  const q = Math.floor(width / 4);

  let body: Uint8Array;
  if (method === 16 || method === 21) {
    body = new Uint8Array(width * height);
    let k = 0;
    for (let y = 0; y < height; y++) {
      for (let s = 0; s < 4; s++) {
        for (let i = 0; i < q; i++) body[k++] = indices[y * width + (i * 4 + s)];
      }
    }
  } else if (method === 18) {
    // method 18: per-row RLE over the full Chain-4 row order.
    const stream: number[] = [];
    const row = new Uint8Array(width);
    for (let y = 0; y < height; y++) {
      for (let c = 0; c < width; c++) row[c] = indices[y * width + order[c]];
      stream.push(...encodeMethod18Row(row));
    }
    body = Uint8Array.from(stream);
  } else {
    // method 23: sweep-major transparent RLE; word-align the chunk (8 + body) like the original packer.
    const stream = encodeMethod23(indices, width, height);
    if (stream.length % 2 !== 0) stream.push(0);
    body = Uint8Array.from(stream);
  }

  const out = new Uint8Array(8 + body.byteLength);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, height, true);
  dv.setInt16(2, -(image.yOffset ?? 0), true); // stored vertical offset has inverse sign
  dv.setInt16(4, -(image.xOffset ?? 0), true); // stored horizontal offset has inverse sign
  out[6] = width / 4;
  out[7] = method;
  out.set(body, 8);
  return out;
}

/**
 * Encode an HLIB colour table (8-byte header + RGB triplets). Writes the palette's defined slice
 * `[firstColor, firstColor+count)` as full 8-bit RGB (no DAC scaling). Undefined slots in that range
 * are written black.
 */
export function encodeHlibColorTable(palette: Palette): Uint8Array {
  const first = palette.firstColor ?? 0;
  const count = palette.count ?? palette.colors.filter((c) => c !== null).length;
  const out = new Uint8Array(8 + count * 3);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 0, true); // cycle < 3 → no colour cycling
  dv.setUint16(2, first, true);
  dv.setUint16(4, count, true);
  out[6] = 0; // nranges
  out[7] = 8; // cmagic (observed value)
  let p = 8;
  for (let c = 0; c < count; c++) {
    const rgb: RGB | null = palette.colors[first + c] ?? null;
    out[p++] = rgb ? rgb.r & 0xff : 0;
    out[p++] = rgb ? rgb.g & 0xff : 0;
    out[p++] = rgb ? rgb.b & 0xff : 0;
  }
  return out;
}

/**
 * Pack indexed images into a leaf `TILE` library: one shared colour table then one chunk per image.
 * Uses `magic === 0` layout (`ptr[0]` = colour table, `ptr[1..]` = images) — the form
 * {@link decodeHlib} reads back positionally. `method` selects the per-image encoding (16 raw opaque,
 * 18 compressed opaque, 21 raw transparent, or 23 compressed transparent — 255 = see-through). With
 * `palette === null` no colour table is written (the `cpic`/topview "no palette" leaf form: `ptr[0]`
 * is the first image).
 */
export function encodeHlibTile(
  images: { width: number; height: number; indices: Uint8Array; xOffset?: number; yOffset?: number }[],
  palette: Palette | null,
  opts: { method?: number } = {},
): Uint8Array {
  const method = opts.method ?? 16;
  const chunks: Uint8Array[] = [];
  if (palette) chunks.push(encodeHlibColorTable(palette));
  for (const img of images) chunks.push(encodeHlibImage(img, method));
  return buildContainer('TILE', 0, chunks);
}

/**
 * Re-encode a decoded {@link IndexedImage} (e.g. straight from `decodeHlib`) as a single-image leaf
 * TILE — the round-trip convenience used when converting one frame at a time. The image's own palette
 * is written as the leaf colour table.
 */
export function encodeHlibTileFromImage(image: IndexedImage, method = 16): Uint8Array {
  return encodeHlibTile([image], image.palette, { method });
}

/**
 * A master art container's set-index table (member[0]). The HLIB master walk **skips** member[0] (it
 * decodes the sets at `ptr[1..]`), so its exact field semantics are decode-irrelevant and remain
 * UNLOCATED — this writes a well-formed placeholder of the right *shape* (a `u16` set count followed
 * by one `u16` index per set, matching the real BIGPIC.TLB member[0]'s 14 bytes for 3 sets), not a
 * reverse-engineered layout. Callers with a real table can pass it through {@link encodeHlibMaster}.
 */
function defaultSetIdTable(n: number): Uint8Array {
  const out = new Uint8Array(2 + n * 4);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, n, true);
  for (let i = 0; i < n; i++) dv.setUint16(2 + i * 4, i, true);
  return out;
}

/**
 * Pack leaf `TILE` sets into a **master** HLIB art container (`.TLB` like BIGPIC/CPIC) — the form
 * {@link decodeHlib} reads as a multi-set archive: `ptr[0]` = a set-index table, `ptr[1..]` = the leaf
 * TILE sub-containers, last = EOF. Each set keeps its own colour table (so per-frame palettes survive
 * losslessly), exactly mirroring DQK's master-art layout. The default `magic` is 1 (as the real art
 * masters carry); pass `setIdTable` to supply a real member[0], else a shape-correct placeholder is
 * written (see {@link defaultSetIdTable}).
 */
export function encodeHlibMaster(
  sets: Uint8Array[],
  opts: { magic?: number; setIdTable?: Uint8Array } = {},
): Uint8Array {
  if (sets.length === 0) throw new Error('HLIB encode: a master needs at least one set');
  const idTable = opts.setIdTable ?? defaultSetIdTable(sets.length);
  return buildContainer('HLIB', opts.magic ?? 1, [idTable, ...sets]);
}

/** One flattened slot's replacement art for {@link rebuildHlibMasterWithSlotReplacements}: the new
 * image (already cropped to the slot's exact original geometry) plus an optional palette whose
 * defined slice is patched over the owning set's colour-table RGB bytes. */
export interface HlibSlotReplacement {
  image: { width: number; height: number; indices: Uint8Array };
  palette?: Palette | null;
}

/** Read the pointer list of a container header at `base` (offsets kept relative to `base`). */
function readContainerPtrs(bytes: Uint8Array, base: number): { magic: number; tag: string; ptrs: number[] } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = dv.getUint16(base + 8, true) + 1;
  const magic = bytes[base + 11];
  const tag = String.fromCharCode(bytes[base + 12], bytes[base + 13], bytes[base + 14], bytes[base + 15]);
  const ptrs: number[] = [];
  for (let i = 0; i < count; i++) ptrs.push(dv.getUint32(base + 16 + 4 * i, true));
  return { magic, tag, ptrs };
}

/**
 * Rebuild a MASTER art container (`.TLB` like PICA/SPRIT) with some flattened image slots replaced —
 * the DROP-IN override builder the cok-on-dqk build requires: the emitted file keeps the original's
 * **real set-id table byte-for-byte** (member[0]; its pointer-#s stay valid because the set count and
 * order never change) and carries every set that holds no replaced slot through **verbatim**, so the
 * override answers every engine picture-id lookup the original did. Only the sets owning a replaced
 * slot are re-assembled: the named image chunk is re-encoded with the slot's ORIGINAL draw method
 * (16/18/21/23 — anything else throws), every other member chunk is kept byte-identical, and when a
 * replacement carries a `palette` its defined slice is patched over the set's colour-table RGB bytes
 * in place (header, colour-cycling ranges and all colours outside the slice stay untouched — the
 * patch must land inside the table's declared `[first, first+ncolors)` window or this throws).
 *
 * Slot numbering is {@link mapHlibMasterSlots}' (= `decodeHlib(original).images` order). Each
 * replacement image must already be exactly the slot's original width×height — this function never
 * crops or pads; geometry policy belongs to the caller (`buildMappedArtOverride`).
 */
export function rebuildHlibMasterWithSlotReplacements(
  original: Uint8Array,
  replacements: Map<number, HlibSlotReplacement>,
): Uint8Array {
  const refs = mapHlibMasterSlots(original); // throws on non-master
  if (replacements.size === 0) throw new Error('HLIB rebuild: no slot replacements supplied');
  const bySet = new Map<number, { slot: number; rep: HlibSlotReplacement }[]>();
  for (const [slot, rep] of replacements) {
    const ref = refs[slot];
    if (!ref) throw new Error(`HLIB rebuild: slot ${slot} out of range (0..${refs.length - 1})`);
    if (rep.image.width !== ref.width || rep.image.height !== ref.height) {
      throw new Error(
        `HLIB rebuild: slot ${slot} replacement is ${rep.image.width}x${rep.image.height}, ` +
          `original is ${ref.width}x${ref.height} (caller must crop/pad first)`,
      );
    }
    if (![16, 18, 21, 23].includes(ref.drawMethod)) {
      throw new Error(`HLIB rebuild: slot ${slot} uses unsupported draw method ${ref.drawMethod}`);
    }
    const list = bySet.get(ref.setPtrIndex) ?? [];
    list.push({ slot, rep });
    bySet.set(ref.setPtrIndex, list);
  }

  const master = readContainerPtrs(original, 0);
  const members: Uint8Array[] = [original.subarray(master.ptrs[0], master.ptrs[1])]; // set-id table VERBATIM
  for (let si = 1; si < master.ptrs.length - 1; si++) {
    const setBase = master.ptrs[si];
    const setSlice = original.subarray(setBase, master.ptrs[si + 1]);
    const reps = bySet.get(si);
    if (!reps) {
      members.push(setSlice); // unmapped set: carried over byte-for-byte
      continue;
    }
    const leaf = readContainerPtrs(original, setBase);
    const chunks: Uint8Array[] = [];
    for (let mi = 0; mi < leaf.ptrs.length - 1; mi++) {
      chunks.push(original.subarray(setBase + leaf.ptrs[mi], setBase + leaf.ptrs[mi + 1]));
    }
    // Locate the set's colour table (magic 1: ptr[1]; magic 0: ptr[0] unless it is the "no palette"
    // leaf form, detected exactly like the decoder: ncolors == 0 means ptr[0] is already an image).
    const ctIndex = leaf.magic === 1 ? 1 : 0;
    const ctChunk = chunks[ctIndex];
    const dvAt = (c: Uint8Array, off: number) => new DataView(c.buffer, c.byteOffset, c.byteLength).getUint16(off, true);
    const hasColorTable = ctChunk && ctChunk.byteLength >= 8 && dvAt(ctChunk, 4) > 0;
    for (const { slot, rep } of reps) {
      const ref = refs[slot];
      chunks[ref.imagePtrIndex] = encodeHlibImage(rep.image, ref.drawMethod);
      if (rep.palette) {
        if (!hasColorTable) {
          throw new Error(`HLIB rebuild: slot ${slot} carries a palette but its set stores no colour table`);
        }
        const tblFirst = dvAt(ctChunk, 2);
        const tblNcol = dvAt(ctChunk, 4);
        const first = rep.palette.firstColor ?? 0;
        const count = rep.palette.count ?? 0;
        if (first < tblFirst || first + count > tblFirst + tblNcol) {
          throw new Error(
            `HLIB rebuild: slot ${slot} palette slice [${first},${first + count}) outside the ` +
              `set colour-table window [${tblFirst},${tblFirst + tblNcol})`,
          );
        }
        const patched = chunks[ctIndex] === ctChunk ? new Uint8Array(ctChunk) : chunks[ctIndex]; // copy once
        for (let c = 0; c < count; c++) {
          const rgb: RGB | null = rep.palette.colors[first + c] ?? null;
          if (!rgb) continue;
          const p = 8 + (first + c - tblFirst) * 3;
          patched[p] = rgb.r & 0xff;
          patched[p + 1] = rgb.g & 0xff;
          patched[p + 2] = rgb.b & 0xff;
        }
        chunks[ctIndex] = patched;
      }
    }
    members.push(buildContainer(leaf.tag, leaf.magic, chunks));
  }
  return buildContainer(master.tag, master.magic, members);
}

/** One entry of a master container's set-id table (docs/hlib-format.md §1c, magic==1 layout). */
export interface HlibSetIdEntry {
  /** The logical image/set ID# the engine looks up (e.g. GEO header wall-set bytes name these). */
  id: number;
  /** Pointer-# — 1-based into the container's own pointer list (`ptr[1]` = the first set). */
  ptr: number;
}

/**
 * Decode a master container's set-id table (member[0], `magic===1`): `WORD count` then
 * `count × {WORD id, WORD ptr#}` — docs/hlib-format.md §1c. Read-only companion to
 * {@link encodeHlibSetIdTable}; both sides are exercised by {@link appendHlibMasterSets}.
 */
export function decodeHlibSetIdTable(bytes: Uint8Array): HlibSetIdEntry[] {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = dv.getUint16(0, true);
  const out: HlibSetIdEntry[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ id: dv.getUint16(2 + 4 * i, true), ptr: dv.getUint16(2 + 4 * i + 2, true) });
  }
  return out;
}

/** Encode a set-id table from entries — the exact inverse of {@link decodeHlibSetIdTable}. */
export function encodeHlibSetIdTable(entries: HlibSetIdEntry[]): Uint8Array {
  const out = new Uint8Array(2 + entries.length * 4);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, entries.length, true);
  entries.forEach((e, i) => {
    dv.setUint16(2 + 4 * i, e.id & 0xffff, true);
    dv.setUint16(2 + 4 * i + 2, e.ptr & 0xffff, true);
  });
  return out;
}

/**
 * Append new leaf `TILE` sets to a MASTER art container (e.g. `8X8DB.TLB`), extending its real
 * set-id table with NEW `{id, ptr#}` entries — an append-only sibling of
 * {@link rebuildHlibMasterWithSlotReplacements}: every existing set and every existing table entry
 * is carried through byte-for-byte (same set count, same pointer positions), only NEW pointer-table
 * slots + NEW table rows are added at the end. This is the mechanism the CoK/DoK wall-art port
 * (`cok-m4-fidelity-plan.md` §8's "faithful fix") uses to pack the source game's own 8×8 wall tiles
 * as additional `8X8DB.TLB` sets under ids that don't collide with the shipped native ones (the
 * caller picks ids — see `cokWallPort.ts`).
 *
 * Throws if `original` isn't a MASTER container, no new sets are supplied, or a supplied id already
 * exists in the table (this function only adds; it never overwrites — use
 * {@link rebuildHlibMasterWithSlotReplacements} to replace an existing slot's art instead).
 */
export function appendHlibMasterSets(
  original: Uint8Array,
  newSets: { id: number; leaf: Uint8Array }[],
): Uint8Array {
  const { magic, tag, ptrs } = readContainerPtrs(original, 0);
  if (tag !== 'HLIB') throw new Error(`HLIB append: not a master container (tag ${JSON.stringify(tag)})`);
  if (newSets.length === 0) throw new Error('HLIB append: no new sets supplied');

  const entries = decodeHlibSetIdTable(original.subarray(ptrs[0], ptrs[1]));
  const existingIds = new Set(entries.map((e) => e.id));
  for (const s of newSets) {
    if (existingIds.has(s.id)) throw new Error(`HLIB append: id ${s.id} already present in the set-id table`);
    existingIds.add(s.id);
  }

  // ptrs = [set-id table, set_1 .. set_N, EOF] -> N existing sets = ptrs.length - 2.
  const existingSetCount = ptrs.length - 2;
  const members: Uint8Array[] = [];
  for (let si = 1; si < ptrs.length - 1; si++) members.push(original.subarray(ptrs[si], ptrs[si + 1])); // verbatim
  const newEntries = [...entries];
  newSets.forEach((s, k) => {
    members.push(s.leaf);
    newEntries.push({ id: s.id, ptr: existingSetCount + 1 + k }); // 1-based, continues after the last existing set
  });

  return buildContainer(tag, magic, [encodeHlibSetIdTable(newEntries), ...members]);
}
