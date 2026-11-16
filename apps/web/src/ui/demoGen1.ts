/**
 * Generalized Gen1 "Play Demo" attract player — the same method `demo.ts` used to prove CoK's own
 * attract script (locate the title's real `inDemo` `EclBlockId` via structural function-shape
 * matching against the CoAB oracle — `tools/map_gen1_demo_entry.py`, the generalized form of
 * `tools/map_cok_demo_entry.py` — then run that exact block through the engine's real {@link EclVm}
 * and play back its effects), extended to cover what CoK's own demo never needed to handle:
 *
 *   - **Branching menus.** CoK's demo is a single linear script with zero pauses. Other titles'
 *     demos genuinely pause at in-script menus (DoK's `ECL1.DAX` block 2 stops at a real `PARLAY`
 *     "choose an attitude" prompt — HAUGHTY/SLY/NICE/MEEK/ABUSIVE — mid-scene, more than once).
 *     There is no player at an attract-mode demo, so every pause (`menu`/`input`/`who`) is answered
 *     with the VM's own documented "auto-continue" default, value `0` — the exact convention
 *     `EclVm.step()` already uses so a debugger can single-step through a script without hanging
 *     (see that method's doc comment). This is real engine behavior, not an invented shortcut: the
 *     VM writes the *first* item's own value to the destination cell, so the follow-on script reads
 *     a genuine (if arbitrary) choice, exactly as it would for a live player who picked the first
 *     option.
 *   - **Native picture animation.** PIC/BODY archives retain every decoded XOR-delta frame and the
 *     script's `advanceAnimatedPicture` CALL advances the currently displayed picture, matching the
 *     animated dragons and closing portraits in the retail demos.
 *   - **Combat is driven only by a decoded COMBAT pause.** Do not infer a no-combat ending from a
 *     partial static walk: the old generalized mapper used CoK's long operand table for DoK and
 *     Pools, stopped at their first short PARLAY, and incorrectly hid their later COMBAT opcodes.
 *     The live VM's per-profile dialect is authoritative here.
 *   - **Native first-person walking.** For profiles with proven scene archives, CALL effects carry
 *     the VM memory snapshot from their exact dispatch point. The player pairs LOAD_FILES and
 *     LOAD_PIECES, reconciles script X/Y/facing writes with native move-forward calls, and renders
 *     each redraw through the same GEO/WALLDEF/8X8D viewport pipeline as live exploration.
 */
import { closeDungeon3d } from './dungeon3dHost.js';
import {
  EclVm,
  decodeDaa,
  decodeDax,
  readDaxDataBlocks,
  decodeGeoBlock,
  loadDungeonWalls,
  renderFirstPersonViewWithSky,
  composeExploreScreen,
  createFramebuffer,
  blitIndexed,
  decode8x8dBlock,
  loadCokFont,
  makeEgaPalette,
  decodeMonsterArchive,
  monsterLookupFromArchive,
  monsterCombatant,
  type EclDialect,
  type EclEffect,
  type EclRunResult,
  type Combatant,
  type CombatResult,
  type EclCombatOutcome,
  type EncounterMonster,
  type MonsterLookup,
  type MonsterRecord,
  type IndexedImage,
  type IndexedFramebuffer,
  type BitmapFont,
  type ExploreParty,
  type GameMap,
  type DungeonWalls,
  type ExploreFrameLayout,
  type Palette,
  type GridPos,
} from '@goldbox/engine';
import { startTitleMenu } from './titleMenu.js';
import { el, renderToCanvas } from './render.js';
import { closeCombat, launchCombat, loadCombatAssets } from './combat.js';
import { demoCombatAssetPaths, demoCombatAssetReader, demoCombatRoster, isDemoGraphicsControl } from './demoCombatGraphics.js';
import { gameData } from './gameData.js';
import { assetUrl } from './catalog.js';
import { gameAudio, type AudioGameId } from '../audio/gameAudio.js';
import { readRuntimeGraphicsFallback, readRuntimeGraphicsMode, writeRuntimeGraphicsMode, type RuntimeGraphicsMode } from './runtimeGraphicsMode.js';
import { validateCokDemoAmigaSource, validateCokDemoDosSource } from './cokDemoArt.js';
import { addLocalAssetPackPicker, localAssetPackRevision } from './localAssetPack.js';
import type { AssetSource } from './assetSource.js';

/** Everything that varies per title. Paths are LITERALS at each call site (bundler convention). */
export interface Gen1DemoProfile {
  /** Shown in the status line / demo banner, e.g. `'Death Knights of Krynn'`. */
  displayName: string;
  /** `gameAudio.setGame` id — picks the title's own score/SFX. */
  audioGame: AudioGameId;
  /** The `ECL*.DAX` file holding the demo block, e.g. `'Death Knights of Krynn/ECL1.DAX'`. */
  eclPath: string;
  /** The demo's own literal `EclBlockId`, located via `tools/map_gen1_demo_entry.py`. */
  demoBlockId: number;
  /** The title's ECL operand-frame dialect (`ECL_GEN1` / `ECL_GEN1_SHORT` / …). */
  dialect: EclDialect;
  /** Every `PICTURE`-bearing archive the script's picture ids might resolve against, checked in order. */
  picturePaths: string[];
  /** Optional per-title Runtime graphics selector for a source-pinned attract-screen picture. */
  runtimeArt?: {
    gameId: string;
    pictureId: number;
    dosArchivePath: string;
    amigaArchivePath: string;
    loadRestyle: () => Promise<ImageBitmap>;
  };
  /** Boot UI archive containing the title's block-201 font and block-202 frame symbols. */
  uiPath?: string;
  /** Optional separate late-Gen1 frame-symbol archive (Pools uses BORDERS, not 8X8D0). */
  frameTilesPath?: string;
  /** Frame-symbol DAX block id; defaults to 202. */
  frameTilesBlockId?: number;
  /** Title-specific block-202 frame placement; omitted only when CoK's default ordering applies. */
  frameLayout?: ExploreFrameLayout;
  /** Active display palette when the title reprograms VGA DAC entries for its UI chrome. */
  screenPalette?: Palette;
  /** Absolute block-202 moon tile ids in native left-to-right order for this fixed attract scene. */
  demoMoonTiles?: readonly [number, number, number];
  /** Native first-person sky/ground archive and composition convention for this title. */
  walkBackdrop?: {
    path: string;
    kind: 'cok-sky' | 'dok-skygrnd';
    dayBlockId: number;
    nightBlockId?: number;
  };
  /** Pictures assembled by the native host from multiple ordinary DAX frames. */
  compositePictures?: Array<{
    pictureId: number;
    width: number;
    height: number;
    parts: Array<{ path: string; blockId: number; x: number; y: number }>;
  }>;
  /** The monster/NPC archive(s) `ADD_NPC`/`COMBAT` ids resolve against, checked in order. */
  monsterPaths: string[];
  /** `decodeMonsterArchive`'s layout-selection id, e.g. `'death-knights-of-krynn'`. */
  monsterProfileId: string;
  /**
   * The real area archives selected by this demo's ECL file number. When present, LOAD_FILES,
   * LOAD_PIECES, position writes, and native redraw/move calls become rendered first-person beats.
   * Omit for demos whose host presentation is not yet classified.
   */
  dungeonPaths?: {
    geoPaths: string[];
    walldefPaths: string[];
    tilesPaths: string[];
  };
  /** Retail default wall-piece selection when the demo's LOAD_FILES omits LOAD_PIECES. */
  fallbackPieces?: readonly [number, number, number];
  /** Per-engine ECL memory cells for x/y/facing/hour when they differ from early Gen1. */
  poseAddresses?: { x: number; y: number; facing: number; hour: number };
  /** Per-title low CALL ids used by late Gen1 host presentation. */
  callRoutineIds?: Partial<Record<'redrawDungeonView' | 'movePositionForward' | 'advanceAnimatedPicture', number>>;
  /** Native small-picture screen origin; early Gen1 defaults to 24,24. */
  portraitOrigin?: { x: number; y: number };
  /** Late-Gen1 precomposed background/chrome pieces from one source archive. */
  screenArt?: {
    path: string;
    backdropBlockId: number;
    decorations: ReadonlyArray<{
      blockId: number;
      frameIndex: number;
      x: number;
      y: number;
      transparentIndex?: number;
    }>;
  };
  /** Title/area-specific assets for the tactical segment. */
  combatPaths?: {
    tilesPath: string;
    frameTilesPath?: string;
    frameTilesBlockId?: number;
    iconPath: string;
    dungcomPath: string;
    frameLayout?: ExploreFrameLayout;
    moonTileIds?: readonly [number, number, number];
    /** Active title-specific DAC while the tactical screen is displayed. */
    palette?: Palette;
    /** Source DUNGCOM index remaps proven from the native expanded tactical buffer. */
    backdropIndexRemap?: Readonly<Record<number, number>>;
    /** CPIC source indices treated as transparent; defaults to the early-Gen1 0/8 pair. */
    iconTransparentIndices?: readonly number[];
    /** CPIC-only index remap applied before palette composition. */
    iconIndexRemap?: Readonly<Record<number, number>>;
  };
  /** Native 7×7 DUNGCOM tile-index snapshot and recovered initial formation anchors. */
  combatScene?: {
    tileIndices: readonly number[];
    partyAnchor: GridPos;
    enemyAnchor: GridPos;
    /** Exact native initial placements, in script roster order, when recovered from a capture. */
    partyPositions?: readonly GridPos[];
    enemyPositions?: readonly GridPos[];
    /** CPIC block ids in ADD_NPC order when the NPC id itself is not the combat-picture id. */
    partyPictureIds?: readonly number[];
    /** Per-party-figure horizontal mirrors, in ADD_NPC order. */
    partyPictureFlips?: readonly boolean[];
    /** Mirror named party CPICs when the native formation faces east. */
    flipPartyPictures?: boolean;
    /** Native CPIC figures are mirrored when this encounter faces west. */
    flipEnemyPictures?: boolean;
  };
  /** Native-demo HP values used only where this title's compact MON decoder still yields zero. */
  demoHitPoints?: Record<string, number>;
  /** Native-demo AC values where a late compact MON layout remains incomplete. */
  demoArmorClasses?: Record<string, number>;
}

