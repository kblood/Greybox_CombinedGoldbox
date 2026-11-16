/**
 * `GLBR` — the DOS Gen1 music note-event format shared verbatim by `MUSIC.DAX` in Death
 * Knights of Krynn, Gateway to the Savage Frontier, Treasures of the Savage Frontier, and
 * Pools of Darkness (`docs/midi-dax-format.md` §2.6). This module decodes the previously
 * open "event body" (§2.5 of that doc) — see `docs/glbr-format.md` for the full
 * reverse-engineering write-up (static disassembly of the resident driver's per-tick
 * service routine, file offset 0x9bd inside `MUSIC.DAX` block 0).
 *
 * ## Format summary (see `docs/glbr-format.md` for the derivation)
 *
 * A GLBR song file: a 44-byte fixed header (magic + reserved + a byte-swapped `444`
 * constant + a loop sentinel + a 32-byte stride + a 16-entry default-duration table — all
 * already decoded, `decodeGlbrFixedHeader`), followed at byte offset **444** by a *second*
 * header:
 *
 * ```
 * @444       10 bytes   raw (unswapped) — byte @452 (offset+8) = channel count N
 * @454       (N+1) x u16 big-endian  — per-channel-descriptor byte offsets, relative to
 *                                      the byte right after this table ("basePtr")
 * basePtr + offsetTable[0]            — "descriptor0": the song's primary control block
 *   +0  u16 be   "timebase" raw (divided by 84 at runtime -> the per-channel tick divisor)
 *   +2  u8       patch/instrument id (semantics NOT reversed; every sampled song across all 4
 *                titles reads the same value, 127, so this is likely a "no override" sentinel.
 *                NOT the same mechanism as the per-voice OPL2 instrument bank below — that one
 *                addresses by voice/channel index, not by this byte)
 *   +3  u8       channel count (redundant with the byte @452)
 *   +4  (u16 be)[]  per-channel relative offsets; channel `idx`'s event stream starts at
 *                   `descriptor0Off + 0x0e + offset[idx]`
 * ```
 *
 * Each channel's event stream is a sequence of 2-byte pairs `[value, durationCode]`,
 * terminated by `0xFF`:
 *
 * - `value` in `0x00..0x7F`  — **note-on**, `value` = MIDI-numbered note (verified: the
 *   real-file pitch histogram peaks exactly at 60 = middle C, range 34-92 — five plausible
 *   melodic octaves, not noise).
 * - `value == 0x80` — **rest** (silence for `durationCode` ticks).
 * - `value == 0x81` — explicit note-off / stop (zero-duration, immediate).
 * - `value == 0x84` — reset channel velocity to max (zero-duration, immediate).
 * - `value` otherwise in `0x82..0xFE` — unhandled by the driver at this call site
 *   (structurally a real code — real files show only `0x82/0x83/0x87/0x88`, clustering at
 *   stream-start like an instrument-setup preamble — but zero-duration/no-op here).
 * - `value == 0xFF` — end of this channel's stream.
 *
 * `durationCode` (every pair's second byte, including control-code pairs, though only
 * note/rest pairs consume it) packs:
 *
 * ```
 * bits 0-2   note-length class (0-7): raw = 0x6900 >> class      (halves per class step)
 * bit  3     dotted flag: raw = floor((raw >> 1) * 3)             (x1.5, integer)
 * bits 4-5   tuplet selector (0-3): d = sel*2; if sel: raw = floor(raw / (d+1)) * d
 * bit  6     tie/sustain flag (observed 3.7% of real notes; suppresses retrigger)
 * ```
 *
 * `raw` is then divided by the song's per-channel tick divisor (`descriptor0.timebase /
 * 84`, integer) to give a tick count; the resident driver runs its tick clock at a fixed
 * PIT divisor of `0x4000`, i.e. `1,193,180 / 16384 ≈ 72.8 Hz` (`docs/midi-dax-format.md`
 * §2.3, independently re-verified during this investigation).
 *
 * ## Verification (not just "it parses")
 *
 * Every one of ~90 channel streams across all 4 titles' every song (~12,000 event pairs)
 * parses to a clean `0xFF` terminator with zero out-of-range reads and only ~2% "unknown
 * control code" pairs (never garbage byte values) — see `docs/glbr-format.md` §4 for the
 * full cross-title table. The pitch histogram, duration-class histogram, and rare-flag
 * rates (dotted/tuplet/tie) all look like real hand-composed music, not decoded noise.
 *
 * ## Instrument/timbre bank — SOLVED (2026-07-21, `docs/glbr-format.md` §5a)
 *
 * Each song embeds an 8-voice OPL2 instrument bank (`decodeGlbrInstrumentBank`), located by
 * disassembling hardware-backend-2's `SetParam` handler in `MUSIC.DAX` block 0. `decodeGlbrSong`
 * decodes it automatically into `GlbrSong.instruments`; `renderGlbrChannel` uses a channel's own
 * instrument (via `GlbrChannel.channelIndex`) when the caller doesn't override `opts.patch`,
 * falling back to `GLBR_PLACEHOLDER_PATCH` only when a voice's record fell out of bounds. The
 * `descriptor0.patchId` field (constant `127` across every sampled song) is NOT part of this
 * mechanism — the bank is addressed purely by voice/channel index, not by that byte; its true
 * purpose remains unresolved.
 *
 * ## What is NOT solved here
 *
 * Backend index 3's own 18-byte-per-voice bank (same addressing formula, different record shape)
 * is left undecoded (structured-looking bytes, no register mapping reversed). Which of hardware
 * indices 3-5 is Sound Blaster / Roland MT-32 / Tandy remains open (`docs/midi-dax-format.md`
 * §2.4) — only index 2 is now pinned, as (very likely) AdLib/OPL2, by the instrument-bank shape
 * match. Whether GLBR channel index == OPL2 voice slot 1:1 is an inference from the driver's
 * fixed 8-voice setup loop, not confirmed by a dynamic trace.
 */
