/**
 * R6 — census of the six held Amiga GLIB-era sets that have no manifest, plus Pool of
 * Radiance's already-known-unported 4th format.
 *
 * `docs/engine/PLAN-ROUND-31.md` R6 asked six questions with the shipped decoders left
 * UNCHANGED (this file imports `decodeAsset` / the sniff functions from `../src/index.js`
 * and calls nothing else): per WHDLoad Gold Box set, how many container files exist, how
 * many decode to >= 1 image, how many decode to 0 images (with their container tag), how
 * many throw (with the error's first line), and what the total frame count is. Measured
 * on commit 46ea719ee332e503553a3a036030094e7da584d0 (HEAD at measurement time; R4 was
 * working on `glib.ts`/`loadGame.ts` concurrently in this same round but had not touched
 * either file as of that commit — verified with `git status`/`git diff HEAD` immediately
 * before running the census below).
 *
 * The six sets, and every number pinned here, came from a single walk of each set's
 * `data/` tree (case-insensitive `.tlb`/`.glb`/`.dax`/`.lbm`) feeding every file through
 * `decodeAsset` unchanged — see `docs/engine/research/amiga-glib-manifests.md` for the
 * full table with the plan's own predicted coverage floors next to these measured counts
 * (four of six sets measured BELOW the plan's predicted floor; only Pools and DQK met or
 * beat theirs — reported there, not smoothed over here).
 *
 * PoolOfRadiance history (measure-before-predict, then superseded by PLAN-ROUND-32.md R3):
 * the round-31 plan's R6 brief asserted "every .dax sniffs as none of the five formats."
 * That was FALSE even then — calling the five `sniffX` functions directly (not just
 * observing `decodeAsset`'s aggregate throw) showed PoR's `.dax` files split three ways: 9
 * files sniffed `daa=true` (a false positive off DAA's deliberately loose 6-byte-index
 * check) and threw a DAA-shaped "6-byte index entry ...: pad byte is N, not 0" message; 1
 * file (`item.dax`) sniffed `dax=true` (a false positive) and threw a raw DataView bounds
 * error from inside `decodeDax`; the remaining 13 sniffed as none of the five and threw
 * `decodeAsset`'s own message. All 23 ended up with zero decoded images — the round-31
 * finding was that the *mechanism* was not "none of the five", not that the files decoded.
 *
 * Round 32 R3 closed the actual gap: `sniffPoolAmiga`/`decodePoolAmiga`
 * (`../src/loaders/poolAmiga.ts`) is a strict structural + XOR-checksum check placed in
 * `decodeAsset` BEFORE the DAA/DAX branches specifically so it intercepts these 10
 * (9 daa + 1 dax) false positives as well as the other 13. All 23 files now decode
 * successfully as `format: 'pool-amiga'` — the `sniffDaa`/`sniffDax` false-positive flags
 * below are unchanged (those two sniffers were not touched) and are kept as a historical
 * record of why the old behavior was wrong, but `decodeAsset`'s outcome is now success,
 * not a throw. See `packages/engine/test/poolAmiga.test.ts` for the 843/843 byte-identity
 * proof against the Python oracle; this file only re-confirms the dispatch-level outcome
 * (format tag, block/frame counts) for the corpus this census already walks.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decodeAsset,
  sniffDaa,
  sniffDax,
  sniffGlib,
  sniffHlib,
  sniffIlbm,
  sniffPoolAmiga,
} from '../src/index.js';

const WHDLOAD =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked';

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tlb|glb|dax|lbm)$/i.test(name)) out.push(p);
  }
}

/** List every container file under `<WHDLOAD>/<folder>/data`, relative path, POSIX-slashed. */
function listSet(folder: string): string[] {
  const root = join(WHDLOAD, folder, 'data');
  const files: string[] = [];
  walk(root, files);
  return files.map((f) => f.slice(root.length + 1).replace(/\\/g, '/')).sort();
}

function readBytes(folder: string, rel: string): Uint8Array {
  return new Uint8Array(readFileSync(join(WHDLOAD, folder, 'data', rel)));
}

