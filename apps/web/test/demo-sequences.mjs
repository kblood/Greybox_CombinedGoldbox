// Focused production-build proof for the native Gen1 attract-demo walking phases.
//
// The broad e2e suite already proves CoK's narration and complete auto-combat. This test pins the
// newly-restored presentation seam across every statically and natively verified walking title:
// each retail ECL script must load its real dungeon scene, paint at least two distinct full 320x200
// game screens, and continue through a visibly progressing scripted combat without errors or 4xxs.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const distRoot = resolve(dirname(dirname(fileURLToPath(import.meta.url))), 'dist-app');

function distPath(url) {
  const rel = decodeURIComponent(url.split('?')[0] ?? '/').replace(/^\/+/, '') || 'index.html';
  const path = normalize(resolve(distRoot, rel));
  if (path !== normalize(distRoot) && !path.startsWith(`${normalize(distRoot)}${sep}`)) return null;
  if (existsSync(path) && statSync(path).isFile()) return path;
  return extname(rel) ? null : resolve(distRoot, 'index.html');
}

const server = createServer((req, res) => {
  const path = distPath(req.url ?? '/');
  if (!path) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  const mime = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
  ]).get(extname(path)) ?? 'application/octet-stream';
  res.setHeader('Content-Type', mime);
  createReadStream(path).pipe(res);
});

const externalBase = process.env.GB_DEMO_BASE_URL?.replace(/\/?$/, '/');
if (!externalBase) await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const address = externalBase ? null : server.address();
if (!externalBase && (!address || typeof address === 'string')) throw new Error('demo smoke server did not bind');
const base = externalBase ?? `http://127.0.0.1:${address.port}/`;
const screenshotDir = process.env.GB_DEMO_SCREENSHOT_DIR ? resolve(process.env.GB_DEMO_SCREENSHOT_DIR) : null;
const captureEveryViewport = process.env.GB_DEMO_CAPTURE_EVERY_VIEWPORT === '1';
const probeDokPose = process.env.GB_DEMO_PROBE_DOK_POSE === '1';
const captureCombat = process.env.GB_DEMO_CAPTURE_COMBAT === '1';
if (screenshotDir) mkdirSync(screenshotDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });

