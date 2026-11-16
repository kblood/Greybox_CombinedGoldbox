/**
 * NPC dialogue overlay (A5.3, `?dialogue=1`) — drives the engine {@link DialogueRunner} through an
 * ECL event and presents each turn the original Gold Box way: accumulated NPC narrative in a message
 * panel, the script's branch choices as a vertical menu the player picks. A picked choice is fed back
 * to the running VM (`choose(index)`), so different picks walk different paths — branching is the
 * script's own IF/ON_GOTO reading the value, not anything this UI decides.
 *
 * A queued fight (`combat` turn) hands off to the live tactical overlay (`launchCombat`); when the
 * battle is dismissed the conversation resumes (`afterCombat()`). A `chain` turn loads the next block
 * (here, the next scripted machine) into a fresh runner. `end` closes the overlay.
 *
 * The `DialogueRunner` is pure engine code; this controller owns presentation, the combat handoff,
 * and — for the standalone `?dialogue=1` demo — a hand-authored, *original* branching conversation
 * expressed as a scripted {@link EclMachine} (no copyrighted game script). The real dungeon path
 * (A5.3 integration in `explore.ts`) builds a runner straight off the live ECL VM instead.
 */
import {
  DialogueRunner,
  type DialogueTurn,
  type EclMachine,
  type EclCombatOutcome,
  type EclInputValue,
  type EclRunResult,
  type EncounterMonster,
  type Combatant,
  type CombatResult,
  type GridPos,
  type TerrainGrid,
  createFramebuffer,
  blitIndexed,
  composeExploreScreen,
  makeEgaPalette,
  DOS_EGA,
  createArtModeResolver,
  indexedToRGBA,
  type ArtIdentity,
  type ArtMode,
  type RgbaArt,
  type IndexedImage,
  type IndexedFramebuffer,
  type BitmapFont,
  type PlacedRgbaArt,
  type ExploreFrameLayout,
  type ExploreParty,
  type Palette,
  type TreasureHaul,
} from '@goldbox/engine';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';
import { el } from './render.js';
import { partyCombatants, partySize } from './party.js';
import { launchCombat, isCombatOpen, closeCombat, type CombatAssets, type CombatAssetPaths } from './combat.js';
import { recordJournal } from './journal.js';
import { artModeForRuntime, readRuntimeGraphicsFallback, readRuntimeGraphicsMode, writeRuntimeGraphicsMode } from './runtimeGraphicsMode.js';
import { addLocalAssetPackPicker, localAssetPackRevision } from './localAssetPack.js';

/** A pregenerated party so the demo conversation can pick a fight before character creation. */
function demoParty(): Combatant[] {
  return [
    { id: 'd1', name: 'Sturm', side: 'party', hp: 40, maxHp: 40, thac0: 16, ac: 2, damage: { count: 1, sides: 8, bonus: 2 }, xp: 0 },
    { id: 'd2', name: 'Caramon', side: 'party', hp: 44, maxHp: 44, thac0: 16, ac: 3, damage: { count: 1, sides: 8, bonus: 3 }, xp: 0 },
    { id: 'd3', name: 'Tasslehoff', side: 'party', hp: 22, maxHp: 22, thac0: 18, ac: 5, damage: { count: 1, sides: 4, bonus: 1 }, xp: 0 },
  ];
}

/** Turn an ECL combat roster into plain tactical-combat enemies (demo: draconian-flavoured foes). */
function spawnFromMonsters(monsters: readonly EncounterMonster[]): Combatant[] {
  const foes: Combatant[] = [];
  let n = 0;
  for (const m of monsters) {
    for (let i = 0; i < Math.max(1, m.count); i++) {
      foes.push({
        id: `m${n++}`,
        name: 'Draconian',
        side: 'enemy',
        hp: 8,
        maxHp: 8,
        thac0: 18,
        ac: 6,
        damage: { count: 1, sides: 6, bonus: 1 },
        xp: 35,
      });
    }
  }
  return foes.length ? foes : [{ id: 'm0', name: 'Draconian', side: 'enemy', hp: 8, maxHp: 8, thac0: 18, ac: 6, damage: { count: 1, sides: 6, bonus: 1 }, xp: 35 }];
}

// ---------------------------------------------------------------------------------------------------
// Demo conversation — a hand-authored, original branching ECL-style event expressed as a scripted
// EclMachine. A hermit on the road can be greeted (he warns of draconians and chains onward), bribed
// (he names a number), or attacked (queued fight, then he flees). Each run/resume returns the next
// pre-canned turn; the resume value is the player's menu pick, exactly as the real VM would read it.
// ---------------------------------------------------------------------------------------------------

const fx = {
  print: (text: string): EclRunResult['effects'][number] => ({ type: 'print', text, clear: false, newline: false }),
  menu: (items: string[], prompt?: string): EclRunResult['effects'][number] =>
    ({ type: 'menu', style: 'vertical', items, ...(prompt !== undefined ? { prompt } : {}), ins: {} as never }),
  input: (): EclRunResult['effects'][number] => ({ type: 'input', mode: 'number', destAddr: 0x1000, ins: {} as never }),
  combat: (): EclRunResult['effects'][number] => ({ type: 'combat', monsters: [{ monsterId: 9, count: 2, picBlockId: 0 }] }),
};

/**
 * The hermit conversation. State machine keyed by the player's picks; mirrors how an ECL block's own
 * branching would respond to menu results. Two "blocks": the encounter (`hermit`) and what a greet
 * chains into (`omen`). `dialogueDemo(block)` returns a fresh scripted machine for that block.
 */