/** One file's decodeAsset outcome, reduced to what R6 asks the census to pin. */
type FileOutcome =
  | { kind: 'image'; frames: number; tag: string }
  | { kind: 'empty'; tag: string }
  | { kind: 'throw'; firstLine: string };

function decodeOutcome(folder: string, rel: string): FileOutcome {
  const bytes = readBytes(folder, rel);
  let decoded: ReturnType<typeof decodeAsset>;
  try {
    decoded = decodeAsset(bytes, rel);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: 'throw', firstLine: msg.split('\n')[0]! };
  }
  if (decoded.format === 'glib') {
    const frames = decoded.archive.images.length;
    const tag = decoded.archive.tag;
    return frames > 0 ? { kind: 'image', frames, tag } : { kind: 'empty', tag };
  }
  // Any other recognized format (hlib/ilbm/daa/dax) reached via a mislabeled/odd file —
  // still summarized the same way so a future misroute shows up as data, not a crash.
  if ('archive' in decoded) {
    const frames = (decoded.archive as { images?: unknown[] }).images?.length ?? 0;
    return frames > 0 ? { kind: 'image', frames, tag: decoded.format } : { kind: 'empty', tag: decoded.format };
  }
  return { kind: 'image', frames: 1, tag: decoded.format };
}

interface ExpectedFile {
  frames?: number;
  tag?: string;
  throw?: string;
}
interface ExpectedSet {
  folder: string;
  files: Record<string, ExpectedFile>;
}

