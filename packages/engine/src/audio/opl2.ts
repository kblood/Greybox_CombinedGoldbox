/**
 * Minimal pure-TS OPL2 (Yamaha YM3812) 2-operator FM voice + the `INSTR.AD` operator-field
 * map — DQK AdLib music synthesis, first slice (Phase C, C5b-2a).
 *
 * ## The pinned 12-byte `INSTR.AD` operator map
 *
 * Each `INSTR.AD` record's 12 operator bytes (the record minus its `u16` length prefix — see
 * {@link decodeInstrAd}) is a leading pad byte (always `0x00`) followed by 11 register bytes
 * stored as **interleaved `(modulator, carrier)` pairs**, NOT the SBI register order:
 *
 * ```
 * [0]  pad (always 0)
 * [1]  mod 0x20   [2]  car 0x20    AM/VIB/EG-type/KSR/MULT
 * [3]  mod 0x60   [4]  car 0x60    attack-rate / decay-rate
 * [5]  mod 0xE0   [6]  car 0xE0    waveform select
 * [7]  mod 0x40   [8]  car 0x40    key-scale-level / total-level
 * [9]  mod 0x80   [10] car 0x80    sustain-level / release-rate
 * [11] 0xC0                        feedback (bits 1-3) / connection (bit 0)
 * ```
 *
 * **Pinned by synthesis + structural analysis**, not guessed. The interleaved order is the only
 * one where the audibility-critical fields are coherent across the bank's real patches: every
 * carrier's `0x40` total-level is `0` (carriers at full volume), every carrier's `0x60`
 * attack-rate is `>= 1` (every note actually attacks), the two `0xE0` columns are the only ones
 * confined to `0..3` (valid OPL2 waveforms), and `0xC0` stays in `0..3` (FB 0-1, CNT). The drum
 * patch (117) reads back as additive (CNT=1) with a fast carrier decay, and the clarinet (51) as
 * a half-sine modulator — exactly what those timbres should be. SBI order, by contrast, puts the
 * carrier attack on a column that is `0` for most patches (silent notes) — ruled out.
 *
 * ## The synth
 *
 * A faithful-enough OPL2 *voice* (one channel, two operators): the four OPL2 waveforms, an
 * exponential ADSR envelope generator, FM (CNT=0) / additive (CNT=1) operator routing, and
 * modulator self-feedback. The envelope rate→time curve is an approximation tuned to produce
 * correctly-shaped, voiced output (the exact OPL2 dB rate tables and the full 9-channel mixer +
 * XMI event driver are C5b-2b); the operator *map* above is what this slice pins, and the synth
 * is its validator — feed a patch a note and it sings at that pitch. Pure (no DOM/Node).
 *
 * Refs: hackdocs `UASOUND.TXT`; the OPL2 (YM3812) register set; the AdLib "SBI" timbre layout
 * (which this bank deliberately reorders).
 */
import type { AudioClip } from './svx8.js';

/** OPL2 frequency-multiplier table indexed by the 4-bit MULT field (`0 → 0.5×`). */
export const OPL_MULT_TABLE = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 12, 12, 15, 15] as const;

/** One decoded OPL2 operator (modulator or carrier). */
export interface OplOperator {
  /** Frequency multiple (raw 4-bit field; resolve through {@link OPL_MULT_TABLE}). */
  mult: number;
  /** Key-scale level (0-3): attenuation added as pitch rises. */
  ksl: number;
  /** Total level (0-63): base attenuation, 0.75 dB/step (0 = loudest). */
  totalLevel: number;
  /** Amplitude-modulation (tremolo) enable. */
  am: boolean;
  /** Vibrato enable. */
  vib: boolean;
  /** Envelope type: `true` = sustaining (hold at sustain level), `false` = percussive (decay through). */
  sustaining: boolean;
  /** Key-scale rate: envelope rates speed up with pitch. */
  ksr: boolean;
  /** Attack rate (0-15, 15 = instant). */
  attackRate: number;
  /** Decay rate (0-15). */
  decayRate: number;
  /** Sustain level (0-15, the attenuation the decay falls to). */
  sustainLevel: number;
  /** Release rate (0-15). */
  releaseRate: number;
  /** Waveform select (0-3): sine, half-sine, abs-sine, quarter-sine. */
  waveform: number;
}

