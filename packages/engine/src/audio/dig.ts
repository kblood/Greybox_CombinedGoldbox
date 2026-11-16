/**
 * `SOUNDS.GLB` DIG4 digitized sound-effect decoder — DQK's *second* SFX bank (Phase C, C5b-2b-2b).
 *
 * The Dark Queen of Krynn ships its digitized effects twice: once as `SFXDQ.VOC` (Creative
 * 4-bit ADPCM, see {@link decodeVoc}) and once inside `SOUNDS.GLB` — an **HLIB DATA library**
 * (tag `DIG4`) holding **13 raw members**, one per effect, in the same fixed order as the VOC
 * bank ({@link DQK_SFX_NAMES}: cast, flame, sorcery, die, sling, hit, lightning, swing, walk,
 * fireball, bow, sploosh, crackle).
 *
 * **Member layout.** Each member is a **6-byte** header followed by the audio:
 *
 *  - `u16` **big-endian sample rate (Hz)** — only three distinct values appear, and they map
 *    1:1 onto the VOC rates: `0x1CFA` = 7418 ≈ VOC 7407 (the default effects), `0x2B77` = 11127 ≈
 *    VOC 11111 (members 3 & 6 — *die* and *lightning*, the two high-rate VOC effects), and
 *    `0x15BC` = 5564 ≈ VOC 5556 (member 9 — *fireball*). This rate grouping is what *proves* the
 *    member order matches the VOC order.
 *  - `u16` = **0** — the high word of the rate; always `00 00` since every rate is < 65536.
 *  - `u16` **big-endian payload length**, at offset 4. Verified on all 13 DQK members and on 46 of
 *    46 Amiga `DIG8` members across four titles: the word equals `member.length - 6`, or `- 7`
 *    where an odd payload is padded up to an even member length. **Null: 0 of 2483** arbitrary
 *    `u16be` windows elsewhere in the same members land in `{L-6, L-7}`, so this is an identity
 *    rather than a coincidence.
 *  - then the audio payload — see the codec note below.
 *
 * **The tag name is literal: `DIG4` is 4 bits per sample, `DIG8` is 8.** A `DIG4` payload is
 * **two 4-bit unsigned samples per byte, low nibble first**, centre `8`; Amiga `DIG8` is one
 * 8-bit unsigned sample per byte, centre `0x80` (see `dig8.ts`).
 *
 * **How the codec was settled (2026-08-21).** Envelope correlation against the already-verified
 * `SFXDQ.VOC` bank *cannot* decide this — it is scale- and length-normalised, and scores 0.684
 * (8-bit) against 0.680 (4-bit), i.e. nothing. The discriminating measurement is **lag-1
 * autocorrelation**: real audio is smooth sample-to-sample, whereas reading nibble-packed data as
 * whole bytes alternates between two interleaved streams and destroys that continuity.
 *
 * | reading | mean lag-1 autocorrelation over the 13 effects |
 * | --- | --- |
 * | `SFXDQ.VOC` (positive control, independently verified) | **0.742** |
 * | DIG4 as 4-bit, low nibble first | **0.754** |
 * | DIG4 as 8-bit (what this file did until 2026-08-21) | 0.434 |
 * | DIG4 as 4-bit, high nibble first | 0.501 |
 *
 * The 4-bit reading matches the control effect by effect, including where the control is *low*
 * (`sorcery` 0.206 control / 0.283 4-bit / **-0.703** 8-bit; `sling` 0.304 / 0.471 / -0.132). A
 * negative lag-1 autocorrelation is the signature of alternating nibbles read as bytes. The same
 * measurement over the Amiga `DIG8` banks comes out the other way — 0.515 as 8-bit against 0.122
 * as 4-bit — which is what makes this a per-tag codec difference and not a global mistake.
 *
 * Sample counts corroborate: at 4 bits per sample, `hit` is 2080 samples against the VOC's 2079,
 * `lightning` 5744 against 5743 and `crackle` 964 against 963. At 8 bits every effect would be
 * about half the length of its VOC twin. The IMA-ADPCM theory was rejected earlier: it produced
 * full-scale noise (RMS≈0.9) that correlated with nothing.
 *
 * Output is engine-neutral {@link AudioClip}s with normalized mono PCM in [−1, 1] and the member's
 * own sample rate, so the web `AudioManager` plays them exactly like the VOC / Amiga 8SVX effects.
 * Pure (no DOM/Node).
 */

import type { AudioClip } from './svx8.js';
import { decodeHlib, sniffHlib } from '../loaders/hlib.js';
import { DQK_SFX_NAMES } from './voc.js';

