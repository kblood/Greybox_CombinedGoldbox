/**
 * ECL inspector (D4, `?ecl=1`) — a live debugger for a Krynn-Gen1 event-script VM. It loads a
 * real `ECL*.DAX` block, disassembles it (engine `disassembleEclBlock`, under the dialect the
 * selected game key pins — see {@link GAMES}), and drives an `EclVm` one instruction at a time.
 * The emulated 320×200 EGA page (engine `composeEclInspector`) shows the disassembly listing
 * with the current program-counter row highlighted, plus a state panel: PC, step count, run
 * status, the six COAB compare flags, GOSUB call depth, and a couple of watched memory cells.
 *
 * S single-steps; R runs to the next pause/chain/exit then resets; N loads the next ECL block.
 * Mirrors the HUD/CharEditor panels (load chrome → screen surface → keydown → `window.__ecl`
 * e2e seam) so it slots into the same sidebar/route pattern.
 *
 * Game-key parametrization (R6, 2026-09-03): originally CoK-only. `startEclInspector(gameKey,
 * assetSource)` now also opens Buck Rogers: Countdown to Doomsday's own `ecl1.dax` under
 * `ECL_GEN1_BUCK` (`tools/map_buck_ecl_dispatch.py`'s binary-verified dialect — see
 * `docs/engine/research/buck-ecl-dispatch-map.md`). Buck's DOS install is external and never
 * vendored into the repo (unlike CoK's bundled `Champions of Krynn/` folder), so it has no
 * `assetUrl()` fallback path; it can only be opened via a Library-entry `AssetSource` pointing at
 * the user's own copy (same pattern as `explore.ts`/`dqkExplore.ts`/`wilderness.ts`). Chrome
 * assets (8X8D tiles/font) stay CoK-only and degrade gracefully to `null` for Buck exactly as
 * they already do on any fetch failure — `loadChrome()` was not changed. Wiring the actual
 * `?ecl=buck` URL route into `main.ts` is out of scope for this round (see the plan).
 *
 * Round 31 update: that last sentence is stale — `?ecl=buck` IS wired in `main.ts`, and this
 * round adds a third key, `matrix`, for Buck Rogers: Matrix Cubed's own `ECL1.DAX` under
 * `ECL_GEN1_MATRIX` (derived from Matrix's own `FBOV` overlay in round 31 and measured
 * field-for-field identical to `ECL_GEN1_BUCK`, which is why it is a separate constant rather
 * than a reuse — see the deep-equal pins in `packages/engine/test/matrixEclDialect.test.ts`).
 */
import {
  readDaxDataBlocks,
  decode8x8dBlock,
  loadCokFont,
  makeEgaPalette,
  DOS_EGA,
  disassembleEclBlock,
  walkEclReachable,
  triageDesyncSites,
  histogramDesyncTriage,
  type EclReachabilityResult,
  formatInstruction,
  EclVm,
  ECL_GEN1,
  ECL_GEN1_BUCK,
  ECL_GEN1_MATRIX,
  composeEclInspector,
  ECL_INSPECTOR_LIST_ROWS,
  type EclBlock,
  type EclDisasmLine,
  type EclDialect,
  type IndexedImage,
  type BitmapFont,
  type Palette,
} from '@goldbox/engine';
import { assetUrl } from './catalog.js';
import { basenameOf, type AssetSource } from './assetSource.js';
import { el } from './render.js';
import { createScreenSurface, type ScreenSurface } from '@goldbox/ui-kit';

const EGA_PALETTE: Palette = makeEgaPalette();
const TILES_PATH = 'Champions of Krynn/8X8D1.DAX';
const FRAME_BLOCK = 202;

/** A game the inspector knows how to open, keyed the way `?ecl=<key>` will eventually read it. */
export type EclInspectorGameKey = 'cok' | 'buck' | 'matrix';

