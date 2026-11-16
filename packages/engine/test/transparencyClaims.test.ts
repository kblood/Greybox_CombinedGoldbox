/**
 * Corpus-wide guard: a decoder that DECLARES a transparent index must actually EMIT it.
 *
 * `IndexedImage.transparentIndex` is a field that makes a claim about a sibling field
 * (`indices`). Nothing checked the claim, and on 2026-08-24 that let HLIB drawing method 17
 * ship for months announcing `transparentIndex: 255` over a buffer that contained no 255 at
 * all — it read the pixel plane and threw the AND mask away, so 8284 of the family's 13560
 * pixels rendered as opaque black around every sprite. Every per-format golden test passed
 * throughout, because each one compares our indices against our own reference decoder.
 *
 * This test asks the one question those tests structurally cannot: run every container we
 * hold through `decodeAsset`, group the results by `encoding`, and require that each family
 * claiming a key colour produces it somewhere. ⚠ 2026-08-25: as first written it read
 * `archive.images`, a field only HLIB and GLIB have, so DAX, DAA and ILBM contributed nothing
 * while the pinned family list still read like coverage — the exact failure this file exists to
 * catch, committed inside the fix for it. `imagesOf()` below now enumerates per format. An individual sprite may legitimately be fully
 * opaque; a whole family never is. That is the resolution at which the method-17 bug is
 * visible (0 of 34) and at which ordinary opaque art is not (31 of 34 today).
 *
 * Sources are the user's read-only installs (GOG DOS + the Amiga WHDLoad pack) — absent
 * source => SKIP, like every other corpus suite here.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { decodeAsset } from '../src/index.js';

const BSLASH = String.fromCharCode(92);
const norm = (p: string) => p.split(BSLASH).join('/');
const REPO = norm(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'));

const GOG = 'C:/Program Files (x86)/GOG Galaxy/Games';
/** DOS roots: stable, and the ones the HLIB and DAX families come from. */
const DOS_ROOTS = [
  `${GOG}/The Dark Queen of Krynn`,
  `${GOG}/Unlimited Adventures`,
  `${REPO}/Champions of Krynn`,
  `${REPO}/Death Knights of Krynn`,
  `${REPO}/The Dark Queen of Krynn`,
];
/** Amiga GLIB roots, named explicitly: the WHDLoad pack also holds unrelated games. */
const WHD =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked';
const AMIGA_TITLES = [
  'ChampionsOfKrynn',
  'CurseOfTheAzureBonds',
  'DarkQueenOfKrynn',
  'DeathKnightsOfKrynn',
  'GatewayToSavageFrontier',
  'PoolOfRadiance',
  'PoolsOfDarkness',
  'SecretOfTheSilverBlades',
  'TreasuresOfSavageFrontier',
  'BuckRogersCountdownDday',
];

interface FamilyStat {
  /** Images decoded in this family. */
  images: number;
  /** Images whose `transparentIndex` is non-null. */
  declaring: number;
  /** Of those, how many actually contain that index. */
  realising: number;
  /** Every distinct value the family reports (-1 stands for null). */
  claims: Set<number>;
}

/**
 * Every archive type keeps its images somewhere different, and only HLIB and GLIB call the field
 * `images`. Reading `archive.images` alone — as this file did when it was written — silently
 * contributes ZERO rows for DAX, DAA and ILBM while the pinned family list still reads like
 * coverage. That is the same "announces more than it establishes" shape the test exists to catch,
 * so it is spelled out per format here rather than duck-typed.
 */
interface ImageLike {
  indices?: Uint8Array;
  encoding?: string;
  transparentIndex?: number | null;
}
interface DecodedAssetShape {
  format: string;
  archive?: {
    images?: { image: ImageLike }[];
    blocks?: { image?: ImageLike | null; frames?: ImageLike[] }[];
    subFrames?: { frames?: ImageLike[] }[];
  };
  image?: { image?: ImageLike } & ImageLike;
}

function imagesOf(decoded: DecodedAssetShape): ImageLike[] {
  switch (decoded.format) {
    case 'hlib':
    case 'glib':
      return (decoded.archive?.images ?? []).map((m) => m.image);
    case 'dax':
    case 'daa': {
      const out: ImageLike[] = [];
      for (const b of decoded.archive?.blocks ?? []) {
        if (b.frames?.length) out.push(...b.frames);
        else if (b.image) out.push(b.image);
      }
      // DAA sub-frame archives (SPRIT/PIC/HEAD) keep every distance frame here and nowhere else.
      for (const sf of decoded.archive?.subFrames ?? []) out.push(...(sf.frames ?? []));
      return out;
    }
    case 'ilbm':
      // IlbmImage WRAPS an IndexedImage; the outer object has no `indices` of its own.
      return decoded.image?.image ? [decoded.image.image] : [];
    default:
      return [];
  }
}

