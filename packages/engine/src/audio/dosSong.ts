/**
 * `dosSong.ts` — CoK's `SOUND.DAX` block-1 event bank.
 *
 * Scope: this is NOT a generic multi-game "DOS song" format decoder. It is
 * specifically the decoder for the single buffer `docs/midi-dax-format.md`
 * section 1's resident `MIDI.DAX` driver installs via its `CX:ES` handshake
 * (section 1.7) — measured (round 33 R6, section 1.8) to be byte-identical to
 * `Champions of Krynn/SOUND.DAX` block 1 (14,064 bytes) every time it was
 * captured live. `Death Knights of Krynn/SOUND.DAX` is the same 14,206-byte
 * file byte-for-byte (sha256 `7df3bde4…`), so DoK's numbers are file identity,
 * not a second measurement.
 *
 * ## Round 35 R2: the event record is THREE bytes, not one
 *
 * Round 34 decoded this buffer with `NEED_BY_KIND = {0x80:1, 0x90:1, 0xC0:1,
 * 0xE0:2}` — one data byte for a note, no timing field — and published 11,090
 * events in 14 segments. Round 35 R2 measured the widths from the driver's own
 * code instead of assuming them (`tools/mididax_event_frame.py`, which walks
 * the interpreter's control-flow graph and counts how far `SI` advances per
 * branch). Block 1 (C/MS) and block 3 (AdLib) — two different backends, two
 * different address maps — agree exactly, and blocks 4 (Tandy) and 5 (PC
 * speaker) agree too:
 *
 * | status | data bytes | wait byte | record after status |
 * |---|---|---|---|
 * | `0x90` Note-On  | 2 (note, velocity)        | 1 | 3 |
 * | `0x80` Note-Off | 2 (note, + one the driver skips with a bare `inc si`) | 1 | 3 |
 * | `0xC0` program  | 1 (voice/instrument)      | 1 | 2 |
 * | `0xE0`          | 2                          | 1 | 3 |
 * | other status    | 2                          | 1 | 3 |
 * | `0xFC` end      | 1 flag byte                | 0 | 1 |
 *
 * The trailing byte is section 1.4's long-predicted per-tick wait counter,
 * finally located in the stream: block 1 fetches it at 0x493 and stores it
 * (minus one) to `[0x2BD]` at 0x4a0 — the very cell the interpreter head tests
 * and decrements once per tick. Block 3 does the same at 0x4d3 → `[0x346]`
 * (store at 0x4e0). A `0x00` wait means "process the next event on this same
 * tick"; `w` means the next event fires `w` ticks later. Nothing here claims a
 * tick RATE for CoK: 72.8 Hz is DoK's measured PIT divisor (section 2.3) and
 * CoK's own timer reprogramming is still unlocated (section 1.6).
 *
 * `0xFC` is a two-byte record: the sentinel plus a flag the handler compares
 * against `0x80` (restart the stream from the header pointer) — anything else
 * clears the driver-enabled cell and stops. In this buffer that flag is `0x81`
 * at offset 14,063, i.e. the frame closes on the buffer's very last byte and
 * the bank stops rather than looping.
 *
 * ## What that changes, and what it does not
 *
 * Round 34's conclusion — that this bank holds song-shaped content, not only
 * one-shot SFX — is STRENGTHENED, not overturned: under the real framing the
 * notes pair (1,846 Note-Ons and 1,846 Note-Offs, every Off matching an open
 * same-channel same-pitch On, 1846/1846), the pitches are melodic (36..96),
 * velocities take six discrete values {75,85,90,100,120,127}, every Note-Off
 * carries a constant 64 in the byte the driver never reads (the fingerprint of
 * a MIDI sequencer's release velocity), and there is a timeline: 7,860 ticks.
 * What changes is the COUNTS, all of which were framing artifacts:
 *
 * | number | round 34 (1-byte) | round 35 (measured) | why |
 * |---|---|---|---|
 * | events (incl. end marker) | 11,091 | 3,700 | data+wait bytes were being decoded as extra events |
 * | Note-On / Note-Off | 5,538 / 5,538 | 1,846 / 1,846 | exactly 3× — every real note produced 3 phantom events |
 * | `0xC0` events | 14 | 7 | each real record is 1 data byte + 1 wait byte; the 1-byte decoder read the data byte as event 1, then re-read the trailing wait byte (0x00 in all 7 real records) as a running-status continuation of the same 0xC0 kind — 2 published events per real record, 7*2=14 |
 * | segments | 14 | 7 | the segmenter splits on `0xC0`, so it inherited the same 2× |
 * | song-like segments | 3 | 3 | unchanged |
 * | malformed bytes | 0 | 0 | both framings run the buffer cleanly to the same `0xFC`; see the correction below on what `malformed` can and cannot detect |
 *
 * "Clean `0xFC` end, 0 malformed" is therefore NOT evidence for either framing
 * and must not be cited as such — it holds under both.
 *
 * ## Correction (2026-09-05, verifier pass on round 35 R2)
 *
 * Three defects in the write-up above and in the two docs it mirrors:
 *
 * 1. The `0xC0` row's "why" originally read "half were data bytes that happened
 *    to have bit 7 set." That is false: no data byte anywhere in this buffer has
 *    bit 7 set (verified by scanning every decoded record). The real mechanism,
 *    confirmed by re-running the 1-byte decoder against the retail bytes, is the
 *    text now in the table above — the same 3-phantom-events-per-note mechanism
 *    already documented for `0x90`/`0x80`, but a real `0xC0` record is only 1
 *    data byte + 1 wait byte (2 bytes after status, not 3), so it produces
 *    exactly 2 published events per real record rather than 3: 7 real × 2 = 14.
 * 2. `cok-sound-bank-framing.md` and `midi-dax-format.md` both said "five of the
 *    seven program changes are consecutive at the head." Only **four** are
 *    truly back-to-back (status offsets 125/128/131/134, one byte apart at 3
 *    bytes each). The fifth head program change (offset 144, channel 1) is
 *    preceded by a Note-On pair on channel 2 (offset 137: `92 48 55 00`; offset
 *    141, running status: `4f 55 00`) — i.e. a note already sounds before it,
 *    contradicting "before a single note sounds" as well. Both docs are
 *    corrected to say four, not five.
 * 3. `malformed` could only increment on the `last === null` branch (a running-
 *    status data byte before any status byte has been seen), and `last` is set
 *    on the first status byte and never cleared afterward — so for a stream
 *    that begins with a status byte at its own start offset (every real file
 *    here does), that branch can only ever fire on bytes strictly before the
 *    first status byte, which is nothing once `streamStart` is the header
 *    pointer. It could never go non-zero on real data, yet was presented as a
 *    measured, passing check. `decodeCokSoundBank` now ALSO counts the dangling
 *    bytes of a truncated final record (the `ran-off-end` case) toward
 *    `malformed`, which is a real corruption mode a truncated/corrupted file
 *    can produce. Mutation-tested in `dosSong.test.ts`: a synthetic truncated
 *    buffer and a truncated copy of the real `SOUND.DAX` block both now report
 *    `malformed > 0` where they used to report 0. The `last === null` trigger
 *    is kept (it is still real for a bad `streamStart`), so `malformed` now has
 *    two independent, testable triggers instead of one that could never fire.
 *
 * NOT wired into `apps/web/src/audio/gameAudio.ts`: the engine still plays no
 * DOS sound. This module decodes structure only, and the dashboard row keeps
 * saying "(decode only)".
 *
 * See `docs/engine/research/cok-sound-bank-framing.md` and
 * `docs/midi-dax-format.md` section 1.10.
 */