function dialogueDemo(block: 'hermit' | 'omen'): EclMachine {
  let step = 0;
  let branch: 'greet' | 'bribe' | 'fight' | null = null;
  if (block === 'omen') {
    // The chained block: a short two-beat omen, then it ends.
    const beats: EclRunResult[] = [
      { status: 'awaiting-input', effects: [fx.print('The hermit traces a sign of the three moons. "Solinari waxes — press east while the white moon is high."'), fx.menu(['I will. Farewell.'])] },
      { status: 'exited', effects: [fx.print('He melts back into the trees, and the road lies open before you.')] },
    ];
    return { run: () => beats[step++]!, resume: () => beats[step++]! };
  }
  // The encounter block.
  return {
    run: () => ({
      status: 'awaiting-input',
      effects: [
        fx.print('A hooded hermit steps from the roadside brush, leaning on a gnarled staff.'),
        fx.print('"Few walk this road by choice, travellers. What is your business?"'),
        fx.menu(['Greet him warmly', 'Offer him steel for news', 'Draw steel — he looks suspicious'], 'How do you respond?'),
      ],
    }),
    resume: (v = 0): EclRunResult => {
      // First resume: the player chose at the top menu.
      if (branch === null) {
        branch = v === 0 ? 'greet' : v === 1 ? 'bribe' : 'fight';
        switch (branch) {
          case 'greet':
            return { status: 'chain', effects: [fx.print('"Warmly met, then. Heed an old man\'s omen before you go."')], chainBlockId: 1 };
          case 'bribe':
            return { status: 'awaiting-input', effects: [fx.print('His eyes glint. "How many steel pieces is news worth to you?"'), fx.input()] };
          case 'fight':
            return { status: 'combat', effects: [fx.print('The "hermit" throws back his hood — a draconian, and two more burst from the brush!'), fx.combat()] };
        }
      }
      // Second resume after bribe: v is the gold offered; after fight: afterCombat passes 0.
      if (branch === 'bribe') {
        if (typeof v === 'number' && v >= 10) return { status: 'exited', effects: [fx.print(`You press ${v} steel into his hand. "Draconians muster at the old keep east of here. Go armed." He vanishes.`)] };
        return { status: 'exited', effects: [fx.print('He sneers at your meagre offer and stalks off into the trees, saying nothing.')] };
      }
      // After the fight resumes here.
      return { status: 'exited', effects: [fx.print('The draconians dissolve into pools of acid. Whatever the hermit guarded, the way is clear.')] };
    },
  };
}

/** How a `combat` turn becomes a tactical battle (overridable so the dungeon can use real monsters). */
export interface DialogueCombat {
  party: Combatant[];
  enemies: Combatant[];
  assets?: CombatAssets;
  assetPaths?: CombatAssetPaths;
  combatantPictureIds?: ReadonlyMap<string, number>;
  names?: Map<string, string>;
  intro?: string;
  seed?: number;
  /** Recovered local battle terrain/background from the dungeon host, when this is a real encounter. */
  terrain?: TerrainGrid;
  backgroundIds?: readonly number[];
  partyAnchor?: GridPos;
  enemyAnchor?: GridPos;
  coabSourcePlacement?: boolean;
  /** Gateway `mapPos-floorOrigin` input for the shared Gen1 placement routine; ordinary wilderness = zero. */
  coabPartyStart?: GridPos;
  coabTileMutations?: boolean;
  /** Gold Box mapDirection code supplied by the dungeon host for recovered placement. */
  mapDirection?: number;
  /** Current in-game day, when the host has one, for moon/save-sensitive combat mechanics. */
  day?: number;
  /** Retail ECL TREASURE queue resolved from the active area's item archive. */
  scriptedTreasure?: TreasureHaul;
}
type CombatSpawner = (
  monsters: readonly EncounterMonster[],
  treasure?: Extract<DialogueTurn, { kind: 'combat' }>['treasure'],
) => DialogueCombat;

function toEclCombatOutcome(result: Pick<CombatResult, 'outcome'> & { fled?: boolean }): EclCombatOutcome {
  if (result.outcome === 'party') return 'victory';
  if (result.fled) return 'flee';
  return 'defeat';
}

/** The default (demo) spawner: a small band of draconian-flavoured foes vs. the demo or real party. */
function defaultSpawn(monsters: readonly EncounterMonster[]): DialogueCombat {
  const party = partySize() > 0 ? partyCombatants() : demoParty();
  const enemies = spawnFromMonsters(monsters);
  const names = new Map<string, string>();
  for (const c of [...party, ...enemies]) names.set(c.id, c.name);
  return { party, enemies, names, seed: 0x0d1a, intro: 'Ambush!' };
}

interface DlgState {
  runner: DialogueRunner;
  /** Re-create a runner for a chained block id (demo: maps block 1 → the omen machine). */
  chainTo: (blockId: number) => DialogueRunner | null;
  /**
   * A `chain` turn whose `chainTo` returned null (no in-place continuation available) is instead
   * handed here — the overlay is removed exactly like a normal close first, THEN this fires. Lets a
   * host do something other than simply end the conversation, e.g. re-mount a different area's
   * walkable GEO/wall data for a same-archive or cross-archive `NEWECL` reached mid-walk (the
   * "mid-walk chain re-mount" capability `explore.ts`'s `runStepEvent` uses for Secret's town-exit
   * archway and Pool's wilderness crossing — see `docs/engine/research/persistent-natural-routes.md`).
   */
  onChain: ((blockId: number, text: string) => void) | null;
  spawn: CombatSpawner;
  panel: HTMLElement;
  textEl: HTMLElement;
  choicesEl: HTMLElement;
  overlay: HTMLElement;
  onClose: (() => void) | null;
  onEnd: ((turn: Extract<DialogueTurn, { kind: 'end' }>) => void) | null;
  awaitingCombat: boolean;
  lastTurn: DialogueTurn | null;
  presentation: DialoguePresentation | null;
  presentationSurface: ScreenSurface | null;
  currentPicture: IndexedImage | null;
  currentPictureId: number | null;
  currentPictureSource: DialoguePictureSource | null;
  pictureRevision: number;
  localPackArtGeneration: number;
  presentationBlinkOn: boolean;
  presentationBlinkTimer: number | null;
  artMode: ArtMode;
  loadedRestyles: Map<string, RgbaArt>;
  loadedAmigaOriginals: Map<string, DialoguePictureVariant>;
  artStatus: HTMLElement | null;
  artLoading: Map<string, symbol>;
  amigaLoading: Map<string, symbol>;
  amigaErrors: Map<string, string>;
  artErrors: Map<string, string>;
  artModeListener: ((event: Event) => void) | null;
  localPackListener: (() => void) | null;
}

let state: DlgState | null = null;

const EGA_PALETTE: Palette = makeEgaPalette();

/** Identity of the exact decoded frame selected by the host, independent of the ECL numeric id. */
export interface DialoguePictureSource {
  game: string;
  system: string;
  archive: string;
  archiveSha256: string;
  blockId: number;
  frameIndex: number;
  /** Present only after an admitted host validates the actual decompressed source block. */
  blockSha256?: string;
}