interface GameConfig {
  /** Repo-relative path used with `assetUrl()` when no `AssetSource` is supplied. */
  eclPath: string;
  /** Basename used to look the file up in a Library entry's `AssetSource` (case-insensitive). */
  eclBasename: string;
  dialect: EclDialect;
  /** Blocks worth opening. For CoK, 18 is the hand-verified golden block.
   *
   * For Buck, these are blocks that actually DISASSEMBLE — measured per block, not assumed.
   * An earlier draft of this table listed 17, 18, 64, 80 and 94 as "measured to exist across its
   * own ecl1.dax". That was wrong twice over: 64/80/94 live in ecl4/ecl5/ecl6 and are not in
   * ecl1.dax at all, and all five are entries in `buckEclDialect.test.ts`'s DESYNC sample — a
   * list of blocks that fail to decode had been read as a list of blocks that exist. Opening the
   * inspector on them showed a one-instruction stub.
   *
   * Measured across Buck's ecl1..ecl6 under `ECL_GEN1_BUCK`: **21 of 25** blocks disassemble to a
   * clean terminating EXIT and 4 desync (ecl1#17@0xec, ecl1#18@0x395, ecl6#94@0x50, ecl6#99@0x2c0).
   * Both of ecl1.dax's blocks are still in that desync set, which is why this points at ecl2.dax
   * instead: its four blocks all terminate cleanly.
   *
   * Those numbers are `buckEclDialect.test.ts`'s, not a recount: it hard-pins
   * `loadBuckBlocks().length` at 25 and the census at `{desync: 4, cleanExit: 21, ranOffEnd: 0}`.
   * This comment said "17 of 24" until an audit read the test instead of the prose, then "18 of
   * 25" until round 29 moved the census itself; quote the pinned census, do not re-derive it.
   *
   * Round 29 attributed 6 of the original 7 desync sites to a single cause: dispatcher opcode
   * `0x4c` (handler `GAME.OVR:0x363b`), one of eleven Buck-only entries beyond Gen1's 0x00-0x40
   * ceiling. Closing it resynced three blocks outright and unmasked later stops in three more.
   * Worth knowing before anyone "improves" this: the operand widths come from each handler's own
   * prefetch, NOT from what makes the corpus decode. For both swept opcodes the corpus prefers a
   * different value than the binary states — `0x4c` at its binary-verified 2 leaves 4 desyncs
   * where a corpus fit would pick 0 and leave 1, and `0x43`'s binary-verified 1 is tied for the
   * WORST value swept — and the binary was taken anyway, exactly as it was for `0x21`.
   *
   * The remaining 4 desyncs are a real gap, and two of them (ecl6#94, ecl6#99) are deliberately
   * left UNATTRIBUTED rather than guessed at. Round 30 tried to close them and FAILED, on purpose:
   * the three opcodes whose word set could not be read from their own handler (`0x29`, `0x2c`,
   * `0x42`) all stop at far calls into relocated segments, and resolving those needs a
   * `seg:off -> file offset` mapping. That mapping was calibrated on Curse of the Azure Bonds
   * first, where an oracle names the real target of every call, and the best of nine candidate
   * multipliers landed **9 of 103** calls — under the round's own >= 10 bar, and its winning
   * constant did not generalize. So the census is UNCHANGED at 4, no address from that attempt was
   * written into the dialect, and the negative was landed instead
   * (`docs/engine/research/buck-ecl-desyncs.md`, dated section; `tools/buck_far_targets.py`).
   *
   * Round 31 (2026-09-03) PARTIALLY RETRACTS that negative's FRAMING, not its arithmetic. The
   * linear fit really does land 9 of 103 with a 0-of-10 holdout; what round 30 never tried is the
   * non-linear resolver `tools/vroomm_layout.py` already carried for stub-owned far calls. That
   * descriptor/public-stub geometry, calibrated on the same CoAB oracle (`0x4c:0x2a` lands exactly
   * on `0x810a`; 229 of 240 distinct stub-routed targets land on real oracle function starts,
   * against a shifted null of 1/0/0/0 at +-1/+-16 bytes AND a uniform-random null averaging 0.72
   * hits that never exceeded 6 in 3000 trials), resolves **3 of the 7** blocking targets:
   * `0xb8:0x7f -> 0x1e0f2`, `0xb8:0xb6 -> 0x1e98e`, `0x10f:0x4d -> 0x2d9cd`. Scope that to those
   * seven targets: Buck's binary has 16 distinct unresolved segments overall.
   *
   * The census is STILL 4, and that is the point worth keeping. An address you can name is not an
   * address you have read. The ECL program-counter global was identified as `0x3be2` from the
   * operand parser's own body, and a bounded 31-node walk of every resolvable callee of `0x29`,
   * `0x2c` and `0x42` found zero touches of it and zero calls to the parser — but every chain
   * bottoms out in unread resident code (first blocker `0x129:0x72`), so all three verdicts stay
   * `unknown (resident callee unread)` and no dialect entry moved.
   * Round 30 did land one opcode on evidence: `0x31 SHORT_MENU` (wordSet 2, countAt 1), which is
   * the only Buck override this round added and is not marked `uncertain`. This is now disclosed where the support page reads:
   * round 29 gave Buck the capability ledger's twelfth profile, whose `ecl` entry carries these
   * numbers. (Two earlier versions of this comment were wrong about that: one cited "the ledger's
   * Buck `scripting` entry", which never existed and could not — the ledger's vocabulary uses
   * `ecl` — and the next correctly said Buck had no profile at all, which was true until now.)
   * Of the dialect's own overrides only `0x0c` is reached by this corpus, twice; every other
   * watched override still zero times, so the table's authority remains the binary. */
  blockIds: number[];
  missingMessage: string;
}

