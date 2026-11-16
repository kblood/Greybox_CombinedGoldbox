/**
 * `dosSong.ts` test — CoK's `SOUND.DAX` block-1 event bank.
 *
 * Round 35 R2 rewrote this file after measuring the event-record width from the
 * driver's own code (`tools/mididax_event_frame.py`): every event carries its
 * data bytes AND a trailing per-tick wait byte, so the round-34 numbers this
 * file used to pin (11,091 events, 14 segments, 5,538/5,538 notes) were framing
 * artifacts. The pins below are the corrected census, and the two-sided pin at
 * the end asserts the OLD numbers are no longer produced, so a silent revert to
 * 1-byte framing goes red here rather than quietly re-inflating the dashboard.
 *
 * Synthetic unit tests need no game data; the real-file section skips when
 * `Champions of Krynn/SOUND.DAX` is absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { readDaxDataBlocks } from '../src/loaders/dax.js';
import {
  decodeCokSoundHeaderStartPointer,
  decodeCokSoundBank,
  isSongLikeSegment,
  segmentIndexForOffset,
  DATA_BYTES_BY_KIND,
  DEFAULT_DATA_BYTES,
  type CokSoundEvent,
  type CokSoundSegment,
} from '../src/audio/dosSong.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..');
const SOUND_DAX = resolve(REPO_ROOT, 'Champions of Krynn', 'SOUND.DAX');
const DOK_SOUND_DAX = resolve(REPO_ROOT, 'Death Knights of Krynn', 'SOUND.DAX');

// ---------------------------------------------------------------------------
// Synthetic unit tests
// ---------------------------------------------------------------------------

describe('decodeCokSoundHeaderStartPointer', () => {
  it('reads bytes 0-1 little-endian', () => {
    const bytes = new Uint8Array([0x7d, 0x00, 0xff, 0xff]);
    expect(decodeCokSoundHeaderStartPointer(bytes)).toBe(125);
  });

  it('throws on a too-short buffer', () => {
    expect(() => decodeCokSoundHeaderStartPointer(new Uint8Array([0x01]))).toThrow();
  });
});

describe('the measured frame table', () => {
  it('matches what tools/mididax_event_frame.py reads out of the retail driver', () => {
    // Blocks 1 (C/MS), 3 (AdLib), 4 (Tandy) and 5 (PC speaker) all agree.
    expect(DATA_BYTES_BY_KIND).toEqual({ 0x80: 2, 0x90: 2, 0xc0: 1, 0xe0: 2 });
    expect(DEFAULT_DATA_BYTES).toBe(2);
  });
});

/** A full 4-byte Note-On record: status, note, velocity, wait. */
function noteOn(channel: number, note: number, velocity = 100, wait = 0): number[] {
  return [0x90 | channel, note, velocity, wait];
}
/** A full 4-byte Note-Off record: status, note, release byte, wait. */
function noteOff(channel: number, note: number, wait = 0): number[] {
  return [0x80 | channel, note, 64, wait];
}