/** One decoded CoK sound-bank event. `wait` is the record's trailing tick delay. */
export type CokSoundEvent =
  | { kind: 'noteOn'; offset: number; channel: number; note: number; velocity: number; wait: number }
  | { kind: 'noteOff'; offset: number; channel: number; note: number; release: number; wait: number }
  | { kind: 'controlChange'; offset: number; channel: number; value: number; wait: number }
  | { kind: 'pitchBend'; offset: number; channel: number; lo: number; hi: number; wait: number }
  | { kind: 'unknown'; offset: number; status: number; channel: number; data: number[]; wait: number }
  | { kind: 'end'; offset: number; flag: number | null };

/** A contiguous run of events between two control-change (0xC0) boundaries. */
export interface CokSoundSegment {
  startOffset: number;
  endOffset: number;
  events: CokSoundEvent[];
  noteOnCount: number;
  noteOffCount: number;
  /** Distinct channels carrying Note-On/Off events in this segment. */
  channels: number[];
  /** Sum of the segment's trailing wait bytes, in driver ticks. */
  ticks: number;
}

/** A fully decoded CoK sound bank (one `SOUND.DAX` block's worth of bytes). */
export interface CokSoundBank {
  /** Byte length of the source block. */
  length: number;
  /** The header's own self-describing stream-start pointer (bytes 0-1, LE). */
  headerStartPointer: number;
  /** The offset decoding actually started from (defaults to `headerStartPointer`). */
  streamStart: number;
  events: CokSoundEvent[];
  /**
   * Count of bytes that could not be assigned to a complete event: a
   * running-status data byte seen before any status byte, or the dangling
   * bytes of a final record truncated by the end of the buffer (see
   * `decodeCokSoundBank`). Zero for every real file measured so far, but able
   * to go non-zero — see that function's doc comment for the mutation
   * evidence.
   */
  malformed: number;
  /** Why decoding stopped: a clean `0xFC`, running off the buffer end, or exhausting it. */
  endReason: 'clean-end' | 'ran-off-end' | 'exhausted';
  segments: CokSoundSegment[];
  /** Sum of every event's trailing wait byte, in driver ticks. */
  tickTotal: number;
  /** The byte after the `0xFC` sentinel, or null if the stream never reached one. */
  endFlag: number | null;
  /** Whether that flag is the `0x80` the handler restarts on (else the bank stops). */
  loopsToStart: boolean;
  /** Offset of the last byte the framing consumed (`length - 1` when the frame closes exactly). */
  lastConsumedOffset: number;
}