/** A decoded OPL2 2-operator timbre. */
export interface OplPatch {
  modulator: OplOperator;
  carrier: OplOperator;
  /** Feedback (0-7): modulator self-modulation depth. */
  feedback: number;
  /** Connection: `false` = FM (mod → car), `true` = additive (mod + car). */
  additive: boolean;
}

/** Extract one operator from its four packed register bytes. */
function operatorFrom(reg20: number, reg60: number, regE0: number, reg40: number, reg80: number): OplOperator {
  return {
    mult: reg20 & 0x0f,
    am: (reg20 & 0x80) !== 0,
    vib: (reg20 & 0x40) !== 0,
    sustaining: (reg20 & 0x20) !== 0,
    ksr: (reg20 & 0x10) !== 0,
    attackRate: (reg60 >> 4) & 0x0f,
    decayRate: reg60 & 0x0f,
    waveform: regE0 & 0x03,
    ksl: (reg40 >> 6) & 0x03,
    totalLevel: reg40 & 0x3f,
    sustainLevel: (reg80 >> 4) & 0x0f,
    releaseRate: reg80 & 0x0f,
  };
}

/**
 * Parse the 12 operator bytes of an `INSTR.AD` record into an {@link OplPatch}, per the pinned
 * interleaved `(mod, car)` map documented above. Accepts the exact 12-byte `operatorData` slice
 * from {@link AdLibInstrument}.
 * @throws if fewer than 12 bytes are supplied.
 */
export function parseAdLibPatch(operatorData: Uint8Array): OplPatch {
  if (operatorData.length < 12) {
    throw new Error(`parseAdLibPatch: need 12 operator bytes, got ${operatorData.length}`);
  }
  const b = operatorData;
  const modulator = operatorFrom(b[1], b[3], b[5], b[7], b[9]);
  const carrier = operatorFrom(b[2], b[4], b[6], b[8], b[10]);
  const fbConn = b[11];
  return {
    modulator,
    carrier,
    feedback: (fbConn >> 1) & 0x07,
    additive: (fbConn & 0x01) !== 0,
  };
}

/** Standard equal-temperament MIDI-note → frequency (A4 = note 69 = 440 Hz). */
export function midiNoteToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** Sample one OPL2 waveform at phase `p` in `[0, 1)`. */
function oplWave(waveform: number, p: number): number {
  const x = 2 * Math.PI * p;
  switch (waveform & 0x03) {
    case 1: // half-sine: positive lobe only
      return p < 0.5 ? Math.sin(x) : 0;
    case 2: // abs-sine: full-wave rectified
      return Math.abs(Math.sin(x));
    case 3: // quarter / pulse sine: the rising quarter of each half lobe
      return p % 0.5 < 0.25 ? Math.abs(Math.sin(x)) : 0;
    default: // sine
      return Math.sin(x);
  }
}

/** TL (0-63, 0.75 dB/step) → linear gain in [0, 1]. */
function tlToGain(totalLevel: number): number {
  return Math.pow(10, (-0.75 * totalLevel) / 20);
}

/**
 * Approximate an OPL2 envelope rate (0-15) as the time in seconds for a full attenuation sweep.
 * Rate 0 = effectively frozen; each step roughly halves the time. Tuned for audibly-shaped,
 * voiced output — the exact OPL2 dB rate tables are C5b-2b.
 */
function rateToSeconds(rate: number, fullSweepBase: number): number {
  if (rate <= 0) return Number.POSITIVE_INFINITY;
  return fullSweepBase / Math.pow(2, rate - 1);
}

/** Options for {@link renderOplNote}. */
export interface RenderOplOptions {
  /** Output sample rate (Hz). Default 44100. */
  sampleRate?: number;
  /** Total rendered length (ms), including release tail. Default 700. */
  durationMs?: number;
  /** When the key is released (ms from start); the release phase follows. Default 500. */
  noteOffMs?: number;
  /** Peak output amplitude before normalization headroom. Default 0.9. */
  amplitude?: number;
}

