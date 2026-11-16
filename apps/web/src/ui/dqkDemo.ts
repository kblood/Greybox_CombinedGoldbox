/**
 * The Dark Queen of Krynn's own attract-mode **"Demo"** — the villain-monologue script the real
 * title's `Play Demo Quit` prompt loads when Demo is selected.
 * `docs/engine/research/dqk-demo-route.md` located it by driving DQK.EXE's title form through a
 * fake-BIOS-key Unicorn trace (the same technique that proved `Play` → the real party/load form)
 * and cross-confirmed the result two independent ways: the dynamic trace's file reads AND a
 * static HLIB/ECL decode both land on the exact same pair, **`ECL.GLB` member id 7** (a complete,
 * self-contained script) and **`GEO.GLB` member id 26** — and the script's own `LOAD_FILES #26,
 * #1` instruction is the in-script source of the GEO id the trace observed independently.
 *
 * This plays back every real narration beat of that script through the engine's live
 * {@link EclVm} — the same interpreter every other DQK ECL script (dungeon, dialogue, combat
 * trigger) runs on — pacing `PRINTCLEAR`/`DELAY` exactly like CoK's own `demo.ts`. It is DQK's own
 * dragon/draconian villain addressing its followers about past defeats by "so-called champions",
 * ending in a scripted `COMBAT`.
 *
 * **Portrait `PICTURE` ids — SOLVED (2026-07-21).** DQK's Gen2 `PICTURE` id → real
 * `PICA`/`PICB`/`PICC.TLB` slot is the container's own documented set-id table
 * (`docs/hlib-format.md` §1c: a MASTER HLIB's `ptr[0]` is `WORD count` then
 * `count × {WORD id, WORD ptrIndex}`) — a table the format doc already recorded but no decoder
 * used. Parsing it directly (`parseHlibSetIdTable` + `dqkPictureSlot`, no dynamic tracing needed)
 * resolves every one of this script's 9 unique ids (239, 91, 170, 171, 149, 115, 172, 173, 90) to
 * a real 88×88 portrait: 91/90/115 → PICA, 149 → PICB, 170/171/172/173/239 → PICC. Id 239 (always
 * the FIRST `PICTURE` of each beat pair) decodes to a solid black frame — a real "fade to black"
 * transition picture, not missing data. Render-verified in
 * `packages/engine/test/_probe_dqk_picture_render.test.ts` output (dragon, human knights, a
 * bearded half-elf, a golden-haired elf woman, a kender, two armoured allies) against
 * `renders/dqk-demo-pictures/`. See `docs/engine/research/dqk-picture-id-mapping.md`.
 *
 * **Terminal `COMBAT` — duel-setup dispatch RESOLVED (2026-07-21).** DQK's `EclVm` `COMBAT` opcode
 * reads an externally-supplied `encounterRoster`, filled by `LOAD_MONSTER` opcodes.
 *
 * > **Correction (2026-08-07):** this note used to claim a live run proved **zero** `LOAD_MONSTER`
 * > opcodes were reachable in this block. That was wrong, and the cause was ours, not the game's:
 * > the Gen2 operand table had six over-wide frames that desynchronised the decode. With the table
 * > read directly out of DQK.EXE's per-handler operand prefetches, this block's own header entries
 * > reach six consecutive `LOAD_MONSTER` groups at `0x84ca..0x84f3` (ids 82/91/90/89/88/40),
 * > preceded by `CLEARMONSTERS` + `SETUP_MONSTER`, ending at `COMBAT` at `0x8500` — and the
 * > "nonlocal `GOTO` the VM can't follow" is gone too. See `ECL_GEN2` in
 * > `packages/engine/src/ecl/disassemble.ts`. The duel-setup findings below stand on their own
 * > separate evidence (a Unicorn trace of DQK.EXE's native code); which of the two paths retail
 * > actually uses for this encounter is NOT settled by that correction, so this file's rendering
 * > is unchanged.
 *
 * The duel mechanism (found by disassembling DQK.EXE's native `CALL` dispatch and
 * cross-checking it against COAB's decompiled `SetupDuel(bool)` — `docs/engine/research/
 * dqk-duel-setup-dispatch.md` has the full trace): after the first PARLAY choice, the script
 * reaches a `GOSUB` at `0x86e4` that loops, each iteration reading an
 * ECL-embedded X/Y/facing triple then issuing a native `CALL 0x0001` (`setupDuelAttack`,
 * file offset `0x0327da`). That native routine is DQK's "duel" combatant-cloning helper — the same
 * mechanic COAB's `ovr008.cs SetupDuel()` implements for training-hall class-change duels — and it
 * resolves a sprite via `es:[bx+0x3a]` off the "current record" pointer, a DGROUP lookup table
 * (file `0x6ADD8`), and a 3-arg far call to a "CPIC" combat-icon loader (the literal string lives
 * at file `0x6B1AC`; the call target itself structurally matches COAB's
 * `chead_cbody_comspr_icon(icon, count, "CPIC")`). **A live Unicorn trace of the real Demo route**
 * captured the 5 icon ids DQK's own code actually resolves at that exact instruction (0x80 ×3,
 * 0x81, 0x82, 0x86 across the observed run) — see `DEMO_DUEL_ICON_IDS` below — and every one
 * decodes to real, non-degenerate art in the GOG install's own `DISK2/CPIC.TLB` (a plain leaf
 * `TILE` library; the icon id is a direct positional index into its image list, not a set-id
 * lookup like PICA/B/C). This file renders those 5 real icons when `COMBAT` fires (`paintDuelIcons`
 * below) instead of a placeholder note. The one remaining honest gap: DQK ships no in-data species
 * *name* for a CPIC icon (only the pixel art), so the participants are shown as unlabeled combat
 * tokens — real sprite art proven from DQK's own code and data, not an invented monster roster.
 */
