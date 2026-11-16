// Focused CoK combat graphics-mode switch check. It compares the live backdrop source and combat
// state while exercising DOS-EGA, Amiga, and Restyle from one active encounter.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import puppeteer from 'puppeteer-core';

const combatManifest = JSON.parse(readFileSync(new URL('../src/ui/cokCombatRestyleManifest.json', import.meta.url), 'utf8'));
const terrainManifest = JSON.parse(readFileSync(new URL('../src/ui/cokTerrainRestyleManifest.json', import.meta.url), 'utf8'));

let port = 5186;
let base = '';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let server = null;
let browser = null;

async function startServer() {
  const candidateBase = process.env.GB_COK_GRAPHICS_BASE_URL;
  if (candidateBase) {
    base = candidateBase.replace(/\/+$/, '');
    const response = await fetch(`${base}/`);
    if (!response.ok) throw new Error(`candidate site returned HTTP ${response.status}`);
    return;
  }
  for (const candidate of [5186, 5187, 5188, 5189]) {
    const free = await new Promise((resolve) => {
      const probe = net.createServer();
      probe.once('error', () => resolve(false));
      probe.once('listening', () => probe.close(() => resolve(true)));
      probe.listen(candidate, '127.0.0.1');
    });
    if (free) { port = candidate; break; }
  }
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
    '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'pipe' });
  let log = '';
  for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { log += String(chunk); });
  for (let n = 0; n < 120; n++) {
    if (server.exitCode !== null) throw new Error(`owned Vite server exited: ${log}`);
    try {
      const response = await fetch(base);
      if (response.ok && log.includes(`127.0.0.1:${port}`)) return;
    } catch { /* server still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not start: ${log}`);
}

try {
  await startServer();
  browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  let unavailableAmiga = null, delayNextAmiga = false, releaseDelayedAmiga;
  const fixtures = new Map();
  let cpicFault = null, releaseCpic;
  const cpicRequests = [], expectedCpicFailures = new Map();
  if (!process.env.GB_COK_GRAPHICS_BASE_URL) {
    assert.ok(process.env.GB_COK_COMBAT_ORIGINAL_ROOT, 'Set GB_COK_COMBAT_ORIGINAL_ROOT to the complete package containing actual Amiga archives');
    for (const [file, pin] of [['DUNGCOM', 'ee4aa9463e5923dd71fbd459abb4be98924e95de23d4e046d15a4973c59a4070'], ['RANDCOM', '678d0ab7dab82b389ca08e548a8fbd6d8f4a7f2046c3ba50138b99a0448fc69e']]) {
      const bytes = readFileSync(join(process.env.GB_COK_COMBAT_ORIGINAL_ROOT, `assets/amiga_extracted/ChampionsOfKrynn/disk1/${file}.DAA`));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), pin); fixtures.set(`${file}.DAA`, bytes);
    }
    for (const [folder, icons] of [['combat', combatManifest.banks.flatMap((bank) => bank.icons)], ['terrain', terrainManifest.tiles]]) for (const icon of icons) {
      const bytes = readFileSync(join(process.env.GB_COK_RESTYLE_SOURCE ?? 'C:/GoldBoxImg/cok_restyle_work/done', `${icon.stem}.png`));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), icon.sha256);
      fixtures.set(`/restyle/cok/${folder}/${icon.stem}.png`, bytes);
    }
  }
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname, name = path.split('/').at(-1);
    const fault = cpicFault?.path === path ? cpicFault : null;
    if (path.includes('/restyle/cok/combat/')) cpicRequests.push(path);
    const respond = () => {
      if (fault?.kind === 'missing') { expectedCpicFailures.set(path, (expectedCpicFailures.get(path) ?? 0) + 1); return request.respond({ status: 404 }); }
      if (fault?.kind === 'tamper') return request.respond({ status: 200, contentType: 'image/png', body: Buffer.from('tampered pinned output') });
      if (/^(DUNGCOM|RANDCOM)\.DAA$/.test(name) && unavailableAmiga) return request.respond({ status: unavailableAmiga === 'missing' ? 404 : 200, contentType: 'text/html', body: '<html>unavailable</html>' });
      const bytes = fixtures.get(path) ?? (/ChampionsOfKrynn\/disk1\//.test(path) ? fixtures.get(name) : null);
      return bytes ? request.respond({ status: 200, contentType: name.endsWith('.png') ? 'image/png' : 'application/octet-stream', body: bytes }) : request.continue();
    };
    if (fault?.kind === 'delay') { releaseCpic = respond; return; }
    if (delayNextAmiga && name === 'DUNGCOM.DAA') { delayNextAmiga = false; releaseDelayedAmiga(); setTimeout(() => { void respond().catch(() => {}); }, 400); }
    else void respond();
  });
  const settled = async () => {
    await page.waitForFunction(() => { const s = window.__combat.graphicsLoadState(); return s && !s.loading && s.appliedRevision === s.requestedRevision; }, { timeout: 60000 }).catch(async (error) => {
      throw new Error(`${error.message}; graphics=${JSON.stringify(await page.evaluate(() => ({ load: window.__combat.graphicsLoadState(), mode: window.__combat.graphicsMode(), open: window.__explore.combatOpen(), pending: window.__explore.combatLaunchPending(), status: document.querySelector('#status')?.textContent })))}; pageErrors=${JSON.stringify(errors)}`);
    });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  };
  const errors = [];
  const missingRequiredResources = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (response.status() === 404 && expectedCpicFailures.get(path)) { expectedCpicFailures.set(path, expectedCpicFailures.get(path) - 1); return; }
    if (response.status() >= 400 && !/(DUNGCOM|RANDCOM)\.DAA/i.test(response.url())) {
      missingRequiredResources.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('greybox.graphics.cok', 'DOS-EGA');
    localStorage.setItem('greybox.graphics-fallback.cok', 'DOS-EGA');
  });
  await page.goto(`${base}/?explore=1`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('window.__explore && typeof window.__explore.testFight === "function"', { timeout: 45000 });
  const amigaAssetAvailable = await page.evaluate(async () => {
    for (const path of [
      'assets/amiga_extracted/ChampionsOfKrynn/disk1/DUNGCOM.DAA',
      'amiga_extracted/ChampionsOfKrynn/disk1/DUNGCOM.DAA',
    ]) {
      const response = await fetch(path);
      // Vite's SPA fallback can return index.html with HTTP 200 for a missing static asset.
      if (!response.ok || /text\/html/i.test(response.headers.get('content-type') ?? '')) continue;
      if ((await response.arrayBuffer()).byteLength > 0) return true;
    }
    return false;
  });
  await page.evaluate(() => {
    window.graphicsEvents = [];
    window.addEventListener('goldbox:graphics-mode', (event) => window.graphicsEvents.push(event.detail));
    window.dispatchEvent(new CustomEvent('goldbox:graphics-mode', { detail: { gameId: 'dqk', mode: 'Amiga' } }));
  });

  const snapshot = async () => { await settled(); return page.evaluate(async () => {
    const canvas = document.querySelector('.sheet-overlay .gb-emu canvas');
    const context = canvas?.getContext('2d');
    const hash = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (byte) => byte.toString(16).padStart(2, '0')).join('');
    const canvasPixels = canvas && context ? context.getImageData(0, 0, canvas.width, canvas.height).data : null;
    const icon = window.__combat.visibleCombatIcons().find((entry) => entry.id === 'e0') ?? null;
    const profile = window.__combat.displayProfile();
    let iconPixelHash = null;
    let iconOpaquePixelHash = null;
    if (canvas && context && canvasPixels && icon?.icon && icon.iconX !== null && icon.iconY !== null) {
      const scaleX = canvas.width / profile.nativeWidth;
      const scaleY = canvas.height / profile.nativeHeight;
      const x = Math.round(icon.iconX * scaleX);
      const y = Math.round(icon.iconY * scaleY);
      const width = Math.round(icon.icon.width * scaleX);
      const height = Math.round(icon.icon.height * scaleY);
      iconPixelHash = await hash(context.getImageData(x, y, width, height).data);
      const samples = window.__combat.combatantOpaqueSamplePoints('e0').flatMap((point) => {
        const canvasPoint = window.__combat.canvasPointForNativePixel(point.x, point.y);
        return [...context.getImageData(canvasPoint.x, canvasPoint.y, 1, 1).data];
      });
      if (samples.length) iconOpaquePixelHash = await hash(new Uint8Array(samples));
    }
    return {
    mode: window.__combat.graphicsMode(),
    backdropMode: window.__combat.backdropGraphicsMode(),
    checksum: window.__combat.backdropChecksum(),
    canvasPixelHash: canvasPixels ? await hash(canvasPixels) : null,
    iconPixelHash,
    iconOpaquePixelHash,
    activeId: window.__combat.activeId(),
    activePos: window.__combat.activePos(),
    phase: window.__combat.phase(),
    partyAndEnemyRows: window.__combat.panelRows(),
    combatants: window.__combat.combatants(),
    movementLeft: window.__combat.movementLeft(),
    livingEnemies: window.__combat.livingEnemies(),
    teamCounts: window.__combat.teamCounts(),
    mapSize: window.__combat.mapSize(),
    placementMode: window.__combat.placementMode(),
    placementOverlapCount: window.__combat.placementOverlapCount(),
    cellCount: window.__combat.cellCount,
    restyle: window.__combat.requestedRestyle(),
    };
  }); };
  const gameState = (view) => Object.fromEntries(['activeId', 'activePos', 'phase', 'partyAndEnemyRows', 'combatants',
    'movementLeft', 'livingEnemies', 'teamCounts', 'mapSize', 'placementMode', 'placementOverlapCount', 'cellCount'].map((key) => [key, view[key]]));
  for (const fault of ['missing', 'html']) {
    unavailableAmiga = fault;
    const eventCount = await page.evaluate(() => {
      localStorage.setItem('greybox.graphics.cok', 'Amiga');
      localStorage.setItem('greybox.graphics-fallback.cok', 'Amiga');
      const expectedEvents = window.graphicsEvents.length;
      window.__explore.testFight(0x55);
      return expectedEvents;
    });
    await page.waitForFunction('document.querySelector("#combat-graphics-amiga")', { timeout: 60000 });
    const firstEntry = await snapshot();
    assert.equal(firstEntry.mode, 'Amiga', `${fault}: first entry must retain the pre-entry preference`);
    assert.equal(firstEntry.backdropMode, 'DOS-EGA');
    assert.equal(await page.$eval('#combat-graphics-amiga', (node) => node.getAttribute('aria-pressed')), 'true');
    assert.match(await page.$eval('#combat-graphics-status', (node) => node.textContent), /Amiga unavailable.*backdrop: DOS-EGA/);
    assert.equal(await page.evaluate('window.graphicsEvents.length'), eventCount, 'Initial entry/fallback must not emit selection events');
    await page.evaluate(() => window.__explore.closeCombat());
    await page.evaluate(() => window.__explore.testFight(0x55));
    await page.waitForFunction('document.querySelector("#combat-graphics-amiga")', { timeout: 60000 });
    const reopened = await snapshot();
    assert.equal(reopened.mode, 'Amiga'); assert.equal(reopened.backdropMode, 'DOS-EGA');
    assert.deepEqual(gameState(reopened), gameState(firstEntry), `${fault}: reopening preserves the seeded encounter`);
    assert.match(await page.$eval('#combat-graphics-status', (node) => node.textContent), /Amiga unavailable.*backdrop: DOS-EGA/);
    assert.deepEqual(await page.evaluate(() => [localStorage.getItem('greybox.graphics.cok'), localStorage.getItem('greybox.graphics-fallback.cok')]), ['Amiga', 'Amiga']);
    assert.equal(await page.evaluate('window.graphicsEvents.length'), eventCount, 'Entry/fallback/reopen must not emit selection events');
    await page.click('#combat-graphics-dos'); await settled();
    const fallbackDos = await snapshot();
    assert.equal(fallbackDos.canvasPixelHash, firstEntry.canvasPixelHash); assert.equal(fallbackDos.checksum, firstEntry.checksum);
    assert.deepEqual(gameState(fallbackDos), gameState(firstEntry));
    unavailableAmiga = null;
    await page.click('#combat-graphics-amiga'); await settled();
    const recovered = await snapshot();
    assert.equal(recovered.backdropMode, amigaAssetAvailable ? 'Amiga' : 'DOS-EGA');
    if (amigaAssetAvailable) assert.notEqual(recovered.checksum, fallbackDos.checksum, 'Valid Amiga terrain must recover after the fault');
    assert.deepEqual(gameState(recovered), gameState(fallbackDos));
    await page.click('#combat-graphics-dos'); await settled();
    const restoredDos = await snapshot();
    assert.equal(restoredDos.canvasPixelHash, fallbackDos.canvasPixelHash); assert.equal(restoredDos.checksum, fallbackDos.checksum);
    assert.deepEqual(gameState(restoredDos), gameState(fallbackDos));
    await page.evaluate(() => window.__explore.closeCombat());
  }
  await page.evaluate(() => {
    localStorage.setItem('greybox.graphics.cok', 'DOS-EGA'); localStorage.setItem('greybox.graphics-fallback.cok', 'DOS-EGA');
    window.graphicsEvents = [];
    window.__explore.testFight(0x55);
  });
  await page.waitForFunction('document.querySelector("#combat-graphics-restyle") && document.querySelector("#combat-graphics-amiga")', { timeout: 60000 });
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('goldbox:graphics-mode', { detail: { gameId: 'dqk', mode: 'Amiga' } })));
  const initial = await snapshot();
  assert.equal(initial.mode, 'DOS-EGA');
  assert.equal(await page.evaluate('localStorage.getItem("greybox.graphics.cok")'), 'DOS-EGA', 'DQK event must not affect CoK');
  assert.ok(initial.checksum > 0, 'combat must have a visible backdrop');

  await page.click('#combat-graphics-amiga');
  await page.waitForFunction('window.__combat.graphicsMode() === "Amiga"');
  await settled();
  await page.waitForFunction(
    (available) => {
      const mode = window.__combat.backdropGraphicsMode();
      const status = document.querySelector('#combat-graphics-status')?.textContent ?? '';
      return available ? mode === 'Amiga' : mode === 'DOS-EGA' && /Amiga unavailable|Could not load Amiga/.test(status);
    },
    { timeout: 30000 },
    amigaAssetAvailable,
  );
  const amiga = await snapshot();
  assert.equal(
    amiga.backdropMode,
    amigaAssetAvailable ? 'Amiga' : 'DOS-EGA',
    amigaAssetAvailable
      ? 'available Amiga source must render as Amiga'
      : 'missing Amiga source must explicitly fall back to DOS-EGA',
  );
  if (!amigaAssetAvailable) {
    assert.match(await page.$eval('#combat-graphics-status', (node) => node.textContent ?? ''), /Amiga unavailable|Could not load Amiga/);
    assert.equal(amiga.checksum, initial.checksum, 'fallback must retain the DOS backdrop');
    assert.equal(amiga.canvasPixelHash, initial.canvasPixelHash, 'fallback must retain the DOS canvas pixels');
  } else {
    assert.notEqual(amiga.checksum, initial.checksum, 'Amiga selection must change the rendered backdrop data');
    assert.notEqual(amiga.canvasPixelHash, initial.canvasPixelHash, 'Amiga selection must change the rendered canvas pixels');
  }
  assert.equal(amiga.activeId, initial.activeId, 'graphics switching must preserve the active combatant');
  assert.deepEqual(amiga.activePos, initial.activePos, 'graphics switching must preserve combat position');
  assert.equal(amiga.phase, initial.phase, 'graphics switching must preserve the combat phase');
  assert.deepEqual(amiga.partyAndEnemyRows, initial.partyAndEnemyRows, 'graphics switching must preserve combatant HP/status');
  assert.equal(amiga.cellCount, initial.cellCount, 'graphics switching must preserve the roster');
  assert.equal(await page.evaluate(() => localStorage.getItem('greybox.graphics-fallback.cok')), 'Amiga');

  await page.click('#combat-graphics-restyle');
  await page.waitForFunction('window.__combat.graphicsMode() === "Restyle" && window.__combat.requestedRestyle()');
  await settled();
  const restyle = await snapshot();
  assert.equal(restyle.backdropMode, amiga.backdropMode, 'Restyle should retain the selected original backdrop');
  const mixedSources = await page.evaluate(() => ({ original: window.__combat.terrainSources(), overlays: window.__combat.terrainRestyleSources() }));
  assert.equal(mixedSources.original[0].system, amigaAssetAvailable ? 'Amiga' : 'DOS-EGA');
  assert.equal(Object.keys(mixedSources.overlays).length, 25);
  for (const source of Object.values(mixedSources.overlays)) assert.equal(source.archiveSha256, terrainManifest.sourceArchiveSha256);
  assert.equal(restyle.activeId, initial.activeId);
  assert.deepEqual(restyle.activePos, initial.activePos);
  assert.equal(restyle.phase, initial.phase);
  assert.deepEqual(restyle.partyAndEnemyRows, initial.partyAndEnemyRows);
  assert.equal(await page.evaluate(() => localStorage.getItem('greybox.graphics-fallback.cok')), 'Amiga');

  await page.click('#combat-graphics-dos');
  await page.waitForFunction('window.__combat.graphicsMode() === "DOS-EGA"');
  await settled();
  await page.waitForFunction('window.__combat.backdropGraphicsMode() === "DOS-EGA"', { timeout: 30000 });
  const dos = await snapshot();
  assert.equal(dos.checksum, initial.checksum, 'selecting DOS again must restore the original backdrop data');
  assert.equal(dos.canvasPixelHash, initial.canvasPixelHash, 'selecting DOS again must restore the exact canvas pixels');
  assert.equal(dos.activeId, initial.activeId);
  assert.deepEqual(dos.activePos, initial.activePos);
  assert.equal(dos.phase, initial.phase);
  assert.deepEqual(dos.partyAndEnemyRows, initial.partyAndEnemyRows);
  assert.equal(dos.cellCount, initial.cellCount);
  assert.equal(await page.evaluate(() => localStorage.getItem('greybox.graphics-fallback.cok')), 'DOS-EGA');
  assert.deepEqual(await page.evaluate('window.graphicsEvents.slice(1)'),
    ['Amiga', 'Restyle', 'DOS-EGA'].map((mode) => ({ gameId: 'cok', mode })), 'Combat UI selections emit one canonical event each');
  assert.equal(await page.$$eval('#output .gb-seg', (buttons) => buttons.find((button) => button.textContent === 'DOS · EGA')?.classList.contains('active')), true,
    'Combat selection must update the mounted explorer');

  const delayedAmigaRequest = new Promise((resolve) => { releaseDelayedAmiga = resolve; });
  delayNextAmiga = true;
  await page.click('#combat-graphics-amiga');
  await page.waitForFunction('window.__combat.graphicsMode() === "Amiga"');
  await Promise.race([
    delayedAmigaRequest,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Amiga asset request did not start')), 5000)),
  ]);
  await page.evaluate(() => { window.oldLoadDone = false; window.__combat.graphicsLoadCompletion().then(() => { window.oldLoadDone = true; }); });
  await page.click('#combat-graphics-dos');
  await page.waitForFunction(
    'window.__combat.graphicsMode() === "DOS-EGA" && window.__combat.backdropGraphicsMode() === "DOS-EGA"',
    { timeout: 30000 },
  );
  await settled();
  const latestRevision = await page.evaluate('window.__combat.graphicsLoadState()');
  await page.waitForFunction('window.oldLoadDone');
  assert.equal((await snapshot()).backdropMode, 'DOS-EGA', 'late Amiga load must not replace a newer DOS selection');
  assert.deepEqual(await page.evaluate('window.__combat.graphicsLoadState()'), latestRevision, 'Stale work cannot settle a newer revision');
  await page.click('#combat-graphics-restyle');
  await page.waitForFunction('window.__combat.graphicsMode() === "Restyle" && window.__combat.requestedRestyle()');
  await page.evaluate(() => window.__explore.closeCombat());
  assert.equal(await page.evaluate(() => localStorage.getItem('greybox.graphics.cok')), 'Restyle');
  assert.equal(await page.evaluate(() => localStorage.getItem('greybox.graphics-fallback.cok')), 'DOS-EGA');
  await page.evaluate(() => window.__explore.testFight(0x55));
  await page.waitForFunction(
    'window.__combat.graphicsMode() === "Restyle" && window.__combat.requestedRestyle() && window.__combat.backdropGraphicsMode() === "DOS-EGA"',
    { timeout: 30000 },
  );
  await settled();
  for (const fault of ['missing', 'html']) {
    unavailableAmiga = fault; await page.click('#combat-graphics-amiga'); await settled();
    const fallback = await snapshot(); assert.equal(fallback.backdropMode, 'DOS-EGA');
    assert.match(await page.$eval('#combat-graphics-status', (node) => node.textContent), /Amiga unavailable/);
    await page.click('#combat-graphics-restyle'); await settled();
    assert.equal((await snapshot()).backdropMode, 'DOS-EGA');
    assert.equal(await page.evaluate('localStorage.getItem("greybox.graphics-fallback.cok")'), 'Amiga');
  }
  unavailableAmiga = null;
  await page.click('#combat-graphics-amiga'); await settled();
  await page.click('#combat-graphics-restyle'); await settled();
  const closedRequest = new Promise((resolve) => { releaseDelayedAmiga = resolve; });
  delayNextAmiga = true; await page.click('#combat-graphics-restyle');
  await Promise.race([closedRequest, new Promise((_, reject) => setTimeout(() => reject(new Error('Closed-load request did not start')), 5000))]);
  await page.evaluate(() => { window.closedLoadDone = false; window.__combat.graphicsLoadCompletion().then(() => { window.closedLoadDone = true; }); });
  await page.evaluate(() => window.__explore.closeCombat());
  await page.evaluate(() => window.__explore.testFight(0x55));
  await page.waitForFunction('window.__combat?.graphicsLoadState'); await settled();
  assert.equal(await page.evaluate('window.__combat.graphicsMode()'), 'Restyle');
  assert.equal(await page.evaluate('window.__combat.backdropGraphicsMode()'), amigaAssetAvailable ? 'Amiga' : 'DOS-EGA', 'Persisted initial Restyle retains the remembered original');
  const afterClosed = await snapshot(), closedRevision = await page.evaluate('window.__combat.graphicsLoadState()');
  await page.waitForFunction('window.closedLoadDone');
  assert.deepEqual(await snapshot(), afterClosed, 'Closed encounter cannot repaint the new encounter');
  assert.deepEqual(await page.evaluate('window.__combat.graphicsLoadState()'), closedRevision, 'Closed encounter cannot settle the new revision');
  await page.evaluate(() => window.__explore.closeCombat());

  // CPIC block ids repeat between the CoK disks. Exercise every manifest identity through the
  // actual disk-selected source archive and real bestiary records; only each encounter's picture
  // id is fixed by this test seam.
  const bankCases = [
    { bank: combatManifest.banks.find((entry) => entry.name === 'CPIC1'), areaId: 34 },
    { bank: combatManifest.banks.find((entry) => entry.name === 'CPIC2'), areaId: 48 },
    { bank: combatManifest.banks.find((entry) => entry.name === 'CPIC3'), areaId: 80 },
  ];
  const identities = bankCases.flatMap(({ bank }) => bank.icons.map((icon) => `${bank.sourceArchiveSha256}:${icon.pictureId}`));
  assert.equal(new Set(identities).size, 108, 'manifest must contain 108 unique archive-scoped identities');
  assert.deepEqual(bankCases.map(({ bank }) => [bank.name, bank.icons.length]), [
    ['CPIC1', 4], ['CPIC2', 60], ['CPIC3', 44],
  ]);
  assert.deepEqual(bankCases[0].bank.icons.map((icon) => icon.pictureId).sort((a, b) => a - b), [8, 12, 26, 35]);
  const controls = await page.evaluate((banks) => ({
    known: [12, 35].map((id) => banks.map((bank) => window.__combat.combatRestyleIdentityForTest(id, bank.sourceArchiveSha256))),
    unknown: window.__combat.combatRestyleIdentityForTest(12, '0'.repeat(64)),
    unadmitted: window.__combat.combatRestyleIdentityForTest(59, banks[0].sourceArchiveSha256),
    knownError: window.__combat.combatRestyleSourceErrorForTest(59, banks[0].sourceArchiveSha256),
    unknownError: window.__combat.combatRestyleSourceErrorForTest(12, '0'.repeat(64)),
  }), combatManifest.banks);
  assert.equal(controls.unknown, null);
  assert.equal(controls.unadmitted, null, 'decoded aliases require their own admission');
  assert.match(controls.knownError, /CPIC1 picture 59 has no admitted Restyle mapping/);
  assert.match(controls.unknownError, /source archive hash is unavailable/);
  for (const [row, id] of [[0, 12], [1, 35]]) for (let bankIndex = 0; bankIndex < 3; bankIndex++) {
    const bank = combatManifest.banks[bankIndex], expected = bank.icons.find((icon) => icon.pictureId === id);
    const actual = controls.known[row][bankIndex];
    assert.equal(actual?.sha256 ?? null, expected?.sha256 ?? null, `${bank.name}#${id} must retain its own output or fallback`);
    if (bankIndex > 0) assert.notEqual(actual?.stem, `CPIC1_${String(id).padStart(3, '0')}_restyle`);
  }
  const verifiedIdentities = new Set();
  const failedIdentities = [];
  for (const { bank, areaId } of bankCases) {
    assert.ok(bank, 'CPIC bank must exist in the runtime manifest');
    const mounted = await page.evaluate((disk, area) => window.__explore.switchArea(disk, area), bank.disk, areaId);
    assert.ok(mounted > 0, `CoK disk ${bank.disk} area ${areaId} must mount using its real data`);
    await page.waitForFunction(
      ({ disk, areaId }) => window.__explore.currentArea()?.disk === disk && window.__explore.currentArea()?.areaId === areaId,
      { timeout: 30000 },
      { disk: bank.disk, areaId },
    );
    await page.waitForFunction(() => !window.__explore.combatLaunchPending(), { timeout: 60000 });
    await page.evaluate(() => { if (window.__combat) window.__explore.closeCombat(); window.__combat = undefined; });
    const monsters = await page.evaluate(() => window.__explore.testMonsterRecords());
    const smallMonster = monsters.find((monster) => monster.combatSize === 1);
    const largeMonster = monsters.find((monster) => monster.combatSize === 2);
    assert.ok(smallMonster, `disk ${bank.disk} must expose a real small monster record`);

    if (bank.name !== 'CPIC1') {
      const geometries = new Set(bank.icons.map((icon) => `${icon.nativeWidth}x${icon.nativeHeight}`));
      for (const required of ['24x24', '48x24', '24x48', '48x48']) {
        assert.ok(geometries.has(required), `${bank.name} must map ${required} source frames`);
      }
      for (const requiredColorType of [2, 6]) {
        assert.ok(bank.icons.some((icon) => icon.colorType === requiredColorType),
          `${bank.name} must map PNG color type ${requiredColorType}`);
      }
    }
    for (const icon of bank.icons) {
      const identityKey = `${bank.sourceArchiveSha256}:${icon.pictureId}`;
      try {
      const retryCase = bank.name === 'CPIC1' && icon.pictureId === 8;
      const retryPath = new URL('restyle/cok/combat/' + icon.stem + '.png', base + '/').pathname;
      if (retryCase) cpicFault = { path: retryPath, kind: 'missing' };
      const monster = icon.nativeWidth === 48 && icon.nativeHeight === 48 ? largeMonster : smallMonster;
      if (icon.nativeWidth === 48 && icon.nativeHeight === 48) {
        assert.ok(largeMonster, `${bank.name}#${icon.pictureId} requires a real large-monster record`);
      }
      await page.evaluate(({ pictureId, monsterId }) => window.__explore.testFightPicture(pictureId, monsterId), {
        pictureId: icon.pictureId,
        monsterId: monster.blockId,
      });
      await page.waitForFunction('window.__combat && document.querySelector("#combat-graphics-restyle")', { timeout: 30000 });
      await page.waitForFunction((pictureId) => {
        const errors = window.__combat.combatRestyleErrors();
        return window.__combat.combatRestyleIds().includes(pictureId) || Object.hasOwn(errors, pictureId);
      }, { timeout: 30000 }, icon.pictureId);
      if (retryCase) {
        await page.evaluate(() => { window.__combat.recenterCombatantForTest('e0'); for (const flag of ['guarding', 'asleep', 'held', 'feared', 'slowed']) window.__combat.setCombatantFlagForTest('e0', flag, false); });
        await page.click('#combat-graphics-dos'); const fallback = await snapshot();
        assert.ok(await page.evaluate(id => Object.hasOwn(window.__combat.combatRestyleErrors(), id), icon.pictureId));
        const storedParty = await page.evaluate(() => localStorage.getItem('greybox.party.cok'));
        const originalFailure = await page.evaluate(id => window.__combat.combatRestyleErrors()[id], icon.pictureId);
        cpicFault = { path: retryPath, kind: 'tamper' };
        await page.click('#combat-graphics-restyle');
        await page.waitForFunction(({ id, before }) => { const error = window.__combat.combatRestyleErrors()[id]; return error && error !== before && /pin|PNG|hash/i.test(error); }, {}, { id: icon.pictureId, before: originalFailure });
        assert.equal(await page.evaluate(id => window.__combat.combatRestyleIds().includes(id), icon.pictureId), false);
        releaseCpic = null; cpicFault = { path: retryPath, kind: 'delay' };
        const start = cpicRequests.length;
        await page.evaluate(() => { document.querySelector('#combat-graphics-restyle').click(); document.querySelector('#combat-graphics-restyle').click(); });
        for (let i = 0; i < 200 && !releaseCpic; i++) await new Promise(done => setTimeout(done, 25));
        assert.ok(releaseCpic); assert.deepEqual(cpicRequests.slice(start), [retryPath], 'Duplicate selection starts one CPIC retry');
        const pending = await snapshot(); assert.equal(pending.iconOpaquePixelHash, fallback.iconOpaquePixelHash);
        cpicFault = null; await releaseCpic();
        await page.waitForFunction(id => window.__combat.combatRestyleIds().includes(id) && !Object.hasOwn(window.__combat.combatRestyleErrors(), id), {}, icon.pictureId);
        const recovered = await snapshot(); assert.notEqual(recovered.iconOpaquePixelHash, fallback.iconOpaquePixelHash);
        assert.deepEqual(gameState(recovered), gameState(fallback));
        const loadedCount = cpicRequests.length; await page.click('#combat-graphics-restyle'); await settled();
        assert.equal(cpicRequests.length, loadedCount, 'Successful icon is not reloaded');
        await page.click('#combat-graphics-dos'); const restored = await snapshot();
        assert.equal(restored.canvasPixelHash, fallback.canvasPixelHash);
        assert.equal(await page.evaluate(() => localStorage.getItem('greybox.party.cok')), storedParty);
        // Invalidate art through the existing pack event, then reject a delayed retry after a mode change.
        cpicFault = { path: retryPath, kind: 'missing' };
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('goldbox:local-asset-pack')));
        await page.waitForFunction(id => Object.hasOwn(window.__combat.combatRestyleErrors(), id), {}, icon.pictureId);
        releaseCpic = null; cpicFault = { path: retryPath, kind: 'delay' }; await page.click('#combat-graphics-restyle');
        for (let i = 0; i < 200 && !releaseCpic; i++) await new Promise(done => setTimeout(done, 25));
        assert.ok(releaseCpic); await page.evaluate(() => { window.heldCpicRetry = window.__combat.combatRestyleRetryCompletion(); });
        await page.click('#combat-graphics-dos'); await settled();
        const response = page.waitForResponse(r => new URL(r.url()).pathname === retryPath);
        cpicFault = null; await releaseCpic(); await response;
        await page.evaluate(async () => { if (!window.heldCpicRetry) throw Error('Missing retry completion'); await window.heldCpicRetry; });
        const late = await snapshot(); assert.equal(late.mode, 'DOS-EGA');
        assert.equal(late.canvasPixelHash, fallback.canvasPixelHash); assert.deepEqual(gameState(late), gameState(fallback));
        assert.equal(await page.evaluate(id => window.__combat.combatRestyleIds().includes(id), icon.pictureId), false);
        await page.click('#combat-graphics-restyle');
        await page.waitForFunction(id => window.__combat.combatRestyleIds().includes(id), {}, icon.pictureId);
        for (const invalidation of ['pack-event', 'exit']) {
          cpicFault = { path: retryPath, kind: 'missing' };
          await page.evaluate(() => window.dispatchEvent(new CustomEvent('goldbox:local-asset-pack')));
          await page.waitForFunction(id => Object.hasOwn(window.__combat.combatRestyleErrors(), id), {}, icon.pictureId);
          releaseCpic = null; cpicFault = { path: retryPath, kind: 'delay' }; await page.click('#combat-graphics-restyle');
          for (let i = 0; i < 200 && !releaseCpic; i++) await new Promise(done => setTimeout(done, 25));
          assert.ok(releaseCpic); const releaseOld = releaseCpic; cpicFault = null;
          await page.evaluate(() => { window.heldCpicRetry = window.__combat.combatRestyleRetryCompletion(); });
          if (invalidation === 'pack-event') {
            await page.evaluate(() => window.dispatchEvent(new CustomEvent('goldbox:local-asset-pack')));
            await page.waitForFunction(id => window.__combat.combatRestyleIds().includes(id), {}, icon.pictureId);
            const fresh = await snapshot(); await releaseOld(); await page.evaluate(() => window.heldCpicRetry);
            assert.deepEqual(await snapshot(), fresh, 'Old retry cannot overwrite refreshed art generation');
          } else {
            await page.evaluate(() => window.__explore.closeCombat()); await releaseOld();
            await page.evaluate(async () => { if (!window.heldCpicRetry) throw Error('Missing retry completion'); await window.heldCpicRetry; });
            assert.equal(await page.evaluate(() => window.__explore.combatOpen()), false);
            assert.equal(await page.evaluate(() => window.__combat.graphicsLoadState()), null);
            await page.evaluate(({ pictureId, monsterId }) => window.__explore.testFightPicture(pictureId, monsterId), { pictureId: icon.pictureId, monsterId: monster.blockId });
            await page.waitForFunction(id => window.__combat?.combatRestyleIds().includes(id), {}, icon.pictureId);
          }
          assert.equal(await page.evaluate(() => localStorage.getItem('greybox.party.cok')), storedParty);
        }
        await page.evaluate(() => { delete window.heldCpicRetry; });
      }
      await page.click('#combat-graphics-dos');
      await page.waitForFunction('window.__combat.graphicsMode() === "DOS-EGA"');
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => {
        window.__combat.recenterCombatantForTest('e0');
        for (const flag of ['guarding', 'asleep', 'held', 'feared', 'slowed']) {
          window.__combat.setCombatantFlagForTest('e0', flag, false);
        }
      });
      const original = await snapshot();
      const sourceContract = await page.evaluate((pictureId) => ({
        archive: window.__combat.iconArchiveSha256(),
        transparentIndex: window.__combat.combatSourceTransparentIndex('e0'),
        sourceMask: window.__combat.combatRestyleSourceMask('e0'),
        errors: window.__combat.combatRestyleErrors(),
        identity: window.__combat.combatRestyleIdentityForTest(pictureId, window.__combat.iconArchiveSha256()),
        restyleIds: window.__combat.combatRestyleIds(),
        icon: window.__combat.visibleCombatIcons().find((entry) => entry.id === 'e0') ?? null,
      }), icon.pictureId);
      assert.equal(sourceContract.archive, bank.sourceArchiveSha256, `${bank.name} must load the selected source archive`);
      assert.equal(sourceContract.errors[icon.pictureId], undefined,
        `${bank.name}#${icon.pictureId} must pass its source and output pins: ${JSON.stringify(sourceContract.errors[icon.pictureId])}`);
      assert.ok(sourceContract.restyleIds.includes(icon.pictureId), `${bank.name}#${icon.pictureId} must load its pinned Restyle output`);
      if (sourceContract.transparentIndex !== null) {
        assert.ok(sourceContract.sourceMask, `${bank.name}#${icon.pictureId} must expose its transparency mask: ${JSON.stringify(sourceContract)}`);
        assert.ok(sourceContract.sourceMask.transparentSourceCells > 0, `${bank.name} must expose transparent source cells`);
        assert.equal(sourceContract.sourceMask?.escapedOutputPixels, 0, `${bank.name} Restyle pixels must stay inside the source mask`);
      } else {
        assert.equal(sourceContract.sourceMask, null, `${bank.name}#${icon.pictureId} must preserve its opaque-source contract`);
      }
      assert.equal(sourceContract.identity?.bank, bank.name);
      assert.equal(sourceContract.identity?.pictureId, icon.pictureId);
      assert.equal(sourceContract.identity?.stem, icon.stem);
      assert.equal(sourceContract.identity?.sha256, icon.sha256);
      assert.equal(sourceContract.identity?.sourceArchiveSha256, bank.sourceArchiveSha256);
      assert.equal(sourceContract.icon?.pictureId, icon.pictureId);
      assert.equal(sourceContract.icon?.id, 'e0');
      assert.equal(sourceContract.icon?.icon?.width, icon.nativeWidth);
      assert.equal(sourceContract.icon?.icon?.height, icon.nativeHeight);
      assert.equal(sourceContract.icon?.down, false, `${bank.name} test enemy must be alive`);
      assert.equal(sourceContract.icon?.impaired, false, `${bank.name} test enemy must be renderable`);
      assert.equal(sourceContract.icon?.guarding, false, `${bank.name} test enemy must be renderable`);
      if (icon.nativeWidth === 48 && icon.nativeHeight === 48) {
        assert.equal(sourceContract.icon?.size, 2, '48×48 frame must use a real large-monster footprint');
        assert.equal(sourceContract.icon?.iconX, sourceContract.icon?.cellX, 'large-frame x anchor must cover the 2×2 footprint');
        assert.equal(sourceContract.icon?.iconY, sourceContract.icon?.cellY, 'large-frame y anchor must cover the 2×2 footprint');
      }

      await page.click('#combat-graphics-restyle');
      await page.waitForFunction('window.__combat.graphicsMode() === "Restyle" && window.__combat.requestedRestyle()');
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const restyled = await snapshot();
      assert.notEqual(restyled.canvasPixelHash, original.canvasPixelHash, `${bank.name}#${icon.pictureId} must visibly change combat pixels`);
      assert.notEqual(restyled.iconPixelHash, original.iconPixelHash, `${bank.name}#${icon.pictureId} must visibly change its own icon pixels`);
      assert.ok(original.iconOpaquePixelHash && restyled.iconOpaquePixelHash, `${bank.name}#${icon.pictureId} source-opaque samples must be available`);
      assert.notEqual(restyled.iconOpaquePixelHash, original.iconOpaquePixelHash,
        `${bank.name}#${icon.pictureId} must change source-visible icon pixels independently of terrain in transparent holes`);
      assert.equal(restyled.activeId, original.activeId);
      assert.deepEqual(restyled.activePos, original.activePos);
      assert.equal(restyled.phase, original.phase);
      assert.deepEqual(restyled.partyAndEnemyRows, original.partyAndEnemyRows);
      for (const field of ['combatants', 'movementLeft', 'livingEnemies', 'teamCounts', 'mapSize', 'placementMode', 'placementOverlapCount']) {
        assert.deepEqual(restyled[field], original[field], `${bank.name}#${icon.pictureId} must preserve ${field}`);
      }

      await page.click('#combat-graphics-dos');
      await page.waitForFunction('window.__combat.graphicsMode() === "DOS-EGA" && !window.__combat.requestedRestyle()');
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const restored = await snapshot();
      assert.equal(restored.canvasPixelHash, original.canvasPixelHash, `${bank.name}#${icon.pictureId} must restore exact DOS pixels`);
      assert.equal(restored.iconPixelHash, original.iconPixelHash, `${bank.name}#${icon.pictureId} must restore its exact DOS icon pixels`);
      assert.equal(restored.iconOpaquePixelHash, original.iconOpaquePixelHash, `${bank.name}#${icon.pictureId} must restore exact source-opaque DOS samples`);
      for (const field of ['combatants', 'movementLeft', 'livingEnemies', 'teamCounts', 'mapSize', 'placementMode', 'placementOverlapCount']) {
        assert.deepEqual(restored[field], original[field], `${bank.name}#${icon.pictureId} DOS return must preserve ${field}`);
      }
      verifiedIdentities.add(identityKey);
      if (verifiedIdentities.size % 10 === 0 || verifiedIdentities.size === identities.length) {
        console.log(`[PROGRESS] verified ${verifiedIdentities.size}/${identities.length} CoK CPIC identities`);
      }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failedIdentities.push({ bank: bank.name, pictureId: icon.pictureId, error: message });
        console.error(`[FAIL] ${bank.name}#${icon.pictureId}: ${message}`);
      } finally {
        cpicFault = null;
        await page.evaluate(() => { if (window.__combat) window.__explore.closeCombat(); });
      }
    }
  }

  // Guarded enemies intentionally retain their original icon in Restyle mode. Keep this behavior
  // as a separate negative control so normalizing the per-identity fixture cannot hide a fallback
  // regression.
  const guardBank = combatManifest.banks.find((entry) => entry.name === 'CPIC3');
  const guardIcon = guardBank.icons[0];
  const guardMounted = await page.evaluate((disk, area) => window.__explore.switchArea(disk, area), guardBank.disk, 80);
  assert.ok(guardMounted > 0, 'guard fallback disk must mount real CoK data');
  await page.waitForFunction(() => window.__explore.currentArea()?.disk === 3 && window.__explore.currentArea()?.areaId === 80);
  await page.waitForFunction(() => !window.__explore.combatLaunchPending(), { timeout: 60000 });
  await page.evaluate(() => { if (window.__combat) window.__explore.closeCombat(); window.__combat = undefined; });
  const guardMonsters = await page.evaluate(() => window.__explore.testMonsterRecords());
  const guardMonster = guardMonsters.find((monster) => monster.combatSize === 1);
  assert.ok(guardMonster, 'guard fallback control requires a real small monster record');
  await page.evaluate(({ pictureId, monsterId }) => window.__explore.testFightPicture(pictureId, monsterId), {
    pictureId: guardIcon.pictureId,
    monsterId: guardMonster.blockId,
  });
  await page.waitForFunction('window.__combat && document.querySelector("#combat-graphics-restyle")', { timeout: 30000 });
  await page.click('#combat-graphics-dos');
  await page.waitForFunction('window.__combat.graphicsMode() === "DOS-EGA"');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluate(() => {
    window.__combat.recenterCombatantForTest('e0');
    window.__combat.setCombatantFlagForTest('e0', 'guarding', true);
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const guardedDos = await snapshot();
  assert.ok(guardedDos.iconOpaquePixelHash, 'guarded DOS opaque source pixels must be available');
  const guardedIcon = await page.evaluate(() => window.__combat.visibleCombatIcons().find((entry) => entry.id === 'e0'));
  assert.equal(guardedIcon?.guarding, true);
  await page.click('#combat-graphics-restyle');
  await page.waitForFunction('window.__combat.graphicsMode() === "Restyle" && window.__combat.requestedRestyle()');
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const guardedRestyle = await snapshot();
  assert.equal(guardedRestyle.iconOpaquePixelHash, guardedDos.iconOpaquePixelHash,
    'guarded enemy must retain opaque source pixels when Restyle terrain changes its transparent holes');
  assert.equal((await page.evaluate(() => window.__combat.visibleCombatIcons().find((entry) => entry.id === 'e0')))?.guarding, true);
  await page.evaluate(() => window.__explore.closeCombat());

  assert.deepEqual(failedIdentities, [], `CPIC identities failed runtime acceptance: ${JSON.stringify(failedIdentities)}`);
  assert.deepEqual([...verifiedIdentities].sort(), [...new Set(identities)].sort(),
    'every unique archive-scoped CPIC manifest identity must complete runtime acceptance');

  assert.deepEqual(errors, [], `page errors: ${errors.join('; ')}`);
  assert.deepEqual(missingRequiredResources, [], `unexpected 4xx/5xx responses: ${missingRequiredResources.join('; ')}`);
  console.log(`[PASS] CoK combat switches DOS → Amiga (${amiga.backdropMode}${amigaAssetAvailable ? '' : ', source unavailable fallback'}) → Restyle → DOS without changing combat state`);
} finally {
  await browser?.close();
  if (server) server.kill();
}
