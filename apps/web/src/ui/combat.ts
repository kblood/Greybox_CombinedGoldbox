/**
 * Combat view (CT.2) — the real Gold Box **tactical grid** battle, on the original CoK combat SCREEN.
 *
 * This is the "D&D board game": figures stand on a grid of squares and **walk** (8-dir movement on a
 * budget), **melee** an adjacent foe, loose **missiles** across a clear line of fire, **Guard/Wait**,
 * or **Flee** off the map edge. The fight is driven by the engine's positioned `createTacticalCombat`
 * (CT.1/CT.1b — verified against the COAB decompile: half-step diagonal movement, stored initiative,
 * unconscious/dead thresholds, fractional attacks, percentage morale), NOT the old positionless
 * `combat.ts` stepper (which now only auto-resolves overland encounters).
 *
 * The logical battle map is larger than the screen; the 7×7 viewport (`COK_COMBAT_GEOMETRY`) **scrolls**
 * to keep the active unit centred (COAB `mapScreenTopLeft`). The whole 320×200 EGA screen is composed
 * by the engine's `composeCombatScreen` and painted through a `ScreenSurface` at 4:3. Party turns use a
 * command menu (Move / View / Aim / Use / Cast / Turn / Quick / Done); enemy turns auto-resolve via
 * the engine AI.
 *
 * Two entry points: {@link startCombat} (standalone `?combat=1` demo in `#output`) and
 * {@link launchCombat} (a modal overlay over the explorer for a real script-triggered encounter,
 * returning via `onEnd`). `window.__combat` is the e2e seam.
 */
import { closeDungeon3d } from './dungeon3dHost.js';
import {
  decodeAsset,
  decode8x8dBlock,
  readDaxDataBlocks,
  makeEgaPalette,
  composeCombatScreen,
  composeTreasure,
  composeRgbaArt,
  createTacticalCombat,
  backgroundCellTileMap,
  backgroundMoveCost,
  backgroundTile,
  backgroundTileIndex,
  buildDqkNativeCombatMap,
  dqkNativeBackgroundCellMemberMap,
  dqkNativeBackgroundTile,
  dqkNativeCombatTerrainMemberByte,
  terrainGridFromBackgroundMap,
  buildCoabDungeonCombatMap,
  createCoabCombatTileState,
  addCoabCombatTileGasCloud,
  tickCoabCombatTileClouds,
  markCoabCombatTileDowned,
  restoreCoabCombatTileDowned,
  Rng,
  deployCombatants,
  deployCoabSourceCombatants,
  selectSkyColour,
  SoundDispatcher,
  footprintCells,
  footprintDistance,
  classifyUndead,
  monsterFootprint,
  rollTreasure,
  hasTreasure,
  calcBattleExp,
  loadDungeon,
  decodeMonsterRecord,
  sniffMonsterRecord,
  monsterLookupFromArchive,
  spawnEnemies,
  COK_COMBAT_GEOMETRY,
  AMIGA_COMBAT_GRID_LABEL,
  presentationProfileFor,
  DOS_EGA,
  loadCokFont,
  preparedSpellsFromDokIds,
  type SoundSink,
  type IndexedImage,
  type RgbaArt,
  type Palette,
  type BitmapFont,
  type CombatCellState,
  type CombatSummary,
  type CombatGridGeometry,
  type Combatant,
  type CombatOutcome,
  type CombatResult,
  type TacticalCombat,
  type TacticalCombatant,
  type TacticalStatusFlag,
  type Facing,
  type TacticalAction,
  type TacticalEvent,
  type TacticalSpell,
  type Weapon,
  type TerrainGrid,
  type TerrainHazard,
  type GridPos,
  type TreasureHaul,
  type CombatRuleset,
  type CoabCombatTileState,
  type CoabGasCloudKind,
  type DefeatedEnemy,
  type ExploreParty,
  type Direction,
  type GameMap,
  type EncounterSetup,
  type EncounterSurprise,
  type ExploreFrameLayout,
  type GraphicSetId,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';
import { openCharSheet, isSheetOpen } from './charSheet.js';
import { partyCombatants, applyCombatHp, getParty, getGold, addGold, giveItemsToMember, awardPartyXp, combatSpellsForMember, combatUseItemsForMember, consumeCombatUseItem, spellSaveForMember, turnLevelForMember, backstabLevelForMember, weaponsForMember, moveRateForMember, multiAttackHalfSteps } from './party.js';
import { gameAudio, installGameAudioSeam, type ActionSfx } from '../audio/gameAudio.js';
import { gameData, type GameId } from './gameData.js';
import {
  followPresentationScale, presentationFitOptions, readRuntimeGraphicsFallback, resolveCombatGraphicsMode,
  runtimeGraphicsGameId, writeRuntimeGraphicsMode, type RuntimeGraphicsMode,
} from './runtimeGraphicsMode.js';
import { isDemoGraphicsControl } from './demoCombatGraphics.js';
import {
  cokCombatRestyleIdentity,
  cokCombatRestyleSourceError,
  loadCokCombatRestyleIcon,
} from './cokCombatRestyle.js';
import { createCokCombatRestyleRetry } from './cok-combat-restyle-retry.mjs';
import { prepareCokPlayerAppearance, resolveCokPlayerPresentation, type CokPlayerAppearance, type CokPlayerPreparation } from './cokPlayerAppearance.js';
import { addLocalAssetPackPicker, localAssetPackRevision } from './localAssetPack.js';
import { cokTerrainRestyleIdentity, cokTerrainLayers, decodeCombatTerrain, loadCokTerrainRestyle,
  terrainSha256 } from './cokTerrainRestyle.js';
import { cokTerrainRestyleIndicesForSources, cokTerrainRestylesForSources,
  type CombatTerrainSource } from './cok-terrain-source-match.mjs';

const EGA_PALETTE: Palette = makeEgaPalette();

/**
 * Engine sound-bank slot → host {@link gameAudio} action. The engine's {@link SoundDispatcher}
 * resolves a named combat event to a bank slot (`hit`=6, `miss`=8, `death`=4, `missile`=1,
 * `magic_hit`=2); this maps those slots onto the existing CoK SFX so engine events drive the real
 * playback (and the `__gameAudio.actionCount` e2e seam still increments exactly once per event).
 */
const SOUND_SLOT_TO_ACTION: Record<number, ActionSfx> = { 6: 'melee', 8: 'miss', 4: 'death', 1: 'arrow', 2: 'cast' };
/** Host sink for the engine sound layer: bank slot → existing gameAudio playback. */
const soundSink: SoundSink = {
  playSlot(slot: number): void {
    const action = SOUND_SLOT_TO_ACTION[slot];
    if (action) gameAudio.playAction(action);
  },
  stopAll(): void {
    /* the host audio bus stops voices on scene change; no per-slot stop needed here */
  },
};
/** Engine sound dispatcher (seg044) wired to the host SFX bus — `playEvent('hit'|'miss'|…)`. */
const soundDispatcher = new SoundDispatcher(soundSink, 'pc');
const FRAME_BLOCK = 202;
const SPRIT_PATH = 'Champions of Krynn/SPRIT1.DAX';
const TILES_PATH = 'Champions of Krynn/8X8D1.DAX';
const DUNGCOM_PATH = 'Champions of Krynn/DUNGCOM.DAX';
const DEMO_SEED = 0x6b0b;

const MENU_ITEMS = ['Move', 'View', 'Aim', 'Use', 'Cast', 'Turn', 'Quick', 'Done'] as const;
type MenuItem = (typeof MENU_ITEMS)[number];
const AIM_MENU_ITEMS = ['Next', 'Prev', 'Manual', 'Target', 'Center', 'Exit'] as const;
const AIM_MANUAL_TARGET_ITEMS = ['Target', 'Center', 'Exit'] as const;
const AIM_MANUAL_NO_TARGET_ITEMS = ['Center', 'Exit'] as const;
const ALLY_CONFIRM_ITEMS = ['Yes', 'No'] as const;
type AimMenuItem = (typeof AIM_MENU_ITEMS)[number] | (typeof ALLY_CONFIRM_ITEMS)[number];
const TREASURE_MENU = ['View', 'Take', 'Pool', 'Share', 'Exit'] as const;
const TREASURE_EXIT_MENU = ['YES', 'NO'] as const;

/** Default flat battle map — used when no real encounter terrain is supplied (e.g. open wilderness). */
const MAP_W = 13;
const MAP_H = 9;
const VIEW = 7; // the COK_COMBAT_GEOMETRY visible window is 7×7 cells
/** Half-window, for centring the viewport on the active unit. */
const VIEW_HALF = (VIEW - 1) >> 1;

/** Start ranks on the flat map: party on the west edge, enemies on the east, facing each other. */
const PARTY_POS: ReadonlyArray<readonly [number, number]> = [[1, 4], [1, 2], [1, 6], [0, 4], [0, 3], [0, 5]];
const ENEMY_POS: ReadonlyArray<readonly [number, number]> = [[11, 4], [11, 5], [11, 3], [10, 4], [10, 5], [10, 3]];

/** Formation offsets from a start anchor (CT.3): party fills back-left, enemies front-right. */
const PARTY_OFFSETS: ReadonlyArray<readonly [number, number]> = [[0, 0], [0, -1], [0, 1], [-1, 0], [-1, -1], [-1, 1]];
const ENEMY_OFFSETS: ReadonlyArray<readonly [number, number]> = [[0, 0], [0, 1], [0, -1], [1, 0], [1, 1], [1, -1]];

/** Arrow/seam direction -> grid delta. CoAB Move/Attack keys: H/I/M/Q/P/O/K/G = N/NE/E/SE/S/SW/W/NW. */
const DIR_DELTA: Record<string, readonly [number, number]> = {
  N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0],
  NE: [1, -1], SE: [1, 1], SW: [-1, 1], NW: [-1, -1],
  H: [0, -1], I: [1, -1], M: [1, 0], Q: [1, 1], P: [0, 1], O: [-1, 1], K: [-1, 0], G: [-1, -1],
  h: [0, -1], i: [1, -1], m: [1, 0], q: [1, 1], p: [0, 1], o: [-1, 1], k: [-1, 0], g: [-1, -1],
  ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowRight: [1, 0], ArrowLeft: [-1, 0],
};

type Phase = 'party-menu' | 'party-move' | 'party-target' | 'continue-battle' | 'victory' | 'treasure' | 'over';

export interface CombatAssets {
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
  backdropTiles: IndexedImage[] | null;
  /** Exact per-frame origin, aligned with backdropTiles including appended RANDCOM. */
  terrainSources?: CombatTerrainSource[];
  /** DOS source identities authorizing successful overlays, independent of original pixels. */
  terrainRestyleSources?: Map<number, CombatTerrainSource>;
  terrainRestyles?: Map<number, RgbaArt>;
  terrainRestyleErrors?: Map<number, string>;
  enemyIcon: IndexedImage | null;
  /** Full CPIC block-id library; attract demos bind script/NPC ids to combatant ids from this. */
  iconLibrary: Map<number, IndexedImage>;
  /** Per-battle binding from tactical combatant id to its own CPIC image. */
  combatantIcons: Map<string, IndexedImage>;
  /** Source-pinned RGBA candidates keyed by CPIC block id; absent entries retain original art. */
  combatRestyleIcons: Map<number, RgbaArt>;
  /** Native source pixels restored where a generated Restyle erased a visible source cell entirely. */
  combatRestyleFallbackCells: Map<number, number>;
  /** Asset-specific Restyle failures; requested mode is preserved while the source icon is shown. */
  combatRestyleErrors: Map<number, string>;
  /** Source-mapped CoK CHEAD/CBODY appearance, bound to the persistent party combatant id. */
  playerAppearances: Map<string, CokPlayerAppearance>;
  /** Player-art load/fallback detail, exposed so unavailable identities are never silent. */
  playerAppearanceErrors: Map<string, string>;
  /** Hash of the exact CPIC archive that supplied iconLibrary, when WebCrypto was available. */
  iconArchiveSha256?: string;
  frameLayout?: ExploreFrameLayout;
  moons?: readonly (IndexedImage | null)[];
  /** Active DAC assembled from the UI, DUNGCOM, and CPIC resource ranges. */
  palette: Palette;
  /**
   * Literal source banks used for this view; exposed to prevent cross-title fallback regressions.
   * `dungcomPath`/`randcomPath` report the bank that was actually READ, so an Amiga run that fell
   * back to DOS says so instead of claiming a switch that did not happen.
   */
  sourcePaths: Readonly<{
    tilesPath: string;
    iconPath: string;
    dungcomPath: string;
    randcomPath?: string;
    backdropGraphicSet?: GraphicSetId;
  }>;
}

export interface CombatAssetPaths {
  tilesPath?: string;
  frameTilesPath?: string;
  frameTilesBlockId?: number;
  iconPath?: string;
  /** Active installation reader; keeps combat assets isolated from bundled fallback files. */
  readAsset?: (path: string) => Promise<Uint8Array>;
  dungcomPath?: string;
  /** Optional RANDCOM bank appended after the primary DUNGCOM/WILDCOM backdrop bank. */
  randcomPath?: string;
  /**
   * Amiga `.DAA` counterpart of {@link dungcomPath}, used when `graphicsMode` is `'Amiga'`.
   *
   * Only declare this for a title whose Amiga bank has been MEASURED against the DOS one, because
   * the DOS tile indices drive the Amiga art unchanged. For CoK and DoK that measurement is
   * `packages/engine/test/daa.test.ts` (`*COM` strips vs the DOS DAX oracle): item counts match
   * bank for bank (DUNGCOM 25/25 both games, CoK WILDCOM 35/35, CoK RANDCOM 6/6) and Amiga item `t`
   * determines DOS item `t` at refinement 1.0000 / 0.92 / 0.90 against item-permuted nulls of
   * ~0.13. DoK's Amiga WILDCOM holds 45 items to DOS's 38; indices 0..37 still align (0.85 vs 0.13)
   * and the extra 7 are simply never referenced.
   */
  amigaDungcomPath?: string;
  /** Amiga `.DAA` counterpart of {@link randcomPath}. Same measurement requirement. */
  amigaRandcomPath?: string;
  /**
   * Which graphics set to source the backdrop from. Anything other than `'Amiga'` — including
   * omitting it — keeps the DOS banks, so this is inert until a caller opts in.
   */
  graphicsMode?: GraphicSetId;
  /** Per-game storage namespace for live combat presentation controls. */
  runtimeGameId?: GameId;
  /** Request the CoK Restyle combat pilot while keeping uncovered assets on their original bank. */
  restyleMode?: boolean;
  frameLayout?: ExploreFrameLayout;
  moonTileIds?: readonly [number, number, number];
  palette?: Palette;
  backdropIndexRemap?: Readonly<Record<number, number>>;
  iconTransparentIndices?: readonly number[];
  iconIndexRemap?: Readonly<Record<number, number>>;
}

/** Title-owned combat banks for the standalone real-map previews. Do not silently render another game's art. */
const COMBAT_PREVIEW_ASSETS: Partial<Record<GameId, CombatAssetPaths>> = {
  coab: {
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/8X8D1.DAX',
    iconPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/CPIC1.DAX',
    dungcomPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Curse of the Azure Bonds/DUNGCOM.DAX',
  },
  pool: {
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/8X8D1.DAX',
    iconPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/CPIC1.DAX',
    dungcomPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Pool of Radiance/POOLRAD/DUNGCOM.DAX',
  },
  secret: {
    tilesPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/8X8D1.DAX',
    iconPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/CPIC1.DAX',
    dungcomPath: 'C:/Program Files (x86)/GOG Galaxy/Games/Secret of the Silver Blades/DUNGCOM.DAX',
  },
};

interface CombatState {
  surface: ScreenSurface;
  assets: CombatAssets;
  combat: TacticalCombat;
  combatants: TacticalCombatant[];
  /** Real player-character ids whose end-of-battle HP is allowed to flow back to Party storage. */
  persistentPartyIds: ReadonlySet<string>;
  /** Source-backed helpers fighting on the party side, but never written into Party storage. */
  friendlyNpcIds: ReadonlySet<string>;
  names: Map<string, string>;
  combatantPictureIds: ReadonlyMap<string, number>;
  requestedRestyle: boolean;
  requestedGraphicsMode: RuntimeGraphicsMode;
  runtimeGameId: GameId | null;
  assetPaths: CombatAssetPaths | null;
  playerArtCompletion?: Promise<unknown>;
  retryPlayerArt?: () => void;
  retryCombatRestyleArt?: () => void;
  combatRestyleRetryCompletion?: Promise<void>;
  combatRestyleRetryEpoch?: number;
  restyleArtRevision: number;
  refreshCombatRestyleArt?: () => void;
  graphicsLoadRevision: number;
  graphicsAppliedRevision: number;
  graphicsLoading: boolean;
  graphicsLoadCompletion: Promise<void>;
  geometry: CombatGridGeometry;
  /** Top-left logical cell of the visible 7×7 window (scrolls to follow the active unit). */
  view: { col: number; row: number };
  /** Gold Box BackGroundTiles ids for each tactical cell, when known/recoverable. */
  backgroundIds: readonly number[] | null;
  /** True when `backgroundIds` are already flattened DUNGCOM frame indices from a native capture. */
  backgroundIdsAreTileIndices: boolean;
  /** Which initial placement path seated the combatants. */
  placementMode: 'coab-source' | 'explicit' | 'anchor' | 'flat';
  /** Live CoAB map mutation state for cloud/downed overlays over `backgroundIds`, when the map is 50x25. */
  tileState: CoabCombatTileState | null;
  /** Game-generation combat rules, needed for background-id interpretation and source-specific seams. */
  ruleset: CombatRuleset;
  /** The combatant the cursor box sits on (the active unit, or the chosen target while aiming). */
  activeId: string | null;
  /** Targets offered in `party-target` mode (foes in melee reach or missile range), and the cursor. */
  targets: string[];
  targetIdx: number;
  /** Manual aim cursor inside `party-target`; CoAB exposes a manual target path in the Aim menu. */
  manualAim: boolean;
  aimCursor: GridPos | null;
  /** Pending CoAB-shaped `Attack Ally:` confirmation target for Aim/manual/bump attack paths. */
  allyConfirmTargetId: string | null;
  allyConfirmSelected: number;
  /** Battle seed — reused to roll deterministic treasure on a win. */
  seed: number;
  menuSelected: number;
  aimSelected: number;
  phase: Phase;
  banner: string;
  log: string[];
  over: boolean;
  outcome: CombatOutcome | null;
  xp: number;
  /** CoK's results-page `Each character receives N` raw pre-bonus split. */
  xpPerCharacter: number;
  /** Direct native presentation value for a specifically identified encounter, when available. */
  victoryPerCharacterXp: number | null;
  /** Recovered treasure (A4.3) — set on a won battle; drives the treasure phase. */
  haul: TreasureHaul | null;
  /** Retail ECL TREASURE queue, preferred over synthetic/monster-carried drops after victory. */
  scriptedHaul: TreasureHaul | null;
  treasureCursor: number;
  goldTaken: boolean;
  itemsTaken: boolean;
  treasureMenu: number;
  treasureStatus: string;
  /** Retail post-treasure confirmation: unclaimed haul must be explicitly left behind. */
  treasureExitConfirm: boolean;
  /** Retail `TAKE:` submenu (Money / Items / Exit). */
  treasureTakeMenu: boolean;
  /** Selection on the retail post-combat CONTINUE BATTLE: YES / NO prompt. */
  continueBattleSelected: number;
  /** Overlay root to remove on dismiss (null for the standalone `?combat=1` view). */
  overlayEl: HTMLElement | null;
  /** Called once when the player dismisses a finished battle (back to the dungeon). */
  onEnd: ((res: CombatResult) => void) | null;
  /** True once the battle is over and a dismiss press will close the overlay. */
  dismissable: boolean;
  /** Standalone Combat MVP preview: arrow keys pan an inspection cursor over the real terrain. */
  inspectMode: boolean;
  inspectCursor: GridPos | null;
  inspectLabel: string;
  /** Latest SURPRISE result carried from ECL into combat launch, if any. */
  encounterSurprise: EncounterSurprise | null;
  /**
   * Resolved sky band for the battle backdrop (ovr029/030). The engine `composeCombatScreen`
   * paints `skyIndex` (with the floor band) into the battle box behind the terrain. null = no sky.
   */
  sky: { skyIndex: number; horizonY?: number; floorIndex?: number } | null;
}

let state: CombatState | null = null;
let terrainRenderReceipt: { visibleTileIndices: number[]; changedTerrainSamples: { x: number; y: number; rgb: number[]; block: number[][] }[] } = {
  visibleTileIndices: [], changedTerrainSamples: [],
};

function setStatus(msg: string): void {
  const s = document.querySelector('#status');
  if (s) s.textContent = msg;
}

function daxBlocks(bytes: Uint8Array): Map<number, Uint8Array> {
  return new Map(readDaxDataBlocks(bytes).map((b) => [b.blockId, b.raw]));
}