async function fetchBytes(path: string, assetSource?: AssetSource): Promise<Uint8Array> {
  if (assetSource) {
    const basename = path.split(/[\\/]/).at(-1) ?? path;
    const bytes = await assetSource.readAsset(basename);
    if (!bytes) throw new Error(`${basename} was not found in the selected game folder`);
    return bytes;
  }
  const resp = await fetch(assetUrl(path));
  if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

interface Beat {
  kind: 'text' | 'picture' | 'animate' | 'scene' | 'viewport';
  text?: string;
  clear?: boolean;
  newline?: boolean;
  pictureId?: number;
  geoBlockId?: number;
  setBlockIds?: [number, number, number];
  pose?: DemoPose;
}

interface DemoPose {
  x: number;
  y: number;
  /** ECL-visible cardinal ordinal: 0=N, 1=E, 2=S, 3=W. */
  facing: number;
  /** ECL-owned area hour (`[0x4BC9]`), used by the native sky/ground presentation. */
  hour: number;
}

interface WalkPresentation {
  pendingGeoBlockId?: number;
  scriptPose?: DemoPose;
  hostPose?: DemoPose;
  fallbackPieces?: readonly [number, number, number];
  callIds?: number[];
}

interface DemoDungeonArchives {
  geo: Map<number, Uint8Array>;
  walldef: Map<number, Uint8Array>;
  tiles: Map<number, Uint8Array>;
}

interface DemoDungeonScene {
  map: GameMap;
  walls: DungeonWalls;
  geoBlockId: number;
}

interface WalkResult {
  beats: Beat[];
  npcJoins: { npcId: number; morale: number }[];
  combatMonsters: EncounterMonster[] | null;
  vm: EclVm;
  presentation: WalkPresentation;
}

const MAP_X_ADDR = 0xc04b;
const MAP_Y_ADDR = 0xc04c;
const MAP_DIRECTION_ADDR = 0xc04d;
const AREA_HOUR_ADDR = 0x4bc9;

function callPose(effect: Extract<EclEffect, { type: 'call' }>, profile?: Gen1DemoProfile): DemoPose | null {
  const memory = new Map(effect.memory);
  const a = profile?.poseAddresses ?? { x: MAP_X_ADDR, y: MAP_Y_ADDR, facing: MAP_DIRECTION_ADDR, hour: AREA_HOUR_ADDR };
  if (!memory.has(a.x) || !memory.has(a.y) || !memory.has(a.facing)) return null;
  return {
    x: memory.get(a.x)! & 0xff,
    y: memory.get(a.y)! & 0xff,
    facing: memory.get(a.facing)! & 0x03,
    hour: memory.get(a.hour) ?? 10,
  };
}

/**
 * Reconcile ECL-owned pose writes with changes made by native host calls. A move-forward CALL
 * changes the host pose but not the VM's sparse ECL memory; a later unchanged snapshot must
 * therefore preserve that movement. A changed snapshot means the script explicitly overwrote the
 * corresponding coordinate/facing and becomes authoritative again.
 */
function syncHostPose(presentation: WalkPresentation, scriptPose: DemoPose): DemoPose {
  if (!presentation.scriptPose || !presentation.hostPose) {
    presentation.scriptPose = { ...scriptPose };
    presentation.hostPose = { ...scriptPose };
    return presentation.hostPose;
  }
  const previous = presentation.scriptPose;
  if (scriptPose.x !== previous.x) presentation.hostPose.x = scriptPose.x;
  if (scriptPose.y !== previous.y) presentation.hostPose.y = scriptPose.y;
  if (scriptPose.facing !== previous.facing) presentation.hostPose.facing = scriptPose.facing;
  if (scriptPose.hour !== previous.hour) presentation.hostPose.hour = scriptPose.hour;
  presentation.scriptPose = { ...scriptPose };
  return presentation.hostPose;
}

function moveHostForward(pose: DemoPose): void {
  switch (pose.facing & 3) {
    case 0: pose.y--; break;
    case 1: pose.x++; break;
    case 2: pose.y++; break;
    case 3: pose.x--; break;
  }
}

function flattenOne(effects: readonly EclEffect[], presentation: WalkPresentation, profile?: Gen1DemoProfile): {
  beats: Beat[];
  npcJoins: { npcId: number; morale: number }[];
  combatMonsters: EncounterMonster[] | null;
} {
  const beats: Beat[] = [];
  const npcJoins: { npcId: number; morale: number }[] = [];
  let combatMonsters: EncounterMonster[] | null = null;
  for (const e of effects) {
    switch (e.type) {
      case 'print':
        beats.push({ kind: 'text', text: e.text ?? '', clear: e.clear, newline: e.newline });
        break;
      case 'picture':
        beats.push({ kind: 'picture', pictureId: e.id });
        break;
      case 'clearBox':
        beats.push({ kind: 'text', text: '', clear: true });
        break;
      case 'delay':
        beats.push({ kind: 'text' });
        break;
      case 'addNpc':
        npcJoins.push({ npcId: e.npcId, morale: e.morale });
        break;
      case 'loadFiles':
        presentation.pendingGeoBlockId = e.geoBlockId;
        if (presentation.fallbackPieces) {
          beats.push({ kind: 'scene', geoBlockId: e.geoBlockId, setBlockIds: [...presentation.fallbackPieces] as [number, number, number] });
          presentation.scriptPose = undefined;
          presentation.hostPose = undefined;
        }
        break;
      case 'loadPieces':
        if (presentation.pendingGeoBlockId !== undefined) {
          beats.push({
            kind: 'scene',
            geoBlockId: presentation.pendingGeoBlockId,
            setBlockIds: [...e.setBlockIds] as [number, number, number],
          });
          presentation.scriptPose = undefined;
          presentation.hostPose = undefined;
        }
        break;
      case 'encounterSetup':
        // At distance zero the native host swaps from the dungeon approach to SETUP_MONSTER's
        // close-up PIC id; subsequent CALL 0x6803 effects animate that picture.
        if (e.setup.distance === 0) beats.push({ kind: 'picture', pictureId: e.setup.picId });
        break;
      case 'call': {
        (presentation.callIds ??= []).push(e.routineId);
        const role = Object.entries(profile?.callRoutineIds ?? {})
          .find(([, id]) => id === e.routineId)?.[0] ?? e.routine;
        if (role === 'advanceAnimatedPicture') {
          beats.push({ kind: 'animate' });
          break;
        }
        if (role !== 'redrawDungeonView' && role !== 'movePositionForward') break;
        const snapshot = callPose(e, profile);
        if (!snapshot) break;
        const pose = syncHostPose(presentation, snapshot);
        if (role === 'redrawDungeonView') {
          beats.push({ kind: 'viewport', pose: { ...pose } });
        } else {
          moveHostForward(pose);
        }
        break;
      }
      case 'combat':
        combatMonsters = e.monsters;
        break;
      default:
        break; // other host opcodes have no proven demo presentation role
    }
  }
  return { beats, npcJoins, combatMonsters };
}

/**
 * Run the demo script to its first real pause point: a live `COMBAT`, or the script's own `EXIT`.
 * Any `menu`/`input`/`who` pause along the way is auto-answered with `0` (see module doc comment) —
 * an attract demo has no player, and this is the VM's own documented auto-continue convention, so
 * the walk can happen synchronously up front rather than waiting on (nonexistent) input each hop.
 * `from` is the result of the run/resume call that started this walk (`vm.run()` for a fresh
 * script, or `vm.resume(...)` to continue draining beats after a real combat resolves).
 */
function walkToPause(vm: EclVm, from: EclRunResult, presentation: WalkPresentation = {}, profile?: Gen1DemoProfile): WalkResult {
  let result = from;
  const beats: Beat[] = [];
  const npcJoins: { npcId: number; morale: number }[] = [];
  let combatMonsters: EncounterMonster[] | null = null;
  let hops = 0;
  for (;;) {
    const flat = flattenOne(result.effects, presentation, profile);
    beats.push(...flat.beats);
    npcJoins.push(...flat.npcJoins);
    if (flat.combatMonsters) { combatMonsters = flat.combatMonsters; break; }
    if (result.status !== 'awaiting-input') break;
    if (++hops > 64) break; // safety cap against a pathological loop — no known script needs this many
    result = vm.resume(0);
  }
  return { beats, npcJoins, combatMonsters, vm, presentation };
}

function toEclCombatOutcome(res: Pick<CombatResult, 'outcome'> & { fled?: boolean }): EclCombatOutcome {
  if (res.fled) return 'flee';
  return res.outcome === 'party' ? 'victory' : 'defeat';
}

interface CombatSeam {
  isOver?: () => boolean;
  phase?: () => string;
  declineContinueBattle?: () => unknown;
  acknowledgeVictory?: () => unknown;
  takeAllTreasure?: () => void;
  exitTreasure?: () => void;
  auto?: () => void;
  autoStep?: () => boolean;
  dismiss?: () => void;
}
function combatSeam(): CombatSeam | null {
  return (window as unknown as { __combat?: CombatSeam }).__combat ?? null;
}

export interface Gen1DemoHooks {
  onExit?: () => void;
  route?: string;
  assetSource?: AssetSource;
}

interface DemoState {
  timer: number | null;
  vm: EclVm;
  beats: Beat[];
  beatIdx: number;
  phase: 'narration' | 'combat';
  text: string;
  npcJoins: { npcId: number; morale: number }[];
  combatMonsters: EncounterMonster[] | null;
  monsterLookup: MonsterLookup;
  pictures: Map<number, DemoPicture>;
  amigaPictures: Map<number, DemoPicture>;
  runtimeGraphicsMode: RuntimeGraphicsMode | null;
  dosPictureValidated: boolean;
  amigaPictureValidated: boolean;
  displayedArtSource: 'DOS-EGA' | 'Amiga' | 'Restyle';
  restyleCanvas: HTMLCanvasElement | null;
  restyleBitmap: ImageBitmap | null;
  restyleLoading: boolean;
  restyleError: string | null;
  graphicsRevision: number;
  bitmapPackRevision: number | null;
  localPackListener: (() => void) | null;
  graphicsStatus: HTMLElement | null;
  graphicsListener: ((event: Event) => void) | null;
  screenAssets: DemoScreenAssets;
  partyPanel: ExploreParty[];
  currentPictureId: number | null;
  currentPictureFrame: number;
  currentViewport: IndexedFramebuffer | null;
  dungeonArchives: DemoDungeonArchives | null;
  dungeonScene: DemoDungeonScene | null;
  scenePalette: Palette | null;
  presentation: WalkPresentation;
  canvas: HTMLCanvasElement;
  textEl: HTMLElement;
  banner: HTMLElement | null;
  hooks: Gen1DemoHooks;
  profile: Gen1DemoProfile;
  combats: number;
  lastOutcome: string | null;
  partyNames: string[];
  enemyNames: string[];
  partyHp: number[];
  enemyHp: number[];
  viewports: number;
  picturesShown: number;
  animationFrames: number;
  missingPictures: number;
  combatSteps: number;
  lastPose: DemoPose | null;
  walkError: string | null;
}

interface DemoPicture {
  frames: IndexedImage[];
}

interface DemoScreenAssets {
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
  walkBackdropFrames: Map<number, IndexedImage>;
  background: IndexedImage | null;
  decorations: Array<{ image: IndexedImage; x: number; y: number }>;
}

let state: DemoState | null = null;

function setStatus(msg: string): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (s) { s.textContent = msg; s.className = 'status'; }
}

