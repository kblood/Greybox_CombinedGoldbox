// Candidate-only acceptance. Authored under the spawn EPERM hold; execution remains held.
// Uses the existing e2e browser and an already-served candidate, never a dev module or substitution.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const SOURCE = 'assets/Champions of Krynn/TITLE.DAX';
const SOURCE_SHA = '5276ba718f3c31018c25852f0b6858a292aed5a94f8bd938803961bb1ade0a00';
// Independent review pins and placements: do not construct this oracle from a runtime manifest.
const PNGS = [
  ['TITLE_001_restyle.png', 'c249541adb4d6b29d9c0de8adedfc81a22244a90fed4aa7938c92c725ed0e886'],
  ['TITLE_002_restyle.png', '429c8f4336ef06724fcc08428e663f746b2c84563b2bcb0ef765eea3b1d26c98'],
  ['TITLE_003_restyle.png', '608e3dee3f53cab258160438e773e741711aad4b2b0b82c4089b07519b709188'],
  ['TITLE_004_restyle.png', '8eab1dd63fe9df2bb670b5655cb873920826684e06cc7270992e71ad7f7ae7fe'],
];

export function cokTitleCandidateSelectionError(only, candidateDirectory, externalBase) {
  if (only.has('cok-title-restyle-static') && (!candidateDirectory || !externalBase)) {
    return 'cok-title-restyle-static requires both GB_COK_TITLE_DIST_DIR and GB_E2E_BASE_URL; no dev-server fallback';
  }
  if (candidateDirectory && !externalBase) {
    return 'GB_COK_TITLE_DIST_DIR requires GB_E2E_BASE_URL serving that complete candidate; no dev-server fallback';
  }
  return null;
}

/** Bind the built document and its single JS/CSS entry to files within the candidate. */
export function cokTitleCandidateEntries(candidateDirectory, base) {
  const root = realpathSync(resolve(candidateDirectory)), site = new URL(base);
  assert.ok(['http:', 'https:'].includes(site.protocol) && !site.search && !site.hash && !site.username && !site.password,
    'Candidate base must be an HTTP(S) directory URL without query, fragment or credentials');
  site.pathname = `${site.pathname.replace(/\/+$/, '')}/`;
  const index = readFileSync(join(root, 'index.html'));
  const html = index.toString('utf8').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!/<base\b/i.test(html), 'Candidate HTML must not override the served base URL');
  const scripts = [], styles = [];
  for (const [, tag, text] of html.matchAll(/<(script|link)\b([^>]*)>/gi)) {
    const attrs = new Map();
    for (const [, name, double, single, bare] of text.matchAll(/\b(type|src|href|rel)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
      const key = name.toLowerCase();
      assert.ok(!attrs.has(key), `Ambiguous candidate ${tag} attribute: ${key}`);
      attrs.set(key, double ?? single ?? bare);
    }
    if (tag.toLowerCase() === 'script') {
      assert.equal(attrs.get('type')?.toLowerCase(), 'module', 'Candidate script must be an unambiguous built module entry');
      scripts.push(attrs.get('src'));
    }
    if (tag.toLowerCase() === 'link' && attrs.get('rel')?.toLowerCase().split(/\s+/).includes('stylesheet')) styles.push(attrs.get('href'));
  }
  assert.equal(scripts.length, 1, 'Candidate HTML must name exactly one built JS module entry');
  assert.equal(styles.length, 1, 'Candidate HTML must name exactly one built CSS entry');
  const decodePath = (path) => path.split('/').map((part) => {
    const decoded = decodeURIComponent(part);
    assert.ok(!/[\\/\0]/.test(decoded), 'Candidate URL contains an encoded path separator');
    return decoded;
  }).join('/');
  const basePath = decodePath(site.pathname), assets = new Map();
  for (const [reference, extension] of [[scripts[0], /\.m?js$/i], [styles[0], /\.css$/i]]) {
    assert.ok(reference, 'Candidate entry reference is absent');
    const url = new URL(reference, site), path = decodePath(url.pathname);
    assert.ok(url.origin === site.origin && !url.search && !url.hash && path.startsWith(basePath),
      `Candidate entry escapes the served base: ${reference}`);
    const local = path.slice(basePath.length);
    assert.ok(local.startsWith('assets/') && extension.test(local), `Candidate entry is not a built asset: ${reference}`);
    const file = realpathSync(resolve(root, ...local.split('/'))), rel = relative(root, file);
    assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel), `Candidate entry escapes its directory: ${reference}`);
    assets.set(url.href, sha(readFileSync(file)));
  }
  return { site: site.href, indexSha256: sha(index), assets };
}

export function assertCokTitleCandidateResponse(url, status, bytes, expected) {
  assert.ok(expected.has(url), `Unexpected candidate response URL: ${url}`);
  assert.equal(status, 200, `Candidate response status: ${url}`);
  assert.equal(sha(bytes), expected.get(url), `Actual packaged response differs: ${url}`);
}