async function fetchDaxBytes(path: string): Promise<Uint8Array> {
  const resp = await fetch(assetUrl(path));
  if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

/**
 * Synthesize a clean flagstone battle floor (one tile, tiled across the field). The real CoK
 * dungeon-combat tiles (DUNGCOM) are wall/corner PIECES meant to be assembled per dungeon layout —
 * tiling any one of them uniformly reads as "walls everywhere", so for the generic battlefield we
 * lay a neutral stone floor instead. (Per-encounter terrain assembly is CT.3.)
 */
function makeFloorTile(): IndexedImage {
  const w = COK_COMBAT_GEOMETRY.cellW, h = COK_COMBAT_GEOMETRY.cellH;
  const indices = new Uint8Array(w * h).fill(8); // dark-grey stone
  for (let x = 0; x < w; x++) indices[x] = 0; // top seam
  for (let y = 0; y < h; y++) indices[y * w] = 0; // left seam
  return { width: w, height: h, indices, palette: EGA_PALETTE, transparentIndex: null, xOffset: 0, yOffset: 0, encoding: 'synthetic' };
}

/**
 * Decode SPRIT1 into its animation frames and pick the **cell-sized** view (smallest width) for the
 * tactical grid. SPRIT frames ship three view distances (e.g. 56×80 / 32×65 / 24×57); the largest is
 * the first-person near view and overflows the 24-px combat cell, so the grid icon is the narrowest
 * frame — about one cell wide, bottom-anchored so it stands on its square.
 */
function spriteFrom(bytes: Uint8Array, name: string): IndexedImage | null {
  const decoded = decodeAsset(bytes, name);
  if (decoded.format !== 'dax') return null;
  const frames = decoded.archive.blocks.flatMap((b) => b.frames ?? []);
  if (frames.length === 0) return null;
  return frames.reduce((best, f) => (f.width < best.width ? f : best), frames[0]!);
}

function iconLibraryFrom(
  bytes: Uint8Array,
  name: string,
  transparentIndices: readonly number[] = [0, 8],
  indexRemap: Readonly<Record<number, number>> = {},
): Map<number, IndexedImage> {
  const out = new Map<number, IndexedImage>();
  const decoded = decodeAsset(bytes, name);
  if (decoded.format !== 'dax') return out;
  for (const block of decoded.archive.blocks) {
    const image = block.image ?? block.frames?.[0] ?? null;
    if (image) {
      // Early CPIC uses two mask indices (native Secret proves 0 and 8). Gateway planar5 CPIC is
      // title-specific: only 0 is transparent, while source 8 is opaque black and is remapped to a
      // spare global palette slot because tactical index 8 simultaneously means the blue floor.
      const indices = new Uint8Array(image.indices);
      const transparent = new Set(transparentIndices);
      for (let i = 0; i < indices.length; i++) {
        if (transparent.has(indices[i])) indices[i] = 0;
        else if (indexRemap[indices[i]] !== undefined) indices[i] = indexRemap[indices[i]]!;
      }
      out.set(block.blockId, { ...image, indices, transparentIndex: 0 });
    }
  }
  return out;
}

/** Load combat assets, with optional title/area overrides for demo and chained encounters. */
export async function loadCombatAssets(paths: CombatAssetPaths = {}): Promise<CombatAssets> {
  const readAsset = paths.readAsset ?? fetchDaxBytes;
  const floor = [makeFloorTile()];
  const assets: CombatAssets = {
    frameTiles: null, font: null, backdropTiles: floor, enemyIcon: null,
    iconLibrary: new Map(), combatantIcons: new Map(), combatRestyleIcons: new Map(), combatRestyleFallbackCells: new Map(),
    combatRestyleErrors: new Map(), playerAppearances: new Map(), playerAppearanceErrors: new Map(), frameLayout: paths.frameLayout,
    palette: EGA_PALETTE,
    sourcePaths: {
      tilesPath: paths.tilesPath ?? TILES_PATH,
      iconPath: paths.iconPath ?? SPRIT_PATH,
      dungcomPath: paths.dungcomPath ?? DUNGCOM_PATH,
      ...(paths.randcomPath ? { randcomPath: paths.randcomPath } : {}),
    },
  };
  // M9.S3's live EGA<->Amiga switch, extended from dungeon walls to combat backdrops. The Amiga
  // bank is only reachable when the caller both asks for it and declares one; a failed fetch falls
  // back to DOS and `sourcePaths.backdropGraphicSet` records which bank was really read, so a
  // silent fallback cannot be mistaken for a working switch.
  const wantAmiga = paths.graphicsMode === 'Amiga' && !!paths.amigaDungcomPath;
  const dosDungcom = paths.dungcomPath ?? DUNGCOM_PATH;
  const dosRandcom = paths.randcomPath;
  const dungcomPath = wantAmiga ? paths.amigaDungcomPath! : dosDungcom;
  // The RANDCOM bank is appended AFTER the primary one, so the two platforms must agree on whether
  // there is a second bank at all — otherwise the Amiga run would hold 31 tiles where DOS holds 25
  // and every shared tile index past the first bank would point at different art. Substituting an
  // Amiga RANDCOM is therefore conditional on the DOS side having asked for one.
  const randcomPath = wantAmiga ? (dosRandcom ? paths.amigaRandcomPath ?? dosRandcom : undefined) : dosRandcom;

  const [tileBytes, frameTileBytes, spritBytes, dungcomBytesRaw, randcomBytes] = await Promise.all([
    readAsset(paths.tilesPath ?? TILES_PATH),
    paths.frameTilesPath ? readAsset(paths.frameTilesPath) : Promise.resolve(null),
    readAsset(paths.iconPath ?? SPRIT_PATH).catch(() => null),
    readAsset(dungcomPath).catch(() => null),
    randcomPath ? readAsset(randcomPath).catch(() => null) : Promise.resolve(null),
  ]);
  // The Amiga bank is optional art, not a hard dependency: if it is missing, play in DOS colours
  // rather than dropping the backdrop entirely.
  const bankName = (path: string) => path.split('/').pop() ?? path;
  const decodeBank = (bytes: Uint8Array | null, path: string) => {
    try { return bytes ? decodeCombatTerrain(bytes, bankName(path)) : []; } catch { return []; }
  };
  const [dosBytes, dosRandomBytes] = await Promise.all([
    wantAmiga ? readAsset(dosDungcom).catch(() => null) : Promise.resolve(dungcomBytesRaw),
    wantAmiga && dosRandcom && randcomPath !== dosRandcom
      ? readAsset(dosRandcom).catch(() => null) : Promise.resolve(randcomBytes),
  ]);
  const dosFrames = decodeBank(dosBytes, dosDungcom);
  const dosHash = dosBytes && globalThis.crypto?.subtle ? await terrainSha256(dosBytes) : '';
  const pinnedDos = !!cokTerrainRestyleIdentity({ game: paths.runtimeGameId?.startsWith('cok') ? 'cok' : '',
    system: 'DOS-EGA', archive: bankName(dosDungcom), archiveSha256: dosHash, blockId: 1, tileIndex: 0 });
  const dosRandomFrames = decodeBank(dosRandomBytes, dosRandcom ?? '');
  const amigaFrames = wantAmiga ? decodeBank(dungcomBytesRaw, dungcomPath) : [];
  const amigaRandomFrames = wantAmiga && randcomPath !== dosRandcom ? decodeBank(randcomBytes, randcomPath ?? '') : [];
  const usedAmiga = amigaFrames.length > 0 && (!pinnedDos || amigaFrames.length === dosFrames.length);
  const usedAmigaRandom = amigaRandomFrames.length > 0 && (!dosRandomFrames.length || amigaRandomFrames.length === dosRandomFrames.length);
  const primaryFrames = usedAmiga ? amigaFrames : dosFrames;
  const randomFrames = usedAmigaRandom ? amigaRandomFrames : dosRandomFrames;
  const dungcomBytes = usedAmiga ? dungcomBytesRaw : dosBytes;
  const activeRandcomBytes = usedAmigaRandom ? randcomBytes : dosRandomBytes;
  assets.sourcePaths = {
    ...assets.sourcePaths,
    dungcomPath: usedAmiga ? dungcomPath : dosDungcom,
    ...(dosRandcom ? { randcomPath: usedAmigaRandom ? randcomPath : dosRandcom } : {}),
    backdropGraphicSet: usedAmiga ? 'Amiga' : 'DOS-EGA',
  };
  const frameSource = frameTileBytes ?? tileBytes;
  const frameBlockId = paths.frameTilesBlockId ?? FRAME_BLOCK;
  const frameRaw = daxBlocks(frameSource).get(frameBlockId);
  if (frameRaw) assets.frameTiles = decode8x8dBlock(frameRaw, `frame#${frameBlockId}`, { transparentMagenta: true }).tiles;
  assets.font = loadCokFont(tileBytes);
  if (spritBytes) {
    const name = (paths.iconPath ?? SPRIT_PATH).split('/').pop() ?? 'SPRIT.DAX';
    if (globalThis.crypto?.subtle) {
      const digestInput = new ArrayBuffer(spritBytes.byteLength);
      new Uint8Array(digestInput).set(spritBytes);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', digestInput));
      assets.iconArchiveSha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
    assets.iconLibrary = iconLibraryFrom(
      spritBytes,
      name,
      paths.iconTransparentIndices,
      paths.iconIndexRemap,
    );
    assets.enemyIcon = assets.iconLibrary.values().next().value ?? spriteFrom(spritBytes, name);
  }
  if (assets.frameTiles && paths.moonTileIds) {
    assets.moons = paths.moonTileIds.map((id) => assets.frameTiles?.[id] ?? null);
  }
  if (dungcomBytes) {
    const primaryBackdrop = primaryFrames.length ? primaryFrames.map((frame) => frame.image) : null;
    const randomBackdrop = randomFrames.length ? randomFrames.map((frame) => frame.image) : null;
    const backdrop = primaryBackdrop ? [...primaryBackdrop, ...(randomBackdrop ?? [])] : randomBackdrop;
    const origins = await Promise.all([
      { frames: primaryFrames, bytes: dungcomBytes, path: assets.sourcePaths.dungcomPath },
      { frames: randomFrames, bytes: activeRandcomBytes, path: assets.sourcePaths.randcomPath ?? '' },
    ].map(async ({ frames, bytes, path }) => {
      const archiveSha256 = bytes && globalThis.crypto?.subtle ? await terrainSha256(bytes) : '';
      return frames.map(({ blockId, tileIndex }) => ({ game: paths.runtimeGameId?.startsWith('cok') ? 'cok' : paths.runtimeGameId ?? '',
        system: /\.daa$/i.test(path) ? 'Amiga' : 'DOS-EGA', archive: bankName(path), archiveSha256, blockId, tileIndex }));
    }));
    assets.terrainSources = origins.flat();
    assets.terrainRestyleSources = new Map();
    assets.terrainRestyles = new Map();
    assets.terrainRestyleErrors = new Map();
    if (backdrop) {
      assets.backdropTiles = paths.backdropIndexRemap
        ? backdrop.map((image) => {
            const indices = new Uint8Array(image.indices);
            for (let i = 0; i < indices.length; i++) {
              const mapped = paths.backdropIndexRemap?.[indices[i]];
              if (mapped !== undefined) indices[i] = mapped;
            }
            return { ...image, indices };
          })
        : backdrop;
      await Promise.all(dosFrames.map(async (frame, globalIndex) => {
        const source = { game: paths.runtimeGameId?.startsWith('cok') ? 'cok' : paths.runtimeGameId ?? '',
          system: 'DOS-EGA', archive: bankName(dosDungcom), archiveSha256: dosHash,
          blockId: frame.blockId, tileIndex: frame.tileIndex };
        const identity = cokTerrainRestyleIdentity(source);
        if (!identity) return;
        try {
          const original = primaryFrames[globalIndex];
          if (dosFrames.length !== primaryFrames.length || !original || original.tileIndex !== frame.tileIndex
              || original.image.width !== frame.image.width || original.image.height !== frame.image.height) {
            throw new Error('CoK terrain original/DOS slot alignment differs');
          }
          assets.terrainRestyles!.set(globalIndex, await loadCokTerrainRestyle(identity, frame.image));
          assets.terrainRestyleSources!.set(globalIndex, source);
        }
        catch (error) { assets.terrainRestyleErrors!.set(globalIndex, error instanceof Error ? error.message : String(error)); }
      }));
    }
  }
  const colors = [...EGA_PALETTE.colors];
  const merge = (palette?: Palette | null): void => {
    palette?.colors.forEach((color, i) => { if (color) colors[i] = color; });
  };
  merge(assets.frameTiles?.[0]?.palette);
  for (const image of assets.backdropTiles ?? []) merge(image.palette);
  for (const image of assets.iconLibrary.values()) merge(image.palette);
  merge(paths.palette);
  assets.palette = { colors, source: paths.palette?.source ?? EGA_PALETTE.source };
  return assets;
}

/** A demo hero line-up used by the standalone view when no real party has been created. */
function demoParty(): Combatant[] {
  return [
    { id: 'p1', name: 'Sturm', side: 'party', hp: 30, maxHp: 30, thac0: 14, ac: 2, damage: { count: 1, sides: 8, bonus: 2 } },
    { id: 'p2', name: 'Caramon', side: 'party', hp: 34, maxHp: 34, thac0: 13, ac: 3, damage: { count: 1, sides: 8, bonus: 3 } },
    { id: 'p3', name: 'Goldmoon', side: 'party', hp: 20, maxHp: 20, thac0: 17, ac: 4, damage: { count: 1, sides: 6, bonus: 1 } },
    { id: 'p4', name: 'Raistlin', side: 'party', hp: 12, maxHp: 12, thac0: 18, ac: 8, damage: { count: 1, sides: 4, bonus: 0 } },
    // Tasslehoff — a thief, so the demo can exercise backstab (a strike from a foe's rear arc, CT.5c).
    { id: 'p5', name: 'Tasslehoff', side: 'party', hp: 18, maxHp: 18, thac0: 18, ac: 5, damage: { count: 1, sides: 6, bonus: 1 } },
  ];
}

/** Party source for module encounters: created/imported characters when present, otherwise the
 * same explicitly-labelled preview party used by the standalone combat screen. */
export function moduleCombatParty(): { party: Combatant[]; demo: boolean } {
  const current = partyCombatants();
  return current.length > 0 ? { party: current, demo: false } : { party: demoParty(), demo: true };
}

/** Source-neutral assets for an authored/imported event whose own combat art is not implemented
 * (FRUA's no-art flag in the first retail slice). This prevents a module fight from silently
 * borrowing one of the bundled original-game art banks. */
export function moduleNeutralCombatAssets(sourceLabel = 'module:no-art'): CombatAssets {
  return {
    frameTiles: null,
    font: null,
    backdropTiles: [makeFloorTile()],
    enemyIcon: null,
    iconLibrary: new Map(),
    combatantIcons: new Map(),
    combatRestyleIcons: new Map(),
    combatRestyleFallbackCells: new Map(),
    combatRestyleErrors: new Map(),
    playerAppearances: new Map(),
    playerAppearanceErrors: new Map(),
    palette: EGA_PALETTE,
    sourcePaths: {
      tilesPath: sourceLabel,
      iconPath: sourceLabel,
      dungcomPath: sourceLabel,
    },
  };
}

/** The draconian band the standalone demo encounter faces. */
function demoEnemies(): Combatant[] {
  return [
    // `morale` is the CoK percentage (0..102): a draconian routs when its HP-loss% exceeds it (CT.6).
    { id: 'e0', name: 'Draconian', side: 'enemy', hp: 14, maxHp: 14, thac0: 16, ac: 6, damage: { count: 1, sides: 8, bonus: 0 }, xp: 35, hd: 3, morale: 55 },
    { id: 'e1', name: 'Draconian', side: 'enemy', hp: 11, maxHp: 11, thac0: 17, ac: 7, damage: { count: 1, sides: 6, bonus: 0 }, xp: 28, hd: 2, morale: 40 },
    { id: 'e2', name: 'Draconian', side: 'enemy', hp: 16, maxHp: 16, thac0: 15, ac: 6, damage: { count: 1, sides: 8, bonus: 1 }, xp: 42, hd: 3, morale: 55 },
    // A lone Skeleton (undead) so the cleric's Turn command is exercisable in the `?combat=1` demo (CT.5b).
    // Undead get NO `morale` — constructs never check morale (CT.6).
    { id: 'e3', name: 'Skeleton', side: 'enemy', hp: 6, maxHp: 6, thac0: 19, ac: 7, damage: { count: 1, sides: 6, bonus: 0 }, xp: 15, hd: 1 },
    // An Ogre — a Large (2×2) icon — so the CT.7f multi-cell footprint path is exercised in the demo
    // (it blocks four cells, melees from any of them, and is shot at / caught by AoE on any cell).
    { id: 'e4', name: 'Ogre', side: 'enemy', hp: 30, maxHp: 30, thac0: 13, ac: 5, damage: { count: 1, sides: 10, bonus: 3 }, xp: 90, hd: 4, morale: 70 },
  ];
}

/** A melee weapon synthesized from a combatant's base damage (default until real equipment loads, CT.5). */
function meleeWeapon(c: Combatant): Weapon {
  return { name: 'weapon', kind: 'melee', damage: c.damage, reach: 1 };
}
/** A bow so the missile/Aim path is exercisable (placeholder until equipment loading, CT.5). */
function bow(): Weapon {
  return { name: 'bow', kind: 'missile', damage: { count: 1, sides: 6, bonus: 0 }, range: 8, ammo: 20 };
}

/** Build one engine combatant: weapons from base damage (party hero #0 also a bow), sane move/attacks. */
/**
 * Demo spellbooks for the `?combat=1` standalone battle (keyed by demo combatant id), so the **Cast**
 * command is exercisable end-to-end. These are real AD&D-1e / COAB spell values (the dice live in the
 * ruleset's `spellEffect()` table; mirrored here for the self-contained demo). The REAL encounter path
 * passes plain `Combatant`s with no spellbook — wiring a character's *memorized* spells into combat is
 * the follow-up (CT.4b). The combat engine's spell math itself is faithful-by-construction and tested;
 * the Krynn games' own in-binary spell-damage formula is cross-overlay/UNLOCATED (disasm-spells-krynn.md).
 */
const DEMO_SPELLBOOKS: Record<string, TacticalSpell[]> = {
  // Goldmoon — cleric: in-combat heal.
  p3: [{ id: 'cure-light', name: 'Cure Light Wounds', target: 'ally', range: 1, area: 'single', save: 'none', heal: { count: 1, sides: 8, bonus: 0 }, usesLeft: 3 }],
  // Raistlin — magic-user: a single-target bolt, an area blast (half-on-save), and Sleep (status, CT.5a).
  p4: [
    { id: 'sleep', name: 'Sleep', target: 'enemy', range: 12, area: 'burst', radius: 2, save: 'none', inflict: { status: 'asleep', rounds: 99, hdCap: 4 }, usesLeft: 1 },
    { id: 'magic-missile', name: 'Magic Missile', target: 'enemy', range: 8, area: 'single', save: 'none', damage: { count: 2, sides: 4, bonus: 2 }, usesLeft: 3 },
    { id: 'fireball', name: 'Fireball', target: 'enemy', range: 10, area: 'burst', radius: 1, save: 'half', damage: { count: 1, sides: 6, bonus: 0, perLevel: true }, casterLevel: 5, usesLeft: 1 },
  ],
};

/**
 * Demo turn-undead levels for the `?combat=1` standalone battle (keyed by demo combatant id): Goldmoon
 * (p3) is a level-5 cleric. The REAL encounter path computes each cleric's turning level from their
 * character record + deity (CT.5b) via {@link turnLevelForMember}.
 */
const DEMO_TURNERS: Record<string, number> = { p3: 5 };

/**
 * Demo thief levels for the `?combat=1` standalone battle (keyed by demo combatant id): Tasslehoff (p5)
 * is a level-6 thief (backstab ×3). The REAL encounter path reads each member's thief level from their
 * character record (CT.5c) via {@link backstabLevelForMember}.
 */
const DEMO_BACKSTABBERS: Record<string, number> = { p5: 6 };

/**
 * Nominal caster level fed to a monster's own memorized spells (M31.S1) when the figure carries no
 * `hd` (Hit Dice — the only stat this abstract model has that could plausibly proxy a caster's power).
 * No Gen1 monster record format stores an actual caster level (`docs/engine/research/m31-audit.md`
 * Part 1(d)) — this is an honestly-labelled inferred default, not a decoded value; it only scales the
 * magnitude of `perLevel` dice (Fireball, Cone of Cold), never whether a spell is castable at all.
 */
const MONSTER_NOMINAL_CASTER_LEVEL = 6;

/**
 * Build one engine `TacticalCombatant`. For a real party member (`demo` false) the prepared spells +
 * save-vs-spell come from the character's *memorized* set and own saving throws (CT.4b), and the cleric's
 * turn-undead level from their record (CT.5b); the standalone `?combat=1` demo party (`demo` true, no
 * roster behind it) falls back to the hand-built {@link DEMO_SPELLBOOKS} / {@link DEMO_TURNERS}. An
 * **enemy** with a real memorized spellbook (M31.S1: `c.preparedSpellIds`, sourced from a DoK monster's
 * `MON{n}WIZ.DAX` side-table via `monsterCombatant()`) gets it crosswalked into real `TacticalSpell`s by
 * {@link preparedSpellsFromDokIds} — `undefined` for the ~50/64 DoK area-1 monsters with no WIZ entry,
 * every CoK monster (no such file), and demo enemies, which all keep the pre-existing mute default. A
 * real CoK monster gets its own save-vs-spell too (M27.S1: `c.monsterSpellSave`, sourced from
 * `MonsterRecord.savingThrows.spell` via `monsterCombatant()`) — `undefined` for DoK (saves unlocated,
 * gap B5) or a demo/unresolved enemy, which then keep the pre-existing "never saves" default. Enemies'
 * **undead / turn-immune** status is classified from the monster name (CT.5b) so turn-undead finds its
 * targets in any real fight. A real party member also gets their warrior **multiple-attacks** breakpoint
 * (M16.S1, ovr026 `ReclacClassBonuses`) via {@link multiAttackHalfSteps} — `undefined` for everyone else
 * (demo party, enemies), who keep the plain 1/round default. `day` (M22.S2) feeds a robed party mage's
 * own moon-phase saving-throw shift inside {@link spellSaveForMember}.
 */
function makeTC(
  c: Combatant,
  pos: GridPos,
  side: 'party' | 'enemy',
  i: number,
  demo: boolean,
  day: number,
  facing?: Facing,
  persistentPartyMember = side === 'party',
): TacticalCombatant {
  const sourceBackedNpc = side === 'party' && !persistentPartyMember;
  const prepared = persistentPartyMember
    ? (demo ? DEMO_SPELLBOOKS[c.id] : combatSpellsForMember(c.id))
    : preparedSpellsFromDokIds(c.preparedSpellIds, c.hd ?? MONSTER_NOMINAL_CASTER_LEVEL);
  const cls = side === 'enemy' || sourceBackedNpc ? classifyUndead(c.name) : null;
  // CT.7k-2 — a Large (2×2) icon comes from the monster record's byte-located size byte (CoK @207) when the
  // spawn carried it (`c.combatSize`); otherwise (demo enemies, DoK compact record, unresolved ids) fall
  // back to the CT.7f name heuristic. Real PCs are always 1×1; source-backed friendly NPCs keep
  // the same record-owned footprint they would have had on the hostile side.
  const size = persistentPartyMember ? 1 : (c.combatSize ?? monsterFootprint(c.name));
  // CT.7k-1 — a REAL party member fights with their EQUIPPED weapon + carried-weight movement rate from
  // their character record (gated behind `demo`, exactly like CT.4b did for spells). The standalone
  // `?combat=1` demo party (no roster behind it) keeps the placeholder synthesis below. A real member with
  // no resolvable gear (helper returns undefined) also falls back, so the figure can always act.
  const realWeapons = persistentPartyMember && !demo ? weaponsForMember(c.id) : undefined;
  const realMove = persistentPartyMember && !demo ? moveRateForMember(c.id) : undefined;
  // Placeholder weapons (demo party / unresolved): base-damage melee, the first hero also a bow.
  const placeholderWeapons = persistentPartyMember && i === 0 ? [meleeWeapon(c), bow()] : [meleeWeapon(c)];
  return {
    ...c,
    // The placement caller is authoritative. This matters for temporary demo NPC records, whose
    // source object may have been constructed with the monster-side default before being recruited.
    side,
    ...(sourceBackedNpc ? { npcControlled: true } : {}),
    pos: { ...pos },
    size,
    facing: facing ?? (side === 'party' ? 0 : 4), // default normalized grid: party east, enemies west
    move: realMove ?? (persistentPartyMember ? 5 : 4),
    attacksPerRound: 1,
    halfAttacks: persistentPartyMember && !demo ? multiAttackHalfSteps(c.id) : undefined,
    weapons: side === 'party' ? (realWeapons ?? placeholderWeapons) : [meleeWeapon(c)],
    preparedSpells: prepared,
    save: persistentPartyMember && !demo ? spellSaveForMember(c.id, day) : c.monsterSpellSave,
    turnLevel: persistentPartyMember ? (demo ? DEMO_TURNERS[c.id] : turnLevelForMember(c.id)) : undefined,
    backstabLevel: persistentPartyMember ? (demo ? DEMO_BACKSTABBERS[c.id] : backstabLevelForMember(c.id)) : undefined,
    undead: cls ? (c.undead ?? cls.undead) : c.undead,
    turnImmune: cls ? (c.turnImmune ?? cls.turnImmune) : c.turnImmune,
    flags: new Set(),
  };
}

const inBounds = (c: number, r: number, t: TerrainGrid): boolean => c >= 0 && r >= 0 && c < t.width && r < t.height;
/** Can a `size`×`size` figure anchored (top-left) at (c,r) stand here: every footprint cell in bounds, not a wall, not taken (CT.7f). */
function cellFree(c: number, r: number, t: TerrainGrid, occ: ReadonlySet<string>, size = 1): boolean {
  for (const cell of footprintCells({ col: c, row: r }, size)) {
    if (!inBounds(cell.col, cell.row, t)) return false;
    if (t.blocked?.(cell.col, cell.row) ?? false) return false;
    if (occ.has(`${cell.col},${cell.row}`)) return false;
  }
  return true;
}
/** Spiral out from (c,r) to the nearest anchor whose whole `size`×`size` footprint is free (handles walls/occupied start ranks). */
function findFreeNear(c: number, r: number, t: TerrainGrid, occ: ReadonlySet<string>, size = 1): GridPos | null {
  const maxR = Math.max(t.width, t.height);
  for (let rad = 0; rad <= maxR; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        if (cellFree(c + dc, r + dr, t, occ, size)) return { col: c + dc, row: r + dr };
      }
    }
  }
  return null;
}

function encounterDistance(setup?: EncounterSetup): number | undefined {
  if (!setup) return undefined;
  const d = Math.floor(setup.distance);
  return Number.isFinite(d) ? Math.max(1, d) : undefined;
}

function mapDirectionDelta(mapDirection?: number): readonly [number, number] | undefined {
  if (mapDirection === undefined) return undefined;
  const dir = ((Math.floor(mapDirection) % 8) + 8) % 8;
  const deltas: ReadonlyArray<readonly [number, number]> = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1],
  ];
  return deltas[dir];
}

function tacticalFacingFromMapDirection(mapDirection?: number): Facing | undefined {
  if (mapDirection === undefined) return undefined;
  const dir = ((Math.floor(mapDirection) % 8) + 8) % 8;
  return ((dir + 6) % 8) as Facing;
}

function anchorAtEncounterDistance(partyAnchor: GridPos, enemyAnchor: GridPos, terrain: TerrainGrid, distance?: number, mapDirection?: number): GridPos {
  if (distance === undefined) return enemyAnchor;
  const dir = mapDirectionDelta(mapDirection);
  const fallbackStepCol = Math.sign(enemyAnchor.col - partyAnchor.col) || 1;
  const stepRow = dir?.[1] ?? Math.sign(enemyAnchor.row - partyAnchor.row);
  return {
    col: Math.max(0, Math.min(terrain.width - 1, partyAnchor.col + (dir?.[0] ?? fallbackStepCol) * distance)),
    row: Math.max(0, Math.min(terrain.height - 1, partyAnchor.row + stepRow * distance)),
  };
}

function backgroundIdsFromTerrain(t: TerrainGrid): number[] {
  const ids: number[] = [];
  for (let row = 0; row < t.height; row++) {
    for (let col = 0; col < t.width; col++) {
      if (t.blocked?.(col, row)) {
        ids.push(2 + ((col + row) % 3)); // blocked BackGroundTiles ids with visible DUNGCOM tile indices 1..3
        continue;
      }
      const cost = t.cost?.(col, row) ?? 1;
      const hazard = t.hazard?.(col, row);
      ids.push(hazard ? 60 : cost > 1 ? 48 : 0);
    }
  }
  return ids;
}

function coabCloudHazard(kind: CoabGasCloudKind): TerrainHazard {
  return kind === 'stinking'
    ? { kind: 'stinking-cloud', blocksEntryOnFailedSave: true, noxiousCloud: true }
    : { kind: 'cloudkill', blocksEntryBelowHd: 7, cloudkillPoison: true };
}

function coabCloudAt(tileState: CoabCombatTileState | null, col: number, row: number): CoabGasCloudKind | null {
  if (!tileState) return null;
  for (let i = tileState.clouds.length - 1; i >= 0; i--) {
    const cloud = tileState.clouds[i]!;
    if (cloud.cells.some((c) => c.present && c.col === col && c.row === row)) return cloud.kind;
  }
  return null;
}

function terrainWithCoabTileState(base: TerrainGrid, tileState: CoabCombatTileState | null): TerrainGrid {
  if (!tileState) return base;
  return {
    ...base,
    blocked: (col, row) => tileState.terrain.blocked?.(col, row) ?? base.blocked?.(col, row) ?? false,
    blocksSight: (col, row) => tileState.terrain.blocksSight?.(col, row) ?? base.blocksSight?.(col, row) ?? base.blocked?.(col, row) ?? false,
    cost: (col, row) => tileState.terrain.cost?.(col, row) ?? base.cost?.(col, row) ?? 1,
    hazard: (col, row) => {
      const cloud = coabCloudAt(tileState, col, row);
      return cloud ? coabCloudHazard(cloud) : base.hazard?.(col, row);
    },
  };
}

function demoBackgroundIds(width: number, height: number): number[] {
  const ids = new Array<number>(width * height).fill(0);
  const set = (col: number, row: number, id: number): void => {
    if (col >= 0 && row >= 0 && col < width && row < height) ids[row * width + col] = id;
  };
  for (let col = 0; col < width; col++) {
    set(col, 0, 2 + (col % 3));
    set(col, height - 1, 2 + ((col + 1) % 3));
  }
  for (let row = 0; row < height; row++) {
    set(0, row, 3 + (row % 2));
    set(width - 1, row, 2 + (row % 3));
  }
  for (let row = 2; row <= 6; row++) set(6, row, 2 + (row % 3));
  for (let col = 3; col <= 5; col++) set(col, 3, 48 + ((col - 3) % 3));
  for (let col = 7; col <= 9; col++) set(col, 5, 60 + ((col - 7) % 3));
  set(6, 4, 0); // keep a door-like gap through the centre wall.
  return ids;
}