export function isGen1DemoPlaying(): boolean {
  return state !== null;
}

export function gen1DemoStats(): {
  phase: string; beatsPlayed: number; text: string; combats: number; lastOutcome: string | null;
  party: string[]; enemies: string[]; viewports: number; sceneGeo: number | null;
  partyHp: number[]; enemyHp: number[];
  pose: DemoPose | null; walkError: string | null; pictures: number; animationFrames: number;
  missingPictures: number; combatSteps: number; callIds: number[]; status: string;
  canvas: { width: number; height: number } | null;
  graphicsMode: RuntimeGraphicsMode | null; pictureId: number | null; pictureFrame: number;
  artSource: 'DOS-EGA' | 'Amiga' | 'Restyle'; restyleVisible: boolean;
  graphicsRevision: number; bitmapPackRevision: number | null; localPackRevision: number;
  restyleLoading: boolean; restyleError: string | null;
} {
  return {
    phase: state?.phase ?? 'ended',
    beatsPlayed: state?.beatIdx ?? 0,
    text: state?.text ?? '',
    combats: state?.combats ?? 0,
    lastOutcome: state?.lastOutcome ?? null,
    party: state ? [...state.partyNames] : [],
    enemies: state ? [...state.enemyNames] : [],
    partyHp: state ? [...state.partyHp] : [],
    enemyHp: state ? [...state.enemyHp] : [],
    viewports: state?.viewports ?? 0,
    sceneGeo: state?.dungeonScene?.geoBlockId ?? null,
    pose: state?.lastPose ? { ...state.lastPose } : null,
    walkError: state?.walkError ?? null,
    pictures: state?.picturesShown ?? 0,
    animationFrames: state?.animationFrames ?? 0,
    missingPictures: state?.missingPictures ?? 0,
    combatSteps: state?.combatSteps ?? 0,
    callIds: [...(state?.presentation.callIds ?? [])],
    canvas: state ? { width: state.canvas.width, height: state.canvas.height } : null,
    graphicsMode: state?.runtimeGraphicsMode ?? null,
    pictureId: state?.currentPictureId ?? null,
    pictureFrame: state?.currentPictureFrame ?? 0,
    artSource: state?.displayedArtSource ?? 'DOS-EGA',
    restyleVisible: !!state?.restyleCanvas && !state.restyleCanvas.hidden,
    graphicsRevision: state?.graphicsRevision ?? 0,
    bitmapPackRevision: state?.bitmapPackRevision ?? null,
    localPackRevision: localAssetPackRevision(),
    restyleLoading: state?.restyleLoading ?? false, restyleError: state?.restyleError ?? null,
    status: document.querySelector('#status')?.textContent ?? '',
  };
}

