/**
 * Gateway to the Savage Frontier — Amiga GLIB wall art over DOS wall geometry.
 *
 * The second GLIB/DataLib-era title measured for the in-dungeon art toggle, after Pools of Darkness
 * (`poolsAmigaWallArt.test.ts`). Pools passed cleanly and its whole master was declared usable.
 * Gateway very nearly does: 25 of the 26 Amiga banks that have a DOS counterpart are faithful
 * slot-for-slot stand-ins, and exactly one (block 15) is not. Both halves are asserted, because the
 * failing half is what stops a wrong art source from shipping — and because block 15 is loaded by
 * the campaign areas, it is the reason the toggle lives where it does.
 *
 * What holds (and licenses the toggle on areas that only use the good banks):
 *   A. 13 of the Amiga `WallDef.glb` records are BYTE-IDENTICAL to the DOS `WALLDEF*.DAX` blocks of
 *      the same id, so both platforms' geometry names the same tile NUMBERS.
 *   B. The master's id table names DOS 8X8D block ids, and it is the right mapping — proven by
 *      idiosyncratic per-bank padding counts agreeing exactly (block 51 pads 33 of 70 slots on both
 *      sides, 53 pads 39, 55 pads 28, 57 pads 23, 59 pads 50, 61 pads 21), which a wrong pairing
 *      could not reproduce, plus tiles that survived the port byte-identically landing at the SAME
 *      index.
 *   C. Alignment is shift 0: the surviving identical tiles match at offset 0 and NOTHING matches at
 *      +/-1. That is what rules out an off-by-one, which byte-identical WALLDEF alone would not.
 *   D. Over the whole of GEO2#2 with the route's real piece set, DOS and Amiga agree on every
 *      padding/painted decision, while every single painted tile differs — a complete art redraw.
 *
 * What does NOT hold, asserted as a negative so it cannot silently regress:
 *   E. Block 15's Amiga bank carries real art in slots 186-189, which the DOS bank pads flat.
 *      Swapping it paints wall where the DOS build paints none. `bankSwapParity` rejects it, and
 *      since `ECL5#19`'s `LOAD_PIECES (7,15,30)` mounts it, the campaign areas stay on DOS art.
 *
 * A NOTE ON MEASURING "empty", because getting it wrong is what made the first pass of this file
 * wrong: the two platforms do not share a transparency convention (DOS banks report
 * `transparentIndex` null unless `transparentMagenta` is passed — the Pools/Treasures VGA chunky
 * banks answered 13 regardless until 2026-08-25 — while every Amiga GLIB bank reports 255, always
 * and unconditionally). Judging emptiness by
 * "index 0 or transparentIndex" therefore compares a different predicate on each side; it invented
 * a mismatch on Pools and turned Gateway's real 4-slot disagreement into an apparent 45-72 across
 * four banks. Flatness — every pixel the same index — is a property of the pixels alone and is what
 * both this file and `bankSwapParity` use. Gateway's DOS banks pad with index 0 and its Amiga banks
 * with index 19, and `Always.tlb` resolves 19 to #000000, so the two pads render the same pixel.
 *
 * Retail bytes come from the local installs; the suite skips when either is absent, since neither
 * the GOG install nor the Amiga WHDLoad set is vendored.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { decodeDax, readDaxDataBlocks } from '../src/loaders/dax.js';
import { decodeGeoBlock } from '../src/loaders/geo.js';
import { decodeGlib, firstGlibPalette, glibIdTable } from '../src/loaders/glib.js';
import { bankSwapParity, glibTileBanks, readGlibIdTable } from '../src/loaders/glibTileBank.js';
import { decode8x8dBlock } from '../src/loaders/tiles8x8.js';
import { loadDungeonWalls } from '../src/world/dungeonWalls.js';
import { composeWallView } from '../src/world/wallview.js';
import type { IndexedImage, TileSet } from '../src/model/index.js';

const DOS = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const AMIGA =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC';
const AMIGA_DISK_A =
  'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA';

const have = existsSync(`${DOS}/WALLDEF.DAX`) && existsSync(`${AMIGA}/WallDef.glb`);
const maybe = have ? describe : describe.skip;

const read = (p: string) => new Uint8Array(readFileSync(p));

const DOS_WALLDEFS = ['WALLDEF.DAX', 'WALLDEF2.DAX', 'WALLDEF3.DAX', 'WALLDEF4.DAX', 'WALLDEF5.DAX'];
const DOS_TILE_ARCHIVES = ['8X8D.DAX', '8X8D2.DAX', '8X8D3.DAX', '8X8D4.DAX', '8X8D5.DAX', '8X8D6.DAX'];

/** Every DOS WALLDEF record by block id (ids are duplicated across per-disk archives). */
function dosWalldefs(): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  for (const f of DOS_WALLDEFS) {
    for (const b of decodeDax(read(`${DOS}/${f}`), f).blocks) if (!out.has(b.blockId)) out.set(b.blockId, b.raw);
  }
  return out;
}