function backgroundSummary(ids: readonly number[] | null | undefined, width: number, height: number): { w: number; h: number; cells: number; checksum: number; nonFloor: number } | null {
  if (!ids) return null;
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

const MAX_PLAYER_COMBATANTS = 6;

function placementSize(c: Combatant, persistentPartyMember: boolean): number {
  return persistentPartyMember ? 1 : (c.combatSize ?? monsterFootprint(c.name));
}

function reservePlacement(
  pos: GridPos,
  size: number,
  terrain: TerrainGrid,
  occupied: Set<string>,
  label: string,
  mode: 'explicit' | 'anchor' | 'flat',
): void {
  if (!cellFree(pos.col, pos.row, terrain, occupied, size)) {
    throw new Error(
      `Combat ${mode} placement cannot seat ${label} at (${pos.col},${pos.row}) with ${size}×${size} footprint`,
    );
  }
  for (const cell of footprintCells(pos, size)) occupied.add(`${cell.col},${cell.row}`);
}

function findAndReservePlacement(
  seed: GridPos,
  size: number,
  terrain: TerrainGrid,
  occupied: Set<string>,
  label: string,
  mode: 'explicit' | 'anchor' | 'flat',
): GridPos {
  const pos = findFreeNear(seed.col, seed.row, terrain, occupied, size);
  if (!pos) {
    throw new Error(
      `Combat ${mode} placement cannot seat ${label} with ${size}×${size} footprint ` +
      `on the ${terrain.width}×${terrain.height} tactical map`,
    );
  }
  reservePlacement(pos, size, terrain, occupied, label, mode);
  return pos;
}

function assertUniqueCombatantIds(
  party: readonly Combatant[],
  friendlyNpcs: readonly Combatant[],
  enemies: readonly Combatant[],
): void {
  const seen = new Set<string>();
  for (const c of [...party, ...friendlyNpcs, ...enemies]) {
    if (seen.has(c.id)) throw new Error(`Combat roster contains duplicate id ${JSON.stringify(c.id)}`);
    seen.add(c.id);
  }
}

function tryCoabSourceTacticalPlacement(
  party: Combatant[],
  friendlyNpcs: Combatant[],
  enemies: Combatant[],
  demo: boolean,
  day: number,
  terrain: TerrainGrid,
  encounterDistance?: number,
  mapDirection?: number,
  partyStart?: GridPos,
): TacticalCombatant[] | null {
  if (terrain.width !== 50 || terrain.height !== 25) return null;
  const visibleParty = party.slice(0, MAX_PLAYER_COMBATANTS);
  const allies = [...visibleParty, ...friendlyNpcs];
  const dep = deployCoabSourceCombatants(
    allies.length,
    enemies.length,
    mapDirection ?? 2,
    encounterDistance ?? 10,
    {
      partyStart,
      wilderness: true,
      partySizes: allies.map((c, i) => i < visibleParty.length ? 1 : (c.coabSourceSize ?? c.combatSize ?? 1)),
      enemySizes: enemies.map((c) => c.coabSourceSize ?? c.combatSize ?? 1),
      blocked: (col, row) =>
        col < 0 || row < 0 || col >= terrain.width || row >= terrain.height ||
        (terrain.blocked?.(col, row) ?? false),
    },
  );
  if (dep.party.length !== allies.length || dep.enemies.length !== enemies.length) return null;

  const occ = new Set<string>();
  const combatants: TacticalCombatant[] = [];
  for (const [i, c] of allies.entries()) {
    const seed = dep.party[i]?.pos;
    if (!seed) return null;
    const persistentPartyMember = i < visibleParty.length;
    const size = placementSize(c, persistentPartyMember);
    const pos = findFreeNear(seed.col, seed.row, terrain, occ, size);
    if (!pos) return null;
    for (const cell of footprintCells(pos, size)) occ.add(`${cell.col},${cell.row}`);
    combatants.push(makeTC(c, pos, 'party', i, demo, day, dep.party[i]?.facing, persistentPartyMember));
  }
  for (const [i, c] of enemies.entries()) {
    const seed = dep.enemies[i]?.pos;
    if (!seed) return null;
    const size = placementSize(c, false);
    const pos = findFreeNear(seed.col, seed.row, terrain, occ, size);
    if (!pos) return null;
    for (const cell of footprintCells(pos, size)) occ.add(`${cell.col},${cell.row}`);
    combatants.push(makeTC(c, pos, 'enemy', i, demo, day, dep.enemies[i]?.facing, false));
  }
  return combatants;
}

/**
 * Position the two lines and build the engine combatants. At most six real PCs enter, followed by
 * every explicitly supplied friendly NPC; enemies are never roster-capped. With a real encounter
 * `terrain` + anchors (CT.3) the lines form up around those anchors on open cells; otherwise a flat
 * 13×9 field is used (party west rank, enemies east). A roster that cannot fit its exact footprints
 * fails instead of dropping figures or stacking them on the same cell.
 */
function toTactical(
  party: Combatant[],
  friendlyNpcs: Combatant[] = [],
  enemies: Combatant[],
  demo: boolean,
  day: number,
  terrain?: TerrainGrid,
  partyAnchor?: GridPos,
  enemyAnchor?: GridPos,
  encounterDistance?: number,
  mapDirection?: number,
  recoveredBackgroundIds?: readonly number[],
  ruleset: CombatRuleset = 'gen1',
  demoHazard = false,
  partyPositions?: readonly GridPos[],
  enemyPositions?: readonly GridPos[],
  allowCoabSourcePlacement = true,
  coabPartyStart?: GridPos,
): { combatants: TacticalCombatant[]; terrain: TerrainGrid; backgroundIds: readonly number[] | null; placementMode: 'coab-source' | 'explicit' | 'anchor' | 'flat' } {
  const visibleParty = party.slice(0, MAX_PLAYER_COMBATANTS);
  assertUniqueCombatantIds(visibleParty, friendlyNpcs, enemies);

  if (
    terrain &&
    partyPositions?.length && enemyPositions?.length &&
    partyPositions.length >= visibleParty.length && enemyPositions.length >= enemies.length
  ) {
    const occupied = new Set<string>();
    const placedParty = visibleParty.map((c, i) => {
      const pos = { ...partyPositions[i]! };
      reservePlacement(pos, 1, terrain, occupied, `player ${c.id}`, 'explicit');
      return { c, pos };
    });
    const placedEnemies = enemies.map((c, i) => {
      const pos = { ...enemyPositions[i]! };
      reservePlacement(pos, placementSize(c, false), terrain, occupied, `enemy ${c.id}`, 'explicit');
      return { c, pos };
    });
    const friendlyAnchor = placedParty[0]?.pos ?? partyAnchor ?? { col: 0, row: 0 };
    const placedFriendlyNpcs = friendlyNpcs.map((c, i) => {
      const off = PARTY_OFFSETS[visibleParty.length + i] ?? [0, 0];
      const pos = findAndReservePlacement(
        { col: friendlyAnchor.col + off[0], row: friendlyAnchor.row + off[1] },
        placementSize(c, false),
        terrain,
        occupied,
        `friendly NPC ${c.id}`,
        'explicit',
      );
      return { c, pos };
    });
    const combatants: TacticalCombatant[] = [];
    placedParty.forEach(({ c, pos }, i) => {
      combatants.push(makeTC(c, pos, 'party', i, demo, day, 2, true));
    });
    placedFriendlyNpcs.forEach(({ c, pos }, i) => {
      combatants.push(makeTC(c, pos, 'party', visibleParty.length + i, demo, day, 2, false));
    });
    placedEnemies.forEach(({ c, pos }, i) => {
      combatants.push(makeTC(c, pos, 'enemy', i, demo, day, 6, false));
    });
    return { combatants, terrain, backgroundIds: backgroundIdsFromTerrain(terrain), placementMode: 'explicit' };
  }
  if (terrain && partyAnchor && enemyAnchor) {
    if (allowCoabSourcePlacement && ruleset !== 'gen2' && recoveredBackgroundIds?.length === 50 * 25) {
      const sourcePlaced = tryCoabSourceTacticalPlacement(
        visibleParty,
        friendlyNpcs,
        enemies,
        demo,
        day,
        terrain,
        encounterDistance,
        mapDirection,
        coabPartyStart,
      );
      if (sourcePlaced) return { combatants: sourcePlaced, terrain, backgroundIds: backgroundIdsFromTerrain(terrain), placementMode: 'coab-source' };
    }
    const occ = new Set<string>();
    const combatants: TacticalCombatant[] = [];
    const partyFacing = tacticalFacingFromMapDirection(mapDirection) ?? 0;
    const enemyFacing = ((partyFacing + 4) % 8) as Facing;
    const placeLine = (
      list: Combatant[],
      anchor: GridPos,
      offsets: ReadonlyArray<readonly [number, number]>,
      side: 'party' | 'enemy',
      persistentPartyMember: boolean,
      indexOffset = 0,
    ): void => {
      list.forEach((c, i) => {
        const off = offsets[indexOffset + i] ?? [0, 0];
        const size = placementSize(c, persistentPartyMember);
        const pos = findAndReservePlacement(
          { col: anchor.col + off[0], row: anchor.row + off[1] },
          size,
          terrain,
          occ,
          `${persistentPartyMember ? 'player' : side === 'party' ? 'friendly NPC' : 'enemy'} ${c.id}`,
          'anchor',
        );
        combatants.push(makeTC(
          c,
          pos,
          side,
          indexOffset + i,
          demo,
          day,
          side === 'party' ? partyFacing : enemyFacing,
          persistentPartyMember,
        ));
      });
    };
    placeLine(visibleParty, partyAnchor, PARTY_OFFSETS, 'party', true);
    placeLine(friendlyNpcs, partyAnchor, PARTY_OFFSETS, 'party', false, visibleParty.length);
    placeLine(
      enemies,
      anchorAtEncounterDistance(partyAnchor, enemyAnchor, terrain, encounterDistance, mapDirection),
      ENEMY_OFFSETS,
      'enemy',
      false,
    );
    return { combatants, terrain, backgroundIds: backgroundIdsFromTerrain(terrain), placementMode: 'anchor' };
  }
  // Flat fallback field. CT.7f — placement is footprint-aware so a Large (2×2) monster never starts
  // overlapping another figure: each combatant nudges to the nearest anchor whose whole footprint is free.
  const combatants: TacticalCombatant[] = [];
  const backgroundIds = demoBackgroundIds(MAP_W, MAP_H);
  const flatTerrain = terrainGridFromBackgroundMap(MAP_W, MAP_H, backgroundIds);
  const flatOcc = new Set<string>();
  // CT.8 — seed the two ranks from the engine's verified deployment formation (ovr011
  // PlaceCombatants): party anchors (0,0) facing +col (east), enemies `encDist` cells away facing
  // −col, both filling the 13×9 field. deployCombatants is wall/footprint-AGNOSTIC (single-cell
  // positions only), so the findFreeNear() footprint nudge + occ reservation below MUST stay to
  // seat Large 2×2 monsters and dedup (the #1 regression trap). Static PARTY_POS/ENEMY_POS remain
  // as the fallback when the deploy grid can't seat a figure.
  const allies = [...visibleParty, ...friendlyNpcs];
  const dep = demo ? null : deployCombatants(allies.length, enemies.length, mapDirection ?? 2, encounterDistance ?? 10, { region: { width: MAP_W, height: MAP_H } });
  allies.forEach((c, i) => {
    const persistentPartyMember = i < visibleParty.length;
    const fallback = { col: PARTY_POS[i]?.[0] ?? 1, row: PARTY_POS[i]?.[1] ?? Math.min(MAP_H - 1, i) };
    const seed = dep?.party[i]?.pos ?? fallback;
    const pos = findAndReservePlacement(
      seed,
      placementSize(c, persistentPartyMember),
      flatTerrain,
      flatOcc,
      `${persistentPartyMember ? 'player' : 'friendly NPC'} ${c.id}`,
      'flat',
    );
    combatants.push(makeTC(c, pos, 'party', i, demo, day, dep?.party[i]?.facing, persistentPartyMember));
  });
  enemies.forEach((c, i) => {
    const fallback = { col: ENEMY_POS[i]?.[0] ?? MAP_W - 2, row: ENEMY_POS[i]?.[1] ?? Math.min(MAP_H - 1, i) };
    const seed = dep?.enemies[i]?.pos ?? fallback;
    const pos = findAndReservePlacement(
      seed,
      placementSize(c, false),
      flatTerrain,
      flatOcc,
      `enemy ${c.id}`,
      'flat',
    );
    combatants.push(makeTC(c, pos, 'enemy', i, demo, day, dep?.enemies[i]?.facing, false));
  });
  // CT.7b — the standalone demo (`?combat=1`) lays a web patch across the centre of the field so the
  // hazard machinery is exercisable (a figure ending its move there is held, save-negates). Real
  // encounters get their hazards from spell zones / the encounter terrain, not this demo strip.
  const terrainOut: TerrainGrid = demoHazard
    ? {
        ...flatTerrain,
        hazard: (col, row) =>
          col === Math.floor(MAP_W / 2) && row >= 3 && row <= 5
            ? { kind: 'web', status: 'held', rounds: 3, save: true }
            : undefined,
      }
    : flatTerrain;
  return { combatants, terrain: terrainOut, backgroundIds, placementMode: 'flat' };
}

// ── Viewport ─────────────────────────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Scroll the 7×7 window so `pos` is centred (clamped to the map), like COAB `mapScreenTopLeft`. */
function recenterOn(pos: { col: number; row: number }): void {
  if (!state) return;
  const t = state.combat.terrain;
  state.view.col = clamp(pos.col - VIEW_HALF, 0, Math.max(0, t.width - VIEW));
  state.view.row = clamp(pos.row - VIEW_HALF, 0, Math.max(0, t.height - VIEW));
}

// ── Rendering ────────────────────────────────────────────────────────────────────────────────

/** Build the on-screen cells for the current viewport: each living/down figure inside the window. */
function visibleCells(): CombatCellState[] {
  if (!state) return [];
  const cells: CombatCellState[] = [];
  for (const c of state.combatants) {
    // M71.S1 — a surrendered figure (applyMoraleOutcome()) keeps full HP and is not `fled`, but is
    // isActive()===false (excluded from targeting/turn order) same as a fled one; stop drawing it too,
    // matching `fled`'s existing treatment (this is what CombatCellState.impaired's own doc comment
    // already claimed happened, but the code never actually skipped it until now).
    if (c.flags.has('fled') || c.flags.has('surrendered')) continue; // left the field / gave up
    const sc = c.pos.col - state.view.col;
    const sr = c.pos.row - state.view.row;
    if (sc < 0 || sc >= VIEW || sr < 0 || sr >= VIEW) continue;
    cells.push({
      combatantId: c.id, side: c.side, col: sc, row: sr,
      icon: state.assets.combatantIcons.get(c.id) ?? (c.side === 'enemy' ? state.assets.enemyIcon : null),
      down: c.hp <= 0,
      active: c.id === state.activeId,
      size: state.combat.sizeOf(c.id), // CT.7i — Large (2×2) monsters paint across their footprint
      // M70.S1 — mirrors panelRows()'s own impaired check (M69.S1), but here for EITHER side (this
      // loop, unlike panelRows(), isn't filtered to `side === 'party'`) — covers the enemy grid icon
      // AND the party's own on-grid icon (previously only the sidebar row reflected this for the party).
      impaired: c.flags.has('asleep') || c.flags.has('held') || c.flags.has('feared') || c.flags.has('slowed'),
      // M71.S1 — mirrors impaired's wiring, for the one TacticalStatusFlag it doesn't cover: a readied
      // ambush that will strike the next foe to approach (CT.7d). Real for either side.
      guarding: c.flags.has('guarding'),
    });
  }
  return cells;
}

const COK_RESTYLE_OUTPUT_SCALE = 4;
const COK_RESTYLE_SURFACE = {
  ...DOS_EGA,
  nativeWidth: DOS_EGA.nativeWidth * COK_RESTYLE_OUTPUT_SCALE,
  nativeHeight: DOS_EGA.nativeHeight * COK_RESTYLE_OUTPUT_SCALE,
};

function cellsAndRgbaLayers(cells: CombatCellState[]): {
  cells: CombatCellState[];
  layers: { art: RgbaArt; x: number; y: number; pixelScale: number }[];
} {
  if (!state) return { cells, layers: [] };
  const layers: { art: RgbaArt; x: number; y: number; pixelScale: number }[] = [];
  const replaced = new Set<string>();
  for (const cell of cells) {
    if (cell.down || cell.impaired || cell.guarding) continue;
    const cellSize = cell.size ?? 1;
    const playerPresentation = resolveCokPlayerPresentation(state.assets.playerAppearances.get(cell.combatantId), {
      consumer: 'combat-party-icon', mode: state.requestedGraphicsMode, playback: 'still',
      fallback: state.runtimeGameId ? readRuntimeGraphicsFallback(state.runtimeGameId) : 'DOS-EGA' });
    if (playerPresentation.state === 'ready') {
      const playerFrame = playerPresentation.frame;
      // Character appearances currently describe a single-cell footprint. Large enemies may use
      // the bank-scoped CPIC Restyle path below, whose native frame is centered on their full tile footprint.
      if (cellSize !== 1) continue;
      const rectX = state.geometry.originX + cell.col * state.geometry.cellW;
      const rectY = state.geometry.originY + cell.row * state.geometry.cellH;
      const nativeWidth = playerFrame.original.width / playerFrame.pixelScale;
      const nativeHeight = playerFrame.original.height / playerFrame.pixelScale;
      layers.push({
        art: playerPresentation.art,
        x: Math.round(rectX + state.geometry.cellW / 2 - nativeWidth / 2),
        y: rectY + state.geometry.cellH - nativeHeight,
        pixelScale: playerFrame.pixelScale,
      });
      replaced.add(cell.combatantId);
      continue;
    }
    if (!state.requestedRestyle || state.assets.combatRestyleIcons.size === 0) continue;
    const pictureId = state.combatantPictureIds.get(cell.combatantId);
    if (pictureId === undefined) continue;
    const identity = cokCombatRestyleIdentity(pictureId, state.assets.iconArchiveSha256);
    const art = state.assets.combatRestyleIcons.get(pictureId);
    const original = state.assets.combatantIcons.get(cell.combatantId);
    if (!identity || !art || !original) continue;
    if (original.width !== identity.nativeWidth || original.height !== identity.nativeHeight) {
      state.assets.combatRestyleErrors.set(pictureId, 'source frame geometry differs from the pinned CPIC icon');
      continue;
    }
    const rectX = state.geometry.originX + cell.col * state.geometry.cellW;
    const rectY = state.geometry.originY + cell.row * state.geometry.cellH;
    const footprintWidth = state.geometry.cellW * cellSize;
    const footprintHeight = state.geometry.cellH * cellSize;
    const x = Math.round(rectX + footprintWidth / 2 - original.width / 2);
    const y = rectY + footprintHeight - original.height;
    layers.push({ art, x, y, pixelScale: identity.pixelScale });
    replaced.add(cell.combatantId);
  }
  if (replaced.size === 0) return { cells, layers };
  const blankByOriginal = new Map<IndexedImage, IndexedImage>();
  const replacedCells = cells.map((cell) => {
    if (!replaced.has(cell.combatantId)) return cell;
    const original = cell.icon;
    if (!original) {
      return {
        ...cell,
        icon: { width: 1, height: 1, xOffset: 0, yOffset: 0, indices: new Uint8Array([0]), transparentIndex: 0, palette: null },
      };
    }
    let blank = blankByOriginal.get(original);
    if (!blank) {
      blank = { ...original, indices: new Uint8Array(original.width * original.height), transparentIndex: 0 };
      blankByOriginal.set(original, blank);
    }
    return { ...cell, icon: blank };
  });
  return { cells: replacedCells, layers };
}

/** Restore the active-unit box above high-resolution combat art, matching composeCombatScreen order. */
function paintRestyleCombatCursor(cells: readonly CombatCellState[]): void {
  const active = cells.find((cell) => cell.active);
  if (!state || !active) return;
  const rect = state.surface.rect();
  const ctx = state.surface.canvas.getContext('2d');
  if (!rect || !ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const profile = state.surface.profile();
  const sx = rect.width / profile.nativeWidth;
  const sy = rect.height / profile.nativeHeight;
  const x0 = (rect.x + (state.geometry.originX + active.col * state.geometry.cellW) * COK_RESTYLE_OUTPUT_SCALE * sx) * dpr;
  const y0 = (rect.y + (state.geometry.originY + active.row * state.geometry.cellH) * COK_RESTYLE_OUTPUT_SCALE * sy) * dpr;
  const w = state.geometry.cellW * COK_RESTYLE_OUTPUT_SCALE * sx * dpr;
  const h = state.geometry.cellH * COK_RESTYLE_OUTPUT_SCALE * sy * dpr;
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, Math.round(dpr));
  ctx.strokeRect(Math.round(x0) + 1, Math.round(y0) + 1, Math.max(1, Math.round(w) - 2), Math.max(1, Math.round(h) - 2));
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(1, Math.round(dpr));
  ctx.strokeRect(Math.round(x0) + 3, Math.round(y0) + 3, Math.max(1, Math.round(w) - 6), Math.max(1, Math.round(h) - 6));
  ctx.restore();
}

function rowForCombatant(c: TacticalCombatant, active: boolean): ExploreParty {
  return {
    name: state!.names.get(c.id) ?? c.id,
    ac: c.ac,
    hp: Math.max(0, c.hp),
    active,
    // M42.S1 — the same fact visibleCells() derives inline for the grid icon, routed through the
    // engine's own tested conditionOf() (one source of truth for "down") instead of a 2nd formula.
    down: state!.combat.conditionOf(c.id) !== 'ok',
    // M69.S1 — c.flags is the same live TacticalCombatant Set inflictStatus()/tickStatuses() mutate
    // every round (CT.5a); asleep/held silently skip the actor's turn (positionCursor), feared
    // strips Attack/Cast from legalActions() while still letting the turn happen — neither was ever
    // visible on this persistent panel before now (only a one-time, scroll-prone log line).
    impaired: c.flags.has('asleep') || c.flags.has('held') || c.flags.has('feared') || c.flags.has('slowed'),
    // M71.S1 — a party member who chose Guard this fight; a reminder that they'll strike back if a
    // foe closes, since the only other trace is a single scrolling combat-log line.
    guarding: c.flags.has('guarding'),
  };
}

function partyPanelRows(): ExploreParty[] {
  if (!state) return [];
  return state.combatants
    .filter((c) => c.side === 'party')
    .map((c) => rowForCombatant(c, c.id === state!.activeId));
}

function selectedTargetForSummary(): TacticalCombatant | null {
  if (!state || state.phase !== 'party-target') return null;
  const allyConfirmTargetId = state.allyConfirmTargetId;
  if (allyConfirmTargetId) {
    return state.combatants.find((c) => c.id === allyConfirmTargetId) ?? null;
  }
  if (state.manualAim) {
    const manualId = manualTargetAtCursor();
    return manualId ? state.combatants.find((c) => c.id === manualId) ?? null : null;
  }
  const selectedId = state.targets[state.targetIdx];
  return selectedId ? state.combatants.find((c) => c.id === selectedId) ?? null : null;
}

function panelRows(): ExploreParty[] {
  if (!state) return [];
  return partyPanelRows();
}

function summaryStatus(c: TacticalCombatant): string | null {
  // CoAB CombatDisplayPlayerSummary only appends combat status text for IsHeld() while in combat.
  // Other tactical flags remain visible through panel/grid/log signals, not this summary region.
  if (c.flags.has('asleep') || c.flags.has('held')) return '(Helpless)';
  return null;
}

function combatSummary(): CombatSummary | null {
  if (!state) return null;
  const target = selectedTargetForSummary();
  if (!target) return null;
  const row = rowForCombatant(target, true);
  const hpState = target.hp < target.maxHp ? 'damaged' : 'full';
  return {
    name: row.name,
    hp: row.hp,
    hpState,
    ac: row.ac,
    weapon: target.weapons[0]?.name ?? null,
    status: summaryStatus(target),
    down: row.down,
    impaired: row.impaired,
    guarding: row.guarding,
  };
}

function backdropCellTileForView(): readonly number[] | null {
  if (!state?.backgroundIds) return null;
  const tiles = state.assets.backdropTiles;
  if (state.backgroundIdsAreTileIndices) {
    const out: number[] = [];
    const tileCount = tiles?.length ?? Infinity;
    for (let row = 0; row < VIEW; row++) {
      for (let col = 0; col < VIEW; col++) {
        const mapCol = state.view.col + col;
        const mapRow = state.view.row + row;
        const raw = mapCol < 0 || mapRow < 0
          || mapCol >= state.combat.terrain.width || mapRow >= state.combat.terrain.height
          ? 0
          : state.backgroundIds[mapRow * state.combat.terrain.width + mapCol] ?? 0;
        out.push(Number.isFinite(tileCount) && tileCount > 0 ? Math.min(raw, tileCount - 1) : raw);
      }
    }
    return out;
  }
  if (state.ruleset === 'gen2') {
    return dqkNativeBackgroundCellMemberMap(
      state.combat.terrain.width,
      state.combat.terrain.height,
      state.backgroundIds,
      { col: state.view.col, row: state.view.row, cols: VIEW, rows: VIEW },
    );
  }
  return backgroundCellTileMap(
    state.combat.terrain.width,
    state.combat.terrain.height,
    state.backgroundIds,
    { col: state.view.col, row: state.view.row, cols: VIEW, rows: VIEW },
    tiles?.length ?? Infinity,
  );
}

function currentAimMenuItems(): readonly AimMenuItem[] {
  if (!state) return AIM_MENU_ITEMS;
  if (state.allyConfirmTargetId) return ALLY_CONFIRM_ITEMS;
  if (state.phase !== 'party-target') return AIM_MENU_ITEMS;
  if (!state.manualAim) return AIM_MENU_ITEMS;
  return manualTargetAtCursor() ? AIM_MANUAL_TARGET_ITEMS : AIM_MANUAL_NO_TARGET_ITEMS;
}

function clampAimSelection(): void {
  if (!state || state.phase !== 'party-target') return;
  const items = currentAimMenuItems();
  state.aimSelected = clamp(state.aimSelected, 0, Math.max(0, items.length - 1));
}

function currentMenu(): { items: readonly string[]; selected: number; prompt?: string | null } | null {
  if (!state || state.phase === 'over') return null;
  if (state.allyConfirmTargetId) {
    return { items: ALLY_CONFIRM_ITEMS as readonly string[], selected: state.allyConfirmSelected, prompt: 'Attack Ally:' };
  }
  if (state.phase === 'party-move') return null;
  if (state.phase === 'continue-battle') {
    return { items: TREASURE_EXIT_MENU as readonly string[], selected: state.continueBattleSelected, prompt: 'Continue Battle:' };
  }
  if (state.phase === 'victory') return null;
  if (state.phase === 'party-target') {
    const items = currentAimMenuItems();
    const selected = Math.min(state.aimSelected, Math.max(0, items.length - 1));
    return { items: items as readonly string[], selected, prompt: 'Aim:' };
  }
  return { items: MENU_ITEMS as readonly string[], selected: state.menuSelected };
}

function currentTargetRange(): number | null {
  if (!state || state.phase !== 'party-target') return null;
  const actor = state.combat.current();
  const target = currentAimPoint();
  if (!actor || !target) return null;
  return Math.max(Math.abs(actor.pos.col - target.col), Math.abs(actor.pos.row - target.row));
}

function combatMessageLines(): string {
  if (!state) return '';
  if (state.phase === 'party-move') return '';
  if (state.phase === 'party-target') {
    const range = currentTargetRange();
    return range === null ? 'Range = -' : `Range = ${range}`;
  }
  return [...state.log.slice(-5), state.banner].filter(Boolean).join('\n').split('\n').slice(-6).join('\n');
}

function currentPrompt(): string | undefined {
  if (!state) return undefined;
  if (state.phase === 'party-move') {
    return state.banner || `Move/Attack, Move Left = ${state.combat.movementLeft()}`;
  }
  if (state.phase === 'victory') return 'Press Enter/Return to continue';
  if (state.phase === 'over') return state.overlayEl ? 'Press Enter to continue' : 'Press any key';
  return undefined;
}

function treasureMenuItems(): readonly string[] {
  if (!state?.haul) return ['Exit'];
  if (state.treasureExitConfirm) return TREASURE_EXIT_MENU;
  if (state.treasureTakeMenu) return treasureTakeMenuItems();
  const moneyPresent = state.haul.gold > 0 && !state.goldTaken;
  const itemsPresent = state.haul.items.length > 0 && !state.itemsTaken;
  // CoAB ovr006 distributeCombatTreasure: Share exists only when money is on
  // the ground; item-only hauls omit it.
  if (moneyPresent) return TREASURE_MENU;
  if (itemsPresent) return ['View', 'Take', 'Pool', 'Exit'];
  return ['View', 'Pool', 'Exit'];
}

/** CoAB's TAKE command only offers the treasure categories actually on the ground. */
function treasureTakeMenuItems(): readonly string[] {
  if (!state?.haul) return ['Exit'];
  const items: string[] = [];
  if (state.haul.gold > 0 && !state.goldTaken) items.push('Money');
  if (state.haul.items.length > 0 && !state.itemsTaken) items.push('Items');
  items.push('Exit');
  return items;
}

function draw(): void {
  if (!state) return;
  const lines = combatMessageLines();
  if (state.phase === 'treasure' && state.haul) {
    const st = state;
    const haul = state.haul;
    if (st.surface.profile().nativeWidth !== DOS_EGA.nativeWidth
        || st.surface.profile().nativeHeight !== DOS_EGA.nativeHeight) st.surface.setProfile(DOS_EGA);
    const fb = composeTreasure({
      frameTiles: st.assets.frameTiles,
      font: st.assets.font,
      view: {
        gold: haul.gold,
        goldTaken: st.goldTaken,
        rows: haul.items.map((it) => ({ label: it.count > 1 ? `${it.count} ${it.name}` : it.name, taken: st.itemsTaken })),
        cursor: st.itemsTaken ? -1 : st.treasureCursor,
        status: st.treasureStatus,
      },
      menu: {
        items: treasureMenuItems(),
        selected: st.treasureMenu,
      },
    });
    st.surface.paint(fb, st.assets.palette);
    updateCombatChrome();
    return;
  }
  const rendered = cellsAndRgbaLayers(visibleCells());
  terrainRenderReceipt = { visibleTileIndices: [], changedTerrainSamples: [] };
  const screenInput = {
    geometry: state.geometry,
    frameTiles: state.assets.frameTiles,
    frameLayout: state.assets.frameLayout,
    moons: state.assets.moons,
    font: state.assets.font,
    sky: state.sky,
    backdrop: { tiles: state.assets.backdropTiles, cellTile: backdropCellTileForView(), fillTile: 0 },
    cells: rendered.cells,
    party: panelRows(),
    summary: combatSummary(),
    menu: currentMenu(),
    message: lines,
    prompt: currentPrompt(),
  };
  const fb = composeCombatScreen(screenInput);
  const compatibleTerrainRestyles = cokTerrainRestylesForSources(state.assets.terrainRestyles ?? new Map(),
    state.assets.terrainRestyleSources ?? new Map(), state.assets.terrainSources ?? []);
  if (state.requestedRestyle && compatibleTerrainRestyles.size && state.assets.backdropTiles) {
    // Render all native foreground over sentinel terrain. A surviving sentinel is the exact
    // terrain-visible mask, including native sprites, glyphs, status bars, cursor and chrome.
    const sentinel: IndexedImage = { width: 24, height: 24, indices: new Uint8Array(576).fill(255),
      transparentIndex: null, palette: null, xOffset: 0, yOffset: 0 };
    const foreground = composeCombatScreen({ ...screenInput,
      backdrop: { tiles: [sentinel], fillTile: 0, cellTile: null } });
    const terrainLayers = cokTerrainLayers(state.assets.backdropTiles,
      screenInput.backdrop.cellTile, compatibleTerrainRestyles, foreground);
    terrainRenderReceipt.visibleTileIndices = [...new Set(screenInput.backdrop.cellTile ?? [0])];
    for (const layer of terrainLayers) {
      let sampled = false;
      for (let y = 0; y < 24 && !sampled; y++) for (let x = 0; x < 24 && !sampled; x++) {
        const nx = layer.x + x, ny = layer.y + y;
        // Leave every RGBA icon rectangle out of terrain-only probes, including its transparent holes.
        if (rendered.layers.some((icon) => nx >= icon.x && ny >= icon.y
          && nx < icon.x + icon.art.width / icon.pixelScale && ny < icon.y + icon.art.height / icon.pixelScale)) continue;
        const offset = (((y * 4 + 2) * 96) + x * 4 + 2) * 4;
        if (layer.art.pixels[offset + 3] !== 255) continue;
        const rgb = Array.from(layer.art.pixels.slice(offset, offset + 3));
        const original = state.assets.palette.colors[fb.indices[ny * fb.width + nx]!];
        if (!original || rgb.every((v, c) => v === [original.r, original.g, original.b][c])) continue;
        const block: number[][] = [];
        for (let by = 0; by < 4; by++) for (let bx = 0; bx < 4; bx++) {
          const blockOffset = (((y * 4 + by) * 96) + x * 4 + bx) * 4;
          block.push(Array.from(layer.art.pixels.slice(blockOffset, blockOffset + 3)));
        }
        terrainRenderReceipt.changedTerrainSamples.push({ x: nx, y: ny, rgb, block });
        sampled = true;
      }
    }
    rendered.layers.unshift(...terrainLayers);
  }
  if (rendered.layers.length > 0) {
    state.surface.setProfile(COK_RESTYLE_SURFACE);
    state.surface.paintRgba(composeRgbaArt(fb, state.assets.palette, rendered.layers, COK_RESTYLE_OUTPUT_SCALE));
    paintRestyleCombatCursor(rendered.cells);
  } else {
    if (state.surface.profile().nativeWidth !== DOS_EGA.nativeWidth
        || state.surface.profile().nativeHeight !== DOS_EGA.nativeHeight) state.surface.setProfile(DOS_EGA);
    state.surface.paint(fb, state.assets.palette);
  }
  paintInspectCursor();
  updateCombatChrome();
}

function pushLog(line: string): void {
  if (!state) return;
  state.log.push(line);
  if (state.log.length > 40) state.log.shift();
}

const nameOf = (id?: string): string => (id ? state?.names.get(id) ?? id : '?');

function updateCombatChrome(): void {
  if (!state) return;
  const root = document.querySelector('#output .combat-meta');
  if (!root) return;
  const active = state.combat.current();
  const set = (key: string, value: string): void => {
    const node = root.querySelector(`[data-combat-meta="${key}"]`);
    if (node) node.textContent = value;
  };
  const phase =
    state.phase === 'party-menu' ? 'Command' :
    state.phase === 'party-move' ? 'Move' :
    state.phase === 'party-target' ? 'Target' :
    state.phase === 'treasure' ? 'Treasure' :
    'Resolved';
  set('phase', phase);
  set('active', active ? nameOf(active.id) : '-');
  set('enemies', String(livingEnemyIds().length));
  set('move', state.phase === 'party-move' ? String(state.combat.movementLeft()) : '-');
}

function combatantAt(pos: GridPos): TacticalCombatant | null {
  if (!state) return null;
  for (const c of state.combatants) {
    if (c.flags.has('fled') || c.flags.has('surrendered')) continue;
    const size = state.combat.sizeOf(c.id);
    if (pos.col >= c.pos.col && pos.col < c.pos.col + size && pos.row >= c.pos.row && pos.row < c.pos.row + size) return c;
  }
  return null;
}

function inspectText(pos: GridPos): string {
  if (!state) return '';
  const who = combatantAt(pos);
  if (who) {
    const side = who.side === 'party' ? 'party' : 'enemy';
    return `${nameOf(who.id)} (${side}) AC ${who.ac} HP ${Math.max(0, who.hp)}/${who.maxHp}`;
  }
  const blocked = state.combat.terrain.blocked?.(pos.col, pos.row) ?? false;
  const id = state.backgroundIds?.[pos.row * state.combat.terrain.width + pos.col];
  if (id === undefined) return `${blocked ? 'Wall/blocked' : 'Open'} cell ${pos.col},${pos.row}`;
  const tile = backgroundTile(id);
  const tileIndex = backgroundTileIndex(id, state.assets.backdropTiles?.length ?? Infinity);
  const move = backgroundMoveCost(id);
  const los = state.combat.terrain.blocksSight?.(pos.col, pos.row) ?? blocked;
  const moveText = move === 0xff ? 'blocked' : String(move);
  const heightText = tile.height === 0xff ? '-' : String(tile.height);
  return `${blocked ? 'Wall/blocked' : 'Open'} cell ${pos.col},${pos.row} bg ${id} tile ${tileIndex} move ${moveText} h ${heightText} ${los ? 'LOS blocked' : 'LOS open'}`;
}

function setInspectCursor(pos: GridPos): void {
  if (!state?.inspectMode) return;
  const t = state.combat.terrain;
  const col = clamp(pos.col, 0, t.width - 1);
  const row = clamp(pos.row, 0, t.height - 1);
  state.inspectCursor = { col, row };
  state.inspectLabel = inspectText(state.inspectCursor);
  state.banner = `Inspect: ${state.inspectLabel}`;
  recenterOn(state.inspectCursor);
}

function moveInspectCursor(dc: number, dr: number): void {
  if (!state?.inspectMode || !state.inspectCursor) return;
  setInspectCursor({ col: state.inspectCursor.col + dc, row: state.inspectCursor.row + dr });
  draw();
}

function paintInspectCursor(): void {
  const cursor = state?.manualAim ? state.aimCursor : state?.inspectMode ? state.inspectCursor : null;
  if (!state || !cursor) return;
  const rect = state.surface.rect();
  const ctx = state.surface.canvas.getContext('2d');
  if (!rect || !ctx) return;
  const sc = cursor.col - state.view.col;
  const sr = cursor.row - state.view.row;
  if (sc < 0 || sc >= VIEW || sr < 0 || sr >= VIEW) return;
  const dpr = window.devicePixelRatio || 1;
  const sx = rect.width / DOS_EGA.nativeWidth;
  const sy = rect.height / DOS_EGA.nativeHeight;
  const x = (rect.x + (state.geometry.originX + sc * state.geometry.cellW) * sx) * dpr;
  const y = (rect.y + (state.geometry.originY + sr * state.geometry.cellH) * sy) * dpr;
  const w = state.geometry.cellW * sx * dpr;
  const h = state.geometry.cellH * sy * dpr;
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(2, Math.round(dpr));
  ctx.strokeRect(Math.round(x) + 1, Math.round(y) + 1, Math.max(1, Math.round(w) - 2), Math.max(1, Math.round(h) - 2));
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = Math.max(1, Math.round(dpr));
  ctx.strokeRect(Math.round(x) + 3, Math.round(y) + 3, Math.max(1, Math.round(w) - 6), Math.max(1, Math.round(h) - 6));
  ctx.restore();
}

/** Combat-log phrasing for a status taking hold (CT.5a). */
function statusVerb(s: string): string {
  switch (s) {
    case 'asleep': return 'falls asleep';
    case 'held': return 'is held';
    case 'coughing': return 'starts to cough';
    case 'feared': return 'flees in fear';
    case 'slowed': return 'is slowed';
    case 'hasted': return 'is hasted';
    default: return `is ${s}`;
  }
}
/** Combat-log suffix for a missile shot's range band (CT.7c): short = point blank (+1), long (−2). */
function rangeTag(b?: string): string {
  return b === 'short' ? ' (point blank)' : b === 'long' ? ' (long range)' : '';
}
/** Combat-log phrasing for a status wearing off (CT.5a). */
function statusEndVerb(s: string): string {
  switch (s) {
    case 'asleep': return 'wakes up';
    case 'held': return 'breaks free';
    case 'coughing': return 'stops coughing';
    case 'feared': return 'recovers nerve';
    case 'slowed': return 'shakes off the slow';
    case 'hasted': return 'returns to normal speed';
    default: return `is no longer ${s}`;
  }
}

/** Format the engine's tactical events into combat-log lines + trigger the matching SFX. */
function logEvents(events: TacticalEvent[]): void {
  if (!state) return;
  for (const e of events) {
    switch (e.type) {
      case 'move':
        pushLog(`${nameOf(e.actor)} moves.`);
        break;
      case 'attack':
        if (e.hit) {
          if (e.coupDeGrace) pushLog(`${nameOf(e.actor)} slays the helpless ${nameOf(e.target)} with one cruel blow!`); // CT.7j
          else if (e.leaving) pushLog(`${nameOf(e.actor)} strikes ${nameOf(e.target)} as ${nameOf(e.target)} pulls away for ${e.damage}!`);
          else if (e.opportunity) pushLog(`${nameOf(e.actor)} strikes the advancing ${nameOf(e.target)} for ${e.damage}!`);
          else if (e.backstab) pushLog(`${nameOf(e.actor)} backstabs ${nameOf(e.target)} (from behind) for ${e.damage}!`);
          else if (e.rear) pushLog(`${nameOf(e.actor)} hits ${nameOf(e.target)} from behind for ${e.damage}.`);
          else if (e.missile) pushLog(`${nameOf(e.actor)} shoots ${nameOf(e.target)} for ${e.damage}${rangeTag(e.rangeBracket)}.`);
          else pushLog(`${nameOf(e.actor)} hits ${nameOf(e.target)} for ${e.damage}.`);
          soundDispatcher.playEvent(e.missile ? 'missile' : 'hit');
        } else {
          if (e.leaving) pushLog(`${nameOf(e.actor)} misses ${nameOf(e.target)} as ${nameOf(e.target)} pulls away.`);
          else if (e.opportunity) pushLog(`${nameOf(e.actor)}'s readied strike misses the advancing ${nameOf(e.target)}.`);
          else if (e.backstab) pushLog(`${nameOf(e.actor)}'s backstab attempt on ${nameOf(e.target)} misses.`);
          else if (e.rear) pushLog(`${nameOf(e.actor)} misses ${nameOf(e.target)} (from behind).`);
          else if (e.missile) pushLog(`${nameOf(e.actor)} misses ${nameOf(e.target)}${rangeTag(e.rangeBracket)}.`);
          else pushLog(`${nameOf(e.actor)} misses ${nameOf(e.target)}.`);
          soundDispatcher.playEvent('miss');
        }
        break;
      case 'cast':
        if (e.target === undefined) pushLog(`${nameOf(e.actor)} casts a spell.`);
        else if (e.healed !== undefined) pushLog(`${nameOf(e.actor)} heals ${nameOf(e.target)} for ${e.healed}.`);
        else if (e.damage !== undefined) pushLog(`${nameOf(e.actor)} blasts ${nameOf(e.target)} for ${e.damage}${e.saved ? ' (save!)' : ''}.`);
        else if (e.inflicted) pushLog(`${nameOf(e.target)} ${statusVerb(e.inflicted)}!`);
        else pushLog(`${nameOf(e.actor)} casts at ${nameOf(e.target)}${e.saved ? ' (save!)' : ''}.`);
        // A healing spell keeps its host chime (not in the 5-event combat vocab); a damaging /
        // status spell routes through the engine sound layer as `magic_hit`.
        if (e.healed !== undefined) gameAudio.playAction('melee');
        else soundDispatcher.playEvent('magic_hit');
        break;
      case 'stand-up':
        pushLog(`${nameOf(e.target)} gets back up.`);
        gameAudio.playAction('melee');
        break;
      case 'bandage':
        pushLog(`${nameOf(e.actor)} bandages ${nameOf(e.target)}.`);
        gameAudio.playAction('melee');
        break;
      case 'side-change':
        if (e.toSide === 'enemy') pushLog(`${nameOf(e.target)} turns hostile!`);
        break;
      case 'status':
        if (e.morale && e.inflicted === 'feared') { pushLog(`${nameOf(e.target)}'s morale breaks — it flees!`); gameAudio.playAction('miss'); }
        else if (e.expired && e.inflicted) pushLog(`${nameOf(e.target)} ${statusEndVerb(e.inflicted)}.`);
        break;
      case 'regen':
        pushLog(`${nameOf(e.target)} regenerates ${e.healed} HP.`);
        break;
      case 'hazard':
        // CT.7b — a web/cloud zone catching a figure.
        if (e.damage !== undefined) { pushLog(`${nameOf(e.target)} chokes in the ${e.hazard ?? 'cloud'} for ${e.damage}.`); gameAudio.playAction('miss'); }
        else if (e.inflicted && !e.saved) { pushLog(`${nameOf(e.target)} is caught in the ${e.hazard ?? 'web'}!`); gameAudio.playAction('miss'); }
        else if (e.inflicted && e.saved) pushLog(`${nameOf(e.target)} struggles free of the ${e.hazard ?? 'web'}.`);
        break;
      case 'turn':
        if (e.destroyed) { pushLog(`${nameOf(e.target)} is destroyed!`); soundDispatcher.playEvent('death'); }
        else if (e.turned) { pushLog(`${nameOf(e.target)} is turned and flees!`); gameAudio.playAction('miss'); }
        else if (e.target === undefined) pushLog('The turning has no effect.');
        break;
      case 'slain':
        pushLog(`${nameOf(e.target)} is ${e.dead ? 'slain' : 'struck down'}!`);
        soundDispatcher.playEvent('death');
        break;
      case 'flee':
        if (e.surrendered) pushLog(`${nameOf(e.actor)} surrenders!`);
        else pushLog(`${nameOf(e.actor)} flees!`);
        break;
      case 'guard':
        pushLog(e.guarding ? `${nameOf(e.actor)} takes a guarding stance.` : `${nameOf(e.actor)} guards.`);
        break;
      case 'wait':
        pushLog(`${nameOf(e.actor)} waits.`);
        break;
      case 'delay':
        pushLog(`${nameOf(e.actor)} delays.`);
        break;
      case 'party-flee':
        pushLog(e.escaped ? 'The party flees — Got Away!' : 'Escape is blocked!');
        break;
      default:
        break;
    }
  }
}

function cloudKindForSpell(spellId?: string): CoabGasCloudKind | null {
  switch (spellId) {
    case 'm2-stinking-cloud': return 'stinking';
    case 'm5-cloudkill': return 'cloudkill';
    default: return null;
  }
}

function castAimFromAction(actor: TacticalCombatant, action: TacticalAction): GridPos {
  const target = action.targetId ? state?.combatants.find((c) => c.id === action.targetId) : null;
  return target ? { ...target.pos } : action.to ? { ...action.to } : { ...actor.pos };
}

function syncCoabTileStateAfterAction(actor: TacticalCombatant | null, action: TacticalAction, events: readonly TacticalEvent[]): void {
  if (!state?.tileState || events.length === 0) return;
  if (actor && action.type === 'cast' && events.some((e) => e.type === 'cast')) {
    const spell = actor.preparedSpells?.find((s) => s.id === action.spellId);
    const zoneKind = spell?.zone?.kind === 'stinking' || spell?.zone?.kind === 'cloudkill' ? spell.zone.kind : null;
    const kind = zoneKind ?? cloudKindForSpell(action.spellId);
    if (kind) {
      addCoabCombatTileGasCloud(state.tileState, {
        kind,
        target: castAimFromAction(actor, action),
        currentRound: state.combat.round(),
        durationRounds: spell?.zone?.rounds ?? spell?.inflict?.rounds ?? (kind === 'cloudkill' ? 5 : 3),
        casterId: actor.id,
      });
    }
  }

  for (const e of events) {
    if (!e.target) continue;
    const target = state.combatants.find((c) => c.id === e.target);
    if (!target || target.side !== 'party') continue;
    if (e.type === 'slain') {
      markCoabCombatTileDowned(state.tileState, target.pos, { targetId: target.id, preserveStinkingCloud: true });
    } else if (e.type === 'stand-up') {
      restoreCoabCombatTileDowned(state.tileState, target.id);
    }
  }
  state.backgroundIds = state.tileState.backgroundIds;
}

function applyCombatAction(action: TacticalAction): TacticalEvent[] {
  if (!state) return [];
  const actor = state.combat.current();
  const events = state.combat.apply(action);
  syncCoabTileStateAfterAction(actor, action, events);
  return events;
}

function setActive(id: string | null): void {
  if (state) state.activeId = id;
}

function livingEnemyIds(): string[] {
  if (!state) return [];
  return state.combatants.filter((c) => c.side === 'enemy' && c.hp > 0 && !c.flags.has('fled')).map((c) => c.id);
}

// ── Turn flow ────────────────────────────────────────────────────────────────────────────────

/** Advance to the next actor: auto-resolve enemy turns through the engine AI, stop on a party turn. */
function advanceTurn(): void {
  if (!state) return;
  const c = state.combat;
  let guard = 0;
  // eslint-disable-next-line no-constant-condition
  while (guard++ < 2000) {
    if (c.isOver()) return finalize();
    const actor = c.current();
    if (!actor) return finalize();
    if (actor.side === 'enemy' || state.friendlyNpcIds.has(actor.id) || actor.flags.has('feared')) {
      // M80.S1 — a feared PARTY member is forced to flee too (CT.5a), exactly like a feared enemy;
      // aiAction()'s own forcedFlee check fires before any enemy-specific AI heuristics run.
      setActive(actor.id);
      recenterOn(actor.pos);
      logEvents(applyCombatAction(c.aiAction()));
      continue; // keep driving this enemy (move→attack) and then the next one
    }
    // A party unit is up — hand control to the player.
    setActive(actor.id);
    recenterOn(actor.pos);
    state.phase = 'party-menu';
    state.menuSelected = 0; // Move
    state.banner = '';
    pushLog(`${nameOf(actor.id)}'s turn.`);
    draw();
    return;
  }
  finalize();
}

function refreshCombatGraphicsControls(): void {
  if (!state) return;
  const selected = state.requestedGraphicsMode;
  for (const [id, mode] of [
    ['combat-graphics-dos', 'DOS-EGA'],
    ['combat-graphics-amiga', 'Amiga'],
    ['combat-graphics-restyle', 'Restyle'],
  ] as const) {
    const button = document.getElementById(id);
    const active = selected === mode;
    button?.classList.toggle('active', active);
    button?.setAttribute('aria-pressed', String(active));
  }
  const source = state.assets.sourcePaths?.backdropGraphicSet ?? 'DOS-EGA';
  const compatibleTerrainRestyles = cokTerrainRestylesForSources(state.assets.terrainRestyles ?? new Map(),
    state.assets.terrainRestyleSources ?? new Map(), state.assets.terrainSources ?? []);
  const compatibleTerrainRestyleIndices = cokTerrainRestyleIndicesForSources(
    state.assets.terrainRestyleSources ?? new Map(), state.assets.terrainSources ?? []);
  const compatibleTerrainErrors = [...(state.assets.terrainRestyleErrors?.keys() ?? [])]
    .filter((index) => compatibleTerrainRestyleIndices.has(index)).length;
  const status = document.getElementById('combat-graphics-status');
  if (status) {
    status.textContent = selected === 'Restyle'
      ? `Restyle where source-matched · backdrop: ${source}${compatibleTerrainRestyles.size ? ` · ${compatibleTerrainRestyles.size} terrain tiles` : ''}${compatibleTerrainErrors ? ` · ${compatibleTerrainErrors} terrain tile(s) use original fallback` : ''}`
      : selected === source ? `Backdrop: ${source}` : `${selected} unavailable · backdrop: ${source}`;
    // No measured Amiga battle grid exists: the DOS-EGA grid stays, and that is stated, not inferred.
    if (selected === 'Amiga') status.textContent += ` · ${AMIGA_COMBAT_GRID_LABEL}; DOS-EGA grid shown`;
    if (selected === 'Restyle' && state.assets.terrainRestyles?.size && !compatibleTerrainRestyles.size && source === 'Amiga') {
      status.textContent += ' · DOS-only terrain Restyle does not match Amiga sources; Amiga originals shown';
    }
    if (selected === 'Restyle' && state.runtimeGameId
        && readRuntimeGraphicsFallback(state.runtimeGameId) === 'Amiga' && source !== 'Amiga') {
      status.textContent += ' · Amiga unavailable; DOS-EGA original fallback';
    }
    if (state.assets.sourcePaths.randcomPath) {
      status.textContent += ` · RANDCOM: ${/\.daa$/i.test(state.assets.sourcePaths.randcomPath) ? 'Amiga' : 'DOS-EGA'}`;
    }
    const playerPresentations = [...state.assets.playerAppearances.values()].map((appearance) =>
      resolveCokPlayerPresentation(appearance, { consumer: 'combat-party-icon', mode: selected, playback: 'still',
        fallback: state!.runtimeGameId ? readRuntimeGraphicsFallback(state!.runtimeGameId) : 'DOS-EGA' }));
    const selectedPlayers = playerPresentations.filter((presentation) => presentation.state === 'ready');
    const optionalFallbacks = selected === 'Restyle' ? selectedPlayers.filter((presentation) => presentation.source !== 'Restyle') : [];
    if ((selected === 'Amiga' && selectedPlayers.length) || (optionalFallbacks.length && state.runtimeGameId
        && readRuntimeGraphicsFallback(state.runtimeGameId) === 'Amiga')) {
      status.textContent += ' · player icon uses DOS fallback (Amiga mapping pending)';
    }
    if (optionalFallbacks.length) status.textContent += ` · ${optionalFallbacks.length} player icon(s) use DOS original (${optionalFallbacks.some((presentation) => presentation.frame.restyleStatus.state === 'pending') ? 'Restyle loading' : 'Restyle unavailable'})`;
    const heldPlayers = playerPresentations.length - selectedPlayers.length;
    if (heldPlayers) status.textContent += ` · ${heldPlayers} player icon(s) use standard fallback (appearance not mapped)`;
    if (state.assets.playerAppearanceErrors.size > 0) {
      status.textContent += ` · ${state.assets.playerAppearanceErrors.size} player icon(s) use standard fallback`;
    }
  }
}

function onCombatGraphicsMode(event: Event): void {
  const detail = (event as CustomEvent<{ gameId?: string; mode?: string }>).detail;
  if (!state?.runtimeGameId || runtimeGraphicsGameId(state.runtimeGameId) !== 'cok'
      || detail?.gameId !== 'cok' || !['DOS-EGA', 'Amiga', 'Restyle'].includes(detail.mode ?? '')) return;
  setCombatGraphicsMode(detail.mode as RuntimeGraphicsMode, false);
}

function onCombatLocalAssetPack(): void {
  const current = state;
  if (!current || !current.runtimeGameId || runtimeGraphicsGameId(current.runtimeGameId) !== 'cok') return;
  current.refreshCombatRestyleArt?.();
  setCombatGraphicsMode(current.requestedGraphicsMode, false);
}

function setCombatGraphicsMode(mode: RuntimeGraphicsMode, persist = true): void {
  const current = state;
  if (!current?.runtimeGameId) return;
  if (persist) {
    writeRuntimeGraphicsMode(current.runtimeGameId, mode);
    return; // The scoped listener applies this selection once, without rebroadcasting.
  }
  if (mode === 'Restyle') current.retryPlayerArt?.();
  if (mode !== current.requestedGraphicsMode) current.combatRestyleRetryEpoch = (current.combatRestyleRetryEpoch ?? 0) + 1;
  current.requestedGraphicsMode = mode;
  current.requestedRestyle = mode === 'Restyle';
  if (mode === 'Restyle') current.retryCombatRestyleArt?.();
  const revision = ++current.graphicsLoadRevision;
  current.graphicsLoading = true;
  refreshCombatGraphicsControls();
  draw();
  if (!current.assetPaths) {
    current.graphicsLoading = false;
    current.graphicsAppliedRevision = revision;
    return;
  }

  current.graphicsLoadCompletion = loadCombatAssets({ ...current.assetPaths,
    graphicsMode: mode === 'Restyle' ? readRuntimeGraphicsFallback(current.runtimeGameId) : mode, restyleMode: false })
    .then((loaded) => {
      if (state !== current || current.graphicsLoadRevision !== revision) return;
      current.assets.backdropTiles = loaded.backdropTiles;
      current.assets.terrainSources = loaded.terrainSources;
      current.assets.terrainRestyleSources = loaded.terrainRestyleSources;
      current.assets.terrainRestyles = loaded.terrainRestyles;
      current.assets.terrainRestyleErrors = loaded.terrainRestyleErrors;
      current.assets.palette = loaded.palette;
      const sourcePaths = {
        ...current.assets.sourcePaths,
        dungcomPath: loaded.sourcePaths.dungcomPath,
        backdropGraphicSet: loaded.sourcePaths.backdropGraphicSet ?? 'DOS-EGA',
      };
      if (loaded.sourcePaths.randcomPath) sourcePaths.randcomPath = loaded.sourcePaths.randcomPath;
      else delete sourcePaths.randcomPath;
      current.assets.sourcePaths = sourcePaths;
      refreshCombatGraphicsControls();
      draw();
      current.graphicsLoading = false;
      current.graphicsAppliedRevision = revision;
    })
    .catch(() => {
      if (state !== current || current.graphicsLoadRevision !== revision) return;
      current.graphicsLoading = false;
      current.graphicsAppliedRevision = revision;
      const status = document.getElementById('combat-graphics-status');
      if (status) {
        status.textContent = `Could not load ${mode}; current backdrop retained`;
        if (mode === 'Amiga' && current.assets.playerAppearances.size > 0) {
          status.textContent += ' · player icon uses DOS fallback (Amiga mapping pending)';
        }
      }
    });
}

/** End the current party actor's turn (engine `endTurn`) and advance. */
function endPartyTurn(actorId: string): void {
  if (!state) return;
  const c = state.combat;
  if (!c.isOver() && c.current()?.id === actorId) applyCombatAction({ type: 'endTurn' });
  advanceTurn();
}

function finalize(): void {
  if (!state || state.over) return;
  const res = state.combat.result();
  state.over = true;
  state.outcome = res.outcome;
  // Persist surviving party HP AND carry the dead-vs-unconscious distinction to the roster (CT.7h):
  // a figure slain by the gen1 `dmg ≥ hp+10` rule is recorded permadead (needs Raise Dead).
  const combat = state.combat;
  const persistentPartyIds = state.persistentPartyIds;
  applyCombatHp(
    state.combatants.filter((c) => persistentPartyIds.has(c.id)),
    (id) => combat.conditionOf(id),
  );
  setActive(null);
  if (res.outcome === 'party') {
    const foes = state.combatants.filter((c) => c.side === 'enemy');
    // M29.S1 — a defeated foe's real MON{n}ITM.DAX carried items (joined at dungeon load) drop as-is
    // instead of the synthetic DROP_TABLE roll, when at least one resolves to a known catalogue entry.
    const haul = state.scriptedHaul ?? rollTreasure(
      foes.map((c) => ({ xp: c.xp, carriedItems: c.carriedItems })),
      state.seed,
    );
    // M15.S1 — real `calc_battle_exp`/`addExp` award (ovr006): battle XP folds in gold's XP worth
    // (flat per-enemy XP alone previously ignored it entirely), split per member with the
    // single-class +10% prime-requisite bonus / multiclass ÷N rule, replacing the old flat even-split.
    // CoK GAME.OVR:0x640e..0x6432 proves the CCH terms carried by decoded CoK combatants.
    // Other games omit them safely and retain their existing flat-XP behaviour.
    const enemies: DefeatedEnemy[] = foes.map((c) => ({
      flatXp: c.xp ?? 0,
      perHpXp: c.perHpXp,
      rolledHp: c.rolledHp,
    }));
    // M26.S1 — every defeated foe's carried-item `plus` values (MON{n}ITM.DAX, joined at dungeon load)
    // feed calcBattleExp's Σ item.plus·400 term, matching COAB's unconditional battle-end collection.
    const itemPluses = foes.flatMap((c) => c.itemPluses ?? []);
    const xpResult = awardPartyXp(enemies, { goldXpWorth: haul.gold, itemPluses });
    state.xp = xpResult.total;
    state.xpPerCharacter = xpResult.baseShare;
    pushLog(`Victory! The party gains ${xpResult.total} experience.`);
    // M57.S1 — xpResult.total is calcBattleExp(enemies, { goldXpWorth, itemPluses }) collapsed to
    // one number; recompute each additive term via the SAME real ruleset function (zero-enemy /
    // zero-loot calls, the same trick M56 used for the bestiary's Bonus XP row) so the player can
    // tell how much of the award came from monster kills vs. gold vs. looted magic items, instead
    // of a lump sum that hides it completely. Only shown when there's a loot component to reveal;
    // each part is honestly omitted when zero.
    const monsterXp = calcBattleExp(enemies, {});
    const goldXp = haul.gold;
    const itemXp = calcBattleExp([], { itemPluses });
    if (goldXp > 0 || itemXp > 0) {
      const parts: string[] = [];
      if (monsterXp > 0) parts.push(`${monsterXp} from foes`);
      if (goldXp > 0) parts.push(`${goldXp} from gold`);
      if (itemXp > 0) parts.push(`${itemXp} from magic items`);
      pushLog(`(${parts.join(', ')})`);
    }
    // Faithful per-character split message (CoK `Each character receives ` @0x6dd3 + ` experience points.` @0x6dec) —
    // now genuinely per-character since prime-requisite/multiclass can make awards differ.
    for (const m of xpResult.perMember) pushLog(`${m.name} receives ${m.awarded} experience points.`);
    state.haul = hasTreasure(haul) ? haul : null;
    state.continueBattleSelected = 1; // retail r3 capture: NO is the default after victory.
    state.phase = 'continue-battle';
    state.banner = 'The battle is over.';
    draw();
    setStatus('Champions of Krynn — continue battle?');
    return;
  } else if (res.outcome === 'enemy') pushLog('The party has fallen...');
  else if (res.fled) pushLog('The party has fled.'); // CT.7g — a withdraw, not a stalemate
  else pushLog('The battle ends in a stalemate.');
  state.phase = 'over';
  draw();
  setStatus(`Champions of Krynn — combat ${res.outcome === 'enemy' ? 'lost' : res.fled ? 'fled' : 'drawn'}.`);
  state.dismissable = !!state.overlayEl;
}

// ── Party actions ──────────────────────────────────────────────────────────────────────────────

/** Walk the active party unit one cell in a direction; returns true if it actually moved. */
function stepMove(dir: string): boolean {
  if (!state) return false;
  const c = state.combat;
  const actor = c.current();
  if (!actor || actor.side !== 'party') return false;
  const d = DIR_DELTA[dir];
  if (!d) return false;
  const targetCell = { col: actor.pos.col + d[0], row: actor.pos.row + d[1] };
  const bumped = combatantAt(targetCell);
  if (state.phase === 'party-move' && bumped?.side === actor.side && bumped.id !== actor.id && canAttackAllyTarget(actor, bumped)) {
    requestAllyAttackConfirmation(bumped.id);
    return false;
  }
  if (state.phase === 'party-move' && bumped?.side === 'enemy' && c.meleeTargets().some((t) => t.id === bumped.id)) {
    const readied = actor.weapons[0];
    if (readied?.kind === 'missile') {
      state.banner = 'Not with that weapon';
      return false;
    }
    partyAttack(bumped.id);
    return true;
  }
  const before = { ...actor.pos };
  const events = applyCombatAction({ type: 'move', to: targetCell });
  if (events.length === 0 || (actor.pos.col === before.col && actor.pos.row === before.row)) {
    if (state.phase === 'party-move') state.banner = "can't go there";
    return false;
  }
  state.banner = '';
  logEvents(events);
  recenterOn(actor.pos);
  return true;
}

/** Foes the active unit can act against right now (in melee reach or missile range), de-duplicated. */
function attackableTargets(): string[] {
  if (!state) return [];
  const ids = new Set<string>();
  for (const t of state.combat.meleeTargets()) ids.add(t.id);
  for (const t of state.combat.missileTargets()) ids.add(t.id);
  const actor = state.combat.current();
  if (actor) {
    for (const c of state.combatants) {
      if (c.side === actor.side && c.id !== actor.id && c.hp > 0 && canAttackAllyTarget(actor, c)) ids.add(c.id);
    }
  }
  return [...ids];
}

function canAttackAllyTarget(actor: TacticalCombatant, target: TacticalCombatant): boolean {
  if (!state || target.side !== actor.side || target.id === actor.id) return false;
  const melee = footprintDistance(actor.pos, actor.size ?? 1, target.pos, target.size ?? 1) <= (actor.weapons[0]?.reach ?? 1);
  const missile = !!actor.weapons.find((w) => (w.kind === 'missile' || w.kind === 'thrown') && (w.ammo ?? 1) > 0);
  return melee || missile;
}

function requestAllyAttackConfirmation(targetId: string): boolean {
  if (!state) return false;
  const actor = state.combat.current();
  const target = state.combatants.find((c) => c.id === targetId);
  if (!actor || !target || target.side !== actor.side || !canAttackAllyTarget(actor, target)) return false;
  state.allyConfirmTargetId = targetId;
  state.allyConfirmSelected = 0;
  state.banner = '';
  draw();
  return true;
}

/** The active unit attacks `id` — melee if adjacent, else a missile shot — then ends its turn. */
function partyAttack(id: string, allowAlly = false): void {
  if (!state) return;
  const c = state.combat;
  const actor = c.current();
  if (!actor || actor.side !== 'party') return;
  const target = state.combatants.find((it) => it.id === id);
  if (!target) return;
  const ally = target.side === actor.side;
  if (ally && !allowAlly) return;
  const inMelee = ally
    ? footprintDistance(actor.pos, actor.size ?? 1, target.pos, target.size ?? 1) <= (actor.weapons[0]?.reach ?? 1)
    : c.meleeTargets().some((t) => t.id === id);
  const inMissile = ally
    ? !!actor.weapons.find((w) => (w.kind === 'missile' || w.kind === 'thrown') && (w.ammo ?? 1) > 0)
    : c.missileTargets().some((t) => t.id === id);
  if (!inMelee && !inMissile) return;
  const action: TacticalAction = { type: inMelee ? 'melee' : 'missile', targetId: id, allowAlly: ally && allowAlly };
  const evs = applyCombatAction(action);
  if (evs.length === 0) return;
  logEvents(evs);
  endPartyTurn(actor.id);
}

/**
 * Seam-facing "attack this foe" (used by the e2e + auto-engage): melee/shoot if able, otherwise close
 * the distance toward it (the engine AI's move), logging either way so the intent always has an effect.
 */
function seamAttack(id?: string): void {
  if (!state) return;
  const c = state.combat;
  const actor = c.current();
  if (!actor || actor.side !== 'party') return;
  const target = id ?? livingEnemyIds()[0];
  if (!target) return;
  const inReach = c.meleeTargets().some((t) => t.id === target) || c.missileTargets().some((t) => t.id === target);
  if (inReach) {
    partyAttack(target);
  } else {
    // Not yet in range — advance toward the foe (logs a move/guard), staying on this unit's turn.
    logEvents(applyCombatAction(c.aiAction()));
    recenterOn(actor.pos);
    draw();
  }
}

function partyGuardWait(type: 'guard' | 'wait' | 'delay'): void {
  if (!state || state.phase !== 'party-menu') return;
  const c = state.combat;
  const actor = c.current();
  if (!actor || actor.side !== 'party') return;
  // CT.7e — Delay re-queues the actor without ending the round's progress at the cursor; a no-op
  // (not deferrable) just leaves the same figure prompting, so only advance when something happened.
  if (type === 'delay') {
    const evs = applyCombatAction({ type: 'delay' });
    logEvents(evs);
    if (evs.length) advanceTurn();
    else draw();
    return;
  }
  const evs = applyCombatAction({ type });
  logEvents(evs);
  if (evs.length) advanceTurn();
  else draw();
}

function partyView(): void {
  if (!state) return;
  const actor = state.combat.current();
  if (!actor) return;
  recenterOn(actor.pos);
  state.banner = inspectText(actor.pos);
  pushLog(`${nameOf(actor.id)} views the battlefield.`);
  draw();
}

function partyUse(): void {
  if (!state || state.phase !== 'party-menu') return;
  const actor = state.combat.current();
  if (!actor || actor.side !== 'party') return;
  useReadiedCombatItem(actor);
}

function useReadiedCombatItem(actor: TacticalCombatant): boolean {
  if (!state) return false;
  const item = combatUseItemsForMember(actor.id)[0];
  if (!item) {
    state.banner = 'Must be Readied';
    pushLog(`${nameOf(actor.id)} has no readied combat item.`);
    draw();
    return false;
  }
  const spell: TacticalSpell = {
    ...item.spell,
    id: `item:${item.baseTypeId}:${item.spell.id}`,
    usesLeft: 1,
  };
  const action = actionForSpell(actor, spell);
  if (!action) {
    state.banner = `Item: no target in range for ${spell.name}.`;
    pushLog(`${nameOf(actor.id)} cannot use ${item.name} here.`);
    draw();
    return false;
  }
  actor.preparedSpells = [...(actor.preparedSpells ?? []), spell];
  pushLog(`${nameOf(actor.id)} uses an item.`);
  logEvents(applyCombatAction(action));
  if (item.consumes) consumeCombatUseItem(actor.id, item.inventoryIndex);
  endPartyTurn(actor.id);
  return true;
}

function actionForSpell(actor: TacticalCombatant, spell: TacticalSpell): TacticalAction | null {
  if (!state) return null;
  const range = spell.range ?? 0;
  const inRange = (t: TacticalCombatant): boolean => Math.max(Math.abs(actor.pos.col - t.pos.col), Math.abs(actor.pos.row - t.pos.row)) <= range;

  if (spell.target === 'self') return { type: 'cast', spellId: spell.id };
  if (spell.target === 'ally') {
    const allies = state.combatants.filter((t) => t.side === 'party' && !t.flags.has('dead') && !t.flags.has('fled') && !t.flags.has('surrendered') && inRange(t));
    const hurt = allies
      .filter((t) => t.hp <= 0 || t.hp < t.maxHp)
      .sort((a, b) => (a.hp > 0 ? a.hp / a.maxHp : -1) - (b.hp > 0 ? b.hp / b.maxHp : -1))[0] ?? allies[0];
    return hurt ? { type: 'cast', spellId: spell.id, targetId: hurt.id } : null;
  }
  const foes = state.combatants.filter((t) => t.side === 'enemy' && t.hp > 0 && !t.flags.has('fled') && inRange(t));
  const nearest = foes.sort((a, b) =>
    Math.max(Math.abs(actor.pos.col - a.pos.col), Math.abs(actor.pos.row - a.pos.row)) -
    Math.max(Math.abs(actor.pos.col - b.pos.col), Math.abs(actor.pos.row - b.pos.row)))[0];
  if (!nearest) return null;
  return spell.area === 'single'
    ? { type: 'cast', spellId: spell.id, targetId: nearest.id }
    : { type: 'cast', spellId: spell.id, to: { ...nearest.pos } };
}

function combatUseItemsForCurrent(): ReturnType<typeof combatUseItemsForMember> {
  const actor = state?.combat.current();
  return actor?.side === 'party' ? combatUseItemsForMember(actor.id) : [];
}

function combatUseItemNames(): string[] {
  return combatUseItemsForCurrent().map((item) => item.count > 1 ? `${item.count} ${item.name}` : item.name);
}

function quickShouldUseItem(actor: TacticalCombatant): boolean {
  if (!state) return false;
  const item = combatUseItemsForMember(actor.id)[0];
  if (!item) return false;
  if (item.spell.target !== 'ally') return true;
  const range = item.spell.range ?? 0;
  return state.combatants.some((t) =>
    t.side === 'party' &&
    !t.flags.has('dead') &&
    !t.flags.has('fled') &&
    !t.flags.has('surrendered') &&
    t.hp < t.maxHp &&
    Math.max(Math.abs(actor.pos.col - t.pos.col), Math.abs(actor.pos.row - t.pos.row)) <= range);
}

function partyQuick(): void {
  if (!state || state.phase !== 'party-menu') return;
  const actor = state.combat.current();
  if (!actor || actor.side !== 'party') return;
  if (quickShouldUseItem(actor) && useReadiedCombatItem(actor)) return;

  pushLog(`${nameOf(actor.id)} fights quickly.`);
  const actorId = actor.id;
  let guard = 0;
  while (state && !state.combat.isOver() && state.combat.current()?.id === actorId && guard++ < 24) {
    logEvents(applyCombatAction(state.combat.aiAction()));
  }
  advanceTurn();
}

/**
 * CT.7g — the party **Flee** command: a whole-party withdraw. If every living member can reach the map
 * edge the party "Gets Away" and the encounter ends as a withdraw (not a loss); otherwise "Escape is
 * blocked" and the party stays in the fight. Faithful to CoK's own `Flee:` / `Got Away` / `Escape is
 * blocked` / `The party has fled.` strings (disasm-spells-krynn.md §21).
 */
function partyFlee(): void {
  if (!state) return;
  const c = state.combat;
  const actor = c.current();
  if (!actor || actor.side !== 'party') return;
  const evs = c.attemptPartyFlee();
  logEvents(evs);
  if (evs.some((e) => e.type === 'party-flee' && e.escaped)) advanceTurn(); // Got Away → battle ends
  else draw(); // Escape is blocked — the player picks another action
}

/**
 * Cast the current actor's next available prepared spell (CT.4). Auto-targets: an offensive spell at the
 * nearest in-range foe, a heal at the most-wounded ally, a self spell at the caster. Returns false (and
 * logs a hint) when nothing is castable or no valid target is in range, leaving the unit's turn intact.
 */
function partyCast(): boolean {
  if (!state) return false;
  const c = state.combat;
  const actor = c.current();
  if (!actor || actor.side !== 'party') return false;
  const spell = (actor.preparedSpells ?? []).find((s) => (s.usesLeft ?? 1) > 0);
  if (!spell) { pushLog(`${nameOf(actor.id)} has no spell ready.`); draw(); return false; }
  const action = actionForSpell(actor, spell);
  if (!action) { pushLog(`${nameOf(actor.id)}: no target in range for ${spell.name}.`); draw(); return false; }

  pushLog(`${nameOf(actor.id)} casts ${spell.name}!`);
  logEvents(applyCombatAction(action));
  advanceTurn();
  return true;
}

/**
 * Cleric **turn undead** (CT.5b): the active cleric attempts to turn/destroy undead foes in range. Logs
 * a hint and leaves the turn intact when the actor can't turn (no turning level, or no undead in reach).
 */
function partyTurn(): boolean {
  if (!state) return false;
  const c = state.combat;
  const actor = c.current();
  if (!actor || actor.side !== 'party') return false;
  if (!c.canTurnUndead()) { pushLog(`${nameOf(actor.id)} cannot turn undead here.`); draw(); return false; }
  pushLog(`${nameOf(actor.id)} calls upon the gods to turn the undead!`);
  logEvents(applyCombatAction({ type: 'turn' }));
  advanceTurn();
  return true;
}

/** Bandage the first party-side `dying` member (CoAB `bandage(true)`). */
function partyBandage(): boolean {
  if (!state) return false;
  const c = state.combat;
  const actor = c.current();
  if (!actor || actor.side !== 'party') return false;
  if (!c.canBandage()) { pushLog('No one needs bandaging.'); draw(); return false; }
  logEvents(applyCombatAction({ type: 'bandage' }));
  advanceTurn();
  return true;
}

// ── Targeting mode ───────────────────────────────────────────────────────────────────────────

function enterMoveMode(): void {
  if (!state || state.phase !== 'party-menu') return;
  if (state.combat.movementLeft() <= 0) { state.banner = 'No movement left.'; draw(); return; }
  state.phase = 'party-move';
  state.banner = '';
  draw();
}

function enterTargetMode(): void {
  if (!state || state.phase !== 'party-menu') return;
  const targets = attackableTargets();
  if (targets.length === 0) { state.banner = 'No target in reach.'; draw(); return; }
  state.phase = 'party-target';
  state.targets = targets;
  state.targetIdx = 0;
  state.aimSelected = 0;
  state.manualAim = false;
  state.aimCursor = null;
  state.allyConfirmTargetId = null;
  state.allyConfirmSelected = 0;
  highlightTarget();
}

function cycleTarget(d: number): void {
  if (!state || state.phase !== 'party-target' || state.targets.length === 0) return;
  state.targetIdx = (state.targetIdx + d + state.targets.length) % state.targets.length;
  state.manualAim = false;
  state.aimCursor = null;
  state.allyConfirmTargetId = null;
  state.allyConfirmSelected = 0;
  highlightTarget();
}

function highlightTarget(): void {
  if (!state) return;
  const id = state.targets[state.targetIdx];
  if (!id) return;
  const foe = state.combatants.find((c) => c.id === id);
  setActive(id); // cursor sits on the chosen target
  if (foe) recenterOn(foe.pos);
  const actor = state.combat.current();
  const ally = !!actor && !!foe && foe.side === actor.side;
  const melee = ally
    ? footprintDistance(actor.pos, actor.size ?? 1, foe.pos, foe.size ?? 1) <= (actor.weapons[0]?.reach ?? 1)
    : state.combat.meleeTargets().some((t) => t.id === id);
  // M50.S1 — a helpless (asleep/held) foe is an unconditional instant-kill "coup de grace" in melee under
  // this ruleset (slaysHelpless(), CT.7j) — resolveHit() applies it regardless of to-hit roll, so this
  // takes priority over backstab/flank (those are only to-hit/damage modifiers, not a guaranteed kill).
  const helpless = !!foe && (foe.flags.has('asleep') || foe.flags.has('held'));
  const coupDeGrace = melee && helpless && state.combat.slaysHelpless();
  // M48.S1 — canBackstab()/isBehind() already gate the real +4/×N (thief) and +2 (any attacker)
  // rear-hit bonuses in tactical.ts's resolveHit(); melee-only, matching resolveHit's own !missile gate.
  const backstab = melee && !coupDeGrace && state.combat.canBackstab(id);
  const flank = melee && !coupDeGrace && !backstab && state.combat.isBehind(id);
  // M49.S1 — missileBracket() already gates the real +1/0/-2 to-hit modifier in resolveHit() for a
  // "shot" target; rangeTag() already narrates it post-hoc once a shot resolves (combat.ts:592) — this
  // reuses rangeTag() verbatim for the pre-hoc banner. `!melee` mirrors resolveHit's own `missile` gate.
  const tag = coupDeGrace ? ' (Coup de Grace!)' : backstab ? ' (Backstab!)' : flank ? ' (flank)'
    : !melee ? rangeTag(state.combat.missileBracket(id) ?? undefined) : '';
  state.banner = `Target ${nameOf(id)} (HP ${Math.max(0, foe?.hp ?? 0)}, ${melee ? 'melee' : 'shot'})${tag}`;
  draw();
}

function currentSelectedTarget(): TacticalCombatant | null {
  if (!state) return null;
  const id = state.targets[state.targetIdx];
  return id ? state.combatants.find((c) => c.id === id) ?? null : null;
}

function currentAimPoint(): GridPos | null {
  if (!state || state.phase !== 'party-target') return null;
  if (state.manualAim) return state.aimCursor;
  const target = currentSelectedTarget();
  return target ? { col: target.pos.col, row: target.pos.row } : null;
}

function setManualAimCursor(pos: GridPos): void {
  if (!state || state.phase !== 'party-target') return;
  state.allyConfirmTargetId = null;
  const t = state.combat.terrain;
  state.aimCursor = {
    col: clamp(pos.col, 0, t.width - 1),
    row: clamp(pos.row, 0, t.height - 1),
  };
  recenterOn(state.aimCursor);
  const who = combatantAt(state.aimCursor);
  const actor = state.combat.current();
  const targetable = !!who && (state.targets.includes(who.id) || (!!actor && canAttackAllyTarget(actor, who)));
  state.banner = targetable
    ? `Manual target ${nameOf(who!.id)}.`
    : `Manual target: ${inspectText(state.aimCursor)}`;
  clampAimSelection();
}

function enterManualTargetMode(): void {
  if (!state || state.phase !== 'party-target') return;
  const selected = currentSelectedTarget();
  const actor = state.combat.current();
  state.allyConfirmTargetId = null;
  state.manualAim = true;
  setActive(null);
  setManualAimCursor(selected?.pos ?? actor?.pos ?? { col: 0, row: 0 });
  draw();
}

function moveManualAim(dc: number, dr: number): void {
  if (!state || state.phase !== 'party-target' || !state.manualAim || !state.aimCursor) return;
  setManualAimCursor({ col: state.aimCursor.col + dc, row: state.aimCursor.row + dr });
  draw();
}

function manualTargetAtCursor(): string | null {
  if (!state?.manualAim || !state.aimCursor) return null;
  const who = combatantAt(state.aimCursor);
  if (!who) return null;
  if (who.side === 'enemy') return state.targets.includes(who.id) ? who.id : null;
  const actor = state.combat.current();
  return actor && canAttackAllyTarget(actor, who) ? who.id : null;
}

function confirmTarget(): void {
  if (!state || state.phase !== 'party-target') return;
  if (state.manualAim) {
    const id = manualTargetAtCursor();
    if (id) {
      const actor = state.combat.current();
      const target = state.combatants.find((c) => c.id === id);
      if (actor && target?.side === actor.side) {
        requestAllyAttackConfirmation(id);
        return;
      }
      partyAttack(id);
      return;
    }
    state.banner = 'Target: no reachable foe at cursor.';
    draw();
    return;
  }
  const id = state.targets[state.targetIdx];
  if (!id) return;
  const actor = state.combat.current();
  const target = state.combatants.find((c) => c.id === id);
  if (actor && target?.side === actor.side) {
    requestAllyAttackConfirmation(id);
    return;
  }
  partyAttack(id);
}

function centerTargetView(): void {
  if (!state || state.phase !== 'party-target') return;
  state.allyConfirmTargetId = null;
  const target = currentAimPoint();
  if (target) recenterOn(target);
  draw();
}

function activateAimMenu(item: AimMenuItem): void {
  if (state?.allyConfirmTargetId) {
    const target = state.allyConfirmTargetId;
    state.allyConfirmTargetId = null;
    state.allyConfirmSelected = 0;
    if (item === 'Yes') partyAttack(target, true);
    else draw();
    return;
  }
  switch (item) {
    case 'Next': cycleTarget(1); break;
    case 'Prev': cycleTarget(-1); break;
    case 'Manual': enterManualTargetMode(); break;
    case 'Target': confirmTarget(); break;
    case 'Center': centerTargetView(); break;
    case 'Exit': exitToMenu(); break;
    case 'Yes':
    case 'No':
      break;
  }
}

function exitToMenu(): void {
  if (!state) return;
  state.phase = 'party-menu';
  state.manualAim = false;
  state.aimCursor = null;
  state.allyConfirmTargetId = null;
  state.allyConfirmSelected = 0;
  const a = state.combat.current();
  setActive(a?.id ?? null);
  if (a) recenterOn(a.pos);
  state.banner = '';
  draw();
}

/** Resolve the entire battle automatically (the e2e seam and a future "auto" button). */
function resolveAuto(): void {
  if (!state) return;
  state.combat.finish();
  finalize();
}

/** Advance exactly one AI action so attract-mode battles remain visible instead of teleporting to the result. */
function resolveAutoStep(): boolean {
  if (!state || state.over) return false;
  const c = state.combat;
  if (c.isOver()) { finalize(); return false; }
  const actor = c.current();
  if (!actor) { finalize(); return false; }
  setActive(actor.id);
  recenterOn(actor.pos);
  logEvents(applyCombatAction(c.aiAction()));
  if (c.isOver()) {
    finalize();
  } else {
    const next = c.current();
    setActive(next?.id ?? null);
    if (next) recenterOn(next.pos);
    state.phase = 'party-menu';
    state.menuSelected = 0;
    state.banner = '';
    draw();
  }
  return true;
}

export function isCombatOpen(): boolean {
  return state !== null;
}

/** Tear down the combat view (removes the overlay + key handler). */
export function closeCombat(): void {
  if (!state) return;
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('goldbox:graphics-mode', onCombatGraphicsMode);
  window.removeEventListener('goldbox:local-asset-pack', onCombatLocalAssetPack);
  state.overlayEl?.remove();
  state = null;
}

/** Build a legacy `CombatResult` for the `onEnd` callback (callers read `outcome`/`xpAwarded`). */
function asCombatResult(): CombatResult {
  const tr = state!.combat.result();
  return { outcome: tr.outcome, rounds: tr.rounds, log: [], survivors: tr.survivors, xpAwarded: tr.xpAwarded, fled: tr.fled };
}

/** Dismiss a finished overlay battle → call onEnd(result) once, return to the dungeon. */
function dismissOverlay(): void {
  if (!state || !state.dismissable) return;
  const onEnd = state.onEnd;
  const res = asCombatResult();
  closeCombat();
  gameAudio.enterScene('explore'); // back to the dungeon ambient when the battle is dismissed
  onEnd?.(res);
}

// ── Treasure phase (A4.3) ──────────────────────────────────────────────────────────────────────

function treasureRecipient(): string | null {
  return getParty()[0]?.name ?? null;
}
function takeTreasureMoney(): void {
  if (!state || !state.haul || state.goldTaken) return;
  addGold(state.haul.gold);
  state.goldTaken = true;
  state.treasureStatus = `${state.haul.gold} GOLD TAKEN`;
  draw();
}
function takeTreasureItems(): void {
  if (!state || !state.haul || state.itemsTaken || state.haul.items.length === 0) return;
  const who = treasureRecipient();
  if (who) giveItemsToMember(who, state.haul.items);
  state.itemsTaken = true;
  state.treasureStatus = who ? `ITEMS GIVEN TO ${who.toUpperCase()}` : 'NO ONE TO CARRY THE ITEMS';
  draw();
}
function takeTreasureAll(): void {
  if (!state || !state.haul) return;
  takeTreasureMoney();
  takeTreasureItems();
  if (state) state.treasureStatus = 'ALL TREASURE TAKEN';
  draw();
}
function treasureLeft(): boolean {
  return !!state?.haul &&
    ((!state.goldTaken && state.haul.gold > 0) || (!state.itemsTaken && state.haul.items.length > 0));
}
function finishTreasureExit(): void {
  if (!state) return;
  state.phase = 'over';
  state.dismissable = !!state.overlayEl;
  draw();
  setStatus('Champions of Krynn — combat won.');
}

function acknowledgeVictory(): void {
  if (!state || state.phase !== 'victory') return;
  if (state.haul) {
    state.phase = 'treasure';
    state.treasureCursor = state.haul.items.length ? 0 : -1;
    state.treasureMenu = 0;
    state.treasureStatus = '';
    state.treasureExitConfirm = false;
    state.treasureTakeMenu = false;
    draw();
    setStatus('Champions of Krynn — treasure recovered.');
    return;
  }
  finishTreasureExit();
}

function chooseContinueBattle(choice: number): void {
  if (!state || state.phase !== 'continue-battle') return;
  state.continueBattleSelected = choice;
  // The observed victory branch explicitly selects NO. There are no surviving
  // foes to resume in this state, so YES is retained as a visible choice but
  // cannot fabricate a new battle round.
  if (choice === 0) {
    state.banner = 'No enemies remain.';
    draw();
    return;
  }
  state.phase = 'victory';
  // CoK's result overlay prints its raw per-character split, not the pooled
  // battle total and not the individual post-bonus additions to XP records.
  const displayXp = state.victoryPerCharacterXp ?? state.xpPerCharacter;
  state.banner = `The party has won. Each character receives ${displayXp} experience points. Press <Enter>/<Return> to continue.`;
  draw();
  setStatus('Champions of Krynn — victory.');
}
function exitTreasure(): void {
  if (!state) return;
  if (treasureLeft()) {
    state.treasureExitConfirm = true;
    state.treasureMenu = 0;
    state.treasureStatus = 'THERE IS STILL TREASURE LEFT. CLAIM IT?';
    draw();
    return;
  }
  finishTreasureExit();
}
function activateTreasureMenu(): void {
  if (!state) return;
  if (state.treasureExitConfirm) {
    if (state.treasureMenu === 0) {
      state.treasureExitConfirm = false;
      state.treasureMenu = treasureMenuItems().indexOf('Exit');
      state.treasureStatus = '';
      draw();
    } else {
      finishTreasureExit();
    }
    return;
  }
  if (state.treasureTakeMenu) {
    switch (treasureTakeMenuItems()[state.treasureMenu]) {
      // CoAB leaves TAKE as soon as one of the two ground-treasure categories
      // is exhausted, then redraws the outer command row from fresh ground state.
      case 'Money': takeTreasureMoney(); state.treasureTakeMenu = false; state.treasureMenu = 0; draw(); break;
      case 'Items': takeTreasureItems(); state.treasureTakeMenu = false; state.treasureMenu = 0; draw(); break;
      case 'Exit': state.treasureTakeMenu = false; state.treasureMenu = 0; state.treasureStatus = ''; draw(); break;
    }
    return;
  }
  switch (treasureMenuItems()[state.treasureMenu]) {
    case 'View': {
      const opened = openCharSheet({
        frameTiles: state.assets.frameTiles,
        frameLayout: state.assets.frameLayout,
        font: state.assets.font,
        graphicsGameId: state.runtimeGameId ?? undefined,
        onClose: () => draw(),
      });
      if (!opened) {
        state.treasureStatus = 'NO PARTY SHEET AVAILABLE';
        draw();
      }
      break;
    }
    case 'Take': {
      const categories = treasureTakeMenuItems();
      // CoAB opens `MONEY ITEMS EXIT` only when both ground categories are
      // present. A single category is collected directly from the outer row.
      if (categories.length === 2) {
        if (categories[0] === 'Money') takeTreasureMoney();
        else takeTreasureItems();
      } else {
        state.treasureTakeMenu = true;
        state.treasureMenu = 0;
        state.treasureStatus = 'TAKE:';
        draw();
      }
      break;
    }
    // Pool/Share act on a selected member's purse and an existing pooled-money
    // ledger in retail CoK, not on ground treasure. Greybox has only one party
    // gold total, so leave both commands non-mutating until that missing model
    // exists instead of silently treating them as TAKE.
    case 'Pool': if (state) { state.treasureStatus = 'POOL REQUIRES MEMBER COIN LEDGERS'; draw(); } break;
    case 'Share': if (state) { state.treasureStatus = 'SHARE REQUIRES MEMBER COIN LEDGERS'; draw(); } break;
    case 'Exit': exitTreasure(); break;
  }
}

// ── Input ────────────────────────────────────────────────────────────────────────────────────

function onKey(e: KeyboardEvent): void {
  if (!state || isDemoGraphicsControl(e.target, e.key)) return;
  if (e.target instanceof Element && e.target.closest('.gbx-local-pack-picker')) return;
  // A character sheet opened from the retail treasure VIEW command is a nested
  // capture-phase modal. Let it own every key until it closes.
  if (isSheetOpen()) return;
  const overlay = !!state.overlayEl;
  const claim = (): void => { if (overlay) { e.preventDefault(); e.stopPropagation(); } };

  if (state.phase === 'treasure') {
    switch (e.key) {
      case 'ArrowLeft': { claim(); const items = treasureMenuItems(); state.treasureMenu = (state.treasureMenu + items.length - 1) % items.length; draw(); break; }
      case 'ArrowRight': { claim(); const items = treasureMenuItems(); state.treasureMenu = (state.treasureMenu + 1) % items.length; draw(); break; }
      case 'ArrowUp': claim(); if (state.haul && state.haul.items.length) state.treasureCursor = (state.treasureCursor + state.haul.items.length - 1) % state.haul.items.length; draw(); break;
      case 'ArrowDown': claim(); if (state.haul && state.haul.items.length) state.treasureCursor = (state.treasureCursor + 1) % state.haul.items.length; draw(); break;
      case 'Enter': claim(); activateTreasureMenu(); break;
      case 'v': case 'V': claim(); state.treasureTakeMenu = false; state.treasureExitConfirm = false; state.treasureMenu = 0; activateTreasureMenu(); break;
      case 't': case 'T': claim(); state.treasureTakeMenu = false; state.treasureExitConfirm = false; state.treasureMenu = 1; activateTreasureMenu(); break;
      case 'p': case 'P': { claim(); const index = treasureMenuItems().indexOf('Pool'); if (index >= 0) { state.treasureTakeMenu = false; state.treasureExitConfirm = false; state.treasureMenu = index; activateTreasureMenu(); } break; }
      case 's': case 'S': { claim(); const index = treasureMenuItems().indexOf('Share'); if (index >= 0) { state.treasureTakeMenu = false; state.treasureExitConfirm = false; state.treasureMenu = index; activateTreasureMenu(); } break; }
      case 'y': case 'Y': if (state.treasureExitConfirm) { claim(); state.treasureMenu = 0; activateTreasureMenu(); } break;
      case 'n': case 'N': if (state.treasureExitConfirm) { claim(); state.treasureMenu = 1; activateTreasureMenu(); } break;
      case 'e': case 'E': case 'Escape': case 'x': case 'X': claim(); exitTreasure(); break;
      default: return;
    }
    return;
  }
  if (state.phase === 'continue-battle') {
    switch (e.key) {
      case 'ArrowLeft': case 'ArrowRight': claim(); state.continueBattleSelected = state.continueBattleSelected === 0 ? 1 : 0; draw(); break;
      case 'Enter': claim(); chooseContinueBattle(state.continueBattleSelected); break;
      case 'y': case 'Y': claim(); chooseContinueBattle(0); break;
      case 'n': case 'N': case 'Escape': claim(); chooseContinueBattle(1); break;
      default: return;
    }
    return;
  }
  if (state.phase === 'victory') {
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') { claim(); acknowledgeVictory(); }
    return;
  }
  if (state.phase === 'over') {
    if (state.dismissable && (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ')) { claim(); dismissOverlay(); }
    return;
  }
  if (state.allyConfirmTargetId) {
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
        e.preventDefault(); claim();
        state.allyConfirmSelected = state.allyConfirmSelected === 0 ? 1 : 0;
        draw();
        break;
      case 'Enter': {
        e.preventDefault(); claim();
        const items = currentAimMenuItems();
        activateAimMenu(items[state.allyConfirmSelected] ?? 'No');
        break;
      }
      case 'y': case 'Y': claim(); activateAimMenu('Yes'); break;
      case 'n': case 'N': case 'Escape': claim(); activateAimMenu('No'); break;
      default: return;
    }
    return;
  }
  if (state.phase === 'party-move') {
    const moveKey = DIR_DELTA[e.key] ? e.key : null;
    if (moveKey) {
      e.preventDefault(); claim();
      stepMove(moveKey);
      if (state.combat.movementLeft() <= 0) exitToMenu(); else draw();
      return;
    }
    switch (e.key) {
      case 'Enter': case 'Escape': e.preventDefault(); claim(); exitToMenu(); break;
      default: return;
    }
    return;
  }
  if (state.phase === 'party-target') {
    if (state.allyConfirmTargetId) {
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowRight':
          e.preventDefault(); claim();
          state.allyConfirmSelected = state.allyConfirmSelected === 0 ? 1 : 0;
          draw();
          break;
        case 'Enter': {
          e.preventDefault(); claim();
          const items = currentAimMenuItems();
          activateAimMenu(items[state.allyConfirmSelected] ?? 'No');
          break;
        }
        case 'y': case 'Y': claim(); activateAimMenu('Yes'); break;
        case 'n': case 'N': case 'Escape': claim(); activateAimMenu('No'); break;
        default: return;
      }
      return;
    }
    if (state.manualAim) {
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); claim(); moveManualAim(-1, 0); break;
        case 'ArrowRight': e.preventDefault(); claim(); moveManualAim(1, 0); break;
        case 'ArrowUp': e.preventDefault(); claim(); moveManualAim(0, -1); break;
        case 'ArrowDown': e.preventDefault(); claim(); moveManualAim(0, 1); break;
        case 'Enter': e.preventDefault(); claim(); activateAimMenu('Target'); break;
        case 'n': case 'N': claim(); activateAimMenu('Next'); break;
        case 'p': case 'P': claim(); activateAimMenu('Prev'); break;
        case 't': case 'T': claim(); activateAimMenu('Target'); break;
        case 'c': case 'C': claim(); activateAimMenu('Center'); break;
        case 'e': case 'E': case 'Escape': claim(); activateAimMenu('Exit'); break;
        default: return;
      }
      return;
    }
    switch (e.key) {
      case 'ArrowLeft': {
        e.preventDefault(); claim();
        const items = currentAimMenuItems();
        state.aimSelected = (state.aimSelected + items.length - 1) % items.length;
        draw();
        break;
      }
      case 'ArrowRight': {
        e.preventDefault(); claim();
        const items = currentAimMenuItems();
        state.aimSelected = (state.aimSelected + 1) % items.length;
        draw();
        break;
      }
      case 'ArrowUp': e.preventDefault(); claim(); cycleTarget(-1); break;
      case 'ArrowDown': e.preventDefault(); claim(); cycleTarget(1); break;
      case 'Enter': {
        e.preventDefault(); claim();
        const items = currentAimMenuItems();
        activateAimMenu(items[state.aimSelected] ?? 'Target');
        break;
      }
      case 'n': case 'N': claim(); activateAimMenu('Next'); break;
      case 'p': case 'P': claim(); activateAimMenu('Prev'); break;
      case 'm': case 'M': claim(); activateAimMenu('Manual'); break;
      case 't': case 'T': claim(); activateAimMenu('Target'); break;
      case 'c': case 'C': claim(); activateAimMenu('Center'); break;
      case 'e': case 'E': case 'Escape': claim(); activateAimMenu('Exit'); break;
      default: return;
    }
    return;
  }
  if (state.inspectMode) {
    switch (e.key) {
      case 'ArrowLeft': e.preventDefault(); claim(); moveInspectCursor(-1, 0); break;
      case 'ArrowRight': e.preventDefault(); claim(); moveInspectCursor(1, 0); break;
      case 'ArrowUp': e.preventDefault(); claim(); moveInspectCursor(0, -1); break;
      case 'ArrowDown': e.preventDefault(); claim(); moveInspectCursor(0, 1); break;
      case 'a': case 'A': claim(); enterTargetMode(); break;
      case 'Escape': claim(); setInspectCursor(state.combat.current()?.pos ?? state.inspectCursor ?? { col: 0, row: 0 }); draw(); break;
      default: return;
    }
    return;
  }
  // party-menu
  switch (e.key) {
    case 'ArrowLeft': e.preventDefault(); claim(); state.menuSelected = (state.menuSelected + MENU_ITEMS.length - 1) % MENU_ITEMS.length; draw(); break;
    case 'ArrowRight': e.preventDefault(); claim(); state.menuSelected = (state.menuSelected + 1) % MENU_ITEMS.length; draw(); break;
    case 'Enter': {
      e.preventDefault(); claim();
      activateMenu(MENU_ITEMS[state.menuSelected]);
      break;
    }
    case 'm': case 'M': claim(); enterMoveMode(); break;
    case 'v': case 'V': claim(); partyView(); break;
    case 'a': case 'A': claim(); enterTargetMode(); break;
    case 'u': case 'U': claim(); partyUse(); break;
    case 'c': case 'C': claim(); activateMenu('Cast'); break;
    case 't': case 'T': claim(); partyTurn(); break; // cleric turn undead (CT.5b)
    case 'b': case 'B': claim(); partyBandage(); break; // CoAB bandage a dying teammate
    case 'q': case 'Q': claim(); partyQuick(); break;
    case 'd': case 'D': claim(); partyGuardWait('wait'); break;
    case 'g': case 'G': claim(); partyGuardWait('guard'); break;
    case 'w': case 'W': claim(); partyGuardWait('wait'); break;
    case 'y': case 'Y': claim(); partyGuardWait('delay'); break; // delaY — defer to act later (CT.7e)
    case 'f': case 'F': claim(); partyFlee(); break;
    default: return;
  }
}

