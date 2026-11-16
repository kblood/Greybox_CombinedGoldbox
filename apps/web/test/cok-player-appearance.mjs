// Bounded source-derived player-art verification. Uses external PNGs and synthetic SAV records;
// never reads retail saves. All staging stays in an owned temporary directory.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import puppeteer from 'puppeteer-core';
import { bundleCokPlayerAppearance } from '../scripts/bundle-cok-player-appearance.mjs';
import manifest from '../src/ui/cokPlayerAppearanceManifest.json' with { type: 'json' };
import admission from '../src/ui/cokPlayerRestyleAdmission.json' with { type: 'json' };
import { cokPlayerAppearanceHeldRestylePaths, cokPlayerAppearancePackagePlan } from '../src/ui/cok-player-restyle-admission.mjs';

const WEB = fileURLToPath(new URL('../', import.meta.url));
const SOURCE = resolve(process.env.GB_COK_PLAYER_ART_SOURCE ?? 'C:/GoldBoxImg/cok_restyle_work');
if (!existsSync(SOURCE)) {
  console.log(`SKIP cok-player-appearance: external player-art source unavailable: ${SOURCE}`);
  process.exit(0);
}
const temporary = mkdtempSync(join(tmpdir(), 'greybox-cok-player-'));
const output = join(temporary, 'package');
mkdirSync(output);
const palette = [0x10, 0x21, 0x32, 0x43, 0x64, 0x75];
const alternatePalette = [0xe2, 0xd3, 0xc4, 0xb5, 0xa6, 0x97];
const neutralPalette = [0x91, 0xa2, 0xb3, 0xc4, 0xe6, 0xf7];
const tuple = (cBodyBlock, cBodySlot, paletteBytes = palette) => ({
  cHeadRequest: 5, cBodyBlock, cBodySlot, suffixCode: 2, paletteBytes,
});
const fourthTuple = (paletteBytes = palette) => ({
  cHeadRequest: 3, cBodyBlock: 11, cBodySlot: 3, suffixCode: 1, paletteBytes,
});
// Independent Python/Pillow source-index composition, documented in the admission receipt.
// These values are not captured from the TypeScript loader under test.
const golden = {
  11: ['B453BF0509C4EFF2F3CE9D773D0039DCB6F0ACB2299A1BEE076C9362F75F1BC3', '7BDC95B14607619B2775C394C61F86B1229DF439E12FD305FA910778AD58174A', '5DFDAF1807C10930462F12CB203E0D7AA6156D4772E8A3D91CBDD98C0C718BAD'],
  139: ['17D292D8F9316964FD9D34015A71F74D2D11B67F31EB4AA835C9B6C2633876AB', 'F50332BEC5B82A4BA784ADDF31F98ED54AE44E7A289F5054838B6BA4BA870A45', '607681A0771AA2297014FC5C7D8CD0EFFEB7265DB21AAEBA7860B2B0D0C33771'],
  87: ['54C83F01AB392E4CB87669DF8B2BE932C245CD35F6B19BC12C53366E908A4641', 'BA3512E8B77F2EF1389CCF1E12F70ACE34844704706F9CEFF6093B3D91870EC4', '7CD12AC8EF2BB44596BA221EE74E857E1399078C6EE5CB2B4DF9EC50448C0F02'],
  215: ['ADC554A6C8433CC32C0F2123D1D872EB2204B731C74E157FD43DD5E566402A45', '878F3C5D11CB24C13EB99B64CA5C042655551B4BA0DE2C00FCAA9D5507BEFB5C', '09E4017CCCAAEF3F271A7B1E3DAC3CD02FB686FFF8672C5E0A0E91B700CDBE89'],
  65: ['B017785B7BD6C4643232F2E09A692D4A4F7A34E00FE47AFD60516CA051A3E731', '17E17FACA87C3CAE095656C10651E535AD3D74D19518DF536187575488174092', '2779962815F3A49952B02B95B795B43D951DBF1807F47F31D4BE86954BBDF849'],
  193: ['DEE05A26DEA47F7FAEBE4C345C767EC16A4001167099F5826870A0B8D5F95FE2', 'EAD6EE8A0C14B6066318A4843F258AE91F7482A0CA256E525DE1ADF83B17650C', '863CE0A51EA4AAEB5C80D0B7AAC2F0C482C166197E2A14F939161BB411FC0BA4'],
  88: ['D98FEDCFF27745C52B3735340C8DBAD18F9A39931C7504C8F94BA783F17C7C0A', '0672EC2E1E1DA8D42C942EEABCF28AD19711D46BBE03E3EB6D55FCB8BA3FEC28', '955EED86E079DC5B65AFB61B60021DA8A44F50C5FBF541FCC436F5F231BD5D8D'],
  216: ['772F10B4A0C888B2E4DC0EFCE4C59EC832D340F4CBC511509568A654695048EB', '34435D28A591C3813B51EE0286AF99EC2C530AF0FE0C7F6899E72BA0B5176DDE', '94AF6B418C489E5F64B7346F75F43792CA4843C1420102A403ECB0AA24F7E805'],
};
// Rows8-9 independently discriminate the newly admitted 10-row head from old 8-row truncation.
const extendedHeadRowsGolden = {
  11: ['ABD6D29CBADC83AA802899731B62E4F0C4089DB1F89535B5C74E5ACC5D572185', 'FB674FC03BE80A17CD723CD898D41C00BDA91B6A20D116DBBE16B8E1BC4F1792', '32CDC8E3B4F30D5D25CF1EB1B0299915649DBDEB5FF47E241B4E06F3A9D65A2B'],
  139: ['B4EB44F9DEFB19A678E5A2976441C97ACC20745E08C1CF163C7F9F61133E9D90', '2768EC913F4A06CE83A6E6F0D2AFAE05D9E6048434AFFA8E53461C9C9CB74A24', '3108ACC858926688CF166D0ABF18C8B5B4D496E135DC5DE8BEDFFB45C7E480C0'],
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase();
async function verifyCombatPlayerArtSwitch(page, expectedSamples, recover) {
  const settled = async () => {
    await page.waitForFunction(() => { const load = window.__combat.graphicsLoadState();
      return load && !load.loading && load.requestedRevision === load.appliedRevision; });
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const snapshot = async () => { await settled(); return page.evaluate(async (expectedSamples) => {
    const canvas = document.querySelector('.sheet-overlay .gb-emu canvas');
    const context = canvas?.getContext('2d');
    if (!canvas || !context) throw new Error('Diagnostic-combat canvas unavailable');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)),
      (byte) => byte.toString(16).padStart(2, '0')).join('');
    const playerTiles = [];
    const spritePixels = [];
    const mappedIds = window.__combat.playerAppearanceIds();
    for (const cell of window.__combat.visibleCombatIcons()) {
      if (!mappedIds.includes(cell.id) || cell.down || cell.impaired || cell.guarding) continue;
      const footprint = window.__combat.paintedFootprint(cell.id);
      const first = window.__combat.canvasPointForNativePixel(cell.cellX + 2, cell.cellY + 2);
      const last = window.__combat.canvasPointForNativePixel(cell.cellX + footprint.w - 2, cell.cellY + footprint.h - 2);
      const crop = context.getImageData(first.x, first.y, last.x - first.x, last.y - first.y).data;
      const tileHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', crop)),
        (byte) => byte.toString(16).padStart(2, '0')).join('');
      playerTiles.push({ id: cell.id, hash: tileHash });
      const rect = window.__combat.displayRect();
      const profile = window.__combat.displayProfile();
      const dpr = window.devicePixelRatio || 1;
      if (footprint.w !== 24 || footprint.h !== 24 || profile.nativeWidth !== 1280) throw new Error('Player pixel attribution requires the source-proven 24x24 / 4x renderer');
      for (const sample of expectedSamples[cell.id] ?? []) {
        const sourceX = (cell.cellX + sample.x) * 4 + sample.subX;
        const sourceY = (cell.cellY + sample.y) * 4 + sample.subY;
        const point = { x: Math.floor((rect.x + (sourceX + 0.5) * rect.width / profile.nativeWidth) * dpr),
          y: Math.floor((rect.y + (sourceY + 0.5) * rect.height / profile.nativeHeight) * dpr) };
        // Nearest-neighbor display fitting may omit a 4x art pixel when reducing the canvas.
        // Admit only physical pixels whose inverse mapping samples this exact opaque art pixel.
        const selectedX = Math.floor(((point.x + 0.5) / dpr - rect.x) * profile.nativeWidth / rect.width);
        const selectedY = Math.floor(((point.y + 0.5) / dpr - rect.y) * profile.nativeHeight / rect.height);
        if (selectedX !== sourceX || selectedY !== sourceY) continue;
        spritePixels.push({ id: cell.id, x: sample.x, y: sample.y, subX: sample.subX, subY: sample.subY,
          rgba: [...context.getImageData(point.x, point.y, 1, 1).data] });
      }
    }
    return { mode: window.__combat.graphicsMode(), hash, playerTiles, spritePixels,
      combatants: window.__combat.combatants(), state: { phase: window.__combat.phase(),
        current: window.__combat.current(), activeId: window.__combat.activeId(),
        hp: window.__combat.combatants().map(({ id }) => [id, window.__combat.hpOf(id)]),
        party: localStorage.getItem('greybox.party.cok') } };
  }, expectedSamples); };
  await page.click('#combat-graphics-dos');
  await page.waitForFunction('window.__combat.graphicsMode() === "DOS-EGA"');
  const dos = await snapshot();
  if (recover) {
    await page.click('#combat-graphics-amiga');
    await settled();
    await page.click('#combat-graphics-restyle');
    await page.waitForFunction(() => {
      const frames = window.__combat.playerAppearanceStatuses().p1;
      return frames?.length === 1 && frames[0].state === 'failed';
    });
    const fallback = await snapshot();
    assert.deepEqual(fallback.spritePixels.filter(({ id }) => id === 'p1'), dos.spritePixels.filter(({ id }) => id === 'p1'), 'Actual combat paints exact original sprite pixels after optional head failure');
    assert.ok(fallback.spritePixels.some(({ id }) => id === 'p1'));
    assert.deepEqual(fallback.state, dos.state);
    assert.match(await page.$eval('#combat-graphics-status', (node) => node.textContent), /DOS original.*Restyle unavailable/);
    assert.match(await page.$eval('#combat-graphics-status', (node) => node.textContent), /player icon uses DOS fallback \(Amiga mapping pending\)/);
    await recover();
  }
  await page.evaluate('window.__explore.viewSheet()');
  await page.waitForFunction('window.__sheet.playerAppearanceVisible()');
  await page.evaluate(() => {
    window.runtimeModeEvents = [];
    if (window.playerModeListener) window.removeEventListener('goldbox:graphics-mode', window.playerModeListener);
    window.playerModeListener = (event) => window.runtimeModeEvents.push(event.detail);
    window.addEventListener('goldbox:graphics-mode', window.playerModeListener);
  });
  await page.click('.sheet-player-art [data-runtime-graphics-mode="Restyle"]');
  await page.waitForFunction('window.__combat.graphicsMode() === "Restyle"');
  assert.deepEqual(await page.evaluate('window.runtimeModeEvents'), [{ gameId: 'cok', mode: 'Restyle' }], 'Sheet selection applies to combat without rebroadcast');
  assert.equal(await page.$eval('#combat-graphics-restyle', (button) => button.getAttribute('aria-pressed')), 'true');
  await page.waitForFunction(() => Object.values(window.__combat.playerAppearanceStatuses()).every((frames) =>
    frames.length === 1 && frames[0].state === 'ready'));
  const restyle = await snapshot();
  assert.notEqual(restyle.hash, dos.hash, 'Restyle must change the diagnostic-combat canvas');
  assert.ok(dos.playerTiles.length > 0, 'At least one mapped player icon must be visible for pixel acceptance');
  assert.deepEqual(restyle.playerTiles.map(({ id }) => id), dos.playerTiles.map(({ id }) => id));
  for (const tile of dos.playerTiles) assert.notEqual(restyle.playerTiles.find(({ id }) => id === tile.id).hash, tile.hash,
    `Restyle must change the actual player-icon tile ${tile.id}`);
  assert.deepEqual(restyle.combatants, dos.combatants, 'graphics mode must not change combat state');
  assert.deepEqual(restyle.state, dos.state);
  // Attribution uses only changed opaque source+Restyle pixels within the sprite interior;
  // source holes, terrain, border cursor and HUD cannot satisfy this control.
  const exactSamples = dos.spritePixels.filter((sample) => {
    const expected = expectedSamples[sample.id].find(({ x, y, subX, subY }) => x === sample.x && y === sample.y && subX === sample.subX && subY === sample.subY);
    const after = restyle.spritePixels.find(({ id, x, y, subX, subY }) => id === sample.id && x === sample.x && y === sample.y && subX === sample.subX && subY === sample.subY);
    return JSON.stringify(sample.rgba) === JSON.stringify(expected.original)
      && JSON.stringify(after?.rgba) === JSON.stringify(expected.restyle);
  });
  assert.ok(exactSamples.some(({ id }) => id === 'p1'), 'Icon 4 needs an actual changed opaque sprite pixel, independently of terrain');
  await page.click('.sheet-player-art [data-runtime-graphics-mode="Amiga"]');
  await page.waitForFunction('window.__combat.graphicsMode() === "Amiga" && window.__sheet.playerAppearanceMode().includes("Amiga mapping pending")');
  await page.waitForFunction(() => window.__combat.backdropGraphicsMode() === 'Amiga'
    || /Amiga unavailable|Could not load Amiga/.test(document.querySelector('#combat-graphics-status').textContent));
  assert.deepEqual((await snapshot()).state, dos.state, 'Amiga selection through sheet preserves combat state');
  assert.match(await page.$eval('#combat-graphics-status', (node) => node.textContent), /player icon uses DOS fallback/);
  await page.click('.sheet-player-art [data-runtime-graphics-mode="DOS-EGA"]');
  await page.waitForFunction('window.__combat.graphicsMode() === "DOS-EGA" && window.__combat.backdropGraphicsMode() === "DOS-EGA"');
  assert.equal(await page.$eval('#combat-graphics-dos', (button) => button.getAttribute('aria-pressed')), 'true');
  assert.equal(await page.$eval('.sheet-player-art [data-runtime-graphics-mode="DOS-EGA"]', (button) => button.getAttribute('aria-pressed')), 'true');
  assert.deepEqual(await page.evaluate('window.runtimeModeEvents'), ['Restyle', 'Amiga', 'DOS-EGA'].map((mode) => ({ gameId: 'cok', mode })));
  await page.evaluate(() => { window.removeEventListener('goldbox:graphics-mode', window.playerModeListener); delete window.playerModeListener; });
  await page.evaluate('window.__sheet.close()');
  const restored = await snapshot();
  assert.equal(restored.hash, dos.hash, 'DOS must restore the exact diagnostic-combat canvas');
  assert.deepEqual(restored.playerTiles, dos.playerTiles, 'DOS must restore the exact mapped player-icon tiles');
  assert.deepEqual(restored.combatants, dos.combatants);
  assert.deepEqual(restored.state, dos.state);
  assert.deepEqual(restored.spritePixels, dos.spritePixels);
  console.log(`  player sprite pixels: ${exactSamples.length} exact opaque DOS/Restyle matches (${[...new Set(exactSamples.map(({ id }) => id))].join(',')}); DOS pixels/state restored`);
}
let browser;
let server;
let fault = null;
let creatorSecondaryFault = null;
let artRequests = 0;
const artPaths = [];
let delayedRequest;
try {
  const staleHeldPath = join(output, 'restyle/cok/player', cokPlayerAppearanceHeldRestylePaths(manifest, admission)[0]);
  mkdirSync(resolve(staleHeldPath, '..'), { recursive: true });
  copyFileSync(join(SOURCE, manifest.appearances[0].bodyFrames[1].restyleFile), staleHeldPath);
  assert.equal(bundleCokPlayerAppearance(SOURCE, output), 20);
  assert.equal(existsSync(staleHeldPath), false, 'Bundler removes the exact held Restyle path Vite may have copied from public/');
  assert.equal(readdirSync(output, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).length, 20);
  const packagePlan = cokPlayerAppearancePackagePlan(manifest, admission);
  assert.equal(packagePlan.filter((entry) => entry.dest.includes('/original/')).length, 12);
  assert.equal(packagePlan.filter((entry) => entry.dest.includes('/restyle/')).length, 8);
  for (const entry of packagePlan) {
    const path = join(output, 'restyle/cok/player', entry.dest);
    assert.equal(sha(readFileSync(path)), entry.sha256.toUpperCase());
  }
  for (const appearance of manifest.appearances) {
    assert.deepEqual(appearance.head.blockIds, appearance.appearanceId === 'cok-player-03-0b-03-01' ? [3, 131] : [69, 197]);
    assert.equal(appearance.head.nativeWidth, 24);
    assert.equal(appearance.head.nativeHeight, appearance.appearanceId === 'cok-player-03-0b-03-01' ? 10 : 8);
  }
  // Validation of the last input must finish before any files are copied to the output.
  const incompleteSource = join(temporary, 'incomplete-source');
  const rejectedOutput = join(temporary, 'rejected-output');
  mkdirSync(incompleteSource);
  mkdirSync(rejectedOutput);
  assert.throws(() => bundleCokPlayerAppearance(incompleteSource, rejectedOutput), /ENOENT/);
  assert.deepEqual(readdirSync(rejectedOutput), []);
  const last = packagePlan.at(-1);
  // Copy only the exact package roster into a separate owned source, then mutate its final admitted input.
  for (const entry of packagePlan) {
    const path = join(incompleteSource, entry.file);
    mkdirSync(resolve(path, '..'), { recursive: true });
    copyFileSync(join(SOURCE, entry.file), path);
  }
  const invalid = Buffer.from(readFileSync(join(incompleteSource, last.file)));
  invalid[invalid.length - 1] ^= 1;
  writeFileSync(join(incompleteSource, last.file), invalid);
  assert.throws(() => bundleCokPlayerAppearance(incompleteSource, rejectedOutput), /SHA-256 differs/);
  assert.deepEqual(readdirSync(rejectedOutput), []);
  const probe = net.createServer();
  await new Promise((done) => probe.listen(0, '127.0.0.1', done));
  const port = probe.address().port;
  await new Promise((done) => probe.close(done));
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
    '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: WEB, stdio: 'pipe' });
  let log = '';
  for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { log += chunk; });
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`Owned Vite server exited: ${log}`);
    try { ready = (await fetch(base)).ok && log.includes(`127.0.0.1:${port}`); } catch { /* starting */ }
    if (ready) break;
    await new Promise((done) => setTimeout(done, 100));
  }
  assert.ok(ready, `Vite did not start: ${log}`);
  browser = await puppeteer.launch({ executablePath: process.env.GB_BROWSER_PATH
    ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    window.artBitmapsOpen = 0;
    const create = window.createImageBitmap;
    window.createImageBitmap = async (...args) => {
      const bitmap = await create(...args);
      window.artBitmapsOpen++;
      const close = bitmap.close.bind(bitmap);
      bitmap.close = () => { window.artBitmapsOpen--; close(); };
      return bitmap;
    };
  });
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.href === `${base}/`) {
      void request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
    } else if (url.pathname.startsWith('/restyle/cok/player/')) {
      artRequests++;
      artPaths.push(url.pathname);
      const path = join(output, url.pathname.slice(1));
      const activeFault = fault?.path === url.pathname ? fault
        : creatorSecondaryFault?.path === url.pathname ? creatorSecondaryFault : null;
      if (!existsSync(path) || activeFault?.kind === 'missing') {
        void request.respond({ status: 404 });
        return;
      }
      const bytes = Buffer.from(readFileSync(path));
      if (activeFault?.kind === 'hash') bytes[bytes.length - 1] ^= 1;
      if (activeFault?.kind === 'geometry') bytes.writeUInt32BE(95, 16);
      if (activeFault?.kind === 'delay') {
        delayedRequest = () => request.respond(activeFault.missingAfterDelay ? { status: 404 }
          : { status: 200, contentType: 'image/png', body: bytes });
        return;
      }
      void request.respond({ status: 200, contentType: 'image/png', body: bytes });
    } else void request.continue();
  });
  await page.goto(base);
  const migration = await page.evaluate(async () => {
    const mode = await import('/src/ui/runtimeGraphicsMode.ts');
    const rows = [];
    const events = [];
    const listener = (event) => events.push(event.detail);
    window.addEventListener('goldbox:graphics-mode', listener);
    for (const id of ['cok-natural', 'cok-natural-2', 'cok-natural-3', 'cok-natural-4', 'cok-natural-5', 'cok-natural-6']) {
      localStorage.removeItem('greybox.graphics.cok'); localStorage.removeItem('greybox.graphics-fallback.cok');
      localStorage.setItem(`greybox.graphics.${id}`, 'Restyle'); localStorage.setItem(`greybox.graphics-fallback.${id}`, 'Amiga');
      localStorage.setItem(`greybox.automap.${id}`, 'unchanged');
      const migrated = [mode.readRuntimeGraphicsMode(id), mode.readRuntimeGraphicsFallback(id)];
      const stored = [localStorage.getItem('greybox.graphics.cok'), localStorage.getItem('greybox.graphics-fallback.cok')];
      mode.writeRuntimeGraphicsMode('cok', 'DOS-EGA');
      const precedence = [mode.readRuntimeGraphicsMode(id), mode.readRuntimeGraphicsFallback(id)];
      mode.writeRuntimeGraphicsMode(id, 'Restyle');
      rows.push({ id, migrated, stored, precedence, event: events.at(-1),
        legacy: [localStorage.getItem(`greybox.graphics.${id}`), localStorage.getItem(`greybox.graphics-fallback.${id}`)],
        automap: localStorage.getItem(`greybox.automap.${id}`) });
    }
    localStorage.removeItem('greybox.graphics.cok'); localStorage.removeItem('greybox.graphics-fallback.cok');
    localStorage.setItem('greybox.graphics.cok-natural-2', 'DOS-EGA');
    const onlyEntered = mode.readRuntimeGraphicsMode('cok-natural-2');
    localStorage.setItem('greybox.graphics.cok', 'invalid'); localStorage.setItem('greybox.graphics-fallback.cok', 'Restyle');
    const invalid = [mode.readRuntimeGraphicsMode('cok-natural'), mode.readRuntimeGraphicsFallback('cok-natural')];
    const untouchedInvalid = localStorage.getItem('greybox.graphics.cok');
    window.removeEventListener('goldbox:graphics-mode', listener);
    mode.writeRuntimeGraphicsMode('cok', 'DOS-EGA');
    return { rows, onlyEntered, invalid, untouchedInvalid,
      isolated: ['dqk', 'cok-natural-1', 'cok-natural-7'].map(mode.runtimeGraphicsGameId) };
  });
  for (const row of migration.rows) {
    assert.deepEqual(row.migrated, ['Restyle', 'Amiga']); assert.deepEqual(row.stored, row.migrated);
    assert.deepEqual(row.precedence, ['DOS-EGA', 'DOS-EGA']); assert.deepEqual(row.legacy, ['Restyle', 'Amiga']);
    assert.deepEqual(row.event, { gameId: 'cok', mode: 'Restyle' }); assert.equal(row.automap, 'unchanged');
  }
  assert.equal(migration.onlyEntered, 'DOS-EGA'); assert.deepEqual(migration.invalid, ['DOS-EGA', 'DOS-EGA']);
  assert.equal(migration.untouchedInvalid, 'invalid'); assert.deepEqual(migration.isolated, ['dqk', 'cok-natural-1', 'cok-natural-7']);
  await page.evaluate(async () => {
    window.loadAppearance = (await import('/src/ui/cokPlayerAppearance.ts')).loadCokPlayerAppearance;
    window.pixelSha = async (pixels) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)),
      (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  });
  const load = (record) => page.evaluate(async (value) => {
    const appearance = await window.loadAppearance(value);
    if (!appearance) return null;
    return {
      id: appearance.id,
      frames: await Promise.all(appearance.frames.map(async (frame) => {
        const { original } = frame;
        const restyle = frame.restyle ?? original;
        if (original.width !== 96 || original.height !== 96 || restyle.width !== 96 || restyle.height !== 96) {
          throw new Error('Player art geometry differs from source contract');
        }
        let visible = 0;
        for (let i = 3; i < original.pixels.length; i += 4) {
          if (original.pixels[i] === 0 && restyle.pixels[i] !== 0) throw new Error('Restyle leaks across source mask');
          if (restyle.pixels[i]) visible++;
        }
        if (!visible) throw new Error('Empty Restyle');
        let transparentPixels = 0;
        let opaqueBlackPixels = 0;
        const opaqueSamples = [];
        for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
          let alphaMax = 0;
          for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
            const offset = ((y * 4 + py) * 96 + x * 4 + px) * 4;
            alphaMax = Math.max(alphaMax, restyle.pixels[offset + 3]);
            if (!original.pixels[offset + 3]) transparentPixels++;
            if (original.pixels[offset + 3] === 255 && original.pixels.slice(offset, offset + 3).every((c) => c === 0)) opaqueBlackPixels++;
            if (x >= 2 && x <= 21 && y >= 2 && y <= 21 && restyle.pixels[offset + 3] === 255 && original.pixels[offset + 3] === 255
              && original.pixels.slice(offset, offset + 3).some((c, channel) => c !== restyle.pixels[offset + channel])) {
              opaqueSamples.push({ x, y, subX: px, subY: py, original: [...original.pixels.slice(offset, offset + 4)],
                restyle: [...restyle.pixels.slice(offset, offset + 4)] });
            }
          }
          const offset = ((y * 4 + 2) * 96 + x * 4 + 2) * 4;
          if (original.pixels[offset + 3] && !alphaMax) throw new Error('Source-visible cell lost its entire Restyle alpha');
        }
        // Canvas canonicalizes hidden RGB and premultiplied alpha. Compare sheet output with
        // the rendered buffer, while retaining raw RGBA hashes for the independent source oracle.
        const canvas = document.createElement('canvas');
        canvas.width = restyle.width;
        canvas.height = restyle.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.putImageData(new ImageData(new Uint8ClampedArray(restyle.pixels), restyle.width, restyle.height), 0, 0);
        const renderedRestyle = await window.pixelSha(context.getImageData(0, 0, canvas.width, canvas.height).data);
        context.putImageData(new ImageData(new Uint8ClampedArray(original.pixels), original.width, original.height), 0, 0);
        return { blockId: frame.bodyBlockId, canonical: frame.canonical, original: await window.pixelSha(original.pixels),
          restyle: await window.pixelSha(restyle.pixels),
          renderedRestyle, transparentPixels, opaqueBlackPixels, opaqueSamples,
          restyleState: frame.restyleStatus.state, restyleEligible: frame.restyleStatus.state === 'ready',
          admissionReason: frame.restyleStatus.reason ?? null,
          extendedHeadRows: await window.pixelSha(original.pixels.slice(32 * 96 * 4, 40 * 96 * 4)),
          renderedOriginal: await window.pixelSha(context.getImageData(0, 0, canvas.width, canvas.height).data) };
      })),
    };
  }, record);
  const original = await load(tuple(24, 0));
  const alias = await load(tuple(24, 2));
  const added = await load(tuple(1, 1));
  const third = await load(tuple(23, 4));
  const thirdAlias = await load(tuple(23, 5));
  const neutralThird = await load(tuple(23, 4, neutralPalette));
  const fourth = await load(fourthTuple());
  const neutralFourth = await load(fourthTuple(neutralPalette));
  assert.equal(fourth.id, 'cok-player-03-0b-03-01');
  assert.deepEqual(fourth.frames.map((frame) => frame.blockId), [11, 139]);
  assert.deepEqual(thirdAlias, third, 'Only the proven slot-5 alias shares the new identity and both frames');
  assert.equal(third.id, 'cok-player-05-17-04-02');
  assert.deepEqual(third.frames.map((frame) => frame.blockId), [87, 215]);
  assert.equal(new Set([original.id, added.id, third.id, fourth.id]).size, 4);
  for (const [appearance, heads, bodies] of [
    [original, [69, 197], [88, 216]], [added, [69, 197], [65, 193]],
    [third, [69, 197], [87, 215]], [fourth, [3, 131], [11, 139]],
  ]) {
    assert.deepEqual(appearance.frames.map((frame) => frame.canonical), heads.map((head, index) => ({
      appearanceSetId: `cok/dos-ega/appearance/${appearance.id.slice('cok-player-'.length)}`,
      headSourceId: `cok/dos-ega/install/chead.dax/block/${head}/frame/0`,
      bodySourceId: `cok/dos-ega/install/cbody.dax/block/${bodies[index]}/frame/0`,
    })));
  }
  for (const appearance of [original, added, third, fourth]) {
    assert.equal(appearance.frames[0].restyleState, 'ready');
    assert.equal(appearance.frames[0].restyleEligible, true);
    assert.equal(appearance.frames[1].restyleState, 'not-admitted');
    assert.equal(appearance.frames[1].restyleEligible, false);
    assert.equal(appearance.frames[1].restyle, appearance.frames[1].original,
      'Held secondary body shows the exact DOS original in Restyle mode');
    assert.equal(appearance.frames[1].admissionReason, 'awaiting-prompt-and-composition-review');
  }
  for (const frame of [...third.frames, ...fourth.frames]) {
    assert.ok(frame.transparentPixels > 0, 'Key-1 source holes remain transparent');
    assert.ok(frame.opaqueBlackPixels > 0, 'Black source RGB remains opaque rather than becoming a mask');
  }
  for (const frame of [third.frames[0], fourth.frames[0]]) {
    assert.ok(frame.opaqueSamples.length > 0, 'Admitted frames need isolated changed opaque sprite pixels');
  }
  const neutralOriginal = await load(tuple(24, 0, neutralPalette));
  const neutralAdded = await load(tuple(1, 1, neutralPalette));
  assert.deepEqual(alias, original, 'Pointer-slot control must produce the same identity and both pixel buffers');
  assert.notEqual(added.id, original.id);
  assert.deepEqual(added.frames.map((frame) => frame.blockId), [65, 193]);
  for (const [record, variant] of [[tuple(24, 0), 0], [tuple(1, 1), 0],
    [tuple(24, 0, alternatePalette), 1], [tuple(1, 1, alternatePalette), 1],
    [tuple(24, 0, neutralPalette), 2], [tuple(1, 1, neutralPalette), 2],
    [tuple(23, 4), 0], [tuple(23, 4, alternatePalette), 1], [tuple(23, 4, neutralPalette), 2],
    [fourthTuple(), 0], [fourthTuple(alternatePalette), 1], [fourthTuple(neutralPalette), 2]]) {
    for (const frame of (await load(record)).frames) {
      assert.equal(frame.original, golden[frame.blockId][variant]);
      if (record.cHeadRequest === 3) assert.equal(frame.extendedHeadRows, extendedHeadRowsGolden[frame.blockId][variant], 'Both added head rows must participate in independent pixel/mask composition');
    }
  }
  assert.notEqual(added.frames[0].original, original.frames[0].original);
  assert.notEqual(added.frames[0].restyle, original.frames[0].restyle);
  // The held body215 candidate is never requested. Its DOS source holes and opaque cells remain
  // exact in every palette, while the displayed Restyle result stays the DOS original.
  const restoredCells = await page.evaluate(async (records) => {
    const cells = [6, 7, 8, 9, 10, 11, 12, 20].map((x) => [x, 22]);
    for (const record of records) {
      const frame = (await window.loadAppearance(record)).frames.find((frame) => frame.bodyBlockId === 215);
      if (!frame || frame.restyleStatus.state !== 'not-admitted' || frame.restyle !== null) {
        throw new Error('Held body215 Restyle became runtime-eligible');
      }
      for (const [x, y] of cells) for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
        const offset = ((y * 4 + py) * 96 + x * 4 + px) * 4;
        if (frame.original.pixels[offset + 3] !== 255) throw new Error('body215 source content was incorrectly masked');
      }
    }
    return cells;
  }, [tuple(23, 4), tuple(23, 4, alternatePalette), tuple(23, 4, neutralPalette)]);
  assert.deepEqual(restoredCells, [6, 7, 8, 9, 10, 11, 12, 20].map((x) => [x, 22]));
  const fourthRestoredCells = await page.evaluate(async (records) => {
    const cells = [7, 9, 10, 11, 12, 19, 20, 21].map((x) => [x, 22]);
    for (const record of records) {
      const frame = (await window.loadAppearance(record)).frames.find((frame) => frame.bodyBlockId === 139);
      if (!frame || frame.restyleStatus.state !== 'not-admitted' || frame.restyle !== null) {
        throw new Error('Held body139 Restyle became runtime-eligible');
      }
      for (const [x, y] of cells) for (let py = 0; py < 4; py++) for (let px = 0; px < 4; px++) {
        const offset = ((y * 4 + py) * 96 + x * 4 + px) * 4;
        if (frame.original.pixels[offset + 3] !== 255) throw new Error('body139 source content was incorrectly masked');
      }
    }
    return cells;
  }, [fourthTuple(), fourthTuple(alternatePalette), fourthTuple(neutralPalette)]);
  assert.deepEqual(fourthRestoredCells, [7, 9, 10, 11, 12, 19, 20, 21].map((x) => [x, 22]));
  // Source-derived negative controls: remapping another index to blue/key1 must not mask it,
  // while remapping the original key1 to black must not make a source hole opaque.
  const maskControls = await page.evaluate(async (record) => {
    const frames = (await window.loadAppearance(record)).frames;
    return frames.map((frame, index) => {
      const opaque = index === 0 ? [6, 9] : [9, 11]; // DAX-composed index2 -> palette index1.
      const hole = index === 0 ? [10, 10] : [11, 10]; // DAX body index1, below the head.
      const sample = (pixels, [x, y]) => [...pixels.slice(((y * 4 + 2) * 96 + x * 4 + 2) * 4,
        ((y * 4 + 2) * 96 + x * 4 + 2) * 4 + 4)];
      return { blockId: frame.bodyBlockId, opaque: sample(frame.original.pixels, opaque),
        hole: sample(frame.original.pixels, hole), restyleHole: sample(frame.restyle?.pixels ?? frame.original.pixels, hole)[3],
        black: sample(frame.original.pixels, [0, 0]) };
    });
  }, fourthTuple());
  for (const frame of maskControls) {
    assert.deepEqual(frame.opaque, [0, 0, 170, 255], 'A palette-remapped index1 is still source-visible');
    assert.deepEqual(frame.hole, [0, 0, 0, 0], 'Original key1 remains masked after palette mapping to black');
    assert.equal(frame.restyleHole, 0);
    assert.deepEqual(frame.black, [0, 0, 0, 255], 'Original black remains opaque');
  }
  const beforeRejection = artRequests;
  for (const rejected of [undefined, tuple(24, 1), tuple(1, 0), tuple(25, 0),
    { ...tuple(1, 1), suffixCode: 1 }, { ...tuple(1, 1), cHeadRequest: 1 },
    tuple(23, 0), tuple(23, 1), tuple(23, 2), tuple(23, 3), tuple(23, 6), tuple(23, 11), tuple(23, 12),
    { ...tuple(23, 4), suffixCode: 0 }, { ...tuple(23, 4), suffixCode: 1 },
    { ...tuple(23, 4), suffixCode: 3 }, { ...tuple(23, 4), cHeadRequest: 3 },
    ...[0, 1, 2, 4, 5, 11, 12, 255].map((cBodySlot) => ({ ...fourthTuple(), cBodySlot })),
    ...[0, 2, 3].map((suffixCode) => ({ ...fourthTuple(), suffixCode })),
    { ...fourthTuple(), cHeadRequest: 5 }, { ...fourthTuple(), cBodyBlock: 12 },
    fourthTuple(palette.slice(1)), fourthTuple([0, 1, 2, 3, 4, 256]), fourthTuple([0, 1, 2, 3, 4, -1]),
    tuple(1, 1, palette.slice(1)), tuple(1, 1, [0, 1, 2, 3, 4, 256]), tuple(1, 1, [0, 1, 2, 3, 4, 1.5])]) {
    assert.equal(await load(rejected), null, `Unsupported tuple was admitted: ${JSON.stringify(rejected)}`);
  }
  assert.equal(artRequests, beforeRejection, 'Unsupported appearances must not fetch images');
  // Optional failures preserve exact independently pinned originals, never mixed composites.
  const summary = (record, retry = false) => page.evaluate(async ({ record, retry }) => {
    const module = await import('/src/ui/cokPlayerAppearance.ts');
    const prepared = await module.prepareCokPlayerAppearance(record, retry ? window.priorPlayerOriginal : undefined);
    window.priorPlayerOriginal = prepared.original;
    const completed = await prepared.restyleReady;
    return Promise.all(completed.frames.map(async (frame) => ({ state: frame.restyleStatus.state,
      reason: frame.restyleStatus.reason,
      component: frame.restyleStatus.component, error: frame.restyleStatus.error,
      original: await window.pixelSha(frame.original.pixels),
      restyle: frame.restyle && await window.pixelSha(frame.restyle.pixels) })));
  }, { record, retry });
  for (const [file, component, failedFrames, record, expected, id] of [
    ['CHEAD_003', 'head', [0], fourthTuple(), fourth, 'cok-player-03-0b-03-01'],
    ['CBODY_011', 'body', [0], fourthTuple(), fourth, 'cok-player-03-0b-03-01'],
  ]) {
    for (const [kind, error] of [['missing', /HTTP 404/], ['hash', /differs from pinned source/], ['geometry', /geometry\/type differs/]]) {
      fault = { path: `/restyle/cok/player/${id}/restyle/${file}_restyle.png`, kind };
      const result = await summary(record);
      assert.ok(await page.evaluate(async (record) => (await window.loadAppearance(record)).frames.some((frame) => frame.restyleStatus.state === 'failed'), record), 'Completed wrapper accepts optional failure');
      for (const [index, frame] of result.entries()) {
        assert.equal(frame.original, expected.frames[index].original);
        assert.equal(frame.state, index === 1 ? 'not-admitted' : failedFrames.includes(index) ? 'failed' : 'ready');
        assert.equal(frame.restyle, null, 'Failure summary exposes no unusable Restyle composite');
        if (index === 1) assert.equal(frame.reason, 'awaiting-prompt-and-composition-review');
        if (failedFrames.includes(index)) { assert.equal(frame.component, component); assert.match(frame.error, error); }
      }
      fault = null;
      const retryStart = artPaths.length;
      assert.deepEqual((await summary(record, true)).map(({ restyle }) => restyle),
        expected.frames.map((frame) => frame.restyleEligible ? frame.restyle : null));
      assert.ok(artPaths.slice(retryStart).length > 0);
      assert.ok(artPaths.slice(retryStart).every((path) => path.includes('/restyle/') && !path.includes('/original/')), 'Explicit retry requests optional files only');
      assert.equal(await page.evaluate('window.artBitmapsOpen'), 0);
    }
  }
  for (const [kind, error] of [['missing', /HTTP 404/], ['hash', /differs from pinned source/], ['geometry', /geometry\/type differs/]]) {
    fault = { path: '/restyle/cok/player/cok-player-03-0b-03-01/original/CHEAD_003.png', kind };
    await assert.rejects(() => load(fourthTuple()), error);
    fault = null;
    assert.deepEqual(await load(fourthTuple()), fourth);
    assert.equal(await page.evaluate('window.artBitmapsOpen'), 0);
  }

  // Authored under the Vite hold; primary-scope acceptance remains UNRUN.
  const scoped = (scope, retry = false) => page.evaluate(async ({ scope, retry, record }) => {
    const { prepareCokPlayerAppearance } = await import('/src/ui/cokPlayerAppearance.ts');
    const prepared = await prepareCokPlayerAppearance(record, retry ? window.scopedOriginal : undefined, scope);
    window.scopedOriginal = prepared.original;
    const ready = await prepared.restyleReady;
    return Promise.all(ready.frames.map(async (frame) => ({ block: frame.bodyBlockId,
      original: await window.pixelSha(frame.original.pixels), state: frame.restyleStatus.state })));
  }, { scope, retry, record: fourthTuple() });
  const secondary = '/restyle/cok/player/cok-player-03-0b-03-01/original/CBODY_139.png';
  const invalidStart = artPaths.length;
  assert.equal(await page.evaluate(async (record) => (await import('/src/ui/cokPlayerAppearance.ts'))
    .prepareCokPlayerAppearance({ ...record, cBodySlot: 0 }, undefined, 'primary'), fourthTuple()), null);
  assert.equal(artPaths.length, invalidStart, 'Primary scope retains full selector validation before fetch');
  for (const kind of ['missing', 'hash', 'geometry']) {
    fault = { path: secondary, kind };
    const start = artPaths.length;
    const primary = await scoped('primary');
    assert.deepEqual(primary, [{ block: 11, original: fourth.frames[0].original, state: 'ready' }]);
    assert.ok(!artPaths.slice(start).includes(secondary), 'Primary must not request a secondary original');
    for (const scope of [undefined, 'all']) await assert.rejects(() => scoped(scope, true));
    await assert.rejects(() => load(fourthTuple()), undefined, 'Completed wrapper retains strict all-frame behavior');
  }
  fault = null;
  await scoped('all');
  const isolationStart = artPaths.length;
  assert.equal((await scoped('primary', true)).length, 1);
  assert.ok(artPaths.slice(isolationStart).some((path) => path.includes('/original/')), 'All-scope cache cannot satisfy primary scope');
  for (const file of ['CHEAD_003', 'CBODY_011']) for (const kind of ['missing', 'hash', 'geometry']) {
    fault = { path: `/restyle/cok/player/cok-player-03-0b-03-01/original/${file}.png`, kind };
    await assert.rejects(() => scoped('primary'));
  }
  fault = { path: '/restyle/cok/player/cok-player-03-0b-03-01/restyle/CBODY_011_restyle.png', kind: 'missing' };
  assert.deepEqual(await scoped('primary'), [{ block: 11, original: fourth.frames[0].original, state: 'failed' }]);
  fault = null;

  // Actual synthetic-SAV importer, reorder and app-save bridge; source appearance stays on its member.
  const imported = await page.evaluate(async () => {
    const importer = await import('/src/ui/importParty.ts');
    importer.installImportSeam();
    const files = {};
    for (const [index, tupleBytes] of [[0, [5, 24, 0, 2]], [1, [5, 1, 1, 2]], [2, [5, 24, 2, 2]], [3, [5, 23, 4, 2]], [4, [5, 23, 5, 2]], [5, [3, 11, 3, 1]]]) {
      const raw = new Uint8Array(409);
      const name = `Player${index}`;
      raw[0] = name.length;
      for (let i = 0; i < name.length; i++) raw[i + 1] = name.charCodeAt(i);
      for (let i = 0; i < 6; i++) raw[16 + i * 2] = raw[17 + i * 2] = 18;
      raw[89] = 44; raw[90] = 6; raw[91] = 2; raw[98] = 55; raw[275] = 56;
      raw.set([13, 14, 15, 16, 17], 208);
      raw.set([...tupleBytes, 0x10, 0x21, 0x32, 0x43, 0x64, 0x75], 0x135);
      files[`CHRDATA${index + 1}.SAV`] = Array.from(raw);
    }
    const result = await window.__import.runWithSyntheticFiles(files);
    const party = (await import('/src/ui/party.ts'));
    const members = party.getParty();
    const reordered = [members[5], members[3], members[1], members[4], members[2], members[0]];
    localStorage.setItem('greybox.party.cok', JSON.stringify(reordered));
    party.reloadStores();
    const save = await import('/src/ui/saveStore.ts');
    save.saveToSlot('player-art-test', { name: 'Player icon identities', clockMinutes: 123, flags: { proof: 7 } });
    localStorage.setItem('greybox.party.cok', '[]');
    party.reloadStores();
    const restored = save.loadSlot('player-art-test');
    return { imported: result.imported, expected: reordered, actual: party.getParty(), restored };
  });
  assert.equal(imported.imported.length, 6);
  assert.deepEqual(imported.actual, imported.expected);
  assert.equal(imported.restored.clockMinutes, 123);
  assert.deepEqual(imported.restored.flags, { proof: 7 });
  assert.deepEqual(imported.actual.map((member) => member.appearance), [fourthTuple(), tuple(23, 4), tuple(1, 1), tuple(23, 5), tuple(24, 2), tuple(24, 0)]);
  await page.evaluate(async () => {
    localStorage.setItem('greybox.graphics.cok', 'DOS-EGA');
    (await import('/src/ui/charSheet.ts')).openCharSheet({ frameTiles: null, font: null, graphicsGameId: 'cok' });
  });
  const sheetHash = async () => {
    await page.waitForFunction('window.__sheet.playerAppearanceVisible() && !window.__sheet.playerAppearanceMode().startsWith("Loading")');
    return page.evaluate(async () => {
      const canvas = document.querySelector('.sheet-player-art-canvas');
      return { name: window.__sheet.name(), mode: window.__sheet.playerAppearanceMode(),
        hash: await window.pixelSha(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data) };
    });
  };
  const partyBeforeModeCycle = await page.evaluate(() => localStorage.getItem('greybox.party.cok'));
  const firstSheet = await sheetHash();
  assert.equal(firstSheet.name, 'Player5');
  assert.equal(firstSheet.hash, fourth.frames[0].original);
  for (const [mode, expected] of [['Restyle', fourth.frames[0].renderedRestyle], ['Amiga', fourth.frames[0].original], ['DOS-EGA', fourth.frames[0].original]]) {
    await page.click(`.sheet-player-art [data-runtime-graphics-mode="${mode}"]`);
    if (mode === 'Restyle') await page.waitForFunction('window.__sheet.playerAppearanceMode() === "Restyle character icon"');
    const current = await sheetHash();
    assert.equal(current.hash, expected);
    if (mode === 'Restyle') assert.notEqual(current.hash, firstSheet.hash, 'Isolated Icon 4 canvas must visibly change');
    assert.equal(await page.evaluate(() => localStorage.getItem('greybox.party.cok')), partyBeforeModeCycle);
    if (mode === 'Amiga') assert.equal(current.mode, 'DOS character icon · Amiga mapping pending');
  }
  await page.evaluate('window.__sheet.next()');
  assert.equal((await sheetHash()).hash, third.frames[0].original);
  await page.evaluate('window.__sheet.next()');
  assert.equal((await sheetHash()).hash, added.frames[0].original);
  await page.evaluate('window.__sheet.next()');
  assert.equal((await sheetHash()).hash, third.frames[0].original);
  for (let i = 0; i < 2; i++) {
    await page.evaluate('window.__sheet.next()');
    assert.equal((await sheetHash()).hash, original.frames[0].original);
  }
  await page.evaluate('window.__sheet.close()');
  for (const kind of ['missing', 'hash', 'geometry']) {
    fault = { kind, path: secondary }; const start = artPaths.length;
    await page.evaluate(async () => (await import('/src/ui/charSheet.ts')).openCharSheet({ frameTiles: null, font: null, graphicsGameId: 'cok' }));
    assert.equal((await sheetHash()).hash, fourth.frames[0].original);
    await page.click('.sheet-player-art [data-runtime-graphics-mode="Restyle"]');
    await page.waitForFunction('window.__sheet.playerAppearanceMode() === "Restyle character icon"');
    assert.equal((await sheetHash()).hash, fourth.frames[0].renderedRestyle);
    await page.click('.sheet-player-art [data-runtime-graphics-mode="DOS-EGA"]');
    assert.equal((await sheetHash()).hash, fourth.frames[0].original);
    assert.ok(!artPaths.slice(start).includes(secondary), 'Fresh sheet never requests the faulted secondary original');
    await page.evaluate('window.__sheet.close()'); fault = null;
  }
  // Delay a fresh load for the first member, switch members, then release the stale image.
  fault = { kind: 'delay', path: '/restyle/cok/player/cok-player-03-0b-03-01/restyle/CHEAD_003_restyle.png' };
  await page.evaluate(async () => (await import('/src/ui/charSheet.ts')).openCharSheet({ frameTiles: null, font: null, graphicsGameId: 'cok' }));
  for (let attempt = 0; attempt < 200 && !delayedRequest; attempt++) await new Promise((done) => setTimeout(done, 25));
  assert.ok(delayedRequest, 'Delayed image request was not observed');
  await page.evaluate(() => { window.heldPlayerCompletion = window.__sheet.playerAppearanceCompletion(); });
  assert.equal((await sheetHash()).hash, fourth.frames[0].renderedOriginal, 'Sheet paints original while optional head is held');
  await page.evaluate('window.__sheet.next()');
  const switched = await sheetHash();
  assert.equal(switched.name, 'Player3');
  assert.equal(switched.hash, third.frames[0].original);
  fault = null;
  await delayedRequest();
  // Await the exact held preparation, then queued guarded paint callbacks and final display.
  await page.evaluate(async () => { if (!window.heldPlayerCompletion) throw new Error('Missing exact completion receipt');
    await window.heldPlayerCompletion; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.waitForFunction('window.artBitmapsOpen === 0');
  assert.deepEqual(await sheetHash(), switched, 'A late previous-member load must not overwrite the active member');
  await page.evaluate('window.__sheet.close()');

  fault = { kind: 'missing', path: '/restyle/cok/player/cok-player-03-0b-03-01/restyle/CHEAD_003_restyle.png' };
  await page.evaluate(async () => {
    (await import('/src/ui/runtimeGraphicsMode.ts')).writeRuntimeGraphicsMode('cok', 'Amiga');
    (await import('/src/ui/runtimeGraphicsMode.ts')).writeRuntimeGraphicsMode('cok', 'Restyle');
    (await import('/src/ui/charSheet.ts')).openCharSheet({ frameTiles: null, font: null, graphicsGameId: 'cok' });
  });
  await page.waitForFunction('window.__sheet.playerAppearanceMode().includes("Restyle unavailable")');
  assert.equal((await sheetHash()).hash, fourth.frames[0].renderedOriginal);
  assert.match((await sheetHash()).mode, /Amiga mapping pending/);
  const failedSheetRequests = artPaths.filter((path) => path === fault.path).length;
  await page.evaluate('window.__sheet.next(); window.__sheet.prev()');
  await page.waitForFunction('window.__sheet.playerAppearanceMode().includes("Restyle unavailable")');
  assert.equal(artPaths.filter((path) => path === fault.path).length, failedSheetRequests, 'Sheet repaints do not automatically retry optional failures');
  fault = null;
  const sheetRetryStart = artPaths.length;
  await page.click('.sheet-player-art [data-runtime-graphics-mode="Restyle"]');
  await page.waitForFunction('window.__sheet.playerAppearanceMode() === "Restyle character icon"');
  assert.equal((await sheetHash()).hash, fourth.frames[0].renderedRestyle);
  assert.ok(artPaths.slice(sheetRetryStart).filter((path) => path.includes('/cok-player-03-0b-03-01/')).every((path) => !path.includes('/original/')));
  await page.evaluate(async () => { window.__sheet.close(); (await import('/src/ui/runtimeGraphicsMode.ts')).writeRuntimeGraphicsMode('cok', 'DOS-EGA'); });

  // Real creation controls: four canonical choices; neither storage-slot alias adds a choice.
  const choices = await page.evaluate(async () => {
    const helper = await import('/src/ui/cokPlayerAppearanceChoices.ts');
    const choices = helper.cokPlayerAppearanceChoices();
    const first = helper.cokPlayerAppearanceForChoice(choices[0].id);
    const second = helper.cokPlayerAppearanceForChoice(choices[0].id);
    first.paletteBytes[0] = 0;
    try { choices[0].sourceTuple.cHeadRequest = 0; } catch { /* strict-mode assignment rejects */ }
    const immutable = Object.isFrozen(choices) && choices.every((choice) => Object.isFrozen(choice)
      && Object.isFrozen(choice.sourceTuple)) && choices[0].sourceTuple.cHeadRequest === 5;
    return { choices, immutable, independentPalette: second.paletteBytes,
      unknown: helper.cokPlayerAppearanceForChoice('unknown') ?? null };
  });
  assert.deepEqual(choices.choices.map(({ id }) => id), ['cok-player-05-18-00-02', 'cok-player-05-01-01-02', 'cok-player-05-17-04-02', 'cok-player-03-0b-03-01']);
  assert.equal(choices.immutable, true);
  assert.deepEqual(choices.independentPalette, neutralPalette);
  assert.equal(choices.unknown, null);
  await page.evaluate(async () => {
    (await import('/src/ui/party.ts')).clearParty();
    await import('/src/ui/viewer.css');
    document.body.innerHTML = '<div id="output"></div><div id="status"></div>';
    (await import('/src/ui/create.ts')).startCreate();
    window.__create.setName('CreatorLegacy');
    window.__create.setAbilities({ str: 15, int: 15, wis: 15, dex: 15, con: 15, cha: 15 });
  });
  assert.deepEqual(await page.$$eval('#cc-appearance option', (options) => options.map(({ value }) => value)),
    ['', 'cok-player-05-18-00-02', 'cok-player-05-01-01-02', 'cok-player-05-17-04-02', 'cok-player-03-0b-03-01']);
  assert.equal(await page.evaluate('window.__create.appearanceRequest() ?? null'), null);
  assert.equal(await page.evaluate('window.__create.setAppearance("unknown")'), false);
  await page.click('.cc-add');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('greybox.party.cok'))[0].appearance ?? null), null);
  const previewHashes = async () => {
    await page.waitForFunction(() => {
      const canvases = [...document.querySelectorAll('.cc-player-preview-canvas')];
      return canvases.length === 2 && canvases.every((canvas) => !canvas.hidden);
    });
    return page.$$eval('.cc-player-preview-canvas', (canvases) => Promise.all(canvases.map((canvas) =>
      window.pixelSha(canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data))));
  };
  const assertPreview = async (appearance, kinds = ['renderedOriginal', 'renderedOriginal']) => {
    assert.deepEqual(await previewHashes(), appearance.frames.map((frame, index) => frame[kinds[index]]));
  };
  const previewStatuses = () => page.$$eval('.cc-player-preview [role="status"]', (nodes) => nodes.map((node) => node.textContent));
  const waitPreviewSettled = () => page.waitForFunction(() => {
    const statuses = [...document.querySelectorAll('.cc-player-preview [role="status"]')];
    return statuses.length === 2 && statuses.every((node) => !/Loading|Restyle loading/.test(node.textContent));
  });
  await page.select('#cc-appearance', 'cok-player-05-18-00-02');
  await assertPreview(neutralOriginal);
  assert.deepEqual(await page.$$eval('.cc-player-preview-variant-label', (nodes) => nodes.map((node) => node.textContent)), ['Variant 1', 'Variant 2']);
  assert.deepEqual(await page.$$eval('.cc-player-preview-canvas', (nodes) => nodes.map((node) => node.getAttribute('aria-label'))), ['Variant 1', 'Variant 2']);
  assert.equal(await page.$$eval('.cc-player-preview [data-runtime-graphics-mode]', (nodes) => nodes.length), 3, 'One shared mode control');
  assert.deepEqual(await page.$$eval('.cc-player-preview-canvas', (canvases) => {
    const [first, second] = canvases.map((canvas) => canvas.getBoundingClientRect());
    return [first.width, first.height, second.width, second.height, first.top === second.top, second.left > first.right];
  }), [96, 96, 96, 96, true, true], 'Both variants appear side by side');
  const creationState = () => page.evaluate(() => ({ fields: [...document.querySelectorAll('#output input, #output select')]
    .map((field) => [field.id, field.type, field.value, field.checked]), appearance: window.__create.appearanceRequest(),
    party: localStorage.getItem('greybox.party.cok') }));
  for (const appearance of [neutralAdded, neutralThird, neutralFourth, neutralOriginal]) {
    await page.select('#cc-appearance', appearance.id);
    await assertPreview(appearance);
    const draftBeforeModes = await creationState();
    for (const mode of ['Restyle', 'Amiga', 'DOS-EGA', 'Restyle', 'DOS-EGA']) {
      await page.click(`.cc-player-preview [data-runtime-graphics-mode="${mode}"]`);
      await waitPreviewSettled();
      await assertPreview(appearance, mode === 'Restyle'
        ? ['renderedRestyle', 'renderedOriginal'] : ['renderedOriginal', 'renderedOriginal']);
      if (mode === 'Restyle') assert.deepEqual(await previewStatuses(), [
        'Restyle character icon', 'DOS character icon · Restyle awaiting review',
      ]);
      assert.deepEqual(await creationState(), draftBeforeModes);
      assert.equal(await page.$eval(`.cc-player-preview [data-runtime-graphics-mode="${mode}"]`, (button) => button.getAttribute('aria-pressed')), 'true');
      if (mode === 'Amiga') assert.deepEqual(await previewStatuses(), Array(2).fill('DOS character icon · Amiga mapping pending'));
    }
  }
  const draftChecks = await page.evaluate(() => {
    window.__create.setName('CreatorOne');
    window.__create.setRace('qualinestiElf');
    window.__create.setSex('female');
    window.__create.onlyClass('fighter', 2);
    window.__create.setAbilities({ str: 15, int: 15, wis: 15, dex: 15, con: 15, cha: 15 });
    const request = window.__create.appearanceRequest();
    request.paletteBytes[0] = 0;
    const validation = window.__create.validate();
    const sheetAppearance = validation.sheet?.appearance;
    if (sheetAppearance) sheetAppearance.paletteBytes[1] = 0;
    return { id: window.__create.appearanceId(), request: window.__create.appearanceRequest(),
      valid: validation.ok, requestAfterSheetMutation: window.__create.appearanceRequest() };
  });
  assert.equal(draftChecks.id, 'cok-player-05-18-00-02');
  assert.equal(draftChecks.valid, true);
  assert.deepEqual(draftChecks.request, tuple(24, 0, neutralPalette));
  assert.deepEqual(draftChecks.requestAfterSheetMutation, tuple(24, 0, neutralPalette));
  assert.equal(await page.$eval('#cc-appearance', (select) => select.value), draftChecks.id);
  await page.click('.cc-add');
  assert.equal(await page.evaluate('window.__create.appearanceId()'), null, 'Adding resets the optional selection');
  await page.select('#cc-appearance', 'cok-player-05-01-01-02');
  await assertPreview(neutralAdded);
  assert.equal(await page.evaluate('window.__create.setAppearance("unknown")'), false);
  assert.equal(await page.evaluate('window.__create.appearanceId()'), 'cok-player-05-01-01-02');
  await page.evaluate(() => {
    window.__create.setName('CreatorTwo');
    window.__create.setAbilities({ str: 15, int: 15, wis: 15, dex: 15, con: 15, cha: 15 });
  });
  await page.click('.cc-add');
  await page.select('#cc-appearance', 'cok-player-05-17-04-02');
  await assertPreview(neutralThird);
  await page.evaluate(() => {
    window.__create.setName('CreatorThree');
    window.__create.setRace('qualinestiElf');
    window.__create.setSex('female');
    window.__create.onlyClass('fighter', 2);
    window.__create.setAbilities({ str: 15, int: 15, wis: 15, dex: 15, con: 15, cha: 15 });
  });
  assert.deepEqual(await page.evaluate('window.__create.appearanceRequest()'), tuple(23, 4, neutralPalette));
  await assertPreview(neutralThird);
  await page.click('.cc-add');
  assert.equal(await page.evaluate('window.__create.appearanceId()'), null);
  await page.select('#cc-appearance', 'cok-player-03-0b-03-01');
  await assertPreview(neutralFourth);
  await page.evaluate(() => {
    window.__create.setName('CreatorFour');
    window.__create.setRace('qualinestiElf');
    window.__create.setSex('female');
    window.__create.onlyClass('fighter', 2);
    window.__create.setAbilities({ str: 15, int: 15, wis: 15, dex: 15, con: 15, cha: 15 });
  });
  assert.deepEqual(await page.evaluate('window.__create.appearanceRequest()'), fourthTuple(neutralPalette));
  await assertPreview(neutralFourth);
  await page.click('.cc-add');
  assert.equal(await page.evaluate('window.__create.appearanceId()'), null);
  const created = await page.evaluate(async () => {
    const party = await import('/src/ui/party.ts');
    const members = party.getParty();
    const reordered = [members[4], members[0], members[3], members[2], members[1]];
    localStorage.setItem('greybox.party.cok', JSON.stringify(reordered));
    party.reloadStores();
    const saves = await import('/src/ui/saveStore.ts');
    saves.saveToSlot('created-player-art', { name: 'Created icons', clockMinutes: 321 });
    party.clearParty();
    saves.loadSlot('created-player-art');
    const actual = party.getParty();
    const combatants = party.partyCombatants();
    combatants[0].cokAppearance.paletteBytes[0] = 0;
    return { actual, expected: reordered, combatants: party.partyCombatants(),
      separatePalettes: actual[0].appearance.paletteBytes !== actual[2].appearance.paletteBytes };
  });
  assert.deepEqual(created.actual, created.expected);
  assert.equal(created.separatePalettes, true);
  assert.deepEqual(created.actual.map(({ appearance }) => appearance ?? null),
    [fourthTuple(neutralPalette), null, tuple(23, 4, neutralPalette), tuple(1, 1, neutralPalette), tuple(24, 0, neutralPalette)]);
  assert.deepEqual(created.combatants.map(({ cokAppearance }) => cokAppearance ?? null),
    [fourthTuple(neutralPalette), null, tuple(23, 4, neutralPalette), tuple(1, 1, neutralPalette), tuple(24, 0, neutralPalette)]);
  await page.evaluate(async () => {
    (await import('/src/ui/charSheet.ts')).openCharSheet({ frameTiles: null, font: null, graphicsGameId: 'cok' });
  });
  assert.equal((await sheetHash()).hash, neutralFourth.frames[0].renderedOriginal);
  await page.evaluate('window.__sheet.next()');
  await page.waitForFunction('window.__sheet.playerAppearanceMode() === "No mapped character icon"');
  assert.equal(await page.evaluate('window.__sheet.playerAppearanceVisible()'), false);
  await page.evaluate('window.__sheet.next()');
  assert.equal((await sheetHash()).hash, neutralThird.frames[0].renderedOriginal);
  await page.evaluate('window.__sheet.next()');
  assert.equal((await sheetHash()).hash, neutralAdded.frames[0].renderedOriginal);
  await page.evaluate('window.__sheet.next()');
  assert.equal((await sheetHash()).hash, neutralOriginal.frames[0].renderedOriginal);
  await page.evaluate('window.__sheet.close()');
  for (const graphicsGameId of [undefined, 'dqk']) {
    await page.evaluate(async (graphicsGameId) => (await import('/src/ui/charSheet.ts')).openCharSheet({ frameTiles: null, font: null, graphicsGameId }), graphicsGameId);
    assert.equal(await page.$('.sheet-player-art [data-runtime-graphics-mode]'), null, 'Non-CoK host must not expose CoK graphics controls');
    assert.equal(await page.$eval('.sheet-player-art', (node) => node.hidden), true);
    await page.evaluate('window.__sheet.close()');
  }
  // A late preview for Icon 4 must not overwrite the newly selected Icon 1.
  delayedRequest = null;
  fault = { kind: 'delay', path: '/restyle/cok/player/cok-player-03-0b-03-01/restyle/CHEAD_003_restyle.png' };
  await page.evaluate(async () => (await import('/src/ui/create.ts')).startCreate());
  await page.select('#cc-appearance', 'cok-player-03-0b-03-01');
  for (let attempt = 0; attempt < 200 && !delayedRequest; attempt++) await new Promise((done) => setTimeout(done, 25));
  assert.ok(delayedRequest, 'Delayed creator-preview request was not observed');
  await page.evaluate(() => { window.heldPlayerCompletion = window.__create.playerAppearanceCompletion(); });
  await assertPreview(neutralFourth);
  await page.select('#cc-appearance', 'cok-player-05-18-00-02');
  await assertPreview(neutralOriginal);
  fault = null;
  await delayedRequest();
  // Await the exact held preparation, then queued guarded paint callbacks and final display.
  await page.evaluate(async () => { if (!window.heldPlayerCompletion) throw new Error('Missing exact completion receipt');
    await window.heldPlayerCompletion; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.waitForFunction('window.artBitmapsOpen === 0');
  await assertPreview(neutralOriginal);
  await page.click('.cc-player-preview [data-runtime-graphics-mode="Restyle"]');
  await assertPreview(neutralOriginal, ['renderedRestyle', 'renderedOriginal']);
  await page.select('#cc-appearance', '');
  assert.equal(await page.evaluate('window.__create.appearanceRequest() ?? null'), null);
  assert.deepEqual(await page.$$eval('.cc-player-preview-canvas', (canvases) => canvases.map((canvas) => canvas.hidden)), [true, true]);

  // Admitted primary files can fail independently; the held secondary body stays on DOS and is never fetched.
  for (const kind of ['missing', 'hash', 'geometry']) {
    for (const [file, kinds, failedVariants] of [
      ['CBODY_011', ['renderedOriginal', 'renderedOriginal'], [true, false]],
      ['CHEAD_003', ['renderedOriginal', 'renderedOriginal'], [true, false]],
    ]) {
      fault = { kind, path: `/restyle/cok/player/cok-player-03-0b-03-01/restyle/${file}_restyle.png` };
      await page.evaluate(async () => (await import('/src/ui/create.ts')).startCreate());
      await page.select('#cc-appearance', 'cok-player-03-0b-03-01');
      await waitPreviewSettled();
      await assertPreview(neutralFourth, kinds);
      assert.deepEqual((await previewStatuses()).map((label) => label.includes('Restyle unavailable')), failedVariants);
      assert.equal(await page.evaluate('localStorage.getItem("greybox.graphics.cok")'), 'Restyle');
      const failedDraft = await creationState();
      const failedRequests = artPaths.filter((path) => path === fault.path).length;
      await page.evaluate(() => window.__create.setName('Retry draft'));
      await waitPreviewSettled();
      await assertPreview(neutralFourth, kinds);
      assert.equal(artPaths.filter((path) => path === fault.path).length, failedRequests, 'Rerender does not retry optional failures');
      const retryDraft = await creationState();
      // A mode cycle preserves the requested preference and restores both exact DOS frames.
      for (const mode of ['DOS-EGA', 'Amiga', 'DOS-EGA']) {
        await page.click(`.cc-player-preview [data-runtime-graphics-mode="${mode}"]`);
        await assertPreview(neutralFourth);
        assert.deepEqual(await creationState(), retryDraft);
        if (mode === 'Amiga') assert.deepEqual(await previewStatuses(), Array(2).fill('DOS character icon · Amiga mapping pending'));
      }
      fault = null;
      const creatorRetryStart = artPaths.length;
      await page.click('.cc-player-preview [data-runtime-graphics-mode="Restyle"]');
      await waitPreviewSettled();
      await assertPreview(neutralFourth, ['renderedRestyle', 'renderedOriginal']);
      assert.deepEqual(await previewStatuses(), [
        'Restyle character icon', 'DOS character icon · Restyle awaiting review',
      ]);
      assert.deepEqual(await creationState(), retryDraft, 'Retry preserves the exact draft and saved party');
      assert.deepEqual(retryDraft.appearance, failedDraft.appearance);
      assert.equal(retryDraft.party, failedDraft.party);
      assert.ok(artPaths.slice(creatorRetryStart).length > 0);
      assert.ok(artPaths.slice(creatorRetryStart).every((path) => !path.includes('/original/')));
    }
  }
  // Reject the full preparation on a secondary source fault, then validate primary independently.
  const primaryPreviewHash = () => page.$eval('.cc-player-preview-canvas', (canvas) =>
    window.pixelSha(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data));
  for (const kind of ['missing', 'hash', 'geometry']) {
    creatorSecondaryFault = { kind, path: secondary };
    fault = { kind: 'missing', path: '/restyle/cok/player/cok-player-03-0b-03-01/restyle/CHEAD_003_restyle.png' };
    const secondaryStart = artPaths.filter((path) => path === secondary).length;
    await page.evaluate(async () => {
      (await import('/src/ui/runtimeGraphicsMode.ts')).writeRuntimeGraphicsMode('cok', 'DOS-EGA');
      (await import('/src/ui/create.ts')).startCreate();
    });
    await page.select('#cc-appearance', neutralFourth.id); await waitPreviewSettled();
    const degradedDraft = await creationState();
    const secondaryRequests = artPaths.filter((path) => path === secondary).length;
    assert.equal(secondaryRequests, secondaryStart + 1, 'Creator attempts strict all-frame preparation once before primary');
    for (const mode of ['DOS-EGA', 'Amiga', 'Restyle', 'DOS-EGA']) {
      await page.click(`.cc-player-preview [data-runtime-graphics-mode="${mode}"]`); await waitPreviewSettled();
      assert.deepEqual(await page.$$eval('.cc-player-preview-canvas', (nodes) => nodes.map((canvas) => canvas.hidden)), [false, true]);
      assert.equal(await primaryPreviewHash(), neutralFourth.frames[0].renderedOriginal);
      const labels = await previewStatuses(); assert.equal(labels[1], 'Character icon unavailable');
      assert.match(labels[0], mode === 'Restyle' ? /DOS character icon.*Restyle unavailable/
        : mode === 'Amiga' ? /DOS character icon.*Amiga mapping pending/ : /^DOS-EGA character icon$/);
      assert.deepEqual(await creationState(), degradedDraft);
      assert.equal(artPaths.filter((path) => path === secondary).length, secondaryRequests, 'Mode/retry retains primary scope');
    }
    const failedOptionalRequests = artPaths.filter((path) => path === fault.path).length;
    await page.evaluate((id) => window.__create.setAppearance(id), neutralFourth.id); await waitPreviewSettled();
    assert.equal(artPaths.filter((path) => path === fault.path).length, failedOptionalRequests, 'Rerender never auto-retries the optional failure');
    assert.deepEqual(await creationState(), degradedDraft);
    fault = null; const retryStart = artPaths.length;
    await page.click('.cc-player-preview [data-runtime-graphics-mode="Restyle"]'); await waitPreviewSettled();
    assert.equal(await primaryPreviewHash(), neutralFourth.frames[0].renderedRestyle);
    assert.deepEqual(await previewStatuses(), ['Restyle character icon', 'Character icon unavailable']);
    assert.deepEqual(await page.$$eval('.cc-player-preview-canvas', (nodes) => nodes.map((canvas) => canvas.hidden)), [false, true]);
    assert.ok(artPaths.slice(retryStart).length > 0);
    assert.ok(artPaths.slice(retryStart).every((path) => !path.includes('/original/')), 'Primary retry reuses independently validated source');
    assert.equal(artPaths.filter((path) => path === secondary).length, secondaryRequests);
    assert.deepEqual(await creationState(), degradedDraft);
    creatorSecondaryFault = null;
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('goldbox:local-asset-pack'))); await waitPreviewSettled();
    await assertPreview(neutralFourth, ['renderedRestyle', 'renderedOriginal']);
    assert.ok(artPaths.filter((path) => path === secondary).length > secondaryRequests, 'Pack invalidation restores a fresh strict all-frame attempt');
    assert.deepEqual(await creationState(), degradedDraft);
  }
  delayedRequest = null; fault = { kind: 'delay', path: secondary, missingAfterDelay: true };
  await page.evaluate(async () => (await import('/src/ui/create.ts')).startCreate());
  await page.select('#cc-appearance', neutralFourth.id);
  for (let attempt = 0; attempt < 200 && !delayedRequest; attempt++) await new Promise((done) => setTimeout(done, 25));
  assert.ok(delayedRequest, 'Delayed secondary source request was not observed');
  fault = null; await page.select('#cc-appearance', neutralOriginal.id); await waitPreviewSettled();
  await assertPreview(neutralOriginal, ['renderedRestyle', 'renderedOriginal']);
  const currentCreatorDraft = await creationState();
  await page.evaluate(() => { window.currentCreatorCompletion = window.__create.playerAppearanceCompletion(); });
  const staleStart = artPaths.length;
  await delayedRequest(); await page.waitForFunction('window.artBitmapsOpen === 0');
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.deepEqual(artPaths.slice(staleStart).filter((path) => path.includes('/cok-player-03-0b-03-01/')), [],
    'Superseded creator preview starts no primary fallback or retry after the appearance switch');
  await assertPreview(neutralOriginal, ['renderedRestyle', 'renderedOriginal']);
  assert.deepEqual(await previewStatuses(), ['Restyle character icon', 'DOS character icon · Restyle awaiting review']);
  assert.deepEqual(await creationState(), currentCreatorDraft);
  assert.equal(await page.evaluate(() => window.__create.playerAppearanceCompletion() === window.currentCreatorCompletion), true,
    'Old secondary rejection/primary completion cannot replace the current receipt');
  // A mandatory source-head failure cannot present a partial or stale composite.
  fault = { kind: 'missing', path: '/restyle/cok/player/cok-player-03-0b-03-01/original/CHEAD_003.png' };
  await page.evaluate(async () => (await import('/src/ui/create.ts')).startCreate());
  await page.select('#cc-appearance', 'cok-player-03-0b-03-01');
  await page.waitForFunction(() => [...document.querySelectorAll('.cc-player-preview [role="status"]')]
    .every((node) => node.textContent === 'Character icon preview unavailable'));
  assert.deepEqual(await page.$$eval('.cc-player-preview-canvas', (canvases) => canvases.map((canvas) => canvas.hidden)), [true, true]);
  fault = null;

  // Newly created and saved identities reach the actual combat consumer via diagnostic testFight; encounter reachability is not covered.
  await page.evaluate((members) => {
    localStorage.setItem('greybox.party.cok', JSON.stringify(members));
    localStorage.setItem('greybox.graphics.cok', 'Restyle');
    localStorage.setItem('greybox.graphics-fallback.cok', 'DOS-EGA');
  }, created.actual);
  fault = { kind: 'missing', path: '/restyle/cok/player/cok-player-03-0b-03-01/restyle/CHEAD_003_restyle.png' };
  const rosterArtPathStart = artPaths.length;
  await page.goto(`${base}/?explore=1`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('window.__explore && typeof window.__explore.testFight === "function"', { timeout: 45000 });
  // Companion roster: primary-only presentation, exact per-member pixels, no campaign mutation.
  const rosterSnapshot = async () => page.evaluate(async () => {
    const rows = [];
    for (const row of document.querySelectorAll('.gb-party-row')) {
      const canvas = row.querySelector('.gb-party-icon canvas');
      const bytes = canvas && !canvas.hidden ? canvas.getContext('2d').getImageData(0, 0, 96, 96).data : null;
      rows.push({ name: row.querySelector('.gb-party-name').textContent,
        status: row.querySelector('.gb-party-icon-status')?.textContent ?? null,
        hp: row.querySelector('.gb-party-hp').textContent,
        hash: bytes ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          b => b.toString(16).padStart(2, '0')).join('').toUpperCase() : null });
    }
    return { rows, pose: window.__explore.getPose(), clock: window.__explore.clockMinutes(),
      party: localStorage.getItem('greybox.party.cok'), save: localStorage.getItem('greybox.save.cok.quick'),
      flag: window.__explore.areaMemory(0x4c55) };
  });
  const rosterSettled = () => page.waitForFunction(() => document.querySelectorAll('.gb-party-row').length === 5
    && [...document.querySelectorAll('.gb-party-icon-status')].every(n => !/loading/i.test(n.textContent)));
  await rosterSettled();
  const initialRoster = await rosterSnapshot();
  const rosterFrames = [neutralFourth, null, neutralThird, neutralAdded, neutralOriginal].map(a => a?.frames[0]);
  const assertRosterPixels = (snapshot, mode, broken = false, order = [0, 1, 2, 3, 4]) => {
    assert.deepEqual(snapshot.rows.map(r => r.name), order.map(i => created.actual[i].name));
    assert.deepEqual(snapshot.rows.map(r => r.hash), order.map(i => !rosterFrames[i] ? null
      : rosterFrames[i][mode === 'Restyle' && !(broken && i === 0) ? 'renderedRestyle' : 'renderedOriginal']));
  };
  assertRosterPixels(initialRoster, 'Restyle', true);
  assert.equal(initialRoster.rows[0].hash, neutralFourth.frames[0].renderedOriginal);
  assert.match(initialRoster.rows[0].status, /Restyle unavailable/);
  assert.equal(initialRoster.rows[1].hash, null, 'Unmapped member stays text-only');
  assert.equal(initialRoster.rows[1].status, null);
  for (const mode of ['Amiga', 'DOS-EGA', 'Restyle']) {
    await page.evaluate(async mode => (await import('/src/ui/runtimeGraphicsMode.ts')).writeRuntimeGraphicsMode('cok', mode), mode);
    await rosterSettled(); const current = await rosterSnapshot();
    assert.deepEqual({ ...current, rows: undefined }, { ...initialRoster, rows: undefined });
    assert.deepEqual(current.rows.map(r => r.hp), initialRoster.rows.map(r => r.hp));
    assert.equal(current.rows[0].hash, neutralFourth.frames[0].renderedOriginal);
    if (mode === 'Amiga') assert.match(current.rows[0].status, /DOS character icon.*Amiga mapping pending/);
    if (mode === 'Restyle') assert.match(current.rows[0].status, /Restyle unavailable/);
    const expected = mode === 'Restyle' ? neutralThird.frames[0].renderedRestyle : neutralThird.frames[0].renderedOriginal;
    assert.equal(current.rows[2].hash, expected);
    assertRosterPixels(current, mode, true);
  }
  assert.ok(!artPaths.slice(rosterArtPathStart).some(p => /CBODY_(193|215|139|216)/.test(p)),
    'Roster requests primary bodies only');
  delayedRequest = null;
  fault = { kind: 'delay', path: '/restyle/cok/player/cok-player-03-0b-03-01/original/CHEAD_003.png' };
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('goldbox:local-asset-pack')));
  for (let attempt = 0; attempt < 200 && !delayedRequest; attempt++) await new Promise(done => setTimeout(done, 25));
  assert.ok(delayedRequest); const releaseOldRoster = delayedRequest;
  fault = null;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('goldbox:local-asset-pack')));
  await rosterSettled(); const replacementRoster = await rosterSnapshot();
  assert.equal(replacementRoster.rows[0].hash, neutralFourth.frames[0].renderedRestyle);
  const oldRosterResponse = page.waitForResponse(r => r.url().endsWith('/original/CHEAD_003.png'));
  await releaseOldRoster(); await oldRosterResponse;
  await page.waitForFunction('window.artBitmapsOpen === 0');
  assert.deepEqual(await rosterSnapshot(), replacementRoster, 'Old event-invalidated completion cannot overwrite current roster');
  // This dispatch checks event invalidation, not replacement of an actual picked pack.
  for (const mode of ['DOS-EGA', 'Amiga', 'DOS-EGA', 'Restyle']) {
    await page.evaluate(async mode => (await import('/src/ui/runtimeGraphicsMode.ts')).writeRuntimeGraphicsMode('cok', mode), mode);
    await rosterSettled(); const current = await rosterSnapshot();
    assertRosterPixels(current, mode);
    assert.deepEqual({ ...current, rows: undefined }, { ...replacementRoster, rows: undefined });
    assert.deepEqual(current.rows.map(r => r.hp), replacementRoster.rows.map(r => r.hp));
    if (mode === 'Amiga') for (const row of current.rows.filter(r => r.hash)) assert.match(row.status, /Amiga mapping pending/);
  }
  const healthyRoster = await rosterSnapshot();
  delayedRequest = null;
  fault = { kind: 'delay', path: '/restyle/cok/player/cok-player-03-0b-03-01/original/CHEAD_003.png' };
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('goldbox:local-asset-pack')));
  for (let attempt = 0; attempt < 200 && !delayedRequest; attempt++) await new Promise(done => setTimeout(done, 25));
  assert.ok(delayedRequest); const releaseReorderedRoster = delayedRequest; fault = null;
  const reorderedIndices = [4, 2, 0, 3, 1];
  await page.evaluate(async order => {
    window.detachedRosterRows = [...document.querySelectorAll('.gb-party-row')];
    const party = await import('/src/ui/party.ts'); const members = party.getParty();
    localStorage.setItem('greybox.party.cok', JSON.stringify(order.map(i => members[i]))); party.reloadStores();
    window.dispatchEvent(new CustomEvent('goldbox:graphics-mode', { detail: { gameId: 'cok', mode: 'Restyle' } }));
  }, reorderedIndices);
  const reorderedResponse = page.waitForResponse(r => r.url().endsWith('/original/CHEAD_003.png'));
  await releaseReorderedRoster(); await reorderedResponse; await rosterSettled();
  await page.waitForFunction('window.artBitmapsOpen === 0');
  const reorderedRoster = await rosterSnapshot(); assertRosterPixels(reorderedRoster, 'Restyle', false, reorderedIndices);
  assert.deepEqual(JSON.parse(reorderedRoster.party), reorderedIndices.map(i => JSON.parse(healthyRoster.party)[i]));
  assert.deepEqual(reorderedRoster.rows.map(r => r.hp), reorderedIndices.map(i => healthyRoster.rows[i].hp));
  assert.deepEqual({ ...reorderedRoster, rows: undefined, party: undefined }, { ...healthyRoster, rows: undefined, party: undefined });
  assert.equal(await page.evaluate(() => { const old = window.detachedRosterRows[0];
    return !old.isConnected && old.querySelector('canvas').hidden && /Loading/.test(old.querySelector('.gb-party-icon-status').textContent); }), true,
  'The real discarded roster row must not paint after the delayed source completes');
  await page.evaluate(async saved => {
    localStorage.setItem('greybox.party.cok', saved); (await import('/src/ui/party.ts')).reloadStores();
    window.dispatchEvent(new CustomEvent('goldbox:graphics-mode', { detail: { gameId: 'cok', mode: 'Restyle' } }));
    delete window.detachedRosterRows;
  }, healthyRoster.party);
  await rosterSettled(); assert.deepEqual(await rosterSnapshot(), healthyRoster);
  fault = { kind: 'missing', path: '/restyle/cok/player/cok-player-03-0b-03-01/restyle/CHEAD_003_restyle.png' };
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('goldbox:local-asset-pack')));
  await rosterSettled();
  const combatArtPathStart = artPaths.length;
  await page.evaluate(() => window.__explore.testFight(0x55));
  await page.waitForFunction('window.__combat && window.__combat.playerAppearanceIds().length >= 4', { timeout: 45000 });
  const combatAppearance = await page.evaluate(() => ({
    graphicsMode: window.__combat.graphicsMode(),
    playerIds: window.__combat.playerAppearanceIds(),
    errors: window.__combat.playerAppearanceErrors(),
    partyCombatants: window.__combat.combatants().filter((member) => member.side === 'party'),
  }));
  assert.equal(combatAppearance.graphicsMode, 'Restyle');
  assert.deepEqual(new Set(combatAppearance.playerIds), new Set(['p1', 'p3', 'p4', 'p5']));
  assert.deepEqual(combatAppearance.errors, {}, 'Every admitted tuple should load through the combat consumer');
  assert.deepEqual(combatAppearance.partyCombatants.map(({ id, name }) => ({ id, name })), [
    { id: 'p1', name: 'CreatorFour' }, { id: 'p2', name: 'CreatorLegacy' }, { id: 'p3', name: 'CreatorThree' }, { id: 'p4', name: 'CreatorTwo' }, { id: 'p5', name: 'CreatorOne' },
  ]);
  await page.waitForFunction(() => Object.values(window.__combat.playerAppearanceStatuses()).every((frames) => frames.every((frame) => frame.state !== 'pending')));
  const combatArtPaths = artPaths.slice(combatArtPathStart);
  assert.ok(!combatArtPaths.some((path) => /\/original\/CBODY_(193|215|139|216)\.png/.test(path)),
    'Combat preparation must not fetch held secondary originals');
  assert.ok(combatArtPaths.some((path) => path.includes('/cok-player-05-01-01-02/restyle/CBODY_065_restyle.png')),
    'the new imported tuple must load its Restyle body through combat');
  assert.ok(!combatArtPaths.some((path) => /CBODY_(193|215|139|216)_restyle\.png/.test(path)),
    'combat must not request any held secondary-body Restyle');
  assert.ok(combatArtPaths.some((path) => path.includes('/cok-player-05-17-04-02/restyle/CBODY_087_restyle.png')),
    'new Icon 3 primary frame must load through combat');
  assert.ok(!combatArtPaths.some((path) => path.includes('/cok-player-03-0b-03-01/restyle/CBODY_')), 'A failed optional head cannot produce mixed body composites');
  await verifyCombatPlayerArtSwitch(page, { p1: neutralFourth.frames[0].opaqueSamples, p3: neutralThird.frames[0].opaqueSamples,
    p4: neutralAdded.frames[0].opaqueSamples, p5: neutralOriginal.frames[0].opaqueSamples }, async () => { fault = null; });
  await page.evaluate('window.__explore.closeCombat()');
  for (const kind of ['missing', 'hash', 'geometry']) {
    fault = { kind, path: secondary }; const start = artPaths.length;
    await page.evaluate(() => window.__explore.testFight(0x55));
    await page.waitForFunction('window.__combat?.playerAppearanceIds().length >= 4');
    await verifyCombatPlayerArtSwitch(page, { p1: neutralFourth.frames[0].opaqueSamples, p3: neutralThird.frames[0].opaqueSamples,
      p4: neutralAdded.frames[0].opaqueSamples, p5: neutralOriginal.frames[0].opaqueSamples });
    assert.ok(!artPaths.slice(start).includes(secondary), 'Fresh diagnostic combat never requests the faulted secondary original');
    await page.evaluate('window.__explore.closeCombat()'); fault = null;
  }
  delayedRequest = null;
  fault = { kind: 'delay', path: '/restyle/cok/player/cok-player-03-0b-03-01/restyle/CHEAD_003_restyle.png' };
  await page.evaluate(() => window.__explore.testFight(0x55));
  await page.waitForFunction('window.__combat?.playerAppearanceStatuses().p1?.[0].state === "pending"');
  assert.ok(delayedRequest, 'Optional player head must not block mounting combat');
  await page.evaluate(() => { window.heldPlayerCompletion = window.__combat.playerAppearanceCompletion(); });
  await page.evaluate('window.__explore.closeCombat()');
  fault = null;
  await delayedRequest();
  // Await the exact held preparation, then queued guarded paint callbacks and final display.
  await page.evaluate(async () => { if (!window.heldPlayerCompletion) throw new Error('Missing exact completion receipt');
    await window.heldPlayerCompletion; await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.waitForFunction('window.artBitmapsOpen === 0');
  assert.equal(await page.evaluate('window.__combat.graphicsLoadState()'), null, 'Late optional completion cannot reopen or mutate a closed encounter');
  await page.goto(`${base}/?explore=cok-natural`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('window.__explore?.viewSheet', { timeout: 45000 });
  await page.evaluate('window.__explore.viewSheet()');
  const exploreState = () => page.evaluate(() => ({ pose: window.__explore.getPose(), clock: window.__explore.clockMinutes(),
    flag: window.__explore.areaMemory(0x4c55), party: localStorage.getItem('greybox.party.cok'),
    save: localStorage.getItem('greybox.save.cok.quick'), automap: localStorage.getItem('greybox.automap.cok-natural') }));
  const beforeSheet = await exploreState();
  for (const mode of ['Restyle', 'Amiga', 'DOS-EGA']) {
    await page.click(`.sheet-player-art [data-runtime-graphics-mode="${mode}"]`);
    assert.equal(await page.evaluate('localStorage.getItem("greybox.graphics.cok")'), mode);
    assert.deepEqual(await exploreState(), beforeSheet, 'Sheet mode changes preserve the active alias-route campaign');
    assert.deepEqual(await page.$$eval('#output .gb-seg', (buttons) => buttons.filter((button) =>
      ['DOS · EGA', 'Restyle'].includes(button.textContent) && button.classList.contains('active')).map((button) => button.textContent)),
    mode === 'Amiga' ? [] : [mode === 'Restyle' ? 'Restyle' : 'DOS · EGA']);
  }
  assert.equal(await page.evaluate('localStorage.getItem("greybox.graphics.cok-natural")'), 'Restyle', 'Legacy preference is retained');
  await page.evaluate('window.__sheet.close()');

  const candidateBase = process.env.GB_PLAYER_CANDIDATE_URL?.replace(/\/+$/, '');
  if (candidateBase) {
    const candidatePage = await browser.newPage();
    const candidateArtResponses = [];
    candidatePage.on('response', (response) => {
      const url = new URL(response.url());
      // Production is mounted below /greybox/, while Vite serves at /. Match both base-path forms.
      if (url.pathname.includes('/restyle/cok/player/')) candidateArtResponses.push({ path: url.pathname, status: response.status() });
    });
    await candidatePage.goto(candidateBase, { waitUntil: 'networkidle2', timeout: 60000 });
    await candidatePage.evaluate((members) => {
      localStorage.setItem('greybox.party.cok', JSON.stringify(members));
      localStorage.setItem('greybox.graphics.cok', 'Restyle');
      localStorage.setItem('greybox.graphics-fallback.cok', 'DOS-EGA');
    }, imported.actual);
    await candidatePage.goto(`${candidateBase}/?explore=1`, { waitUntil: 'networkidle2', timeout: 60000 });
    await candidatePage.waitForFunction('window.__explore && typeof window.__explore.testFight === "function"', { timeout: 45000 });
    await candidatePage.evaluate(() => window.__explore.testFight(0x55));
    await candidatePage.waitForFunction('window.__combat && window.__combat.playerAppearanceIds().length >= 6', { timeout: 45000 });
    const candidateCombat = await candidatePage.evaluate(() => ({
      graphicsMode: window.__combat.graphicsMode(),
      playerIds: window.__combat.playerAppearanceIds(),
      errors: window.__combat.playerAppearanceErrors(),
      partyCombatants: window.__combat.combatants().filter((member) => member.side === 'party')
        .map(({ id, name }) => ({ id, name })),
    }));
    assert.equal(candidateCombat.graphicsMode, 'Restyle');
    assert.deepEqual(new Set(candidateCombat.playerIds), new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']));
    assert.deepEqual(candidateCombat.errors, {});
    assert.deepEqual(candidateCombat.partyCombatants, [
      { id: 'p1', name: 'Player5' }, { id: 'p2', name: 'Player3' }, { id: 'p3', name: 'Player1' }, { id: 'p4', name: 'Player4' }, { id: 'p5', name: 'Player2' }, { id: 'p6', name: 'Player0' },
    ]);
    assert.ok(candidateArtResponses.some(({ path, status }) => status === 200
      && path.includes('/cok-player-05-01-01-02/restyle/CBODY_065_restyle.png')),
    'the candidate base must serve the new player image in diagnostic combat');
    for (const [appearanceId, block] of [['cok-player-05-17-04-02', '087'], ['cok-player-03-0b-03-01', '011']]) {
      assert.ok(candidateArtResponses.some(({ path, status }) => status === 200
        && path.includes(`/restyle/cok/player/${appearanceId}/restyle/CBODY_${block}_restyle.png`)),
      'candidate must serve the admitted primary body variant');
    }
    assert.ok(!candidateArtResponses.some(({ path }) => /CBODY_(216|193|215|139)_restyle\.png/.test(path)),
      'candidate must not serve held secondary body variants from the runtime package');
    await verifyCombatPlayerArtSwitch(candidatePage, { p1: fourth.frames[0].opaqueSamples, p2: third.frames[0].opaqueSamples,
      p3: added.frames[0].opaqueSamples, p4: third.frames[0].opaqueSamples,
      p5: original.frames[0].opaqueSamples, p6: original.frames[0].opaqueSamples });
    await candidatePage.close();
  }
  assert.ok(!artPaths.some((path) => /CBODY_(216|193|215|139)_restyle\.png/.test(path)),
    'the runtime loader must never request held secondary body Restyles, including retries and mode cycles');
  console.log('PASS cok-player-appearance: 20 packaged files (12 DOS originals + 8 admitted Restyles), package validation negatives, 6 explicit tuples / 4 identities, eight DOS source goldens including 10-row-head rows8-9, source-mask and opaque-black controls, four secondary Restyle holds with exact DOS fallback and no requests, slot alias, invalid tuples, admitted hash/geometry/missing controls, synthetic SAV reorder/app-save, creator choices/neutral colors/legacy fallback/copy independence/rerenders/stale dual preview, four side-by-side dual-variant mode cycles with exact restoration, primary body/head failures and explicit retry, sheet mode cycle, created diagnostic-combat player binding and player-tile DOS/Restyle/DOS restoration');
} finally {
  await browser?.close();
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((done) => server.once('exit', done));
  }
  const rel = relative(tmpdir(), temporary);
  assert.ok(rel.startsWith('greybox-cok-player-') && !rel.includes(sep), `Refusing unsafe temporary cleanup: ${temporary}`);
  rmSync(temporary, { recursive: true });
}
