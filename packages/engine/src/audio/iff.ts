/**
 * Minimal EA IFF-85 chunk reader (big-endian) — the shared substrate for the Amiga audio
 * decoders (`svx8.ts`, `smus.ts`) and, later, IFF/ILBM art.
 *
 * An IFF file is a tree of chunks. Every chunk is a 4-byte ASCII id, a big-endian `u32`
 * length, then that many data bytes, padded to an even boundary with a single 0 byte when
 * the length is odd. The group chunks `FORM` / `CAT ` / `LIST` carry a 4-byte *form type*
 * (e.g. `SMUS`, `8SVX`) before their nested children.
 *
 * This module is pure (no DOM, no Node) and allocation-light: chunk views borrow the input
 * buffer rather than copying. See AmigaOS-Wiki "EA IFF 85" for the canonical layout.
 */

/** A located chunk: its id and the byte range of its *payload* within the source buffer. */
export interface IffChunk {
  /** 4-char ASCII chunk id, e.g. `'VHDR'`, `'BODY'`, `'TRAK'`. Trailing spaces preserved. */
  id: string;
  /** Offset of the first payload byte in the source buffer. */
  start: number;
  /** Payload length in bytes (excludes id, length field, and any pad byte). */
  length: number;
}

/** A group chunk (`FORM`/`CAT `/`LIST`): the form type plus its already-walked children. */
export interface IffForm {
  /** The group id itself (`'FORM'`, `'CAT '`, `'LIST'`). */
  group: string;
  /** The 4-char form/content type, e.g. `'SMUS'`, `'8SVX'`. */
  formType: string;
  /** Direct child chunks, in file order. */
  chunks: IffChunk[];
  /** Payload byte range of the whole group (after id+length), for nested re-walks. */
  start: number;
  length: number;
}

const ID_LEN = 4;

/** Read a 4-char ASCII id at `off`. */
function readId(bytes: Uint8Array, off: number): string {
  return String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]);
}

/** Read a big-endian unsigned 32-bit integer at `off`. */
export function readU32BE(bytes: Uint8Array, off: number): number {
  return (
    ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0
  );
}

/** Read a big-endian unsigned 16-bit integer at `off`. */
export function readU16BE(bytes: Uint8Array, off: number): number {
  return ((bytes[off] << 8) | bytes[off + 1]) & 0xffff;
}

/**
 * Walk the chunks directly contained in the byte range `[start, start+length)`.
 * Stops cleanly at the range end; tolerates a missing final pad byte at EOF.
 */
export function walkChunks(bytes: Uint8Array, start: number, length: number): IffChunk[] {
  const out: IffChunk[] = [];
  const end = start + length;
  let off = start;
  while (off + 8 <= end) {
    const id = readId(bytes, off);
    const len = readU32BE(bytes, off + ID_LEN);
    const payload = off + 8;
    if (payload + len > bytes.length) break; // truncated chunk — stop rather than throw
    out.push({ id, start: payload, length: len });
    off = payload + len + (len & 1); // skip payload + pad byte for odd lengths
  }
  return out;
}

/**
 * Parse a top-level group chunk (`FORM`/`CAT `/`LIST`) at `off` and return its form type
 * and direct children. Throws if the bytes there are not a group chunk.
 */
export function readForm(bytes: Uint8Array, off = 0): IffForm {
  const group = readId(bytes, off);
  if (group !== 'FORM' && group !== 'CAT ' && group !== 'LIST') {
    throw new Error(`readForm: expected FORM/CAT/LIST at ${off}, found "${group}"`);
  }
  const length = readU32BE(bytes, off + ID_LEN);
  const formType = readId(bytes, off + 8);
  const childStart = off + 12; // id(4) + len(4) + formType(4)
  const childLen = length - ID_LEN; // length counts the formType too
  return { group, formType, chunks: walkChunks(bytes, childStart, childLen), start: childStart, length: childLen };
}

/** First chunk with the given id, or null. */
export function findChunk(chunks: IffChunk[], id: string): IffChunk | null {
  return chunks.find((c) => c.id === id) ?? null;
}

/** Read a chunk's payload as a C-string (Latin-1/ASCII, stopping at the first NUL). */
export function chunkText(bytes: Uint8Array, chunk: IffChunk): string {
  let s = '';
  for (let i = 0; i < chunk.length; i++) {
    const ch = bytes[chunk.start + i];
    if (ch === 0) break;
    s += String.fromCharCode(ch);
  }
  return s;
}