function activateMenu(item: MenuItem): void {
  switch (item) {
    case 'Move': enterMoveMode(); break;
    case 'View': partyView(); break;
    case 'Aim': enterTargetMode(); break;
    case 'Use': partyUse(); break;
    case 'Cast':
      partyCast();
      break;
    case 'Turn': partyTurn(); break;
    case 'Quick': partyQuick(); break;
    case 'Done': partyGuardWait('wait'); break;
  }
}

// ── e2e seam ─────────────────────────────────────────────────────────────────────────────────

function forceBumpAttackSetup(weapon: 'melee' | 'missile' = 'melee', placement: 'orthogonal' | 'diagonal' = 'orthogonal'): { actor: string; target: string; dir: string; melee: string[]; weapon: string } | null {
  if (!state) return null;
  const actor = state.combat.current();
  if (!actor || actor.side !== 'party') return null;
  const targetId = livingEnemyIds()[0];
  const target = targetId ? state.combatants.find((c) => c.id === targetId) : undefined;
  if (!target) return null;

  const terrain = state.combat.terrain;
  const blocked = (pos: GridPos, size = 1): boolean =>
    footprintCells(pos, size).some((cell) =>
      cell.col < 0 || cell.row < 0 || cell.col >= terrain.width || cell.row >= terrain.height ||
      (terrain.blocked?.(cell.col, cell.row) ?? false));
  const actorPos = { col: 2, row: 4 };
  const targetPos = placement === 'diagonal' ? { col: 3, row: 3 } : { col: 3, row: 4 };
  const dir = placement === 'diagonal' ? 'I' : 'E';
  if (blocked(actorPos, actor.size ?? 1) || blocked(targetPos, target.size ?? 1)) return null;

  const reserved = new Set<string>();
  const reserve = (pos: GridPos, size = 1): void => {
    for (const cell of footprintCells(pos, size)) reserved.add(`${cell.col},${cell.row}`);
  };
  const canPlace = (pos: GridPos, size = 1): boolean =>
    !blocked(pos, size) && footprintCells(pos, size).every((cell) => !reserved.has(`${cell.col},${cell.row}`));
  reserve(actorPos, actor.size ?? 1);
  reserve(targetPos, target.size ?? 1);

  for (const c of state.combatants) {
    if (c.id === actor.id || c.id === target.id) continue;
    const size = c.size ?? 1;
    let placed: GridPos | null = null;
    for (let row = 1; !placed && row < terrain.height - 1; row++) {
      for (let col = terrain.width - 2; col >= 1; col--) {
        const pos = { col, row };
        if (canPlace(pos, size)) { placed = pos; break; }
      }
    }
    if (placed) {
      c.pos = placed;
      reserve(placed, size);
    }
  }

  actor.pos = actorPos;
  actor.weapons = weapon === 'missile'
    ? [bow()]
    : [{ name: 'Long Sword', kind: 'melee', damage: { count: 1, sides: 8, bonus: 0 }, reach: 1 }];
  target.pos = targetPos;
  state.phase = 'party-menu';
  state.banner = '';
  state.targets = [];
  state.manualAim = false;
  state.aimCursor = null;
  recenterOn(actor.pos);
  draw();
  return { actor: actor.id, target: target.id, dir, melee: state.combat.meleeTargets().map((t) => t.id), weapon: actor.weapons[0]?.name ?? '' };
}