// AUTO-DERIVED reference data (measured 2026-09-03 on commit 46ea719ee332e503553a3a036030094e7da584d0).
const EXPECTED: Record<string, ExpectedSet> = {
  curse: {
    folder: 'CurseOfTheAzureBonds',
    files: {
      'DISKA/8X8D.TLB': { frames: 65, tag: 'HLIB' },
      'DISKA/ALWAYS.TLB': { frames: 107, tag: 'TILE' },
      'DISKA/COMSPR.TLB': { frames: 26, tag: 'TILE' },
      'DISKA/SKY.TLB': { frames: 3, tag: 'TILE' },
      'DISKA/SOUNDS.GLB': { frames: 0, tag: 'DIG8' },
      'DISKA/STRINGS.GLB': { frames: 0, tag: 'TEXT' },
      'DISKB/8X8D.TLB': { frames: 1260, tag: 'GLIB' },
      'DISKB/BIGPIC.TLB': { frames: 14, tag: 'GLIB' },
      'DISKB/BODY.TLB': { frames: 26, tag: 'TILE' },
      'DISKB/CBODY.TLB': { frames: 128, tag: 'TILE' },
      'DISKB/CHEAD.TLB': { frames: 56, tag: 'TILE' },
      'DISKB/CPIC.TLB': { frames: 132, tag: 'TILE' },
      'DISKB/DUNGCOM.TLB': { frames: 25, tag: 'TILE' },
      'DISKB/ECL.GLB': { frames: 0, tag: 'DATA' },
      'DISKB/GEO.GLB': { frames: 0, tag: 'DATA' },
      'DISKB/HEAD.TLB': { frames: 35, tag: 'TILE' },
      'DISKB/ITEM.GLB': { frames: 0, tag: 'DATA' },
      'DISKB/MONCHA.GLB': { frames: 0, tag: 'DATA' },
      'DISKB/MONITM.GLB': { frames: 0, tag: 'DATA' },
      'DISKB/MONSPC.GLB': { frames: 0, tag: 'DATA' },
      'DISKB/PIC.TLB': { frames: 119, tag: 'GLIB' },
      'DISKB/RANDCOM.TLB': { frames: 6, tag: 'TILE' },
      'DISKB/SPRIT.TLB': { frames: 120, tag: 'GLIB' },
      'DISKB/TILES.TLB': { frames: 48, tag: 'HLIB' },
      'DISKB/TITLE.TLB': { frames: 5, tag: 'TILE' },
      'DISKB/WALLDEF.GLB': { frames: 0, tag: 'DATA' },
      'DISKB/WILDCOM.TLB': { frames: 34, tag: 'TILE' },
    },
  },
  secret: {
    folder: 'SecretOfTheSilverBlades',
    files: {
      'DISK1/8X8D.TLB': { frames: 65, tag: 'GLIB' },
      'DISK1/ALWAYS.TLB': { frames: 72, tag: 'TILE' },
      'DISK1/COMSPR.TLB': { frames: 26, tag: 'TILE' },
      'DISK1/SKY.TLB': { frames: 3, tag: 'TILE' },
      'DISK1/sounds.glb': { frames: 0, tag: 'DIG8' },
      'DISK2/8X8D.TLB': { frames: 1330, tag: 'GLIB' },
      'DISK2/BIGPIC.TLB': { frames: 8, tag: 'GLIB' },
      'DISK2/CBODY.TLB': { frames: 128, tag: 'TILE' },
      'DISK2/CHEAD.TLB': { frames: 56, tag: 'TILE' },
      'DISK2/CPIC.TLB': { frames: 106, tag: 'TILE' },
      'DISK2/DUNGCOM.TLB': { frames: 30, tag: 'TILE' },
      'DISK2/ECL.GLB': { frames: 0, tag: 'DATA' },
      'DISK2/GEO.GLB': { frames: 0, tag: 'DATA' },
      'DISK2/ITEM.GLB': { frames: 0, tag: 'DATA' },
      'DISK2/MONCHA.GLB': { frames: 0, tag: 'DATA' },
      'DISK2/MONITM.GLB': { frames: 0, tag: 'DATA' },
      'DISK2/MONSPC.GLB': { frames: 0, tag: 'DATA' },
      'DISK2/PIC.TLB': { frames: 94, tag: 'GLIB' },
      'DISK2/SPRIT.TLB': { frames: 102, tag: 'GLIB' },
      'DISK2/TITLE.TLB': { frames: 5, tag: 'TILE' },
      'DISK2/WALLDEF.GLB': { frames: 0, tag: 'DATA' },
    },
  },
  pools: {
    folder: 'PoolsOfDarkness',
    files: {
      'DISK1/8X8DA.TLB': { frames: 20, tag: 'GLIB' },
      'DISK1/ALWAYS.TLB': { frames: 29, tag: 'TILE' },
      'DISK1/COMSPR.TLB': { frames: 44, tag: 'TILE' },
      'DISK1/INTRO.TLB': { frames: 9, tag: 'TILE' },
      'DISK1/SOUNDS.GLB': { frames: 0, tag: 'DIG8' },
      'DISK1/TITLE.TLB': { frames: 5, tag: 'TILE' },
      'Disk2/8X8D.TLB': { frames: 1536, tag: 'GLIB' },
      'Disk2/BACK.TLB': { frames: 6, tag: 'GLIB' },
      'Disk2/BIGPIC.TLB': { frames: 7, tag: 'GLIB' },
      'Disk2/CPIC.TLB': { frames: 244, tag: 'TILE' },
      'Disk2/DUNGCOM.TLB': { frames: 156, tag: 'GLIB' },
      'Disk2/MONCHA.GLB': { frames: 0, tag: 'DATA' },
      'Disk2/PIC.TLB': { frames: 72, tag: 'GLIB' },
      'Disk2/SKYGRND.TLB': { frames: 4, tag: 'GLIB' },
      'Disk2/SPRIT.TLB': { frames: 87, tag: 'GLIB' },
      'Disk2/WALLDEF.GLB': { frames: 0, tag: 'DATA' },
      'Disk2/WILDCOM.TLB': { frames: 120, tag: 'GLIB' },
      'Disk3/CBODY.TLB': { frames: 128, tag: 'TILE' },
      'Disk3/CHEAD.TLB': { frames: 28, tag: 'TILE' },
      'Disk3/ECL.GLB': { frames: 0, tag: 'DATA' },
      'Disk3/FINAL.TLB': { frames: 11, tag: 'TILE' },
      'Disk3/FRAME.TLB': { frames: 92, tag: 'GLIB' },
      'Disk3/GEN.TLB': { frames: 1, tag: 'TILE' },
      'Disk3/GEO.GLB': { frames: 0, tag: 'DATA' },
    },
  },
  gateway: {
    folder: 'GatewayToSavageFrontier',
    files: {
      'DiskA/Always.tlb': { frames: 128, tag: 'TILE' },
      'DiskA/ComSpr.tlb': { frames: 26, tag: 'TILE' },
      'DiskA/Sky.tlb': { frames: 3, tag: 'TILE' },
      'DiskA/Sounds.glb': { frames: 0, tag: 'DIG8' },
      'DiskA/Strings.glb': { frames: 0, tag: 'TEXT' },
      'DiskA/Walls.tlb': { frames: 65, tag: 'GLIB' },
      'DiskB/Body.tlb': { frames: 17, tag: 'TILE' },
      'DiskB/CBody.tlb': { frames: 128, tag: 'TILE' },
      'DiskB/CHead.tlb': { frames: 56, tag: 'TILE' },
      'DiskB/Cpic.tlb': { frames: 130, tag: 'TILE' },
      'DiskB/DungCom.tlb': { frames: 25, tag: 'TILE' },
      'DiskB/Head.tlb': { frames: 20, tag: 'TILE' },
      'DiskB/Item.glb': { frames: 0, tag: 'GLIB' },
      'DiskB/MonCha.glb': { frames: 0, tag: 'GLIB' },
      'DiskB/MonItm.glb': { frames: 0, tag: 'GLIB' },
      'DiskB/MonSpc.glb': { frames: 0, tag: 'GLIB' },
      'DiskB/Pic.tlb': { frames: 73, tag: 'GLIB' },
      'DiskB/RandCom.tlb': { frames: 6, tag: 'TILE' },
      'DiskB/Title.tlb': { frames: 6, tag: 'TILE' },
      'DiskB/WildCom.tlb': { frames: 34, tag: 'TILE' },
      'DiskC/BigPic.tlb': { frames: 12, tag: 'TILE' },
      'DiskC/ECL.glb': { frames: 0, tag: 'DATA' },
      'DiskC/Geo.glb': { frames: 0, tag: 'DATA' },
      'DiskC/Sprit.tlb': { frames: 120, tag: 'GLIB' },
      'DiskC/Tiles.tlb': { frames: 48, tag: 'HLIB' },
      'DiskC/WallDef.glb': { frames: 0, tag: 'DATA' },
      'DiskC/Walls.tlb': { frames: 2384, tag: 'GLIB' },
    },
  },
  treasures: {
    folder: 'TreasuresOfSavageFrontier',
    files: {
      'DiskC/Luck.glb': { frames: 0, tag: 'TILE' },
      'DiskC/Pic.tlb': { frames: 140, tag: 'GLIB' },
      'DiskC/WallDef.glb': { frames: 0, tag: 'GLIB' },
      'DiskC/walls.tlb': { frames: 1404, tag: 'GLIB' },
      'diska/Always.tlb': { frames: 164, tag: 'TILE' },
      'diska/Sky.tlb': { frames: 3, tag: 'TILE' },
      'diska/Sounds.glb': { frames: 0, tag: 'DIG8' },
      'diska/Strings.glb': { frames: 0, tag: 'TEXT' },
      'diska/Walls.tlb': { frames: 65, tag: 'GLIB' },
      'diska/bigpic.tlb': { frames: 6, tag: 'GLIB' },
      'diska/comspr.tlb': { frames: 26, tag: 'TILE' },
      'diska/cpic.tlb': { frames: 204, tag: 'TILE' },
      'diska/dungcom.tlb': { frames: 25, tag: 'TILE' },
      'diska/randcom.tlb': { frames: 6, tag: 'TILE' },
      'diska/title.tlb': { frames: 5, tag: 'GLIB' },
      'diska/wildcom.tlb': { frames: 34, tag: 'TILE' },
      'diskb/CBody.tlb': { frames: 128, tag: 'TILE' },
      'diskb/chead.tlb': { frames: 56, tag: 'TILE' },
      'diskb/ecl.glb': { frames: 0, tag: 'TILE' },
      'diskb/geo.glb': { frames: 0, tag: 'GLIB' },
      'diskb/item.glb': { frames: 0, tag: 'GLIB' },
      'diskb/map.tlb': { frames: 7, tag: 'TILE' },
      'diskb/moncha.glb': { frames: 0, tag: 'GLIB' },
      'diskb/monitm.glb': { frames: 0, tag: 'GLIB' },
      'diskb/monspc.glb': { frames: 0, tag: 'GLIB' },
    },
  },
  dqk: {
    folder: 'DarkQueenOfKrynn',
    files: {
      'Disk1/ALWAYS.TLB': { frames: 29, tag: 'TILE' },
      'Disk1/COMSPR.TLB': { frames: 46, tag: 'TILE' },
      'Disk1/SOUNDS.GLB': { frames: 0, tag: 'DIG8' },
      'Disk1/TITLE.TLB': { frames: 15, tag: 'GLIB' },
      'Disk1/TOPVIEW.TLB': { frames: 20, tag: 'TILE' },
      'Disk2/8X8DB.TLB': { frames: 423, tag: 'GLIB' },
      'Disk2/8X8DC.TLB': { frames: 376, tag: 'GLIB' },
      'Disk2/BACK.TLB': { frames: 20, tag: 'GLIB' },
      'Disk2/BIGPIC.TLB': { frames: 3, tag: 'GLIB' },
      'Disk2/CPIC.TLB': { frames: 190, tag: 'TILE' },
      'Disk2/DUNGCOM.TLB': { frames: 32, tag: 'GLIB' },
      'Disk2/MONCHA.GLB': { frames: 0, tag: 'DATA' },
      'Disk2/PICA.TLB': { frames: 21, tag: 'GLIB' },
      'Disk2/PICB.TLB': { frames: 21, tag: 'GLIB' },
      'Disk2/PICC.TLB': { frames: 23, tag: 'GLIB' },
      'Disk2/SPRIT.TLB': { frames: 96, tag: 'GLIB' },
      'Disk2/WILDCOM.TLB': { frames: 40, tag: 'GLIB' },
      'Disk3/CBODY.TLB': { frames: 98, tag: 'TILE' },
      'Disk3/ECL.GLB': { frames: 0, tag: 'DATA' },
      'Disk3/FINAL.TLB': { frames: 3, tag: 'GLIB' },
      'Disk3/FRAME.TLB': { frames: 40, tag: 'TILE' },
      'Disk3/GEN.TLB': { frames: 1, tag: 'TILE' },
      'Disk3/GEO.GLB': { frames: 0, tag: 'DATA' },
    },
  },
};

