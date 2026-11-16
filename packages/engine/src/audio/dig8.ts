/**
 * `SOUNDS.GLB` (Amiga `DIG8`) digitized sound-effect decoder — the Amiga counterpart of DQK
 * DOS's `SOUNDS.GLB` (`DIG4`, see {@link decodeSoundsGlb} in `dig.ts`), for the six
 * DataLib-era Gold Box titles whose Amiga ports ship a `GLIB`-container `SOUNDS.GLB`: Curse of
 * the Azure Bonds, Secret of the Silver Blades, Gateway to the Savage Frontier, Treasures of
 * the Savage Frontier, Pools of Darkness, and The Dark Queen of Krynn itself (whose own Amiga
 * SFX were hand-analyzed in `docs/engine/research/audio-formats-krynn.md` §1.6 but never wired
 * up as a decoder — this closes that gap too).
 *
 * **Member layout — the same 6-byte framing as DOS `DIG4`, but a different codec.** Each `DIG8`
 * member is
 *
 *  - `u16` **big-endian sample rate (Hz)** — every sampled member across all six titles reads
 *    `0x1CFA` = 7418 Hz, the same fixed rate DQK's own DOS `DIG4`/`SFXDQ.VOC` banks use.
 *  - `u16` = **0** (always-zero high word of the rate, same as DIG4).
 *  - `u16` **big-endian payload length** at offset 4 — so the audio starts at byte **6**, not 4.
 *    Verified across four Amiga titles (Curse of the Azure Bonds, Amiga DQK, Gateway, Pools of
 *    Darkness): the word equals `member.length - 6` (or `- 7` when an odd payload is padded up)
 *    in **46 of 46** members.
 *  - then raw **8-bit *unsigned* PCM** (centre `0x80`), one byte per sample.
 *
 * **CORRECTED 2026-08-21.** This file previously said the member layout was "byte-IDENTICAL to
 * DOS DIG4" and shared `decodeDigMember` on that basis. Two things were wrong with that. The
 * header is 6 bytes, not 4, in *both* — so both banks were rendering the two length-word bytes as
 * the first two samples of every effect. And the two tags are **not** the same codec: the tag name
 * is literal, `DIG4` packing two 4-bit samples per byte and `DIG8` one 8-bit sample. Mean lag-1
 * autocorrelation over the 46 Amiga members is **0.515** read as 8-bit against **0.122** read as
 * 4-bit; the same measurement on DOS `DIG4` comes out the other way (0.434 as 8-bit against 0.754
 * as 4-bit, matching the `SFXDQ.VOC` control's 0.742). So this file's 8-bit reading was right and
 * DQK's DOS bank was the one being mis-decoded — see `dig.ts` for the full table.
 *
 * The earlier structural checks quoted below still hold; they were simply not discriminating.
 * Every decoded member has DC-near-zero mean (consistent with the 0x80 centring), an RMS envelope
 * that rises and falls in a coherent attack/sustain shape (not the flat, uniformly-random envelope
 * real noise would show), and a peak that saturates at the 8-bit rail. The GLIB container itself
 * was already fully solved (`docs/glib-format.md`).
 *
 * Unlike DQK's DIG4 bank, these titles have **no hackdocs-sourced per-index SFX names** (DQK's
 * `UASOUND.TXT` naming is DQK-specific) — members are exposed under generic `sfxN` names, and
 * callers that map them onto game actions are making a best-effort index assignment, not
 * claiming a verified semantic label (the same honestly-approximate stance `gameAudio.ts`
 * already takes when DoK reuses CoK's own named 8SVX one-shots).
 */
import type { AudioClip } from './svx8.js';
import { decodeDigMember } from './dig.js';
import { decodeGlib, sniffGlib } from '../loaders/glib.js';

/** One decoded `SOUNDS.GLB` (Amiga) effect. */
export interface Dig8Sound {
  /** Member index (0-based; no fixed per-title naming exists, see file doc comment). */
  index: number;
  clip: AudioClip;
}

export interface Dig8File {
  sounds: Dig8Sound[];
}

/**
 * True if `bytes` looks like an Amiga `SOUNDS.GLB`-style `DIG8` sound library: a GLIB container
 * whose members are raw (non-image) and tagged `DIG8`. Cheap-ish (parses the container, does not
 * decode any audio).
 */
export function sniffDig8(bytes: Uint8Array): boolean {
  if (!sniffGlib(bytes)) return false;
  try {
    const a = decodeGlib(bytes);
    return a.nonImage && a.tag === 'DIG8' && a.rawMembers.length > 0;
  } catch {
    return false;
  }
}

/**
 * Decode a `SOUNDS.GLB` `DIG8` (Amiga GLIB) sound library into its digitized effects, in member
 * order. Throws if `bytes` is not a `DIG8` GLIB library. Reuses {@link decodeDigMember} for the
 * shared 6-byte header, but passes `bits: 8` — `DIG8` is one 8-bit sample per byte, where DOS
 * `DIG4` is two 4-bit samples (see file doc comment).
 */
export function decodeGlibDig8(bytes: Uint8Array, name = 'SOUNDS.GLB'): Dig8File {
  const arc = decodeGlib(bytes, name);
  if (!arc.nonImage || arc.tag !== 'DIG8') {
    throw new Error(
      `${name}: expected a GLIB DIG8 sound library (tag=${JSON.stringify(arc.tag)}, nonImage=${arc.nonImage})`,
    );
  }
  const sounds = arc.rawMembers.map((m, i) => {
    const d = decodeDigMember(m, i, 8);
    return { index: i, clip: { ...d.clip, name: `sfx${i}` } };
  });
  return { sounds };
}
