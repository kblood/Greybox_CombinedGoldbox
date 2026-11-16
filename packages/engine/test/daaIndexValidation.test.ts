/**
 * The DAA 6-byte sub-frame index branch must be able to say no.
 *
 * Until 2026-08-25 `parseContainer` treated `body % 6 === 0` as sufficient to declare a file a
 * sub-frame index. That is not a test: one file in six passes it by arithmetic alone. It
 * force-fitted every Amiga Pool of Radiance resource — a fourth container format CLAUDE.md still
 * lists as unsolved — into the sub-frame path. `pic.dax` is 270220 bytes and came out with
 * sub-offsets as large as 4,245,164,308, going backwards, 77 of its 98 entries past EOF; nothing
 * downstream noticed, because every caller only asked whether decoding threw.
 *
 * The 9-byte block branch beside it has always validated by chaining offsets on EOF. This file
 * pins the three checks the index branch now performs, measured in BOTH directions over the whole
 * Amiga corpus, and records the check that is deliberately absent. The Python twin
 * (`tools/test_daa_index_validation.py`) carries the same numbers against `tools/daa_decode.py`.
 *
 * Source is the user's read-only WHDLoad pack — absent source => SKIP.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { decodeAsset } from '../src/index.js';
import { decodeDaa, sniffDaa } from '../src/loaders/daa.js';
import { sniffDax } from '../src/loaders/dax.js';

const WHD =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked';

/**
 * The 14 files that genuinely carry a 6-byte sub-frame index, and the 9 Pool of Radiance
 * resources that were being mistaken for one. Named rather than globbed, so a decoder that stops
 * reading a real one fails here instead of passing with a quietly smaller corpus.
 */
const GENUINE: [string, string][] = [
  ['BuckRogersCountdownDday', 'pic0.daa'],
  ['BuckRogersCountdownDday', 'pic1.daa'],
  ['BuckRogersCountdownDday', 'pic2.daa'],
  ['BuckRogersCountdownDday', 'pic3.daa'],
  ['BuckRogersCountdownDday', 'sprit1.daa'],
  ['BuckRogersCountdownDday', 'sprit2.daa'],
  ['BuckRogersCountdownDday', 'sprit3.daa'],
  ['ChampionsOfKrynn', 'SPRIT1.DAA'],
  ['ChampionsOfKrynn', 'SPRIT2.DAA'],
  ['ChampionsOfKrynn', 'pic1.daa'],
  ['ChampionsOfKrynn', 'pic2.daa'],
  ['DeathKnightsOfKrynn', 'PIC1.DAA'],
  ['DeathKnightsOfKrynn', 'PIC2.DAA'],
  ['DeathKnightsOfKrynn', 'SPRIT1.DAA'],
];
const IMPOSTORS: [string, string][] = [
  ['PoolOfRadiance', '8x8d.dax'],
  ['PoolOfRadiance', 'cbody.dax'],
  ['PoolOfRadiance', 'ecl.dax'],
  ['PoolOfRadiance', 'geo.dax'],
  ['PoolOfRadiance', 'moncha.dax'],
  ['PoolOfRadiance', 'monitm.dax'],
  ['PoolOfRadiance', 'pic.dax'],
  ['PoolOfRadiance', 'sqrpaci.dax'],
  ['PoolOfRadiance', 'walldef.dax'],
];

const pathOf = ([title, name]: [string, string]) => `${WHD}/${title}/data/${name}`;
const read = (row: [string, string]) => new Uint8Array(readFileSync(pathOf(row)));
const have = [...GENUINE, ...IMPOSTORS].every((r) => existsSync(pathOf(r)));

/**
 * Score the three checks INDEPENDENTLY of one another. `decodeDaa` throws on the first
 * violation, so asking it which check fired would only ever report the pad byte; each predicate
 * is evaluated here over every entry, making the counts below three separate measurements.
 */
function predicates(data: Uint8Array) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const word0 = dv.getUint16(0, false);
  const n = Math.floor((word0 - 2) / 6);
  let pad = true;
  let monotonic = true;
  let inRange = true;
  let prev = -1;
  for (let i = 0; i < n; i++) {
    const off = 2 + i * 6;
    if (data[off + 1] !== 0) pad = false;
    const sub = dv.getUint32(off + 2, false);
    if (sub < prev) monotonic = false;
    if (word0 + sub > data.byteLength) inRange = false;
    prev = sub;
  }
  return { pad, monotonic, inRange, n };
}

