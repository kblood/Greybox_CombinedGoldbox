/**
 * Creative Voice File (`.VOC`) decoder — DQK's digitized sound effects (Phase C, C5b-1).
 *
 * `SFXDQ.VOC` (DISK1) is the Dark Queen of Krynn / FRUA sound-effect bank: **13 effects**
 * separated by VOC *marker* blocks `0..12`. Per hackdocs `UASOUND.TXT` the order is fixed —
 * Cast, Flame, Sorcery, Die, Sling, Hit, Lightning, Swing, Walk, Fireball, Bow, Sploosh,
 * Crackle — so the marker doubles as the effect id.
 *
 * A `.VOC` is: a 20-byte `"Creative Voice File\x1A"` magic, a `u16` header size (offset to the
 * first block), `u16` version, `u16` checksum, then a chain of blocks — each a `u8` type + a
 * 24-bit little-endian length + payload:
 *
 *  - **type 0** — terminator.
 *  - **type 1** — sound data: `u8 freq-divisor`, `u8 codec`, then the audio payload. The rate is
 *    `1_000_000 / (256 − divisor)`. `SFXDQ.VOC` uses **codec 1 = Creative 4-bit ADPCM** (the first
 *    payload byte is the 8-bit reference sample, each later byte is two 4-bit nibbles).
 *  - **type 4** — marker: a `u16` value (here the effect index that the *following* sound is).
 *
 * Output is engine-neutral, matching {@link AudioClip}: a sample rate plus normalized mono
 * `Float32Array` PCM in [−1, 1], so the web `AudioManager` plays VOC effects exactly like the
 * Amiga 8SVX ones. Pure (no DOM/Node).
 *
 * The Creative 4-bit ADPCM math is the hardware-accurate Sound-Blaster scheme (the symmetric
 * `scaleMap`/`adjustMap` reference decoder DOSBox uses) — a running 8-bit reference adjusted by a
 * signed table indexed by `nibble + scale`, with `scale` stepping ±16. This is what the game's DAC
 * actually reconstructed; the asymmetric `ADPCM_SBPRO_4` model railed these samples negative.
 */

import type { AudioClip } from './svx8.js';

/** One decoded VOC effect: the marker that introduced it and its audio. */
export interface VocSound {
  /** Marker value preceding this sound (the DQK effect index), or −1 if none. */
  marker: number;
  /** Decoded, normalized audio. */
  clip: AudioClip;
}

/** A decoded `.VOC`: its effects in file order. */
export interface VocFile {
  sounds: VocSound[];
}

/** DQK / FRUA `SFXDQ.VOC` effect names by marker index (hackdocs `UASOUND.TXT`). */
export const DQK_SFX_NAMES = [
  'cast', 'flame', 'sorcery', 'die', 'sling', 'hit', 'lightning',
  'swing', 'walk', 'fireball', 'bow', 'sploosh', 'crackle',
] as const;

const VOC_MAGIC = 'Creative Voice File\x1a';

/** Clamp `v` into `[lo, hi]`. */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Creative 4-bit ADPCM reconstruction tables (the Sound-Blaster hardware decoder). `scaleMap`
// is the signed delta added to the running reference; `adjustMap` steps `scale` by ±16. Both are
// indexed by `nibble + scale` (0..63). Symmetric, so the decoded waveform is centred — unlike the
// asymmetric `ADPCM_SBPRO_4` model, which railed these effects to the negative limit.
const ADPCM4_SCALE_MAP = [
  0, 1, 2, 3, 4, 5, 6, 7, 0, -1, -2, -3, -4, -5, -6, -7,
  1, 3, 5, 7, 9, 11, 13, 15, -1, -3, -5, -7, -9, -11, -13, -15,
  2, 6, 10, 14, 18, 22, 26, 30, -2, -6, -10, -14, -18, -22, -26, -30,
  4, 12, 20, 28, 36, 44, 52, 60, -4, -12, -20, -28, -36, -44, -52, -60,
];
const ADPCM4_ADJUST_MAP = [
  0, 0, 0, 0, 0, 16, 16, 16, 0, 0, 0, 0, 0, 16, 16, 16,
  240, 0, 0, 0, 0, 16, 16, 16, 240, 0, 0, 0, 0, 16, 16, 16,
  240, 0, 0, 0, 0, 16, 16, 16, 240, 0, 0, 0, 0, 16, 16, 16,
  240, 0, 0, 0, 0, 0, 0, 0, 240, 0, 0, 0, 0, 0, 0, 0,
];

