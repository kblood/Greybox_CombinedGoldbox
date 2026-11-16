// Exact-source DOS PIC1#57 admission on the real bounded landmark arrival path.
// Art is served from the reviewed external holding by this test; no public scratch is modified.
import assert from 'node:assert/strict';
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { bundleCokDialogueRestyle } from '../scripts/bundle-cok-dialogue-restyle.mjs';
import puppeteer from 'puppeteer-core';

const art = readFileSync('C:/GoldBoxImg/cok_restyle_work/done/PIC1_057_f0_restyle.png');
assert.equal(createHash('sha256').update(art).digest('hex'), 'a2d2126c903d61afa46085693e9decfd08b789f33c96fba0292b6bda73441cbe');
const art58 = readFileSync('C:/GoldBoxImg/batch03_work/pic1_058_restyle_candidate_v2_import.png');
assert.equal(createHash('sha256').update(art58).digest('hex'), '8fc50df402ea2f44001312e1556445ad7ac45a12506be60920e565232657dceb');
const amigaArt57 = readFileSync('C:/GoldBoxImg/batch03_work/cok-runtime-site-candidate-amiga18-preserved-20261027/restyle/out/043_cok_amiga_daa_cok_pic1_pic1_057_f0.png');
assert.equal(createHash('sha256').update(amigaArt57).digest('hex'), '193e7af3ecc3591f2564cb9e59d2c9bd30d68add82c88819f1db6fb84fb57176');
const amigaDaa = readFileSync('C:/GoldBoxImg/batch03_work/cok-runtime-site-candidate-amiga18-preserved-20261027/assets/amiga_extracted/ChampionsOfKrynn/disk2/pic1.daa');
assert.equal(createHash('sha256').update(amigaDaa).digest('hex'), 'b3512ed6a030ac27538ae66f6115bdf0bf1f5a78e63eba0d32fef3e32b049687');
const source = { game: 'cok', system: 'DOS-EGA', archive: 'PIC1.DAX',
  archiveSha256: '2f62dab8b7f776226d6c6c35847382de3baa758a836220639d2c46c2dd74ae97', blockId: 57, frameIndex: 0 };
const source58 = { ...source, blockId: 58 };
const temporary = mkdtempSync(join(tmpdir(), 'greybox-cok-dialogue-'));
const externalBase = process.env.GB_COK_DIALOGUE_BASE_URL?.replace(/\/$/, '') ?? null;
let server;
let staticServer;
let browser;
let base;
let delayed;
let delayArt = null;
let delayAmiga57 = false;
let corruptAmiga57 = false;
let corruptArt = null;
let missingArt = null;
let geometryArt = null;
let requests = 0;
const requestsByPicture = { 57: 0, 58: 0 };
let amiga57Requests = 0;
const distRoot = process.env.GB_COK_DIALOGUE_DIST_DIR ? resolve(process.env.GB_COK_DIALOGUE_DIST_DIR) : null;

async function snapshot(page, saveAs) {
  return page.evaluate(async (saveAs) => {
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const canvas = document.querySelector('.gb-dlg-panel-native canvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const rect = window.__dialogue.displayRect();
    const dpr = devicePixelRatio || 1;
    const left = Math.floor((rect.x + 24 * rect.width / 320) * dpr);
    const top = Math.floor((rect.y + 24 * rect.height / 200) * dpr);
    const right = Math.ceil((rect.x + 112 * rect.width / 320) * dpr);
    const bottom = Math.ceil((rect.y + 112 * rect.height / 200) * dpr);
    const crop = canvas.getContext('2d').getImageData(left, top, right - left, bottom - top).data;
    const hash = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
      (byte) => byte.toString(16).padStart(2, '0')).join('');
    if (saveAs) window[saveAs] = { pixels, width: canvas.width, height: canvas.height, left, top, right, bottom };
    return { id: window.__dialogue.pictureId(), source: window.__dialogue.pictureSource(),
      text: window.__dialogue.text(), choices: window.__dialogue.choices(),
      portraitHash: await hash(crop), screenHash: await hash(pixels),
      memory: window.__cokThrotl ? [0x4c26, 0x4c28, 0x4c29, 0x4c37].map((address) => window.__cokThrotl.areaMemory(address)) : null,
      campaign: window.__cokThrotl ? Array.from({ length: 1024 }, (_, i) => window.__cokThrotl.areaMemory(0x4b00 + i)) : null,
      clock: window.__cokThrotl?.clockMinutes(),
      persistent: Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.startsWith('greybox.graphics'))) };
  }, saveAs);
}

