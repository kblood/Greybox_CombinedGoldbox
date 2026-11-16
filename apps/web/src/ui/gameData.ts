/**
 * Per-game data configuration (Phase B, B1) — the dungeon load path is engine-generation logic, not
 * a Champions-of-Krynn-specific one, so the explore view reads its asset paths + ECL init block from
 * this registry instead of hard-coded CoK constants. Champions of Krynn (CoK) and Death Knights of
 * Krynn (DoK) are both Krynn-Gen1 DAX games and share the exact same loader pipeline; they differ
 * only in which folder their DAX archives live in and which ECL1 init block opens the first dungeon.
 *
 * **Paths are spelled out as literal strings on purpose.** The static-build asset bundler
 * (`scripts/bundle-assets.mjs`) copies every single-quoted `'<Game folder>/<file>'` literal it finds
 * in the UI sources; a computed `${dir}/${file}` would be invisible to it and the DoK files would not
 * ship. So each game lists its real paths verbatim here.
 */
import { DOK_FRAME_LAYOUT, GATEWAY_FRAME_LAYOUT, NWN_FRAME_LAYOUT, type ExploreFrameLayout } from '@goldbox/engine';

export type GameId =
  | 'cok'
  | 'cok-natural'
  | 'cok-natural-2'
  | 'cok-natural-3'
  | 'cok-natural-4'
  | 'cok-natural-5'
  | 'cok-natural-6'
  | 'coab'
  | 'coab-natural'
  | 'coab-natural-2'
  | 'coab-natural-3'
  | 'coab-natural-4'
  | 'dok'
  | 'dok-natural'
  | 'dok-natural-2'
  | 'gateway'
  | 'gateway-natural'
  | 'gateway-amiga'
  | 'gateway-quest'
  | 'pool'
  | 'pool-natural-2'
  | 'pool-natural-3'
  | 'pool-natural-4'
  | 'pool-natural-5'
  | 'secret'
  | 'secret-natural'
  | 'secret-natural-2'
  | 'secret-natural-3'
  | 'secret-natural-4'
  | 'treasures'
  | 'treasures-natural'
  | 'treasures-town'
  | 'pools'
  | 'pools-natural'
  | 'pools-town'
  | 'nwn'
  | 'nwn-natural';

export interface GameData {
  id: GameId;
  /** Display title. */
  title: string;
  /** Engine generation — both Krynn-Gen1 games use the DAX dungeon pipeline. */
  engineGen: 'gen1-dax' | 'gen2-hlib';
  /** Detection-profile id this game maps to (see engine `BUILTIN_PROFILES`). */
  profileId: string;
  /** Dungeon ECL archive. */
  eclPath: string;
  /** GEO map archive. */
  geoPath: string;
  /** WALLDEF wall-set archive. */
  walldefPath: string;
  /**
   * Optional shared WALLDEF bank merged underneath {@link walldefPath}. Gateway keeps global sets
   * 5/15/30 in `WALLDEF.DAX` while numbered area files carry the remaining local sets; a mounted
   * area can reference both in one LOAD_PIECES triple.
   */
  sharedWalldefPath?: string;
  /** 8X8D tile archive (UI frame + font + first-person wall tiles). */
  tilesPath: string;
  /**
   * Optional shared 8X8D wall-tile bank merged underneath {@link tilesPath}. Gateway keeps the
   * pixels for global WALLDEF sets 15/30 in `8X8D.DAX`, while numbered area banks carry local
   * wall sets. This is separate from {@link framePath}, which supplies UI-only font/frame blocks.
   */
  sharedTilesPath?: string;
  /**
   * A second 8X8D-style archive supplying the block-201 font / block-202 frame+moon tiles when
   * {@link tilesPath} itself doesn't carry them. Treasures splits `8X8D0.DAX` from its wall bank;
   * Gateway similarly reuses `8X8D1.DAX` for UI while numbered/shared archives supply wall art
   * (see `gen1Disks.ts`'s matching `Gen1DiskSpec.framePath` doc). Absent when no split is needed.
   */
  framePath?: string;
  /** MON{n}CHA monster-record archive (encounter foes). */
  monPath: string;
  /**
   * MON{n}SPC.DAX special/affect side-table for the same area as {@link monPath} (M23.S2) — joined
   * onto the decoded records via `applyRegenAffect` so an innate special like `regen_3_hp` (troll-style
   * per-round healing) actually reaches combat. Optional: an absent/failed fetch degrades to "no
   * monster affects", same graceful fallback as {@link monPath} itself.
   */
  spcPath?: string;
  /**
   * MON{n}ITM.DAX carried-item side-table for the same area as {@link monPath} (M26.S1) — joined onto
   * the decoded records via `applyItemPluses` so a monster's carried magic-item `plus` values reach the
   * post-combat XP award (`calcBattleExp`'s `Σ item.plus·400` term). Optional: an absent/failed fetch
   * degrades to "no carried-item XP bonus", same graceful fallback as {@link spcPath}.
   */
  itmPath?: string;
  /**
   * MON{n}WIZ.DAX monster memorized-spellbook side-table for the same area as {@link monPath} (M31.S1,
   * DoK-only — CoK ships no such file), joined onto the decoded records via `applyPreparedSpellIds` so a
   * caster monster's real memorized spells actually cast in combat (`preparedSpellsFromDokIds`). Optional:
   * an absent/failed fetch degrades to "no memorized spells" (every enemy mute, the pre-existing
   * behavior), same graceful fallback as {@link spcPath}/{@link itmPath}.
   */
  wizPath?: string;
  /** Item archive: CoK ships 63-byte plain-ASCII records (`ITEM1.DAX`); DoK a 17-byte coded table (`ITEM0.DAX`). */
  itemPath: string;
  /** Item record format — selects the engine decoder (`decodeItemArchive` vs `decodeDokItemArchive`). */
  itemFormat: 'cok-63' | 'dok-17';
  /** ECL1 block id that opens the first walkable dungeon (verified loadable from real bytes). */
  eclInitBlock: number;
  /**
   * Optional byte offset inside the decompressed ECL block for games whose ECL header does not use
   * the fixed Krynn 0x8014 entry convention. Pool's DOS block 18 has a byte-located startup sequence
   * at 0x73 (`LOAD_FILES 18,2,255` then `LOAD_PIECES 1,3,5`).
   */
  eclEntryOffset?: number;
  /**
   * ECL dialect when it differs from the Krynn Gen1 default: 'pool' selects Pool's virtual-address
   * profile (ECL_POOL); 'gen1-short' selects the 1991+ short operand frames (ECL_GEN1_SHORT —
   * DoK: 0x1D takes 0 operands, 0x2C takes 1, and since the 2026-07-23 DoK GAME.OVR handler
   * disassembly also 0x23=0 and 0x0C=4; see disassemble.ts). 'gen1-short-gateway' is Gateway's own
   * split (ECL_GEN1_SHORT_GATEWAY: keeps the long 3-operand 0x0C frame — its corpus is affirmatively
   * 3-op there, 237/238 sites against its short-camp siblings' unanimous 4-op). 'gen1-short-treasures'
   * is Treasures' own further split (ECL_GEN1_SHORT_TREASURES: LOAD_FILES itself also needs the
   * short 2-operand frame there). 'gen1-short-pools' is Pools of Darkness's retail-handler-proven
   * split (ECL_GEN1_SHORT_POOLS: 0x1F=1, LOAD_FILES=2, repurposed 0x37=2, descriptor at 0x002D).
   */
  eclDialect?: 'pool' | 'gen1-short' | 'gen1-short-gateway' | 'gen1-short-treasures' | 'gen1-short-pools';
  /** Profile/route-owned ECL memory values applied before the first area handler runs. */
  eclInitialMemory?: readonly (readonly [address: number, value: number])[];
  /**
   * Default WALLDEF `setBlockIds` triple `loadDungeon` falls back to when the ECL init block emits
   * `loadFiles` but never calls LOAD_PIECES itself — Treasures' own wilderness-encounter scripts do
   * this for real (see `eclDialect: 'gen1-short-treasures'`'s doc comment). Omitted for every other
   * profile, which keeps `loadDungeon`'s original strict "both effects required" behavior.
   */
  eclFallbackPieces?: readonly [number, number, number];
  /**
   * Truncate every fetched `WALLDEF*.DAX` block to its first 780-byte record before decoding.
   * Neverwinter Nights (DOS/AOL) pads every `WALLDEF.DAX` block to a uniform 3-record (2340-byte)
   * size regardless of how many symbol sets it actually supplies, unlike CoK/DoK, whose block
   * *length itself* varies with real record count — `8X8D.DAX`'s direct 1:1 block-id-to-WALLDEF
   * mapping (never CoK's `blockId*10+i+1` split) proves renderer input is record 0. A few later
   * non-zero rows are unused padding or authoring data, not position-selected records. See
   * `docs/engine/research/neverwinter-nights-dos-eclinit.md` §3. Omitted (falsy) for every other
   * profile, which keeps the full multi-record block CoK/DoK's own WALLDEF conventions rely on.
   */
  walldefSingleRecord?: boolean;
  /**
   * NWN's WALLDEF entries are already indexed into the specific 8X8D bank paired with their
   * WALLDEF block. CoK/DoK relocate ids by symbol-set position; applying that convention to NWN
   * selects the wrong bank and garbles first-person walls.
   */
  directWallsetTileIds?: boolean;
  /**
   * Skip loading `8X8D` block-202 border/moon frame tiles for the exact-screen compositor.
   * `composeExploreScreen`'s `frameLayout` defaults to `COK_FRAME_LAYOUT` (`packages/engine/src/
   * render/exploreScreen.ts`), a set of DIRECT numeric tile indices pixel-matched against CoK's own
   * 38-tile block 202. Neverwinter Nights (DOS/AOL) ships a STRUCTURALLY different block 202 (40
   * tiles, not 38 — `docs/engine/research/neverwinter-nights-dos-format-coverage.md`'s 8X8D detail
   * section), so reusing CoK's indices verbatim would pull the wrong tiles into the border/moon
   * brackets — a real mis-assembly, not just a missing calibration. No per-title `frameLayout` has
   * been pixel-matched for NWN's own tile order (out of scope for this session; a future pass could
   * do the same MSE=0 screenshot match `cok-frame-arrays.md` used for CoK). Per this project's
   * "leave it honestly absent rather than misassembled" convention, this flag keeps `frameTiles`
   * `null` for NWN — `composeExploreScreen` already degrades gracefully with no border/moons drawn,
   * the rest of the screen (viewport, party panel, text, font) is unaffected. Omitted (falsy) for
   * every other profile, unchanged behavior.
   */
  frameTilesUnverified?: boolean;
  /**
   * Per-title override for the exploration-screen (and character-sheet/spellbook/companion-panel)
   * border tile placement, when the title's own `8X8D` block 202 doesn't match
   * `COK_FRAME_LAYOUT`'s tile roles (CoK's 38-tile set). Neverwinter Nights (DOS/AOL) sets this to
   * `NWN_FRAME_LAYOUT` (`packages/engine/src/render/exploreScreen.ts`) — see that constant's own
   * doc comment for the calibration method/confidence level. Omitted (falsy) for every other
   * profile, which keeps `composeExploreScreen`'s own `COK_FRAME_LAYOUT` default.
   */
  frameLayout?: ExploreFrameLayout;
  /**
   * Absolute block-202 starts of the four-phase groups in compositor order
   * [Lunitari/red, Solinari/white, Nuitari/black]. CoK defaults to [26,30,34]; DoK's differently
   * packed block uses [13,21,17]. `null` is an explicit no-overlay contract for a title whose
   * block-202 moon positions have not been calibrated; it must not silently borrow CoK's discs.
   */
  moonTileGroups?: readonly [number, number, number] | null;
  /**
   * Amiga `.DAA` counterpart of `tilesPath` (M9.S3), when extracted — backs the in-game EGA<->Amiga
   * wall-art toggle. Omit if no Amiga 8X8D archive is available for this game/area yet.
   */
  amigaTilesPath?: string;
  /**
   * Which Amiga 8X8D sub-format `amigaTilesPath` uses (M9.S4) — CoK and DoK's Amiga ports pack
   * their dungeon tiles completely differently (`docs/daa-format.md` §7c): CoK's `8X8D*.DAA` is a
   * compact 4-plane strip with no embedded palette (`decodeDaaTileBlock`); DoK's `8x8d1.daa` uses
   * the standard 5-plane BIGPIC-style frame format, one embedded-palette frame per block, several
   * tiles wide (`decodeDaaWideTileBlock`). Defaults to `'strip'` (CoK's format).
   */
  amigaTileFormat?: 'strip' | 'wide-frame';
  /**
   * Amiga `.DAA` counterpart of this title's DOS `*COM` combat-backdrop bank — the tactical
   * screen's half of the same EGA<->Amiga switch {@link amigaTilesPath} drives for dungeon walls.
   *
   * Declare it only where the swap has been MEASURED, on the same terms as the wall banks: shared
   * tile indices mean the DOS geometry drives the Amiga art unchanged, so the banks must hold the
   * same items in the same order. `packages/engine/test/daa.test.ts` is that measurement for CoK
   * and DoK — Amiga item `t` determines DOS item `t` at refinement 1.0000 for both DUNGCOMs, 0.92
   * for CoK WILDCOM and 0.90 for CoK RANDCOM, against item-permuted nulls around 0.13, with item
   * counts matching bank for bank.
   */
  amigaDungcomPath?: string;
  /** Amiga `.DAA` counterpart of the RANDCOM bank, where the title ships one. */
  amigaRandcomPath?: string;
  /**
   * Amiga **GLIB** counterpart of `tilesPath` — the DataLib-era ports (Pools of Darkness, Gateway,
   * Treasures, DQK) ship `8X8D.TLB`, a big-endian GLIB master holding one leaf set per DOS 8X8D
   * block id, instead of the `.DAA` archive `amigaTilesPath` expects. Mutually exclusive with
   * `amigaTilesPath`; when both are absent the game simply has no art toggle.
   *
   * Only declare this once the parity that makes the swap faithful has been MEASURED for the
   * title, because the DOS wall geometry drives the Amiga art unchanged: the Amiga walldef records
   * must match the DOS ones, and the banks must hold the same number of tiles at the same size, or
   * shared indices would point at the wrong art. For Pools that check is
   * `packages/engine/test/poolsAmigaWallArt.test.ts` (walldefs byte-identical, 6 banks of 256 8x8
   * tiles on both sides).
   *
   * Gateway is measured too (`gatewayAmigaWallArt.test.ts`) and is the reason declaring this is not
   * by itself sufficient: 25 of its 26 paired banks are faithful stand-ins but block 15 is not, so
   * the master is declared here and `buildGlibWallGraphics` refuses the toggle per-dungeon via
   * `bankSwapParity` when a mounted set is a bad one. Treasures is measured and REJECTED — its Amiga
   * `WallDef.glb` is byte-identical to Gateway's, i.e. the duology's shared file, while its own DOS
   * walldefs are a different 2340-byte format, so nothing here would line up. DQK is unmeasured.
   */
  amigaGlibTilesPath?: string;
  /**
   * Where to source the Amiga palette when `amigaGlibTilesPath`'s master carries no colour table of
   * its own. Pools' `8X8D.TLB` embeds one per set and needs nothing here; Gateway's `Walls.tlb` is
   * 5-plane art whose game palette lives in `DiskA/Always.tlb` (the same container CoAB and Secret
   * use). Without it the tiles decode correctly but reach the renderer with no colours.
   */
  amigaGlibPalettePath?: string;
  /**
   * Cross-archive games (ADR-0009) declare their full numbered archive set + start area instead
   * of one hard-coded `game_area`'s worth of `eclPath`/`geoPath`/… above. `dir` is the game
   * folder; the host probes `ECL{n}.DAX`/`GEO{n}.DAX`/`WALLDEF{n}.DAX`/`8X8D{n}.DAX`/
   * `MON{n}CHA.DAX`/`ITEM{n}.DAX` for each `n` in `areas` (a missing file — e.g. no
   * `GEO1.DAX`/`WALLDEF1.DAX` for CoAB's wilderness hub — is simply absent, exactly as retail).
   * `game_area` is switched at runtime by the ECL `SAVE …,0x7F12` instruction, which `runEclChain`
   * surfaces as a `setGameArea` effect (see `packages/engine/src/ecl/vm.ts` and `program.ts`'s
   * `areaSource`/`startGameArea`). Infrastructure only for now: no `GAME_DATA` profile below sets
   * this yet — building it out into a playable browser route (rebuilding `DungeonSources`/wall
   * graphics on a `setGameArea` crossing) is the wilderness-transition leaf, not this one.
   */
  archiveSet?: { dir: string; areas: readonly number[]; startGameArea: number };
  /**
   * "Mid-walk chain re-mount" targets (BUILD-QUEUE.md's Secret town-exit + Pool wilderness-crossing
   * leaves) — a `NEWECL` a `dialogueForCell`/`dialogueForVmRun1` runner can chain into DURING an
   * ordinary walk (not at profile boot, unlike {@link archiveSet}), keyed by the chained ECL block
   * id. Each entry names the FULL archive set `explore.ts`'s `remountChainedArea` fetches for that
   * target: identical to this profile's own `eclPath`/… fields for a same-archive chain (Secret's
   * `ECL1.DAX#16` archway -> `ECL1.DAX#33`), or a genuinely different archive's paths for a
   * cross-archive one (Pool's `ECL1.DAX#18` `vm_run_1` crossing -> `ECL4.DAX#2`). Absent for every
   * profile with no live chain wiring (the common case).
   */
  chainTargets?: Record<number, {
    eclPath: string; geoPath: string; walldefPath: string; tilesPath: string;
    monPath: string; spcPath?: string; itmPath?: string; itemPath: string;
    itemFormat: 'cok-63' | 'dok-17';
  }>;
  /**
   * Declares that this profile's map perimeter carries a host-level "exit map" trigger
   * (`packages/engine/src/world/explorer.ts`'s `MapCell.edgeExits`/`StepResult.edgeExit`,
   * BUILD-QUEUE.md's map-edge live-crossing leaf) — Gold Box's `vm_run_1` "DO YOU WISH TO LEAVE?"
   * prompt (`tried_to_exit_map`) is the first live-wired case. When set, `explore.ts` calls the
   * engine's `markMapEdgeExits` on the decoded map right after mount, so a real walked-to-the-
   * boundary step that returns `blocked: 'edge'` also carries `edgeExit`, and `applyMove` drives
   * the SAME `dialogueForVmRun1`/`onChain` machinery `crossWilderness` already proves — live, off
   * an ordinary walk, not a `window.__explore` seam call standing in for unbuilt travel UI.
   * `seedMemory` carries whatever the target block's `vm_run_1` handler needs primed to reach its
   * exit branch (CoK's `[0x7ed5]` `tried_to_exit_map`, byte-verified in the engine golden
   * "primeVmRun1 — golden CoK ECL2 block 50 town exit"). `kind` is an opaque tag `explore.ts`
   * switches on; only `'vm_run_1'` is understood today (see `triggerEdgeExit`).
   */
  edgeExit?: { kind: string; seedMemory?: Record<number, number> };
  /**
   * Explicit party spawn, overriding `explore.ts`'s own `chooseStart(map)` heuristic (pick the cell
   * with the most open edges, first found in row-major scan order). That heuristic assumes the map
   * is one connected region — true for every profile so far, but Treasures' `GEO1.DAX#34` genuinely
   * is NOT: it decomposes into 21 disconnected wall-graph components (the largest 118 cells), and
   * `chooseStart`'s own row-major-first tie-break lands on `(0,0)`, a fully-open 13-cell pocket with
   * no path at all to the natural-route target cell. This is a real, narrow gap in the heuristic
   * (not a Treasures-specific hack): every other shipped `*-natural` route was deliberately picked
   * to already be reachable from `chooseStart`'s own spawn (see e.g. `dok-natural`'s and
   * `cok-natural`'s own comments, "reachable in N legal directed-edge steps from chooseStart's own
   * spawn"); `treasures-natural`'s target cell has no such candidate, so this field supplies the
   * best-open-edges spawn within the SAME connected component as the target instead of teaching
   * `chooseStart` general graph-component awareness (a much larger change with a wide blast radius
   * across every other route). Absent ⇒ `chooseStart(map)` runs unchanged (every other profile).
   */
  startPose?: { x: number; y: number; facing: 'north' | 'east' | 'south' | 'west' };
}

