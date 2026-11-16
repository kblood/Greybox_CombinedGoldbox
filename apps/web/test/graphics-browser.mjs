// Focused acceptance for the source-first graphics identity browser.
// Register in e2e.mjs and run only after the recorded Vite spawn EPERM hold clears.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const CPK57 = 'cok/dos-ega/disk1/cpic1.dax/block/57/frame/0';
const COTTAGE = 'cok/amiga/disk2/bigpic1.daa/block/112/frame/0';
const BODY2 = 'cok/dos-ega/disk1/body2.dax/block/68/frame/0';
const SPRIT1 = 'cok/dos-ega/dos-install/sprit1.dax/block/1/frame/0';
const SPRIT1_MIDDLE = 'cok/dos-ega/dos-install/sprit1.dax/block/1/frame/1';
const AMIGA_SPRIT1 = 'cok/amiga/disk2/sprit1.daa/block/1/frame/0';
const AMIGA_PIC57 = 'cok/amiga/disk2/pic1.daa/block/57/frame/0';
const AMIGA_CPIC1_1 = 'cok/amiga/disk2/cpic1.daa/block/1/frame/0';
const AMIGA_CPIC1_129 = 'cok/amiga/disk2/cpic1.daa/block/129/frame/0';
const CPIC_HYPOTHESIS = 'hypothesis/cok-amiga-cpic1-block-1-and-129';
const PIXEL_IDENTICAL_RESTYLE_REUSE = 'cok/amiga/disk1/8x8d0.daa/block/12/tile/9';
const CPIC1_UNMAPPED = 'cok/dos-ega/disk1/cpic1.dax/block/1/frame/0';
const CPIC1_MAPPED = 'cok/dos-ega/disk1/cpic1.dax/block/8/frame/0';
const HELD_PLAYER_BODY = 'cok/dos-ega/install/cbody.dax/block/139/frame/0';
const PIC1_023_ANIMATION_SOURCES = [
  'cok/amiga/disk2/pic1.daa/block/23/frame/0', 'cok/amiga/disk2/pic1.daa/block/23/frame/3',
  'cok/amiga/disk2/pic1.daa/block/23/frame/5', 'cok/amiga/disk3/pic2.daa/block/23/frame/0',
  'cok/amiga/disk3/pic2.daa/block/23/frame/3', 'cok/amiga/disk3/pic2.daa/block/23/frame/5',
];
const EXPECT_STATIC_METADATA = Boolean(process.env.GB_E2E_BASE_URL);
const isCensusData = (url) => /\/cok-graphics-source-census-v1(?:[.-][^/]+)?\.(?:js|json)$/.test(new URL(url).pathname);
const LOCAL_GRAPHICS_FIXTURE_PINS = Object.freeze({
  archive: 'b3512ed6a030ac27538ae66f6115bdf0bf1f5a78e63eba0d32fef3e32b049687',
  charsLbm: '51cfc7de6f3c8004de820ee9758eb3f785bedff6a808c21d58d0d2964b7963c3',
  sourcePng: '8ab8df9a6866bbc84353ffb15bbab70659954b466315c9f89f01c4e41eb0a981',
  acceptedRestyle: '193e7af3ecc3591f2564cb9e59d2c9bd30d68add82c88819f1db6fb84fb57176',
  amigaPic57Rgb: '5d2430bfd1b250418006179dcd1221634712fe85bf14f13320d8af2993ea4dee',
  charsLbmRgb: '68bbd4e0d8e4a5a66928190f68b47a121f03424c5c34def9c8f42951792d601c',
});

function pinnedLocalFixture(path, expectedSha256, name, relativePath, type) {
  if (!path) throw new Error(`Set the local fixture path for ${name}`);
  const bytes = readFileSync(path);
  const actualSha256 = createHash('sha256').update(bytes).digest('hex');
  assert.equal(actualSha256, expectedSha256, `${name} fixture must match its independent SHA-256 pin`);
  return { name, relativePath, type, base64: bytes.toString('base64') };
}

function corruptLocalFixture(fixture) {
  const bytes = Buffer.from(fixture.base64, 'base64');
  bytes[256] ^= 1;
  return { ...fixture, base64: bytes.toString('base64') };
}

