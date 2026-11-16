/**
 * Creative Voice File (`.VOC`) decoder tests (Phase C, C5b-1).
 *
 * 1) Synthetic: a hand-built VOC (magic + header + marker + an 8-bit-PCM sound + a Creative-ADPCM
 *    sound) round-trips — markers attach to the following sound, the rate comes from the divisor,
 *    codec 0 normalizes 8-bit PCM, codec 1 expands ADPCM to `1 + 2*(n-1)` samples.
 * 2) Golden (skips if data absent): real `SFXDQ.VOC` decodes to the 13 named DQK effects (markers
 *    0..12 = cast…crackle), each centred (|mean| small — the hardware Creative ADPCM is symmetric,
 *    unlike the railing SBPRO model) with a believable rate.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeVoc, sniffVoc, DQK_SFX_NAMES } from '../src/index.js';

/** Build a minimal `.VOC`: magic + 26-byte header, then the given block bytes + a terminator. */
function buildVoc(...blocks: number[][]): Uint8Array {
  const magic = [...'Creative Voice File\x1a'].map((c) => c.charCodeAt(0));
  const header = [...magic, 0x1a, 0x00, 0x0a, 0x01, 0x29, 0x11]; // headerSize=0x1a, ver 1.10, checksum
  const body = blocks.flat();
  return Uint8Array.from([...header, ...body, 0x00]); // type-0 terminator
}
/** A VOC block: type + 24-bit LE length + data. */
function block(type: number, data: number[]): number[] {
  return [type, data.length & 0xff, (data.length >> 8) & 0xff, (data.length >> 16) & 0xff, ...data];
}

describe('decodeVoc — synthetic Creative Voice File', () => {
  it('sniffs the magic', () => {
    expect(sniffVoc(buildVoc())).toBe(true);
    expect(sniffVoc(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toBe(false);
  });

  it('decodes markers + 8-bit PCM (codec 0) at the divisor rate', () => {
    // divisor 121 → rate 1_000_000/135 ≈ 7407; payload 0x80,0xC0,0x40 = silence, +half, −half.
    const voc = buildVoc(
      block(4, [3, 0]), // marker 3 → 'die'
      block(1, [121, 0, 0x80, 0xc0, 0x40]),
    );
    const f = decodeVoc(voc);
    expect(f.sounds).toHaveLength(1);
    const s = f.sounds[0];
    expect(s.marker).toBe(3);
    expect(s.clip.name).toBe('die');
    expect(s.clip.sampleRate).toBe(7407);
    expect(Array.from(s.clip.pcm)).toEqual([0, 0.5, -0.5]);
  });

  it('expands codec-1 Creative ADPCM to 1 + 2*(n-1) samples, first = reference', () => {
    // payload: reference 0x80 (silence) + two ADPCM bytes → 1 + 2*2 = 5 samples.
    const voc = buildVoc(block(1, [121, 1, 0x80, 0x00, 0x11]));
    const f = decodeVoc(voc);
    const s = f.sounds[0];
    expect(s.marker).toBe(-1);
    expect(s.clip.pcm).toHaveLength(5);
    expect(s.clip.pcm[0]).toBe(0); // reference 0x80 → silence
    // nibble 0 leaves the reference unchanged (scaleMap[0] = 0); the decode stays finite + in-range.
    expect(s.clip.pcm[1]).toBe(0);
    expect(s.clip.pcm.every((v) => v >= -1 && v <= 1)).toBe(true);
  });
});

// --- Golden: real DQK SFXDQ.VOC (skips if data absent) -----------------------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const vocPath = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK1', 'SFXDQ.VOC');

describe('decodeVoc — golden DQK SFXDQ.VOC', () => {
  it.skipIf(!existsSync(vocPath))('decodes the 13 named effects, each centred + in-range', async () => {
    const f = decodeVoc(new Uint8Array(await readFile(vocPath)));
    expect(f.sounds).toHaveLength(13);
    // Markers run 0..12 and resolve to the documented names.
    expect(f.sounds.map((s) => s.marker)).toEqual([...Array(13).keys()]);
    expect(f.sounds.map((s) => s.clip.name)).toEqual([...DQK_SFX_NAMES]);

    for (const s of f.sounds) {
      expect(s.clip.pcm.length).toBeGreaterThan(64);
      expect(s.clip.sampleRate).toBeGreaterThan(4000);
      let sum = 0;
      let peak = 0;
      for (const v of s.clip.pcm) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
        sum += v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      // Centred (no DC runaway): |mean| stays tiny vs. the peak — the symmetric ADPCM decode.
      expect(Math.abs(sum / s.clip.pcm.length)).toBeLessThan(0.05);
      expect(peak).toBeGreaterThan(0.05); // not silence
    }
  });
});