export const GAME_DATA: Record<GameId, GameData> = {
  cok: {
    id: 'cok',
    title: 'Champions of Krynn',
    engineGen: 'gen1-dax',
    profileId: 'champions-of-krynn',
    eclPath: 'Champions of Krynn/ECL1.DAX',
    geoPath: 'Champions of Krynn/GEO1.DAX',
    walldefPath: 'Champions of Krynn/WALLDEF1.DAX',
    tilesPath: 'Champions of Krynn/8X8D1.DAX',
    monPath: 'Champions of Krynn/MON1CHA.DAX',
    spcPath: 'Champions of Krynn/MON1SPC.DAX',
    itmPath: 'Champions of Krynn/MON1ITM.DAX',
    itemPath: 'Champions of Krynn/ITEM1.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 34,
    // Amiga disk2's 8X8D1.DAA covers the same block ids as DOS 8X8D1.DAX (area 1's boot dungeon).
    amigaTilesPath: 'amiga_extracted/ChampionsOfKrynn/disk2/8X8D1.DAA',
    amigaDungcomPath: 'amiga_extracted/ChampionsOfKrynn/disk1/DUNGCOM.DAA',
    amigaRandcomPath: 'amiga_extracted/ChampionsOfKrynn/disk1/RANDCOM.DAA',
  },
  'cok-natural': {
    id: 'cok-natural',
    title: 'Champions of Krynn',
    engineGen: 'gen1-dax',
    profileId: 'champions-of-krynn',
    // BUILD-QUEUE.md's "Blocked prerequisite for CoK/DoK" leaf, browser-wiring half. Selector 28 of
    // the SAME ECL1.DAX#34/GEO1.DAX#34 the plain `cok` profile already boots into (a separate GameId
    // purely to isolate this route's own save/e2e state, the same convention as every other
    // `*-naturalN` leaf) has a unique GEO cell: (3,15), descriptor 0x9C. It is 22 legal directed-edge
    // steps from chooseStart's own (14,10,north) spawn for this exact block, crossing two harmless
    // one-shot flavour-text cells (selectors 27 and 30) that never gate movement or collide with this
    // encounter's own [0x4c55] bit 0x20 — no eclInitialMemory seeding required, unlike Secret's or
    // CoAB's middle routes. See docs/engine/research/cok-natural-route.md and
    // packages/engine/test/dungeonEvents.test.ts's "golden CoK ECL1 block 34 natural encounter
    // (descriptor 28)" for the byte-grounded chain this route replays live.
    eclPath: 'Champions of Krynn/ECL1.DAX',
    geoPath: 'Champions of Krynn/GEO1.DAX',
    walldefPath: 'Champions of Krynn/WALLDEF1.DAX',
    tilesPath: 'Champions of Krynn/8X8D1.DAX',
    monPath: 'Champions of Krynn/MON1CHA.DAX',
    spcPath: 'Champions of Krynn/MON1SPC.DAX',
    itmPath: 'Champions of Krynn/MON1ITM.DAX',
    itemPath: 'Champions of Krynn/ITEM1.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 34,
  },
  'cok-natural-2': {
    id: 'cok-natural-2',
    title: 'Champions of Krynn',
    engineGen: 'gen1-dax',
    profileId: 'champions-of-krynn',
    // BUILD-QUEUE.md's CoK middle-area leaf: a second, distinct-area natural route (ECL2/GEO2, not
    // ECL1/GEO1's own already-proven `cok-natural`). The campaign-route target map's own
    // first-sorted ECL2 candidate (`ECL2.DAX#48`, selector 45) was investigated and REJECTED: its
    // second dispatch table requires `[0x4c5c] != 0`, a flag set only by a different, undecodable
    // branch of ECL1.DAX#34 (a day-count guard whose false-branch opcode `0x41` is outside this
    // project's Gen1 opcode table — a genuine decode gap, not a reachable checkpoint). This profile
    // targets the next-best, fully self-contained candidate instead: `ECL2.DAX#49` selector 28,
    // whose own `[0x4c6e]` consumed bit is read AND written inside this same block. GEO2#49's
    // unique selector-28 cell (6,10) is a single legal directed-edge step from `chooseStart`'s own
    // (6,9,north) spawn for this block — no intermediate cells, no memory seeding required. The
    // encounter is a named story beat ("MYRTANI LAUGHS AT YOU FROM THE TOP OF A CIRCULAR
    // STAIRCASE. HE CARRIES THE DRAGONLANCE.") against BAAZ x5 + KAPAK x4. See
    // docs/engine/research/persistent-natural-routes.md's "CoK's Second Route (Middle)" and
    // packages/engine/test/dungeonEvents.test.ts's "golden CoK ECL2 block 49 natural encounter
    // (descriptor 28, middle route)" for the byte-grounded chain this route replays live.
    eclPath: 'Champions of Krynn/ECL2.DAX',
    geoPath: 'Champions of Krynn/GEO2.DAX',
    walldefPath: 'Champions of Krynn/WALLDEF2.DAX',
    tilesPath: 'Champions of Krynn/8X8D2.DAX',
    monPath: 'Champions of Krynn/MON2CHA.DAX',
    spcPath: 'Champions of Krynn/MON2SPC.DAX',
    itmPath: 'Champions of Krynn/MON2ITM.DAX',
    itemPath: 'Champions of Krynn/ITEM2.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 49,
  },
  'cok-natural-3': {
    id: 'cok-natural-3',
    title: 'Champions of Krynn',
    engineGen: 'gen1-dax',
    profileId: 'champions-of-krynn',
    // BUILD-QUEUE.md's CoK ending/late-area leaf: a third, distinct-area natural route (ECL3/GEO3,
    // CoK's own late-game archive — block numbering alone confirms it: ECL1 = 16-36, ECL2 = 48-68,
    // ECL3 = 80-99). Reachable cross-archive from a real ECL1.DAX#18 hub via `SAVE 5,0x7F12 ;
    // NEWECL 80` into ECL3.DAX#80 (game_area 5) — the same ADR-0009 mechanism CoAB's own hub
    // crossing uses — corroborated by ECL1.DAX#16's own 12-destination travel menu, whose index-9
    // entry names the identical dest_area/dest_block pair. `ECL3.DAX#82` (the richest ECL3 block,
    // 14 rostered CFG candidates) boots cleanly from its own default `initial_entry`, no
    // eclEntryOffset or eclInitialMemory seeding required.
    //
    // This is a forced TWO-STAGE gauntlet, not a single fight: selector 15's own three cells
    // (`(6,1)`, `(5,3)`, `(10,3)` — EVIL CHAMPION x5, ENCHANTER x2, EVIL PRIEST x2, and **SKYLA
    // x1**, a genuine named/unique monster) are each unreachable without first crossing a
    // selector-25 checkpoint (GHAST x2, ZOMBIE x4, SKELETAL KNIGHT x4, GHOUL x3) — confirmed by
    // `find_geo_path.py --avoid-event-index 25` failing for all three. The nearest selector-15
    // cell, `(5,3)`, is a real 22-step walk from `chooseStart`'s own `(1,1,north)` spawn for this
    // block. Investigated and REJECTED: selector 30 (SIR LEBAUM/MINOTAUR/GHAST) sits in a
    // disconnected 14-cell GEO component, unreachable from `chooseStart`. Investigated but NOT
    // pursued: `ECL3.DAX#98`'s MYRTANI-led squad (chaining into an apparent RED DRAGON encounter)
    // has no backing block in `GEO3.DAX` (which contains only [80, 81, 82, 96, 97, 99]), so its
    // reachability cannot be proven the same way. See
    // docs/engine/research/persistent-natural-routes.md's "CoK's Third Route (Ending)" and
    // packages/engine/test/dungeonEvents.test.ts's "golden CoK ECL3 block 82 (ending/late-area
    // route)" for the byte-grounded chain this route replays live.
    eclPath: 'Champions of Krynn/ECL3.DAX',
    geoPath: 'Champions of Krynn/GEO3.DAX',
    walldefPath: 'Champions of Krynn/WALLDEF3.DAX',
    tilesPath: 'Champions of Krynn/8X8D3.DAX',
    monPath: 'Champions of Krynn/MON3CHA.DAX',
    spcPath: 'Champions of Krynn/MON3SPC.DAX',
    itmPath: 'Champions of Krynn/MON3ITM.DAX',
    itemPath: 'Champions of Krynn/ITEM3.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 82,
  },
  'cok-natural-4': {
    id: 'cok-natural-4',
    title: 'Champions of Krynn',
    engineGen: 'gen1-dax',
    profileId: 'champions-of-krynn',
    // BUILD-QUEUE.md's CoK town leaf. Unlike CoAB (whose real cities are procedural — see
    // docs/engine/research/coab-town-classification.md), CoK ships several real GEO-backed
    // settlements. Two richer candidates were investigated and REJECTED as this leaf's
    // browser-wiring target: Sanction (`ECL3.DAX#80`/`GEO3.DAX#80`, four named shops) has a
    // `chooseStart` spawn — this same file's own most-open-edges heuristic, unmodified — that
    // lands in a 44-cell dock/water pocket structurally DISCONNECTED from the rest of the map
    // (BFS-confirmed; every cell in that pocket is descriptor 0, no interactive content at all),
    // the same class of rejection already applied to CoK's Third Route's own selector 30; Neraka
    // (`ECL2.DAX#64`/`GEO2.DAX#64`) is a linear one-shot cutscene with no repeatable in-town
    // state write.
    //
    // `ECL2.DAX#50` — part of the Gargath settlement complex (block 48 is "THE GATES OF
    // GARGATH"; block 49 is the already-promoted Second Route's "GARGATH KEEP") — is the
    // promotion target instead: a real walkable civilian district with four named shop signs
    // ("RED DAGGER INN", "JARLKRAND'S ALE HOUSE", "JELEK ARMOURY", "WILGARTEN'S MAGIC SHOP") and
    // a working `chooseStart` spawn, `(14,4,north)`, inside the map's main 211-cell walkable
    // component. The Ale House (masked descriptor 11, GEO cell `(3,12)`, raw floor byte `0x8b`)
    // is a single reachable 23-step walk from that spawn
    // (`tools/find_geo_path.py --geo GEO2.DAX --block 50 --start 14,4 --target 3,12 --facing
    // north --event-mask 0x3f`), crossing only harmless sign/flavour cells. Choosing 'YES' to a
    // drink performs a genuine persistent host-state write (`ADD #1, [0x4c84], [0x4c84]`, the
    // tavern-tale-index counter) before the tale even prints; leaving the settlement from any map
    // edge triggers the SAME real cross-archive exit mechanism CoK's Third Route hub crossing
    // uses — `SAVE #1, [0x7f12]` then `NEWECL 16` into CoK's own already-proven `ECL1.DAX#16`
    // wilderness/travel hub. See docs/engine/research/persistent-natural-routes.md's "CoK's
    // Fourth Route (Town)" and packages/engine/test/dungeonEvents.test.ts's "golden CoK ECL2
    // block 50 town action" / "golden CoK ECL2 block 50 town exit" for the byte-grounded chain
    // this route replays live.
    //
    // `edgeExit` (BUILD-QUEUE.md's map-edge live-crossing leaf, closed 2026-07-17): this profile's
    // own map has exactly two boundary cells with an open outward edge — `(0,0)` north and `(2,15)`
    // south (BFS-confirmed against `GEO2.DAX#50`'s real wall/door planes; every other boundary cell
    // is walled) — so `markMapEdgeExits` decorating the WHOLE perimeter only ever actually fires at
    // those two real gate cells, matching the retail `vm_run_1` behavior of checking on ANY
    // edge-of-map attempt rather than one named cell. `[0x7ed5]=1` matches the engine golden's own
    // seed exactly (`dialogueForVmRun1`'s own doc comment/`primeVmRun1`'s `SearchLocationOptions.
    // seedMemory`) — standing in for the retail host's own `tried_to_exit_map` computation, the SAME
    // "seed the host-computed condition directly" convention `crossWilderness`'s own doc comment
    // already uses for Pool's `[0x6dd5]`/`[0xc04d]`.
    eclPath: 'Champions of Krynn/ECL2.DAX',
    geoPath: 'Champions of Krynn/GEO2.DAX',
    walldefPath: 'Champions of Krynn/WALLDEF2.DAX',
    tilesPath: 'Champions of Krynn/8X8D2.DAX',
    monPath: 'Champions of Krynn/MON2CHA.DAX',
    spcPath: 'Champions of Krynn/MON2SPC.DAX',
    itmPath: 'Champions of Krynn/MON2ITM.DAX',
    itemPath: 'Champions of Krynn/ITEM2.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 50,
    edgeExit: { kind: 'vm_run_1', seedMemory: { 0x7ed5: 1 } },
  },
  'cok-natural-5': {
    id: 'cok-natural-5',
    title: 'Champions of Krynn',
    engineGen: 'gen1-dax',
    profileId: 'champions-of-krynn',
    // BUILD-QUEUE.md's wilderness/overland-transition leaf for CoK. The regenerated area-mode
    // scan finds 61 reachable `SAVE …,0x4BE6` sites in ECL1 blocks 16/17/18, including literal
    // zero writes. A GameLink-anchored retail trace proves the Throtl destination menu runs in
    // that genuine WildernessMap state (inDungeon=0), even though the player-facing presentation
    // is a modal coordinate picker, not a proven free-step terrain map. Keep the selector faithful
    // to that distinction rather than treating it as a fabricated dungeon or terrain walk.
    //
    // `ECL1.DAX#16`'s `search_location` entry (vaddr 0x82be, distinct from the block's own
    // `initial_entry` the First/Fourth Routes use) is exactly this picker: a manual linear search over
    // a 12-arm table (`GETTABLE` bases 0x8e72/0x8e7e, read straight off the block's own raw bytes)
    // matching `[0x4bc3]`/`[0x4bc4]` (a world-map coordinate pair) against each arm's `(x,y)` entry.
    // Two other general-menu arms were investigated and REJECTED as this leaf's promotion target: arm 7
    // (area4/block67, table match `(11,3)`) and arm 8 (area6/block99, table match `(16,8)`) both land in
    // tiny, disconnected 9-11-cell GEO pockets with EVERY real descriptor unreachable from `chooseStart`
    // — the same class of rejection CoK's own Fourth Route already applied to Sanction's dock pocket.
    // Arm 11's own table values are `(15,11)`, plus an extra gate `[0x4c37]==1` (a "this outpost has
    // been discovered" flag, the same seed-one-memory-cell convention this project's other routes
    // already use for their own unlocated preconditions — none of the other 11 arms check it). On a
    // match, the arm prints "YOU ARE NEAR ... . DO YOU ENTER?" (a real 2-choice confirm — unlike every
    // other menu-confirm in this file, index 0 is YES here, verified directly against the VM). Choosing
    // YES runs `SAVE #1,[0x4be6]` (inDungeon); `SAVE #4,[0x7f12]` (game_area, the usual ADR-0009
    // `setGameArea` effect); `NEWECL [0x4c25]` (`#68`).
    //
    // Unlike Pool's own wilderness-crossing profile (`pool-natural-4`, which boots straight into the
    // SAME block its `vm_run_1` dispatch lives in, because that block ALSO has a real walkable town
    // scene at its own `initial_entry`), `ECL1.DAX#16` is genuinely dispatch-only at EVERY entry point
    // — its `initial_entry` emits only `LOAD_FILES(127,127,127)` + a title picture, no `LOAD_PIECES`
    // (confirmed live: `loadDungeon` throws "emitted no LOAD_PIECES (WALLDEF) effect" for it). So this
    // profile boots into `ECL1.DAX#34` instead — the SAME real walkable dungeon the plain `cok` profile
    // already anchors on, same archive as block 16 — purely so the browser view has something to
    // render. The visible Travel control now renders block 16's own `PICTURE 121` from BIGPIC1 and
    // reads the complete 12-arm coordinate table from its embedded GETTABLE bytes; the older
    // `window.__explore.crossCokWilderness()` seam remains only as a deterministic arm-11 regression.
    // Both paths drive the REAL `search_location` dispatch on block 16 — the seam uses the golden's
    // exact coordinate/gate values (`[0x4bc3]=15`, `[0x4bc4]=11`, `[0x4c37]=1`) — landing in
    // `chainTargets[68]`: `ECL2.DAX#68`/`GEO2.DAX#68`, "THE OUTPOST", a military checkpoint never
    // claimed by any earlier CoK route. It is real, walkable content: `chooseStart (2,2,north)` sits
    // inside a 158-of-256-cell connected component; `initial_entry` opens on a scripted "THE OUTPOST
    // GUARDS STOP YOU AT THE ENTRANCE ... THEY ESCORT YOU TO THE COMMANDANT" cutscene, and nearby
    // reachable cells are real interactive content too (masked descriptors 33/34 open "YOU HAVE COME
    // ACROSS A CHECKPOINT..." guard confrontations; descriptor 1 opens "THE GUARDS WATCH YOU AS YOU
    // PASS."). See docs/engine/research/persistent-natural-routes.md's "CoK's Fifth Route
    // (Wilderness/Overland Crossing)" and packages/engine/test/dungeonEvents.test.ts's "golden CoK ECL1
    // block 16 search_location wilderness crossing into ECL2 block 68" for the byte-grounded chain this
    // route replays live.
    eclPath: 'Champions of Krynn/ECL1.DAX',
    geoPath: 'Champions of Krynn/GEO1.DAX',
    walldefPath: 'Champions of Krynn/WALLDEF1.DAX',
    tilesPath: 'Champions of Krynn/8X8D1.DAX',
    monPath: 'Champions of Krynn/MON1CHA.DAX',
    spcPath: 'Champions of Krynn/MON1SPC.DAX',
    itmPath: 'Champions of Krynn/MON1ITM.DAX',
    itemPath: 'Champions of Krynn/ITEM1.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 34,
    chainTargets: {
      68: {
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
    },
  },
  'cok-natural-6': {
    id: 'cok-natural-6',
    title: 'Champions of Krynn',
    engineGen: 'gen1-dax',
    profileId: 'champions-of-krynn',
    // Bounded final-landmark continuity, not a recovered fresh-campaign wilderness cadence.
    // ECL1#16's retail coordinate arm 3 writes [0x4c26]=1 and chains to ECL1#17. Starting from
    // the unresolved prior-campaign gate [0x4c5c]=0xff, six prior qualifying visits, and landmark
    // bits 1/2 already found, block 17's NORMAL initial_entry increments visit 6 -> 7, reaches its
    // own discovery loop, adds bit 0x10, and writes the Outpost gate [0x4c37]=1. The same live
    // travel host can then take arm 11 into ECL2#68 without seeding that discovery flag. The host
    // cadence and natural [0x4c5c] setter remain unlocated and must stay explicit gaps.
    eclPath: 'Champions of Krynn/ECL1.DAX',
    geoPath: 'Champions of Krynn/GEO1.DAX',
    walldefPath: 'Champions of Krynn/WALLDEF1.DAX',
    tilesPath: 'Champions of Krynn/8X8D1.DAX',
    monPath: 'Champions of Krynn/MON1CHA.DAX',
    spcPath: 'Champions of Krynn/MON1SPC.DAX',
    itmPath: 'Champions of Krynn/MON1ITM.DAX',
    itemPath: 'Champions of Krynn/ITEM1.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 34,
    eclInitialMemory: [[0x4c5c, 0xff], [0x4c28, 6], [0x4c29, 0x03]],
    chainTargets: {
      68: {
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
    },
  },
  dok: {
    id: 'dok',
    title: 'Death Knights of Krynn',
    engineGen: 'gen1-dax',
    profileId: 'death-knights-of-krynn',
    // DoK Gen1 DAX archives (same loader pipeline as CoK; format deltas handled in the engine).
    eclPath: 'Death Knights of Krynn/ECL1.DAX',
    geoPath: 'Death Knights of Krynn/GEO1.DAX',
    walldefPath: 'Death Knights of Krynn/WALLDEF1.DAX',
    tilesPath: 'Death Knights of Krynn/8X8D1.DAX',
    monPath: 'Death Knights of Krynn/MON1CHA.DAX',
    spcPath: 'Death Knights of Krynn/MON1SPC.DAX',
    itmPath: 'Death Knights of Krynn/MON1ITM.DAX',
    wizPath: 'Death Knights of Krynn/MON1WIZ.DAX',
    // DoK's 17-byte VOCAB-coded item table (reversed in B5) — a different format from CoK's records.
    itemPath: 'Death Knights of Krynn/ITEM0.DAX',
    itemFormat: 'dok-17',
    // ECL1 block 34 is a verified two-set dungeon init (GEO 34, 16×16) — see engine dungeon-dok.test.
    eclInitBlock: 34,
    // DoK uses the 1991+ short operand frames (0x1D=0 operands, 0x2C=1) — decoding with plain
    // ECL_GEN1 desyncs any stream crossing those opcodes (dok-natural-route.md, 2026-07-18 audit).
    eclDialect: 'gen1-short',
    frameLayout: DOK_FRAME_LAYOUT,
    moonTileGroups: [13, 21, 17],
    // Amiga disk1's 8x8d1.daa covers the same block ids as DOS 8X8D1.DAX (M9.S4). The boot/frame
    // tile sets (202/203) decode as real Amiga art; the 256-tile wall bank's 4-chunk Amiga layout
    // is unverified and intentionally left to the DOS fallback — see amigaTileFormat's doc comment.
    amigaTilesPath: 'amiga_extracted/DeathKnightsOfKrynn/disk1/8x8d1.daa',
    // DoK ships no RANDCOM on either platform.
    amigaDungcomPath: 'amiga_extracted/DeathKnightsOfKrynn/disk1/DUNGCOM.daa',
    amigaTileFormat: 'wide-frame',
    // A real westward step out through Gargath's boundary gate primes the native host's
    // tried-to-exit-map word. ECL1#36 vm_run_1 then asks "LEAVE THE OUTPOST?" and NEWECLs to
    // block 17, DoK's dispatch-only 38x15 overland layer.
    edgeExit: { kind: 'vm_run_1', seedMemory: { 0x7ed5: 1 } },
  },
  'dok-natural': {
    id: 'dok-natural',
    title: 'Death Knights of Krynn',
    engineGen: 'gen1-dax',
    profileId: 'death-knights-of-krynn',
    // DoK's FIRST proven natural-combat route — the long-blocked "Blocked prerequisite for CoK/DoK"
    // P2 leaf, DoK half (BUILD-QUEUE.md), unblocked by the 2026-07-18 per-game operand-table audit
    // (docs/engine/research/dok-natural-route.md "Update 9": DoK's short 0x1D/0x2C frames hid the
    // whole block-34 dispatch behind mis-decoded PARTYSTRENGTH sites). Same ECL1/GEO1 block 34
    // (Cekos) the plain `dok` profile already boots — a separate GameId purely to isolate this
    // route's own save/e2e state, the same convention as every other `*-natural` leaf. The unique
    // descriptor-12 GEO cell `(11,1)` (raw byte 0x8c) fires `search_location` ON_GOTO index 12 →
    // "SIVAKS ARE GATHERED AROUND A TABLE." → LOAD_MONSTER #33,#15,#33 (SIVAK ×15; a conditional
    // IGORF #97 only when [0x4c5e]==1, which a fresh game leaves clear) → COMBAT at 0x9327 →
    // victory resume ORs bit 3 into [0x4c5f] and prints a real silver-key reward beat. It is 17
    // legal directed-edge steps from chooseStart's own (2,1,north) spawn for this exact block
    // (find_geo_path.py --avoid-event-index 22, dodging the BLUE DRAGON town-guard chain at (8,1)),
    // crossing exactly one intermediate event cell — descriptor 11 at (10,4) — so no
    // eclInitialMemory seeding is required.
    // CORRECTION (2026-08-07): descriptor 11 is NOT the "silent no-op arm" this comment used to
    // claim. It is an optional street brawl, and it fires unconditionally — no memory value, seed,
    // facing or preceding initial_entry arm suppresses it: "YOU SEE TWO GUARDS IN A FIST FIGHT. A
    // CROWD CHEERS THEM ON." with choices JOIN / SNEAK PAST / LEAVE. JOIN *and* SNEAK PAST both
    // reach "THE CROWD NOTICES YOU. THEY'RE SIVAKS! THEY ATTACK!" → LOAD_MONSTER #33,#12,#33; only
    // LEAVE ("YOU LEAVE.") walks on. This route is unaffected because its e2e drives
    // `window.__explore.move()` directly and never answers the prompt, so the walk continues to
    // (11,1); the DoK campaign leg, which does drain dialogue, had to be taught to decline it.
    // NOTE the retail revisit semantic
    // differs from every earlier proven Gen1 route: the persisted bit does NOT consume the
    // encounter; it ARMS the SURPRISE instruction and the ambush refires (see
    // packages/engine/test/dungeonEvents.test.ts's "golden DoK ECL1 block 34 natural encounter
    // (descriptor 12, SIVAK route)" for the byte-grounded chain this route replays live). The
    // famous block-33 code-0x79 GOTO operand is NOT on this route (block 34's chain has none).
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
    eclInitBlock: 34,
    // Same 1991+ short-frame dialect as the plain `dok` profile — REQUIRED here: the whole route
    // only decodes under it (see the audit note on `dok`'s own eclDialect).
    eclDialect: 'gen1-short',
    frameLayout: DOK_FRAME_LAYOUT,
    moonTileGroups: [13, 21, 17],
  },
  'dok-natural-2': {
    id: 'dok-natural-2',
    title: 'Death Knights of Krynn',
    engineGen: 'gen1-dax',
    profileId: 'death-knights-of-krynn',
    // DoK's SECOND wired natural-combat route — the campaign matrix's MIDDLE leg
    // (docs/engine/research/persistent-natural-routes.md § "DoK's Fourth Route (Middle)",
    // dok-natural-route.md Update 14). ECL2.DAX#67's town-square ambush: the 2x2 masked-3 square
    // (8,7)/(9,7)/(8,8)/(9,8) (raw floor byte 0x03 — no 0x80 bit; the dispatch masks &0x3f)
    // fires `search_location` ON_GOTO arm 3 → a FACING gate (`COMPARE #1,[0xC04D]` = the retail
    // host facing register, ECL-visible ordinal 1 = east). Entering a square cell moving EAST →
    // "YOU HAVE GOTTEN BEHIND THE AMBUSH." → LOAD_MONSTER 70/43/66 (PATRIARCH x6, CRAZED DWARF
    // x10, BLACK MAGE x6 — DoK ships a single MON1CHA archive for all areas) → COMBAT at 0x87e7
    // → victory ORs bit 4 into [0x4C65] + "THE REST RUN AWAY." Any other facing takes the
    // harmless, non-consuming warning arm ("AS YOU ENTER THE SQUARE... AN AMBUSH!"), so the
    // proven walk enters the square frontally from the north and converts inside it: 13 legal
    // directed-edge steps from this block's OWN scripted arrival (`initial_entry` SAVEs
    // x=10,y=0,facing=south at 0x805e-0x8076 — the startPose below is byte-grounded, not the
    // chooseStart heuristic) to (9,7), then west to (8,7), then east back into (9,7) → combat.
    // The walk crosses exactly two nonzero intermediate descriptors — (11,5)/(9,6), both masked
    // 9, VM-proven silent no-ops (text-free, combat-free, scratch-only writes). Same
    // does-not-consume revisit semantic as `dok-natural`: bit 4 ARMS the guarded SURPRISE and
    // the ambush re-fires. This leg was previously mis-diagnosed as blocked on an unprovable
    // "cross-block precondition [0xC00D]" — a transcription slip for [0xC04D], the facing
    // register (see the goldens in packages/engine/test/dungeonEvents.test.ts, "golden DoK ECL2
    // block 67 middle-area ambush").
    eclPath: 'Death Knights of Krynn/ECL2.DAX',
    geoPath: 'Death Knights of Krynn/GEO2.DAX',
    // ECL2#67's LOAD_PIECES requests wall set 1 — DoK numbers wall sets GLOBALLY across disks
    // (WALLDEF1.DAX=[block 1], WALLDEF2.DAX=[3,4], WALLDEF3.DAX=[5,6]), so a disk-2 area still
    // pulls disk 1's WALLDEF/tile bank. Same pair the base `dok` profile mounts.
    walldefPath: 'Death Knights of Krynn/WALLDEF1.DAX',
    tilesPath: 'Death Knights of Krynn/8X8D1.DAX',
    monPath: 'Death Knights of Krynn/MON1CHA.DAX',
    spcPath: 'Death Knights of Krynn/MON1SPC.DAX',
    itmPath: 'Death Knights of Krynn/MON1ITM.DAX',
    wizPath: 'Death Knights of Krynn/MON1WIZ.DAX',
    itemPath: 'Death Knights of Krynn/ITEM0.DAX',
    itemFormat: 'dok-17',
    eclInitBlock: 67,
    // Same 1991+ short-frame dialect as every DoK profile — REQUIRED (Update 9 audit).
    eclDialect: 'gen1-short',
    frameLayout: DOK_FRAME_LAYOUT,
    moonTileGroups: [13, 21, 17],
    startPose: { x: 10, y: 0, facing: 'south' },
  },
  coab: {
    id: 'coab',
    title: 'Curse of the Azure Bonds',
    engineGen: 'gen1-dax',
    profileId: 'curse-of-the-azure-bonds',
    // Area 1 is wilderness-only and therefore ships no GEO1/WALLDEF1. ECL2 block 1 is the first
    // retail-byte-proven dungeon route: LOAD_FILES 1,2,255 and LOAD_PIECES 1,2,3.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/ECL2.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/GEO2.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/WALLDEF2.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D2.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON2CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON2SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON2ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/ITEM2.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 1,
  },
  'coab-natural': {
    id: 'coab-natural',
    title: 'Curse of the Azure Bonds',
    engineGen: 'gen1-dax',
    profileId: 'curse-of-the-azure-bonds',
    // P2.3 keeps the ECL2#1 exploration smoke above intact and adds a separate natural encounter
    // route in area 4: GEO descriptor 0x94 -> HOODED MEDUSA/GRIFFON -> COMBAT -> exact resume.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/ECL4.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/GEO4.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/WALLDEF4.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D4.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON4CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON4SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON4ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/ITEM4.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 37,
    eclInitialMemory: [[0x4cf4, 0]],
  },
  'coab-natural-2': {
    id: 'coab-natural-2',
    title: 'Curse of the Azure Bonds',
    engineGen: 'gen1-dax',
    profileId: 'curse-of-the-azure-bonds',
    // BUILD-QUEUE item 6's second leaf: the campaign-route target map's static (walls-only) BFS
    // named area-2 selector 7, cell (3,13), as the "middle" candidate, but a directed-BFS replay
    // proved that cell is NOT reachable fresh from chooseStart (1,1) — every legal route to it
    // crosses area-2 selector 4's cell (4,12) first, a "SURRENDER Y/N" Fire Knives checkpoint whose
    // YES branch merges into the exact same decoded tail (SETUP_MONSTER/LOAD_MONSTER/TREASURE/
    // COMBAT 0x838e, resume 0x838f) as selector 7's own script. So this profile targets the
    // checkpoint (block 4, same ECL2/GEO2 archives as the plain `coab` profile, whose own
    // eclInitBlock 1 is a different, wilderness-adjacent dungeon entry).
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/ECL2.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/GEO2.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/WALLDEF2.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D2.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON2CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON2SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON2ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/ITEM2.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 4,
    eclInitialMemory: [[0x4cff, 0]],
  },
  'coab-natural-3': {
    id: 'coab-natural-3',
    title: 'Curse of the Azure Bonds',
    engineGen: 'gen1-dax',
    profileId: 'curse-of-the-azure-bonds',
    // ADR-0009's wilderness-transition leaf: the real cross-archive crossing the engine golden
    // (`dungeonEvents.test.ts`, "runEclChain — golden ADR-0009 cross-archive crossing") proved byte
    // for byte — ECL4.DAX#37's own `initial_entry` reaches a real SHOP/EXPLORE then RETURN-TO-DAGGER
    // FALLS/GO-TO-THE-TOWER menu pair; index 0 both times walks straight to `SAVE 1,0x7F12; NEWECL 80`
    // (game_area 4 -> 1, the wilderness hub, which ships no GEO1/WALLDEF1 — menu/ON_GOTO dispatch
    // only). The hub's own destination-selector dispatch (seeded below) then reaches
    // `SAVE 1,0x4BE6; SAVE 5,0x7F12; NEWECL 49` (game_area 1 -> 5), landing in ECL5.DAX#49's real
    // walkable GEO5 town ("...PAST SHUTTERED WINDOWS. NO ONE IS ABOUT.").
    //
    // `archiveSet` (not the single-archive fields above) drives this profile's boot: `explore.ts`'s
    // `startExplore` sees `gd.archiveSet` and routes through `startCrossArchiveExplore` instead of
    // the ordinary single-archive fetch. The single-archive `eclPath`/`geoPath`/… fields still have
    // to be present (the `GameData` interface requires them) — they're never read on this route, so
    // they're just area 4's own paths (same as `coab-natural`) for documentation/type-checking only.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/ECL4.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/GEO4.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/WALLDEF4.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D4.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON4CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON4SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON4ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/ITEM4.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 37,
    // Mirrors the golden test's exact seed memory (`dungeonEvents.test.ts` lines ~438-444):
    //   0x4c20 -> 0x2a  synthetic quest flag "written during ECL4#37" — an otherwise-untouched cell
    //                   in Area1's persistent quest-flag range (0x4B00..0x4EFF, ADR-0009
    //                   Consequences) — the multi-area persistence proof for this route.
    //   0x4c9c -> 9     hub destination selector -> ECL5#49 (game_area 5).
    //   0x4c0c -> 1     hub "confirm travel" flag -> skip the interactive travel/city menu.
    eclInitialMemory: [
      [0x4c20, 0x2a],
      [0x4c9c, 9],
      [0x4c0c, 1],
    ],
    archiveSet: {
      dir: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds',
      areas: [1, 4, 5],
      startGameArea: 4,
    },
  },
  'coab-natural-4': {
    id: 'coab-natural-4',
    title: 'Curse of the Azure Bonds',
    engineGen: 'gen1-dax',
    profileId: 'curse-of-the-azure-bonds',
    // BUILD-QUEUE item 6's ending/late-area leaf, browser wiring (previously deferred — see
    // `docs/engine/research/persistent-natural-routes.md`'s "CoAB's Fourth Route"). The campaign-
    // route target map named area 6, ECL6.DAX#64, GEO cell (6,14) descriptor 0x82, as CoAB's
    // "ending/late" candidate; unlike the middle route's own JSON candidate (rejected), this cell IS
    // the legally-reachable entry point, re-derived directly against the real engine
    // (`tools/find_geo_path.py --geo GEO6.DAX --block 64 --start 12,6 --target 6,14 --facing north
    // --avoid-event-index <every other masked descriptor 1..22>`, a real 14-step wall-legal path).
    // Reachability into ECL6.DAX itself is the hub's own real dispatch (ECL1.DAX#80's destination
    // ON_GOTO on mem[0x4C9B], index 13: `SAVE 1,0x4BE6; SAVE 6,0x7F12; NEWECL 64`), proven by the
    // engine golden `runEclChain` test (`packages/engine/test/dungeonEvents.test.ts`, "golden
    // ending/late-area cross-archive crossing") — `visited === [37, 80, 64]`. Like `coab-natural`
    // and `coab-natural-2` before it (which also load straight into their target ECL/GEO block
    // rather than replaying the full hub crossing in the browser), this profile targets ECL6/GEO6
    // directly: single-archive, `chooseStart` on GEO6#64 independently derives the same (12,6)
    // facing north spawn `find_geo_path.py` used.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/ECL6.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/GEO6.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/WALLDEF6.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D6.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON6CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON6SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/MON6ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/ITEM6.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 64,
    // Mirrors the engine golden's exact seed (`dungeonEvents.test.ts`, "golden CoAB ECL6 block 64
    // (ending/late-area route)"): [0x4CBE] is the "already fought the spider" flag, [0x4CBF] is the
    // two-stage encounter's own consumed word — both start clear (fresh-visit precondition).
    eclInitialMemory: [[0x4cbe, 0], [0x4cbf, 0]],
  },
  gateway: {
    id: 'gateway',
    title: 'Gateway to the Savage Frontier',
    engineGen: 'gen1-dax',
    profileId: 'gateway-to-the-savage-frontier',
    // Canonical campaign-backed route: the GameLink-only retail capture entered Sundabar as
    // ECL5/GEO5 block 19 at (15,2,W), then legally walked to descriptor 18's FIGHT/LEAVE tavern
    // encounter. Descriptor 18 resumes through native CALL 0x401F (movePositionForward); descriptor
    // 122 owns the route's persisted [4C6C] consumed flag. The numbered bank supplies area walls,
    // while Gateway's shared 8X8D1 archive supplies its proven block-201 font/block-202 frame.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/ECL5.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/GEO5.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/WALLDEF5.DAX',
    sharedWalldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/WALLDEF.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D5.DAX',
    sharedTilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D.DAX',
    framePath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D1.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON5CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON5SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON5ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/ITEM5.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 19,
    // Same 1991+ short-form dialect family as DoK/Treasures/PoD for 0x1D/0x22/0x2C (Gateway's own
    // reachable ECL never uses 0x1D/0x2C — 2026-07-18 audit: zero occurrences — so those stay
    // family-consistent, not behavior-changing on current data). Split off plain 'gen1-short' on
    // 2026-07-23: Gateway keeps the LONG 3-operand 0x0C SETUP_MONSTER frame (237/238 reachable
    // sites are only clean under 3-op) where DoK/Treasures/PoD are proven 4-op — see
    // ECL_GEN1_SHORT_GATEWAY's doc comment in disassemble.ts.
    eclDialect: 'gen1-short-gateway',
    frameLayout: GATEWAY_FRAME_LAYOUT,
    // No retail moon-disc placement has been calibrated for Gateway's different frame bank.
    moonTileGroups: null,
    // Exact post-wilderness Sundabar arrival observed in the GameLink campaign capture. The other
    // initial-entry branch's (0,10,E) is not valid for this captured incoming state.
    startPose: { x: 15, y: 2, facing: 'west' },
    // Captured incoming transition: previous ECL 21, facing west, all three nested arrival guards
    // clear. ECL5#19's own initial_entry then writes (15,2) for this branch. The host advances
    // [4BF2] to current block 19 after that entry runs; [4C6C] is descriptor 122's separate Griffon
    // consumed word. Live C04B..C04F registers are refreshed from Explorer before every event.
    eclInitialMemory: [[0x4bf2, 21], [0xc04d, 3], [0x4c27, 0], [0x4c79, 0], [0x4cf5, 0], [0x4c6c, 0]],
  },
  'gateway-natural': {
    id: 'gateway-natural',
    title: 'Gateway to the Savage Frontier',
    engineGen: 'gen1-dax',
    profileId: 'gateway-to-the-savage-frontier',
    // Gateway's script-derived Sundabar arrival route. Same ECL5.DAX/GEO5.DAX block 19 the plain
    // `gateway` profile already boots (a separate GameId purely to isolate this route's own
    // save/e2e state, the same convention as every other `*-natural` leaf), but entered at the
    // pose ECL5#19 WRITES for itself rather than the pose the GameLink capture happened to arrive
    // with. Vaddrs below are ECL5.DAX block 19, vbase 0x7FFE (block byte 0 -> 0x7FFE, so
    // initial_entry pointer 0x8014 resolves to block offset 22), dialect ECL_GEN1_SHORT_GATEWAY.
    //
    // (a) `eclInitialMemory` seeds [0x4BF2] (LastEclBlockId) = 21. initial_entry at 0x8014 runs
    //     `SAVE #1 -> [0x4BE6]` (0x802F), `LOAD_FILES 19,2,255` (0x8035, opcode 0x21 with three
    //     immediates `00 13 / 00 02 / 00 ff`), `LOAD_PIECES 7,15,30` (0x803F, `37 00 07 00 0f 00
    //     1e`), then two guards on [0x4BF2]: `COMPARE [0x4BF2],#19 / IF_EQ / GOTO 0x8115` (0x8047,
    //     the same-area resume arm — not us), and next `COMPARE [0x4BF2],#21 / IF_EQ / GOTO
    //     0x8071`, the arrival branch taken when the party came from ECL6#21's "ENTER SUNDABAR?"
    //     wilderness NEWECL. Seeding 21 is what selects that arm; leaving [0x4BF2] clear drops
    //     through to the block's unrelated default (7,11) north entry instead.
    // (b) `startPose` is NOT a chosen spawn. On cold memory the 0x8071 arrival branch falls through
    //     to the script's own three position writes: 0x8087 `SAVE #1 -> [0xC04D]` (facing = 1 =
    //     east), 0x808D `SAVE #10 -> [0xC04C]` (mapPosY = 10), 0x8093 `SAVE #0 -> [0xC04B]`
    //     (mapPosX = 0) — i.e. (0,10) facing east, Sundabar's west city gate. Byte-derived, unlike
    //     `treasures-natural`'s `startPose`, which is a heuristically *picked* best-open-edges cell
    //     inside the target's component (see that entry's own comment and `startPose`'s doc above).
    // (c) The override is still REQUIRED, for the same structural reason as Treasures: GEO5.DAX#19's
    //     wall graph is not one connected region — it decomposes into 4 components of 211/32/12/1
    //     cells, and `explore.ts`'s `chooseStart` most-open-edges row-major tie-break lands on (9,0),
    //     which sits in the 32-cell component and has NO path to either encounter cell (both are in
    //     the 211-cell component). Without `startPose` this route is unwalkable, not merely longer.
    // (d) Two encounter descriptors, both reached through `search_location` at 0x8127, which masks
    //     the host-populated cell byte (`AND #127, [0xC04F] -> [0x4C02]`) and `ON_GOTO`s descriptors
    //     0..28, with a second `SUBTRACT #121, [0x4C02] -> [0x7F79]` + `ON_GOTO` table at 0x819F for
    //     121..127. Descriptor 18, GEO backdrop byte 0x92 at (9,8) -> 0x8BE9: `PICTURE 6`,
    //     PRINTCLEAR "WHAT'LL IT BE?", HORIZONTAL_MENU [FIGHT, LEAVE] at 0x8C07 (dest [0x7F79]),
    //     `ON_GOTO` at 0x8C19 -> [0x8C25 (fight), 0x8277 (leave)]; the fight arm does CLEARMONSTERS,
    //     SETUP_MONSTER(255,0,255), LOAD_MONSTER(4,3,4) -> MON5CHA.DAX block 4 "ZHENTIL FIGHTER" x3,
    //     COMBAT at 0x8C34. It writes NO persistent flag, so it is legally repeatable. Descriptor
    //     122, GEO byte 0x7A at (6,14) -> 0x95D1, the one-shot: `COMPARE [0x4C6C],#1` (0x95D1) /
    //     `IF_EQ` (0x95D7) / `EXIT` (0x95D8) when already consumed, else `SAVE #1 -> [0x4C6C]`
    //     (0x95D9) marks it consumed BEFORE the fight, prints the collapsed-ceiling narration
    //     (0x95DF), then CLEARMONSTERS / SETUP_MONSTER(255,1,255) / LOAD_MONSTER(42,3,42) ->
    //     MON5CHA.DAX block 42 "GRIFFON" x3, COMBAT at 0x9686, GOTO 0x826E. That [0x4C6C] word is
    //     the route's persistence assertion across save/reload.
    //     The walk is cardinal and byte-checked against GEO5#19's backdrop plane (block offset
    //     2+512+y*16+x, masked &127): (0,10) -> (9,8) in 11 steps E E E E E E E E N E N crossing
    //     descriptors 5 7 1 11 1 1 22 25 24 1 17 (pure PRINTCLEAR/EXIT flavour, or the inert
    //     `COMPARE [0x4C27],#15 / IF_* / EXIT` guards, on cold memory), then (9,8) -> (6,14) in 9
    //     steps S S S S S W W W S crossing 17 1 1 1 1 27 1 0. Both legs deliberately avoid this
    //     map's only other COMBAT-reaching descriptors, 14 at (2,2) and 16 at (14,11).
    // (e) 0x803F's LOAD_PIECES (7,15,30) spans two archives — WALLDEF5.DAX carries block ids
    //     [4,7,9,16] and 8X8D5.DAX [4,5,7,9,16], while sets 15 and 30 exist only in the shared
    //     WALLDEF.DAX / 8X8D.DAX pair ([5,15,30], verified by TOC dump) — and all three resolve.
    //     (Corrected 2026-08-02: an earlier revision of this paragraph claimed sets 15/30 render
    //     blank because the lookup was single-archive and `loadDungeonWalls` degraded silently.
    //     Both halves of that claim are false against the code.) `startExplore` merges
    //     `sharedWalldefPath`/`sharedTilesPath` into ONE lookup namespace before building
    //     `DungeonSources`: `allWdIdx` at explore.ts:5968 (`new Map([...sharedWdIdx, ...wdIdx])`,
    //     fed to `walldefBlockFor`) and `allTileIdx` at explore.ts:5964 (`new Map([...sharedTilesIdx,
    //     ...tiles.blocks])`, fed to `tileBlock`); local ids win only on overlap, and today the sets
    //     are disjoint. And `loadDungeonWalls` (packages/engine/src/world/dungeonWalls.ts:154-159)
    //     THROWS `WALLDEF block <id> (set <s>) not found` on a genuinely missing non-sentinel block
    //     rather than degrading — only the 0x7F default-set sentinel is allowed to come up empty —
    //     so this profile booting at all already proves 15 and 30 were found. The e2e case
    //     `explore-gateway-natural-combat` pins it directly: `window.__explore.wallTileSets()`
    //     (explore.ts:6380, `walls.tileSets.slice(1,4).map(set => set !== null)`) returns
    //     `[true, true, true]`, which also covers the 8X8D half — `loadTiles` DOES degrade a missing
    //     tile block to null (dungeonWalls.ts:125), so a null there would have shown up as `false`.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/ECL5.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/GEO5.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/WALLDEF5.DAX',
    sharedWalldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/WALLDEF.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D5.DAX',
    sharedTilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D.DAX',
    framePath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D1.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON5CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON5SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON5ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/ITEM5.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 19,
    eclDialect: 'gen1-short-gateway',
    frameLayout: GATEWAY_FRAME_LAYOUT,
    // No retail moon-disc placement has been calibrated for Gateway's frame bank (same honest
    // absence as the plain `gateway` profile).
    moonTileGroups: null,
    eclInitialMemory: [[0x4bf2, 21]],
    startPose: { x: 0, y: 10, facing: 'east' },
  },
  'gateway-amiga': {
    id: 'gateway-amiga',
    title: 'Gateway to the Savage Frontier',
    engineGen: 'gen1-dax',
    profileId: 'gateway-to-the-savage-frontier',
    // Gateway's DOS-EGA <-> Amiga wall-art route. A separate GameId purely to isolate this route's
    // own save/graphics-choice state, the same convention as every `*-natural` leaf.
    //
    // WHY THIS AREA AND NOT THE CAMPAIGN ONE. The toggle needs a set of Amiga banks that stand in
    // for the DOS banks slot-for-slot, and 25 of Gateway's 26 paired banks do (see
    // `packages/engine/test/gatewayAmigaWallArt.test.ts`). The single exception is block 15, whose
    // Amiga bank carries real art in slots 186-189 that the DOS bank pads flat, so mounting it would
    // paint wall where the DOS build paints none. `gateway`/`gateway-natural` both run ECL5#19,
    // whose `LOAD_PIECES #7,#15,#30` pulls in exactly that one, so neither can host the toggle; the
    // `bankSwapParity` guard in `buildGlibWallGraphics` refuses it there rather than trusting this
    // comment. ECL2.DAX#2 is the largest area whose `LOAD_PIECES` (#3,#3,#3 at opcode 0x37) uses
    // only clean banks, and its Amiga bank 3 is a COMPLETE redraw — every painted wall tile in
    // GEO2#2 differs from DOS, with zero padding/painted disagreements.
    //
    // `startPose` is byte-derived, not picked: ECL2#2's initial_entry writes its own default pose
    // as three `SAVE #imm -> [addr]` frames (`09 00 <imm> 01 <lo> <hi>`) at block offset 0xef —
    // #13 -> [0xC04B] (x), #15 -> [0xC04C] (y), #0 -> [0xC04D] (facing = north). The same encoding
    // read out of ECL5#19 reproduces its documented (7,11) north fall-through, which is what
    // confirms the decoding. (13,15) sits in a 6-cell pocket of GEO2#2 rather than its 99-cell main
    // component, which is fine here: the route exists to show wall art, the cell has walls on two
    // edges and 624 wall-tile blits across its four facings, and north/west are open to walk.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/ECL2.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/GEO2.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/WALLDEF2.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D2.DAX',
    framePath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D1.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON2CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON2SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON2ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/ITEM2.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 2,
    eclDialect: 'gen1-short-gateway',
    frameLayout: GATEWAY_FRAME_LAYOUT,
    moonTileGroups: null,
    // DiskC's master holds the area wall banks (DiskA's same-named file is only the 202/203
    // frame/font blocks). The palette is NOT in it — see `amigaGlibPalettePath`.
    amigaGlibTilesPath:
      'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskC/Walls.tlb',
    amigaGlibPalettePath:
      'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/GatewayToSavageFrontier/data/DiskA/Always.tlb',
    startPose: { x: 13, y: 15, facing: 'north' },
  },
  'gateway-quest': {
    id: 'gateway-quest',
    title: 'Gateway to the Savage Frontier',
    engineGen: 'gen1-dax',
    profileId: 'gateway-to-the-savage-frontier',
    // R3: promotes `packages/engine/test/gatewayQuestFlag.test.ts`'s cross-archive [0x4C21]
    // "Amanitas rescued" proof to a live browser route (`docs/engine/research/
    // gateway-quest-flag.md` §12). A separate GameId purely to isolate this route's own
    // save/e2e state, the same convention as every `*-natural`/`gateway-amiga` leaf.
    //
    // PHASE 1 (this boot): Everlund's undercity, `ECL3.DAX#5`/`GEO3.DAX#5`, mounted ONE legal
    // step short of the rescue cell rather than on it — `tools/find_geo_path.py --geo GEO3.DAX
    // --block 5 --start 5,14 --target 5,13 --facing north --event-mask 127` -> step_count 1,
    // zero blocked cells, landing on `(5,13)`'s real descriptor 121 (masked `&0x7F`, golden test
    // C/K) with the SAME dispatch facing ('north') the engine golden primes. A single `forward`
    // move (not a spawn placed directly on the cell) triggers the rescue exactly as retail would.
    // No `eclInitialMemory` is seeded: golden test D primes this handler from a fresh empty Map,
    // and `startPose` below overrides whatever pose ECL3#5's own `initial_entry` would otherwise
    // pick (its real arrival is the unrelated (8,15,north) captured re-entry — §2d — not asserted
    // here, since the 29-step walk from there is reported, not asserted, in the golden itself).
    //
    // PHASE 2 (live handover, NOT this profile's boot config): on the rescue's victory,
    // `resolveCombat`'s `activeGame.id === 'gateway-quest'` hook in `explore.ts` reads the
    // just-written `[0x4C21]` and, only when it is 1, re-mounts Yartar via
    // `switchGen1Area('gateway', <GEN1_BASE_GAMES.gateway disk 2>, 1, ...)`, seeding
    // `[0x4BF2]=21`/`[0x03B2]=2` (LastEclBlockId / entry facing — the exact host inputs golden
    // test G seeds before booting `ECL2.DAX#1`'s own `initial_entry`) and landing the byte-
    // grounded north-gate re-entry spawn `(11,0,south)` (test G: `[0xC04B]=11`, `[0xC04C]=0`).
    // This crossing is MODELLED, not natively observed: the retail path from Everlund back to
    // Yartar runs through the overland wilderness (ECL6#21), which this route does not walk — see
    // §12's own disclosure and `docs/engine/research/gateway-quest-flag.md` §10's boundary note.
    //
    // NEGATIVE ARM: `?explore=gateway-quest&yartar=1` (`startGatewayQuestYartarControl` in
    // `explore.ts`) skips Everlund and mounts Yartar directly at the same (11,0,south) spawn with
    // the same [0x4BF2]/[0x03B2] seed but WITHOUT [0x4C21] — golden test F's "Amanitas never
    // rescued" precondition — so the browser's two-arm proof can exercise the flag-clear fork.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/ECL3.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/GEO3.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/WALLDEF3.DAX',
    sharedWalldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/WALLDEF.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D3.DAX',
    sharedTilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D.DAX',
    framePath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/8X8D1.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON3CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON3SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/MON3ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/ITEM3.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 5,
    eclDialect: 'gen1-short-gateway',
    frameLayout: GATEWAY_FRAME_LAYOUT,
    // No retail moon-disc placement has been calibrated for Gateway's frame bank (same honest
    // absence as the plain `gateway`/`gateway-natural` profiles).
    moonTileGroups: null,
    startPose: { x: 5, y: 14, facing: 'north' },
  },
  pool: {
    id: 'pool',
    title: 'Pool of Radiance',
    engineGen: 'gen1-dax',
    profileId: 'pool-of-radiance',
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/ECL1.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/GEO1.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/WALLDEF1.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D1.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON1CHA.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON1ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/ITEM1.DAX',
    itemFormat: 'cok-63',
    // Real GOG DOS route: ECL1 block 18, explicit non-Krynn entry offset 0x73.
    eclInitBlock: 18,
    eclEntryOffset: 0x73,
    eclDialect: 'pool',
    // Retail block-18 encounter state: first visit permits the GREET/ATTACK event and the native
    // host sentinel enables its guarded branch. The natural-route golden pins both values.
    eclInitialMemory: [[0x4a38, 0], [0x4a35, 0xff]],
  },
  'pool-natural-2': {
    id: 'pool-natural-2',
    title: 'Pool of Radiance',
    engineGen: 'gen1-dax',
    profileId: 'pool-of-radiance',
    // BUILD-QUEUE item 6's "repeat the matrix" leaf: Pool's middle-area candidate. Like CoAB's own
    // middle-route leaf (and UNLIKE Secret's own middle-route leaf), the campaign-route target
    // map's literal candidate — area-2 selector 14, cell (1,5), COMBAT 0xabf7 — does NOT hold up
    // under real-engine re-verification: `tools/find_geo_path.py --avoid-event-index 13` proves
    // (1,5) is unreachable from `chooseStart` without first stepping onto one of THREE selector-13
    // cells, the nearest of which — (0,7), 25 of the 28 steps toward (1,5) — is itself a genuine
    // ORC/ORC LEADER combat checkpoint ("GUARDS RUN TO INTERCEPT YOU."). This profile targets that
    // checkpoint (same ECL2/GEO2 archives as the plain `pool` profile, whose own eclInitBlock 18 is
    // a different, area-1 dungeon entry).
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/ECL2.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/GEO2.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/WALLDEF2.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D2.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON2CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON2SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON2ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/ITEM2.DAX',
    itemFormat: 'cok-63',
    // ECL2#20's default header entry is a region-state dispatcher that exits on a synthetic
    // direct boot. Its map-owning initialisation leg begins at raw offset 0x160 and emits
    // LOAD_FILES(20,2,0xff) followed by LOAD_PIECES(2,4,1).
    eclEntryOffset: 0x160,
    eclInitBlock: 20,
    eclDialect: 'pool',
    // Mirrors the engine golden's exact seed (`dungeonEvents.test.ts`, "golden Pool ECL2 block 20
    // (middle-area route)"): [0x4acf] is this checkpoint's own consumed word, starting clear (the
    // fresh-visit precondition the guarded EXIT at 0xab4f requires to be skipped).
    eclInitialMemory: [[0x4acf, 0]],
  },
  'pool-natural-3': {
    id: 'pool-natural-3',
    title: 'Pool of Radiance',
    engineGen: 'gen1-dax',
    profileId: 'pool-of-radiance',
    // BUILD-QUEUE item 6's ending/late-area leaf for Pool. The campaign-route target map names area
    // 8, ECL8.DAX#29, GEO cell (7,8) descriptor 0x02, as the literal "ending/late" candidate. Like
    // CoAB's and Secret's own ending-route leaves (and Pool's own middle-route leaf), that literal
    // cell does NOT hold the real dispatch: ECL8#29's search_location masks the floor byte then
    // GETTABLE-indexes an embedded lookup table to pick the ON_GOTO arm (a third dispatch shape,
    // distinct from the simple AND+ON_GOTO and the manual linear-search loop Pool's middle route
    // hit) — masked descriptor 2 maps to the SHARED "sense of danger" arm, not the real combat arm,
    // which only masked descriptor 1 reaches. That cell is (7,7), one step north of the JSON's own
    // (7,8), reachable in 9 legal directed-edge steps from chooseStart (11,2) facing north
    // (`tools/find_geo_path.py --geo GEO8.DAX --block 29 --start 11,2 --target 7,7 --facing north`).
    // A genuine two-wave KOBOLD x6 + KOBOLD LEADER x3 fight (same roster both times), consumed bit
    // set only after BOTH waves. Needs an explicit eclEntryOffset: the block's default VM entry
    // (vm_run_1) is a no-op on a synthetic fresh boot (exits before ever emitting LOAD_FILES); file
    // offset 0x35d is the block's own straight-line "normal in-area boot" leaf
    // (LOAD_FILES(29,2,0xff)/LOAD_PIECES(3,0x14,1)/EXIT, no compares before it, so it is
    // deterministic regardless of memory state) — independently re-derived here from block 29's own
    // disassembly, not copied from the separate (reverted) pool-natural-2 entry-offset attempt.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/ECL8.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/GEO8.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/WALLDEF8.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D8.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON8CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON8SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON8ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/ITEM8.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 29,
    eclEntryOffset: 0x35d,
    eclDialect: 'pool',
    // Mirrors the engine golden's exact seed (`dungeonEvents.test.ts`, "golden Pool ECL8 block 29
    // (ending/late-area route)"): [0x4a23] is this checkpoint's own consumed word (bit 0x1), starting
    // clear (the fresh-visit precondition the guarded diversion at 0xa2db requires to be skipped).
    eclInitialMemory: [[0x4a23, 0]],
  },
  'pool-natural-4': {
    id: 'pool-natural-4',
    title: 'Pool of Radiance',
    engineGen: 'gen1-dax',
    profileId: 'pool-of-radiance',
    // BUILD-QUEUE item 6's town-enter/exit leaf for Pool. Following CoAB's own method
    // (`tools/map_gen1_area_mode_writes.py` — zero hits for Pool's own ECL corpus), Pool's very
    // first area — `ECL1.DAX#18`/`GEO1.DAX#18`, the SAME block the plain `pool` profile already
    // boots into — turns out to BE a real, discrete, GEO-backed town ward (New Phlan's Slums), not
    // a wilderness/dungeon map: masked descriptor 4, cell `(1,15)`, is a hidden Temple of Ilmater
    // ("ARE YOU IN NEED OF HEALING?"). This profile targets the SAME archives/entry as `pool` (a
    // separate `GameId` purely to isolate this route's own save/e2e state from the plain early-
    // anchor route's, same convention as every other `pool-natural-N` leaf), so the party can walk
    // to the Temple cell instead of the early-anchor's own (14,8) target. See
    // `docs/engine/research/persistent-natural-routes.md`'s "Pool's Fourth Route" section.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/ECL1.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/GEO1.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/WALLDEF1.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D1.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON1CHA.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON1ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/ITEM1.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 18,
    eclEntryOffset: 0x73,
    eclDialect: 'pool',
    // Mirrors the engine golden's exact seed (`dungeonEvents.test.ts`, "golden Pool ECL1 block 18
    // (town-ward Temple route)"): [0x4a1a] is the Temple's own discovery flag, starting clear (the
    // fresh-visit precondition the guarded `IF_NE` branch at 0xadab requires).
    eclInitialMemory: [[0x4a1a, 0]],
    // BUILD-QUEUE item 6's wilderness-crossing LIVE WIRING (the "mid-walk chain re-mount"
    // capability): `ECL1.DAX#18`'s own `vm_run_1` (triggered live via `window.__explore.crossWilderness()`,
    // see explore.ts) dispatches a real `NEWECL 2`, a genuine cross-archive crossing into
    // `ECL4.DAX#2`/`GEO4.DAX#2` — the SAME archive `pool-natural-5` already proves is real, walkable
    // retail content. See `docs/engine/research/persistent-natural-routes.md`'s "Pool's Fifth Route"
    // section for the byte-verified dispatch this reruns live.
    chainTargets: {
      2: {
        eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/ECL4.DAX',
        geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/GEO4.DAX',
        walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/WALLDEF4.DAX',
        tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D4.DAX',
        monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON4CHA.DAX',
        spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON4SPC.DAX',
        itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON4ITM.DAX',
        itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/ITEM4.DAX',
        itemFormat: 'cok-63',
      },
    },
  },
  'pool-natural-5': {
    id: 'pool-natural-5',
    title: 'Pool of Radiance',
    engineGen: 'gen1-dax',
    profileId: 'pool-of-radiance',
    // BUILD-QUEUE item 6's wilderness/overland-transition leaf for Pool, browser wiring. The engine
    // golden (`dungeonEvents.test.ts`, "golden Pool vm_run_1 area crossing (ECL1#18 -> ECL4#2)")
    // proves the real crossing byte-for-byte: `ECL1.DAX#18`'s own `vm_run_1` (file offset 0xbb, NOT
    // the block's ordinary `eclEntryOffset: 0x73` `initial_entry`), gated on a native "pending
    // travel selection" flag (`[0x6dd5]`), dispatches a destination selector (`[0xc04d]`) into
    // `NEWECL #2` — landing in `ECL4.DAX#2`/`GEO4.DAX#2`, a genuinely different, real, walkable GEO
    // map, resolved purely by NEWECL's own operand (Pool's block-id space is globally unique across
    // all 8 archives, unlike CoAB's ADR-0009 case) with NO `SAVE …,0x7F12`/`setGameArea` effect
    // anywhere on the path. Like `coab-natural`/`coab-natural-2` before ADR-0009's live cross-archive
    // wiring landed, this profile targets the DESTINATION area directly — single-archive, ECL4.DAX's
    // own `initial_entry` at the standard file offset (no `eclEntryOffset` override needed) — proving
    // ECL4.DAX#2/GEO4.DAX#2 is real, walkable retail content reachable from Pool's own start area, NOT
    // a live in-browser replay of the `vm_run_1` crossing itself (deliberately deferred: the web
    // host's cross-archive rendering switch, `GameData.archiveSet`/`startCrossArchiveExplore` in
    // `apps/web/src/ui/explore.ts`, is currently keyed to the `setGameArea` VM effect, which this
    // crossing never emits — extending it is real, moderate-scope follow-up work, not forced here).
    // See `docs/engine/research/persistent-natural-routes.md`'s "Pool's Fifth Route" section.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/ECL4.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/GEO4.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/WALLDEF4.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D4.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON4CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON4SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/MON4ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/ITEM4.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 2,
    eclDialect: 'pool',
  },
  secret: {
    id: 'secret',
    title: 'Secret of the Silver Blades',
    engineGen: 'gen1-dax',
    profileId: 'secret-of-the-silver-blades',
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ECL1.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/GEO1.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/WALLDEF1.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D1.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ITEM1.DAX',
    itemFormat: 'cok-63',
    // Native GBBOOT Secret DOS fixtures verify ECL1 block 34 as the default CCECL -> CCGEO route.
    eclInitBlock: 34,
  },
  'secret-natural': {
    id: 'secret-natural',
    title: 'Secret of the Silver Blades',
    engineGen: 'gen1-dax',
    profileId: 'secret-of-the-silver-blades',
    // P2.3 keeps the ECL1#34 preview above intact. Area 3 block 97 has a unique selector-3 cell
    // whose retail script queues eight 12-headed hydras, enters COMBAT, sets bit 0x04, and exits.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ECL3.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/GEO3.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/WALLDEF3.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D3.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ITEM1.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 97,
    // The legal route crosses selectors 7 and 6. Mark only their independent events consumed;
    // selector 3's bit 0x04 remains clear and becomes set by the post-COMBAT resume instruction.
    eclInitialMemory: [[0x4cd0, 0x10], [0x4ccd, 0x20]],
  },
  'secret-natural-2': {
    id: 'secret-natural-2',
    title: 'Secret of the Silver Blades',
    engineGen: 'gen1-dax',
    profileId: 'secret-of-the-silver-blades',
    // BUILD-QUEUE item 6's "repeat the matrix" leaf: Secret's middle-area candidate. Unlike CoAB's
    // own middle-route leaf (whose literal target-map cell was NOT reachable and needed an earlier
    // checkpoint substituted), the campaign-route target map's stated candidate here DOES hold up
    // under real-engine re-verification: area-1 selector 2, cell (14,11) descriptor 0x82, is
    // reachable in 17 legal directed-edge steps from `chooseStart` with no forced detour through a
    // different area-1 checkpoint (`tools/find_geo_path.py`). It keeps the ECL1#34 preview above
    // (and `secret-natural`'s own separate area-3 route) intact — same ECL1/GEO1 archives as
    // `secret`, a different `eclInitBlock`.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ECL1.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/GEO1.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/WALLDEF1.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D1.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ITEM1.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 16,
    // Mirrors the engine golden's exact seed (`dungeonEvents.test.ts`, "golden Secret ECL1 block 16
    // (middle-area route)"): [0x4c4d] is the runtime seed the target map flags as required (gates
    // the branch toward the second MARCUS-scene checkpoint); [0x4c2e] is this encounter's own
    // consumed word, starting clear (target precondition).
    eclInitialMemory: [[0x4c4d, 1], [0x4c2e, 0]],
    // BUILD-QUEUE item 6's town-exit LIVE WIRING (the "mid-walk chain re-mount" capability): the
    // real interactive archway at (10,3) chains via a same-archive `NEWECL 33` into "The Well of
    // Knowledge" (`ECL1.DAX#33`) — same ECL1/GEO1/WALLDEF1/8X8D1/MON1CHA/ITEM1 archives this profile
    // already fetches for block 16, just a different target block id. See
    // `docs/engine/research/persistent-natural-routes.md`'s "Secret's Fourth Route" section.
    chainTargets: {
      33: {
        eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ECL1.DAX',
        geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/GEO1.DAX',
        walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/WALLDEF1.DAX',
        tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D1.DAX',
        monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1CHA.DAX',
        spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1SPC.DAX',
        itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1ITM.DAX',
        itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ITEM1.DAX',
        itemFormat: 'cok-63',
      },
    },
  },
  'secret-natural-3': {
    id: 'secret-natural-3',
    title: 'Secret of the Silver Blades',
    engineGen: 'gen1-dax',
    profileId: 'secret-of-the-silver-blades',
    // BUILD-QUEUE item 6's ending/late-area leaf for Secret. The campaign-route target map names
    // area 2, ECL2.DAX#68, GEO cell (6,8) descriptor 0x82 (masked selector 2), as the literal
    // "ending/late" candidate. Like CoAB's and Pool's own middle-route leaves (and UNLIKE Secret's
    // own middle-route leaf, which held up as-is), that literal cell does NOT hold up under
    // real-engine re-verification: `chooseStart` spawns the party in a tiny 3x3 room whose ONLY exit
    // is masked selector 42, cell (5,4) — `tools/find_geo_path.py --avoid-event-index N` fails to
    // reach (6,8) for every nonzero descriptor on the shortest walk (42, 41, 31, 43, 23, 46), not
    // just one, so this is a single-file gauntlet corridor, not an open room with alternatives. This
    // profile targets the real, unavoidable, immediately-reachable checkpoint at (5,4) instead: a
    // genuine two-stage boss fight (FIRE GIANT x9, then unconditionally 12HD PYROHYDRA x4) gated on
    // `[0x4c9e]&0x40==0`, needing no runtime seed beyond that starting-clear word. Same ECL2/GEO2
    // archives as Secret's own area-2 content; a fresh archive from `secret`/`secret-natural`/
    // `secret-natural-2` (all area 1 or 3).
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ECL2.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/GEO2.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/WALLDEF2.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D2.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ITEM1.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 68,
    // Mirrors the engine golden's exact seed (`dungeonEvents.test.ts`, "golden Secret ECL2 block 68
    // (ending/late-area route)"): [0x4c9e] is this checkpoint's own consumed word (bit 0x40),
    // starting clear (the fresh-visit precondition the guarded EXIT at 0x957e requires to be
    // skipped).
    eclInitialMemory: [[0x4c9e, 0]],
  },
  'secret-natural-4': {
    id: 'secret-natural-4',
    title: 'Secret of the Silver Blades',
    engineGen: 'gen1-dax',
    profileId: 'secret-of-the-silver-blades',
    // Bounded cross-block quest evidence, deliberately NOT described as a natural campaign route.
    // ECL1#34's unique descriptor-45 cell (15,8) writes the Black Circle alert flag
    // `[0x4c4d]=0xff` and emits its real NEWECL 32 only when the unresolved host precondition
    // `[0x7ed5]==1` is present. Its ordinary chooseStart is 93 directed actions away, through a
    // locked door and 17 unaudited descriptors, so this profile starts on the adjacent plain cell
    // (15,9) and walks the final real edge. ECL1#32 has no recovered retail transition to the
    // Marcus scene in ECL1#16; explore.ts exposes a profile-scoped, memory-preserving evidence
    // bridge so the browser can prove the producer/consumer dependency without inventing that link.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ECL1.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/GEO1.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/WALLDEF1.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D1.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ITEM1.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 34,
    eclInitialMemory: [[0x7ed5, 1], [0x4c4d, 0], [0x4c2e, 0]],
    startPose: { x: 15, y: 9, facing: 'north' },
    chainTargets: {
      32: {
        eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ECL1.DAX',
        geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/GEO1.DAX',
        walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/WALLDEF1.DAX',
        tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D1.DAX',
        monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1CHA.DAX',
        spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1SPC.DAX',
        itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/MON1ITM.DAX',
        itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/ITEM1.DAX',
        itemFormat: 'cok-63',
      },
    },
  },
  treasures: {
    id: 'treasures',
    title: 'Treasures of the Savage Frontier',
    engineGen: 'gen1-dax',
    profileId: 'treasures-of-the-savage-frontier',
    // Treasures ships a single ECL1/GEO1/WALLDEF1 disk (confirmed: no ECL2/GEO2/etc. in the real
    // GOG install), a 2e-ruleset Savage Frontier title the engine already supports end-to-end
    // (TREASURES_MONSTER_RECORD_SIZE/TREASURES_LAYOUT in monster.ts, the compact-item-tail decode in
    // monsterSideTables.ts, and the 'treasures-of-the-savage-frontier' BUILTIN_PROFILES entry) —
    // this GameData profile is the only missing piece to make it a playable browser route. No prior
    // curated narrative route exists for Treasures (unlike CoK/DoK's own hand-verified `-natural`
    // leaves).
    //
    // `eclInitBlock` is NOT hand-picked, but it is also NOT simply "the lowest genuinely-paired
    // (GEO+ECL) area" — that heuristic (`listPairedGen1Areas` against the real archives: paired ids
    // are [16, 17, 18, ..., 40, 47, 49, 50, 51]) finds ids that decode as a valid GEO map + a valid
    // ECL block, but "decodes" isn't "boots": a `loadDungeon` bootability sweep across every one of
    // those 29 ids (2026-07-19) found block 16 itself throws (`no LOAD_FILES` — it's a dialogue/menu
    // script, not a dungeon entry) and the plain 3-operand Gen1 LOAD_FILES frame desyncs almost every
    // other one into a bad-opcode halt a few bytes past its own LOAD_FILES operands. Re-decoding
    // LOAD_FILES under Gen2's own 2-operand short form (`eclDialect: 'gen1-short-treasures'` below —
    // see `ECL_GEN1_SHORT_TREASURES`'s doc comment) fixes every one of them; among the areas that
    // then run cleanly to a real `EXIT` (20, 22, 24, 25, 34, 40), 20 is the lowest id — the actual
    // value used here. None of `ECL1.DAX`'s 30 blocks ever call LOAD_PIECES even under the fix (see
    // `eclFallbackPieces` below), so "genuinely bootable" here means "loads a real GEO map + a real
    // wall-tile set (the fallback), not literal retail-identical wall-piece selection".
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/ECL1.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/GEO1.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/WALLDEF1.DAX',
    // Treasures splits its 8X8D archive: 8X8D1.DAX is the wall-tile bank WALLDEF references (blocks
    // 1/2/7-16); 8X8D0.DAX carries only the block-201 font + block-202 frame/moon tiles every other
    // Gen1 game ships alongside its wall tiles in one file. `framePath` merges the latter in so the
    // exact-screen compositor (border chrome + text) renders — verified by inspecting both TOCs.
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/8X8D1.DAX',
    framePath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/8X8D0.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MON1CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MON1SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MON1ITM.DAX',
    // Treasures' ITEM0.DAX is the same packed-17-byte-record family as DoK's ITEM0.DAX (verified: the
    // records decode to sane baseTypeId/value/encumbrance fields, not junk) — same naming convention
    // (ITEM0, not ITEM1) as the other 1991+ short-dialect games that use this coded table shape.
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/ITEM0.DAX',
    itemFormat: 'dok-17',
    eclInitBlock: 20,
    // Treasures' own further split off the shared 1991+ short dialect — see this constant's doc
    // comment (`ECL_GEN1_SHORT_TREASURES` in disassemble.ts) for the evidence.
    eclDialect: 'gen1-short-treasures',
    // See the long comment above `eclPath`: none of ECL1.DAX's blocks ever call LOAD_PIECES. WALLDEF1
    // block 1 (set 1) is the only real wall set on this disk, so it's the natural single fallback.
    eclFallbackPieces: [1, 0xff, 0xff],
  },
  pools: {
    id: 'pools',
    title: 'Pools of Darkness',
    engineGen: 'gen1-dax',
    profileId: 'pools-of-darkness',
    // Pools of Darkness is structurally almost a drop-in twin of Treasures' own profile above: same
    // 1991+-era short ECL dialect family, byte-identical GEO/WALLDEF/ITEM0 record sizes, and a
    // monster-record layout that already decodes real names via Treasures' own 510-byte-record
    // layout by an exact size match (see `docs/engine/research/
    // treasures-pools-darkness-scoping.md` §3.4). Pools uses its own retail-handler-proven
    // `'gen1-short-pools'` micro-dialect; see ECL_GEN1_SHORT_POOLS's byte-pinned comment.
    //
    // `eclInitBlock: 18` was found via the same bootability sweep Treasures' own entry describes
    // (`docs/engine/research/pools-of-darkness-eclinit.md`): of 32 paired GEO+ECL ids, 14 reach a
    // real `EXIT`; among those, block 18 is corroborated (not just mechanically picked) by real,
    // plot-matching narration ("YOU STEP FROM THE POOL ONTO SOLID GROUND... ELMINSTER HAS CREATED A
    // SMALL ISLAND OF MATTER IN LIMBO") AND an independently-decoded GEO map that matches it exactly
    // (a 16×16 grid with zero walls/doors anywhere — a literal "island in limbo"), reached in a
    // single un-resumed `EclVm` pass with no mid-script pause. Block 16 (the mechanically-"lowest
    // id" candidate) was also found and rejected: it needs an odd `INPUT_STRING` pause auto-answered
    // before it exits, and has zero narration to corroborate against — see the research doc §3.2.
    //
    // Honest open gap: no `GameMap.entries` (explicit start x/y/facing) decodes for ANY Pools of
    // Darkness area probed, block 18 included — the same situation the research doc flags in its own
    // §5. `explore.ts`'s existing `chooseStart()` fallback (pick the cell with the most open edges)
    // already handles this generically for any title with no explicit start entry, and block 18's
    // map (every cell fully open) is exactly the shape that heuristic was written for — so this ships
    // with a structurally sound, if not narratively pinpoint-verified, start position.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/ECL1.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/GEO1.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/WALLDEF1.DAX',
    // Same split 8X8D convention as Treasures (see that entry's own `tilesPath`/`framePath` comment).
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/8X8D1.DAX',
    framePath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/8X8D0.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MON1CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MON1SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MON1ITM.DAX',
    // Byte-identical 4318-byte single block to Treasures' own ITEM0.DAX (254 17-byte records) — same
    // 'dok-17' coded-item family.
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/ITEM0.DAX',
    itemFormat: 'dok-17',
    eclInitBlock: 18,
    eclDialect: 'gen1-short-pools',
    // No block in the 32-id paired corpus ever calls LOAD_PIECES (identical to Treasures' own
    // situation) — WALLDEF1 block 1 is the only non-degenerate wall set on this disk.
    eclFallbackPieces: [1, 0xff, 0xff],
    // Pools is the first GLIB-era title to earn the EGA<->Amiga wall-art toggle. The Amiga port's
    // WALLDEF.GLB records are BYTE-IDENTICAL to this DOS WALLDEF1.DAX's blocks 1..6, and both
    // platforms' 8X8D banks hold 256 8x8 tiles under the same id table, so the shared geometry
    // indexes the Amiga art correctly rather than approximately — measured in
    // packages/engine/test/poolsAmigaWallArt.test.ts. Boot/UI sets 0 and 4 live in a different
    // container on the Amiga side (DISK1/8X8DA.TLB) and stay on DOS art.
    amigaGlibTilesPath:
      'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/8X8D.TLB',
  },
  'pools-natural': {
    id: 'pools-natural',
    title: 'Pools of Darkness',
    engineGen: 'gen1-dax',
    profileId: 'pools-of-darkness',
    // Natural tactical-handoff leaf for the byte-pinned ECL1#69 -> ECL1#72 route. GEO1#69's
    // selector-23 cell (8,6) is two legal steps north from (8,8); the final (8,7)->(8,6) edge is
    // a retail automatic door, while the intermediate selector-21 cell is dispatched normally.
    // #69's retail
    // search_location entry gates on the raw descriptor at [0x002D], north at [0x0011], and the
    // two clean route-state words below before setting encounter selector 38 and chaining to #72.
    // The web host retains the whole ECL1 archive so that chain stays one paused DialogueRunner
    // across the tactical overlay instead of incorrectly remounting #72 as a new dungeon.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/ECL1.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/GEO1.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/WALLDEF1.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/8X8D1.DAX',
    framePath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/8X8D0.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MON1CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MON1SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MON1ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/ITEM0.DAX',
    itemFormat: 'dok-17',
    eclInitBlock: 69,
    eclDialect: 'gen1-short-pools',
    eclFallbackPieces: [1, 0xff, 0xff],
    eclInitialMemory: [[0x0278, 0], [0x0276, 0]],
    startPose: { x: 8, y: 8, facing: 'north' },
    // Same measured Amiga wall-art source as the `pools` entry above. This route, not that one, is
    // where the toggle is actually assertable: `pools` mounts block 18, whose GEO is the "island in
    // limbo" — a 16x16 grid with zero walls or doors anywhere — so its first-person viewport draws
    // no wall tiles at all and both art sources render an identical frame. GEO1#69 has real walls
    // and a retail automatic door, so a mode change is visible there.
    amigaGlibTilesPath:
      'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/8X8D.TLB',
  },
  'pools-town': {
    id: 'pools-town',
    title: 'Pools of Darkness',
    engineGen: 'gen1-dax',
    profileId: 'pools-of-darkness',
    // Pools' TOWN leg: Phlan's civic block, ECL1#16 / GEO1#16
    // (`docs/engine/research/pools-town-route.md`, golden `packages/engine/test/poolsTownRoute.test.ts`
    // cases J-P). Same archives as the plain `pools` profile and the `pools-natural` combat leg — a
    // separate GameId purely to isolate this route's own save/e2e state, the usual convention (see
    // `treasures-town`'s own comment for the precedent this follows almost verbatim).
    //
    // "Town" here is not an engine mode, same honest note as Treasures': Pools has none. Phlan is an
    // ordinary stepped 16x16 grid whose GEO descriptor bytes ON_GOTO-dispatch to shop/temple/inn/
    // training scripts through the SAME plain `search_location` every other Pools area uses
    // (`AND [0x002d],#63,[0x00bf]` at 0x88c0, case E) — walking it needs no new explorer code, only
    // the existing generic `dialogueForCell` dispatch (`facingAddr: 0x0011` already wired into
    // `ECL_GEN1_SHORT_POOLS` for `pools-natural`).
    //
    // `startPose` is byte-read, not derived by running the VM: ECL1#16's own initial_entry writes
    // (15,0) facing west at 0x8049 ONLY behind a guard — `COMPARE [0x0250],#0 / IF_NE / GOTO 0x854c`
    // at 0x803e (case J) — which a cold/fresh memory map satisfies (Map.get returns undefined ==
    // treated as 0), so this pose IS what a real cold boot reaches. We assert it directly instead of
    // executing that branch, the same convention the plain `pools` profile's own comment already
    // discloses as an honest gap: Pools' host pose registers (0x0034/0x0035/0x0011) are not read back
    // by `explore.ts`'s generic pose-selection path (no `GameMap.entries` support for this title), so
    // there is no "retailPose" extraction to lean on here the way Gateway's does. `eclInitialMemory`
    // is deliberately NOT seeded to force the branch — an untouched `Map()` already takes it, so
    // forcing it would only paper over a fact that is already true.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/ECL1.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/GEO1.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/WALLDEF1.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/8X8D1.DAX',
    framePath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/8X8D0.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MON1CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MON1SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/MON1ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pools of Darkness/ITEM0.DAX',
    itemFormat: 'dok-17',
    eclInitBlock: 16,
    eclDialect: 'gen1-short-pools',
    eclFallbackPieces: [1, 0xff, 0xff],
    startPose: { x: 15, y: 0, facing: 'west' },
    // Same measured Amiga wall-art source as `pools`/`pools-natural` — see the report for whether
    // Phlan's civic block actually shows a different frame under it (this block's own LOAD_PIECES
    // status is measured separately, not assumed from the sibling routes).
    amigaGlibTilesPath:
      'D:/Games/Emulator/Amiga/WHDLoad/WHDLoadPacks/WHDLoad Collection/Games-WHDLoad/unpacked/PoolsOfDarkness/data/Disk2/8X8D.TLB',
  },
  nwn: {
    id: 'nwn',
    title: 'Neverwinter Nights (DOS/AOL)',
    engineGen: 'gen1-dax',
    profileId: 'neverwinter-nights-dos',
    // Promoted from the `?nwn=1` asset preview (`apps/web/src/ui/nwnPreview.ts`, left intact) via a
    // dedicated `eclInitBlock` bootability sweep
    // (`docs/engine/research/neverwinter-nights-dos-eclinit.md`), the same method Treasures/Pools
    // used. Unlike those two, NWN ships FOUR separate numbered GEO/ECL archive pairs (0-3, plus
    // non-paired ECL5/ECL7 for later content) rather than one disk's worth — this profile picks the
    // `ECL0.DAX`/`GEO0.DAX` pair, whose block 1 is the game's own opening scene.
    //
    // `eclInitBlock: 1` boots in a single un-resumed `EclVm` pass (loadFiles -> geoBlockId 1
    // self-referencing, loadPieces -> real setBlockIds [25,15,14], no fallback needed) and prints
    // real, specific opening narration: "WELCOME TO NEVERWINTER! YOU STAND BEFORE THE PALACE OF
    // LORD NASHER..." — the only id in the whole 4-pair, 29-area sweep with any narration at all.
    // This also matches the pre-existing native-DOS `GBBOOT` finding in
    // `docs/engine/research/neverwinter-nights-dos-combat-flow.md` ("ECL0.DAX block 1 is a clean
    // code-0 LOAD_FILES + LOAD_PIECES boot leg"), reached independently by a completely different
    // method (mechanical web-engine sweep vs. native DOS tracing) — strong cross-validation.
    // No `eclDialect` override: the plain Gen1 long-operand-frame dialect decodes every reachable
    // instruction across the whole swept corpus cleanly (zero bad-opcode halts), unlike the
    // 1991+-era short-dialect titles (DoK/Gateway/Pools/Treasures).
    eclPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/ECL0.DAX',
    geoPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/GEO0.DAX',
    // Single shared (non-numbered) archives, unlike CoK/DoK/Secret's MON{n}CHA-style per-area split.
    walldefPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/WALLDEF.DAX',
    // No `framePath` split needed: this single 8X8D.DAX carries walls (blocks 1-37) AND the
    // font/frame/boot-tile blocks (201/202/203) together — the simplest case among the 1991+-era
    // titles this project has wired so far (research doc §8).
    tilesPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/8X8D.DAX',
    monPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/MONCHA.DAX',
    // NWN's non-numbered MONITM.DAX has the verified normal 63-byte Gen1 carried-item shape: all
    // 38 non-empty blocks divide exactly into that record size and join the shared MONCHA block ids.
    // This restores its real carried loot and magic-item XP bonuses (for example MAGE carries a
    // +6 item). MONSPC.DAX deliberately remains unwired: its 9-byte records parse structurally, but
    // its effect ids demonstrably do not share CoK/DoK's known numeric semantics, so applying those
    // meanings would fabricate combat behavior. See neverwinter-nights-dos-format-coverage.md §9.
    itmPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/MONITM.DAX',
    itemPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/ITEM.DAX',
    // ITEM.DAX decodes cleanly under the plain-ASCII 63-byte format (60 real items: "Shield",
    // "Plate Mail", "10 Arrow", ...); the coded 17-byte dok-17 reader returns 0 records outright.
    itemFormat: 'cok-63',
    eclInitBlock: 1,
    // MONCHA.DAX's 422-byte records collide with COAB_LAYOUT by size, but decode as constant/
    // degenerate AC=60,THAC0=60 under it versus sane, diverse values (incl. DRACOLICH/HOODED
    // MEDUSA) under GATEWAY_LAYOUT for all 100/100 records — see research doc §6 and
    // `monster.ts`'s `layoutFor`, which special-cases this profile id the same way it already does
    // for 'gateway-to-the-savage-frontier'.
    //
    // WALLDEF.DAX pads every one of its 37 blocks to a fixed 3-record (2340-byte) size.  The
    // renderer input is record 0 (780 bytes): 8X8D.DAX maps 1:1 by wall-definition id, and the
    // later non-zero rows observed in a few blocks are unused authoring/padding data, not
    // position-selected wall records.  See the research doc §3.  Truncating avoids COAB's own
    // k+s>4 overflow guard misfiring on that file-format padding.
    walldefSingleRecord: true,
    directWallsetTileIds: true,
    // 8X8D.DAX block 202 has 40 tiles here, not CoK's 38 (format-coverage audit §8X8D detail) —
    // COK_FRAME_LAYOUT's hardcoded indices would pull the wrong tiles. A dedicated NWN_FRAME_LAYOUT
    // (calibrated 2026-07-21 — see that constant's own doc comment in
    // packages/engine/src/render/exploreScreen.ts, and the coverage doc's follow-up item 2) supplies
    // NWN's own straight/junction tile roles instead; frameTilesUnverified was dropped once this
    // landed (no more honest-absent border needed).
    frameLayout: NWN_FRAME_LAYOUT,
    // The border roles have a structural NWN layout, but no native screenshot proves moon-disc
    // positions. Do not overlay CoK's [26,30,34] tiles into NWN's unrelated block-202 cells.
    moonTileGroups: null,
  },
  'nwn-natural': {
    id: 'nwn-natural',
    title: 'Neverwinter Nights (DOS/AOL)',
    engineGen: 'gen1-dax',
    profileId: 'neverwinter-nights-dos',
    // NWN's first proven natural-combat route — reproduces the native-traced encounter documented
    // in docs/engine/research/neverwinter-nights-dos-combat-flow.md ("Natural Area-1 Movement-To-
    // Combat Proof"): GBBOOT walks from a persisted pose (14,4) facing east into GEO1.DAX block 10's
    // descriptor-229 cell (15,4) and queues a real two-group tactical encounter (monster 0x0045 x2,
    // monster 0x001e x3). This route reproduces the SAME cell through the real web-engine EclVm,
    // independently found and byte-cross-checked (own 2026-07-21 session, no DOSBox-X used):
    //   - GEO1.DAX#10 cell (14,4): walls.east=5 with doors.east=1 (a door/passable edge); stepping
    //     east lands on (15,4), floor=229 — an EXACT match to the native destination descriptor.
    //   - primeSearchLocation(ECL1.DAX#10, backdrop=229) dispatches PICTURE 119 -> TREASURE ->
    //     COMBAT [monsterId 69 x2, monsterId 30 x3] — 69=0x45, 30=0x1e, an EXACT match to the
    //     native trace's monster ids/counts. Decoded under GATEWAY_LAYOUT (already wired for this
    //     profileId — see the plain `nwn` entry's own comment): id 69 = CARRION CRAWLER (AC 3,
    //     THAC0 16, HP 12), id 30 = SCORPION (AC 5, THAC0 19, HP 5) — both sane, plausible D&D
    //     stat blocks. No `cellDescAddr` override needed: NWN uses the plain long-frame ECL_GEN1
    //     dialect (same as CoK/DoK), so the default [0xc04f] `primeSearchLocation` already seeds
    //     is the address this title's own script reads too (unlike Treasures' own [0x002d] quirk).
    //
    // Getting a MOUNTABLE map needed one real finding: block 10's own DEFAULT entry (the fixed
    // 0x8014-style offset every other Gen1 title's eclInitBlock boots from) is just a non-local
    // GOTO trampoline into block 19 — it emits no LOAD_FILES at all under a naive run, which is
    // why the plain bootability sweep (neverwinter-nights-dos-eclinit.md §2) correctly excluded id
    // 10 from its "loadDungeon-clean" set. But the block's OWN `eclInitialEntry` header pointer
    // (byte offset 149, vaddr 0x80D3) is a real, self-contained "fresh boot into this area" leg:
    // `LOAD_FILES geoBlockId=10 (self-referencing) -> LOAD_PIECES [33,27,16]` — exactly the shape
    // every other title's eclInitBlock has, just not at the default entry offset. `eclEntryOffset`
    // (already a GameData field, added for Pool's own byte-located startup) covers exactly this.
    //
    // This area is a real NEVERWINTER TOWN map (sign narration crossed while walking: "CROSSERGATE
    // GEMS AND JEWELRY STORE", "TO THE EAST LIES A RESIDENTIAL NEIGHBORHOOD"), and it is genuinely
    // busy: 15 OTHER cells on this same 16x16 GEO carry their own scripted COMBAT dispatches (guard
    // ambushes scattered around the town), so `chooseStart`'s own (2,1,north) heuristic spawn has
    // NO path to the target that avoids every one of them (both a hard "avoid all combat cells"
    // BFS and a softer "avoid all event cells too" BFS from (2,1) came back empty — verified by
    // direct simulation, not assumed). Rather than accept a route that fights the WRONG encounter
    // first, `startPose` (the same opt-in override Treasures' own natural route uses, for a
    // different reason — disconnected map regions, not a hostile-cell-avoidance problem) places the
    // party at (7,7,north): the best-open-edges cell within the real, byte-verified 116-cell region
    // that can reach (15,4) without crossing any OTHER combat cell. From there, 22 real directed
    // actions (15 forward steps + 7 turns) reach (15,4); two intermediate cells carry benign
    // sign-narration prints only (no combat, no state writes) — the same "cross one honest no-op
    // event cell" shape DoK's own natural route already established as acceptable, just two cells
    // here instead of one.
    eclPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/ECL1.DAX',
    geoPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/GEO1.DAX',
    walldefPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/WALLDEF.DAX',
    tilesPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/8X8D.DAX',
    monPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/MONCHA.DAX',
    // Shared with the plain NWN profile: keep the natural route's enemy loot and item-XP
    // behaviour identical to every other NWN entry point.
    itmPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/MONITM.DAX',
    itemPath: 'D:/Games/Neverwinter Nights DOS/neverwinter-nights/neverwint/ITEM.DAX',
    itemFormat: 'cok-63',
    eclInitBlock: 10,
    eclEntryOffset: 149,
    walldefSingleRecord: true,
    directWallsetTileIds: true,
    frameLayout: NWN_FRAME_LAYOUT,
    moonTileGroups: null,
    startPose: { x: 7, y: 7, facing: 'north' },
  },
  'treasures-natural': {
    id: 'treasures-natural',
    title: 'Treasures of the Savage Frontier',
    engineGen: 'gen1-dax',
    profileId: 'treasures-of-the-savage-frontier',
    // Treasures' first natural-combat route (docs/engine/research/treasures-natural-route.md).
    // Same ECL1.DAX/GEO1.DAX archives as the plain `treasures` profile — a separate GameId purely
    // to isolate this route's own save/e2e state, the same convention as every other `*-natural`
    // leaf — but a DIFFERENT area (block 34, not block 20): `gen1_ecl_encounter_scan.py`'s
    // corrected-dialect sweep (the tool previously used the WRONG shared `gen1-short` word set for
    // this title — fixed this round, see that tool's own `GEN1_SHORT_TREASURES_WORD_SETS`) finds
    // exactly one `search_location` candidate with a fully-immediate LOAD_MONSTER roster: GEO1#34's
    // unique descriptor-0xFF cell (two physically separate rooms, (7,7) and (8,9), both real
    // retail bytes) dispatches "YOU ENTER A LARGE CHAMBER... THE HORDE OF YETIS CHARGING FORWARD TO
    // GREET YOU!" -> YETI CHIEF x4 + ICE HOUND x14 (MON1CHA.DAX ids 84/86, real sane stats: ac 5,
    // thac0 13, hp 12) -> COMBAT -> a real post-victory beat foreshadowing a second wave. Proven
    // live through the real EclVm/dialogueForCell, not the static scanner alone.
    //
    // Getting here needed a genuine engine fix, not just data: Treasures' OWN retail script reads
    // its per-cell descriptor from address [0x002d] (byte-verified: block 34's own
    // `AND #127, 0x002d, 0x009a`), not the CoK/DoK-family [0xc04f] `primeSearchLocation` seeded by
    // default — see `EclDialect.cellDescAddr` (disassemble.ts) and `ECL_GEN1_SHORT_TREASURES`'s own
    // updated doc comment. Also needed `startPose` (below): GEO1.DAX#34 is NOT one connected region
    // (21 disconnected wall-graph components) and `chooseStart`'s row-major tie-break lands in an
    // unrelated 13-cell pocket with no path to either yeti-chamber cell — see `startPose`'s own doc
    // comment on `GameData`. `startPose` picks the best-open-edges cell within the SAME 118-cell
    // component as the target; the walk from there is 9 legal directed-edge steps crossing only
    // plain-floor (0x81) cells — no intermediate events, no `eclInitialMemory` seeding needed.
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/ECL1.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/GEO1.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/WALLDEF1.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/8X8D1.DAX',
    framePath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/8X8D0.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MON1CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MON1SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MON1ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/ITEM0.DAX',
    itemFormat: 'dok-17',
    eclInitBlock: 34,
    eclDialect: 'gen1-short-treasures',
    eclFallbackPieces: [1, 0xff, 0xff],
    startPose: { x: 6, y: 1, facing: 'north' },
  },
  'treasures-town': {
    id: 'treasures-town',
    title: 'Treasures of the Savage Frontier',
    engineGen: 'gen1-dax',
    profileId: 'treasures-of-the-savage-frontier',
    // Treasures' TOWN leg: Llorkh, ECL1#16 / GEO1#16 (docs/engine/research/treasures-town-route.md,
    // golden `packages/engine/test/treasuresTownRoute.test.ts`). Same archives as the plain
    // `treasures` profile and the `treasures-natural` combat leg — a separate GameId purely to
    // isolate this route's own save/e2e state, the usual convention.
    //
    // "Town" here is not an engine mode: Treasures has none. Its settlements are ordinary stepped
    // 16x16 grids whose GEO descriptor bytes dispatch to shop/temple/inn/training scripts, and
    // ECL1#16's own `search_location` (0x8a73 `AND #127,[0x002d],[0x009a]`) is a plain Gen1
    // dispatcher. Walking it therefore needs no new explorer code — only the two host-register
    // addresses this title moved: the cell descriptor at [0x002d] (already in
    // `ECL_GEN1_SHORT_TREASURES.cellDescAddr`) and the party facing at [0x0011]
    // (`EclDialect.facingAddr`, added for this leg). Three of the five service doors are
    // facing-gated — the training hall answers only from the west, both inns only from the north —
    // so before `facingAddr` those cells were simply silent here.
    //
    // `startPose` is byte-derived, not a heuristic. ECL1#51 (the overland map) holds the arrival
    // triple as three parallel 110-byte tables indexed `22 * travelFacing + destIndex`; Llorkh is
    // index 0, and all four approach directions give the same row: X=0, Y=10, facing=1 (east) —
    // the west city gate. ECL1#16's own entry then copies [0x02eb]/[0x02ec]/[0x02ed] into
    // facing/X/Y at 0x8092, which is why `eclInitialMemory` seeds exactly that triple: the script's
    // arrival branch and the pose we hand the explorer are then the same pose, from the same bytes.
    // (Block 16's OTHER entry, the cold boot at 0x80c0, writes (10,7) facing north instead. Both
    // are real; the overland arrival is the one the proven 56-step route starts from.)
    eclPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/ECL1.DAX',
    geoPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/GEO1.DAX',
    walldefPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/WALLDEF1.DAX',
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/8X8D1.DAX',
    framePath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/8X8D0.DAX',
    monPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MON1CHA.DAX',
    spcPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MON1SPC.DAX',
    itmPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/MON1ITM.DAX',
    itemPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Treasures of the Savage Frontier/ITEM0.DAX',
    itemFormat: 'dok-17',
    eclInitBlock: 16,
    eclDialect: 'gen1-short-treasures',
    eclFallbackPieces: [1, 0xff, 0xff],
    eclInitialMemory: [[0x02eb, 1], [0x02ec, 0], [0x02ed, 10]],
    startPose: { x: 0, y: 10, facing: 'east' },
  },
};

/** Resolve a game id (defaulting to CoK) to its data config. */
export function gameData(id: GameId = 'cok'): GameData {
  return GAME_DATA[id] ?? GAME_DATA.cok;
}

/** Map an engine detection profile id to our playable game id, when one exists. */
export function gameIdForProfile(profileId: string): GameId | null {
  for (const g of Object.values(GAME_DATA)) if (g.profileId === profileId) return g.id;
  return null;
}
