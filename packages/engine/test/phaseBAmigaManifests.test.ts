/**
 * Phase B (PLAN-ROUND-31.md, following R6's amiga-glib-manifests.md) — pins the three new
 * Amiga GLIB manifests landed in `apps/web/games/`: `dark-queen-amiga.json`,
 * `pools-amiga.json`, `curse-amiga.json`.
 *
 * This does NOT re-measure decodeAsset's per-file routing — `amigaGlibSetsCensus.test.ts`
 * already pins that byte-for-byte, and this file's numbers were cross-checked against a live
 * run of that suite before landing (see docs/engine/research/amiga-glib-manifests.md). What
 * THIS file pins is different: that the actual on-disk MANIFEST JSON (categories, decode
 * flags, paths) drives `loadGame` to the same exact per-file and per-manifest frame totals —
 * so a manifest typo (wrong path, wrong decode:false, wrong category) would show up here even
 * if the underlying decoder is untouched and correct.
 *
 * Null / negative check (per the project's epistemic rules): every manifest also asserts that
 * its `decode:false` (data) rows render exactly 0 frames AND that this is not vacuous — the
 * same manifest's image-bearing rows render > 0 frames under the identical loadGame() pass, so
 * a decoder that produced 0 frames for everything would fail the image-bearing assertions
 * instead of silently passing the data-row assertions.
 *
 * Skips (not fails) when the external, never-vendored WHDLoad source is absent.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGame, type GameManifest, type FetchBytes, type LoadedGame } from '../src/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

function loadManifest(name: string): GameManifest {
  return JSON.parse(
    readFileSync(resolve(repoRoot, 'apps', 'web', 'games', name), 'utf8'),
  ) as GameManifest;
}

// path.resolve treats an already-absolute second argument (e.g. "D:/Games/...") as an
// override, so this one fetcher correctly serves both repo-relative and absolute manifest
// paths — matching the convention `buck-rogers-amiga.json` already established.
const fetchBytes: FetchBytes = async (p: string) => new Uint8Array(readFileSync(resolve(repoRoot, p)));

function manifestFilesExist(m: GameManifest): boolean {
  return m.files.every((f) => existsSync(resolve(repoRoot, f.path)));
}

/** Flatten a loaded game's file results into `{ path -> frame count }`, keyed by manifest path. */
function frameCountsByPath(game: LoadedGame): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cat of game.categories) {
    for (const f of cat.files) out[f.path] = f.frames.length;
  }
  return out;
}

interface Spec {
  manifestFile: string;
  id: string;
  totalFrames: number;
  /** Every image-bearing row's expected frame count, keyed by its manifest `path`. */
  imageFrames: Record<string, number>;
  /** Every decode:false row's manifest `path` — must render exactly 0 frames each. */
  dataPaths: string[];
}

const WHDLOAD =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked';

