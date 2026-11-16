/**
 * DQK explore mode (Phase C, C1) — boot a REAL Dark Queen of Krynn dungeon from the
 * Gen2 HLIB DataLib container and walk it.
 *
 * DQK is the *newest* Gold Box engine and a different container generation from CoK/DoK:
 * its dungeon grids live in `GEO.GLB`, a flat HLIB "DATA" library (magic=1: member[0] is a
 * 20-entry id table, members[1..20] are the maps). Each map is variable-sized (10×10 … 39×20)
 * with an 8-byte header then four W×H planes — the same nibble wall semantics as Gen1, decoded
 * by the engine's `decodeGen2GeoArchive`. See `packages/engine/src/loaders/geo.ts`.
 *
 * This C1 view proves the Gen2 GEO decode end-to-end in the browser: the 20 maps load, a picker
 * switches between them, and the party walks the real grid with correct collision on the top-down
 * automap. C2 added the Gen2 ECL VM run on area entry, and C3 adds DQK's real **VGA 256-colour
 * art**: BIGPIC overland pictures decoded from the HLIB TILE container and painted through a
 * composited DAC (the UI + picture leaf palettes layered into one 256-colour table).
 *
 * A `window.__dqk` seam lets headless e2e drive the loader, the map picker, movement and the art.
 */