describe('decodeCokSoundBank', () => {
  it('decodes a clean stream to a single end event with 0 malformed', () => {
    const header = new Uint8Array(4);
    header[0] = 4; // header start pointer = 4 (right after this tiny header)
    const body = [...noteOn(0, 60, 90, 3), ...noteOff(0, 60, 1), 0xfc, 0x00];
    const bytes = new Uint8Array([...header, ...body]);
    const bank = decodeCokSoundBank(bytes);
    expect(bank.headerStartPointer).toBe(4);
    expect(bank.malformed).toBe(0);
    expect(bank.endReason).toBe('clean-end');
    expect(bank.events.length).toBe(3); // noteOn, noteOff, end
    expect(bank.events[0]).toMatchObject({ kind: 'noteOn', channel: 0, note: 60, velocity: 90, wait: 3 });
    expect(bank.events[1]).toMatchObject({ kind: 'noteOff', channel: 0, note: 60, release: 64, wait: 1 });
    expect(bank.events[2].kind).toBe('end');
    expect(bank.tickTotal).toBe(4);
    expect(bank.lastConsumedOffset).toBe(bytes.length - 1);
  });

  it('reads the 0xFC flag byte and reports whether the bank restarts', () => {
    const header = new Uint8Array(4);
    header[0] = 4;
    const looping = new Uint8Array([...header, ...noteOn(0, 60), 0xfc, 0x80]);
    expect(decodeCokSoundBank(looping).loopsToStart).toBe(true);
    expect(decodeCokSoundBank(looping).endFlag).toBe(0x80);
    const stopping = new Uint8Array([...header, ...noteOn(0, 60), 0xfc, 0x81]);
    expect(decodeCokSoundBank(stopping).loopsToStart).toBe(false);
    expect(decodeCokSoundBank(stopping).endFlag).toBe(0x81);
  });

  it('honours running status (a data byte with no fresh status reuses the last event kind)', () => {
    const header = new Uint8Array(4);
    header[0] = 4;
    // Note-On ch0 note=60, then a running-status continuation note=61 with no
    // fresh status byte — still 3 bytes (note, velocity, wait).
    const body = [0x90, 60, 100, 0, 61, 110, 5, 0xfc, 0x00];
    const bytes = new Uint8Array([...header, ...body]);
    const bank = decodeCokSoundBank(bytes);
    expect(bank.malformed).toBe(0);
    const notes = bank.events.filter((e): e is Extract<CokSoundEvent, { kind: 'noteOn' }> => e.kind === 'noteOn');
    expect(notes.map((e) => e.note)).toEqual([60, 61]);
    expect(notes.map((e) => e.velocity)).toEqual([100, 110]);
    expect(bank.tickTotal).toBe(5);
  });

  it('routes a velocity-0 Note-On to the Note-Off handler, the way the driver does', () => {
    // block 1 at 0x50a / block 3 at 0x52b: `mov bl, es:[si+1]; cmp bl, 0; je <noteoff>`
    const header = new Uint8Array(4);
    header[0] = 4;
    const bytes = new Uint8Array([...header, 0x92, 60, 0, 0, 0xfc, 0x00]);
    const bank = decodeCokSoundBank(bytes);
    expect(bank.events[0]).toMatchObject({ kind: 'noteOff', channel: 2, note: 60, release: 0 });
  });

  it('gives an unrecognised status the interpreter fall-through width (2 data + wait)', () => {
    const header = new Uint8Array(4);
    header[0] = 4;
    // 0xA0 is not one of the four branches; the driver's default arm does
    // `inc si; inc si` and then takes the wait byte, i.e. a 4-byte record.
    const body = [0xa0, 1, 2, 7, ...noteOn(1, 62), 0xfc, 0x00];
    const bytes = new Uint8Array([...header, ...body]);
    const bank = decodeCokSoundBank(bytes);
    expect(bank.malformed).toBe(0);
    expect(bank.events[0]).toMatchObject({ kind: 'unknown', status: 0xa0, channel: 0, wait: 7 });
    expect(bank.events[1]).toMatchObject({ kind: 'noteOn', channel: 1, note: 62 });
    expect(bank.events[2].kind).toBe('end');
  });

  it('counts a running-status data byte with no preceding status as malformed', () => {
    const header = new Uint8Array(4);
    header[0] = 4;
    const bytes = new Uint8Array([...header, 0x05, ...noteOn(0, 60), 0xfc, 0x00]);
    const bank = decodeCokSoundBank(bytes);
    expect(bank.malformed).toBe(1);
    expect(bank.endReason).toBe('clean-end');
  });

  it('accepts an explicit streamStart override distinct from the header pointer', () => {
    const header = new Uint8Array(4);
    header[0] = 99; // a header pointer that does NOT point at real content
    const body = [...noteOn(2, 64), ...noteOff(2, 64), 0xfc, 0x00];
    const bytes = new Uint8Array([...header, ...body]);
    const bank = decodeCokSoundBank(bytes, 4);
    expect(bank.streamStart).toBe(4);
    expect(bank.headerStartPointer).toBe(99); // still reported, just not used
    expect(bank.malformed).toBe(0);
  });

  it('reports ran-off-end for a truncated final event (the wait byte counts), and counts the dangling bytes as malformed', () => {
    const header = new Uint8Array(4);
    header[0] = 4;
    // note + velocity present but no wait byte: the record does not fit.
    // Dangling bytes are the status byte (0x90) plus its 2 data bytes = 3.
    const bytes = new Uint8Array([...header, 0x90, 60, 100]);
    const bank = decodeCokSoundBank(bytes);
    expect(bank.endReason).toBe('ran-off-end');
    expect(bank.malformed).toBe(3);
  });

  it('mutation: a synthetic malformed (truncated) buffer reports malformed > 0 where a clean one reports 0', () => {
    const header = new Uint8Array(4);
    header[0] = 4;
    const cleanBody = [...noteOn(0, 60, 90, 3), ...noteOff(0, 60, 1), 0xfc, 0x00];
    const clean = new Uint8Array([...header, ...cleanBody]);
    expect(decodeCokSoundBank(clean).malformed).toBe(0);

    // Same stream with its final wait byte (and the 0xFC end marker) chopped
    // off mid-record: the last Note-Off's status+data bytes (4 bytes: 0x80,
    // 60, 64, plus no wait byte) can no longer complete.
    const truncated = clean.subarray(0, clean.length - 3);
    const mutated = decodeCokSoundBank(truncated);
    expect(mutated.malformed).toBeGreaterThan(0);
    expect(mutated.malformed).toBe(3); // the dangling 0x80 60 64 of the second Note-Off
    expect(mutated.endReason).toBe('ran-off-end');
  });
});

