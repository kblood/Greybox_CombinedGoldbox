// Focused DoK retail ECL1#16 picture-113 preview; source images are never modified.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const PORT = 5186;
const BASE = (process.env.GB_E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`).replace(/\/$/, '');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUTPUT = fileURLToPath(new URL('../../../renders/restyle-site/restyle/out/004_scene_dok_skeleton_dragon.png', import.meta.url));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
let server = null;
let browser = null;

async function startServer() {
  if (process.env.GB_E2E_BASE_URL) return;
  server = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
    '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'pipe' });
  let log = '';
  for (const stream of [server.stdout, server.stderr]) stream.on('data', (chunk) => { log += String(chunk); });
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
  return page.evaluate(() => {
    const c = document.querySelector('.gb-dlg-panel-native canvas');
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let checksum = 0x811c9dc5;
    for (let i = 0; i < data.length; i += 97) checksum = Math.imul(checksum ^ data[i], 0x01000193) >>> 0;
    return { checksum, width: c.width, height: c.height, id: window.__dialogue?.pictureId?.(), text: window.__dialogue?.text?.(),
      status: document.querySelector('.gb-dlg-art-status')?.textContent };
  });
}

async function openDragon() {
  const page = await browser.newPage();
  const errors = [];
  let restyleFetches = 0;
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('request', (request) => {
    if (request.url().includes('/restyle/out/004_scene_dok_skeleton_dragon.png')) restyleFetches++;
  });
  await page.goto(`${BASE}/?explore=dok`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction('window.__dialogue && document.querySelector("[data-art-mode=restyle]")', { timeout: 45000 });
  assert.equal(restyleFetches, 0, 'generated image must not load on boot');
  assert.match(await page.$eval('[data-art-mode=restyle]', (b) => b.textContent), /skeleton dragon only/);
  assert.deepEqual(await page.$$eval('[data-art-mode]', (buttons) => buttons.map((button) => button.dataset.artMode)),
    ['DOS-EGA', 'restyle'], 'no Amiga button without the verified selected-install archive');
  const seen = [];
  for (let step = 0; step < 24; step++) {
    const current = await frame(page);
    seen.push(current.id);
    if (current.id === 113) {
      assert.equal(restyleFetches, 0, 'must remain lazy through earlier retail pictures');
      return { page, errors, seen, restyleFetches: () => restyleFetches };
    }
    assert.equal(await page.evaluate(() => window.__dialogue?.kind?.()), 'say', 'should stay on retail pre-combat ECL');
    await page.evaluate(() => window.__dialogue.choose(0));
  }
  throw new Error(`retail ECL picture 113 not reached; ids: ${seen.join(', ')}`);
}

try {
  const beforeBytes = await readFile(OUTPUT); // absent ignored output is a prerequisite failure, not a pass
  const beforeHash = sha(beforeBytes);
  assert.equal(beforeHash, 'baf59cd1707307c2793b763395de5eca8666e5056c6174ec374d3daddb9fb6a5');
  await startServer();
  browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] });
  {
    const { page, errors, seen, restyleFetches } = await openDragon();
    assert.ok(seen.includes(96), 'the retail event must pass picture 96 before picture 113');
    const before = await frame(page);
    await page.click('[data-art-mode=restyle]');
    await page.waitForFunction('document.querySelector(".gb-dlg-art-status")?.textContent?.includes("Restyle (reviewed picture only)")',
      { timeout: 60000 });
    const after = await frame(page);
    assert.equal(restyleFetches(), 1, 'only the selected reviewed output was fetched');
    assert.notEqual(after.checksum, before.checksum, 'real canvas pixels must change');
    assert.equal(after.id, 113, 'the graphic switch must not change the retail picture');
    assert.equal(after.text, before.text, 'the graphic switch must not advance dialogue');
    assert.equal(await page.$eval('[data-art-mode=restyle]', (b) => b.getAttribute('aria-pressed')), 'true');
    if (process.env.GB_DOK_RESTYLE_SCREENSHOT) await page.screenshot({ path: process.env.GB_DOK_RESTYLE_SCREENSHOT });
    await page.click('[data-art-mode=DOS-EGA]');
    const restored = await frame(page);
    assert.equal(restored.checksum, before.checksum, `original DOS pixels must return exactly: ${JSON.stringify({ before, restored })}`);
    assert.deepEqual(errors, [], 'no browser errors or asset 4xx');
    console.log('[PASS] DoK ECL1#16 picture 113 Restyle preview changes only pixels and restores DOS');
    await page.close();
  }
  {
    const { page, errors } = await openDragon();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.url().includes('/restyle/out/004_scene_dok_skeleton_dragon.png')) {
        void request.respond({ status: 200, contentType: 'image/png', body: Buffer.from([0, 1, 2, 3]) });
      } else void request.continue();
    });
    const before = await frame(page);
    await page.click('[data-art-mode=restyle]');
    await page.waitForFunction('document.querySelector(".gb-dlg-art-status")?.textContent?.includes("does not match reviewed output")',
      { timeout: 30000 });
    assert.equal((await frame(page)).checksum, before.checksum, 'tampered bytes must never draw');
    assert.equal(await page.$eval('[data-art-mode=restyle]', (b) => b.getAttribute('aria-pressed')), 'false');
    assert.deepEqual(errors, [], 'intentional rejection must not cause browser errors or 4xx');
    console.log('[PASS] Tampered DoK output rejected; original DOS pixels retained');
    await page.close();
  }
  assert.equal(sha(await readFile(OUTPUT)), beforeHash, 'test must not mutate source output');
} finally {
  await browser?.close();
  if (server) server.kill();
}
