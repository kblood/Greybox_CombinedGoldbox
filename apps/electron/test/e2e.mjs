// Desktop smoke test for the Electron shell (M6.S1 / ARCHITECTURE.md §4 step 2 —
// "app boots, picks a folder, renders the same game the web shell does").
//
// Launches the built Electron app (main loads apps/web's dist-app renderer unmodified),
// attaches puppeteer-core over the Chrome DevTools Protocol, and drives the
// window.__greybox.addFromElectronFolder() seam — which goes through the REAL native
// fs seam (electronAPI.pickFolderForTest -> main process fs.readdir/fs.readFile), not a
// synthetic basename list like the browser e2e's addFromEntries(). Proves the desktop
// shell's shell-specific half (native folder access) actually reads real bytes off disk
// and that the shared Library/detection code renders the same result the web shell does.
//
//   npm run e2e
//   GB_ELECTRON_ONLY=electron-cok-retail-travel npm run e2e
// The focused CoK selector requires only CoK DOS data and the existing production build;
// it records optional Amiga/audio absences and never prepares other games' temp fixtures.
//
// Requires `apps/web` built (`pnpm build:app`) and `apps/electron` built (`pnpm build`),
// and the real "Champions of Krynn" DOS folder present in the repo (local game data).
// If either is missing, the suite reports SKIP and exits 0 so a fresh clone stays green.

import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, cpSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';

const HERE = dirname(fileURLToPath(import.meta.url));
const ELECTRON_DIR = resolve(HERE, '..');
const REPO_ROOT = resolve(ELECTRON_DIR, '..', '..');
const WEB_DIST_INDEX = process.env.GB_ELECTRON_RENDERER_ROOT
  ? resolve(process.env.GB_ELECTRON_RENDERER_ROOT, 'index.html')
  : resolve(REPO_ROOT, 'apps', 'web', 'dist-app', 'index.html');
const MAIN_ENTRY = resolve(ELECTRON_DIR, 'dist', 'main', 'index.js');
// GameAudio explicitly accepts null for these nine optional CoK Amiga audio files. Match
// the exact static-package URLs and ERR_FILE_NOT_FOUND only; image/archive failures stay fatal.
const OPTIONAL_COK_AUDIO_URLS = new Set(['krynn', 'arrow', 'hit', 'fireb', 'gate', 'swish', 'dead', 'cast2', 'tuningfork']
  .map((name) => pathToFileURL(resolve(dirname(WEB_DIST_INDEX), 'assets/amiga_extracted/ChampionsOfKrynn/disk1/Sound', name)).href));
const COK_DOS_FOLDER = resolve(REPO_ROOT, 'Champions of Krynn');
const DOK_DOS_FOLDER = resolve(REPO_ROOT, 'Death Knights of Krynn');
const POOL_DOS_FOLDER = 'C:\\Program Files (x86)\\GOG Galaxy\\Games\\Pool of Radiance\\POOLRAD';
const COAB_DOS_FOLDER = 'C:\\Program Files (x86)\\GOG Galaxy\\Games\\Curse of the Azure Bonds';
const TREASURES_DOS_FOLDER = 'C:\\Program Files (x86)\\GOG Galaxy\\Games\\Treasures of the Savage Frontier';
const FRUA_UA_ROOT = 'C:\\Program Files (x86)\\GOG Galaxy\\Games\\Unlimited Adventures';
// Secret is installed through GOG outside this source checkout (unlike the bundled
// CoK/DoK fixtures).  It remains read-only; Electron's pickFolderForTest still performs
// the real recursive native-fs acquisition from this selected user-owned folder.
const SECRET_DOS_FOLDER = 'C:\\Program Files (x86)\\GOG Galaxy\\Games\\Secret of the Silver Blades';
const DOK_AMIGA_TILES = resolve(REPO_ROOT, 'amiga_extracted', 'DeathKnightsOfKrynn', 'disk1', '8x8d1.daa');
const CDP_PORT = 9223;

// M7.S1 — a real external copy of the CoK folder (outside the repo tree, under apps/electron/tmp/
// which is gitignored) with ECL1.DAX deliberately corrupted, proving startExplore() reads THIS
// folder's own bytes via native fs — not the bundled repo copy — when booted from the Library.
// A successful dungeon load from this folder could only mean the real bundled copy was used
// instead; only a load FAILURE proves the picked folder's own (corrupted) bytes were read.
const EXTERNAL_COK_DIR = resolve(ELECTRON_DIR, 'tmp', 'external-cok-corrupt');
const EXTERNAL_DOK_DIR = resolve(ELECTRON_DIR, 'tmp', 'external-dok-selected');
const EXTERNAL_DOK_IMPORT_DIR = resolve(ELECTRON_DIR, 'tmp', 'external-dok-import-missing-dryden');
const EXTERNAL_FRUA_ITEM_DIR = resolve(ELECTRON_DIR, 'tmp', 'external-frua-item-capability');
const ELECTRON_E2E_PROFILE = resolve(ELECTRON_DIR, 'tmp', 'e2e-profile');

function makeCorruptedExternalCopy() {
  rmSync(EXTERNAL_COK_DIR, { recursive: true, force: true });
  mkdirSync(EXTERNAL_COK_DIR, { recursive: true });
  cpSync(COK_DOS_FOLDER, EXTERNAL_COK_DIR, { recursive: true });
  writeFileSync(resolve(EXTERNAL_COK_DIR, 'ECL1.DAX'), Buffer.from([0xff, 0xff, 0xff, 0xff]));
  writeFileSync(resolve(EXTERNAL_COK_DIR, '..notes.dat'), Buffer.from([1, 2, 3, 4]));
  mkdirSync(resolve(EXTERNAL_COK_DIR, 'escape-link'));
  writeFileSync(resolve(EXTERNAL_COK_DIR, 'escape-link', 'package.json'), '{}');
}

function makeSelectedDokCopy() {
  rmSync(EXTERNAL_DOK_DIR, { recursive: true, force: true });
  mkdirSync(EXTERNAL_DOK_DIR, { recursive: true });
  cpSync(DOK_DOS_FOLDER, EXTERNAL_DOK_DIR, { recursive: true });
}

function filesWithBasename(dir, basename) {
  const matches = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) matches.push(...filesWithBasename(path, basename));
    else if (entry.isFile() && entry.name.toLowerCase() === basename.toLowerCase()) matches.push(path);
  }
  return matches;
}

function makeDokImportWithoutDrydenCopy() {
  rmSync(EXTERNAL_DOK_IMPORT_DIR, { recursive: true, force: true });
  mkdirSync(EXTERNAL_DOK_IMPORT_DIR, { recursive: true });
  cpSync(DOK_DOS_FOLDER, EXTERNAL_DOK_IMPORT_DIR, { recursive: true });
  // CHRDATA1.GAM is SIR DRYDEN. The real repo fixture has both canonical SAVE/ and an independent
  // cloud_saves/SAVE corpus, so remove every duplicate basename from corrupt B. Leave every sidecar
  // and all other records intact: an authoritative selected source must import five and never blend
  // DRYDEN back from bundled assets or another recursive save set.
  for (const path of filesWithBasename(EXTERNAL_DOK_IMPORT_DIR, 'CHRDATA1.GAM')) rmSync(path, { force: true });
}

/** Build a bounded native-fs UA-root fixture with the retail HEIRS design and exact global
 * bestiary/item sources, then remove or one-byte-corrupt one item table. The real Electron folder
 * bridge reads this external tree; the source game install remains strictly read-only. */
function makeFruaItemCapabilityCopy(mode, targetName) {
  rmSync(EXTERNAL_FRUA_ITEM_DIR, { recursive: true, force: true });
  const designDir = resolve(EXTERNAL_FRUA_ITEM_DIR, 'HEIRS.DSN');
  const disk1Dir = resolve(EXTERNAL_FRUA_ITEM_DIR, 'DISK1');
  const disk2Dir = resolve(EXTERNAL_FRUA_ITEM_DIR, 'DISK2');
  mkdirSync(designDir, { recursive: true });
  mkdirSync(disk1Dir, { recursive: true });
  mkdirSync(disk2Dir, { recursive: true });
  for (const file of readdirSync(resolve(FRUA_UA_ROOT, 'HEIRS.DSN'))) {
    if (file === 'GAME001.DAT' || /^(?:GEO|MONST)\d{3}\.DAT$/i.test(file)) {
      cpSync(resolve(FRUA_UA_ROOT, 'HEIRS.DSN', file), resolve(designDir, file));
    }
  }
  cpSync(resolve(FRUA_UA_ROOT, 'DISK2', 'MONST.GLB'), resolve(disk2Dir, 'MONST.GLB'));
  for (const file of ['ITEM.DAT', 'ITEMS.DAT']) {
    if (mode === 'missing' && file === targetName) continue;
    const source = readFileSync(resolve(FRUA_UA_ROOT, 'DISK1', file));
    if (mode === 'corrupt' && file === targetName) {
      const corrupt = Buffer.from(source);
      corrupt[0] ^= 0xff;
      writeFileSync(resolve(disk1Dir, file), corrupt);
    } else {
      writeFileSync(resolve(disk1Dir, file), source);
    }
  }
}

// The `electron` package's main export is the resolved path to the platform binary
// (see node_modules/electron/index.js) — the officially blessed way to spawn it, and
// avoids relying on the pnpm .bin shim (a .CMD/.ps1 wrapper on Windows that
// child_process.spawn won't exec directly without `shell: true`).
function electronBinary() {
  const require = createRequire(import.meta.url);
  return require(resolve(ELECTRON_DIR, 'node_modules', 'electron'));
}

function childElectronEnv(enabled) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'GOLDBOX_ELECTRON_E2E'),
  );
  if (enabled) env.GOLDBOX_ELECTRON_E2E = '1';
  return env;
}

function launchOwnedElectron(profile, ephemeralCdp, e2eEnabled = true) {
  const electronEnv = childElectronEnv(e2eEnabled);
  delete electronEnv.GOLDBOX_ELECTRON_DEV_URL;
  if (process.env.GB_ELECTRON_RENDERER_ROOT) {
    electronEnv.GOLDBOX_ELECTRON_E2E_RENDERER_ROOT = resolve(process.env.GB_ELECTRON_RENDERER_ROOT);
  }
  const child = spawn(
    electronBinary(),
    [`--remote-debugging-port=${ephemeralCdp ? 0 : CDP_PORT}`, `--user-data-dir=${profile}`, '--disable-gpu', '--no-sandbox', MAIN_ENTRY],
    { cwd: ELECTRON_DIR, env: electronEnv },
  );
  let exited = false;
  let exitCode = null;
  child.on('exit', (code) => { exited = true; exitCode = code; });
  child.stderr.on('data', (chunk) => {
    const value = chunk.toString();
    if (/error/i.test(value)) process.stderr.write(`[electron] ${value}`);
  });
  return {
    child,
    pid: child.pid,
    exited: () => exited,
    exitCode: () => exitCode,
    waitForExit: (timeoutMs) => new Promise((resolve, reject) => {
      if (exited) return resolve(exitCode);
      const timer = setTimeout(() => reject(new Error(`Electron PID ${child.pid} did not exit within ${timeoutMs}ms`)), timeoutMs);
      child.once('exit', (code) => { clearTimeout(timer); resolve(code); });
    }),
  };
}

function assertRendererIndex(page, expectedIndex, launchLabel) {
  const actualPath = resolve(fileURLToPath(page.url())).toLowerCase();
  const expectedPath = resolve(expectedIndex).toLowerCase();
  assert.equal(actualPath, expectedPath,
    `${launchLabel}: renderer loaded ${actualPath}, expected candidate ${expectedPath}`);
}

async function waitForCdp(deadlineMs, port = CDP_PORT) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error(`Electron CDP endpoint did not answer on :${port} within ${deadlineMs}ms`);
}

async function waitForCdpGone(port, deadlineMs = 15000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) });
      if (!response.ok) return;
    } catch { return; }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Electron CDP endpoint :${port} remained reachable after graceful shutdown`);
}

async function waitForEphemeralCdpPort(profile, deadlineMs = 60000) {
  const deadline = Date.now() + deadlineMs;
  const activePortPath = resolve(profile, 'DevToolsActivePort');
  while (Date.now() < deadline) {
    let port;
    let targetPath;
    try {
      const [portText, activePath] = readFileSync(activePortPath, 'utf8').split(/\r?\n/);
      port = Number(portText);
      if (!Number.isInteger(port) || port <= 0 || !/^\/devtools\/browser\/[\w-]+$/.test(activePath ?? '')) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      targetPath = activePath;
    } catch { /* Chromium has not published the active port yet. */ }
    if (!port || !targetPath) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(300) });
      if (response.ok) {
        const version = await response.json();
        assert.equal(new URL(version.webSocketDebuggerUrl).pathname, targetPath,
          'DevToolsActivePort browser path does not match the live CDP endpoint');
        return { port, targetPath };
      }
    } catch (error) {
      if (error?.name === 'AssertionError') throw error;
      /* The active-port endpoint may be stale while Chromium restarts. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Electron did not publish an ephemeral DevToolsActivePort in ${profile}`);
}

/**
 * Drain the dialogue seam. `resolveCombat` decides what a `combat`-kind turn means here: callers
 * that assert on the battle themselves leave it false and get control back with the overlay still
 * open; callers that are merely walking past pass true so the battle is fought and dismissed.
 *
 * Neither branch existed before: an unhandled kind fell through both `if`s and re-pushed the same
 * text every iteration until `limit`, which is why a wedged route logged one line ~20x per step.
 */