export function stopGen1Demo(): void {
  if (!state) return;
  if (state.timer !== null) { clearInterval(state.timer); state.timer = null; }
  if (state.phase === 'combat') closeCombat();
  window.removeEventListener('keydown', onKey, true);
  document.removeEventListener('click', onClick, true);
  if (state.graphicsListener) window.removeEventListener('goldbox:graphics-mode', state.graphicsListener);
  if (state.localPackListener) window.removeEventListener('goldbox:local-asset-pack', state.localPackListener);
  state.restyleBitmap?.close();
  state.restyleBitmap = null;
  state.banner?.remove();
  const hooks = state.hooks;
  state = null;
  (hooks.onExit ?? (() => { startTitleMenu(); }))();
}

function onKey(e: KeyboardEvent): void {
  if (!state) return;
  if (isDemoGraphicsControl(e.target, e.key)) return;
  if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
  e.preventDefault();
  e.stopPropagation();
  stopGen1Demo();
}

function onClick(e: MouseEvent): void {
  if (!state) return;
  if (isDemoGraphicsControl(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  stopGen1Demo();
}

function loadScene(beat: Beat): void {
  if (!state?.dungeonArchives || beat.geoBlockId === undefined || !beat.setBlockIds) return;
  try {
    const geoRaw = state.dungeonArchives.geo.get(beat.geoBlockId);
    if (!geoRaw) throw new Error(`GEO block ${beat.geoBlockId} not found`);
    const { map } = decodeGeoBlock(geoRaw, `${state.profile.displayName} demo GEO#${beat.geoBlockId}`);
    const walls = loadDungeonWalls(beat.setBlockIds, {
      walldefBlock: (id) => state!.dungeonArchives!.walldef.get(id) ?? null,
      tileBlock: (id) => state!.dungeonArchives!.tiles.get(id) ?? null,
    });
    state.dungeonScene = { map, walls, geoBlockId: beat.geoBlockId };
    const colors = [...EGA_PALETTE.colors];
    const palettes = [
      ...walls.tileSets.map((set) => set?.palette),
      walls.singleBank?.palette,
      ...walls.combinedBanks.map((set) => set?.palette),
      ...Array.from(state.screenAssets.walkBackdropFrames.values(), (image) => image.palette),
    ];
    for (const palette of palettes) palette?.colors.forEach((color, i) => { if (color) colors[i] = color; });
    state.scenePalette = { colors, source: EGA_PALETTE.source };
  } catch (error) {
    state.dungeonScene = null;
    state.scenePalette = null;
    state.walkError = error instanceof Error ? error.message : String(error);
  }
}

const EGA_PALETTE = makeEgaPalette();

function wrapDemoText(text: string, width = 38): string {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      if (line && line.length + 1 + word.length > width) {
        lines.push(line);
        line = word;
      } else {
        line += (line ? ' ' : '') + word;
      }
    }
    if (line) lines.push(line);
  }
  return lines.slice(-6).join('\n');
}

function positionLine(): string | undefined {
  if (!state?.lastPose) return undefined;
  const p = state.lastPose;
  return `${p.x},${p.y} ${['N', 'E', 'S', 'W'][p.facing & 3]} ${String(p.hour).padStart(2, '0')}:00`;
}

function demoScreenPalette(active?: { palette?: Palette | null } | null): Palette {
  const base = state?.profile.screenPalette ?? EGA_PALETTE;
  const colors = [...base.colors];
  const overlay = (palette?: Palette | null): void => {
    palette?.colors.forEach((color, i) => { if (color) colors[i] = color; });
  };
  overlay(state?.screenAssets.frameTiles?.[0]?.palette);
  overlay(state?.screenAssets.background?.palette);
  state?.screenAssets.decorations.forEach((decoration) => overlay(decoration.image.palette));
  overlay(state?.scenePalette);
  overlay(active?.palette);
  return { colors, source: base.source };
}

/** Build the exact 168×168 pre-wall backdrop used inside the retail 88×88 picture window. */
function walkBackdrop(pose: DemoPose): IndexedImage | undefined {
  if (!state?.profile.walkBackdrop) return undefined;
  const cfg = state.profile.walkBackdrop;
  const day = state.screenAssets.walkBackdropFrames.get(cfg.dayBlockId);
  if (!day) return undefined;
  const fb = createFramebuffer(168, 168, 0);
  if (cfg.kind === 'dok-skygrnd') {
    // SKYGRND#2 is the complete daytime 88×88 sky+ground. At night, #1 replaces its upper 44 px
    // while #2's lower ground remains — exact against DoK native frames t074/t086.
    blitIndexed(fb, day, 16, 16);
    const night = cfg.nightBlockId === undefined ? null : state.screenAssets.walkBackdropFrames.get(cfg.nightBlockId);
    if (pose.hour >= 18 && night) blitIndexed(fb, night, 16, 16);
  } else {
    // CoK SKY#252 is an 88×48 ground strip whose first magenta row keys over the black horizon.
    blitIndexed(fb, { ...day, transparentIndex: 13 }, 16, 56);
  }
  return {
    ...fb,
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: state.profile.screenPalette ?? EGA_PALETTE,
    encoding: `${cfg.kind}-demo-backdrop`,
  };
}