import { renderOplNote, parseAdLibPatch, type OplPatch, midiNoteToFreq } from './opl2.js';
import type { AudioClip } from './svx8.js';

/** Fixed constant the note-length class shifts right of (see the module doc). */
const DURATION_BASE = 0x6900;

/** The resident driver's fixed tick clock: PIT divisor 0x4000 (`docs/midi-dax-format.md` §2.3). */
export const GLBR_TICK_HZ = 1_193_180 / 16384;

/** Byte offset of the GLBR "second header" (channel count + per-channel offset table). */
const SECOND_HEADER_OFFSET = 444;

function be16(b: Uint8Array, off: number): number {
  return ((b[off] << 8) | b[off + 1]) >>> 0;
}

/** True if `bytes` starts with the 4-byte `GLBR` magic. */
export function sniffGlbr(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x4c && bytes[2] === 0x42 && bytes[3] === 0x52;
}

/** The 44-byte fixed GLBR header (`docs/midi-dax-format.md` §2.2) — already-solved fields. */
export interface GlbrFixedHeader {
  reserved: number;
  /** Byte-swapped constant; every sampled song across all 4 titles reads 444 (0x1BC). */
  headerLenConstant: number;
  loopSentinel: number;
  stride: number;
  /** 16 default duration-scale entries (byte-swapped); real files read `12x8, 18x8`. */
  durationDefaults: number[];
}

export function decodeGlbrFixedHeader(bytes: Uint8Array): GlbrFixedHeader {
  if (!sniffGlbr(bytes)) throw new Error('decodeGlbrFixedHeader: bad GLBR magic');
  if (bytes.length < 44) throw new Error('decodeGlbrFixedHeader: song shorter than the 44-byte fixed header');
  const durationDefaults: number[] = [];
  for (let i = 0; i < 16; i++) durationDefaults.push(be16(bytes, 12 + 2 * i));
  return {
    reserved: be16(bytes, 4),
    headerLenConstant: be16(bytes, 6),
    loopSentinel: be16(bytes, 8),
    stride: be16(bytes, 10),
    durationDefaults,
  };
}

