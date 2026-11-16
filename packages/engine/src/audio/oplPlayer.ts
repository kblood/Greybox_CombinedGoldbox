/**
 * DQK OPL2 **full-song playback** — a 9-channel OPL2 mixer driven by a decoded XMIDI event
 * stream, rendering one `ADDQ*` song to a single PCM mixdown (Phase C, C5b-2b-1).
 *
 * C5b-2a pinned the `INSTR.AD` operator map and proved a single voice sings (see {@link
 * parseAdLibPatch}/`renderOplNote` in `opl2.ts`). This slice turns the *score* into audio:
 *
 *  - **Tick → seconds.** XMIDI delays/durations are in ticks; a tempo map (from `0x51` tempo
 *    metas, default 120 BPM) converts to seconds at {@link XMI_PPQN} ticks per quarter note.
 *  - **9-voice allocation.** Real OPL2 has nine 2-operator channels. Notes are assigned to a
 *    pool of nine slots in start order; when all nine are busy a new note **steals** the slot
 *    whose note ends soonest (its tail is cut at the steal point). `maxPolyphony` never exceeds 9.
 *  - **Timbre routing.** A melodic note resolves its patch from the channel's current program
 *    (`(program, bank 0)`); a **percussion** note (MIDI channel 9) resolves by *note number* in
 *    **bank 100** — the `INSTR.AD` side of XMIDI's bank-127↔100 percussion map (the `TIMB` list
 *    marks those timbres bank 127). Velocity and CC#7 channel volume scale the note's gain.
 *  - **Per-voice synthesis.** Each note runs the 2-operator OPL2 voice (the four waveforms,
 *    FM/additive routing, modulator feedback) with an **attenuation-domain EG** (9-bit-style dB
 *    envelope, KSR-scaled rates, OPL `fnum`/`block` quantized pitch, KSL attenuation) — the
 *    "real envelope/pitch tables" step, replacing C5b-2a's amplitude-exponential approximation.
 *
 * Verified structurally (no reference WAV): the mixdown length matches `ticks × tempo`, RMS is
 * voiced across the **whole** timeline (not just the first note), polyphony stays ≤ 9, and the
 * percussion channel resolves bank-100 timbres. WebAudio streaming, the XMIDI loop controllers
 * (116–119), and binding the music to the graphics-mode switch are C5b-2b-2. Pure (no DOM/Node).
 *
 * Refs: the XMIDI timing model (Miles AIL); the OPL2 (YM3812) envelope/`fnum`-`block` design.
 */
import { OPL_MULT_TABLE, parseAdLibPatch, type OplPatch, type OplOperator } from './opl2.js';
import { adLibKey, type AdLibBank } from './instrAd.js';
import type { XmiSong, XmiEvent } from './xmi.js';
import type { AudioClip } from './svx8.js';

/** XMIDI loop controller numbers (Miles AIL): 116 = for-loop start, 117 = next/break (end). */
export const XMIDI_FOR_LOOP = 116;
export const XMIDI_NEXT_BREAK = 117;

/**
 * Expand XMIDI for-loops into a flat, absolute-tick event list.
 *
 * XMIDI marks a repeated section with controller **116** (`for`, its value = iteration count,
 * `0` = infinite) and **117** (`next`/`break`, the loop end). This unrolls each loop body,
 * shifting the repeated events' ticks forward by the body's tick-length so the timeline stays
 * monotonic, and drops the 116/117 controllers themselves. Nested loops are handled via a stack.
 * An infinite loop (count 0) is unrolled `maxIterations` times for the offline mixdown (the
 * WebAudio layer then loops the rendered clip seamlessly).
 */