/** Paint one complete native 320x200 screen; pictures and walking share the retail HUD. */
function renderDemoScreen(): void {
  if (!state) return;
  const frameTiles = state.screenAssets.frameTiles;
  let viewport = state.currentViewport;
  let bigPicture: IndexedImage | null = null;
  const current = state.currentPictureId === null ? null : state.pictures.get(state.currentPictureId);
  const graphics = state.profile.runtimeArt;
  const mode = state.runtimeGraphicsMode ?? 'DOS-EGA';
  const fallback = graphics ? readRuntimeGraphicsFallback(graphics.gameId) : 'DOS-EGA';
  const amiga = state.currentPictureId === graphics?.pictureId && state.amigaPictureValidated
    ? state.amigaPictures.get(graphics.pictureId) : null;
  const selectedSource = (mode === 'Amiga' || (mode === 'Restyle' && fallback === 'Amiga')) && amiga ? amiga : current;
  const image = selectedSource?.frames[state.currentPictureFrame % selectedSource.frames.length] ?? null;
  if (image) {
    if (image.width >= 280) {
      bigPicture = image;
      viewport = null;
    } else {
      const portrait = createFramebuffer(168, 168, 0);
      const origin = state.profile.portraitOrigin ?? { x: 24, y: 24 };
      blitIndexed(portrait, image, origin.x - 8 + image.xOffset, origin.y - 8 + image.yOffset);
      viewport = portrait;
    }
  }
  const fb = composeExploreScreen({
    background: state.screenAssets.background,
    decorations: state.screenAssets.decorations,
    frameTiles,
    frameLayout: state.profile.frameLayout,
    moons: state.profile.demoMoonTiles?.map((id) => frameTiles?.[id] ?? null),
    font: state.screenAssets.font,
    viewport,
    party: state.partyPanel,
    position: positionLine(),
    message: wrapDemoText(state.text),
  });
  // A 304x120 BIGPIC replaces the whole top interior; the compositor's y=128 separator remains.
  if (bigPicture) blitIndexed(fb, bigPicture, 8 + bigPicture.xOffset, 8 + bigPicture.yOffset);
  renderToCanvas(state.canvas, {
    ...fb,
    xOffset: 0,
    yOffset: 0,
    transparentIndex: null,
    palette: demoScreenPalette(image),
    encoding: 'gen1-demo-screen',
  });
  // `renderToCanvas`'s asset-gallery zoom is inappropriate for a complete emulated screen.
  state.canvas.style.width = '100%';
  state.canvas.style.height = '100%';

  const restyleScene = !!graphics && state.currentPictureId === graphics.pictureId
    && state.currentPictureFrame === 0 && mode === 'Restyle';
  if (state.restyleCanvas) {
    state.restyleCanvas.hidden = !(restyleScene && state.dosPictureValidated && state.restyleBitmap);
    if (state.restyleCanvas.hidden) {
      const context = state.restyleCanvas.getContext('2d');
      context?.clearRect(0, 0, state.restyleCanvas.width, state.restyleCanvas.height);
    }
  }
  state.displayedArtSource = !state.restyleCanvas?.hidden ? 'Restyle'
    : selectedSource === amiga && amiga ? 'Amiga' : 'DOS-EGA';
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-demo-graphics-mode]')) {
    button.classList.toggle('active', button.dataset.demoGraphicsMode === mode);
    button.setAttribute('aria-pressed', button.dataset.demoGraphicsMode === mode ? 'true' : 'false');
  }
  if (state.graphicsStatus) {
    if (!graphics) state.graphicsStatus.textContent = '';
    else if (mode === 'Restyle' && !state.dosPictureValidated) {
      state.graphicsStatus.textContent = `Restyle unavailable for this source; ${fallback} art shown.`;
    } else if (restyleScene && state.restyleBitmap) {
      state.graphicsStatus.textContent = 'New graphics · BIGPIC2 #116 · frame 0';
    } else if (restyleScene && state.restyleError) {
      state.graphicsStatus.textContent = `New graphics unavailable; ${fallback} art shown.`;
    } else if (restyleScene && state.restyleLoading) {
      state.graphicsStatus.textContent = `Loading new graphics; ${fallback} art shown.`;
    } else if (mode === 'Restyle') {
      state.graphicsStatus.textContent = `Restyle applies to BIGPIC2 #116; ${fallback} art is used elsewhere.`;
    } else if (mode === 'Amiga' && state.currentPictureId === graphics.pictureId && !amiga) {
      state.graphicsStatus.textContent = 'Amiga source unavailable; DOS-EGA art shown.';
    } else {
      state.graphicsStatus.textContent = mode === 'Amiga'
        ? state.currentPictureId === graphics.pictureId ? 'Amiga art · BIGPIC1 #116' : 'Amiga selected; DOS art is used outside mapped scenes.'
        : 'DOS-EGA art';
    }
  }
  if (restyleScene && state.dosPictureValidated && !state.restyleBitmap && !state.restyleLoading && !state.restyleError) {
    ensureDemoRestyle(state);
  }
}

function ensureDemoRestyle(target: DemoState): void {
  const graphics = target.profile.runtimeArt;
  if (!graphics || !target.dosPictureValidated || !target.restyleCanvas) return;
  target.restyleLoading = true;
  const revision = target.graphicsRevision;
  const packRevision = localAssetPackRevision();
  const isCurrent = (): boolean => state === target && target.graphicsRevision === revision
    && localAssetPackRevision() === packRevision;
  void graphics.loadRestyle().then((bitmap) => {
    if (!isCurrent()) { bitmap.close(); return; }
    target.restyleCanvas!.width = bitmap.width;
    target.restyleCanvas!.height = bitmap.height;
    const context = target.restyleCanvas!.getContext('2d');
    if (!context) { bitmap.close(); throw new Error('Restyle canvas context unavailable'); }
    context.clearRect(0, 0, bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);
    target.restyleBitmap = bitmap;
    target.bitmapPackRevision = packRevision;
  }).catch((error: unknown) => {
    if (!isCurrent()) return;
    target.restyleError = error instanceof Error ? error.message : String(error);
  }).finally(() => {
    if (!isCurrent()) return;
    target.restyleLoading = false;
    renderDemoScreen();
  });
}

function renderViewport(pose: DemoPose): void {
  if (!state?.dungeonScene) return;
  const { map, walls } = state.dungeonScene;
  if (pose.x < 0 || pose.y < 0 || pose.x >= map.width || pose.y >= map.height) {
    state.walkError = `demo pose (${pose.x},${pose.y}) outside ${map.width}x${map.height}`;
    return;
  }
  const cell = map.cells[pose.y * map.width + pose.x]!;
  const viewport = renderFirstPersonViewWithSky(
    map,
    { px: pose.x, py: pose.y, facing: (pose.facing & 3) * 2, eclBlockId: state.profile.demoBlockId },
    walls,
    {
      // Same conservative roof proxy as the live explorer: only an explicitly ceiling-less cell
      // gets the open-sky blue; unknown/roofed cells retain the native black ceiling.
      area: { indoorSkyColour: 0, outdoorSkyColour: 3 },
      roofByte: cell.ceiling === 0 ? 0x00 : 0x80,
      floorIndex: 8,
      hour: pose.hour,
      backdrop: walkBackdrop(pose),
    },
  );
  state.currentPictureId = null;
  state.currentViewport = viewport;
  state.viewports++;
  state.lastPose = { ...pose };
  renderDemoScreen();
}

function applyBeat(beat: Beat): void {
  if (!state) return;
  if (beat.kind === 'text') {
    if (beat.clear) state.text = beat.text ?? '';
    else if (beat.text) state.text += (state.text ? (beat.newline ? '\n' : ' ') : '') + beat.text;
    state.textEl.textContent = state.text;
    renderDemoScreen();
  } else if (beat.kind === 'picture' && beat.pictureId !== undefined) {
    const picture = state.pictures.get(beat.pictureId);
    if (picture) {
      state.currentPictureId = beat.pictureId;
      state.currentPictureFrame = 0;
      state.currentViewport = null;
      state.picturesShown++;
      renderDemoScreen();
    } else {
      state.missingPictures++;
    }
  } else if (beat.kind === 'animate') {
    const picture = state.currentPictureId === null ? null : state.pictures.get(state.currentPictureId);
    if (picture && picture.frames.length > 1) {
      state.currentPictureFrame = (state.currentPictureFrame + 1) % picture.frames.length;
      state.animationFrames++;
      renderDemoScreen();
    }
  } else if (beat.kind === 'scene') {
    loadScene(beat);
  } else if (beat.kind === 'viewport' && beat.pose) {
    renderViewport(beat.pose);
  }
}

