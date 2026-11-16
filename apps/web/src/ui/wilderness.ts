/**
 * Wilderness / overland travel view (A5.1, `?wild=1`) — walk the party across a top-down regional
 * map drawn the original Gold Box way: the engine `composeWildernessScreen` paints the whole 320×200
 * EGA screen (region name, terrain-coloured area map, party marker, info panel, command bar) into one
 * indexed framebuffer that a `ScreenSurface` resolves through the EGA palette at the correct 4:3
 * aspect. Arrow keys step the party tile-to-tile; each step passes in-game time (the clock + moons
 * advance), and the engine's wandering-monster check can drop the party straight into the live
 * tactical combat overlay (`launchCombat`). Stepping onto a named site announces an arrival.
 *
 * The travel logic + screen are pure engine code (`world/wilderness.ts`, `render/wildernessScreen.ts`);
 * this controller only owns the demo region, the running clock, asset loading, input, and the
 * `window.__wild` seam headless e2e drives.
 */
import {
  readDaxDataBlocks,
  decode8x8dBlock,
  loadCokFont,
  makeEgaPalette,
  DOS_EGA,
  WildernessTravel,
  buildCoabWildernessCombatMap,
  coabWildernessCombatHostFromArea1,
  decodeCoabArea1HostState,
  decodeCoabSavgamaArea1HostState,
  patchCoabSavgamaArea1HostState,
  wildernessFromAscii,
  composeWildernessScreen,
  partyCombatant,
  addnd1e,
  Rng,
  formatGameTime,
  formatTimeOfDay,
  gameDayFromMinutes,
  moonPhasesForDay,
  TERRAIN,
  type WildernessMap,
  type WildDir,
  type WildTileView,
  type WildernessView,
  type Combatant,
  type PartyMemberSpec,
  type IndexedImage,
  type BitmapFont,
  type Palette,
  type MoonReading,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import type { AssetSource } from './assetSource.js';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';
import { partyCombatants, partySize } from './party.js';
import { launchCombat, isCombatOpen, closeCombat } from './combat.js';

const EGA_PALETTE: Palette = makeEgaPalette();
const TILES_PATH = 'Champions of Krynn/8X8D1.DAX';
const COK_SAVGAMA_PATH = 'Champions of Krynn/SAVE/SAVGAMA.DAT';
const FRAME_BLOCK = 202;

/** The travel command bar (original-style verbs). */
const WILD_MENU = ['Move', 'Look', 'Camp', 'Map', 'Exit'] as const;

// M62.S1 — block 202's moon-phase discs (tiles 26..37), same asset explore.ts's own moon overlay
// slices out via extractMoonTiles(). wilderness.ts's own loadChrome() keeps frameTiles unsliced, so
// this offset locates the same 12 tiles within the full block instead of a pre-sliced array.
const MOON_TILE_SLICE_START = 26;
const MOON_TILE_BASE: Record<MoonReading['robe'], number> = { red: 0, white: 4, black: 8 };
const MOON_PHASE_TILE: Record<string, number> = {
  lowSanction: 0,
  waxing: 1,
  highSanction: 2,
  waning: 3,
};

/** The three moons (block-202 phase discs) for the current wilderness day, in MOON_COLUMNS order
 * [Lunitari(red), Solinari(white), Nuitari(black)] — mirrors explore.ts's own compositorMoons(),
 * unsliced since wilderness.ts's frameTiles keeps the full block. */
function wildernessMoons(): (IndexedImage | null)[] {
  const tiles = state?.frameTiles;
  if (!tiles || tiles.length < 38) return [];
  const byRobe = new Map(moonPhasesForDay(gameDayFromMinutes(state!.clockMinutes)).map((m) => [m.robe, m]));
  return (['red', 'white', 'black'] as const).map((robe) => {
    const m = byRobe.get(robe);
    if (!m) return null;
    return tiles[MOON_TILE_SLICE_START + MOON_TILE_BASE[robe] + (MOON_PHASE_TILE[m.phase] ?? 0)] ?? null;
  });
}

/**
 * A hand-authored demo region (original content — no copyrighted map data). A road runs west→east
 * across a vale: the party starts at a western keep, passes plains and a forest, fords toward a
 * riverside town, with hills and mountains to the north and a river (impassable water) to the south.
 * Legend: `=` road · `T` town · `.` plains · `f` forest · `h` hills · `^` mountains · `~` water.
 */
function demoRegion(): WildernessMap {
  return wildernessFromAscii(
    'Vale of Solace',
    [
      '^^^hh....^^^^',
      '^hh..ffff..^^',
      'h..======...h',
      '=====f==T===.',
      '.....ff...=..',
      '~~~~....ff..~',
      '~~~~~~~~~~~~~',
    ],
    {
      start: { x: 0, y: 3 },
      locations: [
        { x: 0, y: 3, name: 'Westkeep' },
        { x: 8, y: 3, name: 'Riverside' },
      ],
    },
  );
}

/** A pregenerated party so an encounter can be fought before character creation. */
const DEMO_PARTY: PartyMemberSpec[] = [
  { id: 'p1', name: 'Sturm', classes: { fighter: 5 }, abilities: { str: 18, strPct: 75, int: 10, wis: 12, dex: 15, con: 16, cha: 13 }, hp: 44, maxHp: 44, baseAc: 2, weaponDamage: { count: 1, sides: 8, bonus: 0 } },
  { id: 'p2', name: 'Caramon', classes: { fighter: 5 }, abilities: { str: 18, strPct: 90, int: 9, wis: 10, dex: 16, con: 17, cha: 11 }, hp: 46, maxHp: 46, baseAc: 3, weaponDamage: { count: 1, sides: 8, bonus: 0 } },
  { id: 'p3', name: 'Goldmoon', classes: { cleric: 5 }, abilities: { str: 13, strPct: 0, int: 11, wis: 17, dex: 12, con: 14, cha: 16 }, hp: 30, maxHp: 30, baseAc: 4, weaponDamage: { count: 1, sides: 6, bonus: 0 } },
];

interface WildState {
  travel: WildernessTravel;
  surface: ScreenSurface;
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
  /** In-game minutes since the campaign epoch; each step adds the terrain's travel cost. */
  clockMinutes: number;
  /** Most recent status line (arrival / encounter / blocked). */
  status: string;
  /** Cursor index on the bottom command bar. */
  menuSel: number;
  /** Seed stream for spawning wandering monsters (separate from the travel encounter rolls). */
  foeSeed: number;
  /** Optional recovered CoAB wilderness-combat host context. Omit to keep the flat fallback field. */
  combatHost?: {
    /** CoAB Area1.current_city byte at offset 0x342, when decoded/verified by the host. */
    currentCity: number;
    /** Deterministic host seed for the recovered wilderness floor random passes. */
    rngSeed: number;
  };
  /** Most recent decoded native save Area1 record, including dungeon saves that cannot feed wilderness combat. */
  area1Host?: {
    source: string;
    gameArea?: number;
    area2GameArea?: number;
    offset: number;
    inDungeon: number;
    currentCity: number;
    wildernessHost: boolean;
  };
  nativeSavgama?: {
    source: string;
    bytes: Uint8Array;
  };
}

let state: WildState | null = null;

/** Build the per-tile view array (terrain + party + site flags) for the compositor. */
function buildView(): WildernessView {
  const s = state!;
  const map = s.travel.map;
  const tiles: WildTileView[] = map.tiles.map((t, i) => ({
    terrain: t.terrain,
    site: !!t.location,
    party: i === s.travel.pos.y * map.width + s.travel.pos.x,
  }));
  const here = s.travel.currentTile();
  const label = here.location ?? TERRAIN[here.terrain].label;
  return {
    areaName: map.name,
    width: map.width,
    height: map.height,
    tiles,
    party: { ...s.travel.pos },
    locationLabel: label,
    time: formatGameTime(s.clockMinutes),
    status: s.status || undefined,
  };
}

function drawScreen(): void {
  if (!state) return;
  const fb = composeWildernessScreen({
    frameTiles: state.frameTiles,
    font: state.font,
    view: buildView(),
    menu: { items: WILD_MENU, selected: state.menuSel },
    moons: wildernessMoons(), // M62.S1
  });
  state.surface.paint(fb, EGA_PALETTE);
}

function setStatus(msg: string): void {
  if (state) state.status = msg;
  const s = document.querySelector('#status') as HTMLElement | null;
  if (s) {
    s.textContent = msg;
    s.className = 'status';
  }
}

/** Spawn a small band of wandering monsters scaled by terrain danger, as plain Combatants. */
function buildWanderers(seed: number, encounterPct: number): Combatant[] {
  const rng = new Rng(seed);
  const count = 1 + rng.die(Math.max(1, Math.round(encounterPct / 8))); // tougher terrain → more foes
  const foes: Combatant[] = [];
  for (let i = 0; i < count; i++) {
    foes.push({
      id: `e${i}`,
      name: 'Goblin',
      side: 'enemy',
      hp: 5,
      maxHp: 5,
      thac0: 20,
      ac: 7,
      damage: { count: 1, sides: 6, bonus: 0 },
      xp: 20,
    });
  }
  return foes;
}

function wildernessCombatMap(): ReturnType<typeof buildCoabWildernessCombatMap> | null {
  if (!state?.combatHost) return null;
  const rng = new Rng(state.combatHost.rngSeed);
  state.combatHost.rngSeed = rng.next();
  return buildCoabWildernessCombatMap({
    currentCity: state.combatHost.currentCity,
    rng: { rollDie: (sides) => rng.die(sides) },
  });
}

function bytesFromArrayLike(raw: ArrayLike<number>): Uint8Array {
  return raw instanceof Uint8Array ? raw : Uint8Array.from(Array.from(raw, (v) => v & 0xff));
}

function applyArea1CombatHost(
  area: ReturnType<typeof decodeCoabArea1HostState>,
  source: string,
  offset: number,
  rngSeed = 0x0c0a_0001,
  gameArea?: number,
  area2GameArea?: number,
): boolean {
  if (!state) return false;
  const host = coabWildernessCombatHostFromArea1(area);
  state.area1Host = {
    source,
    ...(gameArea !== undefined ? { gameArea } : {}),
    ...(area2GameArea !== undefined ? { area2GameArea } : {}),
    offset,
    inDungeon: area.inDungeon,
    currentCity: area.currentCity,
    wildernessHost: !!host,
  };
  if (!host) {
    delete state.combatHost;
    return false;
  }
  state.combatHost = {
    currentCity: host.currentCity,
    rngSeed: rngSeed >>> 0,
  };
  return true;
}

async function readNativeSaveBytes(assetSource?: AssetSource): Promise<{ bytes: Uint8Array; source: string } | null> {
  try {
    const picked = await assetSource?.readAsset('SAVGAMA.DAT');
    if (picked) return { bytes: picked, source: 'AssetSource:SAVGAMA.DAT' };
  } catch {
    // Development may fall through to a local fixture; public builds ship no saves.
  }
  if (import.meta.env.PROD) return null;
  try {
    const resp = await fetch(assetUrl(COK_SAVGAMA_PATH));
    if (!resp.ok) return null;
    return { bytes: new Uint8Array(await resp.arrayBuffer()), source: COK_SAVGAMA_PATH };
  } catch {
    return null;
  }
}

async function loadNativeArea1Host(assetSource?: AssetSource): Promise<boolean> {
  if (!state) return false;
  const save = await readNativeSaveBytes(assetSource);
  if (!save) return false;
  try {
    const decoded = decodeCoabSavgamaArea1HostState(save.bytes);
    state.nativeSavgama = save;
    return applyArea1CombatHost(decoded.area, save.source, decoded.offset, undefined, decoded.gameArea, decoded.area2GameArea);
  } catch {
    delete state.nativeSavgama;
    delete state.area1Host;
    delete state.combatHost;
    return false;
  }
}

/** Hand a wandering encounter off to the live tactical combat overlay; control returns on dismiss. */
function fightWanderers(encounterPct: number): void {
  if (!state) return;
  const party = partySize() > 0 ? partyCombatants() : DEMO_PARTY.map((p) => partyCombatant(p, addnd1e));
  const enemies = buildWanderers(state.foeSeed, encounterPct);
  state.foeSeed = (state.foeSeed * 1664525 + 1013904223) >>> 0; // advance so each fight differs
  const combatMap = wildernessCombatMap();
  const names = new Map<string, string>();
  for (const c of [...party, ...enemies]) names.set(c.id, c.name);
  void launchCombat({
    party,
    enemies,
    seed: state.foeSeed,
    names,
    ...(combatMap ? {
      terrain: combatMap.terrain,
      backgroundIds: combatMap.backgroundIds,
      partyAnchor: combatMap.partyAnchor,
      enemyAnchor: combatMap.enemyAnchor,
    } : {}),
    intro: enemies.length === 1 ? 'A goblin ambushes the party!' : 'Wandering monsters attack!',
    day: gameDayFromMinutes(state.clockMinutes),
    onEnd: (res) => {
      setStatus(
        res.outcome === 'party' ? `⚔ Victory +${res.xpAwarded} XP — travel on.`
        : res.outcome === 'enemy' ? '⚔ The party falls in the wilderness.'
        : '⚔ The monsters flee.',
      );
      drawScreen();
    },
  });
}

/** Step the party one tile; pass time, announce arrival / blocking, and fight any wandering monsters. */
function move(dir: WildDir): void {
  if (!state) return;
  const step = state.travel.step(dir);
  if (!step.moved) {
    setStatus(step.blocked === 'impassable' ? `You cannot cross the ${TERRAIN[step.terrain].label.toLowerCase()}.` : 'The road ends here.');
    drawScreen();
    return;
  }
  state.clockMinutes += step.minutes;
  if (step.arrived) {
    setStatus(`You arrive at ${step.arrived}. It is ${formatGameTime(state.clockMinutes)}.`);
  } else {
    setStatus(`You travel into the ${TERRAIN[step.terrain].label.toLowerCase()}. It is ${formatTimeOfDay(state.clockMinutes)}.`);
  }
  drawScreen();
  if (step.encounter) {
    setStatus('⚔ Wandering monsters!');
    fightWanderers(TERRAIN[step.terrain].encounterPct);
  }
}

const KEY_DIR: Record<string, WildDir> = { ArrowUp: 'north', ArrowDown: 'south', ArrowLeft: 'west', ArrowRight: 'east' };

function onKey(e: KeyboardEvent): void {
  if (!state || !document.body.contains(state.surface.canvas)) return;
  if (isCombatOpen()) return; // the modal combat overlay owns keys while it is up
  const dir = KEY_DIR[e.key];
  if (dir) {
    e.preventDefault();
    move(dir);
  }
}

/** Decode the 8X8D frame tiles + font (best effort) so the page matches the emulated screen. */
async function loadChrome(): Promise<{ frameTiles: IndexedImage[] | null; font: BitmapFont | null }> {
  try {
    const resp = await fetch(assetUrl(TILES_PATH));
    if (!resp.ok) return { frameTiles: null, font: null };
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const blocks = new Map(readDaxDataBlocks(bytes).map((b) => [b.blockId, b.raw]));
    const frameRaw = blocks.get(FRAME_BLOCK);
    const frameTiles = frameRaw ? decode8x8dBlock(frameRaw, `8X8D1#${FRAME_BLOCK}`, { transparentMagenta: true }).tiles : null;
    return { frameTiles, font: loadCokFont(bytes) };
  } catch {
    return { frameTiles: null, font: null };
  }
}

/** Boot the wilderness travel view (`?wild=1`). Returns the region's tile count (the render marker). */
export async function startWilderness(assetSource?: AssetSource): Promise<number> {
  const out = document.querySelector('#output') as HTMLElement | null;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  closeCombat();
  if (out) out.innerHTML = '';
  setStatus('Loading overland map…');

  const { frameTiles, font } = await loadChrome();
  const map = demoRegion();
  const travel = new WildernessTravel(map, 0x0ad1);

  const screen = el('div', 'gb-screen');
  const frame = el('div', 'gb-frame');
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA);
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);

  const menu = el('div', 'gb-menu');
  menu.innerHTML =
    '<b>↑↓←→</b> Travel across the region · stepping onto a town arrives there · ' +
    'wandering monsters drop into combat. <b>Vale of Solace</b> — original demo region.';
  frame.appendChild(menu);
  screen.appendChild(frame);
  if (out) out.appendChild(screen);

  surface.canvas.tabIndex = 0;
  surface.canvas.addEventListener('click', () => surface.canvas.focus());
  window.addEventListener('keydown', onKey);

  state = {
    travel,
    surface,
    frameTiles,
    font,
    clockMinutes: 6 * 60, // 06:00, day 0
    status: `You set out from ${map.tiles[map.start.y * map.width + map.start.x]!.location ?? 'the keep'}.`,
    menuSel: 0,
    foeSeed: 0x1f00,
  };
  await loadNativeArea1Host(assetSource);
  drawScreen();
  surface.canvas.focus();

  // Headless e2e seam.
  (window as unknown as { __wild?: Record<string, unknown> }).__wild = {
    area: () => state?.travel.map.name ?? '',
    pos: () => (state ? { ...state.travel.pos } : null),
    terrain: () => state?.travel.currentTile().terrain ?? null,
    location: () => state?.travel.currentTile().location ?? null,
    // Step a direction; returns the engine WildStep so e2e can assert moved/terrain/minutes/arrival.
    travel: (dir: WildDir) => {
      if (!state) return null;
      const before = state.clockMinutes;
      const step = state.travel.step(dir);
      if (step.moved) state.clockMinutes += step.minutes;
      if (!step.moved) setStatus(step.blocked === 'impassable' ? 'Impassable.' : 'Edge of the map.');
      else if (step.arrived) setStatus(`Arrived at ${step.arrived}.`);
      drawScreen();
      const out2 = { ...step, clockBefore: before, clockAfter: state.clockMinutes };
      // If the engine rolled an encounter, fight it (mirrors the keyboard path).
      if (step.encounter) fightWanderers(TERRAIN[step.terrain].encounterPct);
      return out2;
    },
    // Guaranteed encounter → combat, to exercise the travel→combat handoff in e2e. launchCombat is
    // async (it loads combat assets), so the overlay mounts a microtask later — callers should wait
    // on combatOpen() rather than trust an immediate read. Returns true to signal it was launched.
    forceEncounter: () => {
      setStatus('⚔ Wandering monsters!');
      fightWanderers(20);
      return true;
    },
    clockMinutes: () => state?.clockMinutes ?? 0,
    clock: () => (state ? formatGameTime(state.clockMinutes) : ''),
    day: () => (state ? gameDayFromMinutes(state.clockMinutes) : 0),
    moons: () => (state ? moonPhasesForDay(gameDayFromMinutes(state.clockMinutes)) : []),
    // M62.S1 — mirrors explore.ts's own moonArt() precedent; true once the real block-202 moon
    // tiles are loaded (unsliced here, so the threshold is the full 38-tile block, not 12).
    moonArt: () => (state?.frameTiles?.length ?? 0) >= 38,
    status: () => state?.status ?? '',
    combatOpen: () => isCombatOpen(),
    closeCombat: () => closeCombat(),
    tileCount: () => state?.travel.map.tiles.length ?? 0,
    setCombatHost: (host: { currentCity?: number; rngSeed?: number } | null) => {
      if (!state) return false;
      delete state.area1Host;
      if (!host || host.currentCity === undefined) {
        delete state.combatHost;
        return true;
      }
      state.combatHost = {
        currentCity: Math.max(0, Math.min(255, Math.trunc(host.currentCity))),
        rngSeed: (host.rngSeed ?? 0x0c0a_0001) >>> 0,
      };
      return true;
    },
    setCombatHostFromArea1: (raw: ArrayLike<number>, opts?: { offset?: number; rngSeed?: number }) => {
      if (!state) return false;
      try {
        const area = decodeCoabArea1HostState(bytesFromArrayLike(raw), opts?.offset ?? 0);
        return applyArea1CombatHost(area, 'raw Area1 seam', opts?.offset ?? 0, opts?.rngSeed);
      } catch {
        delete state.area1Host;
        delete state.combatHost;
        return false;
      }
    },
    setCombatHostFromSavgama: (raw: ArrayLike<number>, opts?: { offset?: number; rngSeed?: number }) => {
      if (!state) return false;
      try {
        const decoded = decodeCoabSavgamaArea1HostState(bytesFromArrayLike(raw), opts?.offset);
        return applyArea1CombatHost(decoded.area, 'SAVGAMA seam', decoded.offset, opts?.rngSeed, decoded.gameArea, decoded.area2GameArea);
      } catch {
        delete state.area1Host;
        delete state.combatHost;
        return false;
      }
    },
    loadNativeArea1Host: () => loadNativeArea1Host(assetSource),
    setCombatHostFromNativeSavgamaPatch: (patch: {
      gameArea?: number;
      area2GameArea?: number;
      currentCity?: number;
      inDungeon?: number;
      rngSeed?: number;
    }) => {
      if (!state?.nativeSavgama) return false;
      try {
        const bytes = patchCoabSavgamaArea1HostState(state.nativeSavgama.bytes, {
          ...(patch.gameArea !== undefined ? { gameArea: patch.gameArea } : {}),
          ...(patch.area2GameArea !== undefined ? { area2GameArea: patch.area2GameArea } : {}),
          ...(patch.inDungeon !== undefined ? { inDungeon: patch.inDungeon } : {}),
          ...(patch.currentCity !== undefined ? { currentCity: patch.currentCity } : {}),
        });
        const decoded = decodeCoabSavgamaArea1HostState(bytes);
        return applyArea1CombatHost(
          decoded.area,
          `${state.nativeSavgama.source} patched`,
          decoded.offset,
          patch.rngSeed,
          decoded.gameArea,
          decoded.area2GameArea,
        );
      } catch {
        delete state.area1Host;
        delete state.combatHost;
        return false;
      }
    },
    area1Host: () => (state?.area1Host ? { ...state.area1Host } : null),
    combatHost: () => (state?.combatHost ? { ...state.combatHost } : null),
  };
  (window as unknown as { __rendered: number }).__rendered = map.tiles.length;
  return map.tiles.length;
}