/**
 * Bytes of the per-member header that precede the audio payload: `u16be rate`, `u16` zero,
 * `u16be payload length`. This was 4 until 2026-08-21, which rendered the two length-word bytes
 * as the first two samples of every effect.
 */
const DIG_HEADER_BYTES = 6;

/** Samples per byte, by library tag — the tag name is literal (see the file doc comment). */
export type DigBitDepth = 4 | 8;

/** One decoded `SOUNDS.GLB` effect. */
export interface DigSound {
  /** Member index = DQK effect id (0..12), matching {@link DQK_SFX_NAMES}. */
  index: number;
  /** Decoded, normalized audio (sample rate taken from the member header). */
  clip: AudioClip;
}

/** A decoded `SOUNDS.GLB`: its effects in member (= effect-id) order. */
export interface DigFile {
  sounds: DigSound[];
}

/**
 * True if `bytes` looks like a `SOUNDS.GLB`-style DIG4 sound library: an HLIB container whose
 * members are raw (non-image) and tagged `DIG4`. Cheap; does not decode any audio.
 */
export function sniffDig(bytes: Uint8Array): boolean {
  if (!sniffHlib(bytes)) return false;
  try {
    const a = decodeHlib(bytes);
    return a.nonImage && a.tag === 'DIG4' && a.rawMembers.length > 0;
  } catch {
    return false;
  }
}

/**
 * Decode one sound-library member slice (6-byte header + audio payload) into an {@link AudioClip}.
 * `bits` selects the codec: `4` for DOS `DIG4` (two nibble samples per byte, low nibble first),
 * `8` for Amiga `DIG8` (one byte per sample). Exposed for probing individual members;
 * {@link decodeSoundsGlb} decodes the whole DIG4 bank and `dig8.ts` the DIG8 one.
 *
 * The header's declared payload length is honoured rather than merely recorded: the payload is
 * clamped to it, which drops the alignment pad byte odd-length members carry. That pad used to be
 * rendered as a final sample.
 */
export function decodeDigMember(member: Uint8Array, index: number, bits: DigBitDepth = 4): DigSound {
  if (member.length < DIG_HEADER_BYTES) {
    throw new Error(`SOUNDS.GLB member ${index}: too short (${member.length} bytes)`);
  }
  // u16 big-endian sample rate; the following u16 is its (always-zero) high word.
  const sampleRate = (member[0] << 8) | member[1];
  const declared = (member[4] << 8) | member[5];
  const avail = member.length - DIG_HEADER_BYTES;
  // Trust the declared length only where it is consistent with the member; a member that
  // disagrees keeps all of its bytes rather than being silently truncated.
  const payloadLen = declared > 0 && declared <= avail ? declared : avail;
  const data = member.subarray(DIG_HEADER_BYTES, DIG_HEADER_BYTES + payloadLen);
  const pcm = new Float32Array(bits === 4 ? data.length * 2 : data.length);
  if (bits === 4) {
    // Two 4-bit unsigned samples per byte, LOW nibble first, centre 8 → [-1, 1).
    for (let i = 0; i < data.length; i++) {
      pcm[2 * i] = ((data[i] & 0x0f) - 8) / 8;
      pcm[2 * i + 1] = ((data[i] >> 4) - 8) / 8;
    }
  } else {
    // 8-bit unsigned PCM, centre 0x80 → [-1, 1).
    for (let i = 0; i < data.length; i++) pcm[i] = (data[i] - 128) / 128;
  }
  const name =
    index >= 0 && index < DQK_SFX_NAMES.length ? DQK_SFX_NAMES[index] : `dig${index}`;
  return {
    index,
    clip: { name, sampleRate, pcm, oneShotSamples: 0, repeatSamples: 0 },
  };
}

/**
 * Decode a `SOUNDS.GLB` DIG4 sound library into its 13 digitized effects, in member order
 * (= DQK effect id). Throws if `bytes` is not a DIG4 HLIB library.
 */
export function decodeSoundsGlb(bytes: Uint8Array, name = 'SOUNDS.GLB'): DigFile {
  const arc = decodeHlib(bytes, name);
  if (!arc.nonImage || arc.tag !== 'DIG4') {
    throw new Error(
      `${name}: expected an HLIB DIG4 sound library (tag=${JSON.stringify(arc.tag)}, nonImage=${arc.nonImage})`,
    );
  }
  const sounds = arc.rawMembers.map((m, i) => decodeDigMember(m, i, 4));
  return { sounds };
}
