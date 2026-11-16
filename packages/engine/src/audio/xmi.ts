/**
 * XMIDI (`.XMI`) music container decoder — DQK's AdLib/Roland/Tandy music format (Phase C, C5a).
 *
 * The Dark Queen of Krynn ships its music as Miles AIL **XMIDI** files: `ADDQ1..3.XMI`
 * (AdLib/OPL2), plus `RODQ*` (Roland MT-32), `TYDQ*` (Tandy) and `PCDQ*` (PC speaker)
 * variants of the same three songs. An `.XMI` is an EA IFF-85 tree:
 *
 * ```
 * FORM XDIR
 *   INFO  u16(LE) sequence-count
 * CAT  XMID
 *   FORM XMID            (one per song)
 *     TIMB u16(LE) count, then count × { u8 patch, u8 bank }
 *     RBRN ...           (optional branch table — ignored here)
 *     EVNT <XMIDI event stream>
 * ```
 *
 * The two top-level groups (`FORM XDIR` and `CAT XMID`) are siblings, concatenated.
 *
 * **The XMIDI event stream** differs from Standard MIDI in two ways:
 *  1. **Delay** before an event is a run of bytes each `< 0x80`, *summed* (not a VLQ) — a
 *     long rest is several `0x7F` bytes plus a remainder.
 *  2. **Note-on carries an explicit duration** (a standard MIDI VLQ after the velocity); there
 *     are no note-off events — the note self-releases after that many ticks.
 *
 * This module is pure (no DOM/Node) and only *parses* the container + event stream into
 * structured events. Turning ticks into seconds and the OPL2 synthesis live in C5b.
 */

import { readForm, walkChunks, readU32BE, type IffChunk } from './iff.js';

/** A timbre the song asks the driver to load: a General-MIDI-ish `(patch, bank)` pair. */
export interface XmiTimbre {
  patch: number;
  bank: number;
}

/** A decoded XMIDI event, tagged by kind, with its absolute tick (summed delays). */
export type XmiEvent =
  | { tick: number; kind: 'noteOn'; channel: number; note: number; velocity: number; duration: number }
  | { tick: number; kind: 'controller'; channel: number; controller: number; value: number }
  | { tick: number; kind: 'program'; channel: number; program: number }
  | { tick: number; kind: 'channelPressure'; channel: number; value: number }
  | { tick: number; kind: 'aftertouch'; channel: number; note: number; value: number }
  | { tick: number; kind: 'pitchBend'; channel: number; value: number }
  | { tick: number; kind: 'tempo'; usPerQuarter: number }
  | { tick: number; kind: 'timeSignature'; numerator: number; denominator: number }
  | { tick: number; kind: 'endOfTrack' }
  | { tick: number; kind: 'meta'; metaType: number; data: Uint8Array }
  | { tick: number; kind: 'sysex'; data: Uint8Array };

/** One song inside an `.XMI`: its requested timbres and its decoded event stream. */
export interface XmiSong {
  timbres: XmiTimbre[];
  events: XmiEvent[];
  /** Tick of the last event (the song's length in XMIDI ticks). */
  durationTicks: number;
}

/** A decoded `.XMI` file: the sequence count from `INFO` and one entry per song. */
export interface XmiFile {
  /** Sequence count declared by the `XDIR`/`INFO` chunk. */
  declaredCount: number;
  songs: XmiSong[];
}

/** Children of a `FORM`/`CAT `/`LIST` group `IffChunk` (skipping its 4-byte form type). */
function groupChildren(bytes: Uint8Array, chunk: IffChunk): IffChunk[] {
  return walkChunks(bytes, chunk.start + 4, chunk.length - 4);
}

/** Read a standard MIDI variable-length quantity at `off`; returns the value and bytes used. */
function readVlq(bytes: Uint8Array, off: number): { value: number; size: number } {
  let value = 0;
  let size = 0;
  for (;;) {
    const b = bytes[off + size];
    value = (value << 7) | (b & 0x7f);
    size++;
    if ((b & 0x80) === 0 || size >= 4) break;
  }
  return { value, size };
}

/** Parse a `TIMB` chunk payload into its `(patch, bank)` timbre list. */
function parseTimb(bytes: Uint8Array, chunk: IffChunk): XmiTimbre[] {
  const count = bytes[chunk.start] | (bytes[chunk.start + 1] << 8); // u16 LE
  const out: XmiTimbre[] = [];
  for (let i = 0; i < count; i++) {
    const p = chunk.start + 2 + i * 2;
    if (p + 1 >= chunk.start + chunk.length) break;
    out.push({ patch: bytes[p], bank: bytes[p + 1] });
  }
  return out;
}

/**
 * Decode the XMIDI `EVNT` stream in `[start, start+length)` into absolute-tick events.
 * Robust to a truncated tail (stops cleanly at the range end / on a malformed status).
 */
