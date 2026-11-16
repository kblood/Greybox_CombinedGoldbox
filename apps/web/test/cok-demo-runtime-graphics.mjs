// Production-candidate proof for the CoK BIGPIC2#116 runtime graphics selector.
// Supply GB_COK_DEMO_DIST_DIR=<candidate>, GB_COK_DOS_INSTALL_DIR, GB_COK_AMIGA_INSTALL_DIR,
// and GB_RESTYLE_PACK_DIR=<contents of restyle/>.
import assert from 'node:assert/strict';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { extname, normalize, resolve, sep } from 'node:path';
import puppeteer from 'puppeteer-core';
import manifest from '../src/ui/cokDemoArtManifest.json' with { type: 'json' };
import { readCokDemoInstallFiles, readPinnedLocalRestyleFiles, selectLocalCokInstall, selectLocalRestyleFiles, clearLocalRestyleFiles, holdRestyleDecodes, observeDemoPackListeners } from './local-restyle-pack-e2e.mjs';

const root = resolve(process.env.GB_COK_DEMO_DIST_DIR ?? '');
assert.ok(process.env.GB_COK_DEMO_DIST_DIR, 'Set GB_COK_DEMO_DIST_DIR to a complete production candidate');
assert.ok(existsSync(resolve(root, 'index.html')), `Candidate has no index.html: ${root}`);
const restyleRelativePath = `restyle/cok/${manifest.restyle.destination}`;
assert.ok(!existsSync(resolve(root, restyleRelativePath)), `Generated PNG must stay outside the candidate: ${restyleRelativePath}`);
const localRestyle = readPinnedLocalRestyleFiles([
  { path: `cok/${manifest.restyle.destination}`, sha256: manifest.restyle.sha256 },
]);
const localGame = readCokDemoInstallFiles(manifest);