/** One decoded GLBR channel event. */
export type GlbrEvent =
  | { kind: 'note'; note: number; durationTicks: number; tie: boolean }
  | { kind: 'rest'; durationTicks: number }
  | { kind: 'off' }
  | { kind: 'fullVolume' }
  | { kind: 'unknown'; code: number };

/** One decoded GLBR channel: its stream start offset (for diagnostics) and event list. */
export interface GlbrChannel {
  streamOffset: number;
  events: GlbrEvent[];
  /**
   * The channel's index into the second-header offset table (§1.2 of the format doc) — also,
   * per the driver's fixed 8-voice `SetParam` install loop (`docs/glbr-format.md` §5a), the OPL2
   * hardware voice slot this channel is assumed to play on 1:1. Used to select the matching
   * entry out of {@link GlbrSong.instruments}. This channel<->voice identity is the most natural
   * reading of the driver's fixed, channel-count-independent 8-voice setup loop, but — absent a
   * dynamic trace — is an inference, not a proven fact; see the module doc.
   */
  channelIndex: number;
}

/** A fully decoded GLBR song. */
export interface GlbrSong {
  header: GlbrFixedHeader;
  /** Channel count from the second header (byte @452). */
  channelCount: number;
  /** `descriptor0`'s raw (byte-swapped) timebase word. */
  timebaseRaw: number;
  /** `timebaseRaw / 84`, integer-truncated — the per-channel tick divisor. */
  tickDivisor: number;
  /** `descriptor0`'s patch/instrument id byte (semantics unresolved — see module doc). */
  patchId: number;
  channels: GlbrChannel[];
  /**
   * The song's embedded 8-voice OPL2 instrument bank (`decodeGlbrInstrumentBank`,
   * `docs/glbr-format.md` §5a) — `instruments[voice]` is `null` only if the record fell outside
   * the song buffer (never fabricated).
   */
  instruments: (OplPatch | null)[];
}

/** Convert a packed duration-code byte to a tick count, per the module doc's bit-field table. */
export function glbrDurationTicks(code: number, tickDivisor: number): number {
  const lenClass = code & 0x07;
  let raw = DURATION_BASE >> lenClass;
  if (code & 0x08) raw = Math.floor((raw >> 1) * 3);
  const tupletSel = (code >> 4) & 0x03;
  if (tupletSel !== 0) {
    const d = tupletSel * 2;
    raw = Math.floor(raw / (d + 1)) * d;
  }
  return raw / Math.max(1, tickDivisor);
}

/** Seconds for a tick count at the driver's fixed ~72.8 Hz clock. */
export function glbrTicksToSeconds(ticks: number): number {
  return ticks / GLBR_TICK_HZ;
}

/**
 * Parse one channel's 2-byte-pair event stream starting at `start`. Returns `null` (not a
 * partial list) if no `0xFF` terminator is found within the buffer — per the project's
 * "UNLOCATED beats invention" ethic, a stream that does not cleanly terminate is reported
 * as unparseable rather than silently truncated.
 */
function parseChannelStream(bytes: Uint8Array, start: number, tickDivisor: number): GlbrEvent[] | null {
  const events: GlbrEvent[] = [];
  let pos = start;
  const guardLimit = 8000;
  let guard = 0;
  while (pos + 2 <= bytes.length && guard++ < guardLimit) {
    const b1 = bytes[pos];
    const b2 = bytes[pos + 1];
    pos += 2;
    if (b1 === 0xff) return events;
    if (b1 <= 0x7f) {
      events.push({ kind: 'note', note: b1, durationTicks: glbrDurationTicks(b2, tickDivisor), tie: (b2 & 0x40) !== 0 });
    } else if (b1 === 0x80) {
      events.push({ kind: 'rest', durationTicks: glbrDurationTicks(b2, tickDivisor) });
    } else if (b1 === 0x81) {
      events.push({ kind: 'off' });
    } else if (b1 === 0x84) {
      events.push({ kind: 'fullVolume' });
    } else {
      events.push({ kind: 'unknown', code: b1 });
    }
  }
  return null;
}