/** Independent DOS TOC/RLE/byte-17 walk, without the engine decoder/compositor. */
function dosScreens(archive) {
  assert.equal(sha(archive), SOURCE_SHA);
  assert.equal(archive.length, 57528);
  assert.equal(archive.readUInt16LE(0), 36);
  const blocks = new Map();
  for (let entry = 2; entry < 38; entry += 9) {
    const id = archive[entry], start = 38 + archive.readUInt32LE(entry + 1);
    const raw = [], end = start + archive.readUInt16LE(entry + 7);
    for (let pos = start; pos < end;) {
      const control = archive[pos++];
      if (control < 128) for (let count = control + 1; count > 0; count--) raw.push(archive[pos++]);
      else { const value = archive[pos++]; for (let count = 256 - control; count > 0; count--) raw.push(value); }
    }
    assert.equal(raw.length, archive.readUInt16LE(entry + 5));
    const bytes = Buffer.from(raw), width = bytes.readUInt16LE(2) * 8, height = bytes.readUInt16LE(0);
    assert.equal(raw.length, 17 + width * height / 2);
    const indices = [];
    for (const packed of bytes.subarray(17)) indices.push(packed >> 4, packed & 15);
    blocks.set(id, { width, height, indices });
  }
  const palette = ['000000','0000aa','00aa00','00aaaa','aa0000','aa00aa','aa5500','aaaaaa',
    '555555','5555ff','55ff55','55ffff','ff5555','ff55ff','ffff55','ffffff']
    .map((hex) => [...Buffer.from(hex, 'hex'), 255]);
  return [[[1,0,0]], [[2,0,0],[3,40,8]], [[2,0,0],[4,0,8]]].map((layers) => {
    const rgba = Buffer.alloc(320 * 200 * 4);
    for (const [id, left, top] of layers) {
      const block = blocks.get(id);
      for (let y = 0; y < block.height; y++) for (let x = 0; x < block.width; x++) {
        rgba.set(palette[block.indices[y * block.width + x]], ((top + y) * 320 + left + x) * 4);
      }
    }
    return rgba.toString('base64');
  });
}

