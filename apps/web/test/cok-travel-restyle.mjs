// Bounded CoK BIGPIC1#121 acceptance. Existing external art, synthetic browser state, no retail saves.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import puppeteer from 'puppeteer-core';
import { bundleCokTravelRestyle } from '../scripts/bundle-cok-travel-restyle.mjs';
import manifest from '../src/ui/cokTravelRestyleManifest.json' with { type: 'json' };

const WEB = fileURLToPath(new URL('../', import.meta.url));
const GALLERY = resolve(WEB, '../../renders/restyle-site/restyle');
const SOURCE = resolve(process.env.GB_COK_RESTYLE_SOURCE ?? 'C:/GoldBoxImg/cok_restyle_work/done');
const art = readFileSync(join(SOURCE, manifest.restyle.file));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(art), manifest.restyle.sha256);
const temporary = mkdtempSync(join(tmpdir(), 'greybox-cok-travel-'));
let browser, server, base;
let fault = null;
let delayed = null;
let requests = 0;
const expectedSource = { game: 'cok', system: 'DOS-EGA', archive: 'BIGPIC1.DAX',
  archiveSha256: manifest.archiveSha256, blockId: 121, frameIndex: 0, blockSha256: manifest.blockSha256 };
async function page() {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().includes('/restyle/cok/travel/BIGPIC1_121_restyle.png')) {
      requests++;
      const bytes = Buffer.from(art);
      if (fault === 'hash') bytes[bytes.length - 1] ^= 1;
      if (fault === 'geometry') bytes.writeUInt32BE(1215, 16);
      const respond = () => request.respond(fault === 'missing' ? { status: 404, body: 'missing' }
        : { status: 200, contentType: 'image/png', body: bytes });
      if (fault === 'delay') delayed = respond;
      else void respond();
    } else void request.continue();
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.clear();
    localStorage.setItem('greybox.graphics.cok', 'DOS-EGA');
    window.artBitmapsOpen = 0;
    const create = window.createImageBitmap;
    window.createImageBitmap = async (...args) => {
      const bitmap = await create(...args); window.artBitmapsOpen++;
      const close = bitmap.close.bind(bitmap);
      bitmap.close = () => { window.artBitmapsOpen--; close(); }; return bitmap;
    };
  });
  return page;
}
async function openTravel(page) {
  await page.goto(`${base}/?explore=cok-natural-6`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('window.__explore?.openTravel', { timeout: 45000 });
  assert.equal(await page.evaluate('window.__explore.openTravel()'), 570);
  await page.waitForFunction('window.__cokTravel?.open?.()');
  assert.deepEqual(await page.evaluate('window.__cokTravel.pictureSource()'), expectedSource);
}
async function mode(page, selected) {
  await page.evaluate(async (selected) => (await import('/src/ui/runtimeGraphicsMode.ts')).writeRuntimeGraphicsMode('cok', selected), selected);
}
async function ready(page, dialogue = false) {
  await page.waitForFunction((dialogue) => document.querySelector(dialogue ? '.gb-dlg-art-status' : '.cok-travel-art-status')
    ?.textContent.includes('Restyle (reviewed'), {}, dialogue);
}
async function townNames(page, visible) {
  const input = page.locator('.gb-cok-travel-names-toggle input, .gb-dlg-town-names-toggle input').last();
  await input.setChecked(visible);
}
async function snapshot(page, dialogue = false, store = false) {
  return page.evaluate(async ({ dialogue, store }) => {
    // Let the surface's ResizeObserver finish any layout change before comparing pixels.
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const seam = dialogue ? window.__dialogue : window.__cokTravel;
    const canvas = document.querySelector(dialogue ? '.gb-dlg-panel-native canvas' : '.cok-travel-panel canvas');
    const context = canvas.getContext('2d'); const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const rect = seam.displayRect(), dpr = devicePixelRatio || 1;
    const point = (x, y) => ({ x: Math.floor((rect.x + x * rect.width / 320) * dpr), y: Math.floor((rect.y + y * rect.height / 200) * dpr) });
    const first = point(8, 8), last = point(312, 128);
    const hash = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('');
    const position = window.__cokTravel?.position() ?? { x: 1, y: 3 };
    const cursor = [];
    for (let d = 0; d < 8; d++) for (const [x, y] of [[d, 0], [d, 7], [0, d], [7, d]]) {
      const p = point(8 + position.x * 8 + x + .5, 8 + position.y * 8 + y + .5);
      cursor.push([...context.getImageData(p.x, p.y, 1, 1).data]);
    }
    let outsideDifferences = 0;
    if (store) window.beforeTravel = { pixels, width: canvas.width, height: canvas.height, first, last };
    else if (window.beforeTravel) {
      const before = window.beforeTravel;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (x >= before.first.x && x <= before.last.x && y >= before.first.y && y <= before.last.y) continue;
        const offset = (y * canvas.width + x) * 4;
        if (pixels.slice(offset, offset + 4).some((v, c) => v !== before.pixels[offset + c])) outsideDifferences++;
      }
    }
    return { hash: await hash(pixels), map: await hash(context.getImageData(first.x, first.y, last.x - first.x, last.y - first.y).data),
      state: { position, memory: window.__cokTravel?.memorySnapshot(), clock: window.__cokTravel?.clockMinutes(),
        party: localStorage.getItem('greybox.party.cok'), text: dialogue ? seam.text() : null, choices: dialogue ? seam.choices() : null,
        source: seam.pictureSource() }, cursor, outsideDifferences };
  }, { dialogue, store });
}
async function cycle(page, dialogue = false) {
  await mode(page, 'DOS-EGA'); const dos = await snapshot(page, dialogue, true);
  await mode(page, 'Restyle'); await ready(page, dialogue); const restyle = await snapshot(page, dialogue);
  assert.notEqual(restyle.map, dos.map); assert.notEqual(restyle.hash, dos.hash);
  assert.equal(restyle.outsideDifferences, 0, 'Replacement must remain inside the exact304x120 map rectangle');
  assert.deepEqual(restyle.state, dos.state, 'Graphics must preserve cursor, memory, clock, party and ECL turn');
  assert.ok(restyle.cursor.every((rgba) => JSON.stringify(rgba) === '[255,255,255,255]'), 'All hollow cursor borders must remain white above Restyle');
  await mode(page, 'Amiga');
  await page.waitForFunction((dialogue) => document.querySelector(dialogue ? '.gb-dlg-art-status' : '.cok-travel-art-status')
    ?.textContent.includes('town names shown'), {}, dialogue);
  const amiga = await snapshot(page, dialogue);
  assert.notEqual(amiga.hash, dos.hash, 'Source-admitted Amiga map must display the embedded town names');
  await townNames(page, false);
  await page.waitForFunction((dialogue) => document.querySelector(dialogue ? '.gb-dlg-art-status' : '.cok-travel-art-status')
    ?.textContent.includes('Town names hidden'), {}, dialogue);
  assert.equal((await snapshot(page, dialogue)).hash, dos.hash, 'Hiding town names selects the aligned unnamed DOS map');
  await townNames(page, true);
  await page.waitForFunction((dialogue) => document.querySelector(dialogue ? '.gb-dlg-art-status' : '.cok-travel-art-status')
    ?.textContent.includes('town names shown'), {}, dialogue);
  assert.equal((await snapshot(page, dialogue)).hash, amiga.hash, 'Showing town names restores the exact Amiga map');
  await mode(page, 'DOS-EGA'); const restored = await snapshot(page, dialogue);
  assert.equal(restored.hash, dos.hash); assert.deepEqual(restored.state, dos.state);
  return { dos, restyle };
}
try {
  const output = join(temporary, 'package'); mkdirSync(output);
  mkdirSync(join(output, 'restyle'));
  for (const name of ['manifest.json', 'fidelity.json']) copyFileSync(join(GALLERY, name), join(output, 'restyle', name));
  const target = bundleCokTravelRestyle(SOURCE, output);
  assert.equal(sha(readFileSync(target)), manifest.restyle.sha256);
  const packaged = readdirSync(output, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
  assert.equal(packaged.length, 5);
  const galleryManifest = JSON.parse(readFileSync(join(output, 'restyle/manifest.json'), 'utf8'));
  const galleryFidelity = JSON.parse(readFileSync(join(output, 'restyle/fidelity.json'), 'utf8'));
  assert.equal(galleryManifest.items.length, 74);
  assert.equal(galleryManifest.items.at(-1).id, 'cok_overland_bigpic1_121');
  assert.equal(galleryFidelity.results.length, 74);
  const rejected = join(temporary, 'rejected'); mkdirSync(rejected);
  const copyRoot = join(temporary, 'source'); mkdirSync(join(copyRoot, 'done'), { recursive: true });
  mkdirSync(join(copyRoot, 'dos_render_all/BIGPIC1'), { recursive: true });
  copyFileSync(join(SOURCE, '..', manifest.source.file), join(copyRoot, manifest.source.file));
  copyFileSync(join(SOURCE, manifest.restyle.file), join(copyRoot, 'done', manifest.restyle.file));
  for (const [file, pin] of [[manifest.source.file, manifest.source.sha256], [`done/${manifest.restyle.file}`, manifest.restyle.sha256]]) {
    const path = join(copyRoot, file), original = readFileSync(path), bad = Buffer.from(original); bad[bad.length - 1] ^= 1; writeFileSync(path, bad);
    assert.throws(() => bundleCokTravelRestyle(join(copyRoot, 'done'), rejected), /SHA-256 differs/);
    assert.deepEqual(readdirSync(rejected), []); writeFileSync(path, original); assert.equal(sha(original), pin);
  }
  const probe = net.createServer(); await new Promise((done) => probe.listen(0, '127.0.0.1', done));
  const port = probe.address().port; await new Promise((done) => probe.close(done)); base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: WEB, stdio: 'pipe' });
  let log = ''; for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { log += chunk; });
  for (let i = 0; i < 120; i++) { if (server.exitCode !== null) throw new Error(log); try { if ((await fetch(base)).ok) break; } catch {} await new Promise((done) => setTimeout(done, 100)); }
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const natural = await page(); await openTravel(natural);
  const requestStart = requests;
  const original = await snapshot(natural);
  await natural.evaluate(() => window.dispatchEvent(new CustomEvent('goldbox:graphics-mode', { detail: { gameId: 'cok-natural-6', mode: 'Restyle' } })));
  assert.equal((await snapshot(natural)).hash, original.hash); assert.equal(requests, requestStart, 'Only canonicalcok mode events apply');
  await cycle(natural);
  assert.deepEqual(await natural.evaluate('window.__cokTravel.position()'), { x: 1, y: 3 });
  assert.equal((await natural.evaluate('window.__cokTravel.coordinates()')).length, 10);
  await mode(natural, 'Restyle'); await ready(natural);
  assert.equal(await natural.evaluate('window.__cokTravel.beginMove(); window.__cokTravel.move("east")'), true);
  await natural.waitForFunction('window.__dialogue?.open?.()');
  assert.match(await natural.evaluate('window.__dialogue.text()'), /CARAVAN\s+UNDER\s+ATTACK/i);
  assert.deepEqual(await natural.evaluate('window.__cokTravel.position()'), { x: 2, y: 3 });
  assert.equal(await natural.evaluate('window.__dialogue.pictureId()'), 114, 'The initial caravan scene remains its actual BIGPIC1#114');
  const caravan = await snapshot(natural, true);
  await mode(natural, 'DOS-EGA'); assert.equal((await snapshot(natural, true)).hash, caravan.hash);
  await mode(natural, 'Restyle'); assert.equal((await snapshot(natural, true)).hash, caravan.hash);
  await natural.evaluate('window.__dialogue.choose(0)');
  await natural.waitForFunction('window.__combat?.forcePartyVictory', { timeout: 45000 });
  await natural.evaluate('window.__combat.forcePartyVictory()');
  await natural.evaluate('window.__combat.declineContinueBattle(); window.__combat.acknowledgeVictory()');
  await natural.evaluate(() => { if (window.__combat.phase() === 'treasure') { window.__combat.exitTreasure(); if (window.__combat.treasureExitPending()) window.__combat.declineRemainingTreasure(); } window.__combat.dismiss(); });
  await natural.waitForFunction('window.__dialogue?.pictureId?.() === 121 && !window.__dialogue.awaitingCombat()');
  assert.match(await natural.evaluate('window.__dialogue.text()'), /CARAVAN\s+LIES\s+IN\s+WASTE/i);
  await cycle(natural, true);
  await natural.evaluate('window.__dialogue.choose(0)');
  await natural.waitForFunction('window.__dialogue.pictureId() === 18');
  const beforeUnmapped = await snapshot(natural, true); await mode(natural, 'Restyle');
  assert.equal((await snapshot(natural, true)).hash, beforeUnmapped.hash, 'PIC1#18 remains original');
  await natural.close();

  // Real decoded source admission and independent exact identity fallback controls.
  const controls = await page(); await openTravel(controls);
  const admission = await controls.evaluate(async () => {
    const engine = await import('/@fs/C:/Modding/GoldBox/packages/engine/src/index.ts');
    const module = await import('/src/ui/cokTravelArt.ts'); const catalog = await import('/src/ui/catalog.ts');
    const bytes = new Uint8Array(await (await fetch(catalog.assetUrl('Champions of Krynn/BIGPIC1.DAX'))).arrayBuffer());
    const block = engine.decodeDax(bytes, 'BIGPIC1.DAX').blocks.find((b) => b.blockId === 121);
    const good = await module.validateCokTravelSource(module.COK_TRAVEL_SOURCE.archiveSha256, block.raw, block.image);
    const raw = block.raw.slice(); raw[raw.length - 1] ^= 1;
    const indices = block.image.indices.slice(); indices[0] ^= 1;
    const negatives = await Promise.all([
      module.validateCokTravelSource('0'.repeat(64), block.raw, block.image), module.validateCokTravelSource(module.COK_TRAVEL_SOURCE.archiveSha256, raw, block.image),
      module.validateCokTravelSource(module.COK_TRAVEL_SOURCE.archiveSha256, block.raw, { ...block.image, indices }),
      module.validateCokTravelSource(module.COK_TRAVEL_SOURCE.archiveSha256, block.raw, { ...block.image, xOffset: 1 }),
      module.validateCokTravelSource(module.COK_TRAVEL_SOURCE.archiveSha256, block.raw, { ...block.image, width: 303 }),
    ]);
    const dialogue = await import('/src/ui/dialogue.ts');
    window.openControl = (identity) => {
      const runner = new engine.DialogueRunner({ run: () => ({ status: 'exited', effects: [] }), resume: () => ({ status: 'exited', effects: [] }) });
      localStorage.setItem('greybox.graphics.cok', 'Restyle');
      dialogue.openDialogueAt(runner, { kind: 'end', text: 'Identity control', pictureId: 121 }, { presentation: {
        pictures: new Map([[121, block.image]]), pictureSources: identity ? new Map([[121, identity]]) : new Map(),
        sceneArts: [module.cokTravelSceneArt(() => ({ x: 1, y: 3 }))], screenOverlay: (fb) => module.paintCokTravelCursor(fb, 1, 3),
      } });
    }; return { good, negatives };
  });
  assert.equal(admission.good, true); assert.deepEqual(admission.negatives, [false, false, false, false, false]);
  const beforeControls = requests;
  for (const wrong of [null, { ...expectedSource, game: 'dok' }, { ...expectedSource, system: 'Amiga' }, { ...expectedSource, archive: 'PIC1.DAX' },
    { ...expectedSource, archiveSha256: '0'.repeat(64) }, { ...expectedSource, blockId: 120 }, { ...expectedSource, frameIndex: 1 },
    { ...expectedSource, blockSha256: '0'.repeat(64) }, { ...expectedSource, blockSha256: undefined }]) {
    await controls.evaluate((identity) => window.openControl(identity), wrong); const fallback = await snapshot(controls, true);
    await mode(controls, 'DOS-EGA'); assert.equal((await snapshot(controls, true)).hash, fallback.hash);
  }
  assert.equal(requests, beforeControls);
  // Exact121 requests cannot overwrite a replacement dialogue or a closed panel.
  for (const closeView of [false, true]) {
    fault = 'delay'; delayed = null;
    await controls.evaluate((identity) => window.openControl(identity), expectedSource);
    for (let i = 0; i < 200 && !delayed; i++) await new Promise((done) => setTimeout(done, 25));
    assert.ok(delayed);
    if (closeView) await controls.evaluate('window.__dialogue.close()');
    else await controls.evaluate((identity) => window.openControl(identity), { ...expectedSource, blockSha256: undefined });
    const before = closeView ? null : await snapshot(controls, true);
    fault = null; await delayed(); await controls.waitForNetworkIdle();
    if (closeView) assert.equal(await controls.$('.gb-dlg-panel-native'), null);
    else assert.equal((await snapshot(controls, true)).hash, before.hash, 'Late121 art must not overwrite a replacement dialogue');
    assert.equal(await controls.evaluate('window.artBitmapsOpen'), 0);
  }
  await controls.close();

  for (const action of ['mode', 'close', 'remount']) {
    const delayedPage = await page(); await openTravel(delayedPage); fault = 'delay'; delayed = null;
    await mode(delayedPage, 'Restyle');
    for (let i = 0; i < 200 && !delayed; i++) await new Promise((done) => setTimeout(done, 25));
    assert.ok(delayed);
    if (action === 'mode') await mode(delayedPage, 'DOS-EGA');
    else await delayedPage.evaluate('window.__cokTravel.close()');
    if (action === 'remount') { await mode(delayedPage, 'DOS-EGA'); await delayedPage.evaluate('window.__explore.openTravel()'); }
    const before = action === 'close' ? null : await snapshot(delayedPage);
    fault = null; await delayed(); await delayedPage.waitForNetworkIdle();
    if (action === 'close') assert.equal(await delayedPage.$('.cok-travel-panel'), null);
    else assert.equal((await snapshot(delayedPage)).hash, before.hash, `Late request must not repaint after ${action}`);
    assert.equal(await delayedPage.evaluate('window.artBitmapsOpen'), 0); await delayedPage.close();
  }
  for (const kind of ['missing', 'hash', 'geometry']) {
    const bad = await page(); await openTravel(bad); const original = await snapshot(bad); fault = kind;
    await mode(bad, 'Amiga');
    await bad.click('.cok-travel-panel [data-art-mode="Restyle"]');
    await bad.waitForFunction('document.querySelector(".cok-travel-art-status")?.textContent.includes("unavailable")');
    const failed = await snapshot(bad);
    assert.equal(failed.hash, original.hash); assert.deepEqual(failed.state, original.state);
    const preferences = () => bad.evaluate(() => [localStorage.getItem('greybox.graphics.cok'), localStorage.getItem('greybox.graphics-fallback.cok')]);
    assert.deepEqual(await preferences(), ['Restyle', 'Amiga']);
    const failedRequests = requests; await bad.waitForNetworkIdle();
    assert.equal(requests, failedRequests, 'A failed map must await an explicit retry');
    fault = null; await bad.click('.cok-travel-panel [data-art-mode="Restyle"]'); await ready(bad);
    assert.equal(requests, failedRequests + 1, 'Explicit Restyle selection retries exactly once');
    assert.deepEqual(await preferences(), ['Restyle', 'Amiga']);
    const recovered = await snapshot(bad); assert.notEqual(recovered.hash, original.hash); assert.deepEqual(recovered.state, original.state);
    await mode(bad, 'DOS-EGA'); assert.equal((await snapshot(bad)).hash, original.hash);
    assert.equal(await bad.evaluate('window.artBitmapsOpen'), 0); await bad.close();
  }
  console.log('PASS cok-travel-restyle: exact archive/raw/indices admission; one pinned PNG/package negatives; real direct map and caravan dialogue/combat return; DOS/Restyle/Amiga source selection, town-name toggle, map-only pixels, hollow cursor, invariant state, source negatives, stale mode/close/remount, bad-image recovery and closed bitmaps.');
} finally {
  await browser?.close(); if (server && server.exitCode === null) { server.kill(); await new Promise((done) => server.once('exit', done)); }
  const rel = relative(tmpdir(), temporary); assert.ok(rel.startsWith('greybox-cok-travel-') && !rel.includes(sep)); rmSync(temporary, { recursive: true });
}
