/**
 * IFF 8SVX decoder — Amiga "8-Bit Sampled Voice", the format of every Krynn Amiga sound
 * effect (`arrow`, `hit`, `fireb`, …) and the bundled `soundData` instrument waveform.
 *
 * 8SVX wraps signed 8-bit mono PCM. The `VHDR` chunk gives the playback rate and the
 * one-shot / repeat split; the `BODY` chunk is the raw signed bytes (optionally
 * Fibonacci-delta compressed — `sCompression == 1`). The Krynn assets are all uncompressed
 * (`sCompression == 0`), which is what we decode here; compressed bodies throw a clear
 * error rather than emit silent garbage.
 *
 * Output is engine-neutral: a sample rate plus normalized `Float32Array` PCM in [-1, 1],
 * which the browser layer wraps in a Web Audio `AudioBuffer`. Pure (no DOM/Node).
 *
 * Refs: AmigaOS-Wiki "8SVX IFF 8-Bit Sampled Voice"; Wikipedia "8SVX".
 */
import { readForm, walkChunks, findChunk, readU16BE, readU32BE, chunkText } from './iff.js';

/** Decoded one-shot sample, ready for Web Audio. */
export interface AudioClip {
  /** Optional NAME chunk text (e.g. `'arrow'`, `'square'`). */
  name: string;
  /** Playback rate in Hz (VHDR `samplesPerSec`). */
  sampleRate: number;
  /** Normalized mono PCM in [-1, 1], one float per sample. */
  pcm: Float32Array;
  /** Samples before the looping section starts (VHDR one-shot length); 0 if none/unknown. */
  oneShotSamples: number;
  /** Length of the looping section in samples (VHDR repeat length); 0 if non-looping. */
  repeatSamples: number;
}

/** Default rate to assume when a VHDR reports 0 (some tools leave it blank). */
const FALLBACK_RATE = 8000;

/**
 * Decode an 8SVX file (a `FORM 8SVX`) to a normalized {@link AudioClip}.
 * @throws if the bytes are not 8SVX, lack VHDR/BODY, or use Fibonacci-delta compression.
 */
export function decode8svx(bytes: Uint8Array, label = '8SVX'): AudioClip {
  const form = readForm(bytes, locateForm(bytes));
  if (form.formType !== '8SVX') throw new Error(`${label}: not an 8SVX form (got "${form.formType}")`);

  const vhdr = findChunk(form.chunks, 'VHDR');
  const body = findChunk(form.chunks, 'BODY');
  if (!vhdr) throw new Error(`${label}: missing VHDR chunk`);
  if (!body) throw new Error(`${label}: missing BODY chunk`);

  // VHDR: oneShotHi(u32) repeatHi(u32) samplesPerHiCycle(u32) samplesPerSec(u16)
  //       ctOctave(u8) sCompression(u8) volume(u32, fixed 16.16)
  const v = vhdr.start;
  const oneShotSamples = readU32BE(bytes, v);
  const repeatSamples = readU32BE(bytes, v + 4);
  const sampleRate = readU16BE(bytes, v + 12) || FALLBACK_RATE;
  const ctOctave = bytes[v + 14];
  const sCompression = bytes[v + 15];
  if (sCompression !== 0) {
    throw new Error(`${label}: Fibonacci-delta (sCompression=${sCompression}) not supported`);
  }

  // For a multi-octave sample the BODY holds octave 0 first (the lowest, longest-period
  // copy). Take just that first octave when its length is known, else the whole body.
  const firstOctave = oneShotSamples + repeatSamples;
  const count =
    ctOctave > 1 && firstOctave > 0 && firstOctave <= body.length ? firstOctave : body.length;

  const pcm = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // Signed 8-bit → [-1, 1]. (int8)b / 128.
    const s = bytes[body.start + i];
    pcm[i] = (s < 128 ? s : s - 256) / 128;
  }

  // The NAME may live inside the FORM or, as in `soundData`, as a sibling chunk before it.
  const nameChunk =
    findChunk(form.chunks, 'NAME') ?? findChunk(walkChunks(bytes, 0, bytes.length), 'NAME');
  return {
    name: nameChunk ? chunkText(bytes, nameChunk) : '',
    sampleRate,
    pcm,
    oneShotSamples,
    repeatSamples,
  };
}

/**
 * Some Krynn audio files (e.g. `soundData`) prefix the 8SVX `FORM` with a stray `NAME`
 * chunk. Skip any leading non-FORM chunks and return the offset of the first `FORM`.
 */
function locateForm(bytes: Uint8Array): number {
  const idAt = (o: number): string =>
    o + 4 <= bytes.length ? String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]) : '';
  if (idAt(0) === 'FORM') return 0;
  // Walk top-level chunks looking for a FORM; the chunk id sits 8 bytes before its payload.
  for (const c of walkChunks(bytes, 0, bytes.length)) {
    if (idAt(c.start - 8) === 'FORM') return c.start - 8;
  }
  return 0;
}
