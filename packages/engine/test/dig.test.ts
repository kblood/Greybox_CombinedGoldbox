/**
 * `SOUNDS.GLB` DIG4 digitized-SFX decoder tests (Phase C, C5b-2b-2b).
 *
 * 1) Synthetic: a hand-built HLIB DIG4 library with two members (6-byte
 *    `[u16 BE rate][u16 0][u16 BE payload length]` header + nibble-packed 4-bit samples) decodes —
 *    the big-endian rate is read back exactly, each byte yields two samples low nibble first, and
 *    member order maps onto DQK_SFX_NAMES.
 * 2) Golden (skips if data absent): real `SOUNDS.GLB` decodes to 13 centred, in-range effects whose
 *    header rates fall on the three known buckets (≈7418 / ≈11127 / ≈5564 Hz), with the two
 *    high-rate members at indices 3 & 6 (die, lightning) and the low-rate one at index 9 (fireball);
 *    and several members cross-correlate (by waveform shape) with the already-verified SFXDQ.VOC
 *    effect of the same id — proof the member ORDER is right.
 * 3) The codec discriminator (2026-08-21). The shape correlation in (2) is scale- and
 *    length-normalised, so it scores a 4-bit and an 8-bit reading of the same bytes almost
 *    identically (0.680 vs 0.684) — it could never have caught the header/codec error this file
 *    used to encode, and did not. The test that CAN fail is lag-1 autocorrelation against the
 *    independently-verified `SFXDQ.VOC` bank as a positive control; see the last describe block.
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeSoundsGlb, sniffDig, decodeDigMember, decodeVoc, DQK_SFX_NAMES } from '../src/index.js';

/** Build a minimal HLIB non-image library: "HLIB" magic + directory + the given member byte arrays. */
function buildHlib(tag: string, members: number[][]): Uint8Array {
  // Layout mirrors loaders/hlib.ts readHeader: "HLIB"(4), u32 fsize, u16 (count-1) @8, magic @11,
  // 4-char tag @12, then `count` u32 offsets @16 — `count` = members+1 (member starts + EOF ptr).
  const n = members.length;
  const headerLen = 16 + (n + 1) * 4; // magic..tag(16) + (n+1) pointers
  let total = headerLen;
  const starts: number[] = [];
  for (const m of members) {
    starts.push(total);
    total += m.length;
  }
  const buf = new Uint8Array(total);
  const dv = new DataView(buf.buffer);
  for (let i = 0; i < 4; i++) buf[i] = 'HLIB'.charCodeAt(i);
  dv.setUint32(4, total, true); // fsize
  dv.setUint16(8, n, true); // stored count-1; readHeader adds 1 → n+1 pointers
  for (let i = 0; i < 4; i++) buf[12 + i] = tag.charCodeAt(i);
  let o = 16;
  for (const s of starts) {
    dv.setUint32(o, s, true);
    o += 4;
  }
  dv.setUint32(o, total, true); // sentinel EOF pointer
  for (let i = 0; i < members.length; i++) {
    buf.set(members[i], starts[i]);
  }
  return buf;
}

/**
 * A sound-library member: 6-byte `[u16 BE rate][u16 0][u16 BE payload length]` header + payload.
 * `payload` is raw bytes — for `DIG4` each byte is two 4-bit samples, low nibble first.
 */
function digMember(rate: number, payload: number[]): number[] {
  const n = payload.length;
  return [(rate >> 8) & 0xff, rate & 0xff, 0, 0, (n >> 8) & 0xff, n & 0xff, ...payload];
}