/**
 * Data bytes each status kind carries BEFORE its trailing wait byte, measured
 * from the retail driver by `tools/mididax_event_frame.py` (blocks 1, 3, 4 and 5
 * agree; block 2 is the MPU-401 pass-through and is documented separately).
 * Unlisted status kinds take `DEFAULT_DATA_BYTES`, matching the interpreter's own
 * fall-through branch.
 */
export const DATA_BYTES_BY_KIND: Readonly<Record<number, number>> = Object.freeze({
  0x80: 2,
  0x90: 2,
  0xc0: 1,
  0xe0: 2,
});

/** The interpreter's fall-through width for an unrecognised status high nibble. */
export const DEFAULT_DATA_BYTES = 2;

function u16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

/**
 * Read the header's own stream-start pointer (bytes 0-1, little-endian) —
 * the value the resident driver's install code copies into its persisted
 * tick cursor (`docs/midi-dax-format.md` section 1.4/1.9). For
 * `Champions of Krynn/SOUND.DAX` block 1 this is 125.
 */
export function decodeCokSoundHeaderStartPointer(bytes: Uint8Array): number {
  if (bytes.length < 2) throw new Error('decodeCokSoundHeaderStartPointer: buffer shorter than 2 bytes');
  return u16le(bytes, 0);
}