export function expandXmiLoops(events: XmiEvent[], maxIterations = 2): XmiEvent[] {
  const out: XmiEvent[] = [];
  interface Frame {
    startIndex: number;
    bodyStartTick: number;
    count: number;
    iter: number;
  }
  const frames: Frame[] = [];
  let shift = 0;
  let i = 0;
  let guard = 0;
  const guardLimit = events.length * (maxIterations + 2) + 64;

  while (i < events.length && guard++ < guardLimit) {
    const ev = events[i];
    if (ev.kind === 'controller' && ev.controller === XMIDI_FOR_LOOP) {
      frames.push({ startIndex: i + 1, bodyStartTick: ev.tick, count: ev.value, iter: 0 });
      i++;
      continue;
    }
    if (ev.kind === 'controller' && ev.controller === XMIDI_NEXT_BREAK) {
      const f = frames[frames.length - 1];
      if (!f) {
        i++;
        continue;
      }
      f.iter++;
      const infinite = f.count === 0;
      const more = infinite ? f.iter < maxIterations : f.iter < f.count;
      if (more) {
        shift += ev.tick - f.bodyStartTick; // place the next pass after this one
        i = f.startIndex;
      } else {
        frames.pop();
        i++;
      }
      continue;
    }
    out.push({ ...ev, tick: ev.tick + shift });
    i++;
  }
  return out;
}

/**
 * XMIDI ticks per quarter note. Miles XMIDI uses a fixed division; 60 reproduces the ADDQ songs
 * at musically-plausible lengths (ADDQ1 ≈ 63 s, ADDQ3 ≈ 52 s at their file tempos). The exact
 * timebase only scales total length — the structural checks below are independent of it.
 */
export const XMI_PPQN = 60;

/** The OPL2 master clock (Hz) used to quantize note frequencies to `fnum`/`block`. */
const OPL_CLOCK = 49716;

/** Structural report on a rendered song (the offline proof, no reference WAV needed). */
export interface OplSongStats {
  /** Total rendered length in seconds. */
  durationSec: number;
  /** Peak simultaneous voices (≤ 9 by construction — the OPL2 channel count). */
  maxPolyphony: number;
  /** Fraction of 100 ms windows across the song body that are audibly voiced (RMS above floor). */
  voicedFraction: number;
  /** Note-ons that sounded (admitted by the allocator). */
  renderedNotes: number;
  /** Note-ons cut short because their slot was stolen (faithful 9-voice behaviour). */
  stolenNotes: number;
  /** Percussion note-ons (MIDI channel 9) that resolved to a bank-100 timbre. */
  percussionNotes: number;
  /** Distinct MIDI channels that produced notes. */
  channelsUsed: number[];
  /** True if the song contained XMIDI for-loops that were unrolled into the timeline. */
  hadLoops: boolean;
}

/** A rendered song: the mixed clip plus its structural stats. */
export interface OplSongRender {
  clip: AudioClip;
  stats: OplSongStats;
}

/** Options for {@link renderXmiSong}. */
export interface RenderSongOptions {
  /** Output sample rate (Hz). Default 44100. */
  sampleRate?: number;
  /** Peak output amplitude after mix normalization. Default 0.9. */
  amplitude?: number;
  /** Max release tail per note (seconds) before it is cut. Default 0.4. */
  releaseTailSec?: number;
  /** Times to unroll an infinite XMIDI loop for the offline mixdown. Default 2. */
  maxLoopIterations?: number;
}

// --- Fast sine LUT (the inner mix loop calls this per operator per sample) -----------------

const SINE_BITS = 12;
const SINE_SIZE = 1 << SINE_BITS;
const SINE_MASK = SINE_SIZE - 1;
const SINE_LUT = (() => {
  const t = new Float32Array(SINE_SIZE);
  for (let i = 0; i < SINE_SIZE; i++) t[i] = Math.sin((2 * Math.PI * i) / SINE_SIZE);
  return t;
})();

/** Sample one OPL2 waveform at phase `p` in `[0, 1)` via the sine LUT. */
function wave(waveform: number, p: number): number {
  const idx = (p * SINE_SIZE) & SINE_MASK;
  const s = SINE_LUT[idx];
  switch (waveform & 0x03) {
    case 1: // half-sine
      return p < 0.5 ? s : 0;
    case 2: // abs-sine
      return s < 0 ? -s : s;
    case 3: // quarter / pulse sine
      return p % 0.5 < 0.25 ? (s < 0 ? -s : s) : 0;
    default:
      return s;
  }
}