export function loadLocalGraphicsFixtures() {
  const paths = [process.env.GB_E2E_GRAPHICS_ARCHIVE, process.env.GB_E2E_GRAPHICS_CHARS_LBM,
    process.env.GB_E2E_GRAPHICS_RESTYLE_PNG, process.env.GB_E2E_GRAPHICS_SOURCE_PNG];
  if (paths.every((path) => !path)) return null;
  assert.ok(paths.every(Boolean), 'Set GB_E2E_GRAPHICS_ARCHIVE, GB_E2E_GRAPHICS_CHARS_LBM, GB_E2E_GRAPHICS_RESTYLE_PNG and GB_E2E_GRAPHICS_SOURCE_PNG together');
  return {
    archives: [
      pinnedLocalFixture(paths[0], LOCAL_GRAPHICS_FIXTURE_PINS.archive, 'PIC1.DAA',
        'GoldBoxImg/ChampionsOfKrynn/disk2/PIC1.DAA', 'application/octet-stream'),
      pinnedLocalFixture(paths[1], LOCAL_GRAPHICS_FIXTURE_PINS.charsLbm, 'charS.LBM',
        'GoldBoxImg/ChampionsOfKrynn/disk2/charS.LBM', 'application/octet-stream'),
    ],
    restyle: [
      pinnedLocalFixture(paths[2], LOCAL_GRAPHICS_FIXTURE_PINS.acceptedRestyle,
        '043_cok_amiga_daa_cok_pic1_pic1_057_f0.png',
        'restyle/out/043_cok_amiga_daa_cok_pic1_pic1_057_f0.png', 'image/png'),
      pinnedLocalFixture(paths[3], LOCAL_GRAPHICS_FIXTURE_PINS.sourcePng,
        `${LOCAL_GRAPHICS_FIXTURE_PINS.sourcePng}.png`,
        `restyle/cok-generated/images/${LOCAL_GRAPHICS_FIXTURE_PINS.sourcePng}.png`, 'image/png'),
    ],
  };
}

async function setLocalFolderFiles(page, buttonLabel, files) {
  const button = await page.$(`button[aria-label="${buttonLabel}"]`);
  assert.ok(button, `Local folder picker is present: ${buttonLabel}`);
  await button.evaluate((picker, entries) => {
    const input = picker.parentElement?.querySelector('input[type="file"][webkitdirectory]');
    if (!(input instanceof HTMLInputElement)) throw new Error(`Missing directory file input for ${picker.getAttribute('aria-label')}`);
    const transfer = new DataTransfer();
    for (const entry of entries) {
      const binary = atob(entry.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const file = new File([bytes], entry.name, { type: entry.type });
      Object.defineProperty(file, 'webkitRelativePath', { value: entry.relativePath });
      transfer.items.add(file);
    }
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, files);
  await button.dispose();
}

async function clearLocalFolder(page, buttonLabel) {
  const button = await page.$(`button[aria-label="${buttonLabel}"]`);
  assert.ok(button, `Local folder picker is present: ${buttonLabel}`);
  await button.evaluate((picker) => {
    const clear = picker.parentElement?.querySelectorAll('button')[1];
    if (!(clear instanceof HTMLButtonElement) || clear.hidden) throw new Error('Local folder clear control is not available');
    clear.click();
  });
  await button.dispose();
}

async function readCanvasRgb(page, imageSelector) {
  return page.$eval(imageSelector, async (image) => {
    const canvas = image.closest('figure')?.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement) || canvas.hidden || !canvas.width || !canvas.height) {
      return { visible: false, width: canvas?.width ?? 0, height: canvas?.height ?? 0, sha256: null };
    }
    const rgba = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
    if (!rgba) throw new Error('Could not read the locally decoded source canvas');
    const rgb = new Uint8Array(canvas.width * canvas.height * 3);
    for (let from = 0, to = 0; from < rgba.length; from += 4) {
      rgb[to++] = rgba[from]; rgb[to++] = rgba[from + 1]; rgb[to++] = rgba[from + 2];
    }
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', rgb));
    const sha256 = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return { visible: true, width: canvas.width, height: canvas.height, sha256 };
  });
}

async function readImageBytes(page, selector) {
  return page.$eval(selector, async (image) => {
    if (!(image instanceof HTMLImageElement) || !image.complete || !image.naturalWidth || !image.currentSrc) {
      return { visible: false, src: image?.currentSrc ?? '', width: image?.naturalWidth ?? 0, height: image?.naturalHeight ?? 0, sha256: null };
    }
    const bytes = await fetch(image.currentSrc).then((response) => response.arrayBuffer());
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const sha256 = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return { visible: !image.hidden, src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight, sha256 };
  });
}