import { closeDungeon3d } from './dungeon3dHost.js';
import { EclVm, ECL_GEN2, decodeEclGlb, parseHlibSetIdTable, dqkPictureSlot, decodeHlib, indexedToRGBA, type EclEffect, type IndexedImage } from '@goldbox/engine';
import { el } from './render.js';
import { assetUrl } from './catalog.js';

// Literal so scripts/bundle-assets.mjs ships it (same convention as demo.ts's own ECL2_PATH).
const DQK_ECL_GLB_PATH = 'The Dark Queen of Krynn/DISK3/ECL.GLB';
/** DQK's own literal Demo entry — byte-located + cross-confirmed, see module doc. */
const DEMO_ECL_ID = 7;
// Portrait libraries the script's PICTURE ids resolve into (see module doc's "SOLVED" section).
// Literal paths so scripts/bundle-assets.mjs ships them.
const DQK_PIC_LIBS = [
  'The Dark Queen of Krynn/DISK2/PICA.TLB',
  'The Dark Queen of Krynn/DISK2/PICB.TLB',
  'The Dark Queen of Krynn/DISK2/PICC.TLB',
];
// The native "duel setup" routine's own combat-icon library (see module doc). Literal path so
// scripts/bundle-assets.mjs ships it.
const DQK_CPIC_PATH = 'The Dark Queen of Krynn/DISK2/CPIC.TLB';
/**
 * The 5 `setupDuelAttack` CPIC icon ids DQK.EXE itself resolved for this exact script, captured by
 * a live Unicorn trace watching the native routine's icon-store instruction (file `0x041a7a`) while
 * driving the real Demo route to its terminal COMBAT — NOT invented. See the module doc and
 * `docs/engine/research/dqk-duel-setup-dispatch.md` for the full trace (register dumps, repeat
 * counts, cross-checked against 2 independent script runs in the same trace).
 */
const DEMO_DUEL_ICON_IDS: readonly number[] = [0x80, 0x80, 0x82, 0x86, 0x80];