// --- Pitch + envelope helpers (the "real tables" step) -------------------------------------

/** Quantize a frequency to an OPL2 `(block, fnum)` and the frequency it actually produces. */
function freqToFnumBlock(freq: number): { block: number; fnum: number; actual: number } {
  for (let block = 0; block < 8; block++) {
    const fnum = Math.round((freq * (1 << (20 - block))) / OPL_CLOCK);
    if (fnum < 1024) return { block, fnum, actual: (fnum * OPL_CLOCK) / (1 << (20 - block)) };
  }
  const fnum = Math.min(1023, Math.round((freq * (1 << 13)) / OPL_CLOCK));
  return { block: 7, fnum, actual: (fnum * OPL_CLOCK) / (1 << 13) };
}

/** Standard equal-temperament MIDI-note → frequency. */
function noteFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** OPL2 key-scale-level attenuation (dB) per field (0-3) — rises with the octave (`block`). */
const KSL_DB_PER_BLOCK = [0, 0.5, 1.0, 2.0] as const;

/**
 * Effective OPL2 envelope rate `0..63` = `field*4 + rate-key-scale`, where the key-scale comes
 * from the note's `block`/`fnum` (faster envelopes for higher notes), gated by the KSR bit.
 */
function effectiveRate(field: number, ksr: boolean, block: number, fnum: number): number {
  const ksn = (block << 1) | ((fnum >> 9) & 1); // key-scale number (0-15)
  const rof = ksr ? ksn : ksn >> 2;
  const er = field * 4 + rof;
  return er < 0 ? 0 : er > 63 ? 63 : er;
}

/**
 * Seconds for an OPL2 envelope to sweep its full ~96 dB range at effective rate `er` (0-63).
 * Each ~4 rate-steps halves the time; tuned to the OPL2 envelope time curve (rate 60 ≈ 1 ms,
 * rate 28 ≈ 0.28 s, rate 4 ≈ 18 s). An attenuation-domain model — faithful in shape, not the
 * cycle-exact dbopl counter (a later refinement).
 */
function fullSweepSec(er: number): number {
  if (er <= 0) return Number.POSITIVE_INFINITY;
  return 0.0011 * Math.pow(2, (60 - er) / 4);
}

/** Per-operator runtime state for the attenuation-domain envelope generator. */
interface EgState {
  /** Attenuation in dB: 96 = silent, 0 = loudest. */
  attDb: number;
  phase: 'attack' | 'decay' | 'sustain' | 'release';
  attackDbPerSample: number;
  decayDbPerSample: number;
  releaseDbPerSample: number;
  sustainDb: number;
  sustaining: boolean;
}

const MAX_ATT_DB = 96;

/** Build an operator's EG from its fields and the note's pitch (for key-scaling). */
function makeEg(op: OplOperator, block: number, fnum: number, sampleRate: number): EgState {
  const ar = effectiveRate(op.attackRate, op.ksr, block, fnum);
  const dr = effectiveRate(op.decayRate, op.ksr, block, fnum);
  const rr = effectiveRate(op.releaseRate, op.ksr, block, fnum);
  const atkS = fullSweepSec(ar);
  const dcyS = fullSweepSec(dr);
  const relS = fullSweepSec(rr);
  return {
    attDb: MAX_ATT_DB,
    phase: 'attack',
    attackDbPerSample: atkS === Infinity ? 0 : MAX_ATT_DB / (atkS * sampleRate),
    decayDbPerSample: dcyS === Infinity ? 0 : MAX_ATT_DB / (dcyS * sampleRate),
    releaseDbPerSample: relS === Infinity ? 0 : MAX_ATT_DB / (relS * sampleRate),
    sustainDb: (op.sustainLevel >= 15 ? MAX_ATT_DB : op.sustainLevel * 3), // 3 dB/step
    sustaining: op.sustaining,
  };
}