function driveCombat(): void {
  if (!state) return;
  const combat = combatSeam();
  if (!combat) return;
  // Demo playback has no player at the keyboard. Follow the same native post-victory sequence
  // as the interactive host: decline Continue Battle, acknowledge the victory page, then collect
  // and leave treasure before returning to the attract script.
  const phase = combat.phase?.();
  if (phase === 'continue-battle') { combat.declineContinueBattle?.(); return; }
  if (phase === 'victory') { combat.acknowledgeVictory?.(); return; }
  if (phase === 'treasure') {
    combat.takeAllTreasure?.();
    combat.exitTreasure?.();
    return;
  }
  if (!combat.isOver?.()) {
    if (combat.autoStep) {
      if (combat.autoStep()) state.combatSteps++;
    } else {
      combat.auto?.();
    }
    return;
  }
  combat.dismiss?.();
}

async function enterCombat(): Promise<void> {
  const current = state;
  if (!current) return;
  const scene = current.profile.combatScene;
  const combatantFrom = (rec: MonsterRecord, id: string, side: 'party' | 'enemy', morale?: number): Combatant => {
    const combatant = monsterCombatant(morale === undefined ? rec : { ...rec, morale }, id, side);
    const nativeHp = current.profile.demoHitPoints?.[rec.name.toUpperCase()];
    const nativeAc = current.profile.demoArmorClasses?.[rec.name.toUpperCase()];
    if (nativeHp !== undefined || combatant.hp <= 0) {
      const recovered = nativeHp ?? (rec.hitDice > 0 ? rec.hitDice * 6 : (side === 'party' ? 40 : 8));
      combatant.hp = recovered;
      combatant.maxHp = recovered;
    }
    if (nativeAc !== undefined) combatant.ac = nativeAc;
    return combatant;
  };
  const { party, enemies, pictures } = demoCombatRoster(
    current.npcJoins, current.combatMonsters ?? [], current.monsterLookup, combatantFrom, scene,
  );
  current.partyNames = party.map((c) => c.name);
  current.enemyNames = enemies.map((c) => c.name);
  current.partyHp = party.map((c) => c.hp);
  current.enemyHp = enemies.map((c) => c.hp);
  if (party.length === 0 || enemies.length === 0) {
    stopGen1Demo();
    return;
  }
  current.phase = 'combat';
  const gameId = current.profile.runtimeArt?.gameId;
  const isCok = gameId === 'cok';
  const mode = current.runtimeGraphicsMode ?? 'DOS-EGA';
  const fallback = isCok && mode === 'Restyle' ? readRuntimeGraphicsFallback(gameId) : 'DOS-EGA';
  const paths = current.profile.combatPaths;
  const readAsset = isCok ? demoCombatAssetReader(current.hooks.assetSource) : undefined;
  const assetPaths = demoCombatAssetPaths(isCok && paths ? {
    ...paths, amigaDungcomPath: gameData(gameId).amigaDungcomPath,
  } : paths, gameId, mode, fallback, readAsset);
  const combatAssets = assetPaths ? await loadCombatAssets(assetPaths).catch(() => undefined) : undefined;
  if (state !== current) return;
  const flipIcon = (image: IndexedImage): IndexedImage => {
    const indices = new Uint8Array(image.indices.length);
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        indices[y * image.width + x] = image.indices[y * image.width + (image.width - 1 - x)]!;
      }
    }
    return { ...image, indices, encoding: `${image.encoding ?? 'cpic'}-flip-x` };
  };
  if (combatAssets) {
    for (const [id, picture] of pictures) {
      const image = combatAssets.iconLibrary.get(picture.blockId);
      if (image) combatAssets.combatantIcons.set(id, picture.flip ? flipIcon(image) : image);
    }
  }
  // The capture supplies the exact initial 7×7 viewport. Seat it in a source-shaped 13×9 logical
  // battlefield so combat can scroll/progress instead of resolving instantly inside a tiny box.
  const sceneTiles = scene ? new Array<number>(13 * 9).fill(scene.tileIndices[0] ?? 22) : null;
  if (scene && sceneTiles) {
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 7; col++) sceneTiles[row * 13 + col] = scene.tileIndices[row * 7 + col] ?? 22;
    }
  }
  await launchCombat({
    party,
    enemies,
    ...(combatAssets ? { assets: combatAssets } : {}),
    ...(isCok ? {
      assetPaths,
      combatantPictureIds: new Map(Array.from(pictures, ([id, picture]) => [id, picture.blockId])),
      demoGraphicsMode: () => state === current ? current.runtimeGraphicsMode ?? mode : null,
    } : {}),
    ...(scene && sceneTiles ? {
      // Native matching yields direct flattened DUNGCOM frame indices. Do not pass them through
      // BackGroundTiles again: that semantic table would turn late indices (e.g. Treasures #178)
      // into its fallback tile and recreate the former repeated-orange-stair battlefield.
      terrain: {
        width: 13, height: 9,
        blocked: () => false,
        blocksSight: () => false,
        cost: () => 1,
      },
      backgroundIds: sceneTiles,
      backgroundIdsAreTileIndices: true,
      partyAnchor: scene.partyAnchor,
      enemyAnchor: scene.enemyAnchor,
      partyPositions: scene.partyPositions,
      enemyPositions: scene.enemyPositions,
      mapDirection: 2,
    } : {}),
    intro: `${current.profile.displayName} — the enemy strikes!`,
    onEnd: (res) => {
      if (state !== current) return;
      current.combats++;
      current.lastOutcome = res.outcome;
      current.combatMonsters = null;
      const after = current.vm.resume(0, { combatOutcome: toEclCombatOutcome(res) });
      const walk = walkToPause(current.vm, after, current.presentation, current.profile);
      current.beats = walk.beats;
      current.npcJoins.push(...walk.npcJoins);
      current.combatMonsters = walk.combatMonsters;
      current.beatIdx = 0;
      current.phase = 'narration';
    },
  });
}

function tick(): void {
  if (!state) return;
  if (state.phase === 'combat') { driveCombat(); return; }
  if (state.beatIdx < state.beats.length) {
    const beat = state.beats[state.beatIdx++]!;
    applyBeat(beat);
    // PICTURE and its immediately following PRINT/CLEAR effects are one native presentation beat.
    // Do not leave the new art paired with the prior caption for an artificial 650 ms interval.
    if (beat.kind === 'picture') {
      while (state && state.beatIdx < state.beats.length) {
        const next = state.beats[state.beatIdx]!;
        if (next.kind !== 'text' || (!next.clear && !next.text)) break; // DELAY remains a real tick
        state.beatIdx++;
        applyBeat(next);
      }
    }
    return;
  }
  if (state.combatMonsters) { void enterCombat(); return; }
  stopGen1Demo();
}