/**
 * Decode the event stream from `bytes`, starting at `streamStart` (defaults to
 * the header's own start pointer), using the widths measured from the driver.
 *
 * Deliberately NOT validating data bytes: the interpreter does not check them
 * either (there is no "is bit 7 clear" test anywhere on the data path), so a
 * decoder that skipped high-bit data bytes would be imposing a rule the engine
 * never had. `malformed` counts two cases the driver itself cannot resolve
 * (both real, both independently testable):
 *
 * 1. A running-status data byte with no preceding status byte (`last ===
 *    null`) — only possible via a bad `streamStart`, since every stream this
 *    module has seen begins with a status byte at its own start offset, and
 *    `last` is never reset to null once set.
 * 2. The dangling bytes of a final record truncated by the end of the buffer
 *    (the `ran-off-end` case) — a real corruption mode: a cut-short or
 *    corrupted file can end mid-record, and those trailing bytes never form a
 *    complete event under any framing.
 *
 * A `malformed` count of 0 on a real file is therefore a real (if usually
 * unsurprising) result, not a check that is structurally unable to fail —
 * `dosSong.test.ts` mutates a real buffer to a truncated copy and confirms the
 * count goes non-zero.
 */
export function decodeCokSoundBank(bytes: Uint8Array, streamStart?: number): CokSoundBank {
  const headerStartPointer = decodeCokSoundHeaderStartPointer(bytes);
  const start = streamStart ?? headerStartPointer;
  if (start < 0 || start > bytes.length) {
    throw new Error(`decodeCokSoundBank: stream start ${start} out of range for a ${bytes.length}-byte buffer`);
  }

  const events: CokSoundEvent[] = [];
  let malformed = 0;
  let i = start;
  const n = bytes.length;
  let last: { kind: number; channel: number } | null = null;
  let endReason: CokSoundBank['endReason'] = 'exhausted';
  let endFlag: number | null = null;

  while (i < n) {
    const b = bytes[i];
    let kind: number;
    let channel: number;
    const statusOffset = i;
    if (b & 0x80) {
      if (b === 0xfc) {
        endFlag = i + 1 < n ? bytes[i + 1] : null;
        events.push({ kind: 'end', offset: i, flag: endFlag });
        endReason = 'clean-end';
        i += 2;
        break;
      }
      kind = b & 0xf0;
      channel = b & 0x0f;
      last = { kind, channel };
      i += 1;
    } else {
      if (last === null) {
        // No status byte has been seen yet: the driver would reuse stale state,
        // which a cold decode cannot reconstruct. Skip the byte and keep going.
        malformed++;
        i += 1;
        continue;
      }
      kind = last.kind;
      channel = last.channel;
    }
    const need = DATA_BYTES_BY_KIND[kind] ?? DEFAULT_DATA_BYTES;
    if (i + need + 1 > n) {
      // This record's status/running-status byte started at statusOffset but
      // there is no room left for its data + wait bytes: everything from
      // statusOffset to the end of the buffer is an incomplete, undecodable
      // record.
      malformed += n - statusOffset;
      endReason = 'ran-off-end';
      break;
    }
    const data = Array.from(bytes.subarray(i, i + need));
    i += need;
    const wait = bytes[i];
    i += 1;
    events.push(buildEvent(statusOffset, kind, channel, data, wait));
  }

  const segments = segmentCokSoundEvents(events);
  return {
    length: bytes.length,
    headerStartPointer,
    streamStart: start,
    events,
    malformed,
    endReason,
    segments,
    tickTotal: events.reduce((sum, e) => sum + (e.kind === 'end' ? 0 : e.wait), 0),
    endFlag,
    loopsToStart: endFlag === 0x80,
    lastConsumedOffset: i - 1,
  };
}

function buildEvent(
  offset: number,
  kind: number,
  channel: number,
  data: number[],
  wait: number,
): CokSoundEvent {
  switch (kind) {
    case 0x90:
      // A Note-On whose velocity byte is zero jumps straight into the Note-Off
      // handler (block 1 at 0x50a, block 3 at 0x52b) — MIDI's own idiom. Measured
      // 0 of 1,846 Note-Offs in this bank take that form, but the branch is real.
      return data[1] === 0
        ? { kind: 'noteOff', offset, channel, note: data[0], release: data[1], wait }
        : { kind: 'noteOn', offset, channel, note: data[0], velocity: data[1], wait };
    case 0x80:
      return { kind: 'noteOff', offset, channel, note: data[0], release: data[1], wait };
    case 0xc0:
      return { kind: 'controlChange', offset, channel, value: data[0], wait };
    case 0xe0:
      return { kind: 'pitchBend', offset, channel, lo: data[0], hi: data[1], wait };
    default:
      return { kind: 'unknown', offset, status: kind, channel, data, wait };
  }
}