/** Advance one EG sample; returns linear gain (0..1). `released` once the key is up. */
function egNext(eg: EgState, released: boolean): number {
  if (released && eg.phase !== 'release') eg.phase = 'release';
  switch (eg.phase) {
    case 'attack':
      eg.attDb -= eg.attackDbPerSample;
      if (eg.attDb <= 0 || eg.attackDbPerSample === 0) {
        eg.attDb = 0;
        eg.phase = 'decay';
      }
      break;
    case 'decay':
      eg.attDb += eg.decayDbPerSample;
      if (eg.attDb >= eg.sustainDb) {
        eg.attDb = eg.sustainDb;
        if (eg.sustaining) eg.phase = 'sustain';
      }
      break;
    case 'sustain':
      if (!eg.sustaining) eg.attDb += eg.releaseDbPerSample;
      break;
    case 'release':
      eg.attDb += eg.releaseDbPerSample;
      break;
  }
  if (eg.attDb >= MAX_ATT_DB) {
    eg.attDb = MAX_ATT_DB;
    return 0;
  }
  return Math.pow(10, -eg.attDb / 20);
}

/** A note resolved to a concrete OPL2 voice + its place on the timeline. */
interface ScheduledNote {
  startS: number;
  /** Natural key-off sample (start + duration). */
  endS: number;
  /** Effective key-off after voice-stealing (≤ endS); set by the allocator. */
  cutS: number;
  patch: OplPatch;
  freq: number;
  block: number;
  fnum: number;
  gain: number;
  perc: boolean;
  channel: number;
}

/** TL (0-63, 0.75 dB/step) → linear gain. */
function tlGain(tl: number): number {
  return Math.pow(10, (-0.75 * tl) / 20);
}

/** Render one scheduled note into the shared mix buffer. */
function renderNote(mix: Float32Array, note: ScheduledNote, sampleRate: number, releaseTailSamples: number): void {
  const { patch } = note;
  const modMult = OPL_MULT_TABLE[patch.modulator.mult];
  const carMult = OPL_MULT_TABLE[patch.carrier.mult];
  const modInc = (note.freq * modMult) / sampleRate;
  const carInc = (note.freq * carMult) / sampleRate;

  const modEg = makeEg(patch.modulator, note.block, note.fnum, sampleRate);
  const carEg = makeEg(patch.carrier, note.block, note.fnum, sampleRate);

  // KSL: extra attenuation that grows with the octave.
  const kslDb = (k: OplOperator) => KSL_DB_PER_BLOCK[k.ksl] * note.block;
  const modGain = tlGain(patch.modulator.totalLevel) * Math.pow(10, -kslDb(patch.modulator) / 20);
  const carGain = tlGain(patch.carrier.totalLevel) * Math.pow(10, -kslDb(patch.carrier) / 20) * note.gain;
  const fbDepth = patch.feedback === 0 ? 0 : Math.pow(2, patch.feedback) / 64;

  let modPhase = 0;
  let carPhase = 0;
  let lastMod = 0;
  let prevMod = 0;

  const keyOff = note.cutS;
  const hardEnd = Math.min(mix.length, keyOff + releaseTailSamples);
  for (let i = note.startS; i < hardEnd; i++) {
    const released = i >= keyOff;
    const me = egNext(modEg, released);
    const ce = egNext(carEg, released);
    if (ce <= 0 && released) break; // carrier fully released → note is done

    const fb = fbDepth === 0 ? 0 : ((lastMod + prevMod) * 0.5) * fbDepth;
    const modOut = wave(patch.modulator.waveform, (modPhase + fb + 1) % 1) * me * modGain;
    prevMod = lastMod;
    lastMod = modOut;

    let sample: number;
    if (patch.additive) {
      const carOut = wave(patch.carrier.waveform, carPhase % 1) * ce * carGain;
      sample = (modOut + carOut) * 0.5;
    } else {
      const carOut = wave(patch.carrier.waveform, (carPhase + modOut * 0.5 + 1) % 1) * ce * carGain;
      sample = carOut;
    }
    mix[i] += sample;

    modPhase += modInc;
    carPhase += carInc;
    if (modPhase >= 1) modPhase -= Math.floor(modPhase);
    if (carPhase >= 1) carPhase -= Math.floor(carPhase);
  }
}

