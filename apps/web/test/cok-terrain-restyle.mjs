// Bounded DUNGCOM gate: local original archives and reviewed external art only; no saves.
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundleCokTerrainRestyle } from '../scripts/bundle-cok-terrain-restyle.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import puppeteer from 'puppeteer-core';

const manifest = JSON.parse(readFileSync(new URL('../src/ui/cokTerrainRestyleManifest.json', import.meta.url)));
let server, browser;
let base = process.env.GB_COK_TERRAIN_BASE_URL?.replace(/\/+$/, '');
const external = !!base;
try {
  const packageRoot = mkdtempSync(join(tmpdir(), 'gb-cok-terrain-'));
  const packageSource = join(packageRoot, 'source'), packageOutput = join(packageRoot, 'output');
  mkdirSync(packageSource); mkdirSync(packageOutput);
  for (const tile of manifest.tiles) copyFileSync(`C:/GoldBoxImg/cok_restyle_work/done/${tile.stem}.png`, join(packageSource, `${tile.stem}.png`));
  assert.equal(bundleCokTerrainRestyle(packageSource, packageOutput), 25);
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  for (const tile of manifest.tiles) assert.equal(sha(readFileSync(join(packageOutput, 'restyle/cok/terrain', `${tile.stem}.png`))), tile.sha256);
  const firstPath = join(packageSource, `${manifest.tiles[0].stem}.png`), firstBytes = readFileSync(firstPath);
  const badHash = Buffer.from(firstBytes); badHash[badHash.length - 1] ^= 1;
  writeFileSync(firstPath, badHash);
  assert.throws(() => bundleCokTerrainRestyle(packageSource, packageOutput), /SHA-256 differs/);
  const badGeometry = Buffer.from(firstBytes); badGeometry.writeUInt32BE(97, 16);
  writeFileSync(firstPath, badGeometry);
  assert.throws(() => bundleCokTerrainRestyle(packageSource, packageOutput), /dimensions/);
  assert.equal(sha(readFileSync(join(packageOutput, 'restyle/cok/terrain', `${manifest.tiles[0].stem}.png`))), manifest.tiles[0].sha256);
  if (!base) {
    const probe = net.createServer();
    await new Promise((done) => probe.listen(0, '127.0.0.1', done));
    const port = probe.address().port;
    await new Promise((done) => probe.close(done));
    base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
      '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'pipe' });
    let log = '';
    for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { log += chunk; });
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null) throw new Error(log);
      try { ready = (await fetch(base)).ok && log.includes(`127.0.0.1:${port}`); } catch { /* starting */ }
      if (ready) break;
      await new Promise((done) => setTimeout(done, 100));
    }
    assert.ok(ready, log);
  }
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let corrupt = false;
  let failedTile = null;
  if (!external) {
    assert.ok(process.env.GB_COK_COMBAT_ORIGINAL_ROOT, 'Set GB_COK_COMBAT_ORIGINAL_ROOT to a complete package with actual Amiga archives');
    const originals = new Map(['DUNGCOM', 'RANDCOM'].map((name) => [name, readFileSync(join(process.env.GB_COK_COMBAT_ORIGINAL_ROOT,
      `assets/amiga_extracted/ChampionsOfKrynn/disk1/${name}.DAA`))]));
    for (const [name, pin] of [['DUNGCOM', 'ee4aa9463e5923dd71fbd459abb4be98924e95de23d4e046d15a4973c59a4070'], ['RANDCOM', '678d0ab7dab82b389ca08e548a8fbd6d8f4a7f2046c3ba50138b99a0448fc69e']]) {
      assert.equal(sha(originals.get(name)), pin);
    }
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      const tile = manifest.tiles.find((tile) => path === `/restyle/cok/terrain/${tile.stem}.png`);
      if (tile) {
        const bytes = readFileSync(`C:/GoldBoxImg/cok_restyle_work/done/${tile.stem}.png`);
        if (corrupt || failedTile === tile.tileIndex) bytes[bytes.length - 1] ^= 1;
        void request.respond({ status: 200, contentType: 'image/png', body: bytes });
      } else if (/ChampionsOfKrynn\/disk1\/(DUNGCOM|RANDCOM)\.DAA$/.test(path)) {
        void request.respond({ status: 200, contentType: 'application/octet-stream', body: originals.get(path.split('/').at(-1).split('.')[0]) });
      } else void request.continue();
    });
  }
  const settled = async () => {
    await page.waitForFunction(() => { const s = window.__combat.graphicsLoadState(); return !s.loading && s.appliedRevision === s.requestedRevision; }, { timeout: 60000 });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  };
  await page.evaluateOnNewDocument(() => {
    localStorage.clear(); localStorage.setItem('greybox.graphics.cok-natural', 'DOS-EGA');
  });
  await page.goto(`${base}/?explore=cok-natural`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('window.__explore?.move', { timeout: 45000 });
  assert.deepEqual(await page.evaluate(() => window.__explore.getPose()), { x: 14, y: 10, facing: 'north' });
  const actions = ['right', 'forward', 'right', 'forward', 'forward', 'forward', 'right', 'forward', 'forward',
    'left', 'forward', 'right', 'forward', 'forward', 'forward', 'right', 'forward', 'left', 'forward',
    'right', 'forward', 'left', 'forward', 'forward', 'left', 'forward', 'right', 'forward'];
  for (const action of actions) await page.evaluate((action) => window.__explore.move(action), action);
  await page.waitForFunction('window.__explore.combatOpen() && window.__combat?.terrainRestyleIds().length === 25', { timeout: 45000 });
  const loaded = await page.evaluate(() => ({ sources: window.__combat.terrainSources(), errors: window.__combat.terrainRestyleErrors() }));
  assert.deepEqual(loaded.errors, {});
  assert.equal(loaded.sources.length, 25);
  for (const [tileIndex, source] of loaded.sources.entries()) assert.deepEqual(source,
    { game: 'cok', system: 'DOS-EGA', archive: 'DUNGCOM.DAX', archiveSha256: manifest.sourceArchiveSha256, blockId: 1, tileIndex });
  const snapshot = (key) => page.evaluate(async (key) => {
    const canvas = document.querySelector('.sheet-overlay .gb-emu canvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    if (key) window[key] = { pixels, width: canvas.width, height: canvas.height };
    return { hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)),
      (byte) => byte.toString(16).padStart(2, '0')).join(''), combatants: window.__combat.combatants(),
      phase: window.__combat.phase(), active: window.__combat.activeId(), view: window.__combat.viewport(),
      movement: window.__combat.movementLeft(), rows: window.__combat.panelRows() };
  }, key);
  // Guarded figures keep native foreground, with terrain visible through their transparent holes.
  const target = await page.evaluate(() => {
    const enemy = window.__combat.visibleCombatIcons().find((cell) => cell.side === 'enemy' && cell.icon);
    const id = enemy?.id ?? 'e0';
    window.__combat.setCombatantFlagForTest(id, 'guarding', true);
    window.__combat.recenterCombatantForTest(id);
    return id;
  });
  const before = await snapshot('terrainBefore');
  await page.click('#combat-graphics-restyle');
  await page.waitForFunction('window.__combat.graphicsMode() === "Restyle" && window.__combat.displayProfile().nativeWidth === 1280');
  await settled();
  const after = await snapshot('terrainAfter');
  assert.notEqual(after.hash, before.hash);
  assert.deepEqual({ ...after, hash: '' }, { ...before, hash: '' });
  const readTerrainReceipt = () => page.evaluate(() => {
    const receipt = window.__combat.terrainRenderReceipt();
    const canvas = document.querySelector('.sheet-overlay .gb-emu canvas');
    const context = canvas.getContext('2d');
    const rect = window.__combat.displayRect();
    const dpr = devicePixelRatio || 1;
    return { indices: receipt.visibleTileIndices, samples: receipt.changedTerrainSamples.map((sample) => {
      const point = window.__combat.canvasPointForNativePixel(sample.x, sample.y);
      const ax = Math.floor((point.x + 0.5 - rect.x * dpr) * 1280 / (rect.width * dpr)) - sample.x * 4;
      const ay = Math.floor((point.y + 0.5 - rect.y * dpr) * 800 / (rect.height * dpr)) - sample.y * 4;
      return { x: sample.x, y: sample.y, rgb: sample.block[ay * 4 + ax],
        actual: [...context.getImageData(point.x, point.y, 1, 1).data].slice(0, 3) };
    }) };
  });
  const terrainReceipt = await readTerrainReceipt();
  assert.ok(terrainReceipt.indices.length > 1, 'natural wall assemblage must use multiple DUNGCOM local indices');
  assert.ok(terrainReceipt.samples.length > 0, 'must locate changed terrain pixels outside every foreground and RGBA icon rectangle');
  for (const sample of terrainReceipt.samples) assert.deepEqual(sample.actual, sample.rgb, 'actual canvas must show the exact mapped terrain pixel');
  console.log(`Natural visible DUNGCOM tiles: ${terrainReceipt.indices.join(',')}; ${terrainReceipt.samples.length} changed terrain-only pixel samples match the mapped art.`);
  assert.equal(await page.evaluate((id) => window.__combat.visibleCombatIcons().find((cell) => cell.id === id)?.guarding, target), true);
  await page.click('#combat-graphics-dos');
  await page.waitForFunction('window.__combat.graphicsMode() === "DOS-EGA"');
  await settled();
  // DOS reload is asynchronous; require the exact original pixels rather than only the selection.
  await page.waitForFunction(async (expected) => {
    const canvas = document.querySelector('.sheet-overlay .gb-emu canvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)),
      (byte) => byte.toString(16).padStart(2, '0')).join('') === expected;
  }, { timeout: 30000 }, before.hash);
  assert.deepEqual(await snapshot(), before);
  const cameraViews = new Set([JSON.stringify(before.view)]);
  for (const id of ['p1', target]) {
    await page.evaluate((id) => window.__combat.recenterCombatantForTest(id), id);
    const atCamera = await snapshot();
    cameraViews.add(JSON.stringify(atCamera.view));
    assert.deepEqual(atCamera.combatants, before.combatants, 'camera pan must not move any combatant');
    await page.click('#combat-graphics-restyle');
    await page.waitForFunction('window.__combat.graphicsMode() === "Restyle"');
    await settled();
    const renderedAtCamera = await snapshot();
    assert.notEqual(renderedAtCamera.hash, atCamera.hash, 'terrain/icon presentation remains visible after camera pan');
    assert.deepEqual({ ...renderedAtCamera, hash: '' }, { ...atCamera, hash: '' });
    await page.click('#combat-graphics-dos');
    await page.waitForFunction('window.__combat.graphicsMode() === "DOS-EGA"');
    await settled();
    assert.deepEqual(await snapshot(), atCamera, 'DOS restoration must remain exact at each camera position');
  }
  assert.ok(cameraViews.size > 1, 'natural test must exercise multiple actual camera positions');

  if (!external) {
    const controls = await page.evaluate(async (manifest) => {
      const terrain = await import('/src/ui/cokTerrainRestyle.ts');
      const engine = await import('/@fs/C:/Modding/GoldBox/packages/engine/src/index.ts');
      const combat = await import('/src/ui/combat.ts');
      const source = { game: 'cok', system: 'DOS-EGA', archive: 'DUNGCOM.DAX', archiveSha256: manifest.sourceArchiveSha256, blockId: 1, tileIndex: 0 };
      for (const [key, value] of Object.entries({ game: 'dok', system: 'Amiga', archive: 'RANDCOM.DAX', archiveSha256: '0'.repeat(64), blockId: 0, tileIndex: 25 })) {
        if (terrain.cokTerrainRestyleIdentity({ ...source, [key]: value })) throw new Error(`wrong ${key} admitted`);
      }
      const bytes = new Uint8Array(await (await fetch('/@fs/C:/Modding/GoldBox/Champions%20of%20Krynn/DUNGCOM.DAX')).arrayBuffer());
      const frames = terrain.decodeCombatTerrain(bytes, 'DUNGCOM.DAX');
      const outputs = await Promise.all(frames.map((frame, i) => terrain.loadCokTerrainRestyle(manifest.tiles[i], frame.image)));
      for (const badSource of [{ ...frames[0].image, width: 23 }, { ...frames[0].image, indices: new Uint8Array(576) }]) {
        let rejected = false;
        try { await terrain.loadCokTerrainRestyle(manifest.tiles[0], badSource); } catch { rejected = true; }
        if (!rejected) throw new Error('wrong source geometry/pixels admitted');
      }
      const empty = outputs[22];
      const emptySource = frames[22].image;
      const palette = engine.makeEgaPalette();
      for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
        const color = palette.colors[emptySource.indices[Math.floor(y / 4) * 24 + Math.floor(x / 4)]];
        const offset = (y * 96 + x) * 4;
        if ([color.r, color.g, color.b, 255].some((value, c) => empty.pixels[offset + c] !== value)) {
          throw new Error('preserved-empty tile differs from its opaque original source');
        }
      }
      // A transparent hole inside an opaque black sprite, over a visibly different terrain tile.
      const tile = frames[0].image;
      const icon = { ...tile, width: 24, height: 24, indices: new Uint8Array(576).fill(0), transparentIndex: 13 };
      icon.indices[12 * 24 + 12] = 13;
      const cells = [{ combatantId: 'fixture', side: 'enemy', col: 0, row: 0, icon, guarding: true, impaired: true, active: true }];
      const sentinel = { ...tile, indices: new Uint8Array(576).fill(255), transparentIndex: null };
      const foreground = engine.composeCombatScreen({ cells, backdrop: { tiles: [sentinel] } });
      const art = { width: 96, height: 96, pixels: new Uint8ClampedArray(96 * 96 * 4).fill(255) };
      const indices = Array(49).fill(25); indices[0] = 0; indices[1] = 22;
      const layers = terrain.cokTerrainLayers([...frames.map((frame) => frame.image), tile], indices,
        new Map([[0, art], [22, empty]]), foreground);
      if (layers.length !== 2 || layers[1].x !== 32) throw new Error('global/local bank indices or cell placement corrupted');
      const pixels = layers[0].art.pixels;
      if (pixels[(48 * 96 + 48) * 4 + 3] !== 255) throw new Error('transparent icon hole failed to expose terrain');
      if (pixels[(40 * 96 + 40) * 4 + 3] !== 0) throw new Error('opaque black sprite was covered');
      for (const [x, y] of [[0,0], [4,4], [0,40]]) if (pixels[(y * 96 + x) * 4 + 3] !== 0) throw new Error('cursor/status/guard covered');
      const transparent = { ...icon, indices: new Uint8Array(576).fill(13) };
      const statusForeground = engine.composeCombatScreen({ cells: [{ ...cells[0], icon: transparent, active: false }],
        backdrop: { tiles: [sentinel] } });
      const statusArt = terrain.cokTerrainLayers([tile], null, new Map([[0, art]]), statusForeground)[0].art.pixels;
      if (statusArt[(40 * 96 + 4) * 4 + 3] !== 0 || statusArt[(4 * 96 + 40) * 4 + 3] !== 0
          || statusArt[(40 * 96 + 40) * 4 + 3] !== 255) throw new Error('guard/status mask must work independently of opaque sprite/cursor');
      const baseScreen = engine.composeCombatScreen({ cells, backdrop: { tiles: [tile] } });
      const composited = engine.composeRgbaArt(baseScreen, engine.makeEgaPalette(), layers, 4);
      const pixel = (x, y) => [...composited.pixels.slice((y * composited.width + x) * 4, (y * composited.width + x) * 4 + 3)];
      if (pixel(8 * 4 + 48, 8 * 4 + 48).some((v) => v !== 255)
          || pixel(8 * 4 + 40, 8 * 4 + 40).some((v) => v !== 0)
          || pixel(180 * 4, 10 * 4).some((v) => v !== 0)) throw new Error('final terrain/opaque black/transparent hole/HUD composite differs');
      const a = await combat.loadCombatAssets({ runtimeGameId: 'cok', randcomPath: 'Champions of Krynn/RANDCOM.DAX' });
      if (a.backdropTiles.length !== 31 || a.terrainSources[25].archive !== 'RANDCOM.DAX'
          || a.terrainSources[25].tileIndex !== 0 || a.terrainRestyles.has(25)) throw new Error('appended RANDCOM admitted as local DUNGCOM');
      const paths = { runtimeGameId: 'cok', graphicsMode: 'Amiga', restyleMode: true,
        amigaDungcomPath: 'amiga_extracted/ChampionsOfKrynn/disk1/DUNGCOM.DAA',
        randcomPath: 'Champions of Krynn/RANDCOM.DAX', amigaRandcomPath: 'amiga_extracted/ChampionsOfKrynn/disk1/RANDCOM.DAA' };
      const b = await combat.loadCombatAssets(paths);
      if (b.sourcePaths.backdropGraphicSet !== 'Amiga' || b.backdropTiles.length !== 31 || b.terrainSources[25].archive !== 'RANDCOM.DAA'
          || b.terrainSources[25].tileIndex !== 0 || b.terrainRestyles.has(25) || b.terrainRestyleSources.has(25)
          || b.terrainRestyleSources.size !== 25 || [...b.terrainRestyleSources.values()].some((s) => s.archive !== 'DUNGCOM.DAX')) throw new Error('mixed original/overlay bank provenance corrupted');
      const catalog = await import('/src/ui/catalog.ts');
      const read = async (path) => new Uint8Array(await (await fetch(catalog.assetUrl(path))).arrayBuffer());
      const originalRandom = terrain.decodeCombatTerrain(await read(paths.amigaRandcomPath), 'RANDCOM.DAA');
      for (let i = 0; i < 6; i++) {
        if (await terrain.terrainSha256(b.backdropTiles[25 + i].indices) !== await terrain.terrainSha256(originalRandom[i].image.indices)
            || JSON.stringify(b.backdropTiles[25 + i].palette) !== JSON.stringify(originalRandom[i].image.palette)) throw new Error(`Amiga RANDCOM original pixels changed at slot${25 + i}`);
      }
      const badAlignment = await combat.loadCombatAssets({ ...paths, readAsset: (path) => read(path === paths.amigaDungcomPath ? paths.amigaRandcomPath : path) });
      if (badAlignment.sourcePaths.backdropGraphicSet !== 'DOS-EGA' || badAlignment.backdropTiles.length !== 31) throw new Error('misaligned Amiga bank accepted');
      const wrongDos = await combat.loadCombatAssets({ ...paths, readAsset: (path) => read(path.endsWith('/DUNGCOM.DAX') ? paths.randcomPath : path) });
      if (wrongDos.sourcePaths.backdropGraphicSet !== 'Amiga' || wrongDos.terrainRestyles.size !== 0) throw new Error('unproved DOS source replaced original Amiga');
      const missingRandom = await combat.loadCombatAssets({ ...paths, readAsset: (path) => path === paths.amigaRandcomPath ? Promise.reject(new Error('missing')) : read(path) });
      if (missingRandom.terrainSources[25].archive !== 'RANDCOM.DAX' || missingRandom.terrainSources[0].archive !== 'DUNGCOM.DAA'
          || missingRandom.terrainRestyles.has(25)) throw new Error('per-bank original fallback corrupted');
      return { frames: frames.length, outputs: outputs.length, layers: layers.length, appended: a.backdropTiles.length };
    }, manifest);
    assert.deepEqual(controls, { frames: 25, outputs: 25, layers: 2, appended: 31 });
    corrupt = true;
    const rejected = await page.evaluate(async () => {
      const { loadCombatAssets } = await import('/src/ui/combat.ts');
      const loaded = await loadCombatAssets({ runtimeGameId: 'cok' });
      return { mapped: loaded.terrainRestyles.size, rejected: loaded.terrainRestyleErrors.size };
    });
    assert.deepEqual(rejected, { mapped: 0, rejected: 25 });
    corrupt = false;
    await page.goto(`${base}/?explore=1`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction('window.__explore?.testFight'); await page.evaluate('window.__explore.testFight(0x55)');
    await page.waitForFunction('document.querySelector("#combat-graphics-amiga")');
    await page.evaluate(() => { const c = document.querySelector('.sheet-overlay .gb-emu canvas'); window.diagnosticDos = c.getContext('2d').getImageData(0, 0, c.width, c.height); });
    await page.click('#combat-graphics-amiga'); await settled();
    assert.equal(await page.evaluate('window.__combat.backdropGraphicsMode()'), 'Amiga');
    const originalAmiga = await snapshot();
    failedTile = await page.evaluate((emptyIds) => {
      const view = window.__combat.viewport(), indices = [];
      for (let row = 0; row < 7; row++) for (let col = 0; col < 7; col++) indices.push(window.__combat.backdropTileAt(view.col + col, view.row + row));
      const ids = [...new Set(indices)].filter((id) => id >= 0 && id < 25);
      if (ids.length < 2) throw new Error('Need multiple visible original tiles for partial fallback');
      const canvas = document.querySelector('.sheet-overlay .gb-emu canvas'), context = canvas.getContext('2d');
      for (const id of ids.filter((id) => !emptyIds.includes(id))) {
      window.failedTerrainSamples = [];
      for (let cell = 0; cell < 49; cell++) if (indices[cell] === id) for (let y = 4; y < 20; y++) for (let x = 4; x < 20; x++) {
        const nx = 8 + cell % 7 * 24 + x, ny = 8 + Math.floor(cell / 7) * 24 + y;
        if (window.__combat.visibleCombatIcons().some((c) => nx >= c.cellX && nx < c.cellX + 24 * (c.size ?? 1) && ny >= c.cellY && ny < c.cellY + 24 * (c.size ?? 1))) continue;
        const p = window.__combat.canvasPointForNativePixel(nx, ny);
        window.failedTerrainSamples.push({ ...p, rgba: [...context.getImageData(p.x, p.y, 1, 1).data] });
      }
      if (window.failedTerrainSamples.some(({ x, y, rgba }) => rgba.some((v, c) => v !== window.diagnosticDos.data[(y * window.diagnosticDos.width + x) * 4 + c]))) return id;
      }
      throw new Error('Need a visible nonempty failed tile with distinguishable Amiga/DOS pixels');
    }, manifest.tiles.filter((tile) => tile.preservedEmpty).map((tile) => tile.tileIndex));
    await page.click('#combat-graphics-restyle'); await settled();
    assert.equal(await page.evaluate('window.__combat.backdropGraphicsMode()'), 'Amiga');
    const partial = await snapshot(); assert.notEqual(partial.hash, originalAmiga.hash);
    assert.deepEqual({ ...partial, hash: '' }, { ...originalAmiga, hash: '' });
    assert.deepEqual(await page.evaluate('Object.keys(window.__combat.terrainRestyleErrors()).map(Number)'), [failedTile]);
    assert.equal(await page.evaluate('Object.keys(window.__combat.terrainRestyleSources()).length'), 24);
    const fallbackPixels = await page.evaluate(() => {
      const context = document.querySelector('.sheet-overlay .gb-emu canvas').getContext('2d');
      return window.failedTerrainSamples.map(({ x, y, rgba }) => ({ expected: rgba, actual: [...context.getImageData(x, y, 1, 1).data] }));
    });
    assert.ok(fallbackPixels.length > 0); for (const pixel of fallbackPixels) assert.deepEqual(pixel.actual, pixel.expected, 'Failed overlay retains exact original Amiga pixel');
    const good = await readTerrainReceipt(); assert.ok(good.samples.length > 0, 'Other overlays still render');
    for (const sample of good.samples) assert.deepEqual(sample.actual, sample.rgb, 'Valid overlay retains exact mapped pixels beside a failed tile');
    console.log(`Mixed-source Amiga:24 admitted DOS overlays; failed tile${failedTile} retains${fallbackPixels.length} exact original pixel samples;${good.samples.length} good terrain samples match mapped output.`);
    failedTile = null; await page.click('#combat-graphics-restyle'); await settled();
    assert.deepEqual(await page.evaluate('window.__combat.terrainRestyleErrors()'), {});
    await page.click('#combat-graphics-amiga'); await settled(); assert.deepEqual(await snapshot(), originalAmiga);
  }
  assert.deepEqual(errors, []);
  console.log(`PASS CoK terrain: 25 packaged pins; natural encounter 25 source identities, terrain-only mapped pixels, camera pan and DOS/Restyle/DOS exact pixels/state. ${external ? 'Dev module/mutation controls skipped on external URL; run local focused gate separately.' : 'Dev controls passed: wrong identities/source pixels/geometry, all source/output pins, preserved-empty, opaque black/transparent hole/cursor/status/guard/final HUD composite, RANDCOM local identity and corrupt output fallback.'}`);
} finally {
  await browser?.close();
  server?.kill();
}