async function verifyLocalGraphicsInputs(page, open, fixtures) {
  await open({ graphics: '1', id: AMIGA_PIC57 });
  const originalSelector = '.gbx-panel img[alt="Decoded original"]';
  const acceptedSelector = '.gbx-panel img[alt="accepted-restyle"]';
  const missingAccepted = await readImageBytes(page, acceptedSelector);
  assert.equal(missingAccepted.visible, false, 'Static site has no Restyle artwork before the local folder is selected');
  assert.match(await page.$eval(acceptedSelector, (image) => image.closest('figure')?.textContent ?? ''),
    /select the local Restyle image folder to view this artwork/);

  await setLocalFolderFiles(page, 'Choose a local Restyle image folder', fixtures.restyle);
  await page.waitForFunction((selector) => {
    const image = document.querySelector(selector);
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  }, {}, acceptedSelector);
  const restyle = await readImageBytes(page, acceptedSelector);
  assert.match(restyle.src, /^blob:/, 'Restyle preview must use a local object URL, not HTTP');
  assert.deepEqual({ width: restyle.width, height: restyle.height, sha256: restyle.sha256 }, {
    width: 1408, height: 1408, sha256: LOCAL_GRAPHICS_FIXTURE_PINS.acceptedRestyle,
  });
  const originalPng = await readImageBytes(page, originalSelector);
  assert.deepEqual({ width: originalPng.width, height: originalPng.height, sha256: originalPng.sha256 }, {
    width: 352, height: 352, sha256: LOCAL_GRAPHICS_FIXTURE_PINS.sourcePng,
  });

  await setLocalFolderFiles(page, 'Choose a local extracted game archive folder', fixtures.archives);
  await page.waitForFunction((selector) => {
    const image = document.querySelector(selector);
    const canvas = image?.closest('figure')?.querySelector('canvas');
    return canvas instanceof HTMLCanvasElement && !canvas.hidden;
  }, {}, originalSelector);
  assert.deepEqual(await readCanvasRgb(page, originalSelector), {
    visible: true, width: 88, height: 88, sha256: LOCAL_GRAPHICS_FIXTURE_PINS.amigaPic57Rgb,
  }, 'PIC1.DAA preview must match the exact pinned native RGB pixels');

  const invalidRestyle = corruptLocalFixture(fixtures.restyle[0]);
  await setLocalFolderFiles(page, 'Choose a local Restyle image folder', [invalidRestyle]);
  await page.waitForFunction((selector) => {
    const image = document.querySelector(selector);
    return image instanceof HTMLImageElement && image.hidden
      && image.closest('figure')?.textContent.includes('select the local Restyle image folder to view this artwork');
  }, {}, acceptedSelector);
  await setLocalFolderFiles(page, 'Choose a local Restyle image folder', fixtures.restyle);
  await page.waitForFunction((selector) => {
    const image = document.querySelector(selector);
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  }, {}, acceptedSelector);

  await setLocalFolderFiles(page, 'Choose a local extracted game archive folder', [
    corruptLocalFixture(fixtures.archives[0]),
  ]);
  await page.waitForFunction((selector) => {
    const image = document.querySelector(selector);
    const canvas = image?.closest('figure')?.querySelector('canvas');
    return canvas instanceof HTMLCanvasElement && canvas.hidden && image instanceof HTMLImageElement
      && image.complete && image.naturalWidth > 0;
  }, {}, originalSelector);
  await setLocalFolderFiles(page, 'Choose a local extracted game archive folder', fixtures.archives);
  await page.waitForFunction((selector) => {
    const image = document.querySelector(selector);
    const canvas = image?.closest('figure')?.querySelector('canvas');
    return canvas instanceof HTMLCanvasElement && !canvas.hidden;
  }, {}, originalSelector);
  assert.deepEqual(await readCanvasRgb(page, originalSelector), {
    visible: true, width: 88, height: 88, sha256: LOCAL_GRAPHICS_FIXTURE_PINS.amigaPic57Rgb,
  }, 'a matching archive selection must replace a cached hash miss with the exact source image');

  await clearLocalFolder(page, 'Choose a local extracted game archive folder');
  await page.waitForFunction((selector) => {
    const image = document.querySelector(selector);
    const canvas = image?.closest('figure')?.querySelector('canvas');
    return canvas instanceof HTMLCanvasElement && canvas.hidden && image instanceof HTMLImageElement
      && image.complete && image.naturalWidth > 0;
  }, {}, originalSelector);
  await clearLocalFolder(page, 'Choose a local Restyle image folder');
  await page.waitForFunction((selectors) => selectors.every((selector) => {
    const image = document.querySelector(selector);
    return image instanceof HTMLImageElement && image.hidden;
  }), {}, [originalSelector, acceptedSelector]);

  await open({ graphics: '1', id: 'cok/amiga/disk2/lbm/chars.lbm/whole' });
  const charsSelector = '.gbx-panel img[alt="Decoded original"]';
  assert.equal((await readCanvasRgb(page, charsSelector)).visible, false,
    'charS.LBM begins unavailable after navigation with no selected archive folder');
  await setLocalFolderFiles(page, 'Choose a local extracted game archive folder', [fixtures.archives[1]]);
  await page.waitForFunction((selector) => {
    const image = document.querySelector(selector);
    const canvas = image?.closest('figure')?.querySelector('canvas');
    return canvas instanceof HTMLCanvasElement && !canvas.hidden;
  }, {}, charsSelector);
  assert.deepEqual(await readCanvasRgb(page, charsSelector), {
    visible: true, width: 320, height: 200, sha256: LOCAL_GRAPHICS_FIXTURE_PINS.charsLbmRgb,
  }, 'charS.LBM must decode to the exact pinned RGB pixels after a prior cache miss');
  await clearLocalFolder(page, 'Choose a local extracted game archive folder');
  await page.waitForFunction((selector) => {
    const image = document.querySelector(selector);
    const canvas = image?.closest('figure')?.querySelector('canvas');
    return canvas instanceof HTMLCanvasElement && canvas.hidden && image instanceof HTMLImageElement && image.hidden;
  }, {}, charsSelector);
}