/**
 * Split a decoded event list into segments at each control-change (`0xC0`)
 * event. This remains a HEURISTIC boundary, and round 35 R2 weakened the case
 * for it: with the correct framing the buffer carries just 7 such events, five
 * of them consecutive at the head (one per channel 1..5, before a single note
 * has sounded) and two later on channel 1 alone. Read as MIDI program changes —
 * which is what the handler does with them, walking a 12-voice instrument slot
 * table — they select an instrument, and only the two later ones plausibly mark
 * a passage boundary. The segment count is kept as a comparable census figure,
 * not as a claim that this bank contains 7 pieces of music.
 */
export function segmentCokSoundEvents(events: CokSoundEvent[]): CokSoundSegment[] {
  const segments: CokSoundSegment[] = [];
  let current: CokSoundEvent[] = [];
  for (const ev of events) {
    if (ev.kind === 'controlChange' && current.length > 0) {
      segments.push(buildSegment(current));
      current = [];
    }
    current.push(ev);
  }
  if (current.length > 0) segments.push(buildSegment(current));
  return segments;
}

function buildSegment(events: CokSoundEvent[]): CokSoundSegment {
  const noteOnCount = events.filter((e) => e.kind === 'noteOn').length;
  const noteOffCount = events.filter((e) => e.kind === 'noteOff').length;
  const channelSet = new Set<number>();
  for (const e of events) {
    if (e.kind === 'noteOn' || e.kind === 'noteOff') channelSet.add(e.channel);
  }
  return {
    startOffset: events[0].offset,
    endOffset: events[events.length - 1].offset,
    events,
    noteOnCount,
    noteOffCount,
    channels: Array.from(channelSet).sort((a, b) => a - b),
    ticks: events.reduce((sum, e) => sum + (e.kind === 'end' ? 0 : e.wait), 0),
  };
}

/** Options for {@link isSongLikeSegment}. */
export interface SongLikeOptions {
  minEvents?: number;
  minVoices?: number;
  /** Minimum Note-On/Off balance ratio (min/max) to count as "periodic". */
  minBalance?: number;
}

/**
 * Whether `segment` looks like real melodic content rather than a short
 * sound effect: at least `minEvents` events (default 200, the round-34 R6
 * plan's own bar), at least `minVoices` distinct note channels (default 3),
 * and roughly balanced Note-On/Off counts (default >= 0.9 of the smaller
 * over the larger).
 *
 * The 200-event bar was set under the 1-byte framing, which inflated every
 * count 3×; the three passing segments clear it by 1.9× or more even after the
 * correction (1,601 / 381 / 1,712 events), so the verdict is unchanged and the
 * bar is deliberately left where it was rather than re-tuned to the new numbers.
 */
export function isSongLikeSegment(segment: CokSoundSegment, opts: SongLikeOptions = {}): boolean {
  const minEvents = opts.minEvents ?? 200;
  const minVoices = opts.minVoices ?? 3;
  const minBalance = opts.minBalance ?? 0.9;
  if (segment.events.length < minEvents) return false;
  if (segment.channels.length < minVoices) return false;
  if (segment.noteOnCount === 0) return false;
  const balance = Math.min(segment.noteOnCount, segment.noteOffCount) / Math.max(segment.noteOnCount, segment.noteOffCount);
  return balance >= minBalance;
}

/** Which segment (index into `segments`) contains byte `offset`, or -1. */
export function segmentIndexForOffset(segments: CokSoundSegment[], offset: number): number {
  return segments.findIndex((s) => s.startOffset <= offset && offset <= s.endOffset);
}