/** Internal per-operator envelope state machine (attack → decay → sustain → release). */
class Envelope {
  private level = 0; // current linear amplitude 0..1
  private readonly attackPerSample: number;
  private readonly decayDbPerSample: number;
  private readonly releaseDbPerSample: number;
  private readonly sustainGain: number;
  private phase: 'attack' | 'decay' | 'sustain' | 'release' = 'attack';
  private readonly sustaining: boolean;
  private gain = 0;

  constructor(op: OplOperator, sampleRate: number) {
    // Attack: linear amplitude ramp 0→1. Decay/release: linear-in-dB toward a floor.
    const atkS = rateToSeconds(op.attackRate, 0.5);
    this.attackPerSample = atkS === Infinity ? 0 : 1 / (atkS * sampleRate);
    const dcyS = rateToSeconds(op.decayRate, 1.2);
    this.decayDbPerSample = dcyS === Infinity ? 0 : 96 / (dcyS * sampleRate);
    const relS = rateToSeconds(op.releaseRate, 1.0);
    this.releaseDbPerSample = relS === Infinity ? 0 : 96 / (relS * sampleRate);
    // Sustain level: 0-15 → attenuation, 3 dB/step (15 = silent floor).
    this.sustainGain = op.sustainLevel >= 15 ? 0 : Math.pow(10, (-3 * op.sustainLevel) / 20);
    this.sustaining = op.sustaining;
  }

  /** True once the release has decayed to silence. */
  get done(): boolean {
    return this.phase === 'release' && this.gain <= 0.0001;
  }

  release(): void {
    if (this.phase !== 'release') this.phase = 'release';
  }

  /** Advance one sample and return the current gain (0..1). */
  next(): number {
    switch (this.phase) {
      case 'attack':
        this.level += this.attackPerSample;
        if (this.level >= 1 || this.attackPerSample === 0) {
          this.level = 1;
          this.phase = 'decay';
        }
        this.gain = this.level;
        break;
      case 'decay':
        this.gain = dbDown(this.gain, this.decayDbPerSample);
        if (this.gain <= this.sustainGain) {
          this.gain = this.sustainGain;
          this.phase = 'sustain';
        }
        // Percussive (non-sustaining) operators decay straight through to silence.
        if (!this.sustaining) this.phase = 'decay';
        break;
      case 'sustain':
        if (!this.sustaining) this.gain = dbDown(this.gain, this.releaseDbPerSample);
        break;
      case 'release':
        this.gain = dbDown(this.gain, this.releaseDbPerSample);
        break;
    }
    return this.gain;
  }
}

/** Reduce a linear gain by `db` decibels (one sample step), flooring at 0. */
function dbDown(gain: number, db: number): number {
  if (db <= 0) return gain;
  const g = gain * Math.pow(10, -db / 20);
  return g < 0.00005 ? 0 : g;
}

/**
 * Render a single note through an {@link OplPatch} to a normalized {@link AudioClip}.
 *
 * Drives a 2-operator OPL2 voice: the carrier sounds at `freq × carrierMULT`, FM-modulated by
 * the modulator (CNT=0) or summed with it (CNT=1), each shaped by its own ADSR envelope, with
 * modulator self-feedback. Produces voiced PCM whose fundamental tracks the requested note —
 * the proof that the operator map is pinned correctly.
 */