export interface DialogueSceneArt {
  ref: ArtIdentity;
  pictureId: number;
  /** Required for newly admitted source-specific scenes. Legacy opening pilots remain separate. */
  source?: Readonly<DialoguePictureSource>;
  /** The exact base picture identity for a source-qualified alternate-system presentation. */
  baseSource?: Readonly<DialoguePictureSource>;
  comparisonId: string;
  label: string;
  pixelScale: number;
  x: number;
  y: number;
  amigaOriginal?: IndexedImage;
  /** Lazy, source-validated Amiga variant; invoked only when Amiga or Restyle is requested. */
  loadAmigaOriginal?: () => Promise<DialoguePictureVariant>;
  /** Set false when this scene's approved Restyle is tied to DOS art rather than Amiga art. */
  restyleRequiresAmigaOriginal?: boolean;
  /** Optional town-name selector shared with the direct travel panel. */
  townNamesToggle?: { label: string; read: () => boolean; write: (visible: boolean) => void };
  /** Amiga overlay origin in the composed 320x200 screen (legacy default is 8,8). */
  amigaOrigin?: { x: number; y: number };
  loadRestyle: () => Promise<RgbaArt>;
  /** Source-owned foreground, such as the travel cursor, must remain above replacement art. */
  foregroundLayers?: () => readonly PlacedRgbaArt[];
}

export interface DialoguePictureVariant {
  source: Readonly<DialoguePictureSource>;
  image: IndexedImage;
}

export function dialoguePictureSourceKey(source: Readonly<DialoguePictureSource>): string {
  return JSON.stringify([source.game, source.system, source.archive,
    source.archiveSha256.toLowerCase(), source.blockId, source.frameIndex, source.blockSha256?.toLowerCase() ?? null]);
}

/** Optional source-art presentation for retail ECL conversations. */
export interface DialoguePresentation {
  pictures: ReadonlyMap<number, IndexedImage>;
  pictureSources?: ReadonlyMap<number, Readonly<DialoguePictureSource>>;
  frameTiles?: IndexedImage[] | null;
  frameLayout?: ExploreFrameLayout;
  font?: BitmapFont | null;
  party?: ExploreParty[];
  palette?: Palette;
  /** Retail small portraits are placed inside the 88x88 game-view opening from this screen origin. */
  portraitOrigin?: { x: number; y: number };
  /** Host-owned picture restored after tactical combat when the resumed ECL turn has no PICTURE. */
  combatReturnPictureId?: number;
  /** Directly observed result-page share for this specific retail encounter; presentation-only. */
  combatVictoryPerCharacterXp?: number;
  /** Optional host-owned pixels painted after the retail frame/picture composition. */
  screenOverlay?: (framebuffer: IndexedFramebuffer, pictureId: number | null, visible: boolean) => void;
  /** Blink cadence for a host-owned overlay: symmetric milliseconds or exact visible/hidden spans. */
  screenOverlayBlinkMs?: number | readonly [visibleMs: number, hiddenMs: number];
  /** A reviewed, exact single-picture pilot; not a claim of whole-game art coverage. */
  sceneArt?: DialogueSceneArt;
  /** Exact-source mappings resolved against the identity carried with the current picture. */
  sceneArts?: readonly DialogueSceneArt[];
}

function selectedSceneArt(current: DlgState): DialogueSceneArt | undefined {
  const presentation = current.presentation;
  const candidates = [...(presentation?.sceneArts ?? []), ...(presentation?.sceneArt ? [presentation.sceneArt] : [])];
  const baseKey = current.currentPictureSource ? dialoguePictureSourceKey(current.currentPictureSource) : null;
  const matches = candidates.filter((scene) => scene.pictureId === current.currentPictureId
    && (!scene.source || (baseKey !== null && dialoguePictureSourceKey(scene.source) === baseKey)
      || (scene.baseSource !== undefined && baseKey !== null
        && dialoguePictureSourceKey(scene.baseSource) === baseKey)));
  // Duplicate bindings are ambiguous provenance. Keep the retail original and fail closed.
  return matches.length === 1 ? matches[0] : undefined;
}

function sceneArtKey(scene: DialogueSceneArt): string {
  return JSON.stringify([scene.baseSource ? dialoguePictureSourceKey(scene.baseSource) : null,
    scene.source ? dialoguePictureSourceKey(scene.source) : null,
    scene.ref.game, scene.ref.logicalId, scene.ref.frame ?? null, scene.comparisonId]);
}

function requestSceneRestyle(current: DlgState, scene: DialogueSceneArt): void {
  const key = sceneArtKey(scene);
  if (current.loadedRestyles.has(key) || current.artLoading.has(key) || current.artErrors.has(key)) return;
  const revision = current.pictureRevision;
  const localPackRevision = localAssetPackRevision();
  const artGeneration = current.localPackArtGeneration;
  const token = Symbol(key);
  const stillSelected = (): boolean => state === current && current.pictureRevision === revision
    && current.localPackArtGeneration === artGeneration && localAssetPackRevision() === localPackRevision
    && selectedSceneArt(current) !== undefined && sceneArtKey(selectedSceneArt(current)!) === key;
  current.artLoading.set(key, token);
  void scene.loadRestyle().then((art) => {
    if (!stillSelected()) return;
    current.loadedRestyles.set(key, art);
    if (current.lastTurn) renderPresentation(current.lastTurn);
  }).catch((error: unknown) => {
    if (!stillSelected() || current.artMode.kind !== 'restyle') return;
    current.artErrors.set(key, error instanceof Error ? error.message : String(error));
    if (current.lastTurn) renderPresentation(current.lastTurn);
  }).finally(() => {
    if (current.artLoading.get(key) !== token) return;
    current.artLoading.delete(key);
    const sceneNow = selectedSceneArt(current);
    if (state === current && current.artMode.kind === 'restyle' && sceneNow
        && sceneArtKey(sceneNow) === key && !current.loadedRestyles.has(key) && !current.artErrors.has(key)
        && current.lastTurn) renderPresentation(current.lastTurn);
  });
}