export async function runGraphicsBrowser(browser, base) {
  const page = await browser.newPage();
  const errors = [];
  let rendered = 0;
  let localGraphicsFixtures = null;
  let localGraphicsFixtureError = null;
  try { localGraphicsFixtures = loadLocalGraphicsFixtures(); }
  catch (error) { localGraphicsFixtureError = error.stack ?? String(error); }
  if (localGraphicsFixtureError) errors.push(localGraphicsFixtureError);
  else if (EXPECT_STATIC_METADATA && !localGraphicsFixtures) {
    errors.push('Static graphics acceptance requires hash-pinned local fixtures; set GB_E2E_GRAPHICS_ARCHIVE, GB_E2E_GRAPHICS_CHARS_LBM, GB_E2E_GRAPHICS_RESTYLE_PNG and GB_E2E_GRAPHICS_SOURCE_PNG.');
  }
  let reviewInventoryRequests = 0;
  let censusRequests = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/restyle/cok-generated/manifest.json')) reviewInventoryRequests++;
    if (isCensusData(request.url())) censusRequests++;
  });

  const open = async (query) => {
    reviewInventoryRequests = 0;
    const url = new URL(base.endsWith('/') ? base : `${base}/`);
    url.search = new URLSearchParams(query).toString();
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(query.restyle ? '.rs-page h1' : query.sourceCoverage ? '[data-source-census-scope]'
      : query.coverage ? '[data-coverage-scope]' : '.gbx-page .gbx-panel h2');
  };

  try {
    await open({ graphics: '1', id: 'PIC1_057' });
    assert.equal(await page.$eval('.gbx-panel h2', (node) => node.textContent), 'Choose a matching source identity');
    const ambiguousCandidates = await page.$$eval('.gbx-panel [data-id-candidate]', (nodes) => nodes.map((node) => node.dataset.idCandidate));
    assert.ok(ambiguousCandidates.length > 1 && ambiguousCandidates.every((id) => id.includes('/')),
      'ambiguous short aliases should offer archive-qualified source IDs instead of picking a registry row');
    await page.click('.gbx-panel [data-id-candidate]');
    assert.ok(new URL(page.url()).searchParams.get('id')?.includes('/'), 'choosing a result should bookmark its canonical ID');
    await open({ graphics: '1', id: 'PIC1_999' });
    assert.equal(await page.$eval('.gbx-panel h2', (node) => node.textContent), 'Source identity not found');

    await open({ graphics: '1', id: CPK57 });
    assert.equal(await page.$eval('.gbx-panel h2', (node) => node.textContent), CPK57);
    assert.ok(await page.$$eval('[data-asset-id]', (nodes) => nodes.length > 0 && nodes.length <= 48),
      'source identity navigation should render one bounded page instead of thousands of rows');
    const firstAssetPage = await page.$eval('[data-asset-page]', (node) => node.textContent);
    await page.click('[data-asset-next]');
    assert.notEqual(await page.$eval('[data-asset-page]', (node) => node.textContent), firstAssetPage);
    assert.ok(await page.$$eval('[data-asset-id]', (nodes) => nodes.length > 0 && nodes.length <= 48));
    await open({ graphics: '1', id: CPK57 });
    assert.equal(await page.$eval('.gbx-panel h2', (node) => node.textContent), CPK57,
      'canonical direct links restore the selected identity after paging');
    await page.select('[aria-label="Source platform"]', 'Amiga');
    assert.ok(await page.$$eval('[data-asset-id]', (nodes) => nodes.length > 0 && nodes.every((node) => node.dataset.assetId.includes('/amiga/'))),
      'source platform filter should constrain the canonical asset list');
    await page.select('[aria-label="Source edition"]', 'Amiga disk 2 candidate copy');
    await page.select('[aria-label="Source identity status"]', 'candidate');
    assert.ok(await page.$$eval('[data-asset-id]', (nodes) => nodes.length > 0 && nodes.every((node) => node.dataset.assetId.includes('/amiga/'))),
      'normalized edition and identity filters should compose with platform');
    const assetFilterUrl = new URL(page.url());
    assert.equal(assetFilterUrl.searchParams.get('assetPlatform'), 'Amiga');
    assert.equal(assetFilterUrl.searchParams.get('assetEdition'), 'Amiga disk 2 candidate copy');
    assert.equal(assetFilterUrl.searchParams.get('assetIdentity'), 'candidate');
    rendered++;
    await open({ graphics: '1', id: CPK57 });
    assert.equal(await page.$eval('.gbx-panel h2', (node) => node.textContent), CPK57);
    assert.match(await page.$eval('.gbx-panel', (node) => node.textContent), /Restyle lineage \(1 records · 1 distinct output hashes\)/);
    await page.waitForSelector('.gbx-panel [data-role="exact-restyle-link"]');
    const generatedHref = await page.$eval('.gbx-panel [data-role="exact-restyle-link"]', (node) => node.href);
    assert.equal(new URL(generatedHref).searchParams.get('gallery'), 'asset-0003-006b4f69ee9f');
    rendered++;
    await open({ graphics: '1', id: AMIGA_PIC57 });
    assert.equal(await page.$eval('.gbx-panel h2', (node) => node.textContent), AMIGA_PIC57);
    assert.match(await page.$eval('.gbx-panel', (node) => node.textContent), /restyle\/cok-amiga-pic1-057/);
    const acceptedSelector = '.gbx-panel img[alt="accepted-restyle"]';
    await page.waitForFunction((query) => {
      const image = document.querySelector(query);
      return image instanceof HTMLImageElement && ((image.complete && image.naturalWidth > 0)
        || image.closest('figure')?.textContent.includes('select the local Restyle image folder to view this artwork'));
    }, { timeout: 15000 }, acceptedSelector);
    const accepted = await page.$eval(acceptedSelector, (image) => ({
      loaded: image.complete && image.naturalWidth > 0, src: image.currentSrc || image.src,
      hidden: image.hidden, caption: image.closest('figure')?.textContent ?? '',
    }));
    if (EXPECT_STATIC_METADATA) {
      assert.equal(accepted.loaded, false, 'Static production keeps artwork local until a Restyle folder is selected');
      assert.equal(accepted.hidden, true);
      assert.match(accepted.caption, /select the local Restyle image folder to view this artwork/);
    } else if (accepted.loaded) {
      assert.equal(accepted.src, new URL('./restyle/out/043_cok_amiga_daa_cok_pic1_pic1_057_f0.png', page.url()).href,
        'Development preview must load through its exact curated fallback, not the raw-generation copy');
      assert.equal(accepted.hidden, false);
    } else {
      assert.equal(accepted.hidden, true);
      assert.match(accepted.caption, /select the local Restyle image folder to view this artwork/);
    }
    rendered++;
    for (const id of PIC1_023_ANIMATION_SOURCES) {
      await open({ graphics: '1', id });
      await page.waitForSelector('[data-animation-id="cok-pic1-023"]');
      assert.deepEqual(await page.$eval('[data-hub-frame]', (node) => node.textContent), 'Step 1/5 · r0 · restyled frame 0; shared basis for every change');
      assert.match(await page.$eval('[data-restyle-hub-animations]', (node) => node.textContent), /r0 → r1 → r0 → r2 → r0/);
      assert.match(await page.$eval('[data-restyle-hub-animations]', (node) => node.textContent), /hub1_prompt\.txt/);
    }
    await open({ graphics: '1', id: 'cok/amiga/disk3/pic2.daa/block/24/frame/0' });
    await page.waitForSelector('[data-animation-id="cok-pic2-024"]');
    assert.match(await page.$eval('[data-restyle-hub-animations]', (node) => node.textContent), /r0 → r1 → r0 → r2 → r0 → r3 → r0/);
    assert.equal(reviewInventoryRequests, 1, 'source detail makes one lazy inventory request for its hub previews');

    // Review mode is read-only: category counts use different units, never a summed total.
    await open({ graphics: '1', review: 'unknown-consumer' });
    assert.equal(reviewInventoryRequests, 0, 'non-gallery review queues do not fetch the generated inventory');
    const savedBeforeReview = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort()));
    assert.equal(await page.$eval('[aria-label="Browse graphics by"]', (node) => node.value), 'review');
    assert.match(await page.$eval('[data-review-summary]', (node) => node.textContent), /Unknown descriptions: \d+ sources.*Unknown frame semantics: \d+ groups/);
    assert.ok(await page.$$eval('[data-review-key]', (nodes) => nodes.length > 0 && nodes.length <= 48));
    const firstReviewKey = await page.$eval('[data-review-key]', (node) => node.dataset.reviewKey);
    await page.click('[data-review-next]');
    assert.notEqual(await page.$eval('[data-review-key]', (node) => node.dataset.reviewKey), firstReviewKey);
    assert.equal(new URL(page.url()).searchParams.get('reviewPage'), '1');
    await page.select('[aria-label="Review queue platform"]', 'DOS-EGA');
    await page.type('[aria-label="Search game graphics"]', 'wildcom.dax');
    assert.ok(await page.$$eval('[data-review-key]', (nodes) => nodes.every((node) => node.dataset.reviewKey.includes('/dos-ega/') && node.dataset.reviewKey.includes('/wildcom.dax/'))));
    await page.click('[data-review-source-id]');
    assert.equal(new URL(page.url()).searchParams.has('review'), false);
    assert.match(new URL(page.url()).searchParams.get('id'), /wildcom\.dax/);
    assert.equal(await page.evaluate(() => JSON.stringify(Object.entries(localStorage).sort())), savedBeforeReview);
    rendered++;

    await open({ graphics: '1', review: 'unknown-animation' });
    assert.ok(await page.$$eval('[data-review-key]', (nodes) => nodes.length > 0));
    assert.match(await page.$eval('.gbx-panel', (node) => node.textContent), /unknown/);
    rendered++;

    await open({ graphics: '1', review: 'missing-visual-description' });
    const missingVisualIds = await page.$$eval('[data-review-key]', (nodes) => nodes.map((node) => node.dataset.reviewKey));
    assert.equal(missingVisualIds.length, 1923,
      'all CoK sources and 691 reviewed DoK appearances have visual descriptions; the other DoK sources remain queued');
    assert.ok(missingVisualIds.every((id) => id.startsWith('dok/')),
      'the current missing-description queue should contain only DoK source IDs');
    assert.match(await page.$eval('[data-review-summary]', (node) => node.textContent), /Missing visual descriptions: 1923 sources/);
    rendered++;

    for (const id of [AMIGA_CPIC1_1, AMIGA_CPIC1_129]) {
      await open({ graphics: '1', id });
      await page.waitForSelector('.gbx-panel [data-role="frame-hypothesis-link"]');
      const href = await page.$eval('.gbx-panel [data-role="frame-hypothesis-link"]', (node) => node.href);
      const params = new URL(href).searchParams;
      assert.equal(params.get('review'), 'frame-hypotheses');
      assert.equal(params.get('q'), id);
    }
    await open({ graphics: '1', review: 'frame-hypotheses', q: AMIGA_CPIC1_129 });
    await page.waitForSelector(`[data-review-key="${CPIC_HYPOTHESIS}"]`);
    assert.match(await page.$eval('.gbx-panel', (node) => node.textContent), /unverified/i);
    assert.equal(await page.$$eval('[data-role="frame-hypothesis-sources"] figure', (nodes) => nodes.length), 2,
      'the hypothesis review should show only its two direct source images side by side');
    assert.equal(await page.$$eval('.gbx-panel .gbx-anim-controls, .gbx-panel [data-role="animation-play"]', (nodes) => nodes.length), 0,
      'an open hypothesis must not acquire animation controls');
    rendered++;

    await open({ graphics: '1', id: PIXEL_IDENTICAL_RESTYLE_REUSE });
    await page.waitForSelector('[data-role="restyle-reuse-inspector"] [data-role="restyle-reuse-candidate"]');
    assert.equal(await page.$eval('[data-role="restyle-reuse-inspector"]', (node) => node.dataset.generationRecommendation), 'none');
    assert.match(await page.$eval('[data-role="restyle-reuse-inspector"]', (node) => node.textContent), /review leads, not assignments or runtime approvals/);
    assert.equal(await page.$$eval('[data-role="restyle-reuse-inspector"] [data-role="restyle-reuse-candidate"]', (nodes) => nodes.length), 1,
      'reuse inspection should show only direct verified pixel-identical candidates');
    assert.match(await page.$eval('[data-role="restyle-reuse-candidate"]', (node) => node.textContent), /cok\/amiga\/disk3\/8x8d2\.daa\/block\/14\/tile\/49/);
    rendered++;

    await open({ graphics: '1', review: 'unresolved-gallery' });
    await page.waitForFunction(() => {
      const state = document.querySelector('[data-review-inventory-state]')?.dataset.reviewInventoryState;
      return state === 'ready' || state === 'unavailable';
    });
    const inventoryState = await page.$eval('[data-review-inventory-state]', (node) => node.dataset.reviewInventoryState);
    assert.equal(reviewInventoryRequests, 1, 'Gallery queue loads its packaged inventory once on demand');
    if (EXPECT_STATIC_METADATA) assert.equal(inventoryState, 'ready', 'Static candidate must supply the validated gallery metadata');
    if (inventoryState === 'ready') {
      await page.waitForSelector('[data-review-key="asset-1287-800f03742f9b"]');
      assert.deepEqual(await page.$$eval('[data-review-key]', (nodes) => nodes.map((node) => node.dataset.reviewKey)),
        ['asset-1287-800f03742f9b']);
      assert.match(await page.$eval('.gbx-panel', (node) => node.textContent), /does not establish individual alias locator resolution/);
      const unresolvedHref = await page.$eval('.gbx-panel a', (node) => node.href);
      assert.equal(new URL(unresolvedHref).searchParams.get('gallery'), 'asset-1287-800f03742f9b');
    } else {
      assert.match(await page.$eval('[data-review-inventory-state]', (node) => node.textContent), /unavailable/);
      assert.equal(await page.$$eval('[data-review-key]', (nodes) => nodes.length), 0);
    }
    rendered++;

    await open({ graphics: '1', id: 'CPIC1_057' });
    assert.equal(await page.$eval('.gbx-panel h2', (node) => node.textContent), CPK57,
      'the familiar archive/block alias should resolve to the canonical source ID');
    rendered++;

    await open({ restyle: '1', curated: 'scene_cok_cottage' });
    await page.waitForSelector('[data-curated-id="scene_cok_cottage"] [data-role="exact-source-link"]');
    const curatedHref = await page.$eval('[data-curated-id="scene_cok_cottage"] [data-role="exact-source-link"]', (node) => node.href);
    assert.equal(new URL(curatedHref).searchParams.get('id'), COTTAGE,
      'the curated before/after card should link to its source-qualified identity');
    await page.goto(curatedHref, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((id) => document.querySelector('.gbx-panel h2')?.textContent === id, {}, COTTAGE);
    assert.match(await page.$eval('.gbx-panel', (node) => node.textContent), /Curated before\/after cards \(1\)/);
    await page.waitForSelector('.gbx-panel [data-role="exact-restyle-link"]');
    const reverseHref = await page.$eval('.gbx-panel [data-role="exact-restyle-link"]', (node) => node.href);
    assert.equal(new URL(reverseHref).searchParams.get('curated'), 'scene_cok_cottage');
    rendered++;

    await open({ graphics: '1', id: BODY2 });
    const duplicatePanel = await page.$eval('.gbx-panel', (node) => node.textContent);
    assert.match(duplicatePanel, /cok\/dos-ega\/disk1\/body3\.dax\/block\/68\/frame\/0/);
    assert.match(duplicatePanel, /pixel-identical/);
    rendered++;

    await open({ graphics: '1', id: SPRIT1 });
    const controls = await page.$('.gbx-anim-controls');
    assert.ok(controls, 'the registered zoom-distance frame group should be inspectable');
    assert.equal(await page.$eval('.gbx-anim-controls input[type="range"]', (node) => node.getAttribute('aria-label')), 'Select distance view');
    assert.equal(await page.$eval('.gbx-anim-controls input[type="range"]', (node) => node.max), '2');
    assert.equal(await page.$$eval('.gbx-anim-controls button', (nodes) => nodes.some((node) => !node.hidden)), false,
      'zoom/distance frames must not be presented as temporal playback');
    await page.$eval('.gbx-anim-controls input[type="range"]', (node) => {
      node.value = '1'; node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    assert.match(await page.$eval('.gbx-anim-controls .gbx-small', (node) => node.textContent), /2\/3.*frame\/1/);
    await page.$eval('.gbx-anim-controls input[type="range"]', (node) => node.dispatchEvent(new Event('change', { bubbles: true })));
    await page.waitForFunction((id) => document.querySelector('.gbx-panel h2')?.textContent === id, {}, SPRIT1_MIDDLE);
    assert.equal(new URL(page.url()).searchParams.get('id'), SPRIT1_MIDDLE,
      'confirming a different source frame should select and bookmark its canonical identity');
    const middleFramePanel = await page.$eval('.gbx-panel', (node) => node.textContent);
    assert.match(middleFramePanel, /Same armored warrior as SPRIT1 block 1 frame 0, rendered at the middle zoom\/distance/,
      'the source description should follow the selected frame');
    assert.match(middleFramePanel, /restyle\/cok-dos-sprit1-b001-f1/,
      'Restyle lineage should follow the selected frame');
    rendered++;

    await open({ graphics: '1', id: AMIGA_SPRIT1 });
    assert.match(await page.$eval('.gbx-panel', (node) => node.textContent), /unknown/i);
    assert.equal(await page.$eval('.gbx-anim-controls input[type="range"]', (node) => node.getAttribute('aria-label')), 'Select frame');
    assert.equal(await page.$$eval('.gbx-anim-controls button', (nodes) => nodes.some((node) => !node.hidden)), false,
      'unknown frame groups must not be presented as temporal playback');
    rendered++;

    await open({ restyle: '1' });
    await page.click('[data-role="graphics-coverage-link"]');
    await page.waitForSelector('[data-coverage-scope]');
    assert.match(await page.$eval('[data-coverage-scope]', (node) => node.textContent), /incomplete.*bounded DOS ECL traversal.*unverified/);
    assert.match(await page.$eval('[data-coverage-view]', (node) => node.textContent), /192 physical sites, 267 distinct ordered rosters, 221 entry\/site associations and 323 entry\/variant associations/);
    assert.match(await page.$eval('[data-coverage-view]', (node) => node.textContent), /51\/61 bank-qualified picture IDs/);
    assert.equal(await page.$$eval('[data-coverage-demo-slot]', (nodes) => nodes.length), 15);
    assert.match(await page.$eval('[data-coverage-demo] summary', (node) => node.textContent), /6 distinct CPIC2/);
    assert.equal(await page.$$eval('[data-coverage-request]', (nodes) => nodes.length), 48);
    await page.click('[data-coverage-next]');
    assert.equal(new URL(page.url()).searchParams.get('coveragePage'), '1');
    await page.select('[aria-label="Coverage consumer"]', 'combat-icons');
    await page.select('[aria-label="Coverage mapping state"]', 'unmapped');
    await page.waitForSelector(`button[data-coverage-source="${CPIC1_UNMAPPED}"]`);
    await page.click(`button[data-coverage-source="${CPIC1_UNMAPPED}"]`);
    await page.waitForFunction((id) => document.querySelector('.gbx-panel h2')?.textContent === id, {}, CPIC1_UNMAPPED);
    assert.equal(new URL(page.url()).searchParams.has('coverage'), false);
    rendered++;

    for (const [id, expected] of [[CPIC1_MAPPED, /combat\/CPIC1\/8.*runtime-declared/], [HELD_PLAYER_BODY, /Composition.*held/]]) {
      await open({ graphics: '1', id });
      await page.click('[data-source-coverage] > summary');
      await page.waitForFunction(() => document.querySelector('[data-source-coverage]')?.textContent.includes('Incomplete static coverage.'));
      assert.match(await page.$eval('[data-source-coverage]', (node) => node.textContent), expected);
    }
    rendered++;

    await open({ graphics: '1', coverage: '1', coverageRequest: 'combat-site/ECL2.DAX/64/1496/' });
    await page.waitForSelector('[data-coverage-mapping="combat/CPIC2/23"]');
    assert.ok(await page.$$eval('[data-coverage-variant]', (nodes) => nodes.length >= 2));
    await page.select('[aria-label="Coverage consumer"]', 'dialogue-pictures');
    await page.select('[aria-label="Coverage mapping state"]', 'unresolved');
    await page.waitForFunction(() => document.querySelector('[data-coverage-view] .gbx-panel')?.textContent.includes('Source unresolved.'));
    assert.equal(await page.$$eval('[data-coverage-view] .gbx-panel [data-coverage-source]', (nodes) => nodes.length), 0);
    assert.ok(await page.$('[data-coverage-scope]'));
    await page.click('[data-coverage-view] a[href="?restyle=1"]');
    await page.waitForSelector('.rs-page h1');
    rendered++;

    await open({ graphics: '1', id: CPK57 });
    assert.equal(censusRequests, 0, 'source, Restyle and runtime views leave the census data unloaded');
    await page.select('[aria-label="Browse graphics by"]', 'sourceCoverage');
    await page.waitForSelector('[data-source-census-scope]');
    assert.equal(censusRequests, 1);
    assert.match(await page.$eval('[data-census-summary="DOS-EGA"]', (node) => node.textContent), /538 stored entries.*2423 exact bindings/);
    assert.match(await page.$eval('[data-census-summary="Amiga"]', (node) => node.textContent), /46 roster occurrences.*Total drawable count: Unknown/);
    assert.match(await page.$eval('[data-census-unresolved]', (node) => node.textContent), /686 unresolved registry records/);
    await page.select('[aria-label="Browse graphics by"]', 'assets');
    await page.select('[aria-label="Browse graphics by"]', 'sourceCoverage');
    await page.waitForSelector('[data-source-census-scope]');
    assert.equal(censusRequests, 1, 'the validated model is reused in the same document');
    rendered++;

    await open({ graphics: '1', sourceCoverage: '1', sourceSet: 'dos-install', sourceFile: 'dos-install/8X8D1.DAX', sourceEntry: '0' });
    assert.equal(await page.$$eval('[data-census-child]', (nodes) => nodes.length), 40);
    assert.match(await page.$eval('[data-census-file-detail]', (node) => node.textContent), /Selected TOC ordinal 0 · block/);
    await open({ graphics: '1', sourceCoverage: '1', sourceSet: 'dos-install', sourceFile: 'dos-install/CPIC1.DAX', sourceEntry: '49', keep: 'yes' });
    await page.click(`[data-census-source="${CPK57}"]`);
    await page.waitForFunction((id) => document.querySelector('.gbx-panel h2')?.textContent === id, {}, CPK57);
    const canonical = new URL(page.url()).searchParams;
    assert.equal(canonical.get('id'), CPK57);
    assert.equal(canonical.get('keep'), 'yes');
    assert.equal(canonical.has('sourceCoverage'), false);
    assert.equal(canonical.has('sourceFile'), false);
    rendered++;

    await page.setCacheEnabled(false);
    await page.setRequestInterception(true);
    let holdCensus = false;
    const captureCensus = (request) => {
      if (holdCensus && isCensusData(request.url())) holdCensus = false;
      else void request.continue().catch(() => {});
    };
    page.on('request', captureCensus);
    try {
      await open({ graphics: '1', id: CPK57 });
      holdCensus = true;
      const held = page.waitForRequest((request) => isCensusData(request.url()), { timeout: 10_000 });
      await page.select('[aria-label="Browse graphics by"]', 'sourceCoverage');
      const request = await held;
      await page.select('[aria-label="Browse graphics by"]', 'assets');
      await request.abort();
      await page.waitForSelector('.gbx-layout:not([hidden]) .gbx-panel h2');
      assert.equal(await page.$('[data-source-census-scope]'), null);
      await page.select('[aria-label="Browse graphics by"]', 'sourceCoverage');
      await page.waitForFunction(() => document.querySelector('[data-source-census]')?.textContent.includes('Source inventory unavailable.'));
      assert.ok(await page.$('[data-source-census] button'));
      await page.select('[aria-label="Browse graphics by"]', 'assets');
      await page.waitForSelector('.gbx-layout:not([hidden]) .gbx-panel h2');
      rendered++;
    } finally {
      page.off('request', captureCensus);
      await page.setRequestInterception(false);
    }

    if (localGraphicsFixtures && EXPECT_STATIC_METADATA) {
      await verifyLocalGraphicsInputs(page, open, localGraphicsFixtures);
      rendered++;
    }
  } catch (error) {
    errors.push(error.stack ?? String(error));
  } finally {
    await page.close().catch(() => {});
  }

  return { id: 'graphics-browser', label: 'Source IDs, Restyle links, duplicate locators and frame semantics',
    rendered, min: 18, bad: [], errors, pass: rendered >= 18 && errors.length === 0 };
}