export function renderOplNote(
  patch: OplPatch,
  midiNote: number,
  opts: RenderOplOptions = {},
): AudioClip {
  const sampleRate = opts.sampleRate ?? 44100;
  const durationMs = opts.durationMs ?? 700;
  const noteOffMs = opts.noteOffMs ?? 500;
  const amplitude = opts.amplitude ?? 0.9;

  const baseFreq = midiNoteToFreq(midiNote);
  const totalSamples = Math.max(1, Math.round((durationMs / 1000) * sampleRate));
  const noteOffSample = Math.round((noteOffMs / 1000) * sampleRate);

  const modMult = OPL_MULT_TABLE[patch.modulator.mult];
  const carMult = OPL_MULT_TABLE[patch.carrier.mult];
  const modInc = (baseFreq * modMult) / sampleRate;
  const carInc = (baseFreq * carMult) / sampleRate;

  const modEnv = new Envelope(patch.modulator, sampleRate);
  const carEnv = new Envelope(patch.carrier, sampleRate);

  const modGain = tlToGain(patch.modulator.totalLevel);
  const carGain = tlToGain(patch.carrier.totalLevel);
  // Feedback 0-7 → modulation depth (0 = none); scaled like real OPL (~π/16 per step).
  const fbDepth = patch.feedback === 0 ? 0 : Math.pow(2, patch.feedback) / 64;

  const pcm = new Float32Array(totalSamples);
  let modPhase = 0;
  let carPhase = 0;
  let lastMod = 0; // for feedback
  let prevMod = 0;

  for (let i = 0; i < totalSamples; i++) {
    if (i === noteOffSample) {
      modEnv.release();
      carEnv.release();
    }
    const me = modEnv.next();
    const ce = carEnv.next();

    // Modulator with self-feedback (averaged last two outputs, per OPL2).
    const fb = fbDepth === 0 ? 0 : ((lastMod + prevMod) / 2) * fbDepth;
    const modOut = oplWave(patch.modulator.waveform, (modPhase + fb) % 1) * me * modGain;
    prevMod = lastMod;
    lastMod = modOut;

    let sample: number;
    if (patch.additive) {
      // AM / additive: both operators reach the output.
      const carOut = oplWave(patch.carrier.waveform, carPhase % 1) * ce * carGain;
      sample = (modOut + carOut) * 0.5;
    } else {
      // FM: the modulator deviates the carrier phase (depth ~ half a cycle at full level).
      const carOut = oplWave(patch.carrier.waveform, (carPhase + modOut * 0.5 + 1) % 1) * ce * carGain;
      sample = carOut;
    }
    pcm[i] = sample * amplitude;

    modPhase += modInc;
    carPhase += carInc;
    if (modPhase >= 1) modPhase -= Math.floor(modPhase);
    if (carPhase >= 1) carPhase -= Math.floor(carPhase);

    if (carEnv.done && i > noteOffSample) {
      // Carrier fully released — trim the clip here.
      return finishClip(pcm.subarray(0, i + 1), sampleRate, patch);
    }
  }
  return finishClip(pcm, sampleRate, patch);
}

/** Wrap rendered PCM (and a peak-normalize guard) in an {@link AudioClip}. */
function finishClip(pcm: Float32Array, sampleRate: number, patch: OplPatch): AudioClip {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
  if (peak > 1) {
    const k = 1 / peak;
    for (let i = 0; i < pcm.length; i++) pcm[i] *= k;
  }
  return {
    name: `opl2(${patch.additive ? 'AM' : 'FM'})`,
    sampleRate,
    pcm: pcm instanceof Float32Array && pcm.length === pcm.buffer.byteLength / 4 ? pcm : new Float32Array(pcm),
    oneShotSamples: pcm.length,
    repeatSamples: 0,
  };
}

/** Root-mean-square level of a PCM buffer (a quick "is it voiced?" measure). */
export function pcmRms(pcm: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / Math.max(1, pcm.length));
}

/**
 * Estimate the dominant frequency of a PCM buffer by autocorrelation, searching the musical
 * range `[minHz, maxHz]`. Used to confirm a rendered note sounds at the expected pitch without
 * a reference WAV. Returns 0 if no clear period is found.
 */
export function dominantHz(pcm: Float32Array, sampleRate: number, minHz = 50, maxHz = 5000): number {
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(pcm.length - 1, Math.floor(sampleRate / minHz));
  if (maxLag <= minLag) return 0;
  // Use the loudest window to avoid the silent release tail skewing the estimate.
  const win = Math.min(pcm.length, sampleRate >> 2); // up to 0.25 s
  let bestLag = 0;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i + lag < win; i++) corr += pcm[i] * pcm[i + lag];
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  return bestLag > 0 ? sampleRate / bestLag : 0;
}