function requestSceneAmigaOriginal(current: DlgState, scene: DialogueSceneArt): void {
  if (!scene.loadAmigaOriginal) return;
  const key = sceneArtKey(scene);
  if (current.loadedAmigaOriginals.has(key) || current.amigaLoading.has(key) || current.amigaErrors.has(key)) return;
  const revision = current.pictureRevision;
  const token = Symbol(key);
  const baseKey = current.currentPictureSource ? dialoguePictureSourceKey(current.currentPictureSource) : null;
  const stillSelected = (): boolean => state === current && current.pictureRevision === revision
    && selectedSceneArt(current) !== undefined && sceneArtKey(selectedSceneArt(current)!) === key
    && (current.currentPictureSource ? dialoguePictureSourceKey(current.currentPictureSource) : null) === baseKey;
  current.amigaLoading.set(key, token);
  void scene.loadAmigaOriginal().then((variant) => {
    if (!stillSelected()) return;
    if (!scene.source || dialoguePictureSourceKey(variant.source) !== dialoguePictureSourceKey(scene.source)) {
      throw new Error('Amiga source identity does not match the reviewed scene variant');
    }
    current.loadedAmigaOriginals.set(key, { source: { ...variant.source }, image: variant.image });
    if (current.lastTurn) renderPresentation(current.lastTurn);
  }).catch((error: unknown) => {
    if (!stillSelected()) return;
    current.amigaErrors.set(key, error instanceof Error ? error.message : String(error));
    if (current.lastTurn) renderPresentation(current.lastTurn);
  }).finally(() => {
    if (current.amigaLoading.get(key) !== token) return;
    current.amigaLoading.delete(key);
    const sceneNow = selectedSceneArt(current);
    if (state === current && sceneNow && sceneArtKey(sceneNow) === key
        && !current.loadedAmigaOriginals.has(key) && !current.amigaErrors.has(key)
        && (current.artMode.kind === 'restyle' || current.artMode.system === 'Amiga')
        && current.lastTurn) renderPresentation(current.lastTurn);
  });
}

function selectPresentationPicture(pictureId: number | undefined): void {
  if (pictureId === undefined || !state?.presentation) return;
  const picture = state.presentation.pictures.get(pictureId);
  if (!picture) return;
  const source = state.presentation.pictureSources?.get(pictureId) ?? null;
  if (state.currentPictureId !== pictureId
      || (source ? dialoguePictureSourceKey(source) : null)
        !== (state.currentPictureSource ? dialoguePictureSourceKey(state.currentPictureSource) : null)) {
    state.pictureRevision++;
  }
  state.currentPicture = picture;
  state.currentPictureId = pictureId;
  state.currentPictureSource = source ? { ...source } : null;
}

function wrapDialogueText(text: string, width = 38): string {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, '').split('\n')) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      if (line && line.length + word.length + 1 > width) {
        lines.push(line);
        line = word;
      } else {
        line += `${line ? ' ' : ''}${word}`;
      }
    }
    if (line) lines.push(line);
  }
  return lines.slice(-6).join('\n');
}

function dialoguePalette(presentation: DialoguePresentation, picture: IndexedImage | null): Palette {
  const base = presentation.palette ?? EGA_PALETTE;
  const colors = [...base.colors];
  const merge = (palette?: Palette | null): void => {
    palette?.colors.forEach((color, index) => { if (color) colors[index] = color; });
  };
  merge(presentation.frameTiles?.[0]?.palette);
  merge(picture?.palette);
  return { colors, source: base.source };
}

