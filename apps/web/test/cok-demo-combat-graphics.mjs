// Authored source-only under the Vite spawn EPERM hold; browser acceptance is UNRUN.
// After the hold is cleared, from apps/web:
// GB_COK_DEMO_DIST_DIR=<candidate> GB_COK_DOS_INSTALL_DIR=<DOS CoK> GB_COK_AMIGA_INSTALL_DIR=<Amiga extraction>
// GB_RESTYLE_PACK_DIR=<contents of restyle/> node test/cok-demo-combat-graphics.mjs
// This serves only the supplied candidate. It never starts Vite or builds/copies assets.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import puppeteer from 'puppeteer-core';
import cpicManifest from '../src/ui/cokCombatRestyleManifest.json' with { type: 'json' };
import terrainManifest from '../src/ui/cokTerrainRestyleManifest.json' with { type: 'json' };
import demoManifest from '../src/ui/cokDemoArtManifest.json' with { type: 'json' };
import { readCokDemoInstallFiles, readPinnedLocalRestyleFiles, selectLocalCokInstall, selectLocalRestyleFiles, clearLocalRestyleFiles } from './local-restyle-pack-e2e.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.ok(process.env.GB_COK_DEMO_DIST_DIR, 'Supply a complete production candidate; do not use an old dist snapshot as acceptance of current source');
const root = resolve(process.env.GB_COK_DEMO_DIST_DIR);
assert.ok(existsSync(resolve(root, 'index.html')), 'Candidate index.html is missing');
const bank = cpicManifest.banks.find((entry) => entry.name === 'CPIC2');
assert.equal(bank?.sourceArchiveSha256, '7925da2db12a4e42ffc2df737fce830fddede11ae9d350e61a9a53f2950b94e4');
const pictureIds = [4, 10, 31, 60, 61, 62];
const icons = pictureIds.map((id) => {
  const matches = bank.icons.filter((icon) => icon.pictureId === id);
  assert.equal(matches.length, 1, `Exactly one existing CPIC2 admission required for #${id}`);
  return matches[0];
});
assert.equal(terrainManifest.archive, 'DUNGCOM.DAX');
assert.equal(terrainManifest.blockId, 1);
assert.equal(terrainManifest.sourceArchiveSha256, '827176e941f24176f1907bde40a81928cb4c2da66231ca6b07c72b0b03a0bf2a');
assert.deepEqual(terrainManifest.tiles.map((tile) => tile.tileIndex).sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i));
const admittedFiles = new Map([
  [`restyle/cok/${demoManifest.restyle.destination}`, demoManifest.restyle.sha256],
  ...icons.map((icon) => [`restyle/cok/combat/${icon.stem}.png`, icon.sha256]),
  ...terrainManifest.tiles.map((tile) => [`restyle/cok/terrain/${tile.stem}.png`, tile.sha256]),
]);
for (const path of admittedFiles.keys()) assert.ok(!existsSync(resolve(root, path)),
  `Generated PNG must stay outside the candidate: ${path}`);
const localRestyle = readPinnedLocalRestyleFiles([...admittedFiles].map(([path, sha256]) => ({
  path: path.replace(/^restyle\//, ''), sha256,
})));
const localGame = readCokDemoInstallFiles(demoManifest);
const expectedBindings = {
  'demo-npc-0': 60, 'demo-npc-1': 62, 'demo-npc-2': 61,
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`demo-foe-${i}`, i < 2 ? 10 : i < 6 ? 4 : 31])),
};
const requests = new Set();
const types = new Map([['.html', 'text/html'], ['.js', 'text/javascript'], ['.css', 'text/css'],
  ['.json', 'application/json'], ['.png', 'image/png'], ['.wasm', 'application/wasm']]);
