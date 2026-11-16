// Static production-build smoke for dist-app/.
//
// Unlike test/e2e.mjs, this does not start Vite and cannot use /@fs. It serves
// the already-built dist-app directory and verifies that production assetUrl()
// resolves bundled assets, including absolute-path NWN files copied under
// assets/external/.

import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, resolve, extname, normalize, sep } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = resolve(process.env.GB_STATIC_DIST_DIR ?? join(appRoot, 'dist-app'));

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.dax', 'application/octet-stream'],
  ['.daa', 'application/octet-stream'],
  ['.tlb', 'application/octet-stream'],
  ['.glb', 'application/octet-stream'],
]);

async function isPortFree(port) {
  return await new Promise((resolvePort) => {
    const server = net.createServer();
    server.once('error', () => resolvePort(false));
    server.once('listening', () => server.close(() => resolvePort(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function pickPort() {
  for (const port of [5184, 5185, 5186]) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('no free static-build smoke port found');
}

function distPathFor(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const full = normalize(resolve(distRoot, rel));
  const root = normalize(distRoot);
  if (full !== root && !full.startsWith(`${root}${sep}`)) return null;
  if (existsSync(full) && statSync(full).isFile()) return full;
  if (!extname(rel)) return join(distRoot, 'index.html');
  return null;
}

function startStaticServer(port) {
  const server = createServer((req, res) => {
    const path = distPathFor(req.url ?? '/');
    if (!path) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME.get(extname(path).toLowerCase()) ?? 'application/octet-stream');
    createReadStream(path).pipe(res);
  });
  return new Promise((resolveServer) => {
    server.listen(port, '127.0.0.1', () => resolveServer(server));
  });
}

async function pageStats(page) {
  return await page.evaluate(() => {
    const canvas = document.querySelector('#output canvas');
    let unique = 0;
    let nonzero = 0;
    if (canvas instanceof HTMLCanvasElement) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const seen = new Set();
        for (let i = 0; i < data.length; i += 4) {
          seen.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
          if (data[i] || data[i + 1] || data[i + 2]) nonzero++;
        }
        unique = seen.size;
      }
    }
    return {
      rendered: window.__rendered ?? 0,
      status: document.querySelector('#status')?.textContent ?? '',
      canvasCount: document.querySelectorAll('#output canvas').length,
      unique,
      nonzero,
      hasCombat: !!window.__combat,
      hasExplore: !!window.__explore,
      dqkMapCount: window.__dqk?.mapCount?.() ?? 0,
      outputText: document.querySelector('#output')?.textContent?.slice(0, 400) ?? '',
      hasCombatShell: !!document.querySelector('#output .combat-screen .combat-frame'),
      hasCombatButtons: !!document.querySelector('#output .combat-buttons'),
      combatTitle: document.querySelector('#output .combat-title')?.textContent ?? '',
      hasDungeonAid: !!document.querySelector('#output .gb-aid, #output .gb-automap, #output .gb-companion, #output .gb-scaler, #output .explore-canvas'),
      hasDungeonShell: !!document.querySelector('#output .gb-screen, #output .gb-frame .gb-menu'),
      combatMenu: document.querySelector('#output .combat-screen .combat-frame .combat-command')?.textContent ?? '',
      combatBackdrops: window.__combat?.backdropTiles?.() ?? null,
      combatAssetPaths: window.__combat?.assetPaths?.() ?? null,
      combatMapSize: window.__combat?.mapSize?.() ?? null,
      combatPlacement: window.__combat?.placementMode?.() ?? null,
      combatIsOverlay: window.__combat?.isOverlay?.() ?? false,
      combatants: window.__combat?.combatants?.() ?? [],
      hpE0: window.__combat?.hpOf?.('e0') ?? null,
      spellSaveE0: window.__combat?.spellSave?.('e0') ?? null,
      title: document.querySelector('#output .asset-name')?.textContent ?? '',
      fileNames: [...document.querySelectorAll('#output .file-name, #output .frame-title, #output td:first-child')]
        .map((n) => n.textContent?.trim() ?? '')
        .filter(Boolean)
        .slice(0, 80),
      supportTitle: document.querySelector('#output .support-page h1')?.textContent ?? '',
      supportRows: document.querySelectorAll('#output .support-page tbody tr').length,
      supportGameCount: window.__support?.gameCount?.() ?? 0,
      supportEvidenceDate: window.__support?.evidenceDate ?? '',
      supportGapCount: document.querySelectorAll('#output .support-gaps').length,
      supportPills: [...document.querySelectorAll('#output .support-pill')]
        .map((n) => n.textContent?.trim() ?? '')
        .filter(Boolean),
      docsTitle: document.querySelector('#output .docs-page h1')?.textContent ?? '',
      docsText: document.querySelector('#output .docs-page')?.textContent?.slice(0, 4000) ?? '',
      docsHasSupport: /Support Matrix/i.test(document.querySelector('#output .docs-page')?.textContent ?? ''),
      docsHasPool: /Pool of Radiance/i.test(document.querySelector('#output .docs-page')?.textContent ?? ''),
      docsHasTpov: /TPOV descriptor map|37 TPOV descriptor/i.test(document.querySelector('#output .docs-page')?.textContent ?? ''),
      docsHasCorpus: /13 profiles|strict corpus command/i.test(document.querySelector('#output .docs-page')?.textContent ?? ''),
    };
  });
}

function assertNoPageErrors(label, errors, badResponses) {
  const bad = badResponses.filter((r) => !/favicon/i.test(r));
  if (errors.length || bad.length) {
    throw new Error(`${label}: browser errors=${errors.join(' | ')} http=${bad.join(' | ')}`);
  }
}

async function runCase(page, base, label, query, waitExpr, check) {
  const errors = [];
  const badResponses = [];
  const onConsole = (m) => {
    if (m.type() === 'error' && !/favicon|DevTools/i.test(m.text())) errors.push(m.text());
  };
  const onPageError = (e) => errors.push(`pageerror: ${e.message}`);
  const onResponse = (r) => {
    if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  try {
    await page.goto(`${base}/${query}`, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForFunction(waitExpr, { timeout: 45000 });
    const stats = await pageStats(page);
    assertNoPageErrors(label, errors, badResponses);
    check(stats);
    return stats;
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  }
}

async function runSecretExploreCombat(page, base) {
  const errors = [];
  const badResponses = [];
  const onConsole = (m) => {
    if (m.type() === 'error' && !/favicon|DevTools/i.test(m.text())) errors.push(m.text());
  };
  const onPageError = (e) => errors.push(`pageerror: ${e.message}`);
  const onResponse = (r) => {
    if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  try {
    await page.goto(`${base}/?explore=secret`, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForFunction('window.__explore && window.__explore.bestiary().length >= 70', { timeout: 45000 });
    const launch = await page.evaluate('window.__explore.testFightMonster(5, 0x55)');
    await page.waitForFunction('window.__combat && window.__combat.isOverlay && window.__combat.isOverlay()', { timeout: 45000 });
    const stats = await pageStats(page);
    assertNoPageErrors('secret-explore-combat', errors, badResponses);
    const enemy = stats.combatants.find((c) => c.id === 'e0');
    if (!/Combat/i.test(String(launch)) || !enemy || !/RED DRAGON/i.test(enemy.name ?? '') || stats.hpE0 !== 44 || stats.spellSaveE0 !== 10) {
      throw new Error(`Secret explore combat handoff did not carry real RED DRAGON stats: ${JSON.stringify({ launch, stats })}`);
    }
    if (!stats.combatIsOverlay || stats.combatBackdrops < 2 || stats.combatMapSize?.w !== 50 || stats.combatMapSize?.h !== 25) {
      throw new Error(`Secret explore combat handoff did not mount tactical overlay: ${JSON.stringify(stats)}`);
    }
    return stats;
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
    page.off('response', onResponse);
  }
}

async function main() {
  if (!existsSync(EDGE)) {
    console.log(`SKIP: Edge not found at ${EDGE}`);
    return;
  }
  if (!existsSync(join(distRoot, 'index.html'))) {
    throw new Error(`${distRoot} is missing; run pnpm build:app first`);
  }

  const port = await pickPort();
  const server = await startStaticServer(port);
  const base = `http://127.0.0.1:${port}`;
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: EDGE,
      headless: 'new',
      args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });

    const combat = await runCase(
      page,
      base,
      'combat',
      '?combat=demo',
      'window.__combat || window.__rendered === 0',
      (s) => {
        if (!s.hasCombat || s.rendered < 1 || s.canvasCount !== 1 || !s.hasCombatShell || !s.hasCombatButtons) {
          throw new Error(`combat route did not boot as standalone combat: ${JSON.stringify(s)}`);
        }
        if (s.hasExplore || s.hasDungeonAid || s.hasDungeonShell || /Move\/turn|Search\\s+Look|walls.*doors.*gateways/i.test(s.combatMenu)) {
          throw new Error(`combat route exposed dungeon UI: ${JSON.stringify(s)}`);
        }
        if ((s.combatBackdrops ?? 0) < 2 || s.unique < 8 || s.nonzero < 10000) {
          throw new Error(`combat route did not render real combat terrain: ${JSON.stringify(s)}`);
        }
      },
    );

    const secretCombat = await runCase(
      page,
      base,
      'secret-combat',
      '?combat=secret',
      'window.__combat || window.__rendered === 0',
      (s) => {
        const enemy = s.combatants.find((c) => c.id === 'e0');
        if (!s.hasCombat || s.rendered < 5 || !/Secret of the Silver Blades Combat MVP/i.test(s.combatTitle) || !enemy || !/RED DRAGON/i.test(enemy.name ?? '')) {
          throw new Error(`Secret combat preview did not boot: ${JSON.stringify(s)}`);
        }
        if (s.hpE0 !== 44 || s.spellSaveE0 !== 10) {
          throw new Error(`Secret combat preview did not carry real RED DRAGON stats: ${JSON.stringify(s)}`);
        }
        if ((s.combatBackdrops ?? 0) < 2 || s.combatMapSize?.w !== 50 || s.combatMapSize?.h !== 25 || s.unique < 8 || s.nonzero < 10000) {
          throw new Error(`Secret combat preview did not render real tactical terrain: ${JSON.stringify(s)}`);
        }
        if (!/Secret of the Silver Blades\/DUNGCOM\.DAX$/i.test(s.combatAssetPaths?.dungcomPath ?? '') ||
            !/Secret of the Silver Blades\/CPIC1\.DAX$/i.test(s.combatAssetPaths?.iconPath ?? '')) {
          throw new Error(`Secret combat preview used cross-title assets: ${JSON.stringify(s.combatAssetPaths)}`);
        }
      },
    );

    const poolCombat = await runCase(
      page,
      base,
      'pool-combat',
      '?combat=pool',
      'window.__combat || window.__rendered === 0',
      (s) => {
        const enemy = s.combatants.find((c) => c.id === 'e0');
        if (!s.hasCombat || s.rendered < 5 || !/Pool of Radiance Combat MVP/i.test(s.combatTitle) || !enemy || !/OGRE/i.test(enemy.name ?? '')) {
          throw new Error(`Pool combat preview did not boot: ${JSON.stringify(s)}`);
        }
        if (s.hpE0 !== 21 || s.spellSaveE0 !== 14) {
          throw new Error(`Pool combat preview did not carry real OGRE stats: ${JSON.stringify(s)}`);
        }
        if ((s.combatBackdrops ?? 0) < 2 || s.combatMapSize?.w !== 50 || s.combatMapSize?.h !== 25 || s.unique < 8 || s.nonzero < 10000) {
          throw new Error(`Pool combat preview did not render real tactical terrain: ${JSON.stringify(s)}`);
        }
        if (!/Pool of Radiance\/POOLRAD\/DUNGCOM\.DAX$/i.test(s.combatAssetPaths?.dungcomPath ?? '') ||
            !/Pool of Radiance\/POOLRAD\/CPIC1\.DAX$/i.test(s.combatAssetPaths?.iconPath ?? '')) {
          throw new Error(`Pool combat preview used cross-title assets: ${JSON.stringify(s.combatAssetPaths)}`);
        }
      },
    );

    const coabCombat = await runCase(
      page,
      base,
      'coab-combat',
      '?combat=coab',
      'window.__combat || window.__rendered === 0',
      (s) => {
        const enemy = s.combatants.find((c) => c.id === 'e0');
        if (!s.hasCombat || s.rendered < 5 || !/Curse of the Azure Bonds Combat MVP/i.test(s.combatTitle) || !enemy || !/TROLL/i.test(enemy.name ?? '')) {
          throw new Error(`CoAB combat preview did not boot: ${JSON.stringify(s)}`);
        }
        if (s.hpE0 !== 36 || s.spellSaveE0 !== 13) {
          throw new Error(`CoAB combat preview did not carry real TROLL stats: ${JSON.stringify(s)}`);
        }
        if ((s.combatBackdrops ?? 0) < 2 || s.combatMapSize?.w !== 50 || s.combatMapSize?.h !== 25 || s.unique < 8 || s.nonzero < 10000) {
          throw new Error(`CoAB combat preview did not render real tactical terrain: ${JSON.stringify(s)}`);
        }
        if (!/Curse of the Azure Bonds\/DUNGCOM\.DAX$/i.test(s.combatAssetPaths?.dungcomPath ?? '') ||
            !/Curse of the Azure Bonds\/CPIC1\.DAX$/i.test(s.combatAssetPaths?.iconPath ?? '')) {
          throw new Error(`CoAB combat preview used cross-title assets: ${JSON.stringify(s.combatAssetPaths)}`);
        }
      },
    );

    const nwnAsset = await runCase(
      page,
      base,
      'nwn-asset',
      '?asset=nwn-title',
      'window.__rendered > 0 || /failed|error|HTTP/i.test(document.querySelector("#status")?.textContent || "")',
      (s) => {
        if (s.rendered < 1 || !/Decoded TITLE\.DAX/i.test(s.status) || s.unique < 2) {
          throw new Error(`NWN catalog asset did not render from static assets/external: ${JSON.stringify(s)}`);
        }
      },
    );

    const nwnGame = await runCase(
      page,
      base,
      'nwn-game',
      '?game=neverwinter-nights-dos',
      'window.__rendered > 0 || /failed|error|HTTP/i.test(document.querySelector("#status")?.textContent || "")',
      (s) => {
        if (s.rendered < 100 || !/Neverwinter Nights/i.test(s.title) || !s.fileNames.some((n) => /TITLE/i.test(n))) {
          throw new Error(`NWN game dashboard did not render from bundled manifest: ${JSON.stringify(s)}`);
        }
      },
    );

    const secretGame = await runCase(
      page,
      base,
      'secret-game',
      '?game=secret-of-the-silver-blades',
      'window.__rendered > 0 || /failed|error|HTTP/i.test(document.querySelector("#status")?.textContent || "")',
      (s) => {
        if (s.rendered < 50 || !/Secret of the Silver Blades/i.test(s.title) || !s.fileNames.some((n) => /GAME\.OVR|TITLE/i.test(n))) {
          throw new Error(`Secret dashboard did not render from bundled GOG manifest: ${JSON.stringify(s)}`);
        }
      },
    );

    const poolGame = await runCase(
      page,
      base,
      'pool-game',
      '?game=pool-of-radiance',
      'window.__rendered > 0 || /failed|error|HTTP/i.test(document.querySelector("#status")?.textContent || "")',
      (s) => {
        if (s.rendered < 50 || !/Pool of Radiance/i.test(s.title) || !s.fileNames.some((n) => /GAME\.OVR|TITLE/i.test(n))) {
          throw new Error(`Pool dashboard did not render from bundled GOG manifest: ${JSON.stringify(s)}`);
        }
      },
    );

    const coabGame = await runCase(
      page,
      base,
      'coab-game',
      '?game=curse-of-the-azure-bonds',
      'window.__rendered > 0 || /failed|error|HTTP/i.test(document.querySelector("#status")?.textContent || "")',
      (s) => {
        if (s.rendered < 50 || !/Curse of the Azure Bonds/i.test(s.title) || !s.fileNames.some((n) => /GAME\.OVR|TITLE/i.test(n))) {
          throw new Error(`CoAB dashboard did not render from bundled GOG manifest: ${JSON.stringify(s)}`);
        }
      },
    );

    const gatewayGame = await runCase(
      page,
      base,
      'gateway-game',
      '?game=gateway-to-the-savage-frontier',
      'window.__rendered > 0 || /failed|error|HTTP/i.test(document.querySelector("#status")?.textContent || "")',
      (s) => {
        if (s.rendered < 50 || !/Gateway to the Savage Frontier/i.test(s.title) || !s.fileNames.some((n) => /GAME\.OVR|TITLE/i.test(n))) {
          throw new Error(`Gateway dashboard did not render from bundled GOG manifest: ${JSON.stringify(s)}`);
        }
      },
    );

    const secretExplore = await runCase(
      page,
      base,
      'secret-explore',
      '?explore=secret',
      'window.__explore || /Could not load dungeon|error|failed/i.test(document.querySelector("#status")?.textContent || "")',
      (s) => {
        if (!s.hasExplore || s.rendered < 256 || !/Secret of the Silver Blades/i.test(s.status) || s.canvasCount < 2) {
          throw new Error(`Secret explore route did not boot real GEO/ECL: ${JSON.stringify(s)}`);
        }
        if (s.unique < 4 || s.nonzero < 10000) {
          throw new Error(`Secret explore route rendered an implausibly blank screen: ${JSON.stringify(s)}`);
        }
      },
    );

    const poolExplore = await runCase(
      page,
      base,
      'pool-explore',
      '?explore=pool',
      'window.__explore || /Could not load dungeon|error|failed/i.test(document.querySelector("#status")?.textContent || "")',
      (s) => {
        if (!s.hasExplore || s.rendered < 256 || !/Pool of Radiance/i.test(s.status) || s.canvasCount < 2) {
          throw new Error(`Pool explore route did not boot real GEO/ECL: ${JSON.stringify(s)}`);
        }
        if (s.unique < 4 || s.nonzero < 10000) {
          throw new Error(`Pool explore route rendered an implausibly blank screen: ${JSON.stringify(s)}`);
        }
      },
    );

    const coabExplore = await runCase(
      page,
      base,
      'coab-explore',
      '?explore=coab',
      'window.__explore || /Could not load dungeon|error|failed/i.test(document.querySelector("#status")?.textContent || "")',
      (s) => {
        if (!s.hasExplore || s.rendered < 256 || !/Curse of the Azure Bonds/i.test(s.status) || s.canvasCount < 2) {
          throw new Error(`CoAB explore route did not boot real GEO/ECL: ${JSON.stringify(s)}`);
        }
        if (s.unique < 4 || s.nonzero < 10000) {
          throw new Error(`CoAB explore route rendered an implausibly blank screen: ${JSON.stringify(s)}`);
        }
      },
    );

    const gatewayExplore = await runCase(
      page,
      base,
      'gateway-explore',
      '?explore=gateway',
      'window.__explore || /Could not load dungeon|error|failed/i.test(document.querySelector("#status")?.textContent || "")',
      (s) => {
        if (!s.hasExplore || s.rendered < 256 || !/Gateway to the Savage Frontier/i.test(s.status) || s.canvasCount < 2) {
          throw new Error(`Gateway explore route did not boot real GEO/ECL: ${JSON.stringify(s)}`);
        }
        // The production bundle must carry the canonical native-backed Sundabar bank, not the old
        // ECL2#2 exploration preview. Require substantial nonblank VGA output and the exact area.
        if (s.unique < 4 || s.nonzero < 10000 || !/ECL5#19/i.test(s.status)) {
          throw new Error(`Gateway canonical Sundabar route did not render from bundled assets: ${JSON.stringify(s)}`);
        }
      },
    );

    const secretHandoff = await runSecretExploreCombat(page, base);

    const nwnPreview = await runCase(
      page,
      base,
      'nwn-preview',
      '?nwn=1',
      'window.__rendered > 0 || /failed|error|HTTP/i.test(document.querySelector("#status")?.textContent || "")',
      (s) => {
        if (s.rendered < 50 || !/Loaded NWN preview/i.test(s.status) || !s.fileNames.some((n) => /GEO0\.DAX|TITLE\.DAX/i.test(n))) {
          throw new Error(`NWN preview did not render from static assets/external: ${JSON.stringify(s)}`);
        }
      },
    );

    const nwnExplore = await runCase(
      page, base, 'nwn-explore', '?explore=nwn',
      'window.__explore || window.__rendered === 0',
      (s) => {
        if (!s.hasExplore || s.rendered < 256 || !/Neverwinter Nights/i.test(s.status)) {
          throw new Error(`NWN map/script route did not boot from static assets: ${JSON.stringify(s)}`);
        }
      },
    );

    const dqkExplore = await runCase(
      page, base, 'dqk-explore', '?dqk=1',
      'window.__dqk || window.__rendered === 0',
      (s) => {
        if (s.dqkMapCount !== 20 || s.rendered < 100 || !/Dark Queen of Krynn/i.test(s.status)) {
          throw new Error(`DQK explorer regressed after excluding save files: ${JSON.stringify(s)}`);
        }
      },
    );

    await runCase(
      page, base, 'dqk-import-without-bundled-save', '?import=dqk',
      'window.__rendered === 0 && /No DQK save party/.test(document.querySelector("#status")?.textContent || "")',
      (s) => {
        if (!/public builds do not bundle saves/i.test(s.outputText)) {
          throw new Error(`DQK import did not explain the local-save requirement: ${JSON.stringify(s)}`);
        }
      },
    );

    await runCase(
      page, base, 'save-editor-local-only', '?chared=dok',
      'window.__rendered === 0 && /Save editor unavailable/.test(document.querySelector("#status")?.textContent || "")',
      (s) => {
        if (!/public builds do not distribute saved characters/i.test(s.outputText)) {
          throw new Error(`Save editor did not explain public-build policy: ${JSON.stringify(s)}`);
        }
      },
    );

    const support = await runCase(
      page,
      base,
      'support',
      '?support=1',
      'window.__support || window.__rendered > 0',
      (s) => {
        if (!/Support Matrix/i.test(s.supportTitle) || s.supportRows < 22 || s.supportGameCount !== 13 || !/^2026-/.test(s.supportEvidenceDate) || s.supportGapCount < 8 || !s.supportPills.includes('Persistent') || !s.supportPills.includes('Missing')) {
          throw new Error(`support matrix did not render coverage rows: ${JSON.stringify(s)}`);
        }
      },
    );

    const docs = await runCase(
      page,
      base,
      'docs',
      '?docs=1',
      'window.__docs || window.__rendered > 0',
      (s) => {
        if (!/Project Documentation/i.test(s.docsTitle) || !s.docsHasSupport || !s.docsHasPool || !s.docsHasTpov || !s.docsHasCorpus) {
          throw new Error(`docs route did not include updated support/decompile status: ${JSON.stringify(s)}`);
        }
      },
    );

    console.log(
      `RESULT: static dist-app smoke PASS; combat ${combat.combatBackdrops} terrain tiles, ` +
      `Secret combat ${secretCombat.rendered} combatants, Pool combat ${poolCombat.rendered} combatants, CoAB combat ${coabCombat.rendered} combatants, NWN asset ${nwnAsset.rendered} frame(s), game ${nwnGame.rendered} frame(s), ` +
      `Secret ${secretGame.rendered} frame(s), Pool ${poolGame.rendered} frame(s), CoAB ${coabGame.rendered} frame(s), Gateway ${gatewayGame.rendered} frame(s), Secret explore ${secretExplore.rendered} cells, Pool explore ${poolExplore.rendered} cells, CoAB explore ${coabExplore.rendered} cells, Gateway explore ${gatewayExplore.rendered} cells, ` +
      `Secret handoff ${secretHandoff.combatants.length} combatants, preview ${nwnPreview.rendered} item(s), ` +
      `NWN explore ${nwnExplore.rendered} cells, DQK ${dqkExplore.dqkMapCount} maps, save routes local-only, ` +
      `support rows ${support.supportRows}, docs ${docs.docsTitle}`,
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