const GAMES: Record<EclInspectorGameKey, GameConfig> = {
  cok: {
    eclPath: 'Champions of Krynn/ECL1.DAX',
    eclBasename: 'ECL1.DAX',
    dialect: ECL_GEN1,
    blockIds: [18, 34, 80, 97, 68],
    missingMessage: 'ECL1.DAX not present — inspector needs the CoK data.',
  },
  buck: {
    // Buck has no in-repo directory and no GOG release: its DOS install is external and
    // never vendored, so this is the absolute-path convention `buck-rogers-countdown-to-doomsday.json`
    // and the rest of the Buck routes already use. `assetUrl()` routes absolute paths through
    // `externalAssetPathFor` in prod and `/@fs` in dev. A Library-picked folder still overrides it
    // via the `AssetSource` argument.
    eclPath: 'D:/Games/Emulator/DOS/GoldBox/BuckRogers1-CountdownToDoomsday/ecl2.dax',
    eclBasename: 'ecl2.dax',
    dialect: ECL_GEN1_BUCK,
    blockIds: [32, 33, 34, 35],
    missingMessage:
      'ecl2.dax not present — Buck Rogers is an external, never-vendored install; open it from ' +
      'the Library with a picked folder so the inspector can read the real file.',
  },
  matrix: {
    // Matrix Cubed is the 1992 sequel. Like Countdown it has no GOG release; unlike Countdown its
    // DOS install was extracted once (round 30, `tools/matrix_cubed_extract.py`) into git-ignored
    // `matrixcubed_extracted/` UNDER THE REPO ROOT, and nothing auto-extracts. So this path is
    // repo-relative, byte-for-byte the same string `buck-rogers-matrix-cubed.json` uses for its own
    // `ECL1 (event scripts)` row — NOT the absolute `D:` convention Countdown needs. A first draft
    // wrote `C:/Modding/GoldBox/matrixcubed_extracted/...` reasoning that it was "the same
    // convention every other Buck route uses"; it is not. An absolute path goes through the dev
    // server's local-game bridge, whose allowlist is `D:\Games` and the GOG root, and the route
    // 403'd. Repo-relative goes through `/@fs` in dev and the already-bundled
    // `assets/matrixcubed_extracted/...` copy in prod, which is how the manifest reaches the same
    // file. A Library-picked folder still overrides it via the `AssetSource` argument.
    eclPath: 'matrixcubed_extracted/BuckRogers2/c/Matrix/ECL1.DAX',
    eclBasename: 'ECL1.DAX',
    // ECL_GEN1_MATRIX was derived in round 31 from Matrix's OWN `GAME.OVR` (an `FBOV` overlay,
    // not Countdown's `TPOV`) and came back field-for-field identical to ECL_GEN1_BUCK. It is
    // wired here as its own constant rather than reusing Buck's, so that if the two ever diverge
    // this route follows Matrix's evidence and not its sibling's.
    dialect: ECL_GEN1_MATRIX,
    // MEASURED, not guessed. A first draft of this line said [1, 2, 3, 4] — and block 1 is one
    // of Matrix's four desyncs (stops at 0x66e) while blocks 3 and 4 do not exist in ECL1.DAX at
    // all. That is precisely the error the Buck comment above records (a desync list read as an
    // existence list), reproduced within one round of it being written down. These four are the
    // first four of the 29 that disassemble to a clean terminating EXIT, and
    // `matrixEclDialect.test.ts` pins that every id offered here is in that clean set.
    blockIds: [2, 16, 17, 19],
    missingMessage:
      'ECL1.DAX not present — Matrix Cubed is an external, never-vendored install; extract it ' +
      'with tools/matrix_cubed_extract.py or open it from the Library with a picked folder.',
  },
};