function forceAllyAttackSetup(): { actor: string; ally: string } | null {
  if (!state) return null;
  const actor = state.combat.current();
  if (!actor || actor.side !== 'party') return null;
  let ally = state.combatants.find((c) => c.side === 'party' && c.id !== actor.id && c.hp > 0);
  if (!ally) {
    const injectedAlly: TacticalCombatant = {
      id: '__ally_test',
      name: 'Ally Test',
      side: 'party',
      hp: 20,
      maxHp: 20,
      ac: 10,
      thac0: 20,
      damage: { count: 1, sides: 4, bonus: 0 },
      move: 12,
      attacksPerRound: 1,
      pos: { col: 3, row: 4 },
      facing: actor.facing,
      weapons: [{ name: 'Short Sword', kind: 'melee', damage: { count: 1, sides: 6, bonus: 0 }, reach: 1 }],
      flags: new Set(),
      initiative: 0,
    };
    ally = injectedAlly;
    state.combatants.push(ally);
  }
  if (!ally) return null;
  actor.pos = { col: 2, row: 4 };
  actor.weapons = [{ name: 'Long Sword', kind: 'melee', damage: { count: 1, sides: 8, bonus: 0 }, reach: 1 }, bow()];
  ally.pos = { col: 3, row: 4 };
  ally.maxHp = Math.max(ally.maxHp, 20);
  ally.hp = Math.max(ally.hp, Math.min(ally.maxHp, 20));
  for (const c of state.combatants) {
    if (c.id !== actor.id && c.id !== ally.id && c.side === 'party') c.pos = { col: 1, row: 1 };
    if (c.side === 'enemy') c.pos = { col: 2, row: 5 };
  }
  state.phase = 'party-menu';
  state.banner = '';
  state.targets = [];
  state.manualAim = false;
  state.aimCursor = null;
  recenterOn(actor.pos);
  draw();
  return { actor: actor.id, ally: ally.id };
}