/** Paint the same complete 320x200 retail HUD used by exploration and the Gen1 demo player. */
function renderPresentation(turn: DialogueTurn): void {
  if (!state?.presentation || !state.presentationSurface) return;
  const presentation = state.presentation;
  if (turn.pictureId !== undefined) {
    selectPresentationPicture(turn.pictureId);
  }
  let picture = state.currentPicture;
  const pilot = selectedSceneArt(state);
  const townNamesInput = state.panel.querySelector<HTMLInputElement>('.gb-dlg-town-names-toggle input');
  if (townNamesInput) {
    const namesScene = [...(state.presentation.sceneArts ?? []), ...(state.presentation.sceneArt ? [state.presentation.sceneArt] : [])]
      .find((scene) => !!scene.townNamesToggle)?.townNamesToggle;
    if (namesScene) {
      townNamesInput.checked = namesScene.read();
      townNamesInput.disabled = state.currentPictureId !== pilot?.pictureId;
    }
  }
  let rgbaLayer: { art: RgbaArt; x: number; y: number; pixelScale: number } | null = null;
  let artSource = '';
  if (pilot && picture) {
    const key = sceneArtKey(pilot);
    const baseSourceKey = state.currentPictureSource ? dialoguePictureSourceKey(state.currentPictureSource) : null;
    const baseSourceMatches = pilot.baseSource
      ? baseSourceKey !== null && dialoguePictureSourceKey(pilot.baseSource) === baseSourceKey
      : !pilot.source || (baseSourceKey !== null && dialoguePictureSourceKey(pilot.source) === baseSourceKey);
    const admittedAmiga = state.loadedAmigaOriginals.get(key);
    const amigaOriginal = admittedAmiga?.image ?? pilot.amigaOriginal;
    const showTownNames = pilot.townNamesToggle?.read() ?? true;
    const needsAmigaForRestyle = pilot.restyleRequiresAmigaOriginal !== false;
    const requestsAmigaOriginal = state.artMode.kind === 'original' && state.artMode.system === 'Amiga';
    if (pilot.loadAmigaOriginal && !amigaOriginal && showTownNames
        && (requestsAmigaOriginal || (state.artMode.kind === 'restyle' && needsAmigaForRestyle))) {
      requestSceneAmigaOriginal(state, pilot);
    }
    const sourceReadyForRestyle = !pilot.loadAmigaOriginal || !needsAmigaForRestyle || !!amigaOriginal;
    const loadedRestyle = state.loadedRestyles.get(key);
    if (state.artMode.kind === 'restyle' && sourceReadyForRestyle && !loadedRestyle) requestSceneRestyle(state, pilot);
    type PreviewArt = { kind: 'indexed'; image: IndexedImage } | { kind: 'rgba'; image: RgbaArt };
    const hideTownNames = !!pilot.townNamesToggle && !showTownNames
      && state.artMode.kind === 'original' && state.artMode.system === 'Amiga';
    const fallback = state.artMode.kind === 'restyle'
      ? readRuntimeGraphicsFallback(pilot.ref.game)
      : hideTownNames ? 'DOS-EGA' : state.artMode.system;
    const resolver = createArtModeResolver<PreviewArt>(
      [{ game: pilot.ref.game, originalPriority: [fallback, fallback === 'Amiga' ? 'DOS-EGA' : 'Amiga'] }],
      [
        ...(baseSourceMatches ? [{ ref: pilot.ref, system: 'DOS-EGA', locator: 'retail DOS base picture',
          asset: { kind: 'indexed' as const, image: picture } }] : []),
        ...(amigaOriginal && showTownNames ? [{ ref: pilot.ref, system: 'Amiga', locator: 'source-admitted Amiga picture',
          asset: { kind: 'indexed' as const, image: amigaOriginal } }] : []),
      ],
      [{ ref: pilot.ref, comparisonId: pilot.comparisonId, review: 'approved',
        ...(sourceReadyForRestyle && baseSourceMatches && loadedRestyle
          ? { asset: { kind: 'rgba' as const, image: loadedRestyle } } : {}) }],
    );
    const resolved = resolver.resolve(pilot.ref, state.artMode);
    if (resolved.status === 'found') {
      if (resolved.asset.kind === 'indexed' && resolved.effective.kind === 'original'
          && resolved.effective.system === 'Amiga') {
        // Palette indices 0..15 belong to DOS HUD text as well. Converting only the
        // Amiga picture to RGBA preserves its 32 colours without recolouring the HUD.
        const image = resolved.asset.image;
        rgbaLayer = { art: { width: image.width, height: image.height,
          pixels: indexedToRGBA(image, image.palette ?? EGA_PALETTE) },
          x: (pilot.amigaOrigin?.x ?? 8) + image.xOffset,
          y: (pilot.amigaOrigin?.y ?? 8) + image.yOffset, pixelScale: 1 };
      } else if (resolved.asset.kind === 'indexed') picture = resolved.asset.image;
      else rgbaLayer = { art: resolved.asset.image,
        x: pilot.x, y: pilot.y, pixelScale: pilot.pixelScale };
      artSource = resolved.effective.kind === 'restyle'
        ? 'Restyle (reviewed picture only)'
        : `${resolved.effective.system}${resolved.fallbackReason ? ' fallback' : ''}`;
      const error = state.artMode.kind === 'restyle' ? state.artErrors.get(sceneArtKey(pilot)) : null;
      if (error && resolved.effective.kind === 'original') {
        artSource = `Restyle unavailable (${error}); ${resolved.effective.system} original shown`;
      } else if (state.artMode.kind === 'restyle' && sourceReadyForRestyle && state.artLoading.has(key)
          && resolved.effective.kind === 'original') {
        artSource = `Restyle loading; ${resolved.effective.system} original shown`;
      }
      const amigaError = state.amigaErrors.get(key);
      if (pilot.townNamesToggle && !showTownNames && state.artMode.kind === 'original'
          && state.artMode.system === 'Amiga') {
        artSource = 'Town names hidden; DOS-EGA map shown';
      } else if (pilot.loadAmigaOriginal && !amigaOriginal && showTownNames && state.artMode.kind === 'original'
          && state.artMode.system === 'Amiga') {
        artSource = amigaError
          ? `Amiga source unavailable (${amigaError}); DOS-EGA original shown`
          : 'Amiga source loading; DOS-EGA original shown';
      } else if (pilot.loadAmigaOriginal && !amigaOriginal && showTownNames
          && state.artMode.kind === 'restyle' && needsAmigaForRestyle) {
        artSource = amigaError
          ? `Amiga source unavailable (${amigaError}); Restyle unavailable; DOS-EGA original shown`
          : 'Amiga source loading; Restyle pending; DOS-EGA original shown';
      }
    }
  } else if (presentation.sceneArt || presentation.sceneArts?.length) {
    artSource = state.artMode.kind === 'restyle'
      ? 'Restyle not mapped for this picture · original shown'
      : 'Original shown · no reviewed mapping for this picture source';
  }
  if (state.artStatus && artSource) state.artStatus.textContent = `Scene art: ${artSource}`;
  let viewport = null;
  let bigPicture: IndexedImage | null = null;
  if (picture) {
    if (picture.width >= 280) {
      bigPicture = picture;
    } else {
      viewport = createFramebuffer(168, 168, 0);
      const origin = presentation.portraitOrigin ?? { x: 24, y: 24 };
      blitIndexed(viewport, picture, origin.x - 8 + picture.xOffset, origin.y - 8 + picture.yOffset);
    }
  }
  const fb = composeExploreScreen({
    frameTiles: presentation.frameTiles,
    frameLayout: presentation.frameLayout,
    font: presentation.font,
    viewport,
    party: presentation.party,
    message: wrapDialogueText(turn.text || (turn.kind === 'say' ? turn.prompt ?? '' : '')),
  });
  if (bigPicture) blitIndexed(fb, bigPicture, 8 + bigPicture.xOffset, 8 + bigPicture.yOffset);
  presentation.screenOverlay?.(fb, state.currentPictureId, state.presentationBlinkOn);
  const palette = dialoguePalette(presentation, picture);
  if (rgbaLayer) {
    state.presentationSurface.paintRgbaLayers(fb, palette,
      [rgbaLayer, ...(pilot?.foregroundLayers?.() ?? [])]);
  } else {
    state.presentationSurface.paint(fb, palette);
  }
  const selectedMode = state.artMode.kind === 'restyle' ? 'restyle' : state.artMode.system;
  state.panel.querySelectorAll<HTMLButtonElement>('[data-art-mode]').forEach((button) => {
    const selected = button.dataset.artMode === selectedMode;
    if (button.dataset.artMode === 'restyle') button.textContent = pilot ? `New graphics · ${pilot.label}` : 'New graphics';
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}

function setStatus(msg: string): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (s) { s.textContent = msg; s.className = 'status'; }
}

/** Render the current turn into the panel: narrative text + choice buttons (or a number input). */
function present(turn: DialogueTurn): void {
  if (!state) return;
  state.lastTurn = turn;
  renderPresentation(turn);
  state.textEl.textContent = turn.text || '…';
  state.choicesEl.innerHTML = '';

  if (turn.kind === 'combat') {
    setStatus('⚔ The conversation turns to violence!');
    state.awaitingCombat = true;
    const current = state;
    const c = state.spawn(turn.monsters, turn.treasure);
    void launchCombat({
      party: c.party,
      enemies: c.enemies,
      assets: c.assets,
      assetPaths: c.assetPaths,
      combatantPictureIds: c.combatantPictureIds,
      seed: c.seed ?? 0x0d1a,
      terrain: c.terrain,
      backgroundIds: c.backgroundIds,
      partyAnchor: c.partyAnchor,
      enemyAnchor: c.enemyAnchor,
      coabSourcePlacement: c.coabSourcePlacement,
      coabPartyStart: c.coabPartyStart,
      coabTileMutations: c.coabTileMutations,
      mapDirection: c.mapDirection,
      day: c.day,
      victoryPerCharacterXp: state.presentation?.combatVictoryPerCharacterXp,
      scriptedTreasure: c.scriptedTreasure,
      ...(turn.setup ? { encounterSetup: turn.setup } : {}),
      ...(turn.surprise ? { encounterSurprise: turn.surprise } : {}),
      ...(c.names ? { names: c.names } : {}),
      intro: c.intro ?? 'Ambush!',
      onEnd: (res) => {
        if (state !== current) return;
        current.awaitingCombat = false;
        const turn = current.runner.afterCombat(toEclCombatOutcome(res));
        selectPresentationPicture(current.presentation?.combatReturnPictureId);
        present(turn);
      },
    });
    return;
  }

  if (turn.kind === 'chain') {
    setStatus('The tale continues…');
    const next = state.chainTo(turn.blockId);
    if (next) {
      state.runner = next;
      present(next.start());
      return;
    }
    if (state.onChain) {
      const { onChain } = state;
      const { blockId, text } = turn;
      finish();
      onChain(blockId, text);
      return;
    }
    finish();
    return;
  }

  if (turn.kind === 'end') {
    state.onEnd?.(turn);
    addEndButton();
    setStatus('The conversation ends.');
    return;
  }

  // 'say' — render the prompt + choices (menu) or a number entry (input).
  if (turn.prompt) {
    const p = el('div', 'gb-dlg-prompt', turn.prompt);
    state.choicesEl.appendChild(p);
  }
  if (turn.awaiting === 'input') {
    const wrap = el('div', 'gb-dlg-input');
    const stringInput = turn.input?.mode === 'string';
    const inp = el('input', stringInput ? 'gb-dlg-text-input' : 'gb-dlg-number') as HTMLInputElement;
    inp.type = stringInput ? 'text' : 'number';
    if (stringInput) {
      inp.autocomplete = 'off';
      inp.spellcheck = false;
      if (turn.input?.maxLength !== undefined) inp.maxLength = turn.input.maxLength;
    } else {
      inp.min = '0';
      inp.value = '0';
    }
    const submit = (): void => choose(stringInput ? inp.value : Math.max(0, Math.floor(Number(inp.value) || 0)));
    const go = el('button', 'gb-btn', stringInput ? 'Answer' : 'Offer') as HTMLButtonElement;
    go.type = 'button';
    go.addEventListener('click', submit);
    inp.addEventListener('keydown', (event) => {
      // The exploration host listens for single-letter menu shortcuts on window. Text entry owns
      // ordinary keystrokes while focused, otherwise answers such as HANDS lose their A/S letters.
      event.stopPropagation();
      if (event.key !== 'Enter') return;
      event.preventDefault();
      submit();
    });
    wrap.appendChild(inp);
    wrap.appendChild(go);
    state.choicesEl.appendChild(wrap);
    inp.focus();
    return;
  }
  // menu / who / none
  const choices = turn.choices.length ? turn.choices : ['Continue'];
  choices.forEach((label, i) => {
    const b = el('button', 'gb-btn gb-dlg-choice', `${i + 1}. ${label}`) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => choose(i));
    state!.choicesEl.appendChild(b);
  });
  (state.choicesEl.firstElementChild as HTMLElement | null)?.focus?.();
}