describe('segmentCokSoundEvents / isSongLikeSegment', () => {
  it('splits on control-change events', () => {
    const header = new Uint8Array(4);
    header[0] = 4;
    const body = [
      ...noteOn(0, 60), ...noteOff(0, 60),
      0xc0, 1, 0, // program change, 1 data byte + wait
      ...noteOn(1, 61), ...noteOff(1, 61),
      ...noteOn(2, 62), ...noteOff(2, 62),
      0xfc, 0x00,
    ];
    const bytes = new Uint8Array([...header, ...body]);
    const bank = decodeCokSoundBank(bytes);
    expect(bank.segments.length).toBe(2);
    expect(bank.segments[0].events.length).toBe(2); // just the first note pair
    // second segment: controlChange + 2 note pairs + end
    expect(bank.segments[1].noteOnCount).toBe(2);
    expect(bank.segments[1].noteOffCount).toBe(2);
    expect(bank.segments[1].channels).toEqual([1, 2]);
  });

  it('flags a segment song-like only when it clears events/voices/balance bars', () => {
    const smallSegment: CokSoundSegment = {
      startOffset: 0,
      endOffset: 10,
      events: [],
      noteOnCount: 5,
      noteOffCount: 5,
      channels: [0, 1, 2],
      ticks: 0,
    };
    expect(isSongLikeSegment({ ...smallSegment, events: new Array(50) as unknown as CokSoundEvent[] })).toBe(false);

    const bigButOneVoice = { ...smallSegment, events: new Array(300) as unknown as CokSoundEvent[], channels: [0] };
    expect(isSongLikeSegment(bigButOneVoice)).toBe(false);

    const bigButUnbalanced = {
      ...smallSegment,
      events: new Array(300) as unknown as CokSoundEvent[],
      noteOnCount: 280,
      noteOffCount: 20,
    };
    expect(isSongLikeSegment(bigButUnbalanced)).toBe(false);

    const songLike = { ...smallSegment, events: new Array(300) as unknown as CokSoundEvent[] };
    expect(isSongLikeSegment(songLike)).toBe(true);
  });
});

