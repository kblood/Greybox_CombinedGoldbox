/**
 * OPL2 full-song mixer tests (Phase C, C5b-2b-1).
 *
 * 1) Synthetic: a hand-built two-note song renders to voiced PCM of the expected length, with the
 *    percussion note (channel 9) resolving a bank-100 timbre and polyphony bounded by 9.
 * 2) Golden (skips if data absent): the real ADDQ songs render to a full mixdown — length matches
 *    ticks×tempo, RMS is voiced across the whole timeline (not just the first note), polyphony
 *    never exceeds the OPL2's 9 channels, and the percussion channel maps to bank-100 timbres.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeXmi,
  decodeInstrAd,
  renderXmiSong,
  expandXmiLoops,
  adLibKey,
  XMI_PPQN,
  XMIDI_FOR_LOOP,
  XMIDI_NEXT_BREAK,
  type XmiSong,
  type XmiEvent,
  type AdLibBank,
  type AdLibInstrument,
} from '../src/index.js';

// A sustaining loud-carrier patch (fast attack, full-volume carrier, sine waves).
const VOICE = Uint8Array.from([0x00, 0x21, 0x01, 0xf2, 0xf2, 0x00, 0x00, 0x10, 0x00, 0x20, 0x00, 0x00]);

function bankWith(entries: { patch: number; bank: number }[]): AdLibBank {
  const instruments: AdLibInstrument[] = entries.map((e, i) => ({
    patch: e.patch,
    bank: e.bank,
    offset: i * 14,
    operatorData: VOICE,
  }));
  const byKey = new Map(instruments.map((inst) => [adLibKey(inst.patch, inst.bank), inst]));
  return { instruments, byKey };
}

describe('renderXmiSong — synthetic two-note song', () => {
  const bank = bankWith([
    { patch: 0, bank: 0 }, // melodic default
    { patch: 38, bank: 100 }, // percussion (acoustic snare key)
  ]);
  // One melodic note on ch0 + one percussion note on ch9, both at tick 0 for 60 ticks (= 1 quarter).
  const song: XmiSong = {
    timbres: [],
    events: [
      { tick: 0, kind: 'tempo', usPerQuarter: 500000 }, // 120 BPM
      { tick: 0, kind: 'program', channel: 0, program: 0 },
      { tick: 0, kind: 'noteOn', channel: 0, note: 69, velocity: 100, duration: 60 },
      { tick: 0, kind: 'noteOn', channel: 9, note: 38, velocity: 110, duration: 30 },
      { tick: 60, kind: 'endOfTrack' },
    ],
    durationTicks: 60,
  };

  it('renders voiced PCM of the expected length with a percussion voice', () => {
    const { clip, stats } = renderXmiSong(song, bank, { sampleRate: 22050 });
    // 60 ticks @ PPQN 60, 120 BPM = 0.5 s body (+ release tail).
    const expectedBody = (60 * 0.5) / XMI_PPQN;
    expect(stats.durationSec).toBeGreaterThanOrEqual(expectedBody * 0.95);
    expect(stats.durationSec).toBeLessThan(expectedBody + 0.6);
    expect(stats.renderedNotes).toBe(2);
    expect(stats.percussionNotes).toBe(1);
    expect(stats.channelsUsed).toEqual([0, 9]);
    expect(stats.maxPolyphony).toBe(2);
    expect(stats.voicedFraction).toBeGreaterThan(0.5);
    // Genuinely non-silent.
    let peak = 0;
    for (let i = 0; i < clip.pcm.length; i++) peak = Math.max(peak, Math.abs(clip.pcm[i]));
    expect(peak).toBeGreaterThan(0.1);
  });

  it('never allocates more than 9 voices even with a dense cluster', () => {
    const dense: XmiSong = {
      timbres: [],
      events: [
        { tick: 0, kind: 'tempo', usPerQuarter: 500000 },
        ...Array.from({ length: 20 }, (_, i) => ({
          tick: 0,
          kind: 'noteOn' as const,
          channel: 0,
          note: 48 + i,
          velocity: 100,
          duration: 120,
        })),
      ],
      durationTicks: 120,
    };
    const { stats } = renderXmiSong(dense, bank, { sampleRate: 22050 });
    expect(stats.maxPolyphony).toBeLessThanOrEqual(9);
    expect(stats.stolenNotes).toBeGreaterThan(0); // 20 simultaneous → stealing happened
  });
});

describe('expandXmiLoops — XMIDI for-loop unrolling', () => {
  // A note bracketed by controller 116 (for, count 3) … 117 (next), then a trailing note.
  const events: XmiEvent[] = [
    { tick: 0, kind: 'controller', channel: 0, controller: XMIDI_FOR_LOOP, value: 3 },
    { tick: 0, kind: 'noteOn', channel: 0, note: 60, velocity: 100, duration: 10 },
    { tick: 10, kind: 'controller', channel: 0, controller: XMIDI_NEXT_BREAK, value: 0 },
    { tick: 10, kind: 'noteOn', channel: 0, note: 67, velocity: 100, duration: 10 },
  ];

  it('unrolls a finite loop body N times and drops the loop controllers', () => {
    const out = expandXmiLoops(events, 2);
    const notes = out.filter((e) => e.kind === 'noteOn');
    // The looped note (60) appears 3×; the trailing note (67) once.
    expect(notes.filter((n) => n.kind === 'noteOn' && n.note === 60)).toHaveLength(3);
    expect(notes.filter((n) => n.kind === 'noteOn' && n.note === 67)).toHaveLength(1);
    // No 116/117 controllers survive.
    expect(out.some((e) => e.kind === 'controller' && (e.controller === XMIDI_FOR_LOOP || e.controller === XMIDI_NEXT_BREAK))).toBe(false);
    // Each repeat is shifted forward by the body length (10 ticks); ticks stay monotonic.
    const loopTicks = out.filter((e) => e.kind === 'noteOn' && e.note === 60).map((e) => e.tick);
    expect(loopTicks).toEqual([0, 10, 20]);
    // The trailing note follows after all three passes (3 × 10 ticks).
    const tail = out.find((e) => e.kind === 'noteOn' && e.note === 67)!;
    expect(tail.tick).toBe(30);
  });

  it('caps an infinite loop (count 0) at maxIterations', () => {
    const inf: XmiEvent[] = [
      { tick: 0, kind: 'controller', channel: 0, controller: XMIDI_FOR_LOOP, value: 0 },
      { tick: 0, kind: 'noteOn', channel: 0, note: 60, velocity: 100, duration: 5 },
      { tick: 5, kind: 'controller', channel: 0, controller: XMIDI_NEXT_BREAK, value: 0 },
    ];
    expect(expandXmiLoops(inf, 4).filter((e) => e.kind === 'noteOn')).toHaveLength(4);
    expect(expandXmiLoops(inf, 1).filter((e) => e.kind === 'noteOn')).toHaveLength(1);
  });
});

// --- Golden: real DQK ADDQ songs (skips if data absent) ----------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const disk1 = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK1');
const instrPath = resolve(disk1, 'INSTR.AD');
const addq1 = resolve(disk1, 'ADDQ1.XMI');

describe('renderXmiSong — golden DQK ADDQ1 mixdown', () => {
  it.skipIf(!existsSync(instrPath) || !existsSync(addq1))(
    'renders a full ~63 s song: voiced across the timeline, polyphony ≤ 9, percussion on bank 100',
    async () => {
      const bank = decodeInstrAd(new Uint8Array(await readFile(instrPath)));
      // The percussion mapping the renderer relies on: bank-100 drum timbres exist.
      expect(bank.byKey.get(adLibKey(38, 100)), 'snare in bank 100').toBeTruthy();
      expect(bank.byKey.get(adLibKey(36, 100)), 'bass drum in bank 100').toBeTruthy();

      const song = decodeXmi(new Uint8Array(await readFile(addq1))).songs[0];
      const noteOns = song.events.filter((e) => e.kind === 'noteOn').length;
      const tempoEv = song.events.find((e) => e.kind === 'tempo');
      const us = tempoEv && tempoEv.kind === 'tempo' ? tempoEv.usPerQuarter : 500000;
      const expectedBody = (song.durationTicks * (us / 1e6)) / XMI_PPQN;

      const { stats } = renderXmiSong(song, bank, { sampleRate: 22050 });
      // Length matches ticks × tempo (clip is body + a short release tail).
      expect(stats.durationSec).toBeGreaterThanOrEqual(expectedBody * 0.95);
      expect(stats.durationSec).toBeLessThan(expectedBody + 1);
      // Voiced across the WHOLE song, not just the opening.
      expect(stats.voicedFraction).toBeGreaterThan(0.5);
      // Bounded by the OPL2 channel count.
      expect(stats.maxPolyphony).toBeLessThanOrEqual(9);
      expect(stats.maxPolyphony).toBeGreaterThan(1); // it is genuinely polyphonic
      // Every decoded note-on was scheduled, and the drum track (channel 9) sounded.
      expect(stats.renderedNotes).toBe(noteOns);
      expect(stats.percussionNotes).toBeGreaterThan(0);
      expect(stats.channelsUsed).toContain(9);
    },
  );
});