// Plan-predicted coverage floors (>= 1 image), reported next to the measured counts below.
const PREDICTED_FLOOR: Record<string, number> = {
  curse: 20,
  secret: 16,
  pools: 18,
  gateway: 20,
  treasures: 18,
  dqk: 15,
};

for (const [key, spec] of Object.entries(EXPECTED)) {
  const root = join(WHDLOAD, spec.folder, 'data');
  const have = existsSync(root);
  const maybe = have ? describe : describe.skip;

  maybe(`Amiga GLIB census — ${spec.folder} (WHDLoad, unchanged decodeAsset)`, () => {
    it('container file set matches the pinned inventory exactly (mutation: dropping a name must fail)', () => {
      const actual = listSet(spec.folder);
      const expected = Object.keys(spec.files).sort();
      expect(actual).toEqual(expected);
      // Two-sided: a set missing one real file would NOT equal the pinned list.
      expect(actual).not.toEqual(expected.slice(1));
    });

    it('per-file frames/tag/throw outcome matches the pinned census, and totals + coverage are reported', () => {
      let imgFiles = 0;
      let emptyFiles = 0;
      let throwFiles = 0;
      let totalFrames = 0;
      for (const [rel, exp] of Object.entries(spec.files)) {
        const outcome = decodeOutcome(spec.folder, rel);
        if ('throw' in exp) {
          expect(outcome.kind, `${rel} should throw`).toBe('throw');
          if (outcome.kind === 'throw') {
            expect(outcome.firstLine).toBe(exp.throw);
            throwFiles++;
          }
          continue;
        }
        if (exp.frames === 0) {
          expect(outcome.kind, `${rel} should decode to 0 images`).toBe('empty');
          if (outcome.kind === 'empty') {
            expect(outcome.tag).toBe(exp.tag);
            emptyFiles++;
          }
          continue;
        }
        expect(outcome.kind, `${rel} should decode to >= 1 image`).toBe('image');
        if (outcome.kind === 'image') {
          expect(outcome.frames, `${rel} frame count`).toBe(exp.frames);
          expect(outcome.tag, `${rel} tag`).toBe(exp.tag);
          imgFiles++;
          totalFrames += outcome.frames;
        }
      }
      const containerFiles = Object.keys(spec.files).length;
      expect(imgFiles + emptyFiles + throwFiles).toBe(containerFiles);
      // Report (not assert) the measured-vs-predicted coverage floor comparison via a
      // console note so a test run's output carries the "measure before predict" numbers.
      const floor = PREDICTED_FLOOR[key]!;
      // eslint-disable-next-line no-console
      console.log(
        `[R6 census] ${key}: containerFiles=${containerFiles} imgFiles=${imgFiles} ` +
          `(plan floor >= ${floor}, ${imgFiles >= floor ? 'MET' : 'MISSED'}) ` +
          `emptyFiles=${emptyFiles} throwFiles=${throwFiles} totalFrames=${totalFrames}`,
      );
    });
  });
}