const SPECS: Spec[] = [
  {
    manifestFile: 'dark-queen-amiga.json',
    id: 'dark-queen-amiga',
    // Round 35 R3: 1497 -> 1500. NOT a golden regenerated to make a red test green -- the three
    // extra frames are named, and they were previously being DROPPED. Amiga DQK's
    // `data/Disk3/FRAME.TLB` carries three GLIB `0x19` composite records; before R3, composites
    // reached exactly one of the codebase's flattening sites (main.ts's asset browser), while
    // loadGame.ts and nwnPreview.ts listed `archive.images` only -- the same defect shape as
    // pool-amiga in round 34, which hid 928 of 1672 frames with nothing red.
    //
    // The delta is adjudicated from the bytes, not from this suite: that file is the ONLY one
    // carrying 0x19 records in the entire 272-file / 171-GLIB never-vendored WHDLoad corpus, and
    // its big-endian reading is settled by its DOS twin -- read BE, all 3 Amiga records reproduce
    // the 3 DOS records field for field (beMatches 3); byte-swapped, none do (leMatches 0).
    // `packages/engine/test/glibComposite.test.ts` pins that, and
    // `packages/engine/test/loadGameComposites.test.ts` independently pins this +3 alongside
    // dark-queen-dos 1430 -> 1433 and FRUA 1890 -> 1899.
    totalFrames: 1500,
    imageFrames: {
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk1/ALWAYS.TLB`]: 29,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk1/COMSPR.TLB`]: 46,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk1/TITLE.TLB`]: 15,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk1/TOPVIEW.TLB`]: 20,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk2/8X8DB.TLB`]: 423,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk2/8X8DC.TLB`]: 376,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk2/BACK.TLB`]: 20,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk2/BIGPIC.TLB`]: 3,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk2/CPIC.TLB`]: 190,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk2/DUNGCOM.TLB`]: 32,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk2/PICA.TLB`]: 21,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk2/PICB.TLB`]: 21,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk2/PICC.TLB`]: 23,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk2/SPRIT.TLB`]: 96,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk2/WILDCOM.TLB`]: 40,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk3/CBODY.TLB`]: 98,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk3/FINAL.TLB`]: 3,
      // 40 -> 43: the entire round-35 R3 delta for this manifest lands on this one file, which
      // is itself the corroboration -- it is the only file in the 272-file WHDLoad corpus carrying
      // GLIB 0x19 composite records, and PoolsOfDarkness/data/Disk3/FRAME.TLB below stays at 92.
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk3/FRAME.TLB`]: 43,
      [`${WHDLOAD}/DarkQueenOfKrynn/data/Disk3/GEN.TLB`]: 1,
    },
    dataPaths: [
      `${WHDLOAD}/DarkQueenOfKrynn/data/Disk1/SOUNDS.GLB`,
      `${WHDLOAD}/DarkQueenOfKrynn/data/Disk2/MONCHA.GLB`,
      `${WHDLOAD}/DarkQueenOfKrynn/data/Disk3/ECL.GLB`,
      `${WHDLOAD}/DarkQueenOfKrynn/data/Disk3/GEO.GLB`,
    ],
  },
  {
    manifestFile: 'pools-amiga.json',
    id: 'pools-amiga',
    totalFrames: 2599,
    imageFrames: {
      [`${WHDLOAD}/PoolsOfDarkness/data/DISK1/8X8DA.TLB`]: 20,
      [`${WHDLOAD}/PoolsOfDarkness/data/DISK1/ALWAYS.TLB`]: 29,
      [`${WHDLOAD}/PoolsOfDarkness/data/DISK1/COMSPR.TLB`]: 44,
      [`${WHDLOAD}/PoolsOfDarkness/data/DISK1/INTRO.TLB`]: 9,
      [`${WHDLOAD}/PoolsOfDarkness/data/DISK1/TITLE.TLB`]: 5,
      [`${WHDLOAD}/PoolsOfDarkness/data/Disk2/8X8D.TLB`]: 1536,
      [`${WHDLOAD}/PoolsOfDarkness/data/Disk2/BACK.TLB`]: 6,
      [`${WHDLOAD}/PoolsOfDarkness/data/Disk2/BIGPIC.TLB`]: 7,
      [`${WHDLOAD}/PoolsOfDarkness/data/Disk2/CPIC.TLB`]: 244,
      [`${WHDLOAD}/PoolsOfDarkness/data/Disk2/DUNGCOM.TLB`]: 156,
      [`${WHDLOAD}/PoolsOfDarkness/data/Disk2/PIC.TLB`]: 72,
      [`${WHDLOAD}/PoolsOfDarkness/data/Disk2/SKYGRND.TLB`]: 4,
      [`${WHDLOAD}/PoolsOfDarkness/data/Disk2/SPRIT.TLB`]: 87,
      [`${WHDLOAD}/PoolsOfDarkness/data/Disk2/WILDCOM.TLB`]: 120,
      [`${WHDLOAD}/PoolsOfDarkness/data/Disk3/CBODY.TLB`]: 128,
      [`${WHDLOAD}/PoolsOfDarkness/data/Disk3/CHEAD.TLB`]: 28,
      [`${WHDLOAD}/PoolsOfDarkness/data/Disk3/FINAL.TLB`]: 11,
      [`${WHDLOAD}/PoolsOfDarkness/data/Disk3/FRAME.TLB`]: 92,
      [`${WHDLOAD}/PoolsOfDarkness/data/Disk3/GEN.TLB`]: 1,
    },
    dataPaths: [
      `${WHDLOAD}/PoolsOfDarkness/data/DISK1/SOUNDS.GLB`,
      `${WHDLOAD}/PoolsOfDarkness/data/Disk2/MONCHA.GLB`,
      `${WHDLOAD}/PoolsOfDarkness/data/Disk2/WALLDEF.GLB`,
      `${WHDLOAD}/PoolsOfDarkness/data/Disk3/ECL.GLB`,
      `${WHDLOAD}/PoolsOfDarkness/data/Disk3/GEO.GLB`,
    ],
  },
  {
    manifestFile: 'curse-amiga.json',
    id: 'curse-amiga',
    totalFrames: 2209,
    imageFrames: {
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKA/8X8D.TLB`]: 65,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKA/ALWAYS.TLB`]: 107,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKA/COMSPR.TLB`]: 26,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKA/SKY.TLB`]: 3,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/8X8D.TLB`]: 1260,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/BIGPIC.TLB`]: 14,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/BODY.TLB`]: 26,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/CBODY.TLB`]: 128,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/CHEAD.TLB`]: 56,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/CPIC.TLB`]: 132,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/DUNGCOM.TLB`]: 25,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/HEAD.TLB`]: 35,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/PIC.TLB`]: 119,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/RANDCOM.TLB`]: 6,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/SPRIT.TLB`]: 120,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/TILES.TLB`]: 48,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/TITLE.TLB`]: 5,
      [`${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/WILDCOM.TLB`]: 34,
    },
    dataPaths: [
      `${WHDLOAD}/CurseOfTheAzureBonds/data/DISKA/SOUNDS.GLB`,
      `${WHDLOAD}/CurseOfTheAzureBonds/data/DISKA/STRINGS.GLB`,
      `${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/ECL.GLB`,
      `${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/GEO.GLB`,
      `${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/ITEM.GLB`,
      `${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/MONCHA.GLB`,
      `${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/MONITM.GLB`,
      `${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/MONSPC.GLB`,
      `${WHDLOAD}/CurseOfTheAzureBonds/data/DISKB/WALLDEF.GLB`,
    ],
  },
];

for (const spec of SPECS) {
  const manifestPath = resolve(repoRoot, 'apps', 'web', 'games', spec.manifestFile);
  const manifestOnDisk = existsSync(manifestPath);
  const manifest = manifestOnDisk ? loadManifest(spec.manifestFile) : null;
  const ready = manifestOnDisk && manifest !== null && manifestFilesExist(manifest);
  const maybe = ready ? describe : describe.skip;

  maybe(`Phase B manifest — ${spec.manifestFile} (real loadGame pass over WHDLoad bytes)`, () => {
    it('has the pinned id and every declared file present on disk', () => {
      expect(manifest!.id).toBe(spec.id);
      expect(manifest!.platform).toBe('Amiga');
      // Row inventory: every expected image-bearing path and every expected data path must be
      // exactly the manifest's file list, with nothing missing and nothing extra (mutation: a
      // dropped or added row must fail this, not just the totals below).
      const declaredPaths = manifest!.files.map((f) => f.path).sort();
      const expectedPaths = [...Object.keys(spec.imageFrames), ...spec.dataPaths].sort();
      expect(declaredPaths).toEqual(expectedPaths);
    });

    it(`loadGame() renders exactly ${spec.totalFrames} total frames, matching the R6 census`, async () => {
      const game = await loadGame(manifest!, fetchBytes);
      expect(game.id).toBe(spec.id);
      expect(game.errors).toEqual([]);
      expect(game.totalFrames).toBe(spec.totalFrames);

      const byPath = frameCountsByPath(game);

      // Every image-bearing row renders its pinned exact frame count.
      for (const [path, expected] of Object.entries(spec.imageFrames)) {
        expect(byPath[path], `${path} frame count`).toBe(expected);
        expect(expected, `${path} test fixture bug: expected 0 belongs in dataPaths`).toBeGreaterThan(0);
      }

      // Negative check WITH a null: every decode:false (data) row renders exactly 0 frames.
      // This is not vacuous, because the loop above already proved this same loadGame() pass
      // decodes real non-zero frame counts for every image-bearing row under the identical
      // manifest/fetcher/decoder — so a decoder producing 0 frames everywhere would fail above,
      // not just pass here.
      for (const path of spec.dataPaths) {
        expect(byPath[path], `${path} should be a data row rendering 0 frames`).toBe(0);
      }

      // Sum-of-parts cross-check: the per-file pins above must themselves sum to the pinned
      // total (catches a manifest row present-but-uncounted, e.g. wrong category bucket).
      const sumOfParts = Object.values(spec.imageFrames).reduce((a, b) => a + b, 0);
      expect(sumOfParts).toBe(spec.totalFrames);
    });
  });
}