describe('decodeSoundsGlb — synthetic DIG4 library', () => {
  it('reads the BE rate and unpacks two 4-bit samples per byte, low nibble first', () => {
    const lib = buildHlib('DIG4', [
      digMember(7418, [0x80, 0xff, 0x00, 0x4c]),
      digMember(11127, [0x88, 0xc0]),
    ]);
    expect(sniffDig(lib)).toBe(true);
    const f = decodeSoundsGlb(lib);
    expect(f.sounds).toHaveLength(2);

    const a = f.sounds[0];
    expect(a.index).toBe(0);
    expect(a.clip.name).toBe(DQK_SFX_NAMES[0]); // 'cast'
    expect(a.clip.sampleRate).toBe(7418);
    // 4 payload bytes -> 8 samples. Low nibble first, centre 8: (n - 8) / 8.
    // 0x80 -> lo 0 = -1, hi 8 = 0; 0xff -> 15, 15 = +7/8 twice;
    // 0x00 -> -1, -1;      0x4c -> lo 12 = +0.5, hi 4 = -0.5.
    expect([...a.clip.pcm]).toHaveLength(8);
    expect(a.clip.pcm[0]).toBeCloseTo(-1, 6);
    expect(a.clip.pcm[1]).toBeCloseTo(0, 6);
    expect(a.clip.pcm[2]).toBeCloseTo(7 / 8, 6);
    expect(a.clip.pcm[3]).toBeCloseTo(7 / 8, 6);
    expect(a.clip.pcm[4]).toBeCloseTo(-1, 6);
    expect(a.clip.pcm[6]).toBeCloseTo(0.5, 6);
    expect(a.clip.pcm[7]).toBeCloseTo(-0.5, 6);

    expect(f.sounds[1].clip.sampleRate).toBe(11127);
    expect(f.sounds[1].clip.name).toBe(DQK_SFX_NAMES[1]); // 'flame'
  });

  it('honours the declared payload length, dropping the even-alignment pad byte', () => {
    // Declared length 3 with 4 bytes present: the trailing pad must not become two samples.
    const m = [0x1c, 0xfa, 0, 0, 0x00, 0x03, 0x80, 0x90, 0xa0, 0x00];
    const s = decodeDigMember(new Uint8Array(m), 0, 4);
    expect(s.clip.pcm).toHaveLength(6);
  });

  it('bits: 8 reads one byte per sample, the way Amiga DIG8 members are stored', () => {
    const s = decodeDigMember(new Uint8Array(digMember(7418, [0x80, 0xff, 0x00, 0x40])), 0, 8);
    expect([...s.clip.pcm]).toHaveLength(4);
    expect(s.clip.pcm[0]).toBeCloseTo(0, 6);
    expect(s.clip.pcm[1]).toBeCloseTo(127 / 128, 6);
    expect(s.clip.pcm[2]).toBeCloseTo(-1, 6);
    expect(s.clip.pcm[3]).toBeCloseTo(-0.5, 6);
  });

  it('decodeDigMember handles a lone member and rejects too-short input', () => {
    const s = decodeDigMember(new Uint8Array(digMember(5564, [0x80, 0x90])), 9);
    expect(s.clip.sampleRate).toBe(5564);
    expect(s.clip.name).toBe('fireball');
    expect(() => decodeDigMember(new Uint8Array([1, 2]), 0)).toThrow();
  });

  it('sniffDig rejects non-DIG4 HLIB and garbage', () => {
    expect(sniffDig(buildHlib('DATA', [[1, 2, 3, 4, 5]]))).toBe(false);
    expect(sniffDig(new Uint8Array([0, 1, 2, 3]))).toBe(false);
  });
});

// --- Golden: real DQK SOUNDS.GLB, cross-checked vs SFXDQ.VOC (skips if data absent) ----------

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const disk1 = resolve(repoRoot, 'The Dark Queen of Krynn', 'DISK1');
const soundsPath = resolve(disk1, 'SOUNDS.GLB');
const vocPath = resolve(disk1, 'SFXDQ.VOC');
const haveGolden = existsSync(soundsPath) && existsSync(vocPath);