// ---------------------------------------------------------------------------------------
// PoolOfRadiance — the 4th, unported Amiga format. Corrected 3-way sniff breakdown.
// ---------------------------------------------------------------------------------------

const POR_FOLDER = 'PoolOfRadiance';
const POR_ROOT = join(WHDLOAD, POR_FOLDER, 'data');
const havePor = existsSync(POR_ROOT);
const maybePor = havePor ? describe : describe.skip;

interface PorExpected {
  /** Round-31 false-positive classification off the unchanged sniffDaa/sniffDax — kept as a
   *  historical record, not a claim about decodeAsset's outcome (see the docblock above). */
  legacySniff: 'daa' | 'dax' | 'none';
  /** decodePoolAmiga's block count for this file (sums to 843 across the corpus). */
  blocks: number;
  /** frameSet.frames.size: distinct block ids carrying a decoded image (0 for pure-data files). */
  frameSetSize: number;
  /** Block-kind histogram from decodePoolAmiga ('standard' | 'animated' | 'data'). */
  kinds: Record<string, number>;
}

// AUTO-DERIVED (measured 2026-09-03, PLAN-ROUND-32.md R3): `legacySniff` is unchanged from the
// round-31 measurement (calling sniffHlib/sniffGlib/sniffIlbm/sniffDaa/sniffDax directly); the
// blocks/frameSetSize/kinds columns are new, from calling `decodeAsset` after this round wired
// `poolAmiga.ts` into it (see packages/engine/src/loaders/poolAmiga.ts and its golden-fixture
// twin `tools/pool_amiga_golden.py`, which is the 843/843 byte-identity proof this table doesn't
// re-derive).
const POR_EXPECTED: Record<string, PorExpected> = {
  '8x8d.dax': { legacySniff: 'daa', blocks: 23, frameSetSize: 23, kinds: { standard: 23 } },
  'bacpac.dax': { legacySniff: 'none', blocks: 1, frameSetSize: 1, kinds: { standard: 1 } },
  'body.dax': { legacySniff: 'none', blocks: 21, frameSetSize: 21, kinds: { standard: 21 } },
  'cbody.dax': { legacySniff: 'daa', blocks: 128, frameSetSize: 128, kinds: { standard: 128 } },
  'chead.dax': { legacySniff: 'none', blocks: 28, frameSetSize: 28, kinds: { standard: 28 } },
  'comspr.dax': { legacySniff: 'none', blocks: 25, frameSetSize: 25, kinds: { standard: 25 } },
  'cpic.dax': { legacySniff: 'none', blocks: 118, frameSetSize: 118, kinds: { standard: 118 } },
  'dungcom.dax': { legacySniff: 'none', blocks: 1, frameSetSize: 1, kinds: { standard: 1 } },
  'ecl.dax': { legacySniff: 'daa', blocks: 29, frameSetSize: 0, kinds: { data: 29 } },
  'final.dax': { legacySniff: 'none', blocks: 3, frameSetSize: 3, kinds: { animated: 3 } },
  'geo.dax': { legacySniff: 'daa', blocks: 29, frameSetSize: 0, kinds: { data: 29 } },
  'head.dax': { legacySniff: 'none', blocks: 39, frameSetSize: 39, kinds: { standard: 39 } },
  'icon.dax': { legacySniff: 'none', blocks: 6, frameSetSize: 6, kinds: { standard: 6 } },
  'item.dax': { legacySniff: 'dax', blocks: 42, frameSetSize: 0, kinds: { data: 42 } },
  'moncha.dax': { legacySniff: 'daa', blocks: 116, frameSetSize: 0, kinds: { data: 116 } },
  'monitm.dax': { legacySniff: 'daa', blocks: 65, frameSetSize: 0, kinds: { data: 65 } },
  'monspc.dax': { legacySniff: 'none', blocks: 34, frameSetSize: 0, kinds: { data: 34 } },
  'pic.dax': { legacySniff: 'daa', blocks: 59, frameSetSize: 59, kinds: { animated: 59 } },
  'randcom.dax': { legacySniff: 'none', blocks: 1, frameSetSize: 1, kinds: { standard: 1 } },
  'sprit.dax': { legacySniff: 'none', blocks: 55, frameSetSize: 55, kinds: { animated: 55 } },
  'sqrpaci.dax': { legacySniff: 'daa', blocks: 2, frameSetSize: 2, kinds: { standard: 2 } },
  'walldef.dax': { legacySniff: 'daa', blocks: 17, frameSetSize: 0, kinds: { data: 17 } },
  'wildcom.dax': { legacySniff: 'none', blocks: 1, frameSetSize: 1, kinds: { standard: 1 } },
};