describe('segmentIndexForOffset', () => {
  it('finds the containing segment, or -1', () => {
    const segments: CokSoundSegment[] = [
      { startOffset: 0, endOffset: 9, events: [], noteOnCount: 0, noteOffCount: 0, channels: [], ticks: 0 },
      { startOffset: 10, endOffset: 99, events: [], noteOnCount: 0, noteOffCount: 0, channels: [], ticks: 0 },
    ];
    expect(segmentIndexForOffset(segments, 5)).toBe(0);
    expect(segmentIndexForOffset(segments, 50)).toBe(1);
    expect(segmentIndexForOffset(segments, 500)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Real-file integration (skipped if the game data is not present locally)
// ---------------------------------------------------------------------------

/** Deterministic LCG shuffle, so the pairing null is reproducible. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('Champions of Krynn SOUND.DAX (real file)', () => {
  const has = existsSync(SOUND_DAX);
  const maybeIt = has ? it : it.skip;

  maybeIt('is one 14,064-byte block whose header points at a clean 3,699-event stream', () => {
    const bytes = readFileSync(SOUND_DAX);
    const blocks = readDaxDataBlocks(bytes);
    // Fixture presence asserted BEFORE anything can quietly no-op.
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.map((b) => b.blockId)).toEqual([1]);
    expect(blocks[0].raw.length).toBe(14064);

    const raw = blocks[0].raw;
    expect(decodeCokSoundHeaderStartPointer(raw)).toBe(125);

    const bank = decodeCokSoundBank(raw);
    expect(bank.malformed).toBe(0);
    expect(bank.endReason).toBe('clean-end');
    // 3,699 real events plus this decoder's own 'end' marker for the terminal
    // 0xFC = 3,700. Round 34 published 11,091 here under 1-byte framing.
    expect(bank.events.length).toBe(3700);
    // The frame closes the buffer exactly: the 0xFC's flag byte is the last byte,
    // and it is 0x81, not the 0x80 the handler restarts on.
    expect(bank.lastConsumedOffset).toBe(14063);
    expect(bank.endFlag).toBe(0x81);
    expect(bank.loopsToStart).toBe(false);
  });

  maybeIt('carries a paired, melodic, timed note stream (the framing is what makes it visible)', () => {
    const raw = readDaxDataBlocks(readFileSync(SOUND_DAX))[0].raw;
    const bank = decodeCokSoundBank(raw);
    const ons = bank.events.filter((e): e is Extract<CokSoundEvent, { kind: 'noteOn' }> => e.kind === 'noteOn');
    const offs = bank.events.filter((e): e is Extract<CokSoundEvent, { kind: 'noteOff' }> => e.kind === 'noteOff');
    expect(ons.length).toBe(1846);
    expect(offs.length).toBe(1846);
    expect(bank.events.filter((e) => e.kind === 'controlChange').length).toBe(7);
    expect(bank.events.filter((e) => e.kind === 'pitchBend').length).toBe(0);
    expect(bank.events.filter((e) => e.kind === 'unknown').length).toBe(0);
    expect(bank.tickTotal).toBe(7860);

    // Every Note-Off carries a constant 64 in the byte the driver never reads.
    expect(new Set(offs.map((e) => e.release))).toEqual(new Set([64]));
    // Pitches are melodic and velocities take six discrete values.
    expect(Math.min(...ons.map((e) => e.note))).toBe(36);
    expect(Math.max(...ons.map((e) => e.note))).toBe(96);
    expect([...new Set(ons.map((e) => e.velocity))].sort((a, b) => a - b)).toEqual([75, 85, 90, 100, 120, 127]);

    // Every Note-Off closes an OPEN Note-On of the same channel and pitch.
    const pair = (offPitches: number[]) => {
      const open = new Map<number, number[]>();
      let matched = 0;
      let unmatched = 0;
      let k = 0;
      for (const ev of bank.events) {
        if (ev.kind === 'noteOn') {
          const list = open.get(ev.channel) ?? [];
          list.push(ev.note);
          open.set(ev.channel, list);
        } else if (ev.kind === 'noteOff') {
          const pitch = offPitches[k++];
          const list = open.get(ev.channel) ?? [];
          const at = list.indexOf(pitch);
          if (at >= 0) { list.splice(at, 1); matched++; } else { unmatched++; }
        }
      }
      return matched / (matched + unmatched);
    };
    const real = pair(offs.map((e) => e.note));
    expect(real).toBe(1);
    // NULL: shuffling the Note-Off pitch column destroys the pairing. Measured
    // over 20 seeds this sits near 0.52; assert well clear of the real 1.00 so a
    // decoder that "pairs" by construction cannot pass this by accident.
    const nulls = Array.from({ length: 20 }, (_, t) => pair(shuffled(offs.map((e) => e.note), 1000 + t)));
    expect(Math.max(...nulls)).toBeLessThan(0.65);
  });

  maybeIt('segments to 7 (3 song-like) — the census the dashboard row prints', () => {
    const raw = readDaxDataBlocks(readFileSync(SOUND_DAX))[0].raw;
    const bank = decodeCokSoundBank(raw);
    expect(bank.segments.map((s) => s.events.length)).toEqual([1, 1, 1, 3, 1601, 381, 1712]);
    const songLike = bank.segments.filter((s) => isSongLikeSegment(s));
    expect(songLike.length).toBe(3);
    expect(songLike.map((s) => s.channels)).toEqual([[1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]]);
    // Two-sided: these are the numbers a revert to 1-byte framing would produce.
    expect(bank.segments.length).not.toBe(14);
    expect(bank.events.length).not.toBe(11091);
  });

  maybeIt('only 4 of the 7 program changes are truly consecutive at the head (verifier correction)', () => {
    // The five head-area offsets are 125/128/131/134/144. Only the first four
    // are back-to-back (3 bytes apart each); 144 follows a Note-On pair on
    // channel 2 at 137/141, so a note has already sounded by the time it
    // fires. An earlier write-up said "five ... consecutive ... before a
    // single note sounds" for all five, which this pins as wrong.
    const raw = readDaxDataBlocks(readFileSync(SOUND_DAX))[0].raw;
    const bank = decodeCokSoundBank(raw);
    const ccs = bank.events.filter((e): e is Extract<CokSoundEvent, { kind: 'controlChange' }> => e.kind === 'controlChange');
    const offsets = ccs.map((e) => e.offset);
    expect(offsets).toEqual([125, 128, 131, 134, 144, 6139, 7623]);
    const consecutiveAtHead = offsets.slice(0, 5).every((off, idx, arr) => idx === 0 || off - arr[idx - 1] === 3);
    expect(consecutiveAtHead).toBe(false); // 144 - 134 = 10, not 3
    const trueConsecutiveRun = offsets.slice(0, 4).every((off, idx, arr) => idx === 0 || off - arr[idx - 1] === 3);
    expect(trueConsecutiveRun).toBe(true);
    // A note already sounds between offset 134 (the 4th program change, c5 05
    // 00, ending at 137) and offset 144 (the 5th, c1 ...).
    const between = Array.from(raw.subarray(137, 144));
    expect(between).toEqual([0x92, 0x48, 0x55, 0x00, 0x4f, 0x55, 0x00]); // NoteOn ch2 + running-status continuation
  });

  maybeIt('mutation: truncating the real SOUND.DAX block mid-record makes malformed non-zero', () => {
    const raw = readDaxDataBlocks(readFileSync(SOUND_DAX))[0].raw;
    const clean = decodeCokSoundBank(raw);
    expect(clean.malformed).toBe(0);

    // Cut the buffer off 5 bytes before its end: still well inside a record,
    // since the file's very last byte is the 0xFC flag.
    const truncated = raw.subarray(0, raw.length - 5);
    const mutated = decodeCokSoundBank(truncated);
    expect(mutated.malformed).toBeGreaterThan(0);
    expect(mutated.endReason).toBe('ran-off-end');
  });

  maybeIt('is byte-identical to Death Knights of Krynn SOUND.DAX (file identity, not a second measurement)', () => {
    if (!existsSync(DOK_SOUND_DAX)) return expect(existsSync(SOUND_DAX)).toBe(true);
    const a = readFileSync(SOUND_DAX);
    const b = readFileSync(DOK_SOUND_DAX);
    expect(a.length).toBe(14206);
    expect(Buffer.compare(a, b)).toBe(0);
  });
});