function tabulate(roots: string[]): Map<string, FamilyStat> {
  const files: string[] = [];
  const walkDir = (d: string, depth: number) => {
    if (depth > 6) return;
    let ents;
    try {
      ents = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const full = norm(resolve(d, e.name));
      if (e.isDirectory()) walkDir(full, depth + 1);
      else if (/\.(TLB|GLB|DAX|DAA|LBM)$/i.test(e.name)) files.push(full);
    }
  };
  for (const r of roots) if (existsSync(r)) walkDir(r, 0);

  const tab = new Map<string, FamilyStat>();
  // The same art ships in several titles; dedupe by name+size so one picture is not
  // counted three times and a single outlier cannot be diluted away.
  const seen = new Set<string>();
  for (const f of files) {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(f));
    } catch {
      continue;
    }
    const key = `${f.slice(f.lastIndexOf('/') + 1).toUpperCase()}:${bytes.byteLength}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let decoded: DecodedAssetShape;
    try {
      decoded = decodeAsset(bytes, f) as DecodedAssetShape;
    } catch {
      continue; // not a container we claim to read; container coverage is other suites' job
    }
    for (const img of imagesOf(decoded)) {
      if (!img?.indices) continue;
      const enc = img.encoding ?? 'unknown';
      let st = tab.get(enc);
      if (!st) {
        st = { images: 0, declaring: 0, realising: 0, claims: new Set() };
        tab.set(enc, st);
      }
      st.images++;
      const ti = img.transparentIndex ?? null;
      st.claims.add(ti === null ? -1 : ti);
      if (ti === null) continue;
      st.declaring++;
      if (img.indices.includes(ti)) st.realising++;
    }
  }
  return tab;
}

const haveDos = DOS_ROOTS.every((r) => existsSync(r));
const haveAmiga = existsSync(WHD) && AMIGA_TITLES.every((t) => existsSync(`${WHD}/${t}`));

describe('transparency claims are backed by the pixels', () => {
  it.skipIf(!haveDos)(
    'every DOS family that claims a key colour emits it',
    () => {
      const tab = tabulate(DOS_ROOTS);

      // The families the DOS corpus actually produces. Pinned, so a loader that silently stops
      // emitting one shows up here rather than passing by having nothing left to check — and so
      // that a regression to `archive.images` (which would drop the dax-* and ilbm rows again)
      // fails loudly instead of quietly shrinking the corpus.
      expect([...tab.keys()].sort()).toEqual([
        'dax-animated',
        'dax-frame',
        'dax-tile-strip',
        'dax-tileset',
        'hlib-method16',
        'hlib-method17',
        'hlib-method18',
        'hlib-method21',
        'hlib-method23',
        'ilbm',
      ]);

      for (const [enc, st] of tab) {
        if (!st.declaring) continue;
        expect(`${enc}:${st.realising > 0}`).toBe(`${enc}:true`);
      }

      // Exact per-family counts. `declaring === images` for the transparent-class methods and
      // 0 for the opaque ones, which is the other half of the claim: 16 and 18 must NOT key.
      // Both halves are now read off DQK.EXE's blitters — see `docs/hlib-format.md` §5d.
      const rows = [...tab.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(
          ([e, s]) =>
            `${e} ${s.images} ${s.declaring} ${s.realising} [${[...s.claims]
              .sort((x, y) => x - y)
              .join(',')}]`,
        );
      expect(rows).toEqual([
        'dax-animated 373 0 0 [-1]',
        'dax-frame 557 0 0 [-1]',
        'dax-tile-strip 7 0 0 [-1]',
        'dax-tileset 1935 0 0 [-1]',
        'hlib-method16 699 0 0 [-1]',
        // The bug: this line read `34 34 0` before the AND mask was applied.
        'hlib-method17 34 34 31 [255]',
        'hlib-method18 262 0 0 [-1]',
        'hlib-method21 2324 2324 2183 [255]',
        'hlib-method23 371 371 371 [255]',
        'ilbm 5 0 0 [-1]',
      ]);
    },
    300000,
  );

  it.skipIf(!haveAmiga)(
    'every Amiga GLIB family that claims a key colour emits it',
    () => {
      const tab = tabulate(AMIGA_TITLES.map((t) => `${WHD}/${t}`));
      expect([...tab.keys()].some((k) => k.startsWith('glib-method'))).toBe(true);
      // The Amiga tree is not GLIB-only: Champions ships an `8X8D1.DAX` next to its `.DAA`s and
      // Buck Rogers is `.dax` throughout, so this arm exercises three container families.
      expect([...tab.keys()].some((k) => k.startsWith('daa-'))).toBe(true);
      expect([...tab.keys()].some((k) => k.startsWith('dax-'))).toBe(true);

      for (const [enc, st] of tab) {
        if (!st.declaring) continue;
        expect(`${enc}:${st.realising > 0}`).toBe(`${enc}:true`);
      }

      // The masked GLIB methods are 1/3 and their 0xEx aliases 225/227; everything else is
      // opaque. Pinned as name + claim only: which titles are installed can vary, the
      // transparency contract cannot.
      const claims = [...tab.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([e, s]) => `${e} [${[...s.claims].sort((x, y) => x - y).join(',')}]`);
      expect(claims).toEqual([
        'daa-planar5 [-1]',
        'daa-subframe [-1]',
        // The one non-GLIB family that keys a colour: Amiga 8X8D tiles key magenta 13, and they
        // realise it in 937 of 2476 images — the invariant holds, so this widening found no new
        // bug, only coverage.
        'daa-tile4 [13]',
        'dax-tileset [-1]',
        'glib-method0 [-1]',
        'glib-method1 [255]',
        'glib-method2 [-1]',
        'glib-method210 [-1]',
        'glib-method224 [-1]',
        'glib-method225 [255]',
        'glib-method226 [-1]',
        'glib-method227 [255]',
        'glib-method3 [255]',
        'ilbm [-1]',
      ]);
    },
    300000,
  );
});