import { closeDungeon3d } from './dungeon3dHost.js';
import {
  decodeHlib,
  decodeGen2GeoArchive,
  decodeEclGlb,
  runEclChain,
  EclVm,
  DialogueRunner,
  dialogueForCell,
  dialogueForVmRun1,
  dqkVmRun1Seed,
  DqkArea5OverlandSession,
  type DqkArea5TravelDirection,
  compositeHlibPalette,
  mergePalettes,
  definedColorCount,
  indexedToRGBA,
  ECL_GEN2,
  decodeMonchaGlb,
  decodeXmi,
  decodeInstrAd,
  decodeVoc,
  decodeSoundsGlb,
  parseAdLibPatch,
  renderOplNote,
  renderXmiSong,
  pcmRms,
  dominantHz,
  decode8x8dBlock,
  readDaxDataBlocks,
  loadCokFont,
  Explorer,
  Automap,
  composeAutomapPanel,
  makeEgaPalette,
  DOS_EGA,
  formatGameTime,
  formatTimeOfDay,
  type EclGlbArchive,
  type EclEffect,
  type EncounterMonster,
  type EncounterSetup,
  type EncounterSurprise,
  type MonchaArchive,
  type CombatResult,
  type EclCombatOutcome,
  type XmiFile,
  type AdLibBank,
  type MonsterRecord,
  type Combatant,
  type Gen2GeoMap,
  type GameMap,
  type Direction,
  type Pose,
  type StepResult,
  type BlockReason,
  type Palette,
  type IndexedImage,
  type BitmapFont,
  SoundDispatcher,
  type SoundSink,
  buildDqkDungeonCombatMap,
  type DqkDungeonCombatMap,
  buildDqkWildernessCombatMap,
  type DqkWildernessCombatMap,
  Rng,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { basenameOf, type AssetSource } from './assetSource.js';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';
import { launchCombat, isCombatOpen, closeCombat } from './combat.js';
import { partyCombatants, partySize, getParty, classLabel } from './party.js';
import { installDqkParty } from './dqkParty.js';
import { openCharSheet, closeCharSheet, isSheetOpen } from './charSheet.js';
import { openMemorize, closeMagic, isMagicOpen } from './magic.js';
import { openInventory, closeInventory, isInventoryOpen } from './inventory.js';
import { startTown, closeTown } from './town.js';
import { openCompanionPanel, closeCompanionPanel, isCompanionOpen, type CompanionTab } from './companionPanel.js';
import { saveToSlot, loadSlot, QUICK_SLOT } from './saveStore.js';
import { gameAudio, installGameAudioSeam } from '../audio/gameAudio.js';

const EGA_PALETTE: Palette = makeEgaPalette();

// The DQK GEO + ECL libraries — spelled as LITERALS so scripts/bundle-assets.mjs ships them in the
// static build (the bundler copies every single-quoted game-folder path it finds in src/ui).
const DQK_GEO_GLB = 'The Dark Queen of Krynn/DISK3/GEO.GLB';
const DQK_ECL_GLB = 'The Dark Queen of Krynn/DISK3/ECL.GLB';
// The Dark Queen of Krynn's boot title art (HLIB TILE container, not DAX — see intro.ts's
// offset-aware HLIB title composition). Exported so main.ts's intro wiring can pass it
// to `startIntro`. Literal path so the bundler ships it.
export const DQK_TITLE_PATH = 'The Dark Queen of Krynn/DISK1/TITLE.TLB';
// C3 — DQK's real VGA 256-colour art. BIGPIC = the overland map pictures (304×120, method 18,
// indices 32–255); ALWAYS = the UI chrome palette (indices 0–15). Compositing the two leaf
// palettes reconstructs the full DAC the engine shows them under. Literal paths so the bundler ships them.
const DQK_BIGPIC_TLB = 'The Dark Queen of Krynn/DISK2/BIGPIC.TLB';
const DQK_ALWAYS_TLB = 'The Dark Queen of Krynn/DISK1/ALWAYS.TLB';
// C4.2 — DQK's bestiary. MONCHA = MONsters + CHaracters: an HLIB DATA library of RLE-compressed
// creature records (the engine `decodeMonchaGlb` reverses the DQK record layout + its RLE variant).
// Literal path so the bundler ships it.
const DQK_MONCHA_GLB = 'The Dark Queen of Krynn/DISK2/MONCHA.GLB';
// C5a — DQK's AdLib/OPL2 music + instrument bank. ADDQ1..3 = the three songs as Miles XMIDI
// (FORM XDIR + CAT XMID); INSTR.AD = the Miles AdLib (patch,bank)→OPL2-register timbre bank the
// driver loads them through. The engine decodeXmi/decodeInstrAd parse the containers (synthesis is
// C5b). Literal paths so the bundler ships them.
const DQK_XMI_SONGS = [
  'The Dark Queen of Krynn/DISK1/ADDQ1.XMI',
  'The Dark Queen of Krynn/DISK1/ADDQ2.XMI',
  'The Dark Queen of Krynn/DISK1/ADDQ3.XMI',
];
const DQK_INSTR_AD = 'The Dark Queen of Krynn/DISK1/INSTR.AD';
// C5b-1 — DQK's digitized sound effects: SFXDQ.VOC = 13 effects (Creative Voice File, codec-1
// Creative 4-bit ADPCM), one per marker 0..12 (cast…crackle). Literal path so the bundler ships it.
const DQK_SFX_VOC = 'The Dark Queen of Krynn/DISK1/SFXDQ.VOC';
// C5b-2b-2b — DQK's in-engine SFX bank: SOUNDS.GLB = an HLIB DIG4 library, 13 raw 8-bit-unsigned-PCM
// effects in the same order as the VOC, each with a 4-byte `[u16 BE rate][u16 0]` header.
const DQK_SFX_SOUNDS = 'The Dark Queen of Krynn/DISK1/SOUNDS.GLB';
// C4.3 — shared Phase-A overlays (character sheet / memorize / inventory) draw their EGA frame
// chrome + 8×8 font from CoK's 8X8D1.DAX (block 202 = panel frame). The overlays are container-
// agnostic — they read the party + ruleset, not DQK art — so reusing the CoK chrome here is correct
// until the DQK VGA panel art is wired through them. Literal path so the bundler ships it.
const COK_TILES_DAX = 'Champions of Krynn/8X8D1.DAX';
const COK_FRAME_BLOCK = 202;

/** Gold Box mapDirection code for a cardinal dungeon facing. */
const FACING_NUM: Record<Direction, number> = { north: 0, east: 2, south: 4, west: 6 };

/** Step-sound dispatcher — initialised on mount, null before first dqkExplore() call. */
let stepDispatcher: SoundDispatcher | null = null;

/** CoK EGA UI chrome (frame tiles + 8×8 font) the shared Phase-A overlays render through. */
interface UiChrome {
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
}

/** Summary of running one area's Gen2 ECL script through the engine VM. */
interface EclRun {
  /** Logical area id the script was keyed by. */
  areaId: number;
  /** True if the area had an ECL script in ECL.GLB. */
  found: boolean;
  /** Number of structured effects the VM emitted. */
  effectCount: number;
  /** GEO map block the init's LOAD_FILES requested (−1 if none). */
  loadFilesGeo: number;
  /** First readable text the script printed (area name / event line), if any. */
  firstText: string;
  /** Terminal VM status (exited/halted/awaiting-input/combat). */
  status: string;
}

/** C3 — the decoded DQK VGA art set: real 256-colour overland pictures + composited DAC. */
interface DqkArt {
  /** Decoded overland frames (BIGPIC pictures), full-colour through `palette`. */
  frames: IndexedImage[];
  /** Composited 256-colour DAC (UI 0–15 + picture 32–255). */
  palette: Palette;
  /** Currently shown frame. */
  index: number;
  canvas: HTMLCanvasElement;
}

/** C5a — the decoded DQK AdLib music set: the parsed XMI songs + the OPL2 timbre bank. */
interface DqkAudioSummary {
  /** File name (e.g. `ADDQ1.XMI`). */
  name: string;
  /** Songs the file holds (ADDQ2 is a 6-song catalogue; ADDQ1/3 are single songs). */
  songCount: number;
  /** Timbres the first song requests. */
  timbres: number;
  /** Total decoded events in the first song. */
  events: number;
  /** Note-on count in the first song. */
  notes: number;
  /** Tempo of the first song in BPM (from the tempo meta; 120 default). */
  tempoBpm: number;
}

interface DqkAudio {
  songs: DqkAudioSummary[];
  /** Instruments decoded from INSTR.AD (the OPL2 timbre bank). */
  bankInstruments: number;
  /** C5b-1 — names of the digitized SFX decoded from SFXDQ.VOC (cast…crackle). */
  sfxNames: string[];
  /** Raw decoded file handles (for the seam / later synthesis). */
  xmi: XmiFile[];
  bank: AdLibBank | null;
}

interface DqkState {
  maps: Gen2GeoMap[];
  mapIndex: number;
  map: GameMap;
  explorer: Explorer;
  /**
   * M10.S5 — the D1 {@link Automap} model, fed by real walking (`visit` on every cell-enter),
   * replacing the old bespoke canvas-2D minimap (mirrors M10.S1's `explore.ts` treatment).
   * Persisted PER AREA (`greybox.automap.dqk.<areaId>`) since DQK's 20 maps are independently
   * sized — a single flat key like CoK's would discard progress on every map switch.
   */
  automap: Automap;
  /** The automap surface (Greybox navigation aid below the map picker), painted via `composeAutomapPanel`. */
  automapSurface: ScreenSurface;
  /** The decoded ECL.GLB script library (null if it failed to load — maps still walk). */
  ecl: EclGlbArchive | null;
  /** The last area's ECL run summary (drives the event line under the map). */
  lastEcl: EclRun | null;
  /** C3 — the DQK VGA art preview (null if BIGPIC/ALWAYS were absent). */
  art: DqkArt | null;
  /** C4.1 — per-area ECL script state carried across steps (SearchLocation flags). Reset per area. */
  areaMemory: Map<number, number>;
  /**
   * Pending encounter groups queued by DQK `LOAD_MONSTER` across per-cell ECL invocations.
   * Area 23 byte-proves a roster-loading SearchLocation path that exits before a later COMBAT path.
   */
  encounterRoster: EncounterMonster[];
  /** C4.1 — the most recent per-cell event text fired by SearchLocation (drives the event line). */
  lastEvent: string;
  /**
   * M72.S1 — why the most recent move attempt failed ({@link StepResult.blocked}), cleared on a
   * successful move. Mirrors `ExploreState.lastBlocked` (CoK/DoK's `explore.ts`).
   */
  lastBlocked?: BlockReason;
  /**
   * M85.S1 — accumulated in-game minutes since the session's epoch, fed by
   * {@link Explorer.forward}/{@link Explorer.backward}'s real {@link StepResult.timeMinutes}
   * (ovr015/ovr021 — engine-generation-independent per `decompile-ovr015-movement.md`/
   * `decompile-ovr021-time-learning.md`, i.e. real for DQK too). Mirrors `ExploreState.clockMinutes`
   * (CoK/DoK's `explore.ts`), which already accumulates this same field.
   */
  clockMinutes: number;
  /** C4.2 — the decoded DQK bestiary (null if MONCHA.GLB absent). Faithful monsters for combat. */
  moncha: MonchaArchive | null;
  /** C4.2 — outcome line of the last DQK fight resolved through the shared combat overlay. */
  lastCombat: string;
  /** C4.3 — CoK EGA chrome (frame tiles + font) the shared Phase-A overlays render through. */
  chrome: UiChrome;
  /** C5a — the decoded DQK AdLib music + OPL2 timbre bank (null if the audio files are absent). */
  audio: DqkAudio | null;
  /** Dedicated Area-5 ECL overland host; deliberately not a GEO map. */
  area5Overland: DqkArea5OverlandSession | null;
  /** Diagnostic summary of the latest Area-5 CampInterrupted attempt. */
  area5Bridge: { roster: number; launched: boolean } | null;
}

let state: DqkState | null = null;
let dqkMountSeq = 0;
let dqkKeyHandler: ((e: KeyboardEvent) => void) | null = null;
// M7.S2 — when the mount came from a Library entry backed by a user-picked folder, its own
// files are read through this instead of the bundled repo copy (see `readAssetBytes` below).
let activeAssetSource: AssetSource | null = null;
const DQK_AREA5_SAVE_KEY = 'Dark Queen of Krynn ECL#5 CampInterrupted';

/**
 * `?dqk=quest` (Phase A) — the QUEST leg's `[0x0187]` bit-0x20 route, areas 55 (Hamhand) <-> 54
 * (Bai'or town). See `docs/engine/research/dqk-campaign-legs.md` "Leg: QUEST" and
 * `packages/engine/test/dqkQuest.test.ts`, which this driver mirrors byte-for-byte (this repo's
 * engine tests never import UI code, so the two copies are necessarily independent but must agree).
 * Driven entirely through `dialogueForCell`/`dialogueForVmRun1`/`EclVm` against the real ECL.GLB
 * bytes — no GEO map is mounted for this leg (the plan explicitly rules that out: "no GEO — the
 * chain must not try to mount a map"), so the house/street cell descriptors (0x86, 0x01) are fed
 * directly, exactly as the research doc's own byte evidence names them.
 */
let dqkQuestMemory: Map<number, number> | null = null;
let dqkQuestLastChain: number | null = null;
let dqkQuestLastTexts: string[] = [];

function memoryRecord(memory: Map<number, number>): Record<string, number> {
  return Object.fromEntries([...memory].map(([address, value]) => [String(address & 0xffff), value & 0xffff]));
}

function restoreMemory(memory: Map<number, number>, saved: Record<string, number> | undefined): void {
  if (!saved) return;
  for (const [address, value] of Object.entries(saved)) {
    const key = Number(address);
    if (Number.isInteger(key) && typeof value === 'number') memory.set(key & 0xffff, value & 0xffff);
  }
}

function dqkQuickSave(): boolean {
  if (!state) return false;
  const pose = state.explorer.getPose();
  const areaKey = `Dark Queen of Krynn ECL#${state.maps[state.mapIndex]!.id}`;
  const areaMemory: Record<string, Record<string, number>> = { [areaKey]: memoryRecord(state.areaMemory) };
  if (state.area5Overland) areaMemory[DQK_AREA5_SAVE_KEY] = memoryRecord(state.area5Overland.memory);
  saveToSlot(QUICK_SLOT, {
    name: `Dark Queen of Krynn — ${formatGameTime(state.clockMinutes)}`,
    position: { area: areaKey, x: pose.x, y: pose.y, facing: pose.facing, areaId: state.maps[state.mapIndex]!.id },
    clockMinutes: state.clockMinutes,
    flags: state.area5Overland ? {
      dqkArea5Active: 1,
      dqkArea5X: state.area5Overland.getPosition().x,
      dqkArea5Y: state.area5Overland.getPosition().y,
    } : {},
    areaMemory,
  });
  return true;
}

function dqkQuickLoad(): boolean {
  if (!state) return false;
  const restored = loadSlot(QUICK_SLOT);
  if (!restored) return false;
  const { position, clockMinutes, flags, areaMemory } = restored;
  const areaId = position?.areaId;
  const mapIndex = typeof areaId === 'number' ? state.maps.findIndex((entry) => entry.id === areaId) : -1;
  if (mapIndex >= 0 && position) {
    state.mapIndex = mapIndex;
    state.map = state.maps[mapIndex]!.map;
    state.explorer = new Explorer(state.map, { x: position.x, y: position.y, facing: position.facing });
    state.automap = restoreAutomapModel(state.maps[state.mapIndex]!.id, state.map);
  }
  state.clockMinutes = clockMinutes;
  state.areaMemory.clear();
  restoreMemory(state.areaMemory, areaMemory[`Dark Queen of Krynn ECL#${state.maps[state.mapIndex]!.id}`]);
  if (flags.dqkArea5Active && state.ecl) {
    const block = state.ecl.blockSourceById(5);
    if (block) {
      const x = Number.isInteger(flags.dqkArea5X) ? flags.dqkArea5X : 29;
      const y = Number.isInteger(flags.dqkArea5Y) ? flags.dqkArea5Y : 2;
      state.area5Overland = new DqkArea5OverlandSession(block, { x, y });
      restoreMemory(state.area5Overland.memory, areaMemory[DQK_AREA5_SAVE_KEY]);
      paintArea5Overland();
    }
  } else state.area5Overland = null;
  draw();
  return true;
}

/** Paint the recovered Area-5 ECL terrain bytes without assigning speculative terrain names. */
function paintArea5Overland(): void {
  if (!state?.area5Overland) return;
  const canvas = document.querySelector('#dqk-area5-grid') as HTMLCanvasElement | null;
  const line = document.querySelector('#dqk-area5-line') as HTMLElement | null;
  if (!canvas || !line) return;
  const { grid } = state.area5Overland;
  const scale = 8;
  canvas.width = grid.width * scale;
  canvas.height = grid.height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const value = grid.valueAt(x, y) ?? 0;
      // The byte is authoritative; its grayscale is intentionally diagnostic rather than a guessed biome.
      const shade = value.toString(16).padStart(2, '0');
      ctx.fillStyle = `#${shade}${shade}${shade}`;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  const pose = state.area5Overland.getPosition();
  ctx.fillStyle = '#ff5f5f';
  ctx.fillRect(pose.x * scale, pose.y * scale, scale, scale);
  const terrain = grid.valueAt(pose.x, pose.y);
  line.textContent = `Area 5 ECL overland host · ${grid.width}×${grid.height} · logical position (${pose.x},${pose.y})` +
    (terrain === undefined ? '' : ` · raw terrain selector 0x${terrain.toString(16).padStart(2, '0')}`) +
    '. This is not GEO2; combat handoff remains separately recovered.';
}

function startArea5Overland(): boolean {
  if (!state?.ecl) return false;
  const block = state.ecl.blockSourceById(5);
  if (!block) return false;
  // This is the source-level vmRun host coordinate for the pinned 0xE5 candidate, not a claim
  // that the original first-person save pose uses the same coordinate system.
  state.area5Overland = new DqkArea5OverlandSession(block, { x: 29, y: 2 });
  paintArea5Overland();
  return true;
}

function moveArea5Overland(direction: DqkArea5TravelDirection): { moved: boolean; terrain?: number } | null {
  if (!state?.area5Overland) return null;
  const step = state.area5Overland.step(direction);
  paintArea5Overland();
  // The CampInterrupted bridge is entered only from the real 0xE5 state. This drives the retail
  // ECL handler and its own text/roster; it does not manufacture a descriptor or call COMBAT by PC.
  if (step.terrain === 0xe5) {
    // The CampInterrupted handler contains a real PARTYSTRENGTH gate.  Use
    // the same live-host estimate as ordinary DQK SearchLocation/vmRun1
    // dispatch rather than the pure VM's conservative zero default.
    const vm = state.area5Overland.beginCampInterrupted(dqkPartyStrengthEstimate());
    if (vm) {
      const event = drainRunner(new DialogueRunner(vm));
      state.area5Overland.retainRng(vm);
      if (event.parts.length || event.roster) {
        state.lastEvent = dqkEventText(event.parts, event.roster);
        renderEventLine(state.lastEvent);
      }
      if (event.roster) {
        const pose = state.area5Overland.getPosition();
        const launched = launchDqkCombat(
          event.roster, 5, pose.x, pose.y, event.runner,
          () => { state?.area5Overland?.retainRng(vm); return ''; },
          event.setup, event.surprise,
        );
        state.area5Bridge = { roster: event.roster.reduce((sum, group) => sum + Math.max(1, group.count), 0), launched };
        const line = document.querySelector('#dqk-area5-line') as HTMLElement | null;
        if (line && launched) {
          line.textContent = `Area 5 CampInterrupted queued ${state.area5Bridge.roster} foe(s) through retail ECL. ` +
            'Exact original-DOS host/RNG selection remains under investigation.';
        }
      } else {
        state.area5Bridge = { roster: 0, launched: false };
      }
    }
  }
  return { moved: step.moved, ...(step.terrain === undefined ? {} : { terrain: step.terrain }) };
}

/**
 * Read a game-data-relative path's bytes (M7.S2, mirrors `explore.ts`'s `readAssetBytes`). When
 * the current mount came from a Library entry with its own `assetSource`, this reads THAT
 * folder's file (by basename) instead of the bundled repo copy. A missing file in the picked
 * folder is a hard error, not a silent fallback to the bundled copy.
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

function setStatus(msg: string, kind: 'info' | 'error' = 'info'): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (!s) return;
  s.textContent = msg;
  s.className = kind === 'error' ? 'status error' : 'status';
}

/**
 * M10.S5 — the SAME store-key SHAPE `explore.ts`'s `automapStoreKey` uses for CoK/DoK
 * (`greybox.automap.<game>`), but keyed per-area (`greybox.automap.dqk.<areaId>`) since DQK's 20
 * GEO maps are independently sized — a flat per-game key would discard progress on every switch.
 */
function dqkAutomapStoreKey(areaId: number): string {
  return `greybox.automap.dqk.${areaId}`;
}

function persistAutomapModel(areaId: number, automap: Automap): void {
  try {
    localStorage.setItem(dqkAutomapStoreKey(areaId), JSON.stringify(automap.toJSON()));
  } catch { /* quota exceeded or unavailable — non-fatal */ }
}

/** Restore the persisted automap for this area's dimensions (or a fresh one). Dimension mismatch
 * (shouldn't happen — an area id always maps to the same map — but guarded defensively) starts fresh. */
function restoreAutomapModel(areaId: number, map: GameMap): Automap {
  try {
    const raw = localStorage.getItem(dqkAutomapStoreKey(areaId));
    if (raw) {
      const data = JSON.parse(raw);
      if (data && data.width === map.width && data.height === map.height) {
        return Automap.fromJSON(data, map.width, map.height);
      }
    }
  } catch { /* corrupt store → fresh */ }
  return new Automap(map.width, map.height);
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

function draw(): void {
  if (!state) return;
  const { map, explorer, automap, automapSurface } = state;
  const pose = explorer.getPose();

  // M10.S5 — feed the D1 Automap model from real walking (not click-reveal); write through on
  // every visit so a reload never loses ground already covered, matching CoK's M10.S1 tactic.
  if (automap.visit(pose.x, pose.y)) {
    persistAutomapModel(state.maps[state.mapIndex].id, automap);
  }
  const amFb = composeAutomapPanel({
    frameTiles: state.chrome.frameTiles,
    font: state.chrome.font,
    title: `Automap · ${map.name}`,
    map,
    automap,
    pose: { x: pose.x, y: pose.y, facing: pose.facing },
    status: `${automap.visitedCount}/${map.width * map.height} cells known`,
  });
  automapSurface.paint(amFb, EGA_PALETTE);

  // M72.S1 — StepResult.blocked (Explorer.step()) tells the player WHY a move attempt failed; mirrors
  // explore.ts's own treatment (CoK/DoK).
  const blockedText = state.lastBlocked === 'wall' ? ' · A wall blocks your way.'
    : state.lastBlocked === 'edge' ? ' · You can go no further this way.' : '';
  setStatus(
    `Dark Queen of Krynn — ${map.name} (${map.width}×${map.height}) · (${pose.x},${pose.y}) facing ${pose.facing}` +
      `  ${formatTimeOfDay(state.clockMinutes)}` +
      blockedText +
      ` · ↑ forward ↓ back ← → turn`,
  );
}

type MoveAction = 'forward' | 'back' | 'left' | 'right';

function applyMove(action: MoveAction): Pose {
  if (!state) return { x: 0, y: 0, facing: 'north' };
  const ex = state.explorer;
  let res: StepResult | null = null;
  // M72.S1 — cleared unconditionally so a turn doesn't leave a stale "blocked" message on screen.
  state.lastBlocked = undefined;
  if (action === 'forward') { res = ex.forward(); }
  else if (action === 'back') { res = ex.backward(); }
  else if (action === 'left') ex.turnLeft();
  else ex.turnRight();
  const moved = res?.moved ?? false;
  if (moved) {
    // M85.S1 — advance the game clock by the real step cost (1 normal / 10 careful), mirroring
    // explore.ts's identical accumulation (previously the only one of this engine's two real
    // exploration hosts that read StepResult.timeMinutes at all).
    state.clockMinutes += res!.timeMinutes;
  } else if (res?.blocked) {
    state.lastBlocked = res.blocked;
  }
  draw();
  runStepEvent(); // C4.1 — fire the cell's Gen2 SearchLocation event on each move
  if (moved) stepDispatcher?.playEvent('step');
  return ex.getPose();
}

/** Switch to one of the 20 maps in the library and respawn the explorer on it. */
function selectMap(index: number): void {
  if (!state) return;
  const clamped = Math.max(0, Math.min(state.maps.length - 1, index));
  state.mapIndex = clamped;
  state.map = state.maps[clamped].map;
  state.explorer = new Explorer(state.map, chooseStart(state.map));
  // M10.S5 — a fresh (or per-area-persisted) Automap on every map switch; composeAutomapPanel
  // renders a fixed 320×200 frame regardless of map dimensions, so no canvas resize is needed.
  state.automap = restoreAutomapModel(state.maps[clamped].id, state.map);
  state.areaMemory = new Map<number, number>(); // C4.1 — fresh area-script state on entry
  state.encounterRoster = [];
  state.lastEvent = '';
  const sel = document.querySelector('#dqk-mapsel') as HTMLSelectElement | null;
  if (sel) sel.value = String(clamped);
  // C2 — fire the area's Gen2 ECL init through the engine VM so its events (file loads, intro text)
  // run when the dungeon is entered, exactly as the original does on area entry.
  state.lastEcl = runAreaEcl(state.ecl, state.maps[clamped].id);
  renderEclLine();
  draw();
  renderEventLine(''); // reset the per-cell event line for the new area
  runStepEvent(); // C4.1 — fire the spawn cell's SearchLocation event
}

function onKey(e: KeyboardEvent): void {
  if (!state || !document.body.contains(state.automapSurface.canvas)) return;
  // C4.3 / M10.S5 — overlay hotkeys (ignored while any overlay is up; the overlays own their keys
  // via their own capture-phase handlers, which already stop these events reaching here — this
  // guard is the same defensive belt-and-braces `explore.ts` keeps).
  if (isCombatOpen() || isSheetOpen() || isMagicOpen() || isInventoryOpen() || isCompanionOpen()) return;
  const map: Record<string, MoveAction> = {
    ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right',
  };
  const action = map[e.key];
  if (action) {
    e.preventDefault();
    applyMove(action);
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 'v') { e.preventDefault(); openDqkOverlay('sheet'); }
  else if (k === 'm') { e.preventDefault(); openDqkOverlay('magic'); }
  else if (k === 'i') { e.preventDefault(); openDqkOverlay('items'); }
  else if (k === 't') { e.preventDefault(); void openDqkTown(); }
  else if (k === 'c') { e.preventDefault(); openCompanion(); } // M10.S5 — Automap/Party/Databases/Journal/Char host
}

/** Fetch GEO.GLB and decode every Gen2 dungeon map from the HLIB DATA library. */
async function loadGeoLibrary(): Promise<Gen2GeoMap[]> {
  const bytes = await readAssetBytes(DQK_GEO_GLB);
  const arch = decodeHlib(bytes, 'GEO.GLB');
  // magic=1 → rawMembers[0] is the id table; decodeGen2GeoArchive skips non-map members.
  const maps = decodeGen2GeoArchive(arch.rawMembers, 'GEO');
  if (maps.length === 0) throw new Error('GEO.GLB held no decodable maps');
  return maps;
}

/** Fetch ECL.GLB and decode the Gen2 script library (or null if absent/undecodable). */
async function loadEclLibrary(): Promise<EclGlbArchive | null> {
  try {
    return decodeEclGlb(await readAssetBytes(DQK_ECL_GLB), 'ECL.GLB');
  } catch {
    return null;
  }
}

/** Fetch MONCHA.GLB and decode the DQK bestiary (or null if absent/undecodable). */
async function loadMoncha(): Promise<MonchaArchive | null> {
  try {
    return decodeMonchaGlb(await readAssetBytes(DQK_MONCHA_GLB), 'MONCHA.GLB');
  } catch {
    return null;
  }
}

/**
 * C5a — fetch DQK's AdLib music (ADDQ1..3.XMI) + the OPL2 timbre bank (INSTR.AD) and decode the
 * containers. Returns null if none load. Synthesis (XMI events + bank → OPL2 audio) is C5b.
 */
async function loadDqkAudio(): Promise<DqkAudio | null> {
  try {
    const xmiBuffers = await Promise.all(
      DQK_XMI_SONGS.map((p) => readAssetBytes(p).catch(() => null)),
    );
    const bank = await readAssetBytes(DQK_INSTR_AD).then(decodeInstrAd).catch(() => null);

    // C5b-1 — the digitized SFX (decoded here for the readout; gameAudio decodes its own copy to play).
    let sfxNames: string[] = [];
    try {
      const vocBytes = await readAssetBytes(DQK_SFX_VOC);
      sfxNames = decodeVoc(vocBytes).sounds.map((s) => s.clip.name);
    } catch {
      sfxNames = [];
    }

    const xmi: XmiFile[] = [];
    const songs: DqkAudioSummary[] = [];
    for (let i = 0; i < xmiBuffers.length; i++) {
      const buf = xmiBuffers[i];
      if (!buf) continue;
      const file = decodeXmi(buf);
      xmi.push(file);
      const first = file.songs[0];
      const tempo = first?.events.find((e) => e.kind === 'tempo');
      const usPerQ = tempo && tempo.kind === 'tempo' ? tempo.usPerQuarter : 500000;
      songs.push({
        name: DQK_XMI_SONGS[i].split('/').pop() ?? `song${i}`,
        songCount: file.songs.length,
        timbres: first?.timbres.length ?? 0,
        events: first?.events.length ?? 0,
        notes: first?.events.filter((e) => e.kind === 'noteOn').length ?? 0,
        tempoBpm: Math.round(60_000_000 / usPerQ),
      });
    }
    if (songs.length === 0 && !bank && sfxNames.length === 0) return null;
    return { songs, bankInstruments: bank?.instruments.length ?? 0, sfxNames, xmi, bank };
  } catch {
    return null;
  }
}

/**
 * C5b-2a — synthesize one note through a real `INSTR.AD` timbre with the pure-TS OPL2 voice and
 * report whether it is voiced and at what pitch. This is the offline proof that the pinned
 * 12-byte operator map is correct: a patch fed a note actually sings. Returns null if the bank
 * is absent or the patch is missing.
 */
function previewOplNote(patchNum: number, midiNote: number): { rms: number; hz: number; samples: number; additive: boolean } | null {
  const bank = state?.audio?.bank;
  if (!bank) return null;
  const inst = bank.byKey.get(patchNum); // bank-0 key === patch number
  if (!inst) return null;
  const patch = parseAdLibPatch(inst.operatorData);
  const clip = renderOplNote(patch, midiNote, { durationMs: 400, noteOffMs: 300 });
  return {
    rms: pcmRms(clip.pcm),
    hz: dominantHz(clip.pcm, clip.sampleRate),
    samples: clip.pcm.length,
    additive: patch.additive,
  };
}

/**
 * C5b-2b-1 — render a full decoded ADDQ song to one PCM mixdown through the 9-channel OPL2 mixer
 * and report its structural stats (length, polyphony, voiced fraction, percussion). The offline
 * proof that the pinned voice drives a whole score, not just one note. Renders at a reduced rate
 * so the seam returns promptly. Returns null if the music / bank is absent.
 */
function previewDqkSong(fileIndex = 0): {
  durationSec: number;
  maxPolyphony: number;
  voicedFraction: number;
  renderedNotes: number;
  percussionNotes: number;
  channelsUsed: number[];
} | null {
  const audio = state?.audio;
  if (!audio?.bank || !audio.xmi[fileIndex]) return null;
  const song = audio.xmi[fileIndex].songs[0];
  if (!song) return null;
  const { stats } = renderXmiSong(song, audio.bank, { sampleRate: 22050 });
  return {
    durationSec: Math.round(stats.durationSec * 10) / 10,
    maxPolyphony: stats.maxPolyphony,
    voicedFraction: Math.round(stats.voicedFraction * 100) / 100,
    renderedNotes: stats.renderedNotes,
    percussionNotes: stats.percussionNotes,
    channelsUsed: stats.channelsUsed,
  };
}

/**
 * C5b-2b-2b — decode the in-engine `SOUNDS.GLB` DIG4 bank and report structural stats: the 13
 * effect names, each member's header sample rate + decoded length, and whether the rate buckets
 * land where the VOC cross-check predicts (members 3 & 6 high-rate = die/lightning, member 9 low-
 * rate = fireball). Fetches lazily; returns null if the bank is absent or not DIG4.
 */
async function previewDigSfx(): Promise<{
  count: number;
  names: string[];
  rates: number[];
  samples: number[];
  highRateIdx: number[];
  lowRateIdx: number[];
  maxAbsMean: number;
} | null> {
  try {
    const dig = decodeSoundsGlb(await readAssetBytes(DQK_SFX_SOUNDS));
    if (dig.sounds.length === 0) return null;
    let maxAbsMean = 0;
    const rates: number[] = [];
    const samples: number[] = [];
    const highRateIdx: number[] = [];
    const lowRateIdx: number[] = [];
    dig.sounds.forEach((s, i) => {
      rates.push(s.clip.sampleRate);
      samples.push(s.clip.pcm.length);
      if (s.clip.sampleRate > 10000) highRateIdx.push(i);
      if (s.clip.sampleRate < 6000) lowRateIdx.push(i);
      let sum = 0;
      for (const v of s.clip.pcm) sum += v;
      maxAbsMean = Math.max(maxAbsMean, Math.abs(sum / s.clip.pcm.length));
    });
    return {
      count: dig.sounds.length,
      names: dig.sounds.map((s) => s.clip.name),
      rates,
      samples,
      highRateIdx,
      lowRateIdx,
      maxAbsMean: Math.round(maxAbsMean * 1000) / 1000,
    };
  } catch {
    return null;
  }
}

/**
 * C4.3 — load the CoK EGA UI chrome (panel frame tiles + 8×8 font) the shared Phase-A overlays draw
 * through. Returns empty chrome on failure (the overlays still open, just without the framed border).
 */
async function loadCokChrome(): Promise<UiChrome> {
  try {
    const tileBytes = await readAssetBytes(COK_TILES_DAX);
    const blocks = new Map(readDaxDataBlocks(tileBytes).map((b) => [b.blockId, b.raw]));
    const frameRaw = blocks.get(COK_FRAME_BLOCK);
    const frameTiles = frameRaw
      ? decode8x8dBlock(frameRaw, `8X8D1#${COK_FRAME_BLOCK}`, { transparentMagenta: true }).tiles
      : null;
    return { frameTiles, font: loadCokFont(tileBytes) };
  } catch {
    return { frameTiles: null, font: null };
  }
}

// ── C4.3: DQK on the shared Phase-A systems (character sheet / magic / inventory / town) ───────────

/**
 * Open one of the shared Phase-A overlays driven by the **DQK party**. These overlays are entirely
 * party- + ruleset-driven (they read `getParty()` and the engine ruleset), so "DQK support" is the
 * install-the-DQK-roster + wire-the-openers slice this function fronts. Guards against opening while a
 * combat overlay (or another Phase-A overlay) is already up. Returns true if the overlay opened.
 */
function openDqkOverlay(which: 'sheet' | 'magic' | 'items'): boolean {
  if (!state) return false;
  if (isCombatOpen() || isSheetOpen() || isMagicOpen() || isInventoryOpen()) return false;
  installDqkParty(); // ensure the DQK roster is present (no-op if already loaded)
  const { frameTiles, font } = state.chrome;
  if (which === 'sheet') return openCharSheet({ frameTiles, font });
  if (which === 'magic') return openMemorize({ frameTiles, font });
  return openInventory({ frameTiles, font });
}

/** Enter the shared town/services screen with the DQK party loaded. M92.S1/M93.S1 — DQK's own manual
 * prints a materially more permissive, but not uncapped, race/class level-cap table, so the Training
 * Hall enforces DQK's own real ceiling here rather than CoK/DoK's (or none at all). M97.S1 — "Leave"
 * must return to the DQK dungeon, not `leaveTown()`'s CoK-wilderness default, which was hardcoded
 * before DQK had its own Town entry point and never learned it had a second caller to return to. Reuses
 * `activeAssetSource` so a Library-loaded folder or an imported `.gbmod` survives the round trip too. */
async function openDqkTown(): Promise<number> {
  if (isCombatOpen() || isSheetOpen() || isMagicOpen() || isInventoryOpen()) return 0;
  installDqkParty();
  const source = activeAssetSource ?? undefined;
  closeDqkExplore();
  return startTown('dqk', () => {
    history.replaceState(null, '', '?dqk=1');
    void startDqkExplore(source);
  });
}

/**
 * M10.S5 — the same game-agnostic `companionPanel.ts` host M10.S1/M10.S2/M10.S3 gave CoK/DoK's
 * `explore.ts`, fed from live DQK state. Two honest deviations from a literal CoK-style source:
 *  - `monsters` comes from `state.moncha.monsters` — the real, fully-decoded, combat-validated
 *    subset (the SAME records DQK's own fights already draw through `dqkMonsterFor`) — not the
 *    full 98-entry `roster`, since most roster entries lack the full stats `MonsterRecord` requires
 *    and inventing placeholder stats would violate the project's no-invented-data convention.
 *  - `items` is empty: DQK's own `ITEMS.DAT` catalogue (`dqkItem.ts`) has no name field, and CoK's
 *    `BASE_ITEMS` id space doesn't correspond to DQK's — reusing it risks silently wrong pairings.
 */
function openCompanion(tab?: CompanionTab): void {
  if (!state) return;
  const pose = state.explorer.getPose();
  openCompanionPanel({
    source: {
      frameTiles: state.chrome.frameTiles,
      font: state.chrome.font,
      map: state.map,
      automap: state.automap,
      pose: { x: pose.x, y: pose.y, facing: pose.facing },
      monsters: state.moncha?.monsters ?? [],
      items: [],
    },
    initialTab: tab,
    onClose: () => setStatus('You close the companion panel.'),
  });
}

/**
 * C3 — load DQK's real VGA 256-colour art. Decodes BIGPIC.TLB (the overland map pictures) and
 * composites a full DAC from its own picture palette (32–255) layered over ALWAYS.TLB's UI
 * palette (0–15). Returns null if BIGPIC is absent (the dungeon still walks without the preview).
 */
async function loadDqkArt(): Promise<Omit<DqkArt, 'canvas'> | null> {
  try {
    const [bigResult, alwResult] = await Promise.allSettled([
      readAssetBytes(DQK_BIGPIC_TLB),
      readAssetBytes(DQK_ALWAYS_TLB),
    ]);
    if (bigResult.status !== 'fulfilled') return null;
    const bigpic = decodeHlib(bigResult.value, 'BIGPIC.TLB');
    const frames = bigpic.images.map((m) => m.image).filter((im) => im.width > 0 && im.height > 0);
    if (frames.length === 0) return null;
    const picPal = compositeHlibPalette(bigpic); // overland slice 32–255
    const uiPal: Palette | null =
      alwResult.status === 'fulfilled' ? compositeHlibPalette(decodeHlib(alwResult.value, 'ALWAYS.TLB')) : null;
    const palette = mergePalettes(uiPal, picPal); // full DAC: UI 0–15 + picture 32–255
    return { frames, palette, index: 0 };
  } catch {
    return null;
  }
}

/** Paint the current DQK VGA picture to its canvas through the composited DAC. */
function paintArt(): void {
  if (!state?.art) return;
  const { frames, palette, index, canvas } = state.art;
  const img = frames[index];
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // Overland pics are opaque (method 18); render every index through the DAC (no alpha keying).
  const rgba = indexedToRGBA({ ...img, transparentIndex: null }, palette);
  const id = ctx.createImageData(img.width, img.height);
  id.data.set(rgba);
  ctx.putImageData(id, 0, 0);
  const label = document.querySelector('#dqk-artlabel') as HTMLElement | null;
  if (label) {
    label.textContent =
      `DQK VGA overland — picture ${index + 1}/${frames.length} ` +
      `(${img.width}×${img.height}, 256-colour HLIB TILE, ${definedColorCount(palette)} palette slots)`;
  }
}

/** Step the VGA art preview to the previous/next overland picture. */
function artStep(delta: number): void {
  if (!state?.art) return;
  const n = state.art.frames.length;
  state.art.index = (state.art.index + delta + n) % n;
  paintArt();
}

/**
 * Run an area's Gen2 ECL script through the engine VM (C2). The DQK ECL dialect differs from Gen1
 * only in the block header, so this is `runEclChain` with `{ dialect: ECL_GEN2 }`. We auto-answer
 * inputs/menus and auto-resolve combat so the headless run drains to a terminal state, then fold
 * the fired effects (LOAD_FILES, the first PRINT text) into a one-line summary. Pairs map↔script by
 * the shared logical area id.
 */
function runAreaEcl(ecl: EclGlbArchive | null, areaId: number): EclRun {
  const base: EclRun = { areaId, found: false, effectCount: 0, loadFilesGeo: -1, firstText: '', status: 'none' };
  if (!ecl || !ecl.blockSourceById(areaId)) return base;
  try {
    const run = runEclChain(areaId, ecl.blockSourceById, {
      dialect: ECL_GEN2,
      autoInput: () => 0,
      autoCombat: true,
      maxBlocks: 32,
      // Area-entry state the COAB engine supplies on a new-area init: entry-mode [0x16]=4 and
      // sub-state [0x9c]=2. The intro narrative is gated by the script's own byte-verified
      // `COMPARE_AND [0x16],#4,[0x9c],#2` (area-4 init @0x801f); seed it so the corrected
      // compound-equality COMPARE_AND (vs the prior buggy {left,right} which compared the two
      // unseeded-zero cells and matched) still reaches the intro. (RE: the full per-area entry-
      // state model is the deferred DQK host-seeding work — see C4.2b-2b-2c-iii §arith/§state.)
      memory: new Map<number, number>([[0x16, 4], [0x9c, 2]]),
    });
    const loadFiles = run.effects.find((e: EclEffect) => e.type === 'loadFiles');
    const firstPrint = run.effects.find(
      (e: EclEffect): e is Extract<EclEffect, { type: 'print' }> => e.type === 'print' && !!e.text,
    );
    return {
      areaId,
      found: true,
      effectCount: run.effects.length,
      loadFilesGeo: loadFiles && loadFiles.type === 'loadFiles' ? loadFiles.geoBlockId : -1,
      firstText: firstPrint?.text ?? '',
      status: run.status,
    };
  } catch {
    return { ...base, found: true, status: 'error' };
  }
}

/**
 * Run an area's Gen2 vmRun1 + SearchLocation handlers for a cell whose GEO backdrop byte is
 * `cellDesc`, and fold the events they fire into a short line of text. DQK dispatches per-cell
 * events on the host-populated cell-descriptor byte `[0x002d]` (the GEO backdrop) + facing
 * `[0x0011]` (C4.2b-2b-2c-iii(b)) — NOT party coordinates, which were a buggy-arith artifact. We
 * seed both via `dqkVmRun1Seed` and drive the dialogue turns to drain text + auto-resolve any
 * scripted combat. `memory` carries area flags across steps. Returns `''` when the cell is quiet.
 */
interface CellEvent {
  /** Folded event text for the per-cell line (`''` when the cell fires nothing). */
  text: string;
  /** The first combat roster the cell's script queued, if any — drives the interactive overlay. */
  roster: EncounterMonster[] | null;
  /** Latest SETUP_MONSTER/APPROACH state seen before the queued fight, when present. */
  setup?: EncounterSetup;
  /** Latest SURPRISE result seen before the queued fight, when present. */
  surprise?: EncounterSurprise;
  /** The paused runner that produced `roster`; resume this after overlay combat resolves. */
  runner: DqkDialogueRunner | null;
  /** Follow-up work to run after `runner` resumes, e.g. vmRun1 combat then SearchLocation. */
  afterCombat?: () => string;
}

type DqkDialogueRunner = NonNullable<ReturnType<typeof dialogueForCell>>;

function dqkCombatOutcomeForScript(res: CombatResult): EclCombatOutcome {
  if (res.fled) return 'flee';
  if (res.outcome === 'party') return 'victory';
  if (res.outcome === 'enemy') return 'defeat';
  return 'defeat';
}

function drainDqkAfterCombat(runner: DqkDialogueRunner, outcome: EclCombatOutcome): string {
  const parts: string[] = [];
  let turn = runner.afterCombat(outcome);
  for (let guard = 0; guard < 12; guard++) {
    if (turn.text) parts.push(turn.text);
    if (turn.kind === 'end' || turn.kind === 'chain' || turn.kind === 'combat') break;
    turn = runner.choose(0);
    if (runner.isDone()) {
      if (turn.text) parts.push(turn.text);
      break;
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function dqkOutcomeResumeProbeRunner(): DqkDialogueRunner {
  let done = false;
  return {
    start: () => ({ kind: 'combat' as const, text: 'DQK outcome probe fight.', monsters: [{ monsterId: 0, count: 1, picBlockId: 0 }] }),
    choose: () => ({ kind: 'end' as const, text: '' }),
    afterCombat: (outcome: EclCombatOutcome = 'defeat') => {
      done = true;
      return { kind: 'end' as const, text: `DQK-ECL-OUTCOME-${outcome}` };
    },
    isDone: () => done,
  } as unknown as DqkDialogueRunner;
}

function dqkEventText(parts: readonly string[], roster: EncounterMonster[] | null): string {
  const body = parts.join(' ').replace(/\s+/g, ' ').trim();
  return body ? (roster ? `⚔ ${body}` : body) : roster ? '⚔ A fight breaks out!' : '';
}

/** Drive a primed cell/vmRun1 runner until completion or the first queued fight. */
function drainRunner(runner: ReturnType<typeof dialogueForCell>): { parts: string[]; roster: EncounterMonster[] | null; setup?: EncounterSetup; surprise?: EncounterSurprise; runner: DqkDialogueRunner | null } {
  const parts: string[] = [];
  let roster: EncounterMonster[] | null = null;
  let setup: EncounterSetup | undefined;
  let surprise: EncounterSurprise | undefined;
  if (!runner) return { parts, roster, runner: null };
  let turn = runner.start();
  for (let guard = 0; guard < 12; guard++) {
    if (turn.text) parts.push(turn.text);
    if (turn.kind === 'combat') {
      roster = turn.monsters;
      setup = turn.setup;
      surprise = turn.surprise;
      return { parts, roster, ...(setup ? { setup } : {}), ...(surprise ? { surprise } : {}), runner };
    } else if (turn.kind === 'end' || turn.kind === 'chain') {
      break;
    } else {
      // vmRun1 / searchLocation can pause on a menu/who/input opcode (a few real DQK areas do under
      // naive seeding) — auto-pick option 0 so the per-step run never blocks the walk loop.
      turn = runner.choose(0);
    }
    if (runner.isDone()) {
      if (turn.text) parts.push(turn.text);
      break;
    }
  }
  return { parts, roster, runner: null };
}

/**
 * Run a DQK area's per-step scripts for the cell the party just entered. Faithful to the COAB walk
 * loop, this runs **vmRun1 first** (the per-step main loop — wandering-encounter tickers, area-exit
 * triggers, cooldown), then **SearchLocation** (per-cell events), sharing one persisted `memory` map
 * so the encounter cooldown `[0x0097]` and tickers survive across steps. The first COMBAT either
 * handler queues becomes the fight; both contribute to the event-line text.
 */
function fireSearchLocation(
  block: Uint8Array,
  areaId: number,
  cellDesc: number,
  facing: Direction,
  memory: Map<number, number>,
  encounterRoster: EncounterMonster[] = [],
): CellEvent {
  try {
    // C4.2b-2b-2c-iii(b) — DQK dispatches per-cell events on the host-populated cell-descriptor byte
    // [0x002d] (the GEO backdrop plane), masked into an ON_GOTO, plus facing [0x0011]. Seed both; the
    // backdrop arg also primes [0x002d] for the SearchLocation handler.
    const seedMemory = dqkVmRun1Seed(cellDesc, facing, areaId);
    // M82.S1 — feed the live party's strength estimate to PARTYSTRENGTH (0x1d)'s IF_GE gate (areas
    // 18/23's real wandering-encounter check); previously always 0, so the gate silently never opened.
    const partyStrength = dqkPartyStrengthEstimate();
    // C4.2b-2b-2c-i — vmRun1 (header slot 0) runs every step before SearchLocation, on shared memory.
    const vm = drainRunner(dialogueForVmRun1(block, { dialect: ECL_GEN2, memory, seedMemory, partyStrength, encounterRoster }));
    if (vm.roster) {
      return {
        text: dqkEventText(vm.parts, vm.roster),
        roster: vm.roster,
        ...(vm.setup ? { setup: vm.setup } : {}),
        ...(vm.surprise ? { surprise: vm.surprise } : {}),
        runner: vm.runner,
        afterCombat: () => {
          const sl = drainRunner(dialogueForCell(block, cellDesc, { dialect: ECL_GEN2, memory, seedMemory, partyStrength, encounterRoster }));
          return dqkEventText(sl.parts, sl.roster);
        },
      };
    }
    const sl = drainRunner(dialogueForCell(block, cellDesc, { dialect: ECL_GEN2, memory, seedMemory, partyStrength, encounterRoster }));
    const roster = sl.roster;
    const text = dqkEventText([...vm.parts, ...sl.parts], roster);
    return { text, roster, ...(sl.setup ? { setup: sl.setup } : {}), ...(sl.surprise ? { surprise: sl.surprise } : {}), runner: sl.runner };
  } catch {
    return { text: '', roster: null, runner: null };
  }
}

function inspectSearchLocationOnly(block: Uint8Array, areaId: number, cellDesc: number, facing: Direction): string {
  try {
    const seedMemory = dqkVmRun1Seed(cellDesc, facing, areaId);
    const sl = drainRunner(dialogueForCell(block, cellDesc, {
      dialect: ECL_GEN2,
      memory: new Map<number, number>(),
      seedMemory,
      partyStrength: dqkPartyStrengthEstimate(),
    }));
    return dqkEventText(sl.parts, sl.roster);
  } catch {
    return '';
  }
}

/**
 * Bounded browser replay of the retail area-67 WHO boundary. This enters the decoded shipped
 * member at its byte-pinned WHO instruction and stops at the typed engine pause; it does not
 * claim that the current GEO walker naturally reached area 67 or guess the original DOS form's
 * still-unconfirmed confirmation gesture/resulting explorer state.
 */
function inspectArea67Who(): {
  areaId: number;
  memberIndex: number;
  vaddr: number;
  awaiting: string;
  prompt: string;
  partyNames: string[];
} | null {
  if (!state?.ecl) return null;
  const memberIndex = state.ecl.idToMember.get(67);
  const block = state.ecl.blockSourceById(67);
  if (memberIndex === undefined || !block) return null;
  const runner = new DialogueRunner(new EclVm(block, {
    dialect: ECL_GEN2,
    entry: 0x87a7 - ECL_GEN2.vbase,
  }));
  const turn = runner.start();
  if (turn.kind !== 'say' || turn.awaiting !== 'who') return null;
  return {
    areaId: 67,
    memberIndex,
    vaddr: 0x87a7,
    awaiting: turn.awaiting,
    prompt: turn.prompt ?? '',
    partyNames: getParty().map((member) => member.name),
  };
}

function fireArea66ScriptedCombat(): CellEvent {
  if (!state?.ecl) return { text: '', roster: null, runner: null };
  const block = state.ecl.blockSourceById(66);
  if (!block) return { text: '', roster: null, runner: null };
  try {
    const vm = new EclVm(block, {
      dialect: ECL_GEN2,
      entry: 0x8398 - ECL_GEN2.vbase,
      partyStrength: dqkPartyStrengthEstimate(),
    });
    const ev = drainRunner(new DialogueRunner(vm));
    return {
      text: dqkEventText(ev.parts, ev.roster),
      roster: ev.roster,
      ...(ev.setup ? { setup: ev.setup } : {}),
      ...(ev.surprise ? { surprise: ev.surprise } : {}),
      runner: ev.runner,
    };
  } catch {
    return { text: '', roster: null, runner: null };
  }
}

/** The GEO backdrop-plane byte for (x,y) — the value the engine loads into the cell descriptor
 *  [0x002d] before the DQK per-cell scripts run. Returns 0 (an open cell) when out of range. */
function cellDescAt(geo: Gen2GeoMap, x: number, y: number): number {
  const W = geo.map.width;
  if (x < 0 || y < 0 || x >= W || y >= geo.map.height) return 0;
  return geo.backdropPlane[y * W + x] ?? 0;
}

/** Resolve the cell-descriptor byte for an arbitrary area+cell from the loaded GEO maps (for the
 *  e2e seams, which address areas by id). Returns 0 when the area/GEO isn't loaded. */
function cellDescFor(areaId: number, x: number, y: number): number {
  const geo = state?.maps.find((m) => m.id === areaId);
  return geo ? cellDescAt(geo, x, y) : 0;
}

// ── QUEST leg (`?dqk=quest` Phase A): [0x0187] bit 0x20, areas 55 <-> 54 ───────────────────────────

interface DqkQuestTurn {
  texts: string[];
  chain: number | null;
}

/** Auto-answer 0 (BE FRIENDLY is menu index 0) until the runner chains, ends, or queues a fight —
 *  this leg never fights. Mirrors `dqkQuest.test.ts`'s `driveQuestTurn` exactly. */
function driveQuestTurn(runner: DqkDialogueRunner): DqkQuestTurn {
  const texts: string[] = [];
  let turn = runner.start();
  for (let guard = 0; guard < 16; guard++) {
    if (turn.text) texts.push(turn.text);
    if (turn.kind === 'chain') return { texts, chain: turn.blockId };
    if (turn.kind === 'end' || turn.kind === 'combat') return { texts, chain: null };
    turn = runner.choose(0);
  }
  return { texts, chain: null };
}

/** Area 54's SearchLocation ONLY (no vmRun1) — the house-cell dispatch chain lives entirely
 *  inside SearchLocation. */
function questSearchLocation(block: Uint8Array, cellDesc: number, memory: Map<number, number>): DqkQuestTurn {
  const runner = dialogueForCell(block, cellDesc, {
    dialect: ECL_GEN2, memory, seedMemory: dqkVmRun1Seed(cellDesc, 'south', 54),
  });
  return runner ? driveQuestTurn(runner) : { texts: [], chain: null };
}

/** Area 54's vmRun1 ONLY — the real per-step latch write `SAVE [0x009B],[0x009A]`. It does NOT
 *  recompute [0x009B] itself; that only happens inside SearchLocation's own prologue, so a real
 *  street step must run SearchLocation on the street cell FIRST (see `questRunStreetStep`). */
function questVmRun1(block: Uint8Array, cellDesc: number, memory: Map<number, number>): DqkQuestTurn {
  const runner = dialogueForVmRun1(block, {
    dialect: ECL_GEN2, memory, seedMemory: dqkVmRun1Seed(cellDesc, 'south', 54),
  });
  return runner ? driveQuestTurn(runner) : { texts: [], chain: null };
}

/** Area 55's real body, entered at its own default entry. */
function questArea55(block: Uint8Array, memory: Map<number, number>): DqkQuestTurn {
  return driveQuestTurn(new DialogueRunner(new EclVm(block, { dialect: ECL_GEN2, memory })));
}

/**
 * A real ordinary street step: SearchLocation on descriptor 0x01 (the commonest open-street value
 * on this map, 57 occurrences), which recomputes [0x009B], followed by vmRun1's own latch. The
 * SearchLocation call also offers the retail "DO YOU LEAVE BAI'OR?" town-exit chain (to area 5),
 * which this driver deliberately declines (stays on area 54) — the same choice the production walk
 * loop makes at any offered exit it isn't taking.
 */
function questRunStreetStep(block: Uint8Array, memory: Map<number, number>): void {
  questSearchLocation(block, 0x01, memory);
  questVmRun1(block, 0x01, memory);
}

interface DqkQuestResult {
  armB: { chain: number | null; selector: number | undefined; texts: string[] };
  armA: {
    firstChain: number | null;
    hamhandChain: number | null;
    flagAfterHamhand: number | undefined;
    finalChain: number | null;
    finalTexts: string[];
  };
}

/**
 * Runs BOTH arms of the QUEST leg and returns a summary. Arm B (fresh, separate memory) drives
 * only the flag-CLEAR branch: the house cell chains to area 55. Arm A (its own fresh memory, kept
 * afterward as `dqkQuestMemory` for the `memory()`/`lastChain()`/`lastTexts()` seams) drives the
 * full flag-SET route end to end: house -> Hamhand (auto-answer 0, BE FRIENDLY) -> sets bit 0x20 ->
 * chain back to 54 -> a real street step -> house again, now `exited` with
 * 'THE HOUSE IS EMPTY AND DARK.' and no chain.
 */
function runDqkQuest(): DqkQuestResult | null {
  if (!state?.ecl) return null;
  const a54 = state.ecl.blockSourceById(54);
  const a55 = state.ecl.blockSourceById(55);
  if (!a54 || !a55) return null;

  const armBMemory = new Map<number, number>();
  const armB = questSearchLocation(a54, 0x86, armBMemory);

  const armAMemory = new Map<number, number>();
  const first = questSearchLocation(a54, 0x86, armAMemory);
  const hamhand = questArea55(a55, armAMemory);
  questRunStreetStep(a54, armAMemory);
  const second = questSearchLocation(a54, 0x86, armAMemory);

  dqkQuestMemory = armAMemory;
  dqkQuestLastChain = second.chain;
  dqkQuestLastTexts = second.texts;

  return {
    armB: { chain: armB.chain, selector: armBMemory.get(0x018d), texts: armB.texts },
    armA: {
      firstChain: first.chain,
      hamhandChain: hamhand.chain,
      flagAfterHamhand: armAMemory.get(0x0187),
      finalChain: second.chain,
      finalTexts: second.texts,
    },
  };
}

// ── C4.2: DQK combat through the shared interactive overlay ───────────────────────────────────────

/** A built-in DQK party for the standalone dungeon view when the player has no created roster. */
function dqkDemoParty(): Combatant[] {
  return [
    { id: 'p1', name: 'Caramon', side: 'party', hp: 42, maxHp: 42, thac0: 13, ac: 2, damage: { count: 1, sides: 8, bonus: 4 } },
    { id: 'p2', name: 'Tanis', side: 'party', hp: 36, maxHp: 36, thac0: 14, ac: 3, damage: { count: 1, sides: 8, bonus: 2 } },
    { id: 'p3', name: 'Goldmoon', side: 'party', hp: 26, maxHp: 26, thac0: 16, ac: 5, damage: { count: 1, sides: 6, bonus: 1 } },
    { id: 'p4', name: 'Raistlin', side: 'party', hp: 18, maxHp: 18, thac0: 18, ac: 8, damage: { count: 1, sides: 4, bonus: 0 } },
  ];
}

/** The party that fights a DQK encounter: the created roster if there is one, else the demo four. */
function dqkParty(): Combatant[] {
  return partySize() > 0 ? partyCombatants() : dqkDemoParty();
}

/**
 * M82.S1 — a party-power scalar for the ECL `PARTYSTRENGTH` (0x1d) opcode's `IF_GE` gate (real,
 * shipped `ECL.GLB` areas 18/23 use this to decide whether a wandering encounter fires). The true
 * original formula/units are unrecoverable from disk ({@link EclVmOptions.partyStrength}'s own doc
 * comment) — this sums the live party's total max HP, an always-populated, monotonically
 * party-power-correlated `Combatant` field, which is strictly more faithful than the engine's
 * permanent default of 0 (a value that can never satisfy `IF_GE`, silently disabling both gates).
 */
function dqkPartyStrengthEstimate(): number {
  return dqkParty().reduce((sum, c) => sum + c.maxHp, 0);
}

/**
 * Resolve a DQK encounter `monsterId` (from the ECL LOAD_MONSTER opcode) to a faithful decoded
 * MONCHA record. Prefers the id-table mapping, then the raw member index; falls back to a stable
 * pick from the decoded set so a scripted fight always faces a *real* DQK monster (honest partial
 * coverage — see the C4.2b note: only some records decode cleanly today).
 */
function dqkMonsterFor(monsterId: number): MonsterRecord | null {
  const m = state?.moncha;
  if (!m || m.monsters.length === 0) return null;
  return m.byId.get(monsterId) ?? m.byMember.get(monsterId) ?? m.monsters[monsterId % m.monsters.length];
}

/** Turn a decoded DQK monster record into an enemy `Combatant` for the shared combat model. */
function recordToCombatant(rec: MonsterRecord, id: string): Combatant {
  return {
    id,
    name: rec.name,
    side: 'enemy',
    hp: rec.hitPoints,
    maxHp: rec.hitPoints,
    thac0: rec.thac0,
    ac: rec.armorClass,
    damage: rec.damage,
    xp: rec.xp,
  };
}

/** Build the complete enemy line-up for a queued roster, resolving each id through the bestiary. */
function buildDqkEnemies(roster: EncounterMonster[] | null): { enemies: Combatant[]; names: Map<string, string> } {
  const enemies: Combatant[] = [];
  const names = new Map<string, string>();
  let n = 0;
  for (const g of roster ?? []) {
    const rec = dqkMonsterFor(g.monsterId);
    if (!rec) continue;
    for (let i = 0; i < Math.max(1, g.count); i++) {
      const c = recordToCombatant(rec, `e${n++}`);
      enemies.push(c);
      names.set(c.id, c.name);
    }
  }
  // Demo calls pass null and still get a deterministic DQK foe. A real ECL COMBAT with an empty or
  // unresolved roster must not invent an enemy; that path still needs host/wandering-table recovery.
  if (enemies.length === 0 && roster === null) {
    const rec = dqkMonsterFor(0);
    if (rec) { const c = recordToCombatant(rec, 'e0'); enemies.push(c); names.set(c.id, c.name); }
  }
  return { enemies, names };
}

/**
 * Build the DQK 50x25 dungeon combat surface for a given GEO area id (Round 32 R1), transcribed
 * from `DQK.EXE`'s own population routine (`0x02c397`, dispatched from `0x02cb60`) — see
 * `packages/engine/src/combat/dqkCombatMap.ts` and
 * `docs/engine/research/dqk-overlay12-combat-setup-cluster.md`. Returns `null` for any area id
 * not present in the loaded `GEO.GLB` — currently only area 5, DQK's ECL-owned wilderness/overland
 * area (see `DqkArea5OverlandSession`), which has no Gen2 GEO grid to sample. Area 5's own
 * combat surface is built separately, by {@link dqkWildernessTerrainForArea5} below (Round 33 R3).
 */
function dqkDungeonTerrainForArea(areaId: number, x: number, y: number): DqkDungeonCombatMap | null {
  const geoArea = state?.maps.find((m) => m.id === areaId);
  if (!geoArea) return null;
  const { map } = geoArea;
  const at = (cx: number, cy: number) =>
    cx < 0 || cy < 0 || cx >= map.width || cy >= map.height ? null : (map.cells[cy * map.width + cx] ?? null);
  return buildDqkDungeonCombatMap({
    sample: (sx, sy) => at(sx, sy)?.walls ?? null,
    sampleDoors: (sx, sy) => at(sx, sy)?.doors ?? null,
    party: { x, y },
  });
}

/**
 * Build DQK's 50x25 WILDERNESS combat surface for area 5 (Round 33 R3), transcribed from
 * `DQK.EXE:0x02cb2b`'s `[0xb20f]+0x22 == 0` branch — see
 * `packages/engine/src/combat/dqkCombatMap.ts` (`buildDqkWildernessCombatMap`) and
 * `docs/engine/research/dqk-overlay12-combat-setup-cluster.md` R3.
 *
 * Neither of the two native inputs the transcription found (`[0xb20f]+0x1a2` "currentCity",
 * `[0xb20f]+0x33` pass-1's gate) has a writer in the modelled area-5 overland ECL host
 * (`world/dqkArea5Overland.ts`'s own tracked memory offsets are a disjoint ECL VM address space —
 * see the `address-space-not-flag` caution in project memory), so both ship as the builder's own
 * stated defaults here (`currentCity` omitted → `0`; `pass1Gate` omitted → `true`) rather than an
 * invented value. The seed reuses the same cell-derived value `launchDqkCombat` already computes
 * for its dungeon sibling, so a given area-5 fight's terrain is reproducible the same way.
 */
function dqkWildernessTerrainForArea5(seed: number): DqkWildernessCombatMap {
  const rng = new Rng(seed);
  return buildDqkWildernessCombatMap({ rng: { rollDie: (sides) => rng.die(sides) } });
}

/**
 * Route a DQK SearchLocation/event combat into the **shared interactive combat overlay** (the same
 * tactical screen CoK/DoK fights use): build the party + faithful DQK enemies, hand off to
 * {@link launchCombat}, and on dismiss return to the dungeon — surviving HP persisted, the outcome
 * surfaced on the event line. A cell-derived seed makes a given fight reproducible.
 *
 * **Dungeon terrain is built from the real GEO area** (Round 32 R1) via
 * {@link dqkDungeonTerrainForArea}, transcribed byte-for-byte from `DQK.EXE`'s own combat-surface
 * population routine (`0x02c397`); see `dqkCombatMap.test.ts` for the measured agreement against
 * the CoAB sibling builder. **Area 5** — DQK's ECL-owned wilderness/overland area, see
 * `DqkArea5OverlandSession`, which has no Gen2 GEO grid to sample — now instead gets its OWN
 * transcribed 50x25 wilderness terrain (Round 33 R3) via {@link dqkWildernessTerrainForArea5},
 * rather than falling through to `combat.ts`'s flat 13x9 field as it did before that transcription
 * landed; the `explore-dqk` e2e area-5 fight-size assertion is updated to match (see the R3
 * research-doc section for the intended patch text, pending Phase B's e2e-file ownership).
 */
function launchDqkCombat(
  roster: EncounterMonster[] | null,
  areaId: number,
  x: number,
  y: number,
  runner?: DqkDialogueRunner | null,
  afterCombat?: () => string,
  setup?: EncounterSetup,
  surprise?: EncounterSurprise,
  mapDirection = 2,
): boolean {
  if (isCombatOpen()) return false;
  const { enemies, names } = buildDqkEnemies(roster);
  if (enemies.length === 0) return false; // no bestiary → nothing faithful to fight
  const party = dqkParty();
  for (const c of party) names.set(c.id, c.name);
  const seed = ((areaId & 0xff) << 16) | ((x & 0xff) << 8) | (y & 0xff) | 0x10000;
  const intro = enemies.length === 1 ? `A ${enemies[0].name} attacks!` : 'Monsters attack!';
  const dungeonTerrain = areaId === 5 ? dqkWildernessTerrainForArea5(seed) : dqkDungeonTerrainForArea(areaId, x, y);
  void launchCombat({
    party,
    enemies,
    names,
    seed,
    intro,
    ...(setup ? { encounterSetup: setup } : {}),
    ...(surprise ? { encounterSurprise: surprise } : {}),
    ...(dungeonTerrain
      ? {
          terrain: dungeonTerrain.terrain,
          backgroundIds: dungeonTerrain.backgroundIds,
          partyAnchor: dungeonTerrain.partyAnchor,
          enemyAnchor: dungeonTerrain.enemyAnchor,
        }
      : {}),
    mapDirection,
    ruleset: 'gen2', // DQK uses the verified Gen2 combat rules (RE.2) — e.g. no Gen1 `+10` overkill death
    onEnd: (res) => {
      const postCombat = [
        runner ? drainDqkAfterCombat(runner, dqkCombatOutcomeForScript(res)) : '',
        afterCombat?.() ?? '',
      ].filter(Boolean).join(' ');
      const tag =
        res.outcome === 'party' ? `⚔ Victory! +${res.xpAwarded} XP — back to the dungeon.`
        : res.outcome === 'enemy' ? '⚔ The party has fallen.'
        : res.fled ? '⚔ The party fled.'
        : '⚔ The battle ends in a stalemate.';
      const line = postCombat ? `${tag} ${postCombat}` : tag;
      if (state) { state.lastCombat = line; state.lastEvent = line; }
      renderEventLine(line);
      setStatus(`The Dark Queen of Krynn — DQK combat ${res.outcome === 'party' ? 'won' : res.outcome === 'enemy' ? 'lost' : res.fled ? 'fled' : 'drawn'}.`);
    },
  });
  return true;
}

/** Fire the current area's SearchLocation for the party's live cell; update the event line. */
function runStepEvent(): void {
  if (!state?.ecl) return;
  const geo = state.maps[state.mapIndex];
  const areaId = geo.id;
  const block = state.ecl.blockSourceById(areaId);
  if (!block) return;
  const pose = state.explorer.getPose();
  const cellDesc = cellDescAt(geo, pose.x, pose.y);
  const ev = fireSearchLocation(block, areaId, cellDesc, pose.facing, state.areaMemory, state.encounterRoster);
  if (ev.text && ev.text !== state.lastEvent) {
    state.lastEvent = ev.text;
    renderEventLine(ev.text);
  }
  // C4.2 — a queued fight launches the real interactive overlay (not an auto-resolve marker).
  if (ev.roster) launchDqkCombat(ev.roster, areaId, pose.x, pose.y, ev.runner, ev.afterCombat, ev.setup, ev.surprise, FACING_NUM[pose.facing]);
}

/** Repaint the per-cell event line under the map (empty = quiet cell). */
function renderEventLine(text: string): void {
  const line = document.querySelector('#dqk-eventline') as HTMLElement | null;
  if (!line) return;
  line.textContent = text ? `✦ ${text}` : 'No event on this cell. (Move — DQK fires per-cell events by position.)';
  line.className = text ? 'gb-note dqk-event-fired' : 'gb-note';
}

/** C4.3 — surface the loaded DQK party under the command bar (names + class/level summary). */
function renderRosterLine(): void {
  const line = document.querySelector('#dqk-roster') as HTMLElement | null;
  if (!line) return;
  const party = getParty();
  if (party.length === 0) {
    line.textContent = 'No party loaded.';
    line.className = 'gb-note';
    return;
  }
  // M52.S1 — classLabel() (already used by the CoK/DoK sibling HUD) fills in this line's own
  // doc-commented "class/level summary" promise, previously names-only.
  line.textContent =
    `Party (${party.length}): ` + party.map((p) => `${p.name} (${classLabel(p.classes)})`).join(', ');
  line.className = 'gb-note dqk-roster-loaded';
}

/** Repaint the ECL event line under the map from the last area run. */
function renderEclLine(): void {
  const line = document.querySelector('#dqk-eclline') as HTMLElement | null;
  if (!line || !state) return;
  const r = state.lastEcl;
  if (!r || !r.found) {
    line.textContent = `Area ${r?.areaId ?? '?'}: no ECL script (map walks without scripted events).`;
    line.className = 'gb-note';
    return;
  }
  const bits = [`▸ ECL area ${r.areaId} ran (${r.status}): ${r.effectCount} events`];
  if (r.loadFilesGeo >= 0) bits.push(`LOAD_FILES GEO ${r.loadFilesGeo}`);
  if (r.firstText) bits.push(`“${r.firstText}”`);
  line.textContent = bits.join(' · ');
  line.className = 'gb-note dqk-ecl-ran';
}

/**
 * Boot the DQK explore view: decode the Gen2 GEO library and make map 1 walkable.
 * `assetSource` (M7.S2), when given, is a Library entry's own picked-folder reader — omit
 * it (as the bundled `?dqk=1` boot does) to play the bundled repo copy.
 */
export function closeDqkExplore(): void {
  dqkMountSeq++;
  if (dqkKeyHandler) {
    window.removeEventListener('keydown', dqkKeyHandler);
    dqkKeyHandler = null;
  }
  closeCharSheet();
  closeMagic();
  closeInventory();
  closeCompanionPanel();
  closeCombat();
  state?.automapSurface.dispose();
  state = null;
  activeAssetSource = null;
  stepDispatcher = null;
  dqkQuestMemory = null;
  dqkQuestLastChain = null;
  dqkQuestLastTexts = [];
  (window as unknown as { __dqk?: Record<string, unknown> }).__dqk = undefined;
}

export async function startDqkExplore(assetSource?: AssetSource): Promise<number> {
  closeDungeon3d();
  closeDqkExplore();
  // Goal 222: a Town mounted or still loading its chrome (a pending DQK `t` visit) is retired silently
  // here, so its chrome load cannot mount over this fresh dungeon. Silent: the Town's onLeave is not
  // run. openDqkTown's Leave already closed the Town before calling this, so that path is a no-op.
  closeTown();
  const mountSeq = ++dqkMountSeq;
  activeAssetSource = assetSource ?? null;
  const out = document.querySelector('#output') as HTMLElement;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  out.innerHTML = '';
  setStatus('Loading The Dark Queen of Krynn dungeons (HLIB GEO.GLB)…');

  let maps: Gen2GeoMap[];
  let ecl: EclGlbArchive | null = null;
  let artData: Omit<DqkArt, 'canvas'> | null = null;
  let moncha: MonchaArchive | null = null;
  let chrome: UiChrome = { frameTiles: null, font: null };
  let audio: DqkAudio | null = null;
  let dig: Awaited<ReturnType<typeof previewDigSfx>> = null;
  try {
    [maps, ecl, artData, moncha, chrome, audio, dig] = await Promise.all([
      loadGeoLibrary(), loadEclLibrary(), loadDqkArt(), loadMoncha(), loadCokChrome(), loadDqkAudio(),
      previewDigSfx(),
    ]);
  } catch (err) {
    if (mountSeq !== dqkMountSeq) return 0;
    setStatus(`Could not load DQK dungeons: ${err instanceof Error ? err.message : String(err)}`, 'error');
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }
  if (mountSeq !== dqkMountSeq) return 0;

  const screen = el('div', 'gb-screen');
  const head = el('div', 'gb-panel-h', 'The Dark Queen of Krynn — Gen2 HLIB dungeon (walkable)');
  screen.appendChild(head);

  const note = el(
    'div',
    'gb-note',
    `Loaded ${maps.length} dungeon maps from GEO.GLB (HLIB DataLib — the newest Gold Box engine's ` +
      `container)` +
      (artData
        ? `, plus ${artData.frames.length} real VGA 256-colour overland pictures (BIGPIC.TLB) shown below.`
        : `. (BIGPIC.TLB not bundled — VGA art preview hidden.)`) +
      (moncha
        ? ` Bestiary: ${moncha.named} of ${moncha.total} DQK creatures named from MONCHA.GLB ` +
          `(${moncha.decoded} with full validated combat stats, read at fixed offsets — every member ` +
          `carries a 2-byte big-endian uncompressed length that DQK's own loader reads before ` +
          `decompressing, and skipping it is what used to leave these records out of phase; ` +
          `${moncha.monsters.filter((m) => m.category === 'npc').length} are character/NPC records with ` +
          `decoded class, level and stored HP, flagged by the is-monster byte rather than by name) — ` +
          `fights run on the shared tactical combat screen. ` +
          `${moncha.roster.filter((e) => e.category === 'sub').length} dragon HEAD records are flagged as ` +
          `breath/head sub-entries (not standalone monsters).`
        : ``),
  );
  screen.appendChild(note);

  // C5a — DQK AdLib (OPL2) music readout: the three ADDQ songs decoded from Miles XMIDI + the
  // INSTR.AD timbre bank. Synthesis (OPL2 playback) is C5b; this proves the containers decode.
  if (audio) {
    const totalNotes = audio.songs.reduce((n, s) => n + s.notes, 0);
    const songList = audio.songs
      .map((s) => `${s.name} (${s.songCount > 1 ? `${s.songCount} songs, ` : ''}${s.notes} notes, ${s.tempoBpm} BPM)`)
      .join(' · ');
    const sfxPart = audio.sfxNames.length
      ? ` Sound effects: ${audio.sfxNames.length} digitized SFX (${audio.sfxNames.join(', ')}) decoded from ` +
        `SFXDQ.VOC (Creative 4-bit ADPCM) — these play in combat, platform-bound to DOS VGA.`
      : '';
    // M53.S1 — previewDigSfx() (C5b-2b-2b) already decodes SOUNDS.GLB, the bank gameAudio.ts actually
    // PREFERS for real playback (SFXDQ.VOC above is only the fallback); name the real preferred bank.
    const digPart = dig
      ? ` In-engine bank (C5b-2b-2b): the same ${dig.count} effects also ship as raw 8-bit PCM in ` +
        `SOUNDS.GLB — the bank actually played first in combat (SFXDQ.VOC above is the fallback).`
      : '';
    // C5b-2a — render one timbre to PCM through the pure-TS OPL2 voice as a live proof the
    // 12-byte INSTR.AD operator map is pinned (the clarinet, patch 51, at middle C).
    const preview = previewOplNote(51, 60);
    // C5b-2b-1 — render the first ADDQ song through the 9-channel OPL2 mixer as a live mixdown proof.
    const songStats = previewDqkSong(0);
    const songPart = songStats
      ? ` Full-song mixdown (C5b-2b-1): the first song renders through the 9-channel OPL2 mixer → ` +
        `${songStats.durationSec}s, ${songStats.renderedNotes} notes (${songStats.percussionNotes} on the ` +
        `percussion track), peak polyphony ${songStats.maxPolyphony}/9, voiced ${Math.round(songStats.voicedFraction * 100)}% ` +
        `across the timeline. This OPL2 music now loops through WebAudio, armed on the DOS-VGA platform ` +
        `alongside the digitized SFX (C5b-2b-2) — switching graphics mode to DOS DQK plays both.`
      : '';
    const synthPart = preview
      ? ` OPL2 synthesis (C5b-2a): the pure-TS OPL2 voice renders INSTR.AD timbres — sample patch 51 ` +
        `at middle C → ${preview.samples} samples, voiced (rms ${preview.rms.toFixed(3)}) at ~${Math.round(preview.hz)} Hz; ` +
        `the 12-byte operator map is pinned by synthesis.${songPart}`
      : ' OPL2 synthesis is C5b-2.';
    const audioLine = el(
      'div',
      'gb-note',
      `DQK music: ${audio.songs.length} AdLib/OPL2 XMIDI files decoded — ${songList}. ` +
        `${totalNotes} note-ons total, voiced through ${audio.bankInstruments} OPL2 timbres from INSTR.AD ` +
        `(Miles AdLib bank).${synthPart}` +
        sfxPart +
        digPart,
    );
    audioLine.id = 'dqk-audioline';
    screen.appendChild(audioLine);
  }

  // Map picker — the 20 maps are variable-sized, so list each with its dimensions.
  const picker = el('div', 'gb-mappicker');
  picker.appendChild(el('span', 'gb-scaler-label', 'Dungeon map'));
  const sel = el('select', '') as HTMLSelectElement;
  sel.id = 'dqk-mapsel';
  maps.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `Map ${m.id} — ${m.map.width}×${m.map.height}`;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => selectMap(Number(sel.value)));
  picker.appendChild(sel);
  screen.appendChild(picker);

  // Area 5 is an ECL-owned 38×30 overland system, not one of GEO.GLB's dungeon maps. Surface the
  // recovered source grid independently so selecting it can never repeat the rejected GEO2/ECL5
  // pairing. The raw-byte canvas remains diagnostic until terrain art/host semantics are recovered.
  if (ecl?.blockSourceById(5)) {
    const overland = el('div', 'gb-aid');
    overland.appendChild(el('div', 'gb-panel-h', 'Area 5 overland — recovered ECL grid'));
    const overlandLine = el('div', 'gb-note', 'Load the real 38×30 Area-5 ECL terrain table.');
    overlandLine.id = 'dqk-area5-line';
    overland.appendChild(overlandLine);
    const overlandCanvas = el('canvas', 'pixelated') as HTMLCanvasElement;
    overlandCanvas.id = 'dqk-area5-grid';
    overlandCanvas.style.width = '608px';
    overlandCanvas.style.height = '480px';
    overlandCanvas.style.imageRendering = 'pixelated';
    overland.appendChild(overlandCanvas);
    const overlandControls = el('div', 'gb-menu');
    const enter = el('button', '', 'Load Area 5 grid') as HTMLButtonElement;
    enter.type = 'button';
    enter.addEventListener('click', () => startArea5Overland());
    overlandControls.appendChild(enter);
    for (const [label, direction] of [
      ['N', 'north'], ['NE', 'north-east'], ['E', 'east'], ['SE', 'south-east'],
      ['S', 'south'], ['SW', 'south-west'], ['W', 'west'], ['NW', 'north-west'],
    ] as const) {
      const button = el('button', '', label) as HTMLButtonElement;
      button.type = 'button';
      button.addEventListener('click', () => moveArea5Overland(direction));
      overlandControls.appendChild(document.createTextNode(' '));
      overlandControls.appendChild(button);
    }
    overland.appendChild(overlandControls);
    screen.appendChild(overland);
  }

  // C2 — the live ECL event line: each area's Gen2 script is run through the engine VM on entry,
  // and the events it fires (file loads, intro text) are summarised here. Empty when ECL.GLB absent.
  const eclLine = el('div', 'gb-note', ecl ? 'Entering area… (running its ECL script)' : 'ECL.GLB not loaded — maps walk without scripted events.');
  eclLine.id = 'dqk-eclline';
  screen.appendChild(eclLine);

  // C4.1 — the per-cell event line: each step runs the area's Gen2 SearchLocation handler, which
  // fires DQK's real position-dependent events (room descriptions, ambient text, scripted fights).
  const eventLine = el('div', 'gb-note', ecl ? 'Move to trigger per-cell events (DQK dispatches them by position).' : '');
  eventLine.id = 'dqk-eventline';
  screen.appendChild(eventLine);

  // Automap — M10.S5: rendered via composeAutomapPanel/Automap (the same D1 model + compositor
  // M10.S1 gave CoK/DoK's explore.ts) through a ScreenSurface, replacing the old ad-hoc canvas-2D
  // grid. Persisted per-area (dqkAutomapStoreKey) since DQK's 20 maps are independently sized.
  const aid = el('div', 'gb-aid');
  aid.appendChild(el('div', 'gb-panel-h', 'Automap')); // live title/dims painted inside the panel itself
  const amBox = el('div', 'gb-emu');
  const automapSurface = createScreenSurface(DOS_EGA);
  automapSurface.canvas.classList.add('gb-automap');
  automapSurface.canvas.tabIndex = 0;
  amBox.appendChild(automapSurface.canvas);
  aid.appendChild(amBox);
  screen.appendChild(aid);

  const menu = el('div', 'gb-menu');
  menu.innerHTML =
    '<b>↑↓←→</b> Move/turn · pick a map above &nbsp; ' +
    'walls <span style="color:#7fd0ff">━</span> doors <span style="color:#ffce54">╴╴</span> gateways <span style="color:#74c365">╴╴</span>';
  screen.appendChild(menu);

  // C4.3 — the DQK party command bar: the shared Phase-A overlays (character sheet, spell
  // memorization, inventory, town) opened against the DQK Heroes of the Lance. Same overlays CoK/DoK
  // use; "DQK support" is the install-the-DQK-roster wiring behind these buttons (and the V/M/I/T keys).
  const cmd = el('div', 'gb-menu');
  cmd.id = 'dqk-cmdbar';
  const mkCmd = (label: string, fn: () => void): void => {
    const b = el('button', '', label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', fn);
    cmd.appendChild(b);
    cmd.appendChild(document.createTextNode(' '));
  };
  mkCmd('(V)iew party', () => openDqkOverlay('sheet'));
  mkCmd('(M)agic', () => openDqkOverlay('magic'));
  mkCmd('(I)tems', () => openDqkOverlay('items'));
  mkCmd('(T)own', () => void openDqkTown());
  mkCmd('(C)ompanion', () => openCompanion());
  screen.appendChild(cmd);

  const roster = el('div', 'gb-note', '');
  roster.id = 'dqk-roster';
  screen.appendChild(roster);

  // C3 — the DQK VGA 256-colour art preview: real BIGPIC overland pictures rendered through the
  // composited DAC (UI palette + picture palette layered). This is the HLIB TILE graphic set running
  // through the engine render pipeline, the proof DQK's own 256-colour art decodes and paints.
  let artCanvas: HTMLCanvasElement | null = null;
  if (artData) {
    const artWrap = el('div', 'gb-dqk-art');
    artWrap.appendChild(el('div', 'gb-panel-h', 'DQK VGA art — overland maps (256-colour HLIB TILE)'));
    const artLabel = el('div', 'gb-note', '');
    artLabel.id = 'dqk-artlabel';
    artWrap.appendChild(artLabel);
    artCanvas = el('canvas', 'pixelated gb-dqk-artcanvas') as HTMLCanvasElement;
    artCanvas.id = 'dqk-art';
    artCanvas.style.width = '608px'; // 304×2, integer zoom
    artCanvas.style.imageRendering = 'pixelated';
    artWrap.appendChild(artCanvas);
    const artNav = el('div', 'gb-menu');
    const prev = el('button', '', '◀ Prev') as HTMLButtonElement;
    const next = el('button', '', 'Next ▶') as HTMLButtonElement;
    prev.addEventListener('click', () => artStep(-1));
    next.addEventListener('click', () => artStep(1));
    artNav.appendChild(prev);
    artNav.appendChild(document.createTextNode(' '));
    artNav.appendChild(next);
    artWrap.appendChild(artNav);
    screen.appendChild(artWrap);
  }

  if (mountSeq !== dqkMountSeq) return 0;
  out.appendChild(screen);

  const map = maps[0].map;
  state = {
    maps, mapIndex: 0, map,
    explorer: new Explorer(map, chooseStart(map)),
    automap: restoreAutomapModel(maps[0].id, map), automapSurface, ecl, lastEcl: null,
    art: artData && artCanvas ? { ...artData, canvas: artCanvas } : null,
    areaMemory: new Map<number, number>(), encounterRoster: [], lastEvent: '',
    moncha, lastCombat: '', chrome, audio,
    area5Overland: null, area5Bridge: null,
    clockMinutes: 6 * 60, // M85.S1 — mirrors explore.ts's own dawn-start epoch (explore.ts:1728)
  };
  // C4.3 — seed the DQK Heroes of the Lance so the shared Phase-A overlays run on a DQK party
  // (install-if-empty: a real saved party is never clobbered). Then surface the roster.
  installDqkParty();
  renderRosterLine();
  // C5b-1 — arm DQK's own digitized SFX (SFXDQ.VOC) so combat plays them, platform-bound to DOS VGA.
  // gameAudio decodes its own copy of the VOC and registers the DOS-VGA platform; music stays unarmed
  // (OPL2 synthesis is C5b-2). Defensive: a fetch/decode failure just leaves the SFX set empty.
  installGameAudioSeam();
  gameAudio.setGame('dqk');
  void gameAudio.ensureLoaded().then(() => gameAudio.enterScene('explore'));
  // Step-sound dispatcher: 'door' click (DQK has a door-creak SFX) reused as a footstep proxy
  // until a dedicated footstep sample is wired. One dispatcher per mount.
  const stepSink: SoundSink = { playSlot: () => { gameAudio.playAction('door'); }, stopAll: () => {} };
  stepDispatcher = new SoundDispatcher(stepSink, 'pc');
  automapSurface.canvas.addEventListener('click', () => automapSurface.canvas.focus());
  // First-gesture one-shot: the autoplay policy requires a user gesture before we call setEnabled.
  // Wrap the keydown handler so the very first keypress arms the audio exactly once.
  let _audioOnce = false;
  dqkKeyHandler = (e: KeyboardEvent) => {
    if (!_audioOnce) {
      _audioOnce = true;
      gameAudio.setEnabled(true);
      gameAudio.enterScene('explore');
    }
    onKey(e);
  };
  window.addEventListener('keydown', dqkKeyHandler);
  // Fire the first area's ECL script on entry (C2), then paint.
  state.lastEcl = runAreaEcl(ecl, maps[0].id);
  renderEclLine();
  draw();
  runStepEvent(); // C4.1 — fire the spawn cell's SearchLocation event
  paintArt(); // C3 — paint the first DQK VGA overland picture
  automapSurface.canvas.focus();

  // Headless e2e seam.
  (window as unknown as { __dqk?: Record<string, unknown> }).__dqk = {
    mapCount: () => state?.maps.length ?? 0,
    mapIndex: () => state?.mapIndex ?? -1,
    mapName: () => state?.map.name ?? '',
    dims: () => (state ? { w: state.map.width, h: state.map.height } : null),
    cellCount: () => state?.map.cells.length ?? 0,
    selectMap: (i: number) => selectMap(i),
    getPose: () => state?.explorer.getPose(),
    move: (a: MoveAction) => applyMove(a),
    // M72.S1 — why the most recent move attempt failed (StepResult.blocked), or null, mirrors
    // explore.ts's seam.
    blocked: () => state?.lastBlocked ?? null,
    // M85.S1 — the accumulated in-game clock (StepResult.timeMinutes), mirrors explore.ts's seam
    // (explore.ts:1806-1807) — e2e can now prove DQK's clock advances on every real move.
    clockMinutes: () => state?.clockMinutes ?? 0,
    clock: () => (state ? formatGameTime(state.clockMinutes) : ''),
    // All 20 maps' dimensions — e2e asserts the variable-size set decoded.
    allDims: () => (state?.maps ?? []).map((m) => ({ id: m.id, w: m.map.width, h: m.map.height })),
    // C2 seams: the Gen2 ECL library + the last area's run summary (events fired through the VM).
    eclLoaded: () => !!state?.ecl,
    eclScriptCount: () => state?.ecl?.idToMember.size ?? 0,
    lastEcl: () => (state?.lastEcl ? { ...state.lastEcl } : null),
    // Run a specific area's ECL script and return its summary (e2e drives a known scripted area).
    runEcl: (areaId: number) => (state ? runAreaEcl(state.ecl, areaId) : null),
    // C4.2b-2b-2c-iii(b) seams: the live per-cell event text + a one-off SearchLocation run for an
    // arbitrary area+cell — the descriptor is read from the GEO backdrop plane (e2e drives DQK area
    // 30/4 to prove cell-descriptor-dispatched events fire). `searchByDesc` seeds [0x002d] directly.
    lastEvent: () => state?.lastEvent ?? '',
    searchAt: (areaId: number, x: number, y: number) => {
      if (!state?.ecl) return '';
      const block = state.ecl.blockSourceById(areaId);
      if (!block) return '';
      return inspectSearchLocationOnly(block, areaId, cellDescFor(areaId, x, y), 'south');
    },
    searchByDesc: (areaId: number, cellDesc: number) => {
      if (!state?.ecl) return '';
      const block = state.ecl.blockSourceById(areaId);
      if (!block) return '';
      return inspectSearchLocationOnly(block, areaId, cellDesc, 'south');
    },
    // Static direct-entry inspection only: proves the browser host receives the real area-67 WHO
    // prompt as a typed pause. Native confirmation and the resulting explorer transition remain
    // separate evidence dependencies, so this seam intentionally has no choose/advance method.
    inspectArea67Who: () => inspectArea67Who(),
    // C4.2b-2b-2c-i — run ONLY the per-step vmRun1 main loop for an area+position and report it
    // reached an in-range handler and terminated cleanly (e2e proves the new primitive is wired and
    // runs across real DQK areas without throwing). `ran` = vmRun1 handler existed; `roster` = its
    // queued fight size (0 under naive seeding, which is the safe expected baseline).
    vmRun1At: (areaId: number, x: number, y: number): { ran: boolean; roster: number } => {
      if (!state?.ecl) return { ran: false, roster: 0 };
      const block = state.ecl.blockSourceById(areaId);
      if (!block) return { ran: false, roster: 0 };
      try {
        const runner = dialogueForVmRun1(block, {
          dialect: ECL_GEN2,
          memory: new Map<number, number>(),
          seedMemory: dqkVmRun1Seed(cellDescFor(areaId, x, y), 'south', areaId),
        });
        if (!runner) return { ran: false, roster: 0 };
        const { roster } = drainRunner(runner);
        return { ran: true, roster: roster ? roster.reduce((s, g) => s + Math.max(1, g.count), 0) : 0 };
      } catch {
        return { ran: false, roster: 0 };
      }
    },
    // Area 5 is exposed separately from the GEO walker. This seam is deliberately a raw vmRun
    // host check, not a claim that the later CampInterrupted combat bridge has been completed.
    area5OverlandStart: () => startArea5Overland(),
    area5OverlandPose: () => state?.area5Overland?.getPosition() ?? null,
    area5OverlandMove: (direction: DqkArea5TravelDirection) => moveArea5Overland(direction),
    area5Bridge: () => state?.area5Bridge ?? null,
    area5Memory: (address: number) => state?.area5Overland?.memory.get(address & 0xffff) ?? null,
    area5CampInterruptedAvailable: () => !!state?.area5Overland?.beginCampInterrupted(dqkPartyStrengthEstimate()),
    save: () => dqkQuickSave(),
    load: () => dqkQuickLoad(),
    // M82.S1 — the live party-power scalar now fed to PARTYSTRENGTH (0x1d)'s IF_GE gate (areas
    // 18/23's real wandering-encounter check), so e2e can prove it's real and non-zero, not the
    // engine's permanent 0 default.
    partyStrength: () => dqkPartyStrengthEstimate(),
    // C4.2 seams: the decoded DQK bestiary + the shared interactive combat overlay.
    monchaLoaded: () => !!state?.moncha,
    monchaTotal: () => state?.moncha?.total ?? 0,
    monchaDecoded: () => state?.moncha?.decoded ?? 0,
    // C4.2b — the full bestiary roster (names for all 98 members; stats only where hasStats).
    monchaNamed: () => state?.moncha?.named ?? 0,
    monsterNames: () => (state?.moncha?.roster ?? []).map((e) => e.name),
    bestiaryRoster: () =>
      (state?.moncha?.roster ?? []).map((e) => ({ i: e.memberIndex, name: e.name, type: e.typeByte, stats: e.hasStats, cat: e.category })),
    statMonsterNames: () => (state?.moncha?.monsters ?? []).map((m) => m.name),
    // C4.2b-2b-1 — roster category breakdown (monster-framed vs character/NPC-framed records).
    bestiaryCategories: () => {
      const c: Record<string, number> = {};
      for (const e of state?.moncha?.roster ?? []) c[e.category] = (c[e.category] ?? 0) + 1;
      return c;
    },
    // C5b-2c — gameAudio wiring: assert the audio engine is enabled and in the explore scene.
    audioEnabled: () => gameAudio.isEnabled,
    audioScene: () => gameAudio.currentScene,
    // C5a — the decoded DQK AdLib music + OPL2 timbre bank (containers; synthesis is C5b).
    audioLoaded: () => !!state?.audio,
    audioSongFiles: () => (state?.audio?.songs ?? []).map((s) => s.name),
    audioTotalNotes: () => (state?.audio?.songs ?? []).reduce((n, s) => n + s.notes, 0),
    audioBankInstruments: () => state?.audio?.bankInstruments ?? 0,
    audioSongSummaries: () =>
      (state?.audio?.songs ?? []).map((s) => ({
        name: s.name, songs: s.songCount, timbres: s.timbres, events: s.events, notes: s.notes, bpm: s.tempoBpm,
      })),
    // C5b-1 — the digitized SFX decoded from SFXDQ.VOC (the 13 named DQK effects) + a play probe.
    sfxNames: () => state?.audio?.sfxNames ?? [],
    sfxCount: () => state?.audio?.sfxNames.length ?? 0,
    // gameAudio armed the DOS-VGA platform with these effects; expose its view + an action trigger.
    gameSfxNames: () => gameAudio.sfxNames(),
    playSfx: (action: 'melee' | 'arrow' | 'cast' | 'fireball' | 'death' | 'door' | 'miss') => gameAudio.playAction(action),
    // C5b-2a — drive the pure-TS OPL2 voice from a real INSTR.AD timbre: render a note offline and
    // report it is voiced (rms) at a pitch (hz). The proof the 12-byte operator map is pinned.
    previewOplNote: (patchNum: number, midiNote: number) => previewOplNote(patchNum, midiNote),
    // C5b-2b-1 — render a full ADDQ song to a PCM mixdown via the 9-channel OPL2 mixer and report
    // its structural stats (length, polyphony ≤ 9, voiced across the timeline, percussion track).
    previewDqkSong: (fileIndex: number) => previewDqkSong(fileIndex),
    // C5b-2b-2b — decode the in-engine SOUNDS.GLB DIG4 SFX bank and report its structure (13 named
    // effects, header sample-rate buckets, centred 8-bit PCM). Proof the new digitized decoder works.
    previewDigSfx: () => previewDigSfx(),
    // Combat roster the cell queues (size), without launching — lets e2e locate a fighting cell.
    combatRosterAt: (areaId: number, x: number, y: number) => {
      if (!state?.ecl) return 0;
      const block = state.ecl.blockSourceById(areaId);
      if (!block) return 0;
      const ev = fireSearchLocation(block, areaId, cellDescFor(areaId, x, y), 'south', new Map<number, number>());
      return ev.roster ? ev.roster.reduce((s, g) => s + Math.max(1, g.count), 0) : 0;
    },
    // Fire a cell's SearchLocation and route any queued fight into the shared overlay (returns true
    // if a fight launched). With no cell given, launches a scripted fight vs the decoded bestiary.
    launchDqkCombatAt: (areaId: number, x: number, y: number) => {
      if (!state?.ecl) return false;
      const block = state.ecl.blockSourceById(areaId);
      if (!block) return false;
      const ev = fireSearchLocation(block, areaId, cellDescFor(areaId, x, y), 'south', new Map<number, number>());
      return launchDqkCombat(ev.roster, areaId, x, y, ev.runner, ev.afterCombat, ev.setup, ev.surprise, FACING_NUM.south);
    },
    testDqkFight: () => launchDqkCombat(null, state?.maps[state.mapIndex].id ?? 0, 0, 0),
    // C4.2b-2b-2c-iv — browser proof that DQK's vmRun1/SearchLocation-style host callback resumes
    // the paused combat runner with the actual overlay outcome, then continues post-combat work.
    testDqkScriptOutcomeFight: () => launchDqkCombat(
      null,
      state?.maps[state.mapIndex].id ?? 0,
      0,
      0,
      dqkOutcomeResumeProbeRunner(),
      () => 'DQK-POST-SEARCHLOCATION',
    ),
    // Real shipped DQK ECL: area 66 subroutine 0x8398 queues five LOAD_MONSTER groups, then Gen2
    // short-form PARLAY, then COMBAT. This proves the browser can launch from decoded shipped script
    // data; the normal SearchLocation gate into this subroutine is still tracked in research.
    testDqkArea66ScriptedFight: () => {
      const ev = fireArea66ScriptedCombat();
      return launchDqkCombat(ev.roster, 66, 0, 0, ev.runner, undefined, ev.setup, ev.surprise, FACING_NUM.south);
    },
    testDqkArea66ScriptedRoster: () => {
      const ev = fireArea66ScriptedCombat();
      return ev.roster ? ev.roster.map((g) => ({ monsterId: g.monsterId, count: g.count, picBlockId: g.picBlockId })) : [];
    },
    combatOpen: () => isCombatOpen(),
    closeCombat: () => closeCombat(),
    lastCombat: () => state?.lastCombat ?? '',
    // C4.3 seams: the DQK party on the shared Phase-A overlays (character sheet / magic / items / town).
    installParty: (force = false) => installDqkParty(force).map((p) => p.name),
    partyNames: () => getParty().map((p) => p.name),
    partyClasses: () => getParty().map((p) => classLabel(p.classes)), // M52.S1 coherence check
    partySize: () => getParty().length,
    chromeLoaded: () => !!(state?.chrome.frameTiles || state?.chrome.font),
    openSheet: () => openDqkOverlay('sheet'),
    openMagic: () => openDqkOverlay('magic'),
    openItems: () => openDqkOverlay('items'),
    openTown: () => openDqkTown(),
    sheetOpen: () => isSheetOpen(),
    magicOpen: () => isMagicOpen(),
    itemsOpen: () => isInventoryOpen(),
    closeSheet: () => closeCharSheet(),
    closeMagic: () => closeMagic(),
    closeItems: () => closeInventory(),
    // C3 seams: the DQK VGA art set (real 256-colour HLIB TILE pictures + composited DAC).
    artLoaded: () => !!state?.art,
    artFrameCount: () => state?.art?.frames.length ?? 0,
    artIndex: () => state?.art?.index ?? -1,
    artDims: () => {
      if (!state?.art) return null;
      const im = state.art.frames[state.art.index];
      return { w: im.width, h: im.height };
    },
    artPaletteColors: () => (state?.art ? definedColorCount(state.art.palette) : 0),
    artStep: (delta: number) => artStep(delta),
    // Distinct colours in the painted canvas — proves the 256-colour art actually rendered.
    artDistinctColors: () => {
      if (!state?.art) return 0;
      const ctx = state.art.canvas.getContext('2d');
      if (!ctx) return 0;
      const { width, height } = state.art.canvas;
      if (width === 0 || height === 0) return 0;
      const data = ctx.getImageData(0, 0, width, height).data;
      const set = new Set<number>();
      for (let i = 0; i < data.length; i += 4) set.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      return set.size;
    },
    // M10.S5 — the live D1 Automap model, fed by real walking through dqkExplore's own step loop
    // (mirrors explore.ts's M10.S1 seam). e2e drives move()/selectMap() and asserts visitedCount
    // grows / isVisited flips true for the walked path.
    automapVisitedCount: () => state?.automap.visitedCount ?? 0,
    automapIsVisited: (x: number, y: number) => state?.automap.isVisited(x, y) ?? false,
    // M10.S5 — opens the in-play Companion panel host on the live DQK session; window.__companion
    // then drives the open overlay. openCompanion() rebuilds the source fresh from live state every
    // call, so pose/HP/bestiary are current. Databases' Monsters tab lists moncha.monsters (the
    // real full-stat subset); Items is empty (DQK has no safely-derivable item names yet).
    openCompanion: (tab?: CompanionTab) => { openCompanion(tab); return isCompanionOpen(); },
    companionOpen: () => isCompanionOpen(),
    // R4 — `?dqk=quest` (Phase A): the [0x0187] bit-0x20 QUEST leg, areas 55 <-> 54. `startQuest()`
    // drives BOTH arms (flag-clear: fresh memory, house chains to 55; flag-set: the full end-to-end
    // walk through Hamhand and back) and returns a summary of both. `memory()`/`lastChain()`/
    // `lastTexts()` read arm A's final persistent state (the second house visit, post-flag-set).
    startQuest: () => runDqkQuest(),
    memory: (address: number) => dqkQuestMemory?.get(address & 0xffff) ?? null,
    lastChain: () => dqkQuestLastChain,
    lastTexts: () => dqkQuestLastTexts,
  };
  (window as unknown as { __rendered: number }).__rendered = map.cells.length;
  return map.cells.length;
}

/**
 * `?dqk=quest` — boots the DQK dungeon exactly as `?dqk=1` does, then runs BOTH arms of the
 * [0x0187] bit-0x20 QUEST leg and renders the result where a person can read it.
 *
 * Disclosure, per this round's plan: the Hamhand HORIZONTAL_MENU is answered by the route's own
 * `autoInput` (BE FRIENDLY, index 0) rather than by a live menu the player clicks. That is the
 * seam-driven `resume(0)` the plan allowed, and it is why this panel says "auto-answered" on its
 * face instead of quietly presenting the result as hand-played. Everything else — the flag write,
 * the chain targets, the street step and both texts — is the real ECL running over retail bytes.
 */
export async function startDqkQuest(assetSource?: AssetSource): Promise<number> {
  closeDungeon3d();
  const cells = await startDqkExplore(assetSource);
  const out = document.querySelector('#output') as HTMLElement | null;
  const res = runDqkQuest();
  if (!out) return cells;

  const panel = el('div', 'dqk-quest-panel');
  if (!res) {
    panel.innerHTML =
      '<h2>QUEST leg unavailable</h2><p>Areas 54/55 were not found in this ECL archive.</p>';
    out.appendChild(panel);
    setStatus('DQK quest leg: areas 54/55 not present.');
    return cells;
  }

  const yes = (b: boolean) => (b ? '✓' : '✗');
  panel.innerHTML =
    '<h2>The Hamhand house — <code>[0x0187]</code> bit 0x20</h2>' +
    '<p style="color:#9aa">Both arms run over the retail ECL for areas 54 and 55. The Hamhand ' +
    'menu answer (BE FRIENDLY) is <strong>auto-answered</strong> by this route, not clicked.</p>' +
    '<table class="import-table"><tbody>' +
    `<tr><td>Flag clear: house chains to area</td><td>${res.armB.chain ?? '—'} ${yes(res.armB.chain === 55)}</td></tr>` +
    `<tr><td>Flag clear: selector <code>[0x018D]</code></td><td>${res.armB.selector ?? '—'} ${yes(res.armB.selector === 1)}</td></tr>` +
    `<tr><td>Hamhand scene chains back to area</td><td>${res.armA.hamhandChain ?? '—'} ${yes(res.armA.hamhandChain === 54)}</td></tr>` +
    `<tr><td>Flag after BE FRIENDLY</td><td>0x${(res.armA.flagAfterHamhand ?? 0).toString(16)} ${yes(res.armA.flagAfterHamhand === 0x20)}</td></tr>` +
    `<tr><td>Flag set: house chains to</td><td>${res.armA.finalChain ?? 'nothing'} ${yes(res.armA.finalChain === null)}</td></tr>` +
    `<tr><td>Flag set: text</td><td>${res.armA.finalTexts.join(' / ') || '—'}</td></tr>` +
    '</tbody></table>';
  out.appendChild(panel);
  setStatus(
    `DQK quest leg: flag ${res.armA.flagAfterHamhand === 0x20 ? 'set' : 'NOT set'}, ` +
      `house now ${res.armA.finalChain === null ? 'empty and dark' : `chaining to ${res.armA.finalChain}`}.`,
  );
  return cells;
}