async function drainDialogue(page, textLog = [], choose = () => 0, limit = 20, resolveCombat = false) {
  for (let guard = 0; guard < limit && (await page.evaluate('!!window.__dialogue')); guard++) {
    const turn = await page.evaluate('({ kind: window.__dialogue.kind(), text: window.__dialogue.text(), choices: window.__dialogue.choices() })');
    if (turn.text) textLog.push(turn.text);
    if (turn.kind === 'say') {
      const picked = choose(turn);
      await page.evaluate((value) => window.__dialogue.choose(value), picked);
    } else if (turn.kind === 'end') {
      await page.evaluate('window.__dialogue.close()');
    } else if (resolveCombat) {
      await page.waitForFunction('!!window.__combat', { timeout: 10000 });
      await resolveOpenCombat(page);
    } else {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function chooseDialogueLabel(page, label) {
  await page.waitForFunction('window.__dialogue?.open?.()', { timeout: 20000 });
  return page.evaluate((wanted) => {
    const turn = { text: window.__dialogue.text(), choices: window.__dialogue.choices() };
    const choice = turn.choices.findIndex((value) => value.toUpperCase() === wanted.toUpperCase());
    if (choice < 0) throw new Error(`missing dialogue choice ${wanted}: ${JSON.stringify(turn.choices)}`);
    window.__dialogue.choose(choice);
    return turn;
  }, label);
}

async function finishPoolVictory(page, takeTreasure) {
  await page.waitForFunction(
    'window.__explore.combatOpen() && window.__combat.combatants().some((actor) => actor.side === "enemy")',
    { timeout: 60000 },
  ).catch(async () => {
    if (await page.evaluate('window.__explore.combatOpen() && window.__combat.combatants().some((actor) => actor.side === "enemy")')) return;
    const state = await page.evaluate('({ pose: window.__explore?.getPose?.() ?? null, combat: window.__explore?.combatOpen?.() ?? null, enemies: window.__combat?.combatants?.().filter((actor) => actor.side === "enemy").map((actor) => actor.name) ?? [], dialogue: window.__dialogue ? { kind: window.__dialogue.kind(), text: window.__dialogue.text(), choices: window.__dialogue.choices() } : null, status: document.querySelector("#status")?.textContent ?? "" })');
    throw new Error(`Electron Pool ORC LEADER combat did not open: ${JSON.stringify(state)}`);
  });
  const enemies = await page.evaluate('window.__combat.combatants().filter((actor) => actor.side === "enemy").map((actor) => actor.name)');
  await page.evaluate('window.__combat.auto()');
  let phase = await page.evaluate('window.__combat.phase()');
  if (phase === 'continue-battle') {
    await page.evaluate('window.__combat.declineContinueBattle()');
    phase = await page.evaluate('window.__combat.acknowledgeVictory()');
  } else if (phase === 'victory') {
    phase = await page.evaluate('window.__combat.acknowledgeVictory()');
  }
  let treasure = null;
  if (phase === 'treasure') {
    treasure = await page.evaluate(`({
      summary: window.__combat.treasure(),
      names: Array.from({ length: window.__combat.treasure().itemCount }, (_, index) => window.__combat.treasureItem(index))
    })`);
    if (takeTreasure) await page.evaluate('window.__combat.takeAllTreasure()');
    await page.evaluate('window.__combat.exitTreasure()');
    if (await page.evaluate('window.__combat.treasureExitPending()')) {
      await page.evaluate('window.__combat.declineRemainingTreasure()');
    }
  }
  await page.evaluate('window.__combat.dismiss()');
  await page.waitForFunction('!window.__explore.combatOpen()', { timeout: 10000 });
  if (await page.evaluate('window.__dialogue?.kind?.() === "end"')) await page.evaluate('window.__dialogue.close()');
  return { enemies, phase, treasure };
}

async function finishCoabRouteCombat(page) {
  const names = await page.evaluate('window.__combat.combatants().filter((actor) => actor.side === "enemy").map((actor) => actor.name)');
  await page.evaluate('window.__combat.auto()');
  let phase = await page.evaluate('window.__combat.phase()');
  if (phase === 'continue-battle') {
    await page.evaluate('window.__combat.declineContinueBattle()');
    phase = await page.evaluate('window.__combat.phase()');
  }
  if (phase === 'victory') phase = await page.evaluate('window.__combat.acknowledgeVictory()');
  if (phase === 'treasure') {
    await page.evaluate('window.__combat.takeAllTreasure()');
    await page.evaluate('window.__combat.exitTreasure()');
  }
  await page.evaluate('window.__combat.dismiss()');
  await page.waitForFunction('!window.__explore.combatOpen()', { timeout: 5000 });
  if (await page.evaluate('window.__dialogue?.kind?.() === "end"')) await page.evaluate('window.__dialogue.close()');
  return names;
}

async function waitForCoabEnemyCombat(page, label) {
  const predicate = 'window.__explore.combatOpen() && window.__combat.combatants().some((actor) => actor.side === "enemy")';
  await page.waitForFunction(predicate, { timeout: 60000 }).catch(async () => {
    if (await page.evaluate(predicate)) return;
    const state = await page.evaluate('({ area: window.__explore?.currentArea?.() ?? null, pose: window.__explore?.getPose?.() ?? null, combat: window.__explore?.combatOpen?.() ?? null, enemies: window.__combat?.combatants?.().filter((actor) => actor.side === "enemy").map((actor) => actor.name) ?? [], event: window.__explore?.lastEvent?.() ?? "", dialogue: window.__dialogue ? { kind: window.__dialogue.kind(), text: window.__dialogue.text(), choices: window.__dialogue.choices() } : null, status: document.querySelector("#status")?.textContent ?? "" })');
    throw new Error(`Electron CoAB ${label} combat did not open: ${JSON.stringify(state)}`);
  });
}

async function walkAbsolute(page, directions) {
  const order = ['north', 'east', 'south', 'west'];
  for (const direction of directions) {
    const facing = (await page.evaluate('window.__explore.getPose()')).facing;
    const delta = (order.indexOf(direction) - order.indexOf(facing) + 4) % 4;
    if (delta === 1) await page.evaluate('window.__explore.move("right")');
    else if (delta === 2) {
      await page.evaluate('window.__explore.move("right")');
      await page.evaluate('window.__explore.move("right")');
    } else if (delta === 3) await page.evaluate('window.__explore.move("left")');
    await page.evaluate('window.__explore.move("forward")');
  }
}

async function walkDok(page, directions, textLog = []) {
  const order = ['north', 'east', 'south', 'west'];
  for (const direction of directions) {
    const facing = (await page.evaluate('window.__explore.getPose()')).facing;
    const delta = (order.indexOf(direction) - order.indexOf(facing) + 4) % 4;
    if (delta === 1) await page.evaluate('window.__explore.move("right")');
    else if (delta === 2) {
      await page.evaluate('window.__explore.move("right")');
      await page.evaluate('window.__explore.move("right")');
    } else if (delta === 3) await page.evaluate('window.__explore.move("left")');
    await page.evaluate('window.__explore.move("forward")');
    await drainDialogue(page, textLog, (turn) => {
      const patrol = turn.choices.indexOf('PATROL');
      if (patrol >= 0) return patrol;
      // Cekos descriptor 11 -- (10,4)/(11,4)/(11,5) in GEO1.DAX#34 -- is an OPTIONAL street brawl,
      // not the silent no-op arm gameData.ts long described it as: it unconditionally offers
      // JOIN / SNEAK PAST / LEAVE, and JOIN *and* SNEAK PAST both run
      // "THE CROWD NOTICES YOU. THEY'RE SIVAKS! THEY ATTACK!" -> LOAD_MONSTER #33,#12,#33.
      // Only LEAVE ("YOU LEAVE.") walks on. This route's target is the descriptor-12 table ambush
      // at (11,1), so decline; taking the brawl instead is what previously left the walk fighting
      // 12 SIVAKs four steps short of the real encounter.
      const leave = turn.choices.indexOf('LEAVE');
      if (leave >= 0 && /FIST FIGHT/i.test(turn.text)) return leave;
      return 0;
    }, 20, true);
  }
}

/**
 * Auto-resolve an open tactical overlay through the full retail post-combat sequence.
 * Victory does NOT land on `treasure`: it stops at the `continue-battle` prompt (which
 * defaults to NO and which `dismiss()` cannot clear, because `dismissable` is only set on
 * the non-victory path), then the victory page, and only then treasure. Handling just
 * `treasure` leaves a won battle wedged at "continue battle?" forever. Same ordering the
 * web harness uses in apps/web/test/e2e.mjs.
 */
async function resolveOpenCombat(page) {
  await page.evaluate('window.__combat.auto()');
  let phase = await page.evaluate('window.__combat.phase()');
  if (phase === 'continue-battle') {
    await page.evaluate('window.__combat.declineContinueBattle()');
    phase = await page.evaluate('window.__combat.phase()');
  }
  if (phase === 'victory') phase = await page.evaluate('window.__combat.acknowledgeVictory()');
  if (phase === 'treasure') {
    await page.evaluate('window.__combat.takeAllTreasure()');
    await page.evaluate('window.__combat.exitTreasure()');
  }
  await page.evaluate('window.__combat.dismiss()');
}

async function settleDokTravel(page, textLog = []) {
  for (let guard = 0; guard < 24; guard++) {
    // `__combat` exposes `isOverlay()`, not `open()`. The old `__combat?.open?.()` probe was
    // therefore always undefined, so this branch never ran and every battle had to be handled
    // through the dialogue arm below -- which had no `combat` case. DoK's wilderness fires
    // random encounters, so the route only passed on runs where none happened to trigger.
    if (await page.evaluate('window.__combat?.isOverlay?.() === true')) {
      await resolveOpenCombat(page);
      continue;
    }
    if (await page.evaluate('!!window.__dialogue')) {
      const turn = await page.evaluate('({ kind: window.__dialogue.kind(), text: window.__dialogue.text(), choices: window.__dialogue.choices() })');
      if (turn.text) textLog.push(turn.text);
      if (turn.kind === 'say') {
        const no = turn.choices.indexOf('NO');
        const choice = /CEKOS/i.test(turn.text) ? 0 : no >= 0 ? no : 0;
        await page.evaluate((value) => window.__dialogue.choose(value), choice);
      } else if (turn.kind === 'end') {
        await page.evaluate('window.__dialogue.close()');
      } else if (turn.kind === 'combat') {
        // The overlay lags the dialogue turn by a tick, so wait for the seam before resolving.
        await page.waitForFunction('!!window.__combat', { timeout: 10000 });
        await resolveOpenCombat(page);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
      continue;
    }
    break;
  }
}

async function driveDokSelectedCampaign(page) {
  const pictures = [];
  const text = [];
  await page.waitForFunction('!!window.__dialogue', { timeout: 60000 }).catch(async (error) => {
    const state = await page.evaluate(`({
      status: document.querySelector('#status')?.textContent ?? '',
      buttons: [...document.querySelectorAll('button')].map((button) => button.textContent?.trim() ?? ''),
      dialogue: !!window.__dialogue,
      explore: !!window.__explore,
      rendered: window.__rendered ?? null
    })`);
    throw new Error(`DoK selected-folder opening dialogue did not mount: ${error.message}; ${JSON.stringify(state)}`);
  });
  for (let guard = 0; guard < 40 && !(await page.evaluate('!!window.__combat')); guard++) {
    const turn = await page.evaluate('({ kind: window.__dialogue?.kind?.(), text: window.__dialogue?.text?.() ?? "", picture: window.__dialogue?.pictureId?.() ?? null })');
    if (turn.text) text.push(turn.text);
    if (turn.picture !== null) pictures.push(turn.picture);
    if (turn.kind === 'say') await page.evaluate('window.__dialogue.choose(0)');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await page.waitForFunction('!!window.__combat', { timeout: 60000 }).catch(async (error) => {
    const state = await page.evaluate(`({
      status: document.querySelector('#status')?.textContent ?? '',
      dialogue: window.__dialogue ? {
        kind: window.__dialogue.kind(),
        text: window.__dialogue.text(),
        choices: window.__dialogue.choices()
      } : null,
      explore: !!window.__explore,
      rendered: window.__rendered ?? null
    })`);
    throw new Error(`DoK selected-folder opening combat did not mount: ${error.message}; ${JSON.stringify(state)}`);
  });
  const openingRoster = await page.evaluate('window.__combat.combatants().filter((actor) => actor.side === "enemy").length');
  await page.evaluate('window.__combat.auto()');
  let openingCombatPhase = await page.evaluate('window.__combat.phase()');
  if (openingCombatPhase === 'continue-battle') {
    await page.evaluate('window.__combat.declineContinueBattle()');
    openingCombatPhase = await page.evaluate('window.__combat.phase()');
  }
  if (openingCombatPhase === 'victory') {
    openingCombatPhase = await page.evaluate('window.__combat.acknowledgeVictory()');
  }
  if (openingCombatPhase === 'treasure') {
    await page.evaluate('window.__combat.takeAllTreasure()');
    await page.evaluate('window.__combat.exitTreasure()');
  }
  await page.evaluate('window.__combat.dismiss()');
  // The post-opening handoff can alternate between async mount work and more
  // retail dialogue (for example the main-gate disposition prompt).  Advance
  // its documented default branch until the genuine area-36 mount is ready.
  for (let guard = 0; guard < 450 && !(await page.evaluate('window.__explore?.currentArea?.().areaId === 36')); guard++) {
    if (await page.evaluate('!!window.__dialogue')) {
      const turn = await page.evaluate('({ kind: window.__dialogue.kind(), text: window.__dialogue.text() })');
      if (turn.text) text.push(turn.text);
      if (turn.kind === 'say') await page.evaluate('window.__dialogue.choose(0)');
      else if (turn.kind === 'end') await page.evaluate('window.__dialogue.close()');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await page.waitForFunction('window.__explore?.currentArea?.().areaId === 36', { timeout: 1000 }).catch(async () => {
    if (await page.evaluate('window.__explore?.currentArea?.().areaId === 36')) return;
    const state = await page.evaluate('({ area: window.__explore?.currentArea?.() ?? null, dialogue: window.__dialogue ? { kind: window.__dialogue.kind(), text: window.__dialogue.text(), choices: window.__dialogue.choices() } : null, travel: window.__dokTravel?.open?.() ?? null, camp: window.__cokOpeningCamp?.open?.() ?? null, combat: window.__combat ? { phase: window.__combat.phase(), outcome: window.__combat.outcome() } : null, status: document.querySelector("#status")?.textContent ?? "" })');
    throw new Error(`DoK selected-folder opening did not mount area 36: ${JSON.stringify(state)}`);
  });

  await walkDok(page, ['east', 'south', 'south', 'south', 'south', 'south', 'south', 'east', 'east', 'north', 'east', 'south', 'east', 'east', 'east', 'east'], text);
  const upper = await page.evaluate(`({
    pose: window.__explore.getPose(), level: window.__explore.areaMemory(0x4c1b),
    hostX: window.__explore.areaMemory(0xc04b), hostY: window.__explore.areaMemory(0xc04c),
    hostFacing: window.__explore.areaMemory(0xc04d), hostFloor: window.__explore.areaMemory(0xc04f),
    localX: window.__explore.areaMemory(0x4c17), localY: window.__explore.areaMemory(0x4c18),
    lastEvent: window.__explore.lastEvent()
  })`);
  // Selector 15's retail host CALL supplied the first eastward square.
  await walkDok(page, ['east', 'south', 'east'], text);
  const commander = await page.evaluate('({ pose: window.__explore.getPose(), duty: window.__explore.areaMemory(0x4c0a), quest: window.__explore.areaMemory(0x4c2d), patrol: window.__explore.areaMemory(0x4cec) })');
  await walkDok(page, ['west', 'north', 'west', 'west'], text);
  const lower = await page.evaluate(`({
    pose: window.__explore.getPose(), level: window.__explore.areaMemory(0x4c1b),
    hostX: window.__explore.areaMemory(0xc04b), hostY: window.__explore.areaMemory(0xc04c),
    hostFacing: window.__explore.areaMemory(0xc04d)
  })`);
  await walkDok(page, ['south', 'south', 'south', 'east', 'south', 'south', 'east', 'east', 'east', 'west', 'east', 'west', 'east', 'west', 'east'], text);
  const ayn = await page.evaluate('({ pose: window.__explore.getPose(), visits: window.__explore.areaMemory(0x4c1a), quest: window.__explore.areaMemory(0x4c2d), alert: window.__explore.areaMemory(0x4cee) })');

  const graphics = await page.evaluate(() => {
    const pose0 = window.__explore.getPose();
    const checksum0 = window.__explore.graphicsChecksum();
    const available = window.__explore.graphicsAvailable();
    const amiga = window.__explore.setGraphicsMode('Amiga');
    const provenance = window.__explore.graphicsProvenance();
    const badge = document.querySelector('.gb-graphics-provenance')?.textContent ?? '';
    const pose1 = window.__explore.getPose();
    const dos = window.__explore.setGraphicsMode('DOS-EGA');
    const checksum2 = window.__explore.graphicsChecksum();
    return { available, amiga, dos, provenance, badge, pose0, pose1, checksum0, checksum2 };
  });

  const companion = await page.evaluate(() => {
    const pose0 = window.__explore.getPose();
    const opened = window.__explore.openCompanion();
    const tabs = {};
    window.__companion.switchTo('journal');
    tabs.journal = window.__companion.journalListedCount();
    window.__companion.switchTo('refdb');
    tabs.refdb = window.__companion.refEntryCount();
    window.__companion.switchTo('automap');
    tabs.automap = window.__companion.automapVisitedCount();
    window.__companion.switchTo('hud');
    tabs.hud = window.__companion.hudRows().length;
    window.__companion.switchTo('char');
    tabs.char = { count: window.__companion.charCount(), name: window.__companion.charName() };
    window.__companion.close();
    return { opened, tabs, pose0, pose1: window.__explore.getPose(), closed: !window.__explore.companionOpen() };
  });

  const exitFound = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes('Leave / Travel'));
    button?.click();
    return !!button;
  });
  await page.waitForFunction(() => Boolean(window.__dialogue) || Boolean(window.__dokTravel?.open?.()), { timeout: 5000 }).catch(async () => {
    const state = await page.evaluate('({ buttons: [...document.querySelectorAll("button")].map((button) => ({ text: button.textContent, disabled: button.disabled })), area: window.__explore?.currentArea?.() ?? null, dialogue: !!window.__dialogue, travel: window.__dokTravel?.open?.() ?? null, status: document.querySelector("#status")?.textContent ?? "" })');
    throw new Error(`DoK Leave / Travel did not open a transition (buttonFound=${exitFound}): ${JSON.stringify(state)}`);
  });
  const leave = await page.evaluate('window.__dialogue ? ({ text: window.__dialogue.text(), choices: window.__dialogue.choices() }) : ({ text: "", choices: [] })');
  if (await page.evaluate('!!window.__dialogue')) await page.evaluate('window.__dialogue.choose(0)');
  await page.waitForFunction('!!window.__dokTravel?.open?.()', { timeout: 60000 }).catch(async () => {
    if (await page.evaluate('!!window.__dokTravel?.open?.()')) return;
    const stalled = await page.evaluate('({ dialogue: window.__dialogue ? { kind: window.__dialogue.kind(), text: window.__dialogue.text(), choices: window.__dialogue.choices() } : null, travel: window.__dokTravel?.open?.() ?? null, area: window.__explore?.currentArea?.() ?? null, status: document.querySelector("#status")?.textContent ?? "" })');
    throw new Error(`DoK selected-folder wilderness did not open: ${JSON.stringify(stalled)}`);
  });
  const wilderness = await page.evaluate('({ picture: window.__dokTravel.pictureId(), position: window.__dokTravel.position(), quest: window.__dokTravel.memory(0x4c2d) })');
  for (let step = 0; step < 26 && (await page.evaluate('!!window.__dokTravel')); step++) {
    await page.evaluate('window.__dokTravel.move("west")');
    await settleDokTravel(page, text);
  }
  await page.waitForFunction('window.__explore?.currentArea?.().areaId === 34', { timeout: 15000 }).catch(async () => {
    if (await page.evaluate('window.__explore?.currentArea?.().areaId === 34')) return;
    const stalled = await page.evaluate('({ travel: window.__dokTravel?.position?.() ?? null, area: window.__explore?.currentArea?.() ?? null, dialogue: window.__dialogue ? { kind: window.__dialogue.kind(), text: window.__dialogue.text(), choices: window.__dialogue.choices() } : null, combat: !!window.__combat, status: document.querySelector("#status")?.textContent ?? "" })');
    throw new Error(`DoK selected-folder travel stalled: ${JSON.stringify(stalled)}`);
  });
  await drainDialogue(page, text);
  const cekos = await page.evaluate('({ area: window.__explore.currentArea(), pose: window.__explore.getPose(), quest: window.__explore.areaMemory(0x4c2d), worldX: window.__explore.areaMemory(0x4bc3), worldY: window.__explore.areaMemory(0x4bc4) })');

  await walkDok(page, ['north', 'north', 'north', 'north', 'north', 'north', 'west', 'west', 'west', 'north', 'east', 'north', 'north', 'north', 'east', 'north'], text);
  await page.waitForFunction(
    'window.__explore.combatOpen() && window.__combat.combatants().some((actor) => actor.side === "enemy")',
    { timeout: 60000 },
  ).catch(async () => {
    if (await page.evaluate('window.__explore.combatOpen() && window.__combat.combatants().some((actor) => actor.side === "enemy")')) return;
    const stalled = await page.evaluate('({ pose: window.__explore?.getPose?.() ?? null, event: window.__explore?.lastEvent?.() ?? "", combat: window.__explore?.combatOpen?.() ?? null, enemies: window.__combat?.combatants?.().filter((actor) => actor.side === "enemy").map((actor) => actor.name) ?? [], status: document.querySelector("#status")?.textContent ?? "" })');
    throw new Error(`DoK selected-folder Sivak combat did not open: ${JSON.stringify(stalled)}`);
  });
  const sivaks = await page.evaluate('window.__combat.combatants().filter((actor) => actor.side === "enemy").map((actor) => actor.name)');
  const sivakEvent = await page.evaluate('window.__explore.lastEvent()');
  await page.evaluate('window.__combat.auto()');
  let sivakCombatPhase = await page.evaluate('window.__combat.phase()');
  if (sivakCombatPhase === 'continue-battle') {
    await page.evaluate('window.__combat.declineContinueBattle()');
    sivakCombatPhase = await page.evaluate('window.__combat.phase()');
  }
  if (sivakCombatPhase === 'victory') {
    sivakCombatPhase = await page.evaluate('window.__combat.acknowledgeVictory()');
  }
  if (sivakCombatPhase === 'treasure') {
    await page.evaluate('window.__combat.takeAllTreasure()');
    await page.evaluate('window.__combat.exitTreasure()');
  }
  await page.evaluate('window.__combat.dismiss()');
  await page.waitForFunction('!window.__explore.combatOpen()', { timeout: 5000 });
  const outcome = await page.evaluate('({ flag: window.__explore.areaMemory(0x4c5f), status: document.querySelector("#status")?.textContent ?? "" })');
  await drainDialogue(page, text);

  const saved = await page.evaluate('({ pose: window.__explore.getPose(), clock: window.__explore.clockMinutes(), area: window.__explore.currentArea(), flag: window.__explore.areaMemory(0x4c5f), has: (window.__explore.save(), window.__explore.hasSave()) })');
  await walkDok(page, ['south', 'south'], text);
  const disturbed = await page.evaluate('({ pose: window.__explore.getPose(), clock: window.__explore.clockMinutes() })');
  const accepted = await page.evaluate('window.__explore.load()');
  const restored = await page.evaluate('({ pose: window.__explore.getPose(), clock: window.__explore.clockMinutes(), area: window.__explore.currentArea(), flag: window.__explore.areaMemory(0x4c5f) })');
  await walkDok(page, ['south', 'north'], text);
  // isOverlay(), not the nonexistent open() -- the old probe made `refired === false` vacuous.
  const refired = await page.evaluate('window.__combat?.isOverlay?.() === true');

  return { pictures, text, openingRoster, upper, commander, lower, ayn, graphics, companion, exitFound, leave, wilderness, cekos, sivaks, sivakEvent, outcome, saved, disturbed, accepted, restored, refired };
}

async function finishTreasuresVictory(page, waitForClosed) {
  const enemies = await page.evaluate('window.__combat.combatants().filter((actor) => actor.side === "enemy").map((actor) => actor.name)');
  await page.evaluate('window.__combat.auto()');
  const outcome = await page.evaluate('window.__combat.outcome()');
  let phase = await page.evaluate('window.__combat.phase()');
  if (phase === 'continue-battle') {
    await page.evaluate('window.__combat.declineContinueBattle()');
    phase = await page.evaluate('window.__combat.phase()');
  }
  if (phase === 'victory') phase = await page.evaluate('window.__combat.acknowledgeVictory()');
  if (phase === 'treasure') {
    await page.evaluate('window.__combat.takeAllTreasure()');
    await page.evaluate('window.__combat.exitTreasure()');
    if (await page.evaluate('window.__combat.treasureExitPending()')) {
      await page.evaluate('window.__combat.declineRemainingTreasure()');
    }
  }
  await page.evaluate('window.__combat.dismiss()');
  if (waitForClosed) await page.waitForFunction('!window.__explore.combatOpen()', { timeout: 10000 });
  return { enemies, outcome, phase };
}

async function runTreasuresSelectedFolder(page, rendererBaseUrl, errors) {
  const errorStart = errors.length;
  const route = {};
  try {
    // The browser route uses this same deterministic party. Treasures' two ordinary tactical
    // victories are intentionally much larger than the other selected-folder acceptance fights.
    await page.evaluate(() => {
      localStorage.removeItem('greybox.save.cok.quick');
      localStorage.removeItem('greybox.inventory.cok');
      const party = Array.from({ length: 6 }, (_, index) => ({
        name: `Route Keeper ${index + 1}`,
        race: 'human',
        sex: 'male',
        classes: { fighter: 20 },
        abilities: { str: 18, strPct: 100, int: 10, wis: 10, dex: 18, con: 18, cha: 10 },
        hp: 500,
        maxHp: 500,
        baseAc: -10,
        ac: -10,
        thac0: 0,
        savingThrows: { paralyzePoisonDeath: 2, petrifyPolymorph: 2, rodStaffWand: 2, breath: 2, spell: 2 },
      }));
      localStorage.setItem('greybox.party.cok', JSON.stringify(party));
    });
    // The renderer's party store initializes once at app boot. Reload after writing localStorage so
    // the selected-folder route and Companion consume this six-character roster, not the earlier
    // baseline smoke test's already-cached party snapshot.
    await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      'window.__greybox && typeof window.__greybox.addFromElectronFolder === "function"',
      { timeout: 30000 },
    );

    route.sourceA = await page.evaluate(
      (path) => window.__greybox.addFromElectronFolder(path),
      TREASURES_DOS_FOLDER,
    );
    route.selectedAFirst = await page.evaluate(() => {
      const entry = [...document.querySelectorAll('.lib-entry')]
        .find((node) => /Treasures of the Savage Frontier/i.test(node.textContent ?? ''));
      entry?.click();
      return !!entry;
    });
    await page.waitForFunction(
      `Array.from(document.querySelectorAll('#output button')).some((node) =>
        node.dataset.route === 'treasures-natural' || /Persistent two-wave Yeti route/i.test(node.textContent ?? ''))`,
      { timeout: 10000 },
    );

    // CoK deliberately overlaps Treasures' archive basenames. If source A were retargeted to the
    // later source B, this exact area-34/Yeti route could not mount from Treasures' retail bytes.
    route.sourceB = await page.evaluate(
      (path) => window.__greybox.addFromElectronFolder(path),
      COK_DOS_FOLDER,
    );
    route.reselectedA = await page.evaluate(() => {
      const entry = [...document.querySelectorAll('.lib-entry')]
        .find((node) => /Treasures of the Savage Frontier/i.test(node.textContent ?? ''));
      entry?.click();
      return !!entry;
    });
    route.selectedNatural = await page.evaluate(() => {
      const button = [...document.querySelectorAll('#output button')].find((node) =>
        node.dataset.route === 'treasures-natural' || /Persistent two-wave Yeti route/i.test(node.textContent ?? ''));
      button?.click();
      return !!button;
    });
    await page.waitForFunction(
      'window.__explore?.currentArea?.().disk === 1 && window.__explore.currentArea().areaId === 34',
      { timeout: 60000 },
    );
    route.start = await page.evaluate('({ area: window.__explore.currentArea(), pose: window.__explore.getPose() })');

    route.companion = await page.evaluate(() => {
      const pose0 = window.__explore.getPose();
      const opened = window.__explore.openCompanion();
      const tabs = {};
      window.__companion.switchTo('journal'); tabs.journal = window.__companion.journalListedCount();
      window.__companion.switchTo('refdb'); tabs.refdb = window.__companion.refEntryCount();
      window.__companion.switchTo('automap'); tabs.automap = window.__companion.automapVisitedCount();
      window.__companion.switchTo('hud'); tabs.hud = window.__companion.hudRows().length;
      window.__companion.switchTo('char'); tabs.char = window.__companion.charCount();
      window.__companion.close();
      return { opened, tabs, pose0, pose1: window.__explore.getPose(), closed: !window.__explore.companionOpen() };
    });

    const actions = [
      'right', 'right', 'forward',
      'left', 'forward',
      'forward',
      'right', 'forward',
      'forward',
      'forward',
      'forward',
      'right', 'forward',
      'left', 'forward',
    ];
    for (const action of actions) await page.evaluate((move) => window.__explore.move(move), action);
    await page.waitForFunction('window.__explore.combatOpen() && !!window.__combat', { timeout: 60000 });
    route.firstTrigger = await page.evaluate('({ pose: window.__explore.getPose(), event: window.__explore.lastEvent() })');
    route.firstVictory = await finishTreasuresVictory(page, false);

    await page.waitForFunction(`(() => {
      if (!window.__explore.combatOpen() || !window.__combat) return false;
      const names = window.__combat.combatants().filter((actor) => actor.side === 'enemy').map((actor) => actor.name);
      return names.length === 6 && names.filter((name) => name === 'YETI CHIEF').length === 2 &&
        names.filter((name) => name === 'ICE HOUND').length === 4;
    })()`, { timeout: 60000 });
    route.pending = await page.evaluate('({ minersFreed: window.__explore.areaMemory(0x022d), journalComplete: window.__explore.areaMemory(0x0232) })');
    route.secondVictory = await finishTreasuresVictory(page, true);
    await page.waitForFunction(
      'window.__explore.areaMemory(0x022d) === 1 && window.__explore.areaMemory(0x0232) === 1',
      { timeout: 10000 },
    );
    route.completed = await page.evaluate(`({
      area: window.__explore.currentArea(), pose: window.__explore.getPose(), clock: window.__explore.clockMinutes(),
      map: window.__explore.mapName, minersFreed: window.__explore.areaMemory(0x022d),
      journalComplete: window.__explore.areaMemory(0x0232), status: document.querySelector('#status')?.textContent ?? '',
      party: JSON.parse(localStorage.getItem('greybox.party.cok') || '[]'),
      inventory: JSON.parse(localStorage.getItem('greybox.inventory.cok') || '{}'), liveParty: window.__explore.party(),
    })`);
    route.saved = await page.evaluate('({ accepted: window.__explore.save(), has: window.__explore.hasSave() })');

    // Navigation recreates the renderer-owned Library. Re-scan and reselect the folder so load is
    // proven against a newly issued source capability rather than an in-memory bundled route.
    await page.evaluate(() => {
      localStorage.setItem('greybox.party.cok', '[]');
      localStorage.setItem('greybox.inventory.cok', '{}');
    });
    await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      'window.__greybox && typeof window.__greybox.addFromElectronFolder === "function"',
      { timeout: 30000 },
    );
    route.redetected = await page.evaluate(
      (path) => window.__greybox.addFromElectronFolder(path),
      TREASURES_DOS_FOLDER,
    );
    route.reclicked = await page.evaluate(() => {
      const entry = [...document.querySelectorAll('.lib-entry')]
        .find((node) => /Treasures of the Savage Frontier/i.test(node.textContent ?? ''));
      entry?.click();
      return !!entry;
    });
    route.reselectedNatural = await page.evaluate(() => {
      const button = [...document.querySelectorAll('#output button')].find((node) =>
        node.dataset.route === 'treasures-natural' || /Persistent two-wave Yeti route/i.test(node.textContent ?? ''));
      button?.click();
      return !!button;
    });
    await page.waitForFunction(
      'window.__explore?.currentArea?.().disk === 1 && window.__explore.currentArea().areaId === 34',
      { timeout: 60000 },
    );
    route.fresh = await page.evaluate(`({
      area: window.__explore.currentArea(), pose: window.__explore.getPose(), party: window.__explore.party(),
      minersFreed: window.__explore.areaMemory(0x022d), journalComplete: window.__explore.areaMemory(0x0232),
    })`);
    route.loaded = await page.evaluate('window.__explore.load()');
    route.restored = await page.evaluate(`({
      area: window.__explore.currentArea(), pose: window.__explore.getPose(), clock: window.__explore.clockMinutes(),
      minersFreed: window.__explore.areaMemory(0x022d), journalComplete: window.__explore.areaMemory(0x0232),
      party: JSON.parse(localStorage.getItem('greybox.party.cok') || '[]'),
      inventory: JSON.parse(localStorage.getItem('greybox.inventory.cok') || '{}'), liveParty: window.__explore.party(),
    })`);

    await page.evaluate('window.__explore.move("back")');
    route.offTrigger = await page.evaluate('window.__explore.getPose()');
    await page.evaluate('window.__explore.move("forward")');
    await page.waitForFunction(`(() =>
      JSON.stringify(window.__explore.getPose()) === ${JSON.stringify(JSON.stringify({ x: 7, y: 7, facing: 'south' }))} &&
      window.__explore.lastEvent() === '' && !window.__explore.combatOpen() && !window.__dialogue?.open?.()
    )()`, { timeout: 10000 });
    route.revisit = await page.evaluate(`({
      pose: window.__explore.getPose(), event: window.__explore.lastEvent(), combat: window.__explore.combatOpen(),
      dialogue: !!window.__dialogue?.open?.(), minersFreed: window.__explore.areaMemory(0x022d),
      journalComplete: window.__explore.areaMemory(0x0232),
    })`);

    const count = (names, wanted) => names.filter((name) => name === wanted).length;
    const sourceOk = route.sourceA?.ok && route.sourceA?.match?.profileId === 'treasures-of-the-savage-frontier' &&
      route.sourceA?.match?.platform === 'DOS' && route.sourceA?.fileCount > 50 && route.sourceA?.sourceId &&
      route.sourceB?.ok && route.sourceB?.match?.profileId === 'champions-of-krynn' && route.sourceB?.sourceId &&
      route.sourceA.sourceId !== route.sourceB.sourceId && route.selectedAFirst && route.reselectedA && route.selectedNatural;
    const startOk = JSON.stringify(route.start) === JSON.stringify({
      area: { disk: 1, areaId: 34 }, pose: { x: 6, y: 1, facing: 'north' },
    });
    const companionOk = route.companion?.opened && route.companion?.closed && route.companion?.tabs?.journal > 0 &&
      route.companion?.tabs?.refdb > 0 && route.companion?.tabs?.automap > 0 && route.companion?.tabs?.hud === 6 &&
      route.companion?.tabs?.char === 6 && JSON.stringify(route.companion.pose0) === JSON.stringify(route.companion.pose1);
    // These are the tactical renderer's candid six-enemy presentation caps. The engine golden
    // independently pins Treasures' full retail requests (4+14, then 2+12+one huge Yeti).
    const firstNames = route.firstVictory?.enemies ?? [];
    const secondNames = route.secondVictory?.enemies ?? [];
    const victoriesOk = JSON.stringify(route.firstTrigger?.pose) === JSON.stringify({ x: 7, y: 7, facing: 'south' }) &&
      /HORDE OF YETIS CHARGING FORWARD TO GREET YOU/i.test(route.firstTrigger?.event ?? '') &&
      firstNames.length === 6 && count(firstNames, 'YETI CHIEF') === 4 && count(firstNames, 'ICE HOUND') === 2 &&
      route.firstVictory?.outcome === 'party' && secondNames.length === 6 && count(secondNames, 'YETI CHIEF') === 2 &&
      count(secondNames, 'ICE HOUND') === 4 && route.secondVictory?.outcome === 'party' &&
      route.pending?.minersFreed === 0 && route.pending?.journalComplete === 0 &&
      route.completed?.minersFreed === 1 && route.completed?.journalComplete === 1 &&
      /MINERS, FREED FROM THEIR YETI CAPTORS/i.test(route.completed?.status ?? '');
    const redetectedOk = route.redetected?.ok && route.redetected?.match?.profileId === 'treasures-of-the-savage-frontier' &&
      route.redetected?.sourceId && route.redetected.sourceId !== route.sourceA?.sourceId && route.reclicked && route.reselectedNatural;
    const freshOk = JSON.stringify(route.fresh) === JSON.stringify({
      area: { disk: 1, areaId: 34 }, pose: { x: 6, y: 1, facing: 'north' }, party: [], minersFreed: 0, journalComplete: 0,
    });
    const persistenceOk = route.saved?.has && redetectedOk && freshOk && route.loaded === true &&
      JSON.stringify(route.restored?.area) === JSON.stringify(route.completed?.area) &&
      JSON.stringify(route.restored?.pose) === JSON.stringify(route.completed?.pose) &&
      route.restored?.clock === route.completed?.clock && route.restored?.minersFreed === 1 && route.restored?.journalComplete === 1 &&
      JSON.stringify(route.restored?.party) === JSON.stringify(route.completed?.party) &&
      JSON.stringify(route.restored?.inventory) === JSON.stringify(route.completed?.inventory) &&
      JSON.stringify(route.restored?.liveParty) === JSON.stringify(route.completed?.liveParty);
    const revisitOk = JSON.stringify(route.offTrigger) === JSON.stringify({ x: 7, y: 6, facing: 'south' }) &&
      JSON.stringify(route.revisit?.pose) === JSON.stringify({ x: 7, y: 7, facing: 'south' }) && route.revisit?.event === '' &&
      !route.revisit?.combat && !route.revisit?.dialogue && route.revisit?.minersFreed === 1 && route.revisit?.journalComplete === 1;
    return {
      id: 'electron-treasures-selected-folder',
      label: 'Electron shell: retained Treasures folder -> two Yeti victories + Companion + persistent silent revisit',
      pass: !!(sourceOk && startOk && companionOk && victoriesOk && persistenceOk && revisitOk && errors.length === errorStart),
      detail: `source=${sourceOk} start=${startOk} companion=${companionOk} victories=${victoriesOk} persistence=${persistenceOk} revisit=${revisitOk} errors=${JSON.stringify(errors.slice(errorStart))} route=${JSON.stringify(route)}`,
    };
  } catch (error) {
    return {
      id: 'electron-treasures-selected-folder',
      label: 'Electron shell: retained Treasures folder -> two Yeti victories + Companion + persistent silent revisit',
      pass: false,
      detail: `error=${error instanceof Error ? error.message : String(error)} rendererErrors=${JSON.stringify(errors.slice(errorStart))} route=${JSON.stringify(route)}`,
    };
  }
}

async function waitForDokImportCount(page, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let probe = null;
  do {
    probe = await page.evaluate(() => ({
      rendered: window.__rendered ?? null,
      seam: !!window.__importDok,
      party: window.__importDok?.party?.() ?? null,
      rejected: window.__importDok?.rejected?.() ?? null,
      status: document.querySelector('#status')?.textContent ?? '',
      output: document.querySelector('#output')?.textContent ?? '',
    }));
    if (probe.seam && probe.rendered === expected && probe.party?.length === expected) return probe;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error(`DoK import did not settle at ${expected}: ${JSON.stringify(probe)}`);
}

async function runDokSelectedFolderImport(page, rendererBaseUrl, errors) {
  const errorStart = errors.length;
  const route = {};
  try {
    makeDokImportWithoutDrydenCopy();
    await page.evaluate(() => {
      localStorage.setItem('greybox.gold.cok', '0');
      localStorage.setItem('greybox.party.cok', '[]');
      localStorage.setItem('greybox.inventory.cok', '{}');
    });
    // Reload so the party/gold stores initialize from the clean values above and the Library has
    // exactly source A then source B. The earlier native CoK baseline remains recorded separately.
    await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(
      'window.__greybox && typeof window.__greybox.addFromElectronFolder === "function"',
      { timeout: 30000 },
    );

    route.sourceA = await page.evaluate(
      (path) => window.__greybox.addFromElectronFolder(path),
      DOK_DOS_FOLDER,
    );
    route.sourceB = await page.evaluate(
      (path) => window.__greybox.addFromElectronFolder(path),
      EXTERNAL_DOK_IMPORT_DIR,
    );
    route.bMissingPrimary = filesWithBasename(EXTERNAL_DOK_IMPORT_DIR, 'CHRDATA1.GAM').length === 0;
    route.selectedB = await page.evaluate(() => {
      const entries = [...document.querySelectorAll('.lib-entry')]
        .filter((node) => /Death Knights of Krynn/i.test(node.textContent ?? ''));
      entries[1]?.click();
      return entries.length === 2;
    });
    await page.waitForFunction(
      `Array.from(document.querySelectorAll('#output button')).some((node) =>
        node.dataset.route === 'dok-import' || /Import selected save party.*DQK/i.test(node.textContent ?? ''))`,
      { timeout: 10000 },
    );
    route.importedB = await page.evaluate(() => {
      const button = [...document.querySelectorAll('#output button')].find((node) =>
        node.dataset.route === 'dok-import' || /Import selected save party.*DQK/i.test(node.textContent ?? ''));
      button?.click();
      return !!button;
    });
    route.brokenProbe = await waitForDokImportCount(page, 5, 20000);
    route.broken = await page.evaluate(() => ({
      rendered: window.__rendered,
      party: window.__importDok.party(),
      rejected: window.__importDok.rejected(),
      stipend: window.__importDok.stipend(),
      gold: window.__importDok.gold(),
    }));

    // Reselect retained clean source A after importing B. The same basenames exist in both roots;
    // seeing DRYDEN return here proves each Library action kept its own immutable native capability.
    route.reselectedA = await page.evaluate(() => {
      const entries = [...document.querySelectorAll('.lib-entry')]
        .filter((node) => /Death Knights of Krynn/i.test(node.textContent ?? ''));
      entries[0]?.click();
      return entries.length === 2;
    });
    route.importedA = await page.evaluate(() => {
      const button = [...document.querySelectorAll('#output button')].find((node) =>
        node.dataset.route === 'dok-import' || /Import selected save party.*DQK/i.test(node.textContent ?? ''));
      button?.click();
      return !!button;
    });
    route.cleanProbe = await waitForDokImportCount(page, 6, 60000);
    route.clean = await page.evaluate(() => ({
      rendered: window.__rendered,
      party: window.__importDok.party(),
      rejected: window.__importDok.rejected(),
      stipend: window.__importDok.stipend(),
      gold: window.__importDok.gold(),
      spells: {
        flavius: window.__importDok.memorization('FLAVIUS'),
        celeste: window.__importDok.memorization('CELESTE'),
        dryden: window.__importDok.memorization('SIR DRYDEN'),
        tanar: window.__importDok.memorization('TANAR'),
      },
      table: document.querySelector('.import-table')?.textContent ?? '',
    }));

    route.continued = await page.evaluate(() => {
      const button = [...document.querySelectorAll('#output button')]
        .find((node) => /Continue into Dark Queen of Krynn/i.test(node.textContent ?? ''));
      button?.click();
      return !!button;
    });
    await page.waitForFunction('window.__dqk?.mapCount?.() > 0 && window.__dqk?.partySize?.() === 6', { timeout: 60000 });
    route.dqk = await page.evaluate('({ names: window.__dqk.partyNames(), classes: window.__dqk.partyClasses(), size: window.__dqk.partySize(), maps: window.__dqk.mapCount() })');

    const brokenNames = (route.broken?.party ?? []).map((hero) => hero.name.trim()).sort();
    const cleanParty = route.clean?.party ?? [];
    const cleanNames = cleanParty.map((hero) => hero.name.trim());
    const cleanSorted = [...cleanNames].sort();
    const byName = Object.fromEntries(cleanParty.map((hero) => [hero.name.trim(), hero]));
    const sourceOk = route.sourceA?.ok && route.sourceA?.match?.profileId === 'death-knights-of-krynn' &&
      route.sourceA?.match?.platform === 'DOS' && route.sourceA?.sourceId && route.sourceA?.fileCount > 50 &&
      route.sourceB?.ok && route.sourceB?.match?.profileId === 'death-knights-of-krynn' && route.sourceB?.sourceId &&
      route.sourceA.sourceId !== route.sourceB.sourceId && route.bMissingPrimary && route.selectedB && route.importedB &&
      route.reselectedA && route.importedA;
    const brokenOk = route.broken?.rendered === 5 &&
      JSON.stringify(brokenNames) === JSON.stringify(['CELESTE', 'FLAVIUS', 'LILLITH', 'NEACAIL', 'TANAR']) &&
      !brokenNames.includes('SIR DRYDEN') && route.broken?.stipend === 300 && route.broken?.gold === 5 * 300 * 5;
    const namesOk = route.clean?.rendered === 6 && JSON.stringify(cleanSorted) === JSON.stringify([
      'CELESTE', 'FLAVIUS', 'LILLITH', 'NEACAIL', 'SIR DRYDEN', 'TANAR',
    ]);
    const classesOk = Object.keys(byName['SIR DRYDEN']?.classes ?? {}).includes('fighter') &&
      Object.keys(byName.LILLITH?.classes ?? {}).includes('fighter') &&
      Object.keys(byName.TANAR?.classes ?? {}).includes('cleric') &&
      Object.keys(byName.FLAVIUS?.classes ?? {}).includes('cleric') &&
      Object.keys(byName.NEACAIL?.classes ?? {}).includes('cleric') &&
      Object.keys(byName.CELESTE?.classes ?? {}).includes('magicUser');
    const neacailOk = byName.NEACAIL?.abilities?.dex === 18 && !(route.clean?.rejected ?? []).includes('NEACAIL');
    const stipendOk = route.clean?.stipend === 300 && route.clean?.gold - route.broken?.gold === 6 * 300 * 5;
    const spellsOk = JSON.stringify(route.clean?.spells?.flavius) === JSON.stringify(['c2-hold-person']) &&
      JSON.stringify([...(route.clean?.spells?.celeste ?? [])].sort()) === JSON.stringify([
        'm1-magic-missile', 'm1-magic-missile', 'm3-fireball', 'm3-fireball',
      ].sort()) && (route.clean?.spells?.dryden ?? []).length === 0 &&
      JSON.stringify([...(route.clean?.spells?.tanar ?? [])].sort()) === JSON.stringify([
        'c2-hold-person', 'c4-cure-serious-wounds',
      ].sort());
    // HP GOLDENS RE-DERIVED 2026-09-07 from the retail bytes, not from the importer. They read
    // 63/80/70/60/55, which were the output of importDokParty's own `level * levelHpGain(hitDie(cls))
    // + level * conBonus` synthesis — a formula it ran because it believed `.GAM` had no HP field.
    // It has one, at byte 40 (mirrored at 214). Read with Python straight off
    // `Death Knights of Krynn/SAVE/CHRDATA{1..6}.GAM`: SIR DRYDEN 95, LILLITH 102, TANAR 78,
    // FLAVIUS 52, NEACAIL 58, CELESTE 53 — so all five old numbers were wrong, by 3 to 32 points and
    // in both directions (FLAVIUS was 8 too high, LILLITH 22 too low).
    const statsOk = byName['SIR DRYDEN']?.ac === 6 && byName.LILLITH?.ac === -2 && byName.TANAR?.ac === -1 &&
      byName.FLAVIUS?.ac === 0 && byName.CELESTE?.ac === -1 && byName['SIR DRYDEN']?.hp === 95 &&
      byName.LILLITH?.hp === 102 && byName.TANAR?.hp === 78 && byName.FLAVIUS?.hp === 52 && byName.CELESTE?.hp === 53 &&
      cleanParty.every((hero) => typeof hero.hp === 'number' && hero.hp > 0 && hero.hp < 200);
    const gearOk = byName.LILLITH?.inv?.includes(83) && byName.LILLITH?.inv?.includes(14) && !byName.LILLITH?.inv?.includes(81) &&
      byName['SIR DRYDEN']?.inv?.includes(14) && !byName['SIR DRYDEN']?.inv?.includes(81);
    const tableOk = /SIR DRYDEN[\s\S]*?AC 6/.test(route.clean?.table ?? '') &&
      /LILLITH[\s\S]*?AC -2/.test(route.clean?.table ?? '') && /TANAR[\s\S]*?2 spells/.test(route.clean?.table ?? '');
    const dqkOk = route.continued && route.dqk?.size === 6 && route.dqk?.maps > 0 &&
      JSON.stringify(route.dqk?.names) === JSON.stringify(cleanNames);
    return {
      id: 'electron-dok-selected-folder-import',
      label: 'Electron shell: retained DoK sources import exact pregens and continue into DQK',
      pass: !!(sourceOk && brokenOk && namesOk && classesOk && neacailOk && stipendOk && spellsOk && statsOk && gearOk && tableOk && dqkOk && errors.length === errorStart),
      detail: `source=${sourceOk} broken=${brokenOk} names=${namesOk} classes=${classesOk} neacail=${neacailOk} stipend=${stipendOk} spells=${spellsOk} stats=${statsOk} gear=${gearOk} table=${tableOk} dqk=${dqkOk} errors=${JSON.stringify(errors.slice(errorStart))} route=${JSON.stringify(route)}`,
    };
  } catch (error) {
    return {
      id: 'electron-dok-selected-folder-import',
      label: 'Electron shell: retained DoK sources import exact pregens and continue into DQK',
      pass: false,
      detail: `error=${error instanceof Error ? error.message : String(error)} rendererErrors=${JSON.stringify(errors.slice(errorStart))} route=${JSON.stringify(route)}`,
    };
  }
}

// Compare the pixels actually painted by the unchanged production renderer. Two animation
// frames let ScreenSurface's ResizeObserver settle before reading the canvas or its geometry.
async function cokGraphicsSnapshot(page, stage, baseline = false) {
  return page.evaluate(async ({ stage, baseline }) => {
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const travel = stage === 'travel';
    const combat = stage === 'combat';
    const canvas = document.querySelector(travel ? '.cok-travel-panel canvas'
      : combat ? '.sheet-overlay .gb-emu canvas' : '#output .gb-frame .gb-emu canvas');
    if (!canvas || !canvas.width || !canvas.height) throw new Error(`${stage}: no rendered canvas`);
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)),
      (byte) => byte.toString(16).padStart(2, '0')).join('');
    const memory = travel ? window.__cokTravel.memorySnapshot().sort(([a], [b]) => a - b) : null;
    const state = {
      party: localStorage.getItem('greybox.party.cok'),
      save: localStorage.getItem('greybox.save.cok.quick'),
      position: travel ? window.__cokTravel.position() : window.__explore.getPose(),
      clock: travel ? window.__cokTravel.clockMinutes() : window.__explore.clockMinutes(),
      memory,
      area: travel ? null : window.__explore.currentArea(),
      flags: travel ? null : [0x4c3a, 0x4c4b].map((address) => window.__explore.areaMemory(address)),
      liveParty: travel ? null : window.__explore.party(),
      visits: travel ? null : window.__explore.automapVisitedCount(),
      steps: travel ? null : window.__explore.stepCount(),
      event: travel ? null : window.__explore.lastEvent(),
      dialogue: window.__dialogue ? { kind: window.__dialogue.kind(), text: window.__dialogue.text(),
        choices: window.__dialogue.choices(), picture: window.__dialogue.pictureId() } : null,
      combat: combat ? { phase: window.__combat.phase(), active: window.__combat.activeId(),
        actors: window.__combat.combatants().map((actor) => ({ ...actor, hp: window.__combat.hpOf(actor.id) })),
        rows: window.__combat.panelRows(), movement: window.__combat.movementLeft(),
        log: window.__combat.log(), outcome: window.__combat.outcome(),
        viewport: window.__combat.viewport(), counts: window.__combat.teamCounts() } : null,
    };
    const icons = [];
    if (combat) for (const icon of window.__combat.visibleCombatIcons().filter((icon) => icon.id?.startsWith('e'))) {
      const points = window.__combat.combatantOpaqueSamplePoints(icon.id);
      const samples = new Uint8Array(points.flatMap((point) => {
        const p = window.__combat.canvasPointForNativePixel(point.x, point.y);
        return [...canvas.getContext('2d').getImageData(p.x, p.y, 1, 1).data];
      }));
      if (samples.length) icons.push({ id: icon.id, pictureId: icon.pictureId, samples: points.length,
        hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', samples)), (b) => b.toString(16).padStart(2, '0')).join(''),
        mask: window.__combat.combatRestyleSourceMask(icon.id) });
    }
    let changedPixels = 0;
    if (baseline) window.__electronCokPixels = { pixels, width: canvas.width, height: canvas.height };
    else {
      const before = window.__electronCokPixels;
      if (before.width !== canvas.width || before.height !== canvas.height) throw new Error(`${stage}: canvas geometry changed`);
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels.subarray(offset, offset + 4).some((byte, channel) => byte !== before.pixels[offset + channel])) changedPixels++;
      }
    }
    return { hash, changedPixels, state, icons,
      mode: localStorage.getItem('greybox.graphics.cok') ?? 'DOS-EGA',
      status: document.querySelector(travel ? '.cok-travel-art-status' : combat
        ? '#combat-graphics-status' : '.gb-graphics-provenance')?.textContent ?? '',
      source: travel ? window.__cokTravel.pictureSource() : combat ? window.__combat.assetPaths() : window.__explore.graphicsProvenance(),
      wallPixels: !travel && !combat ? window.__explore.wallRestyleVisiblePixels() : 0,
      terrainSamples: combat ? window.__combat.terrainRenderReceipt().changedTerrainSamples.length : 0,
      terrainIds: combat ? window.__combat.terrainRestyleIds() : [],
      terrainErrors: combat ? window.__combat.terrainRestyleErrors() : {},
      iconIds: combat ? window.__combat.combatRestyleIds() : [],
      iconErrors: combat ? window.__combat.combatRestyleErrors() : {},
    };
  }, { stage, baseline });
}