const types = new Map([['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png']]);
const server = createServer((request, response) => {
  const path = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
  const relative = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  const file = normalize(resolve(root, relative));
  if (file !== root && !file.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return; }
  if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader('content-type', types.get(extname(file).toLowerCase()) ?? 'application/octet-stream');
  createReadStream(file).pipe(response);
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error' && !/favicon|DevTools/i.test(message.text())) errors.push(message.text()); });
page.on('response', (response) => { if (response.status() >= 400 && !/favicon/i.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
await page.evaluateOnNewDocument(() => {
  localStorage.clear();
  localStorage.setItem('greybox.graphics.cok', 'DOS-EGA');
});

let listeners;
try {
  await page.goto(`http://127.0.0.1:${address.port}/?demo=1`, { waitUntil: 'networkidle2', timeout: 60_000 });
  listeners = await observeDemoPackListeners(page);
  const libraryIndex = await selectLocalCokInstall(page, localGame);
  await page.waitForFunction(() => window.__demo?.stats && document.querySelector('[data-demo-graphics-mode="Restyle"]'), { timeout: 45_000 });
  await page.evaluate(() => window.__demo.pause());
  await selectLocalRestyleFiles(page, localRestyle);
  let stats = await page.evaluate(() => window.__demo.stats());
  for (let i = 0; i < 300 && stats.pictureId !== manifest.pictureId; i++) {
    await page.evaluate(() => window.__demo.step());
    stats = await page.evaluate(() => window.__demo.stats());
  }
  assert.equal(stats.pictureId, manifest.pictureId, `CoK attract demo did not reach BIGPIC2#${manifest.pictureId}`);
  assert.equal(stats.artSource, 'DOS-EGA');

  const stageHash = async () => createHash('sha256').update(Buffer.from(await (await page.$('.gb-emu')).screenshot())).digest('hex');
  const demoState = async () => page.evaluate(() => {
    const { phase, beatsPlayed, text, pictureId, pictureFrame } = window.__demo.stats();
    return { phase, beatsPlayed, text, pictureId, pictureFrame, vm: window.__demo.vmState() };
  });
  const originalState = await demoState();
  const dosPixels = await stageHash();

  await page.locator('[data-demo-graphics-mode="Amiga"]').click();
  await page.waitForFunction(() => window.__demo.stats().artSource === 'Amiga');
  const amigaPixels = await stageHash();
  assert.notEqual(amigaPixels, dosPixels, 'Amiga mode must paint the pinned Amiga BIGPIC1#116 pixels');
  assert.deepEqual(await demoState(), originalState, 'Amiga switching must preserve demo/ECL state');

  await page.locator('[data-demo-graphics-mode="Restyle"]').click();
  await page.waitForFunction(() => window.__demo.stats().restyleVisible, { timeout: 30_000 });
  const restylePixels = await stageHash();
  assert.notEqual(restylePixels, dosPixels, 'Restyle mode must paint the selected local PNG over the scene');
  assert.deepEqual(await demoState(), originalState, 'Restyle switching must preserve demo/ECL state');
  assert.equal(await page.evaluate(() => window.__demo.stats().restyleVisible), true,
    'The selected local Restyle file must be displayed by the runtime demo');

  const picker = '.gb-demo-graphics';
  const revision = async () => page.evaluate(() => window.__demo.stats().graphicsRevision);
  const replace = async (files) => {
    const before = await revision();
    await selectLocalRestyleFiles(page, files, picker);
    assert.equal(await revision(), before + 1, 'Exactly one demo invalidation per pack event');
    assert.deepEqual(await demoState(), originalState, 'Pack changes preserve detached VM and narration state');
  };
  await clearLocalRestyleFiles(page, picker);
  await page.waitForFunction(() => !window.__demo.stats().restyleVisible);
  assert.equal(await stageHash(), amigaPixels, 'Clear restores the selected Amiga fallback');
  assert.equal(await page.evaluate(() => window.__demo.stats().graphicsMode), 'Restyle');
  // Reuse the admitted file at an absent path; its bytes are unchanged and cannot match this scene.
  const missingScene = localRestyle.map((file) => ({ ...file, relativePath: `restyle/absent/${file.name}` }));
  await replace(missingScene);
  await page.waitForFunction(() => !window.__demo.stats().restyleLoading);
  assert.equal(await stageHash(), amigaPixels, 'Nonempty pack without the scene preserves native fallback');
  await replace(localRestyle);
  await page.waitForFunction(() => window.__demo.stats().restyleVisible);
  assert.equal(await stageHash(), restylePixels, 'Only the current admitted pack restores exact pixels');
  await replace(localRestyle);
  await page.waitForFunction(() => window.__demo.stats().restyleVisible);
  assert.equal(await stageHash(), restylePixels, 'Same-folder retry retains exact scene pixels');
  const held = await holdRestyleDecodes(page, [manifest.restyle.width, manifest.restyle.height]);
  try {
    for (const reject of [false, true]) {
      const offset = reject ? 3 : 0;
      // Reach both mounts with revision 0 so revision inequality cannot mask identity bugs.
      const restart = async () => {
        await page.evaluate(() => window.__demo.exit());
        assert.equal(await page.evaluate(() => window.__demo.isPlaying()), false);
        await page.evaluate(() => window.__titleMenu.hotkey('d'));
        await page.click(`.lib-entry[data-lib-index="${libraryIndex}"]`);
        await page.waitForFunction(() => window.__demo?.isPlaying());
        await page.evaluate(() => window.__demo.pause());
        for (let i = 0; i < 300 && await page.evaluate(() => window.__demo.stats().pictureId) !== manifest.pictureId; i++) await page.evaluate(() => window.__demo.step());
        assert.equal(await page.evaluate(() => window.__demo.stats().pictureId), manifest.pictureId, 'INCOMPLETE: restart must naturally reach pinned scene');
      };
      await restart(); await held.wait(offset + 1);
      await page.evaluate(() => { window.__demoOldListeners = [...window.__demoListeners.active]; });
      const aRevision = await revision();
      await restart(); await held.wait(offset + 2);
      await page.evaluate(() => new Promise((done) => setTimeout(done, 0)));
      assert.equal(await page.evaluate(() => { const o = window.__demoListeners; return window.__demoOldListeners.length === 2 && window.__demoOldListeners.every((cb) => !o.active.has(cb) && o.removed.includes(cb)) && o.active.size === 2 && [...o.active].every((cb) => !window.__demoOldListeners.includes(cb) && o.added.filter((added) => added === cb).length === 1); }), true, 'Old demo/picker callbacks removed; fresh demo/picker pair registered once');
      assert.equal(await revision(), aRevision, 'Equal graphics revisions discriminate mount ownership');
      const bState = await demoState();
      const bStats = await page.evaluate(() => window.__demo.stats());
      await held.release(offset, reject);
      const pending = await page.evaluate(() => window.__demo.stats());
      assert.equal(await held.closed(offset), true, 'Stale decoded bitmap is closed');
      assert.deepEqual(await demoState(), bState);
      assert.deepEqual(pending, bStats, 'Stale completion cannot change new mount stats');
      assert.equal(await page.evaluate((i) => { const [a, b] = window.__heldDemoDecodes.jobs.slice(i, i + 2); return a.id === i && b.id === i + 1 && a.settled && !b.settled; }, offset), true, 'Stable A handle settled; B handle remains pending');
      assert.equal(pending.restyleLoading, true, 'Stale finalizer cannot clear the newer pending request');
      assert.equal(pending.restyleError, null, 'Stale rejection cannot set the current error');
      assert.equal(pending.restyleVisible, false, 'Stale completion cannot paint');
      await held.release(offset + 1);
      await page.waitForFunction(() => window.__demo.stats().restyleVisible);
      assert.equal(await stageHash(), restylePixels, 'B alone installs the admitted pixels');
      assert.equal(await page.evaluate(() => { const s = window.__demo.stats(); return s.bitmapPackRevision === s.localPackRevision; }), true);
      const r = await revision(); await selectLocalRestyleFiles(page, localRestyle, picker); await held.wait(offset + 3); await held.release(offset + 2);
      assert.equal(await revision(), r + 1, 'New picker invalidates exactly once');
      await page.waitForFunction(() => window.__demo.stats().restyleVisible);
    }
  } finally { await held.restore(); }

  await page.locator('[data-demo-graphics-mode="DOS-EGA"]').click();
  await page.waitForFunction(() => window.__demo.stats().artSource === 'DOS-EGA' && !window.__demo.stats().restyleVisible);
  assert.equal(await stageHash(), dosPixels, 'DOS-EGA must restore the exact original demo pixels');
  assert.equal(await page.evaluate(() => window.__demo.stats().pictureId), manifest.pictureId);
  assert.equal(await page.evaluate(() => localStorage.getItem('greybox.graphics.cok')), 'DOS-EGA');

  await listeners.restore();
  await page.goto(`http://127.0.0.1:${address.port}/?restyle=1`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector('[data-role="comparison-count"]')?.textContent === '75 of 75 comparisons', { timeout: 45_000 });
  const options = await page.$$eval('[data-role="comparison-batch"] option', (items) => items.map((item) => [item.value, item.textContent]));
  assert.ok(options.some(([value, label]) => value === 'runtime' && label === 'Runtime (2)'), `Missing Runtime lane: ${JSON.stringify(options)}`);
  await page.select('[data-role="comparison-batch"]', 'runtime');
  await page.waitForSelector('#rs-cok-demo-bigpic2-116');
  const card = await page.$eval('#rs-cok-demo-bigpic2-116', (element) => ({
    title: element.querySelector('h2')?.textContent,
    dimensions: [...element.querySelectorAll('img.rs-img')].map((image) => [image.naturalWidth, image.naturalHeight]),
    meta: element.querySelector('.rs-meta')?.textContent,
  }));
  assert.equal(card.title, 'CoK demo · BIGPIC2#116');
  assert.deepEqual(card.dimensions, [[1824, 720], [1216, 480]]);
  assert.match(card.meta, /edge 0\.36 · hist 0\.12 · ok/);
  assert.deepEqual(errors, [], `Browser reported errors: ${JSON.stringify(errors)}`);
  console.log(`PASS CoK demo BIGPIC2#116: DOS -> Amiga -> local Restyle -> exact DOS restore; ECL state invariant; gallery Runtime card and local PNG ${manifest.restyle.sha256}.`);
} catch (error) { console.error(`INCOMPLETE: ${error.stack ?? error}`); process.exitCode = 1;
} finally {
  await listeners?.restore();
  await browser.close();
  await new Promise((done) => server.close(done));
}