/**
 * Decode a raw GLBR song block (a decompressed DAX block payload starting with the `GLBR`
 * magic) into its channel event streams. Throws on structural failure (bad magic, a
 * header field pointing out of bounds) rather than returning a partial/garbage result.
 */
export function decodeGlbrSong(bytes: Uint8Array): GlbrSong {
  const header = decodeGlbrFixedHeader(bytes);
  if (bytes.length < SECOND_HEADER_OFFSET + 10) {
    throw new Error('decodeGlbrSong: song too short for the second (444-byte-offset) header');
  }
  const channelCount = bytes[SECOND_HEADER_OFFSET + 8];
  const nOffsets = channelCount + 1;
  const offTableStart = SECOND_HEADER_OFFSET + 10;
  if (offTableStart + nOffsets * 2 > bytes.length) {
    throw new Error(`decodeGlbrSong: channelCount=${channelCount} offset table out of range`);
  }
  const offsetTable: number[] = [];
  for (let i = 0; i < nOffsets; i++) offsetTable.push(be16(bytes, offTableStart + 2 * i));
  const basePtr = offTableStart + nOffsets * 2;
  const d0 = basePtr + offsetTable[0];
  if (d0 + 4 > bytes.length) {
    throw new Error('decodeGlbrSong: descriptor0 offset out of range');
  }
  const timebaseRaw = be16(bytes, d0);
  const patchId = bytes[d0 + 2];
  const countByte = bytes[d0 + 3];
  const tickDivisor = Math.floor(timebaseRaw / 84) || 1;

  const channels: GlbrChannel[] = [];
  const nChannels = Math.max(countByte, channelCount);
  for (let idx = 0; idx <= nChannels; idx++) {
    const arrOff = d0 + 4 + 2 * idx;
    if (arrOff + 2 > bytes.length) continue;
    const rel = be16(bytes, arrOff);
    const streamOff = d0 + 0x0e + rel;
    if (streamOff < 0 || streamOff >= bytes.length) continue;
    const events = parseChannelStream(bytes, streamOff, tickDivisor);
    if (events) channels.push({ streamOffset: streamOff, events, channelIndex: idx });
  }
  if (channels.length === 0) {
    throw new Error('decodeGlbrSong: no channel stream terminated cleanly (0xFF not found)');
  }
  const instruments = decodeGlbrInstrumentBank(bytes, header);
  return { header, channelCount, timebaseRaw, tickDivisor, patchId, channels, instruments };
}

/** Number of fixed OPL2 voice slots the driver's `SetParam` install loop programs per song. */
export const GLBR_INSTRUMENT_VOICE_COUNT = 8;
/** Byte length of one OPL2 instrument record in the bank (pad + 11 register bytes, `parseAdLibPatch`-compatible). */
export const GLBR_INSTRUMENT_RECORD_SIZE = 12;

