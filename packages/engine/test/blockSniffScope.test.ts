/**
 * The block-level sniffers, swept over every DAX/DAA block we hold.
 *
 * The container-level sweep of 2026-08-25 found one rubber stamp (`sniffInstrAd`). This is the
 * same question one level down: `readDaxDataBlocks` hands back decompressed blocks with no type
 * tag, and several sniffers decide what a block *is* from its length alone. `sniffGeoBlock` is
 * literally `raw.length === 1026`, and it is load-bearing — `gen1AreaIndex.ts` and
 * `buildDqkGame.ts` use it to decide which areas are playable and what gets ported into a DQK
 * build. A length-only test that is wrong there silently changes the area list.
 *
 * Swept across the ten GOG DOS installs and four Amiga titles — 6347 blocks:
 *
 * | sniffer | claims | where |
 * | --- | --- | --- |
 * | `sniffGeoBlock` | 231 | all in `GEO*.DAX` |
 * | `sniffGen1EclBlock` | 307 | all in `ECL*.DAX` |
 * | `sniffWalldef` | 164 | 163 in `WALLDEF*.DAX`, **1 in Treasures' `PIC1.DAX`** |
 *
 * So the length-only GEO test is exact on everything we hold, and the reason is measurable rather
 * than lucky: block sizes anywhere near 1026 simply do not occur. Of 6347 blocks, the sizes
 * 1020/1022/1024/1025/1027/1028/1030 are each used by **zero** blocks. That neighbourhood count is
 * the null — without it, "231 claims, all correct" would say nothing about how close the corpus
 * comes to fooling it.
 *
 * `sniffWalldef` has exactly one false positive and is left alone deliberately, because three
 * candidate content checks were measured and all three are REFUTED by the genuine blocks:
 *
 * - "entries in the reserved range 0x02..0x2C are unused" — **all 163** genuine blocks contain
 *   such bytes, 16 to 1162 of them each.
 * - "0xFF never appears in a tile table" — 28 of 163 genuine blocks contain one.
 * - "a block holds at most 2 records" — genuine blocks hold 1, 2 or 3 (95/25/43), and the
 *   impostor holds 10; a bound drawn to separate 3 from 10 is fitted to a single file.
 *
 * Nothing consumes `sniffWalldef` — it is exported from `index.ts` and called nowhere else — so
 * the false positive has no symptom today. That is exactly the state `sniffInstrAd` was in, so the
 * count is pinned here rather than left to be rediscovered.
 *
 * Sources are the user's read-only installs — absent source => SKIP.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { readDaxDataBlocks } from '../src/loaders/dax.js';
import { sniffDokJnkRecord, sniffDokSavedCharacter } from '../src/loaders/dokSavedCharacter.js';
import { sniffGen1EclBlock } from '../src/loaders/eclEncode.js';
import { GEO_BLOCK_SIZE, sniffGeoBlock } from '../src/loaders/geo.js';
import { sniffDokItemRecord, sniffItemRecord } from '../src/loaders/item.js';
import { sniffMonsterRecord } from '../src/loaders/monster.js';
import { sniffSavedCharacter } from '../src/loaders/savedCharacter.js';
import { decode8x8dBlock, sniff8x8dBlock, sniff8x8dPlanar5Block } from '../src/loaders/tiles8x8.js';
import { WALLDEF_RECORD_SIZE, sniffWalldef } from '../src/loaders/walldef.js';

const BS = String.fromCharCode(92);
const norm = (p: string) => p.split(BS).join('/');
const GOG = 'C:/Program Files (x86)/GOG Galaxy/Games';
const WHD =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked';
const ROOTS = [
  ...[
    'Champions of Krynn',
    'Death Knights of Krynn',
    'The Dark Queen of Krynn',
    'Pool of Radiance',
    'Curse of the Azure Bonds',
    'Secret of the Silver Blades',
    'Pools of Darkness',
    'Gateway to the Savage Frontier',
    'Treasures of the Savage Frontier',
    'Unlimited Adventures',
  ].map((t) => `${GOG}/${t}`),
  ...['ChampionsOfKrynn', 'DeathKnightsOfKrynn', 'PoolOfRadiance', 'BuckRogersCountdownDday'].map(
    (t) => `${WHD}/${t}`,
  ),
];
const have = ROOTS.every((r) => existsSync(r));

interface Block {
  /** Uppercased basename, e.g. `WALLDEF1.DAX`. */
  file: string;
  /** Digits collapsed, e.g. `WALLDEF#.DAX` — the archive family. */
  family: string;
  blockId: number;
  raw: Uint8Array;
}