maybePor('Amiga Pool of Radiance census — R3 wired the 4th format into decodeAsset', () => {
  it('has exactly 23 .dax container files, matching the pinned list', () => {
    const files = readdirSync(POR_ROOT)
      .filter((f) => /\.dax$/i.test(f))
      .sort();
    expect(files).toEqual(Object.keys(POR_EXPECTED).sort());
    expect(files.length).toBe(23);
  });

  it(
    'every file now decodes to format "pool-amiga" via decodeAsset, including the 10 that ' +
      'used to be DAA/DAX false positives (9 daa + 1 dax) — 843 blocks total, against the ' +
      'null of the round-31 state where all 23 threw',
    () => {
      let legacyDaaCount = 0;
      let legacyDaxCount = 0;
      let legacyNoneCount = 0;
      let totalBlocks = 0;
      for (const [name, exp] of Object.entries(POR_EXPECTED)) {
        const bytes = new Uint8Array(readFileSync(join(POR_ROOT, name)));
        const flags = {
          hlib: sniffHlib(bytes),
          glib: sniffGlib(bytes),
          ilbm: sniffIlbm(bytes),
          daa: sniffDaa(bytes),
          dax: sniffDax(bytes),
          poolAmiga: sniffPoolAmiga(bytes),
        };
        expect(flags.hlib, `${name} must not sniff hlib`).toBe(false);
        expect(flags.glib, `${name} must not sniff glib`).toBe(false);
        expect(flags.ilbm, `${name} must not sniff ilbm`).toBe(false);
        expect(flags.poolAmiga, `${name} must sniff pool-amiga`).toBe(true);
        // The legacy DAA/DAX sniff flags are UNCHANGED (neither sniffer was touched this
        // round) — kept as the historical record of why the round-31 throws happened.
        if (exp.legacySniff === 'daa') {
          expect(flags.daa, `${name} expected legacy sniff daa`).toBe(true);
          expect(flags.dax, `${name} must not also sniff dax`).toBe(false);
          legacyDaaCount++;
        } else if (exp.legacySniff === 'dax') {
          expect(flags.daa, `${name} must not sniff daa`).toBe(false);
          expect(flags.dax, `${name} expected legacy sniff dax`).toBe(true);
          legacyDaxCount++;
        } else {
          expect(flags.daa, `${name} must not sniff daa`).toBe(false);
          expect(flags.dax, `${name} must not sniff dax`).toBe(false);
          legacyNoneCount++;
        }

        // decodeAsset must now SUCCEED (the round-31 pin was that every one of these threw).
        const decoded = decodeAsset(bytes, name);
        expect(decoded.format, `${name} format`).toBe('pool-amiga');
        if (decoded.format !== 'pool-amiga') continue; // narrows for TS below
        expect(decoded.archive.blocks.length, `${name} block count`).toBe(exp.blocks);
        expect(decoded.archive.frameSet.frames.size, `${name} frameSet size`).toBe(exp.frameSetSize);
        const kinds = decoded.archive.blocks.reduce<Record<string, number>>((acc, b) => {
          acc[b.kind] = (acc[b.kind] ?? 0) + 1;
          return acc;
        }, {});
        expect(kinds, `${name} kind histogram`).toEqual(exp.kinds);
        totalBlocks += decoded.archive.blocks.length;
      }
      // Same 9/1/13 split as round 31 (the sniffers didn't change) — kept as a pin so a
      // future change to sniffDaa/sniffDax that shifts this split is a visible signal here.
      expect(legacyDaaCount).toBe(9);
      expect(legacyDaxCount).toBe(1);
      expect(legacyNoneCount).toBe(13);
      expect(legacyDaaCount + legacyDaxCount + legacyNoneCount).toBe(23);
      // 843/843 — the same count `tools/pool_amiga_golden.py` and `poolAmiga.test.ts` pin
      // against the Python oracle; this measurement is independent (it walks decodeAsset's
      // dispatch, not the golden fixture) and agrees.
      expect(totalBlocks).toBe(843);
    },
  );
});