function placementOverlapCount(combatants: readonly TacticalCombatant[]): number {
  const occupied = new Set<string>();
  let overlaps = 0;
  for (const combatant of combatants) {
    for (const cell of footprintCells(combatant.pos, combatant.size)) {
      const key = `${cell.col},${cell.row}`;
      if (occupied.has(key)) overlaps++;
      occupied.add(key);
    }
  }
  return overlaps;
}

function installSeam(): void {
  (window as unknown as { __combat?: Record<string, unknown> }).__combat = {
    cellCount: state!.combatants.length,
    requestedRestyle: () => state?.requestedRestyle ?? false,
    graphicsMode: () => state?.requestedGraphicsMode ?? 'DOS-EGA',
    backdropGraphicsMode: () => state?.assets.sourcePaths?.backdropGraphicSet ?? 'DOS-EGA',
    combatRestyleIds: () => [...(state?.assets.combatRestyleIcons.keys() ?? [])],
    combatRestyleRetryCompletion: () => state?.combatRestyleRetryCompletion ?? null,
    combatRestyleErrors: () => Object.fromEntries(state?.assets.combatRestyleErrors ?? []),
    combatRestyleFallbackCells: () => Object.fromEntries(state?.assets.combatRestyleFallbackCells ?? []),
    playerAppearanceIds: () => [...(state?.assets.playerAppearances.keys() ?? [])],
    playerAppearanceErrors: () => Object.fromEntries(state?.assets.playerAppearanceErrors ?? []),
    playerAppearanceCompletion: () => state?.playerArtCompletion,
    playerAppearanceStatuses: () => Object.fromEntries([...(state?.assets.playerAppearances ?? [])].map(([id, appearance]) => [id, appearance.frames.map((frame) => frame.restyleStatus)])),
    restyleCursorSamplePoint: () => {
      if (!state) return null;
      const active = visibleCells().find((cell) => cell.active);
      const rect = state.surface.rect();
      if (!active || !rect) return null;
      const dpr = window.devicePixelRatio || 1;
      const profile = state.surface.profile();
      const sx = rect.width / profile.nativeWidth;
      const sy = rect.height / profile.nativeHeight;
      const x0 = (rect.x + (state.geometry.originX + active.col * state.geometry.cellW) * COK_RESTYLE_OUTPUT_SCALE * sx) * dpr;
      const y0 = (rect.y + (state.geometry.originY + active.row * state.geometry.cellH) * COK_RESTYLE_OUTPUT_SCALE * sy) * dpr;
      const w = state.geometry.cellW * COK_RESTYLE_OUTPUT_SCALE * sx * dpr;
      return { x: Math.round(x0 + w / 2), y: Math.round(y0) + 1 };
    },
    canvasPointForNativePixel: (x: number, y: number) => {
      if (!state) return null;
      const rect = state.surface.rect();
      if (!rect) return null;
      const dpr = window.devicePixelRatio || 1;
      const profile = state.surface.profile();
      const scale = profile.nativeWidth === DOS_EGA.nativeWidth * COK_RESTYLE_OUTPUT_SCALE
        ? COK_RESTYLE_OUTPUT_SCALE : 1;
      return {
        x: Math.floor((rect.x + (x * scale + scale / 2) * rect.width / profile.nativeWidth) * dpr),
        y: Math.floor((rect.y + (y * scale + scale / 2) * rect.height / profile.nativeHeight) * dpr),
      };
    },
    setCombatantFlagForTest: (id: string, flag: string, enabled: boolean) => {
      const actor = state?.combatants.find((combatant) => combatant.id === id);
      if (!actor) return false;
      if (enabled) actor.flags.add(flag as TacticalStatusFlag);
      else actor.flags.delete(flag as TacticalStatusFlag);
      draw();
      return true;
    },
    iconArchiveSha256: () => state?.assets.iconArchiveSha256 ?? null,
    combatRestyleIdentityForTest: (pictureId: number, sourceArchiveSha256?: string) => {
      const identity = cokCombatRestyleIdentity(pictureId, sourceArchiveSha256);
      return identity ? {
        bank: identity.bank,
        pictureId: identity.pictureId,
        stem: identity.stem,
        sourceArchiveSha256: identity.sourceArchiveSha256,
        sha256: identity.sha256,
      } : null;
    },
    combatRestyleSourceErrorForTest: cokCombatRestyleSourceError,
    recenterCombatantForTest: (combatantId: string) => {
      const actor = state?.combatants.find((combatant) => combatant.id === combatantId);
      if (!actor) return false;
      recenterOn(actor.pos);
      draw();
      return true;
    },
    combatSourceTransparentIndex: (combatantId: string) =>
      state?.assets.combatantIcons.get(combatantId)?.transparentIndex ?? null,
    combatRestyleSourceMask: (combatantId: string) => {
      if (!state) return null;
      const pictureId = state.combatantPictureIds.get(combatantId);
      const source = state.assets.combatantIcons.get(combatantId);
      const identity = pictureId === undefined
        ? null
        : cokCombatRestyleIdentity(pictureId, state.assets.iconArchiveSha256);
      const restyle = pictureId === undefined ? null : state.assets.combatRestyleIcons.get(pictureId);
      if (!source || !identity || !restyle || source.transparentIndex === null) return null;
      let transparentSourceCells = 0;
      let escapedOutputPixels = 0;
      for (let y = 0; y < source.height; y++) {
        for (let x = 0; x < source.width; x++) {
          if (source.indices[y * source.width + x] !== source.transparentIndex) continue;
          transparentSourceCells++;
          for (let oy = 0; oy < identity.pixelScale; oy++) {
            for (let ox = 0; ox < identity.pixelScale; ox++) {
              const alphaOffset = ((y * identity.pixelScale + oy) * restyle.width + x * identity.pixelScale + ox) * 4 + 3;
              if (restyle.pixels[alphaOffset] !== 0) escapedOutputPixels++;
            }
          }
        }
      }
      return { transparentSourceCells, escapedOutputPixels };
    },
    combatantPictureIds: () => Object.fromEntries(state?.combatantPictureIds ?? []),
    setCombatantPictureIdForTest: (combatantId: string, pictureId: number) => {
      if (!state?.combatantPictureIds.has(combatantId)) return false;
      state.combatantPictureIds = new Map(state.combatantPictureIds);
      (state.combatantPictureIds as Map<string, number>).set(combatantId, pictureId);
      draw();
      return true;
    },
    displayProfile: () => state ? { ...state.surface.profile() } : null,
    combatIconGeometry: (pictureId: number) => {
      const icon = state?.assets.iconLibrary.get(pictureId);
      return icon ? { width: icon.width, height: icon.height } : null;
    },
    visibleCombatIcons: () => visibleCells().map((cell) => {
      const footprint = cell.size ?? 1;
      const iconX = cell.icon && state
        ? Math.round(state.geometry.originX + cell.col * state.geometry.cellW + state.geometry.cellW * footprint / 2 - cell.icon.width / 2)
        : null;
      const iconY = cell.icon && state
        ? state.geometry.originY + state.geometry.cellH * (cell.row + footprint) - cell.icon.height
        : null;
      return {
        id: cell.combatantId,
        pictureId: state?.combatantPictureIds.get(cell.combatantId) ?? null,
        size: cell.size,
        down: cell.down,
        impaired: cell.impaired,
        guarding: cell.guarding,
        cellX: state ? state.geometry.originX + cell.col * state.geometry.cellW : null,
        cellY: state ? state.geometry.originY + cell.row * state.geometry.cellH : null,
        iconX,
        iconY,
        icon: cell.icon ? { width: cell.icon.width, height: cell.icon.height } : null,
      };
    }),
    backdropTiles: () => state?.assets.backdropTiles?.length ?? 0,
    terrainSources: () => state?.assets.terrainSources ?? [],
    terrainRestyleSources: () => Object.fromEntries(state?.assets.terrainRestyleSources ?? []),
    graphicsLoadState: () => state ? { requestedRevision: state.graphicsLoadRevision,
      appliedRevision: state.graphicsAppliedRevision, loading: state.graphicsLoading } : null,
    graphicsLoadCompletion: () => state?.graphicsLoadCompletion ?? Promise.resolve(),
    terrainRestyleIds: () => [...(state?.assets.terrainRestyles?.keys() ?? [])],
    terrainRestyleErrors: () => Object.fromEntries(state?.assets.terrainRestyleErrors ?? []),
    terrainRenderReceipt: () => terrainRenderReceipt,
    displayRect: () => state?.surface.rect() ?? null,
    combatantOpaqueSamplePoints: (id: string) => {
      if (!state) return [];
      const cell = visibleCells().find((cell) => cell.combatantId === id);
      if (!cell?.icon || cell.down) return [];
      const icon = cell.icon, size = cell.size ?? 1;
      const scale = size > 1 && icon.width <= state.geometry.cellW && icon.height <= state.geometry.cellH ? size : 1;
      const left = Math.round(state.geometry.originX + cell.col * state.geometry.cellW
        + state.geometry.cellW * size / 2 - icon.width * scale / 2);
      const top = state.geometry.originY + cell.row * state.geometry.cellH + state.geometry.cellH * size - icon.height * scale;
      const points: { x: number; y: number }[] = [];
      for (let y = 0; y < icon.height; y++) for (let x = 0; x < icon.width; x++) {
        if (icon.indices[y * icon.width + x] === icon.transparentIndex) continue;
        const px = left + x * scale, py = top + y * scale;
        if (px >= 8 && px < 176 && py >= 8 && py < 176) points.push({ x: px, y: py });
      }
      return points;
    },
    assetPaths: () => state?.assets.sourcePaths ?? null,
    /**
     * A cheap content hash over every backdrop tile's indices AND its palette entries.
     *
     * Exists so a graphics-set switch can be tested for what it is supposed to do — change the
     * pixels — rather than only for the path string it reports. Both halves matter: the Amiga art
     * differs from DOS in index layout, and where it does not, it still differs in colour.
     */
    backdropChecksum: () => {
      const tiles = state?.assets.backdropTiles;
      if (!tiles || tiles.length === 0) return 0;
      let h = 2166136261 >>> 0;
      const mix = (v: number) => { h = (Math.imul(h ^ (v & 0xff), 16777619) >>> 0); };
      for (const t of tiles) {
        mix(t.width); mix(t.height);
        for (const v of t.indices) mix(v);
        for (const c of t.palette?.colors ?? []) { if (c) { mix(c.r); mix(c.g); mix(c.b); } else mix(0); }
      }
      return h >>> 0;
    },
    hasIcon: () => !!state?.assets.enemyIcon,
    combatantIconCount: () => state?.assets.combatantIcons.size ?? 0,
    combatantIconIds: () => [...(state?.assets.combatantIcons.keys() ?? [])],
    activeId: () => state?.activeId ?? null,
    activePos: () => { const a = state?.combat.current(); return a ? { col: a.pos.col, row: a.pos.row } : null; },
    posOf: (id: string) => {
      const c = state?.combatants.find((it) => it.id === id);
      return c ? { col: c.pos.col, row: c.pos.row } : null;
    },
    facingOf: (id: string) => state?.combatants.find((it) => it.id === id)?.facing ?? null,
    encounterSurprise: () => state?.encounterSurprise ?? null,
    skyIndex: () => state?.sky?.skyIndex ?? null, // ovr029/030 — the resolved/painted sky band
    viewport: () => (state ? { col: state.view.col, row: state.view.row } : null),
    mapSize: () => (state ? { w: state.combat.terrain.width, h: state.combat.terrain.height } : null),
    placementMode: () => state?.placementMode ?? null,
    placementOverlapCount: () => state ? placementOverlapCount(state.combatants) : 0,
    persistentPartyIds: () => [...(state?.persistentPartyIds ?? [])],
    friendlyNpcIds: () => [...(state?.friendlyNpcIds ?? [])],
    tileMutations: () => state?.tileState !== null,
    backgroundSummary: () => state ? backgroundSummary(state.backgroundIds, state.combat.terrain.width, state.combat.terrain.height) : null,
    backgroundTileId: (col: number, row: number) => state?.backgroundIds?.[row * state.combat.terrain.width + col] ?? null,
    backdropTileAt: (col: number, row: number) => {
      const id = state?.backgroundIds?.[row * state.combat.terrain.width + col];
      if (id === undefined) return null;
      if (state?.backgroundIdsAreTileIndices) {
        const count = state.assets.backdropTiles?.length ?? Infinity;
        return Number.isFinite(count) && count > 0 ? Math.min(id, count - 1) : id;
      }
      return state?.ruleset === 'gen2'
        ? dqkNativeCombatTerrainMemberByte(id)
        : backgroundTileIndex(id, state?.assets.backdropTiles?.length ?? Infinity);
    },
    terrainInfo: (col: number, row: number) => {
      if (!state) return null;
      const id = state.backgroundIds?.[row * state.combat.terrain.width + col] ?? 0;
      if (state.backgroundIdsAreTileIndices) {
        const count = state.assets.backdropTiles?.length ?? Infinity;
        return {
          id,
          tile: Number.isFinite(count) && count > 0 ? Math.min(id, count - 1) : id,
          blocked: state.combat.terrain.blocked?.(col, row) ?? false,
          blocksSight: state.combat.terrain.blocksSight?.(col, row) ?? false,
          moveCost: state.combat.terrain.cost?.(col, row) ?? 1,
          height: 0,
        };
      }
      const t = state.ruleset === 'gen2' ? dqkNativeBackgroundTile(id) ?? backgroundTile(id) : backgroundTile(id);
      return {
        id,
        tile: state.ruleset === 'gen2'
          ? dqkNativeCombatTerrainMemberByte(id) ?? 0
          : backgroundTileIndex(id, state.assets.backdropTiles?.length ?? Infinity),
        blocked: state.combat.terrain.blocked?.(col, row) ?? false,
        blocksSight: state.combat.terrain.blocksSight?.(col, row) ?? false,
        moveCost: state.ruleset === 'gen2' ? (t.moveCost === 0xff ? 0xff : Math.max(1, t.moveCost)) : backgroundMoveCost(id),
        height: t.height,
      };
    },
    inspectMode: () => state?.inspectMode ?? false,
    inspectCursor: () => state?.inspectCursor ?? null,
    inspectLabel: () => state?.inspectLabel ?? '',
    inspectMove: (dc: number, dr: number) => { moveInspectCursor(dc, dr); return state?.inspectCursor ?? null; },
    terrainBlocked: (col: number, row: number) => state?.combat.terrain.blocked?.(col, row) ?? false,
    movementLeft: () => state?.combat.movementLeft() ?? 0,
    reachableCount: () => (state ? state.combat.reachable().size : 0),
    menuItems: () => [...(currentMenu()?.items ?? [])],
    menuPrompt: () => currentMenu()?.prompt ?? null,
    commandMenuItems: () => [...MENU_ITEMS],
    aimMenuItems: () => [...AIM_MENU_ITEMS],
    messageLine: () => combatMessageLines(),
    promptLine: () => currentPrompt() ?? null,
    panelRows: () => panelRows().map((r) => ({
      name: r.name, ac: r.ac, hp: r.hp, active: r.active ?? false, down: r.down ?? false,
      impaired: r.impaired ?? false, guarding: r.guarding ?? false,
    })),
    summary: () => combatSummary(),
    nameOf: (id: string) => nameOf(id),
    activateAim: (item: AimMenuItem) => {
      if ([...AIM_MENU_ITEMS, ...ALLY_CONFIRM_ITEMS].includes(item)) activateAimMenu(item);
      return state ? { phase: state.phase, manualAim: state.manualAim, aimCursor: state.aimCursor } : null;
    },
    manualAim: () => state?.manualAim ?? false,
    aimCursor: () => state?.aimCursor ?? null,
    aimMove: (dc: number, dr: number) => { moveManualAim(dc, dr); return state?.aimCursor ?? null; },
    targetAtCursor: () => manualTargetAtCursor(),
    menu: () => state?.menuSelected ?? -1,
    setMenu: (i: number) => { if (state) { state.menuSelected = i; draw(); } },
    phase: () => state?.phase ?? 'over',
    current: () => state?.combat.current()?.id ?? null,
    currentSide: () => state?.combat.current()?.side ?? null,
    livingEnemies: () => livingEnemyIds(),
    meleeTargets: () => state?.combat.meleeTargets().map((t) => t.id) ?? [],
    forceBumpAttackSetup,
    forceAllyAttackSetup,
    attackAlly: (id: string, confirmed = false) => {
      const before = state?.combat.current()?.id ?? null;
      const beforeLen = state?.log.length ?? 0;
      partyAttack(id, confirmed);
      draw();
      return { before, after: state?.combat.current()?.id ?? null, logBefore: beforeLen, logAfter: state?.log.length ?? 0, hp: state?.combatants.find((c) => c.id === id)?.hp ?? null };
    },
    confirmAllyTarget: (id: string) => {
      const opened = requestAllyAttackConfirmation(id);
      return { opened, phase: state?.phase ?? 'over', prompt: currentMenu()?.prompt ?? null, menu: currentMenu()?.items.join(' ') ?? '', hp: state?.combatants.find((c) => c.id === id)?.hp ?? null, logLen: state?.log.length ?? 0, current: state?.combat.current()?.id ?? null };
    },
    allyAttackConfirmed: () => state?.combat.allyAttackConfirmed() ?? false,
    teamCounts: () => state?.combat.teamCounts() ?? null,
    // M35.S1 — every combatant's id/name/side, so e2e can confirm an ECL-recruited ally
    // (`n{blockId}`-prefixed) landed on the `party` side of a real battle.
    combatants: () => state?.combatants.map((c) => ({
      id: c.id, name: c.name, side: c.side, pos: { ...c.pos }, facing: c.facing,
      size: c.size, npcControlled: c.npcControlled ?? false,
      persistentPartyMember: state?.persistentPartyIds.has(c.id) ?? false,
    })) ?? [],
    move: (dir: string) => {
      const before = state?.combat.current();
      const beforePos = before ? { col: before.pos.col, row: before.pos.row } : null;
      const ok = stepMove(dir);
      draw();
      const after = state?.combatants.find((c) => c.id === before?.id);
      return ok && beforePos && after && (after.pos.col !== beforePos.col || after.pos.row !== beforePos.row)
        ? { col: after.pos.col, row: after.pos.row }
        : null;
    },
    enterMove: () => { enterMoveMode(); return state ? { phase: state.phase, prompt: currentPrompt(), moveLeft: state.combat.movementLeft() } : null; },
    exitMove: () => { if (state?.phase === 'party-move') exitToMenu(); return state?.phase ?? 'over'; },
    attack: (id?: string) => seamAttack(id),
    guard: () => partyGuardWait('guard'),
    wait: () => partyGuardWait('wait'),
    delay: () => partyGuardWait('delay'),
    bandage: () => partyBandage(),
    canBandage: () => state?.combat.canBandage() ?? false,
    use: () => partyUse(),
    useItems: () => combatUseItemNames(),
    quick: () => partyQuick(),
    flee: () => partyFlee(),
    cast: () => partyCast(),
    turn: () => partyTurn(),
    canTurn: () => state?.combat.canTurnUndead() ?? false,
    turnLevelOf: (id: string) => state?.combatants.find((c) => c.id === id)?.turnLevel ?? null,
    undeadOf: (id: string) => state?.combatants.find((c) => c.id === id)?.undead ?? false,
    canBackstab: (id?: string) => state?.combat.canBackstab(id) ?? false,
    backstabLevelOf: (id: string) => state?.combatants.find((c) => c.id === id)?.backstabLevel ?? null,
    isBehind: (id: string) => state?.combat.isBehind(id) ?? false,
    // M48.S1 — exercise the real target-cycling banner (highlightTarget()), not just the attack seam.
    enterTarget: () => { enterTargetMode(); return state?.banner ?? ''; },
    currentTargetId: () => state?.targets[state!.targetIdx] ?? null,
    hazardAt: (col: number, row: number) => state?.combat.hazardAt(col, row)?.kind ?? null,
    cloudCount: () => state?.tileState?.clouds.length ?? 0,
    clouds: () => state?.tileState?.clouds.map((c) => ({ id: c.id, kind: c.kind, target: c.target, expiresRound: c.expiresRound })) ?? [],
    missileBracket: (id: string) => state?.combat.missileBracket(id) ?? null,
    isGuarding: (id: string) => state?.combat.isGuarding(id) ?? false,
    canDelay: () => state?.combat.canDelay() ?? false,
    sizeOf: (id: string) => state?.combat.sizeOf(id) ?? 1,
    // CT.7k-1 — the equipped weapon + movement allowance plumbed into combatant `id` from its character
    // record (name/kind/range for the readied weapon; move in whole cells). Drives the real-equipment e2e.
    weaponOf: (id: string) => {
      const w = state?.combatants.find((c) => c.id === id)?.weapons[0];
      return w ? { name: w.name, kind: w.kind, range: w.range ?? null } : null;
    },
    weaponsOf: (id: string) => (state?.combatants.find((c) => c.id === id)?.weapons ?? []).map((w) => w.name),
    moveOf: (id: string) => state?.combatants.find((c) => c.id === id)?.move ?? null,
    // M16.S1 — the resolved warrior multiple-attacks value for `id` (COAB half-attack units; e.g. 3 =
    // "3 attacks per 2 rounds"), or null when the figure has no multi-attack override (plain 1/round).
    halfAttacksOf: (id: string) => state?.combatants.find((c) => c.id === id)?.halfAttacks ?? null,
    // CT.7i — the pixel footprint the renderer paints for `id` (cell size × the figure's 2×2-or-1×1
    // footprint); a Large monster returns 48×48, a Small one 24×24 under the CONFIRMED 24px geometry.
    paintedFootprint: (id: string) => {
      if (!state) return { w: 0, h: 0 };
      const size = state.combat.sizeOf(id);
      return { w: state.geometry.cellW * size, h: state.geometry.cellH * size };
    },
    conditionOf: (id: string) => state?.combat.conditionOf(id) ?? 'ok',
    // M42.S1 — whether the party panel would paint `id`'s row grey (fallen), the same fact panelRows()
    // now threads through to composeCombatScreen.
    downOf: (id: string) => (state?.combatants.find((c) => c.id === id) ? state!.combat.conditionOf(id) !== 'ok' : null),
    slaysHelpless: () => state?.combat.slaysHelpless() ?? false, // CT.7j — coup-de-grace active (gen1)
    partyCanEscape: () => state?.combat.partyCanEscape() ?? false,
    moraleOf: (id: string) => state?.combatants.find((c) => c.id === id)?.morale ?? null,
    preparedSpells: (id: string) => (state?.combatants.find((c) => c.id === id)?.preparedSpells ?? []).map((s) => s.id),
    spellSave: (id: string) => state?.combatants.find((c) => c.id === id)?.save ?? null,
    // M18.S1 — the heal-dice amount for a prepared spell, so a test can prove a deity's healing-die
    // grant (Mishakal +1) reached the real tactical spell, not just the engine unit test.
    healDiceOf: (id: string, spellId: string) =>
      state?.combatants.find((c) => c.id === id)?.preparedSpells?.find((s) => s.id === spellId)?.heal ?? null,
    auto: () => resolveAuto(),
    // Test-only controlled verdict: still traverses the real tactical finalization, results pages,
    // overlay dismissal, and host callback; it changes only enemy HP so a very large retail roster
    // does not make browser acceptance depend on hundreds of AI turns.
    forcePartyVictory: () => {
      if (!state || state.over) return state?.outcome ?? null;
      for (const combatant of state.combatants) if (combatant.side === 'enemy') combatant.hp = 0;
      resolveAuto();
      return state?.outcome ?? null;
    },
    // Test-only controlled loss: preserve the real TacticalCombat end detector, combat result
    // screen, overlay dismissal, and host onEnd callback; only put each party figure down first.
    forcePartyDefeat: () => {
      if (!state || state.over) return state?.outcome ?? null;
      for (const combatant of state.combatants) {
        if (combatant.side !== 'party') continue;
        combatant.hp = 0;
        combatant.flags.delete('dead');
        combatant.flags.delete('dying');
        combatant.flags.add('unconscious');
      }
      resolveAuto();
      return state?.outcome ?? null;
    },
    // Test-only controlled withdraw: move every live party footprint onto the open neutral field's
    // border, then invoke TacticalCombat's real party-wide Flee action. This controls only the
    // reachability precondition; the engine still owns fled=true, finalization, and host resume.
    forcePartyFlee: () => {
      if (!state || state.over) return state?.combat.result().fled ?? false;
      let row = 0;
      for (const combatant of state.combatants) {
        if (combatant.side !== 'party' || combatant.hp <= 0) continue;
        combatant.pos = {
          col: 0,
          row: Math.min(row, Math.max(0, state.combat.terrain.height - (combatant.size ?? 1))),
        };
        row += Math.max(1, combatant.size ?? 1);
      }
      logEvents(state.combat.attemptPartyFlee());
      if (state.combat.isOver()) finalize();
      return state?.combat.result().fled ?? false;
    },
    autoStep: () => resolveAutoStep(),
    isOver: () => state?.over ?? false,
    outcome: () => state?.outcome ?? null,
    xp: () => state?.xp ?? 0,
    victoryText: () => state?.banner ?? '',
    continueBattleSelection: () => state?.continueBattleSelected ?? null,
    declineContinueBattle: () => { chooseContinueBattle(1); return state?.phase === 'victory'; },
    acknowledgeVictory: () => { acknowledgeVictory(); return state?.phase ?? null; },
    // M15.S1 — the log's real per-character XP lines, proving the award actually ran the split
    // (not just a stable aggregate total); e.g. asserts distinct "<name> receives N experience points."
    log: () => state?.log ?? [],
    treasure: () => (state?.haul ? { gold: state.haul.gold, itemCount: state.haul.items.length } : null),
    treasureMenuItems: () => [...treasureMenuItems()],
    treasureItem: (i: number) => state?.haul?.items[i]?.name ?? '',
    goldTaken: () => state?.goldTaken ?? false,
    itemsTaken: () => state?.itemsTaken ?? false,
    partyGold: () => getGold(),
    takeAllTreasure: () => takeTreasureAll(),
    takeMoney: () => takeTreasureMoney(),
    takeItems: () => takeTreasureItems(),
    exitTreasure: () => exitTreasure(),
    selectTreasureMenu: (label: string) => {
      if (!state || state.phase !== 'treasure') return false;
      const index = treasureMenuItems().findIndex((item) => item.toUpperCase() === label.toUpperCase());
      if (index < 0) return false;
      state.treasureMenu = index;
      activateTreasureMenu();
      return true;
    },
    treasureExitPending: () => state?.treasureExitConfirm ?? false,
    treasureStatus: () => state?.treasureStatus ?? '',
    declineRemainingTreasure: () => {
      if (!state?.treasureExitConfirm) return false;
      state.treasureMenu = 1;
      activateTreasureMenu();
      return true;
    },
    logLen: () => state?.log.length ?? 0,
    logTail: () => state?.log.slice(-3).join(' | ') ?? '',
    hpOf: (id: string) => state?.combatants.find((c) => c.id === id)?.hp ?? null,
    // M23.S2 — the innate regen_3_hp special (MON1SPC.DAX -> applyRegenAffect), so e2e can prove the
    // real fetched/decoded/joined side-table value reached the live tactical Combatant, not just the
    // engine's own unit tests.
    regenOf: (id: string) => state?.combatants.find((c) => c.id === id)?.regenPerRound ?? null,
    // M24.S1 — the innate half_damage special (DoK MON1SPC.DAX -> applyHalfDamageAffect), so e2e can
    // prove the real fetched/decoded/joined side-table value reached the live tactical Combatant.
    halfDamageOf: (id: string) => state?.combatants.find((c) => c.id === id)?.halfDamage ?? null,
    // M25.S1 — the Dex missile-attack to-hit bonus (ADND1E_ABILITIES.dexterity(dex).missile, applied
    // by tactical.ts's resolveHit), so e2e can prove a real player-entered ability score reaches the
    // live Combatant, not just the engine's own unit tests.
    missileHitBonusOf: (id: string) => state?.combatants.find((c) => c.id === id)?.missileHitBonus ?? null,
    // M26.S1 — a monster's carried MON{n}ITM.DAX item `plus` values (calcBattleExp's XP-bonus source),
    // so e2e can prove the real fetched/decoded/joined side-table value reached the live Combatant.
    itemPlusesOf: (id: string) => state?.combatants.find((c) => c.id === id)?.itemPluses ?? null,
    // M28.S1 — a monster's own con_saving_bonus (MON{n}SPC.DAX 0x61 -> applyConSavingBonus), so e2e can
    // prove the real fetched/decoded/joined side-table value reached the live Combatant.
    conSaveBonusOf: (id: string) => state?.combatants.find((c) => c.id === id)?.conSaveBonus ?? null,
    // M29.S1 — a monster's real carried-item identities (MON{n}ITM.DAX -> applyCarriedItems), so e2e can
    // prove the real fetched/decoded/joined side-table value reached the live Combatant.
    carriedItemsOf: (id: string) => state?.combatants.find((c) => c.id === id)?.carriedItems ?? null,
    flagsOf: (id: string) => [...(state?.combatants.find((c) => c.id === id)?.flags ?? [])],
    // M80.S1 — test-only seam: force `feared` onto a named combatant, then re-run the turn dispatcher,
    // so e2e can prove advanceTurn() now auto-flees a feared PARTY member instead of handing it a menu.
    forceFeared: (id: string) => { state?.combatants.find((c) => c.id === id)?.flags.add('feared'); },
    redispatch: () => advanceTurn(),
    isOverlay: () => !!state?.overlayEl,
    dismiss: () => dismissOverlay(),
  };
}