function allBlocks(): Block[] {
  const files: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 6) return;
    let ents;
    try {
      ents = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const full = norm(resolve(d, e.name));
      if (e.isDirectory()) walk(full, depth + 1);
      else if (/\.(DAX|DAA)$/i.test(e.name)) files.push(full);
    }
  };
  for (const r of ROOTS) walk(r, 0);

  const out: Block[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(readFileSync(f));
    } catch {
      continue;
    }
    const file = f.slice(f.lastIndexOf('/') + 1).toUpperCase();
    const key = `${file}:${bytes.byteLength}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let blocks;
    try {
      blocks = readDaxDataBlocks(bytes);
    } catch {
      continue; // not a container this loader reads; that is other suites' subject
    }
    for (const b of blocks) {
      out.push({ file, family: file.replace(/[0-9]+/g, '#'), blockId: b.blockId, raw: b.raw });
    }
  }
  return out;
}

/** `family -> count` for the blocks a sniffer claims, sorted biggest first. */
function claimsByFamily(blocks: Block[], sniff: (r: Uint8Array) => boolean): [string, number][] {
  const m = new Map<string, number>();
  for (const b of blocks) if (sniff(b.raw)) m.set(b.family, (m.get(b.family) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

describe.skipIf(!have)('block-level sniffer scope', () => {
  it(
    'GEO, ECL and WALLDEF claim only their own archives — except one WALLDEF block',
    () => {
      const blocks = allBlocks();
      expect(blocks.length).toBe(6347);

      // A magic-word sniffer. Included as the positive control for the sweep itself: if the
      // family attribution were broken, this row would not come out clean either.
      expect(claimsByFamily(blocks, sniffGen1EclBlock)).toEqual([['ECL#.DAX', 307]]);

      // Length-only, and load-bearing for the playable-area list.
      expect(claimsByFamily(blocks, sniffGeoBlock)).toEqual([['GEO#.DAX', 231]]);

      // Length-multiple-only, and the one that is not clean.
      expect(claimsByFamily(blocks, sniffWalldef)).toEqual([
        ['WALLDEF#.DAX', 160],
        ['WALLDEF.DAX', 3],
        ['PIC#.DAX', 1],
      ]);
      const stray = blocks.filter((b) => sniffWalldef(b.raw) && b.family === 'PIC#.DAX');
      expect(stray.length).toBe(1);
      expect(`${stray[0]!.file}#${stray[0]!.blockId}@${stray[0]!.raw.length}`).toBe(
        'PIC1.DAX#50@7800',
      );
      expect(stray[0]!.raw.length % WALLDEF_RECORD_SIZE).toBe(0);
    },
    300000,
  );

  it(
    'the null for GEO: no block in the corpus comes near 1026 bytes',
    () => {
      const blocks = allBlocks();
      const sizes = new Map<number, number>();
      for (const b of blocks) sizes.set(b.raw.length, (sizes.get(b.raw.length) ?? 0) + 1);
      expect(GEO_BLOCK_SIZE).toBe(1026);
      expect(sizes.get(1026)).toBe(231);
      // The whole neighbourhood is empty, which is what makes a length-only test safe here.
      // If a nearby size were populated, "231 claims, all in GEO*.DAX" would be luck.
      for (const s of [1020, 1022, 1024, 1025, 1027, 1028, 1030]) {
        expect(`${s}:${sizes.get(s) ?? 0}`).toBe(`${s}:0`);
      }
      expect(sizes.get(1032)).toBe(1); // the nearest populated size at all
    },
    300000,
  );

  it(
    'three content checks that would have tightened WALLDEF are refuted by the real blocks',
    () => {
      // Recorded so they are not proposed again. Each looks obvious from `walldef.ts`'s own
      // docblock; each is contradicted by the archives it describes.
      const blocks = allBlocks();
      const genuine = blocks.filter((b) => sniffWalldef(b.raw) && b.family.startsWith('WALLDEF'));
      expect(genuine.length).toBe(163);

      const reservedCount = (r: Uint8Array) => {
        let n = 0;
        for (const v of r) if (v >= 0x02 && v < 0x2d) n++;
        return n;
      };
      // "Entries 0x02..0x2C are reserved, so they never occur." Every genuine block has them.
      const withReserved = genuine.filter((b) => reservedCount(b.raw) > 0);
      expect(withReserved.length).toBe(163);
      const counts = genuine.map((b) => reservedCount(b.raw));
      expect(Math.min(...counts)).toBe(16);
      expect(Math.max(...counts)).toBe(1162);

      // "0xFF is not a tile id." 28 genuine blocks contain one.
      const maxByte = (r: Uint8Array) => r.reduce((m, v) => (v > m ? v : m), 0);
      expect(genuine.filter((b) => maxByte(b.raw) === 255).length).toBe(28);

      // "A block holds one or two records." Genuine blocks hold 1, 2 or 3.
      const recordCounts = new Map<number, number>();
      for (const b of genuine) {
        const n = b.raw.length / WALLDEF_RECORD_SIZE;
        recordCounts.set(n, (recordCounts.get(n) ?? 0) + 1);
      }
      expect([...recordCounts.entries()].sort((a, b) => a[0] - b[0])).toEqual([
        [1, 95],
        [2, 25],
        [3, 43],
      ]);
    },
    300000,
  );

  it(
    'the record-level sniffers claim their own families, with two adjudicated strays',
    () => {
      const blocks = allBlocks();

      // Tile banks. `CURSOR.DAX#1` is NOT a false positive: it is 49 bytes = a 1-byte header plus
      // one 48-nibble 8x8 tile, and `decode8x8dBlock` returns exactly one coherent tile for it.
      // A cursor being stored in the same nibble-planar form as a tile bank is the right answer.
      expect(claimsByFamily(blocks, sniff8x8dBlock)).toEqual([
        ['#X#D#.DAX', 163],
        ['#X#D.DAX', 3],
        ['CURSOR.DAX', 1],
      ]);
      const cursor = blocks.filter((b) => b.file === 'CURSOR.DAX' && sniff8x8dBlock(b.raw));
      expect(cursor.length).toBe(1);
      expect(cursor[0]!.raw.length).toBe(49);
      expect(decode8x8dBlock(cursor[0]!.raw, 'CURSOR.DAX').tiles.length).toBe(1);

      expect(claimsByFamily(blocks, sniff8x8dPlanar5Block)).toEqual([
        ['#X#D#.DAX', 18],
        ['#X#D.DAX', 2],
      ]);

      // Monster records. Before the 2026-08-25 name check this read 927 across 4 families -- the
      // extra 14 were Pools of Darkness `CHEAD.DAX` ids 0..13, which are 422 bytes of portrait.
      expect(claimsByFamily(blocks, (r) => sniffMonsterRecord(r))).toEqual([
        ['MON#CHA.DAX', 912],
        ['LUCK.DAX', 1],
      ]);
      const luck = blocks.filter((b) => b.file === 'LUCK.DAX' && sniffMonsterRecord(b.raw));
      expect(`${luck[0]!.file}#${luck[0]!.blockId}@${luck[0]!.raw.length}`).toBe(
        'LUCK.DAX#104@422',
      );

      // Saved-character sniffers land only on monster archives, which is the already-documented
      // identity -- CoK's 409-byte `CHRDATA{n}.SAV` and DoK's 216-byte `CHRDATA{n}.GAM` are the
      // same record shape as a monster. Not a defect; pinned so it is not read as one later.
      expect(claimsByFamily(blocks, sniffSavedCharacter)).toEqual([['MON#CHA.DAX', 165]]);
      expect(claimsByFamily(blocks, sniffDokSavedCharacter)).toEqual([['MON#CHA.DAX', 128]]);
    },
    300000,
  );

  it(
    'the null for the monster name check: it is about the first byte, not about spaces',
    () => {
      // `LUCK.DAX#104` survives because its name `" t"` is printable and has a letter. The rule
      // that would kill it is "a name does not begin with a space" -- declined in `monster.ts`
      // because one file is its whole justification. These are the numbers behind that call: the
      // corpus does not refute it, but note the second figure. A naive "names contain no spaces"
      // would throw away more than half the real records, so the rule has to be narrower than it
      // first looks, and a rule that narrow supported by exactly one exclusion is a fit.
      const blocks = allBlocks();
      const names = blocks.filter((b) => b.family === 'MON#CHA.DAX' && sniffMonsterRecord(b.raw));
      expect(names.length).toBe(912);
      expect(names.filter((b) => b.raw[1] === 0x20).length).toBe(0);
      expect(names.filter((b) => b.raw.slice(1, 1 + b.raw[0]!).includes(0x20)).length).toBe(481);
      // And no genuine name is short enough for the residual's 2-byte length to look normal.
      expect(Math.min(...names.map((b) => b.raw[0]!))).toBe(3);
    },
    300000,
  );

  it(
    'the item and JNK sniffers are record-level and are not block-level tests',
    () => {
      // These three take a *record* sliced out of a block, not a block. Pinned here because the
      // numbers make that unmistakable: applied to whole blocks they claim most of the corpus,
      // including tile banks, portraits, wall tables and ECL scripts. Anyone reaching for one of
      // them the way `sniffGeoBlock` is used would be routing graphics into the item decoder.
      const blocks = allBlocks();
      const total = (sniff: (r: Uint8Array) => boolean) =>
        claimsByFamily(blocks, sniff).reduce((a, r) => a + r[1], 0);
      const families = (sniff: (r: Uint8Array) => boolean) => claimsByFamily(blocks, sniff).length;

      expect([total(sniffDokJnkRecord), families(sniffDokJnkRecord)]).toEqual([4530, 36]);
      expect([total(sniffItemRecord), families(sniffItemRecord)]).toEqual([4079, 33]);
      expect([total(sniffDokItemRecord), families(sniffDokItemRecord)]).toEqual([1330, 25]);

      // The control: the biggest claimant of all three is not an item archive.
      expect(claimsByFamily(blocks, sniffItemRecord)[0]).toEqual(['CPIC#.DAX', 1016]);
      expect(claimsByFamily(blocks, sniffDokItemRecord)[0]).toEqual(['PIC#.DAX', 354]);
    },
    300000,
  );
});