const server = createServer((request, response) => {
  let relative;
  try { relative = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html'; }
  catch { response.writeHead(400).end(); return; }
  const file = resolve(root, relative);
  if (!file.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return; }
  if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
  if (admittedFiles.has(relative)) requests.add(relative);
  response.setHeader('content-type', types.get(extname(file)) ?? 'application/octet-stream');
  createReadStream(file).pipe(response);
});
let browser;
try {
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  browser = await puppeteer.launch({
    executablePath: process.env.GB_BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error' && !/favicon|DevTools/i.test(message.text())) errors.push(message.text()); });
  page.on('response', (response) => { if (response.status() >= 400 && !/favicon/i.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('greybox.graphics.cok', 'DOS-EGA');
    localStorage.setItem('greybox.graphics-fallback.cok', 'DOS-EGA');
  });
  await page.goto(`http://127.0.0.1:${address.port}/?demo=1`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await selectLocalCokInstall(page, localGame);
  await page.waitForFunction(() => typeof window.__demo?.pause === 'function', { timeout: 45_000 });
  await page.evaluate(() => window.__demo.pause());
  await selectLocalRestyleFiles(page, localRestyle, '.gb-demo-graphics');
  let primedScene = false, primedPixels;
  // Follow the actual ECL2#57 narration/viewport beats. No injected fight or roster.
  for (let step = 0; step < 300; step++) {
    const phase = await page.evaluate(() => window.__demo.stats().phase);
    if (phase === 'combat') break;
    if (!primedScene && await page.evaluate((id) => window.__demo.stats().pictureId === id, demoManifest.pictureId)) {
      await page.click('[data-demo-graphics-mode="Restyle"]');
      await page.waitForFunction(() => window.__demo.stats().restyleVisible);
      primedScene = true;
      primedPixels = await page.$eval('.gb-demo-restyle-overlay', (canvas) => canvas.toDataURL());
      await page.click('[data-demo-graphics-mode="DOS-EGA"]');
    }
    assert.notEqual(phase, 'ended', 'Demo ended before tactical combat');
    await page.evaluate(() => window.__demo.step());
  }
  await page.waitForFunction(() => window.__demo?.stats().phase === 'combat'
    && window.__combat?.combatantPictureIds && document.querySelector('#combat-graphics-restyle'), { timeout: 60_000 });
  const combatPicker = '.sheet-overlay .combat-local-pack-control';
  const settled = async () => {
    await page.waitForFunction(() => {
      const load = window.__combat?.graphicsLoadState();
      return load && !load.loading && load.appliedRevision === load.requestedRevision;
    }, { timeout: 60_000 });
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  };
  await settled();
  const coverage = await page.evaluate(() => ({
    bindings: window.__combat.combatantPictureIds(), hash: window.__combat.iconArchiveSha256(),
    ids: window.__combat.combatRestyleIds(), errors: window.__combat.combatRestyleErrors(),
    terrainIds: window.__combat.terrainRestyleIds(), terrainErrors: window.__combat.terrainRestyleErrors(),
    sources: window.__combat.terrainRestyleSources(),
    geometry: Object.fromEntries([4, 10, 31, 60, 61, 62].map((id) => [id, window.__combat.combatIconGeometry(id)])),
    controls: [...document.querySelectorAll('.sheet-overlay [data-demo-graphics-control]')].map((button) => button.id),
    vmSeam: typeof window.__demo.vmState,
  }));
  assert.deepEqual(coverage.bindings, expectedBindings, 'All 15 source-selected CPIC bindings must survive the demo launch');
  assert.equal(coverage.hash, bank.sourceArchiveSha256);
  assert.deepEqual(coverage.ids.sort((a, b) => a - b), pictureIds);
  assert.deepEqual(coverage.errors, {});
  assert.deepEqual(coverage.terrainErrors, {});
  assert.deepEqual(coverage.terrainIds.sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i));
  assert.equal(Object.keys(coverage.sources).length, 25);
  assert.deepEqual(coverage.controls, ['combat-graphics-dos', 'combat-graphics-amiga', 'combat-graphics-restyle']);
  for (const icon of icons) assert.deepEqual(coverage.geometry[icon.pictureId], { width: icon.nativeWidth, height: icon.nativeHeight });
  for (const source of Object.values(coverage.sources)) {
    assert.equal(source.archive, terrainManifest.archive);
    assert.equal(source.archiveSha256, terrainManifest.sourceArchiveSha256);
    assert.equal(source.blockId, 1);
    assert.equal(source.system, 'DOS-EGA');
  }
  assert.equal(coverage.vmSeam, 'function', 'Candidate must expose the read-only VM snapshot seam; presentation counters alone do not prove VM invariance');
  assert.equal(await page.evaluate(() => {
    const before = JSON.stringify(window.__demo.vmState());
    const copy = window.__demo.vmState();
    if (!copy || !Array.isArray(copy.memory) || !Array.isArray(copy.clock)) return false;
    if (copy.memory.length) copy.memory[0][1] ^= 1;
    copy.memory.push([-1, -1]);
    copy.clock[0] ^= 1;
    return JSON.stringify(window.__demo.vmState()) === before;
  }), true, 'VM seam must return detached memory entries and clock slots');
  const invariant = () => page.evaluate(() => {
    const stats = window.__demo.stats();
    const { graphicsMode, artSource, restyleVisible, status, canvas, graphicsRevision, bitmapPackRevision, localPackRevision, restyleLoading, restyleError, ...demo } = stats;
    return {
      demo, vm: window.__demo.vmState(),
      activeId: window.__combat.activeId(), activePos: window.__combat.activePos(),
      phase: window.__combat.phase(), combatants: window.__combat.combatants(),
      rows: window.__combat.panelRows(), movement: window.__combat.movementLeft(),
      livingEnemies: window.__combat.livingEnemies(), teams: window.__combat.teamCounts(),
      bindings: window.__combat.combatantPictureIds(),
    };
  });
  const initialState = await invariant();
  assert.ok(Number.isInteger(initialState.vm.pc) && Number.isInteger(initialState.vm.vaddr));
  assert.ok(Number.isInteger(initialState.vm.rngState));
  assert.equal(initialState.vm.clock.length, 7);
  assert.equal(initialState.vm.done, false, 'VM must remain paused at combat');
  const unchanged = async (reason) => {
    assert.equal(await page.evaluate(() => window.__demo.isPlaying()), true, `${reason}: demo must remain active`);
    assert.deepEqual(await invariant(), initialState, `${reason}: combat and VM must not advance`);
  };
  const representatives = ['demo-npc-0', 'demo-npc-1', 'demo-npc-2', 'demo-foe-0', 'demo-foe-2', 'demo-foe-6'];
  const pixelSamples = async () => {
    const result = {};
    for (const id of representatives) {
      assert.equal(await page.evaluate((actor) => window.__combat.recenterCombatantForTest(actor), id), true);
      await settled();
      result[id] = await page.evaluate(async (actor) => {
        const canvas = document.querySelector('.sheet-overlay .gb-emu canvas');
        const context = canvas?.getContext('2d');
        if (!context) throw new Error('Combat canvas is unavailable');
        const hash = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          (byte) => byte.toString(16).padStart(2, '0')).join('');
        const points = window.__combat.combatantOpaqueSamplePoints(actor);
        if (!points.length) throw new Error(`No visible opaque source samples for ${actor}`);
        const samples = points.flatMap((point) => {
          const position = window.__combat.canvasPointForNativePixel(point.x, point.y);
          return [...context.getImageData(position.x, position.y, 1, 1).data];
        });
        return { icon: await hash(new Uint8Array(samples)), count: points.length,
          canvas: await hash(context.getImageData(0, 0, canvas.width, canvas.height).data),
          terrain: window.__combat.terrainRenderReceipt(), mask: window.__combat.combatRestyleSourceMask(actor) };
      }, id);
    }
    return result;
  };
  const waitMode = async (mode) => {
    await page.waitForFunction((selected) => window.__combat.graphicsMode() === selected
      && window.__demo.stats().graphicsMode === selected, { timeout: 60_000 }, mode);
    await settled();
  };
  await waitMode('DOS-EGA');
  const dos = await pixelSamples();
  await unchanged('Initial native sampling');
  await page.click('#combat-graphics-restyle');
  await waitMode('Restyle');
  await unchanged('Restyle mouse click');
  const restyle = await pixelSamples();
  for (const id of representatives) {
    assert.equal(restyle[id].count, dos[id].count);
    assert.notEqual(restyle[id].icon, dos[id].icon, `${id}: admitted art must change opaque icon pixels`);
    assert.ok(restyle[id].mask, `${id}: source-mask receipt required`);
    assert.equal(restyle[id].mask.escapedOutputPixels, 0, `${id}: Restyle must stay inside the source mask`);
  }
  assert.ok(Object.values(restyle).some((sample) => sample.terrain.changedTerrainSamples.length > 0), 'At least one visible terrain tile must render Restyle pixels');
  if (primedScene) assert.notEqual(await page.evaluate(() => window.__demo.stats().bitmapPackRevision), null,
    'Naturally primed demo bitmap remains cached before combat Clear');
  const beforeClear = await page.evaluate(() => window.__demo.stats().graphicsRevision);
  await clearLocalRestyleFiles(page, combatPicker); await settled();
  assert.equal(await page.evaluate(() => window.__demo.stats().graphicsRevision), beforeClear + 1);
  assert.equal(await page.evaluate(() => window.__demo.stats().bitmapPackRevision), null,
    'Combat Clear invalidates the underlying demo bitmap');
  await unchanged('Combat picker Clear');
  await selectLocalRestyleFiles(page, localRestyle.filter((file) => !file.relativePath.endsWith(demoManifest.restyle.destination)), combatPicker);
  await settled(); await unchanged('Combat pack missing narration scene');
  await selectLocalRestyleFiles(page, localRestyle, combatPicker);
  await settled(); await unchanged('Combat pack replacement');
  assert.equal(await page.evaluate(() => window.__demo.stats().graphicsMode), 'Restyle');
  await page.click('#combat-graphics-dos');
  await waitMode('DOS-EGA');
  const restored = await pixelSamples();
  for (const id of representatives) {
    assert.equal(restored[id].icon, dos[id].icon, `${id}: exact native icon restoration`);
    assert.equal(restored[id].canvas, dos[id].canvas, `${id}: exact native canvas restoration at the same camera`);
  }
  await unchanged('DOS restoration');
  // Real keyboard events test both capture handlers and default button activation.
  await page.focus('#combat-graphics-dos');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'combat-graphics-amiga');
  await unchanged('Tab to the optional Amiga control');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'combat-graphics-restyle');
  await unchanged('Tab between graphics buttons');
  await page.keyboard.press('Enter');
  await waitMode('Restyle');
  await unchanged('Enter on Restyle');
  await page.focus('#combat-graphics-dos');
  await page.keyboard.press('Space');
  await waitMode('DOS-EGA');
  await unchanged('Space on DOS');
  assert.equal(await page.evaluate(() => localStorage.getItem('greybox.graphics.cok')), 'DOS-EGA');
  assert.equal(requests.size, 0, 'Restyle images must be read from the selected local pack, not fetched from the candidate');
  assert.deepEqual(errors, [], `Browser errors: ${JSON.stringify(errors)}`);
  await page.click('#combat-graphics-restyle'); await waitMode('Restyle');
  const beforeCompletion = await page.evaluate(() => window.__demo.stats());
  for (let i = 0; i < 600 && await page.evaluate(() => window.__demo.stats().combats) === beforeCompletion.combats; i++) await page.evaluate(() => window.__demo.step());
  const completed = await page.evaluate(() => window.__demo.stats());
  assert.equal(completed.combats, beforeCompletion.combats + 1, 'INCOMPLETE: natural combat did not finish within 600 steps');
  assert.equal(completed.lastOutcome, 'party', 'INCOMPLETE: real victory required');
  assert.equal(completed.phase, 'narration', 'INCOMPLETE: VM must resume narration');
  assert.equal(await page.$('.sheet-overlay'), null, 'Combat overlay must be dismissed');
  const incomplete = !primedScene ? ['Natural pre-combat route did not prime pinned scene/cache'] : [];
  for (let i = 0; i < 300 && await page.evaluate(() => window.__demo.stats().pictureId) !== demoManifest.pictureId; i++) await page.evaluate(() => window.__demo.step());
  if (await page.evaluate(() => window.__demo.stats().pictureId) !== demoManifest.pictureId) incomplete.push('Natural following beats did not reach pinned scene');
  else {
    await page.waitForFunction(() => window.__demo.stats().restyleVisible && !window.__demo.stats().restyleLoading);
    assert.equal(await page.evaluate(() => { const s = window.__demo.stats(); return s.graphicsMode === 'Restyle' && !s.restyleError && s.bitmapPackRevision === s.localPackRevision; }), true, 'Current pack alone presents post-combat scene');
    if (primedPixels) assert.equal(await page.$eval('.gb-demo-restyle-overlay', (canvas) => canvas.toDataURL()), primedPixels, 'Exact admitted scene pixels after combat');
    const beats = await page.evaluate(() => window.__demo.stats().beatsPlayed);
    assert.notEqual(beats, await page.evaluate(() => { window.__demo.step(); return window.__demo.stats().beatsPlayed; }), 'Natural following beat must advance');
  }
  if (incomplete.length) process.exitCode = 1;
  console.log(JSON.stringify({ result: incomplete.length ? 'INCOMPLETE' : 'PASS', incomplete, route: 'ECL2#57 attract demo combat', bindings: 15,
    cpicIds: pictureIds, terrainTiles: 25, candidate: root,
    indexSha256: sha(readFileSync(resolve(root, 'index.html'))),
    evidence: 'Scoped pack changes preserve combat/VM; real steps earn victory, dismiss, narration and current-pack scene.' }, null, 2));
} catch (error) { console.error(`INCOMPLETE: ${error.stack ?? error}`); process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server.listening) await new Promise((done) => server.close(done));
}