/** Feed the player's pick back to the runner and present the next turn. */
function choose(value: EclInputValue): void {
  if (!state || state.awaitingCombat) return;
  present(state.runner.choose(value));
}

function addEndButton(): void {
  if (!state) return;
  state.choicesEl.innerHTML = '';
  const b = el('button', 'gb-btn', 'Continue ▶') as HTMLButtonElement;
  b.type = 'button';
  b.addEventListener('click', () => finish());
  state.choicesEl.appendChild(b);
  b.focus();
}

/** Close the overlay and run the close callback (return to the dungeon / demo page). */
function finish(): void {
  if (!state) return;
  const cb = state.onClose;
  state.overlay.remove();
  const st = state;
  state = null;
  if (st.presentationBlinkTimer !== null) window.clearTimeout(st.presentationBlinkTimer);
  st.presentationSurface?.dispose();
  if (st.artModeListener) window.removeEventListener('goldbox:graphics-mode', st.artModeListener);
  if (st.localPackListener) window.removeEventListener('goldbox:local-asset-pack', st.localPackListener);
  (window as unknown as { __dialogue?: Record<string, unknown> }).__dialogue = undefined;
  cb?.();
  setStatus('You go on your way.');
  void st; // keep reference type happy
}

export function isDialogueOpen(): boolean {
  return state !== null;
}

export function closeDialogue(): void {
  if (state) finish();
}

/** Shared options for both openers. */
export interface DialogueOptions {
  /** A NEWECL `chain` turn loads the next block's runner via this lookup (returns null to just end). */
  chainTo?: (blockId: number) => DialogueRunner | null;
  /**
   * A `chain` turn `chainTo` didn't resolve (or `chainTo` wasn't supplied at all) is handed here
   * instead of simply ending the conversation — see {@link DlgState.onChain}. The overlay is already
   * removed (and `onClose` already fired) by the time this runs.
   */
  onChain?: (blockId: number, text: string) => void;
  /** Fires once the overlay is removed (return to the dungeon / demo page). */
  onClose?: () => void;
  /** Fires with the final `end` turn before the overlay's Continue button shows (e.g. to log a journal page). */
  onEnd?: (turn: Extract<DialogueTurn, { kind: 'end' }>) => void;
  /** How a `combat` turn becomes a battle (default: demo draconians). */
  spawn?: CombatSpawner;
  /** Overlay heading. */
  title?: string;
  /** Retail source pictures + native HUD assets for picture-aware ECL presentation. */
  presentation?: DialoguePresentation;
}