// ---------------------------------------------------------------------------------------
// Mutation/null: format detection must read BYTES, not extensions or folder names — feed
// a real DOS HLIB `.TLB` in under an Amiga-set label and it must still sniff hlib (and
// fail the DAA/GLIB pins above), never glib.
// ---------------------------------------------------------------------------------------

const DOS_DQK_TLB = 'C:/Modding/GoldBox/The Dark Queen of Krynn/DISK1/ALWAYS.TLB';
const haveDosHlibSample = existsSync(DOS_DQK_TLB);
const maybeMutation = haveDosHlibSample ? describe : describe.skip;

maybeMutation('mutation: a DOS HLIB file mislabeled as Amiga must sniff by bytes, not name', () => {
  it('sniffs hlib=true, glib=false, daa=false regardless of an Amiga-style hint name', () => {
    const bytes = new Uint8Array(readFileSync(DOS_DQK_TLB));
    expect(sniffHlib(bytes)).toBe(true);
    expect(sniffGlib(bytes)).toBe(false);
    expect(sniffDaa(bytes)).toBe(false);
    // decodeAsset must resolve it as hlib even when the hint name claims to be the
    // Amiga GLIB sibling — proving the dispatch in `decodeAsset` is bytes-first.
    const decoded = decodeAsset(bytes, 'DarkQueenOfKrynn/data/Disk1/ALWAYS.TLB');
    expect(decoded.format).toBe('hlib');
  });
});
