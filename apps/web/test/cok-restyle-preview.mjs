// Focused, opt-in CoK retail-opening graphics preview check. No game data is written.
// Launches an owned Vite server unless GB_E2E_BASE_URL names an existing site.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const PORT = 5185;
const BASE = (process.env.GB_E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
let server = null;
let browser = null;

async function startServer() {
  if (process.env.GB_E2E_BASE_URL) return;
  server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
    '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'pipe' });
  let log = '';
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => { log += String(chunk); });
  }
  for (let n = 0; n < 120; n++) {
    if (server.exitCode !== null) throw new Error(`owned Vite server exited: ${log}`);
    try {
      const response = await fetch(BASE);
      if (response.ok && log.includes(`127.0.0.1:${PORT}`)) return;
    } catch { /* not ready yet */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not start: ${log}`);
}

function frame(page) {
  return page.evaluate(async () => {
    const c = document.querySelector('.gb-dlg-panel-native canvas');
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let checksum = 0x811c9dc5;
    for (let i = 0; i < data.length; i += 97) checksum = Math.imul(checksum ^ data[i], 0x01000193) >>> 0;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    const pixelsSha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return { checksum, pixelsSha256, id: window.__dialogue?.pictureId?.(), text: window.__dialogue?.text?.(),
      source: window.__dialogue?.basePictureSource?.(),
      state: { kind: window.__dialogue?.kind?.(), choices: window.__dialogue?.choices?.(),
        awaiting: window.__dialogue?.awaiting?.(), prompt: window.__dialogue?.prompt?.(),
        combatOpen: window.__dialogue?.combatOpen?.(), visited: window.__cokOpening?.visited?.() },
      status: document.querySelector('.gb-dlg-art-status')?.textContent };
  });
}

async function openCottage() {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  await page.goto(`${BASE}/?explore=cok`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('window.__dialogue && document.querySelector("[data-art-mode=restyle]")', { timeout: 45000 });
  assert.equal((await frame(page)).id, 112, 'retail ECL picture must be the reviewed CoK cottage');
  assert.deepEqual((await frame(page)).source, { game: 'cok', system: 'DOS-EGA', archive: 'BIGPIC1.DAX',
    archiveSha256: '34cf5207584cb859817e1fc9b579cd51beea2e00e3393adbdc251e07f93483ec', blockId: 112, frameIndex: 0 },
  'cottage admission requires the exact DOS source, not numeric PICTURE112 alone');
  assert.deepEqual(await page.$$eval('[data-art-mode]', (buttons) => buttons.map((button) => button.dataset.artMode)),
    ['DOS-EGA', 'restyle'], 'no Amiga button without a verified selected-install Amiga source');
  return { page, errors };
}

try {
  await startServer();
  browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  {
    const { page, errors } = await openCottage();
    const before = await frame(page);
    // A Restyle selection must retain the original platform chosen for assets without an overlay.
    await page.evaluate(() => localStorage.setItem('greybox.graphics-fallback.cok', 'Amiga'));
    await page.click('[data-art-mode=restyle]');
    await page.waitForFunction('document.querySelector(".gb-dlg-art-status")?.textContent?.includes("Restyle (reviewed picture only)")',
      { timeout: 60000 });
    const after = await frame(page);
    assert.notEqual(after.checksum, before.checksum, 'real canvas pixels should change');
    assert.notEqual(after.pixelsSha256, before.pixelsSha256, 'full real canvas pixels should change');
    assert.equal(after.id, before.id, 'graphic switching must not change the retail ECL picture');
    assert.equal(after.text, before.text, 'graphic switching must not advance dialogue');
    assert.deepEqual(after.source, before.source, 'the Amiga-sourced reviewed counterpart must retain the DOS base identity');
    assert.deepEqual(after.state, before.state, 'graphics switching must preserve dialogue choices and opening progress');
    assert.equal(await page.$eval('[data-art-mode=restyle]', (button) => button.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.evaluate(() => localStorage.getItem('greybox.graphics.cok')), 'Restyle',
      'the runtime graphics choice should persist for this game');
    assert.equal(await page.evaluate(() => localStorage.getItem('greybox.graphics-fallback.cok')), 'Amiga',
      'Restyle should preserve the previously selected original system as its fallback');
    const reopened = await openCottage();
    await reopened.page.waitForFunction('document.querySelector(".gb-dlg-art-status")?.textContent?.includes("Restyle (reviewed picture only)")',
      { timeout: 60000 });
    assert.equal((await frame(reopened.page)).checksum, after.checksum,
      'reopening the retail scene should restore and load the selected Restyle pixels');
    assert.equal(await reopened.page.$eval('[data-art-mode=restyle]', (button) => button.getAttribute('aria-pressed')), 'true');
    assert.deepEqual(reopened.errors, [], 'restored graphics should load without browser errors');
    await reopened.page.close();
    if (process.env.GB_COK_RESTYLE_SCREENSHOT) await page.screenshot({ path: process.env.GB_COK_RESTYLE_SCREENSHOT });
    await page.click('[data-art-mode=DOS-EGA]');
    assert.equal(await page.evaluate(() => localStorage.getItem('greybox.graphics.cok')), 'DOS-EGA');
    assert.equal(await page.evaluate(() => localStorage.getItem('greybox.graphics-fallback.cok')), 'DOS-EGA',
      'selecting DOS should update Restyle’s original-art fallback');
    const restored = await frame(page);
    assert.equal(restored.checksum, before.checksum, 'original pixels should return exactly');
    assert.equal(restored.pixelsSha256, before.pixelsSha256, 'all original DOS pixels should return exactly');
    assert.deepEqual(restored.state, before.state); assert.deepEqual(restored.source, before.source);
    assert.deepEqual(errors, [], 'no browser console/page errors');
    console.log('[PASS] CoK ECL#112 Restyle preview changes only pixels; original returns exactly');
    await page.close();
  }
  {
    const { page, errors } = await openCottage();
    // This case deliberately intercepts a later image request with corrupt bytes. Disable the
    // browser cache first so the valid PNG loaded by the preceding positive case cannot bypass
    // request interception when this same live-site check runs both cases in one browser.
    await page.setCacheEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.url().includes('/restyle/out/002_scene_cok_cottage.png')) {
        void request.respond({ status: 200, contentType: 'image/png', body: Buffer.from([0, 1, 2, 3]) });
      } else void request.continue();
    });
    const before = await frame(page);
    await page.click('[data-art-mode=restyle]');
    await page.waitForFunction('document.querySelector(".gb-dlg-art-status")?.textContent?.includes("does not match reviewed output")',
      { timeout: 30000 });
    const rejected = await frame(page);
    assert.equal(rejected.checksum, before.checksum, 'unreviewed bytes must never draw');
    assert.equal(rejected.pixelsSha256, before.pixelsSha256, 'all DOS pixels survive output failure');
    assert.deepEqual(rejected.state, before.state); assert.deepEqual(rejected.source, before.source);
    assert.equal(await page.$eval('[data-art-mode=restyle]', (button) => button.getAttribute('aria-pressed')), 'true',
      'a bad image must not clear the requested Restyle preference');
    assert.equal(await page.evaluate(() => localStorage.getItem('greybox.graphics.cok')), 'Restyle');
    assert.equal(await page.evaluate(() => localStorage.getItem('greybox.graphics-fallback.cok')), 'DOS-EGA');
    assert.deepEqual(errors, [], 'bad art is rejected deliberately, not via a page error');
    console.log('[PASS] Unreviewed PNG bytes are rejected; original pixels and requested Restyle preference stay intact');
    await page.close();
  }
} finally {
  await browser?.close();
  if (server) server.kill();
}