async function newPage() {
  const page = await browser.newPage();
  if (!distRoot && !externalBase) {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (/ChampionsOfKrynn\/disk2\/pic1\.daa(?:\?|$)/i.test(request.url())) {
        void request.respond({ status: 200, contentType: 'application/octet-stream', body: amigaDaa });
        return;
      }
      if (/\/restyle\/cok\/dialogue\/AMIGA_PIC1_057_f0_restyle\.png(?:\?|$)/.test(request.url())) {
        amiga57Requests++;
        const bytes = Buffer.from(amigaArt57);
        if (corruptAmiga57) bytes[bytes.length - 1] ^= 1;
        const respond = () => request.respond({ status: 200, contentType: 'image/png', body: bytes });
        if (delayAmiga57) delayed = respond;
        else void respond();
        return;
      }
      const matched = request.url().match(/\/restyle\/cok\/dialogue\/PIC1_(057|058)_f0_restyle\.png/);
      if (matched) {
        const pictureId = Number(matched[1]);
        requests++;
        requestsByPicture[pictureId]++;
        const bytes = Buffer.from(pictureId === 58 ? art58 : art);
        if (corruptArt === pictureId) bytes[bytes.length - 1] ^= 1;
        if (geometryArt === pictureId) bytes.writeUInt32BE(1, 16);
        const respond = () => request.respond(missingArt === pictureId ? { status: 404, body: 'missing' }
          : { status: 200, contentType: 'image/png', body: bytes });
        if (delayArt === pictureId) delayed = respond;
        else void respond();
      } else void request.continue();
    });
  }
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('greybox.graphics.cok', 'DOS-EGA');
    window.artBitmapsOpen = 0;
    const create = window.createImageBitmap;
    window.createImageBitmap = async (...args) => {
      const bitmap = await create(...args); window.artBitmapsOpen++;
      const close = bitmap.close.bind(bitmap); bitmap.close = () => { window.artBitmapsOpen--; close(); }; return bitmap;
    };
  });
  return page;
}