/** Common battle boot: build the engine, render, wire input + seam. */
function beginBattle(cfg: {
  surface: ScreenSurface;
  assets: CombatAssets;
  party: Combatant[];
  /** Source-backed helpers: party-side in combat, but distinct from the max-six saved PC roster. */
  friendlyNpcs?: Combatant[];
  enemies: Combatant[];
  names?: Map<string, string>;
  seed: number;
  /** Real encounter terrain (CT.3) + start anchors; omit for the flat fallback field. */
  terrain?: TerrainGrid;
  backgroundIds?: readonly number[];
  /** `backgroundIds` are direct flattened DUNGCOM indices, not BackGroundTiles semantic ids. */
  backgroundIdsAreTileIndices?: boolean;
  partyAnchor?: GridPos;
  enemyAnchor?: GridPos;
  partyPositions?: readonly GridPos[];
  enemyPositions?: readonly GridPos[];
  /** Recovered ECL SETUP_MONSTER/APPROACH state; distance feeds initial deployment when present. */
  encounterSetup?: EncounterSetup;
  /** Recovered ECL SURPRISE result; exposed to the host while mechanics remain source-gated. */
  encounterSurprise?: EncounterSurprise;
  /** Gold Box mapDirection code (0=N, 2=E, 4=S, 6=W; odd values diagonal). */
  mapDirection?: number;
  /** Game-generation combat rules (RE.2). DQK fights pass `gen2`; default `gen1` (CoK/DoK). */
  ruleset?: CombatRuleset;
  /** Disable CoAB's deployment routine when a title's floor is proven but its placement routine is not. */
  coabSourcePlacement?: boolean;
  /** Gateway `mapPos-floorOrigin` input for the shared Gen1 placement routine; ordinary wilderness = zero. */
  coabPartyStart?: GridPos;
  /** Disable CoAB-specific gas/downed background mutations for a title whose tile writes are not proven. */
  coabTileMutations?: boolean;
  /**
   * True only for the standalone `?combat=1` demo battle (no real roster behind the party): party
   * members then use the hand-built {@link DEMO_SPELLBOOKS}. Real encounters omit it (false) so each
   * caster's *memorized* spells + save-vs-spell come from their character record (CT.4b).
   */
  demo?: boolean;
  /** True only for the `?combat=1` standalone view: lays a demo web hazard patch (CT.7b). */
  demoHazard?: boolean;
  overlayEl: HTMLElement | null;
  onEnd: ((res: CombatResult) => void) | null;
  intro: string;
  /**
   * Optional area sky inputs (ovr029/030). A script-triggered OUTDOOR encounter passes its cell
   * roof byte (`get_wall_x2`) + per-area sky indices so the battle backdrop shows open sky; the
   * `?combat=1` demo omits them and defaults to an indoor dungeon (roofByte 0x80 → indoor sky).
   */
  roofByte?: number;
  indoorSky?: number;
  outdoorSky?: number;
  /** Current in-game day (M22.S2) — feeds a robed party mage's own moon-phase save shift. Omit ⇒ day 0. */
  day?: number;
  /** Directly observed CoK result-page share for one identified encounter; display only. */
  victoryPerCharacterXp?: number;
  /** Retail ECL TREASURE queue resolved by the dungeon host; offered only after party victory. */
  scriptedTreasure?: TreasureHaul;
  /** CoK CPIC block ids by combatant, retained for source-pinned presentation replacements. */
  combatantPictureIds?: ReadonlyMap<string, number>;
  /** Requested Restyle preference; individual missing or rejected assets keep their source art. */
  restyleMode?: boolean;
  requestedGraphicsMode?: RuntimeGraphicsMode;
  /** Original system source used as the Restyle fallback and for in-combat mode switches. */
  assetPaths?: CombatAssetPaths;
  runtimeGameId?: GameId;
  /** Standalone real-area preview: pan/inspect terrain instead of default command-key arrows. */
  inspectMode?: boolean;
  inspectLabel?: string;
}): void {
  const { combatants, terrain, backgroundIds, placementMode } = toTactical(
    cfg.party,
    cfg.friendlyNpcs ?? [],
    cfg.enemies,
    cfg.demo ?? false,
    cfg.day ?? 0,
    cfg.terrain,
    cfg.partyAnchor,
    cfg.enemyAnchor,
    encounterDistance(cfg.encounterSetup),
    cfg.mapDirection,
    cfg.backgroundIds,
    cfg.ruleset ?? 'gen1',
    cfg.demoHazard ?? false,
    cfg.partyPositions,
    cfg.enemyPositions,
    cfg.coabSourcePlacement ?? true,
    cfg.coabPartyStart,
  );
  const persistentPartyIds = new Set(cfg.party.slice(0, MAX_PLAYER_COMBATANTS).map((c) => c.id));
  const friendlyNpcIds = new Set((cfg.friendlyNpcs ?? []).map((c) => c.id));
  const names = cfg.names ?? new Map<string, string>();
  for (const c of combatants) if (!names.has(c.id)) names.set(c.id, c.name);

  // Resolve the battle's sky band once (ovr029 RedrawView): the roof byte's high bit picks the
  // area's indoor vs outdoor sky colour out of the fixed EGA table. Default = indoor dungeon.
  const skyIndex = selectSkyColour(
    { indoorSkyColour: cfg.indoorSky ?? 0, outdoorSkyColour: cfg.outdoorSky ?? 3 },
    cfg.roofByte ?? 0x80,
  );

  const initialBackgroundIds = cfg.backgroundIds ?? backgroundIds;
  const tileState = (cfg.coabTileMutations ?? true) && cfg.ruleset !== 'gen2' && initialBackgroundIds && terrain.width === 50 && terrain.height === 25 && initialBackgroundIds.length === 50 * 25
    ? createCoabCombatTileState(initialBackgroundIds)
    : null;
  const combatTerrain = terrainWithCoabTileState(terrain, tileState);

  state = {
    surface: cfg.surface,
    assets: cfg.assets,
    combat: createTacticalCombat(combatants, combatTerrain, {
      seed: cfg.seed,
      ruleset: cfg.ruleset ?? 'gen1',
      onRoundStart: (round) => { if (tileState) tickCoabCombatTileClouds(tileState, round); },
    }),
    combatants,
    persistentPartyIds,
    friendlyNpcIds,
    names,
    combatantPictureIds: cfg.combatantPictureIds ?? new Map(),
    requestedRestyle: cfg.restyleMode ?? false,
    requestedGraphicsMode: resolveCombatGraphicsMode({ gameId: cfg.runtimeGameId,
      demoMode: cfg.requestedGraphicsMode, restyle: cfg.restyleMode,
      requested: cfg.assetPaths?.graphicsMode, actual: cfg.assets.sourcePaths?.backdropGraphicSet }),
    runtimeGameId: cfg.runtimeGameId ?? null,
    assetPaths: cfg.assetPaths ?? null,
    graphicsLoadRevision: 0,
    graphicsAppliedRevision: 0,
    graphicsLoading: false,
    graphicsLoadCompletion: Promise.resolve(),
    restyleArtRevision: 0,
    geometry: presentationProfileFor('dos-ega').combatGrid,
    view: { col: 0, row: 0 },
    backgroundIds: tileState?.backgroundIds ?? initialBackgroundIds,
    backgroundIdsAreTileIndices: cfg.backgroundIdsAreTileIndices ?? false,
    placementMode,
    tileState,
    ruleset: cfg.ruleset ?? 'gen1',
    activeId: null,
    targets: [],
    targetIdx: 0,
    manualAim: false,
    aimCursor: null,
    allyConfirmTargetId: null,
    allyConfirmSelected: 0,
    seed: cfg.seed,
    menuSelected: 0,
    aimSelected: 0,
    phase: 'party-menu',
    banner: '',
    log: [cfg.intro],
    over: false,
    outcome: null,
    xp: 0,
    xpPerCharacter: 0,
    victoryPerCharacterXp: cfg.victoryPerCharacterXp ?? null,
    haul: null,
    scriptedHaul: cfg.scriptedTreasure
      ? { gold: cfg.scriptedTreasure.gold, items: cfg.scriptedTreasure.items.map((item) => ({ ...item })) }
      : null,
    treasureCursor: 0,
    goldTaken: false,
    itemsTaken: false,
    treasureMenu: 0,
    treasureStatus: '',
    treasureExitConfirm: false,
    treasureTakeMenu: false,
    continueBattleSelected: 1,
    overlayEl: cfg.overlayEl,
    onEnd: cfg.onEnd,
    dismissable: false,
    inspectMode: cfg.inspectMode ?? false,
    inspectCursor: null,
    inspectLabel: cfg.inspectLabel ?? '',
    encounterSurprise: cfg.encounterSurprise ?? null,
    sky: { skyIndex, horizonY: 48, floorIndex: 8 },
  };
  refreshCombatGraphicsControls();
  window.addEventListener('keydown', onKey, true);
  if (state.runtimeGameId && runtimeGraphicsGameId(state.runtimeGameId) === 'cok') {
    window.addEventListener('goldbox:graphics-mode', onCombatGraphicsMode);
    window.addEventListener('goldbox:local-asset-pack', onCombatLocalAssetPack);
  }
  gameAudio.enterScene('combat'); // the battle theme (tenser tempo) while the fight is live
  advanceTurn(); // position on the first actor (auto-runs any leading enemy turns)
  if (state.inspectMode) {
    const firstEnemy = state.combatants.find((c) => c.side === 'enemy');
    setInspectCursor(firstEnemy?.pos ?? state.combat.current()?.pos ?? cfg.enemyAnchor ?? cfg.partyAnchor ?? { col: 0, row: 0 });
    state.menuSelected = -1;
    draw();
  }
  installSeam();
  (window as unknown as { __rendered: number }).__rendered = state.combatants.length;
}

/**
 * Launch the **interactive** tactical combat screen as a modal overlay over the explorer for a real
 * script-triggered encounter. `onEnd(result)` fires when the player dismisses the finished battle.
 */
async function loadCokCombatRestyleIcons(assets: CombatAssets,
  combatantPictureIds: ReadonlyMap<string, number>): Promise<Pick<CombatAssets, 'combatRestyleIcons' | 'combatRestyleFallbackCells' | 'combatRestyleErrors'>> {
  const combatRestyleIcons = new Map<number, RgbaArt>();
  const combatRestyleFallbackCells = new Map<number, number>();
  const combatRestyleErrors = new Map<number, string>();
  const requestedIds = new Set(combatantPictureIds.values());
  for (const pictureId of requestedIds) {
    const identity = cokCombatRestyleIdentity(pictureId, assets.iconArchiveSha256);
    if (!identity) {
      combatRestyleErrors.set(pictureId, cokCombatRestyleSourceError(pictureId, assets.iconArchiveSha256)!);
      continue;
    }
    const source = [...combatantPictureIds]
      .map(([combatantId, id]) => id === pictureId ? assets.combatantIcons.get(combatantId) ?? null : null)
      .find((icon): icon is IndexedImage => icon !== null) ?? null;
    if (!source) continue;
    if (source.width !== identity.nativeWidth || source.height !== identity.nativeHeight) {
      combatRestyleErrors.set(pictureId, `source ${identity.bank} frame geometry differs from the pinned block`);
      continue;
    }
    try {
      if (identity.sourceIndicesSha256 && await terrainSha256(source.indices) !== identity.sourceIndicesSha256) {
        throw new Error(`source ${identity.bank} decoded frame differs from its pinned indices`);
      }
      const rawArt = await loadCokCombatRestyleIcon(identity);
      const pixels = new Uint8ClampedArray(rawArt.pixels);
      let erasedSourcePixels = 0;
      let visibleSourcePixels = 0;
      let restoredSourcePixels = 0;
      for (let sy = 0; sy < source.height; sy++) {
        for (let sx = 0; sx < source.width; sx++) {
          let alphaMax = 0;
          for (let oy = 0; oy < identity.pixelScale; oy++) {
            for (let ox = 0; ox < identity.pixelScale; ox++) {
              const alpha = pixels[((sy * identity.pixelScale + oy) * rawArt.width + sx * identity.pixelScale + ox) * 4 + 3]!;
              alphaMax = Math.max(alphaMax, alpha);
            }
          }
          const sourceTransparent = source.transparentIndex !== null
            && source.indices[sy * source.width + sx] === source.transparentIndex;
          if (sourceTransparent) {
            for (let oy = 0; oy < identity.pixelScale; oy++) for (let ox = 0; ox < identity.pixelScale; ox++) {
              pixels[((sy * identity.pixelScale + oy) * rawArt.width + sx * identity.pixelScale + ox) * 4 + 3] = 0;
            }
          } else {
            visibleSourcePixels++;
            if (alphaMax === 0) {
              erasedSourcePixels++;
              const sourceIndex = source.indices[sy * source.width + sx]!;
              const color = source.palette?.colors[sourceIndex] ?? assets.palette.colors[sourceIndex];
              if (!color) throw new Error('source palette is unavailable for a Restyle silhouette fallback');
              for (let oy = 0; oy < identity.pixelScale; oy++) for (let ox = 0; ox < identity.pixelScale; ox++) {
                const offset = ((sy * identity.pixelScale + oy) * rawArt.width + sx * identity.pixelScale + ox) * 4;
                pixels[offset] = color.r; pixels[offset + 1] = color.g; pixels[offset + 2] = color.b; pixels[offset + 3] = 255;
              }
              restoredSourcePixels++;
            }
          }
        }
      }
      if (erasedSourcePixels > Math.floor(visibleSourcePixels * 0.02)) {
        throw new Error(`Restyle output removes too much of the reviewed ${identity.bank} frame`);
      }
      combatRestyleIcons.set(pictureId, { ...rawArt, pixels });
      combatRestyleFallbackCells.set(pictureId, restoredSourcePixels);
    } catch (error) {
      combatRestyleErrors.set(pictureId, error instanceof Error ? error.message : 'invalid Restyle output');
    }
  }
  return { combatRestyleIcons, combatRestyleFallbackCells, combatRestyleErrors };
}