export async function runCokTitleRestyleStatic(browser, base, candidateDirectory) {
  const errors = [], pages = [], responses = [];
  let rendered = 0;
  try {
    assert.ok(candidateDirectory, 'Set GB_COK_TITLE_DIST_DIR to the complete candidate served by GB_E2E_BASE_URL');
    const root = resolve(candidateDirectory);
    assert.ok(existsSync(join(root, 'index.html')), 'Candidate index.html is missing');
    const archive = readFileSync(join(root, SOURCE)), originals = dosScreens(archive);
    const imports = PNGS.map(([name, hash]) => {
      const bytes = readFileSync(join(root, 'restyle/cok/title', name));
      assert.equal(sha(bytes), hash, `Candidate title PNG ${name} differs from the reviewed import`);
      return bytes.toString('base64');
    });
    const entries = cokTitleCandidateEntries(root, base), site = entries.site;
    const urlFor = (path) => new URL(path.split('/').map(encodeURIComponent).join('/'), site).href;
    const expected = new Map([...entries.assets, [urlFor(SOURCE), SOURCE_SHA],
      ...PNGS.map(([name, hash]) => [urlFor(`restyle/cok/title/${name}`), hash])]);
    async function bindDocument(response) {
      assert.ok(response, 'Candidate navigation returned no HTML response');
      const url = new URL(response.url()); url.search = ''; url.hash = '';
      assertCokTitleCandidateResponse(url.href, response.status(), await response.buffer(), new Map([[site, entries.indexSha256]]));
    }

    async function open(initialMode = 'DOS-EGA') {
      const page = await browser.newPage(); pages.push(page);
      const requests = new Map();
      const received = new Set(), pageResponses = [];
      await page.setViewport({ width: 1280, height: 900 });
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        const url = request.url();
        if (/\/(?:src|@fs)(?:\/|$)/.test(new URL(url).pathname)) errors.push(`Forbidden development dependency: ${url}`);
        if (expected.has(url)) requests.set(url, (requests.get(url) ?? 0) + 1);
      });
      page.on('response', (response) => {
        const hash = expected.get(response.url());
        if (!hash) return;
        // Convert errors to values immediately so response promises cannot reject unobserved.
        const checked = response.buffer().then((bytes) => {
          assertCokTitleCandidateResponse(response.url(), response.status(), bytes, expected);
          received.add(response.url());
          return null;
        }).catch((error) => error.stack ?? String(error));
        responses.push(checked); pageResponses.push(checked);
      });
      await page.evaluateOnNewDocument((initialMode) => {
        // Tab-local seed runs once: reload must consume the mode that the UI actually persisted.
        if (sessionStorage.getItem('cok-title-static-seeded')) return;
        sessionStorage.setItem('cok-title-static-seeded', '1');
        localStorage.clear();
        localStorage.setItem('greybox.graphics.cok', initialMode);
        localStorage.setItem('greybox.party.cok', '[]');
        localStorage.setItem('greybox.cok-title-save-control', '{"bytes":[9,2,255],"clock":1234}');
      }, initialMode);
      await bindDocument(await page.goto(`${site}?intro=1`, { waitUntil: 'domcontentloaded', timeout: 45000 }));
      await page.waitForFunction('window.__intro?.frameCount === 3 && window.__gameAudio?.loaded()');
      await Promise.all(pageResponses);
      for (const url of entries.assets.keys()) assert.ok(received.has(url), `Built candidate entry was not received and verified: ${url}`);
      return { page, requests };
    }
    const select = async (page, mode) => {
      await page.click(`[data-cok-title-graphics] [data-runtime-graphics-mode="${mode}"]`);
      await page.waitForFunction((mode) => window.__intro.graphics().mode === mode
        && window.__intro.graphics().state === (mode === 'Restyle' ? 'ready' : 'original'), {}, mode);
    };
    const snapshot = async (page) => page.evaluate(() => ({
      index: window.__intro.index(), done: window.__intro.done(), disposed: window.__intro.disposed(),
      saved: Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.startsWith('greybox.graphics'))),
      audio: { game: window.__gameAudio.game(), scene: window.__gameAudio.scene(), platform: window.__gameAudio.platform(),
        enabled: window.__gameAudio.enabled(), changes: window.__gameAudio.sceneChanges() },
      menu: window.__titleMenu?.isOpen() ? { highlighted: window.__titleMenu.highlighted(), idleMs: window.__titleMenu.idleMs(),
        status: document.querySelector('#status')?.textContent } : null,
    }));
    async function expectPixels(page, index, restyle, leakedBlock3 = false) {
      const differences = await page.evaluate(async ({ original, pngs, index, restyle, leakedBlock3 }) => {
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        const target = document.querySelector('#output .gb-emu canvas'), rect = window.__intro.displayRect(), dpr = devicePixelRatio || 1;
        const expected = document.createElement('canvas'); expected.width = target.width; expected.height = target.height;
        const context = expected.getContext('2d'); context.imageSmoothingEnabled = false;
        context.fillStyle = '#000'; context.fillRect(0, 0, expected.width, expected.height);
        const dos = document.createElement('canvas'); dos.width = 320; dos.height = 200;
        dos.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(atob(original), (c) => c.charCodeAt(0)), 320, 200), 0, 0);
        context.drawImage(dos, rect.x*dpr, rect.y*dpr, rect.width*dpr, rect.height*dpr);
        if (restyle) {
          const layouts = [[[0,0,0,5]], [[1,0,0,5],[2,40,8,7]], [[1,0,0,5],[3,0,8,5]]];
          const layers = leakedBlock3 ? [[1,0,0,5],[2,40,8,7],[3,0,8,5]] : layouts[index];
          context.save(); context.beginPath(); context.rect(rect.x*dpr, rect.y*dpr, rect.width*dpr, rect.height*dpr); context.clip();
          for (const [block,x,y,scale] of layers) {
            const image = await createImageBitmap(new Blob([Uint8Array.from(atob(pngs[block]), (c) => c.charCodeAt(0))], {type:'image/png'}));
            context.drawImage(image, (rect.x+x*rect.width/320)*dpr, (rect.y+y*rect.height/200)*dpr,
              image.width/scale*rect.width/320*dpr, image.height/scale*rect.height/200*dpr);
            image.close();
          }
          context.restore();
        }
        const actual = target.getContext('2d').getImageData(0,0,target.width,target.height).data;
        const golden = context.getImageData(0,0,expected.width,expected.height).data;
        let differences = 0;
        for (let p=0;p<actual.length;p+=4) if (actual.slice(p,p+4).some((value,c)=>value!==golden[p+c])) differences++;
        return differences;
      }, { original: originals[index], pngs: imports, index, restyle, leakedBlock3 });
      if (leakedBlock3) assert.ok(differences > 0, 'Stacked block 3 under block 4 must differ from the accepted final screen');
      else assert.equal(differences, 0, `Screen ${index+1}: independent ${restyle ? 'Restyle' : 'DOS'} pixels`);
    }
    async function menu(page) {
      await page.evaluate('window.__intro.advance()');
      await page.waitForFunction('window.__titleMenu?.isOpen()');
      assert.equal(await page.evaluate('window.__intro.done()'), true);
    }

    const { page, requests } = await open();
    for (let index = 0; index < 3; index++) {
      await expectPixels(page, index, false);
      const before = await snapshot(page);
      for (const mode of ['Restyle', 'DOS-EGA', 'Amiga', 'DOS-EGA']) {
        await select(page, mode); await expectPixels(page, index, mode === 'Restyle');
        assert.deepEqual(await snapshot(page), before, `${mode} must preserve title, save and audio state`);
        if (mode === 'Amiga') assert.match(await page.$eval('[data-cok-title-graphics]', (node)=>node.textContent), /DOS title fallback/);
        assert.equal(await page.evaluate('localStorage.getItem("greybox.graphics.cok")'), mode);
      }
      if (index === 2) { await select(page, 'Restyle'); await expectPixels(page, index, true, true); }
      else await page.evaluate('window.__intro.advance()');
      rendered++;
    }
    assert.equal(requests.get(urlFor(SOURCE)), 1, 'App must fetch the candidate source archive');
    for (const [name] of PNGS) assert.equal(requests.get(urlFor(`restyle/cok/title/${name}`)), 1,
      'App must load all four actual packaged PNGs, sharing block 2 across both screens');
    await menu(page);
    const menuBefore = await snapshot(page);
    for (const mode of ['DOS-EGA','Amiga','Restyle']) {
      await select(page, mode); await expectPixels(page, 2, mode === 'Restyle');
      assert.deepEqual(await snapshot(page), menuBefore, 'Switching retained title art must preserve Play/Demo, save and audio state');
    }
    await page.focus('[data-cok-title-graphics] [data-runtime-graphics-mode="Restyle"]');
    await page.keyboard.press('Space'); await expectPixels(page, 2, true);
    assert.deepEqual(await snapshot(page), menuBefore, 'Selector Space must not confirm Play/Demo');
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('.');
    const demoHighlight = await snapshot(page);
    assert.equal(demoHighlight.menu.highlighted, 'demo');
    await select(page, 'DOS-EGA'); await expectPixels(page, 2, false);
    assert.deepEqual(await snapshot(page), demoHighlight, 'DOS restoration must retain Demo highlight and title state');
    await page.evaluate('window.__titleMenu.confirm()');
    await page.waitForFunction('window.__demo?.isPlaying()');
    await page.evaluate('window.__demo.pause()');
    assert.equal(await page.evaluate('window.__titleMenu.isOpen()'), false);
    assert.deepEqual((await snapshot(page)).saved, menuBefore.saved, 'Entering Demo must preserve stored game data');
    await page.evaluate('window.__demo.exit()');
    await page.waitForFunction('window.__titleMenu.isOpen()');
    await page.close();

    // Exercise real app callbacks in a fresh intro, without replacing menu handlers.
    const play = await open();
    await select(play.page, 'Restyle');
    await bindDocument(await play.page.reload({ waitUntil: 'domcontentloaded' }));
    await play.page.waitForFunction('window.__intro?.graphics()?.state === "ready" && window.__gameAudio?.loaded()');
    assert.equal(await play.page.evaluate('window.__intro.graphics().mode'), 'Restyle', 'Reload must consume persisted Restyle');
    await expectPixels(play.page, 0, true);
    await play.page.evaluate('window.__intro.advance(); window.__intro.advance()');
    await play.page.waitForFunction('window.__intro.graphics().state === "ready"');
    await expectPixels(play.page, 2, true); await menu(play.page);
    const saved = (await snapshot(play.page)).saved;
    await play.page.evaluate('window.__titleMenu.hotkey("p")');
    await play.page.waitForFunction('window.__mainmenu?.isOpen()');
    assert.equal(await play.page.evaluate('window.__titleMenu.isOpen()'), false);
    assert.deepEqual((await snapshot(play.page)).saved, saved, 'Entering Play must preserve stored game data');
    await play.page.close();

    const amiga = await open('Amiga');
    for (let index=0;index<3;index++) {
      await expectPixels(amiga.page, index, false);
      assert.equal(await amiga.page.evaluate('window.__intro.graphics().mode'), 'Amiga');
      if (index<2) await amiga.page.evaluate('window.__intro.advance()');
    }
    assert.equal([...amiga.requests.keys()].some((url) => url.includes('/restyle/cok/title/')), false,
      'Persisted Amiga must use DOS title fallback without requesting Restyles');
    await amiga.page.close();
  } catch (error) { errors.push(error.stack ?? String(error)); }
  finally {
    for (const page of pages) if (!page.isClosed()) await page.close();
    for (const error of await Promise.all(responses)) if (error) errors.push(error);
  }
  return { id: 'cok-title-restyle-static', label: 'Packaged CoK title: pinned responses, three compositions, restoration, persistence and real Play/Demo',
    rendered, min: 3, bad: [], errors, pass: rendered === 3 && errors.length === 0 };
}