async function openLandmark(page) {
  await page.goto(`${base}/?explore=cok-natural-6`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('window.__explore?.openTravel', { timeout: 45000 });
  await page.evaluate('window.__explore.openTravel()');
  await page.waitForFunction('window.__cokTravel?.open?.()', { timeout: 45000 });
  await page.evaluate('window.__cokTravel.choose(3)');
  await page.waitForFunction('window.__dialogue?.open?.()', { timeout: 45000 });
  assert.deepEqual(await page.evaluate('window.__dialogue.choices()'), ['YES', 'NO']);
  await page.evaluate('window.__dialogue.choose(0)');
  await page.waitForFunction('window.__cokThrotl && window.__dialogue?.pictureId?.() === 57', { timeout: 45000 });
  for (let i = 0; i < 12 && !(await page.evaluate('window.__dialogue.choices().length')); i++) await page.evaluate('window.__dialogue.choose(0)');
  const actual = await snapshot(page);
  assert.equal(actual.id, 57);
  assert.deepEqual(actual.source, source);
  assert.deepEqual(actual.memory, [1, 7, 0x13, 0]);
  assert.match(actual.text, /AND NERAKA/i);
  return actual;
}

async function waitRestyle(page) {
  try { await page.waitForFunction('document.querySelector(".gb-dlg-art-status")?.textContent.includes("Restyle (reviewed picture only)")'); }
  catch (error) {
    console.error('[cok-dialogue-restyle] Restyle wait failed:', await page.evaluate(() => ({
      status: document.querySelector('.gb-dlg-art-status')?.textContent,
      picture: window.__dialogue?.pictureId?.(), source: window.__dialogue?.pictureSource?.(),
      requests: performance.getEntriesByType('resource').filter((entry) => /restyle\/cok\/dialogue|pic1\.daa/i.test(entry.name)).map((entry) => entry.name),
    })));
    throw error;
  }
}

async function assertRestylePreference(page) {
  assert.deepEqual(await page.evaluate(() => [localStorage.getItem('greybox.graphics.cok'),
    localStorage.getItem('greybox.graphics-fallback.cok'),
    document.querySelector('[data-art-mode=restyle]')?.getAttribute('aria-pressed')]), ['Restyle', 'Amiga', 'true']);
}

async function advanceToChoice(page) {
  for (let step = 0; step < 12; step++) {
    if (await page.evaluate('window.__dialogue.choices().length > 0')) return;
    await page.evaluate('window.__dialogue.choose(0)');
  }
  throw new Error('Expected landmark Continue/destination choices were not reached');
}

try {
  // Exact accepted import and original57 are both validated before any output is copied.
  const packageRoot = join(temporary, 'package'); mkdirSync(packageRoot);
  bundleCokDialogueRestyle(undefined, packageRoot);
  const staged = readdirSync(join(packageRoot, 'restyle/cok/dialogue')).sort();
  assert.deepEqual(staged, ['PIC1_015_f0_restyle.png', 'PIC1_057_f0_restyle.png', 'PIC1_058_f0_restyle.png']);
  assert.equal(createHash('sha256').update(readFileSync(join(packageRoot, 'restyle/cok/dialogue/PIC1_058_f0_restyle.png'))).digest('hex'), '8fc50df402ea2f44001312e1556445ad7ac45a12506be60920e565232657dceb');
  const badCopy = join(temporary, 'bad58.png'); const corruptCopy = Buffer.from(art58); corruptCopy[corruptCopy.length - 1] ^= 1; writeFileSync(badCopy, corruptCopy);
  const rejected = join(temporary, 'rejected'); mkdirSync(rejected);
  assert.throws(() => bundleCokDialogueRestyle(undefined, rejected, badCopy), /SHA-256 differs/);
  assert.deepEqual(readdirSync(rejected), []);
  if (externalBase) {
    base = externalBase;
  } else {
    const probe = net.createServer();
    await new Promise((done) => probe.listen(0, '127.0.0.1', done));
    const port = probe.address().port;
    await new Promise((done) => probe.close(done));
    base = `http://127.0.0.1:${port}`;
    if (distRoot) {
    const mime = new Map([['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
      ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png']]);
    staticServer = createServer((request, response) => {
      const rel = decodeURIComponent((request.url ?? '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const path = normalize(resolve(distRoot, rel));
      if (path !== distRoot && !path.startsWith(`${distRoot}${sep}`)) {
        response.writeHead(400).end('Bad path');
        return;
      }
      if (!existsSync(path) || !statSync(path).isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.setHeader('Content-Type', mime.get(extname(path).toLowerCase()) ?? 'application/octet-stream');
      createReadStream(path).pipe(response);
    });
    await new Promise((done) => staticServer.listen(port, '127.0.0.1', done));
    } else {
      server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
      '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'pipe' });
    let log = '';
    for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { log += chunk; });
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null) throw new Error(`Owned Vite server exited: ${log}`);
      try { ready = (await fetch(base)).ok && log.includes(`127.0.0.1:${port}`); } catch { /* starting */ }
      if (ready) break;
      await new Promise((done) => setTimeout(done, 100));
    }
      assert.ok(ready, log);
    }
  }
  browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  const page = await newPage();
  const original = await openLandmark(page);
  await snapshot(page, 'beforePortrait');
  await page.click('[data-art-mode=restyle]');
  await waitRestyle(page);
  const restyle = await snapshot(page);
  assert.notEqual(restyle.portraitHash, original.portraitHash);
  assert.deepEqual({ ...restyle, portraitHash: '', screenHash: '' }, { ...original, portraitHash: '', screenHash: '' });
  const outsideDifferences = await page.evaluate(() => {
    const before = window.beforePortrait;
    const canvas = document.querySelector('.gb-dlg-panel-native canvas');
    const after = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let differences = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (x >= before.left && x < before.right && y >= before.top && y < before.bottom) continue;
      const offset = (y * canvas.width + x) * 4;
      if (after[offset] !== before.pixels[offset] || after[offset + 1] !== before.pixels[offset + 1]
          || after[offset + 2] !== before.pixels[offset + 2] || after[offset + 3] !== before.pixels[offset + 3]) differences++;
    }
    return differences;
  });
  assert.equal(outsideDifferences, 0, 'Restyle must stay inside the original 88×88 portrait rectangle');
  await page.click('[data-art-mode=DOS-EGA]');
  assert.deepEqual(await snapshot(page), original, 'DOS must restore the original pixels and all ECL state');
  await page.click('[data-art-mode=Amiga]');
  await page.waitForFunction(() => {
    const status = document.querySelector('.gb-dlg-art-status')?.textContent ?? '';
    return status.includes('Amiga') && !status.includes('loading') && !status.includes('unavailable');
  });
  const amiga57 = await snapshot(page);
  assert.notEqual(amiga57.portraitHash, original.portraitHash,
    'Amiga mode must load the source-admitted Amiga PIC1.DAA#57 picture');
  assert.deepEqual({ ...amiga57, portraitHash: '', screenHash: '' }, { ...original, portraitHash: '', screenHash: '' },
    'Amiga mode may change only the portrait, not ECL/campaign state');
  await page.click('[data-art-mode=restyle]');
  await page.waitForFunction('document.querySelector(".gb-dlg-art-status")?.textContent.includes("Restyle (reviewed picture only)")');
  const amigaRestyle57 = await snapshot(page);
  assert.notEqual(amigaRestyle57.portraitHash, amiga57.portraitHash,
    'Restyle mode must render the reviewed Amiga #57 output');
  assert.deepEqual({ ...amigaRestyle57, portraitHash: '', screenHash: '' }, { ...original, portraitHash: '', screenHash: '' },
    'Amiga Restyle may change only the portrait, not ECL/campaign state');
  const amigaOutsideDifferences = await page.evaluate(() => {
    const before = window.beforePortrait, canvas = document.querySelector('.gb-dlg-panel-native canvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let differences = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (x >= before.left && x < before.right && y >= before.top && y < before.bottom) continue;
      const offset = (y * canvas.width + x) * 4;
      if (pixels.slice(offset, offset + 4).some((value, channel) => value !== before.pixels[offset + channel])) differences++;
    }
    return differences;
  });
  assert.equal(amigaOutsideDifferences, 0, 'Amiga Restyle must stay inside the original 88×88 portrait rectangle');
  await page.click('[data-art-mode=DOS-EGA]');
  assert.deepEqual(await snapshot(page), original, 'DOS mode must restore exact PIC1#57 pixels after Amiga and Restyle');
  await page.click('[data-art-mode=restyle]');
  await waitRestyle(page);
  await page.evaluate('window.__dialogue.choose(0)');
  await advanceToChoice(page);
  const continued = await snapshot(page);
  assert.equal(continued.id, 57, 'Continue without PICTURE retains the selected source');
  assert.equal(continued.portraitHash, restyle.portraitHash);
  assert.deepEqual(continued.source, source);
  await page.evaluate('window.__dialogue.choose(0)');
  await advanceToChoice(page);
  await page.waitForFunction('window.__dialogue.pictureId() === 58');
  await page.click('[data-art-mode=DOS-EGA]');
  const original58 = await snapshot(page, 'beforePortrait');
  assert.deepEqual(original58.source, source58);
  await page.click('[data-art-mode=restyle]'); await waitRestyle(page);
  const restyle58 = await snapshot(page);
  assert.notEqual(restyle58.portraitHash, original58.portraitHash, 'Actual retail58 must render its admitted Restyle');
  assert.notEqual(restyle58.portraitHash, restyle.portraitHash, '57 and58 must retain separate cache identities');
  assert.deepEqual({ ...restyle58, portraitHash: '', screenHash: '' }, { ...original58, portraitHash: '', screenHash: '' });
  const outside58 = await page.evaluate(() => {
    const before = window.beforePortrait, canvas = document.querySelector('.gb-dlg-panel-native canvas');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let differences = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (x >= before.left && x < before.right && y >= before.top && y < before.bottom) continue;
      const offset = (y * canvas.width + x) * 4;
      if (pixels.slice(offset, offset + 4).some((v, c) => v !== before.pixels[offset + c])) differences++;
    }
    return differences;
  });
  assert.equal(outside58, 0, '58 replacement remains inside the original88x88 rectangle');
  await page.evaluate(() => { localStorage.setItem('greybox.graphics.cok', 'Amiga'); window.dispatchEvent(new CustomEvent('goldbox:graphics-mode', { detail: { gameId: 'cok', mode: 'Amiga' } })); });
  assert.equal((await snapshot(page)).screenHash, original58.screenHash, '58 has no admitted Amiga art; use DOS fallback');
  await page.click('[data-art-mode=DOS-EGA]');
  assert.deepEqual(await snapshot(page), original58, '58 DOS pixels, memory, party/campaign and ECL turn restore exactly');
  if (!distRoot && !externalBase) assert.ok(requestsByPicture[58] > 0);
  if (!distRoot && !externalBase) assert.ok(amiga57Requests > 0, 'Expected reviewed Amiga PIC1#57 Restyle fetch');
  await page.close();

  // Fresh exact-route sessions prove a late 57 request cannot repaint 58 or a closed view.
  for (const closeView of distRoot || externalBase ? [] : [false, true]) {
    const page = await newPage();
    await openLandmark(page);
    delayAmiga57 = true;
    delayed = null;
    await page.click('[data-art-mode=restyle]');
    for (let i = 0; i < 200 && !delayed; i++) await new Promise((done) => setTimeout(done, 25));
    assert.ok(delayed, 'Expected delayed 57 image request');
    if (closeView) await page.evaluate('window.__dialogue.close()');
    else {
      for (let step = 0; step < 20 && await page.evaluate('window.__dialogue.pictureId() === 57'); step++) {
        await page.evaluate('window.__dialogue.choose(0)');
      }
      await page.waitForFunction('window.__dialogue.pictureId() === 58');
      await waitRestyle(page);
    }
    const before = closeView ? null : await snapshot(page);
    delayAmiga57 = false;
    await delayed();
    await page.waitForNetworkIdle();
    if (closeView) assert.equal(await page.$('.gb-dlg-panel-native'), null);
    else assert.deepEqual(await snapshot(page), before);
    await page.close();
  }

  // Malformed reviewed output fails closed on the real route.
  if (!distRoot && !externalBase) {
    const bad = await newPage();
    await openLandmark(bad);
    await bad.click('[data-art-mode=Amiga]');
    await bad.waitForFunction('document.querySelector(".gb-dlg-art-status")?.textContent.includes("Amiga") && !document.querySelector(".gb-dlg-art-status")?.textContent.includes("loading")');
    const badBefore = await snapshot(bad);
    corruptAmiga57 = true;
    await bad.click('[data-art-mode=restyle]');
    await bad.waitForFunction('document.querySelector(".gb-dlg-art-status")?.textContent.includes("Restyle unavailable")');
    assert.match(await bad.$eval('.gb-dlg-art-status', (element) => element.textContent), /SHA-256 differs/);
    assert.deepEqual(await snapshot(bad), badBefore);
    await assertRestylePreference(bad);
    const failedRequests = amiga57Requests;
    await bad.waitForNetworkIdle();
    assert.equal(amiga57Requests, failedRequests, 'A failed picture must not retry on repaint');
    corruptAmiga57 = false;
    for (let step = 0; step < 24 && await bad.evaluate('window.__dialogue.pictureId() !== 58'); step++) await bad.evaluate('window.__dialogue.choose(0)');
    await waitRestyle(bad);
    assert.equal(await bad.evaluate('window.__dialogue.pictureId()'), 58, 'Another mapped picture must still render Restyle after57 fails');
    await assertRestylePreference(bad);
    await bad.close();
  }

  // New58 loader failures on the same actual retail transition remain original and recover.
  for (const kind of distRoot || externalBase ? [] : ['missing', 'hash', 'geometry']) {
    const bad = await newPage(); await openLandmark(bad);
    for (let step = 0; step < 24 && await bad.evaluate('window.__dialogue.pictureId() !== 58'); step++) await bad.evaluate('window.__dialogue.choose(0)');
    await bad.waitForFunction('window.__dialogue.pictureId() === 58');
    const original58 = await snapshot(bad);
    await bad.evaluate(async () => (await import('/src/ui/runtimeGraphicsMode.ts')).writeRuntimeGraphicsMode('cok', 'Amiga'));
    if (kind === 'missing') missingArt = 58;
    if (kind === 'hash') corruptArt = 58;
    if (kind === 'geometry') geometryArt = 58;
    await bad.click('[data-art-mode=restyle]');
    await bad.waitForFunction('document.querySelector(".gb-dlg-art-status")?.textContent.includes("Restyle unavailable")');
    assert.deepEqual(await snapshot(bad), original58, `58 ${kind} failure must retain exact source pixels/state`);
    await assertRestylePreference(bad);
    const failedRequests = requestsByPicture[58];
    await bad.waitForNetworkIdle();
    assert.equal(requestsByPicture[58], failedRequests, 'A failed picture must await an explicit retry');
    missingArt = corruptArt = geometryArt = null;
    await bad.click('[data-art-mode=restyle]'); await waitRestyle(bad);
    assert.equal(requestsByPicture[58], failedRequests + 1, 'Explicit Restyle selection retries exactly once');
    await assertRestylePreference(bad);
    assert.equal(await bad.evaluate('window.artBitmapsOpen'), 0);
    await bad.close();
  }

  // Controller controls keep the actual portrait, changing only one identity field at a time.
  if (!distRoot && !externalBase) {
    const controls = await newPage();
    await openLandmark(controls);
    const amigaAdmission = await controls.evaluate(async () => {
      const art = await import('/src/ui/cokAmigaPortrait57Art.ts');
      const runtime = await import('/src/ui/cokAmigaPortrait57Runtime.ts');
      const catalog = await import('/src/ui/catalog.ts');
      const url = catalog.assetUrl('amiga_extracted/ChampionsOfKrynn/disk2/pic1.daa');
      const archive = new Uint8Array(await (await fetch(url)).arrayBuffer());
      const exact = await art.admitCokAmigaPortrait57(archive, art.COK_AMIGA_PORTRAIT_57_SOURCE);
      const wrongIdentity = await art.admitCokAmigaPortrait57(archive,
        { ...art.COK_AMIGA_PORTRAIT_57_SOURCE, blockId: 58 });
      const changed = new Uint8Array(archive); changed[changed.length - 1] ^= 1;
      const foreignArchive = await art.admitCokAmigaPortrait57(changed, art.COK_AMIGA_PORTRAIT_57_SOURCE);
      const missingInstall = await runtime.loadCokAmigaPortrait57Source({ readAsset: async () => null });
      const foreignInstall = await runtime.loadCokAmigaPortrait57Source({ readAsset: async () => changed });
      let badPngRejected = false;
      try { await art.validateCokAmigaPortrait57ImportedPng(new Uint8Array([1, 2, 3])); }
      catch { badPngRejected = true; }
      return { exact: exact.ok && exact.original.width === 88 && exact.original.height === 88,
        wrongIdentity: !wrongIdentity.ok, foreignArchive: !foreignArchive.ok,
        missingInstall: !missingInstall.ok && missingInstall.reason.includes('no PIC1.DAA'),
        foreignInstall: !foreignInstall.ok, badPngRejected };
    });
    assert.deepEqual(amigaAdmission, { exact: true, wrongIdentity: true, foreignArchive: true,
      missingInstall: true, foreignInstall: true, badPngRejected: true },
    'Amiga #57 admission must pin exact source identity and fail closed for custom-install/PNG mismatches');
    await controls.evaluate(async () => {
    const engine = await import('/@fs/C:/Modding/GoldBox/packages/engine/src/index.ts');
    const dialogue = await import('/src/ui/dialogue.ts');
    const portrait = await import('/src/ui/cokPortraitArt.ts');
    const catalog = await import('/src/ui/catalog.ts');
    const bytes = new Uint8Array(await (await fetch(catalog.assetUrl('Champions of Krynn/PIC1.DAX'))).arrayBuffer());
    window.controlImages = new Map(engine.decodeDax(bytes, 'PIC1.DAX').blocks.filter((block) => block.image).map((block) => [block.blockId, block.image]));
    window.openControl = (identity, pictureId = 57) => {
      localStorage.setItem('greybox.graphics.cok', 'Restyle');
      const runner = new engine.DialogueRunner({ run: () => ({ status: 'exited', effects: [] }), resume: () => ({ status: 'exited', effects: [] }) });
      dialogue.openDialogueAt(runner, { kind: 'end', text: 'Identity control', pictureId }, {
        presentation: { pictures: window.controlImages, pictureSources: identity ? new Map([[pictureId, identity]]) : new Map(), sceneArts: portrait.cokPortraitSceneArts() },
      });
    };
    });
    const beforeControls = requests;
    for (const target of [source, source58]) for (const wrong of [null, { ...target, game: 'dok' }, { ...target, system: 'Amiga' },
    { ...target, archive: 'PIC2.DAX' }, { ...target, archiveSha256: '0'.repeat(64) },
    { ...target, blockId: target.blockId === 57 ? 58 : 57 }, { ...target, frameIndex: 1 }]) {
      await controls.evaluate(({ identity, id }) => window.openControl(identity, id), { identity: wrong, id: target.blockId });
      const restyle = await snapshot(controls);
      await controls.click('[data-art-mode=DOS-EGA]');
      const original = await snapshot(controls);
      assert.equal(restyle.screenHash, original.screenHash, `Unknown source painted Restyle: ${JSON.stringify(wrong)}`);
    }
    assert.equal(requests, beforeControls, 'Unknown source identities must never fetch the reviewed overlay');
    // PIC1#18 is decoded and source-identified, but deliberately unadmitted.
    await controls.evaluate((identity) => window.openControl(identity, 18), { ...source, blockId: 18 });
    const unmapped = await snapshot(controls);
    await controls.click('[data-art-mode=DOS-EGA]'); assert.equal((await snapshot(controls)).screenHash, unmapped.screenHash);
    assert.equal(requests, beforeControls, 'Unadmitted18 must not fetch portrait art');
    for (const action of ['mode', 'close-reopen', 'source-replacement']) {
      delayArt = 58; delayed = null;
      await controls.evaluate((identity) => window.openControl(identity, 58), source58);
      for (let i = 0; i < 200 && !delayed; i++) await new Promise((done) => setTimeout(done, 25));
      assert.ok(delayed, 'Expected delayed58 image request');
      if (action === 'mode') await controls.click('[data-art-mode=DOS-EGA]');
      else if (action === 'close-reopen') {
        await controls.evaluate('window.__dialogue.close()');
        await controls.evaluate((identity) => window.openControl(identity, 57), source);
        await controls.click('[data-art-mode=DOS-EGA]');
      } else await controls.evaluate((identity) => window.openControl(identity, 58), { ...source58, archiveSha256: '0'.repeat(64) });
      const before = await snapshot(controls);
      delayArt = null; await delayed(); await controls.waitForNetworkIdle();
      assert.deepEqual(await snapshot(controls), before, `Late58 load must not overwrite ${action}`);
      assert.equal(await controls.evaluate('window.artBitmapsOpen'), 0);
    }
    await controls.close();
  }
  const runTarget = externalBase ? 'live' : distRoot ? 'candidate' : 'development';
  console.log(`PASS cok-dialogue-restyle (${runTarget}): actual landmark arrival PIC1#57 DOS/Amiga/Restyle/DOS, Continue retention, PIC1#57→#58 exact-source switching/restoration and unadmitted18 fallback${runTarget === 'development' ? ', stale57/58 picture/mode/close/reopen/source replacement, missing/corrupt/geometry58 recovery, closed bitmaps and exact-source controls' : ''}`);
} finally {
  await browser?.close();
  if (staticServer) await new Promise((done) => staticServer.close(done));
  if (server && server.exitCode === null) {
    server.kill();
    await new Promise((done) => server.once('exit', done));
  }
  const rel = relative(tmpdir(), temporary);
  assert.ok(rel.startsWith('greybox-cok-dialogue-') && !rel.includes(sep)); rmSync(temporary, { recursive: true });
}