/** Build the overlay DOM + install `state`; `first` is the turn to present immediately. */
function mount(runner: DialogueRunner, first: DialogueTurn, opts: DialogueOptions, defaultTitle: string): void {
  const previousSeam = (window as unknown as { __dialogue?: Record<string, unknown> }).__dialogue;
  const restart = previousSeam?.restart;
  closeDialogue();
  const overlay = el('div', 'sheet-overlay');
  const panel = el('div', 'sheet-panel gb-dlg-panel');
  const title = el('div', 'gb-dlg-title', opts.title ?? defaultTitle);
  const textEl = el('div', 'gb-dlg-text');
  const choicesEl = el('div', 'gb-dlg-choices');
  panel.appendChild(title);
  let presentationSurface: ScreenSurface | null = null;
  if (opts.presentation) {
    panel.classList.add('gb-dlg-panel-native');
    const emu = el('div', 'gb-emu');
    presentationSurface = createScreenSurface(DOS_EGA);
    emu.appendChild(presentationSurface.canvas);
    panel.appendChild(emu);
  }
  let artStatus: HTMLElement | null = null;
  const firstScene = opts.presentation?.sceneArt ?? opts.presentation?.sceneArts?.[0];
  if (firstScene) {
    const allScenes = [...(opts.presentation?.sceneArts ?? []), ...(opts.presentation?.sceneArt ? [opts.presentation.sceneArt] : [])];
    const hasAmigaVariant = allScenes.some((scene) => !!scene.amigaOriginal || !!scene.loadAmigaOriginal);
    const pilot = firstScene;
    const bar = el('div', 'gb-dlg-art-controls');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Scene graphics');
    const addMode = (label: string, mode: ArtMode, id: string): void => {
      const button = el('button', 'gb-btn', label) as HTMLButtonElement;
      button.type = 'button';
      button.dataset.artMode = id;
      button.addEventListener('click', () => {
        const st = state;
        if (!st) return;
        st.artMode = mode;
        writeRuntimeGraphicsMode(pilot.ref.game, mode.kind === 'restyle' ? 'Restyle' : mode.system);
        const scene = selectedSceneArt(st);
        if (scene && (mode.kind === 'restyle' || mode.system === 'Amiga')) {
          st.artErrors.delete(sceneArtKey(scene));
          st.amigaErrors.delete(sceneArtKey(scene));
        }
        if (st.lastTurn) renderPresentation(st.lastTurn);
      });
      bar.appendChild(button);
    };
    addMode('DOS · EGA', { kind: 'original', system: 'DOS-EGA' }, 'DOS-EGA');
    if (hasAmigaVariant) addMode('Amiga · 32-color', { kind: 'original', system: 'Amiga' }, 'Amiga');
    addMode(`New graphics · ${pilot.label}`, { kind: 'restyle' }, 'restyle');
    const namesControl = allScenes.find((scene) => scene.townNamesToggle)?.townNamesToggle;
    if (namesControl) {
      const label = el('label', 'gb-btn gb-dlg-town-names-toggle');
      const input = el('input') as HTMLInputElement;
      input.type = 'checkbox';
      input.checked = namesControl.read();
      input.setAttribute('aria-label', namesControl.label);
      input.addEventListener('change', () => {
        namesControl.write(input.checked);
        if (state?.lastTurn) renderPresentation(state.lastTurn);
      });
      label.append(input, document.createTextNode(namesControl.label));
      bar.appendChild(label);
    }
    addLocalAssetPackPicker(bar, () => {});
    artStatus = el('div', 'muted gb-dlg-art-status', `Scene art: DOS-EGA · runtime switch applies to picture ${pilot.pictureId}`);
    panel.append(bar, artStatus);
  }
  panel.appendChild(textEl);
  panel.appendChild(choicesEl);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  state = {
    runner,
    chainTo: opts.chainTo ?? (() => null),
    onChain: opts.onChain ?? null,
    spawn: opts.spawn ?? defaultSpawn,
    panel,
    textEl,
    choicesEl,
    overlay,
    onClose: opts.onClose ?? null,
    onEnd: opts.onEnd ?? null,
    awaitingCombat: false,
    lastTurn: null,
    presentation: opts.presentation ?? null,
    presentationSurface,
    currentPicture: null,
    currentPictureId: null,
    currentPictureSource: null,
    pictureRevision: 0,
    localPackArtGeneration: 0,
    presentationBlinkOn: true,
    presentationBlinkTimer: null,
    artMode: firstScene
      ? artModeForRuntime(readRuntimeGraphicsMode(firstScene.ref.game))
      : { kind: 'original', system: 'DOS-EGA' },
    loadedRestyles: new Map(),
    loadedAmigaOriginals: new Map(),
    artStatus,
    artLoading: new Map(),
    amigaLoading: new Map(),
    amigaErrors: new Map(),
    artErrors: new Map(),
    artModeListener: null,
    localPackListener: null,
  };
  if (firstScene) {
    const current = state;
    current.artModeListener = (event: Event): void => {
      const detail = (event as CustomEvent<{ gameId?: string; mode?: string }>).detail;
      if (state !== current || detail?.gameId !== firstScene.ref.game
          || !['DOS-EGA', 'Amiga', 'Restyle'].includes(detail.mode ?? '')) return;
      current.artMode = artModeForRuntime(detail.mode as 'DOS-EGA' | 'Amiga' | 'Restyle');
      // An explicit Restyle selection retries this picture; ordinary repaints keep its error.
      const scene = selectedSceneArt(current);
      if ((detail.mode === 'Restyle' || detail.mode === 'Amiga') && scene) {
        current.artErrors.delete(sceneArtKey(scene));
        current.amigaErrors.delete(sceneArtKey(scene));
      }
      if (current.lastTurn) renderPresentation(current.lastTurn);
    };
    window.addEventListener('goldbox:graphics-mode', current.artModeListener);
    current.localPackListener = (): void => {
      if (state !== current) return;
      current.localPackArtGeneration++;
      current.loadedRestyles.clear();
      current.artLoading.clear();
      current.artErrors.clear();
      if (current.lastTurn) renderPresentation(current.lastTurn); // repaint only; never advance the ECL VM.
    };
    window.addEventListener('goldbox:local-asset-pack', current.localPackListener);
  }
  present(first);
  const blinkCadence = opts.presentation?.screenOverlayBlinkMs;
  if (opts.presentation?.screenOverlay && blinkCadence) {
    const visibleMs = typeof blinkCadence === 'number' ? blinkCadence : blinkCadence[0];
    const hiddenMs = typeof blinkCadence === 'number' ? blinkCadence : blinkCadence[1];
    const scheduleBlink = (): void => {
      if (!state) return;
      const delay = state.presentationBlinkOn ? visibleMs : hiddenMs;
      state.presentationBlinkTimer = window.setTimeout(() => {
        if (!state?.lastTurn) return;
        state.presentationBlinkOn = !state.presentationBlinkOn;
        renderPresentation(state.lastTurn);
        scheduleBlink();
      }, delay);
    };
    scheduleBlink();
  }
  // Shared browser-test seam: real dungeon conversations use this same mount path, not only the
  // standalone dialogue demo. Keeping it here lets tests drive retail ECL menu choices.
  (window as unknown as { __dialogue?: Record<string, unknown> }).__dialogue = {
    open: () => isDialogueOpen(),
    text: () => state?.textEl.textContent ?? '',
    kind: () => state?.lastTurn?.kind ?? null,
    choices: () => (state?.lastTurn?.kind === 'say' ? [...state.lastTurn.choices] : []),
    awaiting: () => (state?.lastTurn?.kind === 'say' ? state.lastTurn.awaiting : null),
    prompt: () => (state?.lastTurn?.kind === 'say' ? state.lastTurn.prompt ?? null : null),
    pictureId: () => state?.currentPictureId ?? null,
    pictureSource: () => state?.currentPictureSource ? { ...state.currentPictureSource } : null,
    basePictureSource: () => state?.currentPictureSource ? { ...state.currentPictureSource } : null,
    admittedVariantSource: () => {
      if (!state) return null;
      const scene = selectedSceneArt(state);
      const variant = scene ? state.loadedAmigaOriginals.get(sceneArtKey(scene)) : null;
      return variant ? { ...variant.source } : null;
    },
    effectiveGraphicsSource: () => state?.artStatus?.textContent ?? null,
    displayRect: () => state?.presentationSurface?.rect() ?? null,
    choose: (value: EclInputValue) => choose(value),
    combatOpen: () => isCombatOpen(),
    awaitingCombat: () => state?.awaitingCombat ?? false,
    ...(typeof restart === 'function' ? { restart } : {}),
    close: () => closeDialogue(),
  };
}

