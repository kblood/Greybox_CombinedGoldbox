/**
 * Full-game flow (A6.3) — `?play=cok` stitches the standalone slices into one continuous session,
 * the way an actual play session runs: the Champions of Krynn **title sequence** → **character
 * creation** → the **dungeon**, where the party loop is explore ↔ combat ↔ camp ↔ town, and **save**
 * is the Encamp verb that writes the quick slot.
 *
 * Each phase is a *real* mount of the existing view (`startIntro` / `startCreate` / `startExplore` /
 * `startTown`) — this module owns only the transitions between them, plus a `window.__play` seam so
 * the headless e2e can walk the whole chain end to end (advance the intro → build a party → begin →
 * fight → camp → visit town → return → save). A returning player (a party already in the roster) skips
 * creation and drops straight into the dungeon, exactly like loading a campaign.
 *
 * The explore-internal loop (random encounters → combat overlay, Encamp → rest/save, character/magic
 * screens) and the platform-bound in-game audio (A6.2) all come along for free, since this reuses the
 * very same view mounts the standalone routes use.
 */
import { closeDungeon3d } from './dungeon3dHost.js';
import { startIntro } from './intro.js';
import { startExplore, type ExploreStartOptions } from './explore.js';
import { startTown } from './town.js';
import { startMainMenu } from './mainMenu.js';
import { startDemo } from './demo.js';
import { startTitleMenu } from './titleMenu.js';
import { partySize } from './party.js';
import type { AssetSource } from './assetSource.js';

export type PlayPhase = 'intro' | 'titleMenu' | 'demo' | 'menu' | 'create' | 'explore' | 'town';

let phase: PlayPhase = 'intro';
let playAssetSource: AssetSource | undefined;

function setPhase(p: PlayPhase): void {
  phase = p;
}

/** Enter the dungeon (the heart of the play loop: explore ↔ combat ↔ camp ↔ save). */
async function enterExplore(opts?: ExploreStartOptions): Promise<void> {
  setPhase('explore');
  history.replaceState(null, '', '?play=cok');
  // The fallen-party boundary returns through the real main menu of this session (no circular import).
  await startExplore('cok', playAssetSource, { ...opts, onReturnToMenu: () => { void enterMenu(); } });
}

/** Visit the town hub (shop / temple / training / tavern), then return to the dungeon on demand. */
async function enterTown(): Promise<void> {
  setPhase('town');
  history.replaceState(null, '', '?play=cok');
  await startTown('cok', undefined, playAssetSource);
}

/**
 * Show the original main game menu (the party-formation / startup screen), the hub of a real session.
 * Begin Adventuring carries the party into the dungeon; the menu owns Create / View / Load itself.
 */
async function enterMenu(): Promise<void> {
  setPhase('menu');
  await startMainMenu({ route: '?play=cok', assetSource: playAssetSource,
    onBegin: (opts) => { void enterExplore(opts); } },
    'Champions of Krynn — muster your party, then Begin Adventuring.');
}

/** The title's "Play Demo": run the attract sequence; any key ends it back on the title menu. */
async function enterDemo(): Promise<void> {
  setPhase('demo');
  await startDemo({ route: '?play=cok', assetSource: playAssetSource,
    onExit: () => { void enterTitleMenu(); } });
}

/**
 * The title's real "Play"/"Demo" prompt (`titleMenu.ts`, byte-verified `START.EXE:0x21e`) — shown
 * after the boot title frames, before the main menu. Play continues to the real game menu; Demo
 * (hotkey, or the idle timeout) launches the attract sequence. Replaces the prior placeholder (a
 * hidden `D` keypress during the title frames).
 */
async function enterTitleMenu(): Promise<void> {
  setPhase('titleMenu');
  startTitleMenu({ route: '?play=cok', onPlay: () => { void enterMenu(); }, onDemo: () => { void enterDemo(); } });
}

/** After the title screens the original game shows its real Play/Demo prompt, then its main menu. */
async function afterIntro(): Promise<void> {
  await enterTitleMenu();
}

/**
 * Boot the stitched `?play=cok` session. Returns 1 once the title sequence is mounted (or has been
 * skipped because TITLE.DAX isn't served — in which case the flow advances straight on).
 */
export async function startPlay(assetSource?: AssetSource): Promise<number> {
  closeDungeon3d();
  playAssetSource = assetSource;
  setPhase('intro');
  installPlaySeam();
  await startIntro(() => { void afterIntro(); }, { assetSource });
  (window as unknown as { __rendered: number }).__rendered = 1;
  return 1;
}

/** Install the headless e2e seam (idempotent). Survives across the per-phase view mounts. */
export function installPlaySeam(): void {
  (window as unknown as { __play?: Record<string, unknown> }).__play = {
    phase: () => phase,
    partySize: () => partySize(),
    // The title's real Play/Demo prompt (titleMenu.ts) — the post-intro hub before the main menu.
    toTitleMenu: () => enterTitleMenu(),
    // The title's Play Demo (attract auto-walk; any key returns to the title menu).
    toDemo: () => enterDemo(),
    // Jump to the main menu (skips the title prompt).
    toMenu: () => enterMenu(),
    // Begin Adventuring straight into the dungeon (guarded: needs a mustered party).
    begin: () => { if (partySize() > 0) void enterExplore(); },
    // The explore ↔ town round-trip the play loop owns (town's own Esc goes to the wilderness).
    toTown: () => enterTown(),
    toExplore: () => enterExplore(),
  };
}
