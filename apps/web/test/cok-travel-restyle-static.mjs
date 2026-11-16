// Production-candidate smoke for CoK BIGPIC1#121 with real Library and local Restyle inputs.
import assert from 'node:assert/strict';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import net from 'node:net';
import puppeteer from 'puppeteer-core';
import travel from '../src/ui/cokTravelRestyleManifest.json' with { type: 'json' };
import demo from '../src/ui/cokDemoArtManifest.json' with { type: 'json' };
import { driveCokOpeningToTravel } from './cok-opening-to-travel.mjs';
import { readCokDemoInstallFiles, readPinnedLocalRestyleFiles, selectLocalCokInstall, selectLocalRestyleFiles } from './local-restyle-pack-e2e.mjs';

const root = resolve(process.env.GB_COK_TRAVEL_DIST_DIR ?? '');
assert.ok(process.env.GB_COK_TRAVEL_DIST_DIR, 'Set GB_COK_TRAVEL_DIST_DIR to a complete production candidate');
assert.ok(existsSync(join(root, 'index.html')), `Candidate has no index.html: ${root}`);
const forbidden = readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()
  && /\.(?:png|dax|daa|lbm|adf|iff)$/i.test(entry.name)).map((entry) => entry.name);
assert.deepEqual(forbidden, [], 'Production candidate must contain no game images or original archives');

const travelOutputSha = '435446f169edece24c52aa066b44cc84ad428bef09c2e60da292ee1df3e1a4f1';
const scene58OutputSha = '8fc50df402ea2f44001312e1556445ad7ac45a12506be60920e565232657dceb';
const localRestyle = readPinnedLocalRestyleFiles([
  { path: `cok/${travel.restyle.destination}`, sha256: travelOutputSha },
  { path: `orig/074_cok_overland_bigpic1_121.png`, sha256: 'e9f69763ee7cc48361cc3d44f2b22182d0a49cec21e7bf06c663478e27c10c91' },
  { path: `out/074_cok_overland_bigpic1_121.png`, sha256: travelOutputSha },
  { path: 'orig/cok-demo-bigpic2-116.png', sha256: demo.source.sha256 },
  { path: 'out/cok-demo-bigpic2-116.png', sha256: demo.restyle.sha256 },
  { path: 'orig/005_scene_cok_dos_pic1_058_f0.png', sha256: 'ab274f539c435b02685a5b612360071906fa93294317846c0fe93e7022d67fc9' },
  { path: 'out/005_scene_cok_dos_pic1_058_f0.png', sha256: scene58OutputSha },
  { path: 'orig/002_scene_cok_cottage.png', sha256: 'e5cc5da1f6119f72ec85f4d0e80b6e14050da4aa45a7c69865da05041f2da020' },
  { path: 'out/002_scene_cok_cottage.png', sha256: 'fbe3b9e6db24c0d7a79ee07f3d254edbd4230de93e0975d1b776177787284e14' },
  { path: 'orig/041_cok_amiga_daa_cok_pic1_pic1_023_f0.png', sha256: '8e5e2bd0418bf375e96ac1b0a5e6625905077fc8762f721214b878c2270aa634' },
  { path: 'out/041_cok_amiga_daa_cok_pic1_pic1_023_f0.png', sha256: '5f53622fe892b852d363800bef68804c2784ea236b1c9ceb2699227a75e66813' },
]);
const localGame = readCokDemoInstallFiles(demo, {
  extraDosPaths: ['PIC1.DAX', 'MON1CHA.DAX'],
  extraDosPins: { 'BIGPIC1.DAX': travel.archiveSha256 },
});

