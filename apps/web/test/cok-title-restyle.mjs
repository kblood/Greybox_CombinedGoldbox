// Source-only acceptance definition, authored under the 2026-10-27 Vite spawn EPERM hold.
// Run through the existing e2e harness only after that hold is resolved. No fixture is copied.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const SOURCE_SHA = '5276ba718f3c31018c25852f0b6858a292aed5a94f8bd938803961bb1ade0a00';
// Independent pins/placements: never import the runtime manifest to construct the pixel oracle.
const IMPORTS = [
  ['001_band_cok_dos_ssi_presents.png', 'c249541adb4d6b29d9c0de8adedfc81a22244a90fed4aa7938c92c725ed0e886'],
  ['010_band_cok_title_art.png', '429c8f4336ef06724fcc08428e663f746b2c84563b2bcb0ef765eea3b1d26c98'],
  ['002_cok_dos_title_logo.png', '608e3dee3f53cab258160438e773e741711aad4b2b0b82c4089b07519b709188'],
  ['003_cok_dos_dragonlance_vol1.png', '8eab1dd63fe9df2bb670b5655cb873920826684e06cc7270992e71ad7f7ae7fe'],
];

/** Independent TOC/RLE/byte-17 pixel walk; no engine decoder/compositor in the DOS oracle. */
function dosScreens(archive) {
  assert.equal(sha(archive), SOURCE_SHA);
  const blocks = new Map();
  const toc = archive.readUInt16LE(0);
  assert.equal(toc, 36);
  for (let entry = 2; entry < toc + 2; entry += 9) {
    const id = archive[entry], start = toc + 2 + archive.readUInt32LE(entry + 1);
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

export async function runCokTitleRestyle(browser, base) {
  const errors = [], pages = [];
  let rendered = 0;
  try {
    const directory = process.env.GB_COK_TITLE_IMPORTS
      ?? 'C:/GoldBoxImg/cok_restyle_work/title-gallery-candidate-20261027/restyle/out';
    const imports = IMPORTS.map(([name, hash]) => {
      const bytes = readFileSync(join(directory, name));
      assert.equal(sha(bytes), hash, `External title fixture ${name} differs from reviewed import`);
      return bytes;
    });
    const sourcePath = process.env.GB_COK_TITLE_ARCHIVE
      ?? fileURLToPath(new URL('../../../Champions of Krynn/TITLE.DAX', import.meta.url));
    const archive = readFileSync(sourcePath), originals = dosScreens(archive);
    const engineUrl = `/@fs/${fileURLToPath(new URL('../../../packages/engine/src/index.ts', import.meta.url)).replaceAll('\\', '/')}`;

    async function open(initialMode = 'DOS-EGA', fault = null) {
      const page = await browser.newPage(); pages.push(page);
      const state = { fault, requests: [0,0,0,0], delayed: [] };
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const block = IMPORTS.findIndex((_, index) => new URL(request.url()).pathname
          .endsWith(`/restyle/cok/title/TITLE_${String(index + 1).padStart(3, '0')}_restyle.png`));
        if (block < 0) { void request.continue(); return; }
        state.requests[block]++;
        const activeFault = state.fault?.block === block + 1 ? state.fault.kind : null;
        const bytes = Buffer.from(imports[block]);
        if (activeFault === 'hash') bytes[bytes.length - 1] ^= 1;
        if (activeFault === 'geometry') bytes.writeUInt32BE(bytes.readUInt32BE(16) - 1, 16);
        const body = activeFault === 'corrupt' ? Buffer.alloc(bytes.length) : bytes;
        const respond = () => request.respond(activeFault === 'missing' ? { status: 404, body: 'missing' }
          : { status: 200, contentType: 'image/png', body });
        if (activeFault === 'delay') state.delayed.push(respond);
        else void respond().catch(() => undefined);
      });
      await page.evaluateOnNewDocument((initialMode) => {
        localStorage.clear();
        localStorage.setItem('greybox.graphics.cok', initialMode);
        localStorage.setItem('greybox.party.cok', '[]');
        localStorage.setItem('greybox.cok-title-save-control', '{"bytes":[9,2,255],"clock":1234}');
      }, initialMode);
      await page.goto(`${base}/?intro=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForFunction('window.__intro?.frameCount === 3');
      return { page, state };
    }
    async function select(page, mode) {
      await page.click(`[data-cok-title-graphics] [data-runtime-graphics-mode="${mode}"]`);
    }
    async function settled(page, state = 'ready') {
      await page.waitForFunction((state) => window.__intro.graphics().state === state, {}, state);
    }
    async function snapshot(page) {
      return page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const canvas = document.querySelector('#output .gb-emu canvas');
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pixels)), (b) => b.toString(16).padStart(2,'0')).join('');
        return { hash, index: window.__intro.index(), done: window.__intro.done(), graphics: window.__intro.graphics(),
          saved: Object.fromEntries(Object.entries(localStorage).filter(([key]) => !key.startsWith('greybox.graphics'))),
          audio: { game: window.__gameAudio.game(), scene: window.__gameAudio.scene(),
            platform: window.__gameAudio.platform(), enabled: window.__gameAudio.enabled(), changes: window.__gameAudio.sceneChanges() },
          menu: window.__titleMenu?.isOpen() ? { highlighted: window.__titleMenu.highlighted(), idleMs: window.__titleMenu.idleMs(),
            status: document.querySelector('#status')?.textContent } : null };
      });
    }
    async function expectPixels(page, index, restyle, mutant = false) {
      const result = await page.evaluate(async ({ original, pngs, index, restyle, mutant }) => {
        const target = document.querySelector('#output .gb-emu canvas'), rect = window.__intro.displayRect(), dpr = devicePixelRatio || 1;
        const expected = document.createElement('canvas'); expected.width = target.width; expected.height = target.height;
        const context = expected.getContext('2d'); context.imageSmoothingEnabled = false;
        context.fillStyle = '#000'; context.fillRect(0, 0, expected.width, expected.height);
        const bytes = Uint8ClampedArray.from(atob(original), (c) => c.charCodeAt(0));
        const dos = document.createElement('canvas'); dos.width = 320; dos.height = 200;
        dos.getContext('2d').putImageData(new ImageData(bytes, 320, 200), 0, 0);
        context.drawImage(dos, rect.x*dpr, rect.y*dpr, rect.width*dpr, rect.height*dpr);
        if (restyle) {
          const layouts = [[[0,0,0,5]], [[1,0,0,5],[2,40,8,7]], [[1,0,0,5],[3,0,8,5]]];
          const layers = mutant ? [[1,0,0,5],[2,40,8,7],[3,0,8,5]] : layouts[index];
          context.save(); context.beginPath(); context.rect(rect.x*dpr, rect.y*dpr, rect.width*dpr, rect.height*dpr); context.clip();
          for (const [block,x,y,scale] of layers) {
            const png = Uint8Array.from(atob(pngs[block]), (c) => c.charCodeAt(0));
            const image = await createImageBitmap(new Blob([png], {type:'image/png'}));
            context.drawImage(image, (rect.x+x*rect.width/320)*dpr, (rect.y+y*rect.height/200)*dpr,
              image.width/scale*rect.width/320*dpr, image.height/scale*rect.height/200*dpr);
            image.close();
          }
          context.restore();
        }
        const actual = target.getContext('2d').getImageData(0,0,target.width,target.height).data;
        const golden = context.getImageData(0,0,expected.width,expected.height).data;
        let differences = 0; for (let p=0;p<actual.length;p+=4) if (actual.slice(p,p+4).some((v,c)=>v!==golden[p+c])) differences++;
        return differences;
      }, { original: originals[index], pngs: imports.map((bytes) => bytes.toString('base64')), index, restyle, mutant });
      if (mutant) assert.ok(result > 0, 'The stacked #3+#4 negative control must differ from the real final screen');
      else assert.equal(result, 0, `Screen ${index + 1} must match independent ${restyle ? 'Restyle' : 'DOS'} composition`);
    }

    const { page, state } = await open();
    await page.waitForFunction('window.__gameAudio.loaded()');
    await page.evaluate(async () => {
      const graphics = await import('/src/ui/runtimeGraphicsMode.ts');
      graphics.writeRuntimeGraphicsMode('cok-natural-6', 'DOS-EGA');
    });
    assert.equal(await page.evaluate('localStorage.getItem("greybox.graphics.cok")'), 'DOS-EGA');
    for (let index = 0; index < 3; index++) {
      assert.equal((await snapshot(page)).index, index);
      await expectPixels(page, index, false);
      const before = await snapshot(page);
      await select(page, 'Restyle'); await settled(page); await expectPixels(page, index, true);
      const after = await snapshot(page);
      assert.deepEqual(after.saved, before.saved); assert.deepEqual(after.audio, before.audio);
      assert.equal(after.index, before.index); assert.equal(after.done, false);
      if (index === 2) await expectPixels(page, index, true, true);
      await select(page, 'Amiga'); await expectPixels(page, index, false);
      assert.equal(await page.evaluate('localStorage.getItem("greybox.graphics.cok")'), 'Amiga');
      assert.match(await page.$eval('[data-cok-title-graphics]', (node) => node.textContent), /DOS title fallback/);
      await select(page, 'DOS-EGA'); await expectPixels(page, index, false);
      assert.deepEqual((await snapshot(page)).saved, before.saved);
      if (index < 2) await page.evaluate('window.__intro.advance()');
      rendered++;
    }
    assert.deepEqual(state.requests, [1,1,1,1], 'Success cache shares fresh #2 art across both band screens');
    await page.evaluate('window.__intro.advance()');
    await page.waitForFunction('window.__titleMenu?.isOpen()');
    await page.evaluate(async () => {
      const menu = await import('/src/ui/titleMenu.ts');
      window.titleCallbacks = { play: 0, demo: 0 };
      window.reopenTitleMenu = () => menu.startTitleMenu({ idleMs: 600000,
        onPlay: () => window.titleCallbacks.play++, onDemo: () => window.titleCallbacks.demo++ });
      window.reopenTitleMenu();
    });
    const menuBefore = await snapshot(page);
    for (const mode of ['Restyle', 'Amiga', 'DOS-EGA']) {
      await select(page, mode);
      if (mode === 'Restyle') await settled(page);
      await expectPixels(page, 2, mode === 'Restyle');
      assert.deepEqual((await snapshot(page)).menu, menuBefore.menu,
        `${mode} switching must preserve Play/Demo highlight, idle duration and #status`);
    }
    await select(page, 'Restyle'); await settled(page); await expectPixels(page, 2, true);
    assert.deepEqual((await snapshot(page)).menu, menuBefore.menu);
    assert.deepEqual((await snapshot(page)).audio, menuBefore.audio);
    // A focused selector's Space key retries/selects graphics, never confirms Play/Demo.
    await page.focus('[data-cok-title-graphics] [data-runtime-graphics-mode="Restyle"]');
    await page.keyboard.press('Space'); await settled(page);
    assert.deepEqual((await snapshot(page)).menu, menuBefore.menu);
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('.');
    assert.equal((await snapshot(page)).menu.highlighted, 'demo');
    await select(page, 'DOS-EGA'); await expectPixels(page, 2, false);
    assert.equal((await snapshot(page)).menu.highlighted, 'demo');
    assert.equal((await snapshot(page)).menu.status, menuBefore.menu.status, 'DOS restoration must preserve title-menu #status');
    await page.evaluate('window.__titleMenu.confirm(); window.__titleMenu.confirm()');
    assert.deepEqual(await page.evaluate('window.titleCallbacks'), { play: 0, demo: 1 });
    await page.evaluate('window.reopenTitleMenu()');
    await select(page, 'Restyle'); await settled(page);
    await page.evaluate('window.__titleMenu.hotkey("p")');
    assert.deepEqual(await page.evaluate('window.titleCallbacks'), { play: 1, demo: 1 });
    await page.evaluate('window.reopenTitleMenu(); window.__titleMenu.fireTimeout(); window.__titleMenu.fireTimeout()');
    assert.deepEqual(await page.evaluate('window.titleCallbacks'), { play: 1, demo: 2 });
    await page.close();

    // Every dependency independently fails closed; normal advancement does not refetch failures.
    for (const kind of ['missing','corrupt','hash','geometry']) for (const block of [1,2,3,4]) {
      const sample = await open('DOS-EGA', { kind, block });
      const targetIndex = block === 1 ? 0 : block === 4 ? 2 : 1;
      for (let step=0;step<targetIndex;step++) await sample.page.evaluate('window.__intro.advance()');
      const before = await snapshot(sample.page);
      await select(sample.page, 'Restyle'); await settled(sample.page, 'failed');
      await expectPixels(sample.page, targetIndex, false);
      assert.equal(await sample.page.evaluate('localStorage.getItem("greybox.graphics.cok")'), 'Restyle');
      assert.deepEqual((await snapshot(sample.page)).saved, before.saved);
      if (block === 2) {
        await sample.page.evaluate('window.__intro.advance()'); await settled(sample.page, 'failed');
        assert.equal(sample.state.requests[1], 1, 'Shared failed #2 is not automatically retried on screen 3');
        await expectPixels(sample.page, 2, false);
      }
      sample.state.fault = null;
      await select(sample.page, 'Restyle'); await settled(sample.page);
      await expectPixels(sample.page, block === 2 ? 2 : targetIndex, true);
      assert.equal(sample.state.requests[block-1], 2, 'Explicit retry requests the failed file once');
      await sample.page.close();
    }

    // A delayed earlier frame or a disposed backdrop cannot overwrite a newer native frame/view.
    for (const action of ['mode','advance','remove','replace']) {
      const sample = await open('DOS-EGA', { kind: 'delay', block: 1 });
      await select(sample.page, 'Restyle');
      await sample.page.waitForFunction(() => window.__intro.graphics().state === 'loading');
      for (let wait=0;wait<200 && !sample.state.delayed.length;wait++) await new Promise((resolve)=>setTimeout(resolve,25));
      assert.equal(sample.state.delayed.length, 1);
      if (action === 'mode') await select(sample.page, 'DOS-EGA');
      if (action === 'advance') { await sample.page.evaluate('window.__intro.advance()'); await settled(sample.page); }
      if (action === 'remove') await sample.page.evaluate(() => { document.querySelector('#output').innerHTML='<div id="title-replacement">replacement</div>'; });
      if (action === 'replace') {
        await select(sample.page, 'DOS-EGA');
        await sample.page.evaluate(async () => { window.replacedTitleIntro = window.__intro; await (await import('/src/ui/intro.ts')).startIntro(); });
      }
      const before = action === 'remove' ? null : await snapshot(sample.page);
      for (const respond of sample.state.delayed.splice(0)) await respond().catch(()=>undefined);
      await sample.page.waitForNetworkIdle();
      if (action === 'remove') {
        assert.equal(await sample.page.evaluate('window.__intro.disposed()'), true);
        assert.equal(await sample.page.$eval('#output', (node)=>node.textContent), 'replacement');
      } else {
        assert.equal((await snapshot(sample.page)).hash, before.hash);
        if (action === 'replace') assert.equal(await sample.page.evaluate('window.replacedTitleIntro.disposed()'), true);
      }
      await sample.page.close();
    }

    // Prove source admission rejects mutation/geometry and the historical pixel-start regression.
    const sourceControl = await open();
    const admission = await sourceControl.page.evaluate(async (engineUrl) => {
      const engine = await import(engineUrl), catalog = await import('/src/ui/catalog.ts'), art = await import('/src/ui/cokTitleArt.ts');
      const bytes = new Uint8Array(await (await fetch(catalog.assetUrl('Champions of Krynn/TITLE.DAX'))).arrayBuffer());
      const decoded = engine.decodeAsset(bytes, 'TITLE.DAX');
      await art.validateCokTitleSource(bytes, decoded);
      const outcomes = [];
      for (const mutate of ['archive','geometry','pixels','id']) {
        const changed = engine.decodeAsset(bytes, 'TITLE.DAX'), input = bytes.slice();
        if (mutate==='archive') input[input.length-1]^=1;
        if (mutate==='geometry') changed.archive.blocks[1].image.width--;
        if (mutate==='id') changed.archive.blocks[1].blockId=1;
        if (mutate==='pixels') {
          const block=changed.archive.blocks[1];
          for(let p=0;p<block.image.indices.length;p+=2) { const value=block.raw[8+p/2]; block.image.indices[p]=value>>4;block.image.indices[p+1]=value&15; }
        }
        try { await art.validateCokTitleSource(input,changed); outcomes.push(false); } catch { outcomes.push(true); }
      }
      return outcomes;
    }, engineUrl);
    assert.deepEqual(admission, [true,true,true,true]);

    // Persisted initial selection is consumed before any click; Amiga remains a DOS title fallback.
    for (const initial of ['Restyle','Amiga']) {
      const inherited = await open(initial);
      if(initial==='Restyle') await settled(inherited.page);
      await expectPixels(inherited.page,0,initial==='Restyle');
      assert.equal((await snapshot(inherited.page)).graphics.mode, initial);
      await inherited.page.close();
    }
  } catch (error) { errors.push(error.stack ?? String(error)); }
  finally { for (const page of pages) if (!page.isClosed()) await page.close(); }
  return { id: 'cok-title-restyle', label: 'CoK title exact source, three compositions, mode/state preservation and optional-art failure',
    rendered, min: 3, bad: [], errors, pass: rendered===3 && errors.length===0 };
}
