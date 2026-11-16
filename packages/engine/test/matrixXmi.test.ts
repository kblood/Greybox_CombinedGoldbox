/**
 * Buck Rogers: Matrix Cubed's REAL music: Miles AIL `.XMI` files, not the `GLBR` `MUSIC.DAX`
 * round 33 R5 wired (round 34 R4 correction — `docs/glbr-format.md` §4a/§6,
 * `docs/engine/research/matrix-cubed-audio.md`). Round 33 measured that Matrix's `MUSIC.DAX`
 * decodes to 8 `GLBR` songs byte-identical to Countdown's own file and treated that as a second
 * confirmation; it is file identity, not confirmation — `tools/matrix_music_strings.py` finds
 * ZERO `MUSIC.DAX` file-open references in either of Matrix's own binaries (`START.EXE`,
 * `GAME.OVR`), and instead finds `BUCKA/B/C.XMI`, five `.ADV` hardware drivers and an
 * `FATV9.AD` instrument bank — DQK's own Miles/AIL stack.
 *
 * This file re-derives P11 ("all three XMIs decode and FATV9.AD parses under the existing bank
 * reader with no format branch needed") directly against `xmi.ts`/`instrAd.ts`, independent of
 * `loadGame.ts`'s own census (`loadGameGlbrMusic.test.ts`).
 *
 * Source: the repo-relative, git-ignored `matrixcubed_extracted/` tree (never vendored). Absent
 * source => SKIP, the same convention as `glbrBuckMatrix.test.ts` and every other golden suite
 * in this package.
 *
 * ROUND 35 R6 -- MEASURED, and it falsified the prediction that sent me here. Round 35's plan
 * (P14) predicted this file would report PASS with `matrixcubed_extracted/` absent, i.e. that it
 * was vacuous. It does not. With `matrixcubed_extracted/BuckRogers2/c/Matrix/BUCKA.XMI` renamed
 * away, `vitest run test/matrixXmi.test.ts` printed `Tests 3 passed | 2 skipped (5)` -- the two
 * source-dependent describes correctly report SKIP, because the `if (!haveMatrix) { it.skip(...);
 * return; }` guards below are at DESCRIBE level, where a `return` skips rather than passing.
 * This file needed no change. Its sibling `loadGameGlbrMusic.test.ts` did: the same rename made
 * that file print `3 passed (3)`, because its guards were bare `return`s INSIDE an `it`. The
 * difference between those two shapes is the whole finding, and this file is the control that
 * proves the runner distinguishes them. See `docs/engine/research/vitest-probe-audit.md`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { sniffXmi, decodeXmi, type XmiFile } from '../src/audio/xmi.js';
import { sniffInstrAd, decodeInstrAd } from '../src/audio/instrAd.js';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..', '..', '..');

const MATRIX_DIR = resolve(REPO_ROOT, 'matrixcubed_extracted', 'BuckRogers2', 'c', 'Matrix');
const XMI_FILES = ['BUCKA.XMI', 'BUCKB.XMI', 'BUCKC.XMI'] as const;
const FATV9_PATH = resolve(MATRIX_DIR, 'FATV9.AD');

const COUNTDOWN_DIR = 'D:/Games/Emulator/DOS/Goldbox/BuckRogers1-CountdownToDoomsday';

const haveMatrix = XMI_FILES.every((f) => existsSync(resolve(MATRIX_DIR, f))) && existsSync(FATV9_PATH);
const haveCountdown = existsSync(COUNTDOWN_DIR);

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function readXmi(name: (typeof XMI_FILES)[number]): { bytes: Uint8Array; file: XmiFile } {
  const bytes = new Uint8Array(readFileSync(resolve(MATRIX_DIR, name)));
  return { bytes, file: decodeXmi(bytes) };
}

describe('Matrix Cubed XMI music files — all three decode, with real per-song content (P11)', () => {
  if (!haveMatrix) {
    it.skip('source missing (matrixcubed_extracted/, git-ignored)', () => {});
    return;
  }

  it('sniffXmi is true for all three files', () => {
    for (const f of XMI_FILES) {
      const bytes = new Uint8Array(readFileSync(resolve(MATRIX_DIR, f)));
      expect(sniffXmi(bytes)).toBe(true);
    }
  });

  it('BUCKA.XMI: 7 songs, exact per-song event/timbre counts', () => {
    const { file } = readXmi('BUCKA.XMI');
    expect(file.declaredCount).toBe(7);
    expect(file.songs.length).toBe(7);
    expect(file.songs.map((s) => s.events.length)).toEqual([897, 134, 244, 82, 213, 146, 968]);
    expect(file.songs.map((s) => s.timbres.length)).toEqual([8, 7, 8, 4, 7, 10, 9]);
    // Every song actually has note-on events, not just meta/control chatter.
    for (const song of file.songs) {
      expect(song.events.some((ev) => ev.kind === 'noteOn')).toBe(true);
    }
  });

  it('BUCKB.XMI: 7 songs, exact per-song event/timbre counts', () => {
    const { file } = readXmi('BUCKB.XMI');
    expect(file.declaredCount).toBe(7);
    expect(file.songs.length).toBe(7);
    expect(file.songs.map((s) => s.events.length)).toEqual([844, 109, 209, 62, 221, 139, 1039]);
    expect(file.songs.map((s) => s.timbres.length)).toEqual([8, 7, 8, 4, 7, 8, 10]);
  });

  it('BUCKC.XMI: 7 songs, exact per-song event/timbre counts (the shortest file, one un-timbred song)', () => {
    const { file } = readXmi('BUCKC.XMI');
    expect(file.declaredCount).toBe(7);
    expect(file.songs.length).toBe(7);
    expect(file.songs.map((s) => s.events.length)).toEqual([153, 27, 68, 30, 24, 11, 82]);
    // BUCKC's first song carries no TIMB chunk at all (0 timbres) -- an honest structural fact,
    // not a decode failure: the song still has real events (153 of them).
    expect(file.songs.map((s) => s.timbres.length)).toEqual([0, 1, 1, 1, 1, 1, 1]);
    expect(file.songs[0].events.length).toBeGreaterThan(0);
  });

  it('byte identity pins (corruption-detectable)', () => {
    const hashes = XMI_FILES.map((f) => sha256(new Uint8Array(readFileSync(resolve(MATRIX_DIR, f)))));
    expect(hashes).toEqual([
      '7adcb56eb45ec2760b5222170a6ccd2e44037bab24f37ed3714338a349322bea',
      '8e7172d8a2b12ef61b2499e557aa5616a4b720533bc745fe06c03236db13451f',
      '94a4a0991bbab9afe17aa53435cc39b164365a790915c41fde293b48cb6951a2',
    ]);
  });
});

describe('FATV9.AD — Matrix\'s own Miles instrument bank parses under the existing INSTR.AD reader, no format branch (P11)', () => {
  if (!haveMatrix) {
    it.skip('source missing (matrixcubed_extracted/, git-ignored)', () => {});
    return;
  }

  it('sniffs true and decodes to 152 instruments, all in-bounds — smaller bank than DQK\'s INSTR.AD (3,042 B vs 3,982 B) but the SAME container shape', () => {
    const bytes = new Uint8Array(readFileSync(FATV9_PATH));
    expect(bytes.length).toBe(3042);
    expect(sniffInstrAd(bytes)).toBe(true);
    const bank = decodeInstrAd(bytes);
    expect(bank.instruments.length).toBe(152);
    expect(bank.byKey.size).toBeLessThanOrEqual(152);
    for (const inst of bank.instruments) {
      expect(inst.operatorData.length).toBe(12);
    }
    // The bank is patch-ordered starting at (patch:0, bank:0) — a General-MIDI-shaped table,
    // same convention as DQK's INSTR.AD.
    expect(bank.instruments[0]).toMatchObject({ patch: 0, bank: 0 });
  });

  it('byte identity pin', () => {
    const bytes = new Uint8Array(readFileSync(FATV9_PATH));
    expect(sha256(bytes)).toBe('23bbcf1eb5c5c969a8ce60bc0f2b3d2e0073ac2f24bcd317f64b9d0887e0eb0b');
  });
});

/**
 * Bar B's alternative ("the XMI files are Countdown leftovers too") predicts they are
 * byte-identical to something in Countdown's own tree. Measured: Countdown ships ZERO
 * `.XMI`/`.ADV`/`FATV9*` files at all -- there is nothing in its tree for these to be a copy of.
 */
describe('Null for Bar B\'s alternative: Countdown ships no XMI/ADV/FATV9 files at all', () => {
  if (!haveCountdown) {
    it.skip('source missing (D:/ external, never vendored)', () => {});
    return;
  }
  it('0 .xmi / .adv / fatv9* files in the Countdown install directory', () => {
    const entries = readdirSync(COUNTDOWN_DIR);
    const xmi = entries.filter((f) => /\.xmi$/i.test(f));
    const adv = entries.filter((f) => /\.adv$/i.test(f));
    const fatv = entries.filter((f) => /^fatv9/i.test(f));
    expect(xmi).toEqual([]);
    expect(adv).toEqual([]);
    expect(fatv).toEqual([]);
    // Countdown DOES ship its own music.dax (the real GLBR title) -- confirming the search
    // itself isn't vacuously empty because the directory listing failed.
    expect(entries.some((f) => /^music\.dax$/i.test(f))).toBe(true);
  });
});