interface InspectorState {
  surface: ScreenSurface;
  frameTiles: IndexedImage[] | null;
  font: BitmapFont | null;
  game: EclInspectorGameKey;
  config: GameConfig;
  assetSource: AssetSource | null;
  blockIdx: number; // index into the actually-present block list
  blockIds: number[]; // present block ids in this ECL file
  blockId: number;
  raw: Uint8Array | null;
  disasm: EclBlock | null;
  /** Round 33 R1: the deep, all-entries reachability walk beside the shallow disassembly. */
  reach: EclReachabilityResult | null;
  vm: EclVm | null;
  steps: number;
  status: string;
  effect: string;
}

let state: InspectorState | null = null;

function setStatus(msg: string): void {
  const s = document.querySelector('#status') as HTMLElement | null;
  if (s) { s.textContent = msg; s.className = 'status'; }
}

/** Build the windowed disassembly listing, marking the current PC row. */
function buildLines(): EclDisasmLine[] {
  if (!state?.disasm || !state.vm) return [];
  const all = state.disasm.instructions;
  const curVaddr = state.vm.vaddr;
  let cur = all.findIndex((i) => i.vaddr === curVaddr);
  if (cur < 0) cur = 0;
  // Window the list so the current row stays visible.
  const rows = ECL_INSPECTOR_LIST_ROWS;
  let start = Math.max(0, cur - Math.floor(rows / 2));
  start = Math.min(start, Math.max(0, all.length - rows));
  return all.slice(start, start + rows).map((ins) => ({
    vaddr: ins.vaddr,
    text: formatInstruction(ins).replace(/^\S+\s+/, ''), // strip the leading "8014h  " address
    current: ins.vaddr === curVaddr,
    uncertain: ins.uncertain,
  }));
}

function drawScreen(): void {
  if (!state) return;
  const vm = state.vm;
  const fb = composeEclInspector({
    frameTiles: state.frameTiles,
    font: state.font,
    view: {
      title: 'ECL Inspector',
      label: `${state.game === 'buck' ? 'Buck ECL1' : 'ECL1'} #${state.blockId}`,
      lines: buildLines(),
      state: {
        vaddr: vm?.vaddr ?? 0,
        step: state.steps,
        status: state.status,
        flags: vm?.compareFlags ?? [false, false, false, false, false, false],
        callDepth: vm?.callDepth ?? 0,
        watches: vm
          ? [...vm.memory.entries()].slice(0, 3).map(([addr, value]) => ({ addr, value }))
          : [],
      },
      effect: state.effect,
      status: 'S=STEP  R=RUN/RESET  N=NEXT BLOCK  ESC=CLOSE',
    },
    menu: { items: ['Step', 'Run', 'Reset', 'Next', 'Exit'], selected: -1 },
  });
  state.surface.paint(fb, EGA_PALETTE);
}

/** Build a fresh VM for the current block. */
function resetVm(): void {
  if (!state?.raw) return;
  const dialect = state.config.dialect;
  state.disasm = disassembleEclBlock(state.raw, dialect);
  // Round 33 R1: the shallow disassembly above stops at the block's FIRST `EXIT`, so its
  // instruction count is a LOWER BOUND -- combat and event subroutines placed later in the block
  // are simply not in it. `walkEclReachable` follows every entry point and jump, and the status
  // line reports both so the inspector never presents the shallow number as the whole block.
  state.reach = walkEclReachable(state.raw, dialect);
  state.vm = new EclVm(state.raw, { dialect });
  state.steps = 0;
  state.status = 'ready';
  state.effect = '';
  drawScreen();
}