async function verifyCokEncounterIcons(page, pictureIds = [12, 35], diagnostic = false) {
  const bank = JSON.parse(readFileSync(resolve(REPO_ROOT, 'apps/web/src/ui/cokCombatRestyleManifest.json'), 'utf8')).banks[0];
  const actual = await page.evaluate('({ ids: window.__combat.combatantPictureIds(), archive: window.__combat.iconArchiveSha256() })');
  assert.equal(actual.archive, bank.sourceArchiveSha256);
  for (const pictureId of pictureIds) {
    const actor = Object.entries(actual.ids).find(([id, picture]) => id.startsWith('e') && picture === pictureId)?.[0];
    assert.ok(actor, `encounter must request CPIC1#${pictureId}`);
    await page.evaluate((id) => window.__combat.recenterCombatantForTest(id), actor);
    await clickCokGraphics(page, 'combat', 'DOS-EGA');
    const dos = await cokGraphicsSnapshot(page, 'combat', true);
    await clickCokGraphics(page, 'combat', 'Restyle');
    const restyle = await cokGraphicsSnapshot(page, 'combat');
    const before = dos.icons.find((icon) => icon.id === actor), after = restyle.icons.find((icon) => icon.id === actor);
    const visible = await page.evaluate((id) => window.__combat.visibleCombatIcons().find((icon) => icon.id === id), actor);
    assert.ok(before && after, `CPIC1#${pictureId} actor must be visible`);
    assert.ok(restyle.iconIds.includes(pictureId) && !restyle.iconErrors[pictureId]);
    const originalFallback = visible?.guarding || visible?.down || visible?.impaired;
    if (diagnostic) assert.equal(originalFallback, false, 'diagnostic actor must be renderable');
    if (originalFallback) assert.equal(after.hash, before.hash, 'natural guarded/impaired/down actor must retain its original icon');
    else assert.notEqual(after.hash, before.hash, `CPIC1#${pictureId} must change its own source-opaque pixels`);
    assert.equal(after.mask?.escapedOutputPixels, 0);
    assert.deepEqual(restyle.state, dos.state);
    await clickCokGraphics(page, 'combat', 'DOS-EGA');
    const restored = await cokGraphicsSnapshot(page, 'combat');
    assert.equal(restored.hash, dos.hash);
    assert.deepEqual(restored.state, dos.state);
    assert.equal(restored.icons.find((icon) => icon.id === actor)?.hash, before.hash);
    console.log('[e2e] CoK CPIC actor ->', JSON.stringify({ coverage: diagnostic ? 'source-pinned diagnostic' : 'natural encounter',
      pictureId, actor, originalFallback, visible, dos: before, restyle: after, restored: restored.hash }));
  }
}

async function clickCokGraphics(page, stage, mode) {
  // Use the visible product controls and their real handlers, never a mode setter seam.
  const selector = stage === 'travel' ? `.cok-travel-panel button[data-art-mode="${mode}"]`
    : stage === 'combat' ? `#combat-graphics-${mode === 'DOS-EGA' ? 'dos' : mode.toLowerCase()}` : null;
  if (selector) await page.click(selector);
  else {
    const label = mode === 'DOS-EGA' ? 'DOS · EGA' : mode === 'Amiga' ? 'Amiga · 32-color' : 'Restyle';
    const button = await page.evaluateHandle((label) => [...document.querySelectorAll('#output .gb-seg')]
      .find((button) => button.textContent === label), label);
    assert.ok(button.asElement(), `exploration: missing visible ${label} control`);
    await button.asElement().click();
    await button.dispose();
  }
  await page.waitForFunction((mode) => localStorage.getItem('greybox.graphics.cok') === mode, {}, mode);
}