/** Build a tick→seconds converter from a tempo-meta list (default 120 BPM). */
function buildTempoMap(events: XmiEvent[]): (tick: number) => number {
  const segs: { tick: number; sec: number; usPerQuarter: number }[] = [
    { tick: 0, sec: 0, usPerQuarter: 500000 },
  ];
  for (const ev of events) {
    if (ev.kind !== 'tempo') continue;
    const last = segs[segs.length - 1];
    if (ev.tick === 0) {
      last.usPerQuarter = ev.usPerQuarter; // refine the initial tempo
      continue;
    }
    const sec = last.sec + ((ev.tick - last.tick) * (last.usPerQuarter / 1e6)) / XMI_PPQN;
    segs.push({ tick: ev.tick, sec, usPerQuarter: ev.usPerQuarter });
  }
  return (tick: number) => {
    let seg = segs[0];
    for (let i = 1; i < segs.length; i++) {
      if (segs[i].tick <= tick) seg = segs[i];
      else break;
    }
    return seg.sec + ((tick - seg.tick) * (seg.usPerQuarter / 1e6)) / XMI_PPQN;
  };
}

/**
 * Render one decoded XMIDI {@link XmiSong} through the AdLib timbre {@link AdLibBank} to a single
 * PCM mixdown via a 9-voice OPL2 mixer. Returns the clip and its structural {@link OplSongStats}.
 */
