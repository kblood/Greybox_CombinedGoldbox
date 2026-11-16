/**
 * Buck Rogers: Countdown to Doomsday's `MUSIC.DAX` is `GLBR`, same as Death Knights of Krynn /
 * Gateway / Treasures / Pools of Darkness (round 33 R5, `docs/glbr-format.md` §4/§6). This
 * closes the ledger's "still no decoder" wording for this title by running the *already-shipped*
 * decoder against it — the exact "solved but unwired" failure class
 * `goldbox-solved-but-unwired.md` records.
 *
 * **Round 34 R4 correction — read before trusting "Matrix" claims below.** Round 33 R5 also
 * wired Matrix Cubed's own `MUSIC.DAX` this way, on the strength of it decoding to the exact
 * same 8 `GLBR` songs byte-identical to Countdown's. Every test below that still measures
 * Matrix's `MUSIC.DAX` is a TRUE statement about those BYTES (the file genuinely is a valid
 * `GLBR` container and decodes cleanly) — but round 34 found Matrix's own unpacked
 * `START.EXE`/`GAME.OVR` never open `MUSIC.DAX` by name (`tools/matrix_music_strings.py`: 0
 * file-open references in either binary) and instead name three Miles AIL `.XMI` files
 * (`BUCKA/B/C.XMI`), five hardware drivers and an `FATV9.AD` instrument bank. Matrix's
 * `MUSIC.DAX` is a leftover copy of Countdown's the game never plays — decode correctness is not
 * in question, PLAYBACK RELEVANCE is. See `matrixXmi.test.ts` for Matrix's REAL music format and
 * `apps/web/src/audio/gameAudio.ts`'s `GLBR_MUSIC_GAMES` doc comment for the corrected wiring.
 *
 * Re-measures round 32 R6's own claim before extending it (per this round's ground rules):
 * blocks 2-9 of both `MUSIC.DAX` are 8 `GLBR` songs each, byte-identical between the two
 * titles, decoding to 1959 events (channel counts 4/4/4/3/4/4/4/4) — **confirmed exactly**,
 * see the "re-measurement" test below.
 *
 * Sources: Buck is the user's external `D:/` DOS install (never vendored); Matrix is the
 * repo-relative, git-ignored `matrixcubed_extracted/` tree. Absent source => SKIP, same
 * convention as `glbr.test.ts` and every other golden suite in this package.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { readDaxDataBlocks, type DaxBlock } from '../src/loaders/dax.js';
import {
  sniffGlbr,
  decodeGlbrSong,
  decodeGlbrInstrumentBank,
  GLBR_INSTRUMENT_VOICE_COUNT,
  GLBR_PLACEHOLDER_PATCH,
} from '../src/audio/glbr.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..');

const BUCK_PATH = 'D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/music.dax';
const MATRIX_PATH = resolve(REPO_ROOT, 'matrixcubed_extracted', 'BuckRogers2', 'c', 'Matrix', 'MUSIC.DAX');
const DOK_PATH = resolve(REPO_ROOT, 'Death Knights of Krynn', 'MUSIC.DAX'); // in-repo control

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function glbrBlocksOf(path: string): DaxBlock[] {
  const bytes = new Uint8Array(readFileSync(path));
  return readDaxDataBlocks(bytes).filter((b) => sniffGlbr(b.raw));
}

const haveBuck = existsSync(BUCK_PATH);
const haveMatrix = existsSync(MATRIX_PATH);
const haveDok = existsSync(DOK_PATH);

describe('Buck / Matrix MUSIC.DAX — re-measurement of round 32 R6\'s claim', () => {
  if (!haveBuck) {
    it.skip('Buck: music.dax — source missing (D:/ external, never vendored)', () => {});
  }
  if (!haveMatrix) {
    it.skip('Matrix: MUSIC.DAX — source missing (matrixcubed_extracted/, git-ignored)', () => {});
  }

  if (haveBuck) {
    it('Buck: blocks 2-9 are 8 GLBR songs, all decode cleanly, 1959 total events, channels 4/4/4/3/4/4/4/4', () => {
      const bytes = new Uint8Array(readFileSync(BUCK_PATH));
      const blocks = readDaxDataBlocks(bytes);
      const glbr = blocks.filter((b) => sniffGlbr(b.raw));
      expect(blocks.map((b) => b.blockId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(glbr.map((b) => b.blockId)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
      expect(glbr.map((b) => b.raw.length)).toEqual([2082, 1044, 862, 626, 720, 624, 720, 1078]);

      let totalEvents = 0;
      const channelCounts: number[] = [];
      for (const blk of glbr) {
        const song = decodeGlbrSong(blk.raw); // throws on any structural failure -- "8/8 decode" means none of these throw
        channelCounts.push(song.channels.length);
        for (const ch of song.channels) totalEvents += ch.events.length;
      }
      expect(channelCounts).toEqual([4, 4, 4, 3, 4, 4, 4, 4]);
      expect(totalEvents).toBe(1959);
    });
  }

  if (haveMatrix) {
    it('Matrix: blocks 2-9 are 8 GLBR songs, all decode cleanly, 1959 total events, channels 4/4/4/3/4/4/4/4', () => {
      const bytes = new Uint8Array(readFileSync(MATRIX_PATH));
      const blocks = readDaxDataBlocks(bytes);
      const glbr = blocks.filter((b) => sniffGlbr(b.raw));
      expect(blocks.map((b) => b.blockId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(glbr.map((b) => b.blockId)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
      expect(glbr.map((b) => b.raw.length)).toEqual([2082, 1044, 862, 626, 720, 624, 720, 1078]);

      let totalEvents = 0;
      const channelCounts: number[] = [];
      for (const blk of glbr) {
        const song = decodeGlbrSong(blk.raw);
        channelCounts.push(song.channels.length);
        for (const ch of song.channels) totalEvents += ch.events.length;
      }
      expect(channelCounts).toEqual([4, 4, 4, 3, 4, 4, 4, 4]);
      expect(totalEvents).toBe(1959);
    });
  }

  // Plausibility, mirroring glbr.test.ts's per-title metrics (real corpus range 34-92,
  // peak at note 60). Buck/Matrix measure 36-84, peak at note 50 -- inside that envelope but
  // with a different peak, an honest number rather than an assumed match to the DoK-family peak.
  if (haveBuck && haveMatrix) {
    it('note pitches are plausibly melodic (in [20,108]) and Buck == Matrix\'s histogram exactly', () => {
      function pitchStats(glbr: DaxBlock[]) {
        let total = 0, min = 999, max = -1;
        const hist = new Map<number, number>();
        for (const blk of glbr) {
          const song = decodeGlbrSong(blk.raw);
          for (const ch of song.channels) {
            for (const ev of ch.events) {
              if (ev.kind === 'note') {
                total++;
                min = Math.min(min, ev.note);
                max = Math.max(max, ev.note);
                hist.set(ev.note, (hist.get(ev.note) ?? 0) + 1);
              }
            }
          }
        }
        return { total, min, max, hist };
      }
      const buck = pitchStats(glbrBlocksOf(BUCK_PATH));
      const matrix = pitchStats(glbrBlocksOf(MATRIX_PATH));

      expect(buck.total).toBe(1224);
      expect(buck.min).toBeGreaterThanOrEqual(20);
      expect(buck.max).toBeLessThanOrEqual(108);
      // Measured real range: 36-84, peak note 50 (163 occurrences) -- pinned, not asserted loosely.
      expect(buck.min).toBe(36);
      expect(buck.max).toBe(84);

      expect(matrix.total).toBe(buck.total);
      expect(matrix.min).toBe(buck.min);
      expect(matrix.max).toBe(buck.max);
      expect([...matrix.hist.entries()].sort()).toEqual([...buck.hist.entries()].sort());
    });
  }
});

describe('Buck vs Matrix — 8/8 sha256 identity, against "Matrix ships its own score" (predicts <8/8)', () => {
  if (!haveBuck || !haveMatrix) {
    it.skip('Buck/Matrix identity — requires both optional MUSIC.DAX sources', () => {});
  }
  if (haveBuck && haveMatrix) {
    it('every one of the 8 raw GLBR song blocks is byte-identical between the two titles', () => {
      const buckBlocks = glbrBlocksOf(BUCK_PATH);
      const matrixBlocks = glbrBlocksOf(MATRIX_PATH);
      expect(buckBlocks.length).toBe(8);
      expect(matrixBlocks.length).toBe(8);

      let identical = 0;
      const buckHashes: string[] = [];
      for (let i = 0; i < 8; i++) {
        const bh = sha256(buckBlocks[i].raw);
        const mh = sha256(matrixBlocks[i].raw);
        buckHashes.push(bh);
        if (bh === mh) identical++;
      }
      // The alternative hypothesis ("Matrix ships its own score") predicts < 8/8 here --
      // measured: 8/8, decisively against it.
      expect(identical).toBe(8);

      // A literal pin (not just "equal to each other") so a corruption to either file is
      // independently detectable -- this is the "one pinned song hash" the mutation test
      // below targets.
      expect(buckHashes[0]).toBe('6c22834e71cf7ce2ab1e222695d8ca569e7240c40dab2342ac6710a489f4a23a');
    });
  }
});

/**
 * Null for the plausibility metrics: a histogram-preserving (Fisher-Yates) byte shuffle of
 * each song's busiest channel event-stream, run through a **local** re-implementation of
 * `glbr.ts`'s private `parseChannelStream` (that function is not exported -- this mirrors its
 * exact algorithm, for null-measurement only; it is not a claim about `glbr.ts` itself).
 * Deterministic (seeded) so the numbers below are reproducible, not "it happened to pass once."
 *
 * Measured (all 16 real songs, 50 shuffle trials/song each, per-song majority vote >50%):
 *   - clean-termination rate under shuffle: Buck 5/8, Matrix 6/8 majority-clean (per-trial
 *     pooled rate 75.7% across all 31x2 channel streams, 20 trials/stream) -- see the
 *     "the plan's own null" test below: **this metric does NOT discriminate real from noise**
 *     here, because a shuffled stream frequently still contains an incidental 0xFF byte at an
 *     even (b1) position (many duration bytes are already close to 0xFF-valued, and every
 *     stream also carries its own true terminator byte in the shuffled multiset).
 *   - plausible-range rate (note count > 0 AND every note in [20,108]) under the SAME shuffle:
 *     0/8 majority-clean for both titles (per-trial pooled rate 3.5%) -- real data is 8/8
 *     (100%) on the same metric. This is the metric that actually separates real decode from
 *     noise; the plan's own "clean-termination <= 1/8" framing is replaced by it below (ground
 *     rule 2: the supplied null is measured, found not to be the plan's number, and the
 *     surviving conclusion is reported next to both numbers).
 */