/** Every DOS 8X8D bank by block id, decoded through the engine's own tile decoder. */
function dosBanks(): Map<number, TileSet> {
  const out = new Map<number, TileSet>();
  for (const f of DOS_TILE_ARCHIVES) {
    for (const b of decodeDax(read(`${DOS}/${f}`), f).blocks) {
      if (out.has(b.blockId)) continue;
      try {
        out.set(b.blockId, decode8x8dBlock(b.raw, `${f}#${b.blockId}`));
      } catch {
        // 8X8D1.DAX carries font/frame blocks that are not tile banks; not part of this comparison.
      }
    }
  }
  return out;
}

/**
 * Gateway's wall master carries NO colour table (unlike Pools'), so the game palette is sourced
 * from `DiskA/Always.tlb` — the same container CoAB/Secret use for their Amiga palette.
 */
const amigaPalette = () => firstGlibPalette(read(`${AMIGA_DISK_A}/Always.tlb`));

const amigaBanks = () => {
  const bytes = read(`${AMIGA}/Walls.tlb`);
  return glibTileBanks(decodeGlib(bytes, 'Walls.tlb'), glibIdTable(bytes), [], amigaPalette());
};

/** See the header note: transparency-agnostic, because the two platforms disagree on the convention. */
const isFlat = (t: IndexedImage) => {
  const px = t.indices;
  for (let i = 1; i < px.length; i++) if (px[i] !== px[0]) return false;
  return true;
};
const padCount = (tiles: readonly IndexedImage[], upTo = tiles.length) =>
  tiles.slice(0, upTo).filter(isFlat).length;

/** The only bank whose Amiga side is NOT a slot-for-slot stand-in (see E). */
const UNSWAPPABLE = [15];

