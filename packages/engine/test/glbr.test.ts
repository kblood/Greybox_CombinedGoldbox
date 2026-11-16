/**
 * `GLBR` note-event body decode test — closes the last blocker keeping DOS music silent
 * for Death Knights of Krynn, Gateway to the Savage Frontier, Treasures of the Savage
 * Frontier, and Pools of Darkness (`docs/midi-dax-format.md` §2.6, `docs/glbr-format.md`).
 *
 * Verification is more than "it parses": every channel stream across all 4 titles' every
 * song must terminate cleanly at `0xFF` with no out-of-range reads, the decoded note
 * pitches must fall in a plausible melodic range (not noise), and rendering through the
 * existing OPL2 synth must produce non-trivial, envelope-varying PCM (proof the timeline
 * is audibly real, not silence or DC).
 *
 * Sources are the real GOG DOS installs (DoK is vendored in-repo; the other three are the
 * user's external GOG Galaxy installs) — absent source => SKIP, same convention as the
 * other golden suites in this package.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { readDaxDataBlocks } from '../src/loaders/dax.js';
import {
  sniffGlbr,
  decodeGlbrSong,
  renderGlbrChannel,
  glbrDurationTicks,
  decodeGlbrInstrumentBank,
  GLBR_INSTRUMENT_VOICE_COUNT,
  GLBR_PLACEHOLDER_PATCH,
} from '../src/audio/glbr.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..'); // packages/engine/test/../../.. = repo root

const TITLES: { name: string; path: string }[] = [
  { name: 'Death Knights of Krynn', path: resolve(REPO_ROOT, 'Death Knights of Krynn', 'MUSIC.DAX') },
  {
    name: 'Gateway to the Savage Frontier',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MUSIC.DAX',
  },
  {
    name: 'Treasures of the Savage Frontier',
    path: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MUSIC.DAX',
  },
  { name: 'Pools of Darkness', path: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MUSIC.DAX' },
];

function rmsChunks(pcm: Float32Array, n: number): number[] {
  const chunkSize = Math.floor(pcm.length / n) || 1;
  const out: number[] = [];
  for (let c = 0; c < n; c++) {
    const start = c * chunkSize;
    const end = c === n - 1 ? pcm.length : start + chunkSize;
    let sum = 0;
    let count = 0;
    for (let i = start; i < end && i < pcm.length; i++) {
      sum += pcm[i] * pcm[i];
      count++;
    }
    out.push(count > 0 ? Math.sqrt(sum / count) : 0);
  }
  return out;
}

describe('glbrDurationTicks — bit-field decode', () => {
  it('halves per length-class step, matching the 0x6900>>n disassembly', () => {
    const t0 = glbrDurationTicks(0, 1);
    const t1 = glbrDurationTicks(1, 1);
    expect(t0).toBeCloseTo(0x6900, 0);
    expect(t1).toBeCloseTo(0x6900 >> 1, 0);
  });

  it('dotted flag (bit 3) scales by 1.5', () => {
    const plain = glbrDurationTicks(4, 1);
    const dotted = glbrDurationTicks(4 | 0x08, 1);
    expect(dotted).toBeCloseTo(Math.floor((plain >> 1) * 3), 0);
  });

  it('tuplet selector (bits 4-5) scales by d/(d+1)', () => {
    const plain = glbrDurationTicks(4, 1);
    const triplet = glbrDurationTicks(4 | 0x10, 1);
    expect(triplet).toBeLessThan(plain);
  });

  it('divides by the per-channel tick divisor', () => {
    expect(glbrDurationTicks(4, 225)).toBeCloseTo(glbrDurationTicks(4, 1) / 225, 3);
  });
});

describe('decodeGlbrSong — cross-title real files (docs/glbr-format.md)', () => {
  for (const { name, path } of TITLES) {
    if (!existsSync(path)) {
      it.skip(`${name}: MUSIC.DAX — source missing`, () => {
        /* skipped */
      });
      continue;
    }

    it(`${name}: every GLBR song block decodes to clean, plausible note streams`, () => {
      const bytes = new Uint8Array(readFileSync(path));
      const blocks = readDaxDataBlocks(bytes);
      expect(blocks.length).toBeGreaterThan(1); // block 0 = driver, 1+ = songs

      let totalStreams = 0;
      let totalNotes = 0;
      let minNote = 127;
      let maxNote = 0;

      for (const blk of blocks) {
        if (!sniffGlbr(blk.raw)) continue; // block 0 (driver code) is not a GLBR song
        const song = decodeGlbrSong(blk.raw);
        expect(song.channels.length).toBeGreaterThan(0);

        for (const ch of song.channels) {
          totalStreams++;
          let notes = 0;
          let unknown = 0;
          for (const ev of ch.events) {
            if (ev.kind === 'note') {
              notes++;
              minNote = Math.min(minNote, ev.note);
              maxNote = Math.max(maxNote, ev.note);
              expect(ev.note).toBeGreaterThanOrEqual(0);
              expect(ev.note).toBeLessThanOrEqual(0x7f);
              expect(ev.durationTicks).toBeGreaterThan(0);
            } else if (ev.kind === 'unknown') {
              unknown++;
            }
          }
          totalNotes += notes;
          // Unknown control codes are real but rare (~2% of pairs project-wide; the
          // worst real short "stinger" stream in the whole 4-title corpus is 3/11 =
          // 27%). A stream dominated by "unknown" would indicate a mis-located offset,
          // not a legitimately-decoded one — the threshold below is set just above the
          // measured real-corpus maximum.
          if (ch.events.length > 10) {
            expect(unknown / ch.events.length).toBeLessThan(0.3);
          }
        }
      }

      expect(totalStreams).toBeGreaterThan(0);
      expect(totalNotes).toBeGreaterThan(0);
      // Plausible melodic MIDI-note range (real corpus-wide measurement: 34-92, peaking at
      // 60 = middle C) — a wildly implausible range would indicate a mis-decode.
      expect(minNote).toBeGreaterThanOrEqual(20);
      expect(maxNote).toBeLessThanOrEqual(108);
    });
  }

  // Render + audible-plausibility check against one concrete title (DoK, in-repo).
  const dokPath = resolve(REPO_ROOT, 'Death Knights of Krynn', 'MUSIC.DAX');
  if (existsSync(dokPath)) {
    it('DoK: channel 0 of song block 1 renders to non-trivial, envelope-varying PCM', () => {
      const bytes = new Uint8Array(readFileSync(dokPath));
      const blocks = readDaxDataBlocks(bytes);
      const song1 = blocks.find((b) => b.blockId === 1);
      expect(song1).toBeDefined();
      const song = decodeGlbrSong(song1!.raw);
      expect(song.channels.length).toBeGreaterThan(0);

      // Render the channel with the most notes (the primary melody), through its own decoded
      // instrument rather than the generic placeholder.
      const primary = [...song.channels].sort((a, b) => b.events.length - a.events.length)[0];
      const ownInstrument = song.instruments[primary.channelIndex];
      expect(ownInstrument).not.toBeNull(); // song block 1 is large enough that voice 0-7 are all in-bounds
      const { clip, stats } = renderGlbrChannel(primary, { song });

      expect(stats.noteCount).toBeGreaterThan(20);
      expect(stats.durationSec).toBeGreaterThan(1);
      expect(clip.pcm.length).toBeGreaterThan(0);

      // DC-centred, non-silent, and an RMS envelope that varies across the clip (real
      // note-on/off activity, not a flat tone or silence) — the same discriminator used
      // for the DIG4/DIG8 SFX golden suites.
      let sum = 0;
      for (let i = 0; i < clip.pcm.length; i++) sum += clip.pcm[i];
      expect(Math.abs(sum / clip.pcm.length)).toBeLessThan(0.05);

      const chunks = rmsChunks(clip.pcm, 16);
      const maxRms = Math.max(...chunks);
      const minRms = Math.min(...chunks);
      expect(maxRms).toBeGreaterThan(0.05);
      expect(maxRms - minRms).toBeGreaterThan(0.02); // real envelope activity, not constant
    });
  }
});