/** Zero-mean, length-normalized, unit-norm waveform shape (resampled to N buckets) for correlation. */
function shape(pcm: Float32Array, N = 400): Float32Array {
  const f = new Float32Array(N);
  const w = pcm.length / N;
  for (let i = 0; i < N; i++) {
    let s = 0;
    let c = 0;
    const end = Math.max(Math.floor(i * w) + 1, Math.floor((i + 1) * w));
    for (let j = Math.floor(i * w); j < end; j++) {
      s += pcm[j];
      c++;
    }
    f[i] = c ? s / c : 0;
  }
  let mu = 0;
  for (const v of f) mu += v;
  mu /= N;
  let norm = 0;
  for (let i = 0; i < N; i++) {
    f[i] -= mu;
    norm += f[i] * f[i];
  }
  norm = Math.sqrt(norm);
  if (norm) for (let i = 0; i < N; i++) f[i] /= norm;
  return f;
}

function corr(a: Float32Array, b: Float32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d;
}

describe('decodeSoundsGlb — golden DQK SOUNDS.GLB', () => {
  it.skipIf(!haveGolden)('decodes 13 centred effects with the three known rate buckets', async () => {
    const f = decodeSoundsGlb(new Uint8Array(await readFile(soundsPath)));
    expect(f.sounds).toHaveLength(13);
    expect(f.sounds.map((s) => s.clip.name)).toEqual([...DQK_SFX_NAMES]);

    for (const s of f.sounds) {
      expect(s.clip.pcm.length).toBeGreaterThan(64);
      let sum = 0;
      let peak = 0;
      for (const v of s.clip.pcm) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
        sum += v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      // 8-bit unsigned centred on 0x80 → |mean| stays small; not silence.
      expect(Math.abs(sum / s.clip.pcm.length)).toBeLessThan(0.25);
      expect(peak).toBeGreaterThan(0.1);
      // Rate lands on one of the three observed DQK buckets.
      const r = s.clip.sampleRate;
      const onBucket =
        Math.abs(r - 7418) < 40 || Math.abs(r - 11127) < 40 || Math.abs(r - 5564) < 40;
      expect(onBucket).toBe(true);
    }

    // The high-rate members are die(3) & lightning(6); the low-rate one is fireball(9).
    expect(f.sounds[3].clip.sampleRate).toBeGreaterThan(10000);
    expect(f.sounds[6].clip.sampleRate).toBeGreaterThan(10000);
    expect(f.sounds[9].clip.sampleRate).toBeLessThan(6000);
  });

  it.skipIf(!haveGolden)('several members match the same-id SFXDQ.VOC effect by waveform shape', async () => {
    const dig = decodeSoundsGlb(new Uint8Array(await readFile(soundsPath)));
    const voc = decodeVoc(new Uint8Array(await readFile(vocPath)));
    const vShape = voc.sounds.map((s) => shape(s.clip.pcm));

    // Distinctive (non-noise) effects must correlate best with their *own* id, strongly.
    const strong = [
      { id: 6, name: 'lightning', min: 0.8 },
      { id: 1, name: 'flame', min: 0.6 },
      { id: 8, name: 'walk', min: 0.6 },
      { id: 3, name: 'die', min: 0.6 },
      { id: 12, name: 'crackle', min: 0.6 },
    ];
    for (const { id, min } of strong) {
      const ds = shape(dig.sounds[id].clip.pcm);
      const scored = vShape
        .map((v, j) => ({ j, c: corr(ds, v) }))
        .sort((p, q) => q.c - p.c);
      // Best-matching VOC effect is the same id, above the threshold.
      expect(scored[0].j).toBe(id);
      expect(scored[0].c).toBeGreaterThan(min);
    }
  });
});

// --- The codec discriminator: lag-1 autocorrelation vs the SFXDQ.VOC control ------------------

/**
 * Lag-1 autocorrelation. Real audio is smooth sample to sample, so this is high. Reading
 * nibble-packed data as whole bytes interleaves two independent streams and destroys that
 * continuity, so this collapses — and on some effects goes negative, which a real waveform at
 * these rates does not do.
 */
