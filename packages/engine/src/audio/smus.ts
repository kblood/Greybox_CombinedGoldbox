/**
 * IFF SMUS decoder — Amiga "Simple Musical Score", the format of the Krynn Amiga music
 * (`krynn` title theme in CoK; `krynn.smu` / `action.smu` / … in DoK).
 *
 * A SMUS file is `FORM SMUS` containing an `SHDR` (tempo, volume, track count), one `NAME`,
 * a run of `INS1` instrument references, then one `TRAK` per voice. Each `TRAK` is a packed
 * array of 2-byte **SEvents**: `sID` selects the event kind, `data` carries its argument.
 *
 *   sID 0..127  → NOTE, pitch = sID (MIDI note number, 60 = middle C). The `data` byte is a
 *                 packed **note-value code** (see {@link durationBeats}); high bits flag chord/tie.
 *   sID 128     → REST (same note-value `data`).
 *   sID 129     → INSTRUMENT (set the track's instrument index = `data`).
 *   sID 136     → TEMPO (data = BPM directly).
 *   sID 130..137→ TIMESIG / KEYSIG / dynamics / clef … (structural; passed through as 'other').
 *
 * **Duration is NOT linear ticks.** The `data` byte packs `chord(7) | tie(6) | nTuplet(5:4) |
 * dot(3) | division(2:0)`, where `division` is a note-value code (0=whole … 2=quarter … 7=128th).
 * An earlier reading treated `data & 0x3F` as a raw tick count, which conflated all five fields and
 * mangled every note length (e.g. `0x0B` is a *dotted eighth* = 0.75 beats, not "11 ticks"). We now
 * decode the real value as **quarter-note beats** (`durationBeats`) and let the player multiply by
 * `60 / tempoBPM`. Tempo is `tempoRaw / 128` ("128ths of a quarter-note per minute" per the EA IFF
 * SMUS spec — the old `/256` ran every score at half speed). Verified against the actual CoK/DoK
 * files (CoK `krynn`=120 BPM, DoK `krynn.smu`=148 BPM, the latter cross-checked by its inline
 * SID_Tempo=148 event and its extensive triplet `nTuplet=1` durations). Refs: AmigaOS-Wiki "SMUS IFF".
 */
import { readForm, findChunk, readU16BE, chunkText } from './iff.js';

/** One decoded SMUS track event. */
export type SmusEvent =
  | { kind: 'note'; pitch: number; durationBeats: number; chord: boolean; tie: boolean }
  | { kind: 'rest'; durationBeats: number }
  | { kind: 'instrument'; instrument: number }
  /** Inline tempo change (SID_Tempo, sID 136): `bpm` is quarter-notes per minute, used as-is. */
  | { kind: 'tempo'; bpm: number }
  | { kind: 'other'; sID: number; data: number };

/** A parsed SMUS score: header tempo/volume plus one event stream per track. */
export interface SmusScore {
  /** Quarter-notes per minute (SHDR `tempo / 128`). */
  tempoBPM: number;
  /** Score-wide default volume, 0..127. */
  volume: number;
  /** Instrument names from the `INS1` reference chunks, in order. */
  instruments: string[];
  /** Event streams, one per `TRAK` chunk (voice). */
  tracks: SmusEvent[][];
}

// SEvent sID ranges / codes (EA IFF SMUS).
const SID_LAST_NOTE = 127;
const SID_REST = 128;
const SID_INSTRUMENT = 129;
const SID_TEMPO = 136;

// NOTE/REST `data` byte fields (EA IFF SMUS SNote): chord|tie|nTuplet(2)|dot|division(3).
const CHORD_BIT = 0x80; // sounded together with the following note
const TIE_BIT = 0x40; // tied to the next note of the same pitch

/**
 * Decode a SMUS SNote `data` byte to a duration in **quarter-note beats**. `division` (bits 2:0) is
 * the note value (0=whole=4 beats, 1=half=2, 2=quarter=1, 3=eighth=0.5, … 7=128th); a dot (bit 3)
 * multiplies by 1.5; the nTuplet field (bits 5:4) applies triplet/quintuplet/septuplet scaling.
 */
export function durationBeats(data: number): number {
  const division = data & 0x07;
  let beats = 4 / (1 << division); // 0→4, 1→2, 2→1, 3→0.5, …
  if (data & 0x08) beats *= 1.5; // dotted
  const nTuplet = (data >> 4) & 0x03;
  if (nTuplet === 1) beats *= 2 / 3; // triplet
  else if (nTuplet === 2) beats *= 4 / 5; // quintuplet
  else if (nTuplet === 3) beats *= 6 / 7; // septuplet
  return beats;
}

/**
 * Parse a SMUS file to a {@link SmusScore}.
 * @throws if the bytes are not a `FORM SMUS` or the `SHDR` is missing.
 */
export function parseSmus(bytes: Uint8Array, label = 'SMUS'): SmusScore {
  const form = readForm(bytes, 0);
  if (form.formType !== 'SMUS') throw new Error(`${label}: not a SMUS form (got "${form.formType}")`);

  const shdr = findChunk(form.chunks, 'SHDR');
  if (!shdr) throw new Error(`${label}: missing SHDR chunk`);
  // SHDR: tempo(u16, "128ths of a quarter-note per minute") volume(u8) ctTrack(u8).
  const tempoRaw = readU16BE(bytes, shdr.start);
  const tempoBPM = tempoRaw / 128;
  const volume = bytes[shdr.start + 2];

  const instruments: string[] = [];
  for (const c of form.chunks) {
    if (c.id !== 'INS1') continue;
    // INS1: register(u16) type(u16) then a NUL-terminated name (type 0 = name reference).
    let name = '';
    for (let i = 4; i < c.length; i++) {
      const ch = bytes[c.start + i];
      if (ch === 0) break;
      name += String.fromCharCode(ch);
    }
    instruments.push(name || chunkText(bytes, c));
  }

  const tracks: SmusEvent[][] = [];
  for (const c of form.chunks) {
    if (c.id !== 'TRAK') continue;
    tracks.push(parseTrack(bytes, c.start, c.length));
  }

  return { tempoBPM, volume, instruments, tracks };
}

/** Decode one TRAK chunk's 2-byte SEvent stream into typed events. */
function parseTrack(bytes: Uint8Array, start: number, length: number): SmusEvent[] {
  const events: SmusEvent[] = [];
  const end = start + (length & ~1); // even number of bytes
  for (let off = start; off < end; off += 2) {
    const sID = bytes[off];
    const data = bytes[off + 1];
    if (sID <= SID_LAST_NOTE) {
      events.push({
        kind: 'note',
        pitch: sID,
        durationBeats: durationBeats(data),
        chord: (data & CHORD_BIT) !== 0,
        tie: (data & TIE_BIT) !== 0,
      });
    } else if (sID === SID_REST) {
      events.push({ kind: 'rest', durationBeats: durationBeats(data) });
    } else if (sID === SID_INSTRUMENT) {
      events.push({ kind: 'instrument', instrument: data });
    } else if (sID === SID_TEMPO) {
      events.push({ kind: 'tempo', bpm: data });
    } else {
      events.push({ kind: 'other', sID, data });
    }
  }
  return events;
}