/** Single-step the VM and reflect the result on screen. */
function step(): void {
  if (!state?.vm) return;
  if (state.vm.done) { state.status = 'exited'; drawScreen(); return; }
  const r = state.vm.step();
  state.steps++;
  state.status = r.status === 'running' ? 'running' : r.status;
  if (r.chainBlockId !== undefined) state.effect = `NEWECL → block ${r.chainBlockId}`;
  else if (r.effects.length > 0) {
    const e = r.effects[r.effects.length - 1];
    state.effect = 'mnemonic' in e ? `${e.type}: ${e.mnemonic}` : e.type;
  }
  drawScreen();
}

/** Run to the next pause/chain/exit (capped so a stuck script cannot hang the UI), then re-render. */
function run(): void {
  if (!state?.vm) return;
  if (state.vm.done) { resetVm(); return; }
  let guard = 0;
  while (!state.vm.done && guard++ < 5000) {
    const r = state.vm.step();
    state.steps++;
    state.status = r.status === 'running' ? 'running' : r.status;
    if (r.status !== 'running') {
      if (r.chainBlockId !== undefined) state.effect = `NEWECL → block ${r.chainBlockId}`;
      break;
    }
  }
  drawScreen();
}

async function fetchBytes(path: string): Promise<Uint8Array | null> {
  try {
    const resp = await fetch(assetUrl(path));
    if (!resp.ok) return null;
    return new Uint8Array(await resp.arrayBuffer());
  } catch {
    return null;
  }
}

/** Read the game's ECL file — via the current Library `AssetSource` when one is set (required
 * for Buck's external, never-vendored install), falling back to the bundled repo copy
 * (`assetUrl`) otherwise, same precedence `explore.ts#readAssetBytes` uses. */
async function readEclFileBytes(config: GameConfig, assetSource: AssetSource | null): Promise<Uint8Array | null> {
  if (assetSource) {
    const bytes = await assetSource.readAsset(basenameOf(config.eclBasename));
    if (bytes) return bytes;
    return null;
  }
  return fetchBytes(config.eclPath);
}

let eclFileBlocks: Map<number, Uint8Array> | null = null;