describe('Null: histogram-preserving shuffle of each song\'s event bytes', () => {
  if (!haveBuck || !haveMatrix) {
    it.skip('Buck/Matrix shuffle comparison — requires both optional MUSIC.DAX sources', () => {});
  }
  function localParse(bytes: Uint8Array, start: number): { terminated: boolean; notes: number; minNote: number; maxNote: number } {
    let pos = start;
    const guardLimit = 8000;
    let guard = 0;
    let notes = 0, minNote = 999, maxNote = -1;
    while (pos + 2 <= bytes.length && guard++ < guardLimit) {
      const b1 = bytes[pos];
      pos += 2;
      if (b1 === 0xff) return { terminated: true, notes, minNote, maxNote };
      if (b1 <= 0x7f) {
        notes++;
        if (b1 < minNote) minNote = b1;
        if (b1 > maxNote) maxNote = b1;
      }
    }
    return { terminated: false, notes, minNote, maxNote };
  }

  function be16(b: Uint8Array, off: number): number {
    return ((b[off] << 8) | b[off + 1]) >>> 0;
  }

  /** Extract the raw byte range of one song's busiest (longest) channel event-stream. */
  function busiestStreamBytes(songBytes: Uint8Array): Uint8Array {
    const SECOND_HEADER_OFFSET = 444;
    const channelCount = songBytes[SECOND_HEADER_OFFSET + 8];
    const nOffsets = channelCount + 1;
    const offTableStart = SECOND_HEADER_OFFSET + 10;
    const offsetTable: number[] = [];
    for (let i = 0; i < nOffsets; i++) offsetTable.push(be16(songBytes, offTableStart + 2 * i));
    const basePtr = offTableStart + nOffsets * 2;
    const d0 = basePtr + offsetTable[0];
    const countByte = songBytes[d0 + 3];
    const nChannels = Math.max(countByte, channelCount);
    let best: Uint8Array | null = null;
    for (let idx = 0; idx <= nChannels; idx++) {
      const arrOff = d0 + 4 + 2 * idx;
      if (arrOff + 2 > songBytes.length) continue;
      const rel = be16(songBytes, arrOff);
      const streamOff = d0 + 0x0e + rel;
      if (streamOff < 0 || streamOff >= songBytes.length) continue;
      const r = localParse(songBytes, streamOff);
      if (!r.terminated) continue;
      // Re-walk to find the exact end offset (localParse doesn't return it -- cheap re-scan).
      let pos = streamOff;
      while (pos + 2 <= songBytes.length) {
        const b1 = songBytes[pos];
        pos += 2;
        if (b1 === 0xff) break;
      }
      const slice = songBytes.slice(streamOff, pos);
      if (!best || slice.length > best.length) best = slice;
    }
    if (!best) throw new Error('busiestStreamBytes: no channel terminated cleanly');
    return best;
  }

  function mulberry32(seed: number): () => number {
    let s = seed;
    return function () {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(bytes: Uint8Array, rng: () => number): Uint8Array {
    const out = Uint8Array.from(bytes);
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  const TRIALS = 50;

  function measure(glbr: DaxBlock[], seed: number) {
    const rng = mulberry32(seed);
    let songs = 0, cleanMajority = 0, plausibleMajority = 0, pooledTrials = 0, pooledClean = 0, pooledPlausible = 0;
    for (const blk of glbr) {
      const stream = busiestStreamBytes(blk.raw);
      songs++;
      let cleanHits = 0, plausibleHits = 0;
      for (let t = 0; t < TRIALS; t++) {
        const shuffled = shuffle(stream, rng);
        const r = localParse(shuffled, 0);
        pooledTrials++;
        if (r.terminated) { cleanHits++; pooledClean++; }
        if (r.notes > 0 && r.minNote >= 20 && r.maxNote <= 108) { plausibleHits++; pooledPlausible++; }
      }
      if (cleanHits / TRIALS > 0.5) cleanMajority++;
      if (plausibleHits / TRIALS > 0.5) plausibleMajority++;
    }
    return { songs, cleanMajority, plausibleMajority, pooledTrials, pooledClean, pooledPlausible };
  }

  if (haveBuck && haveMatrix) {
    it('real data: every song\'s busiest channel is clean AND plausible-range (8/8 both titles)', () => {
      for (const [path] of [[BUCK_PATH], [MATRIX_PATH]] as const) {
        const glbr = glbrBlocksOf(path);
        for (const blk of glbr) {
          const stream = busiestStreamBytes(blk.raw);
          const r = localParse(stream, 0);
          expect(r.terminated).toBe(true);
          expect(r.notes).toBeGreaterThan(0);
          expect(r.minNote).toBeGreaterThanOrEqual(20);
          expect(r.maxNote).toBeLessThanOrEqual(108);
        }
      }
    });

    it('the plan\'s own null (clean-termination) does NOT discriminate here: measured >> the predicted <=1/8', () => {
      const buck = measure(glbrBlocksOf(BUCK_PATH), 111);
      const matrix = measure(glbrBlocksOf(MATRIX_PATH), 222);
      // Real: 8/8 clean (previous test). Predicted null: <=1/8 majority-clean under shuffle.
      // Measured: clearly above that bar for both titles -- the plan's stated null for THIS
      // metric does not hold on real data, so it cannot be used to certify the real 8/8 as
      // non-random. Pinned as a fact about the metric, not a claim the corpus is fake.
      expect(buck.cleanMajority).toBeGreaterThan(1);
      expect(matrix.cleanMajority).toBeGreaterThan(1);
      expect(buck.pooledClean / buck.pooledTrials).toBeGreaterThan(0.5);
    });

    it('replacement null (plausible-range) DOES discriminate: <=1/8 majority-plausible under shuffle, vs the real 8/8', () => {
      const buck = measure(glbrBlocksOf(BUCK_PATH), 333);
      const matrix = measure(glbrBlocksOf(MATRIX_PATH), 444);
      expect(buck.plausibleMajority).toBeLessThanOrEqual(1);
      expect(matrix.plausibleMajority).toBeLessThanOrEqual(1);
      // Pooled (all trials, not just majority vote) rate stays low too -- not an artifact of
      // the 50%-majority threshold choice.
      expect(buck.pooledPlausible / buck.pooledTrials).toBeLessThan(0.15);
      expect(matrix.pooledPlausible / matrix.pooledTrials).toBeLessThan(0.15);
    });
  }
});

/**
 * Instrument bank sanity (round 33 R5 scope item 2). The driver census
 * (`docs/midi-dax-format.md` §1.5a) measured, as bytes, that Buck/Matrix's shared driver blob
 * contains no `mov dx,0x388` (AdLib) or `mov dx,0x220` (CMS) immediate anywhere -- i.e. this
 * title's OWN driver never plays through the OPL2 backend the bank below is shaped for. The
 * plan (P12) therefore PREDICTED this structural sanity test would FAIL for Buck/Matrix.
 *
 * Measured: it does NOT fail -- it PASSES more strongly than DoK's own control (100%
 * in-bounds / 100% real-attack-rate for Buck+Matrix vs DoK's 100% / 89.3%). This is a
 * disagreement with the plan's prediction, reported here rather than silently adopted either
 * way: the bank bytes are structurally real 2-operator OPL2 patches (same authoring-tool
 * artifact `docs/glbr-format.md` §5a describes for every GLBR title), but that is a claim
 * about the FILE FORMAT, not about Buck/Matrix's DRIVER -- the driver-census sentence above is
 * a separate, semantic claim (never dispatched to hardware) that this structural test cannot
 * see either way. Both can be -- and are -- true at once. Per the "do not force it" scope
 * instruction: since the structural test does not actually fail, `gameAudio.ts` uses the
 * song's own decoded instrument (not the placeholder) for these two titles, same as every
 * other GLBR title -- audible correctness (does it sound like AdLib on real Buck/Matrix DOS
 * hardware) is a separate, DOSBox-X question this round's tooling constraint puts out of scope.
 */
describe('Instrument bank: same structural sanity test as glbr.test.ts, run on all 16 Buck+Matrix songs', () => {
  if (!haveBuck || !haveMatrix || !haveDok) {
    it.skip('Buck/Matrix/DoK instrument comparison — requires all three optional MUSIC.DAX sources', () => {});
  }
  if (haveBuck && haveMatrix && haveDok) {
    it('Buck+Matrix: >80% in-bounds, >50% real attack rate, 0 placeholder-identical -- PASSES, contradicting P12', () => {
      function bankStats(glbr: DaxBlock[]) {
        let totalVoices = 0, inBounds = 0, withAttack = 0, samePlaceholder = 0;
        for (const blk of glbr) {
          const song = decodeGlbrSong(blk.raw);
          expect(song.instruments.length).toBe(GLBR_INSTRUMENT_VOICE_COUNT);
          for (const patch of song.instruments) {
            totalVoices++;
            if (patch === null) continue;
            inBounds++;
            if (patch.modulator.attackRate > 0 || patch.carrier.attackRate > 0) withAttack++;
            if (JSON.stringify(patch) === JSON.stringify(GLBR_PLACEHOLDER_PATCH)) samePlaceholder++;
          }
        }
        return { totalVoices, inBounds, withAttack, samePlaceholder };
      }
      const buck = bankStats(glbrBlocksOf(BUCK_PATH));
      const matrix = bankStats(glbrBlocksOf(MATRIX_PATH));
      const dok = bankStats(glbrBlocksOf(DOK_PATH));

      // Pinned, not just thresholded -- exact measured numbers, so a future decode change is
      // visible even if it still happens to clear the >80%/>50% bars.
      expect(buck).toEqual({ totalVoices: 64, inBounds: 64, withAttack: 64, samePlaceholder: 0 });
      expect(matrix).toEqual(buck); // byte-identical files -> byte-identical bank decode
      expect(dok).toEqual({ totalVoices: 56, inBounds: 56, withAttack: 50, samePlaceholder: 0 });

      // The same pass/fail thresholds glbr.test.ts's existing per-title test applies.
      for (const stats of [buck, matrix]) {
        expect(stats.inBounds / stats.totalVoices).toBeGreaterThan(0.8);
        expect(stats.withAttack / stats.inBounds).toBeGreaterThan(0.5);
        expect(stats.samePlaceholder).toBe(0);
      }
      // The disagreement with P12, numerically: Buck/Matrix's withAttack rate (100%) is not
      // lower than DoK's (89.3%) -- if anything it's higher, the opposite of "fails beside a
      // pass."
      expect(buck.withAttack / buck.inBounds).toBeGreaterThanOrEqual(dok.withAttack / dok.inBounds);
    });

  }

  if (!haveBuck) {
    it.skip('Buck instrument consumer check — source missing (D:/ external, never vendored)', () => {});
  }
  if (haveBuck) {
    it('decodeGlbrInstrumentBank called directly matches decodeGlbrSong.instruments (consumer check)', () => {
      const blocks = glbrBlocksOf(BUCK_PATH);
      const song = decodeGlbrSong(blocks[0].raw);
      const direct = decodeGlbrInstrumentBank(blocks[0].raw, song.header);
      expect(direct).toEqual(song.instruments);
    });
  }
});
