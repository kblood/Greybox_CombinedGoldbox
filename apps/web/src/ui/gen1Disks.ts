/**
 * Gen1 (DAX) base-game disk registry — backs the "walk any area" feature (the area picker
 * `explore.ts`'s `mountDungeonView` adds to every Gen1 dungeon view): the full per-disk archive
 * path set for each base game, so the picker can enumerate every playable (GEO+ECL paired) area
 * across ALL of a game's disks, not just the one curated starting area a `GameData` profile in
 * `gameData.ts` boots into.
 *
 * **Paths are spelled out as literal strings on purpose**, the same convention `gameData.ts`'s own
 * doc comment explains: the static-build asset bundler (`scripts/bundle-assets.mjs`) scans every
 * top-level `.ts` file in `src/ui/` for single-quoted `'<Game folder>/<file>'` / absolute-path
 * literals and copies exactly those into the deployed build — a computed `${dir}/${file}` would be
 * invisible to it.
 *
 * A base game's route variants in `gameData.ts` (e.g. `cok`, `cok-natural`, `cok-natural-2`..`-5`)
 * all share ONE registry entry here — see {@link baseGameForExplore}.
 */

export interface Gen1DiskSpec {
  /** Disk/area-set number, matching the `{n}` in `ECL{n}.DAX`/`GEO{n}.DAX`/etc. */
  disk: number;
  eclPath: string;
  geoPath: string;
  walldefPath: string;
  /** Shared/global WALLDEF bank merged underneath this disk's numbered bank. */
  sharedWalldefPath?: string;
  tilesPath: string;
  /** Shared/global 8X8D wall-tile bank merged underneath this disk's numbered bank. */
  sharedTilesPath?: string;
  /**
   * A second 8X8D-style archive supplying the block-201 font / block-202 frame+moon tiles when
   * `tilesPath` itself doesn't carry them. Treasures splits its font/frame archive (`8X8D0.DAX`,
   * blocks 201/202) from its wall bank (`8X8D1.DAX`); Gateway similarly reuses global
   * `8X8D1.DAX` for the UI while its numbered `8X8D2..6` banks provide area tiles. Absent for games
   * that keep both halves together; `explore.ts` merges this archive's decoded blocks into the same
   * block map `tilesPath` produces when present.
   */
  framePath?: string;
  monPath: string;
  spcPath?: string;
  itmPath?: string;
  wizPath?: string;
  itemPath: string;
  /** Item record format — selects the engine decoder, same convention as `GameData.itemFormat`. */
  itemFormat: 'cok-63' | 'dok-17';
}

export type Gen1BaseGameId = 'cok' | 'dok' | 'coab' | 'pool' | 'secret' | 'gateway' | 'treasures' | 'pools' | 'nwn';

export interface Gen1BaseGame {
  id: Gen1BaseGameId;
  title: string;
  /** Detection-profile id (feeds `sniffMonsterRecord`/`decodeMonsterRecord`'s profile dispatch). */
  profileId: string;
  /**
   * Same meaning as `GameData.eclDialect` — constant across every disk of one base game.
   * `'gen1-short-gateway'` / `'gen1-short-treasures'` / `'gen1-short-pools'` are title-specific
   * splits off `'gen1-short'`; see the corresponding `ECL_GEN1_SHORT_*` doc comments.
   */
  eclDialect?: 'pool' | 'gen1-short' | 'gen1-short-gateway' | 'gen1-short-treasures' | 'gen1-short-pools';
  /**
   * Same meaning as `GameData.eclFallbackPieces` — Treasures' own wilderness-encounter ECL scripts
   * never call LOAD_PIECES themselves (see `ECL_GEN1_SHORT_TREASURES`'s doc comment); the picker's
   * own per-area `switchGen1Area` needs the same default whenever it lands on one of them.
   */
  eclFallbackPieces?: readonly [number, number, number];
  /** See GameData.walldefSingleRecord; NWN's padded WALLDEF blocks need this in picker loads too. */
  walldefSingleRecord?: boolean;
  /** See GameData.directWallsetTileIds; NWN's wall ids address their originating 8X8D bank. */
  directWallsetTileIds?: boolean;
  disks: Gen1DiskSpec[];
}