/**
 * Decode the song's embedded 8-voice OPL2 instrument/timbre bank (`docs/glbr-format.md` §5a).
 *
 * Recovered by statically disassembling `MUSIC.DAX` block 0's hardware-backend-2 `SetParam`
 * handler (file offset `0x1229`) and its shared helper `sub_36` (file offset `0x36`) — the same
 * "the driver IS the spec" method used for the event body (§0 of the doc). `sub_36` is the
 * generic stream-header-skip routine also used at load time; when reused from `SetParam` with a
 * small "count" argument (the voice index, 0-7), its side effect is exactly the addressing math
 * below: each voice's record sits immediately after a `(stride*2 + 12)`-byte bias, offset further
 * by the *cumulative sum* of the fixed header's own 16-entry duration-scale table (which, for
 * voices 0-7, doubles as this bank's per-voice record-length table — every sampled song's first 8
 * duration-table entries are the constant `12`, i.e. every voice record is 12 bytes, matching
 * `GLBR_INSTRUMENT_RECORD_SIZE` and the `parseAdLibPatch` 12-byte layout exactly):
 *
 * ```
 * bankBase = header.stride * 2 + 12       (== 76 for every real file, stride is always 32)
 * offset(voice) = bankBase + sum(header.durationDefaults[0 .. voice-1])   (voice = 0..7)
 * ```
 *
 * Verified against all 4 titles' real `MUSIC.DAX` (`packages/engine/test/glbr.test.ts`): every
 * in-bounds record decodes to a structurally sane OPL2 patch (pad byte 0, a real attack rate on
 * at least one operator, waveform/KSL/TL all in-range by construction of the bitmasks) and the
 * *same* literal 12-byte records recur across many songs and across titles — the signature of a
 * shared, largely-boilerplate timbre palette, not noise. This pins hardware-backend index 2 (of
 * the driver's 6-way dispatch, `docs/midi-dax-format.md` §2.4) as (very likely) AdLib/OPL2 — the
 * only backend whose per-voice record size (12) matches a real OPL2 2-operator timbre shape.
 *
 * What is NOT proven: that GLBR channel index == OPL2 voice slot 1:1 (a reasonable inference from
 * the driver's fixed 8-voice setup loop, not confirmed by a dynamic trace — see `GlbrChannel`);
 * and backend index 3's own, differently-shaped 18-byte-per-voice bank (same addressing formula,
 * record size 18) is left fully undecoded here — its bytes look structured (small values,
 * `0xFF`-flagged fields) but were not reversed into named fields, an honestly-disclosed gap.
 */
export function decodeGlbrInstrumentBank(bytes: Uint8Array, header: GlbrFixedHeader): (OplPatch | null)[] {
  const bankBase = header.stride * 2 + 12;
  const patches: (OplPatch | null)[] = [];
  let cumulative = 0;
  for (let voice = 0; voice < GLBR_INSTRUMENT_VOICE_COUNT; voice++) {
    const off = bankBase + cumulative;
    if (off >= 0 && off + GLBR_INSTRUMENT_RECORD_SIZE <= bytes.length) {
      try {
        patches.push(parseAdLibPatch(bytes.subarray(off, off + GLBR_INSTRUMENT_RECORD_SIZE)));
      } catch {
        patches.push(null);
      }
    } else {
      patches.push(null); // out of bounds -- honestly reported, not fabricated
    }
    cumulative += header.durationDefaults[voice] ?? 0;
  }
  return patches;
}

/**
 * A generic placeholder 2-operator OPL2 voice (a simple FM "organ"-ish tone: fast attack,
 * moderate decay, sustaining). **Not reversed from any GLBR data** — no instrument/timbre
 * bank format has been located for this container (see the module doc) — this exists
 * solely so {@link renderGlbrChannel} can produce audible, listenable proof that the note
 * timeline decoded above is real music and not noise.
 */
export const GLBR_PLACEHOLDER_PATCH: OplPatch = {
  modulator: {
    mult: 1,
    ksl: 0,
    totalLevel: 12,
    am: false,
    vib: false,
    sustaining: true,
    ksr: false,
    attackRate: 13,
    decayRate: 5,
    sustainLevel: 4,
    releaseRate: 7,
    waveform: 0,
  },
  carrier: {
    mult: 1,
    ksl: 0,
    totalLevel: 0,
    am: false,
    vib: false,
    sustaining: true,
    ksr: false,
    attackRate: 14,
    decayRate: 3,
    sustainLevel: 2,
    releaseRate: 6,
    waveform: 0,
  },
  feedback: 1,
  additive: false,
};

/** Structural stats about a rendered GLBR channel (the offline proof, no reference WAV needed). */
export interface GlbrRenderStats {
  durationSec: number;
  noteCount: number;
  restCount: number;
  minNote: number;
  maxNote: number;
}

/** A rendered GLBR channel: the mixed clip plus its structural stats. */
export interface GlbrChannelRender {
  clip: AudioClip;
  stats: GlbrRenderStats;
}