function lag1(pcm: Float32Array): number {
  let mean = 0;
  for (const v of pcm) mean += v;
  mean /= pcm.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < pcm.length - 1; i++) num += (pcm[i] - mean) * (pcm[i + 1] - mean);
  for (let i = 0; i < pcm.length; i++) den += (pcm[i] - mean) * (pcm[i] - mean);
  return num / (den || 1);
}

describe('SOUNDS.GLB DIG4 — the 6-byte header and the 4-bit codec (2026-08-21)', () => {
  it.skipIf(!haveGolden)('every member declares its own payload length at header offset 4', async () => {
    const { decodeHlib } = await import('../src/index.js');
    const arc = decodeHlib(new Uint8Array(await readFile(soundsPath)), 'SOUNDS.GLB');
    expect(arc.rawMembers).toHaveLength(13);

    // The word at 4 equals member.length - 6, or - 7 where an odd payload is padded up to even.
    let exact = 0;
    for (const m of arc.rawMembers) {
      const declared = (m[4] << 8) | m[5];
      if (declared === m.length - 6 || declared === m.length - 7) exact++;
    }
    expect(exact).toBe(13);

    // The null. Without it, 13 of 13 is just "a plausible-looking number sits there": count how
    // often an ARBITRARY u16be window elsewhere in the same members lands in {L-6, L-7}.
    let nullHits = 0;
    let nullTotal = 0;
    for (const m of arc.rawMembers) {
      for (let off = 6; off + 1 < Math.min(m.length, 200); off++) {
        const v = (m[off] << 8) | m[off + 1];
        nullTotal++;
        if (v === m.length - 6 || v === m.length - 7) nullHits++;
      }
    }
    expect(nullTotal).toBeGreaterThan(2000);
    expect(nullHits).toBe(0);
  });

  it.skipIf(!haveGolden)('the 4-bit reading tracks the VOC control; the 8-bit reading does not', async () => {
    const { decodeHlib } = await import('../src/index.js');
    const arc = decodeHlib(new Uint8Array(await readFile(soundsPath)), 'SOUNDS.GLB');
    const voc = decodeVoc(new Uint8Array(await readFile(vocPath)));

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    // Positive control: SFXDQ.VOC is decoded by an independent, already-verified decoder.
    const control = mean(voc.sounds.map((s) => lag1(s.clip.pcm)));
    // What the shipped decoder produces now (4-bit), and what it produced before (8-bit).
    const asFour = mean(arc.rawMembers.map((m, i) => lag1(decodeDigMember(m, i, 4).clip.pcm)));
    const asEight = mean(arc.rawMembers.map((m, i) => lag1(decodeDigMember(m, i, 8).clip.pcm)));

    // Measured 2026-08-21: control 0.742, 4-bit 0.754, 8-bit 0.434.
    expect(control).toBeGreaterThan(0.7);
    expect(asFour).toBeGreaterThan(0.7);
    expect(Math.abs(asFour - control)).toBeLessThan(0.1);
    // The discriminating assertion — this is the one that fails if the codec regresses.
    expect(asEight).toBeLessThan(0.55);
    expect(asFour - asEight).toBeGreaterThan(0.25);
  });

  it.skipIf(!haveGolden)('at 4 bits the effect lengths match their VOC twins; at 8 they are half', async () => {
    const dig = decodeSoundsGlb(new Uint8Array(await readFile(soundsPath)));
    const voc = decodeVoc(new Uint8Array(await readFile(vocPath)));
    // The three effects whose DIG4 and VOC encodings cover the same span, to within one sample.
    for (const id of [5, 6, 12]) {
      const ratio = dig.sounds[id].clip.pcm.length / voc.sounds[id].clip.pcm.length;
      expect(Math.abs(ratio - 1), DQK_SFX_NAMES[id]).toBeLessThan(0.005);
    }
    // No effect can decode to MORE than its VOC twin by any real margin — that ceiling is what
    // rules out reading two samples per byte from a bank that is really one.
    for (let i = 0; i < 13; i++) {
      expect(dig.sounds[i].clip.pcm.length / voc.sounds[i].clip.pcm.length).toBeLessThan(1.1);
    }
  });
});
