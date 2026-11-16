/**
 * Audio decoders — IFF / 8SVX / SMUS, validated against the real CoK & DoK Amiga assets
 * when present (self-skip when the extracted Amiga tree is absent, like the font tests).
 *
 * These pin the things that matter for playback: 8SVX yields normalized PCM at the VHDR
 * rate; SMUS yields the title theme's tempo, tracks, and a decodable note stream whose
 * first pitches match the bytes we read by hand (middle-C run, then the G/E/G figure).
 */
import { describe, it, expect } from 'vitest';
import { readForm } from '../src/audio/iff.js';
import { decode8svx } from '../src/audio/svx8.js';
import { parseSmus } from '../src/audio/smus.js';

const COK_SOUND = 'amiga_extracted/ChampionsOfKrynn/disk1/Sound';

/** Read a repo file relative to the workspace root, or null if missing. */
function readAsset(rel: string): Uint8Array | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync, existsSync } = require('node:fs');
    const { resolve } = require('node:path');
    const p = resolve(__dirname, '../../..', rel);
    if (!existsSync(p)) return null;
    return new Uint8Array(readFileSync(p));
  } catch {
    return null;
  }
}

describe('IFF reader', () => {
  it('parses a FORM header and lists child chunks', () => {
    const krynn = readAsset(`${COK_SOUND}/krynn`);
    if (!krynn) return; // asset absent — skip
    const form = readForm(krynn, 0);
    expect(form.group).toBe('FORM');
    expect(form.formType).toBe('SMUS');
    const ids = form.chunks.map((c) => c.id);
    expect(ids).toContain('SHDR');
    expect(ids.filter((i) => i === 'TRAK').length).toBe(4); // 4 voices
    expect(ids.filter((i) => i === 'INS1').length).toBe(7); // in1..in7
  });
});

describe('decode8svx', () => {
  it('decodes the bundled square-wave instrument (soundData) to normalized PCM', () => {
    const bytes = readAsset(`${COK_SOUND}/soundData`);
    if (!bytes) return;
    const clip = decode8svx(bytes, 'soundData');
    expect(clip.name).toBe('square');
    expect(clip.sampleRate).toBe(1000);
    expect(clip.pcm.length).toBeGreaterThan(0);
    // Square wave: every sample sits near ±1 (full-scale), never mid-range.
    for (const s of clip.pcm) expect(Math.abs(s)).toBeGreaterThan(0.9);
  });

  it('decodes a sampled SFX (arrow) at its native rate into [-1,1]', () => {
    const bytes = readAsset(`${COK_SOUND}/arrow`);
    if (!bytes) return;
    const clip = decode8svx(bytes, 'arrow');
    expect(clip.sampleRate).toBe(10980); // VHDR samplesPerSec
    expect(clip.pcm.length).toBe(674); // oneShot length
    let min = 1;
    let max = -1;
    for (const s of clip.pcm) {
      expect(s).toBeGreaterThanOrEqual(-1);
      expect(s).toBeLessThanOrEqual(1);
      if (s < min) min = s;
      if (s > max) max = s;
    }
    expect(max).toBeGreaterThan(min); // not silence
  });
});

describe('parseSmus', () => {
  it('reads the CoK title theme tempo, tracks, and opening melody', () => {
    const bytes = readAsset(`${COK_SOUND}/krynn`);
    if (!bytes) return;
    const score = parseSmus(bytes, 'krynn');
    expect(score.tempoBPM).toBeCloseTo(120, 1); // SHDR 0x3c00 / 128 = 120.0 BPM (the /256 reading ran at half speed)
    expect(score.tracks.length).toBe(4);
    expect(score.instruments).toEqual(['in1', 'in2', 'in3', 'in4', 'in5', 'in6', 'in7']);

    // Track 0 opens with structural events then an instrument set, then a middle-C run.
    const notes = score.tracks[0]!.filter((e) => e.kind === 'note') as Array<
      Extract<(typeof score.tracks)[0][number], { kind: 'note' }>
    >;
    expect(notes.length).toBeGreaterThan(8);
    // Hand-decoded from the bytes: 3c 0b, 3c 04, 3c 03, 3c 03, 37 03, 3c 03, 40 03 …
    expect(notes[0]!.pitch).toBe(0x3c); // middle C
    // 0x0b = division 3 (eighth = 0.5 beat) + dot bit 0x08 → dotted eighth = 0.75 beats.
    expect(notes[0]!.durationBeats).toBeCloseTo(0.75, 5);
    // 0x04 = division 4 (sixteenth) = 0.25 beats; 0x03 = division 3 (eighth) = 0.5 beats.
    expect(notes[1]!.durationBeats).toBeCloseTo(0.25, 5);
    expect(notes[2]!.durationBeats).toBeCloseTo(0.5, 5);
    expect(notes[4]!.pitch).toBe(0x37); // G below
    expect(notes[6]!.pitch).toBe(0x40); // E above
  });
});

describe('durationBeats', () => {
  it('decodes SMUS note-value codes (division/dot/tuplet), not raw ticks', async () => {
    const { durationBeats } = await import('../src/audio/smus.js');
    expect(durationBeats(0x00)).toBe(4); // whole note
    expect(durationBeats(0x02)).toBe(1); // quarter note = 1 beat
    expect(durationBeats(0x03)).toBe(0.5); // eighth
    expect(durationBeats(0x0b)).toBeCloseTo(0.75, 5); // dotted eighth (0x08 dot bit)
    expect(durationBeats(0x13)).toBeCloseTo(0.5 * (2 / 3), 5); // triplet eighth (nTuplet=1)
  });
});