function parseEvnt(bytes: Uint8Array, start: number, length: number): XmiEvent[] {
  const end = start + length;
  const events: XmiEvent[] = [];
  let off = start;
  let tick = 0;

  while (off < end) {
    // 1) Delay: sum all consecutive bytes < 0x80 (XMIDI interval encoding).
    while (off < end && bytes[off] < 0x80) {
      tick += bytes[off];
      off++;
    }
    if (off >= end) break;

    const status = bytes[off++];
    const type = status & 0xf0;
    const channel = status & 0x0f;

    if (type === 0x90) {
      // Note-on with an explicit VLQ duration (no note-off in XMIDI).
      const note = bytes[off++];
      const velocity = bytes[off++];
      const { value, size } = readVlq(bytes, off);
      off += size;
      events.push({ tick, kind: 'noteOn', channel, note, velocity, duration: value });
    } else if (type === 0xa0) {
      const note = bytes[off++];
      const value = bytes[off++];
      events.push({ tick, kind: 'aftertouch', channel, note, value });
    } else if (type === 0xb0) {
      const controller = bytes[off++];
      const value = bytes[off++];
      events.push({ tick, kind: 'controller', channel, controller, value });
    } else if (type === 0xc0) {
      const program = bytes[off++];
      events.push({ tick, kind: 'program', channel, program });
    } else if (type === 0xd0) {
      const value = bytes[off++];
      events.push({ tick, kind: 'channelPressure', channel, value });
    } else if (type === 0xe0) {
      const lo = bytes[off++];
      const hi = bytes[off++];
      events.push({ tick, kind: 'pitchBend', channel, value: lo | (hi << 7) });
    } else if (status === 0xff) {
      // Meta event: type byte, VLQ length, data.
      const metaType = bytes[off++];
      const { value: len, size } = readVlq(bytes, off);
      off += size;
      const data = bytes.subarray(off, off + len);
      off += len;
      if (metaType === 0x2f) {
        events.push({ tick, kind: 'endOfTrack' });
        break; // end-of-track terminates the song
      } else if (metaType === 0x51 && len >= 3) {
        events.push({ tick, kind: 'tempo', usPerQuarter: (data[0] << 16) | (data[1] << 8) | data[2] });
      } else if (metaType === 0x58 && len >= 2) {
        events.push({ tick, kind: 'timeSignature', numerator: data[0], denominator: 1 << data[1] });
      } else {
        events.push({ tick, kind: 'meta', metaType, data });
      }
    } else if (status === 0xf0 || status === 0xf7) {
      const { value: len, size } = readVlq(bytes, off);
      off += size;
      events.push({ tick, kind: 'sysex', data: bytes.subarray(off, off + len) });
      off += len;
    } else {
      // Unknown / corrupt status (XMIDI has no running status) — stop to stay honest.
      break;
    }
  }
  return events;
}

/** Decode one `FORM XMID` song group into its timbres + events. */
function parseSong(bytes: Uint8Array, song: IffChunk): XmiSong {
  const children = groupChildren(bytes, song);
  const timbChunk = children.find((c) => c.id === 'TIMB');
  const evntChunk = children.find((c) => c.id === 'EVNT');
  const timbres = timbChunk ? parseTimb(bytes, timbChunk) : [];
  const events = evntChunk ? parseEvnt(bytes, evntChunk.start, evntChunk.length) : [];
  const durationTicks = events.length ? events[events.length - 1].tick : 0;
  return { timbres, events, durationTicks };
}

/** True if `bytes` looks like an XMIDI file (`FORM` … `XDIR` or `XMID`, or a bare `CAT XMID`). */
export function sniffXmi(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  const id = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const type = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  if (id === 'FORM' && (type === 'XDIR' || type === 'XMID')) return true;
  return id === 'CAT ' && type === 'XMID';
}

/**
 * Decode an `.XMI` file into its songs. Handles the canonical `FORM XDIR` + `CAT XMID`
 * layout and the degenerate single-song forms (`CAT XMID` only, or a lone `FORM XMID`).
 */
export function decodeXmi(bytes: Uint8Array): XmiFile {
  if (!sniffXmi(bytes)) throw new Error('decodeXmi: not an XMIDI file');

  const idAt = (off: number): string =>
    off + 4 <= bytes.length
      ? String.fromCharCode(bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3])
      : '';

  let declaredCount = 0;
  let off = 0;

  // First group: either FORM XDIR (carrying the INFO sequence count) or straight into the catalogue.
  if (idAt(0) === 'FORM' && idAt(8) === 'XDIR') {
    const xdir = readForm(bytes, 0);
    const info = xdir.chunks.find((c) => c.id === 'INFO');
    if (info && info.length >= 2) declaredCount = bytes[info.start] | (bytes[info.start + 1] << 8);
    off = 8 + readU32BE(bytes, 4); // skip the whole XDIR FORM (id+len+payload)
  }

  // Locate the CAT XMID (the song catalogue), or a lone FORM XMID.
  const songForms: IffChunk[] = [];
  if (off + 12 <= bytes.length) {
    if (idAt(off) === 'CAT ' && idAt(off + 8) === 'XMID') {
      const cat = readForm(bytes, off);
      for (const child of cat.chunks) if (child.id === 'FORM') songForms.push(child);
    } else if (idAt(off) === 'FORM' && idAt(off + 8) === 'XMID') {
      songForms.push({ id: 'FORM', start: off + 8, length: readU32BE(bytes, off + 4) });
    }
  }

  const songs = songForms.map((s) => parseSong(bytes, s));
  if (declaredCount === 0) declaredCount = songs.length;
  return { declaredCount, songs };
}