try {
  const filter = process.env.GB_DEMO_FILTER?.toLowerCase();
  const demos = [
    ['?demo=1', 'Champions of Krynn', { pictures: 4, animated: true, completePictures: true, backdrop0: 22 }],
    ['?demo=dok', 'Death Knights of Krynn', { pictures: 4, animated: true, completePictures: true, backdrop0: 22 }],
    ['?demo=coab', 'Curse of the Azure Bonds', { walking: false, pictures: 3, backdrop0: 22 }],
    ['?demo=secret', 'Secret of the Silver Blades', { backdrop0: 22 }],
    ['?demo=gateway', 'Gateway to the Savage Frontier', { backdrop0: 22 }],
    ['?demo=pools', 'Pools of Darkness', { pictures: 4, backdrop0: 126 }],
    ['?demo=treasures', 'Treasures of the Savage Frontier', { walking: false, pictures: 4, backdrop0: 178 }],
  ].filter(([, title]) => !filter || title.toLowerCase().includes(filter));
  for (const [route, title, expected] of demos) {
    const page = await browser.newPage();
    const errors = [];
    const badResponses = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && !/favicon|DevTools/i.test(message.text())) errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && !/favicon/i.test(response.url())) {
        badResponses.push(`${response.status()} ${decodeURIComponent(response.url())}`);
      }
    });

    await page.goto(`${base}${route}`, { waitUntil: 'networkidle2', timeout: 45_000 });
    await page.waitForFunction('window.__demo && typeof window.__demo.step === "function"', { timeout: 45_000 });

    const frameHashes = new Set();
    let screenshotSaved = false;
    const pictureScreenshots = new Set();
    const screenshotAt = title === 'Secret of the Silver Blades' ? 2 : 10;
    let previousViews = 0;
    let poseProbed = false;
    let firstViewportProbe = null;
    let stats = await page.evaluate('window.__demo.stats()');
    for (let step = 0; step < 300 && stats.phase !== 'combat'; step++) {
      await page.evaluate('window.__demo.step()');
      stats = await page.evaluate('window.__demo.stats()');
      if (screenshotDir && stats.pictures > 0 && !pictureScreenshots.has(stats.pictures)) {
        pictureScreenshots.add(stats.pictures);
        const canvas = await page.$('#output canvas');
        if (canvas) {
          const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          await canvas.screenshot({ path: resolve(screenshotDir, `${slug}-picture-${stats.pictures}.png`) });
        }
      }
      if (stats.viewports > previousViews) {
        previousViews = stats.viewports;
        if (screenshotDir && probeDokPose && !poseProbed && title === 'Death Knights of Krynn') {
          poseProbed = true;
          for (let facing = 0; facing < 4; facing++) {
            await page.evaluate((dir) => window.__demo.renderPose(5, 15, dir), facing);
            const canvas = await page.$('#output canvas');
            if (canvas) await canvas.screenshot({ path: resolve(screenshotDir, `dok-pose-5-15-facing-${facing}.png`) });
          }
          // Restore the script's first pose before continuing the native sequence.
          stats = await page.evaluate(() => window.__demo.renderPose(5, 15, 0));
        }
        const frame = await page.evaluate(() => {
          const canvas = document.querySelector('#output canvas');
          if (!(canvas instanceof HTMLCanvasElement)) return null;
          const context = canvas.getContext('2d');
          if (!context) return null;
          const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const unique = new Set();
          let hash = 0x811c9dc5;
          for (let i = 0; i < data.length; i += 4) {
            unique.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
            hash ^= data[i]; hash = Math.imul(hash, 0x01000193) >>> 0;
            hash ^= data[i + 1]; hash = Math.imul(hash, 0x01000193) >>> 0;
            hash ^= data[i + 2]; hash = Math.imul(hash, 0x01000193) >>> 0;
          }
          return { width: canvas.width, height: canvas.height, colors: unique.size, hash };
        });
        // An open Gateway corridor can legitimately be just the two ceiling/floor colours; later
        // frames must still differ, which the distinct-frame assertion below pins independently.
        if (!frame || frame.width !== 320 || frame.height !== 200 || frame.colors < 2) {
          throw new Error(`${title}: invalid viewport ${JSON.stringify(frame)}`);
        }
        // Native CoK demo frame t0040 places the first scripted city view at (13,5,W).
        // These pixels are all supplied by low-id resident 8X8D1 wall tiles, not 8X8D2.
        // Retaining only the area archive made them vanish/route incorrectly while the generic
        // "two different frames" assertion still passed.
        if (title === 'Champions of Krynn' && stats.viewports === 1) {
          firstViewportProbe = await page.evaluate(() => {
            const canvas = document.querySelector('#output canvas');
            const context = canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : null;
            if (!canvas || !context) return null;
            return [[104, 32], [96, 40], [104, 40], [96, 48], [88, 64]].map(([x, y]) =>
              [...context.getImageData(x, y, 1, 1).data.slice(0, 3)],
            );
          });
        }
        frameHashes.add(frame.hash);
        if (screenshotDir && captureEveryViewport) {
          const canvas = await page.$('#output canvas');
          if (canvas) {
            // Screenshot the framebuffer at its native 320×200 pixels; the app's responsive CSS
            // otherwise captures a browser-scaled 457×297 element and defeats pixel comparison.
            await canvas.evaluate((el) => { el.style.width = '320px'; el.style.height = '200px'; });
            const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const viewNo = String(stats.viewports).padStart(2, '0');
            await canvas.screenshot({ path: resolve(screenshotDir, `${slug}-viewport-${viewNo}.png`) });
          }
        }
        if (screenshotDir && !screenshotSaved && stats.viewports >= screenshotAt) {
          const canvas = await page.$('#output canvas');
          if (canvas) {
            const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            await canvas.screenshot({ path: resolve(screenshotDir, `${slug}.png`) });
            screenshotSaved = true;
          }
        }
      }
    }

    if (expected.walking !== false
      && (stats.walkError || stats.sceneGeo === null || stats.viewports < 2 || frameHashes.size < 2)) {
      throw new Error(`${title}: walking proof failed ${JSON.stringify({ stats, distinctFrames: frameHashes.size })}`);
    }
    if (expected.walking === false && (stats.viewports !== 0 || stats.pictures < 1)) {
      throw new Error(`${title}: non-walking native presentation regressed ${JSON.stringify(stats)}`);
    }
    if (title === 'Champions of Krynn'
      && JSON.stringify(firstViewportProbe) !== JSON.stringify([[170, 85, 0], [170, 85, 0], [170, 85, 0], [170, 85, 0], [170, 85, 0]])) {
      throw new Error(`${title}: resident boot-wall tiles missing from first city viewport ${JSON.stringify(firstViewportProbe)}`);
    }
    if (stats.phase !== 'combat' || !(stats.party?.length > 0) || !(stats.enemies?.length > 0)) {
      throw new Error(`${title}: combat handoff failed ${JSON.stringify(stats)}`);
    }
    if (expected.pictures && stats.pictures < expected.pictures) {
      throw new Error(`${title}: picture sequence incomplete ${JSON.stringify(stats)}`);
    }
    if (expected.animated && stats.animationFrames < 1) {
      throw new Error(`${title}: animated pictures never advanced ${JSON.stringify(stats)}`);
    }
    if (expected.completePictures && stats.missingPictures !== 0) {
      throw new Error(`${title}: unresolved scripted pictures ${JSON.stringify(stats)}`);
    }
    const roster = { party: stats.party.length, enemies: stats.enemies.length };
    // Remote production assets can take longer than a local loopback fetch. Do not spend the action
    // budget polling an old/absent seam while launchCombat is still loading the title's CPIC/DUNGCOM.
    await page.waitForFunction(
      'window.__combat && typeof window.__combat.autoStep === "function"',
      { timeout: 45_000 },
    );
    const combatStart = await page.evaluate(() => ({
      seam: !!window.__combat,
      over: window.__combat?.isOver?.() ?? null,
      outcome: window.__combat?.outcome?.() ?? null,
      cells: window.__combat?.cellCount ?? null,
      combatantIcons: window.__combat?.combatantIconCount?.() ?? null,
      mapSize: window.__combat?.mapSize?.() ?? null,
      background: window.__combat?.backgroundSummary?.() ?? null,
      backdrop0: window.__combat?.backdropTileAt?.(0, 0) ?? null,
      log: window.__combat?.log?.().slice(-5) ?? [],
    }));
    const calibratedCombat = title === 'Champions of Krynn' || title === 'Death Knights of Krynn'
      || title === 'Curse of the Azure Bonds' || title === 'Secret of the Silver Blades'
      || title === 'Gateway to the Savage Frontier';
    const calibratedTerrain = title !== 'Curse of the Azure Bonds';
    if (calibratedCombat
      && (!(combatStart.combatantIcons >= roster.party + roster.enemies)
        || combatStart.mapSize?.w !== 13
        || combatStart.mapSize?.h !== 9
        || (calibratedTerrain && !(combatStart.background?.nonFloor > 0)))) {
      throw new Error(`${title}: calibrated combat assets missing ${JSON.stringify({ roster, combatStart })}`);
    }
    if (expected.backdrop0 !== undefined && combatStart.backdrop0 !== expected.backdrop0) {
      throw new Error(`${title}: native DUNGCOM tile indices were remapped ${JSON.stringify({ expected: expected.backdrop0, combatStart })}`);
    }
    const combatHashes = new Set();
    let priorCombatSteps = 0;
    // Combat chrome loads asynchronously before the seam exists. Each demo tick then executes only
    // one tactical AI action, allowing the battle to be observed rather than jumping to its result.
    for (let step = 0; step < 600 && stats.combats < 1; step++) {
      await page.evaluate('window.__demo.step()');
      stats = await page.evaluate('window.__demo.stats()');
      if (stats.combatSteps > priorCombatSteps) {
        priorCombatSteps = stats.combatSteps;
        if (screenshotDir && captureCombat && (stats.combatSteps <= 3 || stats.combatSteps % 50 === 0)) {
          const canvas = await page.$('.sheet-overlay canvas');
          if (canvas) {
            await canvas.evaluate((el) => { el.style.width = '320px'; el.style.height = '200px'; });
            const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const stepNo = String(stats.combatSteps).padStart(3, '0');
            await canvas.screenshot({ path: resolve(screenshotDir, `${slug}-combat-${stepNo}.png`) });
          }
        }
        const hash = await page.evaluate(() => {
          const canvas = document.querySelector('.sheet-overlay canvas');
          if (!(canvas instanceof HTMLCanvasElement)) return null;
          const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
          if (!data) return null;
          let value = 0x811c9dc5;
          for (let i = 0; i < data.length; i += 4) {
            value ^= data[i]; value = Math.imul(value, 0x01000193) >>> 0;
            value ^= data[i + 1]; value = Math.imul(value, 0x01000193) >>> 0;
            value ^= data[i + 2]; value = Math.imul(value, 0x01000193) >>> 0;
          }
          return value;
        });
        if (hash !== null) combatHashes.add(hash);
      }
    }
    if (stats.combats < 1 || !['party', 'enemy', 'draw'].includes(stats.lastOutcome)) {
      throw new Error(`${title}: automatic combat did not resolve ${JSON.stringify(stats)}`);
    }
    if (stats.combatSteps < 3 || combatHashes.size < 2) {
      throw new Error(`${title}: combat was not visibly progressive ${JSON.stringify({ stats, combatStart, distinctCombatFrames: combatHashes.size })}`);
    }
    if (errors.length || badResponses.length) {
      throw new Error(`${title}: browser errors=${errors.join(' | ')} http=${badResponses.join(' | ')}`);
    }
    console.log(`${title}: GEO#${stats.sceneGeo ?? 'none'}, ${stats.pictures} pictures/${stats.animationFrames} animation steps, ${stats.viewports} walks, ${combatHashes.size} combat frames, ${roster.party}v${roster.enemies} -> ${stats.lastOutcome}`);
    await page.close();
  }

  // DQK is Gen2/HLIB and intentionally has a different playback seam: its retail script hands
  // COMBAT to a native duel-setup helper rather than ECL LOAD_MONSTER. Prove the browser still
  // paints real resolved portraits and all five live-captured CPIC tokens at that boundary.
  if (!filter || 'the dark queen of krynn'.includes(filter)) {
    const title = 'The Dark Queen of Krynn';
    const page = await browser.newPage();
    const errors = [];
    const badResponses = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && !/favicon|DevTools/i.test(message.text())) errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && !/favicon/i.test(response.url())) {
        badResponses.push(`${response.status()} ${decodeURIComponent(response.url())}`);
      }
    });
    await page.goto(`${base}?demo=dqk`, { waitUntil: 'networkidle2', timeout: 45_000 });
    await page.waitForFunction('window.__dqkDemo && typeof window.__dqkDemo.step === "function"', { timeout: 45_000 });
    let stats = await page.evaluate('window.__dqkDemo.stats()');
    for (let step = 0; step < 200 && !stats.duelIconsShown; step++) {
      await page.evaluate('window.__dqkDemo.step()');
      stats = await page.evaluate('window.__dqkDemo.stats()');
    }
    const art = await page.evaluate(() => ({
      portrait: (() => {
        const canvas = document.querySelector('.gb-dqk-demo-art');
        return canvas instanceof HTMLCanvasElement ? { width: canvas.width, height: canvas.height } : null;
      })(),
      duel: (() => {
        const canvas = document.querySelector('.gb-dqk-demo-duel');
        return canvas instanceof HTMLCanvasElement ? { width: canvas.width, height: canvas.height } : null;
      })(),
    }));
    if (!stats.combatReached || !stats.duelIconsShown || stats.lastPictureId === null
      || !(art.portrait?.width > 0) || !(art.portrait?.height > 0)
      || !(art.duel?.width > 0) || !(art.duel?.height > 0)) {
      throw new Error(`${title}: portrait/duel playback incomplete ${JSON.stringify({ stats, art })}`);
    }
    if (errors.length || badResponses.length) {
      throw new Error(`${title}: browser errors=${errors.join(' | ')} http=${badResponses.join(' | ')}`);
    }
    console.log(`${title}: ${stats.beatsPlayed} script beats, portrait #${stats.lastPictureId}, native duel CPIC tokens shown`);
    await page.close();
  }
} finally {
  await browser.close();
  if (!externalBase) await new Promise((closed) => server.close(closed));
}
