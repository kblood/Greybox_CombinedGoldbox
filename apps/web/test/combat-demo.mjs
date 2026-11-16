// Focused browser smoke for the visible tactical combat screen.
//
// This is intentionally smaller than test/e2e.mjs: it only proves that the
// public ?combat=demo route boots, renders a nonblank combat canvas, and wires
// the combat seam to real tactical state.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const viteBin = join(appRoot, 'node_modules', 'vite', 'bin', 'vite.js');

async function isPortFree(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function pickPort() {
  for (const port of [5181, 5182, 5183]) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('no free web-combat smoke port found');
}

async function waitForServer(port, proc) {
  const deadline = Date.now() + 45000;
  let exited = false;
  proc.on('exit', (code) => {
    exited = true;
    proc._exitCode = code;
  });
  while (Date.now() < deadline) {
    if (exited) throw new Error(`vite exited early (${proc._exitCode})`);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
      if (r.ok) return;
    } catch {
      // server still starting
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`vite did not answer on port ${port}`);
}

async function waitForCombatBoot(page) {
  await page.waitForFunction(
    'window.__combat || /could not load combat/i.test(document.querySelector("#status")?.textContent || "")',
    { timeout: 45000 },
  );
}

function assertCombatResult(result) {
  if (!result.hasCombat || result.rendered < 1) {
    if (result.rendered === 0 && /could not load combat/i.test(result.status)) {
      console.log(`SKIP: combat assets unavailable (${result.status})`);
      return false;
    }
    throw new Error(`combat did not boot: ${JSON.stringify(result)}`);
  }
  if (!result.canvas || result.canvas.width < 300 || result.canvas.height < 190) {
    throw new Error(`unexpected canvas: ${JSON.stringify(result)}`);
  }
  const aspect = result.canvas.width / result.canvas.height;
  if (aspect < 1.2 || aspect > 1.6) {
    throw new Error(`unexpected canvas aspect: ${JSON.stringify(result)}`);
  }
  if (result.unique < 8 || result.nonzero < 10000) {
    throw new Error(`combat canvas looks blank: ${JSON.stringify(result)}`);
  }
  if (result.cellCount < 6 || result.enemies < 1 || result.backdropTiles < 2 || !result.hasIcon) {
    throw new Error(`combat seam incomplete: ${JSON.stringify(result)}`);
  }
  if (result.hasExplore) {
    throw new Error(`combat preview exposed dungeon explorer seam: ${JSON.stringify(result)}`);
  }
  if (result.canvasCount !== 1 || !result.hasCombatShell || !result.hasCombatButtons) {
    throw new Error(`combat preview DOM is not the dedicated combat view: ${JSON.stringify(result)}`);
  }
  if (result.hasDungeonAid || result.hasDungeonShell) {
    throw new Error(`combat preview rendered dungeon helper UI: ${JSON.stringify(result)}`);
  }
  if (!/command/i.test(result.menuText) || !/tactical grid/i.test(result.menuText) || !/engine positioned combat/i.test(result.menuText)) {
    throw new Error(`combat menu hint missing: ${JSON.stringify(result)}`);
  }
  if (!/Move\s+View\s+Aim\s+Use\s+Cast\s+Turn\s+Quick\s+Done/i.test(result.menuItems.join(' '))) {
    throw new Error(`combat command menu is not Gold Box ordered: ${JSON.stringify(result)}`);
  }
  if (/Move\/turn|Area\s+Cast\s+View\s+Encamp|Search\s+Look|walls.*doors.*gateways/i.test(result.menuText)) {
    throw new Error(`combat preview shows dungeon menu/help text: ${JSON.stringify(result)}`);
  }
  const expectedButtons = ['Move N', 'Move W', 'Move E', 'Move S', 'View', 'Aim', 'Use', 'Cast', 'Turn', 'Bandage', 'Quick', 'Done', 'Auto'];
  if (JSON.stringify(result.buttons) !== JSON.stringify(expectedButtons)) {
    throw new Error(`combat controls changed: ${JSON.stringify(result)}`);
  }
  if (!result.mapSize || result.mapSize.w !== 13 || result.mapSize.h !== 9 || result.overlay !== false || result.hazard !== 'web') {
    throw new Error(`combat tactical state not exposed as expected: ${JSON.stringify(result)}`);
  }
  if (result.commandGreen < 1 || result.commandWhite < 1) {
    throw new Error(`combat command bar did not paint selected/idle menu colours: ${JSON.stringify(result)}`);
  }
  return true;
}

function assertTacticalActionResult(result) {
  const before = result.beforeAction;
  if (!before?.current || before.currentSide !== 'party' || before.phase !== 'party-menu') {
    throw new Error(`combat did not stop on a party action prompt: ${JSON.stringify(result)}`);
  }
  if (!before.activeId || !before.activePos) {
    throw new Error(`combat prompt missing active actor state: ${JSON.stringify(result)}`);
  }
  if (result.action !== 'guard' || result.actionActor !== before.current) {
    throw new Error(`combat action did not target the current actor: ${JSON.stringify(result)}`);
  }
  if (result.logChanged !== true || result.afterAction.logLen < before.logLen) {
    throw new Error(`combat action did not append or rotate log state: ${JSON.stringify(result)}`);
  }
  if (!result.guardLogged) {
    throw new Error(`combat guard action was not visible in the log: ${JSON.stringify(result)}`);
  }
  if (result.afterAction.phase === 'party-menu') {
    if (!result.afterAction.current || result.afterAction.currentSide !== 'party') {
      throw new Error(`combat did not return to a coherent party turn: ${JSON.stringify(result)}`);
    }
  } else if (!['over', 'treasure'].includes(result.afterAction.phase)) {
    throw new Error(`unexpected combat phase after guard: ${JSON.stringify(result)}`);
  }
  if (result.afterAction.checksum === before.checksum) {
    throw new Error(`combat action did not redraw canvas pixels: ${JSON.stringify(result)}`);
  }
}

async function openCombatFromSidebar(page, port) {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.evaluate(() => {
    const item = [...document.querySelectorAll('.game-pick')]
      .find((node) => /combat area|combat screen|tactical combat/i.test(node.textContent || ''));
    if (!(item instanceof HTMLElement)) throw new Error('combat sidebar item not found');
    item.click();
  });
  await waitForCombatBoot(page);
  return await page.evaluate(() => ({
    href: location.search,
    hasCombat: !!window.__combat,
    hasExplore: !!window.__explore,
    rendered: window.__rendered,
    canvasCount: document.querySelectorAll('#output canvas').length,
    hasCombatShell: !!document.querySelector('#output .combat-screen .combat-frame'),
    hasCombatButtons: !!document.querySelector('#output .combat-buttons'),
    backdropTiles: window.__combat?.backdropTiles?.() ?? null,
    hasDungeonAid: !!document.querySelector('#output .gb-aid, #output .gb-automap, #output .gb-companion, #output .gb-scaler, #output .explore-canvas'),
    hasDungeonShell: !!document.querySelector('#output .gb-screen, #output .gb-frame .gb-menu'),
    menuText: document.querySelector('#output .combat-screen .combat-frame .combat-command')?.textContent ?? '',
    mapSize: window.__combat?.mapSize?.() ?? null,
    terrainInfo: window.__combat?.terrainInfo?.(21, 12) ?? null,
    inspectMode: window.__combat?.inspectMode?.() ?? false,
    inspectLabel: window.__combat?.inspectLabel?.() ?? '',
    combatants: window.__combat?.combatants?.() ?? [],
  }));
}

function assertSidebarCombatResult(result) {
  if (result.href !== '?combat=mvp' || !result.hasCombat || result.rendered < 1) {
    throw new Error(`sidebar combat route did not boot: ${JSON.stringify(result)}`);
  }
  if (result.hasExplore || result.hasDungeonAid || result.hasDungeonShell || result.canvasCount !== 1 || !result.hasCombatShell || !result.hasCombatButtons) {
    throw new Error(`sidebar combat route exposed dungeon UI: ${JSON.stringify(result)}`);
  }
  if (result.backdropTiles < 2) {
    throw new Error(`sidebar combat route did not load CoK combat terrain tiles: ${JSON.stringify(result)}`);
  }
  if (!result.inspectMode || !result.mapSize || result.mapSize.w !== 50 || result.mapSize.h !== 25 || !/GOBLIN/i.test(result.inspectLabel + ' ' + result.combatants.map((c) => c.name).join(' '))) {
    throw new Error(`sidebar combat route is not the real-area MVP preview: ${JSON.stringify(result)}`);
  }
  if (!result.terrainInfo || result.terrainInfo.id !== 23 || result.terrainInfo.tile !== 22 || result.terrainInfo.blocked) {
    throw new Error(`sidebar combat route is not using CoAB mapToBackGroundTile ids: ${JSON.stringify(result)}`);
  }
  if (!/inspect/i.test(result.menuText) || /Move\/turn|Search\s+Look|walls.*doors.*gateways/i.test(result.menuText)) {
    throw new Error(`sidebar combat route menu is not tactical combat: ${JSON.stringify(result)}`);
  }
}

async function openDqkThenCombatRace(page, port) {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.evaluate(() => {
    const picks = [...document.querySelectorAll('.game-pick')];
    const dqk = picks.find((node) => /Explore DQK dungeon/i.test(node.textContent || ''));
    const combat = picks.find((node) => /combat area|combat screen|tactical combat/i.test(node.textContent || ''));
    if (!(dqk instanceof HTMLElement)) throw new Error('DQK sidebar item not found');
    if (!(combat instanceof HTMLElement)) throw new Error('combat sidebar item not found');
    dqk.click();
    combat.click();
  });
  await waitForCombatBoot(page);
  await new Promise((r) => setTimeout(r, 1000));
  return await page.evaluate(() => ({
    href: location.search,
    hasCombat: !!window.__combat,
    hasDqk: !!window.__dqk,
    hasExplore: !!window.__explore,
    rendered: window.__rendered,
    canvasCount: document.querySelectorAll('#output canvas').length,
    hasCombatShell: !!document.querySelector('#output .combat-screen .combat-frame'),
    hasDungeonAid: !!document.querySelector('#output .gb-aid, #output .gb-automap, #output .gb-companion, #output .gb-scaler, #output .explore-canvas'),
    hasDungeonShell: !!document.querySelector('#output .gb-screen, #output .gb-frame .gb-menu'),
    menuText: document.querySelector('#output .combat-screen .combat-frame .combat-command')?.textContent ?? '',
    mapSize: window.__combat?.mapSize?.() ?? null,
    terrainInfo: window.__combat?.terrainInfo?.(21, 12) ?? null,
    inspectMode: window.__combat?.inspectMode?.() ?? false,
  }));
}

function assertDqkRaceCombatResult(result) {
  if (result.href !== '?combat=mvp' || !result.hasCombat || result.rendered < 1 || !result.hasCombatShell) {
    throw new Error(`DQK→combat route did not boot combat: ${JSON.stringify(result)}`);
  }
  if (result.hasDqk || result.hasExplore || result.hasDungeonAid || result.hasDungeonShell || result.canvasCount !== 1) {
    throw new Error(`DQK async mount leaked walk UI into combat route: ${JSON.stringify(result)}`);
  }
  if (!result.inspectMode || !result.mapSize || result.mapSize.w !== 50 || result.mapSize.h !== 25) {
    throw new Error(`DQK→combat route did not boot real-area MVP terrain: ${JSON.stringify(result)}`);
  }
  if (!result.terrainInfo || result.terrainInfo.id !== 23 || result.terrainInfo.tile !== 22 || result.terrainInfo.blocked) {
    throw new Error(`DQK→combat route is not using CoAB mapToBackGroundTile ids: ${JSON.stringify(result)}`);
  }
  if (!/inspect/i.test(result.menuText) || /Move\/turn|Search\s+Look|walls.*doors.*gateways/i.test(result.menuText)) {
    throw new Error(`DQK→combat route menu is not tactical combat: ${JSON.stringify(result)}`);
  }
}

async function openDqkCombatPreview(page, port) {
  await page.goto(`http://127.0.0.1:${port}/?combat=dqk`, { waitUntil: 'networkidle2', timeout: 45000 });
  await waitForCombatBoot(page);
  return await page.evaluate(() => ({
    href: location.search,
    hasCombat: !!window.__combat,
    rendered: window.__rendered,
    canvasCount: document.querySelectorAll('#output canvas').length,
    hasCombatShell: !!document.querySelector('#output .combat-screen .combat-frame'),
    hasDungeonAid: !!document.querySelector('#output .gb-aid, #output .gb-automap, #output .gb-companion, #output .gb-scaler, #output .explore-canvas'),
    menuText: document.querySelector('#output .combat-screen .combat-frame .combat-command')?.textContent ?? '',
    mapSize: window.__combat?.mapSize?.() ?? null,
    placementMode: window.__combat?.placementMode?.() ?? null,
    backgroundSummary: window.__combat?.backgroundSummary?.() ?? null,
    baseId: window.__combat?.backgroundTileId?.(1, 1) ?? null,
    baseInfo: window.__combat?.terrainInfo?.(1, 1) ?? null,
    probeId: window.__combat?.backgroundTileId?.(35, 16) ?? null,
    probeInfo: window.__combat?.terrainInfo?.(35, 16) ?? null,
    blockedInfo: window.__combat?.terrainInfo?.(13, 18) ?? null,
    inspectMode: window.__combat?.inspectMode?.() ?? false,
  }));
}

function assertDqkCombatPreviewResult(result) {
  if (result.href !== '?combat=dqk' || !result.hasCombat || result.rendered < 1 || !result.hasCombatShell || result.canvasCount !== 1) {
    throw new Error(`DQK combat preview did not boot: ${JSON.stringify(result)}`);
  }
  if (result.hasDungeonAid || !/DQK explicit 50x25 background-id surface/i.test(result.menuText)) {
    throw new Error(`DQK combat preview leaked wrong UI/label: ${JSON.stringify(result)}`);
  }
  if (!result.inspectMode || !result.mapSize || result.mapSize.w !== 50 || result.mapSize.h !== 25 || result.placementMode !== 'anchor') {
    throw new Error(`DQK combat preview did not expose 50x25 anchor terrain: ${JSON.stringify(result)}`);
  }
  if (!result.backgroundSummary || result.backgroundSummary.w !== 50 || result.backgroundSummary.h !== 25 || result.backgroundSummary.cells !== 1250 || result.backgroundSummary.checksum !== 3917224348) {
    throw new Error(`DQK combat preview background checksum changed: ${JSON.stringify(result)}`);
  }
  if (result.baseId !== 0x1a || !result.baseInfo || result.baseInfo.tile !== 0x27 || result.baseInfo.moveCost !== 2 || result.baseInfo.blocked) {
    throw new Error(`DQK combat preview base terrain is wrong: ${JSON.stringify(result)}`);
  }
  if (result.probeId !== 0x4c || !result.probeInfo || result.probeInfo.tile !== 0x20 || result.probeInfo.moveCost !== 0x46 || result.probeInfo.blocked) {
    throw new Error(`DQK combat preview probe terrain is wrong: ${JSON.stringify(result)}`);
  }
  if (!result.blockedInfo || result.blockedInfo.id !== 0x3f || !result.blockedInfo.blocked) {
    throw new Error(`DQK combat preview blocked terrain is wrong: ${JSON.stringify(result)}`);
  }
}

async function openExploreTestFight(page, port) {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.evaluate(() => {
    const item = [...document.querySelectorAll('.game-pick')]
      .find((node) => /Explore CoK dungeon/i.test(node.textContent || ''));
    if (!(item instanceof HTMLElement)) throw new Error('CoK explore sidebar item not found');
    item.click();
  });
  await page.waitForFunction('window.__explore && typeof window.__explore.testFight === "function"', { timeout: 45000 });
  const marker = await page.evaluate(() => window.__explore.testFight(0x77));
  await waitForCombatBoot(page);
  return await page.evaluate((markerText) => ({
    marker: markerText,
    hasCombat: !!window.__combat,
    hasExplore: !!window.__explore,
    rendered: window.__rendered,
    overlay: window.__combat?.isOverlay?.() ?? null,
    mapSize: window.__combat?.mapSize?.() ?? null,
    terrainInfo: window.__combat?.terrainInfo?.(21, 12) ?? null,
    backdropTiles: window.__combat?.backdropTiles?.() ?? null,
    phase: window.__combat?.phase?.() ?? null,
    current: window.__combat?.current?.() ?? null,
    menu: window.__combat?.menu?.() ?? null,
  }), marker);
}

function assertExploreTestFightResult(result) {
  if (!result.hasExplore || !result.hasCombat || result.rendered < 1 || result.marker !== '⚔ Combat!') {
    throw new Error(`explorer testFight did not launch combat: ${JSON.stringify(result)}`);
  }
  if (result.overlay !== true) {
    throw new Error(`explorer testFight combat is not modal overlay combat: ${JSON.stringify(result)}`);
  }
  if (!result.mapSize || result.mapSize.w !== 50 || result.mapSize.h !== 25) {
    throw new Error(`explorer testFight is not using the CoAB 50x25 combat map: ${JSON.stringify(result)}`);
  }
  if (!result.terrainInfo || result.terrainInfo.id !== 23 || result.terrainInfo.tile !== 22 || result.terrainInfo.blocked) {
    throw new Error(`explorer testFight is not using CoAB mapToBackGroundTile ids: ${JSON.stringify(result)}`);
  }
  if (result.backdropTiles < 2 || !result.current || result.phase !== 'party-menu' || result.menu < 0) {
    throw new Error(`explorer testFight did not show tactical combat UI: ${JSON.stringify(result)}`);
  }
}

async function openDqkThenSidebarRoute(page, port, targetPattern, waitExpr) {
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.evaluate((targetSource) => {
    const targetRe = new RegExp(targetSource, 'i');
    const picks = [...document.querySelectorAll('.game-pick')];
    const dqk = picks.find((node) => /Explore DQK dungeon/i.test(node.textContent || ''));
    const target = picks.find((node) => targetRe.test(node.textContent || ''));
    if (!(dqk instanceof HTMLElement)) throw new Error('DQK sidebar item not found');
    if (!(target instanceof HTMLElement)) throw new Error(`target sidebar item not found: ${targetSource}`);
    dqk.click();
    target.click();
  }, targetPattern.source);
  await page.waitForFunction(waitExpr, { timeout: 45000 });
  await new Promise((r) => setTimeout(r, 500));
  return await page.evaluate(() => ({
    href: location.search,
    hasDqk: !!window.__dqk,
    hasExplore: !!window.__explore,
    hasTown: !!window.__town,
    hasCombat: !!window.__combat,
    rendered: window.__rendered,
    canvasCount: document.querySelectorAll('#output canvas').length,
    status: document.querySelector('#status')?.textContent ?? '',
    hasNwnPreview: !!document.querySelector('#output .nwn-preview, #output .nwn-assets, #output [data-nwn-preview]'),
    hasDungeonAid: !!document.querySelector('#output .gb-aid, #output .gb-automap, #output .gb-companion, #output .gb-scaler, #output .explore-canvas'),
    hasDungeonShell: !!document.querySelector('#output .gb-screen, #output .gb-frame .gb-menu'),
  }));
}

function assertDqkToExploreResult(result) {
  if (result.href !== '?explore=1' || !result.hasExplore || result.hasDqk || result.rendered < 1) {
    throw new Error(`DQK→CoK explore route did not cleanly switch engines: ${JSON.stringify(result)}`);
  }
}

function assertDqkToNwnResult(result) {
  if (result.href !== '?nwn=1' || result.hasDqk || result.hasExplore || result.hasCombat || result.hasTown || result.rendered < 1) {
    throw new Error(`DQK→NWN route left a stale engine seam: ${JSON.stringify(result)}`);
  }
}

async function openDqkTownSeam(page, port) {
  await page.goto(`http://127.0.0.1:${port}/?dqk=1`, { waitUntil: 'networkidle2', timeout: 45000 });
  await page.waitForFunction('window.__dqk && typeof window.__dqk.openTown === "function"', { timeout: 45000 });
  await page.evaluate(() => { if (window.__dqk?.combatOpen?.()) window.__dqk.closeCombat(); });
  await page.evaluate('window.__dqk.openTown()');
  await page.waitForFunction('window.__town && window.__town.levelCapRuleset && window.__town.levelCapRuleset() === "dqk"', { timeout: 45000 });
  return await page.evaluate(() => ({
    href: location.search,
    hasDqk: !!window.__dqk,
    hasTown: !!window.__town,
    ruleset: window.__town?.levelCapRuleset?.() ?? null,
    rendered: window.__rendered,
    hasDungeonAid: !!document.querySelector('#output .gb-aid, #output .gb-automap, #output .gb-companion, #output .gb-scaler, #output .explore-canvas'),
    hasDungeonShell: !!document.querySelector('#output .gb-screen, #output .gb-frame .gb-menu'),
  }));
}

function assertDqkTownResult(result) {
  if (!result.hasTown || result.hasDqk || result.ruleset !== 'dqk' || result.rendered < 1) {
    throw new Error(`DQK openTown did not cleanly transfer to town: ${JSON.stringify(result)}`);
  }
}

async function main() {
  if (!existsSync(EDGE)) {
    console.log(`SKIP: Edge not found at ${EDGE}`);
    return;
  }
  if (!existsSync(viteBin)) {
    throw new Error(`${viteBin} not found; run pnpm install`);
  }

  const port = await pickPort();
  const vite = spawn(process.execPath, [
    viteBin,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
    '--clearScreen',
    'false',
  ], { cwd: appRoot, stdio: ['ignore', 'ignore', 'pipe'] });
  vite.stderr.on('data', (b) => {
    const s = b.toString();
    if (/error/i.test(s)) process.stderr.write(`[vite] ${s}`);
  });

  let browser;
  try {
    await waitForServer(port, vite);
    browser = await puppeteer.launch({
      executablePath: EDGE,
      headless: 'new',
      args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
    });

    const page = await browser.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|vite|DevTools/i.test(m.text())) errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${port}/?combat=demo`, { waitUntil: 'networkidle2', timeout: 45000 });
    await waitForCombatBoot(page);

    const result = await page.evaluate(() => {
      function canvasStats() {
        const canvas = document.querySelector('canvas');
        if (!canvas) return { canvas: null, unique: 0, nonzero: 0, checksum: 0 };
        const ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const seen = new Set();
        let checksum = 2166136261;
        let nonzero = 0;
        let commandGreen = 0;
        let commandWhite = 0;
        const commandY0 = Math.floor(canvas.height * 0.94);
        for (let i = 0; i < data.length; i += 4) {
          const px = i / 4;
          const y = Math.floor(px / canvas.width);
          const r = data[i], g = data[i + 1], b = data[i + 2];
          seen.add(`${r},${g},${b},${data[i + 3]}`);
          if (r || g || b) nonzero++;
          if (y >= commandY0) {
            if (r === 85 && g === 255 && b === 85) commandGreen++;
            if (r === 255 && g === 255 && b === 255) commandWhite++;
          }
          checksum ^= r;
          checksum = Math.imul(checksum, 16777619);
          checksum ^= g;
          checksum = Math.imul(checksum, 16777619);
          checksum ^= b;
          checksum = Math.imul(checksum, 16777619);
          checksum ^= data[i + 3];
          checksum = Math.imul(checksum, 16777619);
        }
        return {
          canvas: { width: canvas.width, height: canvas.height },
          unique: seen.size,
          nonzero,
          checksum: checksum >>> 0,
          commandGreen,
          commandWhite,
        };
      }

      function snapshot(combat) {
        const log = combat?.log?.() ?? [];
        const menuText = document.querySelector('#output .combat-screen .combat-frame .combat-command')?.textContent ?? '';
        const buttons = [...document.querySelectorAll('#output .combat-buttons .gb-btn')]
          .map((b) => b.textContent?.trim());
        return {
          rendered: window.__rendered,
          hasCombat: !!combat,
          hasExplore: !!window.__explore,
          ...canvasStats(),
          canvasCount: document.querySelectorAll('#output canvas').length,
          menuText,
          buttons,
          hasCombatShell: !!document.querySelector('#output .combat-screen .combat-frame'),
          hasCombatButtons: !!document.querySelector('#output .combat-buttons'),
          hasDungeonAid: !!document.querySelector('#output .gb-aid, #output .gb-automap, #output .gb-companion, #output .gb-scaler, #output .explore-canvas'),
          hasDungeonShell: !!document.querySelector('#output .gb-screen, #output .gb-frame .gb-menu'),
          phase: combat?.phase?.() ?? null,
          current: combat?.current?.() ?? null,
          currentSide: combat?.currentSide?.() ?? null,
          activeId: combat?.activeId?.() ?? null,
          activePos: combat?.activePos?.() ?? null,
          logLen: log.length,
          logTail: log.slice(-8),
          cellCount: combat?.cellCount ?? null,
          enemies: combat?.livingEnemies?.().length ?? null,
          backdropTiles: combat?.backdropTiles?.() ?? null,
          hasIcon: combat?.hasIcon?.() ?? null,
          menuItems: combat?.menuItems?.() ?? [],
          overlay: combat?.isOverlay?.() ?? null,
          hazard: combat?.hazardAt?.(6, 4) ?? null,
          mapSize: combat?.mapSize?.() ?? null,
          status: document.querySelector('#status')?.textContent ?? '',
        };
      }

      const combat = window.__combat;
      const beforeAction = snapshot(combat);
      const actionActor = beforeAction.current;
      const beforeLog = beforeAction.logTail.join('\n');
      if (combat && beforeAction.phase === 'party-menu' && beforeAction.currentSide === 'party') {
        combat.guard();
      }
      const afterAction = snapshot(combat);
      const afterLog = afterAction.logTail.join('\n');
      const guardLogged = (combat?.log?.() ?? []).some((line) =>
        typeof line === 'string' && line.includes('takes a guarding stance'));

      return {
        ...afterAction,
        beforeAction,
        afterAction,
        action: 'guard',
        actionActor,
        logChanged: afterLog !== beforeLog,
        guardLogged,
      };
    });
    await page.screenshot({ path: join(appRoot, 'combat-demo-check.png'), fullPage: true });

    if (errors.length) throw new Error(errors.join(' | '));
    if (assertCombatResult(result)) {
      assertTacticalActionResult(result);
      const sidebarResult = await openCombatFromSidebar(page, port);
      assertSidebarCombatResult(sidebarResult);
      const dqkCombatPreview = await openDqkCombatPreview(page, port);
      assertDqkCombatPreviewResult(dqkCombatPreview);
      const dqkRaceResult = await openDqkThenCombatRace(page, port);
      assertDqkRaceCombatResult(dqkRaceResult);
      const exploreFightResult = await openExploreTestFight(page, port);
      assertExploreTestFightResult(exploreFightResult);
      const dqkExploreResult = await openDqkThenSidebarRoute(
        page,
        port,
        /Explore CoK dungeon/,
        'window.__explore && typeof window.__explore.move === "function"',
      );
      assertDqkToExploreResult(dqkExploreResult);
      const dqkNwnResult = await openDqkThenSidebarRoute(
        page,
        port,
        /Preview Neverwinter Nights/,
        'window.__rendered > 0 || /NWN|Neverwinter|Loaded/i.test(document.querySelector("#status")?.textContent || "")',
      );
      assertDqkToNwnResult(dqkNwnResult);
      const dqkTownResult = await openDqkTownSeam(page, port);
      assertDqkTownResult(dqkTownResult);
      console.log(
        `RESULT: web combat demo rendered ${result.cellCount} combatants, ${result.enemies} enemies, ` +
        `${result.unique} colours, ${result.backdropTiles} terrain tiles, canvas ${result.canvas.width}x${result.canvas.height}; ` +
        `guard advanced ${result.beforeAction.current} to ${result.afterAction.current ?? result.afterAction.phase}; ` +
        `sidebar route ${sidebarResult.href}; DQK combat ${dqkCombatPreview.backgroundSummary.checksum}; DQK race route ${dqkRaceResult.href}; ` +
        `explore fight ${exploreFightResult.mapSize.w}x${exploreFightResult.mapSize.h}; ` +
        `DQK switches ${dqkExploreResult.href}/${dqkNwnResult.href}; DQK town ${dqkTownResult.ruleset}`,
      );
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    vite.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