async function cycleCokGraphics(page, stage) {
  await clickCokGraphics(page, stage, 'DOS-EGA');
  if (stage === 'combat') await page.waitForFunction('window.__combat.backdropGraphicsMode() === "DOS-EGA"');
  const dos = await cokGraphicsSnapshot(page, stage, true);
  assert.ok(dos.status.includes('DOS-EGA'), `${stage}: DOS source status absent: ${dos.status}`);
  const evidence = { dos: { hash: dos.hash, status: dos.status, source: dos.source }, modes: [] };
  const amigaAvailable = stage !== 'exploration' || await page.evaluate('window.__explore.graphicsAvailable().includes("Amiga")');
  if (amigaAvailable) {
    await clickCokGraphics(page, stage, 'Amiga');
    if (stage === 'combat') await page.waitForFunction(() => {
      const status = document.querySelector('#combat-graphics-status')?.textContent ?? '';
      return window.__combat.backdropGraphicsMode() === 'Amiga' || /Amiga unavailable|Could not load Amiga/.test(status);
    }, { timeout: 60000 });
    const amiga = await cokGraphicsSnapshot(page, stage);
    assert.deepEqual(amiga.state, dos.state, `${stage}: Amiga changed gameplay`);
    if (stage === 'travel' || (stage === 'combat' && amiga.source.backdropGraphicSet === 'DOS-EGA')) {
      assert.match(amiga.status, /fallback|Amiga unavailable|Could not load Amiga/i);
      assert.equal(amiga.hash, dos.hash, `${stage}: DOS fallback changed pixels`);
    } else {
      assert.notEqual(amiga.hash, dos.hash, `${stage}: actual Amiga art did not change pixels`);
    }
    evidence.modes.push({ mode: 'Amiga', hash: amiga.hash, status: amiga.status, source: amiga.source });
  } else evidence.modes.push({ mode: 'Amiga', skip: 'Selected CoK folder has no decoded Amiga wall source/control' });
  await clickCokGraphics(page, stage, 'Restyle');
  if (stage === 'travel') await page.waitForFunction(() => {
    const status = window.__cokTravel.artStatus();
    return status.includes('Restyle (reviewed') || status.includes('unavailable') || status.includes('not mapped');
  }, { timeout: 60000 });
  if (stage === 'combat') await page.waitForFunction('window.__combat.backdropGraphicsMode() === "DOS-EGA"', { timeout: 60000 });
  const restyle = await cokGraphicsSnapshot(page, stage);
  assert.deepEqual(restyle.state, dos.state, `${stage}: Restyle changed gameplay`);
  assert.match(restyle.status, /Restyle/, `${stage}: Restyle status absent`);
  if (stage === 'travel') {
    const pin = JSON.parse(readFileSync(resolve(REPO_ROOT, 'apps/web/src/ui/cokTravelRestyleManifest.json'), 'utf8'));
    assert.deepEqual(restyle.source, { game: pin.game, system: pin.system, archive: 'BIGPIC1.DAX',
      archiveSha256: pin.archiveSha256, blockId: pin.blockId, frameIndex: pin.frameIndex, blockSha256: pin.blockSha256 });
    assert.match(restyle.status, /Restyle \(reviewed BIGPIC1#121 only\)/);
    assert.ok(restyle.changedPixels > 0, 'travel: mapped BIGPIC1#121 did not change rendered pixels');
  } else if (stage === 'combat') {
    assert.equal(restyle.source.backdropGraphicSet, 'DOS-EGA');
    assert.equal(restyle.terrainIds.length, 25, 'combat: expected all 25 pinned DUNGCOM#1 terrain restyles');
    assert.deepEqual(restyle.terrainErrors, {}, 'combat: mapped terrain failed to load');
    assert.ok(restyle.terrainSamples > 0, 'combat: no mapped terrain rendered');
    assert.ok(restyle.changedPixels > 0, 'combat: mapped Restyle art did not change rendered pixels');
  } else if (restyle.wallPixels > 0) {
    assert.ok(restyle.changedPixels > 0, `${stage}: mapped Restyle art did not change rendered pixels`);
  }
  evidence.modes.push({ mode: 'Restyle', hash: restyle.hash, changedPixels: restyle.changedPixels,
    status: restyle.status, wallPixels: restyle.wallPixels, terrainSamples: restyle.terrainSamples,
    terrainIds: restyle.terrainIds, terrainErrors: restyle.terrainErrors,
    iconIds: restyle.iconIds, iconErrors: restyle.iconErrors });
  await clickCokGraphics(page, stage, 'DOS-EGA');
  if (stage === 'combat') await page.waitForFunction('window.__combat.backdropGraphicsMode() === "DOS-EGA"');
  const restored = await cokGraphicsSnapshot(page, stage);
  assert.deepEqual(restored.state, dos.state, `${stage}: original return changed gameplay`);
  assert.equal(restored.hash, dos.hash, `${stage}: original return did not restore exact DOS pixels`);
  evidence.restored = restored.hash;
  console.log(`[e2e] Electron CoK ${stage} graphics -> ${JSON.stringify(evidence)}`);
  return evidence;
}

async function runCokRetailTravel(page, errors) {
  // Drive the real Library DOM entry backed by Electron's native AssetSource through the same
  // clean-input campaign slice as the browser: retail opening/town/travel, natural area-32 combat,
  // ECL outcome resume, then save/load. Every archive read stays on the picked-folder AssetSource.
  const errorStart = errors.length;
  const graphics = [];
  let travelArea = null;
  let travelPicture = null;
  let openingVisited = null;
  let openingMission = false;
  const openingLines = [];
  let townService = false;
  let naturalFlag = null;
  let persistence = false;
  const firstEntry = await page.$('.lib-entry');
  if (firstEntry) {
    await page.evaluate((el) => el.click(), firstEntry);
    // `__rendered` starts at zero while the asynchronous selected-folder load is still
    // fetching the opening archives.  Waiting for zero accepts that pre-boot state and
    // makes the rest of this campaign control race the loader.
    let bootReady = false;
    for (let poll = 0; poll < 300; poll++) {
      bootReady = await page.evaluate(() => Boolean(window.__dialogue) || Number(window.__rendered) > 0);
      if (bootReady) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!bootReady) {
      const state = await page.evaluate('({ rendered: window.__rendered, status: document.querySelector("#status")?.textContent ?? "", dialogue: window.__dialogue ? { kind: window.__dialogue.kind(), text: window.__dialogue.text() } : null, explore: !!window.__explore })');
      throw new Error(`Electron CoK selected-folder opening did not complete: ${JSON.stringify(state)}`);
    }
    const boot = await page.evaluate('({ rendered: window.__rendered, picture: window.__dialogue?.pictureId?.() ?? null, status: document.querySelector("#status")?.textContent ?? "" })');
    console.log('[e2e] Electron CoK selected-folder boot ->', JSON.stringify(boot));
    if (boot.picture === 112) {
      for (let guard = 0; guard < 80; guard++) {
        if (await page.evaluate('!!window.__cokTravel?.open?.()')) break;
        if (await page.evaluate('!!window.__dialogue')) {
          const turn = await page.evaluate('({ kind: window.__dialogue.kind(), choices: window.__dialogue.choices(), text: window.__dialogue.text() })');
          if (turn.text) openingLines.push(turn.text);
          openingMission = /FIRST MISSION IS TO PATROL THROTL/i.test(openingLines.join(' '));
          if (turn.kind === 'say') {
            const leave = turn.choices.findIndex((choice) => /^LEAVE$/i.test(choice));
            const commandant = turn.choices.findIndex((choice) => /^COMMANDANT$/i.test(choice));
            const choice = leave >= 0 && commandant >= 0 && !townService ? commandant : leave >= 0 ? leave : 0;
            if (choice === commandant && commandant >= 0) townService = true;
            await page.evaluate((picked) => window.__dialogue.choose(picked), choice);
          } else if (turn.kind === 'end') {
            await page.evaluate('window.__dialogue.close()');
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      // The retail narration hands off to a separate opening camp before the overland
      // selector.  Exit is the only source-proven command in that camp; without it the
      // campaign is correctly still waiting at camp rather than exposing __cokTravel.
      await page.waitForFunction('window.__cokOpeningCamp?.open?.()', { timeout: 20000 });
      await page.evaluate('window.__cokOpeningCamp.exit()');
      // This is a real Electron AssetSource load of five retail archives, including the
      // large MON1CHA.DAX.  It begins after the dialogue close callback, so give native
      // recursive-folder I/O the same budget as the campaign's other selected-folder legs.
      await page.waitForFunction('window.__cokTravel && window.__cokTravel.open()', { timeout: 60000 }).catch(async () => {
        // Native archive loading can complete on the timeout boundary under concurrent disk-heavy
        // gates. Recheck the exact predicate before classifying a failure; the diagnostic read
        // itself previously observed `travel: true` and then threw a false timeout.
        if (await page.evaluate('!!window.__cokTravel?.open?.()')) return;
        const state = await page.evaluate('({ opening: window.__cokOpening?.visited?.() ?? null, dialogue: window.__dialogue ? { kind: window.__dialogue.kind(), text: window.__dialogue.text(), choices: window.__dialogue.choices() } : null, travel: window.__cokTravel?.open?.() ?? null, status: document.querySelector("#status")?.textContent ?? "" })');
        throw new Error(`Electron CoK selected-folder opening did not reach travel: ${JSON.stringify(state)} rendererErrors=${errors.slice(-5).join(' | ')}`);
      });
      openingVisited = await page.evaluate('window.__cokOpening.visited()');
      travelPicture = await page.evaluate('window.__cokTravel.pictureId()');
      graphics.push(await cycleCokGraphics(page, 'travel'));
      await page.evaluate('window.__cokTravel.choose(1)');
      for (let guard = 0; guard < 12; guard++) {
        if (await page.evaluate('window.__explore?.currentArea?.().areaId === 32')) break;
        if (await page.evaluate('!!window.__dialogue')) {
          const turn = await page.evaluate('({ kind: window.__dialogue.kind(), choices: window.__dialogue.choices() })');
          if (turn.kind === 'say') {
            const yes = turn.choices.findIndex((choice) => /^YES$/i.test(choice));
            await page.evaluate((choice) => window.__dialogue.choose(choice), yes >= 0 ? yes : 0);
          } else if (turn.kind === 'end') {
            await page.evaluate('window.__dialogue.close()');
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await page.waitForFunction('window.__explore.currentArea().disk === 1 && window.__explore.currentArea().areaId === 32', { timeout: 60000 });
      travelArea = await page.evaluate('window.__explore.currentArea()');
      const landedPose = await page.evaluate('window.__explore.getPose()');
      graphics.push(await cycleCokGraphics(page, 'exploration'));
      if (JSON.stringify(landedPose) === JSON.stringify({ x: 2, y: 1, facing: 'north' })) {
        for (const action of ['forward', 'right', 'forward', 'forward']) {
          await page.evaluate((move) => window.__explore.move(move), action);
        }
        await page.waitForFunction('window.__dialogue || window.__combat', { timeout: 60000 });
        for (let guard = 0; guard < 12 && !(await page.evaluate('!!window.__combat')); guard++) {
          if (await page.evaluate('!!window.__dialogue')) {
            const turn = await page.evaluate('window.__dialogue.kind()');
            if (turn === 'say') await page.evaluate('window.__dialogue.choose(0)');
            else if (turn === 'end') await page.evaluate('window.__dialogue.close()');
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await page.waitForFunction('!!window.__combat', { timeout: 60000 });
        graphics.push(await cycleCokGraphics(page, 'combat'));
        await verifyCokEncounterIcons(page);
        await page.evaluate('window.__combat.auto()');
        let combatPhase = await page.evaluate('window.__combat.phase()');
        if (combatPhase === 'continue-battle') {
          await page.evaluate('window.__combat.declineContinueBattle()');
          combatPhase = await page.evaluate('window.__combat.phase()');
        }
        if (combatPhase === 'victory') {
          combatPhase = await page.evaluate('window.__combat.acknowledgeVictory()');
        }
        if (combatPhase === 'treasure') {
          await page.evaluate('window.__combat.takeAllTreasure()');
          await page.evaluate('window.__combat.exitTreasure()');
        }
        await page.evaluate('window.__combat.dismiss()');
        await page.waitForFunction('!window.__explore.combatOpen()', { timeout: 5000 }).catch(async () => {
          const combat = await page.evaluate('window.__combat ? ({ phase: window.__combat.phase(), over: window.__combat.isOver(), outcome: window.__combat.outcome(), log: window.__combat.log().slice(-8) }) : null');
          throw new Error(`Electron CoK selected-folder combat did not close: ${JSON.stringify(combat)}`);
        });
        if (await page.evaluate('!!window.__dialogue')) await page.evaluate('window.__dialogue.close()');
        naturalFlag = await page.evaluate('window.__explore.areaMemory(0x4c4b)');
        const savedPose = await page.evaluate('window.__explore.getPose()');
        const savedClock = await page.evaluate('window.__explore.clockMinutes()');
        const savedParty = await page.evaluate('window.__explore.party()');
        await page.evaluate('window.__explore.save()');
        await page.evaluate('window.__explore.move("right")');
        const accepted = await page.evaluate('window.__explore.load()');
        await page.waitForFunction('window.__explore.currentArea().areaId === 32', { timeout: 60000 });
        const restored = await page.evaluate('({ pose: window.__explore.getPose(), clock: window.__explore.clockMinutes(), flag: window.__explore.areaMemory(0x4c4b), party: window.__explore.party() })');
        persistence = accepted === true && JSON.stringify(restored.pose) === JSON.stringify(savedPose) &&
          restored.clock === savedClock && restored.flag === 0x08 && JSON.stringify(restored.party) === JSON.stringify(savedParty);
      }
    }
  }
  const passTravel = JSON.stringify(openingVisited) === JSON.stringify([36, 16, 17, 16]) && openingMission && townService &&
    travelPicture === 121 && travelArea?.disk === 1 && travelArea?.areaId === 32 &&
    naturalFlag === 0x08 && persistence && graphics.length === 3 && errors.length === errorStart;
  // Separate fixture acceptance: real decoded native-folder assets, synthetic picture selection
  // and normalized guard flag. This proves visible rendering without claiming natural reachability.
  if (passTravel) for (const pictureId of [12, 35]) {
    await page.evaluate((picture) => {
      const monster = window.__explore.testMonsterRecords().find((record) => record.combatSize === 1);
      window.__explore.testFightPicture(picture, monster.blockId, 0x5b);
    }, pictureId);
    await page.waitForFunction('window.__combat && document.querySelector("#combat-graphics-restyle")', { timeout: 60000 });
    await page.evaluate('window.__combat.setCombatantFlagForTest("e0", "guarding", false)');
    await verifyCokEncounterIcons(page, [pictureId], true);
    await page.evaluate('window.__explore.closeCombat()');
  }
  console.log('[e2e] Electron CoK campaign ->', JSON.stringify({ openingVisited, openingMission, townService,
    travelPicture, travelArea, naturalFlag, persistence, graphicsStages: graphics.length, errors: errors.slice(errorStart) }));
  return {
    id: 'electron-cok-retail-travel',
    label: 'Electron shell: selected-folder CoK opening/travel, graphics switches, natural combat and save/load',
    pass: passTravel && errors.length === errorStart,
    detail: `opening=${JSON.stringify(openingVisited)} mission=${openingMission} commandant=${townService} picture=${travelPicture} area=${JSON.stringify(travelArea)} flag=${naturalFlag} persistence=${persistence} graphics=${JSON.stringify(graphics)} errors=${JSON.stringify(errors.slice(errorStart))}`,
  };
}

async function enterCokExplorationAfterRestart(page) {
  const firstEntry = await page.$('.lib-entry');
  assert.ok(firstEntry, 'restart: selected CoK folder did not produce a Library entry');
  await page.evaluate((entry) => entry.click(), firstEntry);
  await firstEntry.dispose();
  let bootReady = false;
  for (let poll = 0; poll < 300; poll++) {
    bootReady = await page.evaluate(() => Boolean(window.__dialogue) || Number(window.__rendered) > 0);
    if (bootReady) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!bootReady) {
    const state = await page.evaluate('({ rendered: window.__rendered, status: document.querySelector("#status")?.textContent ?? "", dialogue: window.__dialogue ? { kind: window.__dialogue.kind(), text: window.__dialogue.text() } : null })');
    throw new Error(`restart: selected-folder CoK opening did not boot: ${JSON.stringify(state)}`);
  }
  const bootPicture = await page.evaluate('window.__dialogue?.pictureId?.() ?? null');
  assert.equal(bootPicture, 112, 'restart: expected the retail opening before saved-game restore');

  let commandantChosen = false;
  for (let guard = 0; guard < 120 && !(await page.evaluate('!!window.__cokOpeningCamp?.open?.()')); guard++) {
    if (await page.evaluate('!!window.__dialogue')) {
      const turn = await page.evaluate('({ kind: window.__dialogue.kind(), choices: window.__dialogue.choices() })');
      if (turn.kind === 'say') {
        const leave = turn.choices.findIndex((choice) => /^LEAVE$/i.test(choice));
        const commandant = turn.choices.findIndex((choice) => /^COMMANDANT$/i.test(choice));
        const choice = leave >= 0 && commandant >= 0 && !commandantChosen ? commandant : leave >= 0 ? leave : 0;
        if (choice === commandant && commandant >= 0) commandantChosen = true;
        await page.evaluate((picked) => window.__dialogue.choose(picked), choice);
      } else if (turn.kind === 'end') await page.evaluate('window.__dialogue.close()');
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await page.waitForFunction('window.__cokOpeningCamp?.open?.()', { timeout: 20000 });
  await page.evaluate('window.__cokOpeningCamp.exit()');
  await page.waitForFunction('window.__cokTravel?.open?.()', { timeout: 60000 });
  await page.evaluate('window.__cokTravel.choose(1)');
  for (let guard = 0; guard < 20; guard++) {
    if (await page.evaluate('window.__explore?.currentArea?.().disk === 1 && window.__explore.currentArea().areaId === 32')) break;
    if (await page.evaluate('!!window.__dialogue')) {
      const turn = await page.evaluate('({ kind: window.__dialogue.kind(), choices: window.__dialogue.choices() })');
      if (turn.kind === 'say') {
        const yes = turn.choices.findIndex((choice) => /^YES$/i.test(choice));
        await page.evaluate((picked) => window.__dialogue.choose(picked), yes >= 0 ? yes : 0);
      } else if (turn.kind === 'end') await page.evaluate('window.__dialogue.close()');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await page.waitForFunction('window.__explore?.currentArea?.().disk === 1 && window.__explore.currentArea().areaId === 32', { timeout: 60000 });
}

async function runCokRestartAcceptance(page, errors, firstSourceId, restart) {
  const errorStart = errors.length;
  assert.ok(firstSourceId, 'restart: initial selected-folder source identity is missing');
  assert.equal(filesWithBasename(COK_DOS_FOLDER, 'BIGPIC1.DAA').length, 0,
    'restart: DOS-only fixture unexpectedly contains an Amiga BIGPIC1.DAA archive');

  // Save a stable post-combat state, then choose Amiga followed by Restyle through the visible
  // exploration controls. Restyle must persist the Amiga original fallback separately.
  const selectedBefore = await page.evaluate('window.__explore?.currentArea?.() ?? null');
  assert.ok(selectedBefore, 'restart: retail route did not leave exploration mounted');
  await page.evaluate('window.__explore.save()');
  await page.evaluate('window.__explore.openTravel()');
  await page.waitForFunction('window.__cokTravel?.open?.()', { timeout: 60000 });
  await clickCokGraphics(page, 'travel', 'Amiga');
  const amigaStatus = await page.evaluate('window.__cokTravel.artStatus()');
  assert.match(amigaStatus, /fallback; Amiga map mapping pending/i,
    `restart: DOS-only selected-folder fallback was not explicit: ${amigaStatus}`);
  await clickCokGraphics(page, 'travel', 'Restyle');
  await page.evaluate('window.__cokTravel.close()');
  await page.waitForFunction('!window.__cokTravel?.open?.()');
  const persistedInput = await page.evaluate(() => ({
    mode: localStorage.getItem('greybox.graphics.cok'),
    fallback: localStorage.getItem('greybox.graphics-fallback.cok'),
    save: localStorage.getItem('greybox.save.cok.quick'),
    area: window.__explore.currentArea(),
    pose: window.__explore.getPose(),
    clock: window.__explore.clockMinutes(),
    party: window.__explore.party(),
    encounterFlag: window.__explore.areaMemory(0x4c4b),
    combatOpen: window.__explore.combatOpen(),
  }));
  assert.equal(persistedInput.mode, 'Restyle');
  assert.equal(persistedInput.fallback, 'Amiga');
  assert.ok(persistedInput.save, 'restart: quick-save slot was not written');
  assert.equal(persistedInput.combatOpen, false, 'restart: save point must be outside settled combat');
  const saveSha256 = createHash('sha256').update(persistedInput.save).digest('hex');
  const oldSource = firstSourceId;

  const oldPort = restart.port;
  await page.close({ runBeforeUnload: false });
  restart.browser.disconnect();
  await restart.waitForExit(30000);
  assert.equal(restart.exitCode(), 0, 'restart: Electron did not exit cleanly after closing its owned window');
  await waitForCdpGone(oldPort);
  rmSync(resolve(ELECTRON_E2E_PROFILE, 'DevToolsActivePort'), { force: true });

  const second = restart.launch();
  const secondDevtools = await waitForEphemeralCdpPort(ELECTRON_E2E_PROFILE);
  const secondPort = secondDevtools.port;
  assert.notEqual(secondDevtools.targetPath, restart.devtoolsPath,
    'restart: DevToolsActivePort retained the prior process browser endpoint');
  await waitForCdp(60000, secondPort);
  const secondBrowser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${secondPort}`, protocolTimeout: 60000 });
  const pages = await secondBrowser.pages();
  const secondPage = pages.find((candidate) => /dist-app|index\.html/.test(candidate.url())) ?? pages[0];
  assert.ok(secondPage, 'restart: second Electron renderer page did not appear');
  assertRendererIndex(secondPage, WEB_DIST_INDEX, 'restart second launch');
  const restartedErrors = [];
  const restartedOptionalAudioFailures = new Set();
  secondPage.on('console', (message) => {
    if (message.type() !== 'error') return;
    const url = message.location().url ?? '';
    if (message.text() === 'Failed to load resource: net::ERR_FILE_NOT_FOUND' && OPTIONAL_COK_AUDIO_URLS.has(url)) {
      restartedOptionalAudioFailures.add(url);
    } else restartedErrors.push(`${message.text()} (${url || 'unknown resource'})`);
  });
  secondPage.on('pageerror', (error) => restartedErrors.push(`pageerror: ${error.message}`));
  secondPage.on('requestfailed', (request) => {
    const url = request.url();
    const failure = request.failure()?.errorText ?? 'unknown';
    if (failure === 'net::ERR_FILE_NOT_FOUND' && OPTIONAL_COK_AUDIO_URLS.has(url)) restartedOptionalAudioFailures.add(url);
    else restartedErrors.push(`requestfailed: ${failure} ${url}`);
  });
  await secondPage.waitForFunction('window.__greybox && typeof window.__greybox.addFromElectronFolder === "function"', { timeout: 60000 });

  // This is the first renderer read after process restart: verify the persisted choice, fallback,
  // and exact save bytes before selecting a mode or folder in the new process.
  const beforeInteraction = await secondPage.evaluate(() => ({
    mode: localStorage.getItem('greybox.graphics.cok'),
    fallback: localStorage.getItem('greybox.graphics-fallback.cok'),
    save: localStorage.getItem('greybox.save.cok.quick'),
  }));
  assert.deepEqual({ mode: beforeInteraction.mode, fallback: beforeInteraction.fallback },
    { mode: 'Restyle', fallback: 'Amiga' }, 'restart: graphics preferences did not survive process restart');
  assert.equal(createHash('sha256').update(beforeInteraction.save ?? '').digest('hex'), saveSha256,
    'restart: quick-save bytes changed across Electron process restart');
  assert.equal(beforeInteraction.save, persistedInput.save, 'restart: save text changed across process restart');

  const freshFolder = await secondPage.evaluate((path) => window.__greybox.addFromElectronFolder(path), COK_DOS_FOLDER);
  assert.ok(freshFolder?.ok && freshFolder.match?.profileId === 'champions-of-krynn' && freshFolder.match.platform === 'DOS');
  assert.ok(freshFolder.sourceId && freshFolder.sourceId !== oldSource,
    'restart: selected-folder capability was reused instead of reacquired in the new process');
  assert.ok(freshFolder.fileCount > 50, 'restart: selected DOS folder was not scanned through Electron native fs');
  await enterCokExplorationAfterRestart(secondPage);
  const loaded = await secondPage.evaluate(() => {
    const accepted = window.__explore.load();
    return {
      accepted,
      area: window.__explore.currentArea(),
      pose: window.__explore.getPose(),
      clock: window.__explore.clockMinutes(),
      party: window.__explore.party(),
      encounterFlag: window.__explore.areaMemory(0x4c4b),
      combatOpen: window.__explore.combatOpen(),
      graphicsMode: localStorage.getItem('greybox.graphics.cok'),
      activeGraphicsLabel: [...document.querySelectorAll('#output .gb-seg.active')]
        .map((button) => button.textContent?.trim() ?? ''),
      save: localStorage.getItem('greybox.save.cok.quick'),
    };
  });
  assert.equal(loaded.accepted, true, 'restart: __explore.load() rejected the retained CoK quick-save');
  assert.deepEqual(loaded.area, persistedInput.area, 'restart: exact saved campaign area did not restore');
  assert.deepEqual(loaded.pose, persistedInput.pose, 'restart: exact saved pose did not restore');
  assert.equal(loaded.clock, persistedInput.clock, 'restart: campaign clock did not restore');
  assert.deepEqual(loaded.party, persistedInput.party, 'restart: party state did not restore');
  assert.equal(loaded.encounterFlag, persistedInput.encounterFlag, 'restart: settled encounter flag changed');
  assert.equal(loaded.combatOpen, false, 'restart: loading the save reopened the settled encounter');
  assert.equal(loaded.graphicsMode, 'Restyle', 'restart: mounted CoK did not use persisted Restyle selection');
  assert.ok(loaded.activeGraphicsLabel.includes('Restyle'), 'restart: visible graphics control did not restore Restyle selection');
  assert.equal(loaded.save, persistedInput.save, 'restart: load rewrote the saved bytes');

  // Recheck real pixels after restart, using the mounted retail travel scene and exact DOS
  // baseline. The selected DOS folder has no DAA, so this deliberately verifies Restyle vs DOS.
  await secondPage.evaluate('window.__explore.openTravel()');
  await secondPage.waitForFunction('window.__cokTravel?.open?.()', { timeout: 60000 });
  await secondPage.waitForFunction(() => window.__cokTravel.artStatus().includes('Restyle (reviewed'));
  const inheritedRestyle = await cokGraphicsSnapshot(secondPage, 'travel', true);
  assert.equal(inheritedRestyle.mode, 'Restyle', 'restart: inherited Restyle was not selected on the newly mounted scene');
  assert.match(inheritedRestyle.status, /Restyle \(reviewed BIGPIC1#121 only\)/);
  await clickCokGraphics(secondPage, 'travel', 'DOS-EGA');
  const dosAfterRestart = await cokGraphicsSnapshot(secondPage, 'travel', true);
  const travelPin = JSON.parse(readFileSync(resolve(REPO_ROOT, 'apps/web/src/ui/cokTravelRestyleManifest.json'), 'utf8'));
  assert.deepEqual(dosAfterRestart.source, { game: travelPin.game, system: travelPin.system, archive: 'BIGPIC1.DAX',
    archiveSha256: travelPin.archiveSha256, blockId: travelPin.blockId, frameIndex: travelPin.frameIndex,
    blockSha256: travelPin.blockSha256 }, 'restart: travel scene source identity changed');
  await clickCokGraphics(secondPage, 'travel', 'Restyle');
  await secondPage.waitForFunction(() => window.__cokTravel.artStatus().includes('Restyle (reviewed'));
  const restyleAfterRestart = await cokGraphicsSnapshot(secondPage, 'travel');
  assert.deepEqual(restyleAfterRestart.state, dosAfterRestart.state, 'restart: Restyle changed gameplay/save state');
  assert.ok(restyleAfterRestart.changedPixels > 0, 'restart: BIGPIC1#121 Restyle did not change rendered pixels');
  assert.notEqual(restyleAfterRestart.hash, dosAfterRestart.hash, 'restart: Restyle canvas matched DOS unexpectedly');
  assert.equal(restyleAfterRestart.hash, inheritedRestyle.hash,
    'restart: inherited Restyle pixels differ from the explicitly reselected Restyle pixels');
  await clickCokGraphics(secondPage, 'travel', 'DOS-EGA');
  const dosRestoredAfterRestart = await cokGraphicsSnapshot(secondPage, 'travel');
  assert.equal(dosRestoredAfterRestart.hash, dosAfterRestart.hash, 'restart: DOS selection did not restore exact pixels');
  assert.deepEqual(dosRestoredAfterRestart.state, dosAfterRestart.state, 'restart: DOS restore changed gameplay/save state');
  await secondPage.evaluate('window.__cokTravel.close()');
  await secondPage.waitForFunction('!window.__cokTravel?.open?.()');
  console.log('[e2e] Electron CoK post-restart travel pixels ->', JSON.stringify({
    source: dosAfterRestart.source,
    inheritedRestyle: inheritedRestyle.hash,
    dos: dosAfterRestart.hash,
    restyle: restyleAfterRestart.hash,
    changedPixels: restyleAfterRestart.changedPixels,
    restored: dosRestoredAfterRestart.hash,
    saveSha256,
  }));
  assert.deepEqual(restartedErrors, [], `restart: renderer emitted errors: ${JSON.stringify(restartedErrors)}`);
  console.log('[e2e] Electron CoK process restart ->', JSON.stringify({
    oldPid: restart.pid, newPid: second.pid, oldPort, newPort: secondPort,
    oldDevtoolsPath: restart.devtoolsPath, newDevtoolsPath: secondDevtools.targetPath,
    firstSourceId: oldSource, freshSourceId: freshFolder.sourceId,
    mode: beforeInteraction.mode, fallback: beforeInteraction.fallback, saveSha256,
    loaded: { area: loaded.area, pose: loaded.pose, clock: loaded.clock,
      encounterFlag: loaded.encounterFlag, combatOpen: loaded.combatOpen, graphicsMode: loaded.graphicsMode },
    dosFixtureHasBigpicDaa: false, errors: restartedErrors,
  }));
  await secondPage.close({ runBeforeUnload: false });
  secondBrowser.disconnect();
  await second.waitForExit(30000);
  assert.equal(second.exitCode(), 0, 'restart: second Electron process did not exit cleanly');
  await waitForCdpGone(secondPort);
  restart.browser = secondBrowser;
  restart.port = secondPort;
  restart.devtoolsPath = secondDevtools.targetPath;
  restart.child = second.child;
  restart.waitForExit = second.waitForExit;
  restart.exitCode = second.exitCode;
  restart.pid = second.pid;
  return {
    id: 'electron-cok-process-restart',
    label: 'Electron CoK: Restyle/Amiga fallback and selected-folder save survive graceful process restart',
    pass: loaded.accepted === true && loaded.graphicsMode === 'Restyle' && loaded.combatOpen === false && restartedErrors.length === 0,
    detail: `mode=${beforeInteraction.mode} fallback=${beforeInteraction.fallback} saveSha256=${saveSha256} freshSource=${freshFolder.sourceId !== oldSource} area=${JSON.stringify(loaded.area)} pose=${JSON.stringify(loaded.pose)} clock=${loaded.clock} encounterFlag=${loaded.encounterFlag} combatOpen=${loaded.combatOpen} errors=${JSON.stringify(restartedErrors)}`,
  };
}

async function main() {
  const onlyCokRestart = process.env.GB_ELECTRON_ONLY === 'electron-cok-process-restart';
  const onlyCokTravel = process.env.GB_ELECTRON_ONLY === 'electron-cok-retail-travel' || onlyCokRestart;
  const onlyCoab = process.env.GB_ELECTRON_ONLY === 'electron-coab-verified-route';
  const onlyDok = process.env.GB_ELECTRON_ONLY === 'electron-dok-verified-route';
  const onlyDokImport = process.env.GB_ELECTRON_ONLY === 'electron-dok-selected-folder-import';
  const onlyFrua = process.env.GB_ELECTRON_ONLY === 'frua-heirs-route';
  const onlyTreasures = process.env.GB_ELECTRON_ONLY === 'electron-treasures-selected-folder';
  const onlySourceIsolation = process.env.GB_ELECTRON_ONLY === 'electron-source-isolation';
  const onlyProductionBoundary = process.env.GB_ELECTRON_ONLY === 'electron-production-fs-boundary';
  if (!existsSync(WEB_DIST_INDEX)) {
    console.error(`SKIP: ${WEB_DIST_INDEX} not found — run "pnpm build:app" first.`);
    process.exit(0);
  }
  if (!existsSync(MAIN_ENTRY)) {
    console.error(`SKIP: ${MAIN_ENTRY} not found — run "pnpm --filter @goldbox/electron build" first.`);
    process.exit(0);
  }
  if (!onlyProductionBoundary && !onlyFrua && !existsSync(COK_DOS_FOLDER)) {
    console.error(`SKIP: ${COK_DOS_FOLDER} not found (fresh clone, no local game data).`);
    process.exit(0);
  }
  if (!onlyCokTravel && !onlyProductionBoundary && !onlySourceIsolation && !onlyTreasures && !onlyDokImport && !onlyFrua && (!existsSync(DOK_DOS_FOLDER) || !existsSync(DOK_AMIGA_TILES))) {
    console.error(`SKIP: DoK DOS/Amiga verification assets not found (${DOK_DOS_FOLDER}, ${DOK_AMIGA_TILES}).`);
    process.exit(0);
  }
  if (!onlyCokTravel && !onlyProductionBoundary && !onlySourceIsolation && !onlyTreasures && !onlyDokImport && !onlyFrua && !existsSync(POOL_DOS_FOLDER)) {
    console.error(`SKIP: Pool selected-folder verification asset not found (${POOL_DOS_FOLDER}).`);
    process.exit(0);
  }
  if (!onlyCokTravel && !onlyProductionBoundary && !onlySourceIsolation && !onlyTreasures && !onlyDokImport && !onlyFrua && !existsSync(COAB_DOS_FOLDER)) {
    console.error(`SKIP: CoAB selected-folder verification asset not found (${COAB_DOS_FOLDER}).`);
    process.exit(0);
  }
  if (onlyTreasures && !existsSync(TREASURES_DOS_FOLDER)) {
    console.error(`SKIP: Treasures selected-folder verification asset not found (${TREASURES_DOS_FOLDER}).`);
    process.exit(0);
  }
  if (onlyDokImport && (!existsSync(DOK_DOS_FOLDER) || !existsSync(resolve(DOK_DOS_FOLDER, 'SAVE', 'CHRDATA1.GAM')))) {
    console.error(`SKIP: DoK selected-folder import assets not found (${DOK_DOS_FOLDER}\\SAVE\\CHRDATA1.GAM).`);
    process.exit(0);
  }

  let owned = null;
  let cdpPort = CDP_PORT;
  let devtoolsPath = null;
  let profileCreated = false;
  let browser;
  let results = [];
  try {
    console.log('[e2e] launching Electron ...');
    if ((onlyCokTravel || onlyCokRestart) && existsSync(ELECTRON_E2E_PROFILE)) {
      throw new Error(`Focused CoK run refuses pre-existing disposable profile: ${ELECTRON_E2E_PROFILE}`);
    }
    rmSync(ELECTRON_E2E_PROFILE, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    mkdirSync(ELECTRON_E2E_PROFILE, { recursive: true });
    profileCreated = true;
    owned = launchOwnedElectron(ELECTRON_E2E_PROFILE, onlyCokRestart, !onlyProductionBoundary);
    if (onlyCokRestart) {
      const devtools = await waitForEphemeralCdpPort(ELECTRON_E2E_PROFILE);
      cdpPort = devtools.port;
      devtoolsPath = devtools.targetPath;
    }
    // Cold Electron startup can exceed 20 seconds after the preceding native-folder run tears
    // down its renderer and Chromium cache. The ownership is this child process, so allow the
    // same one-minute budget used by the later selected-folder protocol instead of a false boot
    // failure while the process is still starting.
    await waitForCdp(60000, cdpPort);
    if (owned.exited()) throw new Error(`Electron exited early (code ${owned.exitCode()})`);
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${cdpPort}`, protocolTimeout: 60000 });

    // The main window's renderer shows up as a page target once index.html loads.
    let page = null;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline && !page) {
      const pages = await browser.pages();
      page = pages.find((p) => /dist-app|index\.html/.test(p.url())) ?? pages[0] ?? null;
      if (!page) await new Promise((res) => setTimeout(res, 300));
    }
    if (!page) throw new Error('no Electron renderer page target found');
    if (onlyCokRestart) assertRendererIndex(page, WEB_DIST_INDEX, 'restart first launch');

    const errors = [];
    const optionalAudioFailures = new Set();
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const url = m.location().url ?? '';
      if (m.text() === 'Failed to load resource: net::ERR_FILE_NOT_FOUND' && OPTIONAL_COK_AUDIO_URLS.has(url)) {
        optionalAudioFailures.add(url);
      } else errors.push(`${m.text()} (${url || 'unknown resource'})`);
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (request) => {
      const failure = { url: request.url(), error: request.failure()?.errorText ?? 'unknown failure' };
      const optional = failure.error === 'net::ERR_FILE_NOT_FOUND' && OPTIONAL_COK_AUDIO_URLS.has(failure.url);
      if (optional) optionalAudioFailures.add(failure.url);
      else errors.push(`requestfailed: ${failure.error} ${failure.url}`);
      console.log('[e2e] failed resource ->', JSON.stringify({ ...failure, optionalCokAudio: optional }));
    });

    await page.waitForFunction(
      onlyProductionBoundary
        ? 'window.__greybox && typeof window.electronAPI === "object"'
        : 'window.__greybox && typeof window.__greybox.addFromElectronFolder === "function"',
      { timeout: 60000 },
    );
    const hasElectronApi = await page.evaluate('typeof window.electronAPI === "object"');

    if (onlyProductionBoundary) {
      const boundary = await page.evaluate(() => ({
        pickerType: typeof window.electronAPI?.pickFolderForTest,
        addType: typeof window.__greybox.addFromElectronFolder,
        fruaType: typeof window.__greybox.importFruaFromElectronFolder,
      }));
      results.push({
        id: 'electron-production-fs-boundary',
        label: 'Electron shell: normal launch does not expose arbitrary-path test picker',
        pass: hasElectronApi && boundary.pickerType === 'undefined' &&
          boundary.addType === 'undefined' && boundary.fruaType === 'undefined' && errors.length === 0,
        detail: `electronAPI=${hasElectronApi} boundary=${JSON.stringify(boundary)} errors=${JSON.stringify(errors)}`,
      });
    } else {
    let result = null;
    if (!onlyFrua) {
      result = await page.evaluate(
        (path) => window.__greybox.addFromElectronFolder(path),
        COK_DOS_FOLDER,
      );
      const lib = await page.evaluate('window.__greybox.getLibrary()');

      const detected = result && result.ok && result.match && result.match.profileId === 'champions-of-krynn'
        && result.match.platform === 'DOS';
      const inLibrary = Array.isArray(lib) && lib.some((e) => e.profileId === 'champions-of-krynn' && e.platform === 'DOS');
      const realFsRead = result && result.fileCount > 50; // proves it walked the real folder, not a stub
      const pass = hasElectronApi && detected && inLibrary && realFsRead && errors.length === 0;

      results.push({
        id: 'electron-detect-cok',
        label: 'Electron shell: native fs pick + detect real CoK-DOS folder (M6.S1)',
        pass,
        detail: `electronAPI=${hasElectronApi} result=${JSON.stringify(result)} inLibrary=${inLibrary} errors=${errors.slice(0, 3).join(' | ')}`,
      });
    }

    const rendererBaseUrl = (await page.url()).split('?')[0];
    if (onlyCokTravel) {
      results.push(await runCokRetailTravel(page, errors));
      if (onlyCokRestart) {
        const restart = {
          browser,
          port: cdpPort,
          devtoolsPath,
          child: owned.child,
          pid: owned.pid,
          waitForExit: owned.waitForExit,
          exitCode: owned.exitCode,
          launch: () => {
            owned = launchOwnedElectron(ELECTRON_E2E_PROFILE, true);
            return owned;
          },
        };
        results.push(await runCokRestartAcceptance(page, errors, result?.sourceId, restart));
        browser = restart.browser;
        cdpPort = restart.port;
      }
      console.log('[e2e] optional CoK audio unavailable ->', JSON.stringify([...optionalAudioFailures].sort()));
    } else if (onlyTreasures) {
      results.push(await runTreasuresSelectedFolder(page, rendererBaseUrl, errors));
    } else if (onlyDokImport) {
      results.push(await runDokSelectedFolderImport(page, rendererBaseUrl, errors));
    } else {
    if (!onlyCoab && !onlyDok && !onlyFrua) {
      // Each selected folder must remain bound to its own opaque native source after later picks.
      // The direct byte probes distinguish clean source A from corrupted source B; clicking A after
      // B proves the real Library/AssetSource path still boots from A. Forged capabilities and a
      // lexical traversal must be rejected by the main-process guard.
      makeCorruptedExternalCopy();
      const isolationErrorStart = errors.length;
      const corruptSource = await page.evaluate(
        (path) => window.__greybox.addFromElectronFolder(path),
        EXTERNAL_COK_DIR,
      );
      // This file was in the authorized scan, then its parent becomes a junction before read.
      // Canonical validation must catch the post-scan swap rather than trust the lexical prefix.
      rmSync(resolve(EXTERNAL_COK_DIR, 'escape-link'), { recursive: true, force: true });
      symlinkSync(ELECTRON_DIR, resolve(EXTERNAL_COK_DIR, 'escape-link'), 'junction');
      const sourceProbe = await page.evaluate(async ({ cleanId, corruptId }) => {
        const read = (id, path, maxLength) => window.__greybox.readElectronFileForTest(id, path, maxLength);
        const rejected = async (id, path, maxLength = 4) => {
          try {
            await read(id, path, maxLength);
            return null;
          } catch (error) {
            return error instanceof Error ? error.message : String(error);
          }
        };
        return {
          clean: await read(cleanId, 'ECL1.DAX', 4),
          corrupt: await read(corruptId, 'ECL1.DAX', 4),
          validDotDotPrefix: await read(corruptId, '..notes.dat', 4),
          zeroLength: await read(cleanId, 'ECL1.DAX', 0),
          invalidLengthError: await rejected(cleanId, 'ECL1.DAX', -1),
          forgedError: await rejected('00000000-0000-4000-8000-000000000000', 'ECL1.DAX'),
          traversalError: await rejected(cleanId, '../package.json'),
          canonicalError: await rejected(corruptId, 'escape-link/package.json'),
        };
      }, { cleanId: result.sourceId, corruptId: corruptSource.sourceId });
      const cleanExpected = Array.from(readFileSync(resolve(COK_DOS_FOLDER, 'ECL1.DAX')).subarray(0, 4));
      const isolationEntries = await page.$$('.lib-entry');
      if (isolationEntries[0]) await page.evaluate((entry) => entry.click(), isolationEntries[0]);
      await page.waitForFunction('window.__dialogue?.pictureId?.() === 112', { timeout: 60000 }).catch(() => {});
      const cleanAfterSecondPick = await page.evaluate(`({
        picture: window.__dialogue?.pictureId?.() ?? null,
        status: document.querySelector('#status')?.textContent ?? '',
        rendered: window.__rendered ?? null
      })`);
      const isolationOk = corruptSource?.ok && corruptSource?.sourceId && result?.sourceId &&
        result.sourceId !== corruptSource.sourceId &&
        JSON.stringify(sourceProbe.clean) === JSON.stringify(cleanExpected) &&
        JSON.stringify(sourceProbe.corrupt) === JSON.stringify([255, 255, 255, 255]) &&
        JSON.stringify(sourceProbe.validDotDotPrefix) === JSON.stringify([1, 2, 3, 4]) &&
        JSON.stringify(sourceProbe.zeroLength) === JSON.stringify([]) &&
        /maxLength must be a non-negative safe integer/i.test(sourceProbe.invalidLengthError ?? '') &&
        /unknown or unauthorized asset source/i.test(sourceProbe.forgedError ?? '') &&
        /path escapes picked root/i.test(sourceProbe.traversalError ?? '') &&
        /canonical path escapes picked root/i.test(sourceProbe.canonicalError ?? '') &&
        isolationEntries.length === 2 && cleanAfterSecondPick.picture === 112 &&
        !/could not load/i.test(cleanAfterSecondPick.status) && errors.length === isolationErrorStart;
      results.push({
        id: 'electron-source-isolation',
        label: 'Electron shell: retained source A survives source B + forged/traversal reads reject',
        pass: !!isolationOk,
        detail: `cleanSource=${result?.sourceId} corruptSource=${corruptSource?.sourceId} probe=${JSON.stringify(sourceProbe)} entries=${isolationEntries.length} boot=${JSON.stringify(cleanAfterSecondPick)} errors=${JSON.stringify(errors.slice(isolationErrorStart))}`,
      });

      if (!onlySourceIsolation) {
        await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction('window.__greybox && typeof window.__greybox.addFromElectronFolder === "function"', { timeout: 30000 });
        await page.evaluate((path) => window.__greybox.addFromElectronFolder(path), COK_DOS_FOLDER);
      }
    }

    if (!onlyCoab && !onlyDok && !onlySourceIsolation) {
      if (!existsSync(resolve(FRUA_UA_ROOT, 'HEIRS.DSN', 'GAME001.DAT')) ||
          !existsSync(resolve(FRUA_UA_ROOT, 'HEIRS.DSN', 'GEO017.DAT')) ||
          !existsSync(resolve(FRUA_UA_ROOT, 'DISK2', 'MONST.GLB')) ||
          !existsSync(resolve(FRUA_UA_ROOT, 'DISK1', 'ITEM.DAT')) ||
          !existsSync(resolve(FRUA_UA_ROOT, 'DISK1', 'ITEMS.DAT'))) {
        results.push({
          id: 'frua-heirs-route',
          label: 'Electron shell: UA-root FRUA HEIRS route (SKIP: install absent)',
          pass: true,
          detail: `missing HEIRS.DSN or DISK2/MONST.GLB or DISK1 item tables beneath ${FRUA_UA_ROOT}`,
        });
      } else {
        await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(
          'window.__greybox && typeof window.__greybox.importFruaFromElectronFolder === "function"',
          { timeout: 30000 },
        );
        const fruaErrorStart = errors.length;
        const importedFrua = await page.evaluate(
          ({ path, designPrefix }) => window.__greybox.importFruaFromElectronFolder(path, designPrefix),
          { path: FRUA_UA_ROOT, designPrefix: 'HEIRS.DSN' },
        );
        const fruaSourceProbe = importedFrua?.sourceId ? await page.evaluate(async (sourceId) => ({
          monster: await window.__greybox.readElectronFileForTest(sourceId, 'DISK2/MONST.GLB', 4),
          geo001: await window.__greybox.readElectronFileForTest(sourceId, 'HEIRS.DSN/GEO001.DAT', 4),
          itemDat: await window.__greybox.readElectronFileForTest(sourceId, 'DISK1/ITEM.DAT', 4),
          itemsDat: await window.__greybox.readElectronFileForTest(sourceId, 'DISK1/ITEMS.DAT', 4),
        }), importedFrua.sourceId) : null;
        // Validator/source warnings are rendered inside every Library row. A text search for
        // "module 17" can therefore match an earlier module's warning before the actual Den
        // checkpoint. Resolve the row from the Library's structured projection and stable index.
        const clickedFrua = await page.evaluate(({ moduleNumber, entryPointId }) => {
          const library = window.__greybox.getLibrary();
          const index = library.findIndex((entry) => entry.kind === 'module' &&
            entry.fruaModuleNumber === moduleNumber && entry.entryPointId === entryPointId);
          const row = index >= 0
            ? document.querySelector(`.lib-entry[data-lib-index="${index}"]`)
            : null;
          row?.click();
          return !!row;
        }, { moduleNumber: importedFrua?.selectedModule, entryPointId: importedFrua?.entryPointId });
        let fruaRoute = null;
        if (clickedFrua) {
          await page.waitForFunction('window.__module?.loaded?.() && window.__rendered === 576', { timeout: 30000 })
            .catch(async (error) => {
              const state = await page.evaluate(`({
                module: window.__module ? {
                  loaded: window.__module.loaded?.() ?? null,
                  title: window.__module.title?.() ?? null,
                  map: window.__module.mapName?.() ?? null,
                  dims: window.__module.dims?.() ?? null
                } : null,
                rendered: window.__rendered ?? null,
                status: document.querySelector('#status')?.textContent ?? '',
                library: (window.__greybox?.getLibrary?.() ?? []).map((entry, index) => ({
                  index,
                  kind: entry.kind,
                  title: entry.title,
                  fileName: entry.fileName,
                  fruaModuleNumber: entry.fruaModuleNumber,
                  entryPointId: entry.entryPointId,
                  validationOk: entry.validation?.ok ?? null,
                  validationWarnings: entry.validation?.warnings?.length ?? null
                }))
              })`);
              throw new Error(`FRUA module 17 host did not become ready: ${error.message}; ${JSON.stringify(state)}`);
            });
          const start = await page.evaluate(`({
            title: window.__module.title(), map: window.__module.mapName(), dims: window.__module.dims(),
            pose: window.__module.getPose(), visited: window.__module.automapVisitedCount(), rendered: window.__rendered
          })`);
          const turned = await page.evaluate('window.__module.move("right")');
          const stepped = await page.evaluate('window.__module.move("forward")');
          const end = await page.evaluate(`({
            log: window.__module.eventLog(), dom: document.querySelector('#module-eventline')?.textContent ?? '',
            visited: window.__module.automapVisitedCount(), pose: window.__module.getPose()
          })`);
          fruaRoute = { start, turned, stepped, end };
        }
        const clickedQuestion = await page.evaluate(() => {
          const entry = [...document.querySelectorAll('.lib-entry')].find((node) => /Caravan question checkpoint/i.test(node.textContent ?? ''));
          entry?.click();
          return !!entry;
        });
        let fruaQuestion = null;
        let reimportedFrua = null;
        if (clickedQuestion) {
          await page.waitForFunction('window.__module?.loaded?.() && window.__module.mapName() === "HEIRS.DSN/GEO001"', { timeout: 30000 });
          await page.evaluate(() => localStorage.removeItem(window.__module.saveKey()));
          const start = await page.evaluate('window.__module.getPose()');
          const turn = await page.evaluate('window.__module.move("left")');
          const first = await page.evaluate('window.__module.move("forward")');
          const second = await page.evaluate('window.__module.move("forward")');
          const paused = await page.evaluate(`({
            awaiting: window.__module.awaiting(), log: window.__module.eventLog(), pose: window.__module.getPose(),
            visited: window.__module.automapVisitedCount(), consumed: window.__module.isConsumed(11)
          })`);
          const blocked = await page.evaluate('window.__module.move("forward")');
          const saveWhilePaused = await page.evaluate('window.__module.save()');
          await page.evaluate('window.__module.answerChoice(4)');
          const yell1 = await page.evaluate(`({
            awaiting: window.__module.awaiting(), log: window.__module.eventLog(), pose: window.__module.getPose(),
            visited: window.__module.automapVisitedCount()
          })`);
          await page.evaluate('window.__module.answerChoice(4)');
          const yell2 = await page.evaluate(`({
            awaiting: window.__module.awaiting(), log: window.__module.eventLog(), pose: window.__module.getPose(),
            visited: window.__module.automapVisitedCount()
          })`);
          await page.evaluate('window.__module.answerChoice(2)');
          const end = await page.evaluate(`({
            awaiting: window.__module.awaiting(), log: window.__module.eventLog(), pose: window.__module.getPose(),
            state: window.__module.eventState()
          })`);
          const off = await page.evaluate('window.__module.move("forward")');
          const revisit = await page.evaluate('window.__module.move("back")');
          const revisitState = await page.evaluate(`({
            awaiting: window.__module.awaiting(), log: window.__module.eventLog(), pose: window.__module.getPose(),
            consumed: window.__module.isConsumed(11)
          })`);
          const savePose = await page.evaluate('window.__module.move("forward")');
          const saved = await page.evaluate('window.__module.save()');
          const savedRaw = await page.evaluate(() => JSON.parse(localStorage.getItem(window.__module.saveKey()) || 'null'));

          await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForFunction(
            'window.__greybox && typeof window.__greybox.importFruaFromElectronFolder === "function"',
            { timeout: 30000 },
          );
          reimportedFrua = await page.evaluate(
            ({ path, designPrefix }) => window.__greybox.importFruaFromElectronFolder(path, designPrefix),
            { path: FRUA_UA_ROOT, designPrefix: 'HEIRS.DSN' },
          );
          const reclicked = await page.evaluate(() => {
            const entry = [...document.querySelectorAll('.lib-entry')].find((node) => /Caravan question checkpoint/i.test(node.textContent ?? ''));
            entry?.click();
            return !!entry;
          });
          if (reclicked) {
            await page.waitForFunction('window.__module?.loaded?.() && window.__module.mapName() === "HEIRS.DSN/GEO001"', { timeout: 30000 });
          }
          const fresh = await page.evaluate(`({ pose: window.__module.getPose(), consumed: window.__module.isConsumed(11) })`);
          const loadedSave = await page.evaluate('window.__module.load()');
          const loadedState = await page.evaluate(`({
            pose: window.__module.getPose(), state: window.__module.eventState(), awaiting: window.__module.awaiting()
          })`);
          const reloadRevisit = await page.evaluate('window.__module.move("back")');
          const reloadRevisitState = await page.evaluate(`({
            awaiting: window.__module.awaiting(), log: window.__module.eventLog(), pose: window.__module.getPose(),
            consumed: window.__module.isConsumed(11)
          })`);
          await page.evaluate(() => localStorage.removeItem(window.__module.saveKey()));
          fruaQuestion = {
            start, turn, first, second, paused, blocked, saveWhilePaused, yell1, yell2, end,
            off, revisit, revisitState, savePose, saved, savedRaw, reclicked, fresh, loadedSave,
            loadedState, reloadRevisit, reloadRevisitState,
          };
        }

        // Renderer navigation discards the in-memory Library/runtime. Re-select the UA root to get
        // a distinct native source capability, then take HELP through the real tactical overlay.
        // This is intentionally described as renderer navigation + reselection, not process restart.
        await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(
          'window.__greybox && typeof window.__greybox.importFruaFromElectronFolder === "function"',
          { timeout: 30000 },
        );
        const helpImportedFrua = await page.evaluate(
          ({ path, designPrefix }) => window.__greybox.importFruaFromElectronFolder(path, designPrefix),
          { path: FRUA_UA_ROOT, designPrefix: 'HEIRS.DSN' },
        );
        const clickedHelp = await page.evaluate(() => {
          const entry = [...document.querySelectorAll('.lib-entry')].find((node) => /Caravan question checkpoint/i.test(node.textContent ?? ''));
          entry?.click();
          return !!entry;
        });
        let fruaHelp = null;
        let helpReloadedFrua = null;
        if (clickedHelp) {
          await page.waitForFunction('window.__module?.loaded?.() && window.__module.mapName() === "HEIRS.DSN/GEO001"', { timeout: 30000 });
          await page.evaluate(() => localStorage.removeItem(window.__module.saveKey()));
          const source = await page.evaluate('window.__module.monsterSource()');
          const itemSource = await page.evaluate('window.__module.itemSource()');
          const start = await page.evaluate('window.__module.getPose()');
          const turn = await page.evaluate('window.__module.move("left")');
          const first = await page.evaluate('window.__module.move("forward")');
          const second = await page.evaluate('window.__module.move("forward")');
          await page.evaluate('window.__module.answerChoice(1)');
          await page.waitForFunction(
            'window.__module?.awaiting?.() === "combat" && window.__combat?.isOverlay?.() === true',
            { timeout: 30000 },
          );
          const tactical = await page.evaluate(() => {
            const combatants = window.__combat.combatants();
            const enemies = combatants.filter((combatant) => combatant.side === 'enemy');
            const guards = combatants.filter((combatant) => combatant.side === 'party' && combatant.name === 'ROAD GUARD');
            const enemyCounts = Object.fromEntries(
              [...new Set(enemies.map((combatant) => combatant.name))]
                .sort()
                .map((name) => [name, enemies.filter((combatant) => combatant.name === name).length]),
            );
            const occupied = combatants.flatMap((combatant) => {
              const cells = [];
              const size = combatant.size ?? 1;
              for (let dr = 0; dr < size; dr++) {
                for (let dc = 0; dc < size; dc++) cells.push(`${combatant.pos.col + dc},${combatant.pos.row + dr}`);
              }
              return cells;
            });
            return {
              enemyCounts,
              enemyTotal: enemies.length,
              guardCount: guards.length,
              guardsAreTemporaryNpcs: guards.every((guard) => guard.npcControlled && !guard.persistentPartyMember),
              friendlyNpcCount: window.__combat.friendlyNpcIds().length,
              persistentPartyCount: window.__combat.persistentPartyIds().length,
              overlapCount: window.__combat.placementOverlapCount(),
              idsUnique: new Set(combatants.map((combatant) => combatant.id)).size === combatants.length,
              footprintsUnique: new Set(occupied).size === occupied.length,
              overlay: window.__combat.isOverlay(),
            };
          });
          // The direct module seam must be inert while the overlay owns this result.
          const directResumeGuard = await page.evaluate(() => {
            window.__module.answerCombat('victory');
            return {
              awaiting: window.__module.awaiting(), overlay: window.__combat.isOverlay(),
              phase: window.__combat.phase(),
            };
          });
          const blocked = await page.evaluate('window.__module.move("forward")');
          const saveWhileCombat = await page.evaluate('window.__module.save()');
          const loadWhileCombat = await page.evaluate('window.__module.load()');
          const frozen = await page.evaluate(`({
            awaiting: window.__module.awaiting(), pose: window.__module.getPose(),
            launching: window.__module.combatLaunching(), source: window.__module.monsterSource(),
            itemSource: window.__module.itemSource()
          })`);
          const combatFlow = await page.evaluate(() => {
            const forcedOutcome = window.__combat.forcePartyVictory();
            const forcedPhase = window.__combat.phase();
            const forcedOver = window.__combat.isOver();
            const declined = window.__combat.declineContinueBattle();
            const victoryPhase = window.__combat.phase();
            const afterAcknowledge = window.__combat.acknowledgeVictory();
            const treasure = window.__combat.treasure();
            // Empty scripted treasure is normalized to no haul, so acknowledgement should finish
            // directly. Keep the real treasure traversal fallback for future non-empty fixtures.
            if (window.__combat.phase() === 'treasure') {
              window.__combat.takeAllTreasure();
              window.__combat.exitTreasure();
              if (window.__combat.treasureExitPending()) window.__combat.declineRemainingTreasure();
            }
            return {
              forcedOutcome, forcedPhase, forcedOver, declined, victoryPhase, afterAcknowledge,
              treasure, finalPhase: window.__combat.phase(), finalOutcome: window.__combat.outcome(),
            };
          });
          await page.evaluate('window.__combat.dismiss()');
          await page.waitForFunction(
            'window.__module?.awaiting?.() === null && window.__combat?.isOverlay?.() === false',
            { timeout: 30000 },
          );
          const end = await page.evaluate(`({
            awaiting: window.__module.awaiting(), log: window.__module.eventLog(),
            pose: window.__module.getPose(), state: window.__module.eventState(),
            source: window.__module.monsterSource(), itemSource: window.__module.itemSource(),
            receipts: window.__module.treasureReceipts(),
            dom: document.querySelector('#module-eventline')?.textContent ?? ''
          })`);
          const off = await page.evaluate('window.__module.move("forward")');
          const revisit = await page.evaluate('window.__module.move("back")');
          const revisitState = await page.evaluate(`({
            awaiting: window.__module.awaiting(), log: window.__module.eventLog(), state: window.__module.eventState(),
            receipts: window.__module.treasureReceipts(),
            receiptPanel: document.querySelector('#module-treasure-receipts')?.textContent ?? ''
          })`);
          const savePose = await page.evaluate('window.__module.move("forward")');
          const saved = await page.evaluate('window.__module.save()');
          const savedRaw = await page.evaluate(() => JSON.parse(localStorage.getItem(window.__module.saveKey()) || 'null'));

          await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForFunction(
            'window.__greybox && typeof window.__greybox.importFruaFromElectronFolder === "function"',
            { timeout: 30000 },
          );
          helpReloadedFrua = await page.evaluate(
            ({ path, designPrefix }) => window.__greybox.importFruaFromElectronFolder(path, designPrefix),
            { path: FRUA_UA_ROOT, designPrefix: 'HEIRS.DSN' },
          );
          const reclicked = await page.evaluate(() => {
            const entry = [...document.querySelectorAll('.lib-entry')].find((node) => /Caravan question checkpoint/i.test(node.textContent ?? ''));
            entry?.click();
            return !!entry;
          });
          if (reclicked) {
            await page.waitForFunction('window.__module?.loaded?.() && window.__module.mapName() === "HEIRS.DSN/GEO001"', { timeout: 30000 });
          }
          const fresh = await page.evaluate(`({
            pose: window.__module.getPose(), state: window.__module.eventState(), source: window.__module.monsterSource(),
            itemSource: window.__module.itemSource(), receipts: window.__module.treasureReceipts()
          })`);
          const loadedSave = await page.evaluate('window.__module.load()');
          const loadedState = await page.evaluate(`({
            pose: window.__module.getPose(), state: window.__module.eventState(), awaiting: window.__module.awaiting(),
            source: window.__module.monsterSource(), itemSource: window.__module.itemSource(),
            receipts: window.__module.treasureReceipts(),
            receiptPanel: document.querySelector('#module-treasure-receipts')?.textContent ?? ''
          })`);
          const reloadRevisit = await page.evaluate('window.__module.move("back")');
          const reloadRevisitState = await page.evaluate(`({
            awaiting: window.__module.awaiting(), log: window.__module.eventLog(), state: window.__module.eventState(),
            receipts: window.__module.treasureReceipts(),
            receiptPanel: document.querySelector('#module-treasure-receipts')?.textContent ?? ''
          })`);
          await page.evaluate(() => localStorage.removeItem(window.__module.saveKey()));
          fruaHelp = {
            source, itemSource, start, turn, first, second, tactical, directResumeGuard, blocked,
            saveWhileCombat, loadWhileCombat, frozen, combatFlow, end, off, revisit,
            revisitState, savePose, saved, savedRaw, reclicked, fresh, loadedSave,
            loadedState, reloadRevisit, reloadRevisitState,
          };
        }
        const monsterSource = {
          path: 'DISK2/MONST.GLB',
          sha256: 'b402b28fd48c5fcdfa7b6f1c8744fdf1621f511758d38d6e21772f618f6bf3de',
        };
        const itemSource = {
          itemDat: {
            path: 'DISK1/ITEM.DAT',
            sha256: '00dcfdea515ec9021ff70f9104d68c6f2aa2d204c350ae80ff26a19664862211',
          },
          itemsDat: {
            path: 'DISK1/ITEMS.DAT',
            sha256: '87ef0a1b564c282f24156d07492b0e8b83a6f383a629463e99249af985217fcb',
          },
        };
        const fruaImportOk = importedFrua?.ok && importedFrua.title === 'Heirs to skull crag' &&
          importedFrua.fileCount > 35 && importedFrua.mapCount === 26 &&
          importedFrua.selectedModule === 17 && importedFrua.entryPointId > 0 && importedFrua.questionEntryPointId > 0 &&
          JSON.stringify(importedFrua.bestiarySource) === JSON.stringify(monsterSource) &&
          JSON.stringify(importedFrua.itemSource) === JSON.stringify(itemSource);
        const fruaRouteOk = JSON.stringify(fruaRoute?.start) === JSON.stringify({
          title: 'Heirs to skull crag', map: 'HEIRS.DSN/GEO017', dims: { w: 24, h: 24 },
          pose: { x: 1, y: 0, facing: 'east' }, visited: 1, rendered: 576,
        }) && JSON.stringify(fruaRoute?.turned) === JSON.stringify({ x: 1, y: 0, facing: 'south' }) &&
          JSON.stringify(fruaRoute?.stepped) === JSON.stringify({ x: 1, y: 1, facing: 'south' }) &&
          fruaRoute?.end?.log === 'THE ODOR AND PHYSICAL EVIDENCE SUGGEST THAT THIS CAVE IS THE DEN OF SOME ILL-BRED FLYING CREATURES. ' &&
          fruaRoute?.end?.dom === fruaRoute.end.log && fruaRoute?.end?.visited === 2 &&
          JSON.stringify(fruaRoute?.end?.pose) === JSON.stringify(fruaRoute?.stepped);
        const questionPrompt = 'THE PARTY SEES A CARAVAN UNDER ATTACK BY HUNGRY MONSTERS. WHAT DOES IT DO? ';
        const questionButtons = `${questionPrompt}\n1) HELP THEM\n2) SLINK AWAY\n3) GO FOR HELP\n4) YELL`;
        const questionYell = 'ONE OF THE MONSTERS LOOKS UP FROM THE FIGHT, BUT IT IS SO INTENT ON GORGING ITSELF UPON TRADERS AND WINNING ITSELF SOME LOOT THAT IT IGNORES THE PARTY.';
        const questionSlink = 'AS THE PARTY RETREATS IT HEARS THE SCREAMS OF INNOCENT TRADERS BEING SLAUGHTERED BY HUNGRY MONSTERS.';
        const yell1Log = `${questionButtons}\n${questionYell}\n${questionButtons}`;
        const yell2Log = `${yell1Log}\n${questionYell}\n${questionButtons}`;
        const expectedState = { version: 1, moduleId: 'HEIRS.DSN', consumedEventIds: [11, 13] };
        const fruaQuestionOk = JSON.stringify(fruaQuestion?.start) === JSON.stringify({ x: 7, y: 13, facing: 'south' }) &&
          JSON.stringify(fruaQuestion?.turn) === JSON.stringify({ x: 7, y: 13, facing: 'east' }) &&
          JSON.stringify(fruaQuestion?.first) === JSON.stringify({ x: 8, y: 13, facing: 'east' }) &&
          JSON.stringify(fruaQuestion?.second) === JSON.stringify({ x: 9, y: 13, facing: 'east' }) &&
          fruaQuestion?.paused?.awaiting === 'choice' && fruaQuestion.paused.log === questionButtons &&
          fruaQuestion.paused.visited === 3 && fruaQuestion.paused.consumed === true &&
          JSON.stringify(fruaQuestion?.blocked) === JSON.stringify(fruaQuestion?.second) &&
          fruaQuestion?.saveWhilePaused === false && fruaQuestion?.yell1?.awaiting === 'choice' &&
          fruaQuestion.yell1.log === yell1Log && fruaQuestion.yell1.visited === 3 &&
          fruaQuestion?.yell2?.awaiting === 'choice' && fruaQuestion.yell2.log === yell2Log &&
          fruaQuestion.yell2.visited === 3 && JSON.stringify(fruaQuestion.yell1.pose) === JSON.stringify(fruaQuestion.second) &&
          JSON.stringify(fruaQuestion.yell2.pose) === JSON.stringify(fruaQuestion.second) &&
          fruaQuestion?.end?.awaiting === null && fruaQuestion.end.log === `${yell2Log}\n${questionSlink}` &&
          JSON.stringify(fruaQuestion?.end?.pose) === JSON.stringify(fruaQuestion?.second) &&
          JSON.stringify(fruaQuestion?.end?.state) === JSON.stringify(expectedState) &&
          JSON.stringify(fruaQuestion?.off) === JSON.stringify({ x: 10, y: 13, facing: 'east' }) &&
          JSON.stringify(fruaQuestion?.revisit) === JSON.stringify({ x: 9, y: 13, facing: 'east' }) &&
          fruaQuestion?.revisitState?.awaiting === null && fruaQuestion.revisitState.log === '' && fruaQuestion.revisitState.consumed &&
          JSON.stringify(fruaQuestion?.savePose) === JSON.stringify(fruaQuestion?.off) && fruaQuestion?.saved === true &&
          fruaQuestion?.savedRaw?.version === 2 &&
          JSON.stringify(fruaQuestion?.savedRaw?.position) === JSON.stringify({ area: 'HEIRS.DSN/GEO001', x: 10, y: 13, facing: 'east' }) &&
          JSON.stringify(fruaQuestion?.savedRaw?.moduleEventState) === JSON.stringify(expectedState) &&
          reimportedFrua?.ok && reimportedFrua?.sourceId && importedFrua?.sourceId && reimportedFrua.sourceId !== importedFrua.sourceId &&
          fruaQuestion?.reclicked && JSON.stringify(fruaQuestion?.fresh) === JSON.stringify({ pose: { x: 7, y: 13, facing: 'south' }, consumed: false }) &&
          fruaQuestion?.loadedSave === true && fruaQuestion?.loadedState?.awaiting === null &&
          JSON.stringify(fruaQuestion?.loadedState?.pose) === JSON.stringify(fruaQuestion?.savePose) &&
          JSON.stringify(fruaQuestion?.loadedState?.state) === JSON.stringify(expectedState) &&
          JSON.stringify(fruaQuestion?.reloadRevisit) === JSON.stringify({ x: 9, y: 13, facing: 'east' }) &&
          fruaQuestion?.reloadRevisitState?.awaiting === null && fruaQuestion.reloadRevisitState.log === '' &&
          fruaQuestion.reloadRevisitState.consumed === true;
        const expectedMonsterHead = Array.from(readFileSync(resolve(FRUA_UA_ROOT, 'DISK2', 'MONST.GLB')).subarray(0, 4));
        const expectedGeoHead = Array.from(readFileSync(resolve(FRUA_UA_ROOT, 'HEIRS.DSN', 'GEO001.DAT')).subarray(0, 4));
        const expectedItemDatHead = Array.from(readFileSync(resolve(FRUA_UA_ROOT, 'DISK1', 'ITEM.DAT')).subarray(0, 4));
        const expectedItemsDatHead = Array.from(readFileSync(resolve(FRUA_UA_ROOT, 'DISK1', 'ITEMS.DAT')).subarray(0, 4));
        const fruaSourceOk = JSON.stringify(fruaSourceProbe?.monster) === JSON.stringify(expectedMonsterHead) &&
          JSON.stringify(fruaSourceProbe?.geo001) === JSON.stringify(expectedGeoHead) &&
          JSON.stringify(fruaSourceProbe?.itemDat) === JSON.stringify(expectedItemDatHead) &&
          JSON.stringify(fruaSourceProbe?.itemsDat) === JSON.stringify(expectedItemsDatHead) &&
          [importedFrua, reimportedFrua, helpImportedFrua, helpReloadedFrua]
            .every((item) => item?.ok && item?.sourceId &&
              JSON.stringify(item.bestiarySource) === JSON.stringify(monsterSource) &&
              JSON.stringify(item.itemSource) === JSON.stringify(itemSource)) &&
          new Set([importedFrua.sourceId, reimportedFrua.sourceId, helpImportedFrua.sourceId, helpReloadedFrua.sourceId]).size === 4;

        // Native-fs parity for the paired item capability. Every case is a real external selected
        // folder containing pristine HEIRS maps + MONST.GLB, with exactly one item table missing or
        // one-byte corrupt. Combat must still use the source bestiary, then event 45 must halt before
        // it is consumed or represented in the durable receipt ledger.
        const itemNegativeResults = [];
        for (const itemCase of [
          { mode: 'corrupt', target: 'ITEM.DAT' },
          { mode: 'missing', target: 'ITEM.DAT' },
          { mode: 'corrupt', target: 'ITEMS.DAT' },
          { mode: 'missing', target: 'ITEMS.DAT' },
        ]) {
          makeFruaItemCapabilityCopy(itemCase.mode, itemCase.target);
          await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForFunction(
            'window.__greybox && typeof window.__greybox.importFruaFromElectronFolder === "function"',
            { timeout: 30000 },
          );
          const negativeImport = await page.evaluate(
            ({ path, designPrefix }) => window.__greybox.importFruaFromElectronFolder(path, designPrefix),
            { path: EXTERNAL_FRUA_ITEM_DIR, designPrefix: 'HEIRS.DSN' },
          );
          const negativeEntries = await page.evaluate('window.__greybox.getLibrary()');
          const selected = await page.evaluate(() => {
            const entry = [...document.querySelectorAll('.lib-entry')]
              .find((node) => /Caravan question checkpoint/i.test(node.textContent ?? ''));
            entry?.click();
            return !!entry;
          });
          if (selected) {
            await page.waitForFunction(
              'window.__module?.loaded?.() && window.__module.mapName() === "HEIRS.DSN/GEO001"',
              { timeout: 30000 },
            );
          }
          await page.evaluate(() => localStorage.removeItem(window.__module.saveKey()));
          await page.evaluate('window.__module.move("left")');
          await page.evaluate('window.__module.move("forward")');
          await page.evaluate('window.__module.move("forward")');
          await page.evaluate('window.__module.answerChoice(1)');
          await page.waitForFunction(
            'window.__module?.awaiting?.() === "combat" && window.__combat?.isOverlay?.() === true',
            { timeout: 30000 },
          );
          const tactical = await page.evaluate(() => ({
            enemyTotal: window.__combat.combatants().filter((combatant) => combatant.side === 'enemy').length,
            source: window.__module.monsterSource(), itemSource: window.__module.itemSource(),
          }));
          await page.evaluate(() => {
            window.__combat.forcePartyVictory();
            if (window.__combat.phase() === 'continue-battle') window.__combat.declineContinueBattle();
            if (window.__combat.phase() === 'victory') window.__combat.acknowledgeVictory();
            if (window.__combat.phase() === 'treasure') {
              window.__combat.takeAllTreasure();
              window.__combat.exitTreasure();
              if (window.__combat.treasureExitPending()) window.__combat.declineRemainingTreasure();
            }
            window.__combat.dismiss();
          });
          await page.waitForFunction(
            'window.__module?.awaiting?.() === null && window.__combat?.isOverlay?.() === false',
            { timeout: 30000 },
          );
          const stopped = await page.evaluate(`({
            log: window.__module.eventLog(), state: window.__module.eventState(),
            consumed45: window.__module.isConsumed(45), receipts: window.__module.treasureReceipts(),
            source: window.__module.monsterSource(), itemSource: window.__module.itemSource()
          })`);
          const haltState = { version: 1, moduleId: 'HEIRS.DSN', consumedEventIds: [11, 12, 14] };
          const ok = negativeImport?.ok && negativeImport.mapCount === 26 && negativeImport.sourceId &&
            JSON.stringify(negativeImport.bestiarySource) === JSON.stringify(monsterSource) &&
            negativeImport.itemSource === undefined && negativeEntries.length === 3 &&
            negativeEntries.every((entry) =>
              JSON.stringify(entry.bestiarySource) === JSON.stringify(monsterSource) && entry.itemSource === undefined) &&
            selected && tactical.enemyTotal === 37 &&
            JSON.stringify(tactical.source) === JSON.stringify(monsterSource) && tactical.itemSource === null &&
            stopped.log.endsWith('[event halted: Unsupported FRUA event 45: Give Treasure]') &&
            JSON.stringify(stopped.state) === JSON.stringify(haltState) && stopped.consumed45 === false &&
            JSON.stringify(stopped.receipts) === JSON.stringify([]) &&
            JSON.stringify(stopped.source) === JSON.stringify(monsterSource) && stopped.itemSource === null;
          itemNegativeResults.push({ ...itemCase, ok, negativeImport, tactical, stopped });
        }
        const fruaItemNegativeOk = itemNegativeResults.every((itemCase) => itemCase.ok);
        const helpIntro = 'THE PARTY JOINS THE FIGHT TO RESCUE THE CARAVAN.';
        const helpThanks1 = 'THE CARAVAN LEADER IS MORE THAN APPRECIATIVE, ';
        const helpThanks2 = '"WE ARE VERY GRATEFUL TO YOU FOR SAVING OUR LIVES. OUR CARAVAN IS OUR WAY OF LIFE; WITHOUT IT WE WOULD BE LESS THAN NOTHING. PLEASE ACCEPT THESE GIFTS WITH OUR BLESSINGS."';
        const rewardLine = 'Treasure received: 125 platinum, 3 gems, 5 jewelry; items: Long Sword, Potion, Arrow (bundle of 10), Arrow (bundle of 10).';
        const aftermath1 = 'AFTER SHOWING THE PARTY HIS GRATITUDE, THE LEADER SPEAKS UP, ';
        const aftermath2 = '"THE ROADS HAVE BECOME HAZARDOUS SINCE THE DEATH OF THE ROADWARDEN. I KNOW SIR DUTIOCS IS DOING HIS BEST, BUT THE SITUATION IS GETTING OUT OF CONTROL."';
        const aftermath3 = '"THE ROADS ARE JUST TOO DANGEROUS TO TRAVEL; I\'M GOING TO HAVE TO HIRE MORE GUARDS AND RAISE MY PRICES AGAIN. FOLKS IN SKULL CRAG AREN\'T GOING TO LIKE THAT VERY MUCH!"';
        const helpLog = `${questionButtons}\n${helpIntro}\n${helpThanks1}\n${helpThanks2}\n${rewardLine}\n${aftermath1}\n${aftermath2}\n${aftermath3}`;
        const rawReceipt = {
          type: 'giveTreasure', eventId: 45, platinum: 125, gems: 3, jewelry: 5,
          items: [96, 246, 80, 80], itemsIdentified: false,
        };
        const helpState = {
          version: 1, moduleId: 'HEIRS.DSN', consumedEventIds: [11, 12, 14, 45],
          treasureReceipts: [rawReceipt],
        };
        const itemDatBytes = readFileSync(resolve(FRUA_UA_ROOT, 'DISK1', 'ITEM.DAT'));
        const itemsDatBytes = readFileSync(resolve(FRUA_UA_ROOT, 'DISK1', 'ITEMS.DAT'));
        const receiptShapeOk = (receipts) => {
          if (!Array.isArray(receipts) || receipts.length !== 1) return false;
          const receipt = receipts[0];
          if (receipt?.eventId !== 45 || receipt.platinum !== 125 || receipt.gems !== 3 ||
              receipt.jewelry !== 5 || receipt.itemsIdentified !== false || !Array.isArray(receipt.items) ||
              receipt.items.length !== 4 ||
              JSON.stringify(JSON.parse(JSON.stringify(receipts))) !== JSON.stringify(receipts)) return false;
          const expected = [
            { ordinal: 1, id: 96, displayName: 'Long Sword', identifiedName: 'Long Sword +2', bundleCount: 0,
              baseTypeId: 18, weightCoins: 60, valuePlatinum: 1000, magicBonus: 2, identifyMask: 6,
              charges: 0, effectCode: 0, baseName: 'Long Sword' },
            { ordinal: 2, id: 246, displayName: 'Potion', identifiedName: 'Potion of Invisibility', bundleCount: 0,
              baseTypeId: 47, weightCoins: 20, valuePlatinum: 100, magicBonus: 1, identifyMask: 6,
              charges: 1, effectCode: 97, baseName: 'Special Item' },
            { ordinal: 3, id: 80, displayName: 'Arrow', identifiedName: 'Arrow +2', bundleCount: 10,
              baseTypeId: 30, weightCoins: 2, valuePlatinum: 6, magicBonus: 2, identifyMask: 6,
              charges: 0, effectCode: 0, baseName: 'Arrow(s)' },
            { ordinal: 4, id: 80, displayName: 'Arrow', identifiedName: 'Arrow +2', bundleCount: 10,
              baseTypeId: 30, weightCoins: 2, valuePlatinum: 6, magicBonus: 2, identifyMask: 6,
              charges: 0, effectCode: 0, baseName: 'Arrow(s)' },
          ];
          return receipt.items.every((item, index) => {
            const wanted = expected[index];
            const source = item?.source;
            const expectedRaw = Array.from(itemDatBytes.subarray((wanted.id - 1) * 18, wanted.id * 18));
            const expectedBaseRaw = Array.from(itemsDatBytes.subarray(wanted.baseTypeId * 16, (wanted.baseTypeId + 1) * 16));
            return item.ordinal === wanted.ordinal && item.id === wanted.id && item.displayName === wanted.displayName &&
              item.identifiedName === wanted.identifiedName && item.bundleCount === wanted.bundleCount &&
              source?.id === wanted.id && source.baseTypeId === wanted.baseTypeId &&
              source.name === wanted.identifiedName && source.unidentifiedName === wanted.displayName &&
              source.weightCoins === wanted.weightCoins && source.valuePlatinum === wanted.valuePlatinum &&
              source.magicBonus === wanted.magicBonus && source.identifyMask === wanted.identifyMask &&
              source.bundleCount === wanted.bundleCount && source.charges === wanted.charges &&
              source.effectCode === wanted.effectCode && Array.isArray(source.raw) &&
              JSON.stringify(source.raw) === JSON.stringify(expectedRaw) &&
              source.base?.id === wanted.baseTypeId && source.base.name === wanted.baseName &&
              Array.isArray(source.base.raw) && JSON.stringify(source.base.raw) === JSON.stringify(expectedBaseRaw);
          });
        };
        const fruaHelpOk = clickedHelp &&
          JSON.stringify(fruaHelp?.source) === JSON.stringify(monsterSource) &&
          JSON.stringify(fruaHelp?.itemSource) === JSON.stringify(itemSource) &&
          JSON.stringify(fruaHelp?.start) === JSON.stringify({ x: 7, y: 13, facing: 'south' }) &&
          JSON.stringify(fruaHelp?.turn) === JSON.stringify({ x: 7, y: 13, facing: 'east' }) &&
          JSON.stringify(fruaHelp?.first) === JSON.stringify({ x: 8, y: 13, facing: 'east' }) &&
          JSON.stringify(fruaHelp?.second) === JSON.stringify({ x: 9, y: 13, facing: 'east' }) &&
          fruaHelp?.tactical?.overlay === true && fruaHelp.tactical.enemyTotal === 37 &&
          JSON.stringify(fruaHelp.tactical.enemyCounts) === JSON.stringify({ ETTIN: 12, HOBGOBLIN: 20, 'HOBGOBLIN LDR': 5 }) &&
          fruaHelp.tactical.guardCount === 6 && fruaHelp.tactical.guardsAreTemporaryNpcs &&
          fruaHelp.tactical.friendlyNpcCount === 6 && fruaHelp.tactical.persistentPartyCount > 0 &&
          fruaHelp.tactical.overlapCount === 0 && fruaHelp.tactical.idsUnique && fruaHelp.tactical.footprintsUnique &&
          fruaHelp.directResumeGuard.awaiting === 'combat' && fruaHelp.directResumeGuard.overlay === true &&
          fruaHelp.directResumeGuard.phase !== 'over' &&
          JSON.stringify(fruaHelp.blocked) === JSON.stringify(fruaHelp.second) &&
          fruaHelp.saveWhileCombat === false && fruaHelp.loadWhileCombat === false &&
          fruaHelp.frozen.awaiting === 'combat' && fruaHelp.frozen.launching === true &&
          JSON.stringify(fruaHelp.frozen.pose) === JSON.stringify(fruaHelp.second) &&
          JSON.stringify(fruaHelp.frozen.source) === JSON.stringify(monsterSource) &&
          JSON.stringify(fruaHelp.frozen.itemSource) === JSON.stringify(itemSource) &&
          fruaHelp.combatFlow.forcedOutcome === 'party' && fruaHelp.combatFlow.forcedPhase === 'continue-battle' &&
          fruaHelp.combatFlow.forcedOver === true && fruaHelp.combatFlow.declined === true &&
          fruaHelp.combatFlow.victoryPhase === 'victory' && fruaHelp.combatFlow.afterAcknowledge === 'over' &&
          fruaHelp.combatFlow.treasure === null && fruaHelp.combatFlow.finalPhase === 'over' &&
          fruaHelp.combatFlow.finalOutcome === 'party' && fruaHelp.end.awaiting === null &&
          fruaHelp.end.log === helpLog && fruaHelp.end.dom === helpLog && receiptShapeOk(fruaHelp.end.receipts) &&
          JSON.stringify(fruaHelp.end.pose) === JSON.stringify(fruaHelp.second) &&
          JSON.stringify(fruaHelp.end.state) === JSON.stringify(helpState) &&
          JSON.stringify(fruaHelp.end.source) === JSON.stringify(monsterSource) &&
          JSON.stringify(fruaHelp.end.itemSource) === JSON.stringify(itemSource) &&
          JSON.stringify(fruaHelp.off) === JSON.stringify({ x: 10, y: 13, facing: 'east' }) &&
          JSON.stringify(fruaHelp.revisit) === JSON.stringify(fruaHelp.second) &&
          fruaHelp.revisitState.awaiting === null && fruaHelp.revisitState.log === '' &&
          JSON.stringify(fruaHelp.revisitState.state) === JSON.stringify(helpState) &&
          receiptShapeOk(fruaHelp.revisitState.receipts) && fruaHelp.revisitState.receiptPanel === rewardLine &&
          JSON.stringify(fruaHelp.savePose) === JSON.stringify(fruaHelp.off) && fruaHelp.saved === true &&
          fruaHelp.savedRaw?.version === 2 &&
          JSON.stringify(fruaHelp.savedRaw?.position) === JSON.stringify({ area: 'HEIRS.DSN/GEO001', x: 10, y: 13, facing: 'east' }) &&
          JSON.stringify(fruaHelp.savedRaw?.moduleEventState) === JSON.stringify(helpState) && fruaHelp.reclicked &&
          JSON.stringify(fruaHelp.fresh) === JSON.stringify({
            pose: { x: 7, y: 13, facing: 'south' },
            state: { version: 1, moduleId: 'HEIRS.DSN', consumedEventIds: [] },
            source: monsterSource,
            itemSource,
            receipts: [],
          }) && fruaHelp.loadedSave === true && fruaHelp.loadedState.awaiting === null &&
          JSON.stringify(fruaHelp.loadedState.pose) === JSON.stringify(fruaHelp.savePose) &&
          JSON.stringify(fruaHelp.loadedState.state) === JSON.stringify(helpState) &&
          JSON.stringify(fruaHelp.loadedState.source) === JSON.stringify(monsterSource) &&
          JSON.stringify(fruaHelp.loadedState.itemSource) === JSON.stringify(itemSource) &&
          receiptShapeOk(fruaHelp.loadedState.receipts) && fruaHelp.loadedState.receiptPanel === rewardLine &&
          JSON.stringify(fruaHelp.reloadRevisit) === JSON.stringify(fruaHelp.second) &&
          fruaHelp.reloadRevisitState.awaiting === null && fruaHelp.reloadRevisitState.log === '' &&
          JSON.stringify(fruaHelp.reloadRevisitState.state) === JSON.stringify(helpState) &&
          receiptShapeOk(fruaHelp.reloadRevisitState.receipts) &&
          fruaHelp.reloadRevisitState.receiptPanel === rewardLine;
        results.push({
          id: 'frua-heirs-route',
          label: 'Electron shell: UA-root HEIRS combat + exact Caravan reward/continuation/persistence',
          pass: !!(fruaImportOk && fruaSourceOk && fruaItemNegativeOk && clickedFrua && fruaRouteOk &&
            clickedQuestion && fruaQuestionOk && fruaHelpOk && errors.length === fruaErrorStart),
          detail: `importOk=${fruaImportOk} sourceOk=${fruaSourceOk} itemNegativeOk=${fruaItemNegativeOk} denOk=${fruaRouteOk} questionOk=${fruaQuestionOk} helpOk=${fruaHelpOk} imports=${JSON.stringify({ importedFrua, reimportedFrua, helpImportedFrua, helpReloadedFrua })} probe=${JSON.stringify(fruaSourceProbe)} itemNegatives=${JSON.stringify(itemNegativeResults)} help=${JSON.stringify(fruaHelp)} errors=${JSON.stringify(errors.slice(fruaErrorStart))}`,
        });
      }

      // The focused FRUA run stops here. The full suite remounts CoK because page navigation reset
      // the in-memory Library and HEIRS was deliberately imported from the UA install root.
      if (!onlyFrua) {
        await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction('window.__greybox && typeof window.__greybox.addFromElectronFolder === "function"', { timeout: 30000 });
        await page.evaluate((path) => window.__greybox.addFromElectronFolder(path), COK_DOS_FOLDER);
      }
    }

    if (!onlyCoab && !onlyDok && !onlyFrua && !onlySourceIsolation) {

    results.push(await runCokRetailTravel(page, errors));

    // Pool's Verified contract starts from the ordinary Library entry because ECL1#18 is both the
    // selected-folder opening area and the start of the continuous Holy Symbol route. Every archive
    // read, including ECL7 and GEO5 regional resources, stays on this native POOLRAD AssetSource.
    await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('window.__greybox && typeof window.__greybox.addFromElectronFolder === "function"', { timeout: 30000 });
    await page.evaluate(() => {
      localStorage.removeItem('greybox.save.cok.quick');
      localStorage.removeItem('greybox.inventory.cok');
      const party = Array.from({ length: 6 }, (_, index) => ({
        name: `Electron Pool ${index + 1}`,
        race: 'human', sex: 'male', classes: { fighter: 20 },
        abilities: { str: 18, strPct: 100, int: 10, wis: 10, dex: 18, con: 18, cha: 10 },
        hp: 500, maxHp: 500, baseAc: -10, ac: -10, thac0: 0,
        savingThrows: { paralyzePoisonDeath: 2, petrifyPolymorph: 2, rodStaffWand: 2, breath: 2, spell: 2 },
      }));
      localStorage.setItem('greybox.party.cok', JSON.stringify(party));
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('window.__greybox && typeof window.__greybox.addFromElectronFolder === "function"', { timeout: 30000 });
    const poolErrorStart = errors.length;
    const poolDetected = await page.evaluate((path) => window.__greybox.addFromElectronFolder(path), POOL_DOS_FOLDER);
    const clickedPool = await page.evaluate(() => {
      const entry = [...document.querySelectorAll('.lib-entry')].find((node) => /Pool of Radiance/i.test(node.textContent ?? ''));
      entry?.click();
      return !!entry;
    });
    let poolRoute = null;
    if (clickedPool) {
      await page.waitForFunction('window.__explore?.currentArea?.().disk === 1 && window.__explore.currentArea().areaId === 18', { timeout: 60000 }).catch(async () => {
        if (await page.evaluate('window.__explore?.currentArea?.().disk === 1 && window.__explore.currentArea().areaId === 18')) return;
        const state = await page.evaluate('({ rendered: window.__rendered, status: document.querySelector("#status")?.textContent ?? "", area: window.__explore?.currentArea?.() ?? null, dialogue: window.__dialogue ? { kind: window.__dialogue.kind(), text: window.__dialogue.text() } : null })');
        throw new Error(`Electron Pool selected-folder opening did not mount area 18: ${JSON.stringify(state)}`);
      });
      const start = await page.evaluate(`({
        area: window.__explore.currentArea(), pose: window.__explore.getPose(),
        seeds: [window.__explore.areaMemory(0x4a38), window.__explore.areaMemory(0x4a35)]
      })`);
      // pool-single-source-graphics: Pool has no calibrated alternate explorer art source. This
      // explicitly prevents the release contract from turning that absence into a false switch.
      const graphics = await page.evaluate(() => {
        const pose0 = window.__explore.getPose();
        const available = window.__explore.graphicsAvailable();
        const selected = window.__explore.setGraphicsMode('DOS-EGA');
        return { available, selected, pose0, pose1: window.__explore.getPose() };
      });
      // pool-companion-checkpoints: every panel is populated and must leave campaign pose intact.
      const companion = await page.evaluate(() => {
        const pose0 = window.__explore.getPose();
        const opened = window.__explore.openCompanion();
        const tabs = {};
        window.__companion.switchTo('journal'); tabs.journal = window.__companion.journalListedCount();
        window.__companion.switchTo('refdb'); tabs.refdb = window.__companion.refEntryCount();
        window.__companion.switchTo('automap'); tabs.automap = window.__companion.automapVisitedCount();
        window.__companion.switchTo('hud'); tabs.hud = window.__companion.hudRows().length;
        window.__companion.switchTo('char'); tabs.char = window.__companion.charCount();
        window.__companion.close();
        return { opened, tabs, pose0, pose1: window.__explore.getPose(), closed: !window.__explore.companionOpen() };
      });

      for (const action of ['right','forward','forward','forward','right','forward','forward','forward','forward','forward','left','forward','right','forward','left','forward']) {
        await page.evaluate((move) => window.__explore.move(move), action);
      }
      await page.waitForFunction('window.__dialogue?.open?.()', { timeout: 20000 }).catch(async () => {
        const state = await page.evaluate('({ pose: window.__explore?.getPose?.() ?? null, combat: window.__explore?.combatOpen?.() ?? null, enemies: window.__combat?.combatants?.().filter((actor) => actor.side === "enemy").map((actor) => actor.name) ?? [], event: window.__explore?.lastEvent?.() ?? "", dialogue: window.__dialogue ? { kind: window.__dialogue.kind(), text: window.__dialogue.text(), choices: window.__dialogue.choices() } : null, status: document.querySelector("#status")?.textContent ?? "" })');
        throw new Error(`Electron Pool route did not reach ORC LEADER menu: ${JSON.stringify(state)}`);
      });
      const orcMenu = await page.evaluate('({ pose: window.__explore.getPose(), choices: window.__dialogue.choices() })');
      await chooseDialogueLabel(page, 'ATTACK');
      const orcFight = await finishPoolVictory(page, true);
      const acquired = await page.evaluate('({ types: window.__explore.partyItemTypes(), consumed: window.__explore.areaMemory(0x4a38) })');

      const openedTravel = await page.evaluate(() => {
        const button = [...document.querySelectorAll('button')].find((node) => /Regional travel/i.test(node.textContent ?? ''));
        button?.click();
        return !!button;
      });
      await page.waitForFunction('window.__poolTravel?.open?.() && window.__dialogue?.open?.()', { timeout: 60000 }).catch(async () => {
        if (await page.evaluate('window.__poolTravel?.open?.() && window.__dialogue?.open?.()')) return;
        const state = await page.evaluate('({ travel: window.__poolTravel?.open?.() ?? null, position: window.__poolTravel?.position?.() ?? null, dialogue: window.__dialogue ? { kind: window.__dialogue.kind(), text: window.__dialogue.text(), choices: window.__dialogue.choices() } : null, status: document.querySelector("#status")?.textContent ?? "" })');
        throw new Error(`Electron Pool regional host did not open: ${JSON.stringify(state)}`);
      });
      const western = await page.evaluate('({ position: window.__poolTravel.position(), choices: window.__dialogue.choices(), text: window.__dialogue.text() })');
      await chooseDialogueLabel(page, 'LEAVE');
      if (await page.evaluate('window.__dialogue?.kind?.() === "end"')) await page.evaluate('window.__dialogue.close()');
      const northeast = await page.evaluate('window.__poolTravel.move(1)');
      const east = await page.evaluate('window.__poolTravel.move(2)');
      await page.waitForFunction('window.__dialogue?.open?.()', { timeout: 20000 });
      const eastern = await page.evaluate('({ position: window.__poolTravel.position(), choices: window.__dialogue.choices(), text: window.__dialogue.text() })');
      await chooseDialogueLabel(page, 'SOUTH');
      await page.waitForFunction('window.__explore?.currentArea?.().areaId === 24', { timeout: 60000 }).catch(async () => {
        if (await page.evaluate('window.__explore?.currentArea?.().areaId === 24')) return;
        const state = await page.evaluate('({ area: window.__explore?.currentArea?.() ?? null, travel: window.__poolTravel?.open?.() ?? null, position: window.__poolTravel?.position?.() ?? null, dialogue: window.__dialogue ? { kind: window.__dialogue.kind(), text: window.__dialogue.text(), choices: window.__dialogue.choices() } : null, status: document.querySelector("#status")?.textContent ?? "" })');
        throw new Error(`Electron Pool SOUTH transition did not mount area 24: ${JSON.stringify(state)}`);
      });
      const landing = await page.evaluate(`({
        area: window.__explore.currentArea(), pose: window.__explore.getPose(),
        world: [window.__explore.areaMemory(0x49c3), window.__explore.areaMemory(0x49c4), window.__explore.areaMemory(0x49c5)],
        types: window.__explore.partyItemTypes()
      })`);

      await walkAbsolute(page, ['west','west','north','north','west','west','west','west','west','west','west','west','south','west','south','west','south','west','south','south']);
      await page.waitForFunction('window.__dialogue?.open?.()', { timeout: 20000 });
      const templePose = await page.evaluate('window.__explore.getPose()');
      await chooseDialogueLabel(page, 'LET HIM TOUCH YOU');
      const welcome = await page.evaluate(`({
        text: window.__dialogue?.text?.() ?? '', combat: window.__explore.combatOpen(),
        guard: window.__explore.areaMemory(0x4a0f), types: window.__explore.partyItemTypes()
      })`);
      if (await page.evaluate('window.__dialogue?.kind?.() === "end"')) await page.evaluate('window.__dialogue.close()');
      const saved = await page.evaluate(`({
        area: window.__explore.currentArea(), pose: window.__explore.getPose(),
        world: [window.__explore.areaMemory(0x49c3), window.__explore.areaMemory(0x49c4), window.__explore.areaMemory(0x49c5)],
        types: window.__explore.partyItemTypes(), has: (window.__explore.save(), window.__explore.hasSave())
      })`);

      // Recreate the renderer and its source capability before load. Capabilities are intentionally
      // renderer-owned, so re-selection proves the saved route remounts from Pool after restart.
      await page.evaluate(() => {
        localStorage.setItem('greybox.party.cok', '[]');
        localStorage.setItem('greybox.inventory.cok', '{}');
      });
      await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction('window.__greybox && typeof window.__greybox.addFromElectronFolder === "function"', { timeout: 30000 });
      const redetected = await page.evaluate((path) => window.__greybox.addFromElectronFolder(path), POOL_DOS_FOLDER);
      const reclicked = await page.evaluate(() => {
        const entry = [...document.querySelectorAll('.lib-entry')].find((node) => /Pool of Radiance/i.test(node.textContent ?? ''));
        entry?.click();
        return !!entry;
      });
      await page.waitForFunction('window.__explore?.currentArea?.().areaId === 18', { timeout: 60000 }).catch(async () => {
        if (await page.evaluate('window.__explore?.currentArea?.().areaId === 18')) return;
        const state = await page.evaluate('({ area: window.__explore?.currentArea?.() ?? null, status: document.querySelector("#status")?.textContent ?? "" })');
        throw new Error(`Electron Pool reselected route did not remount area 18: ${JSON.stringify(state)}`);
      });
      const accepted = await page.evaluate('window.__explore.load()');
      await page.waitForFunction('window.__explore?.currentArea?.().areaId === 24', { timeout: 60000 }).catch(async () => {
        if (await page.evaluate('window.__explore?.currentArea?.().areaId === 24')) return;
        const state = await page.evaluate('({ accepted: window.__explore?.hasSave?.() ?? null, area: window.__explore?.currentArea?.() ?? null, status: document.querySelector("#status")?.textContent ?? "" })');
        throw new Error(`Electron Pool save did not restore area 24: ${JSON.stringify(state)}`);
      });
      const restored = await page.evaluate(`({
        area: window.__explore.currentArea(), pose: window.__explore.getPose(),
        world: [window.__explore.areaMemory(0x49c3), window.__explore.areaMemory(0x49c4), window.__explore.areaMemory(0x49c5)],
        types: window.__explore.partyItemTypes(), combat: window.__explore.combatOpen()
      })`);
      poolRoute = { start, graphics, companion, orcMenu, orcFight, acquired, openedTravel, western, northeast, east, eastern, landing, templePose, welcome, saved, redetected, reclicked, accepted, restored };
    }
    const poolDetectedOk = poolDetected?.ok && poolDetected?.match?.profileId === 'pool-of-radiance' &&
      poolDetected?.match?.platform === 'DOS' && poolDetected?.fileCount > 50;
    const poolRedetectedOk = poolRoute?.redetected?.ok && poolRoute.redetected?.match?.profileId === 'pool-of-radiance';
    const poolGraphicsOk = Array.isArray(poolRoute?.graphics?.available) && poolRoute.graphics.available.length === 0 &&
      poolRoute?.graphics?.selected === null && JSON.stringify(poolRoute?.graphics?.pose0) === JSON.stringify(poolRoute?.graphics?.pose1);
    const poolCompanionOk = poolRoute?.companion?.opened && poolRoute?.companion?.closed && poolRoute?.companion?.tabs?.journal > 0 &&
      poolRoute?.companion?.tabs?.refdb > 0 && poolRoute?.companion?.tabs?.automap > 0 && poolRoute?.companion?.tabs?.hud === 6 &&
      poolRoute?.companion?.tabs?.char === 6 && JSON.stringify(poolRoute?.companion?.pose0) === JSON.stringify(poolRoute?.companion?.pose1);
    const poolQuestOk = JSON.stringify(poolRoute?.start) === JSON.stringify({ area: { disk: 1, areaId: 18 }, pose: { x: 9, y: 2, facing: 'north' }, seeds: [0, 255] }) &&
      JSON.stringify(poolRoute?.orcMenu) === JSON.stringify({ pose: { x: 14, y: 8, facing: 'east' }, choices: ['LEAVE', 'GREET', 'ATTACK'] }) &&
      JSON.stringify(poolRoute?.orcFight?.enemies) === JSON.stringify(['ORC LEADER']) && poolRoute?.orcFight?.treasure?.names?.includes('6 Leather Holy Symbol') &&
      poolRoute?.acquired?.types?.includes(74) && poolRoute?.acquired?.consumed === 2 && poolRoute?.openedTravel &&
      JSON.stringify(poolRoute?.western?.position) === JSON.stringify({ x: 11, y: 28 }) &&
      JSON.stringify(poolRoute?.western?.choices) === JSON.stringify(['NORTH', 'SOUTH', 'LEAVE']) && /WESTERN EDGE OF THE CITY/i.test(poolRoute?.western?.text ?? '') &&
      poolRoute?.northeast === true && poolRoute?.east === true && JSON.stringify(poolRoute?.eastern?.position) === JSON.stringify({ x: 13, y: 27 }) &&
      JSON.stringify(poolRoute?.eastern?.choices) === JSON.stringify(['NORTH', 'SOUTH', 'BOAT', 'LEAVE']) && /EASTERN EDGE OF THE CITY/i.test(poolRoute?.eastern?.text ?? '') &&
      JSON.stringify(poolRoute?.landing) === JSON.stringify({ area: { disk: 1, areaId: 24 }, pose: { x: 15, y: 4, facing: 'west' }, world: [13, 27, 24], types: poolRoute?.landing?.types }) &&
      poolRoute?.landing?.types?.includes(74) && JSON.stringify(poolRoute?.templePose) === JSON.stringify({ x: 2, y: 7, facing: 'south' }) &&
      /FINDING THE LEATHER HOLY SYMBOL.*WELCOME TO THE TEMPLE OF BANE/is.test(poolRoute?.welcome?.text ?? '') &&
      !poolRoute?.welcome?.combat && poolRoute?.welcome?.guard === 0 && poolRoute?.welcome?.types?.includes(74);
    const poolPersistenceOk = poolRoute?.saved?.has && poolRedetectedOk && poolRoute?.reclicked && poolRoute?.accepted === true &&
      JSON.stringify(poolRoute?.restored?.area) === JSON.stringify(poolRoute?.saved?.area) &&
      JSON.stringify(poolRoute?.restored?.pose) === JSON.stringify(poolRoute?.saved?.pose) &&
      JSON.stringify(poolRoute?.restored?.world) === JSON.stringify(poolRoute?.saved?.world) &&
      poolRoute?.restored?.types?.includes(74) && !poolRoute?.restored?.combat;
    results.push({
      id: 'electron-pool-verified-route',
      label: 'Electron shell: selected-folder Pool Holy Symbol quest + regional host + Temple gate + persistence',
      pass: !!(poolDetectedOk && clickedPool && poolGraphicsOk && poolCompanionOk && poolQuestOk && poolPersistenceOk && errors.length === poolErrorStart),
      detail: `detected=${poolDetectedOk} clicked=${clickedPool} graphics=${poolGraphicsOk} companion=${poolCompanionOk} quest=${poolQuestOk} persistence=${poolPersistenceOk} errors=${JSON.stringify(errors.slice(poolErrorStart))} route=${JSON.stringify(poolRoute)}`,
    });
    }

    if (!onlyDok && !onlyFrua && !onlySourceIsolation) {
    // CoAB's Verified contract reuses its existing byte-proven ECL4#37 natural encounter. The
    // Library chooser retains the selected folder's AssetSource; no wider Tilverton-to-temple UI
    // journey is introduced or implied by this release acceptance route.
    await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('window.__greybox && typeof window.__greybox.addFromElectronFolder === "function"', { timeout: 30000 });
    await page.evaluate(() => {
      localStorage.removeItem('greybox.save.cok.quick');
      localStorage.removeItem('greybox.inventory.cok');
      const party = Array.from({ length: 6 }, (_, index) => ({
        name: `Electron CoAB ${index + 1}`,
        race: 'human', sex: 'male', classes: { fighter: 20 },
        abilities: { str: 18, strPct: 100, int: 10, wis: 10, dex: 18, con: 18, cha: 10 },
        hp: 500, maxHp: 500, baseAc: -10, ac: -10, thac0: 0,
        savingThrows: { paralyzePoisonDeath: 2, petrifyPolymorph: 2, rodStaffWand: 2, breath: 2, spell: 2 },
      }));
      localStorage.setItem('greybox.party.cok', JSON.stringify(party));
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('window.__greybox && typeof window.__greybox.addFromElectronFolder === "function"', { timeout: 30000 });
    const coabErrorStart = errors.length;
    const coabDetected = await page.evaluate((path) => window.__greybox.addFromElectronFolder(path), COAB_DOS_FOLDER);
    const clickedCoab = await page.evaluate(() => {
      const entry = [...document.querySelectorAll('.lib-entry')].find((node) => /Curse of the Azure Bonds/i.test(node.textContent ?? ''));
      entry?.click();
      return !!entry;
    });
    const selectedCoabEncounter = clickedCoab && await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((node) => /Verified Medusa\/Griffon encounter/i.test(node.textContent ?? ''));
      button?.click();
      return !!button;
    });
    let coabRoute = null;
    if (selectedCoabEncounter) {
      await page.waitForFunction('window.__explore?.currentArea?.().disk === 4 && window.__explore.currentArea().areaId === 37', { timeout: 60000 }).catch(async () => {
        if (await page.evaluate('window.__explore?.currentArea?.().disk === 4 && window.__explore.currentArea().areaId === 37')) return;
        const state = await page.evaluate('({ area: window.__explore?.currentArea?.() ?? null, status: document.querySelector("#status")?.textContent ?? "", rendered: window.__rendered })');
        throw new Error(`Electron CoAB selected-folder route did not mount area 37: ${JSON.stringify(state)}`);
      });
      const start = await page.evaluate('({ area: window.__explore.currentArea(), pose: window.__explore.getPose(), flag: window.__explore.areaMemory(0x4cf4) })');
      // coab-single-source-graphics: CoAB has one calibrated DOS-EGA explorer source. This is a
      // constraint assertion and must not be presented as an alternate-graphics switch.
      const graphics = await page.evaluate(() => {
        const pose0 = window.__explore.getPose();
        const available = window.__explore.graphicsAvailable();
        const selected = window.__explore.setGraphicsMode('DOS-EGA');
        return { available, selected, pose0, pose1: window.__explore.getPose() };
      });
      // coab-companion-checkpoints: every panel is populated and leaves the campaign pose intact.
      const companion = await page.evaluate(() => {
        const pose0 = window.__explore.getPose();
        const opened = window.__explore.openCompanion();
        const tabs = {};
        window.__companion.switchTo('journal'); tabs.journal = window.__companion.journalListedCount();
        window.__companion.switchTo('refdb'); tabs.refdb = window.__companion.refEntryCount();
        window.__companion.switchTo('automap'); tabs.automap = window.__companion.automapVisitedCount();
        window.__companion.switchTo('hud'); tabs.hud = window.__companion.hudRows().length;
        window.__companion.switchTo('char'); tabs.char = window.__companion.charCount();
        window.__companion.close();
        return { opened, tabs, pose0, pose1: window.__explore.getPose(), closed: !window.__explore.companionOpen() };
      });

      const actions = [
        'right', 'forward', 'right', 'forward', 'forward', 'left',
        'forward', 'forward', 'forward', 'forward', 'forward', 'forward',
        'left', 'forward', 'forward', 'forward', 'right', 'forward', 'forward',
        'left', 'forward', 'left', 'forward', 'forward', 'forward', 'right',
        'forward', 'left', 'forward', 'forward', 'forward', 'forward', 'forward', 'forward', 'forward',
      ];
      const walkLeg = async (leg) => {
        for (const action of leg) await page.evaluate((move) => window.__explore.move(move), action);
      };
      const incidentalRosters = [];
      for (const leg of [actions.slice(0, 4), actions.slice(4, 12), actions.slice(12, 27)]) {
        await walkLeg(leg);
        await waitForCoabEnemyCombat(page, `prerequisite-${incidentalRosters.length + 1}`);
        incidentalRosters.push(await finishCoabRouteCombat(page));
      }
      await walkLeg(actions.slice(27));
      await waitForCoabEnemyCombat(page, 'target');
      const target = await page.evaluate('window.__explore.getPose()');
      const enemies = await page.evaluate('window.__combat.combatants().filter((actor) => actor.side === "enemy").map((actor) => actor.name)');
      await finishCoabRouteCombat(page);
      const resumed = await page.evaluate('window.__explore.areaMemory(0x4cf4)');
      const saved = await page.evaluate('({ area: window.__explore.currentArea(), pose: window.__explore.getPose(), clock: window.__explore.clockMinutes(), flag: window.__explore.areaMemory(0x4cf4), party: window.__explore.party(), has: (window.__explore.save(), window.__explore.hasSave()) })');

      // Recreate the renderer and reselect the native folder before loading. This proves that the
      // stored campaign remounts through CoAB's selected AssetSource instead of a repository path.
      await page.evaluate(() => {
        localStorage.setItem('greybox.party.cok', '[]');
        localStorage.setItem('greybox.inventory.cok', '{}');
      });
      await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction('window.__greybox && typeof window.__greybox.addFromElectronFolder === "function"', { timeout: 30000 });
      const redetected = await page.evaluate((path) => window.__greybox.addFromElectronFolder(path), COAB_DOS_FOLDER);
      const reclicked = await page.evaluate(() => {
        const entry = [...document.querySelectorAll('.lib-entry')].find((node) => /Curse of the Azure Bonds/i.test(node.textContent ?? ''));
        entry?.click();
        return !!entry;
      });
      const reselected = reclicked && await page.evaluate(() => {
        const button = [...document.querySelectorAll('button')].find((node) => /Verified Medusa\/Griffon encounter/i.test(node.textContent ?? ''));
        button?.click();
        return !!button;
      });
      if (reselected) await page.waitForFunction('window.__explore?.currentArea?.().areaId === 37', { timeout: 60000 }).catch(async () => {
        if (await page.evaluate('window.__explore?.currentArea?.().areaId === 37')) return;
        const state = await page.evaluate('({ area: window.__explore?.currentArea?.() ?? null, status: document.querySelector("#status")?.textContent ?? "" })');
        throw new Error(`Electron CoAB reselected route did not remount area 37: ${JSON.stringify(state)}`);
      });
      const accepted = reselected ? await page.evaluate('window.__explore.load()') : false;
      if (accepted) await page.waitForFunction('window.__explore?.currentArea?.().areaId === 37', { timeout: 60000 }).catch(async () => {
        if (await page.evaluate('window.__explore?.currentArea?.().areaId === 37')) return;
        const state = await page.evaluate('({ area: window.__explore?.currentArea?.() ?? null, status: document.querySelector("#status")?.textContent ?? "" })');
        throw new Error(`Electron CoAB save did not restore area 37: ${JSON.stringify(state)}`);
      });
      const restored = accepted ? await page.evaluate('({ area: window.__explore.currentArea(), pose: window.__explore.getPose(), clock: window.__explore.clockMinutes(), flag: window.__explore.areaMemory(0x4cf4), party: window.__explore.party(), combat: window.__explore.combatOpen() })') : null;
      coabRoute = { start, graphics, companion, incidentalRosters, target, enemies, resumed, saved, redetected, reclicked, reselected, accepted, restored };
    }
    const coabDetectedOk = coabDetected?.ok && coabDetected?.match?.profileId === 'curse-of-the-azure-bonds' &&
      coabDetected?.match?.platform === 'DOS' && coabDetected?.fileCount > 50;
    const coabRedetectedOk = coabRoute?.redetected?.ok && coabRoute.redetected?.match?.profileId === 'curse-of-the-azure-bonds' &&
      coabRoute.redetected?.match?.platform === 'DOS';
    const coabGraphicsOk = Array.isArray(coabRoute?.graphics?.available) && coabRoute.graphics.available.length === 0 &&
      coabRoute?.graphics?.selected === null && JSON.stringify(coabRoute?.graphics?.pose0) === JSON.stringify(coabRoute?.graphics?.pose1);
    const coabCompanionOk = coabRoute?.companion?.opened && coabRoute?.companion?.closed && coabRoute?.companion?.tabs?.journal > 0 &&
      coabRoute?.companion?.tabs?.refdb > 0 && coabRoute?.companion?.tabs?.automap > 0 && coabRoute?.companion?.tabs?.hud === 6 &&
      coabRoute?.companion?.tabs?.char === 6 && JSON.stringify(coabRoute?.companion?.pose0) === JSON.stringify(coabRoute?.companion?.pose1);
    const coabCombatOk = JSON.stringify(coabRoute?.start) === JSON.stringify({ area: { disk: 4, areaId: 37 }, pose: { x: 6, y: 6, facing: 'north' }, flag: 0 }) &&
      JSON.stringify(coabRoute?.incidentalRosters) === JSON.stringify([
        ['MANTICORE', 'MANTICORE', 'MANTICORE'],
        ['OTYUGH'],
        ['MANTICORE', 'MANTICORE', 'MANTICORE', 'MANTICORE'],
      ]) &&
      JSON.stringify(coabRoute?.target) === JSON.stringify({ x: 5, y: 3, facing: 'west' }) &&
      // ECL4#37's byte-backed retail roster is three medusas plus five griffons; see
      // docs/engine/research/coab-natural-encounter-route.md. Keep this selected-folder proof
      // aligned with the source contract instead of the older capped three-griffon expectation.
      JSON.stringify(coabRoute?.enemies) === JSON.stringify([
        'HOODED MEDUSA', 'HOODED MEDUSA', 'HOODED MEDUSA',
        'GRIFFON', 'GRIFFON', 'GRIFFON', 'GRIFFON', 'GRIFFON',
      ]) &&
      coabRoute?.resumed === 0x4c;
    const coabPersistenceOk = coabRoute?.saved?.has && coabRedetectedOk && coabRoute?.reclicked && coabRoute?.reselected && coabRoute?.accepted === true &&
      JSON.stringify(coabRoute?.restored?.area) === JSON.stringify(coabRoute?.saved?.area) &&
      JSON.stringify(coabRoute?.restored?.pose) === JSON.stringify(coabRoute?.saved?.pose) &&
      coabRoute?.restored?.clock === coabRoute?.saved?.clock && coabRoute?.restored?.flag === coabRoute?.saved?.flag &&
      JSON.stringify(coabRoute?.restored?.party) === JSON.stringify(coabRoute?.saved?.party) && !coabRoute?.restored?.combat;
    results.push({
      id: 'electron-coab-verified-route',
      label: 'Electron shell: selected-folder CoAB Medusa/Griffon combat + Companion + persistent resume',
      pass: !!(coabDetectedOk && clickedCoab && selectedCoabEncounter && coabGraphicsOk && coabCompanionOk && coabCombatOk && coabPersistenceOk && errors.length === coabErrorStart),
      detail: `detected=${coabDetectedOk} clicked=${clickedCoab} selected=${selectedCoabEncounter} graphics=${coabGraphicsOk} companion=${coabCompanionOk} combat=${coabCombatOk} persistence=${coabPersistenceOk} errors=${JSON.stringify(errors.slice(coabErrorStart))} route=${JSON.stringify(coabRoute)}`,
    });
    }

    if (!onlyCoab && !onlyFrua && !onlySourceIsolation) {

    if (!onlyDok && !onlyFrua && !onlySourceIsolation) {
    // Secret's Library chooser deliberately retains the selected AssetSource while exposing its
    // independently byte-proven Hydra route; this is the native-folder counterpart of the browser
    // natural-combat proof, not a bundled-query shortcut.
    const secretDetected = await page.evaluate((path) => window.__greybox.addFromElectronFolder(path), SECRET_DOS_FOLDER);
    const clickedSecret = await page.evaluate(() => {
      const entry = [...document.querySelectorAll('.lib-entry')].find((node) => /Secret of the Silver Blades/i.test(node.textContent ?? ''));
      entry?.click();
      return !!entry;
    });
    const selectedHydra = clickedSecret && await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((node) => /Verified Hydra encounter/i.test(node.textContent ?? ''));
      button?.click();
      return !!button;
    });
    let secretRoute = null;
    if (selectedHydra) {
      let secretMounted = false;
      for (let poll = 0; poll < 300; poll++) {
        secretMounted = await page.evaluate('!!window.__explore');
        if (secretMounted) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!secretMounted) {
        const state = await page.evaluate('({ rendered: window.__rendered, status: document.querySelector("#status")?.textContent ?? "", dialogue: !!window.__dialogue, explore: !!window.__explore })');
        throw new Error(`Electron Secret selected-folder Hydra route did not mount: ${JSON.stringify(state)}`);
      }
      const start = await page.evaluate('({ area: window.__explore.currentArea(), pose: window.__explore.getPose(), seeds: [window.__explore.areaMemory(0x4cd0), window.__explore.areaMemory(0x4ccd)] })');
      // secret-single-source-graphics: Secret has no calibrated alternate retail art source.
      // Record that the mounted renderer intentionally exposes no false graphics switch.
      const graphics = await page.evaluate(() => {
        const pose0 = window.__explore.getPose();
        const available = window.__explore.graphicsAvailable();
        const selected = window.__explore.setGraphicsMode('DOS-EGA');
        return { available, selected, pose0, pose1: window.__explore.getPose() };
      });
      const companion = await page.evaluate(() => {
        const pose0 = window.__explore.getPose();
        const opened = window.__explore.openCompanion();
        const tabs = {};
        window.__companion.switchTo('journal');
        tabs.journal = window.__companion.journalListedCount();
        window.__companion.switchTo('refdb');
        tabs.refdb = window.__companion.refEntryCount();
        window.__companion.switchTo('automap');
        tabs.automap = window.__companion.automapVisitedCount();
        window.__companion.switchTo('hud');
        tabs.hud = window.__companion.hudRows().length;
        window.__companion.switchTo('char');
        tabs.char = window.__companion.charCount();
        window.__companion.close();
        return { opened, tabs, pose0, pose1: window.__explore.getPose(), closed: !window.__explore.companionOpen() };
      });
      const actions = ['forward','forward','forward','forward','forward','forward','forward','forward','forward','forward','right','forward','left','forward','right','forward','forward','right','forward','forward','forward'];
      for (const action of actions) await page.evaluate((move) => window.__explore.move(move), action);
      await page.waitForFunction('!!window.__combat', { timeout: 60000 });
      const enemies = await page.evaluate('window.__combat.combatants().filter((actor) => actor.side === "enemy").map((actor) => actor.name)');
      await page.evaluate('window.__combat.auto()');
      let phase = await page.evaluate('window.__combat.phase()');
      if (phase === 'continue-battle') { await page.evaluate('window.__combat.declineContinueBattle()'); phase = await page.evaluate('window.__combat.phase()'); }
      if (phase === 'victory') phase = await page.evaluate('window.__combat.acknowledgeVictory()');
      if (phase === 'treasure') { await page.evaluate('window.__combat.takeAllTreasure()'); await page.evaluate('window.__combat.exitTreasure()'); }
      await page.evaluate('window.__combat.dismiss()');
      await page.waitForFunction('!window.__explore.combatOpen()', { timeout: 5000 });
      const saved = await page.evaluate('({ pose: window.__explore.getPose(), area: window.__explore.currentArea(), flag: window.__explore.areaMemory(0x4ccd), saved: (window.__explore.save(), window.__explore.hasSave()) })');
      await page.evaluate('window.__explore.move("left")');
      const accepted = await page.evaluate('window.__explore.load()');
      const restored = await page.evaluate('({ pose: window.__explore.getPose(), area: window.__explore.currentArea(), flag: window.__explore.areaMemory(0x4ccd), combat: window.__explore.combatOpen() })');
      secretRoute = { start, graphics, companion, enemies, saved, accepted, restored };
    }
    const secretOk = secretDetected?.ok && secretDetected?.match?.profileId === 'secret-of-the-silver-blades' && selectedHydra &&
      JSON.stringify(secretRoute?.start) === JSON.stringify({ area: { disk: 3, areaId: 97 }, pose: { x: 4, y: 0, facing: 'east' }, seeds: [0x10, 0x20] }) &&
      JSON.stringify(secretRoute?.enemies) === JSON.stringify(Array(8).fill('12 HEADED HYDRA')) && secretRoute?.saved?.flag === 0x24 &&
      Array.isArray(secretRoute?.graphics?.available) && secretRoute.graphics.available.length === 0 && secretRoute?.graphics?.selected === null &&
      JSON.stringify(secretRoute?.graphics?.pose0) === JSON.stringify(secretRoute?.graphics?.pose1) &&
      secretRoute?.companion?.opened && secretRoute?.companion?.closed && secretRoute?.companion?.tabs?.journal > 0 &&
      secretRoute?.companion?.tabs?.refdb > 0 && secretRoute?.companion?.tabs?.automap > 0 && secretRoute?.companion?.tabs?.hud > 0 &&
      secretRoute?.companion?.tabs?.char > 0 && JSON.stringify(secretRoute?.companion?.pose0) === JSON.stringify(secretRoute?.companion?.pose1) &&
      secretRoute?.accepted === true && JSON.stringify(secretRoute?.restored?.pose) === JSON.stringify(secretRoute?.saved?.pose) &&
      JSON.stringify(secretRoute?.restored?.area) === JSON.stringify(secretRoute?.saved?.area) && secretRoute?.restored?.flag === 0x24 && !secretRoute?.restored?.combat;
    results.push({
      id: 'electron-secret-verified-route',
      label: 'Electron shell: selected-folder Secret Hydra combat + single-source graphics/Companion + ECL resume + persistence',
      pass: !!secretOk,
      detail: `detected=${JSON.stringify(secretDetected)} selectedHydra=${selectedHydra} route=${JSON.stringify(secretRoute)}`,
    });
    }

    // DoK's Verified candidate must use this same native selected-folder path. Build a disposable
    // copy of the clean DOS install and place the separately owned Amiga tile archive beside it so
    // the in-session graphics switch can be tested without ever modifying the user's source
    // folders. Detection must still select the DOS game profile; the DAA is a supplemental set.
    await page.goto(`${rendererBaseUrl}?create=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('window.__create && typeof window.__create.add === "function"', { timeout: 30000 });
    await page.evaluate(() => localStorage.removeItem('greybox.party.cok'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.__create', { timeout: 30000 });
    await page.evaluate(() => {
      window.__create.setName('Electron-DoK');
      window.__create.onlyClass('fighter', 7);
      window.__create.setAbilities({ str: 18, int: 10, wis: 12, dex: 16, con: 18, cha: 13 });
      window.__create.add();
    });
    await page.goto(rendererBaseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('window.__greybox && typeof window.__greybox.addFromElectronFolder === "function"', { timeout: 30000 });
    makeSelectedDokCopy();
    cpSync(DOK_AMIGA_TILES, resolve(EXTERNAL_DOK_DIR, '8x8d1.daa'));
    const dokDetected = await page.evaluate((path) => window.__greybox.addFromElectronFolder(path), EXTERNAL_DOK_DIR);
    const clickedDok = await page.evaluate(() => {
      const entry = [...document.querySelectorAll('.lib-entry')].find((node) => /Death Knights of Krynn/i.test(node.textContent ?? ''));
      entry?.click();
      return !!entry;
    });
    // DoK now exposes an explicit source-backed route chooser after Library selection. Drive its
    // public Explore control before waiting for opening dialogue; clicking the Library row alone
    // correctly leaves the renderer at that chooser.
    const selectedDokExplore = clickedDok && await page.evaluate(() => {
      const button = document.querySelector('button[data-route="dok"]');
      button?.click();
      return !!button;
    });
    const dok = selectedDokExplore ? await driveDokSelectedCampaign(page) : null;
    const graphicsSources = new Set(dok?.graphics?.provenance?.map((part) => part.source) ?? []);
    const graphicsCategories = new Set(dok?.graphics?.provenance?.map((part) => part.category) ?? []);
    // The real DoK Amiga wall-bank reassembly supplies all three categories,
    // as independently pinned by dungeonWallsAmigaDok.test.ts and web e2e.
    // Requiring the old mixed/DOS fallback would reject the completed decoder.
    const graphicsOk = !!dok && dok.graphics.available.includes('DOS-EGA') && dok.graphics.available.includes('Amiga') &&
      dok.graphics.amiga === 'Amiga' && dok.graphics.dos === 'DOS-EGA' && graphicsSources.has('Amiga') &&
      graphicsSources.size === 1 && graphicsCategories.size === 3 &&
      ['symbol set 0', 'symbol set 4', 'wall bricks (shared bank)'].every((category) => graphicsCategories.has(category)) &&
      /Amiga.*full coverage/i.test(dok.graphics.badge) && !/mixed/i.test(dok.graphics.badge) &&
      JSON.stringify(dok.graphics.pose0) === JSON.stringify(dok.graphics.pose1) && dok.graphics.checksum0 === dok.graphics.checksum2;
    const companionOk = !!dok && dok.companion.opened && dok.companion.closed && dok.companion.tabs.journal > 0 &&
      dok.companion.tabs.refdb > 0 && dok.companion.tabs.automap > 0 && dok.companion.tabs.hud > 0 &&
      dok.companion.tabs.char.count === 1 && dok.companion.tabs.char.name === 'Electron-DoK' &&
      JSON.stringify(dok.companion.pose0) === JSON.stringify(dok.companion.pose1);
    const routeOk = !!dok && dok.openingRoster === 12 && [112, 96, 113, 77].every((id) => dok.pictures.includes(id)) &&
      /A YEAR HAS PASSED SINCE MYRTANI WAS DEFEATED/i.test(dok.text.join(' ')) &&
      JSON.stringify(dok.upper.pose) === JSON.stringify({ x: 9, y: 7, facing: 'east' }) &&
      dok.upper.level === 1 && dok.upper.hostX === 9 && dok.upper.hostY === 7 &&
      dok.upper.hostFacing === 1 && dok.upper.hostFloor === 0x82 && dok.upper.localX === 9 &&
      dok.upper.localY === 7 && /SPIRAL STAIRS\. GO UP/i.test(dok.upper.lastEvent) &&
      /THE KEEP'S UPPER STORY/i.test(dok.text.join(' ')) &&
      JSON.stringify(dok.lower.pose) === JSON.stringify({ x: 8, y: 7, facing: 'west' }) &&
      dok.lower.level === 0 && dok.lower.hostX === 8 && dok.lower.hostY === 7 && dok.lower.hostFacing === 3 &&
      JSON.stringify(dok.commander.pose) === JSON.stringify({ x: 11, y: 8, facing: 'east' }) && dok.commander.duty === 1 &&
      dok.commander.quest === 1 && dok.commander.patrol === 1 && dok.ayn.visits === 4 && dok.ayn.quest === 2 &&
      dok.ayn.alert === 1 && JSON.stringify(dok.ayn.pose) === JSON.stringify({ x: 12, y: 12, facing: 'east' }) &&
      dok.exitFound && /LEAVE THE OUTPOST/i.test(dok.leave.text) && dok.wilderness.picture === 112 &&
      JSON.stringify(dok.wilderness.position) === JSON.stringify({ x: 33, y: 13 }) && dok.cekos.area.areaId === 34 &&
      // The shared tactical host now preserves ECL1#34's complete byte-backed LOAD_MONSTER
      // count instead of the historical six-figure display cap: SIVAK id 33 ×15.
      dok.cekos.worldX === 7 && dok.cekos.worldY === 13 && dok.sivaks.length === 15 && dok.sivaks.every((name) => name === 'SIVAK') &&
      /SIVAKS ARE GATHERED AROUND A TABLE/i.test(dok.sivakEvent) && dok.outcome.flag === 0x08 &&
      /SILVER KEY LIES ON THE TABLE/i.test(dok.outcome.status);
    const persistenceOk = !!dok && dok.saved.has && dok.saved.flag === 0x08 && dok.accepted === true &&
      JSON.stringify(dok.disturbed.pose) !== JSON.stringify(dok.saved.pose) && dok.disturbed.clock > dok.saved.clock &&
      JSON.stringify(dok.restored.pose) === JSON.stringify(dok.saved.pose) && dok.restored.clock === dok.saved.clock &&
      JSON.stringify(dok.restored.area) === JSON.stringify(dok.saved.area) && dok.restored.flag === 0x08 && !dok.refired;
    const detectedDok = dokDetected?.ok && dokDetected?.match?.profileId === 'death-knights-of-krynn' && dokDetected?.match?.platform === 'DOS';
    results.push({
      id: 'electron-dok-verified-route',
      label: 'Electron shell: selected-folder DoK campaign + graphics/Companion + persistent natural combat',
      pass: detectedDok && clickedDok && selectedDokExplore && routeOk && persistenceOk && graphicsOk && companionOk,
      detail: `detected=${detectedDok} clicked=${clickedDok} selected=${selectedDokExplore} route=${routeOk} persistence=${persistenceOk} graphics=${graphicsOk} companion=${companionOk} state=${JSON.stringify(dok)}`,
    });

    if (!onlyDok && !onlyFrua && !onlySourceIsolation) {
    // M7.S1 — real external folder, real native fs, real (corrupted) bytes: pick a SECOND
    // Library entry pointed at a copy of CoK outside the repo with ECL1.DAX corrupted, click
    // it (the real DOM path — onLibrarySelect(entry) with the real entry.assetSource), and
    // assert the dungeon load fails specifically because of the picked folder's own bytes.
    makeCorruptedExternalCopy();
    console.log('[e2e] M7.S1: corrupted copy made, calling addFromElectronFolder ...');
    const result2 = await page.evaluate(
      (path) => window.__greybox.addFromElectronFolder(path),
      EXTERNAL_COK_DIR,
    );
    console.log('[e2e] M7.S1: addFromElectronFolder ->', JSON.stringify(result2));
    const detected2 = result2 && result2.ok && result2.match && result2.match.profileId === 'champions-of-krynn'
      && result2.match.platform === 'DOS';
    const entryHandles = await page.$$('.lib-entry');
    console.log(`[e2e] M7.S1: found ${entryHandles.length} .lib-entry element(s)`);
    let rendered2 = -1;
    let statusText2 = '';
    if (entryHandles.length >= 2) {
      // A real puppeteer ElementHandle.click() (coordinate-based, via scrollIntoViewIfNeeded's
      // IntersectionObserver) hangs in this headless-Electron config — dispatch a native in-page
      // click instead. Still a genuine DOM MouseEvent through the real addEventListener('click', ...)
      // handler (renderLibrary() -> onSelectEntry(entry)), not a bypassed direct function call.
      await page.evaluate((el) => el.click(), entryHandles[entryHandles.length - 1]);
      console.log('[e2e] M7.S1: clicked last entry, waiting for window.__rendered ...');
      await page.waitForFunction('window.__rendered !== undefined', { timeout: 20000 });
      console.log('[e2e] M7.S1: window.__rendered is set, settling ...');
      await new Promise((res) => setTimeout(res, 500)); // let the click-triggered async load settle
      rendered2 = await page.evaluate('window.__rendered');
      statusText2 = await page.evaluate(() => document.querySelector('#status')?.textContent || '');
      console.log(`[e2e] M7.S1: rendered2=${rendered2} status="${statusText2}"`);
    }
    const failedAsExpected = rendered2 === 0 && /could not load (?:dungeon|cok opening)/i.test(statusText2);
    const pass2 = detected2 && entryHandles.length >= 2 && failedAsExpected;

    results.push({
      id: 'electron-real-assetsource',
      label: 'Electron shell: booted entry reads a REAL external folder\'s own bytes, not the bundled copy (M7.S1)',
      pass: pass2,
      detail: `detected2=${detected2} entries=${entryHandles.length} rendered2=${rendered2} status="${statusText2}"`,
    });
    }
    }
    }
    }
  } catch (e) {
    results.push({ id: onlyCokRestart ? 'electron-cok-process-restart' : onlyCokTravel ? 'electron-cok-retail-travel' : 'electron-detect-cok', label: 'Electron shell smoke test', pass: false, detail: e.message });
  } finally {
    try { browser?.disconnect(); } catch { /* ignore */ }
    let processExited = !owned;
    if (owned) {
      if (!owned.exited()) {
        owned.child.kill();
        try {
          await owned.waitForExit(10000);
        } catch (error) {
          console.error(`[e2e] refusing to remove Electron profile; PID ${owned.pid} did not exit: ${error.message}`);
        }
      }
      processExited = owned.exited();
      if (!processExited) {
        results.push({ id: 'electron-cleanup', label: 'Electron shell: owned process exited before profile cleanup', pass: false,
          detail: `PID ${owned.pid} is still running; preserved ${ELECTRON_E2E_PROFILE}` });
      }
    }
    if (!onlyCokTravel) {
      rmSync(EXTERNAL_COK_DIR, { recursive: true, force: true });
      rmSync(EXTERNAL_DOK_DIR, { recursive: true, force: true });
      rmSync(EXTERNAL_DOK_IMPORT_DIR, { recursive: true, force: true });
      rmSync(EXTERNAL_FRUA_ITEM_DIR, { recursive: true, force: true });
    }
    if (profileCreated && processExited) {
      rmSync(ELECTRON_E2E_PROFILE, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    } else if (profileCreated) {
      console.error(`[e2e] preserved disposable profile while Electron may still be running: ${ELECTRON_E2E_PROFILE}`);
    }
  }

  console.log('\n=== electron e2e results ===');
  let failed = 0;
  for (const r of results) {
    const tag = r.pass ? 'PASS' : (++failed, 'FAIL');
    console.log(`  [${tag}] ${r.label}` + (r.pass ? '' : `  ${r.detail}`));
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