const CoAB = 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds';
const Pool = 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD';
const Secret = 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades';
const Gateway = 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier';
const Treasures = 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier';
const Pools = 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness';

/** The Gen1 base-game disk registry (M-walk / area-picker feature). */
export const GEN1_BASE_GAMES: Record<Gen1BaseGameId, Gen1BaseGame> = {
  cok: {
    id: 'cok',
    title: 'Champions of Krynn',
    profileId: 'champions-of-krynn',
    disks: [
      {
        disk: 1,
        eclPath: 'Champions of Krynn/ECL1.DAX',
        geoPath: 'Champions of Krynn/GEO1.DAX',
        walldefPath: 'Champions of Krynn/WALLDEF1.DAX',
        tilesPath: 'Champions of Krynn/8X8D1.DAX',
        monPath: 'Champions of Krynn/MON1CHA.DAX',
        spcPath: 'Champions of Krynn/MON1SPC.DAX',
        itmPath: 'Champions of Krynn/MON1ITM.DAX',
        itemPath: 'Champions of Krynn/ITEM1.DAX',
        itemFormat: 'cok-63',
      },
      {
        disk: 2,
        eclPath: 'Champions of Krynn/ECL2.DAX',
        geoPath: 'Champions of Krynn/GEO2.DAX',
        walldefPath: 'Champions of Krynn/WALLDEF2.DAX',
        tilesPath: 'Champions of Krynn/8X8D2.DAX',
        monPath: 'Champions of Krynn/MON2CHA.DAX',
        spcPath: 'Champions of Krynn/MON2SPC.DAX',
        itmPath: 'Champions of Krynn/MON2ITM.DAX',
        itemPath: 'Champions of Krynn/ITEM2.DAX',
        itemFormat: 'cok-63',
      },
      {
        disk: 3,
        eclPath: 'Champions of Krynn/ECL3.DAX',
        geoPath: 'Champions of Krynn/GEO3.DAX',
        walldefPath: 'Champions of Krynn/WALLDEF3.DAX',
        tilesPath: 'Champions of Krynn/8X8D3.DAX',
        monPath: 'Champions of Krynn/MON3CHA.DAX',
        spcPath: 'Champions of Krynn/MON3SPC.DAX',
        itmPath: 'Champions of Krynn/MON3ITM.DAX',
        itemPath: 'Champions of Krynn/ITEM3.DAX',
        itemFormat: 'cok-63',
      },
    ],
  },
  dok: {
    id: 'dok',
    title: 'Death Knights of Krynn',
    profileId: 'death-knights-of-krynn',
    eclDialect: 'gen1-short',
    disks: [
      {
        disk: 1,
        eclPath: 'Death Knights of Krynn/ECL1.DAX',
        geoPath: 'Death Knights of Krynn/GEO1.DAX',
        walldefPath: 'Death Knights of Krynn/WALLDEF1.DAX',
        tilesPath: 'Death Knights of Krynn/8X8D1.DAX',
        monPath: 'Death Knights of Krynn/MON1CHA.DAX',
        spcPath: 'Death Knights of Krynn/MON1SPC.DAX',
        itmPath: 'Death Knights of Krynn/MON1ITM.DAX',
        wizPath: 'Death Knights of Krynn/MON1WIZ.DAX',
        itemPath: 'Death Knights of Krynn/ITEM0.DAX',
        itemFormat: 'dok-17',
      },
      {
        // DoK ships only ONE bestiary file (MON1CHA.DAX) for all three disks — reused here for
        // disk 2/3 areas too (verified: no MON2CHA.DAX/MON3CHA.DAX exist in the DoK folder).
        disk: 2,
        eclPath: 'Death Knights of Krynn/ECL2.DAX',
        geoPath: 'Death Knights of Krynn/GEO2.DAX',
        walldefPath: 'Death Knights of Krynn/WALLDEF2.DAX',
        tilesPath: 'Death Knights of Krynn/8X8D2.DAX',
        monPath: 'Death Knights of Krynn/MON1CHA.DAX',
        spcPath: 'Death Knights of Krynn/MON1SPC.DAX',
        itmPath: 'Death Knights of Krynn/MON1ITM.DAX',
        wizPath: 'Death Knights of Krynn/MON1WIZ.DAX',
        itemPath: 'Death Knights of Krynn/ITEM0.DAX',
        itemFormat: 'dok-17',
      },
      {
        disk: 3,
        eclPath: 'Death Knights of Krynn/ECL3.DAX',
        geoPath: 'Death Knights of Krynn/GEO3.DAX',
        walldefPath: 'Death Knights of Krynn/WALLDEF3.DAX',
        tilesPath: 'Death Knights of Krynn/8X8D3.DAX',
        monPath: 'Death Knights of Krynn/MON1CHA.DAX',
        spcPath: 'Death Knights of Krynn/MON1SPC.DAX',
        itmPath: 'Death Knights of Krynn/MON1ITM.DAX',
        wizPath: 'Death Knights of Krynn/MON1WIZ.DAX',
        itemPath: 'Death Knights of Krynn/ITEM0.DAX',
        itemFormat: 'dok-17',
      },
    ],
  },
  coab: {
    id: 'coab',
    title: 'Curse of the Azure Bonds',
    profileId: 'curse-of-the-azure-bonds',
    // Area 1 is wilderness-only (ships no GEO1/WALLDEF1 — see gameData.ts's own `coab` comment), so
    // the registry starts at disk 2, the first disk with a real dungeon map.
    disks: [
      {
        disk: 2,
        eclPath: `${CoAB}/ECL2.DAX`, geoPath: `${CoAB}/GEO2.DAX`, walldefPath: `${CoAB}/WALLDEF2.DAX`,
        tilesPath: `${CoAB}/8X8D2.DAX`, monPath: `${CoAB}/MON2CHA.DAX`, spcPath: `${CoAB}/MON2SPC.DAX`,
        itmPath: `${CoAB}/MON2ITM.DAX`, itemPath: `${CoAB}/ITEM2.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 3,
        eclPath: `${CoAB}/ECL3.DAX`, geoPath: `${CoAB}/GEO3.DAX`, walldefPath: `${CoAB}/WALLDEF3.DAX`,
        tilesPath: `${CoAB}/8X8D3.DAX`, monPath: `${CoAB}/MON3CHA.DAX`, spcPath: `${CoAB}/MON3SPC.DAX`,
        itmPath: `${CoAB}/MON3ITM.DAX`, itemPath: `${CoAB}/ITEM3.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 4,
        eclPath: `${CoAB}/ECL4.DAX`, geoPath: `${CoAB}/GEO4.DAX`, walldefPath: `${CoAB}/WALLDEF4.DAX`,
        tilesPath: `${CoAB}/8X8D4.DAX`, monPath: `${CoAB}/MON4CHA.DAX`, spcPath: `${CoAB}/MON4SPC.DAX`,
        itmPath: `${CoAB}/MON4ITM.DAX`, itemPath: `${CoAB}/ITEM4.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 5,
        eclPath: `${CoAB}/ECL5.DAX`, geoPath: `${CoAB}/GEO5.DAX`, walldefPath: `${CoAB}/WALLDEF5.DAX`,
        tilesPath: `${CoAB}/8X8D5.DAX`, monPath: `${CoAB}/MON5CHA.DAX`, spcPath: `${CoAB}/MON5SPC.DAX`,
        itmPath: `${CoAB}/MON5ITM.DAX`, itemPath: `${CoAB}/ITEM5.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 6,
        eclPath: `${CoAB}/ECL6.DAX`, geoPath: `${CoAB}/GEO6.DAX`, walldefPath: `${CoAB}/WALLDEF6.DAX`,
        tilesPath: `${CoAB}/8X8D6.DAX`, monPath: `${CoAB}/MON6CHA.DAX`, spcPath: `${CoAB}/MON6SPC.DAX`,
        itmPath: `${CoAB}/MON6ITM.DAX`, itemPath: `${CoAB}/ITEM6.DAX`, itemFormat: 'cok-63',
      },
    ],
  },
  pool: {
    id: 'pool',
    title: 'Pool of Radiance',
    profileId: 'pool-of-radiance',
    eclDialect: 'pool',
    disks: [
      {
        disk: 1,
        eclPath: `${Pool}/ECL1.DAX`, geoPath: `${Pool}/GEO1.DAX`, walldefPath: `${Pool}/WALLDEF1.DAX`,
        tilesPath: `${Pool}/8X8D1.DAX`, monPath: `${Pool}/MON1CHA.DAX`,
        itmPath: `${Pool}/MON1ITM.DAX`, itemPath: `${Pool}/ITEM1.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 2,
        eclPath: `${Pool}/ECL2.DAX`, geoPath: `${Pool}/GEO2.DAX`, walldefPath: `${Pool}/WALLDEF2.DAX`,
        tilesPath: `${Pool}/8X8D2.DAX`, monPath: `${Pool}/MON2CHA.DAX`, spcPath: `${Pool}/MON2SPC.DAX`,
        itmPath: `${Pool}/MON2ITM.DAX`, itemPath: `${Pool}/ITEM2.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 3,
        eclPath: `${Pool}/ECL3.DAX`, geoPath: `${Pool}/GEO3.DAX`, walldefPath: `${Pool}/WALLDEF3.DAX`,
        tilesPath: `${Pool}/8X8D3.DAX`, monPath: `${Pool}/MON3CHA.DAX`,
        itmPath: `${Pool}/MON3ITM.DAX`, itemPath: `${Pool}/ITEM3.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 4,
        eclPath: `${Pool}/ECL4.DAX`, geoPath: `${Pool}/GEO4.DAX`, walldefPath: `${Pool}/WALLDEF4.DAX`,
        tilesPath: `${Pool}/8X8D4.DAX`, monPath: `${Pool}/MON4CHA.DAX`, spcPath: `${Pool}/MON4SPC.DAX`,
        itmPath: `${Pool}/MON4ITM.DAX`, itemPath: `${Pool}/ITEM4.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 5,
        eclPath: `${Pool}/ECL5.DAX`, geoPath: `${Pool}/GEO5.DAX`, walldefPath: `${Pool}/WALLDEF5.DAX`,
        tilesPath: `${Pool}/8X8D5.DAX`, monPath: `${Pool}/MON5CHA.DAX`, spcPath: `${Pool}/MON5SPC.DAX`,
        itmPath: `${Pool}/MON5ITM.DAX`, itemPath: `${Pool}/ITEM5.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 6,
        eclPath: `${Pool}/ECL6.DAX`, geoPath: `${Pool}/GEO6.DAX`, walldefPath: `${Pool}/WALLDEF6.DAX`,
        tilesPath: `${Pool}/8X8D6.DAX`, monPath: `${Pool}/MON6CHA.DAX`, spcPath: `${Pool}/MON6SPC.DAX`,
        itmPath: `${Pool}/MON6ITM.DAX`, itemPath: `${Pool}/ITEM6.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 7,
        eclPath: `${Pool}/ECL7.DAX`, geoPath: `${Pool}/GEO7.DAX`, walldefPath: `${Pool}/WALLDEF7.DAX`,
        tilesPath: `${Pool}/8X8D7.DAX`, monPath: `${Pool}/MON7CHA.DAX`, spcPath: `${Pool}/MON7SPC.DAX`,
        itmPath: `${Pool}/MON7ITM.DAX`, itemPath: `${Pool}/ITEM7.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 8,
        eclPath: `${Pool}/ECL8.DAX`, geoPath: `${Pool}/GEO8.DAX`, walldefPath: `${Pool}/WALLDEF8.DAX`,
        tilesPath: `${Pool}/8X8D8.DAX`, monPath: `${Pool}/MON8CHA.DAX`, spcPath: `${Pool}/MON8SPC.DAX`,
        itmPath: `${Pool}/MON8ITM.DAX`, itemPath: `${Pool}/ITEM8.DAX`, itemFormat: 'cok-63',
      },
    ],
  },
  secret: {
    id: 'secret',
    title: 'Secret of the Silver Blades',
    profileId: 'secret-of-the-silver-blades',
    // Secret ships ONE shared bestiary (MON1CHA/SPC/ITM.DAX) for all three disks — mirrored by the
    // existing `secret-natural-3` GameData profile, whose ECL2/GEO2 area still points at MON1CHA.
    disks: [
      {
        disk: 1,
        eclPath: `${Secret}/ECL1.DAX`, geoPath: `${Secret}/GEO1.DAX`, walldefPath: `${Secret}/WALLDEF1.DAX`,
        tilesPath: `${Secret}/8X8D1.DAX`, monPath: `${Secret}/MON1CHA.DAX`, spcPath: `${Secret}/MON1SPC.DAX`,
        itmPath: `${Secret}/MON1ITM.DAX`, itemPath: `${Secret}/ITEM1.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 2,
        eclPath: `${Secret}/ECL2.DAX`, geoPath: `${Secret}/GEO2.DAX`, walldefPath: `${Secret}/WALLDEF2.DAX`,
        tilesPath: `${Secret}/8X8D2.DAX`, monPath: `${Secret}/MON1CHA.DAX`, spcPath: `${Secret}/MON1SPC.DAX`,
        itmPath: `${Secret}/MON1ITM.DAX`, itemPath: `${Secret}/ITEM2.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 3,
        eclPath: `${Secret}/ECL3.DAX`, geoPath: `${Secret}/GEO3.DAX`, walldefPath: `${Secret}/WALLDEF3.DAX`,
        tilesPath: `${Secret}/8X8D3.DAX`, monPath: `${Secret}/MON1CHA.DAX`, spcPath: `${Secret}/MON1SPC.DAX`,
        itmPath: `${Secret}/MON1ITM.DAX`, itemPath: `${Secret}/ITEM3.DAX`, itemFormat: 'cok-63',
      },
    ],
  },
  gateway: {
    id: 'gateway',
    title: 'Gateway to the Savage Frontier',
    profileId: 'gateway-to-the-savage-frontier',
    // Gateway's own split: long 3-operand 0x0C frame, otherwise the short family — see
    // ECL_GEN1_SHORT_GATEWAY's doc comment in `@goldbox/engine` (2026-07-23 corpus audit).
    eclDialect: 'gen1-short-gateway',
    // Gateway ships no disk-1 AREA set (no ECL1/GEO1/WALLDEF1/MON1CHA/ITEM1), so the registry
    // starts at disk 2. Its 8X8D1.DAX does exist as the shared UI/font/frame bank and is therefore
    // supplied as `framePath` for every numbered area below.
    disks: [
      {
        disk: 2,
        eclPath: `${Gateway}/ECL2.DAX`, geoPath: `${Gateway}/GEO2.DAX`, walldefPath: `${Gateway}/WALLDEF2.DAX`, sharedWalldefPath: `${Gateway}/WALLDEF.DAX`,
        tilesPath: `${Gateway}/8X8D2.DAX`, sharedTilesPath: `${Gateway}/8X8D.DAX`, framePath: `${Gateway}/8X8D1.DAX`, monPath: `${Gateway}/MON2CHA.DAX`, spcPath: `${Gateway}/MON2SPC.DAX`,
        itmPath: `${Gateway}/MON2ITM.DAX`, itemPath: `${Gateway}/ITEM2.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 3,
        eclPath: `${Gateway}/ECL3.DAX`, geoPath: `${Gateway}/GEO3.DAX`, walldefPath: `${Gateway}/WALLDEF3.DAX`, sharedWalldefPath: `${Gateway}/WALLDEF.DAX`,
        tilesPath: `${Gateway}/8X8D3.DAX`, sharedTilesPath: `${Gateway}/8X8D.DAX`, framePath: `${Gateway}/8X8D1.DAX`, monPath: `${Gateway}/MON3CHA.DAX`, spcPath: `${Gateway}/MON3SPC.DAX`,
        itmPath: `${Gateway}/MON3ITM.DAX`, itemPath: `${Gateway}/ITEM3.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 4,
        eclPath: `${Gateway}/ECL4.DAX`, geoPath: `${Gateway}/GEO4.DAX`, walldefPath: `${Gateway}/WALLDEF4.DAX`, sharedWalldefPath: `${Gateway}/WALLDEF.DAX`,
        tilesPath: `${Gateway}/8X8D4.DAX`, sharedTilesPath: `${Gateway}/8X8D.DAX`, framePath: `${Gateway}/8X8D1.DAX`, monPath: `${Gateway}/MON4CHA.DAX`, spcPath: `${Gateway}/MON4SPC.DAX`,
        itmPath: `${Gateway}/MON4ITM.DAX`, itemPath: `${Gateway}/ITEM4.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 5,
        eclPath: `${Gateway}/ECL5.DAX`, geoPath: `${Gateway}/GEO5.DAX`, walldefPath: `${Gateway}/WALLDEF5.DAX`, sharedWalldefPath: `${Gateway}/WALLDEF.DAX`,
        tilesPath: `${Gateway}/8X8D5.DAX`, sharedTilesPath: `${Gateway}/8X8D.DAX`, framePath: `${Gateway}/8X8D1.DAX`, monPath: `${Gateway}/MON5CHA.DAX`, spcPath: `${Gateway}/MON5SPC.DAX`,
        itmPath: `${Gateway}/MON5ITM.DAX`, itemPath: `${Gateway}/ITEM5.DAX`, itemFormat: 'cok-63',
      },
      {
        disk: 6,
        // Gateway ships no WALLDEF6.DAX. ECL6#20's retail LOAD_PIECES is [5,30,30], and both
        // referenced ids live in the shared WALLDEF.DAX (ids 5/30/15).
        eclPath: `${Gateway}/ECL6.DAX`, geoPath: `${Gateway}/GEO6.DAX`, walldefPath: `${Gateway}/WALLDEF.DAX`,
        tilesPath: `${Gateway}/8X8D6.DAX`, sharedTilesPath: `${Gateway}/8X8D.DAX`, framePath: `${Gateway}/8X8D1.DAX`, monPath: `${Gateway}/MON6CHA.DAX`, spcPath: `${Gateway}/MON6SPC.DAX`,
        itmPath: `${Gateway}/MON6ITM.DAX`, itemPath: `${Gateway}/ITEM6.DAX`, itemFormat: 'cok-63',
      },
    ],
  },
  treasures: {
    id: 'treasures',
    title: 'Treasures of the Savage Frontier',
    profileId: 'treasures-of-the-savage-frontier',
    // Its own micro-dialect, not the shared `gen1-short` DoK/Gateway/PoD use — see
    // `ECL_GEN1_SHORT_TREASURES`'s doc comment (LOAD_FILES decodes as Gen2's 2-operand short form
    // here, not Gen1's 3-operand one; DoK/Gateway/PoD are independently proven fine under the
    // 3-operand form, so this is genuinely a fourth split point, not a blanket correction).
    eclDialect: 'gen1-short-treasures',
    // None of `ECL1.DAX`'s 30 blocks ever call LOAD_PIECES (verified: every reachable area script,
    // even after the LOAD_FILES fix above, ends without one) — its wilderness-encounter scripts
    // apparently reuse a wall/tile set the host already has loaded, not per-encounter. WALLDEF1
    // block 1 (set 1) is the only real set on this disk's WALLDEF, so it's the natural fallback.
    eclFallbackPieces: [1, 0xff, 0xff],
    // Treasures ships a SINGLE ECL/GEO/WALLDEF disk. Its 8X8D archive is split in two: 8X8D1.DAX is
    // the wall-tile bank (blocks 1/2/7-16, what WALLDEF references), 8X8D0.DAX is the font/frame
    // archive (blocks 201/202 only) — verified by inspecting both TOCs directly. `framePath` merges
    // the latter in so the exact-screen compositor (border + text font) renders, exactly like every
    // other Gen1 game's single combined archive.
    disks: [
      {
        disk: 1,
        eclPath: `${Treasures}/ECL1.DAX`, geoPath: `${Treasures}/GEO1.DAX`, walldefPath: `${Treasures}/WALLDEF1.DAX`,
        tilesPath: `${Treasures}/8X8D1.DAX`, framePath: `${Treasures}/8X8D0.DAX`,
        monPath: `${Treasures}/MON1CHA.DAX`, spcPath: `${Treasures}/MON1SPC.DAX`,
        itmPath: `${Treasures}/MON1ITM.DAX`, itemPath: `${Treasures}/ITEM0.DAX`, itemFormat: 'dok-17',
      },
    ],
  },
  pools: {
    id: 'pools',
    title: 'Pools of Darkness',
    profileId: 'pools-of-darkness',
    eclDialect: 'gen1-short-pools',
    // Like Treasures, Pools' ECL init blocks reuse a resident wall set rather than emitting
    // LOAD_PIECES. The game has one ECL/GEO archive pair containing all 32 maps, and WALLDEF1's
    // sole real set is the evidenced fallback.
    eclFallbackPieces: [1, 0xff, 0xff],
    disks: [
      {
        disk: 1,
        eclPath: `${Pools}/ECL1.DAX`, geoPath: `${Pools}/GEO1.DAX`, walldefPath: `${Pools}/WALLDEF1.DAX`,
        tilesPath: `${Pools}/8X8D1.DAX`, framePath: `${Pools}/8X8D0.DAX`,
        monPath: `${Pools}/MON1CHA.DAX`, spcPath: `${Pools}/MON1SPC.DAX`, itmPath: `${Pools}/MON1ITM.DAX`,
        itemPath: `${Pools}/ITEM0.DAX`, itemFormat: 'dok-17',
      },
    ],
  },
  nwn: {
    id: 'nwn',
    title: 'Neverwinter Nights (DOS/AOL)',
    profileId: 'neverwinter-nights-dos',
    walldefSingleRecord: true,
    directWallsetTileIds: true,
    // NWN's four numbered ECL/GEO pairs share one wall, tile, monster, carried-item and item archive. ECL5/7
    // have no paired GEO archive and are intentionally not selectable as walking areas.
    disks: [
      { disk: 0, eclPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/ECL0.DAX', geoPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/GEO0.DAX', walldefPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/WALLDEF.DAX', tilesPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/8X8D.DAX', monPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/MONCHA.DAX', itmPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/MONITM.DAX', itemPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/ITEM.DAX', itemFormat: 'cok-63' },
      { disk: 1, eclPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/ECL1.DAX', geoPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/GEO1.DAX', walldefPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/WALLDEF.DAX', tilesPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/8X8D.DAX', monPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/MONCHA.DAX', itmPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/MONITM.DAX', itemPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/ITEM.DAX', itemFormat: 'cok-63' },
      { disk: 2, eclPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/ECL2.DAX', geoPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/GEO2.DAX', walldefPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/WALLDEF.DAX', tilesPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/8X8D.DAX', monPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/MONCHA.DAX', itmPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/MONITM.DAX', itemPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/ITEM.DAX', itemFormat: 'cok-63' },
      { disk: 3, eclPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/ECL3.DAX', geoPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/GEO3.DAX', walldefPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/WALLDEF.DAX', tilesPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/8X8D.DAX', monPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/MONCHA.DAX', itmPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/MONITM.DAX', itemPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/ITEM.DAX', itemFormat: 'cok-63' },
    ],
  },
};

/** Map an `explore.ts` route id (e.g. `cok-natural-3`) to its base game in the registry above. */
export function baseGameForExplore(id: string): Gen1BaseGameId | null {
  if (id === 'cok' || id.startsWith('cok-natural')) return 'cok';
  if (id === 'dok' || id.startsWith('dok-natural')) return 'dok';
  if (id === 'coab' || id.startsWith('coab-natural')) return 'coab';
  if (id === 'pool' || id.startsWith('pool-natural')) return 'pool';
  if (id === 'secret' || id.startsWith('secret-natural')) return 'secret';
  if (id === 'gateway' || id.startsWith('gateway-natural')) return 'gateway';
  // `treasures-natural` is deliberately NOT folded in here yet: it is the same exact-id shape this
  // row used to have, but it has its own passing e2e case whose assertions were written against the
  // unwired behaviour. Broadening it is its own slice with its own re-derivation work.
  if (id === 'treasures') return 'treasures';
  if (id === 'pools' || id.startsWith('pools-natural')) return 'pools';
  if (id === 'nwn' || id === 'nwn-natural') return 'nwn';
  return null;
}