/**
 * Open the dialogue overlay on a runner. `chainTo(blockId)` lets a NEWECL turn load the next block's
 * runner (the dungeon path supplies a real lookup; the demo maps block 1 → the omen machine). `onClose`
 * fires when the overlay is removed; `onEnd` fires with the final turn (e.g. to record a journal page).
 */
export function openDialogue(runner: DialogueRunner, opts: DialogueOptions = {}): void {
  mount(runner, runner.start(), opts, '✦ A meeting on the road');
}

/**
 * Open the dialogue overlay on a runner whose first turn has already been taken (the dungeon path
 * peeks the first turn to decide whether the event is an interactive ask). Presents `first` directly
 * instead of calling `runner.start()` again.
 */
export function openDialogueAt(runner: DialogueRunner, first: DialogueTurn, opts: DialogueOptions = {}): void {
  mount(runner, first, opts, '✦ Someone speaks to you');
}

/** Boot the standalone dialogue demo (`?dialogue=1`). Returns 1 (the render marker). */
export async function startDialogue(): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement | null;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  closeCombat();
  closeDialogue();
  if (out) out.innerHTML = '';
  setStatus('A figure waits on the road ahead…');

  const screen = el('div', 'gb-screen');
  const frame = el('div', 'gb-frame');
  const note = el('div', 'gb-dlg-stage',
    'You walk the eastern road out of Solace. A hooded figure steps from the brush — talk your way past, ' +
    'buy his news, or reach for steel. (NPC dialogue runs through the live ECL VM via the engine DialogueRunner.)');
  frame.appendChild(note);
  const reopen = el('button', 'gb-btn', '↺ Meet the hermit again') as HTMLButtonElement;
  reopen.type = 'button';
  reopen.addEventListener('click', () => beginDemo());
  frame.appendChild(reopen);
  const menu = el('div', 'gb-menu');
  menu.innerHTML =
    '<b>Click a choice</b> to answer the hermit. Greeting him chains to an omen; bribing asks for a ' +
    'number; drawing steel starts a live battle, after which the talk resumes. Original demo content.';
  frame.appendChild(menu);
  screen.appendChild(frame);
  if (out) out.appendChild(screen);

  function beginDemo(): void {
    const runner = new DialogueRunner(dialogueDemo('hermit'));
    openDialogue(runner, {
      chainTo: (blockId) => (blockId === 1 ? new DialogueRunner(dialogueDemo('omen')) : null),
      // When the hermit actually reveals the muster (a paid bribe), the party records a journal page —
      // the A5.4 "ECL event records a journal entry" path. Idempotent by id, so re-meeting won't dupe.
      onEnd: (turn) => {
        if (/muster|keep east/i.test(turn.text)) {
          recordJournal({ id: 9, title: 'The Keep Revealed', category: 'quest',
            body: 'A hooded hermit, paid in steel, named the old border keep east of Solace as a ' +
                  'mustering ground for the draconian raiders. Go there armed.' });
          setStatus('You record the hermit\'s news in your journal.');
        }
      },
      onClose: () => setStatus('The road east lies open.'),
    });
  }

  beginDemo();

  // Headless e2e seam.
  (window as unknown as { __dialogue?: Record<string, unknown> }).__dialogue = {
    open: () => isDialogueOpen(),
    text: () => state?.textEl.textContent ?? '',
    kind: () => state?.lastTurn?.kind ?? null,
    choices: () => (state?.lastTurn?.kind === 'say' ? [...state.lastTurn.choices] : []),
    awaiting: () => (state?.lastTurn?.kind === 'say' ? state.lastTurn.awaiting : null),
    prompt: () => (state?.lastTurn?.kind === 'say' ? state.lastTurn.prompt ?? null : null),
    choose: (value: EclInputValue) => choose(value),
    combatOpen: () => isCombatOpen(),
    awaitingCombat: () => state?.awaitingCombat ?? false,
    restart: () => beginDemo(),
    close: () => closeDialogue(),
  };
  (window as unknown as { __rendered: number }).__rendered = 1;
  return 1;
}
