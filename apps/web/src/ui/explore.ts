/**
 * Explore mode (M1.S5d) — walk a REAL Champions of Krynn dungeon with EGA wall art.
 *
 * Runs a dungeon's ECL init block through the engine (`loadDungeon`): it takes the block's
 * `loadFiles`/`loadPieces` effects to load the GEO map + the WALLDEF/8X8D wall sets, then
 * spawns an `Explorer`. The whole screen is now the engine's exact-screen compositor
 * (`composeExploreScreen`): the first-person viewport (`renderWallViewIndexed`), the decorative
 * block-202 frame, the three moons, the party panel, the position line, the message window and
 * the prompt are assembled into ONE 320×200 indexed framebuffer, which a `ScreenSurface` resolves
 * through the EGA palette and scales to the canvas at the correct 4:3 aspect — the original DOS
 * interface, not a CSS rebuild. The top-down automap and keyboard movement (↑ forward · ↓ back ·
 * ← → turn) are companion aids below it.
 *
 * A `window.__explore` seam lets headless e2e drive moves and sanity-check the view.
 */
import { closeDungeon3d } from './dungeon3dHost.js';
import {
  readDaxDataBlocks,
  decodeDax,
  decode8x8dBlock,
  indexedToRGBA,
  createFramebuffer,
  blitIndexed,
  loadDungeon,
  inspectGatewayEcl6Wilderness,
  createGatewayEcl6EncounterRunner,
  GATEWAY_ECL6_CURRENT_CITY_ADDR,
  GATEWAY_ECL6_GEO_SELECTOR_ADDR,
  GATEWAY_ECL6_TRAVEL_MODE_ADDR,
  GatewayEcl6WildernessController,
  createGatewayEcl6ControllerState,
  loadGatewayOverlandBanks,
  composeGatewayOverlandWindow,
  composePoolAreaMapWindow,
  POOL_AREA_MAP_BOOT_BLOCK_ID,
  loadDungeonWalls,
  decodeGeoBlock,
  WALLDEF_RECORD_SIZE,
  loadCokFont,
  renderFirstPersonViewWithSky,
  selectSkyColour,
  SoundDispatcher,
  composeExploreScreen,
  composeRgbaArt,
  makeEgaPalette,
  mergePalettes,
  definedColorCount,
  DOS_EGA,
  type PlatformProfile,
  type RgbaArt,
  projectViewport,
  dialogueForCell,
  dialogueForVmRun1,
  DialogueRunner,
  NarrativeDialogueMachine,
  EclVm,
  type EclMachine,
  ECL_GEN1,
  ECL_GEN1_SHORT,
  ECL_GEN1_SHORT_GATEWAY,
  ECL_GEN1_SHORT_POOLS,
  ECL_GEN1_SHORT_TREASURES,
  ECL_POOL,
  type EclDialect,
  runEclChain,
  type RunChainOptions,
  type RunChainResult,
  type EclRunResult,
  type EclEffect,
  type EclCallEffect,
  type EclCallHostResult,
  decodeMonsterRecord,
  sniffMonsterRecord,
  monsterLookupFromArchive,
  decodeMonsterSpcArchive,
  applyRegenAffect,
  applyHalfDamageAffect,
  applyConSavingBonus,
  applyCloudProtectionAffects,
  decodeMonsterItmArchive,
  applyItemPluses,
  applyCarriedItems,
  decodeMonsterWizArchive,
  applyPreparedSpellIds,
  decodeItemArchive,
  decodeDokItemArchive,
  baseItem,
  spawnEnemies,
  monsterCombatant,
  partyCombatant,
  addnd1e,
  Explorer,
  gen1MapDirectionValue,
  markMapEdgeExits,
  type EdgeExit,
  moonPhasesForDay,
  gameDayFromMinutes,
  formatTimeOfDay,
  formatGameTime,
  formatDuration,
  // 7-slot game clock + calendar (ovr021 rest-calendar lane)
  stepGameTime,
  clockFromMinutes,
  minutesFromClock,
  calendarFromClock,
  SLOT_MINUTE,
  REST_TICKS_PER_HEAL,
  menuHotkey,
  buildCoabDungeonCombatMap,
  buildGatewayWildernessCombatMap,
  Rng,
  GB_MENU_DUNGEON,
  GB_MENU_ENCAMP,
  decodeDaa,
  decodeGlib,
  firstGlibPalette,
  glibIdTable,
  glibTileBanks,
  bankSwapParity,
  decodeDaaTileBlock,
  decodeDaaWideTileBlock,
  combineDokWallChunkRaws,
  buildDungeonWallGraphicSet,
  resolveWallTileLookup,
  createGraphicSetManager,
  wallArtProvenance,
  Automap,
  composeAutomapPanel,
  type WallArtCategoryProvenance,
  type MonsterRecord,
  type GameMap,
  type DungeonWalls,
  type DungeonSources,
  type Direction,
  type Pose,
  type MapCell,
  type SoundSink,
  type AreaSky,
  type SkyFacing,
  type GraphicSetManager,
  type GraphicSetId,
  type GraphicSet,
  type WallTileLookup,
  type StepResult,
  type BlockReason,
  type GatewayEcl6ControllerResult,
  type GatewayEcl6ControllerState,
  type GatewayEcl6EncounterRollContext,
  type GatewayEcl6CompanionName,
  type GatewayEcl6CompanionState,
  type GatewayEcl6PendingPrompt,
  type MonsterLookup,
  type PartyMemberSpec,
  type EncounterMonster,
  type EncounterSetup,
  type EncounterSurprise,
  type Combatant,
  type CombatResult,
  type EclCombatOutcome,
  type EclInputValue,
  type MoonReading,
  type IndexedImage,
  type BitmapFont,
  type ExploreFrameLayout,
  type ExploreParty,
  type Palette,
  type TreasureHaul,
  type BlockSource,
  buildCrossDiskBlockSource,
  listGen1GeoAreas,
  listPairedGen1Areas,
  decodeCoabSavgamaEclMemory,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { basenameOf, type AssetSource } from './assetSource.js';
import { el } from './render.js';
import { addLocalAssetPackPicker, localAssetPackRevision } from './localAssetPack.js';
import { prepareCokPlayerAppearance, type CokPlayerPreparation } from './cokPlayerAppearance.js';
import { presentCokPartyRosterIcon } from './cok-player-presentation.mjs';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';
import {
  partyCombatants,
  partySize,
  partyStatus,
  restPartyTicks,
  agePartyYears,
  advancePartySpellLearning,
  carriedItemTypeIds,
  destroyPartyItemsByTypes,
  getParty,
  addXp,
  removeFromParty,
} from './party.js';
import { openCharSheet, closeCharSheet, isSheetOpen } from './charSheet.js';
import { openMemorize, closeMagic, isMagicOpen } from './magic.js';
import {
  launchCombat,
  isCombatOpen,
  closeCombat,
  loadCombatAssets,
  type CombatAssets,
  type CombatAssetPaths,
} from './combat.js';
import { openCompanionPanel, closeCompanionPanel, isCompanionOpen, type CompanionTab } from './companionPanel.js';
import { openDialogueAt as openDialogueAtRaw, closeDialogue, isDialogueOpen, type DialogueCombat, type DialogueOptions, type DialoguePresentation, type DialoguePictureSource, dialoguePictureSourceKey } from './dialogue.js';
import { cokCottageSceneArt, loadCokCottageSelectedOriginal } from './cokOpeningArt.js';
import { registerCokWallArchive, loadCokWallRestyles, cokWallRestyleLayers, wallIdentityForImage, cokWallRestyleRef,
  type LoadedCokWalls, type CokWallRestyleRef } from './cokWallRestyle.js';
import { cokPortraitSceneArts } from './cokPortraitArt.js';
import { cokAmigaPortrait18SceneArt, loadCokAmigaPortrait18Source,
  matchesCokAmigaPortrait18BaseSource } from './cokAmigaPortrait18Runtime.js';
import { cokAmigaPortrait57SceneArt, loadCokAmigaPortrait57Source,
  matchesCokAmigaPortrait57BaseSource } from './cokAmigaPortrait57Runtime.js';
import { COK_TRAVEL_SOURCE, cokTravelSceneArt, cokTravelCursorLayer, paintCokTravelCursor,
  validateCokTravelSource, loadCokTravelRestyle } from './cokTravelArt.js';
import { cokAmigaTravelSceneArt, loadCokAmigaTravelSource, matchesCokAmigaTravelBaseSource }
  from './cokAmigaTravelRuntime.js';
import { COK_TRAVEL_TOWN_NAMES_EVENT, readCokTravelTownNames, syncCokTravelModeButtons, writeCokTravelTownNames }
  from './cokTravelMapPresentation.js';
import { DOK_DRAGON_RESTYLE, loadDokDragonRestyle } from './dokOpeningArt.js';
import {
  followPresentationScale, followsCokPresentation, presentationFitOptions, readPresentationScale,
  readRuntimeGraphicsFallback, readRuntimeGraphicsMode, runtimeGraphicsGameId, writePresentationScale,
  writeRuntimeGraphicsMode,
} from './runtimeGraphicsMode.js';
import { importCokParty } from './importParty.js';
import { saveToSlot, readSlot, applySave, loadSlot, hasSlot, QUICK_SLOT } from './saveStore.js';
import { gameAudio, installGameAudioSeam, type AudioGameId } from '../audio/gameAudio.js';
import { gameData, type GameData, type GameId } from './gameData.js';
import { GEN1_BASE_GAMES, baseGameForExplore, type Gen1BaseGame, type Gen1BaseGameId, type Gen1DiskSpec } from './gen1Disks.js';
import { GATEWAY_DEMO_PROFILE } from './gen1Profiles.js';
import type { SavePosition } from '@goldbox/engine';

/** The DOS EGA palette resolves the composed indexed screen to RGBA (graphics mode = DOS). */
const EGA_PALETTE: Palette = makeEgaPalette();
/** CoK keeps each disk's combat-picture bank separate; these literals are also asset-bundler inputs. */
const COK_CPIC_PATHS: Readonly<Record<number, string>> = {
  1: 'Champions of Krynn/CPIC1.DAX',
  2: 'Champions of Krynn/CPIC2.DAX',
  3: 'Champions of Krynn/CPIC3.DAX',
};

/**
 * Square-pixel variant of the DOS profile: displayAspect = native ratio (320/200 = 1.6), so the
 * scaler does NO aspect correction and the picture shows with 1:1 square pixels — the "wrong but
 * common" look. Toggling against {@link DOS_EGA} (4:3) demonstrates the aspect-ratio correction
 * the original CRT applied (circles round, not squashed). Same native size, so it stays put.
 */
const DOS_SQUARE: PlatformProfile = {
  ...DOS_EGA,
  id: 'dos-square',
  label: 'DOS (square pixels)',
  displayAspect: DOS_EGA.nativeWidth / DOS_EGA.nativeHeight,
};

// The dungeon data folder + ECL init block come from the per-game registry (gameData.ts): both
// Champions of Krynn and Death Knights of Krynn are Krynn-Gen1 DAX games sharing this exact pipeline.
// `activeGame` is set on each `startExplore(gameId)` mount and read by the save/position helpers.
let activeGame: GameData = gameData('cok');
// M7.S1 — when the mount came from a Library entry backed by a user-picked folder, its own
// files are read through this instead of the bundled repo copy (`fetchDaxRaw`/`readAssetBytes`).
let activeAssetSource: AssetSource | null = null;

/** Map every Gen1 route variant to its own audio profile; unknown/new routes stay conservatively silent. */
function audioGameForExplore(gameId: GameId): AudioGameId {
  if (gameId === 'pools') return 'pools';
  return baseGameForExplore(gameId) ?? 'nwn';
}

/**
 * A pregenerated demo party so a script-triggered encounter can actually be fought in the
 * browser. This is a placeholder until character creation / save-import lands — a classic CoK
 * starting four (two fighters, a cleric, a mage). `partyCombatant` derives THAC0/AC/damage from
 * the addnd1e ruleset, so these play by the same rules the engine goldens pin.
 */
const DEMO_PARTY: PartyMemberSpec[] = [
  {
    id: 'p1', name: 'Sturm', classes: { fighter: 5 },
    abilities: { str: 18, strPct: 75, int: 10, wis: 12, dex: 15, con: 16, cha: 13 },
    hp: 44, maxHp: 44, baseAc: 2, weaponDamage: { count: 1, sides: 8, bonus: 0 },
  },
  {
    id: 'p2', name: 'Caramon', classes: { fighter: 5 },
    abilities: { str: 18, strPct: 90, int: 9, wis: 10, dex: 16, con: 17, cha: 11 },
    hp: 46, maxHp: 46, baseAc: 3, weaponDamage: { count: 1, sides: 8, bonus: 0 },
  },
  {
    id: 'p3', name: 'Goldmoon', classes: { cleric: 5 },
    abilities: { str: 13, strPct: 0, int: 11, wis: 17, dex: 12, con: 14, cha: 16 },
    hp: 30, maxHp: 30, baseAc: 4, weaponDamage: { count: 1, sides: 6, bonus: 0 },
  },
  {
    id: 'p4', name: 'Raistlin', classes: { magicUser: 5 },
    abilities: { str: 10, strPct: 0, int: 17, wis: 11, dex: 16, con: 10, cha: 12 },
    hp: 16, maxHp: 16, baseAc: 8, weaponDamage: { count: 1, sides: 4, bonus: 0 },
  },
];

/** Engine numeric facing (0/2/4/6 = N/E/S/W) for a neutral Direction. */
const FACING_NUM: Record<Direction, number> = { north: 0, east: 2, south: 4, west: 6 };

/**
 * Host default sky indices for the dungeon sky backdrop (ovr028-030). The MapCell model carries
 * no per-area sky indices, so we pick sane defaults: idx 0 → EGA black for indoor cells, idx 3 →
 * SKY_COLOURS 0x0B open-sky (which also gates the time-of-day celestial body). Faithful per-area
 * sky needs the GEO decoder to surface the roof byte — flagged as a follow-up engine gap.
 */
const AREA_SKY: AreaSky = { indoorSkyColour: 0, outdoorSkyColour: 3 };

/** Opposite cardinal for a backward step (Explorer keeps its OPPOSITE private). */
const OPPOSITE_DIR: Record<Direction, Direction> = {
  north: 'south', east: 'west', south: 'north', west: 'east',
};

/**
 * Per-cell roof-byte proxy for {@link selectSkyColour}: the MapCell model has no decoded
 * `get_wall_x2` roof byte yet, so we cannot tell a genuine open-sky cell from a roofed one.
 * Default to **indoor** (high bit 0x80) so the dungeon walker keeps its faithful black ceiling
 * instead of painting a false blue sky + sun over every cell; only a cell the GEO decoder
 * explicitly marked roofless (`ceiling === 0`) is treated as outdoor. When the real per-cell
 * roof bit is surfaced, key off that instead.
 */
function roofByteOf(cell: MapCell): number {
  return cell.ceiling === 0 ? 0x00 : 0x80;
}

/**
 * M9.S3 — the live EGA<->Amiga wall-art switch: a `GraphicSetManager` over {DOS-EGA, Amiga} wall
 * `GraphicSet`s for one dungeon, plus the `WallTileLookup` wrapper `drawScreen` renders through.
 * `dosSet` (M9.S5) is kept alongside so the provenance badge can recompute `wallArtProvenance`
 * against the manager's currently-active set on every toggle, without rebuilding the DOS set.
 */
interface WallGraphics {
  manager: GraphicSetManager;
  lookup: WallTileLookup;
  dosSet: GraphicSet;
}

/** ECL dialect for a game profile: Pool's vaddr profile, the 1991+ short operand frames
 * (DoK/Gateway — see gameData.eclDialect), Treasures' own further split, or the Krynn Gen1 default. */
function eclDialectFor(gd: GameData): EclDialect {
  return gd.eclDialect === 'pool'
    ? ECL_POOL
    : gd.eclDialect === 'gen1-short-pools'
      ? ECL_GEN1_SHORT_POOLS
    : gd.eclDialect === 'gen1-short-treasures'
      ? ECL_GEN1_SHORT_TREASURES
      : gd.eclDialect === 'gen1-short-gateway'
        ? ECL_GEN1_SHORT_GATEWAY
        : gd.eclDialect === 'gen1-short'
          ? ECL_GEN1_SHORT
          : ECL_GEN1;
}

/**
 * `DungeonSources.walldefBlock` lookup, honouring `GameData.walldefSingleRecord` (Neverwinter
 * Nights DOS/AOL — see that field's own doc comment / `docs/engine/research/
 * neverwinter-nights-dos-eclinit.md` §3): truncates a fetched WALLDEF block to its first 780-byte
 * record before handing it to `loadDungeonWalls`, since that title's own file format pads every
 * block to a fixed multi-record size but only ever addresses the first record. A no-op (returns the
 * raw block unchanged) for every other profile.
 */
function walldefBlockFor(gd: Pick<GameData, 'walldefSingleRecord'>, idx: Map<number, Uint8Array>, id: number): Uint8Array | null {
  const raw = idx.get(id);
  if (!raw) return null;
  return gd.walldefSingleRecord ? raw.subarray(0, WALLDEF_RECORD_SIZE) : raw;
}

interface ExploreItemRecord {
  name: string;
  baseTypeId: number;
  value: number;
  count?: number;
  /** Runtime `Item.type` used by FIND_ITEM, present for 63-byte retail item records. */
  itemTypeId?: number;
  /** Sparse ITEM archive block id loaded by TREASURE operand 8. */
  archiveBlockId?: number;
}

interface ExploreState {
  map: GameMap;
  walls: DungeonWalls;
  /**
   * Null when no Amiga wall source was available for this game/dungeon (the toggle control is
   * hidden in that case) — `walls` (DOS) is used directly, matching the pre-M9.S3 render path.
   */
  wallGraphics: WallGraphics | null;
  wallRestyles?: LoadedCokWalls;
  wallRestyleRevision: number;
  wallRestyleVisibleTiles?: CokWallRestyleRef[];
  wallRestyleVisiblePixels?: number;
  wallRestyleVisiblePixelsByIdentity?: Record<string, number>;
  explorer: Explorer;
  /**
   * M10.S1 — the D1 {@link Automap} model, fed by real walking (`visit` on every cell-enter).
   * Persisted under the SAME `greybox.automap.<game>` key the standalone `?automap=1` route uses,
   * so both share one store instead of tracking discovery twice.
   */
  automap: Automap;
  /** The automap surface (Greybox navigation aid below the emulated screen), painted via `composeAutomapPanel`. */
  automapSurface: ScreenSurface;
  /** The exact-screen surface: the engine composes the whole 320×200 DOS screen, this displays it. */
  surface: ScreenSurface;
  /** 8X8D1 block 202 — the 38 frame/arrow/gauge/moon tiles the compositor draws the border from. */
  frameTiles: IndexedImage[] | null;
  /** 8X8D1 block 201 — the monochrome 8×8 text font the compositor renders all UI text with. */
  font: BitmapFont | null;
  /** Per-title border placement override ({@link GameData.frameLayout}); undefined uses the compositor's own COK_FRAME_LAYOUT default. */
  frameLayout: ExploreFrameLayout | undefined;
  /** The area's ECL init block — its SearchLocation handler runs each step. */
  areaEcl: Uint8Array;
  /** Every block in the mounted area's ECL archive; same-archive NEWECL routes reuse one paused VM. */
  areaEclBlocks: ReadonlyMap<number, Uint8Array>;
  /** Bounded native portrait presentation for ordinary CoK ECL1#32 cell dialogue. */
  cellDialoguePresentation?: DialoguePresentation;
  /** Profile-selected ECL address mapping used by every init and per-cell VM. */
  eclDialect: EclDialect;
  /** Resolves a script-triggered encounter's monsterIds → decoded MON{n}CHA records. */
  monsterLookup: MonsterLookup;
  /**
   * M10.S2 — the FULL decoded bestiary (`monsterLookup`'s own source records), kept alongside the
   * simplified `bestiary` seam array so the in-play Reference DB tab can show the same rich detail
   * (HD/XP/category) the standalone `?refdb=1` page does, from THIS game's real live tables.
   */
  monRecords: MonsterRecord[];
  /** M10.S2 — the live item catalogue, for the in-play Reference DB tab (same shape `referenceDb.ts`'s `itemCategory` expects). */
  itemDb: ExploreItemRecord[];
  /**
   * M35.S1 — companions recruited by this dungeon's ECL `ADD_NPC` sites (empty for the common case
   * of a dungeon that scripts none). Fought via `n{blockId}`-prefixed combatant ids — deliberately
   * NOT a persistent, levelling roster member (see `dungeonSpawn`/`resolveCombat`'s doc comment).
   */
  allies: MonsterRecord[];
  /** Persistent area-script memory, carried across steps. */
  areaMemory: Map<number, number>;
  /** Most recent retail COMBAT request before the tactical renderer's bounded figure projection. */
  lastEncounterRequest: EncounterMonster[];
  /** Stable retail location for cross-area save/load (the `{n}` archives plus ECL/GEO block id). */
  currentArea?: { disk: number; areaId: number };
  /**
   * ADR-0009 cross-archive boot only — a snapshot of a departed `game_area`'s own ECL memory,
   * captured (`ChainDialogueMachine`) right before the crossing that left it, keyed by that area's
   * own label (distinct from `map.name`, the CURRENT/landed area's label). `quickSave()` merges this
   * in alongside the live current-area bucket so two crossed game_areas' save keys never collide.
   * `undefined`/empty for every single-archive route (unchanged save shape).
   */
  priorAreaMemory?: Record<string, Record<string, number>>;
  /** Last cell index a step-event was run for (so we fire on cell-enter only). */
  lastCell: number;
  /** Short summary of the most recent step event (shown in the status line). */
  lastEvent: string;
  /**
   * M72.S1 — why the most recent move attempt failed ({@link StepResult.blocked}), cleared on a
   * successful move. `Explorer.step()` already distinguishes a real wall from the map's own edge
   * (`explorer.ts:166-183`) but neither was ever surfaced before now — only `res.moved` was read.
   */
  lastBlocked?: BlockReason;
  /**
   * Elapsed in-game time, in minutes since the campaign epoch (day 0). Resting advances it; the
   * whole-day count drives the three-moons phase display and the position line shows the clock.
   * Starts at 06:00 on day 0 (a morning start).
   */
  clockMinutes: number;
  /** Recent message-window lines (area name, events, combat outcomes), newest last. */
  messages: string[];
  /**
   * The 12 real moon-phase tiles from 8X8D block 202 (3 moons × 4 phases, 8×8 EGA,
   * magenta-keyed), in storage order 26..37 → local 0..11. Null if the asset is
   * absent (then the moon widget falls back to drawn discs). See MOON_TILE_BASE.
   */
  moonTiles: IndexedImage[] | null;
  /**
   * In-screen command menu (the original Gold Box bar on the bottom row). `'dungeon'` shows
   * "Area Cast View Encamp Search Look" (hotkey-driven; arrows still walk the party); choosing
   * Encamp switches to `'encamp'` ("Save View Magic Rest Alter Fix Exit"), a modal sub-menu with
   * a left/right cursor where movement is suspended until Exit.
   */
  menuMode: 'dungeon' | 'encamp';
  /** Cursor index within the Encamp sub-menu. */
  encampSel: number;
}

/** The 8X8D block holding the boot UI symbols, incl. the moon-phase discs (= 0xCA). */
const MOON_TILE_BLOCK = 202;
/**
 * Local tile index (into the 12-tile slice 26..37 of block 202) for each moon's NEW-phase
 * disc; the four phases are consecutive (new, waxing, full, waning). Verified by render:
 * 26–29 = Lunitari (red), 30–33 = Solinari (white), 34–37 = Nuitari (blue).
 */
const MOON_TILE_BASE: Record<MoonReading['robe'], number> = { red: 0, white: 4, black: 8 };
/** Phase → offset within a moon's 4-tile group (matches engine MOON_PHASE_ORDER). */
const MOON_PHASE_TILE: Record<string, number> = {
  lowSanction: 0,
  waxing: 1,
  highSanction: 2,
  waning: 3,
};

/** Display metadata for each Krynn moon: disc colour + a glow for the dark moon's rim. */
const MOON_STYLE: Record<MoonReading['robe'], { lit: string; dark: string; rim: string }> = {
  white: { lit: '#e6e6f0', dark: '#3a3a46', rim: '#9aa0b8' },
  red: { lit: '#d8483a', dark: '#3a1714', rim: '#7a2a22' },
  black: { lit: '#5a5a78', dark: '#14141f', rim: '#8888aa' },
};

const PHASE_LABEL: Record<string, string> = {
  lowSanction: 'New',
  waxing: 'Waxing',
  highSanction: 'Full',
  waning: 'Waning',
};

let state: ExploreState | null = null;
let exploreMountSeq = 0;
let resizeHandler: (() => void) | null = null;
// `launchCombat()` loads visual assets before it installs its overlay.  Keep explorer movement
// closed across that short handoff as well as while the overlay itself is open; otherwise a chained
// ECL combat can be overtaken by a queued move between the prior overlay's dismissal and the next
// wave becoming visible.
let combatLaunchPending = false;
// Archive-backed area transitions are asynchronous. Keep movement/save/duplicate evidence bridges
// closed until the winning mount finishes so the captured memory/pose cannot change underneath it.
let campaignRemountPending = 0;
// CoK party-defeat recovery boundary. Set only after a script continuation has finished (see
// settlePartyDefeat); while it is up the dungeon accepts no movement, encounters or camp commands.
let partyDefeatBoundary: { overlay: HTMLElement; keydown: (event: KeyboardEvent) => void } | null = null;
// Supplied by the play route (`?play=cok`) so the boundary can return to the real main menu.
let partyDefeatReturnToMenu: (() => void) | null = null;
// Chained ECL remounts in flight (remountCampaignChain). A continuation is not finished until they settle.
let scriptChainsInFlight = 0;

/**
 * CoK's retail ECL1#16 overland selector is a dispatch-only screen rather than a GEO dungeon.
 * Keep it as a modal over the live dungeon so the departed area's pose, clock, party, and ECL
 * memory remain intact until the retail script selects a walkable destination.
 */
let cokTravelMountSeq = 0;
let cokTravelOverlay: { overlay: HTMLElement; surface: ScreenSurface; keydown: (event: KeyboardEvent) => void; disposeArt: () => void } | null = null;
/**
 * CoK's opening narration hands the player to a real scripted camp before the
 * Throtl travel selector.  It is deliberately separate from a mounted
 * dungeon's general Encamp mode: this scene has no established walkable area
 * or safe evidence for the non-Exit commands' effects.
 */
let cokOpeningCampOverlay: {
  overlay: HTMLElement;
  surface: ScreenSurface;
  keydown: (event: KeyboardEvent) => void;
} | null = null;
let dokTravelOverlay: {
  overlay: HTMLElement;
  surface: ScreenSurface;
  keydown: (event: KeyboardEvent) => void;
} | null = null;
/** Pool ECL6#25, ECL7#26, and ECL8#27 are one regional host strip, not dungeons. */
let poolTravelOverlay: {
  overlay: HTMLElement;
  surface: ScreenSurface;
  keydown: (event: KeyboardEvent) => void;
} | null = null;

const GATEWAY_WILDERNESS_SLOT = 'gateway-ecl6-quick';
const GATEWAY_WILDERNESS_AREA = 'Gateway ECL6#21 wilderness';
const GATEWAY_WILDERNESS_START_CLOCK = [0, 8, 3, 8, 5, 1, 0] as const;

const COAB_REGIONAL_PICTURE_ID = 121;
/**
 * Retail `MapCursor.city_map_x/y` pairs from CoAB's recovered `ovr028.cs`. The index is
 * `Area1.current_city` / ECL word `0x4CA1`; these are display coordinates over BIGPIC1#121, not a
 * free-walk map. See `coab-city-cursor-return-binding-2026-07-29.md`.
 */
const COAB_REGIONAL_CURSOR_COORDS: readonly (readonly [x: number, y: number])[] = [
  [0x04, 0x0f], [0x0c, 0x08], [0x15, 0x0b], [0x0b, 0x04], [0x1d, 0x0a],
  [0x14, 0x04], [0x26, 0x01], [0x15, 0x02], [0x1e, 0x0d], [0x1f, 0x0f],
  [0x19, 0x03], [0x25, 0x05], [0x1c, 0x02], [0x1d, 0x08], [0x03, 0x0c],
  [0x0c, 0x0d], [0x19, 0x0a], [0x1d, 0x0c], [0x1d, 0x09], [0x21, 0x09],
  [0x13, 0x08], [0x10, 0x06], [0x09, 0x06], [0x10, 0x03], [0x14, 0x02],
  [0x15, 0x02], [0x19, 0x03], [0x19, 0x02], [0x1a, 0x03], [0x1f, 0x04],
  [0x25, 0x02], [0x22, 0x01], [0x0f, 0x00],
];

interface GatewayWildernessWebState {
  controller: GatewayEcl6WildernessController;
  ecl: Uint8Array;
  geo: Map<number, Uint8Array>;
  areaTiles: Map<number, Uint8Array>;
  bootTiles: Map<number, Uint8Array>;
  monsterLookup: MonsterLookup;
  combatAssets: CombatAssets;
  surface: ScreenSurface;
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
  root: HTMLElement;
  location: HTMLElement;
  live: HTMLElement;
  keydown: (event: KeyboardEvent) => void;
  promptOverlay: HTMLElement | null;
  promptGeneration: number;
  promptInputReady: boolean;
  transitionCount: number;
  lastViewport: { originX: number; originY: number; markerCol: number; markerRow: number };
  lastFrameChecksum: number;
  forcedEncounterInnerRolls: number[] | null;
  busy: boolean;
}

let gatewayWilderness: GatewayWildernessWebState | null = null;

const COK_TRAVEL_PICTURE_ID = 121;
const COK_TRAVEL_WIDTH = 38;
const COK_TRAVEL_HEIGHT = 15;
const COK_TRAVEL_TABLE_X_VADDR = 0x8e72;
const COK_TRAVEL_TABLE_Y_VADDR = 0x8e7e;
const COK_ECL_VBASE = 0x7ffe;
const COK_TRAVEL_DESTINATION_COUNT = 12;

interface CokTravelCoordinate { index: number; x: number; y: number }

/** Campaign state carried into the dispatch-only travel screen before/without a mounted dungeon. */
interface CampaignCarryContext {
  memory: Map<number, number>;
  areaMemory?: Record<string, Record<string, number>>;
  clockMinutes?: number;
}

/**
 * A Library-selected CoK install can provide its own real SAVGAMA.DAT.  Its
 * Area1 record contains the VM's complete persistent 0x4b00..0x4eff word
 * window, including overland coordinates and discovered-landmark flags.  Do
 * not read the bundled fresh save here: normal Play deliberately remains a
 * new campaign, while a selected folder is an explicit user choice to supply
 * original campaign state.
 */
async function loadSelectedCokCampaignMemory(): Promise<Map<number, number> | null> {
  if (!activeAssetSource || baseGameForExplore(activeGame.id) !== 'cok') return null;
  try {
    const bytes = await activeAssetSource.readAsset('SAVGAMA.DAT');
    return bytes ? decodeCoabSavgamaEclMemory(bytes) : null;
  } catch {
    // A selected folder without a usable save is still a valid asset source;
    // it simply starts the retail opening with fresh VM memory.
    return null;
  }
}

/**
 * The completed CoK retail save anchors `LastEclBlockId=98`, but ECL3#98 is an event handler with
 * no GEO load. ECL3#97 is its byte-proven `NEWECL 98` map host; `switchGen1Area` carries the saved
 * ECL words and supplies the documented two-set wall state. Keep this mapping narrow until other
 * original save host relationships are independently traced.
 */
async function selectedCokSavedMapTarget(memory: Map<number, number>): Promise<{ disk: Gen1DiskSpec; areaId: number } | null> {
  if (!activeAssetSource || memory.get(0x4bf2) !== 98) return null;
  const disk = GEN1_BASE_GAMES.cok.disks.find((candidate) => candidate.disk === 3);
  if (!disk) return null;
  const required = [disk.eclPath, disk.geoPath, disk.walldefPath, disk.tilesPath];
  const bytes = await Promise.all(required.map((path) => activeAssetSource!.readAsset(basenameOf(path))));
  return bytes.every((value) => value !== null) ? { disk, areaId: 97 } : null;
}

function currentCampaignContext(): CampaignCarryContext | null {
  if (!state) return null;
  return {
    memory: state.areaMemory,
    areaMemory: campaignAreaMemory(),
    clockMinutes: state.clockMinutes,
  };
}

/** Read the retail coordinate tables embedded in ECL1#16 (GETTABLE bases 0x8e72/0x8e7e). */
function cokTravelCoordinates(block16: Uint8Array): CokTravelCoordinate[] {
  const xOff = COK_TRAVEL_TABLE_X_VADDR - COK_ECL_VBASE;
  const yOff = COK_TRAVEL_TABLE_Y_VADDR - COK_ECL_VBASE;
  if (xOff < 0 || yOff < 0 || xOff + COK_TRAVEL_DESTINATION_COUNT > block16.length ||
      yOff + COK_TRAVEL_DESTINATION_COUNT > block16.length) return [];
  return Array.from({ length: COK_TRAVEL_DESTINATION_COUNT }, (_, index) => ({
    index,
    x: block16[xOff + index]!,
    y: block16[yOff + index]!,
  })).filter(({ index, x, y }) => index !== 0 && index !== 10 && (x !== 0 || y !== 0));
}

function isCokTravelOpen(): boolean {
  return cokTravelOverlay !== null;
}

function closeCokTravel(): void {
  cokTravelMountSeq++;
  if (!cokTravelOverlay) return;
  window.removeEventListener('keydown', cokTravelOverlay.keydown, true);
  cokTravelOverlay.disposeArt();
  cokTravelOverlay.surface.dispose();
  cokTravelOverlay.overlay.remove();
  cokTravelOverlay = null;
  (window as unknown as { __cokTravel?: Record<string, unknown> }).__cokTravel = undefined;
}

function closeCokOpeningCamp(): void {
  if (!cokOpeningCampOverlay) return;
  window.removeEventListener('keydown', cokOpeningCampOverlay.keydown, true);
  cokOpeningCampOverlay.surface.dispose();
  cokOpeningCampOverlay.overlay.remove();
  cokOpeningCampOverlay = null;
  (window as unknown as { __cokOpeningCamp?: Record<string, unknown> }).__cokOpeningCamp = undefined;
}

function isDokTravelOpen(): boolean {
  return dokTravelOverlay !== null;
}

function closeDokTravel(): void {
  if (!dokTravelOverlay) return;
  window.removeEventListener('keydown', dokTravelOverlay.keydown, true);
  dokTravelOverlay.surface.dispose();
  dokTravelOverlay.overlay.remove();
  dokTravelOverlay = null;
  (window as unknown as { __dokTravel?: Record<string, unknown> }).__dokTravel = undefined;
}

function closePoolTravel(): void {
  if (!poolTravelOverlay) return;
  window.removeEventListener('keydown', poolTravelOverlay.keydown, true);
  poolTravelOverlay.surface.dispose();
  poolTravelOverlay.overlay.remove();
  poolTravelOverlay = null;
  (window as unknown as { __poolTravel?: Record<string, unknown> }).__poolTravel = undefined;
}

/** Host audio dispatcher bridging the engine 'step' bank slot to gameAudio (built per mount). */
let stepDispatcher: SoundDispatcher | null = null;
/** Number of moved steps this session (e2e proof seam for the step-sound wiring). */
let stepCount = 0;

/** Whole in-game day (0-based) the moons phase off, derived from the running clock. */
function gameDay(): number {
  return state ? gameDayFromMinutes(state.clockMinutes) : 0;
}

function combatOutcomeForScript(res: CombatResult): EclCombatOutcome {
  if (res.fled) return 'flee';
  if (res.outcome === 'party') return 'victory';
  if (res.outcome === 'enemy') return 'defeat';
  return 'defeat';
}

/** Refresh DoK's ECL-visible native host registers from the live first-person pose. */
function seedDokHostPose(memory: Map<number, number>): void {
  if (!state || baseGameForExplore(activeGame.id) !== 'dok') return;
  const pose = state.explorer.getPose();
  const cell = state.explorer.currentCell();
  // DoK's own GAME.OVR maps these ECL-visible host registers to the live map state:
  // C04B/C04C = X/Y, C04D = facing ordinal, C04E = front wall slot, C04F = raw GEO
  // descriptor. SearchLocation already primes C04D/C04F, but scripts such as block 36's patrol
  // post compare C04C directly, and vm_run_1 reads the complete group before SearchLocation.
  memory.set(0xc04b, pose.x);
  memory.set(0xc04c, pose.y);
  memory.set(0xc04d, gen1MapDirectionValue(pose.facing));
  memory.set(0xc04e, cell.walls[pose.facing] ?? 0);
  memory.set(0xc04f, cell.floor ?? 0);
}

/** Keep DoK's script-owned local position words and host map registers coherent around events. */
function seedDokScriptPose(): void {
  if (!state || baseGameForExplore(activeGame.id) !== 'dok') return;
  // A failed/aborted prior runner must never leak its call-time reconciliation snapshot into the
  // next cell event. A live callback below installs a fresh snapshot for this run when needed.
  dokHostPoseSync = null;
  const pose = state.explorer.getPose();
  state.areaMemory.set(0x4c17, pose.x);
  state.areaMemory.set(0x4c18, pose.y);
  seedDokHostPose(state.areaMemory);
}

/** Keep Pool's local dungeon pose registers coherent without touching its regional 49C3/49C4. */
function seedPoolScriptPose(): void {
  if (!state || baseGameForExplore(activeGame.id) !== 'pool') return;
  const pose = state.explorer.getPose();
  const cell = state.explorer.currentCell();
  state.areaMemory.set(0xc04b, pose.x);
  state.areaMemory.set(0xc04c, pose.y);
  state.areaMemory.set(0xc04d, gen1MapDirectionValue(pose.facing));
  state.areaMemory.set(0xc04e, cell.walls[pose.facing] ?? 0);
  state.areaMemory.set(0xc04f, cell.floor ?? 0);
}

/** Keep CoAB's DUNGCOM host registers coherent for ECL5#49's walked patrol and west exit. */
function seedCoabScriptPose(): void {
  if (!state || baseGameForExplore(activeGame.id) !== 'coab') return;
  const pose = state.explorer.getPose();
  const cell = state.explorer.currentCell();
  state.areaMemory.set(0xc04b, pose.x);
  state.areaMemory.set(0xc04c, pose.y);
  state.areaMemory.set(0xc04d, gen1MapDirectionValue(pose.facing));
  state.areaMemory.set(0xc04e, cell.walls[pose.facing] ?? 0);
  state.areaMemory.set(0xc04f, cell.floor ?? 0);
  state.areaMemory.set(0x7f79, (cell.floor ?? 0) & 0x3f);
}

interface DokHostPoseSync {
  /** Script-local coordinates captured when the native move was dispatched. */
  scriptX: number;
  scriptY: number;
  /** Live coordinates after the native host move. */
  hostX: number;
  hostY: number;
}

let dokHostPoseSync: DokHostPoseSync | null = null;

/** Apply a DoK event's scripted stairs/teleport result back to the live first-person host. */
function applyDokScriptPose(): void {
  if (!state || baseGameForExplore(activeGame.id) !== 'dok') return;
  let x = state.areaMemory.get(0x4c17);
  let y = state.areaMemory.get(0x4c18);
  const facing = (['north', 'east', 'south', 'west'][state.areaMemory.get(0xc04d) ?? 0] ?? 'north') as Direction;
  const sync = dokHostPoseSync;
  dokHostPoseSync = null;
  // Same reconciliation rule as demoGen1's syncHostPose: a local that still equals its call-time
  // snapshot is stale and must not undo a native host move; a later ECL write remains authoritative.
  if (sync) {
    if (x === sync.scriptX) x = sync.hostX;
    if (y === sync.scriptY) y = sync.hostY;
  }
  if (x === undefined || y === undefined || x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return;
  const current = state.explorer.getPose();
  if (current.x !== x || current.y !== y || current.facing !== facing) state.explorer.setPose({ x, y, facing });
  if (sync) seedDokScriptPose();
}

/** Apply ECL1#36 selector 15's native stair move synchronously, before the VM resumes. */
function applyDokHostCall(effect: EclCallEffect, memory: Map<number, number>): void {
  if (!state || baseGameForExplore(activeGame.id) !== 'dok' || effect.routine !== 'movePositionForward') return;
  if (state.currentArea?.disk !== 1 || state.currentArea.areaId !== 36) return;
  if (((state.explorer.currentCell().floor ?? 0) & 0x3f) !== 15) return;
  const current = state.explorer.getPose();
  const scriptedFacing = (['north', 'east', 'south', 'west'][memory.get(0xc04d) ?? 0] ?? current.facing) as Direction;
  const scriptX = memory.get(0x4c17) ?? current.x;
  const scriptY = memory.get(0x4c18) ?? current.y;
  state.explorer.setPose({ ...current, facing: scriptedFacing });
  const moved = state.explorer.forward();
  if (!moved.moved) {
    throw new Error(`DoK movePositionForward blocked at ${moved.pose.x},${moved.pose.y} facing ${moved.pose.facing}`);
  }
  const pose = state.explorer.getPose();
  dokHostPoseSync = { scriptX, scriptY, hostX: pose.x, hostY: pose.y };
  seedDokHostPose(memory);
  // The native stair handler owns this move. It neither spends player-step time nor leaves draw()
  // to redispatch the destination after the same ECL run has already resumed there.
  state.lastCell = pose.y * state.map.width + pose.x;
}

/** Write Gateway's live first-person pose into the Gen1 host registers its ECL reads. */
function seedGatewayHostPose(memory: Map<number, number>): void {
  if (!state || baseGameForExplore(activeGame.id) !== 'gateway') return;
  const pose = state.explorer.getPose();
  const cell = state.explorer.currentCell();
  memory.set(0xc04b, pose.x);
  memory.set(0xc04c, pose.y);
  memory.set(0xc04d, gen1MapDirectionValue(pose.facing));
  memory.set(0xc04e, cell.walls[pose.facing] ?? 0);
  memory.set(0xc04f, cell.floor ?? 0);
  memory.set(0x7f79, (cell.floor ?? 0) & 0x3f);
}

/** Apply Gateway's final script-visible pose after a synchronous host call has returned to ECL. */
function applyGatewayScriptPose(memory: Map<number, number>): void {
  if (!state || baseGameForExplore(activeGame.id) !== 'gateway') return;
  const x = memory.get(0xc04b);
  const y = memory.get(0xc04c);
  const facing = (['north', 'east', 'south', 'west'][memory.get(0xc04d) ?? 0] ?? 'north') as Direction;
  if (x === undefined || y === undefined || x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return;
  state.explorer.setPose({ x, y, facing });
  seedGatewayHostPose(memory);
  state.lastCell = y * state.map.width + x;
}

/**
 * Execute the one Gateway native host CALL required by the canonical Sundabar route.
 *
 * ECL5#19 descriptor 18 rotates C04D by 180 degrees, normalizes it through DIV's remainder
 * side-effect at [7F3F], calls `movePositionForward`, restores the original facing, then immediately
 * redispatches `search_location` in the SAME VM run. The callback must therefore adopt the live
 * script direction before moving and refresh C04B..C04F synchronously. After the runner settles,
 * `applyGatewayScriptPose` applies the script's restored direction to the Explorer.
 */
function applyGatewayHostCall(effect: EclCallEffect, memory: Map<number, number>): void {
  if (!state || baseGameForExplore(activeGame.id) !== 'gateway' || effect.routine !== 'movePositionForward') return;
  if (((state.explorer.currentCell().floor ?? 0) & 0x3f) !== 18) return;
  const current = state.explorer.getPose();
  const scriptedFacing = (['north', 'east', 'south', 'west'][memory.get(0xc04d) ?? 0] ?? current.facing) as Direction;
  state.explorer.setPose({ ...current, facing: scriptedFacing });
  const moved = state.explorer.forward();
  if (!moved.moved) {
    throw new Error(`Gateway movePositionForward blocked at ${moved.pose.x},${moved.pose.y} facing ${moved.pose.facing}`);
  }
  seedGatewayHostPose(memory);
  const pose = state.explorer.getPose();
  // The VM itself is now redispatching this destination cell; suppress draw()'s ordinary
  // cell-enter hook from dispatching it a second time when the dialogue overlay closes.
  state.lastCell = pose.y * state.map.width + pose.x;
}

/**
 * R3's Gateway quest-flag route (`gateway-quest`) drives BOTH the Everlund rescue's own retail
 * CALL (a "press a key" pause immediately before the rescue's COMBAT — golden test D's own
 * `effects` list shows one `'call'` between `'picture'` and `'treasure'`) and the Yartar ambush's
 * identical CALL (test E). Neither is `movePositionForward` — this route has no host-CALL
 * resumption tail like descriptor 18's tavern in the OTHER Gateway routes — so
 * `applyGatewayHostCall`'s narrow `routine !== 'movePositionForward'` guard would leave compare
 * flags untouched here, diverging from the golden. The golden's own `yesCall` helper
 * (`() => ({ comparison: { left: 0, right: 1 } })`, "keeps every branch on its YES arm") is what
 * this route needs instead, reproduced verbatim so the browser dispatch matches the proven VM run.
 */
function applyGatewayQuestYesCall(): EclCallHostResult {
  return { comparison: { left: 0, right: 1 } };
}

/**
 * CoK-only: the real party is nonempty and every member is at 0 HP or below. A demo party is never
 * a defeat, and the check reads persisted HP, so it is only meaningful after combat finalization.
 */
function cokPartyFallen(): boolean {
  if (baseGameForExplore(activeGame.id) !== 'cok') return false;
  const party = getParty();
  return party.length > 0 && party.every((member) => member.hp <= 0);
}

/**
 * True while any scripted continuation or other exploration-owned modal is still in progress. The
 * fallen-party boundary must wait for all of these: a chained ECL block, a dialogue, a travel
 * selector or a combat that has not been dismissed.
 */
function scriptContinuationBusy(): boolean {
  return scriptChainsInFlight > 0 || campaignRemountPending > 0 || combatLaunchPending ||
    isCombatOpen() || isDialogueOpen() || isSheetOpen() || isMagicOpen() || isCompanionOpen() ||
    isCokTravelOpen() || isDokTravelOpen() || cokOpeningCampOverlay !== null || poolTravelOverlay !== null;
}

/**
 * Show the fallen-party boundary once the scripted continuation has finished and nothing else owns
 * the screen. Called from the points where exploration becomes interactive again: a finished
 * post-combat script, a dismissed dialogue, a finished chained remount, and (as a backstop) any
 * movement key while the party is already fallen. It never changes HP, saves or reloads.
 */
function settlePartyDefeat(): void {
  if (!state || partyDefeatBoundary || scriptContinuationBusy() || !cokPartyFallen()) return;
  openPartyDefeatBoundary();
}

/**
 * Exploration input gate for a fallen CoK party: movement, encounters and camp commands stay closed
 * behind the boundary. Returns true when the input must be ignored.
 */
function blockFallenPartyInput(): boolean {
  if (partyDefeatBoundary) return true;
  if (!cokPartyFallen()) return false;
  settlePartyDefeat();
  return true;
}

/**
 * Dialogue `onClose` runs synchronously before its `onChain` (dialogue.ts `finish()`). Defer the
 * settle one microtask so a chain handoff has already registered in `scriptChainsInFlight`. The mount
 * sequence guard drops a settle that belongs to a view that has since been replaced.
 */
function openDialogueAt(...args: Parameters<typeof openDialogueAtRaw>): void {
  const [runner, first] = args;
  const opts: DialogueOptions = args[2] ?? {};
  const onClose = opts.onClose;
  const seq = exploreMountSeq;
  openDialogueAtRaw(runner, first, {
    ...opts,
    onClose: () => {
      onClose?.();
      queueMicrotask(() => { if (seq === exploreMountSeq) settlePartyDefeat(); });
    },
  });
}

function openPartyDefeatBoundary(): void {
  closePartyDefeatBoundary();
  const overlay = el('div', 'sheet-overlay');
  const panel = el('div', 'sheet-panel cok-travel-panel');
  panel.appendChild(el('div', 'gb-dlg-title', 'Champions of Krynn · The party has fallen'));
  panel.appendChild(el(
    'div',
    'muted cok-travel-note',
    'No member of the party is conscious. The dungeon is closed to movement and encounters. Return to the main menu, where Load Saved Game restores your last save. Nothing is restored or changed automatically.',
  ));
  const choices = el('div', 'cok-travel-choices');
  const returnButton = el('button', 'gb-btn cok-travel-choice', 'Return to Main Menu') as HTMLButtonElement;
  returnButton.type = 'button';
  returnButton.addEventListener('click', returnFromPartyDefeat);
  choices.appendChild(returnButton);
  panel.appendChild(choices);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  // Capture phase: the fallen party's screen takes every key, so no explore, dialogue or combat
  // listener behind it can move the party or start a new encounter.
  const keydown = (event: KeyboardEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') returnFromPartyDefeat();
  };
  window.addEventListener('keydown', keydown, true);
  partyDefeatBoundary = { overlay, keydown };
  setStatus('The party has fallen. Return to the main menu to load a saved game.', 'error');
  returnButton.focus();
}

function closePartyDefeatBoundary(): void {
  if (!partyDefeatBoundary) return;
  window.removeEventListener('keydown', partyDefeatBoundary.keydown, true);
  partyDefeatBoundary.overlay.remove();
  partyDefeatBoundary = null;
}

/**
 * Leave the fallen dungeon through the player's own choice. The explore view is torn down first
 * (listeners, overlays and state), then the play route mounts the main menu. Standalone explore
 * routes have no menu hook, so they return to the play route instead.
 */
function returnFromPartyDefeat(): void {
  if (!partyDefeatBoundary) return;
  const toMenu = partyDefeatReturnToMenu;
  closeExplore();
  if (toMenu) toMenu();
  else window.location.assign(`${window.location.pathname}?play=cok`);
}

/**
 * Drain a runner's post-combat turns (flavour text + any single-continue prompts) up to the next
 * hard stop: 'end', 'chain', a real player prompt, or a chained SECOND 'combat' (a two-wave script like Pool's ending-area
 * KOBOLD lair, whose retail dispatch chains straight into a second identical roster after the first
 * resolves). Returns both the joined text and the terminal turn so the caller can decide whether to
 * relaunch the tactical overlay for a chained wave — mirroring `dialogue.ts`'s own recursive
 * `present()` combat-chain handling, but for the non-interactive (single-continue) step-event path.
 */
function drainAfterCombat(runner: NonNullable<ReturnType<typeof dialogueForCell>>, outcome: EclCombatOutcome) {
  const lines: string[] = [];
  let turn = runner.afterCombat(outcome);
  for (let guard = 0; guard < 16; guard++) {
    if (turn.text) lines.push(turn.text);
    if (turn.kind === 'end' || turn.kind === 'chain' || turn.kind === 'combat') break;
    if (turn.kind === 'say' && (
      turn.awaiting === 'input' || turn.awaiting === 'who' ||
      (turn.awaiting === 'menu' && turn.choices.length >= 2)
    )) break;
    turn = runner.choose(0);
    if (runner.isDone()) break;
  }
  return { text: lines.join(' ').replace(/\s+/g, ' ').trim(), turn };
}

/** Apply Pools' retail opcode-0x41 class-split XP award to the browser's name-keyed XP store. */
function applyPoolsScriptEffects(effects: readonly EclEffect[]): void {
  for (const effect of effects) {
    if (effect.type !== 'awardExperience' || effect.amount <= 0) continue;
    const roster = getParty();
    const recipients = effect.scope === 'party'
      ? roster.map((member, index) => ({ member, index }))
      : effect.selectedPartyIndex === undefined || !roster[effect.selectedPartyIndex]
        ? []
        : [{ member: roster[effect.selectedPartyIndex]!, index: effect.selectedPartyIndex }];
    for (const { member } of recipients) {
      if (member.hp <= 0) continue;
      const classCount = Object.values(member.classes).filter((level) => (level ?? 0) > 0).length;
      if (classCount > 0) addXp(member.name, Math.floor(effect.amount / classCount));
    }
  }
}

function outcomeResumeProbeRunner(): NonNullable<ReturnType<typeof dialogueForCell>> {
  let done = false;
  return {
    start: () => ({ kind: 'combat' as const, text: 'Outcome probe fight.', monsters: [{ monsterId: 9, count: 1, picBlockId: 0 }] }),
    choose: () => ({ kind: 'end' as const, text: '' }),
    afterCombat: (outcome: EclCombatOutcome = 'defeat') => {
      done = true;
      return { kind: 'end' as const, text: `GBBOOT-ECL-OUTCOME-${outcome}` };
    },
    isDone: () => done,
  } as unknown as NonNullable<ReturnType<typeof dialogueForCell>>;
}

/**
 * Run the area ECL's SearchLocation handler for the cell the party just entered (M2.S3). The
 * handler dispatches on the cell's backdrop byte via ON_GOTO — open floor is the wandering-
 * monster check, other backdrops are per-cell event scripts (room descriptions, traps, …).
 *
 * The event text is real, inline-decoded CoK strings. We drain the script through its
 * input/menu/combat pauses (auto-picking defaults — there is no combat/dialog UI yet) so all of
 * a room's lines are collected. A `combat` effect carries the queued monster roster: we resolve
 * it for real against the area's MON{n}CHA records with the demo party (deterministic per cell)
 * and fold a short outcome — "⚔ Victory +90 XP (3rd)" / "⚔ Defeated" — into the status line. A
 * bounded resume count guards against a script that never settles.
 */
function runStepEvent(backdrop: number, seed: number): string {
  if (!state) return '';
  try {
    seedDokScriptPose();
    seedPoolScriptPose();
    seedCoabScriptPose();
    seedGatewayHostPose(state.areaMemory);
    // Secret's Black Circle alert producer lives in ECL1#34's per-step vm_run_1 entry, not its
    // SearchLocation entry. Keep this narrowly scoped to the bounded evidence profile and the
    // unique descriptor-45 cell: an ordinary move supplies the real host cell byte, the retail VM
    // performs the guarded write, and its genuine NEWECL 32 uses the normal campaign remounter.
    const secretAlertStep = activeGame.id === 'secret-natural-4' &&
      state.currentArea?.disk === 1 && state.currentArea.areaId === 34 && (backdrop & 0x3f) === 45;
    if (secretAlertStep) {
      const vmRun1 = dialogueForVmRun1(state.areaEcl, {
        memory: state.areaMemory,
        dialect: state.eclDialect,
        seedMemory: { 0xc04f: backdrop & 0xff },
      });
      const turn = vmRun1?.start();
      if (turn?.kind === 'chain') {
        void remountCampaignChain(turn.blockId, state.areaMemory);
        return `Black Circle alert raised; crossing to block ${turn.blockId}.`;
      }
    }
    // Build a dialogue runner over the cell's SearchLocation handler (one VM prime). CoK frequently
    // places its real ASK behind one-button "PRESS BUTTON" flavour beats. Preserve such a lead-in
    // only when it actually reaches a later multi-choice decision; flavour-only chains (notably
    // ECL3#82's SKYLA sequence) must auto-drain into their automatic combat.
    const poolsNaturalChain = activeGame.id === 'pools-natural' &&
      state.currentArea?.areaId === 69 && (backdrop & 0x3f) === 23;
    // Pools' recovered search handler lives at virtual 0x86C3 rather than the header's ordinary
    // initial-entry pointer. Follow its same-archive NEWECL to #72 inside one chain runner so COMBAT
    // pauses/resumes the real script. Its retail code reads facing from low address 0x0011 (not the
    // older Gen1 0xC04D host slot), so refresh that byte from the call-time pose on every dispatch.
    if (poolsNaturalChain) {
      state.areaMemory.set(0x002d, backdrop & 0xff);
      state.areaMemory.set(0x0011, gen1MapDirectionValue(state.explorer.getPose().facing));
    }
    const runner = poolsNaturalChain
      ? new DialogueRunner(new ChainDialogueMachine(
          69,
          (blockId) => state!.areaEclBlocks.get(blockId),
          {
            memory: state.areaMemory,
            seed,
            dialect: state.eclDialect,
            entry: 0x86c3 - state.eclDialect.vbase,
            maxBlocks: 8,
            findCharacter: (name) => {
              const roster = getParty();
              const index = roster.findIndex((member) => member.name.trim().toUpperCase() === name.trim().toUpperCase());
              return index < 0 ? null : { index, inCombat: roster[index]!.hp > 0 };
            },
          },
          state.map.name,
        ), applyPoolsScriptEffects)
      : dialogueForCell(state.areaEcl, backdrop, {
          memory: state.areaMemory,
          seed,
          facing: state.explorer.getPose().facing,
          dialect: state.eclDialect,
          partyItemTypes: carriedItemTypeIds(),
          ...(activeGame.id === 'gateway-quest'
            ? { onCall: applyGatewayQuestYesCall }
            : baseGameForExplore(activeGame.id) === 'gateway'
              ? { onCall: applyGatewayHostCall }
              : baseGameForExplore(activeGame.id) === 'dok'
                ? { onCall: applyDokHostCall }
                : {}),
        });
    if (!runner) return '';
    const first = runner.start();
    let retainedPictureId = first.pictureId;
    const cellPresentation = (pictureId: number | undefined): DialoguePresentation | undefined =>
      pictureId === 15 && state?.cellDialoguePresentation
        ? { ...state.cellDialoguePresentation, party: compositorParty() } : undefined;
    let leadInReachesChoice = false;
    if (first.kind === 'say' && first.awaiting === 'menu' && first.choices.length === 1 && baseGameForExplore(activeGame.id) === 'cok') {
      // Look ahead using a detached memory copy. The live runner stays at the visible lead-in;
      // probing must never consume its one-shot SAVE/ADD writes merely to choose a presentation.
      const probe = dialogueForCell(state.areaEcl, backdrop, {
        memory: new Map(state.areaMemory),
        seed,
        facing: state.explorer.getPose().facing,
        dialect: state.eclDialect,
        partyItemTypes: carriedItemTypeIds(),
      });
      if (probe) {
        let probeTurn = probe.start();
        for (let guard = 0; guard < 16; guard++) {
          if (probeTurn.kind !== 'say') break;
          if (probeTurn.awaiting === 'menu' && probeTurn.choices.length >= 2) { leadInReachesChoice = true; break; }
          probeTurn = probe.choose(0);
          if (probe.isDone()) break;
        }
      }
    }
    const shouldOpenDialogue = first.kind === 'say' && first.awaiting === 'menu' &&
      (first.choices.length >= 2 || leadInReachesChoice);
    if (shouldOpenDialogue) {
      closeDialogue();
      openDialogueAt(runner, first, {
        spawn: dungeonSpawn,
        presentation: cellPresentation(retainedPictureId),
        onClose: () => {
          applyDokScriptPose();
          applyGatewayScriptPose(state!.areaMemory);
          if (partySize() > 0) refreshPartyHud();
          draw();
        },
        // The "mid-walk chain re-mount" capability (BUILD-QUEUE.md's Secret town-exit leaf): a
        // choice that resolves to a same-archive/cross-archive NEWECL (e.g. the real archway "YES")
        // re-mounts the whole dungeon view onto the target block instead of just closing — see
        // `remountChainedArea`. A blockId with no wired `chainTargets` entry is a no-op there (fails
        // soft with a status message), so every OTHER route's own unwired chain keeps its
        // pre-existing "just end the conversation" behavior.
        onChain: (blockId) => { void remountCampaignChain(blockId, state!.areaMemory); },
      });
      return `💬 ${first.text || 'Someone speaks to you.'}`;
    }
    // Non-interactive: drain the same runner to completion (text + a queued fight roster).
    const lines: string[] = [first.text];
    let roster: EncounterMonster[] | null = null;
    let setup: EncounterSetup | undefined;
    let surprise: EncounterSurprise | undefined;
    let scriptedTreasure: TreasureHaul | undefined;
    let combatRunner: typeof runner | null = null;
    let turn = first;
    for (let guard = 0; guard < 16; guard++) {
      if (turn.kind === 'combat') {
        roster = turn.monsters;
        setup = turn.setup;
        surprise = turn.surprise;
        scriptedTreasure = resolveScriptedTreasure(turn.treasure);
        combatRunner = runner;
        break;
      }
      else if (turn.kind === 'chain') {
        // Same capability as the interactive branch above, for a chain reached via the
        // non-interactive auto-drain path instead of a player-driven ask.
        void remountCampaignChain(turn.blockId, state.areaMemory);
        break;
      }
      else if (turn.kind === 'end') break;
      else if (turn.kind === 'say' && turn.awaiting === 'menu' && turn.choices.length >= 2) {
        // A real ASK surfaced after one or more one-button lead-ins. Preserve the choices rather
        // than auto-selecting zero; `runner` is already positioned on this exact retail turn.
        closeDialogue();
        openDialogueAt(runner, cellPresentation(retainedPictureId) && turn.pictureId === undefined
          ? { ...turn, pictureId: retainedPictureId } : turn, {
          spawn: dungeonSpawn,
          // PICTURE15 precedes the one-button lead-in; keep that source register on the later ASK.
          presentation: cellPresentation(retainedPictureId),
          onClose: () => {
            applyDokScriptPose();
            applyGatewayScriptPose(state!.areaMemory);
            if (partySize() > 0) refreshPartyHud();
            draw();
          },
          onChain: (blockId) => { void remountCampaignChain(blockId, state!.areaMemory); },
        });
        return `💬 ${turn.text || 'Someone speaks to you.'}`;
      }
      else turn = runner.choose(0); // 'say' → default pick
      if (turn.pictureId !== undefined) retainedPictureId = turn.pictureId;
      if (turn.text) lines.push(turn.text);
      if (runner.isDone()) break;
    }
    const text = lines.join(' ').replace(/\s+/g, ' ').trim();
    const fight = roster
      ? resolveCombat(roster, seed, combatRunner ?? undefined, setup, undefined, surprise, scriptedTreasure)
      : '';
    if (!roster) {
      applyDokScriptPose();
      applyGatewayScriptPose(state.areaMemory);
    }
    if (text) return (fight ? fight + ' ' : '') + text;
    return fight || '';
  } catch {
    return '';
  }
}

/**
 * Pool's wilderness/overland crossing (BUILD-QUEUE.md's Pool wilderness-crossing leaf, live browser
 * wiring). Drives the REAL retail `vm_run_1` dispatch on the CURRENTLY MOUNTED area block
 * (`dialogueForVmRun1`, not `dialogueForCell`/`search_location` — a genuinely different VM entry
 * point on the same block, byte-verified in the engine golden "golden Pool vm_run_1 area crossing"),
 * seeded with the SAME "a travel selection is pending" + destination-selector memory that golden
 * proved reaches a real `NEWECL 2` -> `ECL4.DAX#2`. The seed stands in for Greybox's own not-yet-
 * built wilderness/overland travel-selection UI (`WILDCOM.DAX` is unimplemented here) — the SAME
 * "stands in for the retail menu" convention this project already accepted for ADR-0009's own
 * hub-destination selector (`startCrossArchiveExplore`'s seeded initial memory). Every OTHER byte on
 * this path — the `vm_run_1` handler itself, its real `COMPARE`/`ON_GOTO`/`NEWECL` opcodes, and the
 * landed block's own `initial_entry` — is the real retail ECL, not fabricated content.
 *
 * Mirrors `runStepEvent`'s own three-way shape (interactive ask → overlay; `chain` → mid-walk
 * re-mount via `remountChainedArea`; anything else → auto-drain) so the SAME "mid-walk chain
 * re-mount" capability serves both Secret's per-cell archway and Pool's per-area `vm_run_1` crossing.
 * Returns a short status string, mirroring `runStepEvent`'s own return convention.
 */
function crossWilderness(pendingSelector = 2): string {
  if (!state) return '';
  try {
    const runner = dialogueForVmRun1(state.areaEcl, {
      memory: state.areaMemory,
      dialect: state.eclDialect,
      seedMemory: { 0x6dd5: 1, 0xc04d: pendingSelector },
    });
    if (!runner) return '';
    const first = runner.start();
    if (first.kind === 'say' && first.awaiting === 'menu' && first.choices.length >= 2) {
      closeDialogue();
      openDialogueAt(runner, first, {
        spawn: dungeonSpawn,
        onClose: () => { if (partySize() > 0) refreshPartyHud(); },
        onChain: (blockId) => { void remountCampaignChain(blockId, state!.areaMemory); },
      });
      return `💬 ${first.text || 'Someone speaks to you.'}`;
    }
    const lines: string[] = [first.text];
    let turn = first;
    for (let guard = 0; guard < 16; guard++) {
      if (turn.kind === 'chain') {
        void remountCampaignChain(turn.blockId, state.areaMemory);
        break;
      }
      if (turn.kind === 'end' || turn.kind === 'combat') break;
      turn = runner.choose(0);
      if (turn.text) lines.push(turn.text);
      if (runner.isDone()) break;
    }
    return lines.join(' ').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

/**
 * CoK's wilderness/overland crossing (BUILD-QUEUE.md's CoK wilderness-crossing leaf, live browser
 * wiring). Unlike Pool's `crossWilderness` above (which drives `vm_run_1` living IN THE SAME BLOCK
 * as a real walkable town ward, so `state.areaEcl` already carries the right bytes), CoK's real hub
 * dispatch — `search_location`, byte-verified in the engine golden "golden CoK ECL1 block 16
 * search_location wilderness crossing into ECL2 block 68" — lives in `ECL1.DAX#16`, a genuinely
 * DISPATCH-ONLY block whose own `initial_entry` has no walkable scene at all (just
 * `LOAD_FILES(127,127,127)` + a title picture, no `LOAD_PIECES`) — `loadDungeon` refuses to mount it
 * as a live dungeon (confirmed live: it throws "emitted no LOAD_PIECES"). So `cok-natural-5` boots
 * into a real walkable CoK area instead (mirroring `cok`'s own default anchor, `ECL1.DAX#34`) purely
 * so the browser view has something to render, and THIS function independently fetches
 * `ECL1.DAX`/block 16 itself — not `state.areaEcl` — to run the real `search_location` dispatch.
 * The `backdrop` argument is unused by this crossing (the block's own search loop reinitializes its
 * working registers before reading anything backdrop-derived), so `0` is passed; the real seed is
 * `[0x4bc3]`/`[0x4bc4]` (the world-map coordinate pair arm 11's own table entry matches) plus
 * `[0x4c37]` (arm 11's own extra "this outpost has been discovered" gate). This function remains as
 * the deterministic legacy Outpost regression; normal play now reaches the same block through
 * `openCokTravel()`, which renders the retail `PICTURE 121` frame and reads all coordinates from the
 * block's embedded GETTABLE arrays instead of seeding one destination behind a test seam.
 *
 * Mirrors `crossWilderness`'s own three-way shape (interactive ask → overlay; `chain` → mid-walk
 * re-mount via `remountChainedArea`; anything else → auto-drain). Returns a short status string,
 * mirroring `runStepEvent`'s own return convention.
 */
async function crossCokWilderness(): Promise<string> {
  if (!state) return '';
  try {
    const hubEcl = await fetchDax('Champions of Krynn/ECL1.DAX');
    const block16 = hubEcl.get(16);
    if (!block16) return '';
    const runner = dialogueForCell(block16, 0, {
      memory: state.areaMemory,
      dialect: state.eclDialect,
      seedMemory: { 0x4bc3: 15, 0x4bc4: 11, 0x4c37: 1 },
    });
    if (!runner) return '';
    const first = runner.start();
    if (first.kind === 'say' && first.awaiting === 'menu' && first.choices.length >= 2) {
      closeDialogue();
      openDialogueAt(runner, first, {
        spawn: dungeonSpawn,
        onClose: () => { if (partySize() > 0) refreshPartyHud(); },
        onChain: (blockId) => { void remountCampaignChain(blockId, state!.areaMemory); },
      });
      return `💬 ${first.text || 'Someone speaks to you.'}`;
    }
    const lines: string[] = [first.text];
    let turn = first;
    for (let guard = 0; guard < 16; guard++) {
      if (turn.kind === 'chain') {
        void remountCampaignChain(turn.blockId, state.areaMemory);
        break;
      }
      if (turn.kind === 'end' || turn.kind === 'combat') break;
      turn = runner.choose(0);
      if (turn.text) lines.push(turn.text);
      if (runner.isDone()) break;
    }
    return lines.join(' ').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

/**
 * General "edge-of-map ECL exit" live dispatch (BUILD-QUEUE.md's map-edge live-crossing leaf) —
 * the browser-side counterpart to the engine's `StepResult.edgeExit` hook
 * (`packages/engine/src/world/explorer.ts`'s `markMapEdgeExits`). Fired from `applyMove` whenever
 * a REAL walked step returns `blocked: 'edge'` with an `edgeExit` attached (i.e. the party actually
 * walked into a boundary cell `GameData.edgeExit` opted into the perimeter marking). Unlike the
 * legacy deterministic `crossWilderness`/`crossCokWilderness` seams, this is driven by ordinary
 * movement and now hands CoK block 16 to the visible retail-data-backed travel selector.
 *
 * Only one `edgeExit.kind` is understood today: `'vm_run_1'` — CoK's `tried_to_exit_map` "DO YOU
 * WISH TO LEAVE?" prompt (byte-verified in "primeVmRun1 — golden CoK ECL2 block 50 town exit"),
 * driven the exact same way `crossWilderness` drives Pool's own `vm_run_1` crossing:
 * `dialogueForVmRun1` on the CURRENTLY MOUNTED block's own bytes (CoK's exit handler lives in the
 * SAME block the party is walking around in, unlike CoK's own wilderness-hub crossing, which is a
 * separate dispatch-only block). `edgeExit.meta.seedMemory` supplies whatever the handler needs
 * primed (CoK: `[0x7ed5]=1`) — the SAME "seed the host-computed condition directly" convention
 * `crossWilderness`'s own doc comment already uses. Any other `kind` is a silent no-op, mirroring
 * `remountChainedArea`'s own "not wired yet" fail-soft convention, so a future profile (e.g. Pool's
 * own wilderness leaf) can declare a different exit shape without this function needing to already
 * understand it.
 *
 * Mirrors `crossWilderness`'s own three-way shape (interactive ask → overlay; `chain` → campaign
 * handoff; anything else → auto-drain). CoK's ECL1#16 remains correctly non-walkable, but
 * `remountCampaignChain` recognizes that retail shape and opens `openCokTravel()` rather than
 * failing the crossing or pretending the hub has GEO/WALLDEF content.
 */
async function triggerEdgeExit(edgeExit: EdgeExit): Promise<string> {
  if (!state || edgeExit.kind !== 'vm_run_1') return '';
  try {
    seedDokScriptPose();
    seedCoabScriptPose();
    const seedMemory = (edgeExit.meta?.seedMemory as Record<number, number> | undefined) ?? {};
    const runner = dialogueForVmRun1(state.areaEcl, {
      memory: state.areaMemory,
      dialect: state.eclDialect,
      seedMemory,
    });
    if (!runner) return '';
    const first = runner.start();
    if (first.kind === 'say' && first.awaiting === 'menu' && first.choices.length >= 2) {
      closeDialogue();
      openDialogueAt(runner, first, {
        spawn: dungeonSpawn,
        onClose: () => { if (partySize() > 0) refreshPartyHud(); },
        onChain: (blockId) => { void remountCampaignChain(blockId, state!.areaMemory); },
      });
      return `💬 ${first.text || 'Someone speaks to you.'}`;
    }
    const lines: string[] = [first.text];
    let turn = first;
    for (let guard = 0; guard < 16; guard++) {
      if (turn.kind === 'chain') {
        void remountCampaignChain(turn.blockId, state.areaMemory);
        break;
      }
      if (turn.kind === 'end' || turn.kind === 'combat') break;
      turn = runner.choose(0);
      if (turn.text) lines.push(turn.text);
      if (runner.isDone()) break;
    }
    return lines.join(' ').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

/** Spawn a dungeon dialogue fight against the area's real MON{n}CHA records (not demo foes). */
/**
 * M35.S1 — turn this dungeon's ECL-recruited companions (`state.allies`) into party-side
 * `Combatant`s, `n{blockId}`-prefixed so they never collide with real roster HP persistence
 * (`party.ts`'s `applyCombatHp`/`awardPartyXp` only recognize `p{n}` ids — an `n`-prefixed id parses
 * to an index far past `MAX_PARTY` (6) and is dropped by the bounds check there, NOT by an
 * integer-parse failure as an earlier draft of this round's audit assumed; verified directly against
 * `party.ts` before relying on it). Allies fight, but aren't a persistent, levelling roster member —
 * that would need a class/level system this data doesn't carry.
 */
function allyCombatants(): Combatant[] {
  return (state?.allies ?? []).map((rec) => monsterCombatant(rec, `n${rec.blockId}`, 'party'));
}

/** Resolve a retail ECL TREASURE queue against the currently mounted ITEM archive. */
function resolveScriptedTreasure(
  treasure: Extract<EclEffect, { type: 'treasure' }> | undefined,
): TreasureHaul | undefined {
  if (!state || !treasure || treasure.itemSource !== 'itemBlock') return undefined;
  const items = state.itemDb
    .filter((item) => item.archiveBlockId === treasure.itemBlockId)
    .map((item) => ({
      name: item.name,
      baseTypeId: item.baseTypeId,
      ...(item.itemTypeId !== undefined ? { itemTypeId: item.itemTypeId } : {}),
      count: Math.max(1, item.count ?? 0),
      ...(item.value ? { value: item.value } : {}),
    }));
  const gold = Math.max(0, treasure.coins.gold);
  return gold > 0 || items.length > 0 ? { gold, items } : undefined;
}

function dungeonSpawn(
  roster: readonly EncounterMonster[],
  treasure?: Extract<EclEffect, { type: 'treasure' }>,
  lookup?: MonsterLookup,
): DialogueCombat {
  const list = [...roster];
  const pose = state?.explorer.getPose();
  const seed = pose ? ((pose.x * 73 + pose.y * 193) & 0xffff) : 0x0d1a;
  const terr = encounterTerrain(seed);
  const party = [
    ...(partySize() > 0 ? partyCombatants() : DEMO_PARTY.map((spec) => partyCombatant(spec, addnd1e))),
    ...allyCombatants(),
  ];
  // Overland dialogue can legitimately be mounted while the opening/camp host has no dungeon
  // `state` yet. Its caller supplies the same retail MON archive lookup in that case.
  const effectiveLookup = lookup ?? state?.monsterLookup ?? (() => undefined);
  const { enemies } = spawnEnemies(list, effectiveLookup);
  const names = encounterNames(party, list, effectiveLookup);
  return {
    party,
    enemies,
    ...(baseGameForExplore(activeGame.id) === 'cok' ? { assetPaths: combatBackdropPaths(activeGame) } : {}),
    combatantPictureIds: combatantPictureIdsFor(list, effectiveLookup),
    names,
    intro: enemies.length === 1 ? `A ${enemies[0]!.name} attacks!` : 'Monsters attack!',
    seed,
    terrain: terr?.terrain,
    backgroundIds: terr?.backgroundIds,
    partyAnchor: terr?.partyAnchor,
    enemyAnchor: terr?.enemyAnchor,
    mapDirection: pose ? FACING_NUM[pose.facing] : undefined,
    day: gameDay(),
    scriptedTreasure: resolveScriptedTreasure(treasure),
  };
}

/** Ordinal suffix for a small round count (1st/2nd/3rd/4th…). */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/**
 * Fight a script-triggered encounter on the **playable tactical screen** (A3.4). Spawns the roster
 * with {@link spawnEnemies} (same line-up the auto-resolver would build), then hands off to the
 * interactive combat overlay ({@link launchCombat}): the player fights it out turn-by-turn and, on
 * dismiss, control returns to the dungeon via `onEnd` — surviving HP already persisted, the status
 * line updated with the outcome. The seed is cell-derived so a given cell always plays out from the
 * same initiative/roll stream. The demo four stand in when no party has been created. The combat
 * overlay is modal (capture-phase keys), so the dungeon is effectively paused while it is up.
 */
/**
 * CT.3 — derive the tactical battle terrain from the dungeon cell the fight starts on. Samples the
 * GEO walls/doors around the party's pose so corridors pen the fighters into a lane and rooms open up.
 * Returns the terrain + start anchors for `launchCombat`, or null to fall back to the flat field.
 */
function coabFurnitureRoller(seed: number): { rollD10: () => number } {
  const rng = new Rng((seed ^ 0x370d3) >>> 0);
  return { rollD10: () => rng.die(10) };
}

function encounterTerrain(seed: number): ReturnType<typeof buildCoabDungeonCombatMap> | null {
  if (!state) return null;
  const pose = state.explorer.getPose();
  return encounterTerrainForPose(pose, seed);
}

function encounterTerrainForPose(pose: Pose, seed: number): ReturnType<typeof buildCoabDungeonCombatMap> | null {
  if (!state) return null;
  const map = state.map;
  const at = (dx: number, dy: number): (typeof map.cells)[number] | null =>
    dx < 0 || dy < 0 || dx >= map.width || dy >= map.height ? null : map.cells[dy * map.width + dx] ?? null;
  return buildCoabDungeonCombatMap({
    sample: (dx, dy) => at(dx, dy)?.walls ?? null,
    sampleDoors: (dx, dy) => at(dx, dy)?.doors ?? null,
    sampleX2: (dx, dy) => at(dx, dy)?.floor ?? 0,
    randomFurniture: coabFurnitureRoller(seed),
    party: pose,
  });
}

function summarizeBackgroundIds(ids: readonly number[], width: number, height: number): { w: number; h: number; cells: number; checksum: number; nonFloor: number } {
  let checksum = 0x811c9dc5;
  let nonFloor = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i] ?? 0;
    if (id !== 23) nonFloor++;
    checksum ^= (id + i) & 0xff;
    checksum = Math.imul(checksum, 0x01000193) >>> 0;
  }
  return { w: width, h: height, cells: ids.length, checksum, nonFloor };
}

function resolveCombat(
  roster: EncounterMonster[],
  seed: number,
  runner?: NonNullable<ReturnType<typeof dialogueForCell>>,
  setup?: EncounterSetup,
  mapDirection?: number,
  surprise?: EncounterSurprise,
  scriptedTreasure?: TreasureHaul,
): string {
  if (!state) return '';
  state.lastEncounterRequest = roster.map((group) => ({ ...group }));
  // Fight with the player's created party when they have one; otherwise the built-in demo four.
  const hasRealParty = partySize() > 0;
  const party = [
    ...(hasRealParty ? partyCombatants() : DEMO_PARTY.map((spec) => partyCombatant(spec, addnd1e))),
    ...allyCombatants(),
  ];
  const { enemies, unresolved } = spawnEnemies(roster, state.monsterLookup);
  // No record matched any roster entry → no real fight happened; show a neutral marker.
  if (enemies.length === 0) return roster.length ? '⚔ encounter' : '';
  const names = encounterNames(party, roster);
  const combatantPictureIds = combatantPictureIdsFor(roster, state.monsterLookup);
  const terr = encounterTerrain(seed);
  const direction = mapDirection ?? FACING_NUM[state.explorer.getPose().facing];
  combatLaunchPending = true;
  void launchCombat({
    party,
    enemies,
    combatantPictureIds,
    names,
    seed,
    terrain: terr?.terrain,
    backgroundIds: terr?.backgroundIds,
    partyAnchor: terr?.partyAnchor,
    enemyAnchor: terr?.enemyAnchor,
    ...(setup ? { encounterSetup: setup } : {}),
    ...(surprise ? { encounterSurprise: surprise } : {}),
    mapDirection: direction,
    intro: enemies.length === 1 ? `A ${enemies[0]!.name} attacks!` : 'Monsters attack!',
    day: gameDay(),
    assetPaths: combatBackdropPaths(activeGame),
    scriptedTreasure,
    onEnd: (res) => {
      // HP was persisted inside the combat finalize(); just refresh the HUD + report the outcome.
      if (hasRealParty) refreshPartyHud();
      const drained = runner ? drainAfterCombat(runner, combatOutcomeForScript(res)) : null;
      const tag =
        res.outcome === 'party' ? `⚔ Victory +${res.xpAwarded} XP (${ordinal(res.rounds)})`
        : res.outcome === 'enemy' ? `⚔ Defeated (${ordinal(res.rounds)})`
        : res.fled ? `⚔ Fled (${ordinal(res.rounds)})`
        : `⚔ Draw (${ordinal(res.rounds)})`;
      // A chained second (or later) wave -- e.g. Pool's ending-route KOBOLD lair, whose retail script
      // resumes straight into another identical roster on victory -- relaunches the tactical overlay
      // with the SAME runner, so its own afterCombat() is reached again next time. Mirrors dialogue.ts's
      // present() recursive combat-chain handling, but for this non-interactive (single-continue) path.
      if (drained && drained.turn.kind === 'combat' && runner) {
        setStatus(drained.text ? `${tag} ${drained.text}` : tag);
        resolveCombat(
          drained.turn.monsters,
          seed,
          runner,
          drained.turn.setup,
          direction,
          drained.turn.surprise,
          resolveScriptedTreasure(drained.turn.treasure),
        );
        return;
      }
      // A post-combat script that ends by chaining to another ECL block takes the same campaign handoff
      // as the dialogue `onChain` and step-event paths: the remount is counted in `scriptChainsInFlight`
      // and settles the fallen-party boundary itself when it finishes, so no defeat is shown before it.
      // CoK-only: other games keep their pre-F6 post-combat chain handling unchanged.
      if (drained && drained.turn.kind === 'chain' && runner && baseGameForExplore(activeGame.id) === 'cok') {
        setStatus(drained.text ? `${tag} ${drained.text}` : tag);
        if (state) void remountCampaignChain(drained.turn.blockId, state.areaMemory);
        return;
      }
      if (drained && drained.turn.kind === 'say' && runner) {
        // A post-combat retail prompt still belongs to this exact paused runner. Preserve it for
        // genuine player input instead of submitting default zero repeatedly and losing the chain.
        // Pools' Oracle INPUT_STRING is the first natural route to exercise this generic handoff.
        const prompt = drained.turn;
        setStatus(drained.text ? `${tag} ${drained.text}` : tag);
        closeDialogue();
        openDialogueAt(runner, prompt, {
          spawn: dungeonSpawn,
          onClose: () => {
            applyDokScriptPose();
            applyGatewayScriptPose(state!.areaMemory);
            if (partySize() > 0) refreshPartyHud();
            draw();
          },
          onChain: (blockId) => { void remountCampaignChain(blockId, state!.areaMemory); },
        });
        return;
      }
      // R3 handover: `ECL3.DAX#5`'s Amanitas-rescue victory is the ONLY writer of `[0x4C21]`
      // corpus-wide (`gatewayQuestFlag.test.ts` test B); once it lands as 1, promote the
      // cross-archive quest leg from engine evidence to a live re-mount, exactly the way the
      // golden's own end-to-end test G carries the setter's memory into `ECL2.DAX#1`. This is
      // deliberately keyed on the WRITTEN VALUE, not merely "a fight happened in this area" —
      // `docs/engine/research/gateway-quest-flag.md` §12 states plainly that the crossing itself
      // (walking from Everlund's undercity back to Yartar through the wilderness) is NOT observed
      // here; only the memory carry is modelled, matching the golden's own disclosed boundary.
      if (activeGame.id === 'gateway-quest' && state!.currentArea?.disk === 3 &&
          state!.currentArea.areaId === 5 && (state!.areaMemory.get(0x4c21) ?? 0) === 1) {
        const disk = GEN1_BASE_GAMES.gateway.disks.find((d) => d.disk === 2);
        if (disk) {
          setStatus(drained?.text ? `${tag} ${drained.text} Crossing to Yartar…` : `${tag} Crossing to Yartar…`);
          const memory = new Map(state!.areaMemory);
          // [0x4BF2] = LastEclBlockId (ECL6#21, the proven wilderness block); [0x03B2] = the
          // entry facing ECL2#1's own 0x835B copies into [0xC04D] (2 = south) — both are the
          // exact host inputs golden test G seeds before booting ECL2#1's `initial_entry`.
          memory.set(0x4bf2, 21);
          memory.set(0x03b2, 2);
          void switchGen1Area('gateway', disk, 1, {
            carriedMemory: memory,
            areaMemory: campaignAreaMemory(),
            clockMinutes: state!.clockMinutes,
            // Byte-grounded north-gate re-entry spawn (golden test G): 0x838D `SAVE #0 ->
            // [0xC04C]`, 0x8393 `SAVE #11 -> [0xC04B]`, facing south from the seeded [0x03B2].
            pose: { x: 11, y: 0, facing: 'south' },
          });
          return;
        }
      }
      const suffix = drained?.text ? ` ${drained.text}` : '';
      setStatus(unresolved.length ? `${tag}${suffix} [${unresolved.length} unknown]` : `${tag}${suffix}`);
      // Terminal only: no script (natural encounter) or the script itself ended. A pending prompt
      // settles on its dialogue close; a chain settles when its remount finishes.
      if (!drained || drained.turn.kind === 'end') settlePartyDefeat();
    },
  }).then(
    () => { combatLaunchPending = false; },
    () => { combatLaunchPending = false; },
  );
  return unresolved.length ? `⚔ Combat! [${unresolved.length} unknown]` : '⚔ Combat!';
}

/**
 * A4.3 test seam: launch a deterministically-winnable encounter (one 1-HP, AC-20, near-harmless foe)
 * with the real party so the post-battle **treasure** flow can be exercised — the party is virtually
 * certain to win, and being seeded the outcome is reproducible. Returns a status marker.
 */
function winFight(seed: number): string {
  if (!state) return '';
  const hasRealParty = partySize() > 0;
  const party = hasRealParty ? partyCombatants() : DEMO_PARTY.map((spec) => partyCombatant(spec, addnd1e));
  const enemies: Combatant[] = [
    { id: 'e0', name: 'Goblin', side: 'enemy', hp: 1, maxHp: 1, thac0: 20, ac: 20, damage: { count: 1, sides: 2, bonus: 0 }, xp: 30 },
  ];
  const names = new Map<string, string>();
  for (const c of [...party, ...enemies]) names.set(c.id, c.name);
  void launchCombat({
    party,
    enemies,
    names,
    seed,
    intro: 'A lone goblin blocks the way!',
    day: gameDay(),
    assetPaths: combatBackdropPaths(activeGame),
    onEnd: (res) => {
      if (hasRealParty) refreshPartyHud();
      setStatus(res.outcome === 'party' ? `⚔ Victory +${res.xpAwarded} XP` : '⚔ Encounter');
    },
  });
  return '⚔ Combat!';
}

/** Map every combatant id in a resolved encounter to a display name (enemy ids replay the roster). */
function encounterNames(
  party: Combatant[],
  roster: EncounterMonster[],
  lookup: MonsterLookup = state?.monsterLookup ?? (() => undefined),
): Map<string, string> {
  const names = new Map<string, string>();
  for (const c of party) names.set(c.id, c.name);
  let n = 0;
  for (const g of roster) {
    const rec = lookup(g.monsterId);
    if (!rec) continue;
    for (let i = 0; i < g.count; i++) names.set(`e${n++}`, rec.name);
  }
  return names;
}

/** Resolve ECL CPIC block ids onto tactical enemy ids in the same order as {@link spawnEnemies}. */
function combatantPictureIdsFor(
  roster: readonly EncounterMonster[],
  lookup: MonsterLookup,
): ReadonlyMap<string, number> {
  const pictureIds = new Map<string, number>();
  if (baseGameForExplore(activeGame.id) !== 'cok') return pictureIds;
  let index = 0;
  for (const group of roster) {
    if (!lookup(group.monsterId)) continue;
    for (let i = 0; i < group.count; i++) pictureIds.set(`e${index++}`, group.picBlockId);
  }
  return pictureIds;
}

function setStatus(msg: string, kind: 'info' | 'error' = 'info'): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (!s) return;
  s.textContent = msg;
  s.className = kind === 'error' ? 'status error' : 'status';
}

/**
 * Rebuild the right-hand party roster, Gold-Box style: a numbered list where each row carries the
 * character's name, class/level, AC and current/max HP — coloured by wound severity, struck out
 * when down. With no created party the explore view fights the built-in demo four, so the panel
 * says so. (`.gb-party` is the panel filled here.)
 */
let partyRosterRevision = 0;
let partyIconScope = '';
const partyIconLoads = new Map<string, Promise<CokPlayerPreparation | null>>();

function refreshPartyHud(): void {
  if (state) drawScreen(); // the party panel is part of the emulated screen now
  const panel = document.querySelector('.gb-party') as HTMLElement | null;
  if (!panel) return;
  panel.innerHTML = '';
  panel.appendChild(el('div', 'gb-panel-h', 'Party'));
  const members = partyStatus();
  const roster = getParty();
  const revision = ++partyRosterRevision;
  const current = state;
  const mount = exploreMountSeq;
  const pack = localAssetPackRevision();
  const scope = String(mount) + ':' + pack;
  if (partyIconScope !== scope) { partyIconLoads.clear(); partyIconScope = scope; }
  if (members.length === 0) {
    panel.appendChild(
      el('div', 'gb-party-empty', 'No party yet — encounters use the demo four. Create one with “✦ Create party (CoK)”.'),
    );
    return;
  }
  members.forEach((m, i) => {
    const frac = m.maxHp > 0 ? Math.max(0, Math.min(1, m.hp / m.maxHp)) : 0;
    const sev = m.down ? 'down' : frac > 0.5 ? 'ok' : frac > 0.25 ? 'warn' : 'crit';
    const row = el('div', `gb-party-row ${sev}`);
    row.appendChild(el('span', 'gb-party-idx', String(i + 1)));
    const member = roster[i];
    const appearance = member?.appearance;
    if (baseGameForExplore(activeGame.id) === 'cok' && appearance) {
      const identity = JSON.stringify(appearance);
      const icon = el('span', 'gb-party-icon');
      const canvas = document.createElement('canvas');
      canvas.hidden = true;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', m.name + ' character icon');
      const label = el('span', 'gb-party-icon-status', 'Loading character icon…');
      label.setAttribute('role', 'status');
      icon.append(canvas, label);
      row.classList.add('has-player-icon');
      row.appendChild(icon);
      let loading = partyIconLoads.get(identity);
      if (!loading) {
        loading = prepareCokPlayerAppearance(appearance, undefined, 'primary');
        partyIconLoads.set(identity, loading);
      }
      const isCurrent = (): boolean => row.isConnected && state === current && mount === exploreMountSeq
        && revision === partyRosterRevision && pack === localAssetPackRevision()
        && getParty()[i] === member && JSON.stringify(member.appearance) === identity;
      void presentCokPartyRosterIcon(loading, { mode: readRuntimeGraphicsMode('cok'),
        fallback: readRuntimeGraphicsFallback('cok') }, isCurrent, (presentation) => {
        label.textContent = presentation.label;
        canvas.hidden = presentation.state !== 'ready';
        if (presentation.state !== 'ready') return;
        const art = presentation.art;
        canvas.width = art.width; canvas.height = art.height;
        canvas.getContext('2d')?.putImageData(
          new ImageData(new Uint8ClampedArray(art.pixels), art.width, art.height), 0, 0);
      }, () => { canvas.hidden = true; label.textContent = 'Character icon unavailable'; });
    }
    row.appendChild(el('span', 'gb-party-name', m.name));
    row.appendChild(el('span', 'gb-party-cls', m.cls));
    row.appendChild(el('span', 'gb-party-ac', `AC ${m.ac}`));
    row.appendChild(el('span', 'gb-party-hp', m.dead ? 'DEAD' : m.down ? 'DOWN' : `${m.hp}/${m.maxHp}`));
    panel.appendChild(row);
  });
}

/**
 * Blit the real 8X8D moon-phase tile (block 202) for this moon onto the canvas, scaled
 * nearest-neighbour. Returns false if the tile asset isn't loaded so the caller can fall
 * back to the drawn disc. This is the authentic game art — the same 8×8 magenta-keyed
 * symbol the DOS engine puts at the top of the screen.
 */
function blitMoonTile(canvas: HTMLCanvasElement, m: MoonReading): boolean {
  const tiles = state?.moonTiles;
  if (!tiles) return false;
  const local = MOON_TILE_BASE[m.robe] + (MOON_PHASE_TILE[m.phase] ?? 0);
  const img = tiles[local];
  if (!img) return false;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const rgba = indexedToRGBA(img); // magenta (13) → alpha 0
  const off = document.createElement('canvas');
  off.width = img.width;
  off.height = img.height;
  const octx = off.getContext('2d');
  if (!octx) return false;
  const id = octx.createImageData(img.width, img.height);
  id.data.set(rgba);
  octx.putImageData(id, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  return true;
}

/** Draw one moon disc: the real 8X8D tile if loaded, else a drawn fallback for its phase. */
function drawMoonDisc(canvas: HTMLCanvasElement, m: MoonReading): void {
  if (blitMoonTile(canvas, m)) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const r = w / 2;
  const style = MOON_STYLE[m.robe];
  ctx.clearRect(0, 0, w, w);
  // Dark base disc.
  ctx.fillStyle = style.dark;
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.fill();
  // Lit portion: full disc, right half (waxing), or left half (waning); new shows none.
  if (m.illumination >= 0.99) {
    ctx.fillStyle = style.lit;
    ctx.beginPath();
    ctx.arc(r, r, r - 1, 0, Math.PI * 2);
    ctx.fill();
  } else if (m.illumination > 0) {
    const waxing = m.phase === 'waxing';
    ctx.fillStyle = style.lit;
    ctx.beginPath();
    ctx.arc(r, r, r - 1, waxing ? -Math.PI / 2 : Math.PI / 2, waxing ? Math.PI / 2 : (3 * Math.PI) / 2);
    ctx.fill();
  }
  // Rim so the dark moon stays visible on black.
  ctx.strokeStyle = style.rim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(r, r, r - 1, 0, Math.PI * 2);
  ctx.stroke();
}

/** Rebuild the three-moons top bar (Lunitari/Solinari/Nuitari) for the current game day. */
function renderMoons(): void {
  const wrap = document.querySelector('.gb-moonbar') as HTMLElement | null;
  if (!wrap || !state) return;
  wrap.innerHTML = '';
  const row = el('div', 'gb-moons-row');
  for (const m of moonPhasesForDay(gameDay())) {
    const cell = el('div', `gb-moon robe-${m.robe}`);
    const disc = el('canvas', 'pixelated gb-moon-disc') as HTMLCanvasElement;
    disc.width = 24; // 8×8 tile × 3 (nearest-neighbour, crisp)
    disc.height = 24;
    drawMoonDisc(disc, m);
    cell.appendChild(disc);
    cell.appendChild(el('span', 'gb-moon-name', m.info.moon));
    cell.appendChild(el('span', 'gb-moon-phase', PHASE_LABEL[m.phase] ?? m.phase));
    cell.title = `${m.info.moon} (${m.info.robe} robe) — ${PHASE_LABEL[m.phase] ?? m.phase}`;
    row.appendChild(cell);
  }
  wrap.appendChild(row);
  const cal = calendarFromClock(clockFromMinutes(state.clockMinutes));
  wrap.appendChild(
    el(
      'div',
      'gb-moonbar-day',
      `${formatGameTime(state.clockMinutes)} — Day ${cal.day + 1} of Month ${cal.month + 1}, Year ${cal.year}`,
    ),
  );
}

/**
 * Extract the 12 real moon-phase tiles (3 moons × 4 phases) from the 8X8D boot UI block
 * (id 202). `groupStarts` names each title's absolute [red, white, black] four-tile groups; the
 * returned local array is always normalized to that order for `compositorMoons`.
 */
function extractMoonTiles(
  tileBlocks: Map<number, Uint8Array>,
  groupStarts: readonly [number, number, number] | null | undefined = [26, 30, 34],
): IndexedImage[] | null {
  if (groupStarts === null) return null;
  const raw = tileBlocks.get(MOON_TILE_BLOCK);
  if (!raw) return null;
  try {
    const ts = decode8x8dBlock(raw, `8X8D1#${MOON_TILE_BLOCK}`, { transparentMagenta: true });
    if (groupStarts.some((start) => start < 0 || start + 4 > ts.tiles.length)) return null;
    return groupStarts.flatMap((start) => ts.tiles.slice(start, start + 4));
  } catch {
    return null;
  }
}

/** Append a line to the bottom message window (bounded history) and re-render it. */
function pushMessage(text: string): void {
  if (!state || !text) return;
  const last = state.messages[state.messages.length - 1];
  if (text === last) return; // collapse immediate repeats (standing still re-fires the cell event)
  state.messages.push(text);
  if (state.messages.length > 60) state.messages.shift();
  renderMessages();
  if (state.surface) drawScreen(); // the message window is part of the emulated screen
}

/** Re-render the message window from `state.messages`, newest at the bottom, auto-scrolled. */
function renderMessages(): void {
  const win = document.querySelector('.gb-msg-body') as HTMLElement | null;
  if (!win || !state) return;
  win.innerHTML = '';
  for (const line of state.messages) win.appendChild(el('div', 'gb-msg-line', line));
  win.scrollTop = win.scrollHeight;
}

/**
 * Encamp → Rest. Heals the party by **natural bed rest** (engine `planRest`: 1 HP per living member
 * per day), advances the game clock by however many days that took, walks the three moons forward,
 * and reports the elapsed time + HP recovered. Called with no argument it rests just long enough to
 * fully heal (the convenience default); with an explicit `days` it rests exactly that span — the
 * games' choose-a-duration camp, which passes time (and moves the moons) even at full health. With
 * nobody wounded and no fixed span, no time passes and the message says so. Dead members stay down.
 */
function restAndRefresh(days?: number): void {
  if (partySize() === 0) {
    setStatus('No created party to rest — make one with “✦ Create party (CoK)”.');
    pushMessage('You have no party to rest.');
    return;
  }
  if (!state) return;
  // ovr021 rest model: a "rest tick" is 10 s, so 6 ticks = 1 game minute. Natural healing is the
  // engine's +1 HP per living member every REST_TICKS_PER_HEAL (288) ticks (= 48 game minutes/HP).
  const TICKS_PER_MINUTE = 6;
  const MINUTES_PER_DAY = 1440;
  // How long to rest. A fixed-span camp rests exactly `days`; the convenience default rests just long
  // enough for the most-wounded non-permadead member to fully heal (maxMissing HP × 288 ticks/HP).
  // M89.S1 — a merely-unconscious member (down but not dead, CT.7h) heals on rest too, so sizing must
  // not exclude them the way it excludes the truly dead.
  let ticksNeeded: number;
  if (typeof days === 'number') {
    ticksNeeded = Math.max(0, Math.floor(days)) * MINUTES_PER_DAY * TICKS_PER_MINUTE;
  } else {
    const living = partyStatus().filter((s) => !s.dead);
    const maxMissing = living.reduce((m, s) => Math.max(m, s.maxHp - s.hp), 0);
    ticksNeeded = maxMissing * REST_TICKS_PER_HEAL;
  }
  // Nobody wounded and no fixed span → no time passes (preserve the original early-out).
  if (ticksNeeded <= 0) {
    setStatus('The party is already well rested — no time passes.');
    pushMessage('You make camp, but everyone is already at full health.');
    return;
  }
  const elapsedMinutes = Math.ceil(ticksNeeded / TICKS_PER_MINUTE);
  // (1) Heal via the engine rest-healer (writes HP back into the roster).
  const healed = restPartyTicks(ticksNeeded);
  // (2) Advance the 7-slot clock faithfully and project back to flat minutes.
  const stepped = stepGameTime(clockFromMinutes(state.clockMinutes), SLOT_MINUTE, elapsedMinutes);
  state.clockMinutes = minutesFromClock(stepped.clock);
  const afterCal = calendarFromClock(stepped.clock);
  // (3) Age the party only on a true year-slot roll-over. Per ovr021 the aging event fires solely
  // when NormalizeClock's year byte overflows its radix-256 (one age++ per `yearRollovers`), which
  // is effectively never in normal play — NOT on every calendar-year tick. Stay binary-faithful.
  if (stepped.yearRollovers > 0) agePartyYears(stepped.yearRollovers);
  // (4) Drain the spell-learn queues (level×3 rest ticks each) and report any newly memorized spells.
  const learnedMsgs = advancePartySpellLearning(ticksNeeded);
  renderMoons();
  refreshPartyHud();
  for (const m of learnedMsgs) pushMessage(m);
  const span = formatDuration(elapsedMinutes);
  const dateStr = `Day ${afterCal.day + 1} of Month ${afterCal.month + 1}, Year ${afterCal.year}`;
  setStatus(
    `Rested ${span} — ${healed.totalHealed} HP recovered. It is now ${formatGameTime(state.clockMinutes)} (${dateStr}).`,
  );
  pushMessage(
    `You make camp and rest ${span}. The party recovers ${healed.totalHealed} HP. It is now ${dateStr}, ${formatGameTime(state.clockMinutes)}.`,
  );
}

/** Pick a sensible spawn: the cell with the most open edges, facing an open side. */
function chooseStart(map: GameMap): Pose {
  const dirs: Direction[] = ['north', 'east', 'south', 'west'];
  let best: Pose | null = null;
  let bestOpen = -1;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const cell = map.cells[y * map.width + x];
      const open = dirs.filter((d) => cell.walls[d] === 0);
      if (open.length > bestOpen) {
        bestOpen = open.length;
        best = { x, y, facing: open[0] ?? 'north' };
      }
    }
  }
  return best ?? { x: 0, y: 0, facing: 'north' };
}

/** Current party pose as an engine `WallPose` (numeric facing + the active ECL block id). */
function wallPose(pose: Pose) {
  return { px: pose.x, py: pose.y, facing: FACING_NUM[pose.facing], eclBlockId: activeGame.eclInitBlock };
}

/** Party rows for the compositor's right panel — the created party, else the demo four. */
function compositorParty(): ExploreParty[] {
  const members = partyStatus();
  if (members.length > 0) {
    return members.map((m) => ({
      name: m.name,
      ac: m.ac,
      hp: m.dead ? 'DEAD' : m.down ? 'DOWN' : `${m.hp}`,
    }));
  }
  return DEMO_PARTY.map((p) => ({ name: p.name, ac: p.baseAc, hp: `${p.hp}` }));
}

/**
 * The three moons (block-202 phase discs) for the current day, in MOON_COLUMNS order
 * [Lunitari(red), Solinari(white), Nuitari(black)] — what the compositor overlays on the top row.
 */
function compositorMoons(): (IndexedImage | null)[] {
  const tiles = state?.moonTiles;
  if (!tiles) return [];
  const byRobe = new Map<MoonReading['robe'], MoonReading>();
  for (const m of moonPhasesForDay(gameDay())) byRobe.set(m.robe, m);
  const order: MoonReading['robe'][] = ['red', 'white', 'black'];
  return order.map((robe) => {
    const m = byRobe.get(robe);
    if (!m) return null;
    return tiles[MOON_TILE_BASE[robe] + (MOON_PHASE_TILE[m.phase] ?? 0)] ?? null;
  });
}

/**
 * The first-person viewport WITH the per-area sky backdrop + time-of-day body (ovr028-030),
 * resolved through `state.wallGraphics`'s active `GraphicSetManager` when a live Amiga wall
 * source is loaded (M9.S3), falling back to `state.walls` directly otherwise.
 */
function computeViewport(): ReturnType<typeof renderFirstPersonViewWithSky> | null {
  if (!state) return null;
  const pose = state.explorer.getPose();
  const cell = state.map.cells[pose.y * state.map.width + pose.x]!;
  const hour = Math.floor((state.clockMinutes % 1440) / 60);
  const walls = baseGameForExplore(activeGame.id) === 'cok' && readRuntimeGraphicsMode(activeGame.id) === 'Restyle'
    ? state.walls : state.wallGraphics?.lookup ?? state.walls;
  return renderFirstPersonViewWithSky(state.map, wallPose(pose), walls, {
    area: AREA_SKY,
    roofByte: roofByteOf(cell),
    hour,
    facing: FACING_NUM[pose.facing] as SkyFacing,
    floorIndex: 8,
  });
}

/** e2e seam helper (M9.S3): a stable checksum of the viewport actually drawn on screen right now. */
function wallViewportChecksum(): number {
  const fb = computeViewport();
  if (!fb) return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < fb.indices.length; i++) {
    h = (h ^ fb.indices[i]) >>> 0;
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Scan every pose in the current map's first-person viewport without changing game state.
 *
 * Later Gen1's decoded VGA wall banks own palette indices 32..143; the older EGA titles must
 * never emit an indexed wall pixel outside 0..15.  This is deliberately a renderer invariant,
 * not a screenshot golden: it catches a wrong bank/index relocation or an omitted resident
 * palette before the browser can turn it into plausibly-coloured but unrelated art.
 */
function viewportPaletteIndexSummary(): { vgaWindowPixels: number; outOfWindowPixels: number } {
  if (!state) return { vgaWindowPixels: 0, outOfWindowPixels: 0 };
  let vgaWindowPixels = 0;
  let outOfWindowPixels = 0;
  for (let y = 0; y < state.map.height; y++) {
    for (let x = 0; x < state.map.width; x++) {
      for (const facing of ['north', 'east', 'south', 'west'] as const) {
        const cell = state.map.cells[y * state.map.width + x]!;
        const hour = Math.floor((state.clockMinutes % 1440) / 60);
        const viewport = renderFirstPersonViewWithSky(state.map, wallPose({ x, y, facing }), state.wallGraphics?.lookup ?? state.walls, {
          area: AREA_SKY,
          roofByte: roofByteOf(cell),
          hour,
          facing: FACING_NUM[facing] as SkyFacing,
          floorIndex: 8,
        });
        for (const index of viewport.indices) {
          if (index >= 32 && index <= 143) vgaWindowPixels++;
          else if (index > 15) outOfWindowPixels++;
        }
      }
    }
  }
  return { vgaWindowPixels, outOfWindowPixels };
}

/**
 * Repaint the emulated DOS screen. The engine composes the WHOLE 320×200 EGA exploration
 * screen — first-person viewport, decorative frame, moons, party panel, position line, message
 * window and prompt — into a single indexed framebuffer (`composeExploreScreen`); the surface
 * resolves it through the active screen palette and scales it to the canvas with the correct 4:3 aspect.
 * This is the real original interface, not a CSS rebuild.
 */
/**
 * Assemble the DAC state for the resources actually resident in this explorer view.
 *
 * CoK/DoK's 4-bit tiles leave this as the ordinary EGA palette.  Treasures and Pools instead
 * store their wall tiles as direct 8-bit images with a palette range beginning at index 32.  The
 * viewport is still composed as one indexed framebuffer, so painting it through EGA afterwards
 * silently turns those indices black/wrong.  Merge only palettes supplied by assets on this
 * screen; `mergePalettes` preserves the fixed EGA UI entries where no later-title asset owns a
 * colour slot.
 */
function activeExplorePalette(): Palette {
  if (!state) return EGA_PALETTE;
  return mergePalettes(
    EGA_PALETTE,
    ...state.walls.tileSets.map((set) => set?.palette),
    state.walls.singleBank?.palette,
    ...state.walls.combinedBanks.map((set) => set?.palette),
    ...(state.frameTiles ?? []).map((tile) => tile.palette),
    ...(state.moonTiles ?? []).map((tile) => tile.palette),
  );
}

function drawScreen(): void {
  if (!state) return;
  const pose = state.explorer.getPose();
  const viewport = computeViewport()!;
  const message = state.messages.slice(-6).join('\n');
  const menu =
    state.menuMode === 'encamp'
      ? { items: GB_MENU_ENCAMP, selected: state.encampSel }
      : { items: GB_MENU_DUNGEON, selected: -1 }; // dungeon bar: hotkey-driven, no cursor
  const screenInput = {
    frameTiles: state.frameTiles,
    frameLayout: state.frameLayout,
    font: state.font,
    moons: compositorMoons(),
    viewport,
    party: compositorParty(),
    position:
      state.menuMode === 'encamp'
        ? `CAMP  ${formatGameTime(state.clockMinutes)}  M${calendarFromClock(clockFromMinutes(state.clockMinutes)).month + 1}/Y${calendarFromClock(clockFromMinutes(state.clockMinutes)).year}`
        : `${pose.x},${pose.y} ${pose.facing}  ${formatTimeOfDay(state.clockMinutes)}`,
    message,
    menu,
  };
  const fb = composeExploreScreen(screenInput);
  state.wallRestyleVisibleTiles = [];
  state.wallRestyleVisiblePixels = 0;
  state.wallRestyleVisiblePixelsByIdentity = {};
  if (baseGameForExplore(activeGame.id) === 'cok' && readRuntimeGraphicsMode(activeGame.id) === 'Restyle'
      && state.wallRestyles?.art.size) {
    // Sentinel viewport leaves an exact mask of later chrome, decorations and text. Replay
    // actual individual wall blits in order, preserving every later foreground pixel.
    const mask = composeExploreScreen({ ...screenInput,
      viewport: { width: 168, height: 168, indices: new Uint8Array(168 * 168).fill(255) } });
    const replay = cokWallRestyleLayers(state.map, wallPose(pose), state.walls, state.wallRestyles, mask);
    state.wallRestyleVisibleTiles = replay.tileIdentities;
    state.wallRestyleVisiblePixels = replay.visibleRestylePixels;
    state.wallRestyleVisiblePixelsByIdentity = replay.visibleRestylePixelsByIdentity;
    if (replay.layers.length) {
      state.surface.setProfile({ ...DOS_EGA, nativeWidth: 2560, nativeHeight: 1600 });
      state.surface.paintRgba(composeRgbaArt(fb, activeExplorePalette(), replay.layers, 8));
      return;
    }
  }
  if (state.surface.profile().nativeWidth !== 320) state.surface.setProfile(DOS_EGA);
  state.surface.paint(fb, activeExplorePalette());
}

/** Activate a verb on the dungeon command bar (Area/Cast/View/Encamp/Search/Look). */
function activateDungeon(verb: string): void {
  if (!state) return;
  switch (verb) {
    case 'Encamp':
      state.menuMode = 'encamp';
      state.encampSel = 0;
      pushMessage('You make camp.');
      break;
    case 'Area':
      pushMessage(`Area: ${state.map.name}. (See the automap below.)`);
      break;
    case 'Search': {
      // Careful/search movement (ovr021): each step now costs 10 game-minutes instead of 1.
      const on = !state.explorer.isCareful();
      state.explorer.setCareful(on);
      pushMessage(on
        ? 'You move carefully, searching as you go. Steps now take 10 minutes.'
        : 'You move normally again.');
      setStatus(on
        ? 'Careful/search movement ON (10 min/step).'
        : 'Normal movement.');
      break;
    }
    case 'Look': {
      const pose = state.explorer.getPose();
      const cell = state.map.cells[pose.y * state.map.width + pose.x];
      const open = (['north', 'east', 'south', 'west'] as const).filter((d) => cell.walls[d] === 0);
      pushMessage(`You look around. Passages: ${open.length ? open.join(', ') : 'none'}.`);
      break;
    }
    case 'Cast':
      pushMessage('No spells are memorized. (Encamp → Magic to prepare spells.)');
      break;
    case 'View':
      viewCharacters();
      break;
  }
  draw();
}

/** Open the character-sheet ("View") screen for the party, or note there is none to show. */
function viewCharacters(): void {
  if (!state) return;
  const opened = openCharSheet({ frameTiles: state.frameTiles, frameLayout: state.frameLayout, font: state.font,
    graphicsGameId: activeGame.id });
  if (opened) {
    pushMessage('You review the party.');
  } else {
    pushMessage('No characters to view — create a party with “✦ Create party (CoK)”.');
    setStatus('No created party to view — make one with “✦ Create party (CoK)”.');
  }
}

/** Open the spell-memorization screen (Encamp → Magic), or note there is no caster. */
function memorizeSpells(): void {
  if (!state) return;
  const opened = openMemorize({ frameTiles: state.frameTiles, frameLayout: state.frameLayout, font: state.font, day: gameDay() });
  if (opened) {
    pushMessage('You study your spellbook to memorize spells.');
  } else {
    pushMessage('No spellcaster in the party to memorize spells.');
    setStatus('No spellcaster to memorize spells — create a mage or cleric.');
  }
}

/** The party's current world position as a save-able {@link SavePosition}. */
function currentPosition(): SavePosition | null {
  if (!state) return null;
  const p = state.explorer.getPose();
  return {
    area: state.map.name,
    x: p.x,
    y: p.y,
    facing: p.facing,
    ...(state.currentArea ? { disk: state.currentArea.disk, areaId: state.currentArea.areaId } : {}),
  };
}

/**
 * Write the campaign to the quick-save slot (Encamp → Save): the party + all its stores + the
 * journal, plus the party's position, the game clock, and quest flags. Reports into the message
 * window. The serialization is the engine `SaveGame`; the bridge bundles the localStorage stores.
 */
function quickSave(): void {
  // The tactical overlay is modal. This guard covers direct companion/test-seam calls as well as
  // keyboard input, preventing a half-resolved ECL combat from being serialized underneath it.
  if (!state || isCombatOpen() || combatLaunchPending || campaignRemountPending > 0) return;
  const name = `${state.map.name} — ${formatGameTime(state.clockMinutes)}`;
  saveToSlot(QUICK_SLOT, {
    name,
    position: currentPosition(),
    clockMinutes: state.clockMinutes,
    savedAt: state.clockMinutes,
    areaMemory: {
      // ADR-0009: a cross-archive session's departed-area snapshot(s) merge in alongside the live
      // current-area bucket, keyed distinctly (see ExploreState.priorAreaMemory) — empty/absent for
      // every single-archive route, so this is a no-op there.
      ...(state.priorAreaMemory ?? {}),
      [state.map.name]: Object.fromEntries(
        [...state.areaMemory].map(([address, value]) => [String(address & 0xffff), value]),
      ),
    },
  });
  pushMessage(`Game saved: ${name}.`); // M46.S1 — was the generic 'Game saved.'
}

/**
 * Restore the quick-save slot into the live game: the stores are re-read into their caches, the
 * party HUD refreshes, the clock is set, and the explorer is teleported to the saved cell (when the
 * save was made in this same area). Returns true on a successful load.
 */
function quickLoad(): boolean {
  if (!state) return false;
  const restored = loadSlot(QUICK_SLOT);
  if (!restored) {
    pushMessage('No saved game to load.');
    draw();
    return false;
  }
  state.clockMinutes = restored.clockMinutes;
  const pos = restored.position;
  const baseId = baseGameForExplore(activeGame.id);
  if (
    pos && baseId && pos.disk !== undefined && pos.areaId !== undefined &&
    (state.currentArea?.disk !== pos.disk || state.currentArea?.areaId !== pos.areaId)
  ) {
    const disk = GEN1_BASE_GAMES[baseId].disks.find((candidate) => candidate.disk === pos.disk);
    if (!disk) {
      pushMessage(`Saved area ECL${pos.disk}#${pos.areaId} is not available in this installation.`);
      draw();
      return false;
    }
    pushMessage(`Loading ${restored.name}…`);
    draw();
    const restoredMemory = memoryMap(restored.areaMemory[pos.area]);
    void switchGen1Area(baseId, disk, pos.areaId, {
      areaMemory: restored.areaMemory,
      // A chained mount may label the same GEO differently from the disk registry loader. Carry
      // the saved current-area bucket explicitly so restoration does not depend on those display
      // labels matching byte-for-byte (Secret's ECL1#34 -> #32 route exposed this distinction).
      // Use one clone for target initial_entry resource selection, then mount the untouched saved
      // snapshot itself; replayed initialization must not silently mutate restored quest state.
      carriedMemory: new Map(restoredMemory),
      restoredMemory,
      restoredAreaName: pos.area,
      clockMinutes: restored.clockMinutes,
      pose: { x: pos.x, y: pos.y, facing: pos.facing },
      loadedSaveName: restored.name,
    });
    return true;
  }
  if (pos && pos.area === state.map.name) {
    try { state.explorer.setPose({ x: pos.x, y: pos.y, facing: pos.facing }); } catch { /* stale coords */ }
    if (restored.areaMemory[pos.area]) state.areaMemory = memoryMap(restored.areaMemory[pos.area]);
  } else if (pos) {
    pushMessage(`Saved location ${pos.area} could not be placed here; the party and clock were restored.`);
  }
  state.lastCell = -1; // re-fire the step event for the restored cell
  refreshPartyHud();
  renderMoons();
  pushMessage(`Game loaded: ${restored.name}.`); // M46.S1 — was the generic 'Game loaded.'
  draw();
  return true;
}

/** Activate a verb on the Encamp sub-menu (Save/View/Magic/Rest/Alter/Fix/Exit). */
function activateEncamp(verb: string): void {
  if (!state) return;
  switch (verb) {
    case 'Exit':
      state.menuMode = 'dungeon';
      pushMessage('You break camp and move on.');
      draw();
      break;
    case 'Rest':
      restAndRefresh(); // heals, advances the day + moons
      draw();
      break;
    case 'Fix':
      pushMessage('The party tends its wounds.');
      draw();
      break;
    case 'Save':
      quickSave();
      draw();
      break;
    case 'Magic':
      memorizeSpells();
      draw();
      break;
    case 'View':
      viewCharacters();
      draw();
      break;
    case 'Alter':
      pushMessage('Alter party order (coming soon).');
      draw();
      break;
  }
}

/** Move the Encamp cursor by delta (wrapping) and repaint. */
function moveEncampCursor(delta: number): void {
  if (!state) return;
  const n = GB_MENU_ENCAMP.length;
  state.encampSel = ((state.encampSel + delta) % n + n) % n;
  draw();
}

/** Press a verb's hotkey letter in the active menu; returns true if it matched. */
function pressMenuHotkey(key: string): boolean {
  if (!state) return false;
  const k = key.toUpperCase();
  if (state.menuMode === 'encamp') {
    const idx = GB_MENU_ENCAMP.findIndex((v) => menuHotkey(v) === k);
    if (idx < 0) return false;
    state.encampSel = idx;
    activateEncamp(GB_MENU_ENCAMP[idx]!);
    return true;
  }
  const idx = GB_MENU_DUNGEON.findIndex((v) => menuHotkey(v) === k);
  if (idx < 0) return false;
  activateDungeon(GB_MENU_DUNGEON[idx]!);
  return true;
}

function draw(): void {
  if (!state) return;
  const { map, explorer, automap, automapSurface } = state;
  const pose = explorer.getPose();
  const cellIndex = pose.y * map.width + pose.x;
  // M10.S1 — feed the D1 Automap model from real walking (not click-reveal); write through on
  // every visit so a reload never loses ground already covered, matching automapPanel.ts's tactic.
  if (automap.visit(pose.x, pose.y)) persistAutomapModel(activeGame.id, automap);
  // Fire the area's step-event script once per cell-enter (not on turns).
  if (cellIndex !== state.lastCell) {
    state.lastCell = cellIndex;
    // Cell-derived seed → an encounter on a given cell always plays out the same way.
    state.lastEvent = runStepEvent(map.cells[cellIndex].floor ?? 0, 0x1000 + cellIndex);
    if (state.lastEvent) pushMessage(state.lastEvent);
  }

  // M10.S1 — the fog-of-war automap panel (walls/doors/notes on visited cells + party marker),
  // replacing the old ad-hoc edge-drawing canvas. No border/font here: this is the compact
  // in-play widget, not the full-screen `?automap=1` page — `composeAutomapPanel` degrades
  // gracefully to just the grid when `frameTiles`/`font` are omitted.
  const amFb = composeAutomapPanel({ map, automap, pose: { x: pose.x, y: pose.y, facing: pose.facing } });
  automapSurface.paint(amFb, EGA_PALETTE);
  drawScreen();

  const evText = state.lastEvent.length > 90 ? state.lastEvent.slice(0, 89) + '…' : state.lastEvent;
  // M72.S1 — StepResult.blocked (Explorer.step()) tells the player WHY a move attempt failed; the
  // 'edge' case in particular had no fallback signal at all (the automap draws no wall line and the
  // 3-D view has no boundary graphic when the destination is simply outside the map's decoded bounds).
  const blockedText = state.lastBlocked === 'wall' ? ' · A wall blocks your way.'
    : state.lastBlocked === 'edge' ? ' · You can go no further this way.' : '';
  setStatus(
    `Exploring ${map.name} — (${pose.x},${pose.y}) facing ${pose.facing}` +
      (evText ? ` · ${evText}` : '') + blockedText +
      ` · ↑ forward ↓ back ← → turn`,
  );
}

type MoveAction = 'forward' | 'back' | 'left' | 'right';

function applyMove(action: MoveAction): Pose {
  if (!state) return { x: 0, y: 0, facing: 'north' };
  // The combat overlay owns input while it is present, and a just-resumed ECL chain may still be
  // loading the next overlay.  In either state the original movement command must not advance the
  // dungeon underneath a pending battle.
  if (isCombatOpen() || combatLaunchPending || campaignRemountPending > 0) return state.explorer.getPose();
  if (blockFallenPartyInput()) return state.explorer.getPose();
  const ex = state.explorer;
  let res: StepResult | null = null;
  let attemptedDirection: Direction | null = null;
  // M72.S1 — cleared unconditionally so a turn (which never sets `res`) doesn't leave a stale
  // "blocked" message from a previous facing on screen.
  state.lastBlocked = undefined;
  switch (action) {
    case 'forward': {
      // Open a closed door on the leaving edge before stepping (ovr015 persists doorsOpen on the cell).
      const dir = ex.getPose().facing;
      attemptedDirection = dir;
      if ((ex.currentCell().doors?.[dir] ?? 0) !== 0 && !ex.isDoorOpen(dir)) ex.openDoor(dir);
      res = ex.forward();
      break;
    }
    case 'back': {
      const dir = OPPOSITE_DIR[ex.getPose().facing];
      attemptedDirection = dir;
      if ((ex.currentCell().doors?.[dir] ?? 0) !== 0 && !ex.isDoorOpen(dir)) ex.openDoor(dir);
      res = ex.backward();
      break;
    }
    case 'left': ex.turnLeft(); break;
    case 'right': ex.turnRight(); break;
  }
  if (res?.moved) {
    // Advance the game clock by the step cost (1 normal / 10 careful) and walk the moons on rollover.
    const prevDay = gameDay();
    state.clockMinutes += res.timeMinutes;
    if (gameDay() !== prevDay) renderMoons();
    stepDispatcher?.playEvent('step');
    stepCount++;
  } else if (res?.blocked) {
    // M72.S1 — surface *why* the step failed (StepResult.blocked was computed but discarded before now).
    state.lastBlocked = res.blocked;
    // BUILD-QUEUE.md's map-edge live-crossing leaf: a real walked-to-the-boundary step that
    // declares an edgeExit (see `markMapEdgeExits`) drives the live ECL dispatch instead of just
    // sitting as a bump — fire-and-forget so `applyMove` keeps its existing synchronous contract
    // (`window.__explore.move()` callers already poll `window.__dialogue`/`areaMemory()` for the
    // async result, the same pattern `onChain`'s own `remountChainedArea` call already uses here).
    const coabVillageWallExit = res.blocked === 'wall' && attemptedDirection !== null &&
      activeGame.id === 'coab-natural-3' && state.currentArea?.disk === 5 && state.currentArea.areaId === 49
      ? ex.currentCell().edgeExits?.[attemptedDirection]
      : undefined;
    // CoAB runs ECL5#49's vm_run_1 boundary check before its ordinary collision response. The
    // descriptor-3 west exits have a visible solid wall in GEO5#50, so the engine-neutral Explorer
    // correctly reports `wall`; this one block-scoped host ordering still needs to dispatch the
    // declared perimeter exit. Every other map keeps the standard edge-only trigger contract.
    const declaredExit = res.edgeExit ?? coabVillageWallExit;
    if (declaredExit && (res.blocked === 'edge' || coabVillageWallExit)) void triggerEdgeExit(declaredExit);
  }
  draw();
  return ex.getPose();
}

/** Flip the active wall-art set (DOS-EGA <-> Amiga); no-op if this dungeon has no Amiga source. */
function toggleGraphicsMode(): void {
  if (!state?.wallGraphics) return;
  const { manager } = state.wallGraphics;
  manager.setActive(manager.active === 'DOS-EGA' ? 'Amiga' : 'DOS-EGA');
}

/**
 * M10.S2 — open the in-play Companion panel host (Automap/Party/Databases) as a read-only
 * overlay over the live session. The source is built fresh from `state` every time this is
 * called, so whatever the party/automap/bestiary look like right now is exactly what the panels
 * show — no separate re-fetch, no snapshot staleness.
 */
function openCompanion(tab?: CompanionTab): void {
  if (!state) return;
  const pose = state.explorer.getPose();
  openCompanionPanel({
    source: {
      frameTiles: state.frameTiles,
      frameLayout: state.frameLayout,
      font: state.font,
      map: state.map,
      automap: state.automap,
      pose: { x: pose.x, y: pose.y, facing: pose.facing },
      monsters: state.monRecords,
      items: state.itemDb,
    },
    initialTab: tab,
    onClose: () => setStatus('You close the companion panel.'),
    presentationGameId: activeGame.id,
  });
}

function onKey(e: KeyboardEvent): void {
  // The handler is bound to `window` (so keys keep working after the encounter panel's
  // Continue button takes focus). Ignore keys unless the explore view is actually mounted,
  // otherwise the party would still move while another view is on screen.
  if (!state || !document.body.contains(state.automapSurface.canvas)) return;
  // The character-sheet / magic / combat / companion overlays handle their own keys (capture phase); don't walk.
  if (isSheetOpen() || isMagicOpen() || isCombatOpen() || isCompanionOpen() || isCokTravelOpen() || isDokTravelOpen()) return;
  // A fallen CoK party: no walking, encounters or camp commands behind the boundary or a dialogue.
  if (blockFallenPartyInput()) return;
  // ── Encamp sub-menu is modal: arrows move the cursor, Enter/hotkey select; no walking. ──
  if (state.menuMode === 'encamp') {
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); moveEncampCursor(-1); return;
      case 'ArrowRight': e.preventDefault(); moveEncampCursor(1); return;
      case 'Enter': case ' ':
        e.preventDefault();
        activateEncamp(GB_MENU_ENCAMP[state.encampSel]!);
        return;
      default:
        if (e.key.length === 1 && pressMenuHotkey(e.key)) e.preventDefault();
        return;
    }
  }

  // ── Dungeon: arrows walk/turn the party; command letters fire the bar (A/C/V/E/S/L). ──
  if (e.key === 'r' || e.key === 'R') {
    e.preventDefault();
    restAndRefresh(); // quick-rest convenience (equivalent to Encamp → Rest)
    return;
  }
  if (e.key === 'g' || e.key === 'G') {
    e.preventDefault();
    toggleGraphicsMode(); // M9.S3 — companion key for the EGA/Amiga wall-art switch
    return;
  }
  if (e.key === 'm' || e.key === 'M') {
    e.preventDefault();
    openCompanion(); // M10.S2 — Automap/Party/Databases overlay host (free letter: not in either command bar)
    return;
  }
  const map: Record<string, MoveAction> = {
    ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right',
  };
  const action = map[e.key];
  if (action) {
    e.preventDefault();
    applyMove(action);
    return;
  }
  if (e.key.length === 1 && pressMenuHotkey(e.key)) e.preventDefault();
}

/**
 * The display/scaler control bar shown under the emulated screen. It exposes the two knobs the
 * user asked for — aspect-ratio correction and scaling mode — operating on the live ScreenSurface:
 *
 *   • Aspect: 4:3 (the CRT shape the game was drawn for — circles round) vs square pixels (1:1,
 *     the naive look). Same native buffer, different display aspect, so the picture stays put.
 *   • Scaling: smooth (fills the box) vs integer (whole-pixel multiples — sharpest, may letterbox).
 *
 * A readout reports the native resolution, the active aspect, and the current scale factor so the
 * effect is legible. Returns the bar element + an `update()` to refresh the readout on resize.
 *
 * CoK routes share one persisted scale preference (integer by default, fit optional); the choice is
 * written through `writePresentationScale`, so every live CoK surface follows it. Other games keep
 * their original fit (smooth) default, held in this bar only.
 */
function buildScalerBar(surface: ScreenSurface, gameId: string): { bar: HTMLElement; update: () => void } {
  const sharedScale = followsCokPresentation(gameId);
  let aspectCorrect = true; // 4:3 by default — the original CRT aspect
  let integerScale = sharedScale ? readPresentationScale(gameId) === 'integer' : false;

  const bar = el('div', 'gb-scaler');
  const readout = el('div', 'gb-scaler-readout');

  // One segmented toggle. `select(true)` picks option A, `false` picks B; it sets the button
  // highlight, runs the side-effect, and refreshes the readout — so the buttons AND the e2e seam
  // share one code path (no drift between a programmatic toggle and a click).
  const mkToggle = (
    label: string,
    aText: string,
    bText: string,
    apply: (a: boolean) => void,
    initialA = true,
  ): (a: boolean) => void => {
    const group = el('div', 'gb-scaler-group');
    group.appendChild(el('span', 'gb-scaler-label', label));
    const btnA = el('button', initialA ? 'gb-seg active' : 'gb-seg', aText) as HTMLButtonElement;
    const btnB = el('button', initialA ? 'gb-seg' : 'gb-seg active', bText) as HTMLButtonElement;
    btnA.type = 'button';
    btnB.type = 'button';
    const select = (a: boolean): void => {
      btnA.classList.toggle('active', a);
      btnB.classList.toggle('active', !a);
      apply(a);
      update();
    };
    btnA.addEventListener('click', () => select(true));
    btnB.addEventListener('click', () => select(false));
    group.appendChild(btnA);
    group.appendChild(btnB);
    bar.appendChild(group);
    return select;
  };

  const selectAspect = mkToggle('Aspect', '4:3 (CRT)', 'Square px', (a) => {
    aspectCorrect = a;
    surface.setProfile(a ? DOS_EGA : DOS_SQUARE);
  });
  // Option A is Integer for CoK (its default) and Smooth elsewhere (the original order). The
  // initial highlight follows the current choice, so a stored Fit shows as selected.
  const selectSmooth = mkToggle('Scaling', sharedScale ? 'Integer' : 'Smooth', sharedScale ? 'Fit' : 'Integer', (a) => {
    integerScale = sharedScale ? a : !a;
    if (sharedScale) writePresentationScale(gameId, a ? 'integer' : 'fit');
    surface.setFitOptions(integerScale ? { integer: true } : {});
  }, integerScale === sharedScale);
  bar.appendChild(readout);

  function update(): void {
    const p = surface.profile();
    const r = surface.rect();
    const aspect = aspectCorrect ? '4:3' : '1:1';
    const scale = r ? `×${(r.height / p.nativeHeight).toFixed(2)}` : '—';
    const size = r ? `${Math.round(r.width)}×${Math.round(r.height)}` : '—';
    const fitNote = r && integerScale && !r.integer ? ' · fit (container too small for whole rows)' : '';
    readout.textContent = `${p.nativeWidth}×${p.nativeHeight} native → ${size} (${aspect}, ${scale}${fitNote})`;
  }

  // The surface repaints itself on resize; keep this readout on the same rectangle.
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
    if (!surface.canvas.isConnected) { resizeObserver?.disconnect(); return; }
    update();
  }) : null;
  resizeObserver?.observe(surface.canvas);
  // Release the observer with the surface. Chain the existing dispose (already wrapped by
  // followPresentationScale, which runs first) so its window-listener cleanup still happens.
  const disposeSurface = surface.dispose.bind(surface);
  surface.dispose = (): void => { resizeObserver?.disconnect(); disposeSurface(); };

  // Expose the scaler state for headless e2e (assert the aspect toggle actually changes geometry).
  // The setters go through the same select() the buttons use, so the UI stays in sync.
  (window as unknown as { __scaler?: Record<string, unknown> }).__scaler = {
    aspectCorrect: () => aspectCorrect,
    integerScale: () => integerScale,
    setAspectCorrect: (v: boolean) => selectAspect(v),
    // CoK orders the toggle Integer|Fit (option A = integer), other games Smooth|Integer (B = integer).
    setIntegerScale: (v: boolean) => selectSmooth(sharedScale ? v : !v),
    rect: () => surface.rect(),
    profileId: () => surface.profile().id,
  };

  return { bar, update };
}

/**
 * M9.S5 — persist the active graphics mode per game across reloads, mirroring
 * `automapPanel.ts`'s `restore()`/`persist()` tactic: a plain `localStorage` string keyed
 * `greybox.graphics.<game>`, try/catch around both read and write (corrupt/unavailable store or
 * quota exceeded → silently fall back to the default, never throws).
 */
/**
 * The combat screen's half of the live EGA<->Amiga switch.
 *
 * The dungeon-wall toggle has been wired since M9.S3; combat backdrops were not, because the Amiga
 * `*COM` strip format was unsolved until 2026-08-22 and `combatBackdropFrom` discarded every `.DAA`
 * result. Both are fixed, so the explorer now hands its current graphics-set choice to
 * `launchCombat`, and a title without a measured Amiga bank simply declares none and stays on DOS.
 *
 * CoK carries the requested preference even when its dungeon walls use a DOS fallback. Other
 * titles retain the active wall manager's choice, using storage when no manager is mounted.
 */
function combatBackdropPaths(gd: GameData): CombatAssetPaths {
  const selected = readRuntimeGraphicsMode(gd.id);
  const isCok = baseGameForExplore(gd.id) === 'cok';
  const mode = selected === 'Restyle' ? readRuntimeGraphicsFallback(gd.id)
    : isCok ? selected : state?.wallGraphics?.manager.active ?? restoreGraphicsMode(gd.id);
  const activeDisk = state?.currentArea?.disk || diskNumberFromPath(gd.geoPath);
  const cpicPath = baseGameForExplore(gd.id) === 'cok' ? COK_CPIC_PATHS[activeDisk] : undefined;
  return {
    ...(cpicPath ? { iconPath: cpicPath } : {}),
    readAsset: readAssetBytes,
    ...(gd.amigaDungcomPath ? { amigaDungcomPath: gd.amigaDungcomPath } : {}),
    ...(gd.amigaRandcomPath ? { amigaRandcomPath: gd.amigaRandcomPath } : {}),
    ...(mode ? { graphicsMode: mode } : {}),
    runtimeGameId: gd.id,
    ...(isCok ? { restyleMode: selected === 'Restyle' } : {}),
  };
}

function persistGraphicsMode(gameId: GameId, mode: GraphicSetId | 'Restyle'): void {
  writeRuntimeGraphicsMode(gameId, mode);
}

function restoreGraphicsMode(gameId: GameId): GraphicSetId | null {
  const mode = readRuntimeGraphicsMode(gameId);
  return mode === 'Restyle' ? readRuntimeGraphicsFallback(gameId) : mode;
}

/**
 * M10.S1 — the SAME store key format `apps/web/src/ui/automapPanel.ts` (the standalone
 * `?automap=1` route) hardcodes for CoK (`greybox.automap.cok`), generalised per-game so the
 * in-play widget and the standalone page share one persisted Automap for a given game.
 */
function automapStoreKey(gameId: GameId): string {
  return `greybox.automap.${gameId}`;
}

function persistAutomapModel(gameId: GameId, automap: Automap): void {
  try {
    localStorage.setItem(automapStoreKey(gameId), JSON.stringify(automap.toJSON()));
  } catch { /* quota exceeded or unavailable — non-fatal */ }
}

/** Restore the persisted automap for this map's dimensions (or a fresh one), mirroring
 * `automapPanel.ts`'s `restoreAutomap`. Dimension mismatch (a different area) starts fresh. */
function restoreAutomapModel(gameId: GameId, map: GameMap): Automap {
  try {
    const raw = localStorage.getItem(automapStoreKey(gameId));
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.width === map.width && data.height === map.height) {
        return Automap.fromJSON(data, map.width, map.height);
      }
    }
  } catch { /* corrupt store → fresh */ }
  return new Automap(map.width, map.height);
}

/**
 * M9.S5 — the honest provenance readout: "which set is ACTUALLY supplying the art right now",
 * per category, from `wallArtProvenance`. Never a blanket "Amiga" claim — a category that falls
 * back reports the fallback set by name, and true partial-within-a-category coverage reports
 * 'mixed'. On DOS-EGA this always reads "supplied by DOS-EGA" (nothing to fall back from); the
 * interesting case is Amiga active with >=1 real Amiga category AND >=1 DOS-EGA-fallback category
 * (DoK's real boot dungeon — see `dungeonWallsAmigaDok.test.ts`), versus CoK's real boot dungeon,
 * which is honestly all-Amiga with zero fallback (see `dungeonWallsAmiga.test.ts`) — the badge
 * must say so plainly rather than force a "mixed" narrative that isn't true for CoK.
 */
function describeProvenance(entries: WallArtCategoryProvenance[]): string {
  if (entries.length === 0) return '';
  const bySource = new Map<string, number>();
  for (const e of entries) {
    const key = e.source === null ? 'no source' : e.source === 'mixed' ? 'mixed' : e.source;
    bySource.set(key, (bySource.get(key) ?? 0) + 1);
  }
  if (bySource.size === 1) {
    const [only] = [...bySource.keys()];
    return `art: ${only} (full coverage, ${entries.length} categor${entries.length === 1 ? 'y' : 'ies'})`;
  }
  const parts = [...bySource.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([source, count]) => `${source} (${count})`);
  return `art: mixed — ${parts.join(', ')} of ${entries.length} categories`;
}

/**
 * M9.S3 — the in-game "Graphics: EGA / Amiga" control: a segmented toggle over the dungeon's
 * wall-art `GraphicSetManager`, matching {@link buildScalerBar}'s style. `setActive` is a pointer
 * swap (`graphicSet.ts`'s own contract) — the manager's `on('change', …)` subscription (wired at
 * the `state` assignment site) is what actually triggers the repaint, so clicking a button here
 * and calling the seam's `setGraphicsMode` go through the exact same path. M9.S5 adds the
 * persisted-choice write-through and the honest per-category provenance badge (both driven by the
 * SAME `refresh()`, so every path that changes `manager.active` keeps all three in sync).
 */
function buildGraphicsBar(gameId: GameId, wallGraphics: WallGraphics | null): HTMLElement {
  const manager = wallGraphics?.manager ?? null;
  const dosSet = wallGraphics?.dosSet ?? null;
  const bar = el('div', 'gb-scaler');
  const group = el('div', 'gb-scaler-group');
  group.appendChild(el('span', 'gb-scaler-label', 'Graphics'));
  const btnDos = el('button', 'gb-seg', 'DOS · EGA') as HTMLButtonElement;
  const btnAmiga = manager ? el('button', 'gb-seg', 'Amiga · 32-color') as HTMLButtonElement : null;
  const btnRestyle = baseGameForExplore(gameId) === 'cok'
    ? el('button', 'gb-seg', 'Restyle') as HTMLButtonElement
    : null;
  btnDos.type = 'button';
  if (btnAmiga) btnAmiga.type = 'button';
  if (btnRestyle) btnRestyle.type = 'button';
  const badge = el('span', 'gb-scaler-readout gb-graphics-provenance');
  const refresh = (): void => {
    const selected = readRuntimeGraphicsMode(gameId);
    btnDos.classList.toggle('active', selected === 'DOS-EGA');
    btnAmiga?.classList.toggle('active', selected === 'Amiga');
    btnRestyle?.classList.toggle('active', selected === 'Restyle');
    badge.textContent = selected === 'Restyle'
      ? 'DOS-EGA wall source; Restyle on exact-matched tiles'
      : manager && dosSet ? describeProvenance(wallArtProvenance(dosSet, manager)) : 'DOS-EGA graphics';
  };
  btnDos.addEventListener('click', () => { persistGraphicsMode(gameId, 'DOS-EGA'); });
  btnAmiga?.addEventListener('click', () => { persistGraphicsMode(gameId, 'Amiga'); });
  btnRestyle?.addEventListener('click', () => { persistGraphicsMode(gameId, 'Restyle'); refresh(); });
  refresh();
  group.appendChild(btnDos);
  if (btnAmiga) group.appendChild(btnAmiga);
  if (btnRestyle) group.appendChild(btnRestyle);
  bar.appendChild(group);
  bar.appendChild(badge);
  const isCok = baseGameForExplore(gameId) === 'cok';
  if (isCok) addLocalAssetPackPicker(bar, () => {});
  let syncing = false;
  manager?.on('change', () => {
    if (!syncing) persistGraphicsMode(gameId, manager.active);
    refresh();
  }); // external graphics-set switches must also become the selected runtime setting
  const syncRuntimeMode = (event: Event): void => {
    const detail = (event as CustomEvent<{ gameId?: string; mode?: string }>).detail;
    if (detail?.gameId !== runtimeGraphicsGameId(gameId)) return;
    if ((detail.mode === 'DOS-EGA' || detail.mode === 'Amiga') && manager?.available.includes(detail.mode)) {
      syncing = true;
      manager.setActive(detail.mode);
      syncing = false;
    }
    refresh();
    drawScreen(); // presentation-only: do not dispatch cell events, visits or progression.
    if (isCok) refreshPartyHud();
  };
  window.addEventListener('goldbox:graphics-mode', syncRuntimeMode);
  const syncLocalAssetPack = (): void => {
    if (!bar.isConnected) return;
    const current = state;
    if (isCok && current) refreshCokExploreWallArt(current, exploreMountSeq);
    if (isCok) { partyIconLoads.clear(); refreshPartyHud(); }
  };
  if (isCok) window.addEventListener('goldbox:local-asset-pack', syncLocalAssetPack);
  const rosterMount = exploreMountSeq;
  const cleanup = new MutationObserver(() => {
    if (!bar.isConnected) {
      if (isCok && rosterMount === exploreMountSeq) { ++partyRosterRevision; partyIconLoads.clear(); }
      window.removeEventListener('goldbox:graphics-mode', syncRuntimeMode);
      if (isCok) window.removeEventListener('goldbox:local-asset-pack', syncLocalAssetPack);
      cleanup.disconnect();
    }
  });
  cleanup.observe(document.body, { childList: true, subtree: true });
  return bar;
}

/** Reload only CoK wall presentation art; never remount the explorer or touch game state. */
function refreshCokExploreWallArt(current: ExploreState, mount = exploreMountSeq): void {
  const revision = ++current.wallRestyleRevision;
  const packRevision = localAssetPackRevision();
  current.wallRestyles = undefined;
  drawScreen();
  void loadCokWallRestyles(current.walls).then((loaded) => {
    if (state !== current || mount !== exploreMountSeq || revision !== current.wallRestyleRevision
        || packRevision !== localAssetPackRevision()) return;
    current.wallRestyles = loaded;
    drawScreen(); // optional-art completion is presentation-only; no movement/ECL event is emitted.
  }).catch(() => {
    if (state !== current || mount !== exploreMountSeq || revision !== current.wallRestyleRevision
        || packRevision !== localAssetPackRevision()) return;
    current.wallRestyles = { art: new Map(), errors: new Map() };
    drawScreen();
  });
}

/**
 * Read a game-data-relative path's bytes (M7.S1). When the current mount came from a
 * Library entry with its own `assetSource`, this reads THAT folder's file (by basename —
 * see `assetSource.ts`) instead of the bundled repo copy, so a game booted from the
 * Library plays the user's own install rather than always the checked-in fixture data. A
 * missing file in the picked folder is a hard error, not a silent fallback to the bundled
 * copy — mixing the two would produce a misleading, mismatched asset set.
 */
async function readAssetBytes(path: string): Promise<Uint8Array> {
  if (activeAssetSource) {
    const base = basenameOf(path);
    const bytes = await activeAssetSource.readAsset(base);
    if (!bytes) throw new Error(`${base}: not found in the selected folder`);
    return bytes;
  }
  const resp = await fetch(assetUrl(path));
  if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

/** Fetch a CoK DAX archive: return the raw archive bytes + its DATA blocks by id. */
async function fetchDaxRaw(path: string): Promise<{ bytes: Uint8Array; blocks: Map<number, Uint8Array> }> {
  const bytes = await readAssetBytes(path);
  const blocks = new Map(readDaxDataBlocks(bytes).map((b) => [b.blockId, b.raw]));
  await registerCokWallArchive(bytes, blocks, path);
  return { bytes, blocks };
}

/** Fetch a CoK DAX archive and index its DATA blocks by id → decompressed bytes. */
async function fetchDax(path: string): Promise<Map<number, Uint8Array>> {
  return (await fetchDaxRaw(path)).blocks;
}

/**
 * DoK has three ECL/GEO disks but five globally-addressed WALLDEF/8X8D banks.  The bank number
 * is not the ECL disk number (for example ECL1 area 32 uses WALLDEF/8X8D bank 4), and all five
 * banks have an evidenced collision-free block-id space.  Keep this resolver DoK-only: CoK has
 * genuinely conflicting ids across its disks and must remain disk-scoped.  See
 * `dok-wall-art-cross-disk.md`.
 */
async function loadDokWallBanks() {
  const banks = await Promise.all([1, 2, 3, 4, 5].map(async (bank) => {
    const [walldef, tiles] = await Promise.all([
      fetchDax(`Death Knights of Krynn/WALLDEF${bank}.DAX`),
      fetchDaxRaw(`Death Knights of Krynn/8X8D${bank}.DAX`),
    ]);
    return { bank, walldef, tiles };
  }));
  return {
    walldef: buildCrossDiskBlockSource(banks.map(({ bank, walldef }) => ({ diskNum: bank, blocks: walldef }))),
    tiles: buildCrossDiskBlockSource(banks.map(({ bank, tiles }) => ({ diskNum: bank, blocks: tiles.blocks }))),
    // The resident DoK UI always uses its first bank's font/frame archive, irrespective of the
    // ECL/GEO disk currently mounted.
    ui: banks[0]!.tiles,
  };
}

/**
 * Probe one retail coordinate against a COPY of the campaign memory to recover the script's own
 * location text for the host-side button label. The live memory is only passed to the runner after
 * the player actually selects the point.
 */
function previewCokTravelCoordinate(
  block16: Uint8Array,
  coordinate: CokTravelCoordinate,
  context: CampaignCarryContext,
): string {
  const runner = dialogueForCell(block16, 0, {
    memory: new Map(context.memory),
    dialect: ECL_GEN1,
    seedMemory: { 0x4bc3: coordinate.x, 0x4bc4: coordinate.y },
  });
  if (!runner) return '';
  const lines: string[] = [];
  let turn = runner.start();
  for (let guard = 0; guard < 8; guard++) {
    if (turn.text) lines.push(turn.text);
    if (turn.kind !== 'say' || (turn.awaiting === 'menu' && turn.choices.length >= 2)) break;
    turn = runner.choose(0);
  }
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  const near = /YOU ARE NEAR\s+(.+?)(?:\.|\?|$)/i.exec(text)?.[1]?.trim();
  return near ? near.replace(/\s+/g, ' ') : '';
}

/** Run the real ECL1#16 SearchLocation arm for a player-selected retail map coordinate. */
function chooseCokTravelCoordinate(
  block16: Uint8Array,
  coordinate: CokTravelCoordinate,
  context: CampaignCarryContext,
  spawn: (roster: readonly EncounterMonster[]) => DialogueCombat = dungeonSpawn,
): void {
  const carriedMemory = context.memory;
  const runner = dialogueForCell(block16, 0, {
    memory: carriedMemory,
    dialect: ECL_GEN1,
    seedMemory: { 0x4bc3: coordinate.x, 0x4bc4: coordinate.y },
  });
  if (!runner) return;
  closeCokTravel();
  const first = runner.start();
  if (first.kind === 'chain') {
    void remountCampaignChain(first.blockId, carriedMemory, context);
    return;
  }
  openDialogueAt(runner, first, {
    title: 'Champions of Krynn · Overland travel',
    spawn,
    onClose: () => state?.automapSurface.canvas.focus(),
    onChain: (blockId) => { void remountCampaignChain(blockId, carriedMemory, context); },
  });
}

/** Paint CoK's retail 304x120 overland frame with the native hollow 8x8 map cursor. */
function paintCokTravel(
  surface: ScreenSurface,
  picture: IndexedImage,
  amigaMap: IndexedImage | null,
  x: number,
  y: number,
  position: HTMLElement,
  restyle: RgbaArt | null = null,
): void {
  const fb = createFramebuffer(320, 200, 0);
  blitIndexed(fb, picture, 8 + picture.xOffset, 8 + picture.yOffset);
  paintCokTravelCursor(fb, x, y, 8 + picture.xOffset, 8 + picture.yOffset);
  if (restyle) surface.paintRgba(composeRgbaArt(fb, picture.palette ?? EGA_PALETTE,
    [{ art: restyle, x: 8, y: 8, pixelScale: 4 }, cokTravelCursorLayer(x, y)], 4));
  else if (amigaMap) surface.paintRgba(composeRgbaArt(fb, picture.palette ?? EGA_PALETTE,
    [{ art: { width: amigaMap.width, height: amigaMap.height,
      pixels: indexedToRGBA(amigaMap, amigaMap.palette ?? EGA_PALETTE) },
    x: 8 + amigaMap.xOffset, y: 8 + amigaMap.yOffset, pixelScale: 1 }, cokTravelCursorLayer(x, y)], 4));
  else surface.paint(fb, picture.palette ?? EGA_PALETTE);
  position.textContent = `World position ${x},${y} — press Move, then arrow keys to travel.`;
}

/**
 * Build ECL1#17's OWN retail presentation instead of depending on whichever host chained into it.
 *
 * Round 34 threaded a `DialoguePresentation` down exactly one of the call sites that can land on
 * block 17 (openCokTravel's caravan `onClose`). Round 35 R5 measured the rest straight from the
 * retail bytes (EclVm, no host) rather than assuming the round-34 shape generalized: `chooseCok-
 * TravelCoordinate`'s two arms (11 and 3) each emit a picture on their first turn under their own
 * arrival memory -- arm-11 ([4C26]=2) emits PICTURE 58, arm-3 ([4C26]=1) emits PICTURE 58 then 57,
 * holding 57 across the whole courier scene before returning to 58 at the destination menu -- and
 * the caravan control (58 on arrival, 57 at Sir Karl) reproduces round 34. That is **3 distinct
 * branches**, not 4: a fourth candidate ("block 17 re-entered after its own LEAVE chain") is NOT an
 * independent arrival -- block 17's own LEAVE chains to block 16 (verified below), so re-entering 17
 * afterward necessarily comes back through one of the two arm branches above, selecting the same
 * memory and yielding the same ids. `openCokTravel.move`'s cursor immediate-chain branch
 * (explore.ts's `move`, `first.kind === 'chain'`) was separately swept across all 570 overland cells
 * under 5 arrival-memory baselines (empty, the arm-3 landmark seeds, the post-caravan memory, and
 * each arm's own post-visit selector) -- 0 of 2,850 probes produced an immediate chain, so that
 * branch is measured, not assumed, to be inert for CoK's own block16 script: it never reaches block
 * 17 (or anything) under any arrival memory this round could construct, and therefore cannot exhibit
 * the round-34 bug class today. (packages/engine/test/cokThrotlPaths.test.ts pins all of the above,
 * host-independently.)
 *
 * Deliberately NARROWER than openCokTravel's presentation: no `combatReturnPictureId` (121 is the
 * overland map frame, not a Throtl backdrop) and no `combatVictoryPerCharacterXp` (108 is the
 * caravan encounter's own observed native golden and is not evidence for any other encounter).
 *
 * Returns undefined -- so the conversation still opens text-only rather than a native panel with
 * nothing drawn on it -- when an asset fails to load OR loads but is missing either id this path
 * actually emits (57, 58); both outcomes are logged so a partial asset load is never silent.
 */
const COK_THROTL_PICTURE_IDS = [57, 58] as const;

/** Carry each decoded frame's own archive identity alongside the numeric ECL picture register. */
async function cokDialoguePictures(bigpicBytes: Uint8Array | null, picBytes: Uint8Array): Promise<{
  pictures: Map<number, IndexedImage>;
  pictureSources: Map<number, DialoguePictureSource>;
}> {
  const pictures = new Map<number, IndexedImage>();
  const pictureSources = new Map<number, DialoguePictureSource>();
  for (const [bytes, archive] of [[bigpicBytes, 'BIGPIC1.DAX'], [picBytes, 'PIC1.DAX']] as const) {
    if (!bytes) continue;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer));
    const archiveSha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    for (const block of decodeDax(bytes, archive).blocks) if (block.image) {
      pictures.set(block.blockId, block.image);
      const travelProof = archive === 'BIGPIC1.DAX' && block.blockId === COK_TRAVEL_PICTURE_ID
        && await validateCokTravelSource(archiveSha256, block.raw, block.image);
      pictureSources.set(block.blockId, { game: 'cok', system: 'DOS-EGA', archive, archiveSha256,
        blockId: block.blockId, frameIndex: 0, ...(travelProof ? { blockSha256: COK_TRAVEL_SOURCE.blockSha256 } : {}) });
    }
  }
  return { pictures, pictureSources };
}

async function cokThrotlPresentation(): Promise<DialoguePresentation | undefined> {
  try {
    const presentationAssetSource = activeAssetSource;
    const [bigpicBytes, picBytes, tiles] = await Promise.all([
      readAssetBytes('Champions of Krynn/BIGPIC1.DAX'),
      readAssetBytes('Champions of Krynn/PIC1.DAX'),
      fetchDaxRaw('Champions of Krynn/8X8D1.DAX'),
    ]);
    const { pictures, pictureSources } = await cokDialoguePictures(bigpicBytes, picBytes);
    const missing = COK_THROTL_PICTURE_IDS.filter((id) => !pictures.has(id));
    if (missing.length) {
      console.warn(`[cokThrotlPresentation] Throtl picture(s) ${missing.join(', ')} missing from ` +
        `BIGPIC1.DAX/PIC1.DAX (${pictures.size} decoded); opening text-only.`);
      return undefined;
    }
    const dosPortrait57Source = pictureSources.get(57);
    const amigaPortrait57 = matchesCokAmigaPortrait57BaseSource(dosPortrait57Source)
      ? { ...cokAmigaPortrait57SceneArt(() => {
        if (baseGameForExplore(activeGame.id) !== 'cok' || activeAssetSource !== presentationAssetSource) {
          return Promise.resolve({ ok: false as const, reason: 'captured CoK installation is no longer active' });
        }
        return loadCokAmigaPortrait57Source(presentationAssetSource ?? undefined);
      }), baseSource: dosPortrait57Source }
      : null;
    return {
      pictures,
      pictureSources,
      // This ECL1#17 Throtl sequence owns the Amiga PIC1.DAA#57 source match.
      // Other dialogue routes continue using the distinct DOS PIC1.DAX#57 pilot.
      sceneArts: [...cokPortraitSceneArts().filter((scene) => scene.pictureId !== 57),
        ...(amigaPortrait57 ? [amigaPortrait57] : [])],
      frameTiles: extractFrameTiles(tiles.blocks),
      frameLayout: activeGame.frameLayout,
      font: loadCokFont(tiles.bytes),
      party: compositorParty(),
      palette: EGA_PALETTE,
    };
  } catch (error) {
    console.warn('[cokThrotlPresentation] failed to build Throtl presentation; opening text-only.', error);
    return undefined;
  }
}

/**
 * ECL1#17 is CoK's non-GEO Throtl/Commandant sequence. It is reached naturally
 * when the retail map selector's unavailable Outpost arm falls back to block
 * 17; mounting it as a dungeon would be wrong because it deliberately emits no
 * wall/map load. Run its own initial entry as a paged dialogue instead, sharing
 * the campaign memory map with the following retail travel selection.
 */
async function openCokThrotlArrival(context: CampaignCarryContext, presentation?: DialoguePresentation): Promise<number> {
  try {
    const ecl = await fetchDax('Champions of Krynn/ECL1.DAX');
    const block17 = ecl.get(17);
    if (!block17) throw new Error('retail ECL1#17 Throtl script is missing');
    const runner = new DialogueRunner(new NarrativeDialogueMachine(new EclVm(block17, {
      memory: context.memory,
      dialect: ECL_GEN1,
    })));
    const first = runner.start();
    if (first.kind === 'chain') {
      return remountCampaignChain(first.blockId, context.memory, context);
    }
    // Read-only campaign-continuity seam: this non-GEO host has no mounted
    // explorer state, but its carried ECL words are the authoritative result
    // of the immediately preceding caravan branch.
    (window as unknown as { __cokThrotl?: Record<string, unknown> }).__cokThrotl = {
      areaMemory: (address: number) => context.memory.get(address & 0xffff) ?? 0,
      clockMinutes: () => context.clockMinutes ?? null,
    };
    openDialogueAt(runner, first, {
      title: 'Champions of Krynn · Throtl Commandant',
      // A caller that already owns the CoK art (the caravan route) keeps handing its own instance
      // down; every other path now builds one here rather than mounting art-less.
      presentation: presentation ?? await cokThrotlPresentation(),
      onClose: () => state?.automapSurface.canvas.focus(),
      onChain: (blockId) => { void remountCampaignChain(blockId, context.memory, context); },
    });
    return 1;
  } catch (error) {
    setStatus(`Could not run CoK Throtl sequence: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return 0;
  }
}

const POOL_REGIONAL_START_BLOCK_ID = 26;
const POOL_AREA_MAP_PROFILE: PlatformProfile = {
  id: 'pool-area-map',
  label: 'Pool native area map',
  nativeWidth: 88,
  nativeHeight: 88,
  displayAspect: 1,
};
const POOL_REGIONAL_SECTORS = [
  { blockId: 25, eclDisk: 6, geoBlockId: 4, initialEntry: 0x15cf },
  { blockId: 26, eclDisk: 7, geoBlockId: 5, initialEntry: 0x1814 },
  { blockId: 27, eclDisk: 8, geoBlockId: 6, initialEntry: 0x135a },
] as const;
const POOL_REGIONAL_X_ADDR = 0x49c3;
const POOL_REGIONAL_Y_ADDR = 0x49c4;
const POOL_CURRENT_AREA_ADDR = 0x49c5;

function poolAreaMapChecksum(indices: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const value of indices) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const POOL_REGIONAL_DIRECTIONS = [
  { label: 'N', direction: 0, dx: 0, dy: -1 },
  { label: 'NE', direction: 1, dx: 1, dy: -1 },
  { label: 'E', direction: 2, dx: 1, dy: 0 },
  { label: 'SE', direction: 3, dx: 1, dy: 1 },
  { label: 'S', direction: 4, dx: 0, dy: 1 },
  { label: 'SW', direction: 5, dx: -1, dy: 1 },
  { label: 'W', direction: 6, dx: -1, dy: 0 },
  { label: 'NW', direction: 7, dx: -1, dy: -1 },
] as const;

/**
 * Run Pool's ECL6#25 ↔ ECL7#26 ↔ ECL8#27 regional host strip over one campaign memory map.
 *
 * Each block's real vm_run_1 calculates an eight-way candidate in [00FB]/[00FC], rejects terrain
 * through [035F]/[6DC9], and owns its horizontal NEWECL seam. Pool's native CALL dispatcher proves
 * its intervening 0x401C call is a no-op; after vm_run_1 returns, the outer host commits an accepted
 * candidate and invokes search_location. GEO5 owns all three collision sectors (#4/#5/#6), while
 * their scripts and monsters remain on ECL/MON disks 6/7/8 respectively.
 */
async function openPoolTravel(
  carry?: CampaignCarryContext,
  startBlockId = POOL_REGIONAL_START_BLOCK_ID,
): Promise<number> {
  const context = carry ?? currentCampaignContext();
  if (!context || baseGameForExplore(activeGame.id) !== 'pool' || isCombatOpen()) return 0;
  closePoolTravel();
  try {
    const pool = GEN1_BASE_GAMES.pool;
    const disk1 = pool.disks.find((disk) => disk.disk === 1);
    const disk5 = pool.disks.find((disk) => disk.disk === 5);
    const sectorDisks = POOL_REGIONAL_SECTORS.map((sector) => ({
      sector,
      disk: pool.disks.find((disk) => disk.disk === sector.eclDisk),
    }));
    if (!disk1 || !disk5 || sectorDisks.some(({ disk }) => !disk)) {
      throw new Error('Pool disk 1/5/6/7/8 regional registry entries are missing');
    }
    const [geo, bootTiles, sectorArchives] = await Promise.all([
      fetchDax(disk5.geoPath),
      fetchDaxRaw(disk1.tilesPath),
      Promise.all(sectorDisks.map(async ({ sector: spec, disk }) => {
        const [ecl, mon, spcBytes, itmBytes] = await Promise.all([
          fetchDax(disk!.eclPath),
          fetchDax(disk!.monPath),
          disk!.spcPath
            ? readAssetBytes(disk!.spcPath).catch(() => new Uint8Array(0))
            : Promise.resolve(new Uint8Array(0)),
          disk!.itmPath
            ? readAssetBytes(disk!.itmPath).catch(() => new Uint8Array(0))
            : Promise.resolve(new Uint8Array(0)),
        ]);
        let monRecords = [...mon.entries()]
          .filter(([, raw]) => sniffMonsterRecord(raw, pool.profileId))
          .map(([blockId, raw]) => decodeMonsterRecord(raw, blockId, pool.profileId));
        const spcAffects = decodeMonsterSpcArchive(spcBytes);
        monRecords = applyHalfDamageAffect(applyRegenAffect(monRecords, spcAffects), spcAffects);
        monRecords = applyConSavingBonus(monRecords, spcAffects);
        monRecords = applyCloudProtectionAffects(monRecords, spcAffects);
        const itm = decodeMonsterItmArchive(itmBytes, pool.profileId);
        monRecords = applyItemPluses(monRecords, itm);
        monRecords = applyCarriedItems(monRecords, itm);
        return { spec, ecl, monsterLookup: monsterLookupFromArchive(monRecords) };
      })),
    ]);
    const areaMapRaw = bootTiles.blocks.get(POOL_AREA_MAP_BOOT_BLOCK_ID);
    if (!areaMapRaw) throw new Error('Pool retail 8X8D1#202 DrawAreaMap symbols are missing');
    const areaMapSymbols = decode8x8dBlock(areaMapRaw, 'Pool retail DrawAreaMap set 4');
    const sectors = sectorArchives.map(({ spec, ecl, monsterLookup }) => {
      const block = ecl.get(spec.blockId);
      const geoBlock = geo.get(spec.geoBlockId);
      if (!block || !geoBlock) {
        throw new Error(`retail ECL${spec.eclDisk}#${spec.blockId}/GEO5#${spec.geoBlockId} assets are missing`);
      }
      return {
        spec,
        block,
        map: decodeGeoBlock(geoBlock, `Pool of Radiance GEO5#${spec.geoBlockId} regional collision map`).map,
        monsterLookup,
      };
    });
    const startSector = sectors.find(({ spec }) => spec.blockId === startBlockId);
    if (!startSector) throw new Error('Pool regional start sector is missing');
    let activeSector = startSector;
    let regionalStepCount = 0;
    const regionalSpawn = (roster: readonly EncounterMonster[]): DialogueCombat => {
      const list = [...roster];
      const party = partySize() > 0
        ? partyCombatants()
        : DEMO_PARTY.map((spec) => partyCombatant(spec, addnd1e));
      const { enemies } = spawnEnemies(list, activeSector.monsterLookup);
      return {
        party,
        enemies,
        names: encounterNames(party, list, activeSector.monsterLookup),
        intro: enemies.length === 1 ? `A ${enemies[0]!.name} attacks!` : 'Monsters attack!',
        seed: regionalStepCount,
        day: gameDayFromMinutes(context.clockMinutes ?? 0),
        // Pool's regional combat host terrain has not been recovered. Omitting geometry selects
        // the tactical screen's honest flat fallback instead of leaking the hidden mounted
        // dungeon's pose, walls, allies, or scripted ITEM treasure into an overland battle.
      };
    };

    const initializeSector = (sector: typeof activeSector): void => {
      context.memory.set(POOL_CURRENT_AREA_ADDR, sector.spec.blockId);
      const initialized = new EclVm(sector.block, {
        dialect: ECL_POOL,
        entry: sector.spec.initialEntry,
        memory: context.memory,
      }).run();
      if (initialized.status === 'halted') {
        throw new Error(`ECL${sector.spec.eclDisk}#${sector.spec.blockId} initial entry halted`);
      }
      context.memory.set(POOL_CURRENT_AREA_ADDR, sector.spec.blockId);
    };

    // Execute ECL7#26's own chained initial entry once. The regional coordinates written by
    // ECL1#18 remain authoritative; later retail NEWECL seams initialize their target sectors.
    initializeSector(activeSector);

    const overlay = el('div', 'sheet-overlay');
    const panel = el('div', 'sheet-panel cok-travel-panel');
    panel.appendChild(el('div', 'gb-dlg-title', 'Pool of Radiance · Regional travel'));
    panel.appendChild(el('p', 'muted', 'Move across the regional city map. Landmarks, sector seams, and entrances are dispatched by the retail ECL6/ECL7/ECL8 scripts.'));
    const mapBox = el('div', 'gb-emu pool-area-map');
    const mapSurface = createScreenSurface(POOL_AREA_MAP_PROFILE, { integer: true });
    mapBox.appendChild(mapSurface.canvas);
    panel.appendChild(mapBox);
    const position = el('div', 'muted cok-travel-note');
    panel.appendChild(position);

    let lastAreaMapView: {
      width: number;
      height: number;
      originX: number;
      originY: number;
      markerCol: number;
      markerRow: number;
      arrowTile: number;
      checksum: number;
    } | null = null;

    const paintPosition = (): void => {
      const x = context.memory.get(POOL_REGIONAL_X_ADDR) ?? 0;
      const y = context.memory.get(POOL_REGIONAL_Y_ADDR) ?? 0;
      const view = composePoolAreaMapWindow(activeSector.map, {
        x: x & 0x0f,
        y: y & 0x0f,
        direction: (context.memory.get(0x033d) ?? 0) & 0x07,
      }, areaMapSymbols);
      mapSurface.paint(view.framebuffer, EGA_PALETTE);
      lastAreaMapView = {
        width: view.framebuffer.width,
        height: view.framebuffer.height,
        originX: view.originX,
        originY: view.originY,
        markerCol: view.markerCol,
        markerRow: view.markerRow,
        arrowTile: view.arrowTile,
        checksum: poolAreaMapChecksum(view.framebuffer.indices),
      };
      mapSurface.canvas.setAttribute(
        'aria-label',
        `Pool regional sector ${activeSector.spec.blockId}, position ${x}, ${y}`,
      );
      position.textContent = `Regional sector ${activeSector.spec.blockId} · position ${x},${y}`;
    };
    const chain = (blockId: number): void => {
      const nextSector = sectors.find(({ spec }) => spec.blockId === blockId);
      // The same block ids also name sector-local dungeons when [4A9E]==0xFF. Only the
      // regional-mode vm_run_1 seams stay inside this GEO5 strip; dungeon chains use the ordinary
      // campaign remounter against their own numbered GEO archive.
      if (nextSector && context.memory.get(0x4a9e) !== 0xff) {
        try {
          activeSector = nextSector;
          initializeSector(activeSector);
          paintPosition();
          presentLocation();
          setStatus(`Crossed into Pool regional sector ECL${activeSector.spec.eclDisk}#${activeSector.spec.blockId}.`);
        } catch (error) {
          setStatus(`Could not cross Pool regional sector: ${error instanceof Error ? error.message : String(error)}`, 'error');
        }
        return;
      }
      if (blockId === 24) context.memory.set(POOL_CURRENT_AREA_ADDR, 24);
      closePoolTravel();
      void remountCampaignChain(blockId, context.memory, {
        areaMemory: context.areaMemory,
        clockMinutes: context.clockMinutes,
      });
    };
    const presentLocation = (): void => {
      const runner = dialogueForCell(activeSector.block, 0, {
        memory: context.memory,
        dialect: ECL_POOL,
        seed: regionalStepCount,
        partyItemTypes: carriedItemTypeIds(),
      });
      if (!runner) return;
      const first = runner.start();
      if (first.kind === 'chain') {
        chain(first.blockId);
        return;
      }
      if (first.kind === 'end' && !first.text) return;
      closeDialogue();
      openDialogueAt(runner, first, {
        title: 'Pool of Radiance · Regional travel',
        spawn: regionalSpawn,
        onClose: () => {
          if (poolTravelOverlay) {
            paintPosition();
            (panel.querySelector('button') as HTMLButtonElement | null)?.focus();
          }
        },
        onChain: chain,
      });
    };
    const move = (directionIndex: number): boolean => {
      if (!poolTravelOverlay || isCombatOpen() || isDialogueOpen()) return false;
      const direction = POOL_REGIONAL_DIRECTIONS[directionIndex];
      if (!direction) return false;
      const x = context.memory.get(POOL_REGIONAL_X_ADDR) ?? 0;
      const y = context.memory.get(POOL_REGIONAL_Y_ADDR) ?? 0;
      const nx = x + direction.dx;
      const ny = y + direction.dy;
      const target = activeSector.map.cells[(ny & 0x0f) * activeSector.map.width + (nx & 0x0f)];
      if (!target) return false;

      context.memory.set(0x033d, direction.direction);
      context.memory.set(0x035f, target.floor ?? 0);
      context.memory.set(0x6dc9, 0);
      const runner = dialogueForVmRun1(activeSector.block, {
        memory: context.memory,
        dialect: ECL_POOL,
        partyItemTypes: carriedItemTypeIds(),
      });
      if (!runner) return false;
      let turn = runner.start();
      for (let guard = 0; guard < 16 && turn.kind === 'say' && turn.choices.length <= 1; guard++) {
        turn = runner.choose(0);
      }
      if (turn.kind === 'chain') {
        regionalStepCount++;
        chain(turn.blockId);
        return true;
      }
      if (turn.kind !== 'end') {
        openDialogueAt(runner, turn, {
          title: 'Pool of Radiance · Regional travel',
          spawn: regionalSpawn,
          onClose: () => panel.querySelector<HTMLButtonElement>('button')?.focus(),
          onChain: chain,
        });
        return false;
      }
      const candidateX = context.memory.get(0x00fb);
      const candidateY = context.memory.get(0x00fc);
      if (context.memory.get(0x6dc9) === 0xff || candidateX !== nx || candidateY !== ny) {
        setStatus(`Regional movement blocked at ${nx},${ny}.`, 'error');
        return false;
      }
      context.memory.set(POOL_REGIONAL_X_ADDR, nx);
      context.memory.set(POOL_REGIONAL_Y_ADDR, ny);
      regionalStepCount++;
      paintPosition();
      presentLocation();
      return true;
    };

    const choices = el('div', 'cok-travel-choices');
    for (const direction of POOL_REGIONAL_DIRECTIONS) {
      const button = el('button', 'gb-btn cok-travel-choice', direction.label) as HTMLButtonElement;
      button.type = 'button';
      button.title = `Move ${direction.label}`;
      button.addEventListener('click', () => move(direction.direction));
      choices.appendChild(button);
    }
    panel.appendChild(choices);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    const keyDirections: Record<string, number> = {
      ArrowUp: 0, PageUp: 1, ArrowRight: 2, PageDown: 3,
      ArrowDown: 4, End: 5, ArrowLeft: 6, Home: 7,
    };
    const keydown = (event: KeyboardEvent): void => {
      const direction = keyDirections[event.key];
      if (direction === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      move(direction);
    };
    window.addEventListener('keydown', keydown, true);
    poolTravelOverlay = { overlay, surface: mapSurface, keydown };
    paintPosition();
    (window as unknown as { __poolTravel?: Record<string, unknown> }).__poolTravel = {
      open: () => poolTravelOverlay !== null,
      position: () => ({
        x: context.memory.get(POOL_REGIONAL_X_ADDR) ?? 0,
        y: context.memory.get(POOL_REGIONAL_Y_ADDR) ?? 0,
      }),
      sector: () => ({
        eclDisk: activeSector.spec.eclDisk,
        eclBlockId: activeSector.spec.blockId,
        geoDisk: 5,
        geoBlockId: activeSector.spec.geoBlockId,
        monDisk: activeSector.spec.eclDisk,
      }),
      stepCount: () => regionalStepCount,
      mapView: () => lastAreaMapView ? { ...lastAreaMapView } : null,
      move: (direction: number) => move(direction),
      memory: (address: number) => context.memory.get(address & 0xffff) ?? 0,
      close: () => closePoolTravel(),
    };
    (choices.querySelector('button') as HTMLButtonElement | null)?.focus();
    setStatus('Pool regional travel is active; use the eight direction controls to find an entrance.');
    presentLocation();
    return sectors.reduce((total, sector) => total + sector.map.cells.length, 0);
  } catch (error) {
    closePoolTravel();
    setStatus(`Could not open Pool regional travel: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return 0;
  }
}

/**
 * Mount CoK's real dispatch-only travel screen: BIGPIC1#121 is selected by ECL1#16's own
 * `PICTURE 121`, while the selectable coordinates come straight from that block's two embedded
 * GETTABLE arrays. Choosing a point continues through the ordinary retail DialogueRunner, so its
 * confirmation, SAVE game_area, and NEWECL effects remain authoritative.
 */
async function openCokTravel(carry?: CampaignCarryContext): Promise<number> {
  const context = carry ?? currentCampaignContext();
  if (!context || baseGameForExplore(activeGame.id) !== 'cok' || isCombatOpen()) return 0;
  closeCokTravel();
  const mountSeq = cokTravelMountSeq;
  const presentationAssetSource = activeAssetSource;
  try {
    const [ecl, bigpicBytes, picBytes, tiles, mon] = await Promise.all([
      fetchDax('Champions of Krynn/ECL1.DAX'),
      readAssetBytes('Champions of Krynn/BIGPIC1.DAX'),
      readAssetBytes('Champions of Krynn/PIC1.DAX'),
      fetchDaxRaw('Champions of Krynn/8X8D1.DAX'),
      fetchDax('Champions of Krynn/MON1CHA.DAX'),
    ]);
    const block16 = ecl.get(16);
    const { pictures, pictureSources } = await cokDialoguePictures(bigpicBytes, picBytes);
    if (mountSeq !== cokTravelMountSeq || baseGameForExplore(activeGame.id) !== 'cok') return 0;
    const picture = pictures.get(COK_TRAVEL_PICTURE_ID) ?? null;
    if (!block16 || !picture) throw new Error('retail ECL1#16/BIGPIC1#121 assets are missing');
    const dosPortrait18Source = pictureSources.get(18);
    const amigaPortrait18 = matchesCokAmigaPortrait18BaseSource(dosPortrait18Source)
      ? { ...cokAmigaPortrait18SceneArt(() => {
        if (mountSeq !== cokTravelMountSeq || baseGameForExplore(activeGame.id) !== 'cok'
            || activeAssetSource !== presentationAssetSource) {
          return Promise.resolve({ ok: false as const, reason: 'captured CoK installation or travel mount is no longer active' });
        }
        return loadCokAmigaPortrait18Source(presentationAssetSource ?? undefined);
      }), baseSource: dosPortrait18Source }
      : null;
    const travelBaseSource = pictureSources.get(COK_TRAVEL_PICTURE_ID);
    const travelCursor = () => ({
      x: context.memory.get(0x4bc3) ?? 1, y: context.memory.get(0x4bc4) ?? 3,
    });
    const travelScene = matchesCokAmigaTravelBaseSource(travelBaseSource)
      ? cokAmigaTravelSceneArt(travelCursor, () => {
        if (mountSeq !== cokTravelMountSeq || baseGameForExplore(activeGame.id) !== 'cok'
            || activeAssetSource !== presentationAssetSource) {
          return Promise.resolve({ ok: false as const, reason: 'captured CoK installation or travel mount is no longer active' });
        }
        return loadCokAmigaTravelSource(presentationAssetSource ?? undefined);
      })
      : cokTravelSceneArt(travelCursor);
    const presentation: DialoguePresentation = {
      pictures,
      pictureSources,
      sceneArts: [...cokPortraitSceneArts(), ...(amigaPortrait18 ? [amigaPortrait18] : []), travelScene],
      screenOverlay: (frame, pictureId) => {
        if (pictureId === COK_TRAVEL_PICTURE_ID) paintCokTravelCursor(frame,
          context.memory.get(0x4bc3) ?? 1, context.memory.get(0x4bc4) ?? 3, 8 + picture.xOffset, 8 + picture.yOffset);
      },
      frameTiles: extractFrameTiles(tiles.blocks),
      frameLayout: activeGame.frameLayout,
      font: loadCokFont(tiles.bytes),
      party: compositorParty(),
      palette: EGA_PALETTE,
      combatReturnPictureId: COK_TRAVEL_PICTURE_ID,
      // Native GameLink trace of this ECL1#16 caravan encounter. This is a
      // presentation golden, not a substitute for the browser's incomplete
      // generic per-HP XP/loot reconstruction.
      combatVictoryPerCharacterXp: 108,
    };
    const travelMonsterLookup = monsterLookupFromArchive(
      [...mon.entries()]
        .filter(([, raw]) => sniffMonsterRecord(raw, 'cok'))
        .map(([blockId, raw]) => decodeMonsterRecord(raw, blockId, 'cok')),
    );
    const travelSpawn = (roster: readonly EncounterMonster[]) => dungeonSpawn(roster, undefined, travelMonsterLookup);
    const coordinates = cokTravelCoordinates(block16);
    if (!coordinates.length) throw new Error('retail destination coordinate tables are missing');

    const overlay = el('div', 'sheet-overlay');
    const panel = el('div', 'sheet-panel cok-travel-panel');
    panel.appendChild(el('div', 'gb-dlg-title', 'Champions of Krynn · Overland travel'));
    const emu = el('div', 'gb-emu');
    const surface = createScreenSurface(DOS_EGA, presentationFitOptions('cok'));
    followPresentationScale(surface, 'cok');
    emu.appendChild(surface.canvas);
    panel.appendChild(emu);
    const fb = createFramebuffer(320, 200, 0);
    blitIndexed(fb, picture, 8 + picture.xOffset, 8 + picture.yOffset);
    surface.paint(fb, picture.palette ?? EGA_PALETTE);

    let x = Math.max(0, Math.min(COK_TRAVEL_WIDTH - 1, context.memory.get(0x4bc3) ?? 1));
    let y = Math.max(0, Math.min(COK_TRAVEL_HEIGHT - 1, context.memory.get(0x4bc4) ?? 3));
    context.memory.set(0x4bc3, x);
    context.memory.set(0x4bc4, y);
    const position = el('div', 'muted cok-travel-note');
    panel.appendChild(position);
    const artStatus = el('div', 'muted cok-travel-art-status');
    panel.appendChild(artStatus);
    const source = pictureSources.get(COK_TRAVEL_PICTURE_ID);
    const admitted = !!source && dialoguePictureSourceKey(source) === dialoguePictureSourceKey(COK_TRAVEL_SOURCE);
    let mode = readRuntimeGraphicsMode('cok');
    let art: RgbaArt | null = null;
    let loading = false;
    let amigaMap: IndexedImage | null = null;
    let amigaLoading = false;
    let amigaError: string | null = null;
    let townNamesVisible = readCokTravelTownNames();
    let revision = 0;
    let disposed = false;
    let artError: string | null = null;
    const graphicsModeButtons: HTMLButtonElement[] = [];
    const active = (): boolean => !disposed && cokTravelOverlay?.surface === surface;
    const paint = (): void => {
      if (!active()) return;
      syncCokTravelModeButtons(graphicsModeButtons, mode);
      const useAmiga = mode === 'Amiga' && townNamesVisible && amigaMap !== null;
      paintCokTravel(surface, picture, useAmiga ? amigaMap : null, x, y, position, mode === 'Restyle' ? art : null);
      artStatus.textContent = mode === 'Amiga' && !townNamesVisible
        ? 'Map art: Town names hidden; DOS-EGA map shown'
        : mode === 'Amiga' && useAmiga ? 'Map art: Amiga BIGPIC1#121 · town names shown'
        : mode === 'Amiga' && amigaError ? `Map art: Amiga source unavailable (${amigaError}); DOS-EGA shown`
        : mode === 'Amiga' && amigaLoading ? 'Map art: Amiga map loading; DOS-EGA shown'
        : mode === 'Amiga' ? 'Map art: DOS-EGA shown; select Town names to load the Amiga map'
        : artError ? `Map art: Restyle unavailable (${artError}); DOS-EGA original shown`
        : mode === 'Restyle' && art ? 'Map art: Restyle (reviewed BIGPIC1#121 only)'
        : mode === 'Restyle' && admitted ? 'Map art: Loading Restyle; DOS-EGA original shown'
        : mode === 'Restyle' ? 'Map art: Source not mapped; DOS-EGA original shown'
        : 'Map art: DOS-EGA';
      townNamesInput.checked = townNamesVisible;
      townNamesInput.disabled = mode !== 'Amiga';
      if (mode === 'Amiga' && townNamesVisible && !amigaMap && !amigaLoading && !amigaError) {
        amigaLoading = true;
        const requestRevision = revision;
        void loadCokAmigaTravelSource(presentationAssetSource ?? undefined).then((result) => {
          if (!active() || revision !== requestRevision || mode !== 'Amiga' || !townNamesVisible
              || activeAssetSource !== presentationAssetSource) return;
          if (result.ok && result.baseSource && dialoguePictureSourceKey(result.baseSource) === dialoguePictureSourceKey(COK_TRAVEL_SOURCE)) {
            amigaMap = result.original;
          } else amigaError = result.ok ? 'base map identity differs' : result.reason;
          paint();
        }).catch((error: unknown) => {
          if (!active() || revision !== requestRevision || mode !== 'Amiga' || !townNamesVisible) return;
          amigaError = error instanceof Error ? error.message : String(error);
          paint();
        }).finally(() => {
          amigaLoading = false;
          if (active() && mode === 'Amiga' && townNamesVisible && !amigaMap && !amigaError) paint();
        });
      }
      if (mode !== 'Restyle' || !admitted || art || loading || artError) return;
      loading = true;
      const requestRevision = revision;
      void loadCokTravelRestyle().then((loaded) => {
        if (!active() || revision !== requestRevision || mode !== 'Restyle') return;
        art = loaded;
        paint();
      }).catch((error: unknown) => {
        if (!active() || revision !== requestRevision || mode !== 'Restyle') return;
        const message = error instanceof Error ? error.message : String(error);
        artError = message;
        paint();
      }).finally(() => {
        if (!active() || revision !== requestRevision) return;
        loading = false;
        // A mode change invalidates its old request; a fresh Restyle selection may retry.
        if (active() && mode === 'Restyle' && !art && !artError) paint();
      });
    };
    const graphicsListener = (event: Event): void => {
      const detail = (event as CustomEvent<{ gameId?: string; mode?: string }>).detail;
      if (!active() || detail?.gameId !== 'cok'
          || !['DOS-EGA', 'Amiga', 'Restyle'].includes(detail.mode ?? '')) return;
      mode = detail.mode as 'DOS-EGA' | 'Amiga' | 'Restyle';
      revision++;
      artError = null;
      amigaError = null;
      paint();
    };
    const townNamesListener = (event: Event): void => {
      const detail = (event as CustomEvent<{ visible?: boolean }>).detail;
      if (!active() || typeof detail?.visible !== 'boolean') return;
      townNamesVisible = detail.visible;
      revision++;
      amigaError = null;
      paint();
    };
    const localPackListener = (): void => {
      if (!active()) return;
      revision++;
      art = null;
      artError = null;
      loading = false;
      amigaError = null;
      paint();
    };
    const graphics = el('div', 'gb-dlg-art-controls');
    graphics.setAttribute('role', 'group'); graphics.setAttribute('aria-label', 'Map graphics');
    for (const [label, selected] of [['DOS · EGA', 'DOS-EGA'], ['Amiga · map', 'Amiga'], ['New graphics · map', 'Restyle']] as const) {
      const button = el('button', 'gb-btn', label) as HTMLButtonElement;
      button.type = 'button'; button.dataset.artMode = selected;
      graphicsModeButtons.push(button);
      button.addEventListener('click', () => writeRuntimeGraphicsMode('cok', selected));
      graphics.appendChild(button);
    }
    const namesLabel = el('label', 'gb-btn gb-cok-travel-names-toggle');
    const townNamesInput = el('input') as HTMLInputElement;
    townNamesInput.type = 'checkbox';
    townNamesInput.checked = townNamesVisible;
    townNamesInput.setAttribute('aria-label', 'Town names on Amiga map');
    townNamesInput.addEventListener('change', () => writeCokTravelTownNames(townNamesInput.checked));
    namesLabel.append(townNamesInput, document.createTextNode('Town names'));
    graphics.appendChild(namesLabel);
    panel.appendChild(graphics);
    addLocalAssetPackPicker(panel, () => {});
    let moving = false;
    const move = (direction: Direction): boolean => {
      if (!cokTravelOverlay || isCombatOpen() || !moving) return false;
      const delta = direction === 'north' ? [0, -1] : direction === 'east' ? [1, 0]
        : direction === 'south' ? [0, 1] : [-1, 0];
      const nx = Math.max(0, Math.min(COK_TRAVEL_WIDTH - 1, x + delta[0]!));
      const ny = Math.max(0, Math.min(COK_TRAVEL_HEIGHT - 1, y + delta[1]!));
      if (nx === x && ny === y) return false;
      x = nx;
      y = ny;
      moving = false;
      context.memory.set(0x4bc3, x);
      context.memory.set(0x4bc4, y);
      // The original game's overland clock/cadence is still under native-trace recovery.
      // A previous generic +10-minute update made the displayed date advance without any
      // retail evidence, so preserve the existing clock until the host scheduler is located.
      paint();
      const runner = dialogueForCell(block16, 0, {
        memory: context.memory,
        dialect: ECL_GEN1,
        seed: 0x1600 + y * COK_TRAVEL_WIDTH + x,
        seedMemory: { 0x4bc3: x, 0x4bc4: y },
      });
      if (!runner) return true;
      const first = runner.start();
      if (first.kind === 'chain') {
        closeCokTravel();
        void remountCampaignChain(first.blockId, context.memory, context);
      } else if (first.kind !== 'end' || first.text) {
        // The caravan's ECL1#16 WILD arm ends after setting word_25A. Native execution then
        // re-enters ECL1#17 (the carried LastEclBlockId is already 17), whose initial entry owns
        // the Sir StrongSword/Throtl destination return. This is a host block handoff, not prose
        // to fabricate after the ECL16 EXIT.
        let returnToThrotl = false;
        openDialogueAt(runner, first, {
          title: 'Champions of Krynn · Overland travel',
          spawn: travelSpawn,
          presentation,
          onEnd: () => { returnToThrotl = context.memory.get(0x4c2d) === 1; },
          onClose: () => {
            if (returnToThrotl) {
              // The complete native caravan branch is explicit here: once the
              // survivor path sets [4c2d], its host return resets the regional
              // pose (2,3) → (1,3) before ECL1#17's Throtl menu. This is a
              // route-specific observed host write, not a cursor-travel rule.
              context.memory.set(0x4bc3, 1);
              closeCokTravel();
              void openCokThrotlArrival(context, presentation);
              return;
            }
            if (cokTravelOverlay) {
              paint();
              surface.canvas.focus();
            }
          },
          onChain: (blockId) => {
            closeCokTravel();
            void remountCampaignChain(blockId, context.memory, context, presentation);
          },
        });
      }
      return true;
    };
    const choices = el('div', 'cok-travel-choices');
    const moveButton = el('button', 'gb-btn cok-travel-choice', 'Move') as HTMLButtonElement;
    moveButton.type = 'button';
    moveButton.addEventListener('click', () => {
      moving = true;
      position.textContent = 'Move selected — choose a direction.';
      surface.canvas.focus();
    });
    choices.appendChild(moveButton);
    for (const [label, direction] of [['North', 'north'], ['West', 'west'], ['East', 'east'], ['South', 'south']] as const) {
      const button = el('button', 'gb-btn cok-travel-choice', label) as HTMLButtonElement;
      button.type = 'button';
      button.addEventListener('click', () => move(direction));
      choices.appendChild(button);
    }
    panel.appendChild(choices);
    const cancel = state ? el('button', 'gb-btn ghost-btn', 'Return to the current area') as HTMLButtonElement : null;
    if (cancel) {
      cancel.type = 'button';
      cancel.addEventListener('click', () => {
        closeCokTravel();
        // The selector holds the fallen-party boundary back while open. Returning to the area is the
        // boundary where exploration becomes interactive again, so settle before restoring input.
        settlePartyDefeat();
        state?.automapSurface.canvas.focus();
      });
      panel.appendChild(cancel);
    }
    overlay.appendChild(panel);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) cancel?.click();
    });
    document.body.appendChild(overlay);
    const keydown = (event: KeyboardEvent): void => {
      const direction = event.key === 'ArrowUp' ? 'north' : event.key === 'ArrowRight' ? 'east'
        : event.key === 'ArrowDown' ? 'south' : event.key === 'ArrowLeft' ? 'west' : null;
      if (!direction) return;
      event.preventDefault();
      event.stopPropagation();
      move(direction);
    };
    window.addEventListener('keydown', keydown, true);
    cokTravelOverlay = { overlay, surface, keydown, disposeArt: () => {
      disposed = true; revision++;
      window.removeEventListener('goldbox:graphics-mode', graphicsListener);
      window.removeEventListener('goldbox:local-asset-pack', localPackListener);
      window.removeEventListener(COK_TRAVEL_TOWN_NAMES_EVENT, townNamesListener);
    } };
    window.addEventListener('goldbox:graphics-mode', graphicsListener);
    window.addEventListener('goldbox:local-asset-pack', localPackListener);
    window.addEventListener(COK_TRAVEL_TOWN_NAMES_EVENT, townNamesListener);
    paint();
    (window as unknown as { __cokTravel?: Record<string, unknown> }).__cokTravel = {
      open: () => isCokTravelOpen(),
      pictureId: () => COK_TRAVEL_PICTURE_ID,
      pictureSource: () => source ? { ...source } : null,
      graphicsMode: () => mode,
      artStatus: () => artStatus.textContent,
      displayRect: () => surface.rect(),
      memorySnapshot: () => [...context.memory.entries()],
      position: () => ({ x, y }),
      // The selector can outlive its originating mounted dungeon; retain the
      // carried campaign clock instead of exposing a misleading null then.
      clockMinutes: () => context.clockMinutes ?? state?.clockMinutes ?? null,
      beginMove: () => { moving = true; },
      move: (direction: Direction) => move(direction),
      coordinates: () => coordinates.map(({ index, x, y }) => ({ index, x, y })),
      labels: () => coordinates.map((coordinate) => previewCokTravelCoordinate(block16, coordinate, context)),
      choose: (index: number) => {
        const coordinate = coordinates.find((candidate) => candidate.index === index);
        if (coordinate) chooseCokTravelCoordinate(block16, coordinate, context, travelSpawn);
      },
      close: () => closeCokTravel(),
    };
    moveButton.focus();
    setStatus('Use Move and the directional controls to cross the Champions of Krynn overland map.');
    return COK_TRAVEL_WIDTH * COK_TRAVEL_HEIGHT;
  } catch (error) {
    setStatus(`Could not open CoK travel: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return 0;
  }
}

const DOK_TRAVEL_PICTURE_ID = 112;
const DOK_TRAVEL_WIDTH = 38;
const DOK_TRAVEL_HEIGHT = 15;

/** Paint DoK's exact 304x120 retail overland map and the party's 8x8 world-grid marker. */
function paintDokTravel(
  surface: ScreenSurface,
  picture: IndexedImage,
  x: number,
  y: number,
  position: HTMLElement,
): void {
  const fb = createFramebuffer(320, 200, 0);
  const baseX = 8 + picture.xOffset;
  const baseY = 8 + picture.yOffset;
  blitIndexed(fb, picture, baseX, baseY);
  const cx = baseX + x * 8 + 4;
  const cy = baseY + y * 8 + 4;
  for (let d = -3; d <= 3; d++) {
    if (cx + d >= 0 && cx + d < fb.width && cy >= 0 && cy < fb.height) fb.indices[cy * fb.width + cx + d] = 15;
    if (cy + d >= 0 && cy + d < fb.height && cx >= 0 && cx < fb.width) fb.indices[(cy + d) * fb.width + cx] = 15;
  }
  surface.paint(fb, picture.palette ?? EGA_PALETTE);
  position.textContent = `World position ${x},${y}`;
}

/**
 * Mount DoK's real ECL1#17 overland layer. The 38x15 coordinate grid is not guessed: BIGPIC1#112
 * is exactly 304x120 (38*8 by 15*8), while block 17's own SearchLocation routine dispatches from
 * [4BC3]/[4BC4] through fifteen embedded 38-byte rows. Every arrow step updates those retail words
 * and invokes that real handler, including landmark prompts, random events, combat, and NEWECL.
 */
async function openDokTravel(carry?: CampaignCarryContext): Promise<number> {
  const context = carry ?? currentCampaignContext();
  if (!context || baseGameForExplore(activeGame.id) !== 'dok' || isCombatOpen()) return 0;
  closeDokTravel();
  try {
    const [ecl, pictureBytes] = await Promise.all([
      fetchDax('Death Knights of Krynn/ECL1.DAX'),
      readAssetBytes('Death Knights of Krynn/BIGPIC1.DAX'),
    ]);
    const block17 = ecl.get(17);
    const picture = decodeDax(pictureBytes, 'BIGPIC1.DAX').blocks
      .find((block) => block.blockId === DOK_TRAVEL_PICTURE_ID)?.image ?? null;
    if (!block17 || !picture) throw new Error('retail ECL1#17/BIGPIC1#112 assets are missing');
    // The chained block's own initial entry selects WildernessMap mode and picture 112. It does not
    // replace the carried world coordinates from block 16/36.
    new EclVm(block17, { dialect: ECL_GEN1_SHORT, memory: context.memory }).run();
    let x = Math.max(0, Math.min(DOK_TRAVEL_WIDTH - 1, context.memory.get(0x4bc3) ?? 33));
    let y = Math.max(0, Math.min(DOK_TRAVEL_HEIGHT - 1, context.memory.get(0x4bc4) ?? 13));
    context.memory.set(0x4bc3, x);
    context.memory.set(0x4bc4, y);

    const overlay = el('div', 'sheet-overlay');
    const panel = el('div', 'sheet-panel cok-travel-panel');
    panel.appendChild(el('div', 'gb-dlg-title', 'Death Knights of Krynn · Overland travel'));
    const emu = el('div', 'gb-emu');
    const surface = createScreenSurface(DOS_EGA);
    emu.appendChild(surface.canvas);
    panel.appendChild(emu);
    const position = el('div', 'muted cok-travel-note');
    panel.appendChild(position);

    const move = (direction: Direction): boolean => {
      if (!dokTravelOverlay || isCombatOpen()) return false;
      const delta = direction === 'north' ? [0, -1] : direction === 'east' ? [1, 0]
        : direction === 'south' ? [0, 1] : [-1, 0];
      const nx = Math.max(0, Math.min(DOK_TRAVEL_WIDTH - 1, x + delta[0]!));
      const ny = Math.max(0, Math.min(DOK_TRAVEL_HEIGHT - 1, y + delta[1]!));
      if (nx === x && ny === y) return false;
      x = nx;
      y = ny;
      context.memory.set(0x4bc3, x);
      context.memory.set(0x4bc4, y);
      if (state) state.clockMinutes += 10;
      paintDokTravel(surface, picture, x, y, position);
      const runner = dialogueForCell(block17, 0, {
        memory: context.memory,
        dialect: ECL_GEN1_SHORT,
        seed: 0x1700 + y * DOK_TRAVEL_WIDTH + x,
        seedMemory: { 0x4bc3: x, 0x4bc4: y },
      });
      if (!runner) return true;
      const first = runner.start();
      if (first.kind === 'chain') {
        closeDokTravel();
        void remountCampaignChain(first.blockId, context.memory, context);
      } else if (first.kind !== 'end' || first.text) {
        openDialogueAt(runner, first, {
          title: 'Death Knights of Krynn · Overland travel',
          spawn: dungeonSpawn,
          onClose: () => {
            if (dokTravelOverlay) {
              paintDokTravel(surface, picture, x, y, position);
              surface.canvas.focus();
            }
          },
          onChain: (blockId) => {
            closeDokTravel();
            void remountCampaignChain(blockId, context.memory, context);
          },
        });
      }
      return true;
    };

    const choices = el('div', 'cok-travel-choices');
    for (const [label, direction] of [['North', 'north'], ['West', 'west'], ['East', 'east'], ['South', 'south']] as const) {
      const button = el('button', 'gb-btn cok-travel-choice', label) as HTMLButtonElement;
      button.type = 'button';
      button.addEventListener('click', () => move(direction));
      choices.appendChild(button);
    }
    panel.appendChild(choices);
    const cancel = el('button', 'gb-btn ghost-btn', 'Return to the outpost') as HTMLButtonElement;
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      closeDokTravel();
      state?.automapSurface.canvas.focus();
    });
    panel.appendChild(cancel);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    const keydown = (event: KeyboardEvent): void => {
      const direction = event.key === 'ArrowUp' ? 'north' : event.key === 'ArrowRight' ? 'east'
        : event.key === 'ArrowDown' ? 'south' : event.key === 'ArrowLeft' ? 'west' : null;
      if (!direction) return;
      event.preventDefault();
      event.stopPropagation();
      move(direction);
    };
    window.addEventListener('keydown', keydown, true);
    dokTravelOverlay = { overlay, surface, keydown };
    paintDokTravel(surface, picture, x, y, position);
    (window as unknown as { __dokTravel?: Record<string, unknown> }).__dokTravel = {
      open: () => isDokTravelOpen(),
      pictureId: () => DOK_TRAVEL_PICTURE_ID,
      position: () => ({ x, y }),
      move: (direction: Direction) => move(direction),
      memory: (address: number) => context.memory.get(address & 0xffff) ?? 0,
      close: () => closeDokTravel(),
    };
    surface.canvas.focus();
    setStatus('Cross the Death Knights of Krynn overland map; landmarks and encounters come from ECL1#17.');
    return DOK_TRAVEL_WIDTH * DOK_TRAVEL_HEIGHT;
  } catch (error) {
    setStatus(`Could not open DoK travel: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return 0;
  }
}

/** One `game_area`'s worth of eager-loaded archives (ADR-0009 §Decision (A)). */
export interface ArchiveSetArea {
  /** ECL blocks for this game_area, indexed by block id — feeds a `runEclChain` `BlockSource`. */
  ecl: Map<number, Uint8Array>;
  geo: Map<number, Uint8Array>;
  walldef: Map<number, Uint8Array>;
  tiles: Map<number, Uint8Array>;
  mon: Map<number, Uint8Array>;
  /** Raw MON{n}SPC/ITM side-table archives for retail combat parity in crossed dungeons. */
  spc: Uint8Array;
  itm: Uint8Array;
  /** Raw `ITEM{n}.DAX` bytes; absent areas (no item table) resolve to an empty array. */
  item: Uint8Array;
}

/**
 * ADR-0009 — eager-load every area a `GameData.archiveSet` declares into a `game_area`-indexed
 * map. Each area's ECL/GEO/WALLDEF/8X8D/MON{n}CHA/MON{n}SPC/MON{n}ITM/ITEM archives are fetched with
 * the SAME graceful-degrade convention `startExplore` already uses for optional side tables: a
 * missing file (e.g. CoAB's wilderness hub ships no `GEO1.DAX`/`WALLDEF1.DAX`) resolves to an
 * empty map/array rather than throwing, matching what retail's own `CMD_LoadFiles` expects when
 * `inDungeon == 0` skips `Load3DMap` (ADR-0009 §Scope). CoAB's full six-area set is ~248 KB
 * compressed, so eager-loading all declared areas up front (rather than paging one on first
 * crossing) is cheap — see the ADR's Decision (A).
 *
 * This is infrastructure for the *next* leaf (the wilderness/overland transition into a live
 * browser route): no `GAME_DATA` profile sets `archiveSet` yet, so this function is not called
 * from `startExplore`'s live dungeon-boot flow today.
 */
export async function loadArchiveSet(
  archiveSet: NonNullable<GameData['archiveSet']>,
): Promise<Map<number, ArchiveSetArea>> {
  const entries = await Promise.all(
    archiveSet.areas.map(async (n): Promise<[number, ArchiveSetArea]> => {
      const dir = archiveSet.dir;
      const [ecl, geo, walldef, tiles, mon, spc, itm, item] = await Promise.all([
        fetchDax(`${dir}/ECL${n}.DAX`).catch(() => new Map<number, Uint8Array>()),
        fetchDax(`${dir}/GEO${n}.DAX`).catch(() => new Map<number, Uint8Array>()),
        fetchDax(`${dir}/WALLDEF${n}.DAX`).catch(() => new Map<number, Uint8Array>()),
        fetchDax(`${dir}/8X8D${n}.DAX`).catch(() => new Map<number, Uint8Array>()),
        fetchDax(`${dir}/MON${n}CHA.DAX`).catch(() => new Map<number, Uint8Array>()),
        readAssetBytes(`${dir}/MON${n}SPC.DAX`).catch(() => new Uint8Array(0)),
        readAssetBytes(`${dir}/MON${n}ITM.DAX`).catch(() => new Uint8Array(0)),
        readAssetBytes(`${dir}/ITEM${n}.DAX`).catch(() => new Uint8Array(0)),
      ]);
      return [n, { ecl, geo, walldef, tiles, mon, spc, itm, item }];
    }),
  );
  return new Map(entries);
}

/**
 * Build a `runEclChain`-compatible `areaSource` (`packages/engine/src/ecl/program.ts`) from an
 * {@link loadArchiveSet} result: `game_area -> BlockSource` over that area's eager-loaded ECL
 * blocks. Areas absent from the map (never declared, or failed to load) resolve to `undefined`,
 * which `runEclChain` treats as "keep the previously active source" (ADR-0009 §Decision (D)).
 */
export function archiveSetToAreaSource(
  archives: Map<number, ArchiveSetArea>,
): (gameArea: number) => BlockSource | undefined {
  return (gameArea) => {
    const area = archives.get(gameArea);
    return area ? (id) => area.ecl.get(id) : undefined;
  };
}

/** Decode the full 8X8D block 202 (38 frame/arrow/gauge/moon tiles) for the compositor border. */
function extractFrameTiles(tileBlocks: Map<number, Uint8Array>): IndexedImage[] | null {
  const raw = tileBlocks.get(MOON_TILE_BLOCK); // block 202 = the boot UI symbol set (frame + moons)
  if (!raw) return null;
  try {
    return decode8x8dBlock(raw, `8X8D1#${MOON_TILE_BLOCK}`, { transparentMagenta: true }).tiles;
  } catch {
    return null;
  }
}

/**
 * M9.S3 — build the live EGA<->Amiga wall-art switch for this dungeon, when an Amiga source is
 * configured (`gd.amigaTilesPath`). Reuses the SAME WALLDEF bytes (`wdIdx`) + relocation logic
 * `dosWalls` was built from — WALLDEF routing (which tile-catalog slot fills which pool position)
 * is shared game-logic data across platforms; only the tile PIXEL source differs, via
 * `DungeonWallSources.decodeTileBlock`. The Amiga `.DAA` 8X8D archive uses the SAME sparse block
 * ids as its DOS `.DAX` counterpart, so the two `DungeonWalls` instances produce the exact same
 * `buildDungeonWallGraphicSet` ref-index space and can share one `GraphicSetManager`.
 *
 * `gd.amigaTileFormat` picks the per-block decoder (M9.S4): CoK's Amiga 8X8D archives are the
 * compact 4-plane tile-strip format (`decodeDaaTileBlock`); DoK's `8x8d1.daa` uses the standard
 * 5-plane BIGPIC-style frame format instead (`decodeDaaWideTileBlock`) — see `docs/daa-format.md`
 * §7c. DoK's 256-tile single-bank wall sets (`walls.singleBank`, `dungeonWalls.ts`) are chunked
 * across FOUR separate Amiga block ids (base, +20, +40, +60). That reassembly is SOLVED as of
 * R1 2026-09-03 and wired below: the natural chunk order, resolved through a colour map derived
 * from boot block 202's own palette, reproduces the DOS bank at 1786/1792 tiles byte-identical
 * (99.7%), beating the best rival order by 127 tiles. This REPLACES the 2026-09-02 note that
 * previously stood here ("reassembly order is unverified ... left unattempted rather than
 * guessed"), which rested on a retracted negative — that sweep's DOS-side reader used the wrong
 * tile-strip parser. See `docs/engine/research/dok-8x8d-amiga-format.md` §3.
 *
 * Caveat worth stating where the toggle is built: this is the SAME art as DOS, not richer art.
 * The toggle now reads real Amiga bytes for DoK walls; it does not show more colours there. The
 * boot/frame tile sets (0 and 4, sourced from block 202/203) decode as ordinary single frames and
 * DO get real Amiga pixels through this same path.
 *
 * Returns null (toggle unavailable, `walls` renders directly as before M9.S3) if no Amiga source
 * is configured or it fails to load/decode — never throws, never blocks the DOS dungeon load.
 */
async function buildWallGraphics(
  gd: GameData,
  dosWalls: DungeonWalls,
  setBlockIds: readonly [number, number, number],
  wdIdx: Map<number, Uint8Array>,
): Promise<WallGraphics | null> {
  if (gd.amigaGlibTilesPath) return buildGlibWallGraphics(gd, dosWalls, setBlockIds, wdIdx);
  if (!gd.amigaTilesPath) return null;
  try {
    const amigaBytes = await readAssetBytes(gd.amigaTilesPath);
    const amigaName = gd.amigaTilesPath.split('/').pop() ?? gd.amigaTilesPath;
    const amigaArchive = decodeDaa(amigaBytes, amigaName);
    const amigaRaw = new Map(amigaArchive.blocks.map((b) => [b.blockId, b.raw]));
    const wideFrame = gd.amigaTileFormat === 'wide-frame';
    const decodeTileBlock = wideFrame
      ? // R1: the reassembled wall banks carry the DOS-13 transparency key relocated to Amiga
        // slot 16 (`deriveDokWallColorMap`). The boot/frame blocks are ordinary opaque frames and
        // must NOT get that treatment, so the label decides — exactly as `dungeonWallsAmigaDok.test.ts`
        // does it.
        (raw: Uint8Array, label: string) =>
          label.startsWith('8X8D:bank')
            ? decodeDaaWideTileBlock(raw, label, { transparentIndex: 16 })
            : decodeDaaWideTileBlock(raw, label)
      : (raw: Uint8Array, label: string) => decodeDaaTileBlock(raw, label, { transparentMagenta: true });

    // R1 (2026-09-03): DoK's 256-tile single-bank wall sets live in four sparse Amiga blocks
    // (id, id+20, id+40, id+60) and are stitched into ONE synthetic 256-tile wide frame here.
    // Memoized because `tileBlock` is called more than once per id. Any game whose Amiga archive
    // lacks block 202 (the colour-map source) or a chunk simply returns null and falls back to
    // DOS, which is the pre-R1 behaviour — this never throws and never blocks the dungeon load.
    const WALL_CHUNK_OFFSETS = [0, 20, 40, 60] as const;
    const WALL_SERIES_IDS = new Set([1, 2, 3, 4, 5, 6, 7]);
    const paletteSourceRaw = wideFrame ? amigaRaw.get(202) ?? null : null;
    const combinedWallBankRaw = new Map<number, Uint8Array>();
    const amigaWallBankRaw = (id: number): Uint8Array | null => {
      if (!paletteSourceRaw || !WALL_SERIES_IDS.has(id)) return null;
      const cached = combinedWallBankRaw.get(id);
      if (cached) return cached;
      const chunks = WALL_CHUNK_OFFSETS.map((off) => amigaRaw.get(id + off));
      if (chunks.some((c) => !c)) return null;
      try {
        const combined = combineDokWallChunkRaws(chunks as Uint8Array[], paletteSourceRaw);
        combinedWallBankRaw.set(id, combined);
        return combined;
      } catch {
        return null; // malformed chunk set: fall back to DOS rather than break the toggle
      }
    };

    const amigaWalls = loadDungeonWalls(setBlockIds, {
      walldefBlock: (id) => walldefBlockFor(gd, wdIdx, id),
      tileBlock: (id) => amigaWallBankRaw(id) ?? amigaRaw.get(id) ?? null,
      decodeTileBlock,
      directWallsetTileIds: gd.directWallsetTileIds,
    });
    const dosSet = buildDungeonWallGraphicSet(dosWalls, 'DOS-EGA', 'DOS EGA', { width: 320, height: 200 });
    const amigaSet = buildDungeonWallGraphicSet(amigaWalls, 'Amiga', 'Amiga (32-color)', {
      width: 320,
      height: 200,
      pixelAspect: 1,
    });
    // M9.S5 — start on the persisted choice when it's still a valid set for THIS dungeon; an
    // unrecognised/stale value (different game, older build) falls back to the manager's own
    // default rather than throwing (`setActive` would throw on an unknown id).
    const restored = restoreGraphicsMode(gd.id);
    const initial = restored === 'Amiga' ? 'Amiga' : 'DOS-EGA';
    const manager = createGraphicSetManager([dosSet, amigaSet], { active: initial });
    return { manager, lookup: resolveWallTileLookup(manager, dosWalls), dosSet };
  } catch {
    return null;
  }
}

/**
 * The GLIB (DataLib-era Amiga) counterpart of {@link buildWallGraphics}'s `.DAA` path — Pools of
 * Darkness and its siblings ship `8X8D.TLB`, a big-endian master holding one leaf set per DOS
 * block id, rather than a `.DAA` archive of raw banks.
 *
 * The structural difference that matters here: a `.DAA` block can be handed to `loadDungeonWalls`
 * as raw bytes plus a decoder, but a GLIB master's sets are only meaningful in the context of the
 * master's own header and colour tables. So this decodes the master once and answers by block id
 * through the engine's `tileSetForBlock` source hook, which exists for exactly this shape.
 *
 * Boot/UI tile sets 0 and 4 are NOT in this container on the Amiga side (they live in the other
 * disk's `8X8DA.TLB`), so `tileSetForBlock` returns null for them and they fall through to the DOS
 * art. That is deliberate and visible: the toggle changes wall art, not the interface frame.
 */
async function buildGlibWallGraphics(
  gd: GameData,
  dosWalls: DungeonWalls,
  setBlockIds: readonly [number, number, number],
  wdIdx: Map<number, Uint8Array>,
): Promise<WallGraphics | null> {
  if (!gd.amigaGlibTilesPath) return null;
  try {
    const bytes = await readAssetBytes(gd.amigaGlibTilesPath);
    const name = gd.amigaGlibTilesPath.split('/').pop() ?? gd.amigaGlibTilesPath;
    // Some wall masters carry no colour table of their own (Gateway's `Walls.tlb` is 5-plane art
    // whose palette lives in `Always.tlb`); `amigaGlibPalettePath` supplies it when so.
    const palette = gd.amigaGlibPalettePath
      ? firstGlibPalette(await readAssetBytes(gd.amigaGlibPalettePath))
      : null;
    const banks = glibTileBanks(decodeGlib(bytes, name), glibIdTable(bytes), [], palette);
    // No usable bank for any set this dungeon actually asks for means there is nothing to toggle
    // TO; returning null keeps the game on DOS art rather than offering an empty second mode.
    if (![...setBlockIds].some((id) => id !== 0xff && banks.banks.has(id))) return null;

    // A byte-identical WALLDEF proves both platforms name the same tile NUMBERS; it does not prove
    // those numbers select corresponding tiles. Gateway is the counter-example that forces this
    // check: 25 of its 26 paired Amiga banks are faithful stand-ins, but block 15 carries real art
    // in slots 186-189 that the DOS bank pads flat, so swapping it paints wall where the DOS build
    // paints none — art that looks plausible instead of failing. Refusing the WHOLE toggle (rather
    // than the offending set) keeps a dungeon from rendering half Amiga and half DOS.
    for (let k = 0; k < setBlockIds.length; k++) {
      const blockId = setBlockIds[k];
      if (blockId === 0xff) continue;
      const amigaSet = banks.banks.get(blockId);
      const dosSet = dosWalls.tileSets[k + 1];
      // No Amiga bank for this set is fine — it simply keeps the DOS art (the boot/UI sets do this
      // routinely). Only a bank that EXISTS and disagrees is disqualifying.
      if (!amigaSet || !dosSet) continue;
      const parity = bankSwapParity(dosSet, amigaSet);
      if (!parity.ok) {
        console.warn(`[graphics] Amiga bank ${blockId} is not a stand-in for DOS: ${parity.reason}`);
        return null;
      }
    }

    const amigaWalls = loadDungeonWalls(setBlockIds, {
      walldefBlock: (id) => walldefBlockFor(gd, wdIdx, id),
      // Unused on the sets the master covers, but still the correct source for anything it does
      // not (the boot/UI sets), so the Amiga build keeps a complete frame.
      tileBlock: () => null,
      tileSetForBlock: (id) => banks.banks.get(id) ?? null,
      directWallsetTileIds: gd.directWallsetTileIds,
    });
    const dosSet = buildDungeonWallGraphicSet(dosWalls, 'DOS-EGA', 'DOS EGA', { width: 320, height: 200 });
    const amigaSet = buildDungeonWallGraphicSet(amigaWalls, 'Amiga', 'Amiga (32-color)', {
      width: 320,
      height: 200,
      pixelAspect: 1,
    });
    const restored = restoreGraphicsMode(gd.id);
    const initial = restored === 'Amiga' ? 'Amiga' : 'DOS-EGA';
    const manager = createGraphicSetManager([dosSet, amigaSet], { active: initial });
    return { manager, lookup: resolveWallTileLookup(manager, dosWalls), dosSet };
  } catch {
    return null;
  }
}

/**
 * ADR-0009 — adapts {@link runEclChain}'s pause/resume machinery (which already follows a
 * cross-archive `NEWECL` transparently, per the `setGameArea` effect + `areaSource` resolver) into
 * the {@link EclMachine} shape {@link DialogueRunner} expects, so the wilderness-transition crossing
 * can be driven by the SAME interactive dialogue overlay (`openDialogueAt`/`window.__dialogue`) every
 * other natural-route e2e case already uses — no bespoke UI. `RunChainResult.status` never surfaces
 * `'chain'` (the chain runner resolves those internally), so every status it returns already matches
 * `EclRunResult['status']` directly.
 *
 * `RunChainResult.effects` accumulates EVERY effect since the chain began (not "since the previous
 * return", unlike a bare `EclVm`), so `slice()` tracks how many effects have already been surfaced and
 * only returns the delta — otherwise `DialogueRunner`'s per-turn narration would repeat earlier text.
 *
 * Also captures a ONE-TIME snapshot of the shared chain memory, taken immediately before the first
 * `resume()` call that can possibly cross an archive (i.e. while still definitely in the start area),
 * keyed by `startAreaLabel`. This is the host's "no save-key collision across a crossing" evidence
 * (BUILD-QUEUE.md's wilderness-transition leaf): `startCrossArchiveExplore` feeds it to
 * `mountDungeonView` as `priorAreaMemory`, which `quickSave()` merges in alongside the CURRENT
 * (landed) area's own `state.map.name`-keyed bucket — two distinct string keys, never colliding.
 */
class ChainDialogueMachine implements EclMachine {
  private pending: RunChainResult | null = null;
  private seen = 0;
  private crossed = false;
  readonly snapshots: Record<string, Record<string, number>> = {};

  constructor(
    private readonly startBlockId: number,
    private readonly source: BlockSource,
    private readonly opts: RunChainOptions,
    private readonly startAreaLabel: string,
  ) {}

  run(): EclRunResult {
    this.pending = runEclChain(this.startBlockId, this.source, this.opts);
    return this.slice();
  }

  resume(value: EclInputValue = 0, resumeOpts?: { combatOutcome?: EclCombatOutcome }): EclRunResult {
    if (!this.pending?.resume) return { status: 'exited', effects: [] };
    if (!this.crossed) {
      this.snapshots[this.startAreaLabel] = Object.fromEntries(
        [...this.pending.memory].map(([address, value]) => [String(address & 0xffff), value]),
      );
    }
    this.pending = this.pending.resume(value, resumeOpts);
    return this.slice();
  }

  /** The full accumulated chain result once terminal (visited blocks, final memory, all effects). */
  result(): RunChainResult | null {
    return this.pending;
  }

  private slice(): EclRunResult {
    const r = this.pending!;
    const fresh = r.effects.slice(this.seen);
    this.seen = r.effects.length;
    for (const e of fresh) if (e.type === 'setGameArea') this.crossed = true;
    return { status: r.status, effects: fresh, ...(r.haltReason ? { haltReason: r.haltReason } : {}) };
  }
}

function coabRegionalCursorPosition(memory: ReadonlyMap<number, number> | undefined): { city: number; x: number; y: number } | null {
  const currentCity = memory?.get(0x4ca1);
  if (currentCity === undefined || !Number.isInteger(currentCity)) return null;
  const coordinate = COAB_REGIONAL_CURSOR_COORDS[currentCity];
  return coordinate ? { city: currentCity, x: coordinate[0], y: coordinate[1] } : null;
}

/**
 * Mount CoAB's retail regional selector at its proved city-return boundary. ECL5#48 performs the
 * ordinary `SAVE game_area=1; NEWECL 80`; the CoAB-specific predecessor binding lets ECL1#80 see
 * block 48 in `[0x4BF2]`, restore route node/current city 9, draw BIGPIC1#121, and emit its own
 * action, destination, and transport menus. No global city list or free cursor movement is added.
 */
export async function startCoabRegionalTravel(
  assetSource?: AssetSource,
  carryContext?: CampaignCarryContext,
): Promise<number> {
  // A village exit reaches this function while its mounted dungeon is still live. Capture that
  // selected-folder reader, shared ECL memory, departed-area snapshots, and clock before closeExplore
  // tears the view down. A direct `?coab-regional=1` boot simply starts with clean campaign memory.
  const continuingCoab = state !== null && baseGameForExplore(activeGame.id) === 'coab';
  const source = assetSource ?? (continuingCoab ? activeAssetSource ?? undefined : undefined);
  const carried = carryContext ?? (continuingCoab ? currentCampaignContext() : null) ?? {
    memory: new Map<number, number>(),
  };
  closeExplore();
  combatLaunchPending = false;
  const mountSeq = ++exploreMountSeq;
  const gd = gameData('coab-natural-3');
  activeGame = gd;
  activeAssetSource = source ?? null;
  const out = document.querySelector('#output') as HTMLElement | null;
  if (!out) return 0;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((node) => node.classList.remove('active'));
  out.innerHTML = '';
  setStatus('Loading Curse of the Azure Bonds regional travel…');

  try {
    if (!gd.archiveSet) throw new Error('CoAB regional archive set is not configured');
    const [archives, ecl1, bigpicBytes, tiles] = await Promise.all([
      // The regional round trip needs full game_area 5 resources for the walkable village, but
      // game_area 1 is dispatch-only and retail ships no GEO1/WALLDEF1. Fetch only its ECL instead
      // of generating two expected-but-noisy 404s through the general archive-set loader.
      loadArchiveSet({ ...gd.archiveSet, areas: [5] }),
      fetchDax(`${gd.archiveSet.dir}/ECL1.DAX`),
      readAssetBytes('C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/BIGPIC1.DAX'),
      fetchDaxRaw('C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D1.DAX'),
    ]);
    if (mountSeq !== exploreMountSeq) return 0;
    archives.set(1, {
      ecl: ecl1,
      geo: new Map(),
      walldef: new Map(),
      tiles: new Map(),
      mon: new Map(),
      spc: new Uint8Array(0),
      itm: new Uint8Array(0),
      item: new Uint8Array(0),
    });
    const ecl5 = archives.get(5)?.ecl;
    if (!ecl5?.has(48) || !ecl1?.has(80)) {
      throw new Error('retail ECL5#48/ECL1#80 regional chain blocks are missing');
    }

    const pictures = new Map<number, IndexedImage>();
    for (const block of decodeDax(bigpicBytes, 'BIGPIC1.DAX').blocks) {
      if (block.image) pictures.set(block.blockId, block.image);
    }
    const regionalPicture = pictures.get(COAB_REGIONAL_PICTURE_ID) ?? null;
    if (!regionalPicture) throw new Error('retail BIGPIC1#121 regional map is missing');

    const area1: BlockSource = (blockId) => ecl1.get(blockId);
    const area5: BlockSource = (blockId) => ecl5.get(blockId);
    const machine = new ChainDialogueMachine(
      48,
      area5,
      {
        memory: carried.memory,
        seed: 1,
        dialect: { ...ECL_GEN1, lastBlockIdAddr: 0x4bf2 },
        areaSource: (gameArea) => gameArea === 1 ? area1 : gameArea === 5 ? area5 : undefined,
        startGameArea: 5,
        partyItemTypes: carriedItemTypeIds(),
        maxBlocks: 32,
      },
      'Curse of the Azure Bonds game_area 5',
    );
    const runner = new DialogueRunner(machine, (effects) => {
      destroyPartyItemsByTypes(
        effects.filter((effect) => effect.type === 'destroyItems').map((effect) => effect.itemTypeId),
      );
    });
    const first = runner.start();
    const initial = machine.result();
    // A party carrying Drow gear pauses inside #48 for the retail sunlight-decay warning before
    // DESTROY_ITEMS and NEWECL 80. A clean party reaches node 9 immediately.
    if (!initial || initial.status !== 'awaiting-input' || initial.visited[0] !== 48 ||
        (initial.visited.includes(80) &&
          (initial.memory.get(0x4c9c) !== 9 || initial.memory.get(0x4ca1) !== 9))) {
      throw new Error('retail ECL5#48 regional entry did not start cleanly');
    }

    let cursorVisible = true;
    const presentation: DialoguePresentation = {
      pictures,
      frameTiles: extractFrameTiles(tiles.blocks),
      frameLayout: activeGame.frameLayout,
      font: loadCokFont(tiles.bytes),
      party: compositorParty(),
      palette: EGA_PALETTE,
      screenOverlay: (screen, pictureId, visible) => {
        cursorVisible = visible && pictureId === COAB_REGIONAL_PICTURE_ID;
        if (!cursorVisible) return;
        const cursor = coabRegionalCursorPosition(machine.result()?.memory);
        if (!cursor) return;
        // MapCursor.Draw passes loc_X/loc_Y straight to seg040.draw_picture, whose coordinates are
        // already absolute 8-pixel cells. In particular x=38 must occupy pixels 304..311, proving
        // there is no additional BIGPIC/HUD inset here.
        const left = cursor.x * 8;
        const top = cursor.y * 8;
        for (let y = 0; y < 8; y++) {
          const py = top + y;
          if (py < 0 || py >= screen.height) continue;
          for (let x = 0; x < 8; x++) {
            const px = left + x;
            if (px >= 0 && px < screen.width) screen.indices[py * screen.width + px] = 15;
          }
        }
      },
      // Recovered CoAB input loop: 500 ms visible, then 300 ms restored/hidden.
      screenOverlayBlinkMs: [500, 300],
    };

    const finishRegional = async (): Promise<void> => {
      cursorVisible = false;
      if (mountSeq !== exploreMountSeq) return;
      const result = machine.result();
      const landedBlockId = result?.visited[result.visited.length - 1];
      // Only ENTER CITY terminates in ECL5#49. Closing the menu early, CAMP, and JOURNEY ON must
      // remain regional actions rather than accidentally mounting the village.
      if (!result || result.status !== 'exited' || landedBlockId !== 49) return;
      (window as unknown as { __coabRegional?: Record<string, unknown> }).__coabRegional = undefined;
      await mountCrossedDungeon(
        gd,
        'coab-natural-3',
        mountSeq,
        out,
        archives,
        result,
        { ...(carried.areaMemory ?? {}), ...machine.snapshots },
        { clockMinutes: carried.clockMinutes },
      );
    };

    openDialogueAt(runner, first, {
      title: 'Curse of the Azure Bonds · Regional travel',
      presentation,
      onClose: () => { void finishRegional(); },
    });
    (window as unknown as { __coabRegional?: Record<string, unknown> }).__coabRegional = {
      visited: () => [...(machine.result()?.visited ?? [])],
      memory: (address: number) => machine.result()?.memory.get(address & 0xffff) ?? 0,
      itemTypes: () => carriedItemTypeIds(),
      cursor: () => {
        const cursor = coabRegionalCursorPosition(machine.result()?.memory);
        return cursor ? { ...cursor, visible: cursorVisible } : null;
      },
    };
    (window as unknown as { __rendered: number }).__rendered = 1;
    setStatus('Choose ENTER CITY, JOURNEY ON, or CAMP on the retail CoAB regional map.');
    return 1;
  } catch (error) {
    if (mountSeq !== exploreMountSeq) return 0;
    setStatus(`Could not open CoAB regional travel: ${error instanceof Error ? error.message : String(error)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }
}

/**
 * "Mid-walk chain re-mount" (BUILD-QUEUE.md's Secret town-exit + Pool wilderness-crossing leaves) —
 * the capability both routes' own scope notes named as missing: a `dialogueForCell`/`dialogueForVmRun1`
 * `'chain'` turn reached DURING an ordinary walk (not at profile boot, unlike
 * {@link startCrossArchiveExplore}'s ADR-0009 dialogue-only crossing). Looks up `blockId` in the
 * active `GameData.chainTargets` (same-archive for Secret's `ECL1#16` archway -> `#33`, a genuinely
 * different archive for Pool's `ECL1#18` `vm_run_1` crossing -> `ECL4#2`), fetches that archive set
 * exactly like {@link startExplore}'s own single-archive boot, runs the target block's own
 * `initial_entry` via {@link loadDungeon} carrying the LIVE `carriedMemory` Map forward (so ECL words
 * set on the departed side — Secret's `[0x4c2e]`, Pool's `[0x4a1a]` — survive the crossing, matching
 * both engine goldens' own persistence proof), then re-mounts through the SAME
 * {@link mountDungeonView} tail {@link mountCrossedDungeon} uses.
 *
 * Party roster HP/items/spells (`party.ts`'s own module state) live outside `ExploreState` and are
 * untouched by a re-mount — the same reason the existing ADR-0009 crossing never needed to carry them
 * explicitly either.
 *
 * A `blockId` with no `chainTargets` entry (any chain this project hasn't wired live yet) fails soft
 * with a status message — it does not throw or leave the previous view in a broken state.
 */
/**
 * Resolve a retail NEWECL against the base game's real disk registry. CoK's block 16 is the one
 * non-dungeon target: it opens the retail travel selector instead. All walkable targets mount via
 * the same disk/area loader as save restoration, with one continuous campaign-memory Map.
 */
async function remountCampaignChain(
  blockId: number,
  carriedMemory: Map<number, number>,
  context: Omit<CampaignCarryContext, 'memory'> = {},
  // Round 34: a chained remount that lands on a native-art host has to carry that host's
  // DialoguePresentation, or the target mounts without the `.gb-dlg-panel-native` canvas and
  // renderPresentation() bails, leaving currentPictureId permanently null. Optional, so every
  // other call site is unaffected; only callers that HAVE a presentation pass one.
  presentation?: DialoguePresentation,
): Promise<number> {
  // Count the handoff synchronously: a chain is still in progress until its target has mounted,
  // including the registry-scan await that runs before campaignRemountPending is raised.
  scriptChainsInFlight++;
  try {
    return await remountCampaignChainNow(blockId, carriedMemory, context, presentation);
  } finally {
    scriptChainsInFlight--;
    settlePartyDefeat();
  }
}

async function remountCampaignChainNow(
  blockId: number,
  carriedMemory: Map<number, number>,
  context: Omit<CampaignCarryContext, 'memory'>,
  presentation: DialoguePresentation | undefined,
): Promise<number> {
  const baseId = baseGameForExplore(activeGame.id);
  if (baseId === 'pool' && POOL_REGIONAL_SECTORS.some((sector) => sector.blockId === blockId) &&
      carriedMemory.get(0x4a9e) !== 0xff) {
    return openPoolTravel({
      memory: carriedMemory,
      areaMemory: context.areaMemory ?? campaignAreaMemory(),
      clockMinutes: context.clockMinutes ?? state?.clockMinutes,
    }, blockId);
  }
  // ECL1#24 hosts both GEO24 and GEO31. The regional SOUTH entrance selects GEO24 through this
  // global word, so synchronize it before loadDungeon executes the target block's initial entry.
  if (baseId === 'pool' && blockId === 24) carriedMemory.set(POOL_CURRENT_AREA_ADDR, 24);
  // CoAB ECL5#49's confirmed west exit reaches dispatch-only ECL5#48. It is the retail predecessor
  // that ECL1#80 uses to restore route node/current city 9; reopen the BIGPIC host with the exact
  // live memory/source rather than asking the dungeon loader to fabricate GEO for block 48.
  if (baseId === 'coab' && blockId === 48) {
    return startCoabRegionalTravel(activeAssetSource ?? undefined, {
      memory: carriedMemory,
      areaMemory: context.areaMemory ?? campaignAreaMemory(),
      clockMinutes: context.clockMinutes ?? state?.clockMinutes,
    });
  }
  if (baseId === 'cok' && blockId === 16) return openCokTravel({ memory: carriedMemory, ...context });
  if (baseId === 'cok' && blockId === 17) return openCokThrotlArrival({ memory: carriedMemory, ...context }, presentation);
  if (baseId === 'dok' && blockId === 17) return openDokTravel({ memory: carriedMemory, ...context });
  // Profiles with an explicit target know which archive owns a repeated block id. Prefer that
  // evidence-backed mapping over the base-game registry scan below (for example Pool's block 2 is
  // ECL4, while Secret's block 33 stays in ECL1).
  if (activeGame.chainTargets?.[blockId]) return remountChainedArea(blockId, carriedMemory, context);
  if (baseId) {
    const base = GEN1_BASE_GAMES[baseId];
    const matches = await Promise.all(base.disks.map(async (disk) => ({
      disk,
      present: await fetchDax(disk.eclPath).then((blocks) => blocks.has(blockId)).catch(() => false),
    })));
    const target = matches.find((candidate) => candidate.present)?.disk;
    if (target) {
      return switchGen1Area(baseId, target, blockId, {
        areaMemory: context.areaMemory ?? campaignAreaMemory(),
        carriedMemory,
        clockMinutes: context.clockMinutes ?? state?.clockMinutes,
      });
    }
  }
  return remountChainedArea(blockId, carriedMemory, context);
}

/**
 * Evidence-only continuation for Secret's recovered Black Circle alert dependency. ECL1#34's
 * descriptor-45 handler really writes [0x4c4d]=0xff and chains to #32, but no retail #32 -> #16
 * transition has been located. Keep that missing link visible by exposing a narrowly guarded test
 * bridge instead of pretending the chain is natural. The unset branch may bridge directly from the
 * fresh #34 mount; the positive branch must first have reached #32 with the exact produced 0xff.
 */
async function bridgeSecretQuestToMarcus(): Promise<number> {
  const live = state;
  if (!live || activeGame.id !== 'secret-natural-4' || isCombatOpen() || combatLaunchPending || campaignRemountPending > 0) return 0;
  const area = live.currentArea;
  const alert = live.areaMemory.get(0x4c4d) ?? 0;
  const validControl = area?.disk === 1 && area.areaId === 34 && alert === 0;
  const validProduced = area?.disk === 1 && area.areaId === 32 && alert === 0xff;
  if (!validControl && !validProduced) return 0;
  const disk = GEN1_BASE_GAMES.secret.disks.find((candidate) => candidate.disk === 1);
  if (!disk) return 0;
  const carriedMemory = new Map(live.areaMemory);
  const areaMemory = campaignAreaMemory();
  const clockMinutes = live.clockMinutes;
  return switchGen1Area('secret', disk, 16, { areaMemory, carriedMemory, clockMinutes });
}

async function remountChainedArea(
  blockId: number,
  carriedMemory: Map<number, number>,
  context: Omit<CampaignCarryContext, 'memory'> = {},
): Promise<number> {
  const gd = activeGame;
  const out = document.querySelector('#output') as HTMLElement | null;
  const target = gd.chainTargets?.[blockId];
  if (!target || !out) {
    setStatus(`No live crossing wired for ${gd.title} block ${blockId}.`, 'error');
    return 0;
  }
  const carriedAreaMemory = context.areaMemory ?? campaignAreaMemory();
  const carriedClock = context.clockMinutes ?? state?.clockMinutes;
  const mountSeq = ++exploreMountSeq;
  const eclDialect = eclDialectFor(gd);
  setStatus(`Crossing into ${gd.title} block ${blockId}…`);
  campaignRemountPending++;
  try {
    const [eclIdx, geoIdx, wdIdx, tiles, monIdx, spcBytes, itmBytes] = await Promise.all([
      fetchDax(target.eclPath),
      fetchDax(target.geoPath),
      fetchDax(target.walldefPath),
      fetchDaxRaw(target.tilesPath),
      fetchDax(target.monPath).catch(() => new Map<number, Uint8Array>()),
      target.spcPath ? readAssetBytes(target.spcPath).catch(() => new Uint8Array(0)) : Promise.resolve(new Uint8Array(0)),
      target.itmPath ? readAssetBytes(target.itmPath).catch(() => new Uint8Array(0)) : Promise.resolve(new Uint8Array(0)),
    ]);
    if (mountSeq !== exploreMountSeq) return 0;
    const tlIdx = tiles.blocks;
    const targetEcl = eclIdx.get(blockId);
    if (!targetEcl) throw new Error(`ECL block ${blockId} not found in the chain target archive`);
    const sources: DungeonSources = {
      geoBlock: (id) => geoIdx.get(id) ?? null,
      walldefBlock: (id) => walldefBlockFor(gd, wdIdx, id),
      tileBlock: (id) => tlIdx.get(id) ?? null,
      directWallsetTileIds: gd.directWallsetTileIds,
    };
    // No `entry` override: the chained block's own standard `initial_entry`, exactly like every
    // other chained (non-boot) block in both engine goldens.
    const dungeon = loadDungeon(targetEcl, sources, {
      label: `${gd.title} chain#${blockId}`,
      memory: carriedMemory,
      dialect: eclDialect,
      fallbackPieces: gd.eclFallbackPieces,
    });
    const wallGraphics = await buildWallGraphics(gd, dungeon.walls, dungeon.pieces.setBlockIds, wdIdx);
    const moonTiles = extractMoonTiles(tlIdx, gd.moonTileGroups);
    const frameTiles = extractFrameTiles(tlIdx);
    const font = loadCokFont(tiles.bytes);
    let monRecords = [...monIdx.entries()]
      .filter(([, raw]) => sniffMonsterRecord(raw, gd.profileId))
      .map(([bid, raw]) => decodeMonsterRecord(raw, bid, gd.profileId));
    const spcAffects = decodeMonsterSpcArchive(spcBytes);
    monRecords = applyHalfDamageAffect(applyRegenAffect(monRecords, spcAffects), spcAffects);
    monRecords = applyConSavingBonus(monRecords, spcAffects);
    monRecords = applyCloudProtectionAffects(monRecords, spcAffects);
    const itm = decodeMonsterItmArchive(itmBytes, gd.profileId);
    monRecords = applyItemPluses(monRecords, itm);
    monRecords = applyCarriedItems(monRecords, itm);
    const monsterLookup = monsterLookupFromArchive(monRecords);
    const allies = dungeon.npcJoins
      .map(({ npcId, morale }): MonsterRecord | null => {
        const rec = monsterLookup(npcId);
        return rec ? { ...rec, morale } : null;
      })
      .filter((r): r is MonsterRecord => r !== null);
    const bestiary = monRecords.map((m) => ({
      name: m.name,
      ac: m.armorClass,
      thac0: m.thac0,
      damage: `${m.damage.count}d${m.damage.sides}${m.damage.bonus ? `+${m.damage.bonus}` : ''}`,
      combatSize: m.combatSize,
      morale: m.morale,
      itemPluses: m.itemPluses,
      carriedItems: m.carriedItems,
    }));
    let itemDb: ExploreItemRecord[] = [];
    try {
      const itemBytes = (await fetchDaxRaw(target.itemPath)).bytes;
      itemDb = target.itemFormat === 'dok-17'
        ? decodeDokItemArchive(itemBytes).map((it) => ({
            name: baseItem(it.baseTypeId)?.name ?? `Item type ${it.baseTypeId}`,
            baseTypeId: it.baseTypeId,
            value: it.value,
          }))
        : decodeItemArchive(itemBytes).map((it) => ({
            name: it.name, baseTypeId: it.baseTypeId, itemTypeId: it.itemTypeId,
            archiveBlockId: it.archiveBlockId, value: 0, count: it.count,
          }));
    } catch {
      itemDb = [];
    }

    if (mountSeq !== exploreMountSeq) return 0;
    out.innerHTML = '';
    return mountDungeonView(gd.id, mountSeq, out, {
      map: dungeon.map, walls: dungeon.walls, wallGraphics, areaEcl: targetEcl, eclDialect,
      monsterLookup, monRecords, itemDb, allies, introText: dungeon.introText, bestiary,
      moonTiles, frameTiles, font, areaMemorySeed: carriedMemory,
      priorAreaMemory: carriedAreaMemory,
      currentArea: { disk: diskNumberFromPath(target.geoPath), areaId: blockId },
      // A profile startPose is scoped to its boot map. A chained target gets its own map's normal
      // spawn unless a transition supplies explicit retail coordinates through switchGen1Area.
      startPose: chooseStart(dungeon.map),
      clockMinutes: carriedClock,
    });
  } catch (err) {
    if (mountSeq !== exploreMountSeq) return 0;
    setStatus(`Could not cross into block ${blockId}: ${err instanceof Error ? err.message : String(err)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  } finally {
    campaignRemountPending--;
  }
}

// ── "Walk any area" picker — enumerate + jump to any playable Gen1 area across a base game's disks ──

/** One entry in the area-picker dropdown: every real GEO map on one disk. */
interface Gen1AreaPick {
  id: number;
  width: number;
  height: number;
  disk: number;
  /** True when the map's id has a syntactically valid ECL member on this disk. */
  hasEcl: boolean;
  /** False when there is no safe ECL-driven first-person mount path. */
  walkable: boolean;
}

/**
 * Per-base-game memoized area listing (keyed by `Gen1BaseGame.id`) — the picker recomputes this once
 * per base game per page load, not on every area switch (switching areas re-mounts the whole dungeon
 * view via {@link switchGen1Area}, which would otherwise re-fetch and re-decode every disk's GEO+ECL
 * archives on every single pick).
 */
const gen1AreaListCache = new Map<string, Promise<Gen1AreaPick[]>>();

/**
 * Catalogue every GEO map across ALL of a base game's disks (fetched once, cached).
 *
 * GEO+ECL block-id pairing alone ({@link listPairedGen1Areas}) is NOT sufficient to prove an area is
 * actually walkable: an id can have both a real GEO map and a real ECL script yet still fail to load —
 * e.g. the ECL block never emits LOAD_FILES/LOAD_PIECES for that id (it's a shop/combat/event script
 * that happens to share the numeric id), or the map's wall-piece set names a WALLDEF/8X8D bank this
 * disk doesn't ship (found live: 21/29 GEO+ECL-paired Treasures ids, 2/15 CoK ids). So every paired
 * candidate is additionally probed with the SAME {@link loadDungeon} call {@link switchGen1Area} would
 * make (which internally calls `loadDungeonWalls` too) — using archives already fetched here — and only
 * the ones that don't throw are kept. This is pure/no extra network cost: probing reuses the geo/ecl/
 * walldef/tile bytes this function fetches per disk anyway. Keep the complete GEO corpus in the
 * picker for every title: a map without a safe first-person boot opens the read-only raw-GEO atlas
 * instead of being hidden, disabled, or rendered with guessed wall-art resources.
 */
function listAllGen1Areas(base: Gen1BaseGame): Promise<Gen1AreaPick[]> {
  const cached = gen1AreaListCache.get(base.id);
  if (cached) return cached;
  const dialect = eclDialectForBase(base);
  const promise = (async () => {
    const perDisk = await Promise.all(
      base.disks.map(async (d): Promise<Gen1AreaPick[]> => {
        try {
          const [geoArc, eclArc, wdIdx, sharedWdIdx, tiles, sharedTilesIdx, dokBanks] = await Promise.all([
            fetchDaxRaw(d.geoPath),
            fetchDaxRaw(d.eclPath),
            fetchDax(d.walldefPath),
            d.sharedWalldefPath ? fetchDax(d.sharedWalldefPath) : Promise.resolve(new Map<number, Uint8Array>()),
            fetchDaxRaw(d.tilesPath),
            d.sharedTilesPath ? fetchDax(d.sharedTilesPath) : Promise.resolve(new Map<number, Uint8Array>()),
            base.id === 'dok' ? loadDokWallBanks() : Promise.resolve(null),
          ]);
          const allWdIdx = sharedWdIdx.size ? new Map([...sharedWdIdx, ...wdIdx]) : wdIdx;
          const allTileIdx = sharedTilesIdx.size ? new Map([...sharedTilesIdx, ...tiles.blocks]) : tiles.blocks;
          const pairedIds = new Set(listPairedGen1Areas(geoArc.bytes, eclArc.bytes).map((a) => a.id));
          const candidates = listGen1GeoAreas(geoArc.bytes).map((a) => ({
            ...a,
            disk: d.disk,
            hasEcl: pairedIds.has(a.id),
          }));
          const sources: DungeonSources = {
            geoBlock: (id) => geoArc.blocks.get(id) ?? null,
            walldefBlock: (id) => {
              const raw = dokBanks ? dokBanks.walldef.lookup(d.disk, id) : allWdIdx.get(id) ?? null;
              return base.walldefSingleRecord ? (raw?.subarray(0, WALLDEF_RECORD_SIZE) ?? null) : raw;
            },
            tileBlock: (id) => dokBanks ? dokBanks.tiles.lookup(d.disk, id) : (allTileIdx.get(id) ?? null),
            directWallsetTileIds: base.directWallsetTileIds,
          };
          const inspected = candidates.map((a) => {
            const block = eclArc.blocks.get(a.id);
            if (!a.hasEcl || !block) return { ...a, walkable: false };
            try {
              loadDungeon(block, sources, { dialect, fallbackPieces: base.eclFallbackPieces });
              return { ...a, walkable: true };
            } catch {
              return { ...a, walkable: false }; // paired but not independently mountable
            }
          });
          return inspected;
        } catch {
          return []; // a disk's archives failing to fetch just contributes no areas
        }
      }),
    );
    return perDisk.flat().sort((a, b) => a.disk - b.disk || a.id - b.id);
  })();
  gen1AreaListCache.set(base.id, promise);
  return promise;
}

/** ECL dialect for a base game's registry entry — same mapping as {@link eclDialectFor}. */
function eclDialectForBase(base: Gen1BaseGame): EclDialect {
  return base.eclDialect === 'pool'
    ? ECL_POOL
    : base.eclDialect === 'gen1-short-pools'
      ? ECL_GEN1_SHORT_POOLS
    : base.eclDialect === 'gen1-short-treasures'
      ? ECL_GEN1_SHORT_TREASURES
      : base.eclDialect === 'gen1-short-gateway'
        ? ECL_GEN1_SHORT_GATEWAY
        : base.eclDialect === 'gen1-short'
          ? ECL_GEN1_SHORT
          : ECL_GEN1;
}

/**
 * Jump to an arbitrary playable area on a possibly-different disk of the SAME base game — the "walk
 * any area" picker's own switch, generalized from {@link remountChainedArea}'s "fetch a full archive
 * set + re-mount" pattern (that one is keyed by a profile's curated `chainTargets`; this one is keyed
 * by any {@link Gen1DiskSpec} + area id the picker enumerated). Like `dqkExplore.ts`'s `selectMap`,
 * this is a full area switch: fresh `Explorer`/automap/area-memory (NOT a carried-memory chain
 * continuation — picking a different area from the dropdown is "go look at this area", not "continue
 * the walk I was on"). Wall/frame/monster/item archives are re-fetched from the TARGET disk's own
 * paths, since a different disk means genuinely different WALLDEF/8X8D/MON/ITEM files.
 *
 * The Amiga wall-art toggle is retained when the destination is on the same DOS disk calibrated by
 * `GameData.amigaTilesPath` (notably CoK's opening/travel -> ECL1#32 route). It is suppressed on other
 * disks because reusing one disk's Amiga 8X8D archive against different WALLDEF/setBlockIds would be
 * a mismatched guess.
 */
interface Gen1AreaSwitchOptions {
  /** Complete campaign memory snapshot, keyed by the stable map labels used by SaveGame. */
  areaMemory?: Record<string, Record<string, number>>;
  /** Retail NEWECL continuity: the departed area's live global ECL words seed the target area. */
  carriedMemory?: Map<number, number>;
  /** Exact saved current-area memory to mount after initial_entry has selected target resources. */
  restoredMemory?: Map<number, number>;
  /** Saved current-area label to omit from prior buckets when a registry mount uses a new label. */
  restoredAreaName?: string;
  clockMinutes?: number;
  /** Pose to restore after the target retail area has mounted (cross-area Load). */
  pose?: Pose;
  /** Human-facing confirmation emitted after a saved area has mounted. */
  loadedSaveName?: string;
}

function memoryRecord(memory: Map<number, number>): Record<string, number> {
  return Object.fromEntries([...memory].map(([address, value]) => [String(address & 0xffff), value]));
}

function memoryMap(record: Record<string, number> | undefined): Map<number, number> {
  const out = new Map<number, number>();
  for (const [address, value] of Object.entries(record ?? {})) {
    const parsed = Number(address);
    if (Number.isInteger(parsed)) out.set(parsed & 0xffff, value);
  }
  return out;
}

/** Snapshot every departed area plus the live area's latest ECL words before an area re-mount. */
function campaignAreaMemory(): Record<string, Record<string, number>> {
  if (!state) return {};
  return {
    ...(state.priorAreaMemory ?? {}),
    [state.map.name]: memoryRecord(state.areaMemory),
  };
}

async function switchGen1Area(
  baseId: Gen1BaseGameId,
  disk: Gen1DiskSpec,
  areaId: number,
  opts: Gen1AreaSwitchOptions = {},
): Promise<number> {
  const gd = activeGame;
  const out = document.querySelector('#output') as HTMLElement | null;
  const base = GEN1_BASE_GAMES[baseId];
  if (!out || !base) return 0;
  const carriedAreaMemory = opts.areaMemory ?? campaignAreaMemory();
  const priorAreaMemory = opts.restoredAreaName
    ? Object.fromEntries(Object.entries(carriedAreaMemory).filter(([label]) => label !== opts.restoredAreaName))
    : carriedAreaMemory;
  const carriedClock = opts.clockMinutes ?? state?.clockMinutes ?? 6 * 60;
  const mountSeq = ++exploreMountSeq;
  const dialect = eclDialectForBase(base);
  setStatus(`Loading ${base.title} disk ${disk.disk}, area ${areaId}…`);
  campaignRemountPending++;
  try {
    const [eclIdx, geoIdx, wdIdx, sharedWdIdx, tiles, sharedTilesIdx, monIdx, spcBytes, itmBytes, wizBytes, frameArc, dokBanks] = await Promise.all([
      fetchDax(disk.eclPath),
      fetchDax(disk.geoPath),
      fetchDax(disk.walldefPath),
      disk.sharedWalldefPath ? fetchDax(disk.sharedWalldefPath) : Promise.resolve(new Map<number, Uint8Array>()),
      fetchDaxRaw(disk.tilesPath),
      disk.sharedTilesPath ? fetchDax(disk.sharedTilesPath) : Promise.resolve(new Map<number, Uint8Array>()),
      fetchDax(disk.monPath).catch(() => new Map<number, Uint8Array>()),
      disk.spcPath ? readAssetBytes(disk.spcPath).catch(() => new Uint8Array(0)) : Promise.resolve(new Uint8Array(0)),
      disk.itmPath ? readAssetBytes(disk.itmPath).catch(() => new Uint8Array(0)) : Promise.resolve(new Uint8Array(0)),
      disk.wizPath ? readAssetBytes(disk.wizPath).catch(() => new Uint8Array(0)) : Promise.resolve(new Uint8Array(0)),
      disk.framePath ? fetchDaxRaw(disk.framePath).catch(() => null) : Promise.resolve(null),
      baseId === 'dok' ? loadDokWallBanks() : Promise.resolve(null),
    ]);
    if (mountSeq !== exploreMountSeq) return 0;
    // The wall-piece source deliberately stays UNMERGED (`tiles.blocks` only): Treasures' separate
    // font/frame archive (`framePath`) happens to reuse block id 202 for its own "frame" image, which
    // is NOT a standard 8X8D tile bank — `loadDungeonWalls`'s BOOT_8X8D_SET4 (block 0xCA=202) probe
    // would find it and throw ("expected a tile block... got header"). `tlIdx` (merged) stays scoped
    // to font/moon/frame extraction below, which is exactly what needs the merge.
    const baseTiles = dokBanks?.ui.blocks ?? tiles.blocks;
    const tlIdx = frameArc ? new Map([...baseTiles, ...frameArc.blocks]) : baseTiles;
    const allWdIdx = sharedWdIdx.size ? new Map([...sharedWdIdx, ...wdIdx]) : wdIdx;
    const allTileIdx = sharedTilesIdx.size ? new Map([...sharedTilesIdx, ...tiles.blocks]) : tiles.blocks;
    const fontBytes = frameArc ? frameArc.bytes : (dokBanks?.ui.bytes ?? tiles.bytes);
    const areaEclBlock = eclIdx.get(areaId);
    if (!areaEclBlock) throw new Error(`ECL block ${areaId} not found on disk ${disk.disk}`);
    const sources: DungeonSources = {
      geoBlock: (id) => geoIdx.get(id) ?? null,
      walldefBlock: (id) => {
              const raw = dokBanks ? dokBanks.walldef.lookup(disk.disk, id) : allWdIdx.get(id) ?? null;
        return base.walldefSingleRecord ? (raw?.subarray(0, WALLDEF_RECORD_SIZE) ?? null) : raw;
      },
      tileBlock: (id) => dokBanks ? dokBanks.tiles.lookup(disk.disk, id) : (allTileIdx.get(id) ?? null),
      directWallsetTileIds: base.directWallsetTileIds,
    };
    // No `entry` override: the picked block's own standard `initial_entry`, same as
    // `remountChainedArea`'s chained (non-boot) blocks.
    let effectiveCarriedMemory = opts.carriedMemory;
    let dungeon: ReturnType<typeof loadDungeon>;
    // Pool ECL1#24's raw 0x16 entry is vm_run_1 (a resource-clear path); its own header pins the
    // actual initial_entry at raw 0x1DA5/vaddr 0xB6A3. The regional NEWECL host invokes that header
    // entry, which selects GEO24 from [49C5].
    const retailEntry = baseId === 'pool' && areaId === 24 ? 0x1da5 : undefined;
    try {
      dungeon = loadDungeon(areaEclBlock, sources, {
        label: `${base.title} ECL${disk.disk}#${areaId}`,
        memory: effectiveCarriedMemory,
        dialect,
        entry: retailEntry,
        fallbackPieces: base.eclFallbackPieces,
      });
    } catch (err) {
      // CoK ECL3#97 is a documented two-set regional handler: its LOAD_PIECES names set 2 =
      // WALLDEF block 18, but 18 exists on no CoK disk. Its map-owning sibling ECL3#99 proves
      // the inherited [4be7]/[4be8] flags skip that slot, retaining sets 17 and Reset. This is the
      // same evidence-gated fallback used by buildCokWallArtPort; do not generalize it to arbitrary
      // missing WALLDEF ids, which would fabricate wall art.
      const knownTwoSet97 = baseId === 'cok' && disk.disk === 3 && areaId === 97 &&
        /WALLDEF block 18 \(set 2\) not found/.test(err instanceof Error ? err.message : String(err));
      if (!knownTwoSet97) throw err;
      effectiveCarriedMemory = new Map(opts.carriedMemory ?? []);
      effectiveCarriedMemory.set(0x4be7, 1);
      effectiveCarriedMemory.set(0x4be8, 1);
      dungeon = loadDungeon(areaEclBlock, sources, {
        label: `${base.title} ECL${disk.disk}#${areaId} (source-proven two-set wall state)`,
        memory: effectiveCarriedMemory,
        dialect,
        entry: retailEntry,
        fallbackPieces: base.eclFallbackPieces,
      });
    }
    // A profile's Amiga archive is calibrated to its own DOS disk. Preserve the live switch when a
    // retail transition stays on that disk (CoK opening/travel -> ECL1#32); suppress it only for a
    // genuinely different disk where reusing the source would mismatch WALLDEF/tile identities.
    const amigaMatchesDisk = disk.disk === diskNumberFromPath(gd.geoPath);
    const wallGraphics = await buildWallGraphics(
      amigaMatchesDisk ? gd : { ...gd, amigaTilesPath: undefined },
      dungeon.walls,
      dungeon.pieces.setBlockIds,
      allWdIdx,
    );
    const moonTiles = extractMoonTiles(tlIdx, gd.moonTileGroups);
    const frameTiles = extractFrameTiles(tlIdx);
    const font = loadCokFont(fontBytes);
    let monRecords = [...monIdx.entries()]
      .filter(([, raw]) => sniffMonsterRecord(raw, base.profileId))
      .map(([bid, raw]) => decodeMonsterRecord(raw, bid, base.profileId));
    const spcAffects = decodeMonsterSpcArchive(spcBytes);
    monRecords = applyHalfDamageAffect(applyRegenAffect(monRecords, spcAffects), spcAffects);
    monRecords = applyConSavingBonus(monRecords, spcAffects);
    monRecords = applyCloudProtectionAffects(monRecords, spcAffects);
    const itm = decodeMonsterItmArchive(itmBytes, base.profileId);
    monRecords = applyItemPluses(monRecords, itm);
    monRecords = applyCarriedItems(monRecords, itm);
    monRecords = applyPreparedSpellIds(monRecords, decodeMonsterWizArchive(wizBytes));
    const monsterLookup = monsterLookupFromArchive(monRecords);
    const allies = dungeon.npcJoins
      .map(({ npcId, morale }): MonsterRecord | null => {
        const rec = monsterLookup(npcId);
        return rec ? { ...rec, morale } : null;
      })
      .filter((r): r is MonsterRecord => r !== null);
    const bestiary = monRecords.map((m) => ({
      name: m.name,
      ac: m.armorClass,
      thac0: m.thac0,
      damage: `${m.damage.count}d${m.damage.sides}${m.damage.bonus ? `+${m.damage.bonus}` : ''}`,
      combatSize: m.combatSize,
      morale: m.morale,
      itemPluses: m.itemPluses,
      carriedItems: m.carriedItems,
    }));
    let itemDb: ExploreItemRecord[] = [];
    try {
      const itemBytes = (await fetchDaxRaw(disk.itemPath)).bytes;
      itemDb = disk.itemFormat === 'dok-17'
        ? decodeDokItemArchive(itemBytes).map((it) => ({
            name: baseItem(it.baseTypeId)?.name ?? `Item type ${it.baseTypeId}`,
            baseTypeId: it.baseTypeId,
            value: it.value,
          }))
        : decodeItemArchive(itemBytes).map((it) => ({
            name: it.name, baseTypeId: it.baseTypeId, itemTypeId: it.itemTypeId,
            archiveBlockId: it.archiveBlockId, value: 0, count: it.count,
          }));
    } catch {
      itemDb = [];
    }

    if (mountSeq !== exploreMountSeq) return 0;
    state?.surface.dispose();
    state?.automapSurface.dispose();
    out.innerHTML = '';
    // CoK carries local travel arrival in the traditional world-coordinate pair. DoK's short
    // dialect host copies the actual dungeon pose through its own local words [4C17]/[4C18]
    // (ECL1#36's landed re-entry writes 0,1 while [4BC3]/[4BC4] remain world 33,13).
    const poseXAddress = baseId === 'dok' ? 0x4c17 : baseId === 'pool' ? 0xc04b : 0x4bc3;
    const poseYAddress = baseId === 'dok' ? 0x4c18 : baseId === 'pool' ? 0xc04c : 0x4bc4;
    const retailX = effectiveCarriedMemory?.get(poseXAddress);
    const retailY = effectiveCarriedMemory?.get(poseYAddress);
    const retailDirection = effectiveCarriedMemory?.get(0xc04d) ?? 0;
    const retailPose = retailX !== undefined && retailY !== undefined &&
      retailX >= 0 && retailY >= 0 && retailX < dungeon.map.width && retailY < dungeon.map.height
      ? {
          x: retailX,
          y: retailY,
          facing: (['north', 'east', 'south', 'west'][retailDirection & 3] ?? 'north') as Direction,
        }
      : undefined;
    const rendered = mountDungeonView(gd.id, mountSeq, out, {
      map: dungeon.map, walls: dungeon.walls, wallGraphics, areaEcl: areaEclBlock, eclDialect: dialect,
      monsterLookup, monRecords, itemDb, allies, introText: dungeon.introText, bestiary,
      moonTiles, frameTiles, font,
      areaMemorySeed: opts.restoredMemory
        ? new Map(opts.restoredMemory)
        : effectiveCarriedMemory
        ? new Map(effectiveCarriedMemory)
        : memoryMap(carriedAreaMemory[dungeon.map.name]),
      priorAreaMemory,
      currentArea: { disk: disk.disk, areaId },
      // Do not let the boot profile's evidence-checkpoint startPose leak into a later area.
      startPose: opts.pose ?? retailPose ?? chooseStart(dungeon.map),
      clockMinutes: carriedClock,
    });
    if (rendered && opts.loadedSaveName) {
      pushMessage(`Game loaded: ${opts.loadedSaveName}.`);
      draw();
    }
    return rendered;
  } catch (err) {
    if (mountSeq !== exploreMountSeq) return 0;
    setStatus(`Could not load ${base.title} disk ${disk.disk} area ${areaId}: ${err instanceof Error ? err.message : String(err)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  } finally {
    campaignRemountPending--;
  }
}

/**
 * Read-only Gateway ECL6#21 inspection. This fetches the retail disk-6 block independently of the
 * currently mounted post-wilderness Sundabar scene; it does not move the party, mutate save state,
 * present the now-modeled native YES/NO decision interactively, or claim that the six-map
 * wilderness is playable.
 */
async function inspectGatewayWilderness(): Promise<ReturnType<typeof inspectGatewayEcl6Wilderness> | null> {
  if (activeGame.id !== 'gateway') return null;
  const disk = GEN1_BASE_GAMES.gateway.disks.find((candidate) => candidate.disk === 6);
  if (!disk) return null;
  const [ecl, geo] = await Promise.all([fetchDax(disk.eclPath), fetchDax(disk.geoPath)]);
  const block = ecl.get(21);
  if (!block) throw new Error('Gateway ECL6.DAX block 21 not found');
  return inspectGatewayEcl6Wilderness(block, { geoBlock: (id) => geo.get(id) ?? null });
}

function gatewayWildernessChecksum(indices: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const value of indices) {
    hash ^= value;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Deterministic host substitute for Gateway's unrecovered native RNG state. The roll domain is the
 * executable-proven inclusive 0..100; deriving it from persisted controller state keeps save/reload
 * continuation stable without pretending this is the DOS algorithm or probability stream.
 */
function gatewayWildernessEncounterRoll(context: GatewayEcl6EncounterRollContext): number {
  let hash = 0x47415445;
  for (const value of [
    context.selector,
    context.pose.x,
    context.pose.y,
    ['north', 'east', 'south', 'west'].indexOf(context.pose.facing),
    context.descriptor,
    context.counter,
  ]) {
    hash ^= value & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % (context.maximumInclusive + 1);
}

const GATEWAY_ECL6_COMPANION_NAMES: readonly GatewayEcl6CompanionName[] = ['EREK', 'MUTHTUR', 'RISHPAL'];

function gatewayWildernessCompanionsFromMembers(
  members: readonly { name: string }[],
): GatewayEcl6CompanionState[] {
  const names = new Set(members.map((member) => member.name.trim().toUpperCase()));
  return GATEWAY_ECL6_COMPANION_NAMES
    .filter((name) => names.has(name))
    .map((name) => ({ name, active: true }));
}

function gatewayWildernessCompanionsFromParty(): GatewayEcl6CompanionState[] {
  return gatewayWildernessCompanionsFromMembers(getParty());
}

function removeGatewayWildernessPartyCompanion(name: GatewayEcl6CompanionName): void {
  const matchingIndexes = getParty()
    .map((member, index) => ({ index, normalized: member.name.trim().toUpperCase() }))
    .filter((member) => member.normalized === name)
    .map((member) => member.index)
    .reverse();
  for (const index of matchingIndexes) removeFromParty(index);
  if (matchingIndexes.length > 0) {
    // Party persistence is the commit point. A presentation refresh must never turn a successful
    // removal into an exception that rolls back only the wilderness controller.
    try { refreshPartyHud(); } catch { /* the next ordinary HUD refresh will repaint it */ }
  }
}

function gatewayWildernessMemory(state: GatewayEcl6ControllerState): Record<string, number> {
  const facing = ['north', 'east', 'south', 'west'].indexOf(state.pose.facing);
  const selected = gatewayWilderness?.controller.getSelectedMap();
  const descriptor = selected?.map.cells[state.pose.y * 16 + state.pose.x]?.floor ?? 0;
  return {
    [String(GATEWAY_ECL6_GEO_SELECTOR_ADDR)]: state.selector,
    [String(0x4c00)]: state.cadenceCounter,
    [String(0x4c02)]: descriptor & 0x7f,
    [String(GATEWAY_ECL6_TRAVEL_MODE_ADDR)]: state.travelModeWord,
    [String(0x7f80)]: state.suppressNextEncounter ? 0xff : 0,
    [String(0xc04b)]: state.pose.x,
    [String(0xc04c)]: state.pose.y,
    [String(0xc04d)]: facing,
    [String(0xc04f)]: descriptor,
  };
}

function closeGatewayWilderness(): void {
  if (!gatewayWilderness) return;
  window.removeEventListener('keydown', gatewayWilderness.keydown, true);
  gatewayWilderness.promptOverlay?.remove();
  gatewayWilderness.surface.dispose();
  gatewayWilderness.root.remove();
  gatewayWilderness = null;
  (window as unknown as { __explore?: Record<string, unknown> }).__explore = undefined;
}

function gatewayWildernessStatus(message: string): void {
  if (!gatewayWilderness) return;
  gatewayWilderness.live.textContent = message;
  setStatus(message);
}

function drawGatewayWilderness(): void {
  if (!gatewayWilderness) return;
  const web = gatewayWilderness;
  const controllerState = web.controller.serialize();
  const selected = web.controller.getSelectedMap();
  const banks = loadGatewayOverlandBanks(selected.rawPieceOperands, {
    areaTileBlock: (blockId) => web.areaTiles.get(blockId) ?? null,
    bootTileBlock: (blockId) => web.bootTiles.get(blockId) ?? null,
  });
  const view = composeGatewayOverlandWindow(selected.terrainPlane, controllerState.pose, banks);
  const viewport = createFramebuffer(120, 120, 0);
  blitIndexed(viewport, {
    ...view.framebuffer,
    xOffset: 0,
    yOffset: 0,
    palette: null,
    transparentIndex: null,
  }, 8, 8);
  const clockMinutes = minutesFromClock(controllerState.clock);
  const prompt = controllerState.pendingPrompt?.text ?? null;
  const fb = composeExploreScreen({
    frameTiles: web.frameTiles,
    frameLayout: activeGame.frameLayout,
    viewport,
    font: web.font,
    party: compositorParty(),
    position: `GEO6#${controllerState.selector}  ${controllerState.pose.x},${controllerState.pose.y} ${controllerState.pose.facing.toUpperCase()}  ${formatTimeOfDay(clockMinutes)}`,
    message: 'Gateway wilderness\nArrow keys move and turn. Boundary crossings remount the retail GEO sector.',
    prompt: prompt ?? 'WILDERNESS',
  });
  web.surface.paint(fb, GATEWAY_DEMO_PROFILE.screenPalette ?? EGA_PALETTE);
  web.location.dataset.geoBlock = String(controllerState.selector);
  web.location.textContent = `Gateway wilderness · GEO6#${controllerState.selector} · (${controllerState.pose.x},${controllerState.pose.y}) facing ${controllerState.pose.facing} · ${formatGameTime(clockMinutes)}`;
  web.surface.canvas.setAttribute(
    'aria-label',
    `Gateway wilderness GEO6 map ${controllerState.selector}, position ${controllerState.pose.x}, ${controllerState.pose.y}, facing ${controllerState.pose.facing}, ${formatTimeOfDay(clockMinutes)}`,
  );
  web.lastViewport = {
    originX: view.originX,
    originY: view.originY,
    markerCol: view.markerCol,
    markerRow: view.markerRow,
  };
  web.lastFrameChecksum = gatewayWildernessChecksum(fb.indices);
}

function setGatewayWildernessControlsDisabled(disabled: boolean): void {
  if (!gatewayWilderness) return;
  gatewayWilderness.root
    .querySelectorAll<HTMLButtonElement>('.gateway-wilderness-control, .gateway-wilderness-save, .gateway-wilderness-load')
    .forEach((button) => { button.disabled = disabled; });
}

function closeGatewayWildernessPrompt(): void {
  if (!gatewayWilderness?.promptOverlay) return;
  gatewayWilderness.promptGeneration++;
  gatewayWilderness.promptInputReady = false;
  gatewayWilderness.promptOverlay.remove();
  gatewayWilderness.promptOverlay = null;
  setGatewayWildernessControlsDisabled(false);
}

type GatewayPromptActivation = 'pointer' | 'keyboard' | null;

function openGatewayWildernessPrompt(
  prompt: GatewayEcl6PendingPrompt,
  releaseLatch: Exclude<GatewayPromptActivation, null> | null = null,
): void {
  if (!gatewayWilderness || gatewayWilderness.promptOverlay) return;
  const web = gatewayWilderness;
  const generation = ++web.promptGeneration;
  web.promptInputReady = releaseLatch === null;
  const overlay = el('div', 'sheet-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'gateway-wilderness-prompt-title');
  overlay.dataset.promptKind = prompt.kind;
  if (prompt.kind === 'companion') overlay.dataset.pictureId = String(prompt.pictureId);
  const panel = el('div', 'sheet-panel');
  const titleText = prompt.kind === 'sundabar' ? 'Enter Sundabar?'
    : prompt.kind === 'boat-abandon' ? 'Abandon the boat?'
      : `${prompt.companion} cannot continue`;
  const title = el('div', 'gb-dlg-title', titleText);
  title.id = 'gateway-wilderness-prompt-title';
  panel.appendChild(title);
  panel.appendChild(el('p', 'gateway-wilderness-prompt-text', prompt.text));
  const choices = el('div', 'cok-travel-choices');
  const labels = prompt.kind === 'companion' ? prompt.choices : ['YES', 'NO'] as const;
  const buttons = labels.map((label, choiceIndex) => {
    const legacySundabarClass = prompt.kind === 'sundabar'
      ? ` gateway-sundabar-${choiceIndex === 0 ? 'yes' : 'no'}`
      : '';
    const button = el('button', `gb-btn gateway-wilderness-choice${legacySundabarClass}`, label) as HTMLButtonElement;
    button.type = 'button';
    if (releaseLatch !== null) button.setAttribute('aria-disabled', 'true');
    const activate = (activation: GatewayPromptActivation): void => {
      if (gatewayWilderness !== web || !web.promptInputReady || web.promptGeneration !== generation) return;
      void resolveGatewayWildernessPrompt(choiceIndex as 0 | 1, activation);
    };
    // Resolve pointer choices on press, before release. If that choice mounts a second ordered
    // companion prompt, the new dialog can then observe the matching pointerup and require a fresh
    // press. Mouse click-count >1 is ignored as one physical double-click sequence.
    button.addEventListener('mousedown', (event) => {
      if (event.button !== 0 || event.detail > 1 || event.ctrlKey || event.metaKey || event.altKey) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      activate('pointer');
    });
    button.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      activate('pointer');
    });
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      activate('keyboard');
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      // Mouse/touch and real keyboard activation are handled before release above. Keep detail=0
      // for assistive technology and the explicit test seam, where no pending release exists.
      if (event.detail === 0) activate(null);
    });
    choices.appendChild(button);
    return button;
  });
  overlay.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    event.stopPropagation();
    const current = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const next = event.shiftKey ? (current + buttons.length - 1) % buttons.length : (current + 1) % buttons.length;
    buttons[next]?.focus();
  });
  panel.appendChild(choices);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  web.promptOverlay = overlay;
  setGatewayWildernessControlsDisabled(true);
  buttons[0]?.focus();
  if (releaseLatch !== null) {
    const releaseEvent = releaseLatch === 'pointer' ? 'pointerup' : 'keyup';
    window.addEventListener(releaseEvent, () => {
      if (gatewayWilderness !== web || web.promptOverlay !== overlay || web.promptGeneration !== generation) return;
      web.promptInputReady = true;
      buttons.forEach((button) => button.removeAttribute('aria-disabled'));
      buttons[0]?.focus();
    }, { capture: true, once: true });
  }
}

async function resolveGatewayWildernessPrompt(
  choiceIndex: 0 | 1,
  activation: GatewayPromptActivation = null,
): Promise<void> {
  if (!gatewayWilderness || gatewayWilderness.busy) return;
  const web = gatewayWilderness;
  const before = web.controller.serialize();
  const transitionCountBefore = web.transitionCount;
  const prompt = before.pendingPrompt;
  if (!prompt) return;
  web.busy = true;
  try {
    const result = prompt.kind === 'sundabar' ? web.controller.resolveSundabarChoice(choiceIndex)
      : prompt.kind === 'boat-abandon' ? web.controller.resolveBoatAbandonChoice(choiceIndex)
        : web.controller.resolveCompanionChoice(choiceIndex);
    const removesCompanion = prompt.kind === 'companion' && choiceIndex === 0 &&
      !result.state.companions.some((companion) => companion.name === prompt.companion);

    if (prompt.kind === 'sundabar' && choiceIndex === 1) {
      closeGatewayWildernessPrompt();
      web.busy = false;
      gatewayWildernessStatus('You remain in the wilderness outside Sundabar.');
      drawGatewayWilderness();
      web.surface.canvas.focus();
      return;
    }
    if (prompt.kind === 'sundabar') {
      if (result.chain?.gameArea !== 5 || result.chain.eclBlockId !== 19) {
        throw new Error('Sundabar YES did not produce the retail area-5/ECL19 chain');
      }
      gatewayWildernessStatus('Entering Sundabar…');
      const source = activeAssetSource ?? undefined;
      const url = new URL(window.location.href);
      url.searchParams.delete('wilderness');
      url.searchParams.delete('load');
      url.searchParams.set('explore', 'gateway');
      window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
      await startExplore('gateway', source);
      return;
    }

    closeGatewayWildernessPrompt();
    if (result.remount) web.transitionCount++;
    web.busy = false;
    drawGatewayWilderness();
    const message = result.prompt ? result.prompt.text
      : result.remount ? `Crossed into GEO6#${result.remount.toSelector}.`
        : result.encounter?.encounter ? 'A wandering encounter was selected; choose ATTACK or FLEE.'
          : prompt.kind === 'boat-abandon' && choiceIndex === 0 ? 'The boat is left behind and travel continues on foot.'
            : prompt.kind === 'boat-abandon' ? 'You remain in the boat.'
              : choiceIndex === 0 ? `${prompt.companion} leaves the party.`
                : `${prompt.companion} remains with the party.`;
    gatewayWildernessStatus(message);
    if (result.prompt) openGatewayWildernessPrompt(result.prompt, activation);
    else if (result.encounter?.encounter) openGatewayWildernessEncounter(result);
    else web.surface.canvas.focus();
    // Commit the persisted roster only after every controller validation and potentially-throwing
    // presentation operation has succeeded. removeGatewayWildernessPartyCompanion is no-throw.
    if (removesCompanion) removeGatewayWildernessPartyCompanion(prompt.companion);
  } catch (error) {
    if (gatewayWilderness === web) {
      web.controller = GatewayEcl6WildernessController.restore(
        web.ecl,
        { geoBlock: (blockId) => web.geo.get(blockId) ?? null },
        before,
        { rollEncounter: gatewayWildernessEncounterRoll },
      );
      web.transitionCount = transitionCountBefore;
      web.busy = false;
      drawGatewayWilderness();
      gatewayWildernessStatus(`Could not resolve Gateway prompt: ${error instanceof Error ? error.message : String(error)}`);
      if (!web.promptOverlay) openGatewayWildernessPrompt(prompt);
    }
  }
}

type GatewayWildernessMove = 'left' | 'forward' | 'right' | 'around';

/** Execute Gateway ECL6#21's own hit arm and hand its roster to the shared tactical overlay. */
function openGatewayWildernessEncounter(result: GatewayEcl6ControllerResult): void {
  if (!gatewayWilderness || gatewayWilderness.busy || !result.encounter?.encounter) return;
  const web = gatewayWilderness;
  const encounterPose = result.state.pose;
  let randomState = (
    0x47415445 ^
    (result.state.selector << 24) ^
    (encounterPose.x << 16) ^
    (encounterPose.y << 8) ^
    minutesFromClock(result.state.clock)
  ) >>> 0;
  const rollRandomInclusive = (maximumInclusive: number): number => {
    const forced = web.forcedEncounterInnerRolls?.shift();
    if (forced !== undefined) return forced;
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState % (maximumInclusive + 1);
  };
  const memory = new Map<number, number>([[0x4c00, result.encounter.counterAfter]]);
  try {
    const runner = createGatewayEcl6EncounterRunner(web.ecl, result.encounter.descriptor, {
      memory,
      rollRandomInclusive,
      travelModeWord: result.state.travelModeWord,
    });
    const first = runner.start();
    if (first.kind !== 'say' || JSON.stringify(first.choices) !== JSON.stringify(['ATTACK', 'FLEE'])) {
      throw new Error('retail encounter arm did not reach ATTACK/FLEE');
    }
    web.busy = true;
    openDialogueAt(runner, first, {
      title: 'Gateway · Wilderness encounter',
      spawn: (roster): DialogueCombat => {
        const list = [...roster];
        const party = partySize() > 0
          ? partyCombatants()
          : DEMO_PARTY.map((spec) => partyCombatant(spec, addnd1e));
        const { enemies } = spawnEnemies(list, web.monsterLookup);
        const currentCity = memory.get(GATEWAY_ECL6_CURRENT_CITY_ADDR);
        if (currentCity === undefined) throw new Error('retail encounter arm did not write current_city');
        const combatMap = buildGatewayWildernessCombatMap({
          currentCity,
          rng: { rollDie: (sides) => rollRandomInclusive(Math.max(0, sides - 1)) + 1 },
        });
        return {
          party,
          enemies,
          assets: web.combatAssets,
          names: encounterNames(party, list, web.monsterLookup),
          intro: enemies.length === 1 ? `A ${enemies[0]!.name} attacks!` : 'Wilderness monsters attack!',
          seed: randomState,
          day: gameDayFromMinutes(minutesFromClock(result.state.clock)),
          mapDirection: FACING_NUM[encounterPose.facing],
          terrain: combatMap.terrain,
          backgroundIds: combatMap.backgroundIds,
          partyAnchor: combatMap.partyAnchor,
          enemyAnchor: combatMap.enemyAnchor,
          // Gateway ovr012's placement tables/formulas match CoAB. Its ordinary ECL6 2-D battle
          // snapshots the live pose as the floor origin, so mapPos-floorOrigin is exactly zero.
          coabSourcePlacement: true,
          coabPartyStart: { col: 0, row: 0 },
          // Gateway's cast/death/expiry/restore overlays independently prove the same 1C/1E/1F
          // Cloudkill/Stinking/downed tile contract over its byte-identical resident tile entries.
          coabTileMutations: true,
        };
      },
      onClose: () => {
        if (gatewayWilderness !== web) return;
        web.busy = false;
        web.forcedEncounterInnerRolls = null;
        drawGatewayWilderness();
        gatewayWildernessStatus('The wilderness encounter is over; travel may continue.');
        web.surface.canvas.focus();
      },
    });
  } catch (error) {
    web.busy = false;
    web.forcedEncounterInnerRolls = null;
    gatewayWildernessStatus(`Could not open Gateway encounter: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function applyGatewayWildernessMove(action: GatewayWildernessMove): GatewayEcl6ControllerResult | null {
  if (!gatewayWilderness || gatewayWilderness.busy || gatewayWilderness.controller.serialize().phase !== 'active') return null;
  const web = gatewayWilderness;
  let result: GatewayEcl6ControllerResult;
  if (action === 'left') result = web.controller.turnLeft();
  else if (action === 'right') result = web.controller.turnRight();
  else if (action === 'around') result = web.controller.turnAround();
  else result = web.controller.forward();
  if (result.remount) web.transitionCount++;
  if (action === 'forward' && !result.encounter?.encounter) web.forcedEncounterInnerRolls = null;
  const state = result.state;
  const message = result.prompt ? result.prompt.text
    : result.message ? result.message
      : result.remount ? `Crossed into GEO6#${result.remount.toSelector}.`
      : result.blocked === 'avalanche' ? 'The pass ahead is blocked by an avalanche.'
        : result.blocked === 'wall' ? 'The terrain blocks your way.'
          : result.blocked === 'edge' ? 'There is no mapped crossing here.'
            : result.encounter?.encounter ? 'A wandering encounter was selected; choose ATTACK or FLEE.'
              : result.moved ? `Travelled to (${state.pose.x},${state.pose.y}); ${formatTimeOfDay(minutesFromClock(state.clock))}.`
                : `Facing ${state.pose.facing}.`;
  gatewayWildernessStatus(message);
  drawGatewayWilderness();
  if (result.prompt) openGatewayWildernessPrompt(result.prompt);
  else if (result.encounter?.encounter) openGatewayWildernessEncounter(result);
  return result;
}

function saveGatewayWilderness(): boolean {
  if (!gatewayWilderness || gatewayWilderness.busy || gatewayWilderness.controller.serialize().phase !== 'active') return false;
  const state = gatewayWilderness.controller.serialize();
  const clockMinutes = minutesFromClock(state.clock);
  saveToSlot(GATEWAY_WILDERNESS_SLOT, {
    name: `${GATEWAY_WILDERNESS_AREA} — ${formatGameTime(clockMinutes)}`,
    position: {
      area: GATEWAY_WILDERNESS_AREA,
      disk: 6,
      areaId: 21,
      x: state.pose.x,
      y: state.pose.y,
      facing: state.pose.facing,
    },
    clockMinutes,
    savedAt: clockMinutes,
    areaMemory: { [GATEWAY_WILDERNESS_AREA]: gatewayWildernessMemory(state) },
  });
  gatewayWildernessStatus(`Wilderness saved at GEO6#${state.selector}, (${state.pose.x},${state.pose.y}).`);
  return true;
}

function loadGatewayWilderness(): boolean {
  if (!gatewayWilderness || gatewayWilderness.busy || gatewayWilderness.controller.serialize().phase !== 'active') return false;
  const saved = readSlot(GATEWAY_WILDERNESS_SLOT);
  const pos = saved?.position;
  const memory = saved?.areaMemory[GATEWAY_WILDERNESS_AREA];
  if (!saved || !pos || pos.area !== GATEWAY_WILDERNESS_AREA || pos.disk !== 6 || pos.areaId !== 21 || !memory) {
    gatewayWildernessStatus('No valid Gateway wilderness save is available.');
    return false;
  }
  const selector = memory[String(GATEWAY_ECL6_GEO_SELECTOR_ADDR)];
  const cadenceCounter = memory[String(0x4c00)] ?? 0;
  const suppressNextEncounter = memory[String(0x7f80)] === 0xff;
  const travelModeWord = memory[String(GATEWAY_ECL6_TRAVEL_MODE_ADDR)] ?? 0;
  try {
    const state = createGatewayEcl6ControllerState(
      selector,
      { x: pos.x, y: pos.y, facing: pos.facing },
      {
        clock: clockFromMinutes(saved.clockMinutes),
        cadenceCounter,
        suppressNextEncounter,
        travelModeWord,
        companions: gatewayWildernessCompanionsFromMembers(saved.party),
      },
    );
    const candidate = new GatewayEcl6WildernessController(
      gatewayWilderness.ecl,
      { geoBlock: (blockId) => gatewayWilderness?.geo.get(blockId) ?? null },
      state,
      { rollEncounter: gatewayWildernessEncounterRoll },
    );
    // Only a fully validated Gateway candidate may mutate the shared party/inventory/journal stores.
    applySave(saved);
    try { refreshPartyHud(); } catch { /* controller and persisted stores remain the source of truth */ }
    gatewayWilderness.controller = candidate;
    gatewayWilderness.transitionCount = 0;
    closeGatewayWildernessPrompt();
    drawGatewayWilderness();
    gatewayWildernessStatus(`Wilderness loaded at GEO6#${selector}, (${pos.x},${pos.y}).`);
    gatewayWilderness.surface.canvas.focus();
    return true;
  } catch (error) {
    gatewayWildernessStatus(`Could not load wilderness save: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

async function startGatewayEcl6Wilderness(mountSeq: number, restoreSaved: boolean): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement | null;
  const disk = GEN1_BASE_GAMES.gateway.disks.find((candidate) => candidate.disk === 6);
  if (!out || !disk?.framePath) return 0;
  out.innerHTML = '';
  setStatus('Loading Gateway ECL6 wilderness…');
  try {
    const [ecl, geo, areaTiles, bootTiles, mon, spcBytes, itmBytes, combatAssets] = await Promise.all([
      fetchDax(disk.eclPath),
      fetchDax(disk.geoPath),
      fetchDaxRaw(disk.tilesPath),
      fetchDaxRaw(disk.framePath),
      fetchDax(disk.monPath),
      disk.spcPath ? readAssetBytes(disk.spcPath) : Promise.resolve(new Uint8Array(0)),
      disk.itmPath ? readAssetBytes(disk.itmPath) : Promise.resolve(new Uint8Array(0)),
      loadCombatAssets({
        tilesPath: GATEWAY_DEMO_PROFILE.combatPaths!.tilesPath,
        iconPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/CPIC6.DAX',
        dungcomPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/WILDCOM.DAX',
        randcomPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Gateway to the Savage Frontier/RANDCOM.DAX',
        frameLayout: GATEWAY_DEMO_PROFILE.combatPaths!.frameLayout!,
        palette: GATEWAY_DEMO_PROFILE.combatPaths!.palette!,
        iconTransparentIndices: GATEWAY_DEMO_PROFILE.combatPaths!.iconTransparentIndices!,
        iconIndexRemap: GATEWAY_DEMO_PROFILE.combatPaths!.iconIndexRemap!,
      }),
    ]);
    if (mountSeq !== exploreMountSeq) return 0;
    const block = ecl.get(21);
    if (!block) throw new Error('Gateway ECL6.DAX block 21 is missing');
    const initial = createGatewayEcl6ControllerState(
      24,
      { x: 8, y: 2, facing: 'west' },
      {
        clock: [...GATEWAY_WILDERNESS_START_CLOCK],
        cadenceCounter: 3,
        companions: gatewayWildernessCompanionsFromParty(),
      },
    );
    const controller = new GatewayEcl6WildernessController(
      block,
      { geoBlock: (blockId) => geo.get(blockId) ?? null },
      initial,
      { rollEncounter: gatewayWildernessEncounterRoll },
    );
    let monRecords = [...mon.entries()]
      .filter(([, raw]) => sniffMonsterRecord(raw, GEN1_BASE_GAMES.gateway.profileId))
      .map(([blockId, raw]) => decodeMonsterRecord(raw, blockId, GEN1_BASE_GAMES.gateway.profileId));
    const spcAffects = decodeMonsterSpcArchive(spcBytes);
    monRecords = applyHalfDamageAffect(applyRegenAffect(monRecords, spcAffects), spcAffects);
    monRecords = applyConSavingBonus(monRecords, spcAffects);
    monRecords = applyCloudProtectionAffects(monRecords, spcAffects);
    const monsterItems = decodeMonsterItmArchive(itmBytes, GEN1_BASE_GAMES.gateway.profileId);
    monRecords = applyItemPluses(monRecords, monsterItems);
    monRecords = applyCarriedItems(monRecords, monsterItems);
    const monsterLookup = monsterLookupFromArchive(monRecords);

    const root = el('div', 'gb-screen gateway-wilderness');
    const frame = el('div', 'gb-frame');
    frame.appendChild(el('div', 'gb-panel-h', 'Gateway to the Savage Frontier · ECL6 wilderness'));
    const emu = el('div', 'gb-emu');
    const surface = createScreenSurface(DOS_EGA);
    surface.canvas.tabIndex = 0;
    surface.canvas.setAttribute('role', 'img');
    emu.appendChild(surface.canvas);
    frame.appendChild(emu);
    const location = el('div', 'muted gateway-wilderness-location');
    frame.appendChild(location);
    const controls = el('div', 'cok-travel-choices');
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Wilderness movement');
    const addButton = (label: string, action: GatewayWildernessMove) => {
      const button = el('button', 'gb-btn gateway-wilderness-control', label) as HTMLButtonElement;
      button.type = 'button';
      button.addEventListener('click', () => applyGatewayWildernessMove(action));
      controls.appendChild(button);
      return button;
    };
    addButton('Turn left', 'left');
    const forwardButton = addButton('Forward', 'forward');
    addButton('Turn right', 'right');
    addButton('Turn around', 'around');
    const saveButton = el('button', 'gb-btn gateway-wilderness-save', 'Save wilderness') as HTMLButtonElement;
    const loadButton = el('button', 'gb-btn gateway-wilderness-load', 'Load wilderness') as HTMLButtonElement;
    saveButton.type = loadButton.type = 'button';
    saveButton.addEventListener('click', () => saveGatewayWilderness());
    loadButton.addEventListener('click', () => loadGatewayWilderness());
    controls.append(saveButton, loadButton);
    frame.appendChild(controls);
    const live = el('div', 'muted gateway-wilderness-live');
    live.setAttribute('aria-live', 'polite');
    frame.appendChild(live);
    root.appendChild(frame);
    out.appendChild(root);

    const keydown = (event: KeyboardEvent): void => {
      if (!gatewayWilderness || !document.body.contains(gatewayWilderness.surface.canvas)) return;
      if (gatewayWilderness.promptOverlay) {
        if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !gatewayWilderness.promptInputReady) return;
        const pending = gatewayWilderness.controller.serialize().pendingPrompt;
        const choice = event.key === 'Escape' ? 1
          : pending?.kind === 'companion'
            ? event.key === 'c' || event.key === 'C' ? 0 : event.key === 'g' || event.key === 'G' ? 1 : null
            : event.key === 'y' || event.key === 'Y' ? 0 : event.key === 'n' || event.key === 'N' ? 1 : null;
        if (choice === null) return;
        event.preventDefault();
        event.stopPropagation();
        void resolveGatewayWildernessPrompt(choice, 'keyboard');
        return;
      }
      const action = event.key === 'ArrowUp' ? 'forward' : event.key === 'ArrowLeft' ? 'left'
        : event.key === 'ArrowRight' ? 'right' : event.key === 'ArrowDown' ? 'around' : null;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      applyGatewayWildernessMove(action);
    };
    window.addEventListener('keydown', keydown, true);
    gatewayWilderness = {
      controller,
      ecl: block,
      geo,
      areaTiles: areaTiles.blocks,
      bootTiles: bootTiles.blocks,
      monsterLookup,
      combatAssets,
      surface,
      frameTiles: extractFrameTiles(bootTiles.blocks),
      font: loadCokFont(bootTiles.bytes),
      root,
      location,
      live,
      keydown,
      promptOverlay: null,
      promptGeneration: 0,
      promptInputReady: false,
      transitionCount: 0,
      lastViewport: { originX: 0, originY: 0, markerCol: 0, markerRow: 0 },
      lastFrameChecksum: 0,
      forcedEncounterInnerRolls: null,
      busy: false,
    };
    drawGatewayWilderness();
    if (restoreSaved) loadGatewayWilderness();

    (window as unknown as { __explore?: Record<string, unknown> }).__explore = {
      mode: () => 'gateway-ecl6-wilderness',
      getPose: () => gatewayWilderness?.controller.serialize().pose ?? null,
      currentArea: () => ({ disk: 6, areaId: 21 }),
      submap: () => gatewayWilderness?.controller.serialize().selector ?? null,
      clockMinutes: () => gatewayWilderness ? minutesFromClock(gatewayWilderness.controller.serialize().clock) : null,
      transitionCount: () => gatewayWilderness?.transitionCount ?? 0,
      frameChecksum: () => gatewayWilderness?.lastFrameChecksum ?? 0,
      viewportInfo: () => gatewayWilderness ? { ...gatewayWilderness.lastViewport } : null,
      areaMemory: (address: number) => gatewayWilderness
        ? gatewayWildernessMemory(gatewayWilderness.controller.serialize())[String(address & 0xffff)] ?? 0
        : 0,
      move: (action: GatewayWildernessMove) => applyGatewayWildernessMove(action),
      save: () => saveGatewayWilderness(),
      load: () => loadGatewayWilderness(),
      hasSave: () => hasSlot(GATEWAY_WILDERNESS_SLOT),
      promptOpen: () => gatewayWilderness?.controller.serialize().pendingPrompt !== null,
      promptInfo: () => gatewayWilderness?.controller.serialize().pendingPrompt ?? null,
      companionNames: () => gatewayWilderness?.controller.serialize().companions.map((companion) => companion.name) ?? [],
      combatOpen: () => isCombatOpen(),
      /** Test-only boundary seed; real controls still perform the transition being asserted. */
      setStateForTest: (selector: number, pose: Pose) => {
        if (!gatewayWilderness) return false;
        gatewayWilderness.forcedEncounterInnerRolls = null;
        const current = gatewayWilderness.controller.serialize();
        const seeded = createGatewayEcl6ControllerState(selector, pose, {
          clock: current.clock,
          cadenceCounter: current.cadenceCounter,
          suppressNextEncounter: current.suppressNextEncounter,
          travelModeWord: current.travelModeWord,
          companions: current.companions,
        });
        gatewayWilderness.controller = new GatewayEcl6WildernessController(
          gatewayWilderness.ecl,
          { geoBlock: (blockId) => gatewayWilderness?.geo.get(blockId) ?? null },
          seeded,
          { rollEncounter: gatewayWildernessEncounterRoll },
        );
        drawGatewayWilderness();
        return true;
      },
      /** Test-only legal-pose seed for the independently proven encounter handoff. */
      setEncounterStateForTest: (selector: number, pose: Pose, outerRoll: number, innerRolls: number[]) => {
        if (!gatewayWilderness || !Number.isInteger(outerRoll) || outerRoll < 0 || outerRoll > 100) return false;
        const current = gatewayWilderness.controller.serialize();
        const seeded = createGatewayEcl6ControllerState(selector, pose, {
          clock: current.clock,
          cadenceCounter: 3,
          travelModeWord: current.travelModeWord,
          companions: current.companions,
        });
        gatewayWilderness.controller = new GatewayEcl6WildernessController(
          gatewayWilderness.ecl,
          { geoBlock: (blockId) => gatewayWilderness?.geo.get(blockId) ?? null },
          seeded,
          { rollEncounter: () => outerRoll },
        );
        gatewayWilderness.forcedEncounterInnerRolls = [...innerRolls];
        drawGatewayWilderness();
        return true;
      },
      /** Test-only active-companion seed; visible controls still execute the real guarded exit. */
      setExitStateForTest: (selector: number, pose: Pose, companions: GatewayEcl6CompanionState[]) => {
        if (!gatewayWilderness || !Array.isArray(companions)) return false;
        const current = gatewayWilderness.controller.serialize();
        const seeded = createGatewayEcl6ControllerState(selector, pose, {
          clock: current.clock,
          cadenceCounter: 0,
          travelModeWord: current.travelModeWord,
          companions,
        });
        gatewayWilderness.controller = new GatewayEcl6WildernessController(
          gatewayWilderness.ecl,
          { geoBlock: (blockId) => gatewayWilderness?.geo.get(blockId) ?? null },
          seeded,
          { rollEncounter: gatewayWildernessEncounterRoll },
        );
        gatewayWilderness.transitionCount = 0;
        gatewayWilderness.forcedEncounterInnerRolls = null;
        closeGatewayWildernessPrompt();
        drawGatewayWilderness();
        return true;
      },
      /** Test-only travel-word seed for the byte-proven boat terrain branch. */
      setBoatStateForTest: (selector: number, pose: Pose, travelModeWord: number) => {
        if (!gatewayWilderness || !Number.isInteger(travelModeWord) || travelModeWord < 0 || travelModeWord > 0xffff) {
          return false;
        }
        const current = gatewayWilderness.controller.serialize();
        const seeded = createGatewayEcl6ControllerState(selector, pose, {
          clock: current.clock,
          cadenceCounter: 0,
          travelModeWord,
          companions: current.companions,
        });
        gatewayWilderness.controller = new GatewayEcl6WildernessController(
          gatewayWilderness.ecl,
          { geoBlock: (blockId) => gatewayWilderness?.geo.get(blockId) ?? null },
          seeded,
          { rollEncounter: gatewayWildernessEncounterRoll },
        );
        gatewayWilderness.transitionCount = 0;
        gatewayWilderness.forcedEncounterInnerRolls = null;
        closeGatewayWildernessPrompt();
        drawGatewayWilderness();
        return true;
      },
    };
    (window as unknown as { __rendered: number }).__rendered = 1;
    gatewayWildernessStatus('Gateway wilderness ready. Use the arrow keys or visible movement controls.');
    forwardButton.focus();
    return 256;
  } catch (error) {
    if (mountSeq !== exploreMountSeq) return 0;
    setStatus(`Could not load Gateway wilderness: ${error instanceof Error ? error.message : String(error)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }
}

/**
 * Show a structurally valid GEO block when its ECL cannot safely boot a first-person scene.
 *
 * This is intentionally an atlas, not a fallback dungeon mount: a raw GEO block contains walls
 * and doors but does not select the WALLDEF/8X8D banks needed by the original renderer.  Drawing
 * the fully revealed top-down geometry is useful and exact; inventing a first-person bank would
 * reintroduce the garbled graphics this picker is designed to avoid.
 */
async function showRawGen1Map(baseId: Gen1BaseGameId, disk: Gen1DiskSpec, areaId: number): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement | null;
  const base = GEN1_BASE_GAMES[baseId];
  if (!out || !base) return 0;
  const mountSeq = ++exploreMountSeq;
  setStatus(`Loading raw ${base.title} map ${areaId}…`);
  try {
    const geo = await fetchDaxRaw(disk.geoPath);
    if (mountSeq !== exploreMountSeq) return 0;
    const raw = geo.blocks.get(areaId);
    if (!raw) throw new Error(`GEO block ${areaId} not found on disk ${disk.disk}`);
    const { map } = decodeGeoBlock(raw, `${base.title} GEO${disk.disk}#${areaId}`);
    state?.surface.dispose();
    state?.automapSurface.dispose();
    state = null;
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
    out.innerHTML = '';

    const screen = el('div', 'gb-screen');
    const frame = el('div', 'gb-frame');
    frame.appendChild(el('div', 'gb-panel-h', `${base.title} raw GEO map · Disk ${disk.disk}, Map ${areaId} (${map.width}×${map.height})`));
    const emu = el('div', 'gb-emu');
    const surface = createScreenSurface(DOS_EGA);
    surface.canvas.classList.add('gb-automap');
    emu.appendChild(surface.canvas);
    frame.appendChild(emu);
    const picker = buildGen1AreaPicker(baseId, { disk: disk.disk, areaId });
    if (picker) frame.appendChild(picker);
    frame.appendChild(el('div', 'muted', 'Read-only GEO atlas: all cells are revealed. This map has no safe ECL boot, so Greybox does not guess first-person wall art.'));
    screen.appendChild(frame);
    out.appendChild(screen);
    surface.paint(composeAutomapPanel({
      map,
      automap: { isVisited: () => true, getNote: () => null },
      status: `RAW GEO ${areaId} · NO ECL BOOT`,
    }), EGA_PALETTE);
    setStatus(`Viewing raw ${base.title} GEO map ${areaId}; no ECL boot is available.`);
    return map.width * map.height;
  } catch (error) {
    if (mountSeq === exploreMountSeq) setStatus(`Could not load raw map ${areaId}: ${error instanceof Error ? error.message : String(error)}`, 'error');
    return 0;
  }
}

/**
 * Build the "walk any area" dropdown (`.gb-mappicker`, matching `dqkExplore.ts`'s own map picker
 * class/structure) for a Gen1 dungeon view. Purely additive: appended into the mounted screen's
 * `frame` after the (optional) graphics bar. Populated ASYNCHRONOUSLY — `listAllGen1Areas` fetches
 * and decodes every disk's GEO+ECL archives, which is too slow to block the synchronous mount — so the
 * `<select>` starts with a single "Loading areas…" placeholder option and is filled in once the listing
 * resolves. Returns null (nothing appended) when `gameId` has no registered base game.
 */
function buildGen1AreaPicker(gameId: GameId, currentArea: { disk: number; areaId: number } | undefined): HTMLElement | null {
  const baseId = baseGameForExplore(gameId);
  if (!baseId) return null;
  const base = GEN1_BASE_GAMES[baseId];
  const thisMountSeq = exploreMountSeq;

  const picker = el('div', 'gb-mappicker');
  picker.appendChild(el('span', 'gb-scaler-label', 'Dungeon area'));
  const sel = el('select', '') as HTMLSelectElement;
  sel.id = 'gen1-areasel';
  const loadingOpt = document.createElement('option');
  loadingOpt.textContent = 'Loading areas…';
  sel.appendChild(loadingOpt);
  sel.disabled = true;
  picker.appendChild(sel);

  void listAllGen1Areas(base).then((areas) => {
    // A newer mount (or area switch) has already superseded this one — the picker it built has its
    // own async population in flight; don't clobber that one's (possibly different) DOM.
    if (thisMountSeq !== exploreMountSeq || !document.body.contains(sel)) return;
    sel.innerHTML = '';
    sel.disabled = areas.length === 0;
    if (areas.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'No other playable areas found';
      sel.appendChild(opt);
      return;
    }
    for (const a of areas) {
      const opt = document.createElement('option');
      opt.value = `${a.disk}:${a.id}`;
      opt.textContent = a.walkable
        ? `Disk ${a.disk} — Area ${a.id} (${a.width}×${a.height})`
        : `Disk ${a.disk} — Map ${a.id} (${a.width}×${a.height}; ${a.hasEcl ? 'scripted/event entry' : 'no ECL boot'})`;
      if (currentArea && a.disk === currentArea.disk && a.id === currentArea.areaId) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', () => {
      const [diskStr, idStr] = sel.value.split(':');
      const disk = base.disks.find((d) => d.disk === Number(diskStr));
      if (!disk) return;
      const selected = areas.find((a) => a.disk === Number(diskStr) && a.id === Number(idStr));
      if (!selected) return;
      if (selected.walkable) void switchGen1Area(baseId, disk, selected.id);
      else void showRawGen1Map(baseId, disk, selected.id);
    });
  });

  return picker;
}

/**
 * ADR-0009 wilderness-transition route (`coab-natural-3`) — boot a cross-archive `GameData.archiveSet`
 * profile. Eager-loads every declared `game_area`'s archives ({@link loadArchiveSet}), then drives the
 * start area's own ECL init block through the SAME real menu choices the engine golden
 * (`dungeonEvents.test.ts`) proved reach a real `NEWECL` out of the start archive, through the
 * wilderness hub, into the target archive — via the normal interactive dialogue overlay so a real
 * player (or e2e via `window.__dialogue`) drives it, not a synthetic map seam. Once the chain lands
 * (status `'exited'`), hands off to {@link mountCrossedDungeon} to build the landed area's real walkable
 * GEO dungeon through the shared {@link mountDungeonView} tail.
 */
async function startCrossArchiveExplore(
  gd: GameData,
  gameId: GameId,
  mountSeq: number,
  archiveSet: NonNullable<GameData['archiveSet']>,
): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus(`Loading ${gd.title} (game_area ${archiveSet.areas.join('/')})…`);

  let archives: Map<number, ArchiveSetArea>;
  try {
    archives = await loadArchiveSet(archiveSet);
  } catch (err) {
    if (mountSeq !== exploreMountSeq) return 0;
    setStatus(`Could not load archive set: ${err instanceof Error ? err.message : String(err)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }
  if (mountSeq !== exploreMountSeq) return 0;

  const startArea = archives.get(archiveSet.startGameArea);
  const startBlock = startArea?.ecl.get(gd.eclInitBlock);
  if (!startArea || !startBlock) {
    setStatus(`Could not load dungeon: game_area ${archiveSet.startGameArea} block ${gd.eclInitBlock} not found`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const eclDialect = eclDialectFor(gd);
  const startAreaLabel = `${gd.title} game_area ${archiveSet.startGameArea}`;
  const machine = new ChainDialogueMachine(
    gd.eclInitBlock,
    (id) => startArea.ecl.get(id),
    {
      memory: new Map<number, number>(gd.eclInitialMemory ?? []),
      seed: 1,
      dialect: eclDialect,
      // Mirrors the ADR-0009 golden (`dungeonEvents.test.ts`): the real path's first menu choice
      // walks through an ordinary empty roadside ambush before reaching the SAVE/NEWECL out of the
      // start archive. `autoCombat: true` resolves that (and any other incidental encounter along
      // the crossing) the same conservative way the golden does, so the crossing dialogue only ever
      // surfaces the three real "press on" menu pauses, not an unrelated combat UI mid-crossing.
      autoCombat: true,
      areaSource: archiveSetToAreaSource(archives),
      startGameArea: archiveSet.startGameArea,
      maxBlocks: 32,
    },
    startAreaLabel,
  );
  const runner = new DialogueRunner(machine);
  const first = runner.start();

  const finish = async (): Promise<number> => {
    if (mountSeq !== exploreMountSeq) return 0;
    const chainResult = machine.result();
    if (!chainResult) {
      setStatus('Crossing failed: no chain result.', 'error');
      (window as unknown as { __rendered: number }).__rendered = 0;
      return 0;
    }
    return mountCrossedDungeon(gd, gameId, mountSeq, out, archives, chainResult, machine.snapshots);
  };

  if (runner.isDone()) {
    return finish();
  }

  // Present the crossing exactly like every other natural route's checkpoint dialogue (coab-natural-2
  // etc.): real narrative text + real menu choices, driven via `window.__dialogue` in e2e or genuine
  // clicks in a live session.
  openDialogueAt(runner, first, {
    title: `✦ ${gd.title}`,
    onClose: () => { void finish(); },
  });
  (window as unknown as { __rendered: number }).__rendered = 1;
  return 1;
}

/**
 * ADR-0009 — once {@link startCrossArchiveExplore}'s crossing dialogue lands (chain status `'exited'`),
 * find the landed `game_area`'s own `LOAD_FILES`/`LOAD_PIECES` effects (the LAST occurrence of each in
 * the chain's accumulated effects — the start area emits its own earlier in the same list) and build
 * its real walkable GEO dungeon exactly like {@link loadDungeon} does for the single-archive path, then
 * hand off to the shared {@link mountDungeonView} tail. MON{n}SPC/ITM are joined before combatant
 * assembly so crossed dungeons preserve retail affects, magic-item XP, and carried loot identities.
 */
async function mountCrossedDungeon(
  gd: GameData,
  gameId: GameId,
  mountSeq: number,
  out: HTMLElement,
  archives: Map<number, ArchiveSetArea>,
  chainResult: RunChainResult,
  priorAreaMemory: Record<string, Record<string, number>>,
  mountOpts: { clockMinutes?: number } = {},
): Promise<number> {
  if (chainResult.status !== 'exited') {
    setStatus(
      `Crossing did not complete: ${chainResult.status}${chainResult.haltReason ? ` (${chainResult.haltReason})` : ''}`,
      'error',
    );
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }
  let landedArea = gd.archiveSet!.startGameArea;
  for (const e of chainResult.effects) if (e.type === 'setGameArea') landedArea = e.gameArea;
  const area = archives.get(landedArea);
  const loadFilesEff = [...chainResult.effects].reverse().find((e): e is Extract<EclEffect, { type: 'loadFiles' }> => e.type === 'loadFiles');
  const loadPiecesEff = [...chainResult.effects].reverse().find((e): e is Extract<EclEffect, { type: 'loadPieces' }> => e.type === 'loadPieces');
  if (!area || !loadFilesEff || !loadPiecesEff) {
    setStatus(`Crossing landed in game_area ${landedArea} with no walkable dungeon (missing LOAD_FILES/LOAD_PIECES).`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }
  const landedBlockId = chainResult.visited[chainResult.visited.length - 1] ?? 0;
  const label = `${gd.title} ECL${landedArea}#${landedBlockId} (game_area ${landedArea})`;
  const isCoabVillage = gd.id === 'coab-natural-3' && landedArea === 5 && landedBlockId === 49;

  let map: GameMap;
  let walls: DungeonWalls;
  const eclDialect = eclDialectFor(gd);
  try {
    const sources: DungeonSources = {
      geoBlock: (id) => area.geo.get(id) ?? null,
      walldefBlock: (id) => walldefBlockFor(gd, area.walldef, id),
      tileBlock: (id) => area.tiles.get(id) ?? null,
      directWallsetTileIds: gd.directWallsetTileIds,
    };
    const geoRaw = sources.geoBlock(loadFilesEff.geoBlockId);
    if (!geoRaw) throw new Error(`GEO block ${loadFilesEff.geoBlockId} not found in game_area ${landedArea}`);
    map = decodeGeoBlock(geoRaw, label).map;
    walls = loadDungeonWalls(loadPiecesEff.setBlockIds, sources);
    // CoAB's village has one proved DUNGCOM exit: descriptor 3 at (0,2), facing west. Mark this
    // block's boundary only; its real vm_run_1 handler rejects every non-matching pose itself.
    if (isCoabVillage) markMapEdgeExits(map, { kind: 'vm_run_1' });
  } catch (err) {
    if (mountSeq !== exploreMountSeq) return 0;
    setStatus(`Could not load dungeon: ${err instanceof Error ? err.message : String(err)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }
  if (mountSeq !== exploreMountSeq) return 0;

  // Real font/frame/moon art + the landed area's monster/item DBs — the same per-area asset shapes
  // the single-archive path fetches, sourced from ADR-0009's eager-loaded archive set plus one extra
  // raw fetch for the 8X8D archive's undecompressed bytes (the font, block 201, isn't a normal block).
  let wallGraphics: WallGraphics | null = null;
  let moonTiles: IndexedImage[] | null = null;
  let frameTiles: IndexedImage[] | null = null;
  let font: BitmapFont | null = null;
  let monsterLookup: MonsterLookup = () => undefined;
  let monRecords: MonsterRecord[] = [];
  let bestiary: { name: string; ac: number; thac0: number; damage: string; combatSize?: number; morale?: number; itemPluses?: number[]; carriedItems?: MonsterRecord['carriedItems'] }[] = [];
  let itemDb: ExploreItemRecord[] = [];
  let allies: MonsterRecord[] = [];
  try {
    wallGraphics = await buildWallGraphics(gd, walls, loadPiecesEff.setBlockIds, area.walldef);
    const tilesRaw = await fetchDaxRaw(`${gd.archiveSet!.dir}/8X8D${landedArea}.DAX`);
    moonTiles = extractMoonTiles(tilesRaw.blocks, gd.moonTileGroups);
    frameTiles = extractFrameTiles(tilesRaw.blocks);
    font = loadCokFont(tilesRaw.bytes);
    monRecords = [...area.mon.entries()]
      .filter(([, raw]) => sniffMonsterRecord(raw, gd.profileId))
      .map(([blockId, raw]) => decodeMonsterRecord(raw, blockId, gd.profileId));
    const spcAffects = decodeMonsterSpcArchive(area.spc);
    monRecords = applyHalfDamageAffect(applyRegenAffect(monRecords, spcAffects), spcAffects);
    monRecords = applyConSavingBonus(monRecords, spcAffects);
    monRecords = applyCloudProtectionAffects(monRecords, spcAffects);
    const monsterItems = decodeMonsterItmArchive(area.itm, gd.profileId);
    monRecords = applyItemPluses(monRecords, monsterItems);
    monRecords = applyCarriedItems(monRecords, monsterItems);
    monsterLookup = monsterLookupFromArchive(monRecords);
    bestiary = monRecords.map((m) => ({
      name: m.name,
      ac: m.armorClass,
      thac0: m.thac0,
      damage: `${m.damage.count}d${m.damage.sides}${m.damage.bonus ? `+${m.damage.bonus}` : ''}`,
      combatSize: m.combatSize,
      morale: m.morale,
      itemPluses: m.itemPluses,
      carriedItems: m.carriedItems,
    }));
    allies = chainResult.effects
      .filter((e): e is Extract<EclEffect, { type: 'addNpc' }> => e.type === 'addNpc')
      .map(({ npcId, morale }): MonsterRecord | null => {
        const rec = monsterLookup(npcId);
        return rec ? { ...rec, morale } : null;
      })
      .filter((r): r is MonsterRecord => r !== null);
    if (area.item.length) {
      itemDb = decodeItemArchive(area.item).map((it) => ({
        name: it.name, baseTypeId: it.baseTypeId, itemTypeId: it.itemTypeId,
        archiveBlockId: it.archiveBlockId, value: 0, count: it.count,
      }));
    }
  } catch {
    // Graceful degrade — same convention as the single-archive path: the dungeon still loads.
  }
  if (mountSeq !== exploreMountSeq) return 0;

  return mountDungeonView(gameId, mountSeq, out, {
    map, walls, wallGraphics, areaEcl: area.ecl.get(landedBlockId) ?? new Uint8Array(0), eclDialect,
    monsterLookup, monRecords, itemDb, allies, introText: '', bestiary, moonTiles, frameTiles, font,
    // The crossing's own final (already-mutated) shared memory continues live for the landed area, so
    // any further scripted events there see the correct post-crossing state (quest flags included).
    areaMemorySeed: chainResult.memory,
    priorAreaMemory,
    currentArea: { disk: landedArea, areaId: landedBlockId },
    ...(isCoabVillage ? { startPose: { x: 3, y: 0, facing: 'south' as Direction } } : {}),
    ...(mountOpts.clockMinutes !== undefined ? { clockMinutes: mountOpts.clockMinutes } : {}),
  });
}

/**
 * Boot the explore view: load a real CoK dungeon (ECL init → GEO + walls) and make it
 * walkable. `assetSource` (M7.S1), when given, is a Library entry's own picked-folder
 * reader — omit it (as every non-Library caller does) to play the bundled repo copy.
 */
export function closeExplore(): void {
  exploreMountSeq++;
  combatLaunchPending = false;
  dokHostPoseSync = null;
  closeGatewayWilderness();
  window.removeEventListener('keydown', onKey);
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
  }
  closeCharSheet();
  closeMagic();
  closeDialogue();
  closeCokTravel();
  closeCokOpeningCamp();
  closeDokTravel();
  closePoolTravel();
  closeCompanionPanel();
  closeCombat();
  closePartyDefeatBoundary();
  state?.surface.dispose();
  state?.automapSurface.dispose();
  state = null;
  stepDispatcher = null;
  (window as unknown as { __explore?: Record<string, unknown> }).__explore = undefined;
  (window as unknown as { __cokOpening?: Record<string, unknown> }).__cokOpening = undefined;
  (window as unknown as { __dokOpening?: Record<string, unknown> }).__dokOpening = undefined;
  (window as unknown as { __dokTravel?: Record<string, unknown> }).__dokTravel = undefined;
  (window as unknown as { __poolTravel?: Record<string, unknown> }).__poolTravel = undefined;
  (window as unknown as { __coabRegional?: Record<string, unknown> }).__coabRegional = undefined;
}

/** Backward-compatible alias for the now-canonical, campaign-proven walkable Gateway route. */
export async function startGatewayEcl5Fight(): Promise<number> {
  const url = new URL(window.location.href);
  url.searchParams.delete('gateway-fight');
  url.searchParams.set('explore', 'gateway');
  window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
  return startExplore('gateway');
}

/**
 * Present the short, non-dungeon camp that retail CoK displays after the Inn
 * narration.  The source capture establishes the screen's art, command labels
 * and its Exit handoff, but not independent Save/View/Magic/Rest/Alter/Fix
 * effects in this scripted context.  Keep those labels visible and do not
 * silently substitute Greybox's mounted-dungeon camp behaviour for them.
 */
function openCokOpeningCamp(
  campPicture: IndexedImage,
  presentation: {
    frameTiles: IndexedImage[] | null;
    frameLayout?: ExploreFrameLayout;
    font: BitmapFont | null;
    party?: ExploreParty[];
  },
  onExit: () => void,
): void {
  closeCokOpeningCamp();
  const overlay = el('div', 'sheet-overlay');
  const panel = el('div', 'sheet-panel cok-travel-panel');
  panel.appendChild(el('div', 'gb-dlg-title', 'Champions of Krynn · Camp'));
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA, presentationFitOptions('cok'));
  followPresentationScale(surface, 'cok');
  emu.appendChild(surface.canvas);
  panel.appendChild(emu);
  surface.paint(composeExploreScreen({
    viewport: campPicture,
    frameTiles: presentation.frameTiles,
    frameLayout: presentation.frameLayout,
    font: presentation.font,
    party: presentation.party,
    position: '7,13 N 00:00 CAMPING',
    message: 'THE PARTY MAKES CAMP...',
    menu: { items: GB_MENU_ENCAMP, selected: 0 },
  }), EGA_PALETTE);

  const note = el(
    'div',
    'muted cok-travel-note',
    'Retail opening camp. Its captured handoff establishes EXIT; the other commands remain visible but are not yet assigned unverified scripted effects.',
  );
  panel.appendChild(note);
  const controls = el('div', 'cok-travel-choices');
  const leave = (): void => {
    if (!cokOpeningCampOverlay) return;
    closeCokOpeningCamp();
    onExit();
  };
  for (const command of GB_MENU_ENCAMP) {
    const button = el('button', 'gb-btn cok-travel-choice', command) as HTMLButtonElement;
    button.type = 'button';
    if (command === 'Exit') button.addEventListener('click', leave);
    else {
      button.disabled = true;
      button.title = 'This opening-camp command has not yet been recovered from the original route.';
    }
    controls.appendChild(button);
  }
  panel.appendChild(controls);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  const keydown = (event: KeyboardEvent): void => {
    if (event.key.toUpperCase() !== 'E' && event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    leave();
  };
  window.addEventListener('keydown', keydown, true);
  cokOpeningCampOverlay = { overlay, surface, keydown };
  (window as unknown as { __cokOpeningCamp?: Record<string, unknown> }).__cokOpeningCamp = {
    open: () => cokOpeningCampOverlay !== null,
    pictureId: () => 59,
    commands: () => [...GB_MENU_ENCAMP],
    exit: leave,
  };
  surface.canvas.focus();
  setStatus('The party makes camp. Exit to continue to Throtl.');
}

/** DoK's retail new-game front door: ECL1#16's complete cinematic and opening battle. */
async function startDokRetailCampaign(gd: GameData, mountSeq: number): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement | null;
  if (!out) return 0;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((node) => node.classList.remove('active'));
  out.innerHTML = '';
  setStatus('Loading Death Knights of Krynn retail opening…');

  try {
    const [ecl, bigpicBytes, picBytes, tiles, monIdx] = await Promise.all([
      fetchDax(gd.eclPath),
      readAssetBytes('Death Knights of Krynn/BIGPIC1.DAX'),
      readAssetBytes('Death Knights of Krynn/PIC5.DAX'),
      fetchDaxRaw(gd.tilesPath),
      fetchDax(gd.monPath),
    ]);
    if (mountSeq !== exploreMountSeq) return 0;
    const block16 = ecl.get(16);
    if (!block16) throw new Error('retail ECL1#16 opening block is missing');

    const pictures = new Map<number, IndexedImage>();
    for (const [bytes, name] of [[bigpicBytes, 'BIGPIC1.DAX'], [picBytes, 'PIC5.DAX']] as const) {
      for (const block of decodeDax(bytes, name).blocks) if (block.image) pictures.set(block.blockId, block.image);
    }
    for (const pictureId of [112, 96, 113, 77]) {
      if (!pictures.has(pictureId)) throw new Error(`opening picture ${pictureId} is missing`);
    }

    // Never borrow a separate Amiga holding for a DOS-only Library selection. Even an
    // identically numbered frame is not trusted without this exact archive's provenance.
    let dragonAmiga: IndexedImage | undefined;
    if (activeAssetSource) {
      try {
        const bytes = await activeAssetSource.readAsset('BIGPIC1.DAA');
        if (bytes) {
          const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer));
          const sha = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
          if (sha === DOK_DRAGON_RESTYLE.amigaArchiveSha256) {
            const image = decodeDaa(bytes, 'BIGPIC1.DAA').frameSet.frames.get(DOK_DRAGON_RESTYLE.pictureId);
            if (image?.width === DOK_DRAGON_RESTYLE.nativeWidth
                && image.height === DOK_DRAGON_RESTYLE.nativeHeight) dragonAmiga = image;
          }
        }
      } catch { /* no verified Amiga frame in the selected installation: keep DOS */ }
    }
    if (mountSeq !== exploreMountSeq) return 0;

    const monRecords = [...monIdx.entries()]
      .filter(([, raw]) => sniffMonsterRecord(raw, gd.profileId))
      .map(([blockId, raw]) => decodeMonsterRecord(raw, blockId, gd.profileId));
    const lookup = monsterLookupFromArchive(monRecords);
    const spawnOpening = (roster: readonly EncounterMonster[]): DialogueCombat => {
      const party = partySize() > 0
        ? partyCombatants()
        : DEMO_PARTY.map((spec) => partyCombatant(spec, addnd1e));
      const { enemies } = spawnEnemies([...roster], lookup);
      return {
        party,
        enemies,
        names: encounterNames(party, [...roster]),
        seed: 0x0d1a,
        intro: 'The battle is joined!',
        day: 1,
      };
    };

    const memory = new Map<number, number>(gd.eclInitialMemory ?? []);
    const runner = new DialogueRunner(new NarrativeDialogueMachine(
      new EclVm(block16, { memory, seed: 1, dialect: ECL_GEN1_SHORT }),
    ));
    const first = runner.start();
    (window as unknown as { __dokOpening?: Record<string, unknown> }).__dokOpening = {
      complete: () => false,
      memory: () => Object.fromEntries(memory),
    };
    openDialogueAt(runner, first, {
      title: '✦ Death Knights of Krynn',
      spawn: spawnOpening,
      presentation: {
        pictures,
        sceneArt: {
          ref: { game: 'dok', logicalId: DOK_DRAGON_RESTYLE.logicalId },
          pictureId: DOK_DRAGON_RESTYLE.pictureId,
          comparisonId: DOK_DRAGON_RESTYLE.comparisonId,
          label: DOK_DRAGON_RESTYLE.label,
          pixelScale: DOK_DRAGON_RESTYLE.pixelScale,
          x: 8, y: 8,
          ...(dragonAmiga ? { amigaOriginal: dragonAmiga } : {}),
          loadRestyle: loadDokDragonRestyle,
        },
        frameTiles: extractFrameTiles(tiles.blocks),
        frameLayout: gd.frameLayout,
        font: loadCokFont(tiles.bytes),
        party: compositorParty(),
        palette: EGA_PALETTE,
      },
      onChain: (blockId) => {
        const finishArrival = (): void => {
          (window as unknown as { __dokOpening?: Record<string, unknown> }).__dokOpening = {
            complete: () => true,
            blockId: () => blockId,
            memory: () => Object.fromEntries(memory),
          };
          void remountCampaignChain(blockId, memory, { clockMinutes: 20 * 60 });
        };
        const arrivalBlock = ecl.get(blockId);
        if (!arrivalBlock) {
          finishArrival();
          return;
        }
        const arrivalRunner = new DialogueRunner(new NarrativeDialogueMachine(
          new EclVm(arrivalBlock, { memory, seed: 1, dialect: ECL_GEN1_SHORT }),
        ));
        openDialogueAt(arrivalRunner, arrivalRunner.start(), {
          title: '✦ Death Knights of Krynn · Gargath Outpost',
          spawn: spawnOpening,
          presentation: {
            pictures,
            frameTiles: extractFrameTiles(tiles.blocks),
            frameLayout: gd.frameLayout,
            font: loadCokFont(tiles.bytes),
            party: compositorParty(),
            palette: EGA_PALETTE,
          },
          onClose: finishArrival,
          onChain: (nextBlockId) => { void remountCampaignChain(nextBlockId, memory, { clockMinutes: 20 * 60 }); },
        });
      },
    });
    (window as unknown as { __rendered: number }).__rendered = 1;
    setStatus('Death Knights of Krynn begins at the Gargath Outpost celebration.');
    return 1;
  } catch (error) {
    if (mountSeq !== exploreMountSeq) return 0;
    setStatus(`Could not load DoK opening: ${error instanceof Error ? error.message : String(error)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }
}

/**
 * CoK's retail new-game front door. ECL1#36 performs the Inn/Sir Karl opening, chains through the
 * ECL1#16 journey dispatcher into ECL1#17's Gargath commandant/town menu, and LEAVE returns to #16's
 * overland selector. These blocks are presentation and dispatch scripts rather than one GEO dungeon,
 * so drive them as one continuous chain and only mount exploration after their own NEWECL choice.
 */
async function startCokRetailCampaign(gd: GameData, mountSeq: number): Promise<number> {
  const presentationAssetSource = activeAssetSource;
  const presentationIsCurrent = (): boolean => mountSeq === exploreMountSeq
    && activeAssetSource === presentationAssetSource && baseGameForExplore(activeGame.id) === 'cok';
  const out = document.querySelector('#output') as HTMLElement | null;
  if (!out) return 0;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((node) => node.classList.remove('active'));
  out.innerHTML = '';
  setStatus('Loading Champions of Krynn retail opening…');

  try {
    const [ecl, bigpicBytes, picBytes, tiles] = await Promise.all([
      fetchDax('Champions of Krynn/ECL1.DAX'),
      readAssetBytes('Champions of Krynn/BIGPIC1.DAX'),
      readAssetBytes('Champions of Krynn/PIC1.DAX'),
      fetchDaxRaw('Champions of Krynn/8X8D1.DAX'),
    ]);
    if (!presentationIsCurrent()) return 0;
    if (!ecl.has(36) || !ecl.has(16) || !ecl.has(17)) {
      throw new Error('retail ECL1#36/#16/#17 opening blocks are missing');
    }

    const { pictures, pictureSources } = await cokDialoguePictures(bigpicBytes, picBytes);
    for (const pictureId of [59, 112, 121, 57, 58]) {
      if (!pictures.has(pictureId)) throw new Error(`${pictureId < 100 ? 'PIC1' : 'BIGPIC1'}#${pictureId} is missing`);
    }

    // Read only the captured selected installation; unqualified DOS maps receive no cottage binding.
    if (!presentationIsCurrent()) return 0;
    const cottageBaseSource = pictureSources.get(112);
    const cottageCandidate = cokCottageSceneArt(cottageBaseSource);
    const cottageAmiga = cottageCandidate
      ? await loadCokCottageSelectedOriginal(presentationAssetSource, presentationIsCurrent) : undefined;
    if (!presentationIsCurrent()) return 0;
    const cottageScene = cokCottageSceneArt(cottageBaseSource, cottageAmiga);

    const selectedSaveMemory = await loadSelectedCokCampaignMemory();
    if (!presentationIsCurrent()) return 0;
    // Keep a Library-selected campaign internally consistent: when its folder carries
    // CHRDATA*.SAV, install those heroes before the opening art and dialogue render.  The importer
    // deliberately leaves the current roster untouched if no valid selected save characters exist,
    // so a bare SAVGAMA.DAT remains a valid opening-state-only selection.
    const selectedParty = selectedSaveMemory && activeAssetSource
      ? await importCokParty(activeAssetSource)
      : null;
    const savedMapTarget = selectedSaveMemory ? await selectedCokSavedMapTarget(selectedSaveMemory) : null;
    if (!presentationIsCurrent()) return 0;
    if (savedMapTarget && selectedSaveMemory) {
      const importedCount = selectedParty?.imported.length ?? 0;
      return switchGen1Area('cok', savedMapTarget.disk, savedMapTarget.areaId, {
        carriedMemory: selectedSaveMemory,
        loadedSaveName: importedCount
          ? `selected CoK campaign (${importedCount} saved ${importedCount === 1 ? 'hero' : 'heroes'})`
          : 'selected CoK campaign',
      });
    }
    const memory = new Map<number, number>([
      ...(selectedSaveMemory ?? []),
      ...(gd.eclInitialMemory ?? []),
    ]);
    const machine = new ChainDialogueMachine(
      36,
      (blockId) => ecl.get(blockId),
      {
        memory,
        seed: 1,
        dialect: ECL_GEN1,
        autoCombat: true,
        startGameArea: 1,
        maxBlocks: 32,
      },
      'Champions of Krynn opening',
    );
    const runner = new DialogueRunner(machine);
    const first = runner.start();

    const finishOpening = (): void => {
      if (mountSeq !== exploreMountSeq) return;
      const result = machine.result();
      const completed = result?.status === 'exited' && result.visited[0] === 36 &&
        result.visited.includes(17) && result.visited.at(-1) === 16;
      if (!result || !completed) {
        setStatus(
          `CoK opening did not reach retail travel (${result?.status ?? 'no result'}; ` +
          `visited ${result?.visited.join(' → ') || 'none'}).`,
          'error',
        );
        return;
      }
      openCokOpeningCamp(
        pictures.get(59)!,
        {
          frameTiles: extractFrameTiles(tiles.blocks),
          frameLayout: gd.frameLayout,
          font: loadCokFont(tiles.bytes),
          party: compositorParty(),
        },
        () => {
          if (mountSeq !== exploreMountSeq) return;
          (window as unknown as { __cokOpening?: Record<string, unknown> }).__cokOpening = {
            complete: () => true,
            visited: () => [...result.visited],
            memory: () => Object.fromEntries(result.memory),
            selectedSaveWords: () => selectedSaveMemory?.size ?? 0,
            selectedParty: () => selectedParty?.imported ?? [],
          };
          void openCokTravel({
            memory: result.memory,
            areaMemory: machine.snapshots,
            clockMinutes: 6 * 60,
          });
        },
      );
    };

    openDialogueAt(runner, first, {
      title: '✦ Champions of Krynn',
      presentation: {
        pictures,
        pictureSources,
        sceneArts: cokPortraitSceneArts(),
        ...(cottageScene ? { sceneArt: cottageScene } : {}),
        frameTiles: extractFrameTiles(tiles.blocks),
        frameLayout: gd.frameLayout,
        font: loadCokFont(tiles.bytes),
        party: compositorParty(),
        palette: EGA_PALETTE,
      },
      onClose: finishOpening,
    });
    (window as unknown as { __cokOpening?: Record<string, unknown> }).__cokOpening = {
      complete: () => false,
      visited: () => [...(machine.result()?.visited ?? [])],
      status: () => machine.result()?.status ?? null,
      selectedSaveWords: () => selectedSaveMemory?.size ?? 0,
      selectedParty: () => selectedParty?.imported ?? [],
    };
    (window as unknown as { __rendered: number }).__rendered = 1;
    setStatus('Champions of Krynn begins at the Inn of the Last Home.');
    return 1;
  } catch (error) {
    if (!presentationIsCurrent()) return 0;
    setStatus(`Could not load CoK opening: ${error instanceof Error ? error.message : String(error)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }
}

/**
 * R3 negative-arm entry: `?explore=gateway-quest&yartar=1` skips Everlund entirely and mounts
 * `ECL2.DAX#1`/`GEO2.DAX#1` (Yartar) directly at the SAME (11,0,south) re-entry spawn the
 * positive route's own handover lands at (see `resolveCombat`'s `gateway-quest` hook above),
 * seeded with the same [0x4BF2]=21/[0x03B2]=2 host inputs but WITHOUT [0x4C21] — the "Amanitas
 * never rescued" precondition golden test F asserts (`memory.get(0x4c21) ?? 0 === 0`; "fully
 * unset memory... takes the same branch"). This is what lets the browser two-arm proof
 * (`explore-gateway-quest`) reach the flag-clear fork without fabricating a loss in the rescue
 * fight — the ONLY other way [0x4C21] would ever be unset at (14,2) is never having visited
 * Everlund's undercity at all. Mirrors `?explore=gateway&wilderness=1`'s own query-flag branch
 * immediately below.
 */
async function startGatewayQuestYartarControl(): Promise<number> {
  const disk = GEN1_BASE_GAMES.gateway.disks.find((d) => d.disk === 2);
  if (!disk) return 0;
  setStatus('Loading Gateway Yartar (quest-flag negative control)…');
  const memory = new Map<number, number>([[0x4bf2, 21], [0x03b2, 2]]);
  return switchGen1Area('gateway', disk, 1, {
    carriedMemory: memory,
    pose: { x: 11, y: 0, facing: 'south' },
  });
}

/** Options for an explicit entry into the dungeon from a menu (see `startExplore`). */
export interface ExploreStartOptions {
  /**
   * Main-menu Load Saved Game (CoK only). The explicit continuation: restore the quick slot instead
   * of running the retail opening. Not inferred from the URL, so ordinary Begin stays unchanged.
   */
  loadSaved?: boolean;
  /**
   * CoK party-defeat recovery: the player chose Return to Main Menu on the fallen-party boundary.
   * The play route supplies it; standalone routes leave it unset and return to `?play=cok`.
   */
  onReturnToMenu?: () => void;
}

export async function startExplore(
  gameId: GameId = 'cok',
  assetSource?: AssetSource,
  opts: ExploreStartOptions = {},
): Promise<number> {
  closeDungeon3d();
  closeExplore();
  partyDefeatReturnToMenu = opts.onReturnToMenu ?? null;
  combatLaunchPending = false;
  const mountSeq = ++exploreMountSeq;
  const gd = gameData(gameId);
  activeGame = gd;
  activeAssetSource = assetSource ?? null;
  const query = new URLSearchParams(window.location.search);
  // Decide the Load Saved Game continuation BEFORE the retail opening can run. A quick save with no
  // recorded location (a legacy save) restores only the party and stores, then starts the retail
  // opening and says so. A save with a location skips the opening and reuses quickLoad on the anchor
  // mount below.
  const loadSaved = gameId === 'cok' && opts.loadSaved === true;
  if (loadSaved) {
    const save = readSlot(QUICK_SLOT);
    if (!save || save.party.length === 0) {
      setStatus('No saved game to load.');
      return 0;
    }
    if (!save.position) {
      applySave(save); // party, stores and journal only: applied once, here
      const mounted = await startCokRetailCampaign(gd, mountSeq);
      if (mounted === 1 && mountSeq === exploreMountSeq) {
        setStatus(`Saved game ${save.name} has no saved location: the party and stores were restored; the world starts at the retail opening.`);
      }
      return mounted;
    }
  }
  if (gameId === 'gateway' && query.has('wilderness')) {
    return startGatewayEcl6Wilderness(mountSeq, query.has('load'));
  }
  if (gameId === 'gateway-quest' && query.has('yartar')) {
    return startGatewayQuestYartarControl();
  }
  // ADR-0009 — cross-archive games (CoAB's wilderness-transition route) boot through a dedicated
  // interactive-crossing front-end (`startCrossArchiveExplore`) instead of this function's own
  // single-archive fetch below; both land in the same shared `mountDungeonView` UI-construction tail.
  if (gd.archiveSet) return startCrossArchiveExplore(gd, gameId, mountSeq, gd.archiveSet);
  // CoK's honest new-game front door is a presentation/dispatch chain, not ECL1#34's mountable GEO
  // area. A requested saved-game boot deliberately retains the old anchor path below so quickLoad can
  // inspect the slot and re-mount its recorded disk/area without replaying the opening.
  // `?explore=1` is the long-standing subsystem/debug harness used by combat, magic, audio and
  // graphics regressions; keep its deterministic ECL1#34 mount. Real CoK entry points
  // (`?explore=cok`, Play, and Library selection) use the retail opening.
  if (gameId === 'cok' && query.get('explore') !== '1' && !query.has('load') && !loadSaved) {
    return startCokRetailCampaign(gd, mountSeq);
  }
  if (gameId === 'dok' && !query.has('anchor') && !query.has('load')) {
    return startDokRetailCampaign(gd, mountSeq);
  }
  const eclDialect = eclDialectFor(gd);
  const eclLabel = gd.eclPath.match(/([^/]+)\.DAX$/i)?.[1] ?? 'ECL';
  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus(`Loading ${gd.title} dungeon (${eclLabel} block ${gd.eclInitBlock})…`);

  let map: GameMap;
  let walls: DungeonWalls;
  let wallGraphics: WallGraphics | null = null;
  let areaEcl: Uint8Array;
  let areaEclBlocks: ReadonlyMap<number, Uint8Array> = new Map();
  let monsterLookup: MonsterLookup;
  let bestiary: { name: string; ac: number; thac0: number; damage: string; combatSize?: number; morale?: number; itemPluses?: number[]; carriedItems?: MonsterRecord['carriedItems'] }[] = [];
  // M10.S2 — the FULL decoded records `bestiary` is a simplified projection of, kept alongside for
  // the in-play Reference DB tab (needs HD/XP/category the reduced `bestiary` array drops).
  let monRecords: MonsterRecord[] = [];
  // M35.S1 — companions recruited by this dungeon's ECL ADD_NPC (0x36) sites, resolved to real
  // MonsterRecords with `morale` overwritten by the ECL operand (COAB CMD_AddNPC reassigns it —
  // see the `addNpc` EclEffect doc). Empty for every dungeon that scripts none (the common case).
  let allies: MonsterRecord[] = [];
  // M36.S1 — narrative text this dungeon's ECL init block printed before exiting/chaining (e.g. DoK
  // block 34's real "WELCOME TO CEKOS" village-guard greeting). Empty for the common case.
  let introText = '';
  // B5 — the game's item catalogue (CoK plain-ASCII records / DoK 17-byte coded table), summarised
  // for the seam so the shop/inventory systems have a real DoK item DB to draw on.
  let itemDb: ExploreItemRecord[] = [];
  let moonTiles: IndexedImage[] | null = null;
  let frameTiles: IndexedImage[] | null = null;
  let font: BitmapFont | null = null;
  // One persistent map carries scripted boot writes into the live area. This matters for Gateway's
  // campaign-backed ECL5#19 entry: its nested guards consume the captured previous-ECL/facing state
  // and write the authentic (15,2,W) arrival before the host advances LastEclBlockId to 19.
  const areaMemorySeed = new Map<number, number>(gd.eclInitialMemory ?? []);
  try {
    const [eclIdx, geoIdx, wdIdx, sharedWdIdx, tiles, sharedTilesIdx, monIdx, spcBytes, itmBytes, wizBytes, frameArc] = await Promise.all([
      fetchDax(gd.eclPath),
      fetchDax(gd.geoPath),
      fetchDax(gd.walldefPath),
      gd.sharedWalldefPath ? fetchDax(gd.sharedWalldefPath) : Promise.resolve(new Map<number, Uint8Array>()),
      fetchDaxRaw(gd.tilesPath), // raw bytes too: the font (block 201) is not a standard DaxBlock
      gd.sharedTilesPath ? fetchDax(gd.sharedTilesPath) : Promise.resolve(new Map<number, Uint8Array>()),
      fetchDax(gd.monPath).catch(() => new Map<number, Uint8Array>()), // optional: degrade to "no fights"
      // M23.S2 — MON{n}SPC.DAX special/affect side-table (e.g. troll-style regen_3_hp); optional,
      // same graceful degrade as monPath: an absent/failed fetch just means no monster affects.
      gd.spcPath ? readAssetBytes(gd.spcPath).catch(() => new Uint8Array(0)) : Promise.resolve(new Uint8Array(0)),
      // M26.S1 — MON{n}ITM.DAX carried-item side-table (magic-item `plus` -> post-combat XP bonus);
      // same optional graceful degrade as spcPath.
      gd.itmPath ? readAssetBytes(gd.itmPath).catch(() => new Uint8Array(0)) : Promise.resolve(new Uint8Array(0)),
      // M31.S1 — MON{n}WIZ.DAX memorized-spellbook side-table (DoK only); same optional graceful
      // degrade as spcPath/itmPath: an absent/failed fetch just means every enemy stays mute.
      gd.wizPath ? readAssetBytes(gd.wizPath).catch(() => new Uint8Array(0)) : Promise.resolve(new Uint8Array(0)),
      // A second 8X8D archive carrying font/frame blocks the wall-tile bank does not have
      // (Treasures and Gateway) — see GameData.framePath's own doc comment.
      gd.framePath ? fetchDaxRaw(gd.framePath).catch(() => null) : Promise.resolve(null),
    ]);
    // Merge the frame/font archive's blocks in (when present) so extractFrameTiles/loadCokFont below
    // find block 201/202 exactly as if tilesPath itself carried them. The wall-piece source
    // (`sources.tileBlock` below) deliberately stays UNMERGED: Treasures' frame archive reuses block
    // id 202 for its own "frame" image, not a standard 8X8D tile bank — `loadDungeonWalls`'s
    // BOOT_8X8D_SET4 probe (block 0xCA=202) would find it and throw. `tlIdx` stays scoped to the
    // font/moon/frame extraction below, which is exactly what needs the merge.
    const allTileIdx = sharedTilesIdx.size ? new Map([...sharedTilesIdx, ...tiles.blocks]) : tiles.blocks;
    const tlIdx = frameArc ? new Map([...allTileIdx, ...frameArc.blocks]) : allTileIdx;
    // Gateway's numbered area bank and global WALLDEF.DAX are one retail lookup namespace. Local
    // blocks win only if an id overlaps; today the sets are disjoint (global 5/15/30 vs area-local).
    const allWdIdx = sharedWdIdx.size ? new Map([...sharedWdIdx, ...wdIdx]) : wdIdx;
    const fontBytes = frameArc ? frameArc.bytes : tiles.bytes;
    const initEcl = eclIdx.get(gd.eclInitBlock);
    if (!initEcl) throw new Error(`ECL block ${gd.eclInitBlock} not found`);
    const sources: DungeonSources = {
      geoBlock: (id) => geoIdx.get(id) ?? null,
      walldefBlock: (id) => walldefBlockFor(gd, allWdIdx, id),
      tileBlock: (id) => allTileIdx.get(id) ?? null,
      directWallsetTileIds: gd.directWallsetTileIds,
    };
    const dungeon = loadDungeon(initEcl, sources, {
      label: `${gd.title} ${eclLabel}#${gd.eclInitBlock}`,
      entry: gd.eclEntryOffset,
      dialect: eclDialect,
      fallbackPieces: gd.eclFallbackPieces,
      // Base-game scoped (not the exact `gateway` id) so every Gateway leaf gets the same two-stage
      // [4BF2] handling the host-CALL wiring above already assumes. There is no conflict with a
      // profile's own `eclInitialMemory`: the seed is what initial_entry READS while this run
      // executes — ECL5#19 block offsets 0x46/0x51, i.e. vaddrs 0x8044 `03 01 f2 4b 00 13` (COMPARE
      // [0x4BF2],#19 / IF_EQ 0x804A / GOTO 0x8115) and 0x804F `03 01 f2 4b 00 15` (COMPARE
      // [0x4BF2],#21 / IF_EQ / GOTO 0x8071), both re-read from the retail bytes here — and the write
      // below is the host advancing LastEclBlockId to the block that just entered — the exact
      // sequence the plain `gateway` profile's own `eclInitialMemory` comment describes. For
      // `gateway-natural` the seeded 21 selects the 0x8071 arrival arm, whose cold-memory
      // fall-through writes [0xC04B]=0/[0xC04C]=10/[0xC04D]=1 — i.e. it now DERIVES the (0,10,E)
      // that profile's `startPose` records, instead of the pose being asserted alongside a VM run
      // that never saw the seed.
      ...(baseGameForExplore(gameId) === 'gateway' ? { memory: areaMemorySeed } : {}),
    });
    if (baseGameForExplore(gameId) === 'gateway') areaMemorySeed.set(0x4bf2, gd.eclInitBlock);
    map = dungeon.map;
    walls = dungeon.walls;
    areaEcl = initEcl;
    areaEclBlocks = eclIdx;
    wallGraphics = await buildWallGraphics(gd, walls, dungeon.pieces.setBlockIds, allWdIdx);
    // GameData.frameTilesUnverified's own doc comment: a title flagged this way has a block 202
    // whose tile count/order CoK's own hardcoded moon/frame indices would misread — leave both
    // honestly absent rather than compositing the wrong tiles. A title with its own `gd.frameLayout`
    // (e.g. NWN's NWN_FRAME_LAYOUT) supplies real border tile roles but no moon-overlay calibration
    // (see that constant's own doc comment), so moons stay skipped there too.
    moonTiles = gd.frameTilesUnverified
      ? null
      : extractMoonTiles(tlIdx, gd.moonTileGroups); // real title-specific 8X8D moon-phase discs
    frameTiles = gd.frameTilesUnverified ? null : extractFrameTiles(tlIdx); // block 202 frame art the compositor draws the border from
    font = loadCokFont(fontBytes); // block 201 mono 8×8 text font for the compositor's UI text

    // Each MON{n}CHA block is one monster record (CoK 409-byte / DoK 216-byte, dispatched on size);
    // key the decoded records by block id.
    monRecords = [...monIdx.entries()]
      .filter(([, raw]) => sniffMonsterRecord(raw, gd.profileId))
      .map(([blockId, raw]) => decodeMonsterRecord(raw, blockId, gd.profileId));
    // M23.S2/M24.S1/M28.S1 + cloud gates — join MON{n}SPC.DAX innate affects (regen_3_hp,
    // half_damage, con_saving_bonus, source-shaped cloud-protection gates) onto the records so
    // spawnEnemies -> monsterCombatant carries them into real combat.
    const spcAffects = decodeMonsterSpcArchive(spcBytes);
    monRecords = applyHalfDamageAffect(applyRegenAffect(monRecords, spcAffects), spcAffects);
    monRecords = applyConSavingBonus(monRecords, spcAffects);
    monRecords = applyCloudProtectionAffects(monRecords, spcAffects);
    // M26.S1/M29.S1 — join MON{n}ITM.DAX carried items onto the records: `.plus` values for a defeated
    // monster's magic-item XP bonus (calcBattleExp's Σ item.plus·400 term), and full item identities for
    // finalize()'s real post-combat loot table (rollTreasure), both reusing the same decode.
    const itm = decodeMonsterItmArchive(itmBytes, gd.profileId);
    monRecords = applyItemPluses(monRecords, itm);
    monRecords = applyCarriedItems(monRecords, itm);
    // M31.S1 — join MON{n}WIZ.DAX memorized spells onto the records so a real DoK caster monster
    // actually casts in combat (crosswalked into TacticalSpells at the makeTC() assembly point).
    monRecords = applyPreparedSpellIds(monRecords, decodeMonsterWizArchive(wizBytes));
    monsterLookup = monsterLookupFromArchive(monRecords);
    // M35.S1 — resolve this dungeon's scripted ADD_NPC joins (if any) through the SAME lookup
    // combat uses; an id absent from the loaded area's MON{n}CHA archive (e.g. CoK's area-2
    // companions with only area-1 assets loaded) is silently skipped, same idiom as spawnEnemies's
    // `unresolved` array.
    allies = dungeon.npcJoins
      .map(({ npcId, morale }): MonsterRecord | null => {
        const rec = monsterLookup(npcId);
        return rec ? { ...rec, morale } : null;
      })
      .filter((r): r is MonsterRecord => r !== null);
    // M36.S1 — this dungeon's ECL init-block narration (e.g. a scripted village-guard greeting),
    // already computed by loadDungeon() via the same collectText() the per-cell dialogue runner uses.
    introText = dungeon.introText;
    bestiary = monRecords.map((m) => ({
      name: m.name,
      ac: m.armorClass,
      thac0: m.thac0,
      damage: `${m.damage.count}d${m.damage.sides}${m.damage.bonus ? `+${m.damage.bonus}` : ''}`,
      // CT.7k-2 — byte-located combat-icon size (offset 207) + control_morale % (offset 231).
      combatSize: m.combatSize,
      morale: m.morale,
      itemPluses: m.itemPluses,
      carriedItems: m.carriedItems,
    }));

    // B5 — the item catalogue. CoK stores plain-ASCII names per record; DoK packs a 17-byte coded
    // table whose names are VOCAB-coded, so for DoK we name each item by its base-type catalogue
    // entry (Long Sword / Chain Mail / …). Degrades to an empty DB if the archive is absent.
    try {
      const itemBytes = (await fetchDaxRaw(gd.itemPath)).bytes;
      if (gd.itemFormat === 'dok-17') {
        itemDb = decodeDokItemArchive(itemBytes).map((it) => ({
          name: baseItem(it.baseTypeId)?.name ?? `Item type ${it.baseTypeId}`,
          baseTypeId: it.baseTypeId,
          value: it.value,
        }));
      } else {
        itemDb = decodeItemArchive(itemBytes).map((it) => ({
          name: it.name,
          baseTypeId: it.baseTypeId,
          itemTypeId: it.itemTypeId,
          archiveBlockId: it.archiveBlockId,
          value: 0,
          count: it.count,
        }));
      }
    } catch {
      itemDb = []; // item archive missing → no DB (the dungeon still loads)
    }
  } catch (err) {
    if (mountSeq !== exploreMountSeq) return 0;
    setStatus(`Could not load dungeon: ${err instanceof Error ? err.message : String(err)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }
  if (mountSeq !== exploreMountSeq) return 0;

  return mountDungeonView(gameId, mountSeq, out, {
    map, walls, wallGraphics, areaEcl, areaEclBlocks, eclDialect, monsterLookup, monRecords, itemDb, allies,
    introText, bestiary, moonTiles, frameTiles, font,
    areaMemorySeed,
    currentArea: { disk: diskNumberFromPath(gd.geoPath), areaId: gd.eclInitBlock },
    restoreSavedGame: loadSaved,
  });
}

/** Parse the disk/area-set number out of a `GEO{n}.DAX` path (0 if it doesn't match). Feeds the
 * "walk any area" picker's pre-selection ({@link MountCtx.currentArea}) from a plain `eclPath`/
 * `geoPath` profile, without needing every call site to separately track which disk it fetched. */
function diskNumberFromPath(geoPath: string): number {
  return Number(geoPath.match(/GEO(\d+)\.DAX$/i)?.[1] ?? 0);
}

/**
 * Bundle of everything {@link mountDungeonView} needs to finish booting a dungeon into the live
 * screen/state/`window.__explore` seam, factored out of `startExplore`'s single-archive tail
 * (ADR-0009) so the cross-archive boot (`startCrossArchiveExplore`/`mountCrossedDungeon`) can reuse
 * the exact same UI-construction code after its own (different) init/fetch front-end.
 */
interface MountCtx {
  map: GameMap;
  walls: DungeonWalls;
  wallGraphics: WallGraphics | null;
  areaEcl: Uint8Array;
  /** Full same-archive ECL source when available; single-block mounts fall back to areaEcl. */
  areaEclBlocks?: ReadonlyMap<number, Uint8Array>;
  eclDialect: EclDialect;
  monsterLookup: MonsterLookup;
  monRecords: MonsterRecord[];
  itemDb: ExploreItemRecord[];
  allies: MonsterRecord[];
  introText: string;
  bestiary: { name: string; ac: number; thac0: number; damage: string; combatSize?: number; morale?: number; itemPluses?: number[]; carriedItems?: MonsterRecord['carriedItems'] }[];
  moonTiles: IndexedImage[] | null;
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
  /** Seeds the live `state.areaMemory` (a fresh copy is taken so the caller's own Map is untouched). */
  areaMemorySeed: Map<number, number>;
  /** ADR-0009 cross-archive boot only — see {@link ExploreState.priorAreaMemory}. */
  priorAreaMemory?: Record<string, Record<string, number>>;
  /**
   * The disk + area id THIS mount actually loaded — feeds the "walk any area" picker
   * ({@link buildGen1AreaPicker}) so it can pre-select the currently-shown area in its dropdown.
   * Undefined for a mount whose base game isn't registered in `gen1Disks.ts` (the picker is simply
   * omitted then) or when the caller didn't compute it (never required — the picker degrades to no
   * pre-selection, still fully functional).
   */
  currentArea?: { disk: number; areaId: number };
  /** Restore pose/time when mounting a saved or state-preserving cross-area session. */
  startPose?: Pose;
  clockMinutes?: number;
  /** Main-menu Load Saved Game: restore the quick slot on entry (the boot-time load). */
  restoreSavedGame?: boolean;
}

function mountDungeonView(gameId: GameId, mountSeq: number, out: HTMLElement, ctx: MountCtx): number {
  if (mountSeq !== exploreMountSeq) return 0;
  const {
    map, walls, wallGraphics, areaEcl, areaEclBlocks, eclDialect, monsterLookup, monRecords, itemDb, allies,
    introText, bestiary, moonTiles, frameTiles, font, areaMemorySeed, priorAreaMemory, currentArea,
    startPose, clockMinutes,
  } = ctx;
  // ---- The emulated screen: the engine composes the ENTIRE 320×200 EGA exploration screen
  // (viewport, decorative frame, moons, party panel, position line, message window, prompt) into
  // one indexed framebuffer; the ScreenSurface displays it scaled to the correct 4:3 aspect — the
  // real original interface, as if the game were running under DOS, not a CSS rebuild.
  const screen = el('div', 'gb-screen');
  const frame = el('div', 'gb-frame');

  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA, presentationFitOptions(gameId)); // DOS graphics mode; profile-switchable later
  followPresentationScale(surface, gameId);
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);

  // Command hints + Rest button live under the emulated screen (companion chrome, not part of
  // the original screen image).
  const menu = el('div', 'gb-menu');
  menu.innerHTML =
    '<b>↑↓←→</b> Move/turn · command bar: <b>A</b>rea <b>C</b>ast <b>V</b>iew <b>E</b>ncamp ' +
    '<b>S</b>earch <b>L</b>ook (press the letter) · <b>M</b> companion panels · in camp <b>← →</b> choose, <b>Enter</b> select &nbsp; ' +
    'walls <span style="color:#7fd0ff">━</span> doors <span style="color:#ffce54">╴╴</span> gateways <span style="color:#74c365">╴╴</span>';
  const restBtn = el('button', 'gb-btn', '⛺ Rest') as HTMLButtonElement;
  restBtn.type = 'button';
  restBtn.addEventListener('click', () => restAndRefresh());
  menu.appendChild(restBtn);
  // M10.S2 — opens the in-play Companion panel host (Automap/Party/Databases) as a read-only
  // overlay without leaving exploration; mirrors the Rest button right beside it.
  const companionBtn = el('button', 'gb-btn', '🧭 Companion') as HTMLButtonElement;
  companionBtn.type = 'button';
  companionBtn.addEventListener('click', () => openCompanion());
  menu.appendChild(companionBtn);
  if (baseGameForExplore(gameId) === 'cok') {
    const travelBtn = el('button', 'gb-btn', '🗺 Travel') as HTMLButtonElement;
    travelBtn.type = 'button';
    travelBtn.addEventListener('click', () => { void openCokTravel(); });
    menu.appendChild(travelBtn);
  } else if (baseGameForExplore(gameId) === 'pool') {
    const travelBtn = el('button', 'gb-btn', '🗺 Regional travel') as HTMLButtonElement;
    travelBtn.type = 'button';
    travelBtn.title = 'Take ECL1#18\'s eastern-city regional exit, then choose a destination through ECL7#26.';
    // The button supplies the missing host travel-selector choice (3); ECL1#18 itself remains
    // authoritative for the (11,28) arrival and NEWECL #26 handoff.
    travelBtn.addEventListener('click', () => { crossWilderness(3); });
    menu.appendChild(travelBtn);
  } else if (baseGameForExplore(gameId) === 'dok') {
    const travelBtn = el('button', 'gb-btn', '🗺 Leave / Travel') as HTMLButtonElement;
    travelBtn.type = 'button';
    // The visible command drives ECL1#36's own vm_run_1 host-exit arm first ("LEAVE THE
    // OUTPOST?"); YES then NEWECLs to block 17 and opens the retail overland layer.
    travelBtn.addEventListener('click', () => {
      void triggerEdgeExit({ kind: 'vm_run_1', meta: { seedMemory: { 0x7ed5: 1 } } });
    });
    menu.appendChild(travelBtn);
  } else if (baseGameForExplore(gameId) === 'gateway') {
    const wildernessBtn = el('button', 'gb-btn', '🗺 Wilderness checkpoint') as HTMLButtonElement;
    wildernessBtn.type = 'button';
    wildernessBtn.title = 'Open the native-captured ECL6 wilderness checkpoint; this is not a proved reverse transition from Sundabar.';
    wildernessBtn.addEventListener('click', () => {
      const source = activeAssetSource ?? undefined;
      const url = new URL(window.location.href);
      url.searchParams.set('explore', 'gateway');
      url.searchParams.set('wilderness', '1');
      url.searchParams.delete('load');
      window.history.replaceState(null, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
      void startExplore('gateway', source);
    });
    menu.appendChild(wildernessBtn);
  }
  frame.appendChild(menu);

  // Display/scaler controls — aspect-ratio correction + scaling mode, operating on the surface.
  const scaler = buildScalerBar(surface, gameId);
  frame.appendChild(scaler.bar);

  // M9.S3 — the live EGA<->Amiga wall-art switch (only shown when an Amiga source loaded).
  if (wallGraphics || baseGameForExplore(gameId) === 'cok') frame.appendChild(buildGraphicsBar(gameId, wallGraphics));

  // "Walk any area" picker — purely additive (matches dqkExplore.ts's own `.gb-mappicker` dropdown):
  // lists every playable area across THIS base game's disks, defaulting to the area just booted, and
  // lets the player jump anywhere else live. Omitted when `gameId`'s base game isn't registered.
  const areaPicker = buildGen1AreaPicker(gameId, currentArea);
  if (areaPicker) frame.appendChild(areaPicker);
  if (baseGameForExplore(gameId) === 'nwn') {
    frame.appendChild(el(
      'div',
      'note small nwn-offline-boundary',
      'Offline client reconstruction: this explorer uses shipped NWN DOS/AOL assets only. AOL login, server state, multiplayer, and persistent-world progression are unavailable.',
    ));
  }

  screen.appendChild(frame);
  out.appendChild(screen);
  // Keep the scaler readout (display size / scale) current as the container resizes. A prior
  // mount's own handler (any re-mount: ADR-0009's `mountCrossedDungeon`, or the mid-walk chain
  // re-mount `remountChainedArea` uses) is removed first so re-entering this function never
  // accumulates stale listeners closing over an already-discarded surface.
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  resizeHandler = scaler.update;
  window.addEventListener('resize', resizeHandler);

  // Companion: the three moons of Krynn as a labelled readout (real 8X8D disc art) — a Gold Box
  // Companion aid alongside the emulated screen, which also shows them on its top row.
  const companion = el('div', 'gb-companion');
  companion.appendChild(el('div', 'gb-moonbar'));
  // M54.S1 — restore the party-roster companion aid refreshPartyHud() has always filled
  // (33180d2, 2026-06-21, deleted this container while migrating to the canvas compositor,
  // without touching the function that fills it — see docs/engine/research/m54-audit.md).
  companion.appendChild(el('div', 'gb-party'));
  out.appendChild(companion);

  // Automap — a Greybox navigation aid (the DOS original had none); kept below the game screen.
  // M10.S1: rendered via composeAutomapPanel/Automap (same D1 model + compositor the standalone
  // `?automap=1` route uses) through a ScreenSurface, not the old ad-hoc canvas-2D grid.
  const aid = el('div', 'gb-aid');
  aid.appendChild(el('div', 'gb-panel-h', `Automap · ${map.name} (${map.width}×${map.height})`));
  const amBox = el('div', 'gb-emu');
  const automapSurface = createScreenSurface(DOS_EGA, presentationFitOptions(gameId));
  followPresentationScale(automapSurface, gameId);
  automapSurface.canvas.classList.add('gb-automap');
  automapSurface.canvas.tabIndex = 0;
  amBox.appendChild(automapSurface.canvas);
  aid.appendChild(amBox);
  out.appendChild(aid);

  // BUILD-QUEUE.md's map-edge live-crossing leaf: a profile that declares `GameData.edgeExit`
  // (CoK's `cok-natural-4` town route, so far) opts the WHOLE decoded map perimeter into the
  // engine's `markMapEdgeExits` — see that helper's own doc comment for why "the whole boundary"
  // is the right generalization of the retail `vm_run_1` `tried_to_exit_map` check, which fires on
  // ANY edge-of-map attempt, not one named gate cell. Harmless no-op for every other profile.
  if (activeGame.edgeExit) {
    const { kind, seedMemory } = activeGame.edgeExit;
    markMapEdgeExits(map, { kind, ...(seedMemory ? { meta: { seedMemory } } : {}) });
  }

  // `startPose` (GameData's own doc comment) is an opt-in override for titles whose GEO map is
  // fragmented into disconnected wall-graph components — `chooseStart`'s global best-open-edges
  // scan has no connectivity awareness and can land in a pocket that can't reach the route's real
  // target cell (Treasures' GEO1.DAX#34: 21 components). Every other profile leaves this undefined
  // and gets the prior behavior unchanged.
  const explorer = new Explorer(map, startPose ?? activeGame.startPose ?? chooseStart(map));
  const automap = restoreAutomapModel(gameId, map);
  state = {
    map, walls, wallGraphics, explorer, automap, automapSurface, surface, frameTiles, font,
    frameLayout: activeGame.frameLayout,
    areaEcl,
    areaEclBlocks: areaEclBlocks ?? new Map([[currentArea?.areaId ?? activeGame.eclInitBlock, areaEcl]]),
    eclDialect, monsterLookup, monRecords, itemDb, allies,
    areaMemory: new Map<number, number>(areaMemorySeed), lastEncounterRequest: [],
    currentArea, lastCell: -1, lastEvent: '',
    clockMinutes: clockMinutes ?? 6 * 60, messages: [], moonTiles, menuMode: 'dungeon', encampSel: 0,
    wallRestyleRevision: 0,
    ...(priorAreaMemory ? { priorAreaMemory } : {}),
  };
  // Repaint (transparently — no engine-state change) whenever the wall-art set is toggled.
  if (wallGraphics) wallGraphics.manager.on('change', () => drawScreen());
  if (baseGameForExplore(gameId) === 'cok') {
    const current = state;
    if (currentArea?.disk === 1 && currentArea.areaId === 32) {
      // Preload only; completion cannot run a VM, draw a step, or mutate the campaign.
      void readAssetBytes('Champions of Krynn/PIC1.DAX').then(async (bytes) => {
        const { pictures, pictureSources } = await cokDialoguePictures(null, bytes);
        if (state !== current || mountSeq !== exploreMountSeq || !pictures.has(15)) return;
        current.cellDialoguePresentation = { pictures, pictureSources, sceneArts: cokPortraitSceneArts(),
          frameTiles, frameLayout: current.frameLayout, font, party: compositorParty(), palette: EGA_PALETTE };
      }).catch((error) => console.warn('[cokPortrait15] native portrait unavailable; retaining text-only dialogue.', error));
    }
    refreshCokExploreWallArt(current, mountSeq);
  }
  pushMessage(`You enter ${map.name}.`);
  // M36.S1 — narrate the ECL init block's own scripted text (if any), before any companion joins,
  // matching the script's own emission order (print effects precede ADD_NPC in the real corpus).
  if (introText) pushMessage(introText);
  // M35.S1 — narrate this dungeon's ECL-scripted companion joins, if any.
  for (const ally of allies) pushMessage(`${ally.name} joins the party!`);
  renderMoons();

  // In-game audio uses the mounted title's own profile. Some titles have no verified music and
  // deliberately remain silent; never substitute CoK's theme for them. The first canvas click is
  // the user gesture that lets sound play; combat swaps the scene from combat.ts.
  gameAudio.setGame(audioGameForExplore(gameId));
  void gameAudio.ensureLoaded().then(() => gameAudio.enterScene('explore'));
  installGameAudioSeam();

  // Step-sound dispatcher: the engine's 'step' event resolves to bank slot 9 (`MovePartyForward`,
  // decompile-seg044-sound.md). Previously this sink reused the 'miss'/swish 8SVX one-shot as a
  // footstep proxy, which meant a weapon-swing whoosh (a genuinely combat sound) played on every
  // single dungeon step — reported by the user as sounding wrong, and it was: neither CoK's nor
  // DoK's Amiga sound bank (`amiga_extracted/{ChampionsOfKrynn,DeathKnightsOfKrynn}/disk*/[Ss]ound/`,
  // both ship the identical 18-file bank) has a genuine footstep/walk/footfall sample — every 8SVX
  // there is named for a specific combat/UI cue (arrow, hit, dead, fireb, gate/Zorp, ropeswish2,
  // Tuning.Fork.2, …), none of it distinct-and-honest for "footstep". The byte-exact original PC
  // speaker step tone (Gen1 bank slot 9) itself is a genuine dynamic-trace TODO (see
  // decompile-seg044-sound.md's "2026-07-17: footstep placeholder" note) — no static source
  // recovers it. So rather than keep misusing a combat sample, this goes silent on 'step': an
  // honest "we don't have this sound yet" beats a wrong one. Construct one SoundDispatcher per
  // mount and fire playEvent('step') on each moved step (still dispatched, just not sounded).
  const stepSink: SoundSink = { playSlot: () => {}, stopAll: () => {} };
  stepDispatcher = new SoundDispatcher(stepSink, 'pc');
  stepCount = 0;

  // Bind the key handler ONCE — on window only. (Binding it on both the canvas and
  // window made a single keypress fire twice when the canvas had focus: two steps /
  // a 180° turn instead of one. addEventListener dedupes the same fn on re-entry.)
  automapSurface.canvas.addEventListener('click', () => {
    automapSurface.canvas.focus();
    void gameAudio.ensureLoaded().then(() => { gameAudio.setEnabled(true); if (!isCombatOpen()) gameAudio.enterScene('explore'); });
  });
  window.addEventListener('keydown', onKey);
  draw();
  refreshPartyHud();
  scaler.update(); // populate the scaler readout now the surface has painted once
  automapSurface.canvas.focus();

  // Boot-time Load: `?explore=1&load=1`, or the main-menu Load Saved Game continuation, restores the
  // quick-save (party + position + clock + area memory) on entry. quickLoad applies the slot once.
  if ((new URLSearchParams(location.search).get('load') !== null || ctx.restoreSavedGame === true)
    && hasSlot(QUICK_SLOT)) {
    quickLoad();
  }

  // Headless e2e seam.
  (window as unknown as { __explore?: Record<string, unknown> }).__explore = {
    getPose: () => state?.explorer.getPose(),
    currentArea: () => state?.currentArea ?? null,
    /**
     * Test/Companion seam over the same state-preserving path the visible area picker uses. It is
     * intentionally not campaign evidence by itself; the clean-input campaign regression combines
     * it with retail event transitions. This seam pins the lower-level cross-disk save invariant.
     */
    switchArea: async (diskNumber: number, areaId: number) => {
      const baseId = baseGameForExplore(activeGame.id);
      const disk = baseId ? GEN1_BASE_GAMES[baseId].disks.find((d) => d.disk === diskNumber) : undefined;
      return baseId && disk ? switchGen1Area(baseId, disk, areaId) : 0;
    },
    /** Read-only, byte-backed ECL6#21 dynamic-GEO/cadence/native-CALL contract. */
    inspectGatewayWilderness: () => inspectGatewayWilderness(),
    /** Open the same retail-data-backed CoK travel selector as the visible Travel button. */
    openTravel: () => openCokTravel(),
    move: (a: MoveAction) => applyMove(a),
    // M72.S1 — why the most recent move attempt failed (StepResult.blocked), or null if it
    // succeeded/no move has been attempted yet; mirrors wilderness.ts's own e2e-visible `blocked` field.
    blocked: () => state?.lastBlocked ?? null,
    mapName: map.name,
    cellCount: map.cells.length,
    /** Current live roster, for selected-save and combat-route regression checks. */
    party: () => partyStatus().map((member) => ({ name: member.name, hp: member.hp, ac: member.ac })),
    /** Distinct retail item-type identities currently carried by the party. */
    partyItemTypes: () => carriedItemTypeIds(),
    /** Number of defined DAC entries in the palette used by the visible explorer framebuffer. */
    paletteDefined: () => definedColorCount(activeExplorePalette()),
    /** Cross-pose palette-index invariant for title-specific wall-bank routing. */
    viewportPaletteIndexSummary,
    // First-person geometry sanity for the current pose (wall faces in view).
    viewQuadCount: () =>
      state ? projectViewport(state.map, state.explorer.getPose(), { maxDepth: 4, sideColumns: 1 }).quads.length : 0,
    /** Loaded ordinary wall-art sets 1..3; Gateway's LOAD_PIECES 7/15/30 must resolve all three. */
    wallTileSets: () => state?.walls.tileSets.slice(1, 4).map((set) => set !== null) ?? [],
    // Most recent per-step SearchLocation event summary (M2.S3).
    lastEvent: () => state?.lastEvent ?? '',
    // P2.2 natural-route proof: read one persisted ECL memory word after combat resume.
    areaMemory: (address: number) => state?.areaMemory.get(address & 0xffff) ?? 0,
    // Secret's bounded quest proof: preserve the exact live producer/control memory while making
    // the explicitly-unrecovered ECL1#32 -> #16 link visible to the test rather than fabricating it.
    bridgeSecretQuestToMarcus: () => bridgeSecretQuestToMarcus(),
    // Pool's wilderness-crossing leaf (live browser wiring): drive the real retail `vm_run_1`
    // dispatch on the currently mounted block — see `crossWilderness`'s own doc comment for exactly
    // what is/isn't a stand-in for unbuilt UI.
    crossWilderness: (pendingSelector?: number) => crossWilderness(pendingSelector),
    // CoK's wilderness-crossing leaf (live browser wiring): drive the real retail `search_location`
    // dispatch on the currently mounted block — see `crossCokWilderness`'s own doc comment for exactly
    // what is/isn't a stand-in for unbuilt UI.
    crossCokWilderness: () => crossCokWilderness(),
    // A3.4 seam: spawn a fixed roster (3 goblins, MON1CHA block 9) and launch the PLAYABLE combat
    // overlay (window.__combat then drives it). e2e: testFight → poll __combat → auto() → dismiss().
    testFight: (seed = 0x55) => resolveCombat([{ monsterId: 9, count: 3, picBlockId: 0 }], seed),
    // CoK bank-scoped combat graphics acceptance: use the mounted disk's real DOS CPIC archive and
    // real bestiary record, while pinning the requested picture block so repeated ids across disks
    // and each source-frame geometry can be exercised without fabricating archive bytes.
    testFightPicture: (pictureId: number, monsterId: number, seed = 0x5b) =>
      resolveCombat([{ monsterId, count: 1, picBlockId: pictureId }], seed),
    combatLaunchPending: () => combatLaunchPending,
    campaignRemountPending: () => campaignRemountPending,
    // Read-only: whether the CoK fallen-party boundary is currently blocking the dungeon.
    partyDefeatOpen: () => partyDefeatBoundary !== null,
    testMonsterRecords: () => (state?.monRecords ?? []).map((record) => ({
      blockId: record.blockId,
      name: record.name,
      combatSize: record.combatSize ?? 1,
    })),
    // CT.3 verification seam: summarize the recovered CoAB dungeon combat map that resolveCombat()
    // should pass into launchCombat for this exact seed and current dungeon pose.
    testEncounterTerrain: (seed = 0x55) => {
      const terr = encounterTerrain(seed);
      return terr ? summarizeBackgroundIds(terr.backgroundIds, terr.width, terr.height) : null;
    },
    // CT.3 retail proof seam: force the party onto a real decoded GEO cell, then run the normal
    // SearchLocation event path for that cell's real backdrop byte. This is not a synthetic roster:
    // the ECL block decides whether COMBAT fires and which LOAD_MONSTER groups are queued.
    testRetailSearchLocationFight: (x: number, y: number, facing: Direction = 'east', seed = 0x5a) => {
      if (!state || x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return null;
      const pose = { x, y, facing };
      state.explorer.setPose(pose);
      const cellIndex = y * state.map.width + x;
      const cell = state.map.cells[y * state.map.width + x]!;
      const text = runStepEvent(cell.floor ?? 0, seed);
      state.lastCell = cellIndex;
      state.lastEvent = text;
      if (text) pushMessage(text);
      draw();
      return { text, desc: cell.floor ?? 0, seed, pose: state.explorer.getPose() };
    },
    testRetailCellTerrain: (x: number, y: number, facing: Direction = 'east', seed = 0x5a) => {
      if (!state || x < 0 || y < 0 || x >= state.map.width || y >= state.map.height) return null;
      const terr = encounterTerrainForPose({ x, y, facing }, seed);
      return terr ? summarizeBackgroundIds(terr.backgroundIds, terr.width, terr.height) : null;
    },
    // C4.2b-2b-2c-iv — browser proof that a non-interactive script combat resumes the paused
    // SearchLocation-style runner with the actual overlay outcome, not the old default/no-outcome path.
    testScriptOutcomeFight: (seed = 0x56) => resolveCombat([{ monsterId: 9, count: 1, picBlockId: 0 }], seed, outcomeResumeProbeRunner()),
    // ECL SETUP_MONSTER/APPROACH handoff proof: force a recovered encounter distance into launchCombat
    // and let __combat.posOf compare the party/enemy start cells.
    testScriptSetupFight: (distance = 3, seed = 0x57, mapDirection?: number) =>
      resolveCombat([{ monsterId: 9, count: 1, picBlockId: 0 }], seed, undefined, { spriteId: 0, maxDistance: 12, picId: 0, distance }, mapDirection),
    testScriptSurpriseFight: (result = 2, seed = 0x59) =>
      resolveCombat(
        [{ monsterId: 9, count: 1, picBlockId: 0 }],
        seed,
        undefined,
        undefined,
        undefined,
        { args: [0, 0, 2, 4], partyThreshold: 6, monsterThreshold: 0, partyRoll: 3, monsterRoll: 4, result },
      ),
    // A4.3 seam: a guaranteed-win encounter to exercise the post-battle treasure → inventory flow.
    testFightWin: (seed = 0x11) => winFight(seed),
    // M23.S2 seam: spawn a REAL MON1CHA monster by id through the actual monsterLookup pipeline (not
    // the synthetic winFight goblin), so e2e can drive a fight against one with a joined MON1SPC.DAX
    // affect (CoK id 26 = SKELETON, regen_3_hp) and watch window.__combat.hpOf tick up round to round.
    testFightMonster: (monsterId: number, seed = 0x11) => resolveCombat([{ monsterId, count: 1, picBlockId: 0 }], seed),
    combatOpen: () => isCombatOpen(),
    closeCombat: () => closeCombat(),
    // Browser-host proof of the exact retail request before combat.ts caps its visible figures.
    encounterRequest: () => (state?.lastEncounterRequest ?? []).map((group) => ({
      ...group,
      name: state?.monsterLookup(group.monsterId)?.name ?? null,
    })),
    // M2.S7 seams: inspect persisted party HP and rest the party. With no argument Rest heals to
    // full; with a number it rests exactly that many days (A1.2 choose-a-duration camp).
    partyHp: () => partyStatus(),
    rest: (days?: number) => restAndRefresh(typeof days === 'number' ? days : undefined),
    // M2.S8 seams: in-game day + the three-moons reading it drives.
    day: () => gameDay(),
    moons: () => (state ? moonPhasesForDay(gameDay()) : []),
    // A1.2 seams: the running game clock (minutes since epoch) + a formatted display, so e2e can
    // assert that Rest advances time and walks the moons forward by the days it took.
    clockMinutes: () => state?.clockMinutes ?? 0,
    clock: () => (state ? formatGameTime(state.clockMinutes) : ''),
    // ovr021 rest-calendar seams (read-only): the 7-slot calendar reading (day/month/year for the
    // aging assertion) and per-member ages (proves party aging fired on a long Rest).
    calendar: () => (state ? calendarFromClock(clockFromMinutes(state.clockMinutes)) : null),
    ages: () => partyStatus().map((s) => ({ name: s.name, age: s.age })),
    // True when the moon discs blit the REAL 8X8D art (block 202), not the drawn fallback.
    moonArt: () => (state?.moonTiles?.length ?? 0) >= 12,
    messageCount: () => state?.messages.length ?? 0,
    // M36.S1 seam: the full message log (e.g. ECL init-block narration, companion joins), so e2e
    // can confirm real scripted text (not just a count) reaches the player.
    messages: () => [...(state?.messages ?? [])],
    // B2 seam: the decoded monster bestiary (name + verified AC/THAC0/damage). DoK's 216-byte
    // records decode here too, so e2e can assert the undead roster (NIGHTMARE, LICH, …) loads.
    bestiary: () => bestiary.map((m) => ({ ...m })),
    // B5 seam: the decoded item catalogue (CoK 63-byte / DoK 17-byte coded table). DoK names come
    // from the base-type catalogue, so e2e can assert the DoK item DB decodes (≥1 item, sane values).
    items: () => itemDb.map((it) => ({ ...it })),
    // A1.1 seams: the live in-screen command menu (dungeon bar ↔ Encamp sub-menu).
    menuMode: () => state?.menuMode ?? null,
    menuItems: () => (state?.menuMode === 'encamp' ? [...GB_MENU_ENCAMP] : [...GB_MENU_DUNGEON]),
    command: (letter: string) => pressMenuHotkey(letter), // fire a command bar verb by hotkey
    encampSel: () => state?.encampSel ?? -1,
    encampMove: (d: number) => moveEncampCursor(d),
    // A1.3 seam: open the character-sheet ("View") screen; window.__sheet then drives it.
    viewSheet: () => viewCharacters(),
    sheetOpen: () => isSheetOpen(),
    // A2.1 seam: open the spell-memorization screen; window.__magic then drives it.
    openMagic: () => memorizeSpells(),
    magicOpen: () => isMagicOpen(),
    // A6.1 seams: Save writes the quick slot; Load restores it into the live game (no reload). hasSave
    // reports whether a quick slot exists. e2e: move, save, move again, load → pose returns to the save.
    save: () => quickSave(),
    load: () => quickLoad(),
    hasSave: () => hasSlot(QUICK_SLOT),
    // explore-movement lane seams (ovr015/021/028-030): careful-mode time, persisted doors,
    // step-sound count, and the per-cell dungeon sky colour.
    careful: () => state?.explorer.isCareful() ?? false,
    setCareful: (on: boolean) => { state?.explorer.setCareful(on); draw(); return state?.explorer.isCareful() ?? false; },
    stepCount: () => stepCount,
    doorOpen: (dir: Direction) => state?.explorer.isDoorOpen(dir) ?? false,
    skyColour: () => {
      if (!state) return -1;
      const p = state.explorer.getPose();
      const c = state.map.cells[p.y * state.map.width + p.x]!;
      return selectSkyColour(AREA_SKY, roofByteOf(c));
    },
    // M9.S3 seams (gswitch-style): the live in-dungeon EGA<->Amiga wall-art switch. `checksum()`
    // hashes the first-person viewport framebuffer actually on screen (the same one `drawScreen`
    // paints), so e2e can assert a toggle's visual effect directly instead of trusting `mode()`.
    graphicsAvailable: () => (state?.wallGraphics ? [...state.wallGraphics.manager.available] : []),
    graphicsMode: () => state?.wallGraphics?.manager.active ?? null,
    setGraphicsMode: (id: GraphicSetId) => { state?.wallGraphics?.manager.setActive(id); return state?.wallGraphics?.manager.active ?? null; },
    toggleGraphics: () => { toggleGraphicsMode(); return state?.wallGraphics?.manager.active ?? null; },
    graphicsChecksum: () => wallViewportChecksum(),
    wallRestyleIds: () => state?.wallRestyles ? [...state.wallRestyles.art.keys()]
      .map((image) => wallIdentityForImage(state!.walls, image)).filter((identity) => identity !== null).map(cokWallRestyleRef) : [],
    wallRestyleErrors: () => Object.fromEntries(state?.wallRestyles?.errors ?? []),
    wallRestyleVisibleTiles: () => state?.wallRestyleVisibleTiles ?? [],
    wallRestyleVisiblePixels: () => state?.wallRestyleVisiblePixels ?? 0,
    wallRestyleVisiblePixelsByIdentity: () => state?.wallRestyleVisiblePixelsByIdentity ?? {},
    displayProfile: () => state?.surface.profile() ?? null,
    displayRect: () => state?.surface.rect() ?? null,
    // M9.S5 — the honest per-category provenance breakdown (what the badge text is built from),
    // exposed structured so e2e can assert on it directly instead of parsing rendered text.
    graphicsProvenance: () =>
      state?.wallGraphics ? wallArtProvenance(state.wallGraphics.dosSet, state.wallGraphics.manager) : null,
    // M10.S1 — the live D1 Automap model, fed by real walking (not click-reveal). e2e drives
    // `move()` and asserts `automapVisitedCount()` grows / `automapIsVisited(x,y)` flips true for
    // the walked path, proving the in-play widget is backed by the same model as `?automap=1`.
    automapVisitedCount: () => state?.automap.visitedCount ?? 0,
    automapIsVisited: (x: number, y: number) => state?.automap.isVisited(x, y) ?? false,
    // M10.S2 — opens the in-play Companion panel host; window.__companion then drives the open
    // overlay (tab switching, HUD rows, automap count, ref-db browsing). openCompanion() itself
    // rebuilds the source fresh from live state every call, so pose/HP/bestiary are current.
    openCompanion: (tab?: CompanionTab) => { openCompanion(tab); return isCompanionOpen(); },
    companionOpen: () => isCompanionOpen(),
    // M35.S1 seams: this dungeon's ECL-recruited companions (name + resolved morale%).
    allies: () => state?.allies.map((a) => ({ name: a.name, morale: a.morale })) ?? [],
    // Diagnostic: inject a REAL MON{n}CHA companion, resolved via the actual monsterLookup pipeline
    // (same real-record path `testFightMonster` already uses), into `state.allies` — so e2e can
    // prove the ADD_NPC party-fold end-to-end (real record -> `n{blockId}` combatant -> `party` side
    // of a real battle) without needing a live ECL site to reach it. Neither of this opcode's two
    // real occurrences boots cleanly today: DoK's (ECL1 block 2) throws on WALLDEF resolution
    // (WALLDEF1.DAX ships only block 1, not the block id 2 that block scripts); CoK's needs
    // unbuilt area-2 asset plumbing (`MON2CHA.DAX` isn't in area-1's default boot) — see the M35
    // audit's correction addendum.
    injectAlly: (monsterId: number, morale = 100) => {
      if (!state) return false;
      const rec = state.monsterLookup(monsterId);
      if (!rec) return false;
      state.allies = [...state.allies, { ...rec, morale }];
      return true;
    },
    testFightWithAllies: (seed = 0x33) => resolveCombat([{ monsterId: 9, count: 1, picBlockId: 0 }], seed),
  };
  (window as unknown as { __rendered: number }).__rendered = map.cells.length;
  return map.cells.length;
}