/**
 * Decode a Creative 4-bit ADPCM payload to 8-bit-unsigned samples (0..255). The first byte is the
 * reference sample, emitted as-is; every later byte holds a high then low 4-bit nibble. Each nibble
 * indexes the scale/adjust tables to step the running `reference` and `scale` (the Sound-Blaster
 * scheme).
 */
function decodeCreativeAdpcm4(payload: Uint8Array): Uint8Array {
  if (payload.length === 0) return new Uint8Array(0);
  const out = new Uint8Array(1 + 2 * (payload.length - 1));
  let reference = payload[0];
  let scale = 0;
  let oi = 0;
  out[oi++] = reference;

  const step = (nibble: number): void => {
    const samp = clamp(nibble + scale, 0, 63);
    reference = clamp(reference + ADPCM4_SCALE_MAP[samp], 0, 255);
    scale = (scale + ADPCM4_ADJUST_MAP[samp]) & 0xff;
    out[oi++] = reference;
  };

  for (let i = 1; i < payload.length; i++) {
    step(payload[i] >> 4);
    step(payload[i] & 0x0f);
  }
  return out;
}

/** Normalize unsigned-8 PCM (0..255, silence at 128) to Float32 [−1, 1]. */
function normalizeU8(payload: Uint8Array): Float32Array {
  const pcm = new Float32Array(payload.length);
  for (let i = 0; i < payload.length; i++) pcm[i] = (payload[i] - 128) / 128;
  return pcm;
}

/** True if `bytes` begins with the Creative Voice File magic. */
export function sniffVoc(bytes: Uint8Array): boolean {
  if (bytes.length < VOC_MAGIC.length + 6) return false;
  for (let i = 0; i < VOC_MAGIC.length; i++) {
    if (bytes[i] !== VOC_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

/**
 * Decode a `.VOC` file into its sounds. Handles codec 0 (8-bit unsigned PCM) and codec 1
 * (SB Pro 4-bit ADPCM); a type-4 marker before a sound becomes that sound's `marker`. Other
 * block types are skipped. Stops cleanly at a terminator / truncated tail.
 */
export function decodeVoc(bytes: Uint8Array): VocFile {
  if (!sniffVoc(bytes)) throw new Error('decodeVoc: not a Creative Voice File');
  const headerSize = bytes[0x14] | (bytes[0x15] << 8);
  const sounds: VocSound[] = [];
  let off = headerSize;
  let pendingMarker = -1;

  while (off + 1 <= bytes.length) {
    const type = bytes[off];
    if (type === 0) break; // terminator
    if (off + 4 > bytes.length) break; // truncated block header
    const len = bytes[off + 1] | (bytes[off + 2] << 8) | (bytes[off + 3] << 16);
    const data = off + 4;
    if (data + len > bytes.length) break; // truncated payload

    if (type === 4) {
      pendingMarker = bytes[data] | (bytes[data + 1] << 8);
    } else if (type === 1) {
      const divisor = bytes[data];
      const codec = bytes[data + 1];
      const sampleRate = Math.round(1_000_000 / (256 - divisor));
      const payload = bytes.subarray(data + 2, data + len);
      let pcm: Float32Array;
      if (codec === 1) pcm = normalizeU8(decodeCreativeAdpcm4(payload));
      else if (codec === 0) pcm = normalizeU8(payload);
      else pcm = new Float32Array(0); // unsupported codec — emit a silent placeholder, no throw
      const marker = pendingMarker;
      sounds.push({
        marker,
        clip: {
          name: marker >= 0 && marker < DQK_SFX_NAMES.length ? DQK_SFX_NAMES[marker] : `voc${sounds.length}`,
          sampleRate,
          pcm,
          oneShotSamples: 0,
          repeatSamples: 0,
        },
      });
      pendingMarker = -1;
    }
    off = data + len;
  }

  return { sounds };
}