describe.skipIf(!have)('DAA 6-byte index validation', () => {
  it('each check is perfect and two-sided across the corpus', () => {
    const good = GENUINE.map((r) => predicates(read(r)));
    const bad = IMPOSTORS.map((r) => predicates(read(r)));
    expect(good.length).toBe(14);
    expect(bad.length).toBe(9);
    for (const key of ['pad', 'monotonic', 'inRange'] as const) {
      expect(`${key}:${good.filter((p) => p[key]).length}`).toBe(`${key}:14`);
      expect(`${key}:${bad.filter((p) => p[key]).length}`).toBe(`${key}:0`);
    }
  });

  it('the null: a check that separates nothing is not in the decoder', () => {
    // `toc[0].subOffset === 0` is the obvious first thing to reach for, and it holds for every
    // impostor too — a validator built on it would still have accepted all nine.
    for (const row of [...GENUINE, ...IMPOSTORS]) {
      const d = read(row);
      const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
      expect(`${row[1]}:${dv.getUint32(4, false)}`).toBe(`${row[1]}:0`);
    }
  });

  it('genuine files still parse as sub-frame indices', () => {
    for (const row of GENUINE) {
      const arc = decodeDaa(read(row), row[1]);
      expect(`${row[1]}:${arc.subFrames.length > 0}`).toBe(`${row[1]}:true`);
    }
  });

  it('decodeDaa still rejects them directly; decodeAsset now decodes them as pool-amiga instead', () => {
    // `decodeDaa` itself is UNCHANGED (out of scope for R3 — "must not touch any other
    // loader") and still throws when called directly on one of these files.
    for (const row of IMPOSTORS) {
      const bytes = read(row);
      expect(() => decodeDaa(bytes, row[1])).toThrow(/6-byte index entry/);
      // `sniffDaa` is deliberately left as the cheap shape check it advertises, so these
      // still satisfy it (unchanged from before R3).
      expect(`${row[1]}:${sniffDaa(bytes)}`).toBe(`${row[1]}:true`);
      expect(`${row[1]}:${sniffDax(bytes)}`).toBe(`${row[1]}:false`);
      // PLAN-ROUND-32.md R3 added `sniffPoolAmiga`/`decodePoolAmiga` to `decodeAsset` BEFORE
      // the DAA branch specifically so these 9 files (real Pool-Amiga containers that only
      // coincidentally satisfy DAA's loose 6-byte-index shape check) are correctly claimed
      // instead of reaching DAA's error path — see `packages/engine/src/index.ts`'s
      // `decodeAsset` doc comment and `packages/engine/test/amigaGlibSetsCensus.test.ts`'s
      // Pool-of-Radiance census for the full 23-file before/after picture. decodeAsset now
      // succeeds where it used to throw.
      const decoded = decodeAsset(bytes, row[1]);
      expect(`${row[1]}:${decoded.format}`).toBe(`${row[1]}:pool-amiga`);
    }
  });

  it('each check can reject on its own', () => {
    // All nine impostors violate all three checks at once (measured above), so the real corpus
    // cannot tell the checks apart: delete any one of them and the corpus assertions stay green.
    // Verified by mutation on the Python twin. Perturbing a genuine file in exactly one way is
    // the only input that discriminates.
    const base = read(['ChampionsOfKrynn', 'SPRIT1.DAA']);
    const dv0 = new DataView(base.buffer, base.byteOffset, base.byteLength);
    const n = Math.floor((dv0.getUint16(0, false) - 2) / 6);
    expect(n).toBeGreaterThanOrEqual(3);
    expect(() => decodeDaa(base, 'control')).not.toThrow();

    const pad = base.slice();
    pad[2 + 6 + 1] = 0x90; // entry 1's pad byte — the value Pool's cbody.dax happens to carry
    expect(() => decodeDaa(pad, 'pad')).toThrow(/pad byte/);

    const backwards = base.slice();
    const bv = new DataView(backwards.buffer, backwards.byteOffset, backwards.byteLength);
    const a = bv.getUint32(2 + 4, false);
    const b = bv.getUint32(2 + 6 + 4, false);
    expect(a).toBeLessThan(b);
    bv.setUint32(2 + 4, b, false);
    bv.setUint32(2 + 6 + 4, a, false);
    expect(() => decodeDaa(backwards, 'backwards')).toThrow(/goes backwards/);

    const pastEof = base.slice();
    const pv = new DataView(pastEof.buffer, pastEof.byteOffset, pastEof.byteLength);
    pv.setUint32(2 + (n - 1) * 6 + 2, pastEof.byteLength, false);
    expect(() => decodeDaa(pastEof, 'eof')).toThrow(/past EOF/);
  });

  it('how wrong the old reading was', () => {
    // The scale of the force-fit, so any future relaxation has a number to answer to.
    const d = read(['PoolOfRadiance', 'pic.dax']);
    expect(d.byteLength).toBe(270220);
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const word0 = dv.getUint16(0, false);
    const n = Math.floor((word0 - 2) / 6);
    const subs = Array.from({ length: n }, (_, i) => dv.getUint32(2 + i * 6 + 2, false));
    expect(n).toBe(98);
    expect(Math.max(...subs)).toBe(4245164308);
    expect(subs.filter((s) => word0 + s > d.byteLength).length).toBe(77);
  });
});