async function loadBlock(idx: number): Promise<boolean> {
  if (!state) return false;
  if (!eclFileBlocks) {
    const bytes = await readEclFileBytes(state.config, state.assetSource);
    if (!bytes) { setStatus(state.config.missingMessage); return false; }
    eclFileBlocks = new Map(readDaxDataBlocks(bytes).map((b) => [b.blockId, b.raw]));
    state.blockIds = state.config.blockIds.filter((id) => eclFileBlocks!.has(id));
    if (state.blockIds.length === 0) state.blockIds = [...eclFileBlocks.keys()].slice(0, 5);
  }
  if (state.blockIds.length === 0) { setStatus('No ECL blocks found.'); return false; }
  const n = ((idx % state.blockIds.length) + state.blockIds.length) % state.blockIds.length;
  state.blockIdx = n;
  state.blockId = state.blockIds[n];
  state.raw = eclFileBlocks.get(state.blockId)!;
  resetVm();
  const label = state.game === 'buck' ? 'Buck ECL1' : 'ECL1';
  const shallowN = state.disasm?.instructions.length ?? 0;
  const deepN = state.reach?.reachableBytes ?? 0;
  const desyncN = state.reach?.desyncSites.length ?? 0;
  // Round 34 R1: when the deep walk stops somewhere, say WHAT KIND of edge it stopped on rather
  // than only how many times. The triage separates a stop on a GOSUB/IF fall-through from one on a
  // taken branch, which is the distinction that decides whether a site is dead bytes or a real
  // dialect gap -- round 34 measured 0 dead-fallthrough sites across 792, so a fall-through label
  // here is a signal to go looking, not a reason to dismiss it.
  let triageNote = '';
  if (state.reach && desyncN > 0) {
    const h = histogramDesyncTriage(triageDesyncSites(state.raw, state.config.dialect, state.reach.desyncSites));
    const kinds = Object.entries(h.byEdgeKind)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} x${n}`)
      .join(', ');
    triageNote = kinds ? ` [${kinds}]` : '';
  }
  setStatus(
    `Loaded ${label} block ${state.blockId} (${shallowN} instructions to first EXIT; ` +
      `${deepN} bytes reachable from all entries${desyncN ? `, ${desyncN} desync site(s)${triageNote}` : ''}). S to step.`,
  );
  return true;
}

function nextBlock(): void {
  if (!state) return;
  void loadBlock(state.blockIdx + 1);
}

export function isEclInspectorOpen(): boolean {
  return !!state && document.body.contains(state.surface.canvas);
}

export function closeEclInspector(): void {
  if (!state) return;
  window.removeEventListener('keydown', onKey);
  state = null;
  setStatus('Closed the ECL inspector.');
}

function onKey(e: KeyboardEvent): void {
  if (!state || !document.body.contains(state.surface.canvas)) return;
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  switch (e.key) {
    case 'Escape': e.preventDefault(); closeEclInspector(); return;
    case 's': case 'S': e.preventDefault(); step(); return;
    case 'r': case 'R': e.preventDefault(); run(); return;
    case 'n': case 'N': e.preventDefault(); nextBlock(); return;
  }
}

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

/** Boot the ECL inspector (`?ecl=1`, or `?ecl=buck` — see the module doc comment for the Buck
 * external-install caveat). `assetSource`, when given, is a Library entry's own picked-folder
 * reader (M7.S1 pattern); Buck has no bundled fallback and needs one to load real bytes. Returns
 * true once a block is loaded. */
export async function startEclInspector(
  gameKey: EclInspectorGameKey = 'cok',
  assetSource?: AssetSource,
): Promise<boolean> {
  const config = GAMES[gameKey];
  const out = document.querySelector('#output') as HTMLElement | null;
  const games = document.querySelector('#games');
  if (games) games.querySelectorAll('.cat-asset').forEach((n) => n.classList.remove('active'));
  if (out) out.innerHTML = '';
  setStatus('Opening the ECL inspector…');

  const { frameTiles, font } = await loadChrome();

  const screen = el('div', 'gb-screen');
  const frame = el('div', 'gb-frame');
  const emu = el('div', 'gb-emu');
  const surface = createScreenSurface(DOS_EGA);
  emu.appendChild(surface.canvas);
  frame.appendChild(emu);

  const menu = el('div', 'gb-menu');
  menu.innerHTML =
    '<b>S</b>tep · <b>R</b>un/reset · <b>N</b>ext block · <b>Esc</b> close. A live single-stepper over real CoK ECL bytecode.';
  frame.appendChild(menu);

  const bar = el('div', 'sheet-buttons');
  const mkBtn = (label: string, fn: () => void): void => {
    const b = el('button', 'gb-btn', label) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', fn);
    bar.appendChild(b);
  };
  mkBtn('▷ Step', () => step());
  mkBtn('⏩ Run', () => run());
  mkBtn('↺ Reset', () => resetVm());
  mkBtn('Next block ▶', () => nextBlock());
  mkBtn('✕ Exit', () => closeEclInspector());
  frame.appendChild(bar);

  screen.appendChild(frame);
  if (out) out.appendChild(screen);

  surface.canvas.tabIndex = 0;
  surface.canvas.addEventListener('click', () => surface.canvas.focus());
  window.addEventListener('keydown', onKey);

  eclFileBlocks = null;
  state = {
    surface, frameTiles, font,
    game: gameKey, config, assetSource: assetSource ?? null,
    blockIdx: 0, blockIds: [], blockId: 0,
    raw: null, disasm: null, reach: null, vm: null, steps: 0, status: 'ready', effect: '',
  };

  const loaded = await loadBlock(0);
  drawScreen();
  surface.refresh();

  // Headless e2e seam.
  (window as unknown as { __ecl?: Record<string, unknown> }).__ecl = {
    open: () => startEclInspector(gameKey, assetSource),
    close: () => closeEclInspector(),
    isOpen: () => isEclInspectorOpen(),
    step: () => step(),
    run: () => run(),
    reset: () => resetVm(),
    next: () => nextBlock(),
    blockId: () => state?.blockId ?? -1,
    state: () => state ? {
      blockId: state.blockId, steps: state.steps, status: state.status,
      vaddr: state.vm?.vaddr ?? 0, done: state.vm?.done ?? true,
      callDepth: state.vm?.callDepth ?? 0, flags: [...(state.vm?.compareFlags ?? [])],
    } : null,
    lines: () => buildLines(),
  };
  return loaded;
}