describe('decodeGlbrInstrumentBank — the OPL2 timbre bank (docs/glbr-format.md §5a)', () => {
  for (const { name, path } of TITLES) {
    if (!existsSync(path)) {
      it.skip(`${name}: instrument bank — source missing`, () => {
        /* skipped */
      });
      continue;
    }

    it(`${name}: every song's 8-voice bank decodes to structurally sane OPL2 patches`, () => {
      const bytes = new Uint8Array(readFileSync(path));
      const blocks = readDaxDataBlocks(bytes);
      let totalVoices = 0;
      let inBoundsVoices = 0;
      let voicesWithAttack = 0;
      let sameAsPlaceholder = 0;

      for (const blk of blocks) {
        if (!sniffGlbr(blk.raw)) continue;
        const song = decodeGlbrSong(blk.raw);
        expect(song.instruments.length).toBe(GLBR_INSTRUMENT_VOICE_COUNT);

        for (const patch of song.instruments) {
          totalVoices++;
          if (patch === null) continue; // out-of-bounds record -- honestly reported, not a failure
          inBoundsVoices++;

          // Structural sanity, mirroring the same heuristics used to pin DQK's INSTR.AD layout
          // (packages/engine/src/audio/opl2.ts module doc): every field is in-range by
          // construction of the bitmasks. Not every voice slot is a "live" instrument (some
          // songs leave trailing slots as an unused/silent record with both attack rates 0 --
          // real, honestly-decoded data, not an error), so attack-rate liveness is checked as a
          // corpus-wide majority below rather than per-voice.
          expect(patch.modulator).toBeDefined();
          if (patch.modulator.attackRate > 0 || patch.carrier.attackRate > 0) voicesWithAttack++;
          expect(patch.feedback).toBeGreaterThanOrEqual(0);
          expect(patch.feedback).toBeLessThanOrEqual(7);
          if (JSON.stringify(patch) === JSON.stringify(GLBR_PLACEHOLDER_PATCH)) sameAsPlaceholder++;
        }
      }

      expect(totalVoices).toBeGreaterThan(0);
      // The overwhelming majority of voices across the corpus should be real in-bounds decodes,
      // not out-of-bounds fallbacks -- a low in-bounds rate would indicate a mis-located offset.
      expect(inBoundsVoices / totalVoices).toBeGreaterThan(0.8);
      // Most voices should have a real (nonzero) attack rate on at least one operator -- the
      // corpus-wide signal that this is a bank of real, sounding instruments, not noise.
      expect(voicesWithAttack / inBoundsVoices).toBeGreaterThan(0.5);
      // A real decode should essentially never coincide byte-for-byte with the placeholder voice.
      expect(sameAsPlaceholder).toBe(0);
    });
  }

  // Cross-title reuse check: the same literal 12-byte instrument records recur across titles
  // (docs/glbr-format.md §5a) -- the signature of a shared timbre palette, not per-file noise.
  const dokPath = resolve(REPO_ROOT, 'Death Knights of Krynn', 'MUSIC.DAX');
  const gatewayPath = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MUSIC.DAX';
  if (existsSync(dokPath) && existsSync(gatewayPath)) {
    it('DoK and Gateway share at least one literal instrument record', () => {
      function allRecordKeys(path: string): Set<string> {
        const bytes = new Uint8Array(readFileSync(path));
        const blocks = readDaxDataBlocks(bytes);
        const keys = new Set<string>();
        for (const blk of blocks) {
          if (!sniffGlbr(blk.raw)) continue;
          const song = decodeGlbrSong(blk.raw);
          for (const patch of song.instruments) {
            if (patch) keys.add(JSON.stringify(patch));
          }
        }
        return keys;
      }
      const dokKeys = allRecordKeys(dokPath);
      const gwKeys = allRecordKeys(gatewayPath);
      let shared = 0;
      for (const k of dokKeys) if (gwKeys.has(k)) shared++;
      expect(shared).toBeGreaterThan(0);
    });
  }

  if (existsSync(dokPath)) {
    it('decodeGlbrInstrumentBank matches decodeGlbrSong.instruments (same function, called directly)', () => {
      const bytes = new Uint8Array(readFileSync(dokPath));
      const blocks = readDaxDataBlocks(bytes);
      const song1 = blocks.find((b) => b.blockId === 1);
      const song = decodeGlbrSong(song1!.raw);
      const direct = decodeGlbrInstrumentBank(song1!.raw, song.header);
      expect(direct).toEqual(song.instruments);
    });
  }
});