export function renderXmiSong(song: XmiSong, bank: AdLibBank, opts: RenderSongOptions = {}): OplSongRender {
  const sampleRate = opts.sampleRate ?? 44100;
  const amplitude = opts.amplitude ?? 0.9;
  const releaseTailSamples = Math.round((opts.releaseTailSec ?? 0.4) * sampleRate);
  // Unroll any XMIDI for-loops so the score is a flat timeline before scheduling.
  const hadLoops = song.events.some((e) => e.kind === 'controller' && (e.controller === XMIDI_FOR_LOOP || e.controller === XMIDI_NEXT_BREAK));
  const events = expandXmiLoops(song.events, opts.maxLoopIterations ?? 2);
  const tickToSec = buildTempoMap(events);

  // 1) Resolve every note-on to a concrete voice, tracking per-channel program + volume.
  const program = new Array(16).fill(0);
  const volume = new Array(16).fill(127);
  const fallback = bank.byKey.get(adLibKey(0, 0)) ?? bank.instruments[0];
  const notes: ScheduledNote[] = [];
  const channels = new Set<number>();
  let percussionNotes = 0;

  for (const ev of events) {
    if (ev.kind === 'program') {
      program[ev.channel] = ev.program;
    } else if (ev.kind === 'controller' && ev.controller === 7) {
      volume[ev.channel] = ev.value;
    } else if (ev.kind === 'noteOn') {
      const perc = ev.channel === 9;
      const inst = (perc ? bank.byKey.get(adLibKey(ev.note, 100)) : bank.byKey.get(adLibKey(program[ev.channel], 0))) ?? fallback;
      if (!inst) continue;
      const freq = noteFreq(ev.note);
      const { block, fnum, actual } = freqToFnumBlock(freq);
      notes.push({
        startS: Math.round(tickToSec(ev.tick) * sampleRate),
        endS: Math.round(tickToSec(ev.tick + ev.duration) * sampleRate),
        cutS: 0,
        patch: parseAdLibPatch(inst.operatorData),
        freq: actual,
        block,
        fnum,
        gain: (ev.velocity / 127) * (volume[ev.channel] / 127),
        perc,
        channel: ev.channel,
      });
      channels.add(ev.channel);
      if (perc) percussionNotes++;
    }
  }

  notes.sort((a, b) => a.startS - b.startS || a.endS - b.endS);

  // 2) 9-voice allocation: assign each note a slot; steal the soonest-ending when all are busy.
  const SLOTS = 9;
  const slotFreeAt = new Array<number>(SLOTS).fill(-1);
  const slotNote = new Array<ScheduledNote | null>(SLOTS).fill(null);
  let maxPolyphony = 0;
  let stolenNotes = 0;

  for (const note of notes) {
    note.cutS = note.endS;
    // Free any slot whose note has ended.
    let free = -1;
    for (let s = 0; s < SLOTS; s++) {
      if (slotFreeAt[s] <= note.startS) {
        slotFreeAt[s] = -1;
        slotNote[s] = null;
        if (free < 0) free = s;
      }
    }
    if (free < 0) {
      // All busy → steal the slot that ends soonest; cut its note at this note's start.
      let victim = 0;
      for (let s = 1; s < SLOTS; s++) if (slotFreeAt[s] < slotFreeAt[victim]) victim = s;
      const v = slotNote[victim];
      if (v && note.startS < v.cutS) {
        v.cutS = note.startS;
        stolenNotes++;
      }
      free = victim;
    }
    slotFreeAt[free] = note.endS;
    slotNote[free] = note;
    // Count currently-busy slots (polyphony) at this moment.
    let busy = 0;
    for (let s = 0; s < SLOTS; s++) if (slotFreeAt[s] > note.startS) busy++;
    if (busy > maxPolyphony) maxPolyphony = busy;
  }

  // 3) Size the mix buffer and render every note into it.
  let lastSample = 0;
  for (const n of notes) lastSample = Math.max(lastSample, Math.min(n.cutS + releaseTailSamples, n.endS + releaseTailSamples));
  // Body length comes from the expanded timeline (loops make it longer than song.durationTicks).
  const lastTick = events.length ? events[events.length - 1].tick : song.durationTicks;
  const songBodySamples = Math.round((lastTick ? tickToSec(lastTick) : 0) * sampleRate);
  const totalSamples = Math.max(1, lastSample, songBodySamples);
  const mix = new Float32Array(totalSamples);
  for (const n of notes) renderNote(mix, n, sampleRate, releaseTailSamples);

  // 4) Peak-normalize.
  let peak = 0;
  for (let i = 0; i < mix.length; i++) {
    const a = Math.abs(mix[i]);
    if (a > peak) peak = a;
  }
  if (peak > 0) {
    const k = amplitude / peak;
    for (let i = 0; i < mix.length; i++) mix[i] *= k;
  }

  // 5) Voiced fraction over the song BODY (proves it sounds across the whole timeline).
  const winSamples = Math.max(1, Math.round(0.1 * sampleRate));
  const bodyEnd = Math.max(winSamples, songBodySamples || totalSamples);
  let voicedWins = 0;
  let totalWins = 0;
  for (let w = 0; w + winSamples <= Math.min(mix.length, bodyEnd); w += winSamples) {
    let sum = 0;
    for (let i = w; i < w + winSamples; i++) sum += mix[i] * mix[i];
    if (Math.sqrt(sum / winSamples) > 0.003) voicedWins++;
    totalWins++;
  }

  const clip: AudioClip = {
    name: 'opl2-song',
    sampleRate,
    pcm: mix,
    oneShotSamples: mix.length,
    // The whole mixdown is the loop body — WebAudio loops the entire clip seamlessly.
    repeatSamples: mix.length,
  };
  return {
    clip,
    stats: {
      durationSec: mix.length / sampleRate,
      maxPolyphony,
      voicedFraction: totalWins ? voicedWins / totalWins : 0,
      renderedNotes: notes.length,
      stolenNotes,
      percussionNotes,
      channelsUsed: [...channels].sort((a, b) => a - b),
      hadLoops,
    },
  };
}