/** Boot a title's real attract demo: run its own decoded ECL block through the live ECL VM. */
export async function startGen1Demo(profile: Gen1DemoProfile, hooks: Gen1DemoHooks = {}): Promise<number> {
  closeDungeon3d();
  stopGen1Demo();
  history.replaceState(null, '', hooks.route ?? '?demo=1');
  setStatus(`${profile.displayName} — demo. Press any key to continue.`);

  const out = document.querySelector('#output') as HTMLElement | null;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  if (out) out.innerHTML = '';

  let eclBytes: Uint8Array, monsterBytes: Uint8Array[], pictureBytes: Uint8Array[], amigaPictureBytes: Uint8Array | null;
  let uiBytes: Uint8Array | null, frameTilesBytes: Uint8Array | null, screenArtBytes: Uint8Array | null;
  let walkBackdropBytes: Uint8Array | null;
  let compositeBytes: Uint8Array[][];
  let dungeonArchives: DemoDungeonArchives | null = null;
  const readBytes = (path: string) => fetchBytes(path, hooks.assetSource);
  try {
    [eclBytes, monsterBytes, pictureBytes, amigaPictureBytes, dungeonArchives, uiBytes, frameTilesBytes, screenArtBytes, compositeBytes, walkBackdropBytes] = await Promise.all([
      readBytes(profile.eclPath),
      Promise.all(profile.monsterPaths.map(readBytes)),
      Promise.all(profile.picturePaths.map(readBytes)),
      profile.runtimeArt
        ? readBytes(profile.runtimeArt.amigaArchivePath).catch(() => null)
        : Promise.resolve(null),
      profile.dungeonPaths
        ? Promise.all([
            Promise.all(profile.dungeonPaths.geoPaths.map(readBytes)),
            Promise.all(profile.dungeonPaths.walldefPaths.map(readBytes)),
            Promise.all(profile.dungeonPaths.tilesPaths.map(readBytes)),
          ]).then(([geoArchives, walldefArchives, tileArchives]) => ({
            geo: new Map(geoArchives.flatMap((archive) => readDaxDataBlocks(archive).map((block) => [block.blockId, block.raw] as const))),
            walldef: new Map(walldefArchives.flatMap((archive) => readDaxDataBlocks(archive).map((block) => [block.blockId, block.raw] as const))),
            tiles: new Map(tileArchives.flatMap((archive) => readDaxDataBlocks(archive).map((block) => [block.blockId, block.raw] as const))),
          }))
        : Promise.resolve(null),
      (profile.uiPath ?? profile.dungeonPaths?.tilesPaths[0])
        ? readBytes((profile.uiPath ?? profile.dungeonPaths!.tilesPaths[0])!)
        : Promise.resolve(null),
      profile.frameTilesPath
        ? readBytes(profile.frameTilesPath)
        : (profile.uiPath ?? profile.dungeonPaths?.tilesPaths[0])
          ? readBytes((profile.uiPath ?? profile.dungeonPaths!.tilesPaths[0])!)
          : Promise.resolve(null),
      profile.screenArt ? readBytes(profile.screenArt.path) : Promise.resolve(null),
      Promise.all((profile.compositePictures ?? []).map((composite) =>
        Promise.all(composite.parts.map((part) => readBytes(part.path))),
      )),
      profile.walkBackdrop ? readBytes(profile.walkBackdrop.path) : Promise.resolve(null),
    ]);
  } catch (err) {
    setStatus(`Could not load the demo script: ${err instanceof Error ? err.message : String(err)}`);
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const block = readDaxDataBlocks(eclBytes).find((b) => b.blockId === profile.demoBlockId);
  if (!block) {
    setStatus(`Could not find the demo script (${profile.eclPath} block ${profile.demoBlockId}).`);
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  // Merge every configured picture archive's decoded frames — later archives don't overwrite ids
  // already resolved by an earlier one (archives are listed in priority order per profile).
  const pictures = new Map<number, DemoPicture>();
  const amigaPictures = new Map<number, DemoPicture>();
  let dosPictureValidated = false;
  let amigaPictureValidated = false;
  for (let i = 0; i < profile.picturePaths.length; i++) {
    const path = profile.picturePaths[i]!;
    const bytes = pictureBytes[i];
    if (!bytes) continue;
    const name = path.split('/').pop() ?? path;
    const archive = decodeDax(bytes, name);
    for (const block of archive.blocks) {
      if (!block.image || pictures.has(block.blockId)) continue;
      pictures.set(block.blockId, { frames: block.frames?.length ? block.frames : [block.image] });
    }
    if (profile.runtimeArt?.dosArchivePath === path) {
      const block = archive.blocks.find((entry) => entry.blockId === profile.runtimeArt!.pictureId);
      const image = block?.frames?.[0] ?? block?.image;
      if (block && image) dosPictureValidated = await validateCokDemoDosSource(bytes, block.raw, image);
    }
  }

  if (profile.runtimeArt && amigaPictureBytes) {
    try {
      const archive = decodeDaa(amigaPictureBytes, profile.runtimeArt.amigaArchivePath.split('/').pop() ?? 'BIGPIC1.DAA');
      const image = archive.frameSet.frames.get(profile.runtimeArt.pictureId);
      const raw = archive.blocks.find((entry) => entry.blockId === profile.runtimeArt!.pictureId)?.raw ?? null;
      if (image) {
        amigaPictureValidated = await validateCokDemoAmigaSource(amigaPictureBytes, raw, image);
        if (amigaPictureValidated) amigaPictures.set(profile.runtimeArt.pictureId, { frames: [image] });
      }
    } catch { /* a missing or unsupported Amiga archive keeps the DOS fallback available */ }
  }

  // CoK's shopkeeper is a native HEAD+BODY assembly, not a missing PIC block.
  (profile.compositePictures ?? []).forEach((composite, compositeIndex) => {
    const fb = createFramebuffer(composite.width, composite.height, 0);
    let complete = true;
    composite.parts.forEach((part, partIndex) => {
      const bytes = compositeBytes[compositeIndex]?.[partIndex];
      const image = bytes
        ? decodeDax(bytes, part.path.split('/').pop() ?? part.path).blocks.find((b) => b.blockId === part.blockId)?.image
        : null;
      if (!image) complete = false;
      else blitIndexed(fb, image, part.x, part.y);
    });
    if (complete) {
      pictures.set(composite.pictureId, {
        frames: [{
          ...fb,
          xOffset: 0,
          yOffset: 0,
          transparentIndex: null,
          palette: EGA_PALETTE,
          encoding: 'gen1-demo-composite',
        }],
      });
    }
  });

  const walkBackdropFrames = new Map<number, IndexedImage>();
  if (walkBackdropBytes && profile.walkBackdrop) {
    for (const decoded of decodeDax(walkBackdropBytes, profile.walkBackdrop.path.split('/').pop() ?? 'SKY.DAX').blocks) {
      if (decoded.image) walkBackdropFrames.set(decoded.blockId, decoded.image);
    }
  }
  let background: IndexedImage | null = null;
  const decorations: Array<{ image: IndexedImage; x: number; y: number }> = [];
  if (screenArtBytes && profile.screenArt) {
    const archive = decodeDax(screenArtBytes, profile.screenArt.path.split('/').pop() ?? 'screen-art.dax');
    const byId = new Map(archive.blocks.map((decoded) => [decoded.blockId, decoded]));
    background = byId.get(profile.screenArt.backdropBlockId)?.image ?? null;
    for (const placement of profile.screenArt.decorations) {
      const decoded = byId.get(placement.blockId);
      const image = decoded?.frames?.[placement.frameIndex] ?? (placement.frameIndex === 0 ? decoded?.image : null);
      if (image) decorations.push({
        image: placement.transparentIndex === undefined
          ? image
          : { ...image, transparentIndex: placement.transparentIndex },
        x: placement.x,
        y: placement.y,
      });
    }
  }
  let screenAssets: DemoScreenAssets = {
    frameTiles: null,
    font: null,
    walkBackdropFrames,
    background,
    decorations,
  };
  if (uiBytes || frameTilesBytes) {
    const frameBlockId = profile.frameTilesBlockId ?? 202;
    const frameRaw = frameTilesBytes
      ? readDaxDataBlocks(frameTilesBytes).find((b) => b.blockId === frameBlockId)?.raw
      : null;
    screenAssets = {
      frameTiles: frameRaw
        ? decode8x8dBlock(frameRaw, `${profile.displayName} demo UI#202`, {
            transparentMagenta: true,
            palette: profile.screenPalette,
          }).tiles
        : null,
      font: uiBytes ? loadCokFont(uiBytes) : null,
      walkBackdropFrames,
      background,
      decorations,
    };
  }

  const records: MonsterRecord[] = [];
  for (const bytes of monsterBytes) {
    if (!bytes) continue;
    try { records.push(...decodeMonsterArchive(bytes, profile.monsterProfileId)); } catch { /* skip an unreadable archive */ }
  }
  const monsterLookup = monsterLookupFromArchive(records);

  const vm = new EclVm(block.raw, { dialect: profile.dialect });
  const presentation: WalkPresentation = { fallbackPieces: profile.fallbackPieces, callIds: [] };
  const walk = walkToPause(vm, vm.run(), presentation, profile);

  const screen = el('div', 'gb-screen');
  const frame = el('div', 'gb-frame');
  const stage = el('div', 'gb-emu');
  const canvas = el('canvas', 'gb-emu-canvas pixelated') as HTMLCanvasElement;
  stage.appendChild(canvas);
  const restyleCanvas = profile.runtimeArt ? document.createElement('canvas') : null;
  if (restyleCanvas) {
    restyleCanvas.className = 'gb-demo-restyle-overlay';
    restyleCanvas.setAttribute('aria-hidden', 'true');
    restyleCanvas.hidden = true;
    stage.appendChild(restyleCanvas);
  }
  frame.appendChild(stage);
  let graphicsStatus: HTMLElement | null = null;
  if (profile.runtimeArt) {
    const controls = el('div', 'gb-demo-graphics');
    controls.dataset.demoGraphicsControl = 'true';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', `${profile.displayName} graphics`);
    controls.appendChild(el('span', 'gb-scaler-label', 'Graphics'));
    for (const [label, mode] of [
      ['DOS · EGA', 'DOS-EGA'], ['Amiga', 'Amiga'], ['New graphics', 'Restyle'],
    ] as const) {
      const button = el('button', 'gb-seg', label) as HTMLButtonElement;
      button.type = 'button';
      button.dataset.demoGraphicsMode = mode;
      button.addEventListener('click', () => writeRuntimeGraphicsMode(profile.runtimeArt!.gameId, mode));
      controls.appendChild(button);
    }
    graphicsStatus = el('span', 'gb-scaler-readout gb-demo-graphics-status');
    controls.appendChild(graphicsStatus);
    addLocalAssetPackPicker(controls, () => {});
    frame.appendChild(controls);
  }
  // Kept as an invisible accessibility mirror; visible narration is drawn by the bitmap font.
  const textEl = el('div', 'sr-only');
  frame.appendChild(textEl);
  const banner = el('div', 'gb-menu gb-demo-banner', 'DEMO — PRESS ANY KEY TO CONTINUE');
  frame.appendChild(banner);
  screen.appendChild(frame);
  out?.appendChild(screen);

  state = {
    timer: null, vm, beats: walk.beats, beatIdx: 0, phase: 'narration', text: '',
    npcJoins: walk.npcJoins, combatMonsters: walk.combatMonsters, monsterLookup, pictures, amigaPictures, screenAssets,
    runtimeGraphicsMode: profile.runtimeArt ? readRuntimeGraphicsMode(profile.runtimeArt.gameId) : null,
    dosPictureValidated, amigaPictureValidated,
    displayedArtSource: 'DOS-EGA',
    restyleCanvas, restyleBitmap: null, restyleLoading: false, restyleError: null, graphicsRevision: 0,
    bitmapPackRevision: null, localPackListener: null, graphicsStatus, graphicsListener: null,
    partyPanel: walk.npcJoins.map(({ npcId }, i) => {
      const rec = monsterLookup(npcId);
      return rec
        ? {
            name: rec.name,
            ac: profile.demoArmorClasses?.[rec.name.toUpperCase()] ?? rec.armorClass,
            hp: profile.demoHitPoints?.[rec.name.toUpperCase()] ?? rec.hitPoints,
            active: i === 0,
          }
        : { name: `NPC ${npcId}`, ac: 10, hp: 1, active: i === 0 };
    }),
    currentPictureId: null, currentPictureFrame: 0, currentViewport: null,
    dungeonArchives, dungeonScene: null, scenePalette: null, presentation: walk.presentation,
    canvas, textEl, banner, hooks, profile, combats: 0, lastOutcome: null, partyNames: [], enemyNames: [],
    partyHp: [], enemyHp: [],
    viewports: 0, picturesShown: 0, animationFrames: 0, missingPictures: 0, combatSteps: 0,
    lastPose: null, walkError: null,
  };

  if (profile.runtimeArt) {
    const target = state;
    const localPackListener = (): void => {
      if (state !== target) return;
      target.graphicsRevision++;
      target.restyleBitmap?.close();
      target.restyleBitmap = null;
      target.bitmapPackRevision = null;
      target.restyleLoading = false;
      target.restyleError = null;
      renderDemoScreen();
    };
    target.localPackListener = localPackListener;
    window.addEventListener('goldbox:local-asset-pack', localPackListener);
    const graphicsListener = (event: Event): void => {
      const detail = (event as CustomEvent<{ gameId?: string; mode?: string }>).detail;
      if (detail?.gameId !== profile.runtimeArt!.gameId
          || !['DOS-EGA', 'Amiga', 'Restyle'].includes(detail.mode ?? '')) return;
      if (state !== target) return;
      state.runtimeGraphicsMode = detail.mode as RuntimeGraphicsMode;
      state.graphicsRevision++;
      state.restyleLoading = false;
      state.restyleError = null;
      renderDemoScreen();
    };
    state.graphicsListener = graphicsListener;
    window.addEventListener('goldbox:graphics-mode', graphicsListener);
  }

  renderDemoScreen();

  gameAudio.setGame(profile.audioGame);

  window.addEventListener('keydown', onKey, true);
  document.addEventListener('click', onClick, true);
  state.timer = window.setInterval(tick, 650);

  (window as unknown as { __demo?: Record<string, unknown> }).__demo = {
    open: (h?: Gen1DemoHooks) => startGen1Demo(profile, h),
    isPlaying: () => isGen1DemoPlaying(),
    step: () => tick(),
    pause: () => {
      if (state?.timer !== null && state?.timer !== undefined) { clearInterval(state.timer); state.timer = null; }
    },
    stats: () => gen1DemoStats(),
    /** Read-only diagnostic copy; never expose mutable VM memory or clock references. */
    vmState: () => state ? {
      pc: state.vm.programCounter,
      vaddr: state.vm.vaddr,
      memory: [...state.vm.memory].sort(([a], [b]) => a - b),
      rngState: state.vm.rngState,
      clock: [...state.vm.gameClock],
      done: state.vm.done,
    } : null,
    /** Capture/debug seam: render an exact retail-script map pose without advancing the VM. */
    renderPose: (x: number, y: number, facing: number) => {
      renderViewport({ x: x | 0, y: y | 0, facing: facing & 3, hour: state?.lastPose?.hour ?? 10 });
      return gen1DemoStats();
    },
    exit: () => stopGen1Demo(),
  };
  (window as unknown as { __rendered: number }).__rendered = 1;
  return 1;
}