/** Options for {@link renderGlbrChannel}. */
export interface RenderGlbrOptions {
  /** Output sample rate (Hz). Default 22050. */
  sampleRate?: number;
  /** Peak output amplitude after mix normalization. Default 0.9. */
  amplitude?: number;
  /** Explicit OPL2 patch override; takes priority over `song`-derived lookup and the placeholder. */
  patch?: OplPatch;
  /**
   * The channel's parent song — when given (and `patch` is not), the channel's own decoded
   * instrument (`song.instruments[channel.channelIndex]`, `docs/glbr-format.md` §5a) is used,
   * falling back to {@link GLBR_PLACEHOLDER_PATCH} only if that voice's record was out of bounds.
   */
  song?: GlbrSong;
}

/**
 * Render one decoded {@link GlbrChannel} (monophonic: notes play sequentially on the
 * scheduled tick timeline, control/unknown codes take zero time) through an OPL2 voice to a
 * single PCM mixdown, reusing the existing OPL2 note synth (`renderOplNote`). Uses the channel's
 * own decoded GLBR instrument when `opts.song` is supplied (see {@link RenderGlbrOptions}),
 * otherwise the generic {@link GLBR_PLACEHOLDER_PATCH}.
 */
export function renderGlbrChannel(channel: GlbrChannel, opts: RenderGlbrOptions = {}): GlbrChannelRender {
  const sampleRate = opts.sampleRate ?? 22050;
  const amplitude = opts.amplitude ?? 0.9;
  const songPatch = opts.song?.instruments[channel.channelIndex];
  const patch = opts.patch ?? songPatch ?? GLBR_PLACEHOLDER_PATCH;

  let cursorTicks = 0;
  let noteCount = 0;
  let restCount = 0;
  let minNote = 127;
  let maxNote = 0;
  const scheduled: { startSample: number; note: number; durationMs: number }[] = [];

  for (const ev of channel.events) {
    if (ev.kind === 'note') {
      noteCount++;
      minNote = Math.min(minNote, ev.note);
      maxNote = Math.max(maxNote, ev.note);
      const startSec = glbrTicksToSeconds(cursorTicks);
      const durSec = glbrTicksToSeconds(Math.max(ev.durationTicks, 0.5));
      if (!ev.tie) {
        scheduled.push({ startSample: Math.round(startSec * sampleRate), note: ev.note, durationMs: durSec * 1000 });
      }
      cursorTicks += ev.durationTicks;
    } else if (ev.kind === 'rest') {
      restCount++;
      cursorTicks += ev.durationTicks;
    }
    // 'off' / 'fullVolume' / 'unknown': zero-duration control codes, no cursor advance.
  }

  const totalSec = glbrTicksToSeconds(cursorTicks);
  const totalSamples = Math.max(1, Math.round(totalSec * sampleRate) + Math.round(0.3 * sampleRate));
  const mix = new Float32Array(totalSamples);

  for (const n of scheduled) {
    const noteClip = renderOplNote(patch, n.note, {
      sampleRate,
      durationMs: n.durationMs + 60,
      noteOffMs: Math.max(10, n.durationMs * 0.85),
      amplitude: 1,
    });
    for (let i = 0; i < noteClip.pcm.length; i++) {
      const dst = n.startSample + i;
      if (dst >= 0 && dst < mix.length) mix[dst] += noteClip.pcm[i];
    }
  }

  let peak = 0;
  for (let i = 0; i < mix.length; i++) peak = Math.max(peak, Math.abs(mix[i]));
  if (peak > 0) {
    const k = amplitude / peak;
    for (let i = 0; i < mix.length; i++) mix[i] *= k;
  }

  const clip: AudioClip = {
    name: 'glbr-channel',
    sampleRate,
    pcm: mix,
    oneShotSamples: mix.length,
    repeatSamples: mix.length,
  };
  return {
    clip,
    stats: {
      durationSec: totalSec,
      noteCount,
      restCount,
      minNote: noteCount ? minNote : 0,
      maxNote,
    },
  };
}

/** Re-exported for convenience (callers rendering a GLBR channel need a note->Hz helper too). */
export { midiNoteToFreq };