async function fetchBytes(path: string): Promise<Uint8Array> {
  const resp = await fetch(assetUrl(path));
  if (!resp.ok) throw new Error(`${path}: HTTP ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

interface Beat {
  text?: string;
  clear?: boolean;
  /** PICTURE opcode id fired on this beat (module doc's "SOLVED" section resolves it to real art). */
  pictureId?: number;
}

interface FlattenResult {
  beats: Beat[];
  /** True iff the script's own COMBAT opcode fired (see module doc's remaining honest gap). */
  combatReached: boolean;
}

/** Flatten VM effects into playback beats: PRINTCLEAR/CLEAR_BOX/DELAY pace narration, PICTURE
 * carries its id through for real rendering (see module doc), COMBAT is captured, everything
 * else (menu/call/unhandled/eclClock/…) is silently dropped — it doesn't affect the demo replay. */
function flattenEffects(effects: readonly EclEffect[]): FlattenResult {
  const beats: Beat[] = [];
  let combatReached = false;
  for (const e of effects) {
    switch (e.type) {
      case 'print':
        beats.push({ text: e.text ?? '', clear: e.clear });
        break;
      case 'clearBox':
        beats.push({ text: '', clear: true });
        break;
      case 'delay':
        beats.push({}); // a pure pacing tick, same convention as demo.ts
        break;
      case 'picture':
        beats.push({ pictureId: e.id });
        break;
      case 'combat':
        combatReached = true;
        break;
      default:
        break;
    }
  }
  return { beats, combatReached };
}

/** `PICTURE` id → real 88×88 portrait, resolved via each library's own set-id table (module doc's
 * "SOLVED" section; `docs/hlib-format.md` §1c). Built once per demo start from whichever of
 * PICA/PICB/PICC.TLB fetched successfully — a missing library just means its ids stay unresolved
 * (best-effort, mirrors this file's other asset loads). */
class DqkPictureIndex {
  private readonly libs: Uint8Array[];
  private readonly tables: Map<number, number>[]; // per-lib id -> setPtrIndex
  private readonly cache = new Map<number, IndexedImage | null>();

  constructor(libs: Uint8Array[]) {
    this.libs = libs;
    this.tables = libs.map((bytes) => {
      try {
        return parseHlibSetIdTable(bytes);
      } catch {
        return new Map<number, number>();
      }
    });
  }

  /** Resolve a PICTURE id to a decoded image, or null if not found in any loaded library. */
  resolve(id: number): IndexedImage | null {
    if (this.cache.has(id)) return this.cache.get(id)!;
    let image: IndexedImage | null = null;
    for (let i = 0; i < this.libs.length; i++) {
      const setPtrIndex = this.tables[i].get(id);
      if (setPtrIndex === undefined) continue;
      try {
        const slot = dqkPictureSlot(this.libs[i], setPtrIndex);
        if (slot) { image = slot.image; break; }
      } catch {
        // fall through — try the next library
      }
    }
    this.cache.set(id, image);
    return image;
  }
}

/** Best-effort load of the three portrait libraries the demo's PICTURE ids resolve into. Never
 * throws — a fetch failure just means those ids stay unresolved (narration still plays). */
async function loadPictureIndex(): Promise<DqkPictureIndex> {
  const results = await Promise.allSettled(DQK_PIC_LIBS.map(fetchBytes));
  const libs = results.filter((r): r is PromiseFulfilledResult<Uint8Array> => r.status === 'fulfilled').map((r) => r.value);
  return new DqkPictureIndex(libs);
}

/**
 * `CPIC.TLB` combat-icon id → real 24×24-ish icon art, resolved by DIRECT positional index into
 * the library's own image list (module doc: `CPIC.TLB` is a plain leaf `TILE` container, unlike
 * PICA/B/C's nested master-with-set-id-table shape — an id `n` decodes to that container's `n`-th
 * pointer, label `img{n}`). Used only for the native `setupDuelAttack` icon ids this file already
 * knows (`DEMO_DUEL_ICON_IDS`) — best-effort, mirrors `DqkPictureIndex`. */
class DqkDuelIconIndex {
  private readonly byLabel = new Map<string, IndexedImage>();

  constructor(cpicBytes: Uint8Array | null) {
    if (!cpicBytes) return;
    try {
      const arch = decodeHlib(cpicBytes, 'CPIC');
      for (const im of arch.images) this.byLabel.set(im.label, im.image);
    } catch {
      // leave the index empty — resolve() below just returns null for every id
    }
  }

  resolve(id: number): IndexedImage | null {
    return this.byLabel.get(`img${String(id).padStart(3, '0')}`) ?? null;
  }
}

/** Best-effort load of the native duel-setup routine's own CPIC combat-icon library. Never throws
 * — a fetch failure just means the duel icons stay unresolved (the text note still plays). */
async function loadDuelIconIndex(): Promise<DqkDuelIconIndex> {
  try {
    return new DqkDuelIconIndex(await fetchBytes(DQK_CPIC_PATH));
  } catch {
    return new DqkDuelIconIndex(null);
  }
}

export interface DqkDemoHooks {
  /** Where to go when the demo ends (default: nothing — caller decides). */
  onExit?: () => void;
  /** History route to keep while the demo runs (default `?demo=dqk`). */
  route?: string;
}

interface DqkDemoState {
  timer: number | null;
  beats: Beat[];
  beatIdx: number;
  combatReached: boolean;
  combatNoteShown: boolean;
  text: string;
  textEl: HTMLElement;
  box: HTMLElement;
  hooks: DqkDemoHooks;
  /** Portrait resolver (module doc's "SOLVED" section) — null libraries just resolve nothing. */
  pictures: DqkPictureIndex;
  /** Where the current portrait (if any) is painted; hidden while no picture is showing. */
  artCanvas: HTMLCanvasElement;
  /** Last picture id actually painted (for the headless e2e seam / stats). */
  lastPictureId: number | null;
  /** Duel-icon resolver (module doc's duel-setup section) — empty index just resolves nothing. */
  duelIcons: DqkDuelIconIndex;
  /** Where the 5 real `setupDuelAttack` CPIC icons are painted when COMBAT fires. */
  duelCanvas: HTMLCanvasElement;
  /** True once the duel icons have actually been painted (headless e2e seam / stats). */
  duelIconsShown: boolean;
}

let state: DqkDemoState | null = null;

function setStatus(msg: string): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (s) { s.textContent = msg; s.className = 'status'; }
}

export function isDqkDemoPlaying(): boolean {
  return state !== null;
}

/** Snapshot of the real script's progress — proof it's playing decoded content, not a placeholder. */
export function dqkDemoStats(): { beatsPlayed: number; text: string; combatReached: boolean; lastPictureId: number | null; duelIconsShown: boolean } {
  return {
    beatsPlayed: state?.beatIdx ?? 0,
    text: state?.text ?? '',
    combatReached: state?.combatReached ?? false,
    lastPictureId: state?.lastPictureId ?? null,
    duelIconsShown: state?.duelIconsShown ?? false,
  };
}

/** Paint a resolved portrait to the demo's art canvas, or hide it when the beat has none. */
function paintPicture(image: IndexedImage | null): void {
  if (!state) return;
  const canvas = state.artCanvas;
  if (!image || !image.palette) {
    canvas.style.display = 'none';
    return;
  }
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const rgba = indexedToRGBA(image, image.palette);
  const id = ctx.createImageData(image.width, image.height);
  id.data.set(rgba);
  ctx.putImageData(id, 0, 0);
  canvas.style.display = '';
}

/** Paint the 5 real `setupDuelAttack` CPIC icons (module doc) side by side onto the demo's duel
 * canvas. Any id that fails to resolve (e.g. CPIC.TLB didn't load) just leaves a gap — best-effort,
 * same convention as `paintPicture`. Hides the canvas entirely if nothing resolved. */
function paintDuelIcons(index: DqkDuelIconIndex): void {
  if (!state) return;
  const canvas = state.duelCanvas;
  const images = DEMO_DUEL_ICON_IDS.map((id) => index.resolve(id));
  const resolved = images.filter((im): im is IndexedImage => im !== null);
  if (resolved.length === 0) {
    canvas.style.display = 'none';
    return;
  }
  const gap = 4;
  const w = images.reduce((sum, im) => sum + (im ? im.width : 0) + gap, 0) - gap;
  const h = Math.max(...resolved.map((im) => im.height));
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let x = 0;
  for (const image of images) {
    if (image && image.palette) {
      const rgba = indexedToRGBA(image, image.palette);
      const id = ctx.createImageData(image.width, image.height);
      id.data.set(rgba);
      ctx.putImageData(id, x, h - image.height);
      x += image.width + gap;
    } else {
      x += gap * 4; // small placeholder gap for an unresolved icon
    }
  }
  canvas.style.display = '';
}

export function stopDqkDemo(): void {
  if (!state) return;
  if (state.timer !== null) { window.clearInterval(state.timer); state.timer = null; }
  window.removeEventListener('keydown', onKey, true);
  document.removeEventListener('click', onClick, true);
  state.box.remove();
  const hooks = state.hooks;
  state = null;
  hooks.onExit?.();
}

function onKey(e: KeyboardEvent): void {
  if (!state) return;
  if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
  e.preventDefault();
  e.stopPropagation();
  stopDqkDemo();
}

function onClick(e: MouseEvent): void {
  if (!state) return;
  e.preventDefault();
  e.stopPropagation();
  stopDqkDemo();
}

const COMBAT_DUEL_NOTE =
  '[The script calls for a live battle here. DQK sets it up with its native "duel" routine, not ' +
  'ECL LOAD_MONSTER data — a live trace of the real game caught the exact 5 combat-icon sprites it ' +
  'resolves for this script, shown below. DQK ships no in-data species name for these icons, only ' +
  'the art, so they are unlabeled combat tokens rather than named monsters. ' +
  'Press any key to return to the title.]';

/** One tick: play the next queued narration beat (painting any resolved portrait), or show the
 * duel-setup note + real CPIC icons once the script is drained and COMBAT fired. */
function tick(): void {
  if (!state) return;
  if (state.beatIdx < state.beats.length) {
    const beat = state.beats[state.beatIdx++]!;
    if (beat.pictureId !== undefined) {
      state.lastPictureId = beat.pictureId;
      paintPicture(state.pictures.resolve(beat.pictureId));
      return;
    }
    if (beat.clear) state.text = beat.text ?? '';
    else if (beat.text) state.text += (state.text ? ' ' : '') + beat.text;
    state.textEl.textContent = state.text;
    return;
  }
  if (state.combatReached && !state.combatNoteShown) {
    state.combatNoteShown = true;
    state.text += (state.text ? '\n\n' : '') + COMBAT_DUEL_NOTE;
    state.textEl.textContent = state.text;
    paintDuelIcons(state.duelIcons);
    state.duelIconsShown = true;
  }
}

/**
 * Boot DQK's real attract demo: decode `ECL.GLB` member 7 and run it through the live `EclVm`.
 * Overlays on whatever `intro.ts`/`dqkTitleMenu.ts` left on screen (the DQK title art); each real
 * `PICTURE` beat now paints its resolved portrait over that art (module doc's "SOLVED" section).
 */
export async function startDqkDemo(hooks: DqkDemoHooks = {}): Promise<number> {
  closeDungeon3d();
  stopDqkDemo(); // never stack two demos
  history.replaceState(null, '', hooks.route ?? '?demo=dqk');
  setStatus('The Dark Queen of Krynn — demo. Press any key to continue.');

  let eclGlb: Uint8Array;
  try {
    eclGlb = await fetchBytes(DQK_ECL_GLB_PATH);
  } catch (err) {
    setStatus(`Could not load the demo script: ${err instanceof Error ? err.message : String(err)}`);
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const ecl = decodeEclGlb(eclGlb, 'ECL.GLB');
  const block = ecl.blockSourceById(DEMO_ECL_ID);
  if (!block) {
    setStatus(`Could not find the demo script (ECL.GLB id ${DEMO_ECL_ID}).`);
    (window as unknown as { __rendered: number }).__rendered = 0;
    return 0;
  }

  const vm = new EclVm(block, { dialect: ECL_GEN2 });
  const allEffects: EclEffect[] = [];
  let res = vm.run();
  allEffects.push(...res.effects);
  // The script opens with a PARLAY menu (HAUGHTY/SLY/NICE/MEEK/ABUSIVE) before any narration —
  // auto-answer with the first choice (same "always pick the first option" convention as the
  // rest of this project's auto-played demos) and keep resuming until a non-input pause.
  for (let guard = 0; guard < 12 && res.status === 'awaiting-input'; guard++) {
    res = vm.resume(0);
    allEffects.push(...res.effects);
  }
  const flat = flattenEffects(allEffects);
  // Best-effort: a missing/failed PIC/CPIC library just leaves those ids unresolved (playback continues).
  const pictures = await loadPictureIndex();
  const duelIcons = await loadDuelIconIndex();

  document.querySelectorAll('.gb-intro-hint, .gb-dqk-demo-gap, .gb-title-menu').forEach((n) => n.remove());
  const host = (document.querySelector('#output .gb-frame') as HTMLElement | null)
    ?? (document.querySelector('#output') as HTMLElement | null)
    ?? document.body;

  const box = el('div', 'gb-menu gb-dqk-demo');
  const artCanvas = el('canvas', 'gb-dqk-demo-art') as HTMLCanvasElement;
  artCanvas.style.display = 'none';
  box.appendChild(artCanvas);
  const textEl = el('div', 'gb-dlg-stage');
  box.appendChild(textEl);
  const duelCanvas = el('canvas', 'gb-dqk-demo-duel') as HTMLCanvasElement;
  duelCanvas.style.display = 'none';
  box.appendChild(duelCanvas);
  const banner = el('div', 'gb-title-menu-hint', 'DEMO — real decoded ECL.GLB #7 · press any key to stop');
  box.appendChild(banner);
  host.appendChild(box);

  state = {
    timer: null, beats: flat.beats, beatIdx: 0, combatReached: flat.combatReached,
    combatNoteShown: false, text: '', textEl, box, hooks, pictures, artCanvas, lastPictureId: null,
    duelIcons, duelCanvas, duelIconsShown: false,
  };

  window.addEventListener('keydown', onKey, true);
  document.addEventListener('click', onClick, true);
  state.timer = window.setInterval(tick, 650);

  // Headless e2e seam.
  (window as unknown as { __dqkDemo?: Record<string, unknown> }).__dqkDemo = {
    isPlaying: () => isDqkDemoPlaying(),
    step: () => tick(),
    stats: () => dqkDemoStats(),
    exit: () => stopDqkDemo(),
  };
  (window as unknown as { __rendered: number }).__rendered = 1;
  return 1;
}