maybe('Gateway to the Savage Frontier — Amiga GLIB wall art over DOS wall geometry', () => {
  it('A. the Amiga WallDef.glb records are byte-identical to the DOS WALLDEF blocks of the same id', () => {
    const bytes = read(`${AMIGA}/WallDef.glb`);
    const amiga = decodeGlib(bytes, 'WallDef.glb');
    expect(amiga.nonImage).toBe(true);
    expect(amiga.tag).toBe('DATA');

    const idTable = readGlibIdTable(glibIdTable(bytes)!)!;
    const dos = dosWalldefs();

    let identical = 0;
    let noDosBlock = 0;
    for (const [blockId, memberIndex] of idTable) {
      const a = amiga.rawMembers[memberIndex - 1];
      expect(a.length, `amiga walldef ${blockId} length`).toBe(780);
      const d = dos.get(blockId);
      if (!d) {
        // 6 Amiga wall sets have no DOS counterpart in any WALLDEF archive. Recorded, not asserted
        // away: they are simply outside the swap, since nothing on the DOS side indexes them.
        noDosBlock++;
        continue;
      }
      expect(d.length, `dos walldef ${blockId} length`).toBe(780);
      expect(Buffer.from(a).equals(Buffer.from(d)), `walldef ${blockId} bytes`).toBe(true);
      identical++;
    }
    expect(identical).toBe(13);
    expect(noDosBlock).toBe(6);
  });

  it('B. the id table is the RIGHT mapping — idiosyncratic padding counts agree exactly', () => {
    const banks = amigaBanks();
    const dos = dosBanks();
    expect(banks.idTableUsed).toBe(true);

    // Uniform counts (0/70 — most banks pad nothing) would be weak evidence; these are not uniform.
    // A wrong pairing would have to coincidentally match all of them.
    const fingerprints: Array<[number, number]> = [
      [51, 33],
      [53, 39],
      [55, 28],
      [57, 23],
      [59, 50],
      [61, 21],
    ];
    for (const [blockId, expected] of fingerprints) {
      expect(padCount(dos.get(blockId)!.tiles), `dos bank ${blockId} padding`).toBe(expected);
      expect(padCount(banks.banks.get(blockId)!.tiles, 70), `amiga bank ${blockId} padding`).toBe(expected);
    }

    // And the declared pairing is never beaten by another DOS block on surviving identical tiles.
    for (const blockId of [7, 18, 50, 51, 53, 59]) {
      const amiga = banks.banks.get(blockId)!;
      const score = (dosTiles: readonly IndexedImage[]) => {
        let n = 0;
        for (let i = 0; i < Math.min(dosTiles.length, amiga.tiles.length); i++) {
          if (Buffer.from(dosTiles[i].indices).equals(Buffer.from(amiga.tiles[i].indices))) n++;
        }
        return n;
      };
      const declared = score(dos.get(blockId)!.tiles);
      expect(declared, `bank ${blockId} has surviving identical tiles`).toBeGreaterThan(0);
      for (const [otherId, other] of dos) {
        if (otherId === blockId) continue;
        expect(score(other.tiles), `bank ${blockId} beaten by ${otherId}`).toBeLessThanOrEqual(declared);
      }
    }
  });

  it('C. alignment is shift 0 — identical tiles match at offset 0 and nothing matches at +/-1', () => {
    const banks = amigaBanks();
    const dos = dosBanks();
    for (const blockId of [7, 18, 50]) {
      const d = dos.get(blockId)!.tiles;
      const a = banks.banks.get(blockId)!.tiles;
      const matches = (shift: number) => {
        let n = 0;
        for (let i = 0; i < d.length; i++) {
          const j = i + shift;
          if (j < 0 || j >= a.length) continue;
          if (Buffer.from(d[i].indices).equals(Buffer.from(a[j].indices))) n++;
        }
        return n;
      };
      expect(matches(0), `bank ${blockId} shift 0`).toBeGreaterThan(0);
      expect(matches(1), `bank ${blockId} shift +1`).toBe(0);
      expect(matches(-1), `bank ${blockId} shift -1`).toBe(0);
    }
  });

  it('D. GEO2#2 renders identically-placed but completely redrawn walls from the Amiga banks', () => {
    const wd = new Map(decodeDax(read(`${DOS}/WALLDEF2.DAX`), 'WALLDEF2.DAX').blocks.map((b) => [b.blockId, b.raw]));
    const tiles = new Map(decodeDax(read(`${DOS}/8X8D2.DAX`), '8X8D2.DAX').blocks.map((b) => [b.blockId, b.raw]));
    const banks = amigaBanks();

    // ECL2.DAX#2's own `LOAD_PIECES #3,#3,#3` (opcode 0x37, three immediates).
    const setBlockIds = [3, 3, 3] as const;
    const base = {
      walldefBlock: (id: number) => wd.get(id) ?? null,
      tileBlock: (id: number) => tiles.get(id) ?? null,
    };
    const dosWalls = loadDungeonWalls(setBlockIds, base);
    const amigaWalls = loadDungeonWalls(setBlockIds, {
      ...base,
      tileSetForBlock: (id: number) => banks.banks.get(id) ?? null,
    });

    // Geometry comes from WALLDEF, which A proved identical, so it must agree exactly.
    for (const wallset of [0, 1, 2]) {
      for (const slice of [0, 1, 2, 3, 4]) {
        for (const col of [0, 1, 2, 3, 4, 5]) {
          expect(amigaWalls.readId(wallset, slice, col), `readId(${wallset},${slice},${col})`).toBe(
            dosWalls.readId(wallset, slice, col),
          );
        }
      }
    }

    const map = decodeGeoBlock(readDaxDataBlocks(read(`${DOS}/GEO2.DAX`)).find((b) => b.blockId === 2)!.raw, 'GEO2#2')
      .map;
    let painted = 0;
    let padDisagreements = 0;
    let identicalArt = 0;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        for (const facing of [0, 2, 4, 6]) {
          for (const blit of composeWallView(map, { px: x, py: y, facing, eclBlockId: 2 }, dosWalls.readId)) {
            const d = dosWalls.lookupTile(blit);
            const a = amigaWalls.lookupTile(blit);
            if (!d || !a) continue;
            const db = isFlat(d);
            if (db !== isFlat(a)) padDisagreements++;
            else if (!db) {
              painted++;
              if (Buffer.from(d.indices).equals(Buffer.from(a.indices))) identicalArt++;
            }
          }
        }
      }
    }
    // Never paint where DOS leaves the wall empty — the failure mode E describes.
    expect(padDisagreements).toBe(0);
    // A real dungeon's worth of wall, and the Amiga port redrew every last tile of it.
    expect(painted).toBeGreaterThan(50_000);
    expect(identicalArt).toBe(0);
    // The wall master itself ships no colour table; the palette comes from Always.tlb, and it must
    // actually reach the tiles, since that is what the renderer reads.
    const pal = amigaWalls.tileSets[1]?.palette;
    expect(pal).toBeTruthy();
    expect(pal!.colors.filter((c) => c !== null).length).toBeGreaterThanOrEqual(32);
  });

  it('E. bankSwapParity accepts 25 of the 26 paired banks and rejects block 15 on its 4 real slots', () => {
    const banks = amigaBanks();
    const dos = dosBanks();

    const accepted: number[] = [];
    const rejected: number[] = [];
    for (const [blockId, amiga] of [...banks.banks].sort((a, b) => a[0] - b[0])) {
      const d = dos.get(blockId);
      if (!d) continue; // no DOS counterpart — outside the swap entirely, see A.
      (bankSwapParity(d, amiga).ok ? accepted : rejected).push(blockId);
    }
    expect(rejected).toEqual(UNSWAPPABLE);
    expect(accepted.length).toBe(25);

    // The rejection is specific, not incidental: slots 186-189 are exactly where the two disagree.
    const verdict = bankSwapParity(dos.get(15)!, banks.banks.get(15)!);
    expect(verdict.reason).toMatch(/186,187,188,189/);
    for (const i of [186, 187, 188, 189]) {
      expect(isFlat(dos.get(15)!.tiles[i]), `dos 15 slot ${i} pads`).toBe(true);
      expect(isFlat(banks.banks.get(15)!.tiles[i]), `amiga 15 slot ${i} paints`).toBe(false);
    }

    // The three other 210-slot banks are ACCEPTED, and each carries one trailing pad tile the DOS
    // bank does not. That excess is the allowance `bankSwapParity` makes; a 210-tile geometry never
    // names index 210. Asserted so the allowance stays honest rather than becoming a blanket one.
    for (const blockId of [30, 31, 36]) {
      const amiga = banks.banks.get(blockId)!;
      expect(amiga.tiles.length, `bank ${blockId} amiga length`).toBe(211);
      expect(dos.get(blockId)!.tiles.length, `bank ${blockId} dos length`).toBe(210);
      expect(isFlat(amiga.tiles[210]), `bank ${blockId} tail is padding`).toBe(true);
      expect(bankSwapParity(dos.get(blockId)!, amiga).ok).toBe(true);
    }

    // ECL5#19 — the campaign route — loads (7,15,30). Block 15 alone disqualifies it, which is why
    // the art toggle lives on the ECL2#2 area (`LOAD_PIECES #3,#3,#3`) instead.
    expect([7, 15, 30].filter((id) => !bankSwapParity(dos.get(id)!, banks.banks.get(id)!).ok)).toEqual([15]);
    expect([3].every((id) => bankSwapParity(dos.get(id)!, banks.banks.get(id)!).ok)).toBe(true);
  });
});