const types = new Map([['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml']]);
let gameArtRequests = 0;
const server = createServer((request, response) => {
  const path = decodeURIComponent((request.url ?? '/').split('?')[0] ?? '/');
  if (/\.(?:png|dax|daa|lbm|adf|iff)$/i.test(path)) gameArtRequests++;
  const relative = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  const file = normalize(resolve(root, relative));
  if (file !== root && !file.startsWith(`${root}${sep}`)) { response.writeHead(403).end(); return; }
  if (!existsSync(file) || !statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader('content-type', types.get(extname(file).toLowerCase()) ?? 'application/octet-stream');
  createReadStream(file).pipe(response);
});
const probe = net.createServer();
await new Promise((done) => probe.listen(0, '127.0.0.1', done));
const address = probe.address();
assert.ok(address && typeof address !== 'string');
const port = address.port;
await new Promise((done) => probe.close(done));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
await new Promise((done) => server.listen(port, '127.0.0.1', done));
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error' && !/favicon|DevTools/i.test(message.text())) errors.push(message.text()); });
page.on('response', (response) => {
  if (response.status() >= 400 && !/favicon/i.test(response.url())) {
    errors.push(`${response.status()} ${response.url()}`);
  }
});
await page.evaluateOnNewDocument(() => {
  localStorage.clear();
  localStorage.setItem('greybox.graphics.cok', 'DOS-EGA');
});

try {
  await page.goto(`http://127.0.0.1:${port}/?play=cok`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await selectLocalCokInstall(page, localGame);
  await page.waitForFunction(() => typeof window.__play?.toExplore === 'function', { timeout: 45_000 });
  await page.evaluate('window.__play.toExplore()');
  const openingErrors = [];
  await driveCokOpeningToTravel(page, openingErrors);
  assert.deepEqual(openingErrors, [], `CoK opening-to-travel fixture: ${JSON.stringify(openingErrors)}`);
  const expectedSource = { game: 'cok', system: 'DOS-EGA', archive: 'BIGPIC1.DAX',
    archiveSha256: travel.archiveSha256, blockId: 121, frameIndex: 0, blockSha256: travel.blockSha256 };
  assert.deepEqual(await page.evaluate('window.__cokTravel.pictureSource()'), expectedSource);
  await selectLocalRestyleFiles(page, localRestyle.slice(0, 1));

  const snapshot = async () => await page.evaluate(async () => {
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const canvas = document.querySelector('.cok-travel-panel canvas');
    if (!canvas) throw new Error('Travel canvas is missing');
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const hash = await crypto.subtle.digest('SHA-256', pixels);
    return { hash: Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join(''),
      position: window.__cokTravel.position(), memory: window.__cokTravel.memorySnapshot(),
      clock: window.__cokTravel.clockMinutes(), status: document.querySelector('.cok-travel-art-status')?.textContent };
  });
  const clickMode = async (mode) => page.click(`[data-art-mode="${mode}"]`);
  const dos = await snapshot();
  const travelState = ({ position, memory, clock }) => ({ position, memory, clock });
  const expectDos = async (label) => {
    const actual = await snapshot();
    assert.equal(actual.hash, dos.hash, `${label}: exact DOS pixels`);
    assert.deepEqual(travelState(actual), travelState(dos), `${label}: travel state preserved`);
    return actual;
  };
  await clickMode('Restyle');
  await page.waitForFunction(() => document.querySelector('.cok-travel-art-status')?.textContent.includes('Restyle (reviewed'));
  const restyle = await snapshot();
  assert.notEqual(restyle.hash, dos.hash, 'Local Restyle must change the actual travel canvas');
  assert.deepEqual(travelState(restyle), travelState(dos), 'Restyle switching must preserve travel state');
  assert.equal(await page.evaluate('localStorage.getItem("greybox.graphics.cok")'), 'Restyle');

  await clickMode('Amiga');
  await page.waitForFunction(() => document.querySelector('.cok-travel-art-status')?.textContent.includes('town names shown'));
  const amiga = await snapshot();
  assert.notEqual(amiga.hash, dos.hash, 'Selected Amiga archive must display the map with town names');
  await page.click('.gb-cok-travel-names-toggle input');
  await page.waitForFunction(() => document.querySelector('.cok-travel-art-status')?.textContent.includes('Town names hidden'));
  assert.equal((await snapshot()).hash, dos.hash, 'Hiding town names selects the aligned unnamed DOS map');
  await page.click('.gb-cok-travel-names-toggle input');
  await page.waitForFunction(() => document.querySelector('.cok-travel-art-status')?.textContent.includes('town names shown'));
  assert.equal((await snapshot()).hash, amiga.hash, 'Showing town names restores exact Amiga map');
  await clickMode('Restyle');
  await page.waitForFunction(() => document.querySelector('.cok-travel-art-status')?.textContent.includes('Restyle (reviewed'));
  await clickMode('DOS-EGA'); await expectDos('Restyle to DOS restoration');
  await clickMode('Amiga'); await page.waitForFunction(() => document.querySelector('.cok-travel-art-status')?.textContent.includes('town names shown'));
  assert.deepEqual(travelState(await snapshot()), travelState(dos), 'Amiga visual selection must preserve travel state');

  const picker = await page.$('button[aria-label="Choose a local Restyle image folder"]');
  assert.ok(picker, 'Travel route exposes its local Restyle picker');
  await picker.evaluate((button) => button.parentElement?.querySelector('button:not([aria-label])')?.click());
  await clickMode('Restyle');
  await page.waitForFunction(() => document.querySelector('.cok-travel-art-status')?.textContent.includes('Restyle unavailable'));
  await expectDos('Cleared Restyle folder fallback');
  await selectLocalRestyleFiles(page, localRestyle.slice(0, 1));
  await clickMode('Restyle');
  await page.waitForFunction(() => document.querySelector('.cok-travel-art-status')?.textContent.includes('Restyle (reviewed'));
  assert.notEqual((await snapshot()).hash, dos.hash, 'Selecting the local folder again must restore Restyle art');
  await clickMode('DOS-EGA'); await expectDos('Local Restyle replacement restoration');

  const galleryFiles = localRestyle.slice(1);
  await page.goto(`http://127.0.0.1:${port}/?restyle=1&view=side`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await selectLocalRestyleFiles(page, galleryFiles);
  await page.waitForFunction(() => document.querySelector('[data-role="comparison-count"]')?.textContent === '75 of 75 comparisons');
  await page.waitForFunction(() => document.querySelectorAll('[data-curated-id="scene_cok_cottage"] a[data-role="exact-source-link"]').length === 1);
  await page.waitForFunction(() => document.querySelectorAll('[data-curated-id="cok_amiga_daa_cok_pic1_pic1_023_f0"] a[data-role="exact-source-link"]').length === 6);
  const cottageHref = await page.$eval('[data-curated-id="scene_cok_cottage"] a[data-role="exact-source-link"]', (link) => link.href);
  assert.match(cottageHref, /cok%2Famiga%2Fdisk2%2Fbigpic1\.daa%2Fblock%2F112%2Fframe%2F0/);
  assert.equal(await page.$$eval('[data-curated-id="cok_amiga_daa_cok_pic1_pic1_023_f0"] a[data-role="exact-source-link"]', (links) => links.length), 6,
    'A curated image shared by six distinct source/frame IDs must keep all six links');

  await page.goto(`http://127.0.0.1:${port}/?graphics=1&id=${encodeURIComponent('cok/amiga/disk2/bigpic1.daa/block/112/frame/0')}`,
    { waitUntil: 'networkidle2', timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector('.gbx-panel h2')?.textContent === 'cok/amiga/disk2/bigpic1.daa/block/112/frame/0');
  await selectLocalRestyleFiles(page, galleryFiles);
  await page.waitForSelector('a[data-role="exact-restyle-link"][href*="curated=scene_cok_cottage"]');
  const curatedHref = await page.$eval('a[data-role="exact-restyle-link"][href*="curated=scene_cok_cottage"]', (link) => link.href);
  await page.goto(curatedHref, { waitUntil: 'networkidle2', timeout: 60_000 });
  await selectLocalRestyleFiles(page, galleryFiles);
  await page.waitForFunction(() => document.querySelector('[data-role="comparison-count"]')?.textContent === '1 of 75 shown (75 total)');
  await page.waitForSelector('[data-curated-id="scene_cok_cottage"]');

  await page.goto(`http://127.0.0.1:${port}/?restyle=1&view=side`, { waitUntil: 'networkidle2', timeout: 60_000 });
  await selectLocalRestyleFiles(page, galleryFiles);
  await page.waitForFunction(() => document.querySelector('[data-role="comparison-count"]')?.textContent === '75 of 75 comparisons');
  assert.ok(await page.$$eval('[data-role="comparison-batch"] option', (options) => options.some((option) => option.value === 'runtime' && option.textContent === 'Runtime (2)')),
    'The gallery must expose both separately labeled Runtime comparisons');
  await page.select('[data-role="comparison-batch"]', 'runtime');
  const travelCardSelector = '#rs-074_cok_overland_bigpic1_121';
  await page.waitForSelector(travelCardSelector);
  await page.$eval(travelCardSelector, (card) => card.scrollIntoView());
  await page.waitForFunction((selector) => [...document.querySelectorAll(`${selector} img.rs-img`)]
    .map((image) => [image.naturalWidth, image.naturalHeight]).toString() === '1216,480,1216,480', {}, travelCardSelector);
  assert.match(await page.$eval(`${travelCardSelector} h2`, (element) => element.textContent), /CoK overland map · BIGPIC1#121/);
  const travelPair = await page.$$eval(`${travelCardSelector} img.rs-img`, (images) => images.map((image) => [image.naturalWidth, image.naturalHeight]));
  assert.deepEqual(travelPair, [[1216, 480], [1216, 480]], 'Both local travel comparison images must load at validated dimensions');
  const demoCardSelector = '#rs-cok-demo-bigpic2-116';
  await page.waitForSelector(demoCardSelector);
  await page.$eval(demoCardSelector, (card) => card.scrollIntoView());
  await page.waitForFunction((selector) => {
    const original = document.querySelector(`${selector} img.rs-orig`);
    const output = document.querySelector(`${selector} img.rs-img:not(.rs-orig)`);
    return original?.naturalWidth === 1216 && original.naturalHeight === 480
      && output?.naturalWidth === 1824 && output.naturalHeight === 720;
  }, {}, demoCardSelector);
  const demoCard = await page.$eval(demoCardSelector, (card) => ({
    original: [card.querySelector('img.rs-orig')?.naturalWidth, card.querySelector('img.rs-orig')?.naturalHeight],
    output: [card.querySelector('img.rs-img:not(.rs-orig)')?.naturalWidth, card.querySelector('img.rs-img:not(.rs-orig)')?.naturalHeight],
  }));
  assert.deepEqual(demoCard, { original: [1216, 480], output: [1824, 720] }, 'Local demo comparison pair must retain its distinct source/output sizes');
  await page.select('[data-role="comparison-batch"]', 'batch03');
  const scene58 = '#rs-005_scene_cok_dos_pic1_058_f0';
  await page.waitForSelector(scene58);
  await page.$eval(scene58, (card) => card.scrollIntoView());
  await page.waitForFunction((selector) => {
    const card = document.querySelector(selector);
    const after = card?.querySelector('img.rs-img:not(.rs-orig)');
    return after?.naturalWidth === 1408 && after.naturalHeight === 1408;
  }, {}, scene58);
  const scene58Review = await page.$eval(scene58, async (card) => {
    const meta = [...card.querySelectorAll('.rs-meta')].find((item) => item.textContent?.includes('edge'))?.textContent ?? '';
    const image = card.querySelector('img.rs-img:not(.rs-orig)');
    const bytes = await (await fetch(image.src)).arrayBuffer();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    return { meta, sha256: Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('') };
  });
  assert.match(scene58Review.meta, /edge 0\.63 · hist 0\.40 · ok/);
  assert.equal(scene58Review.sha256, scene58OutputSha, 'Comparison page must serve exact approved PIC1#58 import');
  assert.equal(gameArtRequests, 0, 'Candidate must not request or serve original game art');
  assert.deepEqual(errors, [], `Candidate browser errors: ${JSON.stringify(errors)}`);
  console.log('PASS static CoK travel candidate: real Library archives and opening; DOS/Amiga/Restyle map selection; local-pack clear/reselect; state preservation; source-ID and Restyle gallery links; exact comparison PNG hashes; no packaged, requested or served game art.');
} finally {
  await browser.close(); await new Promise((done) => server.close(done));
}