export async function launchCombat(cfg: {
  party: Combatant[];
  /**
   * Source-backed allies which fight on the party side in addition to the maximum six real PCs.
   * Every entry is forced to `side: 'party'`/`npcControlled: true` and is excluded from Party HP
   * persistence. The caller must provide ids unique across PCs, friendly NPCs, and enemies.
   */
  friendlyNpcs?: Combatant[];
  enemies: Combatant[];
  /** True only when `party` is the explicit preview fallback rather than persisted characters. */
  demo?: boolean;
  names?: Map<string, string>;
  /** Encounter combatant id -> explicit ECL CPIC block id; unknown blocks keep the normal fallback. */
  combatantPictureIds?: ReadonlyMap<string, number>;
  assets?: CombatAssets;
  seed?: number;
  /** Real local terrain for the fight (CT.3) + start anchors; omit for the flat fallback field. */
  terrain?: TerrainGrid;
  backgroundIds?: readonly number[];
  /** `backgroundIds` are direct flattened DUNGCOM indices recovered from a native framebuffer. */
  backgroundIdsAreTileIndices?: boolean;
  partyAnchor?: GridPos;
  enemyAnchor?: GridPos;
  /** Exact initial combat placement recovered from a native capture, in roster order. */
  partyPositions?: readonly GridPos[];
  enemyPositions?: readonly GridPos[];
  /** Recovered ECL SETUP_MONSTER/APPROACH state; distance feeds initial deployment when present. */
  encounterSetup?: EncounterSetup;
  /** Recovered ECL SURPRISE result; exposed to the host while mechanics remain source-gated. */
  encounterSurprise?: EncounterSurprise;
  /** Gold Box mapDirection code (0=N, 2=E, 4=S, 6=W; odd values diagonal). */
  mapDirection?: number;
  /** Game-generation combat rules (RE.2). DQK encounters pass `gen2`; default `gen1`. */
  ruleset?: CombatRuleset;
  coabSourcePlacement?: boolean;
  coabPartyStart?: GridPos;
  coabTileMutations?: boolean;
  intro?: string;
  onEnd?: (res: CombatResult) => void;
  /** Optional area sky (ovr029/030) for an outdoor encounter; omit ⇒ indoor dungeon default. */
  roofByte?: number;
  indoorSky?: number;
  outdoorSky?: number;
  /** Current in-game day (M22.S2) — feeds a robed party mage's own moon-phase save shift. Omit ⇒ day 0. */
  day?: number;
  /** Directly observed CoK result-page share for one identified encounter; display only. */
  victoryPerCharacterXp?: number;
  /** Retail ECL TREASURE queue resolved by the dungeon host; offered only after party victory. */
  scriptedTreasure?: TreasureHaul;
  /**
   * Banks to load when `assets` is not supplied — the seam the explorer uses to route its current
   * graphics-set choice into the backdrop. With preloaded assets, the paths still carry the
   * presentation choice and are used on subsequent graphics switches.
   */
  assetPaths?: CombatAssetPaths;
  /** CoK attract-demo preference. Null means that playback exited while combat was loading. */
  demoGraphicsMode?: () => RuntimeGraphicsMode | null;
}): Promise<void> {
  closeCombat();
  const launchPackRevision = localAssetPackRevision();
  const assets = cfg.assets ?? (await loadCombatAssets(cfg.assetPaths ?? {}).catch(() => ({
    frameTiles: null,
    font: null,
    backdropTiles: [makeFloorTile()],
    enemyIcon: null,
    iconLibrary: new Map(),
    combatantIcons: new Map(),
    combatRestyleIcons: new Map(),
    combatRestyleFallbackCells: new Map(),
    combatRestyleErrors: new Map(),
    playerAppearances: new Map(),
    playerAppearanceErrors: new Map(),
  } as CombatAssets)));
  for (const [combatantId, pictureId] of cfg.combatantPictureIds ?? []) {
    if (assets.combatantIcons.has(combatantId)) continue;
    const icon = assets.iconLibrary.get(pictureId);
    if (icon) assets.combatantIcons.set(combatantId, icon);
  }
  const playerPreparations = new Map<string, { record: NonNullable<(typeof cfg.party)[number]['cokAppearance']>; prepared: CokPlayerPreparation }>();
  const playerRecords = new Map<string, NonNullable<(typeof cfg.party)[number]['cokAppearance']>>();
  if (cfg.assetPaths?.runtimeGameId?.startsWith('cok')) {
    const appearanceLoads = new Map<string, Promise<CokPlayerPreparation | null>>();
    await Promise.all(cfg.party.map(async (member) => {
      const record = member.cokAppearance;
      if (!record) return;
      playerRecords.set(member.id, record);
      const key = JSON.stringify([
        record.cHeadRequest, record.cBodyBlock, record.cBodySlot, record.suffixCode, record.paletteBytes,
      ]);
      let loading = appearanceLoads.get(key);
      if (!loading) {
        loading = prepareCokPlayerAppearance(record, undefined, 'primary');
        appearanceLoads.set(key, loading);
      }
      try {
        const prepared = await loading;
        if (prepared) {
          assets.playerAppearances.set(member.id, prepared.original);
          playerPreparations.set(member.id, { record, prepared });
        }
        else assets.playerAppearanceErrors.set(member.id, 'player appearance tuple is not mapped yet');
      } catch (error) {
        assets.playerAppearanceErrors.set(
          member.id,
          error instanceof Error ? error.message : 'CoK player appearance is unavailable',
        );
      }
    }));
  }
  if (cfg.assetPaths?.runtimeGameId?.startsWith('cok')) {
    const loaded = await loadCokCombatRestyleIcons(assets, cfg.combatantPictureIds ?? new Map());
    assets.combatRestyleIcons = loaded.combatRestyleIcons;
    assets.combatRestyleFallbackCells = loaded.combatRestyleFallbackCells;
    assets.combatRestyleErrors = loaded.combatRestyleErrors;
  }

  const demoMode = cfg.demoGraphicsMode?.();
  if (demoMode === null) return;
  const requestedRestyle = demoMode === undefined ? cfg.assetPaths?.restyleMode ?? false : demoMode === 'Restyle';
  const initialMode = resolveCombatGraphicsMode({ gameId: cfg.assetPaths?.runtimeGameId, demoMode,
    restyle: requestedRestyle, requested: cfg.assetPaths?.graphicsMode, actual: assets.sourcePaths?.backdropGraphicSet });
  const overlay = el('div', 'sheet-overlay');
  const panel = el('div', 'sheet-panel');
  const emu = el('div', 'gb-emu');
  const presentationGameId = cfg.assetPaths?.runtimeGameId ?? '';
  const surface = createScreenSurface(DOS_EGA, presentationFitOptions(presentationGameId));
  followPresentationScale(surface, presentationGameId);
  emu.appendChild(surface.canvas);
  panel.appendChild(emu);
  const bar = el('div', 'sheet-buttons');
  if (cfg.assetPaths?.runtimeGameId?.startsWith('cok')) {
    const dos = el('button', `gb-btn${initialMode === 'DOS-EGA' ? ' active' : ''}`, 'DOS · EGA') as HTMLButtonElement;
    dos.type = 'button';
    dos.id = 'combat-graphics-dos';
    dos.setAttribute('aria-pressed', String(initialMode === 'DOS-EGA'));
    dos.addEventListener('click', () => setCombatGraphicsMode('DOS-EGA'));
    const amiga = cfg.assetPaths?.amigaDungcomPath
      ? el('button', `gb-btn${initialMode === 'Amiga' ? ' active' : ''}`, 'Amiga · 32-color') as HTMLButtonElement
      : null;
    if (amiga) {
      amiga.type = 'button';
      amiga.id = 'combat-graphics-amiga';
      amiga.setAttribute('aria-pressed', String(initialMode === 'Amiga'));
      amiga.addEventListener('click', () => setCombatGraphicsMode('Amiga'));
    }
    const restyle = el('button', `gb-btn${initialMode === 'Restyle' ? ' active' : ''}`, 'Restyle') as HTMLButtonElement;
    restyle.type = 'button';
    restyle.id = 'combat-graphics-restyle';
    restyle.setAttribute('aria-pressed', String(initialMode === 'Restyle'));
    restyle.addEventListener('click', () => setCombatGraphicsMode('Restyle'));
    if (cfg.demoGraphicsMode) {
      for (const control of [dos, amiga, restyle]) {
        if (control) control.dataset.demoGraphicsControl = 'true';
      }
    }
    const graphicsStatus = el('span', 'muted', '') as HTMLSpanElement;
    graphicsStatus.id = 'combat-graphics-status';
    bar.append(dos);
    if (amiga) bar.append(amiga);
    bar.append(restyle, graphicsStatus);
    const localPackControl = el('div', 'combat-local-pack-control');
    addLocalAssetPackPicker(localPackControl, () => {});
    bar.append(localPackControl);
  }
  const cont = el('button', 'gb-btn', 'Continue ▶') as HTMLButtonElement;
  cont.type = 'button';
  cont.addEventListener('click', () => dismissOverlay());
  bar.appendChild(cont);
  panel.appendChild(bar);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  try {
    beginBattle({
      surface,
      assets,
      party: cfg.party,
      friendlyNpcs: cfg.friendlyNpcs,
      enemies: cfg.enemies,
      demo: cfg.demo,
      names: cfg.names,
      seed: cfg.seed ?? DEMO_SEED,
      terrain: cfg.terrain,
      backgroundIds: cfg.backgroundIds,
      backgroundIdsAreTileIndices: cfg.backgroundIdsAreTileIndices,
      partyAnchor: cfg.partyAnchor,
      enemyAnchor: cfg.enemyAnchor,
      partyPositions: cfg.partyPositions,
      enemyPositions: cfg.enemyPositions,
      ...(cfg.encounterSetup ? { encounterSetup: cfg.encounterSetup } : {}),
      ...(cfg.encounterSurprise ? { encounterSurprise: cfg.encounterSurprise } : {}),
      ...(cfg.mapDirection !== undefined ? { mapDirection: cfg.mapDirection } : {}),
      ruleset: cfg.ruleset,
      coabSourcePlacement: cfg.coabSourcePlacement,
      coabPartyStart: cfg.coabPartyStart,
      coabTileMutations: cfg.coabTileMutations,
      overlayEl: overlay,
      onEnd: cfg.onEnd ?? null,
      intro: cfg.intro ?? 'The enemy attacks!',
      roofByte: cfg.roofByte,
      indoorSky: cfg.indoorSky,
      outdoorSky: cfg.outdoorSky,
      day: cfg.day,
      victoryPerCharacterXp: cfg.victoryPerCharacterXp,
      scriptedTreasure: cfg.scriptedTreasure,
      combatantPictureIds: cfg.combatantPictureIds,
      restyleMode: requestedRestyle,
      requestedGraphicsMode: initialMode,
      assetPaths: cfg.assetPaths,
      runtimeGameId: cfg.assetPaths?.runtimeGameId,
    });
  } catch (err) {
    closeCombat();
    overlay.remove();
    throw err;
  }
  const current = state;
  if (current) {
    const retryIcons = createCokCombatRestyleRetry();
    current.retryCombatRestyleArt = () => {
      if (!current.runtimeGameId || runtimeGraphicsGameId(current.runtimeGameId) !== 'cok' || !current.requestedRestyle) return;
      const revision = current.restyleArtRevision, pack = localAssetPackRevision(), epoch = current.combatRestyleRetryEpoch;
      const archive = current.assets.iconArchiveSha256;
      current.combatRestyleRetryCompletion = retryIcons({ archiveSha256: archive, generation: String(revision) + ':' + pack,
        requestedIds: current.combatantPictureIds.values(), failedIds: new Set(current.assets.combatRestyleErrors.keys()),
        successfulIds: new Set(current.assets.combatRestyleIcons.keys()),
        admitted: id => !!cokCombatRestyleIdentity(id, archive),
        load: id => loadCokCombatRestyleIcons(current.assets, new Map([...current.combatantPictureIds].filter(([, value]) => value === id))),
        isCurrent: () => state === current && current.restyleArtRevision === revision && localAssetPackRevision() === pack
          && current.assets.iconArchiveSha256 === archive && current.combatRestyleRetryEpoch === epoch && current.requestedRestyle,
        apply: (id, loaded) => {
          const art = loaded.combatRestyleIcons.get(id);
          if (art) {
            current.assets.combatRestyleIcons.set(id, art);
            current.assets.combatRestyleFallbackCells.set(id, loaded.combatRestyleFallbackCells.get(id) ?? 0);
            current.assets.combatRestyleErrors.delete(id);
          } else if (loaded.combatRestyleErrors.has(id)) current.assets.combatRestyleErrors.set(id, loaded.combatRestyleErrors.get(id)!);
          refreshCombatGraphicsControls(); draw();
        },
        failed: (id, error) => { current.assets.combatRestyleErrors.set(id, error instanceof Error ? error.message : 'invalid Restyle output'); refreshCombatGraphicsControls(); draw(); },
      });
    };
    current.refreshCombatRestyleArt = () => {
      const revision = ++current.restyleArtRevision;
      const packRevision = localAssetPackRevision();
      const stillCurrent = (): boolean => state === current && current.restyleArtRevision === revision
        && localAssetPackRevision() === packRevision;
      current.assets.combatRestyleIcons.clear();
      current.assets.combatRestyleFallbackCells.clear();
      current.assets.combatRestyleErrors.clear();
      current.assets.playerAppearanceErrors.clear();
      for (const [id] of playerRecords) {
        const previous = playerPreparations.get(id)?.prepared.original;
        if (previous) current.assets.playerAppearances.set(id, previous);
        else current.assets.playerAppearances.delete(id);
      }
      refreshCombatGraphicsControls();
      draw();
      const iconWork = current.runtimeGameId && runtimeGraphicsGameId(current.runtimeGameId) === 'cok'
        ? loadCokCombatRestyleIcons(current.assets, current.combatantPictureIds).then((loaded) => {
          if (!stillCurrent()) return;
          current.assets.combatRestyleIcons = loaded.combatRestyleIcons;
          current.assets.combatRestyleFallbackCells = loaded.combatRestyleFallbackCells;
          current.assets.combatRestyleErrors = loaded.combatRestyleErrors;
        })
        : Promise.resolve();
      const playerWork = [...playerRecords].map(async ([id, record]) => {
        const prior = playerPreparations.get(id)?.prepared.original;
        try {
          const prepared = await prepareCokPlayerAppearance(record, prior, 'primary');
          if (!stillCurrent()) return;
          if (!prepared) {
            current.assets.playerAppearanceErrors.set(id, 'player appearance tuple is not mapped yet');
            return;
          }
          playerPreparations.set(id, { record, prepared });
          current.assets.playerAppearances.set(id, prepared.original);
          const appearance = await prepared.restyleReady;
          if (!stillCurrent() || playerPreparations.get(id)?.prepared !== prepared) return;
          current.assets.playerAppearances.set(id, appearance);
          refreshCombatGraphicsControls();
          draw();
        } catch (error) {
          if (stillCurrent()) current.assets.playerAppearanceErrors.set(id,
            error instanceof Error ? error.message : 'CoK player appearance is unavailable');
        }
      });
      current.playerArtCompletion = Promise.all(playerWork);
      void Promise.all([iconWork, current.playerArtCompletion]).then(() => {
        if (!stillCurrent()) return;
        refreshCombatGraphicsControls();
        draw();
      });
    };
    if (demoMode !== undefined) {
      const originalMode = demoMode === 'Restyle' ? readRuntimeGraphicsFallback('cok') : demoMode;
      if (originalMode !== cfg.assetPaths?.graphicsMode) setCombatGraphicsMode(demoMode, false);
    }
    const apply = (id: string, prepared: CokPlayerPreparation): void => {
      void prepared.restyleReady.then((appearance) => {
        if (state !== current || playerPreparations.get(id)?.prepared !== prepared) return;
        current.assets.playerAppearances.set(id, appearance);
        refreshCombatGraphicsControls();
        draw();
      });
    };
    for (const [id, { prepared }] of playerPreparations) apply(id, prepared);
    current.playerArtCompletion = Promise.all([...playerPreparations.values()].map(({ prepared }) => prepared.restyleReady));
    current.retryPlayerArt = () => {
      const artRevision = current.restyleArtRevision;
      const packRevision = localAssetPackRevision();
      for (const [id, entry] of playerPreparations) {
        if (!current.assets.playerAppearances.get(id)?.frames.some((frame) => frame.restyleStatus.state === 'failed')) continue;
        // Pending synchronously prevents duplicate retries from consecutive explicit clicks.
        current.assets.playerAppearances.set(id, entry.prepared.original);
        void prepareCokPlayerAppearance(entry.record, entry.prepared.original, 'primary').then((prepared) => {
          if (!prepared || state !== current || current.restyleArtRevision !== artRevision
              || localAssetPackRevision() !== packRevision || playerPreparations.get(id) !== entry) return;
          playerPreparations.set(id, { record: entry.record, prepared });
          current.assets.playerAppearances.set(id, prepared.original);
          apply(id, prepared);
        });
      }
    };
    if (localAssetPackRevision() !== launchPackRevision) current.refreshCombatRestyleArt();
  }
  surface.refresh();
}

const PREVIEW_DIRS: readonly Direction[] = ['north', 'east', 'south', 'west'];

function mapCell(map: GameMap, x: number, y: number): GameMap['cells'][number] | null {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return map.cells[y * map.width + x] ?? null;
}

function coabFurnitureRoller(seed: number): { rollD10: () => number } {
  const rng = new Rng((seed ^ 0x370d3) >>> 0);
  return { rollD10: () => rng.die(10) };
}

function terrainForPose(map: GameMap, pose: { x: number; y: number; facing: Direction }, seed = DEMO_SEED): ReturnType<typeof buildCoabDungeonCombatMap> {
  return buildCoabDungeonCombatMap({
    sample: (x, y) => mapCell(map, x, y)?.walls ?? null,
    sampleDoors: (x, y) => mapCell(map, x, y)?.doors ?? null,
    sampleX2: (x, y) => mapCell(map, x, y)?.floor ?? 0,
    randomFurniture: coabFurnitureRoller(seed),
    party: pose,
  });
}

function choosePreviewTerrain(map: GameMap): ReturnType<typeof terrainForPose> & { pose: { x: number; y: number; facing: Direction }; blockedCount: number } {
  let best: (ReturnType<typeof terrainForPose> & { pose: { x: number; y: number; facing: Direction }; blockedCount: number; score: number }) | null = null;
  const candidates: { x: number; y: number; facing: Direction }[] = [];
  for (const e of map.entries) candidates.push({ x: e.x, y: e.y, facing: e.facing });
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const cell = mapCell(map, x, y);
      if (!cell) continue;
      const openEdges = PREVIEW_DIRS.filter((d) => cell.walls[d] === 0 || (cell.doors?.[d] ?? 0) !== 0).length;
      if (openEdges === 0) continue;
      for (const facing of PREVIEW_DIRS) candidates.push({ x, y, facing });
    }
  }
  for (const pose of candidates) {
    const built = terrainForPose(map, pose);
    let blockedCount = 0;
    for (let r = 0; r < built.terrain.height; r++) {
      for (let c = 0; c < built.terrain.width; c++) {
        if (built.terrain.blocked?.(c, r)) blockedCount++;
      }
    }
    const total = built.terrain.width * built.terrain.height;
    const open = total - blockedCount;
    if (open < 12) continue;
    const wallTarget = Math.min(42, Math.max(10, Math.round(total * 0.22)));
    const score = Math.abs(blockedCount - wallTarget) + (map.entries.some((e) => e.x === pose.x && e.y === pose.y) ? -4 : 0);
    if (!best || score < best.score) best = { ...built, pose, blockedCount, score };
  }
  if (best) return best;
  const fallback = map.entries[0] ? { x: map.entries[0].x, y: map.entries[0].y, facing: map.entries[0].facing } : { x: 0, y: 0, facing: 'north' as Direction };
  const built = terrainForPose(map, fallback);
  let blockedCount = 0;
  for (let r = 0; r < built.terrain.height; r++) for (let c = 0; c < built.terrain.width; c++) if (built.terrain.blocked?.(c, r)) blockedCount++;
  return { ...built, pose: fallback, blockedCount };
}

async function loadPreviewBattle(gameId: GameId): Promise<{
  title: string;
  mapName: string;
  pose: { x: number; y: number; facing: Direction };
  blockedCount: number;
  party: Combatant[];
  enemies: Combatant[];
  names: Map<string, string>;
  terrain: TerrainGrid;
  backgroundIds: readonly number[];
  partyAnchor: GridPos;
  enemyAnchor: GridPos;
}> {
  const gd = gameData(gameId);
  const [eclIdx, geoIdx, wdIdx, tileBytes, monIdx] = await Promise.all([
    fetchDaxBytes(gd.eclPath).then(daxBlocks),
    fetchDaxBytes(gd.geoPath).then(daxBlocks),
    fetchDaxBytes(gd.walldefPath).then(daxBlocks),
    fetchDaxBytes(gd.tilesPath),
    fetchDaxBytes(gd.monPath).then(daxBlocks),
  ]);
  const initEcl = eclIdx.get(gd.eclInitBlock);
  if (!initEcl) throw new Error(`${gd.eclPath}: block ${gd.eclInitBlock} not found`);
  const tileIdx = daxBlocks(tileBytes);
  const dungeon = loadDungeon(initEcl, {
    geoBlock: (id) => geoIdx.get(id) ?? null,
    walldefBlock: (id) => wdIdx.get(id) ?? null,
    tileBlock: (id) => tileIdx.get(id) ?? null,
  }, { label: `${gd.title} combat preview`, entry: gd.eclEntryOffset });
  const monRecords = [...monIdx.entries()]
    .filter(([, raw]) => sniffMonsterRecord(raw, gd.profileId))
    .map(([blockId, raw]) => decodeMonsterRecord(raw, blockId, gd.profileId));
  const lookup = monsterLookupFromArchive(monRecords);
  const roster = gameId === 'secret'
    ? [{ monsterId: 5, count: 1, picBlockId: 5 }] // Secret MON1CHA id 5 = RED DRAGON.
    : gameId === 'coab'
      ? [{ monsterId: 7, count: 1, picBlockId: 7 }] // CoAB MON2CHA id 7 = TROLL.
    : gameId === 'pool'
      ? [{ monsterId: 8, count: 1, picBlockId: 0 }] // Pool MON1CHA id 8 = OGRE.
      : [{ monsterId: 9, count: 3, picBlockId: 0 }];
  const { enemies, unresolved } = spawnEnemies(roster, lookup);
  if (enemies.length === 0) throw new Error(`${gd.title}: preview monster ${unresolved.join(', ') || '(none)'} not found`);
  const party = partyCombatants().length > 0 ? partyCombatants() : demoParty();
  const names = new Map<string, string>();
  for (const c of [...party, ...enemies]) names.set(c.id, c.name);
  const built = choosePreviewTerrain(dungeon.map);
  return {
    title: gd.title,
    mapName: dungeon.map.name,
    pose: built.pose,
    blockedCount: built.blockedCount,
    party,
    enemies,
    names,
    terrain: built.terrain,
    backgroundIds: built.backgroundIds,
    partyAnchor: built.partyAnchor,
    enemyAnchor: built.enemyAnchor,
  };
}

function buildDqkPreviewBackgroundIds(): number[] {
  const width = 50;
  const height = 25;
  const ids = Array.from({ length: width * height }, () => 0x1a);
  const set = (col: number, row: number, id: number): void => {
    if (col < 0 || row < 0 || col >= width || row >= height) return;
    ids[row * width + col] = id;
  };
  for (let col = 0; col < width; col++) {
    set(col, 0, 1);
    set(col, height - 1, 1);
  }
  for (let row = 0; row < height; row++) {
    set(0, row, 2);
    set(width - 1, row, 2);
  }
  for (let col = 10; col < 22; col++) set(col, 7, 0x37);
  for (let col = 28; col < 40; col++) set(col, 7, 0x38);
  for (let col = 13; col < 37; col++) set(col, 18, 0x3f);
  for (let col = 21; col < 28; col++) set(col, 12, 0x44);
  for (let row = 9; row < 13; row++) for (let col = 34; col < 40; col++) set(col, row, 0x47);
  for (let row = 15; row < 19; row++) for (let col = 31; col < 40; col++) set(col, row, 0x4c);
  return ids;
}

/** Boot a DQK Gen2 combat-terrain contract preview: explicit 50x25 ids, no live population claim. */
export async function startCombatDqkPreview(): Promise<number> {
  closeDungeon3d();
  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus('Loading DQK combat terrain preview...');
  closeCombat();
  void gameAudio.ensureLoaded();
  installGameAudioSeam();

  let assets: CombatAssets;
  try {
    assets = await loadCombatAssets();
  } catch {
    assets = {
      frameTiles: null, font: null, backdropTiles: [makeFloorTile()], enemyIcon: null,
      iconLibrary: new Map(), combatantIcons: new Map(), combatRestyleIcons: new Map(), combatRestyleFallbackCells: new Map(),
      combatRestyleErrors: new Map(), playerAppearances: new Map(), playerAppearanceErrors: new Map(), palette: EGA_PALETTE,
      sourcePaths: { tilesPath: TILES_PATH, iconPath: SPRIT_PATH, dungcomPath: DUNGCOM_PATH },
    };
  }

  const map = buildDqkNativeCombatMap({
    backgroundIds: buildDqkPreviewBackgroundIds(),
    partyAnchor: { col: 23, row: 12 },
    enemyAnchor: { col: 31, row: 10 },
  });
  const party = partyCombatants().length > 0 ? partyCombatants() : demoParty();
  const enemies = demoEnemies().slice(0, 2);
  const names = new Map<string, string>();
  for (const c of [...party, ...enemies]) names.set(c.id, c.name);

  const screen = el('div', 'combat-screen');
  const frame = el('div', 'combat-frame');
  const head = el('div', 'combat-head');
  head.appendChild(el('div', 'combat-title', 'DQK Combat Terrain Preview'));
  const meta = el('div', 'combat-meta');
  meta.innerHTML =
    '<span>Phase <b data-combat-meta="phase">-</b></span>' +
    '<span>Active <b data-combat-meta="active">-</b></span>' +
    '<span>Enemies <b data-combat-meta="enemies">-</b></span>' +
    '<span>Move <b data-combat-meta="move">-</b></span>';
  head.appendChild(meta);
  frame.appendChild(head);

  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA);
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);

  const menu = el('div', 'combat-command');
  menu.innerHTML =
    '<b>Arrow keys</b> inspect · <b>A</b> target · <b>Esc</b> center · ' +
    '<span style="color:#9aa">DQK explicit 50x25 background-id surface · not live DungCom/WildCom population</span>';
  frame.appendChild(menu);
  screen.appendChild(frame);
  out.appendChild(screen);

  beginBattle({
    surface,
    assets,
    party,
    enemies,
    names,
    seed: DEMO_SEED ^ 0xd00d,
    terrain: map.terrain,
    backgroundIds: map.backgroundIds,
    partyAnchor: map.partyAnchor,
    enemyAnchor: map.enemyAnchor,
    ruleset: 'gen2',
    overlayEl: null,
    onEnd: null,
    inspectMode: true,
    inspectLabel: 'DQK explicit terrain preview',
    intro: 'DQK terrain preview: explicit background ids, source-shaped renderer semantics.',
    day: 0,
  });
  surface.canvas.tabIndex = 0;
  surface.canvas.addEventListener('click', () => surface.canvas.focus());
  surface.refresh();
  setStatus('DQK combat terrain preview — explicit 50x25 ids, no live map-population claim.');
  return state ? state.combatants.length : 0;
}

/** Boot the Combat MVP preview: real dungeon terrain + real MON roster, with inspect/aim cursor. */
export async function startCombatMvp(gameId: GameId = 'cok'): Promise<number> {
  // This is a developer preview that loads a fixed retail install directly. The
  // production app deliberately packages no game archives; playable sessions
  // must be launched through the Library's selected local asset source instead.
  if (import.meta.env.PROD) {
    setStatus('Launch a game from the Library to play with its local artwork.');
    return 0;
  }
  closeDungeon3d();
  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus(`Loading ${gameData(gameId).title} combat MVP preview...`);
  closeCombat();
  void gameAudio.ensureLoaded();
  installGameAudioSeam();

  let assets: CombatAssets;
  let preview: Awaited<ReturnType<typeof loadPreviewBattle>>;
  try {
    [assets, preview] = await Promise.all([loadCombatAssets(COMBAT_PREVIEW_ASSETS[gameId]), loadPreviewBattle(gameId)]);
  } catch (err) {
    setStatus(`Could not load combat MVP: ${err instanceof Error ? err.message : String(err)}`);
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const screen = el('div', 'combat-screen');
  const frame = el('div', 'combat-frame');
  const head = el('div', 'combat-head');
  head.appendChild(el('div', 'combat-title', `${preview.title} Combat MVP`));
  const meta = el('div', 'combat-meta');
  meta.innerHTML =
    '<span>Phase <b data-combat-meta="phase">-</b></span>' +
    '<span>Active <b data-combat-meta="active">-</b></span>' +
    '<span>Enemies <b data-combat-meta="enemies">-</b></span>' +
    '<span>Move <b data-combat-meta="move">-</b></span>';
  head.appendChild(meta);
  frame.appendChild(head);

  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA, presentationFitOptions(gameId));
  followPresentationScale(surface, gameId);
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);

  const menu = el('div', 'combat-command');
  menu.innerHTML =
    '<b>Arrow keys</b> inspect · <b>A</b> target · <b>Esc</b> center · ' +
    `<span style="color:#9aa">${preview.mapName} ${preview.pose.x},${preview.pose.y} ${preview.pose.facing} · ${preview.blockedCount} blocked tactical cells</span>`;
  frame.appendChild(menu);

  const controls = el('div', 'combat-buttons');
  const addButton = (label: string, run: () => void): void => {
    const btn = el('button', 'gb-btn', label) as HTMLButtonElement;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      run();
      setStatus(`Combat MVP — ${String((window as unknown as { __combat?: { inspectLabel?: () => string } }).__combat?.inspectLabel?.() ?? '')}`);
    });
    controls.appendChild(btn);
  };
  addButton('Inspect N', () => moveInspectCursor(0, -1));
  addButton('Inspect W', () => moveInspectCursor(-1, 0));
  addButton('Inspect E', () => moveInspectCursor(1, 0));
  addButton('Inspect S', () => moveInspectCursor(0, 1));
  addButton('Target', () => enterTargetMode());
  addButton('Auto', () => resolveAuto());
  frame.appendChild(controls);
  screen.appendChild(frame);
  out.appendChild(screen);

  beginBattle({
    surface,
    assets,
    party: preview.party,
    enemies: preview.enemies,
    names: preview.names,
    seed: DEMO_SEED,
    terrain: preview.terrain,
    backgroundIds: preview.backgroundIds,
    partyAnchor: preview.partyAnchor,
    enemyAnchor: preview.enemyAnchor,
    overlayEl: null,
    onEnd: null,
    inspectMode: true,
    intro: `${preview.enemies.length} ${preview.enemies[0]?.name ?? 'monsters'} appear in the area.`,
    day: 0,
  });
  surface.canvas.tabIndex = 0;
  surface.canvas.addEventListener('click', () => {
    surface.canvas.focus();
    void gameAudio.ensureLoaded().then(() => { gameAudio.setEnabled(true); gameAudio.enterScene('combat'); });
  });
  surface.refresh();
  setStatus(`Combat MVP — ${preview.title} real area terrain with ${preview.enemies.map((e) => e.name).join(', ')}.`);
  return state ? state.combatants.length : 0;
}

/** Boot the standalone combat view (`?combat=1`): load assets, deploy a demo battle, render. */
export async function startCombat(): Promise<number> {
  closeDungeon3d();
  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus('Loading CoK combat assets…');
  closeCombat();
  void gameAudio.ensureLoaded();
  installGameAudioSeam();

  let assets: CombatAssets;
  try {
    assets = await loadCombatAssets();
  } catch (err) {
    setStatus(`Could not load combat: ${err instanceof Error ? err.message : String(err)}`);
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const screen = el('div', 'combat-screen');
  const frame = el('div', 'combat-frame');
  const head = el('div', 'combat-head');
  head.appendChild(el('div', 'combat-title', 'Champions of Krynn Combat'));
  const meta = el('div', 'combat-meta');
  meta.innerHTML =
    '<span>Phase <b data-combat-meta="phase">-</b></span>' +
    '<span>Active <b data-combat-meta="active">-</b></span>' +
    '<span>Enemies <b data-combat-meta="enemies">-</b></span>' +
    '<span>Move <b data-combat-meta="move">-</b></span>';
  head.appendChild(meta);
  frame.appendChild(head);
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA, presentationFitOptions('cok'));
  followPresentationScale(surface, 'cok');
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);
  const menu = el('div', 'combat-command');
  menu.innerHTML =
    '<b>←→</b> command · <b>Enter</b> confirm · <b>M</b>ove <b>V</b>iew <b>A</b>im <b>U</b>se ' +
    '<b>C</b>ast <b>T</b>urn <b>Q</b>uick <b>D</b>one &nbsp; ' +
    '<span style="color:#9aa">(tactical grid — engine positioned combat)</span>';
  frame.appendChild(menu);
  const controls = el('div', 'combat-buttons');
  const addButton = (label: string, run: () => void): void => {
    const btn = el('button', 'gb-btn', label) as HTMLButtonElement;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      surface.canvas.focus();
      void gameAudio.ensureLoaded().then(() => gameAudio.setEnabled(true));
      run();
      const outcome = state?.outcome;
      const phase = state?.phase ?? 'over';
      const active = state?.combat.current();
      const name = active ? nameOf(active.id) : '';
      const detail = outcome ? `done: ${outcome}${state?.xp ? `, ${state.xp} XP` : ''}` : phase === 'treasure' ? 'treasure' : name ? `${name}'s turn` : phase;
      setStatus(`Champions of Krynn — tactical combat (${detail}).`);
    });
    controls.appendChild(btn);
  };
  addButton('Move N', () => { if (state?.phase !== 'party-move') enterMoveMode(); stepMove('N'); draw(); });
  addButton('Move W', () => { if (state?.phase !== 'party-move') enterMoveMode(); stepMove('W'); draw(); });
  addButton('Move E', () => { if (state?.phase !== 'party-move') enterMoveMode(); stepMove('E'); draw(); });
  addButton('Move S', () => { if (state?.phase !== 'party-move') enterMoveMode(); stepMove('S'); draw(); });
  addButton('View', () => partyView());
  addButton('Aim', () => seamAttack());
  addButton('Use', () => partyUse());
  addButton('Cast', () => { partyCast(); });
  addButton('Turn', () => { partyTurn(); });
  addButton('Bandage', () => partyBandage());
  addButton('Quick', () => partyQuick());
  addButton('Done', () => partyGuardWait('wait'));
  addButton('Auto', () => resolveAuto());
  frame.appendChild(controls);
  screen.appendChild(frame);
  out.appendChild(screen);

  const forceDemo = new URLSearchParams(location.search).get('combat') === 'demo';
  const roster = forceDemo ? [] : partyCombatants();
  const party = roster.length > 0 ? roster : demoParty();
  beginBattle({
    surface,
    assets,
    party,
    enemies: demoEnemies(),
    seed: DEMO_SEED,
    demo: roster.length === 0, // demo party → hand-built spellbooks; a real roster uses memorized spells
    demoHazard: true,          // CT.7b — the standalone view always shows the web-zone demo
    overlayEl: null,
    onEnd: null,
    intro: 'A band of draconians blocks the way!',
  });
  surface.canvas.tabIndex = 0;
  surface.canvas.addEventListener('click', () => {
    surface.canvas.focus();
    void gameAudio.ensureLoaded().then(() => { gameAudio.setEnabled(true); gameAudio.enterScene('combat'); });
  });
  surface.canvas.focus();
  setStatus('Champions of Krynn — tactical combat.');
  return state ? state.combatants.length : 0;
}
